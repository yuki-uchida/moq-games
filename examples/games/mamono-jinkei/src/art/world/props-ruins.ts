/** Meadow props, part 2: switches, crystals, levers, gates, the boss door, sign and chest. */
import { C, R } from '../palette'
import { Raster, outline, rng } from '../raster'
import type { Sheet } from '../sheet'
import { crack } from './gfx'
import { box, frame, mk, shadow } from './pp'

const GD = R.grassDark
const S = R.stone
const WOOD = R.wood
const GOLD = R.gold
const IRON = R.clothBlack
const HOLY = R.holy
const MAGIC = R.magic

const SHAD: [number, number] = [GD[2], GD[1]]

// ------------------------------------------------------------------ pressure plates

/** Slime-face emblem: a squat dome with two eyes and a smile, centred at (cx, cy), width 2*rx. */
function slimeEmblem(r: Raster, cx: number, cy: number, rx: number, on: boolean) {
  const ry = rx * 0.82
  const pts: number[] = []
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2
    const bump = i === 15 || i === 16 ? 1.15 : 1
    pts.push(cx + Math.cos(a) * rx * bump, cy + Math.sin(a) * ry * (Math.sin(a) < 0 ? 1.05 : 0.85) * bump)
  }
  if (on) {
    r.poly(
      pts.map((v, i) => v + (i % 2 ? 1 : 0)),
      HOLY[3]
    )
    r.poly(pts, HOLY[1])
    r.ellipse(cx - rx * 0.3, cy - ry * 0.35, rx * 0.35, ry * 0.25, HOLY[0])
  } else {
    r.poly(
      pts.map((v, i) => v + (i % 2 ? 1 : 0)),
      S[0]
    )
    r.poly(pts, S[3])
    r.poly(
      pts.map((v, i) => (i % 2 ? v + 1 : v + 1)),
      S[2]
    )
    r.poly(
      pts.map((v, i) => (i % 2 ? v + 0.3 : v + 0.3)),
      S[2]
    )
  }
  const e = on ? HOLY[3] : S[0]
  const ew = Math.max(1, Math.round(rx / 6))
  r.rect(Math.round(cx - rx * 0.42), Math.round(cy - ry * 0.12), ew, ew + 1, e)
  r.rect(Math.round(cx + rx * 0.42 - ew), Math.round(cy - ry * 0.12), ew, ew + 1, e)
  r.line(cx - rx * 0.22, cy + ry * 0.32, cx + rx * 0.22, cy + ry * 0.32, e)
}

function plate(name: string, k: number, pips: number, on: boolean) {
  const r = frame(name)
  const w = Math.round(48 * k)
  const d = Math.round(32 * k)
  const x = Math.round((r.w - w) / 2)
  const fh = on ? 2 : Math.round(7 * k)
  const y = Math.round(r.h / 2 - d / 2 - 2 + (on ? 3 * k : 0) - (on ? 0 : 0))
  // recess in the floor around the plate
  r.rect(x - 3, y - 2, w + 6, d + fh + 6, S[3])
  r.rect(x - 2, y - 1, w + 4, d + fh + 4, S[2])
  box(r, x, y, w, d, fh, on ? [S[0], S[1], S[2], S[3]] : [S[0], S[1], S[2], S[3]])
  // top bevel
  r.rect(x + 2, y + 2, w - 4, 1, S[1])
  r.rect(x + 2, y + 2, 1, d - 4, S[1])
  r.rect(x + 3, y + d - 3, w - 5, 1, S[1])
  r.rect(x + w - 3, y + 3, 1, d - 5, S[1])
  const cy = y + d / 2
  if (pips) {
    slimeEmblem(r, r.w / 2, cy - 3 * k, 9 * k, on)
    for (let i = 0; i < pips; i++) {
      const px = r.w / 2 + (i - (pips - 1) / 2) * 12 * k
      r.ellipse(px, cy + 10 * k, 3.4 * k, 2.6 * k, on ? HOLY[1] : S[3])
      if (on) r.set(px - 1, cy + 10 * k - 1, HOLY[0])
      else r.ellipse(px + 0.6, cy + 10.6 * k, 3 * k, 2.2 * k, S[2])
    }
  } else slimeEmblem(r, r.w / 2, cy, 13 * k, on)
  if (on) {
    // glowing seam around the pressed plate
    for (let i = x; i < x + w; i++) {
      if (i % 3) r.set(i, y + d + fh, HOLY[1])
    }
    r.rect(x, y + 1, 1, d, HOLY[2])
  }
  outline(r)
  return r
}

