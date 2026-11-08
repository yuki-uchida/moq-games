/** Sheet `fx`, stages 2–4 effects (sewer, tower, forest) plus the reworked spin, soul and telegraph. */
import { FX_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, ball, outlineWith, rng } from '../raster'
import { anim, type Anim, type Sheet } from '../sheet'
import { TAU, clamp01, dissolve, easeOut, glowDisc, keep, plus, shadeMask, sparkle } from './util'

const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b)
const frames = (n: number, draw: (f: number, t: number) => Raster) =>
  Array.from({ length: n }, (_, f) => draw(f, n === 1 ? 0 : f / (n - 1)))
function make(name: string, fr: Raster[], extra: Partial<Anim> = {}): Anim {
  const s = FX_SPEC[name]
  return anim(fr, s.fps, s.loop, { ...(s.anchor ? { anchor: s.anchor } : {}), ...extra })
}

// ---------------------------------------------------------------------------------------------------------------
// Sewer

function bombFrame(f: number): Raster {
  const r = new Raster(32, 32)
  const w = f ? 1 : 0
  const m = new Raster(32, 32)
  m.ellipse(16, 21 + w, 8.5, 8, 1)
  m.rect(13, 9 + w, 6, 6, 1)
  m.rect(12, 13 + w, 8, 3, 1)
  const body = shadeMask(m, R.poison)
  r.blit(body)
  // Glass neck is paler, the liquid line sits across the belly.
  for (let y = 9 + w; y < 14 + w; y++) for (let x = 13; x < 19; x++) r.set(x, y, x < 15 ? R.ice[0] : R.ice[1])
  for (let x = 9; x < 24; x++) if (r.get(x, 17 + w)) r.set(x, 17 + w, R.poison[0])
  // A purple dreg sloshing at the bottom.
  for (let y = 24 + w; y < 30; y++)
    for (let x = 8; x < 25; x++) if (r.get(x, y) && keep(x, y, 0.6)) r.set(x, y, R.shadow[1])
  // Bubbles and glass shine.
  r.set(14 + f, 21, R.poison[0])
  r.set(18 - f, 24, R.poison[0])
  r.paint(11, 19 + w, C.white)
  r.paint(11, 20 + w, C.white)
  r.paint(12, 18 + w, C.white)
  outlineWith(r, C.inkGreen, false)
  // Cork and a fizzing fuse spark.
  r.rect(13, 6 + w, 6, 3, R.wood[1])
  r.rect(13, 8 + w, 6, 1, R.wood[2])
  outlineWith(r, C.inkWarm, false)
  sparkle(r, f ? 20 : 12, 3 + w, f ? 3 : 2, C.white, R.fire[0], R.fire[1])
  r.set(f ? 22 : 10, 2, R.fire[1])
  return r
}

function bombBurstFrame(f: number): Raster {
  const size = 96
  const r = new Raster(size, size)
  const c = 48
  const t = f / 5
  const g = rng(321)
  const ringR = 40 * (0.2 + 0.8 * easeOut(t))
  const thick = Math.max(2, (1 - t) * 9 + 2)
  const fade = t < 0.5 ? 1 : 1 - ((t - 0.5) / 0.5) * 0.9
  glowDisc(r, c, c, ringR, R.poison[2], 0.18 * (1 - t))
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = hyp(x + 0.5 - c, y + 0.5 - c)
      if (d > ringR || d < ringR - thick || !keep(x, y, fade)) continue
      const q = (d - (ringR - thick)) / thick
      r.set(x, y, q > 0.8 ? R.shadow[2] : q > 0.55 ? R.shadow[1] : q > 0.3 ? R.poison[1] : R.poison[0])
    }
  if (t < 0.55) {
    const k = 1 - t / 0.55
    r.ellipse(c, c, 6 + 16 * k, 6 + 16 * k, R.poison[1])
    r.ellipse(c, c, 4 + 12 * k, 4 + 12 * k, R.poison[0])
    r.ellipse(c, c, 2 + 7 * k, 2 + 7 * k, C.white)
  }
  // Bubbles: rings with a glint, drifting up and out.
  for (let i = 0; i < 12; i++) {
    const a = g() * TAU
    const d = (10 + g() * 28) * (0.45 + easeOut(t) * 0.75)
    const rad = 2 + g() * 3.5
    const x = c + Math.cos(a) * d
    const y = c + Math.sin(a) * d - t * 8 * (0.5 + g())
    if (f === 0 && i % 2) continue
    if (t > 0.8 && i % 2) continue
    r.ring(x, y, rad - 1.2, rad, i % 2 ? R.poison[0] : R.shadow[0])
    r.set(x - rad * 0.4, y - rad * 0.4, C.white)
  }
  // Splatter droplets.
  for (let i = 0; i < 14; i++) {
    const a = (i * TAU) / 14 + g() * 0.3
    const d = ringR * (0.8 + g() * 0.4) + 3
    if (t > 0.7 && i % 2) continue
    r.rect(c + Math.cos(a) * d, c + Math.sin(a) * d, 2, 2, i % 3 ? R.poison[1] : R.shadow[1])
  }
  return t > 0.8 ? dissolve(r, 1 - (t - 0.8) * 3) : r
}

