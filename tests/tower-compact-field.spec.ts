import { test, expect } from '@playwright/test'
import { COMPACT_BOARD_TOP_BLEED } from '../examples/games/tower_diffence_with_jev/src/rendering/BoardCamera'
import sharp from 'sharp'
import {
  openOfflineCampaign,
  dragUnitToWorld,
  beginUnitDragToWorld,
  beginFieldUnitDragToWorld,
  openItemTray,
  pointOnVisibleMap,
  selectFieldUnit,
  towerPath
} from './tower-defense-e2e-arrange'
import { getField, DEFINITIONS, ALLY_TYPES } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { GameEngine } from '../examples/games/tower_diffence_with_jev/src/game/GameEngine'
import { freshRunFromProfile } from '../examples/games/tower_diffence_with_jev/src/progression/UpgradeSystem'
import { stageStartGold } from '../examples/games/tower_diffence_with_jev/src/progression/StageProgress'
import { FORTIFICATIONS } from '../examples/games/tower_diffence_with_jev/src/game/Fortifications'

test('snow, desert and volcanic terrain retain their colors without Canvas2D filters', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    if (sessionStorage.getItem('disable-map-filter') === 'true')
      Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', { get: () => undefined, set: () => {} })
  })
  await page.goto('/moq-games/')
  const swatches: number[][] = []
  for (const biome of ['frost', 'desert', 'volcanic'] as const) {
    const save = freshRunFromProfile({ version: 1, purchased: [] }, 2, 1)
    const engine = new GameEngine({ decide: async () => null }, save, biome, 42, () => 0, undefined, 2, 4)
    const checkpoint = engine.exportCheckpoint()!
    const raw = JSON.stringify({ version: 3, profile: checkpoint.profile, run: { version: 1, progress: checkpoint.progress, engine: checkpoint } })
    const colors: number[][] = []
    for (const disabled of [false, true]) {
      await page.evaluate(({ raw, disabled }) => {
        localStorage.setItem('tower-jev-v3', raw)
        localStorage.setItem('tower-jev-coach-v1', '1')
        sessionStorage.setItem('disable-map-filter', String(disabled))
      }, { raw, disabled })
      await page.goto(towerPath)
      await page.locator('#title-continue').click()
      await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
      await expect.poll(() => page.evaluate(() => (window as any).towerDefenseDiagnostics().battlefield.backgroundSource))
        .toBe(`approved-map:field:${biome}:2:4:projected`)
      const field = page.locator('#field')
      const box = (await field.boundingBox())!
      // Sample open ground, clear of the gate, HUD, and any animated models.
      const patch = { left: Math.round(box.width * 0.768), top: Math.round(box.height * 0.31), width: 12, height: 12 }
      const sample = await sharp(await field.screenshot({ scale: 'css' })).extract(patch).removeAlpha().png().toBuffer()
      const { channels } = await sharp(sample).stats()
      colors.push(channels.map((channel) => Math.round(channel.mean)))
    }
    const [native, fallback] = colors
    swatches.push(fallback)
    expect(fallback[2] > fallback[0], biome).toBe(biome === 'frost')
    for (const [channel, value] of fallback.entries())
      expect(Math.abs(value - native[channel]), biome).toBeLessThanOrEqual(2)
  }
  expect(swatches[1][0] - swatches[2][0]).toBeGreaterThan(25)
})

