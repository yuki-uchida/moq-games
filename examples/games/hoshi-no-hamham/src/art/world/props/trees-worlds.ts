/**
 * The trees of the worlds that are not meadows: `prop:tree|pine|log` with the variants `cave`, `keep` and `star`.
 *
 * Every variant answers the same question as the meadow tree ("the thing I can bite down") with the same clips,
 * frame counts, sizes and anchors, but is made of its own world's stuff:
 *
 * - cave: a glowing fungus tree (pale stalk, violet and teal caps with light spots) and a crystal-capped
 *   stalagmite fungus; the log is a pale stalk with a cap at its end.
 * - keep (fortress and castle): a gnarled, withered courtyard tree (dark bark, bare limbs, a few rust and crimson
 *   leaves) and a ragged dark conifer; the log is dark dead wood.
 * - star: an indigo tree flecked with gold, pale blue-white foliage and twinkling stars; the log is indigo wood with
 *   gold rings.
 *
 * The drawing code is shared with the meadow trees (`trees.ts`): the same sway poses, the same bite and chips, the
 * same log trunk, so the gimmick reads the same in every world.
 */
import type { SheetModule } from '../../module'
import { R, ramp } from '../../palette'
import { Painter, Raster, ball, bar, farRamp, noiseAt, rng, shadeIndex, type Ramp } from '../../raster'
import { lazyAnim } from '../../sheet'
import {
  TIERS,
  bite,
  boughBand,
  calm,
  chips,
  cyl,
  drawLogTrunk,
  drawTier,
  drawUnder,
  fallingLeaf,
  heightOf,
  litter,
  logBoughs,
  logCrown,
  puff,
  stub,
  sway,
  type CrownPose,
  type LogMat
} from './trees'

// ------------------------------------------------------------------------------------------------- materials

// cave: pale stalk, flesh where it is bitten, violet and teal caps, spot light
const STALK = ramp('#fbf3ff', '#e2d3f5', '#b39fd8', '#7a649f', '#2c2147')
const FLESH = ramp('#fff1e0', '#ffd0c0', '#e29aa6', '#a85a7e', '#4a2040')
const VIOLET = ramp('#e6c8ff', '#a874f0', '#7448c0', '#44288a', '#1e1046')
const TEAL = ramp('#c8fff0', '#40d8c4', '#229c98', '#146068', '#0a2a38')
const SPOT = ramp('#ffffff', '#fff6c0', '#ffe08a', '#e0b060', '#7a4a30')

// keep: dark gnarled bark, dead wood, rust and crimson dry leaves, a ragged dark conifer
const DARKBARK = ramp('#a495b4', '#6e5f80', '#463a58', '#2a2038', '#120c1c')
const DEAD = ramp('#e2d6c8', '#b4a496', '#827066', '#52444a', '#2a1c24')
const RUST = ramp('#ffc07a', '#e0762f', '#a8432c', '#632232', '#2a0f1c')
const DRYRED = ramp('#ee8268', '#bd4540', '#862a3c', '#521a30', '#24101c')
const CONIFER = ramp('#8aa496', '#3c5656', '#28383f', '#172128', '#0a1015')

// star: indigo wood, pale blue-white foliage (gold is the shared ramp)
const INDIGO = ramp('#9890e0', '#6258b8', '#40368c', '#262064', '#0e0a2c')
const STARLEAF = ramp('#ffffff', '#dcecff', '#a4bdf0', '#6b80cc', '#232a66')
const GOLD = R.gold

// ------------------------------------------------------------------------------------------- shared helpers

type Leaf = [number, number, number]
/** A stand-in for a sway pose offset: how far a part at relative height `h` (0 low … 1 top) moves. */
const offset = (pose: CrownPose, h: number): [number, number] => [pose.dx * h + pose.whip * h * h, pose.dy * h]

interface Column {
  top: number
  bark: Ramp
  cut: Ramp
  /** Half width of the column at row y. */
  width: (y: number) => number
  /** Centre column at row y (default 64). */
  centre?: (y: number) => number
  /** Groove positions across the column (−1 … 1) and a seed. */
  grooves: number[]
  seed: number
}

/** A shaded vertical column (trunk, stalk): cylinder bands, grooves, root toes, and the bite. */
function column(l: Raster, c: Column, bitten: boolean) {
  const mid = c.centre ?? (() => 64)
  for (let y = c.top; y <= 124; y++) {
    const w = c.width(y)
    const cx = mid(y)
    for (let x = Math.ceil(cx - w); x < Math.ceil(cx + w); x++) l.set(x, y, c.bark[cyl((x + 0.5 - cx) / w)])
  }
  c.grooves.forEach((u0, gi) => {
    const rnd = rng(c.seed + gi * 17)
    let y = c.top + Math.floor(rnd() * 8)
    while (y < 122) {
      const len = 5 + Math.floor(rnd() * 7)
      for (let k = 0; k < len && y + k < 122; k++) {
        const x = Math.floor(mid(y + k) + u0 * c.width(y + k))
        const i = c.bark.indexOf(l.get(x, y + k))
        if (i >= 0) l.set(x, y + k, c.bark[Math.min(3, i + 1)])
      }
      y += len + 4 + Math.floor(rnd() * 6)
    }
  })
  const wl = c.width(124)
  const xl = Math.round(mid(124) - wl)
  const xr = Math.round(mid(124) + wl)
  for (let k = 0; k < 4; k++) {
    l.set(xl - k, 124, c.bark[3])
    l.set(xr + k, 124, c.bark[3])
  }
  l.rect(xl - 2, 123, 3, 1, c.bark[2])
  l.rect(xr, 123, 3, 1, c.bark[3])
  if (bitten) bite(l, Math.round(mid(110) + c.width(110) + 1.5), c.cut)
}

