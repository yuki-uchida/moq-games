import { expect, test, type Page } from '@playwright/test'
import { GameEngine } from '../examples/games/tower_diffence_with_jev/src/game/GameEngine'
import { getField, getLegalAIActions } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { SPECIALS } from '../examples/games/tower_diffence_with_jev/src/game/SpecialAbilities'
import { freshSave } from '../examples/games/tower_diffence_with_jev/src/progression/UpgradeSystem'
import { openOfflineCampaign, towerPath } from './tower-defense-e2e-arrange'

// Seeds a campaign already in the assault with a soldier (optionally down) and an archer.
async function seed(page: Page, { soldierDown = false, far = false, tough = false } = {}) {
  const save = freshSave()
  save.economyVersion = 2
  save.gold = 120
  const engine = new GameEngine({ decide: async () => null }, save, 'meadow', 42, () => 0, undefined, 2, 4)
  for (const type of ['soldier', 'archer'] as const) {
    const slots = getField('meadow', 2, 4).slots.filter((p) => engine.previewPlacement(type, p).valid),
      point = far ? slots.at(-1) : slots[0]
    expect(point).toBeTruthy()
    expect(engine.place(type, point!)).toBe(true)
  }
  if (soldierDown) engine.state.units.find((u) => u.type === 'soldier')!.hp = 0
  expect(engine.startAssault()).toBe(true)
  engine.update(1 / 60)
  if (tough) {
    // One enemy (spawned now) that neither special alone can finish.
    expect(engine.applyAIAction(getLegalAIActions(engine.state).find((a) => a.type === 'spawn' && a.unitType === 'goblin'))).toBe(true)
    const enemy = engine.state.units.find((u) => u.owner === 'ai')!
    for (const caster of engine.state.units.filter((u) => u.owner === 'player'))
      expect(enemy.hp, caster.type).toBeGreaterThan(SPECIALS[caster.type as 'soldier' | 'archer'].power * caster.attack)
  }
  // A checkpoint is only exportable once the spawn has settled.
  let checkpoint = engine.exportCheckpoint()
  for (let tick = 0; !checkpoint && tick < 1200; tick++) {
    engine.update(1 / 60)
    checkpoint = engine.exportCheckpoint()
  }
  expect(checkpoint).toBeTruthy()
  const raw = JSON.stringify({
    version: 3,
    profile: checkpoint!.profile,
    run: { version: 1, progress: checkpoint!.progress, engine: checkpoint }
  })
  await page.goto(towerPath)
  await page.evaluate((raw) => {
    localStorage.setItem('tower-jev-v3', raw)
    localStorage.removeItem('tower-jev-auto-skill-v1')
    localStorage.removeItem('tower-jev-coach-aim-v1')
  }, raw)
  await page.reload()
  await page.locator('#title-continue').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
}
async function stored(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('tower-jev-v3')!).run.engine)
}
async function assault(page: Page) {
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'assault')
  await expect
    .poll(() => page.evaluate(() => (window as any).towerDefenseDiagnostics().specialAbilities.loaded))
    .toBe(10)
}

test('skill bar is hidden in preparation and shows one accessible button per ally in the assault', async ({ page }) => {
  await openOfflineCampaign(page)
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'preparation')
  await expect(page.locator('#skill-bar')).toBeHidden()
  // Far from the cave, so "nothing in range yet" still holds however slowly the page renders.
  await seed(page, { far: true })
  await assault(page)
  const bar = page.locator('#skill-bar'),
    buttons = page.locator('.skill-btn')
  await expect(bar).toBeVisible()
  await expect(buttons).toHaveCount(2)
  // Charged but nothing in range yet: the label says so and how to aim by hand; the crosshair badge shows it.
  await expect(buttons.nth(0)).toHaveAttribute('aria-label', '回転斬撃 発動可能 · 範囲内に敵なし · 長押しで場所を指定')
  await expect(buttons.nth(1)).toHaveAttribute('aria-label', '矢の雨 発動可能 · 範囲内に敵なし · 長押しで場所を指定')
  await expect(buttons.nth(0)).toHaveAttribute('data-state', 'ready')
  await expect(buttons.nth(0)).toHaveAttribute('data-target-count', '0')
  await expect(buttons.nth(0).locator('.skill-aim')).toBeVisible()
  await expect(buttons.nth(0).locator('.skill-badge')).toBeHidden()
  await expect(buttons.nth(0)).toHaveCSS('animation-name', 'none')
  await buttons.nth(0).hover()
  await expect(buttons.nth(0).locator('.skill-name')).toHaveText('回転斬撃 · 長押しで場所を指定')
  for (const box of await buttons.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
    expect(box.width).toBeGreaterThanOrEqual(48)
    expect(box.height).toBeGreaterThanOrEqual(48)
  }
  // The bar keeps clear of the other fixed HUD: field controls, trays and the stage label.
  const rect = async (selector: string) => page.locator(selector).evaluate((e) => e.getBoundingClientRect().toJSON())
  const barBox = await rect('#skill-bar')
  for (const selector of ['.field-controls', '.stage-label', '.topbar']) {
    const other = await rect(selector)
    const apart =
      barBox.right <= other.left || other.right <= barBox.left || barBox.bottom <= other.top || other.bottom <= barBox.top
    expect(apart, selector).toBe(true)
  }
  await expect(page.locator('.battle-special-status').first()).toBeHidden()
})

