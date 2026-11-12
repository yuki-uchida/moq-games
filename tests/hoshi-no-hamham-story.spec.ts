import { expect, test, type Page } from '@playwright/test'
import { openGame, reloadGame } from './hoshi-no-hamham-helpers'

const SAVE_KEY = 'hoshi-no-hamham-v1'

interface Box {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return errors
}

const save = (cleared: number[]) => ({
  version: 1,
  cleared,
  unlocked: Math.min(10, cleared.length + 1),
  best: {},
  muted: true,
  seenOpening: true
})

async function boot(page: Page, cleared: number[]) {
  await openGame(page)
  await page.evaluate(([key, data]) => localStorage.setItem(key, data), [SAVE_KEY, JSON.stringify(save(cleared))])
  await reloadGame(page)
  await expect(page.locator('#title-screen')).toBeVisible()
}

const boxOf = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)!.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height } as Box
  }, selector)

/** The first page of stage 2's story. */
async function openStory(page: Page) {
  await boot(page, [1, 2, 3])
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page.locator('#stage-grid .stage-card').nth(1).click()
  await expect(page.locator('#story-screen')).toBeVisible()
  await page.waitForTimeout(700)
}

async function openEnding(page: Page) {
  await boot(page, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  await page.evaluate(() => (window as unknown as { __hamham: { openEnding(): void } }).__hamham.openEnding())
  await expect(page.locator('#ending-screen')).toBeVisible()
  await page.waitForTimeout(600)
}

/** Pages through the ending until the credits are up. */
async function openCredits(page: Page) {
  await openEnding(page)
  for (let i = 0; i < 30; i++) {
    if (await page.locator('#ending-credits').isVisible()) break
    await page.locator('#ending-next').click()
    await page.waitForTimeout(120)
  }
  await expect(page.locator('#ending-credits')).toBeVisible()
  await page.waitForTimeout(500)
}

/** The canvas's backing store has the shape of its CSS box (nothing cropped or stretched). */
async function expectUncropped(page: Page, selector: string, label: string) {
  const shape = await page.evaluate((sel) => {
    const canvas = document.querySelector<HTMLCanvasElement>(sel)!
    const r = canvas.getBoundingClientRect()
    const style = getComputedStyle(canvas)
    return {
      backing: canvas.width / canvas.height,
      box: r.width / r.height,
      fit: style.objectFit,
      frame: canvas.dataset.frame ?? ''
    }
  }, selector)
  expect(
    Math.abs(shape.backing / shape.box - 1),
    `${label}: backing ${shape.backing} vs box ${shape.box}`
  ).toBeLessThan(0.02)
  // An upright panel never gets taller than it is wide.
  expect(shape.box, `${label} box aspect`).toBeGreaterThanOrEqual(0.98)
  expect(shape.frame, `${label} frame`).toMatch(/^\d+ -?\d+ \d+ \d+$/)
}

/** Two buttons share a row. */
async function expectSameRow(page: Page, first: string, second: string, label: string) {
  const a = await boxOf(page, first)
  const b = await boxOf(page, second)
  expect(Math.abs(a.top - b.top), `${label} buttons share a row`).toBeLessThanOrEqual(2)
  expect(a.right, `${label} buttons do not overlap`).toBeLessThanOrEqual(b.left + 1)
}

const inside = (inner: Box, outer: Box) =>
  inner.left >= outer.left - 0.5 &&
  inner.right <= outer.right + 0.5 &&
  inner.top >= outer.top - 0.5 &&
  inner.bottom <= outer.bottom + 0.5

for (const phone of [
  { width: 390, height: 844 },
  { width: 320, height: 568 }
])
  test.describe(`story pictures on an upright ${phone.width}×${phone.height} phone`, () => {
    test.use({ viewport: phone, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })

    test('the story and ending pictures draw to the shape of their panel', async ({ page }) => {
      test.setTimeout(60_000)
      const errors = collectErrors(page)
      await openStory(page)
      await expectUncropped(page, '#story-art', 'story')
      await openEnding(page)
      await page.locator('#ending-next').click()
      await page.locator('#ending-next').click()
      await page.waitForTimeout(500)
      await expectUncropped(page, '#ending-art', 'ending')
      expect(errors).toEqual([])
    })
  })

for (const phone of [
  { width: 844, height: 390 },
  { width: 667, height: 375 }
])
  test.describe(`story on a landscape ${phone.width}×${phone.height} phone`, () => {
    test.use({ viewport: phone, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })

    test('the picture and the card fill the frame side by side', async ({ page }) => {
      test.setTimeout(60_000)
      const errors = collectErrors(page)
      await openStory(page)
      const frame = await boxOf(page, '#stage-wrap')
      const layout = await boxOf(page, '#story-screen .story-layout')
      expect(layout.height, 'story block height').toBeGreaterThanOrEqual(frame.height * 0.7)
      const art = await boxOf(page, '#story-screen .story-art')
      const card = await boxOf(page, '#story-box')
      expect(inside(art, frame), 'picture inside the frame').toBe(true)
      expect(inside(card, frame), 'card inside the frame').toBe(true)
      expect(art.right, 'picture beside the card').toBeLessThanOrEqual(card.left + 0.5)
      expect(art.width / frame.width, 'picture width share').toBeGreaterThan(0.5)
      await expectUncropped(page, '#story-art', 'story')
      await expectSameRow(page, '#story-skip', '#story-next', 'story')
      const smallest = await page.evaluate(() =>
        Math.min(
          ...Array.from(document.querySelectorAll<HTMLElement>('#story-screen *'))
            .filter((el) => el.getClientRects().length && el.childNodes.length && el.textContent?.trim())
            .map((el) => parseFloat(getComputedStyle(el).fontSize))
        )
      )
      expect(smallest, 'smallest text').toBeGreaterThanOrEqual(12)
      expect(errors).toEqual([])
    })
  })

const SIZES = [
  { width: 1280, height: 720, touch: false },
  { width: 844, height: 390, touch: true },
  { width: 390, height: 844, touch: true },
  { width: 320, height: 568, touch: true }
]

for (const size of SIZES)
  test.describe(`credits at ${size.width}×${size.height}`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.touch,
      isMobile: size.touch
    })
    const label = `${size.width}×${size.height}`
    const portrait = size.height > size.width

    test('the credits roll over the whole frame, readable throughout, then the card shows', async ({ page }) => {
      test.setTimeout(90_000)
      const errors = collectErrors(page)
      await openCredits(page)
      await expect(page.locator('#ending-screen')).toHaveClass(/is-rolling/)
      const frame = portrait
        ? { top: 0, left: 0, width: size.width, height: size.height }
        : await boxOf(page, '#stage-wrap')
      const credits = await boxOf(page, '#ending-credits')
      expect(credits.width, `${label} credits width`).toBeGreaterThanOrEqual(frame.width * 0.9)
      expect(credits.height, `${label} credits height`).toBeGreaterThanOrEqual(frame.height * 0.9)
      // The card's buttons can be neither focused nor reached while the credits roll.
      const focusable = await page.evaluate(() => {
        const button = document.querySelector<HTMLElement>('#ending-select')!
        button.focus()
        return document.activeElement === button || !button.closest('[inert]')
      })
      expect(focusable, `${label} card buttons focusable`).toBe(false)
      // Freeze the roll and walk through it.
      const report = await page.evaluate(() => {
        const win = document.querySelector<HTMLElement>('.credits-window')!
        const roll = document.querySelector<HTMLElement>('.credits-roll')!
        const animation = roll.getAnimations()[0]
        animation.pause()
        const duration = Number(animation.effect!.getComputedTiming().duration)
        const view = win.getBoundingClientRect()
        const fade = view.height * 0.15
        const entries = Array.from(
          roll.querySelectorAll<HTMLElement>('.credits-name, .credits-title, .credits-line, .credits-end')
        )
        const problems: string[] = []
        const whole = new Set<HTMLElement>()
        const firstShown: string[] = []
        const STEPS = 200
        for (let step = 0; step <= STEPS; step++) {
          animation.currentTime = (duration * step) / STEPS
          for (const entry of entries) {
            const r = entry.getBoundingClientRect()
            if (r.bottom <= view.top || r.top >= view.bottom) continue
            if (r.left < view.left - 0.5 || r.right > view.right + 0.5)
              problems.push(`${entry.textContent} is cut at a side`)
            if (r.top < view.top - 0.5 && r.bottom - view.top > fade + 0.5)
              problems.push(`${entry.textContent} cut at the top`)
            if (r.bottom > view.bottom + 0.5 && view.bottom - r.top > fade + 0.5)
              problems.push(`${entry.textContent} cut at the bottom`)
            if (r.top >= view.top + fade * 0.5 && r.bottom <= view.bottom - fade * 0.5) {
              whole.add(entry)
              if (step === 0) firstShown.push(entry.textContent ?? '')
            }
          }
        }
        const end = roll.querySelector('.credits-end')!.getBoundingClientRect()
        return {
          seconds: duration / 1000,
          problems: Array.from(new Set(problems)),
          unreadable: entries.filter((entry) => !whole.has(entry)).map((entry) => entry.textContent),
          firstShown,
          endAt: ((end.top + end.bottom) / 2 - view.top) / view.height,
          sizes: entries.map((entry) => parseFloat(getComputedStyle(entry).fontSize))
        }
      })
      expect(report.problems, `${label} cut entries`).toEqual([])
      expect(report.unreadable, `${label} unreadable entries`).toEqual([])
      expect(report.firstShown.length, `${label} the roll starts with lines on screen`).toBeGreaterThan(0)
      // 「ありがとう！」 ends in the middle (a little lower when the family under it needs the room).
      expect(report.endAt, `${label} 「ありがとう！」 ends in the middle`).toBeGreaterThanOrEqual(0.49)
      expect(report.endAt, `${label} 「ありがとう！」 ends in the middle`).toBeLessThanOrEqual(0.61)
      expect(report.seconds, `${label} roll length`).toBeGreaterThanOrEqual(25)
      expect(report.seconds, `${label} roll length`).toBeLessThanOrEqual(40)
      expect(Math.min(...report.sizes), `${label} smallest credits text`).toBeGreaterThanOrEqual(12)
      // When the roll is over the card shows the statistics and both buttons on one row.
      await page.evaluate(() => {
        for (const animation of document.querySelector('.credits-roll')!.getAnimations()) animation.finish()
      })
      await page.waitForTimeout(900)
      await expect(page.locator('#ending-screen')).not.toHaveClass(/is-rolling/)
      await expect(page.locator('#ending-credits')).toHaveClass(/is-done/)
      await expect(page.locator('#ending-stats')).toBeVisible()
      await expect(page.locator('#ending-select')).toBeFocused()
      await expectSameRow(page, '#ending-select', '#ending-title-button', label)
      expect(errors).toEqual([])
    })

    test('a tap or a click skips the credits', async ({ page }) => {
      test.setTimeout(60_000)
      await openCredits(page)
      await expect(page.locator('.credits-hint')).toBeVisible()
      await expect(page.locator('.credits-hint')).toHaveText(size.touch ? 'タップでスキップ' : 'Enter でスキップ')
      if (size.touch) await page.locator('#ending-credits').tap()
      else await page.locator('#ending-credits').click()
      await expect(page.locator('#ending-credits')).toHaveClass(/is-done/)
      await expect(page.locator('#ending-stats')).toBeVisible()
      await expect(page.locator('#ending-select')).toBeFocused()
    })

    test('Enter skips the credits and stays on the ending', async ({ page }) => {
      test.setTimeout(60_000)
      await openCredits(page)
      await page.keyboard.press('Enter')
      await expect(page.locator('#ending-credits')).toHaveClass(/is-done/)
      await page.waitForTimeout(400)
      await expect(page.locator('#ending-screen')).toBeVisible()
      await expect(page.locator('#select-screen')).toBeHidden()
      await expect(page.locator('#ending-select')).toBeFocused()
    })
  })

