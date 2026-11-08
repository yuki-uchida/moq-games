/**
 * `tech:wolf` (月下群狼陣): the joint howl ring (`howl_wave`), the moon flaring behind the pack (`moon`), the claw
 * streak of each lunge (`lunge_0..15`) and the closing crescent wave (`crescent_0..15`). Directional effects are drawn
 * natively per turn in oriented coordinates (u along the travel direction, v across): nothing is rotated or scaled.
 */
import { TECH_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, bayer, hash, rng } from '../raster'
import { anim, type Sheet } from '../sheet'
import { glint, sparkle } from './body'

const ICE = R.ice
const MAG = R.magic
const MOON = R.moon
const TURN = (Math.PI * 2) / 16

/* ------------------------------------------------------------------ howl_wave */

/** The expanding sound ring around the pack. */
function howlFrame(i: number): Raster {
  const S = 320
  const r = new Raster(S, S)
  const cx = S / 2
  const cy = S / 2
  const radius = [44, 84, 120, 146, 156][i]
  const width = [10, 9, 7, 5, 3][i]
  const wob = [1, 1.4, 1.8, 1.6, 1.2][i]
  const glow = [10, 14, 14, 10, 0][i]
  const hi = radius + width * 1.5 + 5
  const lo = radius - width / 2 - glow - 3
  const lo2 = Math.max(0, lo) ** 2
  const hi2 = hi * hi
  for (let y = Math.max(0, Math.floor(cy - hi)); y < Math.min(S, Math.ceil(cy + hi)); y++)
    for (let x = Math.max(0, Math.floor(cx - hi)); x < Math.min(S, Math.ceil(cx + hi)); x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d2 = dx * dx + dy * dy
      if (d2 > hi2 || d2 < lo2) continue
      const d = Math.sqrt(d2)
      const a = Math.atan2(dy, dx)
      // Lit from the top-left: the lower right of the ring is shaded.
      const lit = -(Math.cos(a) * 0.6 + Math.sin(a) * 0.8)
      const rr = radius + Math.sin(a * 9 + i * 1.7) * wob
      const off = d - rr
      if (Math.abs(off) <= width / 2) {
        const t = off / (width / 2)
        let c: number = ICE[1]
        if (Math.abs(t) > 0.5) c = lit > 0.05 ? ICE[0] : ICE[2]
        else if (lit > 0.3) c = C.white
        else if (lit < -0.45) c = ICE[2]
        if (i >= 3 && Math.sin(a * 14 + i * 2) > 0.55) continue
        r.set(x, y, c)
        continue
      }
      // Soft wave front trailing inward: ordered dither fading toward the centre.
      const behind = -off - width / 2
      if (behind > 0 && behind < glow) {
        const t = 1 - behind / glow
        if (bayer(x, y) < 0.62 * t * t) r.set(x, y, lit > 0 ? ICE[0] : ICE[1])
        continue
      }
      // Outer broken ring.
      const outer = off - width * 1.1 - 2
      if (i > 0 && Math.abs(outer) <= 0.9 && Math.sin(a * 7 - i * 1.3) > 0.1) r.set(x, y, lit > 0 ? ICE[0] : ICE[2])
    }
  // Sparkles riding the ring.
  const rand = rng(hash(7, i))
  const n = [5, 8, 10, 8, 6][i]
  for (let k = 0; k < n; k++) {
    const a = ((k + rand() * 0.6) / n) * Math.PI * 2 + i * 0.5
    const rd = radius + (rand() - 0.5) * 24
    const x = Math.round(cx + Math.cos(a) * rd)
    const y = Math.round(cy + Math.sin(a) * rd)
    if (k % 3 === 0) sparkle(r, x, y, ICE, i > 0 && i < 4 ? 2 : 1)
    else if (k % 3 === 1) sparkle(r, x, y, MOON, 1)
    else glint(r, x, y, ICE)
  }
  return r
}

/* ------------------------------------------------------------------ moon */

