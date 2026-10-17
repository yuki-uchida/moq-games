import { describe, it, expect, vi } from 'vitest'
import { GameEngine } from '../src/game/GameEngine'
import { BASE_WALL_FOOTPRINT } from '../src/game/CombatContact'
import {
  ALLY_TYPES,
  ENEMY_TYPES,
  CONFIG,
  DEFINITIONS,
  FIELDS,
  stageRules,
  getLegalAIActions,
  serializeStateForAI,
  pathLength,
  pointOnPath,
  distanceToPath,
  type FieldId,
  type AIAction,
  type AIResult,
  type AIDecision
} from '../src/game/model'
import { SeededRandom, selectDirectorAction } from '../src/game/Director'
import { freshSave, availableAllies, purchase, upgrade, loadSave } from '../src/progression/UpgradeSystem'
const idle = { decide: async () => null }
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}
function campaign(stage = 1, field: FieldId = 'meadow') {
  const save = freshSave(),
    engine = new GameEngine(idle, save, field, 42, () => 0)
  engine.state.stage = stage
  engine.place('soldier', FIELDS[field].slots[0].id)
  return { engine, save }
}
function advance(engine: GameEngine, seconds: number) {
  for (let i = 0; i < seconds * 60; i++) engine.update(1 / 60)
}
function spawn(engine: GameEngine) {
  expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime' })).toBe(true)
  return engine.state.units.at(-1)!
}
function finishWave(engine: GameEngine) {
  const count = stageRules(engine.state.stage).enemyCount
  engine.state.enemiesSpawned = count
  engine.state.enemiesResolved = count
  engine.update(1 / 60)
}
describe('campaign deployment and persistence', () => {
  it('starts with four available allies and one off-road defender, without ticking preparation', () => {
    // Arrange
    const { engine, save } = campaign(),
      s = engine.state,
      slots = FIELDS[s.fieldId].slots
    // Act
    const extra = engine.place('archer', slots[1].id),
      replacement = engine.place('tank', slots[0].id)
    advance(engine, 20)
    // Assert
    expect(availableAllies(save, 1)).toEqual(['soldier', 'archer', 'runner', 'tank'])
    expect(extra).toBe(false)
    expect(replacement).toBe(true)
    expect(s.time).toBe(0)
    expect(s.units).toHaveLength(1)
    expect(distanceToPath(FIELDS[s.fieldId].path, s.units[0])).toBeGreaterThan(CONFIG.roadWidth / 2)
    expect(getLegalAIActions(s)).toEqual([])
  })
  it('permits replacement and removal only in preparation', () => {
    // Arrange
    const { engine } = campaign(),
      slot = FIELDS.meadow.slots[0]
    // Act / Assert
    expect(engine.place('archer', slot.id)).toBe(true)
    expect(engine.state.units).toHaveLength(1)
    engine.remove(slot.id)
    expect(engine.startAssault()).toBe(false)
    engine.place('soldier', slot.id)
    expect(engine.startAssault()).toBe(true)
    expect(engine.place('archer', slot.id)).toBe(false)
    engine.remove(slot.id)
    expect(engine.state.units).toHaveLength(1)
  })
  it('revives persisted fallen defenders and grants one additional place each stage', () => {
    // Arrange
    const { engine, save } = campaign(),
      defender = engine.state.units[0]
    engine.startAssault()
    defender.hp = 0
    // Act
    finishWave(engine)
    const reward = save.gold
    engine.update(1)
    engine.nextStage()
    // Assert
    expect(save.gold).toBe(reward)
    expect(reward).toBe(stageRules(1).reward)
    expect(engine.state.units).toHaveLength(1)
    expect(defender.hp).toBe(defender.maxHp)
    expect(engine.state.stage).toBe(2)
    expect(engine.place('runner', FIELDS.meadow.slots[1].id)).toBe(true)
    expect(engine.place('archer', FIELDS.meadow.slots[2].id)).toBe(false)
  })
  it('finishes exactly ten stages with a ten-defender cap and no eleventh stage', () => {
    // Arrange
    const { engine, save } = campaign()
    // Act
    for (let stage = 1; stage <= 10; stage++) {
      if (stage > 1) expect(engine.place('archer', FIELDS.meadow.slots[stage - 1].id)).toBe(true)
      expect(engine.startAssault()).toBe(true)
      finishWave(engine)
      if (stage < 10) expect(engine.nextStage()).toBe(true)
    }
    // Assert
    expect(engine.state.phase).toBe('victory')
    expect(engine.state.stage).toBe(10)
    expect(engine.state.units).toHaveLength(10)
    expect(engine.nextStage()).toBe(false)
    expect(save.highestStage).toBe(10)
    expect(save.gold).toBe(Array.from({ length: 10 }, (_, i) => stageRules(i + 1).reward).reduce((a, b) => a + b, 0))
  })
})
describe('road movement and combat', () => {
  it('approaches then stops its route while counterattacking nearby defenders', () => {
    // Arrange
    const { engine } = campaign()
    engine.startAssault()
    const enemy = spawn(engine),
      defender = engine.state.units[0]
    enemy.progress = 180
    defender.y = defender.homeY = 196
    // Act
    engine.update(1 / 60)
    // Assert
    expect(enemy.progress).toBeGreaterThan(180)
    expect(enemy.moving).toBe(false)
    expect(defender.hp).toBe(defender.maxHp)
    const anchored = enemy.progress
    advance(engine, 0.45)
    expect(enemy.progress).toBe(anchored)
    expect(defender.hp).toBeLessThan(defender.maxHp)
    expect(distanceToPath(FIELDS.meadow.path, enemy)).toBeCloseTo(0)
    expect(enemy.attackSequence).toBeGreaterThan(0)
  })
  it('pursues within a leash, stays off road and returns home after the enemy leaves', () => {
    // Arrange
    const { engine } = campaign()
    engine.startAssault()
    const enemy = spawn(engine),
      defender = engine.state.units[0],
      field = FIELDS.meadow
    enemy.progress = Array.from({ length: Math.floor(pathLength(field.path)) }, (_, i) => i).find((i) => {
      const p = pointOnPath(field.path, i),
        d = Math.hypot(p.x - defender.x, p.y - defender.y)
      return d > 118 && d < 119
    })!
    enemy.speed = 0
    enemy.attack = 0
    enemy.hp = enemy.maxHp = 1e6
    // Act
    advance(engine, 1)
    const excursion = Math.hypot(defender.x - defender.homeX, defender.y - defender.homeY)
    enemy.progress = pathLength(field.path) / 2
    advance(engine, 3)
    // Assert
    expect(excursion).toBeGreaterThan(0)
    expect(excursion).toBeLessThanOrEqual(DEFINITIONS.soldier.leash + 1e-8)
    expect(distanceToPath(field.path, defender)).toBeGreaterThanOrEqual(CONFIG.roadWidth / 2 + 12)
    expect(defender.x).toBeCloseTo(defender.homeX)
    expect(defender.y).toBeCloseTo(defender.homeY)
  })
  it('does not exceed the leash with repeated target changes or oversized frame gaps', () => {
    // Arrange
    const { engine } = campaign()
    engine.startAssault()
    const enemy = spawn(engine),
      defender = engine.state.units[0]
    enemy.hp = 1e7
    enemy.attack = 0
    // Act / Assert
    for (let i = 0; i < 100; i++) {
      enemy.progress = 100 + (i % 12) * 13
      engine.update(10)
      expect(Math.hypot(defender.x - defender.homeX, defender.y - defender.homeY)).toBeLessThanOrEqual(
        DEFINITIONS.soldier.leash + 1e-8
      )
    }
  })
  it('attacks the closest target rather than the first spawned', () => {
    // Arrange
    const { engine } = campaign(2)
    engine.startAssault()
    const distant = spawn(engine)
    engine.state.nextSpawnAt = 0
    engine.state.cooldowns.slime = 0
    const near = spawn(engine),
      defender = engine.state.units[0]
    distant.progress = 280
    near.progress = 180
    distant.speed = near.speed = 0
    // Act
    engine.update(1 / 60)
    // Assert
    expect(near.hp).toBe(near.maxHp)
    while (!defender.attackSequence && engine.state.time < 3) engine.update(CONFIG.step)
    advance(engine, 0.34)
    expect(near.hp).toBeLessThan(near.maxHp)
    expect(distant.hp).toBe(distant.maxHp)
    expect(defender.attackTargetX).toBeCloseTo(near.x)
  })
  it('prioritizes defeat when the final monster destroys the base', () => {
    // Arrange
    const { engine } = campaign()
    engine.startAssault()
    const enemy = spawn(engine)
    engine.state.enemiesSpawned = stageRules(1).enemyCount
    engine.state.enemiesResolved = stageRules(1).enemyCount - 1
    engine.state.playerBaseHp = 1
    enemy.progress = pathLength(FIELDS.meadow.path) - 0.1
    // Act
    engine.update(1 / 60)
    // Assert
    expect(engine.state.phase).toBe('assault')
    advance(engine, 0.45)
    expect(engine.state.phase).toBe('defeat')
    expect(engine.state.result).toBe('lose')
  })
})
describe('enemy director rules', () => {
  it('gradually unlocks thirteen enemies and reserves bosses for occasional final deployments', () => {
    // Arrange
    const { engine } = campaign(3)
    engine.startAssault()
    // Act / Assert
    expect(stageRules(1).enemyTypes).toEqual(['slime', 'goblin', 'shaman'])
    expect(stageRules(10).enemyTypes).toHaveLength(13)
    expect(engine.applyAIAction({ type: 'spawn', unitType: 'dragon' })).toBe(false)
    expect(engine.applyAIAction({ type: 'spawn', unitType: 'ogre', boss: true })).toBe(false)
    engine.state.enemiesSpawned = stageRules(3).enemyCount - 1
    expect(getLegalAIActions(engine.state)).toEqual([{ type: 'spawn', unitType: 'ogre', boss: true }])
    expect(engine.applyAIAction({ type: 'spawn', unitType: 'ogre', boss: true })).toBe(true)
    expect(engine.state.units.at(-1)!.boss).toBe(true)
    expect(engine.state.units.at(-1)!.hp).toBeCloseTo((DEFINITIONS.ogre.hp * stageRules(3).strength * 2.6) / 3)
  })
  it('enforces costs, cadence and finite count while reserving enough budget to finish', () => {
    // Arrange
    const { engine } = campaign(10)
    engine.startAssault()
    const rules = stageRules(10)
    // Act
    while (engine.state.enemiesSpawned < rules.enemyCount) {
      engine.state.time += 20
      engine.state.nextSpawnAt = 0
      for (const t of ENEMY_TYPES) engine.state.cooldowns[t] = 0
      const legal = getLegalAIActions(engine.state).filter((a) => a.type === 'spawn')
      expect(legal.length).toBeGreaterThan(0)
      expect(engine.applyAIAction(legal.at(-1))).toBe(true)
      expect(engine.applyAIAction(legal[0])).toBe(false)
    }
    // Assert
    expect(engine.state.budgetSpent).toBeLessThanOrEqual(rules.spawnBudget)
    expect(getLegalAIActions(engine.state)).toEqual([])
    expect(engine.state.result).toBeNull()
  })
  it('honors wait and rejects stale or malformed actions', () => {
    // Arrange
    const { engine } = campaign()
    engine.startAssault()
    // Act / Assert
    engine.state.cooldowns.shaman = 5
    expect(selectDirectorAction(engine.state, { type: 'wait', unitType: 'shaman' }, () => 0.9)).toEqual({
      type: 'wait',
      unitType: 'shaman'
    })
    expect(engine.applyAIAction({ type: 'wait' })).toBe(false)
    expect(selectDirectorAction(engine.state, { type: 'spawn', unitType: 'dragon' }, () => 0.9)).toBeNull()
    expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime', boss: true })).toBe(false)
    expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime', lane: 0 })).toBe(false)
  })
  it('reproduces seeded field-weighted choices and never invents illegal actions', () => {
    // Arrange
    const { engine } = campaign(10),
      a = new SeededRandom(123),
      b = new SeededRandom(123)
    engine.startAssault()
    const decision: AIDecision = {
      action: { type: 'spawn', unitType: 'slime' },
      scores: ENEMY_TYPES.map((unitType) => ({ action: { type: 'spawn', unitType }, score: 0.1 }))
    }
    // Act
    const first = Array.from({ length: 100 }, () => selectDirectorAction(engine.state, decision, a.next)),
      second = Array.from({ length: 100 }, () => selectDirectorAction(engine.state, decision, b.next))
    // Assert
    expect(first).toEqual(second)
    expect(selectDirectorAction(engine.state, decision, () => 1 - Number.EPSILON)).toEqual(
      getLegalAIActions(engine.state).at(-1)
    )
    expect(first.every((action) => action?.type !== 'wait')).toBe(true)
    expect(new Set(first.map((v) => JSON.stringify(v))).size).toBeGreaterThan(4)
    for (const action of first) expect(getLegalAIActions(engine.state)).toContainEqual(action)
  })
  it('bounds the snapshot and includes field, budget and home movement range', () => {
    // Arrange
    const { engine } = campaign()
    engine.startAssault()
    spawn(engine)
    engine.state.units.push(...Array.from({ length: 100 }, () => ({ ...engine.state.units[0] })))
    // Act
    const snapshot = serializeStateForAI(engine.state)
    // Assert
    expect(snapshot.defenders.length + snapshot.enemies.length).toBeLessThanOrEqual(48)
    expect(snapshot.field.id).toBe('meadow')
    expect(snapshot.wave.budgetRemaining).toBeGreaterThan(0)
    expect(snapshot.defenders[0]).toMatchObject({
      leash: DEFINITIONS.soldier.leash,
      range: DEFINITIONS.soldier.range,
      stationary: false
    })
    expect(snapshot.defenders[0]).not.toHaveProperty('attackAnimation')
    // Enriched combat observations use the production 64 KiB wire limit.
    expect(new TextEncoder().encode(JSON.stringify(snapshot)).length).toBeLessThan(65536)
    expect(snapshot.combatObservation).toEqual({ version: 1, at: engine.state.time })
    expect(snapshot.enemyActionTimeScale).toBe(0.8)
    expect(snapshot.defenders[0].combat).toMatchObject({
      alive: true,
      attackReadyIn: engine.state.units[0].attackCooldown,
      movement: { moving: engine.state.units[0].moving }
    })
    expect(snapshot.enemies[0].combat).toHaveProperty('attackInterval')
    expect(snapshot.legalActions).toEqual(getLegalAIActions(engine.state))
    expect(snapshot.tacticalOptions).toHaveLength(snapshot.legalActions.length)
  })
})
describe('request scheduling', () => {
  it.each(['invalidated', 'controller-switch', 'new-order', 'stage-clear', 'defeat'] as const)(
    'does not start a queued decision when %s before its microtask runs',
    async (change) => {
      // Arrange
      const decide = vi.fn(async () => null),
        replacement = vi.fn(async () => null),
        engine = new GameEngine({ decide }, freshSave(), 'meadow', 1, () => 0)
      engine.place('soldier', 0)
      engine.startAssault()
      engine.update(CONFIG.step)
      // Act
      if (change === 'invalidated') engine.invalidateAI()
      else if (change === 'controller-switch') engine.ai = { decide: replacement }
      else if (change === 'new-order') engine.applyAIAction({ type: 'spawn', unitType: 'slime' })
      else if (change === 'stage-clear') finishWave(engine)
      else {
        engine.state.playerBaseHp = 0
        engine.update(CONFIG.step)
      }
      await flush()
      // Assert
      expect(decide).not.toHaveBeenCalled()
      expect(replacement).not.toHaveBeenCalled()
    }
  )

  it('releases a skipped queued decision slot without bypassing the one-second start deadline', async () => {
    // Arrange
    let now = 0
    const decide = vi.fn(async () => null),
      engine = new GameEngine({ decide }, freshSave(), 'meadow', 1, () => now)
    engine.place('soldier', 0)
    engine.startAssault()
    engine.update(CONFIG.step)
    // Act
    engine.invalidateAI()
    await flush()
    now = 999
    engine.update(CONFIG.step)
    await flush()
    // Assert
    expect(decide).not.toHaveBeenCalled()
    // Act
    now = 1000
    engine.update(CONFIG.step)
    await flush()
    // Assert
    expect(decide).toHaveBeenCalledTimes(1)
  })
  it('expires old requests and uses wall time without catch-up bursts', async () => {
    // Arrange
    let now = 0,
      resolve!: (value: AIResult) => void
    const decide = vi.fn(
        () =>
          new Promise<AIResult>((r) => {
            resolve = r
          })
      ),
      engine = new GameEngine({ decide }, freshSave(), 'meadow', 1, () => now)
    engine.place('soldier', 0)
    engine.startAssault()
    // Act
    advance(engine, 5)
    await flush()
    now = 10000
    advance(engine, 5)
    await flush()
    // Assert
    expect(decide).toHaveBeenCalledTimes(2)
    // Act
    resolve(null)
    await flush()
    engine.update(1 / 60)
    await flush()
    // Assert
    expect(decide).toHaveBeenCalledTimes(2)
    // Act
    resolve(null)
    await flush()
    advance(engine, 20)
    await flush()
    // Assert
    expect(decide).toHaveBeenCalledTimes(2)
  })
  it('discards previous-generation results and does not block a replacement controller', async () => {
    // Arrange
    let resolve!: (value: AIResult) => void,
      now = 0
    const old = vi.fn(
        () =>
          new Promise<AIResult>((r) => {
            resolve = r
          })
      ),
      replacement = vi.fn(async () => null)
    const engine = new GameEngine({ decide: old }, freshSave(), 'meadow', 1, () => now)
    engine.place('soldier', 0)
    engine.startAssault()
    engine.update(1 / 60)
    await flush()
    // Act
    engine.invalidateAI()
    engine.ai = { decide: replacement }
    now = 2000
    engine.update(1 / 60)
    await flush()
    // Assert
    expect(replacement).toHaveBeenCalledOnce()
    // Act
    resolve({ type: 'spawn', unitType: 'slime' })
    await flush()
    engine.update(1 / 60)
    await flush()
    // Assert
    expect(engine.state.enemiesSpawned).toBe(0)
    expect(replacement).toHaveBeenCalledTimes(1)
  })
})
describe('fields and progression', () => {
  it.each(Object.keys(FIELDS) as FieldId[])('%s provides a single long road and ten or more off-road anchors', (id) => {
    // Arrange
    const field = FIELDS[id]
    // Act / Assert
    expect(field.slots.length).toBeGreaterThanOrEqual(10)
    expect(pathLength(field.path)).toBeGreaterThan(2000)
    for (const slot of field.slots) expect(distanceToPath(field.path, slot)).toBeGreaterThanOrEqual(52)
    expect(new Set(field.slots.map((s) => s.id)).size).toBe(field.slots.length)
  })
  it('has ten ally and thirteen enemy roles and separates stage unlocks from earned purchases', () => {
    // Arrange
    const save = freshSave()
    // Act / Assert
    expect(ALLY_TYPES).toHaveLength(10)
    expect(ENEMY_TYPES).toHaveLength(13)
    expect(new Set(Object.values(DEFINITIONS).map((v) => v.name)).size).toBe(23)
    expect(availableAllies(save, 2)).toContain('runner')
    expect(availableAllies(save, 10)).not.toContain('mage')
    expect(purchase(save, 'mage')).toBe(false)
    save.gold = 100
    expect(purchase(save, 'mage')).toBe(true)
    expect(save.gold).toBe(0)
    expect(purchase(save, 'mage')).toBe(false)
    expect(availableAllies(save, 1)).toContain('mage')
  })
  it('applies upgrades and rejects locked or corrupt progress', () => {
    // Arrange
    const { engine, save } = campaign()
    save.gold = 100
    const before = engine.state.units[0].maxHp
    // Act
    expect(upgrade(save, 'frost', 1)).toBe(false)
    expect(upgrade(save, 'soldier', 1)).toBe(true)
    engine.refreshDefenders()
    // Assert
    expect(engine.state.units[0].hp).toBeCloseTo(before * 1.12)
    expect(loadSave({ getItem: () => JSON.stringify(save) })).toEqual(save)
    for (const value of ['bad', 'null', '{"gold":-1}', '{"version":2,"gold":0}'])
      expect(loadSave({ getItem: () => value })).toEqual(freshSave())
  })
})

