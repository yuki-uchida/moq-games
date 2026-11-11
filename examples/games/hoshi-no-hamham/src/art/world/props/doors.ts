/**
 * Switches, doors, the boss gate, the goal flag, the nest and ハム姫's cage.
 *
 * Switch 1 / door 1 are the SUN pair (orange, a disc with rays); switch 2 / door 2 are the MOON pair (blue, a
 * crescent). Colour is never the only cue: the emblem, the gem cut and the plank material differ too.
 * Everything is drawn from pure functions of (state, frame), so the loops close and the cells tile.
 */
import type { SheetModule } from '../../module'
import { C, R, color, ramp, rgbOf, type Ramp } from '../../palette'
import { Painter, Raster, ball, bar, outline, rng, shadeEdges, shadeIndex } from '../../raster'
import { anim } from '../../sheet'

/** Cell props sit on the top-left of their map cell. */
const ORIGIN = { anchor: [0, 0] } as const

const STEEL = R.steel
const STONE = R.stone
const GOLD = R.gold
const DARK = R.dark

// ------------------------------------------------------------------------------------------------ colours

const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** A ramp pulled toward a grey-violet: the "asleep" version of a material. */
function mute(r: Ramp, k: number, grey: [number, number, number] = [112, 100, 128]): Ramp {
  const m = (c: number) => {
    const [a, b, d] = rgbOf(c)
    return toHex([a + (grey[0] - a) * k, b + (grey[1] - b) * k, d + (grey[2] - d) * k])
  }
  return ramp(m(r[0]), m(r[1]), m(r[2]), m(r[3]), m(r[4]))
}

const SUN_DIM = mute(R.sun, 0.42)
const MOON_DIM = mute(R.moon, 0.42)
/** Slate-blue planks for the moon door (the sun door uses warm wood). */
const SLATE = ramp('#8fa0cc', '#5f6ea6', '#434f82', '#2c3560', '#121b36')
const GOLD_DIM = mute(R.gold, 0.5)
const WOOD_DIM = mute(R.wood, 0.45)
const FLAG_PINK = R.princessPink
const FLAG_DIM = mute(R.princessPink, 0.6)
const STEEL_DIM = mute(R.steel, 0.35)
const STONE_DARK = ramp('#9a88c0', '#6a5a8c', '#4a3f68', '#2f2848', '#1c1830')

// -------------------------------------------------------------------------------------------------- emblems

/** Sun: a ball with eight short rays. (cx, cy) is the centre, r the disc radius. */
function sunEmblem(l: Raster, cx: number, cy: number, r: number, rp: Ramp) {
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    const d1 = r + 1.3
    const d2 = r + (i % 2 ? 1.8 : 2.4)
    l.line(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1, cx + Math.cos(a) * d2, cy + Math.sin(a) * d2, rp[1])
  }
  ball(l, cx, cy, r, r, rp)
}

/** Moon: a crescent whose horns point right, with a small star in its bay. */
function moonEmblem(l: Raster, cx: number, cy: number, r: number, rp: Ramp) {
  const bx = cx + r * 0.55
  const by = cy - r * 0.15
  const br = r * 0.85
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const nx = (x + 0.5 - cx) / r
      const ny = (y + 0.5 - cy) / r
      if (nx * nx + ny * ny > 1.0001) continue
      if (Math.hypot(x + 0.5 - bx, y + 0.5 - by) < br) continue
      // distance to the bay decides the shade: the rim next to the bay is the lit inner edge
      const nz = Math.sqrt(Math.max(0, 1 - (nx * nx + ny * ny)))
      l.set(x, y, rp[shadeIndex(nx, ny, nz * 0.9)])
    }
  const sx = Math.round(cx + r * 0.62)
  const sy = Math.round(cy - r * 0.1)
  l.set(sx, sy, rp[0])
  l.set(sx - 1, sy, rp[1])
  l.set(sx + 1, sy, rp[1])
  l.set(sx, sy - 1, rp[1])
  l.set(sx, sy + 1, rp[1])
}

// ----------------------------------------------------------------------------------------------- switches

type Kind = 1 | 2
const KIND = {
  1: { rp: R.sun, dim: SUN_DIM, field: C.inkWarm },
  2: { rp: R.moon, dim: MOON_DIM, field: C.inkBlue }
} as const

/** The stone base with its medallion; identical in every frame. */
const baseCache = new Map<Kind, Raster>()
function switchBase(kind: Kind): Raster {
  const hit = baseCache.get(kind)
  if (hit) return hit
  const k = KIND[kind]
  const g = new Painter(64, 64)
  g.add(0, (l) => {
    // a plinth, a post and a capstone: the emblem gets the whole face of the post
    l.rect(11, 56, 42, 7, STONE[1])
    l.rect(23, 38, 18, 19, STONE[1])
    l.rect(21, 33, 22, 6, STONE[1])
    shadeEdges(l, STONE, 1, true)
    for (let x = 11; x < 53; x++) l.paint(x, 56, STONE[0])
    for (let x = 11; x < 53; x++) l.paint(x, 57, STONE[1])
    for (let x = 23; x < 41; x++) l.paint(x, 57, STONE[2])
    for (let x = 21; x < 43; x++) l.paint(x, 38, STONE[2])
    for (let x = 21; x < 43; x++) l.paint(x, 33, STONE[0])
    for (const x of [24, 36]) for (let y = 59; y < 62; y++) l.paint(x, y, STONE[2])
    for (const x of [18, 47]) for (let y = 58; y < 62; y++) l.paint(x, y, STONE[2])
    // the slot the lever pivots in
    l.ellipse(32, 35, 6, 1.8, STONE[3])
    l.ellipse(32, 34.6, 5, 1.2, C.inkCool)
  })
  // medallion carrying the emblem
  g.add(
    1,
    (l) => {
      l.ellipse(32, 47, 8, 8, k.rp[3])
      l.ellipse(31.7, 46.7, 7.4, 7.4, k.rp[1])
      l.ellipse(32.3, 47.3, 6.8, 6.8, k.rp[2])
      l.ellipse(32, 47, 6.6, 6.6, k.field)
      if (kind === 1) sunEmblem(l, 32, 47, 3.1, k.rp)
      else moonEmblem(l, 31, 47, 4.8, k.rp)
    },
    false
  )
  const out = g.render()
  baseCache.set(kind, out)
  return out
}