// ------------------------------------------------------------------ crystal

function crystal(name: string, kind: 'off' | 'on' | 'hit', f: number) {
  const r = frame(name)
  const ramp = kind === 'off' ? R.nightGround : MAGIC
  shadow(r, 34, 82, 22, 4, GD[2], GD[1])
  // pedestal
  box(r, 15, 62, 34, 11, 12, [S[0], S[1], S[2], S[3]])
  r.ellipse(32, 67, 12, 3.2, S[2])
  r.ellipse(32, 66.5, 12, 3, S[3])
  const body = new Raster(64, 96)
  const poly = (pts: number[], c: number) => body.poly(pts, c)
  const bob = kind === 'on' ? Math.round(Math.sin((f / 4) * Math.PI * 2) * 1.2) : 0
  const cy = (y: number) => y + bob
  poly([32, cy(10), 45, cy(25), 45, cy(55), 32, cy(66), 19, cy(55), 19, cy(25)], ramp[2])
  poly([32, cy(10), 19, cy(25), 19, cy(55), 32, cy(66), 32, cy(30)], ramp[1])
  poly([32, cy(10), 19, cy(25), 32, cy(30)], ramp[0])
  poly([32, cy(10), 45, cy(25), 32, cy(30)], ramp[1])
  poly([32, cy(30), 45, cy(25), 45, cy(55), 32, cy(66)], ramp[2])
  poly([40, cy(40), 45, cy(36), 45, cy(55), 40, cy(60)], ramp[3])
  body.line(32, cy(30), 32, cy(66), ramp[3])
  body.line(32, cy(30), 19, cy(25), ramp[0])
  // glints
  body.rect(22, cy(30), 2, 12, ramp[0])
  body.rect(22, cy(44), 2, 2, ramp[1])
  if (kind !== 'off') {
    // shimmer band sweeping up the left facet
    const sy = cy(60 - ((f + (kind === 'hit' ? 0 : 0)) % 4) * 11)
    for (let i = 0; i < 6; i++) {
      body.paint(21 + i * 2, sy - i * 2, C.white)
      body.paint(22 + i * 2, sy - i * 2, MAGIC[0])
    }
  } else if (f) body.paint(23, cy(33), R.nightGround[0])
  if (kind === 'hit') {
    if (f === 0) body.map(() => C.white)
    else if (f === 1) body.map((c) => (c === ramp[3] || c === ramp[2] ? ramp[0] : C.white))
  }
  outline(body)
  r.blit(body)
  if (kind === 'on' || kind === 'hit') {
    const rn = rng(30 + f)
    // glow motes drifting up
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28 + f * 1.1
      const rx = 26 + Math.sin(a * 2) * 3
      const x = 32 + Math.cos(a) * rx * 0.75
      const y = 40 - ((f * 5 + i * 11) % 36) + 14
      r.set(x, y, i % 2 ? C.spark : MAGIC[1])
      if (i % 2 === 0) r.set(x + 1, y, MAGIC[0])
    }
    void rn
  }
  if (kind === 'hit') {
    const rad = [14, 22, 28, 31][f]
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2
      const x = 32 + Math.cos(t) * rad
      const y = 38 + Math.sin(t) * rad * 0.8
      if (f < 3 || a % 2) r.set(x, y, f < 2 ? C.white : MAGIC[0])
    }
    if (f === 1) {
      for (let i = -14; i <= 14; i++) {
        r.paint(32 + i, 38, C.white)
        r.set(32, 38 + i, C.white)
      }
      r.line(20, 26, 44, 50, C.white)
      r.line(44, 26, 20, 50, C.white)
    }
  }
  return r
}

// ------------------------------------------------------------------ lever

