/**
 * いのしし番長 (`boarBoss`): a burly wild boar who styles himself a gang leader. Warm brown bristly hide, a big dark
 * pompadour, long cream tusks, a leaf stalk in the corner of his mouth, a scar on the snout and the gang's red
 * bandana round his neck. Drawn at 128×128, facing right, feet on the anchor row.
 *
 * One pose-parametric draw function (`drawBoar`); every clip is a list of poses (see `bossSpec('boarBoss')`).
 * Volumes are shaded with the same top-left light as the rest of the cast through `capsule` / `blob`, which
 * accept any tilt, so rearing, sitting and a head-down charge all share one shading model.
 */
import type { SheetModule } from '../../module'
import { C, R, ramp } from '../../palette'
import { Painter, Raster, farRamp, shadeIndex, type Ramp } from '../../raster'
import { anim } from '../../sheet'

const BROWN = R.boarBrown
const FAR = farRamp(BROWN)
const HAIR = R.darkFur
const TUSK = R.cream
const BAND = R.bandana
const LEAF = R.leaf
const SNOUT = ramp('#f2c4ae', '#d6948a', '#a8646e', '#6e3a52', '#3a1a22')

type V = readonly [number, number]
type Foot = V
type Eyes = 'glare' | 'wide' | 'squint' | 'closed' | 'swirl' | 'hurt' | 'tired'

/** Rest geometry (px). The hip is the centre of the haunch, the shoulder the centre of the chest. */
const HIP: V = [44, 85]
const REST_ANG = 0.11
const TORSO = 27
const R_HIP = 17
const R_SHOULDER = 23
const R_HEAD = 13

/** A hoof resting on the ground at x, lifted by `lift` px. */
const foot = (x: number, lift = 0): Foot => [x, 116.5 - lift]

interface Pose {
  /** Hip offset from rest (px), extra torso pitch (rad, + = nose up) and extra torso length (px). */
  hip: V
  ang: number
  len: number
  /** Head offset from its rest place (px) and its pitch (rad, + = snout down). */
  head: V
  headAng: number
  /** Lower jaw opening 0..1. */
  jaw: number
  /** Pompadour: -1 swept back .. 1 thrust forward, extra lift (px) and flatness 0..1. */
  quiff: number
  quiffLift: number
  flat: number
  nearF: Foot
  farF: Foot
  nearH: Foot
  farH: Foot
  /** Tail swing -1..1. */
  tail: number
  eyes: Eyes
  /** Nostril steam 0..3 (puffs shown), sweat drops, orbiting stars (phase, -1 = none), ground dust 0..2. */
  steam: number
  sweat: boolean
  stars: number
  dust: number
  tongue: boolean
  /** Bandana tail flutter -1..1 and leaf stalk bob (px). */
  flutter: number
  stem: number
}

const NF = 80
const FF = 70
const NH = 38
const FH = 50

const pose = (p: Partial<Pose> = {}): Pose => ({
  hip: [0, 0],
  ang: 0,
  len: 0,
  head: [0, 0],
  headAng: 0,
  jaw: 0,
  quiff: 0,
  quiffLift: 0,
  flat: 0,
  nearF: foot(NF),
  farF: foot(FF),
  nearH: foot(NH),
  farH: foot(FH),
  tail: 0,
  eyes: 'glare',
  steam: 0,
  sweat: false,
  stars: -1,
  dust: 0,
  tongue: false,
  flutter: 0,
  stem: 0,
  ...p
})

// ------------------------------------------------------------------------------------------------ shading

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** A tapered capsule shaded like a lit sphere swept along the segment: limbs, torso, snouts. */
function capsule(l: Raster, a: V, ra: number, b: V, rb: number, ramp: Ramp, spec = false) {
  const r = Math.max(ra, rb)
  const x0 = Math.floor(Math.min(a[0], b[0]) - r)
  const x1 = Math.ceil(Math.max(a[0], b[0]) + r)
  const y0 = Math.floor(Math.min(a[1], b[1]) - r)
  const y1 = Math.ceil(Math.max(a[1], b[1]) + r)
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const len2 = abx * abx + aby * aby
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const t = len2 ? clamp(((px - a[0]) * abx + (py - a[1]) * aby) / len2, 0, 1) : 0
      const rr = ra + (rb - ra) * t
      const dx = px - (a[0] + abx * t)
      const dy = py - (a[1] + aby * t)
      const q = (dx * dx + dy * dy) / (rr * rr)
      if (q > 1.0001) continue
      l.set(x, y, ramp[shadeIndex(dx / rr, dy / rr, Math.sqrt(Math.max(0, 1 - q)), spec)])
    }
}

