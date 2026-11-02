import { plan } from './strategy'
import { test, expect, type Page } from '@playwright/test'
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 844, height: 390 }
])
  test(`play ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('./')
    await expect(page.getByRole('button', { name: /2,5 燈守/ })).toBeVisible()
    await page.getByRole('button', { name: '遊び方' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: '戻る', exact: true }).click()
    await page.getByRole('button', { name: /2,5 燈守/ }).tap()
    await page.getByRole('button', { name: /4,5 平地 移動可能/ }).click()
    await expect(page.getByRole('button', { name: /4,5 燈守/ })).toBeVisible()
    await page.getByRole('button', { name: '✓ 待機', exact: true }).click()
    await page.getByRole('button', { name: '▶ ターン終了' }).click()
    await expect(page.locator('#turn')).toContainText('味方 · 2')
    await page.screenshot({ path: `test-results/ember-${viewport.width}.png` })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    for (let t = 0; t < 20; t++) {
      if (await page.locator('#result').isVisible()) break
      await page.getByRole('button', { name: '▶ ターン終了' }).click()
      await expect(page.getByRole('button', { name: '▶ ターン終了' }))
        .toBeEnabled({ timeout: 15000 })
        .catch(async () => {
          await expect(page.locator('#result')).toBeVisible()
        })
    }
    await expect(page.locator('#result')).toContainText('燈は消えた')
    await page.getByRole('button', { name: '再プレイ', exact: true }).click()
    await expect(page.locator('#turn')).toContainText('味方 · 1')
    await expect(page.locator('#count')).toHaveText('◆ 3 / ▼ 3')
    expect(errors).toEqual([])
  })

import {
  allyTurnOver,
  attack,
  beginAlly,
  beginEnemy,
  createGame,
  distance,
  enemyStep,
  move,
  reachable,
  recover,
  missions,
  carry,
  seeded,
  size,
  type Game
} from '../src/game'

test('all floor, marks and 3D cells stay aligned and tappable after resizing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 }
  ]) {
    await page.setViewportSize(viewport)
    let metrics = { count: 0, marks: 0, error: Infinity, inaccessible: 0, minWidth: 0, minHeight: 0 }
    await expect
      .poll(async () => {
        metrics = await page.evaluate((gridSize) => {
          const field = document.querySelector<HTMLElement>('.field')!.getBoundingClientRect()
          const stage = (
            document.querySelector('.stage') as HTMLCanvasElement & { stage: import('../src/stage').Stage }
          ).stage
          const cells = [...document.querySelectorAll<HTMLButtonElement>('.cell')]
          const marks = [...document.querySelectorAll<HTMLElement>('#marks > span')]
          const point = stage.get('a')!.shadow.position.clone()
          let error = 0
          let inaccessible = 0
          let minWidth = Infinity
          let minHeight = Infinity
          cells.forEach((cell, index) => {
            const floor = cell.getBoundingClientRect(),
              mark = marks[index].getBoundingClientRect()
            const x = floor.left + floor.width / 2,
              y = floor.top + floor.height / 2
            point.set((index % gridSize) - (gridSize - 1) / 2, 0, Math.floor(index / gridSize) - (gridSize - 1) / 2)
            const projected = stage.screen(point)
            error = Math.max(
              error,
              Math.abs(x - field.left - projected.x),
              Math.abs(y - field.top - projected.y),
              Math.abs(x - mark.left - mark.width / 2),
              Math.abs(y - mark.top - mark.height / 2)
            )
            if (
              floor.left < field.left - 1 ||
              floor.right > field.right + 1 ||
              floor.top < field.top - 1 ||
              floor.bottom > field.bottom + 1 ||
              document.elementFromPoint(x, y) !== cell
            )
              inaccessible++
            minWidth = Math.min(minWidth, floor.width)
            minHeight = Math.min(minHeight, floor.height)
          })
          return { count: cells.length, marks: marks.length, error, inaccessible, minWidth, minHeight }
        }, size)
        return (
          metrics.count === size * size &&
          metrics.marks === size * size &&
          metrics.inaccessible === 0 &&
          metrics.error < 1
        )
      })
      .toBe(true)
    if (viewport.width === 390) {
      expect(metrics.minWidth).toBeGreaterThan(30)
      expect(metrics.minHeight).toBeGreaterThan(28)
    }
  }
})

/** Mirrors the reproducible policy in the browser and in Node; ?seed keeps growth rolls in lockstep. */
/** `idle` only waits each turn; `heal` false skips potions (used to force a loss). */
async function playMission(page: Page, g: Game, idle?: string, heal = true) {
  const cell = (x: number, y: number) => page.locator('.cell').nth(y * size + x)
  for (let turn = 0; turn < 25 && g.phase !== 'won' && g.phase !== 'lost'; turn++) {
    for (const u of g.units
      .filter((u) => u.side === 'ally' && u.hp > 0)
      .sort((a, b) => ['archer', 'mage', 'soldier'].indexOf(a.role) - ['archer', 'mage', 'soldier'].indexOf(b.role))) {
      await cell(u.x, u.y).click()
      if (u.id === idle) {
        await page.getByRole('button', { name: '✓ 待機', exact: true }).click()
        u.done = true
        continue
      }
      if (heal && u.hp <= u.max - 7 && g.potions > 0) {
        await page.getByRole('button', { name: '回復薬', exact: true }).click()
        recover(g, u)
        continue
      }
      const { position: p, target } = plan(g, u)
      if (p.x !== u.x || p.y !== u.y) {
        await cell(p.x, p.y).click()
        move(g, u, p.x, p.y)
      }
      if (target) {
        await cell(target.x, target.y).click()
        await page.getByRole('button', { name: '攻撃', exact: true }).click()
        attack(g, u, target)
      }
      if (g.phase === 'won') break
    }
    if (g.phase === 'ally') {
      await expect(page.getByRole('button', { name: '▶ ターン終了' })).toBeEnabled({ timeout: 30000 })
      // The page hands over by itself once every ally is spent.
      if (!allyTurnOver(g) || (await page.locator('#undo').isEnabled()))
        await page.getByRole('button', { name: '▶ ターン終了' }).click()
      beginEnemy(g)
      g.units.filter((u) => u.side === 'enemy').forEach((u) => enemyStep(g, u))
      beginAlly(g)
      await expect(page.locator('#turn')).toContainText(`味方 · ${g.turn}`, { timeout: 15000 })
    }
  }
  expect(g.phase).toBe('won')
  await expect(page.locator('#result')).toBeVisible({ timeout: 30000 })
}
for (const stage of [0, 1, 2])
  for (const width of [1280, 390])
    test(`win mission ${stage + 1} and replay ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
      await page.goto('./?seed=7')
      if (stage > 0) {
        await page.getByRole('button', { name: '任務と編成' }).click()
        await page.locator(`[data-stage="${stage}"]`).click()
      }
      await expect(page.locator('.field')).toHaveAttribute('data-mission', String(stage))
      if (stage === 2) await expect(page.getByRole('button', { name: '4,2 崩れた城壁（岩）' })).toBeVisible()
      // Music is on by default and starts with the first gesture.
      await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true')
      await page.locator('#count').click()
      await expect.poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0)
      await page.evaluate(() => {
        ;(window as any).emberSoundPlays = 0
        document.addEventListener(
          'play',
          (event) => {
            if ((event.target as HTMLAudioElement).dataset.emberVoice) (window as any).emberSoundPlays++
          },
          true
        )
      })
      const g = createGame(stage, 'balanced', undefined, seeded(7))
      await playMission(page, g)
      await expect(page.locator('#result')).toBeVisible()
      await expect(page.locator('.exp-gauge, .level-up')).toHaveCount(0)
      await expect(page.locator('#result')).toContainText(stage === 2 ? '遠征達成' : '霧が晴れた')
      expect(await page.locator('audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(true)
      expect(await page.evaluate(() => (window as any).emberSoundPlays)).toBeGreaterThan(0)
      await page.screenshot({ path: `test-results/ember-win-${stage + 1}-${width}.png` })
      await page.locator('#next').click()
      await expect(page.locator('#mission')).toContainText(missions[(stage + 1) % 3].name)
      await expect(page.locator('#count')).toHaveText(`◆ 3 / ▼ ${3 + ((stage + 1) % 3)}`)
      await page.getByRole('button', { name: '再プレイ', exact: true }).click()
      await expect(page.locator('#count')).toHaveText(`◆ 3 / ▼ ${3 + ((stage + 1) % 3)}`)
    })

