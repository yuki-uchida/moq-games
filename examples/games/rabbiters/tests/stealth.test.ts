import { describe, expect, it } from 'vitest'
import { GuestView } from '../src/guest-view'
import { Game, mapTerrain, type Input, type Predator } from '../src/game'
import { FORDS, GRASS, SAND_PATCHES, TREES, heightAt, lineOfSight } from '../src/map'
import {
  HAWK_ALTITUDE,
  STEALTH,
  newMind,
  nextOnTrail,
  rollDropping,
  sightZone,
  updatePredator,
  type Dropping,
  type PredatorBody,
  type Scent,
  type Terrain
} from '../src/stealth'

const idle: Input = { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false, interact: false }
const flat: Terrain = { heightAt: () => 0, sightLine: () => 1 }
const ticks = (game: Game, seconds: number, each?: () => void) => {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) {
    game.step(1 / 60)
    each?.()
  }
}
/** An open, flat spot in the home meadow with a clear view 30 m to the north. */
const OPEN: readonly [number, number] = [-125, 8]
/** One rabbit at (x, z) and one predator `range` metres north of it, facing it. */
const standoff = (range: number, kind: Predator['kind'] = 'fox', at: readonly [number, number] = OPEN) => {
  const game = new Game(3)
  game.addPlayer('rabbit', 'Rabbit')
  const rabbit = game.state.players[0]
  Object.assign(rabbit, { x: at[0], z: at[1], y: heightAt(at[0], at[1]) })
  game.state.foods = []
  game.state.nests.forEach((nest) => (nest.active = false))
  const predator: Predator = {
    id: 'p',
    kind,
    x: at[0],
    y: heightAt(at[0], at[1] - range) + (kind === 'hawk' ? 5 : 0),
    z: at[1] - range,
    angle: 0,
    state: 'patrol',
    targetId: null,
    suspicion: 0
  }
  game.state.predators = [predator]
  return { game, rabbit, predator }
}
const scents = (entries: [string, string, number][]) =>
  new Map<string, Scent>(entries.map(([id, owner, chain]) => [id, { owner, chain }]))

describe('graded detection', () => {
  it('splits sight into instant, suspicious and distant bands', () => {
    expect(sightZone(3, 13, 1, false)).toBe('close')
    expect(sightZone(9, 13, 1, false)).toBe('near')
    expect(sightZone(17, 13, 1, false)).toBe('far')
    expect(sightZone(25, 13, 1, false)).toBe('none')
    expect(sightZone(9, 13, -1, false)).toBe('none')
    expect(sightZone(1, 0, 1, true)).toBe('none')
  })

  it('spots a rabbit right in front at once', () => {
    const { game, predator } = standoff(3)
    game.step(1 / 60)
    expect(predator.state).toBe('chase')
    expect(predator.targetId).toBe('rabbit')
  })

  it('fills a "?" meter at mid range while turning and edging closer, then spots', () => {
    const { game, predator } = standoff(10)
    predator.angle = 0.6
    ticks(game, 0.5)
    expect(predator.state).toBe('suspicious')
    expect(predator.suspicion).toBeGreaterThan(0)
    expect(predator.suspicion).toBeLessThan(1)
    expect(Math.abs(predator.angle)).toBeLessThan(0.6)
    expect(predator.z).toBeGreaterThan(OPEN[1] - 10 - 8)
    let spottedAt = Infinity
    ticks(game, 4, () => {
      if (predator.state === 'chase' && spottedAt === Infinity) spottedAt = game.state.time
    })
    expect(spottedAt).toBeLessThan(4.5)
    expect(spottedAt).toBeGreaterThan(1)
  })

  it('only comes to look when the rabbit is far away, and crouching shrinks every band', () => {
    const { game, predator } = standoff(17)
    ticks(game, 1)
    expect(predator.state).toBe('search')
    expect(predator.suspicion).toBe(0)
    expect(predator.z).toBeGreaterThan(OPEN[1] - 17)
    const crouched = standoff(10)
    crouched.game.setInput('rabbit', { ...idle, crouch: true })
    crouched.game.step(1 / 60)
    expect(crouched.predator.state).toBe('search')
  })

  it('treats a nearby tree trunk between eye and rabbit as partial cover', () => {
    // A forest tree with open ground around it: the terrain alone would leave the rabbit in plain view.
    const clear = (tree: { x: number; z: number }) =>
      lineOfSight(
        tree.x,
        heightAt(tree.x, tree.z - 8) + 0.8,
        tree.z - 8,
        tree.x,
        heightAt(tree.x, tree.z + 1) + 0.4,
        tree.z + 1
      )
    const trunk = TREES.find((tree) => tree.r < 0.4 && tree.z > 40 && clear(tree))!
    expect(mapTerrain.sightLine({ x: trunk.x, z: trunk.z - 8 }, { x: trunk.x, z: trunk.z + 1 })).toBe(STEALTH.treeCover)
    const [x, z] = OPEN
    const tree = { x, z }
    const terrain: Terrain = {
      heightAt,
      sightLine: (from, to) => (Math.abs(to.x - tree.x) < 1 && from.z < tree.z && to.z > tree.z ? 0.45 : 1)
    }
    const game = new Game(3, terrain)
    game.addPlayer('rabbit', 'Rabbit')
    Object.assign(game.state.players[0], { x, z: z + 1, y: heightAt(x, z + 1) })
    game.state.foods = []
    game.state.predators = [
      {
        id: 'p',
        kind: 'fox',
        x,
        y: heightAt(x, z - 7),
        z: z - 7,
        angle: 0,
        state: 'patrol',
        targetId: null,
        suspicion: 0
      }
    ]
    game.step(1 / 60)
    // 8 m away is "?" in the open, but behind the trunk it only draws a distant search.
    expect(game.state.predators[0].state).toBe('search')
  })
})

