import { describe, expect, it } from 'vitest'
import { Game, coverAt, progress, retryState, type GameState, type Input, type Player } from '../src/game'
import {
  GATES,
  TUNNEL_NODES,
  heightAt,
  inZone,
  isUnderground,
  setStage,
  stageMap,
  waterDepth,
  ZONES,
  type Point
} from '../src/map'
import { STAGES } from '../src/stages'
import { BEAM, CHECKPOINTS, PARK_CREATURES, RIVER_CREATURES, SPAWN, SPOTS, STONES } from '../src/stages/waterway/map'
import { HOLD, STEP, STEPS, SURGE, script, surging } from '../src/stages/waterway/script'
import { coverSpots, fieldFor, idle, reachable, steer, walkable } from './bot'

const WATERWAY = 2
const FOREST = 3
const MINUTE = 60

const solo = (seed = 3, players = 1) => {
  const game = new Game(seed, undefined, WATERWAY)
  for (let index = 0; index < players; index++) game.addPlayer(`rabbit-${index}`, `Rabbit ${index}`)
  return game
}
const place = (player: Player, x: number, z: number) => Object.assign(player, { x, z, y: heightAt(x, z) })
const advance = (game: Game, seconds: number) => {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) game.step(1 / 60)
}
const centre = (id: string) => {
  const zone = ZONES.find((entry) => entry.id === id)!
  return { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 }
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)
/** Open places a rabbit can run to in each area. */
const REFUGES: Point[] = [
  { x: -124, z: 1 },
  { x: -124, z: -20 },
  { x: -96, z: 2 },
  { x: -76, z: -20 },
  { x: -62, z: 2 },
  { x: -40, z: -30 },
  { x: -40, z: 10 },
  { x: 8, z: -30 },
  { x: 8, z: 0 },
  { x: 40, z: 0 },
  { x: 80, z: 40 },
  { x: 100, z: -50 }
]
/** The far bank, just past the swift water. */
const FAR_BANK = { x: 1.5, z: -24 }
const SANDBAR_WEST = { x: -18.5, z: -24 }
const SANDBAR_EAST = { x: -13.5, z: -24 }

/** Spots on the active map where a crouching rabbit is really hidden (cover centres that test as cover). */
const hidingSpots = () =>
  coverSpots().filter((spot) => coverAt(spot.x, heightAt(spot.x, spot.z), spot.z, true) !== 'open')

/**
 * A player who knows the chapter: walks to each goal, taps E at friends, holds it at the jobs, hops the stepping
 * stones and eats when hungry. With `patient` it plays carefully: hides (truly in cover) for a while after being
 * noticed, outruns biters, stays put while someone searches nearby, and waits for the openings a careful player
 * waits for (the job's spot clear of whoever the noise would bring, crows away from the ford, strays out of the den).
 */
class ChapterBot {
  private pulse = false
  private jumpHeld = false
  private calmAt = 0
  constructor(
    public game: Game,
    readonly id: string,
    private readonly patient: boolean
  ) {}

  rebind(game: Game) {
    this.game = game
    this.calmAt = 0
  }

  get player() {
    return this.game.state.players.find((entry) => entry.id === this.id)!
  }

