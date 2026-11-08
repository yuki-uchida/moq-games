/** Stage 4 gimmick props: moonstones, ice, the battering log, snow piles and the brazier. */
import { C } from '../palette'
import { Raster, bayer, outline, rng } from '../raster'
import type { Sheet } from '../sheet'
import { ih } from './gfx'
import {
  FIRE,
  IC,
  IRON,
  NG,
  ROPE,
  SN,
  ST,
  WD,
  drift,
  flame,
  frame,
  glowGlyph,
  glyph,
  mk,
  shade,
  snowCap
} from './forest-kit'
import { box } from './pp'

// ------------------------------------------------------------------ standing stones

/** A rounded standing stone lit from the top-left. */
function menhir(r: Raster, cx: number, top: number, bottom: number, hw: number, taper = 2) {
  for (let y = top; y <= bottom; y++) {
    const dy = y - top
    let half = hw + ((y - top) / (bottom - top)) * taper
    if (dy < hw) half = hw * Math.sqrt(Math.max(0, 1 - ((hw - dy - 0.5) / hw) ** 2))
    for (let x = Math.floor(cx - half); x < Math.ceil(cx + half); x++) {
      const u = (x + 0.5 - cx) / half
      let c: number = u < -0.5 ? ST[1] : u < 0.18 ? ST[2] : u < 0.66 ? NG[0] : NG[1]
      if (dy < hw * 0.8 && u < 0.2 && (dy < 3 || u < -0.55)) c = ST[0]
      if (u > 0.82 && c === NG[1]) c = NG[2]
      // weathering speckle and chips
      const h = ih(x, y, 17)
      if (h > 0.95 && u > -0.5) c = c === ST[2] ? NG[0] : c === NG[0] ? NG[1] : c
      else if (h < 0.03 && u < 0.3) c = ST[1]
      if (y >= bottom - 2) c = y === bottom ? NG[2] : c === ST[1] || c === ST[0] ? ST[2] : c === ST[2] ? NG[0] : NG[1]
      r.set(x, y, c)
    }
  }
}

function crescent(r: Raster, cx: number, cy: number, rad: number, c: number, cut = 0.55) {
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++)
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      const d2 = Math.hypot(x + 0.5 - (cx + rad * cut), y + 0.5 - (cy - rad * cut * 0.25))
      if (d <= rad && d2 > rad * 0.86) r.set(x, y, c)
    }
}

function moonstone(on: boolean, f: number) {
  const r = frame(on ? 'moonstone_on' : 'moonstone_off')
  shade(r, 33, 73, 22, 4.4)
  const b = new Raster(r.w, r.h)
  drift(b, 32, 72, 21, 4.4)
  menhir(b, 32, 10, 73, 15)
  snowCap(b, 5, 3, 0.9)
  const pulse = on ? [0, 1, 2, 1][f] : 0
  const fresh = on ? [IC[0], C.white, IC[0], IC[1]][f] : NG[3]
  if (on) {
    // light seeps into the stone around the glyphs and the crescent
    const glow = (gx: number, gy: number, rad: number) => {
      for (let y = Math.floor(gy - rad); y <= gy + rad; y++)
        for (let x = Math.floor(gx - rad); x <= gx + rad; x++) {
          const d = Math.hypot(x - gx, y - gy) / rad
          const c = b.get(x, y)
          if (d > 1 || !c || c === SN[0] || c === SN[1] || c === SN[2]) continue
          if (d < 0.55) b.set(x, y, IC[3])
          else if (bayer(x, y) < 0.55) b.set(x, y, c === ST[1] || c === ST[0] ? IC[1] : IC[2])
        }
    }
    glow(32, 26, 11)
    for (const y of [38, 51, 64]) glow(32.5, y + 5, 7.5)
    crescent(b, 31, 26, 7, fresh)
    for (const [y, kind] of [
      [38, 0],
      [51, 2],
      [64, 4]
    ] as const)
      glowGlyph(b, 29, y, kind, fresh, IC[3])
  } else {
    crescent(b, 31, 26, 7, NG[3])
    crescent(b, 32, 27, 7, ST[0], 0.55)
    for (const [y, kind] of [
      [38, 0],
      [51, 2],
      [64, 4]
    ] as const) {
      glyph(b, 30, y + 1, kind, ST[0])
      glyph(b, 29, y, kind, NG[3])
    }
  }
  outline(b)
  r.blit(b)
  if (on) {
    const rn = rng(11 + f * 5)
    for (let i = 0; i < 5; i++) {
      const x = 14 + Math.floor(rn() * 36)
      const y = 14 + Math.floor(rn() * 56) - f * 2
      r.set(x, y, i % 2 ? IC[0] : C.white)
      if (i % 3 === pulse) {
        r.set(x - 1, y, IC[1])
        r.set(x + 1, y, IC[1])
        r.set(x, y - 1, IC[1])
        r.set(x, y + 1, IC[1])
      }
    }
  }
  return r
}