const PIVOT: [number, number] = [32, 34]

/** One gem; the sun gem is a round ball, the moon gem a cut diamond, so the shapes differ as well as the hue. */
function gem(l: Raster, kind: Kind, cx: number, cy: number, rp: Ramp, lit: number) {
  if (kind === 1) {
    ball(l, cx, cy, 6.5, 6.5, rp)
    if (lit > 0) l.rect(Math.round(cx - 2), Math.round(cy - 2), 2, 2, rp[0])
  } else {
    for (let y = -9; y <= 9; y++)
      for (let x = -7; x <= 7; x++) {
        if (Math.abs(x + 0.5) / 7 + Math.abs(y + 0.5) / 9 > 1) continue
        const left = x < 0
        const top = y < 0
        const edge = Math.abs(x + 0.5) / 7 + Math.abs(y + 0.5) / 9 > 0.78
        let step = left && top ? 0 : left || top ? 1 : 2
        if (!left && !top && edge) step = 3
        if (!left && top && edge) step = 2
        l.set(cx + x, cy + y, rp[step])
      }
    // table facet
    l.rect(Math.round(cx - 1), Math.round(cy - 4), 2, 2, rp[0])
    l.set(Math.round(cx), Math.round(cy), rp[1])
  }
}

function drawSwitch(kind: Kind, angleDeg: number, lit: number, glint: number): Raster {
  const k = KIND[kind]
  const rp = lit > 0 ? k.rp : k.dim
  const out = switchBase(kind).clone()
  const a = (angleDeg * Math.PI) / 180
  const len = 21
  const tip: [number, number] = [PIVOT[0] + Math.sin(a) * len, PIVOT[1] - Math.cos(a) * len]
  // lever rod
  const rod = new Raster(64, 64)
  bar(rod, PIVOT, tip, 4, STEEL[1])
  shadeEdges(rod, STEEL, 1, true)
  outline(rod)
  out.blit(rod)
  // the gem sits on the rod end
  const gl = new Raster(64, 64)
  const gx = Math.round(tip[0])
  const gy = Math.round(tip[1] - 2)
  gem(gl, kind, gx, gy, rp, lit)
  outline(gl)
  out.blit(gl)
  // pivot cap in front of the rod
  const cap = new Raster(64, 64)
  ball(cap, PIVOT[0], PIVOT[1] + 1, 4.5, 4, STEEL)
  cap.rect(PIVOT[0] - 1, PIVOT[1], 2, 2, GOLD[1])
  outline(cap)
  out.blit(cap)
  // lit gems throw sparks; dim ones only glint now and then
  if (lit > 0) {
    const r = 9 + (lit % 2)
    for (let i = 0; i < 4; i++) {
      const t = (i * Math.PI) / 2 + Math.PI / 4 + lit * 0.45
      out.set(gx + Math.cos(t) * r, gy + Math.sin(t) * r, C.glow)
    }
    if (lit > 1) {
      out.rect(gx + 4, gy - 8, 1, 3, C.white)
      out.rect(gx + 3, gy - 7, 3, 1, C.white)
    }
  } else if (glint) {
    const sx = gx - 2
    const sy = gy - 3
    out.set(sx, sy, C.white)
    out.set(sx - 1, sy, rp[0])
    out.set(sx + 1, sy, rp[0])
    out.set(sx, sy - 1, rp[0])
    out.set(sx, sy + 1, rp[0])
  }
  return out
}

function switchSheet(kind: Kind) {
  return () => ({
    off: anim([drawSwitch(kind, -36, 0, 0), drawSwitch(kind, -35, 0, 1)], 3, true, ORIGIN),
    flip: anim([drawSwitch(kind, -8, 1, 0), drawSwitch(kind, 24, 2, 0), drawSwitch(kind, 46, 2, 0)], 16, false, ORIGIN),
    on: anim([drawSwitch(kind, 36, 1, 0), drawSwitch(kind, 35, 2, 0)], 3, true, ORIGIN)
  })
}

// -------------------------------------------------------------------------------------------------- doors

interface DoorKind {
  emblem: 'sun' | 'moon'
  bands: Ramp
  planks: Ramp
  field: number
}
const DOORS: Record<Kind, DoorKind> = {
  1: { emblem: 'sun', bands: R.sun, planks: R.wood, field: C.inkWarm },
  2: { emblem: 'moon', bands: R.moon, planks: SLATE, field: C.inkBlue }
}

const BAND_ROWS = [12, 44]

/** Grain streaks: fixed per door, inside rows 4..58 so the rows at the cell edges stay plain (seamless tiling). */
const GRAIN = (() => {
  const rand = rng(77)
  const out: { x: number; y: number; h: number; hi: boolean }[] = []
  for (let i = 0; i < 26; i++) {
    const plank = Math.floor(rand() * 3)
    const x = 5 + plank * 18 + 3 + Math.floor(rand() * 10)
    const y = 4 + Math.floor(rand() * 48)
    out.push({ x, y, h: 3 + Math.floor(rand() * 5), hi: rand() < 0.35 })
  }
  return out
})()

/** The painted colour of the door body at (x, y), or 0 outside the body. Depends on the row only through y. */
function bodyPixel(x: number, y: number, d: DoorKind): number {
  if (x < 1 || x > 62) return 0
  const P = d.planks
  const B = d.bands
  if (x === 1 || x === 62) return C.inkCool
  // iron posts, riveted
  if (x <= 4) return x === 2 ? STEEL[0] : x === 3 ? (y % 16 === 8 ? STEEL[0] : STEEL[1]) : STEEL[2]
  if (x >= 59) return x === 59 ? STEEL[1] : x === 60 ? (y % 16 === 8 ? STEEL[1] : STEEL[2]) : STEEL[3]
  // bands first
  for (const b of BAND_ROWS) {
    const k = y - b
    if (k >= 0 && k <= 7) {
      if (k === 0) return B[0]
      if (k <= 5) {
        // rivets at the plank centres
        const rx = [14, 32, 50].find((c) => x === c || x === c + 1)
        if (rx !== undefined && (k === 3 || k === 4)) {
          const right = x === rx + 1
          return k === 3 ? (right ? B[1] : B[0]) : right ? B[3] : B[2]
        }
        return B[1]
      }
      return k === 6 ? B[2] : B[3]
    }
    if (y === b + 8) return P[3] // shadow under the band
  }
  const u = (x - 5) % 18
  let c = u === 0 ? P[0] : u >= 17 ? P[3] : u >= 15 ? P[2] : P[1]
  for (const g of GRAIN)
    if (g.x === x && y >= g.y && y < g.y + g.h && u > 1 && u < 15) {
      c = g.hi ? P[0] : P[2]
      break
    }
  return c
}

