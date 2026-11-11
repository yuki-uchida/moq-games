/**
 * カラス助 (`crowBoss`): the gang's swaggering crow captain, a big navy crow with a lighter chest, a hooked yellow
 * beak, an eye patch, a red bandana knotted at the neck and a fan of tail feathers. He never lands: he hovers,
 * then dives. Pose-parametric like the hero: one draw function, every clip is a list of poses.
 *
 * Geometry: the body is a tapered capsule whose axis can tilt (dive, rear back, spin); head, tail, legs and
 * bandana hang off that axis. Wings are an arm plus a fan of overlapping feathers pointing in absolute screen
 * directions (degrees counter-clockwise from +x), so the same code makes a flap, a spread and a swept-back dive.
 */
import type { SheetModule } from '../../module'
import { C, R, ramp } from '../../palette'
import { Painter, Raster, shadeIndex, type Ramp } from '../../raster'
import { lazyAnim, memo } from '../../sheet'

const NAVY = R.crowBlue
const FAR = [NAVY[1], NAVY[2], NAVY[3], NAVY[3], NAVY[4]] as const
const BEAK = R.beak
const RED = R.bandana
const GOLD = R.gold
/** The lighter chest and belly. */
const CHEST = ramp('#dfe4f8', '#aab4dc', '#7d88b8', '#555f90', '#0e0f1e')

// ----------------------------------------------------------------------------------------------- helpers

type Pt = readonly [number, number]
const RAD = Math.PI / 180

/** A tapered capsule shaded like a lit tube (ra at a, rb at b). */
function capsule(l: Raster, a: Pt, b: Pt, ra: number, rb: number, ramp: Ramp, spec = true) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = Math.max(1e-6, dx * dx + dy * dy)
  const rmax = Math.max(ra, rb)
  const x0 = Math.floor(Math.min(a[0], b[0]) - rmax)
  const x1 = Math.ceil(Math.max(a[0], b[0]) + rmax)
  const y0 = Math.floor(Math.min(a[1], b[1]) - rmax)
  const y1 = Math.ceil(Math.max(a[1], b[1]) + rmax)
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2))
      const cx = a[0] + dx * t
      const cy = a[1] + dy * t
      const r = ra + (rb - ra) * t
      const nx = (px - cx) / r
      const ny = (py - cy) / r
      const q = nx * nx + ny * ny
      if (q > 1.0001) continue
      l.set(x, y, ramp[shadeIndex(nx, ny, Math.sqrt(Math.max(0, 1 - q)), spec)])
    }
}

/** A shaded ball (ellipse) via the capsule shader. */
const blob = (l: Raster, c: Pt, rx: number, ry: number, ramp: Ramp, spec = true) => {
  // capsule is round, so squash through a short axis capsule only when radii differ a lot
  if (Math.abs(rx - ry) < 0.6) return capsule(l, c, c, rx, rx, ramp, spec)
  for (let y = Math.floor(c[1] - ry); y <= Math.ceil(c[1] + ry); y++)
    for (let x = Math.floor(c[0] - rx); x <= Math.ceil(c[0] + rx); x++) {
      const nx = (x + 0.5 - c[0]) / rx
      const ny = (y + 0.5 - c[1]) / ry
      const q = nx * nx + ny * ny
      if (q > 1.0001) continue
      l.set(x, y, ramp[shadeIndex(nx, ny, Math.sqrt(Math.max(0, 1 - q)), spec)])
    }
}

const rotAbout = (p: Pt, c: Pt, deg: number): Pt => {
  const co = Math.cos(deg * RAD)
  const si = Math.sin(deg * RAD)
  const dx = p[0] - c[0]
  const dy = p[1] - c[1]
  return [c[0] + dx * co - dy * si, c[1] + dx * si + dy * co]
}

/** Unit vector for a math angle (degrees CCW from +x, y up on screen). */
const dir = (deg: number): Pt => [Math.cos(deg * RAD), -Math.sin(deg * RAD)]
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** Paints only where the layer has pixels. */
function recolor(l: Raster, inside: (x: number, y: number) => boolean, from: Ramp, to: Ramp) {
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++) {
      const c = l.get(x, y)
      if (!c || !inside(x + 0.5, y + 0.5)) continue
      const i = from.indexOf(c)
      if (i >= 0) l.set(x, y, to[i])
    }
}