  /** Heads for `goal` along walkable ground; while wary, slips into the nearest real cover and crouches there. */
  private walk(goal: Point, extra: Partial<Input> = {}): Input {
    const { state } = this.game
    const player = this.player
    if (state.predators.some((predator) => predator.targetId === player.id)) this.calmAt = state.time + 8
    const wary = this.patient && state.time < this.calmAt
    if (wary) {
      // Nearest by the walk there, not as the crow flies (the channel and river are in the way).
      const steps = (spot: Point) =>
        fieldFor(spot, 1).get(`${Math.round(player.x)},${Math.round(player.z)}`) ?? Infinity
      const spot = hidingSpots()
        .filter((entry) => distance(entry, player) < 25)
        .map((entry) => ({ entry, steps: steps(entry) }))
        .filter(({ steps }) => steps < 30)
        .sort((a, b) => a.steps - b.steps)[0]?.entry
      if (spot) {
        // Chased: dash for it. Merely noticed: sneak there low.
        const chased = state.predators.some((predator) => predator.targetId === player.id && predator.state === 'chase')
        const route = steer(player, spot, 1, true)
        if (route.left < 0.4) return { ...idle, crouch: true }
        return { ...idle, moveX: route.moveX, moveZ: route.moveZ, sprint: chased, crouch: !chased || route.left < 1.5 }
      }
    }
    const threatNear = state.predators.some((predator) => distance(predator, player) < 12)
    const route = steer(player, goal, 1)
    const sprint = !wary && !threatNear && route.left > 5
    return {
      ...idle,
      ...(route.left < 0.3 ? {} : { moveX: route.moveX, moveZ: route.moveZ }),
      sprint,
      crouch: this.patient && (wary || threatNear),
      ...extra
    }
  }

  /** Hop from stone to stone: line up on the current stone (or the bank), then jump at the next. */
  private hop(): Input {
    const player = this.player
    const route = [SPOTS.launch, STONES[0], STONES[1], SANDBAR_WEST, SANDBAR_EAST, STONES[2], STONES[3], FAR_BANK]
    let at = route.findIndex((point) => distance(point, player) < 1.1)
    const grounded = player.y <= heightAt(player.x, player.z) + 1e-6
    if (at < 0 && grounded) {
      // Not lined up: make for the closest stone (or the launch spot when back on the west bank).
      const closest = route.reduce((best, point) => (distance(point, player) < distance(best, player) ? point : best))
      return this.toward(closest, false)
    }
    if (!grounded) return this.toward(route[Math.min(route.length - 1, this.target)], true)
    // From the bank or the sandbar, only set out on a calm with time to spare before the next surge.
    const time = this.game.state.time
    const safe = route[at] === SPOTS.launch || route[at] === SANDBAR_EAST || route[at] === SANDBAR_WEST
    if (safe && route[at + 1] !== SANDBAR_EAST && (surging(time) || SURGE.cycle - (time % SURGE.cycle) < 7))
      return { ...idle, crouch: true }
    this.target = at + 1
    const next = route[this.target]
    const jump = !this.jumpHeld
    this.jumpHeld = jump
    return { ...this.toward(next, true), jump }
  }
  private target = 1

  private toward(goal: Point, sprint: boolean): Input {
    const dx = goal.x - this.player.x
    const dz = goal.z - this.player.z
    const length = Math.hypot(dx, dz)
    return length < 0.1 ? idle : { ...idle, moveX: dx / length, moveZ: dz / length, sprint }
  }

  /** Waiting in cover for an opening: the job's spot is clear of whoever would come for the noise. */
  private opening(): boolean {
    const { predators, flags } = this.game.state
    const step = this.game.state.step
    const clear = (spot: Point, reach: number, kinds: string[]) =>
      !predators.some((predator) => kinds.includes(predator.kind) && distance(predator, spot) < reach)
    if (step === STEP.handle) return clear(SPOTS.nest, 18, ['rat', 'human'])
    if (step === STEP.valve)
      return flags & 32
        ? clear({ x: -88, z: 13 }, 20, ['human'])
        : clear(SPOTS.valve, 20, ['human']) && clear(SPOTS.valve, 14, ['rat'])
    if (step === STEP.net) return clear(SPOTS.net, 34, ['human', 'child', 'dog'])
    if (step === STEP.stones)
      return !predators.some((predator) => predator.kind === 'crow' && distance(predator, { x: -18, z: -24 }) < 26)
    if (step === STEP.bridge)
      return predators.filter((predator) => predator.kind === 'dog').every((predator) => predator.z > 44)
    return true
  }