function paintBody(r: Raster, d: DoorKind, y0: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = 1; x <= 62; x++) r.set(x, y, bodyPixel(x, y, d))
}

function doorMid(kind: Kind): Raster {
  const r = new Raster(64, 64)
  paintBody(r, DOORS[kind], 0, 63)
  return r
}

function doorTop(kind: Kind): Raster {
  const d = DOORS[kind]
  const r = new Raster(64, 64)
  paintBody(r, d, 1, 63)
  // chamfer the top corners
  for (const [x, y] of [
    [1, 1],
    [2, 1],
    [1, 2],
    [62, 1],
    [61, 1],
    [62, 2]
  ])
    r.set(x, y, 0)
  // lintel: a steel slab with a bright lip, a shade under it and the emblem's band colour as trim
  for (let y = 1; y <= 30; y++)
    for (let x = 1; x <= 62; x++) {
      if (!r.get(x, y)) continue
      let c: number = STEEL[1]
      if (y <= 2) c = STEEL[0]
      else if (y >= 29) c = y === 29 ? STEEL[3] : C.inkCool
      else if (y >= 26) c = y === 26 ? d.bands[0] : y === 28 ? d.bands[3] : d.bands[1]
      else if (y >= 23) c = STEEL[2]
      else if (x >= 58) c = STEEL[2]
      if (x === 1 || x === 62) c = C.inkCool
      r.set(x, y, c)
    }
  // shadow the lintel casts on the planks
  for (let x = 5; x <= 58; x++) r.set(x, 31, bodyPixel(x, 31, d) === d.planks[1] ? d.planks[2] : bodyPixel(x, 31, d))
  for (const x of [5, 58]) {
    r.rect(x, 8, 2, 2, STEEL[0])
    r.set(x + 1, 9, STEEL[3])
  }
  // medallion: a shaded ring in the door's colour, a dark field, the emblem lit inside
  const cx = 32
  const cy = 13
  const mr = 11.5
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 64; x++) {
      const nx = (x + 0.5 - cx) / mr
      const ny = (y + 0.5 - cy) / mr
      const dd = Math.hypot(nx, ny) * mr
      if (dd > mr) continue
      if (dd > mr - 1) r.set(x, y, d.bands[4])
      else if (dd > 8)
        r.set(x, y, d.bands[shadeIndex(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.8, true)])
      else if (dd > 7.4) r.set(x, y, d.bands[3])
      else r.set(x, y, d.field)
    }
  if (d.emblem === 'sun') sunEmblem(r, cx, cy, 3.8, d.bands)
  else moonEmblem(r, cx - 1, cy, 5.4, d.bands)
  return r
}

function doorBottom(kind: Kind): Raster {
  const d = DOORS[kind]
  const r = new Raster(64, 64)
  paintBody(r, d, 0, 63)
  // dust and damp against the threshold: planks end in a dark joint
  for (let y = 53; y <= 63; y++)
    for (let x = 1; x <= 62; x++) {
      let c: number = STEEL[1]
      if (y === 53) c = C.inkCool
      else if (y === 54) c = STEEL[0]
      else if (y >= 61) c = y === 61 ? STEEL[2] : y === 62 ? STEEL[3] : C.inkCool
      else if (y >= 59) c = STEEL[2]
      if ((x === 21 || x === 42) && y > 54 && y < 61) c = STEEL[2]
      if (x === 1 || x === 62) c = C.inkCool
      r.set(x, y, c)
    }
  // the threshold plate in the door's own colour
  for (let x = 9; x <= 54; x++) {
    r.set(x, 56, d.bands[0])
    r.set(x, 57, d.bands[1])
    r.set(x, 58, d.bands[2])
  }
  for (const x of [10, 53]) r.rect(x, 56, 2, 3, d.bands[3])
  r.set(32, 56, d.bands[0])
  return r
}

function doorSheet(kind: Kind) {
  return () => ({
    top: anim([doorTop(kind)], 1, false, ORIGIN),
    mid: anim([doorMid(kind)], 1, false, ORIGIN),
    bottom: anim([doorBottom(kind)], 1, false, ORIGIN)
  })
}

// ---------------------------------------------------------------------------------------------- boss gate

const tri = (y: number) => {
  const t = ((y + 0.5) % 32) / 32
  return 1 - Math.abs(1 - 2 * t)
}
/** Centre x of the two crossing bars on a row (period 32, mirror-symmetric about the tile border). */
const barX = (y: number, second: boolean) => 32 + (second ? -1 : 1) * (tri(y) - 0.5) * 26

const BAR_TONES = [DARK[4], DARK[0], DARK[1], DARK[1], DARK[1], DARK[2], DARK[2], DARK[3], DARK[4]]
const BAR_W = BAR_TONES.length

/** One braided pillar: two strands of energy winding around each other (period 8, mirror-symmetric rows). */
function pillar(r: Raster, px: number, y0: number, y1: number, f: number) {
  for (let y = y0; y <= y1; y++) {
    const a = Math.cos(((y + 0.5) * Math.PI) / 4)
    const front = a > 0
    const xa = Math.round(a * 1.6)
    for (let i = 0; i < 8; i++) r.set(px + i, y, DARK[4])
    for (let i = 1; i < 7; i++) r.set(px + i, y, DARK[3])
    // back strand then front strand
    for (const [x, ahead] of [
      [3.5 - xa, !front],
      [3.5 + xa, front]
    ] as const) {
      const c = Math.round(x)
      const tone = ahead ? [DARK[4], DARK[0], DARK[1], DARK[2]] : [DARK[4], DARK[2], DARK[2], DARK[3]]
      for (let i = 0; i < 4; i++) r.set(px + c - 1 + i, y, tone[i])
    }
    if (y > 2 && y < 61 && ((y >> 2) + f) % 4 === 0) r.set(px + 3 + Math.round(xa * (front ? 1 : -1) * 0.5), y, C.glow)
  }
}

