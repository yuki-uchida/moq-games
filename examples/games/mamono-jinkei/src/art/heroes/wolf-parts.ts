/**
 * Wolf pup body parts: head (front / side / back), ears, torso, legs, tail and paw limbs. Everything is drawn natively
 * per frame as outlined layers (`part`), lit from the top-left, in the wolfFur / wolfCream ramps.
 */
import { C, DARKER, R } from '../palette'
import { Raster, ball } from '../raster'
import { part } from './layer'
import { edgeShade, type Dir } from './jobs'

export const F = R.wolfFur
export const CR = R.wolfCream
const PINK = R.ratPink
const rd = Math.round

export type V = [number, number]
export type Eyes = 'open' | 'wide' | 'angry' | 'happy' | 'shut' | 'x' | 'half' | 'squint'
export type Mouth = 'smile' | 'closed' | 'open' | 'howl' | 'grit' | 'o' | 'frown' | 'pant'

const KEY: Record<string, number> = {
  k: F[4],
  w: C.white,
  h: R.beak[0],
  a: R.beak[1],
  b: R.beak[2],
  p: C.black
}

function stamp(r: Raster, rows: readonly string[], x: number, y: number) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] !== '.') r.set(x + i, y + j, KEY[row[i]])
  })
}

const EYE: Record<Eyes, readonly string[]> = {
  open: ['.kkk.', 'kwhak', 'kappk', 'kabbk', '.kkk.'],
  angry: ['.kkk.', 'kwhak', 'kappk', 'kabbk', '.kkk.'],
  wide: ['.kkk.', 'kwhhk', 'kwppk', 'khppk', 'kabbk', '.kkk.'],
  half: ['kkkkk', 'kappk', 'kabbk', '.kkk.'],
  happy: ['.kkk.', 'k...k'],
  shut: ['kkkkk'],
  x: ['k...k', '.k.k.', '..k..', '.k.k.', 'k...k'],
  squint: ['kk...', '.kkk.', '...kk', '.kkk.', 'kk...']
}

/** One eye with its top-left at (x, y); `left` mirrors slants. */
export function eye(r: Raster, x: number, y: number, kind: Eyes, left: boolean) {
  if (kind === 'squint') stamp(r, left ? EYE.squint : EYE.squint.map((s) => [...s].reverse().join('')), x, y)
  else stamp(r, EYE[kind], x, y)
  if (kind === 'angry') {
    // Brave brow slanting down toward the nose.
    for (let i = 0; i < 5; i++) r.set(x + i, y - 2 + Math.floor((left ? i : 4 - i) * 0.5), F[4])
  }
}

/* ------------------------------------------------------------------ ears */

/** Triangular ear: base centre (bx, by), axis angle `a` (screen radians), length and base width. */
function ear(l: Raster, bx: number, by: number, a: number, len: number, wid: number) {
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  const px = -uy
  const py = ux
  l.poly(
    [bx + px * wid * 0.5, by + py * wid * 0.5, bx + ux * len, by + uy * len, bx - px * wid * 0.5, by - py * wid * 0.5],
    F[1]
  )
  edgeShade(l, F)
  const t2: V = [bx + ux * len * 0.72, by + uy * len * 0.72]
  const b2: V = [bx + ux * 1.2, by + uy * 1.2]
  const w2 = wid * 0.3
  l.poly([b2[0] + px * w2, b2[1] + py * w2, t2[0], t2[1], b2[0] - px * w2, b2[1] - py * w2], PINK[2])
  l.poly(
    [
      b2[0] + px * w2 * 0.5 + ux,
      b2[1] + py * w2 * 0.5 + uy,
      b2[0] + ux * len * 0.5,
      b2[1] + uy * len * 0.5,
      b2[0] - px * w2 * 0.5 + ux,
      b2[1] - py * w2 * 0.5 + uy
    ],
    PINK[1]
  )
}

const UP = -Math.PI / 2

