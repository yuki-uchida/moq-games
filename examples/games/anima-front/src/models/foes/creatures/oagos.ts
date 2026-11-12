/**
 * オオアゴ: the brute (2.4 m). A hunched, heavy beetle-hound with a wall of pale armour plates on its brow and
 * shoulders (the hard front), two huge crushing mandibles, short pillar legs, and a glowing weak sac nested
 * between the plates of its back (the ×2 weak point).
 *
 * Parts: body, head (front armour, eyes), jawL, jawR, sac, legsA (front-left + back-right), legsB.
 */
import type * as THREE from 'three'
import { FOES } from '../../../data/enemies'
import type { FoeAnim } from '../../api'
import { ellipsoid, mx, plane, Sculpt, slab, sphere, type Vec3 } from '../../sdf/sculpt'
import type { FoeRecipe } from '../index'
import { HOT, MATTE, VEIN } from '../material'
import { bump, chain, clamp01, hash, pivotMatrix, sizeJitter, smooth, TAU } from '../rigging'
import type { TubeSpec } from '../tube'
import { BELLY, BONE, CHITIN, eyeCore, JOINT, PLATE, VEIN_C, vein, veinCut } from './palette'

const BODY = 0,
  HEAD = 1,
  JAW_L = 2,
  JAW_R = 3,
  SAC = 4,
  LEGS_A = 5,
  LEGS_B = 6

/** Pale bone-violet armour of the front. */
const ARMOR = 0x8a7bb0
const ARMOR_EDGE = 0xc9bde6
const BODY_C: Vec3 = [0, 1.3, -0.1]
const NECK: Vec3 = [0, 1.35, 0.75]
const SAC_C: Vec3 = [0, 2.0, -0.45]

function body(): Sculpt {
  const s = new Sculpt()
  // A heavy hunched torso: high shoulders, sloping back, a tucked abdomen.
  s.add(ellipsoid([0, 1.45, 0.35], [0.78, 0.62, 0.6]), { color: CHITIN })
  s.add(ellipsoid([0, 1.35, -0.45], [0.66, 0.58, 0.7], [0.25, 0, 0]), { color: CHITIN, k: 0.18 })
  s.add(ellipsoid([0, 1.05, -1.0], [0.42, 0.4, 0.38]), { color: CHITIN, k: 0.16 })
  // Back plates: a row of overlapping ridged shells framing the sac hollow.
  s.mirror((side) => {
    s.add(ellipsoid(mx([0.36, 1.98, -0.3], side), [0.32, 0.16, 0.5], [0.2, 0.25 * side, -0.35 * side]), {
      color: CHITIN,
      k: 0.08
    })
    s.add(ellipsoid(mx([0.5, 1.75, 0.45], side), [0.42, 0.3, 0.42], [0, 0, -0.5 * side]), { color: CHITIN, k: 0.1 })
  })
  s.sub(ellipsoid([0, 2.06, -0.45], [0.26, 0.2, 0.36]), { k: 0.06 })
  s.sub(plane([0, 0.62, 0], [0, 1, 0]), { k: 0.12 })
  // Markings: pale shoulder armour, soft belly, groove lines, glowing veins on the flanks and back.
  s.mirror((side) => {
    s.paint(ellipsoid(mx([0.6, 2.0, 0.5], side), [0.4, 0.3, 0.45]), { color: ARMOR })
    s.paint(slab(mx([0.5, 1.75, 0.45], side), [0.8 * side, 0.6, 0], 0.025), {
      color: ARMOR_EDGE,
      within: ellipsoid(mx([0.6, 1.95, 0.45], side), [0.4, 0.4, 0.45])
    })
    veinCut(s, [0, 1.3, 0], [0, 1, 0.25], 0.03, ellipsoid(mx([0.7, 1.3, -0.3], side), [0.25, 0.5, 0.7]))
    veinCut(s, mx([0.6, 1.4, -0.2], side), [0, 0.4, 1], 0.025, ellipsoid(mx([0.7, 1.45, -0.2], side), [0.25, 0.4, 0.2]))
  })
  s.paint(ellipsoid([0, 0.75, -0.2], [0.6, 0.3, 1.0]), { color: BELLY })
  for (const z of [-0.75, -1.0])
    s.paint(slab([0, 0, z], [0, 0.3, 1], 0.02), { color: JOINT, within: ellipsoid([0, 1.1, z], [0.7, 0.6, 0.2]) })
  vein(
    s,
    [
      [0, 1.9, 0.7],
      [0, 2.1, 0.25],
      [0, 2.06, -0.05]
    ],
    0.04
  )
  return s
}

