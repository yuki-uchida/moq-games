import { describe, expect, it, vi } from 'vitest'
import { GameEngine } from '../src/game/GameEngine'
import { forecastEnemy } from '../src/game/Interception'
import { RoadGeometrySnapshot } from '../src/game/RoadGeometryCache'
import type { ForecastQueryContext } from '../src/game/ForecastQueryContext'
import { advanceEnemyTravel, nextRoadObstruction, routeSandbags } from '../src/game/EnemyTravel'
import { goblinPursuitTarget } from '../src/game/GoblinTarget'
import { tankRestraints, nextTankRoadblock } from '../src/game/TankRoadblock'
import {
  fieldFor,
  getField,
  pointOnPath,
  routePathFor,
  serializeStateForAI,
  stageRules,
  isAirborneEnemy,
  isEnemyMelee,
  type EnemyType,
  type GameState
} from '../src/game/model'
import { freshSave } from '../src/progression/UpgradeSystem'

const additions = ['crystalSentinel', 'koboldLancer', 'clockworkPatchling'] as const
const idle = { decide: async () => null }
function setup(type: EnemyType) {
  const save = freshSave()
  save.highestStage = 3
  const engine = new GameEngine(idle, save, 'meadow', 42, () => 0, undefined, 2, 4)
  engine.state.stage = engine.state.stageSummary.stage = 4
  engine.state.previousStageSummary = {
    ...engine.state.stageSummary,
    stage: 3,
    spawned: stageRules(3).enemyCount,
    resolved: stageRules(3).enemyCount
  }
  ;(engine as unknown as { history: { reset: (state: GameState) => void } }).history.reset(engine.state)
  expect(engine.place('tank', getField('meadow', 2, 4).slots.at(-1)!)).toBe(true)
  expect(engine.startAssault()).toBe(true)
  expect(engine.applyAIAction({ type: 'spawn', unitType: type, routeId: 'left' })).toBe(true)
  const enemy = engine.state.units.find((unit) => unit.type === type)!
  return { engine, enemy, save }
}
function capture(state: GameState): ForecastQueryContext {
  const field = fieldFor(state)
  return {
    roads: new RoadGeometrySnapshot([
      field.path,
      ...field.routes.map((route) => route.path),
      ...field.edges.map((edge) => edge.points)
    ]),
    restraints: { units: state.units, field, assignments: tankRestraints(state) }
  }
}
function checkFreshReads(engine: GameEngine, enemy: GameState['units'][number]) {
  const state = engine.state,
    before = structuredClone(state),
    query = capture(state)
  expect(routeSandbags(state, enemy, query)).toEqual(routeSandbags(state, enemy))
  expect(nextTankRoadblock(state, enemy, query)).toEqual(nextTankRoadblock(state, enemy))
  expect(nextRoadObstruction(state, enemy, query)).toEqual(nextRoadObstruction(state, enemy))
  expect(advanceEnemyTravel(state, enemy, 1 / 30, state.time, undefined, query)).toEqual(
    advanceEnemyTravel(state, enemy, 1 / 30, state.time)
  )
  const forecast = forecastEnemy(state, enemy),
    observation = serializeStateForAI(state)
  // Disable only captured road revisions: each query independently validates its path.
  const independent = vi.spyOn(RoadGeometrySnapshot.prototype, 'revisionFor').mockReturnValue(undefined)
  try {
    expect(forecastEnemy(state, enemy)).toEqual(forecast)
    expect(serializeStateForAI(state)).toEqual(observation)
  } finally {
    independent.mockRestore()
  }
  expect(state).toEqual(before)
  return forecast
}