describe('role abilities and reproducible field biases', () => {
  it('slows enemies without stopping their road movement', () => {
    // Arrange
    const { engine, save } = campaign(5)
    save.purchased.push('frost')
    engine.place('frost', 0)
    engine.startAssault()
    const enemy = spawn(engine)
    enemy.progress = 180
    enemy.hp = 10000
    enemy.attackCooldown = 1000
    // Act
    advance(engine, 0.67)
    const afterHit = enemy.progress
    engine.update(1 / 60)
    // Assert
    expect(enemy.slowUntil).toBeGreaterThan(engine.state.time)
    expect(enemy.progress - afterHit).toBeCloseTo((enemy.speed * DEFINITIONS.frost.slow) / 60)
    expect(enemy.moving).toBe(true)
  })
  it('heals only living nearby defenders and does not revive during assault', () => {
    // Arrange
    const { engine, save } = campaign(3)
    save.gold = 500
    purchase(save, 'healer')
    engine.place('healer', 1)
    const defender = engine.state.units[0]
    defender.hp = 80
    engine.startAssault()
    // Act
    advance(engine, 0.85)
    const healed = defender.hp
    defender.hp = 0
    advance(engine, 3)
    // Assert
    expect(healed).toBeGreaterThan(80)
    expect(defender.hp).toBe(0)
  })
  it('applies splash to clustered targets', () => {
    // Arrange
    const { engine, save } = campaign(5)
    save.gold = 500
    purchase(save, 'mage')
    engine.place('mage', 0)
    engine.startAssault()
    const first = spawn(engine)
    engine.state.nextSpawnAt = 0
    engine.state.cooldowns.slime = 0
    const second = spawn(engine)
    first.progress = 180
    second.progress = 200
    first.speed = second.speed = 0
    // Act
    engine.update(1 / 60)
    // Assert
    expect(first.hp).toBe(first.maxHp)
    advance(engine, 0.76)
    expect(first.hp).toBeLessThan(first.maxHp)
    expect(second.hp).toBeLessThan(second.maxHp)
    expect(first.maxHp - first.hp).toBeCloseTo(DEFINITIONS.mage.attack)
  })
  it('changes spawn distributions by field while preserving the same seeded input stream', () => {
    // Arrange
    const meadow = campaign(10, 'meadow').engine
    const desert = campaign(10, 'desert').engine
    meadow.startAssault()
    desert.startAssault()
    const decision: AIDecision = {
      action: { type: 'spawn', unitType: 'slime' },
      scores: ENEMY_TYPES.map((unitType) => ({ action: { type: 'spawn', unitType }, score: 0.1 }))
    }
    const a = new SeededRandom(412),
      b = new SeededRandom(412)
    // Act
    const sample = (engine: GameEngine, rng: SeededRandom) =>
      Array.from({ length: 2000 }, () => selectDirectorAction(engine.state, decision, rng.next)).filter(
        (action) => action?.type === 'spawn' && action.unitType === 'slime'
      ).length
    const meadowSlimes = sample(meadow, a),
      desertSlimes = sample(desert, b)
    // Assert
    expect(meadowSlimes).toBeGreaterThan(desertSlimes * 1.5)
  })
})

