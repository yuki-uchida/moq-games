import { expect, test } from '@playwright/test'
import { cameraSettled, enterBattle } from './shell-helper'

for (const viewport of [
  { width: 480, height: 320 },
  { width: 568, height: 320 },
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 }
]) {
  test(`compact touch controls at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      localStorage.setItem('ember-grid:settings:v1', JSON.stringify({ version: 1, story: false, tutorial: false }))
    })
    await enterBattle(page, './?seed=7')
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await cameraSettled(page)
    await page.screenshot({ path: info.outputPath('01-ready.png') })
    const field = page.locator('.field')
    const bounds = await field.boundingBox()
    console.log(JSON.stringify({ viewport, field: bounds }))
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    expect(bounds!.height).toBeGreaterThanOrEqual(200)
    // Landscape phones from 520 px wide put the controls beside the board.
    expect(bounds!.width).toBeGreaterThanOrEqual(
      viewport.width === 844 ? 500 : viewport.width === 568 ? 280 : viewport.width - 32
    )
    await page.getByRole('button', { name: /2,4 風読み/ }).tap()
    await expect(page.locator('.cell.legal').first()).toBeVisible()
    const detail = page.getByRole('button', { name: 'ユニット詳細' })
    await detail.tap()
    await expect(page.getByRole('dialog', { name: /風読み/ })).toBeVisible()
    await page.screenshot({ path: info.outputPath('02-detail.png') })
    await page.getByRole('button', { name: '閉じる' }).tap()
    await expect(page.locator('#detail')).toBeHidden()
    await page.getByRole('button', { name: /3,4 木立（受けるダメージ −2） 移動可能/ }).tap()
    const undo = page.getByRole('button', { name: '↶ 戻す' })
    await expect(undo).toBeEnabled()
    await undo.tap()
    await expect(page.getByRole('button', { name: /2,4 風読み/ })).toBeVisible()
    for (const control of [detail, undo, page.locator('#end')]) {
      const box = await control.boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    await detail.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#detail')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#detail')).toBeHidden()
    await expect(detail).toBeFocused()
    if (viewport.width === 568) {
      // Side column: board, status and controls all fit without scrolling the page.
      expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1)
      await expect(page.locator('#end')).toBeInViewport()
      await expect(field).toBeInViewport({ ratio: 0.99 })
    }
    if (viewport.width === 480) {
      await page.locator('#end').scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0)
      await expect(page.locator('#end')).toBeInViewport()
      await page.screenshot({ path: info.outputPath('03-controls.png') })
      await field.scrollIntoViewIfNeeded()
      await expect(field).toBeInViewport({ ratio: 0.99 })
    }
    await page.screenshot({ path: info.outputPath('03-restored.png') })
    expect(errors).toEqual([])
  })
}