/** Where and how the ears sit on a job's headgear (they poke through holes in the hat). */
export interface EarCfg {
  /** Base centre offset from the head centre: front/back = ±spread, side = u of the near ear. */
  spread: number
  /** Base y above the crown (positive = lower down the head). */
  dy: number
  /** Outward lean in radians. */
  lean: number
  /** Dark colour of the hat's ear hole (under the base). */
  hole: number
  scale?: number
  wid?: number
  /** Side view: u of the far ear (default 3.6). */
  farU?: number
}

function earAt(r: Raster, bx: number, by: number, a: number, len: number, wid: number, hole: number, far = false) {
  const tmp = new Raster(r.w, r.h)
  if (hole)
    part(
      tmp,
      (l) => {
        l.ellipse(bx, by + 0.3, wid * 0.46, 1.7, hole)
      },
      false
    )
  part(tmp, (l) => ear(l, bx, by, a, len, wid))
  r.blit(far ? tmp.map((col) => DARKER[col]) : tmp)
}

/** The two ears of a front/back head with crown row `top`. `back` 0 = pricked, 1 = flat. */
export function earsFront(r: Raster, hx: number, top: number, back: number, c: EarCfg) {
  const sc = c.scale ?? 1
  const len = (9.5 - back * 2.5) * sc
  for (const s of [-1, 1])
    earAt(
      r,
      hx + s * c.spread,
      top + c.dy + back * 2.5,
      UP + s * (c.lean + back * 1.0),
      len,
      (c.wid ?? 8.4) * sc,
      c.hole
    )
}

/** Side view ears: the far one (darker, forward) first, then the near one. */
export function earsSide(r: Raster, hx: number, hy: number, th: number, back: number, c: EarCfg) {
  const co = Math.cos(th)
  const si = Math.sin(th)
  const at = (u: number, v: number): V => [hx + u * co - v * si, hy + u * si + v * co]
  const sc = c.scale ?? 1
  const len = (10 - back * 2) * sc
  const v = -11.8 + c.dy
  const fb = at(c.farU ?? 3.6, v + 0.6 + back)
  earAt(r, fb[0], fb[1], UP + th + 0.12 - back * 0.9, len * 0.92, 7.4 * sc, c.hole, true)
  const nb = at(-3.2, v + back)
  earAt(r, nb[0], nb[1], UP + th - c.lean - back * 0.85, len, (c.wid ?? 8.4) * sc, c.hole)
}

/* ------------------------------------------------------------------ heads */

export interface HeadSpec {
  x: number
  y: number
  eyes: Eyes
  mouth: Mouth
  /** Head tilt back in radians (side view rotates the snout; front view raises the chin). */
  tilt?: number
  look?: number
  blush?: boolean
  /** Side view: jaw gape in px (overrides the mouth's default). */
  open?: number
}

function mouthFront(r: Raster, x: number, y: number, mouth: Mouth) {
  const ink = F[4]
  const k = (dx: number, dy: number, c = ink) => r.set(x + dx, y + dy, c)
  switch (mouth) {
    case 'smile':
    case 'closed':
      k(0, 3)
      k(-2, 4)
      k(2, 4)
      k(-1, 5)
      k(0, 5)
      k(1, 5)
      if (mouth === 'smile') k(1, 6, C.white)
      break
    case 'frown':
      k(0, 3)
      k(-1, 4)
      k(0, 4)
      k(1, 4)
      k(-2, 5)
      k(2, 5)
      break
    case 'open':
    case 'pant':
      for (let j = 3; j <= 5; j++) for (let i = -2; i <= 2; i++) k(i, j, ink)
      for (let i = -1; i <= 1; i++) k(i, 5, PINK[1])
      k(-2, 3, C.white)
      k(2, 3, C.white)
      if (mouth === 'pant') {
        k(0, 6, PINK[1])
        k(1, 6, PINK[2])
        k(0, 7, PINK[2])
      }
      break
    case 'howl':
      for (let j = 3; j <= 8; j++) {
        const hw = j === 3 || j === 8 ? 1 : 2
        for (let i = -hw; i <= hw; i++) k(i, j, ink)
      }
      for (let i = -1; i <= 1; i++) k(i, 7, PINK[1])
      for (let i = -1; i <= 1; i++) k(i, 8, PINK[2])
      k(-2, 3, C.white)
      k(2, 3, C.white)
      break
    case 'grit':
      for (let i = -2; i <= 2; i++) {
        k(i, 4, ink)
        k(i, 6, ink)
        k(i, 5, i % 2 ? ink : C.white)
      }
      break
    case 'o':
      k(-1, 4)
      k(0, 4)
      k(1, 4)
      k(-1, 5)
      k(1, 5)
      k(-1, 6)
      k(0, 6)
      k(1, 6)
      break
  }
}

