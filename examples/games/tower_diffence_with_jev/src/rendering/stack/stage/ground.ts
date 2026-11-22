import { pointOnPath, type FieldId, type Point } from '../../../game/model'
import { allRoadPaths, type ResolvedBattlefield } from '../../../game/BattlefieldRoutes'

/** Board units per ground pixel; 1:1 with character voxel=2 for unified art-pixel density. */
export const GROUND_CELL = 2

interface Biome {
  /** 4 quantized terrain value steps from darkest shadow band to sunlit crest (calm saturation for figure-ground separation). */
  ground: readonly [string, string, string, string]
  tuft: string
  tuftLight: string
  /** Recessed north/west road shoulder shadow. */
  edgeShadow: string
  /** Subtle south/east road shoulder catchlight. */
  edgeLight: string
  /** 3 cobblestone/flagstone road colors. */
  road: readonly [string, string, string]
  roadCenter: string
  roadMortar: string
  roadEdge: string
  roadOutline: string
  pebble: string
  slow: string
  slowLight: string
  slowBorder: string
  slowAccent: string
  flowers: readonly string[]
  slotRing: string
  slotInner: string
  accentA?: string
  accentB?: string
  accentC?: string
  accentRim?: string
  accentHalo?: string
}

export const BIOMES: Record<FieldId, Biome> = {
  meadow: {
    // Calmer, grounded sage-meadow palette (~14% lower saturation than neon grass) so heroes & goblins pop cleanly.
    ground: ['#43753d', '#4d8245', '#578f4d', '#3a6635'],
    tuft: '#2d572a',
    tuftLight: '#6ba85b',
    edgeShadow: '#234222',
    edgeLight: '#689e58',
    // Grounded warm earthen cobblestone road (calmer than blinding cream, while keeping r > g && r > 110).
    road: ['#a8855b', '#b59267', '#96744d'],
    roadCenter: '#bd9c70',
    roadMortar: '#7d5f3e',
    roadEdge: '#856542',
    roadOutline: '#4a3521',
    pebble: '#cfb388',
    slow: '#7e6043',
    slowLight: '#917152',
    slowBorder: '#57412d',
    slowAccent: '#634b34',
    flowers: ['#f7eec8', '#f0c446', '#eb84a6'],
    slotRing: '#6c9c5e',
    slotInner: '#487a42'
  },
  desert: {
    // Warm sunlit ochre dunes (calm value so desert units & pale capes never wash out).
    ground: ['#c49f66', '#cfa96f', '#b58f57', '#d9b77e'],
    tuft: '#9e7844',
    tuftLight: '#e6c993',
    edgeShadow: '#7d5b32',
    edgeLight: '#e3c691',
    // Distinct weathered terracotta-sandstone flagstone road contrasting strongly with warm dunes.
    road: ['#966b47', '#a37650', '#855c3b'],
    roadCenter: '#ad8059',
    roadMortar: '#6e4a2e',
    roadEdge: '#734f32',
    roadOutline: '#452d1b',
    pebble: '#d4b487',
    slow: '#855a30',
    slowLight: '#9c6c3d',
    slowBorder: '#5c3c1e',
    slowAccent: '#6b4724',
    flowers: ['#739149', '#b88542'],
    slotRing: '#b0864f',
    slotInner: '#bf9962',
    accentA: '#ad8652',
    accentB: '#8f6c3e'
  },
  frost: {
    // Soft glacial blue-white snow (never pure #ffffff) so white-armored knights pop cleanly!
    ground: ['#bccfda', '#c7d9e6', '#d3e3ee', '#a9c0d1'],
    tuft: '#92adc2',
    tuftLight: '#e6f1f8',
    edgeShadow: '#5b768c',
    edgeLight: '#dceaf2',
    // Deep blue-slate stone causeway contrasting sharply with snow.
    road: ['#62768c', '#6f849b', '#54677d'],
    roadCenter: '#7d92a8',
    roadMortar: '#435466',
    roadEdge: '#4c5f73',
    roadOutline: '#2a3745',
    pebble: '#9fb4c7',
    slow: '#4d87a8',
    slowLight: '#6ca8c9',
    slowBorder: '#315d78',
    slowAccent: '#d4f1ff',
    flowers: ['#8ccbe3', '#e1f0fa'],
    slotRing: '#8aa7bd',
    slotInner: '#b5cada',
    // Frozen turquoise glacier ponds.
    accentA: '#5b9ab8',
    accentB: '#7ab8d4',
    accentC: '#d6f2ff',
    accentRim: '#416d85'
  },
  volcanic: {
    // Rich dark ash-basalt with clear contrast against worn ash-stone road & glowing magma pools.
    ground: ['#352e3a', '#3e3644', '#2e2833', '#473e4d'],
    tuft: '#241f29',
    tuftLight: '#564c5e',
    edgeShadow: '#1a151f',
    edgeLight: '#594e61',
    road: ['#655861', '#73656e', '#574b53'],
    roadCenter: '#80727a',
    roadMortar: '#453b42',
    roadEdge: '#4a4047',
    roadOutline: '#211b20',
    pebble: '#91838b',
    slow: '#302938',
    slowLight: '#42394c',
    slowBorder: '#1f1a24',
    slowAccent: '#d95d26',
    flowers: ['#5e5059', '#4f434b'],
    slotRing: '#5c4e61',
    slotInner: '#3a3240',
    // Organic glowing magma pools (bright yellow core -> vivid orange -> dark crimson -> black crust -> warm halo).
    accentA: '#ffe066',
    accentB: '#ff6e24',
    accentC: '#ad2b1a',
    accentRim: '#1a121a',
    accentHalo: '#4f2c2d'
  }
}

