// Chapter 3 (waterway): one 264 × 132 m map, west → east. North is −z.
//   Sewer (x < −45, night): a deep channel along x with walkways either side, a footbridge and two cross pipes
//   (mole-tunnel network) under it, the rats' nest room north, the worker's room south, the sluice valve at the
//   east end of the north walkway. The south walkway's east end is flooded (gate 0) until the valve is turned.
//   River (−45 … 18, dawn): the outfall pipe opens on the west bank; the river is deep except a swift ford with
//   stepping stones; the east bank runs south under the road bridge (the stray dogs' den) to a gap in the levee.
//   Park (x > 30, morning): a jogging loop, a pond (Genji), a playground, flower beds and the back fence, whose
//   hole is netted shut (gate 1). Beyond it the back hill (the exit) leads to the forest.
import type { Blocker, Capsule, Circle, FoodSpot, Overhang, PredatorStart, StageMap, Waypoint, Zone } from '../../map'
import { grid, inRect, type Point, type Rect } from '../kit'

export const WORLD = { minX: -132, maxX: 132, minZ: -66, maxZ: 66 }
const CELL = 1
/** The inlet pipe from the town: rabbits start (and are carried back to) under its low roof, out of people's reach. */
const INLET: Rect = { minX: -131, maxX: -127, minZ: -1, maxZ: 3 }
export const SPAWN = { x: -129.5, z: 1 }

// ---------------------------------------------------------------- sewer
const SOUTH_WALK: Rect = { minX: -128, maxX: -57, minZ: -4, maxZ: 6 }
const NORTH_WALK: Rect = { minX: -128, maxX: -57, minZ: -24, maxZ: -16 }
const CHANNEL: Rect = { minX: -128, maxX: -58, minZ: -16, maxZ: -4 } // centre line z = −10
const NEST_ROOM: Rect = { minX: -112, maxX: -92, minZ: -36, maxZ: -26 }
const NEST_DOOR: Rect = { minX: -104, maxX: -100, minZ: -26, maxZ: -24 }
const WORKER_ROOM: Rect = { minX: -96, maxX: -80, minZ: 8, maxZ: 18 }
const WORKER_DOOR: Rect = { minX: -90, maxX: -86, minZ: 6, maxZ: 8 }
const GAMA_NOOK: Rect = { minX: -106, maxX: -100, minZ: 6, maxZ: 10 }
export const PIPE: Rect = { minX: -57, maxX: -44, minZ: -1, maxZ: 3 }
/** The footbridge over the channel (walkable x −91 … −89, rails at −92 and −88). */
export const FOOTBRIDGE = { x: -90, minZ: -16, maxZ: -4 }
/** Flooded east end of the south walkway: under water until the valve lowers it. */
export const FLOODED: Rect = { minX: -70, maxX: -57, minZ: -4, maxZ: 6 }
export const SEWER_CHANNEL = CHANNEL

// ---------------------------------------------------------------- river
export const RIVER = { west: -32, east: 0 } // bank tops; deep bed between
export const CURRENT: Rect = { minX: -29.5, maxX: -1.5, minZ: -28.5, maxZ: -19.5 }
/** A gravel sandbar midstream with reeds: a rest between the two runs of stones. */
export const SANDBAR: Rect = { minX: -19, maxX: -13, minZ: -30, maxZ: -18 }
/** Stepping stones, west → east (2 × 2 m tops at 0.3): two to the sandbar, two from it. */
export const STONES: readonly Point[] = [
  { x: -27, z: -24 },
  { x: -23, z: -22 },
  { x: -9, z: -25 },
  { x: -5, z: -23 }
]
export const BRIDGE: Rect = { minX: -44, maxX: 30, minZ: 14, maxZ: 26 }
const LEVEE: Rect = { minX: 18, maxX: 29, minZ: -66, maxZ: 66 }
const LEVEE_GAP = { minZ: 32, maxZ: 38 }

