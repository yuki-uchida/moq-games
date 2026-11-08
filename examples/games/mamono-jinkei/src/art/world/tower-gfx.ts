/** Stage 3 shared helpers: anisotropic periodic noise, the cloud sea, ropes and wood. */
import { R } from '../palette'
import { Raster, bayer } from '../raster'
import { D, T, ih, mod } from './gfx'

export const RK = R.rock
export const SK = R.sky
export const RT = R.roofTile

const SMOOTH = Float32Array.from({ length: 129 }, (_, i) => {
  const t = i / 128
  return t * t * (3 - 2 * t)
})
const lattices = new Map<string, Float32Array>()
function lattice(cw: number, ch: number, seed: number) {
  const key = `${cw},${ch},${seed}`
  let l = lattices.get(key)
  if (!l) {
    const nx = 512 / cw
    const ny = 512 / ch
    l = new Float32Array(nx * ny)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) l[j * nx + i] = ih(i, j, seed)
    lattices.set(key, l)
  }
  return l
}

/** Periodic (512 px) value noise on a size×size patch whose top-left world pixel is (ox - pad, oy - pad). */
export function field(ox: number, oy: number, cw: number, ch: number, seed: number, pad = 0, size = T) {
  const n = size + pad * 2
  const out = new Float32Array(n * n)
  const nx = 512 / cw
  const ny = 512 / ch
  const l = lattice(cw, ch, seed)
  for (let y = 0; y < n; y++) {
    const wy = mod(oy - pad + y, 512)
    const gj = Math.floor(wy / ch)
    const fy = SMOOTH[Math.floor(((wy % ch) / ch) * 128)]
    const r0 = gj * nx
    const r1 = ((gj + 1) % ny) * nx
    for (let x = 0; x < n; x++) {
      const wx = mod(ox - pad + x, 512)
      const gi = Math.floor(wx / cw)
      const fx = SMOOTH[Math.floor(((wx % cw) / cw) * 128)]
      const gi1 = (gi + 1) % nx
      const a = l[r0 + gi]
      const b = l[r0 + gi1]
      const c = l[r1 + gi]
      const d = l[r1 + gi1]
      out[y * n + x] = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
    }
  }
  return out
}

const skyCache = new Map<string, Raster>()
const BAYER = Float32Array.from({ length: 16 }, (_, i) => bayer(i & 3, i >> 2))
/** The sky repeats every 32×24 tiles (2048×1536 px), wider than any view. */
export const SKY_W = 32
export const SKY_H = 24
const PX = SKY_W * T
const PY = SKY_H * T
const skyLattices = new Map<string, Float32Array>()
function skyLattice(cell: number, seed: number) {
  const nx = PX / cell
  const ny = PY / cell
  const key = `${cell},${seed}`
  let l = skyLattices.get(key)
  if (!l) {
    l = new Float32Array(nx * ny)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) l[j * nx + i] = ih(i, j, seed)
    skyLattices.set(key, l)
  }
  return l
}
function skyNoise(l: Float32Array, wx: number, wy: number, cell: number) {
  const nx = PX / cell
  const ny = PY / cell
  const gx = Math.floor(wx / cell)
  const gy = Math.floor(wy / cell)
  const fx = (wx - gx * cell) / cell
  const fy = (wy - gy * cell) / cell
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const x0 = mod(gx, nx)
  const y0 = mod(gy, ny)
  const x1 = (x0 + 1) % nx
  const y1 = (y0 + 1) % ny
  const p = l[y0 * nx + x0]
  const q = l[y0 * nx + x1]
  const r = l[y1 * nx + x0]
  const s = l[y1 * nx + x1]
  return p + (q - p) * sx + (r - p) * sy + (p - q - r + s) * sx * sy
}

/**
 * The cloud sea at tile (a, b) of the 32×24 sky period: wide, soft cloud masses in pale blue with lit crests on the
 * top-left, soft blue-grey undersides and a few tiny distant wisps. Kept calm and low-contrast so platforms pop.
 */
