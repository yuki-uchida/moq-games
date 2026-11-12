import { expect, test, type Page } from '@playwright/test'
import { openGame, reloadGame } from './hoshi-no-hamham-helpers'

// Art workers: the page adopts what they paint, so the main thread paints nothing while a stage is played, and a dig
// keeps the old terrain pictures until the new ones arrive.

const SAVE_KEY = 'hoshi-no-hamham-v1'
const SAVE = {
  version: 1,
  cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  unlocked: 10,
  best: {},
  muted: true,
  seenOpening: true
}

interface ArtCount {
  clips: number
  tiles: number
  backdrops: number
  decor: number
  remote: boolean
}

interface DigProbe {
  digs: number
  /** Neighbours of the first dig that were drawn before it: their cell index and whether the picture changed. */
  first: { cell: number; before: unknown }[] | null
}

type Terrain = { cache: Map<number, unknown>; pending(tx: number, ty: number): boolean }
type Hamham = {
  stats: { art: ArtCount }
  autopilot(on: boolean): void
  app: { session: unknown | null }
  world: { w: number; tiles: Uint8Array } | null
  view: { handle(event: { type: string; tx?: number; ty?: number }): void; terrain: Terrain } | null
}

declare global {
  interface Window {
    __digProbe: DigProbe
  }
}

const hamham = (page: Page) =>
  page.evaluate(() => ({ ...(window as unknown as { __hamham: Hamham }).__hamham.stats.art }))

/** The game's title with a save that unlocks every stage; `noWorkers` takes `Worker` away before the page loads. */
async function openTitle(page: Page, noWorkers = false) {
  if (noWorkers)
    await page.addInitScript(() => {
      delete (window as unknown as { Worker?: unknown }).Worker
    })
  await openGame(page)
  await page.evaluate(([key, save]) => localStorage.setItem(key as string, JSON.stringify(save)), [SAVE_KEY, SAVE])
  await reloadGame(page)
}

/** Stage `no` from its story screen (left open for three seconds, as a reader would), until play has begun. */
async function playFromStory(page: Page, no: number) {
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page
    .locator('.stage-card')
    .nth(no - 1)
    .click()
  await expect(page.locator('#story-screen')).toBeVisible()
  await page.waitForTimeout(3000)
  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(() => Boolean((window as unknown as { __hamham: Hamham }).__hamham.app.session))) break
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click({ timeout: 2000 }).catch(() => {})
    await page.waitForTimeout(30)
  }
  await page.waitForFunction(() => Boolean((window as unknown as { __hamham: Hamham }).__hamham.app.session), null, {
    timeout: 30_000
  })
}

/** Counts digs and remembers the pictures around the first one, just before the view answers it. */
async function watchDigs(page: Page) {
  await page.evaluate(() => {
    const h = (window as unknown as { __hamham: Hamham }).__hamham
    const view = h.view!
    const world = h.world!
    const probe: DigProbe = { digs: 0, first: null }
    window.__digProbe = probe
    const handle = view.handle.bind(view)
    view.handle = (event) => {
      if (event.type === 'dig') {
        probe.digs += 1
        if (!probe.first) {
          const cells: { cell: number; before: unknown }[] = []
          for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++) {
              if (!dx && !dy) continue
              const cell = (event.ty! + dy) * world.w + event.tx! + dx
              if (world.tiles[cell] !== 0 && view.terrain.cache.get(cell))
                cells.push({ cell, before: view.terrain.cache.get(cell) })
            }
          probe.first = cells
        }
      }
      handle(event)
    }
  })
}

function errorsOf(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  return errors
}

test('after the boot the art comes from workers: the page painted no clip and no backdrop', async ({ page }) => {
  const errors = errorsOf(page)
  await openTitle(page)
  const art = await hamham(page)
  expect(art.remote).toBe(true)
  // The title's stage, the HUD and the title screen were all adopted; decorations are small and drawn here.
  expect(art.clips).toBe(0)
  expect(art.backdrops).toBe(0)
  expect(art.tiles).toBe(0)
  expect(errors).toEqual([])
})

test('stage 1 with the bot: the page paints nothing during play, digs included', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await openTitle(page)
  await playFromStory(page, 1)
  await watchDigs(page)
  const before = await hamham(page)
  await page.evaluate(() => (window as unknown as { __hamham: Hamham }).__hamham.autopilot(true))
  await page.waitForTimeout(15_000)
  const after = await hamham(page)
  const digs = await page.evaluate(() => window.__digProbe.digs)
  expect(digs).toBeGreaterThan(0)
  expect(after.remote).toBe(true)
  for (const kind of ['clips', 'tiles', 'backdrops', 'decor'] as const) expect(after[kind], kind).toBe(before[kind])
  expect(errors).toEqual([])
})

test('a dig swaps in the new pictures of its neighbours within a second', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await openTitle(page)
  await playFromStory(page, 1)
  await watchDigs(page)
  await page.evaluate(() => (window as unknown as { __hamham: Hamham }).__hamham.autopilot(true))
  await page.waitForFunction(() => Boolean(window.__digProbe.first?.length), null, { timeout: 20_000 })
  await page.waitForTimeout(1000)
  const result = await page.evaluate(() => {
    const view = (window as unknown as { __hamham: Hamham }).__hamham.view!
    const w = (window as unknown as { __hamham: Hamham }).__hamham.world!.w
    return window.__digProbe.first!.map(({ cell, before }) => ({
      changed: view.terrain.cache.get(cell) !== before,
      pending: view.terrain.pending(cell % w, Math.floor(cell / w))
    }))
  })
  expect(result.some((cell) => cell.changed)).toBe(true)
  expect(result.filter((cell) => cell.pending)).toEqual([])
  expect(errors).toEqual([])
})

test('without workers the game boots, plays stage 1 and digs, painting on the page', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await openTitle(page, true)
  expect(await page.evaluate(() => typeof (window as unknown as { Worker?: unknown }).Worker)).toBe('undefined')
  await playFromStory(page, 1)
  await watchDigs(page)
  await page.evaluate(() => (window as unknown as { __hamham: Hamham }).__hamham.autopilot(true))
  await page.waitForFunction(() => window.__digProbe.digs > 0, null, { timeout: 20_000 })
  await page.waitForTimeout(1000)
  const art = await hamham(page)
  expect(art.remote).toBe(false)
  expect(art.clips).toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as unknown as { __hamham: Hamham }).__hamham.app.session !== null)).toBe(
    true
  )
  expect(errors).toEqual([])
})
