/**
 * 黒ハム王 (`king`), 「星を喰らう者」: the final boss. A huge dark-purple hamster in a crimson high-collar cape, a gold
 * spiked crown with a dark star gem, glowing yellow eyes under heavy brows, a scar and two fangs.
 *
 * He is built exactly like ハム彦 (`drawHero`), only bigger and meaner: head and body are one egg with no neck, the
 * lower face is a lilac patch that hugs the front of the egg, a full cheek bulges a little past the outline, a tiny
 * nose sits high on that patch with the "ω" mouth right under it, two whiskers, and round ears set wide apart.
 * There is no snout: menace comes from size, brows, eyes, crown and cape.
 *
 * Everything attached to the body is placed through one rig (`rig()`): body coordinates on the egg are squashed,
 * sheared forward by `lean` and turned by `turn` about a pivot on the ground, then sampled analytically, so a
 * toppling or lying king is drawn as a pose with clean rims instead of a rotated raster.
 *
 * One pose-parametric draw function; every clip is a list of poses (see bossSpec('king') in contract.ts).
 */
import type { SheetModule } from '../module'
import { C, R, ramp } from '../palette'
import {
  Painter,
  Raster,
  ball,
  bar,
  farRamp,
  outline,
  outlineWith,
  rng,
  shadeEdges,
  shadeIndex,
  type Pt
} from '../raster'
import { anim } from '../sheet'

const S = 128
/** Screen x of the body's centre line and the ground row the feet stand on (anchor row 120 is just below). */
const OX = 62
const GY = 119
/** The egg: half height, half width at the top and at the bottom (body coordinates, px). */
const RY = 37
const RX0 = 29
const RX1 = 37

const FUR = R.kingPurple
const FUR_FAR = farRamp(FUR)
const BELLY = R.kingBelly
const BELLY_FAR = farRamp(BELLY)
const CAPE = R.crimson
/** The inside of the cape: wine, sharing its shade and line with the crimson so the sheet stays in budget. */
const LINING = ramp('#a8406e', '#7a2450', '#6a1a3a', '#3a1a22', '#3a1a22')
const GOLD = R.gold
const DARK = R.dark
const DUST = R.dust
const EAR = R.hamEar
const GLOW = R.fire

export type KingEyes = 'glow' | 'wide' | 'rage' | 'slit' | 'hurt' | 'swirl' | 'half' | 'flash'
export type KingMouth = 'grim' | 'roar' | 'grit' | 'pant'

/** The cape hanging from the back of the neck strap. */
export interface CapePose {
  /** Degrees from hanging straight down; positive streams to the back (left), 90 = horizontal, 150 = up. */
  swing: number
  len: number
  /** Width at the shoulders and at the hem. */
  w0: number
  w1: number
  /** How far the back edge bellies out (px). */
  billow: number
  /** Hem scallop depth (px) and the phase of the folds (they slide with it). */
  wave: number
  phase: number
  /** 0..1: how much of the inside (lining) shows at the back edge and hem. */
  lining: number
}

export const capePose = (c: Partial<CapePose> = {}): CapePose => ({
  swing: 14,
  len: 40,
  w0: 20,
  w1: 40,
  billow: 4,
  wave: 2,
  phase: 0,
  lining: 0.25,
  ...c
})

export interface CrownPose {
  /** Offset from its seat on the head (px) and extra tilt (radians, clockwise). */
  dx: number
  dy: number
  rot: number
  /** 0 none, 1 gem glint, 2 gem sparkle. */
  glint: number
}

/** A hand target relative to its shoulder (body-turned px). */
type Hand = readonly [number, number]

export interface KingPose {
  dx: number
  bob: number
  /** Positive squashes (wider, shorter), negative stretches. */
  squash: number
  /** The top of the egg leans forward (+) or back (-) by this many px; the feet stay. */
  lean: number
  /** The whole body turns about `pivot` (a ground point, body px from the centre line); negative falls backwards. */
  turn: number
  pivot: number
  /** The face slides over the egg (body px): forward/back and up/down. */
  faceDx: number
  faceDy: number
  /** Ears tilt back (+) and lift (+). */
  earTilt: number
  earLift: number
  nearFoot: readonly [number, number]
  farFoot: readonly [number, number]
  nearArm: Hand
  farArm: Hand
  fist: boolean
  eyes: KingEyes
  mouth: KingMouth
  /** Brow steepness: positive is angrier. */
  brow: number
  cape: CapePose | null
  collar: boolean
  crown: CrownPose | null
  /** Dark flames behind him: strength 0..1 and phase (the flames climb as it grows). */
  flame: number
  flamePhase: number
  fxBack?: (r: Raster, rg: Rig) => void
  fxFront?: (r: Raster, rg: Rig) => void
}

/** The whole face sits this far below its drawn coordinates (keeps the brows clear of the crown). */
const FACE_V = 3.5

const SEAT: CrownPose = { dx: 0, dy: 0, rot: 0, glint: 0 }

export const kingPose = (p: Partial<KingPose> = {}): KingPose => ({
  dx: 0,
  bob: 0,
  squash: 0,
  lean: 0,
  turn: 0,
  pivot: 0,
  faceDx: 0,
  faceDy: 0,
  earTilt: 0,
  earLift: 0,
  nearFoot: [0, 0],
  farFoot: [0, 0],
  nearArm: [6, 9],
  farArm: [7, 9],
  fist: false,
  eyes: 'glow',
  mouth: 'grim',
  brow: 2,
  cape: capePose(),
  collar: true,
  crown: SEAT,
  flame: 0,
  flamePhase: 0,
  ...p
})

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const TAU = Math.PI * 2

// ------------------------------------------------------------------------------------------------------ the rig

export interface Rig {
  /** Body coordinates (relative to the egg centre, before squash) → screen. */
  E: (bu: number, bv: number) => Pt
  /** Ground-relative coordinates (u from the centre line, v up negative from the ground) → screen. */
  L: (u: number, v: number) => Pt
  /** Screen → body coordinates. */
  toBody: (x: number, y: number) => Pt
  /** A direction in body space turned onto the screen. */
  dir: (u: number, v: number) => Pt
  turn: number
  kx: number
  ky: number
}

function rig(p: KingPose): Rig {
  const kx = 1 + p.squash * 0.045
  const ky = 1 - p.squash * 0.04
  const ry = RY * ky
  const ecv = -4 - ry - p.bob
  const c = Math.cos(p.turn)
  const s = Math.sin(p.turn)
  const pu = p.pivot
  const shear = (v: number) => p.lean * clamp((-v - 4 - p.bob) / (2 * ry), 0, 1)
  const L = (u: number, v: number): Pt => {
    const du = u + shear(v) - pu
    return [OX + p.dx + pu + du * c - v * s, GY + du * s + v * c]
  }
  return {
    L,
    E: (bu, bv) => L(bu * kx, ecv + bv * ky),
    toBody: (x, y) => {
      const X = x - OX - p.dx - pu
      const Y = y - GY
      const du = X * c + Y * s
      const v = -X * s + Y * c
      const u = du + pu - shear(v)
      return [u / kx, (v - ecv) / ky]
    },
    dir: (u, v) => [u * c - v * s, u * s + v * c],
    turn: p.turn,
    kx,
    ky
  }
}

/**
 * The rig the face is painted with. Up to a moderate tilt it is the body rig; once he is falling flat the face
 * turns toward the viewer (stays upright around the turned face centre) so the eyes never stack.
 */