/** A full pale-gold moon with soft flares; `rad` is the disc radius, `flare` 0..1 the ray length. */
function moonFrame(rad: number, flare: number, phase: number): Raster {
  const S = 256
  const r = new Raster(S, S)
  const cx = S / 2
  const cy = S / 2
  // Soft glow around the disc (ordered dither fading outward) and long flare rays behind it.
  const glowR = 26 * flare + 8
  for (let y = Math.floor(cy - rad - glowR); y <= Math.ceil(cy + rad + glowR); y++)
    for (let x = Math.floor(cx - rad - glowR); x <= Math.ceil(cx + rad + glowR); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - rad
      if (d < 0 || d > glowR) continue
      const t = 1 - d / glowR
      if (bayer(x, y) < 0.7 * t * t) r.set(x, y, t > 0.55 ? MOON[0] : MOON[1])
    }
  if (flare > 0)
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + phase
      const len = rad + 52 * flare + 8
      const px = -Math.sin(a)
      const py = Math.cos(a)
      const x0 = cx + Math.cos(a) * (rad + 2)
      const y0 = cy + Math.sin(a) * (rad + 2)
      r.poly(
        [x0 + px * 3.2, y0 + py * 3.2, cx + Math.cos(a) * len, cy + Math.sin(a) * len, x0 - px * 3.2, y0 - py * 3.2],
        MOON[1]
      )
      r.poly(
        [
          x0 + px * 1.4,
          y0 + py * 1.4,
          cx + Math.cos(a) * (len - 5),
          cy + Math.sin(a) * (len - 5),
          x0 - px * 1.4,
          y0 - py * 1.4
        ],
        MOON[0]
      )
    }
  // The disc: spherical shading from the top-left, craters on top.
  const craters: [number, number, number][] = [
    [0.3, -0.25, 0.2],
    [-0.35, 0.2, 0.26],
    [0.1, 0.5, 0.13],
    [-0.1, -0.5, 0.1],
    [0.55, 0.22, 0.09]
  ]
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++)
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      const nx = (x + 0.5 - cx) / rad
      const ny = (y + 0.5 - cy) / rad
      const q = nx * nx + ny * ny
      if (q > 1) continue
      const nz = Math.sqrt(1 - q)
      const light = nx * -0.5 + ny * -0.6 + nz * 0.62
      let c: number = light > 0.82 ? MOON[0] : light > 0.28 ? MOON[1] : light > -0.1 ? MOON[2] : MOON[3]
      for (const [ox, oy, cr] of craters) {
        const cd = Math.hypot(nx - ox, ny - oy) / cr
        if (cd < 1) c = cd < 0.62 || (nx - ox) * -0.6 + (ny - oy) * -0.8 < 0 ? MOON[2] : MOON[3]
        // lit rim on the lower right of each crater
        else if (cd < 1.2 && (nx - ox) * 0.6 + (ny - oy) * 0.8 > 0.4) c = MOON[0]
      }
      r.set(x, y, c)
    }
  // Outline: warm dark edge on the shaded side only.
  const src = r.clone()
  for (let y = Math.floor(cy - rad) - 1; y <= Math.ceil(cy + rad) + 1; y++)
    for (let x = Math.floor(cx - rad) - 1; x <= Math.ceil(cx + rad) + 1; x++) {
      if (src.get(x, y)) continue
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (Math.hypot(dx, dy) < rad + 1.4 && dx * 0.6 + dy * 0.8 > -0.1 * rad) r.set(x, y, MOON[3])
    }
  return r
}

/* ------------------------------------------------------------------ lunge */

interface Slash {
  /** Lateral offset of the stroke from the axis. */
  v: number
  /** Tail and head along the axis. */
  tail: number
  head: number
  /** Maximum width. */
  w: number
}

/** The three claw slashes of a lunge, drawn along direction `a` (turns of 22.5°). */
function lungeFrame(a: number, i: number): Raster {
  const S = 96
  const r = new Raster(S, S)
  const A = a * TURN
  const ca = Math.cos(A)
  const sa = Math.sin(A)
  const c = S / 2
  // The streak travels with the wolf: the head moves forward each frame, the tail drags and then fades.
  const head = [-6, 14, 30, 34][i]
  const reach = [24, 44, 56, 40][i]
  const slashes: Slash[] = [
    { v: -8, tail: head - reach * 0.78, head: head - 4, w: 3.4 },
    { v: 0, tail: head - reach, head, w: 4.6 },
    { v: 8, tail: head - reach * 0.86, head: head - 8, w: 3.4 }
  ]
  const lim = 46
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      if (dx * dx + dy * dy > lim * lim) continue
      const u = dx * ca + dy * sa
      const v = -dx * sa + dy * ca
      let best = 0
      let bestD = 9
      for (const s of slashes) {
        if (u < s.tail || u > s.head) continue
        const t = (u - s.tail) / (s.head - s.tail)
        // Slight fan-out toward the front and a gentle curve like a raking claw.
        const centre = s.v * (0.55 + 0.45 * t) + (t - 0.5) * (t - 0.5) * 3 * Math.sign(s.v || 1) * -1
        const w = s.w * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.7) + 0.4
        const off = Math.abs(v - centre)
        if (off > w / 2) continue
        const k = off / (w / 2)
        const lit = -(ca * 0.6 + sa * 0.8) * 0 + (v - centre) * (sa * 0.6 - ca * 0.8) * 0
        void lit
        let col: number = C.white
        if (k > 0.78) col = ICE[1]
        else if (k > 0.5) col = ICE[0]
        // The trailing third thins to blue.
        if (t < 0.28) col = k > 0.5 ? MAG[1] : ICE[0]
        if (k < bestD) {
          bestD = k
          best = col
        }
      }
      if (best) r.set(x, y, best)
    }
  // Impact flare at the head and a few flung specks.
  const hx = c + ca * (head + 3)
  const hy = c + sa * (head + 3)
  if (i < 3) sparkle(r, Math.round(hx), Math.round(hy), ICE, i === 1 ? 2 : 1)
  const rand = rng(hash(11, a, i))
  for (let k = 0; k < 3 + i; k++) {
    const u = head - rand() * reach
    const v = (rand() - 0.5) * 26
    glint(r, Math.round(c + ca * u - sa * v), Math.round(c + sa * u + ca * v), k % 2 ? ICE : MAG)
  }
  return r
}

