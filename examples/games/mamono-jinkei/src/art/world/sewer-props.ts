/** Stage 2 props: the shared puzzle props restyled for the sewers, plus the stage's own gimmicks and furniture. */
import { PROPS_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, bayer, outline, rng } from '../raster'
import { anim, type Sheet } from '../sheet'
import { box, column, shadow, solid, theme } from './pp'
import { featSheet } from './props-feat'
import { natureSheet } from './props-nature'
import { ruinsSheet } from './props-ruins'
import { recolour } from './sewer-tiles'

const SPEC = PROPS_SPEC.sewer
const SS = R.sewerStone
const BR = R.brick
const SL = R.sludge
const WOOD = R.wood
const HAY = R.hay
const CHEESE = R.cheese
const IRON = R.clothBlack
const STEEL = R.steel
const GOLD = R.gold
const FIRE = R.fire
const W = R.water

const frame = (name: string) => new Raster(SPEC[name].w, SPEC[name].h)
function mk(name: string, frames: Raster[]) {
  const s = SPEC[name]
  if (!s) throw new Error(`no sewer spec ${name}`)
  if (frames.length !== s.frames) throw new Error(`${name}: ${frames.length} frames, expected ${s.frames}`)
  return anim(frames, s.fps, s.loop, {
    ...(s.anchor ? { anchor: s.anchor } : {}),
    ...(s.lift ? { lift: frames.map(() => 0) } : {})
  })
}

const SHADOW: [number, number] = [SS[3], SS[2]]
const sh = (r: Raster, cx: number, cy: number, rx: number, ry: number) =>
  shadow(r, cx, cy, rx, ry, SHADOW[0], SHADOW[1])

/** A rotated board: length `len`, thickness `th`, centred at (cx, cy). */
function plank(
  r: Raster,
  cx: number,
  cy: number,
  len: number,
  th: number,
  angle: number,
  ramp: readonly number[] = WOOD
) {
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  const reach = Math.ceil(Math.hypot(len, th) / 2) + 1
  for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y++)
    for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const u = dx * ca + dy * sa
      const v = -dx * sa + dy * ca
      if (Math.abs(u) > len / 2 || Math.abs(v) > th / 2) continue
      const t = (v + th / 2) / th
      let c = t < 0.25 ? ramp[0] : t < 0.7 ? ramp[1] : t < 0.9 ? ramp[2] : ramp[3]
      if (Math.abs(u) > len / 2 - 1) c = ramp[3]
      r.set(x, y, c)
    }
}

/** An elliptical ring (outer radii rx, ry; thickness t in px), optionally limited to an angle span. */
function ellRing(
  r: Raster,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  t: number,
  c: number,
  a0 = -Math.PI,
  a1 = Math.PI
) {
  const kx = (rx - t) / rx
  const ky = (ry - t) / ry
  const tau = Math.PI * 2
  const norm = (v: number) => ((v % tau) + tau) % tau
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1 || (nx / kx) ** 2 + (ny / ky) ** 2 < 1) continue
      if (a1 - a0 < tau - 1e-6 && norm(Math.atan2(ny, nx) - a0) > norm(a1 - a0)) continue
      r.set(x, y, c)
    }
}

// ------------------------------------------------------------------ shared props restyled for the sewers

function commonSheet(): Sheet {
  const all: Sheet = { ...natureSheet(), ...ruinsSheet(), ...featSheet() }
  const out: Sheet = {}
  const stone: [readonly number[], readonly number[]][] = [
    [R.stone, SS],
    [R.rock, SS],
    [R.grassDark, SL]
  ]
  const door: [readonly number[], readonly number[]][] = [
    [R.stone, [BR[1], BR[1], BR[2], BR[3]]],
    [R.grassDark, SL]
  ]
  const names = Object.keys(SPEC).filter((n) => all[n] && !['grass', 'bush', 'tree'].includes(n))
  for (const name of names) {
    const a = all[name]
    const pairs = name.startsWith('bossdoor') ? door : stone
    out[name] = { ...a, frames: a.frames.map((f) => recolour(f, pairs)) }
  }
  return out
}

// ------------------------------------------------------------------ crates

function crateBody(r: Raster, x: number, y: number, w: number, d: number, h: number, panels: number) {
  // top face: boards
  for (let j = 0; j < d; j++)
    for (let i = 0; i < w; i++) {
      let c = WOOD[0]
      if (j % 6 === 5) c = WOOD[1]
      if (i === 0 || j === 0) c = WOOD[0]
      if (i === w - 1) c = WOOD[1]
      r.set(x + i, y + j, c)
    }
  r.rect(x, y, w, 1, WOOD[0])
  // front: frame + slats
  const fy = y + d
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let c = WOOD[1]
      if ((i + 3) % 7 === 0) c = WOOD[2]
      if (i === 0) c = WOOD[0]
      if (i >= w - 3) c = WOOD[2]
      if (j >= h - 3) c = WOOD[2]
      r.set(x + i, fy + j, c)
    }
  const rail = (ry: number) => {
    r.rect(x, ry, w, 5, WOOD[2])
    r.rect(x, ry, w, 1, WOOD[0])
    r.rect(x, ry + 4, w, 1, WOOD[3])
  }
  rail(fy)
  rail(fy + h - 6)
  const post = (px: number) => {
    r.rect(px, fy, 6, h, WOOD[2])
    r.rect(px, fy, 1, h, WOOD[0])
    r.rect(px + 5, fy, 1, h, WOOD[3])
  }
  post(x)
  post(x + w - 6)
  for (let k = 1; k < panels; k++) post(x + Math.round((k * (w - 6)) / panels))
  // diagonal braces in each panel
  const pw = (w - 6) / panels
  for (let k = 0; k < panels; k++) {
    const x0 = x + 6 + k * pw
    r.thick(x0, fy + 6, x0 + pw - 6, fy + h - 7, 3, WOOD[3])
    r.thick(x0 - 0.5, fy + 5.5, x0 + pw - 6.5, fy + h - 7.5, 1.4, WOOD[0])
  }
  for (const [nx, ny] of [
    [x + 2, fy + 2],
    [x + w - 4, fy + 2],
    [x + 2, fy + h - 5],
    [x + w - 4, fy + h - 5]
  ]) {
    r.set(nx, ny, STEEL[0])
    r.set(nx + 1, ny + 1, IRON[2])
  }
}