// ---------------------------------------------------------------- park
export const POND = { x: 72, z: -8, deep: 9, shore: 12 }
export const PLAYGROUND: Rect = { minX: 88, maxX: 114, minZ: 16, maxZ: 44 }
export const SANDBOX: Rect = { minX: 90, maxX: 96, minZ: 34, maxZ: 42 }
const FENCE_X = 124
export const FENCE_HOLE = { minZ: -36, maxZ: -32 }
/** The jogging loop round the park. */
export const LOOP: readonly Point[] = [
  { x: 40, z: -52 },
  { x: 116, z: -52 },
  { x: 116, z: 54 },
  { x: 40, z: 54 }
]

/** Places the script and tests refer to. */
export const SPOTS = {
  gama: { x: -103, z: 8 },
  handle: { x: -105, z: -31 },
  valve: { x: -72, z: -22 },
  valve2: { x: -82.5, z: 15 },
  launch: { x: -30.5, z: -24 },
  landing: { x: 4, z: -24 },
  den: { x: 6, z: 20 },
  hideEast: { x: 3, z: -13 },
  nest: { x: -106, z: -33 },
  genji: { x: 59, z: -10 },
  dandelions: [
    { x: 82, z: 34 },
    { x: 115, z: -46 },
    { x: 50, z: 42 },
    { x: 72, z: -40 }
  ],
  net: { x: 122, z: -34 },
  exit: { x: 129, z: -34 }
}
/** Where a caught or swept-away rabbit restarts, by area. */
export const CHECKPOINTS = {
  sewer: SPAWN,
  river: { x: -47, z: 1 }, // in the outfall pipe
  eastBank: { x: 5, z: -30 },
  park: { x: 24, z: 35 }, // in the culvert through the levee
  pond: { x: 64, z: 16 }, // under the bench by the pond
  fence: { x: 110, z: -14 } // under the bench near the back fence
}

/** The flashlight's lit patch ahead of the sewer worker; the script moves it every tick (host only). */
export const BEAM: Zone = { id: 'beam', light: 2.2, minX: 1e6, maxX: 1e6, minZ: 1e6, maxZ: 1e6 }

export function beamRect(worker?: Point & { angle: number }): Rect {
  if (!worker) return { minX: 1e6, maxX: 1e6, minZ: 1e6, maxZ: 1e6 }
  const x = worker.x + Math.sin(worker.angle) * 5.5
  const z = worker.z + Math.cos(worker.angle) * 5.5
  return { minX: x - 3.5, maxX: x + 3.5, minZ: z - 3.5, maxZ: z + 3.5 }
}

function sewerHeight(x: number, z: number) {
  // Footbridge with rails, over the channel.
  if (z > FOOTBRIDGE.minZ && z < FOOTBRIDGE.maxZ && x >= -92 && x <= -88) return x === -92 || x === -88 ? 3 : 0.4
  if (inRect(x, z, CHANNEL, 0.01)) {
    // Gentle banks into deep water: 0 at the walkway edge, a wadeable shelf, then deep.
    const d = Math.abs(z + 10)
    return d >= 6 ? 0 : d >= 5 ? -0.6 : -2
  }
  for (const floor of [INLET, SOUTH_WALK, NORTH_WALK, NEST_ROOM, NEST_DOOR, WORKER_ROOM, WORKER_DOOR, GAMA_NOOK, PIPE])
    if (inRect(x, z, floor, 0.01)) return 0
  return 8
}

function riverHeight(x: number, z: number) {
  if (x <= RIVER.west) return 0
  if (x >= RIVER.east + 1) return 0
  // Bank shelves either side, deep in between; the ford band is shallow but swift.
  const fromWest = x - RIVER.west
  const fromEast = RIVER.east + 1 - x
  const shelf = Math.min(fromWest, fromEast)
  if (shelf <= 1) return -0.5
  if (shelf <= 2) return -0.9
  if (inRect(x, z, SANDBAR, 0.01)) return 0.2
  if (inRect(x, z, SANDBAR, 1.01)) return -0.5
  for (const stone of STONES) if (Math.abs(x - stone.x) <= 1 && Math.abs(z - stone.z) <= 1) return 0.3
  return inRect(x, z, CURRENT) ? -0.95 : -2
}

