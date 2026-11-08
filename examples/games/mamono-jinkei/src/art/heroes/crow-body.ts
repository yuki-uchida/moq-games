/**
 * The crow body: a round-headed, fluffy-chested little black crow with feathered wings that work as arms.
 * Everything is drawn natively per frame at 64×64 (feet on 32,56); `renderCrow` takes a `CPose` and the job outfits
 * from jobs.ts are hung on the crow's anchors (headgear on the crown, weapons in the wing-tip "fists").
 */
import { C, R, dimTable } from '../palette'
import { Raster } from '../raster'
import { despeckleBox } from './layer'
import { part } from './layer'
import {
  JOB_RAMP,
  bowNock,
  drawBuckler,
  drawHeadgear,
  drawQuiver,
  drawStole,
  drawWeapon,
  type Dir,
  type JobId,
  type WeaponFx
} from './jobs'

export type V = [number, number]
const F = R.crowFeather
const S = R.crowSheen
const B = R.beak
const rd = Math.round
/** Wings are a shade more violet than the body so they read as their own shape. */
const W = S[3]

/* ------------------------------------------------------------------ pose */

export type Eyes = 'open' | 'wide' | 'half' | 'shut' | 'happy' | 'x' | 'angry' | 'squint'
export interface CFace {
  eyes: Eyes
  /** Beak: 0 closed, 1 open, 2 wide open (shout). */
  beak?: 0 | 1 | 2
  blush?: boolean
}

/** A wing: a folded arm reaching `to` (offset from the shoulder), or a spread fan. */
export type Wing = { arm: V; tips?: boolean } | { fan: number; len: number; n?: number; spread?: number }

export interface CPose {
  s?: number
  dx?: number
  /** Body lift (px above the ground): the feet leave the floor. */
  dy?: number
  /** Head forward shift (side view) or sideways shift (front / back view). */
  lean?: number
  /** Head vertical offset (+ down). */
  hdy?: number
  /** Body squash: shorter and wider. */
  squash?: number
  /** Side view: the body leans forward (flight). */
  shear?: number
  face?: CFace
  wR?: Wing | null
  wL?: Wing | null
  /** Wings drawn behind the head (raised) instead of in front of the body. */
  wingsBack?: boolean
  ang?: number
  wfx?: WeaponFx
  sway?: number
  tilt?: number
  slung?: boolean
  noGear?: boolean
  noHat?: boolean
  /** Legs: 'stand' | 'tuck' (feet pulled up) | 'none'. */
  legs?: 'stand' | 'tuck' | 'none'
  /** Foot stride in side view (-1..1). */
  stride?: number
  /** Tail fan lift in side view (px, + = up). */
  tail?: number
  dim?: number
  fx?: (r: Raster, a: A, hand: V) => void
  /** Drawn after the head, under the wings and gear. */
  mid?: (r: Raster, a: A, hand: V) => void
}

export interface A {
  cx: number
  feet: number
  bcx: number
  bcy: number
  hx: number
  hcy: number
  headTop: number
  hrx: number
  hry: number
  s: number
  dir: Dir
  shR: V
  shL: V
}

const REST_ANG: Record<JobId, number> = { sword: -1.35, mage: -1.52, archer: 0, cleric: -1.52 }
export { REST_ANG }

export function anchors(p: CPose, dir: Dir): A {
  const s = p.s ?? 1
  const cx = 32 + (p.dx ?? 0)
  const feet = 56 - (p.dy ?? 0)
  const sq = p.squash ?? 0
  const side = dir === 'side'
  const bcy = feet - (13 - sq * 0.5) * s
  const hcy = feet - (30.5 - sq) * s + (p.hdy ?? 0)
  const hx = cx + (side ? 2 * s : 0) + (p.lean ?? 0)
  const hrx = 12 * s
  const hry = 10.5 * s
  const sy = rd(bcy - 4 * s)
  return {
    cx,
    feet,
    bcx: side ? cx - 1 : cx,
    bcy,
    hx,
    hcy,
    headTop: hcy - hry,
    hrx,
    hry,
    s,
    dir,
    shR: side ? [rd(cx + 2 * s), sy] : [rd(cx + 9 * s), sy],
    shL: side ? [rd(cx - 3 * s), sy] : [rd(cx - 9 * s), sy]
  }
}

/* ------------------------------------------------------------------ primitives */

