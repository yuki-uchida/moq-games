import { describe, expect, it } from 'vitest'
import { Game, RULES, retryState, type Input } from '../src/game'
import { GRASS, MAX_PREDATORS, heightAt } from '../src/map'
import { BURROW, CAMPAIGN, HAVEN, STRAW_SPOTS, alongTrail, nightAmount, nightVision, spawnKits } from '../src/campaign'
import { reachable, steer } from './bot'

const idle: Input = { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false, interact: false }
const advance = (game: Game, seconds: number) => {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) game.step(1 / 60)
}
const peaceful = () => {
  const game = new Game(42)
  game.addPlayer('rabbit', 'Rabbit')
  game.state.predators = []
  return game
}
const winter = () => {
  const game = peaceful()
  Object.assign(game.state, { chapter: 2, bedding: CAMPAIGN.beddingGoal })
  const player = game.state.players[0]
  player.pregnant = true
  player.pregnancy = 1 - 0.01 / RULES.gestationSeconds
  game.step(0.05)
  return game
}
/** Flat open meadow near the den: a clear 24 m east-west run centred here. */
const OPEN = { x: -122, z: -16 }
const place = (body: { x: number; y: number; z: number }, x: number, z: number) =>
  Object.assign(body, { x, z, y: heightAt(x, z) })
const fox = (x: number, z: number) => ({
  id: 'fox',
  kind: 'fox' as const,
  x,
  y: heightAt(x, z),
  z,
  angle: Math.PI / 2,
  state: 'patrol' as const,
  targetId: null,
  suspicion: 0
})

