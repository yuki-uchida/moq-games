import { expect, test } from 'vitest'
import { defeatAdvice, defeatTip } from '../src/ui/ResultCard'
import { AIRBORNE_ENEMIES } from '../src/game/model'

const ground = { type: 'slime' as const, boss: false }
test('defeat advice priority: boss, flier, unspent gold, rotating tip', () => {
  const flier = { type: [...AIRBORNE_ENEMIES][0], boss: false }
  expect(defeatAdvice(3, [ground, flier, { ...ground, boss: true }], 100)).toContain('ボス')
  expect(defeatAdvice(3, [ground, flier], 100)).toContain('空の敵')
  expect(defeatAdvice(3, [ground], 60)).toContain('60G')
  expect(defeatAdvice(3, [ground], 59)).toBe(defeatTip(3))
  expect(defeatAdvice(3, [], 0)).toBe(defeatTip(3))
})