/** Bite chips in the colour of the cut face. */
const biteChips = (l: Raster, cut: Ramp) => chips(l, cut)

/** A four-pointed twinkle: size 0 a soft dot, 1 a plus, 2 a long cross. */
function twinkle(l: Raster, x: number, y: number, size: number, core: Ramp = GOLD) {
  if (size === 0) {
    l.rect(x, y, 2, 2, core[1])
    l.set(x, y, core[0])
    return
  }
  const arm = size + 1
  for (let k = 1; k <= arm; k++) {
    const c = k === arm ? core[2] : core[1]
    l.set(x - k, y, c)
    l.set(x + k, y, c)
    l.set(x, y - k, c)
    l.set(x, y + k, c)
  }
  l.rect(x - 1, y - 1, 3, 3, core[0])
}

/** A five-point star, 11 px tall, light from the top-left. */
function bigStar(l: Raster, cx: number, cy: number, r: number, ramp: Ramp) {
  const pts: number[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.45
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr + 0.4)
  }
  l.poly(pts, ramp[1])
  l.poly([cx - r * 0.2, cy - r * 0.9, cx - r * 0.95, cy - r * 0.2, cx - r * 0.3, cy - r * 0.15], ramp[0])
  l.poly([cx + r * 0.1, cy + 0.2, cx + r * 0.62, cy + r * 0.92, cx + r * 0.2, cy + r * 0.45], ramp[2])
  l.set(cx, cy, ramp[0])
}

// ------------------------------------------------------------------------------------------------------ cave

interface CapStyle {
  cx: number
  cy: number
  rx: number
  ry: number
  /** Spots as [x, y, radius] in units of the cap's half width / height. */
  spots: [number, number, number][]
}

/**
 * A mushroom cap seen from the side: a lit dome over a dark gill band, with light spots. `glow` 0|1 pulses the spots.
 */
function cap(l: Raster, c: CapStyle, cr: Ramp, glow: number) {
  const { cx, cy, rx, ry } = c
  const dome = new Raster(l.w, l.h)
  ball(dome, cx, cy, rx, ry, cr)
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) if (dome.get(x, y) && y <= cy) l.set(x, y, dome.get(x, y))
  // gill band under the dome: curved lower edge, dark with lighter gills
  const gh = Math.max(3, Math.round(ry * 0.34))
  for (let k = 1; k <= gh; k++) {
    const e = rx * Math.sqrt(Math.max(0, 1 - (k / (gh + 3)) ** 2)) * 0.97
    for (let x = Math.ceil(cx - e); x <= Math.floor(cx + e); x++)
      l.set(x, cy + k, (x - Math.round(cx)) % 3 === 0 && k < gh ? cr[2] : cr[3])
  }
  // light spots
  const fill = glow ? [SPOT[0], SPOT[0], SPOT[1]] : [SPOT[0], SPOT[1], SPOT[2]]
  for (const [sx, sy, sr] of c.spots) {
    const px = cx + sx * rx
    const py = cy + sy * ry
    const squash = 1 - Math.abs(sx) * 0.35
    const probe = l.get(Math.round(px), Math.round(py))
    if (!probe) continue
    l.ellipse(px, py, sr * squash, sr * 0.8, fill[1])
    l.set(px - sr * squash * 0.5, py - sr * 0.4, fill[0])
    l.set(px + sr * squash * 0.3, py + sr * 0.5, fill[2])
  }
}

const CAVE_STALK: Column = {
  top: 56,
  bark: STALK,
  cut: FLESH,
  width: (y) => 8.4 + Math.sin(y * 0.13) * 0.8 + (y > 100 ? (y - 100) * 0.16 + (y > 114 ? (y - 114) * 0.35 : 0) : 0),
  grooves: [-0.5, 0.1, 0.6],
  seed: 940
}

interface CaveCap extends CapStyle {
  ramp: Ramp
  /** Relative height for the sway, and the branch stalk that carries the cap, if any. */
  h: number
  branch?: [number, number]
  depth: number
}

const CAVE_CAPS: CaveCap[] = [
  {
    cx: 64,
    cy: 47,
    rx: 42,
    ry: 27,
    ramp: VIOLET,
    h: 0.95,
    depth: 3,
    spots: [
      [-0.5, -0.5, 2.6],
      [0.1, -0.78, 2],
      [0.55, -0.45, 3],
      [-0.12, -0.28, 1.6],
      [0.78, -0.12, 1.6],
      [-0.82, -0.12, 1.8]
    ]
  },
  {
    cx: 30,
    cy: 81,
    rx: 22,
    ry: 13,
    ramp: TEAL,
    h: 0.5,
    branch: [58, 98],
    depth: 2,
    spots: [
      [-0.4, -0.5, 2],
      [0.35, -0.6, 1.6],
      [0.02, -0.15, 1.5]
    ]
  },
  {
    cx: 99,
    cy: 71,
    rx: 18,
    ry: 11,
    ramp: VIOLET,
    h: 0.65,
    branch: [70, 90],
    depth: 2,
    spots: [
      [-0.35, -0.5, 1.8],
      [0.4, -0.35, 1.6]
    ]
  }
]