function bigmoon(on: boolean, f: number) {
  const r = frame(on ? 'bigmoon_on' : 'bigmoon_off')
  shade(r, 65, 130, 56, 8)
  const b = new Raster(r.w, r.h)
  const fresh = on ? [IC[0], C.white, IC[0], IC[1]][f] : NG[3]
  // the moon disc: a round slab with a bevelled rim, rising out of a stepped plinth
  const cx = 64
  const cy = 58
  const rad = 37
  for (let y = cy - rad; y <= cy + rad; y++)
    for (let x = cx - rad; x <= cx + rad; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.hypot(dx, dy)
      if (d > rad) continue
      const lit = (-dx - dy) / (d || 1)
      let c: number
      if (d > rad - 6) c = lit > 0.35 ? ST[0] : lit > -0.35 ? ST[1] : ST[2]
      else if (d > rad - 7) c = lit > 0 ? ST[2] : NG[0]
      else c = dx + dy > 26 ? NG[0] : dx + dy > 22 && bayer(x, y) < 0.5 ? NG[0] : ST[2]
      if (d <= rad - 7 && ih(x, y, 23) > 0.96) c = c === ST[2] ? NG[0] : ST[1]
      if (d > rad - 1.5 && lit < 0) c = NG[1]
      b.set(x, y, c)
    }
  box(b, 22, 92, 84, 10, 12, [ST[0], ST[1], ST[2], NG[0]])
  box(b, 8, 104, 112, 10, 14, [ST[0], ST[1], ST[2], NG[0]])
  if (on) {
    for (const rr of [26, 22])
      for (let y = cy - rr; y <= cy + rr; y++)
        for (let x = cx - 3 - rr; x <= cx - 3 + rr; x++) {
          const d = Math.hypot(x - (cx - 3), y - cy) / rr
          const c = b.get(x, y)
          if (d > 1 || !c) continue
          if (rr === 22 && d < 0.8) b.set(x, y, IC[3])
          else if (rr === 26 && bayer(x, y) < 0.4 && d > 0.75) b.set(x, y, c === ST[2] || c === NG[0] ? IC[2] : c)
        }
  }
  // the crescent hollow: recessed with a lit lower lip
  crescent(b, cx - 3, cy + 1, 22, on ? IC[2] : NG[4], 0.5)
  crescent(b, cx - 3, cy, 21, on ? fresh : NG[3], 0.5)
  const gl = on ? fresh : NG[3]
  for (let i = 0; i < 6; i++) {
    const x = 20 + i * 15
    if (on) glowGlyph(b, x, 116, i * 2 + 1, gl, IC[3])
    else {
      glyph(b, x + 1, 117, i * 2 + 1, ST[0])
      glyph(b, x, 116, i * 2 + 1, gl)
    }
  }
  const rn = rng(77)
  let kx = 90
  let ky = 74
  for (let i = 0; i < 12; i++) {
    b.set(kx, ky, NG[3])
    kx += rn() < 0.4 ? 1 : 0
    ky += 1
  }
  outline(b)
  snowCap(b, 8, 3, 0.8)
  r.blit(b)
  const d = new Raster(r.w, r.h)
  drift(d, 14, 123, 15, 5)
  drift(d, 114, 124, 14, 4.6)
  drift(d, 64, 128, 24, 4.4)
  outline(d)
  r.blit(d)
  if (on) {
    const rn2 = rng(31 + f * 9)
    for (let i = 0; i < 9; i++) {
      const x = 22 + Math.floor(rn2() * 84)
      const y = 14 + Math.floor(rn2() * 100) - f * 3
      r.set(x, y, i % 2 ? IC[0] : C.white)
      if ((i + f) % 3 === 0) {
        r.set(x - 1, y, IC[1])
        r.set(x + 1, y, IC[1])
        r.set(x, y - 1, IC[1])
        r.set(x, y + 1, IC[1])
      }
    }
  }
  return r
}

