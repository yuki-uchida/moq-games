import { expect, test, type Locator } from '@playwright/test'

const path = '/moq-games/examples/games/tower_diffence_with_jev/index.html'
async function fits(panel: Locator) {
  const result = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const outside = Array.from(element.querySelectorAll<HTMLElement>('button, summary, input, select, a')).filter((control) => {
      const r = control.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight || r.bottom > rect.bottom)
    }).map((control) => control.id || control.textContent?.trim())
    return { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, outside }
  })
  expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth)
  expect(result.scrollHeight).toBeLessThanOrEqual(result.clientHeight)
  expect(result.outside).toEqual([])
}
/** The stage select scrolls its lists vertically, but stays inside the screen and keeps the sortie
 * button visible without scrolling; every control is reachable once scrolled to. */
async function scrollsWithPinnedAction(panel: Locator, action: Locator) {
  const inside = (r: { left: number; top: number; right: number; bottom: number }, w: number, h: number) =>
    r.left >= -1 && r.top >= -1 && r.right <= w + 1 && r.bottom <= h + 1
  const geometry = await panel.evaluate((element) => {
    element.scrollTop = 0
    const r = element.getBoundingClientRect()
    return { rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, w: innerWidth, h: innerHeight }
  })
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
  expect(inside(geometry.rect, geometry.w, geometry.h)).toBe(true)
  const pinned = (await action.boundingBox())!
  expect(inside({ left: pinned.x, top: pinned.y, right: pinned.x + pinned.width, bottom: pinned.y + pinned.height }, geometry.w, geometry.h)).toBe(true)
  expect(pinned.y + pinned.height).toBeLessThanOrEqual(geometry.rect.bottom + 1)
  await expect(action).toBeInViewport({ ratio: 1 })
  const unreachable = await panel.evaluate((element) => {
    const missing: string[] = []
    for (const control of Array.from(element.querySelectorAll<HTMLElement>('button, summary, input, select, a'))) {
      if (!control.getClientRects().length) continue
      control.scrollIntoView({ block: 'nearest' })
      const r = control.getBoundingClientRect(), panelRect = element.getBoundingClientRect()
      if (r.left < panelRect.left - 1 || r.right > panelRect.right + 1 || r.top < panelRect.top - 1 || r.bottom > panelRect.bottom + 1)
        missing.push(control.id || control.textContent?.trim() || control.tagName)
    }
    element.scrollTop = 0
    return missing
  })
  expect(unreachable).toEqual([])
}
for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [844, 390]]) {
  test(`${width}×${height}: title, launch and settings remain usable`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto(path)
    await fits(page.locator('#title-screen'))
    await expect(page.locator('#title-new')).toBeFocused()
    await page.keyboard.press('Enter')
    await scrollsWithPinnedAction(page.locator('#launch'), page.locator('#start'))
    await page.locator('.launch-help summary').click()
    await scrollsWithPinnedAction(page.locator('#launch'), page.locator('#start'))
    await page.locator('.launch-help summary').click()
    await page.locator('#launch-title-return').click()
    await expect(page.locator('#title-screen')).toBeVisible()
    await page.locator('#title-new').click()
    await page.locator('#start').click()
    await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 60000 })
    await expect(page.locator('#game-title-return')).toBeHidden()
    await expect(page.locator('#mode')).toBeHidden()
    for (let i = 0; i < 2; i++) {
      await page.locator('#deck-toggle').click()
      await fits(page.locator('#unit-tray'))
      await page.keyboard.press('Escape')
      await expect(page.locator('#deck-toggle')).toBeFocused()
      await page.locator('#items-toggle').click()
      await fits(page.locator('#item-tray'))
      await page.locator('#item-tray-close').click()
    }
    await page.locator('#settings-toggle').click()
    for (const tab of ['game', 'music', 'sound', 'save']) {
      await page.locator(`[data-settings-tab="${tab}"]`).click()
      const summary = page.locator(`[data-settings-page="${tab}"] details summary`)
      if (await summary.count()) await summary.click()
      await fits(page.locator('#settings'))
    }
    await page.locator('#save-reset').click()
    await fits(page.locator('#save-confirm'))
    await page.keyboard.press('Escape')
    await expect(page.locator('#save-reset')).toBeFocused()
    await page.locator('#settings-close').click()
    await expect(page.locator('#settings-toggle')).toBeFocused()
  })
}
