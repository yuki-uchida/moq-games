import { R } from '../../palette'
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
 * Terrain of the `meadow` world: a lush grass lip over warm brown soil, bright clay, honey-coloured planks and
 * small daytime flowers.
 */
const SEED = 101
const G = R.grass
const S = R.soil

/** Roots poking out of the underside and a stone or two. */
function edgeDetail(c: Ctx) {
  if (!c.ex.bottom) return
  scatter(c.r, c.q, { cell: 48, seed: SEED + 40, chance: 0.4, margin: 6 }, (l, x, _y, rnd) => {
    const len = 4 + Math.floor(rnd() * 4)
    const lean = rnd() < 0.5 ? -1 : 1
    for (let i = 0; i < len; i++) {
      const px = x + Math.round(lean * i * 0.4)
      l.rect(px, 63 - i, 2, 1, R.bark[i < len - 2 ? 1 : 2])
    }
  })
}

const ground: GroundStyle = {
  seed: SEED,
  grass: G,
  soil: S,
  lip: 8,
  blade: 4,
  round: 6,
  fill: (c) => soilFill(c, S, SEED, R.rock),
  edgeDetail
}

const dirt: DirtStyle = { seed: SEED + 200, clay: R.clay, rock: R.rock }
const platform: PlatformStyle = { seed: SEED + 300, wood: R.wood, rope: R.weaselTan }
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
  // Two grass tufts of different height.
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
  // A daisy.
  decor('top', 2, 12, 20, (r) => {
    blade(r, 6, 20, 1, 12, R.leaf)
    blade(r, 3, 20, -3, 5, R.leaf)
    flowerHead(r, 7, 6, R.paper, R.honey[1], { n: 6, rad: 3, pr: 1.7 })
  }),
  // A tulip.
  decor('top', 2, 12, 22, (r) => {
    blade(r, 5, 22, 0, 13, R.leaf)
    blade(r, 7, 22, 3, 7, R.leaf)
    blade(r, 3, 22, -3, 7, R.leaf)
    ball(r, 5, 8, 3, 4, R.hamEar)
    r.rect(5, 3, 1, 2, R.hamEar[1])
  }),
  // Clover with a pale flower.
  decor('top', 3, 18, 14, (r) => {
    blade(r, 9, 14, 0, 7, R.leaf)
    for (const [x, y] of [
      [6, 11],
      [12, 11],
      [9, 7]
    ])
      ball(r, x, y, 2.4, 2.1, R.leaf, false)
    ball(r, 14, 5, 2, 2, R.hamPink, false)
    blade(r, 14, 9, 0, 4, R.leaf)
  }),
  // A small tan mushroom.
  decor('top', 2, 14, 12, (r) =>
    mushroom(r, 7, 12, { cap: R.weaselTan, stem: R.cream, capW: 10, capH: 5, stemH: 5, dots: 2 })
  ),
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
      R.rock
    )
  ),
  // Hanging roots.
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
          R.bark[1]
        )
    },
    { sink: 2 }
  ),
  // A drip of moss.
  decor(
    'under',
    3,
    18,
    10,
    (r) => {
      const moss = new Raster(r.w, r.h)
      ball(moss, 9, 2, 8, 4, R.leaf, false)
      for (const [x, len] of [
        [4, 8],
        [9, 10],
        [14, 6]
      ])
        moss.rect(x, 3, 2, len - 2, R.leaf[2])
      r.blit(moss)
    },
    { sink: 2 }
  )
]

export const terrain: TerrainArt | undefined = { tile, decor: decorations }
