import { describe, expect, it } from 'vitest'
import {
  Game,
  canEnter,
  coverAt,
  packSnapshot,
  progress,
  retryState,
  unpackSnapshot,
  type GameState,
  type Predator
} from '../src/game'
import {
  FOODS,
  FOREST,
  GATES,
  LANES,
  NPCS,
  OVERHANGS,
  STAGE_COUNT,
  TERRAIN,
  WORLD,
  ZONES,
  activeStage,
  heightAt,
  lineOfSight,
  setStage,
  stageMap,
  vehiclesAt
} from '../src/map'
import { STAGES } from '../src/stages'
import { talkLine, talkSeconds } from '../src/story'
import { CautiousBot, idle, steer } from './bot'
import { HouseBot } from './house-bot'

const HOUSE = 0
const TOWN = 1
const WATERWAY = 2
const solo = (stage: number, seed = 3) => {
  const game = new Game(seed, undefined, stage)
  game.addPlayer('rabbit', 'Rabbit')
  return { game, player: game.state.players[0] }
}
const place = (body: { x: number; y: number; z: number }, x: number, z: number) =>
  Object.assign(body, { x, z, y: heightAt(x, z) })
const advance = (game: Game, seconds: number) => {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) game.step(1 / 60)
}
const hunter = (kind: Predator['kind'], x: number, z: number, extra: Partial<Predator> = {}): Predator => ({
  id: `${kind}-test`,
  kind,
  x,
  y: heightAt(x, z),
  z,
  angle: 0,
  state: 'patrol',
  targetId: null,
  suspicion: 0,
  ...extra
})
const centre = (id: string) => {
  const zone = ZONES.find((entry) => entry.id === id)!
  return { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 }
}

