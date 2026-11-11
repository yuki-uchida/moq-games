import type { TileQuery } from '../../contract'
import { C, R, color, ramp, type Ramp } from '../../palette'
import { Raster, ball, hash } from '../../raster'
import type { TerrainArt } from '../types'
import {
  TILE,
  blade,
  decor,
  ledgeEnds,
  lineNoise,
  memoTile,
  paintDirt,
  paintGround,
  paintSpike,
  scatter,
  spire,
  stones,
  wrap,
  type Ctx,
  type DirtStyle,
  type GroundStyle,
  type SpikeStyle
} from './kit'

/**
 * Terrain of the `star` world (stage 10, floating islands): indigo crystalline rock cut in diagonal facets with
 * small star inclusions that glint, a smooth gold-edged cap, shards of crystal hanging under every island, and
 * gold-framed crystal bridges.
 */
const SEED = 707
const S = R.starRock
const GOLD = R.gold
const FACET_L = color('#5a4e96')
const FACET_D = color('#3b3266')
const CAPL = color('#6c5fb0')
const CAPM = color('#5d509f')
const GLINT = color('#c8c0f4')
const CORE = ramp('#eeeaff', '#bab0f4', '#8a7ed6', '#5c50a4', '#1c1830')
const VIOLET = ramp('#ece0ff', '#a890f0', '#7058c8', '#4a3a9a', '#1c1830')
const GLOWC = ramp('#ffffff', '#b8f4ff', '#7ac8ff', '#5a8ae0', '#121b36')
const SPROUT = ramp('#a0f0c0', '#4fbf8f', '#2f8f78', '#1f6060', '#121b36')

const BAND = 48
const BANDS = 32
const bandOff = (k: number) => (hash(wrap(k, BANDS), 5, SEED) % 17) - 8

/** Diagonal crystal facets with a lit left edge and a shaded right edge, and star inclusions. */
function fill(c: Ctx) {
  const { r, ox, oy } = c
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const wx = ox + x
      const wy = oy + y
      const s = wx + wy + 1536
      let k = Math.floor(s / BAND)
      if (s < k * BAND + bandOff(k)) k--
      else if (s >= (k + 1) * BAND + bandOff(k + 1)) k++
      const d = s - (k * BAND + bandOff(k))
      const w = BAND + bandOff(k + 1) - bandOff(k)
      const tone = hash(wrap(k, BANDS), 6, SEED) % 7
      let col = tone < 3 ? S[1] : tone < 5 ? FACET_D : S[1]
      if (d === 0 && lineNoise(wx, 16, SEED + k) > 0.3) col = S[2]
      else if (d <= 2 && tone < 3 && lineNoise(wx, 24, SEED + k + 5) > 0.2) col = FACET_L
      else if (d >= w - 2 && lineNoise(wx, 16, SEED + k + 9) > 0.4) col = S[2]
      r.set(x, y, col)
    }
  // A few thin fracture lines across the facets.
  scatter(r, c.q, { cell: 96, seed: SEED + 7, chance: 0.5, margin: 20 }, (l, x, y, rnd) => {
    const len = 8 + Math.floor(rnd() * 12)
    for (let i = 0; i < len; i++) l.set(x + i, y - Math.round(i * 0.55) + (i % 5 === 0 ? 1 : 0), S[2])
  })
  // Star inclusions: small five-point stars in pale indigo, each with one glint.
  scatter(r, c.q, { cell: 64, seed: SEED + 9, chance: 0.6, margin: 8 }, (l, x, y, rnd) => {
    const ro = 3.4 + rnd() * 2.2
    starShape(l, x, y, ro, ro * 0.45, [GLINT, S[0], CAPL, S[2], S[4]])
    l.set(x, y, GLINT)
    l.set(x - 1, y - 1, C.white)
  })
}

/** Smooth cap: a gold edge, a flat lit crystal layer and a shadowed foot; tiny glints in the gold. */
const lipEnd = () => 8

function capColour(t: number, end: number, wx: number) {
  const tt = Math.round(t)
  if (tt > end + 1) return S[2]
  if (tt > end) return S[3]
  if (tt === end) return S[3]
  if (tt === 1) return wrap(wx, 24) === 7 ? C.white : GOLD[0]
  if (tt === 2) return GOLD[1]
  if (tt === 3) return GOLD[2]
  if (tt === 4) return GOLD[3]
  if (tt === 5) return CAPL
  if (tt >= end - 1) return S[2]
  return tt === 6 ? CAPL : CAPM
}

