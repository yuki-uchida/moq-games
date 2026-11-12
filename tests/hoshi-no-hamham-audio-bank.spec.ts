import { expect, test, type Page } from '@playwright/test'
import { openGame, reloadGame } from './hoshi-no-hamham-helpers'

/** The parts of the audio these tests look inside (private at compile time, plain fields at run time). */
interface HamAudio {
  muted: boolean
  ctx: { state: string; currentTime: number } | null
  engine: unknown
  bank: { done: boolean; unavailable: boolean; size: number; samples: number; startedAt: number; finishedAt: number }
  unlock(): void
  setMuted(muted: boolean): void
}

declare global {
  interface Window {
    __hamham?: {
      app: { audio: HamAudio; screen: string }
      stats: { sfx: { buffered: number; live: number; rendered: number } }
      autopilot(on: boolean): void
      world: unknown
    }
    __nodes?: number
    __unlockMs?: number
    __longTasks?: Array<{ start: number; duration: number }>
    __frames?: Array<{ start: number; duration: number; scripts: string[] }>
  }
}

const sfxStats = (page: Page) => page.evaluate(() => ({ ...window.__hamham!.stats.sfx }))

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return errors
}

/** Records long tasks (over 50 ms) from the start of the page. */
async function watchLongTasks(page: Page) {
  await page.addInitScript(() => {
    window.__longTasks = []
    window.__frames = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTasks!.push({ start: e.startTime, duration: e.duration })
    }).observe({ entryTypes: ['longtask'] })
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as Array<{
        startTime: number
        duration: number
        scripts: Array<{ invoker: string; sourceFunctionName: string; duration: number }>
      }>)
        window.__frames!.push({
          start: e.startTime,
          duration: e.duration,
          scripts: e.scripts.map((x) => `${x.invoker} ${x.sourceFunctionName} ${Math.round(x.duration)}`)
        })
    }).observe({ type: 'long-animation-frame', buffered: true })
  })
}

/** Counts every Web Audio node the context builds from now on in `window.__nodes`. */
async function countNodes(page: Page) {
  await page.evaluate(() => {
    const ctx = window.__hamham!.app.audio.ctx as unknown as Record<string, (...args: unknown[]) => unknown>
    window.__nodes = 0
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(Object.getPrototypeOf(ctx)))) {
      if (!key.startsWith('create')) continue
      const original = ctx[key].bind(ctx)
      ctx[key] = (...args: unknown[]) => {
        window.__nodes! += 1
        return original(...args)
      }
    }
  })
}
const nodes = (page: Page) => page.evaluate(() => window.__nodes ?? 0)

test('the effects are rendered before any click, and the engine is ready for the first tap', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  await openGame(page)

  await page.waitForFunction(() => window.__hamham!.stats.sfx.rendered > 0, null, { timeout: 30_000 })
  const first = (await sfxStats(page)).rendered
  await page.waitForFunction((n) => window.__hamham!.stats.sfx.rendered > n, first, { timeout: 10_000 })

  await page.waitForFunction(() => window.__hamham!.app.audio.bank?.done === true, null, { timeout: 100_000 })
  const bank = await page.evaluate(() => {
    const b = window.__hamham!.app.audio.bank
    return {
      done: b.done,
      unavailable: b.unavailable,
      size: b.size,
      samples: b.samples,
      startedAt: b.startedAt,
      finishedAt: b.finishedAt
    }
  })
  const rendered = (await sfxStats(page)).rendered
  expect(bank.unavailable).toBe(false)
  expect(rendered).toBe(bank.size)
  expect(rendered).toBeGreaterThan(77)
  const seconds = (bank.finishedAt - bank.startedAt) / 1000
  const megabytes = (bank.samples * 4) / 1024 / 1024
  console.log(`[bank] ${rendered} buffers rendered in ${seconds.toFixed(1)} s, ${megabytes.toFixed(1)} MB`)
  // The engine was built in slices before the click.
  expect(await page.evaluate(() => window.__hamham!.app.audio.engine !== null)).toBe(true)
  expect(errors).toEqual([])
})

