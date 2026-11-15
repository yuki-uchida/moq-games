import { expect, test, type Page } from '@playwright/test'
import { openGame, pageThroughStory, reloadGame } from './hoshi-no-hamham-helpers'

/**
 * The readout for checking the game on the device in hand: `?perf` in the address puts the rate of the frames and
 * the count of the long waits between them in a corner while a stage is played, with the moments of damage, the
 * waits right after them and the hit-stops the game staged; `?perf=nohold` plays the stage without its hit-stops;
 * and nothing of it exists without the flag.
 */

const SAVE = {
  version: 1,
  cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  unlocked: 10,
  best: {},
  muted: true,
  seenOpening: true
}

interface ReadoutHook {
  world: {
    player: { invuln: number; x: number }
    enemies: { dead: boolean }[]
    boss: { active: boolean } | null
    hurtPlayer(amount: number, sourceX: number): void
  }
  view: { frozen: boolean }
  app: { session: { damage: number; director: { current: string | null } } | null }
}

test.use({ viewport: { width: 844, height: 390 } })

// The readout is a canvas (a change of text in the page would cost a layout of its own); the text it shows is kept
// on the element.
const shown = (page: Page) =>
  page.evaluate(() => (document.querySelector('#perf-readout') as HTMLCanvasElement & { shown?: string }).shown ?? '')

/** The counts of the moments of damage and of the hit-stops on the readout (-1: the line is not there). */
const counts = async (page: Page) => {
  const text = await shown(page)
  return {
    moments: Number(/ダメージ判定 (\d+)回/.exec(text)?.[1] ?? -1),
    holds: Number(/ため\(演出\) (\d+)回/.exec(text)?.[1] ?? -1)
  }
}

/** Opens the game at `address` with every stage unlocked and starts stage 1; returns the page's errors. */
async function startStage(page: Page, address: string) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openGame(page, address)
  await page.evaluate((save) => localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify(save)), SAVE)
  await reloadGame(page)
  return errors
}

async function intoPlay(page: Page) {
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page.locator('.stage-card').first().click()
  await pageThroughStory(page, 8)
  await expect(page.locator('#hud')).toBeVisible()
  // The stage's opening staging is over when the director has no moment on.
  await page.waitForFunction(
    () => (window as unknown as { __hamham: ReadoutHook }).__hamham.app.session?.director.current === null,
    null,
    { timeout: 30_000 }
  )
  // Nothing judges damage by itself from here on: nothing else is on the field, the chaser sleeps, and the hero
  // cannot be hurt but by the test.
  await page.evaluate(() => {
    const w = (window as unknown as { __hamham: ReadoutHook }).__hamham.world
    for (const enemy of w.enemies) enemy.dead = true
    if (w.boss) w.boss.active = false
    w.player.invuln = 1e9
  })
  // A second for what was judged just before to reach the readout (it is written once a second).
  await page.waitForTimeout(1200)
}

/** Hurts the hero once and says, for the dozen frames after it, whether the view held its picture. */
const hurtAndWatch = (page: Page) =>
  page.evaluate(async () => {
    const h = (window as unknown as { __hamham: ReadoutHook }).__hamham
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const before = h.app.session!.damage
    h.world.player.invuln = 0
    h.world.hurtPlayer(1, h.world.player.x + 100)
    const held: boolean[] = []
    for (let i = 0; i < 12; i++) {
      await frame()
      held.push(h.view.frozen)
    }
    h.world.player.invuln = 1e9
    return { held, hurts: h.app.session!.damage - before }
  })

test('?perf shows the frames and the long waits of the stage being played', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = await startStage(page, '/?perf')
  const readout = page.locator('#perf-readout')
  /** How many of the canvas's pixels are written on. */
  const inked = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#perf-readout')!
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let n = 0
      for (let i = 3; i < data.length; i += 4) if (data[i] > 128) n += 1
      return n
    })
  // On the title nothing has been counted yet.
  await expect.poll(() => shown(page)).toMatch(/^--コマ\/秒\s+0コマ\s+最長 0ms\s+25ms以上 0回\s+50ms以上 0回/)
  expect(await shown(page)).toMatch(/ダメージ判定 0回\n直後 25ms以上 0回 50ms以上 0回\nため\(演出\) 0回 計0\.0秒$/)
  expect(await inked()).toBeGreaterThan(100)
  await intoPlay(page)
  // A few seconds of play: frames have been counted and their rate is shown.
  await expect
    .poll(async () => Number(/(\d+)コマ\s+最長/.exec(await shown(page))?.[1] ?? 0), { timeout: 30_000 })
    .toBeGreaterThan(60)
  expect(await shown(page)).toMatch(/^\d+コマ\/秒\s+\d+コマ\s+最長 \d+ms\s+25ms以上 \d+回\s+50ms以上 \d+回/)
  // The moments of damage, the waits right after them and the hit-stops have their lines.
  expect(await shown(page)).toMatch(
    /ダメージ判定 \d+回\n直後 25ms以上 \d+回 50ms以上 \d+回\nため\(演出\) \d+回 計\d+\.\d秒$/
  )
  // The hero is hurt: the game holds its picture for a moment (a hit-stop), and the readout counts both.
  const before = await counts(page)
  const hurt = await hurtAndWatch(page)
  expect(hurt.hurts).toBe(1)
  expect(hurt.held).toContain(true)
  await expect.poll(async () => (await counts(page)).moments, { timeout: 15_000 }).toBe(before.moments + 1)
  await expect.poll(async () => (await counts(page)).holds, { timeout: 15_000 }).toBe(before.holds + 1)
  // The canvas is as wide as the text needs and sits inside the page.
  const box = await readout.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(844)
  expect(box!.y + box!.height).toBeLessThanOrEqual(390)
  // It never takes a tap away from the game, and it is not read out.
  await expect(readout).toHaveCSS('pointer-events', 'none')
  await expect(readout).toHaveAttribute('aria-hidden', 'true')
  expect(errors).toEqual([])
})

test('?perf=nohold plays the stage without its hit-stops, and the readout says so', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = await startStage(page, '/?perf=nohold')
  await expect.poll(() => shown(page)).toMatch(/ため\(演出\)なしで再生中$/)
  await intoPlay(page)
  const before = await counts(page)
  // The hero is hurt as in the other test, and the picture is not held for a single frame.
  const hurt = await hurtAndWatch(page)
  expect(hurt.hurts).toBe(1)
  expect(hurt.held).not.toContain(true)
  // The moment of damage is counted all the same.
  await expect.poll(async () => (await counts(page)).moments, { timeout: 15_000 }).toBe(before.moments + 1)
  expect(await shown(page)).toMatch(/ため\(演出\)なしで再生中$/)
  expect(errors).toEqual([])
})

test('without ?perf there is no readout', async ({ page }) => {
  await openGame(page)
  await page.waitForTimeout(500)
  await expect(page.locator('#perf-readout')).toHaveCount(0)
})
