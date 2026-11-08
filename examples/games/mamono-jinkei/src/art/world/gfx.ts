/** Shared helpers for the stage art: periodic world noise, ramps, moss, leaf clusters, stone slabs. */
import { C, R } from '../palette'
import { Raster, type Ramp } from '../raster'

export const T = 64
/** All world noise repeats every 512 px (8 tiles), so tiles can be cached per (tx & 7, ty & 7). */
export const PERIOD = 512
export const mod = (a: number, n: number) => ((a % n) + n) % n

export const G = R.grass
export const GD = R.grassDark
export const D = R.dirt
export const S = R.stone
export const W = R.water
export const WOOD = R.wood
export const STEEL = R.steel
export const GOLD = R.gold

/** Fast integer hash to [0, 1). */
export function ih(x: number, y: number, s: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Periodic 2-D value noise in [0, 1]; `cell` must divide 512. */
export function vnoise(wx: number, wy: number, cell: number, seed: number) {
  const n = PERIOD / cell
  const gx = Math.floor(wx / cell)
  const gy = Math.floor(wy / cell)
  const fx = smooth(wx / cell - gx)
  const fy = smooth(wy / cell - gy)
  const a = ih(mod(gx, n), mod(gy, n), seed)
  const b = ih(mod(gx + 1, n), mod(gy, n), seed)
  const c = ih(mod(gx, n), mod(gy + 1, n), seed)
  const d = ih(mod(gx + 1, n), mod(gy + 1, n), seed)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

const vn1Tables = new Map<number, Float32Array>()

/** Periodic 1-D value noise in [0, 1] at integer positions (tabulated per cell size and seed). */
export function vn1(w: number, cell: number, seed: number) {
  const key = cell * 1000 + seed
  let tab = vn1Tables.get(key)
  if (!tab) {
    const n = PERIOD / cell
    tab = new Float32Array(PERIOD)
    for (let i = 0; i < PERIOD; i++) {
      const g = Math.floor(i / cell)
      const f = smooth(i / cell - g)
      const p = ih(mod(g, n), 7, seed)
      const q = ih(mod(g + 1, n), 7, seed)
      tab[i] = p + (q - p) * f
    }
    vn1Tables.set(key, tab)
  }
  return tab[mod(Math.floor(w), PERIOD)]
}

export const tile = () => new Raster(T, T)

/** Soft round moss / bush blob: dark rim bottom-right, light crescent top-left. */
export function blob(r: Raster, cx: number, cy: number, rx: number, ry: number, ramp: Ramp, mid = 1) {
  r.ellipse(cx + 0.5, cy + 0.7, rx, ry, ramp[mid + 1])
  r.ellipse(cx, cy, rx, ry, ramp[mid])
  r.ellipse(cx - rx * 0.28, cy - ry * 0.32, rx * 0.55, ry * 0.5, ramp[mid - 1])
}

/** One round leaf cluster: lit crescent top-left, shade crescent and a dark rim bottom-right. */
export function leafBlob(
  r: Raster,
  cx: number,
  cy: number,
  rad: number,
  ramp: readonly number[],
  clip?: [number, number, number, number]
) {
  const ry = rad * 0.86
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      if (clip && (x < clip[0] || y < clip[1] || x >= clip[2] || y >= clip[3])) continue
      const nx = (x + 0.5 - cx) / rad
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1) continue
      const d = -(nx * 0.55 + ny * 0.83)
      let c = ramp[1]
      if (q > 0.7 && d < -0.25) c = ramp[3]
      else if (d < -0.18 || (q > 0.55 && d < 0.05)) c = ramp[2]
      else if (d > 0.5 && q > 0.12 && q < 0.8) c = ramp[0]
      r.set(x, y, c)
    }
}

/**
 * Foliage made of overlapping leaf clusters on a jittered world grid (drawn back to front so lower ones overlap),
 * which gives scalloped silhouettes and no polygonal seams. `accept` limits which cluster centres exist.
 */
export function leafy(
  r: Raster,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ox: number,
  oy: number,
  ramp: readonly number[],
  cell = 16,
  seed = 11,
  fill = true,
  accept?: (x: number, y: number) => boolean
) {
  const n = PERIOD / cell
  if (fill) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) r.set(x, y, ramp[2])
  const rad0 = cell * 0.78
  for (let cy = Math.floor((oy + y0) / cell) - 1; cy <= Math.floor((oy + y1) / cell) + 1; cy++)
    for (let cx = Math.floor((ox + x0) / cell) - 1; cx <= Math.floor((ox + x1) / cell) + 1; cx++) {
      const mx = mod(cx, n)
      const my = mod(cy, n)
      const px = (cx + 0.15 + 0.7 * ih(mx, my, seed)) * cell - ox
      const py = (cy + 0.15 + 0.7 * ih(mx, my, seed + 1)) * cell - oy
      if (accept && !accept(px, py)) continue
      leafBlob(r, px, py, rad0 * (0.88 + 0.24 * ih(mx, my, seed + 2)), ramp, [x0, y0, x1, y1])
    }
}

