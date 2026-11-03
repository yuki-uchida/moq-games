import { expect, test } from '@playwright/test'
import { acceptDiscard, cameraSettled, enterBattle } from './shell-helper'

for (const width of [1280, 390]) {
  test(`chapter floors and tactical overlays ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    await page.addInitScript(() => {
      setInterval(() => document.querySelector<HTMLButtonElement>('.story-overlay button')?.click(), 100)
    })
    await enterBattle(page, './?seed=7', true)
    const details = new Set<string>()
    for (const chapter of [0, 1, 2, 3, 4, 5]) {
      if (chapter > 0) {
        await page.getByRole('button', { name: '任務と編成' }).click()
        await page.locator(`[data-stage="${chapter}"]`).click()
        await acceptDiscard(page)
      }
      await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
      await expect(page.locator('.story-overlay')).toHaveCount(0)
      await expect(page.locator('#phase-banner')).toBeHidden()
      await page.getByRole('button', { name: '全体を表示' }).click()
      await cameraSettled(page)
      const field = page.locator('.field')
      await expect(field).toHaveAttribute('data-mission', String(chapter))
      details.add(await field.evaluate((element) => getComputedStyle(element).getPropertyValue('--floor-detail')))
      if (width === 390) expect((await field.boundingBox())!.width).toBeGreaterThanOrEqual(374)
      await expect(page.locator('.cell')).toHaveCount(100)
      if (chapter === 3)
        expect(await page.locator('.seize').evaluate((element) => getComputedStyle(element, '::after').content)).toBe(
          '"✦"'
        )
      await page.screenshot({ path: testInfo.outputPath(`ch${chapter + 1}-${width}.png`) })
      if ([0, 3, 5].includes(chapter)) {
        await page.locator('.cell.ally:not(.done)').first().click()
        await expect(page.locator('.cell.selected')).toHaveCount(1)
        expect(await page.locator('.cell.legal').count()).toBeGreaterThan(0)
        await page.keyboard.press('Shift')
        await page.locator('.cell.selected').focus()
        expect(await page.locator('.cell.selected').evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
          'solid'
        )
        await cameraSettled(page)
        await page.screenshot({ path: testInfo.outputPath(`ch${chapter + 1}-selected-${width}.png`) })
        await page.locator('#danger').click()
        expect(await page.locator('.cell.danger').count()).toBeGreaterThan(0)
        expect(
          await page
            .locator('.cell.danger')
            .first()
            .evaluate((element) => getComputedStyle(element).outlineStyle)
        ).toBe('dashed')
        await page.screenshot({ path: testInfo.outputPath(`ch${chapter + 1}-danger-${width}.png`) })
        await page.locator('#danger').click()
      }
    }
    expect(details.size).toBe(6)
  })
}
