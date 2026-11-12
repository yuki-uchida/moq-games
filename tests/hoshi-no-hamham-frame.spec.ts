import { expect, test, type Page } from '@playwright/test'
import { openGame, reloadGame } from './hoshi-no-hamham-helpers'

/**
 * The keyboard-focus frame reaches 12 px outside the focused control (a 9 px inset plus its 3 px ink line). Nothing
 * to read may sit under it: the tag of the newest stage is stacked above it, a result's text keeps clear of the
 * button below it. And while the game is paused, the touch controls step aside.
 */
const SAVE_KEY = 'hoshi-no-hamham-v1'
const FRAME_REACH = 12

interface Hamham {
  world: unknown
  app: { screens: { showResult(info: unknown): void } }
}

/** Stages 1 to 3 cleared: stage 4 is the newest one. */
async function boot(page: Page) {
  await openGame(page)
  await page.evaluate(([key, data]) => localStorage.setItem(key, data), [
    SAVE_KEY,
    JSON.stringify({ version: 1, cleared: [1, 2, 3], unlocked: 4, best: {}, muted: true, seenOpening: true })
  ] as const)
  await reloadGame(page)
  await expect(page.locator('#title-screen')).toBeVisible()
}

/** A result whose text is as long as the longest in the game (three lines on a small phone). */
const LONG_RESULT = {
  stage: {
    no: 2,
    theme: 'meadow',
    name: '空から来た姫',
    clear: ['ばくろ団はてんでばらばらに逃げていきました。ハム姫はほっと胸をなでおろしました。でも、そのあと…。'],
    collect: 0
  },
  last: false,
  time: '1:23.4',
  seconds: 83.4,
  previousBest: 90.2,
  newRecord: true,
  kills: 12,
  damage: 1,
  collected: null
}

const SIZES = [
  { width: 1280, height: 720 },
  { width: 844, height: 390 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
  { width: 320, height: 568 }
]

for (const size of SIZES)
  test.describe(`the focus frame at ${size.width}×${size.height}`, () => {
    test.use({ viewport: size })
    const label = `${size.width}×${size.height}`

    test('the tag of the newest stage is stacked above the frame of its focused card', async ({ page }) => {
      await boot(page)
      // With a save, 「つづきから」 is focused: Enter opens the stage select by keyboard, so the frame shows.
      await page.keyboard.press('Enter')
      await expect(page.locator('#select-screen')).toBeVisible()
      await page.waitForTimeout(500)
      const state = await page.evaluate(() => {
        const tag = document.querySelector<HTMLElement>('.card-new')!
        const card = tag.closest<HTMLElement>('.stage-card')!
        const frame = getComputedStyle(card, '::after')
        const style = getComputedStyle(tag)
        const t = tag.getBoundingClientRect()
        const c = card.getBoundingClientRect()
        return {
          focused: document.activeElement === card,
          frameDrawn: frame.content !== 'none' && parseFloat(frame.borderTopWidth) > 0,
          frameZ: frame.zIndex,
          tagPositioned: style.position !== 'static',
          tagZ: Number(style.zIndex),
          // The tag does lie on the frame's band, which is why the stacking matters.
          tagOnTheBand: t.bottom > c.top - 12 && t.top < c.top
        }
      })
      expect(state.focused, `${label}: the newest card is focused`).toBe(true)
      expect(state.frameDrawn, `${label}: the frame is drawn`).toBe(true)
      expect(state.tagOnTheBand, `${label}: the tag lies on the frame's band`).toBe(true)
      expect(state.frameZ, `${label}: the frame has no z-index of its own`).toBe('auto')
      expect(state.tagPositioned && state.tagZ > 0, `${label}: the tag is stacked above the frame`).toBe(true)
    })

    test('the result text keeps clear of the frame of the button under it', async ({ page }) => {
      await boot(page)
      await page.evaluate(
        (info) => (window as unknown as { __hamham: Hamham }).__hamham.app.screens.showResult(info),
        LONG_RESULT
      )
      await expect(page.locator('#result-screen')).toBeVisible()
      // Enter completes the tally; the first button then holds the focus.
      await page.keyboard.press('Enter')
      await expect(page.locator('#result-next')).toBeFocused()
      await page.waitForTimeout(600)
      const state = await page.evaluate(() => {
        const range = document.createRange()
        range.selectNodeContents(document.querySelector('#result-text')!)
        const lines = Array.from(range.getClientRects())
        const next = document.querySelector('#result-next')!.getBoundingClientRect()
        const card = document.querySelector('.result-card')!.getBoundingClientRect()
        const screen = document.querySelector<HTMLElement>('#result-screen')!
        return {
          gap: next.top - Math.max(...lines.map((r) => r.bottom)),
          fits: card.top >= 0 && card.bottom <= window.innerHeight,
          scrolls: screen.scrollHeight > screen.clientHeight + 1,
          wrappedLabels: Array.from(document.querySelectorAll<HTMLElement>('.tally-label'))
            .filter((el) => el.getClientRects().length > 0)
            .filter((el) => el.getBoundingClientRect().height > parseFloat(getComputedStyle(el).lineHeight) * 1.5)
            .map((el) => el.textContent)
        }
      })
      expect(state.gap, `${label}: the text ends above the frame`).toBeGreaterThan(FRAME_REACH)
      expect(state.fits || state.scrolls, `${label}: the card fits or the screen scrolls`).toBe(true)
      expect(state.wrappedLabels, `${label}: a tally label breaks inside itself`).toEqual([])
    })
  })

for (const size of [
  { width: 390, height: 844 },
  { width: 844, height: 390 }
])
  test.describe(`pause on a phone at ${size.width}×${size.height}`, () => {
    test.use({ viewport: size, hasTouch: true, isMobile: true })

    test('the touch controls step aside while the game is paused and come back with it', async ({ page }) => {
      test.setTimeout(60_000)
      await boot(page)
      await page.locator('#continue').tap()
      await page.locator('#stage-grid .stage-card').first().tap()
      await page.locator('#story-skip').tap()
      await page.waitForFunction(() => Boolean((window as unknown as { __hamham: Hamham }).__hamham.world))
      const controls = page.locator('#touch-controls')
      await expect(controls).toBeVisible()
      // The stage's opening moment holds the input for a moment.
      await page.waitForTimeout(3200)
      await page.keyboard.press('Escape')
      await expect(page.locator('#pause-screen')).toBeVisible()
      await expect(controls).toBeHidden()
      await page.keyboard.press('Escape')
      await expect(page.locator('#pause-screen')).toBeHidden()
      await expect(controls).toBeVisible()
    })
  })