test('nothing in range: a tap says so on the button, long press and Shift+click aim by hand, Escape cancels', async ({
  page
}) => {
  await seed(page, { far: true })
  await assault(page)
  const soldier = page.locator('.skill-btn[data-skill-type="soldier"]')
  await soldier.click()
  // No cast, no aim panel over the field: just a short bubble on the button.
  await expect(soldier).toHaveAttribute('data-hint', 'true')
  await expect(soldier.locator('.skill-name')).toHaveText('射程内に敵がいません')
  await expect(soldier.locator('.skill-name')).toHaveCSS('opacity', '1')
  await expect(page.locator('#selection-context')).toBeHidden()
  expect((await stored(page)).state.units[0].specialCooldown).toBeUndefined()
  await expect(soldier).not.toHaveAttribute('data-hint', 'true', { timeout: 3000 })
  await expect(soldier.locator('.skill-name')).toHaveText('回転斬撃 · 長押しで場所を指定')
  // The first no-target tap teaches long-press once (and only once).
  await expect(page.locator('.coach[data-step="aim"]')).toBeVisible()
  await expect(page.locator('.coach-bubble')).toContainText('長押しで場所を選べる')
  expect(await page.evaluate(() => localStorage.getItem('tower-jev-coach-aim-v1'))).toBe('1')
  const box = (await soldier.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(500)
  await page.mouse.up()
  await expect(page.locator('#unit-special')).toHaveText('×')
  await page.keyboard.press('Escape')
  await expect(page.locator('#selection-context')).toBeHidden()
  await soldier.click({ modifiers: ['Shift'] })
  await expect(page.locator('#unit-special')).toHaveText('×')
})

test('one tap casts at the best target once enemies are in range: honest button, time-stop, then the result readout', async ({ page }) => {
  await seed(page)
  await assault(page)
  const archer = page.locator('.skill-btn[data-skill-type="archer"]')
  // Enemies walk in on their own; the button turns bright with a hit count once the auto-aim would hit something.
  await expect(archer).not.toHaveAttribute('data-target-count', '0', { timeout: 120_000 })
  await expect(archer).toHaveAttribute('data-state', 'ready')
  await expect(archer).toHaveAttribute('aria-label', /^矢の雨 発動可能 \d+体$/)
  await expect(archer.locator('.skill-badge')).toHaveText(/^×\d+$/)
  await expect(archer.locator('.skill-mark')).toHaveText('✦')
  await expect(archer).not.toHaveCSS('animation-name', 'none')
  // The first-skill coach mark points at a button that will hit.
  await expect(page.locator('.coach[data-step="skills"]')).toBeVisible()
  await expect(page.locator('#skill-cutin')).toHaveCSS('pointer-events', 'none')
  // Time-stop: tap and measure in the page, so slow software-GPU round trips can't blur it. The
  // first frame after the tap shows the band and the landing ring; the simulation clock then stands
  // still for ~0.65 s of real time (slower frames only lengthen the measured stop) and runs again.
  const stop = await archer.evaluate(async (button: HTMLButtonElement) => {
    const app = document.getElementById('app')!,
      read = () => Number(app.dataset.simulationTime),
      frame = () => new Promise((resolve) => requestAnimationFrame(resolve)),
      shown = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        return !!element && !element.closest('[hidden]') && element.getClientRects().length > 0
      }
    const tappedAt = performance.now()
    button.click()
    await frame()
    const band = shown('#skill-cutin .skill-cutin-band'),
      ring = shown('#field .skill-target-ring'),
      frozenAt = read()
    while (performance.now() - tappedAt < 6000) {
      await frame()
      if (read() !== frozenAt) return { band, ring, stoppedMs: performance.now() - tappedAt }
    }
    return { band, ring, stoppedMs: -1 }
  })
  expect(stop.band).toBe(true)
  expect(stop.ring).toBe(true)
  expect(stop.stoppedMs).toBeGreaterThanOrEqual(500)
  await expect
    .poll(async () => (await stored(page)).state.units.find((u: any) => u.type === 'archer').specialCooldown ?? 0)
    .toBeGreaterThan(50)
  await expect(page.locator('#skill-cutin')).toBeHidden({ timeout: 3000 })
  // The impact lands after the band is gone and reports what it did.
  // A hit reports itself on a card; a whiff (the target died first) only puffs a small MISS.
  const readout = page.locator('.fx-special, #field .fx-chip.miss').first()
  await expect(readout).toBeVisible({ timeout: 5000 })
  await expect(readout).toContainText(/矢の雨[\s\S]*×\d+ HIT|MISS/)
  await expect(readout).toHaveCSS('pointer-events', 'none')
  await expect(archer).toHaveAttribute('data-state', 'charging')
  await expect(archer).toHaveAttribute('aria-label', /^矢の雨 あと\d+秒$/)
  await expect(archer.locator('.skill-count')).toHaveText(/^\d+$/)
})

