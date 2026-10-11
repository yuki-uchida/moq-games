import { describe, expect, it } from 'vitest'
import { getField, DEFINITIONS, type FieldId } from '../src/game/model'
import { GameEngine } from '../src/game/GameEngine'
import { freshSave } from '../src/progression/UpgradeSystem'
import { buildRoadRoutes, distanceToRoadUnion } from '../src/game/BattlefieldRoutes'

const fields: FieldId[] = ['meadow', 'desert', 'frost', 'volcanic']
const idle = { decide: async () => null }
describe('compact revision 3', () => {
  for (const id of fields) {
    it(`${id} fits a landscape board with a long, unambiguous road and placement space`, () => {
      const board = getField(id, 2, 3)
      expect([board.width, board.height]).toEqual([1280, 920])
      expect(board.entrance).toEqual({ x: 80, y: 140 })
      expect(board.gate).toEqual({ x: 1190, y: 790 })
      expect(board.routes.every((route) => route.length > 5500)).toBe(true)
      expect(buildRoadRoutes(board.edges, board.routes)).toEqual(board.routes)
      expect(board.routes[0].path).toEqual(board.routes[1].path)
      for (const point of board.path) {
        expect(point.x).toBeGreaterThanOrEqual(50)
        expect(point.x).toBeLessThanOrEqual(board.width - 50)
        expect(point.y).toBeGreaterThanOrEqual(50)
        expect(point.y).toBeLessThanOrEqual(board.height - 100)
      }
      expect(board.slots.length).toBeGreaterThan(20)
      expect(board.slots.every((slot) => distanceToRoadUnion(board, slot) >= 52)).toBe(true)
      // 150-world-unit rows leave visible terrain between the 84-unit road shoulders.
      expect(board.path[2].y - board.path[1].y).toBe(150)
      expect(board.routes[0].length / DEFINITIONS.slime.speed).toBeGreaterThan(80)
    })
  }
  for (const revision of [1, 2, 3] as const) {
    it(`round-trips revision ${revision} without changing its geometry or saved deployment`, () => {
      const save = freshSave()
      const engine = new GameEngine(idle, save, 'meadow', 42, () => 0, undefined, 2, revision)
      engine.state.phase = 'preparation'
      expect(engine.place('soldier', getField('meadow', 2, revision).slots[0])).toBe(true)
      expect(engine.startAssault()).toBe(true)
      expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime', routeId: 'left' })).toBe(true)
      for (let tick = 0; tick < 30; tick++) engine.update(1 / 60)
      const checkpoint = engine.exportCheckpoint()
      expect(checkpoint).not.toBeNull()
      const restored = GameEngine.fromCheckpoint(checkpoint!, idle, save, () => 0)
      expect(restored).not.toBeNull()
      expect(restored!.state.layoutRevision).toBe(revision)
      expect(restored!.state.units).toEqual(engine.state.units)
      expect(getField(restored!.state.fieldId, 2, restored!.state.layoutRevision)).toEqual(
        getField('meadow', 2, revision)
      )
    })
  }
})

it('records comparable route distances and base-speed travel estimates', () => {
  for (const id of fields) {
    const old = getField(id, 2, 2),
      current = getField(id, 2, 3)
    console.info(
      id,
      JSON.stringify({
        oldLengths: old.routes.map((route) => Math.round(route.length)),
        newLength: current.routes[0].length,
        oldSlimeSeconds: old.routes.map((route) => +(route.length / DEFINITIONS.slime.speed).toFixed(1)),
        newSlimeSeconds: +(current.routes[0].length / DEFINITIONS.slime.speed).toFixed(1)
      })
    )
  }
})
