import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Actor, LaneModels, koSeconds, KO_SECONDS } from './models.js'
const { Vector3 } = THREE
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

test('all recipes support complete reactions, statuses and deaths without broken bones', () => {
  for (const unit of [...POOPS, ...SPECIALS, ...ENEMIES]) {
    const actor = new Actor(unit.key)
    const base = {
      motion: 'walk',
      phase: 0.4,
      period: unit.period,
      walked: 17,
      lead: Infinity,
      hurtAge: -1,
      power: 1,
      time: 10,
      ko: -1,
      id: 3
    }
    const pose = (frame) => {
      actor.animate(frame)
      actor.root.updateMatrixWorld(true)
      for (const [name, bone] of Object.entries(actor.bones)) {
        assert.ok(bone.matrixWorld.elements.every(Number.isFinite), `${unit.key}.${name}`)
        if (!TRANSIENT.has(name)) assert.ok(Math.abs(bone.matrixWorld.determinant()) > 1e-8, `${unit.key}.${name} lost`)
      }
    }
    const positions = () =>
      Object.fromEntries(
        Object.entries(actor.bones).map(([name, bone]) => [name, bone.getWorldPosition(new Vector3())])
      )
    pose(base)
    const rest = positions()
    let bottom = Infinity,
      top = -Infinity
    for (const [, geometry] of actor.t.meshes) {
      geometry.computeBoundingBox()
      bottom = Math.min(bottom, geometry.boundingBox.min.y)
      top = Math.max(top, geometry.boundingBox.max.y)
    }
    const height = top - bottom
    for (const power of [0.7, 1, 1.6]) {
      for (const age of [0, 0.05, 0.15, 0.3, 0.55, 0.7]) pose({ ...base, power, hurtAge: age })
      for (const [name, point] of Object.entries(positions()))
        assert.ok(point.distanceTo(rest[name]) < 1e-6, `${unit.key}.${name} did not settle`)
      if (!unit.heavy) {
        pose({ ...base, power, hurtAge: 0.55 })
        for (const [name, point] of Object.entries(positions()))
          assert.ok(point.distanceTo(rest[name]) < 1e-6, `${unit.key}.${name} did not settle by 0.55s`)
      }
    }
    for (const kind of ['freeze', 'stun', 'launch', 'confuse', 'drowsy'])
      for (const age of [0, 0.2, 0.6]) pose({ ...base, status: { kind, start: 10, age, left: 1 } })
    const { striker, reacts, parts } = actor.t.recipe
    if (striker) {
      pose({ ...base, motion: 'attack', phase: 0 })
      const contact = positions()[striker]
      let greatest = 0
      for (let sample = 1; sample < 100; sample++) {
        pose({ ...base, motion: 'attack', phase: (unit.period * sample) / 100 })
        if (actor.a.wind > 0.8) greatest = Math.max(greatest, positions()[striker].distanceTo(contact))
      }
      assert.ok(greatest >= height * 0.25, `${unit.key}.${striker} attack displacement`)
    }
    if (reacts) {
      const moved = Object.fromEntries(reacts.map((name) => [name, 0]))
      pose(base)
      const rotations = Object.fromEntries(reacts.map((name) => [name, actor.bones[name].quaternion.clone()]))
      for (const age of [0, 0.05, 0.1, 0.2, 0.35]) {
        pose({ ...base, hurtAge: age })
        const current = positions()
        for (const name of reacts)
          moved[name] = Math.max(
            moved[name],
            current[name].distanceTo(rest[name]),
            rotations[name].angleTo(actor.bones[name].quaternion)
          )
      }
      for (const name of reacts) assert.ok(moved[name] > 0.01, `${unit.key}.${name} reaction`)
    }
    for (let sample = 0; sample <= 20; sample++) {
      pose({ ...base, ko: (koSeconds(unit.key) * sample) / 20 })
      if (parts) {
        const current = positions()
        for (const [name, point] of Object.entries(current))
          if (!TRANSIENT.has(name) && !parts.includes(name))
            assert.ok(
              point.distanceTo(current.hips) < rest[name].distanceTo(rest.hips) + 0.5,
              `${unit.key}.${name} detached`
            )
      }
    }
    assert.equal(actor.mats.toon.opacity, 0, `${unit.key} death fade`)
    assert.ok(koSeconds(unit.key) <= KO_SECONDS)
    actor.dispose()
  }
})

test('freeze holds the observed pose even when first seen frozen', () => {
  const actor = new Actor('katachi')
  const frame = {
    motion: 'walk',
    phase: 0,
    period: 1,
    walked: 5,
    lead: Infinity,
    hurtAge: -1,
    power: 1,
    time: 0,
    ko: -1,
    id: 1,
    status: { kind: 'freeze', start: 0, age: 0, left: 1 }
  }
  actor.animate(frame)
  const initial = actor.bones.hips.matrixWorld.clone()
  actor.root.updateMatrixWorld(true)
  initial.copy(actor.bones.hips.matrixWorld)
  actor.animate({ ...frame, time: 0.6, walked: 100, status: { ...frame.status, age: 0.6, left: 0.4 } })
  actor.root.updateMatrixWorld(true)
  assert.deepEqual(actor.bones.hips.matrixWorld.elements, initial.elements)
  actor.dispose()
})

test('recipe hooks and per-actor material helpers reset each frame', () => {
  const actor = new Actor('katachi')
  const recipe = actor.t.recipe
  const previous = { hurt: recipe.hurt, status: recipe.status, ko: recipe.ko, react: recipe.react }
  const seen = []
  try {
    recipe.react = { jolt: 0.35 }
    recipe.hurt = (bones, h, c) => {
      seen.push(['hurt', h.age, h.power, h.settle, h.jolt])
      c.actor.tint('#a8dcff', 0.5)
    }
    recipe.status = (bones, s) => seen.push([s.kind, s.age, s.left])
    recipe.ko = (bones, k, c) => {
      seen.push(['ko', k.age, k.t, k.fade])
      c.actor.sink(0.2)
      c.actor.setOpacity(k.fade * 0.5)
    }
    const base = {
      motion: 'walk',
      phase: 0,
      period: 1,
      walked: 0,
      lead: Infinity,
      hurtAge: -1,
      power: 1,
      time: 0,
      ko: -1,
      id: 1
    }
    actor.animate({ ...base, hurtAge: 0, power: 1.6 })
    assert.deepEqual(seen[0].slice(0, 4), ['hurt', 0, 1.6, 0])
    actor.animate({ ...base, status: { kind: 'stun', age: 0.2, left: 0.8 } })
    assert.deepEqual(seen[1], ['stun', 0.2, 0.8])
    actor.animate({ ...base, ko: koSeconds('katachi') })
    assert.deepEqual(seen[2], ['ko', koSeconds('katachi'), 1, 0])
    assert.ok(actor.mats.toon.clippingPlanes)
    actor.animate(base)
    assert.equal(actor.mats.toon.clippingPlanes, null)
    assert.equal(actor.mats.toon.opacity, 1)
    assert.equal(actor.mats.toon.color.getHex(), 0xffffff)
  } finally {
    Object.assign(recipe, previous)
    actor.dispose()
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