function lever(angle: number) {
  const r = frame('lever_off')
  shadow(r, 34, 50, 20, 3.5, GD[2], GD[1])
  box(r, 13, 38, 38, 10, 9, [S[0], S[1], S[2], S[3]])
  r.rect(17, 41, 30, 4, S[3])
  r.rect(17, 41, 30, 1, S[2])
  r.rect(17, 45, 30, 1, S[0])
  const px = 32
  const py = 42
  const len = 25
  const tx = px + Math.sin(angle) * len
  const ty = py - Math.cos(angle) * len
  const arm = new Raster(64, 64)
  arm.thick(px, py, tx, ty, 4.4, WOOD[1])
  arm.thick(px - 0.8, py - 0.8, tx - 0.8, ty - 0.8, 2, WOOD[0])
  arm.thick(px + 1.3, py + 0.6, tx + 1.3, ty + 0.6, 1.4, WOOD[2])
  // knob
  arm.ellipse(tx, ty, 5.4, 5.4, R.jobRed[2])
  arm.ellipse(tx - 0.5, ty - 0.5, 4.6, 4.6, R.jobRed[1])
  arm.ellipse(tx - 1.6, ty - 1.8, 2, 1.6, R.jobRed[0])
  outline(arm)
  r.blit(arm)
  r.ellipse(px, py, 3.4, 3, R.steel[2])
  r.ellipse(px - 0.5, py - 0.6, 2.4, 2, R.steel[0])
  outline(r)
  return r
}

// ------------------------------------------------------------------ gate

function gate(offset: number, slot = true) {
  const r = frame('gate_closed')
  const floor = 86
  shadow(r, 32, 90, 30, 4, GD[2], GD[1])
  // floor slot the bars sink into
  r.rect(13, floor - 1, 38, 7, S[3])
  r.rect(13, floor - 1, 38, 1, C.inkCool)
  void slot
  const bars = new Raster(64, 96)
  for (let i = 0; i < 6; i++) {
    const x = 16 + i * 6
    for (let y = 30 + offset; y < floor + offset + 4; y++) {
      if (y >= floor) continue
      bars.set(x, y, IRON[0])
      bars.set(x + 1, y, IRON[1])
      bars.set(x + 2, y, IRON[2])
    }
    if (30 + offset < floor) {
      bars.poly([x - 0.5, 31 + offset, x + 1.5, 26 + offset, x + 3.5, 31 + offset], IRON[1])
      bars.set(x + 1, 27 + offset, IRON[0])
    }
  }
  for (const by of [48, 68]) {
    const y = by + offset
    if (y < floor - 2) {
      bars.rect(14, y, 36, 3, IRON[1])
      bars.rect(14, y, 36, 1, IRON[0])
      bars.rect(14, y + 2, 36, 1, IRON[2])
    }
  }
  // clip anything below the floor line
  for (let y = floor; y < 96; y++) for (let x = 0; x < 64; x++) bars.set(x, y, 0)
  outline(bars)
  r.blit(bars)
  // stone posts and lintel
  box(r, 1, 18, 13, 7, 68, [S[0], S[1], S[2], S[3]])
  box(r, 50, 18, 13, 7, 68, [S[0], S[1], S[2], S[3]])
  box(r, 1, 12, 62, 8, 10, [S[0], S[1], S[2], S[3]])
  r.rect(14, 22, 36, 2, S[3])
  crack(r, 8, 40, 1, 1, 10, rng(2), S[3])
  r.set(56, 50, GD[1])
  r.rect(52, 74, 8, 2, GD[1])
  r.rect(2, 82, 6, 2, GD[1])
  return outline(r)
}

// ------------------------------------------------------------------ boss door

