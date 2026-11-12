/** Static collision, movement and projectiles against boxes (DESIGN §9, §10). */
import { describe, expect, it } from 'vitest'
import { Physics, type Mover } from '../src/sim/physics'
import { spawnShot } from '../src/sim/projectiles'
import type { MapBox, MapDef, V3 } from '../src/sim/types'
import { rig } from './sim-helpers'

const map = (boxes: MapBox[], theme: MapDef['theme'] = 'day'): MapDef => ({
  id: 'range',
  name: 't',
  theme,
  bounds: { min: [-30, -30], max: [30, 30] },
  boxes,
  spawns: [{ team: 'squad', p: [0, 0, -10], yaw: 0 }],
  bases: [],
  foeSpawns: [],
  pads: [],
  anchors: {},
  paths: {},
  decor: []
})
const B = (min: V3, max: V3, kind: MapBox['kind'] = 'wall', extra: Partial<MapBox> = {}): MapBox => ({
  min,
  max,
  kind,
  ...extra
})
const body = (p: V3, v: V3 = [0, 0, 0]): Mover => ({ p: [...p], v: [...v], r: 0.4, h: 1.2, grounded: true })
const run = (ph: Physics, m: Mover, n: number, g = true) => {
  for (let i = 0; i < n; i++) {
    if (g) m.v[1] -= 26 / 60
    ph.move(m, 1 / 60)
  }
}

describe('physics', () => {
  it('slides along walls instead of stopping or penetrating', () => {
    const ph = new Physics(map([B([-10, 0, 5], [10, 4, 6])]))
    const m = body([0, 0, 0])
    for (let i = 0; i < 120; i++) {
      m.v[0] = 4
      m.v[2] = 4
      ph.move(m, 1 / 60)
    }
    expect(m.p[2]).toBeLessThanOrEqual(5 - 0.4 + 1e-3)
    expect(m.p[2]).toBeGreaterThan(4.5)
    expect(m.p[0]).toBeGreaterThan(7)
  })

  it('steps up ledges ≤ 0.45 m but not higher ones', () => {
    const ph = new Physics(map([B([-5, 0, 2], [5, 0.4, 8], 'platform'), B([-5, 0, -8], [5, 0.6, -2], 'platform')]))
    const up = body([0, 0, 0])
    for (let i = 0; i < 60; i++) {
      up.v[2] = 5
      up.v[1] -= 26 / 60
      ph.move(up, 1 / 60)
    }
    expect(up.p[1]).toBeCloseTo(0.4, 3)
    expect(up.p[2]).toBeGreaterThan(3)
    const blocked = body([0, 0, 0])
    for (let i = 0; i < 60; i++) {
      blocked.v[2] = -5
      blocked.v[1] -= 26 / 60
      ph.move(blocked, 1 / 60)
    }
    expect(blocked.p[1]).toBe(0)
    expect(blocked.p[2]).toBeGreaterThanOrEqual(-2 + 0.4 - 1e-3)
  })

  it('lands on box tops, bumps ceilings and keeps y = 0 solid', () => {
    const ph = new Physics(map([B([-2, 0, -2], [2, 3, 2], 'building'), B([5, 2, -2], [9, 2.5, 2], 'platform')]))
    const fall = body([0, 10, 0], [0, -5, 0])
    fall.grounded = false
    run(ph, fall, 120)
    expect(fall.p[1]).toBeCloseTo(3, 3)
    expect(fall.grounded).toBe(true)
    const jump = body([7, 0, 0], [0, 12, 0])
    jump.grounded = false
    let ceiling = false
    for (let i = 0; i < 30; i++) {
      jump.v[1] -= 26 / 60
      if (ph.move(jump, 1 / 60).ceiling) ceiling = true
    }
    expect(ceiling).toBe(true)
    expect(jump.p[1] + jump.h).toBeLessThanOrEqual(2 + 1e-3)
    const ground = body([20, 5, 20], [0, -40, 0])
    ground.grounded = false
    run(ph, ground, 60)
    expect(ground.p[1]).toBe(0)
  })

  it('treats the map bounds as walls', () => {
    const ph = new Physics(map([]))
    const m = body([25, 0, 0])
    for (let i = 0; i < 120; i++) {
      m.v[0] = 10
      ph.move(m, 1 / 60)
    }
    expect(m.p[0]).toBeCloseTo(30 - 0.4, 3)
  })

  it('ignores non-solid boxes', () => {
    const ph = new Physics(map([B([-10, 0, 2], [10, 3, 3], 'ground', { solid: false })]))
    const m = body([0, 0, 0])
    for (let i = 0; i < 60; i++) {
      m.v[2] = 5
      ph.move(m, 1 / 60)
    }
    expect(m.p[2]).toBeGreaterThan(4)
  })

  it('raycasts return point, normal and surface (override or per kind, ground and bounds)', () => {
    const ph = new Physics(
      map([B([-1, 0, 5], [1, 3, 6], 'container'), B([-1, 0, 10], [1, 3, 11], 'wall', { surface: 'crystal' })])
    )
    const h = ph.raycast([0, 1, 0], [0, 0, 1], 100)!
    expect(h.t).toBeCloseTo(5, 6)
    expect(h.point).toEqual([0, 1, 5])
    expect(h.normal).toEqual([0, 0, -1])
    expect(h.surface).toBe('metal')
    const h2 = ph.raycast([0, 1, 8], [0, 0, 1], 100)!
    expect(h2.surface).toBe('crystal')
    const g = ph.raycast([0, 2, 0], [0, -1, 0], 10)!
    expect(g.t).toBeCloseTo(2, 6)
    expect(g.normal).toEqual([0, 1, 0])
    expect(g.surface).toBe('ground')
    const edge = ph.raycast([0, 1, 0], [-1, 0, 0], 100)!
    expect(edge.t).toBeCloseTo(30, 6)
    expect(edge.box).toBe(-2)
    expect(ph.raycast([0, 1, 0], [0, 1, 0], 50)).toBeNull()
    expect(new Physics(map([], 'virtual')).raycast([0, 2, 0], [0, -1, 0], 10)!.surface).toBe('virtual')
  })

  it('projectiles at 400 m/s do not tunnel through a 10 cm wall', () => {
    const r = rig({ r: ['bee'], map: map([B([-5, 0, 20], [5, 4, 20.1])]) })
    r.step(1)
    for (let i = 0; i < 20; i++) {
      spawnShot(r.sim, {
        kind: 'owl',
        side: 0,
        p: [i * 0.37 - 3, 1, -5 + (i % 7) * 0.13],
        v: [0, 0, 400],
        dmg: 10,
        range: 200,
        life: 1
      })
    }
    r.step(30)
    const impacts = r.of('impact')
    expect(impacts.length).toBe(20)
    for (const e of impacts) expect(Math.abs(e.at[2] - 20)).toBeLessThan(0.15)
    expect(r.sim.shots.length).toBe(0)
  })

  it('a player capsule walks around in a real step with wall sliding', () => {
    const r = rig({ r: ['bee'], map: map([B([-10, 0, -5], [10, 4, -4])]) })
    r.input().mz = 1
    r.input().mx = 0.5
    r.input().yaw = 0
    r.step(120)
    expect(r.player().p[2]).toBeLessThanOrEqual(-5 - 0.38 + 1e-3)
    expect(r.player().p[0]).toBeLessThan(-4)
  })
})
