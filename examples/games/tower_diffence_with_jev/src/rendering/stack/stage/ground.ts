import { pointOnPath, type FieldId, type Point } from '../../../game/model'
import { allRoadPaths, type ResolvedBattlefield } from '../../../game/BattlefieldRoutes'

/** Board units per ground pixel; magnified with nearest filtering to harmonize with stacked sprites. */
export const GROUND_CELL = 2

interface Biome {
  ground: readonly string[]
  tuft: string
  tuftLight: string
  edge: string
  road: readonly string[]
  roadCenter: string
  roadEdge: string
  roadOutline: string
  pebble: string
  slow: string
  slowLight: string
  slowBorder: string
  flowers: readonly string[]
  glow?: string
  glowCrust?: string
}

export const BIOMES: Record<FieldId, Biome> = {
  meadow: {
    ground: ['#4f9442', '#5aa148', '#66ad50', '#45843b'],
    tuft: '#3b7334',
    tuftLight: '#7bc45c',
    edge: '#2d5929',
    road: ['#d4a96a', '#dfb778', '#c49658'],
    roadCenter: '#e7c68c',
    roadEdge: '#9e7242',
    roadOutline: '#593d24',
    pebble: '#f0ddb2',
    slow: '#6d5038',
    slowLight: '#826146',
    slowBorder: '#473323',
    flowers: ['#fff6d6', '#ffd24a', '#ff8fb8']
  },
  desert: {
    ground: ['#dfba72', '#e8c682', '#d2a960', '#efd292'],
    tuft: '#be914d',
    tuftLight: '#f6dea6',
    edge: '#9c713a',
    road: ['#c79052', '#d29c5e', '#b88246'],
    roadCenter: '#deac70',
    roadEdge: '#8f5f32',
    roadOutline: '#5a3a1e',
    pebble: '#f5e2ba',
    slow: '#a3713b',
    slowLight: '#b88449',
    slowBorder: '#6e4924',
    flowers: ['#86a852', '#d8a654']
  },
  frost: {
    ground: ['#dce8f2', '#e6f0f8', '#eef6fc', '#cadbe8'],
    tuft: '#b5cada',
    tuftLight: '#ffffff',
    edge: '#7b97ad',
    road: ['#92a6b8', '#a0b3c4', '#8397a9'],
    roadCenter: '#b4c5d4',
    roadEdge: '#667a8c',
    roadOutline: '#3c4c5c',
    pebble: '#dce6ef',
    slow: '#6598b3',
    slowLight: '#82b6d0',
    slowBorder: '#3e6a82',
    flowers: ['#9eddf2', '#ffffff']
  },
  volcanic: {
    ground: ['#3e3642', '#473e4c', '#362f3a', '#504656'],
    tuft: '#2a242e',
    tuftLight: '#605468',
    edge: '#221c26',
    road: ['#695c63', '#75676f', '#5c5057'],
    roadCenter: '#83757d',
    roadEdge: '#473d43',
    roadOutline: '#261f24',
    pebble: '#968890',
    slow: '#36303d',
    slowLight: '#473f4f',
    slowBorder: '#221d28',
    flowers: ['#6c5d66', '#564952'],
    glow: '#ff7d2e',
    glowCrust: '#281d22'
  }
}

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
function noise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale,
    fy = y / scale
  const ix = Math.floor(fx),
    iy = Math.floor(fy)
  const tx = fx - ix,
    ty = fy - iy
  const sx = tx * tx * (3 - 2 * tx),
    sy = ty * ty * (3 - 2 * ty)
  const a = hash(ix, iy, seed),
    b = hash(ix + 1, iy, seed),
    c = hash(ix, iy + 1, seed),
    d = hash(ix + 1, iy + 1, seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/** Points along the slow-terrain stretch of the main path, in board units. */
function slowPoints(field: ResolvedBattlefield): Point[] {
  const surface = field.slowSurface
  const points: Point[] = []
  for (let progress = surface.startProgress; progress <= surface.endProgress; progress += 4)
    points.push(pointOnPath(field.path, progress))
  return points
}

function roadDistance(paths: readonly Point[][], reach: number): (x: number, y: number) => number {
  const size = 32
  const buckets = new Map<number, number[][]>()
  const key = (bx: number, by: number) => (bx + 64) * 4096 + by + 64
  for (const path of paths)
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1],
        b = path[k]
      const segment = [a.x, a.y, b.x, b.y]
      for (
        let bx = Math.floor((Math.min(a.x, b.x) - reach) / size);
        bx <= Math.floor((Math.max(a.x, b.x) + reach) / size);
        bx++
      )
        for (
          let by = Math.floor((Math.min(a.y, b.y) - reach) / size);
          by <= Math.floor((Math.max(a.y, b.y) + reach) / size);
          by++
        ) {
          const list = buckets.get(key(bx, by)) ?? []
          list.push(segment)
          buckets.set(key(bx, by), list)
        }
    }
  return (x, y) => {
    let best = reach
    for (const [ax, ay, bx, by] of buckets.get(key(Math.floor(x / size), Math.floor(y / size))) ?? []) {
      const dx = bx - ax,
        dy = by - ay
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
      best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t))
    }
    return best
  }
}

