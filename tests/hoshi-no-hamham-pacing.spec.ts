import { expect, test, type Page } from '@playwright/test'
import { openGame, reloadGame } from './hoshi-no-hamham-helpers'

// Pacing: the simulation steps follow the display (one step per frame at the headless browser's 60 Hz), the
// picture is drawn between two steps without the world ever holding anything but the simulation's own state
// between frames, and a 651 CSS px canvas at pixel ratio 3 gets a 1920×1080 backing store.

const SAVE = {
  version: 1,
  cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  unlocked: 10,
  best: {},
  muted: true,
  seenOpening: true
}

interface Hook {
  world: { player: { x: number; y: number }; time: number; state: string } | null
  view: { frozen: boolean; draw(): void; update(dt: number, animDt?: number): void } | null
  app: {
    paused: boolean
    renderer: { k: number; maxK: number }
    session: {
      frame(dt: number): void
      draw(): void
      autopilot: boolean
      director: { timeScale: number; inputLocked: boolean; current?: string | null }
    } | null
  }
  autopilot(on: boolean): void
}

declare global {
  interface Window {
    __hamham: Hook
    __pace: { t: number; wt: number; held: boolean }[]
    __paceOn: boolean
  }
}

async function openStage(page: Page, no: number) {
  await openGame(page)
  await page.evaluate((save) => localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify(save)), SAVE)
  await reloadGame(page)
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page
    .locator('.stage-card')
    .nth(no - 1)
    .click()
  for (let i = 0; i < 10; i++) {
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click()
  }
  await expect(page.locator('#hud')).toBeVisible()
  await page.waitForFunction(() => Boolean(window.__hamham.view && window.__hamham.app.session))
}

/** Waits until the opening staging has let go of the stage (the hero is playable and time runs at 1×). */
async function waitForPlay(page: Page) {
  await page.waitForFunction(
    () => {
      const director = window.__hamham.app.session?.director
      return Boolean(director && director.timeScale === 1 && !director.inputLocked && !director.current)
    },
    null,
    { timeout: 15_000 }
  )
}

test('every frame of play runs exactly one simulation step at 60 Hz (a frame the browser dropped runs two)', async ({
  page
}) => {
  test.setTimeout(75_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 640, height: 360 })
  await openStage(page, 2)
  await waitForPlay(page)
  await page.evaluate(() => {
    window.__hamham.autopilot(true)
    window.__pace = []
    window.__paceOn = true
    // Registered after the game's own loop, so it runs after the frame's steps within every frame.
    const tick = (t: number) => {
      if (window.__paceOn) requestAnimationFrame(tick)
      const h = window.__hamham
      const world = h.world
      const director = h.app.session?.director
      if (!world || !director || !h.view) return
      const held = h.view.frozen || director.timeScale !== 1 || director.inputLocked || world.state !== 'play'
      window.__pace.push({ t, wt: world.time, held })
    }
    requestAnimationFrame(tick)
  })
  await page.waitForTimeout(15_000)
  const frames = await page.evaluate(() => {
    window.__paceOn = false
    return window.__pace
  })
  expect(frames.length).toBeGreaterThan(300)

  const period = 1000 / 60
  let checked = 0
  const bad: string[] = []
  for (let i = 61; i < frames.length; i++) {
    const a = frames[i - 1]
    const b = frames[i]
    if (a.held || b.held) continue
    const interval = b.t - a.t
    const steps = Math.round((b.wt - a.wt) * 60)
    // A normal frame is one period; a frame the browser dropped shows as two. Anything else (a stalled machine)
    // is not what this checks.
    if (Math.abs(interval - period) < 4) {
      checked += 1
      if (steps !== 1) bad.push(`frame ${i}: ${interval.toFixed(1)} ms ran ${steps} steps`)
    } else if (Math.abs(interval - 2 * period) < 4) {
      checked += 1
      if (steps !== 2) bad.push(`frame ${i}: ${interval.toFixed(1)} ms ran ${steps} steps`)
    }
  }
  expect(checked).toBeGreaterThan(frames.length * 0.4)
  expect(bad).toEqual([])
  expect(errors).toEqual([])
})

test('between frames the world holds the simulation state; the frame itself is drawn between two steps', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 640, height: 360 })
  await openStage(page, 2)
  await waitForPlay(page)
  const result = await page.evaluate(async () => {
    const h = window.__hamham
    const session = h.app.session!
    const world = h.world!
    const view = h.view!
    session.autopilot = true
    // Stop the app's own loop from running the session, and drive it by hand at 120 Hz.
    h.app.paused = true
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    let seenInUpdate = NaN
    const update = view.update.bind(view)
    view.update = (dt: number, animDt?: number) => {
      seenInUpdate = world.player.x
      update(dt, animDt)
    }
    const rows: { start: number; seen: number; end: number; steps: number; held: boolean }[] = []
    for (let i = 0; i < 600; i++) {
      const start = world.player.x
      const time = world.time
      session.frame(1 / 120)
      const seen = seenInUpdate
      session.draw()
      const held = view.frozen || session.director.timeScale !== 1
      rows.push({ start, seen, end: world.player.x, steps: Math.round((world.time - time) * 60), held })
    }
    view.update = update
    return { rows }
  })
  const { rows } = result
  expect(rows.length).toBe(600)
  let moving = 0
  let midpoints = 0
  for (let i = 80; i < rows.length; i++) {
    const row = rows[i]
    expect(row.steps).toBeLessThanOrEqual(1)
    // Between frames: the world holds the true value, which is where the next frame starts from.
    if (i > 0) expect(row.start).toBe(rows[i - 1].end)
    if (row.held) expect(row.seen).toBeCloseTo(row.end, 6)
    else if (row.steps === 1) {
      // 120 Hz: a step frame is drawn half way from where the hero was to where the step took it.
      expect(row.seen).toBeCloseTo((row.start + row.end) / 2, 6)
      if (Math.abs(row.end - row.start) > 0.5) midpoints += 1
    } else expect(row.seen).toBeCloseTo(row.end, 6)
    if (!row.held && Math.abs(row.end - row.start) > 0.5) moving += 1
  }
  expect(moving).toBeGreaterThan(50)
  expect(midpoints).toBeGreaterThan(20)
  // Half the frames run a step (120 Hz against 60 Hz).
  const stepped = rows.slice(80).filter((r) => r.steps === 1).length
  expect(stepped).toBeGreaterThan(180)
  expect(stepped).toBeLessThan(270)
  expect(errors).toEqual([])
})

test('a 651 CSS px wide canvas at pixel ratio 3 has a 1920×1080 backing store', async ({ browser }) => {
  // The stage keeps 12 px of padding on each side in landscape: 675 CSS px of viewport make a 651 px canvas.
  const context = await browser.newContext({ viewport: { width: 675, height: 460 }, deviceScaleFactor: 3 })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openStage(page, 1)
  const size = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game')!
    return {
      css: canvas.clientWidth,
      w: canvas.width,
      h: canvas.height,
      k: window.__hamham.app.renderer.k,
      maxK: window.__hamham.app.renderer.maxK
    }
  })
  expect(size.css).toBe(651)
  expect(size.maxK).toBe(3)
  expect(size.k).toBe(3)
  expect(size.w).toBe(1920)
  expect(size.h).toBe(1080)
  expect(errors).toEqual([])
  await context.close()
})
