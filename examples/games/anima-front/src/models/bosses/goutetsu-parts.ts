/**
 * ゴウテツ's parts (DESIGN §11): a 12 m walking fortress of pearl ceramic with cyan seams and one lens eye.
 * Frames:
 *
 * - `body` (body frame: origin at the body centre, BODY_Y above the ground at rest): the domed shell, the cool
 *   grey under-body, the head recess, the chest cavity, two missile pods, the dorsal fin and four hip balls.
 * - `head` (head pivot): the turret with the eye socket, brow visor, crest and swept fins.
 * - `lens` (lens centre, looking along +Z): the big glowing eye with iris rings.
 * - `door` (hinge on its outer edge, left door; mirrored for the right): one of the chest armour doors.
 * - `core` (centre): the reactor with two gyro rings, exposed while kneeling.
 * - `lid` (hinge on its outer edge, left pod; mirrored): a missile pod lid.
 * - `thigh` / `shin` (joint frame along +Y to the next joint, +Z = the outer side): leg segments.
 * - `foot` (ankle frame, sole at −ANKLE_H, toes towards +Z).
 */
import { box, capsule, cone, cylinder, ellipsoid, plane, Sculpt, shell, slab, sphere, torus } from '../sdf/sculpt'
import type { Mask, Vec3 } from '../sdf/sculpt'
import { EYE, HOT, MATTE, VEIN } from '../foes/material'
import type { BossPartRecipe } from './common'

const PEARL = 0xf2eee8
const PEARL2 = 0xd8dee8
const UNDER = 0x75839b
const DARK = 0x363e52
const SEAM = 0x9ff6ff
const WARN = 0xffb24a
const LENS = 0x86eeff

// ------------------------------------------------------------------------------------------------ layout
export const BODY_Y = 8.0
/** Hip balls (body frame) in leg order: 0 left-back, 1 right-back, 2 left-front, 3 right-front. */
export const HIPS: Vec3[] = [0, 1, 2, 3].map((i) => [i & 1 ? -2.35 : 2.35, -1.6, i & 2 ? 2.25 : -2.25])
/** Feet (root frame), where the sim hit-tests the legs. */
export const FEET: Vec3[] = [0, 1, 2, 3].map((i) => [i & 1 ? -3 : 3, 0, i & 2 ? 3 : -3])
export const THIGH_L = 3.1
export const SHIN_L = 4.4
export const ANKLE_H = 0.75
export const HEAD_PIVOT: Vec3 = [0, 0.9, 3.55]
/** Lens centre in the head frame. */
export const LENS_AT: Vec3 = [0, -0.1, 0.85]
export const CORE_AT: Vec3 = [0, -1.0, 2.45]
/** Chest door hinge (left; the right one is mirrored). */
export const DOOR_HINGE: Vec3 = [1.12, -1.0, 3.25]
/** Missile pods: centre (left; mirrored) and their outward tilt. */
export const POD: Vec3 = [1.95, 1.75, -1.5]
export const POD_TILT = 0.3
/** Lid hinge in the pod frame (outer top edge). */
const POD_H: Vec3 = [0.8, 0.5, 1.35]
export const LID_HINGE: Vec3 = podPoint(1, POD_H[0], POD_H[1], 0)

/** A point of the left (side 1) or right pod given in the pod's own tilted frame. */
function podPoint(side: number, x: number, y: number, z: number): Vec3 {
  const a = -POD_TILT * side
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [POD[0] * side + (c * x * side - s * y), POD[1] + (s * x * side + c * y), POD[2] + z]
}

// ------------------------------------------------------------------------------------------------- parts

