/** Sheet `fx`: combat, magic, ground and status effects, all drawn natively per frame and per turn. */
import { FX_SPEC, TURNS } from '../contract'
import { C, R } from '../palette'
import { Raster, ball, outlineWith, rng } from '../raster'
import { anim, type Anim, type Sheet } from '../sheet'
import { TAU, clamp01, dissolve, easeOut, glowDisc, keep, plus, smooth, sparkle } from './util'

const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b)
const frames = (n: number, draw: (f: number, t: number) => Raster) =>
  Array.from({ length: n }, (_, f) => draw(f, n === 1 ? 0 : f / (n - 1)))

/** Builds an Anim from its contract entry. */
function make(name: string, fr: Raster[], extra: Partial<Anim> = {}): Anim {
  const s = FX_SPEC[name]
  return anim(fr, s.fps, s.loop, { ...(s.anchor ? { anchor: s.anchor } : {}), ...extra })
}

// ---------------------------------------------------------------------------------------------------------------
// Sword slash: a crescent smear swept around a pivot behind the hero, drawn per pixel for each of the 16 turns.

/** [tail, head, thickness, coverage] of each slash frame; angles in units of the half span. */
const SLASH_FRAMES = [
  [-1.0, -0.15, 0.7, 1],
  [-1.0, 0.8, 1.0, 1],
  [-0.6, 1.0, 0.9, 1],
  [-0.05, 1.0, 0.45, 0.6]
] as const

/** Per-pixel distance and relative angle (in half spans) from the pivot of one turn, shared by its four frames. */
function slashPolar(turn: number) {
  const dir = (turn * TAU) / TURNS
  const px = 48 - Math.cos(dir) * 13
  const py = 48 - Math.sin(dir) * 13
  const d = new Float32Array(96 * 96)
  const th = new Float32Array(96 * 96)
  for (let y = 0; y < 96; y++)
    for (let x = 0; x < 96; x++) {
      const dx = x + 0.5 - px
      const dy = y + 0.5 - py
      d[y * 96 + x] = hyp(dx, dy)
      const t = Math.atan2(dy, dx) - dir
      th[y * 96 + x] = Math.atan2(Math.sin(t), Math.cos(t)) / 1.3
    }
  return { d, th }
}

function slashFrame(turn: number, f: number, pol: { d: Float32Array; th: Float32Array }): Raster {
  const r = new Raster(96, 96)
  const dir = (turn * TAU) / TURNS
  const ux = Math.cos(dir)
  const uy = Math.sin(dir)
  const px = 48 - ux * 13
  const py = 48 - uy * 13
  const span = 1.3
  const [tail, head, thick, cover] = SLASH_FRAMES[f] as readonly number[]
  const R0 = 33
  const arc = (rad: number, width: number, colour: (p: number, s: number) => number, a0 = tail, a1 = head) => {
    for (let y = 0; y < 96; y++)
      for (let x = 0; x < 96; x++) {
        const d = pol.d[y * 96 + x]
        if (Math.abs(d - rad) > width) continue
        const th = pol.th[y * 96 + x]
        if (th < a0 || th > a1) continue
        const s = (th - a0) / (a1 - a0)
        const w = Math.max(0.9, width * thick * Math.sin(Math.PI * s ** 1.5) ** 0.6)
        const inner = rad - w * 0.4
        const outer = rad + w * 0.6
        if (d < inner || d > outer) continue
        const p = (d - inner) / (outer - inner)
        if (!keep(x, y, cover)) continue
        const c = colour(p, s)
        if (c) r.set(x, y, c)
      }
  }
  arc(R0 + 10, 3, (_p, s) => (s > 0.35 ? R.jobRed[1] : 0), tail + (head - tail) * 0.25, head - (head - tail) * 0.1)
  arc(R0 - 9, 2.6, (_p, s) => (s > 0.5 ? R.jobRed[2] : 0), tail + (head - tail) * 0.45, head - (head - tail) * 0.2)
  arc(R0, 19, (p, s) => {
    if (p > 0.78) return C.white
    if (p > 0.5) return s > 0.25 ? C.white : R.jobRed[0]
    if (p > 0.3) return R.jobRed[0]
    if (p > 0.13) return R.jobRed[1]
    return R.jobRed[2]
  })
  // Sparks shed from the leading tip.
  const g = rng(900 + turn * 7 + f)
  const hx = px + Math.cos(dir + head * span) * (R0 + 2)
  const hy = py + Math.sin(dir + head * span) * (R0 + 2)
  if (f >= 1)
    for (let i = 0; i < 4 - f; i++) {
      const ang = dir + head * span + 0.9 + g() * 0.6
      const d = 3 + g() * 8 + f * 3
      r.set(hx + Math.cos(ang) * d, hy + Math.sin(ang) * d, i % 2 ? C.white : R.jobRed[0])
    }
  return r
}

// ---------------------------------------------------------------------------------------------------------------
// Arrows

function arrowRaster(turn: number, enemy: boolean): Raster {
  const r = new Raster(32, 32)
  const a = (turn * TAU) / TURNS
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  const vx = -uy
  const vy = ux
  const cx = 16
  const cy = 16
  const P = (u: number, v = 0): [number, number] => [cx + ux * u + vx * v, cy + uy * u + vy * v]
  const shaft = enemy ? R.wood[2] : R.wood[1]
  const feather = enemy ? [R.jobRed[2], R.clothCrimson[2]] : [R.jobGreen[1], R.jobGreen[0]]
  const flat = (pts: [number, number][], c: number) => r.poly(pts.flat(), c)
  const [t0x, t0y] = P(-10.5)
  const [t1x, t1y] = P(8)
  r.line(t0x, t0y, t1x, t1y, shaft)
  for (const side of [-1, 1])
    flat([P(-10.5), P(-6.2, 3.6 * side), P(-1.5, 3.6 * side), P(-5, 0)], side < 0 ? feather[1] : feather[0])
  r.line(t0x, t0y, t1x, t1y, shaft)
  const head = enemy ? R.steel[2] : R.steel[0]
  flat([P(12), P(5.5, 3), P(7.2), P(5.5, -3)], head)
  flat([P(12), P(7.2), P(5.5, -3)], enemy ? R.steel[3] : R.steel[1])
  outlineWith(r, enemy ? C.inkWarm : C.inkGreen, false)
  return r
}

