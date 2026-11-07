// Chapter-1 (house) test bot: the shared bot's grid path-finding, extended for the house (hop up the genkan step,
// crouch under low furniture, keep clear of Gon's chain) with the chapter's objectives, and a cautious policy that
// hides under furniture or in cover while someone has eyes on it and waits for the family to pass.
import { canEnter, mapTerrain, type Game, type Input, type Player } from '../src/game'
import { GATES, activeStage, gateOpen, heightAt, inZone, type Point } from '../src/map'
import { FLAG, has } from '../src/stages/house/flags'
import { EXIT, GAP, GATE, GON_LEASH, GON_POST, NIBOSHI, PELLETS, TAMA } from '../src/stages/house/map'
import { coverSpots, idle } from './bot'

const SPACING = 0.5
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
const nearGon = (x: number, z: number) => Math.hypot(x - GON_POST.x, z - GON_POST.z) < GON_LEASH + 3.5

/** A rabbit can get from a to b: walking (crouched under low roofs) or hopping up a step. */
function passable(ax: number, az: number, bx: number, bz: number) {
  if (nearGon(bx, bz) && !nearGon(ax, az)) return false
  const ground = heightAt(ax, az)
  const body = { x: ax, y: ground, z: az }
  if (canEnter('rabbit', body, bx, bz, true, true)) return true
  const rise = heightAt(bx, bz) - ground
  return (
    rise > 0 && rise < 2.4 && canEnter('rabbit', { x: ax, y: heightAt(bx, bz) + 0.01, z: az }, bx, bz, false, false)
  )
}

const fields = new Map<string, Map<string, number>>()
export function houseField(goal: Point) {
  const gates = GATES.map((_, index) => (gateOpen(index) ? 1 : 0)).join('')
  const start: Cell = [Math.round(goal.x / SPACING), Math.round(goal.z / SPACING)]
  const id = `${activeStage()}|${gates}|${key(...start)}`
  let steps = fields.get(id)
  if (steps) return steps
  if (fields.size > 80) fields.clear()
  steps = new Map([[key(...start), 0]])
  const queue = [start]
  for (let index = 0; index < queue.length; index++) {
    const [x, z] = queue[index]
    for (const [dx, dz] of NEIGHBORS) {
      const [nx, nz] = [x + dx, z + dz]
      if (steps.has(key(nx, nz)) || !passable(nx * SPACING, nz * SPACING, x * SPACING, z * SPACING)) continue
      steps.set(key(nx, nz), steps.get(key(x, z))! + 1)
      queue.push([nx, nz])
    }
  }
  fields.set(id, steps)
  return steps
}

/** Movement toward `goal`: direction, crouch under low roofs, jump up steps. */
export function houseSteer(player: Player, goal: Point) {
  const steps = houseField(goal)
  const [cx, cz] = [Math.round(player.x / SPACING), Math.round(player.z / SPACING)]
  let best: Cell | undefined
  let bestSteps = steps.get(key(cx, cz)) ?? Infinity
  for (const [dx, dz] of NEIGHBORS) {
    const next = steps.get(key(cx + dx, cz + dz))
    if (
      next !== undefined &&
      next < bestSteps &&
      passable(cx * SPACING, cz * SPACING, (cx + dx) * SPACING, (cz + dz) * SPACING)
    )
      [best, bestSteps] = [[cx + dx, cz + dz], next]
  }
  const left = Math.hypot(goal.x - player.x, goal.z - player.z)
  const aim = left < 1 || !best ? goal : { x: best[0] * SPACING, z: best[1] * SPACING }
  const dx = aim.x - player.x
  const dz = aim.z - player.z
  const length = Math.hypot(dx, dz)
  return {
    moveX: length > 0.05 ? dx / length : 0,
    moveZ: length > 0.05 ? dz / length : 0,
    jump: heightAt(aim.x, aim.z) - heightAt(player.x, player.z) > 0.3,
    left,
    known: best !== undefined || left < 1
  }
}

type Goal = { at: Point; hold?: boolean; tap?: boolean; reach?: number; wait?: boolean }

/** What the chapter asks of this rabbit right now (the bot knows every location). */
export function houseGoal(game: Game, player: Player): Goal {
  const { state } = game
  const doorInside = { x: -30, z: 16.6 }
  const cageShut = !(state.open & 1)
  const inCage = inZone('cage', player.x, player.z)
  if (has(state, FLAG.latch) && cageShut && inCage) return { at: doorInside, hold: true, reach: 0.6 }
  if (player.hunger < 35 && state.step > 0) {
    const food = state.foods
      .filter((entry) => entry.active && Math.abs(entry.y - heightAt(entry.x, entry.z)) < 0.5)
      .filter((entry) => houseField(entry).has(key(Math.round(player.x / SPACING), Math.round(player.z / SPACING))))
      .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0]
    if (food) return { at: food }
  }
  switch (state.step) {
    case 0: {
      const pellet = state.foods.slice(0, PELLETS.length).find((food) => food.active)
      if (!has(state, FLAG.pellets) && pellet) return { at: pellet }
      if (!has(state, FLAG.pisuke)) return { at: { x: -27.4, z: 18 }, tap: true, reach: 0.5 }
      return { at: { x: -30, z: 18.4 }, wait: true }
    }
    case 1:
      return { at: doorInside, hold: true, reach: 0.6 }
    case 2:
      return { at: TAMA, tap: true, reach: 2 }
    case 3: {
      const fish = state.items.find((entry) => entry.active)
      if (fish) return { at: fish }
      return player.carrying ? { at: TAMA, reach: 1.5 } : { at: NIBOSHI, hold: true, reach: 0.8 }
    }
    case 4: {
      const tag = state.items.find((entry) => entry.active)
      return tag ? { at: tag } : { at: { x: 32, z: 22.6 }, hold: true, reach: 0.6 }
    }
    default:
      return state.open & (1 << GATE.gap) ? { at: EXIT } : { at: GAP, hold: true, reach: 0.6 }
  }
}