function parkHeight(x: number, z: number) {
  if (x >= FENCE_X + 2) return (x - FENCE_X - 2) * 0.4 // the back hill
  if (x >= FENCE_X && x <= FENCE_X + 1) return z >= FENCE_HOLE.minZ && z <= FENCE_HOLE.maxZ ? 0 : 4
  if (Math.abs(z) >= 64) return 4 // perimeter fence
  const r = Math.hypot(x - POND.x, z - POND.z)
  return r <= POND.deep ? -2 : r <= POND.deep + 1 ? -1 : r <= POND.shore - 1 ? -0.5 : 0
}

export function heightOf(x: number, z: number) {
  if (x <= -45) return sewerHeight(x, z)
  if (inRect(x, z, LEVEE, 0.01)) return z >= LEVEE_GAP.minZ && z <= LEVEE_GAP.maxZ ? 0 : 6
  if (x < LEVEE.minX) return riverHeight(x, z)
  return parkHeight(x, z)
}

// ---------------------------------------------------------------- creatures
const rat = (id: string, x: number, z: number, route: Waypoint[]): PredatorStart => ({ kind: 'rat', id, x, z, route })
const NORTH_RATS: Waypoint[] = [
  { x: -102, z: -31, wait: 16 },
  { x: -102, z: -20 },
  { x: -124, z: -20, wait: 6 },
  { x: -102, z: -20 },
  { x: -88, z: -19, wait: 6 },
  { x: -102, z: -20 }
]
export const WORKER_ROUTE: Waypoint[] = [
  { x: -88, z: 14, wait: 18 },
  { x: -88, z: 2 },
  { x: -115, z: 2, wait: 6 },
  { x: -96, z: 2 },
  { x: -90, z: 0 },
  { x: -90, z: -19 },
  { x: -122, z: -20, wait: 5 },
  { x: -90, z: -22.8 },
  { x: -73, z: -22.8, wait: 8 },
  { x: -90, z: -22.8 },
  { x: -90, z: 0 },
  { x: -73, z: 1, wait: 7 },
  { x: -88, z: 2 }
]
const PREDATOR_STARTS: PredatorStart[] = [
  { kind: 'human', id: 'worker', x: -88, z: 14, route: WORKER_ROUTE },
  rat('rat-0', -102, -31, NORTH_RATS),
  rat('rat-1', -100, -33, NORTH_RATS),
  rat('rat-2', -104, -33, NORTH_RATS)
]
export const SEWER_IDS = PREDATOR_STARTS.map((start) => start.id!)

/** River creatures, spawned when a rabbit comes out of the outfall. */
export const RIVER_CREATURES: PredatorStart[] = [
  { kind: 'human', id: 'angler', x: -37, z: 12, leash: 0.6 },
  {
    kind: 'crow',
    id: 'crow-0',
    x: -40,
    z: -44,
    route: [
      { x: -40, z: -44 },
      { x: 2, z: -44 },
      { x: 2, z: -4 },
      { x: -40, z: -4 }
    ]
  },
  {
    kind: 'crow',
    id: 'crow-1',
    x: 10,
    z: 50,
    route: [
      { x: 10, z: 50, wait: 6 },
      { x: -20, z: 40 },
      { x: -40, z: 10 },
      { x: -20, z: -40 },
      { x: 10, z: -10 }
    ]
  },
  ...[0, 1, 2].map(
    (index): PredatorStart => ({
      kind: 'dog',
      id: `stray-${index}`,
      x: SPOTS.den.x - 2 + index * 2,
      z: SPOTS.den.z + (index % 2),
      route: [
        { x: SPOTS.den.x - 2 + index * 2, z: SPOTS.den.z + (index % 2), wait: 40 },
        { x: 6 + index, z: 52, wait: 26 },
        { x: SPOTS.den.x - 2 + index * 2, z: SPOTS.den.z + (index % 2), wait: 40 },
        { x: 4 + index * 2, z: -4, wait: 12 }
      ]
    })
  )
]