function crate() {
  const r = frame('crate')
  const b = new Raster(64, 96)
  crateBody(b, 7, 36, 50, 18, 36, 1)
  outline(b)
  sh(r, 34, 90, 29, 5)
  return r.blit(b)
}

function bigcrate() {
  const r = frame('bigcrate')
  const b = new Raster(128, 160)
  crateBody(b, 8, 44, 112, 42, 68, 3)
  // stencilled cheese wedge on the big crate
  b.poly([52, 108, 76, 112, 52, 124], CHEESE[1])
  b.poly([52, 108, 76, 112, 70, 111], CHEESE[0])
  b.rect(52, 122, 24, 1, CHEESE[3])
  outline(b)
  sh(r, 66, 152, 60, 7)
  return r.blit(b)
}

// ------------------------------------------------------------------ barrels

function barrelBody(r: Raster, bulge = 0) {
  for (let y = 22; y <= 54; y++) {
    const t = (y - 22) / 32
    const half = 12 + Math.sin(t * Math.PI) * (4 + bulge)
    for (let x = Math.round(32 - half); x <= Math.round(32 + half); x++) {
      const u = (x - (32 - half)) / (half * 2)
      let c = u < 0.18 ? WOOD[0] : u < 0.55 ? WOOD[1] : u < 0.85 ? WOOD[2] : WOOD[3]
      if ((x + 2) % 5 === 0 && u > 0.12) c = c === WOOD[1] ? WOOD[2] : WOOD[3]
      r.set(x, y, c)
    }
  }
  for (const hy of [30, 46]) {
    const t = (hy - 22) / 32
    const half = 12 + Math.sin(t * Math.PI) * (4 + bulge)
    for (let x = Math.round(32 - half); x <= Math.round(32 + half); x++) {
      const u = (x - (32 - half)) / (half * 2)
      r.set(x, hy, u < 0.25 ? STEEL[0] : u < 0.7 ? STEEL[1] : STEEL[2])
      r.set(x, hy + 1, u < 0.7 ? STEEL[2] : IRON[2])
      r.set(x, hy + 2, IRON[2])
    }
  }
  r.ellipse(32, 54, 12.5, 3, WOOD[3])
  r.rect(20, 54, 25, 1, WOOD[3])
  // lid
  r.ellipse(32, 22, 12.5, 4.2, WOOD[2])
  r.ellipse(32, 21.6, 11.6, 3.6, WOOD[0])
  r.ellipse(32.5, 22, 8, 2.4, WOOD[1])
  r.rect(26, 21, 12, 1, WOOD[0])
  r.set(32, 22, WOOD[3])
}

function barrel() {
  const r = frame('barrel')
  const b = new Raster(64, 64)
  barrelBody(b)
  outline(b)
  sh(r, 34, 55, 16, 3.4)
  return r.blit(b)
}

function barrelBreak(k: number) {
  const r = frame('barrel_break')
  if (k === 0) {
    const b = new Raster(64, 64)
    barrelBody(b, 2)
    for (const [x0, y0, x1, y1] of [
      [30, 26, 33, 38],
      [33, 38, 29, 50],
      [33, 38, 40, 44]
    ])
      b.line(x0, y0, x1, y1, C.inkWarm)
    outline(b)
    sh(r, 34, 55, 17, 3.4)
    return r.blit(b)
  }
  sh(r, 34, 55, 17, 3.4)
  const base = new Raster(64, 64)
  base.ellipse(32, 50, 12, 5, WOOD[2])
  for (let x = 20; x <= 44; x++) {
    const hgt = 2 + ((x * 5) % 4)
    for (let y = 50 - hgt; y <= 54; y++)
      base.set(x, y, (x + 2) % 5 === 0 ? WOOD[3] : x < 28 ? WOOD[1] : x < 38 ? WOOD[2] : WOOD[3])
  }
  base.rect(20, 52, 25, 1, STEEL[2])
  outline(base)
  r.blit(base)
  const rn = rng(88)
  const pieces = Array.from({ length: 7 }, (_, i) => ({
    x: 32 + (i - 3) * 3,
    y: 38,
    vx: (i - 3) * 4 + (rn() - 0.5) * 3,
    vy: -10 - rn() * 7,
    len: 12 + rn() * 7,
    w: 4 + (i % 2),
    spin: (rn() - 0.5) * 1.2
  }))
  for (const p of pieces) {
    const x = p.x + p.vx * k * 0.85
    const y = Math.min(52, p.y + p.vy * k + 2.8 * k * k)
    const l = new Raster(64, 64)
    plank(l, x, y, p.len, p.w, p.spin * k + 0.5)
    outline(l)
    r.blit(l)
  }
  // iron hoop rolling away
  const hx = 32 + k * 8
  const hy = Math.min(52, 44 + k * 2)
  const hp = new Raster(64, 64)
  hp.ring(hx, hy, 6, 8, STEEL[1])
  hp.ring(hx, hy, 6, 7, STEEL[0], Math.PI, Math.PI * 1.6)
  outline(hp)
  r.blit(hp)
  // spilled splash
  if (k <= 3)
    for (let i = 0; i < 6; i++) r.set(32 + (i - 2.5) * (3 + k * 2), 50 - ((i * 3) % 4) - k, i % 2 ? W[0] : W[1])
  return r
}