function bossDoor(open: number) {
  const r = frame('bossdoor_closed')
  const W = 192
  shadow(r, 96, 182, 92, 7, GD[2], GD[1])
  // steps
  box(r, 22, 176, 148, 5, 8, [S[0], S[1], S[2], S[3]])
  // interior
  r.rect(30, 44, 132, 132, C.black)
  for (let y = 44; y < 176; y++)
    for (let x = 30; x < 162; x++) if (y > 150 && ((x + y) & 1) === 0 && open > 0.3) r.set(x, y, C.inkCool)
  if (open > 0.3) {
    // faint floor and a distant glow
    for (let y = 150; y < 176; y++) r.rect(30, y, 132, 1, y % 4 < 2 ? C.inkCool : C.black)
    const a = Math.round(open * 10)
    for (let i = 0; i < a; i++) r.ellipse(96, 140, 10 + i * 5, 6 + i * 3, i % 2 ? C.inkCool : C.black)
  }
  // door leaves (hinged at the outer posts)
  const leaf = (hinge: number, dir: 1 | -1) => {
    const w = Math.max(9, Math.round(66 * (1 - open)))
    const x0 = dir === 1 ? hinge : hinge - w
    const lr = new Raster(192, 192)
    for (let y = 44; y < 176; y++)
      for (let x = x0; x < x0 + w; x++) {
        const u = (x - x0) / w
        let c = WOOD[2]
        const grain = (x * 3 + (y >> 2)) % 11 === 0
        if (u < 0.12) c = WOOD[1]
        else if (u > 0.88) c = WOOD[3]
        if (grain && u > 0.12 && u < 0.88) c = WOOD[3]
        if ((y - 44) % 33 < 2 && u > 0.06) c = WOOD[3]
        lr.set(x, y, c)
      }
    // iron bands with rivets
    for (const by of [64, 104, 144]) {
      lr.rect(x0, by, w, 7, IRON[1])
      lr.rect(x0, by, w, 1, IRON[0])
      lr.rect(x0, by + 6, w, 1, IRON[3])
      for (let rx = x0 + 4; rx < x0 + w - 2; rx += 12) {
        lr.set(rx, by + 3, IRON[0])
        lr.set(rx + 1, by + 3, IRON[2])
      }
    }
    // carved panels (only while wide enough)
    if (w > 40) {
      for (const [py, ph] of [
        [74, 26],
        [114, 26]
      ]) {
        lr.rect(x0 + 10, py, w - 20, ph, WOOD[3])
        lr.rect(x0 + 11, py + 1, w - 22, ph - 2, WOOD[2])
        lr.rect(x0 + 11, py + 1, w - 22, 1, WOOD[1])
      }
      // ring handle
      const hx = dir === 1 ? x0 + w - 10 : x0 + 10
      lr.ring(hx, 112, 4, 6, GOLD[2])
      lr.ring(hx - 0.5, 111.5, 4, 5.2, GOLD[0], Math.PI, Math.PI * 1.7)
    }
    outline(lr)
    r.blit(lr)
  }
  leaf(30, 1)
  leaf(162, -1)
  // frame: pillars and arch
  const frameR = new Raster(192, 192)
  box(frameR, 0, 30, 30, 8, 146, [S[0], S[1], S[2], S[3]])
  box(frameR, 162, 30, 30, 8, 146, [S[0], S[1], S[2], S[3]])
  box(frameR, 0, 6, 192, 12, 26, [S[0], S[1], S[2], S[3]])
  frameR.rect(30, 32, 132, 3, S[3])
  frameR.rect(30, 35, 132, 8, S[2])
  for (let x = 30; x < 162; x += 11) frameR.rect(x, 35, 1, 8, S[3])
  // carved blocks on the pillars
  for (const px of [4, 166])
    for (let y = 58; y < 170; y += 28) {
      frameR.rect(px, y, 22, 1, S[2])
      frameR.rect(px + 11, y + 1, 1, 27, S[2])
    }
  // shield crest over the door
  const cx = 96
  const cy = 12
  frameR.poly([cx - 15, cy - 4, cx + 15, cy - 4, cx + 15, cy + 12, cx, cy + 26, cx - 15, cy + 12], GOLD[2])
  frameR.poly([cx - 13, cy - 2, cx + 13, cy - 2, cx + 13, cy + 11, cx, cy + 23, cx - 13, cy + 11], R.jobBlue[1])
  frameR.poly([cx - 13, cy - 2, cx, cy - 2, cx, cy + 23, cx - 13, cy + 11], R.jobBlue[0])
  frameR.rect(cx - 2, cy, 4, 22, GOLD[1])
  frameR.rect(cx - 10, cy + 5, 20, 4, GOLD[1])
  frameR.rect(cx - 2, cy, 1, 22, GOLD[0])
  frameR.rect(cx - 10, cy + 5, 20, 1, GOLD[0])
  frameR.set(cx - 12, cy - 3, GOLD[0])
  const rn = rng(44)
  crack(frameR, 20, 90, 1, 1, 14, rn, S[3])
  crack(frameR, 174, 120, -1, 1, 12, rn, S[3])
  crack(frameR, 60, 36, 1, 1, 8, rn, S[3])
  for (let i = 0; i < 6; i++) frameR.ellipse(4 + rn() * 22, 100 + rn() * 70, 3 + rn() * 3, 2, GD[1])
  for (let i = 0; i < 5; i++) frameR.ellipse(168 + rn() * 20, 60 + rn() * 80, 3 + rn() * 3, 2, GD[1])
  frameR.ellipse(40, 12, 14, 4, GD[1])
  frameR.ellipse(150, 12, 12, 3, GD[1])
  outline(frameR)
  r.blit(frameR)
  void W
  return r
}

