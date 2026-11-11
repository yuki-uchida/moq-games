/**
 * いたち丞相 (`weaselBoss`): the gang's scheming chancellor, a long, sly weasel in tan with a cream belly, a dark
 * tail tip, narrow smug eyes, a black scholar's cap with red ribbons, a red sash and a feather fan. Upright and
 * dainty when idle; when he attacks he drops to all fours and streaks along the ground as a long, low body.
 *
 * Geometry: the torso is a tapered capsule between a hip point and a shoulder point (both free, so the same
 * code stands, crouches, gallops and lies down); limbs are two-bone chains solved by IK toward foot targets.
 */
import type { SheetModule } from '../../module'
import { C, R } from '../../palette'
import { Painter, Raster, shadeEdges, shadeIndex, type Ramp } from '../../raster'
import { anim } from '../../sheet'

const TAN = R.weaselTan
const FAR = [TAN[1], TAN[2], TAN[3], TAN[3], TAN[4]] as const
const CREAM = R.cream
const DARK = R.darkFur
const RED = R.bandana
const WOOD = R.wood
const PAPER = R.paper
const GOLD = R.gold
const CAP = DARK

type Pt = readonly [number, number]
const RAD = Math.PI / 180

function capsule(l: Raster, a: Pt, b: Pt, ra: number, rb: number, ramp: Ramp, spec = true) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = Math.max(1e-6, dx * dx + dy * dy)
  const rmax = Math.max(ra, rb)
  for (let y = Math.floor(Math.min(a[1], b[1]) - rmax); y <= Math.ceil(Math.max(a[1], b[1]) + rmax); y++)
    for (let x = Math.floor(Math.min(a[0], b[0]) - rmax); x <= Math.ceil(Math.max(a[0], b[0]) + rmax); x++) {
      const px = x + 0.5
      const py = y + 0.5
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2))
      const r = ra + (rb - ra) * t
      const nx = (px - (a[0] + dx * t)) / r
      const ny = (py - (a[1] + dy * t)) / r
      const q = nx * nx + ny * ny
      if (q > 1.0001) continue
      l.set(x, y, ramp[shadeIndex(nx, ny, Math.sqrt(Math.max(0, 1 - q)), spec)])
    }
}

const rotAbout = (p: Pt, c: Pt, deg: number): Pt => {
  const co = Math.cos(deg * RAD)
  const si = Math.sin(deg * RAD)
  return [c[0] + (p[0] - c[0]) * co - (p[1] - c[1]) * si, c[1] + (p[0] - c[0]) * si + (p[1] - c[1]) * co]
}
const dirOf = (deg: number): Pt => [Math.cos(deg * RAD), -Math.sin(deg * RAD)]
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const flat = (pts: readonly Pt[]) => pts.flatMap((p) => [p[0], p[1]])

/** Two-bone IK: the knee of a chain from `a` toward `f` (lengths l1, l2); `bend` +1/-1 picks the side. */
function ik(a: Pt, f: Pt, l1: number, l2: number, bend: 1 | -1): { knee: Pt; foot: Pt } {
  const dx = f[0] - a[0]
  const dy = f[1] - a[1]
  const n = Math.hypot(dx, dy) || 1
  const dist = Math.max(0.5, Math.min(n, l1 + l2 - 0.05))
  const ux = dx / n
  const uy = dy / n
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along))
  const knee: Pt = [a[0] + ux * along + -uy * h * bend, a[1] + uy * along + ux * h * bend]
  return { knee, foot: [a[0] + ux * dist, a[1] + uy * dist] }
}

// ------------------------------------------------------------------------------------------------- pose

export type WeaselEyes = 'smug' | 'open' | 'angry' | 'happy' | 'hurt' | 'swirl' | 'tired'
export type WeaselMouth = 'smirk' | 'open' | 'pant' | 'grit' | 'flat' | 'sneer'

