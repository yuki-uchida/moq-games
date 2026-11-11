/**
 * おおかみ檄 (`wolfBoss`): a lean grey wolf, leader of the pursuers. Pale muzzle and chest, sharp ears, a scar across
 * one eye, a bushy tail and a long red scarf (the gang's bandana) streaming from his neck. Drawn at 128×128, facing
 * right, feet on the anchor row.
 *
 * One pose-parametric draw function (`drawWolf`); every clip is a list of poses (see `bossSpec('wolfBoss')`).
 * Volumes are shaded with the shared top-left light through `capsule` / `blob`, which accept any tilt, so a howl,
 * a crouch, a sprint and a sprawl all share one shading model.
 */
import type { SheetModule } from '../../module'
import { C, R } from '../../palette'
import { Painter, Raster, farRamp, shadeIndex, type Ramp } from '../../raster'
import { anim } from '../../sheet'

const FUR = R.wolfGray
const FAR = farRamp(FUR)
const PALE = R.paper
const BAND = R.bandana
const GOLD = R.gold

type V = readonly [number, number]
type Foot = V
type Eyes = 'fierce' | 'narrow' | 'howl' | 'swirl' | 'hurt' | 'tired' | 'closed'

/** Rest geometry (px). The hip is the centre of the haunch, the shoulder the centre of the chest. */
const HIP: V = [44, 87]
const REST_ANG = 0.05
const TORSO = 27
const R_HIP = 12
const R_SHOULDER = 16.5

/** A paw resting on the ground at x, lifted by `lift` px. */
const foot = (x: number, lift = 0): Foot => [x, 116.5 - lift]

interface Pose {
  /** Hip offset from rest (px), extra torso pitch (rad, + = nose up) and extra torso length (px). */
  hip: V
  ang: number
  len: number
  /** Head offset from its rest place (px) and its pitch (rad, + = snout down). */
  head: V
  headAng: number
  /** Lower jaw opening 0..1 and teeth bared 0..1. */
  jaw: number
  snarl: number
  /** Ears laid back 0..1. */
  ears: number
  nearF: Foot
  farF: Foot
  nearH: Foot
  farH: Foot
  /** Tail: swing -1..1 and how far it streams out behind 0..1. */
  tail: number
  stream: number
  eyes: Eyes
  tongue: boolean
  sweat: boolean
  /** Orbiting stars (phase, -1 = none) and ground dust 0..2. */
  stars: number
  dust: number
  /** Scarf: direction (rad, 0 = straight back, negative = lifted), wave phase and wave size. */
  scarfAng: number
  scarfPhase: number
  scarfAmp: number
  /** Head size multiplier (the howl keeps the full head) and howl sound arcs 0..3. */
  headScale: number
  sound: number
}

const NF = 80
const FF = 71
const NH = 37
const FH = 48

const pose = (p: Partial<Pose> = {}): Pose => ({
  hip: [0, 0],
  ang: 0,
  len: 0,
  head: [0, 0],
  headAng: 0,
  jaw: 0,
  snarl: 0,
  ears: 0,
  nearF: foot(NF),
  farF: foot(FF),
  nearH: foot(NH),
  farH: foot(FH),
  tail: 0,
  stream: 0,
  eyes: 'fierce',
  tongue: false,
  sweat: false,
  stars: -1,
  dust: 0,
  scarfAng: -0.5,
  scarfPhase: 0,
  scarfAmp: 2,
  headScale: 1,
  sound: 0,
  ...p
})

// ------------------------------------------------------------------------------------------------ shading

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/**
 * A tapered capsule shaded like a lit sphere swept along the segment: limbs, torso, snouts.
 * With `clip` it only recolours pixels that are already painted (patches of another fur colour).
 */