const LN = Math.hypot(0.55, 0.7, 0.55)
type Shader = (d: number, q: number, nx: number, ny: number) => number
const lightOf = (nx: number, ny: number, q: number) => {
  const nz = Math.sqrt(Math.max(0, 1 - q))
  return (-0.55 * nx - 0.7 * ny + 0.55 * nz) / LN
}

/** Glossy head: violet specular spot and an upper-left sheen rim on blue-black. */
export const HEAD: Shader = (d, q, nx, ny) => {
  if (d > 0.88) return S[1]
  if (d > 0.72) return S[2]
  if (q > 0.55 && d > 0.3 && ny < 0.2) return S[3]
  return d > 0.3 ? F[1] : d > -0.12 ? F[2] : F[3]
}
export const BODY: Shader = (d) => (d > 0.9 ? S[3] : d > 0.3 ? F[1] : d > -0.12 ? F[2] : F[3])

export function blob(
  l: Raster,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  shade: Shader,
  shear = 0,
  skip?: (x: number, y: number) => boolean
) {
  const sh = Math.abs(shear) * ry
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx - sh - 1); x <= Math.ceil(cx + rx + sh + 1); x++) {
      const nx = (x + 0.5 - cx - shear * (cy - y - 0.5)) / rx
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1.0001) continue
      if (skip?.(x, y)) continue
      l.set(x, y, shade(lightOf(nx, ny, q), q, nx, ny))
    }
}

/** Upper-left edge → violet rim, lower-right edge → shade (for single-colour F[1] layers). */
export function shadeFeather(l: Raster, strong = true, base: number = F[1]) {
  const src = l.clone()
  const b = l.bounds()
  if (!b) return
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      if (src.get(x, y) !== base) continue
      const dark = !src.get(x + 1, y) || !src.get(x, y + 1)
      const lit = !src.get(x - 1, y) || !src.get(x, y - 1)
      if (dark) l.set(x, y, F[2])
      else if (lit) l.set(x, y, strong ? S[2] : base)
    }
}

/** A pointed leaf (quill at the base, widest at ~40%), `wid` px at its widest. */
export function leaf(l: Raster, x: number, y: number, ca: number, sa: number, len: number, wid: number, c: number) {
  const steps = Math.ceil(len * 2)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const rr = Math.max(0.55, (wid / 2) * Math.pow(Math.sin(Math.PI * (0.14 + 0.86 * t)), 0.55))
    l.ellipse(x + ca * len * t, y + sa * len * t, rr, rr, c)
  }
}

/** A tumbling loose feather, outlined. */
export function looseFeather(r: Raster, x: number, y: number, ang: number, len = 7, wid = 3) {
  part(r, (l) => {
    leaf(l, x, y, Math.cos(ang), Math.sin(ang), len, wid, F[1])
    shadeFeather(l)
    l.paint(rd(x + Math.cos(ang) * len * 0.35), rd(y + Math.sin(ang) * len * 0.35 - 1), S[1])
  })
}

/** A fan of feathers from (sx, sy). `ang` is in the "pointing right" convention; `mir` flips it to point left. */
export function fan(
  r: Raster,
  sx: number,
  sy: number,
  ang: number,
  len: number,
  mir: boolean,
  n = 5,
  spread = 0.17,
  wid = 4.6,
  cover = true,
  base: number = F[1]
) {
  const sgn = mir ? -1 : 1
  const lens: number[] = []
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 1
    lens.push(len * (0.72 + 0.28 * (1 - Math.abs(t - 0.7) * 1.4)))
  }
  const dirAt = (a: number): V => [sgn * Math.cos(a), Math.sin(a)]
  part(r, (l) => {
    for (let i = 0; i < n; i++) {
      const [ca, sa] = dirAt(ang + spread * ((n - 1) / 2 - i))
      leaf(l, sx, sy, ca, sa, lens[i], wid, base)
    }
    if (cover) l.thick(sx, sy, sx + sgn * Math.cos(ang) * len * 0.42, sy + Math.sin(ang) * len * 0.42, 6, base)
    shadeFeather(l, true, base)
    // Feather separations on the outer half, and a violet sheen streak on the leading feather.
    for (let i = 0; i < n - 1; i++) {
      const [ca, sa] = dirAt(ang + spread * ((n - 1) / 2 - i - 0.5))
      const m = Math.min(lens[i], lens[i + 1])
      for (let d = m * 0.5; d < m * 0.92; d += 0.5) l.paint(rd(sx + ca * d), rd(sy + sa * d), F[2])
    }
    const [la, ls] = dirAt(ang - spread * ((n - 1) / 2) + 0.03)
    for (let d = len * 0.3; d < len * 0.62; d += 1)
      l.paint(rd(sx + la * d), rd(sy + ls * d + 0.6), d < len * 0.45 ? S[1] : S[2])
  })
}

