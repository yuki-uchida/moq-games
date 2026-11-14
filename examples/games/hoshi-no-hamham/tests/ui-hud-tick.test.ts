import { describe, expect, it } from 'vitest'
import {
  BITE_ROWS,
  biteRow,
  goalBob,
  heartBeat,
  shootingStar,
  METER_TICK,
  stepMeterClock,
  swapProgress,
  twinkleStep
} from '../src/ui/hud-model'

/** Runs `seconds` of frames of `dt` and returns the number of frames that write the meters. */
function writes(dt: number, seconds: number) {
  let waited = 0
  let count = 0
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const step = stepMeterClock(waited, dt)
    waited = step.waited
    if (step.due) count++
  }
  return count
}

describe('the meters tick', () => {
  it('writes about fifteen times a second at any frame rate', () => {
    for (const dt of [1 / 240, 1 / 120, 1 / 90, 1 / 60, 1 / 30]) {
      const count = writes(dt, 10)
      expect(count).toBeGreaterThanOrEqual(10 * 14)
      expect(count).toBeLessThanOrEqual(10 * 16)
    }
  })

  it('writes at most once for a frame, however long it is', () => {
    const step = stepMeterClock(0, 0.5)
    expect(step.due).toBe(true)
    expect(step.waited).toBeLessThanOrEqual(METER_TICK / 2)
    expect(stepMeterClock(step.waited, 1 / 120).due).toBe(false)
  })

  it('does not write in a frame that is well inside a tick', () => {
    expect(stepMeterClock(0, 1 / 120)).toEqual({ waited: 1 / 120, due: false })
  })
})

describe('the bite gauge', () => {
  it('is empty when a bite lands, climbs a row at a time and is full when the cooldown is over', () => {
    expect(biteRow(0.36, 0.36)).toBe(0)
    expect(biteRow(0.18, 0.36)).toBe(BITE_ROWS / 2)
    expect(biteRow(0.01, 0.36)).toBe(BITE_ROWS - 1)
    expect(biteRow(0, 0.36)).toBe(BITE_ROWS)
    expect(biteRow(-1, 0.36)).toBe(BITE_ROWS)
    expect(biteRow(9, 0.36)).toBe(0)
  })

  it('never goes down while the cooldown runs out', () => {
    let last = -1
    for (let left = 0.36; left > 0; left -= 0.004) {
      const rows = biteRow(left, 0.36)
      expect(rows).toBeGreaterThanOrEqual(last)
      last = rows
    }
  })

  it('fills in one step per art row of the tooth', () => {
    expect(BITE_ROWS).toBe(16)
  })
})

describe('the hint line swap', () => {
  it('eases out over 0.42 s and is done after it', () => {
    expect(swapProgress(0)).toBe(0)
    expect(swapProgress(0.21)).toBeGreaterThan(0.5)
    expect(swapProgress(0.42)).toBe(1)
    expect(swapProgress(5)).toBe(1)
  })
})

describe('the deck keeps its ambient motion by the clock', () => {
  it('twinkles in the three steps of the old animation, 0.96 s, 0.72 s and 0.72 s', () => {
    const seen = (from: number, to: number) =>
      new Set([0, 0.25, 0.5, 0.75, 1].map((x) => twinkleStep(from + (to - from) * x)))
    expect(seen(0, 0.95)).toEqual(new Set([0]))
    expect(seen(0.97, 1.67)).toEqual(new Set([1]))
    expect(seen(1.69, 2.39)).toEqual(new Set([2]))
    expect(twinkleStep(2.4)).toBe(0)
  })

  it('sends a shooting star for 0.9 s of every 9, the first one 3 s after the start', () => {
    let on = 0
    for (let t = 0; t < 30; t += 0.01) if (shootingStar(t)) on += 0.01
    // 3 s of delay, then at 7.74..8.64 s of each cycle: three crossings in 30 s (10.74, 19.74, 28.74).
    expect(on).toBeCloseTo(2.7, 1)
    expect(shootingStar(2)).toBeNull()
    expect(shootingStar(10.9)).not.toBeNull()
    expect(shootingStar(11.7)).toBeNull()
  })

  it('flies the star 120 px in its first 80 %, fading in at the start and out at the end', () => {
    const at = (fraction: number) => shootingStar(3 + 7.74 + fraction * 0.9)!
    expect(at(0.001).opacity).toBeLessThan(0.05)
    expect(at(0.5)).toEqual({ x: expect.closeTo(75, 0), opacity: 1 })
    expect(at(0.8).x).toBeCloseTo(120, 0)
    expect(at(0.999).opacity).toBeLessThan(0.05)
    expect(at(0.999).x).toBeCloseTo(150, 0)
  })

  it('lifts the open goal 0, 1, 2 and 1 px in quarters of 1.2 s', () => {
    expect([0.1, 0.4, 0.7, 1.0].map(goalBob)).toEqual([0, 1, 2, 1])
    expect(goalBob(1.3)).toBe(0)
  })

  it('swells the low-health hearts for 0.24 s of each 0.8 s', () => {
    expect([0.05, 0.2, 0.3, 0.5, 0.85, 1.0].map(heartBeat)).toEqual([false, true, true, false, false, true])
  })
})
