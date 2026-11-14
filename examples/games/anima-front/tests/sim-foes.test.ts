import { describe, expect, it } from 'vitest'
import { MAW_CLOSED, MAW_PHASE_GUARD } from '../src/sim/constants'
import { FOES, type FoeKind } from '../src/data/enemies'
import { damageFoe } from '../src/sim/combat'
import { goutetsuLegs } from '../src/sim/foes/bosses'
import { spawnFoe } from '../src/sim/foes/index'
import { eventFoe, type Foe, type Sim } from '../src/sim/state'
import type { MapDef, PlayerConfig, SimEvent } from '../src/sim/types'
import type { Vec } from '../src/sim/vec'
import { createWorldOnMap, simOf } from '../src/sim/world'
import type { World } from '../src/sim/api'
import { cfg, flatMap, playerCfg, sakuraMap } from './sim-maps'

function setup(map: MapDef = flatMap(), players: PlayerConfig[] = [playerCfg('a')], seed = 1) {
  const w = createWorldOnMap(
    cfg({ mode: 'training', map: map.id, seed, players, training: { infiniteAnima: true } }),
    map
  )
  const sim = simOf(w)
  for (const p of sim.players) p.infinite = true
  // Training targets/dummies of the mode are not part of these tests.
  sim.foes = []
  return { w, sim }
}

function run(w: World, ticks: number, log?: SimEvent[]) {
  const none = new Map()
  for (let i = 0; i < ticks; i++) {
    w.step(none)
    if (log && i % 30 === 29) log.push(...w.view().events)
  }
  if (log) log.push(...w.view().events)
}

const ready = (f: Foe) => {
  f.state = 'idle'
  f.st = 0
}

describe('foe telegraphs', () => {
  const cases: { kind: FoeKind; at: Vec }[] = [
    { kind: 'tsubute', at: [0, 0, -2] },
    { kind: 'harigane', at: [0, 0, 8] },
    { kind: 'oagos', at: [0, 0, 2] },
    { kind: 'kagerou', at: [0, 0, 0] },
    { kind: 'mitsume', at: [0, 0, 6] },
    { kind: 'ashinaga', at: [0, 0, 16] },
    { kind: 'korogashi', at: [0, 0, -2] },
    { kind: 'tategami', at: [0, 0, 0] },
    { kind: 'kuitsukushi', at: [0, 0, 6] },
    { kind: 'goutetsu', at: [0, 0, 8] }
  ]
  for (const c of cases) {
    it(`${c.kind} attacks only after its wind-up`, () => {
      const { w, sim } = setup()
      const f = spawnFoe(sim, c.kind, c.at)
      const log: SimEvent[] = []
      run(w, 60 * 14, log)
      const mine = log.filter((e) => eventFoe(e) === f.id)
      const attacks = mine.filter((e) => e.type === 'foeAttack')
      expect(attacks.length).toBeGreaterThan(0)
      for (const a of attacks) {
        if (a.type !== 'foeAttack') continue
        const wind = [...mine].reverse().find((e) => e.type === 'foeWindup' && e.attack === a.attack && e.id < a.id)
        expect(wind, `${c.kind} ${a.attack} without wind-up`).toBeTruthy()
        const def = FOES[c.kind].attacks.find((x) => x.id === a.attack)!
        expect(a.t - wind!.t).toBeGreaterThanOrEqual(def.windup - 2e-3)
        if (def.windup < 0.35) expect(a.attack).toBe('bite')
      }
    }, 20000)
  }
})

describe('crowd flow field', () => {
  it('leads a ツブテ around a wall to the player behind it', () => {
    const map = flatMap()
    map.boxes.push({ min: [-20, 0, 0], max: [20, 4, 1], kind: 'wall' })
    const { w, sim } = setup(map)
    const p = sim.players[0]
    const f = spawnFoe(sim, 'tsubute', [0, 0, 10])
    let best = Infinity
    let t = 0
    for (; t < 60 * 15 && best > 2.5; t++) {
      w.step(new Map())
      best = Math.min(best, Math.hypot(f.p[0] - p.p[0], f.p[2] - p.p[2]))
    }
    expect(best).toBeLessThanOrEqual(2.5)
    expect(t / 60).toBeLessThan(15)
  }, 20000)
})

