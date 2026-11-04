import { test, expect } from '@playwright/test'
import { enterBattle } from './shell-helper'

// Chapter scenes are skipped as soon as they appear.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    setInterval(
      () => document.querySelector<HTMLButtonElement>('.story-overlay button, .story-credits button')?.click(),
      100
    )
  })
})

test('defeat panel offers a retry that restarts without a discard dialog', async ({ page }) => {
  await enterBattle(page, './?seed=7')
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await expect(page.locator('#end')).toContainText('残り')
  await page.evaluate(() => {
    const stage = (
      document.querySelector('.stage') as HTMLCanvasElement & {
        stage: { last: { game: import('../src/game').Game } }
      }
    ).stage
    const game = stage.last.game
    const allies = game.units.filter((u) => u.side === 'ally')
    const foes = game.units.filter((u) => u.side === 'enemy')
    allies.forEach((a, i) => {
      a.hp = 1
      Object.assign(a, { x: i * 2, y: 0 })
    })
    foes.forEach((f, i) => Object.assign(f, { x: (i % allies.length) * 2, y: 1 }))
    for (let x = 0; x < 6; x++) for (const y of [0, 1]) game.rocks.delete(`${x},${y}`)
  })
  for (let turn = 0; turn < 6 && !(await page.locator('#result').isVisible()); turn++) {
    await page.getByRole('button', { name: '▶ ターン終了' }).click()
    await expect(page.locator('#end'))
      .toBeEnabled({ timeout: 30000 })
      .catch(() => {})
  }
  await expect(page.locator('#result')).toContainText('燈は消えた', { timeout: 30000 })
  await expect(page.locator('#retry')).toBeVisible()
  await expect(page.locator('#danger')).toBeDisabled()
  await page.screenshot({ path: 'test-results/menus-defeat.png' })
  await page.locator('#retry').click()
  await expect(page.getByRole('button', { name: '↻ 破棄して続ける' })).toHaveCount(0)
  await expect(page.locator('#turn')).toContainText('ターン 1 · 味方')
  await expect(page.locator('#retry')).toBeHidden()
})

test('settings are grouped with live volume values', async ({ page }) => {
  await page.goto('./?seed=7')
  await page.getByRole('button', { name: '⚙ 設定' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('h3')).toHaveText(['サウンド', '戦闘', '表示と演出'])
  await expect(dialog.locator('output')).toHaveText(['100%', '100%'])
  await dialog.getByLabel('BGM 音量').fill('40')
  await expect(dialog.locator('output').first()).toHaveText('40%')
  await expect(dialog.getByLabel('攻撃・回復の確認')).toBeChecked()
  await page.screenshot({ path: 'test-results/menus-settings.png' })
})

test('help has a screen guide tab with swatches', async ({ page }) => {
  await page.goto('./?seed=7')
  await page.getByRole('button', { name: '? 遊び方' }).click()
  const tabs = page.getByRole('dialog', { name: '遊び方' }).getByRole('tab')
  await expect(tabs).toHaveCount(6)
  await expect(tabs.nth(1)).toHaveText('▦ 画面の見かた')
  await tabs.nth(1).click()
  await expect(page.locator('#help-panel-1 .sw')).toHaveCount(7)
  await page.screenshot({ path: 'test-results/menus-help.png' })
})

test('title difficulty buttons describe their effect', async ({ page }) => {
  await page.goto('./?seed=7')
  await page.getByRole('button', { name: '✦ はじめから' }).click()
  const casual = page.getByRole('button', { name: /◆ カジュアル/ })
  await expect(casual).toContainText('はじめての方におすすめ')
  await expect(page.getByRole('button', { name: /⚔ クラシック/ })).toContainText('倒れた仲間は永久に離脱')
  await page.screenshot({ path: 'test-results/menus-difficulty.png' })
})