/* ------------------------------------------------------------------ crescent */

/** A crescent moon of silver-blue energy flying along direction `a`. */
function crescentFrame(a: number, i: number): Raster {
  const S = 160
  const r = new Raster(S, S)
  const A = a * TURN
  const ca = Math.cos(A)
  const sa = Math.sin(A)
  const c = S / 2
  const u0 = [-30, -8, 12, 30][i]
  const sc = [0.62, 1, 1, 0.82][i]
  const R0 = 33 * sc
  const d = (i === 3 ? 8 : 12) * sc
  const Ri = R0
  const trails = [0, 1, 2, 2][i]
  // Pixel window: the crescent and its afterimages.
  const reach = R0 * 1.1 + 2
  const cxs = [c + ca * u0, c + ca * (u0 - trails * 14 * sc)]
  const cys = [c + sa * u0, c + sa * (u0 - trails * 14 * sc)]
  const x0 = Math.max(0, Math.floor(Math.min(...cxs) - reach))
  const x1 = Math.min(S, Math.ceil(Math.max(...cxs) + reach))
  const y0 = Math.max(0, Math.floor(Math.min(...cys) - reach))
  const y1 = Math.min(S, Math.ceil(Math.max(...cys) + reach))
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      const u = dx * ca + dy * sa
      const v = -dx * sa + dy * ca
      const dOut = R0 - Math.hypot(u - u0, v)
      const dIn = Math.hypot(u - u0 + d, v) - Ri
      if (dOut >= 0 && dIn >= 0) {
        let col: number = ICE[0]
        if (dOut < 1.4) col = C.white
        else if (dIn < 1.5) col = MAG[1]
        else if (dIn < 3.4) col = ICE[1]
        else if (dOut < 3.2) col = R.paper[0]
        r.set(x, y, col)
        continue
      }
      // Afterimages: thin hollow arcs trailing behind.
      for (let t = 1; t <= trails; t++) {
        const k = 1 - t * 0.13
        const du = u0 - t * 14 * sc
        const o = R0 * k - Math.hypot(u - du, v)
        const inn = Math.hypot(u - du + d * k, v) - Ri * k
        if (o >= 0 && o < 1.7 && inn >= 0 && (Math.floor(v / 4) + t) % 4 !== 0) r.set(x, y, t === 1 ? ICE[1] : MAG[2])
      }
    }
  // Sparks flying off the horns and the trailing air.
  const rand = rng(hash(23, a, i))
  const put = (u: number, v: number, big: boolean) => {
    const x = Math.round(c + ca * u - sa * v)
    const y = Math.round(c + sa * u + ca * v)
    if (big) sparkle(r, x, y, ICE, 1)
    else glint(r, x, y, rand() > 0.5 ? ICE : MAG)
  }
  put(u0 - d * 0.6, -R0 * 1.05, i > 0)
  put(u0 - d * 0.6, R0 * 1.05, i > 0)
  for (let k = 0; k < 4; k++) put(u0 - 8 - rand() * 30, (rand() - 0.5) * R0 * 2.1, false)
  return r
}

/** Builds `tech:wolf`. */
export function wolfTechSheet(): Sheet {
  const sheet: Sheet = {}
  for (const [name, spec] of Object.entries(TECH_SPEC.wolf)) {
    const turn = /^(lunge|crescent)_(\d+)$/.exec(name)
    const frames: Raster[] = []
    for (let i = 0; i < spec.frames; i++) {
      if (name === 'howl_wave') frames.push(howlFrame(i))
      else if (name === 'moon')
        frames.push(moonFrame([36, 54, 72, 82, 80, 74][i], [0, 0.3, 0.8, 1, 0.7, 0.3][i], i * 0.12))
      else if (turn?.[1] === 'lunge') frames.push(lungeFrame(Number(turn[2]), i))
      else if (turn?.[1] === 'crescent') frames.push(crescentFrame(Number(turn[2]), i))
      else frames.push(new Raster(spec.w, spec.h))
    }
    sheet[name] = anim(frames, spec.fps, spec.loop)
  }
  return sheet
}
