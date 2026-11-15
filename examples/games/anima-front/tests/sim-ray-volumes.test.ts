/** Ray vs the vertical cylinder hit volume (caps and sides), shots and beams from above, and shots from inside a volume. */
import { describe, expect, it } from 'vitest'
import { rayCylinder } from '../src/sim/physics'
import { shotsTick, spawnShot } from '../src/sim/projectiles'
import { addProp } from '../src/sim/props'
import { FOE_SIDE } from '../src/sim/state'
import { aimAt, rig, target } from './sim-helpers'

// A cylinder at the origin: radius 1, y from 0 to 1.5.
const ray = (o: number[], d: number[], maxT = 10) => rayCylinder(o, d, maxT, 0, 0, 1, 0, 1.5)

describe('rayCylinder', () => {
  it('enters through the top cap even when the (infinite) side entry is above it', () => {
    // from (-2, 3) heading (1, -1): the side is first crossed at y = 2 (above the top); the cap at y 1.5 is hit at t = 1.5
    expect(ray([-2, 3, 0], [1, -1, 0], 4)).toBeCloseTo(1.5)
  })

  it('enters through the bottom cap from below', () => {
    expect(ray([0.2, -2, 0], [0, 1, 0])).toBeCloseTo(2)
    expect(ray([-2, -3, 0], [1, 2, 0], 10)).toBeCloseTo(1.5) // x = -0.5 at y = 0
  })

  it('straight down onto the top cap and a ray that is too short', () => {
    expect(ray([0.5, 5, 0], [0, -1, 0])).toBeCloseTo(3.5)
    expect(ray([0.5, 5, 0], [0, -1, 0], 3)).toBe(-1)
  })

  it('hits the side within the height range, and misses above or below it', () => {
    expect(ray([-5, 1, 0], [1, 0, 0])).toBeCloseTo(4)
    expect(ray([-5, 2, 0], [1, 0, 0])).toBe(-1)
    expect(ray([-5, -0.5, 0], [1, 0, 0])).toBe(-1)
  })

  it('grazes the rim: touching counts, just outside misses', () => {
    expect(ray([-5, 1, 1], [1, 0, 0])).toBeCloseTo(5)
    expect(ray([-5, 1, 1.01], [1, 0, 0])).toBe(-1)
    // down onto the rim of the top cap
    expect(ray([1, 5, 0], [0, -1, 0])).toBeCloseTo(3.5)
    expect(ray([1.01, 5, 0], [0, -1, 0])).toBe(-1)
  })

  it('a ray that starts inside the volume reports 0', () => {
    expect(ray([0.2, 1, 0.2], [1, 0, 0])).toBe(0)
    expect(ray([0.2, 1, 0.2], [0, -1, 0])).toBe(0)
  })

  it('a ray above and going up, or beside and parallel to the axis, misses', () => {
    expect(ray([0, 5, 0], [0, 1, 0])).toBe(-1)
    expect(ray([3, 0.5, 0], [0, 1, 0])).toBe(-1)
  })
})

describe('shots and beams from a high place', () => {
  for (const height of [0, 6]) {
    it(`an eel beam from ${height} m up damages the target`, () => {
      const r = rig({ r: ['eel'], config: { training: { tutorial: false, infiniteAnima: true } } })
      r.step(2)
      const p = r.player()
      p.p = [0, height, -3]
      p.v = [0, 0, 0]
      const t = target(r, [0, 0, 0])
      aimAt(r, [0, 0.9, 0])
      const before = t.hp ?? 0
      r.press('R', 1)
      expect(t.hp ?? 0).toBeLessThan(before)
    })
  }

  it('a fast shot coming down at an angle hits the target', () => {
    const r = rig({ r: ['owl'] })
    r.step(2)
    const t = target(r, [0, 0, 0])
    const hp = t.hp ?? 0
    spawnShot(r.sim, {
      kind: 'owl',
      item: 'owl',
      side: r.player().side,
      owner: r.player().id,
      hand: 'R',
      p: [-1.5, 3, 0],
      v: [240, -240, 0],
      dmg: 36,
      headMult: 1.6,
      range: 50,
      life: 1,
      r: 0
    })
    shotsTick(r.sim)
    expect(t.hp ?? 0).toBeLessThan(hp)
  })
})

describe('shots fired against a node (its hit volume is its solid pod, r 1.6)', () => {
  const setup = () => {
    const r = rig({ r: ['bee'] })
    r.step(2)
    r.player().p = [0, 0, 0]
    const node = addProp(r.sim, 'node', [0, 0, 0], 0, FOE_SIDE, { hp: 1000, r: 2.2, data: { h: 4 } })
    // a body dropped on the node is pushed out to its surface (+x)
    r.step(1)
    return { r, node }
  }

  it('pressed against the node and aimed away from it, shots reach the far target and never hurt the node', () => {
    const { r, node } = setup()
    expect(r.player().p[0]).toBeGreaterThan(1.9)
    const far = target(r, [12, 0, 0])
    aimAt(r, [12, 0.9, 0])
    r.press('R', 30)
    expect(far.hp ?? 0).toBeLessThan(1000)
    expect(node.hp).toBe(1000)
  })

  it('pressed against the node and aimed at open sky away from it, no shot hits anything', () => {
    const { r, node } = setup()
    aimAt(r, [40, 6, 0])
    r.press('R', 30)
    expect(r.player().stats.shots).toBeGreaterThan(0)
    expect(r.player().stats.hits).toBe(0)
    expect(node.hp).toBe(1000)
  })

  it('a muzzle poking into the node hits the node, never something behind it', () => {
    const { r, node } = setup()
    const behind = target(r, [-6, 0, 0])
    // aim through the node at the target on its far side: the muzzle (left of the pivot) is inside the pod
    aimAt(r, [-6, 0.9, 0])
    r.press('R', 30)
    expect(node.hp ?? 0).toBeLessThan(1000)
    expect(behind.hp).toBe(1000)
  })

  it('point-blank at the node (pivot just outside, muzzle inside it) and from further away still hit it', () => {
    for (const z of [-3, -2.8, -6]) {
      const { r, node } = setup()
      r.player().p = [0, 0, z]
      aimAt(r, [0, 1, 0])
      r.press('R', 30)
      expect(node.hp ?? 0, 'from z=' + z).toBeLessThan(1000)
    }
  })
})
