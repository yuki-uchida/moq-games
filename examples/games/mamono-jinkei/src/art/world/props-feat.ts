/** Meadow props, part 3: acorn puzzle, crack rock, bounce mushroom, pillar, torch, altar. */
import { C, R } from '../palette'
import { Raster, outline, rng } from '../raster'
import type { Sheet } from '../sheet'
import { crack } from './gfx'
import { box, column, frame, mk, shadow, solid } from './pp'

const GD = R.grassDark
const S = R.stone
const ROCK = R.rock
const FIRE = R.fire
const MAGIC = R.magic
const HOLY = R.holy
const WOOD = R.wood

const mossBlob = (r: Raster, x: number, y: number, rx: number, ry: number) => {
  r.ellipse(x + 0.4, y + 0.6, rx, ry, GD[2])
  r.ellipse(x, y, rx, ry, GD[1])
  r.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.5, ry * 0.4, GD[0])
}

// ------------------------------------------------------------------ acorn

function acorn() {
  const r = frame('acorn')
  shadow(r, 50, 82, 30, 6, GD[2], GD[1])
  const body = new Raster(96, 96)
  const LEA = R.leather
  solid(
    body,
    [
      [48, 60, 26, 28, 30],
      [48, 80, 12, 9, 12]
    ],
    [LEA[0], LEA[1], LEA[2], LEA[3]],
    1.2,
    3
  )
  // glossy bands: the nut is smooth, so the specular reads as a clean crescent
  body.ellipse(37, 54, 3.2, 8, C.white)
  body.ellipse(37, 54, 2.2, 7, R.paper[1])
  body.set(36, 63, C.white)
  body.set(36, 65, C.white)
  body.ellipse(60, 70, 2, 5, LEA[1])
  body.ellipse(58, 79, 2.2, 3.2, LEA[0])
  body.set(48, 90, LEA[3])
  // cap with scaled texture
  const cap = new Raster(96, 96)
  const HB = R.hairBrown
  solid(cap, [[48, 40, 31, 21, 20]], [WOOD[0], HB[0], HB[1], HB[2]], 0.5, 8)
  for (let y = 24; y < 58; y++)
    for (let x = 17; x < 80; x++) {
      if (!cap.get(x, y)) continue
      const dgl = (x + y) % 7 === 0 || (x - y + 70) % 7 === 0
      if (dgl) cap.set(x, y, cap.get(x, y) === HB[0] ? WOOD[3] : HB[2])
      else if ((x + y) % 7 === 1 && cap.get(x, y) !== HB[3]) cap.set(x, y, WOOD[1])
    }
  // rim of the cap and stem
  for (let x = 20; x < 78; x++) {
    const t = (x - 48) / 30
    const y = Math.round(55 + Math.sqrt(Math.max(0, 1 - t * t)) * 4)
    cap.set(x, y, HB[3])
    cap.set(x, y - 1, HB[2])
  }
  cap.rect(46, 14, 6, 11, WOOD[2])
  cap.rect(46, 14, 2, 11, WOOD[1])
  cap.ellipse(49, 14, 4, 2.2, WOOD[0])
  cap.set(47, 13, WOOD[0])
  cap.ellipse(36, 32, 5, 2.2, WOOD[0])
  cap.ellipse(35, 31, 2.5, 1, C.white)
  outline(cap)
  outline(body)
  r.blit(body)
  r.blit(cap)
  return r
}

// ------------------------------------------------------------------ pedestal

function rune(r: Raster, x: number, y: number, kind: number, c: number) {
  const L = (x0: number, y0: number, x1: number, y1: number) => r.line(x + x0, y + y0, x + x1, y + y1, c)
  if (kind === 0) {
    L(0, 0, 0, 10)
    L(0, 3, 5, 0)
    L(0, 7, 5, 4)
  } else if (kind === 1) {
    L(0, 5, 3, 0)
    L(3, 0, 6, 5)
    L(1, 8, 5, 8)
    L(3, 0, 3, 10)
  } else {
    r.ring(x + 3, y + 5, 2, 4, c)
    L(3, 0, 3, 10)
  }
}

