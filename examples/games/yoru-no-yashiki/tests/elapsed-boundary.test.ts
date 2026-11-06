import { describe, expect, it } from 'vitest'
import { HorrorMatch, ScreamMeter } from '../src/match'
import { createRitualState, isRitualStateForMatch } from '../src/ritual'
import { freshSnapshot, ritualForMatch } from '../src/sync'

const limit = 900000
const ulp = 2 ** -33

function running(night: number) {
  const match = new HorrorMatch()
  match.start()
  if (night === 2) {
    match.tick(limit)
    match.startSecondRound()
  }
  return match
}

function observe(match: HorrorMatch, duration: number) {
  match.observe(new ScreamMeter(), 0, 0, duration)
}

function active(night: number) {
  return night === 1 ? 'round1' : 'round2'
}
function ended(night: number) {
  return night === 1 ? 'intermission' : 'finished'
}

describe.each([1, 2])('independent elapsed contract night %i', (night) => {
  it('normal integer control reaches the exact boundary and stays finished', () => {
    const match = running(night)
    match.tick(limit - 1)
    observe(match, 0.75)
    expect(match.getSnapshot()).toMatchObject({ phase: active(night), elapsedMs: limit - 0.25 })
    observe(match, 0.25)
    const finished = match.getSnapshot()
    expect(finished).toMatchObject({ phase: ended(night), elapsedMs: limit })
    match.tick(Number.MAX_VALUE)
    observe(match, Number.MAX_VALUE)
    expect(match.getSnapshot()).toEqual(finished)
  })

  it.each([0.5, 0.75, 0.875])('observe fraction %s ULP never publishes an active limit', (fraction) => {
    const match = running(night)
    match.tick(limit - ulp)
    observe(match, ulp * fraction)
    const snapshot = match.getSnapshot()
    expect(snapshot.phase).toBe(active(night))
    expect(snapshot.elapsedMs).toBe(limit - ulp)
    expect(isRitualStateForMatch(createRitualState(snapshot), snapshot)).toBe(true)
    expect(ritualForMatch(null, snapshot)).toEqual({ round: active(night), completed: 0 })
    observe(match, ulp * (1 - fraction))
    expect(match.getSnapshot()).toMatchObject({ phase: ended(night), elapsedMs: limit })
  })

  it.each([0.5, 0.75, 0.875])('tick fraction %s ULP cannot finish early', (fraction) => {
    const match = running(night)
    match.tick(limit - ulp)
    match.tick(ulp * fraction)
    expect(match.getSnapshot()).toMatchObject({ phase: active(night), elapsedMs: limit - ulp })
    match.tick(ulp * (1 - fraction))
    expect(match.getSnapshot()).toMatchObject({ phase: ended(night), elapsedMs: limit })
  })

  it('zero tick does not erase the sub-ULP credit retained by observe', () => {
    const match = running(night)
    match.tick(limit - ulp)
    observe(match, ulp / 4)
    const before = match.getSnapshot()
    match.tick(0)
    expect(match.getSnapshot()).toEqual(before)
    observe(match, (ulp * 3) / 4)
    expect(match.getSnapshot()).toMatchObject({ phase: ended(night), elapsedMs: limit })
  })

  it('mixed quarter-ULP updates preserve monotonic public snapshots and cross exactly', () => {
    const match = running(night)
    match.tick(limit - 4 * ulp)
    let previous = match.getSnapshot()
    for (let index = 0; index < 16; index++) {
      if (index % 2 === 0) observe(match, ulp / 4)
      else match.tick(ulp / 4)
      const current = match.getSnapshot()
      expect(current.elapsedMs).toBeGreaterThanOrEqual(previous.elapsedMs)
      expect(freshSnapshot(previous, current, index, index + 1)).toBe(true)
      if (index < 15) {
        expect(current.phase).toBe(active(night))
        expect(current.elapsedMs).toBeLessThan(limit)
      }
      previous = current
    }
    expect(previous).toMatchObject({ phase: ended(night), elapsedMs: limit })
  })

  it('pause ignores finite extremes and resume retains the exact unfinished remainder', () => {
    const match = running(night)
    match.tick(limit - ulp)
    observe(match, ulp / 4)
    match.pause()
    const paused = match.getSnapshot()
    match.tick(Number.MAX_VALUE)
    match.observe(new ScreamMeter(), Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_VALUE)
    expect(match.getSnapshot()).toEqual(paused)
    match.resume()
    match.tick(ulp / 4)
    expect(match.getSnapshot().phase).toBe(active(night))
    observe(match, ulp / 2)
    expect(match.getSnapshot()).toMatchObject({ phase: ended(night), elapsedMs: limit, paused: false })
  })

  it.each([Number.MAX_VALUE, 1e300, limit, limit + ulp])('large finite tick %s clips without overflow', (delta) => {
    const match = running(night)
    match.tick(delta)
    expect(match.getSnapshot()).toMatchObject({ phase: ended(night), elapsedMs: limit, scores: { host: 0, guest: 0 } })
  })

  it('huge finite signed endpoints clip correctly without subtracting as Number', () => {
    const match = running(night)
    match.observe(new ScreamMeter(), 0, -Number.MAX_VALUE, Number.MAX_VALUE)
    expect(match.getSnapshot()).toMatchObject({ phase: ended(night), elapsedMs: limit })
  })

  it('micro finite tick and signed observations retain subnormal time', () => {
    const match = running(night)
    match.tick(Number.MIN_VALUE)
    match.observe(new ScreamMeter(), 0, -Number.MIN_VALUE, Number.MIN_VALUE)
    expect(match.getSnapshot()).toMatchObject({ phase: active(night), elapsedMs: 3 * Number.MIN_VALUE })
  })

  it.each([-1, -Number.MIN_VALUE, NaN, Infinity, -Infinity])('invalid tick %s is a public no-op', (delta) => {
    const match = running(night)
    observe(match, 123.125)
    const before = match.getSnapshot()
    match.tick(delta)
    expect(match.getSnapshot()).toEqual(before)
  })

  it.each([
    [1, 0],
    [NaN, 0],
    [0, Infinity],
    [-Infinity, 0]
  ])('invalid observation [%s,%s] cannot advance time', (start, end) => {
    const match = running(night)
    const before = match.getSnapshot()
    match.observe(new ScreamMeter(), 0.5, start, end)
    expect(match.getSnapshot()).toEqual(before)
  })

  it('ten binary representations of 0.1 round to exactly one millisecond', () => {
    const match = running(night)
    for (let index = 0; index < 10; index++) match.tick(0.1)
    expect(match.getSnapshot().elapsedMs).toBe(1)
  })

  it('dyadic splits and decimal endpoint splits agree with unsplit endpoints', () => {
    const dyadic = running(night)
    for (let index = 0; index < 8; index++) dyadic.tick(0.125)
    expect(dyadic.getSnapshot().elapsedMs).toBe(1)
    const split = running(night)
    observe(split, 0.1)
    split.observe(new ScreamMeter(), 0, 0.1, 0.3)
    const unsplit = running(night)
    observe(unsplit, 0.3)
    expect(split.getSnapshot()).toEqual(unsplit.getSnapshot())
  })

  it('does not mislabel unequal decimal binary sums as partition invariance', () => {
    const split = running(night)
    split.tick(0.1)
    split.tick(0.2)
    const unsplit = running(night)
    unsplit.tick(0.3)
    expect(split.getSnapshot().elapsedMs).toBe(0.30000000000000004)
    expect(unsplit.getSnapshot().elapsedMs).toBe(0.3)
  })

  it('snapshot reads are repeatable and cannot mutate internal state or scores', () => {
    const match = running(night)
    observe(match, 123.125)
    const previous = match.getSnapshot()
    const mutated = match.getSnapshot()
    mutated.elapsedMs = limit
    mutated.phase = 'finished'
    mutated.scores.host = -123
    expect(match.getSnapshot()).toEqual(previous)
  })
})

