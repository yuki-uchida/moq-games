import { expect, test, type Page } from '@playwright/test'
import { cameraSettled, enterBattle } from './shell-helper'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    setInterval(
      () => document.querySelector<HTMLButtonElement>('.story-overlay button, .story-credits button')?.click(),
      100
    )
  })
})

const cell = (page: Page, x: number, y: number) => page.getByRole('button', { name: new RegExp(`^${x},${y} `) })

async function start(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport)
  await enterBattle(page, './?seed=7')
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await cameraSettled(page)
}

/** The enemy farthest from 2,4 and an empty, passable square far from it (1-based, as in the cell labels). */
async function farTargets(page: Page) {
  return page.evaluate(() => {
    const game = (
      document.querySelector('.stage') as HTMLCanvasElement & {
        stage: { last: { game: import('../src/game').Game } }
      }
    ).stage.last.game
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
    const origin = { x: 1, y: 3 }
    const enemy = game.units
      .filter((u) => u.side === 'enemy' && u.hp > 0)
      .sort((a, b) => dist(b, origin) - dist(a, origin))[0]
    let empty = { x: 0, y: 0 }
    let best = -1
    for (let x = 0; x < 10; x++)
      for (let y = 0; y < 8; y++) {
        if (game.rocks.has(`${x},${y}`) || game.units.some((u) => u.hp > 0 && u.x === x && u.y === y)) continue
        const d = dist({ x, y }, origin)
        const el = [...document.querySelectorAll<HTMLElement>('.cell')].find((c) =>
          c.getAttribute('aria-label')?.startsWith(`${x + 1},${y + 1} `)
        )
        const r = el?.getBoundingClientRect()
        const hit = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        if (d > best && d > 4 && el && hit && el.contains(hit)) {
          best = d
          empty = { x, y }
        }
      }
    return { enemy: { x: enemy.x + 1, y: enemy.y + 1 }, empty: { x: empty.x + 1, y: empty.y + 1 } }
  })
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 844, height: 390 }
]) {
  test(`toast, enemy inspection and deselect at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await start(page, viewport)
    const { enemy, empty } = await farTargets(page)
    await cell(page, 2, 4).click()
    await cell(page, enemy.x, enemy.y).click()
    await expect(page.locator('#toast')).toBeVisible()
    await expect(page.locator('#toast')).toContainText('射程外')
    await page.screenshot({ path: info.outputPath('toast.png') })
    await expect(page.locator('#selection')).not.toBeEmpty()
    await expect(page.locator('.cell.enemy-move').first()).toBeAttached()
    await cell(page, 2, 4).click()
    await expect(page.locator('.cell.legal').first()).toBeAttached()
    await cell(page, empty.x, empty.y).click()
    await expect(page.locator('#toast')).toContainText('選択を解除')
    await expect(page.locator('.cell.legal')).toHaveCount(0)
  })
}

test('an ally that moved and was deselected can still undo (390x844)', async ({ page }, info) => {
  await start(page, { width: 390, height: 844 })
  const { enemy } = await farTargets(page)
  await cell(page, 2, 4).click()
  await cell(page, 4, 4).click()
  await expect(page.locator('#undo')).toBeEnabled()
  await cell(page, enemy.x, enemy.y).click()
  await expect(page.locator('#toast')).toBeVisible()
  await page.screenshot({ path: info.outputPath('inspected-enemy.png') })
  await cell(page, 4, 4).click()
  await expect(page.locator('#undo')).toBeEnabled()
})

test('floating forecast keeps the target visible (568x320)', async ({ page }, info) => {
  await start(page, { width: 568, height: 320 })
  await cell(page, 2, 4).click()
  await cell(page, 4, 4).click()
  await expect(page.locator('#undo')).toBeEnabled()
  await cell(page, 7, 4).click()
  await expect(page.locator('#confirm')).toBeInViewport()
  const card = (await page.locator('#forecast').boundingBox())!
  const box = (await cell(page, 7, 4).boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(card.y + 1)
  expect(box.y).toBeGreaterThanOrEqual(0)
  await page.screenshot({ path: info.outputPath('forecast.png') })
})

test('the potion button keeps its name in landscape (844x390)', async ({ page }) => {
  await start(page, { width: 844, height: 390 })
  await expect(page.locator('#recover')).toContainText('薬')
})