function head(): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  // A low wedge head under a massive brow shield of three plates (the hard front).
  s.add(ellipsoid([0, 1.15, 1.05], [0.46, 0.34, 0.42]), { color: CHITIN })
  s.add(ellipsoid([0, 1.6, 1.0], [0.62, 0.22, 0.42], [-0.5, 0, 0]), { color: ARMOR, k: 0.08 })
  s.mirror((side) => {
    s.add(ellipsoid(mx([0.5, 1.35, 1.0], side), [0.26, 0.4, 0.34], [0, 0, 0.35 * side]), { color: ARMOR, k: 0.07 })
  })
  s.sub(plane([0, 0.82, 0], [0, 1, 0]), { k: 0.06 })
  // Plate edges and seams, eye-cores peeking out under the brow, and a mouth slit.
  s.paint(slab([0, 1.55, 1.25], [0, 0.6, 1], 0.03), {
    color: ARMOR_EDGE,
    within: ellipsoid([0, 1.6, 1.2], [0.7, 0.3, 0.3])
  })
  s.mirror((side) => {
    s.paint(slab(mx([0.33, 1.4, 1.1], side), [side, -0.3, 0.2], 0.018), {
      color: JOINT,
      within: ellipsoid(mx([0.35, 1.4, 1.1], side), [0.2, 0.35, 0.4])
    })
    eyeCore(s, mx([0.22, 1.32, 1.4], side), 0.07, [side * 0.3, 0, 1])
    eyeCore(s, mx([0.36, 1.24, 1.32], side), 0.05, [side * 0.6, 0, 0.8])
  })
  s.paint(ellipsoid([0, 0.95, 1.3], [0.3, 0.06, 0.2]), { color: JOINT })
  s.paint(slab([0, 1.75, 0], [1, 0, 0], 0.02), {
    color: VEIN_C,
    mask: VEIN,
    within: ellipsoid([0, 1.7, 1.0], [0.3, 0.3, 0.5])
  })
  // Brow horns.
  const tubes: TubeSpec[] = [1, -1].map((side) => ({
    pts: [mx([0.42, 1.72, 0.95], side), mx([0.62, 1.95, 0.9], side), mx([0.72, 2.2, 0.7], side)],
    r: [0.11, 0.07, 0],
    color: ARMOR,
    sides: 7,
    smooth: 2,
    ao: [0.8, 1] as [number, number]
  }))
  return { sculpt: s, tubes }
}

/** Hinge of a mandible (left side; mirrored). */
const HINGE: Vec3 = [0.36, 1.0, 1.25]

function jaw(side: number): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  // A huge curved crushing mandible with a row of blunt teeth on its inner edge.
  const pts: Vec3[] = [
    mx(HINGE, side),
    mx([0.62, 0.96, 1.5], side),
    mx([0.6, 0.98, 1.92], side),
    mx([0.3, 1.02, 2.22], side),
    mx([0.08, 1.06, 2.2], side)
  ]
  const tubes: TubeSpec[] = [
    { pts, r: [0.2, 0.19, 0.15, 0.09, 0.0], color: ARMOR, sides: 9, smooth: 3, flat: [1, 0.7], ao: [0.65, 1] }
  ]
  for (const [x, z] of [
    [0.5, 1.62],
    [0.5, 1.86],
    [0.36, 2.06]
  ]) {
    const base = mx([x, 0.98, z], side)
    tubes.push({
      pts: [base, mx([x - 0.17, 0.98, z + 0.03], side)],
      r: [0.065, 0],
      color: BONE,
      sides: 6,
      ao: [0.8, 1]
    })
  }
  s.paint(sphere(pts[4], 0.22), { color: BONE, mask: MATTE })
  s.paint(sphere(pts[0], 0.24), { color: CHITIN })
  s.paint(slab(mx([0.6, 1.1, 1.6], side), [0, 1, 0], 0.025), {
    color: VEIN_C,
    mask: VEIN,
    within: ellipsoid(mx([0.6, 1.1, 1.65], side), [0.25, 0.2, 0.45])
  })
  return { sculpt: s, tubes }
}

