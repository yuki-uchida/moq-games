import * as THREE from 'three'
import type { UnitType } from '../game/model'
import { ATTACK_PROFILES } from '../game/AttackProfiles'

/** Pose direction over immutable rest/bind rigs. Limb segment lengths, scale and combat clocks stay authored. */
export const MOTION_DIRECTION: Record<UnitType, { torso: string; pitch: number; twist: number; settle: number }> = {
  soldier: { torso: 'chest', pitch: 0.36, twist: 0.28, settle: 0.12 },
  runner: { torso: 'chest', pitch: 0.22, twist: 0.1, settle: 0.1 },
  tank: { torso: 'chest', pitch: 0.16, twist: 0.08, settle: 0.14 },
  paladin: { torso: 'chest', pitch: 0.21, twist: 0.26, settle: 0.15 },
  archer: { torso: 'chest', pitch: 0.1, twist: 0.13, settle: 0.1 },
  ranger: { torso: 'chest', pitch: 0.12, twist: 0.16, settle: 0.12 },
  cannon: { torso: 'chest', pitch: 0.18, twist: 0.06, settle: 0.23 },
  mage: { torso: 'chest', pitch: 0.28, twist: 0.24, settle: 0.12 },
  frost: { torso: 'chest', pitch: 0.14, twist: -0.16, settle: 0.11 },
  healer: { torso: 'chest', pitch: 0.12, twist: 0.12, settle: 0.08 },
  goblin: { torso: 'chest', pitch: 0.26, twist: -0.24, settle: 0.14 },
  shaman: { torso: 'chest', pitch: 0.2, twist: -0.2, settle: 0.14 },
  brute: { torso: 'chest', pitch: 0.25, twist: 0.2, settle: 0.2 },
  ogre: { torso: 'chest', pitch: 0.36, twist: -0.3, settle: 0.22 },
  wolf: { torso: 'chest', pitch: 0.18, twist: 0, settle: 0.12 },
  beetle: { torso: 'body', pitch: 0.1, twist: 0, settle: 0.08 },
  bat: { torso: 'body', pitch: 0.22, twist: 0, settle: 0.16 },
  wraith: { torso: 'body', pitch: 0.15, twist: 0.2, settle: 0.13 },
  dragon: { torso: 'body', pitch: 0.13, twist: 0, settle: 0.12 },
  slime: { torso: 'gel', pitch: 0.23, twist: 0, settle: 0.18 },
  crystalSentinel: { torso: 'chest', pitch: 0.2, twist: 0.18, settle: 0.18 },
  koboldLancer: { torso: 'spine', pitch: 0.24, twist: 0.11, settle: 0.12 },
  clockworkPatchling: { torso: 'body', pitch: 0.2, twist: -0.16, settle: 0.18 }
}
const cache = new WeakMap<THREE.AnimationClip, Map<UnitType, THREE.AnimationClip>>()
const smooth = (t: number) => {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}
function pulse(t: number, start: number, peak: number, end: number) {
  return t < peak ? smooth((t - start) / (peak - start)) : 1 - smooth((t - peak) / (end - peak))
}
export function directedPose(
  role: UnitType,
  motion: string,
  seconds: number,
  duration: number,
  authoredCueSeconds?: number
) {
  const p = MOTION_DIRECTION[role]
  const t = Math.max(0, Math.min(duration, seconds))
  if (motion === 'idle' || motion === 'walk') {
    const cycle = (t / duration) * Math.PI * 2
    const weight = motion === 'walk' ? 0.22 : 0.1
    return { pitch: Math.sin(cycle * 2) * p.pitch * weight, yaw: Math.sin(cycle) * p.twist * weight }
  }
  const profile = ATTACK_PROFILES[role]
  const cue = authoredCueSeconds ?? (profile.cueMs / 1000) * (role === 'runner' ? 640 / 480 : 1)
  const wind = pulse(t, 0, cue * 0.68, cue)
  const after = Math.max(0.001, duration - cue)
  const settle = pulse(t, cue, cue + after * 0.18, duration)
  // Release poses remain exact, including the authored staff/bow/mouth emitter.
  const contact = profile.cue === 'hit' ? pulse(t, cue * 0.68, cue, cue + after * 0.52) : 0
  return {
    pitch: -wind * p.pitch + contact * p.pitch * 0.65 - settle * p.settle,
    yaw: -wind * p.twist + contact * p.twist * 0.7 - settle * p.twist * 0.25
  }
}

