import { test } from 'node:test'
import assert from 'node:assert/strict'
import { beats, timing, flinch, knockout, KO_SECONDS } from './animation.js'
import { POOPS, SPECIALS, ENEMIES } from './simulation.js'
const TYPES = [...POOPS, ...SPECIALS, ...ENEMIES]

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