// One cold campaign preparation, opened at the most constrained viewport and then
// resized through the rest; each cold start costs ~40s on software WebGL runners.
test('compact battlefield fits every supported viewport without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await openOfflineCampaign(page)
  await expect(page.locator('#field')).toHaveAttribute('data-layout-revision', '4')
  let deployed = false
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 2048, height: 1173 }
  ])
    await test.step(`${viewport.width}×${viewport.height}`, async () => {
      await page.setViewportSize(viewport)
      await expect
        .poll(() =>
          page.evaluate(() => {
            const state = (window as any).towerDefenseDiagnostics()
            const field = document.getElementById('field')!.getBoundingClientRect()
            return (
              state.environment.active &&
              // The projected background is rebuilt asynchronously after each resize.
              state.battlefield.backgroundSource === 'approved-map:field:meadow:2:4:projected' &&
              Math.abs(field.right - field.left - (innerWidth - 24)) < 1 &&
              Math.abs(
                state.modelRendering.presentation.aspect - state.displayGeometry.scaleX / state.displayGeometry.scaleY
              ) < 0.00001
            )
          })
        )
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
          documentHeight: document.documentElement.scrollHeight,
          expectedTop: parseFloat(getComputedStyle(map).paddingTop),
          hudBottom: document.querySelector('.battle-hud')!.getBoundingClientRect().bottom
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
      expect(geometry.top).toBeCloseTo(geometry.expectedTop, 0)
      expect(geometry.top).toBeGreaterThanOrEqual(geometry.hudBottom + 1)
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.height - 16 + 1)
      const aspect = ((geometry.right - geometry.left) / 1280) / ((geometry.bottom - geometry.top) / 920)
      expect(mapState.modelRendering.presentation.scale).toBeCloseTo(1 + 0.5 * Math.min(1, aspect), 5)
      expect(mapState.displayGeometry.backingWidth).toBe(
        1280 * Math.min(await page.evaluate(() => devicePixelRatio), 2)
      )
      expect(mapState.displayGeometry.backingHeight).toBe(
        (920 + COMPACT_BOARD_TOP_BLEED) * Math.min(await page.evaluate(() => devicePixelRatio), 2)
      )
      expect(geometry.right - geometry.left).toBeCloseTo(viewport.width - 24, 0)
      expect(geometry.bottom - geometry.top).toBeCloseTo(viewport.height - geometry.expectedTop - 16, 0)
      expect(mapState.modelRendering.presentation.aspect).toBeCloseTo(
        mapState.displayGeometry.scaleX / mapState.displayGeometry.scaleY
      )
      // Deployment is limited to one defender; place it at the first wide viewport.
      if (viewport.width > 800 && !deployed) {
        await dragUnitToWorld(page, 'soldier', getField('meadow', 2, 4).slots[0])
        deployed = true
      }
      if (deployed) await expect(page.locator('.defender-handle').first()).toBeVisible()
      for (const heading of ['.map-heading', '.battle-hud']) {
        const label = (await page.locator(heading).boundingBox())!
        for (const control of ['.topbar', '.field-controls', heading === '.map-heading' ? '.battle-hud' : '.map-heading']) {
          const button = (await page.locator(control).boundingBox())!
          const overlaps =
            label.x < button.x + button.width &&
            label.x + label.width > button.x &&
            label.y < button.y + button.height &&
            label.y + label.height > button.y
          expect(overlaps, `${heading} overlaps ${control}`).toBe(false)
        }
      }
      expect((await page.locator('.field-controls').boundingBox())!.y).toBeGreaterThan(
        (geometry.top + geometry.bottom) / 2
      )
      await expect(page.locator('#assault')).toBeVisible()
      await expect(page.locator('#game-title-return')).toBeHidden()
      await page.screenshot({ path: test.info().outputPath(`field-${viewport.width}x${viewport.height}.png`) })
    })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('#assault').click()
  await expect(page.locator('.bhud-pause')).toBeVisible()
  await expect(page.locator('.fx-banner.assault')).toBeVisible()
  for (const [width, height] of [[320, 568], [390, 844], [768, 650], [844, 390], [951, 750], [1440, 900]]) {
    await page.setViewportSize({ width, height })
    await expect.poll(() => page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      const hud = rect('.battle-hud')
      const controls = rect('.topbar')
      const skill = rect('#skill-bar')
      return hud.width > 0 && skill.width > 0 && hud.left >= 0 && hud.right <= innerWidth &&
        hud.bottom < rect('#field').top && (hud.right <= controls.left || hud.top >= controls.bottom) &&
        rect('#field').bottom <= Math.min(skill.top, rect('.field-controls').top) &&
        (skill.bottom <= rect('.field-controls').top || rect('.field-controls').right <= skill.left)
    }), { message: `assault HUD at ${width}×${height}` }).toBe(true)
  }
  await expect(page.locator('.fx-banner.assault')).toHaveCount(0)
})

