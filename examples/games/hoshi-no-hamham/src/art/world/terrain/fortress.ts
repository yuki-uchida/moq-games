import type { TileQuery } from '../../contract'
import { R, color, ramp } from '../../palette'
import { Raster, ball, hash } from '../../raster'
import type { TerrainArt } from '../types'
import {
  TILE,
  WRAP_X,
  blade,
  brickAt,
  decor,
  dim,
  ledgeEnds,
  lineNoise,
  memoTile,
  paintDirt,
  paintGround,
  paintSpike,
  scatter,
  stones,
  wrap,
  type Ctx,
  type DirtStyle,
  type GroundStyle,
  type SpikeStyle
} from './kit'

/**
 * Terrain of the `fortress` world (stages 7–8): dressed blue-grey ashlar in offset courses with continuous joints,
 * a lighter flagstone cap with chipped edges, moss in a few joints and a shadowed lip underneath; ledges are stone
 * slabs on iron brackets.
 */
const SEED = 505
const S = R.stone
/** Two tones either side of the base so single blocks differ without noise inside them. */
const TONE_L = color('#a6b0ca')
const TONE_D = color('#8e98b6')
const EDGE_L = color('#c2cbe2')
const CAP = color('#c4cde4')
const FMOSS = ramp('#bde0a0', '#82ae6e', '#58844f', '#3a6040', '#10261f')
const WEED = ramp('#b8d890', '#7da45c', '#587a46', '#3a5a3a', '#10261f')
const IRON = dim(R.steel)

const COURSES = {
  seed: SEED,
  h: 24,
  patterns: [
    [48, 72, 72],
    [72, 48, 72],
    [96, 48, 48],
    [48, 96, 48]
  ]
}

/** Dressed blocks: dark joint above and left, a lit bevel, a shaded foot; cracks and moss belong to single blocks. */
function fill(c: Ctx) {
  const { r, ox, oy } = c
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const wx = ox + x
      const wy = oy + y
      const b = brickAt(wx, wy, COURSES)
      const u = wx - b.x0
      const v = wy - b.y0
      const w = b.x1 - b.x0
      let col = b.id < 0.25 ? TONE_L : b.id < 0.78 ? S[1] : TONE_D
      if (v === 0 || u === 0) col = S[3]
      else if (v === 1 || u === 1) col = v === 1 && u > 1 ? EDGE_L : b.id < 0.78 ? EDGE_L : TONE_L
      else if (v === COURSES.h - 1) col = S[2]
      else if (u === w - 1) col = S[2]
      else {
        // A crack in about one block in eight, running down from the top joint.
        const hid = Math.floor(b.id * 1000)
        if (hid % 13 === 4) {
          const cx = 8 + (hid % (w - 16)) + Math.round(v * (hid % 2 ? 0.3 : -0.3))
          if (u === cx && v >= 2 && v <= 17) col = S[2]
          else if (u === cx + 1 && v >= 4 && v <= 13) col = EDGE_L
        }
      }
      // Moss sitting in the joint on the top of a few blocks, with drips.
      const hid = Math.floor(b.id * 1000)
      if (hid % 8 === 1 && u >= 4 && u < 4 + 10 + (hid % 6) && v <= 4) {
        const f = (hid % 6) + 10 - (u - 4)
        if (v <= 1) col = FMOSS[2]
        else if (v === 2) col = u < 8 ? FMOSS[0] : FMOSS[1]
        else if (v === 3) col = FMOSS[1]
        else if (v === 4 && wrap(u, 3) === 0 && f > 2) col = FMOSS[2]
      }
      r.set(x, y, col)
    }
  // Light pitting of the stone: short darker nicks.
  scatter(r, c.q, { cell: 24, seed: SEED + 7, chance: 0.12, margin: 4 }, (l, x, y, rnd) => {
    const w = 2 + Math.floor(rnd() * 2)
    if (l.get(x, y) === S[1] || l.get(x, y) === TONE_L || l.get(x, y) === TONE_D) {
      l.rect(x, y, w, 1, S[2])
      l.rect(x + 1, y + 1, Math.max(1, w - 1), 1, EDGE_L)
    }
  })
}

const SLABS = (WRAP_X * TILE) / 32

/** Flagstone cap: slabs of 24–48 px with chipped corners. */
function slabAt(wx: number) {
  // Slab joints at jittered multiples of 32 px.
  const k = Math.floor(wx / 32)
  const joint = (n: number) => n * 32 + (hash(wrap(n, SLABS), 2, SEED) % 17) - 8
  let n = k
  if (wx < joint(n)) n--
  else if (wx >= joint(n + 1)) n++
  return { x0: joint(n), x1: joint(n + 1), id: hash(wrap(n, SLABS), 3, SEED) % 100 }
}

