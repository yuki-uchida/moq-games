/**
 * ツブテ: a six-legged crawler (0.7 m) that comes in packs. A segmented, ridged abdomen with three back spines
 * and glowing side veins, a low armoured head with a three-eye cluster and hooked mandibles. The legs move as
 * two alternating tripods (L1 R2 L3 / R1 L2 R3) — one part each — so a crowd of 100+ stays cheap.
 *
 * Parts: body, head, jaws (both mandibles; opening = widening the part), tripodA, tripodB.
 */
import type * as THREE from 'three'
import { FOES } from '../../../data/enemies'
import type { FoeAnim } from '../../api'
import { cone, ellipsoid, mx, plane, Sculpt, slab, sphere, type Vec3 } from '../../sdf/sculpt'
import type { FoeRecipe } from '../index'
import { bump, chain, clamp01, hash, pivotMatrix, sizeJitter, smooth, TAU } from '../rigging'
import { BELLY, BONE, CHITIN, eyeCore, JOINT, PLATE, vein, veinCut } from './palette'
import type { TubeSpec } from '../tube'

const BODY = 0,
  HEAD = 1,
  JAWS = 2,
  TRI_A = 3,
  TRI_B = 4

/** Neck pivot (head turns here) and jaw hinge. */
const NECK: Vec3 = [0, 0.36, 0.26]
const HINGE: Vec3 = [0, 0.3, 0.4]

function body(): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  // Thorax under a raised shield plate, then a four-segment abdomen rising to the back. One colour in the
  // geometry (colours are shader-painted) so the low-poly simplification spends triangles on the shape.
  s.add(ellipsoid([0, 0.37, 0.1], [0.19, 0.14, 0.2]), { color: CHITIN })
  s.add(ellipsoid([0, 0.45, 0.07], [0.175, 0.075, 0.18], [-0.15, 0, 0]), { color: CHITIN, k: 0.04 })
  const segs: [number, number, number, number][] = [
    [-0.08, 0.41, 0.21, 0.16],
    [-0.21, 0.44, 0.245, 0.18],
    [-0.34, 0.445, 0.23, 0.17],
    [-0.46, 0.42, 0.17, 0.13]
  ]
  for (const [z, y, rx, ry] of segs) s.add(ellipsoid([0, y, z], [rx, ry, 0.105]), { color: CHITIN, k: 0.03 })
  s.sub(plane([0, 0.25, 0], [0, 1, 0]), { k: 0.05 })
  // Lighter plate tops, a pale soft belly and dark grooves between the segments.
  s.paint(ellipsoid([0, 0.62, -0.18], [0.2, 0.14, 0.42]), { color: PLATE })
  s.paint(ellipsoid([0, 0.52, 0.08], [0.15, 0.06, 0.15]), { color: PLATE })
  s.paint(ellipsoid([0, 0.24, -0.15], [0.21, 0.1, 0.42]), { color: BELLY })
  for (const z of [-0.145, -0.275, -0.405])
    s.paint(slab([0, 0, z], [0, 0.25, 1], 0.009), { color: JOINT, within: ellipsoid([0, 0.45, z], [0.3, 0.25, 0.1]) })
  s.paint(slab([0, 0, -0.01], [0, 0.4, 1], 0.008), { color: JOINT, within: ellipsoid([0, 0.45, 0], [0.3, 0.2, 0.1]) })
  // Glowing veins: a spine line, and on each flank a long line with two branches.
  vein(
    s,
    [
      [0, 0.585, 0.02],
      [0, 0.63, -0.17],
      [0, 0.63, -0.33],
      [0, 0.565, -0.48]
    ],
    0.022
  )
  s.mirror((side) => {
    const flank = ellipsoid(mx([0.2, 0.4, -0.2], side), [0.12, 0.14, 0.32])
    veinCut(s, [0, 0.39, 0], [0, 1, 0.12], 0.014, flank)
    veinCut(
      s,
      mx([0.2, 0.4, -0.18], side),
      [0.15, 0.6, 1],
      0.009,
      ellipsoid(mx([0.2, 0.46, -0.16], side), [0.12, 0.09, 0.05])
    )
    veinCut(
      s,
      mx([0.2, 0.4, -0.31], side),
      [0.15, 0.6, 1],
      0.009,
      ellipsoid(mx([0.2, 0.46, -0.29], side), [0.12, 0.09, 0.05])
    )
  })
  // Back spines raked backwards, pale tips.
  const tubes: TubeSpec[] = []
  for (const [z, y, r] of [
    [-0.12, 0.56, 0.05],
    [-0.26, 0.6, 0.055],
    [-0.39, 0.57, 0.045]
  ]) {
    tubes.push({
      pts: [
        [0, y - 0.04, z + 0.02],
        [0, y + 0.06, z - 0.06],
        [0, y + 0.11, z - 0.13]
      ],
      r: [r, r * 0.45, 0],
      color: CHITIN,
      sides: 5,
      ao: [0.8, 1]
    })
    s.paint(sphere([0, y + 0.11, z - 0.13], 0.035), { color: BONE, mask: [0, 0, 1, 0] })
  }
  return { sculpt: s, tubes }
}