function capsule(l: Raster, a: V, ra: number, b: V, rb: number, ramp: Ramp, spec = false, clip = false) {
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
      if (clip && !l.get(x, y)) continue
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

const EYE_KEY = { K: C.black, w: C.white, B: C.inkCool, y: GOLD[1], Y: GOLD[0], o: GOLD[2] }

const EYES: Record<Eyes, readonly string[]> = {
  fierce: ['BBBB..', '.BBBBB', '.KyyYK', '.KKyKK', '..KKK.'],
  narrow: ['BBBB..', '.BBBBB', '.KyyyK', '..KKK.'],
  howl: ['......', '.BBBB.', 'B....B', '......'],
  closed: ['......', '.KKKK.', '......'],
  hurt: ['K...K.', '.K.K..', '..K...', '.K.K..', 'K...K.'],
  tired: ['.BBBBB', '.BBBBB', '.KoyyK', '..KKK.'],
  swirl: ['.wwwww.', 'wwKKKww', 'wKwwwKw', 'wKwKwKw', 'wKwKKKw', 'wwKwwww', '.wwwww.']
}

function eye(l: Raster, at: V, kind: Eyes) {
  const rows = EYES[kind]
  l.stamp(rows, at[0] - Math.floor(rows[0].length / 2), at[1] - Math.floor(rows.length / 2), EYE_KEY)
}

/** The orbiting stars of a dazed wolf. */
const STAR = ['..y..', '.yYy.', 'yyYyy', '.yYy.', '..y..']
const STAR_KEY = { y: GOLD[1], Y: GOLD[0] }

/** One frame of おおかみ檄. */
export function drawWolf(p: Pose): Raster {
  const g = new Painter(128, 128)
  const H: V = [HIP[0] + p.hip[0], HIP[1] + p.hip[1]]
  const a = REST_ANG + p.ang
  const ex: V = [Math.cos(a), -Math.sin(a)]
  const ey: V = [Math.sin(a), Math.cos(a)]
  const on = (o: V, u: number, v: number): V => [o[0] + ex[0] * u + ey[0] * v, o[1] + ex[1] * u + ey[1] * v]
  const S = on(H, TORSO + p.len, 0)
  const K0 = on(S, 14, -8)
  const K: V = [K0[0] + p.head[0], K0[1] + p.head[1]]
  const ha = p.headAng - p.ang * 0.6
  const hb: V = [Math.cos(ha), Math.sin(ha)]
  const hn: V = [-Math.sin(ha), Math.cos(ha)]
  const hs = p.headScale
  const h = (u: number, v: number): V => [
    K[0] + hb[0] * u * hs + hn[0] * v * hs,
    K[1] + hb[1] * u * hs + hn[1] * v * hs
  ]
  const ja = p.jaw * 0.55
  const jaw = (u: number, v: number): V => {
    const dv = v - 5
    return h(u * Math.cos(ja) - dv * Math.sin(ja), 5 + u * Math.sin(ja) + dv * Math.cos(ja))
  }

  // bushy tail: a fat plume that lifts and streams out behind when he runs
  g.add(-5, (l) => {
    const r = on(H, -R_HIP + 3, -4)
    const lift = 0.25 + p.stream * 0.65
    const m: V = [r[0] - 8 + p.tail * 1.5, r[1] + 3 - lift * 7 + p.tail * 2]
    const t: V = [r[0] - 16 + p.stream * 3, r[1] + 8 - lift * 18 + p.tail * 4]
    capsule(l, r, 4.5, m, 6, FUR)
    capsule(l, m, 6, t, 4.2, FUR)
    capsule(l, [t[0] + 1, t[1]], 3.8, [t[0] - 2, t[1] + 1], 3, PALE, false, true)
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
      const { mid, end } = leg(root, target, lengths[0], lengths[1], bend === 1 && target[0] - root[0] > 4 ? -1 : bend)
      capsule(l, root, radii[0], mid, radii[1], ramp)
      capsule(l, mid, radii[1], [end[0], end[1] - 2], radii[2], ramp)
      capsule(l, [end[0] - 1, end[1] - 0.5], 3.2, [end[0] + 3, end[1] - 0.5], 2.6, ramp === FUR ? FUR : FAR)
    })
  drawLeg(-4, on(S, 6, 9), p.farF, [5, 3.6, 3.4], FAR, [13, 13], -1)
  drawLeg(-4, on(H, 5, 6), p.farH, [7, 4, 3.4], FAR, [14, 13], 1)

  // torso with the pale chest and belly
  g.add(0, (l) => {
    capsule(l, H, R_HIP, S, R_SHOULDER, FUR)
    capsule(l, on(S, 7, 8), 8.5, on(S, 1, 12), 6, PALE, false, true)
    capsule(l, on(H, 8, 12), 3.2, on(S, -2, 13), 3.2, PALE, false, true)
  })
  drawLeg(0.2, on(H, -1, 6), p.nearH, [9, 4.6, 3.8], FUR, [14, 13], 1)
  drawLeg(0.3, on(S, 2, 9), p.nearF, [6, 4, 3.6], FUR, [13, 13], -1)

  // the scarf: a band at the neck and two long flat ribbons that follow the run (lit rim on top, shade below)
  g.add(0.45, (l) => {
    const knot = h(-7, 3)
    const flat: Ramp = [BAND[1], BAND[1], BAND[1], BAND[1], BAND[1]]
    capsule(l, h(-8, 6), 3, h(2, 11), 3, flat)
    const dir: V = [-Math.cos(p.scarfAng), Math.sin(p.scarfAng)]
    const perp: V = [-dir[1], dir[0]]
    for (const [len, ph, drop, w] of [
      [38, 0, 0, 2.7],
      [29, 0.8, 4, 2.2]
    ] as const) {
      let prev: V = [knot[0], knot[1] + drop * 0.3]
      const n = 10
      for (let i = 1; i <= n; i++) {
        const t = i / n
        const wave = Math.sin(p.scarfPhase + ph + i * 0.55) * p.scarfAmp * (0.3 + t)
        const cur: V = [
          knot[0] + dir[0] * len * t + perp[0] * wave,
          knot[1] + drop * t + dir[1] * len * t + perp[1] * wave
        ]
        capsule(l, prev, w - (t - 0.1) * 1.2, cur, w - t * 1.2, flat)
        prev = cur
      }
    }
    const src = l.clone()
    for (let y = 0; y < l.h; y++)
      for (let x = 0; x < l.w; x++) {
        if (!src.get(x, y)) continue
        if (!src.get(x, y - 1)) l.set(x, y, BAND[0])
        else if (!src.get(x, y + 1)) l.set(x, y, BAND[2])
      }
  })

  // far ear
  g.add(0.4, (l) => {
    const tip = h(-9 - p.ears * 8, -20 + p.ears * 10)
    l.poly([...h(-3, -5), ...tip, ...h(5, -8)], FAR[1])
  })

  // mouth, lower jaw
  g.add(0.41, (l) => {
    if (p.jaw > 0.05) {
      l.poly([...h(2, 4), ...h(17, 5), ...jaw(17, 6), ...jaw(2, 5)], C.mouth)
      if (p.tongue) capsule(l, jaw(4, 5), 2.6, jaw(14, 8), 2, [C.tongue, C.tongue, C.mouth, C.mouth, C.mouth])
    }
  })
  g.add(0.42, (l) => {
    capsule(l, jaw(2, 7), 3.8 * hs, jaw(17, 7.5), 2.2 * hs, PALE)
    if (p.jaw > 0.05 || p.snarl > 0.5) {
      const f = jaw(14.5, 6)
      l.poly([f[0], f[1] - 3, f[0] + 2, f[1] - 3, f[0] + 1, f[1] + 0], C.white)
    }
  })

  // head: skull, cheek ruff, long snout with a pale underside and a black nose
  g.add(0.5, (l) => {
    capsule(l, h(0, 0), 9.4 * hs, h(0, 0), 9.4 * hs, FUR)
    l.poly([...h(-5, 3), ...h(-13, 9), ...h(-4, 12), ...h(2, 10)], PALE[1])
    capsule(l, h(5, 2), 6 * hs, h(18, 4.5), 3.6 * hs, FUR)
    capsule(l, h(4, 9), 3.5 * hs, h(18, 7), 2.2 * hs, PALE, false, true)
    capsule(l, h(7, 6.5), 4.4 * hs, h(17, 6.5), 2.3 * hs, PALE, false, true)
    l.ellipse(h(21, 3.5)[0], h(21, 3.5)[1], 2.2 * hs, 1.9 * hs, C.black)
  })
  g.add(
    0.55,
    (l) => {
      eye(l, h(3.5, -2), p.eyes)
      // the scar across the eye
      const s0 = h(5, -8)
      const s1 = h(11, 4)
      l.line(s0[0], s0[1], s1[0], s1[1], C.blush)
      // upper-lip fangs when snarling
      if (p.snarl > 0.05 && p.jaw <= 0.05) {
        const f = h(13, 6)
        l.poly([f[0], f[1], f[0] + 2, f[1], f[0] + 1, f[1] + 3], C.white)
        const m0 = h(7, 7.5)
        const m1 = h(18, 6.5)
        l.line(m0[0], m0[1], m1[0], m1[1], C.mouth)
      }
      if (p.tongue && p.jaw <= 0.05) {
        const t = h(13, 8)
        l.rect(t[0], t[1], 3, 5, C.tongue)
      }
    },
    false
  )

  // near ear: tall and sharp, pale inside
  g.add(0.6, (l) => {
    const tip = h(-6 - p.ears * 10, -23 + p.ears * 13)
    l.poly([...h(-4, -5), ...tip, ...h(5, -7)], FUR[1])
    l.poly([...h(-3, -6), ...h(-5.5 - p.ears * 8, -18 + p.ears * 11), ...h(3, -7.5)], PALE[2])
  })

  if (p.sound > 0)
    g.add(
      1,
      (l) => {
        const c = h(16, 1)
        const base = Math.atan2(hb[1], hb[0])
        for (let k = 0; k < p.sound; k++) {
          const r = 12 + k * 5
          l.ring(c[0], c[1], r, r + 1.5, PALE[k === 0 ? 0 : 1], base - 0.55 + k * 0.03, base + 0.55 - k * 0.03)
        }
      },
      false
    )
  if (p.sweat)
    g.add(1, (l) => {
      for (const [u, v] of [
        [-9, -14],
        [-14, -5]
      ]) {
        const c = h(u, v)
        l.ellipse(c[0], c[1], 1.8, 2.6, R.water[1])
        l.set(c[0] - 1, c[1] - 1, R.water[0])
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
      if (p.dust > 1) puffs.push([p.nearF[0] + 12, 113, 4.4], [p.nearF[0] + 19, 117, 3])
      for (const [x, y, r] of puffs) {
        l.ellipse(x, y, r * 1.2, r, R.dust[1])
        l.ellipse(x - 1, y - 1, r * 0.7, r * 0.6, R.dust[0])
      }
    })
  return g.render()
}

// ------------------------------------------------------------------------------------------------ clips

const idle = [0, 1, 2, 3].map((i) =>
  pose({
    hip: [0, [0, -1, 0, 1][i]],
    head: [2, [3, 3, 4, 4][i]],
    headAng: [0.1, 0.05, 0.12, 0.16][i],
    nearF: [foot(NF), foot(NF + 5, 5), foot(NF + 8), foot(NF + 3)][i],
    farF: [foot(FF), foot(FF), foot(FF - 3, 3), foot(FF)][i],
    nearH: [foot(NH), foot(NH), foot(NH), foot(NH + 3, 3)][i],
    farH: [foot(FH), foot(FH - 2), foot(FH), foot(FH)][i],
    tail: [0, 1, 0, -1][i],
    eyes: i === 3 ? 'narrow' : 'fierce',
    snarl: i === 2 ? 0.6 : 0,
    scarfPhase: i * 1.6
  })
)

const intro = [
  pose({ hip: [0, 3], ang: -0.1, head: [2, 6], headAng: 0.3, nearF: foot(NF + 2), eyes: 'fierce', scarfPhase: 0 }),
  pose({
    hip: [-2, 1],
    ang: 0.2,
    head: [-2, -6],
    headAng: -0.5,
    jaw: 0.5,
    eyes: 'howl',
    ears: 0.2,
    scarfAng: -0.3,
    scarfPhase: 1.5
  }),
  pose({
    hip: [-3, 0],
    ang: 0.38,
    head: [-5, -9],
    headAng: -1.0,
    jaw: 1,
    headScale: 1.16,
    sound: 2,
    eyes: 'howl',
    ears: 0.75,
    tail: 1,
    scarfAng: -0.5,
    scarfPhase: 3
  }),
  pose({
    hip: [-3, 0],
    ang: 0.4,
    head: [-5, -10],
    headAng: -1.2,
    jaw: 0.85,
    headScale: 1.16,
    sound: 3,
    eyes: 'howl',
    ears: 0.75,
    tail: -1,
    scarfAng: -0.6,
    scarfPhase: 4.5
  })
]

const windup = [
  pose({
    hip: [-1, 3],
    ang: -0.12,
    len: -2,
    head: [3, 6],
    headAng: 0.25,
    snarl: 0.5,
    nearF: foot(NF + 5),
    farF: foot(FF + 4),
    scarfAng: -0.4,
    scarfPhase: 0.5
  }),
  pose({
    hip: [-2, 5],
    ang: -0.2,
    len: -4,
    head: [4, 10],
    headAng: 0.35,
    snarl: 1,
    nearF: foot(NF + 8),
    farF: foot(FF + 7),
    nearH: foot(NH - 3),
    ears: 0.5,
    dust: 1,
    scarfAng: -0.7,
    scarfPhase: 2
  }),
  pose({
    hip: [-3, 6],
    ang: -0.28,
    len: -6,
    head: [5, 13],
    headAng: 0.45,
    snarl: 1,
    nearF: foot(NF + 11),
    farF: foot(FF + 10),
    nearH: foot(NH - 6),
    farH: foot(FH - 4),
    ears: 0.9,
    dust: 1,
    tail: 1,
    scarfAng: -1.0,
    scarfPhase: 3.6,
    scarfAmp: 3
  })
]

const attack = [
  pose({
    hip: [2, -3],
    len: 8,
    head: [5, 3],
    headAng: 0.15,
    nearF: foot(NF + 20, 10),
    farF: foot(FF + 18, 12),
    nearH: foot(NH - 20, 9),
    farH: foot(FH - 18, 11),
    ears: 1,
    snarl: 0.6,
    stream: 1,
    scarfAng: -0.3,
    scarfPhase: 0
  }),
  pose({
    hip: [3, 2],
    ang: -0.08,
    len: 3,
    head: [5, 5],
    headAng: 0.2,
    nearF: foot(NF + 16),
    farF: foot(FF + 12, 2),
    nearH: foot(NH - 11, 6),
    farH: foot(FH - 12, 8),
    ears: 1,
    snarl: 0.6,
    stream: 1,
    dust: 1,
    scarfAng: -0.15,
    scarfPhase: 1.6
  }),
  pose({
    hip: [2, -8],
    ang: 0.08,
    len: -6,
    head: [4, 2],
    headAng: 0.1,
    nearF: foot(NF - 4, 8),
    farF: foot(FF - 8, 7),
    nearH: foot(NH + 12, 8),
    farH: foot(FH + 14, 9),
    ears: 1,
    snarl: 0.6,
    stream: 0.8,
    scarfAng: -0.1,
    scarfPhase: 3.2
  }),
  pose({
    hip: [0, 3],
    ang: -0.05,
    len: 1,
    head: [4, 6],
    headAng: 0.2,
    nearF: foot(NF + 6, 4),
    farF: foot(FF + 2, 3),
    nearH: foot(NH + 2),
    farH: foot(FH + 6),
    ears: 1,
    snarl: 0.6,
    stream: 0.9,
    dust: 1,
    scarfAng: -0.15,
    scarfPhase: 4.8
  })
]

const stunned = [0, 1, 2, 3].map((i) =>
  pose({
    hip: [3, 19],
    ang: 0.7,
    head: [[-2, 0, 2, 0][i], [2, 3, 2, 3][i]],
    headAng: [-0.1, 0.1, 0.2, 0.05][i],
    jaw: 0.35,
    tongue: true,
    eyes: 'swirl',
    ears: 0.8,
    nearF: [foot(74), foot(75), foot(76), foot(75)][i].map((v, k) =>
      k ? v - 16 + [0, 2, 3, 1][i] : v
    ) as unknown as V,
    farF: [foot(68), foot(69), foot(68), foot(67)][i].map((v, k) => (k ? v - 14 + [0, 1, 2, 1][i] : v)) as unknown as V,
    nearH: foot(60),
    farH: foot(50),
    stars: i * 0.1,
    tail: [0, 1, 0, -1][i],
    scarfAng: 1.2,
    scarfPhase: i * 1.2,
    scarfAmp: 1.5
  })
)

const recover = [0, 1].map((i) =>
  pose({
    hip: [0, 1 + i],
    len: -i,
    head: [0, 8 + i],
    headAng: 0.5,
    jaw: [0.5, 0.9][i],
    tongue: true,
    eyes: 'tired',
    sweat: true,
    ears: 0.6,
    tail: [0, -1][i],
    scarfAng: 0.9,
    scarfPhase: i * 1.6,
    scarfAmp: 1.5
  })
)

const hurt = [
  pose({
    hip: [-4, 0],
    ang: 0.15,
    head: [-3, -3],
    headAng: -0.3,
    jaw: 0.8,
    eyes: 'hurt',
    ears: 0.7,
    nearF: foot(NF - 4),
    tail: 1,
    scarfAng: -0.15,
    scarfPhase: 1
  }),
  pose({
    hip: [-6, 1],
    ang: 0.06,
    head: [-1, 1],
    headAng: -0.1,
    jaw: 0.5,
    eyes: 'hurt',
    ears: 0.9,
    nearF: foot(NF - 6, 2),
    farF: foot(FF - 5),
    tail: -1,
    scarfAng: 0.3,
    scarfPhase: 2.5
  })
]

const defeat = [
  pose({
    hip: [-3, 1],
    ang: 0.12,
    head: [-4, -2],
    headAng: -0.3,
    jaw: 0.9,
    eyes: 'swirl',
    stars: 0,
    ears: 0.7,
    nearF: foot(NF - 5, 1),
    scarfAng: -0.15,
    scarfPhase: 1
  }),
  pose({
    hip: [-7, 3],
    ang: 0.4,
    head: [-3, -1],
    headAng: -0.3,
    jaw: 0.7,
    eyes: 'swirl',
    stars: 0.1,
    tongue: true,
    ears: 0.8,
    nearF: [82, 90],
    farF: [74, 94],
    nearH: foot(NH - 4),
    farH: foot(FH - 4),
    scarfAng: -0.3,
    scarfPhase: 2.5
  }),
  pose({
    hip: [-1, 19],
    ang: 0.66,
    head: [0, 4],
    headAng: 0.1,
    jaw: 0.5,
    tongue: true,
    eyes: 'swirl',
    stars: 0.2,
    ears: 0.8,
    nearF: [78, 100],
    farF: [70, 102],
    nearH: foot(58),
    farH: foot(48),
    scarfAng: 0.8,
    scarfPhase: 3
  }),
  pose({
    hip: [3, 19],
    ang: 0.7,
    head: [4, 9],
    headAng: 0.5,
    jaw: 0.3,
    tongue: true,
    eyes: 'swirl',
    stars: 0.3,
    ears: 0.9,
    nearF: [76, 100],
    farF: [68, 102],
    nearH: foot(60),
    farH: foot(50),
    scarfAng: 1.1,
    scarfPhase: 4
  }),
  pose({
    hip: [3, 18],
    ang: 0.06,
    head: [6, 8],
    headAng: 0.3,
    jaw: 0.2,
    tongue: true,
    eyes: 'closed',
    stars: 0.4,
    ears: 0.9,
    nearF: foot(NF + 14),
    farF: foot(FF + 10),
    nearH: foot(NH + 2, 3),
    farH: foot(FH + 4, 2),
    scarfAng: 0.45,
    scarfPhase: 5
  }),
  pose({
    hip: [3, 19],
    ang: 0.05,
    head: [0, 7],
    headAng: 0.2,
    jaw: 0.2,
    tongue: true,
    eyes: 'closed',
    stars: 0.5,
    ears: 1,
    nearF: foot(NF + 18),
    farF: foot(FF + 14),
    nearH: foot(NH - 14),
    farH: foot(FH - 10),
    scarfAng: 0.5,
    scarfPhase: 6
  })
]

const draw = (poses: Pose[]) => poses.map(drawWolf)

export const sheets: SheetModule = {
  wolfBoss: () => ({
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
