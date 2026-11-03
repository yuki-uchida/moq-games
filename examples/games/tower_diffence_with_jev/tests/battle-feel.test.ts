import { describe, expect, it } from 'vitest'
import {
  AmountAggregator,
  BattleSpecialCounter,
  ComboTracker,
  comboLabel,
  bountyFor,
  castleReachers,
  isHeavyHit,
  shakeAmplitude
} from '../src/ui/BattleFeelLogic'
import { DEFINITIONS, ENEMY_TYPES } from '../src/game/model'

describe('battle feel logic', () => {
  it('pays the unit cost plus 10 for a boss', () => {
    const type = ENEMY_TYPES[0]
    expect(bountyFor(type, false)).toBe(DEFINITIONS[type].cost)
    expect(bountyFor(type, true)).toBe(DEFINITIONS[type].cost + 10)
  })

  it('treats 30% of max hp or 90 damage as a heavy hit', () => {
    expect(isHeavyHit(30, 100)).toBe(true)
    expect(isHeavyHit(29, 100)).toBe(false)
    expect(isHeavyHit(90, 1000)).toBe(true)
    expect(isHeavyHit(89, 1000)).toBe(false)
  })

  it('caps castle shake at 8px and grows with damage', () => {
    expect(shakeAmplitude(2)).toBeLessThan(shakeAmplitude(6))
    expect(shakeAmplitude(500)).toBe(8)
  })

  it('merges hits inside the window and flushes forced ids immediately', () => {
    const hits = new AmountAggregator(110)
    hits.add(1, 5, 0)
    hits.add(1, 7, 40)
    hits.add(2, 3, 50)
    expect(hits.flush(100)).toEqual([])
    expect(hits.flush(110)).toEqual([{ id: 1, amount: 12 }])
    expect(hits.flush(120, new Set([2]))).toEqual([{ id: 2, amount: 3 }])
    expect(hits.flush(1000)).toEqual([])
  })

  it('chains kills within 2s of simulation time and restarts after a gap', () => {
    const combo = new ComboTracker()
    expect(combo.hit(0)).toBe(1)
    expect(combo.hit(1900)).toBe(2)
    expect(combo.hit(3900)).toBe(3)
    expect(combo.hit(6000)).toBe(1)
    combo.reset()
    expect(combo.hit(6100)).toBe(1)
  })
  it('names double and triple kills before counting combos', () => {
    expect([2, 3, 4, 7].map(comboLabel)).toEqual(['DOUBLE!', 'TRIPLE!', '×4 COMBO!', '×7 COMBO!'])
  })
})

describe('enemies that reached the castle', () => {
  it('adds castle attackers that never left, such as a boss, and counts a gate exit once', () => {
    const exits = [{ type: 'goblin' as const, boss: false, count: 2 }]
    const attackers = new Map([
      [7, { type: 'goblin' as const, boss: false }],
      [9, { type: 'dragon' as const, boss: true }],
      [11, { type: 'goblin' as const, boss: false }]
    ])
    expect(castleReachers(exits, attackers, new Set([7]))).toEqual([
      { type: 'goblin', boss: false, count: 3 },
      { type: 'dragon', boss: true, count: 1 }
    ])
    expect(exits[0].count).toBe(2)
    expect(castleReachers([], new Map(), new Set())).toEqual([])
  })
})

describe('specials cast in this battle', () => {
  const ally = (specialSequence: number) => ({ owner: 'player' as const, specialSequence })
  const neutral = { stage: 9, spawned: 21, resolved: 21, maxProgress: 0.5, baseDamage: 0, defenderDamage: 0 }
  const played = { stage: 9, spawned: 21, resolved: 21, maxProgress: 0.93, baseDamage: 12, defenderDamage: 340 }
  it('counts every cast of a battle whose defenders were placed for it, even when resumed mid-battle', () => {
    const counter = new BattleSpecialCounter()
    expect(counter.count({ battleId: 1, stage: 10, previousStageSummary: neutral, units: [ally(2), ally(1)] } as never)).toBe(3)
    expect(counter.count({ battleId: 2, stage: 1, previousStageSummary: null, units: [ally(1)] } as never)).toBe(1)
  })
  it('leaves out casts an old expedition save carried over from earlier stages', () => {
    const counter = new BattleSpecialCounter(),
      units = [ally(25), ally(15)],
      state = { battleId: 3, stage: 10, previousStageSummary: played, units }
    expect(counter.count(state as never)).toBe(0)
    units[0].specialSequence += 2
    units[1].specialSequence += 1
    expect(counter.count(state as never)).toBe(3)
    expect(counter.count({ ...state, battleId: 4 } as never)).toBe(0)
  })
})
