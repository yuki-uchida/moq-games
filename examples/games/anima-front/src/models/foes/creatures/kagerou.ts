/**
 * カゲロウ: the flyer (hovers 5–8 m). A slim armoured thorax with a small head of two big orange compound
 * eyes, a long segmented abdomen ending in a glowing stinger, two pairs of thin veined wings that blur while
 * hovering, and small legs tucked under. Dives at its target: it rears, spreads the wings, then pitches down.
 *
 * Parts: body (head + thorax), tail (abdomen; curls), wingFL, wingFR, wingBL, wingBR, legs.
 */
import type * as THREE from 'three'
import { FOES } from '../../../data/enemies'
import type { FoeAnim } from '../../api'
import { ellipsoid, mx, Sculpt, slab, sphere, type Vec3 } from '../../sdf/sculpt'
import type { FoeRecipe } from '../index'
import { EYE, HOT, MATTE, VEIN } from '../material'
import { bump, chain, clamp01, hash, pivotMatrix, sizeJitter, smooth, TAU } from '../rigging'
import type { TubeSpec } from '../tube'
import { BELLY, CHITIN, EYE_C, JOINT, PLATE, VEIN_C, veinCut } from './palette'

const BODY = 0,
  TAIL = 1,
  WING0 = 2,
  LEGS = 6

const BODY_C: Vec3 = [0, 0.45, 0.05]
/** Abdomen root (it curls about this point). */
const TAIL_ROOT: Vec3 = [0, 0.44, -0.16]
/** Wing roots (left side): fore and hind. */
const WING_F: Vec3 = [0.07, 0.55, 0.08]
const WING_B: Vec3 = [0.07, 0.54, -0.06]
const WING_MEMBRANE = 0x9c8cc8

function body(): Sculpt {
  const s = new Sculpt()
  s.add(ellipsoid([0, 0.46, 0.02], [0.11, 0.11, 0.16]), { color: CHITIN })
  s.add(ellipsoid([0, 0.52, 0.0], [0.09, 0.05, 0.13]), { color: CHITIN, k: 0.03 })
  // Head with two big compound eyes and a small jaw.
  s.add(ellipsoid([0, 0.47, 0.22], [0.08, 0.075, 0.07]), { color: CHITIN, k: 0.03 })
  s.mirror((side) => {
    s.add(ellipsoid(mx([0.065, 0.5, 0.24], side), [0.065, 0.07, 0.065]), { color: JOINT, k: 0.015 })
    s.paint(ellipsoid(mx([0.085, 0.51, 0.26], side), [0.06, 0.065, 0.06]), { color: EYE_C, mask: EYE })
  })
  s.paint(ellipsoid([0, 0.6, 0.0], [0.11, 0.08, 0.16]), { color: PLATE })
  s.paint(ellipsoid([0, 0.36, 0.02], [0.1, 0.05, 0.14]), { color: BELLY })
  s.paint(slab([0, 0, 0], [1, 0, 0], 0.012), {
    color: VEIN_C,
    mask: VEIN,
    within: ellipsoid([0, 0.56, 0.0], [0.05, 0.06, 0.18])
  })
  return s
}

function tail(): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  // A long segmented abdomen curving down at the end, a glowing stinger tip.
  const pts: Vec3[] = [
    [0, 0.45, -0.12],
    [0, 0.44, -0.32],
    [0, 0.4, -0.52],
    [0, 0.32, -0.7],
    [0, 0.22, -0.8],
    [0, 0.12, -0.84]
  ]
  for (let i = 0; i < 5; i++) {
    const p = pts[i]
    const r = 0.075 - i * 0.009
    s.add(ellipsoid(p, [r, r * 0.95, 0.1]), { color: CHITIN, k: 0.025 })
  }
  s.add(ellipsoid([0, 0.17, -0.83], [0.04, 0.06, 0.04]), { color: CHITIN, k: 0.02 })
  for (let i = 0; i < 4; i++) {
    const a = pts[i],
      b = pts[i + 1]
    const m: Vec3 = [0, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
    s.paint(slab(m, [0, b[1] - a[1], b[2] - a[2]], 0.008), { color: VEIN_C, mask: VEIN, within: sphere(m, 0.1) })
  }
  s.paint(sphere([0, 0.1, -0.85], 0.05), { color: 0xffb0ff, mask: HOT })
  return {
    sculpt: s,
    tubes: [
      {
        pts: [
          [0, 0.14, -0.84],
          [0, 0.06, -0.82],
          [0, 0.0, -0.78]
        ],
        r: [0.03, 0.018, 0],
        color: CHITIN,
        sides: 5
      }
    ]
  }
}