describe('Rabbiters seasons campaign', () => {
  it('places every bundle and the haven on ground reachable from the den', () => {
    for (const [x, z] of STRAW_SPOTS) expect(reachable({ x, z }, BURROW), `straw ${x},${z}`).toBe(true)
    expect(reachable(HAVEN, BURROW)).toBe(true)
  })

  it('opens summer once a rabbit is grown, then autumn once the bedding is home', () => {
    const game = peaceful()
    const player = game.state.players[0]
    const straw = game.state.straws[0]
    place(player, straw.x, straw.z)
    game.step(0.1)
    expect(player.carrying).toBeNull()
    Object.assign(player, { age: RULES.adultAge, foodEaten: RULES.requiredFood, hunger: 100 })
    game.step(0.1)
    expect(game.state.chapter).toBe(1)
    expect(player.pregnant).toBe(false)
    expect(player.carrying).toBe(straw.id)
    expect(straw.active).toBe(false)
    for (const next of game.state.straws) {
      if (!player.carrying) {
        place(player, next.x, next.z)
        game.step(0.05)
      }
      place(player, BURROW.x, BURROW.z)
      game.step(0.05)
      expect(player.carrying).toBeNull()
    }
    expect(game.state.bedding).toBe(CAMPAIGN.beddingGoal)
    expect(game.state.chapter).toBe(2)
    game.step(0.1)
    expect(player.pregnant).toBe(true)
    expect(game.state.straws.every((entry) => !entry.active)).toBe(true)
  })

  it('slows a carrier, rules out dashing, and makes it easier to spot', () => {
    const game = peaceful()
    game.addPlayer('friend', 'Friend')
    const [player, friend] = game.state.players
    game.state.chapter = 1
    player.carrying = 'straw-2'
    game.state.straws[2].active = false
    place(player, OPEN.x - 10, OPEN.z)
    place(friend, OPEN.x - 10, OPEN.z + 20)
    game.setInput(player.id, { ...idle, moveX: 1, sprint: true })
    game.setInput(friend.id, { ...idle, moveX: 1 })
    advance(game, 1)
    expect(player.x - (OPEN.x - 10)).toBeCloseTo((friend.x - (OPEN.x - 10)) * CAMPAIGN.carrySpeed, 1)
    // A fox 15 m away misses a plain rabbit (13 m sight) but notices one hauling straw.
    game.setInput(player.id, idle)
    game.setInput(friend.id, idle)
    place(player, OPEN.x + 3, OPEN.z)
    place(friend, BURROW.x, BURROW.z)
    game.state.predators = [fox(OPEN.x - 12, OPEN.z)]
    game.step(1 / 60)
    expect(game.state.predators[0].targetId).toBe(player.id)
    player.carrying = null
    game.state.predators = [fox(OPEN.x - 12, OPEN.z)]
    game.step(1 / 60)
    expect(game.state.predators[0].targetId).toBeNull()
  })

  it('drops the bundle back at its spot when hit or when the carrier leaves', () => {
    const game = peaceful()
    game.state.chapter = 1
    const player = game.state.players[0]
    const straw = game.state.straws[1]
    place(player, straw.x, straw.z)
    game.step(1 / 60)
    expect(player.carrying).toBe(straw.id)
    game.state.predators = [{ ...fox(player.x, player.z), state: 'chase', targetId: player.id, suspicion: 1 }]
    game.step(1 / 60)
    expect(player.carrying).toBeNull()
    expect(straw.active).toBe(true)
    game.state.predators = []
    game.step(1 / 60)
    expect(player.carrying).toBe(straw.id)
    game.removePlayer(player.id)
    expect(straw.active).toBe(true)
  })

  it('turns birth into the winter journey: kits trail the parent across the stream to the Big Oak', () => {
    const game = winter()
    const player = game.state.players[0]
    expect(game.state.chapter).toBe(3)
    expect(game.state.kits).toHaveLength(CAMPAIGN.kitCount)
    expect(player.pregnant).toBe(false)
    place(player, OPEN.x, OPEN.z)
    game.step(0.1)
    expect(game.state.kits.every((kit) => kit.status === 'wait')).toBe(true)
    place(player, BURROW.x, BURROW.z)
    for (let frame = 0; frame < 60 * 60 * 6 && game.state.phase === 'playing'; frame++) {
      const lagging = game.state.kits.some(
        (kit) => kit.status !== 'safe' && Math.hypot(kit.x - player.x, kit.z - player.z) > 3
      )
      const route = steer(player, HAVEN)
      game.setInput(player.id, lagging || route.left < 0.5 ? idle : { ...idle, ...route })
      game.step(1 / 60)
    }
    expect(game.state.phase).toBe('won')
    expect(game.state.kits.every((kit) => kit.status === 'safe')).toBe(true)
  }, 60_000)

  it('kits walk slower than their parent and follow the walked path', () => {
    expect(CAMPAIGN.kitSpeed).toBeLessThan(5.2)
    const trail = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 4 }
    ]
    expect(alongTrail({ x: 4, z: 5 }, trail, 3)).toEqual({ x: 4, z: 2 })
    expect(alongTrail({ x: 4, z: 5 }, trail, 7)).toEqual({ x: 2, z: 0 })
    expect(alongTrail({ x: 4, z: 5 }, trail, 50)).toEqual({ x: 0, z: 0 })
  })

  it('a predator carries off a caught kit and leaves; losing every kit loses the game', () => {
    const game = winter()
    const player = game.state.players[0]
    place(player, OPEN.x + 10, OPEN.z + 20)
    game.state.kits.forEach((kit, index) => place(kit, OPEN.x - 8 + index * 8, OPEN.z))
    game.state.predators = game.state.kits.map((kit) => ({ ...fox(kit.x, kit.z), id: `fox-${kit.id}` }))
    game.state.kits[2].status = 'safe'
    game.step(1 / 60)
    expect(game.state.kits.map((kit) => kit.status)).toEqual(['lost', 'lost', 'safe'])
    expect(game.state.predators.map((predator) => predator.id)).toEqual(['fox-kit-2'])
    expect(game.state.phase).toBe('won')
    const lost = winter()
    place(lost.state.players[0], OPEN.x, OPEN.z)
    lost.state.kits.forEach((kit) => (kit.status = 'lost'))
    lost.step(1 / 60)
    expect(lost.state.phase).toBe('lost')
  })

  it('hides kits in grass only while their leader crouches', () => {
    const game = winter()
    const player = game.state.players[0]
    place(player, -114, -5)
    for (const kit of game.state.kits) place(kit, -114, -7)
    game.step(1 / 60)
    expect(game.state.kits.every((kit) => !kit.hidden)).toBe(true)
    game.setInput(player.id, { ...idle, crouch: true })
    game.step(1 / 60)
    expect(game.state.kits.every((kit) => kit.hidden)).toBe(true)
  })

  it('cycles day and night: hawks roost while ground hunters see farther', () => {
    expect(nightAmount(0)).toBe(0)
    expect(nightAmount(CAMPAIGN.nightStart - 1)).toBe(0)
    expect(nightAmount(CAMPAIGN.nightStart + 5)).toBeCloseTo(0.5)
    expect(nightAmount(CAMPAIGN.nightStart + 50)).toBe(1)
    expect(nightAmount(CAMPAIGN.dayLength)).toBe(0)
    expect(nightVision('hawk', CAMPAIGN.nightStart + 50)).toBeCloseTo(0.3)
    expect(nightVision('wolf', CAMPAIGN.nightStart + 50)).toBeCloseTo(1.3)
    expect(nightVision('wolf', 10)).toBe(1)
    const spot = (time: number) => {
      const game = peaceful()
      game.state.time = time
      place(game.state.players[0], OPEN.x + 3, OPEN.z)
      game.state.predators = [fox(OPEN.x - 12, OPEN.z)]
      game.step(1 / 60)
      return game.state.predators[0].targetId
    }
    expect(spot(10)).toBeNull()
    expect(spot(CAMPAIGN.nightStart + 50)).toBe('rabbit')
  })

  it('heals quickly in the den and slowly when well fed', () => {
    const game = peaceful()
    const player = game.state.players[0]
    place(player, BURROW.x, BURROW.z)
    player.health = 50
    advance(game, 1)
    expect(player.health).toBeCloseTo(50 + RULES.burrowHeal, 1)
    place(player, OPEN.x, OPEN.z)
    Object.assign(player, { health: 50, hunger: 100 })
    advance(game, 1)
    expect(player.health).toBeCloseTo(50 + RULES.fedHeal, 1)
    Object.assign(player, { health: 50, hunger: RULES.wellFed - 5 })
    advance(game, 1)
    expect(player.health).toBe(50)
  })

  it('makes hunters give up at the den and leaves no droppings there', () => {
    const game = peaceful()
    const player = game.state.players[0]
    place(player, BURROW.x, BURROW.z)
    game.state.predators = [
      { ...fox(BURROW.x + 3, BURROW.z), id: 'wolf', kind: 'wolf', state: 'chase', targetId: player.id, suspicion: 1 }
    ]
    game.step(1 / 60)
    expect(game.state.predators[0].state).toBe('patrol')
    expect(game.state.predators[0].targetId).toBeNull()
    game.state.predators = []
    advance(game, 60)
    expect(game.state.droppings).toHaveLength(0)
    place(player, OPEN.x, OPEN.z)
    advance(game, 30)
    expect(game.state.droppings.length).toBeGreaterThan(0)
  })

  it('lets the nests field more hunters as the seasons turn', () => {
    expect(CAMPAIGN.predatorCap[3]).toBe(MAX_PREDATORS)
    const count = (chapter: number) => {
      const game = new Game(7)
      game.state.chapter = chapter
      // Winter needs kits on the field; these wait unseen in the den.
      if (chapter === 3) game.state.kits = spawnKits(BURROW.x, BURROW.z)
      advance(game, 40 * 60)
      return game.state.predators.length
    }
    expect(CAMPAIGN.predatorCap.map((_, chapter) => count(chapter))).toEqual([...CAMPAIGN.predatorCap])
  }, 120_000)

  it('paces a threat-free optimal solo route through all four seasons no faster than about seventeen minutes', () => {
    // A lower bound on play time: no predators, no detours, shortest walkable paths. Stealth only adds to it.
    const game = new Game(42)
    game.addPlayer('rabbit', 'Rabbit')
    const player = game.state.players[0]
    const seen = new Set<number>()
    const near = (point: { x: number; z: number }) => Math.hypot(point.x - player.x, point.z - player.z)
    const nearest = <T extends { x: number; z: number }>(items: T[]) =>
      items.sort((first, second) => near(first) - near(second))[0]
    for (let frame = 0; frame < 50 * 60 * 60 && game.state.phase === 'playing'; frame++) {
      game.state.predators = []
      for (const nest of game.state.nests) nest.active = false
      const { chapter } = game.state
      seen.add(chapter)
      const hungry =
        player.foodEaten < RULES.requiredFood || player.hunger < (chapter === 2 && !player.pregnant ? 60 : 30)
      const food = nearest(
        game.state.foods.filter((entry) => entry.active && Math.abs(entry.y - heightAt(entry.x, entry.z)) < 0.1)
      )
      const straw = nearest(game.state.straws.filter((entry) => entry.active))
      const lagging = game.state.kits
        .filter((kit) => kit.status === 'follow' || kit.status === 'wait')
        .sort((first, second) => near(second) - near(first))[0]
      const target =
        hungry && food && !player.carrying
          ? food
          : chapter === 1 && !player.carrying && straw
            ? straw
            : chapter === 3
              ? lagging && near(lagging) > 3
                ? lagging
                : HAVEN
              : BURROW
      const route = steer(player, target)
      const resting = target === BURROW && route.left < 1
      game.setInput(player.id, {
        ...idle,
        ...(resting ? {} : { moveX: route.moveX, moveZ: route.moveZ }),
        // Kits are slower than a walk, so winter is walked; elsewhere sprint between stops.
        sprint: chapter !== 3 && route.left > 5
      })
      game.step(1 / 60)
    }
    expect(game.state.phase).toBe('won')
    expect([...seen]).toEqual([0, 1, 2, 3])
    expect(game.state.bedding).toBe(CAMPAIGN.beddingGoal)
    expect(game.state.kits.every((kit) => kit.status === 'safe')).toBe(true)
    expect(game.state.time).toBeGreaterThan(16 * 60)
  }, 120_000)

  it('keeps delivered bedding when a summer run is retried from the season start', () => {
    const game = peaceful()
    Object.assign(game.state, { chapter: 1 })
    const checkpoint = structuredClone(game.state)
    const [player] = game.state.players
    for (const straw of game.state.straws.slice(0, 2)) straw.active = false
    game.state.bedding = 2
    player.carrying = game.state.straws[1].id
    Object.assign(player, { health: 0, downed: true, hunger: 0 })
    game.state.time = 900
    const state = retryState(checkpoint, game.state)
    expect(state.time).toBe(900)
    expect(state.bedding).toBe(2)
    expect(state.straws.map((straw) => straw.active)).toEqual([false, true, true, true, true, true])
    expect(state.players[0]).toMatchObject({ health: 100, downed: false, carrying: null, hunger: 100 })
  })

  // Measured play length: a cautious bot that hides in grass or the den when hunted plays every season
  // against the full predator roster, retrying a lost season like a player would from the result screen.
  for (const seed of [1, 2, 3])
    it(`plays the whole campaign among predators in about thirty minutes (seed ${seed})`, () => {
      let game = new Game(seed)
      game.addPlayer('rabbit', 'Rabbit')
      let player = game.state.players[0]
      let checkpoint = structuredClone(game.state)
      let retries = 0
      let calmAt = 0
      const near = (point: { x: number; z: number }) => Math.hypot(point.x - player.x, point.z - player.z)
      const nearest = <T extends { x: number; z: number }>(items: T[]) =>
        items.sort((first, second) => near(first) - near(second))[0]
      for (let frame = 0; frame < 60 * 60 * 60; frame++) {
        if (game.state.phase === 'lost' && retries < 5) {
          retries++
          const next = new Game(seed + retries)
          next.state = retryState(checkpoint, game.state)
          game = next
          player = game.state.players[0]
        }
        if (game.state.phase !== 'playing') break
        if (game.state.chapter > checkpoint.chapter) checkpoint = structuredClone(game.state)
        const { chapter } = game.state
        const hungry =
          player.foodEaten < RULES.requiredFood || player.hunger < (chapter === 2 && !player.pregnant ? 60 : 35)
        const food = nearest(
          game.state.foods.filter((entry) => entry.active && Math.abs(entry.y - heightAt(entry.x, entry.z)) < 0.1)
        )
        const straw = nearest(game.state.straws.filter((entry) => entry.active))
        const lagging = game.state.kits
          .filter((kit) => kit.status === 'follow' || kit.status === 'wait')
          .sort((first, second) => near(second) - near(first))[0]
        if (game.state.predators.some((predator) => predator.targetId === player.id)) calmAt = game.state.time + 8
        const wary = game.state.time < calmAt
        const grass = nearest(GRASS.map((patch) => ({ x: patch.ax, z: patch.az })))
        const cover = near(BURROW) < Math.min(25, near(grass) + 8) ? BURROW : grass
        const target =
          wary && near(cover) < 30
            ? cover
            : player.health < 40 && chapter !== 3
              ? BURROW
              : hungry && food && !player.carrying
                ? food
                : chapter === 1 && !player.carrying && straw
                  ? straw
                  : chapter === 3
                    ? lagging && near(lagging) > 3
                      ? lagging
                      : HAVEN
                    : BURROW
        const route = steer(player, target)
        const resting = (target === BURROW || target === cover) && route.left < 1
        const threatNear = game.state.predators.some((predator) => predator.kind !== 'crocodile' && near(predator) < 14)
        game.setInput(player.id, {
          ...idle,
          ...(resting ? {} : { moveX: route.moveX, moveZ: route.moveZ }),
          sprint: !wary && !threatNear && chapter !== 3 && route.left > 5,
          crouch: wary || threatNear || chapter === 3
        })
        game.step(1 / 60)
      }
      console.info(`forest cautious seed ${seed}: ${(game.state.time / 60).toFixed(1)} min`)
      expect(game.state.phase).toBe('won')
      expect(game.state.kits.some((kit) => kit.status === 'safe')).toBe(true)
      expect(game.state.time).toBeGreaterThan(22 * 60)
      expect(game.state.time).toBeLessThan(40 * 60)
    }, 300_000)
})
