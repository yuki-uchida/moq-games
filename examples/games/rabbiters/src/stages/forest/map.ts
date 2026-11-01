// The forest (chapter 4): the original 288 × 200 m field of the seasons campaign. Everything is derived
// from constants and fixed seeds at module load, so no map data crosses the relay. Terrain heights use only
// + - * / and sqrt, which every JavaScript engine evaluates identically, so food heights and tunnel depths
// match bit for bit on every client.
import type { FoodKind } from '../../food'
import type { Blocker, Capsule, Cave, FoodSpot, Log, Npc, PredatorStart, StageMap, TunnelNode } from '../../map'
import { RAISED_FOOD, TUNNEL_DEPTH, WATER_LEVEL, segmentDistance, smoothstep, type Circle, type Point } from '../kit'

export const WORLD = { minX: -144, maxX: 144, minZ: -100, maxZ: 100 } as const // 288 × 200 m, 10× the old field
export const SPAWN = { x: -118, z: 0 } as const
export const MAX_PREDATORS = 30

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)
const length = (x: number, z: number) => Math.sqrt(x * x + z * z)
const snap = (value: number) => Math.round(value * 64) / 64 // hides last-bit trig differences between engines

function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(ix: number, iz: number) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

function noise(x: number, z: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const u = fx * fx * (3 - 2 * fx)
  const v = fz * fz * (3 - 2 * fz)
  const a = hash(ix, iz)
  const b = hash(ix + 1, iz)
  const c = hash(ix, iz + 1)
  const d = hash(ix + 1, iz + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

// ---------------------------------------------------------------- terrain features
// North is −z. The stream runs north→south and splits the home meadow (west) from the hills.
export const STREAM: readonly Point[] = [
  { x: -34, z: -104 },
  { x: -44, z: -78 },
  { x: -58, z: -50 },
  { x: -52, z: -22 },
  { x: -60, z: 6 },
  { x: -50, z: 32 },
  { x: -62, z: 58 },
  { x: -72, z: 84 },
  { x: -80, z: 104 }
]
const STREAM_HALF = 3.4
export const FORDS: readonly Point[] = [
  { x: -55, z: -36 },
  { x: -55, z: 19 },
  { x: -67, z: 71 }
]
const HILLS = [
  [0, -8, 24, 7], // Big Oak hill
  [-26, -28, 15, 4],
  [30, 10, 17, 4.5],
  [-22, 44, 14, 3],
  [10, 64, 18, 3],
  [44, 82, 16, 3.5],
  [-12, 82, 13, 2.5],
  [-102, -66, 20, 6],
  [-76, -84, 14, 4],
  [-128, -40, 14, 3],
  [80, 60, 22, 3],
  [124, 2, 18, 4],
  [72, -58, 22, 3.5],
  [128, 70, 15, 3],
  [60, 28, 12, 2.5],
  [-96, 62, 16, 2.5]
] as const
export const HOLLOWS = [
  [-4, 48, 9, 2.6],
  [44, -18, 9, 2.4],
  [104, 74, 8, 2],
  [-120, 52, 8, 2]
] as const
export const PLATEAU = { x: 15, z: -72, rx: 46, rz: 17, height: 9 } as const
const TERRACE_STEPS = 7

export const CAVES: readonly Cave[] = [
  {
    name: '東の大洞窟',
    x: 96,
    z: -12,
    r: 10,
    wall: 1.6,
    floor: 1,
    roof: 5.5,
    entrances: [
      { dx: -1, dz: 0, width: 3.2 },
      { dx: 0.6, dz: -0.8, width: 1.1 },
      { dx: 0.28, dz: 0.96, width: 1.1 }
    ]
  },
  {
    name: '台地の岩屋',
    x: 32,
    z: -78,
    r: 6.5,
    wall: 1.4,
    floor: 9.6,
    roof: 4,
    entrances: [
      { dx: 0, dz: 1, width: 2.6 },
      { dx: -1, dz: 0, width: 1 }
    ]
  }
]

function streamDistance(x: number, z: number) {
  let best = Infinity
  for (let index = 1; index < STREAM.length; index++) {
    const a = STREAM[index - 1]
    const b = STREAM[index]
    best = Math.min(best, segmentDistance(x, z, a.x, a.z, b.x, b.z))
  }
  return best
}

function rawHeight(x: number, z: number) {
  let h = 0.85 * noise(x / 26, z / 26) + 0.35 * noise(x / 9 + 31.7, z / 9 - 17.3)
  for (const [hx, hz, radius, height] of HILLS) {
    const dx = x - hx
    const dz = z - hz
    if (dx * dx + dz * dz < radius * radius) h += height * smoothstep(0, 1, 1 - length(dx, dz) / radius)
  }
  let dip = 0
  for (const [hx, hz, radius, depth] of HOLLOWS) {
    // A bowl with a raised lip, deep enough to drop out of sight.
    const d = length(x - hx, z - hz)
    const lip = Math.abs(d - radius) / (radius * 0.6)
    if (lip < 1) h += depth * 0.55 * smoothstep(0, 1, 1 - lip)
    if (d < radius) dip += depth * smoothstep(0, 1, 1 - d / radius)
  }
  if (dip > 0) h = Math.max(h - dip, -0.15)
  h *= smoothstep(22, 34, length(x - SPAWN.x, z - SPAWN.z)) // flat home meadow
  const edge = Math.min(x - WORLD.minX, WORLD.maxX - x, z - WORLD.minZ, WORLD.maxZ - z)
  h += 7 * smoothstep(12, 0, edge)

  // North plateau with sheer cliffs, rabbit-sized terraces on its south face and a long east ramp.
  const qx = (x - PLATEAU.x) / PLATEAU.rx
  const qz = (z - PLATEAU.z) / PLATEAU.rz
  const q = length(qx, qz)
  let lift = PLATEAU.height * smoothstep(1.04, 0.97, q)
  if (qz > 0) {
    const side = smoothstep(-25, -22, x) * smoothstep(7, 4, x)
    const u = clamp01(2 - q) * TERRACE_STEPS
    const level = Math.floor(u)
    lift = Math.max(
      lift,
      (PLATEAU.height * side * (Math.min(level, TERRACE_STEPS) + smoothstep(0.8, 1, u - level))) / TERRACE_STEPS
    )
  }
  if (x > 50) lift = Math.max(lift, PLATEAU.height * clamp01((92 - x) / 34) * smoothstep(5.5, 3.5, Math.abs(z + 72)))
  h += lift

  // Stream channel, deep except at three shallow fords.
  let ford = Infinity
  for (const point of FORDS) ford = Math.min(ford, length(x - point.x, z - point.z))
  const bed = -1.45 + 0.9 * smoothstep(7, 4, ford)
  const wet = smoothstep(STREAM_HALF + 5.5, STREAM_HALF - 0.6, streamDistance(x, z))
  h += (bed - h) * wet

  for (const cave of CAVES) h += (cave.floor - h) * smoothstep(cave.r + 5, cave.r + 1.5, length(x - cave.x, z - cave.z))
  return h
}

const NX = WORLD.maxX - WORLD.minX + 1
const NZ = WORLD.maxZ - WORLD.minZ + 1
/** Terrain vertex heights on a 1 m grid; the renderer builds its mesh from exactly these values. */
const TERRAIN = { nx: NX, nz: NZ, heights: new Float64Array(NX * NZ) }
for (let j = 0; j < NZ; j++)
  for (let i = 0; i < NX; i++) TERRAIN.heights[j * NX + i] = rawHeight(WORLD.minX + i, WORLD.minZ + j)

/** Ground height while building (the engine's `heightAt` is the same formula over the active map). */
function heightAt(x: number, z: number): number {
  const gx = Math.min(Math.max(x - WORLD.minX, 0), NX - 1)
  const gz = Math.min(Math.max(z - WORLD.minZ, 0), NZ - 1)
  const i = Math.min(Math.floor(gx), NX - 2)
  const j = Math.min(Math.floor(gz), NZ - 2)
  const u = gx - i
  const v = gz - j
  const heights = TERRAIN.heights
  const h00 = heights[j * NX + i]
  const h10 = heights[j * NX + i + 1]
  const h01 = heights[(j + 1) * NX + i]
  const h11 = heights[(j + 1) * NX + i + 1]
  return u >= v ? h00 + u * (h10 - h00) + v * (h11 - h10) : h00 + v * (h01 - h00) + u * (h11 - h01)
}

const waterDepth = (x: number, z: number) => WATER_LEVEL - heightAt(x, z)
const slopeAt = (x: number, z: number) =>
  length(heightAt(x + 0.5, z) - heightAt(x - 0.5, z), heightAt(x, z + 0.5) - heightAt(x, z - 0.5))

// ---------------------------------------------------------------- hand-placed places
/** Sand pits for dust baths away from the eastern sand. */
export const SAND_PATCHES: readonly (readonly [number, number])[] = [
  [-30, 50],
  [16, -32],
  [-102, 34]
]
const onSand = (x: number, z: number) =>
  waterDepth(x, z) < 0 && (x > 56 || SAND_PATCHES.some(([sx, sz]) => length(x - sx, z - sz) < 2.4))

export const SHELTERS: readonly Circle[] = [
  { x: SPAWN.x, z: SPAWN.z, r: 4 }, // home burrow
  { x: 0, z: -8, r: 2.2 }, // hollow at the foot of the Big Oak
  { x: 26, z: 60, r: 1.8 }, // hollow root of an old forest tree
  { x: -32, z: 76, r: 1.8 }
]
export const LANDMARKS = [
  { kind: 'oak', name: '大樫', x: 0, z: -8 },
  { kind: 'spire', name: '赤岩の塔', x: 118, z: 32 },
  { kind: 'pines', name: 'ふたご松', x: -2, z: -80 },
  { kind: 'birch', name: '白樺', x: -124, z: -8 }
] as const

export const TUNNEL_NODES: readonly TunnelNode[] = [
  { x: -96, z: 14, exit: true },
  { x: -82, z: -24, exit: true },
  { x: -76, z: 6, exit: false },
  { x: -38, z: 10, exit: false }, // mole pantry beyond the stream
  { x: -30, z: 34, exit: true },
  { x: -14, z: -14, exit: true },
  { x: 66, z: 26, exit: true },
  { x: 86, z: 32, exit: false }, // desert pantry
  { x: 88, z: 54, exit: true },
  { x: 108, z: 16, exit: true }
]
export const TUNNEL_EDGES: readonly (readonly [number, number])[] = [
  [0, 2],
  [1, 2],
  [2, 3],
  [3, 4],
  [3, 5],
  [6, 7],
  [7, 8],
  [7, 9]
]

const logAt = (ax: number, az: number, bx: number, bz: number): Log => {
  let ground = -Infinity
  for (let t = 0; t <= 1; t += 0.125) ground = Math.max(ground, heightAt(ax + (bx - ax) * t, az + (bz - az) * t))
  return { ax, az, bx, bz, r: 0.55, bottom: ground + 0.75 }
}
export const LOGS: readonly Log[] = [
  [-18, 56, -8, 60],
  [18, 50, 28, 58],
  [30, 74, 30, 86],
  [-28, 66, -18, 72],
  [4, 88, 16, 86],
  [42, 64, 52, 70],
  [-40, 76, -30, 80],
  [22, 70, 14, 76],
  [-44, 50, -40, 61],
  [-16, 18, -6, 22],
  [-68, -10, -70, 1]
].map(([ax, az, bx, bz]) => logAt(ax, az, bx, bz))

const MEADOW_FOODS: readonly FoodKind[] = ['clover', 'dandelion', 'clover', 'carrot', 'dandelion', 'cabbage']
const food = (place: FoodSpot['place'], x: number, z: number, index = 0): FoodSpot => ({
  x,
  z,
  place,
  // Apples hang high, moles hoard carrots, berries grow in the woods and caves, greens elsewhere.
  kind:
    place === 'raised'
      ? 'apple'
      : place === 'tunnel'
        ? 'carrot'
        : (z > 40 && x < 60) || CAVES.some((cave) => length(x - cave.x, z - cave.z) < cave.r)
          ? 'berry'
          : x > 55
            ? index % 2
              ? 'carrot'
              : 'cabbage'
            : MEADOW_FOODS[index % MEADOW_FOODS.length],
  y: heightAt(x, z) + (place === 'raised' ? RAISED_FOOD : place === 'tunnel' ? -TUNNEL_DEPTH : 0)
})
export const FOODS: readonly FoodSpot[] = [
  ...(
    [
      [-114, -3],
      [-109, -8],
      [-105, -12],
      [-93, 7],
      [-100, 24],
      [-126, 20],
      [-130, -22],
      [-108, -30],
      [-64, -18],
      [-44, 26],
      [-72, 58],
      [-42, -60],
      [-10, 4],
      [8, -24],
      [20, 0],
      [-24, -22],
      [34, 20],
      [44, -6],
      [-30, 0],
      [0, -72],
      [24, -66],
      [32, -80],
      [-4, -48],
      [-14, -52],
      [78, -72],
      [0, 54],
      [20, 66],
      [-20, 60],
      [36, 88],
      [-10, 90],
      [12, 78],
      [46, 58],
      [-36, 84],
      [-13, 58],
      [26, 46],
      [70, 0],
      [80, 44],
      [110, -40],
      [126, 62],
      [134, -6],
      [100, 78],
      [60, -30],
      [116, 54],
      [94, -14],
      [99, -6],
      [-96, -54],
      [-84, -76],
      [-122, -78],
      [-108, -44],
      [-100, 60],
      [-122, 78],
      [-82, 88],
      [40, -40],
      [-60, -84]
    ] as const
  ).map(([x, z], index) => food('ground', x, z, index)),
  food('raised', -112, 14),
  food('raised', -6, 26),
  food('raised', 12, 12),
  food('raised', 46, -76),
  food('tunnel', -38, 10),
  food('tunnel', 86, 32)
]
export const NESTS: readonly Point[] = [
  { x: 8, z: 72 },
  { x: -24, z: 90 },
  { x: 36, z: 30 },
  { x: -12, z: -68 },
  { x: 88, z: 62 },
  { x: 124, z: -46 },
  { x: -98, z: -74 },
  { x: -94, z: 80 }
]
export const PREDATOR_STARTS: readonly PredatorStart[] = [
  { kind: 'fox', x: -88, z: -30 },
  { kind: 'fox', x: 24, z: 36 },
  { kind: 'fox', x: 58, z: -36 },
  { kind: 'fox', x: -20, z: 62 },
  { kind: 'wolf', x: 10, z: 80 },
  { kind: 'wolf', x: 40, z: 70 },
  { kind: 'wolf', x: -30, z: -42 },
  { kind: 'hawk', x: -62, z: -8 },
  { kind: 'hawk', x: 25, z: -70 },
  { kind: 'hawk', x: 95, z: 40 },
  { kind: 'snake', x: 97, z: -12 },
  { kind: 'snake', x: 112, z: 24 },
  { kind: 'snake', x: -102, z: -60 },
  { kind: 'crocodile', x: -58, z: -50 },
  { kind: 'crocodile', x: -50, z: 32 },
  { kind: 'crocodile', x: -62, z: 58 }
]
/** Deep-water points where new crocodiles appear. */
export const CROCODILE_POOLS: readonly Point[] = STREAM.filter(
  (point) => point.z > WORLD.minZ + 4 && point.z < WORLD.maxZ - 4
)

// ---------------------------------------------------------------- scattered cover and obstacles
export const GRASS: Capsule[] = [
  [-114, -7],
  [-105, -12],
  [-103, 3],
  [-98, -22],
  [-93, 7]
].map(([x, z]) => ({ ax: x, az: z, bx: x, bz: z, r: 3.2 }))
export const BUSHES: Circle[] = []
export const TREES: Blocker[] = []
export const ROCKS: Blocker[] = []

const RING_GARDENS = [
  { x: -108, z: -44, r: 9, gaps: [0.6, 3.6] },
  { x: 116, z: 54, r: 8, gaps: [2.2, 5.3] }
] as const
for (const garden of RING_GARDENS) {
  // A boulder ring with two rabbit-wide crevices: a sanctuary only rabbits and snakes can slip into.
  const rockRadius = 1.5
  const half = (rockRadius + 0.5) / garden.r
  const gaps = [...garden.gaps, garden.gaps[0] + Math.PI * 2]
  for (let index = 0; index < garden.gaps.length; index++) {
    const start = gaps[index] + half
    const end = gaps[index + 1] - half
    const count = Math.ceil(((end - start) * garden.r) / 2.4)
    for (let rock = 0; rock <= count; rock++) {
      const angle = start + ((end - start) * rock) / count
      const x = snap(garden.x + Math.cos(angle) * garden.r)
      const z = snap(garden.z + Math.sin(angle) * garden.r)
      ROCKS.push({ x, z, r: rockRadius, top: heightAt(x, z) + 2.2, kind: 'rock' })
    }
  }
  GRASS.push({ ax: garden.x - 2, az: garden.z, bx: garden.x + 2, bz: garden.z, r: 3 })
}
ROCKS.push({ x: 118, z: 32, r: 3.5, top: heightAt(118, 32) + 22, kind: 'rock' })
TREES.push(
  { x: -2, z: -80, r: 0.6, top: heightAt(-2, -80) + 16, kind: 'tree' },
  { x: 4, z: -83, r: 0.6, top: heightAt(4, -83) + 15, kind: 'tree' },
  { x: -124, z: -8, r: 0.45, top: 12, kind: 'tree' }
)
for (let index = 1; index < STREAM.length; index++) {
  // Tall reeds along both banks.
  const a = STREAM[index - 1]
  const b = STREAM[index]
  for (const side of [-1, 1]) GRASS.push({ ax: a.x + side * 8, az: a.z + 5, bx: b.x + side * 8, bz: b.z - 5, r: 2 })
}

function open(x: number, z: number, pad: number, solid: boolean): boolean {
  if (x < WORLD.minX + 6 || x > WORLD.maxX - 6 || z < WORLD.minZ + 6 || z > WORLD.maxZ - 6) return false
  if (waterDepth(x, z) > -0.1 || slopeAt(x, z) > 0.7) return false
  if (solid && length(x - SPAWN.x, z - SPAWN.z) < 26) return false
  for (const cave of CAVES) if (length(x - cave.x, z - cave.z) < cave.r + 2 + pad) return false
  for (const node of TUNNEL_NODES) if (node.exit && length(x - node.x, z - node.z) < 2.5 + pad) return false
  for (const shelter of SHELTERS) if (length(x - shelter.x, z - shelter.z) < shelter.r + 2 + pad) return false
  for (const garden of RING_GARDENS) if (length(x - garden.x, z - garden.z) < garden.r + 2.5 + pad) return false
  for (const [sx, sz] of SAND_PATCHES) if (length(x - sx, z - sz) < 3.4 + pad) return false
  if (!solid) return true
  for (const log of LOGS) if (segmentDistance(x, z, log.ax, log.az, log.bx, log.bz) < 2.2 + pad) return false
  for (const spot of FOODS) if (length(x - spot.x, z - spot.z) < 1.8 + pad) return false
  for (const nest of NESTS) if (length(x - nest.x, z - nest.z) < 3 + pad) return false
  for (const start of PREDATOR_STARTS) if (length(x - start.x, z - start.z) < 2.5 + pad) return false
  for (const landmark of LANDMARKS) if (length(x - landmark.x, z - landmark.z) < 4 + pad) return false
  for (const other of TREES) if (length(x - other.x, z - other.z) < other.r + 1.2 + pad) return false
  for (const other of ROCKS) if (length(x - other.x, z - other.z) < other.r + 1.2 + pad) return false
  return true
}

{
  const next = random(20261101)
  const forest = (x: number, z: number) => smoothstep(34, 44, z) * smoothstep(64, 54, x) * smoothstep(-50, -42, x)
  const desert = (x: number) => smoothstep(48, 60, x)
  const point = () => ({
    x: WORLD.minX + 6 + next() * (WORLD.maxX - WORLD.minX - 12),
    z: WORLD.minZ + 6 + next() * (WORLD.maxZ - WORLD.minZ - 12)
  })
  for (let attempt = 0; attempt < 3200; attempt++) {
    const { x, z } = point()
    const roll = next()
    const height = 6.5 + next() * 3 // crowns stay above the camera boom, so woods read as a canopy
    if (roll < Math.max(0.72 * forest(x, z), 0.055 * (1 - desert(x))) && open(x, z, 0, true))
      TREES.push({ x, z, r: 0.35, top: heightAt(x, z) + height, kind: 'tree' })
  }
  for (let attempt = 0; attempt < 900; attempt++) {
    const { x, z } = point()
    const rocky = Math.max(0.5 * desert(x), x < -80 && z < -30 ? 0.45 : 0.06)
    const radius = 0.5 + next() * next() * 1.6
    if (next() < rocky && open(x, z, radius, true))
      ROCKS.push({ x, z, r: radius, top: heightAt(x, z) + radius * 1.25, kind: 'rock' })
  }
  for (let attempt = 0; attempt < 700; attempt++) {
    const { x, z } = point()
    const radius = 1.3 + next() * 0.9
    const chance = Math.max(0.6 * forest(x, z), 0.12 * (1 - desert(x)))
    if (next() < chance && open(x, z, 0, false)) BUSHES.push({ x, z, r: radius })
  }
  for (const [x, z, radius] of HOLLOWS) BUSHES.push({ x: x + radius * 0.3, z: z - radius * 0.2, r: 2.1 })
  for (let attempt = 0; attempt < 420; attempt++) {
    const { x, z } = point()
    const radius = 2.2 + next() * 1.2
    if (next() < 0.55 * (1 - desert(x)) && open(x, z, 0, false)) GRASS.push({ ax: x, az: z, bx: x, bz: z, r: radius })
  }
}

const REGIONS = [
  { name: 'ふるさとの草原', x: -112, z: 0 },
  { name: '洞窟の岩場', x: 92, z: -14 },
  { name: '大樫の丘', x: 0, z: -8 },
  { name: '北の台地', x: 15, z: -72 },
  { name: '段々の崖', x: -8, z: -50 },
  { name: '倒木の森', x: 6, z: 70 },
  { name: '赤岩の砂地', x: 104, z: 34 },
  { name: '東の荒れ地', x: 104, z: -50 },
  { name: '北西の岩場', x: -104, z: -62 },
  { name: '南西の野原', x: -100, z: 70 },
  { name: 'まんなかの野', x: 40, z: 0 }
] as const

function region(x: number, z: number): string {
  if (streamDistance(x, z) < 9) return '小川のほとり'
  let best: (typeof REGIONS)[number] = REGIONS[0]
  for (const region of REGIONS) if (length(x - region.x, z - region.z) < length(x - best.x, z - best.z)) best = region
  return best.name
}

/** The elder wild rabbit who greets the travellers beside the home burrow. */
const NPCS: Npc[] = [{ id: 'yomogi', kind: 'wildRabbit', x: SPAWN.x + 7, z: SPAWN.z - 5, angle: -2.2 }]

const FOREST: StageMap = {
  world: WORLD,
  cell: 1,
  spawn: SPAWN,
  terrain: TERRAIN,
  foods: FOODS,
  nests: NESTS,
  predatorStarts: PREDATOR_STARTS,
  grass: GRASS,
  bushes: BUSHES,
  trees: TREES,
  rocks: ROCKS,
  logs: LOGS,
  shelters: SHELTERS,
  caves: CAVES,
  tunnelNodes: TUNNEL_NODES,
  tunnelEdges: TUNNEL_EDGES,
  npcs: NPCS,
  sand: onSand,
  region
}
export const buildMap = () => FOREST
