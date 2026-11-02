import { expect, test } from '@playwright/test'

// Chapter scenes are skipped as soon as they appear; these specs cover the title, saves and settings.
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
  test(`title, settings and suspend ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('./?seed=7')
    await expect(page.locator('.title-screen')).toBeVisible()
    await page.screenshot({ path: `test-results/shell-title-${viewport.width}.png` })
    await page.getByRole('button', { name: '? 遊び方' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: '戻る' }).click()
    await page.getByRole('button', { name: '⚙ 設定' }).click()
    await page.screenshot({ path: `test-results/shell-settings-${viewport.width}.png` })
    await page.getByLabel('BGM 音量').fill('30')
    await page.getByLabel('効果音 音量').fill('40')
    await page.getByLabel('戦闘速度').selectOption('fast')
    await page.getByRole('dialog').getByRole('button', { name: '戻る' }).click()
    await page.getByRole('button', { name: '✦ はじめから' }).click()
    await page.screenshot({ path: `test-results/shell-difficulty-${viewport.width}.png` })
    await page.getByRole('button', { name: '◆ カジュアル' }).click()
    await expect(page.getByRole('button', { name: '任務と編成' })).toBeFocused()
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await page.getByRole('button', { name: /2,5 燈守/ }).click()
    await page.getByRole('button', { name: /4,5 平地 移動可能/ }).click()
    await expect(page.getByRole('button', { name: /4,5 燈守/ })).toBeEnabled()
    await page.getByRole('button', { name: '▶ ターン終了' }).click()
    await expect(page.locator('#turn')).toContainText('味方 · 2', { timeout: 15000 })
    await page.reload()
    await page.screenshot({ path: `test-results/shell-continue-${viewport.width}.png` })
    page.once('dialog', (dialog) => void dialog.dismiss())
    await page.getByRole('button', { name: '✦ はじめから' }).click()
    await page.getByRole('button', { name: '⚔ クラシック' }).click()
    await page.getByRole('dialog').getByRole('button', { name: '戻る' }).click()
    await page.getByRole('button', { name: /つづきから/ }).click()
    await expect(page.getByRole('button', { name: '任務と編成' })).toBeFocused()
    await expect(page.getByRole('button', { name: /4,5 燈守/ })).toBeVisible()
    await expect(page.locator('#turn')).toContainText('味方 · 2')
    await page.screenshot({ path: `test-results/ember-resumed-${viewport.width}.png` })
    await page.getByRole('button', { name: '設定', exact: true }).click()
    await expect(page.getByLabel('BGM 音量')).toHaveValue('30')
    await expect(page.getByLabel('効果音 音量')).toHaveValue('40')
    await expect(page.getByLabel('戦闘速度')).toHaveValue('fast')
    await expect(page.locator('audio').first()).toHaveJSProperty('volume', 0.021)
    await page.getByRole('dialog').getByRole('button', { name: '戻る' }).click()
    await page.getByRole('button', { name: '任務と編成' }).click()
    await expect(page.getByRole('button', { name: /？？？/ }).first()).toBeDisabled()
  })
}
test('landscape title', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('./')
  await page.screenshot({ path: 'test-results/shell-title-landscape.png' })
})
test('small portrait title', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('./')
  await page.screenshot({ path: 'test-results/shell-title-360.png' })
  await expect(page.getByRole('button', { name: '✦ はじめから' })).toBeInViewport()
})
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 }
]) {
  for (const difficulty of ['casual', 'classic'] as const) {
    test(`${difficulty} carries the correct allies after victory ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('./?seed=7')
      await page.getByRole('button', { name: '✦ はじめから' }).click()
      await page.getByRole('button', { name: difficulty === 'casual' ? '◆ カジュアル' : '⚔ クラシック' }).click()
      await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
      await page.evaluate(() => {
        const key = 'ember-grid:save:v1'
        const save = JSON.parse(localStorage.getItem(key)!)
        const allies = save.suspend.units.filter((unit: { side: string }) => unit.side === 'ally')
        const enemies = save.suspend.units.filter((unit: { side: string }) => unit.side === 'enemy')
        allies[0].hp = 0
        allies[1].x = 5
        allies[1].y = 5
        enemies.forEach((enemy: { hp: number }) => {
          enemy.hp = 0
        })
        Object.assign(enemies[0], { hp: 1, x: 6, y: 5 })
        localStorage.setItem(key, JSON.stringify(save))
      })
      await page.reload()
      await page.getByRole('button', { name: /つづきから/ }).click()
      await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
      await page.getByRole('button', { name: /6,6 風読み/ }).click()
      await page.getByRole('button', { name: /7,6 灰/ }).click()
      await page.getByRole('button', { name: '攻撃', exact: true }).click()
      await expect(page.locator('#result')).toBeVisible()
      await expect(page.locator('#report')).toContainText(difficulty === 'casual' ? '次の任務に復帰' : '遠征から離脱')
      await page.locator('#next').click()
      await expect(page.locator('#count')).toContainText(difficulty === 'casual' ? '◆ 3' : '◆ 2')
    })
  }
  test(`blocked storage still starts ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('blocked')
        }
      })
    })
    await page.goto('./')
    await expect(page.locator('#storage-notice')).toBeVisible()
    await page.getByRole('button', { name: '✦ はじめから' }).click()
    await page.getByRole('button', { name: '⚔ クラシック' }).click()
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  })
}

test('guard formation remains selected after suspend resume', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ember-grid:tutorial-complete:v1', '1'))
  await page.goto('./?seed=7')
  await page.getByRole('button', { name: '✦ はじめから' }).click()
  await page.getByRole('button', { name: '⚔ クラシック' }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: '任務と編成' }).click()
  await page.getByLabel(/守備隊/).check()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /峡谷の燈/ })
    .click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.reload()
  await page.getByRole('button', { name: /つづきから/ }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: '任務と編成' }).click()
  await expect(page.getByLabel(/守備隊/)).toBeChecked()
  await page.getByRole('dialog').getByRole('button', { name: '戻る' }).click()
  await page.evaluate(() => {
    const key = 'ember-grid:save:v1'
    const save = JSON.parse(localStorage.getItem(key)!)
    const allies = save.suspend.units.filter((unit: { side: string }) => unit.side === 'ally')
    const enemies = save.suspend.units.filter((unit: { side: string }) => unit.side === 'enemy')
    allies[1].x = 5
    allies[1].y = 5
    enemies.forEach((enemy: { hp: number }) => {
      enemy.hp = 0
    })
    Object.assign(enemies[0], { hp: 1, x: 6, y: 5 })
    localStorage.setItem(key, JSON.stringify(save))
  })
  await page.reload()
  await page.getByRole('button', { name: /つづきから/ }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: /6,6 風読み/ }).click()
  await page.getByRole('button', { name: /7,6 灰/ }).click()
  await page.getByRole('button', { name: '攻撃', exact: true }).click()
  await expect(page.locator('#result')).toBeVisible({ timeout: 30000 })
  await page.locator('#next').click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  const next = await page.evaluate(() => JSON.parse(localStorage.getItem('ember-grid:save:v1')!))
  expect(next.suspend.stage).toBe(1)
  expect(next.suspend.formation).toBe('guard')
})

test('completed expedition is identified on the title', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'ember-grid:save:v1',
      JSON.stringify({
        version: 1,
        difficulty: 'classic',
        formation: 'balanced',
        checkpoints: [],
        furthest: 5,
        cleared: [0, 1, 2, 3, 4, 5],
        bestTurns: {},
        completedAt: '2026-11-03T00:00:00.000Z'
      })
    )
  )
  await page.goto('./')
  await expect(page.locator('.title-screen')).toContainText('遠征達成')
  await expect(page.getByRole('button', { name: /エンディング/ })).toBeVisible()
})

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 }
]) {
  test(`final victory and ending replay ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.addInitScript(() => {
      localStorage.setItem('ember-grid:tutorial-complete:v1', '1')
      new MutationObserver(() => {
        if (document.querySelector('.story-credits')) sessionStorage.setItem('saw-credits', 'yes')
      }).observe(document, { childList: true, subtree: true })
    })
    await page.goto('./?seed=7')
    await page.getByRole('button', { name: '✦ はじめから' }).click()
    await page.getByRole('button', { name: '⚔ クラシック' }).click()
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await page.evaluate(() => {
      const key = 'ember-grid:save:v1'
      const save = JSON.parse(localStorage.getItem(key)!)
      save.furthest = 5
      save.cleared = [0, 1, 2, 3, 4]
      save.suspend.stage = 5
      const allies = save.suspend.units.filter((unit: { side: string }) => unit.side === 'ally')
      const enemies = save.suspend.units.filter((unit: { side: string }) => unit.side === 'enemy')
      allies[1].x = 5
      allies[1].y = 5
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
    await page.getByRole('button', { name: '攻撃', exact: true }).click()
    await expect(page.locator('#result')).toBeVisible({ timeout: 30000 })
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ember-grid:save:v1')!))
    expect(save.cleared).toContain(5)
    expect(save.completedAt).toBeTruthy()
    expect(save.suspend).toBeUndefined()
    await page.reload()
    await expect(page.locator('.title-screen')).toContainText('遠征達成')
    await page.screenshot({ path: `test-results/ember-completed-title-${viewport.width}.png` })
    await page.evaluate(() => sessionStorage.removeItem('saw-credits'))
    await page.getByRole('button', { name: /エンディング/ }).click()
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('saw-credits')).catch(() => null), { timeout: 30000 })
      .toBe('yes')
  })
}

test('enemy phase never overwrites its preceding ally phase', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ember-grid:tutorial-complete:v1', '1'))
  await page.goto('./?seed=7')
  await page.getByRole('button', { name: '✦ はじめから' }).click()
  await page.getByRole('button', { name: '⚔ クラシック' }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('ember-grid:save:v1')!).suspend)
  await page.locator('#end').click()
  await expect(page.locator('#turn')).toContainText('敵')
  await page.waitForTimeout(200)
  await page.reload()
  const actual = await page.evaluate(() => JSON.parse(localStorage.getItem('ember-grid:save:v1')!).suspend)
  expect(actual).toEqual(initial)
  await page.getByRole('button', { name: /つづきから/ }).click()
  await expect(page.locator('#turn')).toContainText('味方')
})