export interface WeaselPose {
  /** Hip and shoulder points (torso axis) and radii. */
  hip: Pt
  sh: Pt
  rHip: number
  rSh: number
  /** Which way the belly faces; defaults to the right-hand side of hip→shoulder. */
  belly?: Pt
  /** Head centre and its pitch (degrees clockwise). */
  head: Pt
  pitch: number
  /** Feet (absolute) of the near and far hind legs, hands of the near and far arms. */
  nearFoot: Pt
  farFoot: Pt
  nearHand: Pt
  farHand: Pt
  /** Tail control points, from the root outward (absolute). */
  tail: readonly Pt[]
  /** Fan: held in the near hand when shown; direction (math degrees) and fan spread (degrees). */
  fan: { show: boolean; ang: number; spread: number }
  /** Cap: offset from its resting place, tilt (cw degrees), ribbon end points (absolute offsets from the cap). */
  cap: { dx: number; dy: number; tilt: number; ribbon: readonly [number, number][] }
  eyes: WeaselEyes
  mouth: WeaselMouth
  sweat: number
  stars: number
  /** The sash is drawn at this fraction along the torso from the hip. */
  sash: number
  /** Dust puffs at the feet (px offsets). */
  dust: readonly Pt[]
}

const DEFAULT_TAIL: Pt[] = [
  [50, 96],
  [38, 106],
  [28, 104],
  [24, 92]
]

export const weaselPose = (p: Partial<WeaselPose> = {}): WeaselPose => ({
  hip: [56, 94],
  sh: [62, 66],
  rHip: 11,
  rSh: 11.5,
  head: [68, 52],
  pitch: 0,
  nearFoot: [66, 118],
  farFoot: [52, 118],
  nearHand: [76, 86],
  farHand: [66, 80],
  tail: DEFAULT_TAIL,
  fan: { show: true, ang: 40, spread: 60 },
  cap: {
    dx: 0,
    dy: 0,
    tilt: 0,
    ribbon: [
      [-14, 8],
      [-12, 15]
    ]
  },
  eyes: 'smug',
  mouth: 'smirk',
  sweat: 0,
  stars: 0,
  sash: 0.28,
  dust: [],
  ...p
})

// ------------------------------------------------------------------------------------------------- parts

const EYE_KEY = { K: C.black, w: C.white, i: C.ink, s: TAN[3] }

const EYE_SHAPES: Record<WeaselEyes, readonly [readonly string[], readonly string[]]> = {
  smug: [
    ['iiiiii', 'sKwKKK', '.sKKK.'],
    ['iiiii', 'sKwKK', '.sKK.']
  ],
  open: [
    ['.KKK.', 'KwwKK', 'KwKKK', 'KKKKK', '.KKK.'],
    ['.KK.', 'KwKK', 'KKKK', 'KKKK', '.KK.']
  ],
  angry: [
    ['ii...', '.iiii', 'KKKKK', 'KwKKK', '.KKK.'],
    ['..ii', 'iiii', 'KKKK', 'KwKK', '.KK.']
  ],
  happy: [
    ['.iii.', 'i...i', '.....'],
    ['.ii.', 'i..i', '....']
  ],
  hurt: [
    ['i....', '.ii..', '...ii', '.ii..', 'i....'],
    ['...i', '.ii.', 'i...', '.ii.', '...i']
  ],
  swirl: [['.....'], ['....']],
  tired: [
    ['sssss', 'KwKKK', '.....'],
    ['ssss', 'KwKK', '....']
  ]
}

