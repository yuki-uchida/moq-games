import { expect, test, type Page } from '@playwright/test'
import { cameraSettled, clickCell, enterBattle } from './shell-helper'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    setInterval(
      () => document.querySelector<HTMLButtonElement>('.story-overlay button, .story-credits button')?.click(),
      100
    )
  })
})

const cell = (page: Page, x: number, y: number) => page.getByRole('button', { name: new RegExp(`^${x},${y} `) })

async function start(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport)
  await enterBattle(page, './?seed=7')
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await cameraSettled(page)
}

/** The enemy farthest from 2,4 and an empty, passable square far from it (1-based, as in the cell labels). */
async function farTargets(page: Page) {
  return page.evaluate(() => {
    const game = (
      document.querySelector('.stage') as HTMLCanvasElement & {
        stage: { last: { game: import('../src/game').Game } }
      }
    ).stage.last.game
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
    const origin = { x: 1, y: 3 }
    const enemy = game.units
      .filter((u) => u.side === 'enemy' && u.hp > 0)
      .sort((a, b) => dist(b, origin) - dist(a, origin))[0]
    let empty = { x: 0, y: 0 }
    let best = -1
    for (let x = 0; x < 10; x++)
      for (let y = 0; y < 8; y++) {
        if (game.rocks.has(`${x},${y}`) || game.units.some((u) => u.hp > 0 && u.x === x && u.y === y)) continue
        const d = dist({ x, y }, origin)
        const el = [...document.querySelectorAll<HTMLElement>('.cell')].find((c) =>
          c.getAttribute('aria-label')?.startsWith(`${x + 1},${y + 1} `)
        )
        const r = el?.getBoundingClientRect()
        const hit = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        if (d > best && d > 4 && el && hit && el.contains(hit)) {
          best = d
          empty = { x, y }
        }
      }
    return { enemy: { x: enemy.x + 1, y: enemy.y + 1 }, empty: { x: empty.x + 1, y: empty.y + 1 } }
  })
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 844, height: 390 }
]) {
  test(`toast, enemy inspection and deselect at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await start(page, viewport)
    const { enemy, empty } = await farTargets(page)
    await cell(page, 2, 4).click()
    await cell(page, enemy.x, enemy.y).click()
    await expect(page.locator('#toast')).toBeVisible()
    await expect(page.locator('#toast')).toContainText('射程外')
    await page.screenshot({ path: info.outputPath('toast.png') })
    await expect(page.locator('#selection')).not.toBeEmpty()
    await expect(page.locator('.cell.enemy-move').first()).toBeAttached()
    await cell(page, 2, 4).click()
    await expect(page.locator('.cell.legal').first()).toBeAttached()
    await cell(page, empty.x, empty.y).click()
    await expect(page.locator('#toast')).toContainText('選択を解除')
    await expect(page.locator('.cell.legal')).toHaveCount(0)
  })
}

test('an ally that moved and was deselected can still undo (390x844)', async ({ page }, info) => {
  await start(page, { width: 390, height: 844 })
  const { enemy } = await farTargets(page)
  await cell(page, 2, 4).click()
  await cell(page, 4, 4).click()
  await expect(page.locator('#undo')).toBeEnabled()
  await cell(page, enemy.x, enemy.y).click()
  await expect(page.locator('#toast')).toBeVisible()
  await page.screenshot({ path: info.outputPath('inspected-enemy.png') })
  await cell(page, 4, 4).click()
  await expect(page.locator('#undo')).toBeEnabled()
})

for (const viewport of [
  { width: 480, height: 320 },
  { width: 568, height: 320 }
])
  test(`the forecast keeps its target visible at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await start(page, viewport)
    await cell(page, 2, 4).click()
    await cell(page, 4, 4).click()
    await expect(page.locator('#undo')).toBeEnabled()
    await cell(page, 7, 4).click()
    await expect(page.locator('#confirm')).toBeInViewport({ ratio: 0.99 })
    await expect(page.locator('#cancel-forecast')).toBeInViewport({ ratio: 0.99 })
    const visible = await cell(page, 7, 4).evaluate((target) => {
      const r = target.getBoundingClientRect()
      const x = r.x + r.width / 2
      const y = r.y + r.height / 2
      const hit = document.elementFromPoint(x, y)
      return y >= 0 && y <= innerHeight && !!hit && target.contains(hit)
    })
    expect(visible).toBe(true)
    await page.screenshot({ path: info.outputPath('forecast.png') })
  })

test('the potion button keeps its name in landscape (844x390)', async ({ page }) => {
  await start(page, { width: 844, height: 390 })
  await expect(page.locator('#recover')).toContainText('薬')
})

async function enableTouchAssist(page: Page) {
  await page.getByRole('button', { name: 'タッチ選択補助' }).tap()
}