/** Small caps clustered around the foot. */
const CAVE_FOOT: CaveCap[] = [
  { cx: 41, cy: 117, rx: 7, ry: 5, ramp: TEAL, h: 0, depth: 1, spots: [[-0.3, -0.5, 1.4]] },
  { cx: 51, cy: 119, rx: 5, ry: 4, ramp: VIOLET, h: 0, depth: 1, spots: [] },
  { cx: 90, cy: 119, rx: 7, ry: 5, ramp: VIOLET, h: 0, depth: 1, spots: [[0.2, -0.5, 1.4]] },
  { cx: 100, cy: 120, rx: 5, ry: 3, ramp: TEAL, h: 0, depth: 1, spots: [] }
]

function drawFungusTree(pose: CrownPose, bitten: boolean, spores: Leaf[], phase: number): Raster {
  const g = new Painter(128, 128)
  g.add(0, (l) => column(l, CAVE_STALK, bitten))
  // the skirt ring on the stalk
  g.add(1, (l) => {
    const w = CAVE_STALK.width(86)
    ball(l, 64, 87, w + 5.5, 3.4, STALK)
    l.ellipse(64, 89, w + 3, 1.2, STALK[3])
  })
  for (const f of CAVE_FOOT) g.add(f.depth, (l) => cap(l, f, f.ramp, phase % 2))
  CAVE_CAPS.forEach((c, i) => {
    const [ox, oy] = offset(pose, c.h)
    const moved = { ...c, cx: c.cx + ox, cy: c.cy + oy, rx: c.rx * pose.sx, ry: c.ry / Math.sqrt(pose.sx) }
    if (c.branch)
      g.add(c.depth - 0.5, (l) => {
        bar(l, c.branch!, [c.cx + ox * 0.8, c.cy + oy + 4], 4, STALK[1])
        bar(l, [c.branch![0] + 1, c.branch![1]], [c.cx + ox * 0.8 + 1, c.cy + oy + 4], 2, STALK[2])
      })
    g.add(c.depth, (l) => cap(l, moved, c.ramp, (phase + i) % 2))
  })
  if (bitten) g.add(5, (l) => biteChips(l, FLESH))
  spores.forEach(([x, y, k]) => g.add(6, (l) => fallingLeaf(l, x, y, k, k % 2 ? TEAL : VIOLET)))
  return g.render()
}

/** A crystal prism: a lit left facet and a dark right facet meeting in a pointed tip. */
function crystal(l: Raster, bx: number, by: number, tx: number, ty: number, w: number, cr: Ramp) {
  const len = by - ty
  for (let y = ty; y <= by; y++) {
    const t = (y - ty) / len
    const xc = tx + (bx - tx) * t
    const hw = Math.max(0.6, (w / 2) * Math.min(1, t * 1.25) ** 0.8)
    const x0 = Math.round(xc - hw)
    const x1 = Math.round(xc + hw)
    for (let x = x0; x <= x1; x++) {
      const u = (x - xc) / hw
      const top = t < 0.18
      l.set(x, y, top ? cr[0] : u < -0.15 ? (t < 0.5 ? cr[0] : cr[1]) : u < 0.45 ? cr[1] : cr[2])
    }
    l.set(x1, y, cr[3])
  }
}

const PINE_STALK: Column = {
  top: 38,
  bark: STALK,
  cut: FLESH,
  width: (y) => 4.4 + 15.8 * Math.max(0, (y - 30) / 94) ** 1.35,
  grooves: [-0.55, -0.1, 0.35, 0.7],
  seed: 960
}

interface Shelf {
  cx: number
  cy: number
  rx: number
  ry: number
  ramp: Ramp
  h: number
}

const SHELVES: Shelf[][] = [
  [
    { cx: 36, cy: 93, rx: 21, ry: 10, ramp: VIOLET, h: 0.2 },
    { cx: 92, cy: 93, rx: 21, ry: 10, ramp: VIOLET, h: 0.2 }
  ],
  [
    { cx: 43, cy: 71, rx: 16, ry: 8, ramp: TEAL, h: 0.6 },
    { cx: 85, cy: 71, rx: 16, ry: 8, ramp: TEAL, h: 0.6 }
  ],
  [
    { cx: 51, cy: 51, rx: 11, ry: 6, ramp: VIOLET, h: 1 },
    { cx: 77, cy: 51, rx: 11, ry: 6, ramp: VIOLET, h: 1 }
  ]
]

function drawStalagmite(pose: CrownPose, bitten: boolean, spores: Leaf[], phase: number): Raster {
  const g = new Painter(128, 128)
  g.add(0, (l) => column(l, PINE_STALK, bitten))
  SHELVES.forEach((pair, ti) =>
    pair.forEach((s, side) => {
      const [ox, oy] = offset(pose, s.h)
      const moved = {
        cx: s.cx + ox,
        cy: s.cy + oy + 3,
        rx: s.rx,
        ry: s.ry,
        spots: [
          [-0.35, -0.5, 1.6],
          [0.35, -0.35, 1.4]
        ] as [number, number, number][]
      }
      // drooping bracket: the outer cap sits a little lower
      g.add(1 + ti, (l) => cap(l, { ...moved, cy: moved.cy + (side === 0 ? 1 : 0) }, s.ramp, (phase + ti + side) % 2))
    })
  )
  // the crystal cluster crowning the stalk
  const [cx, cy0] = offset(pose, 1)
  const cy = cy0 + 3
  g.add(4, (l) => {
    crystal(l, 52 + cx * 0.6, 44 + cy, 48 + cx, 27 + cy, 6, TEAL)
    crystal(l, 76 + cx * 0.6, 44 + cy, 79 + cx, 25 + cy, 6, TEAL)
    crystal(l, 64 + cx * 0.6, 46 + cy, 64 + cx, 18 + cy, 10, TEAL)
  })
  g.add(
    4.5,
    (l) => {
      // a glint that alternates between the two side crystals
      const p = phase % 2 === 0 ? [63 + cx, 24 + cy] : [48 + cx, 31 + cy]
      l.set(p[0], p[1], SPOT[0])
      l.set(p[0], p[1] + 1, SPOT[0])
    },
    false
  )
  if (bitten) g.add(5, (l) => biteChips(l, FLESH))
  spores.forEach(([x, y, k]) => g.add(6, (l) => fallingLeaf(l, x, y, k, k % 2 ? TEAL : VIOLET)))
  return g.render()
}

