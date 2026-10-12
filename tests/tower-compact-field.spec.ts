import { test, expect } from '@playwright/test'
import { openOfflineCampaign, dragUnitToWorld } from './tower-defense-e2e-arrange'
import { getField } from '../examples/games/tower_diffence_with_jev/src/game/model'

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 320, height: 568 }
]) {
  test(`compact battlefield fits ${viewport.width}×${viewport.height} without scrolling`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openOfflineCampaign(page)
    await expect(page.locator('#field')).toHaveAttribute('data-layout-revision', '4')
    await expect
      .poll(() => page.evaluate(() => (window as any).towerDefenseDiagnostics().environment.active))
      .toBe(true)
    const mapState = await page.evaluate(() => (window as any).towerDefenseDiagnostics())
    expect(mapState.newCampaignLayoutRevision).toBe(4)
    expect(mapState.battlefield).toMatchObject({ layoutRevision: 4, width: 1280, height: 920 })
    expect(mapState.battlefield.backgroundSource).toBe('approved-map:field:meadow:2:4')
    expect(mapState.environment.error).toBeUndefined()
    const geometry = await page.evaluate(() => {
      const map = document.getElementById('map-scroll')!
      const field = document.getElementById('field')!.getBoundingClientRect()
      return {
        width: innerWidth,
        height: innerHeight,
        left: field.left,
        top: field.top,
        right: field.right,
        bottom: field.bottom,
        scrollWidth: map.scrollWidth,
        scrollHeight: map.scrollHeight,
        clientWidth: map.clientWidth,
        clientHeight: map.clientHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight
      }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(-1)
    expect(geometry.top).toBeGreaterThanOrEqual(-1)
    expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1)
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1)
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1)
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width)
    expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.height)
    if (viewport.width > 800) {
      await dragUnitToWorld(page, 'soldier', getField('meadow', 2, 4).slots[0])
      await expect(page.locator('.defender-handle').first()).toBeVisible()
    }
    for (const selector of ['#assault', '#game-title-return']) await expect(page.locator(selector)).toBeVisible()
  })
}
