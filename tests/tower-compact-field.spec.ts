import { test, expect } from '@playwright/test'
import {
  openOfflineCampaign,
  dragUnitToWorld,
  beginUnitDragToWorld,
  beginFieldUnitDragToWorld,
  selectFieldUnit
} from './tower-defense-e2e-arrange'
import { getField, DEFINITIONS } from '../examples/games/tower_diffence_with_jev/src/game/model'

for (const viewport of [
  { width: 2048, height: 1173 },
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
    // The source image's complete portal/castle edges remain inside the field.
    expect(geometry.top).toBeGreaterThanOrEqual(72 - 1)
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.height - 16 + 1)
    expect(mapState.modelRendering.presentation.scale).toBe(1.18)
    expect(mapState.displayGeometry.backingWidth).toBe(1280 * Math.min(await page.evaluate(() => devicePixelRatio), 2))
    expect(mapState.displayGeometry.backingHeight).toBe(920 * Math.min(await page.evaluate(() => devicePixelRatio), 2))
    expect((geometry.right - geometry.left) / (geometry.bottom - geometry.top)).toBeCloseTo(1280 / 920, 5)
    expect(mapState.modelRendering.presentation.aspect).toBe(1)
    if (viewport.width > 800) {
      await dragUnitToWorld(page, 'soldier', getField('meadow', 2, 4).slots[0])
      await expect(page.locator('.defender-handle').first()).toBeVisible()
    }
    for (const heading of ['#field-name', '#time']) {
      const label = (await page.locator(heading).boundingBox())!
      for (const control of ['.topbar', '#assault']) {
        const button = (await page.locator(control).boundingBox())!
        const overlaps =
          label.x < button.x + button.width &&
          label.x + label.width > button.x &&
          label.y < button.y + button.height &&
          label.y + label.height > button.y
        expect(overlaps, `${heading} overlaps ${control}`).toBe(false)
      }
    }
    for (const selector of ['#assault', '#game-title-return']) await expect(page.locator(selector)).toBeVisible()
  })
}

test('proportional real models, picking, HP text and preview rings reflow without moving saved ground positions', async ({
  page
}) => {
  await page.setViewportSize({ width: 2048, height: 1173 })
  await openOfflineCampaign(page)
  const point = getField('meadow', 2, 4).slots[0]
  await beginUnitDragToWorld(page, 'soldier', point)
  const preview = await page.evaluate(() => (window as any).towerDefenseDiagnostics())
  expect(preview.placementPreview.point.x).toBeCloseTo(point.x, 0)
  expect(preview.placementPreview.point.y).toBeCloseTo(point.y, 0)
  expect(preview.displayGeometry.range.visible).toBe(true)
  expect(preview.displayGeometry.scaleX).toBeCloseTo(preview.displayGeometry.scaleY, 5)
  expect(preview.displayGeometry.range.radiusX).toBeCloseTo(preview.displayGeometry.range.radiusY, 5)
  expect(preview.displayGeometry.range.radiusX).toBeCloseTo(DEFINITIONS.soldier.range * preview.displayGeometry.scaleX)
  expect(preview.displayGeometry.range.radiusY).toBeCloseTo(DEFINITIONS.soldier.range * preview.displayGeometry.scaleY)
  await page.screenshot({ path: test.info().outputPath('expanded-field-placement-range.png') })
  await page.mouse.up()
  const label = page.locator('.unit-health.player[data-unit-type="soldier"]')
  await expect(label).toHaveAttribute('data-art-source', 'gltf-mesh')
  const rawSave = await page.evaluate(() => localStorage.getItem('tower-jev-v3'))
  for (const viewport of [
    { width: 2048, height: 1173 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport)
    await expect
      .poll(() => page.locator('#field').evaluate((node) => node.getBoundingClientRect().right))
      .toBeLessThanOrEqual(viewport.width)
    const diagnostic = await page.evaluate(() => (window as any).towerDefenseDiagnostics())
    const ground = diagnostic.units.find((unit: any) => unit.type === 'soldier').groundPosition
    expect(ground.x).toBeCloseTo(point.x, 0)
    expect(ground.y).toBeCloseTo(point.y, 0)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const value = (window as any).towerDefenseDiagnostics()
          const field = document.getElementById('field')!.getBoundingClientRect()
          const hp = document.querySelector('.unit-health.player[data-unit-type="soldier"]')!.getBoundingClientRect()
          const position = value.units.find((unit: any) => unit.type === 'soldier').groundPosition
          return [
            Math.abs(hp.x + hp.width / 2 - field.x - position.x * value.displayGeometry.scaleX) < 0.5,
            Math.abs(hp.width - 48 * value.displayGeometry.scaleY) < 0.5
          ]
        })
      )
      .toEqual([true, true])
    expect(await page.evaluate(() => localStorage.getItem('tower-jev-v3'))).toBe(rawSave)
    await selectFieldUnit(page, 'soldier')
    await expect(page.locator('#selection-context')).toBeVisible()
    await page.locator('#selection-close').click()
    await beginFieldUnitDragToWorld(page, 'soldier', point)
    const range = await page.evaluate(() => (window as any).towerDefenseDiagnostics().displayGeometry.range)
    expect(range.visible).toBe(true)
    expect(range.radiusX).toBeCloseTo(range.radiusY, 5)
    const fieldBounds = (await page.locator('#field').boundingBox())!
    expect(range.screen.x).toBeCloseTo(fieldBounds.x + point.x * diagnostic.displayGeometry.scaleX, 0)
    expect(range.screen.y).toBeCloseTo(fieldBounds.y + point.y * diagnostic.displayGeometry.scaleY, 0)
    await page.screenshot({
      path: test.info().outputPath(`proportional-placement-${viewport.width}x${viewport.height}.png`)
    })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    expect(await page.evaluate(() => localStorage.getItem('tower-jev-v3'))).toBe(rawSave)
  }
  await page.screenshot({ path: test.info().outputPath('expanded-field-real-models.png') })
})
