/**
 * タテガミ: a shield-projector walker. A pearl lion-like chest on two digitigrade legs, a low head with one lens,
 * flank shields, and a mane of emitter blades fanned behind the head around a glowing emitter orb.
 *
 * Shield dome (wind-up 1 s): the walker rears up, the folded mane swings up, fans out into a half circle and
 * locks with a flare; after that the sim keeps the dome up, so every later state holds the mane open (it only
 * lies folded along the back while dropping in and opening). Dying: the legs buckle, the mane collapses and the
 * lens goes dark.
 */
import type * as THREE from 'three'
import { FOES } from '../../../data/enemies'
import type { FoeAnim } from '../../api'
import {
  capsule,
  cone,
  cylinder,
  ellipsoid,
  Sculpt,
  slab,
  sphere,
  torus,
  type Shape,
  type Vec3
} from '../../sdf/sculpt'
import type { FoeRecipe } from '../index'
import type { TubeSpec } from '../tube'
import { EYE, HOT, VEIN } from '../material'
import { chain, clamp01, hash, mix, pivotMatrix, smooth, TAU, windupT } from '../rigging'
import {
  beginPose,
  endPose,
  flicker,
  GRAPHITE,
  lensSculpt,
  paintAll,
  LINE,
  panelLine,
  PEARL,
  PEARL_2,
  seam,
  SEAM_C,
  shudder,
  sparkPose,
  sparkSculpt,
  STEEL,
  WARN_C
} from './kit'

const DEF = FOES.tategami
const WIND = DEF.attacks[0].windup
/** Body centre, hips and the leg length (hip → ground). */
const BY = 1.2
const HIP: Vec3 = [0.3, 0.98, -0.14]
const LEG_L = 0.96
/** Mane hub (blades fan in the XY plane around it) and blade length. */
const HUB: Vec3 = [0, 1.52, -0.2]
const BLADE = 0.6
/** Blade angles from vertical (+ = towards +X) of the centre / left / right mane parts when fanned. */
const DEG = Math.PI / 180
const FAN_C = [-22 * DEG, 0, 22 * DEG]
const FAN_L = [44 * DEG, 66 * DEG, 88 * DEG]
/** Spread that folds the side parts onto the centre one, and the backward fold of the whole mane. */
const FOLD_Z = 66 * DEG
const FOLD_X = -1.25
/** Lens on the face. */
const LENS: Vec3 = [0, 1.27, 0.69]
const FREQ = 1.45

function body(): Sculpt {
  const s = new Sculpt()
  // Chest leaning forward, the pelvis, a back plate and the mane mount.
  s.add(ellipsoid([0, 1.22, 0.08], [0.4, 0.37, 0.44], [0.25, 0, 0]), { color: PEARL })
  s.add(ellipsoid([0, 0.98, -0.16], [0.3, 0.2, 0.3]), { color: GRAPHITE, k: 0.05 })
  s.add(ellipsoid([0, 1.43, -0.16], [0.29, 0.18, 0.3]), { color: PEARL_2, k: 0.05 })
  s.add(cylinder([HUB[0], HUB[1], HUB[2] + 0.02], 0.14, 0.06, 0.025, [Math.PI / 2, 0, 0]), {
    color: GRAPHITE,
    k: 0.03
  })
  // Head: a pearl helmet with a graphite face, low and forward like a lion's.
  s.add(ellipsoid([0, 1.31, 0.5], [0.2, 0.165, 0.21]), { color: PEARL, k: 0.05 })
  s.add(ellipsoid([0, 1.27, 0.6], [0.155, 0.085, 0.1]), { color: GRAPHITE, k: 0.012 })
  s.add(ellipsoid([0, 1.17, 0.56], [0.12, 0.06, 0.12]), { color: PEARL_2, k: 0.03 })
  s.add(torus([LENS[0], LENS[1], LENS[2] - 0.025], 0.085, 0.022, [Math.PI / 2, 0, 0]), { color: PEARL, k: 0.01 })
  // Flank shields and hip sockets.
  s.mirror((sx) => {
    s.add(ellipsoid([0.41 * sx, 1.17, 0.1], [0.075, 0.27, 0.36], [0.2, 0, -0.18 * sx]), { color: PEARL_2, k: 0.03 })
    s.add(sphere([HIP[0] * sx, HIP[1], HIP[2]], 0.12), { color: GRAPHITE, k: 0.03 })
    s.add(sphere([0.15 * sx, 1.2, -0.48], 0.035), { color: WARN_C, mask: HOT, k: 0.01 })
  })
  // Light seams: a collar round the chest, the shield edges and a line along the back plate.
  seam(s, [0, 0, 0.3], [0, 0.25, 1], 0.012, ellipsoid([0, 1.22, 0.08], [0.45, 0.42, 0.5]))
  s.mirror((sx) => {
    const shield = ellipsoid([0.43 * sx, 1.17, 0.1], [0.08, 0.29, 0.38], [0.2, 0, -0.18 * sx])
    s.paint(slab([0, 1.12, 0], [0, 1, -0.2], 0.011), { color: SEAM_C, mask: VEIN, within: shield })
    s.paint(slab([0, 1.22, 0], [0, 1, -0.2], 0.006), { color: LINE, within: shield })
  })
  panelLine(s, [0, 0, 0], [1, 0, 0], 0.006, ellipsoid([0, 1.38, 0.1], [0.08, 0.25, 0.32]))
  seam(s, [0, 0, 0], [1, 0, 0], 0.01, ellipsoid([0, 1.55, -0.2], [0.05, 0.1, 0.28]))
  return s
}

