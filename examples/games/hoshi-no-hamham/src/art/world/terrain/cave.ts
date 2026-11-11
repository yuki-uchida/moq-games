import type { TileQuery } from '../../contract'
import { C, R, color, ramp } from '../../palette'
import { Raster, ball, hash } from '../../raster'
import type { TerrainArt } from '../types'
import {
  WRAP_X,
  WRAP_Y,
  TILE,
  decor,
  dim,
  ledgeEnds,
  lineNoise,
  memoTile,
  mushroom,
  paintDirt,
  paintGround,
  paintSpike,
  scatter,
  spire,
  stones,
  stroke,
  wander,
  wrap,
  type Ctx,
  type DirtStyle,
  type GroundStyle,
  type SpikeStyle
} from './kit'

/**
 * Terrain of the `cave` world (stage 4, the gang's hideout): violet rock in layered strata with a worn lip,
 * chiselled rims and a ragged roof, scaffold planks lashed with rope, and crystals, stalagmites and stalactites.
 */
const SEED = 404
const S = R.caveRock
/** In-between tones of the rock so strata step gently instead of jumping from base to shade. */
const MID = color('#5a4c7a')
const LIT = color('#7d6ca3')
const LIPC = color('#8574ad')
/** Loose stones: caveRock lifted one step. */
const PEB = ramp('#c8bce6', '#9a88c0', '#6a5a8c', '#4a3f68', '#1c1830')
const CRY = ramp('#f0fcff', '#8fe0ff', '#4fa8e0', '#3a6ab4', '#121b36')
const CRY2 = ramp('#fff0ff', '#e08ae8', '#a85ac8', '#6a3a90', '#2a1230')
const PALE = ramp('#ffffff', '#ece6fa', '#b8a8d8', '#8a78b4', '#2a1230')

/** Periodic sine over the 1536 px world so waves close at the wrap. */
const wv = (v: number, k: number, phase: number) => Math.sin(((v * k) / (WRAP_X * TILE) + phase) * Math.PI * 2)

const BAND = 24
const BANDS = (WRAP_Y * TILE) / BAND
const bandOff = (k: number) => (hash(wrap(k, BANDS), 5, SEED) % 13) - 6

/** Layered strata: wavy bands of three tones with a lit top edge and a shaded foot, a few embedded crystals. */
function fill(c: Ctx) {
  const { r, ox, oy } = c
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const wx = ox + x
      const wy = oy + y
      const s = wy + Math.round(wv(wx, 8, 0.1) * 4 + wv(wx, 21, 0.4) * 1.6) + WRAP_Y * TILE
      let k = Math.floor(s / BAND)
      if (s < k * BAND + bandOff(k)) k--
      else if (s >= (k + 1) * BAND + bandOff(k + 1)) k++
      const top = k * BAND + bandOff(k)
      const bottom = (k + 1) * BAND + bandOff(k + 1)
      const d = s - top
      const tone = hash(wrap(k, BANDS), 6, SEED) % 7
      let col = tone < 3 ? S[1] : tone < 6 ? MID : S[2]
      if (d === 0 && lineNoise(wx, 24, SEED + k) > 0.25) col = LIT
      else if (s === bottom - 1 && lineNoise(wx, 16, SEED + k + 9) > 0.5) col = tone < 3 ? S[2] : S[3]
      r.set(x, y, col)
    }
  // Short hairline cracks.
  scatter(r, c.q, { cell: 48, seed: SEED + 7, chance: 0.4, margin: 14 }, (l, x, y, rnd) => {
    const path = wander(rnd, x, y, 0.4 + rnd() * 2.2, 3, 5, 0.6)
    stroke(l, path, 1, S[2])
  })
  // Small chips of stone.
  scatter(r, c.q, { cell: 32, seed: SEED + 8, chance: 0.4, margin: 6 }, (l, x, y, rnd) => {
    const w = 2 + Math.floor(rnd() * 3)
    l.rect(x, y, w, 2, S[2])
    l.rect(x, y - 1, Math.max(1, w - 1), 1, LIT)
  })
  // Embedded crystals: small, low contrast, one glint each.
  scatter(r, c.q, { cell: 96, seed: SEED + 9, chance: 0.5, margin: 10 }, (l, x, y, rnd) => {
    const pink = rnd() < 0.3
    const g = pink ? CRY2 : CRY
    const hgt = 7 + Math.floor(rnd() * 3)
    const lean = rnd() < 0.5 ? -1 : 1
    for (let i = 0; i < hgt; i++) {
      const half = i < 1 || i > hgt - 2 ? 0.8 : 1.9
      for (let xx = Math.round(x - half + lean * (i > 2 ? 0.5 : 0)); xx <= Math.round(x + half - 0.5); xx++)
        l.set(xx, y - i, xx <= x - 1 ? g[1] : g[2])
    }
    l.set(x - 1, y - hgt + 2, g[0])
    l.rect(x - 2, y + 1, 4, 1, S[3])
  })
}