/** Painted road width in display units: equal across and along at every screen aspect. */
export const ROAD_PAINT_WIDTH = 40

export interface GroundPixels {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

/**
 * Crisp top-down pixel-art ground harmonized with SpriteCook sprite stacks:
 * - Clean banded biome tiles (grass tufts, dune ripples, snow drifts, crusted magma cracks)
 * - Intentional small pixel-art flower blossoms (no single-pixel confetti noise)
 * - Crisp dark-bordered road with worn lighter center track and clear slow-terrain stretch
 */
export function paintGround(field: ResolvedBattlefield, aspect: number): GroundPixels {
  const biome = BIOMES[field.id]
  const width = Math.max(1, Math.round((field.width * aspect) / GROUND_CELL))
  const height = Math.max(1, Math.round(field.height / GROUND_CELL))
  const data = new Uint8ClampedArray(width * height * 4)
  const half = (ROAD_PAINT_WIDTH / 2) * Math.min(1, aspect)
  const paths = allRoadPaths(field).map((path) => path.map((p) => ({ x: p.x * aspect, y: p.y })))
  const slow = slowPoints(field).map((p) => ({ x: p.x * aspect, y: p.y }))
  const distance = roadDistance(paths, half + 40)
  const seed = field.id.length * 31 + field.layoutRevision * 7

  const cache = new Map<string, [number, number, number]>()
  const color = (hex: string): [number, number, number] => {
    let c = cache.get(hex)
    if (!c) {
      c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
      cache.set(hex, c)
    }
    return c
  }

  const rim = Math.max(2, half * 0.16)
  const outlineWidth = Math.max(1.6, GROUND_CELL * 0.9)

  // Coarse pixel-art tile grid (2x2 ground pixels = 4 board units, matching character art-pixel scale).
  const cw = (width >> 1) + 1
  const ch = (height >> 1) + 1
  const tiles = new Array<string>(cw * ch)

  for (let cj = 0; cj < ch; cj++) {
    for (let ci = 0; ci < cw; ci++) {
      const large = noise(ci, cj, 16, seed)
      const med = noise(ci, cj, 6, seed + 3)
      const v = large * 0.72 + med * 0.28
      let hex = biome.ground[v < 0.34 ? 3 : v < 0.52 ? 0 : v < 0.7 ? 1 : 2]

      if (field.id === 'desert') {
        const wave = Math.sin(ci * 0.16 + noise(ci, cj, 22, seed) * 3.2 + cj * 0.09)
        if (wave > 0.93) hex = biome.tuftLight
        else if (wave < -0.94) hex = biome.tuft
      } else if (field.id === 'volcanic') {
        const ridge = Math.abs(noise(ci, cj, 16, seed + 13) - 0.5)
        if (ridge < 0.011) hex = biome.glow!
        else if (ridge < 0.025) hex = biome.glowCrust!
      }
      tiles[cj * cw + ci] = hex
    }
  }

  // Stamp clean 2-3 tile pixel-art tufts and blossoms on meadow/frost (never random confetti!).
  for (let cj = 2; cj < ch - 2; cj += 4) {
    for (let ci = 2; ci < cw - 2; ci += 4) {
      const r = hash(ci, cj, seed + 41)
      const ox = ci + Math.floor(hash(ci, cj, seed + 42) * 3)
      const oy = cj + Math.floor(hash(ci, cj, seed + 43) * 3)
      if (ox < 1 || ox >= cw - 1 || oy < 1 || oy >= ch - 1) continue
      if (field.id === 'meadow') {
        if (r < 0.16) {
          // Small pixel-art V grass tuft.
          tiles[oy * cw + ox] = biome.tuft
          tiles[(oy - 1) * cw + (ox - 1)] = biome.tuftLight
          tiles[(oy - 1) * cw + (ox + 1)] = biome.tuftLight
        } else if (r > 0.91) {
          // Crisp 3-pixel blossom with green base.
          const flower = biome.flowers[Math.floor(hash(ci, cj, seed + 44) * biome.flowers.length)]
          tiles[oy * cw + ox] = flower
          tiles[(oy + 1) * cw + ox] = biome.tuft
        }
      } else if (field.id === 'frost' && r < 0.12) {
        tiles[oy * cw + ox] = biome.tuftLight
        tiles[oy * cw + (ox + 1)] = biome.tuft
      } else if (field.id === 'desert' && r < 0.07) {
        tiles[oy * cw + ox] = biome.tuft
      }
    }
  }

  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const ci = i >> 1
      const cj = j >> 1
      const point = { x: (i + 0.5) * GROUND_CELL, y: (j + 0.5) * GROUND_CELL }
      const d = distance(point.x, point.y)
      let hex: string
      let shade = 1

      if (d <= half + rim + outlineWidth) {
        if (d > half + rim) {
          // Crisp pixel-art dark border separating the road cleanly from terrain.
          hex = biome.roadOutline
        } else if (d > half) {
          hex = biome.roadEdge
        } else {
          const n = noise(ci, cj, 4, seed + 5)
          hex = d < half * 0.45 && n > 0.35 ? biome.roadCenter : biome.road[n < 0.34 ? 2 : n > 0.72 ? 1 : 0]
          // Occasional crisp 2x2 flagstone/pebble accent.
          if ((ci + cj) % 2 === 0 && hash(ci, cj, seed + 9) > 0.965) hex = biome.pebble
          // Slow terrain stretch with a crisp border.
          const inSlow = slow.some(
            (p) => Math.abs(p.x - point.x) < half && Math.hypot(p.x - point.x, p.y - point.y) < half * 0.84
          )
          if (inSlow) {
            const inner = slow.some(
              (p) => Math.abs(p.x - point.x) < half && Math.hypot(p.x - point.x, p.y - point.y) < half * 0.72
            )
            hex = !inner ? biome.slowBorder : noise(ci, cj, 2.5, seed + 11) > 0.54 ? biome.slowLight : biome.slow
          }
        }
      } else {
        hex = tiles[cj * cw + ci]
        // Keep magma glow and flowers cleanly off the road shoulder.
        if (d < half + rim + outlineWidth + 6 && (hex === biome.glow || biome.flowers.includes(hex))) {
          hex = biome.ground[0]
        }
        if (d < half + rim + outlineWidth + GROUND_CELL * 1.4) hex = biome.edge
        // Subtle vignette framing the outer board edges.
        const edgeDistance = Math.min(i, j, width - 1 - i, height - 1 - j) / 2
        if (edgeDistance < 6) shade *= 0.88 + edgeDistance * 0.02
      }

      const [r, g, b] = color(hex)
      const o = (j * width + i) * 4
      data[o] = r * shade
      data[o + 1] = g * shade
      data[o + 2] = b * shade
      data[o + 3] = 255
    }
  }
  return { width, height, data }
}
