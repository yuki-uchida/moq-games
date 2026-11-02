import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusBadges } from './visual-effects.js'
import { burst, createGame, summon } from './simulation.js'

test('status badges follow priority, expiry and the three-badge limit', () => {
  const unit = {
    control: { kind: 'freeze', end: 2 },
    poison: [{ end: 3 }, { end: 1 }],
    burn: { end: 3 },
    curry: { end: 3 },
    slow: { end: 3 }
  }
  assert.deepEqual(statusBadges(unit, 1), ['freeze', 'poison', 'burn'])
  assert.deepEqual(statusBadges(unit, 2), ['poison', 'burn', 'curry'])
  assert.deepEqual(statusBadges(unit, 3), [])
})

test('displacement records its visual offset without changing the push distance', () => {
  const game = createGame()
  summon(game, 0, -1)
  const unit = game.units[0]
  unit.x = 700
  burst(game)
  assert.equal(unit.x, 615)
  assert.deepEqual(unit.slide, { at: 0, offset: 85 })
})
