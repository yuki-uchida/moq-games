/** Shared helpers of the effect, item and UI painters. */
import { bayer, Raster, type Ramp } from '../raster'

export const TAU = Math.PI * 2
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3
export const easeOutBack = (t: number) => {
  const c = 1.9
  const x = clamp01(t) - 1
  return 1 + (c + 1) * x ** 3 + c * x ** 2
}
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Dither keep test: true for a fraction `a` of the pixels in an ordered pattern. */
export const keep = (x: number, y: number, a: number) => a >= 1 || (a > 0 && bayer(x, y) < a)

/** Four-point twinkle star: `len` arm length, colours core / arm / arm tip. */
export function sparkle(r: Raster, cx: number, cy: number, len: number, core: number, arm: number, tip = arm) {
  cx = Math.round(cx)
  cy = Math.round(cy)
  if (len >= 2) {
    for (let k = 1; k <= len; k++) {
      const c = k > len * 0.65 ? tip : arm
      r.set(cx + k, cy, c)
      r.set(cx - k, cy, c)
      r.set(cx, cy + k, c)
      r.set(cx, cy - k, c)
    }
    if (len >= 4) {
      const c = arm
      for (const [dx, dy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1]
      ])
        r.set(cx + dx, cy + dy, c)
    }
  } else if (len === 1) {
    r.set(cx + 1, cy, arm)
    r.set(cx - 1, cy, arm)
    r.set(cx, cy + 1, arm)
    r.set(cx, cy - 1, arm)
  }
  r.set(cx, cy, core)
}

/** Plus sign of arm length `s` and thickness 1 (or 2 when `fat`). */
export function plus(r: Raster, cx: number, cy: number, s: number, c: number, c2 = c) {
  cx = Math.round(cx)
  cy = Math.round(cy)
  for (let k = -s; k <= s; k++) {
    r.set(cx + k, cy, k === 0 ? c2 : c)
    r.set(cx, cy + k, k === 0 ? c2 : c)
  }
}

/** Shades a 0/1 mask with a ramp lit from the top-left: rim light, base, a two pixel shade band, a deep edge. */
export function shadeMask(m: Raster, ramp: Ramp, rim = true): Raster {
  const out = new Raster(m.w, m.h)
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (!m.get(x, y)) continue
      let c = ramp[1]
      if (!m.get(x + 2, y + 1) || !m.get(x + 1, y + 2)) c = ramp[2]
      if (!m.get(x + 1, y) || !m.get(x, y + 1)) c = ramp[3]
      if (rim && (!m.get(x - 1, y) || !m.get(x, y - 1)) && c === ramp[1]) c = ramp[0]
      out.set(x, y, c)
    }
  return out
}

/** A rounded-rectangle mask. */
export function roundRect(w: number, h: number, x: number, y: number, rw: number, rh: number, rad: number) {
  const m = new Raster(w, h)
  for (let j = 0; j < rh; j++)
    for (let i = 0; i < rw; i++) {
      const dx = Math.max(rad - 0.5 - i, i - (rw - 1 - (rad - 0.5)), 0)
      const dy = Math.max(rad - 0.5 - j, j - (rh - 1 - (rad - 0.5)), 0)
      if (dx * dx + dy * dy <= rad * rad) m.set(x + i, y + j, 1)
    }
  return m
}

/** Filled disc with ordered-dither fade: coverage `a` in 0..1. */
export function glowDisc(r: Raster, cx: number, cy: number, rad: number, c: number, a: number, ry = rad) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      const nx = (x + 0.5 - cx) / rad
      const ny = (y + 0.5 - cy) / ry
      if (nx * nx + ny * ny <= 1 && keep(x, y, a)) r.set(x, y, c)
    }
}

/** Removes pixels so that only a fraction `a` of the frame (ordered dither) remains. */
export function dissolve(r: Raster, a: number) {
  if (a >= 1) return r
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) if (r.data[y * r.w + x] && !keep(x, y, a)) r.data[y * r.w + x] = 0
  return r
}
