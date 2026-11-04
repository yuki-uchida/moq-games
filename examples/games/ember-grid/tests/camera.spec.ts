import { test, expect, type Page } from '@playwright/test'
import { enterBattle } from './shell-helper'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    setInterval(() => document.querySelector<HTMLElement>('.story-overlay button')?.click(), 150)
  )
})

type Camera = { view: { zoom: number; x: number; y: number } }
const view = (page: Page) =>
  page.evaluate(() => ({ ...(document.querySelector('.field') as HTMLElement & { camera: Camera }).camera.view }))
/** Largest distance (px) between a 3D figure and the floor tile it stands on. */
const misalignment = (page: Page) =>
  page.evaluate(() => {
    type Actor = {
      visual: {
        root: { matrixWorld: { elements: number[] }; position: { constructor: new (...xyz: number[]) => unknown } }
      }
    }
    const field = document.querySelector('.field')!.getBoundingClientRect(),
      stage = (
        document.querySelector('canvas.stage') as HTMLCanvasElement & {
          stage: {
            actors: Map<string, Actor>
            last: { game: import('../src/game').Game }
            screen: (point: unknown) => { x: number; y: number }
          }
        }
      ).stage,
      cells = document.querySelectorAll('#board .cell')
    let worst = 0
    for (const [id, actor] of stage.actors) {
      const unit = stage.last.game.units.find((u) => u.id === id)
      if (!unit || unit.hp <= 0) continue
      const e = actor.visual.root.matrixWorld.elements,
        p = stage.screen(new actor.visual.root.position.constructor(e[12], e[13], e[14])),
        cell = cells[unit.y * 10 + unit.x].getBoundingClientRect()
      worst = Math.max(
        worst,
        Math.hypot(p.x - (cell.left + cell.width / 2 - field.left), p.y - (cell.top + cell.height / 2 - field.top))
      )
    }
    return worst
  })
/** Whether every listed cell's centre lies inside the field. */
const inField = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const field = document.querySelector('.field')!.getBoundingClientRect()
    const cells = Array.from(document.querySelectorAll(selector))
    return (
      cells.length > 0 &&
      cells.every((cell) => {
        const r = cell.getBoundingClientRect(),
          x = r.left + r.width / 2,
          y = r.top + r.height / 2
        return x > field.left && x < field.right && y > field.top && y < field.bottom
      })
    )
  }, selector)
const settle = (page: Page) => page.waitForTimeout(650)

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 }
]) {
  test(`battle opens closer, selection preserves zoom and the layers stay aligned at ${viewport.width}`, async ({
    page
  }) => {
    await page.setViewportSize(viewport)
    await enterBattle(page)
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await settle(page)
    const start = await view(page)
    expect(start.zoom).toBeGreaterThan(1.2)
    expect(await inField(page, '#board .cell.ally, #board .cell.enemy')).toBe(true)
    expect(await misalignment(page)).toBeLessThan(1.5)
    await page.screenshot({ path: `test-results/camera-start-${viewport.width}.png` })

    await page.getByRole('button', { name: /風読み/ }).click()
    await settle(page)
    const selected = await view(page)
    expect(selected.zoom).toBe(start.zoom)
    expect(await inField(page, '#board .cell.legal')).toBe(true)
    expect(await misalignment(page)).toBeLessThan(1.5)
    await page.screenshot({ path: `test-results/camera-select-${viewport.width}.png` })

    await page.getByRole('button', { name: '拡大' }).click()
    await settle(page)
    expect((await view(page)).zoom).toBeGreaterThan(selected.zoom)
    expect(await misalignment(page)).toBeLessThan(1.5)
    await page.getByRole('button', { name: '全体を表示' }).click()
    await settle(page)
    expect((await view(page)).zoom).toBe(1)
    await expect(page.getByRole('button', { name: '縮小' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '全体を表示' })).toBeDisabled()
    expect(await inField(page, '#board .cell')).toBe(true)
    expect(await misalignment(page)).toBeLessThan(1.5)
  })
}

