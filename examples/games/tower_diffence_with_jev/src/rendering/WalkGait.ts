import * as THREE from 'three'

export interface WalkGaitAudit {
  feet: string[]
  strideScale: number[]
  /** Largest unreachable target distance, in scene units (the foot stops short by this much). */
  reachShortfall: number
  /** Largest foot rise over its authored height (ground clearance and reach). */
  groundLift: number
}
interface Leg {
  upper: THREE.Object3D
  lower: THREE.Object3D
  foot: THREE.Object3D
  followers: THREE.Object3D[]
  /** Rigid skinned points of the leg (thigh, shin, foot) in their own bone spaces. */
  skin: [THREE.Object3D, THREE.Vector3[]][]
  pole: THREE.Vector3
  center: number
  k: number
  authored: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; q: THREE.Quaternion; end: THREE.Vector3 }[]
}
const cache = new WeakMap<THREE.AnimationClip, Map<string, THREE.AnimationClip>>()
const FOOT = /^(foot|paw|toe)([A-Z]{1,2}|\.[LR])$/

/** Points skinned mainly to `bone`, in that bone's own space. */
function skinPoints(scene: THREE.Object3D, bone: THREE.Object3D) {
  const points: THREE.Vector3[] = []
  scene.traverse((mesh) => {
    if (!(mesh instanceof THREE.SkinnedMesh)) return
    const index = mesh.skeleton.bones.indexOf(bone as THREE.Bone)
    if (index < 0) return
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes
    const toBone = mesh.skeleton.boneInverses[index].clone().multiply(mesh.bindMatrix)
    for (let i = 0; i < position.count; i++)
      for (let j = 0; j < 4; j++)
        if (skinIndex.getComponent(i, j) === index && skinWeight.getComponent(i, j) >= 0.5)
          points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(toBone))
  })
  if (!points.length) return [new THREE.Vector3()] // Unskinned feet fall back to the ankle itself.
  // Only hull extremes can be lowest; keep the extreme point along 128 spread directions.
  const extremes = new Set<THREE.Vector3>()
  const direction = new THREE.Vector3()
  for (let i = 0; i < 128; i++) {
    const y = 1 - (2 * i + 1) / 128,
      r = Math.sqrt(1 - y * y),
      a = i * Math.PI * (3 - Math.sqrt(5))
    direction.set(Math.cos(a) * r, y, Math.sin(a) * r)
    let best = points[0]
    for (const p of points) if (p.dot(direction) > best.dot(direction)) best = p
    extremes.add(best)
  }
  return [...extremes]
}

/**
 * Lengthen an authored walk so each stance foot moves backward by `travel` scene units per
 * loop: the horizontal foot excursion is scaled about its centre, keeping authored lift,
 * timing, phase and foot orientation. Legs are re-solved as constant-length two-bone IK with
 * a non-flipping knee pole. Soles never go below `groundY`. Torso, pelvis and rigid tools keep
 * their tracks; only leg chains (and Ranger's toe skin helpers) change. Cached per source clip.
 */
