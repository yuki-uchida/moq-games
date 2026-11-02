import { expect, test, type Page } from '@playwright/test'
import { GameEngine } from '../examples/games/tower_diffence_with_jev/src/game/GameEngine'
import { getField } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { freshSave } from '../examples/games/tower_diffence_with_jev/src/progression/UpgradeSystem'
import { towerPath } from './tower-defense-e2e-arrange'

// Seeds a campaign already in the assault of stage 2, optionally some simulated seconds in.
async function seed(page: Page, seconds = 0) {
  const save = freshSave()
  save.economyVersion = 2
  save.gold = 120
  const engine = new GameEngine({ decide: async () => null }, save, 'meadow', 42, () => 0, undefined, 2, 4)
  engine.startAtStage(2)
  const point = getField('meadow', 2, 4).slots.find((p) => engine.previewPlacement('soldier', p).valid)
  expect(engine.place('soldier', point!)).toBe(true)
  expect(engine.startAssault()).toBe(true)
  for (let i = 0; i <= seconds * 60; i++) engine.update(1 / 60)
  const checkpoint = engine.exportCheckpoint()!
  const raw = JSON.stringify({
    version: 3,
    profile: checkpoint.profile,
    run: { version: 1, progress: checkpoint.progress, engine: checkpoint }
  })
  await page.goto(towerPath)
  await page.evaluate((raw) => localStorage.setItem('tower-jev-v3', raw), raw)
  await page.reload()
  await page.locator('#title-continue').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'assault')
  // The engine holds the clock until every special effect is prepared (slow on a software GPU).
  await expect
    .poll(() => page.evaluate(() => (window as any).towerDefenseDiagnostics().specialAbilities.loaded), {
      timeout: 120_000
    })
    .toBe(10)
}
// Simulation seconds gained in one real second, measured inside the page. The time attribute is
// written when a frame renders, so start and end on freshly rendered frames: on a slow software GPU
// the value read right after a click can predate the last steps before the pause.
const advance = (page: Page) =>
  page.evaluate(async () => {
    const app = document.getElementById('app')!,
      rendered = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await rendered()
    const before = Number(app.dataset.simulationTime)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await rendered()
    return Number(app.dataset.simulationTime) - before
  })

test('pause stops the simulation, resume and P restore it, focus returns to the button', async ({ page }) => {
  await seed(page)
  const pause = page.locator('.bhud-pause'),
    dialog = page.locator('#pause-dialog')
  const box = (await pause.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
  await expect(pause).toHaveAttribute('aria-label', '一時停止')
  await expect.poll(() => advance(page), { timeout: 60_000 }).toBeGreaterThan(0.3)
  await pause.click()
  await expect(dialog).toBeVisible()
  await expect(page.locator('#pause-resume')).toBeFocused()
  expect(await advance(page)).toBe(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(pause).toBeFocused()
  await expect.poll(() => advance(page), { timeout: 60_000 }).toBeGreaterThan(0.3)
  await page.keyboard.press('p')
  await expect(dialog).toBeVisible()
  expect(await advance(page)).toBe(0)
  await page.locator('#pause-resume').click()
  await expect(dialog).toBeHidden()
  await expect.poll(() => advance(page), { timeout: 60_000 }).toBeGreaterThan(0.3)
  await page.keyboard.press('p')
  await page.keyboard.press('p')
  await expect(dialog).toBeHidden()
})

test('もう一度 restarts the same stage in preparation without confirming an early battle', async ({ page }) => {
  await seed(page)
  await page.locator('.bhud-pause').click()
  await page.locator('#pause-restart').click()
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'preparation', { timeout: 180_000 })
  await expect(page.locator('#stage')).toHaveText('02')
  await expect(page.locator('#pause-dialog')).toBeHidden()
  await expect(page.locator('.bhud-pause')).toBeHidden()
})

test('a progressed battle asks once before it is thrown away', async ({ page }) => {
  await seed(page, 8)
  await page.locator('.bhud-pause').click()
  await page.locator('#pause-exit').click()
  await expect(page.locator('#pause-confirm')).toBeVisible()
  await expect(page.locator('#pause-confirm')).toContainText('進行状況は失われます')
  await page.locator('#pause-confirm-cancel').click()
  await expect(page.locator('#pause-resume')).toBeFocused()
  await page.locator('#pause-exit').click()
  await page.locator('#pause-confirm-accept').click()
  await expect(page.locator('#launch')).toBeVisible()
  await expect(page.locator('#pause-dialog')).toBeHidden()
})

test('stage select lists the three star goals with the earned ones marked', async ({ page }) => {
  await page.goto(towerPath)
  await page.evaluate(() =>
    localStorage.setItem(
      'tower-jev-stages-v1',
      JSON.stringify({
        version: 1,
        coins: 0,
        cleared: 2,
        recruited: [],
        formation: ['soldier', 'archer'],
        stars: [3, 2, 0]
      })
    )
  )
  await page.reload()
  await page.locator('#title-new').click()
  const items = page.locator('#stage-goals li')
  await expect(items).toHaveCount(3)
  await page.locator('[data-stage="1"]').click()
  await expect(items.first()).toBeVisible()
  await expect(items.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.got))).resolves.toEqual([
    'true',
    'true',
    'true'
  ])
  await page.locator('[data-stage="2"]').click()
  await expect(items.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.got))).resolves.toEqual([
    'true',
    'true',
    'false'
  ])
  await expect(items.nth(2)).toContainText('拠点ノーダメージ')
  await expect(items.nth(1)).toContainText('✓')
  await expect(items.nth(2)).not.toContainText('✓')
  await page.locator('[data-stage="3"]').click()
  await page.locator('#start').click()
  await expect(page.locator('#launch')).toBeHidden({ timeout: 180_000 })
  await expect(page.locator('#stage-goal')).toHaveText('目標 ★ クリア')
})