/** A folded wing used as an arm, ending in a rounded wing-tip "fist" at the wrist. */
export function wingArm(r: Raster, sx: number, sy: number, hx: number, hy: number, tips = false, out = 1) {
  part(r, (l) => {
    // Stepped flight feathers fanning off the outer / lower edge: the wing reads as a wing, not a tube.
    {
      const dx0 = hx - sx
      const dy0 = hy - sy
      const d0 = Math.hypot(dx0, dy0) || 1
      const ux = dx0 / d0
      const uy = dy0 / d0
      let nx = -uy
      let ny = ux
      if (Math.abs(uy) > Math.abs(ux)) {
        nx = out
        ny = 0
      } else if (ny < 0) {
        nx = -nx
        ny = -ny
      }
      ;[
        [0.34, 5],
        [0.56, 6.5],
        [0.78, 6],
        [1.0, 5]
      ].forEach(([t, len]) => {
        const bx = sx + dx0 * t + nx * 1.2
        const by = sy + dy0 * t + ny * 1.2
        const ex = ux * 0.5 + nx * 0.85
        const ey = uy * 0.5 + ny * 0.85
        const el = Math.hypot(ex, ey) || 1
        leaf(l, bx, by, ex / el, ey / el, Math.min(len, d0 * 0.55 + 2), 2.8, W)
      })
    }
    const mx = sx + (hx - sx) * 0.5
    const my = sy + (hy - sy) * 0.5
    l.thick(sx, sy, mx, my, 6, W)
    l.thick(mx, my, hx, hy, 4.6, W)
    l.ellipse(hx, hy, 2.5, 2.5, W)
    if (tips) {
      const a = Math.atan2(hy - sy, hx - sx)
      for (const da of [-0.5, 0.05, 0.55]) leaf(l, hx, hy, Math.cos(a + da), Math.sin(a + da), 5, 2.6, W)
    }
    shadeFeather(l, true, W)
    // Covert highlight near the shoulder and a feather-row contour across the arm.
    l.paint(rd(sx + (hx - sx) * 0.18), rd(sy + (hy - sy) * 0.18 - 1), S[1])
    const dx = hx - sx
    const dy = hy - sy
    const d = Math.hypot(dx, dy) || 1
    const px = -dy / d
    const py = dx / d
    const cx = sx + dx * 0.55
    const cy = sy + dy * 0.55
    for (const k of [-1.5, -0.5, 0.5, 1.5]) l.paint(rd(cx + px * k), rd(cy + py * k), F[2])
  })
}

function drawWing(r: Raster, w: Wing, sx: number, sy: number, mir: boolean, s: number) {
  if ('arm' in w) wingArm(r, sx, sy, sx + w.arm[0] * s, sy + w.arm[1] * s, w.tips, mir ? -1 : 1)
  else fan(r, sx, sy, w.fan, w.len * s, mir, w.n ?? 5, w.spread ?? 0.17, 4.8 * Math.max(0.6, s), true, W)
}

/** The fist (wing-tip fingers) over the weapon grip. */
function fist(r: Raster, x: number, y: number) {
  part(r, (l) => {
    l.ellipse(x, y, 2.4, 2.2, W)
    shadeFeather(l, true, W)
    l.paint(rd(x - 1), rd(y - 1), S[1])
  })
}

/* ------------------------------------------------------------------ face */

