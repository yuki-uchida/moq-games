/** Reproducible refinement of ally ultimate clips (effects/special/motions).
 * Scales each edited bone's local deviation from the clip's t=0 idle pose (timing,
 * cues and idle return unchanged), then rebuilds rigid weapon control tracks from the
 * holding hand by FK on the runtime idle GLB, using the t=0 hand->weapon transform.
 * Input is the authored clip at ORIGINAL_COMMIT (verified by SHA-256).
 * Run from repository root: node scripts/refine-special-motions.mjs
 */
import fs from 'node:fs'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import * as THREE from 'three'

const dir = 'public/tower-defense-art/effects/special/motions'
const models = 'public/tower-defense-art/models'
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex')
const X = new THREE.Vector3(1, 0, 0)
// gain: multiply local deviation angle; pitch: extra local X rotation = factor * chest deviation angle (signed by chest X).
const EDITS = {
  ranger: {
    // Original chest pitch peaks at 62 deg; the hat then hides face and bow from the game camera.
    model: 'ranger/ranger-idle-candidate.glb',
    input: 'f34c5a184aecb66cd44315fb65d56cd47a5279f928a4014db0beb6601722a453',
    gain: { chest: 0.55 },
    headCounter: 0.7,
    controls: { Ranger_Bow_Grip_Control: 'handL' },
    note: 'chest forward pitch x0.55 (62->34 deg), head counter-pitch 0.7x chest so face and bow stay readable'
  },
  healer: {
    model: 'healer/healer-heal-garment-v3.glb',
    input: 'bf434c29c0cd2cabad7005e9345ba2ebf825342a0c120e902d5c448b52a3a419',
    gain: { chest: 1.4 },
    // Scaling the arm deviation swings both arms behind the large hair (staff through the head),
    // so the gesture is enlarged with explicit raises: staff arm outward, free hand up in front.
    raise: { upperL: [0.6, 'z'], upperR: [0.9, 'x'] },
    headCounter: 0.3,
    controls: { Staff_Rigid_Control: 'handL' },
    note: 'gather bow chest x1.4 with head counter-pitch 0.3x; staff arm raised outward 0.6 rad and free hand raised in front 0.9 rad, following each arm envelope'
  }
}

function loadModel(file) {
  const b = fs.readFileSync(`${models}/${file}`),
    n = b.readUInt32LE(12),
    j = JSON.parse(b.subarray(20, 20 + n))
  const objs = j.nodes.map((nd) => {
    const o = new THREE.Object3D()
    o.name = THREE.PropertyBinding.sanitizeNodeName(nd.name)
    o.position.fromArray(nd.translation ?? [0, 0, 0])
    o.quaternion.fromArray(nd.rotation ?? [0, 0, 0, 1])
    o.scale.fromArray(nd.scale ?? [1, 1, 1])
    return o
  })
  j.nodes.forEach((nd, i) => nd.children?.forEach((k) => objs[i].add(objs[k])))
  const scene = new THREE.Object3D()
  objs.filter((o) => !o.parent).forEach((o) => scene.add(o))
  return { scene, sha: hash(b), get: (name) => scene.getObjectByName(name) }
}

