import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ATTACK_PROFILES } from '../tower_diffence_with_jev/src/game/AttackProfiles.ts'
import { attackSeconds } from './animation.js'
import { TYPES } from './simulation.js'

test('3D attack clip shows its authored contact on the simulation hit, then winds up into the next one', () => {
  for (const t of TYPES) {
    const { cueMs, durationMs } = ATTACK_PROFILES[t.role]
    assert.ok(durationMs / 1000 <= t.period, t.role)
    assert.equal(attackSeconds(t.role, 0, t.period), cueMs / 1000)
    assert.ok(attackSeconds(t.role, t.period * 0.999, t.period) < cueMs / 1000)
    assert.ok(attackSeconds(t.role, t.period * 0.999, t.period) > 0)
    for (let phase = 0; phase < t.period; phase += 0.01)
      assert.ok(attackSeconds(t.role, phase, t.period) <= durationMs / 1000)
  }
})
