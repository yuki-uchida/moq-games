// The family's daily loop (host only). People in the engine walk straight at their next waypoint and give up at
// walls, so this module drives them hop by hop through doorways: each person follows a plan of spots (a schedule
// that depends on the time of day, the chapter step and whether the family is out looking for Mochi), and the
// script hands the engine one hop at a time as a one-point route. After a chase the engine gives the person back
// in 'patrol' and the next hop is planned from wherever they ended up, so nobody stays stuck behind a wall.
// Everything here is either derived from GameState (phase from the clock, plans from step/flags) or transient
// (hop lists, wait timers), which a resumed game simply rebuilds.
import type { Game, Predator } from '../../game'
import { heightAt, inShelter, overhangAt, type Point } from '../../map'
import { FLAG, has } from './flags'

/** Seconds per time of day; the family loops 朝 → 昼 → 午後. */
export const PHASE_SECONDS = 200
export type Phase = 'morning' | 'noon' | 'afternoon'
export const phaseAt = (time: number): Phase =>
  (['morning', 'noon', 'afternoon'] as const)[Math.floor(time / PHASE_SECONDS) % 3]

export type Spot = Point & {
  wait?: number
  /** Heading (atan2(dx, dz)) to face while waiting. */
  face?: number
  /** Look around here (the person searches the spot and calls for Mochi). */
  look?: boolean
  /** Leave the house through the front door. */
  leave?: boolean
}
const N = Math.PI
const E = Math.PI / 2
const S = 0
const W = -Math.PI / 2

export const FRONT = { x: -31, z: -19 } as const
const SINK: Spot = { x: 36, z: 2, wait: 22, face: E }
const PANTRY: Spot = { x: 32, z: -2.4, wait: 7, face: N }
const CAGE_CHECK: Spot = { x: -30, z: 12.5, wait: 6, face: S }
const BACK_IN = { x: 34.8, z: 22.8 }
const BACK_OUT = { x: 34.8, z: 26.4 }

// Search rounds: the family checks the rooms and calls 「モチー？」.
const LOOK = {
  living: { x: -27, z: 10, look: true },
  dining: { x: 0, z: 18, look: true },
  kitchen: { x: 27, z: 3, look: true },
  washroom: { x: 27, z: 17, look: true },
  hallway: { x: -20, z: -10, look: true },
  genkan: { x: -30, z: -21, look: true },
  bath: { x: -12, z: -22, look: true },
  washitsu: { x: 3, z: -27, look: true },
  study: { x: 27, z: -20, look: true },
  garden: { x: -6, z: 31, look: true }
} satisfies Record<string, Spot>