export function walkGaitClip(
  scene: THREE.Object3D,
  source: THREE.AnimationClip,
  travel: number,
  groundY: number
): THREE.AnimationClip {
  if (source.name !== 'walk') return source
  const key = `${travel}:${groundY}`
  const prior = cache.get(source)?.get(key)
  if (prior) return prior
  scene.updateWorldMatrix(true, true)
  const legs: Leg[] = []
  scene.traverse((foot) => {
    if (!(foot instanceof THREE.Bone) || !FOOT.test(foot.name)) return
    const side = foot.name.replace(/^(foot|paw|toe)/, '')
    // Tank/Soldier feet are independent root bones; their shin is found by side.
    const lower =
      foot.parent instanceof THREE.Bone && foot.parent.name !== 'root'
        ? foot.parent
        : scene.getObjectByName(`shin${side}`)
    const upper = lower?.parent
    if (!lower || !(upper instanceof THREE.Bone)) return
    const followers: THREE.Object3D[] = []
    scene.traverse((node) => {
      if (node.name.startsWith('skin_bind_toe_') && node.name.endsWith(side)) followers.push(node)
    })
    legs.push({
      upper,
      lower,
      foot,
      followers,
      // A root-parented foot's leg skin stretches toward it; only the foot's own skin is rigid.
      skin: (foot.parent === lower ? [upper, lower, foot] : [foot]).map((bone) => [bone, skinPoints(scene, bone)]),
      pole: new THREE.Vector3(),
      center: 0,
      k: 1,
      authored: []
    })
  })
  if (!legs.length) return source

  const times = new Set<number>([0, source.duration])
  for (const track of source.tracks) for (const time of track.times) times.add(time)
  for (let i = 1; i < source.duration * 60; i++) times.add(i / 60)
  const clock = [
    ...new Map([...times].filter((t) => t >= 0 && t <= source.duration).map((t) => [Math.fround(t), t])).values()
  ].sort((a, b) => a - b)
  const mixer = new THREE.AnimationMixer(scene)
  const action = mixer.clipAction(source)
  action.setLoop(THREE.LoopOnce, 1)
  action.clampWhenFinished = true
  action.play()
  const offset = new THREE.Vector3()
  const at = (t: number) => {
    // A clamped LoopOnce action pauses at its end; reopen it for every sample.
    action.enabled = true
    action.paused = false
    mixer.setTime(t)
  }
  for (const t of clock) {
    at(t)
    scene.updateWorldMatrix(true, true)
    for (const leg of legs) {
      const a = leg.upper.getWorldPosition(new THREE.Vector3())
      const b = leg.lower.getWorldPosition(new THREE.Vector3())
      const c = leg.foot.getWorldPosition(new THREE.Vector3())
      leg.authored.push({
        a,
        b,
        c,
        q: leg.foot.getWorldQuaternion(new THREE.Quaternion()),
        end: leg.lower.worldToLocal(c.clone())
      })
      const axis = c.clone().sub(a).normalize()
      offset.copy(b).sub(a)
      leg.pole.add(offset.addScaledVector(axis, -offset.dot(axis)))
    }
  }
  // Mean backward speed while the foot moves back, per loop (as the stance foot is measured).
  const backSpeed = (z: number[]) => {
    let back = 0,
      span = 0
    for (let i = 1; i < clock.length; i++)
      if (z[i] < z[i - 1]) {
        back += z[i - 1] - z[i]
        span += (clock[i] - clock[i - 1]) / source.duration
      }
    return span > 0 ? back / span : 0
  }
  for (const leg of legs) {
    // Scale the foot's excursion relative to the hip: authored body sway/surge passes through unscaled.
    const z = leg.authored.map((s) => s.c.z - s.a.z)
    leg.center = (Math.min(...z) + Math.max(...z)) / 2
    const speed = backSpeed(z)
    leg.k = speed > 1e-6 ? THREE.MathUtils.clamp(travel / speed, 0.5, 8) : 1
    // Straight authored legs carry no bend; their knees bend forward (+Z faces the walk). The pole
    // also leans up, so a leg reaching forward bends its knee upward instead of twisting about it.
    const bend = leg.pole.length() / clock.length
    if (bend < 1e-4) leg.pole.set(0, 0, 1)
    leg.pole.normalize().multiplyScalar(2).y += 1
    leg.pole.normalize()
  }

  const outputs = [...new Set(legs.flatMap((l) => [l.upper, l.lower, l.foot, ...l.followers]))]
  const moved = new Set(legs.flatMap((l) => (l.foot.parent === l.lower ? l.followers : [l.foot, ...l.followers])))
  let samples = new Map<THREE.Object3D, { q: number[]; p: number[] }>()
  const target = new THREE.Vector3(),
    knee = new THREE.Vector3(),
    axis = new THREE.Vector3(),
    pole = new THREE.Vector3(),
    current = new THREE.Vector3(),
    tip = new THREE.Vector3(),
    from = new THREE.Vector3(),
    to = new THREE.Vector3(),
    aim = new THREE.Quaternion(),
    parentQ = new THREE.Quaternion(),
    matrix = new THREE.Matrix4(),
    delta = new THREE.Matrix4(),
    point = new THREE.Vector3()
  const audit: WalkGaitAudit = {
    feet: legs.map((l) => l.foot.name),
    strideScale: [],
    reachShortfall: 0,
    groundLift: 0
  }
  // Rotate `bone` so that `tip` (a point fixed in its own frame) lands on the direction of `goal`.
  const aimBone = (bone: THREE.Object3D, tip: THREE.Vector3, goal: THREE.Vector3) => {
    bone.getWorldPosition(current)
    from.copy(tip).sub(current).normalize()
    to.copy(goal).sub(current).normalize()
    aim.setFromUnitVectors(from, to)
    bone.parent!.getWorldQuaternion(parentQ)
    aim.premultiply(parentQ.clone().invert()).multiply(parentQ)
    bone.quaternion.premultiply(aim)
    bone.updateWorldMatrix(false, true)
  }
  const solve = (leg: Leg, s: Leg['authored'][number]) => {
    const l1 = s.a.distanceTo(s.b),
      l2 = s.b.distanceTo(s.c),
      reach = l1 + l2
    const chained = leg.foot.parent === leg.lower
    // Out of reach: the foot stops short along the hip-target line (a continuous, slightly
    // shorter stride) rather than hyperextending. Root-parented feet (Tank, Soldier) are skinned
    // independently and keep their target.
    if (chained) audit.reachShortfall = Math.max(audit.reachShortfall, target.distanceTo(s.a) - reach)
    // Soft reach: the knee eases into full extension instead of snapping at the singularity.
    const raw = target.distanceTo(s.a),
      soft = 0.04 * (l1 + l2),
      start = l1 + l2 - soft
    const d =
      raw > start ? start + soft * (1 - Math.exp(-(raw - start) / soft)) : Math.max(raw, Math.abs(l1 - l2) + 1e-6)
    // 1. Knee angle: a hinge turn in the authored bend plane. As the authored leg straightens its
    // plane fades continuously to the role's knee pole, so the knee never flips or twists.
    from.copy(s.a).sub(s.b)
    to.copy(s.c).sub(s.b)
    axis.crossVectors(from, to).divideScalar(l1 * l2)
    pole.copy(s.c).sub(s.a).cross(leg.pole)
    if (pole.lengthSq() > 1e-12) axis.addScaledVector(pole.normalize(), 0.1)
    const bend = Math.acos(THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1)) - from.angleTo(to)
    aim.setFromAxisAngle(axis.normalize(), bend)
    leg.lower.parent!.getWorldQuaternion(parentQ)
    aim.premultiply(parentQ.clone().invert()).multiply(parentQ)
    leg.lower.quaternion.premultiply(aim)
    leg.lower.updateWorldMatrix(false, true)
    // 2. Swing the whole leg from the hip onto the target (a small shortest-arc turn).
    knee.copy(target).sub(s.a).setLength(d).add(s.a)
    aimBone(leg.upper, leg.lower.localToWorld(tip.copy(s.end)), knee)
    knee.copy(leg.lower.localToWorld(tip.copy(s.end)))
    matrix.compose(chained ? knee : target, s.q, leg.foot.getWorldScale(point))
    leg.foot.parent!.updateWorldMatrix(false, false)
    matrix.premultiply(delta.copy(leg.foot.parent!.matrixWorld).invert())
    matrix.decompose(leg.foot.position, leg.foot.quaternion, point)
    leg.foot.updateWorldMatrix(false, true)
  }
  const initial = legs.map((l) => l.k)
  const bake = () => {
    samples = new Map(outputs.map((n) => [n, { q: [] as number[], p: [] as number[] }]))
    const solved = legs.map(() => [] as number[])
    audit.reachShortfall = audit.groundLift = 0
    clock.forEach((t, i) => {
      at(t)
      const restore = outputs.map((n) => ({ n, p: n.position.clone(), q: n.quaternion.clone() }))
      scene.updateWorldMatrix(true, true)
      for (const leg of legs) {
        const s = leg.authored[i]
        const before = leg.foot.matrixWorld.clone()
        target.copy(s.c)
        target.z = s.a.z + leg.center + (s.c.z - s.a.z - leg.center) * leg.k
        solve(leg, s)
        // The longer stride may sink the sole or a low shin; lift the foot and re-solve.
        for (let pass = 0; pass < 4; pass++) {
          let low = Infinity
          for (const [bone, points] of leg.skin)
            for (const p of points) low = Math.min(low, point.copy(p).applyMatrix4(bone.matrixWorld).y)
          if (low >= groundY - 1e-6) break
          // Lift from the solved height so repeated passes converge even when reach-limited.
          const y = leg.foot.getWorldPosition(point).y + groundY - low
          target.copy(s.c)
          target.z = s.a.z + leg.center + (s.c.z - s.a.z - leg.center) * leg.k
          target.y = y
          for (const r of restore) {
            if (r.n !== leg.upper && r.n !== leg.lower && r.n !== leg.foot) continue
            r.n.position.copy(r.p)
            r.n.quaternion.copy(r.q)
          }
          leg.upper.updateWorldMatrix(false, true)
          leg.foot.updateWorldMatrix(false, true)
          solve(leg, s)
        }
        leg.foot.getWorldPosition(point)
        solved[legs.indexOf(leg)].push(point.z)
        audit.groundLift = Math.max(audit.groundLift, point.y - s.c.y)
        // Independent toe skin helpers keep their authored relation to the foot.
        delta.multiplyMatrices(leg.foot.matrixWorld, before.invert())
        for (const node of leg.followers) {
          node.updateWorldMatrix(true, false)
          matrix
            .multiplyMatrices(delta, node.matrixWorld)
            .premultiply(new THREE.Matrix4().copy(node.parent!.matrixWorld).invert())
          matrix.decompose(node.position, node.quaternion, point)
          node.updateWorldMatrix(false, true)
        }
      }
      for (const node of outputs) {
        const sample = samples.get(node)!
        sample.q.push(...node.quaternion.toArray())
        sample.p.push(...node.position.toArray())
      }
      for (const r of restore) {
        r.n.position.copy(r.p)
        r.n.quaternion.copy(r.q)
      }
    })
    return solved.map(backSpeed)
  }
  // Reach limits and ground lift shorten the solved stance; recalibrate each leg's stride
  // (bounded) until its solved stance speed matches the travel.
  for (let round = 0; round < 3; round++) {
    const speeds = bake()
    if (speeds.every((v) => Math.abs(v / travel - 1) < 0.01) || round === 2) break
    legs.forEach((leg, i) => {
      if (speeds[i] > 1e-6) leg.k = THREE.MathUtils.clamp((leg.k * travel) / speeds[i], 0.5, initial[i] * 1.5)
    })
  }
  audit.strideScale = legs.map((l) => +l.k.toFixed(3))
  mixer.stopAllAction()
  mixer.uncacheRoot(scene)
  scene.updateWorldMatrix(true, true)
  const replaced = new Set(
    outputs.flatMap((n) => [`${n.name}.quaternion`, ...(moved.has(n) ? [`${n.name}.position`] : [])])
  )
  const tracks = source.tracks.filter((track) => !replaced.has(track.name))
  for (const node of outputs) {
    const sample = samples.get(node)!
    tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, clock, sample.q))
    if (moved.has(node)) tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, clock, sample.p))
  }
  const result = new THREE.AnimationClip(source.name, source.duration, tracks, source.blendMode)
  const extras = (source as THREE.AnimationClip & { userData?: Record<string, unknown> }).userData
  Object.assign(result, { userData: { ...structuredClone(extras ?? {}), walkGaitAudit: audit } })
  let entries = cache.get(source)
  if (!entries) cache.set(source, (entries = new Map()))
  entries.set(key, result)
  return result
}