/** One frame of いたち丞相. */
export function drawWeasel(pose: WeaselPose): Raster {
  const g = new Painter(128, 128)
  const { hip, sh } = pose
  const sx = sh[0] - hip[0]
  const sy = sh[1] - hip[1]
  const slen = Math.hypot(sx, sy)
  const ux = sx / slen
  const uy = sy / slen
  const belly: Pt = pose.belly ?? [-uy, ux]
  const hp = (u: number, v: number): Pt => {
    const q = rotAbout([pose.head[0] + u, pose.head[1] + v], pose.head, pose.pitch)
    return q
  }

  // tail: one smooth tapering mass (shaded as a whole, so no banding), with a dark tip on top
  g.add(-4, (l) => {
    const t = pose.tail
    const n = t.length - 2
    for (let i = 0; i < n; i++)
      capsule(l, t[i], t[i + 1], mix(8, 5.4, i / n), mix(8, 5.4, (i + 1) / n), [FAR[1], FAR[1], FAR[1], FAR[1], FAR[1]])
    shadeEdges(l, FAR, 2, true)
    const tip = new Raster(l.w, l.h)
    capsule(tip, t[n], t[n + 1], 5.4, 1.6, [DARK[1], DARK[1], DARK[1], DARK[1], DARK[1]])
    shadeEdges(tip, DARK, 1, true)
    l.blit(tip)
  })

  // far limbs
  const hipJoint: Pt = [hip[0] + ux * 2 + belly[0] * 3, hip[1] + uy * 2 + belly[1] * 3]
  const shJoint: Pt = [sh[0] - ux * 4 + belly[0] * 3, sh[1] - uy * 4 + belly[1] * 3]
  const limb = (
    l: Raster,
    from: Pt,
    to: Pt,
    l1: number,
    l2: number,
    bend: 1 | -1,
    ramp: Ramp,
    far: boolean,
    hind: boolean
  ) => {
    const { knee, foot } = ik(from, to, l1, l2, bend)
    if (hind) {
      // haunch: a big rounded thigh, then a lean shin
      capsule(l, from, from, 7.4, 7.4, ramp)
      capsule(l, from, knee, 6.8, 3.6, ramp)
      capsule(l, knee, foot, 3.4, 2.2, ramp)
    } else {
      capsule(l, from, knee, 4.6, 3.2, ramp)
      capsule(l, knee, foot, 3.2, 2.1, ramp)
    }
    // paw with toes
    capsule(l, [foot[0] - 1, foot[1]], [foot[0] + 3, foot[1] + (far ? 0.5 : 1)], 3, 2.5, far ? FAR : TAN)
    for (const dx of [3, 5])
      for (const dy of [0, 1]) {
        const x = Math.round(foot[0] + dx)
        const y = Math.round(foot[1] + dy)
        if (l.get(x, y)) l.set(x, y, ramp[2])
      }
    return foot
  }
  g.add(-3, (l) => limb(l, [hipJoint[0] - 3, hipJoint[1]], pose.farFoot, 14, 14, -1, FAR, true, true))
  g.add(-3, (l) => limb(l, shJoint, pose.farHand, 15, 15, 1, FAR, true, false))

  // torso: cream belly, red sash
  g.add(0, (l) => {
    capsule(l, hip, sh, pose.rHip, pose.rSh, TAN)
    // a supple neck carries the back's curve up into the head
    capsule(l, sh, [pose.head[0] - 3, pose.head[1] + 5], pose.rSh * 0.78, 6.6, TAN)
    const inside = (px: number, py: number) => {
      const t = Math.max(0, Math.min(1, ((px - hip[0]) * ux + (py - hip[1]) * uy) / slen))
      const cx = hip[0] + ux * slen * t
      const cy = hip[1] + uy * slen * t
      const r = mix(pose.rHip, pose.rSh, t)
      return ((px - cx) * belly[0] + (py - cy) * belly[1]) / r
    }
    for (let y = 0; y < l.h; y++)
      for (let x = 0; x < l.w; x++) {
        const c = l.get(x, y)
        if (!c) continue
        const i = TAN.indexOf(c)
        if (i < 0) continue
        const side = inside(x + 0.5, y + 0.5)
        const along = ((x + 0.5 - hip[0]) * ux + (y + 0.5 - hip[1]) * uy) / slen
        if (Math.abs(along - pose.sash) * slen < 2.6) l.set(x, y, RED[Math.min(i, 3)])
        else if (side > 0.04) l.set(x, y, CREAM[Math.min(i, 2)])
      }
  })

  // near hind leg, then the head (its parts), cap, near arm and fan
  g.add(0.5, (l) => limb(l, hipJoint, pose.nearFoot, 14, 14, -1, TAN, false, true))

  // head: round skull with a long snout
  const snout = hp(13, 4)
  g.add(0.8, (l) => {
    // far ear
    const e = hp(0, -9)
    capsule(l, e, [e[0] - 1, e[1] - 4], 3.4, 2.6, FAR)
  })
  g.add(1, (l) => {
    capsule(l, pose.head, snout, 10.5, 5.6, TAN)
    // cream muzzle and chin
    for (let y = 0; y < l.h; y++)
      for (let x = 0; x < l.w; x++) {
        const c = l.get(x, y)
        const i = TAN.indexOf(c)
        if (i < 0) continue
        const p = rotAbout([x + 0.5, y + 0.5], pose.head, -pose.pitch)
        const u = p[0] - pose.head[0]
        const v = p[1] - pose.head[1]
        if (u > 5 && v > 0.5) l.set(x, y, CREAM[i])
        else if (v > 6 && u > -3) l.set(x, y, CREAM[i])
      }
  })
  g.add(1.1, (l) => {
    const e = hp(-5, -8)
    capsule(l, e, [e[0] - 1, e[1] - 4], 4, 3, TAN)
    const inner = hp(-5, -9)
    l.ellipse(inner[0], inner[1] - 1, 1.6, 2, R.hamEar[2])
  })
  // face
  g.add(
    1.2,
    (l) => {
      const near = hp(2, -3)
      const far = hp(10, -3)
      const kind = pose.eyes
      const rot = (p: Pt) => p
      if (kind === 'swirl') {
        for (const [c, r] of [
          [near, 3.4],
          [far, 2.8]
        ] as const) {
          l.ring(rot(c)[0], rot(c)[1], 0.8, r, C.black)
          l.ring(rot(c)[0], rot(c)[1], 1.5, 2.2, GOLD[0])
          l.set(c[0], c[1], C.black)
        }
      } else {
        const [a, b] = EYE_SHAPES[kind]
        l.stamp(a, near[0] - 2, near[1] - 2, EYE_KEY)
        l.stamp(b, far[0] - 2, far[1] - 2, EYE_KEY)
      }
      // brow for the smug look: one raised, one lowered
      if (kind === 'smug' || kind === 'angry') {
        const b0 = hp(-1, -6.5)
        const b1 = hp(5, kind === 'angry' ? -4.5 : -7.5)
        l.line(b0[0], b0[1], b1[0], b1[1], TAN[3])
      }
      // nose on the snout tip, whiskers
      const n = hp(15, 2.5)
      l.rect(n[0] - 1, n[1] - 1, 3, 3, C.ink)
      l.set(n[0] - 1, n[1] - 1, TAN[1])
      l.line(hp(10, 4)[0], hp(10, 4)[1] + 0, hp(21, 3)[0], hp(21, 3)[1], CREAM[0])
      l.line(hp(10, 6)[0], hp(10, 6)[1], hp(20, 8)[0], hp(20, 8)[1], CREAM[0])
      // mouth
      const m = hp(10, 8)
      const mp = pose.mouth
      if (mp === 'smirk') {
        l.line(m[0] - 4, m[1], m[0] + 1, m[1] + 1, C.ink)
        l.line(m[0] + 1, m[1] + 1, m[0] + 4, m[1] - 1, C.ink)
      } else if (mp === 'sneer') {
        l.line(m[0] - 5, m[1], m[0] + 1, m[1] + 2, C.ink)
        l.line(m[0] + 1, m[1] + 2, m[0] + 5, m[1] - 2, C.ink)
        l.set(m[0] + 1, m[1] + 3, C.white)
        l.set(m[0] + 2, m[1] + 3, C.white)
      } else if (mp === 'flat') l.rect(m[0] - 3, m[1], 7, 1, C.ink)
      else if (mp === 'grit') {
        l.rect(m[0] - 4, m[1] - 1, 9, 3, C.ink)
        l.rect(m[0] - 3, m[1], 7, 1, C.white)
      } else {
        l.ellipse(m[0], m[1] + 1.5, 4, mp === 'open' ? 3.6 : 2.6, C.mouth)
        l.rect(m[0] - 1, m[1] - 1, 3, 1, C.white)
        if (mp === 'pant') l.rect(m[0] - 1, m[1] + 2, 4, 3, C.tongue)
      }
      // cheek blush
      const ch = hp(-1, 4)
      l.ellipse(ch[0], ch[1], 2.4, 1.6, C.blush)
    },
    false
  )

  // scholar's cap: a black box hat with a red band, ribbons streaming behind
  const capC: Pt = [pose.head[0] - 4 + pose.cap.dx, pose.head[1] - 16 + pose.cap.dy]
  const cp = (u: number, v: number): Pt => rotAbout([capC[0] + u, capC[1] + v], capC, pose.cap.tilt)
  g.add(1.3, (l) => {
    for (const [a, b] of pose.cap.ribbon) {
      const s = cp(-8, 5)
      capsule(l, s, [s[0] + a, s[1] + b], 2.6, 1.6, RED)
    }
  })
  g.add(1.35, (l) => {
    l.poly(flat([cp(-13, 9), cp(-13, 6), cp(-9, 5), cp(-8, -6), cp(8, -6), cp(9, 5), cp(13, 6), cp(13, 9)]), CAP[1])
    // lit top-left rim, glint on the front, shade down the right and the underside of the brim
    const src = l.clone()
    for (let y = 0; y < l.h; y++)
      for (let x = 0; x < l.w; x++) {
        if (src.get(x, y) !== CAP[1]) continue
        if (!src.get(x + 1, y) || !src.get(x + 2, y) || !src.get(x, y + 1)) l.set(x, y, CAP[2])
        else if (!src.get(x - 1, y) || !src.get(x, y - 1) || !src.get(x - 1, y - 1)) l.set(x, y, CAP[0])
      }
    const g0 = cp(-5, -3)
    const g1 = cp(-5, 1)
    l.line(Math.round(g0[0]), Math.round(g0[1]), Math.round(g1[0]), Math.round(g1[1]), CAP[0])
    // red band and a gold button
    l.poly(flat([cp(-11, 3.5), cp(-10, 6), cp(11, 6), cp(11.5, 3.5)]), RED[1])
    l.line(cp(-11, 6)[0], cp(-11, 6)[1], cp(11, 6)[0], cp(11, 6)[1], RED[2])
    const b = cp(0, -7)
    l.rect(b[0] - 1, b[1] - 1, 3, 2, GOLD[1])
  })

  // near arm and the fan in its paw
  g.add(1.4, (l) => {
    if (!pose.fan.show) return
    const h = pose.nearHand
    const d = dirOf(pose.fan.ang)
    const tip: Pt = [h[0] + d[0] * 8, h[1] + d[1] * 8]
    capsule(l, h, tip, 1.8, 1.8, WOOD)
    const n = Math.max(1, Math.round(pose.fan.spread / 12))
    // feathers: pointed blades of alternating length, each with a quill
    for (let k = n; k >= 0; k--) {
      const a = pose.fan.ang + (k / n - 0.5) * pose.fan.spread
      const dd = dirOf(a)
      const len = (k % 2 ? 15 : 18) - Math.abs(k / n - 0.5) * 4
      const end: Pt = [tip[0] + dd[0] * len, tip[1] + dd[1] * len]
      capsule(l, tip, end, 3.1, 1.9, PAPER, false)
      const q0: Pt = [tip[0] + dd[0] * 3, tip[1] + dd[1] * 3]
      const q1: Pt = [tip[0] + dd[0] * (len - 2), tip[1] + dd[1] * (len - 2)]
      l.line(Math.round(q0[0]), Math.round(q0[1]), Math.round(q1[0]), Math.round(q1[1]), PAPER[2])
    }
    l.thick(tip[0], tip[1], tip[0] + d[0] * 6, tip[1] + d[1] * 6, 2.4, RED[1])
  })
  g.add(1.5, (l) => limb(l, shJoint, pose.nearHand, 15, 15, 1, TAN, false, false))

  if (pose.sweat > 0)
    g.add(2, (l) => {
      for (const [u, v] of [
        [-8, -14],
        [14, -12]
      ] as const) {
        const p = hp(u, v - pose.sweat * 2)
        l.stamp(['.b.', 'bwb', 'bbb', '.b.'], p[0] - 1, p[1] - 2, { b: R.water[1], w: R.water[0] })
      }
    })
  if (pose.stars > 0)
    g.add(2, (l) => {
      for (let i = 0; i < 3; i++) {
        const a = pose.stars * 90 + i * 120
        const c = [capC[0] + Math.cos(a * RAD) * 16, capC[1] - 8 + Math.sin(a * RAD) * 4] as const
        l.stamp(['.y.', 'yYy', '.y.'], c[0] - 1, c[1] - 1, { y: GOLD[1], Y: GOLD[0] })
      }
    })
  for (const [dx, dy] of pose.dust)
    g.add(-6, (l) => {
      l.ellipse(dx, dy, 4, 3, R.dust[1])
      l.ellipse(dx - 1, dy - 1, 2, 1.6, R.dust[0])
    })
  return g.render()
}