function faceRig(rg: Rig, p: KingPose): Rig {
  if (Math.abs(p.turn) <= 0.7) return rg
  const up = rig({ ...p, turn: 0, lean: 0 })
  const fc: Pt = [12 + p.faceDx, -16 + p.faceDy]
  const a = rg.E(fc[0], fc[1])
  const b = up.E(fc[0], fc[1])
  const ox = a[0] - b[0]
  const oy = a[1] - b[1]
  return {
    ...up,
    E: (u, v) => {
      const [x, y] = up.E(u, v)
      return [x + ox, y + oy]
    },
    L: (u, v) => {
      const [x, y] = up.L(u, v)
      return [x + ox, y + oy]
    },
    toBody: (x, y) => up.toBody(x - ox, y - oy)
  }
}

const rxAt = (bv: number) => RX0 + (RX1 - RX0) * Math.pow(clamp((bv + RY) / (2 * RY), 0, 1), 0.7)

/** Calls `f` for every frame pixel with its body coordinates; a returned colour is set (or painted onto). */
function fillBody(l: Raster, rg: Rig, f: (bu: number, bv: number) => number, onto = false) {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const [bu, bv] = rg.toBody(x + 0.5, y + 0.5)
      const c = f(bu, bv)
      if (!c) continue
      if (onto) l.paint(x, y, c)
      else l.set(x, y, c)
    }
}

/** Sphere shading of a body-space normal, lit from the screen's top-left whatever the turn. */
function shadeBody(rg: Rig, nu: number, nv: number, rmp: readonly number[], spec = true) {
  const nz = Math.sqrt(Math.max(0, 1 - nu * nu - nv * nv))
  const [nx, ny] = rg.dir(nu, nv)
  return rmp[shadeIndex(nx, ny, nz, spec)]
}

/** A body-space ellipse (patch, cheek, socket); `shade` gives it a sphere shading, otherwise flat colour `c`. */
function bodyEllipse(
  l: Raster,
  rg: Rig,
  cu: number,
  cv: number,
  ru: number,
  rv: number,
  c: number | readonly number[],
  onto = false,
  spec = false
) {
  fillBody(
    l,
    rg,
    (bu, bv) => {
      const nu = (bu - cu) / ru
      const nv = (bv - cv) / rv
      if (nu * nu + nv * nv > 1.0001) return 0
      return typeof c === 'number' ? c : shadeBody(rg, nu * 0.95, nv * 0.95, c, spec)
    },
    onto
  )
}

const round = ([x, y]: Pt): Pt => [Math.round(x), Math.round(y)]

// ------------------------------------------------------------------------------------------------------ face

const EYE_NEAR = ['ab........', 'abbbb.....', 'abbbKbbb..', 'bbbbKbbbbb', 'bbbbKbbbbc', '.cbbKbbbc.', '..cccccc..']
const EYE_FAR = ['.......b', '....abbb', '..abKbbb', 'abbbKbbb', 'bbbbKbbc', '.cbbKbc.', '..cccc..']
const lid = (rows: readonly string[], n: number) => rows.map((r, i) => (i < n ? r.replace(/./g, '.') : r))

const EYE_SHAPES: Record<KingEyes, readonly [readonly string[], readonly string[]]> = {
  glow: [EYE_NEAR, EYE_FAR],
  rage: [EYE_NEAR, EYE_FAR],
  flash: [EYE_NEAR, EYE_FAR],
  wide: [
    ['..abbb....', '.abbbbbb..', 'abbbKbbbb.', 'abbbKbbbbb', 'bbbbKbbbbc', 'bbbbbbbbbc', '.cbbbbbcc.', '..cccccc..'],
    ['...abbb.', '.abbbbbb', 'abbbKbbb', 'abbbKbbb', 'bbbbKbbc', 'bbbbbbbc', '.cbbbbc.', '..cccc..']
  ],
  half: [lid(EYE_NEAR, 3), lid(EYE_FAR, 3)],
  slit: [lid(EYE_NEAR, 4), lid(EYE_FAR, 4)],
  hurt: [
    ['K.........', '.KKK......', '...KKKK...', '......KKK.', '...KKKK...', '.KKK......', 'K.........'],
    ['.......K', '.....KK.', '..KKK...', 'KK......', '..KKK...', '.....KK.', '.......K']
  ],
  swirl: [
    ['..KKKKK...', '.KwwwwwK..', 'KwKKKKwK..', 'KwKwwKwK..', 'KwKKwwwK..', 'KwwwwwKK..', '.KKKKK....'],
    ['.KKKKK.', 'KwwwwwK', 'KwKKKwK', 'KwKwKwK', 'KwKKwwK', 'KwwwwwK', '.KKKKK.']
  ]
}

const SOCKETLESS: KingEyes[] = ['hurt', 'swirl']

function eyeKey(kind: KingEyes) {
  const [a, b, c] =
    kind === 'rage'
      ? [CAPE[0], CAPE[1], CAPE[2]]
      : kind === 'flash'
        ? [C.white, C.white, GLOW[0]]
        : [C.glow, GLOW[1], GLOW[2]]
  return { a, b, c, K: C.black, w: C.white }
}

/** The mouth hangs from the philtrum under the nose; open mouths open downward inside the lilac patch. */
const MOUTHS: Record<KingMouth, readonly string[]> = {
  grim: ['.....K.....', '.....K.....', '..KKK.KKK..', '.K.w...w.K.', 'K..w...w..K'],
  grit: ['.....K.....', '.KKKK.KKKK.', 'KwKwKwKwKwK', 'KwKwKwKwKwK', '.KKKKKKKKK.'],
  pant: ['....K....', '.KKK.KKK.', 'KwmmmmmwK', 'KwmmmmmwK', 'KmmmmmmmK', '.KmtttmK.', '..KKKKK..'],
  roar: [
    '......K......',
    '.KKKKK.KKKKK.',
    'KwwmmmmmmmwwK',
    'KwwmmmmmmmwwK',
    'K.wmmmmmmmw.K',
    'KmmmmmmmmmmmK',
    '.KmmmmmmmmmK.',
    '.KmmtttttmmK.',
    '..KmtttttmK..',
    '...KKKKKKK...'
  ]
}

function face(l: Raster, body: Rig, p: KingPose) {
  const rg = faceRig(body, p)
  const fu = p.faceDx
  const fv = p.faceDy + FACE_V
  const F = (u: number, v: number) => round(rg.E(u + fu, v + fv))
  // eye sockets make the glow pop on the dark fur
  if (!SOCKETLESS.includes(p.eyes)) {
    bodyEllipse(l, rg, 6.4 + fu, -27 + fv, 6.6, 5, FUR[3], true)
    bodyEllipse(l, rg, 18.6 + fu, -26.4 + fv, 5.6, 5, FUR[3], true)
  }
  // the scar, under the eye so the glow stays whole
  const s0 = rg.E(5 + fu, -38 + fv)
  const s1 = rg.E(9.5 + fu, -17 + fv)
  l.line(s0[0], s0[1], s1[0], s1[1], BELLY[0])
  l.line(s0[0] + 1, s0[1], s1[0] + 1, s1[1], BELLY[2])
  for (const t of [0.2, 0.75]) {
    const x = Math.round(lerp(s0[0], s1[0], t))
    const y = Math.round(lerp(s0[1], s1[1], t))
    l.rect(x - 2, y, 6, 1, BELLY[2])
  }
  const key = eyeKey(p.eyes)
  const [near, far] = EYE_SHAPES[p.eyes]
  const ne = F(1.5, -30.5)
  const fe = F(14.5, -29.5)
  const dy = p.eyes === 'wide' ? -1 : 0
  l.stamp(near, ne[0], ne[1] + dy, key)
  l.stamp(far, fe[0], fe[1] + dy, key)
  // heavy brows: inner ends down
  const st = p.brow
  const lift = p.eyes === 'wide' || p.eyes === 'flash' ? 1.5 : 0
  if (p.eyes === 'hurt' || p.eyes === 'swirl') {
    bar(l, F(0, -34), F(12, -37), 3, FUR[4])
    bar(l, F(14, -36), F(24, -33), 3, FUR[4])
  } else {
    bar(l, F(-1, -32 - st - lift), F(12.5, -30 + st * 0.3 - lift), 4, FUR[4])
    bar(l, F(13.5, -30 + st * 0.3 - lift), F(24, -31.5 - st - lift), 4, FUR[4])
    // a lit ridge over each brow
    const a = F(0, -34.5 - st - lift)
    const b = F(10, -32.2 + st * 0.2 - lift)
    l.line(a[0], a[1], b[0], b[1], FUR[0])
  }
  // tiny dark nose high on the patch, one highlight
  const n = F(18.5, -16)
  l.stamp(['.KKK.', 'KwKKK', '.KKK.'], n[0], n[1], { K: FUR[4], w: BELLY[0] })
  // mouth right under it
  const rows = MOUTHS[p.mouth]
  l.stamp(rows, n[0] + 2 - Math.floor(rows[0].length / 2), n[1] + 3, {
    K: FUR[4],
    m: C.mouth,
    t: C.tongue,
    w: C.white
  })
  // whiskers off the cheek
  const w0 = F(31, -11)
  const w1 = F(39, -14)
  const w2 = F(31, -6)
  const w3 = F(39, -4)
  l.line(w0[0], w0[1], w1[0], w1[1], BELLY[2])
  l.line(w2[0], w2[1], w3[0], w3[1], BELLY[2])
}

