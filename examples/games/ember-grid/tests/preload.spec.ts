import { test, expect } from '@playwright/test'
import { enterBattle } from './shell-helper'
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    setInterval(
      () => document.querySelector<HTMLButtonElement>('.story-overlay button, .story-credits button')?.click(),
      100
    )
  })
})

test('cold preparation, retry and retained mission assets', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  let fail = true
  const art: string[] = []
  await page.route('**/tower-defense-art/**', async (route) => {
    art.push(route.request().url())
    if (fail && route.request().url().endsWith('goblin-walk-smooth.glb')) {
      await route.fulfill({ status: 503, body: 'temporary failure' })
    } else await route.continue()
  })
  await enterBattle(page, './', true)
  await expect(page.locator('.preparation button')).toBeVisible({ timeout: 60000 })
  await expect(page.locator('.cell').first()).toBeDisabled()
  // Only the five roles' models (and the archer's refined walk clip) are requested; no sprite sheets.
  expect(art.every((url) => /\/tower-defense-art\/(models|title)\//.test(url))).toBe(true)
  const completed = art.length
  fail = false
  await page.locator('.preparation button').click()
  await expect(page.locator('.preparation')).toHaveCount(0, { timeout: 60000 })
  // Retry only the rejected model.
  expect(art.length - completed).toBe(1)
  const prepared = art.length
  await page.getByRole('button', { name: /2,5 燈守/ }).click()
  await page.getByRole('button', { name: /4,5 平地 移動可能/ }).click()
  await expect(page.getByRole('button', { name: /4,5 燈守/ })).toBeVisible()
  await page.getByRole('button', { name: '再プレイ', exact: true }).click()
  await page.getByRole('button', { name: '任務と編成' }).click()
  await page.locator('[data-stage="2"]').click()
  await expect(page.getByRole('button', { name: /灰の射手/ })).toBeVisible()
  expect(art.slice(prepared).every((url) => /\/models\/(healer|slime|bat)\//.test(url))).toBe(true)
})

for (const cacheDisabled of [true, false])
  test(`every role, motion and direction samples a real mesh without transfers, cache disabled=${cacheDisabled}`, async ({
    page
  }) => {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await enterBattle(page)
    await expect(page.locator('.preparation')).toHaveCount(0, { timeout: 60000 })
    const result = await page.evaluate(async () => {
      const stage = (document.querySelector('.stage') as HTMLCanvasElement & { stage?: import('../src/stage').Stage })
        .stage
      const start = performance.now()
      const samples: { role: string; motion: string; elapsed: number; visible: boolean; triangles: number }[] = []
      const directions = [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((y) => ({ x, y }))).filter((d) => d.x || d.y)
      for (const { id, role } of stage!.diagnostics())
        for (const motion of ['idle', 'walk', 'attack'] as const)
          for (const facing of directions) {
            const actor = stage!.get(id)!
            const before = performance.now()
            actor.facing = facing
            const now = performance.now()
            actor.track =
              motion === 'walk'
                ? { motion, start: now - 100, ms: 220, from: actor.at, to: actor.at, cycle: 0 }
                : motion === 'attack'
                  ? { motion, start: now - 300, ms: 800, clipMs: 800 }
                  : undefined
            stage!.draw(true)
            const sample = stage!.diagnostics().find((a) => a.id === id)!
            samples.push({
              role,
              motion: sample.motion ?? '',
              elapsed: performance.now() - before,
              visible: sample.visible,
              triangles: sample.triangles
            })
          }
      stage!.release()
      return {
        samples,
        requests: performance
          .getEntriesByType('resource')
          .filter((r) => r.startTime >= start && /tower-defense-(art|sfx)/.test(r.name)).length
      }
    })
    expect(new Set(result.samples.map((s) => s.role))).toEqual(new Set(['soldier', 'archer', 'mage', 'goblin', 'wolf']))
    expect(result.samples).toHaveLength(6 * 3 * 8)
    for (const s of result.samples) {
      expect(s.visible).toBe(true)
      expect(s.triangles).toBeGreaterThan(1000)
    }
    expect(result.samples.map((s) => s.motion)).toEqual(
      result.samples.map((_, i) => ['idle', 'walk', 'attack'][Math.floor(i / 8) % 3])
    )
    expect(result.requests).toBe(0)
    expect(Math.max(...result.samples.map((s) => s.elapsed))).toBeLessThan(300)
    console.log(
      JSON.stringify({
        cacheDisabled,
        maxSampleMs: Math.max(...result.samples.map((s) => s.elapsed)),
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
  await enterBattle(page)
  await expect(page.locator('.preparation')).toHaveCount(0, { timeout: 90000 })
  const requests: string[] = []
  page.on('request', (request) => {
    if (/tower-defense-(art|sfx)/.test(request.url())) requests.push(request.url())
  })
  for (let repeat = 0; repeat < 2; repeat++) {
    if (repeat) await page.getByRole('button', { name: '再プレイ', exact: true }).click()
    await page.getByRole('button', { name: /2,4 風読み/ }).click()
    await page.getByRole('button', { name: /4,4 平地 移動可能/ }).click()
    await expect(page.getByRole('button', { name: /4,4 風読み/ })).toBeEnabled()
    const samples = await page.evaluate(async () => {
      const stage = (document.querySelector('.stage') as HTMLCanvasElement & { stage?: import('../src/stage').Stage })
        .stage
      const started = performance.now()
      const samples: { time: number; active: number; hidden: number }[] = []
      return await new Promise<typeof samples>((resolve) => {
        const frame = () => {
          const active = stage!.diagnostics().filter((a) => a.track !== 'idle')
          samples.push({
            time: performance.now() - started,
            active: active.length,
            hidden: active.filter((a) => !a.visible || !a.triangles).length
          })
          if (performance.now() - started < 1400) requestAnimationFrame(frame)
          else resolve(samples)
        }
        requestAnimationFrame(frame)
        document.querySelector<HTMLButtonElement>('.cell[aria-label^="7,4 灰牙"]')!.click()
        document.querySelector<HTMLButtonElement>('#confirm')!.click()
      })
    })
    expect(samples.some((s) => s.active === 2)).toBe(true)
    expect(samples.filter((s) => s.hidden > 0)).toEqual([])
    await expect(page.locator('.stage')).toHaveAttribute('data-motion', '')
  }
  expect(requests).toEqual([])
})
