import { describe, it, expect } from 'vitest'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { writeFileSync } from 'node:fs'
import * as currentModel from '../../examples/games/tower_diffence_with_jev/src/game/model'
import * as baselineModel from './baseline/src/game/model'
import { GameEngine as CurrentEngine } from '../../examples/games/tower_diffence_with_jev/src/game/GameEngine'
import { GameEngine as BaselineEngine } from './baseline/src/game/GameEngine'
import { RuleBasedAI as CurrentAI } from '../../examples/games/tower_diffence_with_jev/src/ai/AIController'
import { RuleBasedAI as BaselineAI } from './baseline/src/ai/AIController'
import { freshSave as currentSave } from '../../examples/games/tower_diffence_with_jev/src/progression/UpgradeSystem'
import { freshSave as baselineSave } from './baseline/src/progression/UpgradeSystem'
import * as currentForecast from '../../examples/games/tower_diffence_with_jev/src/game/Interception'
import * as baselineForecast from './baseline/src/game/Interception'
import * as currentTank from '../../examples/games/tower_diffence_with_jev/src/game/TankRoadblock'
import * as baselineTank from './baseline/src/game/TankRoadblock'
import * as currentRoutes from '../../examples/games/tower_diffence_with_jev/src/game/BattlefieldRoutes'
import * as baselineRoutes from './baseline/src/game/BattlefieldRoutes'

