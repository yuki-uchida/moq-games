import { expect, test, type Page } from '@playwright/test'
import { openGame, reloadGame } from './hoshi-no-hamham-helpers'

const SAVE_KEY = 'hoshi-no-hamham-v1'

interface ScreensHook {
  actions: Record<string, (...args: unknown[]) => unknown>
  showResult(info: unknown): void
  showDead(): void
}

declare global {
  interface Window {
    __calls?: Record<string, number>
  }
}

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return errors
}

/** Loads the game with a given save (null: a fresh player). */
async function boot(page: Page, save: Record<string, unknown> | null) {
  await openGame(page)
  await page.evaluate(
    ([key, data]) => {
      if (data) localStorage.setItem(key as string, JSON.stringify(data))
      else localStorage.removeItem(key as string)
    },
    [SAVE_KEY, save] as const
  )
  await reloadGame(page)
  await expect(page.locator('#title-screen')).toBeVisible()
}

const saveWith = (extra: Record<string, unknown> = {}) => ({
  version: 1,
  cleared: [1, 2, 3],
  unlocked: 4,
  best: { 'stage-1': 83.4 },
  muted: true,
  seenOpening: true,
  ...extra
})

/** Counts calls of the screen actions the app bound. */
async function countActions(page: Page) {
  await page.evaluate(() => {
    const screens = (window as unknown as { __hamham: { app: { screens: ScreensHook } } }).__hamham.app.screens
    window.__calls = {}
    for (const name of Object.keys(screens.actions)) {
      const original = screens.actions[name]
      screens.actions[name] = (...args: unknown[]) => {
        window.__calls![name] = (window.__calls![name] ?? 0) + 1
        return original(...args)
      }
    }
  })
}

const calls = (page: Page) => page.evaluate(() => ({ ...window.__calls }))

interface CueLog {
  cue: string
  at: number
}

declare global {
  interface Window {
    __cueLog?: CueLog[]
    __keyLog?: number[]
  }
}

/** Wraps the app's cue board entry so every cue the screens ask for is logged with its time. */
async function recordCues(page: Page) {
  await page.evaluate(() => {
    const app = (window as unknown as { __hamham: { app: { cue(cue: string): void } } }).__hamham.app
    window.__cueLog = []
    window.__keyLog = []
    window.addEventListener('keydown', () => window.__keyLog!.push(performance.now()), true)
    const original = app.cue.bind(app)
    app.cue = (cue: string) => {
      window.__cueLog!.push({ cue, at: performance.now() })
      original(cue)
    }
  })
}

const cueLog = (page: Page) => page.evaluate(() => window.__cueLog!.slice())

/** True when `wanted` appears in `log` in this order (other cues may lie between). */
function inOrder(log: string[], wanted: string[]) {
  let at = 0
  for (const cue of log) if (cue === wanted[at]) at += 1
  return at === wanted.length
}

const result = (damage: number) => ({
  stage: {
    no: 6,
    theme: 'forest',
    name: '森の巣',
    clear: ['森の主を追い返し、巣を守り抜いた！'],
    collect: 8
  },
  last: false,
  time: '1:23',
  seconds: 83.4,
  previousBest: 90.2,
  newRecord: true,
  kills: 12,
  damage,
  collected: 8
})

async function showResult(page: Page, damage: number) {
  await page.evaluate(
    (info) =>
      (window as unknown as { __hamham: { app: { screens: ScreensHook } } }).__hamham.app.screens.showResult(info),
    result(damage)
  )
  await expect(page.locator('#result-screen')).toBeVisible()
}

/** Distinct colours on a canvas (a blank canvas has one). */
const canvasColours = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const canvas = document.querySelector<HTMLCanvasElement>(sel)!
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    const seen = new Set<number>()
    for (let i = 0; i < data.length; i += 4 * 7) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
    return seen.size
  }, selector)

