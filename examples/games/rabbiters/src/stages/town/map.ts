// Chapter 2 (town): 320 × 160 m, west → east. The back alleys behind Hinata's house (stray cats, the garbage
// point with Ponta and the crows), the main road (two lanes of traffic, parked cars, storm-drain pipes), the
// shopping street (shoppers and children), a quiet side street, the shrine (Poppo, a raised floor to shelter
// under) and the night embankment above the river, where the drain under the bank leads on to chapter 3.
// Buildings are the height grid raised to roof level; open ground is carved out of it. North is −z.
import type { Blocker, Capsule, Circle, FoodSpot, Lane, Npc, Overhang, PredatorStart, StageMap, Zone } from '../../map'
import { grid, type Rect } from '../kit'

export const WORLD = { minX: -160, maxX: 160, minZ: -80, maxZ: 80 } as const
export const SPAWN = { x: -148, z: 0 } as const
const ROOF = 7 // houses and shops: far above a rabbit's jump, so blocks are walls
const STONE = 3.2 // shrine walls and fences: just out of jumping reach
export const LEVEE = 4

const rect = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ })

/** Open ground carved out of the building mass, with its floor height. */
const OPEN: [Rect, number][] = [
  // Back alleys: a yard outside the garden fence and a grid of narrow lanes.
  [rect(-157, -132, -14, 14), 0], // yard
  [rect(-132, -84, -3, 3), 0], // middle lane, a dead end where the cats sun themselves
  [rect(-141, -80, -34, -28), 0], // north lane
  [rect(-141, -96, 26, 32), 0], // south lane
  [rect(-121.5, -116.5, 32, 37), 0], // the tanuki den, a gap between two houses
  [rect(-141, -135, -34, 32), 0], // west cross lane
  [rect(-130, -125, -34, 32), 0], // cross lane A
  [rect(-104, -99, -34, 32), 0], // cross lane B
  [rect(-96, -78, -47, -34), 0], // garbage point
  [rect(-78, -72, -43, -36), 0], // out to the main road
  // Main road (cars drive north–south): sidewalks, a parking bay and two lanes.
  [rect(-72, -66, -80, 80), 0.3],
  [rect(-66, -39, -80, 80), 0],
  [rect(-39, -32, -80, 80), 0.3],
  // Shopping street with shop-front alcoves.
  [rect(-32, 42, -9, 9), 0.1],
  [rect(-16, -2, -14, -9), 0.1], // greengrocer
  [rect(8, 18, -13, -9), 0.1], // pet shop
  [rect(-24, -14, 9, 13), 0.1], // tobacconist
  [rect(22, 32, 9, 14), 0.1], // bakery
  // Side street, then the shrine grounds.
  [rect(42, 62, -80, 80), 0],
  [rect(62, 114, -33, 33), 0],
  // Night embankment: a strip at the foot, the levee and the riverside path.
  [rect(114, 160, -80, 80), 0]
]

// Japan drives on the left: southbound (+z) traffic keeps to the east lane.
export const LANE_X = { south: -44, north: -54, sideSouth: 56.5, sideNorth: 47.5, levee: 136 } as const
export const PARKED: readonly Rect[] = [-40, -12, 22, 50].map((z) => rect(-65.75, -59.25, z - 8, z + 8))
export const SHRINE_FLOOR: Overhang = { ...rect(92, 106, -8, 8), bottom: 1.6 }
export const SHRINE_HALL = { x: 99, z: 0 } as const
export const GARBAGE_CAGE = rect(-86, -79, -47, -44.5)
export const DRAINS = { z: [-39, 40], west: -69, east: -35 } as const
/** The drain under the bank: a concrete mouth in the river-side slope. */
export const DRAIN_MOUTH = rect(144, 151, -67, -60)
/** The rusty grate across the drain mouth: a gate that opens once its wire is gnawed through. */
export const GRATE = { ax: 148.4, az: -67.5, bx: 148.4, bz: -59.5 } as const
/**
 * The concrete box behind the grate, as gates that never open (their bits stay clear): nobody drops into the drain
 * from the levee above.
 */