const K = { k: C.black, w: C.white, s: S[2], b: S[1], d: S[3], p: R.ratPink[2], c: C.blush }
const EYE: Record<Eyes, { rows: string[]; dy: number }> = {
  open: { rows: ['.kkk.', 'kwwkk', 'kwwkk', 'kdddk', 'ksssk', '.kkk.'], dy: 0 },
  wide: { rows: ['.kkk.', 'kwwkk', 'kwwkk', 'kdddk', 'kssbk', '.kkk.'], dy: 0 },
  half: { rows: ['kkkkk', 'kwkkk', 'kdddk', '.sss.'], dy: 2 },
  shut: { rows: ['kkkkk'], dy: 4 },
  happy: { rows: ['.www.', 'w...w'], dy: 2 },
  x: { rows: ['w...w', '.w.w.', '..w..', '.w.w.', 'w...w'], dy: 1 },
  angry: { rows: ['.kkk.', 'kwwkk', 'kkkkk', 'kdddk', '.kkk.'], dy: 1 },
  squint: { rows: ['ww...', '.www.', '...ww', '.www.', 'ww...'], dy: 1 }
}

export function stampRows(r: Raster, rows: string[], x: number, y: number, key: Record<string, number>, flip = false) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]
      if (ch === '.') continue
      r.set(flip ? x + row.length - 1 - i : x + i, y + j, key[ch])
    }
  })
}

export function drawEye(r: Raster, kind: Eyes, x: number, y: number, mirror: boolean) {
  const e = EYE[kind]
  if (kind === 'squint') {
    const rows = mirror ? e.rows.map((row) => [...row].reverse().join('')) : e.rows
    stampRows(r, rows, x, y + e.dy, K)
  } else stampRows(r, e.rows, x, y + e.dy, K)
  if (kind === 'angry') {
    // Brow slanting down toward the beak.
    for (let i = 0; i < 5; i++) r.set(x + i, y - 1 + Math.floor((mirror ? 4 - i : i) * 0.6) - 0, S[1])
  }
}

export function drawBeakFront(r: Raster, x: number, y: number, open: number) {
  const key = { a: B[0], b: B[1], c: B[2], k: C.black, p: R.ratPink[2] }
  part(r, (l) => {
    if (open === 0) stampRows(l, ['aabbb', 'abbbc', '.bbc.', '..c..'], x - 2, y, key)
    else if (open === 1) stampRows(l, ['aabbb', 'abbbc', '.kkk.', '.ccc.'], x - 2, y, key)
    else stampRows(l, ['aabbb', 'abbbc', 'kkkkk', 'kpppk', '.ccc.'], x - 2, y, key)
  })
}

export function drawBeakSide(r: Raster, x: number, y: number, open: number) {
  const key = { a: B[0], b: B[1], c: B[2], k: C.black, p: R.ratPink[2] }
  part(r, (l) => {
    if (open === 0) stampRows(l, ['aaabb..', 'abbbbbb', '.bbbbcc', '..cccc.'], x, y, key)
    else if (open === 1) stampRows(l, ['aaabb..', 'abbbbbb', '..kkkk.', '.ccccc.'], x, y, key)
    else stampRows(l, ['aaabb..', 'abbbbbb', '..kppk.', '.kkkkk.', '..ccccc'], x, y, key)
  })
}

function drawFace(r: Raster, a: A, face: CFace) {
  if (a.dir === 'up') return
  const beak = face.beak ?? 0
  if (a.dir === 'down') {
    const ey = rd(a.hcy - 2.5 * a.s + (face.eyes === 'x' ? 0 : 0))
    const ex = rd(5 * a.s)
    const exL = rd(a.hx - 9 * a.s)
    const exR = rd(a.hx + 4 * a.s)
    drawEye(r, face.eyes, exL, ey, false)
    drawEye(r, face.eyes, exR, ey, true)
    void ex
    if (face.blush !== false && a.s > 0.7) {
      r.paint(exL - 1, ey + 6, C.blush)
      r.paint(exL, ey + 6, C.blush)
      r.paint(exR + 5, ey + 6, C.blush)
      r.paint(exR + 6, ey + 6, C.blush)
    }
    drawBeakFront(r, rd(a.hx), rd(a.hcy + 1 * a.s), beak)
  } else {
    const ey = rd(a.hcy - 2.5 * a.s)
    drawEye(r, face.eyes, rd(a.hx + 2 * a.s), ey, false)
    if (face.blush !== false && a.s > 0.7) {
      r.paint(rd(a.hx - 2), ey + 6, C.blush)
      r.paint(rd(a.hx - 1), ey + 6, C.blush)
    }
    drawBeakSide(r, rd(a.hx + a.hrx - 2 * a.s), rd(a.hcy - 0.5 * a.s), beak)
  }
}

/* ------------------------------------------------------------------ parts */

