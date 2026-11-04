import { test } from 'node:test'
import assert from 'node:assert/strict'
import { realisticBarFailures } from './realistic-bars.mjs'

test('late-game bars require a representative baseline and a relative floor', () => {
  const rows = (baseline, wins, summons = 1, blocks = [wins]) => [
    { wins: baseline },
    { name: 'special', wins, summons, blocks }
  ]
  assert.equal(realisticBarFailures(22, 'keep', rows(19, 19), 40).length, 1)
  assert.equal(realisticBarFailures(22, 'keep', rows(20, 14), 40).length, 1)
  assert.deepEqual(realisticBarFailures(22, 'keep', rows(20, 15), 40), [])
  assert.equal(realisticBarFailures(22, 'keep', rows(20, 15, 0), 40).length, 1)
  assert.equal(realisticBarFailures(22, 'casual', rows(152, 144, 0, [36, 36, 39, 33]), 160).length, 1)
})
