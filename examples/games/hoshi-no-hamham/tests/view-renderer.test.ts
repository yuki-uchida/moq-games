import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHECK_EVERY,
  Renderer,
  SCALE_WINDOW,
  SETTLE_FRAMES,
  SLOW_FRAME_MS,
  computeScale,
  dropHelped,
  median,
  nextScale,
  windowStats
} from '../src/view/renderer'

const slow = (n = SCALE_WINDOW) => Array.from({ length: n }, () => SLOW_FRAME_MS + 10)
const fast = (n = SCALE_WINDOW) => Array.from({ length: n }, () => 16.7)

describe('computeScale', () => {
  it('is ceil(width × ratio / 640) clamped to 1..4', () => {
    expect(computeScale(640, 1)).toBe(1)
    expect(computeScale(844, 3)).toBe(4)
    expect(computeScale(2000, 3)).toBe(4)
    expect(computeScale(320, 1)).toBe(1)
    expect(computeScale(700, 1)).toBe(2)
    expect(computeScale(Number.NaN, 1)).toBe(1)
  })

  it('takes the whole number below when the ratio is less than 8 % above it (scales of 3 and 4)', () => {
    // A phone 651 CSS px wide at ratio 3 is 1953 device pixels: 3.05 art scales, 3 and not 4.
    expect(computeScale(651, 3)).toBe(3)
    expect(computeScale(667, 2)).toBe(2)
    expect(computeScale(1300, 2)).toBe(4)
    expect(computeScale(640, 3)).toBe(3)
    expect(computeScale(1920 / 3, 3)).toBe(3)
    // Just past the slack the next scale is used.
    expect(computeScale(700, 3)).toBe(4)
    expect(computeScale(844, 3)).toBe(4)
    expect(computeScale(1000, 3)).toBe(4)
    // 3.3 art scales is more than 8 % above 3.
    expect(computeScale(704, 3)).toBe(4)
    // The same slack at ratio 1: 2.002 art scales is 2.
    expect(computeScale(1281, 1)).toBe(2)
  })

  it('leaves scales of 1 and 2 as they were', () => {
    expect(computeScale(700, 1)).toBe(2)
    expect(computeScale(641, 1)).toBe(2)
    expect(computeScale(1000, 1)).toBe(2)
    expect(computeScale(1400, 1)).toBe(3)
    expect(computeScale(320, 2)).toBe(1)
  })
})

describe('median', () => {
  it('takes the middle value, the mean of the two middle ones for an even count, and 0 for none', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBe(0)
  })
})

describe('windowStats', () => {
  it('gives the median, the lower quartile and the share of frames over 1.6 × the quartile', () => {
    const values = [10, 10, 10, 10, 10, 10, 10, 10, 20, 20]
    const stats = windowStats(values, 0, values.length)
    expect(stats.median).toBe(10)
    expect(stats.quartile).toBe(10)
    expect(stats.missed).toBeCloseTo(0.2, 9)
    expect(windowStats([], 0, 0)).toEqual({ median: 0, quartile: 0, missed: 0 })
  })

  it('reads a slice in any order, agrees with median() and leaves its input alone', () => {
    const values = [99, 5, 1, 4, 2, 3, 99]
    expect(windowStats(values, 1, 6).median).toBe(median([5, 1, 4, 2, 3]))
    expect(values).toEqual([99, 5, 1, 4, 2, 3, 99])
  })

  it('does not count a steady slow rhythm (a system capped at 30 Hz) as missed frames', () => {
    const steady = Array.from({ length: SCALE_WINDOW }, () => 33.3)
    expect(windowStats(steady, 0, steady.length).missed).toBe(0)
  })
})

describe('dropHelped', () => {
  const stats = (median: number, missed = 0) => ({ median, quartile: median, missed })

  it('wants a median at least 10 % shorter', () => {
    expect(dropHelped(stats(40), stats(36))).toBe(true)
    expect(dropHelped(stats(40), stats(37))).toBe(false)
    expect(dropHelped(stats(40), stats(40))).toBe(false)
  })

  it('accepts far fewer missed frames when the drop was made for them', () => {
    expect(dropHelped(stats(16.7, 0.3), stats(16.7, 0.05))).toBe(true)
    expect(dropHelped(stats(16.7, 0.3), stats(16.7, 0.3))).toBe(false)
    expect(dropHelped(stats(30, 0), stats(30, 0))).toBe(false)
  })
})