// ------------------------------------------------------------------------------------------------- pose

export type CrowEye = 'open' | 'wide' | 'glint' | 'hurt' | 'swirl' | 'tired'

interface WingPose {
  /** Direction the wing points (degrees CCW from +x). */
  a: number
  /** Arm length (px). */
  len: number
  /** 0 spread feather fan, 1 feathers laid along the arm (folded). */
  fold: number
}

export interface CrowPose {
  /** Body centre. */
  x: number
  y: number
  /** Body axis rotation, degrees clockwise (positive = beak down). */
  tilt: number
  /** Extra head pitch, degrees clockwise. */
  head: number
  nw: WingPose
  fw: WingPose
  /** Lower jaw drop (degrees). */
  beak: number
  tongue: number
  eye: CrowEye
  /** Legs: direction relative to the body axis (math degrees, 270 = along the body) and length. */
  legAng: number
  legLen: number
  /** Tail fan spread (degrees) and droop. */
  tail: number
  /** Bandana tails: vertical flutter (px). */
  scarf: number
  /** Ruffled crest tufts, 0..1. */
  puff: number
  sweat: number
  /** Loose feathers: x, y, direction. */
  flies: readonly (readonly [number, number, number])[]
}

const wing = (a: number, len = 23, fold = 0): WingPose => ({ a, len, fold })

export const crowPose = (p: Partial<CrowPose> = {}): CrowPose => ({
  x: 60,
  y: 82,
  tilt: 0,
  head: 0,
  nw: wing(180),
  fw: wing(0),
  beak: 0,
  tongue: 0,
  eye: 'open',
  legAng: 268,
  legLen: 8,
  tail: 0,
  scarf: 0,
  puff: 0,
  sweat: 0,
  flies: [],
  ...p
})

// ------------------------------------------------------------------------------------------------- parts

/** One wing: feathers fan from the arm's trailing side; the arm and coverts sit on top. */
function drawWing(g: Painter, depth: number, s: Pt, w: WingPose, ramp: Ramp, near: boolean) {
  const d = dir(w.a)
  const p1: Pt = [-d[1], d[0]]
  const p2: Pt = [d[1], -d[0]]
  let n = p1[1] > p2[1] ? p1 : p2
  if (Math.abs(p1[1] - p2[1]) < 0.25) n = (near ? p1[0] < p2[0] : p1[0] > p2[0]) ? p1 : p2
  const tip: Pt = [s[0] + d[0] * w.len, s[1] + d[1] * w.len]
  // the leading edge bows away from the feathers: a curved wing, not a rod
  const bow = 4.2 * (1 - w.fold * 0.4)
  const mid: Pt = [s[0] + d[0] * w.len * 0.5 - n[0] * bow, s[1] + d[1] * w.len * 0.5 - n[1] * bow]
  const along = (t: number): Pt => {
    // point on the bowed arm (quadratic through s, mid, tip)
    const u = 1 - t
    return [
      u * u * s[0] + 2 * u * t * (2 * mid[0] - (s[0] + tip[0]) / 2) + t * t * tip[0],
      u * u * s[1] + 2 * u * t * (2 * mid[1] - (s[1] + tip[1]) / 2) + t * t * tip[1]
    ]
  }
  // flight feathers: long primaries fanning from the wrist, shorter secondaries towards the body
  const N = 8
  for (let k = N - 1; k >= 0; k--) {
    const u = k / (N - 1)
    const t = 0.3 + 0.7 * u
    const phi = mix(mix(8, 66, u), 90, w.fold) * RAD
    const fx = n[0] * Math.cos(phi) + d[0] * Math.sin(phi)
    const fy = n[1] * Math.cos(phi) + d[1] * Math.sin(phi)
    const hyp = Math.hypot(fx, fy)
    const L = mix(18 + u * 6, 17 + w.len * 0.4 + u * 4, w.fold)
    const b = along(t)
    const e: Pt = [b[0] + (fx / hyp) * L, b[1] + (fy / hyp) * L]
    g.add(depth - 0.01 * (N - k), (l) => capsule(l, b, e, 4.6, 1.9, ramp))
  }
  // broad root, narrowing to the wrist
  g.add(depth + 0.05, (l) => {
    capsule(l, s, mid, 7.6, 4.4, ramp)
    capsule(l, mid, tip, 4.4, 2.3, ramp)
  })
  // two rows of short coverts over the root of the flight feathers
  for (let k = 0; k < 5; k++) {
    const t = 0.1 + k * 0.17
    const b = along(t)
    const sh = mix(12, 8, k / 4) * (1 - w.fold * 0.3)
    const e: Pt = [b[0] + n[0] * sh + d[0] * 3, b[1] + n[1] * sh + d[1] * 3]
    g.add(depth + 0.06, (l) => capsule(l, b, e, 4.4, 2.2, ramp))
  }
  for (let k = 0; k < 4; k++) {
    const t = 0.06 + k * 0.2
    const b = along(t)
    const e: Pt = [b[0] + n[0] * 5 + d[0] * 2, b[1] + n[1] * 5 + d[1] * 2]
    g.add(depth + 0.07, (l) => capsule(l, b, e, 3.6, 2, ramp))
  }
}

