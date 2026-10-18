import { expect, test, type Page } from '@playwright/test'
import { GameEngine } from '../examples/games/tower_diffence_with_jev/src/game/GameEngine'
import { ALLY_TYPES, FIELDS, type AllyType } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { freshSave } from '../examples/games/tower_diffence_with_jev/src/progression/UpgradeSystem'
import { pointOnVisibleMap, towerPath } from './tower-defense-e2e-arrange'

test.use({ hasTouch: true })

async function seed(page: Page, type: AllyType = 'soldier', waitEffects = true) {
  const save = freshSave()
  if (!['soldier', 'archer', 'runner', 'tank'].includes(type)) save.purchased.push(type)
  const engine = new GameEngine({ decide: async () => null }, save, 'meadow', 42, () => 0)
  engine.place(type, FIELDS.meadow.slots[0].id)
  const bagPoint = engine.state.units[0]
  for (const point of FIELDS.meadow.path.slice(1, -1)) if (engine.placeSandbag(point).valid) break
  const unit = engine.state.units[0],
    checkpoint = engine.exportCheckpoint()!
  expect(checkpoint).not.toBeNull()
  const raw = JSON.stringify({
    version: 3,
    profile: checkpoint.profile,
    run: { version: 1, progress: checkpoint.progress, engine: checkpoint }
  })
  await page.goto(towerPath)
  await page.evaluate((raw) => localStorage.setItem('tower-jev-v3', raw), raw)
  await page.reload()
  await page.locator('#title-continue').click()
  if (!waitEffects) return { unit, bag: engine.state.sandbags[0], bagPoint }
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  await expect(page.locator('.defender-handle')).toBeVisible()
  await page.locator('#assault').click()
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'assault')
  if (waitEffects)
    await expect
      .poll(() => page.evaluate(() => (window as any).towerDefenseDiagnostics().specialAbilities.loaded))
      .toBe(10)
  return { unit, bag: engine.state.sandbags[0], bagPoint }
}
async function stored(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('tower-jev-v3')!).run.engine)
}
for (const mobile of [false, true])
  test(`special target, cancellation, cooldown and battle sandbag selection mobile=${mobile}`, async ({
    page
  }, info) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    const { unit, bag } = await seed(page)
    const handle = page.locator(`.defender-handle[data-unit-id="${unit.id}"]`)
    await pointOnVisibleMap(page, unit)
    if (mobile) await handle.tap()
    else await handle.click()
    await expect(page.locator('#unit-special')).toHaveText('×')
    await expect(page.locator('#unit-special')).toHaveAttribute('aria-label', '必殺技をキャンセル')
    await page.locator('#unit-special').focus()
    await page.keyboard.press('Enter')
    expect((await stored(page)).state.units[0].specialCooldown).toBeUndefined()
    if (mobile) await handle.tap()
    else await handle.click()
    const invalid = await pointOnVisibleMap(page, { x: unit.x + 250, y: unit.y + 100 })
    if (mobile) await page.touchscreen.tap(invalid.x, invalid.y)
    else await page.mouse.click(invalid.x, invalid.y)
    await expect(page.locator('#feedback')).toHaveText('指定できません')
    await expect(page.locator('#unit-special')).toBeVisible()
    await expect(page.locator('#unit-special')).toHaveAttribute('aria-label', '必殺技をキャンセル')
    expect((await stored(page)).state.units[0].specialCooldown).toBeUndefined()
    await page.keyboard.press('Escape')
    await pointOnVisibleMap(page, unit)
    if (!mobile) {
      const bounds = (await handle.boundingBox())!
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.down()
      await page.mouse.move(bounds.x + bounds.width / 2 + 12, bounds.y + bounds.height / 2, { steps: 4 })
      await page.mouse.up()
      expect((await stored(page)).state.units[0].specialCooldown).toBeUndefined()
    }
    expect((await stored(page)).state.units[0].specialCooldown).toBeUndefined()
    expect(bag).toBeDefined()
    if (mobile) await handle.tap()
    else await handle.click()
    await pointOnVisibleMap(page, bag)
    const bagHandle = page.locator(`[data-sandbag="${bag.id}"]`)
    if (mobile) await bagHandle.tap()
    else await bagHandle.click()
    await expect(page.locator('#unit-action-name')).toHaveText('土のう')
    await expect(page.locator('#unit-special')).toBeHidden()
    expect((await stored(page)).state.units[0].specialCooldown).toBeUndefined()
    await pointOnVisibleMap(page, unit)

    if (mobile) await handle.tap()
    else await handle.click()
    const target = await pointOnVisibleMap(page, { x: unit.x + 85, y: unit.y })
    await page.mouse.move(target.x, target.y)
    await page.screenshot({ path: info.outputPath(`special-preview-${mobile}.png`) })
    if (mobile) await page.touchscreen.tap(target.x, target.y)
    else await page.mouse.click(target.x, target.y)
    expect((await stored(page)).state.units[0].specialCooldown).toBeGreaterThan(59)
    await expect
      .poll(() => page.evaluate(() => (window as any).towerDefenseDiagnostics().specialAbilities.active))
      .toBe(1)
    await page.screenshot({ path: info.outputPath(`special-burst-${mobile}.png`) })
    await expect
      .poll(() => page.evaluate(() => (window as any).towerDefenseDiagnostics().specialAbilities.active))
      .toBe(0)
    if (mobile) await handle.tap()
    else await handle.click()
    await expect(page.locator('#unit-special')).toContainText(/\d/)
    if (bag) {
      await pointOnVisibleMap(page, bag)
      await page.locator(`[data-sandbag="${bag.id}"]`).click()
      await expect(page.locator('#unit-action-name')).toHaveText('土のう')
      await expect(page.locator('#sandbag-move')).toBeDisabled()
      await expect(page.locator('#sandbag-remove')).toBeDisabled()
      await expect(page.locator('#unit-special')).toBeHidden()
    }
  })

