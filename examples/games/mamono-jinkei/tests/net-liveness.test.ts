/** Hidden-tab timing: fixed steps with a capped backlog, host silence levels, neutral inputs and the host clock. */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { HostClock } from '../src/client/host-clock'
import {
  BACKGROUND_BACKLOG,
  FRAME_BACKLOG,
  FixedStep,
  HOST_LONG_STALL,
  HOST_STALL,
  STEP,
  hostSilence,
  neutralInput
} from '../src/net/liveness'
import { NO_INPUT, type NetInput } from '../src/sim/types'

describe('FixedStep', () => {
  test('turns irregular intervals into whole 60 Hz steps and keeps the remainder', () => {
    const f = new FixedStep()
    let steps = 0
    for (let i = 0; i < 100; i++) steps += f.advance(0.01, FRAME_BACKLOG)
    expect(steps).toBe(60)
    expect(f.advance(STEP * 3, FRAME_BACKLOG)).toBe(3)
  })

  test('a long gap is capped so catching up never spirals', () => {
    const f = new FixedStep()
    expect(f.advance(5, FRAME_BACKLOG)).toBe(6)
    expect(f.advance(5, BACKGROUND_BACKLOG)).toBe(60)
    expect(f.advance(0, BACKGROUND_BACKLOG)).toBe(0)
    expect(f.advance(Number.NaN, BACKGROUND_BACKLOG)).toBe(0)
    expect(f.advance(-1, BACKGROUND_BACKLOG)).toBe(0)
  })

  test('throttled 1 s pulses still advance the world at full speed', () => {
    const f = new FixedStep()
    let steps = 0
    for (let i = 0; i < 15; i++) steps += f.advance(1, BACKGROUND_BACKLOG)
    expect(steps).toBe(900)
  })
})

describe('host silence', () => {
  test('a short gap is live, then the guest waits, and only a long one offers leaving', () => {
    expect(hostSilence(0)).toBe('live')
    expect(hostSilence(HOST_STALL)).toBe('live')
    expect(hostSilence(HOST_STALL + 0.1)).toBe('waiting')
    expect(hostSilence(HOST_LONG_STALL)).toBe('waiting')
    expect(hostSilence(HOST_LONG_STALL + 0.1)).toBe('long')
  })
})

describe('neutralInput', () => {
  test('lets go of movement and held buttons but keeps counters, aim and name', () => {
    const held: NetInput = {
      ...NO_INPUT,
      mx: 1,
      my: -0.5,
      aim: 1.25,
      attackHeld: true,
      actionHeld: true,
      interactHeld: true,
      attackPresses: 4,
      attackReleases: 3,
      actionPresses: 2,
      interactPresses: 7,
      switchPresses: 1,
      modePresses: 5,
      signalPresses: 6,
      name: 'ぷる',
      menu: true,
      job: 'mage',
      hero: { slot: 1, x: 10, y: 20, z: 0, vx: 1, vy: 0, facing: 0, seq: 0 } as NetInput['hero']
    }
    const n = neutralInput(held)
    expect(n).toMatchObject({ mx: 0, my: 0, attackHeld: false, actionHeld: false, interactHeld: false })
    expect(n).toMatchObject({
      aim: 1.25,
      attackPresses: 4,
      attackReleases: 3,
      actionPresses: 2,
      interactPresses: 7,
      switchPresses: 1,
      modePresses: 5,
      signalPresses: 6,
      name: 'ぷる',
      menu: true
    })
    expect(n.hero).toBeUndefined()
    expect(n.job).toBeUndefined()
    // The original is untouched.
    expect(held.mx).toBe(1)
    expect(held.hero).toBeDefined()
  })

  test('an input without interactHeld stays without it', () => {
    expect('interactHeld' in neutralInput({ ...NO_INPUT, mx: 1 })).toBe(false)
  })
})

describe('HostClock', () => {
  afterEach(() => vi.useRealTimers())

  test('pulses real elapsed seconds while running (main-thread fallback without workers)', () => {
    vi.useFakeTimers()
    let now = 1000
    const ticks: number[] = []
    const clock = new HostClock(
      (dt) => ticks.push(dt),
      () => now
    )
    clock.start()
    expect(clock.running).toBe(true)
    for (let i = 0; i < 3; i++) {
      now += 50
      vi.advanceTimersByTime(17)
    }
    expect(ticks.length).toBe(3)
    for (const dt of ticks) expect(dt).toBeCloseTo(0.05)
    clock.stop()
    now += 50
    vi.advanceTimersByTime(100)
    expect(ticks.length).toBe(3)
    // Restarting measures from the restart, not from the stop.
    now += 10_000
    clock.start()
    now += 20
    vi.advanceTimersByTime(17)
    expect(ticks[3]).toBeCloseTo(0.02)
    clock.dispose()
  })
})
