import type { Page } from '@playwright/test'

/** Generous: the staged boot warms the title's art behind the splash, and CI machines can be slow. */
const READY_TIMEOUT = 60_000
/** A boot takes a second or two; one still on its splash after this long is worth describing. */
const SLOW_BOOT_MS = 15_000

/** What the boot has reached: its performance marks, the splash's bar and text, and whether the page is visible. */
const bootState = (page: Page) =>
  page.evaluate(() => ({
    marks: performance.getEntriesByType('mark').map((mark) => `${mark.name}@${Math.round(mark.startTime)}`),
    bar: document.querySelector('#splash-bar')?.getAttribute('aria-valuenow') ?? null,
    text: document.querySelector('.splash-text')?.textContent ?? null,
    visibility: document.visibilityState,
    now: Math.round(performance.now())
  }))

/**
 * Waits until the game can be used: the test hook exists and the title screen is up. The window's load event says
 * nothing about this (the boot runs in stages after it), so every test that needs the game waits here.
 *
 * A boot that is still going after `SLOW_BOOT_MS` is written to the test output with what it had reached, so a test
 * that then runs into its timeout shows whether the page was slow or stuck, and where.
 */
export async function waitForGame(page: Page): Promise<void> {
  const slow = setTimeout(() => {
    void bootState(page)
      .then((state) =>
        console.warn(`[hoshi-no-hamham] still booting after ${SLOW_BOOT_MS} ms: ${JSON.stringify(state)}`)
      )
      .catch(() => {})
  }, SLOW_BOOT_MS)
  try {
    await page.waitForFunction(
      () =>
        Boolean((window as unknown as { __hamham?: unknown }).__hamham) &&
        Boolean(document.querySelector('#title-screen:not([hidden])')),
      null,
      { timeout: READY_TIMEOUT }
    )
  } finally {
    clearTimeout(slow)
  }
}

/** Opens the game at `path` and waits until it can be used. */
export async function openGame(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  await waitForGame(page)
}

/** Reloads the page and waits until the game can be used again. */
export async function reloadGame(page: Page): Promise<void> {
  await page.reload()
  await waitForGame(page)
}

/**
 * Taps through an open story (the opening, or a stage's) to its end. The button can leave the screen between the
 * look and the click: the last page starts the stage, at once or after a loading card, and the page does not block
 * while the stage's art is made. A click that finds the button gone or covered is therefore not an error; what
 * comes after the story is for the caller to check.
 */
export async function pageThroughStory(page: Page, pages = 10): Promise<void> {
  for (let i = 0; i < pages; i++) {
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    // Play waits behind the loading card: there is nothing more to tap.
    if (await page.locator('.warm-note:not([hidden])').isVisible()) break
    await next.click({ timeout: 5000 }).catch(() => undefined)
  }
}
