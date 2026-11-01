import { describe, expect, it } from 'vitest'
import { Game, PLAYER_COLORS, RULES, coverAt, pickPlayerColor, playerColor, type Input } from '../src/game'
import { FOODS, GRASS, PREDATOR_STARTS, SPAWN, WORLD, heightAt } from '../src/map'
import { FOOD_KINDS } from '../src/food'
import { CAMPAIGN } from '../src/campaign'

const idle: Input = { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false, interact: false }
const advance = (game: Game, seconds: number) => {
  for (let frame = 0; frame < seconds * 60; frame++) game.step(1 / 60)
}
const peaceful = () => {
  const game = new Game(42)
  game.addPlayer('rabbit', 'Rabbit')
  game.state.predators = []
  return game
}
/** Skip to autumn: bedding is finished, so a grown, fed rabbit can become pregnant. */
const autumn = () => {
  const game = peaceful()
  Object.assign(game.state, { chapter: 2, bedding: CAMPAIGN.beddingGoal })
  return game
}
const born = (game: Game) => {
  expect(game.state.chapter).toBe(3)
  expect(game.state.kits).toHaveLength(CAMPAIGN.kitCount)
  expect(game.state.phase).toBe('playing')
}

describe('Rabbiters authoritative simulation', () => {
  it('keeps snapshots plain, independent and seeded deterministically', () => {
    const first = new Game(42)
    const second = new Game(42)
    advance(first, RULES.predatorSpawnSeconds + 1)
    advance(second, RULES.predatorSpawnSeconds + 1)
    expect(first.state).toEqual(second.state)
    expect(JSON.parse(JSON.stringify(first.state))).toEqual(first.state)
    first.state.foods[0].active = false
    expect(second.state.foods[0].active).toBe(true)
    expect(first.state.predators).toHaveLength(PREDATOR_STARTS.length + 3)
  })

  it('validates identity and untrusted input, copies input, and clamps dt', () => {
    const game = peaceful()
    game.addPlayer('rabbit', 'Duplicate')
    game.addPlayer('', 'Invalid')
    expect(game.state.players).toHaveLength(1)
    game.setInput('rabbit', { ...idle, moveX: NaN, moveZ: Infinity, sprint: 'yes' } as unknown as Input)
    game.step(NaN)
    game.step(-1)
    game.step(Infinity)
    expect(game.state.time).toBe(0)
    game.step(100)
    expect(game.state.time).toBeCloseTo(0.25)
    expect(game.state.players[0].x).toBe(SPAWN.x)
    const input = { ...idle, moveX: 1 }
    game.setInput('rabbit', input)
    input.moveX = -1
    game.step(0.1)
    expect(game.state.players[0].x).toBeGreaterThan(SPAWN.x)
  })

  it('normalizes movement, respects bounds and makes sprint faster', () => {
    const game = peaceful()
    const player = game.state.players[0]
    game.setInput(player.id, { ...idle, moveX: 10, moveZ: 10 })
    game.step(0.1)
    expect(Math.hypot(player.x - SPAWN.x, player.z - SPAWN.z)).toBeCloseTo(0.52)
    game.setInput(player.id, { ...idle, moveX: -1, sprint: true })
    const before = player.x
    game.step(0.1)
    expect(before - player.x).toBeCloseTo(0.9)
    Object.assign(player, { x: WORLD.maxX - 1.5, z: 0, y: heightAt(WORLD.maxX - 1.5, 0) + 3 })
    game.setInput(player.id, { ...idle, moveX: 1, moveZ: 1, sprint: true })
    advance(game, 2)
    expect(player.x).toBeLessThanOrEqual(WORLD.maxX - 1)
    expect(player.y).toBeCloseTo(heightAt(player.x, player.z))
  })

  it('requires a jump for elevated food and does not auto-repeat held jumps', () => {
    const game = peaceful()
    const player = game.state.players[0]
    const food = game.state.foods[FOODS.findIndex((spot) => spot.place === 'raised')]
    Object.assign(player, { x: food.x, z: food.z, y: heightAt(food.x, food.z) })
    game.step(0.1)
    expect(food.active).toBe(true)
    game.setInput(player.id, { ...idle, jump: true })
    advance(game, 2)
    expect(food.active).toBe(false)
    expect(player.y).toBe(heightAt(food.x, food.z))
    expect(game.state.delivered).toBe(1)
  })

  it('drains hunger, refills on collection, and respawns food', () => {
    const game = peaceful()
    const player = game.state.players[0]
    player.hunger = 40
    advance(game, 1)
    expect(player.hunger).toBeLessThan(40)
    const food = game.state.foods[0]
    player.x = food.x
    player.z = food.z
    game.step(0.1)
    expect(player.hunger).toBeGreaterThan(60)
    expect(player.score).toBe(1)
    Object.assign(player, { x: SPAWN.x, z: SPAWN.z })
    advance(game, RULES.foodRespawnSeconds - 1)
    expect(food.active).toBe(false)
    advance(game, 2)
    expect(food.active).toBe(true)
  })

  it('hides in grass, shallow water and caves and targets the nearest vulnerable rabbit', () => {
    const game = new Game()
    game.addPlayer('hidden', 'Hidden')
    game.addPlayer('visible', 'Visible')
    const [hidden, visible] = game.state.players
    Object.assign(hidden, { x: -105, y: 0, z: -12 })
    Object.assign(visible, { x: -102, y: 0, z: -10 })
    game.setInput(hidden.id, { ...idle, crouch: true })
    game.state.predators = [
      { id: 'fox', kind: 'fox', x: -105, y: 0, z: -7, angle: Math.PI, state: 'patrol', targetId: null }
    ]
    game.step(0.01)
    expect(hidden.hidden).toBe(true)
    expect(game.state.predators[0].targetId).toBe('visible')
    for (const [x, z] of [
      [-55, 19],
      [96, -12]
    ]) {
      Object.assign(hidden, { x, z, y: heightAt(x, z) })
      game.step(0.01)
      expect(hidden.hidden).toBe(true)
    }
    game.removePlayer('visible')
    expect(game.state.predators[0].targetId).toBeNull()
  })

  it('protects a crouching rabbit in every grass patch, even from a nearby chasing predator', () => {
    const game = new Game()
    game.addPlayer('rabbit', 'Rabbit')
    const player = game.state.players[0]
    game.state.foods = []
    game.state.predators = [{ id: 'fox', kind: 'fox', x: 0, y: 0, z: 0, angle: 0, state: 'chase', targetId: player.id }]
    const predator = game.state.predators[0]
    game.setInput(player.id, { ...idle, crouch: true })
    for (const patch of GRASS) {
      const x = (patch.ax + patch.bx) / 2
      const z = (patch.az + patch.bz) / 2
      Object.assign(player, { x, z, y: heightAt(x, z), health: 100 })
      Object.assign(predator, { x, z, y: heightAt(x, z), state: 'chase', targetId: player.id })
      game.step(0.1)
      expect(player.hidden).toBe(true)
      expect(player.health).toBe(100)
      expect(predator.targetId).toBeNull()
    }
    game.setInput(player.id, idle)
    Object.assign(player, { x: -105, z: -12, y: 0 })
    Object.assign(predator, { x: player.x, z: player.z, y: 0, state: 'chase' })
    game.step(0.1)
    expect(player.hidden).toBe(false)
    expect(player.health).toBeLessThan(100)
  })

  it('destroys eggs only nearby through interaction and suppresses spawning', () => {
    const game = peaceful()
    const player = game.state.players[0]
    game.setInput(player.id, { ...idle, interact: true })
    advance(game, 2)
    expect(game.state.nests.every((nest) => nest.health === 100)).toBe(true)
    for (const nest of game.state.nests) {
      Object.assign(player, { x: nest.x, y: nest.y, z: nest.z })
      advance(game, 2)
      expect(nest.active).toBe(false)
      expect(nest.health).toBe(0)
    }
    advance(game, 40)
    expect(game.state.predators).toHaveLength(0)
  })

  it('allows cooperative revival, loses when all down, and freezes terminal states', () => {
    const game = peaceful()
    game.addPlayer('friend', 'Friend')
    const [player, friend] = game.state.players
    player.downed = true
    player.health = 0
    game.setInput(friend.id, { ...idle, interact: true })
    game.step(0.1)
    expect(player.downed).toBe(false)
    expect(player.health).toBeCloseTo(35, 0)
    for (const rabbit of game.state.players) {
      rabbit.hunger = 0
      rabbit.health = 0.01
    }
    game.step(0.1)
    expect(game.state.phase).toBe('lost')
    const snapshot = JSON.stringify(game.state)
    game.step(1)
    expect(JSON.stringify(game.state)).toBe(snapshot)
  })

  it('requires both age and nutrition, then gives birth solo without mating', () => {
    const game = autumn()
    const player = game.state.players[0]
    advance(game, RULES.adultAge)
    expect(player.pregnant).toBe(false)
    for (const food of game.state.foods.slice(0, RULES.requiredFood)) {
      Object.assign(player, { x: food.x, y: food.y, z: food.z })
      game.step(0.1)
    }
    expect(player.foodEaten).toBe(RULES.requiredFood)
    expect(player.growth).toBe(1)
    expect(player.pregnant).toBe(true)
    expect(player.pregnancy).toBeGreaterThan(0)
    expect(game.state.phase).toBe('playing')
    Object.assign(player, { x: SPAWN.x, y: 0, z: SPAWN.z })
    for (let elapsed = 0; elapsed < RULES.gestationSeconds; elapsed += 100) {
      player.hunger = 100
      advance(game, Math.min(100, RULES.gestationSeconds - elapsed))
    }
    born(game)
    expect(player.pregnant).toBe(false)
  })

  it('requires the full five minutes of growth even after eating enough', () => {
    const game = autumn()
    const player = game.state.players[0]
    for (const food of game.state.foods.slice(0, RULES.requiredFood)) {
      Object.assign(player, { x: food.x, y: food.y, z: food.z })
      game.step(0.1)
    }
    expect(player.age).toBeCloseTo(RULES.requiredFood / 10)
    expect(player.pregnant).toBe(false)
    Object.assign(player, { x: SPAWN.x, y: 0, z: SPAWN.z })
    advance(game, RULES.adultAge - player.age - 1)
    expect(player.pregnant).toBe(false)
    player.hunger = 100
    advance(game, 2)
    expect(player.pregnant).toBe(true)
  })

  it('slows pregnant movement and shares one rabbit birth with all players', () => {
    const game = autumn()
    game.addPlayer('friend', 'Friend')
    const [player, friend] = game.state.players
    player.pregnant = true
    game.setInput(player.id, { ...idle, moveZ: -1 })
    game.setInput(friend.id, { ...idle, moveZ: -1 })
    game.step(0.1)
    expect(Math.abs(player.z / friend.z)).toBeCloseTo(RULES.pregnancySpeed)
    player.pregnancy = 1 - 0.05 / RULES.gestationSeconds
    game.step(0.1)
    expect(friend.pregnant).toBe(false)
    born(game)
  })

  it('restores hunger by food kind and every kind counts toward growth', () => {
    for (const [kind, { nutrition }] of Object.entries(FOOD_KINDS)) {
      const game = peaceful()
      const player = game.state.players[0]
      const food =
        game.state.foods.find((item) => item.kind === kind && item.y === 0) ??
        game.state.foods.find((item) => item.kind === kind)!
      Object.assign(player, { hunger: 10, x: food.x, y: food.y, z: food.z })
      game.step(1 / 60)
      expect(food.active).toBe(false)
      expect(player.hunger).toBeCloseTo(10 + nutrition - RULES.hungerDrain / 60, 5)
      expect(player.foodEaten).toBe(1)
    }
    expect(new Set(new Game(1).state.foods.map((food) => food.kind)).size).toBe(Object.keys(FOOD_KINDS).length)
  })

  it('requires enough current nutrition to start pregnancy', () => {
    const game = autumn()
    const player = game.state.players[0]
    Object.assign(player, { age: RULES.adultAge, foodEaten: RULES.requiredFood, hunger: 30 })
    game.step(0.1)
    expect(player.growth).toBe(1)
    expect(player.pregnant).toBe(false)
    Object.assign(player, { x: game.state.foods[0].x, z: game.state.foods[0].z })
    game.step(0.1)
    expect(player.pregnant).toBe(true)
  })

  it('requires more food during pregnancy and pauses birth while starving', () => {
    const game = autumn()
    const player = game.state.players[0]
    player.pregnant = true
    advance(game, 100 / RULES.pregnancyHungerDrain + 0.1)
    expect(player.hunger).toBe(0)
    expect(player.pregnancy).toBeLessThan(1)
    expect(game.state.phase).toBe('playing')
    const progress = player.pregnancy
    const food = game.state.foods[0]
    Object.assign(player, { x: food.x, z: food.z })
    game.step(0.1)
    expect(player.pregnancy).toBeGreaterThan(progress)
    player.pregnancy = 1 - 0.05 / RULES.gestationSeconds
    game.step(0.1)
    born(game)
  })

  it('survives growing and carrying among real predators, reaching birth from the home meadow', () => {
    const game = new Game(42)
    game.addPlayer('rabbit', 'Rabbit')
    // Bedding is covered elsewhere; this run grows up and carries to term with every hunter active.
    Object.assign(game.state, { chapter: 2, bedding: CAMPAIGN.beddingGoal })
    const player = game.state.players[0]
    for (let frame = 0; frame < 20 * 60 * 60 && game.state.chapter < 3 && game.state.phase === 'playing'; frame++) {
      const seeking =
        player.foodEaten < RULES.requiredFood ||
        (player.foodEaten === RULES.requiredFood ? player.hunger < 60 : player.hunger < 40)
      const foods = game.state.foods.filter(
        (food) => food.active && food.y === 0 && Math.hypot(food.x - SPAWN.x, food.z - SPAWN.z) < 18
      )
      const target =
        seeking && foods.length
          ? foods.sort((first, second) => {
              const distance = (food: { x: number; z: number }) => Math.hypot(food.x - player.x, food.z - player.z)
              return distance(first) - distance(second)
            })[0]
          : SPAWN
      const dx = target.x - player.x
      const dz = target.z - player.z
      const distance = Math.hypot(dx, dz)
      const threatened = game.state.predators.some(
        (predator) => Math.hypot(predator.x - player.x, predator.z - player.z) < 5
      )
      const inGrass = GRASS.some((patch) => Math.hypot(patch.ax - player.x, patch.az - player.z) < patch.r - 0.1)
      game.setInput(player.id, {
        ...idle,
        moveX: distance > 0.7 ? dx / distance : 0,
        moveZ: distance > 0.7 ? dz / distance : 0,
        sprint: distance > 5,
        crouch: threatened && inGrass
      })
      game.step(1 / 60)
    }
    born(game)
    expect(game.state.time).toBeGreaterThanOrEqual(RULES.adultAge + RULES.gestationSeconds - 0.1)
    expect(game.state.time).toBeLessThan(20 * 60)
    expect(player.foodEaten).toBeGreaterThan(RULES.requiredFood)
    expect(game.state.predators.length).toBeGreaterThan(PREDATOR_STARTS.length)
  }, 60_000)

  it('revives a starving pregnant teammate without losing birth progress', () => {
    const game = autumn()
    game.addPlayer('rescuer', 'Rescuer')
    const [player, rescuer] = game.state.players
    Object.assign(player, { health: 0.01, hunger: 0, pregnant: true, pregnancy: 0.5 })
    game.step(0.1)
    expect(player.downed).toBe(true)
    expect(game.state.phase).toBe('playing')
    game.setInput(rescuer.id, { ...idle, interact: true })
    game.step(0.1)
    expect(player.downed).toBe(false)
    expect(player.hunger).toBeGreaterThan(34)
    expect(player.pregnancy).toBeGreaterThanOrEqual(0.5)
    for (let elapsed = 0; elapsed < RULES.gestationSeconds / 2 + 1; elapsed += 100) {
      player.hunger = 100
      advance(game, Math.min(100, RULES.gestationSeconds / 2 + 1 - elapsed))
    }
    born(game)
  })

  it('reduces spawn frequency with fewer surviving nests', () => {
    const full = new Game(7)
    const reduced = new Game(7)
    for (const nest of reduced.state.nests.slice(2)) nest.active = false
    advance(full, RULES.predatorSpawnSeconds * 1.8)
    advance(reduced, RULES.predatorSpawnSeconds * 1.8)
    expect(full.state.predators).toHaveLength(PREDATOR_STARTS.length + 5)
    expect(reduced.state.predators).toHaveLength(PREDATOR_STARTS.length + 1)
    advance(reduced, RULES.predatorSpawnSeconds * 1.3)
    expect(reduced.state.predators).toHaveLength(PREDATOR_STARTS.length + 2)
  })

  it('damages nearby rabbits, ignores downed targets and lets high jumps evade ground predators', () => {
    const game = new Game()
    game.addPlayer('rabbit', 'Rabbit')
    const player = game.state.players[0]
    Object.assign(player, { x: -110, z: 10, y: 2 })
    expect(coverAt(-110, 0, 10, false)).toBe('open')
    game.state.predators = [{ id: 'fox', kind: 'fox', x: -110, y: 0, z: 10, angle: 0, state: 'chase', targetId: null }]
    game.step(0.01)
    expect(player.health).toBe(100)
    player.y = 0
    game.step(0.01)
    expect(player.health).toBeLessThan(100)
    game.addPlayer('friend', 'Friend')
    player.downed = true
    game.step(0.01)
    expect(game.state.predators[0].targetId).toBeNull()
  })

  it('gives each rabbit a distinct, deterministic collar colour', () => {
    const game = new Game(1)
    for (let index = 0; index < 10; index++) game.addPlayer(`p${index}`, `P${index}`)
    const slots = game.state.players.map((player) => player.color)
    expect(new Set(slots.slice(0, PLAYER_COLORS.length)).size).toBe(PLAYER_COLORS.length)
    expect(slots.slice(PLAYER_COLORS.length)).toEqual([0, 1])
    // A leaver's colour is the next one handed out, so the room stays distinct.
    game.removePlayer('p3')
    game.addPlayer('late', 'Late')
    expect(game.state.players.at(-1)!.color).toBe(3)
    expect(pickPlayerColor([{ color: 0 }, { color: 0 }, { color: 1 }])).toBe(2)
    // Every client derives the same hex; old hosts without a slot fall back to an ID hash.
    const snapshot = JSON.parse(JSON.stringify(game.state.players))
    expect(snapshot.map(playerColor)).toEqual(game.state.players.map(playerColor))
    expect(playerColor({ id: 'p1', color: 1 })).toBe(PLAYER_COLORS[1])
    expect(playerColor({ id: 'legacy' })).toBe(playerColor({ id: 'legacy' }))
    expect(PLAYER_COLORS).toContain(playerColor({ id: 'legacy' }))
  })
})
