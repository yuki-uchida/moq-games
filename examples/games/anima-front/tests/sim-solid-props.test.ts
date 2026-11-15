/** The 灯台 and the 巣核 are solid for movement (DESIGN §9): physics, foes, bots and the guest's prediction. */
import { describe, expect, it } from 'vitest'
import { makeLoadout } from '../src/data/loadout'
import { brainOf } from '../src/sim/bots/index'
import { destroyProp } from '../src/sim/combat'
import { spawnFoe } from '../src/sim/foes/index'
import { Physics, type Mover } from '../src/sim/physics'
import { createPredictor } from '../src/sim/predictor'
import { propSolids, type SolidCyl } from '../src/sim/prop-solids'
import { addProp } from '../src/sim/props'
import type { Sim } from '../src/sim/state'
import { neutralPlayerInput, type MapDef, type PlayerInput } from '../src/sim/types'
import { createWorldOnMap, simOf } from '../src/sim/world'
import { blightMap, cfg, flatMap, playerCfg, sakuraMap } from './sim-maps'

const none = new Map()
const FOOT = 2.1
const POD = 1.6
const axis = (p: readonly number[], c: readonly number[]) => Math.hypot(p[0] - c[0], p[2] - c[2])

/** Physics on a flat map with a 灯台 (prop id 1) at the origin. */
function lighthousePhysics(): Physics {
  const ph = new Physics(flatMap())
  ph.solids = propSolids({ id: 1, kind: 'lighthouse', p: [0, 0, 0] }, [] as SolidCyl[])
  return ph
}
const body = (p: number[], v: number[] = [0, 0, 0]): Mover => ({ p: [...p], v: [...v], r: 0.4, h: 1.2, grounded: true })
function walk(ph: Physics, m: Mover, vx: number, vz: number, n: number, onStep?: (m: Mover) => void) {
  for (let i = 0; i < n; i++) {
    m.v[0] = vx
    m.v[2] = vz
    m.v[1] -= 26 / 60
    ph.move(m, 1 / 60)
    onStep?.(m)
  }
}

describe('solid props in the physics', () => {
  it('walking straight into the lighthouse stops at its foot', () => {
    const ph = lighthousePhysics()
    const m = body([0, 0, -8])
    let closest = Infinity
    walk(ph, m, 0, 6, 120, (b) => (closest = Math.min(closest, axis(b.p, [0, 0, 0]))))
    expect(closest).toBeGreaterThanOrEqual(FOOT + 0.4 - 1e-3)
    expect(m.p[2]).toBeCloseTo(-(FOOT + 0.4), 2)
    expect(m.p[1]).toBe(0)
  })

  it('walking into it off-centre slides round it smoothly and comes out the far side', () => {
    const ph = lighthousePhysics()
    const m = body([0.6, 0, -8])
    let closest = Infinity
    let maxStep = 0
    let last = [...m.p]
    walk(ph, m, 0, 6, 240, (b) => {
      closest = Math.min(closest, axis(b.p, [0, 0, 0]))
      maxStep = Math.max(maxStep, axis(b.p, last))
      last = [...b.p]
    })
    expect(closest).toBeGreaterThanOrEqual(FOOT + 0.4 - 1e-3)
    // never faster than the walk (no pops), and well past the lighthouse
    expect(maxStep).toBeLessThanOrEqual(6 / 60 + 1e-3)
    expect(m.p[2]).toBeGreaterThan(5)
    expect(m.p[0]).toBeGreaterThan(0.6)
  })

  it('a body inside a solid (on the axis or off it) is pushed out on its next move', () => {
    const ph = lighthousePhysics()
    for (const p of [
      [0, 0, 0],
      [0.5, 0, -0.3],
      [1.9, 0, 0.4]
    ]) {
      const m = body(p)
      walk(ph, m, 0, 0, 1)
      expect(axis(m.p, [0, 0, 0])).toBeGreaterThanOrEqual(FOOT + 0.4 - 1e-3)
      expect(axis(m.p, [0, 0, 0])).toBeLessThan(FOOT + 0.4 + 0.01)
    }
  })

  it('the foot is too high to step on but can be stood on; the shaft still blocks there', () => {
    const ph = lighthousePhysics()
    expect(ph.groundHeight(1.8, 0, 0.3, 1)).toBeCloseTo(0.8, 5)
    const m = body([1.8, 0.8, 0])
    walk(ph, m, -3, 0, 60)
    expect(m.p[1]).toBeCloseTo(0.8, 5)
    expect(axis(m.p, [0, 0, 0])).toBeGreaterThanOrEqual(1.5 + 0.4 - 1e-3)
    expect(ph.overlaps([0, 0, -2.52], 0.4, 1.2)).toBe(false)
    expect(ph.overlaps([0, 0, -2.45], 0.4, 1.2)).toBe(true)
  })
})

