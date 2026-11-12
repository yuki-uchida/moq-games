/**
 * クイツクシ's parts (DESIGN §11): a crater maw-flower 9 m tall. Each part is baked in its own frame:
 *
 * - `base` (root frame): the root bulb in a crater of crusted earth, seven roots running into the ground.
 * - `stalk` (root frame, turns about [0, 1, 0]): the ringed trunk with veins and two eye-cores.
 * - `sacs` (root frame, swells about [0, 4.1, 0]): five acid sacs around the upper trunk.
 * - `head` (neck frame, the maw axis is +Y): neck, toothed cup, lip, five eye-cores between the petals.
 * - `petal` (hinge frame: +Y along the petal, +Z outward, the toothed membrane faces −Z): one of five jaws.
 * - `core` (centre frame, the slit pupil faces +Z): the glowing heart caged by five ribs.
 * - `tentA/B/C` (joint frame, along +Y, +Z = outer side): three segments of each tentacle, the club last.
 */
import {
  alongRows,
  box,
  capsule,
  cone,
  ellipsoid,
  plane,
  scaled,
  Sculpt,
  slab,
  sphere,
  torus,
  arc
} from '../sdf/sculpt'
import type { Mask, Shape, Vec3 } from '../sdf/sculpt'
import { EYE, HOT, MATTE, VEIN } from '../foes/material'
import type { BossPartRecipe } from './common'

export const CHITIN = 0x2c2558
export const CHITIN_DK = 0x1d1837
const PLATE = 0x3d3478
const MEMBRANE = 0x76307c
const FLESH = 0x9c4488
const THROAT = 0x2c0f38
const TOOTH = 0xefe6f8
const EARTH = 0x4c3f4a
const CRYSTAL = 0xb998ff
const VEIN_COL = 0xd6acff
const ANGER_COL = 0x47306e
const EYE_COL = 0xffb860
const SAC = 0x8a52c8
const BELLY = 0x4b2c62
const SAC_GLOW = 0xe6a8ff
const CORE_COL = 0xff9a3a

const TAU = Math.PI * 2
const NONE: Mask = [0, 0, 0, 0]

/** Point at radius r, angle a (0 = +Z, π/2 = +X) and height y. */
export const polar = (r: number, a: number, y: number): Vec3 => [r * Math.sin(a), y, r * Math.cos(a)]
/** Point at radius r and angle a around the vertical axis through c. */
const around = (c: Vec3, r: number, a: number): Vec3 => [c[0] + r * Math.sin(a), c[1], c[2] + r * Math.cos(a)]
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
]

// ------------------------------------------------------------------------------------------------ layout
/** Petal hinge angles around the maw (none at the front, so the open maw faces the players). */
export const PETAL_ANGLES = [0, 1, 2, 3, 4].map((i) => (36 + i * 72) * (Math.PI / 180))
export const PETAL_HINGE_R = 1.46
export const PETAL_HINGE_Y = 2.0
/** Neck pivot (root frame) and the stalk pivot. */
export const NECK: Vec3 = [0, 5.25, 0.35]
export const STALK_PIVOT: Vec3 = [0, 1.0, 0]
export const SAC_PIVOT: Vec3 = [0, 4.1, 0]
/** Core centre in the neck frame (closed) and how far it rises out of the maw when open. */
export const CORE_Y = 0.8
export const CORE_RISE = 1.45
/** Tentacle segment lengths. */
export const TENT_L = [2.6, 2.4, 2.3] as const

// ------------------------------------------------------------------------------------------------- parts

