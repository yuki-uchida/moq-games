/** The 灯台 and the 巣核 block shots, beams, the ヤモリフック and AI sight lines for every side (DESIGN §9, §10). */
import { describe, expect, it } from 'vitest'
import { ITEMS } from '../src/data/items'
import { destroyProp } from '../src/sim/combat'
import { spawnFoe } from '../src/sim/foes/index'
import { spawnShot } from '../src/sim/projectiles'
import { addProp } from '../src/sim/props'
import { FOE_SIDE, type Foe, type Prop } from '../src/sim/state'
import { createWorldOnMap, simOf } from '../src/sim/world'
import { aimAt, rig, type Rig } from './sim-helpers'
import { cfg, flatMap, playerCfg } from './sim-maps'

const axis = (p: readonly number[], c: readonly number[]) => Math.hypot(p[0] - c[0], p[2] - c[2])
const lighthouse = (r: Rig): Prop => addProp(r.sim, 'lighthouse', [0, 0, 0], 0, 0, { hp: 1000, r: 1.6, data: { h: 7 } })
const node = (r: Rig, at: number[] = [0, 0, 0]): Prop =>
  addProp(r.sim, 'node', at, 0, FOE_SIDE, { hp: 1000, r: 2.2, state: 1, data: { h: 4 } })
/** A foe that stands still (training dummy behaviour). */
const dummy = (r: Rig, at: number[]): Foe => {
  const f = spawnFoe(r.sim, 'oagos', at, { passive: true })
  f.hp = f.maxHp = 5000
  return f
}

describe('shots against the solid props', () => {
  it('a player shot at a foe behind the lighthouse stops on it: neither the foe nor the lighthouse is hurt', () => {
    const r = rig({ r: ['bee'] })
    r.step(2)
    const lh = lighthouse(r)
    const f = dummy(r, [0, 0, 7])
    r.player().p = [0, 0, -9]
    aimAt(r, [0, 1.4, 7])
    const impacts0 = r.of('impact').length
    r.press('R', 40)
    r.step(30)
    expect(r.player().stats.shots).toBeGreaterThan(3)
    expect(f.hp).toBe(5000)
    expect(lh.hp).toBe(1000)
    const impacts = r.of('impact').slice(impacts0)
    expect(impacts.length).toBeGreaterThan(0)
    for (const e of impacts) expect(axis(e.at, lh.p)).toBeLessThan(2.2)
  })

  it('a foe shot at the lighthouse damages it, low (the sandbag foot) and high (the shaft)', () => {
    for (const y of [0.4, 3, 8]) {
      const r = rig({ r: ['bee'] })
      r.step(2)
      const lh = lighthouse(r)
      r.player().p = [30, 0, 30]
      spawnShot(r.sim, {
        kind: 'acid',
        foeAttack: 'acid',
        side: FOE_SIDE,
        p: [0, y, 12],
        v: [0, 0, -40],
        dmg: 14,
        range: 50,
        r: 0.1
      })
      r.step(30)
      expect(lh.hp!, `at y=${y}`).toBeLessThan(1000)
    }
  })

  it('a player shot at a node from outside still damages it; a shot at the lighthouse never does', () => {
    const r = rig({ r: ['bee'] })
    r.step(2)
    const n = node(r, [0, 0, 8])
    r.player().p = [0, 0, -4]
    aimAt(r, [0, 1.5, 8])
    r.press('R', 20)
    r.step(30)
    expect(n.hp!).toBeLessThan(1000)
    const r2 = rig({ r: ['bee'] })
    r2.step(2)
    const lh = lighthouse(r2)
    r2.player().p = [0, 0, -8]
    aimAt(r2, [0, 2, 0])
    r2.press('R', 40)
    expect(r2.player().stats.shots).toBeGreaterThan(0)
    expect(lh.hp).toBe(1000)
  })

  it('a beam stops on the lighthouse instead of reaching the foe behind it', () => {
    const r = rig({ r: ['eel'] })
    r.step(2)
    lighthouse(r)
    const f = dummy(r, [0, 0, 6])
    r.player().p = [0, 0, -8]
    aimAt(r, [0, 1.4, 6])
    r.press('R', 60)
    expect(f.hp).toBe(5000)
  })
})

