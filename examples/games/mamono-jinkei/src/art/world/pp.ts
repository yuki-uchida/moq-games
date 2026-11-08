/** Prop drawing helpers: sized frames from the contract, contact shadows, 3/4 boxes, cylinders, shards. */
import { PROPS_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, bayer, outline, type Ramp } from '../raster'
import { vnoise } from './gfx'
import { anim, type Anim } from '../sheet'

export const SPEC = PROPS_SPEC.meadow
export const frame = (name: string) => new Raster(SPEC[name].w, SPEC[name].h)

/** Builds the Anim of a contract entry from its frames. */
export function mk(name: string, frames: Raster[], extra: Partial<Anim> = {}): Anim {
  const s = SPEC[name]
  if (frames.length !== s.frames) throw new Error(`${name}: ${frames.length} frames, expected ${s.frames}`)
  return anim(frames, s.fps, s.loop, { ...(s.anchor ? { anchor: s.anchor } : {}), ...extra })
}

/** Soft ground shadow: a core with a dithered rim. */
export function shadow(r: Raster, cx: number, cy: number, rx: number, ry: number, core: number, rim = core) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1) continue
      if (q < 0.55) r.set(x, y, core)
      else if (bayer(x, y) < 0.5) r.set(x, y, rim)
    }
}

/** Paints under everything already drawn (for shadows added last). */
export function under(r: Raster, draw: (layer: Raster) => void) {
  const layer = new Raster(r.w, r.h)
  draw(layer)
  return layer.blit(r)
}

/**
 * A 3/4 box: top face (w × d) over a front face (w × h). Lit top-left: lit top, front mid, right edge shaded.
 * ramp = [highlight, base, shade, deep].
 */
export function box(r: Raster, x: number, y: number, w: number, d: number, h: number, ramp: readonly number[]) {
  for (let j = 0; j < d; j++)
    for (let i = 0; i < w; i++)
      r.set(x + i, y + j, j === 0 || i === 0 ? ramp[0] : i === w - 1 || j === d - 1 ? ramp[1] : ramp[0])
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let c = ramp[1]
      if (i === 0) c = ramp[0]
      else if (i >= w - 3) c = ramp[2]
      if (j === 0) c = ramp[0]
      if (j >= h - 2) c = ramp[2]
      if (j === h - 1) c = ramp[3]
      r.set(x + i, y + d + j, c)
    }
}

/** A lit vertical cylinder body between x0..x1 over rows y0..y1: columns shaded left (light) to right (dark). */
export function column(r: Raster, x0: number, x1: number, y0: number, y1: number, ramp: readonly number[], flutes = 0) {
  const w = x1 - x0
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const t = (x - x0 + 0.5) / w
      let c = t < 0.18 ? ramp[0] : t < 0.55 ? ramp[1] : t < 0.82 ? ramp[2] : ramp[3]
      if (flutes && (x - x0) % flutes === 0 && t > 0.1) c = c === ramp[0] ? ramp[1] : c === ramp[1] ? ramp[2] : ramp[3]
      r.set(x, y, c)
    }
}

/** A small flying shard (3–4 px chunk) with a lit corner. */
export function shard(r: Raster, x: number, y: number, size: number, ramp: readonly number[], turn = 0) {
  const pts =
    turn % 3 === 0
      ? [0, 0, size, 1, size - 1, size, 0, size - 1]
      : turn % 3 === 1
        ? [1, 0, size, 0, size - 1, size - 1, 0, size]
        : [0, 1, size - 1, 0, size, size - 1, 1, size]
  r.poly(
    pts.map((v, i) => v + (i % 2 ? y : x)),
    ramp[1]
  )
  r.set(Math.round(x + 1), Math.round(y + 1), ramp[0])
  r.set(Math.round(x + size - 1), Math.round(y + size - 1), ramp[2])
}

/** Stone block texture details: moss and crack helpers use these colours. */
export const MOSS = R.grassDark
export const INK = C.inkCool

export { outline, bayer }
export type { Ramp }

/** Shades a union of ellipsoids as one lumpy solid (heightfield + noise), lit from the top-left. */
export function solid(
  r: Raster,
  lumps: readonly (readonly [number, number, number, number, number])[],
  ramp: readonly number[],
  amp = 3,
  seed = 5
) {
  const h = (x: number, y: number) => {
    let best = -1
    for (const [cx, cy, rx, ry, rz] of lumps) {
      const nx = (x - cx) / rx
      const ny = (y - cy) / ry
      const q = nx * nx + ny * ny
      if (q < 1) best = Math.max(best, Math.sqrt(1 - q) * rz)
    }
    return best < 0 ? -1 : best + vnoise(x + 64, y + 64, 16, seed) * amp + vnoise(x, y, 8, seed + 1) * amp * 0.4
  }
  const L = [-0.55, -0.7, 0.45]
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      const z = h(x + 0.5, y + 0.5)
      if (z < 0) continue
      const at = (px: number, py: number) => {
        const v = h(px, py)
        return v < 0 ? z : v
      }
      const hx = at(x + 1.5, y + 0.5) - at(x - 0.5, y + 0.5)
      const hy = at(x + 0.5, y + 1.5) - at(x + 0.5, y - 0.5)
      const len = Math.hypot(hx, hy, 2)
      const d = (-hx * L[0] - hy * L[1] + 2 * L[2]) / len
      r.set(x, y, d > 0.8 ? ramp[0] : d > 0.42 ? ramp[1] : d > 0.12 ? ramp[2] : ramp[3])
    }
  return r
}