/** A union of shaded ellipses [cx, cy, rx, ry]: each pixel takes the shading of the ellipse it is deepest in. */
function blob(l: Raster, parts: readonly (readonly [number, number, number, number])[], ramp: Ramp, spec = true) {
  let x0 = 1e9
  let x1 = -1e9
  let y0 = 1e9
  let y1 = -1e9
  for (const [cx, cy, rx, ry] of parts) {
    x0 = Math.min(x0, cx - rx)
    x1 = Math.max(x1, cx + rx)
    y0 = Math.min(y0, cy - ry)
    y1 = Math.max(y1, cy + ry)
  }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      let best = 9
      let bx = 0
      let by = 0
      for (const [cx, cy, rx, ry] of parts) {
        const nx = (x + 0.5 - cx) / rx
        const ny = (y + 0.5 - cy) / ry
        const q = nx * nx + ny * ny
        if (q < best) [best, bx, by] = [q, nx, ny]
      }
      if (best > 1.0001) continue
      l.set(x, y, ramp[shadeIndex(bx, by, Math.sqrt(Math.max(0, 1 - best)), spec)])
    }
}

/** Two-bone leg: returns the joint and the (reach-clamped) foot. `bend` -1 knee forward, +1 hock backward. */
function leg(root: V, target: V, a1: number, a2: number, bend: 1 | -1): { mid: V; end: V } {
  const dx = target[0] - root[0]
  const dy = target[1] - root[1]
  // a leg whose foot is close to its root folds short instead of buckling far out
  const k = Math.min(1, Math.hypot(dx, dy) / (0.62 * (a1 + a2)))
  const l1 = a1 * k
  const l2 = a2 * k
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.5)
  const base = Math.atan2(dy, dx)
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1))
  const t = base + bend * a
  return {
    mid: [root[0] + Math.cos(t) * l1, root[1] + Math.sin(t) * l1],
    end: [root[0] + Math.cos(base) * d, root[1] + Math.sin(base) * d]
  }
}

// ------------------------------------------------------------------------------------------------ face

const EYE_KEY = { K: C.black, w: C.white, B: HAIR[2], b: HAIR[3], s: SNOUT[0] }

const EYES: Record<Eyes, readonly string[]> = {
  glare: ['BBB...', '.BBBB.', '.KKKK.', '.KwKK.', '.KKKK.', '..KK..'],
  wide: ['.BBBB.', '......', 'wwwwww', 'wKKKKw', 'wKKwKw', 'wKKKKw', '.wwww.'],
  squint: ['BBB...', '.BBBB.', '.KKKK.', '......'],
  closed: ['......', '..BBB.', '.BBBBB', '......'],
  hurt: ['K...K.', '.K.K..', '..K...', '.K.K..', 'K...K.'],
  tired: ['.BBBB.', '.BBBBB', '.KKKK.', '.KwKK.', '..KK..'],
  swirl: ['.wwwww.', 'wwKKKww', 'wKwwwKw', 'wKwKwKw', 'wKwKKKw', 'wwKwwww', '.wwwww.']
}

function eye(l: Raster, at: V, kind: Eyes) {
  const rows = EYES[kind]
  l.stamp(rows, at[0] - Math.floor(rows[0].length / 2), at[1] - Math.floor(rows.length / 2), EYE_KEY)
}

/** The orbiting stars of a dazed boar. */
const STAR = ['..y..', '.yYy.', 'yyYyy', '.yYy.', '..y..']
const STAR_KEY = { y: R.gold[1], Y: R.gold[0] }

