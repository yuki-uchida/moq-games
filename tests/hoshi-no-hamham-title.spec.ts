import { expect, test, type Page } from '@playwright/test'
import { openGame, reloadGame } from './hoshi-no-hamham-helpers'

/**
 * The title on upright phones (a night scene under the stage), the wide title that must not move, the game over
 * reached by really losing, the pause panel on narrow phones and the result card on upright phones.
 */

const SAVE_KEY = 'hoshi-no-hamham-v1'

const SAVE = {
  version: 1,
  cleared: [1, 2, 3],
  unlocked: 4,
  best: { 'stage-1': 83.4 },
  muted: true,
  seenOpening: true
}

const ALL_OPEN = { ...SAVE, cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9], unlocked: 10 }

const PHONES = [
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 360, height: 640 },
  { width: 320, height: 568 }
]

interface Rect {
  name: string
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

interface Hook {
  app: {
    screen: string
    session: { director: { current: string | null } } | null
    screens: { showResult(info: unknown): void }
  }
  world: {
    player: { x: number; invuln: number }
    goalX: number
    hurtPlayer(amount: number, sourceX: number): void
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

/** Rectangles of the visible elements matching each selector (every match, in viewport coordinates). */
const rects = (page: Page, selectors: string[]) =>
  page.evaluate((list) => {
    const out: Rect[] = []
    for (const sel of list)
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (!el.getClientRects().length) continue
        const r = el.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) continue
        out.push({
          name: sel,
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height
        })
      }
    return out
  }, selectors)

/** The tallest stretch of the viewport's height that none of the rectangles touches. */
function tallestGap(items: Rect[], height: number) {
  const sorted = [...items].sort((a, b) => a.top - b.top)
  let reach = 0
  let best = { h: 0, top: 0 }
  for (const r of sorted) {
    if (r.top - reach > best.h) best = { h: r.top - reach, top: reach }
    reach = Math.max(reach, r.bottom)
  }
  if (height - reach > best.h) best = { h: height - reach, top: reach }
  return best
}

const overlaps = (a: Rect, b: Rect) =>
  a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5

/** Waits until the title's entrance (logo drop, rising buttons, the trail's stars) has finished. */
const settle = (page: Page) =>
  page.waitForFunction(
    () => {
      const screen = document.querySelector('#title-screen')!
      return screen
        .getAnimations({ subtree: true })
        .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity)
    },
    null,
    { timeout: 5000 }
  )

const TITLE_PIECES = [
  '.logo-art',
  '#stage-wrap',
  '.title-tagline',
  '.title-menu .pxbtn',
  '.star-trail',
  '.trail-text',
  '.title-moon',
  '.title-hills',
  '.title-sleeper',
  '.home-link',
  '.credit'
]