/** A long thin wing: a flat tube (membrane) with glowing veins painted along it. */
function wing(
  root: Vec3,
  side: number,
  len: number,
  width: number,
  sweep: number
): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const r = mx(root, side)
  const tip: Vec3 = [r[0] + side * len, r[1] + 0.02, r[2] - sweep]
  const mid: Vec3 = [r[0] + side * len * 0.5, r[1] + 0.03, r[2] - sweep * 0.35]
  const s = new Sculpt()
  // Veins: a leading-edge vein and two cross veins.
  s.paint(slab(r, [0, 0, 1], 0.01), {
    color: VEIN_C,
    mask: VEIN,
    within: ellipsoid([mid[0], mid[1], r[2] + 0.02], [len * 0.55, 0.04, 0.025])
  })
  for (const f of [0.35, 0.68]) {
    const p: Vec3 = [r[0] + side * len * f, r[1], r[2] - sweep * f]
    s.paint(slab(p, [1, 0, -sweep / len], 0.008), { color: VEIN_C, mask: VEIN, within: sphere(p, width * 1.2) })
  }
  s.paint(sphere(tip, width * 0.9), { color: 0x5a4a88, mask: MATTE })
  return {
    sculpt: s,
    tubes: [
      {
        pts: [r, mid, tip],
        r: [width * 0.35, width, 0],
        color: WING_MEMBRANE,
        sides: 8,
        smooth: 3,
        flat: [1, 0.07],
        up: [0, 0, 1],
        ao: [0.8, 1]
      }
    ]
  }
}

function legs(): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const tubes: TubeSpec[] = []
  for (const side of [1, -1])
    for (const z of [0.09, 0.0, -0.08])
      tubes.push({
        pts: [mx([0.05, 0.38, z], side), mx([0.11, 0.33, z + 0.03], side), mx([0.1, 0.24, z + 0.07], side)],
        r: [0.018, 0.014, 0],
        color: CHITIN,
        sides: 4,
        ao: [0.7, 1]
      })
  return { sculpt: new Sculpt(), tubes }
}

export function kagerou(): FoeRecipe {
  const dive = FOES.kagerou.attacks[0].windup
  return {
    parts: [
      { name: 'body', sculpt: body(), cell: 0.012, tris: 620 },
      { name: 'tail', ...tail(), cell: 0.012, tris: 420 },
      { name: 'wingFL', opacity: 0.7, ...wing(WING_F, 1, 0.62, 0.075, 0.1), cell: 0.01, tris: 0 },
      { name: 'wingFR', opacity: 0.7, ...wing(WING_F, -1, 0.62, 0.075, 0.1), cell: 0.01, tris: 0 },
      { name: 'wingBL', opacity: 0.7, ...wing(WING_B, 1, 0.55, 0.085, 0.2), cell: 0.01, tris: 0 },
      { name: 'wingBR', opacity: 0.7, ...wing(WING_B, -1, 0.55, 0.085, 0.2), cell: 0.01, tris: 0 },
      { name: 'legs', ...legs(), cell: 0.01, tris: 0 }
    ],
    look: { glow: 1.8, eye: 2.6 },
    pose: (a, out) => pose(a, out, dive)
  }
}

