import { describe, expect, it } from 'vitest'
import { play } from './house-play'

describe('Chapter 1: the house', () => {
  it('clears with the whole family and Gon about, for a cautious rabbit, in 17–60 minutes (seed 1)', () => {
    const seed = 1
    const { minutes, catches } = play(seed, 1, true, 60)
    console.log(`house threat run, seed ${seed}: ${minutes.toFixed(1)} min, caught ${catches}×`)
    expect(minutes).toBeGreaterThanOrEqual(17)
    expect(minutes).toBeLessThanOrEqual(60)
  }, 240_000)
})