function gateFrame(part: 'top' | 'mid' | 'bottom', f: number): Raster {
  const r = new Raster(64, 64)
  const y0 = part === 'top' ? 26 : 0
  const y1 = part === 'bottom' ? 50 : 63
  pillar(r, 2, part === 'top' ? 12 : 0, part === 'bottom' ? 55 : 63, f)
  pillar(r, 54, part === 'top' ? 12 : 0, part === 'bottom' ? 55 : 63, f + 2)
  // thorny bars; B first so A crosses over it
  for (const second of [true, false])
    for (let y = y0; y <= y1; y++) {
      const cx = Math.round(barX(y, second))
      for (let i = 0; i < BAR_W; i++) r.set(cx - 4 + i, y, BAR_TONES[i])
      // the lit core travels along the bars; the border rows stay plain
      if (y > 2 && y < 61 && ((y >> 2) + f + (second ? 2 : 0)) % 4 === 0) {
        r.set(cx - 2, y, DARK[0])
        r.set(cx - 1, y, DARK[0])
      }
    }
  // thorns: long spikes shooting out of the bends, outward and a little up
  for (const [ty, second, side] of [
    [16, false, 1],
    [16, true, -1],
    [32, false, -1],
    [32, true, 1],
    [48, false, 1],
    [48, true, -1]
  ] as const) {
    if (ty < y0 + 4 || ty > y1 - 4) continue
    const bx = Math.round(barX(ty, second)) + side * 4
    const tipX = bx + side * 8
    r.poly([bx, ty - 3, bx, ty + 3, tipX, ty - 2 + (f % 2)], DARK[2])
    r.poly([bx, ty - 2, bx, ty, tipX - side * 1, ty - 2 + (f % 2)], DARK[1])
    r.line(bx, ty - 3, tipX, ty - 2 + (f % 2), DARK[4])
    r.line(bx, ty + 3, tipX, ty - 1 + (f % 2), DARK[4])
  }
  // gold sparks running along the bars
  for (const second of [false, true])
    for (let k = 0; k < 4; k++) {
      const sy = (second ? 10 : 2) + 4 * f + 16 * k
      if (sy < Math.max(2, y0 + 1) || sy > Math.min(61, y1 - 1)) continue
      const sx = Math.round(barX(sy, second))
      r.set(sx, sy, C.glow)
      r.set(sx - 1, sy, GOLD[1])
      r.set(sx + 1, sy, GOLD[1])
      r.set(sx, sy - 1, GOLD[1])
      r.set(sx, sy + 1, GOLD[1])
    }
  // crest of the top piece: horns grow from the pillars around a floating crystal
  if (part === 'top') {
    for (const [px, dir] of [
      [3, 1],
      [53, -1]
    ] as const) {
      for (let i = 0; i < 12; i++) {
        const y = 12 - i
        const w = Math.max(1, 5 - Math.floor(i / 2.5))
        const x0 = px + (dir === 1 ? 0 : 5 - w + 1) + dir * Math.floor(i * i * 0.05)
        for (let j = 0; j < w; j++)
          r.set(x0 + j, y, j === 0 ? DARK[4] : j === w - 1 ? DARK[4] : DARK[1 + (i < 5 ? 0 : 1)])
      }
    }
    const cy = 12 + [0, -1, -1, 0][f]
    for (let y = -9; y <= 9; y++)
      for (let x = -6; x <= 6; x++) {
        const q = Math.abs(x + 0.5) / 6 + Math.abs(y + 0.5) / 9
        if (q > 1) continue
        const edge = q > 0.8
        const left = x < 0
        const top = y < 0
        r.set(32 + x, cy + y, edge ? DARK[4] : left && top ? DARK[0] : left || top ? DARK[1] : DARK[2])
      }
    r.rect(31, cy - 3, 2, 3, f % 2 ? C.white : C.glow)
    r.set(32, cy + 2, GOLD[1])
    // beams from the crystal into the lattice
    for (let y = 22; y < 26; y++) r.set(32, y, y % 2 ? GOLD[1] : DARK[0])
    r.rect(31, 23, 1, 1, GOLD[0])
  }
  // footing of the bottom piece: obsidian slab with a glowing rune
  if (part === 'bottom') {
    for (let y = 54; y <= 63; y++)
      for (let x = 1; x <= 62; x++) {
        if (y === 54 && (x < 4 || x > 59)) continue
        const c =
          y === 54
            ? STONE_DARK[0]
            : y < 60
              ? STONE_DARK[1]
              : y === 60
                ? STONE_DARK[2]
                : y === 63
                  ? C.inkCool
                  : STONE_DARK[3]
        r.set(x, y, x === 1 || x === 62 ? C.inkCool : c)
      }
    for (const x of [21, 42]) for (let y = 55; y < 60; y++) r.set(x, y, STONE_DARK[2])
    const pulse = [GOLD[2], GOLD[1], GOLD[0], GOLD[1]][f]
    r.rect(28, 57, 8, 2, DARK[3])
    r.set(30, 57, pulse)
    r.set(33, 57, pulse)
    r.rect(31, 58, 2, 1, pulse)
    // roots of the pillars
    for (const px of [3, 55]) for (let i = 0; i < 6; i++) r.set(px + i, 55, STONE_DARK[0])
  }
  return r
}

function gateSheet() {
  const frames = (part: 'top' | 'mid' | 'bottom') =>
    anim(
      [0, 1, 2, 3].map((f) => gateFrame(part, f)),
      8,
      true,
      { anchor: [0, 0] }
    )
  return { top: frames('top'), mid: frames('mid'), bottom: frames('bottom') }
}

// ------------------------------------------------------------------------------------------------- goal

const POLE_X = 22 // left column of the 4 px pole

function star5(l: Raster, cx: number, cy: number, ro: number, ri: number, rot: number, c: number) {
  const pts: number[] = []
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2
    const rr = i % 2 ? ri : ro
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  l.poly(pts, c)
}