// ------------------------------------------------------------------------------------------------- clips

const noFan = { show: false, ang: 0, spread: 0 }
const frames = (list: Partial<WeaselPose>[]) => list.map((p) => drawWeasel(weaselPose(p)))
/** Moves a whole clip sideways together so no frame touches the frame edge (a clip keeps its relative motion). */
const fit = (fs: Raster[]) => {
  const bs = fs.map((f) => f.bounds()!)
  const left = Math.min(...bs.map((b) => b.x))
  const right = Math.max(...bs.map((b) => b.x + b.w - 1))
  const dx = left < 2 ? 2 - left : right > 125 ? 125 - right : 0
  return dx ? fs.map((f) => f.shifted(dx, 0)) : fs
}
const rib = (...r: [number, number][]) => r

/** Tail curling up behind the standing weasel. */
const curl = (phase: number): Pt[] => [
  [51, 97],
  [41, 108 + phase],
  [31, 107],
  [26, 96 - phase],
  [30, 85 - phase * 2]
]

const idle = [0, 1, 2, 3].map((i) => {
  const b = [0, 0.5, 1, 0.5][i]
  const ph = [0, 1, 2, 1][i]
  return drawWeasel(
    weaselPose({
      hip: [56, 94 + b * 0.5],
      sh: [62, 66 + b * 0.8],
      head: [68 + b * 0.4, 52 + b * 0.5],
      pitch: [0, -2, -4, -2][i],
      nearHand: [75 + [0, 1, 2, 1][i], 86],
      tail: curl(ph),
      fan: { show: true, ang: [40, 28, 16, 28][i], spread: [60, 74, 56, 74][i] },
      cap: { dx: 0, dy: 0, tilt: 0, ribbon: rib([-13 + b, 8 + ph], [-11, 14 - ph]) }
    })
  )
})