describe('suspicion falls away when the rabbit hides in time', () => {
  it('decays without spotting, checks the last sighting, then gives up', () => {
    const { ax: x, az: z } = GRASS[0]
    const { game, rabbit, predator } = standoff(8, 'fox', [x, z])
    // Droppings have their own tests; fresh pellets beside the hidden rabbit would re-arm the search here.
    ;(game as unknown as { dropIn: Map<string, number> }).dropIn.set(rabbit.id, Infinity)
    ticks(game, 0.6)
    expect(predator.state).toBe('suspicious')
    const peak = predator.suspicion
    game.setInput('rabbit', { ...idle, crouch: true })
    let spotted = false
    let closest = Infinity
    ticks(game, 1, () => {
      spotted ||= predator.state === 'chase'
      closest = Math.min(closest, Math.hypot(predator.x - x, predator.z - z))
    })
    expect(rabbit.hidden).toBe(true)
    expect(predator.state).toBe('search')
    expect(predator.suspicion).toBeLessThan(peak)
    ticks(game, 14, () => {
      spotted ||= predator.state === 'chase'
      closest = Math.min(closest, Math.hypot(predator.x - x, predator.z - z))
    })
    expect(spotted).toBe(false)
    expect(closest).toBeLessThan(3)
    expect(predator.suspicion).toBe(0)
    expect(predator.state).toBe('patrol')
    expect(rabbit.health).toBe(100)
  })
})

