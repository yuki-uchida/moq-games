import { test, expect, type Page } from '@playwright/test'
/** Units still in a presentation track on the 3D stage (idle units are excluded). */
const tracks = (page: Page) =>
  page.evaluate(async () => {
    const stage = (document.querySelector('.stage') as HTMLCanvasElement & { stage?: import('../src/stage').Stage })
      .stage
    return stage!.diagnostics().filter((a) => a.track !== 'idle')
  })
test.use({ video: { mode: 'on', size: { width: 1280, height: 900 } } })
for (const width of [1280, 390])
  test(`arrow release, travel, impact and audio ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    const warnings: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'warning') warnings.push(m.text())
    })
    await page.goto('./')
    const music = page.locator('audio[data-ember-music]')
    await expect(music).toHaveJSProperty('paused', true)
    expect(await music.evaluate((a: HTMLAudioElement) => a.currentTime)).toBe(0)
    await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true')
    // Default-on music starts with the first gesture (autoplay policy).
    await page.getByRole('button', { name: /1,3 風読み/ }).tap()
    await expect.poll(() => music.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0.1)
    await page.getByRole('button', { name: /3,3 平地 移動可能/ }).tap()
    await expect(page.getByRole('button', { name: /3,3 風読み/ })).toBeEnabled()
    await page.evaluate(() => {
      const samples: { time: number; arrow: boolean; damage: boolean }[] = []
      ;(window as unknown as { presentationSamples: typeof samples }).presentationSamples = samples
      const start = performance.now()
      const sample = () => {
        samples.push({
          time: performance.now() - start,
          arrow: !!document.querySelector('.stage[data-projectile~="arrow"]'),
          damage: !!document.querySelector('.damage-number')
        })
        if (performance.now() - start < 1800) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await Promise.all([
      page.waitForFunction(() => !!document.querySelector('.stage[data-projectile~="arrow"]'), undefined, {
        polling: 'raf'
      }),
      page.getByRole('button', { name: /6,3 灰牙/ }).tap()
    ])
    await page.screenshot({ path: `test-results/ember-arrow-${width}.png` })
    await expect(page.locator('.damage-number')).toHaveText('−8')
    await expect(page.getByRole('button', { name: /6,3 灰牙 HP 2/ })).toBeVisible()
    const samples = await page.evaluate(
      () =>
        (window as unknown as { presentationSamples: { time: number; arrow: boolean; damage: boolean }[] })
          .presentationSamples
    )
    const arrow = samples.find((s) => s.arrow),
      impact = samples.find((s) => s.damage)
    expect(arrow).toBeTruthy()
    expect(impact).toBeTruthy()
    expect(impact!.time - arrow!.time).toBeGreaterThan(100)
    const voices = page.locator('audio[data-ember-voice]')
    await page.locator('#sound').tap()
    await expect(music).toHaveJSProperty('paused', true)
    await expect(voices).toHaveCount(0)
    await page.locator('#end').tap()
    await expect(page.locator('#turn')).toContainText('味方 · 2', { timeout: 15000 })
    await expect(voices).toHaveCount(0)
    await page
      .getByRole('button', { name: /風読み/ })
      .first()
      .tap()
    await page.getByRole('button', { name: /灰牙 HP 2/ }).tap()
    await page.waitForFunction(() => !!document.querySelector('.stage[data-motion~="death"]'), undefined, {
      polling: 'raf'
    })
    await page.screenshot({ path: `test-results/ember-death-${width}.png` })
    await expect(page.locator('.stage')).toHaveAttribute('data-motion', '')
    await expect(page.locator('.fx')).toHaveCount(0)
    expect(warnings).toEqual([])
  })

test('autoplay failure recovery, audio decoding and waveform', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => {
    const music = document.querySelector<HTMLAudioElement>('audio')!
    const play = music.play.bind(music)
    music.play = () => {
      music.play = play
      return Promise.reject(new DOMException('Blocked for autoplay test', 'NotAllowedError'))
    }
  })
  await page.locator('#count').click()
  await expect(page.locator('#log')).toContainText('音を再生できません')
  await page.locator('#sound').click()
  await page.locator('#sound').click()
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0)
  const decoded = await page.evaluate(async () => {
    const context = new AudioContext()
    const result = []
    for (const file of [
      'tower-defense-music/monster-assault.mp3',
      ...['soldier', 'archer', 'mage', 'goblin', 'wolf', 'healer'].map((r) => `tower-defense-sfx/${r}_attack.wav`)
    ]) {
      const response = await fetch(`/moq-games/${file}`)
      const buffer = await context.decodeAudioData(await response.arrayBuffer())
      const data = buffer.getChannelData(0)
      let energy = 0,
        peak = 0
      for (let i = 0; i < data.length; i++) {
        energy += data[i] * data[i]
        peak = Math.max(peak, Math.abs(data[i]))
      }
      result.push({ file, duration: buffer.duration, rms: Math.sqrt(energy / data.length), peak })
    }
    await context.close()
    return result
  })
  for (const sample of decoded) {
    expect(sample.duration).toBeGreaterThan(0.1)
    expect(sample.rms).toBeGreaterThan(0.001)
  }
  console.log(JSON.stringify({ audioDecode: decoded }))
  // Synthetic visibility: music keeps playing while hidden (not an OS background assertion).
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(300)
  await expect(page.locator('audio')).toHaveJSProperty('paused', false)
  // Reload: still on, but silent until a gesture; a mute choice persists.
  await page.reload()
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await page.locator('#sound').click()
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await page.reload()
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false')
  await page.locator('#count').click()
  await page.waitForTimeout(300)
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
})

test('hidden tab keeps player and enemy turns advancing without animation frames', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.preparation')).toHaveCount(0, { timeout: 30000 })
  // Emulate a background tab: hidden, and rAF/Web Animations never progress.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    window.requestAnimationFrame = () => 0
    Element.prototype.animate = function () {
      return { finished: new Promise(() => {}) } as unknown as Animation
    }
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.getByRole('button', { name: /1,3 風読み/ }).click()
  await page.getByRole('button', { name: /3,3 平地 移動可能/ }).click()
  await page.getByRole('button', { name: /6,3 灰牙/ }).click()
  await expect(page.getByRole('button', { name: /6,3 灰牙 HP 2/ })).toBeVisible()
  await page.locator('#end').click()
  await expect(page.locator('#turn')).toContainText('味方 · 2', { timeout: 5000 })
  await expect(page.locator('.fx')).toHaveCount(0)
  expect(await tracks(page)).toEqual([])
})

test('restart cancels player motion and reduced motion keeps controls usable', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /1,4 燈守/ }).click()
  await page.getByRole('button', { name: /3,4 平地 移動可能/ }).click()
  await page.locator('#restart').click()
  await page.waitForTimeout(1000)
  await expect(page.getByRole('button', { name: /1,4 燈守リオ HP 16/ })).toBeEnabled()
  expect(await tracks(page)).toEqual([])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: /1,4 燈守/ }).click()
  await page.getByRole('button', { name: /3,4 平地 移動可能/ }).click()
  await expect(page.getByRole('button', { name: /3,4 燈守/ })).toBeEnabled()
  expect(await tracks(page)).toEqual([])
})

test('missing 3D model holds preparation and retries without stranding input', async ({ page }) => {
  let fail = true
  await page.route('**/tower-defense-art/models/wolf/wolf-walk-smooth.glb', (route) =>
    fail ? route.fulfill({ status: 404, body: 'missing' }) : route.continue()
  )
  await page.goto('./')
  await expect(page.locator('.preparation button')).toBeVisible()
  await expect(page.getByRole('button', { name: /1,4 燈守/ })).toBeDisabled()
  fail = false
  await page.locator('.preparation button').click()
  await expect(page.locator('.preparation')).toHaveCount(0)
  await page.getByRole('button', { name: /1,4 燈守/ }).click()
  await page.getByRole('button', { name: /3,4 平地 移動可能/ }).click()
  await expect(page.getByRole('button', { name: /3,4 燈守/ })).toBeEnabled()
  await expect(page.locator('#end')).toBeEnabled()
  expect(await tracks(page)).toEqual([])
})