function sac(): Sculpt {
  const s = new Sculpt()
  // The glowing weak sac nested in the back hollow, laced with dark veins.
  s.add(ellipsoid([0, 2.08, -0.45], [0.34, 0.27, 0.42]), { color: 0x7a3a9a })
  s.paint(ellipsoid([0, 2.16, -0.45], [0.33, 0.26, 0.41]), { color: 0xffb0ff, mask: HOT })
  for (const a of [-0.9, -0.3, 0.3, 0.9])
    s.paint(slab([0, 2.0, -0.45], [Math.cos(a), 0, Math.sin(a)], 0.012), {
      color: 0x401a5a,
      within: ellipsoid([0, 2.25, -0.45], [0.38, 0.2, 0.46])
    })
  return s
}

/** Leg: hip, knee, foot (front-left; others mirror / flip). */
const LEG_F: Vec3[] = [
  [0.6, 1.35, 0.5],
  [1.0, 1.0, 0.62],
  [1.02, 0.42, 0.82],
  [0.98, 0.1, 0.92]
]
const LEG_B: Vec3[] = [
  [0.5, 1.2, -0.7],
  [0.95, 0.92, -0.98],
  [0.92, 0.4, -0.78],
  [0.88, 0.1, -0.72]
]

function legPair(front: number, back: number): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  const tubes: TubeSpec[] = []
  for (const [table, side] of [
    [LEG_F, front],
    [LEG_B, back]
  ] as [Vec3[], number][]) {
    const pts = table.map((p) => mx(p, side))
    tubes.push({ pts, r: [0.3, 0.24, 0.17, 0.15], color: CHITIN, sides: 10, smooth: 2, ao: [0.6, 1] })
    const k = pts[1]
    tubes.push({
      pts: [k, [k[0] + 0.12 * side, k[1] + 0.25, k[2] - 0.1]],
      r: [0.13, 0],
      color: ARMOR,
      sides: 7,
      ao: [0.8, 1]
    })
    // Three blunt claws per foot.
    for (const dx of [-0.08, 0, 0.08]) {
      const f = pts[3]
      tubes.push({
        pts: [
          [f[0] + dx, 0.1, f[2]],
          [f[0] + dx * 1.8, 0.02, f[2] + (table === LEG_F ? 0.26 : -0.22)]
        ],
        r: [0.075, 0],
        color: BONE,
        sides: 5,
        ao: [0.7, 1]
      })
    }
    s.paint(slab(pts[2], [0, 1, 0], 0.03), { color: VEIN_C, mask: VEIN, within: sphere(pts[2], 0.25) })
  }
  return { sculpt: s, tubes }
}

export function oagos(): FoeRecipe {
  const def = FOES.oagos
  const charge = def.attacks.find((a) => a.id === 'charge')!.windup
  const bite = def.attacks.find((a) => a.id === 'bite')!.windup
  return {
    parts: [
      { name: 'body', sculpt: body(), cell: 0.045, tris: 1500 },
      { name: 'head', ...head(), cell: 0.035, tris: 780 },
      { name: 'jawL', ...jaw(1), cell: 0.03, tris: 0 },
      { name: 'jawR', ...jaw(-1), cell: 0.03, tris: 0 },
      { name: 'sac', sculpt: sac(), cell: 0.03, tris: 260 },
      { name: 'legsA', ...legPair(1, -1), cell: 0.03, tris: 0 },
      { name: 'legsB', ...legPair(-1, 1), cell: 0.03, tris: 0 }
    ],
    look: { hot: 2.4 },
    pose: (a, out) => pose(a, out, charge, bite)
  }
}