describe('nextScale', () => {
  it('lowers by one when the median interval of a full window is above the threshold', () => {
    expect(nextScale(4, slow(), false)).toBe(3)
    expect(nextScale(2, slow(), false)).toBe(1)
  })

  it('keeps the scale at or below the threshold', () => {
    expect(nextScale(4, fast(), false)).toBe(4)
    expect(nextScale(4, Array(SCALE_WINDOW).fill(SLOW_FRAME_MS), false)).toBe(4)
  })

  it('waits for a full window', () => {
    expect(nextScale(4, slow(SCALE_WINDOW - 1), false)).toBe(4)
  })

  it('never goes below 1', () => {
    expect(nextScale(1, slow(), false)).toBe(1)
  })

  it('never changes during a staged sequence that holds the simulation', () => {
    expect(nextScale(4, slow(), true)).toBe(4)
  })

  it('never raises the scale', () => {
    for (const k of [1, 2, 3, 4]) {
      expect(nextScale(k, fast(), false)).toBeLessThanOrEqual(k)
      expect(nextScale(k, slow(), false)).toBeLessThanOrEqual(k)
    }
  })

  it('uses a median, so a few long frames in a good window do not lower it', () => {
    const intervals = [...fast(SCALE_WINDOW - 10), ...Array(10).fill(120)]
    expect(nextScale(4, intervals, false)).toBe(4)
  })

  it('lowers when a fifth of the frames are missed ones although the median is fine', () => {
    // A phone that misses one frame in four: 16.7 ms mostly, 33.4 ms for the misses.
    const patterned = Array.from({ length: SCALE_WINDOW }, (_, i) => (i % 4 === 3 ? 33.4 : 16.7))
    expect(median(patterned)).toBeLessThan(SLOW_FRAME_MS)
    expect(nextScale(3, patterned, false)).toBe(2)
    // One miss in ten does not count.
    const rare = Array.from({ length: SCALE_WINDOW }, (_, i) => (i % 10 === 3 ? 33.4 : 16.7))
    expect(nextScale(3, rare, false)).toBe(3)
  })

  it('looks only at the last window', () => {
    expect(nextScale(4, [...slow(200), ...fast()], false)).toBe(4)
    expect(nextScale(4, [...fast(200), ...slow()], false)).toBe(3)
  })
})