for (const viewport of [
  { width: 480, height: 320 },
  { width: 568, height: 320 }
])
  test(`the touch chooser opens on screen from an enemy and from an ally at ${viewport.width}x${viewport.height}`, async ({
    page
  }, info) => {
    await start(page, viewport)
    await enableTouchAssist(page)
    const dialog = page.getByRole('dialog', { name: 'マスを選択' })
    for (const [name, shot] of [
      [/7,4 灰牙/, 'chooser-enemy.png'],
      [/2,4 風読み/, 'chooser-ally.png']
    ] as const) {
      await page.getByRole('button', { name }).tap()
      await expect(dialog).toBeVisible()
      const height = await page.evaluate(() => window.innerHeight)
      const buttons = await dialog.getByRole('button').all()
      expect(buttons.length).toBeGreaterThan(2)
      for (const button of buttons) {
        const box = (await button.boundingBox())!
        expect(box.y).toBeGreaterThanOrEqual(0)
        expect(box.y + box.height).toBeLessThanOrEqual(height + 0.5)
      }
      await page.screenshot({ path: info.outputPath(shot) })
      await dialog.getByRole('button', { name: '閉じる' }).tap()
      await expect(dialog).not.toBeVisible()
    }
  })

for (const viewport of [
  { width: 480, height: 320 },
  { width: 568, height: 320 }
])
  test(`the toast stays visible after scrolling at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await start(page, viewport)
    const { enemy } = await farTargets(page)
    await cell(page, 2, 4).click()
    await page.evaluate(() => window.scrollBy(0, 160))
    await clickCell(page, cell(page, enemy.x, enemy.y))
    const toast = page.locator('#toast')
    await expect(toast).toContainText('射程外')
    const box = (await toast.boundingBox())!
    const height = await page.evaluate(() => window.innerHeight)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(height)
    await page.screenshot({ path: info.outputPath('toast-scrolled.png') })
  })

test('the chooser outlines the squares it offers (390x844)', async ({ page }, info) => {
  await start(page, { width: 390, height: 844 })
  await enableTouchAssist(page)
  await page.getByRole('button', { name: /2,4 風読み/ }).tap()
  await expect(page.getByRole('dialog', { name: 'マスを選択' })).toBeVisible()
  await expect(page.locator('.cell.touch-origin')).toHaveCount(1)
  expect(await page.locator('.cell.touch-near').count()).toBeGreaterThan(2)
  await page.screenshot({ path: info.outputPath('chooser-highlight.png') })
  await page.getByRole('button', { name: '閉じる' }).tap()
  await expect(page.locator('.cell.touch-origin')).toHaveCount(0)
  await expect(page.locator('.cell.touch-near')).toHaveCount(0)
})

test('a lethal hit shows the same number in the forecast and the popup', async ({ page }, info) => {
  await start(page, { width: 844, height: 390 })
  await cell(page, 2, 4).click()
  await cell(page, 4, 4).click()
  await expect(page.locator('#undo')).toBeEnabled()
  await page.evaluate(() => {
    const game = (
      document.querySelector('.stage') as HTMLCanvasElement & {
        stage: { last: { game: import('../src/game').Game } }
      }
    ).stage.last.game
    game.units.find((u) => u.name === '灰牙')!.hp = 2
  })
  await cell(page, 7, 4).click()
  await expect(page.locator('#forecast')).toContainText('−8')
  await page.evaluate(() => {
    const w = window as unknown as { popups: string[] }
    w.popups = []
    new MutationObserver(() => {
      document.querySelectorAll('.damage-number').forEach((n) => {
        if (n.textContent && !w.popups.includes(n.textContent)) w.popups.push(n.textContent)
      })
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
  })
  await page.locator('#confirm').click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { popups: string[] }).popups[0]), { timeout: 30000 })
    .toMatch(/^−8/)
})

for (const viewport of [
  { width: 480, height: 320 },
  { width: 568, height: 320 }
])
  test(`the enemy turn plays with the battlefield in view after scrolling to End Turn at ${viewport.width}x${viewport.height}`, async ({
    page
  }, info) => {
    await start(page, viewport)
    await page.locator('#end').scrollIntoViewIfNeeded()
    await page.locator('#end').tap()
    await expect(page.locator('#actor')).toBeVisible({ timeout: 30000 })
    const field = (await page.locator('.field').boundingBox())!
    expect(field.y).toBeGreaterThanOrEqual(-1)
    expect(field.y + field.height).toBeLessThanOrEqual(320 + 1)
    await expect(page.locator('#actor')).toBeInViewport()
    await page.screenshot({ path: info.outputPath('enemy-turn.png') })
    await expect(page.locator('#turn')).toContainText('ターン 2 · 味方', { timeout: 30000 })
  })

const inViewport = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)!.getBoundingClientRect()
    return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0
  }, selector)

for (const viewport of [
  { width: 568, height: 320 },
  { width: 600, height: 320 },
  { width: 640, height: 360 },
  { width: 640, height: 320 },
  { width: 844, height: 390 }
]) {
  test(`side column never covers the status bar at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await start(page, viewport)
    await cell(page, 2, 4).click()
    await expect(page.locator('#selection')).not.toBeEmpty()
    await page.screenshot({ path: info.outputPath('side-column.png') })
    const result = await page.evaluate(() => {
      const status = document.querySelector('.status')!.getBoundingClientRect()
      const consoleTop = document.querySelector('.console')!.getBoundingClientRect().top
      const covered: string[] = []
      for (const id of ['mission', 'turn', 'count', 'objective', 'end']) {
        const el = document.querySelector(`#${id}`)
        if (!el) {
          covered.push(`${id}: missing`)
          continue
        }
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        const inside = r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth
        if (!hit || !el.contains(hit) || !inside) covered.push(id)
      }
      return { statusBottom: status.bottom, consoleTop, covered }
    })
    expect(result.statusBottom).toBeLessThanOrEqual(result.consoleTop + 1)
    expect(result.covered).toEqual([])
  })
}