function pedestal(on: boolean, f: number) {
  const r = frame('pedestal_off')
  shadow(r, 66, 90, 58, 6, GD[2], GD[1])
  const b = new Raster(128, 96)
  box(b, 8, 24, 112, 26, 38, [S[0], S[1], S[2], S[3]])
  // socket on top
  const pulse = on ? [0, 1, 2, 1][f] : 0
  b.ellipse(64, 37, 17, 8.5, S[2])
  b.ellipse(64, 36.4, 17, 8, S[0])
  b.ellipse(64, 38, 14, 6.4, on ? MAGIC[3] : S[3])
  b.ellipse(64, 37.6, 13, 5.6, on ? MAGIC[2] : C.inkCool)
  // acorn-shaped relief inside the socket
  const AC = on ? (pulse === 2 ? C.white : MAGIC[0]) : S[2]
  b.ellipse(64, 38, 5, 3.6, AC)
  b.rect(61, 33, 6, 2, on ? MAGIC[1] : S[1])
  b.set(64, 31, AC)
  b.set(64, 32, AC)
  if (on)
    for (let i = 0; i < 8; i++) b.set(64 + Math.cos(i + f) * 15, 37 + Math.sin(i + f) * 6.6, i % 2 ? C.spark : MAGIC[0])
  // front: three carved runes between pilasters
  b.rect(14, 54, 3, 34, S[2])
  b.rect(111, 54, 3, 34, S[2])
  b.rect(20, 56, 88, 1, S[2])
  b.rect(20, 84, 88, 1, S[2])
  const glow = on ? [MAGIC[0], C.white, MAGIC[1], C.white][f] : S[3]
  for (let i = 0; i < 3; i++) {
    const x = 36 + i * 28
    if (on) {
      b.rect(x - 5, 61, 16, 20, MAGIC[3])
      b.rect(x - 4, 62, 14, 18, MAGIC[2])
    }
    rune(b, x, 64, i, glow)
    rune(b, x, 64, i, glow)
  }
  const rn = rng(12)
  crack(b, 98, 56, -1, 1, 8, rn, S[3])
  mossBlob(b, 14, 27, 7, 2.6)
  mossBlob(b, 100, 74, 9, 3)
  mossBlob(b, 22, 87, 8, 2.4)
  outline(b)
  return r.blit(b)
}

// ------------------------------------------------------------------ crack rock

function rockBody(extra = 0) {
  const b = new Raster(128, 160)
  solid(
    b,
    [
      [64, 92, 54, 46, 54],
      [30, 108, 28, 26, 36],
      [100, 108, 28, 26, 36],
      [56, 68, 34, 24, 40],
      [92, 76, 26, 22, 34]
    ],
    ROCK,
    5 + extra,
    13
  )
  return b
}

const CRACKS: number[][] = [
  [64, 52, 58, 64, 66, 76, 58, 88, 64, 102, 60, 118],
  [62, 76, 46, 82, 38, 96, 22, 104],
  [66, 80, 82, 88, 92, 82, 108, 92],
  [60, 96, 70, 108, 84, 112, 96, 124],
  [56, 66, 44, 58, 40, 44]
]

function glowCracks(r: Raster, k = 1, wob = 0) {
  for (const path of CRACKS) {
    for (let i = 0; i + 3 < path.length; i += 2) {
      const [x0, y0, x1, y1] = [path[i], path[i + 1], path[i + 2], path[i + 3]]
      r.thick(x0 + wob, y0, x1 + wob, y1, 4 * k, FIRE[3])
    }
  }
  for (const path of CRACKS)
    for (let i = 0; i + 3 < path.length; i += 2)
      r.thick(path[i] + wob, path[i + 1], path[i + 2] + wob, path[i + 3], 2.6 * k, FIRE[2])
  for (const path of CRACKS)
    for (let i = 0; i + 3 < path.length; i += 2)
      r.line(path[i] + wob, path[i + 1], path[i + 2] + wob, path[i + 3], FIRE[1])
  for (const path of CRACKS) r.line(path[0] + wob, path[1], path[2] + wob, path[3], FIRE[0])
}

