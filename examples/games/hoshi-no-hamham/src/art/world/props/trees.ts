/**
 * `prop:tree`, `prop:pine`, `prop:log`: the two bitable trees and the log they become.
 *
 * Trees are drawn with the Painter: a trunk part plus a crown of overlapping, ball-shaded puffs (broadleaf) or
 * scalloped tiers (pine). A clip is a list of crown offsets, so the trunk stays planted while the crown sways,
 * compresses and settles. `cut` is the same sway with a bite notch in the trunk and chips at the foot, so it differs
 * from `idle` only in the lower half of the frame.
 */
import type { SheetModule } from '../../module'
import { R } from '../../palette'
import { Painter, Raster, ball, bar, farRamp, noiseAt, rng, shadeIndex, type Ramp } from '../../raster'
import { anim } from '../../sheet'

const TAU = Math.PI * 2
const BARK = R.bark
const WOOD = R.wood
const LEAF = R.leaf
const LEAF_FAR = farRamp(R.leaf)
const PINE = R.pineLeaf
const PINE_FAR = farRamp(R.pineLeaf)

// ----------------------------------------------------------------------------------------------- shared bits

/** Ramp step (0 highlight … 3 deep) across a cylinder lit from the left; u runs −1 (left edge) … 1 (right edge). */
export function cyl(u: number): 0 | 1 | 2 | 3 {
  if (u < -0.84) return 1
  if (u < -0.4) return 0
  if (u < 0.18) return 1
  if (u < 0.6) return 2
  return 3
}

/** Same bands for a horizontal cylinder: v runs −1 (top edge) … 1 (bottom edge). */
export const cylH = cyl

/** A ball with a few leaf-lobe notches (dark) and light tips, so a crown reads as foliage and not as a blob. */
export function puff(l: Raster, cx: number, cy: number, rx: number, ry: number, ramp: Ramp, seed: number, marks = 8) {
  ball(l, cx, cy, rx, ry, ramp)
  const rnd = rng(seed)
  for (let k = 0; k < marks; k++) {
    const a = rnd() * TAU
    const d = 0.25 + rnd() * 0.5
    const nx = Math.cos(a) * d
    const ny = Math.sin(a) * d
    const x = Math.round(cx + nx * rx)
    const y = Math.round(cy + ny * ry)
    if (l.get(x - 1, y) !== ramp[1] || l.get(x, y + 1) !== ramp[1] || l.get(x + 1, y) !== ramp[1]) continue
    const c = nx + ny < -0.15 ? ramp[0] : ramp[2]
    l.set(x - 1, y, c)
    l.set(x, y + 1, c)
    l.set(x + 1, y, c)
  }
  return l
}

/** Scalloped lower edge: a bough tooth of period `p`; returns how far the edge droops (0..amp). */
function tooth(x: number, p: number, amp: number, phase = 0) {
  const t = (((x + phase) % p) + p) % p
  const u = t / p
  return amp * (1 - Math.abs(u * 2 - 1) ** 1.6)
}

/** A bark column on a vertical trunk: width by row, shaded as a cylinder with grooves, a knot and root flare. */
function trunkWidth(y: number) {
  const flare = y > 104 ? (y - 104) * 0.1 + (y > 116 ? (y - 116) * 0.3 : 0) : 0
  return 12.4 + Math.sin(y * 0.11) * 0.7 + flare
}