test('the title shows the pixel logo over the self-playing demo', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page, null)
  const logo = await page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>('#logo-img')!
    const box = img.getBoundingClientRect()
    return { natural: img.naturalWidth, complete: img.complete, w: box.width, h: box.height }
  })
  expect(logo.complete).toBe(true)
  expect(logo.natural).toBe(384)
  expect(Math.round((logo.w / logo.h) * 100)).toBe(300)
  await expect(page.getByRole('heading', { name: '星のハムハム' })).toBeVisible()
  // The demo moves behind the logo: the canvas changes between two moments.
  const sample = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game')!
      return Array.from(
        canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height)
          .data.filter((_, i) => i % 97 === 0)
      )
    })
  await page.waitForTimeout(500)
  const a = await sample()
  await page.waitForTimeout(900)
  const b = await sample()
  const changed = a.filter((v, i) => Math.abs(v - b[i]) > 24).length
  expect(changed).toBeGreaterThan(a.length * 0.01)
  // No emoji or symbol icons on the title: every icon is a sprite.
  const text = await page.locator('#title-screen').innerText()
  expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿★▶🔒←]/u)
  expect(errors).toEqual([])
})

test('the menus work by keyboard alone and no key press acts twice', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page, null)
  await countActions(page)
  await expect(page.locator('#start')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#story-screen')).toBeVisible()
  expect((await calls(page)).newGame).toBe(1)

  // Each Enter either completes the page or turns it — never both, never two pages.
  const pages = await page.locator('#story-dots i').count()
  expect(pages).toBeGreaterThan(2)
  const activeDot = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('#story-dots i')).findIndex((i) => i.classList.contains('is-active'))
    )
  let last = 0
  for (let press = 0; press < pages * 2 + 2; press++) {
    if (!(await page.locator('#story-screen').isVisible())) break
    await page.keyboard.press('Enter')
    await page.waitForTimeout(60)
    if (!(await page.locator('#story-screen').isVisible())) break
    const now = await activeDot()
    expect(now - last).toBeLessThanOrEqual(1)
    last = now
  }
  await expect(page.locator('#select-screen')).toBeVisible()
  expect((await calls(page)).storyDone).toBe(1)

  // Stage select: the first stage is focused; arrows do not land on locked cards.
  const first = page.locator('#stage-grid .stage-card').first()
  await expect(first).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(first).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.locator('#story-screen')).toBeVisible()
  expect((await calls(page)).pickStage).toBe(1)
  await expect(page.locator('#story-kicker')).toHaveText('第1話')
  // Esc skips the story into the stage.
  await page.keyboard.press('Escape')
  await expect(page.locator('#story-screen')).toBeHidden()
  await page.waitForFunction(() => Boolean((window as unknown as { __hamham: { world: unknown } }).__hamham.world))
  expect((await calls(page)).storyDone).toBe(2)

  // Esc pauses, Esc resumes — once each.
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await expect(page.locator('#pause-screen')).toBeVisible()
  await expect(page.locator('#pause-resume')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('#pause-screen')).toBeHidden()
  await page.waitForTimeout(200)
  await expect(page.locator('#pause-screen')).toBeHidden()
  expect((await calls(page)).resume).toBe(1)
  expect(errors).toEqual([])
})

test('the stage select shows ten cards with emblems and portraits and locks the right ones', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page, saveWith())
  await page.getByRole('button', { name: 'つづきから' }).click()
  await expect(page.locator('#select-screen')).toBeVisible()
  const cards = page.locator('#stage-grid .stage-card')
  await expect(cards).toHaveCount(10)
  await expect(page.locator('#stage-grid .stage-card.is-locked')).toHaveCount(6)
  await expect(page.locator('#stage-grid .stage-card.is-cleared')).toHaveCount(3)
  for (let i = 0; i < 10; i++) {
    const card = cards.nth(i)
    await expect(card.locator('.emblem')).toHaveCount(1)
    if (i < 4) {
      await expect(card).toBeEnabled()
      await expect(card.locator('.face')).toHaveCount(1)
    } else {
      await expect(card).toBeDisabled()
      await expect(card.locator('.card-lock')).toHaveCount(1)
    }
  }
  // The newest open stage is highlighted and focused; the best time is shown.
  await expect(cards.nth(3)).toHaveClass(/is-new/)
  await expect(cards.nth(3)).toBeFocused()
  await expect(cards.nth(0).locator('.card-best')).toContainText('1:23.4')
  // Every sprite is a real image at a whole-number scale.
  const scales = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('#select-screen img.px')).map((img) => ({
      ok: img.complete && img.naturalWidth > 0,
      ratio: img.getBoundingClientRect().width / img.naturalWidth
    }))
  )
  expect(scales.length).toBeGreaterThan(20)
  for (const s of scales) {
    expect(s.ok).toBe(true)
    expect(Number.isInteger(Math.round(s.ratio * 1000) / 1000)).toBe(true)
  }
  expect(errors).toEqual([])
})

