/** Anima economy (DESIGN §5). */
import { describe, expect, it } from 'vitest'
import { ITEMS, type ItemId } from '../src/data/items'
import { dropShards, regenDelay, regenRate } from '../src/sim/anima'
import { damagePlayer } from '../src/sim/combat'
import { costOf, meleeMul, periodOf, rangedMul, spreadMul } from '../src/sim/items/common'
import { affordable, effectiveCost, modsOf } from '../src/sim/loadout'
import { dashCooldown, maxSpeed } from '../src/sim/player'
import { FOE_SIDE } from '../src/sim/state'
import { rig } from './sim-helpers'

describe('anima', () => {
  it('a use needs anima ≥ cost + 1, otherwise an empty click', () => {
    const r = rig({ r: ['bee'] })
    r.step(2)
    const p = r.player()
    p.anima = 1.1
    p.lastSpend = r.sim.time
    r.press('R')
    expect(r.of('fire').length).toBe(0)
    expect(r.of('empty').length).toBe(1)
    expect(r.of('empty')[0].hand).toBe('R')
    p.anima = 1.2
    r.step(20)
    r.press('R')
    expect(r.of('fire').length).toBe(1)
    expect(p.anima).toBeCloseTo(1.05, 3)
  })

  it('upkeep drains online passives and is recorded per antique', () => {
    const r = rig({ r: ['bee'], passive: ['turtle', 'hedgehog'] })
    const p = r.player()
    p.anima = 60
    p.lastHurt = r.sim.time + 100 // block regeneration
    r.step(60)
    expect(60 - p.anima).toBeCloseTo(0.65, 2)
    expect(p.stats.byItem.turtle).toBeCloseTo(0.4, 2)
    expect(p.stats.byItem.hedgehog).toBeCloseTo(0.25, 2)
  })

  it('critical (≤ 15 %) takes passives offline, they return above 20 %', () => {
    const r = rig({ r: ['bee'], passive: ['turtle'] })
    const p = r.player()
    r.step(1)
    p.anima = p.maxAnima * 0.15
    p.lastHurt = r.sim.time + 100
    r.step(1)
    expect(p.online).toBe(false)
    expect(r.of('critical').length).toBe(1)
    expect(r.of('passives').at(-1)!.online).toBe(false)
    // Offline armour gives no reduction and costs no upkeep.
    const a = p.anima
    r.step(30)
    expect(p.anima).toBe(a)
    expect(damagePlayer(r.sim, p, { amount: 4, kind: 'ranged', side: FOE_SIDE, at: p.p, from: p.p })).toBe(4)
    p.anima = p.maxAnima * 0.19
    r.step(1)
    expect(p.online).toBe(false)
    p.anima = p.maxAnima * 0.21
    r.step(1)
    expect(p.online).toBe(true)
  })

  it('regenerates 1.5/s after 4 s without spending or damage; koala adds and shortens', () => {
    for (const [passive, delay, rate] of [
      [[], 4, 1.5],
      [['koala'], 3, 2.3],
      [['koala', 'camel'], 3, 2.1]
    ] as const) {
      const r = rig({ r: ['bee'], passive: [...passive] })
      const p = r.player()
      r.step(1)
      p.anima = 40
      damagePlayer(r.sim, p, { amount: 1, kind: 'ranged', side: FOE_SIDE, at: p.p, from: p.p })
      r.step(Math.round((delay - 0.2) * 60))
      expect(p.anima).toBeCloseTo(39, 3)
      r.step(Math.round(0.2 * 60) + 60)
      expect(p.anima - 39).toBeCloseTo(rate, 1)
    }
  })

  it('shards fly to the nearest player within 6 m; hamsters get ×1.5', () => {
    for (const [species, k] of [
      ['shiba', 1],
      ['hamster', 1.5]
    ] as const) {
      const r = rig({ r: ['bee'], species })
      const p = r.player()
      r.step(1)
      p.anima = 30
      p.lastHurt = r.sim.time + 100
      dropShards(r.sim, [p.p[0] + 3, 0, p.p[2]], { chance: 1, count: 2, amount: 4 })
      r.step(120)
      expect(r.of('shard').length).toBe(2)
      expect(p.anima).toBeCloseTo(30 + 8 * k, 3)
      expect(p.stats.gathered).toBeCloseTo(8 * k, 3)
      // Out of range shards wait on the ground.
      dropShards(r.sim, [p.p[0] + 20, 0, p.p[2]], { chance: 1, count: 1, amount: 4 })
      r.step(120)
      expect(r.sim.shards.length).toBe(1)
      expect(r.sim.shards[0].to).toBeUndefined()
    }
  })

  it('burn shows anima lost or spent during the last 3 s', () => {
    const r = rig({ r: ['bee'] })
    const p = r.player()
    r.step(1)
    damagePlayer(r.sim, p, { amount: 10, kind: 'ranged', side: FOE_SIDE, at: p.p, from: p.p })
    r.press('R')
    expect(r.world.view().players[0].burn).toBeCloseTo(10.15, 2)
    r.step(200)
    expect(r.world.view().players[0].burn).toBe(0)
    expect(p.stats.spent).toBeCloseTo(0.15, 3)
    expect(p.stats.byItem.bee).toBeCloseTo(0.15, 3)
    expect(p.stats.taken).toBeCloseTo(10, 3)
  })

  it('breaking the armour in training warps out and respawns full', () => {
    const r = rig({ r: ['bee'] })
    const p = r.player()
    r.step(1)
    damagePlayer(r.sim, p, { amount: 500, kind: 'ranged', side: FOE_SIDE, at: p.p, from: p.p })
    r.step(1)
    expect(r.of('armorBreak').length).toBe(1)
    expect(p.state).toBe('away')
    r.step(3 * 60 + 2)
    expect(p.state).toBe('alive')
    expect(p.anima).toBe(p.maxAnima)
    expect(r.of('respawn').length).toBe(1)
  })

  it('infinite anima never runs dry', () => {
    const r = rig({ r: ['hippo'], config: { training: { infiniteAnima: true } } })
    const p = r.player()
    r.step(1)
    for (let i = 0; i < 5; i++) {
      r.press('R')
      r.step(200)
    }
    expect(r.of('fire').length).toBe(5)
    expect(p.anima).toBe(p.maxAnima)
    expect(r.world.view().training?.infinite).toBe(true)
  })
})