test('restart cancels an in-flight enemy turn', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '▶ ターン終了' }).click()
  await page.getByRole('button', { name: '再プレイ', exact: true }).click()
  await page.waitForTimeout(1600)
  await expect(page.locator('#turn')).toContainText('味方 · 1')
  await expect(page.getByRole('button', { name: /2,5 燈守リオ HP 16/ })).toBeVisible()
  expect(await page.locator('.selected').count()).toBe(0)
})

for (const width of [1280, 390])
  test(`two-cell walk stays visible through its full presentation ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    await page.goto('./')
    await page.getByRole('button', { name: /2,5 燈守/ }).tap()
    const started = Date.now()
    await page.getByRole('button', { name: /4,5 平地 移動可能/ }).tap()
    // The 3D stage reports its active presentation tracks.
    await expect(page.locator('.stage')).toHaveAttribute('data-motion', 'walk')
    await expect(page.locator('.stage')).toHaveAttribute('data-motion', '')
    expect(Date.now() - started).toBeGreaterThan(350)
    await expect(page.getByRole('button', { name: /4,5 燈守/ })).toBeEnabled()
  })

test('guard formation and mission selection are available without leaving the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: '任務と編成' }).click()
  await page.getByRole('radio', { name: /守備隊/ }).check()
  await page.locator('[data-stage="1"]').click()
  await page.getByRole('button', { name: /2,5 燈守リオ HP 20/ }).tap()
  await expect(page.locator('#selection')).toContainText('◇ 2')
  await expect(page.locator('#count')).toHaveText('◆ 3 / ▼ 4')
  await page.screenshot({ path: 'test-results/ember-guard-390.png' })
})

for (const width of [1280, 390])
  test(`attack range, enemy preview, ally pass-through and automatic turn end ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    await page.goto('./')
    await page.getByRole('button', { name: /2,5 燈守/ }).tap()
    await expect(page.locator('.cell.legal').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^6,5 平地 攻撃範囲/ })).toBeVisible()
    expect(await page.locator('.cell.legal.reach').count()).toBe(0)
    await page.screenshot({ path: `test-results/ember-range-${width}.png` })
    await page.getByRole('button', { name: '✓ 待機', exact: true }).click()
    if (width === 1280) {
      await page.getByRole('button', { name: /7,4 灰牙/ }).hover()
      await expect(page.locator('.cell.enemy-move').first()).toBeVisible()
      await expect(page.locator('.cell.reach').first()).toBeVisible()
      await page.screenshot({ path: `test-results/ember-enemy-range-${width}.png` })
    }
    // Neri walks through Rio and Mina to (2,7), passing their cells.
    await page.getByRole('button', { name: /2,4 風読み/ }).tap()
    await page.getByRole('button', { name: /2,7 平地 移動可能/ }).tap()
    await expect(page.getByRole('button', { name: /2,7 風読み/ })).toBeVisible()
    await page.getByRole('button', { name: '✓ 待機', exact: true }).click()
    await expect(page.locator('#turn')).toContainText('味方 · 1')
    await page.getByRole('button', { name: /2,6 星織/ }).tap()
    await page.getByRole('button', { name: '✓ 待機', exact: true }).click()
    await expect(page.locator('#turn')).toContainText('敵')
    await expect(page.locator('#turn')).toContainText('味方 · 2', { timeout: 15000 })
  })

