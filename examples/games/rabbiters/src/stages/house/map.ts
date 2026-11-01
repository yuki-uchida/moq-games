// Chapter 1 (house): Hinata's house and its garden at rabbit scale (people ≈ 6 tall, walls 7, no ceiling).
// North is −z. The living room with Mochi's cage, the dining room and kitchen, the washroom with Tama's cat
// flap, a hallway to the genkan, bath, washitsu (Tama's room) and Dad's study, and the garden behind the house
// with the chained dog and the gap under the fence. Walls and tall furniture are baked into the height grid
// (blocking movement and sight); low furniture is an overhang to crawl under. This file imports only ../kit and
// types (see map.ts); the script and scenery read the named layout below.
import type { Capsule, FoodSpot, Gate, Overhang, PredatorStart, StageMap, TunnelNode, Zone } from '../../map'
import { grid, type Circle, type Rect } from '../kit'

export const WORLD = { minX: -50, maxX: 50, minZ: -45, maxZ: 60 } as const
export const CELL = 0.25
export const WALL = 7
export const FENCE = 6
const r = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ })

/** Rooms (floor rects between wall centrelines) for names, floors and navigation. */
export const ROOMS = {
  living: r(-40, -4, -6, 24),
  dining: r(-4, 18, -6, 24),
  kitchen: r(18, 40, -6, 10),
  washroom: r(18, 40, 10, 24),
  hallway: r(-40, 18, -14, -6),
  genkan: r(-40, -20, -36, -14),
  bath: r(-20, -4, -36, -14),
  washitsu: r(-4, 18, -36, -14),
  study: r(18, 40, -36, -6),
  garden: r(-40, 40, 24, 56)
} as const
/** The genkan's earth floor, one step (0.3) below the house: rabbits hop down and back up. */
export const DOMA = r(-40, -20, -36, -26)
export const DOMA_DEPTH = -0.3 // any deeper reads as water (WATER_LEVEL −0.35)

/** Walls 0.5 thick (two grid cells, so sight lines can't slip through), height `h`. */
export const WALLS: (Rect & { h: number })[] = [
  // Outside of the house and the garden fence. The living room's big window is a low sill with a glass gate.
  { ...r(-40.5, 40.5, -36.5, -36), h: WALL },
  { ...r(-40.5, -40, -36.5, 24.5), h: WALL },
  { ...r(40, 40.5, -36.5, 24.5), h: WALL },
  { ...r(-40.5, -36, 24, 24.5), h: WALL },
  { ...r(-36, -14, 24, 24.5), h: 1 },
  { ...r(-14, 31, 24, 24.5), h: WALL },
  { ...r(33, 40.5, 24, 24.5), h: WALL },
  { ...r(-40.5, -40, 24.5, 56.5), h: FENCE },
  { ...r(40, 40.5, 24.5, 56.5), h: FENCE },
  { ...r(-40.5, -39.75, 56, 56.5), h: FENCE },
  { ...r(-36.75, 40.5, 56, 56.5), h: FENCE },
  // Hallway (south side): doors to the living and dining rooms.
  { ...r(-40, -14, -6.25, -5.75), h: WALL },
  { ...r(-10, 6, -6.25, -5.75), h: WALL },
  { ...r(10, 40, -6.25, -5.75), h: WALL },
  // Hallway (north side): the genkan opening, the bath door and the washitsu's fusuma.
  { ...r(-40, -36, -14.25, -13.75), h: WALL },
  { ...r(-26, -14, -14.25, -13.75), h: WALL },
  { ...r(-11, 2, -14.25, -13.75), h: WALL },
  { ...r(6, 18, -14.25, -13.75), h: WALL },
  // Living | dining (a wide opening), bath | washitsu, genkan | bath.
  { ...r(-4.25, -3.75, -6, 2), h: WALL },
  { ...r(-4.25, -3.75, 14, 24), h: WALL },
  { ...r(-4.25, -3.75, -36, -14), h: WALL },
  { ...r(-20.25, -19.75, -36, -14), h: WALL },
  // x = 18: washitsu | study, hallway | study (door), dining | kitchen (opening), dining | washroom.
  { ...r(17.75, 18.25, -36, -12), h: WALL },
  { ...r(17.75, 18.25, -8, 0), h: WALL },
  { ...r(17.75, 18.25, 8, 24), h: WALL },
  // Kitchen | washroom, with its door.
  { ...r(18, 20, 9.75, 10.25), h: WALL },
  { ...r(23, 40, 9.75, 10.25), h: WALL },
  // The washitsu's oshiire (closet) with its sliding door half open.
  { ...r(12, 13.5, -31.25, -30.75), h: WALL },
  { ...r(16.5, 18, -31.25, -30.75), h: WALL },
  { ...r(11.75, 12.25, -36, -31), h: WALL }
]

