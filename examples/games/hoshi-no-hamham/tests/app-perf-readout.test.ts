import { describe, expect, it } from 'vitest'
import {
  AFTER_HIT_MS,
  FrameTally,
  FREEZE_MS,
  HitTally,
  perfRequested,
  readoutText,
  SLOW_MS
} from '../src/app/perf-readout'

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

/** Feeds `frames` frames `step` ms apart to both tallies from `from` on; returns the time of the next frame. */
function play(hits: HitTally, from: number, frames: number, judgements: number, holding = false, step = 1000 / 60) {
  let t = from
  for (let i = 0; i < frames; i++) {
    hits.frame(t, judgements, holding)
    t += step
  }
  return t
}

describe('the readout counts the moments of damage and the waits after them', () => {
  it('counts a moment for every frame in which damage was judged, and no wait when the frames come on time', () => {
    const hits = new HitTally()
    let t = play(hits, 0, 60, 0)
    // A bite lands (one judgement), then an enemy is hit and falls in one frame (two judgements, one moment).
    hits.frame(t, 1, false)
    t = play(hits, t + 1000 / 60, 30, 1)
    hits.frame(t, 3, false)
    play(hits, t + 1000 / 60, 60, 3)
    expect([hits.moments, hits.slow, hits.freezes]).toEqual([2, 0, 0])
  })

  it('counts the wait that begins with the frame of the damage, once for its moment', () => {
    const hits = new HitTally()
    let t = play(hits, 0, 60, 0)
    hits.frame(t, 1, false)
    // The page stands still for 80 ms after that frame, then for 30 ms more, then goes on.
    t += 80
    hits.frame(t, 1, false)
    t += 30
    hits.frame(t, 1, false)
    play(hits, t + 1000 / 60, 60, 1)
    expect([hits.moments, hits.slow, hits.freezes]).toEqual([1, 1, 1])
  })

  it('counts a wait that begins within a quarter of a second after the damage, and none that begins later', () => {
    expect(AFTER_HIT_MS).toBe(250)
    const near = new HitTally()
    let t = play(near, 0, 60, 0)
    near.frame(t, 1, false)
    // Twelve frames on time (200 ms), then a wait of 30 ms: one frame left out, within the window.
    t = play(near, t + 1000 / 60, 12, 1)
    near.frame(t + 30 - 1000 / 60, 1, false)
    expect([near.moments, near.slow, near.freezes]).toEqual([1, 1, 0])

    const far = new HitTally()
    t = play(far, 0, 60, 0)
    far.frame(t, 1, false)
    // Twenty frames on time (333 ms), then a freeze of 90 ms: it is not this moment's.
    t = play(far, t + 1000 / 60, 20, 1)
    far.frame(t + 90 - 1000 / 60, 1, false)
    expect([far.moments, far.slow, far.freezes]).toEqual([1, 0, 0])
  })

  it('does not count the wait before the frame of the damage', () => {
    const hits = new HitTally()
    const t = play(hits, 0, 60, 0)
    // The frame that judges the damage arrives 70 ms late: that wait began before anything was judged.
    hits.frame(t + 70, 1, false)
    play(hits, t + 70 + 1000 / 60, 60, 1)
    expect([hits.moments, hits.slow, hits.freezes]).toEqual([1, 0, 0])
  })

  it('counts one long wait for each of two moments it follows', () => {
    const hits = new HitTally()
    let t = play(hits, 0, 60, 0)
    hits.frame(t, 1, false)
    t = play(hits, t + 1000 / 60, 3, 1)
    hits.frame(t, 2, false)
    hits.frame(t + 60, 2, false)
    expect([hits.moments, hits.slow, hits.freezes]).toEqual([2, 2, 2])
  })

  it('counts the hit-stops and how long their pictures stayed', () => {
    const hits = new HitTally()
    let t = play(hits, 0, 60, 0)
    // A hurt: its frame and the five after it hold the picture (0.1 s), frames arriving on time all along.
    hits.frame(t, 1, true)
    t = play(hits, t + 1000 / 60, 5, 1, true)
    t = play(hits, t, 30, 1)
    expect(hits.holds).toBe(1)
    expect(Math.round(hits.held)).toBe(100)
    // A second one later is a second hold; the frames came on time, so no wait is counted for either moment.
    hits.frame(t, 2, true)
    t = play(hits, t + 1000 / 60, 2, 2, true)
    play(hits, t, 30, 2)
    expect(hits.holds).toBe(2)
    expect(Math.round(hits.held)).toBe(150)
    expect([hits.moments, hits.slow, hits.freezes]).toEqual([2, 0, 0])
  })

  it('counts nothing across a pause, and starts over for a new stage', () => {
    const hits = new HitTally()
    const t = play(hits, 0, 60, 0)
    hits.frame(t, 1, true)
    hits.gap()
    // Five seconds in the pause menu: neither a wait after the moment nor time held.
    play(hits, t + 5000, 60, 1)
    expect([hits.moments, hits.slow, hits.freezes, hits.holds, Math.round(hits.held)]).toEqual([1, 0, 0, 1, 0])
    hits.reset()
    expect([hits.moments, hits.slow, hits.freezes, hits.holds, hits.held]).toEqual([0, 0, 0, 0, 0])
    // The new stage's session counts its judgements from zero again.
    const again = play(hits, t + 9000, 10, 0)
    hits.frame(again, 1, false)
    expect(hits.moments).toBe(1)
  })
})

describe('the readout text of the moments of damage', () => {
  it('adds the moments, the waits right after them and the hit-stops', () => {
    const tally = new FrameTally()
    const hits = new HitTally()
    let t = 0
    for (let i = 0; i < 120; i++) {
      tally.frame(t)
      hits.frame(t, 0, false)
      t += 1000 / 60
    }
    tally.frame(t)
    hits.frame(t, 1, true)
    t += 70
    tally.frame(t)
    hits.frame(t, 1, false)
    expect(readoutText(tally, { count: 1, longest: 61.4 }, hits)).toBe(
      [
        '58コマ/秒  121コマ  最長 70ms',
        '25ms以上 1回  50ms以上 1回',
        '長い処理 1回 最長 61ms',
        'ダメージ判定 1回',
        '直後 25ms以上 1回 50ms以上 1回',
        'ため(演出) 1回 計0.1秒'
      ].join('\n')
    )
    // Played without the hit-stops, the last line says so.
    expect(readoutText(tally, null, hits, true).split('\n').slice(2)).toEqual([
      'ダメージ判定 1回',
      '直後 25ms以上 1回 50ms以上 1回',
      'ため(演出)なしで再生中'
    ])
  })
})