const intro = frames([
  { nearHand: [76, 86], fan: { show: true, ang: 30, spread: 74 }, tail: curl(1), head: [67, 52], pitch: -4 },
  {
    sh: [61, 66],
    nearHand: [72, 76],
    fan: { show: true, ang: 70, spread: 8 },
    eyes: 'open',
    mouth: 'flat',
    tail: curl(2),
    cap: { dx: 0, dy: -2, tilt: 0, ribbon: rib([-12, 12], [-10, 18]) }
  },
  {
    sh: [66, 67],
    head: [73, 52],
    pitch: 4,
    nearHand: [87, 70],
    fan: { show: true, ang: 14, spread: 8 },
    eyes: 'angry',
    mouth: 'sneer',
    tail: curl(0),
    cap: { dx: 1, dy: 0, tilt: 3, ribbon: rib([-14, 6], [-12, 11]) }
  },
  {
    sh: [66, 66],
    head: [73, 51],
    pitch: -6,
    nearHand: [88, 70],
    fan: { show: true, ang: 18, spread: 8 },
    eyes: 'happy',
    mouth: 'sneer',
    tail: curl(2),
    cap: { dx: 0, dy: 0, tilt: -3, ribbon: rib([-14, 9], [-12, 14]) }
  }
])

/** Low, long poses on all fours. */
const quadTail = (x: number, y: number, rise: number): Pt[] => [
  [x, y],
  [x - 7, y - 2 - rise * 0.3],
  [x - 14, y - 4 - rise * 0.8],
  [x - 20, y - 8 - rise],
  [x - 24, y - 12 - rise * 1.2]
]
const dash: Partial<WeaselPose> = { fan: noFan, eyes: 'angry', mouth: 'grit', rHip: 10, rSh: 11, sash: 0.3 }
const dashCap = (flutter: number) => ({
  dx: -4,
  dy: 5,
  tilt: -22,
  ribbon: rib([-24, -3 + flutter], [-22, 4 - flutter])
})

