import { test, expect } from '@playwright/test'
import { plan } from './strategy'
import { enterBattle } from './shell-helper'
import {
  allyTurnOver,
  attack,
  beginAlly,
  beginEnemy,
  createGame,
  enemyStep,
  move,
  recover,
  seeded,
  size
} from '../src/game'

for (const width of [1280, 390]) {
  test(`story presentation ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    await enterBattle(page, './?seed=7')
    const scene = page.getByRole('dialog', { name: '物語' })
    await expect(scene).toBeVisible({ timeout: 60000 })
    await expect(page.locator('.cell').first()).toBeDisabled()
    await page.screenshot({ path: `test-results/story-narration-${width}.png` })
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(scene.locator('img')).toBeVisible()
    await page.screenshot({ path: `test-results/story-portrait-${width}.png` })
    await scene.getByRole('button', { name: 'スキップ' }).click()
    await expect(page.locator('.story-title')).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `test-results/story-title-${width}.png` })
    await expect(scene).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(scene).toHaveCount(0)
    await expect(page.locator('.cell').first()).toBeEnabled()
    await page.getByRole('button', { name: /2,5 燈守/ }).click()
    await expect(page.locator('#selection')).toContainText('燈守')
    const restart = page.getByRole('button', { name: '再プレイ' })
    await restart.focus()
    await restart.click()
    await expect(scene).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(restart).toBeFocused()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(async () => {
      const path = './src/dialogue.ts'
      const { Dialogue } = await import(path)
      void new Dialogue(document.querySelector('.field')!, () => '').credits()
    })
    await expect(page.getByRole('dialog', { name: 'クレジット' })).toBeVisible()
    await page.screenshot({ path: `test-results/story-credits-${width}.png` })
    await page.keyboard.press('Escape')
  })
}

test('chapter one outro precedes the report', async ({ page }) => {
  await enterBattle(page, './?seed=7')
  const scene = page.getByRole('dialog', { name: '物語' })
  await expect(scene).toBeVisible({ timeout: 60000 })
  await page.keyboard.press('Escape')
  await expect(scene).toBeVisible()
  await page.keyboard.press('Escape')
  const game = createGame(0, 'balanced', undefined, seeded(7))
  const cell = (x: number, y: number) => page.locator('.cell').nth(y * size + x)
  for (let turn = 0; turn < 25 && game.phase === 'ally'; turn++) {
    for (const unit of game.units
      .filter((unit) => unit.side === 'ally' && unit.hp > 0)
      .sort(
        (left, right) =>
          ['archer', 'mage', 'soldier'].indexOf(left.role) - ['archer', 'mage', 'soldier'].indexOf(right.role)
      )) {
      await cell(unit.x, unit.y).click()
      if (unit.hp <= unit.max - 7 && game.potions > 0) {
        await page.getByRole('button', { name: /^回復薬 残り/ }).click()
        recover(game, unit)
        continue
      }
      const { position, target } = plan(game, unit)
      if (position.x !== unit.x || position.y !== unit.y) {
        await cell(position.x, position.y).click()
        move(game, unit, position.x, position.y)
      }
      if (target) {
        await cell(target.x, target.y).click()
        await page.getByRole('button', { name: '攻撃', exact: true }).click()
        attack(game, unit, target)
      }
      if (game.phase === 'won') break
    }
    if (game.phase === 'ally') {
      await expect(page.getByRole('button', { name: '▶ ターン終了' })).toBeEnabled({ timeout: 30000 })
      // The page hands over by itself once every ally is spent, unless the last move can still be undone.
      if (!allyTurnOver(game) || (await page.locator('#undo').isEnabled()))
        await page.getByRole('button', { name: '▶ ターン終了' }).click()
      beginEnemy(game)
      game.units.filter((unit) => unit.side === 'enemy').forEach((unit) => enemyStep(game, unit))
      beginAlly(game)
      await expect(page.locator('#turn')).toContainText(`ターン ${game.turn} · 味方`, { timeout: 15000 })
    }
  }
  expect(game.phase).toBe('won')
  await expect(scene).toBeVisible()
  await expect(page.locator('#result')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.locator('#result')).toBeVisible()
})