describe('continuous base siege', () => {
  it('stops within base range, remains alive and attacks repeatedly on cooldown', () => {
    // Arrange
    const { engine } = campaign()
    engine.startAssault()
    const enemy = spawn(engine)
    enemy.progress = pathLength(FIELDS.meadow.path) - 67
    // Act
    advance(engine, 0.45)
    const progress = enemy.progress,
      afterFirstHit = engine.state.playerBaseHp
    advance(engine, 1)
    const beforeCooldown = engine.state.playerBaseHp
    advance(engine, 2.2)
    // Assert
    expect(afterFirstHit).toBe(CONFIG.baseHp - enemy.attack)
    expect(beforeCooldown).toBe(afterFirstHit)
    expect(engine.state.playerBaseHp).toBe(CONFIG.baseHp - 2 * enemy.attack)
    expect(engine.state.units).toContain(enemy)
    expect(engine.state.enemiesResolved).toBe(0)
    expect(enemy.progress).toBe(progress)
    expect(enemy.moving).toBe(false)
  })
  it('prioritizes the base over a closer defender, which can still kill the siege enemy', () => {
    // Arrange
    const { engine } = campaign()
    engine.startAssault()
    const enemy = spawn(engine),
      defender = engine.state.units[0],
      base = FIELDS.meadow.path.at(-1)!
    enemy.progress = pathLength(FIELDS.meadow.path) - 67
    const position = pointOnPath(FIELDS.meadow.path, enemy.progress)
    defender.x = defender.homeX = position.x
    defender.y = defender.homeY = position.y - 42
    defender.attack = 0
    engine.state.enemiesSpawned = stageRules(1).enemyCount
    engine.state.enemiesResolved = stageRules(1).enemyCount - 1
    // Act
    engine.update(1 / 60)
    // Assert
    expect(defender.hp).toBe(defender.maxHp)
    expect(enemy.attackTargetX).toBe(base.x - BASE_WALL_FOOTPRINT.halfWidth)
    expect(enemy.attackTargetY).toBe(base.y)
    expect(engine.state.result).toBeNull()
    // Act
    defender.attack = 1000
    defender.attackCooldown = 0
    advance(engine, 0.35)
    // Assert
    expect(engine.state.units).not.toContain(enemy)
    expect(engine.state.phase).toBe('cleared')
  })
  it('retains facing after movement stops', () => {
    // Arrange
    const { engine } = campaign()
    engine.startAssault()
    const enemy = spawn(engine)
    // Act
    engine.update(1 / 60)
    const facing = [enemy.facingX, enemy.facingY]
    enemy.speed = 0
    engine.update(1 / 60)
    // Assert
    expect([enemy.facingX, enemy.facingY]).toEqual(facing)
    expect(enemy.moving).toBe(false)
  })
})