function snareFrame(f: number): Raster {
  const r = new Raster(48, 48)
  const cx = 24
  const cy = 32
  // Rope loop lying on the ground, with a small knot and a stake behind it.
  const rx = 15 + f
  const ry = 7.5 + f * 0.5
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1 || q < 0.62) continue
      r.set(x, y, q > 0.88 ? R.leather[3] : ny < -0.1 ? R.leather[0] : R.leather[1])
    }
  // Twist marks along the rope.
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12 + 0.2
    const x = cx + Math.cos(a) * rx * 0.88
    const y = cy + Math.sin(a) * ry * 0.88
    r.paint(x, y, R.leather[2])
  }
  outlineWith(r, C.inkWarm, false)
  // Stake.
  r.rect(22, 12, 5, 12, R.wood[1])
  r.rect(25, 12, 2, 12, R.wood[2])
  r.rect(22, 12, 1, 12, R.wood[0])
  r.rect(22, 11, 5, 1, R.wood[0])
  r.poly([22, 24, 27, 24, 24.5, 28], R.wood[2])
  outlineWith(r, C.inkWarm, false)
  // Rope tying the stake to the loop and a glint that pulses.
  r.rect(21, 20, 7, 2, R.leather[1])
  r.rect(21, 22, 7, 1, R.leather[2])
  r.set(f ? 30 : 17, f ? 31 : 29, C.white)
  r.set(f ? 30 : 17, f ? 30 : 28, R.leather[0])
  return r
}

function snareSnapFrame(f: number): Raster {
  const r = new Raster(48, 48)
  const cx = 24
  const cy = 32
  const rx = [11, 6.5, 3.5][f]
  const ry = [6, 3.6, 2][f]
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1 || q < (f === 2 ? 0 : 0.4)) continue
      r.set(x, y, q > 0.85 ? R.leather[3] : ny < 0 ? R.leather[0] : R.leather[1])
    }
  outlineWith(r, C.inkWarm, false)
  // Snap lines and dust flying outward from the cinch.
  const g = rng(70 + f)
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8 + 0.3
    const d0 = 4 + f * 6 + g() * 2
    r.line(
      cx + Math.cos(a) * d0,
      cy + Math.sin(a) * d0 * 0.55,
      cx + Math.cos(a) * (d0 + 5),
      cy + Math.sin(a) * (d0 + 5) * 0.55,
      i % 2 ? C.white : R.dirt[0]
    )
  }
  r.rect(22, 12 + f, 5, 12 - f, R.wood[1])
  r.rect(25, 12 + f, 2, 12 - f, R.wood[2])
  outlineWith(r, C.inkWarm, false)
  if (f === 0) sparkle(r, cx, cy - 2, 4, C.white, C.white, R.holy[0])
  return f === 2 ? r : r
}

function dashTrailFrame(f: number): Raster {
  const r = new Raster(64, 64)
  const cover = [1, 0.7, 0.42][f]
  const lay = (dx: number, c: number, c2: number, k: number) => {
    const l = new Raster(64, 64)
    l.ellipse(30 + dx, 46, 11, 6.5, c)
    l.ellipse(41 + dx, 43, 5.5, 4.5, c)
    l.ellipse(44 + dx, 38, 2, 2.5, c2)
    l.ellipse(39 + dx, 38, 2, 2.5, c2)
    l.line(19 + dx, 46, 8 + dx, 40, c2)
    l.line(19 + dx, 47, 9 + dx, 43, c2)
    l.rect(24 + dx, 51, 3, 2, c2)
    l.rect(34 + dx, 51, 3, 2, c2)
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (l.get(x, y) && keep(x, y, k)) r.set(x, y, l.get(x, y))
  }
  lay(-10 - f * 3, R.ratFur[3], R.ratFur[3], cover * 0.6)
  lay(-5 - f * 2, R.ratFur[2], R.ratFur[3], cover * 0.8)
  lay(0, R.ratFur[1], R.ratFur[2], cover)
  // Speed streaks.
  for (const [y, len] of [
    [41, 16],
    [47, 20],
    [52, 12]
  ] as const)
    r.line(30 - len - f * 4, y, 30 - 3 - f * 2, y, f < 2 ? R.ratFur[0] : R.ratFur[2])
  return r
}