function crackrock() {
  const r = frame('crackrock')
  shadow(r, 66, 142, 62, 9, GD[2], GD[1])
  const b = rockBody()
  glowCracks(b)
  outline(b)
  const rn = rng(4)
  for (let i = 0; i < 3; i++) mossBlob(b, 30 + rn() * 70, 58 + rn() * 30, 7, 2.4)
  return r.blit(b)
}

/** A small tumbling chunk of rock. */
function chunk(x: number, y: number, rad: number, seed: number) {
  const c = new Raster(128, 160)
  const local = new Raster(rad * 2 + 4, rad * 2 + 4)
  solid(local, [[rad + 2, rad + 2, rad, rad * 0.85, rad * 0.9]], ROCK, 1.5, seed)
  outline(local)
  c.blit(local, Math.round(x - rad - 2), Math.round(y - rad - 2))
  return c
}

function crackBreak(k: number) {
  const r = frame('crackrock_break')
  shadow(r, 66, 142, 62, 9, GD[2], GD[1])
  const rn = rng(66)
  const chunks = Array.from({ length: 11 }, (_, i) => {
    const a = (i / 11) * Math.PI * 2 + 0.3 + (rn() - 0.5) * 0.9
    return {
      x0: 64 + Math.cos(a) * 30,
      y0: 96 + Math.sin(a) * 22,
      vx: Math.cos(a) * (6 + rn() * 14),
      vy: Math.sin(a) * 6 - 8 - rn() * 16,
      rad: 7 + Math.floor(rn() * 9),
      rest: [64 + Math.cos(a) * (28 + rn() * 24), 128 + Math.sin(a) * 10 + rn() * 8]
    }
  })
  if (k === 0) {
    const b = rockBody(1)
    glowCracks(b, 1.4, 0)
    outline(b)
    return r.blit(b.shifted(k % 2 ? 1 : -1, 0))
  }
  if (k === 1) {
    const b = rockBody(2)
    glowCracks(b, 2.4)
    b.ellipse(64, 90, 26, 22, FIRE[1])
    b.ellipse(64, 90, 16, 14, FIRE[0])
    b.ellipse(64, 90, 8, 7, C.white)
    outline(b)
    r.blit(b.shifted(-1, 0))
    for (let i = 0; i < 4; i++) r.blit(chunk(64 + (i - 1.5) * 26, 70 + (i % 2) * 38, 8, i))
    return r
  }
  // dust drifts along the ground behind the chunks
  const dustAmt = [0, 0, 0.9, 0.8, 0.6, 0.4, 0.2][k]
  const dr = new Raster(128, 160)
  for (let i = 0; i < 8; i++) {
    const x = 64 + (i - 3.5) * (11 + k * 2.5)
    const y = 118 + ((i * 7) % 5) * 4 - k * 2
    const rr = (6 + k + (i % 3) * 2) * (0.35 + dustAmt * 0.7)
    dr.ellipse(x, y, rr * 1.3, rr * 0.8, R.paper[3])
    dr.ellipse(x - 1, y - 2, rr * 1.0, rr * 0.6, R.paper[2])
  }
  if (dustAmt > 0) r.blit(dr)
  // rubble pile left behind (grows as chunks land)
  const pile = (count: number) => {
    const p = new Raster(128, 160)
    for (const c of chunks.slice(0, count)) p.blit(chunk(c.rest[0], c.rest[1], Math.max(5, c.rad - 3), c.rad))
    return p
  }
  if (k >= 5) r.blit(pile(k === 5 ? 8 : 11))
  else r.blit(pile(3))
  // flying chunks
  if (k <= 4) {
    const t = k - 1
    chunks.forEach((c, i) => {
      if (k === 4 && i < 3) return
      r.blit(chunk(c.x0 + c.vx * t, Math.min(c.rest[1], c.y0 + c.vy * t + 5 * t * t), c.rad - (k === 4 ? 1 : 0), i))
    })
  }
  if (k === 2)
    for (let i = 0; i < 6; i++) r.ellipse(64 + (i - 2.5) * 12, 92 - (i % 2) * 14, 3, 3, i % 2 ? FIRE[1] : FIRE[0])
  return r
}