// ---------------------------------------------------------------------------------------------------------------
// Magic projectiles

function boltFrame(f: number): Raster {
  const r = new Raster(32, 32)
  const pulse = [0, 1, 2, 1][f]
  glowDisc(r, 16, 16, 11 + pulse, R.magic[2], 0.2)
  glowDisc(r, 16, 16, 9 + pulse * 0.5, R.magic[1], 0.3)
  r.ellipse(16, 16, 7 + pulse * 0.4, 7 + pulse * 0.4, R.magic[2])
  r.ellipse(15.5, 15.5, 5.5, 5.5, R.magic[1])
  r.ellipse(15, 15, 3.6, 3.6, R.magic[0])
  r.ellipse(15, 15, 2, 2, C.white)
  const rot = (f * TAU) / 8
  for (let k = 0; k < 4; k++) {
    const a = rot + (k * TAU) / 4 + 0.4
    const d = 9 + pulse
    r.set(16 + Math.cos(a) * d, 16 + Math.sin(a) * d, k % 2 ? C.spark : C.white)
    r.set(16 + Math.cos(a) * (d + 2), 16 + Math.sin(a) * (d + 2), R.magic[1])
  }
  sparkle(r, 16, 16, 5 - Math.round(pulse * 0.5), C.white, R.magic[0], R.magic[1])
  return r
}

function orbFrame(f: number): Raster {
  const r = new Raster(64, 64)
  const c = 32
  const rad = 21
  glowDisc(r, c, c, 30, R.magic[2], 0.14)
  glowDisc(r, c, c, 26, R.magic[1], 0.2)
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      const d = hyp(dx, dy)
      if (d > rad) continue
      const th = Math.atan2(dy, dx)
      const swirl = Math.sin(4 * (th + d * 0.13) - (f * TAU) / 4) // 4 arms, one arm period over the loop
      const nz = Math.sqrt(Math.max(0, 1 - (d / rad) ** 2))
      const lit = (-dx - dy) / rad / 2.4 + nz * 0.5
      let v = swirl * 0.55 + lit + (1 - d / rad) * 0.7
      if (d > rad - 1.6) v -= 0.7
      r.set(x, y, v > 1.35 ? C.white : v > 0.95 ? R.magic[0] : v > 0.45 ? R.magic[1] : v > 0 ? R.magic[2] : R.magic[3])
    }
  r.ellipse(c, c, 5, 5, R.magic[0])
  r.ellipse(c, c, 3, 3, C.white)
  r.ellipse(c - 9, c - 11, 3, 2, C.white)
  for (let k = 0; k < 3; k++) {
    const a = (f * TAU) / 12 + (k * TAU) / 3
    sparkle(r, c + Math.cos(a) * 27, c + Math.sin(a) * 27, 2, C.white, R.magic[0], R.magic[1])
  }
  return r
}

function fireballFrame(f: number): Raster {
  const r = new Raster(32, 32)
  const g = rng(31 + f)
  glowDisc(r, 16, 16, 12, R.fire[3], 0.3)
  for (let k = 0; k < 7; k++) {
    const a = (f * TAU) / 14 + (k * TAU) / 7
    const len = 11 + (k % 3) * 2 + (f % 2)
    r.poly(
      [
        16 + Math.cos(a + 0.55) * 7,
        16 + Math.sin(a + 0.55) * 7,
        16 + Math.cos(a) * len,
        16 + Math.sin(a) * len,
        16 + Math.cos(a - 0.55) * 7,
        16 + Math.sin(a - 0.55) * 7
      ],
      k % 2 ? R.fire[2] : R.fire[3]
    )
  }
  r.ellipse(16, 16, 8, 8, R.fire[2])
  r.ellipse(15.5, 15.5, 6, 6, R.fire[1])
  r.ellipse(15, 15, 3.8, 3.8, R.fire[0])
  r.ellipse(14.5, 14.5, 2, 2, C.white)
  for (let i = 0; i < 3; i++) r.set(8 + g() * 16, 8 + g() * 16, R.fire[0])
  return r
}

// ---------------------------------------------------------------------------------------------------------------
// Bursts, rings and ground effects

