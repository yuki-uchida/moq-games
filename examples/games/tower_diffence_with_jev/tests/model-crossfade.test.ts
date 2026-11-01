import { expect, it } from 'vitest'
import * as THREE from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ModelAssetCache } from '../src/rendering/ModelAssetCache'
import { MODEL_CROSSFADE_SECONDS, ModelUnitVisual, type ModelPose } from '../src/rendering/ModelUnitVisual'
import { ATTACK_PROFILES } from '../src/game/AttackProfiles'

// idle holds body.x = 0; attack moves body.x 0 → 2 and the emitter y 0 → 3 over 1 s.
function fixture(): GLTF {
  const scene = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
  mesh.name = 'body'
  const emitter = new THREE.Bone()
  emitter.name = 'emitter'
  mesh.add(emitter)
  scene.add(mesh)
  const clip = (name: string, x: number[], y: number[]) =>
    new THREE.AnimationClip(name, 1, [
      new THREE.NumberKeyframeTrack('body.position[x]', [0, 1], x),
      new THREE.NumberKeyframeTrack('emitter.position[y]', [0, 1], y)
    ])
  const animations = [clip('idle', [0, 0], [0, 0]), clip('attack', [0, 2], [0, 3])]
  return { scene, scenes: [scene], animations, cameras: [], asset: { version: '2.0' } } as unknown as GLTF
}
async function visual() {
  const cache = new ModelAssetCache(async () => fixture())
  cache.request('/m.glb')
  for (let i = 0; i < 8; i++) await Promise.resolve()
  const clips = { idle: { url: '/m.glb', clip: 'idle' }, attack: { url: '/m.glb', clip: 'attack' } }
  const spec = { scale: 1, origin: [0, 0, 0] as const, yaw: 0, walkDistance: 1, provenance: 'test', clips }
  return new ModelUnitVisual({ ...spec, emitter: { node: 'emitter' } }, cache)
}
const base = { loop: false, facingX: 0, facingY: 1, boss: false }
const idle = (time?: number): ModelPose => ({ ...base, motion: 'idle', seconds: 0, time })
const attack = (time?: number): ModelPose => ({ ...base, motion: 'attack', seconds: 1, time })
const x = (v: ModelUnitVisual) => v.root.getObjectByName('body')!.position.x

it('ends the fade long before the earliest attack cue', () => {
  const earliest = Math.min(...Object.values(ATTACK_PROFILES).map((p) => p.cueMs)) / 1000
  expect(MODEL_CROSSFADE_SECONDS).toBeLessThanOrEqual(earliest / 2)
})

it('blends a clip switch over simulation time, holds while paused and never drifts', async () => {
  const v = await visual()
  v.sample(idle(10))
  const half = 10 + MODEL_CROSSFADE_SECONDS / 2
  v.sample(attack(half))
  expect(x(v)).toBeCloseTo(1)
  v.sample(attack(half)) // paused / frozen tab: identical pose
  expect(x(v)).toBeCloseTo(1)
  v.sample(attack(10 + MODEL_CROSSFADE_SECONDS * 0.75))
  expect(x(v)).toBeCloseTo(1.5)
  v.sample(attack(10 + MODEL_CROSSFADE_SECONDS))
  expect(x(v)).toBeCloseTo(2, 9)
  v.sample(attack(20))
  expect(x(v)).toBe(2)
})

it('does not fade without time or when time rewinds', async () => {
  const v = await visual()
  v.sample(idle())
  v.sample(attack())
  expect(x(v)).toBe(2)
  v.sample(idle(10))
  v.sample(attack(9)) // reset / earlier save
  expect(x(v)).toBe(2)
  v.sample(idle(10))
  v.sample(attack(10.03)) // fade starts...
  expect(x(v)).toBeLessThan(2)
  v.sample(attack(10.01)) // ...and a rewind drops it
  expect(x(v)).toBe(2)
})

it('keeps emitters authored and internal re-samples from starting or corrupting a fade', async () => {
  const v = await visual(),
    reference = await visual()
  const authored = reference.emitterAt(attack())!
  v.sample(attack(9.99))
  v.sample(idle(10)) // fading from the attack pose
  const before = x(v)
  expect(before).toBeGreaterThan(0)
  expect(v.emitterAt(attack())).toEqual(authored)
  expect(v.emitterAt(attack(10))).toEqual(authored)
  expect(x(v)).toBeCloseTo(before)
  v.setAppearance(0.5) // first-pose bounds re-sample
  expect(x(v)).toBeCloseTo(before)
  v.sample(idle(10 + MODEL_CROSSFADE_SECONDS / 2))
  expect(x(v)).toBeLessThan(before)
  expect(x(v)).toBeGreaterThan(0)
  // An emitter sample on a fresh actor never becomes a fade source.
  const fresh = await visual()
  fresh.emitterAt(attack())
  fresh.sample(idle(10))
  expect(x(fresh)).toBe(0)
})