const reversed = [...LOOP].reverse()
/** Park people (and leashed dogs, which the script keeps beside their walker), spawned on reaching the park. */
export const PARK_CREATURES: PredatorStart[] = [
  { kind: 'human', id: 'walker-0', x: 40, z: 54, route: LOOP.map((point) => ({ ...point, wait: 3 })) },
  { kind: 'dog', id: 'walkdog-0', x: 42, z: 54, route: LOOP.map((point) => ({ ...point, wait: 3 })) },
  { kind: 'human', id: 'jogger-0', x: 116, z: -52, route: reversed },
  {
    kind: 'child',
    id: 'child-0',
    x: 92,
    z: 20,
    route: [
      { x: 92, z: 20, wait: 5 },
      { x: 110, z: 18 }, // below the swing frame, clear of its posts
      { x: 112, z: 42, wait: 6 },
      { x: 96, z: 42 },
      { x: 92, z: 30, wait: 4 }
    ]
  },
  {
    kind: 'child',
    id: 'child-1',
    x: 108,
    z: 40,
    route: [
      { x: 108, z: 40, wait: 8 },
      { x: 94, z: 40 },
      { x: 94, z: 20, wait: 6 },
      { x: 104, z: 18 },
      { x: 112, z: 30, wait: 4 }
    ]
  },
  {
    kind: 'human',
    id: 'keeper',
    x: 118,
    z: -56,
    route: [
      { x: 119, z: -58, wait: 12 },
      { x: 119, z: -34, wait: 8 },
      { x: 119, z: 50 },
      { x: 70, z: 58, wait: 14 },
      { x: 119, z: 50 },
      { x: 119, z: -34, wait: 6 }
    ]
  }
]

/** Every patrol route by predator id, and open spots a patroller wedged after a chase can walk back out through. */
export const ROUTES: Record<string, Waypoint[]> = Object.fromEntries(
  [...PREDATOR_STARTS, ...RIVER_CREATURES, ...PARK_CREATURES]
    .filter((entry) => entry.route)
    .map((entry) => [entry.id!, entry.route!])
)
export const HUBS: readonly Point[] = [
  { x: -122, z: 1 },
  { x: -103, z: 2 },
  { x: -88, z: 2 },
  { x: -76, z: 1 },
  { x: -64, z: 1 },
  { x: -118, z: -20 },
  { x: -102, z: -20 },
  { x: -90, z: -20 },
  { x: -76, z: -20 },
  { x: 6, z: -24 },
  { x: 6, z: 0 },
  { x: 8, z: 36 },
  { x: 40, z: 0 },
  { x: 80, z: -30 },
  { x: 100, z: 10 },
  { x: 100, z: 48 },
  { x: 116, z: 0 }
]