const EYE_KEY = { K: C.black, w: C.white, y: GOLD[1], Y: GOLD[2], h: GOLD[0] }

/** The good eye: a yellow iris with a dark pupil and one highlight; it must read against the navy head. */
function goodEye(l: Raster, c: Pt, kind: CrowEye, ang: number) {
  const x = Math.round(c[0])
  const y = Math.round(c[1])
  switch (kind) {
    case 'open':
    case 'glint':
    case 'wide': {
      const wide = kind === 'wide'
      l.stamp(
        wide
          ? ['.hyyh.', 'hyyyyy', 'yywwwy', 'yyKKwy', 'yyKKyy', 'yyKKyy', 'yYKKYy', '.YyyY.']
          : ['.hyy.', 'hyyyy', 'yyKwy', 'yyKKy', 'yyKKy', 'yYKKY', '.YYY.'],
        x - (wide ? 3 : 2),
        y - (wide ? 4 : 3),
        EYE_KEY
      )
      if (kind === 'glint') {
        // a hard four-point star glint in front of the eye
        const gx = x - 3
        const gy = y - 4
        l.rect(gx - 1, gy, 3, 1, C.white)
        l.rect(gx, gy - 1, 1, 3, C.white)
        l.set(gx - 2, gy, GOLD[0])
        l.set(gx + 2, gy, GOLD[0])
        l.set(gx, gy - 2, GOLD[0])
        l.set(gx, gy + 2, GOLD[0])
      }
      break
    }
    case 'tired':
      // heavy lid over a half-hidden iris
      l.stamp(['NNNNN', 'NNNNN', 'yKwyy', 'yKKyy', '.YYY.'], x - 2, y - 2, { ...EYE_KEY, N: NAVY[2] })
      l.rect(x - 2, y - 1, 5, 1, C.black)
      break
    case 'hurt':
      // pained > chevron
      l.stamp(['ww...', '.ww..', '..ww.', '.ww..', 'ww...'], x - 2, y - 2, EYE_KEY)
      break
    case 'swirl':
      l.ring(x + 0.5, y + 0.5, 0.8, 3.4, GOLD[1])
      l.ring(x + 0.5, y + 0.5, 1.6, 2.4, C.black)
      l.set(x, y, C.black)
      l.set(x + 1, y - 2, GOLD[0])
      break
  }
  void ang
}

/** One loose feather. */
function looseFeather(l: Raster, x: number, y: number, a: number) {
  const d = dir(a)
  capsule(l, [x - d[0] * 4, y - d[1] * 4], [x + d[0] * 4, y + d[1] * 4], 1.8, 1.1, NAVY)
}

