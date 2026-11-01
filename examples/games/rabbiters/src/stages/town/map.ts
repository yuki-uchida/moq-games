// PLACEHOLDER for chapter 2 (town): a back lane, one road with traffic, a parked car to hide under, a stray
// cat, Poppo the pigeon and the riverbank drain as the exit. The chapter-2 author replaces this folder.
import type { FoodSpot, StageMap } from '../../map'
import { grid } from '../kit'

const WORLD = { minX: -40, maxX: 40, minZ: -15, maxZ: 15 }

let built: StageMap | undefined
export function buildMap(): StageMap {
  if (built) return built
  const ground = grid(WORLD, 1)
  // Block walls along both sides of the lane.
  ground.raise({ minX: -40, maxX: 40, minZ: -15, maxZ: -13 }, 4)
  ground.raise({ minX: -40, maxX: 40, minZ: 13, maxZ: 15 }, 4)
  const food = (x: number, z: number): FoodSpot => ({ x, z, y: 0, place: 'ground', kind: 'cabbage' })
  built = {
    world: WORLD,
    cell: 1,
    spawn: { x: -34, z: 0 },
    terrain: ground,
    foods: [food(-28, 8), food(16, -9), food(30, 9)],
    nests: [],
    predatorStarts: [
      {
        kind: 'cat',
        id: 'tora',
        x: -18,
        z: -8,
        route: [
          { x: -18, z: -8, wait: 5 },
          { x: -24, z: 8, wait: 3 }
        ]
      }
    ],
    grass: [],
    bushes: [{ x: -26, z: -9, r: 1.6 }], // a stack of cardboard boxes
    trees: [],
    rocks: [],
    logs: [],
    shelters: [],
    caves: [],
    tunnelNodes: [],
    tunnelEdges: [],
    overhangs: [{ minX: 10, maxX: 26, minZ: 5, maxZ: 11.5, bottom: 0.9 }], // parked car
    lanes: [
      {
        points: [
          { x: -1.5, z: -50 },
          { x: -1.5, z: 50 }
        ],
        speed: 9,
        cars: [
          { offset: 0, color: '#d9473a' },
          { offset: 50, color: '#3a6fd9' }
        ]
      }
    ],
    npcs: [{ id: 'poppo', kind: 'pigeon', x: 28, z: -8, angle: -1.2 }],
    zones: [
      { id: 'exit', name: '土手の下', minX: 35, maxX: 39, minZ: -3, maxZ: 3 },
      { name: '大通り', minX: -6, maxX: 3, minZ: -15, maxZ: 15 },
      { light: 1.3, minX: 16, maxX: 22, minZ: -6, maxZ: 0 }, // under a streetlight
      { name: '裏路地', minX: -40, maxX: 40, minZ: -15, maxZ: 15 }
    ]
  }
  return built
}