test('the story diorama draws and the typewriter completes on Enter', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page, saveWith())
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page.locator('#stage-grid .stage-card').nth(2).click()
  await expect(page.locator('#story-screen')).toBeVisible()
  await page.waitForTimeout(150)
  expect(await canvasColours(page, '#story-art')).toBeGreaterThan(30)
  // Typing: part of the page is still hidden.
  expect(((await page.locator('#story-pages .tw-rest').textContent()) ?? '').length).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  await expect(page.locator('#story-pages .tw-rest')).toHaveText('')
  await expect(page.locator('#story-pages p')).toHaveClass(/is-done/)
  // The whole page text is there, and the dots still point at page one.
  await expect(page.locator('#story-pages p')).toHaveText('ハム姫がばくろ団のボスにさらわれてしまいました！')
  await expect(page.locator('#story-dots i').first()).toHaveClass(/is-active/)
  await page.keyboard.press('Enter')
  await expect(page.locator('#story-dots i').nth(1)).toHaveClass(/is-active/)
  expect(errors).toEqual([])
})

test('the result tally shows time, enemies, hits and stars', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page, saveWith())
  await showResult(page, 0)
  const rows = page.locator('#result-stats .tally-row')
  await expect(rows).toHaveCount(4)
  // Enter first skips the count-up.
  await page.keyboard.press('Enter')
  await expect(page.locator('#result-screen')).toBeVisible()
  await expect(rows.nth(0)).toContainText('1:23.4')
  await expect(rows.nth(0)).toContainText('しんきろく！')
  await expect(page.locator('#result-stats')).toContainText('まえのベスト 1:30.2')
  await expect(rows.nth(1)).toContainText('12')
  await expect(rows.nth(2)).toContainText('0')
  await expect(rows.nth(2)).toContainText('ノーダメージ！')
  await expect(rows.nth(3)).toContainText('8 / 8')
  await expect(page.locator('#result-stars .star-cell.is-on')).toHaveCount(3)
  await expect(page.locator('#result-stars')).toContainText('ダメージ2回まで')
  await expect(page.locator('#result-next')).toBeFocused()

  await showResult(page, 3)
  await page.keyboard.press('Enter')
  await expect(page.locator('#result-stars .star-cell.is-on')).toHaveCount(1)
  await expect(page.locator('#result-stats .tally-row').nth(2)).not.toContainText('ノーダメージ')
  expect(errors).toEqual([])
})

test('the game over card shows the fallen hero and puts retry first', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page, saveWith())
  await page.evaluate(() =>
    (window as unknown as { __hamham: { app: { screens: ScreensHook } } }).__hamham.app.screens.showDead()
  )
  await expect(page.locator('#dead-screen')).toBeVisible()
  await expect(page.locator('#dead-retry')).toBeFocused()
  expect(await canvasColours(page, '#dead-art canvas')).toBeGreaterThan(4)
  await expect(page.locator('#dead-text')).not.toBeEmpty()
  expect(errors).toEqual([])
})

