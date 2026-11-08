import { expect, test, type Page } from '@playwright/test'
import type { Stage } from '../src/stage'

// The title screen plays a silent demo battle on the real board; leaving the title hands back the untouched game.
type Actor = ReturnType<Stage['diagnostics']>[number]
const actors = (page: Page) =>
  page.evaluate(() =>
    (document.querySelector('.stage') as HTMLCanvasElement & { stage: Stage }).stage
      .diagnostics()
      .map(({ id, role, at, track }) => ({ id, role, at, track }))
  )
const positions = (list: Pick<Actor, 'id' | 'at'>[]) =>
  Object.fromEntries(list.map(({ id, at }) => [id, `${at.x},${at.y}`]))
const storage = (page: Page) =>
  page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Count sound effects (HTMLAudioElement voices); the title music element is tracked separately.
    const played: string[] = []
    Object.assign(window, { played })
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      played.push(this.src)
      return play.call(this)
    }
    setInterval(
      () => document.querySelector<HTMLButtonElement>('.story-overlay button, .story-credits button')?.click(),
      100
    )
  })
})

test('the title plays a silent demo battle that advances on the real board', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('./')
  const before = await storage(page)
  const log = await page.locator('#log').textContent()
  await expect(page.locator('html')).toHaveClass(/attract-demo/, { timeout: 90000 })
  const start = await actors(page)
  expect(new Set(start.map((a) => a.role))).toEqual(new Set(['soldier', 'archer', 'mage', 'goblin', 'wolf']))
  // Units move and fight: positions change and HP tags drop.
  await expect
    .poll(async () => JSON.stringify(positions(await actors(page))), { timeout: 30000 })
    .not.toBe(JSON.stringify(positions(start)))
  const hp = () => page.locator('#marks .badge').allTextContents()
  const firstHp = await hp()
  await expect.poll(hp, { timeout: 45000 }).not.toEqual(firstHp)
  // Nothing persisted, nothing announced, no sound, focus kept on the title and the battle stays inert.
  expect(await storage(page)).toBe(before)
  expect(await page.locator('#log').textContent()).toBe(log)
  await expect(page.locator('#app main')).toHaveAttribute('inert', '')
  expect(await page.evaluate(() => document.activeElement?.closest('.title-screen') !== null)).toBe(true)
  expect(await page.evaluate(() => (window as unknown as { played: string[] }).played)).toEqual([])
  expect(await page.locator('[data-ember-music]').evaluate((m: HTMLAudioElement) => m.paused)).toBe(true)
  await expect(page.locator('.story-overlay, #phase-banner:not([hidden]), #toast:not([hidden])')).toHaveCount(0)
})

test('the title stays usable over the demo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page.locator('html')).toHaveClass(/attract-demo/, { timeout: 90000 })
  const start = page.getByRole('button', { name: '✦ はじめから' })
  await expect(start).toBeFocused()
  await page.waitForTimeout(2500)
  await expect(start).toBeFocused()
  for (const button of await page.locator('.title-content nav button:not(:disabled)').all()) {
    const box = (await button.boundingBox())!
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.dataset.action, {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2
    })
    expect(hit).toBe(await button.getAttribute('data-action'))
  }
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '⚙ 設定' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toContainText('設定')
  await page.getByRole('dialog').getByRole('button', { name: '戻る' }).click()
  await page.getByRole('button', { name: '? 遊び方' }).click()
  await expect(page.locator('#help-dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveClass(/attract-demo/)
  await expect(page.locator('.title-screen')).toBeVisible()
})

