import { expect, test, type Page } from '@playwright/test'
import { enterBattle, cameraSettled } from './shell-helper'

// Chapter scenes are skipped as soon as they appear unless a test drives them itself.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    setInterval(
      () => document.querySelector<HTMLButtonElement>('.story-overlay button, .story-credits button')?.click(),
      100
    )
  })
})

const ready = async (page: Page, unlocked = false) => {
  await enterBattle(page, './?seed=7', unlocked)
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
}
const cell = (page: Page, x: number, y: number) => page.locator('.cell').nth(y * 10 + x)

for (const fingers of [2, 3]) {
  test(`held ${fingers}-finger touch on units cancels long press and restores single touch`, async ({
    page,
    context
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await ready(page)
    await cameraSettled(page)
    const points = await Promise.all(
      [/2,4 風読み/, /2,5 燈守/, /2,6 星織/].slice(0, fingers).map(async (name, id) => {
        const unit = page.getByRole('button', { name })
        const box = (await unit.boundingBox())!
        const point = { id, x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
        expect(await unit.evaluate((node, { x, y }) => document.elementFromPoint(x, y) === node, point)).toBe(true)
        return point
      })
    )
    const client = await context.newCDPSession(page)
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] })
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points.slice(0, 2) })
    if (fingers === 3) await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points })
    await page.waitForTimeout(750)
    await expect(page.locator('#detail')).not.toBeVisible()
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [points[points.length - 1]] })
    await page.waitForTimeout(750)
    await expect(page.locator('#detail')).not.toBeVisible()
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(page.locator('.cell.legal')).toHaveCount(0)
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] })
    await expect(page.getByRole('dialog', { name: /風読み/ })).toBeVisible()
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.keyboard.press('Escape')
    await expect(page.locator('.cell.legal')).toHaveCount(0)
  })
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 }
]) {
  test(`battle controls and overlays ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await ready(page)
    const shot = (name: string) => page.screenshot({ path: `test-results/ember-ux-${name}-${viewport.width}.png` })
    await page.getByRole('button', { name: '再プレイ' }).click()
    // ↻ replays the (skipped) chapter opening, then shows the ally-phase banner with the board ready.
    await expect(page.locator('#phase-banner')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('#phase-banner')).toContainText('味方フェイズ')
    await expect(cell(page, 0, 0)).toBeEnabled()
    await shot('phase-ally')
    await expect(page.locator('.cell[tabindex="0"]')).toHaveCount(1)
    await cell(page, 0, 0).focus()
    await page.keyboard.press('ArrowRight')
    await expect(cell(page, 1, 0)).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(cell(page, 1, 1)).toBeFocused()
    await page.getByRole('button', { name: '敵の攻撃範囲', exact: true }).click()
    await expect(page.locator('.cell.danger').first()).toBeVisible()
    await shot('danger')
    await page.getByRole('button', { name: '敵の攻撃範囲', exact: true }).click()
    await expect(page.locator('.cell.danger')).toHaveCount(0)
    const archer = page.getByRole('button', { name: /2,4 風読み/ })
    await archer.click()
    await expect(page.locator('.hpbar').first()).toBeVisible()
    await page.getByRole('button', { name: 'ユニット詳細' }).click()
    await expect(page.getByRole('dialog', { name: /風読み/ })).toContainText('弓兵')
    await expect(page.locator('#detail progress')).toHaveCount(1)
    await shot('detail-ally')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'ユニット詳細' })).toBeFocused()
    await page.getByRole('button', { name: /7,4 灰牙/ }).click({ button: 'right' })
    await expect(page.getByRole('dialog', { name: /灰牙/ })).toContainText('狼')
    await shot('detail-enemy')
    await page.getByRole('button', { name: '閉じる' }).click()
    await expect(page.getByRole('button', { name: /7,4 灰牙/ })).toBeFocused()
    await page.getByRole('button', { name: /4,4 平地 移動可能/ }).click()
    await expect(page.getByRole('button', { name: '↶ 戻す' })).toBeEnabled()
    await shot('undo')
    await page.getByRole('button', { name: '↶ 戻す' }).click()
    await expect(page.getByRole('button', { name: /2,4 風読み/ })).toBeVisible()
    await page.getByRole('button', { name: /4,4 平地 移動可能/ }).click()
    await page.getByRole('button', { name: /7,4 灰牙/ }).click()
    await expect(page.locator('#forecast')).toContainText('相性 +3')
    await expect(page.locator('#forecast')).toContainText('10 → 2')
    await shot('forecast')
    await page.keyboard.press('Escape')
    await expect(page.locator('#forecast')).toBeHidden()
    await expect(page.getByRole('button', { name: /7,4 灰牙 HP 10/ })).toBeFocused()
    await page.getByRole('button', { name: /7,4 灰牙/ }).click()
    await page.getByRole('button', { name: 'やめる' }).click()
    await expect(page.getByRole('button', { name: /7,4 灰牙 HP 10/ })).toBeVisible()
    await page.getByRole('button', { name: /7,4 灰牙/ }).click()
    await page.getByRole('button', { name: /7,4 灰牙/ }).click()
    await expect(page.getByRole('button', { name: /7,4 灰牙 HP 2/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '↶ 戻す' })).toBeDisabled()
    await page.locator('#end').click()
    await expect(page.locator('#phase-banner')).toContainText('敵フェイズ')
    await shot('phase-enemy')
    await page.getByRole('button', { name: '敵フェイズを早送り' }).click()
    await shot('fast')
  })
}

test('enemy fast forward preserves the same phase result', async ({ page }) => {
  const outcomes: string[][] = []
  for (const fast of [false, true]) {
    await ready(page)
    await page.locator('#end').click()
    await expect(page.locator('#phase-banner')).toContainText('敵フェイズ')
    await page.screenshot({ path: `test-results/ember-ux-phase-${fast ? 'fast' : 'normal'}.png` })
    if (fast) {
      await page.getByRole('button', { name: '敵フェイズを早送り' }).click()
      await expect(page.locator('#fast')).toHaveAttribute('aria-pressed', 'true')
    }
    await expect(page.locator('#turn')).toContainText('ターン 2 · 味方', { timeout: 20000 })
    outcomes.push(await page.locator('.cell.ally, .cell.enemy').allTextContents())
    outcomes[outcomes.length - 1] = await page
      .locator('.cell.ally, .cell.enemy')
      .evaluateAll((cells) => cells.map((item) => item.getAttribute('aria-label') ?? ''))
  }
  expect(outcomes[1]).toEqual(outcomes[0])
})

test('touch long press opens and dismisses unit details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page)
  const unit = page.getByRole('button', { name: /2,4 風読み/ })
  await unit.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: 100, clientY: 100 })
  await expect(page.getByRole('dialog', { name: /風読み/ })).toBeVisible()
  await unit.dispatchEvent('pointerup', { pointerType: 'touch', clientX: 100, clientY: 100 })
  await page.getByRole('button', { name: '閉じる' }).click()
  await expect(unit).toBeFocused()
})

for (const input of ['keyboard', 'mouse', 'touch'] as const) {
  test(`the first ${input} action works after a touch long press`, async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await ready(page)
    const unit = page.getByRole('button', { name: /2,4 風読み/ })
    const box = (await unit.boundingBox())!
    const client = await context.newCDPSession(page)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }]
    })
    await expect(page.getByRole('dialog', { name: /風読み/ })).toBeVisible()
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.getByRole('button', { name: '閉じる' }).click()
    await expect(unit).toBeFocused()
    await expect(page.locator('.cell.legal')).toHaveCount(0)
    if (input === 'keyboard') await page.keyboard.press('Enter')
    else if (input === 'mouse') await unit.click()
    else await unit.tap()
    await expect(page.getByRole('button', { name: /3,4 木立 移動可能/ })).toBeVisible()
  })
}

test('closing details before releasing a long press does not select the unit', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page)
  const unit = page.getByRole('button', { name: /2,4 風読み/ })
  const box = (await unit.boundingBox())!
  const client = await context.newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }]
  })
  await expect(page.getByRole('dialog', { name: /風読み/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(unit).toBeFocused()
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.locator('.cell.legal')).toHaveCount(0)
  await unit.tap()
  await expect(page.getByRole('button', { name: /3,4 木立 移動可能/ })).toBeVisible()
})

test('last move waits for an explicit action and field tap fast-forwards', async ({ page }) => {
  await ready(page)
  for (const name of [/2,5 燈守/, /2,6 星織/]) {
    await page.getByRole('button', { name }).click()
    await page.getByRole('button', { name: '✓ 待機' }).click()
  }
  await page.getByRole('button', { name: /2,4 風読み/ }).click()
  await page.getByRole('button', { name: /3,4 木立 移動可能/ }).click()
  await expect(page.locator('#turn')).toContainText('ターン 1 · 味方')
  await expect(page.locator('#wait')).toHaveClass(/recommended/)
  await page.getByRole('button', { name: '↶ 戻す' }).click()
  await expect(page.getByRole('button', { name: /2,4 風読み/ })).toBeVisible()
  await page.getByRole('button', { name: /3,4 木立 移動可能/ }).click()
  await page.getByRole('button', { name: '✓ 待機' }).click()
  await expect(page.locator('#phase-banner')).toContainText('敵フェイズ')
  await page.locator('.field').click({ position: { x: 5, y: 5 } })
  await expect(page.locator('#fast')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#turn')).toContainText('ターン 2 · 味方', { timeout: 20000 })
})

test('final chapter result with a fallen ally scrolls at every viewport', async ({ page }) => {
  await ready(page, true)
  await page.getByRole('button', { name: '任務と編成' }).click()
  await page.locator('[data-stage="5"]').click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  const { soldier, enemy } = await page.evaluate(() => {
    const stage = (
      document.querySelector('.stage') as HTMLCanvasElement & {
        stage: { last: { game: import('../src/game').Game } }
      }
    ).stage
    const game = stage.last.game
    const soldier = game.units.find((unit) => unit.role === 'soldier' && unit.side === 'ally')!
    const enemy = game.units.find((unit) => unit.side === 'enemy')!
    game.units.filter((unit) => unit.side === 'enemy').forEach((unit) => (unit.hp = 0))
    game.units.find((unit) => unit.role === 'archer' && unit.side === 'ally')!.hp = 0
    enemy.hp = 1
    enemy.x = soldier.x + 1
    enemy.y = soldier.y
    return { soldier: { x: soldier.x, y: soldier.y }, enemy: { x: enemy.x, y: enemy.y } }
  })
  await page.getByRole('button', { name: '敵の攻撃範囲', exact: true }).click()
  await cell(page, soldier.x, soldier.y).click()
  await cell(page, enemy.x, enemy.y).click()
  await page.getByRole('button', { name: '攻撃', exact: true }).click()
  await expect(page.locator('#result')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#result')).toContainText('遠征達成')
  await expect(page.locator('[data-ember-music]')).toHaveAttribute('data-jingle', 'final')
  await expect(page.locator('#report .fallen')).toHaveCount(1)
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 360, height: 640 }
  ]) {
    await page.setViewportSize(viewport)
    await page.locator('#result').evaluate((element) => (element.scrollTop = 0))
    const bounds = await page.locator('#result').evaluate((element) => {
      const panel = element.getBoundingClientRect(),
        heading = element.querySelector('#outcome')!.getBoundingClientRect()
      return { panelTop: panel.top, panelBottom: panel.bottom, headingTop: heading.top, headingBottom: heading.bottom }
    })
    expect(bounds.headingTop).toBeGreaterThanOrEqual(bounds.panelTop)
    expect(bounds.headingBottom).toBeLessThanOrEqual(bounds.panelBottom)
    await page.screenshot({ path: `test-results/ember-ux-result-${viewport.width}.png` })
    await page.locator('#next').scrollIntoViewIfNeeded()
    const reachable = await page.locator('#next').evaluate((button) => {
      const rect = button.getBoundingClientRect(),
        panel = button.parentElement!.getBoundingClientRect()
      return rect.top >= panel.top && rect.bottom <= panel.bottom
    })
    expect(reachable).toBe(true)
  }
})
