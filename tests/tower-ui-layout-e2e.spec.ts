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
for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [844, 390]]) {
  test(`${width}×${height}: title, launch and settings remain usable`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto(path)
    await fits(page.locator('#title-screen'))
    await expect(page.locator('#title-new')).toBeFocused()
    await page.keyboard.press('Enter')
    await page.locator('.launch-help summary').click()
    await fits(page.locator('#launch'))
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