it('keeps the boss on its archetype cooldown after a regular ogre deployment', () => {
  // Arrange
  const { engine } = campaign(9)
  engine.startAssault()
  engine.state.enemiesSpawned = stageRules(9).enemyCount - 2
  expect(engine.applyAIAction({ type: 'spawn', unitType: 'ogre' })).toBe(true)
  // Act
  advance(engine, 2)
  const duringCooldown = getLegalAIActions(engine.state)
  advance(engine, 6.1)
  // Assert
  expect(duringCooldown).toEqual([{ type: 'wait', unitType: 'ogre', boss: true }])
  expect(getLegalAIActions(engine.state)).toContainEqual({ type: 'spawn', unitType: 'ogre', boss: true })
})

it('increments an authoritative attack sequence once per attack without moving damage into rendering', () => {
  // Arrange
  const { engine } = campaign()
  engine.startAssault()
  const enemy = spawn(engine),
    defender = engine.state.units[0]
  defender.y = defender.homeY = FIELDS.meadow.path[0].y - 42
  enemy.progress = 180
  enemy.speed = 0
  enemy.hp = enemy.maxHp = 10000
  // Act
  engine.update(1 / 60)
  const firstHp = enemy.hp,
    firstStartedAt = defender.attackStartedAt
  advance(engine, 0.2)
  // Assert
  expect(defender.attackSequence).toBe(1)
  expect(enemy.hp).toBe(firstHp)
  expect(defender.attackStartedAt).toBe(firstStartedAt)
  // Act
  advance(engine, 1.3)
  // Assert
  expect(defender.attackSequence).toBe(2)
  expect(enemy.hp).toBeCloseTo(firstHp - defender.attack)
})