function drawTrunk(l: Raster, top: number, bitten: boolean) {
  const cx = 64
  for (let y = top; y <= 124; y++) {
    const w = trunkWidth(y)
    for (let x = Math.ceil(cx - w); x < Math.ceil(cx + w); x++) {
      const u = (x + 0.5 - cx) / w
      l.set(x, y, BARK[cyl(u)])
    }
  }
  // vertical grooves that follow the trunk's width
  const grooves = [-0.62, -0.24, 0.2, 0.55, 0.82]
  grooves.forEach((u0, gi) => {
    const rnd = rng(900 + gi * 17)
    let y = top + Math.floor(rnd() * 8)
    while (y < 122) {
      const len = 5 + Math.floor(rnd() * 7)
      for (let k = 0; k < len && y + k < 122; k++) {
        const w = trunkWidth(y + k)
        const x = Math.floor(cx + u0 * w)
        const cur = l.get(x, y + k)
        const i = BARK.indexOf(cur)
        if (i >= 0) l.set(x, y + k, BARK[Math.min(3, i + 1)])
      }
      y += len + 4 + Math.floor(rnd() * 6)
    }
  })
  // a knot hole and a bark scar
  l.ellipse(57, 96, 3.5, 4.5, BARK[3])
  l.ellipse(56.5, 95.5, 2, 3, BARK[2])
  l.ellipse(56, 95, 1, 1.6, BARK[3])
  l.rect(56, 90, 1, 2, BARK[0])
  l.rect(68, 80, 3, 1, BARK[0])
  l.rect(70, 81, 1, 3, BARK[0])
  // roots reaching out of the flare
  for (let k = 0; k < 4; k++) {
    l.set(47 - k, 124, BARK[3])
    l.set(80 + k, 124, BARK[3])
  }
  l.rect(45, 123, 3, 1, BARK[2])
  l.rect(81, 123, 3, 1, BARK[3])
  if (bitten) bite(l)
}