export const PLANS: Record<string, Spot[]> = {
  'mom-morning': [
    SINK,
    { x: 14, z: 3, wait: 4, face: W },
    { x: -8, z: 10, wait: 3, face: W },
    CAGE_CHECK,
    { x: 0, z: 18, wait: 4, face: E },
    PANTRY
  ],
  'mom-noon': [
    SINK,
    { x: 34, z: 16.5, wait: 12, face: E },
    { x: -25.5, z: 12.5, wait: 16, face: E }, // folds the laundry on the low table, a few steps from the cage
    PANTRY,
    { x: 2, z: -10, wait: 4, face: W }
  ],
  'mom-afternoon': [
    { ...SINK, wait: 8 },
    { x: 20, z: 33.5, wait: 14, face: S },
    { x: 29, z: 33.5, wait: 14, face: S },
    { x: 6, z: 30.5, wait: 6, face: N },
    { ...SINK, wait: 10 }
  ],
  'dad-morning': [
    { x: 13.4, z: 9, wait: 40, face: W },
    { x: 33, z: -28, wait: 22, face: N },
    { x: -31, z: 0, wait: 20, face: W },
    { x: -8, z: 0, wait: 4 }
  ],
  'dad-noon': [{ ...FRONT, leave: true }],
  'dad-afternoon': [
    { x: 33, z: -28, wait: 28, face: N },
    { x: -31, z: 0, wait: 24, face: W },
    { x: 13.4, z: 9, wait: 20, face: W }
  ],
  'hinata-home': [
    { x: -26, z: 12, wait: 10, face: S },
    { x: -14, z: 19, wait: 8, face: E },
    { x: -34, z: 8, wait: 8, face: W },
    { x: -26, z: -1, wait: 6, face: S }
  ],
  'hinata-school': [{ ...FRONT, leave: true }],
  'hinata-search': [
    LOOK.living,
    LOOK.dining,
    LOOK.kitchen,
    LOOK.washroom,
    { x: 8, z: -3 },
    LOOK.hallway,
    LOOK.genkan,
    LOOK.bath,
    LOOK.washitsu,
    LOOK.study,
    { x: 12, z: -10 },
    LOOK.washroom,
    LOOK.garden,
    { x: -24, z: 43, look: true },
    { x: 10, z: 32, look: true }
  ],
  // Searching adds rounds through the rest of the house.
  'mom-search-morning': [SINK, LOOK.living, CAGE_CHECK, LOOK.hallway, LOOK.washitsu, LOOK.dining, PANTRY],
  'mom-search-noon': [SINK, LOOK.washroom, PANTRY, LOOK.hallway, LOOK.genkan, LOOK.bath, LOOK.kitchen],
  'mom-search-afternoon': [
    { ...SINK, wait: 8 },
    { x: 20, z: 33.5, wait: 12, face: S },
    LOOK.garden,
    { x: 29, z: 33.5, wait: 10, face: S },
    { ...SINK, wait: 6 },
    LOOK.living
  ],
  'dad-search-morning': [
    { x: 13.4, z: 9, wait: 25, face: W },
    LOOK.study,
    LOOK.bath,
    { x: -31, z: 0, wait: 12, face: W },
    LOOK.genkan
  ],
  'dad-search-afternoon': [LOOK.study, { x: -31, z: 0, wait: 15, face: W }, LOOK.washitsu, LOOK.dining]
}

/** Which plan a person follows now: derived from the state alone. */
export function planFor(id: string, game: Game): string | undefined {
  const { state } = game
  const phase = phaseAt(state.time)
  const search = has(state, FLAG.search)
  if (id === 'hinata')
    return state.step >= 4
      ? 'hinata-search'
      : state.step === 0 && !has(state, FLAG.bye)
        ? 'hinata-home'
        : 'hinata-school'
  if (id === 'dad') return phase === 'noon' ? 'dad-noon' : `dad-${search ? 'search-' : ''}${phase}`
  if (id === 'mom') return `mom-${search ? 'search-' : ''}${phase}`
  return undefined
}

// ---------------------------------------------------------------- navigation
/** Doorways (a point each side) and a few room corners; plan spots join the graph when planned to. */
const NODES: Point[] = [
  { x: -6, z: 8 },
  { x: -2, z: 8 },
  { x: -12, z: -3.4 },
  { x: -12, z: -8.6 },
  { x: 8, z: -3.4 },
  { x: 8, z: -8.6 },
  { x: 15.4, z: 4 },
  { x: 20.6, z: 4 },
  { x: 21.5, z: 7.4 },
  { x: 21.5, z: 12.6 },
  { x: 15.4, z: -10 },
  { x: 20.6, z: -10 },
  { x: -31, z: -11 },
  { x: -31, z: -17 },
  { x: -12.5, z: -11 },
  { x: -12.5, z: -17 },
  { x: 4, z: -11 },
  { x: 4, z: -17 },
  BACK_IN,
  BACK_OUT,
  { x: -27, z: -1 },
  { x: -8, z: 0 },
  { x: -8, z: 11 },
  { x: 0, z: 2 },
  { x: 14, z: 15 },
  { x: 28, z: 2 },
  { x: 28, z: 15 },
  { x: 26, z: -10 },
  { x: 30, z: -20 },
  { x: 10, z: -24 },
  { x: 36, z: 31 },
  { x: 14, z: 31 },
  { x: -4, z: 31 }
]
const BACK = [NODES.indexOf(BACK_IN), NODES.indexOf(BACK_OUT)]

