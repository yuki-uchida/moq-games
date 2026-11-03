import { describe, expect, it } from 'vitest'
import { Game, coverAt, type Player } from '../src/game'
import { NPCS, TERRAIN, heightAt, inShelter, inZone, setStage } from '../src/map'
import { STAGES, spokenLine } from '../src/stages'
import { PHASE_SECONDS, PLANS, route } from '../src/stages/house/family'
import { FLAG, GNAW_SECONDS, gnawed, has, setGnawed } from '../src/stages/house/flags'
import { CAGE, CAGE_DOOR, GATE, NIBOSHI, SPAWN, TAG, TAMA } from '../src/stages/house/map'
import { DOOR_INSIDE } from '../src/stages/house/script'
import { lineSeconds } from '../src/story'
import { idle } from './bot'
import { HouseBot, houseField } from './house-bot'

const HOUSE = 0
const solo = (seed = 3) => {
  const game = new Game(seed, undefined, HOUSE)
  game.addPlayer('a', 'A')
  return { game, player: game.state.players[0] }
}
const place = (body: { x: number; y: number; z: number }, x: number, z: number) =>
  Object.assign(body, { x, z, y: heightAt(x, z) })
const advance = (game: Game, seconds: number, each?: () => void) => {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) {
    each?.()
    game.step(1 / 60)
  }
}
const people = (game: Game) => game.state.predators.filter((entry) => entry.kind === 'human' || entry.kind === 'child')

/** Plays chapter 1 with one bot per rabbit; returns minutes of game time (Infinity if it did not clear). */
function play(seed: number, rabbits: number, threats: boolean, limitMinutes: number) {
  const game = new Game(seed, undefined, HOUSE)
  for (let index = 0; index < rabbits; index++) game.addPlayer(`r${index}`, `R${index}`)
  const bots = game.state.players.map((player) => new HouseBot(game, player.id, threats))
  let catches = 0
  const caught = STAGES[HOUSE].script.caught!
  STAGES[HOUSE].script.caught = (...args) => {
    catches++
    caught(...args)
  }
  try {
    for (let frame = 0; frame < limitMinutes * 3600 && game.state.stage === HOUSE; frame++) {
      if (!threats) game.state.predators = []
      if (game.state.phase !== 'playing') break
      for (const bot of bots) game.setInput(bot.id, bot.input())
      game.step(1 / 60)
    }
  } finally {
    STAGES[HOUSE].script.caught = caught
  }
  return { minutes: game.state.stage === HOUSE ? Infinity : game.state.time / 60, catches, game }
}