test('two specials cast back-to-back each get their own band one after the other, their own ring, and their own result', async ({
  page
}) => {
  await seed(page)
  await assault(page)
  const archer = page.locator('.skill-btn[data-skill-type="archer"]'),
    soldier = page.locator('.skill-btn[data-skill-type="soldier"]')
  await expect(archer).not.toHaveAttribute('data-target-count', '0', { timeout: 120_000 })
  await expect(archer).toHaveAttribute('data-state', 'ready')
  await expect(soldier).toHaveAttribute('data-state', 'ready')
  // Where the soldier stands, on screen: the second cast is aimed there by hand.
  const spot = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('tower-jev-v3')!).run.engine.state,
      unit = state.units.find((u: any) => u.type === 'soldier'),
      field = document.getElementById('field')!,
      box = field.querySelector('canvas')!.getBoundingClientRect()
    return {
      x: box.x + (unit.x / (Number(field.dataset.worldWidth) || 1280)) * box.width,
      y: box.y + (unit.y / (Number(field.dataset.worldHeight) || 920)) * box.height
    }
  })
  // Record every rendered frame in the page, so slow round trips can't blur what was on screen.
  await page.evaluate(() => {
    const visible = (element: Element | null) => !!element && !element.closest('[hidden]') && element.getClientRects().length > 0
    const log: Array<{ t: number; sim: number; band: string | null; rings: number; cutin: number }> = ((window as any).__cutinLog = [])
    const tick = () => {
      const band = document.querySelector('#skill-cutin .skill-cutin-text b')
      log.push({
        t: performance.now(),
        sim: Number(document.getElementById('app')!.dataset.simulationTime),
        band: visible(band) ? band!.textContent : null,
        rings: [...document.querySelectorAll('#field .skill-target-ring')].filter(visible).length,
        cutin: (window as any).towerDefenseAudioDiagnostics().feelPlayed.cutin ?? 0
      })
      requestAnimationFrame(tick)
    }
    tick()
  })
  await archer.click()
  await soldier.click({ modifiers: ['Shift'] })
  await expect(page.locator('#unit-special')).toHaveText('×')
  await page.mouse.click(spot.x, spot.y)
  await expect(page.locator('#skill-cutin')).toBeHidden({ timeout: 5000 })
  await expect(page.locator('#field .skill-target-ring')).toHaveCount(0)
  await expect(archer).toHaveAttribute('data-state', 'charging')
  await expect(soldier).toHaveAttribute('data-state', 'charging')
  const log = await page.evaluate(() => (window as any).__cutinLog as Array<{ t: number; sim: number; band: string | null; rings: number; cutin: number }>)
  const names = log.map((f) => f.band).filter((n, i, all) => n && n !== all[i - 1]),
    first = log.find((f) => f.rings > 0)!,
    resumed = log.find((f) => f.t > first.t && f.sim > first.sim)!
  // Both bands play, in cast order; both rings stand together; the simulation waits for both bands.
  expect(names).toEqual(['矢の雨', '回転斬撃'])
  // Each band sounds (cut-in whoosh) when it appears, in the same or the next frame, and nothing sounds without a band.
  const bandStarts = log.flatMap((f, i) => (f.band && f.band !== log[i - 1]?.band ? [i] : [])),
    soundSteps = log.flatMap((f, i) => (i > 0 ? Array<number>(f.cutin - log[i - 1].cutin).fill(i) : []))
  expect(soundSteps).toHaveLength(bandStarts.length)
  for (const [n, start] of bandStarts.entries()) expect(Math.abs(soundSteps[n] - start), `band ${n}`).toBeLessThanOrEqual(1)
  expect(Math.max(...log.map((f) => f.rings))).toBe(2)
  // The first cast happened after the frame before `first` (a software GPU can render ~200 ms apart), so time
  // that frame: a single 650 ms stop would still fail this, a chained one passes however slow the frames are.
  const beforeFirst = log[log.indexOf(first) - 1] ?? first
  expect(resumed.t - beforeFirst.t).toBeGreaterThanOrEqual(1100)
  // Each ring goes when its own band ends: one ring is left during the second band.
  const second = log.filter((f) => f.band === '回転斬撃')
  expect(second.at(-1)!.rings).toBe(1)
  // Each cast reports itself: its own card (named after it) or a MISS puff, never one result for both.
  await expect
    .poll(() => page.locator('.fx-special, #field .fx-chip.miss').count(), { timeout: 8000, intervals: [100] })
    .toBeGreaterThanOrEqual(2)
  const cards = await page.locator('.fx-special').allTextContents()
  for (const card of cards) expect(card).toMatch(/矢の雨|回転斬撃/)
  expect(new Set(cards.map((card) => (card.includes('矢の雨') ? 'a' : 'b'))).size).toBe(cards.length)
})