// ------------------------------------------------------------------------------------------------------ keep

const KEEP_TRUNK: Column = {
  top: 58,
  bark: DARKBARK,
  cut: DEAD,
  width: (y) => 9.6 + Math.sin(y * 0.2) * 1.1 + (y > 100 ? (y - 100) * 0.12 + (y > 114 ? (y - 114) * 0.4 : 0) : 0),
  centre: (y) => 64 + Math.sin((y - 40) * 0.085) * 3.4,
  grooves: [-0.6, -0.2, 0.25, 0.62, 0.85],
  seed: 980
}

/** A sparse cluster of dry leaves (no solid crown): a few leaf shapes scattered in an ellipse. */
function leafCluster(l: Raster, cx: number, cy: number, rx: number, ry: number, seed: number, a: Ramp, b: Ramp) {
  const rnd = rng(seed)
  const n = Math.max(4, Math.round((rx * ry) / 5))
  for (let k = 0; k < n; k++) {
    const ang = rnd() * Math.PI * 2
    const d = Math.sqrt(rnd())
    const x = Math.round(cx + Math.cos(ang) * d * rx - 2)
    const y = Math.round(cy + Math.sin(ang) * d * ry - 1)
    fallingLeaf(l, x, y, k, k % 3 === 2 ? b : a)
  }
}

interface Limb {
  /** Start on the trunk, end, and width at the start. */
  from: [number, number]
  to: [number, number]
  w: number
  /** Twigs: [t along the limb, end x, end y]. */
  twigs: [number, number, number][]
  h: number
}

const LIMBS: Limb[] = [
  {
    from: [61, 70],
    to: [28, 46],
    w: 6,
    h: 0.55,
    twigs: [
      [0.55, 40, 32],
      [1, 15, 36],
      [1, 22, 30]
    ]
  },
  {
    from: [67, 68],
    to: [100, 40],
    w: 6,
    h: 0.75,
    twigs: [
      [0.5, 88, 28],
      [1, 112, 34],
      [1, 106, 28]
    ]
  },
  {
    from: [64, 62],
    to: [58, 26],
    w: 5,
    h: 1,
    twigs: [
      [0.5, 46, 28],
      [0.7, 72, 22],
      [1, 54, 18]
    ]
  },
  {
    from: [60, 86],
    to: [24, 80],
    w: 4,
    h: 0.2,
    twigs: [
      [0.6, 40, 92],
      [1, 14, 74]
    ]
  },
  {
    from: [68, 82],
    to: [104, 74],
    w: 4,
    h: 0.25,
    twigs: [
      [0.6, 90, 88],
      [1, 114, 80]
    ]
  }
]

/** Sparse leaf clumps hanging on the limbs: [x, y, rx, ry, rust?, h]. */
const CLUMPS: [number, number, number, number, boolean, number][] = [
  [26, 46, 9, 6, true, 0.55],
  [100, 42, 10, 7, false, 0.75],
  [58, 26, 8, 6, false, 1],
  [38, 34, 5, 4, true, 0.8],
  [88, 30, 6, 5, true, 0.9],
  [21, 78, 7, 5, false, 0.2],
  [104, 76, 8, 6, true, 0.25],
  [76, 56, 5, 4, false, 0.5]
]

function drawWitheredTree(pose: CrownPose, bitten: boolean, leaves: Leaf[]): Raster {
  const g = new Painter(128, 128)
  g.add(0, (l) => {
    column(l, KEEP_TRUNK, bitten)
    // a hollow, and a snapped branch stub on the right
    l.ellipse(61, 94, 3.2, 5, DARKBARK[3])
    l.ellipse(60.6, 93.4, 2, 3.4, DARKBARK[4])
    l.rect(58, 88, 2, 1, DARKBARK[0])
    bar(l, [72, 84], [82, 79], 4, DARKBARK[1])
    l.ellipse(82, 79, 2, 2.2, DEAD[1])
    l.set(81, 78, DEAD[0])
  })
  LIMBS.forEach((lb, i) => {
    const [ox, oy] = offset(pose, lb.h)
    const tip: [number, number] = [lb.to[0] + ox, lb.to[1] + oy]
    const mid: [number, number] = [(lb.from[0] + tip[0]) / 2, (lb.from[1] + tip[1]) / 2 - 1]
    g.add(1, (l) => {
      bar(l, lb.from, mid, lb.w, DARKBARK[1])
      bar(l, mid, tip, Math.max(2, lb.w - 2), DARKBARK[1])
      bar(l, [lb.from[0] + 1, lb.from[1] + 1], [mid[0] + 1, mid[1] + 1], Math.max(1, lb.w - 3), DARKBARK[2])
    })
    g.add(
      1.5,
      (l) => {
        for (const [t, ex, ey] of lb.twigs) {
          const sx = lb.from[0] + (tip[0] - lb.from[0]) * Math.min(1, t)
          const sy = lb.from[1] + (tip[1] - lb.from[1]) * Math.min(1, t)
          bar(l, [sx, sy], [ex + ox, ey + oy], 1, DARKBARK[1])
        }
      },
      false
    )
    void i
  })
  CLUMPS.forEach(([x, y, rx, ry, rust, h], i) => {
    const [ox, oy] = offset(pose, h)
    g.add(2 + (i % 2), (l) => {
      leafCluster(l, x + ox, y + oy, rx * pose.sx, ry, 1040 + i * 7, rust ? RUST : DRYRED, rust ? DRYRED : RUST)
    })
  })
  if (bitten) g.add(5, (l) => biteChips(l, DEAD))
  leaves.forEach(([x, y, k]) => g.add(6, (l) => fallingLeaf(l, x, y, k, k % 2 ? RUST : DRYRED)))
  return g.render()
}

