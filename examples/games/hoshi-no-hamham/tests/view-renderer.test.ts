import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Renderer,
  SCALE_WINDOW,
  SETTLE_FRAMES,
  SLOW_FRAME_MS,
  computeScale,
  median,
  nextScale
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
})

describe('median', () => {
  it('takes the middle value, the mean of the two middle ones for an even count, and 0 for none', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBe(0)
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

  it('starts at the full scale and lowers one step per slow window, settling after each change', () => {
    const renderer = new Renderer(canvas as unknown as HTMLCanvasElement)
    expect(renderer.k).toBe(4)
    expect(canvas.width).toBe(2560)
    let t = frames(renderer, 0, SETTLE_FRAMES + SCALE_WINDOW + 1, 40)
    expect(renderer.k).toBe(3)
    expect(canvas.width).toBe(1920)
    expect(canvas.height).toBe(1080)
    t = frames(renderer, t, SETTLE_FRAMES + SCALE_WINDOW + 1, 40)
    expect(renderer.k).toBe(2)
    t = frames(renderer, t, SETTLE_FRAMES + SCALE_WINDOW + 1, 40)
    expect(renderer.k).toBe(1)
    frames(renderer, t, 600, 40)
    expect(renderer.k).toBe(1)
    expect(canvas.width).toBe(640)
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
    frames(renderer, 0, SETTLE_FRAMES + SCALE_WINDOW + 1, 40)
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
})