describe('authoritative authored impacts', () => {
  function duel(type: 'soldier' | 'archer' | 'mage' = 'soldier') {
    const { engine, save } = campaign()
    if (type === 'mage') {
      save.gold = 100
      purchase(save, 'mage')
    }
    engine.place(type, 0)
    engine.startAssault()
    const enemy = spawn(engine),
      defender = engine.state.units[0]
    if (type === 'soldier') defender.y = defender.homeY = FIELDS.meadow.path[0].y - 42
    enemy.progress = 180
    enemy.speed = 0
    enemy.attack = 0
    enemy.hp = enemy.maxHp = 10000
    engine.update(1 / 60)
    return { engine, enemy, defender }
  }
  it('waits for the soldier contact and applies it once at fixed simulation time', () => {
    // Arrange
    const { engine, enemy, defender } = duel()
    // Act
    advance(engine, 0.3)
    // Assert
    expect(enemy.hp).toBe(enemy.maxHp)
    // Act
    engine.update(1 / 60)
    const afterHit = enemy.hp
    advance(engine, 0.2)
    // Assert
    expect(afterHit).toBe(enemy.maxHp - defender.attack)
    expect(enemy.hp).toBe(afterHit)
    expect(engine.state.attacks.find((attack) => attack.attackerId === defender.id)?.status).toBe('hit')
  })
  it('hits the chosen melee target after it leaves range without retargeting the queued attack', () => {
    // Arrange
    const { engine, enemy, defender } = duel()
    const attack = engine.state.attacks.find((value) => value.attackerId === defender.id)!
    // Act
    enemy.progress = 1200
    advance(engine, 0.4)
    // Assert
    expect(enemy.hp).toBe(enemy.maxHp - defender.attack)
    expect(attack.status).toBe('hit')
    expect(attack.targetId).toBe(enemy.id)
  })
  it('cancels windup on attacker death before release', () => {
    // Arrange
    const { engine, enemy, defender } = duel('archer')
    // Act
    advance(engine, 0.3)
    defender.hp = 0
    advance(engine, 0.5)
    // Assert
    expect(enemy.hp).toBe(enemy.maxHp)
    expect(engine.state.attacks.find((attack) => attack.attackerId === defender.id)?.status).toBe('cancelled')
  })
  it('releases at433ms, then keeps the projectile alive after attacker death until its653ms impact', () => {
    // Arrange
    const { engine, enemy, defender } = duel('archer')
    // Act
    advance(engine, 0.4)
    // Assert
    expect(enemy.hp).toBe(enemy.maxHp)
    expect(engine.state.attacks.find((attack) => attack.attackerId === defender.id)?.status).toBe('windup')
    // Act
    advance(engine, 2 / 60)
    defender.hp = 0
    enemy.progress += 150
    advance(engine, 0.2)
    // Assert
    expect(enemy.hp).toBe(enemy.maxHp)
    // Act
    advance(engine, 2 / 60)
    // Assert
    expect(enemy.hp).toBe(enemy.maxHp - defender.attack)
    expect(engine.state.attacks.find((attack) => attack.attackerId === defender.id)?.status).toBe('hit')
  })
  it('does not transfer a released projectile to another unit when its target dies', () => {
    // Arrange
    const { engine, enemy, defender } = duel('archer')
    // Act
    advance(engine, 0.45)
    enemy.hp = 0
    engine.state.nextSpawnAt = engine.state.cooldowns.slime = 0
    const replacement = spawn(engine)
    replacement.progress = 180
    replacement.speed = 0
    advance(engine, 0.25)
    // Assert
    expect(replacement.hp).toBe(replacement.maxHp)
    expect(engine.state.attacks.find((attack) => attack.attackerId === defender.id)?.status).toBe('missed')
  })
  it('drops pending attack records on stage advance and keeps them out of Jev snapshots', () => {
    // Arrange
    const { engine } = duel()
    // Act
    finishWave(engine)
    engine.nextStage()
    // Assert
    expect(engine.state.attacks).toEqual([])
    expect(serializeStateForAI(engine.state)).not.toHaveProperty('attacks')
  })
  it('finishes a locked strike then selects the base first for its next attack', () => {
    // Arrange
    const { engine } = campaign()
    engine.startAssault()
    const enemy = spawn(engine),
      defender = engine.state.units[0]
    enemy.progress = pathLength(FIELDS.meadow.path) - 110
    const position = pointOnPath(FIELDS.meadow.path, enemy.progress)
    defender.x = defender.homeX = position.x
    defender.y = defender.homeY = position.y - 36
    defender.attack = 0
    engine.update(1 / 60)
    const first = engine.state.attacks.find((attack) => attack.attackerId === enemy.id)!
    // Act
    enemy.attackRange = 120
    advance(engine, 0.2)
    // Assert
    expect(first.base).toBe(false)
    expect(first.status).toBe('windup')
    expect(enemy.attackSequence).toBe(1)
    expect(defender.hp).toBe(defender.maxHp)
    // Act
    advance(engine, 3.45)
    // Assert
    expect(engine.state.attacks.filter((attack) => attack.attackerId === enemy.id).at(-1)?.base).toBe(true)
    expect(engine.state.playerBaseHp).toBe(CONFIG.baseHp - enemy.attack)
    expect(defender.hp).toBe(defender.maxHp - enemy.attack)
  })
})