const DRAIN_BOX = [
  { ax: 143.8, az: -67.5, bx: 143.8, bz: -59.5 },
  { ax: 143.8, az: -67.5, bx: 148.4, bz: -67.5 },
  { ax: 143.8, az: -59.5, bx: 148.4, bz: -59.5 }
]
export const PONTA = { x: -91, z: -44 } as const
/** Ponta's kits wait at the dead end of the south lane; the cabbage half lies in front of the net. */
export const KITS = { x: -119, z: 34.5 } as const
export const CABBAGE = { x: -82.5, z: -41.6 } as const
/** Kurumi the golden hamster, in her cage in the pet-shop window (the id picks her colour). */
export const KURUMI = { x: 13, z: -11.5 } as const
export const POPPO = { x: 87, z: -7 } as const
export const BREAD = { x: 27, z: 12 } as const // at the bakery, near the shrine end of the street
/** Flower planters down the middle of the shopping street (x of each). */
export const PLANTERS = [-24, -14, -4, 6, 16, 26, 35]
export const VENDING: readonly Rect[] = [
  rect(2.25, 4.75, -9, -7.5),
  rect(20.25, 22.75, -9, -7.5),
  rect(-12.75, -10.25, 7.5, 9)
]

/** Bins and planters (solid, low), vending machines (solid, tall). */
const SOLIDS: [Rect, number][] = [
  [GARBAGE_CAGE, 2.6],
  // Alley bins and flowerpots.
  [rect(-121, -119.5, -2.8, -1.3), 2.2],
  [rect(-110, -108.5, 1.3, 2.8), 2.2],
  [rect(-140.8, -139.3, 20, 21.5), 2.2],
  [rect(-103.8, -102.3, -20, -18.5), 0.6],
  [rect(-129.8, -128.3, 12, 13.5), 0.6],
  // Shopping street: planters down the middle, vending machines at the shop fronts.
  ...PLANTERS.map((x): [Rect, number] => [rect(x - 2, x + 2, -1, 1), 0.9]),
  ...VENDING.map((area): [Rect, number] => [area, 6]),
  // Greengrocer crates.
  [rect(-14, -10, -13.5, -12), 1.2],
  [rect(-8, -4, -13.5, -12), 1.2],
  // Shrine: offering box, the hall steps.
  [rect(89, 91, -1.2, 1.2), 1.4],
  // Town-side fence at the foot of the levee: the way north is over the bank.
  [rect(114, 122, -31, -30), STONE]
]

function terrain() {
  const ground = grid(WORLD, 1, ROOF)
  for (const [area, height] of OPEN) ground.set(area, height)
  // Shrine stone walls with the torii gap (west) and the back gate (east).
  ground.raise(rect(62, 64, -33, -6), STONE)
  ground.raise(rect(62, 64, 6, 33), STONE)
  ground.raise(rect(62, 114, -33, -32), STONE)
  ground.raise(rect(62, 114, 32, 33), STONE)
  ground.raise(rect(112, 114, -33, 16), STONE)
  ground.raise(rect(112, 114, 24, 33), STONE)
  // The levee: gentle grass slopes up to a road on top and down to the riverside path; the river beyond.
  for (let x = 122; x <= 160; x++) {
    const height =
      x <= 130
        ? ((x - 122) / 8) * LEVEE
        : x <= 142
          ? LEVEE
          : x <= 150
            ? ((150 - x) / 8) * LEVEE
            : x <= 154
              ? 0
              : Math.max(-1.3, -(x - 154) * 0.3)
    ground.set(rect(x, x, WORLD.minZ, WORLD.maxZ), height)
  }
  ground.set(DRAIN_MOUTH, 0) // cut into the bank
  ground.raise(rect(144, 151, -68, -67), LEVEE) // headwall sides
  ground.raise(rect(144, 151, -60, -59), LEVEE)
  // Hinata's garden fence along the west edge.
  ground.raise(rect(-160, -157, -14, 14), 4)
  for (const [area, height] of SOLIDS) ground.raise(area, height)
  return ground
}