function burstFrame(size: number, n: number, f: number, big: boolean): Raster {
  const r = new Raster(size, size)
  const c = size / 2
  const Rr = size / 2 - 3
  const t = f / (n - 1)
  const g = rng(500 + size + f)
  const gs = rng(77 + size)
  const ringR = Rr * (0.2 + 0.78 * easeOut(t * 1.05))
  const thick = Math.max(1.6, (1 - t) * Rr * (big ? 0.2 : 0.22) + 1)
  const fade = t < 0.5 ? 1 : 1 - ((t - 0.5) / 0.5) * 0.92
  glowDisc(r, c, c, ringR - thick * 0.6, R.magic[1], 0.22 * (1 - t) * (1 - t))
  glowDisc(r, c, c, (ringR - thick) * 0.65, R.magic[0], 0.3 * (1 - t) * (1 - t))
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = hyp(x + 0.5 - c, y + 0.5 - c)
      if (d > ringR || d < ringR - thick) continue
      if (!keep(x, y, fade)) continue
      const q = (d - (ringR - thick)) / thick
      r.set(
        x,
        y,
        q > 0.82 ? R.magic[3] : q > 0.55 ? R.magic[2] : q > 0.25 ? R.magic[1] : t < 0.45 ? C.white : R.magic[0]
      )
    }
  if (t < 0.6) {
    const k = 1 - t / 0.6
    const fr = Rr * (0.25 + 0.4 * k)
    r.ellipse(c, c, fr, fr, R.magic[0])
    r.ellipse(c, c, fr * 0.72, fr * 0.72, C.white)
    if (t < 0.3)
      for (let a = 0; a < 8; a++) {
        const ang = (a * TAU) / 8 + 0.2
        const len = Rr * (0.55 + 0.4 * (a % 2)) * (1 - t)
        r.thick(
          c + Math.cos(ang) * fr * 0.6,
          c + Math.sin(ang) * fr * 0.6,
          c + Math.cos(ang) * (fr + len),
          c + Math.sin(ang) * (fr + len),
          a % 2 ? 1.6 : 2.6,
          a % 2 ? R.magic[1] : R.magic[0]
        )
      }
  }
  const count = big ? 18 : 11
  if (t > 0.1)
    for (let i = 0; i < count; i++) {
      const ang = (i * TAU) / count + gs() * 0.35
      const sp = 0.65 + gs() * 0.5
      const d = ringR * sp + t * 6 + g() * 2
      const len = (1 - t) * (big ? 9 : 6) + 1
      if (t > 0.55 && i % 2) continue
      const x0 = c + Math.cos(ang) * d
      const y0 = c + Math.sin(ang) * d
      r.line(x0, y0, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len, i % 3 ? C.spark : C.white)
      if (i % 4 === 0 && t < 0.8)
        sparkle(
          r,
          c + Math.cos(ang + 0.2) * ringR * 1.05,
          c + Math.sin(ang + 0.2) * ringR * 1.05,
          big ? 3 : 2,
          C.white,
          R.magic[0],
          R.magic[1]
        )
    }
  return t > 0.8 ? dissolve(r, 1 - (t - 0.8) * 3) : r
}

const RUNES = [
  ['.#.', '###', '.#.', '.#.', '.#.'],
  ['###', '#.#', '.#.', '#.#', '###'],
  ['#.#', '#.#', '###', '.#.', '.#.'],
  ['##.', '#.#', '.##', '#.#', '##.'],
  ['###', '.#.', '###', '.#.', '###'],
  ['#..', '###', '#.#', '###', '..#']
]

function holyFrame(f: number): Raster {
  const size = 224
  const r = new Raster(size, size)
  const c = size / 2
  const Rr = 104
  const t = f / 5
  const ringR = Rr * (0.3 + 0.7 * easeOut(t * 1.1))
  const thick = Math.max(2.5, 9 * (1 - t) ** 1.2 + 2)
  const fade = t < 0.6 ? 1 : 1 - ((t - 0.6) / 0.4) * 0.85
  glowDisc(r, c, c, ringR, R.holy[1], 0.08 * (1 - t))
  glowDisc(r, c, c, ringR * 0.8, R.holy[0], 0.1 * (1 - t))
  glowDisc(r, c, c, ringR * 0.45, C.white, 0.14 * (1 - t))
  for (const [rad, w, shift] of [
    [ringR, thick, 0],
    [ringR * 0.66, 2.4, 1]
  ]) {
    for (let y = Math.floor(c - rad - 1); y <= Math.ceil(c + rad + 1); y++)
      for (let x = Math.floor(c - rad - 1); x <= Math.ceil(c + rad + 1); x++) {
        const d = hyp(x + 0.5 - c, y + 0.5 - c)
        if (d > rad || d < rad - w) continue
        if (!keep(x, y, fade)) continue
        const q = (d - (rad - w)) / w
        r.set(x, y, q > 0.85 ? R.holy[3] : q > 0.6 ? R.holy[2] : q > 0.28 ? R.holy[1] : shift ? R.holy[0] : C.white)
      }
  }
  const rr = ringR - thick - 8
  if (rr > 14 && t < 0.92) {
    const n = 12
    for (let i = 0; i < n; i++) {
      const a = (i * TAU) / n + t * 0.5
      const x = Math.round(c + Math.cos(a) * rr) - 1
      const y = Math.round(c + Math.sin(a) * rr) - 2
      if (!keep(x, y, fade * 1.2)) continue
      const rune = RUNES[i % RUNES.length]
      rune.forEach((row, j) => {
        for (let k = 0; k < 3; k++) if (row[k] === '#') r.set(x + k + 1, y + j + 1, R.holy[2])
      })
      rune.forEach((row, j) => {
        for (let k = 0; k < 3; k++) if (row[k] === '#') r.set(x + k, y + j, i % 2 ? R.holy[0] : C.white)
      })
    }
  }
  const g = rng(2024)
  for (let i = 0; i < 26; i++) {
    const a = g() * TAU
    const d = Math.sqrt(g()) * ringR * 0.95
    const ph = g()
    const life = clamp01(1 - Math.abs(((t * 1.4 + ph) % 1) - 0.5) * 2)
    const x = c + Math.cos(a) * d
    const y = c + Math.sin(a) * d - t * 8 * (1 + ph)
    if (life > 0.7) sparkle(r, x, y, i % 3 === 0 ? 4 : 2, C.white, R.holy[0], R.holy[1])
    else if (life > 0.3) plus(r, x, y, 1, R.holy[1], C.white)
  }
  if (t < 0.7)
    for (let i = 0; i < 24; i++) {
      const a = (i * TAU) / 24
      const d0 = ringR + 3
      const d1 = ringR + 3 + (1 - t) * (i % 2 ? 7 : 4)
      r.line(
        c + Math.cos(a) * d0,
        c + Math.sin(a) * d0,
        c + Math.cos(a) * d1,
        c + Math.sin(a) * d1,
        i % 2 ? R.holy[1] : R.holy[0]
      )
    }
  return r
}