  /** Biters (rats, dogs, crows) are outrun, not hidden from: sprint to the open refuge farthest from them. */
  private flee(): Input | undefined {
    const player = this.player
    const biter = this.game.state.predators.find(
      (predator) =>
        predator.targetId === player.id &&
        predator.state === 'chase' &&
        predator.kind !== 'human' &&
        predator.kind !== 'child' &&
        distance(predator, player) < 9
    )
    if (!biter) return undefined
    const refuge = REFUGES.filter((spot) => distance(spot, player) < 40 && reachable(player, spot, 1)).sort(
      (a, b) => distance(b, biter) - distance(a, biter)
    )[0]
    if (!refuge) return undefined
    const route = steer(player, refuge, 1)
    return { ...idle, moveX: route.moveX, moveZ: route.moveZ, sprint: true }
  }

  /** Doing a noisy job only when it is clear; otherwise waiting crouched at `hide`. */
  private job(spot: Point, zone: string, hide: Point): Input {
    const player = this.player
    if (this.patient && !this.opening() && !inZone(zone, player.x, player.z))
      return distance(player, hide) > 1 ? this.walk(hide) : { ...idle, crouch: true }
    return this.walk(spot, { interact: inZone(zone, this.player.x, this.player.z) })
  }

  input(): Input {
    const { state } = this.game
    const player = this.player
    const step = state.step
    const fleeing = this.patient ? this.flee() : undefined
    if (fleeing) return fleeing
    // In cover while someone is still looking around nearby: stay put until they give up.
    const looking = state.predators.some(
      (predator) =>
        !['rat', 'crow'].includes(predator.kind) &&
        distance(predator, player) <
          (predator.state !== 'patrol' ? 16 : predator.kind === 'human' || predator.kind === 'child' ? 9 : 0)
    )
    if (this.patient && looking && coverAt(player.x, player.y, player.z, true) !== 'open' && !player.carrying)
      return { ...idle, crouch: true }
    const item = (id: string) => state.items.find((entry) => entry.id === id && entry.active)
    const carrying = player.carrying
    const tap = (goal: Point) => {
      this.pulse = !this.pulse
      return this.walk(goal, { interact: distance(player, goal) < 2.2 && this.pulse })
    }
    const wait = () => ({ ...idle, crouch: true })
    if (isUnderground(player.x, player.y, player.z)) {
      // Ducked into a cross pipe while hiding: crawl to the nearest end and hop out.
      const exit = TUNNEL_NODES.filter((node) => node.exit).sort((a, b) => distance(a, player) - distance(b, player))[0]
      this.pulse = !this.pulse
      return { ...this.toward(exit, false), jump: distance(exit, player) < 1.2 && this.pulse }
    }
    if (player.hunger < 40 && !carrying && step !== STEP.stones) {
      const food = state.foods
        .filter((entry) => entry.active && reachable(player, entry, 1))
        .sort((a, b) => distance(a, player) - distance(b, player))[0]
      if (food && distance(food, player) < 45) return this.walk(food)
    }
    switch (step) {
      case STEP.gama:
        return state.talk?.id === 'gama_first' || state.flags & 1 ? wait() : tap(SPOTS.gama)
      case STEP.handle: {
        const handle = item('handle')
        if (carrying === 'handle') return this.walk(centre('valve'))
        if (handle) return this.walk(handle)
        return this.job(SPOTS.nest, 'nest', { x: -110, z: -22.5 })
      }
      case STEP.valve: {
        return state.flags & 32
          ? this.job(SPOTS.valve2, 'valve2', { x: -96, z: 4.5 })
          : this.job(centre('valve'), 'valve', { x: -83, z: -19.8 })
      }
      case STEP.drain:
        return this.walk({ x: -76, z: 4 }, { crouch: true }) // wait by the flooded walkway, low
      case STEP.outfall:
        return this.walk(centre('outfall'))
      case STEP.stones: {
        const onWest = player.x < -31.2
        if (onWest && distance(player, SPOTS.launch) > 1) {
          // Sneak to the reeds near the launch spot and wait for the crows to pass.
          const hide = { x: -33.5, z: -27.5 }
          if (this.patient && !this.opening()) return distance(player, hide) > 1 ? this.walk(hide) : wait()
          return this.walk(SPOTS.launch)
        }
        if (onWest && this.patient && !this.opening()) return wait()
        return this.hop()
      }
      case STEP.bridge: {
        if (this.patient && !this.opening() && player.z < 8)
          return distance(player, SPOTS.hideEast) > 1 ? this.walk(SPOTS.hideEast) : wait()
        return this.walk(centre('parkgate'), { sprint: true })
      }
      case STEP.genji:
        return state.flags & 1 ? wait() : tap(SPOTS.genji)
      case STEP.dandelion: {
        if (state.flags & 1) return wait()
        const flower = state.items
          .filter((entry) => entry.kind === 'dandelion' && entry.active)
          .sort((a, b) => distance(a, player) - distance(b, player))[0]
        return carrying?.startsWith('dandelion') ? this.walk(SPOTS.genji) : flower ? this.walk(flower) : wait()
      }
      case STEP.net:
        if (state.flags & 1) return wait()
        return this.job(SPOTS.net, 'net', { x: 100, z: -20 })
      default:
        return this.walk(SPOTS.exit)
    }
  }
}

