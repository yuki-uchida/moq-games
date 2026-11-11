import type { TileQuery } from '../../contract'
import { DARKER, R, color, ramp } from '../../palette'
import { Raster, ball, hash } from '../../raster'
import type { TerrainArt } from '../types'
import {
  TILE,
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
  stones,
  wrap,
  type Ctx,
  type DirtStyle,
  type GroundStyle,
  type SpikeStyle
} from './kit'

/**
 * Terrain of the `castle` world (stage 9): sooty red brick in running bond with continuous mortar, a purple-grey
 * stone cornice with a thin gold line on top, soot streaks toward the undersides, and carved stone shelves studded
 * with gold.
 */
const SEED = 606
const B = R.brick
const T = R.castleStone
const GOLD = R.gold
/** Brick faces: darker and duller than the shared `brick` base, so the wall sits behind the characters. */
const BRK = ramp('#b45a4a', '#85403a', '#68322f', '#4c2428', '#3a1a22')
const BR_HI = BRK[0]
const BR_M = BRK[1]
const BR_D = BRK[2]
const BR_L = color('#9a4a40')
const MORTAR = color('#38202f')
const MORTAR_HI = color('#54344a')
const soot = (c: number) => (c === BR_L ? BR_M : DARKER[c])
const SOOT = ramp('#6a4458', '#52323f', '#3e2634', '#2c1a28', '#1c1020')
const DRY = ramp('#e2cc98', '#b89c64', '#8a7244', '#5a4830', '#3a1a22')
const WAX = ramp('#ffffff', '#f4ead8', '#d8c8b0', '#a89480', '#3a1a22')
const BANNER = ramp('#f0708a', '#b82a4a', '#821a3a', '#521028', '#2a0c1c')
const IRON = dim(R.steel)

const COURSES = { seed: SEED, h: 12, snap: 12, patterns: [[24, 24, 24, 24, 24, 24, 24, 24]] }

/** Running-bond brick: a mortar line above and left of every brick, a lit top bevel, a shaded foot. */
function fill(c: Ctx) {
  const { r, ox, oy } = c
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const wx = ox + x
      const wy = oy + y
      const b = brickAt(wx, wy, COURSES)
      const u = wx - b.x0
      const v = wy - b.y0
      let col = b.id < 0.2 ? BR_L : b.id < 0.8 ? BR_M : BR_D
      if (v === 0 || u === 0) col = MORTAR
      else if (v === 1) col = b.id < 0.8 ? BR_HI : BR_L
      else if (u === 1 && b.id < 0.8) col = BR_L
      else if (v === COURSES.h - 1 || u === 23) col = BR_D
      else if (b.id > 0.9 && v === 5 && u > 6 && u < 15) col = BR_D // a chipped nick
      // Mortar that has gone pale in places, so the joints are not one ruled grid.
      if ((v === 0 || u === 0) && lineNoise(wx + wy, 6, SEED + 3) > 0.7) col = MORTAR_HI
      r.set(x, y, col)
    }
}

/** Soot: bottom of a wall goes darker in streaks that run up from the edge. */
function edgeDetail(c: Ctx) {
  if (!c.ex.bottom) return
  const { r, ox } = c
  for (let x = 0; x < TILE; x++) {
    const reach = 6 + Math.floor(lineNoise(ox + x, 6, SEED + 31) * 9)
    for (let y = TILE - 1 - reach; y < TILE - 1; y++) {
      const cur = r.get(x, y)
      if (!cur) continue
      r.set(x, y, soot(cur))
      if (y > TILE - 6) r.set(x, y, soot(r.get(x, y)))
    }
  }
}

const slabAt = (wx: number) => {
  const k = Math.floor(wx / 32)
  const n = (hash(wrap(k, 48), 7, SEED) % 17) - 8
  const j = k * 32 + n
  return wx >= j ? { u: wx - j, w: 32 + ((hash(wrap(k + 1, 48), 7, SEED) % 17) - 8) - n } : { u: wx - (j - 32), w: 32 }
}

/** The cornice: a thin gold line over lit purple-grey stone, a dentil band and a shadowed lip. */
function capColour(t: number, end: number, wx: number) {
  const tt = Math.round(t)
  if (tt > end + 1) return B[3]
  if (tt > end) return B[3]
  if (tt === end) return T[3]
  if (tt === 1) return GOLD[0]
  if (tt === 2) return GOLD[1]
  if (tt === 3) return GOLD[2]
  const s = slabAt(wx)
  if (tt >= end - 2) {
    // Dentils: small blocks with a gap, lit on the left.
    const d = wrap(wx, 8)
    if (tt === end - 2) return T[3]
    return d < 5 ? (d === 0 ? T[0] : T[1]) : T[3]
  }
  if (s.u === 0) return T[3]
  if (s.u === 1) return T[0]
  return tt === 4 ? T[0] : tt >= end - 3 ? T[2] : T[1]
}

