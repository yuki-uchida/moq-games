import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pose } from './animation.js'
import { TYPES } from './simulation.js'

test('attack lunge peaks on the simulation hit, then winds up into the next one', () => {
  for (const t of TYPES) {
    const hit = pose('attack', 0, t.period, 0)
    for (let phase = 0.01; phase < t.period; phase += 0.01)
      assert.ok(pose('attack', phase, t.period, 0).shift < hit.shift, `${t.name} ${phase}`)
    assert.ok(pose('attack', t.period * 0.999, t.period, 0).shift < 0, 'leans back before striking')
  }
})

test('walking hops with distance and stands still while attacking', () => {
  assert.equal(pose('walk', 0, 1, 0).hop, 0)
  assert.ok(pose('walk', 0, 1, 12).hop > 0)
  assert.equal(pose('attack', 0.5, 1, 12).hop, 0)
})