test.describe('credits under reduced motion', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the credits are a list that scrolls by hand; 「つぎへ」 shows the card', async ({ page }) => {
    test.setTimeout(60_000)
    const errors = collectErrors(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openCredits(page)
    const state = await page.evaluate(() => {
      const win = document.querySelector<HTMLElement>('.credits-window')!
      const roll = document.querySelector<HTMLElement>('.credits-roll')!
      const before = win.scrollTop
      win.scrollTop = 200
      return {
        animations: roll
          .getAnimations()
          .map((a) => (a as CSSAnimation).animationName ?? a.constructor.name)
          .join(','),
        scrolls: win.scrollHeight > win.clientHeight + 1,
        moved: win.scrollTop - before
      }
    })
    expect(state.animations).toBe('')
    expect(state.scrolls).toBe(true)
    expect(state.moved).toBeGreaterThan(0)
    await expect(page.locator('.credits-hint')).toHaveCount(0)
    const close = page.locator('.credits-close')
    await expect(close).toBeVisible()
    await expect(close).toBeFocused()
    await close.tap()
    await expect(page.locator('#ending-credits')).toHaveClass(/is-done/)
    await expect(page.locator('#ending-stats')).toBeVisible()
    await expect(page.locator('#ending-select')).toBeFocused()
    expect(errors).toEqual([])
  })
})
