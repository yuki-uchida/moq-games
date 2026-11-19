import { describe, expect, it } from 'vitest'
import { FxPool } from '../src/view/fx'

interface Seen {
  age: number
  delay: number
}

const items = (pool: FxPool) => (pool as unknown as { items: Seen[] }).items

describe("round 8: an effect is first drawn as it was born on a step; a staged beat's ages from its own frame", () => {
  it('born on a step (its events answered), it is first drawn young, however long the frame', () => {
    const pool = new FxPool(1)
    pool.stepBorn = true
    pool.spawn('spark', 0, 0)
    pool.stepBorn = false
    pool.update(1 / 20)
    expect(items(pool)[0].age).toBe(0)
    pool.update(1 / 60)
    expect(items(pool)[0].age).toBeCloseTo(1 / 60, 9)
  })

  it('spawned by a beat after the frame aged the effects (drawn young on that frame), it ages on the next frame', () => {
    const pool = new FxPool(1)
    pool.update(1 / 60)
    // (The director's beat runs after the view's update: this frame draws it at age 0.)
    pool.spawn('ring', 0, 0)
    expect(items(pool)[0].age).toBe(0)
    pool.update(1 / 60)
    expect(items(pool)[0].age).toBeCloseTo(1 / 60, 9)
  })

  it("a beat's delayed effect appears on the frame its delay is up, not a frame later", () => {
    const pool = new FxPool(1)
    pool.update(1 / 60)
    pool.spawn('ring', 0, 0, { delay: 2 / 60 })
    pool.update(1 / 60)
    expect(items(pool)[0].delay).toBeGreaterThan(0)
    pool.update(1 / 60)
    expect(items(pool)[0].delay).toBeLessThanOrEqual(1e-9)
  })
})