function head(): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  s.add(ellipsoid([0, 0.355, 0.33], [0.135, 0.1, 0.115]), { color: CHITIN })
  // A brow crest that overhangs the eyes.
  s.add(ellipsoid([0, 0.425, 0.33], [0.125, 0.055, 0.1], [-0.35, 0, 0]), { color: CHITIN, k: 0.03 })
  s.sub(plane([0, 0.27, 0], [0, 1, 0]), { k: 0.03 })
  s.paint(ellipsoid([0, 0.5, 0.3], [0.16, 0.06, 0.12]), { color: PLATE })
  // Three eye-cores: a big one in the middle, two small ones beside it.
  eyeCore(s, [0, 0.385, 0.425], 0.034, [0, 0.2, 1])
  eyeCore(s, [0.068, 0.365, 0.405], 0.024, [0.45, 0.1, 0.9])
  eyeCore(s, [-0.068, 0.365, 0.405], 0.024, [-0.45, 0.1, 0.9])
  s.paint(ellipsoid([0, 0.28, 0.36], [0.11, 0.035, 0.09]), { color: BELLY })
  // Two swept horns.
  const tubes: TubeSpec[] = [1, -1].map((side) => ({
    pts: [mx([0.06, 0.43, 0.34], side), mx([0.11, 0.5, 0.3], side), mx([0.15, 0.55, 0.22], side)],
    r: [0.03, 0.02, 0],
    color: CHITIN,
    sides: 5,
    ao: [0.85, 1] as [number, number]
  }))
  return { sculpt: s, tubes }
}

function jaws(): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  const tubes: TubeSpec[] = []
  for (const side of [1, -1]) {
    // A hooked mandible: thick base, curving forward and inward to a pale tip.
    const tip = mx([0.03, 0.275, 0.575], side)
    tubes.push({
      pts: [mx([0.07, 0.305, 0.39], side), mx([0.095, 0.29, 0.48], side), mx([0.075, 0.282, 0.54], side), tip],
      r: [0.032, 0.027, 0.018, 0],
      color: CHITIN,
      sides: 6,
      smooth: 2,
      flat: [1, 0.7],
      ao: [0.8, 1]
    })
    s.paint(sphere(tip, 0.05), { color: BONE, mask: [0, 0, 1, 0] })
  }
  return { sculpt: s, tubes }
}

/** Leg anchor table: hip, knee, ankle, claw tip (left side; mirrored for right). */
const LEGS: Vec3[][] = [
  [
    [0.12, 0.34, 0.2],
    [0.3, 0.47, 0.29],
    [0.37, 0.14, 0.39],
    [0.39, 0.0, 0.44]
  ],
  [
    [0.14, 0.34, 0.04],
    [0.36, 0.48, 0.05],
    [0.45, 0.14, 0.04],
    [0.47, 0.0, 0.03]
  ],
  [
    [0.14, 0.34, -0.1],
    [0.33, 0.46, -0.23],
    [0.39, 0.14, -0.35],
    [0.41, 0.0, -0.41]
  ]
]