/** A person (radius 0.7) can walk straight from a to b on the house floor. */
export function clearWalk(a: Point, b: Point) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = Math.hypot(dx, dz)
  const steps = Math.max(1, Math.ceil(length / 0.25))
  const nx = length ? -dz / length : 0
  const nz = length ? dx / length : 0
  for (let step = 0; step <= steps; step++) {
    const t = step / steps
    for (const side of [-0.6, 0, 0.6]) {
      const x = a.x + dx * t + nx * side
      const z = a.z + dz * t + nz * side
      if (Math.abs(heightAt(x, z)) > 0.15 || overhangAt(x, z, 0.15) || inShelter(x, z, 0.15)) return false
    }
  }
  return true
}

let links: boolean[][] | undefined
const linked = () =>
  (links ??= NODES.map((a, i) =>
    NODES.map((b, j) => i !== j && (clearWalk(a, b) || (BACK.includes(i) && BACK.includes(j))))
  ))

/** Hops (doorways) from `from` to `to`, ending at `to`; empty when no way is known. */
export function route(from: Point, to: Point): Point[] {
  if (clearWalk(from, to)) return [to]
  const graph = linked()
  const count = NODES.length
  const cost = new Array<number>(count + 1).fill(Infinity)
  const previous = new Array<number>(count + 1).fill(-1)
  const done = new Array<boolean>(count + 1).fill(false)
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)
  NODES.forEach((node, index) => {
    if (clearWalk(from, node)) cost[index] = dist(from, node)
  })
  const reachesGoal = NODES.map((node) => clearWalk(node, to))
  for (;;) {
    let best = -1
    for (let index = 0; index <= count; index++)
      if (!done[index] && cost[index] < Infinity && (best < 0 || cost[index] < cost[best])) best = index
    if (best < 0) return []
    if (best === count) break
    done[best] = true
    const relax = (index: number, extra: number) => {
      if (cost[best] + extra < cost[index]) {
        cost[index] = cost[best] + extra
        previous[index] = best
      }
    }
    for (let index = 0; index < count; index++)
      if (graph[best][index])
        relax(index, BACK.includes(best) && BACK.includes(index) ? 1 : dist(NODES[best], NODES[index]))
    if (reachesGoal[best]) relax(count, dist(NODES[best], to))
  }
  const hops: Point[] = [to]
  for (let index = previous[count]; index >= 0; index = previous[index]) hops.unshift(NODES[index])
  return hops
}

// ---------------------------------------------------------------- the driver
type Drive = {
  key: string
  cursor: number
  /** Errands that interrupt the plan (come and look at a noise). */
  queue: Spot[]
  hops: Point[]
  wait: number
  state: string
  check: { x: number; z: number; t: number }
  /** How close counts as reaching the current hop, and how often the person got stuck on the way. */
  reach: number
  stuck: number
}
const drives = new WeakMap<Game, Map<string, Drive>>()

const near = (a: Point, b: Point, reach: number) => Math.hypot(a.x - b.x, a.z - b.z) < reach
const isBack = (a: Point, b: Point) => near(a, BACK_IN, 0.1) && near(b, BACK_OUT, 0.1)

function drive(game: Game, person: Predator): Drive {
  let all = drives.get(game)
  if (!all) drives.set(game, (all = new Map()))
  let entry = all.get(person.id)
  if (!entry)
    all.set(
      person.id,
      (entry = {
        key: '',
        cursor: 0,
        queue: [],
        hops: [],
        wait: -1,
        state: person.state,
        check: { x: person.x, z: person.z, t: game.state.time },
        reach: 1.3,
        stuck: 0
      })
    )
  return entry
}

/**
 * Heads for a hop. The engine stops 1.2 short of a waypoint, which would cut corners round furniture, so aim a
 * little past the hop when that is open floor and count the hop reached only on top of it.
 */
function head(game: Game, person: Predator, entry: Drive) {
  const hop = entry.hops[0]
  const dx = hop.x - person.x
  const dz = hop.z - person.z
  const length = Math.hypot(dx, dz) || 1
  const past = { x: hop.x + (dx / length) * 1.1, z: hop.z + (dz / length) * 1.1 }
  const open = clearWalk(hop, past)
  game.setRoute(person.id, [open ? past : hop])
  entry.reach = open ? 0.7 : 1.3
  entry.stuck = 0
  entry.check = { x: person.x, z: person.z, t: game.state.time }
}

const target = (entry: Drive, plan: Spot[]) => entry.queue[0] ?? plan[entry.cursor % plan.length]