// ------------------------------------------------------------------ cheese wheel

function cheese() {
  const r = frame('cheese')
  sh(r, 50, 80, 38, 7)
  const b = new Raster(96, 96)
  // side wall
  for (let y = 44; y < 90; y++) {
    for (let x = 12; x < 85; x++) {
      const nx = (x + 0.5 - 48.5) / 36.5
      const bottom = 44 + 22 + Math.sqrt(Math.max(0, 1 - nx * nx)) * 20
      if (y > bottom || Math.abs(nx) > 1) continue
      const u = (nx + 1) / 2
      let c = u < 0.2 ? CHEESE[1] : u < 0.62 ? CHEESE[2] : CHEESE[3]
      if (y > bottom - 3) c = CHEESE[3]
      b.set(x, y, c)
    }
  }
  // top face
  b.ellipse(48.5, 45, 37, 21, CHEESE[2])
  b.ellipse(48, 44, 36, 20, CHEESE[1])
  b.ellipse(46, 42, 32, 17, CHEESE[0])
  // rind rim
  ellRing(b, 48, 44, 36, 20, 3.4, CHEESE[1])
  ellRing(b, 48, 43.5, 36, 20, 2.4, CHEESE[2], 0.1, Math.PI * 0.95)
  // holes: lit upper-left lip, deep right side
  const holes: [number, number, number, number][] = [
    [34, 38, 6, 3.4],
    [58, 34, 4.6, 2.8],
    [50, 50, 5.4, 3],
    [70, 48, 3.6, 2.2],
    [26, 50, 3.2, 2],
    [44, 31, 2.8, 1.8]
  ]
  for (const [hx, hy, rx, ry] of holes) {
    b.ellipse(hx, hy, rx, ry, CHEESE[3])
    b.ellipse(hx + 0.6, hy + 0.9, rx - 1, ry - 0.6, CHEESE[2])
    b.ellipse(hx - 0.4, hy - 0.3, rx - 1.4, ry - 1, CHEESE[3])
    b.rect(Math.round(hx - rx), Math.round(hy - ry), Math.max(1, Math.round(rx * 0.8)), 1, CHEESE[0])
  }
  for (const [hx, hy] of [
    [22, 57],
    [38, 62],
    [56, 63],
    [74, 58]
  ]) {
    b.ellipse(hx, hy, 3, 2.2, CHEESE[3])
    b.rect(hx - 2, hy - 2, 3, 1, CHEESE[1])
  }
  b.rect(30, 33, 8, 1, C.white)
  b.set(29, 34, C.white)
  outline(b)
  return r.blit(b)
}

// ------------------------------------------------------------------ grain scale

function scale(on: boolean, f: number) {
  const r = frame('scale_off')
  sh(r, 66, 90, 58, 6)
  const b = new Raster(128, 96)
  box(b, 10, 56, 108, 14, 22, [SS[0], SS[1], SS[2], SS[3]])
  // gauge dial on the front
  b.ellipse(64, 80, 11, 8, IRON[2])
  b.ellipse(64, 79.6, 10, 7, R.paper[1])
  b.ellipse(64, 80, 8, 5.6, R.paper[0])
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i / 6) * Math.PI
    b.set(64 + Math.cos(a) * 7, 83 + Math.sin(a) * 4.6, IRON[2])
  }
  const na = on ? 0.45 : 2.65
  b.line(64, 83, 64 + Math.cos(Math.PI + na) * 7, 83 + Math.sin(Math.PI + na) * 5.4, IRON[3])
  // springs and brass pan
  const lift = on ? 11 : 0
  const panY = 38 + lift
  for (const sx of [24, 46, 82, 104]) {
    const top = panY + 8
    const bot = 60
    for (let y = top; y < bot; y += 3) {
      const zig = ((y - top) / 3) % 2 ? 2 : -2
      b.line(sx + zig, y, sx - zig, y + 3, IRON[1])
      b.set(sx + zig, y, STEEL[1])
    }
  }
  b.ellipse(64, panY + 7, 49, 15, GOLD[3])
  b.ellipse(64, panY + 5, 49, 14, GOLD[2])
  b.ellipse(64, panY + 3, 47, 13, GOLD[1])
  b.ellipse(62, panY + 1, 42, 10, GOLD[0])
  b.ellipse(66, panY + 3, 30, 7, GOLD[1])
  // rim highlight and engraved ring
  ellRing(b, 64, panY + 3, 31, 8.5, 1.4, GOLD[2])
  ellRing(b, 64, panY + 2.5, 45, 12, 1.4, GOLD[0], Math.PI * 1.05, Math.PI * 1.75)
  b.ellipse(64, panY + 3, 5, 2, GOLD[2])
  if (on) {
    const glow = [HOLY1, HOLY2, HOLY1, HOLY3][f]
    ellRing(b, 64, panY + 4, 50, 15, 2, glow)
    ellRing(b, 64, panY + 4, 53, 17, 1, f % 2 ? C.glow : HOLY1)
    for (let i = 0; i < 4; i++) {
      const sx = 30 + ((i * 29 + f * 17) % 70)
      const sy = panY - 6 - ((i * 7 + f * 3) % 12)
      b.set(sx, sy, C.white)
      b.set(sx + 1, sy, C.glow)
      b.set(sx, sy - 1, C.glow)
    }
  }
  outline(b)
  return r.blit(b)
}
const HOLY1 = R.holy[2]
const HOLY2 = R.holy[1]
const HOLY3 = R.holy[0]

// ------------------------------------------------------------------ valve

