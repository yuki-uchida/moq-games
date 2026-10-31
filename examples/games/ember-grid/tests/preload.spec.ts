import { test, expect } from '@playwright/test'

test('cold preparation, retry and retained mission assets', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  let fail = true
  const art: string[] = []
  await page.route('**/tower-defense-art/**', async (route) => {
    art.push(route.request().url())
    if (fail && route.request().url().endsWith('leaf-squire-walk-e.json')) {
      await route.fulfill({ status: 503, body: 'temporary failure' })
    } else await route.continue()
  })
  await page.goto('./')
  await expect(page.locator('.preparation button')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('.cell').first()).toBeDisabled()
  const completed = art.length
  fail = false
  await page.locator('.preparation button').click()
  await expect(page.locator('.preparation')).toHaveCount(0)
  // Retry only the rejected manifest and its not-yet-requested unique walk image.
  expect(art.length - completed).toBeLessThanOrEqual(2)
  const prepared = art.length
  await page.getByRole('button', { name: /1,4 燈守/ }).click()
  await page.getByRole('button', { name: /3,4 平地 移動可能/ }).click()
  await expect(page.getByRole('button', { name: /3,4 燈守/ })).toBeVisible()
  await page.getByRole('button', { name: '再プレイ', exact: true }).click()
  await page.getByRole('button', { name: '任務と編成' }).click()
  await page.locator('[data-stage="2"]').click()
  expect(art.length).toBe(prepared)
})

for (const cacheDisabled of [true, false])
  test(`all prepared directions render without transfers, cache disabled=${cacheDisabled}`, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('./')
    await expect(page.locator('.preparation')).toHaveCount(0, { timeout: 30000 })
    const result = await page.evaluate(async () => {
      // Run actual renderer clocks for every role/motion/direction at native cell size.
      const { BattleAnimation } = await import(/* @vite-ignore */ './src/animation.ts')
      const animation = new BattleAnimation(document.querySelector<HTMLElement>('#board')!, () => {})
      await animation.prepare(() => {})
      const start = performance.now()
      const node = document.createElement('span')
      node.className = 'motion-actor'
      node.style.left = '300px'
      node.style.top = '240px'
      node.innerHTML = '<span class="portrait"></span>'
      document.querySelector('.field')!.append(node)
      const samples: { role: string; motion: string; direction: string; elapsed: number }[] = []
      for (let repeat = 0; repeat < 2; repeat++)
        for (const role of ['soldier', 'archer', 'mage', 'goblin', 'wolf'])
          for (const motion of ['idle', 'walk', 'attack'])
            for (const direction of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
              const clip = await (animation as any).clip(role, motion, direction)
              const before = performance.now()
              // Private TS method is accessed only by this browser verification harness.
              // Stop before the first RAF: switching a sheet must replace stale coordinates now.
              node.querySelector<HTMLElement>('.portrait')!.style.backgroundPosition = '-896px -560px'
              const raf = window.requestAnimationFrame
              const callbacks: FrameRequestCallback[] = []
              window.requestAnimationFrame = (callback) => {
                callbacks.push(callback)
                return callbacks.length
              }
              const playing = (animation as any).play(node, { role }, motion, direction, 0)
              await new Promise((resolve) => setTimeout(resolve, 0))
              const position = node.querySelector<HTMLElement>('.portrait')!.style.backgroundPosition
              window.requestAnimationFrame = raf
              callbacks.forEach((callback) => raf(callback))
              await playing
              const [x, y] = position.split(' ').map(Number.parseFloat)
              if (x !== -clip.frames[0].x || y !== -clip.frames[0].y)
                throw new Error(`Stale first frame: ${role}/${motion}/${direction}: ${position}`)
              samples.push({ role, motion, direction, elapsed: performance.now() - before })
            }
      node.remove()
      return {
        samples,
        requests: performance
          .getEntriesByType('resource')
          .filter((r) => r.startTime >= start && /tower-defense-(art|sfx)/.test(r.name)).length
      }
    })
    expect(result.samples).toHaveLength(240)
    expect(result.requests).toBe(0)
    expect(Math.max(...result.samples.map((s) => s.elapsed))).toBeLessThan(300)
    console.log(
      JSON.stringify({
        cacheDisabled,
        maxClipMs: Math.max(...result.samples.map((s) => s.elapsed)),
        actionRequests: result.requests
      })
    )
  })

test('cold and replayed attacks retain visible actors at 100 ms RTT', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 100,
    downloadThroughput: 5 * 1024 * 1024,
    uploadThroughput: 1024 * 1024
  })
  await page.goto('./')
  await expect(page.locator('.preparation')).toHaveCount(0, { timeout: 30000 })
  const requests: string[] = []
  page.on('request', (request) => {
    if (/tower-defense-(art|sfx)/.test(request.url())) requests.push(request.url())
  })
  for (let repeat = 0; repeat < 2; repeat++) {
    if (repeat) await page.getByRole('button', { name: '再プレイ', exact: true }).click()
    await page.getByRole('button', { name: /1,3 風読み/ }).click()
    await page.getByRole('button', { name: /3,3 平地 移動可能/ }).click()
    await expect(page.getByRole('button', { name: /3,3 風読み/ })).toBeEnabled()
    const samples = await page.evaluate(async () => {
      const started = performance.now()
      const samples: { time: number; empty: number }[] = []
      return await new Promise<typeof samples>((resolve) => {
        const frame = () => {
          const actors = [...document.querySelectorAll<HTMLElement>('.motion-actor .portrait')]
          samples.push({
            time: performance.now() - started,
            empty: actors.filter((p) => !p.style.backgroundImage).length
          })
          if (performance.now() - started < 1400) requestAnimationFrame(frame)
          else resolve(samples)
        }
        requestAnimationFrame(frame)
        document.querySelectorAll<HTMLButtonElement>('.cell')[2 * 7 + 5].click()
      })
    })
    expect(samples.filter((s) => s.empty > 0)).toEqual([])
    await expect(page.locator('.motion-actor')).toHaveCount(0)
  }
  expect(requests).toEqual([])
})
