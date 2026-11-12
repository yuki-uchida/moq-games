/**
 * コロガシ: a rolling sphere bomb. A pearl ball with deep cyan-lit grooves rolls under a graphite yoke (hubs on
 * the axle and a hoop over the top carrying the single lens pod), like a giant grenade that hunts.
 *
 * Rolling: the ball turns about X at the nominal rate while it moves. Explode (wind-up): red warning lamps pop
 * out of their sockets blinking faster and faster, the ball swells and a red-hot core shows through the
 * grooves (the plates cracking open); dying (the blast, or a destroyed bomb) flares the core and throws the
 * yoke off.
 */
import type * as THREE from 'three'
import { FOES } from '../../../data/enemies'
import type { FoeAnim } from '../../api'
import { capsule, cylinder, ellipsoid, Sculpt, slab, sphere, torus, type Shape, type Vec3 } from '../../sdf/sculpt'
import type { FoeRecipe } from '../index'
import type { TubeSpec } from '../tube'
import { HOT, VEIN } from '../material'
import { chain, clamp01, hash, pivotMatrix, smooth, TAU, windupT } from '../rigging'
import {
  BEZEL,
  beginPose,
  endPose,
  flicker,
  GRAPHITE,
  lensSculpt,
  paintAll,
  PEARL,
  PEARL_2,
  SEAM_C,
  shudder,
  STEEL,
  WARN_C
} from './kit'

const DEF = FOES.korogashi
const WIND = DEF.attacks[0].windup
/** Ball radius and centre height. */
const R = 0.47
const CY = 0.48
/** Radius of the hot seam rings inside the ball (they surface when the ball swells). */
const CORE = 0.43
/** Hoop radius over the ball. */
const HOOP = 0.6
/** Unlit lamp glass. */
const LAMP_OFF = 0x4a1820
/** Warning lamps: angles around X on the tread band. */
const LAMPS = 8
/** Lens on the front of the top pod. */
const LENS: Vec3 = [0, CY + HOOP + 0.01, 0.155]
/** Roll rate while moving (rad/s) and the speed below which the ball holds still. */
const ROLL_RATE = DEF.speed / R
const ROLLING = 1.2

const lampAngle = (i: number) => ((i + 0.5) / LAMPS) * TAU

/** Flat axle caps of the ball (the hubs cover them). */
const CAP_X = 0.44
/** Seam circles of the ball: four great circles through the axle (normals) and two latitude rings (x). */
const SEAM_NORMALS: Vec3[] = [
  [0, 1, 0],
  [0, 0.7071, 0.7071],
  [0, 0, 1],
  [0, 0.7071, -0.7071]
]
const SEAM_X = 0.2

/**
 * The ball: a lathe tube around the axle (X) so it stays perfectly round at any budget (a decimated SDF sphere
 * keeps its vertices on the seams and leaves large flat plates that the hot core would show through). The
 * markings are shader regions: side plates, seam gaps with a cyan light line, dark-red lamp lenses.
 */
function ball(): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  const C: Vec3 = [0, CY, 0]
  const pts: Vec3[] = []
  const r: number[] = []
  const N = 18
  for (let i = 0; i <= N; i++) {
    // Denser rings towards the caps, where the profile turns fastest.
    const u = -1 + (2 * i) / N
    const x = CAP_X * Math.sin((u * Math.PI) / 2)
    pts.push([x, CY, 0])
    r.push(Math.sqrt(R * R - x * x))
  }
  s.paint(slab([0.36, CY, 0], [1, 0, 0], 0.12), { color: PEARL_2, union: [slab([-0.36, CY, 0], [1, 0, 0], 0.12)] })
  const seams = (w: number) => [
    ...SEAM_NORMALS.map((n) => slab(C, n, w)),
    slab([SEAM_X, CY, 0], [1, 0, 0], w),
    slab([-SEAM_X, CY, 0], [1, 0, 0], w)
  ]
  const gaps = seams(0.017)
  paintAll(s, gaps, { color: GRAPHITE })
  const lines = seams(0.0065)
  paintAll(s, lines, { color: SEAM_C, mask: VEIN })
  // Unlit lamp lenses in the middle of each tread plate (the lamps pop out over them) and the cap rims.
  const lenses: Shape[] = []
  for (let i = 0; i < LAMPS; i++) {
    const a = lampAngle(i)
    lenses.push(sphere([0, CY + Math.sin(a) * R, Math.cos(a) * R], 0.04))
  }
  paintAll(s, lenses, { color: LAMP_OFF })
  s.paint(slab([CAP_X, CY, 0], [1, 0, 0], 0.012), { color: GRAPHITE, union: [slab([-CAP_X, CY, 0], [1, 0, 0], 0.012)] })
  return { sculpt: s, tubes: [{ pts, r, color: PEARL, sides: 24, ao: [1, 1], up: [0, 1, 0] }] }
}