export function skyBase(a: number, b: number): Raster {
  const key = `${a},${b}`
  let r = skyCache.get(key)
  if (r) return r
  const pad = 3
  const n = T + pad * 2
  const ox = a * T
  const oy = b * T
  // height sampled on an 8 px grid, then bilinearly smoothed up to pixels
  const L1 = skyLattice(256, 311)
  const L2 = skyLattice(128, 312)
  const L3 = skyLattice(64, 313)
  const L4 = skyLattice(32, 314)
  const cn = Math.ceil(n / 8) + 2
  const coarse = new Float32Array(cn * cn)
  for (let j = 0; j < cn; j++)
    for (let i = 0; i < cn; i++) {
      const wx = ox - pad + (i - 1) * 8
      const wy = oy - pad + (j - 1) * 8
      coarse[j * cn + i] =
        skyNoise(L1, wx, wy, 256) * 0.3 +
        skyNoise(L2, wx, wy, 128) * 0.36 +
        skyNoise(L3, wx, wy, 64) * 0.24 +
        skyNoise(L4, wx, wy, 32) * 0.1
    }
  const h = new Float32Array(n * n)
  for (let y = 0; y < n; y++) {
    const v = y / 8 + 1
    const j = Math.floor(v)
    const fy = v - j
    for (let x = 0; x < n; x++) {
      const u = x / 8 + 1
      const i = Math.floor(u)
      const fx = u - i
      const p = coarse[j * cn + i]
      const q = coarse[j * cn + i + 1]
      const s = coarse[(j + 1) * cn + i]
      const t = coarse[(j + 1) * cn + i + 1]
      h[y * n + x] = p + (q - p) * fx + (s - p) * fy + (p - q - s + t) * fx * fy
    }
  }
  const at = (x: number, y: number) => h[(y + pad) * n + x + pad]
  r = new Raster(T, T)
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const v = at(x, y)
      const d = at(x - 3, y - 3) - at(x + 3, y + 3)
      const z = BAYER[(y & 3) * 4 + (x & 3)]
      let c: number = SK[1]
      // crests catch the light, mostly where the surface faces the top-left
      if (v + d * 1.8 > 0.545 + (z - 0.5) * 0.1) c = SK[0]
      // blue-grey undersides on the lower-right flanks of the masses
      if (d < -0.02 && v > 0.44 && z < Math.min(0.9, (-d - 0.02) * 16 + 0.3)) c = SK[2]
      // broad shallow hollows
      if (v < 0.43 && z < Math.min(0.5, (0.43 - v) * 5)) c = SK[2]
      r.data[y * T + x] = c
    }
  // a few tiny distant wisps
  for (let k = 0; k < 2; k++) {
    if (ih(a, b, 330 + k) > 0.3) continue
    const wx = 12 + Math.floor(ih(a, b, 335 + k) * 40)
    const wy = 8 + Math.floor(ih(a, b, 340 + k) * 48)
    const len = 6 + Math.floor(ih(a, b, 345 + k) * 8)
    for (let i = 0; i < len; i++) {
      const yy = wy + (i > len * 0.6 ? 1 : 0)
      r.set(wx + i, yy, i < 2 || i > len - 3 ? SK[1] : SK[0])
      if (i > 1 && i < len - 2) r.set(wx + i, yy + 1, SK[2])
    }
  }
  skyCache.set(key, r)
  return r
}

/** A hanging rope between two points (sagging by `sag` px), 2 px thick with a twist pattern. */
export function rope(r: Raster, x0: number, y0: number, x1: number, y1: number, sag = 2, thick = 2) {
  const len = Math.max(1, Math.abs(x1 - x0))
  for (let i = 0; i <= len; i++) {
    const t = i / len
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag
    const twist = (i >> 1) % 2
    for (let k = 0; k < thick; k++) r.set(x, y + k, k === 0 ? (twist ? D[1] : D[2]) : twist ? D[3] : D[3])
  }
}

/** A vertical rope of height h at x (twisted). */
export function ropeV(r: Raster, x: number, y: number, h: number, thick = 2) {
  for (let i = 0; i < h; i++) {
    const twist = (i >> 1) % 2
    for (let k = 0; k < thick; k++) r.set(x + k, y + i, k === 0 ? (twist ? D[1] : D[2]) : twist ? D[3] : D[3])
  }
}

/** The sky of the tile at map position (tx, ty) (shared, do not modify). */
export const skyAt = (tx: number, ty: number) => skyBase(mod(tx, SKY_W), mod(ty, SKY_H))

/** A copy of the sky of tile (tx, ty) with the painted pixels of `layer` on top. */
export function overSky(tx: number, ty: number, layer: Raster) {
  const out = skyAt(tx, ty).clone()
  const d = out.data
  const l = layer.data
  for (let i = 0; i < l.length; i++) if (l[i]) d[i] = l[i]
  return out
}
