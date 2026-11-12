/** Press counters: no lost or doubled actions between 30 Hz samples (DESIGN §18), movement edges. */
import { describe, expect, it } from 'vitest'
import { BTN } from '../src/sim/types'
import { rig } from './sim-helpers'

/** Steps two ticks per input sample (30 Hz) like a guest. */
const sample = (r: ReturnType<typeof rig>, n = 1) => r.step(2 * n)

describe('press counters', () => {
  it('several taps inside one sample all fire, once each', () => {
    const r = rig({ r: ['bee'] })
    sample(r)
    r.input().presses.r += 3
    sample(r, 60)
    expect(r.of('fire').length).toBe(3)
    // Re-sending the same counter never fires again.
    sample(r, 30)
    expect(r.of('fire').length).toBe(3)
  })

  it('a hold across many samples is one press for press-only antiques', () => {
    const r = rig({ r: ['pillbug'] })
    sample(r)
    r.input().presses.r++
    r.input().held = BTN.R
    sample(r, 120)
    expect(r.of('fire').length).toBe(1)
  })

  it('hold-type taps between samples still fire exactly once (owl, swallow, hippo)', () => {
    for (const item of ['owl', 'swallow', 'hippo'] as const) {
      const r = rig({ r: [item] })
      sample(r)
      r.input().presses.r++
      sample(r, 90)
      expect(r.of('fire').length).toBe(1)
    }
  })

  it('a release and re-press inside one sample ends the zoom and starts a new one', () => {
    const r = rig({ r: ['owl'] })
    sample(r)
    r.input().presses.r++
    r.input().held = BTN.R
    sample(r, 20)
    expect(r.of('fire').length).toBe(0)
    // Released and pressed again between samples: still held, counter +1.
    r.input().presses.r++
    sample(r, 90)
    expect(r.of('fire').length).toBe(1)
    r.input().held = 0
    sample(r, 2)
    expect(r.of('fire').length).toBe(2)
  })

  it('jump and dash counters act once per press', () => {
    const r = rig({ r: ['bee'] })
    sample(r)
    r.input().presses.jump++
    sample(r, 60)
    expect(r.of('jump').length).toBe(1)
    r.input().presses.dash++
    sample(r, 60)
    expect(r.of('dash').length).toBe(1)
    sample(r, 60)
    expect(r.of('dash').length).toBe(1)
  })

  it('cat double jump uses a second press in the air', () => {
    const r = rig({ r: ['bee'], species: 'cat' })
    sample(r)
    r.input().presses.jump++
    sample(r, 10)
    r.input().presses.jump++
    sample(r, 4)
    expect(r.of('jump').map((e) => e.air)).toEqual([false, true])
    r.input().presses.jump++
    sample(r, 4)
    expect(r.of('jump').length).toBe(2)
  })

  it('a counter that goes backwards resynchronises without acting', () => {
    const r = rig({ r: ['bee'] })
    r.input().presses.r = 10
    sample(r, 60)
    const n = r.of('fire').length
    r.input().presses.r = 2
    sample(r, 30)
    expect(r.of('fire').length).toBe(n)
    r.input().presses.r = 3
    sample(r, 30)
    expect(r.of('fire').length).toBe(n + 1)
  })

  it('sanitizes hostile inputs field by field', () => {
    const r = rig({ r: ['bee'] })
    const bad = r.input() as unknown as Record<string, unknown>
    bad.mx = Infinity
    bad.mz = 'x'
    bad.yaw = NaN
    bad.pitch = 99
    bad.held = -1
    bad.selR = 1e9
    bad.shoulder = 5
    sample(r, 5)
    const p = r.player()
    expect(Number.isFinite(p.p[0])).toBe(true)
    expect(p.pitch).toBeCloseTo(1.35, 6)
    expect(p.shoulder).toBe(1)
  })
})

describe('movement', () => {
  it('jumps ≈ 2.5 m (rabbit ≈ 3.4 m) and dashes 0.2 s at 21 m/s with a cooldown', () => {
    for (const [species, h] of [
      ['shiba', 2.54],
      ['rabbit', 3.43]
    ] as const) {
      const r = rig({ r: ['bee'], species })
      r.step(2)
      r.input().presses.jump++
      let top = 0
      for (let i = 0; i < 60; i++) {
        r.step(1)
        top = Math.max(top, r.player().p[1])
      }
      expect(top).toBeCloseTo(h, 0)
    }
    const r = rig({ r: ['bee'] })
    r.step(2)
    const p = r.player()
    const a0 = p.anima
    r.input().presses.dash++
    r.step(13)
    expect(p.p[2] - -10).toBeGreaterThan(3.8)
    expect(a0 - p.anima).toBeCloseTo(0.5, 3)
    r.input().presses.dash++
    r.step(10)
    expect(r.of('dash').length).toBe(1)
  })

  it('penguins belly-slide twice as far for free; shiba dash cooldown is 30 % shorter', () => {
    const r = rig({ r: ['bee'], species: 'penguin' })
    r.step(2)
    const a0 = r.player().anima
    r.input().presses.dash++
    r.step(60)
    expect(r.of('dash')[0].slide).toBe(true)
    expect(r.player().p[2] - -10).toBeGreaterThan(7.5)
    expect(r.player().anima).toBe(a0)
    const s = rig({ r: ['bee'], species: 'shiba' })
    s.step(2)
    s.input().presses.dash++
    s.step(1)
    expect(s.player().dashReadyAt - s.sim.time).toBeCloseTo(0.63, 1)
  })

  it('fox dashes leave a leaf decoy for 1.5 s', () => {
    const r = rig({ r: ['bee'], species: 'fox' })
    r.step(2)
    r.input().presses.dash++
    r.step(2)
    expect(r.sim.props.filter((x) => x.kind === 'leafDecoy').length).toBe(1)
    r.step(95)
    expect(r.sim.props.filter((x) => x.kind === 'leafDecoy').length).toBe(0)
  })

  it('a buffered jump pressed just before landing still happens (jump buffer)', () => {
    const r = rig({ r: ['bee'] })
    r.step(2)
    r.input().presses.jump++
    r.step(3)
    // Falling back: press 3 ticks before landing.
    for (let i = 0; i < 120 && !(r.player().v[1] < 0 && r.player().p[1] < 0.6); i++) r.step(1)
    r.input().presses.jump++
    r.step(30)
    expect(r.of('jump').length).toBe(2)
  })
})
