import * as THREE from 'three'
import type { UnitType } from '../game/model'
import { ATTACK_PROFILES } from '../game/AttackProfiles'

/** Pose direction over immutable rest/bind rigs. Limb segment lengths, scale and combat clocks stay authored.
 * Optional attack accents: `strike` replaces `pitch` for the wind-up/contact (negative leans in),
 * `kick` is a sharp torso pitch right after the cue (negative recoils back, positive follows
 * through) and `crouch` drops a planted-leg torso by that fraction of leg reach into the strike. */
export const MOTION_DIRECTION: Record<
  UnitType,
  { torso: string; pitch: number; twist: number; settle: number; strike?: number; kick?: number; crouch?: number }
> = {
  soldier: { torso: 'chest', pitch: 0.36, twist: 0.28, settle: 0.12 },
  runner: { torso: 'chest', pitch: 0.22, twist: 0.1, settle: 0.1 },
  tank: { torso: 'chest', pitch: 0.16, twist: 0.08, settle: 0.14 },
  paladin: { torso: 'chest', pitch: 0.21, twist: 0.26, settle: 0.15 },
  archer: { torso: 'chest', pitch: 0.1, twist: 0.13, settle: 0.1 },
  ranger: { torso: 'chest', pitch: 0.12, twist: 0.16, settle: 0.12 },
  cannon: { torso: 'chest', pitch: 0.18, twist: 0.06, settle: 0.23, strike: -0.2, kick: -0.34 },
  mage: { torso: 'chest', pitch: 0.28, twist: 0.24, settle: 0.12 },
  frost: { torso: 'chest', pitch: 0.14, twist: -0.16, settle: 0.11 },
  healer: { torso: 'chest', pitch: 0.12, twist: 0.12, settle: 0.08 },
  goblin: { torso: 'chest', pitch: 0.26, twist: -0.24, settle: 0.14 },
  shaman: { torso: 'chest', pitch: 0.2, twist: -0.2, settle: 0.14 },
  brute: { torso: 'chest', pitch: 0.25, twist: 0.2, settle: 0.2 },
  ogre: { torso: 'chest', pitch: 0.36, twist: -0.3, settle: 0.22 },
  wolf: { torso: 'chest', pitch: 0.18, twist: 0, settle: 0.12 },
  beetle: { torso: 'body', pitch: 0.1, twist: 0, settle: 0.08, strike: 0.24, crouch: 0.15 },
  bat: { torso: 'body', pitch: 0.22, twist: 0, settle: 0.16 },
  wraith: { torso: 'body', pitch: 0.15, twist: 0.2, settle: 0.13, strike: 0.28, kick: 0.3 },
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
    return { pitch: Math.sin(cycle * 2) * p.pitch * weight, yaw: Math.sin(cycle) * p.twist * weight, drop: 0 }
  }
  const profile = ATTACK_PROFILES[role]
  const cue = authoredCueSeconds ?? (profile.cueMs / 1000) * (role === 'runner' ? 640 / 480 : 1)
  const wind = pulse(t, 0, cue * 0.68, cue)
  const after = Math.max(0.001, duration - cue)
  const settle = pulse(t, cue, cue + after * 0.18, duration)
  // Release poses remain exact, including the authored staff/bow/mouth emitter.
  const contact = profile.cue === 'hit' ? pulse(t, cue * 0.68, cue, cue + after * 0.52) : 0
  const kick = (p.kick ?? 0) * pulse(t, cue, cue + 0.06, cue + after * 0.6),
    strike = p.strike ?? p.pitch
  return {
    pitch: -wind * strike + contact * strike * 0.65 - settle * p.settle + kick,
    yaw: -wind * p.twist + contact * p.twist * 0.7 - settle * p.twist * 0.25,
    drop: contact * (p.crouch ?? 0)
  }
}

