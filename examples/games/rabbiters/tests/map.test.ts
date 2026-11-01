import { describe, expect, it } from 'vitest'
import { Game, canEnter, coverAt, packSnapshot, unpackSnapshot, type Input, type Player } from '../src/game'
import {
  CAVES,
  DEEP_WATER,
  FOODS,
  LOGS,
  NESTS,
  PREDATOR_STARTS,
  TERRAIN,
  TUNNEL_EDGES,
  TUNNEL_NODES,
  WORLD,
  caveWallBlocks,
  clampToTunnel,
  heightAt,
  hitsBlocker,
  isUnderground,
  lineOfSight,
  logTop,
  tunnelNearest,
  waterDepth
} from '../src/map'
import { FORDS, PLATEAU, STREAM } from '../src/stages/forest/map'

const idle: Input = { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false, interact: false }
const solo = () => {
  const game = new Game(3)
  game.addPlayer('rabbit', 'Rabbit')
  game.state.predators = []
  return { game, player: game.state.players[0] }
}
const place = (player: Player, x: number, z: number) => Object.assign(player, { x, z, y: heightAt(x, z) })
/** Steers a rabbit through waypoints, one tick at a time. */
const walk = (game: Game, player: Player, points: { x: number; z: number }[], extra: Partial<Input> = {}) => {
  for (const point of points) {
    for (let frame = 0; frame < 60 * 30 && Math.hypot(point.x - player.x, point.z - player.z) > 0.4; frame++) {
      const dx = point.x - player.x
      const dz = point.z - player.z
      const length = Math.hypot(dx, dz)
      game.setInput(player.id, { ...idle, ...extra, moveX: dx / length, moveZ: dz / length })
      game.step(1 / 60)
    }
  }
  game.setInput(player.id, idle)
}