function drawLegs(r: Raster, a: A, p: CPose) {
  const mode = p.legs ?? 'stand'
  if (mode === 'none') return
  const side = a.dir === 'side'
  const stride = p.stride ?? 0
  const feet = a.feet
  const top = rd(a.bcy + 5 * a.s)
  const legs: [number, number][] = side
    ? [
        [rd(a.cx - 3 - stride * 3), 0],
        [rd(a.cx + 2 + stride * 3), 1]
      ]
    : [
        [rd(a.cx - 3.5 * a.s), 0],
        [rd(a.cx + 3.5 * a.s), 1]
      ]
  for (const [lx] of legs) {
    part(r, (l) => {
      if (mode === 'tuck') {
        l.rect(lx - 1, feet - 3, 2, 2, B[1])
        l.rect(lx - 2 + (side ? 1 : 0), feet - 1, 4, 1, B[2])
      } else {
        l.rect(lx - 1, top, 1, feet - 1 - top, B[1])
        l.rect(lx, top, 1, feet - 1 - top, B[2])
        l.rect(lx - 2 + (side ? 1 : 0), feet - 1, side ? 5 : 4, 1, B[1])
        l.set(lx - 2 + (side ? 1 : 0), feet - 1, B[0])
        l.rect(lx - 1 + (side ? 1 : 0), feet, side ? 4 : 2, 0, B[2])
      }
    })
  }
}

function drawTail(r: Raster, a: A, p: CPose, after: boolean) {
  const lift = p.tail ?? 0
  if (a.dir === 'side') {
    if (after) return
    // A fan trailing behind the rump.
    fan(r, rd(a.cx - 6), rd(a.bcy + 1), 0.55 - lift * 0.05, 17, true, 4, 0.2, 4.4, false)
  } else if (a.dir === 'down') {
    if (after) return
    // Only the tips peek out under the body.
    part(r, (l) => {
      leaf(l, a.cx - 3, a.bcy + 3, -0.55, 0.83, 13 * a.s, 4.2, F[1])
      shadeFeather(l)
    })
    part(r, (l) => {
      leaf(l, a.cx + 3, a.bcy + 3, 0.55, 0.83, 13 * a.s, 4.2, F[1])
      shadeFeather(l)
    })
  } else if (!after) {
    // Seen from the back: five tail feathers fan out below the rump, the middle one longest.
    fan(r, a.cx, rd(a.bcy + 5 * a.s), Math.PI / 2, 12.5 * a.s, false, 5, 0.34, 4.6, false)
  }
}

function drawBody(r: Raster, a: A, p: CPose) {
  const s = a.s
  const sq = p.squash ?? 0
  const rx = (9.5 + sq * 0.3) * s
  const ry = (9.5 - sq * 0.5) * s
  const shear = a.dir === 'side' ? (p.shear ?? 0) : 0
  const lx = a.bcx
  part(r, (l) => {
    blob(l, lx, a.bcy, rx, ry, BODY, shear)
    if (a.dir === 'up') {
      // Back: nape-to-shoulder feather rows (scallops) over the mantle.
      for (const [oy, n] of [
        [-4, 3],
        [-1, 4]
      ] as const)
        for (let i = 0; i < n; i++) {
          const vx = rd(lx + (i - (n - 1) / 2) * 5 * s)
          const vy = rd(a.bcy + oy * s)
          for (const [dx, dy] of [
            [-1, -1],
            [0, 0],
            [1, -1]
          ])
            if (l.get(vx + dx, vy + dy)) l.set(vx + dx, vy + dy, F[2])
        }
    } else {
      // Fluffy lighter chest patch.
      const pcx = a.dir === 'side' ? lx + 4.5 * s : lx
      const prx = (a.dir === 'side' ? 4.2 : 5.6) * s
      const pry = 6.4 * s
      const pcy = a.bcy + 0.5 * s
      for (let y = Math.floor(pcy - pry); y <= Math.ceil(pcy + pry); y++)
        for (let x = Math.floor(pcx - prx); x <= Math.ceil(pcx + prx); x++) {
          const nx = (x + 0.5 - pcx) / prx
          const ny = (y + 0.5 - pcy) / pry
          if (nx * nx + ny * ny > 1 || !l.get(x, y)) continue
          const c = nx * -0.5 + ny * -0.7 > 0.35 ? F[0] : nx * 0.5 + ny * 0.7 > 0.5 ? F[1] : F[0]
          l.set(x, y, c === F[1] ? F[1] : c)
        }
      // Feather scallops across the chest.
      for (const [oy, n] of [
        [0.3, 1],
        [3.4, 2]
      ] as const)
        for (let i = 0; i < n + 1; i++) {
          const vx = rd(pcx + (i - n / 2) * 4 * s)
          const vy = rd(pcy + oy * s)
          for (const [dx, dy] of [
            [-1, -1],
            [0, 0],
            [1, -1]
          ])
            if (l.get(vx + dx, vy + dy)) l.set(vx + dx, vy + dy, F[1])
        }
    }
  })
}