function dripFrame(f: number): Raster {
  const r = new Raster(16, 32)
  const drop = (cx: number, cy: number, s: number) => {
    r.poly([cx, cy - 4 * s, cx + 2.4 * s, cy, cx, cy + 2.4 * s, cx - 2.4 * s, cy], R.sludge[1])
    r.ellipse(cx, cy + 0.4, 2.4 * s, 2.2 * s, R.sludge[1])
    r.paint(cx - 1, cy - 1, R.sludge[0])
    r.paint(cx - 1, cy, R.sludge[0])
    r.paint(cx + 1, cy + 1, R.sludge[2])
  }
  if (f === 0) drop(8, 10, 1)
  if (f === 1) drop(8, 22, 1.05)
  const sy = 30
  if (f >= 2) {
    const e = [0.4, 0.7, 1, 1][f - 2]
    const rx = [4, 6.5, 7][f - 2]
    for (let x = 0; x < 16; x++)
      for (let y = 26; y < 32; y++) {
        const nx = (x + 0.5 - 8) / rx
        const ny = (y + 0.5 - sy) / (rx * 0.38)
        const q = nx * nx + ny * ny
        if (q <= 1 && q > 0.45 && keep(x, y, f === 4 ? 0.55 : 1)) r.set(x, y, q > 0.8 ? R.sludge[2] : R.sludge[1])
      }
    if (f < 4) {
      const h = [7, 9, 4][f - 2]
      for (const s of [-1, 1]) {
        r.line(8 + s * 1, sy - 1, 8 + s * (2 + e * 2), sy - h, R.sludge[1])
        r.rect(8 + s * (3 + e * 3), sy - h - 1 + (f === 3 ? 2 : 0), 2, 2, R.sludge[0])
      }
      r.rect(7, sy - h + 2, 2, h - 2, R.sludge[1])
      r.set(7, sy - h + 2, R.sludge[0])
    }
  }
  outlineWith(r, R.sludge[4], false)
  return r
}

function hexFrame(f: number): Raster {
  const r = new Raster(32, 32)
  const pulse = [0, 1, 2, 1][f]
  const g = rng(444 + f)
  // Sparkling tail trailing to the left.
  for (let i = 0; i < 9; i++) {
    const d = 5 + i * 1.7
    const wob = Math.sin(i * 1.3 + f * 1.6) * (1 + i * 0.25)
    const x = 14 - d
    const y = 16 + wob
    if (i < 6 && keep(Math.round(x), Math.round(y), 1 - i / 7)) {
      r.rect(x, y, i < 3 ? 2 : 1, i < 3 ? 2 : 1, i < 3 ? R.shadow[0] : R.shadow[1])
    } else if (i % 2 === f % 2) r.set(x, y + (g() < 0.5 ? -2 : 2), i % 3 ? R.crowSheen[0] : C.white)
  }
  glowDisc(r, 18, 16, 11 + pulse * 0.5, R.shadow[1], 0.28)
  r.ellipse(18, 16, 8 + pulse * 0.3, 8 + pulse * 0.3, R.shadow[2])
  r.ellipse(17.5, 15.5, 7, 7, R.shadow[1])
  r.ellipse(17, 15, 5.5, 5.5, R.crowSheen[1])
  // Cat-eye sigil: an almond with a slit pupil and a small paw dot below.
  r.poly([11, 15.5, 14.5, 12.5, 21.5, 12.5, 25, 15.5, 21.5, 18.5, 14.5, 18.5], R.crowSheen[0])
  r.poly([12.5, 15.5, 15, 13.5, 21, 13.5, 23.5, 15.5, 21, 17.5, 15, 17.5], pulse === 2 ? C.white : R.holy[0])
  r.rect(17, 12, 2, 7, R.shadow[3])
  r.set(17, 15, R.shadow[3])
  r.paint(15, 14, C.white)
  r.rect(16.5, 20.5, 3, 2, R.crowSheen[0])
  r.set(14, 20, R.crowSheen[0])
  r.set(21, 20, R.crowSheen[0])
  outlineWith(r, R.shadow[3], false)
  for (let k = 0; k < 3; k++) {
    const a = (f * TAU) / 8 + (k * TAU) / 3 + 0.3
    sparkle(r, 18 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, 1, C.white, R.crowSheen[0], R.shadow[0])
  }
  return r
}

// ---------------------------------------------------------------------------------------------------------------
// Tower

