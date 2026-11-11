import { expect, test, type Page } from '@playwright/test'
import { openGame, reloadGame } from './hoshi-no-hamham-helpers'

// Loading: the instant splash, the staged boot, the warm-up before a stage starts and the adaptive backing scale.

const SAVE_KEY = 'hoshi-no-hamham-v1'
const SAVE = {
  version: 1,
  cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  unlocked: 10,
  best: {},
  muted: true,
  seenOpening: true
}

/**
 * Longest main-thread block allowed while the page boots. Art is drawn one clip per slice; the largest single
 * clip is the title logo (about 0.3 s on a desktop), so the bound sits above it and far below the 1.3–1.9 s block
 * of the old one-chunk boot.
 */
const LONG_TASK_LIMIT_MS = 500

type Hamham = { app: { session: unknown | null; renderer: { k: number } } }
interface Recorder {
  tasks: [number, number][]
  bar: number[]
  leaving: boolean
  frames: number[]
}

declare global {
  interface Window {
    __rec: Recorder
    __frames: { t: number[]; on: boolean }
  }
}

/** Records long tasks, the splash bar's value and whether the splash ever started a fade, from the first byte. */
async function recordBoot(page: Page) {
  await page.addInitScript(() => {
    const rec: Recorder = { tasks: [], bar: [], leaving: false, frames: [] }
    window.__rec = rec
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) rec.tasks.push([e.startTime, e.duration])
    }).observe({ type: 'longtask', buffered: true })
    const watch = () => {
      const splash = document.getElementById('splash')
      const bar = document.getElementById('splash-bar')
      if (!splash || !bar) return false
      const read = () => {
        const v = Number(bar.getAttribute('aria-valuenow'))
        if (rec.bar[rec.bar.length - 1] !== v) rec.bar.push(v)
      }
      read()
      new MutationObserver(() => {
        read()
        if (splash.classList.contains('is-leaving')) rec.leaving = true
      }).observe(splash, { attributes: true, subtree: true, attributeFilter: ['aria-valuenow', 'class'] })
      return true
    }
    if (!watch()) {
      const waiter = new MutationObserver(() => watch() && waiter.disconnect())
      waiter.observe(document, { childList: true, subtree: true })
    }
  })
}

/** Starts recording frame timestamps in the page; stop with `stopFrames`. */
async function startFrames(page: Page) {
  await page.evaluate(() => {
    window.__frames = { t: [], on: true }
    const tick = (t: number) => {
      window.__frames.t.push(t)
      if (window.__frames.on) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

async function stopFrames(page: Page) {
  return page.evaluate(() => {
    window.__frames.on = false
    return { t: window.__frames.t, now: performance.now() }
  })
}

const intervals = (t: number[], from: number, to: number) => {
  const out: number[] = []
  for (let i = 1; i < t.length; i++) if (t[i] >= from && t[i] < to) out.push(t[i] - t[i - 1])
  return out
}

async function openTitle(page: Page) {
  await openGame(page)
  await page.evaluate(([key, save]) => localStorage.setItem(key as string, JSON.stringify(save)), [SAVE_KEY, SAVE])
  await reloadGame(page)
}

/** From the title to the story of stage `no`, leaving it open. */
async function openStory(page: Page, no: number) {
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page
    .locator('.stage-card')
    .nth(no - 1)
    .click()
  await expect(page.locator('#story-screen')).toBeVisible()
}

/** Clicks through the story as fast as a player could and returns when play has begun. */
async function finishStory(page: Page) {
  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(() => Boolean((window as unknown as { __hamham: Hamham }).__hamham.app.session))) return
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click({ timeout: 2000 }).catch(() => {})
    await page.waitForTimeout(30)
  }
  await page.waitForFunction(() => Boolean((window as unknown as { __hamham: Hamham }).__hamham.app.session), null, {
    timeout: 30_000
  })
}

test('the splash is on screen before the game exists, its bar fills and it leaves when the title is drawn', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  await recordBoot(page)
  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('#splash')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __hamham?: unknown }).__hamham)).toBeUndefined()
  await expect(page.locator('#splash .splash-text')).toHaveText('よみこみちゅう…')
  await expect(page.locator('#splash-bar')).toHaveAttribute('role', 'progressbar')
  // The mark is real game art (a data-URL PNG), not an emoji or a web icon.
  const marks = await page
    .locator('#splash .splash-mark img')
    .evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')))
  expect(marks.length).toBeGreaterThan(0)
  for (const src of marks) expect(src).toMatch(/^data:image\/png;base64,/)

  await page.waitForFunction(() => Boolean((window as unknown as { __hamham?: unknown }).__hamham), null, {
    timeout: 30_000
  })
  await expect(page.locator('#splash')).toHaveCount(0)
  await expect(page.locator('#title-screen')).toBeVisible()
  await expect(page.getByRole('button', { name: 'はじめから' })).toBeVisible()

  const rec = await page.evaluate(() => window.__rec)
  // The bar only moves forward, in several steps, and ends full.
  expect(rec.bar.length).toBeGreaterThanOrEqual(4)
  expect(rec.bar).toEqual([...rec.bar].sort((a, b) => a - b))
  expect(rec.bar[0]).toBeLessThan(10)
  expect(rec.bar[rec.bar.length - 1]).toBe(100)
  expect(rec.leaving).toBe(true)
  const longest = Math.max(0, ...rec.tasks.map(([, duration]) => duration))
  expect(longest).toBeLessThan(LONG_TASK_LIMIT_MS)
  expect(errors).toEqual([])
})

