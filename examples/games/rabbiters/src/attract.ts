// Title-screen "attract mode": a separate, self-playing Game that runs behind the start panel. It owns its own
// Game (its own state and RNG) and never touches saves, audio, the HUD or the network; main.ts only steps and
// draws it while the title is showing.
import { canEnter, Game, type Input } from './game'
import { BUSHES, GRASS, SHELTERS, heightAt, setStage, type Point } from './map'

export const ATTRACT_ID = 'preview'
/** Game seconds before a run is restarted (a new seed gives different predators and food timings). */
export const ATTRACT_RUN_SECONDS = 240
/** Longest simulated step, so a stalled tab never fast-forwards the demo. */
export const ATTRACT_MAX_DT = 0.05

export const IDLE: Input = { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false, interact: false }

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
const cellKey = (x: number, z: number) => `${x},${z}`
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)

/** Greedy-biased A* over a 1 m grid from `from` to `to`; returns world waypoints, or the best partial path. */
export function planPath(from: Point, to: Point, maxExpansions = 1400): Point[] {
  const start: Cell = [Math.round(from.x), Math.round(from.z)]
  const goal: Cell = [Math.round(to.x), Math.round(to.z)]
  const h = (x: number, z: number) => Math.hypot(goal[0] - x, goal[1] - z)
  const cost = new Map<string, number>([[cellKey(...start), 0]])
  const parent = new Map<string, string>()
  const open: { x: number; z: number; f: number }[] = [{ x: start[0], z: start[1], f: h(...start) }]
  const closed = new Set<string>()
  let best = { x: start[0], z: start[1], h: h(...start) }
  for (let expanded = 0; open.length && expanded < maxExpansions; expanded++) {
    let lowest = 0
    for (let index = 1; index < open.length; index++) if (open[index].f < open[lowest].f) lowest = index
    const node = open.splice(lowest, 1)[0]
    const id = cellKey(node.x, node.z)
    if (closed.has(id)) continue
    closed.add(id)
    const distance = h(node.x, node.z)
    if (distance < best.h) best = { x: node.x, z: node.z, h: distance }
    if (distance < 1.2) break
    for (const [dx, dz] of NEIGHBORS) {
      const nx = node.x + dx
      const nz = node.z + dz
      const next = cellKey(nx, nz)
      if (closed.has(next)) continue
      const body = { x: node.x, y: heightAt(node.x, node.z), z: node.z }
      if (!canEnter('rabbit', body, nx, nz, true, false)) continue
      const g = cost.get(id)! + Math.hypot(dx, dz)
      if (g >= (cost.get(next) ?? Infinity)) continue
      cost.set(next, g)
      parent.set(next, id)
      open.push({ x: nx, z: nz, f: g + h(nx, nz) * 1.2 })
    }
  }
  const path: Point[] = []
  let id: string | undefined = cellKey(best.x, best.z)
  while (id) {
    const [x, z] = id.split(',').map(Number)
    path.push({ x, z })
    id = parent.get(id)
  }
  return path.reverse()
}

/** Places a rabbit can hide: grass patches, bushes and shelters of the active map. */
export function coverPoints(): Point[] {
  return [
    ...GRASS.map((patch) => ({ x: (patch.ax + patch.bx) / 2, z: (patch.az + patch.bz) / 2 })),
    ...BUSHES,
    ...SHELTERS
  ]
}

/** Small seeded generator for the demo's own choices (never the game's RNG). */
function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface AttractOptions {
  /** Seed of the first run; later runs use seed + run number. */
  seed?: number
  /** Slows the whole demo (reduced motion): 1 = normal, 0 = frozen. */
  speed?: number
  /** Replaces `new Game` (tests). */
  create?: (seed: number) => Game
}

/**
 * A competent-looking rabbit: forages for the nearest reachable food, sprints across open ground, ducks into
 * grass/bushes and crouches while a hunter is near, and restarts the run when it is caught, stuck or old.
 */
export class AttractDemo {
  game!: Game
  runs = 0
  private readonly seed: number
  private readonly create: (seed: number) => Game
  private rng: () => number
  private path: Point[] = []
  private replanAt = 0
  private goal: Point | undefined
  private wanderGoal: Point | undefined
  private calmAt = 0
  private cover: Point | undefined
  private lastCheck = { t: 0, x: 0, z: 0 }
  private strikes = 0
  /** Goals the rabbit could not get to (cliffs, water): skipped for the rest of the run. */
  private unreachable: Point[] = []
  private jumpAt = 0
  speed: number

  constructor(options: AttractOptions = {}) {
    this.seed = options.seed ?? 7
    this.speed = options.speed ?? 1
    this.create =
      options.create ??
      ((seed) => {
        const game = new Game(seed)
        game.addPlayer(ATTRACT_ID, '旅するウサギ')
        return game
      })
    this.rng = mulberry(this.seed)
    this.reset()
  }

  get state() {
    return this.game.state
  }

  get player() {
    return this.game.state.players.find((entry) => entry.id === ATTRACT_ID)!
  }

  reset() {
    const seed = this.runs === 0 ? this.seed : this.seed + this.runs * 101
    this.rng = mulberry(seed)
    this.game = this.create(seed)
    this.game.state.talk = null
    this.runs++
    this.path = []
    this.goal = this.wanderGoal = this.cover = undefined
    this.calmAt = 0
    this.replanAt = 0
    this.strikes = 0
    this.unreachable = []
    this.jumpAt = 6
    this.lastCheck = { t: 0, x: this.player.x, z: this.player.z }
  }