/**
 * Plays chapter 1 for one rabbit. `cautious` adds the careful player's habits: hide (crouched, under furniture or
 * in cover) while anyone is suspicious of it or chasing it, and wait while a person could see it out in the open.
 */
export class HouseBot {
  private pulse = false
  private calmAt = 0
  private stuck = { x: 0, z: 0, t: 0 }
  waited = 0
  reason = ''
  constructor(
    private readonly game: Game,
    readonly id: string,
    private readonly cautious = false
  ) {}

  get player() {
    return this.game.state.players.find((player) => player.id === this.id)!
  }

  input(dt = 1 / 60): Input {
    const { state } = this.game
    const player = this.player
    if (!player || player.downed) return idle
    const goal = houseGoal(this.game, player)
    const route = houseSteer(player, goal.at)
    const arrived = route.left < (goal.reach ?? 0.4)
    this.pulse = !this.pulse
    let input: Input = {
      ...idle,
      moveX: arrived || goal.wait ? 0 : route.moveX,
      moveZ: arrived || goal.wait ? 0 : route.moveZ,
      jump: route.jump && this.pulse,
      interact: arrived && (goal.hold || (goal.tap && this.pulse)) === true
    }
    // Unstick: hop when pressing against something for a while.
    if (Math.hypot(player.x - this.stuck.x, player.z - this.stuck.z) > 0.5 || arrived)
      this.stuck = { x: player.x, z: player.z, t: state.time }
    else if (state.time - this.stuck.t > 1.5) input.jump = this.pulse
    if (!this.cautious) return input
    return this.careful(player, input, goal, dt)
  }

  private careful(player: Player, input: Input, goal: Goal, dt: number): Input {
    const { state } = this.game
    const near = (point: Point) => Math.hypot(point.x - player.x, point.z - player.z)
    if (state.predators.some((predator) => predator.targetId === player.id && predator.state !== 'patrol'))
      this.calmAt = state.time + 6
    const people = state.predators.filter((predator) => predator.kind === 'human' || predator.kind === 'child')
    // Could someone see a rabbit at this point (in range, facing it, nothing in between)?
    const seen = (point: Point & { y: number }, range = 14) =>
      people.some((person) => {
        const distance = Math.hypot(person.x - point.x, person.z - point.z)
        if (distance > range) return false
        const facing =
          distance < 2 ||
          Math.cos(Math.atan2(point.x - person.x, point.z - person.z) - person.angle) > -0.2 ||
          person.state !== 'patrol'
        return facing && mapTerrain.sightLine(person, point) > 0
      })
    const safeHere = player.hidden || inZone('cage', player.x, player.z)
    const doing = (goal.hold || goal.tap) && input.interact
    const hide = (why = ''): Input => {
      this.reason = why
      this.waited += dt
      // Settle into the middle of the hiding place, not on its edge.
      if (!this.hideAt || !player.hidden)
        this.hideAt = safeHere ? { x: player.x, z: player.z } : this.nearestCover(player)
      const cover = this.hideAt
      if (!cover || near(cover) < 0.5) return idle
      const route = houseSteer(player, cover)
      return { ...idle, moveX: route.moveX, moveZ: route.moveZ, jump: route.jump && input.jump }
    }
    // Starving: make a dash for food whatever happens (being carried home to the cage's pellets is fine too).
    if (player.hunger < 12) return input
    if (state.time < this.calmAt) return hide('calm')
    // Gnaw, rustle and dig only while nobody is around to hear it.
    if (goal.hold && near(goal.at) < 3 && people.some((person) => near(person) < 15)) return hide('hold')
    this.reason = 'go ' + JSON.stringify(goal.at)
    this.hideAt = undefined
    if (doing) return input
    const ahead = { x: player.x + input.moveX * 2.5, z: player.z + input.moveZ * 2.5, y: player.y }
    // A hungry rabbit takes its chances (it only hides once someone is actually onto it).
    if (player.hunger > 25 && (seen(player) || seen(ahead))) return hide('seen')
    return input
  }

  private hideAt?: Point
  private covers?: { key: string; spots: Point[] }
  /** The closest hiding place by path (furniture to crawl under, bushes, the oshiire). */
  private nearestCover(player: Player): Point | undefined {
    const gates = this.game.state.open
    if (this.covers?.key !== String(gates)) this.covers = { key: String(gates), spots: coverSpots() }
    const from = houseField(player)
    let best: Point | undefined
    let bestSteps = Infinity
    for (const spot of this.covers.spots) {
      const steps = from.get(key(Math.round(spot.x / SPACING), Math.round(spot.z / SPACING)))
      if (steps !== undefined && steps < bestSteps) [best, bestSteps] = [spot, steps]
    }
    return best
  }
}
