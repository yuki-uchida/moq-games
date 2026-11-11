import { R, ramp } from '../../palette'
import { Raster, ball } from '../../raster'
import type { TerrainArt } from '../types'
import {
  decor,
  leafShape,
  memoTile,
  mushroom,
  paintDirt,
  paintGround,
  paintPlatform,
  paintSpike,
  scatter,
  soilFill,
  stroke,
  tuft,
  wander,
  type Ctx,
  type DirtStyle,
  type GroundStyle,
  type PlatformStyle,
  type SpikeStyle
} from './kit'

/**
 * Terrain of the `forest` world: dark mossy grass with roots crawling over it, deep brown soil full of buried
 * roots, weathered bark planks and ferns, red mushrooms and fallen leaves.
 */
const SEED = 303
const G = R.grassForest
const S = R.soilForest
const MOSS = ramp('#b4e08a', '#78b45a', '#4f8a46', '#336a3c', '#10261f')
const AUTUMN = ramp('#ffd488', '#f0a040', '#c8702a', '#8a4420', '#3a1a22')
const OLIVE = ramp('#d8e08a', '#a8b45a', '#78883e', '#4f5a2e', '#10261f')
const BARK = ramp('#a8784a', '#7e5532', '#5a3b22', '#3a2514', '#3a1a22')

/** Roots crawling over the lip and mossy blotches on it. */
function lipDetail(c: Ctx) {
  if (!c.ex.top) return
  scatter(c.r, c.q, { cell: 64, seed: SEED + 50, chance: 0.6, margin: 30 }, (l, x, _y, rnd) => {
    const path = wander(rnd, x, 1, 0.5 + rnd() * 0.5, 3, 7, 0.3)
    stroke(l, path, 2, R.bark[2])
    stroke(
      l,
      path.map(([px, py]) => [px, py - 1] as [number, number]),
      1,
      R.bark[1]
    )
  })
  scatter(c.r, c.q, { cell: 32, seed: SEED + 51, chance: 0.5, margin: 6 }, (l, x, _y, rnd) => {
    const w = 6 + Math.floor(rnd() * 6)
    l.rect(x, 1, w, 2, MOSS[2])
    l.rect(x + 1, 1, Math.max(2, w - 3), 1, MOSS[1])
  })
}

/** Heavy roots hanging from the underside. */
function edgeDetail(c: Ctx) {
  if (!c.ex.bottom) return
  scatter(c.r, c.q, { cell: 24, seed: SEED + 40, chance: 0.55, margin: 6 }, (l, x, _y, rnd) => {
    const len = 5 + Math.floor(rnd() * 5)
    const lean = rnd() < 0.5 ? -1 : 1
    for (let i = 0; i < len; i++) l.rect(x + Math.round(lean * i * 0.4), 63 - i, 3, 1, R.bark[i < len - 2 ? 1 : 2])
  })
}

const ground: GroundStyle = {
  seed: SEED,
  grass: G,
  soil: S,
  lip: 9,
  blade: 4,
  round: 6,
  fill: (c) => soilFill(c, S, SEED, R.rock, { rootChance: 0.9, rootDark: S[3], rootLight: S[0] }),
  lipDetail,
  edgeDetail
}

/** Moss clumps and a leaf or two on the planks. */
function mossy(c: Ctx) {
  scatter(c.r, c.q, { cell: 24, seed: SEED + 60, chance: 0.6, margin: 6 }, (l, x, _y, rnd) => {
    const w = 6 + Math.floor(rnd() * 6)
    l.rect(x, 0, w, 3, MOSS[1])
    l.rect(x + 1, 0, Math.max(1, w - 3), 1, MOSS[0])
    l.rect(x + 1, 3, Math.max(2, w - 3), 1, MOSS[2])
  })
}

const dirt: DirtStyle = { seed: SEED + 200, clay: R.clay, rock: R.rock }
const platform: PlatformStyle = { seed: SEED + 300, wood: BARK, rope: R.weaselTan, detail: mossy }
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

