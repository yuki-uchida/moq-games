import { C, R, ramp } from '../../palette'
import { Raster, ball } from '../../raster'
import type { TerrainArt } from '../types'
import {
  blade,
  decor,
  flowerHead,
  memoTile,
  mushroom,
  paintDirt,
  paintGround,
  paintPlatform,
  paintSpike,
  scatter,
  soilFill,
  stones,
  stroke,
  tuft,
  type Ctx,
  type DirtStyle,
  type GroundStyle,
  type PlatformStyle,
  type SpikeStyle
} from './kit'

/**
 * Terrain of the `night` world: cool teal grass with dew over violet soil, dusk-blue planks and softly glowing
 * little plants. Everything leans blue so the warm clay and the characters stand out.
 */
const SEED = 202
const G = R.grassNight
const S = R.soilNight

/** Planks with a blue-violet cast. */
const WOOD = ramp('#b4a4c8', '#8a789f', '#645580', '#43385e', '#1c1830')
const MOONPETAL = ramp('#ffffff', '#e6eeff', '#b4c2f0', '#7f8ed0', '#121b36')
const GLOW = ramp('#f4fff4', '#a8f0d8', '#62c0b4', '#3c8890', '#121b36')

/** Dew: pale droplets on the lip, a few on the soil's lit rim. */
function lipDetail(c: Ctx) {
  if (!c.ex.top) return
  scatter(c.r, c.q, { cell: 24, seed: SEED + 50, chance: 0.55, margin: 4 }, (l, x, _y, rnd) => {
    const y = 2 + Math.floor(rnd() * 3)
    l.rect(x, y, 2, 1, C.spark)
    l.set(x, y + 1, G[0])
  })
}

function edgeDetail(c: Ctx) {
  if (!c.ex.bottom) return
  scatter(c.r, c.q, { cell: 48, seed: SEED + 40, chance: 0.4, margin: 6 }, (l, x, _y, rnd) => {
    const len = 4 + Math.floor(rnd() * 4)
    const lean = rnd() < 0.5 ? -1 : 1
    for (let i = 0; i < len; i++) l.rect(x + Math.round(lean * i * 0.4), 63 - i, 2, 1, S[i < len - 2 ? 0 : 1])
  })
}

const ground: GroundStyle = {
  seed: SEED,
  grass: G,
  soil: S,
  lip: 8,
  blade: 3,
  round: 6,
  fill: (c) => soilFill(c, S, SEED, R.stone),
  lipDetail,
  edgeDetail
}

/** Moss on the planks: a few teal mounds on the top edge and a drip underneath. */
function mossy(c: Ctx) {
  scatter(c.r, c.q, { cell: 32, seed: SEED + 60, chance: 0.4, margin: 6 }, (l, x, _y, rnd) => {
    const w = 5 + Math.floor(rnd() * 5)
    l.rect(x, 0, w, 3, G[1])
    l.rect(x + 1, 0, Math.max(1, w - 3), 1, G[0])
    l.rect(x + 1, 3, Math.max(2, w - 3), 1, G[2])
  })
}

const dirt: DirtStyle = { seed: SEED + 200, clay: R.clay, rock: R.stone }
const platform: PlatformStyle = { seed: SEED + 300, wood: WOOD, rope: R.weaselTan, detail: mossy }
const spike: SpikeStyle = { seed: SEED + 400, steel: R.steel, base: S }

const tile = memoTile((q) => {
  switch (q.kind) {
    case 'solid':
      return paintGround(q, ground)
    case 'dirt':
      return paintDirt(q, dirt)
    case 'platform':
      return paintPlatform(q, platform)
    case 'spike':
      return paintSpike(q, spike)
  }
})

const decorations = [
  // A moon-flower: a pale open bloom on a stem.
  decor('top', 3, 14, 22, (r) => {
    blade(r, 7, 22, 0, 13, G)
    blade(r, 9, 22, 4, 6, G)
    blade(r, 5, 22, -3, 6, G)
    flowerHead(r, 7, 8, MOONPETAL, C.glow, { n: 6, rad: 3.4, pr: 2 })
  }),
  // A small glowing mushroom.
  decor('top', 3, 12, 11, (r) => mushroom(r, 6, 11, { cap: GLOW, stem: R.cream, capW: 9, capH: 5, stemH: 4, dots: 2 })),
  // A pair of glowing mushrooms, one taller.
  decor('top', 2, 20, 14, (r) => {
    mushroom(r, 6, 14, { cap: GLOW, stem: R.cream, capW: 11, capH: 6, stemH: 6, dots: 2, stemW: 3 })
    mushroom(r, 14, 14, { cap: GLOW, stem: R.cream, capW: 7, capH: 4, stemH: 3, dots: 1, stemW: 2 })
  }),
  // Grass tufts.
  decor('top', 5, 16, 14, (r) =>
    tuft(
      r,
      8,
      14,
      [
        [-4, 9],
        [-1, 12],
        [3, 10],
        [5, 6]
      ],
      G
    )
  ),
  decor('top', 4, 14, 20, (r) =>
    tuft(
      r,
      7,
      20,
      [
        [-3, 14],
        [0, 19],
        [4, 13]
      ],
      G
    )
  ),
  // A drooping bluebell on a long stem.
  decor('top', 2, 14, 20, (r) => {
    stroke(
      r,
      [
        [4, 20],
        [5, 13],
        [8, 8]
      ],
      1,
      G[1]
    )
    ball(r, 9, 9, 2.6, 3, MOONPETAL, false)
    r.rect(8, 6, 2, 1, G[2])
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
      R.stone
    )
  ),
  // Roots.
  decor(
    'under',
    4,
    16,
    18,
    (r) => {
      for (const [x, len, lean] of [
        [4, 16, 1],
        [8, 11, -1],
        [12, 8, 2]
      ] as const)
        stroke(
          r,
          [
            [x, 0],
            [x + lean * 0.5, len / 2],
            [x + lean, len]
          ],
          2,
          S[2]
        )
    },
    { sink: 2 }
  ),
  // Hanging glow-moss with a few bright beads.
  decor(
    'under',
    3,
    18,
    12,
    (r) => {
      const moss = new Raster(r.w, r.h)
      ball(moss, 9, 2, 8, 4, G, false)
      for (const [x, len] of [
        [4, 8],
        [9, 10],
        [14, 6]
      ])
        moss.rect(x, 3, 2, len - 2, G[2])
      r.blit(moss)
      r.rect(9, 11, 2, 2, GLOW[1])
      r.rect(4, 9, 2, 2, GLOW[1])
    },
    { sink: 2 }
  )
]

export const terrain: TerrainArt | undefined = { tile, decor: decorations }