/** A mane part: blades fanned at `angles` around the hub (tubes) with light lines, glowing tips, the orb. */
function mane(angles: number[], z: number, orb: boolean): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  const tubes: TubeSpec[] = []
  const lines: Shape[] = []
  const tips: Shape[] = []
  for (const a of angles) {
    const d: Vec3 = [Math.sin(a), Math.cos(a), 0]
    const at = (l: number): Vec3 => [HUB[0] + d[0] * l, HUB[1] + d[1] * l, z]
    tubes.push({
      pts: [at(0.08), at(0.36), at(BLADE)],
      r: [0.04, 0.062, 0],
      color: PEARL,
      sides: 6,
      flat: [1, 0.36],
      up: [0, 0, 1],
      ao: [0.75, 1]
    })
    const q0 = at(0.16)
    const q1 = at(BLADE - 0.1)
    lines.push(capsule([q0[0], q0[1], z + 0.02], [q1[0], q1[1], z + 0.02], 0.011))
    lines.push(capsule([q0[0], q0[1], z - 0.02], [q1[0], q1[1], z - 0.02], 0.011))
    tips.push(sphere(at(BLADE - 0.02), 0.06))
  }
  // Steel root collars on the blades.
  for (const a of angles) {
    const d: Vec3 = [Math.sin(a), Math.cos(a), 0]
    s.add(
      cone(
        [HUB[0] + d[0] * 0.06, HUB[1] + d[1] * 0.06, z],
        [HUB[0] + d[0] * 0.15, HUB[1] + d[1] * 0.15, z],
        0.045,
        0.035
      ),
      {
        color: STEEL
      }
    )
  }
  if (orb) {
    s.add(sphere([HUB[0], HUB[1], z + 0.06], 0.085), { color: SEAM_C, mask: EYE, k: 0.01 })
    s.add(torus([HUB[0], HUB[1], z + 0.03], 0.1, 0.022, [Math.PI / 2, 0, 0]), { color: PEARL, k: 0.01 })
  }
  paintAll(s, lines, { color: SEAM_C, mask: VEIN })
  s.paint(tips[0], { color: SEAM_C, mask: EYE, union: tips.slice(1) })
  return { sculpt: s, tubes }
}

/** A digitigrade leg: tube thigh / shin / metatarsus with SDF joints, plates and a two-toed foot. */
function leg(sx: number): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  const H: Vec3 = [HIP[0] * sx, HIP[1], HIP[2]]
  const K: Vec3 = [0.37 * sx, 0.6, 0.12]
  const A: Vec3 = [0.37 * sx, 0.25, -0.15]
  const B: Vec3 = [0.37 * sx, 0.07, 0.02]
  s.add(sphere(H, 0.1), { color: GRAPHITE })
  s.add(sphere(K, 0.085), { color: GRAPHITE })
  s.add(sphere(A, 0.062), { color: GRAPHITE })
  // Thigh armour plate on the outside, knee cap.
  s.add(ellipsoid([0.41 * sx, 0.8, -0.02], [0.05, 0.2, 0.12], [-0.6, 0, 0.1 * sx]), { color: PEARL_2, k: 0.025 })
  s.add(ellipsoid([K[0], K[1] + 0.02, K[2] + 0.05], [0.07, 0.08, 0.055]), { color: PEARL, k: 0.02 })
  // Foot: two toes forward and a heel spur.
  for (const tx of [-0.065, 0.065]) {
    s.add(capsule(B, [B[0] + tx, 0.035, 0.2], 0.035), { color: GRAPHITE, k: 0.02 })
  }
  s.add(cone(A, [A[0], 0.06, -0.24], 0.04, 0.02), { color: GRAPHITE, k: 0.015 })
  s.add(sphere(B, 0.05), { color: GRAPHITE, k: 0.02 })
  s.paint(sphere([K[0], K[1] + 0.02, K[2] + 0.1], 0.03), { color: SEAM_C, mask: VEIN })
  s.paint(capsule([0.43 * sx, 0.9, -0.08], [0.43 * sx, 0.72, 0.03], 0.012), { color: SEAM_C, mask: VEIN })
  return {
    sculpt: s,
    tubes: [
      { pts: [H, K], r: [0.095, 0.075], color: PEARL, sides: 8, ao: [0.7, 0.95] },
      { pts: [K, A], r: [0.065, 0.05], color: PEARL, sides: 8, ao: [0.95, 0.85] },
      { pts: [A, B], r: [0.045, 0.04], color: GRAPHITE, sides: 6, ao: [0.85, 0.7] }
    ]
  }
}