/** Pebbles resting on the lip. */
function lipDetail(c: Ctx) {
  if (!c.ex.top) return
  scatter(c.r, c.q, { cell: 32, seed: SEED + 50, chance: 0.45, margin: 5 }, (l, x, _y, rnd) => {
    const rx = 2 + Math.floor(rnd() * 2)
    ball(l, x, 3 + rx, rx, rx - 1, PEB, false)
    l.rect(x - rx + 1, 4 + rx, rx * 2 - 1, 1, S[3])
  })
}

const lipEnd = (wx: number) => Math.round(9 + wv(wx, 12, 0.2) * 1.2 + lineNoise(wx, 4, SEED + 12) * 2.6)

/** Worn lip: lit edge, lighter rock, a ragged foot and a contact shadow. */
function capColour(t: number, end: number, wx: number) {
  const tt = Math.round(t)
  if (tt > end + 1) return S[2]
  if (tt > end) return S[3]
  if (tt === end) return lineNoise(wx, 3, SEED + 13) > 0.5 ? S[3] : S[2]
  if (tt <= 1) return lineNoise(wx, 6, SEED + 14) > 0.75 ? LIPC : S[0]
  // Slab joints in the lip.
  const jc = Math.floor(wx / 24)
  const jx = jc * 24 + 3 + (hash(wrap(jc, 64), 8, SEED) % 18)
  if (wx === jx) return S[3]
  if (wx === jx + 1 && tt <= end - 2) return S[0]
  if (tt === 2) return lineNoise(wx, 5, SEED + 15) > 0.5 ? S[0] : LIPC
  return tt >= end - 1 ? LIT : LIPC
}

/** Smooth value noise along x (cosine blend between cells of `cell` px). */
function smooth(wx: number, cell: number, seed: number) {
  const t = (wrap(wx, cell) / cell) * Math.PI
  const u = (1 - Math.cos(t)) / 2
  return lineNoise(wx, cell, seed) * (1 - u) + lineNoise(wx + cell, cell, seed) * u
}
/** Depth of the shadow gap between the rock's ragged bottom edge and the tile bottom at world x. */
const gap = (wx: number) =>
  Math.round(smooth(wx, 32, SEED + 61) * 8 + smooth(wx, 12, SEED + 62) * 5 + lineNoise(wx, 3, SEED + 63) * 3)
function underColour(b: number, wx: number) {
  const g = gap(wx)
  if (b < g) return S[3]
  if (b === g) return S[4]
  if (b === g + 1) return S[3]
  if (b <= g + 3) return S[2]
  if (b === g + 4 && lineNoise(wx, 4, SEED + 64) > 0.5) return S[2]
  return 0
}

/** Chiselled rims: lit stone on the left, a shaded flank on the right, notches every so often. */
function sideColour(d: number, wy: number, lit: boolean) {
  const notch = wrap(wy + (lit ? 5 : 0), 19) < 2
  if (lit) {
    if (d <= 1) return S[0]
    if (d <= 3) return notch ? S[2] : LIPC
    if (d === 4 && lineNoise(wy, 5, SEED + 16) > 0.5) return LIT
    return 0
  }
  if (d <= 1) return S[3]
  if (d <= 3) return notch ? S[3] : S[2]
  if (d === 4 && lineNoise(wy, 4, SEED + 17) > 0.5) return S[2]
  return 0
}

/** The bottom row of a ground tile is its outline; between the teeth of the roof it is shadow instead. */
function roofGaps(c: Ctx) {
  if (!c.ex.bottom) return
  for (let x = 1; x < TILE - 1; x++) {
    const g = gap(c.ox + x)
    if (g > 0 && !(c.ex.left && x < 4) && !(c.ex.right && x > TILE - 5)) c.r.set(x, TILE - 1, S[3])
  }
}