function body(): Sculpt {
  const s = new Sculpt()
  // Domed shell with a crisp rim over the under-body.
  s.add(ellipsoid([0, 0.1, -0.3], [3.35, 2.2, 4.35]), { color: PEARL })
  s.sub(plane([0, -0.55, 0], [0, 1, 0]), { k: 0.03 })
  s.add(ellipsoid([0, -0.7, -0.2], [2.75, 1.45, 3.7]), { color: UNDER, k: 0.06 })
  // Tail plate.
  s.add(ellipsoid([0, -0.2, -4.0], [1.6, 0.9, 1.1], [0.3, 0, 0]), { color: PEARL2, k: 0.3 })
  // Missile pods.
  s.mirror((side) => {
    const c = podPoint(side, 0, 0, 0)
    s.add(box(c, POD_H, 0.28, [0, 0, -POD_TILT * side]), { color: PEARL2, k: 0.15 })
    for (const tz of [-0.75, 0, 0.75])
      for (const tx of [-0.36, 0.36])
        s.sub(cylinder(podPoint(side, tx, 0.45, tz), 0.19, 0.32, 0.03, [0, 0, -POD_TILT * side]), {
          color: DARK,
          k: 0.02
        })
  })
  // Dorsal fin.
  s.add(ellipsoid([0, 2.45, -1.7], [0.24, 1.15, 2.1], [-0.55, 0, 0]), { color: PEARL, k: 0.25 })
  // Dorsal keel and armoured side skirts.
  s.add(capsule([0, 2.0, 2.3], [0, 2.32, -0.7], 0.2), { color: PEARL2, k: 0.25 })
  s.mirror((side) =>
    s.add(ellipsoid([side * 3.18, -0.85, 0.05], [0.16, 0.7, 1.2], [0, 0, side * 0.32]), { color: PEARL2, k: 0.1 })
  )
  // Head recess and chest cavity.
  s.sub(sphere([0, HEAD_PIVOT[1] - 0.05, HEAD_PIVOT[2] + 0.2], 1.9), { color: DARK, k: 0.12 })
  s.sub(sphere([0, CORE_AT[1], 3.5], 0.88), { color: DARK, k: 0.08 })
  s.paint(torus([0, CORE_AT[1], 3.3], 0.86, 0.05, [Math.PI / 2, 0, 0]), { color: SEAM, mask: VEIN })
  // Hip balls.
  for (const h of HIPS) s.add(sphere(h, 0.74), { color: DARK, k: 0.2 })
  // ---- markings: cyan seams between the shell plates, warheads, portholes, hip rings.
  const dome = plane([0, -0.5, 0], [0, -1, 0])
  // Two-tone panels between the seams.
  s.paint(box([0, 1.5, -0.65], [1.25, 1.5, 0.9]), { color: PEARL2, within: dome })
  s.mirror((side) => s.paint(box([side * 2.6, 0.6, 1.12], [1.35, 1.2, 0.87]), { color: PEARL2, within: dome }))
  s.mirror((side) =>
    s.paint(slab([0, -1.42, 0], [0, 1, 0], 0.045), {
      color: SEAM,
      mask: VEIN,
      within: ellipsoid([side * 3.18, -0.85, 0.05], [0.4, 0.9, 1.4])
    })
  )
  for (const z of [2.0, 0.25, -1.55, -3.0])
    s.paint(slab([0, 0, z], [0, 0.32, 1], 0.045), { color: SEAM, mask: VEIN, within: dome })
  s.mirror((side) =>
    s.paint(slab([1.25 * side, 0, 0], [1, -0.1 * side, 0], 0.045), { color: SEAM, mask: VEIN, within: dome })
  )
  s.paint(slab([0, -0.42, 0], [0, 1, 0], 0.04), {
    color: SEAM,
    mask: VEIN,
    within: ellipsoid([0, -0.42, -0.3], [3.6, 0.4, 4.6])
  })
  s.paint(slab([0, 0, 0], [1, 0, 0], 0.05), {
    color: SEAM,
    mask: VEIN,
    within: ellipsoid([0, 2.45, -1.7], [0.6, 1.6, 2.6], [-0.55, 0, 0])
  })
  s.mirror((side) => {
    for (const tz of [-0.75, 0, 0.75])
      for (const tx of [-0.36, 0.36]) s.paint(sphere(podPoint(side, tx, 0.1, tz), 0.2), { color: 0xff7a5a, mask: HOT })
  })
  s.mirror((side) => {
    for (let i = 0; i < 5; i++) {
      const z = 1.6 - i * 0.95
      const x = 2.75 * Math.sqrt(Math.max(0, 1 - (0.12 / 1.45) ** 2 - ((z + 0.2) / 3.7) ** 2))
      s.paint(sphere([x * side, -0.82, z], 0.13), { color: SEAM, mask: VEIN })
    }
  })
  for (const h of HIPS) s.paint(slab(h, [0, 1, 0], 0.07), { color: SEAM, mask: VEIN, within: sphere(h, 0.85) })
  s.paint(torus([0, -2.0, -0.2], 1.35, 0.1), { color: SEAM, mask: VEIN })
  return s
}