/** The pompadour as shaded ellipses in head space [u, v, rx, ry]. */
function quiffParts(q: number, lift: number, flat: number): [number, number, number, number][] {
  const tipU = q < 0 ? 9 + q * 24 : 10 + q * 4
  const tipV = q < 0 ? -17 - lift - q * 6 : -19 - lift - q * 3
  const raw: [number, number, number, number][] = [
    [-8, -9 - lift * 0.3, 8, 8],
    [-1 + q * 3, -14 - lift * 0.7, 9, 9.5],
    [tipU, tipV, 7, 5.5]
  ]
  return raw.map(([u, v, rx, ry]) => [
    u,
    -9 + (v + 9) * (1 - 0.65 * flat),
    rx * (1 + 0.25 * flat),
    ry * (1 - 0.45 * flat)
  ])
}

/** One frame of いのしし番長. */
export function drawBoar(p: Pose): Raster {
  const g = new Painter(128, 128)
  const H: V = [HIP[0] + p.hip[0], HIP[1] + p.hip[1]]
  const a = REST_ANG + p.ang
  const ex: V = [Math.cos(a), -Math.sin(a)]
  const ey: V = [Math.sin(a), Math.cos(a)]
  const on = (o: V, u: number, v: number): V => [o[0] + ex[0] * u + ey[0] * v, o[1] + ex[1] * u + ey[1] * v]
  const S = on(H, TORSO + p.len, 0)
  const K0 = on(S, 15, -3)
  const K: V = [K0[0] + p.head[0], K0[1] + p.head[1]]
  const ha = p.headAng - p.ang * 0.7
  const hb: V = [Math.cos(ha), Math.sin(ha)]
  const hn: V = [-Math.sin(ha), Math.cos(ha)]
  const h = (u: number, v: number): V => [K[0] + hb[0] * u + hn[0] * v, K[1] + hb[1] * u + hn[1] * v]
  const ja = p.jaw * 0.6
  const jaw = (u: number, v: number): V => {
    const du = u
    const dv = v - 8
    return h(du * Math.cos(ja) - dv * Math.sin(ja), 8 + du * Math.sin(ja) + dv * Math.cos(ja))
  }

  // tail: a short curl ending in a dark tuft
  g.add(-5, (l) => {
    const r = on(H, -R_HIP + 3, -7)
    const m: V = [r[0] - 6, r[1] - 4 - p.tail * 2]
    const t: V = [r[0] - 8 + p.tail * 3, r[1] - 12 - p.tail * 5]
    capsule(l, r, 2.6, m, 2.2, BROWN)
    capsule(l, m, 2.2, t, 1.8, BROWN)
    blob(l, [[t[0] - 1, t[1] - 1, 3.2, 3.6]], HAIR, false)
  })

  // bristle mane along the back
  g.add(-2, (l) => {
    for (const [t, size] of [
      [0.02, 5],
      [0.2, 7],
      [0.38, 8],
      [0.56, 9],
      [0.74, 9],
      [0.92, 7]
    ] as const) {
      const r = R_HIP + (R_SHOULDER - R_HIP) * t
      const c = on(H, (TORSO + p.len) * t, 0)
      const up = (d: number, back: number): V => on(c, -back, -d)
      l.poly([...up(r - 3, 4), ...up(r + size, 3.5), ...up(r - 3, -3.5)], BROWN[3])
      l.poly([...up(r - 3, 3), ...up(r + size - 2, 2.5), ...up(r - 3, -1.5)], BROWN[2])
    }
  })

  // legs: two-bone, knee forward on the front pair, hock back on the hind pair
  const drawLeg = (
    depth: number,
    root: V,
    target: V,
    radii: readonly [number, number, number],
    ramp: Ramp,
    lengths: readonly [number, number],
    bend: 1 | -1
  ) =>
    g.add(depth, (l) => {
      // a hind foot planted ahead of its root folds the leg the other way (knee up, as when sitting)
      const { mid, end } = leg(root, target, lengths[0], lengths[1], bend === 1 && target[0] - root[0] > 4 ? -1 : bend)
      capsule(l, root, radii[0], mid, radii[1], ramp)
      capsule(l, mid, radii[1], [end[0], end[1] - 2], radii[2], ramp)
      blob(l, [[end[0] + 1, end[1], 5.6, 3.2]], HAIR, false)
      l.set(end[0] + 3, end[1] - 2, HAIR[0])
    })
  drawLeg(-4, on(S, 9, 12), p.farF, [6, 5, 4.6], FAR, [12, 12], -1)
  drawLeg(-4, on(H, 7, 8), p.farH, [9, 5.5, 4.6], FAR, [13, 12], 1)

  // torso with the haunch and chest
  g.add(0, (l) => {
    capsule(l, H, R_HIP, S, R_SHOULDER, BROWN)
  })
  drawLeg(0.2, on(H, -2, 8), p.nearH, [11, 6.4, 5], BROWN, [13, 12], 1)
  drawLeg(0.3, on(S, 2, 13), p.nearF, [7.5, 5.8, 5.2], BROWN, [12, 12], -1)

  // bandana round the neck: band, hanging triangle and a knotted pair of tails
  g.add(0.45, (l) => {
    capsule(l, h(-11, 10), 4.4, h(3, 18), 4, BAND)
    // the ends of the knot, streaming back
    const k = h(-12, 10)
    const f = p.flutter
    capsule(l, k, 3, [k[0] - 9, k[1] - 2 - f * 4], 2.2, BAND)
    capsule(l, k, 3, [k[0] - 8, k[1] + 5 - f * 3], 2.2, BAND)
  })

  // far ear
  g.add(0.4, (l) => {
    l.poly([...h(-7, -8), ...h(-17, -24 + p.flat * 10), ...h(0, -15)], BROWN[1])
    l.poly([...h(-8, -11), ...h(-14, -21 + p.flat * 8), ...h(-4, -14)], SNOUT[2])
  })

  // mouth, lower jaw and the far tusk
  g.add(0.41, (l) => {
    if (p.jaw > 0.05) {
      l.poly([...h(2, 7), ...h(19, 8), ...jaw(19, 9), ...jaw(2, 8)], C.mouth)
      if (p.tongue) capsule(l, jaw(4, 8), 3, jaw(16, 10), 2.4, [C.tongue, C.tongue, C.mouth, C.mouth, C.mouth])
    }
  })
  g.add(0.42, (l) => {
    capsule(l, jaw(2, 10), 4.6, jaw(18, 11), 3.8, BROWN)
    // far tusk, a step darker and smaller
    const pts = [jaw(12, 11), jaw(21, 14), jaw(26, 7), jaw(26.5, -1)]
    const fr = farRamp(TUSK)
    for (let i = 1; i < pts.length; i++) capsule(l, pts[i - 1], 2.8 - i * 0.55, pts[i], 2.8 - (i + 1) * 0.55, fr)
  })

  // head: skull, jowls, snout and the pink nose pad
  g.add(0.5, (l) => {
    capsule(l, h(-1, 0), R_HEAD, h(-1, 0), R_HEAD, BROWN)
    capsule(l, h(-3, 6), 10, h(5, 7), 9.5, BROWN)
    capsule(l, h(5, 3), 10.5, h(18, 6), 8.8, BROWN)
    capsule(l, h(21, 1), 4.4, h(21, 9.5), 5.2, SNOUT)
  })
  g.add(
    0.55,
    (l) => {
      eye(l, h(7, -2), p.eyes)
      // nostrils and the scar across the snout
      const n = h(23, 3)
      l.rect(n[0] - 1, n[1], 2, 2, SNOUT[3])
      const s0 = h(10, -6)
      const s1 = h(17, 3)
      l.line(s0[0], s0[1], s1[0], s1[1], BROWN[0])
      for (const t of [0.35, 0.7]) {
        const x = s0[0] + (s1[0] - s0[0]) * t
        const y = s0[1] + (s1[1] - s0[1]) * t
        l.line(x - 2, y + 1, x + 1, y - 2, BROWN[0])
      }
      // lip line
      if (p.jaw <= 0.05) {
        const m0 = h(6, 10)
        const m1 = h(19, 10.5)
        l.line(m0[0], m0[1], m1[0], m1[1], HAIR[3])
        if (p.tongue) {
          const t = h(15, 11)
          l.rect(t[0], t[1], 3, 5, C.tongue)
        }
      }
    },
    false
  )

  // the pompadour: a big shiny quiff swept to the front, with a few sharp locks
  g.add(0.6, (l) => {
    const parts = quiffParts(p.quiff, p.quiffLift, p.flat).map(([u, v, rx, ry]) => {
      const c = h(u, v)
      return [c[0], c[1], rx, ry] as [number, number, number, number]
    })
    blob(l, parts.slice(0, 2), HAIR)
    const tipC: V = [parts[2][0], parts[2][1]]
    capsule(l, [parts[1][0], parts[1][1]], 7.5, tipC, 2.2, HAIR, true)
  })

  // the long near tusk  })

  // the long near tusk and the leaf stalk
  g.add(0.62, (l) => {
    const pts = [jaw(10, 12), jaw(20, 16), jaw(28, 11), jaw(31, 1), jaw(29, -6)]
    for (let i = 1; i < pts.length; i++)
      capsule(l, pts[i - 1], 3.5 - i * 0.62, pts[i], 3.5 - (i + 1) * 0.62, TUSK, true)
  })
  g.add(0.63, (l) => {
    const root = jaw(8, 11)
    const mid = jaw(0, 15)
    const tip: V = [mid[0] - 5, mid[1] + 5 + p.stem]
    l.thick(root[0], root[1], mid[0], mid[1], 2, LEAF[2])
    l.thick(mid[0], mid[1], tip[0], tip[1], 2, LEAF[2])
    l.ellipse(tip[0] - 2, tip[1] + 1, 4, 2.2, LEAF[1])
  })

  // ears, steam, sweat, dazed stars and dust
  g.add(0.58, (l) => {
    l.poly([...h(-9, -6), ...h(-19, -20 + p.flat * 10), ...h(-2, -13)], BROWN[1])
    l.poly([...h(-9, -8), ...h(-16, -18 + p.flat * 8), ...h(-4, -13)], SNOUT[2])
  })
  if (p.steam > 0)
    g.add(1, (l) => {
      const n = h(25, 1)
      const puffs: [number, number, number][] = [
        [2, -4, 2],
        [5, -9, 3],
        [8, -15, 4]
      ]
      for (const [dx, dy, r] of puffs.slice(0, p.steam)) blob(l, [[n[0] + dx, n[1] + dy, r, r]], R.dust, false)
    })
  if (p.sweat)
    g.add(1, (l) => {
      for (const [u, v] of [
        [-12, -16],
        [-17, -6]
      ]) {
        const c = h(u, v)
        l.ellipse(c[0], c[1], 1.8, 2.6, R.water[1])
      }
    })
  if (p.stars >= 0)
    g.add(1, (l) => {
      const o = h(0, -26)
      for (let k = 0; k < 3; k++) {
        const t = (p.stars + k / 3) * Math.PI * 2
        l.stamp(STAR, o[0] + Math.cos(t) * 17 - 2, o[1] + Math.sin(t) * 5 - 2, STAR_KEY)
      }
    })
  if (p.dust > 0)
    g.add(-6, (l) => {
      const puffs: [number, number, number][] = [
        [p.nearH[0] - 10, 114, 4],
        [p.nearH[0] - 17, 110, 3],
        [p.farH[0] - 4, 116, 3]
      ]
      if (p.dust > 1) puffs.push([p.nearF[0] + 12, 113, 4.4], [p.nearF[0] + 19, 117, 3], [p.nearF[0] + 17, 108, 2.5])
      for (const [x, y, r] of puffs) blob(l, [[x, y, r * 1.2, r]], R.dust, false)
    })
  return g.render()
}