for (const viewport of [
  { width: 480, height: 320 },
  { width: 568, height: 320 }
])
  test(`first-time tutorial stays visible with the board at ${viewport.width}x${viewport.height}`, async ({
    page
  }, info) => {
    await page.setViewportSize(viewport)
    await page.goto('./?seed=7')
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: '✦ はじめから' }).click()
    await page.getByRole('button', { name: '⚔ クラシック' }).click()
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await cameraSettled(page)
    const tutorial = page.locator('#tutorial')
    await expect(tutorial).toContainText('味方を選ぼう')
    await page.screenshot({ path: info.outputPath('tutorial-start.png') })
    expect(await inViewport(page, '#tutorial')).toBe(true)
    await expect(tutorial.getByRole('button', { name: /スキップ/ })).toBeInViewport({ ratio: 1 })
    const ratio = await page.evaluate(() => {
      const r = document.querySelector('.field')!.getBoundingClientRect()
      const visible = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))
      return visible / r.height
    })
    expect(ratio).toBeGreaterThanOrEqual(0.8)
    await cell(page, 2, 4).click()
    await expect(tutorial).toContainText('移動可能')
    await page.screenshot({ path: info.outputPath('tutorial-selected.png') })
    expect(await inViewport(page, '#tutorial')).toBe(true)
    const reachable = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.cell.legal')].some((c) => {
        const r = c.getBoundingClientRect()
        const x = r.x + r.width / 2
        const y = r.y + r.height / 2
        const hit = document.elementFromPoint(x, y)
        return x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight && !!hit && c.contains(hit)
      })
    )
    expect(reachable).toBe(true)
  })

