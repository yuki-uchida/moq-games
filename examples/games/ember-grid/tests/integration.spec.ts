import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, x: number, y: number) => page.locator('.cell').nth(y * 10 + x)
const settings = (page: Page) => page.locator('dialog.shell-dialog')
async function start(page: Page) {
  await page.getByRole('button', { name: '✦ はじめから' }).click()
  await page.getByRole('button', { name: '⚔ クラシック' }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    setInterval(
      () => document.querySelector<HTMLButtonElement>('.story-overlay button, .story-credits button')?.click(),
      100
    )
  })
})

for (const width of [1280, 390]) {
  test(`heal forecast ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    await page.goto('./?seed=7')
    await page.evaluate(async () => {
      const gamePath = './src/game.ts'
      const savePath = './src/save.ts'
      const { createGame, seeded } = await import(gamePath)
      const { freshSave, snapshotGame } = await import(savePath)
      const game = createGame(3, 'balanced', undefined, seeded(7))
      game.units.find((unit: { id: string }) => unit.id === 'a').hp = 8
      localStorage.setItem(
        'ember-grid:save:v1',
        JSON.stringify({ ...freshSave('classic'), furthest: 3, suspend: snapshotGame(game) })
      )
    })
    await page.reload()
    await page.getByRole('button', { name: /つづきから/ }).click()
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await cell(page, 0, 4).click()
    await cell(page, 1, 4).click()
    await expect(page.locator('#forecast')).toContainText('8 → 16')
    await page.screenshot({ path: `test-results/integration-heal-${width}.png` })
    await page.getByRole('button', { name: 'やめる' }).click()
    await expect(cell(page, 1, 4)).toBeFocused()
    await cell(page, 1, 4).click()
    await page.getByRole('button', { name: '回復', exact: true }).click()
    await expect(cell(page, 1, 4)).toHaveAttribute('aria-label', /HP 16/, { timeout: 30000 })
  })
  test(`help and tutorial ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    await page.goto('./?seed=7')
    const opener = page.getByRole('button', { name: '? 遊び方' })
    await opener.click()
    const help = page.getByRole('dialog', { name: '遊び方' })
    const tabs = help.getByRole('tab')
    for (let index = 0; index < 5; index++) {
      await page.screenshot({ path: `test-results/integration-help-${width}-${index}.png` })
      if (index < 4) await page.keyboard.press('ArrowRight')
    }
    await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Escape')
    await expect(opener).toBeFocused()
    await start(page)
    const hint = page.locator('#tutorial')
    await expect(hint).toBeVisible()
    const shot = (step: number) => page.screenshot({ path: `test-results/integration-tutorial-${width}-${step}.png` })
    await shot(0)
    await cell(page, 1, 3).click()
    await expect(hint).toContainText('移動可能')
    await shot(1)
    await cell(page, 3, 3).click()
    await expect(hint).toContainText('敵を選ぼう')
    await shot(2)
    await cell(page, 6, 3).click()
    await expect(hint).toContainText('攻撃予測')
    await shot(3)
    await page.getByRole('button', { name: '攻撃', exact: true }).click()
    await expect(hint).toContainText('待機')
    await shot(4)
    await expect(page.locator('#end')).toBeEnabled({ timeout: 30000 })
    await cell(page, 1, 4).click()
    await page.locator('#wait').click()
    await expect(hint).toContainText('攻撃範囲')
    await shot(5)
    await page.locator('#danger').click()
    await expect(hint).toBeHidden()
    await page.reload()
    await page.getByRole('button', { name: /つづきから/ }).click()
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await expect(hint).toBeHidden()
  })
}

test('settings apply to battle and skip tutorial', async ({ page }) => {
  await page.goto('./?seed=7')
  await page.getByRole('button', { name: '⚙ 設定' }).click()
  await settings(page).getByLabel('攻撃・回復の確認').uncheck()
  await settings(page).getByLabel('危険範囲を初期表示').check()
  await settings(page).getByLabel('ストーリー').uncheck()
  await settings(page).getByRole('button', { name: '戻る' }).click()
  await start(page)
  await expect(page.locator('.story-overlay')).toHaveCount(0)
  await expect(page.locator('.cell.danger').first()).toBeVisible()
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await settings(page).getByLabel('チュートリアル').uncheck()
  await expect(page.locator('#tutorial')).toBeHidden()
  await settings(page).getByLabel('チュートリアル').check()
  await expect(page.locator('#tutorial')).toBeVisible()
  await settings(page).getByRole('button', { name: '戻る' }).click()
  await page.locator('#tutorial button').click()
  await expect(page.locator('#tutorial')).toBeHidden()
  await cell(page, 1, 3).click()
  await cell(page, 3, 3).click()
  await cell(page, 6, 3).click()
  await expect(page.locator('#forecast')).toBeHidden()
  await expect(cell(page, 6, 3)).toHaveAttribute('aria-label', /HP 2/, { timeout: 30000 })
  await page.reload()
  await page.getByRole('button', { name: /つづきから/ }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await expect(page.locator('#tutorial')).toBeHidden()
})