const lipEnd = (wx: number) => 7 + (slabAt(wx).id % 2)

function capColour(t: number, end: number, wx: number) {
  const tt = Math.round(t)
  const s = slabAt(wx)
  const u = wx - s.x0
  const w = s.x1 - s.x0
  if (tt > end + 1) return S[2]
  if (tt > end) return S[3]
  if (tt === end) return S[3]
  // Joints between slabs with a chipped notch on top.
  if (u === 0 && tt >= 1) return S[3]
  if (u === 1 && tt <= 2) return S[2]
  if (u === w - 1 && tt >= 1 && tt <= 2) return S[2]
  if (tt <= 1) return s.id % 7 === 0 && u > 4 && u < 11 ? S[1] : S[0]
  if (tt === 2) return u > w - 5 ? CAP : S[0]
  if (tt >= end - 1) return S[1]
  if (s.id % 5 === 0 && tt === 4 && u > 6 && u < 6 + 9) return S[1]
  return CAP
}

/** Shadowed lip underneath: a dark course foot and a soft step. */
function underColour(b: number, wx: number) {
  if (b <= 1) return S[3]
  if (b <= 3) return S[2]
  if (b === 4 && lineNoise(wx, 8, SEED + 21) > 0.4) return S[2]
  return 0
}

function sideColour(d: number, wy: number, lit: boolean) {
  if (lit) return d <= 1 ? S[0] : d === 2 ? EDGE_L : 0
  return d <= 1 ? S[3] : d <= 3 ? S[2] : 0
}

const ground: GroundStyle = {
  seed: SEED,
  grass: S,
  soil: S,
  lip: 7,
  blade: 0,
  round: 4,
  fill,
  lipEnd,
  capColour,
  underDepth: () => 5,
  underColour,
  sideColour
}

const dirt: DirtStyle = { seed: SEED + 200, clay: R.clay, rock: R.stone }
const spike: SpikeStyle = {
  seed: SEED + 400,
  steel: R.steel,
  base: S,
  baseDetail: (r, top) => {
    r.rect(0, top + 8, TILE, 1, S[3])
    r.rect(31, top + 1, 1, 7, S[3])
    r.rect(15, top + 9, 1, 6, S[3])
    r.rect(47, top + 9, 1, 6, S[3])
  }
}

// ---------------------------------------------------------------------------------------------------- ledges

/** A stone slab on iron brackets. */
function ledge(q: TileQuery): Raster {
  const r = new Raster(TILE, TILE)
  const ends = ledgeEnds(q.around)
  const h = hash(q.tx, 5, SEED + 300)
  const x0 = ends.leftEnd ? 1 : 0
  const x1 = ends.rightEnd ? TILE - 2 : TILE - 1
  for (let x = x0; x <= x1; x++) {
    const e = Math.min(ends.leftEnd ? x - x0 : 9, ends.rightEnd ? x1 - x : 9)
    for (let y = 0; y <= 10; y++) {
      if (e < 2 && ((y === 0 && e < 1) || (y === 10 && e < 1))) continue
      let col = CAP
      if (y === 0 || y === 10) col = S[4]
      else if (y <= 2) col = S[0]
      else if (y >= 9) col = S[2]
      else if (y >= 8) col = S[1]
      r.set(x, y, col)
    }
  }
  // Slab joint with a chip and one nick in the surface.
  const jx = 20 + (h % 24)
  r.rect(jx, 1, 1, 10, S[3])
  r.rect(jx + 1, 1, 1, 2, S[2])
  r.rect(jx - 1, 1, 1, 1, S[2])
  r.rect(4 + ((h >> 3) % 10), 5, 6, 1, S[1])
  r.rect(40 + ((h >> 6) % 10), 6, 5, 1, S[1])
  // Iron brackets: a riveted band under the slab and a corbel that narrows to a flat foot.
  const bracket = (cx: number) => {
    r.rect(cx - 7, 11, 15, 3, IRON[1])
    r.rect(cx - 7, 11, 15, 1, R.steel[1])
    r.rect(cx - 7, 13, 15, 1, IRON[2])
    r.rect(cx - 8, 11, 1, 3, S[4])
    r.rect(cx + 8, 11, 1, 3, S[4])
    r.rect(cx - 7, 14, 15, 1, S[4])
    for (let k = 0; k < 5; k++) {
      const half = 5 - Math.floor(k / 2) - (k > 2 ? 1 : 0)
      for (let x = cx - half; x <= cx + half; x++)
        r.set(x, 15 + k, x === cx - half ? R.steel[1] : x >= cx + half - 1 ? IRON[3] : IRON[2])
      r.set(cx - half - 1, 15 + k, S[4])
      r.set(cx + half + 1, 15 + k, S[4])
    }
    r.rect(cx - 3, 19, 7, 1, S[4])
    r.set(cx - 5, 12, R.steel[0])
    r.set(cx + 5, 12, R.steel[0])
  }
  const left = ends.leftEnd ? 10 : 8 + (h % 6)
  const right = ends.rightEnd ? TILE - 11 : 46 + ((h >> 3) % 6)
  bracket(left)
  bracket(right)
  for (let y = 20; y < TILE; y++) for (let x = 0; x < TILE; x++) r.data[y * TILE + x] = 0
  return r
}