for (const viewport of [
  { width: 844, height: 390 },
  { width: 640, height: 360 }
]) {
  test(`touch chooser text is not clipped at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await start(page, viewport)
    await page.getByRole('button', { name: 'タッチ選択補助' }).tap()
    await cell(page, 2, 4).tap()
    const dialog = page.getByRole('dialog', { name: 'マスを選択' })
    await expect(dialog).toBeVisible()
    await page.screenshot({ path: info.outputPath('chooser.png') })
    const boxes = await dialog.evaluate((root) => {
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      }
      const choices = [...root.querySelectorAll<HTMLButtonElement>(':scope > div button')]
      return {
        choices: choices.map((b) => ({
          ...rect(b),
          clippedY: b.scrollHeight > b.clientHeight + 1,
          clippedX: b.scrollWidth > b.clientWidth + 1,
          inside: b.getBoundingClientRect().bottom <= innerHeight && b.getBoundingClientRect().right <= innerWidth
        })),
        close: rect(root.querySelector('#touch-cancel')!)
      }
    })
    expect(boxes.choices.length).toBeGreaterThan(0)
    const c = boxes.close
    for (const b of boxes.choices) {
      expect(b.clippedY).toBe(false)
      expect(b.clippedX).toBe(false)
      expect(b.w).toBeGreaterThanOrEqual(44)
      expect(b.h).toBeGreaterThanOrEqual(44)
      expect(b.inside && b.x >= 0 && b.y >= 0).toBe(true)
      const apart = b.x + b.w <= c.x + 1 || c.x + c.w <= b.x + 1 || b.y + b.h <= c.y + 1 || c.y + c.h <= b.y + 1
      expect(apart).toBe(true)
    }
  })
}

test('no discard warning after a defeat when picking a mission', async ({ page }) => {
  await enterBattle(page, './?seed=7')
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.evaluate(() => {
    const game = (
      document.querySelector('.stage') as HTMLCanvasElement & {
        stage: { last: { game: import('../src/game').Game } }
      }
    ).stage.last.game
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
  await page.locator('#retry-missions').click()
  await page.locator('[data-stage="0"]').click()
  await expect(page.getByRole('button', { name: '↻ 破棄して続ける' })).toHaveCount(0)
  await expect(page.locator('#turn')).toContainText('ターン 1 · 味方')
})

test('the potion button names the remaining count (390x844)', async ({ page }) => {
  await start(page, { width: 390, height: 844 })
  await expect(page.getByRole('button', { name: '回復薬 残り2' })).toBeVisible()
  await page.evaluate(() => {
    const game = (
      document.querySelector('.stage') as HTMLCanvasElement & {
        stage: { last: { game: import('../src/game').Game } }
      }
    ).stage.last.game
    const ally = game.units.find((u) => u.side === 'ally' && u.x === 1 && u.y === 3)!
    ally.hp = Math.max(1, ally.hp - 3)
  })
  await cell(page, 2, 4).click()
  await page.getByRole('button', { name: '回復薬 残り2' }).click()
  await expect(page.getByRole('button', { name: '回復薬 残り1' })).toBeAttached()
})

for (const viewport of [
  { width: 480, height: 320 },
  { width: 568, height: 320 }
])
  test(`the status bar stays readable while scrolling and in the enemy turn at ${viewport.width}x${viewport.height}`, async ({
    page
  }) => {
    await start(page, viewport)
    const uncovered = (selector: string) =>
      page.locator(selector).evaluate((element) => {
        const r = element.getBoundingClientRect()
        const x = r.x + r.width / 2
        const y = r.y + r.height / 2
        const hit = (() => {
          const previous = element.style.pointerEvents
          element.style.pointerEvents = 'auto'
          const found = document.elementFromPoint(x, y)
          element.style.pointerEvents = previous
          return found
        })()
        return r.top >= 0 && r.bottom <= innerHeight && !!hit && element.contains(hit)
      })
    await page.locator('#end').scrollIntoViewIfNeeded()
    for (const id of ['#turn', '#count', '#objective', '#end']) expect(await uncovered(id)).toBe(true)
    await page.locator('#end').tap()
    await expect(page.locator('#fast')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('#actor')).toBeVisible({ timeout: 30000 })
    for (const id of ['#turn', '#fast', '#actor']) expect(await uncovered(id)).toBe(true)
  })

for (const viewport of [
  { width: 320, height: 568 },
  { width: 640, height: 320 },
  { width: 568, height: 320 }
]) {
  test(`the chapter report keeps its next button in view at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await start(page, viewport)
    const spots = await page.evaluate(() => {
      const game = (
        document.querySelector('.stage') as HTMLCanvasElement & {
          stage: { last: { game: import('../src/game').Game } }
        }
      ).stage.last.game
      const allies = game.units.filter((u) => u.side === 'ally')
      const enemies = game.units.filter((u) => u.side === 'enemy')
      enemies.forEach((e) => (e.hp = 0))
      Object.assign(enemies[0], { hp: 1, x: allies[1].x + 1, y: allies[1].y })
      game.rocks.delete(`${enemies[0].x},${enemies[0].y}`)
      game.groves.delete(`${enemies[0].x},${enemies[0].y}`)
      return { ally: allies[1].y * 10 + allies[1].x, enemy: enemies[0].y * 10 + enemies[0].x }
    })
    await page.locator('.cell').nth(spots.ally).dispatchEvent('click')
    await page.locator('.cell').nth(spots.enemy).dispatchEvent('click')
    await page.locator('#confirm').dispatchEvent('click')
    await expect(page.locator('#result')).toContainText('CHAPTER 1 CLEAR', { timeout: 60000 })
    await expect(page.locator('#next')).toBeInViewport({ ratio: 0.99 })
    // Each stat keeps its label and number on one line.
    for (const stat of await page.locator('.report-stats span').all()) {
      const box = (await stat.boundingBox())!
      expect(box.height).toBeLessThan(24)
    }
    if (viewport.width === 320) {
      // Stacked layouts give the result the console's room.
      await expect(page.locator('.console')).toBeHidden()
      await expect(page.locator('.chapter-units li').first()).toBeInViewport({ ratio: 0.99 })
    }
    const next = (await page.locator('#next').boundingBox())!
    const covered = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('#next') !== null, {
      x: next.x + next.width / 2,
      y: next.y + next.height / 2
    })
    expect(covered).toBe(true)
  })
}

for (const viewport of [
  { width: 568, height: 320 },
  { width: 640, height: 320 }
]) {
  test(`the title menu fits and covers the battle UI at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.addInitScript(() => {
      localStorage.setItem(
        'ember-grid:save:v1',
        JSON.stringify({
          version: 1,
          difficulty: 'classic',
          formation: 'balanced',
          checkpoints: [],
          furthest: 2,
          cleared: [0, 1],
          bestTurns: { 0: 4, 1: 5 }
        })
      )
    })
    await page.goto('./?seed=7')
    const entries = page.locator('.title-content nav > *')
    await expect(entries).toHaveCount(5)
    for (const entry of await entries.all()) await expect(entry).toBeInViewport({ ratio: 0.99 })
    const status = (await page.locator('.status').boundingBox())!
    const onTop = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('.title-screen') !== null,
      { x: status.x + 20, y: status.y + status.height / 2 }
    )
    expect(onTop).toBe(true)
  })
}

for (const viewport of [
  { width: 568, height: 320 },
  { width: 320, height: 568 }
]) {
  test(`dialogs keep their title and way out in view at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await start(page, viewport)
    await page.getByRole('button', { name: /2,4 風読み/ }).dispatchEvent('click')
    await page.getByRole('button', { name: 'ユニット詳細' }).click()
    await expect(page.locator('#detail-title')).toBeInViewport({ ratio: 0.99 })
    await expect(page.locator('#detail-close')).toBeInViewport({ ratio: 0.99 })
    await page.locator('#detail-close').click()
    await page.getByRole('button', { name: '遊び方' }).click()
    await expect(page.locator('#help-close')).toBeInViewport({ ratio: 0.99 })
    await page.keyboard.press('End')
    await expect(page.getByRole('tab').last()).toBeInViewport({ ratio: 0.99 })
    await page.locator('#help-close').click()
    await page.getByRole('button', { name: '任務と編成' }).click()
    await expect(page.locator('#cancel-mission')).toBeInViewport({ ratio: 0.99 })
    await page.locator('#cancel-mission').click()
    await expect(page.locator('#expedition')).toBeHidden()
  })
}

