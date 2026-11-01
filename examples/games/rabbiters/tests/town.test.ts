import { describe, expect, it } from 'vitest'
import { Game, coverAt, progress, retryState, type GameState, type Player } from '../src/game'
import {
  GATES,
  NPCS,
  SPAWN,
  TUNNEL_NODES,
  ZONES,
  heightAt,
  isUnderground,
  lineOfSight,
  setStage,
  underWheels,
  vehiclesAt,
  type Point
} from '../src/map'
import { STAGES } from '../src/stages'
import { BEATS, PONTA } from '../src/stages/town/map'
import { DUSK_SECONDS, GRATE_SECONDS, NET_SECONDS, STEP } from '../src/stages/town/script'
import { KINDS, flies } from '../src/stealth'
import { CautiousBot, idle, reachable, steer } from './bot'

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

/**
 * Plays chapter 2 like a careful player who knows the way: follows the script's markers, taps E at NPCs and holds
 * it at the net and the grate, eats when hungry (where nobody watches over the food), and crawls on through a
 * storm drain if it ducks into one. With `threats` it uses the shared CautiousBot (hide and wait while suspected
 * or chased) plus a player's habits: while hidden and someone close looks its way it keeps still, it dashes
 * rather than creeps when chased, and it judges traffic at its real pace. A lost run retries from the last
 * checkpoint as the game does, and people carry it back to the step checkpoint.
 */
function playTown(seed: number, threats: boolean, limitMinutes: number) {
  let { game } = solo(seed)
  game.state.players[0].hunger = 60 // arriving from chapter 1: each chapter starts at hunger ≥ 60
  const id = game.state.players[0].id
  const policy = () => new CautiousBot(game, id, { calmSeconds: 20, threatRange: 12 })
  let bot = policy()
  let checkpoint: GameState = structuredClone(game.state)
  let pulse = false
  const log = { minutes: Infinity, retries: 0, carriedBack: 0, downed: 0, stepAt: [] as number[] }
  const delay = threats ? (seed * 11) % 30 : 0 // seeds also start out of step with the patrols and the traffic
  for (let frame = 0; frame < limitMinutes * 3600; frame++) {
    const { state } = game
    if (state.stage !== TOWN) return { ...log, minutes: Math.round((state.time / 60) * 10) / 10 }
    if (!threats) state.predators = []
    if (state.phase === 'lost') {
      log.retries++
      game = Game.resume(retryState(checkpoint, state), seed + log.retries)
      bot = policy()
      continue
    }
    if (log.stepAt.length <= state.step) log.stepAt[state.step] = Math.round(state.time)
    if (state.time < delay) {
      game.step(1 / 60)
      continue
    }
    const player = state.players[0] as Player
    const marker = town.script.markers!(state)[0]
    const food =
      player.hunger < 45 && !player.carrying
        ? state.foods
            .filter(
              (entry) =>
                entry.active &&
                reachable(player, entry) &&
                (player.hunger < 12 ||
                  !state.predators.some(
                    (predator) =>
                      distance(predator, entry) < 12 ||
                      (!flies(predator.kind) && predator.route?.some((point) => distance(point, entry) < 6))
                  ))
            )
            .sort((a, b) => distance(a, player) - distance(b, player))[0]
        : undefined
    const goal: Point = food ?? marker
    if (isUnderground(player.x, player.y, player.z)) {
      // In a drain pipe: crawl to the grate on the goal's side and hop out.
      const exits = TUNNEL_NODES.filter((node) => Math.abs(node.z - player.z) < 2)
      const out = exits.sort((a, b) => Math.abs(a.x - goal.x) - Math.abs(b.x - goal.x))[0]
      const dx = out.x - player.x
      game.setInput(id, { ...idle, moveX: Math.sign(dx), jump: Math.abs(dx) < 1 && frame % 2 === 0 })
      game.step(1 / 60)
      continue
    }
    const cover = coverAt(player.x, player.y, player.z, true)
    const watched =
      cover !== 'open' &&
      cover !== 'canopy' &&
      state.predators.some((predator) => {
        const range = distance(predator, player)
        if (flies(predator.kind) || range > KINDS[predator.kind].sight * 0.9) return false
        const facing = Math.cos(Math.atan2(player.x - predator.x, player.z - predator.z) - predator.angle)
        const eye = predator.y + KINDS[predator.kind].eye
        return (facing > 0 || range < 5) && lineOfSight(predator.x, eye, predator.z, player.x, player.y + 0.4, player.z)
      })
    const { left, ...input } =
      food && player.hunger < 12
        ? { ...idle, ...steer(player, goal), sprint: true } // starving: eat now
        : watched && !food
          ? { ...idle, crouch: true, left: distance(goal, player) }
          : bot.input(goal)
    const pace = (input.crouch ? 2.6 : input.sprint && !player.carrying ? 9 : 5.2) * (player.carrying ? 0.8 : 1)
    const hit = (t: number, moving: boolean) =>
      vehiclesAt(state.time + t).some((car) =>
        underWheels(
          car,
          player.x + (moving ? input.moveX * pace * t : 0),
          player.z + (moving ? input.moveZ * pace * t : 0),
          1.2
        )
      )
    const soon = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5]
    if (soon.some((t) => hit(t, true)) && !soon.some((t) => hit(t, false))) Object.assign(input, { moveX: 0, moveZ: 0 })
    const moving = input.moveX !== 0 || input.moveZ !== 0
    if (moving && state.predators.some((predator) => predator.targetId === id && predator.state === 'chase'))
      Object.assign(input, { crouch: false, sprint: !player.carrying })
    pulse = !pulse
    const talk = marker.kind === 'npc' && left < 2.2 && !food
    const hold =
      marker.kind === 'goal' &&
      (state.step === STEP.net || (state.step === STEP.bank && !state.open)) &&
      left < 1.6 &&
      !food
    const [x, z, downed] = [player.x, player.z, player.downed]
    game.setInput(id, {
      ...input,
      ...(hold ? { moveX: 0, moveZ: 0, crouch: false } : {}),
      interact: hold || (talk && pulse)
    })
    game.step(1 / 60)
    if (!downed && player.downed) log.downed++
    else if (distance(player, { x, z }) > 5 && game.state.stage === TOWN) log.carriedBack++
    if (game.state.phase === 'playing' && progress(game.state) > progress(checkpoint))
      checkpoint = structuredClone(game.state)
  }
  return log
}

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

  it('takes a cautious run past every enemy 20–40 minutes on three seeds', () => {
    for (const seed of [1, 2, 3]) {
      const run = playTown(seed, true, 60)
      console.info(`chapter 2 cautious seed ${seed}`, JSON.stringify(run))
      expect(run.minutes).toBeGreaterThanOrEqual(20)
      expect(run.minutes).toBeLessThanOrEqual(40)
    }
  }, 300_000)
})