function gustFrame(f: number): Raster {
  const r = new Raster(64, 64)
  const c = 32
  for (let arm = 0; arm < 3; arm++) {
    const a0 = (arm * TAU) / 3 + (f * TAU) / 12
    const steps = 46
    for (let i = 0; i < steps; i++) {
      const u = i / steps
      const a = a0 + u * 3.6
      const rad = 4 + u * 25
      const w = 0.6 + 3.2 * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.8
      const x = c + Math.cos(a) * rad
      const y = c + Math.sin(a) * rad * 0.92
      const col = u > 0.55 ? R.ice[0] : u > 0.25 ? C.white : R.paper[1]
      if (u > 0.78 && !keep(Math.round(x), Math.round(y), 1 - (u - 0.78) * 4)) continue
      r.thick(x, y, x, y, w, col)
    }
  }
  // Pale outer edge of each arm for a darker rim and cheap depth.
  const rim = r.clone()
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++)
      if (rim.get(x, y) === R.ice[0] && (!rim.get(x + 1, y) || !rim.get(x, y + 1))) r.set(x, y, R.ice[1])
  outlineWith(r, R.sky[2], false)
  dissolve(r, 1)
  // Leaves whipped around by the gust.
  for (let k = 0; k < 4; k++) {
    const a = (f * TAU) / 12 + (k * TAU) / 4 + 0.5
    const d = 12 + k * 5
    const x = c + Math.cos(a * 1.2) * d
    const y = c + Math.sin(a * 1.2) * d * 0.9
    r.rect(x, y, 3, 2, R.grass[1])
    r.set(x, y, R.grass[0])
    r.set(x + 2, y + 1, R.grassDark[2])
  }
  return r
}

function fireBreathFrame(f: number): Raster {
  const r = new Raster(64, 64)
  const g = rng(900)
  const base = [
    [-14, 2, 8],
    [-5, -3, 10],
    [5, 2, 11],
    [15, -2, 9],
    [3, -9, 7],
    [-8, 8, 7],
    [13, 9, 6]
  ]
  base.forEach(([dx, dy, rad], i) => {
    const ph = (f + i * 0.7) * (Math.PI / 2)
    const x = 32 + dx + Math.cos(ph) * 2.2
    const y = 32 + dy + Math.sin(ph) * 2.2
    const s = rad + Math.sin(ph * 1.3) * 1.6
    ball(r, x, y, s, s * 0.92, R.fire, false)
  })
  // Hot cores and licking tongues.
  for (let i = 0; i < 4; i++) {
    const x = 28 + i * 5 + (f % 2) * 2
    r.ellipse(x, 31 + (i % 2) * 3, 3.4, 3, R.fire[0])
    r.ellipse(x - 0.5, 31 + (i % 2) * 3, 1.8, 1.6, C.white)
  }
  for (let i = 0; i < 7; i++) {
    const a = g() * TAU
    const d = 20 + g() * 9
    if ((i + f) % 3) r.rect(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 2, 2, i % 2 ? R.fire[1] : R.fire[0])
  }
  return r
}

function windFrame(f: number): Raster {
  const r = new Raster(64, 16)
  for (const [yo, amp, x0, x1, c] of [
    [8, 2.4, 3, 61, C.white],
    [4, 1.6, 12, 46, R.ice[0]],
    [12, 1.6, 20, 54, R.ice[0]]
  ] as const)
    for (let x = x0; x <= x1; x++) {
      const edge = Math.min(x - x0, x1 - x) / 14
      if (!keep(x, Math.round(yo), clamp01(edge) * 1.1)) continue
      const y = yo + Math.sin(((x + f * 4) * TAU) / 16) * amp * Math.min(1, edge + 0.3)
      r.set(x, y, c)
      if (c === C.white && edge > 0.5) r.set(x, y + 1, R.ice[1])
    }
  return r
}

// ---------------------------------------------------------------------------------------------------------------
// Forest