// ------------------------------------------------------------------------------------------------ clips

const idle = [0, 1, 2, 3].map((i) =>
  pose({
    hip: [0, [0, 0, 1, 0][i]],
    head: [0, [0, 1, 2, 1][i]],
    len: [0, 0, 1, 0][i],
    quiffLift: [0, 1, 2, 1][i],
    nearF: [foot(NF), foot(NF - 3, 4), foot(NF - 9, 1), foot(NF - 4, 0)][i],
    steam: [0, 0, 1, 2][i],
    eyes: i === 3 ? 'squint' : 'glare',
    tail: [0, 1, 0, -1][i],
    flutter: [0, 0.4, 0, -0.4][i],
    stem: [0, 1, 0, -1][i]
  })
)

const intro = [
  pose({
    hip: [-1, 3],
    ang: 0.16,
    len: -2,
    head: [0, 1],
    jaw: 0.3,
    quiff: 0.5,
    nearF: foot(NF + 2, 3),
    farF: foot(FF + 2, 2),
    eyes: 'glare'
  }),
  pose({
    hip: [-5, 2],
    ang: 0.58,
    head: [-1, -3],
    headAng: -0.1,
    jaw: 1,
    quiff: 1,
    quiffLift: 3,
    nearF: [80, 84],
    farF: [70, 90],
    nearH: foot(NH - 3),
    farH: foot(FH - 3),
    eyes: 'wide',
    tail: 1,
    flutter: 1,
    stem: 2
  }),
  pose({
    hip: [-1, 3],
    ang: -0.12,
    len: -2,
    head: [4, 6],
    headAng: 0.25,
    jaw: 0.6,
    quiff: 1,
    quiffLift: 2,
    nearF: foot(NF + 6),
    farF: foot(FF + 6),
    dust: 2,
    eyes: 'squint',
    tail: -1,
    flutter: -1
  }),
  pose({
    ang: 0.02,
    head: [2, 3],
    headAng: 0.14,
    quiff: 0.8,
    steam: 3,
    eyes: 'glare',
    nearF: foot(NF + 4),
    farF: foot(FF + 4),
    flutter: 0.3,
    stem: -1
  })
]