/** Mochi's cage: wire walls too tall to hop (jumps peak at ~2.8), door on the north face. */
export const CAGE = r(-33, -27, 16, 20)
export const CAGE_DOOR = { x: -30, z: 15.75 } as const
const CAGE_TOP = 3.2
/** Tall furniture baked into the height grid: blocks walking and sight. */
export const SOLIDS: (Rect & { h: number; name: string })[] = [
  { ...r(-33.5, -33, 15.5, 20.5), h: CAGE_TOP, name: 'cage' },
  { ...r(-27, -26.5, 15.5, 20.5), h: CAGE_TOP, name: 'cage' },
  { ...r(-33.5, -26.5, 20, 20.5), h: CAGE_TOP, name: 'cage' },
  { ...r(-33.5, -31.25, 15.5, 16), h: CAGE_TOP, name: 'cage' },
  { ...r(-28.75, -26.5, 15.5, 16), h: CAGE_TOP, name: 'cage' },
  { ...r(-26, -25, 17.5, 18.5), h: 3, name: 'birdstand' },
  { ...r(-38.5, -36, 2, 12), h: 2, name: 'tv' },
  { ...r(-10, -6, 16.5, 19.5), h: 2.4, name: 'toybox' },
  { ...r(37.5, 40, -6, 10), h: 3.2, name: 'counter' },
  { ...r(20, 23.2, -6, -3.6), h: 6.2, name: 'fridge' },
  { ...r(36.25, 39.75, 18.25, 21.75), h: 3.6, name: 'washer' },
  { ...r(18, 20.5, 13, 21), h: 3, name: 'vanity' },
  { ...r(-19.75, -12, -36, -29), h: 2.4, name: 'tub' },
  { ...r(-8, -6, -36, -33), h: 2, name: 'toilet' },
  { ...r(38, 40, -30, -16), h: 6, name: 'bookshelf' },
  { ...r(-4, 0, -36, -33.5), h: 4, name: 'tansu' },
  { ...r(-0.5, 4.5, 40.5, 45.5), h: 3.2, name: 'doghouse' }
]

/** Low furniture: rabbits crawl under (crouch when `bottom` < 1.3); people can't follow. */
export const FURNITURE: (Overhang & { name: string })[] = [
  { ...r(-24, -10, 2, 7.5), bottom: 0.9, name: 'sofa' },
  { ...r(-21, -13, 10, 15), bottom: 1.1, name: 'lowtable' },
  { ...r(2, 12, 6, 12), bottom: 2.6, name: 'dining' },
  ...[
    [4, 4.2],
    [10, 4.2],
    [4, 13.8],
    [10, 13.8]
  ].map(([x, z]) => ({ ...r(x - 0.95, x + 0.95, z - 0.95, z + 0.95), bottom: 1.45, name: 'chair' })),
  { ...r(29, 35, -5.75, -4.25), bottom: 1.2, name: 'pantry' },
  { ...r(-38, -30, -35.75, -33.25), bottom: 0.9, name: 'shoerack' },
  { ...r(-2.5, 1.5, -24, -20), bottom: 1.2, name: 'chabudai' },
  { ...r(30, 38, -35.75, -31.5), bottom: 2.3, name: 'desk' },
  { ...r(-38, -12, 24.5, 27.5), bottom: 1, name: 'engawa' },
  { ...r(-35, -25, 45, 51), bottom: 1, name: 'shed' },
  // Tama's cat flap and the gap under the fence: rabbit-sized holes in the wall.
  { ...r(31, 33, 23.75, 24.75), bottom: 1.4, name: 'catflap' },
  { ...r(-39.75, -36.75, 55.5, 57), bottom: 1, name: 'fencegap' }
]