/** Sends a person to look at a spot (a noise), then back to their schedule. */
export function investigate(game: Game, person: Predator, spot: Spot) {
  const entry = drive(game, person)
  if (entry.queue.some((queued) => near(queued, spot, 3))) return
  entry.queue = [spot]
  entry.hops = []
  entry.wait = -1
}

/** Is a person on an errand (coming to look)? */
export const investigating = (game: Game, id: string) => !!drives.get(game)?.get(id)?.queue.length

/** One host tick of the family's schedules. */
export function driveFamily(game: Game, dt: number) {
  const { state } = game
  for (const person of [...state.predators]) {
    const key = planFor(person.id, game)
    if (!key) continue
    const plan = PLANS[key]
    const entry = drive(game, person)
    if (entry.key !== key) {
      // A new schedule: start from the spot nearest to where the person is now.
      entry.key = key
      let best = 0
      plan.forEach((spot, index) => {
        if (
          Math.hypot(spot.x - person.x, spot.z - person.z) <
          Math.hypot(plan[best].x - person.x, plan[best].z - person.z)
        )
          best = index
      })
      entry.cursor = best
      entry.hops = []
      entry.wait = -1
    }
    if (person.state !== 'patrol') {
      entry.state = person.state
      entry.hops = []
      entry.wait = -1
      continue
    }
    if (entry.state !== 'patrol') {
      entry.state = 'patrol'
      entry.hops = []
    }
    const spot = target(entry, plan)
    if (!entry.hops.length) {
      entry.hops = route(person, spot)
      if (!entry.hops.length) {
        // Lost (pushed somewhere odd during a chase): step back onto the nearest doorway.
        const node = NODES.reduce((best, node) =>
          Math.hypot(node.x - person.x, node.z - person.z) < Math.hypot(best.x - person.x, best.z - person.z)
            ? node
            : best
        )
        Object.assign(person, { x: node.x, z: node.z, y: heightAt(node.x, node.z) })
        entry.hops = route(person, spot)
      }
      if (!entry.hops.length) {
        // Unreachable spot: skip it rather than replanning every tick.
        if (entry.queue.length) entry.queue.shift()
        else entry.cursor = (entry.cursor + 1) % plan.length
        continue
      }
      head(game, person, entry)
    }
    const hop = entry.hops[0]
    if (hop && near(person, hop, entry.reach)) {
      if (entry.hops.length > 1) {
        const next = entry.hops[1]
        // The back door: people go out to the garden through it; rabbits can't (it stays shut).
        if (isBack(hop, next) || isBack(next, hop)) Object.assign(person, { x: next.x, z: next.z })
        entry.hops.shift()
        head(game, person, entry)
        continue
      }
      // Arrived at the spot: stand on it.
      game.setRoute(person.id, [hop])
      if (spot.leave) {
        game.removePredator(person.id)
        drives.get(game)?.delete(person.id)
        continue
      }
      if (spot.look) game.noise(person.x + Math.sin(person.angle) * 1.5, person.z + Math.cos(person.angle) * 1.5, 1.6)
      if (entry.wait < 0) entry.wait = spot.wait ?? 0
      if (spot.face !== undefined) person.angle = spot.face
      entry.wait -= dt
      if (entry.wait <= 0 || spot.look) {
        if (entry.queue.length) entry.queue.shift()
        else entry.cursor = (entry.cursor + 1) % plan.length
        entry.hops = []
        entry.wait = -1
      }
      entry.check = { x: person.x, z: person.z, t: state.time }
    } else if (state.time - entry.check.t > 2.5) {
      // Not getting anywhere (caught on a corner): plan again from here; if that keeps failing, step onto the hop.
      if (near(person, entry.check, 0.4) && ++entry.stuck >= 2 && hop && near(person, hop, 3)) {
        Object.assign(person, { x: hop.x, z: hop.z, y: heightAt(hop.x, hop.z) })
        entry.stuck = 0
      } else if (near(person, entry.check, 0.4)) {
        const stuck = entry.stuck
        entry.hops = route(person, spot)
        if (entry.hops.length) head(game, person, entry)
        entry.stuck = stuck
      }
      entry.check = { x: person.x, z: person.z, t: state.time }
    }
  }
}