describe('scheduled support and damage recipients', () => {
  function supportDuel(type: 'healer' | 'paladin' = 'healer') {
    const { engine, save } = campaign(3)
    save.gold = 500
    purchase(save, type)
    engine.place(type, 1)
    const defender = engine.state.units[0],
      healer = engine.state.units[1]
    defender.x = defender.homeX = healer.x + 50
    defender.y = defender.homeY = healer.y
    if (type === 'paladin') {
      healer.x = healer.homeX = 240
      healer.y = healer.homeY = 202
      defender.x = defender.homeX = 260
      defender.y = defender.homeY = 202
    }
    defender.hp = 80
    defender.attack = 0
    engine.startAssault()
    const enemy = spawn(engine)
    enemy.progress = Array.from({ length: Math.floor(pathLength(FIELDS.meadow.path)) }, (_, index) => index).sort(
      (a, b) => {
        const pa = pointOnPath(FIELDS.meadow.path, a),
          pb = pointOnPath(FIELDS.meadow.path, b)
        return Math.hypot(pa.x - healer.x, pa.y - healer.y) - Math.hypot(pb.x - healer.x, pb.y - healer.y)
      }
    )[0]
    enemy.speed = enemy.attack = 0
    enemy.hp = enemy.maxHp = 10000
    engine.update(1 / 60)
    return { engine, defender, healer, enemy }
  }
  it('heals at projectile impact, never at cast start or release', () => {
    // Arrange
    const { engine, defender, healer, enemy } = supportDuel()
    // Act
    advance(engine, 0.6)
    // Assert
    expect(defender.hp).toBe(80)
    expect(enemy.hp).toBe(enemy.maxHp)
    // Act
    advance(engine, 0.24)
    const attack = engine.state.attacks.find((value) => value.attackerId === healer.id)!
    // Assert
    expect(defender.hp).toBe(98)
    expect(enemy.hp).toBe(enemy.maxHp)
    expect(attack.damageHit).toBe(false)
    expect(attack.healing?.hit).toBe(true)
  })
  it('heals only its locked ally when the enemy moves away before release', () => {
    // Arrange
    const { engine, defender, healer, enemy } = supportDuel()
    // Act
    enemy.progress = 1500
    advance(engine, 0.85)
    const attack = engine.state.attacks.find((value) => value.attackerId === healer.id)!
    // Assert
    expect(defender.hp).toBe(98)
    expect(enemy.hp).toBe(enemy.maxHp)
    expect(attack.damageActive).toBe(false)
    expect(attack.damageHit).toBe(false)
    expect(attack.healing?.hit).toBe(true)
  })
  it('keeps its locked healing recipient when that ally moves away before release', () => {
    // Arrange
    const { engine, defender, healer, enemy } = supportDuel()
    // Act
    defender.x = defender.homeX = 1100
    defender.y = defender.homeY = 700
    advance(engine, 0.85)
    const attack = engine.state.attacks.find((value) => value.attackerId === healer.id)!
    // Assert
    expect(defender.hp).toBe(98)
    expect(enemy.hp).toBe(enemy.maxHp)
    expect(attack.damageHit).toBe(false)
    expect(attack.healing?.active).toBe(true)
    expect(attack.healing?.hit).toBe(true)
  })
  it('keeps released healing after caster death and healing follows its original ally beyond range', () => {
    // Arrange
    const { engine, defender, healer, enemy } = supportDuel()
    // Act
    advance(engine, 0.62)
    healer.hp = 0
    defender.x = defender.homeX = 1100
    defender.y = defender.homeY = 700
    advance(engine, 0.23)
    // Assert
    expect(defender.hp).toBe(98)
    expect(enemy.hp).toBe(enemy.maxHp)
  })
  it('cancels healing if the support caster dies before release', () => {
    // Arrange
    const { engine, defender, healer, enemy } = supportDuel()
    // Act
    advance(engine, 0.5)
    healer.hp = 0
    advance(engine, 0.4)
    // Assert
    expect(defender.hp).toBe(80)
    expect(enemy.hp).toBe(enemy.maxHp)
  })
  it('keeps Paladin support recipients unhealed and schedules no healing action', () => {
    // Arrange
    const { engine, defender, healer, enemy } = supportDuel('paladin')
    // Act
    advance(engine, 0.62)
    // Assert
    expect(defender.hp).toBe(80)
    expect(enemy.hp).toBe(enemy.maxHp - 38)
    expect(
      engine.state.attacks
        .filter((value) => value.attackerId === healer.id)
        .some((value) => value.kind === 'heal' || value.healing)
    ).toBe(false)
    expect(healer.healCooldown).toBeUndefined()
  })
})

