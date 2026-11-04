import { expect, test, type Page } from '@playwright/test'

async function seed(page: Page, stage = 0) {
  await page.addInitScript(() => {
    localStorage.setItem('ember-grid:settings:v1', JSON.stringify({ version: 1, story: false, tutorial: false }))
  })
  await page.goto('./?seed=7')
  await page.getByRole('button', { name: '✦ はじめから' }).click()
  await page.getByRole('button', { name: '⚔ クラシック' }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.evaluate((chapter) => {
    const key = 'ember-grid:save:v1'
    const save = JSON.parse(localStorage.getItem(key)!)
    save.furthest = chapter
    save.cleared = Array.from({ length: chapter }, (_, index) => index)
    save.suspend.stage = chapter
    localStorage.setItem(key, JSON.stringify(save))
  }, stage)
}

async function gate(page: Page) {
  await page.locator('canvas.stage').evaluate((canvas) => {
    const stage = (canvas as HTMLCanvasElement & { stage: { load: (...args: unknown[]) => Promise<unknown> } }).stage
    const load = stage.load.bind(stage)
    let release!: () => void
    const blocked = new Promise<void>((resolve) => (release = resolve))
    Object.assign(window, { releaseModels: release })
    stage.load = (...args) => blocked.then(() => load(...args))
  })
}

for (const mode of ['new', 'continue', 'ending'] as const) {
  test(`restart during ${mode} model preparation`, async ({ page }) => {
    if (mode !== 'new') {
      await seed(page, mode === 'ending' ? 5 : 0)
      if (mode === 'ending')
        await page.evaluate(() => {
          const key = 'ember-grid:save:v1'
          const save = JSON.parse(localStorage.getItem(key)!)
          save.cleared.push(5)
          save.completedAt = new Date().toISOString()
          delete save.suspend
          localStorage.setItem(key, JSON.stringify(save))
        })
      await page.reload()
    } else {
      await page.addInitScript(() =>
        localStorage.setItem('ember-grid:settings:v1', JSON.stringify({ version: 1, story: false, tutorial: false }))
      )
      await page.goto('./')
    }
    await gate(page)
    if (mode === 'new') {
      await page.getByRole('button', { name: '✦ はじめから' }).click()
      await page.getByRole('button', { name: '⚔ クラシック' }).click()
    } else await page.getByRole('button', { name: mode === 'ending' ? /エンディングを再生/ : /つづきから/ }).click()
    await expect(page.locator('.preparation')).toBeVisible()
    if (mode === 'ending') {
      await expect(page.locator('#restart')).toBeDisabled()
      await expect(page.locator('#mission')).toBeDisabled()
    } else {
      await page.locator('#restart').click()
      const confirm = page.getByRole('button', { name: '↻ 破棄して続ける' })
      if (await confirm.isVisible()) await confirm.click()
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 1280, height: 800 }
      ]) {
        await page.setViewportSize(viewport)
        await page.screenshot({ path: `test-results/ember-loading-restart-${mode}-${viewport.width}.png` })
      }
    }
    await page.evaluate(() => (window as unknown as { releaseModels: () => void }).releaseModels())
    if (mode === 'ending') await expect(page.locator('.title-screen')).toBeVisible({ timeout: 90000 })
    else await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  })
}

for (const point of ['outro', 'epilogue', 'credits'] as const) {
  test(`final clear survives reload during ${point}`, async ({ page }) => {
    await seed(page, 5)
    await page.evaluate(() => {
      const key = 'ember-grid:save:v1'
      const save = JSON.parse(localStorage.getItem(key)!)
      const allies = save.suspend.units.filter((unit: { side: string }) => unit.side === 'ally')
      const enemies = save.suspend.units.filter((unit: { side: string }) => unit.side === 'enemy')
      Object.assign(allies[1], { x: 5, y: 5 })
      enemies.forEach((enemy: { hp: number }) => (enemy.hp = 0))
      Object.assign(enemies[0], { hp: 1, x: 6, y: 5, boss: true })
      localStorage.setItem(key, JSON.stringify(save))
    })
    await page.reload()
    await page.getByRole('button', { name: /つづきから/ }).click()
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await page.getByRole('button', { name: '設定', exact: true }).click()
    await page.getByLabel('ストーリー').check()
    await page.getByRole('dialog').getByRole('button', { name: '戻る' }).click()
    await page.getByRole('button', { name: /6,6 風読み/ }).click()
    await page.getByRole('button', { name: /7,6 ボス 灰/ }).click()
    await page.getByRole('button', { name: '攻撃', exact: true }).click()
    await expect(page.locator('.story-overlay')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('#turn')).toHaveText('ターン 1 · 勝利')
    await expect(page.locator('#objective')).toContainText('任務達成')
    await expect(page.locator('#fast')).toBeHidden()
    await expect(page.locator('#result')).toBeHidden()
    if (point !== 'outro') {
      await page.locator('.story-overlay button').click()
      if (point === 'epilogue') await expect(page.locator('.story-overlay')).toBeVisible()
      else {
        await expect(page.locator('.story-overlay')).toBeVisible()
        await page.locator('.story-overlay button').click()
        await expect(page.locator('.story-credits')).toBeVisible()
      }
    }
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ember-grid:save:v1')!))
    expect(save.cleared).toContain(5)
    expect(save.completedAt).toBeTruthy()
    expect(save.finale).toBeTruthy()
    expect(save.suspend).toBeUndefined()
    await page.reload()
    await expect(page.locator('.title-screen')).toContainText('遠征達成')
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 }
    ]) {
      await page.setViewportSize(viewport)
      await page.screenshot({ path: `test-results/ember-victory-${point}-${viewport.width}.png` })
    }
  })
}

