import { describe, expect, it } from 'vitest'
import { playTown } from './town-play'

describe('chapter 2: 知らない町', () => {
  it('takes a cautious run past every enemy in 20–60 minutes (seed 1)', () => {
    const seed = 1
    const run = playTown(seed, true, 60)
    console.info(`chapter 2 cautious seed ${seed}`, JSON.stringify(run))
    expect(run.minutes).toBeGreaterThanOrEqual(20)
    expect(run.minutes).toBeLessThanOrEqual(60)
  }, 300_000)
})
