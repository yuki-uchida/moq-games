import { test } from 'node:test'
import assert from 'node:assert/strict'
import { beats, timing, flinch, knockout, KO_SECONDS } from './animation.js'
import { POOPS, SPECIALS, ENEMIES, card, createGame, summon, step } from './simulation.js'
const TYPES = [...POOPS, ...SPECIALS, ...ENEMIES]

test('each unit keeps its scheduled cycle until the next contact', () => {
  for (const type of TYPES) {
    const isEnemy = ENEMIES.includes(type)
    const game = createGame(0, [card({ uid: 1, key: isEnemy ? 'katachi' : type.key })])
    game.gold = 999
    game.spawn = 999
    game.opened = true
    game.rushes = 4
    game.turret = 999
    summon(game, isEnemy ? ENEMIES.indexOf(type) : 0, isEnemy ? -1 : 1)
    summon(game, 0, isEnemy ? 1 : -1)
    const [unit, target] = game.units
    unit.x = 500
    target.x = 500 + (isEnemy ? 10 : -10)
    target.speed = 0
    target.attack = 999
    target.hp = target.maxHp = 1e9
    step(game, 0.001)
    const cycle = unit.cycle
    assert.equal(cycle, unit.period * (type.rallyEffect ? 0.8 : 1), type.key)
    assert.equal(beats(unit.motion, unit.phase, unit.cycle).hit, 1, type.key)
    unit.period *= 0.8
    step(game, cycle / 2)
    assert.equal(unit.cycle, cycle, type.key)
    step(game, cycle / 2)
    const expected = (unit.period * (type.rallyEffect ? 0.8 : 1)) / (type.caffeine ? 1.08 : 1)
    assert.equal(unit.cycle, expected, type.key)
    assert.equal(beats(unit.motion, unit.phase, unit.cycle).hit, 1, type.key)
  }
})

test('contact is held on the simulation hit; wind-up comes before it and recovery after', () => {
  for (const t of TYPES) {
    const { anticipation, strike, recovery } = timing(t.period)
    assert.ok(anticipation + recovery < t.period, `${t.key}: phases overlap`)
    const hit = beats('attack', 0, t.period)
    assert.equal(hit.hit, 1)
    assert.equal(hit.wind, 0)
    for (let phase = 0.005; phase < t.period; phase += 0.005) {
      const b = beats('attack', phase, t.period)
      assert.ok(b.hit <= 1 && b.wind <= 1, `${t.key} ${phase}`)
      const until = t.period - phase
      // Anticipation gathers slowly, then the strike snaps through in its last few frames.
      if (until > strike && until < anticipation) assert.ok(b.wind > 0 && b.hit === 0, `${t.key} wind ${phase}`)
      if (phase > recovery && until > anticipation) assert.deepEqual([b.wind, b.hit], [0, 0], `${t.key} rest ${phase}`)
    }
    const late = beats('attack', t.period - strike * 0.25, t.period)
    assert.ok(late.hit > 0.5 && late.wind < 0.3, `${t.key}: the strike is fast`)
  }
})

test('a walking unit winds up its first strike as it closes in', () => {
  assert.deepEqual([beats('walk', 3, 1).wind, beats('walk', 3, 1).hit], [0, 0])
  assert.ok(beats('walk', 3, 1.2, 0.2).wind > 0.3)
  assert.ok(beats('walk', 3, 1.2, 0.01).hit > 0.5)
})

test('hit reactions jolt at once, scale with power and settle within half a second', () => {
  assert.equal(flinch(0, 1).jolt, 1)
  assert.ok(flinch(0, 1.5).jolt > flinch(0, 0.8).jolt)
  assert.equal(flinch(0, 1).flash, 1)
  assert.equal(flinch(0.2, 1).flash, 0)
  assert.ok(Math.abs(flinch(0.45, 1).jolt) < 0.01 && Math.abs(flinch(0.45, 1).wobble) < 0.1)
  assert.deepEqual(flinch(-1, 1), { jolt: 0, wobble: 0, flash: 0, face: false })
})

test('a knocked-out unit tips over and is gone by KO_SECONDS', () => {
  let tilt = -1
  for (let age = 0; age <= KO_SECONDS; age += 0.02) {
    const k = knockout(age)
    assert.ok(k.tilt >= tilt)
    tilt = k.tilt
  }
  assert.equal(knockout(0).fade, 1)
  assert.ok(knockout(KO_SECONDS).fade <= 0.001)
})