it('waits for a dead final ranged enemy projectile before clearing, preserving base defeat priority', () => {
  // Arrange
  const { engine } = campaign(7)
  engine.startAssault()
  expect(engine.applyAIAction({ type: 'spawn', unitType: 'wraith' })).toBe(true)
  const enemy = engine.state.units.at(-1)!
  enemy.progress = pathLength(FIELDS.meadow.path) - 120
  engine.state.enemiesSpawned = stageRules(7).enemyCount
  engine.state.enemiesResolved = stageRules(7).enemyCount - 1
  engine.state.playerBaseHp = 1
  // Act
  advance(engine, 0.45)
  const attack = engine.state.attacks.find((value) => value.attackerId === enemy.id)!
  enemy.hp = 0
  engine.update(1 / 60)
  // Assert
  expect(attack.status).toBe('released')
  expect(engine.state.units).not.toContain(enemy)
  expect(engine.state.phase).toBe('assault')
  expect(engine.state.playerBaseHp).toBe(1)
  // Act
  advance(engine, 0.2)
  // Assert
  expect(attack.status).toBe('hit')
  expect(engine.state.phase).toBe('defeat')
  expect(engine.state.playerBaseHp).toBe(0)
})

it('clears after the final released hostile projectile safely resolves', () => {
  // Arrange
  const { engine } = campaign(7)
  engine.startAssault()
  engine.applyAIAction({ type: 'spawn', unitType: 'wraith' })
  const enemy = engine.state.units.at(-1)!
  enemy.progress = pathLength(FIELDS.meadow.path) - 120
  engine.state.enemiesSpawned = stageRules(7).enemyCount
  engine.state.enemiesResolved = stageRules(7).enemyCount - 1
  // Act
  advance(engine, 0.45)
  enemy.hp = 0
  advance(engine, 0.25)
  // Assert
  expect(engine.state.phase).toBe('cleared')
  expect(engine.state.playerBaseHp).toBe(CONFIG.baseHp - enemy.attack)
})