describe('dropping trails', () => {
  const trail: Dropping[] = [
    { id: 'a', x: 2, y: 0, z: 0, t: 0 },
    { id: 'b', x: 12, y: 0, z: 0, t: 5 },
    { id: 'c', x: 20, y: 0, z: 0, t: 9 }
  ]
  const follow = (owners: Map<string, Scent>, time: number, seconds = 20, random = () => 0.99) => {
    const body: PredatorBody = {
      id: 'fox',
      kind: 'fox',
      x: 0,
      y: 0,
      z: 0,
      angle: Math.PI / 2,
      state: 'patrol',
      targetId: null,
      suspicion: 0
    }
    const mind = newMind()
    for (let frame = 0; frame < 60 * seconds; frame++)
      updatePredator(body, mind, [], {
        dt: 1 / 60,
        time: time + frame / 60,
        droppings: trail,
        scents: owners,
        terrain: flat,
        random
      })
    return { body, mind }
  }

  it('follows fresh droppings from oldest to newest', () => {
    const { body, mind } = follow(
      scents([
        ['a', 'r', 0],
        ['b', 'r', 0],
        ['c', 'r', 0]
      ]),
      10
    )
    expect([...mind.sniffed]).toEqual(['a', 'b', 'c'])
    expect(body.state).not.toBe('chase')
  })

  it('gives up on a rabbit hiding in grass that keeps dropping, instead of circling it forever', () => {
    const body: PredatorBody = {
      id: 'fox',
      kind: 'fox',
      x: 3,
      y: 0,
      z: 0,
      angle: 0,
      state: 'patrol',
      targetId: null,
      suspicion: 0
    }
    const mind = newMind()
    const droppings: Dropping[] = []
    const owners = new Map<string, Scent>()
    let lingering = 0
    for (let frame = 0; frame < 60 * 120; frame++) {
      const time = frame / 60
      if (frame % (60 * 8) === 0) {
        droppings.push({ id: `d${frame}`, x: 0, y: 0, z: 0, t: time })
        owners.set(`d${frame}`, { owner: 'r', chain: 0 })
      }
      updatePredator(body, mind, [], { dt: 1 / 60, time, droppings, scents: owners, terrain: flat, random: () => 0.99 })
      if (time > 60 && Math.hypot(body.x, body.z) < 6) lingering += 1 / 60
    }
    expect(mind.sniffed.size).toBeGreaterThan(0)
    expect(lingering).toBeLessThan(10)
  })

  it('loses the trail at a gap, another rabbit, or stale scent', () => {
    const owners = scents([
      ['a', 'r', 0],
      ['b', 'r', 0],
      ['c', 'other', 0]
    ])
    expect([...follow(owners, 10).mind.sniffed]).toEqual(['a', 'b'])
    expect(nextOnTrail(trail[0], [trail[0], { ...trail[2], t: 1 }], owners, 10, () => 0)).toBeUndefined()
    const far = [trail[0], { ...trail[1], x: 2 + STEALTH.trailRange + 1 }]
    expect(nextOnTrail(trail[0], far, owners, 10, () => 0)).toBeUndefined()
    expect([...follow(owners, STEALTH.scentLifetime + 1).mind.sniffed]).toEqual([])
    expect(nextOnTrail(trail[0], trail, owners, 5 + STEALTH.scentLifetime + 1, () => 0)).toBeUndefined()
  })

  it('rarely carries a trail across water or a dust bath', () => {
    const owners = scents([
      ['a', 'r', 0],
      ['b', 'r', 1],
      ['c', 'r', 1]
    ])
    expect(nextOnTrail(trail[0], trail, owners, 10, () => 0.9)).toBeUndefined()
    expect(nextOnTrail(trail[0], trail, owners, 10, () => 0.1)?.id).toBe('b')
    expect(nextOnTrail(trail[1], trail, owners, 10, () => 0.9)?.id).toBe('c')
    const stopped = follow(owners, 10, 6)
    expect([...stopped.mind.sniffed]).toEqual(['a'])
    expect(stopped.mind.trail).toBeNull()
    expect([...follow(owners, 10, 20, () => 0.1).mind.sniffed]).toEqual(['a', 'b', 'c'])
  })

  it('drops at irregular intervals, caps the synced list and starts new chains after water and dust baths', () => {
    const game = new Game(5)
    game.addPlayer('rabbit', 'Rabbit')
    game.state.predators = []
    const rabbit = game.state.players[0]
    // Outside the den: rabbits leave no droppings at home.
    Object.assign(rabbit, { x: 0, z: -20 })
    const internal = game as unknown as { scents: Map<string, Scent> }
    const times: number[] = []
    ticks(game, 60, () => {
      rabbit.hunger = 100
      const last = game.state.droppings.at(-1)
      if (last && times.at(-1) !== last.t) times.push(last.t)
    })
    const gaps = times.slice(1).map((time, index) => time - times[index])
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(STEALTH.droppingInterval[0] - 0.02)
    expect(Math.max(...gaps)).toBeLessThanOrEqual(STEALTH.droppingInterval[1] + 0.02)
    expect(new Set(gaps.map((gap) => gap.toFixed(1))).size).toBeGreaterThan(2)
    const chainOfLast = () => internal.scents.get(game.state.droppings.at(-1)!.id)!.chain
    const before = chainOfLast()
    const ford = FORDS[1]
    Object.assign(rabbit, { x: ford.x, z: ford.z, y: heightAt(ford.x, ford.z) })
    ticks(game, 13)
    expect(chainOfLast()).toBe(before + 1)
    const [sx, sz] = SAND_PATCHES[0]
    Object.assign(rabbit, { x: sx, z: sz, y: heightAt(sx, sz) })
    game.setInput('rabbit', { ...idle, crouch: true })
    ticks(game, STEALTH.bathSeconds - 0.2)
    expect(rabbit.bath).toBeGreaterThan(0.8)
    expect(rabbit.bath).toBeLessThan(1)
    ticks(game, 13)
    expect(rabbit.bath).toBe(1)
    expect(chainOfLast()).toBe(before + 2)
    for (let index = 0; index < 60; index++) ticks(game, 3, () => (rabbit.hunger = 100))
    expect(game.state.droppings.length).toBeLessThanOrEqual(STEALTH.maxDroppings)
    expect(game.state.droppings.every((dropping) => game.state.time - dropping.t < STEALTH.droppingExpiry)).toBe(true)
    expect(JSON.stringify(game.state.droppings).length).toBeLessThan(STEALTH.maxDroppings * 60)
  })

  it('rolls droppings released mid-jump, mid-sprint or on a slope', () => {
    const resting = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }
    expect(rollDropping(resting, flat, 1 / 60)).toBe(false)
    expect(resting.x).toBe(0)
    const sprint = { x: 0, y: 0.2, z: 0, vx: 0, vy: 0, vz: 3 }
    for (let frame = 0; frame < 600 && rollDropping(sprint, flat, 1 / 60); frame++);
    expect(sprint.z).toBeGreaterThan(1)
    expect(sprint.y).toBe(0)
    const hill: Terrain = { heightAt: (x) => Math.max(0, 4 - x * 0.4), sightLine: () => 1 }
    const slope = { x: 2, y: hill.heightAt(2, 0), z: 0, vx: 0, vy: 0, vz: 0 }
    for (let frame = 0; frame < 600; frame++) rollDropping(slope, hill, 1 / 60)
    expect(slope.x).toBeGreaterThan(4)
    expect(slope.y).toBeCloseTo(hill.heightAt(slope.x, 0))

    const game = new Game(9)
    game.addPlayer('rabbit', 'Rabbit')
    game.state.predators = []
    const rabbit = game.state.players[0]
    const [startX, laneZ] = [-128, 12]
    Object.assign(rabbit, { x: startX, z: laneZ, y: heightAt(startX, laneZ) })
    const placed: { x: number; z: number; drop: Dropping }[] = []
    game.setInput('rabbit', { ...idle, moveX: 1, sprint: true })
    ticks(game, 12, () => {
      rabbit.x = Math.min(rabbit.x, startX + 20)
      const last = game.state.droppings.at(-1)
      if (last && !placed.some((entry) => entry.drop.id === last.id))
        placed.push({ x: rabbit.x, z: rabbit.z, drop: last })
    })
    expect(placed.length).toBeGreaterThan(0)
    expect(Math.max(...placed.map(({ x, drop }) => drop.x - x))).toBeGreaterThan(0.5)
  })
})