for (const phone of PHONES)
  for (const saved of [false, true])
    test.describe(`the title at ${phone.width}×${phone.height}, ${saved ? 'with a save' : 'fresh'}`, () => {
      test.use({ viewport: phone, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })

      test('the night under the stage leaves no empty stretch, nothing overlaps and the logo is 192×64', async ({
        page
      }) => {
        test.setTimeout(60_000)
        const errors = collectErrors(page)
        await boot(page, saved ? SAVE : null)
        await settle(page)
        const items = await rects(page, TITLE_PIECES)
        const names = new Set(items.map((r) => r.name))
        for (const piece of TITLE_PIECES) expect(names, `${piece} is shown`).toContain(piece)

        const gap = tallestGap(items, phone.height)
        expect(gap.h, `tallest empty stretch from y ${Math.round(gap.top)}`).toBeLessThanOrEqual(phone.height * 0.15)

        // The buttons, the trail, its line and the footer texts never touch one another.
        const solid = items.filter((r) =>
          ['.title-menu .pxbtn', '.star-trail', '.trail-text', '.home-link', '.credit', '.title-tagline'].includes(
            r.name
          )
        )
        for (let i = 0; i < solid.length; i++)
          for (let j = i + 1; j < solid.length; j++)
            expect(overlaps(solid[i], solid[j]), `${solid[i].name} and ${solid[j].name} overlap`).toBe(false)
        // The moon stays clear of the menu and the trail.
        const moon = items.find((r) => r.name === '.title-moon')!
        for (const r of solid) expect(overlaps(moon, r), `the moon and ${r.name} overlap`).toBe(false)
        // Everything inside the viewport.
        for (const r of items) {
          expect(r.left, `${r.name} cut on the left`).toBeGreaterThanOrEqual(-0.5)
          expect(r.right, `${r.name} cut on the right`).toBeLessThanOrEqual(phone.width + 0.5)
          expect(r.bottom, `${r.name} cut at the bottom`).toBeLessThanOrEqual(phone.height + 0.5)
        }
        // Buttons and the link are big enough to tap; on tall phones the menu buttons are roomier.
        for (const r of items.filter((x) => x.name === '.title-menu .pxbtn' || x.name === '.home-link'))
          expect(r.height, `${r.name} height`).toBeGreaterThanOrEqual(
            phone.height >= 700 && r.name !== '.home-link' ? 56 : 44
          )
        expect(items.filter((r) => r.name === '.title-menu .pxbtn')).toHaveLength(saved ? 3 : 2)

        // The logo at a clean half scale, high in the stage's sky.
        const logo = items.find((r) => r.name === '.logo-art')!
        const stage = items.find((r) => r.name === '#stage-wrap')!
        expect([logo.width, logo.height]).toEqual([192, 64])
        expect(logo.top).toBeGreaterThanOrEqual(stage.top)
        expect(logo.bottom - stage.top, 'the logo leaves the demo visible').toBeLessThanOrEqual(stage.height * 0.45)

        // Ten stars, one lit per cleared stage; the next one pulses; the same said to a screen reader.
        const trail = page.locator('#star-trail')
        await expect(trail.locator('.trail-star')).toHaveCount(10)
        await expect(trail.locator('.trail-star.is-lit')).toHaveCount(saved ? 3 : 0)
        await expect(trail.locator('.trail-star.is-next')).toHaveCount(saved ? 1 : 0)
        await expect(page.locator('#trail-text')).toHaveText(saved ? 'クリア 3/10' : 'ぜんぶで 10ステージ')
        await expect(trail).toHaveAttribute('role', 'img')
        await expect(trail).toHaveAttribute('aria-label', saved ? 'クリア 3/10' : /ぜんぶで 10ステージ/)

        // Every text is readable.
        const small = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>('#title-screen *'))
            .filter((el) => el.getClientRects().length > 0)
            .filter((el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim()))
            .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12)
            .map((el) => el.textContent)
        )
        expect(small).toEqual([])
        expect(errors).toEqual([])
      })
    })

test.describe('the title entrance on an upright phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the new pieces join the logo drop and the rising buttons one after another', async ({ page }) => {
    await boot(page, SAVE)
    const delays = await page.evaluate(() => {
      document.querySelector('#title-screen')!.classList.remove('is-entering')
      void (document.querySelector('#title-screen') as HTMLElement).offsetWidth
      document.querySelector('#title-screen')!.classList.add('is-entering')
      const delay = (sel: string) =>
        Math.max(
          0,
          ...document
            .querySelector(sel)!
            .getAnimations()
            .map((a) => Number(a.effect?.getTiming().delay ?? 0))
        )
      return {
        tagline: delay('.title-tagline'),
        button: delay('.title-menu .pxbtn:not([hidden])'),
        firstStar: delay('.trail-star:nth-child(1)'),
        lastStar: delay('.trail-star:nth-child(10)'),
        moon: delay('.title-moon')
      }
    })
    expect(delays.tagline).toBeGreaterThan(0)
    expect(delays.button).toBeGreaterThan(delays.tagline)
    expect(delays.firstStar).toBeGreaterThan(delays.button)
    expect(delays.lastStar).toBeGreaterThan(delays.firstStar)
    expect(delays.moon).toBeGreaterThan(0)
  })
})

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 844, height: 390 }
])
  test(`the wide title at ${viewport.width}×${viewport.height} keeps its layout`, async ({ page }) => {
    await page.setViewportSize(viewport)
    for (const save of [SAVE, null]) {
      await boot(page, save)
      await settle(page)
      const now = await rects(page, ['.logo-art', '.title-menu'])
      // The tagline and the night scene are not shown; the trail takes the old note's place.
      await expect(page.locator('.title-tagline')).toBeHidden()
      await expect(page.locator('.title-night')).toBeHidden()
      await expect(page.locator('.title-moon')).toBeHidden()
      await expect(page.locator('#star-trail .trail-star')).toHaveCount(10)
      // Without the new pieces (a one-line note as before) the logo and the menu stand in the same place.
      await page.addStyleTag({
        content: '.title-tagline, .title-night, .title-moon-row, .star-trail { display: none !important; }'
      })
      const before = await rects(page, ['.logo-art', '.title-menu'])
      for (let i = 0; i < now.length; i++) {
        expect(Math.abs(now[i].top - before[i].top), `${now[i].name} top`).toBeLessThanOrEqual(2)
        expect(Math.abs(now[i].left - before[i].left), `${now[i].name} left`).toBeLessThanOrEqual(2)
      }
    }
  })