test('the game over card shows the hero lying dazed, swapping between the last two frames of the fall', async ({
  page
}) => {
  const errors = collectErrors(page)
  await boot(page, saveWith())
  await page.evaluate(() =>
    (window as unknown as { __hamham: { app: { screens: ScreensHook } } }).__hamham.app.screens.showDead()
  )
  await expect(page.locator('#dead-screen')).toBeVisible()
  const seen = await page.evaluate(async () => {
    const pixel = await import('/src/ui/pixel.ts')
    const canvas = document.querySelector<HTMLCanvasElement>('#dead-art canvas')!
    const frames = [0, 1, 2, 3, 4, 5].map((i) => pixel.spriteUrl('hero', 'die', i))
    const shown = new Set<number>()
    for (let i = 0; i < 26; i++) {
      shown.add(frames.indexOf(canvas.toDataURL()))
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return Array.from(shown).sort()
  })
  // Never a tumbling frame (and never an unknown picture): only 4 (flat on his back) and 5 (eyes swirling).
  expect(seen).toEqual([4, 5])
  expect(errors).toEqual([])
})

test('walking the menus by keyboard makes the interface sounds, one cue per key press', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page, saveWith())
  await recordCues(page)
  // Title: move the focus right and back left, then continue.
  await expect(page.locator('#continue')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(80)
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(80)
  await page.keyboard.press('Enter')
  await expect(page.locator('#select-screen')).toBeVisible()
  // The select opens with stage 4 newly unlocked: its chime follows shortly after, on its own.
  await page.waitForTimeout(600)
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(80)
  await page.keyboard.press('Space')
  await expect(page.locator('#story-screen')).toBeVisible()
  // Let the typewriter run for a while (blips), complete the page, then turn it.
  await page.waitForTimeout(450)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(80)
  await page.keyboard.press('Enter')
  await expect(page.locator('#story-dots i').nth(1)).toHaveClass(/is-active/)
  await page.waitForTimeout(120)
  // Esc skips the story into the stage.
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => Boolean((window as unknown as { __hamham: { world: unknown } }).__hamham.world))

  const log = await cueLog(page)
  const names = log.map((entry) => entry.cue)
  expect(
    inOrder(names, ['menu-move', 'menu-move', 'menu-select', 'unlock', 'menu-move', 'menu-select', 'text-blip']),
    names.join(' ')
  ).toBe(true)
  expect(inOrder(names, ['text-blip', 'page-turn', 'menu-back']), names.join(' ')).toBe(true)
  // Never two cues for one key press (the timer-driven ones — text, unlock, title — are not key presses).
  const keyed = log.filter((entry) => !['text-blip', 'unlock', 'title-start'].includes(entry.cue))
  const keys = await page.evaluate(() => window.__keyLog!.slice())
  for (const at of keys) {
    const within = keyed.filter((entry) => entry.at >= at - 1 && entry.at < at + 30)
    expect(
      within.map((entry) => entry.cue),
      `key at ${Math.round(at)} ms`
    ).toHaveLength(Math.min(1, within.length))
  }
  // Blips are spaced by at least the floor.
  const blips = log.filter((entry) => entry.cue === 'text-blip')
  expect(blips.length).toBeGreaterThan(3)
  blips.forEach((blip, i) => {
    if (i > 0) expect(blip.at - blips[i - 1].at).toBeGreaterThanOrEqual(30)
  })
  expect(errors).toEqual([])
})

test('the title logo lands with its sound, once, and the sound is dropped if the screen changes first', async ({
  page
}) => {
  const errors = collectErrors(page)
  await boot(page, saveWith())
  await recordCues(page)
  const app = () =>
    page.evaluate(() => (window as unknown as { __hamham: { app: { openTitle(): void } } }).__hamham.app.openTitle())
  await app()
  await page.waitForTimeout(600)
  expect((await cueLog(page)).map((entry) => entry.cue)).toEqual(['title-start'])
  // Leaving before the logo lands: no late chime on the next screen.
  await app()
  await page.evaluate(() =>
    (window as unknown as { __hamham: { app: { openSelect(): void } } }).__hamham.app.openSelect()
  )
  await page.waitForTimeout(700)
  expect((await cueLog(page)).filter((entry) => entry.cue === 'title-start')).toHaveLength(1)
  expect(errors).toEqual([])
})

test('the result tally ticks while counting, chimes the new record and ends with the done sound', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page, saveWith())
  await recordCues(page)
  await showResult(page, 1)
  await expect(page.locator('.result-card')).toHaveClass(/is-tallied/, { timeout: 8000 })
  const log = await cueLog(page)
  const names = log.map((entry) => entry.cue)
  expect(inOrder(names, ['tally-tick', 'new-record', 'tally-tick', 'tally-done']), names.join(' ')).toBe(true)
  expect(names.filter((cue) => cue === 'new-record')).toHaveLength(1)
  expect(names.filter((cue) => cue === 'tally-done')).toHaveLength(1)
  expect(names[names.length - 1]).toBe('tally-done')
  const ticks = log.filter((entry) => entry.cue === 'tally-tick')
  expect(ticks.length).toBeGreaterThan(4)
  ticks.forEach((tick, i) => {
    // The 45 ms floor is measured on frame times; the log uses the clock inside the frame, so allow its jitter.
    if (i > 0) expect(tick.at - ticks[i - 1].at).toBeGreaterThanOrEqual(30)
  })
  expect(errors).toEqual([])
})

