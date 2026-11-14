import { describe, expect, it } from 'vitest'
import { FrameTally, FREEZE_MS, perfRequested, readoutText } from '../src/app/perf-readout'

/** Feeds frames `step` ms apart, `count` of them, starting at `from`; returns the time of the last one. */
function run(tally: FrameTally, from: number, step: number, count: number) {
  let t = from
  for (let i = 0; i < count; i++) {
    tally.frame(t)
    t += step
  }
  return t - step
}

describe('the readout counts late frames', () => {
  it('counts none on a steady display, whatever its rate', () => {
    for (const hz of [60, 90, 120]) {
      const tally = new FrameTally()
      run(tally, 0, 1000 / hz, 600)
      expect(tally.late).toBe(0)
      expect(tally.freezes).toBe(0)
      expect(Math.round(1000 / tally.interval)).toBe(hz)
      expect(tally.frames).toBe(599)
    }
  })

  it('counts a frame that waited one and a half intervals or more, and a freeze of 50 ms', () => {
    const tally = new FrameTally()
    let t = run(tally, 0, 1000 / 60, 120)
    // One frame skipped: the next comes after two intervals.
    t += 2000 / 60
    tally.frame(t)
    expect(tally.late).toBe(1)
    expect(tally.freezes).toBe(0)
    // The page stands still for 80 ms.
    t += 80
    tally.frame(t)
    expect(tally.late).toBe(2)
    expect(tally.freezes).toBe(1)
    expect(Math.round(tally.longest)).toBe(80)
    expect(FREEZE_MS).toBe(50)
  })

  it('does not count the time away from play as a wait', () => {
    const tally = new FrameTally()
    const t = run(tally, 0, 1000 / 60, 120)
    tally.gap()
    // Five seconds in the pause menu, then play again.
    run(tally, t + 5000, 1000 / 60, 60)
    expect(tally.late).toBe(0)
    expect(tally.longest).toBeLessThan(20)
  })

  it('starts over for a new stage and still knows the display', () => {
    const tally = new FrameTally()
    const t = run(tally, 0, 1000 / 60, 120)
    tally.frame(t + 200)
    expect(tally.late).toBe(1)
    tally.reset()
    expect([tally.frames, tally.late, tally.freezes, tally.longest]).toEqual([0, 0, 0, 0])
    expect(Math.round(1000 / tally.interval)).toBe(60)
  })

  it('says nothing about late frames before it has seen a few', () => {
    const tally = new FrameTally()
    tally.frame(0)
    tally.frame(300)
    expect(tally.late).toBe(0)
    expect(tally.interval).toBe(0)
  })
})

describe('the readout text', () => {
  it('shows the rate, the late frames, the longest wait and the freezes', () => {
    const tally = new FrameTally()
    const t = run(tally, 0, 1000 / 60, 120)
    tally.frame(t + 70)
    expect(readoutText(tally, null)).toBe('60Hz  おくれ 1/120  最長 70ms\n50ms以上 1回')
    expect(readoutText(tally, { count: 2, longest: 61.4 })).toBe(
      '60Hz  おくれ 1/120  最長 70ms\n50ms以上 1回  長い処理 2回 最長 61ms'
    )
  })

  it('shows dashes for the rate until it is known', () => {
    expect(readoutText(new FrameTally(), null)).toBe('--Hz  おくれ 0/0  最長 0ms\n50ms以上 0回')
  })
})

describe('asking for the readout', () => {
  it('is asked for with ?perf in the address', () => {
    expect(perfRequested('?perf')).toBe(true)
    expect(perfRequested('?perf=1')).toBe(true)
    expect(perfRequested('?a=b&perf')).toBe(true)
    expect(perfRequested('')).toBe(false)
    expect(perfRequested('?performance=1')).toBe(false)
  })
})
