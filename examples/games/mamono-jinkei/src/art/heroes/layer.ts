/**
 * Bounding-box versions of raster.ts `outline`, `part` and `despeckle`: identical results, but they only visit the
 * painted area, which keeps whole-sheet generation fast (a frame has ~15 layers on a 64×64 canvas).
 */
import { DARKER, OUTLINE_OF } from '../palette'
import { Raster } from '../raster'

const litOutline = (c: number) => {
  const two = DARKER[DARKER[c]]
  return two === c ? OUTLINE_OF[c].deep : two
}

/** A raster that remembers the box of everything written through set(), so layers never need a full scan. */
export class Layer extends Raster {
  x0 = Infinity
  y0 = Infinity
  x1 = -1
  y1 = -1
  override set(x: number, y: number, c: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) {
      this.data[y * this.w + x] = c
      if (x < this.x0) this.x0 = x
      if (x > this.x1) this.x1 = x
      if (y < this.y0) this.y0 = y
      if (y > this.y1) this.y1 = y
    }
  }
}

/** Selective outline (same rule as raster.ts ) limited to the written box. */
export function outlineBox(r: Raster) {
  const L = r as Layer
  const known = L.x1 >= 0
  const b = known ? { x: L.x0, y: L.y0, w: L.x1 - L.x0 + 1, h: L.y1 - L.y0 + 1 } : r.bounds()
  if (!b) return r
  const bx = Math.max(0, b.x - 1)
  const by = Math.max(0, b.y - 1)
  const bw = Math.min(r.w, b.x + b.w + 1) - bx
  const bh = Math.min(r.h, b.y + b.h + 1) - by
  // Padded copy so neighbour reads need no bounds checks.
  const pw = bw + 2
  const src = new Uint8Array(pw * (bh + 2))
  for (let j = 0; j < bh; j++) src.set(r.data.subarray((by + j) * r.w + bx, (by + j) * r.w + bx + bw), (j + 1) * pw + 1)
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++) {
      const p = (j + 1) * pw + i + 1
      if (src[p]) continue
      const left = src[p - 1] || src[p - pw]
      if (left) r.data[(by + j) * r.w + bx + i] = OUTLINE_OF[left].line
      else {
        const right = src[p + 1] || src[p + pw]
        if (right) r.data[(by + j) * r.w + bx + i] = litOutline(right)
      }
    }
  return r
}

/** Draws one layer, outlines it and composites it (overlaps become inner contours). */
export function part(target: Raster, draw: (layer: Raster) => void, line = true) {
  const layer = new Layer(target.w, target.h)
  draw(layer)
  if (line) outlineBox(layer)
  if (layer.x1 < 0) return target
  for (let y = layer.y0; y <= layer.y1; y++)
    for (let x = layer.x0; x <= layer.x1; x++) {
      const c = layer.data[y * layer.w + x]
      if (c) target.data[y * target.w + x] = c
    }
  return target
}

/** Removes orphan pixels and single off-colour specks (same rule as raster.ts ), bounding-box only. */
export function despeckleBox(r: Raster) {
  const b = r.bounds()
  if (!b) return r
  const src = r.clone()
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      const c = src.get(x, y)
      if (!c) continue
      const l = src.get(x - 1, y)
      const u = src.get(x, y - 1)
      const rt = src.get(x + 1, y)
      const d = src.get(x, y + 1)
      if (!l && !u && !rt && !d) r.set(x, y, 0)
      else if (l === u && u === rt && rt === d && l !== c && OUTLINE_OF[l].deep === OUTLINE_OF[c].deep) r.set(x, y, l)
    }
  return r
}

/** Painted box of a raster: tracked for layers, scanned otherwise. */
export function boxOf(r: Raster) {
  const L = r as Layer
  if (L.x1 >= 0) return { x: L.x0, y: L.y0, w: L.x1 - L.x0 + 1, h: L.y1 - L.y0 + 1 }
  return r.bounds()
}
