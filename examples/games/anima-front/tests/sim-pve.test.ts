/** 防衛任務 rules (DESIGN §12) and the five missions played by all-bot squads on 訓練. */
import { describe, expect, it } from 'vitest'
import { makeLoadout } from '../src/data/loadout'
import { MISSIONS, type MissionId } from '../src/data/missions'
import { damagePlayer, damageProp, killFoe } from '../src/sim/combat'
import { spawnFoe } from '../src/sim/foes/index'
import { WaveDirector } from '../src/sim/modes/waves'
import { FOE_SIDE } from '../src/sim/state'
import { neutralPlayerInput, type MapDef, type MapId, type PlayerInput, type SimEvent } from '../src/sim/types'
import { createWorldOnMap, simOf } from '../src/sim/world'
import { blightMap, botSquad, cfg, harborMap, playerCfg, sakuraMap } from './sim-maps'

const MAPS: Record<MissionId, [MapId, () => MapDef]> = {
  sakura: ['oldtown', sakuraMap],
  harbor: ['harbor', harborMap],
  nightraid: ['oldtown', sakuraMap],
  blight: ['blight', blightMap],
  maw: ['blight', () => blightMap('crater')]
}

function mission(
  id: MissionId,
  players = botSquad(4, 0.8),
  difficulty: 'easy' | 'normal' | 'hard' = 'easy',
  countdown?: number
) {
  const [map, mk] = MAPS[id]
  const world = createWorldOnMap(
    cfg({
      mode: 'pve',
      map,
      mission: id,
      difficulty,
      seed: 3,
      players,
      ...(countdown !== undefined ? { countdown } : {})
    }),
    mk()
  )
  const events: SimEvent[] = []
  const inputs = new Map<string, PlayerInput>()
  for (const p of players) if (p.bot === undefined) inputs.set(p.id, neutralPlayerInput())
  const step = (n: number) => {
    for (let i = 0; i < n && !world.over; i++) {
      world.step(inputs)
      events.push(...world.view().events)
    }
  }
  return { world, sim: simOf(world), events, step, inputs }
}

const idle = () => [playerCfg('h0', { loadout: makeLoadout(['bee'], [], []) })]

describe('missions played by bots on 訓練', () => {
  for (const [id, limit] of [
    ['sakura', 300],
    ['harbor', 450],
    ['nightraid', 300],
    ['blight', 360],
    ['maw', 240]
  ] as [MissionId, number][]) {
    it(`${MISSIONS[id].name} is won within ${limit} s`, { timeout: 120_000 }, () => {
      const m = mission(id)
      m.step(limit * 60)
      const v = m.world.view()
      expect(v.phase).toBe('victory')
      expect(v.pve!.result).toBeTruthy()
      expect(['S', 'A', 'B', 'C']).toContain(v.pve!.result!.rank)
      expect(v.pve!.result!.mvp).toBeTruthy()
      const radio = m.events.filter((e) => e.type === 'radio').map((e) => e.text)
      expect(radio).toContain(MISSIONS[id].radio.start.text)
      for (const l of MISSIONS[id].radio.victory) expect(radio).toContain(l.text)
      expect(m.events.some((e) => e.type === 'objective' && e.what === 'complete')).toBe(true)
    })
  }
})

