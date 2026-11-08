import { describe, expect, it } from 'vitest'
import { ATTRACT_MAX_DT, ATTRACT_RUN_SECONDS, AttractDemo, planPath } from '../src/attract'
import { SPAWN } from '../src/map'

const run = (demo: AttractDemo, seconds: number) => {
  for (let frame = 0; frame < seconds * 60; frame++) demo.step(1 / 60)
}

describe('title attract demo', () => {
  it('plays on its own: it moves and eats', () => {
    const demo = new AttractDemo({ seed: 7 })
    const start = { x: demo.player.x, z: demo.player.z }
    run(demo, 60)
    expect(Math.hypot(demo.player.x - start.x, demo.player.z - start.z)).toBeGreaterThan(5)
    expect(demo.player.foodEaten).toBeGreaterThan(0)
    expect(demo.state.phase).toBe('playing')
  })

  it('is deterministic for a fixed seed and varies between seeds', () => {
    const [first, second, other] = [7, 7, 8].map((seed) => new AttractDemo({ seed }))
    for (const demo of [first, second, other]) run(demo, 40)
    expect(second.player).toEqual(first.player)
    expect(other.state.predators).not.toEqual(first.state.predators)
  })

  it('caps the time step and stays still when speed is 0', () => {
    const demo = new AttractDemo({ seed: 7 })
    demo.step(10)
    expect(demo.state.time).toBeLessThanOrEqual(ATTRACT_MAX_DT + 1e-6)
    const still = new AttractDemo({ seed: 7, speed: 0 })
    run(still, 5)
    expect(still.state.time).toBe(0)
  })

  it('starts a fresh run when the rabbit is downed or the run gets old', () => {
    const demo = new AttractDemo({ seed: 7 })
    run(demo, 5)
    demo.player.downed = true
    demo.step(1 / 60)
    expect(demo.runs).toBe(2)
    expect(demo.player.downed).toBe(false)
    expect(demo.state.time).toBeLessThan(0.1)
    demo.state.time = ATTRACT_RUN_SECONDS + 1
    demo.step(1 / 60)
    expect(demo.runs).toBe(3)
  })

  it('survives and keeps moving over several minutes of demo time', () => {
    const demo = new AttractDemo({ seed: 7 })
    let travelled = 0
    let last = { x: demo.player.x, z: demo.player.z }
    for (let frame = 0; frame < 60 * 200; frame++) {
      demo.step(1 / 60)
      travelled += Math.hypot(demo.player.x - last.x, demo.player.z - last.z)
      last = { x: demo.player.x, z: demo.player.z }
    }
    expect(travelled).toBeGreaterThan(100)
    expect(demo.runs).toBe(1)
  })

  it('plans a walkable path toward a reachable goal', () => {
    new AttractDemo({ seed: 7 })
    const path = planPath(SPAWN, { x: SPAWN.x + 12, z: SPAWN.z + 3 })
    expect(path.length).toBeGreaterThan(5)
    const end = path[path.length - 1]
    expect(Math.hypot(end.x - SPAWN.x - 12, end.z - SPAWN.z - 3)).toBeLessThan(2)
  })
})
