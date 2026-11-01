import { FOOD_KINDS, type FoodKind } from './food'

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
}

export interface Predator {
  id: string
  kind: 'fox' | 'wolf' | 'hawk' | 'snake' | 'crocodile'
  x: number
  y: number
  z: number
  angle: number
  state: 'patrol' | 'alert' | 'chase'
  targetId: string | null
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
  time: number
  players: Player[]
  predators: Predator[]
  foods: Food[]
  nests: Nest[]
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
const kinds: Predator['kind'][] = ['fox', 'wolf', 'hawk', 'snake', 'crocodile']
const distance = (first: { x: number; z: number }, second: { x: number; z: number }) =>
  Math.hypot(first.x - second.x, first.z - second.z)
const water = (z: number) => Math.abs(z - 10) < 2.5
const cave = (player: Player) => player.x > 23 && player.z < -15
const shelter = (player: Player) => Math.hypot(player.x + 37, player.z) < 4
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
  private foodReady = new Map<string, number>()
  private spawnIn = RULES.predatorSpawnSeconds
  private predatorSequence = 5
  private seed: number

  constructor(seed = 1) {
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
        targetId: null
      })),
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
      pregnancy: 0
    })
  }

  removePlayer(id: string) {
    this.state.players = this.state.players.filter((player) => player.id !== id)
    this.inputs.delete(id)
    this.movements.delete(id)
    for (const predator of this.state.predators) {
      if (predator.targetId === id) {
        predator.targetId = null
        predator.state = 'alert'
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
      player.hidden =
        shelter(player) ||
        (player.y < 0.6 &&
          input.crouch &&
          (GRASS_PATCHES.some(([x, z]) => Math.hypot(player.x - x, player.z - z) < 3.2) ||
            water(player.z) ||
            cave(player)))
      const sprinting = input.sprint && !input.crouch && (input.moveX || input.moveZ)
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
    for (const predator of state.predators) {
      let target: Player | undefined
      let nearest = Infinity
      for (const player of state.players) {
        if (player.downed || player.hidden) continue
        const range = distance(player, predator)
        const input = this.inputs.get(player.id) ?? idle
        const radius = (predator.kind === 'hawk' ? 18 : predator.kind === 'snake' ? 7 : 13) * (input.crouch ? 0.6 : 1)
        const direction = Math.atan2(player.x - predator.x, player.z - predator.z)
        const inSight = range < 2 || predator.state === 'chase' || Math.cos(direction - predator.angle) > -0.15
        if (range < radius && range < nearest && inSight) {
          target = player
          nearest = range
        }
      }
      predator.targetId = target?.id ?? null
      if (target) {
        predator.state = 'chase'
        predator.angle = Math.atan2(target.x - predator.x, target.z - predator.z)
      } else {
        predator.state = predator.state === 'chase' ? 'alert' : 'patrol'
        predator.angle += dt * (predator.state === 'alert' ? 2 : 0.28)
      }
      const speed = target ? (predator.kind === 'wolf' ? 7.2 : predator.kind === 'hawk' ? 8 : 4.3) : 1.5
      predator.x = clamp(predator.x + Math.sin(predator.angle) * speed * dt, -45, 45)
      predator.z = clamp(
        predator.z + Math.cos(predator.angle) * speed * dt,
        predator.kind === 'crocodile' ? 7.5 : -32,
        predator.kind === 'crocodile' ? 12.5 : 32
      )
      predator.y = predator.kind === 'hawk' ? (target ? target.y + 0.5 : 5) : 0
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
        targetId: null
      })
      this.spawnIn = RULES.predatorSpawnSeconds
    }
    if (state.players.some((player) => !player.downed && player.pregnancy === 1)) state.phase = 'won'
    else if (state.players.length && state.players.every((player) => player.downed)) state.phase = 'lost'
  }
}