// ------------------------------------------------------------------------------------------------------ parts

function ear(l: Raster, rg: Rig, cu: number, cv: number, r: number, far: boolean) {
  const rim = far ? FUR_FAR : FUR
  fillBody(l, rg, (bu, bv) => {
    const nu = (bu - cu) / r
    const nv = (bv - cv) / r
    const q = nu * nu + nv * nv
    if (q > 1.0001) return 0
    // the bowl: inner ear, deeper toward the lower right
    const iu = (bu - cu - 0.6) / (r - 3.2)
    const iv = (bv - cv + 0.2) / (r - 3.2)
    if (iu * iu + iv * iv <= 1) {
      const du = (bu - cu - 1.8) / (r - 5.2)
      const dv = (bv - cv - 1.2) / (r - 5.2)
      return du * du + dv * dv <= 1 ? EAR[far ? 3 : 2] : EAR[far ? 2 : 1]
    }
    return shadeBody(rg, nu * 0.9, nv * 0.9, rim, !far)
  })
}

/** The gold crown, sampled analytically so it can tilt with clean edges. (bx, by) = middle of the band's bottom. */
function crown(l: Raster, bx: number, by: number, rot: number, glint: number) {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  const HW = 17
  const top = (u: number) => -11 + 2.5 * (u / HW) ** 2
  const bot = (u: number) => 2.5 * (u / HW) ** 2
  const spikes: [number, number][] = [
    [-13, 8],
    [-6.5, 11],
    [0, 15],
    [6.5, 11],
    [13, 8]
  ]
  for (let y = Math.floor(by - 40); y <= by + 40; y++)
    for (let x = Math.floor(bx - 40); x <= bx + 40; x++) {
      const dx = x + 0.5 - bx
      const dy = y + 0.5 - by
      const u = dx * c + dy * s
      const v = -dx * s + dy * c
      let col = 0
      if (Math.abs(u) <= HW && v >= top(u) && v <= bot(u)) {
        const nu = u / (HW + 1)
        let i = shadeIndex(nu, -0.25, Math.sqrt(1 - nu * nu))
        if (v < top(u) + 1.4) i = Math.min(i, nu < 0.4 ? 0 : 1) as 0 | 1 | 2 | 3
        else if (v > bot(u) - 2) i = Math.max(i, 2) as 0 | 1 | 2 | 3
        col = GOLD[i]
      }
      if (!col)
        for (const [su, h] of spikes) {
          const base = top(su) + 1
          const tip = base - h
          if (v < tip || v > base) continue
          const hw = 4.8 * Math.pow((v - tip) / h, 0.85)
          const d = u - su
          if (Math.abs(d) > hw + 0.15) continue
          const farSide = su > 8 ? 1 : 0
          col = GOLD[Math.min(3, (d < -hw * 0.25 ? 0 : d < hw * 0.4 ? 1 : 2) + farSide)]
          break
        }
      if (col) l.set(x, y, col)
    }
  // the dark star gem on the front of the band
  const gx = Math.round(bx + -5.5 * -s - 3)
  const gy = Math.round(by + -5.5 * c - 3)
  l.stamp(['...a...', '..aab..', 'abbbbcc', '.bbbbc.', '..bcc..', '.bc.cc.'], gx, gy, {
    a: FUR[0],
    b: DARK[2],
    c: FUR[3]
  })
  if (glint >= 1) l.set(gx + 2, gy + 2, C.white)
  return { gx: gx + 3, gy: gy + 2 }
}

function crownPart(out: Raster, bx: number, by: number, rot: number, glint: number) {
  const l = new Raster(S, S)
  const g = crown(l, bx, by, rot, glint)
  outline(l)
  out.blit(l)
  if (glint >= 2) sparkStar(out, g.gx, g.gy, 5, C.white, GLOW[0])
}

/** A short, thick arm ending in a chunky paw with three toe nubs. */
function arm(l: Raster, a: Pt, b: Pt, fur: typeof FUR, paw: typeof BELLY, fist: boolean) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const ux = (b[0] - a[0]) / len
  const uy = (b[1] - a[1]) / len
  l.ellipse(a[0], a[1], 7.5, 7.5, fur[1])
  bar(l, a, b, 11, fur[1])
  shadeEdges(l, fur, 2, true)
  const px = -uy
  const py = ux
  const reach = fist ? 4.4 : 6
  ball(l, b[0] + ux, b[1] + uy, 7.4, 7, paw, false)
  for (const k of [-1, 0, 1])
    ball(l, b[0] + ux * reach + px * k * 3.8, b[1] + uy * reach + py * k * 3.8, 2.9, 2.9, paw, false)
  for (const k of [-0.5, 0.5]) {
    l.set(b[0] + ux * (reach + 1.8) + px * k * 3.8, b[1] + uy * (reach + 1.8) + py * k * 3.8, paw[3])
    l.set(b[0] + ux * (reach + 0.8) + px * k * 3.8, b[1] + uy * (reach + 0.8) + py * k * 3.8, paw[3])
  }
}

function foot(l: Raster, at: Pt, fur: typeof FUR, rot: number) {
  const [x, y] = at
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  for (let j = -12; j <= 12; j++)
    for (let i = -12; i <= 12; i++) {
      const u = (i + 0.5) * c + (j + 0.5) * s
      const v = -(i + 0.5) * s + (j + 0.5) * c
      if ((u / 10.5) ** 2 + (v / 4.8) ** 2 <= 1) l.set(Math.floor(x) + i, Math.floor(y) + j, fur[1])
    }
  shadeEdges(l, fur, 1, true)
  for (const o of [5, 8]) {
    l.set(x + o * c - 1 * s, y + o * s + 1 * c, fur[3])
    l.set(x + o * c - 2 * s, y + o * s + 2 * c, fur[3])
  }
}

// ------------------------------------------------------------------------------------------------------ cape