function pole(l: Raster, wood: Ramp, gold: Ramp, steel: Ramp) {
  for (let y = 14; y < 124; y++) {
    l.set(POLE_X, y, wood[0])
    l.set(POLE_X + 1, y, wood[1])
    l.set(POLE_X + 2, y, wood[2])
    l.set(POLE_X + 3, y, wood[3])
  }
  // gold rings
  for (const y of [22, 60, 96]) {
    for (let i = 0; i < 4; i++) l.set(POLE_X + i, y, gold[i === 0 ? 0 : i === 3 ? 2 : 1])
    for (let i = 0; i < 4; i++) l.set(POLE_X + i, y + 1, gold[i === 3 ? 3 : 2])
  }
  void steel
}

function goalBase(locked: boolean): Painter {
  const g = new Painter(64, 128)
  const st = locked ? STONE_DARK : STONE
  g.add(-1, (l) => {
    // mossy stone footing the pole is planted in
    ball(l, POLE_X + 2, 120, 15, 7, st, false)
    l.rect(POLE_X - 11, 121, 28, 3, st[1])
    shadeEdges(l, st, 1, true)
    for (const x of [POLE_X - 6, POLE_X + 9]) for (let y = 118; y < 124; y++) l.paint(x, y, st[2])
  })
  g.add(0, (l) => pole(l, locked ? WOOD_DIM : R.wood, locked ? GOLD_DIM : GOLD, STEEL))
  g.add(1, (l) => {
    // star finial on a gold ball
    const gold = locked ? GOLD_DIM : GOLD
    l.rect(POLE_X - 1, 13, 6, 2, gold[1])
    l.rect(POLE_X - 1, 14, 6, 1, gold[2])
    star5(l, POLE_X + 2, 6, 8, 3.9, 0, gold[1])
    star5(l, POLE_X + 1.6, 5.6, 4.6, 2.2, 0, gold[0])
  })
  return g
}

/** The pennant: a swallowtail hung from the pole, rippling with the wind. */
function pennant(l: Raster, f: number) {
  const x0 = POLE_X + 4
  const len = 34
  const wave = (u: number) => Math.sin(u * 0.2 - (f * Math.PI) / 3) * (1 + u * 0.1)
  const topY = 19
  const hgt = 25
  const rp = FLAG_PINK
  const slope = (u: number) => wave(u + 1) - wave(u - 1)
  for (let u = 0; u < len; u++) {
    const w = wave(u)
    const t = u < 24 ? 0 : (u - 24) / 10 // swallowtail notch
    const hgtU = hgt * (1 - 0.12 * (u / len))
    const cut = t > 0 ? Math.round(t * 11) : 0
    for (let j = 0; j < hgtU; j++) {
      // the notch is cut from the middle of the tail
      const mid = hgtU / 2
      if (cut && Math.abs(j - mid) < cut * 0.9) continue
      const y = Math.round(topY + w + j)
      const s = slope(u)
      let c: number = rp[1]
      if (j === 0) c = rp[0]
      else if (j >= hgtU - 2) c = rp[2]
      else if (s > 0.28) c = rp[2]
      else if (s < -0.28) c = rp[0]
      l.set(x0 + u, y, c)
    }
  }
  // the star on the cloth rides the ripple
  const su = 12
  const sy = topY + wave(su) + hgt / 2 - 1
  star5(l, x0 + su, sy, 5.2, 2.5, 0, C.white)
  star5(l, x0 + su, sy + 0.4, 3, 1.5, 0, GOLD[0])
}

function drawGoalOpen(f: number): Raster {
  const g = goalBase(false)
  g.add(-2, (l) => pennant(l, f))
  const out = g.render()
  // twinkle on the finial
  const tw = [
    [POLE_X + 8, 3],
    [POLE_X - 5, 5],
    [POLE_X + 7, 10],
    [POLE_X - 4, 1],
    [POLE_X + 9, 6],
    [POLE_X - 3, 9]
  ][f]
  out.set(tw[0], tw[1], C.white)
  out.set(tw[0] - 1, tw[1], C.glow)
  out.set(tw[0] + 1, tw[1], C.glow)
  out.set(tw[0], tw[1] - 1, C.glow)
  out.set(tw[0], tw[1] + 1, C.glow)
  return out
}

function drawGoalLocked(f: number): Raster {
  const g = goalBase(true)
  const rp = FLAG_DIM
  // the flag furled against the pole: a limp roll with a tail hanging below
  g.add(1, (l) => {
    ball(l, POLE_X + 7, 34, 6.5, 15, rp, false)
    l.poly([POLE_X + 2, 44, POLE_X + 10, 44, POLE_X + 9, 58 + (f ? 1 : 0), POLE_X + 5, 55], rp[2])
    for (let y = 20; y < 46; y++) l.paint(POLE_X + 3, y, rp[0])
    star5(l, POLE_X + 7, 30, 2.4, 1.2, 0, rp[0])
  })
  // chain wrapped around the roll and a padlock
  g.add(2, (l) => {
    const links = (ax: number, ay: number, bx: number, by: number) => {
      const n = 5
      for (let i = 0; i <= n; i++) {
        const x = ax + ((bx - ax) * i) / n
        const y = ay + ((by - ay) * i) / n
        l.rect(Math.round(x) - 1, Math.round(y) - 1, 3, 2, i % 2 ? STEEL_DIM[1] : STEEL_DIM[0])
        l.set(Math.round(x), Math.round(y) + 1, STEEL_DIM[2])
      }
    }
    links(POLE_X - 1, 25, POLE_X + 14, 33)
    links(POLE_X + 14, 33, POLE_X - 1, 41)
    links(POLE_X + 14, 41, POLE_X + 1, 47)
  })
  g.add(3, (l) => {
    const cx = POLE_X + 7
    const cy = 44
    l.ring(cx, cy - 5.5, 2.2, 4, STEEL_DIM[1], Math.PI, Math.PI * 2)
    l.rect(cx - 5, cy - 3, 10, 8, GOLD_DIM[1])
    l.rect(cx - 5, cy + 3, 10, 2, GOLD_DIM[2])
    l.rect(cx - 5, cy - 3, 10, 1, GOLD_DIM[0])
    l.rect(cx - 1, cy, 2, 3, C.ink)
  })
  const out = g.render()
  if (f) {
    // a slow glint on the padlock
    const cx = POLE_X + 4
    out.set(cx, 41, C.white)
    out.set(cx - 1, 41, STEEL_DIM[0])
    out.set(cx + 1, 41, STEEL_DIM[0])
    out.set(cx, 40, STEEL_DIM[0])
    out.set(cx, 42, STEEL_DIM[0])
  }
  return out
}