describe('Rabbiters story stages', () => {
  it('switches maps without changing the forest', () => {
    setStage(FOREST)
    const samples = [heightAt(-118, 0), heightAt(0, -8), heightAt(15.3, -72.7), lineOfSight(-118, 1, 0, 0, 1, -8)]
    const forestFoods = FOODS
    const reference = new Game(9)
    reference.addPlayer('a', 'A')
    for (const stage of [HOUSE, TOWN, WATERWAY]) {
      setStage(stage)
      expect(WORLD).toBe(stageMap(stage).world)
      expect(TERRAIN.nx * TERRAIN.nz).toBeLessThanOrEqual(250_000)
    }
    // A game on another stage stepping in between must not disturb a forest game (each steps on its own map).
    const house = solo(HOUSE).game
    const forest = new Game(9)
    forest.addPlayer('a', 'A')
    for (let frame = 0; frame < 600; frame++) {
      house.step(1 / 60)
      forest.step(1 / 60)
      reference.step(1 / 60)
    }
    expect(activeStage()).toBe(FOREST)
    expect([heightAt(-118, 0), heightAt(0, -8), heightAt(15.3, -72.7), lineOfSight(-118, 1, 0, 0, 1, -8)]).toEqual(
      samples
    )
    expect(FOODS).toBe(forestFoods)
    expect(JSON.stringify(forest.state)).toBe(JSON.stringify(reference.state))
  })

  it('starts each stage from its own map with the script running', () => {
    for (let stage = 0; stage < STAGE_COUNT; stage++) {
      const { game, player } = solo(stage)
      const map = stageMap(stage)
      expect(game.state.stage).toBe(stage)
      expect(game.state.foods).toHaveLength(map.foods.length)
      expect(game.state.predators.map((predator) => predator.id)).toEqual(
        map.predatorStarts.map((start, index) => start.id ?? `predator-${index}`)
      )
      expect(player).toMatchObject({ x: map.spawn.x, z: map.spawn.z })
      expect(game.state.talk).not.toBeNull() // every chapter opens with a line
      expect(STAGES[stage].script.objective(game.state, player).title.length).toBeGreaterThan(0)
    }
  })

  it('lets rabbits under furniture that people cannot follow, and hides them there', () => {
    setStage(HOUSE)
    const table = OVERHANGS.find((roof) => roof.bottom > 2)! // the dining table: a rabbit walks in standing
    const sofa = OVERHANGS.find((roof) => roof.bottom < 1)! // the sofa: crouch to get in
    const middle = { x: (table.minX + table.maxX) / 2, z: (table.minZ + table.maxZ) / 2 }
    const outside = { x: table.minX - 1, y: 0, z: middle.z }
    expect(canEnter('rabbit', outside, table.minX + 0.2, outside.z, true, false)).toBe(true)
    expect(canEnter('human', outside, table.minX + 0.2, outside.z, true, false)).toBe(false)
    expect(canEnter('cat', outside, table.minX + 0.2, outside.z, true, false)).toBe(true)
    const beside = { x: sofa.minX - 1, y: 0, z: (sofa.minZ + sofa.maxZ) / 2 }
    expect(canEnter('rabbit', beside, sofa.minX + 0.1, beside.z, true, false)).toBe(false)
    expect(canEnter('rabbit', beside, sofa.minX + 0.1, beside.z, true, true)).toBe(true)
    expect(coverAt(middle.x, 0, middle.z, false)).toBe('under')

    // A person looking straight at a rabbit under the table does not see it; a cat close by does.
    const { game, player } = solo(HOUSE)
    place(player, middle.x, middle.z)
    game.state.predators = [hunter('human', middle.x - 6, middle.z, { angle: Math.PI / 2 })]
    advance(game, 1)
    expect(game.state.predators[0].suspicion).toBe(0)
    place(player, middle.x, middle.z)
    game.state.predators = [hunter('cat', middle.x - 2.5, middle.z, { angle: Math.PI / 2 })]
    game.step(1 / 60)
    expect(game.state.predators[0].targetId).toBe(player.id)
  })

  it('blocks a closed gate until its bit opens', () => {
    const { game, player } = solo(WATERWAY)
    const gate = GATES[0]
    place(player, gate.ax - 2, 0)
    game.setInput(player.id, { ...idle, moveX: 1 })
    advance(game, 2)
    expect(player.x).toBeLessThan(gate.ax)
    game.state.open = 1
    advance(game, 2)
    expect(player.x).toBeGreaterThan(gate.ax + 2)
  })

  it('drives cars as a pure function of time and knocks down a rabbit in their path', () => {
    const { game, player } = solo(TOWN)
    expect(LANES.length).toBeGreaterThan(0)
    expect(vehiclesAt(12.5)).toEqual(vehiclesAt(12.5))
    expect(vehiclesAt(12.5)[0]).not.toEqual(vehiclesAt(13)[0])
    const car = vehiclesAt(game.state.time + 1 / 60)[0]
    place(player, car.x, car.z)
    game.step(1 / 60)
    expect(player.downed).toBe(true)
    // Cars never travel in snapshots.
    expect(JSON.stringify(packSnapshot(game.state))).not.toContain('car-')
  })

  it('walks a patrol route, pausing at waypoints, and comes to look at a noise', () => {
    const { game } = solo(HOUSE)
    game.state.players[0].x = -100 // out of everyone's way
    // A walker of our own (the family's schedules are driven by the chapter script).
    const route = [
      { x: -34, z: 14, wait: 6 },
      { x: -34, z: -3 }
    ]
    const mom = game.spawnPredator('human', route[0].x, route[0].z, { id: 'walker', route })
    const [first, second] = mom.route!
    advance(game, (first.wait ?? 0) + 0.5) // still waiting at the first waypoint
    expect(Math.hypot(mom.x - first.x, mom.z - first.z)).toBeLessThan(1.3)
    let closest = Infinity
    for (let frame = 0; frame < 15 * 60; frame++) {
      game.step(1 / 60)
      closest = Math.min(closest, Math.hypot(mom.x - second.x, mom.z - second.z))
    }
    expect(closest).toBeLessThan(1.3)
    game.noise(mom.x + 5, mom.z + 3, 12)
    expect(mom.state).toBe('search')
    game.noise(0, 0, 0.1)
    advance(game, 0.5)
    expect(mom.state).toBe('search')
  })

  it('has people carry a caught rabbit back to the checkpoint, dropping what it held', () => {
    const { game, player } = solo(HOUSE)
    game.state.items = [{ id: 'tag', kind: 'tag', x: 5, y: 0, z: 5, active: true }]
    place(player, 5, 5)
    game.step(1 / 60)
    expect(player.carrying).toBe('tag')
    place(player, 6, 6)
    game.state.predators = [hunter('human', 6.5, 6, { state: 'chase', targetId: player.id, suspicion: 1 })]
    game.step(1 / 60)
    expect(player).toMatchObject({ x: game.respawn.x, z: game.respawn.z, carrying: null, downed: false })
    expect(game.state.items[0].active).toBe(true)
    expect(game.state.predators[0]).toMatchObject({ state: 'patrol', targetId: null })
  })

  it('queues conversations and lets every client derive the current line from the clock', () => {
    const { game } = solo(HOUSE)
    const conversations = STAGES[HOUSE].conversations
    expect(game.state.talk?.id).toBe('intro')
    game.say('pisuke_first')
    expect(game.state.talk?.id).toBe('intro')
    const start = game.state.talk!.at
    expect(talkLine(conversations, game.state.talk, start + 0.1)).toEqual(conversations.intro[0])
    advance(game, talkSeconds(conversations, 'intro') + 0.05)
    expect(game.state.talk?.id).toBe('pisuke_first')
    const at = game.state.talk!.at
    expect(talkLine(conversations, game.state.talk, at + 0.1)?.who).toBe('pisuke')
    expect(talkLine(conversations, game.state.talk, at + talkSeconds(conversations, 'pisuke_first') - 0.1)?.who).toBe(
      'pisuke'
    )
    expect(talkLine(conversations, { id: 'constructor', at: 0 }, 1)).toBeUndefined()
    advance(game, talkSeconds(conversations, 'pisuke_first') + 0.05)
    expect(game.state.talk).toBeNull()
  })

  it('detects a fresh E press for talking and keeps checkpoints in story order', () => {
    const { game, player } = solo(HOUSE)
    const tama = NPCS.find((npc) => npc.id === 'tama')!
    place(player, tama.x + 1.5, tama.z)
    game.state.predators = []
    advance(game, talkSeconds(STAGES[HOUSE].conversations, 'intro') + 0.1)
    game.state.step = 2
    const before = structuredClone(game.state)
    game.setInput(player.id, { ...idle, interact: true })
    game.step(1 / 60)
    expect(game.state.talk?.id).toBe('tama_first')
    game.setInput(player.id, idle)
    advance(game, talkSeconds(STAGES[HOUSE].conversations, 'tama_first') + 0.1)
    expect(game.state.step).toBe(3)
    expect(progress(game.state)).toBeGreaterThan(progress(before))
    // Retrying from the earlier checkpoint puts any carried item back and keeps the clock running.
    before.items = [{ id: 'tag', kind: 'tag', x: 1, y: 0, z: 1, active: false }]
    before.players[0].carrying = 'tag'
    game.state.time = 500
    const retry: GameState = retryState(before, game.state)
    expect(retry).toMatchObject({ time: 500, step: 2, talk: null })
    expect(retry.items[0].active).toBe(true)
    expect(retry.players[0].carrying).toBeNull()
    expect(Game.resume(retry).state).toBe(retry)
  })

  it('moves everyone on to the next chapter, and stops at the forest', () => {
    const { game, player } = solo(HOUSE)
    Object.assign(player, { age: 300, foodEaten: 9, health: 40 })
    game.state.step = 3
    game.nextStage()
    const town = stageMap(TOWN)
    expect(game.state).toMatchObject({ stage: TOWN, step: 0, flags: 0, open: 0, items: [], droppings: [] })
    expect(player).toMatchObject({ x: town.spawn.x, z: town.spawn.z, age: 0, foodEaten: 0, health: 100 })
    expect(game.state.foods).toHaveLength(town.foods.length)
    game.nextStage()
    game.nextStage()
    expect(game.state.stage).toBe(FOREST)
    expect(game.state.straws.length).toBeGreaterThan(0)
    expect(game.state.talk?.id).toBe('arrival')
    game.nextStage()
    expect(game.state.stage).toBe(FOREST)
  })

  it('round-trips snapshots on every stage, and reads stage-less snapshots as the forest', () => {
    for (let stage = 0; stage < STAGE_COUNT; stage++) {
      const { game } = solo(stage)
      advance(game, 1)
      const wire = JSON.parse(JSON.stringify(packSnapshot(game.state)))
      setStage(stage === FOREST ? HOUSE : FOREST)
      const state = unpackSnapshot(wire)!
      expect(activeStage()).toBe(stage)
      expect(state.stage).toBe(stage)
      expect(state.foods.map((food) => food.kind)).toEqual(stageMap(stage).foods.map((food) => food.kind))
    }
    setStage(HOUSE)
    const { stage: _stage, ...legacy } = JSON.parse(JSON.stringify(packSnapshot(new Game(1).state)))
    expect(unpackSnapshot(legacy)?.stage).toBe(FOREST)
    expect(activeStage()).toBe(FOREST)
    expect(unpackSnapshot({ ...legacy, stage: 9 })).toBeUndefined()
  })

  it('plays the placeholder chapters 1 → 3 into the forest with the path-finding bot', () => {
    const { game, player } = solo(HOUSE, 5)
    const bot = new CautiousBot(game, player.id, { spacing: 0.5 })
    const house = new HouseBot(game, player.id) // chapter 1 needs crouching, hopping and holding E
    let pulse = false
    for (let frame = 0; frame < 60 * 60 * 16 && game.state.stage < FOREST; frame++) {
      game.state.predators = [] // threat-free route; the cautious policy is exercised elsewhere
      if (game.state.stage === HOUSE) {
        game.setInput(player.id, house.input())
        game.step(1 / 60)
        continue
      }
      const marker = STAGES[game.state.stage].script.markers?.(game.state)[0]
      if (!marker) break
      const input = bot.input(marker)
      // Tap E at people (fresh presses), hold it at a goal that needs holding (the valve).
      pulse = !pulse
      const close = input.left < (marker.kind === 'npc' ? 2 : 1.2)
      game.setInput(player.id, { ...input, interact: close && (marker.kind === 'goal' || pulse) })
      game.step(1 / 60)
    }
    expect(game.state.stage).toBe(FOREST)
    expect(player.downed).toBe(false)
  }, 120_000)

  it('keeps a cautious bot hidden while a hunter looks for it', () => {
    const { game, player } = solo(HOUSE)
    const bot = new CautiousBot(game, player.id, { spacing: 0.5 })
    const table = OVERHANGS.find((roof) => roof.bottom > 2)!
    const z = (table.minZ + table.maxZ) / 2
    place(player, table.minX - 2, z)
    game.state.predators = [
      hunter('human', table.minX - 8, z, { state: 'suspicious', targetId: player.id, suspicion: 0.5 })
    ]
    let hidden = false
    for (let frame = 0; frame < 60 * 6; frame++) {
      const { left: _left, ...input } = bot.input({ x: 15, z: 0 })
      game.setInput(player.id, input)
      game.step(1 / 60)
      hidden ||= coverAt(player.x, player.y, player.z, input.crouch) === 'under'
    }
    expect(hidden).toBe(true)
    expect(steer(player, { x: 15, z: 0 }, 0.5).left).toBeGreaterThan(0)
  })
})