// ---------------------------------------------------------------- cover, food, zones
const reeds = (ax: number, az: number, bx: number, bz: number, r = 1.5): Capsule => ({ ax, az, bx, bz, r })
export const GRASS: Capsule[] = [
  reeds(-33.5, -42, -33.5, -27),
  reeds(-34, -17, -34, -6, 1.4),
  reeds(-41, 8, -41, 16, 1.3),
  reeds(-40, -36, -38, -24, 1.2),
  reeds(3, -31, 3, -14, 1.6),
  reeds(-16, -28, -16, -20, 1.4), // on the sandbar
  reeds(6, -10, 12, 4),
  reeds(2, 30, 14, 30, 1.2),
  reeds(3, 40, 3, 58, 1.4),
  // park: flower beds and long grass
  reeds(46, 40, 60, 40, 1.4),
  reeds(80, 36, 86, 40, 1.3),
  reeds(64, -36, 80, -36, 1.4),
  reeds(120, 10, 120, 24, 1.3),
  reeds(110, -48, 118, -48, 1.3)
]
export const BUSHES: Circle[] = [
  // sewer junk heaps
  { x: -120, z: 4.5, r: 1.4 },
  { x: -96, z: 4.5, r: 1.4 },
  { x: -110, z: -22.5, r: 1.4 },
  { x: -82, z: -17.5, r: 1.2 },
  { x: -95, z: -34, r: 1.5 },
  { x: -63, z: 4.5, r: 1.2 },
  { x: -66, z: -22.5, r: 1.4 },
  { x: -120, z: -23, r: 1.4 },
  // river
  { x: 9, z: 50, r: 2.2 },
  { x: -42, z: 30, r: 1.8 },
  // park shrubs
  ...[
    [36, 20],
    [36, -10],
    [48, -44],
    [62, 26],
    [84, -42],
    [86, 4],
    [100, -20],
    [120, -42],
    [120, -27],
    [110, -50],
    [70, 48],
    [118, 46],
    [56, 0]
  ].map(([x, z]) => ({ x, z, r: 2.3 }))
]
export const SHELTERS: Circle[] = [{ x: 106, z: 34, r: 2 }] // the playground's tunnel
const bench = (x: number, z: number, along: 'x' | 'z'): Overhang =>
  along === 'x'
    ? { minX: x - 4.5, maxX: x + 4.5, minZ: z - 1.3, maxZ: z + 1.3, bottom: 1.4 }
    : { minX: x - 1.3, maxX: x + 1.3, minZ: z - 4.5, maxZ: z + 4.5, bottom: 1.4 }
export const BENCHES: { x: number; z: number; along: 'x' | 'z' }[] = [
  { x: 60, z: -46, along: 'x' },
  { x: 94, z: -46, along: 'x' },
  { x: 110, z: -14, along: 'z' },
  { x: 46, z: 30, along: 'z' },
  { x: 80, z: 48, along: 'x' },
  { x: 64, z: 16, along: 'x' }
]
export const SLIDE: Rect = { minX: 98, maxX: 102, minZ: 22, maxZ: 26 }
export const OVERHANGS: Overhang[] = [
  { ...INLET, bottom: 1.4 },
  { ...PIPE, minX: PIPE.minX + 1, maxX: PIPE.maxX - 0.5, bottom: 2.5 }, // the outfall pipe's roof
  { minX: 18, maxX: 29, minZ: 32, maxZ: 38, bottom: 1.4 }, // culvert through the levee: rabbits only
  { minX: -116, maxX: -110, minZ: 3, maxZ: 5, bottom: 1 }, // fallen pipe sections
  { minX: -86, maxX: -80, minZ: -21, maxZ: -18.6, bottom: 1 },
  { minX: -64, maxX: -59, minZ: -3, maxZ: -0.6, bottom: 1 },
  { minX: 1, maxX: 17, minZ: BRIDGE.minZ, maxZ: BRIDGE.maxZ, bottom: 7 }, // under the bridge
  { minX: -44, maxX: -32, minZ: BRIDGE.minZ, maxZ: BRIDGE.maxZ, bottom: 7 },
  { ...SLIDE, bottom: 2.2 },
  ...BENCHES.map((entry) => bench(entry.x, entry.z, entry.along))
]
export const TREES: Blocker[] = [
  [34, -30],
  [44, 8],
  [52, 46],
  [66, -58],
  [88, -56],
  [98, 0],
  [104, -34],
  [84, 30],
  [122, -10],
  [122, 36],
  [76, 60],
  [36, 46]
].map(([x, z]) => ({ x, z, r: 0.6, top: 14, kind: 'tree' as const }))
/** The pines on the back hill beyond the fence. */
export const HILL_TREES: Blocker[] = [-56, -44, -22, -8, 6, 22, 40, 54].map((z) => ({
  x: 130,
  z,
  r: 0.5,
  top: heightOf(130, z) + 15,
  kind: 'tree'
}))
/** The swing frame's two posts. */
export const SWING_POSTS: readonly Point[] = [
  { x: 104, z: 20 },
  { x: 112, z: 20 }
]
const post = (x: number, z: number, r: number, top: number): Blocker => ({ x, z, r, top, kind: 'rock' })
/**
 * Props too thin or too small for the height grid, as posts: the valve posts, the worker's ladder and toolbox, the
 * outfall's concrete frame, the angler's bucket, the slide's legs and chute, the swing posts and the bench legs.
 */
