import { expect, test, type Page } from '@playwright/test'

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
  await page.goto('/')
  await page.evaluate(
    ([key, data]) => {
      if (data) localStorage.setItem(key as string, JSON.stringify(data))
      else localStorage.removeItem(key as string)
    },
    [SAVE_KEY, save] as const
  )
  await page.reload()
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

const result = (damage: number) => ({
  stage: {
    no: 6,
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
  await page.reload()
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