/** Front-facing head centred at (x, y): skull 22×19 with cheek tufts, cream muzzle, nose, eyes and mouth. */
export function headFront(r: Raster, h: HeadSpec) {
  const { x, y } = h
  const look = h.look ?? 0
  part(r, (l) => {
    // Cheek ruff behind the skull.
    for (const s of [-1, 1])
      l.poly(
        [x + s * 9, y + 0.5, x + s * 14, y + 6.5, x + s * 11, y + 6.5, x + s * 11.5, y + 9.5, x + s * 6, y + 8.5],
        F[1]
      )
    ball(l, x, y, 11, 9.5, F, true)
    edgeShade(l, F)
    // Cream lower face: muzzle and cheeks.
    const my = y + 4.3
    l.ellipse(x, my + 0.3, 6.2, 4, CR[1])
    l.ellipse(x - 4.3, my + 1, 3.2, 2.7, CR[1])
    l.ellipse(x + 4.3, my + 1, 3.2, 2.7, CR[1])
    for (let j = 0; j < l.h; j++)
      for (let i = x - 14; i <= x + 14; i++)
        if (l.get(i, j) === CR[1] && (!l.get(i, j + 1) || (!l.get(i + 1, j) && i > x))) l.set(i, j, CR[2])
    // Light on the forehead.
    l.paint(x - 5, y - 6, F[0])
    l.paint(x - 4, y - 6, F[0])
    l.paint(x - 6, y - 5, F[0])
  })
  const e = h.eyes
  const flat = e === 'happy' || e === 'shut'
  const ey = flat ? y - 1 : y - 3 + (e === 'wide' ? -1 : e === 'half' ? 1 : 0)
  eye(r, x - 8 + look, ey, e, true)
  eye(r, x + 4 + look, ey, e, false)
  // Nose.
  r.rect(x - 1, y + 1, 3, 1, F[4])
  r.set(x, y + 2, F[4])
  r.set(x - 1, y + 1, F[2])
  if (h.blush) {
    r.paint(x - 9, y + 4, C.blush)
    r.paint(x + 9, y + 4, C.blush)
  }
  mouthFront(r, x, y, h.mouth)
}

/** Back of the head: round skull with a neck ruff. */
export function headBack(r: Raster, h: { x: number; y: number }) {
  const { x, y } = h
  part(r, (l) => {
    for (const s of [-1, 1])
      l.poly(
        [x + s * 9, y + 0.5, x + s * 14, y + 6.5, x + s * 11, y + 6.5, x + s * 11.5, y + 9.5, x + s * 6, y + 8.5],
        F[1]
      )
    ball(l, x, y, 11, 9.5, F, true)
    edgeShade(l, F)
    for (let j = y - 7; j <= y - 1; j++) l.paint(x + 1, j, F[2])
    for (let i = -3; i <= 3; i += 3) {
      l.paint(x + i, y + 8, F[2])
      l.paint(x + i, y + 9, F[3])
    }
  })
}

