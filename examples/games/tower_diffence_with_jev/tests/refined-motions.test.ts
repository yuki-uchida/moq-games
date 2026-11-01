import { it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import manifest from '../../../../scripts/refined-motions-manifest.json'
import { UNIT_MODEL_CATALOG } from '../src/rendering/models/catalog'
import { ATTACK_PROFILES } from '../src/game/AttackProfiles'
import type { UnitType } from '../src/game/model'

const asset = (url: string) => `public/${url.split('/moq-games/').at(-1)!.replace(/^\//, '')}`
for (const entry of manifest) {
  it(`retains ${entry.role}/${entry.motion} rig, valid tracks and event/loop contract`, async () => {
    const role = entry.role as UnitType
    const motion = entry.motion as 'walk' | 'attack'
    const spec = UNIT_MODEL_CATALOG[role]!.clips[motion]!
    expect(spec.url).toContain(entry.source)
    expect(spec.clipUrl).toContain(entry.clip)
    const bytes = readFileSync(asset(spec.clipUrl!))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256)
    const clip = THREE.AnimationClip.parse(JSON.parse(bytes.toString()))
    expect(clip.duration).toBeCloseTo(entry.duration)
    expect(clip.tracks.some((track) => track.name.endsWith('.scale'))).toBe(false)
    const source = readFileSync(asset(spec.url))
    expect(createHash('sha256').update(source).digest('hex')).toBe(entry.sourceSha256)
    const loader = new GLTFLoader()
    loader.register(() => ({ name: 'NO_TEXTURE_IO', loadTexture: () => Promise.resolve(new THREE.Texture()) }))
    const gltf = await loader.parseAsync(
      source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
      ''
    )
    const original = gltf.animations.find((c) => c.name === motion)!
    expect(clip.duration).toBeCloseTo(original.duration, 6)
    if (motion === 'attack') expect(ATTACK_PROFILES[role].durationMs / 1000).toBeCloseTo(clip.duration, 5)
    const mixer = new THREE.AnimationMixer(gltf.scene)
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    const bindings = clip.tracks.map((track) => THREE.PropertyBinding.parseTrackName(track.name))
    for (const binding of bindings) expect(gltf.scene.getObjectByName(binding.nodeName)).toBeDefined()
    const lengths: number[][] = []
    for (let i = 0; i <= 120; i++) {
      mixer.setTime((clip.duration * i) / 120)
      gltf.scene.updateMatrixWorld(true)
      const sample: number[] = []
      gltf.scene.traverse((object) => {
        expect(object.matrixWorld.elements.every(Number.isFinite)).toBe(true)
        if (object instanceof THREE.Bone) sample.push(object.position.length())
      })
      lengths.push(sample)
    }
    // Authored root/pelvis may translate, but limb lengths cannot change.
    for (const name of ['thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'forearm', 'shield']) {
      const bone = gltf.scene.getObjectByName(name)
      if (!bone || (name.startsWith('foot') && role === 'tank')) continue
      const initial = bone.position.length()
      for (const time of [0, clip.duration / 3, clip.duration * 0.7, clip.duration]) {
        mixer.setTime(time)
        expect(bone.position.length()).toBeCloseTo(initial, 5)
      }
    }
    if (motion === 'walk') {
      for (const track of clip.tracks) {
        const size = track.getValueSize(),
          start = Array.from(track.values.slice(0, size)),
          end = Array.from(track.values.slice(-size))
        if (track.name.endsWith('.quaternion'))
          expect(Math.abs(start.reduce((sum, v, i) => sum + v * end[i], 0))).toBeCloseTo(1, 4)
        else for (let k = 0; k < size; k++) expect(end[k]).toBeCloseTo(start[k], 4)
      }
    }
    if (role === 'archer' || role === 'runner') {
      for (let i = 0; i < 120; i++) {
        mixer.setTime(i / 120)
        gltf.scene.updateMatrixWorld(true)
        for (const side of ['L', 'R']) {
          const foot = gltf.scene.getObjectByName(`foot${side}`)!
          const hip = gltf.scene.getObjectByName(`thigh${side}`)!
          // Ankle stays on its own sagittal track, without lateral knee splay.
          expect(foot.getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(
            hip.getWorldPosition(new THREE.Vector3()).x,
            5
          )
        }
      }
    }
    mixer.stopAllAction()
  })
}
