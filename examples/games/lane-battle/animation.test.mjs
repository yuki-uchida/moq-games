import { test } from 'node:test'
import assert from 'node:assert/strict'
import { beats, timing, flinch, knockout, KO_SECONDS, heldStrike } from './animation.js'
import { Actor } from './models.js'
import { POOPS, SPECIALS, ENEMIES, card, createGame, summon, step } from './simulation.js'
const TYPES = [...POOPS, ...SPECIALS, ...ENEMIES]

test('a strike keeps its original target until recovery expires or a new cycle starts', () => {
  const target = { id: 2, hp: 0 }
  const held = { target, at: 10, cycle: 0.3, strikes: 1 }
  assert.equal(heldStrike(held, { strikes: 1 }, 10.2)?.target, target)
  assert.equal(heldStrike(held, { strikes: 1 }, 10.3), null)
  assert.equal(heldStrike(held, { strikes: 2 }, 10.1), null)
  assert.equal(heldStrike({ ...held, cycle: 1 }, { strikes: 1 }, 10.5), null)
  assert.equal(heldStrike(held, { strikes: 1 }, 9.9), null)
})
const TEMPOS = {
  katachi: [0.4, 0.035],
  korokoro: [0.45, 0.03],
  geri: [0.36, 0.04],
  bichi: [0.48, 0.03],
  dodeka: [0.5, 0.06],
  daiou: [0.55, 0.07],
  aircon: [0.45, 0.04],
  ramen: [0.4, 0.04],
  yofukashi: [0.24, 0.025],
  sake: [0.45, 0.04],
  jiro: [0.6, 0.07],
  yakiniku: [0.42, 0.04],
  garlic: [0.48, 0.03],
  curry: [0.5, 0.05],
  milk: [0.42, 0.04],
  oyster: [0.6, 0.06],
  ice: [0.4, 0.035],
  energy: [0.2, 0.02],
  cleaner: [0.42, 0.035],
  yogurt: [0.3, 0.03],
  sayu: [0.45, 0.03],
  washiki: [0.48, 0.05],
  mop: [0.45, 0.04],
  yoshiki: [0.5, 0.05],
  seichou: [0.45, 0.03],
  geridome: [0.55, 0.06]
}

test('each unit keeps its scheduled cycle until the next contact', () => {
  for (const type of TYPES) {
    const isEnemy = ENEMIES.includes(type)
    const game = createGame(0, [card({ uid: 1, key: isEnemy ? 'katachi' : type.key })])
    game.gold = 999
    game.spawn = 999
    game.opened = 2
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
    assert.equal(unit.strikes, 1, type.key)
    assert.equal(typeof unit.lastCrit, 'boolean', type.key)
    const cycle = unit.cycle
    assert.equal(cycle, unit.period * (type.rallyEffect ? 0.8 : 1), type.key)
    assert.equal(beats(unit.motion, unit.phase, unit.cycle).hit, 1, type.key)
    unit.period *= 0.8
    step(game, cycle / 2)
    assert.equal(unit.cycle, cycle, type.key)
    step(game, cycle / 2)
    const expected = (unit.period * (type.rallyEffect ? 0.8 : 1)) / (type.caffeine ? 1.08 : 1)
    assert.equal(unit.strikes, 2, type.key)
    assert.equal(unit.cycle, expected, type.key)
    assert.equal(beats(unit.motion, unit.phase, unit.cycle).hit, 1, type.key)
  }
})

test('contact is held on the simulation hit; wind-up comes before it and recovery after', () => {
  for (const t of TYPES) {
    const actor = new Actor(t.key)
    const tempo = actor.t.recipe.tempo
    assert.deepEqual(tempo, TEMPOS[t.key], t.key)
    actor.dispose()
    for (const period of [(t.period * 0.8) / 1.4, t.period, t.period * 1.35]) {
      const { anticipation, recovery, hold } = timing(period, tempo)
      assert.equal(anticipation, Math.min(tempo[0], period * 0.55), t.key)
      assert.ok(anticipation + recovery < period, `${t.key}: phases overlap`)
      assert.ok(hold <= tempo[1] && hold < recovery, `${t.key}: invalid hold`)
      assert.equal(beats('attack', 0, period, Infinity, tempo).hit, 1, t.key)
      assert.equal(beats('attack', hold / 2, period, Infinity, tempo).hit, 1, t.key)
    }
    const { anticipation, strike, recovery } = timing(t.period, tempo)
    assert.ok(anticipation + recovery < t.period, `${t.key}: phases overlap`)
    const hit = beats('attack', 0, t.period, Infinity, tempo)
    assert.equal(hit.hit, 1)
    assert.equal(hit.wind, 0)
    for (let phase = 0.005; phase < t.period; phase += 0.005) {
      const b = beats('attack', phase, t.period, Infinity, tempo)
      assert.ok(b.hit <= 1 && b.wind <= 1, `${t.key} ${phase}`)
      const until = t.period - phase
      // Anticipation gathers slowly, then the strike snaps through in its last few frames.
      if (until > strike && until < anticipation) assert.ok(b.wind > 0 && b.hit === 0, `${t.key} wind ${phase}`)
      if (phase > recovery && until > anticipation) assert.deepEqual([b.wind, b.hit], [0, 0], `${t.key} rest ${phase}`)
    }
    const late = beats('attack', t.period - strike * 0.25, t.period, Infinity, tempo)
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
  assert.deepEqual(flinch(-1, 1), { jolt: 0, wobble: 0, lift: 0, flash: 0, face: false })
  // Criticals and knockback read as heavier: a longer hold, a pop upward and a longer ＞＜ face.
  assert.ok(flinch(0.07, 1.6).jolt / 1.6 > flinch(0.07, 0.7).jolt / 0.7)
  assert.ok(flinch(0.1, 1.6).lift > 0 && flinch(0.1, 1).lift === 0)
  assert.ok(flinch(0.35, 1.6).face && !flinch(0.3, 0.7).face)
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