function pve(mission: 'sakura' | 'blight', map: MapDef) {
  const world = createWorldOnMap(
    cfg({
      mode: 'pve',
      map: map.id,
      mission,
      difficulty: 'normal',
      seed: 3,
      countdown: 0,
      players: [playerCfg('h0', { loadout: makeLoadout(['bee'], [], []) })]
    }),
    map
  )
  const inputs = new Map<string, PlayerInput>([['h0', neutralPlayerInput()]])
  return { world, sim: simOf(world), inputs }
}

describe('solid props in missions', () => {
  it('the lighthouse is solid in the defend mission and squad members spawned in it are pushed out', () => {
    const { world, sim, inputs } = pve('sakura', sakuraMap())
    world.step(inputs)
    const lh = sim.props.find((r) => r.kind === 'lighthouse')!
    expect(sim.phys.solids.filter((c) => c.tag === lh.id).map((c) => c.r)).toEqual([1.5, FOOT])
    for (const p of sim.players) expect(axis(p.p, lh.p)).toBeGreaterThanOrEqual(FOOT + p.r - 1e-3)
  })

  it('foes still reach the lighthouse and damage it at its surface', { timeout: 30_000 }, () => {
    const { world, sim, inputs } = pve('sakura', sakuraMap())
    world.step(inputs)
    const lh = sim.props.find((r) => r.kind === 'lighthouse')!
    // Nobody around to fight: the idle animal waits far away, untouchable.
    const me = sim.players[0]
    me.p = [45, 0, -50]
    me.invulnUntil = Infinity
    sim.foes.length = 0
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      spawnFoe(sim, 'tsubute', [lh.p[0] + Math.sin(a) * 12, 0, lh.p[2] + Math.cos(a) * 12])
    }
    spawnFoe(sim, 'oagos', [lh.p[0] + 6, 0, lh.p[2] + 14])
    const hp0 = lh.hp!
    let inside = 0
    for (let t = 0; t < 12 * 60; t++) {
      world.step(inputs)
      for (const f of sim.foes) if (!f.dead && !f.def.flying && axis(f.p, lh.p) < FOOT + f.r - 1e-3) inside++
    }
    expect(inside).toBe(0)
    expect(lh.hp!).toBeLessThan(hp0 - 50)
  })

  it('foes spawned at a node never appear inside it; a destroyed node stops colliding', { timeout: 30_000 }, () => {
    const map = blightMap()
    // A spawn point right on node1 (its jitter would drop foes into the pod).
    map.foeSpawns = map.foeSpawns.map((s) => (s.id === 'n1' ? { ...s, p: [...map.anchors.node1] as typeof s.p } : s))
    const { world, sim, inputs } = pve('blight', map)
    world.step(inputs)
    const node = sim.props.find((r) => r.kind === 'node' && r.label === '1')!
    expect(sim.phys.solids.some((c) => c.tag === node.id && c.r === POD)).toBe(true)
    sim.players[0].invulnUntil = Infinity
    const seen = new Set<number>()
    let near = 0
    for (let t = 0; t < 22 * 60; t++) {
      world.step(inputs)
      for (const f of sim.foes) {
        if (seen.has(f.id)) continue
        seen.add(f.id)
        if (f.def.flying || axis(f.p, node.p) > 4) continue
        near++
        expect(axis(f.p, node.p)).toBeGreaterThanOrEqual(POD + f.r)
      }
    }
    expect(near).toBeGreaterThan(0)
    destroyProp(sim, node, undefined)
    world.step(inputs)
    expect(sim.phys.solids.some((c) => c.tag === node.id)).toBe(false)
    expect(sim.phys.overlaps([node.p[0], node.p[1], node.p[2]], 0.4, 1.2)).toBe(false)
  })
})

