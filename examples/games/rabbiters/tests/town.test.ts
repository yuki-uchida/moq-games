import { describe, expect, it } from 'vitest'
import { Game, progress, type Player } from '../src/game'
import { GATES, NPCS, SPAWN, TUNNEL_NODES, ZONES, heightAt, isUnderground, setStage, type Point } from '../src/map'
import { STAGES } from '../src/stages'
import { BEATS, PONTA } from '../src/stages/town/map'
import { DUSK_SECONDS, GRATE_SECONDS, NET_SECONDS, STEP } from '../src/stages/town/script'
import { idle, reachable } from './bot'
import { playTown } from './town-play'

const TOWN = 1
const town = STAGES[TOWN]
const solo = (seed = 3) => {
  const game = new Game(seed, undefined, TOWN)
  game.addPlayer('rabbit', 'Rabbit')
  return { game, player: game.state.players[0] }
}
const place = (body: { x: number; y: number; z: number }, x: number, z: number) =>
  Object.assign(body, { x, z, y: heightAt(x, z) })
const advance = (game: Game, seconds: number, input = idle, id = 'rabbit') => {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) {
    game.setInput(id, input)
    game.step(1 / 60)
  }
}
const centre = (id: string) => {
  const zone = ZONES.find((entry) => entry.id === id)!
  return { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 }
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)

describe('chapter 2: 知らない町', () => {
  it('lays out a connected town: every goal and NPC is reachable from the start', () => {
    setStage(TOWN)
    for (const npc of NPCS) expect(reachable(SPAWN, npc), npc.id).toBe(true)
    for (const id of ['garbage', 'net', 'crossed', 'street-end', 'grate'])
      expect(reachable(SPAWN, centre(id)), id).toBe(true)
    // The drain behind the grate is shut until the wire is gnawed through.
    expect(GATES.length).toBeGreaterThan(0)
    expect(reachable(SPAWN, centre('exit'))).toBe(false)
  })

  it('opens with dialogue and keeps people on their own sidewalk, street or grounds', () => {
    const { game, player } = solo()
    expect(game.state.talk?.id).toBe('intro')
    const objective = town.script.objective(game.state, player)
    expect(objective).toMatchObject({ label: '目標 1 / 6' })
    expect(objective.hint).toBeTruthy()
    expect(town.script.markers!(game.state)).toHaveLength(1)
    // A pedestrian drawn by a noise in the back alleys stays on the sidewalk.
    const passer = game.state.predators.find((predator) => predator.id === 'passer-w')!
    place(player, -150, 0)
    game.noise(-90, -40, 60)
    advance(game, 20)
    expect(passer.x).toBeGreaterThanOrEqual(BEATS['passer-w'].minX)
    expect(passer.x).toBeLessThanOrEqual(BEATS['passer-w'].maxX)
  })

  it('crosses under the main road through a storm drain', () => {
    const { game, player } = solo()
    game.state.predators = []
    const [west, east] = TUNNEL_NODES
    place(player, west.x, west.z)
    advance(game, 0.2, { ...idle, crouch: true })
    expect(isUnderground(player.x, player.y, player.z)).toBe(true)
    advance(game, (east.x - west.x) / 4 + 1, { ...idle, moveX: 1 })
    expect(player.downed).toBe(false) // the cars pass overhead
    advance(game, 0.1, { ...idle, jump: true })
    expect(isUnderground(player.x, player.y, player.z)).toBe(false)
    expect(player.x).toBeCloseTo(east.x)
  })

  it('shares progress between rabbits: one talks, another gnaws, anyone leads the way out', () => {
    const game = new Game(4, undefined, TOWN)
    game.addPlayer('a', 'A')
    game.addPlayer('b', 'B')
    game.state.predators = []
    const [a, b] = game.state.players
    const hold = (rabbit: Player, seconds: number, at: Point) => {
      place(rabbit, at.x, at.z)
      advance(game, seconds, { ...idle, interact: true }, rabbit.id)
      game.setInput(rabbit.id, idle)
    }
    place(a, -88, -40)
    game.step(1 / 60)
    expect(game.state.step).toBe(STEP.ponta)
    hold(a, 0.05, { x: PONTA.x + 1.5, z: PONTA.z })
    advance(game, 60, idle, 'a')
    expect(game.state.step).toBe(STEP.net)
    hold(b, NET_SECONDS + 0.5, centre('net')) // the other rabbit gnaws
    advance(game, 30, idle, 'a')
    expect(game.state.step).toBe(STEP.cabbage)
    expect(b.carrying ?? (game.state.items.find((item) => item.id === 'cabbage')?.active && 'cabbage')).toBe('cabbage')
    // At the last goal the grate holds everyone back until a rabbit gnaws through; then anyone clears the chapter.
    game.state.step = STEP.bank
    place(a, centre('grate').x, centre('grate').z)
    advance(game, 2, { ...idle, moveX: -1 }, 'a')
    game.setInput('a', idle)
    expect(game.state.stage).toBe(TOWN)
    hold(b, GRATE_SECONDS + 0.5, centre('grate'))
    expect(game.state.open & 1).toBe(1)
    place(a, centre('exit').x, centre('exit').z)
    game.step(1 / 60)
    expect(game.state.stage).toBe(TOWN + 1)
  })

  it('brings out the dog walker at nightfall, the dog at heel and on its leash', () => {
    const { game, player } = solo()
    game.state.step = STEP.dusk
    place(player, 99, 0) // resting under the shrine floor
    advance(game, DUSK_SECONDS + 40)
    expect(game.state.step).toBe(STEP.bank)
    expect(game.state.predators.some((predator) => predator.id === 'keeper')).toBe(false)
    advance(game, 30)
    const walker = game.state.predators.find((predator) => predator.id === 'walker')!
    const dog = game.state.predators.find((predator) => predator.id === 'walker-dog')!
    expect(distance(walker, dog)).toBeLessThan(5.5)
    expect(town.look.night!(game.state)).toBeGreaterThan(0.8)
  })

  it('takes a threat-free run at least 8 minutes (talks, gnawing, errands, dusk, travel)', () => {
    const run = playTown(1, false, 20)
    console.info('chapter 2 threat-free', JSON.stringify(run))
    expect(run.minutes).toBeGreaterThanOrEqual(8)
    expect(run.minutes).toBeLessThan(15)
  }, 60_000)
})
