import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ALLY_TYPES, CONFIG, ENEMY_TYPES, getField, pointOnPath, RANGED_ALLY_TYPES } from '../src/game/model'
import { distanceToRoadUnion } from '../src/game/BattlefieldRoutes'
import { stageLayout } from '../src/rendering/stack/stage/StackStage'
import { BIOMES, GROUND_CELL, paintGround } from '../src/rendering/stack/stage/ground'
import { castleDesign, denDesign } from '../src/rendering/stack/stage/landmarks'
import { ALL_PROPS } from '../src/rendering/stack/stage/props'
import { ATTACK_PROFILES } from '../src/game/AttackProfiles'
import { STACK_DESIGNS } from '../src/rendering/stack/designs'
import { commander } from '../src/rendering/stack/designs/commander'
import type { StackMotion } from '../src/rendering/stack/StackDesign'
import { MAX_STACK_PARTS } from '../src/rendering/stack/StackModel'
import { poseMatrices } from '../src/rendering/stack/StackRig'
import { stackBoardMatrix, stackModel, StackVisual } from '../src/rendering/stack/StackVisual'
import { stackSplats } from '../src/rendering/stack/StackPortrait'
import { hitFlash, unitStackPose } from '../src/rendering/stack/StackUnitLayer'
import { carveFourViews, drawStackPixels, type FlatViewImage, type SliceSheet } from '../src/rendering/stack/SliceSheet'

const ROLES = [...ALLY_TYPES, ...ENEMY_TYPES]
const MOTIONS: StackMotion[] = ['idle', 'walk', 'attack', 'heal', 'breath', 'special']

describe('sprite-stack roster', () => {
  it('gives every game role and the commander its own figure', () => {
    for (const role of ROLES) expect(STACK_DESIGNS[role]?.type, role).toBe(role)
    expect(commander.type).toBe('commander')
  })
  for (const design of [...ROLES.map((role) => STACK_DESIGNS[role]!), commander]) {
    it(`${design.type} builds a bounded, animated stack`, () => {
      const model = stackModel(design)
      expect(model.parts.length).toBeLessThanOrEqual(MAX_STACK_PARTS)
      expect(model.sliceCount).toBeGreaterThan(8)
      expect(model.palette.colors.length).toBeLessThanOrEqual(256)
      expect(model.texture.image.width * model.texture.image.height).toBeLessThanOrEqual(1024 * 1024)
      const profile = ATTACK_PROFILES[design.type as keyof typeof ATTACK_PROFILES] ?? { durationMs: 900, cueMs: 450 }
      for (const motion of MOTIONS)
        for (const seconds of [0, profile.cueMs / 1000, profile.durationMs / 1000]) {
          const pose = design.pose({ motion, seconds, cycle: seconds, time: seconds, seed: 0.3, ...profile })
          const matrices = poseMatrices(model, pose, new Float32Array(MAX_STACK_PARTS * 16))
          expect(matrices.every(Number.isFinite), `${design.type} ${motion} ${seconds}`).toBe(true)
        }
      // Each figure has a face side: the painted bust is never empty.
      expect(stackSplats(design).length).toBeGreaterThan(200)
    })
  }
  it('gives every ranged role a projectile origin that follows its weapon', () => {
    for (const role of [...RANGED_ALLY_TYPES, 'shaman', 'wraith', 'dragon'] as const) {
      const design = STACK_DESIGNS[role]!
      expect(design.emitter, role).toBeDefined()
      const visual = new StackVisual(design, 0)
      visual.setPosition(400, 300)
      const profile = ATTACK_PROFILES[role]
      visual.sample({
        motion: role === 'healer' ? 'heal' : 'attack',
        seconds: profile.cueMs / 1000,
        facingX: 1,
        facingY: 0,
        boss: false,
        ...profile
      })
      const point = visual.emitterPoint()!
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
      // Released within a figure's reach of the caster.
      expect(Math.hypot(point.x - 400, point.y - 300), role).toBeLessThan(120)
      visual.dispose()
    }
  })
})