function tripod(sides: [number, number, number]): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  const tubes: TubeSpec[] = []
  LEGS.forEach((leg, i) => {
    const side = sides[i]
    const pts = leg.map((p) => mx(p, side))
    tubes.push({ pts, r: [0.055, 0.05, 0.032, 0], color: CHITIN, sides: 6, ao: [0.6, 1] })
    s.paint(sphere(pts[3], 0.075), { color: BONE, mask: [0, 0, 1, 0] })
    s.paint(sphere(pts[1], 0.045), { color: PLATE })
  })
  return { sculpt: s, tubes }
}

export function tsubute(): FoeRecipe {
  const def = FOES.tsubute
  const bite = def.attacks.find((a) => a.id === 'bite')!.windup
  const leap = def.attacks.find((a) => a.id === 'leap')!.windup
  return {
    parts: [
      { name: 'body', ...body(), cell: 0.016, tris: 470 },
      { name: 'head', ...head(), cell: 0.012, tris: 200 },
      { name: 'jaws', ...jaws(), cell: 0.01, tris: 0 },
      { name: 'tripodA', ...tripod([1, -1, 1]), cell: 0.014, tris: 0 },
      { name: 'tripodB', ...tripod([-1, 1, -1]), cell: 0.014, tris: 0 }
    ],
    pose: (a, out) => pose(a, out, bite, leap)
  }
}

