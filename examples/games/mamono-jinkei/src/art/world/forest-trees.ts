/** Stage 4 scenery: snow-laden pines, a dead tree, the guild banner, the hunters' tent, and the re-tinted common props. */
import { SPEC as FOREST_SPEC } from './forest-kit'
import { C, R } from '../palette'
import { Raster, outline, rng } from '../raster'
import { anim, type Sheet } from '../sheet'
import { mod } from './gfx'
import { IC, IRON, NG, NL, ROPE, SN, ST, WD, drift, frame, mk, shade, snowCap } from './forest-kit'
import * as pp from './pp'
import { featSheet } from './props-feat'
import { natureSheet } from './props-nature'
import { ruinsSheet } from './props-ruins'

// ------------------------------------------------------------------ pine

interface Tier {
  top: number
  bot: number
  hw: number
}
const TIERS: Tier[] = [
  { top: 10, bot: 46, hw: 20 },
  { top: 32, bot: 72, hw: 30 },
  { top: 58, bot: 100, hw: 40 },
  { top: 84, bot: 128, hw: 50 },
  { top: 108, bot: 150, hw: 58 }
]

function tier(r: Raster, cx: number, t: Tier, seed: number) {
  const hgt = t.bot - t.top
  for (let y = t.top; y <= t.bot; y++) {
    const u = (y - t.top) / hgt
    const hw = t.hw * (0.1 + 0.9 * Math.pow(u, 0.88))
    for (let x = Math.ceil(cx - hw); x <= Math.floor(cx + hw); x++) {
      const dx = x - cx
      const e = Math.abs(dx) / t.hw
      const s = Math.abs(mod(x - cx + 99, 15) - 7.5) / 7.5
      const yb = t.bot - 6 * s - Math.pow(e, 3) * 9
      if (y > yb) continue
      const rel = (yb - y) / 6
      let c: number
      const snowT = 0.34 + 0.1 * Math.sin(dx * 0.33 + seed) + 0.08 * Math.sin(dx * 0.9 + seed * 2)
      if (rel < 1 && rel >= 0) c = NL[4]
      else if (u < snowT) {
        c = SN[1]
        if (dx > hw * 0.3 || (dx > 0 && u > snowT - 0.07)) c = SN[2]
        else if (dx < -hw * 0.15 && u < snowT * 0.65) c = SN[0]
        if (u > snowT - 0.035 && dx > 0) c = SN[3]
      } else {
        c = NL[1]
        if (dx > hw * 0.2) c = NL[2]
        if ((x + y * 2 + seed) % 9 === 0 && dx < 0 && (y & 1) === 0) c = NL[0]
        else if ((x * 2 + y + seed) % 11 === 0 && (y & 1) === 1) c = c === NL[1] ? NL[2] : c
        if (rel < 2.6) c = NL[3]
        else if (rel < 3.4 && dx > 0) c = NL[2] === c ? NL[3] : c
      }
      r.set(x, y, c)
    }
  }
}

function pine(f: number) {
  const r = frame('pine')
  shade(r, 66, 161, 40, 7)
  const b = new Raster(128, 192)
  // trunk with a lit left side and a snow-dusted root flare
  for (let y = 120; y <= 162; y++) {
    const w = 6 + (y > 154 ? (y - 154) * 0.6 : 0)
    for (let x = Math.floor(64 - w); x < Math.ceil(64 + w); x++) {
      const u = (x + 0.5 - 64) / w
      b.set(x, y, u < -0.45 ? WD[1] : u < 0.2 ? WD[2] : WD[3])
    }
  }
  for (let y = 126; y < 156; y += 5) b.set(61 + (y % 3), y, WD[3])
  b.rect(52, 161, 26, 2, WD[3])
  TIERS.forEach((t, i) => {
    const sway = f === 1 ? Math.round(((4 - i) / 4) * 1.4) : 0
    tier(b, 64 + sway, t, i * 3)
  })
  // the topmost tip and snow on it
  const tipX = f === 1 ? 65 : 64
  b.rect(tipX - 1, 4, 3, 8, NL[1])
  b.rect(tipX - 1, 4, 3, 3, SN[1])
  b.set(tipX, 3, SN[0])
  outline(b)
  r.blit(b)
  // fallen snow at the foot, over the trunk base
  const d = new Raster(128, 192)
  drift(d, 52, 161, 14, 3.6)
  drift(d, 80, 162, 12, 3.2)
  outline(d)
  r.blit(d)
  return r
}

