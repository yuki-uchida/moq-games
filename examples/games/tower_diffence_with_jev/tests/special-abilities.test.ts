import { describe, expect, it } from 'vitest'
import { ALLY_TYPES, FIELDS, initialState, stageRules, type AllyType } from '../src/game/model'
import { GameEngine } from '../src/game/GameEngine'
import { freshSave } from '../src/progression/UpgradeSystem'
import { advanceSpecials, castSpecial, SPECIALS, specialReady } from '../src/game/SpecialAbilities'
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
    const legacy = { ...engine.exportCheckpoint()!, version: 17 }
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