/** Where the island's own rock stops: hanging shards, sharp and uneven. */
function shard(wx: number) {
  const cell = 24
  const n = (1536 / cell) | 0
  let best = 0
  for (let k = Math.floor(wx / cell) - 1; k <= Math.floor(wx / cell) + 1; k++) {
    const h = hash(wrap(k, n), 4, SEED)
    if (h % 6 === 0) continue
    const centre = k * cell + 4 + ((h >> 4) % 17)
    const half = 6 + ((h >> 8) % 6)
    const depth = 9 + ((h >> 12) % 9)
    best = Math.max(best, depth * (1 - Math.abs(wx - centre) / half))
  }
  return best
}
const gap = (wx: number) => Math.max(0, 16 - Math.round(shard(wx)))

function underColour(b: number, wx: number) {
  const g = gap(wx)
  if (b < g) return S[4]
  if (b === g) return S[4]
  // Which face of its shard this column belongs to: the lit slope faces left, the shaded one right.
  const lit = gap(wx - 2) > gap(wx + 2)
  const d = b - g
  if (lit) return d === 1 ? S[0] : d <= 3 ? CAPL : d <= 5 ? FACET_L : 0
  return d === 1 ? S[3] : d <= 5 ? S[2] : 0
}

function sideColour(d: number, _wy: number, lit: boolean) {
  if (lit) return d <= 1 ? S[0] : d === 2 ? CAPL : 0
  return d <= 1 ? S[3] : d <= 3 ? S[2] : 0
}

const ground: GroundStyle = {
  seed: SEED,
  grass: S,
  soil: S,
  lip: 8,
  blade: 0,
  round: 5,
  fill,
  lipEnd,
  capColour,
  underDepth: () => 24,
  underColour,
  sideColour
}

const dirt: DirtStyle = { seed: SEED + 200, clay: R.clay, rock: R.starRock }
const spike: SpikeStyle = { seed: SEED + 400, steel: R.steel, base: S }

// ------------------------------------------------------------------------------------------------ bridges

/** A gold-framed crystal bridge: pale core between a top and a bottom rail, posts every 16 px. */
function bridge(q: TileQuery): Raster {
  const r = new Raster(TILE, TILE)
  const ends = ledgeEnds(q.around)
  const h = hash(q.tx, 8, SEED + 300)
  const x0 = ends.leftEnd ? 1 : 0
  const x1 = ends.rightEnd ? TILE - 2 : TILE - 1
  for (let x = x0; x <= x1; x++) {
    const e = Math.min(ends.leftEnd ? x - x0 : 9, ends.rightEnd ? x1 - x : 9)
    for (let y = 0; y <= 11; y++) {
      if (e < 2 && (y === 0 || y === 11) && e < 1) continue
      let col: number
      if (y === 0 || y === 11) col = GOLD[4]
      else if (y === 1) col = GOLD[0]
      else if (y === 2) col = GOLD[1]
      else if (y === 3) col = GOLD[3]
      else if (y >= 9) col = y === 9 ? GOLD[1] : GOLD[2]
      else if (y === 8) col = GOLD[3]
      else col = y <= 5 ? CORE[0] : y === 6 ? CORE[1] : CORE[2]
      r.set(x, y, col)
    }
  }
  // Facets in the glass: slanted glints.
  for (let i = 0; i < 4; i++) {
    const gx = ((i * 17 + (h % 9)) % (TILE - 8)) + 2
    for (let k = 0; k < 4; k++) r.set(gx + k, 7 - k, CORE[0])
    r.set(gx + 4, 7 - 4, C.white)
  }
  // Posts.
  for (const px of [0, 16, 32, 48])
    if (px >= x0 && px + 2 <= x1 + 1) {
      r.rect(px, 3, 3, 6, GOLD[2])
      r.rect(px, 3, 1, 6, GOLD[0])
      r.rect(px + 2, 3, 1, 6, GOLD[3])
      r.rect(px + 3, 3, 1, 6, GOLD[4])
    }
  // Little crystals hanging under the bridge.
  for (let i = 0; i < 4; i++) {
    const cx = i * 16 + 8 + ((h >> (i * 2)) % 3) - 1
    if (cx < x0 + 2 || cx > x1 - 2) continue
    const len = 4 + ((h >> (i + 3)) % 5)
    for (let k = 0; k < len; k++) {
      const half = len - k > 2 ? 1 : 0
      for (let x = cx - half; x <= cx + half; x++) r.set(x, 12 + k, x < cx ? VIOLET[0] : x > cx ? VIOLET[2] : VIOLET[1])
      r.set(cx - half - 1, 12 + k, VIOLET[4])
      r.set(cx + half + 1, 12 + k, VIOLET[4])
    }
    r.set(cx, 12 + len, VIOLET[4])
  }
  for (let y = 19; y < TILE; y++) for (let x = 0; x < TILE; x++) r.data[y * TILE + x] = 0
  return r
}

