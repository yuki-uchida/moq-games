import { describe, expect, it } from 'vitest'
import { FrameTally, FREEZE_MS, perfRequested, readoutText, SLOW_MS } from '../src/app/perf-readout'

/** Feeds frames `step` ms apart, `count` of them, starting at `from`; returns the time of the last one. */
function run(tally: FrameTally, from: number, step: number, count: number) {
  let t = from
  for (let i = 0; i < count; i++) {
    tally.frame(t)
    t += step
  }
  return t - step
}

describe('the readout counts the waits between frames', () => {
  it('counts no long wait at a steady 60 frames a second or more, and shows the rate the page was given', () => {
    for (const rate of [60, 90, 120]) {
      const tally = new FrameTally()
      run(tally, 0, 1000 / rate, 600)
      expect(tally.slow).toBe(0)
      expect(tally.freezes).toBe(0)
      expect(Math.round(tally.rate)).toBe(rate)
      expect(tally.frames).toBe(599)
    }
  })

  it('shows a page that gets every other frame for what it is: 30 frames a second, every wait a long one', () => {
    const tally = new FrameTally()
    run(tally, 0, 1000 / 30, 180)
    expect(Math.round(tally.rate)).toBe(30)
    expect(tally.slow).toBe(179)
    expect(tally.freezes).toBe(0)
    expect(readoutText(tally, null)).toBe('30コマ/秒  179コマ  最長 33ms\n25ms以上 179回  50ms以上 0回')
  })

  it('counts a wait of 25 ms or more, and a freeze of 50 ms', () => {
    const tally = new FrameTally()
    let t = run(tally, 0, 1000 / 60, 120)
    // One frame left out: the next comes after two intervals.
    t += 2000 / 60
    tally.frame(t)
    expect(tally.slow).toBe(1)
    expect(tally.freezes).toBe(0)
    // The page stands still for 80 ms.
    t += 80
    tally.frame(t)
    expect(tally.slow).toBe(2)
    expect(tally.freezes).toBe(1)
    expect(Math.round(tally.longest)).toBe(80)
    expect([SLOW_MS, FREEZE_MS]).toEqual([25, 50])
  })

  it('does not count a frame that is a little late as a long wait', () => {
    const tally = new FrameTally()
    let t = run(tally, 0, 1000 / 60, 60)
    for (const wait of [18, 21, 24.9]) {
      t += wait
      tally.frame(t)
    }
    expect(tally.slow).toBe(0)
    // On a display that shows 120 frames a second one frame left out is 16.7 ms: not a long wait either.
    const fast = new FrameTally()
    t = run(fast, 0, 1000 / 120, 120)
    fast.frame(t + 2000 / 120)
    expect(fast.slow).toBe(0)
    // Three left out in a row are 33 ms.
    fast.frame(t + 2000 / 120 + 4000 / 120)
    expect(fast.slow).toBe(1)
  })

  it('does not count the time away from play, as a wait or in the rate', () => {
    const tally = new FrameTally()
    const t = run(tally, 0, 1000 / 60, 120)
    tally.gap()
    // Five seconds in the pause menu, then play again.
    run(tally, t + 5000, 1000 / 60, 60)
    expect(tally.slow).toBe(0)
    expect(tally.longest).toBeLessThan(20)
    expect(Math.round(tally.rate)).toBe(60)
  })

  it('starts over for a new stage', () => {
    const tally = new FrameTally()
    const t = run(tally, 0, 1000 / 60, 120)
    tally.frame(t + 200)
    expect(tally.slow).toBe(1)
    tally.reset()
    expect([tally.frames, tally.time, tally.slow, tally.freezes, tally.longest, tally.rate]).toEqual([0, 0, 0, 0, 0, 0])
    // The first frame after it is the start of the count, not a wait.
    tally.frame(t + 5000)
    expect(tally.frames).toBe(0)
  })

  it('names no rate before it has seen a few frames', () => {
    const tally = new FrameTally()
    tally.frame(0)
    tally.frame(300)
    expect(tally.rate).toBe(0)
    expect(tally.slow).toBe(1)
  })
})

describe('the readout text', () => {
  it('shows the rate, the frames counted, the longest wait and the long waits', () => {
    const tally = new FrameTally()
    const t = run(tally, 0, 1000 / 60, 120)
    tally.frame(t + 70)
    expect(readoutText(tally, null)).toBe('58コマ/秒  120コマ  最長 70ms\n25ms以上 1回  50ms以上 1回')
    expect(readoutText(tally, { count: 2, longest: 61.4 })).toBe(
      '58コマ/秒  120コマ  最長 70ms\n25ms以上 1回  50ms以上 1回\n長い処理 2回 最長 61ms'
    )
  })

  it('shows dashes for the rate until it is known', () => {
    expect(readoutText(new FrameTally(), null)).toBe('--コマ/秒  0コマ  最長 0ms\n25ms以上 0回  50ms以上 0回')
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
