import { describe, expect, it } from 'vitest'
import { ALLY_TYPES, FIELDS, initialState, stageRules, type AllyType } from '../src/game/model'
import { GameEngine } from '../src/game/GameEngine'
import { freshSave } from '../src/progression/UpgradeSystem'
import { advanceSpecials, castSpecial, SPECIALS, specialReady, type SpecialImpact } from '../src/game/SpecialAbilities'
import type { DamageContribution } from '../src/game/TacticalHistory'
const idle = { decide: async () => null }
function fixture(type: AllyType = 'soldier') {
  const save = freshSave(),
    engine = new GameEngine(idle, save, 'meadow', 42, () => 0)
  expect(engine.place('soldier', FIELDS.meadow.slots[0].id)).toBe(true)
  const unit = engine.state.units[0]
  const state = initialState()
  state.phase = 'assault'
  state.units = [
    { ...unit, type, hp: 50, maxHp: 100, attack: 20, x: 300, y: 300 },
    { ...unit, id: 2, owner: 'ai', type: 'slime', hp: 1000, maxHp: 1000, x: 320, y: 300 },
    { ...unit, id: 3, hp: 50, maxHp: 100, x: 320, y: 300 }
  ]
  return { state, engine, save }
}
function step(state: ReturnType<typeof initialState>, dt: number) {
  state.time += dt
  const damage = new Map<number, number>(),
    healing = new Map<number, number>(),
    history: DamageContribution[] = []
  advanceSpecials(state, dt, damage, healing, history)
  return { damage, healing, history }
}
describe('special impact reports (presentation only)', () => {
  const impactsOf = (state: ReturnType<typeof initialState>, dt: number) => {
    state.time += dt
    const impacts: SpecialImpact[] = []
    advanceSpecials(state, dt, new Map(), new Map(), [], impacts)
    return impacts
  }
  it('reports a special that hits nothing as zero targets and zero damage, whatever else damaged the enemy', () => {
    const { state } = fixture('soldier')
    state.battlefieldVersion = 2
    state.units[1].type = 'bat' // a soldier's special cannot hit it
    castSpecial(state, 1, { x: 300, y: 300 })
    state.units[1].hp -= 12 // an ordinary attack landing in the same step
    const [impact, ...rest] = impactsOf(state, SPECIALS.soldier.release)
    expect(rest).toEqual([])
    expect(impact).toMatchObject({ castKey: 'special:1:1', targets: [], damage: 0, heal: 0 })
  })
  it('reports only the special\'s own contribution, not other damage to the same enemy', () => {
    const { state } = fixture('soldier')
    castSpecial(state, 1, { x: 300, y: 300 })
    state.units[1].hp -= 500
    const [impact] = impactsOf(state, SPECIALS.soldier.release)
    expect(impact.targets).toEqual([2])
    expect(impact.damage).toBe(SPECIALS.soldier.power * 20)
  })
  it('keeps two specials landing in the same step apart', () => {
    const { state } = fixture('soldier')
    state.units.push({ ...state.units[0], id: 5, type: 'soldier', x: 560, y: 300 })
    state.units.push({ ...state.units[1], id: 6, hp: 1000, x: 600, y: 300 })
    castSpecial(state, 1, { x: 300, y: 300 })
    castSpecial(state, 5, { x: 600, y: 300 })
    const impacts = impactsOf(state, SPECIALS.soldier.release)
    expect(impacts.map((i) => [i.castKey, i.targets])).toEqual([
      ['special:1:1', [2]],
      ['special:5:1', [6]]
    ])
    expect(impacts.map((i) => i.damage)).toEqual([80, 80])
  })
  it('reports a healer field\'s own heal, capped by each ally\'s missing hp, and frost\'s rooted targets', () => {
    const { state } = fixture('healer')
    state.units[2].hp = 99.99 // ally 3 is almost full; ally 1 (the healer) has 50/100
    castSpecial(state, 1, { x: 300, y: 300 })
    state.units[1].hp -= 5 // unrelated damage to an enemy changes nothing
    const first = impactsOf(state, SPECIALS.healer.release + 1)[0]
    expect(first.targets.sort()).toEqual([1, 3])
    // activeDt = 1 s: ally 1 would get 6 hp, ally 3 only its missing 0.01.
    expect(first.heal).toBeCloseTo(6.01, 2)
    const frost = fixture('frost').state
    castSpecial(frost, 1, { x: 300, y: 300 })
    expect(impactsOf(frost, SPECIALS.frost.release)[0]).toMatchObject({ targets: [2], damage: 0, heal: 0 })
  })
  it('queues impacts in the engine with the step\'s kills, drains them once, and never saves them', () => {
    const { engine } = fixture('soldier')
    engine.startAssault()
    const unit = engine.state.units[0]
    expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime' })).toBe(true)
    const enemy = engine.state.units.find((u) => u.owner === 'ai')!
    enemy.hp = 1
    // The slime walks in from the cave; aim where it will be at the release.
    expect(engine.castSpecial(unit.id, { x: 110, y: 150 })).toBe(true)
    for (let tick = 0; tick < Math.ceil((SPECIALS.soldier.release + 0.05) * 60); tick++) engine.update(1 / 60)
    const impacts = engine.takeSpecialImpacts()
    expect(impacts).toHaveLength(1)
    expect(impacts[0]).toMatchObject({ sourceId: unit.id, targets: [enemy.id], kills: [enemy.id] })
    expect(engine.takeSpecialImpacts()).toEqual([])
    expect(JSON.stringify(engine.exportCheckpoint())).not.toContain('castKey')
  })
})
describe('kill credit: one source per kill', () => {
  // A real engine in the assault with one 5-HP slime; the specials/attacks are cast and timed by hand
  // to land in the same engine step, and the slime's step-kill is read from the queued impacts.
  function scene() {
    const { engine } = fixture('soldier')
    engine.startAssault()
    expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime' })).toBe(true)
    const caster = engine.state.units.find((u) => u.owner === 'player')!,
      enemy = engine.state.units.find((u) => u.owner === 'ai')!
    enemy.hp = enemy.maxHp = 5
    const point = { x: 110, y: 150 } // where the walking slime will be at the release
    expect(engine.castSpecial(caster.id, point)).toBe(true)
    const ally = (type: AllyType, id: number) => {
      const unit = { ...caster, id, type, x: caster.x, y: caster.y, specialCooldown: undefined, specialCast: undefined }
      engine.state.units.push(unit)
      expect(engine.castSpecial(id, point)).toBe(true)
      return unit
    }
    return { engine, caster, enemy, ally, effects: engine.state.specialEffects! }
  }
  const land = (engine: GameEngine) => {
    for (let tick = 0; tick < 120 && !engine.state.specialEffects!.every((e) => e.applied); tick++) engine.update(1 / 60)
    return engine.takeSpecialImpacts()
  }
  it('credits a special that alone kills', () => {
    const { engine, enemy } = scene()
    const impacts = land(engine)
    expect(impacts.map((i) => i.kills)).toEqual([[enemy.id]])
  })
  it('does not credit a 0.04 special for a kill that a 100-damage normal hit made', () => {
    const { engine, caster, enemy, effects } = scene()
    effects[0].power = 0.04
    engine.state.attacks.push({
      id: 'normal:1', attackerId: 900, sequence: 1, owner: 'player', type: 'soldier', targetId: enemy.id,
      damageActive: true, damageHit: false, base: false, power: 100, range: 999, startedAt: 0,
      releaseAt: 0, impactAt: effects[0].releaseAt, endsAt: effects[0].releaseAt + 0.2, projectile: false,
      status: 'released', origin: { x: caster.x, y: caster.y }, target: { x: enemy.x, y: enemy.y }, damageType: 'melee'
    })
    engine.state.units.push({ ...caster, id: 900, specialCast: undefined })
    const impacts = land(engine)
    expect(impacts).toHaveLength(1)
    expect(impacts[0].targets).toEqual([enemy.id])
    expect(impacts[0].kills).toEqual([])
    expect(engine.state.units.some((u) => u.id === enemy.id)).toBe(false)
  })
  it('gives two specials landing on one enemy in one step exactly one kill: the bigger hit', () => {
    const { engine, enemy, ally, effects } = scene()
    ally('archer', 901)
    const [soldier, archer] = effects
    archer.releaseAt = soldier.releaseAt
    archer.power = soldier.power * 2
    const impacts = land(engine)
    expect(impacts).toHaveLength(2)
    expect(impacts.flatMap((i) => i.kills)).toEqual([enemy.id])
    expect(impacts.find((i) => i.type === 'archer')!.kills).toEqual([enemy.id])
    expect(impacts.find((i) => i.type === 'soldier')!.kills).toEqual([])
  })
})
describe('individual special abilities', () => {
  for (const type of ALLY_TYPES)
    it(`${type} applies its own role only in the selected circle`, () => {
      const { state } = fixture(type)
      state.units.push({ ...state.units[1], id: 4, x: 1000 })
      expect(castSpecial(state, 1, { x: 300, y: 300 })).toBe(true)
      expect(step(state, SPECIALS[type].release - 0.001).damage.size).toBe(0)
      const result = step(state, 0.002)
      expect(result.damage.has(1)).toBe(false)
      expect(result.damage.has(3)).toBe(false)
      expect(result.damage.has(4)).toBe(false)
      expect(result.damage.get(2) ?? 0).toBe((SPECIALS[type].power * 20) / SPECIALS[type].impacts.length)
      expect(result.healing.has(2)).toBe(false)
      expect(result.healing.has(3)).toBe(type === 'healer')
      expect((state.units[1].specialRootUntil ?? 0) > state.time).toBe(SPECIALS[type].root > 0)
      expect((state.units[1].specialStunUntil ?? 0) > state.time).toBe(type === 'tank' || type === 'paladin')
      expect(step(state, 1 / 60).damage.size).toBe(0)
    })
  it('applies the burst on its exact authored release and only once', () => {
    const { state } = fixture('soldier')
    castSpecial(state, 1, { x: 300, y: 300 })
    expect(step(state, SPECIALS.soldier.release).damage.get(2)).toBe(80)
    expect(step(state, 0.001).damage.size).toBe(0)
  })
  it('commits all three Runner impacts on their authored clock', () => {
    const { state } = fixture('runner')
    castSpecial(state, 1, { x: 300, y: 300 })
    let previous = 0
    for (const impact of SPECIALS.runner.impacts) {
      expect(step(state, impact - previous).damage.get(2)).toBe(40)
      previous = impact
    }
  })
  it('respects the existing airborne target rules', () => {
    for (const type of ['soldier', 'archer'] as const) {
      const { state } = fixture(type)
      state.battlefieldVersion = 2
      state.units[1].type = 'bat'
      castSpecial(state, 1, { x: 300, y: 300 })
      expect(step(state, SPECIALS[type].release).damage.has(2)).toBe(type === 'archer')
    }
  })
  it('keeps a stable field deadline so forecasting is not invalidated every simulation tick', () => {
    const { state } = fixture('frost')
    castSpecial(state, 1, { x: 300, y: 300 })
    step(state, SPECIALS.frost.release)
    expect(state.units[1].specialRootUntil).toBeDefined()
    step(state, 1 / 60)
    const until = state.units[1].specialRootUntil
    expect(until).toBeCloseTo(SPECIALS.frost.release + SPECIALS.frost.duration + SPECIALS.frost.root)
    for (let tick = 0; tick < 120; tick++) step(state, 1 / 60)
    expect(state.units[1].specialRootUntil).toBe(until)
  })
  it('enforces the 59.999/60 boundary independently for each individual', () => {
    const { state } = fixture()
    expect(castSpecial(state, 1, { x: 300, y: 300 })).toBe(true)
    expect(castSpecial(state, 1, { x: 300, y: 300 })).toBe(false)
    expect(specialReady(state, 3)).toBe(true)
    step(state, 59.999)
    expect(specialReady(state, 1)).toBe(false)
    step(state, 0.001)
    expect(specialReady(state, 1)).toBe(true)
    expect(state.units[0].specialCooldown).toBe(0)
  })
  it('does not spend on nonfinite, off-field, out-of-range, dead or wrong-phase casts', () => {
    const { state } = fixture()
    expect(castSpecial(state, 1, null as never)).toBe(false)
    expect(castSpecial(state, 1, undefined as never)).toBe(false)
    for (const point of [
      { x: NaN, y: 300 },
      { x: -1, y: 300 },
      { x: 1000, y: 300 }
    ])
      expect(castSpecial(state, 1, point)).toBe(false)
    for (const phase of ['preparation', 'cleared', 'defeat', 'victory'] as const) {
      state.phase = phase
      expect(castSpecial(state, 1, { x: 300, y: 300 })).toBe(false)
    }
    state.phase = 'assault'
    state.units[0].hp = 0
    expect(castSpecial(state, 1, { x: 300, y: 300 })).toBe(false)
    expect(state.units[0].specialCooldown).toBeUndefined()
  })
  it('keeps a field alive after its caster dies and stops at its exact end', () => {
    const { state } = fixture('healer')
    castSpecial(state, 1, { x: 300, y: 300 })
    step(state, SPECIALS.healer.release + 0.001)
    state.units[0].hp = 0
    expect(step(state, 7.998).healing.get(3)).toBeCloseTo(47.988)
    expect(step(state, 0.002).healing.get(3)).toBeCloseTo(0.006)
    expect(state.specialEffects).toEqual([])
    expect(step(state, 1).healing.size).toBe(0)
  })
  it('cancels an uncommitted windup on death and preserves its spent cooldown', () => {
    const { state } = fixture('mage')
    castSpecial(state, 1, { x: 300, y: 300 })
    state.units[0].hp = 0
    expect(step(state, 0.5).damage.size).toBe(0)
    expect(state.specialEffects).toEqual([])
    expect(state.units[0].specialCooldown).toBe(59.5)
    expect(state.units[0].specialCast).toBeUndefined()
  })
  it('suppresses the normal action during the dedicated special motion', () => {
    const { engine } = fixture()
    engine.startAssault()
    const unit = engine.state.units[0]
    engine.castSpecial(unit.id, unit)
    for (let tick = 0; tick < 60; tick++) engine.update(1 / 60)
    expect(
      engine.state.attacks.filter((action) => action.attackerId === unit.id && action.status !== 'cancelled')
    ).toEqual([])
    expect(unit.moving).toBe(false)
  })
  for (const type of ALLY_TYPES)
    it(`round-trips ${type} during its committed effect`, () => {
      const save = freshSave()
      if (!['soldier', 'archer', 'runner', 'tank'].includes(type)) save.purchased.push(type)
      const engine = new GameEngine(idle, save, 'meadow', 42, () => 0)
      expect(engine.place(type, FIELDS.meadow.slots[0].id)).toBe(true)
      engine.startAssault()
      const unit = engine.state.units[0]
      expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime' })).toBe(true)
      const enemy = engine.state.units.find((unit) => unit.owner === 'ai')!
      expect(engine.castSpecial(unit.id, { x: (unit.x + enemy.x) / 2, y: (unit.y + enemy.y) / 2 })).toBe(true)
      for (let tick = 0; tick < Math.ceil((SPECIALS[type].release + 0.05) * 60); tick++) engine.update(1 / 60)
      const checkpoint = engine.exportCheckpoint()
      expect(checkpoint).not.toBeNull()
      const restored = GameEngine.fromCheckpoint(checkpoint!, idle, save, () => 0)!
      expect(restored).not.toBeNull()
      expect(restored.state.specialEffects).toEqual(engine.state.specialEffects)
      expect(restored.state.units).toEqual(engine.state.units)
    })
  it('preserves a completed normal hit when casting during its recovery', () => {
    const save = freshSave()
    save.purchased.push('frost')
    const engine = new GameEngine(idle, save, 'meadow', 42, () => 0)
    expect(engine.place('frost', FIELDS.meadow.slots[0].id)).toBe(true)
    engine.startAssault()
    const unit = engine.state.units[0]
    expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime' })).toBe(true)
    for (
      let tick = 0;
      tick < 600 && !engine.state.attacks.some((action) => action.attackerId === unit.id && action.status === 'hit');
      tick++
    )
      engine.update(1 / 60)
    const hit = engine.state.attacks.find((action) => action.attackerId === unit.id && action.status === 'hit')!
    expect(hit).toBeDefined()
    expect(hit.endsAt).toBeGreaterThan(engine.state.time)
    expect(engine.exportCheckpoint()).not.toBeNull()
    expect(engine.castSpecial(unit.id, unit)).toBe(true)
    expect(hit.status).toBe('hit')
    const checkpoint = engine.exportCheckpoint()
    expect(checkpoint).not.toBeNull()
    expect(GameEngine.fromCheckpoint(checkpoint!, idle, save, () => 0)).not.toBeNull()
  })
  it('retains the remaining cooldown when the stage clock resets', () => {
    const { engine } = fixture()
    engine.startAssault()
    engine.castSpecial(engine.state.units[0].id, engine.state.units[0])
    engine.state.enemiesSpawned = engine.state.enemiesResolved = stageRules(1).enemyCount
    engine.update(1 / 60)
    expect(engine.state.phase).toBe('cleared')
    const remaining = engine.state.units[0].specialCooldown
    expect(engine.nextStage()).toBe(true)
    expect(engine.state.time).toBe(0)
    expect(engine.state.units[0].specialCooldown).toBe(remaining)
    expect(engine.state.specialEffects).toBeUndefined()
    expect(engine.state.units[0].specialCast).toBeUndefined()
  })
  it('migrates v17 as initially ready and rejects malformed special state', () => {
    const { engine, save } = fixture()
    const exported = engine.exportCheckpoint()!,
      legacy = { ...exported, version: 17, state: { ...exported.state, waveBossPolicy: 2 as const } }
    const restored = GameEngine.fromCheckpoint(legacy, idle, save, () => 0)!
    expect(restored).not.toBeNull()
    restored.startAssault()
    const unit = restored.state.units[0]
    expect(restored.castSpecial(unit.id, unit)).toBe(true)
    const checkpoint = restored.exportCheckpoint()!
    const badCooldown = structuredClone(checkpoint)
    badCooldown.state.units[0].specialCooldown = 60.001
    expect(GameEngine.fromCheckpoint(badCooldown, idle, save, () => 0)).toBeNull()
    const badRelease = structuredClone(checkpoint)
    badRelease.state.specialEffects![0].releaseAt += 0.1
    expect(GameEngine.fromCheckpoint(badRelease, idle, save, () => 0)).toBeNull()
    const duplicate = structuredClone(checkpoint)
    duplicate.state.specialEffects!.push(structuredClone(duplicate.state.specialEffects![0]))
    expect(GameEngine.fromCheckpoint(duplicate, idle, save, () => 0)).toBeNull()
    restored.update(0.25, () => false)
    expect(unit.specialCooldown).toBe(60)
  })
  it('round-trips active fields and cooldowns and does not tick preparation', () => {
    const { engine, save } = fixture()
    engine.startAssault()
    const unit = engine.state.units[0]
    expect(engine.castSpecial(unit.id, { x: unit.x, y: unit.y })).toBe(true)
    const checkpoint = engine.exportCheckpoint()
    expect(checkpoint).not.toBeNull()
    const restored = GameEngine.fromCheckpoint(checkpoint!, idle, save, () => 0)!
    expect(restored).not.toBeNull()
    expect(restored.state.specialEffects).toEqual(engine.state.specialEffects)
    expect(restored.state.units[0].specialCooldown).toBe(60)
    restored.state.phase = 'preparation'
    restored.update(0.25)
    expect(restored.state.units[0].specialCooldown).toBe(60)
    expect(restored.state.time).toBe(0)
  })
})