function valve(name: string, angle: number, on: boolean, puff = 0) {
  const r = frame(name)
  sh(r, 34, 54, 26, 3.5)
  const b = new Raster(64, 64)
  // pipe
  column(b, 3, 61, 36, 52, [STEEL[0], STEEL[1], STEEL[2], STEEL[3]])
  for (let y = 36; y < 52; y++) {
    const t = (y - 36) / 16
    const c = t < 0.2 ? STEEL[0] : t < 0.55 ? STEEL[1] : t < 0.85 ? STEEL[2] : IRON[2]
    for (let x = 3; x < 61; x++) b.set(x, y, c)
  }
  for (const fx of [10, 50]) {
    b.rect(fx, 34, 5, 20, IRON[1])
    b.rect(fx, 34, 5, 2, STEEL[1])
    b.rect(fx + 4, 36, 1, 18, IRON[3])
    b.set(fx + 1, 40, STEEL[0])
    b.set(fx + 1, 48, STEEL[0])
  }
  // bonnet and stem
  b.rect(26, 28, 12, 8, IRON[1])
  b.rect(26, 28, 3, 8, STEEL[1])
  b.rect(37, 28, 1, 8, IRON[3])
  b.rect(30, 22, 4, 7, STEEL[1])
  // wheel (3/4 view: a flattened ring with spokes)
  const cx = 32
  const cy = 21
  const rx = 15
  const ry = 6
  const col = on ? R.jobGreen : R.jobRed
  for (let k = 0; k < 4; k++) {
    const a = angle + (k * Math.PI) / 2
    b.thick(cx, cy, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 2, col[2])
  }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    const x = cx + Math.cos(a) * rx
    const y = cy + Math.sin(a) * ry
    b.ellipse(x, y, 1.8, 1.5, a > 0 && a < Math.PI ? col[2] : col[1])
  }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    if (a > Math.PI * 1.05 && a < Math.PI * 1.7) b.set(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry - 1, col[0])
  }
  for (let k = 0; k < 4; k++) {
    const a = angle + (k * Math.PI) / 2
    b.ellipse(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 2.4, 2, col[0])
  }
  b.ellipse(cx, cy, 3.4, 2.4, STEEL[1])
  b.set(cx - 1, cy - 1, STEEL[0])
  outline(b)
  r.blit(b)
  if (puff) {
    for (let i = 0; i < 4; i++) {
      const x = 8 + i * 15
      const y = 30 - puff * 3 - (i % 2) * 3
      r.ellipse(x, y, 2 + puff * 0.7, 1.6 + puff * 0.5, R.paper[puff > 3 ? 2 : 1])
    }
  }
  return r
}

// ------------------------------------------------------------------ sluice

function sluice(offset: number, f = 0) {
  const r = frame('sluice_closed')
  sh(r, 32, 90, 30, 4)
  // channel water under the gate
  const lintelBottom = 30
  const floor = 86
  r.rect(14, floor - 4, 36, 8, W[2])
  for (let x = 14; x < 50; x++) {
    r.set(x, floor - 3 + ((x + f * 2) % 4 === 0 ? 1 : 0), W[0])
    r.set(x, floor, W[1])
    r.set(x, floor + 2, W[3])
  }
  const slab = new Raster(64, 96)
  for (let y = lintelBottom - 40 + offset * 0; y < floor + 2; y++) {
    for (let x = 14; x < 50; x++) {
      const yy = y - offset
      if (yy < lintelBottom - 2 || yy > floor + 2) continue
      let c = WOOD[1]
      if ((x - 14) % 9 === 0) c = WOOD[3]
      else if ((x - 14) % 9 === 1) c = WOOD[0]
      else if ((x - 14) % 9 > 6) c = WOOD[2]
      slab.set(x, y, c)
    }
  }
  // iron straps with rivets
  for (const sy of [38, 60]) {
    const y = sy + offset
    slab.rect(14, y, 36, 5, IRON[1])
    slab.rect(14, y, 36, 1, IRON[0])
    slab.rect(14, y + 4, 36, 1, IRON[3])
    for (let x = 18; x < 48; x += 8) slab.set(x, y + 2, STEEL[1])
  }
  // the slab only exists between the lintel and the floor
  for (let y = 0; y < 96; y++) for (let x = 0; x < 64; x++) if (y < lintelBottom || y > floor) slab.set(x, y, 0)
  outline(slab)
  r.blit(slab)
  // water dripping off the bottom edge while it is down
  if (offset < 20) for (const dx of [20, 34, 44]) r.set(dx, floor + 2 + ((f + dx) % 3), W[0])
  // brick posts, lintel, winch
  box(r, 1, 18, 13, 7, 68, [BR[0], BR[1], BR[2], BR[3]])
  box(r, 50, 18, 13, 7, 68, [BR[0], BR[1], BR[2], BR[3]])
  box(r, 1, 12, 62, 8, 12, [BR[0], BR[1], BR[2], BR[3]])
  r.rect(14, 24, 36, 2, BR[3])
  for (let y = 30; y < 84; y += 9) {
    r.rect(2, y, 11, 1, BR[3])
    r.rect(51, y, 11, 1, BR[3])
  }
  // chains from the slab to a wheel on the lintel
  for (const cx of [22, 42])
    for (let y = 14 + (offset % 2); y < 40 + offset; y += 3)
      if (y > 8 && y < 30 + offset) r.rect(cx, Math.max(0, Math.min(y, lintelBottom - 3)), 1, 2, STEEL[1])
  r.ellipse(32, 14, 6, 4, IRON[1])
  r.ellipse(31, 13, 4, 2.6, STEEL[1])
  r.set(32, 14, IRON[3])
  r.rect(4, 70, 6, 2, SL[1])
  r.rect(52, 50, 8, 2, SL[1])
  return outline(r)
}

// ------------------------------------------------------------------ barricade

