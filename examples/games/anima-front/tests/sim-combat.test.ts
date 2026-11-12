/** Damage pipeline, credit and scaling (DESIGN §10, §11). */
import { describe, expect, it } from 'vitest'
import { blast, damageFoe, damagePlayer } from '../src/sim/combat'
import { spawnFoe } from '../src/sim/foes/index'
import { FOE_SIDE } from '../src/sim/state'
import { makeLoadout } from '../src/data/loadout'
import { rig } from './sim-helpers'
import { playerCfg } from './sim-maps'

const plain = (id: string, team: 0 | 1 | 2, species: 'shiba' | 'bear' = 'shiba') =>
  playerCfg(id, { team, species, loadout: makeLoadout(['bee'], [], []) })

describe('damage pipeline', () => {
  it('never hurts the same side (no friendly fire, no self damage)', () => {
    const r = rig({ r: ['bee'], extra: [plain('ally', 0)] })
    const me = r.player()
    expect(damagePlayer(r.sim, me, { amount: 50, kind: 'ranged', side: 0, by: 'me', at: me.p, from: me.p })).toBe(0)
    expect(
      damagePlayer(r.sim, r.player('ally'), { amount: 50, kind: 'ranged', side: 0, by: 'me', at: me.p, from: me.p })
    ).toBe(0)
    blast(r.sim, me.p, 5, 100, 0, 'me', 'pillbug')
    expect(me.anima).toBe(me.maxAnima)
    expect(r.player('ally').anima).toBe(r.player('ally').maxAnima)
  })

  it('applies the head multiplier and blocks during protection', () => {
    const r = rig({ r: ['bee'], extra: [plain('e', 1)] })
    const e = r.player('e')
    expect(
      damagePlayer(r.sim, e, { amount: 10, kind: 'ranged', side: 0, at: e.p, from: e.p, head: true, headMult: 1.8 })
    ).toBeCloseTo(18, 6)
    e.invulnUntil = r.sim.time + 1
    expect(damagePlayer(r.sim, e, { amount: 10, kind: 'ranged', side: 0, at: e.p, from: e.p })).toBe(0)
  })

  it('blast damage falls off linearly to 40 % at the edge and is blocked by walls', () => {
    const r = rig({ r: ['bee'], extra: [plain('a', 1), plain('b', 1)] })
    const a = r.player('a')
    const b = r.player('b')
    a.p = [0, 0, 0]
    b.p = [10, 0, 0]
    blast(r.sim, [0, 0.6, 0], 4, 50, 0, 'me', 'pillbug')
    expect(a.maxAnima - a.anima).toBeCloseTo(50, 3)
    b.p = [10 + 4 + b.r - 1e-6, 0, 0]
    blast(r.sim, [10, 0.6, 0], 4, 50, 0, 'me', 'pillbug')
    expect(b.maxAnima - b.anima).toBeCloseTo(20, 2)
  })

  it('bears take 40 % knockback', () => {
    const r = rig({ r: ['bee'], extra: [plain('s', 1), plain('b', 1, 'bear')] })
    for (const id of ['s', 'b']) {
      const p = r.player(id)
      p.v = [0, 0, 0]
      damagePlayer(r.sim, p, {
        amount: 1,
        kind: 'blast',
        side: 0,
        at: p.p,
        from: [p.p[0] - 1, p.p[1], p.p[2]],
        knock: 10
      })
    }
    expect(r.player('s').v[0]).toBeCloseTo(10, 3)
    expect(r.player('b').v[0]).toBeCloseTo(4, 3)
  })

  it('credits the last damager within 10 s and lists the others as assists', () => {
    const r = rig({ r: ['bee'], extra: [plain('a', 0), plain('b', 0), plain('c', 0)] })
    const f = spawnFoe(r.sim, 'oagos', [0, 0, 20])
    f.state = 'idle'
    const hit = (by: string, amount: number) =>
      damageFoe(r.sim, f, { amount, kind: 'ranged', side: 0, by, at: f.p, from: [f.p[0], 1, f.p[2] - 10] })
    hit('a', 10)
    r.step(11 * 60)
    f.state = 'idle'
    hit('b', 10)
    hit('c', 10)
    hit('me', 1e6)
    r.step(1)
    const ko = r.of('ko').find((e) => e.who === f.id)!
    expect(ko.by).toBe('me')
    expect([...ko.assists].sort()).toEqual(['b', 'c'])
    expect(r.player().stats.kos).toBe(1)
    expect(r.player('b').stats.assists).toBe(1)
    expect(r.player('a').stats.assists).toBe(0)
  })

  it('scales foes by difficulty and bosses by humans', () => {
    for (const [d, k] of [
      ['easy', 0.7],
      ['normal', 1],
      ['hard', 1.35]
    ] as const) {
      const r = rig({ r: ['bee'], config: { difficulty: d } })
      const f = spawnFoe(r.sim, 'harigane', [0, 0, 20])
      expect(f.maxHp).toBeCloseTo(45 * k, 6)
      expect(f.dmgMul).toBeCloseTo(k === 1.35 ? 1.3 : k, 6)
      const boss = spawnFoe(r.sim, 'kuitsukushi', [0, 0, 30])
      expect(boss.maxHp).toBeCloseTo(6000 * k * (0.55 + 0.15), 3)
    }
  })

  it('foes are invulnerable while spawning', () => {
    const r = rig({ r: ['bee'] })
    const f = spawnFoe(r.sim, 'tsubute', [0, 0, 20])
    expect(damageFoe(r.sim, f, { amount: 5, kind: 'ranged', side: 0, at: f.p, from: f.p })).toBe(0)
    r.step(60)
    expect(damageFoe(r.sim, f, { amount: 5, kind: 'ranged', side: 0, at: f.p, from: f.p })).toBe(5)
    expect(damageFoe(r.sim, f, { amount: 5, kind: 'ranged', side: FOE_SIDE, at: f.p, from: f.p })).toBe(0)
  })

  it('every application produces a hit event with amount and surface', () => {
    const r = rig({ r: ['bee'], extra: [plain('e', 1)] })
    const e = r.player('e')
    damagePlayer(r.sim, e, { amount: 7, kind: 'ranged', side: 0, by: 'me', item: 'bee', at: e.p, from: e.p })
    r.step(1)
    const h = r.of('hit')[0]
    expect(h).toMatchObject({ target: 'e', targetKind: 'player', by: 'me', item: 'bee', amount: 7, surface: 'fur' })
    expect(r.player().stats.damage).toBe(7)
    expect(r.player().stats.hits).toBe(1)
  })
})