  /** Advances the demo by `dt` real seconds (capped). */
  step(dt: number) {
    const scaled = Math.min(Math.max(dt, 0), ATTRACT_MAX_DT) * this.speed
    if (!(scaled > 0)) return
    setStage(this.game.state.stage)
    const state = this.game.state
    if (state.phase !== 'playing' || this.player.downed || state.time > ATTRACT_RUN_SECONDS) this.reset()
    this.game.setInput(ATTRACT_ID, this.input())
    this.game.step(scaled)
    this.game.state.talk = null
    this.watchdog()
  }

  private watchdog() {
    const { time } = this.game.state
    if (time - this.lastCheck.t < 4) return
    const moved = Math.hypot(this.player.x - this.lastCheck.x, this.player.z - this.lastCheck.z)
    const idleOnPurpose = time < this.calmAt
    if (moved < 0.8 && !idleOnPurpose) {
      this.strikes++
      if (this.goal) this.unreachable.push(this.goal)
      this.path = []
      this.goal = undefined
      this.wanderGoal = undefined
      if (this.strikes >= 4) this.reset()
    } else if (moved >= 0.8) this.strikes = 0
    this.lastCheck = { t: time, x: this.player.x, z: this.player.z }
  }

  private pickWander(): Point {
    const { x, z } = this.player
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = this.rng() * Math.PI * 2
      const range = 14 + this.rng() * 22
      const candidate = { x: x + Math.cos(angle) * range, z: z + Math.sin(angle) * range }
      if (
        canEnter(
          'rabbit',
          { x: candidate.x, y: heightAt(candidate.x, candidate.z), z: candidate.z },
          candidate.x,
          candidate.z,
          true,
          false
        )
      )
        return candidate
    }
    return { x: x + 5, z }
  }

  /** Input for the current moment; deterministic given the game state and the demo's seed. */
  input(): Input {
    const state = this.game.state
    const player = this.player
    const now = state.time
    const threats = state.predators.filter((predator) => predator.kind !== 'crocodile')
    const nearest = threats.reduce<{ d: number; chasing: boolean }>(
      (best, predator) => {
        const d = dist(predator, player)
        return d < best.d ? { d, chasing: predator.state === 'chase' } : best
      },
      { d: Infinity, chasing: false }
    )
    const alert = threats.some((predator) => predator.targetId === player.id && predator.state !== 'patrol')
    if (nearest.d < 11 || alert) this.calmAt = now + (alert ? 6 : 2.5)
    const wary = now < this.calmAt
    if (wary && !this.cover) {
      const spots = coverPoints()
        .filter((spot) => dist(spot, player) < 34)
        .sort((a, b) => dist(a, player) - dist(b, player))
      this.cover = spots[0]
      this.path = []
    } else if (!wary) this.cover = undefined

    // Decide where to go.
    let target: Point | undefined
    if (wary && this.cover) target = this.cover
    else {
      const foods = state.foods.filter((food) => food.active && !this.unreachable.some((spot) => dist(spot, food) < 3))
      const danger = (point: Point) =>
        state.predators.some((predator) => dist(predator, point) < (predator.kind === 'crocodile' ? 26 : 18))
      const wanted = foods
        .map((food) => ({ food, d: dist(food, player) + (danger(food) ? 80 : 0) }))
        .filter((entry) => entry.d < 70)
        .sort((a, b) => a.d - b.d)[0]
      if (wanted) {
        target = wanted.food
        this.wanderGoal = undefined
      } else {
        if (!this.wanderGoal || dist(this.wanderGoal, player) < 3) this.wanderGoal = this.pickWander()
        target = this.wanderGoal
      }
    }
    if (!this.goal || dist(this.goal, target) > 1) {
      this.goal = { x: target.x, z: target.z }
      this.replanAt = 0
    }
    if (now >= this.replanAt) {
      this.path = planPath(player, this.goal)
      this.replanAt = now + 0.6
    }
    const left = dist(this.goal, player)
    // Waypoint a few cells ahead of the nearest path cell.
    let nearestIndex = 0
    for (let index = 0; index < this.path.length; index++)
      if (dist(this.path[index], player) < dist(this.path[nearestIndex], player)) nearestIndex = index
    const aim = left < 1.6 ? this.goal : (this.path[Math.min(nearestIndex + 3, this.path.length - 1)] ?? this.goal)
    const dx = aim.x - player.x
    const dz = aim.z - player.z
    const length = Math.hypot(dx, dz)
    const settled = wary && !!this.cover && dist(this.cover, player) < 1.2
    const moving = length > 0.15 && !settled
    const sprint = moving && (nearest.chasing || (!wary && left > 7 && player.hunger > 20 && nearest.d > 26))
    let jump = false
    if (moving && !wary && now > this.jumpAt && left > 6) {
      jump = true
      this.jumpAt = now + 5 + this.rng() * 4
    }
    return {
      moveX: moving ? dx / length : 0,
      moveZ: moving ? dz / length : 0,
      jump,
      sprint,
      crouch: wary && (settled || nearest.d < 12),
      interact: false
    }
  }
}