// Some exported limb tracks contain solver flips: a bone turns 50-180 deg within one or a
// few dense keys (Brute fists, Runner elbows, Mage knees) and pops for a frame. Authored
// motion stays below ~18 deg/ms (Wolf paw landing); flips exceed 20 deg/ms. A flip is
// re-keyed across its unbranched limb segment from calm pose to calm pose; a pose held
// for less than two frames between flips is part of the same glitch. Rigid tool controls
// are not bones and keep their authored keys.
const FLIP_RATE = (20000 * Math.PI) / 180
const CALM_RATE = (4000 * Math.PI) / 180
const FLIP_NOISE = (0.5 * Math.PI) / 180
const FLIP_PAD = 1 / 120
const FLIP_HOLD = 1 / 30
const repairs = new WeakMap<THREE.AnimationClip, THREE.AnimationClip>()
export function repairKeyFlips(scene: THREE.Object3D, source: THREE.AnimationClip): THREE.AnimationClip {
  const prior = repairs.get(source)
  if (prior) return prior
  const a = new THREE.Quaternion(),
    b = new THREE.Quaternion()
  // Sub-degree changes never pop; they also cover float noise across duplicate key times.
  const turn = (from: THREE.Quaternion, to: THREE.Quaternion, dt: number) => {
    const angle = from.angleTo(to)
    return angle < FLIP_NOISE ? 0 : angle / Math.max(1e-9, dt)
  }
  const rate = (track: THREE.KeyframeTrack, k: number) =>
    turn(a.fromArray(track.values, (k - 1) * 4), b.fromArray(track.values, k * 4), track.times[k] - track.times[k - 1])
  const tracks = new Map<THREE.Object3D, THREE.KeyframeTrack>()
  for (const track of source.tracks) {
    if (!(track instanceof THREE.QuaternionKeyframeTrack) || track.getInterpolation() !== THREE.InterpolateLinear)
      continue
    const node = scene.getObjectByName(THREE.PropertyBinding.parseTrackName(track.name).nodeName)
    if (node instanceof THREE.Bone) tracks.set(node, track)
  }
  const only = (node: THREE.Object3D) => {
    const bones = node.children.filter((c) => c instanceof THREE.Bone)
    return bones.length === 1 ? bones[0] : undefined
  }
  const flips = new Map<THREE.Object3D, { chain: THREE.Object3D[]; spans: [number, number][] }>()
  for (const [bone, track] of tracks) {
    const n = track.times.length
    for (let k = 1; k < n; k++) {
      if (rate(track, k) <= FLIP_RATE) continue
      let lo = k - 1,
        hi = k
      while (lo > 0 && rate(track, lo) > CALM_RATE) lo--
      while (hi < n - 1 && rate(track, hi + 1) > CALM_RATE) hi++
      const chain = [bone]
      while (chain[0].parent instanceof THREE.Bone && only(chain[0].parent) === chain[0]) chain.unshift(chain[0].parent)
      for (let next = only(bone); next; next = only(next)) chain.push(next)
      const entry = flips.get(chain[0]) ?? { chain, spans: [] }
      entry.spans.push([track.times[lo] - FLIP_PAD, track.times[hi] + FLIP_PAD])
      flips.set(chain[0], entry)
      k = hi
    }
  }
  const output = new Map<THREE.KeyframeTrack, Float32Array>()
  const write = (track: THREE.KeyframeTrack, k: number, q: THREE.Quaternion) => {
    if (!output.has(track)) output.set(track, Float32Array.from(track.values))
    q.toArray(output.get(track)!, k * 4)
  }
  const sample = (track: THREE.KeyframeTrack) => {
    const interpolant = new THREE.QuaternionLinearInterpolant(track.times, track.values, 4)
    return (t: number) => new THREE.Quaternion().fromArray(interpolant.evaluate(t))
  }
  const offset = (node: THREE.Object3D, t: number) => {
    const track = source.tracks.find((x) => x.name === `${node.name}.position`)
    return track
      ? new THREE.Vector3().fromArray(new THREE.LinearInterpolant(track.times, track.values, 3).evaluate(t))
      : node.position.clone()
  }
  const audit: { track: string; start: number; end: number; grip: boolean }[] = []
  for (const { chain, spans } of flips.values()) {
    const merged: [number, number][] = []
    for (const [s, e] of spans.sort((x, y) => x[0] - y[0])) {
      const last = merged.at(-1)
      if (last && s - last[1] < FLIP_HOLD) last[1] = Math.max(last[1], e)
      else merged.push([s, e])
    }
    const limb = chain.map((n) => tracks.get(n)!)
    for (const [s, e] of merged) {
      const start = Math.max(0, s),
        end = Math.min(source.duration, e)
      const weight = (t: number) => smooth((t - start) / (end - start))
      const inside = (track: THREE.KeyframeTrack) =>
        [...track.times.keys()].filter((k) => track.times[k] > start && track.times[k] < end)
      // Three-bone limb whose end (hand on a spear, planted foot) holds while the middle
      // joint flips: keep the end's authored transform and swing the elbow/knee pole
      // continuously around the shoulder-to-end axis instead.
      const [upper, lower, end3] = limb.length === 3 && limb.every((t) => t) ? limb : []
      if (
        upper &&
        upper.times.length === lower.times.length &&
        upper.times.length === end3.times.length &&
        upper.times.every((t, k) => t === lower.times[k] && t === end3.times[k])
      ) {
        const [qa, qb, qc] = limb.map(sample),
          bOffset = offset(chain[1], start),
          cOffset = offset(chain[2], start),
          l1 = bOffset.length(),
          l2 = cOffset.length()
        const pose = (t: number) => {
          const ua = qa(t),
            ub = qb(t)
          return {
            ua,
            ub,
            elbow: bOffset.clone().applyQuaternion(ua),
            reach: cOffset.clone().applyQuaternion(ub).add(bOffset).applyQuaternion(ua),
            end: ua.clone().multiply(ub).multiply(qc(t))
          }
        }
        const from = pose(start),
          to = pose(end),
          keys = inside(upper),
          poses = keys.map((k) => pose(upper.times[k]))
        const held = poses.every(
          (p, i) =>
            !i ||
            (turn(poses[i - 1].end, p.end, upper.times[keys[i]] - upper.times[keys[i - 1]]) <= FLIP_RATE &&
              p.reach.distanceTo(poses[i - 1].reach) / (l1 + l2) / (upper.times[keys[i]] - upper.times[keys[i - 1]]) <=
                FLIP_RATE)
        )
        // The pole reference is carried along the moving shoulder-to-end axis (no twist),
        // then turned once, gradually, onto the authored end pole.
        const axes = [from, ...poses, to].map((p) => p.reach.clone().normalize())
        const perp = (v: THREE.Vector3, axis: THREE.Vector3) => v.clone().addScaledVector(axis, -v.dot(axis))
        const q = new THREE.Quaternion(),
          poles = [perp(from.elbow, axes[0])]
        for (let i = 1; i < axes.length; i++)
          poles.push(perp(poles[i - 1].clone().applyQuaternion(q.setFromUnitVectors(axes[i - 1], axes[i])), axes[i]))
        const last = poles.at(-1)!,
          goal = perp(to.elbow, axes.at(-1)!)
        if (held && keys.length && Math.min(poles[0].length(), goal.length()) > 1e-3 * l1) {
          const turnBy = Math.atan2(axes.at(-1)!.dot(last.clone().cross(goal)), last.dot(goal))
          keys.forEach((k, i) => {
            const w = weight(upper.times[k]),
              { reach, end: hand } = poses[i],
              axis = axes[i + 1]
            const d = Math.max(1e-8, reach.length()),
              along = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
            const elbow = poles[i + 1]
              .normalize()
              .applyQuaternion(q.setFromAxisAngle(axis, w * turnBy))
              .multiplyScalar(Math.sqrt(Math.max(0, l1 * l1 - along * along)))
              .addScaledVector(axis, along)
            const ua = from.ua.clone().slerp(to.ua, w)
            ua.premultiply(
              q.setFromUnitVectors(bOffset.clone().applyQuaternion(ua).normalize(), elbow.clone().normalize())
            )
            const ub = from.ub.clone().slerp(to.ub, w)
            const world = ua.clone().multiply(ub)
            world.premultiply(
              q.setFromUnitVectors(
                cOffset.clone().applyQuaternion(world).normalize(),
                reach.clone().sub(elbow).normalize()
              )
            )
            write(upper, k, ua)
            write(lower, k, ub.copy(ua).invert().multiply(world))
            write(end3, k, world.invert().multiply(hand))
          })
          for (const track of limb) audit.push({ track: track.name, start, end, grip: true })
          continue
        }
      }
      for (const track of limb) {
        if (!track) continue
        const keys = inside(track)
        // Calm segment members keep their authored keys.
        if (!keys.some((k) => k > 0 && rate(track, k) > CALM_RATE)) continue
        const q = sample(track),
          qs = q(start),
          qe = q(end)
        for (const k of keys) write(track, k, qs.clone().slerp(qe, weight(track.times[k])))
        audit.push({ track: track.name, start, end, grip: false })
      }
    }
  }
  let repaired = source
  if (output.size) {
    const tracks = source.tracks.map((t) =>
      output.has(t) ? new THREE.QuaternionKeyframeTrack(t.name, t.times, output.get(t)!) : t
    )
    repaired = new THREE.AnimationClip(source.name, source.duration, tracks, source.blendMode)
    const extras = (source as THREE.AnimationClip & { userData?: object }).userData
    Object.assign(repaired, { userData: { ...extras, keyFlipRepairs: audit } })
  }
  repairs.set(source, repaired)
  return repaired
}