test('skipping the count-up does not stack the closing chime on a new record', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page, saveWith())
  await recordCues(page)
  await showResult(page, 1)
  await page.keyboard.press('Enter')
  await expect(page.locator('.result-card')).toHaveClass(/is-tallied/)
  const names = (await cueLog(page)).map((entry) => entry.cue)
  expect(names.filter((cue) => cue === 'new-record')).toHaveLength(1)
  expect(names).not.toContain('tally-done')
  expect(errors).toEqual([])
})

test('the result screen has a quiet backdrop of its own, never the black canvas', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page, saveWith())
  await showResult(page, 0)
  await page.waitForTimeout(300)
  const backdrop = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#result-art')!
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let sum = 0
    const colours = new Set<number>()
    for (let i = 0; i < data.length; i += 4 * 5) {
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3
      colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
    }
    const screen = document.querySelector('#result-screen')!.getBoundingClientRect()
    const box = canvas.getBoundingClientRect()
    return {
      mean: sum / (data.length / 20),
      colours: colours.size,
      covers: Math.abs(box.width - screen.width) < 2 && Math.abs(box.height - screen.height) < 2,
      dim: getComputedStyle(canvas).filter
    }
  })
  expect(backdrop.covers).toBe(true)
  expect(backdrop.colours).toBeGreaterThan(30)
  // The world is dimmed by the stylesheet (about half), and what is left is still clearly not black.
  expect(backdrop.dim).toContain('brightness')
  expect(backdrop.mean * 0.5).toBeGreaterThan(25)
  expect(errors).toEqual([])
})

test('the pause sliders call through and survive a reload', async ({ page }) => {
  const errors = collectErrors(page)
  await boot(page, saveWith({ volume: { master: 1, music: 0.8, sfx: 1 } }))
  const openPause = async () => {
    await page.getByRole('button', { name: 'つづきから' }).click()
    await page.locator('#stage-grid .stage-card').first().click()
    await page.locator('#story-skip').click()
    await page.waitForFunction(() => Boolean((window as unknown as { __hamham: { world: unknown } }).__hamham.world))
    await page.waitForTimeout(300)
    await page.keyboard.press('Escape')
    await expect(page.locator('#pause-screen')).toBeVisible()
  }
  await openPause()
  await expect(page.locator('#volume-music')).toHaveValue('80')
  await page.locator('#volume-music').focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('#volume-music')).toHaveValue('70')
  await page.locator('#volume-sfx').fill('40')
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).volume, SAVE_KEY)
  expect(saved.music).toBeCloseTo(0.7)
  expect(saved.sfx).toBeCloseTo(0.4)
  // Still paused: the arrows moved the slider, not the hero.
  await expect(page.locator('#pause-screen')).toBeVisible()
  await reloadGame(page)
  await openPause()
  await expect(page.locator('#volume-music')).toHaveValue('70')
  await expect(page.locator('#volume-sfx')).toHaveValue('40')
  await expect(page.locator('#volume-master')).toHaveValue('100')
  expect(errors).toEqual([])
})

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
  { width: 390, height: 844 },
  { width: 320, height: 568 }
]

/** No horizontal scroll; every visible button and card is inside the viewport and at least 44 px. */
async function checkLayout(page: Page, label: string, screen: string) {
  const report = await page.evaluate((sel) => {
    const root = document.querySelector<HTMLElement>(sel)!
    const doc = document.scrollingElement!
    const problems: string[] = []
    if (doc.scrollWidth > window.innerWidth + 1) problems.push(`page scrolls sideways (${doc.scrollWidth})`)
    if (root.scrollWidth > root.clientWidth + 1) problems.push(`screen scrolls sideways (${root.scrollWidth})`)
    const controls = Array.from(root.querySelectorAll<HTMLElement>('button, input, a[href]')).filter(
      (el) => el.getClientRects().length > 0
    )
    for (const el of controls) {
      const r = el.getBoundingClientRect()
      const name = el.id || el.className
      if (r.width < 43.5 || r.height < 43.5) problems.push(`${name} is ${r.width}×${r.height}`)
      // Inside the viewport horizontally; vertically either inside or reachable in a scrolling box.
      if (r.left < -1 || r.right > window.innerWidth + 1) problems.push(`${name} is clipped sideways`)
      let scroller: HTMLElement | null = el.parentElement
      while (scroller && scroller !== root && !/auto|scroll/.test(getComputedStyle(scroller).overflowY))
        scroller = scroller.parentElement
      const scrolls =
        scroller &&
        /auto|scroll/.test(getComputedStyle(scroller).overflowY) &&
        scroller.scrollHeight > scroller.clientHeight + 1
      if (!scrolls && (r.top < -1 || r.bottom > window.innerHeight + 1)) problems.push(`${name} is clipped`)
    }
    const small = Array.from(root.querySelectorAll<HTMLElement>('*')).filter((el) => {
      if (!el.childNodes.length || el.getClientRects().length === 0) return false
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim())
      return hasText && parseFloat(getComputedStyle(el).fontSize) < 12
    })
    for (const el of small) problems.push(`text under 12px: ${el.textContent}`)
    return problems
  }, screen)
  expect(report, `${label} ${screen}`).toEqual([])
}