function healFrame(f: number): Raster {
  const r = new Raster(32, 48)
  const g = rng(8)
  for (let i = 0; i < 9; i++) {
    const x0 = 5 + g() * 22
    const sp = 4 + g() * 3
    const off = g() * 14
    const kind = i % 3
    const t = (f + 0.5) / 6
    const y = 42 - off * 0.5 - t * sp * 5.5
    const life = 1 - smooth(0.55, 1, t + (i % 3) * 0.06)
    if (y < 1 || life < 0.15) continue
    const x = x0 + Math.sin(t * 5 + i) * 2
    const gold = i % 2 === 0
    const main = gold ? R.holy[1] : R.poison[1]
    const light = gold ? C.white : R.poison[0]
    if (kind === 0) plus(r, x, y, life > 0.6 ? 2 : 1, main, light)
    else if (kind === 1) sparkle(r, x, y, life > 0.6 ? 3 : 1, light, main, gold ? R.holy[2] : R.poison[2])
    else {
      r.rect(Math.round(x), Math.round(y), 2, 2, main)
      r.set(x, y, light)
    }
  }
  glowDisc(r, 16, 42, 11, R.poison[1], 0.2 * (1 - f / 6), 4)
  glowDisc(r, 16, 42, 7, R.holy[0], 0.4 * (1 - f / 6), 2.6)
  return r
}

// Impact sparks ------------------------------------------------------------------------------------------------

/** A spiky star: `n` points of alternating length, rotated by `rot`. */
function star(r: Raster, cx: number, cy: number, n: number, ro: number, ri: number, rot: number, c: number, tilt = 0) {
  const pts: number[] = []
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n
    const rad = i % 2 ? ri : i % 4 === 0 ? ro : ro * (0.8 - tilt)
    pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
  }
  r.poly(pts, c)
}

function hitFrame(f: number): Raster {
  const r = new Raster(48, 48)
  const t = f / 3
  const k = [0.55, 1, 0.8, 0.45][f]
  const ro = 21 * k
  star(r, 24, 24, 6, ro, ro * 0.38, 0.35, R.fire[2])
  star(r, 24, 24, 6, ro * 0.8, ro * 0.3, 0.35, R.fire[1])
  star(r, 24, 24, 6, ro * 0.55, ro * 0.22, 0.35, R.fire[0])
  r.ellipse(24, 24, 3.2 * k + 1, 3.2 * k + 1, C.white)
  const g = rng(4)
  for (let i = 0; i < 10; i++) {
    const a = g() * TAU
    const d0 = ro * (0.95 + g() * 0.2) + t * 3
    const len = (1 - t * 0.5) * (4 + g() * 7)
    r.line(
      24 + Math.cos(a) * d0,
      24 + Math.sin(a) * d0,
      24 + Math.cos(a) * (d0 + len),
      24 + Math.sin(a) * (d0 + len),
      i % 3 ? R.fire[0] : C.white
    )
  }
  return f === 3 ? dissolve(r, 0.55) : r
}

function clangFrame(f: number): Raster {
  const r = new Raster(48, 48)
  const k = [0.5, 1, 0.8, 0.5][f]
  const L = 22 * k
  for (const [a, len, w] of [
    [-0.5, L, 2.4],
    [0.6 + Math.PI / 2, L * 0.85, 1.8],
    [0.6, L * 0.6, 1.4],
    [-0.5 + Math.PI / 2, L * 0.55, 1.4]
  ] as const) {
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    r.poly(
      [24 + dx * len, 24 + dy * len, 24 - dy * w, 24 + dx * w, 24 - dx * len, 24 - dy * len, 24 + dy * w, 24 - dx * w],
      R.magic[1]
    )
    r.poly(
      [
        24 + dx * len * 0.8,
        24 + dy * len * 0.8,
        24 - dy * w * 0.55,
        24 + dx * w * 0.55,
        24 - dx * len * 0.8,
        24 - dy * len * 0.8,
        24 + dy * w * 0.55,
        24 - dx * w * 0.55
      ],
      R.magic[0]
    )
  }
  r.ellipse(24, 24, 5 * k + 1, 5 * k + 1, R.magic[1])
  r.ellipse(24, 24, 3.6 * k + 0.6, 3.6 * k + 0.6, R.steel[0])
  r.ellipse(24, 24, 2 * k + 0.6, 2 * k + 0.6, C.white)
  const g = rng(12)
  for (let i = 0; i < 6; i++) {
    const a = g() * TAU
    const d = (9 + g() * 11) * (0.5 + f * 0.25)
    r.set(24 + Math.cos(a) * d, 24 + Math.sin(a) * d, i % 2 ? C.white : R.steel[1])
  }
  return f === 3 ? dissolve(r, 0.55) : r
}

function bonkFrame(f: number): Raster {
  const r = new Raster(64, 64)
  const k = [0.55, 1, 0.92, 0.6][f]
  const ro = 28 * k
  star(r, 32, 32, 5, ro, ro * 0.5, -Math.PI / 2, R.jobGold[3], 0)
  star(r, 32, 32, 5, ro * 0.88, ro * 0.43, -Math.PI / 2, R.jobGold[2], 0)
  star(r, 32, 32, 5, ro * 0.74, ro * 0.38, -Math.PI / 2, R.jobGold[1], 0)
  star(r, 32, 32, 5, ro * 0.5, ro * 0.28, -Math.PI / 2, R.jobGold[0], 0)
  r.ellipse(31, 31, 4 * k, 4 * k, C.white)
  const g = rng(55)
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8 + 0.2 + g() * 0.3
    const d = ro * 1.05 + 2 + f * 3 + g() * 4
    if (i % 2)
      sparkle(r, 32 + Math.cos(a) * d, 32 + Math.sin(a) * d, f < 2 ? 2 : 1, C.white, R.jobGold[0], R.jobGold[1])
    else
      r.line(
        32 + Math.cos(a) * d,
        32 + Math.sin(a) * d,
        32 + Math.cos(a) * (d + 5),
        32 + Math.sin(a) * (d + 5),
        R.jobGold[1]
      )
  }
  outlineWith(r, R.jobGold[4], false)
  return f === 3 ? dissolve(r, 0.6) : r
}