test('two skills tapped back to back on one tough enemy are both cast: a special that cannot finish it does not hide it', async ({
  page
}) => {
  await seed(page, { tough: true })
  await assault(page)
  const archer = page.locator('.skill-btn[data-skill-type="archer"]'),
    soldier = page.locator('.skill-btn[data-skill-type="soldier"]')
  await expect(archer).not.toHaveAttribute('data-target-count', '0', { timeout: 120_000 })
  await expect(soldier).not.toHaveAttribute('data-target-count', '0', { timeout: 120_000 })
  await expect(archer).toHaveAttribute('data-state', 'ready')
  await expect(soldier).toHaveAttribute('data-state', 'ready')
  // Two taps in the same task: the second one sees the first cast still pending.
  await page.evaluate(() => {
    for (const type of ['archer', 'soldier']) document.querySelector<HTMLElement>(`.skill-btn[data-skill-type="${type}"]`)!.click()
  })
  await expect(archer).toHaveAttribute('data-state', 'charging')
  await expect(soldier).toHaveAttribute('data-state', 'charging')
  const effects = (await stored(page)).state.specialEffects as Array<{ type: string }>
  expect(new Set(effects.map((e) => e.type))).toEqual(new Set(['archer', 'soldier']))
})

test('a downed ally shows a disabled greyed button', async ({ page }, info) => {
  await seed(page, { soldierDown: true })
  await assault(page)
  const soldier = page.locator('.skill-btn[data-skill-type="soldier"]')
  await expect(soldier).toBeDisabled()
  await expect(soldier).toHaveAttribute('data-state', 'down')
  await expect(soldier.locator('.skill-mark')).toHaveText('✕')
  await expect(page.locator('.skill-btn[data-skill-type="archer"]')).toBeEnabled()
  for (const [width, height] of [
    [1440, 900],
    [390, 844]
  ]) {
    await page.setViewportSize({ width, height })
    await page.screenshot({ path: info.outputPath(`skill-bar-down-${width}x${height}.png`) })
  }
})

test('AUTO persists, is announced as pressed, and fires specials without a tap', async ({ page }) => {
  await seed(page)
  await assault(page)
  const auto = page.locator('#skill-auto')
  await expect(auto).toHaveAttribute('aria-pressed', 'false')
  await auto.click()
  await expect(auto).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('tower-jev-auto-skill-v1'))).toBe('1')
  await expect
    .poll(async () => (await stored(page)).state.units.some((u: any) => (u.specialCooldown ?? 0) > 55), {
      timeout: 120_000,
      intervals: [500]
    })
    .toBe(true)
  await page.reload()
  await page.locator('#title-continue').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  await expect(page.locator('#skill-auto')).toHaveAttribute('aria-pressed', 'true')
})
