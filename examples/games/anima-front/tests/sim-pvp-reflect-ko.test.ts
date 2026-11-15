/** A mutual KO through ハリネズミ: the hit and its KO resolve first, the reflect second, and a decided result is final. */
import { describe, expect, it } from 'vitest'
import { makeLoadout } from '../src/data/loadout'
import { damagePlayer } from '../src/sim/combat'
import { respawn } from '../src/sim/player'
import { type SimEvent, type TeamId } from '../src/sim/types'
import { createWorldOnMap, simOf } from '../src/sim/world'
import { arenaMap, cfg, playerCfg } from './sim-maps'

function world(duration: number) {
  const players = [
    playerCfg('attacker', { team: 0, loadout: makeLoadout(['bee'], [], []) }),
    playerCfg('wearer', { team: 1, loadout: makeLoadout(['bee'], [], ['hedgehog']) }),
    playerCfg('extra', { team: 2 as TeamId, loadout: makeLoadout(['bee'], [], []) })
  ]
  const w = createWorldOnMap(cfg({ mode: 'pvp', map: 'arena', duration, countdown: 0, players }), arenaMap())
  const sim = simOf(w)
  const attacker = sim.players.find((p) => p.id === 'attacker')!
  const wearer = sim.players.find((p) => p.id === 'wearer')!
  const events: SimEvent[] = []
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      w.step(new Map())
      events.push(...w.view().events)
    }
  }
  step(2)
  for (const p of sim.players) p.p = [0, 0, 30 + sim.players.indexOf(p)]
  /** The mutual KO: the attacker (5 anima) hits the wearer (30 anima) for 40 in melee. */
  const mutual = () => {
    attacker.p = [0, 0, 0]
    wearer.p = [1, 0, 0]
    attacker.invulnUntil = 0
    wearer.invulnUntil = 0
    attacker.anima = 5
    wearer.anima = 30
    events.length = 0
    damagePlayer(sim, wearer, {
      amount: 40,
      kind: 'melee',
      side: attacker.side,
      by: 'attacker',
      at: wearer.p,
      from: attacker.p
    })
    events.push(...w.view().events)
  }
  return { w, sim, attacker, wearer, events, step, mutual }
}

describe('ハリネズミ mutual KO', () => {
  it('normal time: the original KO comes first, then the reflect KO; both points count', () => {
    const m = world(300)
    m.mutual()
    const kos = m.events.filter((e) => e.type === 'ko')
    expect(kos.map((e) => [e.who, e.by])).toEqual([
      ['wearer', 'attacker'],
      ['attacker', 'wearer']
    ])
    expect(m.w.view().pvp!.scores).toEqual([1, 1, 0])
    expect(m.w.view().phase).not.toBe('victory')
  })

  it('sudden death: the original hit decides it; the reflect changes nothing, the MVP follows the final numbers', () => {
    const m = world(360)
    // five mutual KOs each in normal time: tied 5–5, then sudden death
    for (let i = 0; i < 5; i++) {
      for (const [a, t] of [
        [m.attacker, m.wearer],
        [m.wearer, m.attacker]
      ]) {
        t.invulnUntil = 0
        damagePlayer(m.sim, t, { amount: 1000, kind: 'ranged', side: a.side, by: a.id, at: t.p, from: a.p })
        respawn(m.sim, t, { p: t.p, yaw: t.yaw }, 0)
      }
    }
    expect(m.w.view().pvp!.scores.slice(0, 2)).toEqual([5, 5])
    m.step(360 * 60 + 10)
    expect(m.w.view().pvp!.suddenDeath).toBe(true)
    m.mutual()
    const v = m.w.view()
    expect(v.phase).toBe('victory')
    expect(v.pvp!.winner).toBe(0)
    expect(v.pvp!.scores.slice(0, 2)).toEqual([7, 5]) // the last spurt: a KO is worth 2
    // the reflect after the decision does nothing: the attacker keeps its armour and the wearer gets no KO
    expect(m.attacker.state).toBe('alive')
    expect(m.attacker.anima).toBe(5)
    expect(m.wearer.stats.kos).toBe(5)
    expect(m.attacker.stats.kos).toBe(6)
    expect(m.events.filter((e) => e.type === 'ko').map((e) => e.who)).toEqual(['wearer'])
    // MVP by its rule (most KOs, then assists, then damage) on the final numbers
    expect(v.pvp!.mvp).toBe('attacker')
    // nothing changes afterwards either
    m.step(60)
    m.attacker.invulnUntil = 0
    damagePlayer(m.sim, m.attacker, {
      amount: 99,
      kind: 'ranged',
      side: m.wearer.side,
      by: 'wearer',
      at: m.attacker.p,
      from: m.wearer.p
    })
    expect(m.wearer.stats.kos).toBe(5)
    expect(m.w.view().pvp!.mvp).toBe('attacker')
  })
})