describe('independent elapsed legacy contracts', () => {
  it('lobby ignores input and second night is an intentional elapsed reset', () => {
    const match = new HorrorMatch()
    match.tick(Number.MAX_VALUE)
    observe(match, Number.MAX_VALUE)
    expect(match.getSnapshot()).toMatchObject({ phase: 'lobby', elapsedMs: 0 })
    match.start()
    match.addPenalty('host', 1.5)
    match.tick(limit)
    match.startSecondRound()
    expect(match.getSnapshot()).toMatchObject({
      phase: 'round2',
      survivor: 'guest',
      elapsedMs: 0,
      scores: { host: -1.5, guest: 0 }
    })
    match.addPenalty('host', 1)
    match.addPenalty('guest', 2.5)
    match.tick(limit)
    expect(match.getSnapshot()).toMatchObject({
      phase: 'finished',
      elapsedMs: limit,
      scores: { host: -1.5, guest: -2.5 }
    })
  })

  it('qualified meter scoring and survivor identity stay unchanged across both nights', () => {
    const match = running(1)
    for (const night of [1, 2]) {
      const meter = new ScreamMeter()
      match.observe(meter, 0.5, 0, 100)
      expect(match.getSnapshot().scores[night === 1 ? 'host' : 'guest']).toBe(0)
      match.observe(meter, 0.5, 100, 300)
      expect(match.getSnapshot().scores[night === 1 ? 'host' : 'guest']).toBe(-0.15)
      match.tick(limit)
      if (night === 1) match.startSecondRound()
    }
    expect(match.getSnapshot().scores).toEqual({ host: -0.15, guest: -0.15 })
  })
})