describe('Renderer frame watching', () => {
  const globals = globalThis as Record<string, unknown>
  let saved: Record<string, unknown>
  let cssWidth: number
  let ratio: number
  let canvas: { width: number; height: number; clientWidth: number; getContext: () => object }

  beforeEach(() => {
    saved = { window: globals.window, document: globals.document, ResizeObserver: globals.ResizeObserver }
    cssWidth = 844
    ratio = 3
    globals.ResizeObserver = undefined
    globals.window = {
      get devicePixelRatio() {
        return ratio
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
    globals.document = { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    canvas = {
      width: 640,
      height: 360,
      get clientWidth() {
        return cssWidth
      },
      getContext: () => ({})
    }
  })

  afterEach(() => {
    Object.assign(globals, saved)
  })

  /** Plays `count` frames of `interval` ms starting at `from`; returns the time after the last one. */
  function frames(renderer: Renderer, from: number, count: number, interval: number, held = false) {
    let t = from
    for (let i = 0; i < count; i++) {
      t += interval
      renderer.observeFrame(t, true, held)
    }
    return t
  }

  /** Like `frames`, but each frame takes `msFor(k)` at the scale the renderer has just then. */
  function phone(renderer: Renderer, from: number, count: number, msFor: (k: number) => number) {
    let t = from
    for (let i = 0; i < count; i++) {
      t += msFor(renderer.k)
      renderer.observeFrame(t, true, false)
    }
    return t
  }

  const FULL = SETTLE_FRAMES + SCALE_WINDOW + 1

  it('starts at the full scale and lowers one step per slow window while the drops help, settling after each change', () => {
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement)
    expect(renderer.k).toBe(4)
    expect(canvas.width).toBe(2560)
    // A frame time that follows the pixel count: 96, 54, 24 and 6 ms at k = 4, 3, 2, 1. (This test used a constant
    // 40 ms before; that is a system that caps the rate, which now ends the adapting after the first drop.)
    const cost = (k: number) => 6 * k * k
    let t = phone(renderer, 0, FULL, cost)
    expect(renderer.k).toBe(3)
    expect(canvas.width).toBe(1920)
    expect(canvas.height).toBe(1080)
    t = phone(renderer, t, FULL, cost)
    expect(renderer.k).toBe(2)
    t = phone(renderer, t, FULL, cost)
    expect(renderer.k).toBe(1)
    phone(renderer, t, 600, cost)
    expect(renderer.k).toBe(1)
    expect(canvas.width).toBe(640)
    expect(renderer.adaptationOff).toBe(false)
  })

  it('checks the window once per CHECK_EVERY frames', () => {
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement)
    let t = 0
    let changedAt = -1
    for (let i = 1; i <= FULL + 60 && changedAt < 0; i++) {
      t += i < SETTLE_FRAMES + 40 ? 16.7 : 6 * renderer.k * renderer.k
      if (renderer.observeFrame(t, true, false)) changedAt = i
    }
    expect(changedAt).toBeGreaterThan(0)
    // The first sample is the one after the first frame and the settle frames; checks fall on the window's
    // first full frame and every CHECK_EVERY after it.
    const sampled = changedAt - 1 - SETTLE_FRAMES
    expect(sampled).toBeGreaterThanOrEqual(SCALE_WINDOW)
    expect((sampled - SCALE_WINDOW) % CHECK_EVERY).toBe(0)
  })

  it('lowers for a phone that keeps missing frames although its median is fine', () => {
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement)
    let n = 0
    // 16.7 ms frames, every fourth one 33.4 ms; the misses go away at a lower scale.
    const rhythm = (k: number) => (k === 4 && ++n % 4 === 0 ? 33.4 : 16.7)
    const t = phone(renderer, 0, FULL, rhythm)
    expect(renderer.k).toBe(3)
    phone(renderer, t, FULL, rhythm)
    expect(renderer.k).toBe(3)
    expect(renderer.adaptationOff).toBe(false)
  })

  it('gives the pixels back and stops adapting when a drop did not make the frames shorter (capped rate)', () => {
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement)
    let t = frames(renderer, 0, FULL, 33.3)
    expect(renderer.k).toBe(3)
    t = frames(renderer, t, FULL, 33.3)
    expect(renderer.k).toBe(4)
    expect(renderer.adaptationOff).toBe(true)
    expect(canvas.width).toBe(2560)
    frames(renderer, t, 2000, 33.3)
    expect(renderer.k).toBe(4)
  })

  it('adapts again after the canvas is resized', () => {
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement)
    const t = frames(renderer, 0, 2 * FULL, 33.3)
    expect(renderer.adaptationOff).toBe(true)
    // The same size again (the address bar moving) does not unlock it.
    renderer.resize()
    expect(renderer.adaptationOff).toBe(true)
    cssWidth = 700
    renderer.resize()
    expect(renderer.adaptationOff).toBe(false)
    const max = computeScale(700, 3)
    expect(renderer.k).toBe(max)
    // A fast enough drop (frames follow the canvas) is allowed again.
    phone(renderer, t, FULL, (k) => 6 * k * k)
    expect(renderer.k).toBe(max - 1)
  })

  it('ignores the frames right after a start and a window not yet full', () => {
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement)
    frames(renderer, 0, SETTLE_FRAMES + SCALE_WINDOW - 5, 40)
    expect(renderer.k).toBe(4)
  })

  it('does not change while held, and then changes once released', () => {
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement)
    const t = frames(renderer, 0, SETTLE_FRAMES + SCALE_WINDOW + 20, 40, true)
    expect(renderer.k).toBe(4)
    // The check counter keeps running while held, so the first frame after the hold is checked at once.
    frames(renderer, t, 1, 40, false)
    expect(renderer.k).toBe(3)
  })

  it('does not count frames outside play and restarts its window after them', () => {
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement)
    for (let i = 0; i < 400; i++) renderer.observeFrame(i * 40, false, false)
    expect(renderer.k).toBe(4)
  })

  it('treats a stall (hidden tab) as no sample', () => {
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement)
    let t = frames(renderer, 0, 3, 16)
    for (let i = 0; i < 200; i++) {
      t += 5000
      renderer.observeFrame(t, true, false)
    }
    expect(renderer.k).toBe(4)
  })

  it('keeps a lowered scale on a resize that changes neither width nor ratio, and restores the limit when it does', () => {
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement)
    phone(renderer, 0, FULL, (k) => 6 * k * k)
    expect(renderer.k).toBe(3)
    renderer.resize()
    expect(renderer.k).toBe(3)
    cssWidth = 700
    renderer.resize()
    expect(renderer.k).toBe(computeScale(700, 3))
    expect(renderer.maxK).toBe(computeScale(700, 3))
  })

  it('never exceeds the limit of a smaller canvas', () => {
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement)
    cssWidth = 320
    ratio = 1
    renderer.resize()
    expect(renderer.k).toBe(1)
  })

  it('makes a 651 CSS px canvas at ratio 3 a 1920×1080 backing store', () => {
    cssWidth = 651
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement)
    expect(renderer.k).toBe(3)
    expect(canvas.width).toBe(1920)
    expect(canvas.height).toBe(1080)
  })
})