// ------------------------------------------------------------------ ice

function iceblock() {
  const r = frame('iceblock')
  shade(r, 33, 89, 29, 5)
  const b = new Raster(64, 96)
  box(b, 7, 36, 50, 18, 36, [IC[0], IC[1], IC[2], IC[3]])
  // top face: bright with a reflection streak
  b.rect(11, 40, 42, 10, IC[0])
  b.rect(11, 40, 42, 1, C.white)
  for (let i = 0; i < 9; i++) b.set(18 + i * 4, 49 - ((i * 3) % 5), IC[1])
  b.line(12, 48, 22, 40, C.white)
  // front: a vertical gradient from clear to deep blue, a lit left edge and a frozen inclusion
  for (let y = 54; y < 90; y++)
    for (let x = 7; x < 57; x++) {
      const t = (y - 54) / 36
      let c: number = t < 0.25 ? IC[1] : t < 0.7 ? (x < 40 ? IC[1] : IC[2]) : IC[2]
      if (x < 11) c = IC[0]
      else if (x > 52) c = IC[3]
      else if (t > 0.85) c = x > 30 ? IC[3] : IC[2]
      if (y === 54) c = IC[0]
      b.set(x, y, c)
    }
  b.poly([18, 80, 24, 66, 30, 80], IC[2])
  b.poly([34, 82, 42, 64, 50, 82], IC[2])
  b.line(13, 58, 13, 84, C.white)
  b.line(14, 60, 14, 70, IC[0])
  for (let i = 0; i < 10; i++) b.set(18 + i * 2, 86 - i * 2, i % 3 === 0 ? C.white : IC[0])
  for (const [x, y] of [
    [44, 66],
    [48, 76],
    [26, 84]
  ] as const) {
    b.set(x, y, IC[0])
    b.set(x + 1, y + 1, IC[3])
  }
  // frosted corner and a hairline crack
  b.rect(8, 53, 6, 1, SN[0])
  b.rect(8, 54, 3, 1, SN[1])
  b.line(47, 62, 44, 72, IC[3])
  b.line(44, 72, 46, 80, IC[3])
  outline(b)
  r.blit(b)
  return r
}

interface Spire {
  x: number
  w: number
  h: number
  lean: number
  by: number
}
const SPIRES: Spire[] = [
  { x: 22, w: 26, h: 62, lean: -3, by: 140 },
  { x: 106, w: 26, h: 78, lean: 4, by: 142 },
  { x: 42, w: 32, h: 96, lean: -4, by: 144 },
  { x: 86, w: 32, h: 112, lean: 3, by: 144 },
  { x: 62, w: 40, h: 128, lean: -2, by: 146 },
  { x: 30, w: 26, h: 76, lean: 5, by: 150 },
  { x: 98, w: 28, h: 90, lean: -5, by: 150 },
  { x: 54, w: 32, h: 94, lean: 4, by: 152 },
  { x: 74, w: 30, h: 84, lean: -3, by: 152 }
]

function spire(r: Raster, s: Spire, hScale = 1, dx = 0, dy = 0) {
  const h = s.h * hScale
  if (h < 4) return
  const sw = s.w * 1.45
  const bl = s.x - sw / 2 + dx
  const br = s.x + sw / 2 + dx
  const ax = s.x + s.lean + dx
  const ay = s.by - h + dy
  const by = s.by + dy
  const m = s.x + sw * 0.08 + dx
  r.poly([bl, by, ax, ay, m, by], IC[1])
  r.poly([m, by, ax, ay, br, by], IC[2])
  // light climbs toward the tip on the left facet, darkness pools at the foot on the right
  r.poly([bl + sw * 0.14, by - h * 0.35, ax, ay, ax + 1, by - h * 0.45], IC[0])
  r.poly([m, by, ax + 1, ay + h * 0.35, br - sw * 0.1, by], IC[3])
  r.line(ax, ay, bl + 1, by, IC[0])
  r.line(ax, ay + 1, ax - 1, ay + h * 0.4, C.white)
  r.set(ax, ay, C.white)
  r.set(ax, ay + 1, C.white)
  // inner glints
  if (h > 40) {
    r.line(s.x - sw * 0.12 + dx, by - h * 0.3, s.x - sw * 0.12 + dx + 1, by - h * 0.55, C.white)
    r.set(m + 3, by - h * 0.22, IC[0])
  }
}

