/** 三つ巴演習 rules (DESIGN §12) with scripted KOs. */
import { describe, expect, it } from 'vitest'
import { makeLoadout } from '../src/data/loadout'
import { PVP_RADIO } from '../src/data/missions'
import { damagePlayer } from '../src/sim/combat'
import { neutralPlayerInput, type PlayerInput, type SimEvent, type TeamId } from '../src/sim/types'
import { createWorldOnMap, simOf } from '../src/sim/world'
import { arenaMap, cfg, playerCfg } from './sim-maps'

function match(duration = 70) {
  const players = (['a', 'b', 'c'] as const).map((id, t) =>
    playerCfg(id, { team: t as TeamId, loadout: makeLoadout(['bee'], [], []) })
  )
  const world = createWorldOnMap(cfg({ mode: 'pvp', map: 'arena', duration, countdown: 0, players }), arenaMap())
  const sim = simOf(world)
  const inputs = new Map<string, PlayerInput>(players.map((p) => [p.id, neutralPlayerInput()]))
  const events: SimEvent[] = []
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      world.step(inputs)
      events.push(...world.view().events)
    }
  }
  const p = (id: string) => sim.players.find((q) => q.id === id)!
  const ko = (victim: string, by?: string) => {
    const v = p(victim)
    v.invulnUntil = 0
    damagePlayer(sim, v, { amount: 9999, kind: 'ranged', side: by ? p(by).side : 3, by, at: v.p, from: v.p })
  }
  // Keep everyone out of the bases' reach (bases are 45 m out).
  for (const q of sim.players) q.p = [0, 0, 20]
  return { world, sim, step, events, p, ko }
}

describe('pvp', () => {
  it('a KO scores +1 for the killer team, warps out and respawns after 5 s with 2 s protection', () => {
    const m = match()
    m.step(1)
    m.ko('b', 'a')
    m.step(1)
    const ko = m.events.find((e) => e.type === 'ko')!
    expect(ko).toMatchObject({ who: 'b', by: 'a', team: 0, points: 1 })
    expect(m.world.view().pvp!.scores).toEqual([1, 0, 0])
    expect(m.p('b').state).toBe('away')
    expect(m.p('a').stats.kos).toBe(1)
    m.step(5 * 60)
    expect(m.p('b').state).toBe('alive')
    expect(m.world.view().players.find((x) => x.id === 'b')!.invuln).toBe(true)
    m.step(2 * 60 + 2)
    expect(m.world.view().players.find((x) => x.id === 'b')!.invuln).toBe(false)
  })

  it('the last 60 s is a last spurt: KOs are worth 2', () => {
    const m = match(70)
    m.step(10 * 60 + 2)
    expect(m.events.some((e) => e.type === 'lastSpurt')).toBe(true)
    expect(m.events.some((e) => e.type === 'radio' && e.text === PVP_RADIO.lastSpurt.text)).toBe(true)
    expect(m.world.view().pvp!.lastSpurt).toBe(true)
    m.ko('c', 'b')
    m.step(1)
    expect(m.world.view().pvp!.scores).toEqual([0, 2, 0])
  })

  it('the highest score wins at the end with an MVP; scores equal the KO events', () => {
    const m = match(20)
    m.step(1)
    m.ko('b', 'a')
    m.step(6 * 60)
    m.ko('c', 'a')
    m.step(15 * 60)
    const v = m.world.view()
    expect(v.phase).toBe('victory')
    expect(v.pvp!.winner).toBe(0)
    expect(v.pvp!.mvp).toBe('a')
    const sum = [0, 0, 0]
    for (const e of m.events) if (e.type === 'ko' && e.team !== undefined) sum[e.team] += e.points ?? 0
    expect(v.pvp!.scores).toEqual(sum)
    m.step(4 * 60 + 2)
    expect(m.world.over).toBe(true)
  })

  it('a tie plays sudden death: the first KO by a tied team wins', () => {
    const m = match(10)
    m.step(1)
    m.ko('c', 'a')
    m.step(6 * 60)
    m.ko('c', 'b')
    m.step(5 * 60)
    expect(m.events.some((e) => e.type === 'suddenDeath')).toBe(true)
    expect(m.world.view().pvp!.suddenDeath).toBe(true)
    m.step(5 * 60)
    m.ko('a', 'b')
    m.step(1)
    const v = m.world.view()
    expect(v.phase).toBe('victory')
    expect(v.pvp!.winner).toBe(1)
  })

  it('sudden death without a KO ends in a draw', () => {
    const m = match(5)
    m.step(5 * 60 + 2)
    expect(m.world.view().pvp!.suddenDeath).toBe(true)
    m.step(60 * 60 + 2)
    const v = m.world.view()
    expect(v.phase).toBe('draw')
    expect(v.pvp!.winner).toBe(-1)
  })

  it('bases regenerate their team +12/s and hurt intruders 20/s (scoring for the base team)', () => {
    const m = match()
    m.step(1)
    const home = m.sim.map.bases.find((b) => b.team === 0)!
    const a = m.p('a')
    a.p = [home.p[0], 0, home.p[2]]
    a.anima = 50
    m.step(60)
    // +12/s from the base, plus natural regeneration (no spending or damage for 4 s).
    expect(a.anima).toBeCloseTo(62 + 1.5, 0)
    expect(m.events.some((e) => e.type === 'heal' && e.who === 'a' && e.source === 'base')).toBe(true)
    const b = m.p('b')
    b.p = [home.p[0] + 1, 0, home.p[2]]
    const before = b.anima
    m.step(60)
    expect(before - b.anima).toBeCloseTo(20, 0)
    m.step(10 * 60)
    const ko = m.events.find((e) => e.type === 'ko' && e.who === 'b')!
    expect(ko.team).toBe(0)
  })
})
