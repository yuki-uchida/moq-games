import { describe, expect, it } from 'vitest'
import { FIELDS, initialState, type AllyType } from '../src/game/model'
import { GameEngine } from '../src/game/GameEngine'
import { freshSave } from '../src/progression/UpgradeSystem'
import { castSpecial, SPECIALS } from '../src/game/SpecialAbilities'
import { bestSpecialTarget, bossInSpecialArea, autoShouldCast, AUTO_HOLD_SECONDS } from '../src/game/SpecialTargeting'
const idle = { decide: async () => null }
function fixture(type: AllyType = 'soldier') {
  const engine = new GameEngine(idle, freshSave(), 'meadow', 42, () => 0)
  expect(engine.place('soldier', FIELDS.meadow.slots[0].id)).toBe(true)
  const base = engine.state.units[0],
    state = initialState()
  state.phase = 'assault'
  state.units = [{ ...base, id: 1, type, hp: 100, maxHp: 100, x: 300, y: 300 }]
  const enemy = (id: number, x: number, y: number, extra: object = {}) =>
    state.units.push({ ...base, id, owner: 'ai', type: 'slime', hp: 100, maxHp: 100, x, y, boss: false, progress: 0, ...extra })
  return { state, enemy }
}
describe('bestSpecialTarget', () => {
  it('prefers the densest cluster inside range', () => {
    const { state, enemy } = fixture('soldier')
    enemy(2, 380, 300)
    enemy(3, 420, 300) // cluster of 2 only reachable at x<=450 (range 150)
    enemy(4, 300, 200) // lone
    const t = bestSpecialTarget(state, 1)!
    expect(t.score).toBe(2)
    expect(t.point.x).toBeGreaterThanOrEqual(380)
  })
  it('weights a boss as 3', () => {
    const { state, enemy } = fixture('soldier')
    enemy(2, 380, 300)
    enemy(3, 400, 300)
    enemy(4, 300, 200, { boss: true })
    const t = bestSpecialTarget(state, 1)!
    expect(t).toMatchObject({ score: 3, point: { x: 300, y: 200 } })
    expect(bossInSpecialArea(state, 'soldier', t.point)).toBe(true)
  })
  it('breaks ties toward the enemy closest to the gate', () => {
    const { state, enemy } = fixture('soldier')
    enemy(2, 300, 200, { progress: 10 })
    enemy(3, 300, 400, { progress: 90 })
    expect(bestSpecialTarget(state, 1)!.point).toEqual({ x: 300, y: 400 })
  })
  it('ignores enemies beyond the caster range, even if a cluster sits there', () => {
    const { state, enemy } = fixture('soldier')
    enemy(2, 300 + SPECIALS.soldier.range + 20, 300)
    enemy(3, 300 + SPECIALS.soldier.range + 30, 300)
    expect(bestSpecialTarget(state, 1)).toBeNull()
  })
  it('counts an out-of-range enemy when the circle centered on an in-range one reaches it', () => {
    const { state, enemy } = fixture('soldier')
    enemy(2, 440, 300) // in range (140)
    enemy(3, 520, 300) // out of range (220) but 80 from enemy 2, radius 95
    expect(bestSpecialTarget(state, 1)).toMatchObject({ score: 2, point: { x: 440, y: 300 } })
  })
  it('follows the airborne rules', () => {
    const { state, enemy } = fixture('soldier')
    state.battlefieldVersion = 2
    enemy(2, 350, 300, { type: 'bat' })
    expect(bestSpecialTarget(state, 1)).toBeNull()
    const archer = fixture('archer')
    archer.state.battlefieldVersion = 2
    archer.enemy(2, 350, 300, { type: 'bat' })
    expect(bestSpecialTarget(archer.state, 1)!.score).toBe(1)
  })
  it('ignores dead enemies and returns null with no enemies', () => {
    const { state, enemy } = fixture('mage')
    expect(bestSpecialTarget(state, 1)).toBeNull()
    enemy(2, 350, 300, { hp: 0 })
    expect(bestSpecialTarget(state, 1)).toBeNull()
  })
  it('returns null when the special is not ready', () => {
    const { state, enemy } = fixture('soldier')
    enemy(2, 350, 300)
    expect(bestSpecialTarget(state, 1)).not.toBeNull()
    castSpecial(state, 1, { x: 350, y: 300 })
    expect(bestSpecialTarget(state, 1)).toBeNull()
    state.phase = 'preparation'
    expect(bestSpecialTarget(state, 99)).toBeNull()
  })
  it('healer needs enough missing HP among allies', () => {
    const { state } = fixture('healer')
    const ally = (id: number, x: number, hp: number) =>
      state.units.push({ ...state.units[0], id, x, y: 300, hp, maxHp: 100 })
    ally(2, 340, 95)
    expect(bestSpecialTarget(state, 1)).toBeNull()
    ally(3, 360, 80)
    const t = bestSpecialTarget(state, 1)!
    expect(t.score).toBeCloseTo(0.25)
    expect(t.point.x).toBeGreaterThanOrEqual(300)
  })
})

describe('AUTO cast rule', () => {
  it('waits for a cluster, a boss or a hurt team, but never hoards a ready special', () => {
    expect(autoShouldCast('cannon', 2, false, 0)).toBe(true)
    expect(autoShouldCast('cannon', 1, true, 0)).toBe(true)
    expect(autoShouldCast('cannon', 1, false, 0)).toBe(false)
    expect(autoShouldCast('cannon', 1, false, AUTO_HOLD_SECONDS - 0.1)).toBe(false)
    expect(autoShouldCast('cannon', 1, false, AUTO_HOLD_SECONDS)).toBe(true)
    expect(autoShouldCast('cannon', 0, false, 99)).toBe(false)
    expect(autoShouldCast('healer', 0.2, false, 0)).toBe(true)
  })
})