// ------------------------------------------------------------------ dead tree

function limb(b: Raster, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    const w = w0 + (w1 - w0) * t
    b.ellipse(x, y, w / 2, w / 2, WD[3])
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    const w = w0 + (w1 - w0) * t
    if (w < 2.5) continue
    b.ellipse(x - w * 0.18, y, w * 0.28, w * 0.4, WD[2])
    if (w > 5) b.ellipse(x - w * 0.28, y, w * 0.1, w * 0.3, WD[1])
  }
}

function deadtree() {
  const r = frame('deadtree')
  shade(r, 66, 161, 30, 6)
  const b = new Raster(128, 192)
  // trunk and root flare
  limb(b, 64, 160, 62, 118, 20, 15)
  limb(b, 62, 118, 64, 70, 15, 8)
  for (const [x, dx] of [
    [54, -9],
    [74, 10],
    [62, -3]
  ] as const)
    limb(b, 64, 150, x + dx, 163, 7, 3)
  // main limbs and twigs
  limb(b, 62, 120, 32, 92, 8, 4)
  limb(b, 32, 92, 14, 84, 4, 1.4)
  limb(b, 40, 98, 30, 68, 4, 1.6)
  limb(b, 64, 100, 94, 74, 8, 3.4)
  limb(b, 94, 74, 112, 70, 3.4, 1.2)
  limb(b, 96, 76, 106, 52, 3, 1.2)
  limb(b, 64, 76, 46, 40, 6, 2)
  limb(b, 46, 40, 40, 20, 2.4, 1)
  limb(b, 52, 46, 68, 22, 3, 1.2)
  limb(b, 64, 72, 80, 36, 5, 1.6)
  limb(b, 80, 36, 88, 18, 2.2, 1)
  limb(b, 70, 124, 98, 112, 5, 2)
  limb(b, 98, 112, 114, 118, 2.2, 1)
  limb(b, 90, 82, 82, 58, 2.6, 1)
  // a knot hole and bark scars
  b.ellipse(62, 138, 3.4, 5, NG[4])
  b.ellipse(61, 137, 2.2, 3.6, NG[3])
  for (const [x, y] of [
    [68, 128],
    [58, 150],
    [66, 100]
  ] as const)
    b.line(x, y, x - 1, y + 7, WD[3])
  outline(b)
  snowCap(b, 9, 2, 0.75)
  r.blit(b)
  const d = new Raster(128, 192)
  // a snow hump around the foot, so the tree reads as frozen in even where it stands on bare ice
  drift(d, 64, 164, 26, 5.5)
  drift(d, 44, 163, 13, 3.4)
  drift(d, 85, 164, 11, 3)
  outline(d)
  r.blit(d)
  return r
}

// ------------------------------------------------------------------ banner