// -------------------------------------------------------------------------------------------- game over

/** Opens stage 3 from the select and waits until it plays. */
async function playStage3(page: Page) {
  await boot(page, ALL_OPEN)
  await page.locator('#continue').click()
  await page.locator('.stage-card').nth(2).click()
  for (let i = 0; i < 10; i++) {
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click()
  }
  await page.waitForFunction(() => {
    const h = (window as unknown as { __hamham?: Hook }).__hamham
    return h?.app.screen === 'play' && h.app.session !== null && h.app.session.director.current === null
  })
}

/** Loses the last heart a good way into the stage. */
async function loseStage3(page: Page) {
  await playStage3(page)
  await page.evaluate(() => {
    const w = (window as unknown as { __hamham: Hook }).__hamham.world
    w.player.x = w.goalX * 0.4
    w.player.invuln = 0
    w.hurtPlayer(99, w.player.x + 100)
  })
  await expect(page.locator('#dead-screen')).toBeVisible({ timeout: 10_000 })
  // The card's drop and the track's fill.
  await page.waitForTimeout(1600)
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 844, height: 390 },
  { width: 390, height: 844 },
  { width: 320, height: 568 }
])
  test.describe(`game over at ${viewport.width}×${viewport.height}`, () => {
    const upright = viewport.height > viewport.width
    test.use({ viewport, hasTouch: upright || viewport.height < 500, isMobile: upright || viewport.height < 500 })

    test('a centred card names the stage, shows how far the hero got, and retry restarts the stage', async ({
      page
    }) => {
      test.setTimeout(90_000)
      const errors = collectErrors(page)
      await loseStage3(page)
      const box = await page.evaluate(() => {
        const r = document.querySelector('.dead-card')!.getBoundingClientRect()
        const f = document.querySelector('#dead-screen')!.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, frame: f }
      })
      const frame = box.frame
      expect(Math.abs(box.top - frame.top - (frame.bottom - box.bottom)), 'centred').toBeLessThanOrEqual(24)
      expect(box.height / frame.height, 'tall enough').toBeGreaterThanOrEqual(upright ? 0.6 : 0.5)
      expect(box.top).toBeGreaterThanOrEqual(frame.top - 0.5)
      expect(box.bottom).toBeLessThanOrEqual(frame.bottom + 0.5)
      expect(box.left).toBeGreaterThanOrEqual(frame.left - 0.5)
      expect(box.right).toBeLessThanOrEqual(frame.right + 0.5)

      await expect(page.locator('#dead-head')).toBeVisible()
      await expect(page.locator('#dead-head')).toContainText('ステージ 3')
      await expect(page.locator('#dead-head')).toContainText('さらわれた姫')
      await expect(page.locator('#dead-left')).toContainText(/ゴールまで あと \d+%/)
      const marks = await page.evaluate(() => {
        const mid = (sel: string) => {
          const r = document.querySelector(sel)!.getBoundingClientRect()
          return r.left + r.width / 2
        }
        return { start: mid('#dead-start'), goal: mid('#dead-goal'), face: mid('#dead-face') }
      })
      expect(marks.face).toBeGreaterThan(marks.start)
      expect(marks.face).toBeLessThan(marks.goal)

      // The buttons keep their order.
      const ids = await page.locator('.dead-card .buttons button').evaluateAll((list) => list.map((b) => b.id))
      expect(ids).toEqual(['dead-retry', 'dead-select'])

      await page.locator('#dead-retry').click()
      await page.waitForFunction(() => (window as unknown as { __hamham: Hook }).__hamham.app.screen === 'play')
      await expect(page.locator('#dead-screen')).toBeHidden()
      expect(errors).toEqual([])
    })
  })

