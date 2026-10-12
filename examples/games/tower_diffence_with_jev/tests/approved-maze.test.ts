import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { approvedMazeSourcePath, APPROVED_MAZE_SOURCE_SIZE } from '../src/game/ApprovedMazeLayout'
import { getField, pathLength, pointOnPath, type FieldId } from '../src/game/model'
import { GameEngine } from '../src/game/GameEngine'
import { freshSave } from '../src/progression/UpgradeSystem'
import { previewGroundPlacement } from '../src/game/GroundPlacement'
import { createFieldArt } from '../src/rendering/WorldArt'
import { attackContact } from '../src/game/CombatContact'
import { advanceEnemyTravel, applyEnemyTravel } from '../src/game/EnemyTravel'
import { fieldScenery } from '../src/game/FieldScenery'
import { buildRoadRoutes, distanceToRoadUnion, nearestRoadEdge } from '../src/game/BattlefieldRoutes'

const idle = { decide: async () => null }
const fields: FieldId[] = ['meadow', 'desert', 'frost', 'volcanic']
const sourceHash = 'a6277807b1dc416815ba588766acda5f55b120c0e566e1a68114838e3abeabe7'

describe('approved irregular maze revision 4', () => {
  it('preserves the exact approved image and validates traced road-to-pixel alignment', async () => {
    const original = await readFile(
      new URL('../../../../public/tower-defense-map/approved-meadow.png', import.meta.url)
    )
    expect(createHash('sha256').update(original).digest('hex')).toBe(sourceHash)
    const { data, info } = await sharp(original).raw().toBuffer({ resolveWithObject: true })
    expect([info.width, info.height]).toEqual([APPROVED_MAZE_SOURCE_SIZE.width, APPROVED_MAZE_SOURCE_SIZE.height])
    const path = approvedMazeSourcePath(),
      length = pathLength(path)
    const failures: { distance: number; x: number; y: number; rgb: number[] }[] = []
    // The first 100 source pixels are inside the purple cave, and the last 45
    // enter the castle. Every exposed-road center is checked every two pixels.
    for (let d = 100; d < length - 45; d += 2) {
      const p = pointOnPath(path, d),
        x = Math.round(p.x),
        y = Math.round(p.y)
      const offset = (y * info.width + x) * info.channels
      const [r, g, b] = [...data.subarray(offset, offset + 3)]
      if (!(r > 180 && g > 140 && b > 80 && b < 195 && r > g + 8 && g > b + 15))
        failures.push({ distance: d, x, y, rgb: [r, g, b] })
    }
    expect(failures).toEqual([])
  })
  it('paints the approved background exactly once, keeps the slow-road label, and omits procedural buildings and scenery', () => {
    const calls: string[] = [],
      source = {} as CanvasImageSource
    const context = new Proxy(
      {},
      {
        get:
          (_, name) =>
          (..._args: unknown[]) => {
            calls.push(String(name))
          }
      }
    )
    const canvas = { width: 0, height: 0, getContext: () => context }
    vi.stubGlobal('document', { createElement: () => canvas })
    try {
      expect(createFieldArt('meadow', false, 2, source, 4)).toBe(canvas)
      expect([canvas.width, canvas.height]).toEqual([1280, 920])
      expect(calls[0]).toBe('drawImage')
      expect(calls.filter((name) => name === 'drawImage')).toHaveLength(1)
      expect(calls).toContain('fillText') // Existing visible slow-surface label.
      expect(calls).not.toContain('createLinearGradient') // No terrain/gate redraw.
      expect(calls.length).toBeLessThan(1000)
    } finally {
      vi.unstubAllGlobals()
    }
  })
  for (const id of fields) {
    it(`${id} has one continuous rounded road, broad grass, and stable route IDs`, () => {
      const board = getField(id, 2, 4)
      expect([board.width, board.height]).toEqual([1280, 920])
      expect(board.entrance.x).toBeLessThan(100)
      expect(board.entrance.y).toBeLessThan(70)
      expect(board.gate.x).toBeGreaterThan(1150)
      expect(board.gate.y).toBeGreaterThan(800)
      expect(board.routes[0].path).toEqual(board.routes[1].path)
      expect(buildRoadRoutes(board.edges, board.routes)).toEqual(board.routes)
      expect(board.routes[0].length).toBeGreaterThan(4500)
      expect(board.routes[0].length).toBeLessThan(4800)
      expect(board.slots.length).toBeGreaterThan(20)
      expect(board.slots.every((slot) => distanceToRoadUnion(board, slot) >= 52)).toBe(true)
      const source = approvedMazeSourcePath()
      expect(board.path).toEqual(source.map(({ x, y }) => ({ x: (x * 1280) / 1478, y: (y * 920) / 1064 })))
      // Direction changes must preserve the approved left basin, central hooks,
      // upper-right excursion, leftward return, and bottom castle approach.
      expect(board.path.some((p) => p.x < 190 && p.y > 540)).toBe(true)
      expect(board.path.some((p) => p.x > 640 && p.x < 680 && p.y < 120)).toBe(true)
      expect(board.path.some((p) => p.x > 1100 && p.y > 380 && p.y < 500)).toBe(true)
    })
    it(`${id} accepts free placements on roads, alongside roads and inside bends, beyond decorative pads`, () => {
      const engine = new GameEngine(idle, freshSave(), id, 42, () => 0, undefined, 2, 4)
      engine.state.phase = 'preparation'
      engine.state.stage = 4
      for (const point of [
        { x: 295, y: 405 },
        { x: 530, y: 575 },
        { x: 920, y: 335 },
        { x: 900, y: 705 }
      ]) {
        expect(previewGroundPlacement(engine.state, 'soldier', point).valid).toBe(true)
        expect(engine.place('soldier', point)).toBe(true)
      }
      const roadPoint = pointOnPath(getField(id, 2, 4).path, 1000)
      engine.state.stage = 5
      expect(previewGroundPlacement(engine.state, 'soldier', roadPoint).valid).toBe(true)
      expect(engine.place('soldier', roadPoint)).toBe(true)
      expect(fieldScenery(id, 2, 4).every((p) => p.x <= 62 || p.x >= 1218 || p.y <= 62 || p.y >= 858)).toBe(true)
    })
  }
  for (const revision of [1, 2, 3, 4] as const) {
    it(`saves and resumes revision ${revision} without relocating defenses or enemies`, () => {
      const save = freshSave(),
        engine = new GameEngine(idle, save, 'meadow', 42, () => 0, undefined, 2, revision)
      engine.state.phase = 'preparation'
      expect(engine.place('soldier', getField('meadow', 2, revision).slots[0])).toBe(true)
      expect(engine.startAssault()).toBe(true)
      expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime', routeId: 'right' })).toBe(true)
      for (let tick = 0; tick < 30; tick++) engine.update(1 / 60)
      const checkpoint = engine.exportCheckpoint()!
      expect(checkpoint.version).toBe(16)
      const restored = GameEngine.fromCheckpoint(checkpoint, idle, save, () => 0)!
      expect(restored).not.toBeNull()
      expect(restored.state.layoutRevision).toBe(revision)
      expect(restored.state.units).toEqual(engine.state.units)
      expect(getField('meadow', 2, restored.state.layoutRevision)).toEqual(getField('meadow', 2, revision))
      if (revision < 4) {
        const legacy = structuredClone(checkpoint) as unknown as { version: number }
        legacy.version = 15
        const old = GameEngine.fromCheckpoint(legacy, idle, save, () => 0)!
        expect(old).not.toBeNull()
        expect(old.state.layoutRevision).toBe(revision)
        expect(old.state.units).toEqual(engine.state.units)
      }
    })
  }
  it('ground enemies follow every hook rather than shortcutting nearby road stretches', () => {
    const save = freshSave(),
      engine = new GameEngine(idle, save, 'meadow', 42, () => 0, undefined, 2, 4)
    engine.state.phase = 'preparation'
    engine.state.stage = 10
    expect(engine.place('soldier', { x: 300, y: 400 })).toBe(true)
    expect(engine.startAssault()).toBe(true)
    expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime', routeId: 'left' })).toBe(true)
    const enemy = engine.state.units.find((unit) => unit.owner === 'ai')!,
      field = getField('meadow', 2, 4)
    const seen = new Set<number>()
    for (let tick = 0; tick < 20000; tick++) {
      const before = enemy.progress
      const travel = advanceEnemyTravel(engine.state, enemy, 1 / 60)
      applyEnemyTravel(engine.state, enemy, travel)
      engine.state.time += 1 / 60
      expect(enemy.progress).toBeGreaterThanOrEqual(before)
      expect(enemy.progress - before).toBeLessThanOrEqual(enemy.speed / 60 + 0.001)
      const p = pointOnPath(field.path, enemy.progress)
      expect(Math.hypot(enemy.x - p.x, enemy.y - p.y)).toBeLessThan(1e-7)
      expect(distanceToRoadUnion(field, enemy)).toBeLessThan(1e-7)
      seen.add(Math.floor(enemy.progress / 100))
      if (travel.progress === before) break
    }
    expect(enemy.progress).toBeGreaterThan(field.routes[0].length - 100)
    expect(attackContact(enemy, field.gate, enemy.attackRange, 'base').inRange).toBe(true)
    expect(seen.size).toBeGreaterThan(44)
  })
  it('a melee defender attacks at a narrow hook and returns to its exact grass home without crossing the road', () => {
    const engine = new GameEngine(idle, freshSave(), 'meadow', 42, () => 0, undefined, 2, 4)
    engine.state.phase = 'preparation'
    const home = { x: 640, y: 365 },
      field = getField('meadow', 2, 4)
    expect(engine.place('soldier', home)).toBe(true)
    expect(engine.startAssault()).toBe(true)
    expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime', routeId: 'left' })).toBe(true)
    const enemy = engine.state.units.find((unit) => unit.owner === 'ai')!,
      soldier = engine.state.units.find((unit) => unit.owner === 'player')!
    enemy.progress = nearestRoadEdge(field, home).progress - 70
    Object.assign(enemy, pointOnPath(field.path, enemy.progress))
    enemy.hp = 1
    let moved = false
    for (let tick = 0; tick < 1800; tick++) {
      engine.update(1 / 60)
      moved ||= Math.hypot(soldier.x - home.x, soldier.y - home.y) > 1
      expect(distanceToRoadUnion(field, soldier)).toBeGreaterThanOrEqual(36 - 1e-6)
    }
    expect(moved).toBe(true)
    expect(enemy.hp).toBeLessThanOrEqual(0)
    expect(Math.hypot(soldier.x - home.x, soldier.y - home.y)).toBeLessThan(0.01)
    expect({ x: soldier.homeX, y: soldier.homeY }).toEqual(home)
  })
  it('rejects revision 4 mislabeled as an old v15 save', () => {
    const save = freshSave(),
      engine = new GameEngine(idle, save, 'meadow', 42, () => 0, undefined, 2, 4)
    engine.state.phase = 'preparation'
    const checkpoint = engine.exportCheckpoint()!
    expect(GameEngine.fromCheckpoint({ ...checkpoint, version: 15 }, idle, save, () => 0)).toBeNull()
  })
})
