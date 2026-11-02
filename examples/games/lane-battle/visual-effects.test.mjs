import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeVictims, IMPACT_STYLES, statusBadges, HURT_VFX, DEATH_VFX } from './visual-effects.js'
import { burst, createGame, ENEMIES, POOPS, SPECIALS, summon } from './simulation.js'

test('each unit has independent hurt and death effect hooks', () => {
  const keys = [...POOPS, ...SPECIALS, ...ENEMIES].map((unit) => unit.key).sort()
  for (const table of [HURT_VFX, DEATH_VFX]) {
    assert.deepEqual(Object.keys(table).sort(), keys)
    for (const key of keys) assert.equal(typeof table[key], 'function')
  }
})

test('missed victims do not show an impact', () => {
  assert.deepEqual(activeVictims({ victims: [{ id: 1, at: 1, missed: true }] }, [{ id: 1 }], 1.05), [])
})

test('every unit has an impact style and victims appear at their own hit time', () => {
  assert.deepEqual(
    Object.keys(IMPACT_STYLES).sort(),
    [...POOPS, ...SPECIALS, ...ENEMIES].map((unit) => unit.key).sort()
  )
  const effect = {
    victims: [
      { id: 1, at: 1 },
      { id: 2, at: 1.1 }
    ]
  }
  const units = [{ id: 1 }, { id: 2 }]
  assert.deepEqual(activeVictims(effect, units, 0.99), [])
  assert.deepEqual(
    activeVictims(effect, units, 1.05).map((victim) => victim.id),
    [1]
  )
  assert.deepEqual(
    activeVictims(effect, units, 1.11).map((victim) => victim.id),
    [1, 2]
  )
  assert.deepEqual(
    activeVictims(effect, units, 1.23).map((victim) => victim.id),
    [2]
  )
})

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