describe('new grounded enemies with call-local forecast snapshots', () => {
  for (const type of additions)
    it(`${type}: exact living low HP survives observation and v17 restore`, () => {
      const { engine, enemy, save } = setup(type)
      const tank = engine.state.units.find((unit) => unit.type === 'tank')!
      tank.hp = 0.000001
      enemy.hp = 0.4
      const observation = serializeStateForAI(engine.state)
      expect(observation.defenders.find((unit) => unit.id === tank.id)?.hp).toBe(tank.hp)
      for (const target of observation.battlefield?.flightTargets ?? [])
        expect(observation.defenders.find((unit) => unit.id === target.id)?.hp).toBe(target.hp)
      const checkpoint = engine.exportCheckpoint()
      const restored = GameEngine.fromCheckpoint(checkpoint, idle, save, () => 0)!
      expect(restored.state.units.find((unit) => unit.id === tank.id)?.hp).toBe(tank.hp)
      expect(restored.state.units.find((unit) => unit.id === enemy.id)?.hp).toBe(enemy.hp)
      expect(checkFreshReads(restored, restored.state.units.find((unit) => unit.id === enemy.id)!)).toEqual(
        checkFreshReads(engine, enemy)
      )
    })

  for (const type of additions)
    it(`${type}: independent reads remain equal after damage, movement and steps`, () => {
      const { engine, enemy } = setup(type)
      const tank = engine.state.units.find((unit) => unit.type === 'tank')!
      Object.assign(tank, pointOnPath(routePathFor(engine.state, enemy.routeId), 160))
      checkFreshReads(engine, enemy)
      enemy.hp -= 20
      if (type === 'clockworkPatchling') enemy.lastDamagedAt = engine.state.time
      checkFreshReads(engine, enemy)
      enemy.progress = 90
      Object.assign(enemy, pointOnPath(routePathFor(engine.state, enemy.routeId), enemy.progress))
      const moved = checkFreshReads(engine, enemy)
      expect(moved[0].progress).toBe(90)
      tank.hp = 0
      expect(nextTankRoadblock(engine.state, enemy, capture(engine.state))).toBeUndefined()
      checkFreshReads(engine, enemy)
      for (let tick = 0; tick < 6; tick++) {
        engine.update(1 / 60)
        checkFreshReads(engine, enemy)
      }
    })

  it('kobold remains grounded regular melee while goblin alone pursues a ranged ally', () => {
    const { engine, enemy } = setup('koboldLancer')
    const ally = engine.state.units.find((unit) => unit.owner === 'player')!
    ally.type = 'archer'
    Object.assign(ally, { x: enemy.x + 100, y: enemy.y + 60 })
    const query = capture(engine.state)
    expect(isEnemyMelee(enemy.type)).toBe(true)
    expect(isAirborneEnemy(enemy.type)).toBe(false)
    expect(enemy.flight).toBeUndefined()
    expect(goblinPursuitTarget(engine.state, enemy, query)).toBeUndefined()
    expect(goblinPursuitTarget(engine.state, { ...enemy, type: 'goblin' }, query)?.id).toBe(ally.id)
    const travel = advanceEnemyTravel(engine.state, enemy, 1 / 30, engine.state.time, undefined, query)
    expect({ x: travel.x, y: travel.y }).toEqual(
      pointOnPath(routePathFor(engine.state, enemy.routeId), travel.progress)
    )
    expect(travel.flight).toBeUndefined()
  })

  it('v17 resume stays deterministic through quiet regen with asymmetric forecast reads', () => {
    const { engine, enemy, save } = setup('clockworkPatchling')
    for (let tick = 0; tick < 30; tick++) engine.update(1 / 60)
    enemy.hp -= 20
    enemy.lastDamagedAt = engine.state.time
    checkFreshReads(engine, enemy)
    const checkpoint = engine.exportCheckpoint()!
    expect(checkpoint.version).toBe(18)
    const restored = GameEngine.fromCheckpoint(JSON.parse(JSON.stringify(checkpoint)), idle, save, () => 0)!
    expect(restored).not.toBeNull()
    const resumed = restored.state.units.find((unit) => unit.id === enemy.id)!
    const damagedHp = enemy.hp
    for (let tick = 0; tick < 180; tick++) {
      // Extra reads on only one engine expose accidental retained forecast state.
      if (tick % 13 === 0) checkFreshReads(engine, enemy)
      engine.update(1 / 60)
      restored.update(1 / 60)
      expect(restored.state.units).toEqual(engine.state.units)
      if (tick < 119) expect(enemy.hp).toBe(damagedHp)
    }
    expect(enemy.hp).toBeGreaterThan(damagedHp)
    expect(resumed.lastDamagedAt).toBe(enemy.lastDamagedAt)
    expect(checkFreshReads(restored, resumed)).toEqual(checkFreshReads(engine, enemy))
    expect(restored.exportCheckpoint()).toEqual(engine.exportCheckpoint())
  })
})