// ------------------------------------------------------------------------------------------------- nest

const NEST_CX = 64
const STRAW = R.honey
const NEST_WOOD = [R.wood, R.bark, R.honey] as const

function nestBody(locked: boolean, f: number): Painter {
  const g = new Painter(128, 64)
  const bowl = new Raster(128, 64)
  // the bowl: a deep half-ellipse, built from overlapping twigs
  const cy = 42
  const rx = 31
  const ry = 18
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 128; x++) {
      const nx = (x + 0.5 - NEST_CX) / rx
      const ny = (y + 0.5 - cy) / ry
      if (nx * nx + ny * ny <= 1 && y >= cy - 4) bowl.set(x, y, R.bark[2])
    }
  const rand = rng(f * 0 + 4242)
  const count = locked ? 90 : 150
  for (let i = 0; i < count; i++) {
    const th = rand() * Math.PI
    const depth = 0.55 + rand() * 0.45
    const px = NEST_CX + Math.cos(th) * rx * depth * (rand() < 0.5 ? 1 : -1)
    const py = cy + Math.sin(th) * ry * depth * 0.95 - 2
    const ang = Math.atan2(Math.cos(th) * ry, -Math.sin(th) * rx) + (rand() - 0.5) * 0.7
    const l2 = 6 + rand() * 8
    const c = rand()
    const tone = c < 0.45 ? R.wood[1] : c < 0.7 ? R.bark[1] : c < 0.85 ? R.honey[1] : R.bark[0]
    const wdt = rand() < 0.4 ? 2 : 1
    const ax = px - (Math.cos(ang) * l2) / 2
    const ay = py - (Math.sin(ang) * l2) / 2
    const bx = px + (Math.cos(ang) * l2) / 2
    const by = py + (Math.sin(ang) * l2) / 2
    // painted only inside the bowl
    const stroke = new Raster(128, 64)
    if (wdt === 2) bar(stroke, [ax, ay], [bx, by], 2, tone)
    else stroke.line(ax, ay, bx, by, tone)
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 128; x++) {
        const v = stroke.get(x, y)
        if (v && bowl.get(x, y)) bowl.set(x, y, v === R.bark[0] ? R.bark[0] : v)
      }
  }
  // roundness: shade the right/bottom of the bowl, light the top-left
  const shaded = bowl.clone()
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 128; x++) {
      if (!bowl.get(x, y)) continue
      const nx = (x + 0.5 - NEST_CX) / rx
      const ny = (y + 0.5 - cy) / ry
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
      const s = shadeIndex(nx, ny, nz, false)
      const c = bowl.get(x, y)
      if (s >= 3) shaded.set(x, y, R.bark[3])
      else if (s === 2 && c !== R.bark[3])
        shaded.set(x, y, c === R.wood[1] ? R.wood[2] : c === R.honey[1] ? R.honey[2] : R.bark[2])
      else if (s === 0) shaded.set(x, y, c === R.bark[1] ? R.wood[0] : c)
    }
  g.add(0, (l) => l.blit(shaded))
  // the inside: a dark hollow, and (when finished) the soft pink blanket
  g.add(
    1,
    (l) => {
      l.ellipse(NEST_CX, cy - 4, 24, 8, R.bark[3])
      l.ellipse(NEST_CX, cy - 3.4, 23, 7, R.bark[2])
      if (locked) {
        l.ellipse(NEST_CX, cy - 2.6, 20, 5.2, R.bark[3])
        // a few strands of straw lie in the bottom
        for (const [x, y] of [
          [-8, -3],
          [-3, -2],
          [3, -3],
          [8, -2]
        ])
          l.line(NEST_CX + x, cy + y, NEST_CX + x + 5, cy + y - 1, STRAW[2])
      } else {
        l.ellipse(NEST_CX, cy - 3, 21, 6.4, R.princessPink[1])
        l.ellipse(NEST_CX - 1, cy - 3.4, 18, 4.4, R.princessPink[0])
        l.ellipse(NEST_CX + 2, cy - 2, 17, 4, R.princessPink[1])
        // folds in the blanket
        l.line(NEST_CX - 12, cy - 2, NEST_CX - 5, cy - 4, R.princessPink[2])
        l.line(NEST_CX + 1, cy - 1, NEST_CX + 9, cy - 4, R.princessPink[2])
        l.line(NEST_CX + 8, cy, NEST_CX + 15, cy - 3, R.princessPink[2])
        for (let i = 0; i < 4; i++) l.set(NEST_CX - 14 + i * 9, cy - 5, R.princessPink[0])
      }
    },
    false
  )
  // front rim twigs overlapping the blanket's edge, rounder than the bowl
  g.add(2, (l) => {
    const rim = (c: number, w: number, a: [number, number], b: [number, number]) => bar(l, a, b, w, c)
    rim(R.wood[1], 3, [NEST_CX - 28, cy + 1], [NEST_CX - 10, cy + 5])
    rim(R.bark[1], 3, [NEST_CX - 14, cy + 4], [NEST_CX + 8, cy + 6])
    rim(R.wood[1], 3, [NEST_CX + 2, cy + 6], [NEST_CX + 27, cy + 1])
    rim(R.honey[1], 2, [NEST_CX - 24, cy - 1], [NEST_CX - 14, cy + 2])
    rim(R.bark[0], 2, [NEST_CX + 12, cy + 3], [NEST_CX + 22, cy])
    if (!locked) {
      rim(R.wood[0], 2, [NEST_CX - 6, cy + 6], [NEST_CX + 4, cy + 7])
      rim(R.honey[1], 2, [NEST_CX + 18, cy + 1], [NEST_CX + 29, cy - 3])
    }
  })
  return g
}