export const GATE = { cage: 0, catflap: 1, window: 2, gap: 3 } as const
export const GATES: Gate[] = [
  { ax: -31.25, az: 15.75, bx: -28.75, bz: 15.75 }, // cage door (gnaw the latch)
  { ax: 31, az: 24.25, bx: 33, bz: 24.25 }, // cat flap (Tama's collar tag)
  { ax: -36, az: 24.25, bx: -14, bz: 24.25 }, // the living room window: glass, never opens
  { ax: -39.75, az: 55.9, bx: -36.75, bz: 55.9 } // the gap under the fence, until it is dug wider
]

/** Inside the cage counts as home: nobody minds a rabbit in its cage. */
export const SHELTERS: Circle[] = [
  { x: -31.8, z: 18, r: 2 },
  { x: -30, z: 18, r: 2 },
  { x: -28.2, z: 18, r: 2 },
  { x: 15, z: -33.6, r: 2.2 } // the oshiire
]
export const PELLETS = [
  { x: -32.2, z: 17.2 },
  { x: -30, z: 19.2 },
  { x: -27.8, z: 17.2 }
]
export const PISUKE = { x: -25.5, z: 18 } as const
export const TAMA = { x: 8, z: -28 } as const
export const NIBOSHI = { x: 32, z: -5.1 } as const
export const TAG = { x: -34, z: -34.5 } as const
export const CATFLAP = { x: 32, z: 22.6 } as const
export const EXIT = { x: -38.25, z: 58 } as const
export const GAP = { x: -38.25, z: 55.3 } as const
export const SPAWN = { x: -30, z: 18.4 } as const
/** Gon's chain is fixed in front of his house, in the middle of the lawn. */
export const GON_POST = { x: 2, z: 37.6 } as const
export const GON_LEASH = 7

export const ZONES: Zone[] = [
  { id: 'cage', name: 'ケージ', ...CAGE },
  { id: 'catflap', ...r(29.5, 34.5, 20.5, 23.9) },
  { id: 'exit', name: 'フェンスの外', ...r(-50, 50, 56.6, 60) },
  { id: 'dig', ...r(-40, -35.5, 53, 55.9) },
  { id: 'pantry', ...r(29, 35, -5.75, -3.2) },
  { name: '押し入れ', ...r(12, 18, -36, -31) },
  { name: '土間', ...DOMA },
  // Light: the sunny garden and the window side of the living room show a rabbit up; the inner rooms are dim.
  { light: 1.3, ...r(-40, 40, 24.5, 56) },
  { light: 1.15, ...r(-40, 18, 14, 24) },
  { light: 0.85, ...r(-40, 18, -36, -6) },
  { id: 'living', name: 'リビング', ...ROOMS.living },
  { id: 'dining', name: 'ダイニング', ...ROOMS.dining },
  { id: 'kitchen', name: '台所', ...ROOMS.kitchen },
  { id: 'washroom', name: '洗面所', ...ROOMS.washroom },
  { id: 'hallway', name: '廊下', ...ROOMS.hallway },
  { id: 'genkan', name: '玄関', ...ROOMS.genkan },
  { id: 'bath', name: 'お風呂', ...ROOMS.bath },
  { id: 'washitsu', name: '和室', ...ROOMS.washitsu },
  { id: 'study', name: 'お父さんの書斎', ...ROOMS.study },
  { id: 'garden', name: '庭', ...r(-40, 40, 24.5, 56) }
]