function head(): Sculpt {
  const s = new Sculpt()
  s.add(ellipsoid([0, 0, 0.15], [1.75, 1.45, 1.6]), { color: PEARL })
  s.add(ellipsoid([0, -0.1, -0.7], [1.35, 1.15, 1.1]), { color: UNDER, k: 0.2 })
  // Brow visor, crest and swept fins.
  s.add(ellipsoid([0, 0.95, 1.0], [1.6, 0.34, 0.9], [0.42, 0, 0]), { color: PEARL, k: 0.12 })
  s.add(ellipsoid([0, 1.4, 0.0], [0.2, 0.6, 1.25], [-0.45, 0, 0]), { color: PEARL, k: 0.15 })
  s.mirror((side) =>
    s.add(ellipsoid([side * 1.75, 0.45, -0.4], [0.16, 0.48, 1.05], [-0.35, side * 0.3, -side * 0.28]), {
      color: PEARL2,
      k: 0.1
    })
  )
  s.add(ellipsoid([0, -1.15, 0.85], [1.1, 0.36, 0.75]), { color: PEARL2, k: 0.12 })
  // Eye socket and bezel.
  s.sub(sphere([0, -0.1, 1.75], 1.12), { color: DARK, k: 0.1 })
  s.add(torus([0, -0.1, 1.36], 1.1, 0.15, [Math.PI / 2, 0, 0]), { color: PEARL2, k: 0.06 })
  // Seams: around the bezel, under the visor, along the crest; cheek lights.
  s.paint(torus([0, -0.1, 1.42], 1.3, 0.05, [Math.PI / 2, 0, 0]), { color: SEAM, mask: VEIN })
  s.paint(slab([0, 0.66, 0], [0, 1, -0.45], 0.04), {
    color: SEAM,
    mask: VEIN,
    within: ellipsoid([0, 0.7, 1.2], [1.7, 0.45, 0.9])
  })
  s.paint(slab([0, 0, 0], [1, 0, 0], 0.04), {
    color: SEAM,
    mask: VEIN,
    within: ellipsoid([0, 1.4, 0.0], [0.5, 1.0, 1.5], [-0.45, 0, 0])
  })
  s.mirror((side) => s.paint(sphere([side * 1.4, -0.55, 0.95], 0.12), { color: SEAM, mask: VEIN }))
  return s
}

function lens(): Sculpt {
  const s = new Sculpt()
  s.add(sphere([0, 0, -0.35], 0.98), { color: DARK })
  s.add(ellipsoid([0, 0, 0], [0.98, 0.98, 0.6]), { color: LENS, mask: EYE, k: 0.05 })
  s.paint(torus([0, 0, 0.42], 0.66, 0.05, [Math.PI / 2, 0, 0]), { color: 0x1d5a78, mask: MATTE })
  s.paint(torus([0, 0, 0.55], 0.4, 0.035, [Math.PI / 2, 0, 0]), { color: 0x2a86a8, mask: MATTE })
  s.paint(sphere([0, 0, 0.62], 0.24), { color: 0xf2ffff, mask: EYE })
  return s
}