const PROPS: Blocker[] = [
  post(SPOTS.valve.x, SPOTS.valve.z - 1.4, 0.45, 3),
  post(SPOTS.valve2.x + 1.4, SPOTS.valve2.z, 0.45, 3),
  post(-88.7, 17.6, 0.1, 8),
  post(-87.3, 17.6, 0.1, 8),
  post(-83.5, 16, 0.5, 0.8),
  post(-82.5, 16, 0.5, 0.8),
  post(-44.6, PIPE.minZ - 1, 0.7, 10),
  post(-44.6, PIPE.maxZ + 1, 0.7, 10),
  post(-36.2, 13.6, 0.45, 1),
  ...[-1.8, 1.8].flatMap((ox) =>
    [-1.8, 1.8].map((oz) => post((SLIDE.minX + SLIDE.maxX) / 2 + ox, (SLIDE.minZ + SLIDE.maxZ) / 2 + oz, 0.2, 5.6))
  ),
  ...[27, 29, 31].map((z) => post((SLIDE.minX + SLIDE.maxX) / 2, z, 1.2, 1)),
  ...SWING_POSTS.map(({ x, z }) => post(x, z, 0.2, 8)),
  ...BENCHES.flatMap(({ x, z, along }) =>
    [-4, 4].flatMap((end) =>
      [-0.8, 0, 0.8].map((across) =>
        along === 'x' ? post(x + end, z + across, 0.3, 1.5) : post(x + across, z + end, 0.3, 1.5)
      )
    )
  )
]

const food = (x: number, z: number, kind: FoodSpot['kind']): FoodSpot => ({
  x,
  z,
  y: heightOf(x, z),
  place: 'ground',
  kind
})
const FOODS: FoodSpot[] = [
  food(-126, -20, 'cabbage'),
  food(-108, -34, 'apple'),
  food(-94, 10, 'cabbage'),
  food(-122, 5, 'apple'),
  food(-40, -40, 'berry'),
  food(-40, 20, 'berry'),
  food(5, -32, 'clover'),
  food(12, 40, 'clover'),
  food(40, 30, 'clover'),
  food(56, 38, 'clover'),
  food(78, -36, 'clover'),
  food(96, 56, 'clover'),
  food(112, 8, 'clover'),
  food(66, 30, 'clover'),
  food(112, -28, 'clover')
]