// ------------------------------------------------------------------ bounce mushroom

function bounce(sx: number, sy: number, tilt = 0) {
  const r = frame('bounce')
  const X = (x: number) => 32 + (x - 32) * sx
  const Y = (y: number) => 52 + (y - 52) * sy
  shadow(r, 34, 51, 22 * Math.min(1.25, sx), 4, GD[2], GD[1])
  const m = new Raster(64, 64)
  const CREAM = R.hay
  // stem
  for (let y = Math.round(Y(36)); y < 52; y++) {
    const t = (y - Y(36)) / (52 - Y(36))
    const half = (6 + t * 2) * sx
    for (let x = Math.round(32 - half + tilt); x <= Math.round(32 + half + tilt); x++) {
      const u = (x - (32 - half + tilt)) / (half * 2)
      m.set(x, y, u < 0.25 ? CREAM[0] : u < 0.65 ? CREAM[1] : u < 0.88 ? CREAM[2] : CREAM[3])
    }
  }
  // gills
  m.ellipse(X(32) + tilt, Y(36), 21 * sx, 5 * sy, R.jobRed[3])
  // cap dome
  const cap = new Raster(64, 64)
  const rx = 25 * sx
  const ry = 17 * sy
  const cx = 32 + tilt
  const cy = Y(34)
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + 2 * sy); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + (ny < 0 ? ny * ny : (ny * ny) / 0.06)
      if (q > 1) continue
      const d = -(nx * 0.55 + ny * 0.8)
      cap.set(
        x,
        y,
        d > 0.62
          ? R.ratPink[0]
          : d > 0.18
            ? R.ratPink[1] === 0
              ? 0
              : R.jobRed[0]
            : d > -0.28
              ? R.jobRed[1]
              : d > -0.65
                ? R.jobRed[2]
                : R.jobRed[3]
      )
    }
  // spots
  for (const [px, py, pr] of [
    [-11, -3, 4.4],
    [4, -10, 4],
    [12, -2, 3.4],
    [-2, 0, 2.6]
  ] as const) {
    const sxp = cx + px * sx
    const syp = cy + py * sy
    cap.ellipse(sxp, syp, pr * sx, pr * 0.75 * sy, R.paper[1])
    cap.ellipse(sxp - pr * 0.25, syp - pr * 0.25, pr * 0.55 * sx, pr * 0.4 * sy, C.white)
    cap.ellipse(sxp + pr * 0.4, syp + pr * 0.4, pr * 0.4 * sx, pr * 0.3 * sy, R.paper[2])
  }
  // rim shadow under the cap
  for (let x = Math.round(cx - rx + 2); x < Math.round(cx + rx - 1); x++)
    cap.set(x, Math.round(cy + 2 * sy), R.jobRed[3])
  outline(m)
  outline(cap)
  r.blit(m)
  r.blit(cap)
  return r
}

// ------------------------------------------------------------------ pillar