function pose(a: FoeAnim, out: THREE.Matrix4[], windup: number) {
  const t = a.time + a.seed * 7
  const j = sizeJitter(a)
  const moving = clamp01(a.speed / 5)
  // Hover: bob and drift; wings beat fast (fore and hind out of phase).
  let bob = Math.sin(t * 2.3) * 0.06,
    pitch = 0.08 * moving + Math.sin(t * 1.7) * 0.04,
    roll = Math.sin(t * 1.3 + a.seed * 3) * 0.1,
    yaw = 0,
    curl = 0.15 + Math.sin(t * 1.9) * 0.08,
    beat = 1,
    spread = 0,
    sweepBack = 0,
    legTuck = 0.45 + 0.3 * moving
  let flapRate = 26
  const st = a.st
  switch (a.state) {
    case 'spawn': {
      // Unfurls its wings as it rises from the ground.
      const u = smooth(st / 0.8)
      sweepBack = 1.2 * (1 - u)
      beat = u
      curl = 0.6 * (1 - u) + 0.15
      pitch -= 0.4 * (1 - u)
      break
    }
    case 'windup': {
      // Rears up, wings spread wide and freeze, stinger curls forward under the body.
      const u = smooth(st / windup)
      pitch -= 0.55 * u
      beat = 1 - 0.85 * u
      spread = 0.35 * u
      curl = 0.15 + 0.9 * u
      roll *= 1 - u
      bob += Math.sin(t * 30) * 0.02 * u
      break
    }
    case 'attack': {
      // Dive: nose down, wings swept back, abdomen straight behind like a spear.
      const u = smooth(st / 0.15)
      pitch += 0.9 * u
      sweepBack = 1.0 * u
      beat = 0.25
      curl = -0.1 * u
      roll = 0
      legTuck = 1
      break
    }
    case 'recover': {
      const u = smooth(st / 0.8)
      pitch += 0.5 * (1 - u)
      sweepBack = 0.6 * (1 - u)
      flapRate = 34
      break
    }
    case 'stagger': {
      const u = clamp01(st / 0.6)
      roll += Math.sin(st * 20) * 0.5 * (1 - u)
      pitch += Math.sin(st * 15) * 0.3 * (1 - u)
      beat = 1.4
      break
    }
    case 'dying': {
      // Wings crumple, it spins and drops.
      const u = smooth(st / 0.5)
      roll += (hash(a.seed, 9) > 0.5 ? 1 : -1) * 2.2 * u
      pitch += 0.8 * u
      bob -= 0.4 * u
      beat = 1 - u
      sweepBack = 1.1 * u
      curl = 0.15 + 0.8 * u
      legTuck = 1
      break
    }
  }
  roll += Math.sin(t * 0.8) * 0.15 * moving
  yaw += Math.sin(t * 0.9) * 0.08
  const B = out[BODY]
  pivotMatrix(B, BODY_C[0], BODY_C[1], BODY_C[2], 0, bob, 0, pitch, yaw, roll, j, j, j)
  pivotMatrix(out[TAIL], TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2], 0, 0, 0, curl * 0.6, 0, 0)
  chain(out[TAIL], B)
  const ph = t * flapRate
  for (let w = 0; w < 4; w++) {
    const side = w & 1 ? -1 : 1
    const hind = w >= 2
    const root = hind ? WING_B : WING_F
    const flap = Math.sin(ph + (hind ? 1.6 : 0) + (side < 0 ? 0.0 : 0)) * 0.75 * beat + spread
    // Roll about the body axis = flap; yaw back = sweep; slight pitch twist with the beat.
    const back = sweepBack * (hind ? 0.7 : 1)
    pivotMatrix(
      out[WING0 + w],
      root[0] * side,
      root[1],
      root[2],
      0,
      0,
      0,
      0.15 * Math.cos(ph) * beat,
      side * (back * 0.9),
      -side * flap
    )
    chain(out[WING0 + w], B)
  }
  pivotMatrix(out[LEGS], 0, 0.38, 0.0, 0, 0.04 * legTuck, 0, -0.6 * legTuck + bump(Math.sin(t * 3), -1, 1) * 0.05, 0, 0)
  chain(out[LEGS], B)
}
