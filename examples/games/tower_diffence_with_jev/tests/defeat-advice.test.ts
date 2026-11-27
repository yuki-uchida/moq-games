import { expect, test } from 'vitest'
import { defeatAdvice, defeatTip } from '../src/ui/ResultCard'
import { AIRBORNE_ENEMIES } from '../src/game/model'

const ground = { type: 'slime' as const, boss: false }
test('defeat advice priority: boss, flier, unspent gold, rotating tip', () => {
  const flier = { type: [...AIRBORNE_ENEMIES][0], boss: false }
  expect(defeatAdvice(3, [ground, flier, { ...ground, boss: true }], 100)).toContain('ボス')
  expect(defeatAdvice(3, [ground, flier], 100)).toContain('空の敵')
  expect(defeatAdvice(3, [ground], 60)).toContain('60G')
  // Unspent gold points at the on-field ↑ badge, which also works while a wave is on.
  expect(defeatAdvice(3, [ground], 60)).toContain('↑')
  expect(defeatAdvice(3, [ground, { ...ground, boss: true }], 0)).toContain('AUTO')
  expect(defeatAdvice(3, [ground], 59)).toBe(defeatTip(3))
  expect(defeatAdvice(3, [], 0)).toBe(defeatTip(3))
})
test('a 総力戦 defeat with an affordable missing ally points to recruiting first', () => {
  expect(defeatAdvice(10, [{ ...ground, boss: true }], 100, '光の守護者')).toBe(
    'コインで光の守護者を招集しよう（総力戦は仲間全員で出撃）'
  )
})
test('the rotating tips each name a lever, not a convenience', () => {
  const tips = Array.from({ length: 5 }, (_, i) => defeatTip(i + 1))
  expect(new Set(tips).size).toBe(5)
  for (const lever of ['↑', '曲がり角', 'AUTO', '門', '盾の騎士'])
    expect(tips.some((tip) => tip.includes(lever))).toBe(true)
  expect(tips.some((tip) => tip.includes('×2速'))).toBe(false)
})