/** One frame of カラス助. */
export function drawCrow(pose: CrowPose): Raster {
  const g = new Painter(128, 128)
  const { x, y, tilt } = pose
  const co = Math.cos(tilt * RAD)
  const si = Math.sin(tilt * RAD)
  /** Body-local (u right, v down) to frame coordinates. */
  const P = (u: number, v: number): Pt => [x + u * co - v * si, y + u * si + v * co]
  /** Frame coordinates back to body-local. */
  const inv = (px: number, py: number): Pt => [(px - x) * co + (py - y) * si, -(px - x) * si + (py - y) * co]
  const neck = P(2, -8)
  const H = rotAbout(P(10, -19), neck, pose.head)
  const hang = tilt + pose.head
  const HP = (u: number, v: number): Pt => {
    const c = Math.cos(hang * RAD)
    const s = Math.sin(hang * RAD)
    return [H[0] + u * c - v * s, H[1] + u * s + v * c]
  }
  const shoulderN = P(-6, -10)
  const shoulderF = P(5, -11)

  // far wing, tail, far leg behind the body
  drawWing(g, -6, shoulderF, pose.fw, FAR, false)
  const tailBase = P(-4, 15)
  for (const [k, spread] of [
    [0, 0],
    [1, 24],
    [2, -22]
  ] as const) {
    const a = 252 - tilt + spread * (1 + pose.tail * 0.02) + pose.tail
    const dd = dir(a)
    const len = k === 0 ? 20 : 17
    const b: Pt = [tailBase[0] + dd[0] * 3, tailBase[1] + dd[1] * 3]
    const e: Pt = [tailBase[0] + dd[0] * len, tailBase[1] + dd[1] * len]
    g.add(-5 + k * 0.01, (l) => capsule(l, b, e, 5.2, 2.6, k === 0 ? NAVY : FAR))
  }
  const legTop = (u: number): Pt => P(u, 16)
  const legDir = dir(pose.legAng - tilt)
  const leg = (l: Raster, u: number, far: boolean) => {
    const a = legTop(u)
    const bpt: Pt = [a[0] + legDir[0] * pose.legLen, a[1] + legDir[1] * pose.legLen]
    capsule(l, a, bpt, 2.6, 2.1, far ? [BEAK[2], BEAK[2], BEAK[3], BEAK[3], BEAK[4]] : BEAK, false)
    // talons: three curled toes
    const base = pose.legAng - tilt
    for (const off of [-48, 0, 48]) {
      const td = dir(base + off + (far ? 6 : 0))
      const m: Pt = [bpt[0] + td[0] * 3.4, bpt[1] + td[1] * 3.4]
      const e: Pt = [bpt[0] + td[0] * 6, bpt[1] + td[1] * 6]
      capsule(l, bpt, m, 1.5, 1.2, far ? [BEAK[2], BEAK[2], BEAK[3], BEAK[3], BEAK[4]] : BEAK, false)
      l.line(m[0], m[1], e[0], e[1], BEAK[2])
    }
  }
  g.add(-4, (l) => leg(l, -4, true))

  // body: a tapered egg, with the light chest recoloured onto its front
  g.add(0, (l) => {
    capsule(l, P(1, -7), P(-1, 9), 16.5, 13, NAVY)
    recolor(
      l,
      (px, py) => {
        const [u, v] = inv(px, py)
        return ((u - 8) / 13) ** 2 + ((v + 1) / 18) ** 2 <= 1 && u > -1
      },
      NAVY,
      CHEST
    )
    // feather scallops on the chest
    for (const [u, v] of [
      [9, -3],
      [6, 4],
      [11, 8],
      [4, 11]
    ] as const) {
      const a = P(u - 2, v)
      const b = P(u - 1, v + 1)
      const c = P(u + 1, v + 1)
      const d = P(u + 2, v)
      for (const q of [a, b, c, d]) l.paint(q[0], q[1], CHEST[2])
    }
  })
  g.add(0.5, (l) => leg(l, 4, false))

  // bandana: band under the head, knot at the back, two tails streaming behind
  g.add(1, (l) => {
    capsule(l, P(-9, -9), P(15, -7), 3.4, 3.2, RED)
  })
  g.add(0.9, (l) => {
    const k = P(-10, -9)
    capsule(l, k, [k[0] - 11 * co + pose.scarf * 0.2, k[1] - 11 * si + 2 - pose.scarf], 3.4, 1.9, RED)
    capsule(l, k, [k[0] - 9 * co, k[1] - 9 * si + 8 + pose.scarf * 0.5], 3.2, 1.8, [
      RED[1],
      RED[2],
      RED[3],
      RED[3],
      RED[4]
    ])
  })
  g.add(1.1, (l) => capsule(l, P(-9, -9), P(-9, -9), 3.6, 3.6, RED))

  // near wing sits in front of the body, behind the head
  drawWing(g, 2, shoulderN, pose.nw, NAVY, true)

  // head
  g.add(3, (l) => {
    capsule(l, H, H, 12.4, 12.4, NAVY)
    if (pose.puff > 0) {
      for (const [u, v, e] of [
        [-6, -10, -9],
        [-1, -12, -12],
        [4, -11, -10],
        [-10, -6, -7]
      ] as const) {
        const a = HP(u, v)
        const b = HP(u + (e < -9 ? -2 : 1) * pose.puff, v - Math.abs(e) * 0.6 * pose.puff)
        capsule(l, a, b, 2.4, 1.1, NAVY)
      }
    }
  })
  // eye patch with its strap, and the good eye
  g.add(
    3.1,
    (l) => {
      const pc = HP(-2, -3)
      l.thick(pc[0], pc[1], HP(-13, -9)[0], HP(-13, -9)[1], 2, C.black)
      l.thick(pc[0], pc[1], HP(8, -11)[0], HP(8, -11)[1], 1.6, C.black)
      l.ellipse(pc[0], pc[1], 4.7, 4.9, C.black)
      l.set(pc[0] - 2, pc[1] - 2, NAVY[1])
      l.set(pc[0] - 1, pc[1] - 3, NAVY[1])
      l.set(pc[0] - 3, pc[1] - 1, NAVY[2])
      goodEye(l, HP(5, -7), pose.eye, hang)
      // heavy brow over the good eye
      if (pose.eye !== 'hurt' && pose.eye !== 'swirl') {
        const b0 = HP(0, -13)
        const b1 = HP(9, pose.eye === 'tired' ? -10 : -9)
        l.thick(b0[0], b0[1], b1[0], b1[1], 2, NAVY[4])
      }
    },
    false
  )
  // beak: lower jaw hinges open, the mouth shows between
  const hinge = HP(5, 3)
  const open = pose.beak
  const jaw = (lu: number, lv: number): Pt => {
    const a = rotAbout([hinge[0] + lu, hinge[1] + lv], hinge, hang)
    return rotAbout(a, hinge, open)
  }
  if (open > 2) {
    g.add(
      3.3,
      (l) => {
        l.poly([...HP(5, 3), ...HP(23, 3.5), ...jaw(19, 1), ...jaw(0, 2)], C.mouth)
      },
      false
    )
  }
  g.add(3.4, (l) => {
    const lower = [jaw(-1, 0), jaw(18, 0), jaw(18.5, 2.5), jaw(13, 6.5), jaw(3, 8), jaw(-2, 6)]
    l.poly(
      lower.flatMap((p) => [p[0], p[1]]),
      BEAK[2]
    )
    const inner = [jaw(0, 2.5), jaw(17, 2.5), jaw(12, 6), jaw(3, 7)]
    l.poly(
      inner.flatMap((p) => [p[0], p[1]]),
      BEAK[1]
    )
    const top = [jaw(1, 1), jaw(17, 1), jaw(17, 2)]
    l.poly(
      top.flatMap((p) => [p[0], p[1]]),
      BEAK[2]
    )
  })
  if (pose.tongue > 0)
    g.add(3.5, (l) => {
      const a = jaw(2, 3)
      const b = jaw(16 + pose.tongue * 4, 5 + pose.tongue * 2)
      capsule(l, a, b, 2.4, 2, [C.tongue, C.tongue, C.mouth, C.mouth, C.mouth], false)
    })
  g.add(3.6, (l) => {
    const upper = [HP(4, -2), HP(15, -4), HP(24, -2), HP(28.5, 3), HP(27.5, 8), HP(23, 5), HP(16, 3), HP(4, 3)]
    const poly = upper.flatMap((p) => [p[0], p[1]])
    l.poly(poly, BEAK[1])
    // form shading: shade along the underside and tip, highlight along the ridge
    const src = l.clone()
    for (let yy = 0; yy < l.h; yy++)
      for (let xx = 0; xx < l.w; xx++) {
        if (src.get(xx, yy) !== BEAK[1]) continue
        const below = src.get(xx, yy + 1) !== BEAK[1] || src.get(xx, yy + 2) !== BEAK[1]
        const right = src.get(xx + 1, yy) !== BEAK[1]
        const above = src.get(xx, yy - 1) !== BEAK[1]
        if (below || right) l.set(xx, yy, BEAK[2])
        else if (above || src.get(xx - 1, yy) !== BEAK[1]) l.set(xx, yy, BEAK[0])
      }
    // nostril
    const n = HP(11, -2)
    l.set(n[0], n[1], BEAK[3])
    l.set(n[0] + 1, n[1], BEAK[3])
  })

  // sweat and loose feathers
  if (pose.sweat > 0)
    g.add(
      4,
      (l) => {
        for (const [u, v] of [
          [-4, -17],
          [14, -14]
        ] as const) {
          const p = HP(u, v - pose.sweat)
          l.stamp(['.b.', 'bwb', 'bbb', '.b.'], p[0] - 1, p[1] - 2, { b: R.water[1], w: R.water[0] })
          l.set(p[0] + 1, p[1] + 1, R.water[2])
        }
      },
      true
    )
  for (const [fx, fy, fa] of pose.flies) g.add(5, (l) => looseFeather(l, fx, fy, fa))

  return g.render()
}