test('mouse drag pans and the wheel zooms without acting; keys zoom and follow focus', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await enterBattle(page)
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: /風読み/ }).click()
  await settle(page)
  const selection = await page.locator('#selection').textContent()
  const before = await view(page)
  const box = (await page.locator('.field').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.5 - 160, box.y + box.height * 0.5 - 60, { steps: 8 })
  await page.mouse.up()
  const panned = await view(page)
  expect(Math.hypot(panned.x - before.x, panned.y - before.y)).toBeGreaterThan(0.5)
  // The drag neither moved the selected archer nor changed the selection.
  await expect(page.locator('#selection')).toHaveText(selection!)
  await expect(page.getByRole('button', { name: /2,4 風読み/ })).toBeVisible()
  expect(await misalignment(page)).toBeLessThan(1.5)

  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6)
  await page.mouse.wheel(0, 400)
  await expect.poll(async () => (await view(page)).zoom).toBeLessThan(panned.zoom)
  await page.mouse.wheel(0, -800)
  await expect.poll(async () => (await view(page)).zoom).toBeGreaterThan(panned.zoom)
  expect(await misalignment(page)).toBeLessThan(1.5)

  // Keyboard: 0 shows the whole board, + zooms in, and arrow focus reaches a far corner in view.
  await page.getByRole('button', { name: /2,4 風読み/ }).focus()
  await page.keyboard.press('0')
  await expect.poll(async () => (await view(page)).zoom).toBe(1)
  await page.keyboard.press('+')
  await page.keyboard.press('+')
  await expect.poll(async () => (await view(page)).zoom).toBeGreaterThan(1.5)
  // Cell names are 1-based: the archer stands on 2,4 and the far corner is 10,1.
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp')
  await settle(page)
  await expect(page.getByRole('button', { name: /^10,1 / })).toBeFocused()
  expect(await inField(page, '#board .cell:focus')).toBe(true)

  // After the enemy turn the allies are back in view.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '▶ ターン終了' }).click()
  await expect(page.locator('#turn')).toContainText('ターン 2 · 味方', { timeout: 60000 })
  await settle(page)
  expect(await inField(page, '#board .cell.ally')).toBe(true)
})

test('touch pinch zooms and a one-finger drag pans without a tap', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await page.addInitScript(() =>
    setInterval(() => document.querySelector<HTMLElement>('.story-overlay button')?.click(), 150)
  )
  await enterBattle(page)
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await settle(page)
  const client = await context.newCDPSession(page)
  const box = (await page.locator('.field').boundingBox())!
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2
  const touch = (type: string, points: { x: number; y: number }[]) =>
    client.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, id) => ({ x: Math.round(p.x), y: Math.round(p.y), id }))
    })
  const before = await view(page)
  await touch('touchStart', [
    { x: cx - 40, y: cy },
    { x: cx + 40, y: cy }
  ])
  for (let step = 1; step <= 6; step++)
    await touch('touchMove', [
      { x: cx - 40 - step * 12, y: cy },
      { x: cx + 40 + step * 12, y: cy }
    ])
  await touch('touchEnd', [])
  const pinched = await view(page)
  expect(pinched.zoom).toBeGreaterThan(before.zoom * 1.3)
  expect(await misalignment(page)).toBeLessThan(1.5)

  const selection = await page.locator('#selection').textContent()
  await touch('touchStart', [{ x: cx, y: cy + 40 }])
  for (let step = 1; step <= 6; step++) await touch('touchMove', [{ x: cx - step * 15, y: cy + 40 - step * 8 }])
  await touch('touchEnd', [])
  const dragged = await view(page)
  expect(Math.hypot(dragged.x - pinched.x, dragged.y - pinched.y)).toBeGreaterThan(0.3)
  await page.waitForTimeout(300)
  await expect(page.locator('#selection')).toHaveText(selection!)
  expect(await misalignment(page)).toBeLessThan(1.5)
  await page.screenshot({ path: 'test-results/camera-touch-390.png' })
  await context.close()
})
