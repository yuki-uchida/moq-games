import { expect, test } from '@playwright/test'
import { enterBattle } from './shell-helper'
import { plan } from './strategy'
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

test.use({ actionTimeout: 10000 })
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('ember-grid:settings:v1', JSON.stringify({ version: 1, story: false, tutorial: false }))
  )
})

test('keyboard focus survives a move', async ({ page }) => {
  await enterBattle(page)
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: /2,5 燈守/ }).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /3,5 燈守/ })).toBeEnabled()
  await expect(page.getByRole('button', { name: /3,5 燈守/ })).toBeFocused()
})

test('restart asks before discarding a move', async ({ page }) => {
  await enterBattle(page)
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: /2,5 燈守/ }).click()
  await page.getByRole('button', { name: /3,5 平地 移動可能/ }).click()
  await expect(page.getByRole('button', { name: /3,5 燈守/ })).toBeEnabled()
  const save = await page.evaluate(() => localStorage.getItem('ember-grid:save:v1'))
  const selection = await page.locator('#selection').textContent()
  await page.getByRole('button', { name: '再プレイ' }).click()
  await expect(page.getByRole('dialog', { name: /進行を破棄/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '✕ 戻る' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '↻ 破棄して続ける' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '✕ 戻る' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '再プレイ' })).toBeFocused()
  await expect(page.getByRole('button', { name: /3,5 燈守/ })).toBeVisible()
  await expect(page.locator('#selection')).toHaveText(selection!)
  expect(await page.evaluate(() => localStorage.getItem('ember-grid:save:v1'))).toBe(save)
  await page.getByRole('button', { name: '任務と編成' }).click()
  await page.locator('[data-stage="0"]').click()
  await expect(page.getByRole('dialog', { name: /進行を破棄/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#selection')).toHaveText(selection!)
  expect(await page.evaluate(() => localStorage.getItem('ember-grid:save:v1'))).toBe(save)
  await page.locator('[data-stage="0"]').click()
  await page.getByRole('button', { name: '↻ 破棄して続ける' }).click()
  await expect(page.getByRole('button', { name: /2,5 燈守/ })).toBeVisible()
  await page.getByRole('button', { name: '再プレイ' }).click()
  await expect(page.getByRole('dialog', { name: /進行を破棄/ })).toHaveCount(0)
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: /2,5 燈守/ }).click()
  await page.getByRole('button', { name: /3,5 平地 移動可能/ }).click()
  await page.getByRole('button', { name: '再プレイ' }).click()
  await page.getByRole('button', { name: '↻ 破棄して続ける' }).click()
  await expect(page.getByRole('button', { name: /2,5 燈守/ })).toBeVisible()
})

for (const width of [1280, 390])
  test(`focus and confirmation screenshots ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    await enterBattle(page)
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await page.getByRole('button', { name: /2,5 燈守/ }).focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: /3,5 燈守/ })).toBeFocused()
    await page.screenshot({ path: `test-results/ember-focus-${width}.png` })
    await page.getByRole('button', { name: '再プレイ' }).click()
    await page.screenshot({ path: `test-results/ember-confirm-${width}.png` })
  })

test('chapter one is playable by keyboard', async ({ page }) => {
  test.setTimeout(300000)
  await page.goto('./?seed=7')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  const game = createGame(0, 'balanced', undefined, seeded(7))
  const tabTo = async (selector: string) => {
    for (let attempts = 0; attempts < 30; attempts++) {
      if (await page.locator(selector).evaluate((element) => element === document.activeElement)) return
      await page.keyboard.press('Tab')
    }
    throw new Error(`Cannot reach ${selector}`)
  }
  const cell = async (x: number, y: number) => {
    await tabTo('.cell[tabindex="0"]')
    const index = await page
      .locator('.cell[tabindex="0"]')
      .evaluate((element) => [...element.parentElement!.children].indexOf(element))
    for (let step = index % size; step !== x; step += x > step ? 1 : -1)
      await page.keyboard.press(x > step ? 'ArrowRight' : 'ArrowLeft')
    for (let step = Math.floor(index / size); step !== y; step += y > step ? 1 : -1)
      await page.keyboard.press(y > step ? 'ArrowDown' : 'ArrowUp')
    await page.keyboard.press('Enter')
  }
  for (let turn = 0; turn < 25 && game.phase === 'ally'; turn++) {
    for (const unit of game.units
      .filter((unit) => unit.side === 'ally' && unit.hp > 0)
      .sort((a, b) => ['archer', 'mage', 'soldier'].indexOf(a.role) - ['archer', 'mage', 'soldier'].indexOf(b.role))) {
      await cell(unit.x, unit.y)
      if (unit.hp <= unit.max - 7 && game.potions > 0) {
        await tabTo('#recover')
        await page.keyboard.press('Enter')
        recover(game, unit)
        await expect(page.locator('#end')).toBeEnabled({ timeout: 30000 })
        continue
      }
      const { position, target } = plan(game, unit)
      if (position.x !== unit.x || position.y !== unit.y) {
        await cell(position.x, position.y)
        move(game, unit, position.x, position.y)
        await expect(page.locator('.cell').nth(position.y * size + position.x)).toHaveClass(/ally/)
        await expect(page.locator('#end')).toBeEnabled({ timeout: 30000 })
        await expect(page.locator('.cell[tabindex="0"]')).toBeFocused({ timeout: 30000 })
      }
      if (target) {
        await cell(target.x, target.y)
        await page.keyboard.press('Enter')
        attack(game, unit, target)
        if (game.phase !== 'won') await expect(page.locator('#end')).toBeEnabled({ timeout: 30000 })
      }
      if (game.phase === 'won') break
    }
    if (game.phase === 'ally') {
      await expect(page.locator('#end')).toBeEnabled({ timeout: 30000 })
      if (!allyTurnOver(game) || (await page.locator('#undo').isEnabled())) {
        await tabTo('#end')
        await page.keyboard.press('Enter')
      }
      beginEnemy(game)
      game.units.filter((unit) => unit.side === 'enemy').forEach((unit) => enemyStep(game, unit))
      beginAlly(game)
      await expect(page.locator('#turn')).toContainText(`味方 · ${game.turn}`, { timeout: 30000 })
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
    }
  }
  expect(game.phase).toBe('won')
  await expect(page.locator('#result')).toBeVisible({ timeout: 30000 })
})

test('in-game reduced motion disables decorative animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('./')
  await page.getByRole('button', { name: '⚙ 設定' }).click()
  await page.getByLabel('動き').selectOption('reduce')
  expect(
    await page.evaluate(() => {
      const container = document.createElement('div')
      container.innerHTML =
        '<div class="story-title"></div><div class="story-credits"><div></div></div><div class="level-up"></div><div id="phase-banner"></div>'
      document.body.append(container)
      return [
        ...document.querySelectorAll('.title-embers, .story-title, .story-credits div, .level-up, #phase-banner')
      ].map((element) => getComputedStyle(element).animationName)
    })
  ).toEqual(['none', 'none', 'none', 'none', 'none', 'none'])
})