/** Shreds the lower edge of a bough and cuts a few holes, in coordinates local to the tier's axis. */
function ragged(l: Raster, axis: number, t: { top: number; bot: number; hw: number }, seed: number) {
  for (let x = axis - t.hw; x <= axis + t.hw; x += 1) {
    // sharp drooping teeth of uneven length, so the boughs hang in rags
    const tooth = Math.floor((x - axis + 400) / 5)
    const u = ((x - axis + 400) % 5) / 5
    const len = 3 + noiseAt(tooth, seed, 11) * 11
    const edge = t.bot - 12 + len * (1 - Math.abs(u * 2 - 1))
    for (let y = Math.ceil(edge); y <= t.bot + 3; y++) l.set(x, y, 0)
  }
}

function drawRaggedPine(pose: CrownPose, bitten: boolean, needles: Leaf[]): Raster {
  const g = new Painter(128, 128)
  const trunk: Column = {
    top: 70,
    bark: DARKBARK,
    cut: DEAD,
    width: (y) => 6.6 + Math.sin(y * 0.15) * 0.7 + (y > 104 ? (y - 104) * 0.14 + (y > 116 ? (y - 116) * 0.35 : 0) : 0),
    centre: (y) => 64 + Math.sin(y * 0.05) * 1.6,
    grooves: [-0.5, 0.05, 0.55],
    seed: 1100
  }
  g.add(0, (l) => column(l, trunk, bitten))
  TIERS.forEach((t, i) => {
    const [ox, oy] = offset(pose, t.h)
    const tier = { ...t, top: t.top + oy + 3, bot: t.bot + oy + 3, hw: t.hw * (i === 0 ? 0.92 : 0.9) }
    const axis = 64 + ox + (i === 1 ? -2 : i === 2 ? 1 : 0)
    g.add(1 + i, (l) => {
      drawTier(l, axis, tier, i === 0 ? farRamp(CONIFER) : CONIFER, 1120 + i * 5)
      ragged(l, Math.round(axis), tier, 1130 + i)
    })
    // dead twigs poking out of the bough tips
    g.add(
      1.5 + i,
      (l) => {
        const y = tier.bot - 14
        for (const s of [-1, 1]) {
          const x0 = axis + s * tier.hw * 0.72
          bar(l, [x0, y], [x0 + s * (7 + i), y - 2 - i], 1, DARKBARK[1])
        }
      },
      false
    )
  })
  // a snapped, dead leader instead of a tip
  const [tx, ty] = offset(pose, 1)
  g.add(5, (l) => {
    bar(l, [64 + tx, 33 + ty], [66 + tx * 1.1, 22 + ty], 3, DARKBARK[1])
    l.rect(65 + tx, 21 + ty, 3, 1, DEAD[1])
  })
  if (bitten) g.add(5, (l) => biteChips(l, DEAD))
  needles.forEach(([x, y, k]) => g.add(6, (l) => fallingLeaf(l, x, y, k, CONIFER)))
  return g.render()
}

// ------------------------------------------------------------------------------------------------------ star

const STAR_TRUNK: Column = {
  top: 54,
  bark: INDIGO,
  cut: GOLD,
  width: (y) => 11.4 + Math.sin(y * 0.11) * 0.7 + (y > 104 ? (y - 104) * 0.1 + (y > 116 ? (y - 116) * 0.3 : 0) : 0),
  centre: (y) => 64 + Math.sin((y - 50) * 0.06) * 1.6,
  grooves: [-0.6, -0.22, 0.2, 0.55, 0.82],
  seed: 1200
}

/** Gold flecks scattered over the wood (2×2 chips). */
function flecks(l: Raster, c: Column, n: number, seed: number) {
  const rnd = rng(seed)
  for (let k = 0; k < n; k++) {
    const y = c.top + 4 + Math.floor(rnd() * (116 - c.top))
    const w = c.width(y)
    const x = Math.round((c.centre ?? (() => 64))(y) + (rnd() * 2 - 1) * w * 0.7)
    if (!l.get(x, y) || !l.get(x + 1, y + 1)) continue
    l.rect(x, y, 2, 2, GOLD[2])
    l.set(x, y, GOLD[0])
    l.set(x + 1, y, GOLD[1])
    l.set(x, y + 1, GOLD[1])
  }
}