/** Back view: the folded wings lie over the rump, primaries crossing above the tail. */
function drawMantle(r: Raster, a: A) {
  const s = a.s
  for (const sg of [-1, 1]) {
    part(r, (l) => {
      const sx = a.cx + sg * 6.5 * s
      const sy = a.bcy - 6 * s
      const ex = a.cx - sg * 1.5 * s
      const ey = a.bcy + 9.5 * s
      const ang = Math.atan2(ey - sy, ex - sx)
      leaf(l, sx, sy, Math.cos(ang), Math.sin(ang), Math.hypot(ex - sx, ey - sy), 7.4 * s, W)
      shadeFeather(l, true, W)
      // Primaries: separation lines along the lower half, a violet sheen on the shoulder.
      for (const o of [-1.6, 0, 1.6]) {
        const nx = -Math.sin(ang) * o
        const ny = Math.cos(ang) * o
        for (let t = 0.5; t < 0.92; t += 0.04) l.paint(rd(sx + (ex - sx) * t + nx), rd(sy + (ey - sy) * t + ny), F[2])
      }
      l.paint(rd(sx + (ex - sx) * 0.18 - sg), rd(sy + (ey - sy) * 0.18), S[1])
      l.paint(rd(sx + (ex - sx) * 0.3 - sg), rd(sy + (ey - sy) * 0.3), S[2])
    })
  }
}

function drawHead(r: Raster, a: A, p: CPose) {
  part(r, (l) => {
    blob(l, a.hx, a.hcy, a.hrx, a.hry, HEAD)
    if (a.dir === 'up') {
      // Back of the head: feather rows sweeping down from the crown to the nape, a violet sheen streak on the left.
      for (const [oy, n] of [
        [1.5, 4],
        [4.5, 5],
        [7.5, 4]
      ] as const)
        for (let i = 0; i < n; i++) {
          const vx = rd(a.hx + (i - (n - 1) / 2) * 5.2 * a.s)
          const vy = rd(a.hcy + oy * a.s)
          for (const [dx, dy] of [
            [-1, -1],
            [0, 0],
            [1, -1]
          ])
            if (l.get(vx + dx, vy + dy)) l.set(vx + dx, vy + dy, S[3])
        }
      for (let i = 0; i < 5; i++) l.paint(rd(a.hx - 7 * a.s + i * 0.6), rd(a.hcy - 1 * a.s + i * 1.5), S[2])
    }
  })
  void p
}

/* ------------------------------------------------------------------ whole frame */

/**
 * Rim light: the first plumage pixel inside the silhouette outline picks up a 1px blue-violet reflection on the
 * upper-left edges (and a faint one on the lower-right), so the black bird still reads on night backgrounds.
 */
const RIM_BODY = new Uint8Array(256)
const RIM_DARK = new Uint8Array(256)
for (const c of [F[1], F[2], F[3], S[3]]) RIM_BODY[c] = 1
for (const c of [F[3], F[4], C.inkCool]) RIM_DARK[c] = 1

function rimLight(r: Raster) {
  const w = r.w
  const src = r.data.slice()
  for (let y = 2; y < r.h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x
      const c = src[i]
      if (!RIM_BODY[c]) continue
      const upEdge = RIM_DARK[src[i - w]] && !src[i - 2 * w]
      const leftEdge = RIM_DARK[src[i - 1]] && !src[i - 2]
      if (upEdge || leftEdge) r.data[i] = upEdge && leftEdge ? S[1] : S[2]
      else if (c !== S[3] && ((RIM_DARK[src[i + w]] && !src[i + 2 * w]) || (RIM_DARK[src[i + 1]] && !src[i + 2])))
        r.data[i] = S[3]
    }
}