function drawCape(l: Raster, root: Pt, cp: CapePose, turn: number, ground: number) {
  const a = (cp.swing * Math.PI) / 180 - turn
  const d: Pt = [-Math.sin(a), Math.cos(a)]
  const n: Pt = [Math.cos(a), Math.sin(a)]
  const at = (s: number, t: number): Pt => {
    const half = lerp(cp.w0, cp.w1, s) / 2
    const out = t < 0 ? cp.billow * Math.sin(Math.PI * s) : 0
    return [
      root[0] + d[0] * cp.len * s + n[0] * (t * half - out),
      root[1] + d[1] * cp.len * s + n[1] * (t * half - out)
    ]
  }
  const pts: number[] = []
  const folds = 2
  for (let k = 0; k <= 8; k++) pts.push(...at(1 - k / 8, 1))
  for (let k = 0; k <= 8; k++) pts.push(...at(k / 8, -1))
  for (let k = 0; k <= 16; k++) {
    const t = -1 + (2 * k) / 16
    const [x, y] = at(1, t)
    const off = cp.wave * Math.max(0, Math.cos(((t + 1) / 2) * folds * TAU + cp.phase))
    pts.push(x + d[0] * off, y + d[1] * off)
  }
  l.poly(pts, CAPE[1])
  // folds that follow the drape, a lit back rim, lining where the inside turns out
  const src = l.clone()
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (src.get(x, y) !== CAPE[1]) continue
      if (y > ground) {
        l.set(x, y, 0)
        continue
      }
      const px = x + 0.5 - root[0]
      const py = y + 0.5 - root[1]
      const s = clamp((px * d[0] + py * d[1]) / cp.len, 0, 1.2)
      const half = lerp(cp.w0, cp.w1, Math.min(1, s)) / 2 + cp.billow * Math.sin(Math.PI * Math.min(1, s)) * 0.5
      const t = (px * n[0] + py * n[1]) / half
      const f = ((t + 1) / 2) * folds + cp.phase / TAU + 0.18 * Math.sin(cp.phase + s * 3) * s
      const q = f - Math.floor(f)
      let c = q < 0.08 ? CAPE[3] : q < 0.22 ? CAPE[0] : q < 0.7 ? CAPE[1] : CAPE[2]
      if (s < 0.14) c = q < 0.5 ? CAPE[1] : CAPE[2]
      if (t > 0.72) c = c === CAPE[0] ? CAPE[1] : CAPE[2]
      if (cp.lining > 0 && t < -1 + cp.lining * 0.9 && s > 0.35) c = q < 0.5 ? LINING[1] : LINING[2]
      if (cp.lining > 0 && s > 1 - cp.lining * 0.18 && t < 0.2) c = LINING[2]
      l.set(x, y, c)
    }
}

/** The stiff high collar standing behind the head: crimson rim, wine lining facing the head. */
function collar(l: Raster, rg: Rig, flare: number) {
  const P = (u: number, v: number) => rg.E(u - flare * 0.3 * (-v / 40), v - flare * 0.15 * (-v / 40))
  const rim = [P(-4, 8), P(-27, 10), P(-43, -10), P(-53, -46), P(-37, -41), P(-25, -28), P(-10, -12)]
  l.poly(rim.flat(), CAPE[1])
  const inner = [P(-6, 6), P(-25, 5), P(-37, -11), P(-45, -38), P(-34, -36), P(-23, -25), P(-10, -10)]
  l.poly(inner.flat(), LINING[1])
  shadeEdges(l, CAPE, 1, true)
  // a fold crease down the lining
  const a = P(-40, -32)
  const b = P(-27, 0)
  l.line(a[0], a[1], b[0], b[1], LINING[2])
}

// ------------------------------------------------------------------------------------------------- effects

/** Dark flames: tongues rise from behind the body, taper, curl and climb as the phase grows; wisps and embers. */
function flames(l: Raster, rg: Rig, level: number, phase: number) {
  const N = 11
  const [cx, cy] = rg.E(0, 0)
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1)
    // bases on an arc round the back of the body, from the left flank over the crown to the right flank
    const a = Math.PI * (0.96 + k * 1.08)
    const bx = cx + Math.cos(a) * 36 + 2
    const by = cy + Math.sin(a) * 36 + 6
    const out = Math.cos(a)
    const h = (30 + 16 * (((i * 7) % 5) / 4)) * level * (0.8 + 0.2 * Math.sin(phase * 1.7 + i * 1.9))
    const w = 6.5 + (i % 3) * 1.2
    const d: Pt = [out * 0.55, -1]
    const dl = Math.hypot(d[0], d[1])
    const ux = d[0] / dl
    const uy = d[1] / dl
    const steps = 10
    const centre = (t: number): Pt => {
      const wob = Math.sin(t * 3.4 - phase * 1.9 + i * 1.3) * t * 5
      const curl = (out < 0 ? -1 : 1) * t * t * 7
      return [bx + ux * h * t - uy * wob + curl, by + uy * h * t + ux * wob]
    }
    const left: number[] = []
    const right: number[] = []
    const core: number[] = []
    const coreR: number[] = []
    for (let j = 0; j <= steps; j++) {
      const t = j / steps
      const [x, y] = centre(t)
      const hw = w * Math.pow(1 - t, 0.8) + 0.3
      left.push(x - hw, y)
      right.unshift(x + hw, y)
      if (t <= 0.62) {
        core.push(x - hw * 0.5, y + 1)
        coreR.unshift(x + hw * 0.5, y + 1)
      }
    }
    l.poly([...left, ...right], DARK[2])
    l.poly([...core, ...coreR], DARK[1])
    l.ellipse(bx, by + 2, w + 1, w, DARK[2])
  }
  // detached wisps drifting up
  for (let j = 0; j < 5; j++) {
    const k = (j * 0.21 + 0.1) % 1
    const rise = (phase * 9 + j * 13) % 30
    const x = cx - 50 + k * 100 + Math.sin(phase + j) * 3
    const y = cy - 52 - rise + Math.abs(k - 0.5) * 50
    const r = 3.2 - rise / 14
    if (r > 1) {
      l.ellipse(x, y, r, r * 1.4, DARK[2])
      l.ellipse(x, y + 0.5, r * 0.5, r * 0.7, DARK[1])
    }
  }
}

function embers(r: Raster, rg: Rig, level: number, phase: number) {
  if (level < 0.4) return
  const [cx, cy] = rg.E(0, 0)
  const rnd = rng(77)
  for (let i = 0; i < 6; i++) {
    const x = cx - 44 + rnd() * 88
    const y = cy - 20 - ((rnd() * 50 + phase * 7) % 52)
    r.rect(Math.round(x), Math.round(y), 2, 2, i % 2 ? DARK[0] : C.glow)
  }
}

function fxPart(out: Raster, draw: (l: Raster) => void, line = true) {
  const l = new Raster(out.w, out.h)
  draw(l)
  if (line) outline(l)
  out.blit(l)
}

function bolt(l: Raster, x0: number, y0: number, x1: number, y1: number, seed: number) {
  const rnd = rng(seed)
  const pts: Pt[] = [[x0, y0]]
  for (let i = 1; i <= 5; i++) {
    const t = i / 5
    pts.push([lerp(x0, x1, t) + (i < 5 ? (rnd() - 0.5) * 9 : 0), lerp(y0, y1, t) + (i < 5 ? (rnd() - 0.5) * 9 : 0)])
  }
  for (let i = 1; i < pts.length; i++) l.thick(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 3, DARK[2])
  for (let i = 1; i < pts.length; i++) l.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], DARK[0])
}

function orb(out: Raster, x: number, y: number, r: number, crackle = true) {
  fxPart(out, (l) => {
    ball(l, x, y, r, r, DARK)
    l.ellipse(x, y, r * 0.55, r * 0.55, DARK[2])
    ball(l, x - r * 0.1, y - r * 0.1, r * 0.4, r * 0.4, DARK, true)
    l.rect(Math.round(x - r * 0.5), Math.round(y - r * 0.6), 2, 2, C.white)
  })
  if (crackle) {
    const rnd = rng(Math.round(x * 7 + y * 13 + r))
    for (let i = 0; i < 4; i++) {
      const a = rnd() * TAU
      out.rect(Math.round(x + Math.cos(a) * (r + 3)), Math.round(y + Math.sin(a) * (r + 3)), 2, 2, DARK[0])
    }
  }
}