const tile = memoTile((q) => {
  switch (q.kind) {
    case 'solid':
      return paintGround(q, ground)
    case 'dirt':
      return paintDirt(q, dirt)
    case 'platform':
      return bridge(q)
    case 'spike':
      return paintSpike(q, spike)
  }
})

// ---------------------------------------------------------------------------------------------- decorations

/** A five-point star of `ro` outer and `ri` inner radius, point up, lit from the top-left. */
function starShape(r: Raster, cx: number, cy: number, ro: number, ri: number, g: Ramp) {
  const pts: number[] = []
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const rad = i % 2 === 0 ? ro : ri
    pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
  }
  r.poly(pts, g[1])
  // Shade the right-hand lower half and light the upper left.
  for (let y = Math.floor(cy - ro); y <= Math.ceil(cy + ro); y++)
    for (let x = Math.floor(cx - ro); x <= Math.ceil(cx + ro); x++) {
      if (r.get(x, y) !== g[1]) continue
      if (x - cx + (y - cy) > ro * 0.5) r.set(x, y, g[2])
      else if (x - cx + (y - cy) < -ro * 0.55) r.set(x, y, g[0])
    }
  r.set(cx, cy, g[0])
}

const decorations = [
  // Star flowers: a star head on a thin stem, two heights.
  decor('top', 4, 14, 22, (r) => {
    blade(r, 7, 22, 0, 13, SPROUT)
    blade(r, 5, 22, -3, 5, SPROUT)
    starShape(r, 8, 8, 7, 3, GOLD)
  }),
  decor('top', 3, 12, 16, (r) => {
    blade(r, 6, 16, 1, 8, SPROUT)
    blade(r, 8, 16, 3, 4, SPROUT)
    starShape(r, 6, 5, 4.6, 2, GOLD)
  }),
  // A cluster of small glowing crystals.
  decor('top', 3, 16, 14, (r) => {
    spire(r, 8, 13, 3, 13, GLOWC, false, 1)
    spire(r, 3, 13, 2, 7, GLOWC, false, -1)
    spire(r, 13, 13, 2, 9, GLOWC, false, 2)
    r.set(7, 4, C.white)
  }),
  decor('top', 2, 10, 12, (r) => {
    spire(r, 5, 11, 3, 11, VIOLET, false, -1)
    r.set(4, 4, C.white)
  }),
  // A tiny fallen star lying tilted, with a glint.
  decor('top', 3, 14, 11, (r) => {
    starShape(r, 7, 6, 5.4, 2.4, GOLD)
    r.set(10, 2, C.white)
    r.set(11, 1, GOLD[0])
  }),
  // Pebbles of indigo rock with a gold fleck.
  decor('top', 3, 18, 8, (r) => {
    stones(
      r,
      9,
      8,
      [
        [-5, 2.6, 2],
        [0, 3.4, 3],
        [5, 2.2, 1.6]
      ],
      [S[0], CAPL, S[1], S[2], S[4]]
    )
    r.set(9, 4, GOLD[0])
  }),
  // A sprout with a star bud.
  decor('top', 2, 12, 18, (r) => {
    blade(r, 6, 18, 0, 10, SPROUT)
    ball(r, 3, 12, 2.6, 1.6, SPROUT, false)
    ball(r, 10, 9, 2.6, 1.6, SPROUT, false)
    starShape(r, 6, 5, 3.4, 1.5, GOLD)
  }),
  // Hanging crystals: a long one and a pair of short ones.
  decor('under', 4, 14, 32, (r) => {
    spire(r, 7, 0, 5, 31, VIOLET, true, 1)
    spire(r, 12, 0, 2, 13, VIOLET, true, -1)
    r.set(6, 6, C.white)
  }),
  decor('under', 4, 14, 16, (r) => {
    spire(r, 4, 0, 3, 14, VIOLET, true, 0)
    spire(r, 10, 0, 3, 10, GLOWC, true, 1)
  })
]

export const terrain: TerrainArt | undefined = { tile, decor: decorations }