const tile = memoTile((q) => {
  switch (q.kind) {
    case 'solid':
      return paintGround(q, ground)
    case 'dirt':
      return paintDirt(q, dirt)
    case 'platform':
      return ledge(q)
    case 'spike':
      return paintSpike(q, spike)
  }
})

// ---------------------------------------------------------------------------------------------- decorations

/** A chain: alternating flat and edge-on links, `n` links long, hanging from (x, y). */
function chain(r: Raster, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const yy = y + i * 5
    if (i % 2 === 0) {
      r.rect(x - 2, yy, 4, 6, IRON[1])
      r.rect(x - 1, yy + 1, 2, 4, 0)
      r.rect(x - 2, yy, 2, 1, R.steel[0])
      r.rect(x + 1, yy + 2, 1, 4, IRON[3])
    } else {
      r.rect(x - 1, yy, 2, 6, IRON[2])
      r.set(x - 1, yy, R.steel[1])
      r.set(x - 1, yy + 1, R.steel[1])
    }
  }
}

const decorations = [
  // Rubble.
  decor('top', 4, 20, 9, (r) =>
    stones(
      r,
      10,
      9,
      [
        [-6, 3, 2.4],
        [-1, 3.6, 3.4],
        [5, 2.6, 2],
        [8, 1.6, 1.4]
      ],
      S
    )
  ),
  // Weeds growing from a crack.
  decor('top', 4, 14, 14, (r) => {
    blade(r, 6, 14, -3, 9, WEED)
    blade(r, 7, 14, 0, 13, WEED)
    blade(r, 8, 14, 4, 8, WEED)
    r.rect(4, 13, 7, 1, S[3])
  }),
  decor('top', 2, 10, 9, (r) => {
    blade(r, 4, 9, -2, 6, WEED)
    blade(r, 5, 9, 2, 8, WEED)
  }),
  // A clump of moss.
  decor(
    'top',
    3,
    18,
    8,
    (r) => {
      ball(r, 9, 6, 7, 4, FMOSS, false)
      r.rect(5, 1, 2, 3, FMOSS[1])
      r.rect(12, 2, 2, 2, FMOSS[1])
    },
    { sink: 2 }
  ),
  // A loose block, a little crooked.
  decor('top', 2, 18, 13, (r) => {
    r.poly([2, 13, 1, 5, 14, 3, 16, 12], S[1])
    r.line(1, 5, 14, 3, EDGE_L)
    r.line(2, 6, 14, 4, EDGE_L)
    r.line(2, 13, 16, 12, S[3])
    r.line(16, 12, 14, 3, S[2])
    r.rect(5, 8, 4, 1, S[2])
  }),
  // An iron ring set in a stone.
  decor('top', 2, 14, 15, (r) => {
    r.rect(2, 10, 10, 5, S[1])
    r.rect(2, 10, 10, 1, S[0])
    r.rect(2, 14, 10, 1, S[3])
    r.ring(7, 6, 3, 5, IRON[1])
    r.ring(7, 6, 3, 4, R.steel[0], -Math.PI, -Math.PI * 0.2)
    r.rect(6, 9, 3, 3, IRON[2])
  }),
  // Broken flagstone with a weed.
  decor('top', 2, 16, 10, (r) => {
    stones(
      r,
      8,
      10,
      [
        [-4, 4, 2],
        [4, 3, 2.6]
      ],
      S
    )
    blade(r, 11, 7, 2, 7, WEED)
  }),
  // Hanging chains: long and short.
  decor('under', 3, 10, 36, (r) => chain(r, 5, 0, 7), { sink: 1 }),
  decor('under', 4, 10, 20, (r) => chain(r, 5, 0, 4), { sink: 1 }),
  // Moss drips.
  decor(
    'under',
    3,
    18,
    12,
    (r) => {
      const moss = new Raster(r.w, r.h)
      ball(moss, 9, 2, 8, 3, FMOSS, false)
      for (const [x, len] of [
        [4, 8],
        [9, 11],
        [14, 6]
      ])
        moss.rect(x, 3, 2, len - 2, FMOSS[2])
      moss.rect(9, 11, 2, 1, FMOSS[0])
      r.blit(moss)
    },
    { sink: 2 }
  )
]

export const terrain: TerrainArt | undefined = { tile, decor: decorations }