describe('sight lines through the solid props', () => {
  it('phys.clear is blocked by the lighthouse and a living node, but not towards the prop itself', () => {
    const r = rig({ r: ['bee'] })
    r.step(2)
    lighthouse(r)
    const n = node(r, [20, 0, 0])
    const ph = r.sim.phys
    expect(ph.clear([0, 1.5, -10], [0, 1.5, 10])).toBe(false)
    expect(ph.clear([0, 1.5, -10], [0, 3.5, 0])).toBe(true) // the lighthouse's centre (a foe aiming at it)
    expect(ph.clear([5, 1.5, -10], [5, 1.5, 10])).toBe(true)
    expect(ph.clear([20, 1.5, -10], [20, 1.5, 10])).toBe(false)
    expect(ph.clear([20, 1.5, -10], [20, 2, 0])).toBe(true)
    destroyProp(r.sim, n, undefined)
    r.step(1)
    expect(ph.clear([20, 1.5, -10], [20, 1.5, 10])).toBe(true)
  })

  /** A bot (pinned at z −6) and a foe (pinned at z +6) facing each other across the origin for 6 s. */
  const standoff = (withLighthouse: boolean) => {
    const w = createWorldOnMap(
      cfg({ mode: 'training', map: 'range', players: [playerCfg('a', { preset: 'gunner', bot: 1 })], countdown: 0 }),
      flatMap()
    )
    const sim = simOf(w)
    if (withLighthouse) addProp(sim, 'lighthouse', [0, 0, 0], 0, 0, { hp: 1000, r: 1.6, data: { h: 7 } })
    const p = sim.players[0]
    p.invulnUntil = Infinity
    const f = spawnFoe(sim, 'harigane', [0, 0, 8])
    f.hp = f.maxHp = 1e6
    let botShots = 0
    let foeSpits = 0
    for (let t = 0; t < 6 * 60; t++) {
      p.p = [0, 0, -8]
      p.v = [0, 0, 0]
      f.p = [0, 0, 8]
      f.v = [0, 0, 0]
      w.step(new Map())
      for (const e of w.view().events) {
        if (e.type === 'fire' && e.who === 'a') botShots++
        if (e.type === 'foeWindup' && e.foe === f.id) foeSpits++
      }
    }
    return { botShots, foeSpits }
  }

  it('a bot and a ranged foe do not shoot at each other through the lighthouse', { timeout: 30_000 }, () => {
    // in the open they do
    const open = standoff(false)
    expect(open.botShots).toBeGreaterThan(0)
    expect(open.foeSpits).toBeGreaterThan(0)
    const hidden = standoff(true)
    expect(hidden.botShots).toBe(0)
    expect(hidden.foeSpits).toBe(0)
  })
})

describe('ヤモリフック on the solid props', () => {
  const gecko = () => {
    const r = rig({ r: ['bee'], l: ['gecko'] })
    r.step(2)
    r.player().p = [0, 0, -15]
    r.player().v = [0, 0, 0]
    r.step(2)
    return r
  }

  it('hooks the lighthouse at its surface, spends once and pulls the player to it', () => {
    for (const y of [0.4, 4]) {
      const r = gecko()
      const lh = lighthouse(r)
      aimAt(r, [0, y, 0])
      const a0 = r.player().anima
      r.press('L')
      const hooks = r.of('hook')
      expect(hooks.length).toBe(1)
      const to = hooks[0].to
      // at the visible surface (shaft r 1.5 / foot r 2.1, plus the 0.4 m stand-off), not behind the axis
      expect(to[2]).toBeLessThan(0)
      expect(axis(to, lh.p)).toBeLessThan(2.1 + 0.45)
      expect(axis(to, lh.p)).toBeGreaterThan(1.5)
      expect(a0 - r.player().anima).toBeCloseTo(ITEMS.gecko.cost!, 1)
      r.step(90)
      const d = axis(r.player().p, lh.p)
      expect(d, `y=${y}`).toBeLessThan(3.2)
      expect(d).toBeGreaterThanOrEqual(1.5 + r.player().r - 1e-3)
    }
  })

  it('hooks a living node at its pod; a destroyed node no longer catches the hook', () => {
    const r = gecko()
    const n = node(r)
    aimAt(r, [0, 1.5, 0])
    r.press('L')
    const to = r.of('hook')[0].to
    expect(to[2]).toBeLessThan(-1.5)
    expect(axis(to, n.p)).toBeLessThan(1.6 + 0.45)
    r.step(90)
    expect(axis(r.player().p, n.p)).toBeLessThan(3)

    const r2 = gecko()
    const n2 = node(r2)
    destroyProp(r2.sim, n2, undefined)
    r2.step(1)
    aimAt(r2, [0, 1.5, 0])
    r2.press('L')
    const h = r2.of('hook')[0]
    expect(h.to[2] > 0 || h.done === true).toBe(true)
  })
})