function iceSpikeFrame(f: number): Raster {
  const r = new Raster(64, 96)
  const by = 80
  const spikes: [number, number, number][] = [
    [32, 58, 7],
    [22, 40, 6],
    [43, 44, 6],
    [13, 24, 4.5],
    [52, 26, 4.5]
  ]
  const grow = [0.1, 0.55, 1.1, 1, 0.9, 0.5][f]
  const shatter = f >= 4
  // Frost on the ground.
  for (let y = 72; y < 90; y++)
    for (let x = 4; x < 60; x++) {
      const nx = (x - 32) / (24 + f * 2)
      const ny = (y - 81) / 6
      if (nx * nx + ny * ny < 1 && keep(x, y, f === 5 ? 0.25 : 0.55)) r.set(x, y, y > 82 ? R.ice[2] : R.snow[1])
    }
  for (const [x, hh, w] of spikes) {
    const h = hh * grow
    if (h < 2) continue
    const tilt = (x - 32) * 0.12
    const tip = [x + tilt, by - h]
    const cutoff = shatter && f === 5 ? 0.45 : 1
    const L = [x - w, by]
    const Rr = [x + w, by]
    r.poly([...L, ...tip, x, by], R.ice[1])
    r.poly([x, by, ...tip, ...Rr], R.ice[2])
    r.poly([x - w * 0.55, by - 2, ...tip, x - w * 0.15, by - 2], R.ice[0])
    r.poly([x + w * 0.5, by - 2, ...tip, x + w * 0.85, by - 2], R.ice[3])
    r.line(tip[0], tip[1], x - w * 0.4, by - h * 0.3, C.white)
    if (cutoff < 1)
      for (let y = 0; y < 96; y++)
        for (let xx = 0; xx < 64; xx++)
          if (y < by - h * 0.7 && Math.abs(xx - x) < w + 4 && r.get(xx, y) && !keep(xx, y, 0.4)) r.set(xx, y, 0)
  }
  outlineWith(r, R.ice[4], false)
  // Cracks across the crystal once it is fully grown, shards flying on the way out.
  if (f >= 3) {
    for (const [x0, y0, x1, y1] of [
      [32, by - 40, 29, by - 22],
      [22, by - 26, 25, by - 12],
      [43, by - 30, 40, by - 14]
    ])
      r.line(x0, y0, x1, y1, f >= 4 ? R.ice[4] : R.ice[3])
  }
  const g = rng(31)
  if (f >= 1 && f <= 4)
    for (let i = 0; i < 8; i++) {
      const x = 32 + (g() - 0.5) * 50
      const y = by - 10 - g() * 40 - (f - 1) * 6
      const sz = i % 3 ? 2 : 3
      r.rect(x, y, sz, sz, i % 2 ? R.ice[0] : C.white)
      r.set(x, y, C.white)
    }
  if (f === 2) sparkle(r, 32, by - 62, 5, C.white, C.white, R.ice[0])
  return r
}

function pillarFrame(f: number): Raster {
  const W = 64
  const H = 192
  const r = new Raster(W, H)
  const by = 176
  const hw = [3, 13, 15, 12, 8, 3][f]
  const reach = [1, 1, 1, 1, 0.9, 0.6][f]
  const life = [1, 1, 1, 0.9, 0.6, 0.3][f]
  for (let y = 0; y <= by; y++) {
    const topFade = clamp01(y / 50)
    const bottom = y > by - 4 ? 1.2 : 1
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x + 0.5 - 32)
      const half = hw * (0.85 + 0.15 * (y / by)) * bottom
      if (d > half + 2) continue
      if (y < (1 - reach) * by) continue
      const a = topFade * life * (d < half * 0.5 ? 1 : d < half ? 0.9 : 0.35)
      if (!keep(x, y, a)) continue
      // Falling streaks inside the beam.
      const streak = (x * 7 + y * 2 + f * 17) % 11 === 0
      r.set(
        x,
        y,
        d < half * 0.35 ? C.white : d < half * 0.7 ? (streak ? C.white : R.holy[0]) : d < half ? R.holy[1] : R.holy[2]
      )
    }
  }
  // Impact ring on the ground.
  const e = [0.2, 0.6, 1, 1, 0.9, 0.8][f]
  const rx = 10 + 20 * e
  const ry = rx * 0.33
  for (let y = 160; y < 192; y++)
    for (let x = 0; x < W; x++) {
      const nx = (x + 0.5 - 32) / rx
      const ny = (y + 0.5 - by) / ry
      const q = nx * nx + ny * ny
      if (q > 1) continue
      if (q > 0.62 && keep(x, y, life)) r.set(x, y, q > 0.9 ? R.holy[2] : q > 0.78 ? R.holy[1] : C.white)
      else if (q <= 0.62 && keep(x, y, 0.25 * life)) r.set(x, y, R.holy[1])
    }
  // Runes climbing the beam.
  const runes = [
    ['.#.', '###', '.#.', '.#.', '.#.'],
    ['###', '#.#', '.#.', '#.#', '###'],
    ['#.#', '#.#', '###', '.#.', '.#.']
  ]
  if (f >= 1 && f <= 4)
    for (let i = 0; i < 5; i++) {
      const y = by - 14 - ((i * 30 + f * 18) % 150)
      const x = 32 + (i % 2 ? 12 : -14) - 1
      runes[i % 3].forEach((row, j) => {
        for (let k = 0; k < 3; k++)
          if (row[k] === '#' && keep(x + k, y + j, life)) r.set(x + k, y + j, i % 2 ? C.white : R.holy[0])
      })
    }
  const g = rng(808)
  for (let i = 0; i < 10; i++) {
    const x = 32 + (g() - 0.5) * 38
    const y = by - 8 - g() * 120 * (f / 5 + 0.2) - (f > 2 ? (f - 2) * 6 : 0)
    if (f >= 1 && y > 8)
      i % 2 ? sparkle(r, x, y, 2, C.white, R.holy[0], R.holy[1]) : plus(r, x, y, 1, R.holy[1], C.white)
  }
  return r
}