const food = (kind: FoodSpot['kind'], x: number, z: number): FoodSpot => ({ x, z, y: 0, place: 'ground', kind })
// A long stealth chapter needs many meals: weeds in the alleys, vegetables fallen under the shop stands,
// shrine grass, the offering, clover on the bank.
const FOODS: FoodSpot[] = [
  food('dandelion', -150, 8),
  food('clover', -145, -9),
  food('dandelion', -136, -22),
  food('clover', -133, -31),
  food('dandelion', -138, 24),
  food('clover', -127, 28),
  food('dandelion', -127.5, 18),
  food('dandelion', -101, 12),
  food('clover', -101.5, -12),
  food('dandelion', -112, 30.5),
  food('cabbage', -93, -38),
  food('cabbage', -90, -36),
  food('clover', -68.5, -51),
  food('carrot', -28, -7.8),
  food('cabbage', -12, -10.5),
  food('carrot', -6, -10.5),
  food('cabbage', -10, -7.8),
  food('carrot', 17, -7.8),
  food('cabbage', 35, -7.8),
  food('carrot', -25, 7.8),
  food('cabbage', 2, 7.8),
  food('carrot', 20, 7.8),
  food('apple', 88, -3.5), // an offering by the shrine's box
  food('clover', 70, -20),
  food('clover', 100, -24),
  food('clover', 95, 24),
  food('dandelion', 117, 40),
  food('clover', 125, 2),
  food('clover', 147, 30),
  food('dandelion', 152, -30),
  food('clover', 150, -48)
]

const cat = (id: string, route: [number, number, number?][]): PredatorStart => ({
  kind: 'cat',
  id,
  x: route[0][0],
  z: route[0][1],
  route: route.map(([x, z, wait]) => ({ x, z, wait }))
})
const walker = (kind: 'human' | 'child', id: string, route: [number, number, number?][]): PredatorStart => ({
  ...cat(id, route),
  kind
})

/** Enemies present from the start (evening). Night-only walkers are spawned by the script. */
const PREDATORS: PredatorStart[] = [
  // Tora's gang: the boss suns himself in the middle lane, the other two walk the south and north-west lanes.
  cat('tora', [
    [-88, 0, 12],
    [-114, 0, 5],
    [-127.5, 0, 3],
    [-110, 0, 4]
  ]),
  cat('tora-a', [
    [-138, 29, 6],
    [-127.5, 29, 1],
    [-127.5, 12, 4],
    [-127.5, 29, 1],
    [-110, 29, 6]
  ]),
  cat('tora-b', [
    [-132, -31, 6],
    [-138, -31, 1],
    [-138, -20, 3],
    [-138, -31, 1],
    [-115, -31, 5]
  ]),
  // Crows: they keep coming back to the garbage, but also roam the roofs, so there are quiet spells to wait for.
  {
    ...cat('crow-1', [
      [-86, -40, 25],
      [-118, -16, 12],
      [-140, 18, 8],
      [-104, 6, 6]
    ]),
    kind: 'crow'
  },
  {
    ...cat('crow-2', [
      [-120, -30, 10],
      [-86, -38, 18],
      [-60, -20, 10],
      [-100, 20, 12]
    ]),
    kind: 'crow'
  },
  // Main road: one person on each sidewalk.
  walker('human', 'passer-w', [
    [-69, -74, 4],
    [-69, 74, 4]
  ]),
  walker('human', 'passer-e', [
    [-35.5, 72, 3],
    [-35.5, -74, 5]
  ]),
  // Shopping street: a shopper and a child in each half.
  walker('human', 'shopper-1', [
    [-20, -5, 3],
    [4, -5, 4],
    [4, 5, 2],
    [-20, 5, 4]
  ]),
  walker('human', 'shopper-2', [
    [34, 4, 4],
    [14, 5, 3],
    [14, -5, 2],
    [34, -5, 4]
  ]),
  walker('child', 'kid-1', [
    [-14, 5, 3],
    [2, 6, 2],
    [-6, -2, 3]
  ]),
  walker('child', 'kid-2', [
    [12, -4, 3],
    [0, 4, 2],
    [18, 2, 3]
  ]),
  // The shrine keeper sweeps the approach and looks round the hall.
  walker('human', 'keeper', [
    [78, 2, 5],
    [86, 2, 6],
    [86, 10, 3],
    [78, 10, 4]
  ])
]