function pillar() {
  const r = frame('pillar')
  shadow(r, 34, 148, 28, 5, GD[2], GD[1])
  const p = new Raster(64, 160)
  box(p, 7, 126, 50, 12, 22, [S[0], S[1], S[2], S[3]])
  // shaft with fluting, top broken along a slanted jagged edge
  column(p, 14, 50, 60, 130, [S[0], S[1], S[2], S[3]], 9)
  for (let x = 14; x < 50; x++) {
    const top = 60 + Math.round((x - 14) * 0.5) + (((x * 7) % 5) - 2) + ((x * 3) % 4 === 0 ? 3 : 0)
    for (let y = 56; y < top; y++) p.set(x, y, 0)
    // fractured top face
    p.set(x, top, S[0])
    p.set(x, top + 1, S[1])
  }
  p.rect(13, 112, 38, 4, S[1])
  p.rect(13, 112, 38, 1, S[0])
  p.rect(13, 115, 38, 1, S[3])
  // top slab remnant overhang at the left
  p.poly([12, 74, 22, 66, 26, 74, 20, 82], S[1])
  p.poly([12, 74, 22, 66, 24, 70, 14, 76], S[0])
  const rn = rng(21)
  crack(p, 30, 76, 1, 1, 22, rn, S[3])
  crack(p, 20, 96, 1, 1, 12, rn, S[3])
  // ivy climbing from the base
  for (let i = 0; i < 22; i++) {
    const y = 124 - i * 3
    const x = 15 + Math.round(Math.sin(i * 0.8) * 3) + (i > 14 ? 2 : 0)
    p.ellipse(x, y, 2.6, 1.8, GD[1])
    p.set(x - 1, y - 1, GD[0])
    if (i % 3 === 0) p.ellipse(x + 3, y + 1, 1.8, 1.4, GD[2])
  }
  mossBlob(p, 20, 140, 11, 3)
  mossBlob(p, 28, 58, 0.1, 0.1)
  // fallen fragments
  const frag = new Raster(64, 160)
  solid(frag, [[50, 148, 9, 6, 8]], [S[0], S[1], S[2], S[3]], 1, 4)
  solid(frag, [[56, 142, 5, 4, 5]], [S[0], S[1], S[2], S[3]], 1, 6)
  outline(frag)
  outline(p)
  return r.blit(p).blit(frag)
}

// ------------------------------------------------------------------ torch

function torch(f: number) {
  const r = frame('torch')
  shadow(r, 18, 58, 8, 2.4, GD[2], GD[1])
  const t = new Raster(32, 64)
  // post
  for (let y = 26; y < 58; y++) {
    t.set(13, y, WOOD[0])
    t.rect(14, y, 3, 1, WOOD[1])
    t.set(17, y, WOOD[2])
    t.set(18, y, WOOD[3])
  }
  // iron cup
  t.poly([10, 24, 22, 24, 20, 31, 12, 31], R.clothBlack[1])
  t.rect(10, 24, 12, 2, R.clothBlack[0])
  t.rect(18, 26, 4, 5, R.clothBlack[2])
  t.rect(12, 28, 8, 1, R.clothBlack[2])
  outline(t)
  r.blit(t)
  // flame: teardrop, flickers between four shapes
  const sh = [
    { h: 20, w: 7, lean: 0 },
    { h: 23, w: 6, lean: 1 },
    { h: 19, w: 7.4, lean: -1 },
    { h: 22, w: 6.4, lean: 0 }
  ][f]
  const fl = new Raster(32, 64)
  const cx = 16
  const base = 25
  for (let y = 0; y <= sh.h; y++) {
    const u = y / sh.h
    const half = sh.w * Math.sin(Math.pow(1 - u, 0.65) * Math.PI * 0.5) * (1 - Math.pow(u, 3) * 0.25)
    const mid = cx + sh.lean * u * u * 3
    for (let x = Math.floor(mid - half); x <= Math.ceil(mid + half); x++) {
      const d = Math.abs(x + 0.5 - mid) / Math.max(0.5, half)
      const c = u > 0.82 ? FIRE[3] : d > 0.78 || u > 0.62 ? FIRE[2] : d > 0.46 || u > 0.34 ? FIRE[1] : FIRE[0]
      fl.set(x, base - y, c)
    }
  }
  fl.ellipse(cx - 1, base - 3, 2, 3, C.white)
  outline(fl)
  r.blit(fl)
  // sparks
  const rn = rng(5 + f * 3)
  for (let i = 0; i < 3; i++) r.set(cx + (rn() - 0.5) * 12, base - 22 - rn() * 8 - f, FIRE[i % 2 ? 0 : 1])
  return r
}