test('chapter report, level up and carried growth across the expedition', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./?seed=7')
  const levelUp = page
    .locator('.level-up .up')
    .first()
    .waitFor({ timeout: 110000 })
    .then(async () => {
      await expect(page.locator('.level-up')).toContainText('LEVEL UP!')
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'test-results/ember-levelup-1280.png' })
    })
  const first = createGame(0, 'balanced', undefined, seeded(7))
  await playMission(page, first)
  const report = page.locator('#report')
  await expect(report).toBeVisible()
  await expect(page.locator('.exp-gauge, .level-up')).toHaveCount(0)
  await expect(report).toContainText('CHAPTER 1 CLEAR')
  await expect(report).toContainText(`ターン${first.turn}`)
  await expect(report.locator('.mvp')).toHaveCount(1)
  for (const u of first.units.filter((u) => u.side === 'ally'))
    await expect(report.locator('li', { hasText: u.name })).toContainText(`Lv ${u.level}`)
  await expect(report).toContainText(`+${first.units[2].gained} EXP`)
  await page.screenshot({ path: 'test-results/ember-chapter-1280.png' })
  await page.locator('#next').click()
  const second = createGame(1, 'balanced', carry(first), seeded(7))
  await page.getByRole('button', { name: /星織ミナ/ }).click()
  await expect(page.locator('#selection')).toContainText(
    `星織ミナ Lv${second.units[2].level} EXP ${second.units[2].exp}　♥ ${second.units[2].max}/`
  )
  await playMission(page, second)
  await levelUp
  await expect(report).toBeVisible()
  expect(second.units.some((u) => u.level > 1)).toBe(true)
  await expect(report).toContainText('▲')
  await page.locator('#next').click()
  await page.getByRole('button', { name: '任務と編成' }).click()
  await expect(page.locator('[data-stage="2"]')).toContainText('到達時の記録')
  await expect(page.locator('[data-stage="0"]')).toContainText('開始 Lv 1 / 1 / 1')
  await page.screenshot({ path: 'test-results/ember-missions-1280.png' })
  // Replaying a mission restores the party as it was when the mission was reached.
  await page.locator('[data-stage="2"]').click()
  await page.getByRole('button', { name: '再プレイ', exact: true }).click()
  const third = createGame(2, 'balanced', carry(second))
  await page.getByRole('button', { name: /風読みネリ/ }).click()
  await expect(page.locator('#selection')).toContainText(
    `風読みネリ Lv${third.units[1].level} EXP ${third.units[1].exp}`
  )
})