function sparkStar(out: Raster, x: number, y: number, r: number, c0: number = C.white, c1: number = GLOW[1]) {
  for (let i = -r; i <= r; i++) {
    out.set(x + i, y, Math.abs(i) <= 1 ? c0 : c1)
    out.set(x, y + i, Math.abs(i) <= 1 ? c0 : c1)
  }
  for (const [dx, dy] of [
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1]
  ])
    out.set(x + dx, y + dy, c1)
  out.set(x, y, c0)
}

function puff(out: Raster, x: number, y: number, r: number) {
  fxPart(
    out,
    (l) => {
      l.ellipse(x, y, r * 1.15, r * 0.8, DUST[1])
      l.ellipse(x - r * 0.35, y - r * 0.3, r * 0.55, r * 0.35, DUST[0])
      outlineWith(l, DUST[3])
    },
    false
  )
}

function sweat(out: Raster, x: number, y: number) {
  out.stamp(['.b.', 'bwb', 'bbb', 'bbb', '.b.'], x, y, { w: C.white, b: R.water[1] })
}

// ------------------------------------------------------------------------------------------------------ the king

export function drawKing(p: KingPose): Raster {
  const rg = rig(p)
  const out = new Raster(S, S)
  const g = new Painter(S, S)
  const ground = GY - 1

  if (p.flame > 0) g.add(-5.5, (l) => flames(l, rg, p.flame, p.flamePhase))
  if (p.cape) {
    const cp = p.cape
    g.add(-6, (l) => drawCape(l, rg.E(-19, 5), cp, rg.turn, p.turn ? S : ground))
  }
  if (p.collar) g.add(-5, (l) => collar(l, rg, p.flame))
  // ears behind the egg, set wide; the far one shows past the crown
  g.add(-4, (l) => ear(l, rg, 19 + p.earTilt * -0.6, -35 - p.earLift, 10.5, true))
  g.add(-4, (l) => ear(l, rg, -21 - p.earTilt, -33 - p.earLift, 12.5, false))
  // far foot and far arm behind the body
  const footRot = p.turn
  g.add(-3.5, (l) => foot(l, rg.L(14 + p.farFoot[0], -4.8 - p.farFoot[1]), FUR_FAR, footRot))
  const farSh = rg.E(FAR_SHOULDER[0], FAR_SHOULDER[1])
  const fh = rg.dir(p.farArm[0], p.farArm[1])
  g.add(-3, (l) => arm(l, farSh, [farSh[0] + fh[0], farSh[1] + fh[1]], FUR_FAR, BELLY_FAR, p.fist))
  // the egg: head and body in one, with the lilac lower face, strap and belly painted onto it
  g.add(0, (l) => {
    fillBody(l, rg, (bu, bv) => {
      const rx = rxAt(bv)
      const nu = bu / rx
      const nv = bv / RY
      if (nu * nu + nv * nv > 1.0001) return 0
      return shadeBody(rg, nu, nv, FUR)
    })
    const fu = p.faceDx
    const fv = p.faceDy + FACE_V
    const fr = faceRig(rg, p)
    // belly
    bodyEllipse(l, rg, 11, 25, 21, 15, BELLY[1], true)
    bodyEllipse(l, rg, 15, 33, 17, 7, BELLY[2], true)
    bodyEllipse(l, rg, 6, 17, 10, 3.5, BELLY[0], true)
    // lower face patch hugging the front of the egg
    bodyEllipse(l, fr, 17 + fu, -7 + fv, 17, 10.5, BELLY[1], true)
    bodyEllipse(l, fr, 13 + fu, -13 + fv, 9, 3.2, BELLY[0], true)
    bodyEllipse(l, fr, 18 + fu, 1.5 + fv, 13, 3, BELLY[2], true)
    // the cape's neck strap, following the curve of the egg
    fillBody(
      l,
      rg,
      (bu, bv) => {
        const t = (bu + rxAt(bv)) / (2 * rxAt(bv))
        const mid = 9 + Math.sin(t * Math.PI) * 3
        const d = bv - mid
        return d < -1.6 || d > 1.6 ? 0 : d < -0.8 ? CAPE[0] : d < 0.8 ? CAPE[1] : CAPE[2]
      },
      true
    )
    // the full cheek, bulging a little past the outline
    bodyEllipse(l, fr, 25 + fu, -6 + fv, 8.2, 7.4, BELLY, false, false)
  })
  g.add(1, (l) => face(l, rg, p), false)
  // gold clasp at the throat
  g.add(1.2, (l) => {
    const [x, y] = rg.E(18 + p.faceDx * 0.3, 12)
    ball(l, x, y, 4.6, 4.4, GOLD)
    l.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, FUR[3])
    l.set(Math.round(x) - 1, Math.round(y) - 1, FUR[0])
  })
  g.add(2, (l) => foot(l, rg.L(-5 + p.nearFoot[0], -4.8 - p.nearFoot[1]), FUR, footRot))
  const nearSh = rg.E(NEAR_SHOULDER[0], NEAR_SHOULDER[1])
  const nh = rg.dir(p.nearArm[0], p.nearArm[1])
  g.add(3, (l) => arm(l, nearSh, [nearSh[0] + nh[0], nearSh[1] + nh[1]], FUR, BELLY, p.fist))
  out.blit(g.render())

  if (p.crown) {
    const seat = rg.E(1 + p.faceDx * 0.25 + p.crown.dx, -38 + p.crown.dy)
    const tilt = p.turn + p.crown.rot + p.lean * 0.012
    crownPart(out, seat[0], seat[1], tilt, p.crown.glint)
  }
  if (p.flame > 0) embers(out, rg, p.flame, p.flamePhase)
  p.fxBack?.(out, rg)
  p.fxFront?.(out, rg)
  return out
}

/** Clears anything within `m` px of the frame edge (effects may wander). */
function trim(r: Raster, m = 1) {
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) if (x < m || y < m || x >= r.w - m || y >= r.h - m) r.data[y * r.w + x] = 0
  return r
}

const draw = (p: Partial<KingPose>) => trim(drawKing(kingPose(p)))

/** Where a hand ends up (for effects held in it). */
const handAt = (rg: Rig, sh: Pt, h: Hand): Pt => {
  const [x, y] = rg.E(sh[0], sh[1])
  const d = rg.dir(h[0], h[1])
  return [x + d[0], y + d[1]]
}
const NEAR_SHOULDER: Pt = [7, 13]
const FAR_SHOULDER: Pt = [23, 9]
const nearHand = (rg: Rig, h: Hand) => handAt(rg, NEAR_SHOULDER, h)
const farHand = (rg: Rig, h: Hand) => handAt(rg, FAR_SHOULDER, h)

// ------------------------------------------------------------------------------------------------------ clips

const idle = [0, 0.5, 1, 0.5].map((b, i) =>
  draw({
    squash: 0.4 - b * 1.2,
    earLift: b * 0.8,
    faceDy: -b * 0.5,
    nearArm: [6, 8 - b],
    farArm: [7, 8 - b],
    cape: capePose({ swing: [12, 14, 17, 15][i], len: 40 + b, phase: i * 0.5, billow: 3 + b }),
    crown: { dx: 0, dy: 0, rot: 0, glint: [0, 1, 2, 1][i] }
  })
)

