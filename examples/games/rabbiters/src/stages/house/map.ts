// PLACEHOLDER for chapter 1 (house): one room, a table and a sofa to hide under, Mom on her rounds,
// Pisuke on a shelf and the front door as the exit. The chapter-1 author replaces this folder.
import type { FoodSpot, StageMap } from '../../map'
import { grid } from '../kit'

const WORLD = { minX: -20, maxX: 20, minZ: -15, maxZ: 15 }
const WALL = 7

let built: StageMap | undefined
export function buildMap(): StageMap {
  if (built) return built
  const ground = grid(WORLD, 0.5)
  // Walls round the room, with the front door gap on the east side.
  ground.raise({ minX: -20, maxX: -18.5, minZ: -15, maxZ: 15 }, WALL)
  ground.raise({ minX: 18.5, maxX: 20, minZ: -15, maxZ: -2.5 }, WALL)
  ground.raise({ minX: 18.5, maxX: 20, minZ: 2.5, maxZ: 15 }, WALL)
  ground.raise({ minX: -20, maxX: 20, minZ: -15, maxZ: -13.5 }, WALL)
  ground.raise({ minX: -20, maxX: 20, minZ: 13.5, maxZ: 15 }, WALL)
  const food = (x: number, z: number): FoodSpot => ({ x, z, y: 0, place: 'ground', kind: 'carrot' })
  built = {
    world: WORLD,
    cell: 0.5,
    spawn: { x: -14, z: 8 },
    terrain: ground,
    foods: [food(-12, 9), food(-15, 6), food(-11, 5)],
    nests: [],
    predatorStarts: [
      {
        kind: 'human',
        id: 'mom',
        x: 10,
        z: -9,
        route: [
          { x: 10, z: -9, wait: 6 },
          { x: -10, z: -9 },
          { x: -10, z: -6, wait: 4 },
          { x: 10, z: -6 }
        ]
      }
    ],
    grass: [{ ax: -16, az: 12, bx: 0, bz: 12, r: 1.2 }], // curtains
    bushes: [],
    trees: [],
    rocks: [],
    logs: [],
    shelters: [],
    caves: [],
    tunnelNodes: [],
    tunnelEdges: [],
    overhangs: [
      { minX: -4, maxX: 4, minZ: -2, maxZ: 3, bottom: 2.5 }, // table
      { minX: 7, maxX: 14, minZ: 7, maxZ: 11, bottom: 1 } // sofa
    ],
    npcs: [{ id: 'pisuke', kind: 'parakeet', x: -15, z: -10, angle: 0.6 }],
    zones: [
      { id: 'exit', name: '玄関', minX: 16, maxX: 19.5, minZ: -2.5, maxZ: 2.5 },
      { name: 'リビング', minX: -20, maxX: 20, minZ: -15, maxZ: 15 }
    ]
  }
  return built
}
