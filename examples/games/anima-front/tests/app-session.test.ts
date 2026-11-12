import { describe, expect, it } from 'vitest'
import { makeLoadout } from '../src/data/loadout'
import { createSoloLobby, LOCAL_PLAYER_ID } from '../src/app/lobby'
import { buildSeats, matchConfig, musicFor } from '../src/app/match'
import { createLocalSession, FixedStepper, MAX_STEPS_PER_FRAME } from '../src/app/session'
import type { World } from '../src/sim/api'
import { getMap } from '../src/sim/api'
import { neutralPlayerInput, type MatchConfig, type PlayerInput, type View } from '../src/sim/types'

const me = {
  id: LOCAL_PLAYER_ID,
  name: 'ハヤテ',
  species: 'shiba' as const,
  loadout: makeLoadout(['bee'], ['orca'], ['koala']),
  loadoutName: 'テスト'
}

/** A tiny fake world: counts steps and remembers the inputs it saw. */
function fakeWorld(config: MatchConfig) {
  let tick = 0
  let pending: View['events'] = []
  const seen: PlayerInput[] = []
  const world: World & { seen: PlayerInput[] } = {
    config,
    map: getMap(config.map),
    get tick() {
      return tick
    },
    get time() {
      return tick / 60
    },
    get over() {
      return tick >= 120
    },
    seen,
    step(inputs) {
      tick++
      const input = inputs.get(LOCAL_PLAYER_ID)
      if (input) seen.push(input)
      pending.push({ id: tick, t: tick / 60, type: 'countdown', n: tick })
    },
    view() {
      const events = pending
      pending = []
      return {
        tick,
        time: tick / 60,
        mode: config.mode,
        map: config.map,
        phase: 'play',
        clock: tick / 60,
        players: [],
        foes: [],
        shots: [],
        props: [],
        shards: [],
        events
      }
    },
    setBot() {},
    addPlayer() {},
    removePlayer() {}
  }
  return world
}

describe('fixed stepper', () => {
  it('runs whole steps and keeps the remainder', () => {
    const s = new FixedStepper()
    let n = 0
    expect(s.advance(1 / 120, () => n++)).toBe(0)
    expect(s.advance(1 / 120, () => n++)).toBe(1)
    expect(s.advance(0.05, () => n++)).toBe(3)
    expect(n).toBe(4)
  })

  it('caps the backlog after a stall', () => {
    const s = new FixedStepper()
    let n = 0
    expect(s.advance(5, () => n++)).toBe(MAX_STEPS_PER_FRAME)
    expect(s.advance(1 / 60, () => n++)).toBe(1)
  })
})

describe('local session with a fake world', () => {
  const sel = { mode: 'pve' as const, mission: 'sakura' as const, difficulty: 'hard' as const }

  it('steps at 60 Hz with the latest input and collects events once per view', () => {
    const seats = buildSeats(sel, me)
    const config = matchConfig(sel, seats, 7)
    let world: ReturnType<typeof fakeWorld> | undefined
    const session = createLocalSession(config, LOCAL_PLAYER_ID, (c) => (world = fakeWorld(c)))
    const input = { ...neutralPlayerInput(), mz: 1 }
    session.setInput(input)
    const v1 = session.update(0.05)
    expect(v1?.tick).toBe(3)
    expect(v1?.events.map((e) => e.id)).toEqual([1, 2, 3])
    expect(world?.seen.every((i) => i.mz === 1)).toBe(true)
    session.setPaused(true)
    const paused = session.update(1)
    expect(paused?.tick).toBe(3)
    expect(paused?.events).toEqual([])
    session.setPaused(false)
    for (let i = 0; i < 200 && !session.over; i++) session.update(1 / 60)
    expect(session.over).toBe(true)
  })

  it('reports a world that cannot be created', () => {
    const lobby = createSoloLobby(sel, me, {
      sessionFactory: () => {
        throw new Error('not yet')
      }
    })
    const start = lobby.start()
    expect(start.config.difficulty).toBe('hard')
    expect(() => start.connect()).toThrow('not yet')
  })
})

describe('match setup', () => {
  it('fills a PvE squad with bots of other animals', () => {
    const seats = buildSeats({ mode: 'pve', mission: 'sakura', difficulty: 'easy' }, me)
    expect(seats).toHaveLength(4)
    expect(seats[0]).toMatchObject({ id: 'p1', local: true })
    expect(new Set(seats.map((s) => s.species)).size).toBe(4)
    expect(seats.slice(1).every((s) => s.bot != null && s.team === 0)).toBe(true)
    const config = matchConfig({ mode: 'pve', mission: 'nightraid', difficulty: 'easy' }, seats, 3)
    expect(config).toMatchObject({ map: 'oldtown', variant: 'night', mission: 'nightraid', difficulty: 'easy' })
    expect(config.players[0].bot).toBeUndefined()
    expect(config.players[1].bot).toBeGreaterThan(0)
  })

  it('builds 3 teams of 4 for PvP with unique names', () => {
    const seats = buildSeats({ mode: 'pvp' }, { ...me, team: 1 })
    expect(seats).toHaveLength(12)
    for (const t of [0, 1, 2]) expect(seats.filter((s) => s.team === t)).toHaveLength(4)
    expect(seats[0].team).toBe(1)
    expect(new Set(seats.map((s) => s.name)).size).toBe(12)
    expect(new Set(seats.map((s) => s.id)).size).toBe(12)
    expect(matchConfig({ mode: 'pvp' }, seats, 1).map).toBe('arena')
  })

  it('training is the player alone on the range', () => {
    const sel = { mode: 'training' as const, training: { tutorial: true, infiniteAnima: false } }
    const config = matchConfig(sel, buildSeats(sel, me), 1)
    expect(config.players).toHaveLength(1)
    expect(config).toMatchObject({ map: 'range', training: { tutorial: true, infiniteAnima: false } })
    expect(musicFor(sel)).toBe('training')
    expect(musicFor({ mode: 'pve', mission: 'maw' })).toBe('finalBoss')
  })
})

describe('model preparation per match', () => {
  it('asks only for the animals, antiques and foes the match can show', async () => {
    const { prepareRequestFor } = await import('../src/app/match')
    const sel = { mode: 'pve' as const, mission: 'nightraid' as const, difficulty: 'normal' as const }
    const req = prepareRequestFor(matchConfig(sel, buildSeats(sel, me), 1))
    expect(req.foes).toEqual(expect.arrayContaining(['kurozume', 'tsubute', 'oagos']))
    expect(req.foes).not.toContain('goutetsu')
    expect(req.items).toEqual(expect.arrayContaining(['bee', 'orca', 'mammoth']))
    const pvp = prepareRequestFor(matchConfig({ mode: 'pvp' }, buildSeats({ mode: 'pvp' }, me), 1))
    expect(pvp.foes).toEqual([])
    expect(pvp.species?.length).toBe(8)
  })
})