function base(): Sculpt {
  const s = new Sculpt()
  s.add(ellipsoid([0, -0.25, 0], [3.0, 1.7, 3.0]), { color: CHITIN_DK })
  s.add(scaled(torus([0, -0.1, 0], 3.8, 0.75), [1, 0.7, 1]), { color: EARTH, k: 0.6 })
  const roots: Vec3[][] = []
  const RADII = [0.86, 0.7, 0.5, 0.26]
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.52
    const bend = (i % 2 ? 1 : -1) * 0.06
    const pts: Vec3[] = [
      polar(1.5, a, 0.75),
      polar(2.95, a + bend, 1.2),
      polar(4.25, a + bend * 2, 0.45),
      polar(5.45, a + bend * 2.5, -0.3)
    ]
    roots.push(pts)
    for (let j = 0; j < 3; j++)
      s.add(cone(pts[j], pts[j + 1], RADII[j], RADII[j + 1]), { color: CHITIN, k: j ? 0.25 : 0.4 })
  }
  // Blight crystals on the crater rim between the roots.
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * TAU + 0.52
    s.add(cone(polar(3.95, a, -0.1), polar(4.3, a + 0.05, 1.4), 0.36, 0.05), { color: CRYSTAL, k: 0.05 })
    s.add(cone(polar(4.3, a + 0.13, -0.1), polar(4.9, a + 0.22, 0.8), 0.26, 0.04), { color: CRYSTAL, k: 0.05 })
    s.add(cone(polar(4.2, a - 0.14, -0.1), polar(4.6, a - 0.2, 0.6), 0.2, 0.03), { color: CRYSTAL, k: 0.04 })
  }
  s.sub(plane([0, -0.03, 0], [0, 1, 0]), { k: 0.04 })
  // Veins along the top of every root, glowing into the ground.
  for (const pts of roots) {
    const top = pts.map((p, j): Vec3 => [p[0], p[1] + RADII[j] * 0.95, p[2]])
    s.paint(capsule(top[0], top[1], 0.1), {
      color: VEIN_COL,
      mask: VEIN,
      union: [capsule(top[1], top[2], 0.09), capsule(top[2], top[3], 0.07)]
    })
  }
  // Veins running down the bulb between the roots.
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * TAU + 0.52
    s.paint(slab([0, 0, 0], [Math.cos(a), 0, -Math.sin(a)], 0.05), {
      color: VEIN_COL,
      mask: VEIN,
      within: ellipsoid(polar(2.0, a, 0.9), [0.9, 0.7, 0.9])
    })
  }
  return s
}

/** Point and radius along the trunk (t 0..1). */
const SPINE: [Vec3, number][] = [
  [[0, 0.3, 0], 1.45],
  [[0, 2.1, -0.3], 1.1],
  [[0, 3.8, -0.05], 0.9],
  [[0, 5.3, 0.35], 0.86]
]
function spineAt(t: number): [Vec3, number, Vec3] {
  const f = Math.min(2.999, Math.max(0, t * 3))
  const i = Math.floor(f)
  const [a, ra] = SPINE[i]
  const [b, rb] = SPINE[i + 1]
  const u = f - i
  return [lerp3(a, b, u), ra + (rb - ra) * u, [b[0] - a[0], b[1] - a[1], b[2] - a[2]]]
}

function stalk(): Sculpt {
  const s = new Sculpt()
  for (let i = 0; i < 3; i++)
    s.add(cone(SPINE[i][0], SPINE[i + 1][0], SPINE[i][1], SPINE[i + 1][1]), { color: CHITIN, k: i ? 0.3 : 0 })
  // Chitin collars.
  for (const t of [0.3, 0.46, 0.62, 0.78, 0.93]) {
    const [c, r, d] = spineAt(t)
    s.add(torus(c, r - 0.02, 0.14, alongRows(d)), { color: PLATE, k: 0.16 })
  }
  // Two small eye-cores on the front.
  for (const [t, a, r] of [
    [0.47, 0.3, 0.26],
    [0.56, -0.28, 0.2]
  ] as const) {
    const [c, rr] = spineAt(t)
    s.add(sphere(around(c, rr + 0.02, a), r + 0.09), { color: CHITIN_DK, k: 0.06 })
    s.add(sphere(around(c, rr + 0.1, a), r), { color: EYE_COL, mask: EYE, k: 0.02 })
  }
  // Veins (slightly helical planes through the axis, one side each) and dormant anger veins between them.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5
    const n: Vec3 = [Math.cos(a), 0.25, -Math.sin(a)]
    s.paint(slab([0, 2.5, 0], n, 0.055), {
      color: VEIN_COL,
      mask: VEIN,
      within: ellipsoid(polar(1.0, a, 2.6), [1.0, 2.6, 1.0])
    })
    const b = a + TAU / 12
    s.paint(slab([0, 2.5, 0], [Math.cos(b), -0.3, -Math.sin(b)], 0.045), {
      color: ANGER_COL,
      mask: HOT,
      within: ellipsoid(polar(1.0, b, 3.0), [0.9, 2.0, 0.9])
    })
  }
  return s
}