function pose(a: FoeAnim, out: THREE.Matrix4[], chargeW: number, biteW: number) {
  const t = a.time + a.seed * 11
  const j = sizeJitter(a)
  const moving = clamp01(a.speed / 2.5)
  const ph = t * 1.5 * TAU
  let bob = Math.sin(t * 1.6) * 0.02,
    pitch = 0,
    roll = 0,
    yaw = 0,
    lean = 0,
    drop = 0
  let headPitch = Math.sin(t * 0.9) * 0.04,
    headYaw = Math.sin(t * 0.5 + a.seed * 4) * 0.12 * (1 - moving),
    jawOpen = 0.08 + 0.05 * Math.sin(t * 2.1),
    sac = 1 + 0.06 * Math.sin(t * 4.2),
    stride = 0.22 * moving,
    lift = 0.12 * moving,
    stomp = 0
  // Heavy gait: rolling shoulders, a pronounced bob.
  bob += -Math.abs(Math.sin(ph)) * 0.08 * moving
  roll += Math.sin(ph) * 0.06 * moving
  yaw += Math.sin(ph) * 0.04 * moving
  pitch += 0.06 * moving
  const st = a.st
  switch (a.state) {
    case 'spawn': {
      const u = smooth(st / 0.8)
      pitch -= 0.5 * (1 - u)
      jawOpen = 0.6 * (1 - u) + 0.1
      break
    }
    case 'windup':
      if (a.attack === 'charge') {
        // Head down behind the plates, shoulders hunched, a front paw scraping the ground.
        const u = smooth(st / chargeW)
        headPitch += 0.45 * u
        pitch += 0.18 * u
        drop = 0.15 * u
        lean = -0.18 * u
        stomp = Math.max(0, Math.sin(st * 14)) * u
        jawOpen = 0.05
        sac = 1.15 + 0.1 * Math.sin(t * 20) * u
        stride = 0
      } else {
        // Bite: rears up, jaws gape wide.
        const u = smooth(st / biteW)
        headPitch -= 0.3 * u
        pitch -= 0.1 * u
        jawOpen = 0.1 + 0.7 * u
        stride = 0
      }
      break
    case 'attack':
      if (a.attack === 'charge') {
        // Ramming: head low, legs churning.
        headPitch += 0.4
        pitch += 0.15
        lean = 0.15
        stride = 0.4
        lift = 0.2
        jawOpen = 0.05
      } else {
        const u = clamp01(st / 0.15)
        jawOpen = 0.8 * (1 - u) - 0.05
        headPitch += 0.35 * bump(u, 0, 1) - 0.3 * (1 - u)
        lean = 0.2 * bump(u, 0, 1)
      }
      break
    case 'recover': {
      const u = smooth(st / 0.6)
      headPitch += 0.2 * (1 - u)
      drop = 0.1 * (1 - u)
      jawOpen = 0.15
      break
    }
    case 'stagger': {
      const u = clamp01(st / 0.6)
      pitch -= 0.25 * bump(u, 0, 1)
      roll += Math.sin(st * 18) * 0.08 * (1 - u)
      headYaw += Math.sin(st * 13) * 0.3 * (1 - u)
      jawOpen = 0.5
      break
    }
    case 'dying': {
      // Collapses forward onto its plates, legs folding.
      const u = smooth(st / 0.5)
      drop = 0.62 * u
      pitch += 0.25 * u
      roll += (hash(a.seed, 7) > 0.5 ? 1 : -1) * 0.25 * u
      headPitch += 0.3 * u
      jawOpen = 0.4 * (1 - u)
      sac = 1 - 0.5 * u
      stride = 0
      lift = 0
      break
    }
  }
  const B = out[BODY]
  pivotMatrix(B, BODY_C[0], BODY_C[1], BODY_C[2], 0, bob - drop, lean, pitch, yaw, roll, j, j, j)
  pivotMatrix(out[HEAD], NECK[0], NECK[1], NECK[2], 0, 0, 0, headPitch, headYaw, 0)
  chain(out[HEAD], B)
  for (const [k, side] of [
    [JAW_L, 1],
    [JAW_R, -1]
  ]) {
    pivotMatrix(out[k], HINGE[0] * side, HINGE[1], HINGE[2], 0, 0, 0, 0, side * jawOpen * 0.9, 0)
    chain(out[k], out[HEAD])
  }
  pivotMatrix(out[SAC], SAC_C[0], 1.88, SAC_C[2], 0, 0, 0, 0, 0, 0, sac, sac, sac)
  chain(out[SAC], B)
  // Leg pairs slide and lift (diagonal trot); they stand on the floor and follow a little of the body sway.
  const dying = a.state === 'dying'
  for (let k = 0; k < 2; k++) {
    const p = ph + k * Math.PI
    const swing = Math.max(0, Math.sin(p))
    const slide = -Math.cos(p) * stride
    const up = lift * swing + (k === 0 ? stomp * 0.18 : 0)
    const sq = 1 - (drop * 0.8) / 1.3
    const L = out[LEGS_A + k]
    pivotMatrix(L, 0, 0, 0, 0, up, slide + lean * 0.5, dying ? 0 : pitch * 0.15, 0, roll * 0.3, j, sq * j, j)
  }
}