const windup = fit(
  frames([
    {
      ...dash,
      mouth: 'smirk',
      hip: [44, 90],
      sh: [66, 78],
      head: [80, 74],
      pitch: 8,
      nearHand: [84, 100],
      farHand: [78, 104],
      nearFoot: [52, 119],
      farFoot: [42, 119],
      tail: quadTail(38, 92, 8),
      cap: { dx: 1, dy: 3, tilt: 6, ribbon: rib([-12, 12], [-10, 18]) }
    },
    {
      ...dash,
      hip: [34, 84],
      sh: [72, 96],
      head: [87, 96],
      pitch: 12,
      nearHand: [92, 119],
      farHand: [80, 119],
      nearFoot: [30, 119],
      farFoot: [42, 114],
      tail: quadTail(28, 84, 16),
      cap: { dx: 2, dy: 3, tilt: 10, ribbon: rib([-10, 12], [-8, 18]) }
    },
    {
      ...dash,
      hip: [32, 80],
      sh: [74, 100],
      head: [88, 100],
      pitch: 14,
      nearHand: [96, 119],
      farHand: [84, 119],
      nearFoot: [22, 118],
      farFoot: [40, 108],
      tail: quadTail(26, 80, 22),
      cap: { dx: 2, dy: 3, tilt: 12, ribbon: rib([-8, 14], [-6, 20]) }
    }
  ])
)