test('the full roster footer leaves the gate and final road tappable after rotation', async ({ page }) => {
  const field = getField('meadow', 2, 4)
  const save = freshRunFromProfile({ version: 1, purchased: [...ALLY_TYPES.slice(4)] }, 2, 1)
  save.gold = stageStartGold(10)
  const engine = new GameEngine({ decide: async () => null }, save, 'meadow', 42, () => 0, undefined, 2, 4)
  expect(engine.startAtStage(10)).toBe(true)
  for (const type of ALLY_TYPES) expect(field.slots.some((slot) => engine.place(type, slot)), type).toBe(true)
  const checkpoint = engine.exportCheckpoint()!
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript((raw) => {
    localStorage.setItem('tower-jev-v3', raw)
    localStorage.setItem('tower-jev-coach-v1', '1')
  }, JSON.stringify({ version: 3, profile: checkpoint.profile, run: { version: 1, progress: checkpoint.progress, engine: checkpoint } }))
  await page.goto('/moq-games/examples/games/tower_diffence_with_jev/')
  await page.locator('#title-continue').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  await page.locator('#assault').click()
  await expect(page.locator('.skill-btn')).toHaveCount(10)
  await expect(page.locator('.fx-banner.assault')).toBeHidden()
  for (const [width, height] of [[390, 844], [320, 568], [844, 390], [1440, 900]]) {
    await page.setViewportSize({ width, height })
    await expect.poll(() => page.evaluate(({ gate, road, width, height }) => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      const board = rect('#field')
      const footerTop = Math.min(rect('#skill-bar').top, rect('.field-controls').top)
      const hit = (point: { x: number; y: number }) => !!document.elementFromPoint(
        board.left + board.width * point.x / width,
        board.top + board.height * point.y / height
      )?.closest('#field')
      return { separate: board.bottom <= footerTop, gate: hit(gate), road: road.every(hit), compact: innerHeight - board.bottom < 150 }
    }, { gate: field.gate, road: field.path.slice(-12), width: field.width, height: field.height }), {
      message: `gate and footer at ${width}×${height}`
    }).toEqual({ separate: true, gate: true, road: true, compact: true })
    await page.screenshot({ path: test.info().outputPath(`full-roster-${width}.png`), scale: 'css' })
  }
  await page.setViewportSize({ width: 320, height: 568 })
  const tenth = page.locator('.skill-btn').nth(9)
  await tenth.focus()
  await page.keyboard.press('Shift+Enter')
  await expect(page.locator('#unit-special')).toHaveText('×')
  await page.locator('#unit-special').click()
  await expect(page.locator('#selection-context[data-aiming]')).toHaveCount(0)
  const touch = await page.context().newCDPSession(page)
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true })
  const list = page.locator('.skill-scroll')
  await list.evaluate((element) => { element.scrollLeft = 0 })
  const bar = (await list.boundingBox())!
  const sendTouch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
    touch.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  const swipeY = bar.y + 30
  await sendTouch('touchStart', bar.x + 180, swipeY)
  for (let offset = 160; offset >= 20; offset -= 20) await sendTouch('touchMove', bar.x + offset, swipeY)
  await sendTouch('touchEnd')
  await expect.poll(() => list.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  await expect(page.locator('#selection-context[data-aiming]')).toHaveCount(0)
  await tenth.scrollIntoViewIfNeeded()
  const last = (await tenth.boundingBox())!
  await sendTouch('touchStart', last.x + last.width / 2, last.y + last.height / 2)
  await expect(page.locator('#unit-special')).toHaveText('×')
  await sendTouch('touchEnd')
  await page.locator('#unit-special').click()
  await expect(page.locator('#selection-context[data-aiming]')).toHaveCount(0)
  await touch.detach()
  await page.locator('#skill-auto').click()
  await expect(page.locator('#skill-auto')).toHaveAttribute('aria-pressed', 'true')
  await page.locator('#items-toggle').click()
  await expect(page.locator('#item-tray')).toBeVisible()
  await page.locator('#item-tray-close').click()
  await expect(page.locator('#item-tray')).toBeHidden()
})