const BAYER4 = [
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5
]

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
  for (let progress = surface.startProgress; progress <= surface.endProgress; progress += 6)
    points.push(pointOnPath(field.path, progress))
  return points
}

interface DistanceHit {
  dist: number
  /** Vector from closest road centerline point to query point. */
  nx: number
  ny: number
  /** Local road tangent unit vector. */
  tx: number
  ty: number
  /** Approximate distance along the local segment for cobblestone alignment. */
  along: number
}

function roadQuery(paths: readonly Point[][], reach: number): (x: number, y: number) => DistanceHit {
  const size = 32
  const buckets = new Map<number, number[][]>()
  const key = (bx: number, by: number) => (bx + 64) * 4096 + by + 64
  for (const path of paths) {
    let acc = 0
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1],
        b = path[k]
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const segment = [a.x, a.y, b.x, b.y, (b.x - a.x) / len, (b.y - a.y) / len, acc, len]
      acc += len
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
  }
  return (x, y) => {
    let best = reach
    let nx = 0,
      ny = 0,
      tx = 1,
      ty = 0,
      along = 0
    for (const [ax, ay, bx, by, stx, sty, sacc, slen] of buckets.get(key(Math.floor(x / size), Math.floor(y / size))) ?? []) {
      const dx = bx - ax,
        dy = by - ay
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
      const px = ax + dx * t,
        py = ay + dy * t
      const d = Math.hypot(x - px, y - py)
      if (d < best) {
        best = d
        const inv = d > 1e-4 ? 1 / d : 0
        nx = (x - px) * inv
        ny = (y - py) * inv
        tx = stx
        ty = sty
        along = sacc + t * slen
      }
    }
    return { dist: best, nx, ny, tx, ty, along }
  }
}

/** Painted road width in display units: trimmed slightly so characters dominate combat sightlines. */
export const ROAD_PAINT_WIDTH = 34

