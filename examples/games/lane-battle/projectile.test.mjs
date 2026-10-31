import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGame, summon, step } from './simulation.js'
function scene() {
  const s = createGame()
  s.spawn = 999
  summon(s, 1)
  summon(s, 0, -1)
  const [archer, target] = s.units
  archer.x = 400
  target.x = 500
  target.attack = 999
  target.speed = 0
  return { s, archer, target }
}
test('ranged damage and death happen at arrow arrival, never at release', () => {
  const { s, archer, target } = scene()
  target.hp = archer.damage
  step(s, 0.01)
  const effect = s.effects[0]
  assert.equal(target.hp, archer.damage)
  assert.equal(s.projectiles.length, 1)
  assert.equal(effect.arrived, undefined)
  const at = s.projectiles[0].at
  step(s, at - s.time - 0.001)
  assert.ok(s.units.includes(target))
  assert.equal(s.kills, 0)
  step(s, 0.002)
  assert.equal(effect.arrived, true)
  assert.equal(effect.missed, false)
  assert.equal(s.units.includes(target), false)
  assert.equal(s.kills, 1)
  assert.equal(s.projectiles.length, 0)
})
test('an already dead recipient is not retargeted or rewarded twice', () => {
  const { s, target } = scene()
  summon(s, 0, -1)
  const other = s.units[2]
  other.x = 510
  step(s, 0.01)
  const otherHp = other.hp
  target.hp = 0
  step(s, 0.01)
  assert.equal(s.kills, 1)
  step(s, 0.12)
  assert.equal(other.hp, otherHp)
  assert.equal(s.kills, 1)
  assert.equal(s.effects.find((e) => e.ranged)?.missed, true)
})
test('released arrows survive shooter death and follow a moving original recipient', () => {
  const { s, archer, target } = scene()
  step(s, 0.01)
  const hp = target.hp
  archer.hp = 0
  target.x = 520
  step(s, 0.12)
  assert.equal(target.hp, hp - archer.damage)
  assert.equal(s.effects.find((e) => e.ranged)?.x, 520)
})
test('fort victory/defeat waits for impact and terminal state cannot apply more arrows', () => {
  for (const side of [1, -1]) {
    const s = createGame()
    s.spawn = 999
    summon(s, 1, side)
    const archer = s.units[0]
    archer.x = side === 1 ? 900 : 100
    s[side === 1 ? 'enemy' : 'home'] = archer.damage
    step(s, 0.01)
    assert.equal(s.result, null)
    assert.equal(s[side === 1 ? 'enemy' : 'home'], archer.damage)
    step(s, 0.12)
    assert.equal(s.result, side === 1 ? 'victory' : 'defeat')
    const frozen = structuredClone(s)
    step(s, 1)
    assert.deepEqual(s, frozen)
  }
})
