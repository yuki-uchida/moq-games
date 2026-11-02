import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Actor, LaneModels } from './models.js'
import { POOPS, SPECIALS, ENEMIES } from './simulation.js'

// Bones that only appear for an expression or an attack effect.
const TRANSIENT = new Set(['squint', 'ko', 'shout', 'blast', 'puff', 'splash', 'powder', 'fizz', 'jet'])

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
    actor.animate({ ...base, time: 60 })
    actor.root.updateMatrixWorld(true)
    for (const [name, bone] of Object.entries(actor.bones))
      if (!TRANSIENT.has(name))
        assert.notEqual(bone.matrixWorld.determinant(), 0, `${t.key}.${name} hidden while walking`)
  }
})

test('a disposed actor frees its bone texture', () => {
  const actor = new Actor('katachi')
  actor.skeleton.computeBoneTexture()
  let freed = false
  actor.skeleton.boneTexture.addEventListener('dispose', () => (freed = true))
  actor.dispose()
  assert.ok(freed)
})

test('released actors are reused per character, so a long battle allocates no new GPU resources', () => {
  // The pool logic only; rendering needs WebGL.
  const models = Object.assign(Object.create(LaneModels.prototype), {
    scene: new THREE.Scene(),
    actors: new Map(),
    pool: new Map()
  })
  const first = models.actor(1, 'katachi')
  models.release(1, first)
  assert.equal(models.actor(2, 'katachi'), first, 'same character: reused')
  assert.notEqual(models.actor(3, 'cleaner'), first, 'other character: its own actor')
  const swapped = models.actor(2, 'mop')
  assert.equal(swapped.key, 'mop', 'an id reused for another character gets that character')
  assert.equal(models.actor(4, 'katachi'), first, 'the replaced actor went back to its pool')
  assert.equal(models.scene.children.length, models.actors.size)
})
