import { FOOD_KINDS, type FoodKind } from './food'
import { BURROW, CAMPAIGN, createStraws, moveKits, nightVision, spawnKits, type Kit, type Straw } from './campaign'
import { CROCODILE_POOLS } from './stages/forest/map'
import {
  DEEP_WATER,
  FOODS,
  FOREST,
  GATES,
  LANES,
  NESTS,
  OVERHANGS,
  PREDATOR_STARTS,
  SPAWN,
  STAGE_COUNT,
  TUNNEL_DEPTH,
  WATER_LEVEL,
  WORLD,
  caveAt,
  caveWallBlocks,
  clampToTunnel,
  gateBlocks,
  heightAt,
  hitsBlocker,
  inBush,
  inGrass,
  inShelter,
  isUnderground,
  lightAt,
  lineOfSight,
  logOver,
  logTop,
  onSand,
  overhangAt,
  setGates,
  setStage,
  slopeAt,
  treesNear,
  tunnelExitNear,
  underWheels,
  vehiclesAt,
  waterDepth,
  type Circle,
  type Point,
  type PredatorKind,
  type Waypoint
} from './map'
import { STAGES } from './stages'
import { talkSeconds, type StageScript } from './story'
import {
  HAWK_ALTITUDE,
  KINDS,
  STEALTH,
  flies,
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
  /** The hold-E job under way this tick (gnawing, digging, turning a valve…), for the on-screen gauge. */
  task?: Task
}

/** A hold-E job: what the rabbit is doing and how far along it is (0..1). */
export interface Task {
  label: string
  progress: number
}

/** Host-side extras ride along on the predator: a patrol `route` and a chain (`leash`) around a post. */
export type Predator = PredatorBody & { route?: Waypoint[]; leash?: Circle }

/** A thing a chapter has the rabbits carry (niboshi, a collar tag). Picked up on contact; dropped back in place. */
export interface Item {
  id: string
  kind: string
  x: number
  y: number
  z: number
  active: boolean
}

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
  discoveries?: {
    predatorId: string
    targetId: string
    count: number
    stage?: number
    time?: number
    x: number
    y: number
    z: number
  }[]
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
  /** Story chapter index into STAGES: 0 house, 1 town, 2 waterway, 3 forest. */
  stage: number
  /** Objective number within the stage. */
  step: number
  /** Stage-defined bit flags. */
  flags: number
  /** Open gates, bit i = GATES[i]. */
  open: number
  items: Item[]
  /** Conversation being spoken and the game time it began; clients derive the current line. `by`: the rabbit it
   * is about (it speaks the 'rabbit' lines; default the host's rabbit). */
  talk: { id: string; at: number; by?: string } | null
}

/** Snapshot sent through the relay: food and nest positions come from the shared map. */
export type WireState = Omit<GameState, 'foods' | 'nests'> & { foods: string; nests: number[] }

export interface Movement {
  velocity: number
  jumpHeld: boolean
}

/** Where a rabbit is hiding. Each predator sees through a different subset of these. */
export type Cover = 'tunnel' | 'shelter' | 'cave' | 'under' | 'log' | 'bush' | 'canopy' | 'grass' | 'water' | 'open'
type Kind = PredatorKind | 'rabbit'
type Body = { x: number; y: number; z: number }

const idle: Input = { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false, interact: false }
/** Kinds the forest nests hatch. */
const kinds: PredatorKind[] = ['fox', 'wolf', 'hawk', 'snake', 'crocodile']
const RABBIT_BODY = 0.3
const MAX_CLIMB = 0.95 // rise per metre a walker can climb; steeper ground needs a jump or is a cliff
const MAX_STAND = 1.5 // nothing can rest on steeper ground: cliff faces are not ladders
/** Rabbit heights: standing, and crouched (low sofas and parked cars need a crouch). */
export const RABBIT_STAND = 1.3
export const RABBIT_CROUCH = 0.8
export const SPRINT_NOISE = 1.3 // sprinting thumps: predators notice the rabbit from further away
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
    const eyeY =
      eye.y === undefined
        ? heightAt(eye.x, eye.z) + 0.8
        : flies(eye.kind ?? '')
          ? eye.y
          : eye.y + (KINDS[eye.kind as PredatorKind]?.eye ?? 0.8)
    const bodyY = (body.y ?? heightAt(body.x, body.z)) + 0.4
    if (!lineOfSight(eye.x, eyeY, eye.z, body.x, bodyY, body.z)) return 0
    // Trunks in the way hide part of the rabbit; pressed right behind one it is nearly invisible, and each
    // further trunk in the line hides more.
    let seen = 1
    for (const tree of treesNear(body.x, body.z, 3))
      if (segmentDistance(tree, eye, body) < 0.8 && distance(tree, eye) > 0.8)
        seen *= distance(tree, body) < 1.5 ? STEALTH.trunkCover : STEALTH.treeCover
    return Math.max(seen, 0.1)
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