// ------------------------------------------------------------------------------------------------- clips

/** wing angle helpers: near wing points left, far wing right. */
const NW = (up: number, len?: number, fold?: number) => wing(180 - up, len, fold)
const FW = (up: number, len?: number, fold?: number) => wing(up, len, fold)

const idle = memo(() =>
  [
    { up: 62, dy: 3, scarf: 2, tail: 6 },
    { up: 4, dy: 1, scarf: 0, tail: 2 },
    { up: -46, dy: -3, scarf: -2, tail: -6 },
    { up: 8, dy: -1, scarf: 0, tail: -2 }
  ].map((f) =>
    drawCrow(
      crowPose({
        y: 82 + f.dy,
        nw: NW(f.up),
        fw: FW(f.up * 0.95),
        scarf: f.scarf,
        tail: f.tail,
        head: -f.dy * 0.8,
        legAng: 270 + f.dy * 3
      })
    )
  )
)

const frames = (list: Partial<CrowPose>[]) => list.map((p) => drawCrow(crowPose(p)))

const intro = memo(() =>
  frames([
    { x: 54, y: 78, tilt: 26, nw: NW(40, 24, 0.7), fw: FW(30, 24, 0.7), scarf: 3, tail: 8 },
    { y: 82, tilt: -8, nw: NW(78), fw: FW(78), beak: 16, scarf: -2, eye: 'open', legAng: 276 },
    { y: 85, tilt: -8, head: -14, nw: NW(10), fw: FW(10), beak: 32, eye: 'wide', scarf: 2, tail: -5, puff: 0.4 },
    { y: 84, tilt: -10, head: -18, nw: NW(34), fw: FW(34), beak: 36, eye: 'wide', scarf: -3, tail: 4, puff: 0.7 }
  ])
)