function pose(a: FoeAnim, out: THREE.Matrix4[], biteW: number, leapW: number) {
  const t = a.time + a.seed * 17
  const j = sizeJitter(a)
  const moving = clamp01(a.speed / 2.5)
  // Constant cadence (time is global; a speed-dependent frequency would make phases jump).
  const ph = t * 7.5 + a.seed * TAU
  let bob = 0,
    pitch = 0,
    roll = 0,
    yaw = 0,
    lift = 0,
    sy = 1,
    sz = 1
  let headPitch = 0,
    headYaw = 0,
    headZ = 0,
    jawOpen = 0.15 + 0.08 * Math.sin(t * 9) * (1 - moving)
  let legSquash = 1,
    legSpread = 1,
    legSlide = 0.075 * moving,
    legLift = 0.07 * moving,
    scuttle = 0
  // Idle: breathing abdomen, head twitches and sways.
  const breathe = Math.sin(t * 2.4) * 0.012
  bob += breathe
  headYaw += Math.sin(t * 1.3) * 0.18 * (1 - moving) + (hash(Math.floor(t * 0.7), a.seed) - 0.5) * 0.3 * (1 - moving)
  // Run: bob twice per stride, slight roll with the tripods.
  bob += Math.abs(Math.sin(ph * 0.5)) * 0.03 * moving
  roll += Math.sin(ph * 0.5) * 0.06 * moving
  pitch += 0.06 * moving
  const st = a.st
  switch (a.state) {
    case 'spawn': {
      // Clawing out of the ground: nose up, legs scrabbling fast, jaws wide.
      const u = clamp01(st / 0.8)
      pitch -= 0.6 * (1 - u)
      scuttle = 1 - u
      jawOpen = 0.8 * (1 - u) + 0.15
      legSpread = 1 + 0.15 * (1 - u)
      break
    }
    case 'windup':
      if (a.attack === 'leap') {
        // Crouch, rear back, tremble, jaws wide: about to spring.
        const u = smooth(st / leapW)
        bob -= 0.12 * u
        pitch -= 0.35 * u
        legSquash = 1 - 0.38 * u
        legSpread = 1 + 0.18 * u
        jawOpen = 0.2 + 0.9 * u
        roll += Math.sin(t * 60) * 0.04 * u
        headPitch -= 0.25 * u
      } else {
        // Bite: head draws back and up, mandibles gape.
        const u = smooth(st / biteW)
        headZ -= 0.06 * u
        headPitch -= 0.4 * u
        jawOpen = 0.2 + 1.0 * u
        pitch -= 0.12 * u
      }
      break
    case 'attack':
      if (a.attack === 'leap') {
        // Airborne: stretched out, legs trailing back, jaws forward and open.
        pitch += 0.25 - Math.min(st, 0.6) * 0.5
        legSquash = 1.18
        legSlide = 0
        legLift = 0
        sz = 1.08
        jawOpen = 1.1
        headPitch += 0.2
        scuttle = 0.6
      } else {
        // Bite: lunge and snap shut.
        const u = clamp01(st / 0.12)
        headZ += 0.1 * bump(u, 0, 1)
        headPitch += 0.35 * bump(u, 0, 1)
        jawOpen = 1.2 * (1 - u) - 0.1
        pitch += 0.1 * bump(u, 0, 1)
      }
      break
    case 'recover': {
      const u = clamp01(st / 0.35)
      bob -= 0.06 * (1 - u)
      legSquash = 1 - 0.2 * (1 - u)
      jawOpen = 0.1
      break
    }
    case 'stagger': {
      const u = clamp01(st / 0.6)
      pitch -= 0.4 * Math.sin(u * Math.PI)
      roll += Math.sin(st * 30) * 0.15 * (1 - u)
      headYaw += Math.sin(st * 25) * 0.4 * (1 - u)
      scuttle = 1 - u
      jawOpen = 0.9
      break
    }
    case 'dying': {
      // Flips onto its side, legs curling in.
      const u = smooth(st / 0.35)
      roll += (hash(a.seed, 5) > 0.5 ? 1 : -1) * 1.9 * u
      bob += 0.05 * Math.sin(u * Math.PI) - 0.06 * u
      legSquash = 1 - 0.55 * u
      legSpread = 1 - 0.35 * u
      legSlide = 0
      legLift = 0
      jawOpen = 0.9 - 0.8 * u
      headPitch += 0.5 * u
      sy = 1 - 0.1 * u
      break
    }
  }
  // Body: about its centre of mass.
  const B = out[BODY]
  pivotMatrix(B, 0, 0.36, -0.1, 0, bob + lift, 0, pitch, yaw, roll, j, j * sy, j * sz)
  pivotMatrix(out[HEAD], NECK[0], NECK[1], NECK[2], 0, 0, headZ, headPitch, headYaw, 0)
  chain(out[HEAD], B)
  const open = Math.max(0.55, 0.85 + jawOpen * 0.55)
  pivotMatrix(out[JAWS], HINGE[0], HINGE[1], HINGE[2], 0, 0, 0, jawOpen * 0.15, 0, 0, open, 1, 1)
  chain(out[JAWS], out[HEAD])
  // Tripods: swing phase lifts and slides forward, stance slides back; B is half a cycle later. Legs stand on
  // the ground (squash/spread about the floor) and only follow a little of the body's pitch and roll; a dying
  // crawler's legs curl with the body.
  const dying = a.state === 'dying'
  for (let k = 0; k < 2; k++) {
    const p = ph + k * Math.PI + scuttle * t * 30
    const c = Math.cos(p)
    const swing = Math.max(0, Math.sin(p))
    const slide = (legSlide + scuttle * 0.05) * c
    const up = (legLift + scuttle * 0.06) * swing
    const L = out[TRI_A + k]
    if (dying) {
      pivotMatrix(L, 0, 0.36, 0, 0, 0, 0, 0, 0, 0, legSpread, legSquash, 1)
      chain(L, B)
    } else pivotMatrix(L, 0, 0, 0, 0, up, slide, pitch * 0.12, 0, roll * 0.35, legSpread * j, legSquash * j, j)
  }
}