// Dust, smoke, splash, particles --------------------------------------------------------------------------------

function dustFrame(f: number): Raster {
  const r = new Raster(32, 32)
  const t = f / 4
  const puffs: [number, number, number][] = [
    [-1, 0, 1],
    [1, 0, 0.8],
    [0, -1, 0.6]
  ]
  for (const [side, up, sc] of puffs) {
    const rad = (2.5 + 5 * easeOut(t)) * sc
    const x = 16 + side * (3 + 7 * easeOut(t)) * (up ? 0.3 : 1)
    const y = 26 - 2 - rad * 0.6 + up * 5 - t * 5
    ball(r, x, y, rad, rad * 0.85, R.dirt, false)
  }
  return dissolve(r, f === 4 ? 0.35 : f === 3 ? 0.75 : 1)
}

function smokeFrame(f: number): Raster {
  const r = new Raster(64, 64)
  const t = f / 5
  const g = rng(90)
  const blobs = 8
  for (let i = 0; i < blobs; i++) {
    const a = (i * TAU) / blobs + g() * 0.5
    const dist = (4 + g() * 5) * (0.4 + easeOut(t) * 1.3)
    const rad = (5 + g() * 3) * (0.55 + easeOut(t) * 0.7)
    ball(r, 32 + Math.cos(a) * dist, 38 - t * 12 + Math.sin(a) * dist * 0.7, rad, rad * 0.9, R.paper, false)
  }
  ball(r, 32, 40 - t * 10, 8 * (0.6 + t * 0.5), 7 * (0.6 + t * 0.5), R.paper, false)
  if (f <= 1) sparkle(r, 32, 36, f === 0 ? 7 : 4, C.white, C.white, R.holy[1])
  for (let i = 0; i < 5; i++) {
    const a = g() * TAU
    const d = 12 + t * 18 + g() * 6
    if (f >= 1 && f < 5) r.set(32 + Math.cos(a) * d, 38 + Math.sin(a) * d * 0.8 - t * 8, i % 2 ? R.holy[0] : C.white)
  }
  return dissolve(r, [1, 1, 1, 0.85, 0.55, 0.25][f])
}

function splashFrame(f: number): Raster {
  const r = new Raster(64, 64)
  const t = f / 4
  const e = easeOut(t)
  for (const [k, c] of [
    [1, R.water[1]],
    [0.62, R.water[0]]
  ] as const) {
    const rx = (6 + 20 * e) * k
    const ry = rx * 0.4
    for (let y = 30; y < 58; y++)
      for (let x = 0; x < 64; x++) {
        const nx = (x + 0.5 - 32) / rx
        const ny = (y + 0.5 - 44) / ry
        const q = nx * nx + ny * ny
        if (q <= 1 && q >= 0.55 && keep(x, y, 1 - t * 0.8)) r.set(x, y, q > 0.8 ? c : R.water[2])
      }
  }
  const h = [10, 17, 12, 5, 0][f]
  if (h > 0) {
    r.poly([32 - 3 - (1 - t) * 2, 44, 32 - 1, 44 - h, 32 + 1, 44 - h, 32 + 3 + (1 - t) * 2, 44], R.water[1])
    r.poly([32 - 2, 44, 32 - 1, 44 - h + 2, 32, 44 - h + 2, 32, 44], R.water[0])
  }
  const g = rng(66)
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * (0.15 + 0.7 * g())
    const v = 10 + g() * 12
    const x = 32 + Math.cos(a) * v * e * 1.1
    const y = 44 + Math.sin(a) * v * e + 30 * (t * t) * (0.8 + g() * 0.4) - 2
    if (f === 4 && i % 2) continue
    r.rect(x, y, 2, 2, R.water[1])
    r.set(x, y, C.white)
  }
  return r
}

function leafFrame(f: number): Raster {
  const r = new Raster(16, 16)
  const a = (f * Math.PI) / 4 + 0.4
  const w = [3, 2.2, 1.2, 2.2][f]
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  const P = (u: number, v: number): [number, number] => [8 + ux * u - uy * v, 8 + uy * u + ux * v]
  r.poly([...P(-5.5, 0), ...P(-1, -w), ...P(5.5, 0), ...P(-1, w)], R.grass[2])
  r.poly([...P(-4.5, 0), ...P(-1, -w + 1), ...P(4.5, 0), ...P(-0.5, 0.2)], R.grass[1])
  r.poly([...P(-4, 0), ...P(-1, -w + 1.2), ...P(2, -0.4)], R.grass[0])
  const [x0, y0] = P(-5.5, 0)
  const [x1, y1] = P(5, 0)
  r.line(x0, y0, x1, y1, R.grassDark[2])
  return r
}

function shardFrame(f: number): Raster {
  const r = new Raster(16, 16)
  const a = f * 0.8 + 0.3
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  const s = [1, 0.8, 1, 0.75][f]
  const P = (u: number, v: number): [number, number] => [8 + (ux * u - uy * v) * s, 8 + (uy * u + ux * v) * s]
  r.poly([...P(-5, -3), ...P(5, -1), ...P(-1, 4)], R.roofTile[1])
  r.poly([...P(-1, 4), ...P(5, -1), ...P(0, 0.5)], R.roofTile[2])
  r.poly([...P(-5, -3), ...P(1, -2.2), ...P(-3, -0.5)], R.roofTile[0])
  outlineWith(r, R.roofTile[4], false)
  return r
}

function stunFrame(f: number): Raster {
  const r = new Raster(32, 16)
  for (let i = 0; i < 3; i++) {
    const a = (f * TAU) / 6 + (i * TAU) / 3
    const x = 16 + Math.cos(a) * 11
    const y = 8 + Math.sin(a) * 4
    const front = Math.sin(a) > 0
    const body = front ? R.jobGold[1] : R.jobGold[2]
    r.rect(Math.round(x) - 1, Math.round(y) - 1, 3, 3, body)
    sparkle(r, x, y, front ? 3 : 2, front ? C.white : R.jobGold[0], body, front ? R.jobGold[1] : R.jobGold[3])
  }
  outlineWith(r, C.inkWarm, false)
  return r
}