describe('critical anima turns enhancement options offline too (DESIGN §5)', () => {
  const setFrac = (r: ReturnType<typeof rig>, f: number) => {
    const p = r.player()
    p.anima = p.build.maxAnima * f
    p.lastHurt = r.sim.time + 100
    r.step(1)
  }
  /** Reads `probe` at full anima, while critical (10 %), at 19 % (still offline) and after recovery (50 %). */
  const phases = <T>(passive: ItemId[], probe: (r: ReturnType<typeof rig>) => T, r_: ItemId[] = ['bee']) => {
    const r = rig({ r: r_, passive })
    r.step(1)
    const before = probe(r)
    setFrac(r, 0.1)
    expect(r.player().online).toBe(false)
    const offline = probe(r)
    setFrac(r, 0.19)
    expect(r.player().online).toBe(false)
    expect(probe(r)).toEqual(offline)
    setFrac(r, 0.5)
    expect(r.player().online).toBe(true)
    return { before, offline, after: probe(r) }
  }
  const cases: [string, ItemId[], (r: ReturnType<typeof rig>) => number, number][] = [
    ['hawk ranged damage', ['hawk', 'hawk'], (r) => rangedMul(r.player()), 1],
    ['hawk spread', ['hawk', 'hawk'], (r) => spreadMul(r.player()), 1],
    ['hawk ranged cost', ['hawk', 'hawk'], (r) => costOf(r.player(), ITEMS.bee), 1],
    ['sloth cost', ['sloth'], (r) => costOf(r.player(), ITEMS.bee), 1],
    ['sloth rate', ['sloth'], (r) => periodOf(r.player(), 1), 1],
    ['fang melee damage', ['fang'], (r) => meleeMul(r.player()), 1],
    ['cheetah speed', ['cheetah'], (r) => maxSpeed(r.player()), 1],
    ['cheetah dash cooldown', ['cheetah'], (r) => dashCooldown(r.player()), 1],
    ['koala regen', ['koala'], (r) => regenRate(r.player()), 1],
    ['koala regen delay', ['koala'], (r) => regenDelay(r.player()), 1],
    ['rhino armour effect', ['rhino', 'turtle'], (r) => modsOf(r.player()).armorEffect, 1],
    ['camel max anima', ['camel'], (r) => r.player().maxAnima, 1]
  ]
  for (const [name, passive, probe] of cases) {
    it(`${name}: active, off while critical, back above 20 %`, () => {
      const { before, offline, after } = phases(passive, probe)
      expect(offline).not.toBeCloseTo(before)
      expect(after).toBeCloseTo(before)
    })
  }

  it('offline values equal a build without those enhancements', () => {
    const bare = rig({ r: ['bee'] })
    const r = rig({ r: ['bee'], passive: ['hawk', 'cheetah', 'koala', 'sloth', 'fang', 'camel'] })
    r.step(1)
    setFrac(r, 0.1)
    const a = r.player()
    const b = bare.player()
    expect(rangedMul(a)).toBe(rangedMul(b))
    expect(spreadMul(a)).toBe(spreadMul(b))
    expect(meleeMul(a)).toBe(meleeMul(b))
    expect(costOf(a, ITEMS.bee)).toBe(costOf(b, ITEMS.bee))
    expect(maxSpeed(a)).toBe(maxSpeed(b))
    expect(dashCooldown(a)).toBe(dashCooldown(b))
    expect(regenRate(a)).toBe(regenRate(b))
    expect(regenDelay(a)).toBe(regenDelay(b))
    expect(a.maxAnima).toBe(b.maxAnima)
  })

  it('camel offline shrinks max anima without killing or flapping', () => {
    const r = rig({ r: ['bee'], passive: ['camel'] })
    r.step(1)
    const p = r.player()
    const full = p.build.maxAnima
    p.anima = full * 0.15
    p.lastHurt = r.sim.time + 100
    r.step(5)
    expect(p.online).toBe(false)
    expect(p.maxAnima).toBe(full - p.build.mods.maxAnima)
    expect(p.anima).toBeGreaterThan(0)
    expect(p.anima).toBeLessThanOrEqual(p.maxAnima)
  })

  it('effectiveCost matches the sim: hippo with 3 hawks 4.6 online, 4 offline; eel usable at 2 anima', () => {
    const hawks: ItemId[] = ['hawk', 'hawk', 'hawk']
    expect(effectiveCost(hawks, true, 'hippo').cost).toBeCloseTo(4.6)
    expect(effectiveCost(hawks, false, 'hippo').cost).toBe(4)
    const r = rig({ r: ['hippo'], passive: hawks })
    r.step(1)
    expect(costOf(r.player(), ITEMS.hippo)).toBeCloseTo(effectiveCost(hawks, true, 'hippo').cost!)
    setFrac(r, 0.1)
    expect(costOf(r.player(), ITEMS.hippo)).toBe(effectiveCost(hawks, false, 'hippo').cost)
    // A held drain needs anima >= drain x DT + 1, a use needs anima >= cost + 1.
    expect(affordable(2, effectiveCost([], false, 'eel'))).toBe(true)
    expect(affordable(1.01, effectiveCost([], false, 'eel'))).toBe(false)
    expect(affordable(5, effectiveCost(hawks, false, 'hippo'))).toBe(true)
    expect(affordable(5.5, effectiveCost(hawks, true, 'hippo'))).toBe(false)
    expect(affordable(5.7, effectiveCost(hawks, true, 'hippo'))).toBe(true)
    expect(affordable(0, {})).toBe(true)
  })
})