test('a new expedition starts exactly as without the demo', async ({ page }) => {
  await page.goto('./?seed=7')
  await expect(page.locator('html')).toHaveClass(/attract-demo/, { timeout: 90000 })
  // Let the demo change the board before leaving the title.
  const start = positions(await actors(page))
  await expect
    .poll(async () => JSON.stringify(positions(await actors(page))), { timeout: 30000 })
    .not.toBe(JSON.stringify(start))
  expect(await page.evaluate(() => localStorage.getItem('ember-grid:save:v1'))).toBeNull()
  await page.getByRole('button', { name: '✦ はじめから' }).click()
  await page.getByRole('button', { name: '⚔ クラシック' }).click()
  await expect(page.locator('html')).not.toHaveClass(/attract-demo/)
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await expect(page.locator('.field')).toHaveAttribute('data-mission', '0')
  expect(await page.locator('.field').evaluate((field: HTMLElement) => field.style.translate)).toBe('')
  // Chapter 1's opening positions and full HP, with no figure left over from the demo.
  await expect
    .poll(async () => positions(await actors(page)))
    .toEqual({ a: '1,4', b: '1,3', c: '1,5', d: '6,3', e: '6,5', f: '7,4' })
  expect((await actors(page)).every((a) => a.track === 'idle')).toBe(true)
  await expect(page.locator('#turn')).toContainText('ターン 1')
  expect(await page.locator('#marks .badge').allTextContents()).toEqual([
    '◆ 11',
    '▼ 10',
    '◆ 16',
    '▼ 14',
    '◆ 10',
    '▼ 10'
  ])
  const save = JSON.parse((await page.evaluate(() => localStorage.getItem('ember-grid:save:v1')))!)
  expect(save.suspend.turn).toBe(1)
  expect(save.suspend.units.map((u: { id: string; hp: number; max: number }) => u.hp === u.max)).not.toContain(false)
  await page.getByRole('button', { name: /2,5 燈守/ }).click()
  await expect(page.locator('#selection')).toContainText('燈守')
})

test('continue resumes the suspended battle and the demo never touches the save', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(async () => {
    const gamePath = './src/game.ts',
      savePath = './src/save.ts'
    const { createGame } = await import(gamePath)
    const { freshSave, snapshotGame } = await import(savePath)
    const game = createGame(1, 'balanced')
    game.turn = 3
    game.units[0].x = 3
    game.units[0].hp = 5
    localStorage.setItem(
      'ember-grid:save:v1',
      JSON.stringify({ ...freshSave('casual'), furthest: 1, cleared: [0], suspend: snapshotGame(game) })
    )
  })
  await page.reload()
  const saved = await page.evaluate(() => localStorage.getItem('ember-grid:save:v1'))
  await expect(page.locator('html')).toHaveClass(/attract-demo/, { timeout: 90000 })
  // The demo plays the chapter the save continues.
  await expect(page.locator('.field')).toHaveAttribute('data-mission', '1')
  const start = positions(await actors(page))
  await expect
    .poll(async () => JSON.stringify(positions(await actors(page))), { timeout: 30000 })
    .not.toBe(JSON.stringify(start))
  expect(await page.evaluate(() => localStorage.getItem('ember-grid:save:v1'))).toBe(saved)
  const suspend = JSON.parse(saved!).suspend
  await page.getByRole('button', { name: /つづきから/ }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await expect(page.locator('html')).not.toHaveClass(/attract-demo/)
  await expect(page.locator('#turn')).toContainText('ターン 3')
  await expect
    .poll(async () => positions(await actors(page)))
    .toEqual(
      Object.fromEntries(
        suspend.units
          .filter((u: { hp: number }) => u.hp > 0)
          .map((u: { id: string; x: number; y: number }) => [u.id, `${u.x},${u.y}`])
      )
    )
  await expect(page.getByRole('button', { name: /4,5 燈守リオ HP 5/ })).toBeVisible()
})

test('reduced motion holds the demo still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  await expect(page.locator('html')).toHaveClass(/attract-demo/, { timeout: 90000 })
  await expect(page.locator('html')).toHaveClass(/reduce-motion/)
  const start = await actors(page)
  expect(start.length).toBe(6)
  const hp = await page.locator('#marks .badge').allTextContents()
  await page.waitForTimeout(6000)
  expect(positions(await actors(page))).toEqual(positions(start))
  expect((await actors(page)).every((a) => a.track === 'idle')).toBe(true)
  expect(await page.locator('#marks .badge').allTextContents()).toEqual(hp)
  // The title still works and starts the game as usual.
  await page.getByRole('button', { name: '✦ はじめから' }).click()
  await page.getByRole('button', { name: '◆ カジュアル' }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await expect(page.locator('html')).not.toHaveClass(/attract-demo/)
})

test('without WebGL the static title remains', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/.test(type)) return null
      return (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest)
    } as typeof original
  })
  await page.goto('./')
  await expect(page.getByRole('button', { name: '↻ 画面を再試行' })).toBeVisible()
  await page.waitForTimeout(2000)
  await expect(page.locator('html')).not.toHaveClass(/attract-demo/)
  // The opaque backdrop still covers the battle.
  expect(await page.locator('.title-screen').evaluate((title) => getComputedStyle(title, '::before').opacity)).toBe('1')
})
