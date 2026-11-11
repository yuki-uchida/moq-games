/**
 * `fx` (3/3): heart, confettiA/B/C, zzz, alert, anger, sweat, dizzy, arrow. Marks and symbols that sit over
 * characters and the world: bold, outlined, readable at 1×.
 */
import type { SheetModule } from '../module'
import { C, R, type Ramp } from '../palette'
import { Raster, outlineWith } from '../raster'
import { TAU, frames, make, starPts } from './impacts'

// ------------------------------------------------------------------------------------------------- heart

function heart(): Raster[] {
  // Pulse: small, full, big, full again (the seam steps from "full" down to "small").
  const scale = [0.86, 1, 1.03, 0.97]
  return scale.map((k) => {
    const r = new Raster(16, 16)
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const px = ((x + 0.5 - 8) / 6.4 / k) * 1.18
        const py = -((y + 0.5 - 8.6) / 6.2 / k) * 1.18
        const v = (px * px + py * py - 1) ** 3 - px * px * py ** 3
        if (v <= 0) r.set(x, y, R.hamEar[1])
      }
    const src = r.clone()
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (!src.get(x, y)) continue
        if (!src.get(x + 1, y) || !src.get(x, y + 1) || !src.get(x + 1, y + 1)) r.set(x, y, R.hamEar[2])
      }
    // Highlight on the left lobe.
    const hx = Math.round(8 - 3.2 * k)
    const hy = Math.round(8.6 - 3.1 * k)
    r.paint(hx, hy, C.white)
    r.paint(hx + 1, hy - 1, R.hamEar[0])
    r.paint(hx, hy + 1, R.hamEar[0])
    return outlineWith(r, R.hamEar[4])
  })
}

// ---------------------------------------------------------------------------------------------- confetti

/** A tumbling paper flake: a rectangle turning in 3D (its width swings through a thin edge-on moment). */
function confetti(ramp: Ramp, kind: 'strip' | 'square' | 'ribbon'): Raster[] {
  const [hw, hh] = kind === 'strip' ? [2.6, 1.4] : kind === 'square' ? [1.8, 1.8] : [2.6, 1.1]
  return [0, 1, 2, 3].map((f) => {
    const r = new Raster(8, 8)
    const spin = f * (Math.PI / 2) + 0.45 + (kind === 'ribbon' ? 0.5 : 0)
    const k = Math.cos(spin)
    const rot = f * 0.7 + (kind === 'square' ? 0.4 : 0)
    const hk = Math.max(0.8, Math.abs(k) * hh + (kind === 'ribbon' ? Math.sin(spin * 2) * 0.5 : 0))
    const pts: number[] = []
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1]
    ]) {
      const x = sx * hw
      const y = sy * hk
      pts.push(4 + x * Math.cos(rot) - y * Math.sin(rot), 4 + x * Math.sin(rot) + y * Math.cos(rot))
    }
    const face = k >= 0 ? ramp[1] : ramp[2]
    r.poly(pts, face)
    if (!r.count())
      r.line(4 - hw * Math.cos(rot), 4 - hw * Math.sin(rot), 4 + hw * Math.cos(rot), 4 + hw * Math.sin(rot), face)
    // A light edge on the upper-left side of the face keeps the flake from reading as a flat blob.
    const src = r.clone()
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++)
        if (src.get(x, y) && (!src.get(x - 1, y) || !src.get(x, y - 1)) && k > 0.4) r.set(x, y, ramp[0])
    return outlineWith(r, ramp[3])
  })
}

// ---------------------------------------------------------------------------------------------- zzz

function zzz(): Raster[] {
  return [
    [6, 2, 3, 7],
    [8, 2, 4, 4],
    [9, 2.4, 3, 2]
  ].map(([n, wd, x, y]) => {
    const r = new Raster(16, 16)
    const z = new Raster(16, 16)
    z.thick(x + 1, y + 1, x + n - 0.5, y + 1, wd, R.moon[0])
    z.thick(x + n - 0.5, y + 1, x + 1, y + n - 0.5, wd, R.moon[1])
    z.thick(x + 1, y + n - 0.5, x + n - 0.5, y + n - 0.5, wd, R.moon[1])
    // Shade the lower-right of the strokes.
    const src = z.clone()
    for (let yy = 0; yy < 16; yy++)
      for (let xx = 0; xx < 16; xx++)
        if (src.get(xx, yy) && (!src.get(xx, yy + 1) || !src.get(xx + 1, yy))) z.set(xx, yy, R.moon[2])
    r.blit(outlineWith(z, R.moon[4]))
    return r
  })
}

// ------------------------------------------------------------------------------------------- alert, anger

function alert(): Raster[] {
  return [0, 1].map((f) => {
    const r = new Raster(16, 24)
    const s = f ? 1 : 0
    // The bar widens toward the top and tapers down; the dot sits below. On the pop frame everything stretches.
    const top = 4 - s
    const barH = 11 + s
    const body = new Raster(16, 24)
    for (let j = 0; j < barH; j++) {
      const half = 3 - Math.floor((j * 2) / barH) + (f ? 0.6 : 0)
      body.rect(Math.round(8 - half), top + j, Math.round(half * 2), 1, R.fire[1])
    }
    body.ellipse(8, top + barH + 3.2, 2.5 + s * 0.3, 2.5 + s * 0.3, R.fire[1])
    const src = body.clone()
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 16; x++) {
        if (!src.get(x, y)) continue
        if (!src.get(x + 1, y) || !src.get(x, y + 1)) body.set(x, y, R.fire[2])
        else if (!src.get(x - 1, y) || !src.get(x, y - 1)) body.set(x, y, R.fire[0])
      }
    r.blit(outlineWith(outlineWith(body, R.fire[4]), C.white))
    if (f)
      for (const [x0, y0, x1, y1] of [
        [2, 6, 1, 4],
        [14, 6, 14, 4],
        [2, 12, 1, 12],
        [13, 12, 14, 12]
      ]) {
        r.line(x0, y0, x1, y1, R.fire[2])
      }
    return r
  })
}