const SAC_ANGLES = [1.45, 2.2, Math.PI, 4.08, 4.83]

function sacs(): Sculpt {
  const s = new Sculpt()
  const shapes: Vec3[] = []
  SAC_ANGLES.forEach((a, i) => {
    const c = polar(0.98, a, SAC_PIVOT[1] - 0.15 + (i % 2) * 0.35)
    const dir: Vec3 = [Math.sin(a) * 0.36, 0.93, Math.cos(a) * 0.36]
    shapes.push(c)
    s.add(ellipsoid(c, [0.6, 0.84, 0.58], alongRows(dir)), { color: SAC, k: 0.18 })
    // A neck where the sac hangs from the trunk.
    s.add(ellipsoid(polar(0.7, a, c[1] + 0.45), [0.32, 0.38, 0.32]), { color: CHITIN, k: 0.12 })
  })
  SAC_ANGLES.forEach((a, i) => {
    const c = shapes[i]
    const dir: Vec3 = [Math.sin(a) * 0.36, 0.93, Math.cos(a) * 0.36]
    s.paint(ellipsoid(polar(1.25, a, c[1] - 0.05), [0.42, 0.6, 0.42], alongRows(dir)), {
      color: SAC_GLOW,
      mask: HOT
    })
    s.paint(slab(c, [Math.cos(a), 0, -Math.sin(a)], 0.04), {
      color: VEIN_COL,
      mask: VEIN,
      within: ellipsoid(c, [0.75, 1.0, 0.75])
    })
  })
  return s
}

/** Head eye-cores: radius, angle, height and size (neck frame). */
const HEAD_EYES: [number, number, number, number][] = [
  [2.2, 0, 1.2, 0.34],
  [2.08, 0.36, 1.72, 0.2],
  [2.08, -0.36, 1.72, 0.2],
  ...[1, 2, 3, 4].map((i): [number, number, number, number] => [2.13, i * 72 * (Math.PI / 180), 1.42, 0.25])
]

function head(): Sculpt {
  const s = new Sculpt()
  s.add(cone([0, -1.0, 0], [0, 0.6, 0], 0.92, 1.3), { color: CHITIN })
  s.add(ellipsoid([0, 1.25, 0], [2.05, 1.3, 2.05]), { color: CHITIN, k: 0.45 })
  // Overlapping scale plates under each petal hinge.
  for (const a of PETAL_ANGLES) {
    const dir: Vec3 = [Math.sin(a) * 0.55, 0.83, Math.cos(a) * 0.55]
    s.add(scaled(ellipsoid(polar(1.6, a, 1.15), [0.88, 0.78, 0.88], alongRows(dir)), [1, 1, 0.42]), {
      color: PLATE,
      k: 0.12
    })
  }
  // Eye-cores in sockets between the petals; a cluster of three under the front of the maw.
  for (const [r, a, y, size] of HEAD_EYES)
    s.add(sphere(polar(r - 0.16, a, y), size + 0.13), { color: CHITIN_DK, k: 0.1 })
  s.sub(sphere([0, 2.35, 0], 1.38), { color: THROAT, k: 0.15 })
  s.add(torus([0, 2.12, 0], 1.45, 0.2), { color: FLESH, mask: MATTE, k: 0.1 })
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU
    s.add(cone(polar(1.4, a, 2.12), polar(0.86, a, 1.7), 0.16, 0.025), { color: TOOTH, mask: MATTE, k: 0.05 })
  }
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * TAU
    s.add(cone(polar(1.14, a, 1.58), polar(0.62, a, 1.26), 0.12, 0.02), { color: TOOTH, mask: MATTE, k: 0.04 })
  }
  for (const [r, a, y, size] of HEAD_EYES) s.add(sphere(polar(r, a, y), size), { color: EYE_COL, mask: EYE, k: 0.02 })
  // Glowing pit under the core.
  s.paint(sphere([0, 0.85, 0], 0.55), { color: 0xc27aff, mask: VEIN })
  // Veins up the cup between the plates, dormant anger veins beside them.
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 + 18) * (Math.PI / 180)
    s.paint(slab([0, 0, 0], [Math.cos(a), 0, -Math.sin(a)], 0.05), {
      color: VEIN_COL,
      mask: VEIN,
      within: ellipsoid(polar(1.4, a, 0.7), [0.9, 1.3, 0.9])
    })
    const b = a + 0.62
    s.paint(slab([0, 0.6, 0], [Math.cos(b), 0.35, -Math.sin(b)], 0.04), {
      color: ANGER_COL,
      mask: HOT,
      within: ellipsoid(polar(1.6, b, 1.0), [0.8, 0.9, 0.8])
    })
  }
  return s
}