/** Leaves one enemy at 1 HP beside the second ally, so a single attack decides the chapter. */
async function rigLastEnemy(page: Page) {
  return page.evaluate(() => {
    const game = (
      document.querySelector('.stage') as HTMLCanvasElement & {
        stage: { last: { game: import('../src/game').Game } }
      }
    ).stage.last.game
    const allies = game.units.filter((u) => u.side === 'ally')
    const enemies = game.units.filter((u) => u.side === 'enemy')
    enemies.forEach((e) => (e.hp = 0))
    Object.assign(enemies[0], { hp: 1, x: allies[1].x + 1, y: allies[1].y })
    game.rocks.delete(`${enemies[0].x},${enemies[0].y}`)
    game.groves.delete(`${enemies[0].x},${enemies[0].y}`)
    return { ally: allies[1].y * 10 + allies[1].x, enemy: enemies[0].y * 10 + enemies[0].x }
  })
}
const uncoveredIn = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => {
    const r = element.getBoundingClientRect()
    const x = r.x + r.width / 2
    const y = r.y + r.height / 2
    const hit = (() => {
      const previous = element.style.pointerEvents
      element.style.pointerEvents = 'auto'
      const found = document.elementFromPoint(x, y)
      element.style.pointerEvents = previous
      return found
    })()
    return r.top >= 0 && r.bottom <= innerHeight && r.width > 0 && !!hit && element.contains(hit)
  })

