import { expect, test, type Page } from '@playwright/test'
import { cameraSettled, enterBattle } from './shell-helper'

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

test('floating forecast keeps the target visible (568x320)', async ({ page }, info) => {
  await start(page, { width: 568, height: 320 })
  await cell(page, 2, 4).click()
  await cell(page, 4, 4).click()
  await expect(page.locator('#undo')).toBeEnabled()
  await cell(page, 7, 4).click()
  await expect(page.locator('#confirm')).toBeInViewport()
  const card = (await page.locator('#forecast').boundingBox())!
  const box = (await cell(page, 7, 4).boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(card.y + 1)
  expect(box.y).toBeGreaterThanOrEqual(0)
  await page.screenshot({ path: info.outputPath('forecast.png') })
})

test('the potion button keeps its name in landscape (844x390)', async ({ page }) => {
  await start(page, { width: 844, height: 390 })
  await expect(page.locator('#recover')).toContainText('薬')
})

async function enableTouchAssist(page: Page) {
  await page.getByRole('button', { name: 'タッチ選択補助' }).tap()
}

test('the touch chooser opens on screen from an enemy and from an ally (568x320)', async ({ page }, info) => {
  await start(page, { width: 568, height: 320 })
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

test('the toast stays visible after scrolling (568x320)', async ({ page }, info) => {
  await start(page, { width: 568, height: 320 })
  const { enemy } = await farTargets(page)
  await cell(page, 2, 4).click()
  await page.evaluate(() => window.scrollBy(0, 160))
  await cell(page, enemy.x, enemy.y).click()
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

test('the enemy turn plays with the battlefield in view after scrolling to End Turn (568x320)', async ({
  page
}, info) => {
  await start(page, { width: 568, height: 320 })
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

test('first-time tutorial stays visible with the board at 568x320', async ({ page }, info) => {
  await page.setViewportSize({ width: 568, height: 320 })
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

test('the status bar stays pinned while the small landscape page scrolls (568x320)', async ({ page }) => {
  await start(page, { width: 568, height: 320 })
  await page.locator('#end').scrollIntoViewIfNeeded()
  for (const id of ['#turn', '#count', '#objective']) {
    const box = (await page.locator(id).boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(60)
  }
  await page.locator('#end').tap()
  await expect(page.locator('#fast')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#actor')).toBeVisible({ timeout: 30000 })
  const status = (await page.locator('.status').boundingBox())!
  const actor = (await page.locator('#actor').boundingBox())!
  expect(status.height).toBeLessThan(50)
  expect(actor.y).toBeGreaterThanOrEqual(status.y + status.height - 1)
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