test('the first gesture takes no long task and the title music follows at once', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  await watchLongTasks(page)
  await openGame(page)
  await page.waitForFunction(() => window.__hamham!.app.audio.engine !== null, null, { timeout: 60_000 })
  // Let the title settle: the logo landing and the first renders are not what this checks.
  await page.waitForTimeout(1500)

  const marker = await page.evaluate(() => performance.now())
  // Time the unlock that the click itself triggers.
  await page.evaluate(() => {
    const a = window.__hamham!.app.audio
    const unlock = a.unlock.bind(a)
    window.__unlockMs = 0
    a.unlock = () => {
      const started = performance.now()
      unlock()
      window.__unlockMs = Math.max(window.__unlockMs!, performance.now() - started)
    }
  })
  // A key press is the gesture: it unlocks the audio without also opening the next screen, whose own cost is
  // not what this checks.
  await page.keyboard.press('ArrowDown')
  await page.waitForFunction(() => window.__hamham!.app.audio.ctx?.state === 'running', null, { timeout: 5000 })
  await page.waitForFunction(() => (window.__hamham!.app.audio.ctx?.currentTime ?? 0) > 0.2, null, { timeout: 5000 })
  await page.waitForTimeout(600)
  const unlockMs = await page.evaluate(() => window.__unlockMs!)
  const longTasks = await page.evaluate((from) => window.__longTasks!.filter((t) => t.start >= from), marker)
  console.log(
    `[first gesture] frames: ${JSON.stringify(await page.evaluate((from) => window.__frames!.filter((f) => f.start >= from - 50), marker))}`
  )
  console.log(
    `[first gesture] unlock() took ${unlockMs.toFixed(1)} ms; long tasks after it: ${JSON.stringify(longTasks)}`
  )
  expect(unlockMs).toBeLessThan(10)
  expect(longTasks.every((t) => t.duration < 50)).toBe(true)
  expect(errors).toEqual([])
})

test('muting stops the music from building voices and unmuting brings it back', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = collectErrors(page)
  await openGame(page)
  await page.waitForFunction(() => window.__hamham!.app.audio.engine !== null, null, { timeout: 60_000 })
  await page.evaluate(() => window.__hamham!.app.audio.unlock())
  await page.waitForFunction(() => window.__hamham!.app.audio.ctx?.state === 'running', null, { timeout: 5000 })
  // The bank's own renders build nodes in other contexts; this counts the live one only.
  await countNodes(page)

  await page.waitForTimeout(2000)
  const playing = await nodes(page)
  await page.evaluate(() => window.__hamham!.app.audio.setMuted(true))
  await page.waitForTimeout(500)
  const before = await nodes(page)
  await page.waitForTimeout(2500)
  const muted = (await nodes(page)) - before

  await page.evaluate(() => window.__hamham!.app.audio.setMuted(false))
  await page.waitForTimeout(300)
  const resumed0 = await nodes(page)
  await page.waitForTimeout(2000)
  const resumed = (await nodes(page)) - resumed0
  console.log(`[mute] nodes in 2 s playing: ${playing}, in 2.5 s muted: ${muted}, in 2 s after unmuting: ${resumed}`)
  expect(playing).toBeGreaterThan(20)
  expect(muted).toBe(0)
  expect(resumed).toBeGreaterThan(20)
  expect(errors).toEqual([])
})

test('in a stage the bot hits are played from buffers', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  await openGame(page)
  await page.evaluate(() => {
    const save = { version: 1, cleared: [1], unlocked: 2, best: {}, muted: false, seenOpening: true }
    localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify(save))
  })
  await reloadGame(page)
  await page.waitForFunction(() => window.__hamham!.app.audio.engine !== null, null, { timeout: 60_000 })
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page.locator('.stage-card').first().click()
  await page.waitForFunction(() => window.__hamham!.app.audio.bank?.done === true, null, { timeout: 100_000 })
  await page.evaluate(() => window.__hamham!.autopilot(true))
  for (let i = 0; i < 10; i++) {
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click()
  }
  await expect(page.locator('#hud')).toBeVisible()
  await page.waitForFunction(() => Boolean(window.__hamham?.world))

  const before = await sfxStats(page)
  await page.waitForTimeout(15_000)
  const after = await sfxStats(page)
  const buffered = after.buffered - before.buffered
  const live = after.live - before.live
  console.log(`[stage 1, bot, 15 s] buffered ${buffered}, live ${live}`)
  expect(buffered).toBeGreaterThan(3)
  // Every default pitch and every pitch the sound board uses is in the bank by now; anything else is rare.
  expect(live).toBeLessThanOrEqual(2)
  expect(errors).toEqual([])
})
