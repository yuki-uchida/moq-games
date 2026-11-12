/**
 * Face parts of the animals: glossy eye domes (pattern drawn by the eye shader), brows and mouths. Placement is
 * found by tracing the species' SDF from the head centre, so the parts sit exactly on the sculpted face.
 */
import * as THREE from 'three'
import { compileField, type Field } from './sdf/field'
import { toGeometry } from './sdf/geometry'
import { runSync, traceSurface } from './sdf/mesher'
import { meshField } from './sdf/mesher'
import { simplify } from './sdf/simplify'
import { arc, capsule, ellipsoid, plane, Sculpt, type Vec3 } from './sdf/sculpt'
import type { FaceSpec, MouthStyle } from './species/recipes'
import type { BodyPlan } from './rig'

export interface Placement {
  /** Model-space position (bind pose). */
  p: Vec3
  q: [number, number, number, number]
  s: Vec3
}

export interface FaceLayout {
  eyes: [Placement, Placement]
  brows: [Placement, Placement]
  mouth: Placement
}

const dirOf = (yaw: number, pitch: number): Vec3 => [
  Math.sin(yaw) * Math.cos(pitch),
  Math.sin(pitch),
  Math.cos(yaw) * Math.cos(pitch)
]

function frame(n: Vec3, towardFront: number): THREE.Quaternion {
  const z = new THREE.Vector3(n[0], n[1], n[2]).lerp(new THREE.Vector3(0, 0, 1), towardFront).normalize()
  const x = new THREE.Vector3(0, 1, 0).cross(z).normalize()
  const y = z.clone().cross(x).normalize()
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}

function hitFrom(field: Field, plan: BodyPlan, d: Vec3) {
  const c = plan.headC
  const R = Math.max(...plan.headR) * 2.2
  const from: Vec3 = [c[0] + d[0] * R, c[1] + d[1] * R, c[2] + d[2] * R]
  return traceSurface(field, from, [-d[0], -d[1], -d[2]], R * 1.2)
}

export function layoutFace(fieldOrSculpt: Field | Sculpt, plan: BodyPlan, face: FaceSpec): FaceLayout {
  const field = fieldOrSculpt instanceof Sculpt ? compileField(fieldOrSculpt) : fieldOrSculpt
  const H = plan.H
  const eyes: Placement[] = []
  const brows: Placement[] = []
  for (const side of [1, -1]) {
    const d = dirOf(face.eyeYaw * side, face.eyePitch)
    const hit = hitFrom(field, plan, d)
    const n: Vec3 = hit ? hit.n : d
    const p: Vec3 = hit ? hit.p : [plan.headC[0] + d[0] * plan.headR[0], plan.headC[1], plan.headC[2] + plan.headR[2]]
    const q = frame(n, 0.45)
    const depth = face.eyeW * H * 0.55
    const zAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    eyes.push({
      p: [p[0] - zAxis.x * depth * 0.5, p[1] - zAxis.y * depth * 0.5, p[2] - zAxis.z * depth * 0.5],
      q: [q.x, q.y, q.z, q.w],
      s: [face.eyeW * H, face.eyeH * H, depth]
    })
    // Brow: above the eye on the surface.
    const headR = plan.headR[1]
    const bd = dirOf(face.eyeYaw * side * 0.92, face.eyePitch + (face.eyeH * H * 1.55) / headR)
    const bh = hitFrom(field, plan, bd)
    const bp: Vec3 = bh ? bh.p : [p[0], p[1] + face.eyeH * H * 1.5, p[2]]
    const bq = frame(bh ? bh.n : bd, 0.3)
    brows.push({ p: bp, q: [bq.x, bq.y, bq.z, bq.w], s: [1, 1, 1] })
  }
  const md = dirOf(0, face.mouthPitch)
  const mh = hitFrom(field, plan, md)
  const mp: Vec3 = mh ? mh.p : [0, plan.headC[1] - plan.headR[1] * 0.5, plan.headC[2] + plan.headR[2]]
  const mq = frame(mh ? mh.n : md, 0.6)
  return {
    eyes: eyes as [Placement, Placement],
    brows: brows as [Placement, Placement],
    mouth: { p: mp, q: [mq.x, mq.y, mq.z, mq.w], s: [1, 1, 1] }
  }
}

/** Unit eye dome: the front hemisphere of a unit sphere facing +Z. */
export function eyeGeometry(segments = 22): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, segments, Math.round(segments / 2.2), 0, Math.PI * 2, 0, Math.PI / 2)
  g.rotateX(Math.PI / 2)
  return g
}

/** Brow stroke (unit length along X). */
export function browGeometry(H: number): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(0.0085 * H, 0.03 * H, 3, 8)
  g.rotateZ(Math.PI / 2)
  return g
}

/** Closed mouth (a little "w" / smile / rabbit "x") and an open mouth, in mouth-local space (+Z out). */
export function mouthGeometries(style: MouthStyle, H: number, color: number) {
  const r = 0.0042 * H
  const closed = new Sculpt()
  const R = 0.017 * H
  const smile: [number, number, number] = [Math.PI / 2, 0, 0]
  if (style === 'w' || style === 'x') {
    closed.add(arc([R * 0.95, R * 0.35, 0], R, r, 1.2, smile), { color })
    closed.add(arc([-R * 0.95, R * 0.35, 0], R, r, 1.2, smile), { color })
    if (style === 'x') closed.add(capsule([0, R * 0.4, 0], [0, R * 1.3, 0], r), { color })
  } else if (style === 'smile') {
    closed.add(arc([0, R, 0], R * 1.4, r, 0.9, smile), { color })
  } else {
    // Beaked faces: a tiny highlight-free notch so the mesh is never empty.
    closed.add(ellipsoid([0, 0, -0.004 * H], [0.004 * H, 0.002 * H, 0.002 * H]), { color })
  }
  const open = new Sculpt()
    .add(ellipsoid([0, -0.012 * H, 0], [0.026 * H, 0.024 * H, 0.008 * H]), { color: 0x6a2232 })
    .sub(plane([0, -0.004 * H, 0], [0, -1, 0]), { k: 0.004 * H })
    .paint(ellipsoid([0, -0.03 * H, 0.004 * H], [0.017 * H, 0.012 * H, 0.012 * H]), {
      color: 0xff8a9a,
      soft: 0.002 * H
    })
  const cell = 0.0026 * H
  return {
    closed: toGeometry(simplify(runSync(meshField(compileField(closed), { cell, ao: false })), 200)),
    open: toGeometry(simplify(runSync(meshField(compileField(open), { cell, ao: false })), 240))
  }
}

/** Happy closed eye "^" (an upward arc), sized for a 6 cm wide eye; the character scales it per species. */
export function happyEyeGeometry(): THREE.BufferGeometry {
  const s = new Sculpt().add(arc([0, -0.012, 0], 0.03, 0.0055, 1.05, [-Math.PI / 2, 0, 0]), { color: 0x2a1c24 })
  return toGeometry(simplify(runSync(meshField(compileField(s), { cell: 0.003, ao: false })), 110))
}