describe('sprite-stack projection', () => {
  it('points a figure front (+z) along its board facing', () => {
    const visual = new StackVisual(STACK_DESIGNS.soldier!, 0)
    for (const [fx, fy] of [
      [1, 0],
      [0, 1],
      [-1, -1],
      [0.4, -1]
    ]) {
      const yaw = visual.headingYaw(fx, fy)
      const m = stackBoardMatrix(new THREE.Matrix4(), 0, 0, yaw, 1)
      const front = new THREE.Vector3(0, 0, 1).applyMatrix4(m).sub(new THREE.Vector3().applyMatrix4(m))
      const angle = Math.atan2(front.y, front.x) - Math.atan2(fy, fx)
      expect(Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))), `${fx},${fy}`).toBeLessThan(1e-6)
    }
    visual.dispose()
  })
  it('draws a figure lower on the board over one behind it', () => {
    const height = 40
    const depthAt = (y: number, point: THREE.Vector3) =>
      point.clone().applyMatrix4(stackBoardMatrix(new THREE.Matrix4(), 0, y, 0, 2.4, 1.5)).z
    // The back figure's highest, nearest cell against the front figure's lowest, farthest cell.
    const back = depthAt(500, new THREE.Vector3(0, height, 14))
    const front = depthAt(520, new THREE.Vector3(0, 0, -14))
    expect(front).toBeGreaterThan(back)
  })
  it('keeps attacks on the simulation clock and flashes hits in ten steps', () => {
    const unit = {
      hp: 10,
      moving: false,
      facingX: 1,
      facingY: 0,
      boss: false,
      type: 'soldier',
      hitAnimation: 0.05,
      owner: 'player'
    } as never
    expect(unitStackPose(unit, 3).motion).toBe('idle')
    const flash = hitFlash({ hitAnimation: 0.1, owner: 'ai' })
    expect(Math.round(flash * 10)).toBe(flash * 10)
  })
})

describe('sprite-stacked stage', () => {
  const fields = (['meadow', 'desert', 'frost', 'volcanic'] as const).flatMap((id) => [
    getField(id, 2, 4),
    getField(id, 1, 1)
  ])
  it('keeps scenery off the road, the slots, the entrance and the gate', () => {
    for (const field of fields) {
      const layout = stageLayout(field)
      expect(layout.length, field.id).toBeGreaterThan(10)
      for (const spot of layout) {
        expect(distanceToRoadUnion(field, spot), `${field.id} road`).toBeGreaterThan(CONFIG.roadWidth / 2)
        if (field.layoutRevision === 4) {
          for (const slot of field.slots) expect(Math.hypot(slot.x - spot.x, slot.y - spot.y)).toBeGreaterThan(40)
          for (const end of [field.entrance, field.gate])
            expect(Math.hypot(end.x - spot.x, end.y - spot.y)).toBeGreaterThan(150)
        }
      }
    }
  })
  it('paints the road exactly where enemies walk', () => {
    const field = getField('meadow', 2, 4)
    const ground = paintGround(field, 1)
    const at = (point: { x: number; y: number }) => {
      const i = Math.floor(point.x / GROUND_CELL),
        j = Math.floor(point.y / GROUND_CELL)
      return Array.from(ground.data.subarray((j * ground.width + i) * 4, (j * ground.width + i) * 4 + 3))
    }
    const road = BIOMES.meadow.road.map((hex) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16)))
    const isRoadish = (rgb: number[]) => rgb[0] > rgb[1] && rgb[0] > 110
    for (let progress = 40; progress < 2000; progress += 160)
      expect(isRoadish(at(pointOnPath(field.path, progress))), String(progress)).toBe(true)
    expect(road.length).toBe(3)
    expect(isRoadish(at({ x: field.width / 2, y: 8 }))).toBe(false)
  })
  it('builds a castle for every damage tier and a den for every biome', () => {
    for (const id of ['meadow', 'desert', 'frost', 'volcanic'] as const) {
      const cells = ([0, 1, 2] as const).map((tier) => stackModel(castleDesign(id, tier)).voxels[0].size)
      expect(cells[2]).toBeGreaterThan(cells[1])
      expect(cells[1]).toBeGreaterThan(cells[0])
      expect(stackModel(denDesign(id)).sliceCount).toBeGreaterThan(10)
    }
    for (const design of ALL_PROPS) expect(stackModel(design).sliceCount, design.blueprint.id).toBeGreaterThan(2)
  })
})