const intro = [
  // wrapped in the cape, head low, eyes slitted
  draw({
    squash: 1.4,
    faceDy: 2,
    earTilt: 1,
    nearArm: [14, 4],
    farArm: [12, 2],
    fist: true,
    eyes: 'slit',
    brow: 1,
    cape: capePose({ swing: 2, len: 41, w0: 24, w1: 34, billow: 1, wave: 1, phase: 0.2, lining: 0 })
  }),
  // throws the cape open, arms wide, eyes flash
  draw({
    squash: -2.2,
    bob: 1,
    earLift: 2,
    nearFoot: [-4, 0],
    farFoot: [5, 0],
    nearArm: [-16, -10],
    farArm: [18, -12],
    eyes: 'flash',
    brow: 3,
    mouth: 'roar',
    cape: capePose({ swing: 68, len: 46, w1: 50, billow: 8, wave: 3, phase: 1.6, lining: 0.9 }),
    crown: { dx: 0, dy: -1, rot: 0, glint: 2 },
    fxFront: () => undefined
  }),
  // fist to the sky, roar
  draw({
    squash: -1.2,
    lean: 2,
    earLift: 1,
    nearFoot: [-4, 0],
    farFoot: [5, 0],
    nearArm: [-6, 2],
    farArm: [12, -34],
    fist: true,
    eyes: 'wide',
    brow: 3,
    mouth: 'roar',
    cape: capePose({ swing: 44, len: 44, w1: 46, billow: 6, wave: 3, phase: 2.8, lining: 0.6 }),
    crown: { dx: 0, dy: 0, rot: 0, glint: 1 }
  }),
  draw({
    squash: -0.6,
    lean: 2,
    earLift: 0.5,
    nearFoot: [-4, 0],
    farFoot: [5, 0],
    nearArm: [-5, 3],
    farArm: [13, -35],
    fist: true,
    eyes: 'flash',
    brow: 4,
    mouth: 'roar',
    cape: capePose({ swing: 30, len: 43, w1: 44, billow: 5, wave: 2.5, phase: 4, lining: 0.45 }),
    crown: { dx: 0, dy: 0, rot: 0, glint: 2 },
    fxFront: (r) => {
      sparkStar(r, 110, 22, 4, C.white, DARK[0])
      sparkStar(r, 118, 36, 3, C.white, DARK[1])
    }
  })
]

const move = Array.from({ length: 6 }, (_, i) => {
  const t = i / 6
  const c = Math.cos(t * TAU)
  const s = Math.sin(t * TAU)
  return draw({
    bob: Math.abs(s) * 2.2,
    squash: 0.9 - Math.abs(s) * 1.3,
    lean: 3,
    faceDx: 1,
    earTilt: 1 + Math.abs(s),
    nearFoot: [c * 9, Math.max(0, s) * 5],
    farFoot: [-c * 9, Math.max(0, -s) * 5],
    nearArm: [10 - c * 6, 12 - Math.abs(c) * 2],
    farArm: [9 + c * 6, 11 - Math.abs(c) * 2],
    cape: capePose({ swing: 22 + 8 * Math.sin((t - 0.2) * TAU), len: 40, phase: t * TAU, wave: 2.5, lining: 0.35 }),
    crown: { dx: 0, dy: Math.round(-Math.abs(s)), rot: 0.03 * c, glint: 0 }
  })
})

const windup = [
  draw({
    lean: -3,
    squash: 0.8,
    faceDx: -1,
    nearFoot: [-3, 0],
    farFoot: [5, 0],
    nearArm: [-10, 3],
    farArm: [10, 7],
    fist: true,
    brow: 3,
    mouth: 'grit',
    cape: capePose({ swing: 8, phase: 0.6 }),
    fxFront: (r, rg) => {
      const [x, y] = nearHand(rg, [-10, 3])
      orb(r, x - 9, y - 2, 3, false)
    }
  }),
  draw({
    lean: -6,
    squash: 1.8,
    faceDx: -2,
    nearFoot: [-4, 0],
    farFoot: [6, 0],
    nearArm: [-15, 5],
    farArm: [12, 5],
    fist: true,
    eyes: 'wide',
    brow: 4,
    mouth: 'grit',
    earTilt: 2,
    cape: capePose({ swing: 4, len: 41, phase: 1.5 }),
    crown: { dx: 0, dy: 0, rot: 0, glint: 1 },
    fxFront: (r, rg) => {
      const [x, y] = nearHand(rg, [-15, 5])
      orb(r, x - 11, y - 3, 6)
      bolt(r, x - 11, y - 3, x - 20, y - 18, 31)
    }
  }),
  draw({
    lean: -9,
    squash: 2.6,
    faceDx: -2,
    nearFoot: [-5, 0],
    farFoot: [7, 0],
    nearArm: [-17, 7],
    farArm: [13, 3],
    fist: true,
    eyes: 'wide',
    brow: 5,
    mouth: 'grit',
    earTilt: 3,
    cape: capePose({ swing: 0, len: 40, phase: 2.6, billow: 2 }),
    crown: { dx: 0, dy: 1, rot: 0, glint: 2 },
    fxFront: (r, rg) => {
      const [x, y] = nearHand(rg, [-17, 7])
      orb(r, x - 12, y - 4, 8)
      bolt(r, x - 14, y - 8, x - 22, y - 26, 77)
      bolt(r, x - 8, y - 10, x + 2, y - 24, 78)
    }
  })
]

const dustTrail = (seed: number) => (r: Raster) => {
  const rnd = rng(seed)
  for (let i = 0; i < 3; i++) puff(r, 22 - i * 8 + rnd() * 4, 114 + rnd() * 3 - i * 1.5, 3.6 + rnd() * 1.5 - i * 0.5)
}

const attack = [
  [9, 0, -8, 3, 1.5],
  [-1, 5, 3, 0, 0.5],
  [-9, 0, 9, 0, 1],
  [2, 5, -1, 4, 0]
].map(([nf, nl, ff, fl, bob], i) =>
  draw({
    dx: 6,
    lean: 14,
    squash: 2.6,
    bob,
    faceDx: 3,
    faceDy: 2,
    earTilt: 5,
    earLift: -2,
    nearFoot: [nf, nl],
    farFoot: [ff, fl],
    nearArm: [20 + (i % 2) * 2, 2 - (i % 2) * 2],
    farArm: [20 - (i % 2) * 2, 0 + (i % 2) * 2],
    fist: true,
    brow: 5,
    mouth: 'grit',
    cape: capePose({
      swing: 82 + [0, 5, 0, -5][i],
      len: 44,
      w0: 18,
      w1: 22,
      billow: 3,
      wave: 3,
      phase: i * 1.6,
      lining: 0.6
    }),
    crown: { dx: -1, dy: 1, rot: 0.04, glint: 0 },
    fxBack: dustTrail(20 + i)
  })
)

const air = [
  // rising: stretched, fists up, cape trailing straight down
  draw({
    bob: 3,
    squash: -3.4,
    lean: 1,
    earLift: -2,
    nearFoot: [-3, -1],
    farFoot: [5, -2],
    nearArm: [-8, -24],
    farArm: [12, -30],
    fist: true,
    eyes: 'wide',
    brow: 3,
    mouth: 'roar',
    cape: capePose({ swing: -4, len: 46, w0: 18, w1: 22, billow: 1, wave: 2, phase: 0.3, lining: 0.1 }),
    crown: { dx: 0, dy: -1, rot: 0, glint: 0 }
  }),
  // falling: squashed, arms out, the cape billowing up and wide
  draw({
    bob: 4,
    squash: 2,
    lean: 3,
    faceDy: 1,
    earLift: 3,
    nearFoot: [-4, 2],
    farFoot: [7, 2],
    nearArm: [-14, -6],
    farArm: [20, -8],
    eyes: 'wide',
    brow: 4,
    mouth: 'roar',
    cape: capePose({ swing: 150, len: 40, w0: 22, w1: 60, billow: 8, wave: 3, phase: 1.1, lining: 0.9 }),
    crown: { dx: 0, dy: -2, rot: 0.08, glint: 0 }
  })
]

