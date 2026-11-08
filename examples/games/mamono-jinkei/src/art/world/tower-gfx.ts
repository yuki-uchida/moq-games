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

/** The cloud sea at tile (a, b) of the 8×8 period: wind-stretched puffs lit from the top-left over deep blue. */
export function skyBase(a: number, b: number): Raster {
  const key = `${a},${b}`
  let r = skyCache.get(key)
  if (r) return r
  const pad = 2
  const n = T + pad * 2
  const ox = a * T
  const oy = b * T
  const f1 = field(ox, oy, 64, 64, 301, pad)
  const f2 = field(ox, oy, 32, 32, 302, pad)
  const f3 = field(ox, oy, 16, 16, 303, pad)
  const f4 = field(ox, oy, 128, 128, 305, pad)
  const h = new Float32Array(n * n)
  for (let i = 0; i < h.length; i++) h[i] = f4[i] * 0.2 + f1[i] * 0.38 + f2[i] * 0.27 + f3[i] * 0.15
  const at = (x: number, y: number) => h[(y + pad) * n + x + pad]
  r = new Raster(T, T)
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const v = at(x, y) + (bayer(x, y) - 0.5) * 0.04
      const d = at(x - 1, y - 1) - at(x + 1, y + 1)
      const ramp = [SK[3], SK[2], SK[1], SK[0], R.paper[0]]
      let tier = v < 0.45 ? 0 : v < 0.52 ? 1 : v < 0.64 ? 2 : v < 0.73 ? 3 : 4
      if (d > 0.05 && tier > 0 && tier < 4) tier++
      else if (d < -0.045 && tier > 1) tier--
      const c = ramp[tier]
      r.data[y * T + x] = c
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