/** Blade profile: spine points, half widths and the thickness factor. */
const BLADE: [Vec3, number, number][] = [
  [[0, -0.15, 0.05], 0.72, 0.36],
  [[0, 1.0, 0.32], 0.98, 0.33],
  [[0, 2.05, 0.22], 0.8, 0.34],
  [[0, 2.75, -0.3], 0.42, 0.42],
  [[0, 3.05, -0.78], 0.09, 0.6]
]

function petal(): Sculpt {
  const s = new Sculpt()
  for (let i = 0; i < 4; i++) {
    const [a, ra, ta] = BLADE[i]
    const [b, rb] = BLADE[i + 1]
    s.add(scaled(cone(a, b, ra, rb), [1, 1, ta]), { color: i === 3 ? CHITIN_DK : CHITIN, k: i ? 0.2 : 0 })
  }
  // Ridge along the back and a rounded hinge knuckle.
  s.add(capsule([0, 0.0, 0.42], [0, 2.1, 0.5], 0.1), { color: PLATE, k: 0.14 })
  s.add(ellipsoid([0, -0.1, 0.05], [0.62, 0.42, 0.42]), { color: CHITIN, k: 0.15 })
  // Teeth along both edges of the inner face (repainted at the end, over the membrane and its veins).
  const teeth: Shape[][] = [[], []]
  s.mirror((side) => {
    for (const [y, w, z] of [
      [0.45, 0.84, 0.18],
      [1.0, 0.95, 0.3],
      [1.55, 0.9, 0.28],
      [2.1, 0.76, 0.18]
    ] as const) {
      const root: Vec3 = [side * (w - 0.16), y, z - 0.12]
      const tip: Vec3 = [side * (w - 0.4), y + 0.16, z - 0.72]
      s.add(cone(root, tip, 0.14, 0.022), { color: TOOTH, mask: MATTE, k: 0.05 })
      teeth[side > 0 ? 0 : 1].push(cone(root, tip, 0.155, 0.035))
    }
  })
  // Chitin bands across the back.
  for (const y of [0.5, 1.1, 1.7, 2.25])
    s.emboss(slab([0, y, 0], [0, 1, 0.3], 0.07), {
      amount: 0.05,
      color: PLATE,
      within: plane([0, 0, 0.3], [0, 0, -1])
    })
  // Soft membrane on the inner face, with veins and dormant anger veins.
  s.paint(plane([0, 0, 0.12], [0, 0, 1]), {
    color: MEMBRANE,
    mask: MATTE,
    within: ellipsoid([0, 1.2, 0.1], [0.92, 1.75, 1.0])
  })
  const inner = ellipsoid([0, 1.25, -0.6], [0.95, 1.8, 0.72])
  s.paint(slab([0, 0, 0], [1, 0, 0], 0.045), { color: VEIN_COL, mask: VEIN, within: inner })
  s.mirror((side) => {
    for (const [y, tilt] of [
      [0.35, 0.8],
      [1.0, 0.65],
      [1.6, 0.5]
    ] as const) {
      s.paint(slab([0, y, 0], [1, -tilt * side, 0], 0.035), {
        color: VEIN_COL,
        mask: VEIN,
        within: ellipsoid([side * 0.4, y + 0.35, -0.5], [0.42, 0.42, 0.7])
      })
      s.paint(slab([0, y + 0.28, 0], [1, -tilt * 1.6 * side, 0], 0.03), {
        color: ANGER_COL,
        mask: HOT,
        within: ellipsoid([side * 0.45, y + 0.5, -0.5], [0.4, 0.4, 0.7])
      })
    }
    // Veins along the back beside the ridge.
    s.paint(slab([side * 0.48, 0, 0], [1, 0.12 * side, 0], 0.04), {
      color: VEIN_COL,
      mask: VEIN,
      within: ellipsoid([side * 0.48, 1.1, 0.6], [0.3, 1.3, 0.5])
    })
  })
  for (const [first, ...rest] of teeth) s.paint(first, { color: TOOTH, mask: MATTE, union: rest })
  return s
}