function door(): Sculpt {
  const s = new Sculpt()
  // A plate hugging the chest: a shell over the under-body (expressed in the hinge frame), cut to the door.
  const c: Vec3 = [-DOOR_HINGE[0], -0.7 - DOOR_HINGE[1], -0.2 - DOOR_HINGE[2]]
  s.add(shell(c, [2.86, 1.56, 3.81], 0.1), { color: PEARL })
  s.inter(box([-0.6, 0, 0], [0.6, 0.92, 1.4], 0.08), { k: 0.03 })
  s.add(cylinder([0, 0, -0.04], 0.13, 0.82, 0.04), { color: DARK, k: 0.03 })
  s.paint(box([-0.62, 0, 0], [0.4, 0.66, 2], 0.1), { color: PEARL2 })
  s.paint(slab([-1.15, 0, 0], [1, 0, 0.28], 0.045), { color: SEAM, mask: VEIN })
  s.paint(slab([0, 0, 0], [0, 1, 0], 0.035), {
    color: SEAM,
    mask: VEIN,
    within: box([-0.62, 0, 0], [0.42, 0.2, 2])
  })
  return s
}

function core(): Sculpt {
  const s = new Sculpt()
  const NONE: Mask = [0, 0, 0, 0]
  s.add(sphere([0, 0, 0], 0.66), { color: 0xff7a40, mask: HOT })
  s.add(torus([0, 0, 0], 0.86, 0.1), { color: DARK, mask: NONE, k: 0.02 })
  s.add(torus([0, 0, 0], 0.86, 0.1, [Math.PI / 2, 0, 0]), { color: DARK, mask: NONE, k: 0.02 })
  s.paint(sphere([0, 0, 0.6], 0.26), { color: 0xffe6c8, mask: HOT })
  s.paint(slab([0, 0, 0], [0, 1, 0], 0.03), { color: SEAM, mask: VEIN, within: torus([0, 0, 0], 0.86, 0.12) })
  s.paint(slab([0, 0, 0], [1, 0, 0], 0.03), {
    color: SEAM,
    mask: VEIN,
    within: torus([0, 0, 0], 0.86, 0.12, [Math.PI / 2, 0, 0])
  })
  return s
}

function lid(): Sculpt {
  const s = new Sculpt()
  s.add(box([-0.82, 0.08, 0], [0.84, 0.13, 1.4], 0.11), { color: PEARL })
  s.add(cylinder([0, 0, 0], 0.13, 1.2, 0.03, [Math.PI / 2, 0, 0]), { color: DARK, k: 0.03 })
  s.paint(slab([-0.82, 0, 0], [1, 0, 0], 0.035), { color: SEAM, mask: VEIN })
  s.paint(slab([0, 0, 0.95], [0, 0, 1], 0.03), { color: SEAM, mask: VEIN })
  s.paint(slab([0, 0, -0.95], [0, 0, 1], 0.03), { color: SEAM, mask: VEIN })
  return s
}

function thigh(): Sculpt {
  const s = new Sculpt()
  const L = THIGH_L
  s.add(cone([0, 0, 0], [0, L, 0], 0.5, 0.42), { color: UNDER })
  s.add(sphere([0, 0, 0], 0.62), { color: DARK, k: 0.05 })
  s.add(sphere([0, L, 0], 0.55), { color: DARK, k: 0.05 })
  s.add(ellipsoid([0, L * 0.5, 0.22], [0.74, L * 0.46, 0.56]), { color: PEARL, k: 0.12 })
  s.add(ellipsoid([0, L * 0.5, 0.5], [0.42, L * 0.34, 0.36]), { color: PEARL2, k: 0.06 })
  for (const y of [L * 0.22, L * 0.78])
    s.paint(slab([0, y, 0], [0, 1, 0], 0.04), {
      color: SEAM,
      mask: VEIN,
      within: ellipsoid([0, L * 0.5, 0.22], [0.9, L * 0.5, 0.7])
    })
  s.paint(sphere([0, L - 0.35, 0.72], 0.13), { color: WARN, mask: HOT })
  s.paint(slab([0, L, 0], [0, 1, 0], 0.06), { color: SEAM, mask: VEIN, within: sphere([0, L, 0], 0.65) })
  return s
}