function barricadeParts() {
  // [cx, cy, len, thick, angle]
  return [
    [20, 74, 12, 78, Math.PI / 2],
    [108, 74, 12, 78, Math.PI / 2],
    [64, 100, 108, 12, 0],
    [64, 78, 112, 13, 0.02],
    [64, 56, 104, 12, -0.02],
    [64, 66, 84, 11, 0.62],
    [64, 66, 84, 11, -0.62]
  ] as const
}

function barricade() {
  const r = frame('barricade')
  sh(r, 66, 108, 60, 7)
  const b = new Raster(128, 128)
  for (const [cx, cy, len, th, ang] of barricadeParts()) {
    const l = new Raster(128, 128)
    plank(l, cx, cy, len, th, ang)
    outline(l)
    b.blit(l)
  }
  for (const [x, y] of [
    [20, 60],
    [20, 84],
    [108, 60],
    [108, 84],
    [64, 66],
    [30, 100],
    [98, 100]
  ]) {
    b.set(x, y, STEEL[0])
    b.set(x + 1, y + 1, IRON[2])
  }
  // sharpened stakes on top
  for (const x of [22, 40, 64, 88, 106]) {
    b.poly([x - 3, 48, x, 38, x + 3, 48], WOOD[1])
    b.poly([x - 3, 48, x, 38, x - 1, 48], WOOD[0])
    b.set(x, 38, WOOD[3])
  }
  outline(b)
  return r.blit(b)
}

function barricadeBreak(k: number) {
  const r = frame('barricade_break')
  sh(r, 66, 108, 60, 7)
  if (k === 0) {
    const b = new Raster(128, 128)
    for (const [cx, cy, len, th, ang] of barricadeParts()) {
      const l = new Raster(128, 128)
      plank(l, cx + (k % 2) * 1, cy, len, th, ang + (cx > 90 ? 0.03 : 0))
      outline(l)
      b.blit(l)
    }
    for (let i = 0; i < 6; i++) b.set(40 + i * 9, 52 + (i % 3) * 14, R.paper[2])
    return r.blit(b.shifted(1, 0))
  }
  const rn = rng(51)
  const parts = barricadeParts()
  // dust behind
  const dust = [0, 0.9, 1, 0.8, 0.6, 0.4, 0.25][k]
  for (let i = 0; i < 6; i++) {
    const rr = (7 + k + (i % 3) * 2) * (0.4 + dust * 0.7)
    r.ellipse(64 + (i - 2.5) * (14 + k * 2), 102 - (i % 2) * 5 - k, rr * 1.4, rr * 0.8, R.paper[3])
    r.ellipse(64 + (i - 2.5) * (14 + k * 2) - 1, 100 - (i % 2) * 5 - k, rr * 1.0, rr * 0.6, R.paper[2])
  }
  parts.forEach(([cx, cy, len, th, ang], i) => {
    const dir = cx < 64 ? -1 : cx > 64 ? 1 : i % 2 ? 1 : -1
    const t = Math.min(k, 4) - 0.5
    const resting = k >= 5
    const rest = { x: 64 + (i - 3) * 14, y: 108 + (i % 2) * 5, a: (i % 3) * 0.5 - 0.5 }
    const flyX = cx + dir * (10 + rn() * 14) * t
    const flyY = Math.min(110, cy - (18 + rn() * 10) * t + 7 * t * t)
    const x = resting ? rest.x : flyX
    const y = resting ? rest.y : flyY
    const a = resting ? rest.a : ang + dir * 0.5 * t * (1 + (i % 3) * 0.4)
    const l = new Raster(128, 128)
    plank(l, x, y, resting ? len * 0.42 : len * 0.62, th * (resting ? 0.9 : 1), a)
    outline(l)
    r.blit(l)
  })
  return r
}

// ------------------------------------------------------------------ mousetrap

function mousetrap(angle: number, f: number, snapped: boolean) {
  const r = frame('mousetrap_idle')
  sh(r, 34, 50, 22, 3.4)
  const b = new Raster(64, 64)
  box(b, 12, 36, 40, 10, 8, [WOOD[0], WOOD[1], WOOD[2], WOOD[3]])
  b.rect(14, 38, 36, 1, WOOD[1])
  // spring coil
  for (let i = 0; i < 4; i++) b.ellipse(19 + i * 2.4, 40, 1.4, 2, STEEL[2])
  b.ellipse(18, 40, 2.2, 2.4, STEEL[1])
  // hold-down bar pivoting at the right end
  const px = 46
  const py = 41
  const len = 28
  const tx = px - Math.cos(angle) * len
  const ty = py - Math.sin(angle) * len
  b.thick(px, py, tx, ty, 3.2, STEEL[2])
  b.thick(px - 0.5, py - 0.7, tx - 0.5, ty - 0.7, 1.4, STEEL[0])
  b.ellipse(px, py, 3, 2.6, IRON[1])
  b.set(px - 1, py - 1, STEEL[0])
  // bait: a cheese crumb on the trigger
  if (!snapped) {
    b.rect(24, 31, 6, 5, CHEESE[1])
    b.rect(24, 31, 6, 1, CHEESE[0])
    b.rect(24, 35, 6, 1, CHEESE[3])
    b.set(27, 33, CHEESE[3])
  } else if (f < 3) {
    // the bait pops off
    b.rect(30 - f * 3, 22 - f * 4 + f * f, 3, 3, CHEESE[1])
  }
  outline(b)
  r.blit(b)
  if (snapped && f < 3)
    for (let i = 0; i < 5; i++) r.set(16 + i * 8, 34 - ((i * 5) % 4) - f * 2, f === 0 ? C.white : FIRE[0])
  return r
}

// ------------------------------------------------------------------ lamp