const B_P = 0
/** Left leg; the right one follows it. */
const LEG_LP = 1
const MANE_C = 3
const MANE_L = 4
const MANE_R = 5
const LENS_P = 6
const FX = 7

function legPose(out: THREE.Matrix4, sx: number, ty: number, rx: number, rz: number): THREE.Matrix4 {
  return pivotMatrix(out, HIP[0] * sx, HIP[1], HIP[2], 0, ty, 0, rx, 0, rz)
}

function pose(a: FoeAnim, out: THREE.Matrix4[]): void {
  const root = beginPose(a)
  const t = a.time + a.seed * 29
  const st = a.st
  const amp = Math.min(1.25, a.speed / DEF.speed)
  const walk = smooth(amp * 2.5)
  const cyc = a.time * FREQ + a.seed * 5.17
  // Gait: alternate legs; stance moves the foot back linearly, swing lifts it forward.
  let pL = 0
  let pR = 0
  let liftL = 0
  let liftR = 0
  let stanceAngle = 0
  for (let i = 0; i < 2; i++) {
    const u = (((cyc + i * 0.5) % 1) + 1) % 1
    let p = 0
    let lift = 0
    if (u < 0.5) p = 1 - 4 * u
    else {
      const v = (u - 0.5) * 2
      p = -1 + 2 * smooth(v)
      lift = Math.sin(v * Math.PI)
    }
    if (i === 0) {
      pL = p
      liftL = lift
    } else {
      pR = p
      liftR = lift
    }
    if (u < 0.5) stanceAngle = 0.36 * amp * p
  }
  // The stance arc lowers the hips; the legs' own swing keeps that foot down.
  const gaitY = -LEG_L * (1 - Math.cos(stanceAngle))
  let y = gaitY + Math.sin(t * 1.7) * 0.01 * (1 - walk)
  let rx = 0.06 * amp + Math.sin(t * 0.8) * 0.012
  let rz = Math.sin(cyc * TAU) * 0.04 * amp
  let ry = Math.sin(cyc * TAU) * 0.05 * amp + Math.sin(t * 0.4) * 0.06 * (1 - walk)
  // Mane: open (1) / folded (0), raised, the flare when it locks, and its wave.
  let open = 1
  let raise = 1
  let flare = 0
  let fold = 0
  let lit = true
  let sparks = a.hpFrac < 0.3 ? 0.05 : 0
  let legFold = 0
  let collapse = 0
  let shake = 0
  switch (a.state) {
    case 'spawn': {
      open = 0
      raise = 0
      legFold = 1 - smooth((st - 0.15) / 0.4)
      lit = st > 0.6 || (st > 0.48 && flicker(a, 20, 0.5))
      const land = st - 0.6
      if (land > 0) y -= Math.sin(Math.min(1, land / 0.2) * Math.PI) * 0.12
      break
    }
    case 'windup': {
      const w = windupT(a, WIND)
      raise = smooth(w / 0.35)
      const o = clamp01((w - 0.3) / 0.45)
      open = smooth(o) + Math.sin(o * Math.PI) * 0.12
      flare = Math.sin(clamp01((w - 0.72) / 0.28) * Math.PI)
      rx -= 0.14 * smooth(w / 0.4) - 0.06 * flare
      y += 0.015 * smooth(w / 0.4)
      shake = flare * 0.8
      break
    }
    case 'stagger': {
      const f = 1 - smooth((st - 0.3) / 0.4)
      shake = f * 2.5
      sparks = 0.65 * f
      lit = f < 0.2 || flicker(a, 18, 0.6)
      break
    }
    case 'dying': {
      const u = smooth(st / 0.35)
      collapse = u
      y -= 0.62 * u
      rx += 0.35 * u
      rz += 0.12 * u * (hash(a.seed, 6) < 0.5 ? 1 : -1)
      open = 1 - smooth(st / 0.3) * 1.25
      raise = 1 - u
      fold = smooth(st / 0.4)
      lit = st < 0.12 && flicker(a, 30, 0.5)
      sparks = st < 0.5 ? 0.8 : 0
      shake = (1 - u) * 1.5
      break
    }
    default:
      break
  }
  if (shake > 0) {
    y += shudder(a, 61) * 0.012 * shake
    rz += shudder(a, 45, 2) * 0.025 * shake
  }
  const body = pivotMatrix(out[B_P], 0, BY, 0, 0, y, 0, rx, ry, rz)

  // Legs: hips follow the body height; feet stay planted through the stance arc.
  for (let i = 0; i < 2; i++) {
    const sx = i === 0 ? 1 : -1
    const p = i === 0 ? pL : pR
    const lift = i === 0 ? liftL : liftR
    const hy = y + HIP[0] * sx * rz
    let lrx = -0.36 * amp * p + 0.1 * amp * lift
    let ty = hy + 0.13 * amp * lift
    // Any other drop of the hip (landing squash, shudder) splays the leg sideways so the foot stays down.
    const drop = gaitY - hy
    let lrz = drop > 0 && collapse === 0 ? sx * Math.acos(Math.max(0.2, 1 - drop / LEG_L)) : 0
    if (legFold > 0) {
      lrx += 0.7 * legFold
      ty += 0.2 * legFold
      lrz += sx * 0.25 * legFold
    }
    if (collapse > 0) {
      lrx += 0.85 * collapse * (0.8 + 0.4 * hash(a.seed, 40 + i))
      lrz += sx * 0.45 * collapse
      ty += 0.25 * collapse
    }
    if (shake > 0) lrz += shudder(a, 53, i * 2.3) * 0.03 * shake
    legPose(out[LEG_LP + i], sx, ty, lrx, lrz)
  }

  // Mane: one fold / raise for the group; the side parts turn onto the centre one about the hub axis to fold
  // (+Z turns the left blades towards the top); a slow wave while it holds.
  const mx = mix(FOLD_X, 0.12, raise) - fold * 0.5
  const my = 0.12 * raise - 0.1 * fold
  const k = 1 + 0.08 * flare
  const wave = 0.035 * open
  const spread = (1 - open) * FOLD_Z
  pivotMatrix(out[MANE_C], HUB[0], HUB[1], HUB[2], 0, my, 0, mx, 0, Math.sin(t * 1.9) * wave * 0.5, k, k, k)
  pivotMatrix(out[MANE_L], HUB[0], HUB[1], HUB[2], 0, my, 0, mx, 0, spread - Math.sin(t * 1.9 + 1.2) * wave, k, k, k)
  pivotMatrix(out[MANE_R], HUB[0], HUB[1], HUB[2], 0, my, 0, mx, 0, -spread + Math.sin(t * 1.9 + 2.4) * wave, k, k, k)
  if (shake > 0) {
    out[MANE_L].elements[13] += shudder(a, 71, 1) * 0.01 * shake
    out[MANE_R].elements[13] += shudder(a, 67, 3) * 0.01 * shake
  }
  chain(out[MANE_C], body)
  chain(out[MANE_L], body)
  chain(out[MANE_R], body)

  if (lit) out[LENS_P].copy(body)
  else chain(pivotMatrix(out[LENS_P], 0, 0, 0, 0, 0, -0.07, 0, 0, 0), body)
  sparkPose(out[FX], a, 0, BY, 0, sparks)
  chain(out[FX], body)
  endPose(out, 8, root)
}

export function tategami(): FoeRecipe {
  return {
    parts: [
      { name: 'body', sculpt: body(), cell: 0.022, tris: 1300 },
      { name: 'legL', ...leg(1), cell: 0.016, tris: 260 },
      { name: 'legR', ...leg(-1), cell: 0.016, tris: 260 },
      { name: 'maneC', ...mane(FAN_C, HUB[2] - 0.03, true), cell: 0.014, tris: 220 },
      { name: 'maneL', ...mane(FAN_L, HUB[2] - 0.07, false), cell: 0.014, tris: 120 },
      {
        name: 'maneR',
        ...mane(
          FAN_L.map((x) => -x),
          HUB[2] - 0.07,
          false
        ),
        cell: 0.014,
        tris: 120
      },
      { name: 'eye', sculpt: lensSculpt(LENS, 0.072, 0.6), cell: 0.006, tris: 80 },
      { name: 'sparks', sculpt: sparkSculpt([0, BY, 0], [0.45, 0.4, 0.5], 8, 0.11), cell: 0.012, tris: 130 }
    ],
    pose
  }
}
