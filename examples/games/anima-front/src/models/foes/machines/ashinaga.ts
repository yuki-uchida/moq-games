/**
 * アシナガ: a four-legged walker. A pearl carapace on a graphite belly, a sensor head with one large lens, four
 * long spider legs with high knees, and a plasma mortar folded on its back.
 *
 * Walk: a trot (diagonal pairs) at a fixed cadence, stride and lift scaled by speed, with body bob and sway.
 * Mortar (wind-up): the legs brace and splay as the body squats, the mortar swings up and a plasma orb grows in
 * its muzzle; the shot kicks the barrel down and the body dips (the sim goes straight to 'recover').
 */
import type * as THREE from 'three'
import { FOES } from '../../../data/enemies'
import type { FoeAnim } from '../../api'
import {
  alongRows,
  box,
  capsule,
  cone,
  cylinder,
  ellipsoid,
  Sculpt,
  shell,
  sphere,
  torus,
  type Vec3
} from '../../sdf/sculpt'
import type { FoeRecipe } from '../index'
import type { TubeSpec } from '../tube'
import { EYE, HOT, VEIN } from '../material'
import { chain, clamp01, hash, mix, pivotMatrix, smooth, TAU, windupT } from '../rigging'
import {
  BEZEL,
  beginPose,
  endPose,
  GRAPHITE,
  hidePart,
  kick,
  lensSculpt,
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

const DEF = FOES.ashinaga
const WIND = DEF.attacks[0].windup
/** Body centre and the hips. */
const BY = 1.45
const HIP_X = 0.42
const HIP_Y = 1.38
const HIP_Z = 0.4
/** Knee and foot (left-front; mirrored per leg). */
const KNEE: Vec3 = [0.78, 2.0, 0.7]
const FOOT: Vec3 = [0.93, 0, 0.87]
/** Horizontal reach hip → foot along the diagonal (splay compensation). */
const REACH = Math.hypot(FOOT[0] - HIP_X, FOOT[2] - HIP_Z)
/** Mortar trunnion (pivot) and its stowed / raised pitch (rest = barrel straight up). */
const MP: Vec3 = [0, 1.88, -0.22]
const STOW = -0.95
const RAISE = 0.22
const BARREL = 0.66
/** Lens on the sensor head. */
const LENS: Vec3 = [0, 1.39, 0.8]
/** Legs in part order: front-left, front-right, back-left, back-right (side x, side z, gait offset). */
const LEGS: [number, number, number][] = [
  [1, 1, 0],
  [-1, 1, 0.5],
  [1, -1, 0.5],
  [-1, -1, 0]
]
/** Gait cadence (cycles per second). */
const FREQ = 1.15

function body(): Sculpt {
  const s = new Sculpt()
  // Layered carapace: a long dome with a raised fore plate, on a graphite belly.
  s.add(ellipsoid([0, 1.5, -0.06], [0.6, 0.29, 0.78]), { color: PEARL })
  s.add(ellipsoid([0, 1.57, 0.2], [0.48, 0.22, 0.5]), { color: PEARL, k: 0.03 })
  s.add(ellipsoid([0, 1.54, -0.5], [0.44, 0.2, 0.38]), { color: PEARL_2, k: 0.03 })
  s.add(ellipsoid([0, 1.32, -0.02], [0.48, 0.19, 0.6]), { color: GRAPHITE, k: 0.04 })
  // Sensor head under the front lip, the lens in a pearl bezel.
  s.add(ellipsoid([0, 1.37, 0.64], [0.24, 0.16, 0.2]), { color: GRAPHITE, k: 0.05 })
  s.add(torus([LENS[0], LENS[1], LENS[2] - 0.02], 0.115, 0.028, [Math.PI / 2, 0, 0]), { color: PEARL, k: 0.012 })
  // Hip sockets and the mortar mount.
  s.mirror((sx) => {
    for (const sz of [1, -1]) s.add(sphere([HIP_X * sx, HIP_Y, HIP_Z * sz], 0.12), { color: GRAPHITE, k: 0.03 })
  })
  s.add(cylinder([0, 1.8, MP[2]], 0.21, 0.05, 0.02), { color: GRAPHITE, k: 0.03 })
  // Rear warning lights.
  s.mirror((sx) => {
    s.add(sphere([0.2 * sx, 1.52, -0.82], 0.042), { color: WARN_C, mask: HOT, k: 0.01 })
  })
  s.append(lensSculpt(LENS, 0.1, 0.55))
  // Plates: rim light seam, the fore plate's edge, panel lines and side vents.
  seam(s, [0, 1.43, 0], [0, 1, 0], 0.014, ellipsoid([0, 1.5, -0.1], [0.66, 0.2, 0.8]))
  const top = ellipsoid([0, 1.66, -0.06], [0.62, 0.2, 0.8])
  panelLine(s, [0, 0, 0], [1, 0, 0], 0.007, ellipsoid([0, 1.7, -0.45], [0.1, 0.2, 0.4]))
  panelLine(s, [0, 0, -0.5], [0, 0, 1], 0.007, top)
  s.paint(shell([0, 1.57, 0.2], [0.48, 0.22, 0.5], 0.012), {
    color: SEAM_C,
    mask: VEIN,
    within: ellipsoid([0, 1.6, -0.15], [0.7, 0.2, 0.3])
  })
  s.mirror((sx) => {
    s.paint(ellipsoid([0.5 * sx, 1.55, -0.3], [0.07, 0.013, 0.17], [0, 0, 0.6 * sx]), { color: SEAM_C, mask: VEIN })
  })
  return s
}

/** The mortar at rest pointing straight up from its trunnion. */
function mortar(): Sculpt {
  const s = new Sculpt()
  const [x, y, z] = MP
  s.add(box([x, y, z], [0.17, 0.09, 0.13], 0.035), { color: GRAPHITE })
  s.add(cylinder([x, y, z], 0.08, 0.21, 0.02, [0, 0, Math.PI / 2]), { color: STEEL, k: 0.01 })
  s.add(cone([x, y + 0.02, z], [x, y + BARREL, z], 0.2, 0.16), { color: PEARL, k: 0.025 })
  s.add(cylinder([x, y + 0.08, z], 0.215, 0.07, 0.03), { color: PEARL_2, k: 0.015 })
  s.add(torus([x, y + BARREL, z], 0.155, 0.045), { color: GRAPHITE, k: 0.012 })
  s.sub(cylinder([x, y + BARREL + 0.05, z], 0.11, 0.13), { color: BEZEL, k: 0.008 })
  s.add(sphere([x, y + BARREL - 0.07, z], 0.1), { color: SEAM_C, mask: EYE })
  const barrel = cylinder([x, y + 0.35, z], 0.23, 0.3)
  seam(s, [x, y + 0.27, z], [0, 1, 0], 0.016, barrel)
  seam(s, [x, y + 0.44, z], [0, 1, 0], 0.016, barrel)
  // Recoil pistons on the back of the barrel.
  for (const sx of [1, -1]) {
    s.add(capsule([x + 0.1 * sx, y + 0.05, z - 0.14], [x + 0.1 * sx, y + 0.4, z - 0.13], 0.032), {
      color: STEEL,
      k: 0.01
    })
  }
  return s
}

/** The plasma orb that forms on the muzzle during the wind-up. */
function orb(): Sculpt {
  const s = new Sculpt()
  s.add(sphere([MP[0], MP[1] + BARREL + 0.13, MP[2]], 0.22), { color: SEAM_C, mask: EYE })
  return s
}

/** A long spider leg: SDF joints and plates, tube segments (thigh, shin, spike foot). */
function leg(sx: number, sz: number): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  const H: Vec3 = [HIP_X * sx, HIP_Y, HIP_Z * sz]
  const K: Vec3 = [KNEE[0] * sx, KNEE[1], KNEE[2] * sz]
  const A: Vec3 = [mix(K[0], FOOT[0] * sx, 0.84), mix(K[1], FOOT[1], 0.84), mix(K[2], FOOT[2] * sz, 0.84)]
  const F: Vec3 = [FOOT[0] * sx, 0.035, FOOT[2] * sz]
  const o: Vec3 = [sx * 0.7071, 0, sz * 0.7071]
  const M: Vec3 = [mix(H[0], K[0], 0.5) + o[0] * 0.02, mix(H[1], K[1], 0.5) + 0.03, mix(H[2], K[2], 0.5) + o[2] * 0.02]
  s.add(sphere(H, 0.1), { color: GRAPHITE })
  s.add(sphere(K, 0.088), { color: GRAPHITE })
  // Knee spike and the armour plate over the thigh.
  s.add(cone(K, [K[0] + 0.07 * sx, K[1] + 0.2, K[2] + 0.06 * sz], 0.062, 0.016), { color: PEARL, k: 0.025 })
  s.add(ellipsoid(M, [0.095, 0.2, 0.06], alongRows([K[0] - H[0], K[1] - H[1], K[2] - H[2]], [o[0], 0, o[2]])), {
    color: PEARL_2,
    k: 0.02
  })
  s.add(cylinder(A, 0.06, 0.035, 0.015), { color: GRAPHITE, k: 0.01 })
  s.add(sphere(F, 0.045), { color: GRAPHITE, k: 0.02 })
  // Knee light and a light stripe down the outer face of the shin.
  s.paint(sphere([K[0] + o[0] * 0.085, K[1] + 0.01, K[2] + o[2] * 0.085], 0.035), { color: SEAM_C, mask: VEIN })
  const p0: Vec3 = [mix(K[0], A[0], 0.12) + o[0] * 0.058, mix(K[1], A[1], 0.12), mix(K[2], A[2], 0.12) + o[2] * 0.058]
  const p1: Vec3 = [mix(K[0], A[0], 0.6) + o[0] * 0.048, mix(K[1], A[1], 0.6), mix(K[2], A[2], 0.6) + o[2] * 0.048]
  s.paint(capsule(p0, p1, 0.013), { color: SEAM_C, mask: VEIN })
  return {
    sculpt: s,
    tubes: [
      { pts: [H, M, K], r: [0.075, 0.085, 0.068], color: PEARL, sides: 8, ao: [0.7, 1] },
      { pts: [K, mix3(K, A, 0.5), A], r: [0.062, 0.052, 0.04], color: PEARL, sides: 8, ao: [0.95, 0.85] },
      { pts: [A, F], r: [0.036, 0.022], color: GRAPHITE, sides: 6, ao: [0.8, 0.65] }
    ]
  }
}