function icewall(f = -1) {
  const r = frame('icewall')
  const p = f < 0 ? 0 : f / 6
  if (p < 0.9) shade(r, 64, 150, 58 * (1 - p * 0.3), 8)
  const b = new Raster(128, 160)
  const order = [...SPIRES].sort((a, c) => a.by - c.by || a.h - c.h)
  const rn = rng(12)
  order.forEach((s, i) => {
    if (f <= 0) {
      spire(b, s, 1, f === 0 ? ((i % 2) * 2 - 1) * 0 : 0, 0)
      return
    }
    // collapse: the spire sinks while its tip splits into shards that fly out
    const t = f / 6
    const k = Math.max(0.05, 1 - t * 1.15)
    spire(b, s, k, 0, 0)
  })
  if (f === 0) {
    // a bright crack web splitting the whole wall
    for (const [x0, y0, x1, y1] of [
      [64, 40, 58, 80],
      [58, 80, 68, 110],
      [68, 110, 60, 140],
      [34, 70, 40, 100],
      [92, 56, 86, 92],
      [86, 92, 96, 120]
    ] as const) {
      b.line(x0, y0, x1, y1, IC[3])
      b.line(x0 + 1, y0, x1 + 1, y1, C.white)
    }
  }
  if (f >= 1) {
    // flying shards
    const n = 11
    for (let i = 0; i < n; i++) {
      const a = ih(i, 3, 5) * Math.PI
      const spd = 20 + ih(i, 4, 5) * 38
      const t = f / 6
      const x0 = 14 + ih(i, 5, 5) * 100
      const y0 = 50 + ih(i, 6, 5) * 70
      const px = x0 + Math.cos(a) * spd * t * (ih(i, 7, 5) < 0.5 ? -1 : 1)
      const py = y0 - Math.sin(a) * spd * t * 0.5 + t * t * 60
      const sz = Math.max(2, Math.round(7 - t * 4 + ih(i, 8, 5) * 3))
      if (py > 150) continue
      const sx = Math.round(px)
      const sy = Math.round(py)
      b.poly([sx, sy, sx + sz, sy + 1, sx + sz - 1, sy + sz, sx - 1, sy + sz - 2], IC[1])
      b.poly([sx + sz * 0.4, sy + 1, sx + sz, sy + 1, sx + sz - 1, sy + sz], IC[2])
      b.set(sx + 1, sy + 1, C.white)
    }
  }
  outline(b)
  r.blit(b)
  // frozen footing and snow, growing as the wall comes down
  const d = new Raster(128, 160)
  const spread = f < 0 ? 0 : f / 6
  for (let i = 0; i < 6; i++) drift(d, 14 + i * 20, 150 + (i % 2) * 2, 15, 4.4 + spread * 3)
  if (f >= 3) {
    // rubble heap
    for (let i = 0; i < 10; i++) {
      const sx = 16 + ih(i, 1, 9) * 96
      const sy = 142 + ih(i, 2, 9) * 8
      d.poly([sx, sy, sx + 6, sy + 1, sx + 5, sy + 6, sx - 1, sy + 4], i % 2 ? IC[1] : IC[2])
      d.set(sx + 1, sy + 1, IC[0])
    }
  }
  outline(d)
  r.blit(d)
  if (f >= 2) {
    // snow dust cloud
    const rn2 = rng(5 + f)
    const n = f >= 6 ? 6 : 24 - f * 2
    for (let i = 0; i < n; i++) {
      const x = 12 + rn2() * 104
      const y = 150 - rn2() * (30 + f * 6)
      r.set(x, y, rn2() < 0.5 ? SN[0] : SN[1])
      if (rn2() < 0.4) r.set(x + 1, y, SN[2])
    }
  }
  void rn
  return r
}

// ------------------------------------------------------------------ the battering log