function lamp(f: number) {
  const r = frame('lamp')
  const b = new Raster(32, 64)
  // soft glow around the lantern (two dithered rings)
  const gr = [15, 17, 16, 18][f]
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 16, (y - 18) * 1.1)
      if (d < gr && d > 10 && bayer(x, y) < (gr - d) / 10 - 0.2) b.set(x, y, FIRE[2])
    }
  // post
  for (let y = 26; y < 58; y++) {
    b.set(15, y, IRON[0])
    b.rect(16, y, 2, 1, IRON[1])
    b.set(18, y, IRON[2])
  }
  b.rect(11, 56, 10, 3, IRON[2])
  b.rect(11, 56, 10, 1, IRON[0])
  // bracket and chain
  b.rect(13, 8, 6, 2, IRON[1])
  b.rect(16, 10, 1, 3, STEEL[1])
  // lantern: cap, glass, base
  b.poly([8, 14, 16, 8, 24, 14], IRON[1])
  b.poly([8, 14, 16, 8, 14, 14], IRON[0])
  b.rect(9, 14, 14, 14, FIRE[3])
  b.rect(10, 15, 12, 12, FIRE[2])
  b.rect(11, 16, 10, 10, FIRE[1])
  const fh = [8, 9, 7, 9][f]
  b.ellipse(16, 24 - fh / 2 + 3, 3.4, fh / 2 + 1, FIRE[1])
  b.ellipse(16, 24 - fh / 2 + 4, 2.2, fh / 2, FIRE[0])
  b.set(16 + (f % 2), 24 - fh, FIRE[0])
  b.set(15, 24, C.white)
  // cage bars and base
  for (const x of [9, 15, 22]) b.rect(x, 14, 1, 14, IRON[2])
  b.rect(8, 28, 16, 3, IRON[1])
  b.rect(8, 28, 16, 1, IRON[0])
  b.poly([10, 31, 22, 31, 18, 34, 14, 34], IRON[2])
  outline(b)
  r.blit(b)
  sh(r, 17, 58, 8, 2)
  return r.blit(b).shifted(0, 0)
}

// ------------------------------------------------------------------ sacks, grate, pipe, hay, shelf, cobweb

function sack() {
  const r = frame('sack')
  sh(r, 34, 52, 20, 4)
  const b = new Raster(64, 64)
  solid(
    b,
    [
      [32, 38, 18, 16, 20],
      [32, 24, 9, 8, 8]
    ],
    [HAY[0], HAY[1], HAY[2], HAY[3]],
    1.2,
    17
  )
  // folded-over neck with a tie
  b.poly([24, 18, 29, 10, 33, 16, 37, 10, 41, 18, 38, 24, 26, 24], HAY[1])
  b.poly([24, 18, 29, 10, 28, 20], HAY[0])
  b.poly([36, 12, 41, 18, 38, 24, 35, 20], HAY[2])
  b.rect(26, 22, 13, 2, R.leather[2])
  b.rect(26, 22, 13, 1, R.leather[1])
  b.set(40, 24, R.leather[2])
  b.rect(39, 25, 1, 3, R.leather[2])
  // stitching and a stamped mark
  for (let y = 28; y < 52; y += 4) b.set(32, y, HAY[3])
  b.ring(32, 41, 5, 7, R.jobRed[2])
  b.rect(30, 40, 5, 1, R.jobRed[2])
  b.rect(32, 38, 1, 6, R.jobRed[2])
  // spilled grain
  for (const [x, y] of [
    [16, 51],
    [18, 52],
    [46, 51],
    [48, 52],
    [44, 53]
  ])
    b.set(x, y, HAY[0])
  outline(b)
  return r.blit(b)
}

function grate() {
  const r = frame('grate')
  r.rect(8, 14, 48, 38, SS[3])
  r.rect(9, 15, 46, 36, SS[0])
  r.rect(10, 16, 44, 34, SS[2])
  r.rect(12, 18, 40, 30, C.black)
  r.rect(12, 18, 40, 2, IRON[3])
  // dark water far below with a faint sheen
  for (let x = 14; x < 50; x += 5) r.set(x + ((x >> 1) % 3), 40, W[3])
  r.rect(18, 44, 12, 1, W[2])
  for (let i = 0; i < 6; i++) {
    const x = 14 + i * 7
    r.rect(x, 17, 4, 33, IRON[2])
    r.rect(x, 17, 1, 33, IRON[0])
    r.rect(x + 3, 17, 1, 33, IRON[3])
  }
  r.rect(11, 17, 42, 3, IRON[1])
  r.rect(11, 46, 42, 3, IRON[1])
  r.rect(11, 17, 42, 1, STEEL[1])
  for (const [x, y] of [
    [13, 18],
    [49, 18],
    [13, 47],
    [49, 47]
  ])
    r.set(x, y, STEEL[0])
  // slime on the lip
  r.rect(18, 50, 10, 2, SL[1])
  r.rect(20, 52, 3, 2, SL[2])
  r.set(40, 14, SL[1])
  r.rect(8, 13, 48, 1, SS[0])
  return outline(r)
}