function underColour(b: number) {
  return b <= 1 ? SOOT[3] : 0
}

function sideColour(d: number, _wy: number, lit: boolean) {
  if (lit) return d <= 1 ? BR_HI : d === 2 ? BR_L : 0
  return d <= 1 ? BRK[4] : d <= 3 ? BRK[3] : 0
}

const ground: GroundStyle = {
  seed: SEED,
  grass: T,
  soil: BRK,
  lip: 10,
  blade: 0,
  round: 4,
  fill,
  lipEnd: () => 10,
  capColour,
  underDepth: () => 2,
  underColour,
  sideColour,
  edgeDetail
}

const dirt: DirtStyle = { seed: SEED + 200, clay: R.clay, rock: R.castleStone }
const spike: SpikeStyle = {
  seed: SEED + 400,
  steel: R.steel,
  base: BRK,
  baseDetail: (r, top) => {
    r.rect(0, top + 8, TILE, 1, MORTAR)
    for (const x of [8, 32, 56]) r.rect(x, top + 1, 1, 7, MORTAR)
    for (const x of [20, 44]) r.rect(x, top + 9, 1, 6, MORTAR)
  }
}

// ----------------------------------------------------------------------------------------------- shelves

/** A carved stone shelf: studs of gold on the front face and a scalloped corbel table beneath. */
function shelf(q: TileQuery): Raster {
  const r = new Raster(TILE, TILE)
  const ends = ledgeEnds(q.around)
  const x0 = ends.leftEnd ? 1 : 0
  const x1 = ends.rightEnd ? TILE - 2 : TILE - 1
  for (let x = x0; x <= x1; x++) {
    const e = Math.min(ends.leftEnd ? x - x0 : 9, ends.rightEnd ? x1 - x : 9)
    for (let y = 0; y <= 11; y++) {
      if (e < 2 && (y === 0 || y === 11) && e < 1) continue
      let col = T[1]
      if (y === 0) col = T[4]
      else if (y === 1) col = GOLD[1]
      else if (y === 2) col = GOLD[2]
      else if (y === 3) col = T[0]
      else if (y === 4) col = T[1]
      else if (y >= 10) col = y === 11 ? T[4] : T[3]
      else if (y >= 8) col = T[2]
      r.set(x, y, col)
    }
  }
  // Panel lines on the front face.
  for (const px of [0, 16, 32, 48])
    if (px + 1 >= x0 && px < x1) {
      r.rect(px, 5, 1, 5, T[3])
      r.rect(px + 1, 5, 1, 5, T[0])
    }
  // Gold studs: a lit ball in each panel.
  for (let i = 0; i < 4; i++) {
    const cx = i * 16 + 8
    if (cx < x0 + 3 || cx > x1 - 3) continue
    r.rect(cx - 1, 6, 3, 3, GOLD[1])
    r.set(cx - 1, 6, GOLD[0])
    r.rect(cx, 8, 2, 1, GOLD[2])
    r.set(cx + 1, 7, GOLD[3])
    r.set(cx - 2, 7, T[4])
    r.set(cx + 2, 7, T[4])
    r.rect(cx - 1, 5, 3, 1, T[4])
    r.rect(cx - 1, 9, 3, 1, T[4])
  }
  // Corbel table: small arches hanging under the shelf.
  for (let ax = 0; ax < TILE; ax += 16) {
    for (let k = 0; k < 6; k++) {
      const half = 7 - Math.floor(k * 1.1)
      for (let x = ax + 8 - half; x <= ax + 8 + half; x++) {
        if (x < x0 || x > x1) continue
        const edge = x === ax + 8 - half || x === ax + 8 + half
        r.set(x, 12 + k, edge ? T[4] : x < ax + 8 ? T[2] : T[3])
      }
    }
    // Hollow of the arch.
    for (let k = 0; k < 4; k++)
      for (let x = ax + 8 - (5 - k); x <= ax + 8 + (5 - k); x++)
        if (x >= x0 && x <= x1 && r.get(x, 12 + k)) r.set(x, 12 + k, SOOT[2])
    r.set(ax + 8, 18, T[4])
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
      return shelf(q)
    case 'spike':
      return paintSpike(q, spike)
  }
})

// ---------------------------------------------------------------------------------------------- decorations

/** A candle stub: wax body with a drip, a wick and a tiny flame. */
function candle(r: Raster, x: number, y: number, h: number, flame = true) {
  r.rect(x - 3, y - h, 6, h, WAX[1])
  r.rect(x - 3, y - h, 1, h, WAX[0])
  r.rect(x + 2, y - h, 1, h, WAX[2])
  r.rect(x - 3, y - h, 6, 1, WAX[0])
  r.rect(x + 1, y - h + 1, 1, 3, WAX[0])
  r.rect(x - 1, y - h - 2, 1, 2, IRON[3])
  if (flame) {
    r.rect(x - 2, y - h - 6, 3, 4, R.fire[2])
    r.rect(x - 1, y - h - 7, 1, 1, R.fire[2])
    r.rect(x - 1, y - h - 5, 2, 3, R.fire[1])
    r.rect(x - 1, y - h - 4, 1, 2, R.fire[0])
  }
}