// ------------------------------------------------------------------ sign

function sign() {
  const r = frame('sign')
  shadow(r, 34, 52, 14, 3, GD[2], GD[1])
  const p = new Raster(64, 64)
  // post
  for (let y = 24; y < 52; y++) {
    p.set(29, y, WOOD[0])
    p.rect(30, y, 4, 1, WOOD[1])
    p.set(34, y, WOOD[2])
    p.set(35, y, WOOD[3])
  }
  // board
  for (let y = 8; y < 30; y++)
    for (let x = 8; x < 56; x++) {
      let c = WOOD[1]
      if (y === 8 || x === 8) c = WOOD[0]
      else if (y >= 28 || x >= 54) c = WOOD[3]
      else if (y >= 26) c = WOOD[2]
      else if ((y === 18 || y === 19) && x > 9 && x < 54) c = WOOD[2]
      p.set(x, y, c)
    }
  for (const [x, y] of [
    [11, 11],
    [51, 11],
    [11, 25],
    [51, 25]
  ]) {
    p.set(x, y, WOOD[3])
    p.set(x - 1, y - 1, WOOD[0])
  }
  // scribbled message
  const T = WOOD[3]
  for (let i = 0; i < 6; i++) {
    p.rect(14 + i * 6, 12, 4, 2, T)
    p.rect(14 + i * 6 + ((i * 3) % 3), 14, 2, 1, T)
  }
  for (let i = 0; i < 4; i++) p.rect(17 + i * 8, 22, 5 + (i % 2) * 2, 2, T)
  p.poly([46, 20, 52, 23, 46, 26], T)
  outline(p)
  return r.blit(p)
}

// ------------------------------------------------------------------ chest