const STAR_PUFFS: { x: number; y: number; rx: number; ry: number; back?: boolean }[] = [
  { x: 38, y: 58, rx: 16, ry: 13, back: true },
  { x: 90, y: 58, rx: 16, ry: 13, back: true },
  { x: 52, y: 40, rx: 16, ry: 13, back: true },
  { x: 76, y: 40, rx: 16, ry: 13, back: true },
  { x: 64, y: 52, rx: 22, ry: 16, back: true },
  { x: 24, y: 66, rx: 11, ry: 10 },
  { x: 104, y: 66, rx: 11, ry: 10 },
  { x: 34, y: 48, rx: 13, ry: 11 },
  { x: 94, y: 48, rx: 13, ry: 11 },
  { x: 49, y: 34, rx: 13, ry: 11 },
  { x: 79, y: 34, rx: 13, ry: 11 },
  { x: 64, y: 31, rx: 13, ry: 10 },
  { x: 64, y: 46, rx: 14, ry: 12 },
  { x: 36, y: 74, rx: 15, ry: 11 },
  { x: 92, y: 74, rx: 15, ry: 11 },
  { x: 51, y: 70, rx: 14, ry: 11 },
  { x: 77, y: 70, rx: 14, ry: 11 },
  { x: 64, y: 76, rx: 15, ry: 10 }
]

/** Twinkle sites on the crown: [x, y, phase offset, relative height]. */
const SPARKLES: [number, number, number, number][] = [
  [44, 50, 0, 0.5],
  [86, 44, 1, 0.65],
  [66, 38, 2, 0.9],
  [30, 70, 1, 0.3],
  [98, 72, 2, 0.3],
  [64, 68, 0, 0.35]
]

function drawStarTree(pose: CrownPose, bitten: boolean, leaves: Leaf[], phase: number): Raster {
  const g = new Painter(128, 128)
  g.add(0, (l) => {
    column(l, STAR_TRUNK, bitten)
    flecks(l, STAR_TRUNK, 16, 1250)
  })
  STAR_PUFFS.forEach((p, i) => {
    const [ox, oy] = offset(pose, heightOf(p.y))
    const depth = p.back ? 1 : i >= 13 ? 4 : p.y > 55 ? 3 : 2
    g.add(depth, (l) =>
      puff(
        l,
        p.x + ox,
        p.y + oy + 5,
        p.rx * pose.sx,
        p.ry / Math.sqrt(pose.sx),
        p.back ? farRamp(STARLEAF) : STARLEAF,
        1260 + i * 7,
        6
      )
    )
  })
  const [sx, sy] = offset(pose, 1)
  g.add(5, (l) => bigStar(l, 64 + sx, 23 + sy * 0.6, 6, GOLD))
  SPARKLES.forEach(([x, y, ph, h]) => {
    const [ox, oy] = offset(pose, h)
    g.add(5, (l) => twinkle(l, Math.round(x + ox), Math.round(y + oy + 5), (phase + ph) % 3), false)
  })
  if (bitten) g.add(5, (l) => biteChips(l, GOLD))
  leaves.forEach(([x, y, k]) => g.add(6, (l) => fallingLeaf(l, x, y, k, k % 2 ? STARLEAF : GOLD)))
  return g.render()
}

function drawStarPine(pose: CrownPose, bitten: boolean, needles: Leaf[], phase: number): Raster {
  const g = new Painter(128, 128)
  const trunk: Column = { ...STAR_TRUNK, top: 96, width: (y) => 9 + (y > 104 ? (y - 104) * 0.12 : 0), seed: 1300 }
  g.add(0, (l) => {
    column(l, trunk, bitten)
    flecks(l, { ...trunk, top: 98 }, 6, 1310)
  })
  TIERS.forEach((t, i) => {
    const [ox, oy] = offset(pose, t.h)
    g.add(1 + i, (l) =>
      drawTier(
        l,
        64 + ox,
        { ...t, top: t.top + oy + 3, bot: t.bot + oy + 3 },
        i === 0 ? farRamp(STARLEAF) : STARLEAF,
        1320 + i
      )
    )
  })
  const [tx, ty] = offset(pose, 1)
  g.add(5, (l) => bigStar(l, 64 + tx, 23 + ty + 3, 6.5, GOLD))
  const spots: [number, number, number, number][] = [
    [50, 52, 0, 0.6],
    [78, 76, 1, 0.5],
    [38, 94, 2, 0.2],
    [90, 98, 0, 0.2],
    [62, 70, 2, 0.5]
  ]
  spots.forEach(([x, y, ph, h]) => {
    const [ox, oy] = offset(pose, h)
    g.add(5, (l) => twinkle(l, Math.round(x + ox), Math.round(y + oy + 3), (phase + ph) % 3), false)
  })
  if (bitten) g.add(5, (l) => biteChips(l, GOLD))
  needles.forEach(([x, y, k]) => g.add(6, (l) => fallingLeaf(l, x, y, k, k % 2 ? STARLEAF : GOLD)))
  return g.render()
}

// ------------------------------------------------------------------------------------------------------ clips

type TreeDraw = (pose: CrownPose, bitten: boolean, bits: Leaf[], phase: number) => Raster

const TREE_SHAKE: Leaf[][] = [
  [[34, 66, 0]],
  [
    [28, 78, 1],
    [98, 74, 2],
    [60, 90, 0]
  ],
  [
    [26, 92, 2],
    [100, 94, 0],
    [66, 104, 1],
    [46, 100, 1]
  ]
]
const PINE_SHAKE: Leaf[][] = [
  [[30, 98, 0]],
  [
    [22, 90, 1],
    [104, 94, 2],
    [60, 108, 0]
  ],
  [
    [20, 108, 2],
    [106, 110, 0],
    [70, 116, 1],
    [38, 112, 1]
  ]
]
const TREE_SHAKE_POSE = [
  calm({ dx: -4, dy: 3, sx: 1.07, whip: -1 }),
  calm({ dx: 5, dy: -2, sx: 0.95, whip: 3 }),
  calm({ dx: -2, dy: 1, sx: 1.02, whip: -1 })
]
const PINE_SHAKE_POSE = [
  calm({ dx: -3, dy: 3, sx: 1, whip: -1 }),
  calm({ dx: 4, dy: -1, sx: 1, whip: 3 }),
  calm({ dx: -2, dy: 1, sx: 1, whip: -1 })
]

