import { test, expect } from '@playwright/test'
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
    await page.locator('#sound').tap()
    await expect.poll(() => music.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0.1)
    await page.getByRole('button', { name: /1,3 風読み/ }).tap()
    await page.getByRole('button', { name: /3,3 平地 移動可能/ }).tap()
    await expect(page.getByRole('button', { name: /3,3 風読み/ })).toBeEnabled()
    await page.evaluate(() => {
      const samples: { time: number; arrow: boolean; damage: boolean }[] = []
      ;(window as unknown as { presentationSamples: typeof samples }).presentationSamples = samples
      const start = performance.now()
      const sample = () => {
        samples.push({
          time: performance.now() - start,
          arrow: !!document.querySelector('.projectile.arrow'),
          damage: !!document.querySelector('.damage-number')
        })
        if (performance.now() - start < 1800) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await Promise.all([
      page.waitForFunction(() => !!document.querySelector('.projectile.arrow'), undefined, { polling: 'raf' }),
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
    await page.waitForFunction(() => !!document.querySelector('.motion-death .portrait'), undefined, { polling: 'raf' })
    await page.screenshot({ path: `test-results/ember-death-${width}.png` })
    await expect(page.locator('.motion-actor')).toHaveCount(0)
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
  await page.locator('#sound').click()
  await expect(page.locator('#log')).toContainText('音を再生できません')
  await page.locator('#sound').click()
  await page.locator('#sound').click()
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
  // Exercise the exact visibility handler; this is synthetic visibility, not an OS background assertion.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => !a.paused)).toBe(true)
  await page.reload()
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
})

test('restart cancels player motion and reduced motion keeps controls usable', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /1,4 燈守/ }).click()
  await page.getByRole('button', { name: /3,4 平地 移動可能/ }).click()
  await page.locator('#restart').click()
  await page.waitForTimeout(1000)
  await expect(page.getByRole('button', { name: /1,4 燈守リオ HP 16/ })).toBeEnabled()
  await expect(page.locator('.motion-actor')).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: /1,4 燈守/ }).click()
  await page.getByRole('button', { name: /3,4 平地 移動可能/ }).click()
  await expect(page.getByRole('button', { name: /3,4 燈守/ })).toBeEnabled()
  await expect(page.locator('.motion-actor')).toHaveCount(0)
})

test('missing animation texture preserves legal result and unlocks input', async ({ page }) => {
  await page.route('**/tower-defense-art/soldier/*walk*.json', (route) =>
    route.fulfill({ status: 404, body: 'missing' })
  )
  await page.goto('./')
  await page.getByRole('button', { name: /1,4 燈守/ }).click()
  await page.getByRole('button', { name: /3,4 平地 移動可能/ }).click()
  await expect(page.getByRole('button', { name: /3,4 燈守/ })).toBeEnabled()
  await expect(page.locator('#end')).toBeEnabled()
  await expect(page.locator('.motion-actor')).toHaveCount(0)
})
