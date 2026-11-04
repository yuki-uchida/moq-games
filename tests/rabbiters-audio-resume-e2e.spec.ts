import { expect, test } from '@playwright/test'

test('wakes game audio on return and interaction only while sound is enabled', async ({ page }) => {
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.audioWakeProbe = { music: 0, effects: 0, reset() { this.music = this.effects = 0; } };
const startMusic = audio.start.bind(audio);
audio.start = () => { window.audioWakeProbe.music++; startMusic(); };
const startEffects = feel.start.bind(feel);
feel.start = () => { window.audioWakeProbe.effects++; startEffects(); };`
    })
  })
  await page.goto('/')
  await page.locator('#solo').click()
  await expect(page.locator('#leave')).toBeVisible()
  const reset = () => page.evaluate('window.audioWakeProbe.reset()')
  const counts = () =>
    page.evaluate<{ music: number; effects: number }>(
      '({ music: window.audioWakeProbe.music, effects: window.audioWakeProbe.effects })'
    )
  await reset()
  await page.keyboard.press('w')
  expect(await counts()).toMatchObject({ music: 1, effects: 1 })
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(await counts()).toMatchObject({ music: 2, effects: 2 })
  await page.evaluate(() => document.dispatchEvent(new Event('pointerdown')))
  expect(await counts()).toMatchObject({ music: 3, effects: 3 })
  await page.locator('#sound-toggle').click()
  await reset()
  await page.keyboard.press('w')
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.evaluate(() => document.dispatchEvent(new Event('pointerdown')))
  expect(await counts()).toMatchObject({ music: 0, effects: 0 })
})
