import { describe, expect, it } from 'vitest'
import { HorrorMatch, ScreamMeter } from '../src/match'

function running(threshold = 0.1) {
  const match = new HorrorMatch()
  match.start()
  return { match, meter: new ScreamMeter(threshold) }
}

describe('endpoint exact scoring', () => {
  it('accumulates numeric penalties without losing small finite increments', () => {
    const { match } = running()
    for (let index = 0; index < 90000; index++) match.addPenalty('host', 0.005)
    expect(match.getSnapshot().scores.host).toBe(-450)
  })

  for (const step of [10, 17, 20, 0.125]) {
    it.each([step])(
      'integrates identical endpoints and changing RMS with %s ms steps',
      (step) => {
        const { match, meter } = running()
        let now = 1000.125
        for (const rms of [0.125, 0.375, 0.625]) {
          const end = now + 300000
          while (now < end) {
            const next = Math.min(end, now + step)
            match.observe(meter, rms, now, next)
            now = next
          }
        }
        expect(match.getSnapshot()).toMatchObject({
          phase: 'intermission',
          elapsedMs: 900000,
          scores: { host: -337.5, guest: 0 }
        })
      },
      step === 0.125 ? 300000 : undefined
    )
  }

  it('keeps each player separate and retains qualified scores across pause and re-preparation', () => {
    const { match, meter } = running()
    match.observe(meter, 0.5, 500.25, 600.25)
    expect(match.getSnapshot().scores.host).toBe(0)
    match.pause()
    meter.reset()
    match.observe(meter, 1, 600.25, 900.25)
    match.resume()
    match.observe(meter, 0.5, 900.25, 1200.25)
    expect(match.getSnapshot().scores.host).toBe(-0.15)
    match.observe(meter, 0, 1200.25, 1300.25)
    match.observe(meter, 1, 1300.25, 1500.25)
    expect(match.getSnapshot().scores.host).toBe(-0.15)
    meter.reset()
    match.tick(900000)
    match.startSecondRound()
    match.observe(meter, 0.75, 2000.25, 2300.25)
    expect(match.getSnapshot().scores).toEqual({ host: -0.15, guest: -0.225 })
    expect(new HorrorMatch().getSnapshot().scores).toEqual({ host: 0, guest: 0 })
  })

  it('clips a qualified final interval to exactly 50ms and rejects post-finish samples', () => {
    const { match, meter } = running()
    match.observe(meter, 0.5, 0, 300)
    match.tick(899650)
    match.observe(meter, 0.5, 300, 800)
    expect(match.getSnapshot()).toMatchObject({ phase: 'intermission', elapsedMs: 900000, scores: { host: -0.175 } })
    match.observe(meter, 1, 800, 900)
    expect(match.getSnapshot().scores.host).toBe(-0.175)
  })

  it('does not bridge invalid values, silence or reset, but zero duration preserves pending qualification', () => {
    for (const [rms, start, end] of [
      [NaN, 100, 200],
      [Infinity, 100, 200],
      [-1, 100, 200],
      [1, NaN, 200],
      [1, 100, Infinity],
      [1, 200, 100],
      [0, 100, 200]
    ]) {
      const { match, meter } = running()
      match.observe(meter, 0.5, 0, 200)
      match.observe(meter, rms, start, end)
      match.observe(meter, 0.5, 200, 300)
      expect(match.getSnapshot().scores.host).toBe(0)
    }
    const { match, meter } = running()
    match.observe(meter, 0.5, -100, 100)
    match.observe(meter, 0, 100, 100)
    match.observe(meter, 0.5, 100, 200)
    expect(match.getSnapshot().scores.host).toBe(-0.15)
    for (const [end, qualifies] of [
      [299.99999999999994, true],
      [299.9999999999999, false],
      [299.999, false],
      [300, true]
    ] as const) {
      const boundary = running()
      boundary.match.observe(boundary.meter, 0.5, 0, end)
      expect(boundary.match.getSnapshot().scores.host < 0).toBe(qualifies)
    }
  })

  it.each([
    [500, 0],
    [1000, 1],
    [1500, 2],
    [2500, 2],
    [3500, 4]
  ])('rounds subnormal %sms once with ties to even', (milliseconds, units) => {
    const { match, meter } = running(Number.MIN_VALUE)
    match.observe(meter, Number.MIN_VALUE, 0, milliseconds)
    expect(match.getSnapshot().scores.host).toBe(units === 0 ? 0 : -units * Number.MIN_VALUE)
  })

  it('retains tiny exact contributions until they round to a subnormal and preserves raw -MIN_VALUE versus zero', () => {
    const { match, meter } = running(Number.MIN_VALUE)
    match.observe(meter, Number.MIN_VALUE, 0, 300)
    expect(match.getSnapshot().scores.host).toBe(0)
    match.observe(meter, Number.MIN_VALUE, 300, 1000)
    expect(match.getSnapshot().scores.host).toBe(-Number.MIN_VALUE)
    expect(match.getSnapshot().scores.host < match.getSnapshot().scores.guest).toBe(true)
    expect(JSON.parse(JSON.stringify(match.getSnapshot())).scores.host).toBe(-Number.MIN_VALUE)
  })

  it('rejects overflow without poisoning later finite observations or allocating unbounded exponents', () => {
    const { match, meter } = running()
    match.observe(meter, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_VALUE)
    expect(match.getSnapshot().scores.host).toBe(0)
    const second = running()
    second.match.observe(second.meter, Number.MAX_VALUE, 0, 500)
    expect(second.match.getSnapshot().scores.host).toBe(-Number.MAX_VALUE / 2)
    second.match.observe(second.meter, Number.MAX_VALUE, 500, 1500)
    expect(second.match.getSnapshot().scores.host).toBe(-Number.MAX_VALUE / 2)
    second.match.addPenalty('host', Infinity)
    expect(second.match.getSnapshot().scores.host).toBe(-Number.MAX_VALUE / 2)
    const edgeValues = [
      Number.MIN_VALUE,
      2 ** -1022 - Number.MIN_VALUE,
      2 ** -1022,
      2 ** -1022 + Number.MIN_VALUE,
      1,
      1 + Number.EPSILON,
      2 ** -500,
      2 ** 500,
      Number.MAX_VALUE
    ]
    const view = new DataView(new ArrayBuffer(8))
    let seed = 0x76543210
    for (let index = 0; index < 1000; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      view.setUint32(0, seed & 0x7fefffff)
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      view.setUint32(4, seed)
      edgeValues.push(view.getFloat64(0))
    }
    for (const value of edgeValues) {
      const roundtrip = running()
      roundtrip.match.addPenalty('host', value)
      expect(roundtrip.match.getSnapshot().scores.host).toBe(-value)
    }
    const overflow = running()
    overflow.match.addPenalty('host', Number.MAX_VALUE)
    overflow.match.addPenalty('host', 2 ** 970)
    expect(overflow.match.getSnapshot().scores.host).toBe(-Number.MAX_VALUE)
    const underflow = running(Number.MIN_VALUE)
    underflow.match.observe(underflow.meter, 2 * Number.MIN_VALUE, 0, 500)
    expect(underflow.match.getSnapshot().scores.host).toBe(-Number.MIN_VALUE)
    expect(Number(2n) * 2 ** -1075).toBe(0)
  })

  it('rounds normal ties to even after accumulating finite number penalties', () => {
    const { match } = running()
    match.addPenalty('host', 1)
    match.addPenalty('host', 2 ** -53)
    expect(match.getSnapshot().scores.host).toBe(-1)
    match.addPenalty('host', 2 ** -53)
    expect(match.getSnapshot().scores.host).toBe(-(1 + Number.EPSILON))
    match.addPenalty('host', 2 ** -53)
    expect(match.getSnapshot().scores.host).toBe(-(1 + 2 * Number.EPSILON))
  })
})