it('records simulation travel for gait phase, freezes it when paused and resets it between stages', () => {
  // Arrange
  const { engine } = campaign()
  engine.startAssault()
  const enemy = spawn(engine),
    defender = engine.state.units[0]
  // Act
  advance(engine, 0.5)
  const travelled = enemy.travelled
  engine.state.phase = 'cleared'
  engine.update(10)
  defender.travelled = 52
  engine.nextStage()
  // Assert
  expect(travelled).toBeCloseTo(enemy.speed * 0.5)
  expect(enemy.travelled).toBe(travelled)
  expect(defender.travelled).toBe(0)
  expect(serializeStateForAI(engine.state).defenders[0]).not.toHaveProperty('travelled')
})

it('pauses before each fixed step when presentation is unavailable and discards paused wall time', () => {
  // Arrange
  const engine = new GameEngine(idle)
  engine.place('soldier', 0)
  engine.startAssault()
  const initialHp = engine.state.units[0].hp
  let checks = 0
  // Act
  engine.update(0.25, () => ++checks === 1)
  // Assert
  expect(checks).toBe(2)
  expect(engine.state.time).toBeCloseTo(CONFIG.step)
  expect(engine.state.units[0].hp).toBe(initialHp)
  // Act
  engine.update(10, () => false)
  engine.update(CONFIG.step, () => true)
  // Assert
  expect(engine.state.time).toBeCloseTo(2 * CONFIG.step)
})