const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]

const B = 0
const MORTAR = 1
const LEG0 = 2
const ORB = 6
const FX = 7

/** Splay angle that keeps the foot on the ground when the hip drops by `d` metres (Newton on the foot rise). */
function splayFor(d: number): number {
  let th = d / REACH
  for (let i = 0; i < 4; i++) {
    const rise = HIP_Y * (1 - Math.cos(th)) + REACH * Math.sin(th) - d
    th -= rise / (HIP_Y * Math.sin(th) + REACH * Math.cos(th))
  }
  return Math.min(Math.max(th, 0), 1.2)
}

function pose(a: FoeAnim, out: THREE.Matrix4[]): void {
  const root = beginPose(a)
  const t = a.time + a.seed * 23
  const st = a.st
  const amp = Math.min(1.3, a.speed / DEF.speed)
  const walk = smooth(amp * 2.5)
  const cyc = a.time * FREQ + a.seed * 7.31
  // Body: idle hum, trot bob and sway.
  let y = Math.sin(t * 1.6) * 0.012 * (1 - walk) + Math.cos(cyc * TAU * 2) * 0.03 * amp
  let rx = 0.03 * amp + Math.sin(t * 0.9) * 0.01
  let rz = Math.sin(cyc * TAU) * 0.035 * amp
  let ry = Math.sin(t * 0.45) * 0.05 * (1 - walk)
  let squat = 0
  let mortarRx = STOW + Math.sin(t * 0.8) * 0.03
  let mortarSlide = 0
  let mortarRz = 0
  let glow = 0
  let sparks = a.hpFrac < 0.3 ? 0.05 : 0
  let fold = 0
  let buckle = 0
  let shake = 0
  switch (a.state) {
    case 'spawn': {
      fold = 1 - smooth((st - 0.12) / 0.42)
      const land = st - 0.6
      squat = land > 0 ? Math.sin(Math.min(1, land / 0.2) * Math.PI) * 0.16 : 0
      break
    }
    case 'windup': {
      const w = windupT(a, WIND)
      squat = 0.2 * smooth(w / 0.4)
      const r = smooth((w - 0.08) / 0.5)
      mortarRx = mix(STOW, RAISE, r) + Math.sin(r * Math.PI) * 0.12
      glow = smooth((w - 0.3) / 0.65)
      shake = smooth((w - 0.7) / 0.3)
      rx -= 0.05 * smooth(w / 0.5)
      break
    }
    case 'attack':
    case 'recover': {
      const s0 = a.state === 'attack' ? 0 : st
      const r = kick(s0, 0, 7)
      squat = 0.2 * (1 - smooth(s0 / 0.5)) + 0.08 * r
      mortarRx = mix(RAISE, STOW, smooth((s0 - 0.2) / 0.4)) - 0.12 * r
      mortarSlide = -0.2 * r
      rx -= 0.05 * (1 - smooth(s0 / 0.4)) + 0.06 * r
      break
    }
    case 'stagger': {
      const f = 1 - smooth((st - 0.3) / 0.4)
      shake = f * 2.5
      sparks = 0.65 * f
      squat = 0.08 * f
      break
    }
    case 'dying': {
      const u = smooth(st / 0.32)
      buckle = u
      const side = hash(a.seed, 5) < 0.5 ? 1 : -1
      y -= 0.95 * u - Math.sin(clamp01((st - 0.32) / 0.15) * Math.PI) * 0.06
      rx += 0.16 * u
      rz += 0.12 * u * side
      mortarRx = mix(mortarRx, -1.45, smooth(st / 0.4))
      mortarRz = 0.35 * side * smooth(st / 0.4)
      sparks = st < 0.5 ? 0.8 : 0
      shake = (1 - u) * 1.2
      break
    }
    default:
      break
  }
  if (shake > 0) {
    y += shudder(a, 63) * 0.012 * shake
    rz += shudder(a, 47, 3) * 0.02 * shake
  }
  y -= squat
  const body = pivotMatrix(out[B], 0, BY, 0, 0, y, 0, rx, ry, rz)

  // Mortar on its trunnion (follows the body), sliding along the barrel when it fires.
  const m = pivotMatrix(out[MORTAR], MP[0], MP[1], MP[2], 0, 0, 0, mortarRx, 0, mortarRz)
  if (mortarSlide !== 0) {
    const e = m.elements
    e[12] += e[4] * mortarSlide
    e[13] += e[5] * mortarSlide
    e[14] += e[6] * mortarSlide
  }
  chain(m, body)
  if (glow > 0.01) {
    const g = glow * (0.85 + 0.15 * Math.sin(a.time * 40))
    const muzzleY = MP[1] + BARREL
    chain(pivotMatrix(out[ORB], MP[0], muzzleY, MP[2], 0, 0, 0, 0, 0, 0, g, g, g), m)
  } else chain(hidePart(out[ORB], MP[0], MP[1] + BARREL - 0.1, MP[2]), m)

  // Legs: hips ride with the body, feet stay planted (splay compensates the squat / collapse).
  for (let i = 0; i < 4; i++) {
    const sx = LEGS[i][0]
    const sz = LEGS[i][1]
    const u = (((cyc + LEGS[i][2]) % 1) + 1) % 1
    let p = 0
    let lift = 0
    if (u < 0.55) p = 1 - (2 * u) / 0.55
    else {
      const v = (u - 0.55) / 0.45
      p = -1 + 2 * smooth(v)
      lift = Math.sin(v * Math.PI)
    }
    // The hip rides with the body (bob, squat, collapse); the splay keeps the foot planted.
    const dy = y + HIP_X * sx * rz - HIP_Z * sz * rx
    let splay = dy < 0 ? splayFor(-dy) : -dy / REACH
    let yaw = -sx * 0.3 * amp * p
    let ty = dy + 0.17 * amp * lift
    let roll = 0.05 * amp * lift
    if (fold > 0) {
      yaw += sx * sz * 0.75 * fold
      ty += 0.3 * fold
      splay -= 0.3 * fold
    }
    if (buckle > 0) {
      const lag = hash(a.seed, 20 + i) * 0.25
      splay += (0.12 + lag) * buckle
      yaw += (hash(a.seed, 30 + i) - 0.5) * 0.5 * buckle
    }
    if (shake > 0) roll += shudder(a, 51, i * 1.7) * 0.03 * shake
    // Splay turns the leg about the horizontal axis across its diagonal (positive lifts the foot outwards).
    const k = splay * 0.7071
    pivotMatrix(out[LEG0 + i], HIP_X * sx, HIP_Y, HIP_Z * sz, 0, ty, 0, -sz * k, yaw, sx * (k + roll))
  }

  sparkPose(out[FX], a, 0, BY, 0, sparks)
  chain(out[FX], body)
  endPose(out, 8, root)
}

export function ashinaga(): FoeRecipe {
  return {
    parts: [
      { name: 'body', sculpt: body(), cell: 0.026, tris: 1300 },
      { name: 'mortar', sculpt: mortar(), cell: 0.02, tris: 420 },
      ...LEGS.map(([sx, sz], i) => ({
        name: ['legFL', 'legFR', 'legBL', 'legBR'][i],
        ...leg(sx, sz),
        cell: 0.018,
        tris: 200
      })),
      { name: 'orb', sculpt: orb(), cell: 0.03, tris: 110 },
      { name: 'sparks', sculpt: sparkSculpt([0, BY, 0], [0.62, 0.3, 0.72], 9, 0.14), cell: 0.016, tris: 150 }
    ],
    pose
  }
}
