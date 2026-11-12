import { describe, expect, it } from 'vitest'
import { MAX_STEPS, Pacer, STEP } from '../src/app/pacer'

/** A small deterministic generator for jitter. */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

interface Frame {
  steps: number
  alpha: number
  /** Total steps run so far. */
  total: number
}

/**
 * Runs a pacer over rAF-like timestamps: `rate` Hz, each rounded to 0.1 ms the way browsers do, with up to
 * ±`jitter` ms of noise. `hiccups` maps a frame index to extra milliseconds that frame took (and every later
 * timestamp keeps). Returns what every frame did.
 */
function run(
  rate: number,
  frames: number,
  options: { jitter?: number; scale?: number; hiccups?: Record<number, number> } = {}
) {
  const { jitter = 0, scale = 1, hiccups = {} } = options
  const random = lcg(rate * 7 + 3)
  const pacer = new Pacer()
  const out: Frame[] = []
  let last = 0
  let late = 0
  let total = 0
  for (let i = 1; i <= frames; i++) {
    late += hiccups[i] ?? 0
    const exact = (i * 1000) / rate + late + (jitter ? (random() * 2 - 1) * jitter : 0)
    const stamp = Math.round(exact * 10) / 10
    const dt = (stamp - last) / 1000
    last = stamp
    pacer.begin(dt, scale)
    let steps = 0
    while (pacer.due()) {
      pacer.stepped()
      steps += 1
    }
    total += steps
    out.push({ steps, alpha: pacer.finish(false), total })
  }
  return { frames: out, pacer, seconds: last / 1000 }
}

const RATES = [30, 50, 60, 72, 75, 90, 120, 144, 240]
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

describe('Pacer step pattern', () => {
  for (const jitter of [0, 0.3]) {
    for (const rate of RATES) {
      it(`is regular at ${rate} Hz${jitter ? ' with ±0.3 ms of jitter' : ''}`, () => {
        const { frames } = run(rate, rate * 8, { jitter })
        const settled = frames.slice(rate)
        const cycle = rate / gcd(rate, 60)
        for (let i = 0; i + cycle < settled.length; i++) expect(settled[i].steps).toBe(settled[i + cycle].steps)
        // A cycle holds exactly `60 / gcd` steps.
        let sum = 0
        for (let i = 0; i < cycle; i++) sum += settled[i].steps
        expect(sum).toBe(60 / gcd(rate, 60))
        for (const f of settled) expect(f.steps).toBeLessThanOrEqual(Math.ceil(60 / rate))
      })
    }
  }

  it('runs one step per frame at 60 Hz, alpha 1', () => {
    const { frames } = run(60, 1500, { jitter: 0.3 })
    for (const f of frames.slice(40)) {
      expect(f.steps).toBe(1)
      expect(f.alpha).toBeCloseTo(1, 9)
    }
  })

  it('steps every other frame at 120 Hz (alpha 0.5 and 1), 1,1,0 at 90 Hz, two per frame at 30 Hz', () => {
    const at120 = run(120, 600).frames.slice(60)
    expect(new Set(at120.map((f) => f.steps))).toEqual(new Set([0, 1]))
    for (let i = 0; i + 1 < at120.length; i++) expect(at120[i].steps + at120[i + 1].steps).toBe(1)
    expect(new Set(at120.map((f) => f.alpha.toFixed(3)))).toEqual(new Set(['0.500', '1.000']))

    const at90 = run(90, 600).frames.slice(60)
    for (let i = 0; i + 2 < at90.length; i += 3) {
      const cycle = at90.slice(i, i + 3).map((f) => f.steps)
      expect([...cycle].sort()).toEqual([0, 1, 1])
    }
    expect(new Set(at90.map((f) => f.alpha.toFixed(3)))).toEqual(new Set(['0.333', '0.667', '1.000']))

    for (const f of run(30, 300).frames.slice(40)) expect(f.steps).toBe(2)
  })

  it('runs the steps the elapsed time asks for over a long run, within one step', () => {
    for (const rate of RATES) {
      for (const jitter of [0, 0.3]) {
        const { frames, seconds } = run(rate, rate * 30, { jitter })
        const total = frames[frames.length - 1].total
        expect(Math.abs(total * STEP - seconds)).toBeLessThanOrEqual(STEP * 1.5)
      }
    }
  })
})