function leaf(l: Raster, x: number, y: number, dx: number, dy: number, rp: Ramp) {
  const n = Math.hypot(dx, dy) || 1
  const nx = (-dy / n) * 2.6
  const ny = (dx / n) * 2.6
  l.poly([x, y, x + dx * 0.45 + nx, y + dy * 0.45 + ny, x + dx, y + dy, x + dx * 0.45 - nx, y + dy * 0.45 - ny], rp[1])
  l.poly([x, y, x + dx * 0.45 - nx, y + dy * 0.45 - ny, x + dx, y + dy, x + dx * 0.5, y + dy * 0.5], rp[2])
  l.line(x, y, x + dx * 0.9, y + dy * 0.9, rp[0])
}

function drawNest(locked: boolean, f: number): Raster {
  const g = nestBody(locked, f)
  const sway = locked ? [0, 1][f] : [0, 1, 0, -1][f]
  if (!locked) {
    g.add(3, (l) => {
      leaf(l, NEST_CX - 25, 34, -9 + sway, -9, R.leaf)
      leaf(l, NEST_CX - 24, 36, -10, -3 + sway, R.leaf)
      leaf(l, NEST_CX + 24, 34, 9 - sway, -9, R.leaf)
      leaf(l, NEST_CX + 26, 36, 10, -2 - sway, R.leaf)
    })
  } else {
    g.add(3, (l) => {
      // loose twigs lying beside the unfinished nest
      bar(l, [NEST_CX - 40, 58], [NEST_CX - 26, 54 - sway], 3, R.wood[1])
      bar(l, [NEST_CX + 30, 57], [NEST_CX + 42, 59], 3, R.bark[1])
      leaf(l, NEST_CX + 26, 52, 7, -5 + sway, R.leaf)
    })
  }
  let out = g.render()
  if (!locked) {
    // a warm halo arc over the blanket and tiny twinkles that drift upward
    for (let x = NEST_CX - 20; x <= NEST_CX + 20; x++) {
      const y = Math.round(27 - Math.sqrt(Math.max(0, 1 - ((x - NEST_CX) / 21) ** 2)) * 6)
      if (!out.get(x, y) && (x + f * 3) % 4 < 2) out.set(x, y, STRAW[0])
    }
    const spots = [
      [
        [NEST_CX - 12, 24],
        [NEST_CX + 14, 20]
      ],
      [
        [NEST_CX - 14, 21],
        [NEST_CX + 12, 16]
      ],
      [
        [NEST_CX - 10, 18],
        [NEST_CX + 10, 13]
      ],
      [
        [NEST_CX - 6, 15],
        [NEST_CX + 16, 24]
      ]
    ][f]
    for (const [sx, sy] of spots) {
      out.set(sx, sy, C.white)
      out.set(sx - 1, sy, C.glow)
      out.set(sx + 1, sy, C.glow)
      out.set(sx, sy - 1, C.glow)
      out.set(sx, sy + 1, C.glow)
    }
  }
  if (locked) {
    const table = new Map<number, number>()
    out = out.map((c) => {
      let v = table.get(c)
      if (v === undefined) {
        const [r, gr, b] = rgbOf(c)
        const m = (x: number, t: number) => x + (t - x) * 0.45
        v = color(toHex([m(r, 112), m(gr, 100), m(b, 128)]))
        table.set(c, v)
      }
      return v
    })
  }
  return out
}

// ------------------------------------------------------------------------------------------------- cage

const CAGE_X = 48
const RIM_Y = 26
const FLOOR_Y = 88
const ell = (x: number, r: number) => Math.sqrt(Math.max(0, 1 - ((x - CAGE_X) / r) ** 2))
const rimTop = (x: number) => RIM_Y + 5 * ell(x, 38)
const floorLip = (x: number) => FLOOR_Y + 6 * ell(x, 40)
/** Five thin front bars; the gap in the middle keeps ハム姫's face between bars. */
const FRONT_BARS = [12, 25, 38, 71, 84]
const IRON: Ramp = [STEEL[1], STEEL[2], STEEL[3], STEEL[3], STEEL[4]]
const IRON_FAR: Ramp = [STEEL[2], STEEL[3], STEEL[3], STEEL[4], STEEL[4]]

/** A thin iron bar three pixels wide: lit left, shaded right. */
function ironBar(l: Raster, a: [number, number], b: [number, number], ramp: Ramp = IRON) {
  const t = new Raster(l.w, l.h)
  bar(t, a, b, 3, ramp[1])
  shadeEdges(t, ramp, 1, true)
  l.blit(t)
}

/** The lip of the floor in front of ハム姫. */
function floorFront(l: Raster) {
  for (let x = 8; x <= 88; x++) {
    const y = Math.round(floorLip(x))
    l.set(x, y, STEEL[0])
    l.set(x, y + 1, STEEL[1])
    for (let k = 2; k <= 5; k++) l.set(x, y + k, k < 4 ? STEEL[2] : STEEL[3])
  }
}

function cageBack(floorOnly = false): Raster {
  const g = new Painter(96, 96)
  g.add(0, (l) => {
    // the floor: an iron plate seen from above, with a dark well inside
    l.ellipse(CAGE_X, FLOOR_Y, 41, 7.5, STEEL[2])
    l.ellipse(CAGE_X, FLOOR_Y - 0.6, 38, 5.6, STEEL[3])
    l.ellipse(CAGE_X, FLOOR_Y - 1.2, 36, 4.4, C.inkCool)
  })
  // rear bars and the rear arc of the rim, darker because they are farther away
  if (!floorOnly)
    g.add(
      -1,
      (l) => {
        for (let x = 15; x <= 81; x += 11) {
          const e = ell(x, 38)
          ironBar(l, [x, RIM_Y - 5 * e], [x, FLOOR_Y - 6 * e], IRON_FAR)
          bar(l, [x, RIM_Y - 5 * e], [CAGE_X + (x - CAGE_X) * 0.2, 9], 1, STEEL[3])
        }
        for (let x = 10; x <= 86; x++) {
          const y = Math.round(RIM_Y - 5 * ell(x, 38))
          l.set(x, y, STEEL[2])
          l.set(x, y + 1, STEEL[3])
        }
      },
      false
    )
  return g.render()
}