describe('flying predator motion', () => {
  it('never teleports in height or position when its prey dives into grass', () => {
    const { ax: x, az: z } = GRASS[3]
    const { game, predator, rabbit } = standoff(4, 'hawk', [x, z])
    let previous = { ...predator }
    let maxClimb = 0
    let maxStep = 0
    let lowest = Infinity
    const record = () => {
      maxClimb = Math.max(maxClimb, Math.abs(predator.y - previous.y) * 60)
      maxStep = Math.max(maxStep, Math.hypot(predator.x - previous.x, predator.z - previous.z) * 60)
      lowest = Math.min(lowest, predator.y)
      previous = { ...predator }
    }
    ticks(game, 1.2, record)
    expect(predator.state).toBe('chase')
    expect(lowest).toBeLessThan(4)
    game.setInput('rabbit', { ...idle, crouch: true })
    ticks(game, 0.2, record)
    expect(rabbit.hidden).toBe(true)
    expect(predator.state).toBe('search')
    const hiddenAt = predator.y
    ticks(game, 0.3, record)
    // Pulls out of the dive smoothly instead of popping back up to cruising height.
    expect(Math.abs(predator.y - hiddenAt)).toBeLessThan(1)
    ticks(game, 6, record)
    expect(predator.y).toBeGreaterThan(HAWK_ALTITUDE.patrol)
    expect(maxClimb).toBeLessThanOrEqual(5.01)
    expect(maxStep).toBeLessThanOrEqual(8.01)
    expect(Math.hypot(predator.x - x, predator.z - z)).toBeLessThan(12)
  })
})

describe('guest rendering of a flying predator', () => {
  it('glides a hawk toward a jumped snapshot and keeps stealth fields', () => {
    const { game, predator } = standoff(30, 'hawk')
    game.state.droppings.push({ id: 'poo-x', x: 1, y: 0, z: 1, t: 0 })
    const view = new GuestView()
    const snapshot = () => JSON.parse(JSON.stringify(game.state)) as typeof game.state
    view.render(snapshot(), 'rabbit', idle, 1 / 60, 0)
    Object.assign(predator, { y: 0.5, state: 'suspicious', suspicion: 0.4 })
    const heights: number[] = []
    let rendered = view.render(snapshot(), 'rabbit', idle, 1 / 60, 16)
    for (let frame = 0; frame < 30; frame++) {
      rendered = view.render(snapshot(), 'rabbit', idle, 1 / 60, 32 + frame * 16)
      heights.push(rendered.predators[0].y)
    }
    expect(heights[0]).toBeGreaterThan(3)
    expect(heights.at(-1)!).toBeLessThan(1)
    heights.slice(1).forEach((height, index) => expect(height).toBeLessThanOrEqual(heights[index]))
    expect(rendered.predators[0]).toMatchObject({ state: 'suspicious', suspicion: 0.4 })
    expect(rendered.droppings).toHaveLength(1)
  })
})