describe('Pacer alpha', () => {
  it('moves the picture forward by one display period every frame, whatever the rate', () => {
    for (const rate of [50, 60, 72, 75, 83, 90, 100, 120, 144, 165, 240]) {
      for (const jitter of [0, 0.3]) {
        const { frames, pacer } = run(rate, rate * 6, { jitter })
        const settled = frames.slice(rate)
        // Where the picture is, in simulation seconds: the state of the last step plus alpha of a step back.
        const shown = settled.map((f) => (f.total - 1 + f.alpha) * STEP)
        const period = pacer.period
        expect(period).toBeGreaterThan(0)
        for (let i = 1; i < shown.length; i++)
          expect(Math.abs(shown[i] - shown[i - 1] - period)).toBeLessThan(period * 0.005)
        for (const f of settled) {
          expect(f.alpha).toBeGreaterThan(0)
          expect(f.alpha).toBeLessThanOrEqual(1 + 1e-9)
        }
      }
    }
  })

  it('snaps the period to a standard rate and keeps an odd rate as measured', () => {
    expect(run(60, 200, { jitter: 0.3 }).pacer.period).toBeCloseTo(1 / 60, 12)
    expect(run(90, 300, { jitter: 0.3 }).pacer.period).toBeCloseTo(1 / 90, 12)
    const odd = run(83, 300).pacer.period
    expect(odd).toBeGreaterThan(0.0119)
    expect(odd).toBeLessThan(0.0122)
    expect(odd).not.toBeCloseTo(1 / 90, 4)
  })

  it('uses the real time until it has seen enough frames and when the times are too irregular', () => {
    const early = new Pacer()
    early.begin(0.01, 1)
    expect(early.period).toBe(0)
    expect(early.accumulator).toBeCloseTo(0.01, 12)

    const pacer = new Pacer()
    const random = lcg(5)
    for (let i = 0; i < 200; i++) pacer.begin(0.008 + random() * 0.04, 1)
    expect(pacer.period).toBe(0)
  })
})

describe('Pacer hitches and time scale', () => {
  it('catches up after a 50 ms frame and is regular again right after', () => {
    const { frames } = run(60, 400, { hiccups: { 200: 33.4 } })
    const hit = frames[199]
    expect(hit.steps).toBe(3)
    for (const f of frames.slice(60)) if (f !== hit) expect(f.steps).toBe(1)
    // And at 120 Hz: a missed frame (two periods) runs the steps of two frames.
    const at120 = run(120, 600, { hiccups: { 300: 1000 / 120 } }).frames
    // 31 frames and one missed one are 32 periods: 16 steps.
    expect(Math.abs(at120.slice(290, 321).reduce((a, f) => a + f.steps, 0) - 16)).toBeLessThanOrEqual(1)
    const after = at120.slice(310, 322)
    for (let i = 0; i + 2 < after.length; i++) expect(after[i].steps + after[i + 1].steps).toBe(1)
  })

  it('runs a step about every 3.3 frames in slow motion (0.3x), alpha rising in between', () => {
    const { frames } = run(60, 600, { scale: 0.3 })
    const stepFrames = frames.map((f, i) => (f.steps > 0 ? i : -1)).filter((i) => i >= 0)
    expect(frames[frames.length - 1].total).toBeGreaterThanOrEqual(178)
    expect(frames[frames.length - 1].total).toBeLessThanOrEqual(181)
    for (let i = 1; i < stepFrames.length; i++) expect([3, 4]).toContain(stepFrames[i] - stepFrames[i - 1])
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].steps === 0) expect(frames[i].alpha).toBeGreaterThan(frames[i - 1].alpha)
      else expect(frames[i].alpha).toBeLessThan(frames[i - 1].alpha + 1e-9)
    }
  })

  it('runs nothing at time scale 0 and nothing while held', () => {
    const pacer = new Pacer()
    for (let i = 0; i < 100; i++) {
      pacer.begin(STEP, 0)
      expect(pacer.due()).toBe(false)
      expect(pacer.finish(true)).toBe(1)
    }
    expect(pacer.accumulator).toBe(0)
  })

  it('keeps its accumulator through a hold and drops a debt it cannot pay', () => {
    const pacer = new Pacer()
    pacer.begin(STEP, 1)
    expect(pacer.due()).toBe(true)
    // Hit-stop begins in the middle of the frame: the picture shows the state at the hold.
    expect(pacer.finish(true)).toBe(1)
    expect(pacer.accumulator).toBe(0)
  })

  it('stops at MAX_STEPS in a frame and drops the rest of a long stall', () => {
    const pacer = new Pacer()
    pacer.begin(1, 1)
    let steps = 0
    while (pacer.due()) {
      pacer.stepped()
      steps += 1
    }
    expect(steps).toBe(MAX_STEPS)
    expect(pacer.finish(false)).toBe(1)
    pacer.begin(STEP, 1)
    expect(pacer.due()).toBe(true)
    pacer.stepped()
    expect(pacer.due()).toBe(false)
  })

  it('runs exactly one step for every call of frame(STEP), however many', () => {
    const pacer = new Pacer()
    for (let i = 0; i < 5000; i++) {
      pacer.begin(STEP, 1)
      let steps = 0
      while (pacer.due()) {
        pacer.stepped()
        steps += 1
      }
      expect(steps).toBe(1)
      expect(pacer.finish(false)).toBeCloseTo(1, 9)
    }
  })

  it('forgets what it learned on reset', () => {
    const { pacer } = run(90, 200)
    expect(pacer.period).toBeGreaterThan(0)
    pacer.reset()
    expect(pacer.period).toBe(0)
    expect(pacer.accumulator).toBe(0)
  })
})