function alertFrame(f: number): Raster {
  const r = new Raster(16, 24)
  const k = [0.65, 1.2, 1][f]
  const lean = [-1, 0, 0][f]
  const wTop = 6 * k
  const barH = Math.round(13 * k)
  const dot = Math.max(3, Math.round(4 * k))
  const y1 = 22 - dot - 2
  const cx = 8
  const top = y1 - barH
  const layer = new Raster(16, 24)
  layer.poly([cx - wTop / 2 + lean, top, cx + wTop / 2 + lean, top, cx + 1.4, y1, cx - 1.4, y1], R.jobRed[1])
  layer.ellipse(cx + lean, top + 1.2, wTop / 2, 1.6, R.jobRed[1])
  layer.rect(cx - Math.floor(dot / 2), 22 - dot, dot, dot, R.jobRed[1])
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 16; x++) {
      if (!layer.get(x, y)) continue
      let c = R.jobRed[1]
      if (!layer.get(x + 1, y) || !layer.get(x, y + 1)) c = R.jobRed[2]
      else if (!layer.get(x - 1, y) || !layer.get(x, y - 1)) c = R.jobRed[0]
      r.set(x, y, c)
    }
  r.rect(cx - Math.floor(wTop / 2) + 1 + lean, top + 1, 1, Math.max(2, barH - 5), C.white)
  outlineWith(r, C.white, false)
  outlineWith(r, C.inkWarm, false)
  return r
}

function sparkFrame(f: number): Raster {
  const r = new Raster(16, 16)
  const len = [2, 4, 3, 1][f]
  sparkle(r, 8, 8, len, C.white, R.holy[0], R.holy[1])
  if (f % 2 === 1)
    for (const [dx, dy] of [
      [2, 2],
      [-2, 2],
      [2, -2],
      [-2, -2]
    ])
      r.set(8 + dx, 8 + dy, R.holy[2])
  if (f === 1) r.ellipse(8, 8, 1.4, 1.4, C.white)
  return r
}

function chargeFullFrame(f: number): Raster {
  const r = new Raster(64, 64)
  const pulse = [0, 1.5, 3, 1.5][f]
  const cx = 32
  const cy = 56
  const rx = 24 + pulse
  const ry = 11 + pulse * 0.45
  for (let y = 36; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1) continue
      if (q > 0.68) {
        const back = y < cy
        r.set(x, y, q > 0.9 ? R.holy[2] : q > 0.8 ? (back ? R.holy[1] : R.holy[0]) : back ? R.holy[0] : C.white)
      } else if (keep(x, y, 0.18 + pulse * 0.03)) r.set(x, y, R.holy[1])
    }
  const g = rng(31)
  for (let i = 0; i < 10; i++) {
    const a = g() * TAU
    const x = cx + Math.cos(a) * rx * 0.92
    const y0 = cy + Math.sin(a) * ry * 0.92
    const len = 6 + g() * 9
    const lift = ((f + i * 0.37) % 4) * 3
    if (i % 2 === f % 2) r.line(x, y0 - lift, x, y0 - lift - len * (0.5 + pulse * 0.1), i % 3 ? R.holy[1] : R.holy[0])
    else r.set(x, y0 - lift - 2, C.white)
  }
  for (let i = 0; i < 3; i++) {
    const a = (f * TAU) / 8 + (i * TAU) / 3
    sparkle(r, cx + Math.cos(a) * (rx - 1), cy + Math.sin(a) * (ry - 1), 2, C.white, R.holy[0], R.holy[1])
  }
  return r
}

function shockFrame(f: number): Raster {
  const size = 160
  const r = new Raster(size, size)
  const c = size / 2
  const t = f / 5
  const ringR = 74 * (0.15 + 0.85 * easeOut(t))
  const thick = Math.max(2, (1 - t) * 14 + 2)
  const fade = t < 0.5 ? 1 : 1 - ((t - 0.5) / 0.5) * 0.9
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = hyp(x + 0.5 - c, y + 0.5 - c)
      if (d > ringR || d < ringR - thick) {
        if (d < ringR - thick && d > ringR - thick - 14 && keep(x, y, 0.25 * (1 - t))) r.set(x, y, R.dirt[2])
        continue
      }
      if (!keep(x, y, fade)) continue
      const q = (d - (ringR - thick)) / thick
      r.set(x, y, q > 0.85 ? R.dirt[3] : q > 0.6 ? R.dirt[2] : q > 0.3 ? R.dirt[1] : t < 0.5 ? C.white : R.dirt[0])
    }
  const g = rng(5150)
  for (let i = 0; i < 22; i++) {
    const a = (i * TAU) / 22 + g() * 0.3
    const sp = 0.55 + g() * 0.5
    const d = ringR * sp + 6 + t * 10
    const hop = Math.sin(clamp01(t * 1.15 + g() * 0.1) * Math.PI) * (6 + g() * 10)
    const sz = 1 + (i % 3 === 0 ? 1 : 0) + (t < 0.5 && i % 4 === 0 ? 1 : 0)
    if (t > 0.85 && i % 2) continue
    const x = c + Math.cos(a) * d
    const y = c + Math.sin(a) * d - hop
    r.rect(x, y, sz + 1, sz + 1, i % 2 ? R.dirt[1] : R.stone[1])
    r.set(x, y, R.dirt[0])
  }
  if (t > 0.1 && t < 0.9)
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + 0.4
      ball(r, c + Math.cos(a) * ringR * 0.88, c + Math.sin(a) * ringR * 0.88, 4 + t * 3, 3.4 + t * 3, R.dirt, false)
    }
  if (t < 0.3) r.ellipse(c, c, 12 * (1 - t * 3), 12 * (1 - t * 3), C.white)
  return r
}