/** A cylinder log from x0 to x1 centred on yc with the cut face on the left and an iron head on the right. */
function logBody(b: Raster, x0: number, x1: number, yc: number, rad: number, withHead = true) {
  const rn = rng(9)
  for (let x = x0; x <= x1; x++) {
    const wob = Math.round(Math.sin(x * 0.19) * 0.6)
    for (let dy = -rad + wob; dy <= rad + wob; dy++) {
      const v = (dy - wob) / rad
      let c: number = v < -0.62 ? WD[0] : v < 0.04 ? WD[1] : v < 0.58 ? WD[2] : WD[3]
      // bark grooves and flecks
      const g = ih(Math.floor(x / 2), Math.floor(dy / 6), 41)
      if (g < 0.2 && v > -0.4) c = c === WD[1] ? WD[2] : WD[3]
      else if (g > 0.93 && v < 0) c = WD[0]
      if (dy === rad + wob) c = WD[3]
      b.set(x, yc + dy, c)
    }
  }
  // knots
  for (const kx of [x0 + 28, x0 + 62]) {
    b.ellipse(kx, yc + 2, 3.2, 2.2, WD[3])
    b.ellipse(kx - 0.5, yc + 1.4, 2, 1.3, WD[2])
    b.set(kx - 1, yc + 1, WD[1])
  }
  // cut face on the left
  b.ellipse(x0, yc, rad * 0.5, rad + 0.5, WD[3])
  b.ellipse(x0 - 1, yc, rad * 0.42, rad - 0.5, WD[0])
  b.ellipse(x0 - 1, yc, rad * 0.3, rad * 0.62, WD[1])
  b.ellipse(x0 - 1, yc, rad * 0.14, rad * 0.28, WD[0])
  b.rect(x0 - 1, yc - 1, 1, 2, WD[2])
  void rn
  if (withHead) {
    // iron ram head wrapped around the right end
    const hx = x1 - 12
    for (let x = hx; x <= x1 + 3; x++)
      for (let dy = -rad - 2; dy <= rad + 2; dy++) {
        const v = dy / (rad + 2)
        const round = x > x1 - 2 ? Math.sqrt(Math.max(0, 1 - ((x - (x1 - 2)) / 5) ** 2)) : 1
        if (Math.abs(v) > round) continue
        const c = v < -0.55 ? ST[0] : v < 0.1 ? ST[1] : v < 0.6 ? ST[2] : IRON[2]
        b.set(x, yc + dy, x === hx || x === hx + 5 ? IRON[2] : c)
      }
    b.ellipse(x1 + 2.5, yc, 3, rad * 0.62, ST[1])
    b.ellipse(x1 + 2, yc - 1, 1.6, rad * 0.32, ST[0])
    for (const rx of [hx + 2, hx + 7]) b.set(rx, yc - rad + 3, IRON[3])
  }
}

function rope(b: Raster, x: number, yc: number, rad: number) {
  for (let dy = -rad - 1; dy <= rad + 1; dy++) {
    const v = dy / rad
    const c = v < -0.5 ? ROPE[0] : v < 0.2 ? ROPE[1] : v < 0.7 ? ROPE[2] : ROPE[3]
    for (let k = 0; k < 4; k++) b.set(x + k + (dy & 1 ? 0 : 0), yc + dy, (dy + k) % 3 === 0 ? ROPE[3] : c)
    b.set(x + 4, yc + dy, ROPE[3])
  }
}

function logSprite() {
  const r = frame('log')
  shade(r, 64, 74, 54, 5.6)
  const b = new Raster(128, 96)
  const yc = 56
  const rad = 15
  logBody(b, 14, 112, yc, rad)
  // rope harness: bands around the trunk and two carrying loops
  for (const x of [38, 62, 86]) rope(b, x, yc, rad)
  for (const x of [38, 62, 86]) {
    b.line(x + 1, yc + rad + 1, x - 2, yc + rad + 6, ROPE[2])
    b.line(x + 4, yc + rad + 1, x + 7, yc + rad + 6, ROPE[3])
    b.line(x - 2, yc + rad + 6, x + 7, yc + rad + 6, ROPE[2])
    b.line(x - 1, yc + rad + 7, x + 6, yc + rad + 7, ROPE[3])
  }
  outline(b)
  snowCap(b, 21, 3, 0.55)
  r.blit(b)
  return r
}