const windup = memo(() =>
  frames([
    { y: 80, tilt: -10, nw: NW(62), fw: FW(62), beak: 3, scarf: 3, tail: 6, legAng: 280 },
    { y: 83, tilt: -20, head: -4, nw: NW(78), fw: FW(76), beak: 6, scarf: -3, tail: 10, legAng: 290, puff: 0.3 },
    {
      y: 85,
      tilt: -27,
      head: -6,
      nw: NW(86),
      fw: FW(84),
      beak: 4,
      eye: 'glint',
      scarf: 4,
      tail: 14,
      legAng: 296,
      puff: 0.5
    }
  ])
)

const attack = memo(() =>
  frames([
    {
      x: 58,
      y: 80,
      tilt: 50,
      nw: wing(138, 24, 0.9),
      fw: wing(150, 22, 0.9),
      beak: 10,
      scarf: 5,
      tail: -4,
      legAng: 250
    },
    {
      x: 58,
      y: 80,
      tilt: 46,
      nw: wing(150, 26, 0.85),
      fw: wing(160, 24, 0.85),
      beak: 4,
      scarf: -3,
      tail: 6,
      legAng: 256
    }
  ])
)

const recover = memo(() =>
  frames([
    {
      y: 84,
      tilt: 6,
      nw: NW(54),
      fw: FW(50),
      beak: 14,
      tongue: 1,
      eye: 'tired',
      puff: 1,
      sweat: 0,
      scarf: 3,
      tail: 8,
      legAng: 276,
      head: 6
    },
    {
      y: 88,
      tilt: 4,
      nw: NW(-34),
      fw: FW(-30),
      beak: 18,
      tongue: 1,
      eye: 'tired',
      puff: 0.6,
      sweat: 2,
      scarf: -3,
      tail: -6,
      legAng: 262,
      head: 8
    }
  ])
)