function treeSheet(draw: TreeDraw, shakePose: CrownPose[], shakeBits: Leaf[][]) {
  const idle = () => [0, 1, 2, 3].map((i) => draw(sway(i / 4), false, [], i))
  const cut = () => [0, 1, 2, 3].map((i) => draw(sway(i / 4), true, [], i))
  const shake = () => [0, 1, 2].map((i) => draw(shakePose[i], false, shakeBits[i], i))
  const o = { anchor: [64, 124] as [number, number] }
  return {
    idle: lazyAnim(idle, 4, true, o),
    cut: lazyAnim(cut, 4, true, o),
    shake: lazyAnim(shake, 18, false, o)
  }
}

// ------------------------------------------------------------------------------------------------------- logs

const LOG_X1 = 214

/** Soft bands across a lying stalk: a ring every so often. */
function stalkRings(l: Raster) {
  for (const x0 of [64, 112, 158]) {
    for (let y = 0; y < l.h; y++)
      for (let k = 0; k < 4; k++) {
        const c = l.get(x0 + k, y)
        const i = STALK.indexOf(c)
        if (i < 0 || y < 3) continue
        l.set(
          x0 + k,
          y,
          k === 3 ? STALK[Math.min(3, i + 1)] : k === 0 ? STALK[Math.max(0, i - 1)] : STALK[Math.min(3, i + 1)]
        )
      }
  }
  // pores
  for (const [x, y] of [
    [38, 20],
    [86, 36],
    [134, 18],
    [182, 36]
  ])
    l.ellipse(x, y, 2.4, 1.8, STALK[3])
}

const LOG_CAVE: LogMat = { bark: STALK, wood: FLESH, moss: TEAL, furrows: false, extra: stalkRings }
const LOG_KEEP: LogMat = { bark: DARKBARK, wood: DEAD, moss: null, furrows: true }
const LOG_STAR: LogMat = {
  bark: INDIGO,
  wood: GOLD,
  moss: STARLEAF,
  furrows: true,
  extra: (l) => {
    // gold rings around the wood, shaded like the wood
    for (const x0 of [56, 100, 144]) {
      for (let y = 0; y < l.h; y++) {
        if (INDIGO.indexOf(l.get(x0, y)) < 0) continue
        const v = (y - 3) / 49
        const step = cyl(v * 2 - 1)
        for (let k = 0; k < 4; k++) l.set(x0 + k, y, GOLD[k === 0 ? step : Math.min(3, step + (k > 1 ? 1 : 0))])
      }
    }
  }
}

/** A lying cap at the end of the stalk: a lit dome that faces right, dark gills where the stalk joins it. */
function logCap(g: Painter) {
  g.add(1, (l) => {
    // a broad, flat-topped dome (superellipse) so the top of the log stays walkable all the way
    for (let y = 0; y < l.h; y++)
      for (let x = 196; x < l.w; x++) {
        const nx = (x + 0.5 - 226) / 31
        const ny = (y + 0.5 - 29) / 27
        if (Math.abs(nx) ** 3 + Math.abs(ny) ** 3 > 1) continue
        const nz = Math.sqrt(Math.max(0, 1 - (nx * nx + ny * ny) * 0.7))
        l.set(x, y, VIOLET[shadeIndex(nx * 0.8, ny * 0.8, nz)])
      }
    for (let y = 4; y < 56; y++) {
      const e = 6 * Math.sqrt(Math.max(0, 1 - ((y - 30) / 27) ** 2))
      for (let k = 0; k < e; k++) l.set(196 + k, y, (y + k) % 3 === 0 ? VIOLET[2] : VIOLET[3])
    }
    for (const [x, y, r] of [
      [226, 14, 3.4],
      [240, 24, 2.6],
      [214, 24, 2.2],
      [236, 40, 2.8]
    ]) {
      l.ellipse(x, y, r, r * 0.85, SPOT[1])
      l.set(x - r * 0.4, y - r * 0.4, SPOT[0])
      l.set(x + r * 0.3, y + r * 0.4, SPOT[2])
    }
  })
  g.add(2, (l) => {
    const dome = new Raster(l.w, l.h)
    ball(dome, 238, 49, 17, 13, TEAL)
    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) if (dome.get(x, y)) l.set(x, y, dome.get(x, y))
    l.ellipse(242, 46, 2, 1.6, SPOT[1])
    l.set(241, 45, SPOT[0])
  })
}

/** Shelf caps and crystals piled on the end of a fallen stalagmite fungus. */
function logShelves(g: Painter) {
  const bands: [number, number, number, Ramp][] = [
    [185, 1, 22, TEAL],
    [187, 15, 36, VIOLET],
    [190, 29, 50, TEAL],
    [193, 43, 66, VIOLET]
  ]
  bands.forEach(([x0, top, bot, r], i) => g.add(4 - i, (l) => boughBand(l, x0, top, bot, i, i === 0, r)))
  g.add(5, (l) => {
    crystal(l, 224, 14, 238, 2, 10, TEAL)
    crystal(l, 244, 22, 252, 6, 7, TEAL)
  })
}