function chest(stage: number, open: boolean) {
  // stage: 0 closed, 1..3 lid rising (3 = fully back)
  const r = frame('chest_closed')
  shadow(r, 33, 52, 25, 4, GD[2], GD[1])
  const c = new Raster(64, 64)
  const body = (top: number) => {
    for (let y = top; y < 52; y++)
      for (let x = 9; x < 55; x++) {
        let col = WOOD[1]
        if (x === 9) col = WOOD[0]
        else if (x >= 52) col = WOOD[2]
        if (y === top) col = WOOD[0]
        if (y >= 49) col = WOOD[2]
        if (y === 51) col = WOOD[3]
        if (x === 54) col = WOOD[3]
        if (y - top === 8 && x > 9 && x < 54) col = WOOD[2]
        c.set(x, y, col)
      }
  }
  body(34)
  const bands = (y0: number, y1: number) => {
    for (const bx of [14, 43]) {
      for (let y = y0; y < y1; y++) {
        c.set(bx, y, GOLD[0])
        c.rect(bx + 1, y, 4, 1, GOLD[1])
        c.set(bx + 5, y, GOLD[2])
      }
    }
  }
  // interior seen when open
  if (stage > 0) {
    c.rect(11, 34, 42, 5, WOOD[3])
    if (stage >= 2) {
      // coins and glow
      c.ellipse(32, 36, 19, 3.2, GOLD[2])
      for (let i = 0; i < 9; i++) c.set(16 + i * 4 + (i % 2), 34 + (i % 3), i % 2 ? GOLD[0] : GOLD[1])
      c.rect(26, 31, 12, 3, GOLD[1])
      c.rect(28, 30, 8, 1, GOLD[0])
    }
  }
  bands(34, 52)
  // lid
  if (stage === 0) {
    const h = 14
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1)
      const inset = Math.round(Math.pow(1 - t, 2.2) * 5)
      for (let x = 9 + inset; x < 55 - inset; x++) {
        let col = y < 2 ? WOOD[0] : y > h - 4 ? WOOD[2] : WOOD[1]
        if (x === 9 + inset) col = WOOD[0]
        if (x >= 53 - inset) col = WOOD[2]
        c.set(x, 20 + y, col)
      }
    }
    for (const bx of [14, 43])
      for (let y = 0; y < 14; y++) {
        c.set(bx, 20 + y, GOLD[0])
        c.rect(bx + 1, 20 + y, 4, 1, GOLD[1])
        c.set(bx + 5, 20 + y, GOLD[2])
      }
  } else {
    // the lid swings up on its back hinge: we see its inner face, then it rests thrown back
    const top = [0, 22, 14, 19][stage]
    const inL = [0, 11, 13, 12][stage]
    c.poly([9, 34, 55, 34, 55 - inL + 9, top, inL, top], WOOD[3])
    c.poly([12, 33, 52, 33, 51 - (stage === 1 ? 0 : 1), top + 3, 14, top + 3], WOOD[2])
    c.rect(inL, top, 64 - 2 * inL, 2, WOOD[0])
    for (const bx of [16, 43]) c.rect(bx, top + 2, 4, 31 - top, GOLD[2])
  }
  // gold trim and lock
  c.rect(9, 33, 46, 1, GOLD[1])
  c.rect(9, 49, 46, 2, GOLD[2])
  for (const [x, y] of [
    [10, 35],
    [52, 35],
    [10, 48],
    [52, 48]
  ]) {
    c.set(x, y, GOLD[0])
    c.set(x + 1, y, GOLD[2])
  }
  if (stage === 0 || !open) {
    c.rect(28, 31, 8, 10, GOLD[2])
    c.rect(28, 31, 8, 1, GOLD[0])
    c.rect(29, 32, 6, 8, GOLD[1])
    c.rect(31, 34, 2, 3, IRON[3])
    c.set(31, 37, IRON[3])
  }
  if (open)
    for (const [x, y] of [
      [20, 26],
      [40, 24],
      [30, 22]
    ])
      c.set(x, y, C.glow)
  outline(c)
  return r.blit(c)
}

export const ruinsSheet = (): Sheet => ({
  plate_off: mk('plate_off', [plate('plate_off', 1, 0, false)]),
  plate_on: mk('plate_on', [plate('plate_on', 1, 0, true)]),
  plate2_off: mk('plate2_off', [plate('plate2_off', 1, 2, false)]),
  plate2_on: mk('plate2_on', [plate('plate2_on', 1, 2, true)]),
  bigplate_off: mk('bigplate_off', [plate('bigplate_off', 2, 0, false)]),
  bigplate_on: mk('bigplate_on', [plate('bigplate_on', 2, 0, true)]),
  crystal_off: mk(
    'crystal_off',
    [0, 1].map((f) => crystal('crystal_off', 'off', f))
  ),
  crystal_on: mk(
    'crystal_on',
    [0, 1, 2, 3].map((f) => crystal('crystal_on', 'on', f))
  ),
  crystal_hit: mk(
    'crystal_hit',
    [0, 1, 2, 3].map((f) => crystal('crystal_hit', 'hit', f))
  ),
  lever_off: mk('lever_off', [lever(-0.85)]),
  lever_on: mk('lever_on', [lever(0.85)]),
  lever_pull: mk('lever_pull', [-0.5, 0.05, 0.7, 1.0].map(lever)),
  gate_closed: mk('gate_closed', [gate(0)]),
  gate_opening: mk(
    'gate_opening',
    [10, 22, 34, 46, 58].map((o) => gate(o))
  ),
  gate_open: mk('gate_open', [gate(60)]),
  bossdoor_closed: mk('bossdoor_closed', [bossDoor(0)]),
  bossdoor_opening: mk('bossdoor_opening', [0.12, 0.3, 0.5, 0.7, 0.85, 0.95].map(bossDoor)),
  bossdoor_open: mk('bossdoor_open', [bossDoor(1)]),
  sign: mk('sign', [sign()]),
  chest_closed: mk('chest_closed', [chest(0, false)]),
  chest_opening: mk(
    'chest_opening',
    [1, 2, 3, 3].map((s, i) => chest(s, i === 3))
  ),
  chest_open: mk('chest_open', [chest(3, true)])
})