/** Bake a small set of corrected tracks once per source clip, before ordinary playback/adapters.
 * Independent rigid tools follow the torso's world delta, retaining the existing grip.
 * No geometry, skin weights, source tracks, material extras or game events are mutated.
 */
export function directMotionClip(
  scene: THREE.Object3D,
  source: THREE.AnimationClip,
  role: UnitType
): THREE.AnimationClip {
  // These actions already coordinate torso, planted feet and rigid grips.
  // A second torso pass would invalidate the authored IK/contact solution.
  if ((source as THREE.AnimationClip & { userData?: { motionRepair?: unknown } }).userData?.motionRepair) return source
  if (!['idle', 'walk', 'attack', 'heal', 'breath'].includes(source.name)) return source
  const prior = cache.get(source)?.get(role)
  if (prior) return prior
  const profile = MOTION_DIRECTION[role]
  const torso = scene.getObjectByName(profile.torso)
  if (!torso) throw new Error(`Missing ${role} motion torso: ${profile.torso}`)
  const head = scene.getObjectByName('head')
  const driven = [torso, ...(head && head !== torso ? [head] : [])]
  const helpers: THREE.Object3D[] = []
  scene.traverse((node) => {
    // glTF control roots are independent of the skeleton; descendants inherit normally.
    if (
      /(Rigid_Control|Bow_Grip_Control|Nocked_Arrow_Control|Release_Emitter|Release_Nock|FreeHand_Rigid_Control)$/.test(
        node.name
      ) &&
      node.parent === scene
    )
      helpers.push(node)
  })
  const mouth = scene.getObjectByName('Dragon_Actual_Mouth_Emitter')
  if (mouth?.parent === scene) helpers.push(mouth)
  // Keep authored paw/toe paths while the torso changes weight. These rigs have
  // two-bone limbs below the driven torso; other roles retain their authored limbs.
  const limbs: {
    upper: THREE.Object3D
    lower: THREE.Object3D
    foot: THREE.Object3D
    a: THREE.Vector3
    b: THREE.Vector3
    c: THREE.Vector3
    q: THREE.Quaternion
    l1: number
    l2: number
  }[] = []
  if (role === 'wolf' || role === 'beetle')
    scene.traverse((foot) => {
      if (!foot.name.startsWith(role === 'wolf' ? 'paw' : 'toe')) return
      const lower = foot.parent,
        upper = lower?.parent
      if (!lower || !upper || upper === torso) return
      let ancestor: THREE.Object3D | null = upper.parent
      while (ancestor && ancestor !== torso) ancestor = ancestor.parent
      if (ancestor === torso)
        limbs.push({
          upper,
          lower,
          foot,
          a: new THREE.Vector3(),
          b: new THREE.Vector3(),
          c: new THREE.Vector3(),
          q: new THREE.Quaternion(),
          l1: 0,
          l2: 0
        })
    })
  const translationNodes = new Set([...helpers, ...(role === 'slime' ? [torso] : [])])
  const slimeBody =
    role === 'slime' ? (scene.getObjectByName('Slime_Rounded_Body') as THREE.SkinnedMesh | undefined) : undefined
  const surfacePoint = new THREE.Vector3()
  const minimumBodyY = () => {
    if (!slimeBody) return 0
    let low = Infinity
    for (let i = 0; i < slimeBody.geometry.attributes.position.count; i++) {
      slimeBody.getVertexPosition(i, surfacePoint).applyMatrix4(slimeBody.matrixWorld)
      low = Math.min(low, surfacePoint.y)
    }
    return low
  }
  const outputNodes = [...new Set([...driven, ...helpers, ...limbs.flatMap((l) => [l.upper, l.lower, l.foot])])]
  const rest = outputNodes.map((node) => ({
    node,
    position: node.position.clone(),
    quaternion: node.quaternion.clone(),
    scale: node.scale.clone()
  }))
  const samples = new Map(outputNodes.map((n) => [n, { q: [] as number[], p: [] as number[] }]))
  const extras = (source as THREE.AnimationClip & { userData?: { events?: { type: string; atMs: number }[] } }).userData
  // Breath is a separate authored action (Dragon releases at 480 ms, normal attack at 500 ms).
  const breathCue = source.name === 'breath' ? extras?.events?.find((e) => e.type === 'release')?.atMs : undefined
  const authoredCueSeconds = breathCue === undefined ? undefined : breathCue / 1000
  const times = new Set<number>([0, source.duration])
  // Retain the source's dense/uneven key boundaries. Sampling only at 60 Hz
  // can bridge a fast hand/tool turn and introduce visible grip drift.
  for (const track of source.tracks) for (const time of track.times) times.add(time)
  for (let i = 1; i < source.duration * 60; i++) times.add(i / 60)
  if (['attack', 'heal', 'breath'].includes(source.name)) {
    times.add(authoredCueSeconds ?? (ATTACK_PROFILES[role].cueMs / 1000) * (role === 'runner' ? 640 / 480 : 1))
  }
  // KeyframeTrack stores float32 times: remove knots that would become duplicates.
  const roundedTimes = new Map([...times].filter((t) => t >= 0 && t <= source.duration).map((t) => [Math.fround(t), t]))
  const clock = [...roundedTimes.values()].sort((a, b) => a - b)
  const mixer = new THREE.AnimationMixer(scene)
  const action = mixer.clipAction(source)
  action.setLoop(THREE.LoopOnce, 1)
  action.clampWhenFinished = true
  action.play()
  const inverse = new THREE.Matrix4(),
    delta = new THREE.Matrix4(),
    oldTorso = new THREE.Matrix4(),
    oldHead = new THREE.Matrix4()
  const rotation = new THREE.Quaternion(),
    parentRotation = new THREE.Quaternion(),
    sceneRotation = new THREE.Quaternion(),
    localRotation = new THREE.Quaternion(),
    euler = new THREE.Euler(),
    helperWorld = helpers.map(() => new THREE.Matrix4())
  const axis = new THREE.Vector3(),
    pole = new THREE.Vector3(),
    knee = new THREE.Vector3(),
    currentA = new THREE.Vector3(),
    currentB = new THREE.Vector3(),
    currentC = new THREE.Vector3(),
    from = new THREE.Vector3(),
    to = new THREE.Vector3(),
    aim = new THREE.Quaternion(),
    parentQ = new THREE.Quaternion()
  let minimumPoseWeight = 1,
    constrainedSamples = 0
  const aimBone = (bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3) => {
    bone.getWorldPosition(currentA)
    child.getWorldPosition(currentB)
    from.copy(currentB).sub(currentA).normalize()
    to.copy(target).sub(currentA).normalize()
    aim.setFromUnitVectors(from, to)
    bone.parent!.getWorldQuaternion(parentQ)
    aim.premultiply(parentQ.clone().invert()).multiply(parentQ)
    bone.quaternion.premultiply(aim)
    scene.updateWorldMatrix(true, true)
  }
  for (const t of clock) {
    action.enabled = true
    action.paused = false
    mixer.setTime(t)
    // Keep PropertyMixer's cached value and the actual pose in agreement. Resetting
    // to bind pose before setTime makes constant authored channels skip their writes.
    for (const r of rest) {
      r.position.copy(r.node.position)
      r.quaternion.copy(r.node.quaternion)
      r.scale.copy(r.node.scale)
    }
    scene.updateWorldMatrix(true, true)
    const originalBodyMinimumY = minimumBodyY()
    oldTorso.copy(torso.matrixWorld)
    if (head) oldHead.copy(head.matrixWorld)
    helpers.forEach((n, i) => helperWorld[i].copy(n.matrixWorld))
    for (const l of limbs) {
      l.upper.getWorldPosition(l.a)
      l.lower.getWorldPosition(l.b)
      l.foot.getWorldPosition(l.c)
      l.foot.getWorldQuaternion(l.q)
      l.l1 = l.a.distanceTo(l.b)
      l.l2 = l.b.distanceTo(l.c)
    }
    const pose = directedPose(role, source.name, t, source.duration, authoredCueSeconds)
    scene.getWorldQuaternion(sceneRotation)
    const rotateInModelAxes = (node: THREE.Object3D, pitch: number, yaw: number) => {
      node.parent?.getWorldQuaternion(parentRotation)
      localRotation.copy(parentRotation).invert().multiply(sceneRotation)
      rotation.setFromEuler(euler.set(pitch, yaw, 0))
      rotation.premultiply(localRotation).multiply(localRotation.invert())
      node.quaternion.premultiply(rotation)
    }
    const originalTorso = torso.quaternion.clone()
    const applyWeight = (weight: number) => {
      torso.quaternion.copy(originalTorso)
      rotateInModelAxes(torso, pose.pitch * weight, pose.yaw * weight)
      scene.updateWorldMatrix(true, true)
    }
    const reachable = () =>
      limbs.every((l) => {
        l.upper.getWorldPosition(currentA)
        const d = currentA.distanceTo(l.c)
        return d <= l.l1 + l.l2 + 1e-7 && d >= Math.abs(l.l1 - l.l2) - 1e-7
      })
    let weight = 1
    applyWeight(weight)
    if (limbs.length && !reachable()) {
      let low = 0,
        high = 1
      for (let i = 0; i < 14; i++) {
        const mid = (low + high) / 2
        applyWeight(mid)
        if (reachable()) low = mid
        else high = mid
      }
      weight = low
      applyWeight(weight)
      constrainedSamples++
      minimumPoseWeight = Math.min(minimumPoseWeight, weight)
    }
    if (head && head !== torso) rotateInModelAxes(head, -pose.pitch * weight * 0.45, -pose.yaw * weight * 0.55)
    scene.updateWorldMatrix(true, true)
    for (const l of limbs) {
      l.foot.getWorldPosition(currentC)
      if (currentC.distanceTo(l.c) > 1e-9) {
        l.upper.getWorldPosition(currentA)
        axis.copy(l.c).sub(currentA)
        const d = Math.max(1e-8, axis.length())
        axis.divideScalar(d)
        pole.copy(l.b).sub(currentA)
        pole.addScaledVector(axis, -pole.dot(axis))
        if (pole.lengthSq() < 1e-14) pole.set(1, 0, 0).addScaledVector(axis, -axis.x)
        pole.normalize()
        const along = (l.l1 * l.l1 - l.l2 * l.l2 + d * d) / (2 * d),
          height = Math.sqrt(Math.max(0, l.l1 * l.l1 - along * along))
        knee.copy(currentA).addScaledVector(axis, along).addScaledVector(pole, height)
        aimBone(l.upper, l.lower, knee)
        aimBone(l.lower, l.foot, l.c)
        l.foot.parent!.getWorldQuaternion(parentQ)
        l.foot.quaternion.copy(parentQ.invert().multiply(l.q))
        scene.updateWorldMatrix(true, true)
      }
    }
    scene.updateWorldMatrix(true, true)
    if (slimeBody) {
      // Gel is a deforming body control, not a rigid limb. Preserve the source
      // body's lowest surface throughout its authored hop/squash; rolling must
      // not add floor penetration or erase the original airborne clearance.
      const shift = originalBodyMinimumY - minimumBodyY()
      torso.getWorldPosition(surfacePoint)
      surfacePoint.y += shift
      torso.parent!.worldToLocal(surfacePoint)
      torso.position.copy(surfacePoint)
      scene.updateWorldMatrix(true, true)
    }
    helpers.forEach((node, i) => {
      const anchor = node === mouth && head ? head : torso
      inverse.copy(node === mouth && head ? oldHead : oldTorso).invert()
      delta.multiplyMatrices(anchor.matrixWorld, inverse).multiply(helperWorld[i])
      if (node.parent) delta.premultiply(inverse.copy(node.parent.matrixWorld).invert())
      // Authored arrows hide at zero scale after release. Decomposing that singular
      // matrix produces NaN quaternions, even though the original hidden pose is valid.
      if (Math.abs(delta.determinant()) < 1e-12) node.position.setFromMatrixPosition(delta)
      else delta.decompose(node.position, node.quaternion, new THREE.Vector3())
    })
    for (const node of outputNodes) {
      const s = samples.get(node)!
      s.q.push(...node.quaternion.toArray())
      s.p.push(...node.position.toArray())
    }
    for (const r of rest) {
      r.node.position.copy(r.position)
      r.node.quaternion.copy(r.quaternion)
      r.node.scale.copy(r.scale)
    }
  }
  mixer.stopAllAction()
  mixer.uncacheRoot(scene)
  const replacements = new Set(
    outputNodes.flatMap((n) => [`${n.name}.quaternion`, ...(translationNodes.has(n) ? [`${n.name}.position`] : [])])
  )
  // Unchanged keyframe arrays are immutable and can be shared just like the original clip.
  const tracks = source.tracks.filter((t) => !replacements.has(t.name))
  for (const node of outputNodes) {
    const s = samples.get(node)!
    tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, clock, s.q))
    if (translationNodes.has(node)) tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, clock, s.p))
  }
  const result = new THREE.AnimationClip(source.name, source.duration, tracks, source.blendMode)
  Object.assign(result, {
    userData: {
      ...structuredClone(extras ?? {}),
      directedMotionAudit: {
        samples: clock.length,
        footChains: limbs.map((l) => l.foot.name),
        minimumPoseWeight,
        constrainedSamples
      }
    }
  })
  let entries = cache.get(source)
  if (!entries) {
    entries = new Map()
    cache.set(source, entries)
  }
  entries.set(role, result)
  return result
}