const manifest = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, 'utf8'))
// Authored originals are read from the commit before this refinement, so reruns are idempotent.
const ORIGINAL_COMMIT = 'ddf05fe'
const refinements = {}
for (const [role, edit] of Object.entries(EDITS)) {
  const file = `${dir}/${role}.ultimate.json`
  const inputBytes = execFileSync('git', ['show', `${ORIGINAL_COMMIT}:${file}`], { maxBuffer: 1 << 26 })
  if (hash(inputBytes) !== edit.input) throw new Error(`${role}: original clip hash mismatch`)
  const json = JSON.parse(inputBytes.toString('utf8'))
  const track = (name) => json.tracks.find((t) => t.name === name)
  const quat = (t, i) => new THREE.Quaternion().fromArray(t.values, i * 4)
  const times = track('chest.quaternion').times
  if (json.tracks.some((t) => t.times.length !== times.length)) throw new Error(`${role}: tracks must share keys`)

  // 1. Bone edits: deviation from t=0, scaled in the bone's local frame.
  const chest = track('chest.quaternion'),
    chest0 = quat(chest, 0),
    chestPitch = times.map((_, i) => {
      const d = chest0.clone().invert().multiply(quat(chest, i))
      if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w)
      return 2 * Math.atan2(d.x, d.w) // signed local-X component (forward bend > 0)
    })
  for (const [bone, gain] of Object.entries(edit.gain)) {
    const t = track(`${bone}.quaternion`),
      q0 = quat(t, 0)
    times.forEach((_, i) => {
      const d = q0.clone().invert().multiply(quat(t, i))
      if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w)
      const angle = 2 * Math.acos(Math.min(1, d.w))
      if (angle < 1e-9) return
      const axis = new THREE.Vector3(d.x, d.y, d.z).normalize()
      q0.clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle * gain))
        .toArray(t.values, i * 4)
    })
  }
  const head = track('head.quaternion'),
    head0 = quat(head, 0),
    chestGain = edit.gain.chest ?? 1
  times.forEach((_, i) => {
    const extra = new THREE.Quaternion().setFromAxisAngle(X, -edit.headCounter * chestGain * chestPitch[i])
    head0
      .clone()
      .multiply(extra)
      .multiply(head0.clone().invert().multiply(quat(head, i)))
      .toArray(head.values, i * 4)
  })

  // 1b. Raise: abduct an upper arm about the model forward axis (hand moves out and up),
  // following that arm's own deviation envelope so start, cues and idle return are kept.
  for (const [bone, [radians, axisName]] of Object.entries(edit.raise ?? {})) {
    const rig = loadModel(edit.model),
      rigMixer = new THREE.AnimationMixer(rig.scene)
    rigMixer.clipAction(THREE.AnimationClip.parse(json)).play()
    const t = track(`${bone}.quaternion`),
      q0 = quat(t, 0),
      dev = times.map((_, i) => q0.angleTo(quat(t, i))),
      peak = dev.indexOf(Math.max(...dev)),
      node = rig.get(bone),
      hand = rig.get(bone.replace('upper', 'hand')),
      axis = new THREE.Vector3(+(axisName === 'x'), 0, +(axisName === 'z'))
    const local = (i, angle) => {
      rigMixer.setTime(times[i])
      rig.scene.updateMatrixWorld(true)
      const parent = node.parent.getWorldQuaternion(new THREE.Quaternion())
      return parent
        .clone()
        .invert()
        .multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle))
        .multiply(parent)
        .multiply(quat(t, i))
    }
    const handY = (angle) => {
      node.quaternion.copy(local(peak, angle))
      rig.scene.updateMatrixWorld(true)
      return hand.getWorldPosition(new THREE.Vector3()).y
    }
    const sign = handY(radians) > handY(-radians) ? 1 : -1
    const values = times.map((_, i) => {
      const x = Math.max(0, (dev[i] / dev[peak] - 0.05) / 0.95)
      return local(i, sign * radians * x * x * (3 - 2 * x)).toArray()
    })
    values.forEach((v, i) => t.values.splice(i * 4, 4, ...v))
  }

  // 2. Rebuild weapon controls from the hand by FK on the runtime idle model.
  const model = loadModel(edit.model)
  const clip = THREE.AnimationClip.parse(json)
  const mixer = new THREE.AnimationMixer(model.scene)
  mixer.clipAction(clip).play()
  const pose = (t) => {
    mixer.setTime(t)
    model.scene.updateMatrixWorld(true)
  }
  pose(0)
  const relative = Object.fromEntries(
    Object.entries(edit.controls).map(([c, h]) => [
      c,
      model.get(h).matrixWorld.clone().invert().multiply(model.get(c).matrixWorld)
    ])
  )
  const out = Object.fromEntries(Object.keys(edit.controls).map((c) => [c, { p: [], q: [] }]))
  for (const time of times) {
    pose(time)
    for (const [c, h] of Object.entries(edit.controls)) {
      const control = model.get(c)
      const local = control.parent.matrixWorld.clone().invert().multiply(model.get(h).matrixWorld).multiply(relative[c])
      const p = new THREE.Vector3(),
        q = new THREE.Quaternion(),
        s = new THREE.Vector3()
      local.decompose(p, q, s)
      const prev = out[c].q.slice(-4)
      if (prev.length && q.dot(new THREE.Quaternion(...prev)) < 0) q.set(-q.x, -q.y, -q.z, -q.w)
      out[c].p.push(...p.toArray())
      out[c].q.push(...q.toArray())
    }
  }
  for (const [c, { p, q }] of Object.entries(out)) {
    track(`${c}.position`).values = p
    track(`${c}.quaternion`).values = q
  }
  for (const t of json.tracks) t.values = Array.from(t.values, (v) => Math.round(v * 1e8) / 1e8)

  // 3. Verify grip drift (exact keys and 120Hz), idle return, then write.
  const check = THREE.AnimationClip.parse(json)
  const verifyMixer = new THREE.AnimationMixer(model.scene)
  mixer.stopAllAction()
  verifyMixer.clipAction(check).play()
  let drift = 0
  for (let k = 0; k <= Math.round(check.duration * 120); k++) {
    verifyMixer.setTime(Math.min(k / 120, check.duration))
    model.scene.updateMatrixWorld(true)
    for (const [c, h] of Object.entries(edit.controls)) {
      const now = model.get(h).matrixWorld.clone().invert().multiply(model.get(c).matrixWorld)
      drift = Math.max(
        drift,
        new THREE.Vector3()
          .setFromMatrixPosition(now)
          .distanceTo(new THREE.Vector3().setFromMatrixPosition(relative[c]))
      )
    }
  }
  let endDeviation = 0
  for (const t of check.tracks.filter((t) => t.name.endsWith('.quaternion'))) {
    const n = t.times.length
    endDeviation = Math.max(endDeviation, quat(t, 0).angleTo(quat(t, n - 1)))
  }
  if (drift > 0.0022 || endDeviation > 0.001) throw new Error(`${role}: drift ${drift} end ${endDeviation}`)
  const bytes = Buffer.from(JSON.stringify(json))
  fs.writeFileSync(file, bytes)
  manifest.runtimeSha256[`${role}.ultimate.json`] = hash(bytes)
  refinements[role] = {
    note: edit.note,
    inputSha256: edit.input,
    outputSha256: hash(bytes),
    model: edit.model,
    modelSha256: model.sha,
    maxGripDriftModelUnits: Number(drift.toExponential(2)),
    endQuaternionDeviationRad: Number(endDeviation.toExponential(2))
  }
  console.log(role, refinements[role])
}
manifest.refinements = {
  script: 'scripts/refine-special-motions.mjs',
  inputCommit: ORIGINAL_COMMIT,
  roles: refinements
}
fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n')