const shock = (cx: number, wide: number, seed: number) => (r: Raster) => {
  const rnd = rng(seed)
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++)
      puff(r, cx + side * (36 + i * 11 * wide) + rnd() * 3, 114 - i * 3 - rnd() * 2, 5 - i + wide)
}

const land = [
  draw({
    squash: 7,
    faceDy: 3,
    earTilt: -2,
    earLift: -3,
    nearFoot: [-8, 0],
    farFoot: [10, 0],
    nearArm: [18, 4],
    farArm: [16, 3],
    fist: true,
    eyes: 'half',
    brow: 5,
    mouth: 'grit',
    cape: capePose({ swing: 60, len: 38, w1: 50, billow: 6, wave: 3, phase: 0.9, lining: 0.5 }),
    crown: { dx: 0, dy: 2, rot: 0.06, glint: 0 },
    fxFront: shock(OX, 1, 5)
  }),
  draw({
    squash: 3,
    faceDy: 1,
    earLift: 1,
    nearFoot: [-6, 0],
    farFoot: [8, 0],
    nearArm: [14, 8],
    farArm: [12, 7],
    fist: true,
    brow: 4,
    mouth: 'grit',
    cape: capePose({ swing: 34, len: 42, w1: 46, billow: 5, wave: 3, phase: 2.1, lining: 0.4 }),
    crown: { dx: 0, dy: 1, rot: -0.05, glint: 0 },
    fxFront: shock(OX, 1.6, 9)
  }),
  draw({
    squash: -0.8,
    earLift: 0.5,
    nearArm: [6, 8],
    farArm: [9, 12],
    brow: 2,
    cape: capePose({ swing: 18, len: 41, phase: 3.3 }),
    crown: { dx: 0, dy: -1, rot: 0, glint: 1 }
  })
]

const shoot = [
  draw({
    lean: -2,
    squash: 0.6,
    nearArm: [16, -1],
    farArm: [14, -4],
    fist: true,
    brow: 3,
    mouth: 'grit',
    cape: capePose({ swing: 10, phase: 0.2 }),
    fxFront: (r, rg) => {
      const [x, y] = nearHand(rg, [16, -1])
      orb(r, x + 8, y - 2, 5, false)
    }
  }),
  draw({
    lean: -5,
    squash: 1.4,
    nearFoot: [-3, 0],
    farFoot: [5, 0],
    nearArm: [-12, -14],
    farArm: [12, -34],
    fist: true,
    eyes: 'wide',
    brow: 4,
    mouth: 'grit',
    cape: capePose({ swing: 4, len: 41, phase: 1.4 }),
    crown: { dx: 0, dy: 0, rot: 0, glint: 1 },
    fxFront: (r, rg) => {
      const [x, y] = farHand(rg, [12, -34])
      orb(r, x + 4, y - 10, 9)
      bolt(r, x + 4, y - 10, x + 18, y + 2, 5)
    }
  }),
  draw({
    lean: 8,
    squash: 1.6,
    faceDx: 2,
    nearFoot: [4, 0],
    farFoot: [-4, 0],
    nearArm: [26, -4],
    farArm: [26, -6],
    brow: 5,
    mouth: 'roar',
    earTilt: 3,
    cape: capePose({ swing: 46, len: 42, w1: 46, phase: 2.4, billow: 6, lining: 0.5 }),
    crown: { dx: 0, dy: 0, rot: 0.05, glint: 0 },
    fxFront: (r) => {
      sparkStar(r, 118, 62, 6, C.white, DARK[0])
      sparkStar(r, 112, 72, 3, C.white, DARK[1])
    }
  }),
  draw({
    lean: 5,
    squash: 0.8,
    faceDx: 1,
    nearFoot: [2, 0],
    farFoot: [-2, 0],
    nearArm: [22, 6],
    farArm: [22, 4],
    brow: 3,
    mouth: 'grit',
    cape: capePose({ swing: 30, len: 41, phase: 3.2, lining: 0.35 }),
    fxFront: (r) => {
      puff(r, 114, 74, 3)
      puff(r, 119, 66, 2)
    }
  })
]

const recover = [0, 1].map((i) =>
  draw({
    lean: 4 + i,
    squash: 1.6 * i,
    faceDy: 3 + i,
    earTilt: -1,
    earLift: -1 - i,
    nearFoot: [i, 0],
    nearArm: [9 + i, 15 - i],
    farArm: [8, 14 + i],
    eyes: 'half',
    brow: -1,
    mouth: 'pant',
    cape: capePose({ swing: 6 - i * 3, len: 40, w1: 34, billow: 1, wave: 1.5, phase: i * 2, lining: 0.1 }),
    crown: { dx: 0, dy: 1 + i, rot: 0.04 * (i ? -1 : 1), glint: 0 },
    fxFront: (r, rg) => {
      const [x, y] = rg.E(26, -34)
      sweat(r, Math.round(x) + 4 + i * 2, Math.round(y) + i * 4)
    }
  })
)

const rage = [
  // 0 hunched, clenching: the first wisps
  draw({
    squash: 2.2,
    faceDy: 3,
    earTilt: -1,
    earLift: -2,
    nearArm: [8, 2],
    farArm: [10, 0],
    fist: true,
    eyes: 'slit',
    brow: 5,
    mouth: 'grit',
    flame: 0.35,
    flamePhase: 0,
    cape: capePose({ swing: 10, len: 40, phase: 0.4, billow: 2 }),
    crown: { dx: 0, dy: 1, rot: 0.03, glint: 0 }
  }),
  // 1 the flames catch; eyes turn red
  draw({
    squash: 2.8,
    faceDy: 3,
    earLift: -2,
    nearArm: [6, 0],
    farArm: [9, -2],
    fist: true,
    eyes: 'rage',
    brow: 5,
    mouth: 'grit',
    flame: 0.6,
    flamePhase: 0.9,
    cape: capePose({ swing: 30, len: 41, phase: 1.3, wave: 3, billow: 4, lining: 0.4 }),
    crown: { dx: 0, dy: 1, rot: -0.04, glint: 1 }
  }),
  // 2..5 throws his arms wide and roars; the fire climbs, the cape flares
  ...[0, 1, 2, 3].map((k) =>
    draw({
      squash: -1.8 + (k % 2) * 0.6,
      lean: -3,
      faceDy: -1,
      earLift: 2 + (k % 2),
      nearFoot: [-5, 0],
      farFoot: [7, 0],
      nearArm: [-16 + (k % 2) * 2, -12 - (k % 2) * 2],
      farArm: [18 - (k % 2) * 2, -14 + (k % 2) * 2],
      fist: true,
      eyes: 'rage',
      brow: 6,
      mouth: 'roar',
      flame: 1 - (k === 3 ? 0.15 : 0),
      flamePhase: 2 + k * 0.9,
      cape: capePose({
        swing: 104 + [0, 10, 4, 14][k],
        len: 34,
        w1: 50,
        billow: 8,
        wave: 3.5,
        phase: 2.2 + k * 1.1,
        lining: 0.9
      }),
      crown: { dx: 0, dy: -1 - (k % 2), rot: 0, glint: k % 2 ? 2 : 1 }
    })
  )
]

const hurt = [
  draw({
    lean: -8,
    squash: 2,
    faceDx: -3,
    faceDy: 2,
    earTilt: -3,
    earLift: 3,
    nearFoot: [-5, 0],
    farFoot: [4, 0],
    nearArm: [-10, 4],
    farArm: [16, -4],
    eyes: 'hurt',
    brow: -1,
    mouth: 'grit',
    cape: capePose({ swing: -10, len: 40, w1: 42, billow: 6, phase: 0.8, lining: 0.3 }),
    crown: { dx: -2, dy: -5, rot: -0.3, glint: 0 },
    fxFront: (r) => {
      sparkStar(r, 104, 30, 5)
      sparkStar(r, 112, 44, 3)
    }
  }),
  draw({
    lean: -3,
    squash: 1.2,
    faceDx: -1,
    faceDy: 2,
    earLift: 1,
    nearFoot: [-3, 0],
    farFoot: [3, 0],
    nearArm: [8, 12],
    farArm: [10, 10],
    eyes: 'half',
    brow: 1,
    mouth: 'grit',
    cape: capePose({ swing: 6, len: 41, phase: 2 }),
    crown: { dx: 1, dy: -2, rot: 0.18, glint: 0 }
  })
]

