import { expect, test } from '@playwright/test'
import {
  allyTurnOver,
  attack,
  beginAlly,
  beginEnemy,
  createGame,
  enemyStep,
  move,
  seeded,
  size,
  staffHeal
} from '../src/game'
import { plan } from './strategy'
import { clickCell, enterBattle } from './shell-helper'

// Chapter scenes are skipped as soon as they appear; these specs cover the battle presentation.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    setInterval(
      () => document.querySelector<HTMLButtonElement>('.story-overlay button, .story-credits button')?.click(),
      100
    )
  })
})

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 }
]) {
  test(`chapters 4–6 presentation ${viewport.width}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize(viewport)
    await enterBattle(page, './', true)
    await expect(page.locator('.preparation')).toHaveCount(0, { timeout: 90000 })
    for (const [chapter, roles, music, objective] of [
      [3, ['healer', 'slime', 'bat'], 'moonlit-ward', '制圧'],
      [4, ['healer', 'wraith', 'shaman', 'beetle'], 'moonlit-ward', '残り6ターン'],
      [5, ['healer', 'ogre', 'dragon'], 'crown-of-embers', 'ボス']
    ] as const) {
      await page.getByRole('button', { name: '任務と編成' }).click()
      await page.locator(`[data-stage="${chapter}"]`).click()
      await expect(page.locator('.preparation')).toHaveCount(0, { timeout: 90000 })
      await expect(page.locator('#objective')).toContainText(objective)
      await expect(page.locator('[data-ember-music]')).toHaveAttribute('data-track', music)
      await expect(page.locator('[data-ember-music]')).toHaveAttribute('src', /^blob:/)
      await expect
        .poll(
          async () =>
            page.locator('.stage').evaluate((canvas) => {
              const stage = (canvas as HTMLCanvasElement & { stage: import('../src/stage').Stage }).stage
              return stage
                .diagnostics()
                .filter((actor) => actor.visible)
                .map((actor) => actor.role)
            }),
          { timeout: 90000 }
        )
        .toEqual(expect.arrayContaining([...roles]))
      if (chapter === 3) await expect(page.getByRole('button', { name: /制圧目標/ })).toHaveClass(/seize/)
      if (chapter === 5) await expect(page.locator('.stand.boss .tag')).toContainText('♛')
      await page.screenshot({ path: `test-results/ember-ch${chapter + 1}-${viewport.width}.png` })
    }
    expect(errors).toEqual([])
  })
}

for (const width of [1280, 390])
  test(`seeded chapter 4 victory includes a staff heal ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await enterBattle(page, './?seed=7', true)
    await expect(page.locator('.preparation')).toHaveCount(0, { timeout: 90000 })
    await page.getByRole('button', { name: '任務と編成' }).click()
    await page.locator('[data-stage="3"]').click()
    await expect(page.locator('.preparation')).toHaveCount(0, { timeout: 90000 })
    const game = createGame(3, 'balanced', undefined, seeded(7))
    const cell = (x: number, y: number) => page.locator('.cell').nth(y * size + x)
    let healed = false
    for (let turn = 0; turn < 25 && game.phase === 'ally'; turn++) {
      for (const unit of game.units.filter((u) => u.side === 'ally' && u.hp > 0)) {
        if (game.phase !== 'ally') break
        await clickCell(page, cell(unit.x, unit.y))
        const action = plan(game, unit)
        if (action.position.x !== unit.x || action.position.y !== unit.y) {
          await clickCell(page, cell(action.position.x, action.position.y))
          move(game, unit, action.position.x, action.position.y)
        }
        if (action.healing) {
          const before = action.healing.hp
          await clickCell(page, cell(action.healing.x, action.healing.y))
          await page.getByRole('button', { name: '回復', exact: true }).click()
          expect(staffHeal(game, unit, action.healing)).toBe(true)
          await expect(page.locator('.healing-effect')).toContainText(`+${action.healing.hp - before}`)
          if (!healed) await page.screenshot({ path: `test-results/ember-heal-${width}.png` })
          await expect(cell(action.healing.x, action.healing.y)).toHaveAttribute(
            'aria-label',
            new RegExp(`HP ${action.healing.hp}(?: |$)`)
          )
          healed = true
        } else if (action.target) {
          await clickCell(page, cell(action.target.x, action.target.y))
          await page.getByRole('button', { name: '攻撃', exact: true }).click()
          attack(game, unit, action.target)
        }
      }
      if (game.phase !== 'ally') break
      await expect(page.getByRole('button', { name: '▶ ターン終了' })).toBeEnabled({ timeout: 30000 })
      // The page hands over by itself once every ally is spent, unless the last move can still be undone.
      if (!allyTurnOver(game) || (await page.locator('#undo').isEnabled()))
        await page.getByRole('button', { name: '▶ ターン終了' }).click()
      beginEnemy(game)
      game.units.filter((u) => u.side === 'enemy').forEach((u) => enemyStep(game, u))
      beginAlly(game)
      if (game.phase === 'ally')
        await expect(page.locator('#turn')).toContainText(`味方 · ${game.turn}`, { timeout: 30000 })
    }
    expect(healed).toBe(true)
    expect(game.phase).toBe('won')
    await expect(page.locator('#result')).toBeVisible({ timeout: 30000 })
  })

for (const width of [1280, 390])
  test(`enemy ranged attack ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    await enterBattle(page, './?seed=7', true)
    await expect(page.locator('.preparation')).toHaveCount(0, { timeout: 90000 })
    await page.getByRole('button', { name: '任務と編成' }).click()
    await page.locator('[data-stage="4"]').click()
    await expect(page.locator('.preparation')).toHaveCount(0, { timeout: 90000 })
    for (let turn = 0; turn < 5; turn++) {
      await page.getByRole('button', { name: '▶ ターン終了' }).click()
      const projectile = page.locator('.stage[data-projectile*="spell"]')
      if (
        await projectile.waitFor({ state: 'attached', timeout: 5000 }).then(
          () => true,
          () => false
        )
      ) {
        await page.screenshot({ path: `test-results/ember-ranged-${width}.png` })
        return
      }
      await expect(page.locator('#turn')).toContainText('味方', { timeout: 30000 })
    }
    throw new Error('No ranged attack observed')
  })
