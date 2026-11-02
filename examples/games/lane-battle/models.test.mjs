import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Actor } from './models.js'
import { POOPS, SPECIALS, ENEMIES } from './simulation.js'

// Bones that only appear for an expression or an attack effect.
const TRANSIENT = new Set([
  'eyes',
  'mouth',
  'squint',
  'ko',
  'shout',
  'blast',
  'puff',
  'splash',
  'powder',
  'fizz',
  'jet',
  'pellet'
])

test('every character keeps finite bones through walk, wind-up, attack, hurt and knock-out, and never drops a prop', () => {
  for (const t of [...POOPS, ...SPECIALS, ...ENEMIES]) {
    const actor = new Actor(t.key)
    const base = {
      motion: 'walk',
      phase: 3,
      period: t.period,
      walked: 17,
      lead: Infinity,
      hurtAge: -1,
      power: 1,
      time: 5,
      ko: -1,
      id: 3
    }
    const frames = [
      base,
      { ...base, lead: 0.1 },
      ...[0, 0.02, 0.1, 0.3, t.period * 0.6, t.period - 0.1, t.period - 0.03].map((phase) => ({
        ...base,
        motion: 'attack',
        phase
      })),
      { ...base, hurtAge: 0.05, power: 1.6 },
      { ...base, ko: 0.3 }
    ]
    for (const [i, f] of frames.entries()) {
      actor.animate({ ...f, time: 5 + i })
      actor.root.updateMatrixWorld(true)
      for (const [name, bone] of Object.entries(actor.bones))
        assert.ok(bone.matrixWorld.elements.every(Number.isFinite), `${t.key}.${name} ${JSON.stringify(f)}`)
    }
    for (const period of [t.period, (t.period * 0.8) / 1.4]) {
      for (let sample = 0; sample < 100; sample++) {
        actor.animate({ ...base, motion: 'attack', period, phase: (period * sample) / 100 })
        actor.root.updateMatrixWorld(true)
        for (const [name, bone] of Object.entries(actor.bones)) {
          assert.ok(bone.matrixWorld.elements.every(Number.isFinite), `${t.key}.${name} at ${sample}%`)
          if (!TRANSIENT.has(name))
            assert.ok(Math.abs(bone.matrixWorld.determinant()) > 1e-8, `${t.key}.${name} collapsed at ${sample}%`)
        }
      }
    }
    actor.animate({ ...base, time: 60 })
    actor.root.updateMatrixWorld(true)
    for (const [name, bone] of Object.entries(actor.bones))
      if (!TRANSIENT.has(name))
        assert.notEqual(bone.matrixWorld.determinant(), 0, `${t.key}.${name} hidden while walking`)
  }
})

test('attack variants use strike state without changing the hit clock', () => {
  const frame = {
    motion: 'attack',
    phase: 0,
    period: 1,
    walked: 0,
    lead: Infinity,
    hurtAge: -1,
    power: 1,
    time: 5,
    ko: -1,
    id: 1
  }
  const geri = new Actor('geri')
  geri.animate({ ...frame, charged: false })
  const plain = geri.bones.hips.position.x
  geri.animate({ ...frame, charged: true })
  assert.ok(geri.bones.hips.position.x > plain + 0.16)
  geri.animate({ ...frame, phase: 0.85, ambushReady: true })
  assert.ok(geri.mats.toon.emissive.r > geri.mats.toon.emissive.g)
  geri.dispose()

  const phone = new Actor('yofukashi')
  phone.animate({ ...frame, strikes: 1 })
  const forehand = phone.bones.chest.rotation.y
  phone.animate({ ...frame, strikes: 2 })
  assert.ok(forehand * phone.bones.chest.rotation.y < 0)
  phone.animate({ ...frame, strikes: 2, lastCrit: true })
  assert.ok(phone.bones.hips.rotation.z < -0.6)
  phone.dispose()
})