function shin(): Sculpt {
  const s = new Sculpt()
  const L = SHIN_L
  s.add(cone([0, 0, 0], [0, L, 0], 0.46, 0.32), { color: UNDER })
  s.add(ellipsoid([0, 1.5, 0.26], [0.72, 1.75, 0.55]), { color: PEARL, k: 0.1 })
  s.add(cone([0, 0.05, 0.35], [0, -0.75, 1.05], 0.38, 0.07), { color: PEARL, k: 0.12 })
  s.add(sphere([0, L, 0], 0.42), { color: DARK, k: 0.05 })
  s.add(torus([0, L - 0.6, 0], 0.38, 0.09), { color: PEARL2, k: 0.04 })
  s.paint(slab([0, 0, 0], [1, 0, 0], 0.04), {
    color: SEAM,
    mask: VEIN,
    within: ellipsoid([0, 1.6, 0.6], [0.3, 1.5, 0.4])
  })
  s.paint(slab([0, L - 0.6, 0], [0, 1, 0], 0.04), { color: SEAM, mask: VEIN, within: sphere([0, L - 0.6, 0], 0.6) })
  s.paint(sphere([0, 0.85, 0.8], 0.12), { color: WARN, mask: HOT })
  return s
}

function foot(): Sculpt {
  const s = new Sculpt()
  const y0 = -ANKLE_H
  s.add(cylinder([0, y0 + 0.24, 0.1], 1.0, 0.24, 0.14), { color: UNDER })
  s.add(ellipsoid([0, y0 + 0.5, 0.05], [0.84, 0.42, 0.95]), { color: PEARL, k: 0.1 })
  for (const x of [-0.45, 0, 0.45])
    s.add(cone([x, y0 + 0.3, 0.7], [x * 1.25, y0 + 0.12, 1.45], 0.25, 0.09), { color: PEARL2, k: 0.08 })
  s.add(sphere([0, 0, 0], 0.42), { color: DARK, k: 0.08 })
  s.sub(plane([0, y0, 0], [0, 1, 0]), { k: 0.02 })
  s.paint(slab([0, y0 + 0.2, 0], [0, 1, 0], 0.04), {
    color: SEAM,
    mask: VEIN,
    within: cylinder([0, y0 + 0.24, 0.1], 1.1, 0.3)
  })
  return s
}

export function goutetsuParts(): BossPartRecipe[] {
  return [
    { name: 'body', sculpt: body(), cell: 0.154, tris: 9000, hull: true, uses: 1, aoReach: 0.7 },
    { name: 'head', sculpt: head(), cell: 0.116, tris: 4200, hull: true, uses: 1, aoReach: 0.4 },
    { name: 'lens', sculpt: lens(), cell: 0.1, tris: 1200, hull: true, uses: 1, aoReach: 0.2 },
    { name: 'door', sculpt: door(), cell: 0.104, tris: 900, hull: true, uses: 2, aoReach: 0.2 },
    { name: 'core', sculpt: core(), cell: 0.095, tris: 1600, hull: true, uses: 1, aoReach: 0.2 },
    { name: 'lid', sculpt: lid(), cell: 0.11, tris: 700, hull: true, uses: 2, aoReach: 0.2 },
    { name: 'thigh', sculpt: thigh(), cell: 0.107, tris: 1500, hull: true, uses: 4, aoReach: 0.3 },
    { name: 'shin', sculpt: shin(), cell: 0.108, tris: 1600, hull: true, uses: 4, aoReach: 0.3 },
    { name: 'foot', sculpt: foot(), cell: 0.094, tris: 1200, hull: true, uses: 4, aoReach: 0.3 }
  ]
}