const ground: GroundStyle = {
  seed: SEED,
  grass: S,
  soil: S,
  lip: 9,
  blade: 0,
  round: 5,
  fill,
  lipEnd,
  capColour,
  underDepth: () => 16,
  edgeDetail: roofGaps,
  underColour,
  sideColour,
  lipDetail
}

const dirt: DirtStyle = { seed: SEED + 200, clay: R.clay, rock: R.rock }
const spike: SpikeStyle = { seed: SEED + 400, steel: R.steel, base: S }

// ----------------------------------------------------------------------------------------------- scaffold planks

const W = dim(R.wood)
const ROPE = R.weaselTan

/** Rope lashing: a 5 px wrap with a diagonal twist. */
function lash(r: Raster, x0: number, y0: number, y1: number) {
  for (let y = y0; y <= y1; y++) {
    for (let i = 0; i < 5; i++) r.set(x0 + i, y, (y + i) % 4 < 2 ? ROPE[1] : ROPE[2])
    r.set(x0, y, ROPE[0])
    r.set(x0 + 4, y, ROPE[3])
  }
  r.rect(x0 - 1, y0 - 1, 7, 1, ROPE[4])
  r.rect(x0 - 1, y1 + 1, 7, 1, ROPE[4])
}

function scaffold(q: TileQuery): Raster {
  const r = new Raster(TILE, TILE)
  const ends = ledgeEnds(q.around)
  const h = hash(q.tx, 9, SEED + 300)
  const x0 = ends.leftEnd ? 2 : 0
  const x1 = ends.rightEnd ? TILE - 3 : TILE - 1
  // Beam under the boards (rows 11–15) is a darker log; the boards sit on it.
  const bx0 = ends.leftEnd ? 5 : 0
  const bx1 = ends.rightEnd ? TILE - 6 : TILE - 1
  for (let x = bx0; x <= bx1; x++) {
    r.set(x, 10, W[4])
    r.set(x, 11, W[2])
    r.set(x, 12, W[2])
    r.set(x, 13, W[3])
    r.set(x, 14, W[3])
    r.set(x, 15, W[4])
  }
  // Boards: uneven lengths with butt joints, nails, grain.
  const joints = [18 + (h % 9), 42 + ((h >> 4) % 9)]
  for (let x = x0; x <= x1; x++) {
    const cap = Math.min(ends.leftEnd ? x - x0 : 9, ends.rightEnd ? x1 - x : 9)
    for (let y = 0; y <= 9; y++) {
      if (cap < 2 && (y === 0 || y === 9) && cap < 1) continue
      let col = y === 0 ? W[4] : y <= 2 ? W[0] : y <= 6 ? W[1] : y <= 8 ? W[2] : W[4]
      if (y === 8) col = W[3]
      r.set(x, y, col)
    }
  }
  for (const jx of joints) {
    r.rect(jx, 1, 1, 8, W[4])
    r.rect(jx + 1, 1, 1, 2, W[0])
    r.rect(jx + 1, 3, 1, 4, W[1])
    r.set(jx - 3, 3, R.steel[1])
    r.set(jx + 4, 3, R.steel[1])
    r.set(jx - 3, 4, W[4])
    r.set(jx + 4, 4, W[4])
  }
  // Grain.
  r.rect(4 + (h % 7), 4, 8, 1, W[2])
  r.rect(26 + ((h >> 3) % 6), 5, 9, 1, W[2])
  r.rect(48 + ((h >> 6) % 5), 4, 7, 1, W[2])
  r.rect(joints[0] + 5, 6, 7, 1, W[2])
  if (h % 3 === 0) r.ellipse(joints[1] + 8, 4.5, 1.6, 1.2, W[3])
  // Lashings that bind boards to the beam, and rope tails hanging below.
  const spots =
    ends.leftEnd && ends.rightEnd
      ? [10, TILE - 15]
      : ends.leftEnd
        ? [10, 40 + (h % 8)]
        : ends.rightEnd
          ? [14 + (h % 8), TILE - 15]
          : [8 + (h % 6), 36 + ((h >> 3) % 8)]
  for (const sx of spots) {
    lash(r, sx, 1, 14)
    // Tail.
    const len = 3 + ((sx + h) % 3)
    r.rect(sx + 1, 16, 2, len, ROPE[1])
    r.rect(sx + 3, 16, 1, len, ROPE[2])
    r.rect(sx + 1, 16 + len, 3, 1, ROPE[3])
  }
  // Nothing below the ledge.
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
      return scaffold(q)
    case 'spike':
      return paintSpike(q, spike)
  }
})