const hurt = memo(() =>
  frames([
    {
      y: 82,
      tilt: -16,
      head: -8,
      nw: NW(40),
      fw: FW(72),
      beak: 24,
      eye: 'hurt',
      puff: 1,
      scarf: 4,
      legAng: 290,
      flies: [
        [24, 60, 160],
        [100, 50, 20]
      ]
    },
    {
      y: 84,
      tilt: -24,
      head: -10,
      nw: NW(70),
      fw: FW(30),
      beak: 30,
      eye: 'hurt',
      puff: 1,
      scarf: -4,
      legAng: 296,
      flies: [
        [18, 52, 200],
        [108, 66, -30],
        [40, 36, 120]
      ]
    }
  ])
)

/** Nudges a frame so it keeps two empty pixels to every edge. */
function keepIn(r: Raster) {
  const b = r.bounds()!
  const dx = Math.max(2 - b.x, Math.min(0, 125 - (b.x + b.w - 1)))
  const dy = Math.max(2 - b.y, Math.min(0, 125 - (b.y + b.h - 1)))
  return dx || dy ? r.shifted(dx, dy) : r
}

const defeat = memo(() =>
  frames([
    {
      y: 84,
      tilt: -22,
      head: -8,
      nw: NW(50),
      fw: FW(60),
      beak: 28,
      eye: 'hurt',
      puff: 1,
      scarf: 4,
      legAng: 292,
      flies: [
        [22, 52, 150],
        [104, 56, 30]
      ]
    },
    {
      x: 60,
      y: 76,
      tilt: 60,
      head: 4,
      nw: NW(70),
      fw: FW(-20),
      beak: 24,
      eye: 'swirl',
      puff: 1,
      scarf: 5,
      legAng: 300,
      flies: [
        [24, 40, 120],
        [100, 38, 40],
        [92, 96, -30]
      ]
    },
    {
      x: 62,
      y: 80,
      tilt: 135,
      head: 6,
      nw: NW(-40),
      fw: FW(40),
      beak: 24,
      eye: 'swirl',
      puff: 1,
      scarf: -5,
      legAng: 320,
      tail: 12,
      flies: [
        [20, 64, 180],
        [108, 74, 10],
        [30, 100, 240]
      ]
    },
    {
      x: 60,
      y: 77,
      tilt: 205,
      head: 4,
      nw: NW(30),
      fw: FW(-50),
      beak: 20,
      eye: 'swirl',
      puff: 1,
      scarf: 5,
      legAng: 330,
      flies: [
        [16, 84, 200],
        [106, 90, -20]
      ]
    },
    {
      x: 62,
      y: 86,
      tilt: 252,
      head: -50,
      nw: NW(-6),
      fw: FW(-4),
      beak: 14,
      eye: 'swirl',
      puff: 1,
      scarf: 3,
      legAng: 350,
      tail: 8,
      flies: [
        [14, 90, 210],
        [112, 96, 0]
      ]
    },
    {
      x: 62,
      y: 86,
      tilt: 270,
      head: -92,
      nw: NW(-12),
      fw: FW(-10),
      beak: 5,
      tongue: 1,
      eye: 'swirl',
      puff: 0.7,
      scarf: 2,
      legAng: 358,
      tail: 6,
      flies: [
        [18, 102, 180],
        [108, 104, 10]
      ]
    }
  ]).map(keepIn)
)

export const sheets: SheetModule = {
  crowBoss: () => ({
    idle: lazyAnim(idle, 6, true),
    intro: lazyAnim(intro, 8, false),
    windup: lazyAnim(windup, 10, false),
    attack: lazyAnim(attack, 12, true),
    recover: lazyAnim(recover, 8, true),
    hurt: lazyAnim(hurt, 12, false),
    defeat: lazyAnim(defeat, 8, false)
  })
}