function core(): Sculpt {
  const s = new Sculpt()
  s.add(sphere([0, 0, 0], 0.78), { color: CORE_COL, mask: HOT })
  // Five ribs cage the heart; a stem holds it.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + Math.PI / 5
    const rows: [Vec3, Vec3, Vec3] = [
      [0, 1, 0],
      [-Math.cos(a), 0, Math.sin(a)],
      [Math.sin(a), 0, Math.cos(a)]
    ]
    s.add(arc([0, -0.05, 0], 0.92, 0.11, 1.25, rows), { color: CHITIN_DK, mask: NONE, k: 0.03 })
  }
  s.add(cone([0, -0.8, 0], [0, -1.35, 0], 0.34, 0.24), { color: CHITIN_DK, mask: NONE, k: 0.12 })
  s.paint(torus([0, 0, 0.6], 0.4, 0.06, [Math.PI / 2, 0, 0]), { color: 0xff7a30, mask: HOT })
  s.paint(box([0, 0, 0], [0.1, 0.5, 1.0], 0.08), { color: 0x2a0c22, mask: MATTE })
  return s
}

/** One tentacle segment: a joint ball, a smooth tapering body with overlapping scutes on its outer side, a
 * dusky belly, a vein between the scutes and a dormant anger vein on the belly. */
function tentSegment(len: number, r0: number, r1: number): Sculpt {
  const s = new Sculpt()
  s.add(sphere([0, 0, 0], r0 * 1.03), { color: CHITIN_DK })
  s.add(cone([0, 0, 0], [0, len, 0], r0, r1), { color: CHITIN, k: 0.05 })
  const n = 3
  for (let j = 0; j < n; j++) {
    const y = ((j + 0.55) / n) * len
    const r = r0 + (r1 - r0) * (y / len)
    s.add(ellipsoid([0, y, r * 0.3], [r * 0.98, (len / n) * 0.6, r * 0.8], [-0.12, 0, 0]), {
      color: PLATE,
      k: 0.06
    })
  }
  s.paint(plane([0, 0, -r0 * 0.3], [0, 0, 1]), { color: BELLY, mask: MATTE })
  s.paint(slab([0, 0, 0], [1, 0, 0], 0.05), {
    color: VEIN_COL,
    mask: VEIN,
    within: ellipsoid([0, len * 0.5, r0], [0.4, len * 0.55, r0 * 0.75])
  })
  s.mirror((side) =>
    s.paint(slab([side * r0 * 0.72, 0, 0], [1, 0, 0.35 * side], 0.035), {
      color: VEIN_COL,
      mask: VEIN,
      within: ellipsoid([side * r0 * 0.7, len * 0.5, 0], [0.4, len * 0.5, r0])
    })
  )
  s.paint(slab([0, 0, 0], [1, 0, 0], 0.045), {
    color: ANGER_COL,
    mask: HOT,
    within: ellipsoid([0, len * 0.5, -r0], [0.4, len * 0.5, r0 * 0.7])
  })
  return s
}