for (const viewport of VIEWPORTS)
  test(`the screens fit at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    test.setTimeout(60_000)
    const errors = collectErrors(page)
    await page.setViewportSize(viewport)
    const label = `${viewport.width}×${viewport.height}`
    await boot(page, saveWith())
    await page.waitForTimeout(300)
    await checkLayout(page, label, '#title-screen')
    await page.getByRole('button', { name: 'あそびかた' }).click()
    await page.waitForTimeout(300)
    await checkLayout(page, label, '#help-screen')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'つづきから' }).click()
    await page.waitForTimeout(300)
    await checkLayout(page, label, '#select-screen')
    await page.locator('#stage-grid .stage-card').nth(1).click()
    await page.waitForTimeout(300)
    await checkLayout(page, label, '#story-screen')
    await page.locator('#story-skip').click()
    await page.waitForTimeout(400)
    await page.keyboard.press('Escape')
    await expect(page.locator('#pause-screen')).toBeVisible()
    await page.waitForTimeout(250)
    await checkLayout(page, label, '#pause-screen')
    await showResult(page, 1)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(250)
    await checkLayout(page, label, '#result-screen')
    await page.evaluate(() =>
      (window as unknown as { __hamham: { app: { screens: ScreensHook } } }).__hamham.app.screens.showDead()
    )
    await page.waitForTimeout(300)
    await checkLayout(page, label, '#dead-screen')
    await page.evaluate(() => (window as unknown as { __hamham: { openEnding(): void } }).__hamham.openEnding())
    await page.waitForTimeout(300)
    await checkLayout(page, label, '#ending-screen')
    expect(errors).toEqual([])
  })

/** Upright phones: the screens around play use the whole height and keep their rows tidy. */
const PHONES = [
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 360, height: 640 },
  { width: 320, height: 568 }
]

interface Box {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

const boxOf = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)!.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height } as Box
  }, selector)

/** Opens the first story page of stage 2 (the save has stages 1-3 cleared). */
async function openStory(page: Page) {
  await boot(page, saveWith())
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page.locator('#stage-grid .stage-card').nth(1).click()
  await expect(page.locator('#story-screen')).toBeVisible()
  await page.waitForTimeout(700)
}

/** Pages through the ending until the credits roll (the last page, then the statistics and the way back). */
async function openEndingCredits(page: Page) {
  for (let i = 0; i < 30; i++) {
    if (await page.locator('#ending-credits').isVisible()) break
    await page.locator('#ending-next').click()
    await page.waitForTimeout(120)
  }
  await expect(page.locator('#ending-credits')).toBeVisible()
  await page.waitForTimeout(500)
}

/** A layout that fits is centred and fills most of the screen; one that does not starts at the top and scrolls. */
async function expectCentredOrScrolling(page: Page, screen: string, label: string) {
  const state = await page.evaluate((sel) => {
    const root = document.querySelector<HTMLElement>(sel)!
    const r = root.querySelector('.story-layout')!.getBoundingClientRect()
    return {
      top: r.top,
      bottom: r.bottom,
      height: r.height,
      viewport: window.innerHeight,
      scrolls: root.scrollHeight > root.clientHeight + 1
    }
  }, screen)
  if (state.height < state.viewport - 1 && !state.scrolls) {
    expect(Math.abs(state.top - (state.viewport - state.bottom)), `${label} margins differ`).toBeLessThanOrEqual(24)
    expect(state.height, `${label} fills the screen`).toBeGreaterThanOrEqual(state.viewport * 0.6)
  } else {
    expect(Math.abs(state.top), `${label} starts at the top`).toBeLessThanOrEqual(1)
    expect(state.scrolls || state.height <= state.viewport + 1, `${label} scrolls`).toBe(true)
  }
}

/** The two buttons of a footer share a row and are equally wide; the dots (if any) sit above them. */
async function expectTwinButtons(page: Page, first: string, second: string, dots: string | null, label: string) {
  const a = await boxOf(page, first)
  const b = await boxOf(page, second)
  expect(Math.abs(a.top - b.top), `${label} buttons share a row`).toBeLessThanOrEqual(2)
  expect(Math.abs(a.width - b.width), `${label} buttons are equally wide`).toBeLessThanOrEqual(1)
  expect(a.right, `${label} buttons do not overlap`).toBeLessThanOrEqual(b.left + 1)
  if (dots) {
    const d = await boxOf(page, dots)
    expect(d.bottom, `${label} dots sit above the buttons`).toBeLessThanOrEqual(a.top + 1)
  }
}

for (const phone of PHONES)
  test.describe(`upright phone ${phone.width}×${phone.height}`, () => {
    test.use({ viewport: phone, hasTouch: true, isMobile: true })
    const label = `${phone.width}×${phone.height}`

    test('the story uses the screen and keeps its footer tidy', async ({ page }) => {
      test.setTimeout(60_000)
      const errors = collectErrors(page)
      await openStory(page)
      await expectCentredOrScrolling(page, '#story-screen', `${label} story`)
      await expectTwinButtons(page, '#story-skip', '#story-next', '#story-dots', `${label} story`)
      expect(errors).toEqual([])
    })

    test('the stage select heading stays on one line beside the back button and the badge', async ({ page }) => {
      test.setTimeout(60_000)
      await boot(page, saveWith())
      await page.getByRole('button', { name: 'つづきから' }).click()
      await expect(page.locator('#select-screen')).toBeVisible()
      await page.waitForTimeout(500)
      const heading = await page.evaluate(() => {
        const el = document.querySelector('#select-title')!
        const style = getComputedStyle(el)
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2
        return { height: el.getBoundingClientRect().height, lineHeight }
      })
      expect(heading.height, `${label} heading wraps`).toBeLessThan(heading.lineHeight * 1.6)
      const title = await boxOf(page, '#select-title')
      for (const other of ['#select-back', '#select-progress']) {
        const box = await boxOf(page, other)
        const apart = title.right <= box.left + 0.5 || box.right <= title.left + 0.5
        expect(apart, `${label} heading touches ${other}`).toBe(true)
      }
      // The back button keeps its name for screen readers whatever it shows.
      await expect(page.getByRole('button', { name: 'タイトル' })).toBeVisible()
    })

    test('the ending credits take the screen and fade at both edges; the card follows', async ({ page }) => {
      test.setTimeout(90_000)
      const errors = collectErrors(page)
      await boot(page, saveWith({ cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], unlocked: 10 }))
      await page.evaluate(() => (window as unknown as { __hamham: { openEnding(): void } }).__hamham.openEnding())
      await expect(page.locator('#ending-screen')).toBeVisible()
      await page.waitForTimeout(600)
      // The pages before the credits: the layout is centred or scrolls, as on the story.
      await expectCentredOrScrolling(page, '#ending-screen', `${label} ending`)
      await openEndingCredits(page)
      const credits = await boxOf(page, '#ending-credits')
      expect(credits.height, `${label} credits area`).toBeGreaterThanOrEqual(phone.height * 0.6)
      // Freeze the roll and walk through it: no line is ever cut by a hard edge.
      const report = await page.evaluate(() => {
        const win = document.querySelector<HTMLElement>('.credits-window')!
        const roll = document.querySelector<HTMLElement>('.credits-roll')!
        const mask = getComputedStyle(win).maskImage || getComputedStyle(win).webkitMaskImage
        const animation = roll.getAnimations()[0]
        animation.pause()
        const duration = Number(animation.effect!.getComputedTiming().duration)
        const view = win.getBoundingClientRect()
        const fade = view.height * 0.15
        const entries = Array.from(
          roll.querySelectorAll<HTMLElement>('.credits-name, .credits-title, .credits-line, .credits-end')
        )
        const problems: string[] = []
        const readable = new Set<HTMLElement>()
        let fullyShown = 0
        const STEPS = 160
        for (let step = 0; step <= STEPS; step++) {
          animation.currentTime = (duration * step) / STEPS
          for (const entry of entries) {
            const r = entry.getBoundingClientRect()
            if (r.bottom <= view.top || r.top >= view.bottom) continue
            const crossesTop = r.top < view.top - 0.5
            const crossesBottom = r.bottom > view.bottom + 0.5
            if (crossesTop && r.bottom - view.top > fade + 0.5) problems.push(`${entry.textContent} is cut at the top`)
            if (crossesBottom && view.bottom - r.top > fade + 0.5)
              problems.push(`${entry.textContent} is cut at the bottom`)
            if (!crossesTop && !crossesBottom) fullyShown += 1
            if (r.top >= view.top + fade * 0.5 && r.bottom <= view.bottom - fade * 0.5) readable.add(entry)
          }
        }
        return {
          mask,
          problems: Array.from(new Set(problems)),
          fullyShown,
          unreadable: entries.filter((entry) => !readable.has(entry)).map((entry) => entry.textContent)
        }
      })
      expect(report.mask, `${label} credits fade`).not.toBe('none')
      expect(report.problems, `${label} credits cut`).toEqual([])
      expect(report.fullyShown).toBeGreaterThan(0)
      // Every entry is whole inside the window at some moment, so it can be read.
      expect(report.unreadable, `${label} unreadable entries`).toEqual([])
      // The statistics and the way back appear once the roll is over, and can be used.
      await page.evaluate(() => {
        for (const animation of document.querySelector('.credits-roll')!.getAnimations()) animation.finish()
      })
      await page.waitForTimeout(900)
      await expect(page.locator('#ending-stats')).toBeVisible()
      await expectTwinButtons(page, '#ending-select', '#ending-title-button', null, `${label} ending`)
      await page.locator('#ending-select').click({ trial: true })
      expect(errors).toEqual([])
    })
  })

test.describe('the title on the shortest upright phone', () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true })

  test('the logo keeps its clean half scale high in the sky and leaves the demo visible', async ({ page }) => {
    test.setTimeout(60_000)
    await boot(page, saveWith())
    await page.waitForTimeout(1500)
    const logo = await boxOf(page, '.logo-art')
    const stage = await boxOf(page, '#stage-wrap')
    // 192×64 on every upright phone (one art pixel per device pixel on a 2× screen).
    expect([logo.width, logo.height]).toEqual([192, 64])
    // Rule: the logo's bottom edge is above 45 % of the stage's height, clear of the demo's ground.
    expect(logo.bottom - stage.top).toBeLessThanOrEqual(stage.height * 0.45)
    expect(logo.top).toBeGreaterThanOrEqual(stage.top)
    // The tagline starts under the stage's frame.
    const tagline = await boxOf(page, '.title-tagline')
    expect(tagline.top).toBeGreaterThanOrEqual(stage.bottom)
  })
})

test('reduced motion shows text, tallies and credits at once', async ({ page }) => {
  const errors = collectErrors(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await boot(page, saveWith())
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page.locator('#stage-grid .stage-card').first().click()
  await expect(page.locator('#story-pages .tw-rest')).toHaveText('')
  expect(await canvasColours(page, '#story-art')).toBeGreaterThan(30)
  await showResult(page, 0)
  await expect(page.locator('#result-stars .star-cell.is-on.is-in')).toHaveCount(3)
  await expect(page.locator('#result-stats .tally-row').first()).toContainText('1:23.4')
  // The card's drop is cut to a near-instant step; the screen itself only fades.
  const motion = await page.evaluate(() => ({
    card: parseFloat(getComputedStyle(document.querySelector('.result-card')!).animationDuration),
    screen: getComputedStyle(document.querySelector('#result-screen')!).animationName
  }))
  expect(motion.card).toBeLessThanOrEqual(0.01)
  expect(['none', 'screen-in']).toContain(motion.screen)
  expect(errors).toEqual([])
})
