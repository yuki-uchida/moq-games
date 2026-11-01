import { FOOD_KINDS, type FoodKind } from './food'
import {
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
}

export interface Movement {
  velocity: number
  jumpHeld: boolean
}

const idle: Input = { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false, interact: false }
export const GRASS_PATCHES = [
  [-33, -7],
  [-24, -12],
  [-22, 3],
  [-17, -22],
  [-12, 7],
  [-4, -14],
  [-1, 21],
  [7, -7],
  [12, 20],
  [19, -5],
  [25, 20]
] as const
/** Small sand pits for dust baths in the woods; the desert east of x=3 is sand too. */
export const SAND_PATCHES = [
  [-29, 17],
  [-15, -3],
  [-7, 27]
] as const
const fieldNoise = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}
/** Deterministic trees and rocks shared by the renderer and the predators' sight lines. */
export const FIELD_PROPS = Array.from({ length: 110 }, (_, index) => {
  const x = -44 + fieldNoise(index + 10) * 88
  const z = -31 + fieldNoise(index + 310) * 62
  const skip = Math.abs(z - 10) < 3 || Math.hypot(x + 37, z) < 5 || Math.hypot(x - 27, z + 20) < 6
  return { index, x, z, skip, tree: !skip && x < 0 && (Math.abs(x) > 40 || Math.abs(z) > 27 || index % 4 === 0) }
})
const trees = FIELD_PROPS.filter((prop) => prop.tree)
/** Flat field; a tree trunk between eye and rabbit (rabbit within 3 m of it) leaves it partly hidden. */
export const fieldTerrain: Terrain = {
  heightAt: () => 0,
  sightLine: (from, to) =>
    trees.some((tree) => Math.hypot(tree.x - to.x, tree.z - to.z) < 3 && segmentDistance(tree, from, to) < 0.8)
      ? STEALTH.treeCover
      : 1
}
const kinds: Predator['kind'][] = ['fox', 'wolf', 'hawk', 'snake', 'crocodile']
const distance = (first: { x: number; z: number }, second: { x: number; z: number }) =>
  Math.hypot(first.x - second.x, first.z - second.z)
const water = (z: number) => Math.abs(z - 10) < 2.5
const cave = (player: Player) => player.x > 23 && player.z < -15
const shelter = (player: Player) => Math.hypot(player.x + 37, player.z) < 4
export const onSand = (point: { x: number; z: number }) =>
  point.x > 3 || SAND_PATCHES.some(([x, z]) => Math.hypot(point.x - x, point.z - z) < 2.4)
const round = (value: number) => Math.round(value * 100) / 100
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

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
  predatorSpawnSeconds: 120
} as const

export function moveRabbit(
  player: Pick<Player, 'x' | 'y' | 'z' | 'angle' | 'pregnant'>,
  input: Input,
  dt: number,
  movement: Movement
) {
  const moveX = clamp(input.moveX, -1, 1)
  const moveZ = clamp(input.moveZ, -1, 1)
  const length = Math.max(1, Math.hypot(moveX, moveZ))
  const speed =
    (input.crouch ? 2.6 : input.sprint ? 9 : 5.2) *
    (water(player.z) ? 0.55 : 1) *
    (player.pregnant ? RULES.pregnancySpeed : 1)
  player.x = clamp(player.x + (moveX / length) * speed * dt, -45, 45)
  player.z = clamp(player.z + (moveZ / length) * speed * dt, -32, 32)
  if (moveX || moveZ) player.angle = Math.atan2(moveX, moveZ)
  if (input.jump && !movement.jumpHeld && player.y === 0) movement.velocity = 10
  movement.jumpHeld = input.jump
  movement.velocity -= 18 * dt
  player.y = Math.max(0, player.y + movement.velocity * dt)
  if (player.y === 0) movement.velocity = 0
}

