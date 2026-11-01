import { FOOD_KINDS, type FoodKind } from './food'
import { BURROW, CAMPAIGN, createStraws, moveKits, nightVision, spawnKits, type Kit, type Straw } from './campaign'
import {
  CROCODILE_POOLS,
  DEEP_WATER,
  FOODS,
  NESTS,
  PREDATOR_STARTS,
  SPAWN,
  TUNNEL_DEPTH,
  WATER_LEVEL,
  WORLD,
  caveAt,
  caveWallBlocks,
  clampToTunnel,
  heightAt,
  hitsBlocker,
  inBush,
  inGrass,
  inShelter,
  isUnderground,
  lineOfSight,
  logOver,
  logTop,
  onSand,
  slopeAt,
  treesNear,
  tunnelExitNear,
  waterDepth,
  type PredatorKind
} from './map'
import {
  HAWK_ALTITUDE,
  STEALTH,
  newMind,
  rollDropping,
  segmentDistance,
  updatePredator,
  visibility,
  type Dropping,
  type Mind,
  type PredatorBody,
  type Roll,
  type Scent,
  type Target,
  type Terrain
} from './stealth'

export type { Dropping } from './stealth'

export interface Input {
  moveX: number
  moveZ: number
  jump: boolean
  sprint: boolean
  crouch: boolean
  interact: boolean
}

export interface Player {
  id: string
  name: string
  x: number
  y: number
  z: number
  angle: number
  hunger: number
  health: number
  hidden: boolean
  downed: boolean
  score: number
  age: number
  foodEaten: number
  growth: number
  pregnant: boolean
  pregnancy: number
  /** Dust-bath progress 0..1 while crouching still on sand. */
  bath: number
  /** Index into PLAYER_COLORS, picked by the host on join. Older hosts omit it. */
  color?: number
  /** Id of the straw bundle this rabbit is carrying in its mouth. */
  carrying: string | null
}

export type Predator = PredatorBody

export interface Food {
  id: string
  kind: FoodKind
  x: number
  y: number
  z: number
  active: boolean
}

export interface Nest extends Omit<Food, 'kind'> {
  health: number
}

export interface GameState {
  time: number
  players: Player[]
  predators: Predator[]
  foods: Food[]
  nests: Nest[]
  droppings: Dropping[]
  delivered: number
  goal: number
  phase: 'playing' | 'won' | 'lost'
  /** 0 spring (grow), 1 summer (bedding), 2 autumn (pregnancy), 3 winter (lead the kits). */
  chapter: number
  bedding: number
  straws: Straw[]
  kits: Kit[]
}

/** Snapshot sent through the relay: food and nest positions come from the shared map. */
export type WireState = Omit<GameState, 'foods' | 'nests'> & { foods: string; nests: number[] }

export interface Movement {
  velocity: number
  jumpHeld: boolean
}

/** Where a rabbit is hiding. Each predator sees through a different subset of these. */
export type Cover = 'tunnel' | 'shelter' | 'cave' | 'log' | 'bush' | 'canopy' | 'grass' | 'water' | 'open'
type Kind = PredatorKind | 'rabbit'
type Body = { x: number; y: number; z: number }

const idle: Input = { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false, interact: false }
const kinds: PredatorKind[] = ['fox', 'wolf', 'hawk', 'snake', 'crocodile']
const BODY: Record<Kind, number> = { rabbit: 0.3, fox: 0.6, wolf: 0.75, hawk: 0, snake: 0.25, crocodile: 0.8 }
/** Home range: a patrolling predator that strays further turns back toward where it started or hatched. */
const LEASH: Record<PredatorKind, number> = { fox: 30, wolf: 38, hawk: 45, snake: 20, crocodile: 40 }
const MAX_CLIMB = 0.95 // rise per metre a walker can climb; steeper ground needs a jump or is a cliff
const MAX_STAND = 1.5 // nothing can rest on steeper ground: cliff faces are not ladders
const SPRINT_NOISE = 1.3 // sprinting thumps: predators notice the rabbit from further away
const distance = (first: { x: number; z: number }, second: { x: number; z: number }) =>
  Math.hypot(first.x - second.x, first.z - second.z)
const round = (value: number) => Math.round(value * 100) / 100
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/**
 * The shared map as the predators perceive it: terrain, tall rocks and cave walls block sight; a tree trunk
 * close to the rabbit and in the way leaves it partly hidden. Bodies may carry `y` (and `kind` for hawks).
 */