function banner(f: number) {
  const r = frame('banner')
  shade(r, 33, 121, 12, 3)
  const b = new Raster(64, 128)
  // stone footing, iron-shod pole, cross bar and finial
  pp.box(b, 20, 110, 24, 5, 8, [ST[0], ST[1], ST[2], NG[0]])
  for (let y = 10; y < 112; y++) {
    b.set(30, y, ST[0])
    b.rect(31, y, 2, 1, ST[1])
    b.set(33, y, ST[2])
  }
  b.rect(8, 12, 48, 3, WD[1])
  b.rect(8, 12, 48, 1, WD[0])
  b.rect(8, 14, 48, 1, WD[3])
  b.ellipse(7, 13.5, 2.4, 2.4, WD[2])
  b.ellipse(57, 13.5, 2.4, 2.4, WD[2])
  b.poly([31, 3, 35, 9, 31, 9, 28, 9], C.glow)
  b.poly([30, 4, 33, 8, 28, 8], R.gold[1])
  b.set(30, 5, R.gold[0])
  // the cloth: a swallow-tailed navy banner with a silver rim and a gold star, rippling in the wind
  const top = 15
  const bot = 82
  const phase = (f * Math.PI) / 2
  for (let y = top; y < bot; y++) {
    const u = (y - top) / (bot - top)
    const off = Math.sin(u * 5.2 + phase) * 4 * u
    const slope = Math.cos(u * 5.2 + phase)
    const tail = u > 0.82 ? 1 - Math.abs(0.5 - ((u - 0.82) / 0.18) * 0.5 - 0.0) * 0 : 1
    const cut = u > 0.8 ? ((u - 0.8) / 0.2) * 12 : 0
    for (let x = 14; x < 50; x++) {
      const dx = x - 32
      const edge = Math.abs(dx)
      // swallow-tail notch: removes the middle of the lowest part
      if (u > 0.8 && edge < cut * 0.9) continue
      const cx = x + Math.round(off)
      const side = dx < -14 || dx > 14 || y < top + 3
      let c: number = R.clothNavy[1]
      // fold shading follows the ripple
      if (dx < -4 && slope > 0.1) c = R.clothNavy[0]
      else if (dx > 6 && slope < 0.2) c = R.clothNavy[2]
      else if (Math.abs(slope) > 0.8 && dx > 0) c = R.clothNavy[2]
      if (dx < -14 || dx > 14 || y === top || y === top + 1) c = ST[1]
      if (edge > 15 || (u > 0.9 && edge < cut + 2.5 && edge >= cut * 0.9)) c = ST[2]
      void side
      void tail
      b.set(cx, y, c)
    }
  }
  // emblem: gold star and a pale moon on the cloth
  const eo = (u: number) => Math.round(Math.sin(u * 5.2 + phase) * 4 * u)
  const starY = 38
  const sx = 32 + eo((starY - top) / (bot - top))
  for (const [dx, dy] of [
    [0, -6],
    [0, -5],
    [-1, -3],
    [0, -3],
    [1, -3],
    [-5, -1],
    [-4, -1],
    [-3, -1],
    [-2, -1],
    [-1, -1],
    [0, -1],
    [1, -1],
    [2, -1],
    [3, -1],
    [4, -1],
    [5, -1],
    [-3, 1],
    [-2, 1],
    [-1, 1],
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
    [-2, 3],
    [-1, 3],
    [1, 3],
    [2, 3],
    [-3, 5],
    [3, 5]
  ] as const)
    b.set(sx + dx, starY + dy, R.gold[1])
  for (const [dx, dy] of [
    [0, -5],
    [-1, -3],
    [-4, -1],
    [-3, -1]
  ] as const)
    b.set(sx + dx, starY + dy, R.gold[0])
  for (const [dx, dy] of [
    [3, 3],
    [2, 1],
    [4, -1]
  ] as const)
    b.set(sx + dx, starY + dy, R.gold[2])
  const mx = 32 + eo(0.7)
  b.ellipse(mx, 62, 5, 5, C.glow)
  b.ellipse(mx + 2.5, 61, 4.5, 4.5, R.clothNavy[1])
  outline(b)
  r.blit(b)
  return r
}

// ------------------------------------------------------------------ hunters' tent

