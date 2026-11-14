import { expect, test, type Browser, type Page } from '@playwright/test'
import { openGame, reloadGame } from './hoshi-no-hamham-helpers'

// The screens around play: a tap that opens one paints no art on the page (the art workers paint it ahead), a screen
// whose art is still on its way opens at once and shows its picture when the art arrives, and the pictures are the
// ones the page paints by itself without workers.

const SAVE_KEY = 'hoshi-no-hamham-v1'
const SAVE = {
  version: 1,
  cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  unlocked: 10,
  best: {},
  muted: true,
  seenOpening: true
}

/** How long a story may take to be up with its text running after the tap, on a page throttled 6x (ms). */
const STORY_UP_MS = 2500

interface ArtCount {
  clips: number
  tiles: number
  backdrops: number
  decor: number
}

interface DioramaHook {
  shot: unknown
  shown: unknown
  time: number
  since: number
  canvas: HTMLCanvasElement
  stop(): void
  draw(): void
}

interface Hook {
  screen: string
  stage: unknown
  session: unknown
  screenArt: { late: number }
  screens: {
    storyArt: DioramaHook
    resultArt: DioramaHook
    typer: { finish(): void } | null
    showResult(info: unknown): void
  }
}

type Hamham = {
  stats: { art: ArtCount }
  app: Hook
  world: {
    boss: { dead: boolean } | null
    damageBoss(n: number): void
    goalOpen: boolean
    goalX: number
    goalY: number
    player: { x: number; y: number }
  } | null
}

declare global {
  interface Window {
    __story?: { tap: number; text: number }
  }
}

const art = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as { __hamham: Hamham }).__hamham
    const { clips, tiles, backdrops } = h.stats.art
    return { clips, tiles, backdrops, late: h.app.screenArt.late }
  })

function errorsOf(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  return errors
}

/** The title with a save that opens every stage; `noWorkers` takes `Worker` away before the page loads. */
async function openTitle(page: Page, noWorkers = false) {
  if (noWorkers)
    await page.addInitScript(() => {
      delete (window as unknown as { Worker?: unknown }).Worker
    })
  await openGame(page)
  await page.evaluate(([key, save]) => localStorage.setItem(key as string, JSON.stringify(save)), [SAVE_KEY, SAVE])
  await reloadGame(page)
}

/** Finishes the typewriter of the open story page and turns it. */
async function nextPage(page: Page) {
  await page.evaluate(() => (window as unknown as { __hamham: Hamham }).__hamham.app.screens.typer?.finish())
  await page.locator('#story-next').click()
}

/** Distinct colours on a canvas (a blank canvas has one). */
const canvasColours = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const canvas = document.querySelector<HTMLCanvasElement>(sel)!
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    const seen = new Set<number>()
    for (let i = 0; i < data.length; i += 4) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
    return seen.size
  }, selector)

test('a tap on the title, the select, the story or the stage’s end paints no art on the page', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = errorsOf(page)
  await openTitle(page)
  // The title has been up for a few seconds: what its buttons open has been made ready meanwhile.
  await page.waitForTimeout(5000)
  const step = async (name: string, action: () => Promise<unknown>, settle = 1200) => {
    const before = await art(page)
    await action()
    await page.waitForTimeout(settle)
    const after = await art(page)
    for (const kind of ['clips', 'tiles', 'backdrops'] as const)
      expect(after[kind], `${name}: ${kind}`).toBe(before[kind])
    return after.late - before.late
  }
  expect(await step('あそびかた opens', () => page.locator('#help-open').click())).toBe(0)
  await expect(page.locator('#help-screen')).toBeVisible()
  await step('あそびかた closes', () => page.locator('#help-done').click())
  expect(await step('つづきから', () => page.getByRole('button', { name: 'つづきから' }).click(), 3000)).toBe(0)
  await expect(page.locator('#select-screen')).toBeVisible()
  await step('stage 3', () => page.locator('.stage-card').nth(2).click(), 5000)
  await expect(page.locator('#story-screen')).toBeVisible()
  for (let i = 1; i < 10; i++) {
    const session = await page.evaluate(() => Boolean((window as unknown as { __hamham: Hamham }).__hamham.app.session))
    if (session || !(await page.locator('#story-next').isVisible())) break
    await step(`story page ${i + 1}`, () => nextPage(page), 1500)
  }
  await page.waitForFunction(() => (window as unknown as { __hamham: Hamham }).__hamham.app.screen === 'play', null, {
    timeout: 30_000
  })
  await page.waitForTimeout(1500)
  await step(
    'a cleared stage and its result',
    async () => {
      await page.evaluate(() => {
        const w = (window as unknown as { __hamham: Hamham }).__hamham.world!
        if (w.boss && !w.boss.dead) w.damageBoss(999)
        w.goalOpen = true
        w.player.x = w.goalX
        w.player.y = w.goalY
      })
      await expect(page.locator('#result-screen')).toBeVisible({ timeout: 20_000 })
    },
    1500
  )
  expect(errors).toEqual([])
})