test('seize clear is saved before its outro', async ({ page }) => {
  await seed(page, 3)
  await page.evaluate(() => {
    const key = 'ember-grid:save:v1'
    const save = JSON.parse(localStorage.getItem(key)!)
    Object.assign(
      save.suspend.units.find((unit: { side: string }) => unit.side === 'ally'),
      { x: 8, y: 4 }
    )
    save.bestTurns[3] = 1
    localStorage.setItem(key, JSON.stringify(save))
  })
  await page.reload()
  await page.getByRole('button', { name: /つづきから/ }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByLabel('ストーリー').check()
  await page.getByRole('dialog').getByRole('button', { name: '戻る' }).click()
  await page.locator('#end').click()
  await expect(page.locator('.story-overlay')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#turn')).toHaveText('ターン 1 · 勝利')
  await expect(page.locator('#objective')).toContainText('任務達成')
  await expect(page.locator('#fast')).toBeHidden()
  await expect(page.locator('#result')).toBeHidden()
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ember-grid:save:v1')!))
  expect(save.cleared).toContain(3)
  expect(save.furthest).toBe(4)
  expect(save.checkpoints[4]).toBeTruthy()
  expect(save.bestTurns[3]).toBe(1)
  expect(save.suspend).toBeUndefined()
  await page.reload()
  await expect(page.getByRole('button', { name: /つづきから/ })).toContainText('骸の礼拝堂')
})

test('survive victory updates the HUD and saves before its outro', async ({ page }) => {
  await page.goto('./?seed=7')
  await page.evaluate(async () => {
    const gamePath = './src/game.ts'
    const savePath = './src/save.ts'
    const { createGame, seeded } = await import(gamePath)
    const { freshSave, snapshotGame } = await import(savePath)
    const game = createGame(4, 'balanced', undefined, seeded(7))
    game.turn = 6
    for (const unit of game.units.filter((unit: { side: string }) => unit.side === 'ally')) unit.def = 100
    localStorage.setItem('ember-grid:settings:v1', JSON.stringify({ version: 1, story: false, tutorial: false }))
    localStorage.setItem(
      'ember-grid:save:v1',
      JSON.stringify({ ...freshSave('classic'), furthest: 4, cleared: [0, 1, 2, 3], suspend: snapshotGame(game) })
    )
  })
  await page.reload()
  await page.getByRole('button', { name: /つづきから/ }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByLabel('ストーリー').check()
  await page.getByRole('dialog').getByRole('button', { name: '戻る' }).click()
  await page.locator('#end').click()
  await expect(page.locator('.story-overlay p')).toHaveText('礼拝堂の燈台が、暗闇に輝いた。', { timeout: 30000 })
  await expect(page.locator('#turn')).toHaveText('ターン 6 · 勝利')
  await expect(page.locator('#objective')).toContainText('防衛達成')
  await expect(page.locator('#fast')).toBeHidden()
  await expect(page.locator('#result')).toBeHidden()
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('ember-grid:save:v1')!))
  expect(save.cleared).toContain(4)
  expect(save.furthest).toBe(5)
  expect(save.checkpoints[5]).toBeTruthy()
  expect(save.bestTurns[4]).toBe(6)
  expect(save.suspend).toBeUndefined()
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport)
    await page.screenshot({ path: `test-results/ember-survive-victory-${viewport.width}.png` })
  }
  await page.reload()
  await expect(page.getByRole('button', { name: /つづきから/ })).toContainText('灰の玉座')
})