export const ZONES: Zone[] = [
  { id: 'valve', name: '水門', minX: -76, maxX: -68, minZ: -24, maxZ: -18 },
  { id: 'valve2', name: '作業員の部屋', minX: -85, maxX: -80, minZ: 12, maxZ: 18 },
  { id: 'outfall', name: '排水口', minX: -50, maxX: -43, minZ: -2, maxZ: 4 },
  { id: 'eastbank', minX: 0, maxX: 10, minZ: -34, maxZ: -14 },
  { id: 'nest', name: 'ネズミの巣', minX: -108.5, maxX: -103.5, minZ: -36, maxZ: -30 },
  { id: 'parkgate', name: '土手の切れ目', minX: 18, maxX: 30, minZ: 31, maxZ: 39 },
  { id: 'net', name: '裏のフェンス', minX: 119, maxX: 124.5, minZ: -38, maxZ: -30 },
  { id: 'exit', name: '裏山', minX: 126, maxX: 132, minZ: -38, maxZ: -30 },
  {
    id: 'sandbar',
    name: '中州',
    minX: SANDBAR.minX - 1.2,
    maxX: SANDBAR.maxX + 1.2,
    minZ: SANDBAR.minZ - 1.2,
    maxZ: SANDBAR.maxZ + 1.2
  },
  { id: 'current', name: '飛び石', ...CURRENT },
  BEAM,
  // Moonlight through street grates: brighter patches in the dark sewer (× 1.3 on top of the darkness).
  { name: '月明かりの格子', light: 1.3, minX: -114, maxX: -106, minZ: -4, maxZ: 6 },
  { name: '月明かりの格子', light: 1.3, minX: -94, maxX: -86, minZ: -24, maxZ: 0 },
  { name: '月明かりの格子', light: 1.3, minX: -66, maxX: -58, minZ: -4, maxZ: 6 },
  { name: 'ネズミの巣', ...NEST_ROOM },
  { name: '作業員の部屋', ...WORKER_ROOM },
  { name: '橋の下', minX: 1, maxX: 17, minZ: BRIDGE.minZ, maxZ: BRIDGE.maxZ },
  {
    name: '池',
    minX: POND.x - POND.shore,
    maxX: POND.x + POND.shore,
    minZ: POND.z - POND.shore,
    maxZ: POND.z + POND.shore
  },
  { name: '遊び場', ...PLAYGROUND },
  { name: '下水道', light: 0.6, minX: WORLD.minX, maxX: -44.5, minZ: WORLD.minZ, maxZ: WORLD.maxZ },
  { name: '夜明けの川', light: 0.85, minX: -44.5, maxX: 18, minZ: WORLD.minZ, maxZ: WORLD.maxZ },
  { name: '朝の公園', minX: 18, maxX: WORLD.maxX, minZ: WORLD.minZ, maxZ: WORLD.maxZ }
]

/** Cross pipes under the channel: mole-tunnel corridors (crouch at an end to go in, jump to come out). */
const TUNNEL_NODES = [
  { x: -118, z: 1, exit: true },
  { x: -118, z: -10, exit: false },
  { x: -118, z: -21, exit: true },
  { x: -76, z: 1, exit: true },
  { x: -76, z: -10, exit: false },
  { x: -76, z: -21, exit: true }
]
const TUNNEL_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [3, 4],
  [4, 5]
]

let built: StageMap | undefined
export function buildMap(): StageMap {
  if (built) return built
  const ground = grid(WORLD, CELL)
  for (let j = 0; j < ground.nz; j++)
    for (let i = 0; i < ground.nx; i++)
      ground.heights[j * ground.nx + i] = heightOf(WORLD.minX + i * CELL, WORLD.minZ + j * CELL)
  built = {
    world: WORLD,
    cell: CELL,
    spawn: SPAWN,
    terrain: ground,
    foods: FOODS,
    nests: [],
    predatorStarts: PREDATOR_STARTS,
    grass: GRASS,
    bushes: BUSHES,
    trees: [...TREES, ...HILL_TREES],
    rocks: PROPS,
    logs: [],
    shelters: SHELTERS,
    caves: [],
    tunnelNodes: TUNNEL_NODES,
    tunnelEdges: TUNNEL_EDGES,
    overhangs: OVERHANGS,
    gates: [
      { ax: FLOODED.minX, az: FLOODED.minZ - 1.6, bx: FLOODED.minX, bz: FLOODED.maxZ + 0.5 }, // the flooded walkway and its shelf
      { ax: FENCE_X + 0.5, az: FENCE_HOLE.minZ - 0.5, bx: FENCE_X + 0.5, bz: FENCE_HOLE.maxZ + 0.5 } // the net
    ],
    npcs: [
      { id: 'gama', kind: 'toad', ...SPOTS.gama, angle: Math.PI },
      { id: 'genji', kind: 'turtle', ...SPOTS.genji, angle: -Math.PI / 2 }
    ],
    zones: ZONES,
    sand: (x, z) => inRect(x, z, SANDBOX),
    region: (x) => (x < -45 ? '下水道' : x < 18 ? '夜明けの川' : '朝の公園')
  }
  return built
}