function howlFrame(f: number): Raster {
  const size = 128
  const r = new Raster(size, size)
  const c = 64
  const t = f / 4
  const fade = [1, 1, 0.9, 0.65, 0.35][f]
  for (const [k, w] of [
    [1, 4],
    [0.7, 3],
    [0.42, 2.4]
  ] as const) {
    const rad = Math.max(4, 58 * easeOut(Math.min(1, t * 1.05 + 0.1)) * k)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - c
        const dy = y + 0.5 - c
        const d = hyp(dx, dy)
        if (d > rad || d < rad - w) continue
        // Sound-wave gaps around the ring.
        const th = Math.atan2(dy, dx)
        if (Math.sin(th * 5 + k * 3) < -0.55) continue
        if (!keep(x, y, fade * (1 - (1 - k) * 0.2))) continue
        const q = (d - (rad - w)) / w
        r.set(x, y, q > 0.75 ? R.sky[2] : q > 0.45 ? R.ice[1] : q > 0.2 ? R.ice[0] : C.white)
      }
  }
  if (f <= 1) {
    r.ellipse(c, c, 11 - f * 4, 11 - f * 4, R.ice[0])
    r.ellipse(c, c, 7 - f * 3, 7 - f * 3, C.white)
  }
  const g = rng(17)
  for (let i = 0; i < 9; i++) {
    const a = g() * TAU
    const d = (20 + g() * 38) * (0.4 + easeOut(t) * 0.6)
    if (f > 0 && f < 4) sparkle(r, c + Math.cos(a) * d, c + Math.sin(a) * d, i % 3 ? 1 : 3, C.white, R.ice[0], R.sky[1])
  }
  return r
}

function snowFrame(f: number): Raster {
  const r = new Raster(8, 8)
  if (f % 2 === 0) {
    r.rect(3, 1, 2, 6, C.white)
    r.rect(1, 3, 6, 2, C.white)
    r.set(1, 1, R.ice[0])
    r.set(6, 1, R.ice[0])
    r.set(1, 6, R.ice[0])
    r.set(6, 6, R.ice[0])
  } else {
    for (let i = 1; i < 7; i++) {
      r.set(i, i, C.white)
      r.set(7 - i, i, C.white)
    }
    r.set(3, 3, R.ice[1])
    r.set(4, 4, R.ice[1])
    r.set(3, 0, R.ice[0])
    r.set(4, 7, R.ice[0])
    r.set(0, 3, R.ice[0])
    r.set(7, 4, R.ice[0])
  }
  if (f >= 2) r.set(3, 3, R.ice[1])
  return r
}

function emberFrame(f: number): Raster {
  const r = new Raster(8, 8)
  const s = [2, 3, 2, 1][f]
  const x = 3 + (f % 2)
  const y = 5 - f
  r.rect(x - 1, y - 1, s + 2, s + 2, R.fire[3])
  r.rect(x, y, s, s, R.fire[2])
  if (s >= 2) r.rect(x, y, Math.max(1, s - 1), Math.max(1, s - 1), R.fire[1])
  r.set(x, y, f === 3 ? R.fire[1] : R.fire[0])
  if (f === 1) r.set(x + 3, y - 2, R.fire[1])
  return r
}

function moonlightFrame(f: number): Raster {
  const r = new Raster(96, 96)
  const c = 48
  const pulse = [0, 1.5, 2.5, 1.5][f]
  glowDisc(r, c, c, 44 + pulse, R.sky[0], 0.06)
  glowDisc(r, c, c, 36 + pulse, R.ice[1], 0.1)
  glowDisc(r, c, c, 27 + pulse, R.ice[0], 0.24)
  glowDisc(r, c, c, 17 + pulse * 0.6, R.ice[0], 0.45)
  glowDisc(r, c, c, 9, C.white, 0.7)
  r.ellipse(c, c, 3.4, 3.4, C.white)
  for (let k = 0; k < 6; k++) {
    const a = (k * TAU) / 6 + 0.4 + (f * TAU) / 24
    const d = 18 + (k % 3) * 9
    const tw = (f + k) % 4
    sparkle(r, c + Math.cos(a) * d, c + Math.sin(a) * d, tw === 0 ? 3 : tw === 1 ? 2 : 1, C.white, R.ice[0], R.sky[0])
  }
  sparkle(r, c, c, 4 + (f % 2) * 3, C.white, C.white, R.ice[0])
  return r
}