const windup = [
  pose({
    hip: [-2, 2],
    ang: -0.05,
    len: -1,
    head: [3, 4],
    headAng: 0.2,
    quiff: 0.7,
    nearH: foot(NH - 3),
    flutter: 0.3
  }),
  pose({
    hip: [-3, 4],
    ang: -0.1,
    len: -3,
    head: [4, 8],
    headAng: 0.35,
    quiff: 1,
    nearH: foot(NH - 8, 4),
    farH: foot(FH - 3),
    dust: 1,
    steam: 1,
    flutter: -0.4,
    tail: 1
  }),
  pose({
    hip: [-5, 6],
    ang: -0.16,
    len: -5,
    head: [5, 7],
    headAng: 0.5,
    quiff: 1,
    quiffLift: 2,
    nearF: foot(NF + 4),
    farF: foot(FF + 3),
    nearH: foot(NH - 12, 1),
    farH: foot(FH - 6),
    dust: 1,
    steam: 3,
    flutter: 0.9,
    tail: -1
  })
]

const attack = [
  pose({
    hip: [2, -2],
    ang: -0.02,
    len: 7,
    head: [0, 8],
    headAng: 0.45,
    quiff: -1,
    nearF: foot(NF + 16, 7),
    farF: foot(FF + 14, 9),
    nearH: foot(NH - 14, 6),
    farH: foot(FH - 16, 8),
    flutter: 1,
    tail: 1
  }),
  pose({
    hip: [4, 2],
    ang: -0.12,
    len: 2,
    head: [5, 9],
    headAng: 0.55,
    quiff: -1,
    nearF: foot(NF + 14),
    farF: foot(FF + 10, 1),
    nearH: foot(NH - 12, 4),
    farH: foot(FH - 10, 6),
    dust: 1,
    flutter: 0.4,
    tail: 0
  }),
  pose({
    hip: [2, -6],
    ang: 0.05,
    len: -6,
    head: [4, 7],
    headAng: 0.4,
    quiff: -1,
    nearF: foot(NF - 6, 6),
    farF: foot(FF - 10, 5),
    nearH: foot(NH + 10, 5),
    farH: foot(FH + 12, 6),
    flutter: -0.5,
    tail: -1
  }),
  pose({
    hip: [0, 2],
    ang: -0.06,
    len: 1,
    head: [4, 9],
    headAng: 0.5,
    quiff: -1,
    nearF: foot(NF + 4, 4),
    farF: foot(FF + 1, 2),
    nearH: foot(NH + 4),
    farH: foot(FH + 6),
    dust: 1,
    flutter: 0.2,
    tail: 0
  })
]