/** The bite: a scalloped bite out of the right edge (rows 102–118) with a pale cut face and teeth marks. */
function bite(l: Raster) {
  const cx = 80
  const cy = 110
  const rx = 7.5
  const ry = 8.5
  const q = (x: number, y: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
  const keep = l.clone()
  for (let y = cy - 14; y <= cy + 14; y++)
    for (let x = cx - 16; x <= cx + 10; x++) {
      if (!keep.get(x, y)) continue
      const d = q(x, y)
      if (d <= 1) l.set(x, y, 0)
      else if (d < 3.1) l.set(x, y, y > cy + 3 || (x > cx - 7 && y > cy) ? WOOD[2] : d < 1.9 ? WOOD[0] : WOOD[1])
    }
  // a second, smaller tooth print on the lower lip
  for (let y = cy + 4; y <= cy + 12; y++)
    for (let x = cx - 4; x <= cx + 8; x++) {
      const d = ((x + 0.5 - (cx + 3)) / 3.4) ** 2 + ((y + 0.5 - (cy + 9)) / 3.4) ** 2
      if (d <= 1 && keep.get(x, y)) l.set(x, y, 0)
    }
  // teeth marks across the cut face
  for (const [x, y0, n] of [
    [cx - 8, cy - 7, 3],
    [cx - 6, cy - 5, 3],
    [cx - 9, cy + 1, 3]
  ])
    for (let k = 0; k < n; k++)
      if (l.get(x, y0 + k) === WOOD[0] || l.get(x, y0 + k) === WOOD[1]) l.set(x, y0 + k, WOOD[3])
}

/** Pale wood chips scattered at the foot after the first bite. */
function chips(l: Raster) {
  const spots: [number, number, number, number][] = [
    [86, 119, 5, 4],
    [94, 122, 4, 3],
    [101, 121, 3, 3],
    [82, 114, 3, 3],
    [36, 121, 4, 3],
    [29, 122, 3, 3]
  ]
  for (const [x, y, w, h] of spots) {
    l.rect(x, y, w, h, WOOD[1])
    l.rect(x, y, w - 1, 1, WOOD[0])
    l.rect(x + w - 1, y + 1, 1, h - 1, WOOD[2])
    l.rect(x, y + h - 1, w, 1, WOOD[2])
    l.set(x, y, WOOD[0])
  }
}

interface CrownPose {
  /** Horizontal shift of the top of the crown; lower parts follow in proportion to their height. */
  dx: number
  /** Vertical shift of the top (negative = up). */
  dy: number
  /** Width scale of the puffs. */
  sx: number
  /** Extra lag (px) of the highest parts relative to the middle: makes the crown whip. */
  whip: number
}

const calm = (p: Partial<CrownPose> = {}): CrownPose => ({ dx: 0, dy: 0, sx: 1, whip: 0, ...p })

// ------------------------------------------------------------------------------------------------ broadleaf

interface Puff {
  x: number
  y: number
  rx: number
  ry: number
  back?: boolean
}

const PUFFS: Puff[] = [
  // back layer
  { x: 36, y: 54, rx: 17, ry: 14, back: true },
  { x: 92, y: 54, rx: 17, ry: 14, back: true },
  { x: 50, y: 36, rx: 17, ry: 14, back: true },
  { x: 78, y: 36, rx: 17, ry: 14, back: true },
  { x: 64, y: 50, rx: 22, ry: 16, back: true },
  // middle layer
  { x: 22, y: 62, rx: 12, ry: 11 },
  { x: 106, y: 62, rx: 12, ry: 11 },
  { x: 33, y: 46, rx: 14, ry: 12 },
  { x: 95, y: 46, rx: 14, ry: 12 },
  { x: 47, y: 31, rx: 14, ry: 12 },
  { x: 81, y: 31, rx: 14, ry: 12 },
  { x: 64, y: 28, rx: 15, ry: 11 },
  { x: 64, y: 44, rx: 14, ry: 12 },
  // front, lower layer
  { x: 33, y: 71, rx: 16, ry: 12 },
  { x: 95, y: 71, rx: 16, ry: 12 },
  { x: 50, y: 66, rx: 15, ry: 12 },
  { x: 78, y: 66, rx: 15, ry: 12 },
  { x: 64, y: 73, rx: 16, ry: 11 }
]

const heightOf = (y: number) => Math.max(0, Math.min(1, (88 - y) / 56))

function drawTree(pose: CrownPose, bitten: boolean, leaves: [number, number, number][] = []): Raster {
  const g = new Painter(128, 128)
  g.add(0, (l) => drawTrunk(l, 50, bitten))
  PUFFS.forEach((p, i) => {
    const h = heightOf(p.y)
    const ox = pose.dx * h + pose.whip * h * h
    const oy = pose.dy * h + 4
    const depth = p.back ? 1 : i >= 13 ? 4 : p.y > 55 ? 3 : 2
    g.add(depth, (l) =>
      puff(l, p.x + ox, p.y + oy, p.rx * pose.sx, p.ry / Math.sqrt(pose.sx), p.back ? LEAF_FAR : LEAF, 40 + i * 7, 6)
    )
  })
  if (bitten) g.add(5, (l) => chips(l))
  for (const [x, y, k] of leaves) g.add(6, (l) => fallingLeaf(l, x, y, k, LEAF))
  return g.render()
}

/** A small tumbling leaf, three poses. */
function fallingLeaf(l: Raster, x: number, y: number, k: number, ramp: Ramp) {
  const shapes = [
    ['.hh.', 'hbbs', '.ss.'],
    ['h.', 'bb', 'bs', '.s'],
    ['.hb', 'hbs', 'bs.']
  ]
  l.stamp(shapes[k % 3], x, y, { h: ramp[0], b: ramp[1], s: ramp[2] })
}

/** A sway pose at phase t (0..1): the crown top drifts ±2.5 px, the lower crown follows a little behind. */
const sway = (t: number): CrownPose => {
  const a = TAU * t + 0.5
  return calm({
    dx: 2.6 * Math.sin(a),
    dy: 1.6 * Math.cos(TAU * t * 2 + 0.3),
    sx: 1 + 0.015 * Math.cos(a),
    whip: 0.8 * Math.sin(a - 0.7)
  })
}

function treeClips() {
  const idle = [0, 1, 2, 3].map((i) => drawTree(sway(i / 4), false))
  const cut = [0, 1, 2, 3].map((i) => drawTree(sway(i / 4), true))
  const shake = [
    drawTree(calm({ dx: -4, dy: 3, sx: 1.07, whip: -1 }), false, [[34, 66, 0]]),
    drawTree(calm({ dx: 5, dy: -2, sx: 0.95, whip: 3 }), false, [
      [28, 78, 1],
      [98, 74, 2],
      [60, 90, 0]
    ]),
    drawTree(calm({ dx: -2, dy: 1, sx: 1.02, whip: -1 }), false, [
      [26, 92, 2],
      [100, 94, 0],
      [66, 104, 1],
      [46, 100, 1]
    ])
  ]
  return { idle, cut, shake }
}

// --------------------------------------------------------------------------------------------------- conifer

interface Tier {
  top: number
  bot: number
  hw: number
  /** Horizontal weight: 1 for the highest tier. */
  h: number
}

const TIERS: Tier[] = [
  { top: 54, bot: 104, hw: 47, h: 0.2 },
  { top: 34, bot: 80, hw: 36, h: 0.6 },
  { top: 18, bot: 56, hw: 25, h: 1 }
]

function drawTier(l: Raster, cx: number, t: Tier, ramp: Ramp, seed: number) {
  const hgt = t.bot - t.top
  const period = Math.max(10, Math.round(t.hw * 0.4))
  for (let y = t.top; y <= t.bot; y++) {
    const u = (y - t.top) / hgt
    const hw = Math.max(1, t.hw * (0.08 + 0.92 * Math.pow(u, 0.85)))
    for (let x = Math.ceil(cx - hw); x <= Math.floor(cx + hw); x++) {
      const dx = x - cx
      const e = Math.abs(dx) / t.hw
      // lower edge droops in scallops, more at the tips of the bough
      const edge = t.bot - 7 + tooth(dx, period, 7 + 2 * e, 3) - e * e * 6
      if (y > edge) continue
      const nx = Math.max(-1, Math.min(1, dx / hw))
      const i = shadeIndex(nx * 0.9, -0.55 + u * 0.15, Math.sqrt(Math.max(0, 1 - nx * nx * 0.8)), false)
      l.set(x, y, ramp[i === 0 ? 1 : i])
    }
  }
  // swept needle layers: arcs parallel to the scallops, darker on the shaded side
  for (const k of [1, 2]) {
    for (let x = Math.ceil(cx - t.hw); x <= cx + t.hw; x++) {
      const dx = x - cx
      const e = Math.abs(dx) / t.hw
      const y = Math.round(t.bot - 7 + tooth(dx, period, 7 + 2 * e, 3) - e * e * 6 - k * 9 + (k === 2 ? 2 : 0))
      if (l.get(x, y) === ramp[1] || l.get(x, y) === ramp[2]) l.set(x, y, dx > 0 ? ramp[3] : ramp[2])
      // light needle tip above the arc on the lit side
      if (dx < -2 && l.get(x, y - 1) === ramp[1] && (x + k) % 3 === 0) l.set(x, y - 1, ramp[0])
    }
  }
  // lit lip on every scallop tooth (top-left facing)
  const rnd = rng(seed)
  for (let k = 0; k < 6; k++) {
    const x = Math.round(cx - t.hw * 0.7 + rnd() * t.hw * 1.2)
    const y = Math.round(t.top + hgt * (0.35 + rnd() * 0.5))
    if (l.get(x, y) === ramp[1] && l.get(x + 1, y + 1) === ramp[1]) {
      l.set(x, y, ramp[0])
      l.set(x + 1, y, ramp[0])
    }
  }
}

function drawPine(pose: CrownPose, bitten: boolean, needles: [number, number, number][] = []): Raster {
  const g = new Painter(128, 128)
  g.add(0, (l) => {
    drawTrunk(l, 96, bitten)
    // a shadow band where the lowest tier hangs over the trunk (fixed, so the lower half does not depend on sway)
    for (let y = 104; y <= 107; y++)
      for (let x = 40; x <= 88; x++) {
        const i = BARK.indexOf(l.get(x, y))
        if (i >= 0) l.set(x, y, BARK[Math.min(3, i + (y < 106 ? 2 : 1))])
      }
  })
  TIERS.forEach((t, i) => {
    const ox = pose.dx * t.h + pose.whip * t.h * t.h
    const oy = pose.dy * t.h + 3
    g.add(1 + i, (l) =>
      drawTier(l, 64 + ox, { ...t, top: t.top + oy, bot: t.bot + oy }, i === 0 ? PINE_FAR : PINE, 70 + i * 5)
    )
  })
  if (bitten) g.add(5, (l) => chips(l))
  for (const [x, y, k] of needles) g.add(6, (l) => fallingLeaf(l, x, y, k, PINE))
  return g.render()
}

function pineClips() {
  const idle = [0, 1, 2, 3].map((i) => drawPine(sway(i / 4), false))
  const cut = [0, 1, 2, 3].map((i) => drawPine(sway(i / 4), true))
  const shake = [
    drawPine(calm({ dx: -3, dy: 3, sx: 1, whip: -1 }), false, [[30, 98, 0]]),
    drawPine(calm({ dx: 4, dy: -1, sx: 1, whip: 3 }), false, [
      [22, 90, 1],
      [104, 94, 2],
      [60, 108, 0]
    ]),
    drawPine(calm({ dx: -2, dy: 1, sx: 1, whip: -1 }), false, [
      [20, 108, 2],
      [106, 110, 0],
      [70, 116, 1],
      [38, 112, 1]
    ])
  ]
  return { idle, cut, shake }
}

// ---------------------------------------------------------------------------------------------------- fallen log

const LOG_TOP = 3
const LOG_BOT = 52
const logTop = (x: number) => LOG_TOP + Math.round(Math.sin(x * 0.07) * 0.9 + Math.sin(x * 0.19 + 1) * 0.6)
const logBot = (x: number) => LOG_BOT + Math.round(Math.sin(x * 0.05 + 1) * 1.2)

/** The felled trunk lying right: bitten stump on the left, bark furrows, knots, moss on the walking surface. */
function drawLogTrunk(l: Raster) {
  const x0 = 8
  const x1 = 214
  // ragged bitten end: bite scallops along the left edge
  const edge = (y: number) => x0 + 3 + Math.round(3 * Math.abs(Math.sin(y * 0.33)) + (y % 9 < 2 ? 3 : 0))
  for (let x = 0; x <= x1; x++) {
    const t = logTop(x)
    const b = logBot(x)
    for (let y = t; y <= b; y++) {
      if (x < edge(y)) continue
      const v = ((y - t + 0.5) / (b - t + 1)) * 2 - 1
      l.set(x, y, BARK[cylH(v)])
    }
  }
  // pale chewed end: the cut face a few pixels deep with growth rings, teeth marks and splinters
  for (let y = LOG_TOP; y <= LOG_BOT; y++) {
    const e = edge(y)
    const v = ((y - LOG_TOP) / (LOG_BOT - LOG_TOP)) * 2 - 1
    const depth = 9 + (v > 0.45 ? 0 : 1)
    for (let x = e; x < e + depth; x++) {
      const k = x - e
      const c = v < -0.55 ? WOOD[0] : v > 0.5 ? WOOD[2] : k > depth - 3 && v > 0 ? WOOD[2] : WOOD[1]
      l.set(x, y, c)
    }
    // growth ring arcs
    const ring = Math.round(Math.abs(v) * 4)
    for (const r of [2, 5]) if (ring === r - 1 || ring === r) l.paint(e + r, y, WOOD[2])
  }
  for (const [y, len] of [
    [9, 8],
    [24, 11],
    [38, 7]
  ] as const)
    for (let k = 0; k < len; k++)
      l.set(x0 + 2 - k * 0.5 - (k > 5 ? 1 : 0), y + (k % 3 === 2 ? 1 : 0), k < 3 ? WOOD[1] : WOOD[0])
  // bark furrows
  const rnd = rng(31)
  for (let k = 0; k < 16; k++) {
    const y0 = LOG_TOP + 5 + Math.floor(rnd() * (LOG_BOT - LOG_TOP - 10))
    const xs = 28 + Math.floor(rnd() * 170)
    const len = 12 + Math.floor(rnd() * 26)
    for (let i = 0; i < len; i++) {
      const y = y0 + Math.round(Math.sin((xs + i) * 0.16 + k) * 1.2)
      const i2 = BARK.indexOf(l.get(xs + i, y))
      if (i2 >= 0) l.set(xs + i, y, BARK[Math.min(3, i2 + 1)])
    }
  }
  // knots with a pale broken-branch stub
  const knot = (cx: number, cy: number, pale: boolean) => {
    l.ellipse(cx, cy, 6, 5, BARK[3])
    l.ellipse(cx - 0.5, cy - 0.5, 4.5, 3.8, BARK[2])
    l.ellipse(cx, cy, 3, 2.6, pale ? WOOD[1] : BARK[3])
    if (pale) {
      l.ellipse(cx - 0.7, cy - 0.6, 1.8, 1.4, WOOD[0])
      l.rect(cx + 1, cy + 1, 2, 1, WOOD[2])
    } else l.ellipse(cx, cy, 1.5, 1.2, BARK[2])
    l.rect(cx - 5, cy - 4, 3, 1, BARK[0])
  }
  knot(58, 22, false)
  knot(118, 30, true)
  knot(170, 20, true)
  // moss along the walking surface: patches of lit green with a lip, a few strands hanging over the side
  for (let x = 16; x < x1; x++) {
    const n = noiseAt(Math.floor(x / 11), 5, 3)
    if (n < 0.45) continue
    const t = logTop(x)
    const depth = n > 0.8 ? 3 : 2
    for (let d = 0; d < depth; d++) l.set(x, t + d, d === 0 ? LEAF[0] : d === depth - 1 ? LEAF[2] : LEAF[1])
    if (n > 0.7 && x % 4 === 0) l.set(x, t + depth, LEAF[2])
  }
}

/** A stub of a broken branch jutting below the trunk, with a pale snapped end. */
function stub(l: Raster, x: number, y: number, dx: number, dy: number, w: number) {
  bar(l, [x, y], [x + dx, y + dy], w, BARK[1])
  bar(l, [x + 1, y + 1], [x + dx + 1, y + dy], Math.max(1, w - 2), BARK[2])
  l.ellipse(x + dx, y + dy, w / 2, w / 2 - 0.3, WOOD[1])
  l.set(x + dx - 1, y + dy - 1, WOOD[0])
}

/** The crushed crown of a felled broadleaf: flattened puffs piled over the right quarter. */
function logCrown(g: Painter) {
  const back: [number, number, number, number][] = [
    [190, 30, 15, 20],
    [214, 28, 17, 22],
    [240, 30, 17, 22],
    [224, 48, 20, 15]
  ]
  back.forEach(([x, y, rx, ry], i) => g.add(1, (l) => puff(l, x, y, rx, ry, LEAF_FAR, 200 + i, 7)))
  const mid: [number, number, number, number][] = [
    [200, 13, 15, 12],
    [222, 12, 14, 11],
    [244, 13, 15, 12],
    [208, 33, 16, 14],
    [234, 32, 17, 14],
    [252, 36, 11, 16],
    [186, 46, 11, 9]
  ]
  mid.forEach(([x, y, rx, ry], i) => g.add(2, (l) => puff(l, x, y, rx, ry, LEAF, 220 + i, 7)))
  const front: [number, number, number, number][] = [
    [196, 53, 16, 11],
    [218, 51, 15, 13],
    [238, 52, 15, 12],
    [253, 50, 10, 14],
    [180, 56, 9, 8]
  ]
  front.forEach(([x, y, rx, ry], i) => g.add(3, (l) => puff(l, x, y, rx, ry, LEAF, 240 + i, 7)))
  // a snapped branch pokes out of the leaves toward the trunk
  g.add(2, (l) => stub(l, 196, 30, -16, -8, 5))
}

/** One drooping, layered bough band of a crushed conifer: scalloped lower edge, swept needle arcs, lit tips. */
function boughBand(l: Raster, x0: number, top: number, bot: number, k: number, ragged: boolean) {
  const ramp = PINE
  const edge = (x: number) => bot - 6 + tooth(x, 12, 8, k * 5) - (x < x0 + 10 ? (x0 + 10 - x) * 0.5 : 0)
  for (let x = x0; x < 256; x++) {
    const t = ragged ? top + Math.round(tooth(x, 10, 5, 3)) * -1 + 4 : top
    for (let y = Math.max(0, t); y <= edge(x); y++) {
      const v = (y - top) / (bot - top)
      l.set(x, y, v < 0.2 ? ramp[0] : v < 0.62 ? ramp[1] : v < 0.82 ? ramp[2] : ramp[3])
    }
  }
  for (const d of [11]) {
    for (let x = x0 + 2; x < 256; x++) {
      const y = Math.round(edge(x) - d + tooth(x, 12, 2, 2))
      const c = l.get(x, y)
      if (c === ramp[1] || c === ramp[0]) l.set(x, y, ramp[2])
      else if (c === ramp[2]) l.set(x, y, ramp[3])
      if (l.get(x, y - 1) === ramp[1] && (x + d + k) % 9 === 0) l.set(x, y - 1, ramp[0])
    }
  }
}

/** Crushed conifer boughs: shingled bands, the top one ragged with sprigs. */
function logBoughs(g: Painter) {
  const bands: [number, number, number][] = [
    [185, 1, 22],
    [187, 15, 36],
    [190, 29, 50],
    [193, 43, 66]
  ]
  bands.forEach(([x0, top, bot], i) => g.add(4 - i, (l) => boughBand(l, x0, top, bot, i, i === 0)))
  g.add(5, (l) => stub(l, 196, 26, -15, -9, 5))
}

/** Little crushed leaf piles resting on the ground under the trunk. */
function litter(g: Painter, ramp: Ramp, far: Ramp) {
  const piles: [number, number, number][] = [
    [34, 57, 6],
    [88, 58, 7],
    [140, 57, 6],
    [166, 59, 5]
  ]
  piles.forEach(([x, y, r], i) => {
    g.add(-1, (l) => puff(l, x - 5, y + 1, r - 1, r - 2, far, 300 + i, 2))
    g.add(0, (l) => puff(l, x + 3, y, r, r - 2, ramp, 310 + i, 3))
  })
}

function drawLog(kind: 'tree' | 'pine'): Raster {
  const g = new Painter(256, 64)
  g.add(0, drawLogTrunk)
  g.add(-2, (l) => {
    stub(l, 104, 42, -4, 13, 6)
    stub(l, 152, 44, 5, 11, 5)
    stub(l, 40, 42, 3, 12, 5)
  })
  if (kind === 'tree') {
    litter(g, LEAF, LEAF_FAR)
    logCrown(g)
  } else {
    litter(g, PINE, PINE_FAR)
    logBoughs(g)
  }
  return g.render()
}

/** Roots, branches and leaves hanging below a log that spans a pit; periodic in x so cells tile. */
function drawUnder(): Raster {
  const g = new Painter(64, 64)
  const wrap = (draw: (l: Raster, ox: number) => void) => (l: Raster) => {
    for (const ox of [-64, 0, 64]) draw(l, ox)
  }
  // the dense bark and soil mass under the log
  g.add(
    0,
    wrap((l, ox) => {
      for (let x = 0; x < 64; x++) {
        const bot = 9 + Math.round(Math.sin(x * 0.4) * 2 + Math.sin(x * 0.17 + 1) * 2)
        for (let y = 0; y <= bot; y++) l.set(x + ox, y, y < 3 ? BARK[3] : y < bot - 2 ? BARK[2] : BARK[3])
      }
    })
  )
  const roots: [number, number, number, number][] = [
    [6, 8, 36, 1],
    [20, 9, 22, -1],
    [33, 8, 46, 1],
    [47, 9, 28, -1],
    [58, 8, 16, 1]
  ]
  roots.forEach(([x, y, len, dir], i) =>
    g.add(
      1,
      wrap((l, ox) => {
        for (let k = 0; k < len; k++) {
          const w = k < len * 0.45 ? 3 : k < len * 0.8 ? 2 : 1
          const cx = x + ox + Math.round(Math.sin(k * 0.22 + i) * 2.2 * dir)
          for (let j = 0; j < w; j++) l.set(cx + j, y + k, j === 0 && w > 1 ? BARK[1] : w === 1 ? BARK[2] : BARK[2])
        }
        // rootlets
        for (const [s, side] of [
          [0.35, 1],
          [0.55, -1]
        ] as const) {
          const sy = y + Math.round(len * s)
          const sx = x + ox + Math.round(Math.sin(Math.round(len * s) * 0.22 + i) * 2.2 * dir)
          l.line(sx, sy, sx + side * 5, sy + 5, BARK[2])
          l.set(sx + side * 6, sy + 6, BARK[2])
        }
      })
    )
  )
  // branches with leaf clumps, diagonal, lower down
  const branches: [number, number, number, number][] = [
    [12, 10, 26, 30],
    [40, 10, 28, 26],
    [52, 12, 56, 34]
  ]
  branches.forEach(([x, y, ex, ey], i) =>
    g.add(
      2,
      wrap((l, ox) => {
        bar(l, [x + ox, y], [ex + ox, ey], 3, BARK[1])
        l.ellipse(ex + ox, ey, 1.6, 1.4, WOOD[1])
        puff(l, ex + ox - 1, ey + 3, 7 - (i % 2), 5, LEAF, 500 + i, 2)
        puff(l, (x + ex) / 2 + ox + 3, (y + ey) / 2 + 1, 5, 4, LEAF_FAR, 520 + i, 1)
      })
    )
  )
  // leaves: dense just under the mass, ragged further down
  const leaves: [number, number, number, number][] = [
    [3, 14, 6, 5],
    [16, 15, 7, 5],
    [30, 13, 6, 5],
    [44, 16, 7, 5],
    [59, 14, 6, 5],
    [10, 24, 5, 4],
    [37, 22, 5, 4],
    [24, 36, 4, 3],
    [50, 42, 4, 3],
    [8, 46, 3, 3]
  ]
  leaves.forEach(([x, y, rx, ry], i) =>
    g.add(
      3,
      wrap((l, ox) => puff(l, x + ox, y, rx, ry, i % 3 === 1 ? LEAF_FAR : LEAF, 600 + i, 1))
    )
  )
  return g.render()
}

export const sheets: SheetModule = {
  'prop:tree': () => {
    const c = treeClips()
    return {
      idle: anim(c.idle, 4, true, { anchor: [64, 124] }),
      cut: anim(c.cut, 4, true, { anchor: [64, 124] }),
      shake: anim(c.shake, 18, false, { anchor: [64, 124] })
    }
  },
  'prop:pine': () => {
    const c = pineClips()
    return {
      idle: anim(c.idle, 4, true, { anchor: [64, 124] }),
      cut: anim(c.cut, 4, true, { anchor: [64, 124] }),
      shake: anim(c.shake, 18, false, { anchor: [64, 124] })
    }
  },
  'prop:log': () => ({
    tree: anim([drawLog('tree')], 1, false, { anchor: [0, 0] }),
    pine: anim([drawLog('pine')], 1, false, { anchor: [0, 0] }),
    under: anim([drawUnder()], 1, false, { anchor: [0, 0] })
  })
}
