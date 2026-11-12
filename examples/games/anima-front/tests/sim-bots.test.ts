import { describe, expect, it } from 'vitest'
import { makeLoadout } from '../src/data/loadout'
import { aimErrorDeg, brainOf, reactionTime } from '../src/sim/bots/index'
import { findPath } from '../src/sim/bots/nav'
import { spawnFoe } from '../src/sim/foes/index'
import { navGrid } from '../src/sim/grid'
import { setDown } from '../src/sim/player'
import type { MapDef, SimEvent, View } from '../src/sim/types'
import { createWorldOnMap, simOf } from '../src/sim/world'
import { arenaMap, cfg, flatMap, playerCfg, pvpTeams } from './sim-maps'

const none = new Map()

/** Flat map split by a long wall with one gap at x ∈ [20, 24]. */
function wallMap(): MapDef {
  const m = flatMap(40)
  m.boxes.push(
    { min: [-40, 0, -1], max: [20, 5, 1], kind: 'wall' },
    { min: [24, 0, -1], max: [40, 5, 1], kind: 'wall' }
  )
  return m
}

const steps = (w: { step(m: Map<string, never>): void }, n: number) => {
  for (let i = 0; i < n; i++) w.step(none)
}

describe('bot navigation', () => {
  it('A* goes through the gap and smoothing keeps few waypoints', () => {
    const w = createWorldOnMap(
      cfg({ mode: 'training', map: 'range', players: [playerCfg('a', { bot: 1 })] }),
      wallMap()
    )
    const g = navGrid(simOf(w))
    const path = findPath(g, 0, -10, 0, 10)!
    expect(path).not.toBeNull()
    expect(path.length).toBeLessThan(6)
    expect(path.some(([x, z]) => x > 19 && x < 25 && Math.abs(z) <= 3.5)).toBe(true)
    expect(path[path.length - 1]).toEqual([0, 10])
  })

  it('a bot walks around the wall to an ordered goal', () => {
    const w = createWorldOnMap(
      cfg({ mode: 'training', map: 'range', players: [playerCfg('a', { bot: 0.8 })] }),
      wallMap()
    )
    const sim = simOf(w)
    const p = sim.players[0]
    brainOf(sim, p).order = [0, 0, 12]
    let t = 0
    while (t < 60 * 20 && Math.hypot(p.p[0], p.p[2] - 12) > 1.5) {
      w.step(none)
      t++
    }
    expect(Math.hypot(p.p[0], p.p[2] - 12)).toBeLessThan(1.5)
    expect(t / 60).toBeLessThan(15)
  })
})

describe('bot skill', () => {
  it('reaction time and aim error scale with skill', () => {
    expect(reactionTime(0)).toBeCloseTo(0.6)
    expect(reactionTime(1)).toBeCloseTo(0.15)
    expect(aimErrorDeg(0)).toBeCloseTo(6)
    expect(aimErrorDeg(1)).toBeCloseTo(1)
  })

  const firstFire = (skill: number) => {
    const w = createWorldOnMap(
      cfg({ mode: 'training', map: 'range', players: [playerCfg('a', { preset: 'gunner', bot: skill })] }),
      flatMap()
    )
    const sim = simOf(w)
    const f = spawnFoe(sim, 'harigane', [0, 0, 10])
    f.hp = 1e6
    let seenAt = -1
    for (let i = 0; i < 60 * 5; i++) {
      w.step(none)
      if (seenAt < 0 && f.state !== 'spawn') seenAt = sim.time
      const fired = w.view().events.some((e) => e.type === 'fire' && e.who === 'a')
      if (fired && seenAt >= 0) return sim.time - seenAt
    }
    return Infinity
  }

  it('skilled bots open fire sooner than novices', () => {
    const fast = firstFire(1)
    const slow = firstFire(0)
    expect(fast).toBeLessThan(slow)
    expect(fast).toBeGreaterThanOrEqual(0.15 - 0.05)
    expect(slow).toBeGreaterThanOrEqual(0.55)
  })

  it('skilled bots land a larger share of their shots', { timeout: 30000 }, () => {
    const acc = (skill: number) => {
      const w = createWorldOnMap(
        cfg({
          mode: 'training',
          map: 'range',
          players: [playerCfg('a', { loadout: makeLoadout(['bee'], [], []), bot: skill })]
        }),
        flatMap()
      )
      const sim = simOf(w)
      sim.players[0].infinite = true
      const f = spawnFoe(sim, 'ashinaga', [0, 0, 25])
      f.hp = 1e6
      f.passive = false
      steps(w, 60 * 8)
      const s = sim.players[0].stats
      return s.hits / Math.max(1, s.shots)
    }
    expect(acc(1)).toBeGreaterThan(acc(0))
  })
})

