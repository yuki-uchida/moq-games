import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { directMotionClip, directedPose, MOTION_DIRECTION, repairKeyFlips } from '../src/rendering/DirectedMotion'
import { ATTACK_PROFILES } from '../src/game/AttackProfiles'
import type { UnitType } from '../src/game/model'

function rig() {
  const scene = new THREE.Group(),
    pelvis = new THREE.Bone(),
    chest = new THREE.Bone(),
    head = new THREE.Bone(),
    foot = new THREE.Bone(),
    tool = new THREE.Group()
  pelvis.name = 'pelvis'
  chest.name = 'chest'
  head.name = 'head'
  foot.name = 'foot'
  tool.name = 'Staff_Rigid_Control'
  scene.add(pelvis, tool)
  pelvis.add(chest, foot)
  chest.add(head)
  chest.position.y = 0.8
  head.position.y = 0.4
  foot.position.set(0.2, -0.5, 0)
  tool.position.set(0.4, 1, 0.1)
  const clip = new THREE.AnimationClip('attack', 0.96, [
    new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 0.52, 0.96], [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])
  ])
  Object.assign(clip, { userData: { blinkAmountSamples: [{ frame: 0 }, { frame: 1 }] } })
  return { scene, chest, head, foot, tool, clip }
}
/** Authored rig, geometry and clips of a runtime GLB; textures are irrelevant in Node. */
async function model(role: string, file: string) {
  const original = readFileSync(resolve('public/tower-defense-art/models', role, file))
  const jsonLength = original.readUInt32LE(12)
  const json = JSON.parse(original.subarray(20, 20 + jsonLength).toString())
  json.materials = json.materials?.map((material: { name?: string }) => ({ name: material.name }))
  delete json.images
  delete json.textures
  delete json.samplers
  const text = Buffer.from(JSON.stringify(json))
  const padded = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 32)])
  const binary = original.subarray(20 + jsonLength)
  const bytes = Buffer.alloc(20 + padded.length + binary.length)
  original.copy(bytes, 0, 0, 12)
  bytes.writeUInt32LE(bytes.length, 8)
  bytes.writeUInt32LE(padded.length, 12)
  bytes.writeUInt32LE(0x4e4f534a, 16)
  padded.copy(bytes, 20)
  binary.copy(bytes, 20 + padded.length)
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    ''
  )
  const clip = (name: string) => gltf.animations.find((c) => c.name === name)!
  return { scene: gltf.scene, clip }
}
/** Sample a clip on its rig the way the game does (one clamped action per clip). */
function sampler(scene: THREE.Object3D, clip: THREE.AnimationClip) {
  const mixer = new THREE.AnimationMixer(scene),
    action = mixer.clipAction(clip)
  action.setLoop(THREE.LoopOnce, 1)
  action.clampWhenFinished = true
  action.play()
  return (t: number) => {
    action.enabled = true
    action.paused = false
    mixer.setTime(t)
    scene.updateWorldMatrix(true, true)
  }
}
/** Largest world-rotation change of a node between consecutive 1 ms samples, in degrees. */
function worstTurn(scene: THREE.Object3D, clip: THREE.AnimationClip, node: string, from: number, to: number) {
  const at = sampler(scene, clip),
    object = scene.getObjectByName(node)!
  let previous: THREE.Quaternion | undefined,
    worst = 0
  for (let t = from; t <= to; t += 0.001) {
    at(t)
    const q = object.getWorldQuaternion(new THREE.Quaternion())
    if (previous) worst = Math.max(worst, (q.angleTo(previous) * 180) / Math.PI)
    previous = q
  }
  return worst
}