export class Game {
  state: GameState
  private inputs = new Map<string, Input>()
  private movements = new Map<string, Movement>()
  private cover = new Map<string, { crouch: boolean; inGrass: boolean }>()
  private foodReady = new Map<string, number>()
  private spawnIn = RULES.predatorSpawnSeconds
  private predatorSequence = 5
  private seed: number
  private minds = new Map<string, Mind>()
  private scents = new Map<string, Scent>()
  private rolls = new Map<string, Roll>()
  private dropIn = new Map<string, number>()
  private chains = new Map<string, number>()
  private wet = new Set<string>()
  private droppingSequence = 0

  constructor(
    seed = 1,
    private readonly terrain: Terrain = fieldTerrain
  ) {
    this.seed = Number.isFinite(seed) ? seed >>> 0 : 1
    const foods: Food[] = (
      [
        [-33, 0, -3, 'clover'],
        [-28, 0, -8, 'dandelion'],
        [-24, 0, -12, 'clover'],
        [-12, 0, 7, 'carrot'],
        [-4, 0, -14, 'berry'],
        [12, 0, 20, 'cabbage'],
        [27, 0, -20, 'berry'],
        [30, 0, -23, 'dandelion'],
        [-18, 2.2, -18, 'apple'],
        [7, 2.2, -8, 'apple'],
        [22, 2.2, 19, 'apple'],
        [32, 0, 4, 'carrot']
      ] as const
    ).map(([x, y, z, kind], index) => ({ id: `food-${index}`, kind, x, y, z, active: true }))
    this.state = {
      time: 0,
      players: [],
      foods,
      nests: [
        [-10, -23],
        [21, 23],
        [34, -14]
      ].map(([x, z], index) => ({ id: `nest-${index}`, x, y: 0, z, health: 100, active: true })),
      predators: kinds.map((kind, index) => ({
        id: `predator-${index}`,
        kind,
        x: index === 0 ? -17 : 10 + index * 5,
        y: kind === 'hawk' ? 5 : 0,
        z: kind === 'crocodile' ? 10 : -25 + index * 11,
        angle: 0,
        state: 'patrol',
        targetId: null,
        suspicion: 0
      })),
      droppings: [],
      delivered: 0,
      goal: 24,
      phase: 'playing'
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
      x: -37,
      y: 0,
      z: 0,
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
      bath: 0
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

  /** Drops a pellet; jumping or sprinting sends it rolling along the rabbit's heading. */
  private drop(player: Player, sprinting: boolean) {
    const state = this.state
    const id = `poo-${this.droppingSequence++}`
    const push = player.y > 0.05 ? 2 : sprinting ? 3 : 0
    const direction = player.angle + (this.random() - 0.5) * 0.8
    const roll: Roll = {
      x: player.x,
      y: player.y + 0.2,
      z: player.z,
      vx: Math.sin(direction) * push * (0.8 + this.random() * 0.4),
      vy: 0,
      vz: Math.cos(direction) * push * (0.8 + this.random() * 0.4)
    }
    state.droppings.push({ id, x: round(roll.x), y: round(roll.y), z: round(roll.z), t: round(state.time) })
    this.scents.set(id, { owner: player.id, chain: this.chains.get(player.id) ?? 0 })
    this.rolls.set(id, roll)
  }

  private breakScent(player: Player) {
    this.chains.set(player.id, (this.chains.get(player.id) ?? 0) + 1)
  }

  removePlayer(id: string) {
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
      if (!movement) {
        movement = { velocity: 0, jumpHeld: false }
        this.movements.set(player.id, movement)
      }
      moveRabbit(player, input, dt, movement)
      const inGrass = GRASS_PATCHES.some(([x, z]) => Math.hypot(player.x - x, player.z - z) < 3.2)
      player.hidden =
        shelter(player) || (player.y < 0.6 && input.crouch && (inGrass || water(player.z) || cave(player)))
      this.cover.set(player.id, { crouch: input.crouch, inGrass })
      const sprinting = input.sprint && !input.crouch && (input.moveX || input.moveZ)
      // Wading through water or finishing a dust bath starts a new scent chain.
      if (water(player.z) && !this.wet.has(player.id)) this.breakScent(player)
      if (water(player.z)) this.wet.add(player.id)
      else this.wet.delete(player.id)
      if (input.crouch && !input.moveX && !input.moveZ && player.y === 0 && onSand(player)) {
        if (player.bath < 1 && player.bath + dt / STEALTH.bathSeconds >= 1) this.breakScent(player)
        player.bath = Math.min(1, player.bath + dt / STEALTH.bathSeconds)
      } else player.bath = 0
      const dropIn = (this.dropIn.get(player.id) ?? 0) - dt
      if (dropIn <= 0) this.drop(player, Boolean(sprinting))
      this.dropIn.set(player.id, dropIn <= 0 ? this.nextDropping() : dropIn)
      player.hunger = Math.max(
        0,
        player.hunger -
          dt *
            ((player.pregnant ? RULES.pregnancyHungerDrain : RULES.hungerDrain) +
              (sprinting ? RULES.sprintHungerDrain : 0))
      )
      if (player.hunger === 0) player.health = Math.max(0, player.health - 5 * dt)
      if (player.health === 0) {
        player.downed = true
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
      player.growth = Math.min(1, player.age / RULES.adultAge, player.foodEaten / RULES.requiredFood)
      if (!player.pregnant && player.growth === 1 && player.hunger >= RULES.pregnancyNutrition) player.pregnant = true
      if (player.pregnant && player.hunger > 0) {
        player.pregnancy = Math.min(1, player.pregnancy + dt / RULES.gestationSeconds)
        if (player.pregnancy >= 1 - 1e-9) player.pregnancy = 1
      }
      if (input.interact && player.y < 1) {
        for (const nest of state.nests) {
          if (!nest.active || distance(player, nest) > 2.5) continue
          nest.health = Math.max(0, nest.health - dt * 70)
          nest.active = nest.health > 0
        }
        for (const teammate of state.players) {
          if (!teammate.downed || distance(player, teammate) > 2) continue
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
      roll.x = clamp(roll.x, -45, 45)
      roll.z = clamp(roll.z, -32, 32)
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
    const targets: Target[] = state.players
      .filter((player) => !player.downed)
      .map((player) => ({ id: player.id, x: player.x, y: player.y, z: player.z, visibility: 0 }))
    for (const predator of state.predators) {
      for (const target of targets) {
        const player = state.players.find((entry) => entry.id === target.id)!
        target.visibility = visibility(
          { hidden: player.hidden, ...(this.cover.get(player.id) ?? { crouch: false, inGrass: false }) },
          this.terrain.sightLine(predator, player)
        )
      }
      const chased = updatePredator(predator, this.mind(predator.id), targets, {
        dt,
        time: state.time,
        droppings: state.droppings,
        scents: this.scents,
        terrain: this.terrain,
        random: () => this.random()
      })
      predator.x = clamp(predator.x, -45, 45)
      predator.z = clamp(
        predator.z,
        predator.kind === 'crocodile' ? 7.5 : -32,
        predator.kind === 'crocodile' ? 12.5 : 32
      )
      const target = chased && state.players.find((player) => player.id === chased.id)
      if (target && distance(predator, target) < 1.3 && Math.abs(predator.y - target.y) < 1.5) {
        target.health = Math.max(0, target.health - 24 * dt)
        if (target.health === 0) target.downed = true
      }
    }
    const activeNests = state.nests.filter((nest) => nest.active)
    this.spawnIn -= (dt * activeNests.length) / 3
    if (this.spawnIn <= 0 && activeNests.length && state.predators.length < 12) {
      const nest = activeNests[Math.floor(this.random() * activeNests.length)]
      const kind = kinds[Math.floor(this.random() * kinds.length)]
      state.predators.push({
        id: `predator-${this.predatorSequence++}`,
        kind,
        x: nest.x,
        y: kind === 'hawk' ? 5 : 0,
        z: kind === 'crocodile' ? 10 : nest.z,
        angle: this.random() * Math.PI * 2,
        state: 'patrol',
        targetId: null,
        suspicion: 0
      })
      this.spawnIn = RULES.predatorSpawnSeconds
    }
    if (state.players.some((player) => !player.downed && player.pregnancy === 1)) state.phase = 'won'
    else if (state.players.length && state.players.every((player) => player.downed)) state.phase = 'lost'
  }
}