function pipe(f: number) {
  const r = frame('pipe')
  const b = new Raster(64, 96)
  // brick wall segment
  for (let y = 6; y < 70; y++)
    for (let x = 6; x < 58; x++) {
      const course = Math.floor((y - 6) / 8)
      const off = (course % 2) * 8
      let c = SS[1]
      if ((y - 6) % 8 === 7 || (x - 6 + off) % 16 === 15) c = SS[3]
      else if ((y - 6) % 8 === 0) c = SS[0]
      else if (ih2(x, y) < 0.08) c = SS[2]
      b.set(x, y, c)
    }
  b.rect(6, 70, 52, 4, SS[3])
  b.rect(6, 70, 52, 1, SS[2])
  // outlet pipe: flange, mouth, slime streaks
  b.ellipse(32, 34, 15, 13, IRON[2])
  b.ellipse(32, 33, 14, 12, STEEL[2])
  b.ellipse(31, 32, 13, 11, STEEL[1])
  b.ellipse(30, 31, 10, 7, STEEL[0])
  b.ellipse(32.5, 35, 10, 9, IRON[3])
  b.ellipse(32, 35, 9, 8, C.black)
  for (const [x, y] of [
    [20, 24],
    [44, 24],
    [20, 42],
    [44, 42]
  ]) {
    b.set(x, y, STEEL[0])
    b.set(x + 1, y + 1, IRON[2])
  }
  for (let y = 46; y < 70; y++) {
    b.set(24, y, SL[2])
    if (y < 62) b.set(41, y, SL[1])
    if (y < 56) b.set(25, y, SL[1])
  }
  b.rect(22, 44, 22, 2, SL[1])
  outline(b)
  r.blit(b)
  // the stream
  const sx = 32
  for (let y = 44; y < 76; y++) {
    const wob = Math.round(Math.sin((y + f * 5) * 0.4) * 0.8)
    r.rect(sx - 3 + wob, y, 7, 1, W[1])
    r.set(sx - 3 + wob, y, W[0])
    r.set(sx - 2 + wob, y, W[0])
    r.set(sx + 3 + wob, y, W[2])
    if ((y + f * 3) % 6 < 2) r.set(sx + wob, y, C.white)
  }
  // splash where it lands
  r.ellipse(32, 78, 11 + f, 3, W[1])
  r.ellipse(32, 77, 8 + f, 2, W[0])
  for (const dx of [-12 - f * 2, 12 + f * 2]) r.set(32 + dx, 74 - f, W[0])
  r.set(32 + (f ? 14 : -14), 72, C.white)
  return r
}
const ih2 = (x: number, y: number) => bayer(x * 3, y * 5) * 0.7 + ((x * 31 + y * 17) % 7) / 20

function haybale() {
  const r = frame('haybale')
  sh(r, 34, 56, 29, 5)
  const b = new Raster(64, 80)
  const rn = rng(19)
  box(b, 8, 28, 48, 16, 28, [HAY[0], HAY[2], HAY[3], HAY[3]])
  // straw strokes
  for (let i = 0; i < 110; i++) {
    const x = 9 + Math.floor(rn() * 44)
    const y = 29 + Math.floor(rn() * 14)
    const len = 3 + Math.floor(rn() * 6)
    for (let k = 0; k < len; k++) b.paint(x + k, y, rn() < 0.5 ? HAY[0] : HAY[1])
  }
  for (let i = 0; i < 140; i++) {
    const x = 9 + Math.floor(rn() * 44)
    const y = 45 + Math.floor(rn() * 26)
    const len = 3 + Math.floor(rn() * 7)
    for (let k = 0; k < len; k++) b.paint(x + k, y, rn() < 0.3 ? HAY[1] : rn() < 0.6 ? HAY[2] : HAY[3])
  }
  // twine
  for (const x of [20, 42]) {
    b.rect(x, 28, 3, 44, R.leather[2])
    b.rect(x, 28, 1, 44, R.leather[0])
    b.rect(x + 2, 28, 1, 44, R.leather[3])
  }
  // loose straws poking out of the sides and top
  for (const [x, y, dx, dy] of [
    [8, 50, -1, 0],
    [8, 58, -2, -1],
    [55, 54, 1, 0],
    [55, 62, 2, 1],
    [14, 28, 0, -1],
    [34, 28, 1, -1],
    [50, 28, 0, -1]
  ] as const)
    for (let k = 1; k <= 4; k++) b.set(x + dx * k, y + dy * k - (dx ? k % 2 : 0), HAY[k % 2 ? 0 : 1])
  outline(b)
  return r.blit(b)
}

function jar(r: Raster, x: number, y: number, c: readonly number[]) {
  r.rect(x, y - 12, 9, 12, c[1])
  r.rect(x, y - 12, 2, 12, c[0])
  r.rect(x + 7, y - 12, 2, 12, c[2])
  r.rect(x + 2, y - 15, 5, 3, WOOD[1])
  r.rect(x + 2, y - 15, 5, 1, WOOD[0])
  r.set(x + 2, y - 9, C.white)
  r.rect(x + 2, y - 6, 5, 3, R.paper[1])
}

function wheelSmall(r: Raster, x: number, y: number) {
  r.ellipse(x + 8, y - 4, 9, 4.4, CHEESE[2])
  r.rect(x - 1, y - 6, 18, 6, CHEESE[2])
  r.ellipse(x + 8, y - 8, 9, 4.2, CHEESE[1])
  r.ellipse(x + 6, y - 9, 6.5, 2.6, CHEESE[0])
  r.set(x + 11, y - 8, CHEESE[3])
  r.set(x + 4, y - 5, CHEESE[3])
  r.rect(x, y - 3, 16, 3, CHEESE[3])
}