/** Right-facing head. */
export function headSide(r: Raster, h: HeadSpec) {
  const { x, y } = h
  const th = -(h.tilt ?? 0)
  const c = Math.cos(th)
  const s = Math.sin(th)
  const at = (u: number, v: number): V => [x + u * c - v * s, y + u * s + v * c]
  const gape = h.open ?? (h.mouth === 'howl' ? 4.5 : h.mouth === 'open' || h.mouth === 'pant' ? 2.5 : 0)
  part(r, (l) => {
    // Ruff at the back of the jaw.
    l.poly([at(-7, 1), at(-13, 6.5), at(-9, 7), at(-9.5, 10.5), at(-3, 9)].flat(), F[1])
    ball(l, x, y, 9.6, 9.2, F, true)
    // Snout: fur top, cream jaw. The upper jaw lifts with the gape.
    const a0 = at(5, 2.2 - gape * 0.15)
    const a1 = at(10.5, 2.6 - gape * 0.3)
    l.thick(a0[0], a0[1], a1[0], a1[1], 6.4, F[1])
    if (gape > 0) {
      const m0 = at(5.5, 4.6)
      const m1 = at(11.5, 4.8 + gape * 0.4)
      l.thick(m0[0], m0[1], m1[0], m1[1], 2 + gape * 0.9, PINK[3])
      const j0 = at(5.5, 6 + gape * 0.7)
      const j1 = at(11, 6 + gape * 1.0)
      l.thick(j0[0], j0[1], j1[0], j1[1], 3.4, CR[1])
      const u0 = at(5.5, 3.8)
      const u1 = at(11, 4)
      l.thick(u0[0], u0[1], u1[0], u1[1], 1.8, CR[1])
      const t0 = at(8, 5.2 + gape * 0.9)
      const t1 = at(11, 5.4 + gape * 0.9)
      l.thick(t0[0], t0[1], t1[0], t1[1], 1.2, PINK[1])
    } else {
      const m0 = at(5, 4.8)
      const m1 = at(11, 4.9)
      l.thick(m0[0], m0[1], m1[0], m1[1], 3.2, CR[1])
    }
    edgeShade(l, F)
    edgeShade(l, CR)
    const hl = at(-4, -6)
    l.paint(hl[0], hl[1], F[0])
    l.paint(hl[0] - 1, hl[1] + 1, F[0])
  })
  // Nose.
  const n = at(14.2, 0.9 - gape * 0.3)
  r.rect(rd(n[0]) - 1, rd(n[1]) - 1, 3, 3, F[4])
  r.set(rd(n[0]) - 1, rd(n[1]) - 1, F[2])
  // Eye.
  const e = h.eyes
  const ep = at(4.6, -0.8 + (e === 'wide' ? -0.5 : 0))
  eye(r, rd(ep[0]) - 2 + (h.look ?? 0), rd(ep[1]) - 2 + (e === 'happy' || e === 'shut' ? 2 : 0), e, false)
  if (gape === 0) {
    for (let i = 0; i <= 6; i++) {
      const p = at(5.2 + i, 5.3 - (i === 0 ? 1 : 0))
      r.set(rd(p[0]), rd(p[1]), F[4])
    }
    if (h.mouth === 'smile') {
      const f = at(9.4, 6.4)
      r.set(rd(f[0]), rd(f[1]), C.white)
    }
  } else {
    const f1 = at(9.8, 4.4)
    r.set(rd(f1[0]), rd(f1[1]), C.white)
    const f2 = at(9.8, 5.6 + gape * 0.6)
    r.set(rd(f2[0]), rd(f2[1]), C.white)
  }
  if (h.blush) {
    const b = at(2, 4.5)
    r.paint(rd(b[0]), rd(b[1]), C.blush)
  }
}

/* ------------------------------------------------------------------ torso and tail */

export interface TorsoSpec {
  x: number
  y: number
  rx: number
  ry: number
  dir: Dir
  puff?: number
}