/**
 * Where each person stays: they chase a rabbit only as far as their sidewalk, street or grounds (people do not
 * squeeze into the back alleys), so a rabbit can always break away. Night walkers keep to the riverside.
 */
export const BEATS: Record<string, Rect> = {
  'passer-w': rect(-71.5, -66.5, -79, 79),
  'passer-e': rect(-38.5, -32.5, -79, 79),
  'shopper-1': rect(-31, 41, -13, 13),
  'shopper-2': rect(-31, 41, -13, 13),
  'kid-1': rect(-31, 41, -13, 13),
  'kid-2': rect(-31, 41, -13, 13),
  keeper: rect(64, 111, -31, 31),
  walker: rect(140, 154, -70, 70)
}

/** The dog walker on the riverside path at night: the person walks the route, the dog keeps to the leash. */
export const NIGHT_WALK: [number, number, number?][] = [
  [152, 64, 6],
  [152, 20],
  [146, 4, 3],
  [152, -12],
  [152, -54, 6],
  [152, -12],
  [146, 4, 3],
  [152, 20]
]

const tree = (x: number, z: number, top = 13): Blocker => ({ x, z, r: 0.55, top, kind: 'tree' })
const TREES: Blocker[] = [
  ...[
    [70, -26],
    [76, -14],
    [84, -27],
    [92, -18],
    [104, -26],
    [108, -16],
    [70, 24],
    [78, 14],
    [86, 26],
    [96, 20],
    [106, 27]
  ].map(([x, z]) => tree(x, z)),
  ...[-60, -20, 20, 56].map((z) => tree(118, z, 10))
]
/** Torii pillars, stone lanterns, guardian dogs, utility poles and streetlights: thin, sight-blocking posts. */
export const POSTS: Blocker[] = [
  ...[
    [66, -4.5, 9],
    [66, 4.5, 9],
    [74, -5, 2.2],
    [74, 5, 2.2],
    [82, -4, 3],
    [82, 4, 3]
  ].map(([x, z, top]): Blocker => ({ x, z, r: x === 74 ? 0.9 : 0.5, top, kind: 'rock' })),
  ...[
    [-136, -30],
    [-117, 2.6],
    [-100.5, 25],
    [-89, -34.5],
    [-71.5, -60],
    [-71.5, 0],
    [-71.5, 60],
    [-32.5, -40],
    [-32.5, 30],
    [61.5, -20],
    [61.5, 20]
  ].map(([x, z]): Blocker => ({ x, z, r: 0.35, top: 11, kind: 'rock' }))
]
/** Riverside and levee-foot streetlights (posts) and their pools of light. */
export const LAMPS: readonly { x: number; z: number }[] = [
  { x: 153.5, z: 46 },
  { x: 153.5, z: 6 },
  { x: 153.5, z: -36 },
  { x: 120.5, z: 30 },
  { x: 120.5, z: -6 }
]
POSTS.push(...LAMPS.map(({ x, z }): Blocker => ({ x, z, r: 0.3, top: 9, kind: 'rock' })))

