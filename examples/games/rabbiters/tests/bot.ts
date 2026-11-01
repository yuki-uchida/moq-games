// Reusable test bot for any stage: grid path fields over `canEnter` on the active map, and a cautious policy that
// retreats to cover and crouches while suspected or chased, then waits until things calm down.
import { canEnter, type Game, type Input } from '../src/game'
import {
  BUSHES,
  GATES,
  GRASS,
  OVERHANGS,
  LANES,
  SHELTERS,
  activeStage,
  gateOpen,
  heightAt,
  underWheels,
  vehiclesAt,
  type Point
} from '../src/map'

export const idle: Input = { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false, interact: false }

type Cell = [number, number]
const NEIGHBORS: Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
]
const key = (x: number, z: number) => `${x},${z}`
export const walkable = (fromX: number, fromZ: number, toX: number, toZ: number, crouch = false) =>
  canEnter('rabbit', { x: fromX, y: heightAt(fromX, fromZ), z: fromZ }, toX, toZ, true, crouch)

/**
 * Steps-to-goal over a grid of `spacing` m (1 on the forest), built backwards from the goal on the active map.
 * `crouch` lets the path duck under low overhangs (sofas, parked cars).
 */
export function field(goal: Point, spacing = 1, crouch = false) {
  const start: Cell = [Math.round(goal.x / spacing), Math.round(goal.z / spacing)]
  const steps = new Map([[key(...start), 0]])
  const queue = [start]
  for (let index = 0; index < queue.length; index++) {
    const [x, z] = queue[index]
    for (const [dx, dz] of NEIGHBORS) {
      const [nx, nz] = [x + dx, z + dz]
      if (steps.has(key(nx, nz)) || !walkable(nx * spacing, nz * spacing, x * spacing, z * spacing, crouch)) continue
      steps.set(key(nx, nz), steps.get(key(x, z))! + 1)
      queue.push([nx, nz])
    }
  }
  return steps
}

const fields = new Map<string, Map<string, number>>()
/** Cached path field for the active stage and gate state. */
export function fieldFor(goal: Point, spacing = 1, crouch = false) {
  const gates = GATES.map((_, index) => (gateOpen(index) ? 1 : 0)).join('')
  const id = `${activeStage()}|${gates}|${spacing}|${crouch}|${key(Math.round(goal.x / spacing), Math.round(goal.z / spacing))}`
  let steps = fields.get(id)
  if (!steps) fields.set(id, (steps = field(goal, spacing, crouch)))
  return steps
}
export const reachable = (from: Point, goal: Point, spacing = 1) =>
  fieldFor(goal, spacing).has(key(Math.round(from.x / spacing), Math.round(from.z / spacing)))

/** Direction toward the goal along walkable ground, and the straight-line distance left. */
export function steer(from: Point, goal: Point, spacing = 1, crouch = false) {
  const steps = fieldFor(goal, spacing, crouch)
  const [cx, cz] = [Math.round(from.x / spacing), Math.round(from.z / spacing)]
  let best: Cell | undefined
  let bestSteps = steps.get(key(cx, cz)) ?? Infinity
  for (const [dx, dz] of NEIGHBORS) {
    const next = steps.get(key(cx + dx, cz + dz))
    if (
      next !== undefined &&
      next < bestSteps &&
      walkable(cx * spacing, cz * spacing, (cx + dx) * spacing, (cz + dz) * spacing, crouch)
    )
      [best, bestSteps] = [[cx + dx, cz + dz], next]
  }
  const left = Math.hypot(goal.x - from.x, goal.z - from.z)
  const aim = left < 1.5 || !best ? goal : { x: best[0] * spacing, z: best[1] * spacing }
  const dx = aim.x - from.x
  const dz = aim.z - from.z
  const length = Math.hypot(dx, dz)
  return { moveX: length > 0.05 ? dx / length : 0, moveZ: length > 0.05 ? dz / length : 0, left }
}

/** Hiding places on the active map: grass, bushes, shelters and overhangs. */
export function coverSpots(): Point[] {
  return [
    ...GRASS.map((patch) => ({ x: (patch.ax + patch.bx) / 2, z: (patch.az + patch.bz) / 2 })),
    ...BUSHES,
    ...SHELTERS,
    ...OVERHANGS.map((roof) => ({ x: (roof.minX + roof.maxX) / 2, z: (roof.minZ + roof.maxZ) / 2 }))
  ]
}

/**
 * A careful player: heads for `goal`, but while any predator is after it (and for `calmSeconds` after) it runs to
 * the nearest cover within reach, crouches and waits. It also crouches whenever a hunter is close.
 */
export class CautiousBot {
  private calmAt = 0
  constructor(
    private readonly game: Game,
    readonly id: string,
    private readonly options: { spacing?: number; calmSeconds?: number; threatRange?: number } = {}
  ) {}

  get player() {
    return this.game.state.players.find((player) => player.id === this.id)!
  }

  input(goal: Point, extra: Partial<Input> = {}): Input & { left: number } {
    const { state } = this.game
    const player = this.player
    const near = (point: Point) => Math.hypot(point.x - player.x, point.z - player.z)
    if (state.predators.some((predator) => predator.targetId === player.id))
      this.calmAt = state.time + (this.options.calmSeconds ?? 8)
    const wary = state.time < this.calmAt
    const cover = coverSpots().sort((first, second) => near(first) - near(second))[0]
    const hiding = wary && cover && near(cover) < 30
    const target = hiding ? cover : goal
    const route = steer(player, target, this.options.spacing ?? 1)
    const resting = hiding && route.left < 1
    const threatNear = state.predators.some(
      (predator) => predator.kind !== 'crocodile' && near(predator) < (this.options.threatRange ?? 14)
    )
    // Traffic: wait at the kerb while a car would cross the next few steps (keep going if already on the road).
    const hit = (x: number, z: number, t: number) =>
      vehiclesAt(state.time + t).some((vehicle) => underWheels(vehicle, x, z, 1.2))
    const sprint = !wary && !threatNear && route.left > 5
    const speed = sprint ? 9 : 5.2
    const soon = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
    const blocked =
      LANES.length > 0 &&
      soon.some((t) => hit(player.x + route.moveX * speed * t, player.z + route.moveZ * speed * t, t)) &&
      !soon.some((t) => hit(player.x, player.z, t))
    return {
      ...idle,
      ...(resting || blocked ? {} : { moveX: route.moveX, moveZ: route.moveZ }),
      sprint,
      crouch: wary || threatNear,
      ...extra,
      left: Math.hypot(goal.x - player.x, goal.z - player.z)
    }
  }
}
