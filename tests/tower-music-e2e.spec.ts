import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { getField } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { towerPath, openOfflineCampaign, dragUnitToWorld } from './tower-defense-e2e-arrange'

const diagnostics = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        towerDefenseMusicDiagnostics(): {
          active: boolean
          enabled: boolean
          playing: boolean
          volume: number
          status: string
        }
      }
    ).towerDefenseMusicDiagnostics()
  )

test('streams the original battle music only in assaults and preserves mute across title/continue', async ({
  page,
  request
}) => {
  const response = await request.get('/moq-games/tower-defense-music/monster-assault.mp3')
  expect(response.ok()).toBe(true)
  expect(
    createHash('sha256')
      .update(await response.body())
      .digest('hex')
  ).toBe('e51cc0e6d55e40c70d4c6081f870c652056a1573e4bfe4d1cbfb99fcd4c358fe')
  const bossResponse = await request.get('/moq-games/tower-defense-music/final-boss.mp3')
  expect(bossResponse.ok()).toBe(true)
  expect(
    createHash('sha256')
      .update(await bossResponse.body())
      .digest('hex')
  ).toBe('e7ff453f851007cf053db9cb3cee5d4e0a5baca42bd2bd1ffba04100ebcbe8fa')
  const alternateResponse = await request.get('/moq-games/tower-defense-music/monster-assault-2.mp3')
  expect(alternateResponse.ok()).toBe(true)
  expect(
    createHash('sha256')
      .update(await alternateResponse.body())
      .digest('hex')
  ).toBe('4dbad1d5f22bbc273776480acbe9202443d21e07ed0dcd05771952f866b9900a')
  await openOfflineCampaign(page)
  await dragUnitToWorld(page, 'soldier', getField('meadow', 2, 4).slots[0])
  expect(await diagnostics(page)).toMatchObject({ active: false, playing: false, volume: 0.2 * 0.8 })
  await page.locator('#assault').click()
  await expect.poll(async () => (await diagnostics(page)).status).toBe('襲撃のBGMを再生中')
  const selection = ((await diagnostics(page)) as unknown as { selection: number }).selection
  await page.locator('#settings-toggle').click()
  await page.locator('#music-enabled').uncheck()
  expect(await diagnostics(page)).toMatchObject({ active: true, enabled: false, playing: false })
  await page.locator('#music-volume').fill('35')
  await page.locator('#settings-close').click()
  await page.locator('#game-title-return').click()
  await expect(page.locator('#title-screen')).toBeVisible()
  expect(await diagnostics(page)).toMatchObject({ active: false, enabled: false, playing: false, volume: 0.35 * 0.8 })
  await page.reload()
  await page.locator('#title-continue').click()
  await expect.poll(async () => (await diagnostics(page)).active).toBe(true)
  expect(await diagnostics(page)).toMatchObject({ enabled: false, playing: false, selection })
  await page.locator('#settings-toggle').click()
  await page.locator('#music-enabled').check()
  await expect.poll(async () => (await diagnostics(page)).status).toBe('襲撃のBGMを再生中')
  await page.locator('#music-volume').fill('100')
  expect(await diagnostics(page)).toMatchObject({ volume: 0.8 })
  await page.locator('#settings-close').click()
  await expect(page.locator('#result')).toBeVisible({ timeout: 150000 })
  await expect.poll(async () => (await diagnostics(page)).playing).toBe(false)
  await expect.poll(async () => (await diagnostics(page)).active).toBe(false)
  await page.goto(towerPath.replace('index.html', 'extra.html'))
  expect(await page.evaluate(() => 'towerDefenseMusicDiagnostics' in window)).toBe(false)
})
