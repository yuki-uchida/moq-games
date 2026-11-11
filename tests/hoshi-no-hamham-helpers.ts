import type { Page } from '@playwright/test'

/** Generous: the staged boot warms the title's art behind the splash, and CI machines can be slow. */
const READY_TIMEOUT = 60_000

/**
 * Waits until the game can be used: the test hook exists and the title screen is up. The window's load event says
 * nothing about this (the boot runs in stages after it), so every test that needs the game waits here.
 */
export async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      Boolean((window as unknown as { __hamham?: unknown }).__hamham) &&
      Boolean(document.querySelector('#title-screen:not([hidden])')),
    null,
    { timeout: READY_TIMEOUT }
  )
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