test.describe('compact road inputs', () => {
  test.use({ hasTouch: true })
  for (const touch of [false, true]) {
    test(`road tools commit only on the logical board (${touch ? 'touch' : 'mouse'})`, async ({ page }) => {
      await page.setViewportSize(touch ? { width: 390, height: 844 } : { width: 1440, height: 900 })
      await openOfflineCampaign(page)
      const tap = (point: { x: number; y: number }) =>
        touch ? page.touchscreen.tap(point.x, point.y) : page.mouse.click(point.x, point.y)
      const read = () => page.evaluate(() => {
        const { state, progress } = JSON.parse(localStorage.getItem('tower-jev-v3')!).run.engine
        return { gold: progress.gold, stock: state.sandbagStock, bags: state.sandbags.length, items: state.fortifications.items.length }
      })
      const initial = await read()
      const board = (await page.locator('#field').boundingBox())!
      const headroom = { x: board.x + board.width * 0.7, y: board.y - 4 }
      const hitsCanvas = (point: { x: number; y: number }) => page.evaluate(({ x, y }) =>
        document.elementFromPoint(x, y)?.matches('#field canvas') ?? false, point)
      expect(await hitsCanvas(headroom)).toBe(true)
      const road = getField('meadow', 2, 4).path
      for (const [tool, pathIndex] of [['#sandbag-place', 80], ['#item-spike', 150]] as const) {
        const before = await read()
        const arm = async () => {
          await openItemTray(page)
          await page.locator(tool).click()
          await expect(page.locator(tool)).toHaveAttribute('aria-pressed', 'true')
        }
        await arm()
        await tap(headroom)
        expect(await read()).toEqual(before)
        await expect(page.locator(tool)).toHaveAttribute('aria-pressed', 'true')
        await page.keyboard.press('Escape')
        await expect(page.locator(tool)).toHaveAttribute('aria-pressed', 'false')
        const point = await pointOnVisibleMap(page, road[pathIndex])
        expect(await hitsCanvas(point)).toBe(true)
        await tap(point)
        expect(await read()).toEqual(before)
        await arm()
        await tap(point)
        const expected = tool === '#sandbag-place'
          ? { ...before, bags: before.bags + 1, stock: before.stock - 1 }
          : { ...before, items: before.items + 1, gold: before.gold - FORTIFICATIONS.spike.cost }
        await expect.poll(read, { timeout: 4000 }).toEqual(expected)
      }
      expect(await read()).toEqual({ gold: initial.gold - FORTIFICATIONS.spike.cost, stock: initial.stock - 1, bags: 1, items: 1 })
      const speed = page.locator('.bhud-speed')
      const speedBox = (await speed.boundingBox())!
      const speedCenter = { x: speedBox.x + speedBox.width / 2, y: speedBox.y + speedBox.height / 2 }
      const canvas = (await page.locator('#field canvas').first().boundingBox())!
      expect(speedCenter.y).toBeGreaterThan(canvas.y)
      expect(speedCenter.y).toBeLessThan(board.y)
      expect(speedCenter.x).toBeGreaterThan(canvas.x)
      expect(speedCenter.x).toBeLessThan(canvas.x + canvas.width)
      await expect(speed).toHaveAttribute('aria-pressed', 'false')
      await tap(speedCenter)
      await expect(speed).toHaveAttribute('aria-pressed', 'true')
    })
  }
})

test('recomposed roads retain equal horizontal and vertical widths at every screen aspect', async ({ page }) => {
  await openOfflineCampaign(page)
  for (const targetAspect of [0.35, 1, 1.25, 1.4, 1.95]) {
    // Keep the field 920 CSS pixels high so the published WebGL output is sampled
    // at texture resolution, including source-image patches, edging and projection.
    const width = Math.round(1280 * targetAspect) + 24
    await page.setViewportSize({ width, height: 1008 })
    const verticalPadding = await page.locator('#map-scroll').evaluate((map) => {
      const style = getComputedStyle(map)
      return parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    })
    await page.setViewportSize({ width, height: 920 + verticalPadding })
    await expect
      .poll(() =>
        page.evaluate(() => {
          const state = (window as any).towerDefenseDiagnostics()
          return (
            state.battlefield.backgroundSource === 'approved-map:field:meadow:2:4:projected' &&
            Math.abs(state.modelRendering.presentation.aspect - (innerWidth - 24) / 1280) < 0.00001
          )
        })
      )
      .toBe(true)
    const field = page.locator('#field')
    const { data, info } = await sharp(
      await field.screenshot({ scale: 'css', path: test.info().outputPath(`roads-${targetAspect}.png`) })
    )
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const aspect = info.width / info.height / (1280 / 920)
    expect(info.height).toBe(920)
    const isRoad = (x: number, y: number) => {
      const offset = (Math.round(y) * info.width + Math.round(x)) * info.channels
      const [red, green, blue] = data.subarray(offset, offset + 3)
      return red > 180 && green > 140 && blue < 195 && red > green + 8 && green > blue + 15
    }
    const crossSection = (x: number, y: number, vertical: boolean) => {
      let width = 0
      for (let d = -40; d <= 40; d++) {
        if (isRoad(x + (vertical ? 0 : d), y + (vertical ? d : 0))) width++
      }
      return width
    }
    const horizontal = crossSection(((350 * 1280) / 1478) * aspect, (128 * 920) / 1064, true)
    const vertical = crossSection(((530 * 1280) / 1478) * aspect, (200 * 920) / 1064, false)
    expect(horizontal, `horizontal road at ${aspect}`).toBeCloseTo(40 * Math.min(1, aspect), -1)
    expect(Math.abs(horizontal - vertical), `road widths at ${aspect}`).toBeLessThanOrEqual(3)
    if (targetAspect === 0.35) {
      const sourceScale = 920 / 1064
      expect(isRoad(220 * sourceScale * aspect, (68 + (128 - 68) * aspect) * sourceScale)).toBe(false)
      expect(isRoad(220 * sourceScale * aspect, 128 * sourceScale)).toBe(true)
    }
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