// ---------------------------------------------------------------------------------------------------------------
// Reworked effects

/** The 360° whirl: a red blade and a pale-gold blade chase each other, each with a white leading edge. */
function spinFrame(f: number, t: number): Raster {
  const size = 192
  const r = new Raster(size, size)
  const c = size / 2
  const rad = 60 + 24 * easeOut(Math.min(1, t * 1.3))
  const spin = f * 1.15
  const fade = [1, 1, 1, 0.92, 0.72, 0.5][f]
  const width = [9, 17, 18, 15, 10, 6][f]
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      const d = hyp(dx, dy)
      if (Math.abs(d - rad) > width + 6) continue
      const v = ((-(Math.atan2(dy, dx) - spin) % TAU) + TAU) % TAU
      const blade = v >= Math.PI ? 1 : 0
      const u = (v % Math.PI) / Math.PI
      const w = Math.max(0.9, width * (1 - u * 0.97) ** 0.9 * (u < 0.02 ? u / 0.02 : 1))
      const inner = rad - w * 0.45
      const outer = rad + w * 0.55
      // Faint wake just outside the blade.
      if (d > outer && d < outer + 5 && u < 0.5 && keep(x, y, (0.5 - u) * 0.7 * fade)) {
        r.set(x, y, blade ? R.jobGold[2] : R.jobRed[2])
        continue
      }
      if (d < inner || d > outer || !keep(x, y, fade)) continue
      if (u > 0.82 && !keep(x, y, (1 - u) * 5)) continue
      const p = (d - inner) / (outer - inner)
      const lead = u < 0.1
      const body = blade ? [R.jobGold[0], R.jobGold[1], R.jobGold[2]] : [R.jobRed[0], R.jobRed[1], R.jobRed[2]]
      r.set(
        x,
        y,
        lead || p > 0.8
          ? C.white
          : p > 0.5
            ? u < 0.45
              ? C.white
              : body[0]
            : p > 0.25
              ? body[0]
              : p > 0.1
                ? body[1]
                : body[2]
      )
    }
  r.ring(c, c, rad - 21, rad - 19, R.jobRed[2], spin - 0.4, spin + 1.3)
  r.ring(c, c, rad - 21, rad - 19, R.jobGold[2], spin + Math.PI - 0.4, spin + Math.PI + 1.3)
  for (let k = 0; k < 2; k++) {
    const a = spin + k * Math.PI
    sparkle(
      r,
      c + Math.cos(a) * (rad + 3),
      c + Math.sin(a) * (rad + 3),
      f < 3 ? 4 : 1,
      C.white,
      C.white,
      k ? R.jobGold[0] : R.jobRed[0]
    )
  }
  return r
}

function soulFrame(f: number): Raster {
  const r = new Raster(32, 48)
  const bob = [0, -1, -1, 0][f]
  const cx = 16
  const cy = 20 + bob
  const rad = 15
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 32; x++) {
      const nx = (x + 0.5 - cx) / rad
      const ny = (y + 0.5 - cy) / rad
      const q = nx * nx + ny * ny
      if (q > 1) continue
      if (q > 0.78) r.set(x, y, nx + ny < -0.2 ? C.white : nx + ny > 0.5 ? R.sky[1] : R.ice[1])
      else r.set(x, y, keep(x, y, 0.4) ? R.ice[0] : R.sky[0])
    }
  // The ghost: round head, wavy skirt, little arms.
  const gy = cy + 1
  r.ellipse(cx, gy - 2, 7, 7, C.white)
  r.rect(cx - 7, gy - 2, 14, 7, C.white)
  const wave = f % 2
  for (let i = 0; i < 4; i++) r.ellipse(cx - 5.25 + i * 3.5, gy + 5 + ((i + wave) % 2), 1.9, 1.9, C.white)
  r.rect(cx - 9, gy + 1, 3, 2, C.white)
  r.rect(cx + 6, gy + 1, 3, 2, C.white)
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 32; x++)
      if (
        r.get(x, y) === C.white &&
        (r.get(x + 1, y + 1) === 0 || x > cx + 3) &&
        x > cx + 1 &&
        r.get(x, y + 1) !== 0 &&
        y > gy - 4
      )
        r.set(x, y, R.paper[1])
  r.rect(cx - 4, gy - 3, 2, 4, C.black)
  r.rect(cx + 2, gy - 3, 2, 4, C.black)
  r.set(cx - 4, gy - 3, C.white)
  r.set(cx + 2, gy - 3, C.white)
  r.rect(cx - 1, gy + 2, 2, 1, R.ratPink[2])
  r.set(cx - 6, gy + 1, C.blush)
  r.set(cx + 5, gy + 1, C.blush)
  outlineWith(r, R.sky[3], false)
  // Glossy highlight on the bubble.
  r.rect(cx - 11, cy - 8, 4, 1, C.white)
  r.rect(cx - 12, cy - 7, 1, 4, C.white)
  r.set(cx - 10, cy - 6, C.white)
  r.set(cx + 10, cy + 8, R.sky[2])
  // Bubble trail to the fallen hero.
  r.ellipse(cx + 1, 39 + bob * 0.5, 1.6, 1.6, R.ice[0])
  r.ellipse(cx - 1, 43, 1.2, 1.2, R.ice[0])
  outlineWith(r, R.sky[3], false)
  return r
}

