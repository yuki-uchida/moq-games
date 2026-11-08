import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAttract,
  stepAttract,
  attractFormation,
  ID_BASE,
  MAX_DT,
  ROUND_SECONDS,
  HOLD_SECONDS,
  FIRST_FORMATION
} from './attract.js'
import { MAX_UNITS, SPECIALS } from './simulation.js'

const run = (a, seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) stepAttract(a, dt)
}
const fingerprint = (a) =>
  JSON.stringify([
    a.round,
    a.state.time,
    a.state.gold,
    a.state.home,
    a.state.enemy,
    a.state.units.map((u) => [u.id, u.key, u.x, u.hp])
  ])

test('the first round is fixed: same formation, same stage and a repeatable battle', () => {
  const one = createAttract(0)
  const two = createAttract(0)
  assert.deepEqual(
    one.state.deck.map((d) => d.key),
    FIRST_FORMATION
  )
  assert.equal(one.state.stage, 0)
  run(one, 40)
  run(two, 40)
  assert.equal(fingerprint(one), fingerprint(two))
})

test('the demo never uses ambient randomness, storage or timers', () => {
  const random = Math.random
  Math.random = () => assert.fail('Math.random')
  globalThis.localStorage = globalThis.sessionStorage = new Proxy(
    {},
    { get: () => assert.fail('storage'), set: () => assert.fail('storage') }
  )
  try {
    const a = createAttract(0)
    run(a, ROUND_SECONDS + 10)
    assert.ok(a.generation >= 1)
  } finally {
    Math.random = random
    delete globalThis.localStorage
    delete globalThis.sessionStorage
  }
})

test('its units live in their own id range so they never share model actors with a real battle', () => {
  const a = createAttract(0)
  run(a, 30)
  assert.ok(a.state.units.length > 0)
  assert.ok(a.state.units.every((u) => u.id > ID_BASE))
})

test('the first round plays like a competent player: a varied army, a front line first, a win', () => {
  const a = createAttract(0)
  run(a, 60)
  const used = a.state.summons.filter((count) => count > 0).length
  assert.ok(used >= 5, `only ${used} different cards summoned in 60 s`)
  assert.ok(a.state.units.filter((u) => u.side === 1).length <= MAX_UNITS)
  const first = a.state.units.find((u) => u.side === 1)
  assert.ok(first)
  for (let t = 0; t < ROUND_SECONDS && !a.state.result && !a.generation; t += 1 / 60) stepAttract(a, 1 / 60)
  assert.ok(a.generation === 1 || a.state.result, 'the battle ends or restarts within the time limit')
})

test('the demo restarts after a fort falls and after the time limit, with a fresh state', () => {
  const a = createAttract(0)
  a.state.enemy = 0
  a.state.result = 'victory'
  const before = a.state
  stepAttract(a, 0.05)
  assert.equal(a.generation, 0, 'the result is held for a moment first')
  run(a, HOLD_SECONDS)
  assert.equal(a.generation, 1)
  assert.notEqual(a.state, before)
  assert.ok(a.state.time < 0.5, 'a fresh battle')
  assert.equal(a.round, 1)
  stepAttract(a, 1 / 60)
  a.state.tickOrigin = ROUND_SECONDS
  stepAttract(a, 1 / 60)
  assert.equal(a.generation, 2)
})

test('later rounds vary the formation but always lead with a cheap poop and include specials', () => {
  const seen = new Set()
  for (let round = 1; round <= 12; round++) {
    const keys = attractFormation(round)
    assert.equal(keys.length, 6)
    assert.equal(new Set(keys).size, 6)
    assert.equal(keys[0], 'katachi')
    assert.ok(keys.filter((k) => SPECIALS.some((s) => s.key === k)).length >= 2)
    seen.add(keys.join())
  }
  assert.ok(seen.size > 4)
})

test('a long frame advances the demo by at most one capped step', () => {
  const a = createAttract(0)
  stepAttract(a, 30)
  assert.ok(a.state.time <= MAX_DT + 1 / 60)
  stepAttract(a, -5)
  assert.ok(a.state.time <= MAX_DT + 1 / 60)
})