/**
 * Plays the chapter like a real session: checkpoints on progress, and a lost run (every rabbit down) restarts from
 * the last checkpoint. Returns the game time until the chapter handed over to the forest.
 */
function playthrough(seed: number, options: { threats: boolean; limit: number }) {
  let game = solo(seed)
  const bot = new ChapterBot(game, 'rabbit-0', options.threats)
  let checkpoint: GameState = structuredClone(game.state)
  let retries = 0
  let captures = 0
  const steps: number[] = []
  while (game.state.stage === WATERWAY && game.state.time < options.limit) {
    if (!options.threats) game.state.predators = []
    const before = bot.player
    const at = { x: before.x, z: before.z }
    game.setInput(bot.id, bot.input())
    game.step(1 / 60)
    if (game.state.stage !== WATERWAY) break
    const after = bot.player
    if (distance(at, after) > 6) captures++
    if (progress(game.state) > progress(checkpoint)) {
      steps.push(Math.round(game.state.time))
      checkpoint = structuredClone(game.state)
    }
    if (game.state.phase === 'lost') {
      retries++
      game = Game.resume(retryState(checkpoint, game.state), seed + retries)
      bot.rebind(game)
    }
  }
  return { game, time: game.state.time, retries, captures, steps }
}

describe('Rabbiters chapter 3: the waterway', () => {
  it('lays out sewer, river and park so every goal is reachable once its way opens', () => {
    setStage(WATERWAY)
    const map = stageMap(WATERWAY)
    expect(map.terrain.nx * map.terrain.nz).toBeLessThanOrEqual(250_000)
    expect(GATES).toHaveLength(2)
    // Sewer: Gama, the handle and the valve are reachable from the spawn; the outfall is behind the flood.
    for (const spot of [SPOTS.gama, SPOTS.handle, centre('valve')]) expect(reachable(SPAWN, spot, 1)).toBe(true)
    expect(reachable(SPAWN, centre('outfall'), 1)).toBe(false)
    setStage(WATERWAY)
    const flooded = new Game(1, undefined, WATERWAY)
    flooded.state.open = 1
    advance(flooded, 1 / 60)
    expect(reachable(SPAWN, centre('outfall'), 1)).toBe(true)
    // River: the only way across is the ford, whose swift (wadeable) water sweeps rabbits away: without stepping
    // into it the far bank cannot be reached, so the stones need jumps.
    const dry = (x: number, z: number) =>
      !inZone('current', x, z) || inZone('sandbar', x, z) || waterDepth(x, z) <= 0.05
    const seen = new Set(['-47,1'])
    const queue = [[-47, 1]]
    for (let index = 0; index < queue.length; index++) {
      const [x, z] = queue[index]
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const [nx, nz] = [x + dx, z + dz]
        if (seen.has(`${nx},${nz}`) || !dry(nx, nz) || !walkable(x, z, nx, nz)) continue
        seen.add(`${nx},${nz}`)
        queue.push([nx, nz])
      }
    }
    expect(seen.has(`${SPOTS.landing.x},${SPOTS.landing.z}`)).toBe(false)
    expect(reachable(CHECKPOINTS.river, SPOTS.landing, 1)).toBe(true) // wading in, and being swept
    for (const stone of STONES) expect(heightAt(stone.x, stone.z)).toBeGreaterThan(0)
    expect(waterDepth(-25, -26)).toBeGreaterThan(0.05)
    expect(waterDepth(-25, -26)).toBeLessThan(0.7)
    // East bank → under the bridge → the levee gap → Genji, the dandelion and the net.
    for (const spot of [centre('parkgate'), SPOTS.genji, ...SPOTS.dandelions, SPOTS.net])
      expect(reachable(SPOTS.landing, spot, 1)).toBe(true)
    expect(reachable(SPOTS.net, SPOTS.exit, 1)).toBe(false)
  })

  it('has an objective, hint and marker for every step', () => {
    const game = solo()
    const player = game.state.players[0]
    for (let step = 0; step < STEPS; step++) {
      game.state.step = step
      const objective = script.objective(game.state, player)
      expect(objective.title).toMatch(/^第3章｜/)
      expect(objective.hint?.length).toBeGreaterThan(0)
      expect(script.markers!(game.state).length).toBeGreaterThan(0)
    }
  })

  it('opens with the sewer creatures, then swaps in the river and park ones as the rabbits move on', () => {
    const game = solo()
    expect(game.state.predators.map((predator) => predator.kind).sort()).toEqual(['human', 'rat', 'rat', 'rat'])
    game.state.step = STEP.outfall
    place(game.state.players[0], centre('outfall').x, centre('outfall').z)
    advance(game, 0.1)
    expect(game.state.step).toBe(STEP.stones)
    expect(game.state.predators.map((predator) => predator.id).sort()).toEqual(
      RIVER_CREATURES.map((entry) => entry.id).sort()
    )
    place(game.state.players[0], centre('eastbank').x, centre('eastbank').z)
    advance(game, 0.1)
    place(game.state.players[0], centre('parkgate').x, centre('parkgate').z)
    advance(game, 0.1)
    expect(game.state.step).toBe(STEP.genji)
    expect(game.state.predators.map((predator) => predator.id).sort()).toEqual(
      PARK_CREATURES.map((entry) => entry.id).sort()
    )
  })

  it('lights rabbits in the worker’s torch beam and sends a caught rabbit back to the checkpoint', () => {
    const game = solo()
    const player = game.state.players[0]
    const worker = game.state.predators.find((predator) => predator.id === 'worker')!
    Object.assign(worker, { x: -110, z: 2, angle: -Math.PI / 2 }) // facing west along the south walkway
    delete worker.route // stand and look rather than walk off
    game.state.predators = [worker]
    place(player, -125, 2)
    advance(game, 1 / 60)
    expect(BEAM.minX).toBeLessThan(-114)
    // 15 m away in the dark: the worker does not notice. Lit by the torch from 6.5 m: spotted at once.
    advance(game, 0.3)
    expect(worker.state).toBe('patrol')
    place(player, -116.5, 2)
    advance(game, 0.25)
    expect(['suspicious', 'chase']).toContain(worker.state)
    game.state.step = STEP.handle
    game.state.items = [{ id: 'handle', kind: 'handle', x: SPOTS.handle.x, y: 0, z: SPOTS.handle.z, active: false }]
    player.carrying = 'handle'
    Object.assign(worker, { state: 'chase', targetId: player.id, suspicion: 1 })
    place(player, worker.x + 0.8, worker.z)
    advance(game, 1 / 60)
    expect(player).toMatchObject({ x: CHECKPOINTS.sewer.x, z: CHECKPOINTS.sewer.z, carrying: null, downed: false })
    expect(game.state.items[0].active).toBe(true)
  })

  it('sweeps a rabbit that steps into the swift ford back to the river checkpoint', () => {
    const game = solo()
    const player = game.state.players[0]
    game.state.step = STEP.stones
    game.state.predators = []
    place(player, -25, -26)
    advance(game, 1 / 60)
    expect(player).toMatchObject({ x: CHECKPOINTS.river.x, z: CHECKPOINTS.river.z })
    // Standing on a stone is fine between surges; when the ford surges, the stones are awash too.
    game.state.time = SURGE.length + 1
    place(player, STONES[2].x, STONES[2].z)
    advance(game, 0.5)
    expect(distance(player, STONES[2])).toBeLessThan(0.1)
    game.state.time = SURGE.cycle * 3
    expect(surging(game.state.time + 1 / 60)).toBe(true)
    advance(game, 1 / 60)
    expect(player).toMatchObject({ x: CHECKPOINTS.river.x, z: CHECKPOINTS.river.z })
  })

  it('shares progress in co-op: two rabbits turn the valve twice as fast and anyone can lead the way out', () => {
    const game = solo(4, 2)
    const [first, second] = game.state.players
    game.state.predators = []
    game.state.step = STEP.valve
    // Both on the north valve: half the time. Then each on its own: both valves at once.
    for (const player of [first, second]) {
      place(player, centre('valve').x, centre('valve').z)
      game.setInput(player.id, { ...idle, interact: true })
    }
    advance(game, HOLD.valve / 2 + 0.2)
    expect(game.state.step).toBe(STEP.valve)
    expect(script.markers!(game.state)).toEqual([{ ...SPOTS.valve2, kind: 'goal' }])
    place(first, SPOTS.valve2.x, SPOTS.valve2.z)
    advance(game, HOLD.valve + 0.2)
    expect(game.state.step).toBe(STEP.drain)
    for (const player of [first, second]) game.setInput(player.id, idle)
    advance(game, HOLD.drain + 1)
    expect(game.state.step).toBe(STEP.outfall)
    expect(game.state.open & 1).toBe(1)
    game.state.step = STEP.exit
    place(second, SPOTS.exit.x, SPOTS.exit.z)
    advance(game, 1 / 60)
    expect(game.state.stage).toBe(FOREST)
    expect(game.state.players.every((player) => !player.downed)).toBe(true)
  })

  it('takes a threat-free bot that knows every place at least 8 minutes', () => {
    const run = playthrough(11, { threats: false, limit: 30 * MINUTE })
    console.info(`waterway threat-free: ${(run.time / MINUTE).toFixed(1)} min, steps at ${run.steps.join(', ')} s`)
    expect(run.game.state.stage).toBe(FOREST)
    expect(run.time).toBeGreaterThanOrEqual(8 * MINUTE)
  }, 120_000)

  it.each([1, 2, 3])(
    'takes a cautious bot 20–40 minutes with every threat present (seed %i)',
    (seed) => {
      const run = playthrough(seed, { threats: true, limit: 60 * MINUTE })
      console.info(
        `waterway threats seed ${seed}: ${(run.time / MINUTE).toFixed(1)} min, retries ${run.retries}, captures ${run.captures}, steps at ${run.steps.join(', ')} s`
      )
      expect(run.game.state.stage).toBe(FOREST)
      expect(run.time).toBeGreaterThanOrEqual(20 * MINUTE)
      expect(run.time).toBeLessThanOrEqual(40 * MINUTE)
    },
    300_000
  )

  it('names every speaker and keeps the conversations short enough to read', () => {
    const def = STAGES[WATERWAY]
    for (const lines of Object.values(def.conversations))
      for (const line of lines) {
        if (line.who !== 'rabbit' && line.who !== 'narrator') expect(def.names[line.who]).toBeTruthy()
        expect(line.text.length).toBeLessThanOrEqual(48)
      }
  })
})