describe('source key flips', () => {
  it('leaves the re-authored Brute attack continuous and untouched', async () => {
    // Proximal motion v1 rebuilt the Brute attack; its former fist flips are gone at the source.
    const { scene, clip } = await model('brute', 'brute-motion-v2-candidate.glb')
    const source = clip('attack')
    for (const [from, to] of [
      [0.35, 0.41],
      [0.59, 0.63]
    ])
      for (const hand of ['handL', 'handR']) expect(worstTurn(scene, source, hand, from, to)).toBeLessThan(10)
    expect(repairKeyFlips(scene, source)).toBe(source)
  })
  it('turns the Runner elbows continuously while each hand stays on the spear', async () => {
    const { scene, clip } = await model('runner', 'runner-attack-current.glb')
    const source = clip('attack'),
      repaired = directMotionClip(scene, source, 'runner')
    const spear = scene.getObjectByName('Spear_Rigid_Control')!
    const grip = (c: THREE.AnimationClip, hand: string, t: number) => {
      sampler(scene, c)(t)
      const inverse = spear.matrixWorld.clone().invert()
      return {
        at: scene.getObjectByName(hand)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse),
        turn: spear
          .getWorldQuaternion(new THREE.Quaternion())
          .invert()
          .multiply(scene.getObjectByName(hand)!.getWorldQuaternion(new THREE.Quaternion()))
      }
    }
    for (const [side, from, to] of [
      ['L', 0.29, 0.33],
      // The Runner swings fore.R on purpose right after 0.508 s; the flip and return end before it.
      ['R', 0.44, 0.508]
    ] as const) {
      expect(worstTurn(scene, source, `fore${side}`, from, to)).toBeGreaterThan(20)
      expect(worstTurn(scene, repaired, `fore${side}`, from, to)).toBeLessThan(10)
      for (let t = from; t <= to; t += 0.004) {
        const before = grip(source, `hand${side}`, t),
          after = grip(repaired, `hand${side}`, t)
        expect(after.at.distanceTo(before.at)).toBeLessThan(1e-3)
        expect(after.turn.angleTo(before.turn)).toBeLessThan(0.02)
      }
    }
  })
  it('keeps fast authored motion and clean clips untouched', async () => {
    const wolf = await model('wolf', 'wolf-walk-smooth.glb')
    // The paw landing turns 160 deg in ~15 ms, but as a smooth authored swing.
    for (const name of ['idle', 'walk', 'attack'])
      expect(repairKeyFlips(wolf.scene, wolf.clip(name))).toBe(wolf.clip(name))
    const archer = await model('archer', 'archer-attack-candidate.glb')
    expect(repairKeyFlips(archer.scene, archer.clip('attack'))).toBe(archer.clip('attack'))
    const runner = await model('runner', 'runner-walk-current.glb')
    expect(repairKeyFlips(runner.scene, runner.clip('walk'))).toBe(runner.clip('walk'))
  })
})

describe('directed attack continuity', () => {
  it('fades the Wolf torso pose instead of dropping it where the source paw leg straightens', async () => {
    const { scene, clip } = await model('wolf', 'wolf-walk-smooth.glb')
    const source = clip('attack'),
      directed = directMotionClip(scene, source, 'wolf')
    // Source chest turns ~0.1 deg/ms here; the reach limit used to pop the added pose off and back in 4 ms.
    expect(worstTurn(scene, directed, 'chest', 0.4, 0.45)).toBeLessThan(
      worstTurn(scene, source, 'chest', 0.4, 0.45) + 0.3
    )
  })
  it('keeps the Soldier sword tip on, not under, the ground through the cut', async () => {
    const { scene, clip } = await model('soldier', 'soldier-motion-v2-candidate.glb')
    const source = clip('attack'),
      directed = directMotionClip(scene, source, 'soldier')
    const sword: THREE.Mesh[] = []
    scene.getObjectByName('Sword_Rigid_Separated')!.traverse((o) => o instanceof THREE.Mesh && sword.push(o))
    const lowest = (c: THREE.AnimationClip) => {
      const at = sampler(scene, c),
        point = new THREE.Vector3()
      let low = Infinity
      for (let t = 0.26; t <= 0.42; t += 0.005) {
        at(t)
        for (const mesh of sword)
          for (let i = 0; i < mesh.geometry.attributes.position.count; i++)
            low = Math.min(low, mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).y)
      }
      return low
    }
    // Feet rest on y = 0; the source tip alone dips ~4 px under it.
    expect(lowest(source)).toBeLessThan(-0.05)
    expect(lowest(directed)).toBeGreaterThan(-0.002)
    expect(directed.tracks.map((t) => t.name)).toContain('swordL.quaternion')
  })
})