describe('bot antique choice', () => {
  it('switches to the cheap weapon below 40 % anima', () => {
    const run = (share: number) => {
      const w = createWorldOnMap(
        cfg({
          mode: 'training',
          map: 'range',
          players: [playerCfg('a', { loadout: makeLoadout(['hippo', 'bee'], [], []), bot: 1 })]
        }),
        flatMap()
      )
      const sim = simOf(w)
      const p = sim.players[0]
      const f = spawnFoe(sim, 'harigane', [0, 0, 12])
      f.hp = 1e6
      for (let i = 0; i < 90; i++) {
        p.anima = p.maxAnima * share
        p.lastSpend = sim.time
        w.step(none)
      }
      return p.input.selR
    }
    expect(run(1)).toBe(0)
    expect(run(0.3)).toBe(1)
  })
})

describe('bot support', () => {
  it('revives a downed ally', () => {
    const w = createWorldOnMap(
      cfg({ mode: 'training', map: 'range', players: [playerCfg('a', { bot: 0.7 }), playerCfg('b')] }),
      flatMap()
    )
    const sim = simOf(w)
    const [a, b] = sim.players
    b.p = [8, 0, 0]
    a.p = [0, 0, 0]
    setDown(sim, b, 15)
    let revived = false
    for (let i = 0; i < 60 * 8 && !revived; i++) {
      w.step(none)
      revived = w.view().events.some((e) => e.type === 'revive' && e.who === 'b' && e.by === 'a')
    }
    expect(revived).toBe(true)
    expect(b.state).toBe('alive')
  })

  it('a bot squad kills crawlers spawned around it', { timeout: 30000 }, () => {
    const players = ['attacker', 'gunner', 'sniper', 'tank'].map((preset, i) =>
      playerCfg(`b${i}`, { preset, bot: 0.8 })
    )
    const w = createWorldOnMap(cfg({ mode: 'training', map: 'range', players }), flatMap())
    const sim = simOf(w)
    for (let i = 0; i < 8; i++) spawnFoe(sim, 'tsubute', [Math.sin(i) * 18, 0, -10 + Math.cos(i) * 18])
    let kills = 0
    for (let i = 0; i < 60 * 25; i++) {
      w.step(none)
      if (i % 30 === 0) kills += w.view().events.filter((e) => e.type === 'foeDie' && typeof e.by === 'string').length
    }
    kills += w.view().events.filter((e) => e.type === 'foeDie' && typeof e.by === 'string').length
    expect(kills).toBeGreaterThanOrEqual(7)
  })
})

describe('クロヅメ avatars', () => {
  it('an avatar driven by the bot brain attacks a player', { timeout: 30000 }, () => {
    const w = createWorldOnMap(
      cfg({ mode: 'training', map: 'range', players: [playerCfg('a', { preset: 'tank' })] }),
      flatMap()
    )
    const sim = simOf(w)
    const f = spawnFoe(sim, 'kurozume', [0, 0, 6], { squad: 2, yaw: Math.PI })
    const a = sim.players[0]
    a.infinite = true
    let hits = 0
    for (let i = 0; i < 60 * 12; i++) {
      w.step(none)
      if (i % 30 === 0)
        hits += w.view().events.filter((e) => e.type === 'hit' && e.target === 'a' && e.by === f.id).length
    }
    expect(hits).toBeGreaterThan(0)
  })
})

describe('bot cost', () => {
  it('12 bots stay cheap per step', { timeout: 60000 }, () => {
    const w = createWorldOnMap(
      cfg({ mode: 'pvp', map: 'arena', seed: 5, duration: 120, countdown: 0, players: pvpTeams(0.8) }),
      arenaMap()
    )
    steps(w, 120)
    const t0 = performance.now()
    steps(w, 1200)
    const ms = (performance.now() - t0) / 1200
    // Whole step (sim + 12 bots); generous for slow CI machines.
    expect(ms).toBeLessThan(4)
  })
})

function pvpMatch(seed: number, duration: number) {
  const w = createWorldOnMap(
    cfg({ mode: 'pvp', map: 'arena', seed, duration, countdown: 0, players: pvpTeams(0.7) }),
    arenaMap()
  )
  const events: SimEvent[] = []
  const views: string[] = []
  let last: View | null = null
  for (let i = 0; i < 60 * (duration + 75) && !w.over; i++) {
    w.step(none)
    if (i % 20 === 0) {
      last = w.view()
      events.push(...last.events)
      if (i % 600 === 0) views.push(JSON.stringify(last))
    }
  }
  last = w.view()
  events.push(...last.events)
  return { w, events, last, views }
}

describe('bot matches', () => {
  it('a PvP bot match ends with a winner or a draw and scores equal the KO points', { timeout: 90000 }, () => {
    const { last, events } = pvpMatch(7, 60)
    expect(['victory', 'draw']).toContain(last!.phase)
    expect(last!.pvp).toBeDefined()
    const sums = [0, 0, 0]
    for (const e of events) if (e.type === 'ko' && e.team !== undefined && e.points) sums[e.team] += e.points
    expect(last!.pvp!.scores).toEqual(sums)
    expect(events.filter((e) => e.type === 'ko').length).toBeGreaterThan(0)
  })

  it('identical bot matches produce identical views', { timeout: 60000 }, () => {
    const a = pvpMatch(3, 20)
    const b = pvpMatch(3, 20)
    expect(a.views).toEqual(b.views)
    expect(JSON.stringify(a.last)).toEqual(JSON.stringify(b.last))
  })
})