const attack = fit(
  frames([
    // gather: back arched, all four feet bunched under the body
    {
      ...dash,
      hip: [42, 90],
      sh: [76, 96],
      head: [91, 92],
      pitch: 6,
      nearHand: [84, 119],
      farHand: [72, 118],
      nearFoot: [52, 119],
      farFoot: [40, 118],
      tail: quadTail(34, 92, 4),
      cap: dashCap(0),
      dust: [[26, 120]]
    },
    // push off: hind legs drive, forelegs reach
    {
      ...dash,
      hip: [32, 96],
      sh: [80, 93],
      head: [96, 89],
      pitch: 8,
      nearHand: [106, 108],
      farHand: [98, 114],
      nearFoot: [14, 117],
      farFoot: [26, 119],
      tail: quadTail(24, 98, 0),
      cap: dashCap(3),
      dust: [
        [10, 120],
        [20, 121]
      ]
    },
    // extension: stretched out, airborne
    {
      ...dash,
      hip: [28, 90],
      sh: [84, 88],
      head: [100, 84],
      pitch: 6,
      nearHand: [110, 104],
      farHand: [106, 96],
      nearFoot: [6, 104],
      farFoot: [8, 112],
      tail: quadTail(20, 92, -2),
      cap: dashCap(-3)
    },
    // landing: forelegs plant, hips swing forward
    {
      ...dash,
      hip: [38, 88],
      sh: [78, 98],
      head: [93, 95],
      pitch: 10,
      nearHand: [98, 119],
      farHand: [88, 118],
      nearFoot: [56, 116],
      farFoot: [46, 119],
      tail: quadTail(30, 90, 6),
      cap: dashCap(2),
      dust: [[100, 121]]
    }
  ])
)

const seated = (wob: number, ph: number, mouth: WeaselMouth): Partial<WeaselPose> => ({
  hip: [50, 107],
  sh: [57 + wob, 80],
  rHip: 12,
  head: [63 + wob * 1.6, 65],
  pitch: wob * 3,
  nearFoot: [77, 119],
  farFoot: [66, 120],
  nearHand: [71, 102],
  farHand: [62, 104],
  tail: [
    [44, 110],
    [32, 115],
    [20, 113],
    [11, 106],
    [8, 98]
  ],
  fan: noFan,
  eyes: 'swirl',
  mouth,
  stars: ph,
  sash: 0.2,
  cap: { dx: wob * 2, dy: 2, tilt: 24 + wob * 3, ribbon: rib([-9, 14 + wob], [-7, 19]) }
})
const stunned = frames([
  seated(-2, 0, 'open'),
  seated(0, 0.25, 'flat'),
  seated(2, 0.5, 'open'),
  seated(0, 0.75, 'pant')
])

const recover = frames([
  {
    hip: [54, 95],
    sh: [65, 71],
    head: [73, 60],
    pitch: 10,
    nearHand: [70, 96],
    farHand: [60, 102],
    nearFoot: [66, 118],
    farFoot: [50, 118],
    fan: { show: true, ang: -35, spread: 24 },
    eyes: 'tired',
    mouth: 'pant',
    tail: [
      [48, 98],
      [38, 108],
      [28, 112],
      [20, 110],
      [14, 104]
    ],
    cap: { dx: 1, dy: 2, tilt: 8, ribbon: rib([-11, 12], [-9, 18]) }
  },
  {
    hip: [54, 96],
    sh: [66, 74],
    head: [74, 63],
    pitch: 14,
    nearHand: [70, 97],
    farHand: [60, 103],
    nearFoot: [66, 118],
    farFoot: [50, 118],
    fan: { show: true, ang: -28, spread: 30 },
    eyes: 'tired',
    mouth: 'pant',
    sweat: 1,
    tail: [
      [48, 99],
      [38, 109],
      [28, 113],
      [19, 112],
      [12, 107]
    ],
    cap: { dx: 1, dy: 3, tilt: 10, ribbon: rib([-10, 14], [-8, 20]) }
  }
])