const stunned = [0, 1, 2, 3].map((i) =>
  pose({
    hip: [4, 17],
    ang: 0.84,
    head: [[-2, 0, 2, 0][i], [0, 1, 0, 1][i]],
    headAng: [-0.1, 0.1, 0.2, 0.05][i],
    jaw: 0.2,
    tongue: true,
    quiff: -1,
    flat: 1,
    eyes: 'swirl',
    nearF: [foot(74), foot(75), foot(76), foot(75)][i].map((v, k) =>
      k ? v - 14 + [0, 2, 3, 1][i] : v
    ) as unknown as V,
    farF: [foot(68), foot(69), foot(68), foot(67)][i].map((v, k) => (k ? v - 12 + [0, 1, 2, 1][i] : v)) as unknown as V,
    nearH: foot(64),
    farH: foot(54),
    stars: i * 0.1,
    tail: [0, 1, 0, -1][i],
    flutter: [0, 0.5, 0, -0.5][i]
  })
)

const recover = [0, 1].map((i) =>
  pose({
    hip: [0, i],
    len: -i,
    head: [-2, 7 + i],
    headAng: 0.6,
    jaw: [0.5, 0.9][i],
    tongue: true,
    quiff: -0.6,
    flat: 0.6,
    eyes: 'tired',
    sweat: true,
    tail: [0, -1][i],
    flutter: [0, 0.3][i],
    steam: 0
  })
)