const implementations = [
  {
    name: 'baseline',
    Engine: BaselineEngine,
    AI: BaselineAI,
    model: baselineModel,
    save: baselineSave,
    forecast: baselineForecast,
    tank: baselineTank,
    routes: baselineRoutes
  },
  {
    name: 'optimized',
    Engine: CurrentEngine,
    AI: CurrentAI,
    model: currentModel,
    save: currentSave,
    forecast: currentForecast,
    tank: currentTank,
    routes: currentRoutes
  }
] as const
const report: Record<string, unknown> = { exactStateTicks: 0, scenarios: [], benchmarks: [] }
const idle = { decide: async () => null }
type Scenario = { field: currentModel.FieldId; version: 1 | 2; revision: 1 | 2 | 3 | 4; paid: boolean }
const flush = async () => {
  for (let turn = 0; turn < 6; turn++) await Promise.resolve()
}
function fixture(impl: (typeof implementations)[number], scenario: Scenario, clock = { now: 0 }, activeAI = true) {
  const save = impl.save()
  Object.assign(save, {
    economyVersion: 2,
    gold: 800,
    purchased: ['mage', 'healer', 'frost', 'ranger', 'cannon', 'paladin']
  })
  const rule = new impl.AI()
  const decisions: unknown[] = []
  const controller = activeAI
    ? {
        decide: async (state: currentModel.GameState) => {
          const result = await rule.decide(state)
          decisions.push(structuredClone({ at: state.time, result }))
          return result
        }
      }
    : idle
  const engine = new impl.Engine(
    controller,
    save,
    scenario.field,
    421337,
    () => clock.now,
    undefined,
    scenario.version,
    scenario.revision
  )
  // Module-local battle IDs are not an optimization input. Fix one ID across
  // fixtures so extra constructors in mutation/benchmark cases cannot skew it.
  engine.state.battleId = 741
  engine.state.stage = 3
  engine.state.phase = 'preparation'
  const field = impl.model.fieldFor(engine.state)
  const types = ['tank', 'soldier', 'runner', 'archer', 'mage'] as const
  for (const type of types) {
    let placed = false
    const candidates = [...field.slots]
    if (scenario.revision === 4)
      candidates.unshift(
        ...[
          { x: 295, y: 405 },
          { x: 530, y: 575 },
          { x: 920, y: 335 },
          { x: 900, y: 705 },
          { x: 640, y: 365 }
        ].map((p, id) => ({ ...p, id: -1000 - id }))
      )
    for (const candidate of candidates)
      if (engine.previewPlacement(type, candidate).valid && engine.place(type, candidate)) {
        placed = true
        break
      }
    assert.ok(placed, `No placement for ${type} on ${JSON.stringify(scenario)}`)
  }
  assert.equal(engine.state.units.filter((unit) => unit.owner === 'player').length, 5)
  // Exercise physical tank obstruction from current position, retaining its
  // valid grass home for the campaign checkpoint.
  const tank = engine.state.units.find((unit) => unit.type === 'tank')!
  const tankProjection = impl.routes.physicalProjectionOnRoute(field, scenario.version === 2 ? 'left' : undefined, tank)
  Object.assign(
    tank,
    impl.model.pointOnPath(
      impl.model.routePathFor(engine.state, scenario.version === 2 ? 'left' : undefined),
      tankProjection.progress
    )
  )
  if (scenario.paid) {
    for (const [kind, progress] of [
      ['spike', tankProjection.progress + 80],
      ['mud', tankProjection.progress + 160]
    ] as const) {
      const point = impl.model.pointOnPath(field.path, Math.max(230, progress))
      const result = engine.placeRoadItem(kind, point)
      assert.ok(result.valid, `Road item ${kind}: ${result.reason}`)
    }
  } else {
    // A real legacy sandbag uses the same preview/place code as the UI.
    let placed = false
    for (let progress = 230; progress < impl.model.pathLength(field.path) - 180; progress += 80) {
      const result = engine.placeSandbag(impl.model.pointOnPath(field.path, progress))
      if (result.valid) {
        placed = true
        break
      }
    }
    assert.ok(placed, 'No sandbag placement')
  }
  assert.ok(engine.startAssault())
  for (let index = 0; index < 5; index++) {
    spawn(impl, engine, index)
    const enemy = engine.state.units.at(-1)!
    const defender = engine.state.units.filter((unit) => unit.owner === 'player')[index]
    const route = scenario.version === 2 ? (index % 2 ? 'right' : 'left') : undefined
    const projection = impl.routes.physicalProjectionOnRoute(field, route, defender)
    enemy.progress = Math.max(0, projection.progress - 80 - index * 20)
    Object.assign(enemy, impl.model.pointOnPath(impl.model.routePathFor(engine.state, route), enemy.progress))
  }
  assert.equal(engine.state.units.filter((unit) => unit.owner === 'ai').length, 5)
  return { engine, save, decisions, impl, clock }
}
function spawn(impl: (typeof implementations)[number], engine: CurrentEngine | BaselineEngine, index: number) {
  engine.state.nextSpawnAt = 0
  engine.state.cooldowns = impl.model.emptyCooldowns()
  const route = engine.state.battlefieldVersion === 2 ? (index % 2 ? 'right' : 'left') : undefined
  const legal = impl.model.getLegalAIActions(engine.state)
  const preferred = ['slime', 'goblin', 'wolf', 'beetle', 'bat'][index % 5]
  const action =
    legal.find(
      (action) =>
        action.type === 'spawn' &&
        !action.boss &&
        action.unitType === preferred &&
        (route === undefined || action.routeId === route)
    ) ??
    legal.find((action) => action.type === 'spawn' && !action.boss && (route === undefined || action.routeId === route))
  assert.ok(action, `No legal spawn ${index}`)
  assert.ok(engine.applyAIAction(action))
}
function same(
  left: ReturnType<typeof fixture>,
  right: ReturnType<typeof fixture>,
  label: string,
  compareRuntime = false
) {
  assert.deepStrictEqual(right.engine.state, left.engine.state, `${label}: full state`)
  assert.deepStrictEqual(right.save, left.save, `${label}: campaign save`)
  assert.deepStrictEqual(right.decisions, left.decisions, `${label}: ordered AI decisions`)
  assert.deepStrictEqual(
    right.engine.takeCombatSounds(),
    left.engine.takeCombatSounds(),
    `${label}: ordered combat sounds`
  )
  if (compareRuntime)
    assert.deepStrictEqual(
      (right.engine as any).interception.snapshot(),
      (left.engine as any).interception.snapshot(),
      `${label}: exact interception runtime`
    )
}
function mutate(f: ReturnType<typeof fixture>, tick: number) {
  const state = f.engine.state
  const enemy = state.units.find((unit) => unit.owner === 'ai' && unit.hp > 0)
  const tank = state.units.find((unit) => unit.owner === 'player' && unit.type === 'tank')!
  if (tick === 60 && enemy) {
    enemy.slowUntil = state.time + 0.85
    enemy.slowFactor = 0.55
  }
  if (tick === 100 && enemy) enemy.attackRange = 25 // Historical/custom short contact geometry.
  if (tick === 140) tank.x += 14
  if (tick === 180 && enemy) enemy.hp = 0
  if (tick === 220 && state.phase === 'assault') spawn(f.impl, f.engine, 5)
  if (tick === 260) tank.hp = 0
}