test('game over without the run information leaves out the header and the track', async ({ page }) => {
  await boot(page, SAVE)
  await page.evaluate(() =>
    (window as unknown as { __hamham: { app: { screens: { showDead(): void } } } }).__hamham.app.screens.showDead()
  )
  await expect(page.locator('#dead-screen')).toBeVisible()
  await expect(page.locator('#dead-head')).toBeHidden()
  await expect(page.locator('#dead-track')).toBeHidden()
  await expect(page.locator('#dead-retry')).toBeFocused()
})

// ------------------------------------------------------------------------------------------------ pause

for (const phone of [
  { width: 320, height: 568 },
  { width: 360, height: 640 }
])
  test.describe(`pause at ${phone.width}×${phone.height}`, () => {
    test.use({ viewport: phone, hasTouch: true, isMobile: true })

    test('everything lies inside the panel with even padding and the volume values are whole', async ({ page }) => {
      test.setTimeout(90_000)
      await playStage3(page)
      await page.keyboard.press('Escape')
      await expect(page.locator('#pause-screen')).toBeVisible()
      await page.waitForTimeout(400)
      const report = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>('.pause-card')!
        const r = card.getBoundingClientRect()
        const s = getComputedStyle(card)
        const inner = {
          left: r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft),
          right: r.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight)
        }
        const outside: string[] = []
        for (const el of Array.from(card.querySelectorAll<HTMLElement>('*'))) {
          if (!el.getClientRects().length) continue
          // A focused button's blinking frame and arrow cursor are drawn outside on purpose; boxes are measured.
          const b = el.getBoundingClientRect()
          // Pixel buttons draw a 3 px rim outside their box.
          const rim = el.classList.contains('pxbtn') ? 3 : 0
          if (b.left - rim < inner.left - 0.5 || b.right + rim > inner.right + 0.5)
            outside.push(`${el.className || el.tagName} ${Math.round(b.left)}–${Math.round(b.right)}`)
        }
        const values = Array.from(card.querySelectorAll<HTMLElement>('.volume-value')).map((v) => ({
          text: v.textContent,
          fits: v.scrollWidth <= v.clientWidth + 0.5
        }))
        return { outside, values, padL: parseFloat(s.paddingLeft), padR: parseFloat(s.paddingRight) }
      })
      expect(report.outside).toEqual([])
      expect(report.padL).toBe(report.padR)
      expect(report.values).toHaveLength(3)
      for (const v of report.values) expect(v.fits, `volume ${v.text}`).toBe(true)
    })
  })

// ----------------------------------------------------------------------------------------------- result

const resultInfo = (collect: boolean) => ({
  stage: {
    no: 6,
    theme: 'forest',
    name: '森の巣',
    clear: ['森の主を追い返し、巣を守り抜いた！'],
    collect: collect ? 8 : 0
  },
  last: false,
  time: '1:23',
  seconds: 83.4,
  previousBest: 90.2,
  newRecord: true,
  kills: 12,
  damage: 1,
  collected: collect ? 8 : null
})

for (const phone of PHONES)
  test.describe(`the result at ${phone.width}×${phone.height}`, () => {
    test.use({ viewport: phone, hasTouch: true, isMobile: true })

    test('the card is centred, or scrolls from the top', async ({ page }) => {
      test.setTimeout(60_000)
      await boot(page, SAVE)
      for (const collect of [false, true]) {
        await page.evaluate(
          (info) => (window as unknown as { __hamham: Hook }).__hamham.app.screens.showResult(info),
          resultInfo(collect)
        )
        await page.keyboard.press('Enter')
        await page.waitForTimeout(500)
        const state = await page.evaluate(() => {
          const screen = document.querySelector<HTMLElement>('#result-screen')!
          const r = screen.querySelector('.result-card')!.getBoundingClientRect()
          return {
            top: r.top,
            bottom: r.bottom,
            viewport: window.innerHeight,
            scrolls: screen.scrollHeight > screen.clientHeight + 1
          }
        })
        if (state.scrolls) expect(state.top, 'starts at the top').toBeLessThanOrEqual(24)
        else
          expect(
            Math.abs(state.top - (state.viewport - state.bottom)),
            `centred (collect ${collect})`
          ).toBeLessThanOrEqual(24)
      }
    })
  })