test('the splash animates with the compositor only, and not at all under reduced motion', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('#splash')).toBeVisible()
  const moving = await page.evaluate(() => {
    const names = ['.splash-mark', '#splash-fill']
    return names.map((sel) => {
      const el = document.querySelector(sel)!
      const style = getComputedStyle(el)
      return [style.animationName, style.transitionProperty]
    })
  })
  expect(moving[0][0]).toBe('splash-bob')
  expect(moving[1][1]).toBe('transform')
})

test('reduced motion: the splash does not animate and leaves without a fade', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await recordBoot(page)
  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('#splash')).toBeVisible()
  const names = await page.evaluate(() =>
    ['.splash-mark', '.splash-mark img', '#splash-fill'].map((sel) => {
      const style = getComputedStyle(document.querySelector(sel)!)
      return [style.animationName, style.transitionDuration]
    })
  )
  for (const [animation, transition] of names) {
    expect(animation).toBe('none')
    expect(transition).toBe('0s')
  }
  await page.waitForFunction(() => Boolean((window as unknown as { __hamham?: unknown }).__hamham), null, {
    timeout: 30_000
  })
  await expect(page.locator('#splash')).toHaveCount(0)
  await expect(page.locator('#title-screen')).toBeVisible()
  expect(await page.evaluate(() => window.__rec.leaving)).toBe(false)
  expect(errors).toEqual([])
})

for (const no of [1, 10]) {
  test(`stage ${no}: no hitch in its first two seconds after the story has been on screen`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
    await openTitle(page)
    await openStory(page, no)
    await page.waitForTimeout(3000)
    await startFrames(page)
    await finishStory(page)
    const begin = await page.evaluate(() => performance.now())
    await page.waitForTimeout(2300)
    const { t } = await stopFrames(page)
    const first = intervals(t, begin, begin + 2000)
    expect(first.length).toBeGreaterThan(10)
    expect(Math.max(...first)).toBeLessThan(150)
    // The warm-up card is gone once play runs.
    await expect(page.locator('.warm-note:not([hidden])')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test('play waits behind a loading card when the story ends before the stage is ready', async ({
  page,
  browserName
}) => {
  test.skip(browserName !== 'chromium', 'uses the Chrome DevTools protocol to slow the CPU')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openTitle(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  await openStory(page, 10)
  await page.locator('#story-skip').click()
  await expect(page.locator('.warm-note')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.warm-note')).toContainText('よみこみちゅう…')
  await expect(page.locator('#hud')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.warm-note')).toBeHidden()
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  expect(errors).toEqual([])
})

test('at a device pixel ratio of 3 the backing store stays a whole multiple of 640×360 during play', async ({
  browser
}) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openTitle(page)
  await openStory(page, 1)
  await finishStory(page)
  const scales: number[] = []
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000)
    const size = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game')!
      return {
        w: canvas.width,
        h: canvas.height,
        k: (window as unknown as { __hamham: Hamham }).__hamham.app.renderer.k
      }
    })
    expect(size.w % 640).toBe(0)
    expect(size.w / 640).toBe(size.k)
    expect(size.h).toBe(size.k * 360)
    expect(size.k).toBeGreaterThanOrEqual(1)
    expect(size.k).toBeLessThanOrEqual(4)
    scales.push(size.k)
  }
  // The scale only ever goes down during play.
  expect(scales).toEqual([...scales].sort((a, b) => b - a))
  expect(errors).toEqual([])
  await context.close()
})