/** A training world on the flat map with a 灯台 at the origin and one bot. */
function botByLighthouse(at: number[]) {
  const w = createWorldOnMap(
    cfg({ mode: 'training', map: 'range', players: [playerCfg('a', { bot: 0.8 })], countdown: 0 }),
    flatMap()
  )
  const sim: Sim = simOf(w)
  addProp(sim, 'lighthouse', [0, 0, 0], 0, 0, { hp: 1000, r: 1.6, data: { h: 7 } })
  const p = sim.players[0]
  p.p = [...at]
  return { w, sim, p }
}

describe('bots and solid props', () => {
  it('a bot heading for a point straight behind the lighthouse walks round it', { timeout: 30_000 }, () => {
    const { w, sim, p } = botByLighthouse([0, 0, -10])
    brainOf(sim, p).order = [0, 0, 10]
    let t = 0
    let closest = Infinity
    while (t < 60 * 15 && Math.hypot(p.p[0], p.p[2] - 10) > 1.5) {
      w.step(none)
      closest = Math.min(closest, axis(p.p, [0, 0, 0]))
      t++
    }
    expect(Math.hypot(p.p[0], p.p[2] - 10)).toBeLessThan(1.5)
    expect(t / 60).toBeLessThan(8)
    expect(closest).toBeGreaterThanOrEqual(FOOT + p.r - 1e-3)
  })

  it('a bot ordered to the lighthouse itself stops beside it instead of pressing into it', { timeout: 30_000 }, () => {
    const { w, sim, p } = botByLighthouse([0, 0, -12])
    brainOf(sim, p).order = [0, 0, 0]
    for (let t = 0; t < 6 * 60; t++) w.step(none)
    const d0 = axis(p.p, [0, 0, 0])
    expect(d0).toBeLessThan(FOOT + p.r + 1.2)
    const jumps = p.input.presses.jump
    for (let t = 0; t < 3 * 60; t++) w.step(none)
    expect(p.input.presses.jump).toBe(jumps)
    expect(Math.hypot(p.v[0], p.v[2])).toBeLessThan(0.5)
  })
})

describe('guest prediction against solid props', () => {
  it('a guest walking into the lighthouse predicts the host stop (no correction)', () => {
    const map = sakuraMap()
    const { world, sim, inputs } = pve('sakura', map)
    world.step(inputs)
    const lh = sim.props.find((r) => r.kind === 'lighthouse')!
    const me = sim.players[0]
    me.p = [lh.p[0] + 0.5, 0, lh.p[2] - 9]
    me.v = [0, 0, 0]
    me.yaw = 0
    me.invulnUntil = Infinity
    world.step(inputs)
    const input = inputs.get('h0')!
    input.yaw = 0
    input.mz = 1
    const predict = (withProps: boolean) => {
      const v = world.view()
      const own = v.players.find((p) => p.id === 'h0')!
      const pred = createPredictor(map, playerCfg('h0', { loadout: makeLoadout(['bee'], [], []) }))
      pred.reset(own)
      pred.sync(own, withProps ? v.props : [])
      return pred
    }
    const pred = predict(true)
    const blind = predict(false)
    let err = 0
    let blindErr = 0
    for (let t = 0; t < 150; t++) {
      world.step(inputs)
      pred.step(input)
      blind.step(input)
      err = Math.max(err, axis(pred.body.p, me.p), Math.abs(pred.body.p[1] - me.p[1]))
      blindErr = Math.max(blindErr, axis(blind.body.p, me.p))
    }
    expect(axis(me.p, lh.p)).toBeGreaterThanOrEqual(FOOT + me.r - 1e-3)
    expect(err).toBeLessThan(0.02)
    // without the solids the prediction walks into the lighthouse
    expect(blindErr).toBeGreaterThan(1)
  })
})