for (const type of ALLY_TYPES.filter((type) => type !== 'soldier'))
  test(`${type} plays its dedicated cast and authored field in the game`, async ({ page }, info) => {
    const { unit } = await seed(page, type)
    await pointOnVisibleMap(page, unit)
    await page.locator(`.defender-handle[data-unit-id="${unit.id}"]`).click()
    const target = await pointOnVisibleMap(page, { x: unit.x + 85, y: unit.y + 30 })
    await page.mouse.click(target.x, target.y)
    const cast = (await stored(page)).state
    expect(cast.units[0].specialCooldown).toBeGreaterThan(59)
    await expect(page.locator('.unit-health.player')).toHaveAttribute('data-rendered-motion', 'special')
    await expect
      .poll(() => page.evaluate(() => (window as any).towerDefenseDiagnostics().specialAbilities.active > 0))
      .toBe(true)
    await page.screenshot({ path: info.outputPath(`${type}-special-impact.png`) })
    await page.locator('#settings-toggle').click()
    await page.locator('#save-now').click()
    const saved = (await stored(page)).state
    expect(saved.units[0].specialCooldown).toBeGreaterThan(0)
    expect(saved.units[0].specialCooldown).toBeCloseTo(cast.units[0].specialCooldown - (saved.time - cast.time), 5)
    if (['healer', 'frost', 'ranger'].includes(type)) expect(saved.specialEffects.length).toBeGreaterThan(0)
    await page.reload()
    await page.locator('#title-continue').click()
    await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
    await expect(page.locator('#app')).toHaveAttribute('data-phase', 'assault')
    const restored = (await stored(page)).state
    expect(restored.units[0].specialCooldown).toBeGreaterThan(0)
    expect(restored.units[0].specialCooldown).toBeLessThanOrEqual(saved.units[0].specialCooldown)
    expect(restored.units[0].specialSequence).toBe(1)
  })

test('a failed authored effect blocks preparation without spending cooldown and can retry', async ({ page }) => {
  let failed = true
  await page.route('**/effects/special/soldier.glb', (route) => failed ? route.abort() : route.continue())
  await seed(page, 'soldier', false)
  await expect(page.locator('#campaign-loading-retry')).toBeVisible({ timeout: 180_000 })
  expect(await page.evaluate(() => (window as any).towerDefenseDiagnostics().campaignPreparation.ready)).toBe(false)
  expect(await page.locator('#campaign-loading-progress').evaluate((bar: HTMLProgressElement) => bar.value < bar.max)).toBe(true)
  expect((await stored(page)).state.units[0].specialCooldown).toBeUndefined()
  expect((await stored(page)).state.time).toBe(0)
  await expect(page.locator('.defender-handle')).toHaveCount(0)
  failed = false
  await page.locator('#campaign-loading-retry').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  await expect(page.locator('.defender-handle')).toBeVisible()
  expect((await stored(page)).state.units[0].specialCooldown).toBeUndefined()
})