const hit = {
  hip: [58, 94],
  sh: [54, 66],
  head: [60, 52],
  pitch: -14,
  nearHand: [80, 66],
  farHand: [68, 70],
  fan: { show: true, ang: 30, spread: 60 },
  eyes: 'hurt',
  mouth: 'open',
  cap: { dx: -3, dy: -2, tilt: -12, ribbon: rib([-14, 2], [-12, 8]) }
} satisfies Partial<WeaselPose>

const hurt = frames([
  { ...hit, nearFoot: [64, 119], farFoot: [48, 119], tail: curl(2) },
  {
    ...hit,
    hip: [56, 93],
    sh: [48, 67],
    head: [53, 54],
    pitch: -20,
    nearHand: [70, 54],
    farHand: [62, 62],
    nearFoot: [60, 114],
    farFoot: [44, 119],
    fan: noFan,
    tail: curl(0),
    cap: { dx: -6, dy: -4, tilt: -22, ribbon: rib([-15, -2], [-13, 4]) }
  }
])

const defeat = fit(
  frames([
    { ...hit, tail: curl(1) },
    {
      hip: [60, 96],
      sh: [46, 70],
      head: [50, 58],
      pitch: -24,
      nearHand: [66, 56],
      farHand: [44, 58],
      nearFoot: [68, 114],
      farFoot: [54, 119],
      fan: noFan,
      eyes: 'swirl',
      mouth: 'open',
      stars: 0.1,
      tail: curl(2),
      cap: { dx: -6, dy: -4, tilt: -26, ribbon: rib([-15, -2], [-13, 4]) }
    },
    {
      hip: [70, 100],
      sh: [38, 82],
      head: [28, 72],
      pitch: -50,
      nearHand: [50, 60],
      farHand: [28, 56],
      nearFoot: [88, 104],
      farFoot: [80, 110],
      fan: noFan,
      eyes: 'swirl',
      mouth: 'open',
      tail: [
        [76, 103],
        [88, 108],
        [98, 104],
        [104, 94],
        [102, 84]
      ],
      cap: { dx: -8, dy: -2, tilt: -45, ribbon: rib([-14, -6], [-12, 0]) }
    },
    {
      hip: [84, 108],
      sh: [44, 100],
      head: [30, 94],
      pitch: -66,
      nearHand: [58, 84],
      farHand: [42, 88],
      nearFoot: [98, 84],
      farFoot: [90, 92],
      fan: noFan,
      eyes: 'swirl',
      mouth: 'open',
      tail: [
        [90, 110],
        [102, 112],
        [110, 106],
        [112, 96],
        [108, 88]
      ],
      cap: { dx: -8, dy: 0, tilt: -52, ribbon: rib([-12, -4], [-10, 2]) }
    },
    {
      hip: [84, 105],
      sh: [43, 104],
      head: [29, 99],
      pitch: -72,
      nearHand: [58, 92],
      farHand: [42, 98],
      nearFoot: [99, 92],
      farFoot: [92, 100],
      fan: noFan,
      eyes: 'swirl',
      mouth: 'pant',
      tail: [
        [90, 108],
        [102, 111],
        [110, 108],
        [113, 100],
        [111, 92]
      ],
      cap: { dx: -9, dy: 2, tilt: -55, ribbon: rib([-12, -2], [-10, 4]) }
    },
    {
      hip: [84, 107],
      sh: [43, 108],
      head: [29, 104],
      pitch: -78,
      nearHand: [62, 100],
      farHand: [46, 102],
      nearFoot: [101, 100],
      farFoot: [94, 104],
      fan: noFan,
      eyes: 'swirl',
      mouth: 'pant',
      tail: [
        [90, 110],
        [102, 113],
        [110, 110],
        [114, 104],
        [113, 98]
      ],
      cap: { dx: -10, dy: 4, tilt: -58, ribbon: rib([-11, 2], [-9, 7]) }
    }
  ])
)

export const sheets: SheetModule = {
  weaselBoss: () => ({
    idle: anim(idle, 6, true),
    intro: anim(intro, 8, false),
    windup: anim(windup, 10, false),
    attack: anim(attack, 14, true),
    stunned: anim(stunned, 8, true),
    recover: anim(recover, 6, true),
    hurt: anim(hurt, 12, false),
    defeat: anim(defeat, 8, false)
  })
}