describe('Chapter 1: the house', () => {
  it('fits the engine: grid size, start, and a family member on stage from the first tick', () => {
    const { game, player } = solo()
    expect(TERRAIN.nx * TERRAIN.nz).toBeLessThanOrEqual(250_000)
    expect(player).toMatchObject({ x: SPAWN.x, z: SPAWN.z })
    expect(inZone('cage', player.x, player.z)).toBe(true)
    expect(game.state.predators[0].id).toBe('mom')
    expect(game.state.talk?.id).toBe('intro')
    // In the cage a rabbit is home: nobody minds it.
    expect(coverAt(player.x, player.y, player.z, false)).toBe('shelter')
    // ...even pressed into a corner or against the door, and not a step outside.
    for (let x = CAGE.minX; x <= CAGE.maxX; x += 0.25)
      for (let z = CAGE.minZ; z <= CAGE.maxZ; z += 0.25) expect(inShelter(x, z), `${x},${z}`).toBe(true)
    expect(inShelter(CAGE_DOOR.x, CAGE_DOOR.z - 0.3)).toBe(false)
    expect(inShelter(CAGE.minX - 0.6, 18)).toBe(false)
  })

  it('routes every family schedule through the doorways', () => {
    setStage(HOUSE)
    const starts = [
      { x: 28, z: 2 },
      { x: -31, z: -19 },
      { x: 36, z: 31 },
      { x: -24, z: 12 },
      { x: 3, z: -27 }
    ]
    for (const [name, plan] of Object.entries(PLANS))
      for (const spot of plan)
        for (const from of starts)
          expect(route(from, spot).length, `${name} → ${JSON.stringify(spot)}`).toBeGreaterThan(0)
  })

  it('keeps every goal reachable for a rabbit once the doors are open', () => {
    const { game } = solo()
    game.state.open = (1 << GATE.cage) | (1 << GATE.catflap) | (1 << GATE.gap)
    game.step(1 / 60)
    const cell = (point: { x: number; z: number }) => `${Math.round(point.x / 0.5)},${Math.round(point.z / 0.5)}`
    for (const goal of [TAMA, NIBOSHI, TAG, { x: 32, z: 22.6 }, { x: -38.25, z: 58 }])
      expect(houseField(goal).has(cell(SPAWN)), JSON.stringify(goal)).toBe(true)
  })

  it.each([1, 2])('sends Hinata to school after the opening conversations, with %i rabbit(s)', (rabbits) => {
    const { game } = solo()
    if (rabbits === 2) game.addPlayer('b', 'B')
    const bots = game.state.players.map((player) => new HouseBot(game, player.id))
    const conversations: string[] = []
    for (let frame = 0; frame < 90 * 60 && game.state.step === 0; frame++) {
      const talk = game.state.talk?.id
      if (talk && conversations.at(-1) !== talk) conversations.push(talk)
      for (const bot of bots) game.setInput(bot.id, bot.input())
      game.step(1 / 60)
    }
    expect(conversations).toEqual(['intro', 'eat_done', 'pisuke_first', 'morning_call', 'hinata_leaves'])
    expect(game.state.time).toBeLessThan(90)
    expect(game.state.step).toBe(1)
    expect(game.state.predators.some((person) => person.id === 'hinata')).toBe(false)
    expect(game.quiet).toBe(true)
    expect(game.state.open & (1 << GATE.cage)).toBe(0)
    expect(STAGES[HOUSE].script.objective(game.state, game.state.players[0]).title).toContain('留め金')
  })

  it.each([0, FLAG.pellets, FLAG.pisuke])(
    'keeps Hinata home while an opening task is unfinished (flags %i)',
    (flags) => {
      const { game } = solo()
      Object.assign(game.state, { time: PHASE_SECONDS + 1, talk: null, flags })
      advance(game, 10)
      expect(game.state.step).toBe(0)
      expect(has(game.state, FLAG.morningCall)).toBe(false)
      expect(has(game.state, FLAG.bye)).toBe(false)
      expect(game.state.predators.some((person) => person.id === 'hinata')).toBe(true)
    }
  )

  it('gnaws the latch in 30 s of holding E; someone close by bends it back', () => {
    const { game, player } = solo()
    Object.assign(game.state, { step: 1, talk: null })
    game.state.predators = []
    place(player, DOOR_INSIDE.x, DOOR_INSIDE.z)
    game.setInput(player.id, { ...idle, interact: true })
    advance(game, 10)
    expect(gnawed(game.state)).toBeCloseTo(10, 0)
    // Mom walks up while it clinks: the latch is bent back a little.
    game.spawnPredator('human', CAGE_DOOR.x + 2, CAGE_DOOR.z - 3, { id: 'mom' })
    advance(game, 1)
    expect(gnawed(game.state)).toBeLessThan(5)
    game.removePredator('mom')
    advance(game, GNAW_SECONDS)
    expect(game.state.step).toBe(2)
    expect(game.state.open & (1 << GATE.cage)).toBeTruthy()
    expect(has(game.state, FLAG.latch)).toBe(true)
  })

  it('in a shared room, the rabbit who gnaws speaks, under its own name, on every client', () => {
    const game = new Game(3, undefined, HOUSE)
    game.addPlayer('host')
    game.addPlayer('guest')
    expect(game.state.players.map((player) => player.name)).toEqual(['モチ', 'きなこ'])
    // The narrator and the family talk about the siblings together.
    const second = game.state.talk!.at + lineSeconds(STAGES[HOUSE].conversations.intro[0]) + 0.1
    expect(spokenLine(HOUSE, { ...game.state, time: second })?.text).toContain('ウサギのモチたちは')
    Object.assign(game.state, { step: 1, talk: null })
    game.state.predators = []
    const guest = game.state.players[1]
    place(guest, DOOR_INSIDE.x, DOOR_INSIDE.z)
    game.setInput(guest.id, { ...idle, interact: true })
    advance(game, 0.1)
    expect(spokenLine(HOUSE, game.state)).toEqual({
      who: 'rabbit',
      name: 'きなこ',
      speaker: 'player:guest',
      text: STAGES[HOUSE].conversations.gnaw_start[0].text
    })
    // Mom scolds the one at the latch by name.
    game.spawnPredator('human', CAGE_DOOR.x + 2, CAGE_DOOR.z - 3, { id: 'mom' })
    advance(game, 4)
    expect(game.state.talk).toMatchObject({ id: 'gnaw_caught', by: 'guest' })
    game.state.talk!.at = game.state.time
    expect(spokenLine(HOUSE, game.state)?.text).toBe('こら、きなこ。かじっちゃダメでしょ。')
  })

  it('carries a caught rabbit back to its cage; the loose door is pushed open again, and the family starts searching', () => {
    const { game, player } = solo()
    Object.assign(game.state, { step: 4, talk: null, open: 1 << GATE.cage, flags: FLAG.latch })
    setGnawed(game.state, GNAW_SECONDS)
    game.state.items = [{ id: 'tag', kind: 'tag', x: 5, y: 0, z: -10, active: true }]
    place(player, 5, -10)
    game.step(1 / 60)
    expect(player.carrying).toBe('tag')
    const mom = game.state.predators.find((entry) => entry.id === 'mom')!
    place(player, 6, -10)
    Object.assign(mom, { x: 6.8, z: -10, state: 'chase', targetId: player.id, suspicion: 1 })
    game.step(1 / 60)
    expect(inZone('cage', player.x, player.z)).toBe(true)
    expect(player.carrying).toBeNull()
    expect(game.state.items[0].active).toBe(true)
    expect(game.state.open & (1 << GATE.cage)).toBe(0)
    expect(has(game.state, FLAG.search)).toBe(true)
    // No re-gnawing: hold E at the door for a moment.
    place(player, DOOR_INSIDE.x, DOOR_INSIDE.z)
    game.setInput(player.id, { ...idle, interact: true })
    advance(game, 1.8)
    expect(game.state.open & (1 << GATE.cage)).toBeTruthy()
    expect(game.state.step).toBe(4)
  })

  it('lets Pisuke squawk to lure people to the living room, with a cooldown', () => {
    const { game, player } = solo()
    Object.assign(game.state, { step: 2, talk: null, open: 1 << GATE.cage, flags: FLAG.latch })
    const pisuke = NPCS.find((npc) => npc.id === 'pisuke')!
    place(player, -27.4, 18) // from inside the cage, where nobody minds a rabbit
    const mom = game.state.predators.find((entry) => entry.id === 'mom')!
    place(mom, -8, 4)
    game.setInput(player.id, { ...idle, interact: true })
    game.step(1 / 60)
    game.setInput(player.id, idle)
    expect(game.state.talk?.id).toBe('pisuke_squawk')
    place(player, -45, -40) // out of the way
    let closest = Infinity
    advance(game, 25, () => (closest = Math.min(closest, Math.hypot(mom.x - pisuke.x, mom.z - pisuke.z))))
    expect(closest).toBeLessThan(8)
    place(player, -27.4, 18)
    game.setInput(player.id, { ...idle, interact: true })
    game.step(1 / 60)
    expect([game.state.talk?.id]).not.toContain('pisuke_squawk')
  })

  it('needs every rabbit still on its feet at the gap, and shares items and steps (co-op)', () => {
    const { game } = solo()
    game.addPlayer('b', 'B')
    const [a, b] = game.state.players as [Player, Player]
    Object.assign(game.state, {
      step: 5,
      talk: null,
      open: (1 << GATE.cage) | (1 << GATE.catflap) | (1 << GATE.gap),
      flags: FLAG.latch | FLAG.garden
    })
    game.state.predators = []
    place(a, -38.25, 58)
    place(b, -20, 40)
    advance(game, 15)
    expect(game.state.stage).toBe(HOUSE)
    expect(STAGES[HOUSE].script.objective(game.state, a).hint).toContain('そろう')
    place(b, -37.5, 58)
    advance(game, 15)
    expect(game.state.stage).toBe(1)
  })

  it('clears without threats (bot knows the way) in 5–20 minutes without the long opening wait', () => {
    const { minutes, game } = play(5, 1, false, 20)
    console.log(`house threat-free: ${minutes.toFixed(1)} min`)
    expect(game.state.stage).toBe(1)
    expect(minutes).toBeGreaterThanOrEqual(5)
    expect(minutes).toBeLessThan(20)
  }, 60_000)

  it.each([1, 4, 7])(
    'clears with the whole family and Gon about, for a cautious rabbit, in 17–40 minutes (seed %i)',
    (seed) => {
      const { minutes, catches } = play(seed, 1, true, 60)
      console.log(`house threat run, seed ${seed}: ${minutes.toFixed(1)} min, caught ${catches}×`)
      expect(minutes).toBeGreaterThanOrEqual(17)
      expect(minutes).toBeLessThanOrEqual(40)
    },
    240_000
  )

  it('clears in co-op with two rabbits', () => {
    const { minutes } = play(7, 2, false, 25)
    expect(minutes).toBeLessThan(25)
  }, 60_000)
})
