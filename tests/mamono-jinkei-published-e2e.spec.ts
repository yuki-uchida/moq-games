import { expect, test } from '@playwright/test'

// Smoke test of the published マモノ陣形 build: the title, a solo start and real input reach the play phase.
for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 }
]) {
  test(`published mamono-jinkei starts solo play at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
    })
    await page.goto('/moq-games/examples/games/mamono-jinkei/index.html')
    await expect(page.getByRole('heading', { name: 'マモノ陣形' })).toBeVisible()
    expect(await page.evaluate(() => '__mamono' in window)).toBe(false)
    await page.getByRole('button', { name: /ひとりで遊ぶ/ }).click()
    await page.getByRole('button', { name: '出発！' }).click()
    await expect(page.locator('.intro-name')).toHaveText('ぷるぷる草原と古城跡')
    await expect(page.locator('.hud')).toBeVisible({ timeout: 10_000 })
    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible()
    await page.keyboard.down('KeyD')
    await page.waitForTimeout(600)
    await page.keyboard.up('KeyD')
    await page.mouse.move(viewport.width / 2 + 120, viewport.height / 2)
    await page.mouse.down()
    await page.mouse.up()
    await page.getByRole('button', { name: /メニュー/ }).click()
    await expect(page.getByRole('dialog', { name: 'メニュー' })).toBeVisible()
    expect(errors).toEqual([])
  })
}