/**
 * The red-hot core: rings under the great-circle seams and a small inner ball. Hidden inside the ball at rest; as the ball
 * swells the rings rise through the seams (cracks of red light), and the blast pushes the inner ball out too.
 */
function core(): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  s.add(sphere([0, CY, 0], 0.37), { color: 0xffc0a8, mask: HOT })
  const tubes: TubeSpec[] = []
  const ring = (centre: Vec3, u: Vec3, v: Vec3, rad: number) => {
    const pts: Vec3[] = []
    const r: number[] = []
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2
      const c = Math.cos(a) * rad
      const d = Math.sin(a) * rad
      pts.push([centre[0] + u[0] * c + v[0] * d, centre[1] + u[1] * c + v[1] * d, centre[2] + u[2] * c + v[2] * d])
      r.push(0.012)
    }
    tubes.push({ pts, r, color: 0xffc0a8, mask: HOT, sides: 4, up: [1, 0, 0] })
  }
  const k = CORE / R
  for (const n of SEAM_NORMALS) ring([0, CY, 0], [1, 0, 0], [0, n[2], -n[1]], R * k)
  return { sculpt: s, tubes }
}

function lamps(): Sculpt {
  const s = new Sculpt()
  for (let i = 0; i < LAMPS; i++) {
    const a = lampAngle(i)
    s.add(sphere([0, CY + Math.sin(a) * (R - 0.012), Math.cos(a) * (R - 0.012)], 0.045), {
      color: WARN_C,
      mask: HOT,
      k: 0.004
    })
  }
  return s
}

/** Axle hubs, the hoop over the ball (a tube) and the crested lens pod on top. */
function yoke(): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  s.mirror((sx) => {
    s.add(cylinder([0.485 * sx, CY, 0], 0.15, 0.03, 0.012, [0, 0, Math.PI / 2]), { color: GRAPHITE })
    s.add(cylinder([0.53 * sx, CY, 0], 0.1, 0.035, 0.02, [0, 0, Math.PI / 2]), { color: PEARL, k: 0.012 })
    s.add(sphere([HOOP * sx, CY, 0], 0.055), { color: STEEL, k: 0.02 })
    s.paint(torus([0.505 * sx, CY, 0], 0.125, 0.01, [0, 0, Math.PI / 2]), { color: SEAM_C, mask: VEIN })
  })
  // Lens pod: a graphite capsule under a pearl helmet with a swept crest.
  const top = CY + HOOP
  s.add(capsule([0, top, -0.07], [0, top, 0.08], 0.085), { color: GRAPHITE })
  s.add(ellipsoid([0, top + 0.035, -0.01], [0.1, 0.07, 0.125]), { color: PEARL, k: 0.015 })
  s.add(ellipsoid([0, top + 0.1, -0.08], [0.018, 0.06, 0.11], [-0.5, 0, 0]), { color: PEARL, k: 0.02 })
  s.sub(sphere([LENS[0], LENS[1], LENS[2] + 0.01], 0.06), { color: BEZEL, k: 0.006 })
  s.paint(ellipsoid([0, top + 0.14, -0.1], [0.025, 0.03, 0.07], [-0.5, 0, 0]), { color: SEAM_C, mask: VEIN })
  const pts: Vec3[] = []
  const r: number[] = []
  for (let i = 0; i <= 18; i++) {
    const a = -Math.PI / 2 + (i / 18) * Math.PI
    pts.push([Math.sin(a) * HOOP, CY + Math.cos(a) * HOOP, 0])
    r.push(0.03)
  }
  return { sculpt: s, tubes: [{ pts, r, color: PEARL, sides: 7, ao: [0.9, 0.9] }] }
}

const BALL = 0
const CORE_P = 1
const LAMP = 2
const YOKE = 3
const EYE_P = 4

