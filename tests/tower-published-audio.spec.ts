import { expect, test } from '@playwright/test'
import { openOfflineCampaign, towerPath, dragUnitToWorld } from './tower-defense-e2e-arrange'
import { getField } from '../examples/games/tower_diffence_with_jev/src/game/model'

const audio = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).towerDefenseAudioDiagnostics())

test('published effects unlock, retry, play combat and retain mute and volume preferences', async ({ page }) => {
  const requests: string[] = []
  const errors: string[] = []
  let soldierRequests = 0
  page.on('request', (request) => {
    if (request.url().endsWith('.wav')) requests.push(request.url())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/tower-defense-sfx/soldier_attack.wav', async (route) => {
    soldierRequests++
    if (soldierRequests === 1) await route.fulfill({ status: 503, body: 'test unavailable' })
    else await route.continue()
  })
  await page.goto(towerPath)
  await expect.poll(() => audio(page).then((state) => state.state)).toBe('locked')
  expect(requests).toEqual([])
  await openOfflineCampaign(page)
  await expect.poll(() => audio(page).then((state) => state.ready)).toBe(20)
  await expect.poll(() => audio(page).then((state) => state.failed)).toBe(1)
  await page.locator('#settings-toggle').click()
  await page.locator('#sound-retry').click()
  await expect.poll(() => audio(page).then((state) => state.state)).toBe('ready')
  expect((await audio(page)).ready).toBe(21)
  expect(new Set(requests).size).toBe(21)
  expect(soldierRequests).toBe(2)
  expect((await audio(page)).played).toBe(0)
  await page.locator('#settings-close').click()
  await dragUnitToWorld(page, 'soldier', getField('meadow', 2).slots[0])
  await page.locator('#assault').click()
  await expect.poll(() => audio(page).then((state) => state.played), { timeout: 30000 }).toBeGreaterThan(0)
  await page.locator('#settings-toggle').click()
  await page.locator('#sound-enabled').uncheck()
  const muted = await audio(page)
  expect(muted.activeVoices).toBe(0)
  await page.locator('#sound-volume').focus()
  await page.keyboard.press('Home')
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight')
  expect((await audio(page)).volume).toBe(0.35)
  expect((await audio(page)).played).toBe(muted.played)
  await page.goto(towerPath)
  await page.locator('#title-new').click()
  await page.locator('#launch-settings').click()
  await expect(page.locator('#sound-enabled')).not.toBeChecked()
  await expect(page.locator('#sound-volume')).toHaveValue('35')
  expect((await audio(page)).played).toBe(0)
  await page.locator('#sound-enabled').check()
  await expect.poll(() => audio(page).then((state) => state.state)).toBe('ready')
  expect((await audio(page)).played).toBe(0)
  expect(errors).toEqual([])
})