function tent() {
  const r = frame('tent')
  shade(r, 66, 110, 56, 8)
  const b = new Raster(128, 128)
  const canvas = R.clothForest
  // right-hand roof plane in shade, front gable in light
  b.poly([64, 20, 112, 96, 100, 74], canvas[2])
  b.poly([64, 20, 100, 74, 76, 74], canvas[2])
  b.poly([64, 20, 16, 104, 114, 104], canvas[1])
  b.poly([64, 20, 16, 104, 40, 104], canvas[0])
  b.poly([64, 20, 112, 104, 114, 104], canvas[2])
  // canvas seams and stitching
  for (const x of [44, 84]) b.line(64, 22, x, 103, canvas[2])
  b.line(64, 22, 28, 103, canvas[0])
  // leather door frame, dark interior and tied-back flaps
  b.poly([64, 52, 82, 104, 46, 104], R.leather[3])
  b.poly([64, 56, 78, 103, 50, 103], C.black)
  b.poly([64, 52, 54, 104, 40, 104], R.leather[1])
  b.poly([64, 52, 74, 104, 88, 104], R.leather[2])
  b.poly([61, 60, 54, 103, 50, 103], R.leather[0])
  b.rect(46, 103, 38, 2, R.leather[3])
  for (const y of [70, 84, 96]) {
    b.set(44 + (104 - y) * 0.1, y, ROPE[1])
    b.set(84 - (104 - y) * 0.1, y, ROPE[2])
  }
  // the ridge pole pokes out of the top with a little pennant
  b.rect(63, 8, 2, 14, WD[2])
  b.rect(63, 8, 1, 14, WD[1])
  b.poly([65, 8, 76, 11, 65, 14], R.clothCrimson[1])
  b.poly([65, 8, 76, 11, 70, 10], R.clothCrimson[0])
  // hem
  b.rect(16, 104, 98, 2, canvas[3])
  // snow along the ridge and the hem
  for (let y = 20; y < 104; y++) {
    const wL = 64 - ((y - 20) * 48) / 84
    const t = Math.max(0, 5 - (y - 20) * 0.06)
    for (let k = 0; k < t; k++) b.set(Math.round(wL) + 1 + k, y, SN[k === 0 ? 0 : 1])
    b.set(Math.round(wL) + Math.ceil(t) + 1, y, SN[2])
  }
  for (let x = 12; x < 118; x++) if (Math.sin(x * 0.5) > -0.2) b.set(x, 105, SN[1])
  outline(b)
  r.blit(b)
  // guy ropes, pegs and drifted snow at the corners
  const g = new Raster(128, 128)
  g.line(18, 100, 6, 108, ROPE[2])
  g.line(112, 100, 124, 108, ROPE[2])
  g.set(6, 108, WD[3])
  g.set(124, 108, WD[3])
  drift(g, 22, 106, 14, 3.6)
  drift(g, 106, 107, 14, 3.4)
  drift(g, 64, 110, 18, 3.4)
  outline(g)
  r.blit(g)
  return r
}

// ------------------------------------------------------------------ common props, re-tinted

const COMMON = [
  'block',
  'pot',
  'pot_break',
  'rock',
  'plate_off',
  'plate_on',
  'plate2_off',
  'plate2_on',
  'crystal_off',
  'crystal_on',
  'crystal_hit',
  'lever_off',
  'lever_on',
  'lever_pull',
  'gate_closed',
  'gate_opening',
  'gate_open',
  'bossdoor_closed',
  'bossdoor_opening',
  'bossdoor_open',
  'sign',
  'chest_closed',
  'chest_opening',
  'chest_open',
  'torch',
  'altar'
]

/** Meadow stone becomes silver fortress stone, moss becomes snow, warm rock turns cold. */
const RECOLOUR = (() => {
  const t = new Map<number, number>()
  for (let i = 0; i < 4; i++) {
    t.set(R.stone[i], ST[i])
    t.set(R.grassDark[i], SN[i])
    t.set(R.grass[i], SN[i])
    t.set(R.rock[i], [ST[1], ST[2], NG[0], NG[1]][i])
  }
  t.set(R.stone[4], ST[4])
  return t
})()

function commonSheet(): Sheet {
  const prev = pp.theme.shadow
  pp.theme.shadow = [NG[3], NG[2]]
  let src: Sheet
  try {
    src = { ...natureSheet(), ...ruinsSheet(), ...featSheet() }
  } finally {
    pp.theme.shadow = prev
  }
  const out: Sheet = {}
  for (const name of COMMON) {
    const a = src[name]
    if (!a) continue
    const spec = FOREST_SPEC[name]
    const frames = a.frames.map((fr) => fr.clone().map((c) => RECOLOUR.get(c) ?? c))
    out[name] = anim(frames, spec.fps, spec.loop, { ...a, frames })
  }
  return out
}

export const forestScenery = (): Sheet => ({
  pine: mk('pine', [pine(0), pine(1)]),
  deadtree: mk('deadtree', [deadtree()]),
  banner: mk('banner', [0, 1, 2, 3].map(banner)),
  tent: mk('tent', [tent()]),
  ...commonSheet()
})

void IC
void IRON
void NL
void snowCap
void rng
