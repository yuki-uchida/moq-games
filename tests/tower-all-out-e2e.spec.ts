import { expect, test, type Page } from '@playwright/test'
import { ALLY_TYPES } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { towerPath } from './tower-defense-e2e-arrange'

const shot = (page: Page, name: string) => page.screenshot({ path: `/tmp/ck-evidence/wp-k/${name}.png` })
const FORMATION = ['soldier', 'archer', 'runner', 'tank', 'mage']

async function open(page: Page) {
  await page.goto(towerPath)
  await page.evaluate(
    ([all, formation]) =>
      localStorage.setItem(
        'tower-jev-stages-v1',
        JSON.stringify({ version: 1, coins: 0, cleared: 9, recruited: all, formation, stars: [] })
      ),
    [ALLY_TYPES, FORMATION]
  )
  await page.reload()
  await page.locator('#title-new').click()
  await expect(page.locator('#launch')).toBeVisible()
}

async function start(page: Page) {
  await page.locator('#start').click()
  await expect(page.locator('#launch')).toBeHidden({ timeout: 180_000 })
  await page.locator('#deck-toggle').click()
  await expect(page.locator('#unit-tray')).toBeVisible()
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 }
])
  test.describe(`${size.width}px`, () => {
    test.use({ viewport: size })

    test('stage 10 fields every owned ally', async ({ page }) => {
      await open(page)
      await page.locator('[data-stage="10"]').click()
      await expect(page.locator('#formation-count')).toContainText('総力戦')
      await expect(page.locator('[data-ally][data-state="formation"]')).toHaveCount(ALLY_TYPES.length)
      await shot(page, `stage10-select-${size.width}`)
      await start(page)
      await expect(page.locator('#unit-tray .unit:not([hidden])')).toHaveCount(ALLY_TYPES.length)
      await shot(page, `stage10-tray-${size.width}`)
    })

    test('stage 8 keeps the chosen five', async ({ page }) => {
      await open(page)
      await page.locator('[data-stage="8"]').click()
      await expect(page.locator('#formation-count')).toHaveText('5 / 5')
      await start(page)
      await expect(page.locator('#unit-tray .unit:not([hidden])')).toHaveCount(FORMATION.length)
    })
  })