/** A bare crown on a dead log: snapped limbs and a few dry leaves. */
function logTwigs(g: Painter) {
  g.add(1, (l) => {
    const limbs: [number, number, number, number, number][] = [
      [200, 9, 252, 7, 9],
      [196, 30, 240, 14, 5],
      [200, 36, 252, 30, 5],
      [198, 42, 236, 56, 4]
    ]
    for (const [x, y, ex, ey, w] of limbs) {
      bar(l, [x, y], [ex, ey], w, DARKBARK[1])
      bar(l, [x + 2, y + 1], [ex, ey + 1], Math.max(1, w - 3), DARKBARK[2])
      bar(l, [(x + ex) / 2, (y + ey) / 2], [(x + ex) / 2 + 8, (y + ey) / 2 - 9], 2, DARKBARK[2])
    }
  })
  const clumps: [number, number, number, number, boolean][] = [
    [236, 12, 8, 6, true],
    [248, 31, 7, 6, false],
    [232, 54, 8, 6, true],
    [214, 20, 6, 5, false]
  ]
  clumps.forEach(([x, y, rx, ry, rust], i) =>
    g.add(3, (l) => leafCluster(l, x, y, rx + 3, ry + 2, 1400 + i, rust ? RUST : DRYRED, rust ? DRYRED : RUST))
  )
}

/** The crown of a fallen star tree: pale foliage with a gold star and twinkles. */
function logStars(g: Painter) {
  logCrown(g, STARLEAF, farRamp(STARLEAF), INDIGO, GOLD)
  g.add(5, (l) => {
    bigStar(l, 232, 14, 6.5, GOLD)
    twinkle(l, 204, 22, 1)
    twinkle(l, 250, 40, 2)
    twinkle(l, 216, 46, 0)
  })
}

function logStarBoughs(g: Painter) {
  logBoughs(g, STARLEAF, INDIGO, GOLD)
  g.add(5, (l) => {
    bigStar(l, 238, 12, 6.5, GOLD)
    twinkle(l, 210, 30, 2)
    twinkle(l, 246, 48, 1)
  })
}

function drawWorldLog(
  mat: LogMat,
  litterRamp: Ramp,
  pile: (g: Painter) => void,
  roots: { bark: Ramp; wood: Ramp }
): Raster {
  const g = new Painter(256, 64)
  g.add(0, (l) => drawLogTrunk(l, mat))
  g.add(-2, (l) => {
    stub(l, 104, 42, -4, 13, 6, roots.bark, roots.wood)
    stub(l, 152, 44, 5, 11, 5, roots.bark, roots.wood)
    stub(l, 40, 42, 3, 12, 5, roots.bark, roots.wood)
  })
  litter(g, litterRamp, farRamp(litterRamp))
  pile(g)
  return g.render()
}

// ------------------------------------------------------------------------------------------------ the sheets

const variant = (tree: TreeDraw, pine: TreeDraw, log: Record<'tree' | 'pine', () => Raster>, under: () => Raster) => ({
  tree: () => treeSheet(tree, TREE_SHAKE_POSE, TREE_SHAKE),
  pine: () => treeSheet(pine, PINE_SHAKE_POSE, PINE_SHAKE),
  log: () => ({
    tree: lazyAnim(() => [log.tree()], 1, false, { anchor: [0, 0] }),
    pine: lazyAnim(() => [log.pine()], 1, false, { anchor: [0, 0] }),
    under: lazyAnim(() => [under()], 1, false, { anchor: [0, 0] })
  })
})

const cave = variant(
  drawFungusTree,
  drawStalagmite,
  {
    tree: () => drawWorldLog(LOG_CAVE, TEAL, logCap, { bark: STALK, wood: FLESH }),
    pine: () => drawWorldLog(LOG_CAVE, VIOLET, logShelves, { bark: STALK, wood: FLESH })
  },
  () => drawUnder({ bark: STALK, wood: FLESH, leaf: TEAL, leafFar: farRamp(VIOLET) })
)

const keep = variant(
  (pose, bitten, bits) => drawWitheredTree(pose, bitten, bits),
  (pose, bitten, bits) => drawRaggedPine(pose, bitten, bits),
  {
    tree: () => drawWorldLog(LOG_KEEP, DRYRED, logTwigs, { bark: DARKBARK, wood: DEAD }),
    pine: () =>
      drawWorldLog(LOG_KEEP, CONIFER, (g) => logBoughs(g, CONIFER, DARKBARK, DEAD), { bark: DARKBARK, wood: DEAD })
  },
  () => drawUnder({ bark: DARKBARK, wood: DEAD, leaf: DRYRED, leafFar: farRamp(DRYRED) })
)

const star = variant(
  drawStarTree,
  drawStarPine,
  {
    tree: () => drawWorldLog(LOG_STAR, STARLEAF, logStars, { bark: INDIGO, wood: GOLD }),
    pine: () => drawWorldLog(LOG_STAR, STARLEAF, logStarBoughs, { bark: INDIGO, wood: GOLD })
  },
  () => drawUnder({ bark: INDIGO, wood: GOLD, leaf: STARLEAF, leafFar: farRamp(STARLEAF) })
)

export const sheets: SheetModule = {
  'prop:tree:cave': cave.tree,
  'prop:pine:cave': cave.pine,
  'prop:log:cave': cave.log,
  'prop:tree:keep': keep.tree,
  'prop:pine:keep': keep.pine,
  'prop:log:keep': keep.log,
  'prop:tree:star': star.tree,
  'prop:pine:star': star.pine,
  'prop:log:star': star.log
}