function soulFrame(f: number): Raster {
  const r = new Raster(32, 48)
  const bob = [0, -1, -1, 0][f]
  const cx = 16
  const cy = 21 + bob
  const rad = 12
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 32; x++) {
      const nx = (x + 0.5 - cx) / rad
      const ny = (y + 0.5 - cy) / rad
      const q = nx * nx + ny * ny
      if (q > 1) continue
      if (q > 0.72) r.set(x, y, nx + ny < 0 ? C.white : R.ice[1])
      else r.set(x, y, keep(x, y, 0.38) ? R.ice[0] : R.sky[0])
    }
  const gy = cy + 1
  r.ellipse(cx, gy - 1, 5.2, 5.4, C.white)
  r.poly(
    [
      cx - 5,
      gy - 1,
      cx + 5,
      gy - 1,
      cx + 5,
      gy + 5,
      cx + 3,
      gy + 3.5,
      cx + 1,
      gy + 5.5,
      cx - 1,
      gy + 3.5,
      cx - 3,
      gy + 5.5,
      cx - 5,
      gy + 4
    ],
    C.white
  )
  r.rect(cx - 3, gy - 2, 2, 2, C.black)
  r.rect(cx + 1, gy - 2, 2, 2, C.black)
  r.set(cx, gy + 1, R.ratPink[2])
  r.set(cx - 5, gy + 1, R.paper[2])
  r.set(cx + 4, gy + 1, R.paper[2])
  outlineWith(r, R.sky[3], false)
  r.rect(cx - 8, cy - 7, 3, 1, C.white)
  r.rect(cx - 9, cy - 6, 1, 3, C.white)
  r.set(cx + 7, cy + 6, R.sky[2])
  // The thread of bubbles down to the fallen hero.
  r.set(cx + 1, 37 + bob, R.ice[0])
  r.set(cx + 1, 38 + bob, R.ice[0])
  r.set(cx, 38 + bob, R.ice[0])
  r.set(cx, 37 + bob, R.ice[0])
  outlineWith(r, R.sky[3], false)
  r.set(cx - 2, 42, R.ice[0])
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ])
    r.set(cx - 2 + dx, 42 + dy, R.sky[3])
  return r
}

function reviveFrame(f: number): Raster {
  const r = new Raster(96, 96)
  const t = f / 5
  const cx = 48
  const cy = 80
  const rx = 10 + 34 * easeOut(Math.min(1, t * 1.2))
  const ry = rx * 0.38
  const fade = t < 0.5 ? 1 : 1 - ((t - 0.5) / 0.5) * 0.9
  for (let y = 60; y < 96; y++)
    for (let x = 0; x < 96; x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1) continue
      if (q > 0.7) {
        if (keep(x, y, fade)) r.set(x, y, q > 0.9 ? R.holy[2] : q > 0.8 ? R.holy[1] : C.white)
      } else if (keep(x, y, 0.2 * (1 - t))) r.set(x, y, R.holy[1])
    }
  const w = [5, 12, 15, 11, 7, 3][f]
  const h = [18, 52, 66, 66, 58, 48][f]
  for (let y = cy - h; y <= cy; y++) {
    const fy = (cy - y) / h
    const half = w * (1 - fy * 0.45) * 0.5
    for (let x = Math.floor(cx - half - 4); x <= Math.ceil(cx + half + 4); x++) {
      const d = Math.abs(x + 0.5 - cx)
      if (d > half + 3) continue
      const top = fy > 0.7 ? 1 - (fy - 0.7) / 0.3 : 1
      const a = d < half * 0.45 ? 1 : d < half ? 0.9 : 0.4
      if (!keep(x, y, top * a * (t > 0.6 ? 1 - (t - 0.6) : 1) + 0.02)) continue
      r.set(x, y, d < half * 0.4 ? C.white : d < half * 0.8 ? R.holy[0] : d < half ? R.holy[1] : R.holy[2])
    }
  }
  const g = rng(321)
  for (let i = 0; i < 12; i++) {
    const x0 = cx + (g() - 0.5) * 36
    const sp = 14 + g() * 28
    const ph = g() * 0.4
    const y = cy - 4 - sp * (t + ph * t)
    if (f === 0 || y < 4) continue
    if (i % 3 === 0) sparkle(r, x0, y, t < 0.9 ? 3 : 1, C.white, R.holy[0], R.holy[1])
    else plus(r, x0, y, 1, R.holy[1], C.white)
  }
  if (f === 0) r.ellipse(cx, cy - 6, 8, 5, C.white)
  return r
}

function telegraphFrame(f: number): Raster {
  const r = new Raster(64, 64)
  const lo = f === 0
  const edge = lo ? R.jobRed[2] : R.jobRed[1]
  const hot = lo ? R.jobRed[1] : R.jobRed[0]
  for (let y = 4; y < 60; y++)
    for (let x = 4; x < 60; x++) {
      const stripe = ((x + y + (lo ? 0 : 6)) >> 3) & 1
      if (stripe && keep(x, y, lo ? 0.5 : 0.65)) r.set(x, y, lo ? R.jobRed[3] : R.jobRed[2])
      else if (!stripe && keep(x, y, 0.18)) r.set(x, y, R.jobRed[2])
    }
  r.rect(3, 3, 58, 2, edge)
  r.rect(3, 59, 58, 2, edge)
  r.rect(3, 3, 2, 58, edge)
  r.rect(59, 3, 2, 58, edge)
  // Brighter corner brackets.
  for (const [x0, y0, dx, dy] of [
    [3, 3, 1, 1],
    [60, 3, -1, 1],
    [3, 60, 1, -1],
    [60, 60, -1, -1]
  ] as const)
    for (let k = 0; k < 12; k++) {
      const hx = dx > 0 ? x0 + k : x0 - k
      const vy = dy > 0 ? y0 + k : y0 - k
      r.rect(hx, dy > 0 ? y0 : y0 - 2, 1, 3, hot)
      r.rect(dx > 0 ? x0 : x0 - 2, vy, 3, 1, hot)
    }
  const m = lo ? R.jobRed[1] : R.jobRed[0]
  r.ellipse(32, 32, 9, 9, R.jobRed[3])
  r.ellipse(32, 32, 7.5, 7.5, edge)
  r.rect(31, 26, 3, 7, m)
  r.rect(31, 35, 3, 3, m)
  if (!lo) {
    r.rect(31, 26, 1, 7, C.white)
    r.rect(31, 35, 1, 3, C.white)
  }
  outlineWith(r, R.jobRed[4], false)
  return r
}