export function renderCrow(job: JobId, dir: Dir, p: CPose): Raster {
  const r = new Raster(64, 64)
  const a = anchors(p, dir)
  const s = a.s
  const side = dir === 'side'
  const ramp = JOB_RAMP[job]
  const gear = !p.noGear
  const fx: WeaponFx = p.wfx ?? {}
  const restR: V = side ? [6, 7] : [4, 7]
  const restL: V = side ? [3, 8] : [-4, 7]
  const wR: Wing | null = p.wR === undefined ? { arm: restR } : p.wR
  const wL: Wing | null = p.wL === undefined ? { arm: restL } : p.wL
  const ang = p.ang ?? REST_ANG[job]
  const handOf = (w: Wing | null, sh: V): V | null =>
    w && 'arm' in w ? [sh[0] + w.arm[0] * s, sh[1] + w.arm[1] * s] : null
  const handR = handOf(wR, a.shR)
  let handL = handOf(wL, a.shL)
  const handA = handR ? { x: handR[0], y: handR[1], ang, dir } : null
  if (job === 'archer' && handA && (fx.draw ?? 0) > 0.1) handL = bowNock(handA, fx.draw ?? 0)

  // Behind everything.
  if (gear && job === 'archer' && dir !== 'up')
    drawQuiver(r, { x: side ? a.cx - 8 : a.cx + 8, y: rd(a.bcy - 9 * s), dir })
  if (gear && p.slung) {
    const hx = a.cx + (side ? -2 : 3)
    drawWeapon(r, job, { x: hx, y: rd(a.bcy - 3 * s), ang: job === 'archer' ? -0.75 : -0.95, dir }, {})
  }
  if (dir === 'up') {
    drawLegs(r, a, p)
    drawTail(r, a, p, false)
  } else {
    drawTail(r, a, p, false)
    drawLegs(r, a, p)
  }
  // Far wing in side view hides behind the body.
  if (side && wL && !p.wingsBack) drawWing(r, wL, a.shL[0], a.shL[1], true, s)

  drawBody(r, a, p)
  if (dir === 'up') drawMantle(r, a)
  if (job === 'archer' && gear && dir === 'up') drawQuiver(r, { x: a.cx + 4, y: rd(a.bcy - 5 * s), dir })
  if (job === 'cleric' && gear && s > 0.5) drawStole(r, a.cx, rd(a.bcy - 9.5 * s), 24 * s, 18 * s, dir)
  drawTail(r, a, p, true)

  const front = !p.wingsBack
  const wings = () => {
    if (!side && wL) drawWing(r, wL, a.shL[0], a.shL[1], true, s)
    else if (side && wL && p.wingsBack) drawWing(r, wL, a.shL[0], a.shL[1], true, s)
    if (wR) drawWing(r, wR, a.shR[0], a.shR[1], side, s)
  }
  if (!front) wings()
  drawHead(r, a, p)
  drawFace(r, a, p.face ?? { eyes: 'open' })
  p.mid?.(r, a, handR ?? [a.cx, a.feet])
  if (front) wings()

  rimLight(r)
  // Off hand gear.
  if (gear && job === 'sword' && !p.slung && handL && wL && 'arm' in wL) {
    if (side) drawBuckler(r, a.cx - 4, handL[1] - 1)
    else drawBuckler(r, handL[0] - 1, handL[1] - 1)
    fist(r, handL[0] + (side ? 3 : 2), handL[1])
  }
  if (gear && !p.slung && handA && wR && 'arm' in wR) {
    drawWeapon(r, job, handA, fx)
    fist(r, handA.x, handA.y)
    if (job === 'archer' && handL && (fx.draw ?? 0) > 0.1) fist(r, handL[0], handL[1])
  }
  if (!p.noHat)
    drawHeadgear(
      r,
      job,
      { x: rd(a.hx + (side ? -1 : 0)), y: rd(a.headTop - 0.5), w: rd(24 * s), dir, k: s < 0.95 ? s : 1 },
      p.sway ?? 0,
      p.tilt ?? 0
    )
  despeckleBox(r)
  p.fx?.(r, a, handR ?? [a.cx, a.feet])
  if (p.dim) {
    const t = dimTable(p.dim)
    r.map((c) => t[c])
  }
  void ramp
  return r
}

export { sparkle, glint, sweat } from './body'
