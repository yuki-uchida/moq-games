import { describe, expect, test } from 'vitest'
import { HorrorMatch, ScreamMeter } from '../src/match'

describe('HorrorMatch', () => {
  test('runs two 15-minute rounds with an explicit survivor swap', () => {
    const match = new HorrorMatch()
    expect(match.getSnapshot()).toEqual({
      phase: 'lobby',
      survivor: 'host',
      elapsedMs: 0,
      scores: { host: 0, guest: 0 },
      paused: false
    })
    match.startSecondRound()
    match.start()
    match.tick(899_999)
    expect(match.getSnapshot()).toMatchObject({ phase: 'round1', survivor: 'host', elapsedMs: 899_999 })
    match.tick(100_000)
    match.tick(900_000)
    expect(match.getSnapshot()).toMatchObject({ phase: 'intermission', survivor: 'host', elapsedMs: 900_000 })
    match.startSecondRound()
    expect(match.getSnapshot()).toMatchObject({ phase: 'round2', survivor: 'guest', elapsedMs: 0 })
    match.start()
    match.tick(900_000)
    match.startSecondRound()
    expect(match.getSnapshot()).toMatchObject({ phase: 'finished', survivor: 'guest', elapsedMs: 900_000 })
  })

  test('accepts only valid penalties for the active survivor', () => {
    const match = new HorrorMatch()
    match.addPenalty('host', 3)
    match.start()
    match.addPenalty('guest', 5)
    for (const value of [-1, NaN, Infinity, -Infinity]) match.addPenalty('host', value)
    match.addPenalty('host', 2.5)
    match.tick(900_000)
    match.addPenalty('host', 10)
    match.startSecondRound()
    match.addPenalty('host', 10)
    match.addPenalty('guest', 4)
    match.tick(900_000)
    match.addPenalty('guest', 10)
    expect(match.getSnapshot().scores).toEqual({ host: -2.5, guest: -4 })
  })

  test('pauses time and penalties and rejects invalid ticks', () => {
    const match = new HorrorMatch()
    match.start()
    for (const value of [-1, NaN, Infinity, -Infinity]) match.tick(value)
    match.tick(100)
    match.pause()
    match.tick(900_000)
    match.addPenalty('host', 2)
    expect(match.getSnapshot()).toMatchObject({ phase: 'round1', elapsedMs: 100, paused: true, scores: { host: 0 } })
    match.resume()
    match.tick(1)
    expect(match.getSnapshot()).toMatchObject({ elapsedMs: 101, paused: false })
  })

  test('returns snapshots without exposing internal state', () => {
    const match = new HorrorMatch()
    const snapshot = match.getSnapshot()
    snapshot.phase = 'finished'
    snapshot.scores.host = 100
    expect(match.getSnapshot()).toMatchObject({ phase: 'lobby', scores: { host: 0 } })
  })
})

