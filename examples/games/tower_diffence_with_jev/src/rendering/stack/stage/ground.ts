import { pointOnPath, type FieldId, type Point } from '../../../game/model'
import { allRoadPaths, type ResolvedBattlefield } from '../../../game/BattlefieldRoutes'

/** Board units per ground pixel; the texture is magnified with nearest filtering. */
export const GROUND_CELL = 2

interface Biome {
  ground: readonly string[]
  edge: string
  road: readonly string[]
  roadEdge: string
  pebble: string
  slow: string
  slowLight: string
  accents: readonly string[]
  accentRate: number
  glow?: string
}
export const BIOMES: Record<FieldId, Biome> = {
  meadow: {
    ground: ['#5f9a45', '#6aa84c', '#76b354', '#588f40'],
    edge: '#4b7f38',
    road: ['#c8a06a', '#d2ab74', '#bd9460'],
    roadEdge: '#9a7448',
    pebble: '#e6d1a6',
    slow: '#7d5f42',
    slowLight: '#93714f',
    accents: ['#f5f1dc', '#f2d14c', '#f09ab8', '#9fd36a'],
    accentRate: 0.035
  },
  desert: {
    ground: ['#e1bf7d', '#e8c98a', '#d8b26e', '#eed39a'],
    edge: '#c9a062',
    road: ['#c99a5c', '#d2a566', '#bd8e52'],
    roadEdge: '#a47744',
    pebble: '#f3e2bd',
    slow: '#b6884f',
    slowLight: '#c69a60',
    accents: ['#c9a062', '#b58d55', '#8fae5a'],
    accentRate: 0.02
  },
  frost: {
    ground: ['#e8f0f5', '#dde8ef', '#f3f8fb', '#d2e0ea'],
    edge: '#c2d3df',
    road: ['#a9b7c3', '#b5c3ce', '#9daab6'],
    roadEdge: '#7f8e9b',
    pebble: '#e4ecf2',
    slow: '#7f9ea7',
    slowLight: '#93b2ba',
    accents: ['#ffffff', '#bfe9f6', '#a8d0e0'],
    accentRate: 0.03
  },
  volcanic: {
    ground: ['#4a4049', '#423842', '#544852', '#3c333c'],
    edge: '#342c34',
    road: ['#6b5d61', '#75676a', '#625457'],
    roadEdge: '#4d4044',
    pebble: '#8a7a7c',
    slow: '#3f3843',
    slowLight: '#4e4652',
    accents: ['#6a5a5e', '#5a4c50', '#7a6a6c'],
    accentRate: 0.02,
    glow: '#ff8a3c'
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

/**
 * Distance from a display-space point to display-space polylines, capped at `reach`.
 * Segments are bucketed once so each ground pixel only tests the few nearby segments.
 */
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
 * Pixel-art ground in display proportions (board x is widened by `aspect`), one pixel per
 * GROUND_CELL board units: biome tiles, the road union with worn edges and pebbles, the
 * field's slow stretch, and scattered flowers or embers that never block anything.
 */
export function paintGround(field: ResolvedBattlefield, aspect: number): GroundPixels {
  const biome = BIOMES[field.id]
  const width = Math.max(1, Math.round((field.width * aspect) / GROUND_CELL))
  const height = Math.max(1, Math.round(field.height / GROUND_CELL))
  const data = new Uint8ClampedArray(width * height * 4)
  // Work in display space so a road reads equally wide horizontally and vertically.
  const half = (ROAD_PAINT_WIDTH / 2) * Math.min(1, aspect)
  const paths = allRoadPaths(field).map((path) => path.map((p) => ({ x: p.x * aspect, y: p.y })))
  const slow = slowPoints(field).map((p) => ({ x: p.x * aspect, y: p.y }))
  const distance = roadDistance(paths, half + 40)
  const seed = field.id.length * 31 + field.layoutRevision * 7
  const rgb = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ]
  const cache = new Map<string, number[]>()
  const color = (hex: string) => cache.get(hex) ?? (cache.set(hex, rgb(hex)), cache.get(hex)!)
  const rim = Math.max(1.5, half * 0.16)
  // Grass is decided once per 2x2 pixel block (4 board units); only road pixels need full detail.
  const coarseWidth = (width >> 1) + 1
  const grass: { hex: string; accent?: string; glow: boolean; shade: number }[] = []
  for (let cj = 0; cj <= height >> 1; cj++)
    for (let ci = 0; ci < coarseWidth; ci++) {
      const large = noise(ci, cj, 14, seed),
        small = noise(ci, cj, 4, seed + 3)
      const v = large * 0.65 + small * 0.35
      const cell: { hex: string; accent?: string; glow: boolean; shade: number } = {
        hex: biome.ground[v < 0.38 ? 3 : v < 0.52 ? 0 : v < 0.66 ? 1 : 2],
        glow: !!biome.glow && Math.abs(noise(ci, cj, 18, seed + 13) - 0.5) < 0.012,
        shade: 1
      }
      // Flowers and pebbles gather in patches instead of scattering evenly.
      const rate = noise(ci, cj, 7, seed + 21) > 0.68 ? biome.accentRate * 5 : biome.accentRate * 0.15
      if (hash(ci, cj, seed + 1) < rate)
        cell.accent = biome.accents[Math.floor(noise(ci, cj, 5, seed + 2) * biome.accents.length * 0.999)]
      else if (hash(ci, cj, seed + 6) < 0.05 && small > 0.5) cell.shade = 0.88
      if (field.id === 'desert' && Math.sin(ci * 0.35 + noise(ci, cj, 20, seed) * 6 + cj * 0.12) > 0.93)
        cell.shade = 0.94
      grass.push(cell)
    }
  const grassColor = (ci: number, cj: number, d: number): [string, number] => {
    const cell = grass[cj * coarseWidth + ci]
    let hex = cell.accent && d > half + 16 ? cell.accent : cell.hex
    if (cell.glow && d > half + 20) hex = biome.glow!
    return [hex, cell.shade]
  }
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      const ci = i >> 1,
        cj = j >> 1
      const point = { x: (i + 0.5) * GROUND_CELL, y: (j + 0.5) * GROUND_CELL }
      const d = distance(point.x, point.y)
      let hex: string
      let shade = 1
      if (d <= half + rim) {
        const n = noise(ci, cj, 3, seed + 5)
        hex = biome.road[n < 0.35 ? 2 : n > 0.7 ? 1 : 0]
        // A worn rim just outside the walkable width.
        if (d > half) hex = biome.roadEdge
        else if (hash(ci, cj, seed + 9) > 0.965) hex = biome.pebble
        if (
          d <= half &&
          slow.some((p) => Math.abs(p.x - point.x) < half && Math.hypot(p.x - point.x, p.y - point.y) < half * 0.82 - 2)
        )
          hex = noise(ci, cj, 2, seed + 11) > 0.55 ? biome.slowLight : biome.slow
      } else {
        ;[hex, shade] = grassColor(ci, cj, d)
        if (d < half + rim + GROUND_CELL * 1.5) hex = biome.edge
        // Soft darkening toward the board edges frames the field.
        const edgeDistance = Math.min(i, j, width - 1 - i, height - 1 - j) / 2
        if (edgeDistance < 6) shade *= 0.86 + edgeDistance * 0.023
      }
      const [r, g, b] = color(hex)
      const o = (j * width + i) * 4
      data[o] = r * shade
      data[o + 1] = g * shade
      data[o + 2] = b * shade
      data[o + 3] = 255
    }
  return { width, height, data }
}
