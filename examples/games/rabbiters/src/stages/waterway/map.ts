// PLACEHOLDER for chapter 3 (waterway): a dark sewer cut by a deep channel with a crossing. A floodgate closes
// the way until the valve opens it; Genji the turtle waits on the far side by the outfall (the exit).
// The chapter-3 author replaces this folder.
import type { FoodSpot, StageMap } from '../../map'
import { grid } from '../kit'

const WORLD = { minX: -40, maxX: 40, minZ: -15, maxZ: 15 }

let built: StageMap | undefined
export function buildMap(): StageMap {
  if (built) return built
  const ground = grid(WORLD, 0.5)
  ground.raise({ minX: -40, maxX: 40, minZ: -15, maxZ: -11 }, 6)
  ground.raise({ minX: -40, maxX: 40, minZ: 11, maxZ: 15 }, 6)
  // The channel, with banks gentle enough to stand on, and a raised crossing in the middle. Steep banks next to
  // deep water would leave a rabbit sliding against water it may not enter.
  for (let j = 0; j < ground.nz; j++)
    for (let i = 0; i < ground.nx; i++) {
      const x = WORLD.minX + i * 0.5
      const z = WORLD.minZ + j * 0.5
      const channel = Math.min(1, Math.max(0, (4 - Math.abs(x)) / 2)) * 1.6
      const crossing = Math.min(1, Math.max(0, (3.5 - Math.abs(z)) / 2))
      if (Math.abs(z) < 11) ground.heights[j * ground.nx + i] = -channel * (1 - crossing)
    }
  const food = (x: number, z: number): FoodSpot => ({ x, z, y: 0, place: 'ground', kind: 'clover' })
  built = {
    world: WORLD,
    cell: 0.5,
    spawn: { x: -34, z: 0 },
    terrain: ground,
    foods: [food(-20, 6), food(18, -6)],
    nests: [],
    predatorStarts: [
      {
        kind: 'rat',
        id: 'rat-0',
        x: 20,
        z: 6,
        route: [
          { x: 20, z: 6, wait: 4 },
          { x: 30, z: -6, wait: 4 }
        ]
      }
    ],
    grass: [],
    bushes: [],
    trees: [],
    rocks: [],
    logs: [],
    shelters: [],
    caves: [],
    tunnelNodes: [],
    tunnelEdges: [],
    gates: [{ ax: -4.5, az: -11, bx: -4.5, bz: 11 }], // the floodgate across the whole sewer
    npcs: [{ id: 'genji', kind: 'turtle', x: 26, z: 7, angle: -2 }],
    zones: [
      { id: 'valve', minX: -10, maxX: -6, minZ: 3, maxZ: 7 },
      { id: 'exit', name: '排水口', minX: 35, maxX: 39, minZ: -3, maxZ: 3 },
      { light: 1.3, name: '格子の下', minX: 8, maxX: 14, minZ: -4, maxZ: 4 }, // moonlight through a grate
      { name: '下水道', light: 0.6, minX: -40, maxX: 40, minZ: -15, maxZ: 15 }
    ]
  }
  return built
}