function telegraphFrame(f: number): Raster {
  const r = new Raster(64, 64)
  const hot = f === 1
  // Fill: hazard stripes of two reds, dithered so the floor shows through.
  for (let y = 4; y < 60; y++)
    for (let x = 4; x < 60; x++) {
      const band = ((x + y + (hot ? 8 : 0)) >> 3) & 1
      if (band) r.set(x, y, keep(x, y, 0.62) ? R.jobRed[1] : R.jobRed[3])
      else if (keep(x, y, hot ? 0.4 : 0.3)) r.set(x, y, R.jobRed[2])
    }
  // Bright dashed border, three pixels thick, with a dark rim outside.
  for (let i = 0; i < 64; i++) {
    const dash = ((i + (hot ? 4 : 0)) >> 2) & 1
    const c = dash ? R.jobRed[0] : C.white
    for (let k = 0; k < 3; k++) {
      r.set(i, k, c)
      r.set(i, 63 - k, c)
      r.set(k, i, c)
      r.set(63 - k, i, c)
    }
  }
  r.rect(3, 3, 58, 1, R.jobRed[1])
  r.rect(3, 60, 58, 1, R.jobRed[1])
  // Central warning mark.
  r.ellipse(32, 32, 10, 10, R.jobRed[3])
  r.ellipse(32, 32, 8.5, 8.5, hot ? R.jobRed[0] : R.jobRed[1])
  r.rect(31, 26, 3, 7, C.white)
  r.rect(31, 35, 3, 3, C.white)
  outlineWith(r, R.jobRed[4], false)
  return r
}

export function buildFx2(): Sheet {
  return {
    spin: make(
      'spin',
      frames(6, (f, t) => spinFrame(f, t)),
      { alpha: [1, 1, 1, 0.95, 0.85, 0.65] }
    ),
    soul: make('soul', frames(4, soulFrame), { alpha: [0.94, 0.97, 0.94, 0.9] }),
    telegraph: make('telegraph', frames(2, telegraphFrame), { alpha: [0.8, 0.95] }),
    bomb: make('bomb', frames(2, bombFrame)),
    bomb_burst: make('bomb_burst', frames(6, bombBurstFrame)),
    snare: make('snare', frames(2, snareFrame)),
    snare_snap: make('snare_snap', frames(3, snareSnapFrame)),
    hex: make('hex', frames(4, hexFrame)),
    dash_trail: make('dash_trail', frames(3, dashTrailFrame), { alpha: [0.9, 0.7, 0.45] }),
    drip: make('drip', frames(5, dripFrame)),
    gust: make('gust', frames(4, gustFrame), { alpha: [0.92, 0.95, 0.92, 0.95] }),
    fire_breath: make('fire_breath', frames(4, fireBreathFrame)),
    wind: make('wind', frames(4, windFrame), { alpha: [0.85, 0.85, 0.85, 0.85] }),
    icespike: make('icespike', frames(6, iceSpikeFrame)),
    pillar: make('pillar', frames(6, pillarFrame), { alpha: [0.95, 1, 1, 0.95, 0.85, 0.7] }),
    howl: make('howl', frames(5, howlFrame), { alpha: [0.95, 0.95, 0.9, 0.8, 0.65] }),
    snow: make('snow', frames(4, snowFrame)),
    ember: make('ember', frames(4, emberFrame)),
    moonlight: make('moonlight', frames(4, moonlightFrame), { alpha: [0.85, 1, 0.95, 1] })
  }
}