test('an ally who falls in a won mission leaves the expedition until its record is replayed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./?seed=7')
  const farewell = page
    .locator('.farewell')
    .waitFor({ timeout: 110000 })
    .then(async () => {
      await expect(page.locator('.farewell')).toContainText('燈守リオは倒れた…')
      await page.screenshot({ path: 'test-results/ember-farewell-1280.png' })
    })
  // Neri only waits and nobody heals, so Rio falls; Neri and Mina still win.
  const first = createGame(0, 'balanced', undefined, seeded(7))
  await playMission(page, first, 'b', false)
  await farewell
  expect(first.units[0].hp).toBe(0)
  const report = page.locator('#report')
  await expect(report).toBeVisible()
  const rio = report.locator('li', { hasText: '燈守リオ' })
  await expect(rio).toHaveClass(/fallen/)
  await expect(rio).toContainText('離脱')
  await expect(rio).toContainText('獲得EXPなし')
  await expect(report.locator('.mvp')).not.toContainText('燈守リオ')
  await page.screenshot({ path: 'test-results/ember-lost-chapter-1280.png' })
  await page.locator('#next').click()
  await expect(page.locator('#count')).toHaveText('◆ 2 / ▼ 4')
  await expect(page.locator('#log')).toContainText('離脱 燈守リオ')
  await expect(page.getByRole('button', { name: /燈守リオ/ })).toHaveCount(0)
  // Replay keeps the mission record (Rio stays lost); an earlier mission brings Rio back.
  await page.getByRole('button', { name: '再プレイ', exact: true }).click()
  await expect(page.locator('#count')).toHaveText('◆ 2 / ▼ 4')
  await page.getByRole('button', { name: '任務と編成' }).click()
  await expect(page.locator('[data-stage="1"]')).toContainText('離脱 燈守リオ')
  await expect(page.locator('[data-stage="0"]')).toContainText('出撃 燈守リオ')
  await page.screenshot({ path: 'test-results/ember-lost-missions-1280.png' })
  await page.locator('[data-stage="0"]').click()
  await expect(page.locator('#count')).toHaveText('◆ 3 / ▼ 3')
})