/** Cardboard and polybuckets (bushes): crouch beside them and nobody sees you. */
const BUSHES: Circle[] = [
  { x: -151, z: -10, r: 1.4 },
  { x: -138, z: -12.5, r: 1.3 },
  { x: -110, z: 30.5, r: 1.2 },
  { x: -137.5, z: 6, r: 1.3 },
  { x: -116, z: -1.5, r: 1.2 },
  { x: -86, z: 1.5, r: 1.3 },
  { x: -127.5, z: -18, r: 1.2 },
  { x: -101.5, z: 18, r: 1.2 },
  { x: -120, z: 29.5, r: 1.2 },
  { x: -115, z: -31.5, r: 1.2 },
  { x: -94, z: -45, r: 1.4 },
  { x: -94, z: -40, r: 1.2 }, // garbage bags
  { x: -80, z: -36, r: 1.2 },
  { x: -68.5, z: -48, r: 1.1 }, // sidewalk bin
  { x: -35.5, z: 20, r: 1.1 },
  { x: 76, z: -20, r: 2 }, // shrine grove shrubs
  { x: 90, z: -24, r: 2 },
  { x: 104, z: -20, r: 1.8 },
  { x: 74, z: 20, r: 2 },
  { x: 92, z: 24, r: 1.8 },
  { x: 108, z: 22, r: 1.8 },
  { x: 116, z: 10, r: 1.5 },
  { x: 116, z: -46, r: 1.5 }
]
/** Flowers in the planters, weeds along walls, reeds and tall grass on the bank. */
const GRASS: Capsule[] = [
  ...PLANTERS.map((x): Capsule => ({ ax: x - 1.2, az: 0, bx: x + 1.2, bz: 0, r: 1 })),
  { ax: -155, az: 12, bx: -140, bz: 12, r: 1.4 },
  { ax: -140, az: 31, bx: -131, bz: 31, r: 1 },
  { ax: 140, az: 70, bx: 140, bz: 50, r: 2.4 },
  { ax: 145, az: 30, bx: 145, bz: 14, r: 2.4 },
  { ax: 145, az: -6, bx: 145, bz: -24, r: 2.4 },
  { ax: 145, az: -42, bx: 145, bz: -56, r: 2.4 },
  { ax: 125, az: 50, bx: 125, bz: 70, r: 2.2 },
  { ax: 125, az: -40, bx: 125, bz: -60, r: 2.2 },
  { ax: 156, az: 70, bx: 156, bz: -76, r: 1.6 } // reeds on the river edge
]
/** Shop-front display stands along both facades, with gaps between shops: rabbits slip underneath, people walk by. */
export const DISPLAYS: Overhang[] = [
  ...[-31, -22, -13, -4, 5, 14, 23, 32].map((x): Overhang => ({ ...rect(x, x + 6, -9, -6.6), bottom: 1.4 })),
  ...[-28, -19, -10, -1, 8, 17, 26, 35].map((x): Overhang => ({ ...rect(x, x + 6, 6.6, 9), bottom: 1.4 }))
]
/** The bus-stop bench and the pet-shop stand in front of Kurumi's cage: rabbits stand under, people walk round. */
export const STANDS: Overhang[] = [
  { ...rect(-34, -32.4, -24, -18), bottom: 1.5 },
  { ...rect(10.5, 15.5, -11, -9.4), bottom: 1.4 }
]
export const OVERHANGS: Overhang[] = [
  ...PARKED.map((area) => ({ ...area, bottom: 0.9 })),
  ...DISPLAYS,
  ...STANDS,
  SHRINE_FLOOR,
  { ...rect(-90, -79, -44.5, -42.5), bottom: 1.6 }, // the net cage's lid: crows overhead cannot see under it
  { ...rect(144.5, 150.5, -66.5, -62.5), bottom: 1.4 } // inside the drain mouth
]

const lane = (x: number, direction: 1 | -1, speed: number, cars: [number, string][]): Lane => ({
  points: [
    { x, z: -130 * direction },
    { x, z: 130 * direction }
  ],
  speed,
  cars: cars.map(([offset, color]) => ({ offset, color }))
})
// Platoons of three or four with a readable gap after each; the two directions are out of step.
const LANES: Lane[] = [
  lane(LANE_X.south, 1, 12, [
    [0, '#d9473a'],
    [21, '#e8e4dc'],
    [42, '#2d4f8a'],
    [130, '#3a3a3a'],
    [151, '#e0b23a'],
    [172, '#e8e4dc']
  ]),
  lane(LANE_X.north, -1, 13, [
    [30, '#3a6fd9'],
    [51, '#8c8c8c'],
    [72, '#e8e4dc'],
    [93, '#5a7a4a'],
    [190, '#d9473a'],
    [211, '#2b2b2b']
  ]),
  lane(LANE_X.sideSouth, 1, 9, [
    [0, '#e8e4dc'],
    [120, '#c46a2a']
  ]),
  lane(LANE_X.sideNorth, -1, 9, [[60, '#4a6fa0']]),
  lane(LANE_X.levee, -1, 11, [
    [0, '#e8e4dc'],
    [140, '#3a3a3a']
  ])
]