const hurt = [
  pose({
    hip: [-4, 0],
    ang: 0.12,
    head: [-3, -2],
    headAng: -0.2,
    jaw: 0.8,
    quiff: 1,
    quiffLift: 3,
    eyes: 'hurt',
    nearF: foot(NF - 4),
    tail: 1,
    flutter: 1
  }),
  pose({
    hip: [-6, 1],
    ang: 0.05,
    head: [-1, 2],
    headAng: -0.05,
    jaw: 0.5,
    quiff: 0.3,
    eyes: 'hurt',
    nearF: foot(NF - 6, 2),
    farF: foot(FF - 5),
    tail: -1,
    flutter: -0.6
  })
]

const defeat = [
  pose({
    hip: [-3, 1],
    ang: 0.1,
    head: [-4, -1],
    headAng: -0.25,
    jaw: 0.9,
    quiff: 1,
    quiffLift: 3,
    eyes: 'swirl',
    stars: 0,
    nearF: foot(NF - 5, 1),
    flutter: 1
  }),
  pose({
    hip: [-7, 3],
    ang: 0.45,
    head: [-3, 0],
    headAng: -0.3,
    jaw: 0.7,
    quiff: 0.6,
    eyes: 'swirl',
    stars: 0.1,
    tongue: true,
    nearF: [82, 90],
    farF: [74, 94],
    nearH: foot(NH - 4),
    farH: foot(FH - 4),
    flutter: -1
  }),
  pose({
    hip: [-2, 17],
    ang: 0.8,
    head: [0, 4],
    headAng: 0.1,
    jaw: 0.5,
    tongue: true,
    quiff: -0.6,
    flat: 0.5,
    eyes: 'swirl',
    stars: 0.2,
    nearF: [78, 98],
    farF: [70, 100],
    nearH: foot(62),
    farH: foot(52)
  }),
  pose({
    hip: [4, 17],
    ang: 0.84,
    head: [4, 10],
    headAng: 0.5,
    jaw: 0.3,
    tongue: true,
    quiff: -1,
    flat: 1,
    eyes: 'swirl',
    stars: 0.3,
    nearF: [76, 98],
    farF: [68, 100],
    nearH: foot(64),
    farH: foot(54)
  }),
  pose({
    hip: [3, 16],
    ang: 0.1,
    head: [6, 8],
    headAng: 0.3,
    jaw: 0.2,
    tongue: true,
    quiff: -1,
    flat: 1,
    eyes: 'closed',
    stars: 0.4,
    nearF: foot(NF + 14),
    farF: foot(FF + 10),
    nearH: foot(NH + 2, 3),
    farH: foot(FH + 4, 2)
  }),
  pose({
    hip: [3, 17],
    ang: 0.11,
    head: [0, 10],
    headAng: 0.2,
    jaw: 0.2,
    tongue: true,
    quiff: -1,
    flat: 1,
    eyes: 'closed',
    stars: 0.5,
    nearF: foot(NF + 20),
    farF: foot(FF + 16),
    nearH: foot(NH - 14),
    farH: foot(FH - 10)
  })
]

const draw = (poses: Pose[]) => poses.map(drawBoar)

export const sheets: SheetModule = {
  boarBoss: () => ({
    idle: anim(draw(idle), 6, true),
    intro: anim(draw(intro), 8, false),
    windup: anim(draw(windup), 10, false),
    attack: anim(draw(attack), 14, true),
    stunned: anim(draw(stunned), 8, true),
    recover: anim(draw(recover), 6, true),
    hurt: anim(draw(hurt), 12, false),
    defeat: anim(draw(defeat), 8, false)
  })
}
