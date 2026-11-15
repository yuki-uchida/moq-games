/** ハリネズミ reflect against players (PvP) and foes, and the full refill after a recovery with ラクダ equipped. */
import { describe, expect, it } from 'vitest'
import { makeLoadout } from '../src/data/loadout'
import { FOE_SIDE } from '../src/sim/state'
import { damagePlayer } from '../src/sim/combat'
import { spawnFoe } from '../src/sim/foes/index'
import { neutralPlayerInput, type PlayerInput, type TeamId } from '../src/sim/types'
import { createWorldOnMap, simOf } from '../src/sim/world'
import { arenaMap, cfg, playerCfg, sakuraMap } from './sim-maps'

const wear = (items: ('hedgehog' | 'camel')[]) => makeLoadout(['bee'], [], items)

function pvp(loadouts: Record<string, ReturnType<typeof wear>>, duration = 70) {
  const players = Object.entries(loadouts).map(([id, loadout], i) => playerCfg(id, { team: i as TeamId, loadout }))
  const world = createWorldOnMap(cfg({ mode: 'pvp', map: 'arena', duration, countdown: 0, players }), arenaMap())
  const sim = simOf(world)
  const inputs = new Map<string, PlayerInput>(players.map((p) => [p.id, neutralPlayerInput()]))
  for (const q of sim.players) q.p = [0, 0, 20]
  const step = (n: number) => {
    for (let i = 0; i < n; i++) world.step(inputs)
  }
  const p = (id: string) => sim.players.find((q) => q.id === id)!
  step(2)
  for (const q of sim.players) q.invulnUntil = 0
  const hit = (victim: string, by: string, amount: number, kind: 'melee' | 'contact' = 'melee') => {
    const v = p(victim)
    const a = p(by)
    return damagePlayer(sim, v, { amount, kind, side: a.side, by, at: v.p, from: a.p })
  }
  return { world, sim, step, p, hit }
}

describe('ハリネズミ reflect', () => {
  it('PvP: a melee hit of 14 on the wearer returns 7 to the attacker, credited to the wearer', () => {
    const m = pvp({ a: wear([]), b: wear(['hedgehog']) })
    const a0 = m.p('a').anima
    const b0 = m.p('b').anima
    m.hit('b', 'a', 14)
    expect(b0 - m.p('b').anima).toBeCloseTo(14, 3)
    expect(a0 - m.p('a').anima).toBeCloseTo(7, 3)
    expect(m.p('b').stats.damage).toBeCloseTo(7, 3)
    expect(m.p('a').damagers.has('b')).toBe(true)
  })

  it('a ranged hit is not reflected; a teammate and an invulnerable attacker take nothing', () => {
    const m = pvp({ a: wear([]), b: wear(['hedgehog']) })
    const a0 = m.p('a').anima
    m.hit('b', 'a', 14, 'melee')
    const afterMelee = m.p('a').anima
    expect(afterMelee).toBeLessThan(a0)
    const m2 = pvp({ a: wear([]), b: wear(['hedgehog']) })
    m2.p('a').invulnUntil = m2.sim.time + 5
    const a1 = m2.p('a').anima
    m2.hit('b', 'a', 14)
    expect(m2.p('a').anima).toBe(a1)
  })

  it('two hedgehogs do not ping-pong: the reflect is not reflected again', () => {
    const m = pvp({ a: wear(['hedgehog']), b: wear(['hedgehog']) })
    const a0 = m.p('a').anima
    const b0 = m.p('b').anima
    m.hit('b', 'a', 14)
    expect(b0 - m.p('b').anima).toBeCloseTo(14, 3)
    expect(a0 - m.p('a').anima).toBeCloseTo(7, 3)
  })

  it('PvE: a foe that hits the wearer still takes the share back', () => {
    const players = [playerCfg('h0', { loadout: wear(['hedgehog']) })]
    const world = createWorldOnMap(
      cfg({ mode: 'pve', map: 'oldtown', mission: 'sakura', difficulty: 'easy', seed: 3, players, countdown: 0 }),
      sakuraMap()
    )
    const sim = simOf(world)
    const inputs = new Map([['h0', neutralPlayerInput()]])
    for (let i = 0; i < 5; i++) world.step(inputs)
    const me = sim.players[0]
    me.invulnUntil = 0
    const f = spawnFoe(sim, 'tategami', [me.p[0] + 1, me.p[1], me.p[2]])
    f.state = 'idle'
    const hp = f.hp
    damagePlayer(sim, me, { amount: 20, kind: 'melee', side: FOE_SIDE, by: f.id, at: me.p, from: f.p })
    expect(f.hp).toBeLessThan(hp)
  })
})

describe('recovery refills to the online max (ラクダ)', () => {
  for (const camels of [1, 2, 3]) {
    const gear = Array.from({ length: camels }, () => 'camel' as const)

    it(`PvP respawn with ${camels} ラクダ: anima = the full online max`, () => {
      const m = pvp({ a: wear(gear), b: wear([]) })
      const a = m.p('a')
      const full = a.build.maxAnima
      expect(full).toBeGreaterThan(a.build.maxAnima - a.build.mods.maxAnima)
      expect(a.maxAnima).toBe(full)
      // drained to critical: the passives go offline and the max loses the enhancements
      a.anima = 3
      m.step(2)
      expect(a.online).toBe(false)
      expect(a.maxAnima).toBeLessThan(full)
      m.hit('a', 'b', 9999)
      expect(a.state).toBe('away')
      m.step(5 * 60 + 5)
      expect(a.state).toBe('alive')
      expect(a.online).toBe(true)
      expect(a.maxAnima).toBe(full)
      expect(a.anima).toBe(full)
    })

    it(`PvE warp back with ${camels} ラクダ: anima = the full online max`, () => {
      const players = [playerCfg('h0', { loadout: wear(gear) })]
      const world = createWorldOnMap(
        cfg({ mode: 'pve', map: 'oldtown', mission: 'sakura', difficulty: 'easy', seed: 3, players, countdown: 0 }),
        sakuraMap()
      )
      const sim = simOf(world)
      const inputs = new Map([['h0', neutralPlayerInput()]])
      for (let i = 0; i < 5; i++) world.step(inputs)
      const me = sim.players[0]
      const full = me.build.maxAnima
      me.invulnUntil = 0
      me.anima = 3
      world.step(inputs)
      world.step(inputs)
      expect(me.online).toBe(false)
      expect(me.maxAnima).toBeLessThan(full)
      damagePlayer(sim, me, { amount: 9999, kind: 'hazard', side: FOE_SIDE, at: me.p, from: me.p })
      expect(me.state).toBe('down')
      let warped = false
      for (let i = 0; i < 60 * 60 && !(warped && me.state === 'alive'); i++) {
        world.step(inputs)
        if (me.state === 'away') warped = true
      }
      expect(warped).toBe(true)
      expect(me.state).toBe('alive')
      expect(me.online).toBe(true)
      expect(me.maxAnima).toBe(full)
      expect(me.anima).toBe(full)
    })
  }
})