/** A fern frond: a curved midrib with leaflet pairs, thinning toward the tip. */
function frond(r: Raster, x: number, y: number, dx: number, h: number, g = R.pineLeaf) {
  const pts: [number, number][] = []
  for (let i = 0; i <= h; i++) pts.push([x + dx * (i / h) ** 1.6, y - i])
  for (let i = 0; i < h; i++) {
    const [px, py] = pts[i]
    const span = Math.max(1, Math.round(((h - i) / h) * 4))
    if (i > 1 && i % 2 === 0) {
      r.rect(Math.round(px) - span, py, span, 1, g[1])
      r.rect(Math.round(px) + 1, py, span, 1, g[2])
    }
  }
  stroke(r, pts, 1, g[0])
}

const decorations = [
  // Ferns.
  decor('top', 4, 24, 20, (r) => {
    frond(r, 12, 20, -9, 14)
    frond(r, 12, 20, 9, 14)
    frond(r, 12, 20, 0, 18)
  }),
  decor('top', 2, 16, 12, (r) => {
    frond(r, 8, 12, -5, 9, R.leaf)
    frond(r, 8, 12, 6, 8, R.leaf)
  }),
  // A red mushroom with white dots.
  decor('top', 3, 14, 14, (r) =>
    mushroom(r, 7, 14, { cap: R.crimson, stem: R.cream, capW: 11, capH: 6, stemH: 5, dots: 2 })
  ),
  // Two small red mushrooms.
  decor('top', 2, 18, 12, (r) => {
    mushroom(r, 6, 12, { cap: R.crimson, stem: R.cream, capW: 9, capH: 5, stemH: 4, dots: 1 })
    mushroom(r, 13, 12, { cap: R.crimson, stem: R.cream, capW: 6, capH: 3, stemH: 3, dots: 0, stemW: 2 })
  }),
  // An acorn lying on the ground.
  decor('top', 2, 12, 10, (r) => {
    ball(r, 6, 6, 3.6, 4, R.wood, false)
    ball(r, 6, 3, 4, 2.4, R.bark, false)
    r.rect(6, 0, 1, 1, R.bark[2])
  }),
  // Fallen leaves.
  decor(
    'top',
    4,
    22,
    9,
    (r) => {
      leafShape(r, 5, 6, 4.5, 2.2, -0.25, AUTUMN)
      leafShape(r, 13, 7, 4, 2, 0.2, OLIVE)
      leafShape(r, 18, 5, 3, 1.6, -0.5, AUTUMN)
    },
    { sink: 2 }
  ),
  // A clump of moss with a few stems.
  decor(
    'top',
    3,
    22,
    10,
    (r) => {
      ball(r, 11, 8, 9, 5, MOSS, false)
      r.rect(5, 2, 2, 3, MOSS[1])
      r.rect(14, 1, 2, 4, MOSS[1])
    },
    { sink: 2 }
  ),
  // A dark tuft of grass.
  decor('top', 4, 16, 14, (r) =>
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
  // Hanging vines with leaves.
  decor(
    'under',
    4,
    16,
    26,
    (r) => {
      for (const [x, len] of [
        [4, 24],
        [10, 15],
        [14, 9]
      ]) {
        stroke(
          r,
          [
            [x, 0],
            [x + 1, len / 2],
            [x - 1, len]
          ],
          1,
          R.pineLeaf[2]
        )
        leafShape(r, x + 2, len * 0.45, 2.6, 1.4, 0.5, R.pineLeaf)
        leafShape(r, x - 2, len * 0.8, 2.6, 1.4, -0.6, R.pineLeaf)
      }
    },
    { sink: 2 }
  ),
  // Roots.
  decor(
    'under',
    3,
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
  )
]

export const terrain: TerrainArt | undefined = { tile, decor: decorations }