function pose(a: FoeAnim, out: THREE.Matrix4[]): void {
  const root = beginPose(a)
  const t = a.time + a.seed * 19
  const st = a.st
  const sp = clamp01(a.speed / DEF.speed)
  // Roll at a constant rate while moving (one hidden jump when it starts or stops).
  const roll = a.speed > ROLLING && a.state !== 'dying' ? a.time * ROLL_RATE + a.seed * TAU : hash(a.seed, 4) * TAU
  let y = a.speed > ROLLING ? Math.abs(Math.sin(t * 13)) * 0.012 : 0
  let lean = 0.22 * sp + Math.sin(t * 1.4) * 0.03
  let wob = Math.sin(t * 2.3) * (0.02 + 0.05 * sp)
  let swell = 1
  let sy = 1
  let crack = 0
  let lampOn = (a.time * 1.1 + a.seed) % 1 < 0.12
  let lit = true
  let yokeY = 0
  let yokeFold = 0
  let yokeSpin = 0
  switch (a.state) {
    case 'spawn': {
      yokeFold = 1 - smooth((st - 0.18) / 0.4)
      lit = st > 0.6 || (st > 0.48 && flicker(a, 20, 0.5))
      lampOn = st > 0.6 && st < 0.7
      const land = st - 0.6
      if (land > 0) {
        const b = Math.sin(Math.min(1, land / 0.2) * Math.PI)
        sy = 1 - 0.12 * b
        swell = 1 + 0.05 * b
      }
      break
    }
    case 'windup': {
      const w = windupT(a, WIND)
      // Blink 3 Hz → 18 Hz (integrated so the phase never jumps).
      const ph = 3 * st + ((18 - 3) * st * st) / (2 * WIND)
      lampOn = ph % 1 < 0.5
      crack = smooth(w / 0.85)
      swell = 1 + 0.07 * smooth(w) + shudder(a, 70) * 0.012 * w
      y += shudder(a, 53, 2) * 0.012 * w
      lean = 0.05 * Math.sin(st * 30) * w
      wob = shudder(a, 37, 5) * 0.06 * w
      yokeY = 0.04 * smooth(w / 0.5)
      lit = w < 0.6 || flicker(a, 26, 0.7)
      break
    }
    case 'attack':
    case 'dying': {
      // The blast (or a destroyed bomb): the core flares through, the yoke is thrown off.
      const u = clamp01(st / 0.12)
      crack = 1
      swell = 1.07 + 0.07 * u
      lampOn = st < 0.1
      lit = false
      yokeY = st * 2.2 - st * st * 5
      yokeSpin = st * 7 * (hash(a.seed, 8) < 0.5 ? 1 : -1)
      break
    }
    case 'recover':
      break
    case 'stagger': {
      const f = 1 - smooth((st - 0.3) / 0.4)
      y += shudder(a, 61) * 0.02 * f
      wob += shudder(a, 43, 3) * 0.2 * f
      lampOn = flicker(a, 22, 0.5 * f)
      lit = f < 0.2 || flicker(a, 18, 0.6)
      break
    }
    default:
      break
  }
  const flare = a.state === 'dying' || a.state === 'attack' ? 1 + 0.06 * clamp01(st / 0.1) : 1
  // Scaling is about the ball centre: lift it so the swollen / squashed ball still rests on the ground.
  const yb = y + (swell * sy - 1) * CY
  pivotMatrix(out[BALL], 0, CY, 0, 0, yb, 0, roll, 0, 0, swell, swell * sy, swell)
  const kc = swell * (1 + 0.12 * crack) * flare
  pivotMatrix(out[CORE_P], 0, CY, 0, 0, yb, 0, roll, 0, 0, kc, kc * sy, kc)
  const kl = lampOn ? swell : swell * 0.8
  pivotMatrix(out[LAMP], 0, CY, 0, 0, yb, 0, roll, 0, 0, kl, kl * sy, kl)
  const yk = pivotMatrix(
    out[YOKE],
    0,
    CY,
    0,
    0,
    yb + yokeY,
    0,
    lean - 1.45 * yokeFold + yokeSpin,
    0,
    wob + yokeSpin * 0.4
  )
  if (lit) out[EYE_P].copy(yk)
  else chain(pivotMatrix(out[EYE_P], 0, 0, 0, 0, 0, -0.06, 0, 0, 0), yk)
  endPose(out, 5, root)
}

export function korogashi(): FoeRecipe {
  return {
    parts: [
      { name: 'ball', ...ball(), cell: 0.02, tris: 0 },
      { name: 'core', ...core(), cell: 0.035, tris: 100 },
      { name: 'lamps', sculpt: lamps(), cell: 0.01, tris: 260 },
      { name: 'yoke', ...yoke(), cell: 0.012, tris: 600 },
      { name: 'eye', sculpt: lensSculpt(LENS, 0.05), cell: 0.006, tris: 60 }
    ],
    pose
  }
}