// ------------------------------------------------------------------------------------------------------ defeat

/** A lying or toppling body moved as a whole so it rests on the ground and stays inside the frame. */
function settle(r: Raster, floor = GY, left?: number) {
  const b = r.bounds()!
  const dy = floor - (b.y + b.h - 1)
  const dx = left === undefined ? clamp(0, 3 - b.x, S - 4 - (b.x + b.w - 1)) : left - b.x
  return r.shifted(dx, dy)
}

/** The cape spread flat under a fallen king, folds fanning out from the neck. */
function capeSpread(out: Raster, x0: number, x1: number, top: number, phase: number) {
  fxPart(out, (l) => {
    const pts: number[] = [x0, GY - 1, x0 + 4, top + 5, lerp(x0, x1, 0.4), top, x1 - 6, top + 2, x1, GY - 3]
    for (let k = 0; k <= 10; k++) {
      const t = 1 - k / 10
      pts.push(lerp(x0 + 2, x1, t), GY - 1 + Math.max(0, Math.sin(t * 5 * Math.PI + phase)) * 1.5)
    }
    l.poly(pts, CAPE[1])
    const src = l.clone()
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (!src.get(x, y)) continue
        const f = (x - x0 + (y - top) * 0.6) / 11 + phase * 0.1
        const q = f - Math.floor(f)
        let c = q < 0.12 ? CAPE[3] : q < 0.36 ? CAPE[0] : q < 0.7 ? CAPE[1] : CAPE[2]
        if (y >= GY - 3) c = y >= GY - 1 ? LINING[2] : LINING[1]
        if (x < x0 + 5 && y > top + 6) c = LINING[1]
        l.set(x, y, c)
      }
    l.set(x0, GY, 0)
  })
}

/** A loose crown resting on the ground: drawn, then moved so it sits on the floor inside the frame. */
function crownOnGround(out: Raster, x: number, rot: number, glint: number) {
  const t = new Raster(S, S)
  crownPart(t, 64, 64, rot, glint)
  const b = t.bounds()!
  const nx = clamp(Math.round(x - b.w / 2), 3, S - 4 - b.w)
  out.blit(t.shifted(nx - b.x, GY - (b.y + b.h - 1)))
}

function dizzy(r: Raster, x: number, y: number, k: number) {
  for (let n = 0; n < 3; n++) {
    const a = k + (n * TAU) / 3
    sparkStar(r, Math.round(x + Math.cos(a) * 13), Math.round(y + Math.sin(a) * 4), 2, C.white, GLOW[1])
  }
}

const defeat = [
  // 0 stagger: thrown back, crown jolted loose
  draw({
    lean: -9,
    squash: 1.4,
    faceDx: -3,
    faceDy: 2,
    earTilt: -3,
    earLift: 3,
    nearFoot: [-6, 0],
    farFoot: [5, 2],
    nearArm: [-12, -2],
    farArm: [18, -10],
    eyes: 'hurt',
    brow: -1,
    mouth: 'roar',
    cape: capePose({ swing: -14, len: 40, w1: 42, billow: 5, phase: 0.6, lining: 0.4 }),
    crown: { dx: 3, dy: -9, rot: 0.45, glint: 0 },
    fxFront: (r) => sparkStar(r, 104, 34, 5)
  }),
  // 1 the crown pops off; he reels on one foot
  (() => {
    const r = draw({
      turn: -0.16,
      pivot: -12,
      lean: -6,
      squash: 0.4,
      faceDx: -2,
      earTilt: -3,
      earLift: 4,
      nearFoot: [-6, 0],
      farFoot: [6, 6],
      nearArm: [-14, -14],
      farArm: [16, -18],
      eyes: 'swirl',
      brow: -1,
      mouth: 'roar',
      cape: capePose({ swing: -6, len: 40, w1: 40, billow: 5, phase: 1.5, lining: 0.4 }),
      crown: null
    })
    const s = settle(r)
    crownPart(s, 102, 30, 0.9, 1)
    return trim(s)
  })(),
  // 2 topples backwards, feet leaving the ground
  (() => {
    const r = draw({
      turn: -0.62,
      pivot: -14,
      dx: 26,
      squash: -0.6,
      faceDx: -1,
      earLift: 3,
      nearFoot: [-2, 6],
      farFoot: [8, 9],
      nearArm: [-10, -18],
      farArm: [14, -20],
      eyes: 'swirl',
      brow: -1,
      mouth: 'roar',
      cape: capePose({ swing: 20, len: 34, w1: 40, billow: 6, phase: 2.1, lining: 0.6 }),
      crown: null
    })
    const s = settle(r, GY, 6)
    crownPart(s, 106, 64, 2.0, 0)
    return trim(s)
  })(),
  // 3 hits the ground: the cape slaps out under him, the crown bounces
  (() => {
    const body = settle(
      drawKing(
        kingPose({
          turn: -1.3,
          pivot: -14,
          dx: 40,
          squash: -2,
          earLift: -2,
          nearFoot: [-2, 5],
          farFoot: [8, 8],
          nearArm: [-6, -16],
          farArm: [12, -18],
          eyes: 'swirl',
          brow: -1,
          mouth: 'roar',
          cape: null,
          collar: false,
          crown: null
        })
      ),
      GY - 2,
      15
    )
    const r = new Raster(S, S)
    capeSpread(r, 2, 78, 100, 0.4)
    r.blit(body)
    crownOnGround(r, 108, 2.5, 0)
    puff(r, 8, 113, 4)
    puff(r, 82, 115, 3.5)
    return trim(r)
  })(),
  // 4, 5 flat on his back, belly up, limbs limp, crown rolled aside, dizzy
  ...[0, 1].map((k) => {
    const body = settle(
      drawKing(
        kingPose({
          turn: -Math.PI / 2,
          pivot: -14,
          dx: 42,
          squash: -3 + k * 0.5,
          earLift: -3,
          earTilt: 2,
          nearFoot: [-3 + k, 2 - k],
          farFoot: [7, 4 + k],
          nearArm: [-4 + k, -12 + k * 2],
          farArm: [10, -12 - k],
          eyes: 'swirl',
          brow: -1,
          mouth: 'pant',
          cape: null,
          collar: false,
          crown: null
        })
      ),
      GY - 2,
      15
    )
    const r = new Raster(S, S)
    capeSpread(r, 2, 80, 102 + k, 1.2 + k)
    r.blit(body)
    crownOnGround(r, 110 + k * 2, Math.PI / 2 + 0.3 - k * 0.12, k)
    const b = body.bounds()!
    dizzy(r, b.x + 22, b.y + 4, 0.6 + k * 1.3)
    return trim(r)
  })
]

export const sheets: SheetModule = {
  king: () => ({
    idle: anim(idle, 6, true),
    intro: anim(intro, 8, false),
    move: anim(move, 10, true),
    windup: anim(windup, 12, false),
    attack: anim(attack, 14, true),
    air: anim(air, 8, false),
    land: anim(land, 14, false),
    shoot: anim(shoot, 12, false),
    recover: anim(recover, 6, true),
    rage: anim(rage, 10, false),
    hurt: anim(hurt, 12, false),
    defeat: anim(defeat, 8, false)
  })
}