export interface Slab {
  x0: number
  y0: number
  x1: number
  y1: number
  openL: boolean
  openR: boolean
  tone: number
}

/**
 * Flagstone layout of one tile. Rows are the same for a whole map row (only depends on ty), vertical joints vary per
 * tile but stay ≥ 9 px from the tile edges, so neighbours always meet cleanly.
 */
export function slabLayout(tx: number, ty: number, h = T, seed = 5): Slab[] {
  const a = mod(tx, 8)
  const b = mod(ty, 8)
  const y2 = 22 + Math.floor(ih(b, 0, seed) * 20)
  const rows: [number, number][] = [
    [0, Math.min(y2, h)],
    [y2, h]
  ]
  const out: Slab[] = []
  rows.forEach(([ya, yb], ri) => {
    if (yb - ya < 3) return
    const joints: number[] = []
    const j1 = 11 + Math.floor(ih(a, b * 2 + ri, seed + 1) * 42)
    joints.push(j1)
    if (ih(a, b * 2 + ri, seed + 2) < 0.28) {
      const j2 = j1 < 32 ? j1 + 14 + Math.floor(ih(a, b, seed + 3) * 10) : j1 - 14 - Math.floor(ih(a, b, seed + 3) * 10)
      if (j2 > 9 && j2 < 55) joints.push(j2)
    }
    joints.sort((p, q) => p - q)
    const xs = [0, ...joints, T]
    for (let i = 0; i < xs.length - 1; i++)
      out.push({
        x0: xs[i],
        y0: ya,
        x1: xs[i + 1],
        y1: yb,
        openL: i === 0,
        openR: i === xs.length - 2,
        tone: Math.floor(ih(a + i, b * 2 + ri, seed + 4) * 3)
      })
  })
  return out
}

/** Paints bevelled stone slabs with joints (dark gaps on bottom/right, lit top/left). */
export function paintSlabs(r: Raster, slabs: Slab[], ramp: readonly number[], joint: number = ramp[3]) {
  for (const s of slabs) {
    const body = s.tone === 2 ? ramp[0] : ramp[1]
    for (let y = s.y0; y < s.y1; y++)
      for (let x = s.x0; x < s.x1; x++) {
        let c = body
        if (s.tone === 2) c = ramp[1]
        const gapB = y === s.y1 - 1
        const gapR = !s.openR && x === s.x1 - 1
        if (gapB || gapR) c = joint
        else if (y === s.y0 || (!s.openL && x === s.x0)) c = ramp[0]
        else if (y === s.y1 - 2 || (!s.openR && x === s.x1 - 2)) c = ramp[2]
        r.set(x, y, c)
      }
  }
}

/** Short jagged crack from (x, y) heading in a direction. */
export function crack(
  r: Raster,
  x: number,
  y: number,
  dx: number,
  dy: number,
  len: number,
  rnd: () => number,
  c: number
) {
  let cx = x
  let cy = y
  for (let i = 0; i < len; i++) {
    r.set(cx, cy, c)
    const t = rnd()
    if (t < 0.5) cx += dx
    else if (t < 0.8) cy += dy
    else {
      cx += dx
      cy += dy
    }
  }
}

export const KIND_TONE = { black: C.black }

const SMOOTH = Float32Array.from({ length: 65 }, (_, i) => smooth(i / 64))

/** A 64×64 patch of periodic value noise (same values as `vnoise`, much cheaper per tile). Cell ∈ {16, 32, 64}. */
export function noisePatch(ox: number, oy: number, cell: number, seed: number) {
  const out = new Float32Array(T * T)
  const n = PERIOD / cell
  const m = T / cell + 2
  const lat = new Float32Array(m * m)
  const gx0 = Math.floor(ox / cell)
  const gy0 = Math.floor(oy / cell)
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) lat[j * m + i] = ih(mod(gx0 + i, n), mod(gy0 + j, n), seed)
  for (let y = 0; y < T; y++) {
    const wy = oy + y
    const gj = Math.floor(wy / cell) - gy0
    const fy = SMOOTH[Math.floor(((wy % cell) / cell) * 64)]
    for (let x = 0; x < T; x++) {
      const wx = ox + x
      const gi = Math.floor(wx / cell) - gx0
      const fx = SMOOTH[Math.floor(((wx % cell) / cell) * 64)]
      const a = lat[gj * m + gi]
      const b = lat[gj * m + gi + 1]
      const c = lat[(gj + 1) * m + gi]
      const d = lat[(gj + 1) * m + gi + 1]
      out[y * T + x] = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
    }
  }
  return out
}