describe('isolated exact interception differential validation', () => {
  const scenarios: Scenario[] = [
    { field: 'meadow', version: 1, revision: 1, paid: false },
    { field: 'desert', version: 2, revision: 1, paid: false },
    { field: 'frost', version: 2, revision: 2, paid: true },
    { field: 'volcanic', version: 2, revision: 3, paid: true },
    ...(['meadow', 'desert', 'frost', 'volcanic'] as const).map((field) => ({
      field,
      version: 2 as const,
      revision: 4 as const,
      paid: field === 'desert' || field === 'volcanic'
    }))
  ]
  for (const scenario of scenarios)
    it(`matches every tick, forecast, decision and restore: ${JSON.stringify(scenario)}`, async () => {
      const clock = { now: 0 }
      let pair = implementations.map((impl) => fixture(impl, scenario, clock)) as [
        ReturnType<typeof fixture>,
        ReturnType<typeof fixture>
      ]
      same(...pair, 'initial', true)
      const ticks = Number(process.env.DIFFERENTIAL_TICKS || 360)
      const restores = 0
      for (let tick = 0; tick < ticks; tick++) {
        for (const f of pair) mutate(f, tick)
        clock.now += 1000 / 60
        for (const f of pair) f.engine.update(1 / 60)
        await flush()
        same(...pair, `tick ${tick}`, tick % 20 === 0)
        report.exactStateTicks = (report.exactStateTicks as number) + 1
        if (tick % 30 === 0) {
          const leftEnemies = pair[0].engine.state.units.filter((unit) => unit.owner === 'ai' && unit.hp > 0)
          for (const enemy of leftEnemies) {
            const rightEnemy = pair[1].engine.state.units.find((unit) => unit.id === enemy.id)!
            assert.deepStrictEqual(
              pair[1].impl.forecast.forecastEnemy(pair[1].engine.state, rightEnemy),
              pair[0].impl.forecast.forecastEnemy(pair[0].engine.state, enemy),
              `tick ${tick}: enemy ${enemy.id} exact forecast`
            )
          }
        }
      }
      ;(report.scenarios as unknown[]).push({ ...scenario, ticks, restores, decisions: pair[0].decisions.length })
      console.log(
        `EXACT ${JSON.stringify(scenario)}: ${ticks} ticks, ${restores} restores, ${pair[0].decisions.length} ordered AI decisions`
      )
    })

  for (const scenario of scenarios)
    it(`roundtrips valid campaign checkpoint and resumes exact ticks: ${JSON.stringify(scenario)}`, async () => {
      const clock = { now: 0 }
      let pair = implementations.map((impl) => {
        const save = impl.save()
        const engine = new impl.Engine(
          idle,
          save,
          scenario.field,
          42,
          () => clock.now,
          undefined,
          scenario.version,
          scenario.revision
        )
        engine.state.battleId = 843
        const field = impl.model.fieldFor(engine.state)
        assert.ok(engine.place('soldier', field.slots[0]))
        assert.ok(engine.startAssault())
        spawn(impl, engine, 0)
        return { engine, save, decisions: [], impl, clock }
      }) as [ReturnType<typeof fixture>, ReturnType<typeof fixture>]
      for (let tick = 0; tick < 60; tick++) {
        clock.now += 1000 / 60
        for (const f of pair) f.engine.update(1 / 60)
        await flush()
        same(...pair, `before save ${tick}`, tick % 20 === 0)
      }
      const checkpoints = pair.map((f) => f.engine.exportCheckpoint())
      assert.ok(checkpoints[0], 'Baseline campaign checkpoint is valid')
      assert.ok(checkpoints[1], 'Optimized campaign checkpoint is valid')
      assert.deepStrictEqual(checkpoints[1], checkpoints[0], 'Full campaign checkpoint including cached forecasts')
      pair = pair.map((f, index) => {
        const restored = f.impl.Engine.fromCheckpoint(checkpoints[index], idle, f.save, () => clock.now)
        assert.ok(restored, 'Restored engine')
        return { ...f, engine: restored }
      }) as typeof pair
      same(...pair, 'after campaign restore', true)
      for (let tick = 0; tick < 120; tick++) {
        clock.now += 1000 / 60
        for (const f of pair) f.engine.update(1 / 60)
        await flush()
        same(...pair, `after restore ${tick}`, tick % 20 === 0)
      }
      assert.deepStrictEqual(
        pair[1].engine.exportCheckpoint(),
        pair[0].engine.exportCheckpoint(),
        'After resumed simulation full checkpoint'
      )
      ;(report.scenarios as unknown[]).push({ ...scenario, campaignRestore: true, exactTicks: 180, restores: 2 })
      report.exactStateTicks = (report.exactStateTicks as number) + 180
      console.log(`EXACT checkpoint ${JSON.stringify(scenario)}: 180 ticks, 2 restores`)
    })

  it('invalidates mutable unit, map, layout and road inputs without exposing mutable cached results', () => {
    const scenario: Scenario = { field: 'meadow', version: 2, revision: 4, paid: false }
    const pair = implementations.map((impl) => fixture(impl, scenario, { now: 0 }, false))
    const compare = (label: string) => {
      assert.deepStrictEqual(
        pair[1].impl.tank.tankRestraints(pair[1].engine.state),
        pair[0].impl.tank.tankRestraints(pair[0].engine.state),
        `${label}: restraints`
      )
      for (const enemy of pair[0].engine.state.units.filter((unit) => unit.owner === 'ai')) {
        const right = pair[1].engine.state.units.find((unit) => unit.id === enemy.id)!
        assert.deepStrictEqual(
          pair[1].impl.tank.nextTankRoadblock(pair[1].engine.state, right),
          pair[0].impl.tank.nextTankRoadblock(pair[0].engine.state, enemy),
          `${label}: next block`
        )
      }
    }
    compare('original')
    pair[1].impl.tank.tankRestraints(pair[1].engine.state).set(-77, -88)
    pair[1].impl.tank.tankRestraints(pair[1].engine.state).clear()
    compare('caller modified returned map')
    // The restraint cache also observes numeric edits to the map's existing
    // route arrays, not only replacement of a field/layout identity.
    const livePaths = pair.map((f) => f.impl.model.routePathFor(f.engine.state, 'left'))
    const originals = livePaths.map((path) => path.map((point) => ({ ...point })))
    try {
      livePaths.forEach((path) => {
        path[1].x += 0.125
      })
      compare('in-place route coordinate edit')
      livePaths.forEach((path) => {
        path[2] = { x: path[2].x + 0.25, y: path[2].y }
      })
      compare('in-place route point replacement')
      livePaths.forEach((path) => {
        path.push({ ...path.at(-1)! })
      })
      compare('in-place route length change')
    } finally {
      livePaths.forEach((path, index) => path.splice(0, path.length, ...originals[index]))
    }
    compare('restored route coordinates')
    const mutations: ((state: currentModel.GameState) => void)[] = [
      (state) => {
        state.units[0].x += 20
      },
      (state) => {
        state.units[0].y += 7
      },
      (state) => {
        state.units.at(-1)!.progress += 90
      },
      (state) => {
        state.units.at(-1)!.attackRange = 20
      },
      (state) => {
        state.units.at(-1)!.routeId = 'right'
      },
      (state) => {
        state.units[0].hp = 0
      },
      (state) => {
        state.units[0].hp = state.units[0].maxHp
      },
      (state) => {
        state.units.at(-1)!.type = 'bat'
      },
      (state) => {
        state.units.at(-1)!.owner = 'player'
      },
      (state) => {
        state.units.at(-1)!.owner = 'ai'
      },
      (state) => {
        state.units.at(-1)!.id += 123
      },
      (state) => {
        state.units.reverse()
      },
      (state) => {
        state.units.pop()
      },
      (state) => {
        state.units = state.units.map((unit) => ({ ...unit }))
      },
      (state) => {
        state.layoutRevision = 3
      },
      (state) => {
        state.fieldId = 'desert'
      },
      (state) => {
        state.battlefieldVersion = 1
        state.layoutRevision = 1
        for (const unit of state.units) delete unit.routeId
      }
    ]
    mutations.forEach((change, index) => {
      pair.forEach((f) => change(f.engine.state))
      compare(`mutation ${index}`)
    })
    // Custom path is shared only as raw numeric input, never as a cache key across
    // the isolated modules. Test bends, zero lengths, push/pop and point replacement.
    const paths = pair.map(() => [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ])
    const tankState = pair.map((f) => ({
      ...f.engine.state,
      units: [
        {
          ...f.engine.state.units.find((unit) => unit.type === 'tank')!,
          owner: 'player' as const,
          hp: 100,
          x: 80,
          y: 25
        }
      ]
    }))
    const pathCompare = () =>
      assert.deepStrictEqual(
        pair[1].impl.tank.tankRoadblocksOnPath(tankState[1], paths[1]),
        pair[0].impl.tank.tankRoadblocksOnPath(tankState[0], paths[0])
      )
    pathCompare()
    for (const mutatePath of [
      (path: currentModel.Point[]) => {
        path[1].x += 4
      },
      (path: currentModel.Point[]) => {
        path.push({ x: 20, y: 20 })
      },
      (path: currentModel.Point[]) => {
        path[2] = { x: 80, y: 10 }
      },
      (path: currentModel.Point[]) => {
        path.pop()
      },
      (path: currentModel.Point[]) => {
        path.splice(1, 1)
      }
    ]) {
      paths.forEach(mutatePath)
      pathCompare()
    }
  })

  it('benchmarks direct forecasts and seeded stage3 five-vs-five battle with operation counters', async () => {
    const scenario: Scenario = { field: 'meadow', version: 2, revision: 4, paid: false }
    const stats: unknown[] = []
    const originalHypot = Math.hypot
    function measured(name: string, impl: string, work: () => void) {
      let hypot = 0
      Math.hypot = (...values: number[]) => {
        hypot++
        return originalHypot(...values)
      }
      const start = performance.now()
      try {
        work()
      } finally {
        Math.hypot = originalHypot
      }
      const elapsedMs = performance.now() - start
      const result = { name, implementation: impl, hypot, elapsedMs }
      stats.push(result)
      console.log(`BENCHMARK ${JSON.stringify(result)}`)
      return result
    }
    // Warmed repeated exact forecasts of five enemies on the 299-point narrow
    // map. The operation count is independent of JIT/timer noise.
    for (const impl of implementations) {
      const f = fixture(impl, scenario, { now: 0 }, false)
      const enemies = f.engine.state.units.filter((unit) => unit.owner === 'ai')
      const pathPoints = impl.model.fieldFor(f.engine.state).path.length
      for (const enemy of enemies) impl.forecast.forecastEnemy(f.engine.state, enemy)
      measured(`10x five-enemy forecasts (${pathPoints} road points)`, impl.name, () => {
        for (let repeat = 0; repeat < 10; repeat++)
          for (const enemy of enemies) impl.forecast.forecastEnemy(f.engine.state, enemy)
      })
    }
    for (const impl of implementations) {
      const f = fixture(impl, scenario, { now: 0 }, false)
      // Seeded real GameEngine loop at unchanged CONFIG.step. Fresh independent
      // battle each repetition, fixed 5 allies and 5 enemies at the start.
      measured('3x stage3 seeded five-vs-five battle, 180 ticks each', impl.name, () => {
        for (let repeat = 0; repeat < 3; repeat++) {
          const battle = repeat === 0 ? f : fixture(impl, scenario, { now: 0 }, false)
          for (let tick = 0; tick < 180; tick++) battle.engine.update(impl.model.CONFIG.step)
        }
      })
    }
    // Timing without the counting shim is a separate warm measurement.
    for (const impl of implementations) {
      const f = fixture(impl, scenario, { now: 0 }, false)
      const enemies = f.engine.state.units.filter((unit) => unit.owner === 'ai')
      for (const enemy of enemies) impl.forecast.forecastEnemy(f.engine.state, enemy)
      const times: number[] = []
      for (let sample = 0; sample < 3; sample++) {
        const start = performance.now()
        for (let repeat = 0; repeat < 10; repeat++)
          for (const enemy of enemies) impl.forecast.forecastEnemy(f.engine.state, enemy)
        times.push(performance.now() - start)
      }
      times.sort((a, b) => a - b)
      const result = {
        name: '10x five-enemy forecasts without counter',
        implementation: impl.name,
        medianMs: times[1],
        samplesMs: times
      }
      stats.push(result)
      console.log(`BENCHMARK ${JSON.stringify(result)}`)
    }
    report.benchmarks = stats
    writeFileSync('.build/interception-validation/report.json', JSON.stringify(report, null, 2))
    expect(stats).toHaveLength(6)
    await flush()
  })
})