describe('damage modifiers', () => {
  it('オオアゴ: front ×0.4, back ×2 (weak)', () => {
    const { sim } = setup()
    const f = spawnFoe(sim, 'oagos', [0, 0, 20])
    ready(f)
    f.yaw = 0
    const hp0 = f.hp
    damageFoe(sim, f, { amount: 50, kind: 'ranged', side: 0, by: 'a', at: [0, 1, 21], from: [0, 1, 40] })
    expect(hp0 - f.hp).toBeCloseTo(20, 5)
    const hp1 = f.hp
    damageFoe(sim, f, { amount: 50, kind: 'ranged', side: 0, by: 'a', at: [0, 1, 19], from: [0, 1, 0] })
    expect(hp1 - f.hp).toBeCloseTo(100, 5)
  })

  it('タテガミ dome blocks shots from outside but not from inside', () => {
    const { w, sim } = setup()
    const g = spawnFoe(sim, 'tategami', [0, 0, 20])
    run(w, 120)
    expect(g.mem.dome).toBe(1)
    const m = spawnFoe(sim, 'mitsume', [g.p[0] + 1, 4, g.p[2]])
    ready(m)
    m.shielded = true
    const hp0 = m.hp
    expect(
      damageFoe(sim, m, { amount: 10, kind: 'ranged', side: 0, by: 'a', at: m.p, from: [g.p[0], 1, g.p[2] - 30] })
    ).toBe(0)
    expect(m.hp).toBe(hp0)
    expect(
      damageFoe(sim, m, { amount: 10, kind: 'ranged', side: 0, by: 'a', at: m.p, from: [g.p[0] - 2, 1, g.p[2]] })
    ).toBeGreaterThan(0)
  })

  it('コロガシ chain: a destroyed one sets off its neighbours', () => {
    const { w, sim } = setup()
    const ks = [0, 1.5, 3].map((x) => spawnFoe(sim, 'korogashi', [x, 0, 25]))
    ks.forEach(ready)
    damageFoe(sim, ks[0], { amount: 999, kind: 'ranged', side: 0, by: 'a', at: ks[0].p, from: [0, 1, 0] })
    expect(ks.every((k) => k.dead)).toBe(true)
    const ev = w.view().events
    expect(ev.filter((e) => e.type === 'blast' && e.item === 'explode').length).toBe(3)
  })
})