export const mapTerrain: Terrain = {
  heightAt,
  sightLine(from, to) {
    const eye = from as typeof from & { y?: number; kind?: string }
    const body = to as typeof to & { y?: number }
    const eyeY = eye.y === undefined ? heightAt(eye.x, eye.z) + 0.8 : eye.kind === 'hawk' ? eye.y : eye.y + 0.8
    const bodyY = (body.y ?? heightAt(body.x, body.z)) + 0.4
    if (!lineOfSight(eye.x, eyeY, eye.z, body.x, bodyY, body.z)) return 0
    for (const tree of treesNear(body.x, body.z, 3))
      if (segmentDistance(tree, eye, body) < 0.8 && distance(tree, eye) > 0.8) return STEALTH.treeCover
    return 1
  }
}

export const RULES = {
  adultAge: 300,
  requiredFood: 6,
  pregnancyNutrition: 50,
  gestationSeconds: 600,
  hungerDrain: 0.22,
  pregnancyHungerDrain: 0.35,
  sprintHungerDrain: 0.08,
  pregnancySpeed: 0.65,
  foodRespawnSeconds: 210,
  predatorSpawnSeconds: 120,
  wellFed: 60,
  fedHeal: 0.3,
  burrowHeal: 4
} as const

/** Collar colours: distinct hues that read on grass, sand and the minimap. */
export const PLAYER_COLORS = [
  '#e8455a',
  '#2f7fe0',
  '#f2b417',
  '#8a4fd8',
  '#17b3a3',
  '#f07a2a',
  '#e85fb0',
  '#24306e'
] as const

/** Lowest palette slot not worn by anyone already in the room; wraps to the least-worn once all are taken. */
export function pickPlayerColor(players: readonly Pick<Player, 'color'>[]): number {
  const worn = PLAYER_COLORS.map((_, slot) => players.filter((player) => player.color === slot).length)
  return worn.indexOf(Math.min(...worn))
}

