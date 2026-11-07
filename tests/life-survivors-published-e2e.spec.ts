import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 }
]) {
  test(`published life-survivors starts and advances at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
    })
    await page.goto('/moq-games/examples/games/life-survivors/index.html')
    await expect(page.getByRole('heading', { name: /ジンセイガ・ツライデース/ })).toBeVisible()
    expect(await page.evaluate(() => '__life' in window)).toBe(false)
    await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
    await expect(page.locator('#hud')).toBeVisible()
    await expect(page.locator('#world')).toBeVisible()
    await expect
      .poll(async () => {
        if (await page.locator('#levelup').isVisible()) await page.locator('#cards .card').first().press('Enter')
        return page.locator('#clock').textContent()
      })
      .not.toBe('00:00')
    await page.getByRole('button', { name: '遊び方を表示' }).click()
    await expect(page.getByRole('heading', { name: '遊び方', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '閉じる', exact: true }).click()
    expect(errors).toEqual([])
  })
}