describe('bosses', () => {
  it('ゴウテツ: two broken legs → kneels with the core exposed → legs come back whole', () => {
    const { w, sim } = setup()
    const f = spawnFoe(sim, 'goutetsu', [0, 0, 30])
    ready(f)
    w.step(new Map())
    expect(f.parts).toHaveLength(4)
    const legMax = f.parts![0]
    const hp0 = f.hp
    for (const i of [0, 1]) {
      const leg = goutetsuLegs(f)[i]
      damageFoe(sim, f, {
        amount: legMax + 1,
        kind: 'ranged',
        side: 0,
        by: 'a',
        at: [leg[0], 1, leg[2]],
        from: [0, 1, 0]
      })
    }
    expect(f.hp).toBe(hp0)
    expect(f.parts![0]).toBe(0)
    expect(f.state).toBe('stagger')
    damageFoe(sim, f, {
      amount: 100,
      kind: 'ranged',
      side: 0,
      by: 'a',
      at: [f.p[0], f.p[1] + 6, f.p[2] - 4],
      from: [0, 1, 0]
    })
    expect(hp0 - f.hp).toBeCloseTo(250, 3)
    const ev = w.view().events
    expect(ev.some((e) => e.type === 'hit' && e.weak)).toBe(true)
    expect(ev.filter((e) => e.type === 'bossPart').length).toBe(2)
    run(w, 60 * 8 + 10)
    expect(f.state).not.toBe('stagger')
    expect(f.parts![0]).toBeCloseTo(legMax, 3)
    // Armoured body away from legs.
    const hp1 = f.hp
    damageFoe(sim, f, {
      amount: 100,
      kind: 'ranged',
      side: 0,
      by: 'a',
      at: [f.p[0], f.p[1] + 10, f.p[2]],
      from: [0, 1, 0]
    })
    expect(hp1 - f.hp).toBeCloseTo(35, 3)
  }, 20000)

  it('クイツクシ: open core takes ×2, phases at 66 % / 33 % with a hardened pause between', () => {
    const { w, sim } = setup()
    const f = spawnFoe(sim, 'kuitsukushi', [0, 0, 30])
    ready(f)
    w.step(new Map())
    expect(f.parts).toEqual([0, 1])
    const top: Vec = [f.p[0], f.p[1] + 8, f.p[2]]
    let hp = f.hp
    damageFoe(sim, f, { amount: 10, kind: 'ranged', side: 0, by: 'a', at: top, from: [0, 1, 0] })
    // Closed core: the body is tough (MAW_CLOSED).
    expect(hp - f.hp).toBeCloseTo(10 * MAW_CLOSED, 5)
    f.parts![0] = 1
    hp = f.hp
    damageFoe(sim, f, { amount: 10, kind: 'ranged', side: 0, by: 'a', at: top, from: [0, 1, 0] })
    expect(hp - f.hp).toBeCloseTo(10 * FOES.kuitsukushi.weak!, 5)
    f.parts![0] = 0
    w.view()
    damageFoe(sim, f, {
      amount: (f.maxHp * 0.36) / MAW_CLOSED,
      kind: 'ranged',
      side: 0,
      by: 'a',
      at: [0, 1, 26],
      from: [0, 1, 0]
    })
    w.step(new Map())
    // One hit cannot skip a phase: it stops just past the 66 % line.
    expect(f.hp / f.maxHp).toBeGreaterThan(0.65)
    // Phase change: no damage while the maw is shut (MAW_PHASE_GUARD).
    hp = f.hp
    damageFoe(sim, f, { amount: 500, kind: 'ranged', side: 0, by: 'a', at: [0, 1, 26], from: [0, 1, 0] })
    expect(f.hp).toBe(hp)
    run(w, Math.ceil(MAW_PHASE_GUARD * 60) + 2)
    damageFoe(sim, f, {
      amount: (f.maxHp * 0.36) / MAW_CLOSED,
      kind: 'ranged',
      side: 0,
      by: 'a',
      at: [0, 1, 26],
      from: [0, 1, 0]
    })
    w.step(new Map())
    const phases = w
      .view()
      .events.filter((e) => e.type === 'bossPhase')
      .map((e) => (e.type === 'bossPhase' ? e.phase : 0))
    expect(phases).toEqual([2, 3])
    expect(f.parts![1]).toBe(3)
    // The core opens on its own within ~8 s.
    const log: SimEvent[] = []
    run(w, 60 * 9, log)
    expect(log.some((e) => e.type === 'bossPart' && eventFoe(e) === f.id)).toBe(true)
  }, 20000)
})

describe('クロヅメ', () => {
  it('avatars are stepped and mirrored by their foe', () => {
    const { w, sim } = setup()
    const f = spawnFoe(sim, 'kurozume', [0, 0, 15])
    run(w, 180)
    expect(f.avatar).toBeTruthy()
    expect(f.p).toEqual(f.avatar!.p)
    expect(f.hp).toBeGreaterThan(0)
  })
})

function crowd(sim: Sim) {
  const kinds: FoeKind[] = ['tsubute', 'tsubute', 'tsubute', 'harigane', 'kagerou', 'mitsume', 'korogashi', 'ashinaga']
  for (let i = 0; i < 120; i++) {
    const k = kinds[i % kinds.length]
    spawnFoe(sim, k, [-40 + (i % 20) * 4, 0, 30 + Math.floor(i / 20) * 4])
  }
  spawnFoe(sim, 'oagos', [0, 0, 50])
  spawnFoe(sim, 'tategami', [10, 0, 50])
}

describe('determinism and performance', () => {
  it('same seed → same foe positions', () => {
    const pos = () => {
      const { w, sim } = setup(sakuraMap(), [playerCfg('a')], 7)
      crowd(sim)
      run(w, 240)
      return JSON.stringify(sim.foes.map((f) => [f.id, f.state, f.p.map((x) => Math.round(x * 1000))]))
    }
    expect(pos()).toBe(pos())
  }, 30000)

  it('120 foes + 12 players stay within the step budget', () => {
    const players = Array.from({ length: 12 }, (_, i) => playerCfg(`p${i}`, { preset: 'gunner' }))
    const { w, sim } = setup(sakuraMap(), players)
    crowd(sim)
    run(w, 60)
    const t0 = performance.now()
    const n = 600
    run(w, n)
    const ms = (performance.now() - t0) / n
    console.log(`foes step: ${ms.toFixed(3)} ms/step with ${sim.foes.length} foes`)
    expect(ms).toBeLessThan(10)
  }, 60000)
})