/** Full added torso weight change takes at least 100 ms. */
const POSE_WEIGHT_RATE = 10

/** Bake a small set of corrected tracks once per source clip, before ordinary playback/adapters.
 * Independent rigid tools follow the torso's world delta, retaining the existing grip.
 * No geometry, skin weights, source tracks, material extras or game events are mutated.
 */
export function directMotionClip(
  scene: THREE.Object3D,
  original: THREE.AnimationClip,
  role: UnitType
): THREE.AnimationClip {
  // Every GLB source clip (authored motion repairs and death included) first loses key flips.
  const source = repairKeyFlips(scene, original)
  // These actions already coordinate torso, planted feet and rigid grips.
  // A second torso pass would invalidate the authored IK/contact solution.
  if ((source as THREE.AnimationClip & { userData?: { motionRepair?: unknown } }).userData?.motionRepair) return source
  if (!['idle', 'walk', 'attack', 'heal', 'breath'].includes(source.name)) return source
  // These authored clips already solve shoulder/hip weight transfer and foot contacts.
  const authored = source as THREE.AnimationClip & { userData?: { proximalMotionVersion?: number } }
  if ((role === 'wolf' || role === 'brute') && authored.userData?.proximalMotionVersion === 1) return source
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
  const translationNodes = new Set([...helpers, ...(role === 'slime' || profile.crouch ? [torso] : [])])
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
  // A rigid tool reaching out from a directed joint (Soldier sword) stays above the floor
  // the body starts the clip on: the joint turns the tool up just enough, only while
  // needed, so the correction fades in and out continuously. Tools held at their
  // centre (Tank shield) cannot be lifted by turning the wrist and keep their pose.
  const carried = new Map<THREE.Object3D, { meshes: THREE.Mesh[]; tool: THREE.Mesh }>()
  scene.updateWorldMatrix(true, true)
  torso.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || node instanceof THREE.SkinnedMesh) return
    let carrier = node.parent
    while (carrier && !(carrier instanceof THREE.Bone)) carrier = carrier.parent
    if (!carrier || driven.includes(carrier)) return
    if (!node.geometry.boundingSphere) node.geometry.computeBoundingSphere()
    const entry = carried.get(carrier) ?? { meshes: [] as THREE.Mesh[], tool: node }
    entry.meshes.push(node)
    if (node.geometry.boundingSphere!.radius > entry.tool.geometry.boundingSphere!.radius) entry.tool = node
    carried.set(carrier, entry)
  })
  const toolCentre = (tool: THREE.Mesh) =>
    surfacePoint.copy(tool.geometry.boundingSphere!.center).applyMatrix4(tool.matrixWorld)
  for (const [carrier, { tool }] of carried) {
    const reach = toolCentre(tool).distanceTo(carrier.getWorldPosition(new THREE.Vector3()))
    if (reach < 0.5 * tool.geometry.boundingSphere!.radius * tool.matrixWorld.getMaxScaleOnAxis())
      carried.delete(carrier)
  }
  // Rigid meshes whose bounding sphere clears `above` are skipped: only near-ground tools are
  // scanned. Dense skinned bodies (the stance floor) are sampled at every 8th vertex.
  const lowest = (meshes: THREE.Object3D[], above = Infinity) => {
    let low = Infinity
    for (const mesh of meshes as THREE.Mesh[]) {
      const sphere = mesh.geometry.boundingSphere
      if (sphere && toolCentre(mesh).y - sphere.radius * mesh.matrixWorld.getMaxScaleOnAxis() >= above) continue
      const step = mesh instanceof THREE.SkinnedMesh ? 8 : 1
      for (let i = 0; i < mesh.geometry.attributes.position.count; i += step)
        low = Math.min(low, mesh.getVertexPosition(i, surfacePoint).applyMatrix4(mesh.matrixWorld).y)
    }
    return low
  }
  let floor: number | undefined
  const corrected = new Set<THREE.Object3D>()
  const outputNodes = [
    ...new Set([...driven, ...helpers, ...limbs.flatMap((l) => [l.upper, l.lower, l.foot]), ...carried.keys()])
  ]
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
  // Reachable torso weight is searched per sample first, then slope-limited: where a
  // source leg passes full extension (Wolf attack 0.43 s) the added torso pose fades
  // over several frames instead of dropping out and back within a few milliseconds.
  const weights: number[] = []
  const passes = (limbs.length ? [0, 1] : [1]).flatMap((pass) => clock.map((t, index) => [pass, index, t] as const))
  for (const [pass, index, t] of passes) {
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
    if (pass && carried.size) {
      const tools = [...carried.values()].flatMap((c) => c.meshes)
      floor ??= lowest(scene.getObjectsByProperty('isMesh', true).filter((mesh) => !tools.includes(mesh as THREE.Mesh)))
    }
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
    const originalTorso = torso.quaternion.clone(),
      originalPosition = torso.position.clone(),
      reach = limbs.reduce((sum, l) => sum + l.l1 + l.l2, 0) / Math.max(1, limbs.length)
    const applyWeight = (weight: number) => {
      torso.quaternion.copy(originalTorso)
      rotateInModelAxes(torso, pose.pitch * weight, pose.yaw * weight)
      if (pose.drop) {
        torso.parent!.localToWorld(surfacePoint.copy(originalPosition)).y -= pose.drop * weight * reach
        torso.position.copy(torso.parent!.worldToLocal(surfacePoint))
      }
      scene.updateWorldMatrix(true, true)
    }
    const reachable = () =>
      limbs.every((l) => {
        l.upper.getWorldPosition(currentA)
        const d = currentA.distanceTo(l.c)
        return d <= l.l1 + l.l2 + 1e-7 && d >= Math.abs(l.l1 - l.l2) - 1e-7
      })
    let weight = weights[index] ?? 1
    applyWeight(weight)
    if (!pass) {
      if (!reachable()) {
        let low = 0,
          high = 1
        for (let i = 0; i < 14; i++) {
          const mid = (low + high) / 2
          applyWeight(mid)
          if (reachable()) low = mid
          else high = mid
        }
        weight = low
        constrainedSamples++
      }
      weights.push(weight)
      for (const r of rest) {
        r.node.position.copy(r.position)
        r.node.quaternion.copy(r.quaternion)
        r.node.scale.copy(r.scale)
      }
      if (index < clock.length - 1) continue
      for (let i = 1; i < clock.length; i++)
        weights[i] = Math.min(weights[i], weights[i - 1] + (clock[i] - clock[i - 1]) * POSE_WEIGHT_RATE)
      for (let i = clock.length - 2; i >= 0; i--)
        weights[i] = Math.min(weights[i], weights[i + 1] + (clock[i + 1] - clock[i]) * POSE_WEIGHT_RATE)
      minimumPoseWeight = Math.min(...weights)
      continue
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
    for (const [carrier, { meshes, tool }] of carried) {
      if (lowest(meshes, floor) >= floor!) continue
      carrier.getWorldPosition(currentA)
      axis
        .copy(toolCentre(tool))
        .sub(currentA)
        .cross(currentB.set(0, 1, 0))
      if (axis.lengthSq() < 1e-12) continue
      axis.normalize()
      carrier.parent!.getWorldQuaternion(parentQ)
      const authored = carrier.quaternion.clone()
      const turn = (angle: number) => {
        aim.setFromAxisAngle(axis, angle).premultiply(parentQ.clone().invert()).multiply(parentQ)
        carrier.quaternion.copy(authored).premultiply(aim)
        scene.updateWorldMatrix(true, true)
        return lowest(meshes, floor) >= floor!
      }
      let low = 0,
        high = Math.PI / 2
      for (let i = 0; i < 10; i++) {
        const mid = (low + high) / 2
        if (turn(mid)) high = mid
        else low = mid
      }
      turn(high)
      corrected.add(carrier)
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
  const emitted = outputNodes.filter((n) => !carried.has(n) || corrected.has(n))
  const replacements = new Set(
    emitted.flatMap((n) => [`${n.name}.quaternion`, ...(translationNodes.has(n) ? [`${n.name}.position`] : [])])
  )
  // Unchanged keyframe arrays are immutable and can be shared just like the original clip.
  const tracks = source.tracks.filter((t) => !replacements.has(t.name))
  for (const node of emitted) {
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