/** Same colour on every client: the host-synced slot, or an ID hash for snapshots from older hosts. */
export function playerColor(player: Pick<Player, 'id' | 'color'>): string {
  if (Number.isInteger(player.color)) return PLAYER_COLORS[player.color! % PLAYER_COLORS.length]
  let hash = 0
  for (const char of player.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PLAYER_COLORS[hash % PLAYER_COLORS.length]
}

/** Whether a creature standing at `body` may step to (x, z). Rabbits may duck under logs. */
export function canEnter(kind: Kind, body: Body, x: number, z: number, grounded: boolean, crouch: boolean): boolean {
  if (x < WORLD.minX + 1 || x > WORLD.maxX - 1 || z < WORLD.minZ + 1 || z > WORLD.maxZ - 1) return false
  if (kind === 'hawk') return true
  const ground = heightAt(x, z)
  if (kind === 'crocodile') return WATER_LEVEL - ground > 0.15
  if (WATER_LEVEL - ground > DEEP_WATER) return false
  const rise = ground - body.y
  if (grounded ? rise > MAX_CLIMB * Math.hypot(x - body.x, z - body.z) + 0.02 : rise > 0.05) return false
  const radius = BODY[kind]
  if (hitsBlocker(x, z, radius) || caveWallBlocks(x, z, radius)) return false
  if (kind !== 'rabbit' && kind !== 'snake' && inShelter(x, z, radius) && !inShelter(body.x, body.z, radius))
    return false
  const log = logOver(x, z, radius)
  if (!log || kind === 'snake' || logOver(body.x, body.z, radius)) return true
  return kind === 'rabbit' && ((crouch && grounded) || body.y > logTop(log))
}

/** Steps a body, sliding along whichever axis is still open when the full step is blocked. */
function move(kind: Kind, body: Body, dx: number, dz: number, grounded: boolean, crouch: boolean): boolean {
  if (!dx && !dz) return false
  if (canEnter(kind, body, body.x + dx, body.z + dz, grounded, crouch)) {
    body.x += dx
    body.z += dz
  } else if (dx && dz && canEnter(kind, body, body.x + dx, body.z, grounded, crouch)) body.x += dx
  else if (dx && dz && canEnter(kind, body, body.x, body.z + dz, grounded, crouch)) body.z += dz
  else return false
  return true
}

/**
 * Rabbit movement shared by the host simulation and guest-side prediction: terrain and slopes,
 * jumps, wading, ducking under logs, and diving into / popping out of mole tunnels.
 */
export function moveRabbit(
  player: Pick<Player, 'x' | 'y' | 'z' | 'angle' | 'pregnant'> & { carrying?: string | null },
  input: Input,
  dt: number,
  movement: Movement
) {
  const jumpPressed = input.jump && !movement.jumpHeld
  movement.jumpHeld = input.jump
  const moveX = clamp(input.moveX, -1, 1)
  const moveZ = clamp(input.moveZ, -1, 1)
  const length = Math.max(1, Math.hypot(moveX, moveZ))
  const directionX = moveX / length
  const directionZ = moveZ / length
  if (moveX || moveZ) player.angle = Math.atan2(moveX, moveZ)
  const pace = (player.pregnant ? RULES.pregnancySpeed : 1) * (player.carrying ? CAMPAIGN.carrySpeed : 1)
  if (isUnderground(player.x, player.y, player.z)) {
    // Mole tunnels: a fixed crawl along the corridors; jump at an exit hole to pop back out.
    const next = clampToTunnel(player.x + directionX * 4.2 * pace * dt, player.z + directionZ * 4.2 * pace * dt, 0.3)
    player.x = next.x
    player.z = next.z
    player.y = heightAt(next.x, next.z) - TUNNEL_DEPTH
    const exit = jumpPressed ? tunnelExitNear(player.x, player.z, 1.3) : undefined
    if (exit) {
      player.x = exit.x
      player.z = exit.z
      player.y = heightAt(exit.x, exit.z)
    }
    movement.velocity = exit ? 6 : 0
    return
  }
  const grounded = player.y <= heightAt(player.x, player.z) + 1e-6
  const sliding = grounded && slopeAt(player.x, player.z) > MAX_STAND
  const speed =
    // A bundle held in the mouth rules out dashing.
    (input.crouch ? 2.6 : input.sprint && !player.carrying ? 9 : 5.2) *
    (waterDepth(player.x, player.z) > 0.05 ? 0.55 : 1) *
    pace
  if (sliding) {
    const downX = heightAt(player.x - 0.5, player.z) - heightAt(player.x + 0.5, player.z)
    const downZ = heightAt(player.x, player.z - 0.5) - heightAt(player.x, player.z + 0.5)
    const length = Math.hypot(downX, downZ)
    move('rabbit', player, (downX / length) * 6 * dt, (downZ / length) * 6 * dt, true, input.crouch)
  } else move('rabbit', player, directionX * speed * dt, directionZ * speed * dt, grounded, input.crouch)
  const ground = heightAt(player.x, player.z)
  let velocity = movement.velocity
  if (grounded && jumpPressed && !sliding) velocity = 10
  if (grounded && velocity <= 0 && ground >= player.y - (speed * dt * 1.5 + 0.05)) {
    player.y = ground // follow slopes downhill instead of hopping off every bump
    velocity = 0
  } else {
    velocity -= 18 * dt
    player.y = Math.max(ground, player.y + velocity * dt)
    if (player.y === ground) velocity = 0
  }
  if (input.crouch && player.y === ground && tunnelExitNear(player.x, player.z, 1)) {
    player.y = ground - TUNNEL_DEPTH
    velocity = 0
  }
  movement.velocity = velocity
}

export function coverAt(x: number, y: number, z: number, crouch: boolean): Cover {
  if (isUnderground(x, y, z)) return 'tunnel'
  if (inShelter(x, z)) return 'shelter'
  if (caveAt(x, z)) return 'cave'
  if (y - heightAt(x, z) > 0.6) return 'open'
  if (crouch && logOver(x, z)) return 'log'
  if (inBush(x, z)) return crouch ? 'bush' : 'canopy'
  if (crouch && inGrass(x, z)) return 'grass'
  if (crouch && waterDepth(x, z) > 0.05) return 'water'
  return 'open'
}

/** Whether this predator can perceive a rabbit in this cover at all (before range, angle and sight lines). */
function exposed(predator: Predator, player: { x: number; z: number }, cover: Cover): boolean {
  if (cover === 'open') return true
  if (cover === 'canopy') return predator.kind !== 'hawk'
  if (cover === 'water') return predator.kind === 'crocodile'
  if (cover !== 'cave') return false
  const cave = caveAt(player.x, player.z)
  return predator.kind !== 'hawk' && caveAt(predator.x, predator.z) === cave && distance(predator, player) < 4
}

const predatorHeight = (kind: PredatorKind, x: number, z: number) =>
  kind === 'hawk' ? heightAt(x, z) + HAWK_ALTITUDE.patrol : kind === 'crocodile' ? WATER_LEVEL - 0.3 : heightAt(x, z)
const pick = ({ x, y, z }: Body) => ({ x, y, z })
const foodState = (index: number, active: boolean): Food => ({
  id: `food-${index}`,
  kind: FOODS[index].kind,
  ...pick(FOODS[index]),
  active
})
const nestState = (index: number, health: number): Nest => ({
  id: `nest-${index}`,
  x: NESTS[index].x,
  y: heightAt(NESTS[index].x, NESTS[index].z),
  z: NESTS[index].z,
  health,
  active: health > 0
})

export function packSnapshot<T extends GameState>(state: T): Omit<T, 'foods' | 'nests'> & WireState {
  const wire = {
    ...state,
    foods: state.foods.map((food) => (food.active ? '1' : '0')).join(''),
    nests: state.nests.map((nest) => nest.health)
  }
  return JSON.parse(
    JSON.stringify(wire, (_key, value: unknown) =>
      typeof value === 'number' ? Math.round(value * 1000) / 1000 : value
    )
  )
}

/** Restores map-derived food and nest data; the caller still validates the remaining fields. */
export function unpackSnapshot(value: unknown): GameState | undefined {
  if (!value || typeof value !== 'object') return undefined
  const wire = value as Partial<WireState>
  const foods = wire.foods
  const nests = wire.nests
  if (typeof foods !== 'string' || foods.length !== FOODS.length || /[^01]/.test(foods)) return undefined
  if (
    !Array.isArray(nests) ||
    nests.length !== NESTS.length ||
    !nests.every((health) => typeof health === 'number' && health >= 0 && health <= 100)
  )
    return undefined
  return {
    ...(wire as WireState),
    foods: FOODS.map((_, index) => foodState(index, foods[index] === '1')),
    nests: nests.map((health, index) => nestState(index, health))
  }
}

/**
 * State for retrying a lost run from the start of its season. The clock keeps running forward (so audio
 * and guest views never see time rewind), rabbits are back on their feet, and bedding already in the
 * den stays there: only a bundle that was in someone's mouth returns to the field.
 */
export function retryState(checkpoint: GameState, current: GameState): GameState {
  const state: GameState = { ...structuredClone(checkpoint), time: current.time }
  for (const player of state.players)
    Object.assign(player, { health: 100, hunger: Math.max(player.hunger, 60), downed: false, carrying: null })
  if (state.chapter === 1) {
    state.bedding = current.bedding
    state.straws = current.straws.map((straw) => ({
      ...straw,
      active: straw.active || current.players.some((player) => player.carrying === straw.id)
    }))
  }
  return state
}

export class Game {
  state: GameState
  private inputs = new Map<string, Input>()
  private movements = new Map<string, Movement>()
  private cover = new Map<string, { crouch: boolean; inGrass: boolean; cover: Cover; sprinting: boolean }>()
  private foodReady = new Map<string, number>()
  private homes = new Map<string, { x: number; z: number }>()
  private spawnIn = RULES.predatorSpawnSeconds
  private predatorSequence = PREDATOR_STARTS.length
  private seed: number
  private minds = new Map<string, Mind>()
  private scents = new Map<string, Scent>()
  private rolls = new Map<string, Roll>()
  private dropIn = new Map<string, number>()
  private chains = new Map<string, number>()
  private wet = new Set<string>()
  private droppingSequence = 0
  /** Recent footsteps per rabbit, oldest first; kits follow these. */
  private trails = new Map<string, { x: number; z: number }[]>()

  constructor(
    seed = 1,
    private readonly terrain: Terrain = mapTerrain
  ) {
    this.seed = Number.isFinite(seed) ? seed >>> 0 : 1
    this.state = {
      time: 0,
      players: [],
      foods: FOODS.map((_, index) => foodState(index, true)),
      nests: NESTS.map((_, index) => nestState(index, 100)),
      predators: PREDATOR_STARTS.map(({ kind, x, z }, index) => ({
        id: `predator-${index}`,
        kind,
        x,
        y: predatorHeight(kind, x, z),
        z,
        angle: index * 1.7,
        state: 'patrol',
        targetId: null,
        suspicion: 0
      })),
      droppings: [],
      delivered: 0,
      goal: 24,
      phase: 'playing',
      chapter: 0,
      bedding: 0,
      straws: createStraws(),
      kits: []
    }
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
    return this.seed / 4294967296
  }

  addPlayer(id: string, name: string) {
    if (
      typeof id !== 'string' ||
      !id.trim() ||
      id.length > 128 ||
      typeof name !== 'string' ||
      this.state.phase !== 'playing' ||
      this.state.players.some((player) => player.id === id)
    )
      return
    this.state.players.push({
      id,
      name: name.slice(0, 40),
      x: SPAWN.x,
      y: heightAt(SPAWN.x, SPAWN.z),
      z: SPAWN.z,
      angle: 0,
      hunger: 100,
      health: 100,
      hidden: true,
      downed: false,
      score: 0,
      age: 0,
      foodEaten: 0,
      growth: 0,
      pregnant: false,
      pregnancy: 0,
      bath: 0,
      color: pickPlayerColor(this.state.players),
      carrying: null
    })
    this.dropIn.set(id, this.nextDropping())
  }

  private nextDropping() {
    const [min, max] = STEALTH.droppingInterval
    return min + this.random() * (max - min)
  }

  private mind(id: string) {
    let mind = this.minds.get(id)
    if (!mind) this.minds.set(id, (mind = newMind()))
    return mind
  }

  /** Drops a pellet; jumping or sprinting sends it rolling along the rabbit's heading. Tunnel pellets stay put. */
  private drop(player: Player, sprinting: boolean) {
    const state = this.state
    const id = `poo-${this.droppingSequence++}`
    const underground = isUnderground(player.x, player.y, player.z)
    const push = player.y - heightAt(player.x, player.z) > 0.05 ? 2 : sprinting ? 3 : 0
    const direction = player.angle + (this.random() - 0.5) * 0.8
    const roll: Roll = {
      x: player.x,
      y: player.y + 0.2,
      z: player.z,
      vx: Math.sin(direction) * push * (0.8 + this.random() * 0.4),
      vy: 0,
      vz: Math.cos(direction) * push * (0.8 + this.random() * 0.4)
    }
    state.droppings.push({
      id,
      x: round(roll.x),
      y: round(underground ? player.y : roll.y),
      z: round(roll.z),
      t: round(state.time)
    })
    this.scents.set(id, { owner: player.id, chain: this.chains.get(player.id) ?? 0 })
    if (!underground) this.rolls.set(id, roll)
  }

  private breakScent(player: Player) {
    this.chains.set(player.id, (this.chains.get(player.id) ?? 0) + 1)
  }

  /** A dropped bundle returns to where it was found. */
  private dropStraw(player: Player) {
    const straw = this.state.straws.find((entry) => entry.id === player.carrying)
    if (straw) straw.active = true
    player.carrying = null
  }

  removePlayer(id: string) {
    const leaving = this.state.players.find((player) => player.id === id)
    if (leaving) this.dropStraw(leaving)
    this.trails.delete(id)
    this.state.players = this.state.players.filter((player) => player.id !== id)
    this.inputs.delete(id)
    this.movements.delete(id)
    this.dropIn.delete(id)
    this.wet.delete(id)
    this.cover.delete(id)
    for (const predator of this.state.predators) {
      if (predator.targetId === id) {
        predator.targetId = null
        predator.state = 'search'
        this.mind(predator.id).linger = STEALTH.searchSeconds
      }
    }
  }

  setInput(id: string, input: Input) {
    if (!this.state.players.some((player) => player.id === id)) return
    if (!input || typeof input !== 'object') {
      this.inputs.set(id, { ...idle })
      return
    }
    const axis = (value: number) => (typeof value === 'number' && Number.isFinite(value) ? clamp(value, -1, 1) : 0)
    this.inputs.set(id, {
      moveX: axis(input.moveX),
      moveZ: axis(input.moveZ),
      jump: input.jump === true,
      sprint: input.sprint === true,
      crouch: input.crouch === true,
      interact: input.interact === true
    })
  }

  step(dt: number) {
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0 || this.state.phase !== 'playing') return
    let remaining = Math.min(dt, 0.25)
    while (remaining > 1e-9 && this.state.phase === 'playing') {
      const delta = Math.min(remaining, 1 / 60)
      this.tick(delta)
      remaining -= delta
    }
  }

  private tick(dt: number) {
    const state = this.state
    state.time += dt
    for (const food of state.foods) {
      if (!food.active && state.time >= (this.foodReady.get(food.id) ?? Infinity)) food.active = true
    }
    for (const player of state.players) {
      if (player.downed) continue
      const input = this.inputs.get(player.id) ?? idle
      let movement = this.movements.get(player.id)
      if (!movement) this.movements.set(player.id, (movement = { velocity: 0, jumpHeld: false }))
      moveRabbit(player, input, dt, movement)
      let trail = this.trails.get(player.id)
      if (!trail) this.trails.set(player.id, (trail = []))
      const last = trail[trail.length - 1]
      if (!last || distance(last, player) > 0.5) {
        trail.push({ x: player.x, z: player.z })
        if (trail.length > 40) trail.shift()
      }
      const cover = coverAt(player.x, player.y, player.z, input.crouch)
      const ground = heightAt(player.x, player.z)
      const sprinting = input.sprint && !input.crouch && (input.moveX !== 0 || input.moveZ !== 0)
      player.hidden = cover !== 'open' && cover !== 'canopy'
      this.cover.set(player.id, {
        crouch: input.crouch,
        inGrass: inGrass(player.x, player.z) || cover === 'canopy',
        cover,
        sprinting
      })
      // Wading through water or finishing a dust bath starts a new scent chain.
      const wet = cover !== 'tunnel' && waterDepth(player.x, player.z) > 0.05
      if (wet && !this.wet.has(player.id)) this.breakScent(player)
      if (wet) this.wet.add(player.id)
      else this.wet.delete(player.id)
      if (input.crouch && !input.moveX && !input.moveZ && player.y === ground && onSand(player.x, player.z)) {
        if (player.bath < 1 && player.bath + dt / STEALTH.bathSeconds >= 1) this.breakScent(player)
        player.bath = Math.min(1, player.bath + dt / STEALTH.bathSeconds)
      } else player.bath = 0
      const dropIn = (this.dropIn.get(player.id) ?? 0) - dt
      // Rabbits keep the den clean, so resting at home leaves no scent for hunters to follow.
      if (dropIn <= 0 && !inShelter(player.x, player.z)) this.drop(player, sprinting)
      this.dropIn.set(player.id, dropIn <= 0 ? this.nextDropping() : dropIn)
      player.hunger = Math.max(
        0,
        player.hunger -
          dt *
            ((player.pregnant ? RULES.pregnancyHungerDrain : RULES.hungerDrain) +
              (sprinting ? RULES.sprintHungerDrain : 0))
      )
      const home = cover === 'shelter'
      if (player.hunger === 0) player.health = Math.max(0, player.health - 5 * dt)
      else if (home || player.hunger >= RULES.wellFed)
        player.health = Math.min(100, player.health + dt * (home ? RULES.burrowHeal : RULES.fedHeal))
      if (player.health === 0) {
        player.downed = true
        this.dropStraw(player)
        continue
      }
      player.age += dt
      for (const food of state.foods) {
        if (!food.active || distance(player, food) > 1.15 || Math.abs(player.y - food.y) > 0.8) continue
        food.active = false
        this.foodReady.set(food.id, state.time + RULES.foodRespawnSeconds)
        player.hunger = Math.min(100, player.hunger + FOOD_KINDS[food.kind].nutrition)
        player.score += 1
        player.foodEaten += 1
        state.delivered += 1
      }
      if (state.chapter === 1 && !player.carrying && cover !== 'tunnel' && player.y - ground < 1) {
        const straw = state.straws.find((entry) => entry.active && distance(player, entry) < 1.3)
        if (straw) {
          straw.active = false
          player.carrying = straw.id
        }
      }
      if (player.carrying && distance(player, BURROW) < 4) {
        player.carrying = null
        state.bedding += 1
        if (state.bedding >= CAMPAIGN.beddingGoal) state.chapter = 2
      }
      player.growth = Math.min(1, player.age / RULES.adultAge, player.foodEaten / RULES.requiredFood)
      if (state.chapter === 0 && player.growth === 1) state.chapter = 1
      if (
        state.chapter === 2 &&
        !player.pregnant &&
        player.growth === 1 &&
        player.hunger >= RULES.pregnancyNutrition &&
        !state.players.some((other) => other.pregnant)
      )
        player.pregnant = true
      if (player.pregnant && player.hunger > 0) {
        player.pregnancy = Math.min(1, player.pregnancy + dt / RULES.gestationSeconds)
        if (player.pregnancy >= 1 - 1e-9) {
          player.pregnant = false
          player.pregnancy = 0
          state.chapter = 3
          state.kits = spawnKits(player.x, player.z)
        }
      }
      if (input.interact && cover !== 'tunnel' && player.y - ground < 1) {
        for (const nest of state.nests) {
          if (!nest.active || distance(player, nest) > 2.5) continue
          nest.health = Math.max(0, nest.health - dt * 70)
          nest.active = nest.health > 0
        }
      }
      if (input.interact) {
        for (const teammate of state.players) {
          if (!teammate.downed || distance(player, teammate) > 2 || Math.abs(player.y - teammate.y) > 1.5) continue
          teammate.downed = false
          teammate.health = 35
          teammate.hunger = 35
        }
      }
      if (player.health <= 0) player.downed = true
    }
    for (const dropping of state.droppings) {
      const roll = this.rolls.get(dropping.id)
      if (!roll) continue
      const moving = rollDropping(roll, this.terrain, dt)
      roll.x = clamp(roll.x, WORLD.minX, WORLD.maxX)
      roll.z = clamp(roll.z, WORLD.minZ, WORLD.maxZ)
      Object.assign(dropping, { x: round(roll.x), y: round(roll.y), z: round(roll.z) })
      if (!moving) this.rolls.delete(dropping.id)
    }
    const expired = state.droppings.length - STEALTH.maxDroppings
    state.droppings = state.droppings.filter(
      (dropping, index) => index >= expired && state.time - dropping.t < STEALTH.droppingExpiry
    )
    if (this.scents.size > state.droppings.length) {
      const live = new Set(state.droppings.map((dropping) => dropping.id))
      for (const id of this.scents.keys())
        if (!live.has(id)) {
          this.scents.delete(id)
          this.rolls.delete(id)
        }
    }
    // Surface predators cannot smell pellets left down in the tunnels.
    const smellable = state.droppings.filter((dropping) => !isUnderground(dropping.x, dropping.y, dropping.z))
    const crouching = (id: string) => (this.inputs.get(id) ?? idle).crouch
    const kitCover = new Map<string, Cover>()
    moveKits(
      state.kits,
      state.players,
      this.trails,
      dt,
      (kit) => (waterDepth(kit.x, kit.z) > 0.05 ? 0.55 : 1),
      (kit, dx, dz) => {
        const body = { x: kit.x, y: heightAt(kit.x, kit.z), z: kit.z }
        // Kits squeeze under logs; if a step is blocked they wait for the trail to lead around.
        if (move('rabbit', body, dx, dz, true, true)) Object.assign(kit, { x: body.x, z: body.z })
      },
      (kit, leader) => {
        // Kits freeze in cover when their parent crouches; in the den they are always hidden.
        const cover = coverAt(kit.x, kit.y, kit.z, !leader || crouching(leader.id))
        kitCover.set(kit.id, cover)
        return cover !== 'open' && cover !== 'canopy'
      }
    )
    const roaming = (kit: Kit) => kit.status === 'follow' || kit.status === 'wait'
    const awake = state.players.filter((player) => !player.downed)
    const kits = state.kits.filter(roaming)
    const targets: Target[] = [...awake, ...kits].map((prey) => ({
      id: prey.id,
      x: prey.x,
      y: prey.y,
      z: prey.z,
      visibility: 0
    }))
    const sated = new Set<Predator>()
    for (const predator of state.predators) {
      const night = nightVision(predator.kind, state.time)
      awake.forEach((player, index) => {
        const seen = this.cover.get(player.id) ?? { crouch: false, inGrass: false, cover: 'open', sprinting: false }
        targets[index].visibility = exposed(predator, player, seen.cover)
          ? visibility(
              { hidden: false, crouch: seen.crouch, inGrass: seen.inGrass },
              this.terrain.sightLine(predator, player)
            ) *
            (seen.sprinting ? SPRINT_NOISE : 1) *
            (player.carrying ? CAMPAIGN.carryDetection : 1) *
            night
          : 0
      })
      kits.forEach((kit, index) => {
        // Small kits are harder to spot; one caught earlier this tick is already gone.
        const cover = kitCover.get(kit.id) ?? 'open'
        targets[awake.length + index].visibility =
          roaming(kit) && exposed(predator, kit, cover)
            ? CAMPAIGN.kitDetection * this.terrain.sightLine(predator, kit) * night
            : 0
      })
      let home = this.homes.get(predator.id)
      if (!home) this.homes.set(predator.id, (home = { x: predator.x, z: predator.z }))
      const before = { x: predator.x, y: predator.y, z: predator.z }
      const chased = updatePredator(predator, this.mind(predator.id), targets, {
        dt,
        time: state.time,
        droppings: smellable,
        scents: this.scents,
        terrain: this.terrain,
        random: () => this.random()
      })
      // The stealth brain steers freely; the map then decides how far that step actually gets.
      const flight = predator.y
      const stepX = predator.x - before.x
      const stepZ = predator.z - before.z
      Object.assign(predator, before)
      const moved = move(predator.kind, predator, stepX, stepZ, true, false)
      if (!moved && !chased && (stepX || stepZ)) predator.angle += 1.2 // turn away from cliffs, logs and rocks
      predator.y = predator.kind === 'hawk' ? flight : predatorHeight(predator.kind, predator.x, predator.z)
      if (predator.state === 'patrol' && distance(predator, home) > LEASH[predator.kind])
        predator.angle = Math.atan2(home.x - predator.x, home.z - predator.z)
      // Hunters that reach the home burrow give up there and turn back.
      if (distance(predator, BURROW) < CAMPAIGN.denRadius && predator.kind !== 'hawk') {
        Object.assign(predator, { state: 'patrol', targetId: null, suspicion: 0 })
        predator.angle = Math.atan2(predator.x - BURROW.x, predator.z - BURROW.z)
        Object.assign(this.mind(predator.id), { trail: null, lastKnown: null, linger: 0 })
      }
      const target =
        chased &&
        (state.players.find((player) => player.id === chased.id) ??
          state.kits.find((kit) => kit.id === chased.id && roaming(kit)))
      if (target && distance(predator, target) < 1.3 && Math.abs(predator.y - target.y) < 1.5) {
        if ('status' in target) {
          // A predator that catches a kit carries it off and leaves the field.
          target.status = 'lost'
          sated.add(predator)
        } else {
          target.health = Math.max(0, target.health - 24 * dt)
          if (target.carrying) this.dropStraw(target)
          if (target.health === 0) target.downed = true
        }
      }
    }
    if (sated.size) state.predators = state.predators.filter((predator) => !sated.has(predator))
    const activeNests = state.nests.filter((nest) => nest.active)
    this.spawnIn -= (dt * activeNests.length * 3) / state.nests.length
    if (this.spawnIn <= 0 && activeNests.length && state.predators.length < CAMPAIGN.predatorCap[state.chapter]) {
      const nest = activeNests[Math.floor(this.random() * activeNests.length)]
      const kind = kinds[Math.floor(this.random() * kinds.length)]
      const at =
        kind === 'crocodile'
          ? CROCODILE_POOLS.reduce((best, pool) => (distance(pool, nest) < distance(best, nest) ? pool : best))
          : nest
      const id = `predator-${this.predatorSequence++}`
      this.homes.set(id, { x: at.x, z: at.z })
      state.predators.push({
        id,
        kind,
        x: at.x,
        y: predatorHeight(kind, at.x, at.z),
        z: at.z,
        angle: this.random() * Math.PI * 2,
        state: 'patrol',
        targetId: null,
        suspicion: 0
      })
      this.spawnIn = RULES.predatorSpawnSeconds
    }
    const waiting = state.kits.some(roaming)
    if (state.chapter === 3 && !waiting) state.phase = state.kits.some((kit) => kit.status === 'safe') ? 'won' : 'lost'
    else if (state.players.length && state.players.every((player) => player.downed)) state.phase = 'lost'
  }
}