test('a story opened at once after a reload at a 6x CPU throttle is up and typing at once', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = errorsOf(page)
  await openTitle(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  try {
    await reloadGame(page)
    await page.getByRole('button', { name: 'つづきから' }).click()
    await expect(page.locator('#select-screen')).toBeVisible()
    // When the tap lands and when the story's first letter shows, in page time.
    await page.evaluate(() => {
      const record = { tap: 0, text: 0 }
      window.__story = record
      document.addEventListener('pointerdown', () => (record.tap ||= performance.now()), true)
      const pages = document.querySelector('#story-pages')!
      new MutationObserver(() => {
        if (!record.text && record.tap && (pages.textContent ?? '').trim().length > 0) record.text = performance.now()
      }).observe(pages, { childList: true, subtree: true, characterData: true })
    })
    await page.locator('.stage-card').nth(7).click()
    await expect(page.locator('#story-screen')).toBeVisible()
    await page.waitForFunction(() => Boolean(window.__story?.text), null, { timeout: 15_000 })
    const { tap, text } = await page.evaluate(() => window.__story!)
    expect(text - tap).toBeLessThan(STORY_UP_MS)
    // The picture comes when its art has arrived.
    await expect.poll(() => canvasColours(page, '#story-art'), { timeout: 30_000 }).toBeGreaterThan(30)
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {})
  }
  expect(errors).toEqual([])
})

/** The diorama at `which` once its shot is drawn, frozen at time 0, as a PNG. */
async function frozenPicture(page: Page, which: 'storyArt' | 'resultArt') {
  await page.waitForFunction(
    (key) => {
      const d = (window as unknown as { __hamham: Hamham }).__hamham.app.screens[key]
      return Boolean(d.shot) && d.shown === d.shot
    },
    which,
    { timeout: 30_000 }
  )
  return page.evaluate((key) => {
    const d = (window as unknown as { __hamham: Hamham }).__hamham.app.screens[key]
    d.stop()
    d.time = 0
    d.since = 99
    d.draw()
    return d.canvas.toDataURL()
  }, which)
}

/** The help screen's pictures once all of them are here: image sources and canvases as PNGs. */
async function helpPictures(page: Page) {
  await page.locator('#help-open').click()
  await expect(page.locator('#help-screen')).toBeVisible()
  await page.waitForFunction(() => {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('#help-screen img'))
    return imgs.length > 0 && imgs.every((img) => img.getAttribute('src') && img.complete)
  })
  // Animated sprites stand still under reduced motion: each canvas holds one frame once its clip is here.
  await page.waitForTimeout(500)
  const pictures = await page.evaluate(() => ({
    images: Array.from(document.querySelectorAll<HTMLImageElement>('#help-screen img')).map((img) => img.src),
    canvases: Array.from(document.querySelectorAll<HTMLCanvasElement>('#help-screen canvas')).map((c) => c.toDataURL())
  }))
  await page.locator('#help-done').click()
  return pictures
}

/** Two pictures of a story, the help screen's sprites and a result's backdrop, from one page. */
async function pictures(browser: Browser, noWorkers: boolean) {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = errorsOf(page)
  try {
    await openTitle(page, noWorkers)
    await page.waitForTimeout(1500)
    const help = await helpPictures(page)
    await page.getByRole('button', { name: 'つづきから' }).click()
    await page.locator('.stage-card').nth(1).click()
    await expect(page.locator('#story-screen')).toBeVisible()
    const first = await frozenPicture(page, 'storyArt')
    await nextPage(page)
    const second = await frozenPicture(page, 'storyArt')
    await page.evaluate(() => {
      const app = (window as unknown as { __hamham: Hamham }).__hamham.app
      app.screens.showResult({
        stage: app.stage,
        last: false,
        time: '1:00',
        seconds: 60,
        previousBest: null,
        newRecord: false,
        kills: 3,
        damage: 1,
        collected: null
      })
    })
    const result = await frozenPicture(page, 'resultArt')
    expect(errors).toEqual([])
    return { help, first, second, result }
  } finally {
    await context.close()
  }
}

test('the pictures are the ones the page paints by itself without workers', async ({ browser }) => {
  test.setTimeout(180_000)
  const remote = await pictures(browser, false)
  const local = await pictures(browser, true)
  expect(remote.help.images.length).toBeGreaterThan(5)
  expect(remote.help.canvases.length).toBeGreaterThan(5)
  expect(remote.help).toEqual(local.help)
  expect(remote.first).toBe(local.first)
  expect(remote.second).toBe(local.second)
  expect(remote.first).not.toBe(remote.second)
  expect(remote.result).toBe(local.result)
})