describe('directed rig motion', () => {
  it('has a distinct, finite role recipe for every runtime unit and neutral endpoints', () => {
    expect(Object.keys(MOTION_DIRECTION)).toHaveLength(23)
    for (const role of Object.keys(MOTION_DIRECTION) as UnitType[]) {
      const duration = (ATTACK_PROFILES[role].durationMs / 1000) * (role === 'runner' ? 640 / 480 : 1)
      for (const motion of ['idle', 'walk', 'attack']) {
        expect(directedPose(role, motion, 0, duration).pitch).toBeCloseTo(0)
        expect(directedPose(role, motion, duration, duration).pitch).toBeCloseTo(0)
      }
      if (ATTACK_PROFILES[role].cue === 'release') {
        const cue = ATTACK_PROFILES[role].cueMs / 1000
        expect(directedPose(role, 'attack', cue, duration)).toEqual({ pitch: 0, yaw: 0, drop: 0 })
      }
    }
  })
  it('accents attacks that relied on VFX after (never at) the release cue, without touching loops', () => {
    const pose = (role: UnitType, t: number) => directedPose(role, 'attack', t, ATTACK_PROFILES[role].durationMs / 1000)
    expect(pose('cannon', 0.66)).toEqual({ pitch: 0, yaw: 0, drop: 0 })
    expect(pose('cannon', 0.72).pitch).toBeLessThan(-0.35) // recoil
    expect(pose('cannon', 0.45).pitch).toBeGreaterThan(0.15) // leans into the shot
    expect(pose('wraith', 0.48).pitch).toBeGreaterThan(0.2) // follow-through
    expect(pose('beetle', 0.42)).toMatchObject({ pitch: expect.closeTo(0.24 * 0.65, 5), drop: 0.15 })
    for (const role of ['cannon', 'wraith', 'beetle'] as const)
      expect(directedPose(role, 'walk', 0.125, 1).pitch).toBeCloseTo(MOTION_DIRECTION[role].pitch * 0.22)
  })
  it('changes acting while preserving source bytes, clip clock, feet, rigid grip, and source extras', () => {
    const { scene, clip, chest, tool, foot } = rig(),
      original = JSON.stringify(THREE.AnimationClip.toJSON(clip))
    const directed = directMotionClip(scene, clip, 'mage')
    expect(directed).not.toBe(clip)
    expect(directed.duration).toBe(clip.duration)
    expect(directed.name).toBe(clip.name)
    expect(JSON.stringify(THREE.AnimationClip.toJSON(clip))).toBe(original)
    expect((directed as any).userData).toMatchObject((clip as any).userData)
    const mixer = new THREE.AnimationMixer(scene),
      action = mixer.clipAction(directed)
    action.play()
    scene.updateWorldMatrix(true, true)
    const footBefore = foot.getWorldPosition(new THREE.Vector3())
    mixer.setTime(0)
    scene.updateWorldMatrix(true, true)
    const grip = chest.matrixWorld.clone().invert().multiply(tool.matrixWorld)
    mixer.setTime(0.52 * 0.68)
    scene.updateWorldMatrix(true, true)
    expect(chest.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.2)
    expect(foot.getWorldPosition(new THREE.Vector3()).distanceTo(footBefore)).toBeLessThan(1e-7)
    const gripAfter = chest.matrixWorld.clone().invert().multiply(tool.matrixWorld)
    expect(Math.max(...grip.elements.map((v, i) => Math.abs(v - gripAfter.elements[i])))).toBeLessThan(0.002)
    expect(directMotionClip(scene, clip, 'mage')).toBe(directed)
    expect(directed.tracks.filter((t) => t.name.endsWith('.scale'))).toHaveLength(0)
  })
  it('preserves finite tool rotations when an authored released arrow is hidden at zero scale', () => {
    const { scene, clip, tool } = rig()
    tool.name = 'Nocked_Arrow_Control'
    clip.tracks.push(
      new THREE.VectorKeyframeTrack(
        'Nocked_Arrow_Control.scale',
        [0, 0.5, 0.51, 0.96],
        [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]
      )
    )
    const result = directMotionClip(scene, clip, 'archer')
    for (const track of result.tracks) expect(Array.from(track.values).every(Number.isFinite), track.name).toBe(true)
    expect(result.tracks.find((t) => t.name === 'Nocked_Arrow_Control.scale')?.values).toEqual(clip.tracks[1].values)
  })
  it('retains constant authored channels that differ from bind pose at the release cue', () => {
    const { scene, clip } = rig()
    clip.tracks.push(new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 0.96], [0, 1, 0, 0, 0, 1, 0, 0]))
    const result = directMotionClip(scene, clip, 'mage')
    const mixer = new THREE.AnimationMixer(scene),
      action = mixer.clipAction(result)
    action.play()
    mixer.setTime(0.52)
    expect(scene.getObjectByName('head')!.quaternion.angleTo(new THREE.Quaternion(0, 1, 0, 0))).toBeLessThan(1e-6)
  })
  it('anchors Dragon breath to its distinct authored 480 ms release', () => {
    const scene = new THREE.Group(),
      body = new THREE.Bone(),
      head = new THREE.Bone(),
      mouth = new THREE.Object3D()
    body.name = 'body'
    head.name = 'head'
    mouth.name = 'Dragon_Actual_Mouth_Emitter'
    scene.add(body, mouth)
    body.add(head)
    const clip = new THREE.AnimationClip('breath', 1.2, [
      new THREE.QuaternionKeyframeTrack('body.quaternion', [0, 1.2], [0, 0, 0, 1, 0, 0, 0, 1])
    ])
    Object.assign(clip, { userData: { events: [{ type: 'release', atMs: 480 }] } })
    const directed = directMotionClip(scene, clip, 'dragon'),
      mixer = new THREE.AnimationMixer(scene)
    mixer.clipAction(directed).play()
    mixer.setTime(0.48)
    expect(body.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6)
    expect(head.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6)
  })
  it('retains original fast hand/tool key boundaries without grip drift', () => {
    const { scene, clip, chest, tool } = rig(),
      hand = new THREE.Bone()
    hand.name = 'handR'
    chest.add(hand)
    const times = [0, 0.007, 0.012, 0.96]
    clip.tracks.push(
      new THREE.VectorKeyframeTrack('handR.position', times, [0.5, 0.1, 0, 3.5, 0.1, 0, 0.5, 0.1, 0, 0.5, 0.1, 0])
    )
    clip.tracks.push(
      new THREE.VectorKeyframeTrack(
        'Staff_Rigid_Control.position',
        times,
        [0.5, 0.9, 0, 3.5, 0.9, 0, 0.5, 0.9, 0, 0.5, 0.9, 0]
      )
    )
    const directed = directMotionClip(scene, clip, 'mage'),
      mixer = new THREE.AnimationMixer(scene)
    mixer.clipAction(directed).play()
    mixer.setTime(Math.fround(0.007))
    scene.updateWorldMatrix(true, true)
    const grip = hand.getWorldPosition(new THREE.Vector3()).applyMatrix4(tool.matrixWorld.clone().invert())
    expect(grip.length()).toBeLessThan(1e-5)
    for (const track of directed.tracks) {
      for (let i = 1; i < track.times.length; i++) expect(track.times[i]).toBeGreaterThan(track.times[i - 1])
    }
  })
  it('supports Wolf torso weight with two fixed-length joints and the authored paw target', () => {
    const scene = new THREE.Group(),
      chest = new THREE.Bone(),
      upper = new THREE.Bone(),
      lower = new THREE.Bone(),
      paw = new THREE.Bone()
    chest.name = 'chest'
    upper.name = 'upperFL'
    lower.name = 'lowerFL'
    paw.name = 'pawFL'
    scene.add(chest)
    chest.add(upper)
    upper.add(lower)
    lower.add(paw)
    chest.position.y = 1
    upper.position.set(0.1, -0.1, 0.25)
    lower.position.set(0, -0.3, 0.1)
    paw.position.set(0, -0.3, -0.1)
    scene.updateWorldMatrix(true, true)
    const target = paw.getWorldPosition(new THREE.Vector3()),
      l1 = lower.position.length(),
      l2 = paw.position.length()
    const source = new THREE.AnimationClip('attack', 0.75, [
      new THREE.QuaternionKeyframeTrack('chest.quaternion', [0, 0.75], [0, 0, 0, 1, 0, 0, 0, 1])
    ])
    const directed = directMotionClip(scene, source, 'wolf'),
      mixer = new THREE.AnimationMixer(scene),
      action = mixer.clipAction(directed)
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    for (const t of [0, 0.1, 0.1938, 0.285, 0.4, 0.75]) {
      action.paused = false
      action.enabled = true
      mixer.setTime(t)
      scene.updateWorldMatrix(true, true)
      expect(paw.getWorldPosition(new THREE.Vector3()).distanceTo(target)).toBeLessThan(0.0015)
      expect(lower.position.length()).toBeCloseTo(l1, 8)
      expect(paw.position.length()).toBeCloseTo(l2, 8)
    }
    expect((directed as any).userData.directedMotionAudit.footChains).toEqual(['pawFL'])
  })
  it('leaves death and special authored clips untouched', () => {
    const { scene, clip } = rig()
    clip.name = 'death'
    expect(directMotionClip(scene, clip, 'mage')).toBe(clip)
    clip.name = 'ultimate_mage'
    expect(directMotionClip(scene, clip, 'mage')).toBe(clip)
  })
  it('keeps the actual Slime skin base at its authored hopping height during added roll', () => {
    const scene = new THREE.Group(),
      gel = new THREE.Bone()
    gel.name = 'gel'
    scene.add(gel)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -0.3, 0.5, 0, 0.3, 0, 1, 0], 3))
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(12).fill(0), 4))
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4))
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial())
    mesh.name = 'Slime_Rounded_Body'
    scene.add(mesh)
    scene.updateWorldMatrix(true, true)
    mesh.bind(new THREE.Skeleton([gel]))
    const clip = new THREE.AnimationClip('attack', 0.96, [
      new THREE.VectorKeyframeTrack('gel.position', [0, 0.3, 0.42, 0.96], [0, 0, 0, 0, 0.2, 0, 0, 0, 0, 0, 0, 0])
    ])
    const candidate = directMotionClip(scene, clip, 'slime')
    const mixer = new THREE.AnimationMixer(scene),
      originalAction = mixer.clipAction(clip),
      candidateAction = mixer.clipAction(candidate)
    const point = new THREE.Vector3()
    const minimum = () => {
      scene.updateWorldMatrix(true, true)
      return Math.min(...[0, 1, 2].map((i) => mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).y))
    }
    for (const t of [0.1, 0.267, 0.3, 0.42, 0.5, 0.8, 0.96]) {
      mixer.stopAllAction()
      originalAction.reset().setLoop(THREE.LoopOnce, 1).play()
      originalAction.clampWhenFinished = true
      mixer.setTime(t)
      const before = minimum()
      mixer.stopAllAction()
      candidateAction.reset().setLoop(THREE.LoopOnce, 1).play()
      candidateAction.clampWhenFinished = true
      mixer.setTime(t)
      expect(minimum()).toBeCloseTo(before, 5)
    }
    geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
  })
})