export interface GroundPixels {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

interface LandmarkPool {
  readonly x: number
  readonly y: number
  readonly rx: number
  readonly ry: number
  readonly rot: number
}

/** Pick 3 organic scenic pools (frozen ponds in frost, magma pools in volcanic) clear of roads and slots. */
function scenicPools(
  field: ResolvedBattlefield,
  aspect: number,
  queryRoad: (x: number, y: number) => DistanceHit,
  halfRoad: number,
  seed: number
): LandmarkPool[] {
  if (field.id !== 'frost' && field.id !== 'volcanic') return []
  const pools: LandmarkPool[] = []
  const w = field.width * aspect
  const h = field.height
  const slots = field.slots.map((s) => ({ x: s.x * aspect, y: s.y }))
  const ends = [
    { x: field.entrance.x * aspect, y: field.entrance.y },
    { x: field.gate.x * aspect, y: field.gate.y }
  ]
  for (let attempt = 0; attempt < 360 && pools.length < 4; attempt++) {
    const x = 56 + hash(attempt, 1, seed + 201) * (w - 112)
    const y = 48 + hash(attempt, 2, seed + 202) * (h - 96)
    const rx = 24 + hash(attempt, 3, seed + 203) * 14
    const ry = 16 + hash(attempt, 4, seed + 204) * 10
    const maxR = Math.max(rx, ry)
    if (queryRoad(x, y).dist < halfRoad + maxR + 6) continue
    if (slots.some((s) => Math.hypot(s.x - x, s.y - y) < maxR + 12)) continue
    if (ends.some((e) => Math.hypot(e.x - x, e.y - y) < maxR + 72)) continue
    if (pools.some((p) => Math.hypot(p.x - x, p.y - y) < maxR + Math.max(p.rx, p.ry) + 32)) continue
    pools.push({ x, y, rx, ry, rot: (hash(attempt, 5, seed + 205) - 0.5) * 0.9 })
  }
  return pools
}

/**
 * Commercial-grade top-down pixel-art ground at 1:1 art-pixel resolution (`GROUND_CELL = 2`):
 * - Crisp Bayer-dithered quantized terrain bands (zero blurry 2x2 camo blobs)
 * - Biome-specific organic geology (pasture tufts/wildflower clusters, wind-sculpted desert dunes,
 *   frozen turquoise ice ponds, organic glowing magma pools & fissures)
 * - Cobblestone/flagstone embedded roads with directional NW recessed bevel shadow & organic shoulder erosion
 * - Natural irregular slow-terrain zones (muddy ruts / quicksand / cracked ice / ember-tar)
 * - Subtle natural tactical slot ground pads communicating playable deployment spaces
 */
export function paintGround(field: ResolvedBattlefield, aspect: number): GroundPixels {
  const biome = BIOMES[field.id]
  const width = Math.max(1, Math.round((field.width * aspect) / GROUND_CELL))
  const height = Math.max(1, Math.round(field.height / GROUND_CELL))
  const data = new Uint8ClampedArray(width * height * 4)
  const half = (ROAD_PAINT_WIDTH / 2) * Math.min(1, aspect)
  const paths = allRoadPaths(field).map((path) => path.map((p) => ({ x: p.x * aspect, y: p.y })))
  const slow = slowPoints(field).map((p) => ({ x: p.x * aspect, y: p.y }))
  const queryRoad = roadQuery(paths, half + 44)
  const querySlow = slow.length >= 2 ? roadQuery([slow], half + 18) : null
  const seed = field.id.length * 37 + field.layoutRevision * 13

  const pools = scenicPools(field, aspect, queryRoad, half, seed)
  const slots = field.layoutRevision >= 4 ? field.slots.map((s) => ({ x: s.x * aspect, y: s.y })) : []

  const cache = new Map<string, [number, number, number]>()
  const color = (hex: string): [number, number, number] => {
    let c = cache.get(hex)
    if (!c) {
      c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
      cache.set(hex, c)
    }
    return c
  }

  // Stamp deterministic pixel-art grass tufts, wildflower clusters, and snow/pebble accents onto a sparse overlay.
  const overlay = new Map<number, string>()
  const stamp = (gx: number, gy: number, hex: string) => {
    if (gx >= 1 && gx < width - 1 && gy >= 1 && gy < height - 1) overlay.set(gy * width + gx, hex)
  }

  const cellStep = field.id === 'meadow' ? 10 : 14
  for (let gy = 5; gy < height - 5; gy += cellStep) {
    for (let gx = 5; gx < width - 5; gx += cellStep) {
      const r = hash(gx, gy, seed + 41)
      const ox = gx + Math.floor(hash(gx, gy, seed + 42) * (cellStep - 3))
      const oy = gy + Math.floor(hash(gx, gy, seed + 43) * (cellStep - 3))
      const wx = (ox + 0.5) * GROUND_CELL
      const wy = (oy + 0.5) * GROUND_CELL
      const rd = queryRoad(wx, wy).dist
      if (rd < half + 9) continue
      if (slots.some((s) => Math.hypot(s.x - wx, s.y - wy) < 18)) continue

      if (field.id === 'meadow') {
        if (r < 0.34) {
          // Crisp 3x3 pixel-art V grass tuft with dark base & sunlit blade tips.
          stamp(ox, oy, biome.tuft)
          stamp(ox - 1, oy, biome.tuft)
          stamp(ox + 1, oy, biome.tuft)
          stamp(ox - 1, oy - 1, biome.tuftLight)
          stamp(ox + 1, oy - 1, biome.tuftLight)
        } else if (r > 0.84) {
          // Intentional 3-blossom wildflower cluster with dark leaf base (zero single-pixel confetti).
          const flower = biome.flowers[Math.floor(hash(gx, gy, seed + 44) * biome.flowers.length)]
          stamp(ox, oy, flower)
          stamp(ox + 1, oy, flower)
          stamp(ox, oy + 1, biome.tuft)
          stamp(ox + 1, oy + 1, biome.tuft)
          if (r > 0.92) {
            stamp(ox - 2, oy + 1, flower)
            stamp(ox - 2, oy + 2, biome.tuft)
          }
        }
      } else if (field.id === 'desert') {
        if (r < 0.16) {
          // Small warm pebble & wind-swept shadow mark.
          stamp(ox, oy, biome.tuftLight)
          stamp(ox + 1, oy, biome.tuft)
          stamp(ox, oy + 1, biome.tuft)
        }
      } else if (field.id === 'frost') {
        if (r < 0.22) {
          // Sculpted snow drift sparkle & blue lee shadow.
          stamp(ox, oy, biome.tuftLight)
          stamp(ox + 1, oy, biome.tuftLight)
          stamp(ox + 1, oy + 1, biome.tuft)
        }
      } else if (field.id === 'volcanic') {
        if (r < 0.18) {
          // Angular dark basalt flake.
          stamp(ox, oy, biome.tuftLight)
          stamp(ox + 1, oy, biome.tuft)
          stamp(ox + 1, oy + 1, biome.tuft)
        }
      }
    }
  }

  const rim = Math.max(2.4, half * 0.16)
  const outlineWidth = 2.0

  for (let j = 0; j < height; j++) {
    const bayerRow = (j & 3) * 4
    const wy = (j + 0.5) * GROUND_CELL
    for (let i = 0; i < width; i++) {
      const wx = (i + 0.5) * GROUND_CELL
      const bayer = BAYER4[bayerRow + (i & 3)] / 16 - 0.5
      const hit = queryRoad(wx, wy)
      // Organic uneven road shoulder jitter so the path feels hand-carved into the biome.
      const shoulderJitter = (noise(i, j, 7, seed + 71) - 0.5) * 4.4
      const d = hit.dist + shoulderJitter

      let hex: string
      let shade = 1

      if (d <= half + rim + outlineWidth) {
        const isNorthWestLip = hit.nx + hit.ny < -0.15
        if (d > half + rim) {
          // Directional recessed road rim: crisp dark shadow on NW inner bank, softer rim on SE.
          hex = isNorthWestLip ? biome.roadOutline : biome.roadEdge
        } else if (d > half) {
          hex = isNorthWestLip ? biome.roadMortar : biome.roadEdge
        } else {
          // Cobblestone / flagstone masonry aligned along the road path!
          const across = (wx - hit.nx * hit.dist) * 0 + hit.dist * (hit.nx * -hit.ty + hit.ny * hit.tx >= 0 ? 1 : -1)
          const stoneRow = Math.floor((across + 64) / 6.5)
          const stoneCol = Math.floor((hit.along + (stoneRow & 1) * 4.5) / 9)
          const rowFrac = (((across + 64) / 6.5) % 1 + 1) % 1
          const colFrac = (((hit.along + (stoneRow & 1) * 4.5) / 9) % 1 + 1) % 1
          const isMortar = rowFrac < 0.14 || colFrac < 0.12
          const stoneHash = hash(stoneCol, stoneRow, seed + 19)
          const centerWear = hit.dist < half * 0.44 && noise(i, j, 9, seed + 5) > 0.36

          if (isMortar && !centerWear) {
            hex = biome.roadMortar
          } else if (centerWear && stoneHash > 0.35) {
            hex = biome.roadCenter
          } else {
            hex = biome.road[stoneHash < 0.33 ? 2 : stoneHash > 0.72 ? 1 : 0]
          }
          if (!isMortar && stoneHash > 0.94 && hit.dist > half * 0.3) hex = biome.pebble

          // Organic biome-specific slow terrain stretch (feathered ends, no UI pill capsule!).
          if (querySlow) {
            const sd = querySlow(wx, wy).dist
            const slowJitter = (noise(i, j, 5, seed + 83) - 0.5) * 6.5
            if (sd + slowJitter < half * 0.92) {
              const sNoise = noise(i, j, 4.5, seed + 11)
              const edgeBand = sd + slowJitter > half * 0.72
              if (edgeBand) {
                hex = biome.slowBorder
              } else if (field.id === 'frost') {
                // Cracked translucent glacier ice with crisp fracture highlights.
                const crack = Math.abs(noise(i, j, 6, seed + 91) - 0.5)
                hex = crack < 0.032 ? biome.slowAccent : sNoise > 0.52 ? biome.slowLight : biome.slow
              } else if (field.id === 'volcanic') {
                // Viscous obsidian tar with glowing magma cracks.
                const crack = Math.abs(noise(i, j, 6, seed + 93) - 0.5)
                hex = crack < 0.028 ? biome.slowAccent : sNoise > 0.55 ? biome.slowLight : biome.slow
              } else if (field.id === 'desert') {
                // Swirling sunken quicksand ripples.
                const swirl = Math.sin(sd * 0.45 + noise(i, j, 8, seed + 95) * 4)
                hex = swirl > 0.55 ? biome.slowLight : swirl < -0.55 ? biome.slowAccent : biome.slow
              } else {
                // Meadow muddy wheel ruts & damp puddles (keeps r > g && r > 110 for path verification!).
                const rut = Math.abs(Math.abs(hit.dist) - half * 0.36) < 2.2
                hex = rut ? biome.slowAccent : sNoise > 0.5 ? biome.slowLight : biome.slow
              }
            }
          }
        }
      } else {
        // Full-resolution 1-art-px Bayer-dithered biome terrain.
        const large = noise(i, j, 34, seed)
        const med = noise(i, j, 13, seed + 3)
        const v = large * 0.72 + med * 0.28 + bayer * 0.09
        hex = biome.ground[v < 0.34 ? 3 : v < 0.53 ? 0 : v < 0.72 ? 1 : 2]

        if (field.id === 'desert') {
          // Gentle wind-sculpted dune ridges (NO sin zebra stripes!) + subtle hardpan patches.
          const warp = noise(i, j, 42, seed + 17) * 24
          const dunePhase = ((i * 0.22 + j * 0.14 + warp) % 28 + 28) % 28
          if (dunePhase < 2.2 && large > 0.42) hex = biome.tuftLight
          else if (dunePhase >= 2.2 && dunePhase < 4.6 && large > 0.42) hex = biome.tuft
          else if (large < 0.24 && med > 0.45) hex = biome.accentA!
        } else if (field.id === 'frost') {
          // Soft wind-swept snowdrifts + frozen turquoise glacier ponds.
          const drift = noise(i * 0.6, j * 1.4, 24, seed + 29)
          if (drift > 0.74) hex = biome.tuftLight
          for (const pool of pools) {
            const dx = wx - pool.x
            const dy = wy - pool.y
            const ca = Math.cos(pool.rot),
              sa = Math.sin(pool.rot)
            const lx = (dx * ca - dy * sa) / pool.rx
            const ly = (dx * sa + dy * ca) / pool.ry
            const warp = (noise(i, j, 10, seed + 61) - 0.5) * 0.28
            const pr = Math.hypot(lx, ly) + warp
            if (pr < 1.06) {
              if (pr > 0.92) hex = biome.accentRim!
              else {
                const gleam = Math.abs((i + j * 1.3) % 14 - 4) < 1.3 && pr < 0.78
                hex = gleam ? biome.accentC! : pr < 0.55 ? biome.accentB! : biome.accentA!
              }
              break
            }
          }
        } else if (field.id === 'volcanic') {
          // Organic glowing magma pools & short crusted lava veins (ZERO dashed contour ant-trails!).
          for (const pool of pools) {
            const dx = wx - pool.x
            const dy = wy - pool.y
            const ca = Math.cos(pool.rot),
              sa = Math.sin(pool.rot)
            const lx = (dx * ca - dy * sa) / pool.rx
            const ly = (dx * sa + dy * ca) / pool.ry
            const warp = (noise(i, j, 9, seed + 67) - 0.5) * 0.42
            const pr = Math.hypot(lx, ly) + warp
            if (pr < 1.32) {
              if (pr < 0.34) hex = biome.accentA!
              else if (pr < 0.64) hex = biome.accentB!
              else if (pr < 0.82) hex = biome.accentC!
              else if (pr < 0.98) hex = biome.accentRim!
              else if (bayer > -0.15) hex = biome.accentHalo!
              break
            }
          }
        }

        // Apply stamped pixel-art tufts & wildflower clusters (unless covered by a pond/magma pool).
        const ov = overlay.get(j * width + i)
        if (ov && hex !== biome.accentA && hex !== biome.accentB && hex !== biome.accentC && hex !== biome.accentRim) {
          hex = ov
        }

        // Subtle tactical deployment pads at field.slots so open interior reads with purposeful structure.
        for (let s = 0; s < slots.length; s++) {
          const sx = wx - slots[s].x
          const sy = wy - slots[s].y
          if (Math.abs(sx) > 16 || Math.abs(sy) > 16) continue
          const sr = Math.hypot(sx, sy)
          if (sr >= 10.5 && sr <= 13.2) {
            // Dashed cardinal pixel ring (clean, low-contrast, grounded in the biome).
            const ang = Math.atan2(sy, sx)
            if (Math.abs(Math.cos(ang * 2)) > 0.38) hex = biome.slotRing
          } else if (sr < 3.2 && ((i + j) & 1) === 0) {
            hex = biome.slotRing
          } else if (sr < 10.5 && sr > 9.0 && bayer > 0.1) {
            hex = biome.slotInner
          }
        }

        // Road-shoulder overhang shadow on NW side & gentle grass/sand catchlight on SE side.
        if (d < half + rim + outlineWidth + 3.2) {
          const isNW = hit.nx + hit.ny < -0.1
          hex = isNW ? biome.edgeShadow : biome.edgeLight
        }

        // Soft outer-edge vignette grounding the battlefield frame.
        const edgeDistance = Math.min(i, j, width - 1 - i, height - 1 - j) / 2.5
        if (edgeDistance < 7) shade *= 0.86 + edgeDistance * 0.02
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
