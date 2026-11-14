/**
 * Where a drawn frame's paint is, in world pixels: the opaque bounds of a raster (worked out once per raster) placed
 * the way `blit` places it (its anchor on the rounded point, mirrored about the anchor column when flipped). Pure
 * and allocation-free once the bounds are cached, so it can run every frame.
 */
import type { Anim } from '../art'
import type { Raster } from '../art/raster'

/** A box in pixels. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export const newBox = (): Box => ({ x: 0, y: 0, w: 0, h: 0 })

const opaque = new WeakMap<Raster, Box | null>()

/** The opaque bounds of a raster in its own pixels (null when nothing is painted), computed once. */
export function opaqueBounds(r: Raster): Box | null {
  let b = opaque.get(r)
  if (b === undefined) opaque.set(r, (b = r.bounds() ?? null))
  return b
}

const unions = new WeakMap<Anim, Box | null>()

/** The union of the opaque bounds of every frame of a clip (null when none is painted), computed once. */
export function clipBounds(anim: Anim): Box | null {
  let u = unions.get(anim)
  if (u !== undefined) return u
  u = null
  for (const frame of anim.frames) {
    const b = opaqueBounds(frame)
    if (!b) continue
    if (!u) u = { ...b }
    else {
      const x1 = Math.max(u.x + u.w, b.x + b.w)
      const y1 = Math.max(u.y + u.h, b.y + b.h)
      u.x = Math.min(u.x, b.x)
      u.y = Math.min(u.y, b.y)
      u.w = x1 - u.x
      u.h = y1 - u.y
    }
  }
  unions.set(anim, u)
  return u
}

/** Places bounds `b` (frame pixels) of a frame drawn with `anchor` on (x, y), flipped or not, into `out`. */
export function placeBox(
  b: Box,
  anchor: readonly [number, number],
  x: number,
  y: number,
  flip: boolean,
  out: Box
): Box {
  const ax = anchor[0]
  x = Math.round(x)
  y = Math.round(y)
  // Flipped, frame column i covers [x + ax - i - 1, x + ax - i] (see `blitRaster`).
  out.x = flip ? x + ax - (b.x + b.w) : x - ax + b.x
  out.y = y - anchor[1] + b.y
  out.w = b.w
  out.h = b.h
  return out
}

/** Whether two boxes share a pixel. */
export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** A frame as it is drawn: the raster, its anchor, the point it is drawn on and its flip. */
export interface Placed {
  raster: Raster | null
  anchor: readonly [number, number]
  x: number
  y: number
  flip: boolean
}

export const newPlaced = (): Placed => ({ raster: null, anchor: [0, 0], x: 0, y: 0, flip: false })

/** Whether the world pixel (wx, wy) (whole pixels) is painted by a placed frame. */
export function paintedAt(p: Placed, wx: number, wy: number) {
  const r = p.raster
  if (!r) return false
  const x = Math.round(p.x)
  const i = p.flip ? x + p.anchor[0] - wx - 1 : wx - (x - p.anchor[0])
  const j = wy - (Math.round(p.y) - p.anchor[1])
  return r.get(i, j) !== 0
}