describe('pve rules', () => {
  it('mission 1 is lost when the lighthouse falls', () => {
    const m = mission('sakura', idle(), 'easy', 0)
    m.step(10)
    const lh = m.sim.props.find((r) => r.kind === 'lighthouse')!
    expect(lh.hp).toBe(MISSIONS.sakura.objective.kind === 'defend' ? MISSIONS.sakura.objective.hp : -1)
    damageProp(m.sim, lh, { amount: 5000, kind: 'ranged', side: FOE_SIDE, at: lh.p, from: lh.p })
    m.step(2)
    const v = m.world.view()
    expect(v.phase).toBe('defeat')
    expect(v.pve!.result!.rank).toBe('C')
    const radio = m.events.filter((e) => e.type === 'radio').map((e) => e.text)
    for (const l of MISSIONS.sakura.radio.defeat) expect(radio).toContain(l.text)
    expect(m.events.some((e) => e.type === 'objective' && e.what === 'destroyed')).toBe(true)
  })

  it('downs, revive window, warp, tickets and defeat when nobody can come back', () => {
    const m = mission('sakura', idle(), 'hard', 0)
    m.step(5)
    const lh = m.sim.props.find((r) => r.kind === 'lighthouse')!
    lh.hp = lh.maxHp = 1e9
    const p = m.sim.players[0]
    const tickets = m.world.view().pve!.tickets
    expect(tickets).toBe(3)
    for (let k = 0; k < tickets; k++) {
      p.invulnUntil = 0
      damagePlayer(m.sim, p, { amount: 999, kind: 'ranged', side: FOE_SIDE, at: p.p, from: p.p })
      expect(p.state).toBe('down')
      m.step(15 * 60 + 2)
      expect(p.state).toBe('away')
      m.step(8 * 60 + 2)
      expect(p.state).toBe('alive')
    }
    expect(m.world.view().pve!.tickets).toBe(0)
    expect(m.events.filter((e) => e.type === 'radio' && e.text === MISSIONS.sakura.radio.lowTickets!.text).length).toBe(
      1
    )
    p.invulnUntil = 0
    damagePlayer(m.sim, p, { amount: 999, kind: 'ranged', side: FOE_SIDE, at: p.p, from: p.p })
    m.step(2)
    expect(m.world.view().phase).toBe('defeat')
  })

  it('a downed animal is revived by an ally holding interact for 2 s', () => {
    const players = [
      playerCfg('a', { loadout: makeLoadout(['bee'], [], []) }),
      playerCfg('b', { loadout: makeLoadout(['bee'], [], []) })
    ]
    const m = mission('sakura', players, 'easy', 0)
    m.step(5)
    const [a, b] = m.sim.players
    b.p = [a.p[0] + 1.5, a.p[1], a.p[2]]
    damagePlayer(m.sim, a, { amount: 999, kind: 'ranged', side: FOE_SIDE, at: a.p, from: a.p })
    const bAnima = b.anima
    m.inputs.get('b')!.held = 16
    m.step(60)
    expect(a.state).toBe('down')
    expect(m.world.view().players[0].revive).toBeGreaterThan(0.4)
    m.step(62)
    expect(a.state).toBe('alive')
    expect(a.anima).toBeCloseTo(a.maxAnima * 0.3, 0)
    expect(bAnima - b.anima).toBeCloseTo(15, 0)
    expect(b.stats.revives).toBe(1)
    expect(m.events.some((e) => e.type === 'revive' && e.who === 'a' && e.by === 'b')).toBe(true)
  })

  it('the next wave starts 8 s after a clear, or 70 s after the wave began', () => {
    const m = mission('sakura', idle(), 'easy', 0)
    // Keep the lighthouse and the idle animal standing while nobody defends.
    const lh = m.sim.props.find((r) => r.kind === 'lighthouse')!
    lh.hp = lh.maxHp = 1e9
    m.sim.players[0].invulnUntil = 1e9
    // Clear wave 1 by killing every spawned foe once its spawns are done.
    const w1 = MISSIONS.sakura.waves[0].groups.reduce((t, g) => Math.max(t, g.delay), 0)
    m.step(Math.round((w1 + 4) * 60))
    for (const f of m.sim.foes) if (!f.dead) killFoe(m.sim, f, undefined)
    m.step(2)
    const clear = m.events.find((e) => e.type === 'waveClear')!
    expect(clear).toBeTruthy()
    m.step(8 * 60 + 2)
    const wave2 = m.events.find((e) => e.type === 'wave' && e.wave === 2)!
    expect(wave2.t - clear.t).toBeCloseTo(8, 1)
    // Wave 3 by the 70 s rule (nobody clears wave 2).
    m.step(70 * 60 + 2)
    const wave3 = m.events.find((e) => e.type === 'wave' && e.wave === 3)!
    expect(wave3.t - wave2.t).toBeCloseTo(70, 1)
    const radio = m.events.filter((e) => e.type === 'radio').map((e) => e.text)
    expect(radio).toContain(MISSIONS.sakura.waves[1].radio!.text)
  }, 30_000)

  it('caps concurrent foes at the difficulty peak and queues the rest', () => {
    const m = mission('sakura', idle(), 'easy', 0)
    const def = {
      ...MISSIONS.sakura,
      waves: [{ groups: [{ kind: 'tsubute' as const, count: 150, delay: 0, interval: 0.1, burst: 10 }] }]
    }
    const wd = new WaveDirector(def, 60, () => 'north', true)
    for (const f of m.sim.foes) killFoe(m.sim, f, undefined)
    m.step(40)
    wd.start(m.sim, 0)
    let maxLive = 0
    for (let i = 0; i < 600; i++) {
      wd.update(m.sim)
      m.step(1)
      maxLive = Math.max(maxLive, m.sim.foes.filter((f) => !f.dead).length)
    }
    expect(maxLive).toBeLessThanOrEqual(60 + 8)
    expect(wd.queued()).toBeGreaterThan(0)
  })

  it('capture: progress only with an animal inside and no foe inside; contested otherwise', () => {
    const m = mission('harbor', idle(), 'easy', 0)
    m.step(5)
    for (const f of m.sim.foes) killFoe(m.sim, f, undefined)
    const zone = m.sim.props.find((r) => r.kind === 'zone' && r.label === 'A')!
    const p = m.sim.players[0]
    p.p = [zone.p[0], 0, zone.p[2]]
    p.invulnUntil = 1e9
    m.step(60)
    const prog = zone.state!
    expect(prog).toBeGreaterThan(0.03)
    expect(m.world.view().pve!.objective.step).toBe(1)
    // A foe standing inside stops the progress and contests the zone.
    const kill = () => {
      for (const f of m.sim.foes) if (!f.dead) killFoe(m.sim, f, undefined)
    }
    kill()
    m.step(60)
    const f = spawnFoe(m.sim, 'tategami', [zone.p[0] + 1, 0, zone.p[2]])
    f.state = 'idle'
    m.step(30)
    const held = zone.state!
    m.step(30)
    expect(zone.state).toBe(held)
    expect(m.events.some((e) => e.type === 'objective' && e.what === 'contested')).toBe(true)
    for (let i = 0; i < 26; i++) {
      kill()
      m.step(60)
    }
    expect(m.events.some((e) => e.type === 'objective' && e.what === 'captured' && e.label === 'A')).toBe(true)
    expect(m.world.view().pve!.objective.step).toBe(2)
  }, 30_000)

  it('escort: the cart moves only while an animal is near', () => {
    const m = mission('nightraid', idle(), 'easy', 0)
    m.step(5)
    const cart = m.sim.props.find((r) => r.kind === 'cart')!
    const p = m.sim.players[0]
    p.p = [60, 0, -55]
    const s0 = cart.state!
    m.step(120)
    expect(cart.state).toBe(s0)
    p.p = [cart.p[0] + 2, 0, cart.p[2]]
    p.invulnUntil = 1e9
    m.step(120)
    expect(cart.state!).toBeGreaterThan(s0)
  })

  it('destroy: each node destroyed advances the operation; all three win', () => {
    const m = mission('blight', idle(), 'easy', 0)
    m.step(5)
    const nodes = m.sim.props.filter((r) => r.kind === 'node')
    expect(nodes.length).toBe(3)
    for (const n of nodes) {
      damageProp(m.sim, n, { amount: 1e6, kind: 'ranged', side: 0, by: 'h0', at: n.p, from: n.p })
      m.step(2)
    }
    expect(m.events.filter((e) => e.type === 'objective' && e.what === 'destroyed').length).toBe(3)
    expect(m.world.view().phase).toBe('victory')
  })

  it('views carry the mission state', () => {
    const m = mission('maw', idle(), 'easy', 0)
    m.step(120)
    const v = m.world.view()
    expect(v.pve!.mission).toBe('maw')
    expect(v.pve!.boss!.kind).toBe('kuitsukushi')
    expect(v.pve!.boss!.name).toBe('クイツクシ')
    expect(v.variant).toBe('crater')
  })
})
