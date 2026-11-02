import { describe, expect, it } from 'vitest'
import {
  AmountAggregator,
  ComboTracker,
  bountyFor,
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

  it('chains kills within 1.6s and restarts after a gap', () => {
    const combo = new ComboTracker()
    expect(combo.hit(0)).toBe(1)
    expect(combo.hit(1500)).toBe(2)
    expect(combo.hit(3000)).toBe(3)
    expect(combo.hit(4700)).toBe(1)
    combo.reset()
    expect(combo.hit(4800)).toBe(1)
  })
})