const NPCS: Npc[] = [
  { id: 'ponta', kind: 'tanuki', x: PONTA.x, z: PONTA.z, angle: 0.6 },
  { id: 'kits', kind: 'tanuki', x: KITS.x, z: KITS.z, angle: Math.PI },
  { id: 'kurumi', kind: 'rat', x: KURUMI.x, z: KURUMI.z, angle: 0 },
  { id: 'poppo', kind: 'pigeon', x: POPPO.x, z: POPPO.z, angle: -1.4 }
]

const ZONES: Zone[] = [
  // Triggers.
  { id: 'garbage', ...rect(-96, -78, -47, -34) },
  { id: 'net', ...rect(-86, -79, -44.5, -41) },
  { id: 'road', ...rect(-72, -66, -80, 80) },
  { id: 'crossed', ...rect(-39, -26, -80, 80) },
  { id: 'street-end', ...rect(32, 42, -9, 9) },
  { id: 'bank', ...rect(114, 160, -80, 80) },
  { id: 'grate', ...rect(148.6, 151.5, -66, -61) },
  { id: 'exit', ...rect(144.5, 148, -66, -62.5) },
  // Light: streetlights make a rabbit easier to see, the grove and the riverside between lamps are dark.
  ...LAMPS.map(({ x, z }): Zone => ({ light: 1.3, ...rect(x - 5, x + 5, z - 5, z + 5) })),
  { light: 0.6, ...rect(64, 112, -32, -12) },
  { light: 0.6, ...rect(64, 112, 12, 32) },
  { light: 0.6, ...rect(143, 160, 12, 40) },
  { light: 0.6, ...rect(143, 160, -30, 0) },
  { light: 0.6, ...rect(143, 160, -80, -42) },
  // Region names (first match wins).
  { name: '土手の下の入口', ...DRAIN_MOUTH },
  { name: 'ゴミ置き場', ...rect(-96, -72, -47, -34) },
  { name: '大通り', ...rect(-72, -32, -80, 80) },
  { name: '商店街', ...rect(-32, 42, -14, 14) },
  { name: '裏通り', ...rect(42, 62, -80, 80) },
  { name: '神社', ...rect(62, 114, -33, 33) },
  { name: '夜の土手', ...rect(114, 160, -80, 80) },
  { name: '裏路地', ...WORLD }
]

let built: StageMap | undefined
export function buildMap(): StageMap {
  if (built) return built
  const ground = terrain()
  return (built = {
    world: WORLD,
    cell: 1,
    spawn: SPAWN,
    terrain: ground,
    foods: FOODS.map((spot) => ({ ...spot, y: ground.heightAt(spot.x, spot.z) })),
    nests: [],
    predatorStarts: PREDATORS,
    grass: GRASS,
    bushes: BUSHES,
    trees: TREES,
    rocks: POSTS,
    logs: [],
    shelters: [{ x: SHRINE_HALL.x, z: SHRINE_HALL.z, r: 4.5 }], // under the shrine's raised floor
    caves: [],
    tunnelNodes: DRAINS.z.flatMap((z) => [
      { x: DRAINS.west, z, exit: true },
      { x: DRAINS.east, z, exit: true }
    ]),
    tunnelEdges: [
      [0, 1],
      [2, 3]
    ],
    overhangs: OVERHANGS,
    gates: [GRATE, ...DRAIN_BOX],
    lanes: LANES,
    npcs: NPCS,
    zones: ZONES
  })
}