function shelf() {
  const r = frame('shelf')
  sh(r, 66, 116, 56, 5)
  const b = new Raster(128, 128)
  // back panel and uprights
  b.rect(10, 12, 108, 104, WOOD[3])
  for (let x = 12; x < 116; x += 12) b.rect(x, 12, 1, 104, WOOD[2])
  for (const ux of [6, 114]) {
    b.rect(ux, 8, 8, 112, WOOD[1])
    b.rect(ux, 8, 1, 112, WOOD[0])
    b.rect(ux + 7, 8, 1, 112, WOOD[3])
    b.rect(ux, 8, 8, 2, WOOD[0])
  }
  // shelf boards (top face + front edge)
  for (const sy of [44, 78, 112]) {
    b.rect(8, sy - 3, 112, 3, WOOD[0])
    b.rect(6, sy, 116, 5, WOOD[1])
    b.rect(6, sy, 116, 1, WOOD[0])
    b.rect(6, sy + 4, 116, 1, WOOD[3])
  }
  b.rect(4, 6, 120, 4, WOOD[2])
  b.rect(4, 6, 120, 1, WOOD[0])
  // top shelf: jars
  jar(b, 16, 41, R.jobGreen)
  jar(b, 30, 41, R.jobGold)
  jar(b, 44, 41, R.jobRed)
  jar(b, 58, 41, R.jobGreen)
  b.rect(80, 30, 28, 11, R.leather[1])
  b.rect(80, 30, 28, 2, R.leather[0])
  b.rect(80, 39, 28, 2, R.leather[3])
  b.rect(92, 33, 4, 4, GOLD[1])
  // middle: cheese
  wheelSmall(b, 14, 75)
  wheelSmall(b, 36, 75)
  b.poly([64, 74, 84, 74, 84, 62], CHEESE[1])
  b.poly([64, 74, 84, 62, 78, 62, 64, 70], CHEESE[0])
  b.rect(64, 72, 20, 2, CHEESE[3])
  b.set(76, 70, CHEESE[3])
  wheelSmall(b, 92, 75)
  // bottom: sacks
  for (const [sx, tone] of [
    [14, 1],
    [42, 0],
    [74, 1],
    [98, 0]
  ] as const) {
    const s = new Raster(128, 128)
    solid(s, [[sx + 12, 98, 13, 12, 14]], [HAY[0], HAY[1], HAY[2], HAY[3]], 0.8, sx)
    s.poly([sx + 6, 90, sx + 10, 82, sx + 13, 88, sx + 16, 82, sx + 19, 90], HAY[tone ? 1 : 2])
    s.rect(sx + 7, 90, 11, 2, R.leather[2])
    outline(s)
    b.blit(s)
  }
  // cobweb in the corner of the top shelf
  for (let i = 0; i < 6; i++) b.line(8, 10, 8 + i * 5, 10 + 6 + i * 2, R.paper[2])
  outline(b)
  return r.blit(b)
}

function cobweb() {
  const r = frame('cobweb')
  const lines = 7
  for (let i = 0; i < lines; i++) {
    const a = (i / (lines - 1)) * (Math.PI / 2)
    r.line(0, 0, Math.cos(a) * 60, Math.sin(a) * 60, R.paper[2])
  }
  for (const rad of [12, 22, 32, 44, 56]) {
    for (let i = 0; i < lines - 1; i++) {
      const a0 = (i / (lines - 1)) * (Math.PI / 2)
      const a1 = ((i + 1) / (lines - 1)) * (Math.PI / 2)
      const mid = (a0 + a1) / 2
      const sag = rad * 0.86
      const x0 = Math.cos(a0) * rad
      const y0 = Math.sin(a0) * rad
      const x1 = Math.cos(a1) * rad
      const y1 = Math.sin(a1) * rad
      const mx = Math.cos(mid) * sag
      const my = Math.sin(mid) * sag
      r.line(x0, y0, mx, my, R.paper[1])
      r.line(mx, my, x1, y1, R.paper[1])
    }
  }
  r.rect(0, 0, 3, 3, R.paper[1])
  for (const [x, y] of [
    [22, 18],
    [39, 12],
    [14, 38],
    [30, 36]
  ])
    r.set(x, y, C.white)
  r.line(24, 17, 34, 34, R.paper[2])
  return r
}

// ------------------------------------------------------------------ sheet

export function sewerSheet(): Sheet {
  theme.shadow = SHADOW
  try {
    return {
      ...commonSheet(),
      crate: mk('crate', [crate()]),
      bigcrate: mk('bigcrate', [bigcrate()]),
      barrel: mk('barrel', [barrel()]),
      barrel_break: mk('barrel_break', [0, 1, 2, 3, 4].map(barrelBreak)),
      cheese: mk('cheese', [cheese()]),
      scale_off: mk('scale_off', [scale(false, 0)]),
      scale_on: mk(
        'scale_on',
        [0, 1, 2, 3].map((f) => scale(true, f))
      ),
      valve_off: mk('valve_off', [valve('valve_off', 0.3, false)]),
      valve_on: mk('valve_on', [valve('valve_on', 0.3 + Math.PI / 2, true)]),
      valve_turn: mk(
        'valve_turn',
        [0, 1, 2, 3, 4, 5].map((i) => valve('valve_turn', 0.3 + (i / 5) * (Math.PI / 2), i === 5, i >= 3 ? i - 2 : 0))
      ),
      sluice_closed: mk('sluice_closed', [sluice(0)]),
      sluice_opening: mk(
        'sluice_opening',
        [10, 22, 34, 46, 56].map((o, i) => sluice(o, i))
      ),
      sluice_open: mk('sluice_open', [sluice(58, 1)]),
      barricade: mk('barricade', [barricade()]),
      barricade_break: mk('barricade_break', [0, 1, 2, 3, 4, 5, 6].map(barricadeBreak)),
      mousetrap_idle: mk('mousetrap_idle', [mousetrap(1.15, 0, false)]),
      mousetrap_snap: mk(
        'mousetrap_snap',
        [1.0, 0.5, 0.1, 0.0].map((a, i) => mousetrap(a, i, true))
      ),
      lamp: mk('lamp', [0, 1, 2, 3].map(lamp)),
      sack: mk('sack', [sack()]),
      grate: mk('grate', [grate()]),
      pipe: mk('pipe', [pipe(0), pipe(1)]),
      haybale: mk('haybale', [haybale()]),
      shelf: mk('shelf', [shelf()]),
      cobweb: mk('cobweb', [cobweb()])
    }
  } finally {
    delete theme.shadow
  }
}