function ramslot(on: boolean, f: number) {
  const r = frame(on ? 'ramslot_on' : 'ramslot_off')
  shade(r, 64, 76, 56, 6)
  const b = new Raster(128, 96)
  // stone sill the cradle stands on
  box(b, 8, 62, 112, 8, 12, [ST[0], ST[1], ST[2], NG[0]])
  b.rect(10, 80, 108, 1, NG[1])
  const post = (x: number, lean: number) => {
    for (let y = 30; y <= 64; y++) {
      const t = (64 - y) / 34
      const px = Math.round(x + lean * t)
      for (let k = 0; k < 7; k++) b.set(px + k, y, k === 0 ? WD[0] : k < 3 ? WD[1] : k < 6 ? WD[2] : WD[3])
    }
  }
  for (const x of [20, 94]) {
    post(x, -8)
    post(x + 8, 8)
    b.rect(x - 6, 52, 30, 4, WD[2])
    b.rect(x - 6, 52, 30, 1, WD[0])
    b.rect(x - 6, 55, 30, 1, WD[3])
  }
  if (on) {
    const sway = [0, 0, 1, 0][f]
    logBody(b, 12, 112, 38 + sway, 11)
    for (const x of [28, 60, 92]) rope(b, x, 38 + sway, 11)
    // the log's iron head gleams as it is lit
    const g = [ST[0], C.white, ST[0], ST[1]][f]
    b.rect(104, 30 + sway, 2, 2, g)
  } else {
    // empty cradle: a slack rope sling between the forks
    for (let x = 22; x <= 100; x++) {
      const y = 36 + Math.round(Math.sin(((x - 22) / 78) * Math.PI) * 8)
      b.set(x, y, ROPE[1])
      b.set(x, y + 1, ROPE[3])
    }
  }
  outline(b)
  snowCap(b, 4, 2, 0.5)
  r.blit(b)
  if (on) {
    const rn = rng(7 + f)
    for (let i = 0; i < 4; i++) r.set(20 + rn() * 90, 24 + rn() * 12 - f, i % 2 ? IC[0] : C.white)
  }
  return r
}

// ------------------------------------------------------------------ snow piles

function snowpile() {
  const r = frame('snowpile')
  shade(r, 33, 45, 25, 4)
  const b = new Raster(64, 64)
  drift(b, 32, 36, 24, 11)
  drift(b, 40, 32, 13, 7)
  // wind ripples and a few sparkles
  for (const [x, y, l] of [
    [18, 38, 8],
    [34, 44, 10],
    [40, 30, 6]
  ] as const)
    for (let i = 0; i < l; i++) b.set(x + i, y + Math.round(Math.sin(i * 0.5) * 0.8), SN[2])
  outline(b)
  r.blit(b)
  for (const [x, y] of [
    [24, 28],
    [44, 26]
  ] as const) {
    r.set(x, y, C.white)
    r.set(x - 1, y, IC[1])
    r.set(x + 1, y, IC[1])
    r.set(x, y - 1, IC[1])
  }
  // something glints under the snow
  r.set(33, 38, IC[1])
  return r
}

function snowDig(f: number) {
  const r = frame('snowpile_dig')
  const t = f / 4
  shade(r, 33, 45, 25 - f, 4)
  const b = new Raster(64, 64)
  const h = [11, 8, 6, 5, 4][f]
  drift(b, 32, 38 - (f > 0 ? 0 : 2), 24 - f * 1.5, h)
  if (f >= 1 && f <= 3) {
    // the dug hollow
    b.ellipse(32, 36, 8 - f, 3.4, SN[3])
    b.ellipse(32, 36.6, 6 - f, 2.4, IC[3])
  }
  outline(b)
  r.blit(b)
  // flying snow
  const rn = rng(3 + f)
  const n = [0, 18, 24, 14, 6][f]
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * (0.1 + rn() * 0.8)
    const spd = (8 + rn() * 26) * (f === 1 ? 0.5 : f === 2 ? 1 : 1.2)
    const x = 32 + Math.cos(a) * spd * (0.4 + t) + (rn() - 0.5) * 8
    const y = 36 + Math.sin(a) * spd * (0.4 + t) * 0.9 + (f >= 3 ? (f - 2) * 7 : 0)
    const c = rn() < 0.5 ? SN[0] : rn() < 0.5 ? SN[1] : SN[2]
    r.set(x, y, c)
    if (rn() < 0.45) r.set(x + 1, y, c)
    if (rn() < 0.2) r.set(x, y + 1, C.white)
  }
  return r
}