function gemSparkleFrame(f: number): Raster {
  const r = new Raster(16, 16)
  sparkle(r, 8, 8, [2, 5, 7, 3][f], C.white, C.white, C.spark)
  if (f === 1 || f === 2) {
    r.ellipse(8, 8, f === 2 ? 2 : 1.4, f === 2 ? 2 : 1.4, C.white)
    for (const [dx, dy] of [
      [2, 2],
      [-2, -2],
      [2, -2],
      [-2, 2]
    ])
      r.set(8 + dx, 8 + dy, C.spark)
  }
  return f === 3 ? dissolve(r, 0.6) : r
}

/** The 360° whirl: two crescent blades chasing each other around a ring that spins and thins out. */
function spinFrame(f: number, t: number): Raster {
  const size = 192
  const r = new Raster(size, size)
  const c = size / 2
  const rad = 60 + 24 * easeOut(Math.min(1, t * 1.3))
  const spin = f * 1.15
  const fade = [1, 1, 1, 0.9, 0.7, 0.45][f]
  const width = [8, 15, 16, 13, 9, 5][f]
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      const d = hyp(dx, dy)
      if (Math.abs(d - rad) > width) continue
      const th = Math.atan2(dy, dx) - spin
      // Distance behind each leading tip (0 = tip, 1 = far tail), two blades per turn.
      const u = (((-th % Math.PI) + Math.PI) % Math.PI) / Math.PI
      const w = Math.max(0.9, width * (1 - u * 0.97) ** 0.9 * (u < 0.02 ? u / 0.02 : 1))
      const inner = rad - w * 0.45
      const outer = rad + w * 0.55
      if (d < inner || d > outer) continue
      if (!keep(x, y, fade)) continue
      const p = (d - inner) / (outer - inner)
      if (u > 0.82 && !keep(x, y, (1 - u) * 5)) continue
      r.set(
        x,
        y,
        p > 0.78
          ? C.white
          : p > 0.5
            ? u < 0.5
              ? C.white
              : R.jobRed[0]
            : p > 0.3
              ? R.jobRed[0]
              : p > 0.13
                ? R.jobRed[1]
                : R.jobRed[2]
      )
    }
  r.ring(c, c, rad - 20, rad - 18, R.jobRed[2], spin - 0.4, spin + 1.3)
  r.ring(c, c, rad - 20, rad - 18, R.jobRed[2], spin + Math.PI - 0.4, spin + Math.PI + 1.3)
  for (let k = 0; k < 2; k++) {
    const a = spin + k * Math.PI
    sparkle(r, c + Math.cos(a) * (rad + 3), c + Math.sin(a) * (rad + 3), f < 3 ? 3 : 1, C.white, C.white, R.jobRed[0])
  }
  return r
}

// ---------------------------------------------------------------------------------------------------------------

export function buildFx(): Sheet {
  const s: Sheet = {}
  for (let a = 0; a < TURNS; a++) {
    const pol = slashPolar(a)
    s[`slash_${a}`] = make(
      `slash_${a}`,
      frames(4, (f) => slashFrame(a, f, pol))
    )
    s[`arrow_${a}`] = make(`arrow_${a}`, [arrowRaster(a, false)])
    s[`enemy_arrow_${a}`] = make(`enemy_arrow_${a}`, [arrowRaster(a, true)])
  }
  s.spin = make(
    'spin',
    frames(6, (f, t) => spinFrame(f, t)),
    { alpha: [1, 1, 1, 0.95, 0.8, 0.55] }
  )
  s.bonk = make('bonk', frames(4, bonkFrame))
  s.bolt = make('bolt', frames(4, boltFrame))
  s.orb = make('orb', frames(4, orbFrame))
  s.fireball = make('fireball', frames(4, fireballFrame))
  s.burst = make(
    'burst',
    frames(6, (f) => burstFrame(96, 6, f, false))
  )
  s.bigburst = make(
    'bigburst',
    frames(7, (f) => burstFrame(192, 7, f, true))
  )
  s.holy = make('holy', frames(6, holyFrame), { alpha: [0.95, 1, 1, 0.95, 0.85, 0.7] })
  s.heal = make('heal', frames(6, healFrame))
  s.hit = make('hit', frames(4, hitFrame))
  s.clang = make('clang', frames(4, clangFrame))
  s.dust = make('dust', frames(5, dustFrame))
  s.smoke = make('smoke', frames(6, smokeFrame))
  s.splash = make('splash', frames(5, splashFrame))
  s.leaf = make('leaf', frames(4, leafFrame))
  s.shard = make('shard', frames(4, shardFrame))
  s.stun = make('stun', frames(6, stunFrame))
  s.alert = make('alert', frames(3, alertFrame))
  s.spark = make('spark', frames(4, sparkFrame))
  s.charge_full = make('charge_full', frames(4, chargeFullFrame), { alpha: [0.85, 1, 0.9, 1] })
  s.shock = make('shock', frames(6, shockFrame))
  s.soul = make('soul', frames(4, soulFrame), { alpha: [0.92, 0.96, 0.92, 0.88] })
  s.revive = make('revive', frames(6, reviveFrame))
  s.telegraph = make('telegraph', frames(2, telegraphFrame), { alpha: [0.72, 0.92] })
  s.gem_sparkle = make('gem_sparkle', frames(4, gemSparkleFrame))
  return s
}
