/** Stage 3 prop helpers: contract-sized frames, stone / brass boxes, swinging parts, polygon gears. */
import { PROPS_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, bayer, outline, part } from '../raster'
import { anim, type Anim } from '../sheet'
import { GOLD, S, WOOD, STEEL, G, GD, D, mod } from './gfx'
import { RK, RT, SK } from './tower-gfx'
import { shadow as ppShadow, shard } from './pp'

export { GOLD, S, WOOD, STEEL, G, GD, D, RK, RT, SK, C, R, part, outline, bayer, shard }

export const SPEC = PROPS_SPEC.tower
export const frame = (name: string) => new Raster(SPEC[name].w, SPEC[name].h)

/** Builds the Anim of a contract entry from its frames. */
export function mk(name: string, frames: Raster[], extra: Partial<Anim> = {}): Anim {
  const s = SPEC[name]
  if (!s) throw new Error(`tower prop ${name} is not in the contract`)
  if (frames.length !== s.frames) throw new Error(`${name}: ${frames.length} frames, expected ${s.frames}`)
  return anim(frames, s.fps, s.loop, { ...(s.anchor ? { anchor: s.anchor } : {}), ...extra })
}

/** Contact shadow tuned for rock and stone grounds. */
export const shade = (r: Raster, cx: number, cy: number, rx: number, ry: number) =>
  ppShadow(r, cx, cy, rx, ry, RK[3], RK[2])

/**
 * A 3/4 stone box lit from the top-left: top face (w × d) over a front face (w × h).
 * `ramp` = [highlight, base, shade, deep]; mortar joints are drawn when `courses` > 0.
 */
export function block3(
  r: Raster,
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  ramp: readonly number[],
  courses = 0
) {
  for (let j = 0; j < d; j++)
    for (let i = 0; i < w; i++) {
      let c = ramp[0]
      if (i === 0 || j === 0) c = ramp[0]
      else if (i >= w - 2 || j >= d - 1) c = ramp[1]
      r.set(x + i, y + j, c)
    }
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let c = ramp[1]
      if (i === 0) c = ramp[0]
      else if (i >= w - 3) c = ramp[2]
      if (j === 0) c = ramp[0]
      if (j >= h - 3) c = ramp[2]
      if (j === h - 1) c = ramp[3]
      if (courses && j > 2 && j < h - 3 && i > 0) {
        const ch = Math.floor(h / courses)
        if (j % ch === 0) c = ramp[2]
        else if (j % ch === 1) c = ramp[0]
        const course = Math.floor(j / ch)
        const jx = (course % 2 ? w / 3 : (w * 2) / 3) | 0
        if (j % ch > 1 && i === jx) c = ramp[2]
      }
      r.set(x + i, y + d + j, c)
    }
}

/** Brass rivet: a lit dot with a dark underside. */
export function rivet(r: Raster, x: number, y: number) {
  r.set(x, y, GOLD[0])
  r.set(x + 1, y, GOLD[1])
  r.set(x, y + 1, GOLD[2])
  r.set(x + 1, y + 1, GOLD[3])
}

/** A brass strap segment (vertical or horizontal) with lit top-left edge. */
export function strap(r: Raster, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let c = GOLD[1]
      if (i === 0 || j === 0) c = GOLD[0]
      else if (i === w - 1 || j === h - 1) c = GOLD[2]
      r.set(x + i, y + j, c)
    }
}

/** A wood plank column / beam (vertical lit bevel). */
export function post(r: Raster, x: number, y0: number, y1: number, w: number) {
  for (let y = y0; y < y1; y++)
    for (let i = 0; i < w; i++) {
      const t = (i + 0.5) / w
      let c = t < 0.2 ? WOOD[0] : t < 0.6 ? WOOD[1] : t < 0.85 ? WOOD[2] : WOOD[3]
      if (i > 0 && i < w - 1 && mod(y * 3 + i * 5, 17) === 0) c = WOOD[2]
      r.set(x + i, y, c)
    }
}

/** A horizontal wood beam. */
export function beam(r: Raster, x0: number, x1: number, y: number, h: number) {
  for (let j = 0; j < h; j++)
    for (let x = x0; x < x1; x++) {
      const t = (j + 0.5) / h
      let c = t < 0.25 ? WOOD[0] : t < 0.65 ? WOOD[1] : t < 0.85 ? WOOD[2] : WOOD[3]
      if (j > 0 && j < h - 1 && mod(x * 5 + j * 3, 19) === 0) c = WOOD[2]
      r.set(x, y + j, c)
    }
}

/** Rotates a layer about a pivot (px, py) by `angle` radians and composites it so the pivot lands at (cx, cy). */
export function swing(target: Raster, layer: Raster, px: number, py: number, angle: number, cx: number, cy: number) {
  const big = new Raster(layer.w * 2, layer.h * 2)
  big.blit(layer, layer.w - px, layer.h - py)
  const rot = big.rotate(angle)
  target.blit(rot, cx - layer.w, cy - layer.h)
}

/** Polygon gear mask drawn as a shaded brass disc with spokes; `phase` turns it (radians). */
export function gearSprite(
  size: number,
  cx: number,
  cy: number,
  rOut: number,
  teeth: number,
  phase: number,
  spokes = 5
) {
  const r = new Raster(size, size)
  const rIn = rOut - 4
  const rHub = rOut * 0.28
  const rRim = rOut * 0.74
  const mask = new Uint8Array(size * size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.hypot(dx, dy)
      if (d > rOut + 0.5) continue
      const a = Math.atan2(dy, dx) - phase
      const tt = ((((a / (Math.PI * 2)) * teeth) % 1) + 1) % 1
      const tooth = tt < 0.5 ? 1 : 0
      const edge = tooth ? rOut : rIn
      // slight taper on tooth sides
      if (d > edge) continue
      if (d > rRim && d < rRim + 0 && false) continue
      let inside = true
      if (d < rRim - 1 && d > rHub + 1.5) {
        // spoke windows
        const sa = ((((a / (Math.PI * 2)) * spokes) % 1) + 1) % 1
        const half = 0.5 - 0.14 * (1 - (d - rHub) / (rRim - rHub))
        if (Math.abs(sa - 0.5) < half * 0.62) inside = false
      }
      if (inside) mask[y * size + x] = 1
    }
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && mask[y * size + x] === 1
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (!has(x, y)) continue
      let c = GOLD[1]
      if (!has(x - 1, y) || !has(x, y - 1)) c = GOLD[0]
      else if (!has(x + 1, y) || !has(x, y + 1)) c = GOLD[3]
      else if (!has(x - 2, y - 2) || !has(x - 1, y - 1)) c = GOLD[0]
      else if (!has(x + 2, y + 2) || !has(x + 1, y + 1)) c = GOLD[2]
      r.set(x, y, c)
    }
  // hub
  r.ellipse(cx, cy, rHub, rHub, GOLD[2])
  r.ellipse(cx - 0.5, cy - 0.5, rHub - 1, rHub - 1, GOLD[1])
  r.set(cx - 1, cy - 1, GOLD[0])
  r.ellipse(cx + 0.5, cy + 0.5, 1.2, 1.2, GOLD[3])
  return r
}

export { anim }
export const rimLight = (r: Raster) => r
