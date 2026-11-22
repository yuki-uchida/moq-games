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
