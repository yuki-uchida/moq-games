/**
 * `tech:rat`: the effect sprites of チューチュー大行進 — a billowing dust trail, gnawed wood chips and speed lines.
 * (The heroes themselves run in their own dash frames.) Drawn natively, deterministic.
 */
import { TECH_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, ball, hash, rng } from '../raster'
import { anim, type Sheet } from '../sheet'
import { part } from './layer'

const D = R.dirt

/** Dust: puffs spawn at the right (the runners), drift left, grow and fade out. Seamless over 6 frames. */
function dustFrame(f: number): Raster {
  const r = new Raster(96, 64)
  const puffs: { x: number; y: number; rad: number; fade: number }[] = []
  const N = 8
  for (let i = 0; i < N; i++) {
    const phase = (i / N + f / 6 / N) % 1
    const g = rng(hash(i, 7))
    const rad = 3 + phase * 10 + g() * 1.5
    puffs.push({
      x: 88 - phase * 82,
      y: 50 - phase * 7 - rad * 0.35 + (g() - 0.5) * 6,
      rad,
      fade: Math.max(0, (phase - 0.6) / 0.4)
    })
  }
  puffs.sort((a, b) => b.rad - a.rad)
  for (const p of puffs) {
    const layer = new Raster(96, 64)
    ball(layer, p.x, p.y, p.rad * (1 - p.fade * 0.25), p.rad * 0.95 * (1 - p.fade * 0.25), D, true)
    // Flat ground contact.
    for (let y = 57; y < 64; y++) for (let x = 0; x < 96; x++) layer.set(x, y, 0)
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 96; x++) {
        const c = layer.get(x, y)
        if (!c) continue
        // Lighter and softer as the puff ages.
        const lift = p.fade > 0.7 ? 2 : p.fade > 0.3 ? 1 : 0
        const idx = D.indexOf(c)
        r.set(x, y, idx > 0 ? D[Math.max(0, idx - lift)] : c)
      }
  }
  // Grit flying out of the cloud.
  const g = rng(hash(f, 99))
  for (let i = 0; i < 6; i++) {
    const x = 20 + Math.floor(g() * 70)
    const y = 40 + Math.floor(g() * 15)
    r.set(x, y, i % 2 ? D[2] : R.stone[1])
  }
  return r
}

/** Wood chips burst out of a barricade: a flash, then chips tumbling out and falling. */
function chipFrame(f: number): Raster {
  const r = new Raster(64, 64)
  const g = rng(hash(5, 31))
  const chips: { a: number; v: number; kind: number }[] = []
  for (let i = 0; i < 11; i++) chips.push({ a: -Math.PI * (0.05 + 0.9 * g()), v: 7 + g() * 11, kind: i % 3 })
  const t = f / 4
  part(r, (l) => {
    for (const [i, c] of chips.entries()) {
      if (f === 4 && i % 2) continue
      const x = 32 + Math.cos(c.a) * c.v * (0.3 + t * 2.4)
      const y = 36 + Math.sin(c.a) * c.v * (0.3 + t * 2.4) + 26 * t * t * 1.4
      const px = Math.round(x)
      const py = Math.round(y)
      const spin = (i + f) % 3
      const big = f < 3 && i % 3 !== 1
      if (spin === 0) {
        l.rect(px, py, big ? 4 : 3, 2, R.wood[1])
        l.set(px, py, R.wood[0])
        l.set(px + (big ? 3 : 2), py + 1, R.wood[2])
      } else if (spin === 1) {
        l.rect(px, py, 2, big ? 4 : 3, R.wood[1])
        l.set(px, py, R.wood[0])
        l.set(px + 1, py + (big ? 3 : 2), R.wood[2])
      } else {
        l.set(px, py, R.wood[0])
        l.set(px + 1, py + 1, R.wood[1])
        l.set(px + 2, py + 2, R.wood[2])
        l.set(px + 1, py, R.wood[1])
      }
    }
  })
  // Sawdust and impact flash.
  const s = rng(hash(f, 77))
  for (let i = 0; i < 12 - f * 2; i++) {
    const a = s() * Math.PI * 2
    const d = 3 + s() * (6 + f * 6)
    r.set(
      Math.round(32 + Math.cos(a) * d),
      Math.round(36 + Math.sin(a) * d * 0.8 + f * 2),
      i % 3 ? R.hay[0] : R.dirt[0]
    )
  }
  if (f === 0) {
    for (let d = 2; d <= 7; d++) {
      r.set(32 - d, 36, C.white)
      r.set(32 + d, 36, C.white)
      r.set(32, 36 - d, C.white)
      r.set(32, 36 + d, C.white)
    }
    r.ellipse(32, 36, 3, 3, C.white)
  }
  return r
}

/** Speed lines streaming around a rat (feet on 32,56). */
function auraFrame(f: number): Raster {
  const r = new Raster(64, 64)
  const lines: [number, number, number][] = [
    [9, 6, 15],
    [15, 20, 11],
    [21, 0, 9],
    [43, 12, 9],
    [49, 24, 12],
    [55, 2, 15],
    [30, 30, 8],
    [37, 36, 7]
  ]
  for (const [x, off, len] of lines) {
    const y0 = ((off + f * 12) % 52) + 2
    for (let i = 0; i < len; i++) {
      const y = y0 + i
      if (y > 59) continue
      const c = i < 2 || i >= len - 2 ? R.paper[2] : R.paper[0]
      r.set(x, y, c)
      if (x % 2 && i > 2 && i < len - 3) r.set(x + 1, y, R.paper[2])
    }
    if (len > 10) r.set(x + 1, y0 + Math.floor(len / 2), R.paper[1])
  }
  // A few glints.
  r.set(14, 10 + f * 8, C.spark)
  r.set(50, 44 - f * 7 + 28 * (f > 2 ? 1 : 0), C.spark)
  return r
}

/** Builds `tech:rat`. */
export function ratTechSheet(): Sheet {
  const spec = TECH_SPEC.rat
  const out: Sheet = {}
  const mk = (name: string, fn: (f: number) => Raster, extra = {}) =>
    (out[name] = anim(
      Array.from({ length: spec[name].frames }, (_, f) => fn(f)),
      spec[name].fps,
      spec[name].loop,
      extra
    ))
  mk('stampede_dust', dustFrame)
  mk('gnaw_chips', chipFrame)
  mk('rush_aura', auraFrame, { anchor: [32, 56] as const })
  return out
}