export const BUSHES: Circle[] = [
  { x: -37, z: 22.6, r: 1.4 }, // curtains
  { x: -13.2, z: 22.6, r: 1.4 },
  { x: -38, z: -3.5, r: 1.4 }, // houseplant
  { x: 34, z: 14, r: 1.8 }, // laundry basket
  { x: -23, z: -34.5, r: 1.2 }, // umbrella stand
  { x: -38.2, z: -10, r: 1.2 }, // coats on the hallway hooks
  { x: -6.5, z: -17, r: 1.2 }, // laundry hamper by the bath
  // Garden hedges and shrubs.
  { x: 37.6, z: 28.4, r: 1.7 },
  { x: 24, z: 44, r: 2.2 },
  { x: 32, z: 50, r: 2.2 },
  { x: -16, z: 44, r: 2.2 },
  { x: -12, z: 47, r: 2.2 },
  { x: 2, z: 53, r: 2 },
  { x: -36.5, z: 51, r: 1.8 }
]
export const GRASS_PATCHES: Capsule[] = [
  { ax: -26, az: 34, bx: -14, bz: 34, r: 1.3 }, // vegetable patch
  { ax: -26, az: 38, bx: -14, bz: 38, r: 1.3 },
  { ax: -9, az: 26.6, bx: 8, bz: 26.6, r: 1.1 }, // flower beds along the house
  { ax: 14, az: 26.6, bx: 29, bz: 26.6, r: 1.1 },
  { ax: -38.4, az: 31, bx: -38.4, bz: 44, r: 1.2 },
  { ax: -30, az: 54.6, bx: 0, bz: 54.6, r: 1.2 },
  { ax: 16, az: 54.6, bx: 38, bz: 54.6, r: 1.2 }
]

/** Mouse hole: behind the fridge, under the hallway, up into the oshiire. */
export const TUNNEL_NODES: TunnelNode[] = [
  { x: 24.6, z: -4.8, exit: true },
  { x: 24.6, z: -10, exit: false },
  { x: 15, z: -10, exit: false },
  { x: 15.6, z: -34.6, exit: true }
]
const TUNNEL_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3]
]

/** The family and the dog. Their schedules (routes) are driven by the script (family.ts). */
const STARTS: PredatorStart[] = [
  { kind: 'human', id: 'mom', x: 36, z: 2 },
  { kind: 'human', id: 'dad', x: 12, z: 2 },
  { kind: 'child', id: 'hinata', x: -24, z: 12 },
  { kind: 'dog', id: 'gon', x: GON_POST.x, z: GON_POST.z, leash: GON_LEASH }
]

let built: StageMap | undefined
export function buildMap(): StageMap {
  if (built) return built
  const ground = grid(WORLD, CELL)
  ground.set(DOMA, DOMA_DEPTH)
  for (const wall of WALLS) ground.raise(wall, wall.h)
  for (const solid of SOLIDS) ground.raise(solid, solid.h)
  const food = (x: number, z: number, kind: FoodSpot['kind']): FoodSpot => ({ x, z, y: 0, place: 'ground', kind })
  built = {
    world: WORLD,
    cell: CELL,
    spawn: SPAWN,
    terrain: ground,
    foods: [
      ...PELLETS.map(({ x, z }) => food(x, z, 'berry')), // the morning pellets (first three, see script)
      food(29.8, -5, 'cabbage'), // vegetable scraps by the pantry
      food(34.4, -5, 'carrot'),
      food(7, 9, 'apple'), // a slice Hinata dropped under the table
      food(-24, 36, 'carrot'), // the vegetable patch
      food(-19, 36, 'cabbage'),
      food(-16, 38.2, 'carrot'),
      food(-22, 33.8, 'clover')
    ],
    nests: [],
    predatorStarts: STARTS,
    grass: GRASS_PATCHES,
    bushes: BUSHES,
    trees: [],
    rocks: [],
    logs: [],
    shelters: SHELTERS,
    caves: [],
    tunnelNodes: TUNNEL_NODES,
    tunnelEdges: TUNNEL_EDGES,
    overhangs: FURNITURE,
    gates: GATES,
    npcs: [
      { id: 'pisuke', kind: 'parakeet', ...PISUKE, angle: -Math.PI / 2 },
      { id: 'tama', kind: 'cat', ...TAMA, angle: 0.4 }
    ],
    zones: ZONES,
    region: () => 'ひなたの家'
  }
  return built
}
