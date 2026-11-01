import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { walkGaitClip } from '../src/rendering/WalkGait'
import { directMotionClip } from '../src/rendering/DirectedMotion'
import { UNIT_MODEL_CATALOG } from '../src/rendering/models/catalog'
import type { UnitType } from '../src/game/model'

function player(scene: THREE.Object3D, clip: THREE.AnimationClip) {
  const mixer = new THREE.AnimationMixer(scene)
  const action = mixer.clipAction(clip)
  action.setLoop(THREE.LoopOnce, 1)
  action.clampWhenFinished = true
  action.play()
  return (t: number) => {
    action.enabled = true
    action.paused = false
    mixer.setTime(t)
    scene.updateMatrixWorld(true)
  }
}
const world = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3())
/** Mean backward foot speed while it moves back, per loop: 1 means a planted stance. */
function stance(sample: (t: number) => void, foot: THREE.Object3D, duration: number) {
  const z: number[] = []
  for (let i = 0; i <= 240; i++) {
    sample((duration * i) / 240)
    z.push(world(foot).z)
  }
  let back = 0,
    frames = 0
  for (let i = 1; i < z.length; i++)
    if (z[i] < z[i - 1]) {
      back += z[i - 1] - z[i]
      frames++
    }
  return { speed: back / (frames / 240), amplitude: Math.max(...z) - Math.min(...z) }
}

describe('walk gait pass', () => {
  function rig() {
    const scene = new THREE.Group(),
      pelvis = new THREE.Bone(),
      thigh = new THREE.Bone(),
      shin = new THREE.Bone(),
      foot = new THREE.Bone()
    Object.assign(pelvis, { name: 'pelvis' })
    Object.assign(thigh, { name: 'thighL' })
    Object.assign(shin, { name: 'shinL' })
    Object.assign(foot, { name: 'footL' })
    scene.add(pelvis)
    pelvis.add(thigh)
    thigh.add(shin)
    shin.add(foot)
    pelvis.position.y = 1
    thigh.rotation.x = Math.PI
    shin.position.y = 0.5
    foot.position.y = 0.45
    // A short pendulum stride with a forward knee bend.
    const times = Array.from({ length: 25 }, (_, i) => i / 24)
    const q = (x: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, 0, 0)).toArray()
    const clip = new THREE.AnimationClip('walk', 1, [
      new THREE.QuaternionKeyframeTrack(
        'thighL.quaternion',
        times,
        times.flatMap((t) => q(Math.PI - 0.15 * Math.cos(2 * Math.PI * t) - 0.2))
      ),
      new THREE.QuaternionKeyframeTrack(
        'shinL.quaternion',
        times,
        times.flatMap(() => q(0.4))
      )
    ])
    return { scene, thigh, shin, foot, clip }
  }

  it('scales the stance to the requested travel, keeps segment lengths, the loop seam and the knee side', () => {
    const { scene, shin, foot, clip } = rig()
    const authored = stance(player(scene, clip), foot, 1)
    const travel = authored.speed * 1.6
    const gait = walkGaitClip(scene, clip, travel, -10)
    expect(walkGaitClip(scene, clip, travel, -10)).toBe(gait)
    expect(walkGaitClip(scene, new THREE.AnimationClip('idle', 1, []), travel, -10).name).toBe('idle')
    const sample = player(scene, gait)
    const result = stance(sample, foot, 1)
    expect(result.speed / travel).toBeCloseTo(1, 2)
    expect(result.amplitude).toBeGreaterThan(authored.amplitude * 1.5)
    const seam = (t: number) => (sample(t), world(foot))
    expect(seam(0).distanceTo(seam(1))).toBeLessThan(1e-5)
    for (let i = 0; i <= 48; i++) {
      sample(i / 48)
      expect(world(shin).distanceTo(world(scene.getObjectByName('thighL')!))).toBeCloseTo(0.5, 5)
      expect(world(foot).distanceTo(world(shin))).toBeCloseTo(0.45, 5)
      // Knee stays in front of the hip-ankle line (+Z faces the walk).
      const hip = world(scene.getObjectByName('thighL')!),
        axis = world(foot).sub(hip).normalize(),
        bend = world(shin).sub(hip)
      expect(bend.addScaledVector(axis, -bend.dot(axis)).z).toBeGreaterThan(0)
    }
  })

  it('lifts a sole that would pass below the ground', () => {
    const { scene, foot, clip } = rig()
    const sample = player(scene, walkGaitClip(scene, clip, 0.1, 0.12))
    for (let i = 0; i <= 48; i++) {
      sample(i / 48)
      expect(world(foot).y).toBeGreaterThanOrEqual(0.12 - 1e-5)
    }
  })
})

const root = existsSync(resolve('local-assets/models-source/tank/tank-idle-candidate.glb'))
  ? resolve('local-assets/models-source')
  : resolve('public/tower-defense-art/models')
const walking: UnitType[] = [
  'crystalSentinel',
  'koboldLancer',
  'clockworkPatchling',
  'tank',
  'mage',
  'frost',
  'healer',
  'ranger',
  'cannon',
  'paladin',
  'goblin',
  'wolf',
  'beetle',
  'shaman',
  'brute',
  'ogre',
  'soldier',
  'archer',
  'runner'
]
describe.skipIf(!existsSync(resolve(root, 'tank/tank-idle-candidate.glb')))('runtime walk strides', () => {
  for (const role of walking)
    it(`${role}: stance foot travels with the body at its catalog cadence`, async () => {
      const definition = UNIT_MODEL_CATALOG[role]!
      const spec = definition.clips.walk!
      const loader = new GLTFLoader()
      loader.register(() => ({ name: 'GAIT_TEXTURE_STUB', loadTexture: () => Promise.resolve(new THREE.Texture()) }))
      const bytes = readFileSync(resolve(root, spec.url.split(/models\//)[1]))
      const gltf = await loader.parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        ''
      )
      const source = gltf.animations.find((clip) => clip.name === 'walk')!
      const index = gltf.animations.indexOf(source)
      const extras = gltf.parser.json.animations[index].extras
      if (extras) Object.assign(source, { userData: structuredClone(extras) })
      const scene = gltf.scene
      const travel = definition.walkDistance / definition.scale
      const clip = walkGaitClip(scene, directMotionClip(scene, source, role), travel, definition.origin[1])
      const sample = player(scene, clip)
      const feet: THREE.Object3D[] = []
      scene.traverse((node) => {
        if (node instanceof THREE.Bone && /^(foot|paw|toe)[A-Z]{1,2}$/.test(node.name)) feet.push(node)
      })
      const strides = feet.map((foot) => stance(sample, foot, clip.duration)).sort((a, b) => b.amplitude - a.amplitude)
      expect(strides[0].speed / travel).toBeGreaterThan(0.88)
      expect(strides[0].speed / travel).toBeLessThan(1.05)
      const seam = (t: number) => (sample(t), feet.map(world))
      const start = seam(0)
      seam(clip.duration).forEach((p, i) => expect(p.distanceTo(start[i])).toBeLessThan(1e-4))
    })
})