/** The club: a thorned bulb with curved hooks, a spike and an eye-core on its outer side. */
function tentClub(): Sculpt {
  const s = new Sculpt()
  s.add(sphere([0, 0, 0], 0.39), { color: CHITIN_DK })
  s.add(cone([0, 0, 0], [0, 1.1, 0], 0.37, 0.46), { color: CHITIN, k: 0.05 })
  s.add(ellipsoid([0, 1.42, 0.05], [0.6, 0.78, 0.62]), { color: CHITIN, k: 0.3 })
  s.add(ellipsoid([0, 1.5, 0.22], [0.5, 0.62, 0.5]), { color: PLATE, k: 0.08 })
  s.add(cone([0, 1.9, 0], [0, 2.65, -0.25], 0.32, 0.03), { color: CHITIN_DK, k: 0.12 })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4
    const mid = polar(0.85, a, 1.55)
    s.add(cone(polar(0.42, a, 1.3), mid, 0.16, 0.09), { color: CHITIN_DK, k: 0.06 })
    s.add(cone(mid, polar(1.0, a, 2.0), 0.09, 0.02), { color: TOOTH, mask: MATTE, k: 0.03 })
  }
  s.add(sphere([0, 1.45, 0.62], 0.26), { color: CHITIN_DK, k: 0.05 })
  s.add(sphere([0, 1.47, 0.74], 0.19), { color: EYE_COL, mask: EYE, k: 0.02 })
  s.paint(plane([0, 0, -0.15], [0, 0, 1]), {
    color: BELLY,
    mask: MATTE,
    within: ellipsoid([0, 0.6, 0], [0.6, 0.9, 0.6])
  })
  s.paint(slab([0, 0, 0], [1, 0, 0], 0.05), {
    color: VEIN_COL,
    mask: VEIN,
    within: ellipsoid([0, 0.55, 0.4], [0.3, 0.75, 0.35])
  })
  for (let i = 0; i < 3; i++)
    s.paint(slab([0, 1.15 + i * 0.3, 0], [0, 1, 0.4], 0.035), {
      color: ANGER_COL,
      mask: HOT,
      within: ellipsoid([0, 1.45, -0.3], [0.6, 0.6, 0.4])
    })
  return s
}

export function kuitsukushiParts(): BossPartRecipe[] {
  return [
    { name: 'base', sculpt: base(), cell: 0.175, tris: 6400, hull: true, uses: 1, aoReach: 0.7 },
    { name: 'stalk', sculpt: stalk(), cell: 0.158, tris: 2600, hull: true, uses: 1, aoReach: 0.5 },
    { name: 'sacs', sculpt: sacs(), cell: 0.11, tris: 1800, hull: true, uses: 1, aoReach: 0.4 },
    { name: 'head', sculpt: head(), cell: 0.115, tris: 6200, hull: true, uses: 1, aoReach: 0.6 },
    { name: 'petal', sculpt: petal(), cell: 0.106, tris: 2000, hull: true, uses: 5, aoReach: 0.35 },
    { name: 'core', sculpt: core(), cell: 0.09, tris: 2200, hull: true, uses: 1, aoReach: 0.25 },
    { name: 'tentA', sculpt: tentSegment(TENT_L[0], 0.62, 0.47), cell: 0.13, tris: 720, hull: true, uses: 4 },
    { name: 'tentB', sculpt: tentSegment(TENT_L[1], 0.47, 0.36), cell: 0.115, tris: 640, hull: true, uses: 4 },
    { name: 'tentC', sculpt: tentClub(), cell: 0.11, tris: 900, hull: true, uses: 4 }
  ]
}