describe('ScreamMeter', () => {
  test('qualifies integer-ms partitions and every ordering at exactly 300 ms once', () => {
    for (const parts of [
      [16, 141, 143],
      [18, 141, 141],
      [1, 1, 298],
      [17, 83, 200],
      [100, 100, 100]
    ]) {
      for (const order of [
        [0, 1, 2],
        [0, 2, 1],
        [1, 0, 2],
        [1, 2, 0],
        [2, 0, 1],
        [2, 1, 0]
      ]) {
        const meter = new ScreamMeter()
        expect(meter.sample(0.5, parts[order[0]] / 1000)).toBe(0)
        expect(meter.sample(0.5, parts[order[1]] / 1000)).toBe(0)
        expect(meter.sample(0.5, parts[order[2]] / 1000)).toBeCloseTo(0.15, 14)
        expect(meter.sample(0.8, 0.01)).toBeCloseTo(0.008, 14)
        expect(meter.sample(0, 0.171)).toBe(0)
      }
    }
  })

  test.each([0.299999, 0.3, 0.300001])('respects the duration boundary at %s seconds', (duration) => {
    const meter = new ScreamMeter()
    expect(meter.sample(0.5, duration)).toBe(duration < 0.3 ? 0 : 0.5 * duration)
    expect(meter.sample(0, 0.1)).toBe(0)
    expect(meter.sample(0.5, 0.01)).toBe(0)
  })

  test('limits the comparison tolerance to the adjacent representable duration below 0.3', () => {
    expect(new ScreamMeter().sample(0.5, 0.29999999999999993)).toBeGreaterThan(0)
    expect(new ScreamMeter().sample(0.5, 0.2999999999999999)).toBe(0)
  })

  test.each([3000, 30000])('stabilizes %i small increments with changing volume', (count) => {
    const meter = new ScreamMeter()
    const delta = 0.3 / count
    for (let index = 0; index < count - 1; index++) {
      expect(meter.sample(index % 2 === 0 ? 0.2 : 0.8, delta)).toBe(0)
    }
    expect(meter.sample(0.8, delta)).toBeCloseTo(0.15, 12)
    expect(meter.sample(0.4, delta)).toBeCloseTo(0.4 * delta, 14)
  })

  test('integrates varying volume and preserves pending state on zero delta', () => {
    const meter = new ScreamMeter()
    expect(meter.sample(0.2, 0.016)).toBe(0)
    expect(meter.sample(0, 0)).toBe(0)
    expect(meter.sample(0.5, 0.141)).toBe(0)
    expect(meter.sample(0.8, 0.143)).toBeCloseTo(0.1881, 14)
    expect(meter.sample(0.9, 0)).toBe(0)
    expect(meter.sample(0.2, 0.02)).toBeCloseTo(0.004, 14)
  })

  test('discards pending sums and compensation on reset, silence and invalid input', () => {
    for (const interrupt of [
      (meter: ScreamMeter) => meter.reset(),
      (meter: ScreamMeter) => meter.sample(0, 0.01),
      ...[NaN, Infinity, -Infinity, -1].flatMap((invalid) => [
        (meter: ScreamMeter) => meter.sample(invalid, 0.01),
        (meter: ScreamMeter) => meter.sample(1, invalid)
      ])
    ]) {
      const meter = new ScreamMeter()
      expect(meter.sample(0.5, 0.018)).toBe(0)
      expect(meter.sample(0.8, 0.141)).toBe(0)
      interrupt(meter)
      expect(meter.sample(0.2, 0.141)).toBe(0)
      expect(meter.sample(0.5, 0.018)).toBe(0)
      expect(meter.sample(0.8, 0.141)).toBeCloseTo(0.15, 14)
    }
  })

  test('rejects point overflow and tolerates subnormal and very large finite deltas', () => {
    const meter = new ScreamMeter()
    expect(meter.sample(1, Number.MIN_VALUE)).toBe(0)
    expect(meter.sample(0.5, 0.3)).toBeCloseTo(0.15, 14)
    expect(meter.sample(2, Number.MAX_VALUE)).toBe(0)
    expect(meter.sample(0.5, 0.1)).toBe(0)
    meter.reset()
    expect(meter.sample(0.1, Number.MAX_VALUE)).toBe(0.1 * Number.MAX_VALUE)
    expect(meter.sample(0.1, Number.MAX_VALUE)).toBe(0.1 * Number.MAX_VALUE)
    expect(meter.sample(1, Number.MIN_VALUE)).toBe(Number.MIN_VALUE)
    expect(meter.sample(0.5, 0.01)).toBe(0.005)
  })

  test('scores sustained loud sound by volume and duration, not short bursts', () => {
    const meter = new ScreamMeter(0.2)
    expect(meter.sample(0.1, 1)).toBe(0)
    expect(meter.sample(0.5, 0.1)).toBe(0)
    expect(meter.sample(0.1, 0.1)).toBe(0)
    expect(meter.sample(0.5, 0.2)).toBe(0)
    expect(meter.sample(0.5, 0.1)).toBeCloseTo(0.15)
    expect(meter.sample(0.8, 0.5)).toBeCloseTo(0.4)
    meter.reset()
    expect(meter.sample(0.8, 0.1)).toBe(0)
  })

  test('invalid input cannot score or bridge separate sounds', () => {
    const meter = new ScreamMeter()
    for (const [rms, duration] of [
      [NaN, 1],
      [Infinity, 1],
      [-1, 1],
      [1, NaN],
      [1, Infinity],
      [1, -1]
    ]) {
      expect(meter.sample(1, 0.2)).toBe(0)
      expect(meter.sample(rms, duration)).toBe(0)
      expect(meter.sample(1, 0.1)).toBe(0)
      meter.reset()
    }
    expect(new ScreamMeter(NaN).sample(0.01, 1)).toBe(0)
  })
})
