import { expect, test, type Page } from '@playwright/test'
import { enterBattle } from '../examples/games/ember-grid/tests/shell-helper'

const game = '/moq-games/examples/games/ember-grid/index.html?seed=7'
const pageErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('requestfailed', (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`))
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.url()}: ${response.status()}`)
  })
  await page.addInitScript(() => {
    localStorage.setItem('ember-grid:settings:v1', JSON.stringify({ speed: 'fast', motion: 'reduce' }))
    setInterval(
      () => document.querySelector<HTMLButtonElement>('.story-overlay button, .story-credits button')?.click(),
      100
    )
  })
})

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([])
})

test('starts a battle, attacks, and resumes after ending the turn', async ({ page }) => {
  await enterBattle(page, game)
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: /2,4 風読み/ }).click()
  await page.getByRole('button', { name: /4,4 平地 移動可能/ }).click()
  await page.getByRole('button', { name: /7,4 灰牙/ }).click()
  await expect(page.locator('#forecast')).toBeVisible()
  await page.getByRole('button', { name: '攻撃', exact: true }).click()
  await expect(page.getByRole('button', { name: /7,4 灰牙 HP 2/ })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: '▶ ターン終了' }).click()
  await expect(page.locator('#turn')).toContainText('味方 · 2', { timeout: 30000 })
  await page.reload()
  await page.getByRole('button', { name: /つづきから/ }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await expect(page.locator('#turn')).toContainText('味方 · 2')
  await expect(page.getByRole('button', { name: /4,4 風読み/ })).toBeVisible()
})

test('loads the final chapter and its boss', async ({ page }) => {
  await enterBattle(page, game, true)
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: '任務と編成' }).click()
  await page.locator('[data-stage="5"]').click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await expect(page.locator('#objective')).toContainText('ボス撃破')
  await expect(page.locator('.stand.boss .crown')).toBeVisible()
})

test('records final victory and offers the ending on the title', async ({ page }) => {
  await enterBattle(page, game)
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.evaluate(() => {
    const key = 'ember-grid:save:v1'
    const save = JSON.parse(localStorage.getItem(key)!)
    save.furthest = 5
    save.cleared = [0, 1, 2, 3, 4]
    save.suspend.stage = 5
    const allies = save.suspend.units.filter((unit: { side: string }) => unit.side === 'ally')
    const enemies = save.suspend.units.filter((unit: { side: string }) => unit.side === 'enemy')
    Object.assign(allies[1], { x: 5, y: 5 })
    enemies.forEach((enemy: { hp: number }) => {
      enemy.hp = 0
    })
    Object.assign(enemies[0], { hp: 1, x: 6, y: 5, boss: true })
    localStorage.setItem(key, JSON.stringify(save))
  })
  await page.reload()
  await page.getByRole('button', { name: /つづきから/ }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: /6,6 風読み/ }).click()
  await page.getByRole('button', { name: /7,6 ボス 灰/ }).click()
  await expect(page.locator('#forecast')).toBeVisible()
  await page.getByRole('button', { name: '攻撃', exact: true }).click()
  await expect(page.locator('#result')).toBeVisible({ timeout: 30000 })
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ember-grid:save:v1')!))
  expect(save.cleared).toContain(5)
  expect(save.completedAt).toBeTruthy()
  expect(save.suspend).toBeUndefined()
  await page.reload()
  await expect(page.locator('.title-screen')).toContainText('遠征達成')
  await expect(page.getByRole('button', { name: /エンディング/ })).toBeVisible()
})