/** Collar colours: distinct hues that read on grass and sand. */
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
/** Rabbit names by collar slot: the host (first in) is always モチ, siblings join as its family. */
export const RABBIT_NAMES = ['モチ', 'きなこ', 'あんこ', 'だいふく', 'おはぎ', 'さくら', 'ゆず', 'くろまめ'] as const

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

/** Whether a creature standing at `body` may step to (x, z). Rabbits may duck under logs and low furniture. */
export function canEnter(kind: Kind, body: Body, x: number, z: number, grounded: boolean, crouch: boolean): boolean {
  if (x < WORLD.minX + 1 || x > WORLD.maxX - 1 || z < WORLD.minZ + 1 || z > WORLD.maxZ - 1) return false
  if (kind !== 'rabbit' && flies(kind)) return true
  const ground = heightAt(x, z)
  if (kind === 'crocodile') return WATER_LEVEL - ground > 0.15
  if (WATER_LEVEL - ground > DEEP_WATER) return false
  const rise = ground - body.y
  if (grounded ? rise > MAX_CLIMB * Math.hypot(x - body.x, z - body.z) + 0.02 : rise > 0.05) return false
  const radius = kind === 'rabbit' ? RABBIT_BODY : KINDS[kind].body
  if (hitsBlocker(x, z, radius) || caveWallBlocks(x, z, radius)) return false
  if (GATES.length && gateBlocks(body.x, body.z, x, z, radius)) return false
  if (kind !== 'rabbit' && kind !== 'snake' && inShelter(x, z, radius) && !inShelter(body.x, body.z, radius))
    return false
  if (OVERHANGS.length) {
    // Only bodies that fit under the roof may walk in; one already underneath may move about.
    const roof = overhangAt(x, z, radius)
    if (roof && roof !== overhangAt(body.x, body.z, radius)) {
      const clearance = kind === 'rabbit' ? (crouch && grounded ? RABBIT_CROUCH : RABBIT_STAND) : KINDS[kind].height
      if (clearance > roof.bottom) return false
    }
  }
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
  if (OVERHANGS.length) {
    // A roof overhead stops a jump short.
    const roof = overhangAt(player.x, player.z)
    if (roof && player.y > ground + Math.max(0, roof.bottom - RABBIT_STAND)) {
      player.y = ground + Math.max(0, roof.bottom - RABBIT_STAND)
      velocity = Math.min(velocity, 0)
    }
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
  if (OVERHANGS.length) {
    const roof = overhangAt(x, z)
    if (roof && y - heightAt(x, z) < roof.bottom) return 'under'
  }
  if (y - heightAt(x, z) > 0.6) return 'open'
  if (crouch && logOver(x, z)) return 'log'
  if (inBush(x, z)) return crouch ? 'bush' : 'canopy'
  if (crouch && inGrass(x, z)) return 'grass'
  if (crouch && waterDepth(x, z) > 0.05) return 'water'
  return 'open'
}

/** Whether this predator can perceive a rabbit in this cover at all (before range, angle and sight lines). */
export function exposed(predator: Predator, player: { x: number; z: number }, cover: Cover): boolean {
  if (cover === 'open') return true
  if (cover === 'canopy') return !flies(predator.kind)
  if (cover === 'water') return predator.kind === 'crocodile'
  // Under furniture or a car: people and birds miss the rabbit; cats, dogs and rats spot it up close.
  if (cover === 'under') return KINDS[predator.kind].peek && distance(predator, player) < 4
  if (cover !== 'cave') return false
  const cave = caveAt(player.x, player.z)
  return !flies(predator.kind) && caveAt(predator.x, predator.z) === cave && distance(predator, player) < 4
}

const predatorHeight = (kind: PredatorKind, x: number, z: number) =>
  flies(kind) ? heightAt(x, z) + HAWK_ALTITUDE.patrol : kind === 'crocodile' ? WATER_LEVEL - 0.3 : heightAt(x, z)
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

/**
 * Restores map-derived food and nest data for the snapshot's stage (switching the active map to it; snapshots
 * from hosts before story mode are the forest). The caller still validates the remaining fields.
 */
export function unpackSnapshot(value: unknown): GameState | undefined {
  if (!value || typeof value !== 'object') return undefined
  const wire = value as Partial<WireState>
  const stage = wire.stage === undefined ? FOREST : wire.stage
  if (!Number.isInteger(stage) || stage < 0 || stage >= STAGE_COUNT) return undefined
  setStage(stage)
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
    stage,
    foods: FOODS.map((_, index) => foodState(index, foods[index] === '1')),
    nests: nests.map((health, index) => nestState(index, health))
  }
}