const decorations = [
  // Candle stubs: one tall with a flame, and a pair on a small dish.
  decor('top', 4, 10, 20, (r) => candle(r, 5, 18, 10)),
  decor('top', 3, 20, 18, (r) => {
    r.rect(1, 16, 18, 2, T[2])
    r.rect(1, 16, 18, 1, T[0])
    candle(r, 6, 16, 7)
    candle(r, 14, 16, 5, false)
    r.set(15, 9, WAX[2])
  }),
  // Loose bricks.
  decor('top', 3, 20, 11, (r) => {
    r.rect(1, 6, 12, 5, BR_M)
    r.rect(1, 6, 12, 1, BR_HI)
    r.rect(1, 10, 12, 1, B[2])
    r.rect(12, 6, 1, 5, B[2])
    r.poly([8, 6, 9, 1, 19, 3, 19, 8, 18, 7], BR_L)
    r.line(9, 1, 19, 3, BR_HI)
    r.line(18, 7, 19, 8, B[2])
    r.set(14, 4, B[2])
  }),
  decor('top', 2, 14, 8, (r) =>
    stones(
      r,
      7,
      8,
      [
        [-3, 3, 2.4],
        [2, 2.6, 3],
        [5, 1.6, 1.4]
      ],
      B
    )
  ),
  // Dry weeds.
  decor('top', 3, 12, 14, (r) => {
    blade(r, 5, 14, -3, 9, DRY)
    blade(r, 6, 14, 0, 13, DRY)
    blade(r, 7, 14, 4, 8, DRY)
  }),
  decor('top', 2, 10, 9, (r) => {
    blade(r, 4, 9, -2, 6, DRY)
    blade(r, 5, 9, 2, 8, DRY)
  }),
  // A fallen banner scrap with a gold hem.
  decor(
    'top',
    2,
    24,
    9,
    (r) => {
      r.poly([1, 8, 3, 3, 12, 5, 20, 3, 23, 8, 12, 9], BANNER[1])
      r.line(3, 3, 12, 5, BANNER[0])
      r.line(12, 5, 20, 3, BANNER[0])
      r.line(1, 8, 12, 9, BANNER[3])
      r.line(12, 9, 23, 8, BANNER[3])
      r.rect(6, 6, 3, 1, BANNER[2])
      r.rect(14, 6, 4, 1, BANNER[2])
      for (const x of [3, 6, 9, 13, 17, 20]) r.set(x, 9, GOLD[1])
    },
    { sink: 2 }
  ),
  // Cobwebs: strands fanning from the top edge with a few arcs.
  decor(
    'under',
    4,
    20,
    14,
    (r) => {
      const web = WAX[2]
      for (const [dx, len] of [
        [-9, 8],
        [-5, 12],
        [0, 13],
        [5, 12],
        [9, 8]
      ])
        r.line(10, 0, 10 + dx, len, web)
      for (const k of [5, 9]) {
        r.line(10 - Math.round(k * 0.75), k - 1, 10 - Math.round(k * 0.4), k + 1, WAX[1])
        r.line(10 + Math.round(k * 0.4), k + 1, 10 + Math.round(k * 0.75), k - 1, WAX[1])
        r.line(10 - Math.round(k * 0.4), k + 1, 10 + Math.round(k * 0.4), k + 1, WAX[1])
      }
    },
    { outline: false, sink: 1 }
  ),
  // Chains with a ring at the top.
  decor('under', 3, 8, 28, (r) => {
    for (let i = 0; i < 6; i++) {
      const yy = i * 5
      if (i % 2 === 0) {
        r.rect(2, yy, 4, 6, IRON[1])
        r.rect(3, yy + 1, 2, 4, 0)
        r.rect(2, yy, 2, 1, R.steel[0])
        r.rect(5, yy + 2, 1, 4, IRON[3])
      } else {
        r.rect(3, yy, 2, 6, IRON[2])
        r.set(3, yy, R.steel[1])
      }
    }
  }),
  // Wax drips.
  decor(
    'under',
    3,
    16,
    16,
    (r) => {
      r.rect(1, 0, 14, 3, WAX[1])
      r.rect(1, 0, 14, 1, WAX[0])
      for (const [x, len] of [
        [3, 9],
        [8, 14],
        [12, 6]
      ]) {
        r.rect(x, 3, 2, len - 3, WAX[1])
        r.set(x, 3, WAX[0])
        ball(r, x + 0.5, len - 1, 1.6, 1.6, WAX, false)
      }
    },
    { sink: 2 }
  )
]

export const terrain: TerrainArt | undefined = { tile, decor: decorations }
