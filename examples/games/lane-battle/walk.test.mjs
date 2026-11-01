import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGame, step, summon } from './simulation.js'

test('walk distance follows movement and stays fixed while attacking', () => {
  const game = createGame()
  summon(game, 0)
  const unit = game.units[0]
  const start = unit.x
  step(game, 0.1)
  assert.ok(Math.abs(unit.walkDistance - (unit.x - start)) < 1e-9)
  unit.x = 920
  const distance = unit.walkDistance
  step(game, 0.1)
  assert.equal(unit.motion, 'attack')
  assert.equal(unit.walkDistance, distance)
})