/** Checkpoint order: a later stage, season or objective step is further along. */
export const progress = (state: Pick<GameState, 'stage' | 'chapter' | 'step'>) =>
  state.stage * 1e6 + state.chapter * 1e3 + state.step

/**
 * State for retrying a lost run from its last checkpoint (stage, season or objective). The clock keeps running
 * forward (so audio and guest views never see time rewind), rabbits are back on their feet, and bedding already
 * in the den stays there: only a bundle that was in someone's mouth returns to the field.
 */
export function retryState(checkpoint: GameState, current: GameState): GameState {
  const state: GameState = {
    ...structuredClone(checkpoint),
    time: current.time,
    talk: null,
    discoveries: structuredClone(current.discoveries)
  }
  state.items = state.items.map((item) => ({
    ...item,
    active: item.active || state.players.some((player) => player.carrying === item.id)
  }))
  for (const player of state.players)
    Object.assign(player, { health: 100, hunger: Math.max(player.hunger, 60), downed: false, carrying: null })
  if (state.stage === FOREST && state.chapter === 1) {
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
  private cover = new Map<
    string,
    { crouch: boolean; inGrass: boolean; cover: Cover; sprinting: boolean; light: number }
  >()
  private foodReady = new Map<string, number>()
  private homes = new Map<string, { x: number; z: number }>()
  private spawnIn = RULES.predatorSpawnSeconds
  private predatorSequence = 0
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
  /** Route progress per predator: the waypoint it is heading for and the wait left there. */
  private legs = new Map<string, { index: number; wait: number }>()
  private talkQueue: { id: string; by?: string }[] = []
  /** Rabbits holding E, for rising-edge detection. */
  private holding = new Set<string>()
  /** Hold-E jobs just completed, kept on the gauge until `until`. */
  private finished = new Map<string, { task: Task; until: number }>()

  /** A new game at `stage` (default the forest, chapter 4), running that stage's `start`. */
  constructor(
    seed = 1,
    private readonly terrain: Terrain = mapTerrain,
    stage = FOREST
  ) {
    this.seed = Number.isFinite(seed) ? seed >>> 0 : 1
    this.state = {
      time: 0,
      discoveries: [],
      players: [],
      foods: [],
      nests: [],
      predators: [],
      droppings: [],
      delivered: 0,
      goal: 24,
      phase: 'playing',
      chapter: 0,
      bedding: 0,
      straws: [],
      kits: [],
      stage,
      step: 0,
      flags: 0,
      open: 0,
      items: [],
      talk: null
    }
    this.enterStage(stage)
  }

  /** Continues from a saved state (a checkpoint) without re-running the stage's `start`. */
  static resume(state: GameState, seed = 1): Game {
    const game = new Game(seed, mapTerrain, state.stage)
    game.talkQueue = []
    game.state = state
    game.state.discoveries = state.players.flatMap((player) => {
      const entries = (state.discoveries ?? []).filter((entry) => entry.targetId === player.id)
      const latest = entries.at(-1)
      return latest ? [{ ...latest, count: entries.reduce((sum, entry) => sum + entry.count, 0) }] : []
    })
    return game
  }

  get script(): StageScript {
    return STAGES[this.state.stage].script
  }

  private get forest() {
    return this.state.stage === FOREST
  }

  /** Where a caught rabbit is put back: the stage's current checkpoint. */
  get respawn(): Point {
    return this.script.respawn?.(this.state) ?? SPAWN
  }

  private enterStage(stage: number) {
    for (const entry of this.state.discoveries ?? []) entry.stage ??= this.state.stage
    setStage(stage)
    setGates(0)
    const state = this.state
    for (const map of [
      this.cover,
      this.foodReady,
      this.homes,
      this.minds,
      this.scents,
      this.rolls,
      this.trails,
      this.legs
    ])
      map.clear()
    this.movements.clear()
    this.wet.clear()
    this.talkQueue = []
    this.spawnIn = RULES.predatorSpawnSeconds
    this.predatorSequence = PREDATOR_STARTS.length
    Object.assign(state, {
      foods: FOODS.map((_, index) => foodState(index, true)),
      nests: NESTS.map((_, index) => nestState(index, 100)),
      predators: PREDATOR_STARTS.map((start, index) =>
        this.predatorAt(start.kind, start.x, start.z, start.id ?? `predator-${index}`, index * 1.7, start)
      ),
      droppings: [],
      chapter: 0,
      bedding: 0,
      straws: stage === FOREST ? createStraws() : [],
      kits: [],
      stage,
      step: 0,
      flags: 0,
      open: 0,
      items: [],
      talk: null
    })
    for (const player of state.players) {
      // Each chapter starts fresh: grown-up timers and the seasons restart, the journey's score carries on.
      Object.assign(player, {
        x: SPAWN.x,
        y: heightAt(SPAWN.x, SPAWN.z),
        z: SPAWN.z,
        health: 100,
        hunger: Math.max(player.hunger, 60),
        hidden: true,
        downed: false,
        age: 0,
        foodEaten: 0,
        growth: 0,
        pregnant: false,
        pregnancy: 0,
        bath: 0,
        carrying: null
      })
    }
    this.script.start(this)
  }

  /** Clears the chapter: on to the next stage's map, with every rabbit at its spawn. */
  nextStage() {
    if (this.state.stage < STAGE_COUNT - 1) this.enterStage(this.state.stage + 1)
  }

  private predatorAt(
    kind: PredatorKind,
    x: number,
    z: number,
    id: string,
    angle: number,
    options: { route?: Waypoint[]; leash?: number } = {}
  ): Predator {
    const predator: Predator = {
      id,
      kind,
      x,
      y: predatorHeight(kind, x, z),
      z,
      angle,
      state: 'patrol',
      targetId: null,
      suspicion: 0
    }
    if (options.route?.length) predator.route = options.route
    if (options.leash) predator.leash = { x, z, r: options.leash }
    return predator
  }

  /** Adds a predator (a family member coming home, a dog on a walk). An existing id is returned as is. */
  spawnPredator(
    kind: PredatorKind,
    x: number,
    z: number,
    options: { id?: string; route?: Waypoint[]; leash?: number } = {}
  ): Predator {
    const existing = options.id && this.state.predators.find((predator) => predator.id === options.id)
    if (existing) return existing
    const predator = this.predatorAt(
      kind,
      x,
      z,
      options.id ?? `predator-${this.predatorSequence++}`,
      this.random() * Math.PI * 2,
      options
    )
    this.state.predators.push(predator)
    return predator
  }

  removePredator(id: string) {
    this.state.predators = this.state.predators.filter((predator) => predator.id !== id)
    this.minds.delete(id)
    this.homes.delete(id)
    this.legs.delete(id)
  }

  /** Replaces a predator's patrol route (or clears it with undefined); it starts from the first waypoint. */
  setRoute(id: string, route: Waypoint[] | undefined) {
    const predator = this.state.predators.find((entry) => entry.id === id)
    if (!predator) return
    if (route?.length) predator.route = route
    else delete predator.route
    this.legs.delete(id)
  }

  /** A sound at (x, z): every predator within `radius` that is not already chasing comes to look. */
  noise(x: number, z: number, radius: number) {
    for (const predator of this.state.predators) {
      if (predator.state === 'chase' || distance(predator, { x, z }) > radius) continue
      predator.state = 'search'
      predator.targetId = null
      Object.assign(this.mind(predator.id), {
        lastKnown: { x, z },
        linger: STEALTH.searchSeconds,
        trail: null,
        bored: 0
      })
    }
  }

  /** Queues a conversation from the stage's CONVERSATIONS; it starts as soon as the current one ends. `by`: the
   * player whose rabbit speaks its 'rabbit' lines (default the host's). */
  say(id: string, by?: string) {
    if (!this.state.talk) this.state.talk = by ? { id, at: this.state.time, by } : { id, at: this.state.time }
    else this.talkQueue.push({ id, by })
  }

  /** Marks `player` as busy with a hold-E job this tick; the HUD shows `label` with a gauge at `progress` (0..1). */
  work(player: Player, label: string, progress: number) {
    // Only a finished job reads 100%: rounding must not turn 99.6% into a completion (the gauge and the
    // game-feel layer both treat 1 as done).
    player.task = { label, progress: progress >= 1 ? 1 : Math.min(0.99, round(clamp(progress, 0, 1))) }
    // A finished job stays on the gauge (at 100%) for a moment, so everyone sees it complete.
    if (player.task.progress >= 1) this.finished.set(player.id, { task: player.task, until: this.state.time + 0.8 })
    else this.finished.delete(player.id)
  }

  /** True while no conversation is playing or queued. */
  get quiet() {
    return !this.state.talk && !this.talkQueue.length
  }

  /**
   * The default for a grabbing predator: the rabbit is carried back to the checkpoint (`respawn`), whatever it
   * held returns to its place, and the predator goes back to its rounds.
   */
  sendBack(player: Player, predator?: Predator) {
    this.dropStraw(player)
    const at = this.respawn
    Object.assign(player, { x: at.x, y: heightAt(at.x, at.z), z: at.z })
    this.movements.set(player.id, { velocity: 0, jumpHeld: false })
    this.trails.delete(player.id)
    for (const hunter of this.state.predators) {
      if (hunter.targetId !== player.id && hunter !== predator) continue
      Object.assign(hunter, { state: 'patrol', targetId: null, suspicion: 0 })
      Object.assign(this.mind(hunter.id), {
        lastKnown: null,
        trail: null,
        linger: 0,
        bored: STEALTH.boredSeconds,
        giveUp: null
      })
    }
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
    return this.seed / 4294967296
  }

  /** Names default to the collar slot's RABBIT_NAMES entry, so every client calls each rabbit the same. */
  addPlayer(id: string, name?: string) {
    if (
      typeof id !== 'string' ||
      !id.trim() ||
      id.length > 128 ||
      (name !== undefined && typeof name !== 'string') ||
      this.state.phase !== 'playing' ||
      this.state.players.some((player) => player.id === id)
    )
      return
    const color = pickPlayerColor(this.state.players)
    this.state.players.push({
      id,
      name: (name ?? RABBIT_NAMES[color]).slice(0, 40),
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
      color,
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

  /** Whatever the rabbit carries (a straw bundle or a chapter item) returns to where it was found. */
  private dropStraw(player: Player) {
    const carried =
      this.state.straws.find((entry) => entry.id === player.carrying) ??
      this.state.items.find((entry) => entry.id === player.carrying)
    if (carried) carried.active = true
    player.carrying = null
  }

  removePlayer(id: string) {
    const leaving = this.state.players.find((player) => player.id === id)
    if (leaving) this.dropStraw(leaving)
    this.trails.delete(id)
    this.state.players = this.state.players.filter((player) => player.id !== id)
    this.state.discoveries = this.state.discoveries?.filter((entry) => entry.targetId !== id)
    this.inputs.delete(id)
    this.movements.delete(id)
    this.dropIn.delete(id)
    this.wet.delete(id)
    this.cover.delete(id)
    this.holding.delete(id)
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
    setStage(this.state.stage) // several games may share one process (tests); each steps on its own map
    let remaining = Math.min(dt, 0.25)
    while (remaining > 1e-9 && this.state.phase === 'playing') {
      const delta = Math.min(remaining, 1 / 60)
      this.tick(delta)
      remaining -= delta
    }
  }

  /** Steering toward the next waypoint of a patrol route, pausing `wait` seconds at each. */
  private routeLeg(predator: Predator, dt: number) {
    const route = predator.route
    if (!route?.length) return undefined
    let leg = this.legs.get(predator.id)
    if (!leg) this.legs.set(predator.id, (leg = { index: 0, wait: -1 }))
    const point = route[leg.index % route.length]
    if (distance(predator, point) > 1.2)
      return {
        heading: Math.atan2(point.x - predator.x, point.z - predator.z),
        speed: KINDS[predator.kind].chase * 0.4
      }
    if (predator.state === 'patrol') {
      if (leg.wait < 0) leg.wait = point.wait ?? 0
      leg.wait -= dt
      if (leg.wait <= 0) Object.assign(leg, { index: (leg.index + 1) % route.length, wait: -1 })
    }
    return { heading: predator.angle, speed: 0 }
  }

  private tick(dt: number) {
    const state = this.state
    const forest = this.forest
    const stage = state.stage
    state.time += dt
    setGates(state.open)
    for (const food of state.foods) {
      if (!food.active && state.time >= (this.foodReady.get(food.id) ?? Infinity)) food.active = true
    }
    const vehicles = LANES.length ? vehiclesAt(state.time) : undefined
    for (const player of state.players) {
      const finished = this.finished.get(player.id)
      if (finished && state.time < finished.until) player.task = finished.task
      else if (player.task) {
        delete player.task
        this.finished.delete(player.id)
      }
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
        sprinting,
        light: lightAt(player.x, player.z)
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
      // A car knocks down a rabbit on the road; one ducking in a drain or under a roof is safe.
      if (vehicles && cover !== 'tunnel' && player.y - ground < 0.5)
        for (const vehicle of vehicles) if (underWheels(vehicle, player.x, player.z, RABBIT_BODY)) player.health = 0
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
      if (forest && state.chapter === 1 && !player.carrying && cover !== 'tunnel' && player.y - ground < 1) {
        const straw = state.straws.find((entry) => entry.active && distance(player, entry) < 1.3)
        if (straw) {
          straw.active = false
          player.carrying = straw.id
        }
      }
      if (state.items.length && !player.carrying && cover !== 'tunnel' && player.y - ground < 1) {
        const item = state.items.find(
          (entry) => entry.active && distance(player, entry) < 1.3 && Math.abs(player.y - entry.y) < 1.2
        )
        if (item) {
          item.active = false
          player.carrying = item.id
        }
      }
      if (forest && player.carrying && distance(player, BURROW) < CAMPAIGN.deliverRadius) {
        player.carrying = null
        state.bedding += 1
        if (state.bedding >= CAMPAIGN.beddingGoal) state.chapter = 2
      }
      player.growth = Math.min(1, player.age / RULES.adultAge, player.foodEaten / RULES.requiredFood)
      if (forest && state.chapter === 0 && player.growth === 1) state.chapter = 1
      if (
        forest &&
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
      const pressed = input.interact && !this.holding.has(player.id)
      if (input.interact) this.holding.add(player.id)
      else this.holding.delete(player.id)
      const handled = input.interact && this.script.interact?.(this, player, true, pressed) === true
      if (state.stage !== stage) return // the script cleared the chapter; the new stage starts fresh next tick
      if (!handled && input.interact && cover !== 'tunnel' && player.y - ground < 1) {
        for (const nest of state.nests) {
          if (!nest.active || distance(player, nest) > 2.5) continue
          nest.health = Math.max(0, nest.health - dt * 70)
          nest.active = nest.health > 0
          this.work(player, '卵を壊す', 1 - nest.health / 100)
        }
      }
      if (!handled && input.interact) {
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
    for (const predator of [...state.predators]) {
      const night = forest ? nightVision(predator.kind, state.time) : 1
      awake.forEach((player, index) => {
        const seen = this.cover.get(player.id) ?? {
          crouch: false,
          inGrass: false,
          cover: 'open',
          sprinting: false,
          light: 1
        }
        targets[index].visibility = exposed(predator, player, seen.cover)
          ? visibility(
              { hidden: false, crouch: seen.crouch, inGrass: seen.inGrass },
              this.terrain.sightLine(predator, player)
            ) *
            (seen.sprinting ? SPRINT_NOISE : 1) *
            (player.carrying ? CAMPAIGN.carryDetection : 1) *
            night *
            seen.light
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
      const previousTarget = predator.state === 'chase' ? predator.targetId : null
      const alreadyChased = new Set(
        state.predators.filter((hunter) => hunter.state === 'chase').map((hunter) => hunter.targetId)
      )
      const chased = updatePredator(predator, this.mind(predator.id), targets, {
        dt,
        time: state.time,
        droppings: smellable,
        scents: this.scents,
        terrain: this.terrain,
        random: () => this.random(),
        patrol: predator.route ? this.routeLeg(predator, dt) : undefined
      })
      // The stealth brain steers freely; the map then decides how far that step actually gets.
      const flight = predator.y
      // A ground hunter chasing through trees has to weave around the trunks a rabbit darts between.
      const weave =
        chased && !flies(predator.kind) && treesNear(before.x, before.z, 1.6).length ? STEALTH.thicketSlow : 1
      const stepX = (predator.x - before.x) * weave
      const stepZ = (predator.z - before.z) * weave
      Object.assign(predator, before)
      const moved = move(predator.kind, predator, stepX, stepZ, true, false)
      if (!moved && !chased && (stepX || stepZ)) predator.angle += 1.2 // turn away from cliffs, logs and rocks
      predator.y = flies(predator.kind) ? flight : predatorHeight(predator.kind, predator.x, predator.z)
      if (predator.state === 'patrol' && !predator.route && distance(predator, home) > KINDS[predator.kind].range)
        predator.angle = Math.atan2(home.x - predator.x, home.z - predator.z)
      if (predator.leash) {
        // A chained dog lunges only as far as its chain.
        const { x, z, r } = predator.leash
        const reach = distance(predator, predator.leash)
        if (reach > r)
          Object.assign(predator, { x: x + ((predator.x - x) * r) / reach, z: z + ((predator.z - z) * r) / reach })
      }
      // Hunters that reach the home burrow give up there and turn back.
      if (forest && distance(predator, BURROW) < CAMPAIGN.denRadius && predator.kind !== 'hawk') {
        Object.assign(predator, { state: 'patrol', targetId: null, suspicion: 0 })
        predator.angle = Math.atan2(predator.x - BURROW.x, predator.z - BURROW.z)
        Object.assign(this.mind(predator.id), { trail: null, lastKnown: null, linger: 0 })
      }
      if (
        chased &&
        predator.state === 'chase' &&
        previousTarget !== chased.id &&
        !alreadyChased.has(chased.id) &&
        state.players.some((player) => player.id === chased.id)
      ) {
        const discoveries = (state.discoveries ??= [])
        const count =
          discoveries.filter((entry) => entry.targetId === chased.id).reduce((sum, entry) => sum + entry.count, 0) + 1
        state.discoveries = discoveries.filter((entry) => entry.targetId !== chased.id)
        state.discoveries.push({
          predatorId: predator.id,
          targetId: chased.id,
          count,
          stage: state.stage,
          time: state.time,
          ...before
        })
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
        } else if (KINDS[predator.kind].catch === 'grab') {
          // People pick the rabbit up: the stage decides where it ends up.
          if (this.script.caught) this.script.caught(this, target, predator)
          else this.sendBack(target, predator)
          if (state.stage !== stage) return
        } else {
          target.health = Math.max(0, target.health - 24 * dt)
          if (target.carrying) this.dropStraw(target)
          if (target.health === 0) target.downed = true
        }
      }
    }
    if (sated.size) state.predators = state.predators.filter((predator) => !sated.has(predator))
    if (forest) {
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
    }
    if (state.talk && state.time - state.talk.at >= talkSeconds(STAGES[state.stage].conversations, state.talk.id)) {
      const next = this.talkQueue.shift()
      state.talk = next === undefined ? null : next.by ? { ...next, at: state.time } : { id: next.id, at: state.time }
    }
    this.script.tick(this, dt)
    if (state.stage !== stage) return
    setGates(state.open)
    const waiting = state.kits.some(roaming)
    if (forest && state.chapter === 3 && !waiting)
      state.phase = state.kits.some((kit) => kit.status === 'safe') ? 'won' : 'lost'
    else if (state.players.length && state.players.every((player) => player.downed)) state.phase = 'lost'
  }
}
