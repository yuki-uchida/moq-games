import { expect, test } from '@playwright/test'
import { acceptDiscard, clickCell, enterBattle } from './shell-helper'

for (const width of [1280, 390]) {
  test(`late chapter groves remain traversable at ${width}`, async ({ page }, testInfo) => {
    const output = process.env.GROVE_OUTPUT || testInfo.outputPath()
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    await page.route('**/*', (route) =>
      new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()
    )
    await page.addInitScript(() => {
      localStorage.setItem(
        'ember-grid:settings:v1',
        JSON.stringify({ version: 1, story: false, tutorial: false, bgm: 0, sfx: 0, speed: 'normal', motion: 'system' })
      )
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await enterBattle(page, './?seed=7', true)
    for (const chapter of [4, 5]) {
      await page.getByRole('button', { name: '任務と編成' }).click()
      await page.locator(`#missions [data-stage="${chapter}"]`).click()
      await acceptDiscard(page)
      await expect(page.locator('.field')).toHaveAttribute('data-mission', String(chapter))
      await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
      await page.waitForTimeout(1500)
      await page.screenshot({ path: `${output}/chapter-${chapter + 1}-${width}.png` })
      const groves = page.locator('.cell.grove')
      expect(await groves.count()).toBeGreaterThan(0)
      await expect(page.locator('.cell.grove.rock')).toHaveCount(0)
      await clickCell(page, page.locator('.cell.ally').first())
      const legalGrove = page.locator('.cell.grove.legal').first()
      await expect(legalGrove).toBeAttached()
      await page.screenshot({ path: `${output}/chapter-${chapter + 1}-selection-${width}.png` })
      await clickCell(page, legalGrove)
      await expect(page.locator('.cell.grove.ally')).not.toHaveCount(0)
    }
    expect(errors).toEqual([])
  })
}
