import { expect, test, type Page } from '@playwright/test'
import { openGame } from './hoshi-no-hamham-helpers'

/**
 * The HUD is rastered ahead of its first use: a moment after the title is up it is laid out and walked through its
 * states where nobody can see it, then put away as it was. While that runs it must not be visible to a person, to a
 * tap, to the keyboard or to a screen reader, and it must leave nothing behind.
 */

interface PrimeHook {
  app: { hud: { show(): void; hide(): void; primer: { running: boolean; done: Set<string> } } }
}

const WALK_TIMEOUT = 20_000

const priming = (page: Page) =>
  page.evaluate(() => document.querySelector('#hud')?.classList.contains('is-priming') ?? false)

const LAYOUTS = [
  { name: 'landscape', width: 844, height: 390 },
  { name: 'portrait', width: 390, height: 844 }
] as const

for (const layout of LAYOUTS) {
  test(`${layout.name}: the HUD is walked through its states at the title, out of sight, and put away`, async ({
    browser
  }) => {
    test.setTimeout(90_000)
    const context = await browser.newContext({
      viewport: { width: layout.width, height: layout.height },
      baseURL: `http://127.0.0.1:${process.env.E2E_PORT || 5196}`
    })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
    await openGame(page)

    // The walk starts a moment after the title is up.
    await expect.poll(() => priming(page), { timeout: WALK_TIMEOUT, intervals: [50] }).toBe(true)
    const during = await page.evaluate(() => {
      const hud = document.querySelector<HTMLElement>('#hud')!
      const style = getComputedStyle(hud)
      const hearts = document.querySelector<HTMLElement>('#hearts')!
      const box = hearts.getBoundingClientRect()
      const under = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return {
        hidden: hud.hidden,
        visibility: style.visibility,
        opacity: Number(style.opacity),
        inert: hud.hasAttribute('inert'),
        ariaHidden: hud.getAttribute('aria-hidden'),
        // The parts are laid out and painted: that is the point of the walk.
        heartsVisibility: getComputedStyle(hearts).visibility,
        heartsWidth: box.width,
        // A tap where the hearts are reaches what is under the HUD.
        tapReachesHud: under ? hud.contains(under) : false,
        title: Boolean(document.querySelector('#title-screen:not([hidden])'))
      }
    })
    expect(during.hidden).toBe(false)
    expect(during.visibility).toBe('hidden')
    expect(during.opacity).toBeLessThan(0.01)
    expect(during.inert).toBe(true)
    expect(during.ariaHidden).toBe('true')
    expect(during.heartsVisibility).toBe('visible')
    expect(during.heartsWidth).toBeGreaterThan(10)
    expect(during.tapReachesHud).toBe(false)
    expect(during.title).toBe(true)
    // What the other browser tests ask to know that a stage has started stays false during the walk.
    await expect(page.locator('#hud')).toBeHidden()

    // The walk ends by itself and leaves the HUD as it found it.
    await expect.poll(() => priming(page), { timeout: WALK_TIMEOUT, intervals: [100] }).toBe(false)
    const after = await page.evaluate((name) => {
      const hud = document.querySelector<HTMLElement>('#hud')!
      const hook = (window as unknown as { __hamham: PrimeHook }).__hamham
      return {
        hidden: hud.hidden,
        inert: hud.hasAttribute('inert'),
        ariaHidden: hud.getAttribute('aria-hidden'),
        classes: [...hud.classList].filter((c) => c === 'is-cinematic' || c === 'is-dark' || c === 'is-priming'),
        bossBarHidden: document.querySelector<HTMLElement>('#boss-bar')!.hidden,
        showing: [...hud.querySelectorAll('.is-show')].length,
        done: hook.app.hud.primer.done.has(name),
        running: hook.app.hud.primer.running
      }
    }, layout.name)
    expect(after).toEqual({
      hidden: true,
      inert: false,
      ariaHidden: null,
      classes: [],
      bossBarHidden: true,
      showing: 0,
      done: true,
      running: false
    })
    expect(errors).toEqual([])
    await context.close()
  })
}

test('a walk that a stage cut short is made again back in the menus', async ({ browser }) => {
  test.setTimeout(90_000)
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    baseURL: `http://127.0.0.1:${process.env.E2E_PORT || 5196}`
  })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  await openGame(page)
  await expect.poll(() => priming(page), { timeout: WALK_TIMEOUT, intervals: [50] }).toBe(true)
  // A stage's HUD takes over in the middle of the walk, then the game is back in a menu.
  const cut = await page.evaluate(() => {
    const hud = (window as unknown as { __hamham: PrimeHook }).__hamham.app.hud
    hud.show()
    const whileShown = {
      priming: document.querySelector('#hud')!.classList.contains('is-priming'),
      hidden: document.querySelector<HTMLElement>('#hud')!.hidden,
      done: hud.primer.done.size
    }
    hud.hide()
    return whileShown
  })
  expect(cut).toEqual({ priming: false, hidden: false, done: 0 })
  await expect(page.locator('#hud')).toBeHidden()
  // The walk starts over by itself and this time runs to its end.
  await expect.poll(() => priming(page), { timeout: WALK_TIMEOUT, intervals: [50] }).toBe(true)
  await expect.poll(() => priming(page), { timeout: WALK_TIMEOUT, intervals: [100] }).toBe(false)
  const after = await page.evaluate(() => {
    const hud = (window as unknown as { __hamham: PrimeHook }).__hamham.app.hud
    return { done: hud.primer.done.has('landscape'), hidden: document.querySelector<HTMLElement>('#hud')!.hidden }
  })
  expect(after).toEqual({ done: true, hidden: true })
  expect(errors).toEqual([])
  await context.close()
})