// ------------------------------------------------------------------ brazier

function brazier(f: number) {
  const r = frame('brazier')
  shade(r, 33, 82, 17, 3.6)
  const b = new Raster(64, 96)
  // three legs
  for (const [x0, x1] of [
    [20, 14],
    [44, 50],
    [32, 32]
  ] as const) {
    for (let y = 60; y <= 83; y++) {
      const x = Math.round(x0 + ((x1 - x0) * (y - 60)) / 23)
      b.rect(x - 1, y, 3, 1, IRON[1])
      b.set(x - 1, y, IRON[0])
      b.set(x + 1, y, IRON[2])
    }
    b.rect(x1 - 2, 83, 5, 1, IRON[3])
  }
  b.rect(16, 71, 33, 2, IRON[2])
  b.rect(16, 71, 33, 1, IRON[1])
  // the basket: a tapering cup of iron straps
  b.poly([12, 52, 53, 52, 44, 68, 21, 68], IRON[2])
  b.poly([14, 52, 48, 52, 40, 66, 22, 66], IRON[1])
  for (let i = 0; i < 6; i++) {
    const x = 16 + i * 6.6
    b.line(x, 53, 22 + i * 4, 67, IRON[3])
    b.line(x + 1, 53, 23 + i * 4, 67, IRON[0])
  }
  b.rect(21, 64, 24, 1, IRON[3])
  b.ellipse(32.5, 52, 21, 5.2, IRON[3])
  b.ellipse(32.5, 51.5, 20, 4.8, IRON[0])
  b.ellipse(32.5, 52.4, 18, 4, IRON[3])
  // glowing coals
  b.ellipse(32.5, 52.4, 16, 3.2, FIRE[3])
  b.ellipse(32, 52.2, 13, 2.4, FIRE[2])
  for (const x of [24, 29, 35, 40]) b.set(x, 52 + (x % 2), FIRE[1])
  outline(b)
  r.blit(b)
  // warm light spilling on the rim and the legs
  for (const x of [18, 22, 42, 47]) r.paint(x, 55, FIRE[2])
  r.paint(20, 56, FIRE[3])
  r.paint(45, 56, FIRE[3])
  // flames: a big tongue with two side licks
  const sh = [
    { h: 30, w: 10, lean: 0, sl: 14 },
    { h: 34, w: 9, lean: 1, sl: 17 },
    { h: 28, w: 10.4, lean: -1, sl: 12 },
    { h: 32, w: 9.4, lean: 0, sl: 16 }
  ][f]
  flame(r, 26, 53, sh.sl, 5, -1)
  flame(r, 39, 53, sh.sl - 3, 5, 1)
  flame(r, 32, 53, sh.h, sh.w, sh.lean)
  const rn = rng(5 + f * 3)
  for (let i = 0; i < 5; i++) r.set(32 + (rn() - 0.5) * 22, 53 - 28 - rn() * 14 - f * 2, i % 2 ? FIRE[0] : FIRE[1])
  return r
}

export const forestStageProps = (): Sheet => ({
  moonstone_off: mk('moonstone_off', [moonstone(false, 0)]),
  moonstone_on: mk(
    'moonstone_on',
    [0, 1, 2, 3].map((f) => moonstone(true, f))
  ),
  bigmoon_off: mk('bigmoon_off', [bigmoon(false, 0)]),
  bigmoon_on: mk(
    'bigmoon_on',
    [0, 1, 2, 3].map((f) => bigmoon(true, f))
  ),
  iceblock: mk('iceblock', [iceblock()]),
  icewall: mk('icewall', [icewall()]),
  icewall_break: mk(
    'icewall_break',
    [0, 1, 2, 3, 4, 5, 6].map((f) => icewall(f))
  ),
  log: mk('log', [logSprite()]),
  ramslot_off: mk('ramslot_off', [ramslot(false, 0)]),
  ramslot_on: mk(
    'ramslot_on',
    [0, 1, 2, 3].map((f) => ramslot(true, f))
  ),
  snowpile: mk('snowpile', [snowpile()]),
  snowpile_dig: mk('snowpile_dig', [0, 1, 2, 3, 4].map(snowDig)),
  brazier: mk('brazier', [0, 1, 2, 3].map(brazier))
})
