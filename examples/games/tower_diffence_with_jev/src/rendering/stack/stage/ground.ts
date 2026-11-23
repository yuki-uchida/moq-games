import { pointOnPath, type FieldId, type Point } from '../../../game/model'
import { allRoadPaths, type ResolvedBattlefield } from '../../../game/BattlefieldRoutes'

/**
 * Board units per ground pixel: matches `design.voxel * presentation` (`2 * 1.5 = 3`) 1:1 so
 * ground tiles, roads, trees, landmarks and characters share ONE identical art-pixel grid!
 */
export const GROUND_CELL = 3

interface Biome {
  /** Unique noise seed & domain scale per biome so terrain shade masks never repeat across biomes. */
  noiseSeed: number
  noiseScale: number
  /** 4 quantized terrain value steps from darkest shadow band to sunlit crest. */
  ground: readonly [string, string, string, string]
  tuft: string
  tuftLight: string
  edgeShadow: string
  edgeLight: string
  /** 3 road material colors. */
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
  slotEdge: string
  slotFill: string
  slotShadow: string
  accentA?: string
  accentB?: string
  accentC?: string
  accentRim?: string
  accentHalo?: string
  accentHalo2?: string
}

export const BIOMES: Record<FieldId, Biome> = {
  meadow: {
    noiseSeed: 113,
    noiseScale: 24,
    ground: ['#43753d', '#4d8245', '#578f4d', '#3a6635'],
    tuft: '#2c5429',
    tuftLight: '#6ca85b',
    edgeShadow: '#234222',
    edgeLight: '#689e58',
    // Warm packed earthen trail with twin wheel ruts & occasional stepping stones (r > g && r > 110).
    road: ['#a8855b', '#b59267', '#96744d'],
    roadCenter: '#bf9e73',
    roadMortar: '#826341',
    roadEdge: '#856542',
    roadOutline: '#4a3521',
    pebble: '#d1b58a',
    slow: '#6b4c31',
    slowLight: '#8a6743',
    slowBorder: '#4a3524',
    slowAccent: '#3f2a19',
    flowers: ['#f7eec8', '#f0c446', '#eb84a6'],
    slotEdge: '#9ed18b',
    slotFill: '#639f55',
    slotShadow: '#2f5a2c'
  },
  desert: {
    noiseSeed: 389,
    noiseScale: 30,
    ground: ['#c49f66', '#cfa96f', '#b58f57', '#d8b67d'],
    tuft: '#9e7844',
    tuftLight: '#e3c691',
    edgeShadow: '#78572f',
    edgeLight: '#dfc18b',
    // Compacted weathered sandstone caravan trail with gravel & sand drifts (distinct from stone brick).
    road: ['#916744', '#9e724d', '#805939'],
    roadCenter: '#a87c56',
    roadMortar: '#6b482c',
    roadEdge: '#734f32',
    roadOutline: '#452d1b',
    pebble: '#cfa97a',
    slow: '#7a4e26',
    slowLight: '#d8a86a',
    slowBorder: '#3f2814',
    slowAccent: '#5c3a1c',
    flowers: ['#739149', '#b88542'],
    slotEdge: '#e7c795',
    slotFill: '#c9a069',
    slotShadow: '#5a3c20',
    accentA: '#ad8652',
    accentB: '#916e40'
  },
  frost: {
    noiseSeed: 733,
    noiseScale: 26,
    ground: ['#bccfda', '#c7d9e6', '#d3e3ee', '#a9c0d1'],
    tuft: '#92adc2',
    tuftLight: '#e6f1f8',
    edgeShadow: '#567085',
    edgeLight: '#dceaf2',
    // Fitted dark blue-slate stone causeway with frosted mortar seams.
    road: ['#62768c', '#6f849b', '#54677d'],
    roadCenter: '#7d92a8',
    roadMortar: '#435466',
    roadEdge: '#4c5f73',
    roadOutline: '#2a3745',
    pebble: '#b8d0e0',
    slow: '#4d87a8',
    slowLight: '#6ca8c9',
    slowBorder: '#315d78',
    slowAccent: '#d4f1ff',
    flowers: ['#8ccbe3', '#e1f0fa'],
    slotEdge: '#e2f1fa',
    slotFill: '#aec8da',
    slotShadow: '#4a6272',
    accentA: '#5b9ab8',
    accentB: '#7ab8d4',
    accentC: '#d6f2ff',
    accentRim: '#416d85'
  },
  volcanic: {
    noiseSeed: 991,
    noiseScale: 21,
    ground: ['#3d3544', '#463d4e', '#352e3c', '#504659'],
    tuft: '#2a2431',
    tuftLight: '#655a70',
    edgeShadow: '#1d1722',
    edgeLight: '#75657a',
    // Cracked dark basalt pavers with pale-ash curb highlight & faint ember seams.
    road: ['#63565f', '#72636d', '#544951'],
    roadCenter: '#80717a',
    roadMortar: '#3d333b',
    roadEdge: '#877882',
    roadOutline: '#211b20',
    pebble: '#9c8d96',
    slow: '#241c28',
    slowLight: '#40334a',
    slowBorder: '#120e17',
    slowAccent: '#ff7a2e',
    flowers: ['#5e5059', '#4f434b'],
    slotEdge: '#9d8aa8',
    slotFill: '#584960',
    slotShadow: '#241d2b',
    // Molten magma pools & glowing branching fissures with 2-tier warm bounce glow.
    accentA: '#ffe570',
    accentB: '#ff6e24',
    accentC: '#b32d1b',
    accentRim: '#1a121a',
    accentHalo: '#5e2e2a',
    accentHalo2: '#472a30'
  }
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

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
  nx: number
  ny: number
  tx: number
  ty: number
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

export interface LandmarkPool {
  /** Position in logical board units (before aspect stretch). */
  readonly bx: number
  readonly by: number
  /** Position in display units (`bx * aspect`, `by`). */
  readonly x: number
  readonly y: number
  readonly rx: number
  readonly ry: number
  readonly rot: number
  /** Short volcanic fissure branch endpoints in display units. */
  readonly branchAngle: number
}

/**
 * Deterministic organic scenic pools (frozen glacier ponds in frost, glowing magma pools in volcanic),
 * exported so `StackStage.ts` keeps props & tree canopies completely clear of them!
 */
export function scenicPools(field: ResolvedBattlefield, aspect = 1): LandmarkPool[] {
  if (field.id !== 'frost' && field.id !== 'volcanic') return []
  const biome = BIOMES[field.id]
  const seed = biome.noiseSeed + field.layoutRevision * 13
  const halfRoad = ROAD_PAINT_WIDTH / 2
  const paths = allRoadPaths(field)
  const queryRoad = roadQuery(paths, halfRoad + 56)
  const pools: LandmarkPool[] = []
  const ends = [field.entrance, field.gate]
  const volcanic = field.id === 'volcanic'
  // Volcanic fields keep one hero lava lake plus two smaller vents instead of four equal basins.
  const maxPools = volcanic ? 3 : 4
  for (let attempt = 0; attempt < 400 && pools.length < maxPools; attempt++) {
    const bx = 56 + hash(attempt, 1, seed + 201) * (field.width - 112)
    const by = 48 + hash(attempt, 2, seed + 202) * (field.height - 96)
    const hero = pools.length === 0
    const rx = volcanic ? (hero ? 38 + hash(attempt, 3, seed + 203) * 14 : 14 + hash(attempt, 3, seed + 203) * 8) : 24 + hash(attempt, 3, seed + 203) * 14
    const ry = volcanic ? (hero ? 24 + hash(attempt, 4, seed + 204) * 10 : 10 + hash(attempt, 4, seed + 204) * 5) : 16 + hash(attempt, 4, seed + 204) * 10
    const maxR = Math.max(rx, ry)
    if (queryRoad(bx, by).dist < halfRoad + maxR + 8) continue
    if (field.slots.some((s) => Math.hypot(s.x - bx, s.y - by) < maxR + 16)) continue
    if (ends.some((e) => Math.hypot(e.x - bx, e.y - by) < maxR + 78)) continue
    if (pools.some((p) => Math.hypot(p.bx - bx, p.by - by) < maxR + Math.max(p.rx, p.ry) + 36)) continue
    pools.push({
      bx,
      by,
      x: bx * aspect,
      y: by,
      rx: rx * Math.min(1.15, Math.max(0.9, aspect * 0.82)),
      ry,
      rot: (hash(attempt, 5, seed + 205) - 0.5) * 0.85,
      branchAngle: hash(attempt, 6, seed + 206) * Math.PI * 2
    })
  }
  return pools
}

/**
 * Commercial-grade top-down pixel-art ground locked 1:1 to the sprite art-pixel grid (`GROUND_CELL = 3`):
 * - Biome-unique noise seeds & Bayer-dithered terrain elevation bands
 * - Biome-specific road materials (meadow earthen wheel-ruts, desert compacted sandstone trail,
 *   frost blue-slate causeway, volcanic ash-rimmed basalt pavers)
 * - Short localized desert wind-ripple hatches (zero long distraction ribbons)
 * - Glowing volcanic magma pools + branching lava fissures with 2-tier warm bounce glow
 * - Natural beveled pixel-art tactical slot pads (replacing thin debug dashed rings)
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
  const seed = biome.noiseSeed + field.layoutRevision * 13

  const pools = scenicPools(field, aspect)
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

  // Sparse, intentional 3-4 art-pixel tufts, wildflower blossoms & desert wind-hatches (zero 1px noise).
  const overlay = new Map<number, string>()
  const stamp = (gx: number, gy: number, hex: string) => {
    if (gx >= 1 && gx < width - 1 && gy >= 1 && gy < height - 1) overlay.set(gy * width + gx, hex)
  }

  const cellStep = field.id === 'meadow' ? 11 : 13
  for (let gy = 4; gy < height - 4; gy += cellStep) {
    for (let gx = 4; gx < width - 4; gx += cellStep) {
      const r = hash(gx, gy, seed + 41)
      const ox = gx + Math.floor(hash(gx, gy, seed + 42) * (cellStep - 3))
      const oy = gy + Math.floor(hash(gx, gy, seed + 43) * (cellStep - 3))
      const wx = (ox + 0.5) * GROUND_CELL
      const wy = (oy + 0.5) * GROUND_CELL
      if (queryRoad(wx, wy).dist < half + 11) continue
      if (slots.some((s) => Math.hypot(s.x - wx, s.y - wy) < 22)) continue

      if (field.id === 'meadow') {
        if (r < 0.28) {
          // Crisp 3x2 pixel-art grass tuft cluster.
          stamp(ox - 1, oy, biome.tuft)
          stamp(ox, oy, biome.tuft)
          stamp(ox + 1, oy, biome.tuft)
          stamp(ox - 1, oy - 1, biome.tuftLight)
          stamp(ox + 1, oy - 1, biome.tuftLight)
        } else if (r > 0.87) {
          // Intentional 4-pixel blossom with green leaf base.
          const flower = biome.flowers[Math.floor(hash(gx, gy, seed + 44) * biome.flowers.length)]
          stamp(ox, oy - 1, flower)
          stamp(ox - 1, oy, flower)
          stamp(ox + 1, oy, flower)
          stamp(ox, oy, biome.flowers[1])
          stamp(ox, oy + 1, biome.tuft)
        }
      } else if (field.id === 'desert') {
        if (r < 0.24) {
          // Short localized 4px desert wind-ripple hatch (calm, never a long distraction line!).
          stamp(ox - 1, oy, biome.tuftLight)
          stamp(ox, oy, biome.tuftLight)
          stamp(ox + 1, oy, biome.tuftLight)
          stamp(ox, oy + 1, biome.tuft)
          stamp(ox + 1, oy + 1, biome.tuft)
        }
      } else if (field.id === 'frost') {
        if (r < 0.16) {
          stamp(ox, oy, biome.tuftLight)
          stamp(ox + 1, oy, biome.tuftLight)
          stamp(ox + 1, oy + 1, biome.tuft)
        }
      } else if (field.id === 'volcanic') {
        if (r < 0.16) {
          stamp(ox, oy, biome.tuftLight)
          stamp(ox + 1, oy, biome.tuft)
          stamp(ox, oy + 1, biome.tuft)
        }
      }
    }
  }

  const rim = Math.max(2.6, half * 0.17)
  const outlineWidth = 2.4

  for (let j = 0; j < height; j++) {
    const bayerRow = (j & 3) * 4
    const wy = (j + 0.5) * GROUND_CELL
    for (let i = 0; i < width; i++) {
      const wx = (i + 0.5) * GROUND_CELL
      const bayer = BAYER4[bayerRow + (i & 3)] / 16 - 0.5
      const hit = queryRoad(wx, wy)
      const shoulderJitter = (noise(i, j, 5, seed + 71) - 0.5) * 4.2
      const d = hit.dist + shoulderJitter

      let hex: string
      let shade = 1

      if (d <= half + rim + outlineWidth) {
        const isNorthWestLip = hit.nx + hit.ny < -0.15
        if (d > half + rim) {
          hex = isNorthWestLip ? biome.roadOutline : biome.roadEdge
        } else if (d > half) {
          hex = isNorthWestLip ? biome.roadMortar : biome.roadEdge
        } else {
          const across = hit.dist * (hit.nx * -hit.ty + hit.ny * hit.tx >= 0 ? 1 : -1)
          if (field.id === 'meadow') {
            // Packed warm earth path with subtle twin cart wheel ruts + occasional stepping stones!
            const rut = Math.abs(Math.abs(across) - half * 0.42) < 2.2
            const n = noise(i, j, 6, seed + 5)
            const stepCol = Math.floor(hit.along / 16)
            const stepHit =
              Math.abs(across + (hash(stepCol, 1, seed + 19) - 0.5) * half * 0.7) < 3.5 &&
              (((hit.along % 16) + 16) % 16) < 5 &&
              hash(stepCol, 2, seed + 19) > 0.62
            if (stepHit) hex = biome.pebble
            else if (rut && n > 0.25) hex = biome.road[2]
            else if (Math.abs(across) < half * 0.28 && n > 0.42) hex = biome.roadCenter
            else hex = biome.road[n < 0.36 ? 2 : n > 0.7 ? 1 : 0]
          } else if (field.id === 'desert') {
            // Compacted terracotta caravan trail with sand-drifted shoulders & gravel pebbles (NOT stone brick!).
            const n = noise(i, j, 5.5, seed + 7)
            const driftIn = hit.dist > half * 0.76 && noise(i, j, 4, seed + 33) > 0.66
            const pebble = hash(i, j, seed + 23) > 0.96
            if (driftIn) hex = biome.ground[2]
            else if (pebble) hex = biome.pebble
            else if (hit.dist < half * 0.38 && n > 0.44) hex = biome.roadCenter
            else hex = biome.road[n < 0.34 ? 2 : n > 0.7 ? 1 : 0]
          } else {
            // Frost (blue-slate causeway) & Volcanic (cracked basalt pavers with faint ember seams).
            const stoneRow = Math.floor((across + 64) / 7.2)
            const stoneCol = Math.floor((hit.along + (stoneRow & 1) * 5) / 10)
            const rowFrac = (((across + 64) / 7.2) % 1 + 1) % 1
            const colFrac = (((hit.along + (stoneRow & 1) * 5) / 10) % 1 + 1) % 1
            const isMortar = rowFrac < 0.16 || colFrac < 0.14
            const stoneHash = hash(stoneCol, stoneRow, seed + 19)
            const centerWear = hit.dist < half * 0.4 && noise(i, j, 7, seed + 5) > 0.38
            if (isMortar && !centerWear) {
              hex = field.id === 'volcanic' && stoneHash > 0.88 ? biome.slowAccent : biome.roadMortar
            } else if (centerWear && stoneHash > 0.35) {
              hex = biome.roadCenter
            } else {
              hex = biome.road[stoneHash < 0.33 ? 2 : stoneHash > 0.72 ? 1 : 0]
            }
            if (!isMortar && stoneHash > 0.93 && hit.dist > half * 0.25) hex = biome.pebble
          }

          // Natural irregular biome-specific slow stretch.
          if (querySlow) {
            const sd = querySlow(wx, wy).dist
            const slowJitter = (noise(i, j, 4, seed + 83) - 0.5) * 6.0
            if (sd + slowJitter < half * 0.92) {
              const sNoise = noise(i, j, 3.8, seed + 11)
              if (sd + slowJitter > half * 0.72) {
                hex = biome.slowBorder
              } else if (field.id === 'frost') {
                const crack = Math.abs(noise(i, j, 4.5, seed + 91) - 0.5)
                hex = crack < 0.036 ? biome.slowAccent : sNoise > 0.5 ? biome.slowLight : biome.slow
              } else if (field.id === 'volcanic') {
                const crack = Math.abs(noise(i, j, 4.5, seed + 93) - 0.5)
                hex =
                  crack < 0.026
                    ? biome.slowAccent
                    : crack < 0.06
                      ? biome.accentHalo2!
                      : sNoise > 0.54
                        ? biome.slowLight
                        : biome.slow
              } else if (field.id === 'desert') {
                const swirl = Math.sin(sd * 0.44 + noise(i, j, 6, seed + 95) * 4.6)
                hex =
                  swirl > 0.42
                    ? biome.slowLight
                    : swirl < -0.35
                      ? biome.slowAccent
                      : sd + slowJitter > half * 0.84
                        ? biome.slowBorder
                        : biome.slow
              } else {
                const rut = Math.abs(Math.abs(hit.dist) - half * 0.36) < 2.4
                hex = rut ? biome.slowAccent : sNoise > 0.5 ? biome.slowLight : biome.slow
              }
            }
          }
        }
      } else {
        // Biome-unique Bayer-dithered quantized terrain elevation bands.
        const large = noise(i, j, biome.noiseScale, seed)
        const med = noise(i, j, biome.noiseScale * 0.38, seed + 3)
        const v = large * 0.74 + med * 0.26 + bayer * 0.08
        hex = biome.ground[v < 0.34 ? 3 : v < 0.54 ? 0 : v < 0.73 ? 1 : 2]

        if (field.id === 'desert') {
          // Broad calm desert swells & hardpan patches (ZERO long winding bright ribbons!).
          if (large < 0.26 && med > 0.42) hex = biome.accentA!
        } else if (field.id === 'frost') {
          const drift = noise(i * 0.55, j * 1.35, 18, seed + 29)
          // Two-step drift edge: a mid snow tone keeps the white patch from looking cut out.
          if (drift > 0.8) hex = biome.tuftLight
          else if (drift > 0.72) hex = biome.edgeLight
          for (const pool of pools) {
            const dx = wx - pool.x
            const dy = wy - pool.y
            const ca = Math.cos(pool.rot),
              sa = Math.sin(pool.rot)
            const lx = (dx * ca - dy * sa) / pool.rx
            const ly = (dx * sa + dy * ca) / pool.ry
            const warp = (noise(i, j, 7, seed + 61) - 0.5) * 0.26
            const pr = Math.hypot(lx, ly) + warp
            if (pr < 1.06) {
              if (pr > 0.91) hex = biome.accentRim!
              else {
                const gleam = Math.abs((i + j * 1.2) % 10 - 3) < 1.1 && pr < 0.78
                hex = gleam ? biome.accentC! : pr < 0.55 ? biome.accentB! : biome.accentA!
              }
              break
            }
          }
        } else if (field.id === 'volcanic') {
          // Organic glowing magma pools + branching molten lava fissures + 2-tier warm bounce glow!
          for (const pool of pools) {
            const dx = wx - pool.x
            const dy = wy - pool.y
            const ca = Math.cos(pool.rot),
              sa = Math.sin(pool.rot)
            const lx = (dx * ca - dy * sa) / pool.rx
            const ly = (dx * sa + dy * ca) / pool.ry
            const warp = (noise(i, j, 6.5, seed + 67) - 0.5) * 0.4
            const pr = Math.hypot(lx, ly) + warp
            if (pr < 1.55) {
              if (pr < 0.34) hex = biome.accentA!
              else if (pr < 0.62) hex = biome.accentB!
              else if (pr < 0.82) hex = biome.accentC!
              else if (pr < 0.98) hex = biome.accentRim!
              else if (pr < 1.26 && bayer > -0.25) hex = biome.accentHalo!
              else if (bayer > 0.05) hex = biome.accentHalo2!
              break
            }
            // Branching magma crack extending outward from each pool (staying away from roads & slots).
            const distFromPool = Math.hypot(dx, dy)
            if (distFromPool < 78 && hit.dist > half + 14) {
              const bx = Math.cos(pool.branchAngle),
                by = Math.sin(pool.branchAngle)
              const proj = dx * bx + dy * by
              if (proj > 0 && proj < 72) {
                const perp = Math.abs(-dx * by + dy * bx + (noise(i, j, 5, seed + 77) - 0.5) * 14)
                const widthCrack = Math.max(1.2, 4.2 * (1 - proj / 74))
                if (perp < widthCrack) {
                  hex = perp < widthCrack * 0.45 ? biome.accentB! : biome.accentC!
                  break
                } else if (perp < widthCrack + 4.5 && bayer > 0) {
                  hex = biome.accentHalo!
                }
              }
            }
          }
        }

        const ov = overlay.get(j * width + i)
        if (
          ov &&
          hex !== biome.accentA &&
          hex !== biome.accentB &&
          hex !== biome.accentC &&
          hex !== biome.accentRim &&
          hex !== biome.accentHalo
        ) {
          hex = ov
        }

        // Raised stone/turf deployment plinths with a full bevelled rim, four corner stones and
        // a bright top face, so empty build slots read as interactive pads rather than ground stains.
        for (let s = 0; s < slots.length; s++) {
          const sx = wx - slots[s].x
          const sy = wy - slots[s].y
          if (Math.abs(sx) > 18 || Math.abs(sy) > 16) continue
          const ax = Math.abs(sx)
          const ay = Math.abs(sy)
          const bevel = ax + ay
          const lit = sx + sy < 0
          if (ax <= 14.2 && ay <= 12.2 && bevel <= 21.8) {
            if (ax > 13.1 || ay > 11.1 || bevel > 20.4) hex = biome.slotShadow
            else if (ax > 11.2 || ay > 9.2 || bevel > 18.2)
              hex = lit ? biome.slotEdge : biome.slotShadow
            else if (ax > 9.6 || ay > 8.0 || bevel > 16.1) hex = lit ? biome.slotEdge : biome.slotFill
            else hex = biome.slotFill
            // Rounded corner stones anchor the pad even against busy grass or ash.
            if ((ax === 10 || ax === 11) && (ay === 8 || ay === 9)) hex = biome.slotEdge
            if (ax === 12 && ay === 9) hex = biome.slotShadow
          }
          // A build glyph sits on the texel nearest the pad centre (slot centres rarely land on
          // an exact texel), so the marker stays visible in all four biomes.
          const padX = Math.round(slots[s].x / GROUND_CELL),
            padY = Math.round(slots[s].y / GROUND_CELL)
          const mdx = i - padX,
            mdy = j - padY
          if (Math.abs(mdx) <= 2 && Math.abs(mdy) <= 2 && (mdx === 0 || mdy === 0)) hex = biome.slotShadow
        }

        if (d < half + rim + outlineWidth + 3.4) {
          const isNW = hit.nx + hit.ny < -0.1
          hex = isNW ? biome.edgeShadow : biome.edgeLight
        }

        // Stepped pixel-art edge falloff (two hard steps) instead of a smooth gradient.
        const edgeDistance = Math.min(i, j, width - 1 - i, height - 1 - j)
        if (edgeDistance < 4) shade *= 0.87
        else if (edgeDistance < 8) shade *= 0.94
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
