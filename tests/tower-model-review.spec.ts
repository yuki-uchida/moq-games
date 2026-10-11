import { test, expect } from '@playwright/test'

test('actual GLB review draws mesh geometry, replays authored motions and rotates without spritesheets', async ({ page }) => {
  const failures: string[] = []
  const sheetRequests: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
  page.on('request', request => { if (/\.(png|webp)(\?|$)/.test(request.url())) sheetRequests.push(request.url()) })
  await page.goto('/moq-games/examples/games/tower_diffence_with_jev/model-review.html')
  await expect(page.locator('#status')).toContainText('gltf-mesh: 9 meshes', { timeout: 30000 })
  await expect.poll(() => page.evaluate(() => (window as any).modelReview?.renderer.triangles ?? 0)).toBeGreaterThan(100)
  for (const motion of ['idle', 'walk', 'attack', 'death']) {
    await page.locator('#motion').selectOption(motion)
    await page.locator('#replay').click()
    await expect.poll(() => page.evaluate(() => (window as any).modelReview?.motion)).toBe(motion)
    await expect.poll(() => page.evaluate(() => (window as any).modelReview?.seconds ?? 0)).toBeGreaterThan(.1)
    for (let direction = 0; direction < 8; direction++) await page.locator('#turn').click()
  }
  await page.screenshot({ path: test.info().outputPath('slime-real3d-review.png') })
  expect(failures).toEqual([])
  expect(sheetRequests).toEqual([])
})