/** Dome arcs from the front rim to the ring on top. */
function domeArc(x: number): [number, number][] {
  const y0 = rimTop(x)
  const pts: [number, number][] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    const cx = x + (CAGE_X - x) * 0.55
    const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * CAGE_X
    const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * 10 + t * t * 8
    pts.push([px, py])
  }
  return pts
}

function cageFront(): Raster {
  const g = new Painter(96, 96)
  // frame: the front arc of the top rim, the lip of the floor, two posts and the ring on top
  g.add(0, (l) => {
    for (let x = 10; x <= 86; x++) {
      const y = Math.round(rimTop(x))
      l.set(x, y, STEEL[0])
      l.set(x, y + 1, STEEL[1])
      l.set(x, y + 2, STEEL[2])
    }
    floorFront(l)
    for (const x of [10, 85])
      for (let y = Math.round(rimTop(x)); y <= Math.round(floorLip(x)); y++) {
        l.set(x, y, STEEL[0])
        l.set(x + 1, y, STEEL[1])
        l.set(x + 2, y, STEEL[2])
      }
    l.ring(CAGE_X, 5, 2.4, 4.6, STEEL[1])
  })
  g.add(
    1,
    (l) => {
      for (const x of FRONT_BARS) {
        ironBar(l, [x, rimTop(x) + 2], [x, floorLip(x)])
        l.set(x - 1, Math.round(rimTop(x)) + 8, STEEL[0])
      }
      for (const x of [12, 25, 38, 71, 84]) {
        const pts = domeArc(x)
        for (let i = 1; i < pts.length; i++) ironBar(l, pts[i - 1], pts[i])
      }
    },
    false
  )
  return g.render()
}

/** The bars burst outward: segments fly apart; the last frame is a few bent stubs on the floor. */
function cageBreak(f: number): Raster {
  const out = cageBack(true)
  out.blit(new Painter(96, 96).add(0, floorFront).render())
  if (f === 3) {
    // bent stubs left standing on the floor and a few pieces lying around
    const stub = (x: number, h: number, bend: number) => {
      const y = floorLip(x) + 1
      ironBar(out, [x, y], [x, y - h])
      ironBar(out, [x, y - h], [x + bend, y - h - 3])
    }
    stub(12, 9, -5)
    stub(38, 6, 4)
    stub(84, 8, 5)
    ironBar(out, [58, 91], [70, 89])
    ironBar(out, [22, 92], [32, 91])
    out.rect(52, 90, 2, 1, STEEL[0])
    return out
  }
  const t = [0.25, 0.6, 1][f]
  const rot = (p: [number, number], c: [number, number], a: number): [number, number] => [
    c[0] + (p[0] - c[0]) * Math.cos(a) - (p[1] - c[1]) * Math.sin(a),
    c[1] + (p[0] - c[0]) * Math.sin(a) + (p[1] - c[1]) * Math.cos(a)
  ]
  const piece = (a: [number, number], b: [number, number], dir: number, k: number) => {
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const ang = dir * t * (0.5 + k * 0.5) * 1.1
    const dx = dir * t * (k * 16)
    const dy = -t * (k * 8) + t * t * 12 * k
    const pa = rot(a, mid, ang)
    const pb = rot(b, mid, ang)
    ironBar(out, [pa[0] + dx, pa[1] + dy], [pb[0] + dx, pb[1] + dy])
  }
  for (const x of [...FRONT_BARS, 11, 86, ...(f < 2 ? [18, 32, 44, 56, 66, 78] : [])]) {
    const dir = Math.max(-1, Math.min(1, (x - CAGE_X) / 30))
    const y0 = rimTop(x) + 2
    const y1 = floorLip(x)
    const h = (y1 - y0) / 3
    // the lowest piece stays rooted and leans out; the others fly
    piece([x, y1 - h], [x, y1], dir, 0)
    piece([x, y1 - 2 * h], [x, y1 - h], dir, 1)
    piece([x, y0], [x, y1 - 2 * h], dir, 2)
  }
  if (f < 2) {
    // the ring and the rim burst upward
    out.blit(
      new Painter(96, 96)
        .add(0, (l) => {
          l.ring(CAGE_X, 5 - t * 14, 2.4, 4.6, STEEL[1])
        })
        .render()
    )
    for (let x = 12; x <= 84; x += 4) {
      const dir = (x - CAGE_X) / 38
      ironBar(out, [x + dir * t * 12, rimTop(x) - t * 12], [x + 3 + dir * t * 12, rimTop(x + 3) - t * 12])
    }
  }
  // impact flashes while the bars let go
  const flashes = [
    [24, 58],
    [48, 52],
    [74, 60],
    [12, 36],
    [84, 40]
  ].slice(0, f === 0 ? 5 : f === 1 ? 3 : 1)
  for (const [x, y] of flashes) {
    out.set(x, y, C.white)
    out.set(x - 1, y, C.glow)
    out.set(x + 1, y, C.glow)
    out.set(x, y - 1, C.glow)
    out.set(x, y + 1, C.glow)
  }
  return out
}

export const sheets: SheetModule = {
  'prop:switch1': switchSheet(1),
  'prop:switch2': switchSheet(2),
  'prop:door1': doorSheet(1),
  'prop:door2': doorSheet(2),
  'prop:gate': gateSheet,
  'prop:goal': () => ({
    locked: anim([drawGoalLocked(0), drawGoalLocked(1)], 2, true, { anchor: [0, 64] }),
    open: anim([0, 1, 2, 3, 4, 5].map(drawGoalOpen), 10, true, { anchor: [0, 64] })
  }),
  'prop:cage': () => ({
    back: anim([cageBack()], 1, false, { anchor: [16, 28] }),
    front: anim([cageFront()], 1, false, { anchor: [16, 28] }),
    break: anim([0, 1, 2, 3].map(cageBreak), 14, false, { anchor: [16, 28] })
  }),
  'prop:nest': () => ({
    locked: anim([drawNest(true, 0), drawNest(true, 1)], 2, true, { anchor: [32, 0] }),
    open: anim(
      [0, 1, 2, 3].map((f) => drawNest(false, f)),
      6,
      true,
      { anchor: [32, 0] }
    )
  })
}