export function torso(r: Raster, t: TorsoSpec) {
  const { x, y, rx, ry, dir } = t
  const puff = t.puff ?? 0
  part(r, (l) => {
    ball(l, x, y, rx + puff * 0.5, ry, F, true)
    edgeShade(l, F)
    if (dir === 'down') {
      // Cream chest with a fluffy zigzag lower edge.
      const cy = y - ry * 0.2
      const crx = 4.6 + puff * 0.4
      const cry = ry * 0.72
      for (let j = Math.floor(cy - cry); j <= Math.ceil(cy + cry); j++)
        for (let i = Math.floor(x - crx); i <= Math.ceil(x + crx); i++) {
          const nx = (i + 0.5 - x) / crx
          const ny = (j + 0.5 - cy) / cry
          const zig = (((i - Math.floor(x)) % 3) + 3) % 3
          const edge = ny > 0.55 - (zig === 0 ? 0.4 : 0)
          if (nx * nx + ny * ny <= 1 && !edge && l.get(i, j)) l.set(i, j, nx > 0.25 && ny > 0 ? CR[2] : CR[1])
        }
    } else if (dir === 'side') {
      const cx = x + rx * 0.55
      const cy = y - ry * 0.15
      for (let j = Math.floor(cy - ry * 0.7); j <= Math.ceil(cy + ry * 0.7); j++)
        for (let i = Math.floor(cx - 3.6); i <= Math.ceil(cx + 3.6); i++) {
          const nx = (i + 0.5 - cx) / 3.6
          const ny = (j + 0.5 - cy) / (ry * 0.7)
          if (nx * nx + ny * ny <= 1 && l.get(i, j)) l.set(i, j, i > cx + 1.5 || ny > 0.5 ? CR[2] : CR[1])
        }
    } else {
      for (let j = Math.floor(y - ry * 0.8); j <= Math.ceil(y + ry * 0.2); j++) l.paint(x + 1, j, F[2])
    }
  })
}

/** A fluffy tail along a quadratic curve p0 → p2 (control p1); the last third is cream. */
export function tail(r: Raster, p0: V, p1: V, p2: V, size = 1, cream = true) {
  part(r, (l) => {
    const N = 26
    const at = (t: number): V => [
      (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
      (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
    ]
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const [px, py] = at(t)
      const wd = (1.4 + 7.4 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.88 + 0.12)), 0.75)) * size
      l.ellipse(px, py, wd / 2, wd / 2, cream && t > 0.7 ? CR[1] : F[1])
    }
    edgeShade(l, F)
    edgeShade(l, CR)
    for (let i = 3; i < N - 4; i++) {
      const [px, py] = at(i / N)
      if (l.get(rd(px + 1), rd(py + 1.5 * size)) === F[1]) l.set(rd(px + 1), rd(py + 1.5 * size), F[2])
    }
  })
}

/* ------------------------------------------------------------------ limbs */

/** Fur leg from the hip down to the ankle, with a paw foot pointing toward `face` (-1/0/1). */
export function leg(r: Raster, hip: V, foot: V, face: number, width = 5, far = false) {
  const tmp = new Raster(r.w, r.h)
  part(tmp, (l) => {
    l.thick(hip[0], hip[1], foot[0], foot[1] - 1, width, F[1])
    const px = foot[0] + face * 1.2
    l.ellipse(px, foot[1] - 0.3, width / 2 + 1.1 + (face ? 0.5 : 0), 2, F[1])
    edgeShade(l, F)
    const fy = rd(foot[1])
    if (face === 0) {
      l.paint(rd(px - 1), fy, F[3])
      l.paint(rd(px + 1), fy, F[3])
    } else {
      l.paint(rd(px + face), fy, F[3])
      l.paint(rd(px + face * 2.5), fy, F[3])
    }
  })
  r.blit(far ? tmp.map((c) => DARKER[c]) : tmp)
}

/** Furry arm to a cream mitt at (x1, y1). */
export function arm(r: Raster, x0: number, y0: number, x1: number, y1: number, far = false, width = 3.6) {
  const tmp = new Raster(r.w, r.h)
  part(tmp, (l) => {
    l.thick(x0, y0, x1, y1, width, F[1])
    edgeShade(l, F)
  })
  r.blit(far ? tmp.map((c) => DARKER[c]) : tmp)
  mitt(r, x1, y1, far)
}

/** The cream paw-hand. */
export function mitt(r: Raster, x: number, y: number, far = false) {
  const tmp = new Raster(r.w, r.h)
  part(tmp, (l) => {
    l.ellipse(x, y, 2.5, 2.4, CR[1])
    edgeShade(l, CR)
    l.paint(rd(x - 1), rd(y - 1), CR[0])
  })
  r.blit(far ? tmp.map((c) => DARKER[c]) : tmp)
}
