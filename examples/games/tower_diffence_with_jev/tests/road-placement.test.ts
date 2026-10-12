import { describe, expect, it } from 'vitest'
import { GameEngine } from '../src/game/GameEngine'
import { previewGroundPlacement, groundPlacementLabel } from '../src/game/GroundPlacement'
import { clearInterceptionStep, forecastEnemy } from '../src/game/Interception'
import { fieldScenery } from '../src/game/FieldScenery'
import { getField, pointOnPath, type FieldId } from '../src/game/model'
import { freshSave } from '../src/progression/UpgradeSystem'
import { nextTankRoadblock } from '../src/game/TankRoadblock'
import { advanceEnemyTravel } from '../src/game/EnemyTravel'

const idle = { decide: async () => null }
function setup(field: FieldId = 'meadow') {
  const save = freshSave(),
    engine = new GameEngine(idle, save, field, 42, () => 0, undefined, 2, 4)
  engine.state.phase = 'preparation'
  return { save, engine }
}
// Straight, narrow inner hook, near entrance outside its exclusion, near castle outside its exclusion.
const roadPoints = [
  { x: 300, y: (128 * 920) / 1064 },
  { x: (802 * 1280) / 1478, y: (653 * 920) / 1064 },
  { x: 170, y: (128 * 920) / 1064 },
  { x: 1000, y: (879 * 920) / 1064 }
]
describe('road defender placement regression', () => {
  for (const field of ['meadow', 'desert', 'frost', 'volcanic'] as const) {
    for (const [index, point] of roadPoints.entries()) {
      it(`${field} permits road site ${index} in UI preview, engine and checkpoint continuation`, () => {
        const { engine, save } = setup(field)
        const preview = previewGroundPlacement(engine.state, 'soldier', point)
        expect(preview.valid).toBe(true)
        expect(groundPlacementLabel(preview)).toBe('ここに配置できます。')
        expect(engine.previewPlacement('soldier', point).valid).toBe(true)
        expect(engine.place('soldier', point)).toBe(true)
        const checkpoint = engine.exportCheckpoint()!
        expect(checkpoint.version).toBe(16)
        const restored = GameEngine.fromCheckpoint(checkpoint, idle, save, () => 0)!
        expect(restored).not.toBeNull()
        expect(restored.state.units).toEqual(engine.state.units)
        expect(restored.state.units[0]).toMatchObject({ homeX: point.x, homeY: point.y, x: point.x, y: point.y })
        expect(restored.startAssault()).toBe(true)
        expect(GameEngine.fromCheckpoint(restored.exportCheckpoint(), idle, save, () => 0)).not.toBeNull()
      })
    }
  }
  it('retains grass deployment and rejects field edges, entrance, gate, scenery and other defenders', () => {
    const { engine, save } = setup(),
      field = getField('meadow', 2, 4)
    expect(engine.place('soldier', { x: 295, y: 405 })).toBe(true)
    for (const [point, reason] of [
      [{ x: 47, y: 300 }, 'outside'],
      [field.path[0], 'outside'],
      [field.gate, 'base'],
      [{ x: 295, y: 405 }, 'overlap']
    ] as const) {
      expect(previewGroundPlacement(engine.state, 'soldier', point).reason).toBe(reason)
      expect(engine.place('soldier', point)).toBe(false)
    }
    expect(previewGroundPlacement(engine.state, 'soldier', { x: field.path[0].x, y: 94 }).reason).toBe('entry')
    // Revision 4 intentionally has no generated scenery; legacy obstacles stay protected.
    const legacy = new GameEngine(idle, freshSave(), 'meadow', 42, () => 0, undefined, 2, 3)
    legacy.state.phase = 'preparation'
    const scenery = fieldScenery('meadow', 2, 3).find(
      (p) => p.kind !== 'sprig' && p.x >= 48 && p.x <= 1232 && p.y >= 94 && p.y <= 902
    )!
    expect(previewGroundPlacement(legacy.state, 'soldier', scenery).reason).toBe('obstacle')
    const invalid = structuredClone(engine.exportCheckpoint()!)
    invalid.state.units[0].homeX = 1
    expect(GameEngine.fromCheckpoint(invalid, idle, save, () => 0)).toBeNull()
  })
  it('still rejects a road defender overlapping an existing sandbag', () => {
    const { engine } = setup(),
      home = pointOnPath(getField('meadow', 2, 4).path, 1000)
    expect(engine.placeSandbag(home).valid).toBe(true)
    expect(previewGroundPlacement(engine.state, 'soldier', home).reason).toBe('sandbag')
    expect(engine.place('soldier', home)).toBe(false)
  })
  it('moves between grass and road, walks a road battle relocation, and saves the exact road home', () => {
    const { engine, save } = setup(),
      road = roadPoints[0],
      grass = { x: 295, y: 405 }
    expect(engine.place('soldier', grass)).toBe(true)
    const unit = engine.state.units[0]
    expect(engine.moveDefender(unit.id, road)).toBe(true)
    expect(engine.moveDefender(unit.id, { x: road.x + 60, y: road.y })).toBe(true)
    expect(engine.startAssault()).toBe(true)
    const destination = { x: road.x + 90, y: road.y }
    expect(clearInterceptionStep(engine.state, unit, destination)).toBe(true)
    expect(engine.previewBattleRelocation(unit.id, destination).valid).toBe(true)
    expect(engine.relocateDefender(unit.id, destination)).toBe(true)
    expect(GameEngine.fromCheckpoint(engine.exportCheckpoint(), idle, save, () => 0)).not.toBeNull()
    for (let tick = 0; tick < 120; tick++) engine.update(1 / 60)
    expect(unit.x).toBeCloseTo(destination.x, 5)
    expect(unit.y).toBeCloseTo(destination.y, 5)
    expect(unit.homeX).toBe(destination.x)
    expect(GameEngine.fromCheckpoint(engine.exportCheckpoint(), idle, save, () => 0)).not.toBeNull()
  })
  it('an actually placed shield on the road stops ground travel and its forecast at the same contact', () => {
    const { engine } = setup(),
      field = getField('meadow', 2, 4),
      home = pointOnPath(field.path, 350)
    expect(engine.place('tank', home)).toBe(true)
    expect(engine.startAssault()).toBe(true)
    expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime', routeId: 'left' })).toBe(true)
    const enemy = engine.state.units.find((unit) => unit.owner === 'ai')!,
      block = nextTankRoadblock(engine.state, enemy)!
    expect(block).toBeDefined()
    const travel = advanceEnemyTravel(engine.state, enemy, 20)
    expect(travel.progress).toBeCloseTo(block.stopProgress, 5)
    const forecast = forecastEnemy(engine.state, enemy)
    expect(forecast.length).toBeGreaterThan(1)
    expect(Math.max(...forecast.map((sample) => sample.progress))).toBeLessThanOrEqual(block.stopProgress + 1e-6)
  })
})