// ------------------------------------------------------------------ altar

function altar() {
  const r = frame('altar')
  shadow(r, 66, 100, 60, 7, GD[2], GD[1])
  const a = new Raster(128, 128)
  box(a, 8, 70, 112, 14, 26, [S[0], S[1], S[2], S[3]])
  a.rect(8, 86, 112, 1, S[2])
  box(a, 26, 38, 76, 20, 34, [S[0], S[1], S[2], S[3]])
  // round socket where the orb appears
  a.ellipse(64, 48, 24, 9.4, S[2])
  a.ellipse(64, 47.4, 24, 9, S[0])
  a.ellipse(64, 48.6, 20, 7.4, S[3])
  a.ellipse(64, 48.2, 19, 6.8, C.inkCool)
  a.ellipse(64, 48.6, 12, 4.4, S[3])
  a.ellipse(64, 48.2, 11, 3.8, S[2])
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2
    a.rect(Math.round(64 + Math.cos(t) * 22), Math.round(48 + Math.sin(t) * 8) - 1, 2, 2, S[1])
  }
  // front: carved ring relief and side runes
  a.rect(34, 62, 60, 1, S[2])
  a.ring(64, 76, 8, 11, S[2])
  a.ring(64, 75.5, 8, 10, S[0], Math.PI * 0.9, Math.PI * 1.9)
  a.ellipse(64, 76, 5, 5, S[3])
  a.ellipse(63, 75, 3.6, 3.6, S[2])
  a.rect(36, 66, 1, 22, S[2])
  a.rect(91, 66, 1, 22, S[2])
  for (const [x, c] of [
    [43, 0],
    [78, 1]
  ] as const) {
    const g = new Raster(128, 128)
    rune(g, x, 68, c, S[3])
    a.blit(g)
  }
  const rn = rng(31)
  crack(a, 94, 62, -1, 1, 10, rn, S[3])
  crack(a, 14, 88, 1, 1, 9, rn, S[3])
  mossBlob(a, 32, 44, 9, 3)
  mossBlob(a, 14, 74, 7, 2.6)
  mossBlob(a, 100, 92, 11, 3)
  mossBlob(a, 70, 100 - 14, 0.1, 0.1)
  outline(a)
  r.blit(a)
  // fallen rubble beside the steps
  const rub = new Raster(128, 128)
  solid(rub, [[112, 104, 8, 5, 6]], [S[0], S[1], S[2], S[3]], 1, 9)
  solid(rub, [[120, 100, 5, 4, 4]], [S[0], S[1], S[2], S[3]], 1, 2)
  outline(rub)
  return r.blit(rub)
}

export const featSheet = (): Sheet => ({
  acorn: mk('acorn', [acorn()]),
  pedestal_off: mk('pedestal_off', [pedestal(false, 0)]),
  pedestal_on: mk(
    'pedestal_on',
    [0, 1, 2, 3].map((f) => pedestal(true, f))
  ),
  crackrock: mk('crackrock', [crackrock()]),
  crackrock_break: mk('crackrock_break', [0, 1, 2, 3, 4, 5, 6].map(crackBreak)),
  bounce: mk('bounce', [bounce(1, 1)]),
  bounce_boing: mk('bounce_boing', [bounce(1.22, 0.62), bounce(0.8, 1.28), bounce(1.08, 0.9), bounce(0.97, 1.05)]),
  pillar: mk('pillar', [pillar()]),
  torch: mk('torch', [0, 1, 2, 3].map(torch)),
  altar: mk('altar', [altar()])
})