for (const viewport of [
  { width: 568, height: 320 },
  { width: 320, height: 568 }
])
  test(`the tutorial ends with the battle at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    page.on('dialog', (dialog) => void dialog.accept())
    await page.goto('./?seed=7')
    await page.getByRole('button', { name: '✦ はじめから' }).click()
    await page.getByRole('button', { name: '⚔ クラシック' }).click()
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await expect(page.locator('#tutorial')).toBeVisible()
    // Defeat: every ally at 1 HP next to an enemy.
    await page.evaluate(() => {
      const game = (
        document.querySelector('.stage') as HTMLCanvasElement & {
          stage: { last: { game: import('../src/game').Game } }
        }
      ).stage.last.game
      const allies = game.units.filter((u) => u.side === 'ally')
      const foes = game.units.filter((u) => u.side === 'enemy')
      allies.forEach((a, i) => Object.assign(a, { hp: 1, x: i * 2, y: 0 }))
      foes.forEach((f, i) => Object.assign(f, { x: (i % allies.length) * 2, y: 1 }))
      for (let x = 0; x < 6; x++) for (const y of [0, 1]) game.rocks.delete(`${x},${y}`)
    })
    for (let turn = 0; turn < 6 && !(await page.locator('#result').isVisible()); turn++) {
      await page.getByRole('button', { name: /▶ ターン終了/ }).click()
      await expect(page.locator('#end'))
        .toBeEnabled({ timeout: 30000 })
        .catch(() => {})
    }
    await expect(page.locator('#result')).toContainText('燈は消えた', { timeout: 30000 })
    await expect(page.locator('#result')).toBeVisible()
    await expect(page.locator('#retry')).toBeInViewport({ ratio: 0.99 })
    await expect(page.locator('#tutorial')).toBeHidden()
    await expect(page.locator('.tutorial-target')).toHaveCount(0)
    for (const id of ['#outcome', '#retry', '#retry-missions']) expect(await uncoveredIn(page, id)).toBe(true)
    // Retrying chapter one brings the unfinished guidance back.
    await page.locator('#retry').click()
    await expect(page.locator('#tutorial')).toBeVisible({ timeout: 30000 })
  })

for (const viewport of [
  { width: 480, height: 320 },
  { width: 568, height: 320 }
])
  test(`a victory through the forecast shows its heading and next button at ${viewport.width}x${viewport.height}`, async ({
    page
  }) => {
    await start(page, viewport)
    const spots = await rigLastEnemy(page)
    await page.locator('.cell').nth(spots.ally).dispatchEvent('click')
    await page.evaluate(() => window.scrollBy(0, 120))
    await page.locator('.cell').nth(spots.enemy).dispatchEvent('click')
    await expect(page.locator('#forecast')).toBeVisible()
    await page.locator('#confirm').click()
    await expect(page.locator('#result')).toBeVisible({ timeout: 60000 })
    await expect(page.locator('#outcome')).toContainText('霧が晴れた')
    await expect(page.locator('#next')).toBeInViewport({ ratio: 0.99 })
    for (const id of ['#outcome', '#next']) expect(await uncoveredIn(page, id)).toBe(true)
  })

test('a vertical swipe on the board scrolls the small page to the actions (480x320)', async ({ page, context }) => {
  await start(page, { width: 480, height: 320 })
  await page.evaluate(() => window.scrollTo(0, 0))
  const field = (await page.locator('.field').boundingBox())!
  const x = Math.round(field.x + field.width / 2)
  const y = Math.round(field.y + field.height * 0.6)
  const client = await context.newCDPSession(page)
  // The swipes start on the board itself, as a player reaching for the actions below it would.
  const swipeUp = async () => {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let step = 1; step <= 12; step++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: Math.max(1, y - step * 15) }]
      })
      await page.waitForTimeout(16)
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await swipeUp()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100)
  await swipeUp()
  await expect(page.locator('#end')).toBeInViewport()
})

for (const viewport of [
  { width: 360, height: 320 },
  { width: 480, height: 320 },
  { width: 520, height: 320 }
])
  test(`the first-time tutorial never covers the status bar at ${viewport.width}x${viewport.height}`, async ({
    page
  }) => {
    await page.setViewportSize(viewport)
    page.on('dialog', (dialog) => void dialog.accept())
    await page.goto('./?seed=7')
    await page.getByRole('button', { name: '✦ はじめから' }).click()
    await page.getByRole('button', { name: '⚔ クラシック' }).click()
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await expect(page.locator('#tutorial')).toContainText('味方を選ぼう')
    const status = (await page.locator('.status').boundingBox())!
    const tutorial = (await page.locator('#tutorial').boundingBox())!
    expect(tutorial.y).toBeGreaterThanOrEqual(status.y + status.height - 1)
    for (const id of ['#turn', '#count', '#objective']) expect(await uncoveredIn(page, id)).toBe(true)
    await expect(page.locator('#tutorial').getByRole('button', { name: 'スキップ' })).toBeInViewport({ ratio: 1 })
  })

for (const viewport of [
  { width: 560, height: 320 },
  { width: 568, height: 320 }
])
  test(`a long objective keeps the stats and touch assist clear at ${viewport.width}x${viewport.height}`, async ({
    page
  }) => {
    await page.setViewportSize(viewport)
    await enterBattle(page, './?seed=7', true)
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await page.getByRole('button', { name: '任務と編成' }).click()
    await page.locator('[data-stage="4"]').click()
    const discard = page.getByRole('button', { name: '↻ 破棄して続ける' })
    if (await discard.isVisible().catch(() => false)) await discard.click()
    await expect(page.locator('#objective')).toContainText('残り6ターン', { timeout: 90000 })
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    const status = (await page.locator('.status').boundingBox())!
    // Two rows, the objective possibly on two lines; never the three-row status that pushed the console under the actions.
    expect(status.height).toBeLessThan(60)
    const ally = await page.evaluate(() => {
      const game = (
        document.querySelector('.stage') as HTMLCanvasElement & {
          stage: { last: { game: import('../src/game').Game } }
        }
      ).stage.last.game
      const unit = game.units.find((u) => u.side === 'ally' && u.hp > 0)!
      return unit.y * 10 + unit.x
    })
    await page.locator('.cell').nth(ally).dispatchEvent('click')
    for (const id of ['#selection .uc-stats', '#touch-assist', '#detail-button', '#end'])
      expect(await uncoveredIn(page, id)).toBe(true)
    await page.locator('#touch-assist').tap()
    await expect(page.locator('#touch-assist')).toHaveAttribute('aria-pressed', 'true')
  })

test('the undo hint only appears while the move can still be taken back', async ({ page }) => {
  await start(page, { width: 1280, height: 800 })
  const guide = page.locator('#guide')
  await cell(page, 2, 5).click()
  await cell(page, 3, 5).click()
  await expect(page.locator('#undo')).toBeEnabled({ timeout: 30000 })
  await expect(guide).toContainText('戻す')
  // Selecting another ally drops the first one's undo record.
  await cell(page, 2, 4).click()
  await cell(page, 3, 5).click()
  await expect(page.locator('#undo')).toBeDisabled()
  await expect(guide).not.toContainText('戻す')
  // So does Escape.
  await cell(page, 2, 4).click()
  await cell(page, 3, 4).click()
  await expect(page.locator('#undo')).toBeEnabled({ timeout: 30000 })
  await page.keyboard.press('Escape')
  await cell(page, 3, 4).click()
  await expect(page.locator('#undo')).toBeDisabled()
  await expect(guide).not.toContainText('戻す')
})

for (const viewport of [
  { width: 568, height: 320 },
  { width: 640, height: 320 }
])
  test(`the side column keeps its guide and info buttons clear in the enemy turn at ${viewport.width}x${viewport.height}`, async ({
    page
  }) => {
    await start(page, viewport)
    await page.locator('#end').click()
    await expect(page.locator('#fast')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('#actor')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('.console > nav')).toBeHidden()
    for (const id of ['#fast', '#guide', '#detail-button', '#touch-assist'])
      expect(await uncoveredIn(page, id)).toBe(true)
    await expect(page.locator('#turn')).toContainText('ターン 2 · 味方', { timeout: 30000 })
    await expect(page.locator('#end')).toBeVisible()
  })

for (const viewport of [
  { width: 568, height: 320 },
  { width: 1280, height: 800 }
])
  test(`the title screen does not scroll into empty space at ${viewport.width}x${viewport.height}`, async ({
    page
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('./?seed=7')
    await expect(page.locator('.title-screen')).toBeVisible()
    const overflow = await page
      .locator('.title-screen')
      .evaluate((title) => [title.scrollHeight - title.clientHeight, title.scrollWidth - title.clientWidth])
    expect(overflow[0]).toBeLessThanOrEqual(1)
    expect(overflow[1]).toBeLessThanOrEqual(1)
  })

for (const width of [560, 568, 580])
  test(`chapter five keeps the enemy count and the objective apart at ${width}x320`, async ({ page }) => {
    await page.setViewportSize({ width, height: 320 })
    await enterBattle(page, './?seed=7', true)
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await page.getByRole('button', { name: '任務と編成' }).click()
    await page.locator('[data-stage="4"]').click()
    const discard = page.getByRole('button', { name: '↻ 破棄して続ける' })
    if (await discard.isVisible().catch(() => false)) await discard.click()
    await expect(page.locator('#objective')).toContainText('残り6ターン', { timeout: 90000 })
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    const count = (await page.locator('#count').boundingBox())!
    const objective = (await page.locator('#objective').boundingBox())!
    // Same row: the objective must start after the count ends.
    expect(objective.x).toBeGreaterThanOrEqual(count.x + count.width - 1)
    // The enemy number itself is the topmost element at its own position.
    const enemyNumber = page.locator('#count .enemy b')
    expect(await uncoveredIn(page, '#count .enemy b')).toBe(true)
    await expect(enemyNumber).toHaveText('4')
  })

test('the tutorial shows only usable actions after an attack and follows the next ally', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  page.on('dialog', (dialog) => void dialog.accept())
  await page.goto('./?seed=7')
  await page.getByRole('button', { name: '✦ はじめから' }).click()
  await page.getByRole('button', { name: '⚔ クラシック' }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  const hint = page.locator('#tutorial')
  await cell(page, 2, 4).click()
  await cell(page, 4, 4).click()
  await expect(page.locator('#undo')).toBeEnabled({ timeout: 30000 })
  await cell(page, 7, 4).click()
  await page.getByRole('button', { name: '攻撃', exact: true }).click()
  await expect(hint).toContainText('ターン終了', { timeout: 30000 })
  await expect(hint).not.toContainText('待機')
  await expect(page.locator('#wait.tutorial-target')).toHaveCount(0)
  await expect(page.locator('#end.tutorial-target')).toHaveCount(1)
  await cell(page, 2, 5).click()
  await expect(hint).toContainText('移動可能')
})

test('on the small scrolling layout a two-finger drag pans the board without scrolling the page (480x320)', async ({
  page,
  context
}) => {
  await start(page, { width: 480, height: 320 })
  await page.getByRole('button', { name: '拡大' }).click()
  await cameraSettled(page)
  const view = () =>
    page.evaluate(() => {
      const camera = (document.querySelector('.field') as HTMLElement & { camera: { view: { x: number; y: number } } })
        .camera
      return { x: camera.view.x, y: camera.view.y, scroll: scrollY }
    })
  const before = await view()
  const field = (await page.locator('.field').boundingBox())!
  const cx = Math.round(field.x + field.width / 2)
  const cy = Math.round(field.y + field.height / 2)
  const client = await context.newCDPSession(page)
  const points = (dy: number) => [
    { x: cx - 50, y: cy + dy, id: 1 },
    { x: cx + 50, y: cy + dy, id: 2 }
  ]
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) })
  for (let step = 1; step <= 8; step++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(-step * 8) })
    await page.waitForTimeout(16)
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(300)
  const after = await view()
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.3)
  expect(Math.abs(after.scroll - before.scroll)).toBeLessThanOrEqual(1)
})

for (const width of [560, 568, 580])
  test(`chapter five shows its whole objective and taps reveal the full condition at ${width}x320`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 320 })
    await enterBattle(page, './?seed=7', true)
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await page.getByRole('button', { name: '任務と編成' }).click()
    await page.locator('[data-stage="4"]').click()
    const discard = page.getByRole('button', { name: '↻ 破棄して続ける' })
    if (await discard.isVisible().catch(() => false)) await discard.click()
    await expect(page.locator('#objective')).toContainText('残り6ターン（6ターン防衛）', { timeout: 90000 })
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    const clipped = await page
      .locator('#objective')
      .evaluate((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
    expect(clipped).toBe(false)
    expect(await uncoveredIn(page, '#count .enemy b')).toBe(true)
    await page.locator('#objective').tap()
    await expect(page.locator('#toast')).toContainText('6ターン守り抜く')
  })

test('the objective is marked pressable and its toast stays long enough to read', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterBattle(page, './?seed=7', true)
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: '任務と編成' }).click()
  await page.locator('[data-stage="4"]').click()
  const discard = page.getByRole('button', { name: '↻ 破棄して続ける' })
  if (await discard.isVisible().catch(() => false)) await discard.click()
  await expect(page.locator('#objective')).toContainText('残り6ターン（6ターン防衛）', { timeout: 90000 })
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  const objective = page.getByRole('button', { name: /勝利条件：残り6ターン（6ターン防衛）/ })
  await expect(objective).toBeVisible()
  expect(await objective.locator('.objective-text').evaluate((el) => getComputedStyle(el).textDecorationStyle)).toBe(
    'dotted'
  )
  await objective.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#toast')).toContainText('6ターン守り抜く')
  await expect(page.locator('#log')).toContainText('勝利条件：6ターン守り抜く')
  const toastBox = await page.locator('#toast').boundingBox()
  const fieldBox = await page.locator('.field').boundingBox()
  expect(toastBox!.width).toBeGreaterThan(fieldBox!.width * 0.8)
  expect(toastBox!.height).toBeLessThan(90)
  await page.waitForTimeout(5000)
  await expect(page.locator('#toast')).toBeVisible()
  await expect(page.locator('#toast')).toBeHidden({ timeout: 8000 })
  await objective.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#toast')).toBeVisible()
  await cell(page, 3, 3).click()
  await expect(page.locator('#toast')).toBeHidden({ timeout: 1000 })
})

/** A first play of chapter one with the tutorial running. */
async function firstPlay(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport)
  page.on('dialog', (dialog) => void dialog.accept())
  await page.goto('./?seed=7')
  await page.getByRole('button', { name: '✦ はじめから' }).click()
  await page.getByRole('button', { name: '⚔ クラシック' }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await expect(page.locator('#tutorial')).toBeVisible()
  return page.locator('#tutorial')
}

test('the tutorial follows the danger toggle and the next selected ally', async ({ page }) => {
  const hint = await firstPlay(page, { width: 1280, height: 800 })
  await page.getByRole('button', { name: '敵の攻撃範囲', exact: true }).click()
  await cell(page, 2, 5).click()
  await page.getByRole('button', { name: '✓ 待機', exact: true }).click()
  await expect(hint).toContainText('いまは表示中')
  // Another fresh ally gets its own guidance.
  await cell(page, 2, 4).click()
  await expect(hint).toContainText('移動可能')
  await page.keyboard.press('Escape')
  await expect(hint).toContainText('いまは表示中')
  await page.getByRole('button', { name: '敵の攻撃範囲', exact: true }).click()
  await expect(hint).toBeHidden()
  await expect(page.locator('.cell.danger')).toHaveCount(0)
})

for (const viewport of [
  { width: 568, height: 320 },
  { width: 480, height: 320 }
])
  test(`the tutorial guides the enemy turn with what is available at ${viewport.width}x${viewport.height}`, async ({
    page
  }) => {
    const hint = await firstPlay(page, viewport)
    await page.locator('#end').scrollIntoViewIfNeeded()
    await page.locator('#end').tap()
    await expect(page.locator('#fast')).toBeVisible({ timeout: 30000 })
    await expect(hint).toContainText('敵フェイズ中')
    await expect(hint).toBeInViewport()
    expect(await uncoveredIn(page, '#fast')).toBe(true)
    await expect(page.locator('#fast.tutorial-target')).toHaveCount(1)
    await expect(page.locator('#danger.tutorial-target')).toHaveCount(0)
    await expect(page.locator('#turn')).toContainText('ターン 2 · 味方', { timeout: 30000 })
    await expect(hint).not.toContainText('敵フェイズ中')
  })

test('the tutorial points at nothing disabled while an attack plays', async ({ page }) => {
  const hint = await firstPlay(page, { width: 1280, height: 800 })
  await cell(page, 2, 4).click()
  await cell(page, 4, 4).click()
  await expect(page.locator('#undo')).toBeEnabled({ timeout: 30000 })
  await cell(page, 7, 4).click()
  await page.getByRole('button', { name: '攻撃', exact: true }).click()
  await expect(hint).toContainText('行動中')
  await expect(page.locator('#undo.tutorial-target, #end.tutorial-target, #wait.tutorial-target')).toHaveCount(0)
  await expect(hint).toContainText('ターン終了', { timeout: 30000 })
  await expect(page.locator('#end.tutorial-target')).toHaveCount(1)
})