/** The cross-shaped anger vein: four curved wedges, each bulging outward, around an empty centre. */
function anger(): Raster[] {
  return [0, 1].map((f) => {
    const r = new Raster(16, 16)
    const gap = f ? 2.6 : 2
    const reach = f ? 6.4 : 5
    const body = new Raster(16, 16)
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1]
    ]) {
      // A bracket: a quarter ring whose ends point at the neighbouring arms.
      body.ring(
        8 + dx * (gap + reach * 0.55),
        8 + dy * (gap + reach * 0.55),
        reach * 0.38,
        reach * 0.74,
        R.crimson[1],
        dx < 0 ? (dy < 0 ? 0 : -Math.PI / 2) : dy < 0 ? Math.PI / 2 : -Math.PI,
        dx < 0 ? (dy < 0 ? Math.PI / 2 : 0) : dy < 0 ? Math.PI : -Math.PI / 2
      )
    }
    const src = body.clone()
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (!src.get(x, y)) continue
        if (!src.get(x + 1, y) || !src.get(x, y + 1)) body.set(x, y, R.crimson[2])
        else if (!src.get(x - 1, y) || !src.get(x, y - 1)) body.set(x, y, R.crimson[0])
      }
    r.blit(outlineWith(body, R.crimson[4]))
    return r
  })
}

// ------------------------------------------------------------------------------------------ sweat, dizzy

function sweat(): Raster[] {
  // A drop flying off along an arc, with a speed streak behind it; it shrinks and thins as it goes.
  return [
    [5.5, 10, 3, 1.15],
    [8.5, 7.5, 3.2, 1],
    [11.5, 5.5, 2.4, 0.8]
  ].map(([x, y, rad, st]) => {
    const r = new Raster(16, 16)
    const d = new Raster(16, 16)
    d.ellipse(x, y + 1, rad * 0.85, rad * 0.9, R.water[1])
    d.poly([x, y - rad * 1.4 * st, x - rad * 0.8, y + 0.3, x + rad * 0.8, y + 0.3], R.water[1])
    const src = d.clone()
    for (let yy = 0; yy < 16; yy++)
      for (let xx = 0; xx < 16; xx++)
        if (src.get(xx, yy) && (!src.get(xx + 1, yy) || !src.get(xx, yy + 1))) d.set(xx, yy, R.water[2])
    d.paint(Math.round(x - 1), Math.round(y + 1), C.white)
    d.paint(Math.round(x - 1), Math.round(y + 2), R.water[0])
    r.blit(outlineWith(d, R.water[4]))
    r.line(x - 4, y + 4, x - 3, y + 3, R.water[0])
    return r
  })
}

function dizzy(): Raster[] {
  return frames(4, 48, 24, (r, f) => {
    // Three stars on an ellipse seen from the side: those at the bottom (near) are bigger and drawn last.
    const stars = [0, 1, 2]
      .map((k) => {
        const a = (f / 12 + k / 3) * TAU
        return { x: 24 + Math.cos(a) * 15.5, y: 11 + Math.sin(a) * 4.8, z: Math.sin(a) }
      })
      .sort((a, b) => a.z - b.z)
    for (const s of stars) {
      const rad = 3.6 + 1.8 * (s.z * 0.5 + 0.5)
      const l = new Raster(48, 24)
      l.poly(starPts(s.x, s.y + 0.4, rad, rad * 0.45, 5, -Math.PI / 2), s.z > 0 ? R.gold[1] : R.gold[2])
      if (s.z > 0) l.paint(Math.round(s.x - 1), Math.round(s.y - 1), R.gold[0])
      r.blit(outlineWith(l, R.gold[4]))
    }
  })
}

// ------------------------------------------------------------------------------------------------- arrow

function arrow(): Raster[] {
  return [-2, 2].map((dx) => {
    const r = new Raster(32, 32)
    const cx = 16 + dx
    r.poly([cx - 11, 12, cx + 1, 12, cx + 1, 5, cx + 12, 16, cx + 1, 27, cx + 1, 20, cx - 11, 20], R.gold[1])
    const src = r.clone()
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        if (src.get(x, y) !== R.gold[1]) continue
        if (!src.get(x, y + 1) || !src.get(x + 1, y + 1)) r.set(x, y, R.gold[2])
        else if (!src.get(x - 1, y) || !src.get(x, y - 1)) r.set(x, y, R.gold[0])
      }
    // A light stripe along the top of the shaft and a pale glint on the head.
    r.rect(cx - 9, 13, 9, 1, R.gold[0])
    r.paint(cx + 2, 9, R.gold[0])
    r.paint(cx + 3, 10, R.gold[0])
    return outlineWith(r, R.gold[4])
  })
}

export const sheets: SheetModule = {
  fx: () => ({
    heart: make('heart', heart),
    confettiA: make('confettiA', () => confetti(R.hamEar, 'strip')),
    confettiB: make('confettiB', () => confetti(R.gold, 'square')),
    confettiC: make('confettiC', () => confetti(R.moon, 'ribbon')),
    zzz: make('zzz', zzz),
    alert: make('alert', alert),
    anger: make('anger', anger),
    sweat: make('sweat', sweat),
    dizzy: make('dizzy', dizzy),
    arrow: make('arrow', arrow)
  })
}