function opaqueBounds(pixels: Uint8ClampedArray, w: number, h: number) {
  let minX = w,
    maxX = -1,
    minY = h,
    maxY = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (pixels[(y * w + x) * 4 + 3] >= 128) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
  return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

describe('SpriteCook draw_stack & four-view slice contract', () => {
  const makeTestSheet = (): SliceSheet => {
    const w = 8,
      h = 14,
      count = 6
    const pixels = new Uint8ClampedArray(w * count * h * 4)
    const shadow = new Uint8Array(w * h)
    for (let z = 0; z < count; z++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dst = (y * w * count + z * w + x) * 4
          pixels[dst] = 30 + z * 35
          pixels[dst + 1] = 80 + x * 15
          pixels[dst + 2] = 100 + y * 10
          pixels[dst + 3] = 255
          shadow[y * w + x] = 255
        }
      }
    }
    return { width: w, height: h, count, cx: Math.floor(w / 2), cy: Math.floor(h / 2), baseLift: 0, pixels, shadow }
  }

  it('matches pasting slices 1 px above the last pixel-for-pixel at squash 1, turn 0', () => {
    const sheet = makeTestSheet()
    const drawn = drawStackPixels(sheet, { turn: 0, squash: 1, spacing: 1, outline: false, shadow: false })
    const b = opaqueBounds(drawn.pixels, drawn.width, drawn.height)
    expect(b.width).toBe(sheet.width)
    expect(b.height).toBe(sheet.height + sheet.count - 1)

    // Paste slices manually onto a reference canvas, each 1 px higher than the previous.
    const refW = sheet.width
    const refH = sheet.height + sheet.count - 1
    const ref = new Uint8ClampedArray(refW * refH * 4)
    for (let z = 0; z < sheet.count; z++) {
      const topY = sheet.count - 1 - z
      for (let y = 0; y < sheet.height; y++) {
        for (let x = 0; x < sheet.width; x++) {
          const src = (y * sheet.width * sheet.count + z * sheet.width + x) * 4
          const dst = ((topY + y) * refW + x) * 4
          ref[dst] = sheet.pixels[src]
          ref[dst + 1] = sheet.pixels[src + 1]
          ref[dst + 2] = sheet.pixels[src + 2]
          ref[dst + 3] = sheet.pixels[src + 3]
        }
      }
    }
    for (let y = 0; y < refH; y++) {
      for (let x = 0; x < refW; x++) {
        const d = ((b.minY + y) * drawn.width + (b.minX + x)) * 4
        const r = (y * refW + x) * 4
        expect([drawn.pixels[d], drawn.pixels[d + 1], drawn.pixels[d + 2], drawn.pixels[d + 3]]).toEqual([
          ref[r],
          ref[r + 1],
          ref[r + 2],
          ref[r + 3]
        ])
      }
    }
  })

  it('respects squash 0.75, 90-degree turn width, spacing 2, spacing 0 flat, and exterior-only 1px outline', () => {
    const sheet = makeTestSheet()
    const straight = opaqueBounds(
      drawStackPixels(sheet, { turn: 0, squash: 1, spacing: 1 }).pixels,
      drawStackPixels(sheet, { turn: 0, squash: 1, spacing: 1 }).width,
      drawStackPixels(sheet, { turn: 0, squash: 1, spacing: 1 }).height
    )
    const squashedRes = drawStackPixels(sheet, { turn: 0, squash: 0.75, spacing: 1 })
    const squashed = opaqueBounds(squashedRes.pixels, squashedRes.width, squashedRes.height)
    expect(squashed.height).toBeLessThan(straight.height)

    const turnedRes = drawStackPixels(sheet, { turn: Math.PI / 2, squash: 0.75, spacing: 1 })
    const turned = opaqueBounds(turnedRes.pixels, turnedRes.width, turnedRes.height)
    expect(turned.width).toBe(sheet.height)

    const tallRes = drawStackPixels(sheet, { turn: 0, squash: 0.75, spacing: 2 })
    const tall = opaqueBounds(tallRes.pixels, tallRes.width, tallRes.height)
    expect(tall.height).toBeGreaterThan(squashed.height)

    const flatRes = drawStackPixels(sheet, { turn: 0, squash: 1, spacing: 0 })
    const flat = opaqueBounds(flatRes.pixels, flatRes.width, flatRes.height)
    expect(flat.height).toBe(sheet.height)
    expect(flat.width).toBe(sheet.width)

    // Outline expands silhouette by exactly 1 px on every side without altering interior pixels.
    const raw = drawStackPixels(sheet, { turn: 0.4, squash: 0.75, spacing: 1, outline: false })
    const outlined = drawStackPixels(sheet, { turn: 0.4, squash: 0.75, spacing: 1, outline: true })
    const rb = opaqueBounds(raw.pixels, raw.width, raw.height)
    const ob = opaqueBounds(outlined.pixels, outlined.width, outlined.height)
    expect(ob.width).toBe(rb.width + 2)
    expect(ob.height).toBe(rb.height + 2)
  })

  it('carves a valid horizontal slice sheet from four flat orthographic views', () => {
    const fillRect = (w: number, h: number, rgb: [number, number, number]): FlatViewImage => {
      const data = new Uint8ClampedArray(w * h * 4)
      for (let i = 0; i < w * h; i++) {
        data[i * 4] = rgb[0]
        data[i * 4 + 1] = rgb[1]
        data[i * 4 + 2] = rgb[2]
        data[i * 4 + 3] = 255
      }
      return { width: w, height: h, data }
    }
    const carved = carveFourViews(
      fillRect(6, 10, [40, 120, 230]),
      fillRect(10, 5, [30, 90, 200]),
      fillRect(6, 5, [220, 220, 240]),
      fillRect(6, 5, [180, 40, 40]),
      0.25
    )
    expect(carved.width).toBe(6)
    expect(carved.height).toBe(10)
    expect(carved.count).toBe(5)
    // Top slice takes the top-view color, bottom side edge is shaded darker.
    const topPx = (5 * carved.width * carved.count + 4 * carved.width + 3) * 4
    const botEdge = (5 * carved.width * carved.count + 0 * carved.width + 0) * 4
    expect([carved.pixels[topPx], carved.pixels[topPx + 1], carved.pixels[topPx + 2]]).toEqual([40, 120, 230])
    expect(carved.pixels[botEdge + 2]).toBeLessThan(200)
  })
})
