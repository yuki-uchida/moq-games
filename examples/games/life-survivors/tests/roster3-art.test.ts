import { describe, expect, test } from 'vitest'
import { PALETTE } from '../src/art/palette'
import { ROSTER3_NO_FLIP, roster3Sheets } from '../src/art/roster3'

const IDS = [
  'deadline',
  'meeting',
  'spam',
  'powerhara',
  'train',
  'tax',
  'coin',
  'nightcry',
  'backpain',
  'scam',
  'forget',
  'loneliness'
]

describe('roster3 enemy art', () => {
  test.each(IDS)('%s sheet is well formed and deterministic', (id) => {
    const make = roster3Sheets[`enemy:${id}`]
    expect(make).toBeDefined()
    const a = make().move
    const b = make().move
    expect(a.loop).toBe(true)
    expect(a.fps).toBeGreaterThanOrEqual(6)
    expect(a.fps).toBeLessThanOrEqual(14)
    expect(a.frames.length).toBeGreaterThanOrEqual(4)
    expect(a.frames.length).toBeLessThanOrEqual(6)
    a.frames.forEach((frame, i) => {
      expect([frame.w, frame.h]).toEqual([64, 64])
      let lowest = -1
      frame.data.forEach((c, k) => {
        expect(c).toBeLessThan(PALETTE.length)
        if (c) lowest = Math.max(lowest, Math.floor(k / 64))
      })
      expect(lowest).toBeGreaterThan(8)
      expect(lowest).toBeLessThanOrEqual(58)
      expect(Array.from(frame.data)).toEqual(Array.from(b.frames[i].data))
    })
  })
  test('no-flip ids are real', () => {
    for (const id of ROSTER3_NO_FLIP) expect(IDS).toContain(id)
  })
})