describe('Rabbiters world map', () => {
  it('is about ten times the old 90 × 64 field and stays consistent with the rendered grid', () => {
    const area = (WORLD.maxX - WORLD.minX) * (WORLD.maxZ - WORLD.minZ)
    expect(area / (90 * 64)).toBeCloseTo(10, 0)
    for (const [i, j] of [
      [0, 0],
      [40, 77],
      [150, 120],
      [288, 200]
    ])
      expect(heightAt(WORLD.minX + i, WORLD.minZ + j)).toBe(TERRAIN.heights[j * TERRAIN.nx + i])
    // Each cell is two flat triangles split along the (i, j)–(i+1, j+1) diagonal, exactly like the mesh.
    const corner = [heightAt(10, 10), heightAt(11, 10), heightAt(11, 11), heightAt(10, 11)]
    expect(heightAt(10.75, 10.25)).toBeCloseTo(
      corner[0] + 0.75 * (corner[1] - corner[0]) + 0.25 * (corner[2] - corner[1])
    )
    expect(heightAt(10.25, 10.75)).toBeCloseTo(
      corner[0] + 0.75 * (corner[3] - corner[0]) + 0.25 * (corner[2] - corner[3])
    )
    expect(FOODS.length).toBeGreaterThanOrEqual(48)
    expect(NESTS.length).toBeGreaterThanOrEqual(6)
    expect(PREDATOR_STARTS.length).toBeGreaterThanOrEqual(12)
  })

  it('has hills, a cliff-walled plateau, hollows, a deep stream and shallow fords', () => {
    expect(heightAt(-118, 0)).toBe(0)
    expect(heightAt(0, -8)).toBeGreaterThan(6)
    expect(heightAt(PLATEAU.x, PLATEAU.z)).toBeGreaterThan(PLATEAU.height)
    expect(heightAt(PLATEAU.x, PLATEAU.z - PLATEAU.rz - 3)).toBeLessThan(3)
    expect(heightAt(-4, 48)).toBeLessThan(heightAt(-4, 40) - 1.5)
    for (const point of STREAM.slice(1, -1)) expect(waterDepth(point.x, point.z)).toBeGreaterThan(DEEP_WATER)
    for (const ford of FORDS) {
      expect(waterDepth(ford.x, ford.z)).toBeGreaterThan(0.05)
      expect(waterDepth(ford.x, ford.z)).toBeLessThan(0.4)
    }
  })

  it('places every food, nest and predator where it can stand and be reached', () => {
    for (const spot of FOODS) {
      if (spot.place === 'tunnel') {
        expect(clampToTunnel(spot.x, spot.z, 0.3)).toEqual({ x: spot.x, z: spot.z })
        expect(isUnderground(spot.x, spot.y, spot.z)).toBe(true)
        continue
      }
      expect(waterDepth(spot.x, spot.z)).toBeLessThan(DEEP_WATER)
      expect(hitsBlocker(spot.x, spot.z, 0.3) || caveWallBlocks(spot.x, spot.z, 0.3)).toBe(false)
    }
    for (const nest of NESTS) expect(hitsBlocker(nest.x, nest.z, 0.8) || waterDepth(nest.x, nest.z) > 0).toBe(false)
    for (const start of PREDATOR_STARTS) {
      const body = { x: start.x, y: heightAt(start.x, start.z), z: start.z }
      if (start.kind === 'crocodile') expect(waterDepth(start.x, start.z)).toBeGreaterThan(DEEP_WATER)
      else expect(hitsBlocker(start.x, start.z, 0.8) || caveWallBlocks(start.x, start.z, 0.8)).toBe(false)
      expect(canEnter(start.kind, body, start.x + 0.1, start.z, true, false)).toBe(true)
    }
  })

  it('lets rabbits hop up rabbit-sized terraces that walkers cannot climb, but not the sheer cliff', () => {
    const { game, player } = solo()
    const terraceX = -8
    place(player, terraceX, -44)
    const start = player.y
    walk(game, player, [{ x: terraceX, z: -49 }])
    expect(player.z).toBeGreaterThan(-49) // the next step is a ledge
    expect(player.y).toBeLessThan(start + 1.5)
    const wolf = { x: player.x, y: player.y, z: player.z }
    expect(canEnter('wolf', wolf, wolf.x, wolf.z - 0.15, true, false)).toBe(false)
    for (let hop = 0; hop < 16 && player.y < PLATEAU.height - 0.5; hop++) {
      game.setInput(player.id, { ...idle, moveZ: -1, jump: true })
      for (let frame = 0; frame < 4; frame++) game.step(1 / 60)
      game.setInput(player.id, { ...idle, moveZ: -1 })
      for (let frame = 0; frame < 76; frame++) game.step(1 / 60)
    }
    expect(player.y).toBeGreaterThan(PLATEAU.height - 0.5) // reached the plateau top by hopping
    place(player, PLATEAU.x, PLATEAU.z - PLATEAU.rz - 2) // below the north cliff
    const below = player.y
    for (let hop = 0; hop < 6; hop++) {
      game.setInput(player.id, { ...idle, moveZ: 1, jump: true })
      for (let frame = 0; frame < 60; frame++) game.step(1 / 60)
      game.setInput(player.id, idle)
      game.step(1 / 60)
    }
    for (let frame = 0; frame < 120; frame++) game.step(1 / 60)
    expect(player.y).toBeLessThan(below + 1)
  })

  it('keeps rabbits and land predators out of deep water, while crocodiles never leave it', () => {
    const deep = STREAM[3]
    const bank = { x: deep.x - 9, y: heightAt(deep.x - 9, deep.z), z: deep.z }
    expect(canEnter('rabbit', { ...bank }, deep.x, deep.z, true, false)).toBe(false)
    expect(canEnter('fox', { ...bank }, deep.x, deep.z, true, false)).toBe(false)
    const ford = FORDS[1]
    const { game, player } = solo()
    place(player, ford.x - 9, ford.z)
    walk(game, player, [{ x: ford.x + 9, z: ford.z }])
    expect(player.x).toBeCloseTo(ford.x + 9, 0) // waded across the ford
    game.state.predators = [
      { id: 'croc', kind: 'crocodile', x: deep.x, y: 0, z: deep.z, angle: 0, state: 'patrol', targetId: null }
    ]
    for (let second = 0; second < 120; second++) {
      game.step(1)
      const croc = game.state.predators[0]
      expect(waterDepth(croc.x, croc.z)).toBeGreaterThan(0.15)
    }
  })

  it('takes rabbits through mole tunnels where no predator can follow, and back out another hole', () => {
    const { game, player } = solo()
    const [entry, , junction, pantry, , oakHill] = TUNNEL_NODES
    place(player, entry.x, entry.z)
    game.setInput(player.id, { ...idle, crouch: true })
    game.step(1 / 60)
    expect(isUnderground(player.x, player.y, player.z)).toBe(true)
    expect(player.hidden).toBe(true)
    game.state.predators = [
      {
        id: 'wolf',
        kind: 'wolf',
        x: entry.x,
        y: heightAt(entry.x, entry.z),
        z: entry.z,
        angle: 0,
        state: 'chase',
        targetId: null
      }
    ]
    game.step(0.5)
    expect(game.state.predators[0].targetId).toBeNull()
    expect(player.health).toBe(100)
    game.state.predators = []
    // Pushing sideways keeps the rabbit inside the corridor.
    game.setInput(player.id, { ...idle, moveZ: -1 })
    for (let frame = 0; frame < 120; frame++) game.step(1 / 60)
    expect(tunnelNearest(player.x, player.z).d).toBeLessThanOrEqual(0.56)
    walk(game, player, [junction, pantry, oakHill])
    expect(Math.hypot(player.x - oakHill.x, player.z - oakHill.z)).toBeLessThan(0.6)
    expect(isUnderground(player.x, player.y, player.z)).toBe(true)
    expect(player.foodEaten).toBe(1) // the pantry food under the far bank
    game.setInput(player.id, { ...idle, jump: true })
    game.step(1 / 60)
    expect(isUnderground(player.x, player.y, player.z)).toBe(false)
    expect(player.y).toBeGreaterThanOrEqual(heightAt(player.x, player.z))
  })

  it('keeps every tunnel below the surface and connected to an exit', () => {
    for (const [first, second] of TUNNEL_EDGES) {
      const a = TUNNEL_NODES[first]
      const b = TUNNEL_NODES[second]
      for (let t = 0; t <= 1; t += 0.05) {
        const x = a.x + (b.x - a.x) * t
        const z = a.z + (b.z - a.z) * t
        expect(isUnderground(x, heightAt(x, z) - 2.2, z)).toBe(true)
        expect(waterDepth(x, z)).toBeLessThan(1.5)
      }
    }
    expect(TUNNEL_NODES.filter((node) => node.exit).length).toBeGreaterThanOrEqual(6)
  })

  it('lets only crouching rabbits and snakes slip under fallen logs, hidden even from hawks', () => {
    for (const fallen of LOGS) {
      // Logs rest on level ground, so the gap underneath is the same crawl height along the trunk.
      const heights = [0, 0.25, 0.5, 0.75, 1].map((t) =>
        heightAt(fallen.ax + (fallen.bx - fallen.ax) * t, fallen.az + (fallen.bz - fallen.az) * t)
      )
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.5)
    }
    const log = LOGS[0]
    const mid = { x: (log.ax + log.bx) / 2, z: (log.az + log.bz) / 2 }
    const normal = { x: -(log.bz - log.az), z: log.bx - log.ax }
    const scale = 2.2 / Math.hypot(normal.x, normal.z)
    const outside = { x: mid.x + normal.x * scale, z: mid.z + normal.z * scale }
    const body = { ...outside, y: heightAt(outside.x, outside.z) }
    expect(canEnter('rabbit', body, mid.x, mid.z, true, false)).toBe(false)
    expect(canEnter('rabbit', body, mid.x, mid.z, true, true)).toBe(true)
    expect(canEnter('rabbit', { ...body, y: logTop(log) + 0.2 }, mid.x, mid.z, false, false)).toBe(true)
    expect(canEnter('fox', body, mid.x, mid.z, true, false)).toBe(false)
    expect(canEnter('wolf', body, mid.x, mid.z, true, false)).toBe(false)
    expect(canEnter('snake', body, mid.x, mid.z, true, false)).toBe(true)
    expect(coverAt(mid.x, heightAt(mid.x, mid.z), mid.z, true)).toBe('log')
    const { game, player } = solo()
    place(player, mid.x, mid.z)
    game.setInput(player.id, { ...idle, crouch: true })
    game.state.predators = [
      { id: 'hawk', kind: 'hawk', x: mid.x + 3, y: player.y + 6, z: mid.z, angle: 0, state: 'chase', targetId: null }
    ]
    game.step(0.2)
    expect(player.hidden).toBe(true)
    expect(game.state.predators[0].targetId).toBeNull()
  })

  it('hides rabbits in dark caves whose narrow entrances keep foxes and wolves out', () => {
    const cave = CAVES[0]
    const [wide, narrow] = cave.entrances
    const through = (entrance: (typeof cave.entrances)[number], kind: 'rabbit' | 'fox' | 'wolf' | 'snake') => {
      const outside = { x: cave.x + entrance.dx * (cave.r + 1.5), z: cave.z + entrance.dz * (cave.r + 1.5) }
      const inside = { x: cave.x + entrance.dx * (cave.r - 1.5), z: cave.z + entrance.dz * (cave.r - 1.5) }
      const body = { ...outside, y: heightAt(outside.x, outside.z) }
      for (let t = 0.05; t <= 1; t += 0.05) {
        const x = outside.x + (inside.x - outside.x) * t
        const z = outside.z + (inside.z - outside.z) * t
        if (!canEnter(kind, body, x, z, true, false)) return false
        Object.assign(body, { x, z, y: heightAt(x, z) })
      }
      return true
    }
    expect(through(wide, 'wolf')).toBe(true)
    expect(through(narrow, 'rabbit')).toBe(true)
    expect(through(narrow, 'snake')).toBe(true)
    expect(through(narrow, 'fox')).toBe(false)
    expect(through(narrow, 'wolf')).toBe(false)
    const { game, player } = solo()
    place(player, cave.x - 3, cave.z)
    game.state.predators = [
      {
        id: 'hawk',
        kind: 'hawk',
        x: cave.x - 3,
        y: player.y + 5,
        z: cave.z,
        angle: 0,
        state: 'patrol',
        targetId: null
      },
      {
        id: 'fox',
        kind: 'fox',
        x: cave.x - cave.r - 4,
        y: 1,
        z: cave.z,
        angle: Math.PI / 2,
        state: 'patrol',
        targetId: null
      }
    ]
    game.step(0.2)
    expect(coverAt(player.x, player.y, player.z, false)).toBe('cave')
    expect(game.state.predators.every((predator) => predator.targetId === null)).toBe(true)
  })

  it('blocks foxes at narrow rock crevices that rabbits squeeze through', () => {
    // The north-west boulder ring has a crevice facing angle 0.6 rad.
    const centre = { x: -108, z: -44 }
    const gap = (offset: number) => ({ x: centre.x + Math.cos(0.6) * offset, z: centre.z + Math.sin(0.6) * offset })
    const outside = gap(12)
    const body = { ...outside, y: heightAt(outside.x, outside.z) }
    const passes = (kind: 'rabbit' | 'fox' | 'snake') => {
      const walker = { ...body }
      for (let offset = 12; offset >= 6; offset -= 0.1) {
        const next = gap(offset)
        if (!canEnter(kind, walker, next.x, next.z, true, false)) return false
        Object.assign(walker, { ...next, y: heightAt(next.x, next.z) })
      }
      return true
    }
    expect(passes('rabbit')).toBe(true)
    expect(passes('snake')).toBe(true)
    expect(passes('fox')).toBe(false)
  })

  it('uses hills and hollows to break line of sight', () => {
    expect(lineOfSight(-130, 0.8, 0, -106, 0.4, 0)).toBe(true)
    const north = { x: 0, z: -30 }
    const south = { x: 0, z: 14 }
    expect(
      lineOfSight(
        north.x,
        heightAt(north.x, north.z) + 0.8,
        north.z,
        south.x,
        heightAt(south.x, south.z) + 0.4,
        south.z
      )
    ).toBe(false)
    const { game, player } = solo()
    const [hx, hz] = [-4, 48] // forest hollow
    place(player, hx, hz)
    // A wolf 13 m away on level ground cannot see down into the bowl…
    game.state.predators = [
      {
        id: 'wolf',
        kind: 'wolf',
        x: hx,
        y: heightAt(hx, hz - 13),
        z: hz - 13,
        angle: 0,
        state: 'patrol',
        targetId: null
      }
    ]
    game.step(1 / 60)
    expect(game.state.predators[0].targetId).toBeNull()
    // …but one standing on its lip spots the rabbit.
    Object.assign(game.state.predators[0], { x: hx, z: hz - 8, y: heightAt(hx, hz - 8), angle: 0 })
    game.step(1 / 60)
    expect(game.state.predators[0].targetId).toBe(player.id)
  })

  it('ships compact snapshots and restores map-derived food and nest data', () => {
    const game = new Game(5)
    game.addPlayer('rabbit', 'Rabbit')
    game.state.foods[3].active = false
    game.state.nests[1].health = 42.123456
    for (let frame = 0; frame < 30; frame++) game.step(1 / 60)
    const wire = packSnapshot(game.state)
    expect(JSON.stringify(wire).length).toBeLessThan(JSON.stringify(game.state).length * 0.6)
    const restored = unpackSnapshot(JSON.parse(JSON.stringify(wire)))!
    expect(restored.foods).toEqual(game.state.foods)
    expect(restored.nests[1].health).toBe(42.123)
    expect(restored.nests.map((nest) => nest.active)).toEqual(game.state.nests.map((nest) => nest.active))
    expect(restored.players[0].x).toBeCloseTo(game.state.players[0].x, 3)
    expect(unpackSnapshot({ ...wire, foods: wire.foods.slice(1) })).toBeUndefined()
    expect(unpackSnapshot({ ...wire, nests: [...wire.nests.slice(1), 500] })).toBeUndefined()
    expect(unpackSnapshot(null)).toBeUndefined()
  })
})
