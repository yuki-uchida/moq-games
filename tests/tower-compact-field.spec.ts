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
    expect(mapState.battlefield.backgroundSource).toBe('approved-map:field:meadow:2:4:projected')
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
    expect(mapState.modelRendering.presentation.scale).toBe(1.5)
    expect(mapState.displayGeometry.backingWidth).toBe(1280 * Math.min(await page.evaluate(() => devicePixelRatio), 2))
    expect(mapState.displayGeometry.backingHeight).toBe(920 * Math.min(await page.evaluate(() => devicePixelRatio), 2))
    expect(geometry.right - geometry.left).toBeCloseTo(viewport.width - 24, 0)
    expect(geometry.bottom - geometry.top).toBeCloseTo(viewport.height - 88, 0)
    expect(mapState.modelRendering.presentation.aspect).toBeCloseTo(
      mapState.displayGeometry.scaleX / mapState.displayGeometry.scaleY
    )
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
    await expect(page.locator('#assault')).toBeVisible()
    await expect(page.locator('#game-title-return')).toBeHidden()
    await page.screenshot({ path: test.info().outputPath(`field-${viewport.width}x${viewport.height}.png`) })
  })
}

test('recomposed roads retain equal horizontal and vertical widths at every screen aspect', async ({ page }) => {
  await page.goto('/moq-games/')
  const widths = await page.evaluate(async () => {
    // Exercise the actual canvas texture, including source-image patches and edging.
    const { createProjectedFieldArt } = await import(
      '/moq-games/examples/games/tower_diffence_with_jev/src/rendering/WorldArt.ts'
    )
    const source = new Image()
    source.src = '/moq-games/tower-defense-map/approved-meadow.png'
    await source.decode()
    return [0.35, 1, 1.25, 1.4, 1.95].map((aspect) => {
      const canvas = createProjectedFieldArt('meadow', aspect, source)
      const c = canvas.getContext('2d')!
      const crossSection = (x: number, y: number, vertical: boolean) => {
        let width = 0
        for (let d = -40; d <= 40; d++) {
          const [r, g, b] = c.getImageData(
            Math.round(x + (vertical ? 0 : d)),
            Math.round(y + (vertical ? d : 0)),
            1,
            1
          ).data
          if (r > 180 && g > 140 && b < 195 && r > g + 8 && g > b + 15) width++
        }
        return width
      }
      return {
        aspect,
        horizontal: crossSection(((350 * 1280) / 1478) * aspect, (128 * 920) / 1064, true),
        vertical: crossSection(((530 * 1280) / 1478) * aspect, (200 * 920) / 1064, false)
      }
    })
  })
  for (const { aspect, horizontal, vertical } of widths) {
    expect(horizontal, `horizontal road at ${aspect}`).toBeCloseTo(40 * Math.min(1, aspect), -1)
    expect(Math.abs(horizontal - vertical), `road widths at ${aspect}`).toBeLessThanOrEqual(3)
  }
})

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
    await expect
      .poll(() =>
        page.evaluate((point) => {
          const value = (window as any).towerDefenseDiagnostics()
          const range = value.displayGeometry.range
          const field = document.getElementById('field')!.getBoundingClientRect()
          return [
            range.visible,
            Math.abs(range.radiusX / value.displayGeometry.scaleX - range.radiusY / value.displayGeometry.scaleY) <
              0.000005,
            Math.abs(range.screen.x - field.x - (point.x * field.width) / 1280) < 0.5,
            Math.abs(range.screen.y - field.y - (point.y * field.height) / 920) < 0.5
          ]
        }, point)
      )
      .toEqual([true, true, true, true])
    await page.screenshot({
      path: test.info().outputPath(`proportional-placement-${viewport.width}x${viewport.height}.png`)
    })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    expect(await page.evaluate(() => localStorage.getItem('tower-jev-v3'))).toBe(rawSave)
  }
  await page.screenshot({ path: test.info().outputPath('expanded-field-real-models.png') })
})