// -------------------------------------------------------------------------------------------------- decorations

const decorations = [
  // A cluster of three cyan crystals.
  decor('top', 3, 16, 16, (r) => {
    spire(r, 8, 15, 3, 15, CRY, false, 1)
    spire(r, 3, 15, 2, 8, CRY, false, -1)
    spire(r, 13, 15, 2, 10, CRY, false, 2)
    r.set(7, 5, C.white)
  }),
  // A single violet crystal.
  decor('top', 2, 10, 14, (r) => {
    spire(r, 5, 13, 3, 13, CRY2, false, -1)
    r.set(4, 6, C.white)
  }),
  // Stalagmites of two heights.
  decor('top', 4, 18, 18, (r) => {
    spire(r, 6, 17, 5, 17, PEB, false, 1)
    spire(r, 14, 17, 3, 9, PEB, false, -1)
  }),
  decor('top', 3, 10, 12, (r) => spire(r, 5, 11, 4, 11, PEB, false, 0)),
  // Pale mushrooms.
  decor('top', 3, 16, 12, (r) => {
    mushroom(r, 5, 12, { cap: PALE, stem: R.cream, capW: 9, capH: 4, stemH: 5, dots: 1, stemW: 2 })
    mushroom(r, 12, 12, { cap: PALE, stem: R.cream, capW: 6, capH: 3, stemH: 3, dots: 0, stemW: 2 })
  }),
  // Pebbles.
  decor('top', 3, 18, 8, (r) =>
    stones(
      r,
      9,
      8,
      [
        [-5, 2.6, 2],
        [0, 3.4, 3],
        [5, 2.2, 1.6]
      ],
      PEB
    )
  ),
  // A broken plank leaning on a stone.
  decor('top', 2, 24, 11, (r) => {
    ball(r, 18, 8, 4, 3, PEB, false)
    r.poly([1, 10, 3, 7, 19, 3, 21, 6, 19, 9, 3, 11], W[1])
    r.line(3, 7, 19, 3, W[0])
    r.line(3, 8, 19, 4, W[0])
    r.line(2, 11, 19, 9, W[3])
    r.set(2, 9, W[3])
    r.set(15, 5, R.steel[1])
    r.set(20, 7, W[3])
    r.rect(10, 6, 5, 1, W[2])
  }),
  // A tiny lantern on a stone stub.
  decor('top', 2, 10, 18, (r) => {
    r.rect(1, 14, 8, 4, S[2])
    r.rect(1, 14, 8, 1, S[0])
    r.rect(1, 14, 2, 4, S[1])
    r.rect(3, 4, 4, 10, R.steel[2])
    r.rect(2, 3, 6, 1, R.steel[2])
    r.rect(3, 12, 4, 1, R.steel[2])
    r.rect(4, 5, 2, 7, C.glow)
    r.rect(4, 7, 2, 3, R.fire[0])
    r.set(5, 1, R.steel[2])
    r.rect(4, 1, 2, 2, R.steel[3])
  }),
  // Stalactites: two sizes.
  decor('under', 4, 16, 28, (r) => {
    spire(r, 6, 0, 4, 27, PEB, true, 1)
    spire(r, 13, 0, 2, 12, PEB, true, -1)
  }),
  decor('under', 4, 12, 15, (r) => spire(r, 5, 0, 3, 14, PEB, true, 0)),
  // Hanging roots.
  decor(
    'under',
    3,
    16,
    22,
    (r) => {
      for (const [x, len, lean] of [
        [4, 20, 1],
        [8, 13, -1],
        [12, 8, 2]
      ] as const)
        stroke(
          r,
          [
            [x, 0],
            [x + lean * 0.5, len / 2],
            [x + lean, len]
          ],
          1,
          R.bark[1]
        )
    },
    { sink: 2 }
  )
]

export const terrain: TerrainArt | undefined = { tile, decor: decorations }
