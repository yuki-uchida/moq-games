import test from 'node:test'
import assert from 'node:assert/strict'
import { BattleClock } from './clock.js'
import { createGame, step } from './simulation.js'
test('elapsed time survives suspension in bounded batches without losing debt', () => {
  const clock = new BattleClock()
  clock.reset(0)
  let total = 0
  const update = (dt) => {
    assert.ok(dt <= 0.05)
    total += dt
  }
  assert.equal(clock.advance(10000, true, update).pending, false)
  assert.ok(Math.abs(total - 10) < 1e-8)
  clock.advance(10000, true, update)
  assert.ok(Math.abs(total - 10) < 1e-8)
  assert.equal(clock.advance(70000, true, update).pending, true)
  assert.ok(Math.abs(total - 40) < 1e-8)
  assert.equal(clock.advance(70000, true, update).pending, false)
  assert.ok(Math.abs(total - 70) < 1e-8)
  clock.advance(3601000, false, update)
  clock.advance(3602000, true, update)
  assert.ok(Math.abs(total - 71) < 1e-8)
})
test('paused clock drops debt, reset protects a new stage, result stops catch-up', () => {
  const clock = new BattleClock(),
    game = createGame()
  clock.reset(0)
  clock.advance(10000, false, (dt) => step(game, dt))
  assert.equal(game.time, 0)
  clock.reset(20000)
  clock.advance(20000, true, (dt) => step(game, dt))
  assert.equal(game.time, 0)
  let calls = 0
  clock.advance(
    30000,
    true,
    () => {
      calls++
      game.result = 'victory'
    },
    () => !!game.result
  )
  assert.equal(calls, 1)
})

test('an older queued rAF timestamp cannot rewind the shared clock', () => {
  const clock = new BattleClock()
  clock.reset(1000)
  let total = 0
  const update = (dt) => {
    total += dt
  }
  clock.advance(900, true, update)
  clock.advance(2000, true, update)
  assert.ok(Math.abs(total - 1) < 1e-8)
})

test('a long suspension reaches the same result as uninterrupted fixed-step play', () => {
  const uninterrupted = createGame(),
    resumed = createGame(),
    clock = new BattleClock()
  while (!uninterrupted.result) step(uninterrupted, 0.05)
  clock.reset(0)
  let result = clock.advance(
    3600000,
    true,
    (dt) => step(resumed, dt),
    () => !!resumed.result
  )
  while (result.pending)
    result = clock.advance(
      3600000,
      true,
      (dt) => step(resumed, dt),
      () => !!resumed.result
    )
  assert.equal(resumed.result, uninterrupted.result)
  assert.ok(Math.abs(resumed.time - uninterrupted.time) < 1e-8)
  assert.equal(resumed.home, uninterrupted.home)
  assert.equal(resumed.enemy, uninterrupted.enemy)
  assert.equal(resumed.kills, uninterrupted.kills)
  assert.ok(Math.abs(resumed.gold - uninterrupted.gold) < 1e-8)
})
