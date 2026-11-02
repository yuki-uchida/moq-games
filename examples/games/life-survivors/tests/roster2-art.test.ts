import { describe, expect, it } from 'vitest'
import { PALETTE } from '../src/art/palette'
import { ROSTER2_NO_FLIP, roster2Sheets } from '../src/art/roster2'

const IDS = [
  'mosquito',
  'vaccine',
  'dog',
  'pepper',
  'homework',
  'worksheet',
  'dodgeball',
  'pimple',
  'crush',
  'senpai',
  'drinking',
  'scholarship'
]

describe('roster2 enemy art', () => {
  it('has every id and every no-flip id is a roster id', () => {
    for (const id of IDS) expect(roster2Sheets[`enemy:${id}`]).toBeTypeOf('function')
    for (const id of ROSTER2_NO_FLIP) expect(IDS).toContain(id)
  })

  for (const id of IDS)
    it(`enemy:${id} meets the sprite constraints`, () => {
      const a = roster2Sheets[`enemy:${id}`]().move
      expect(a.loop).toBe(true)
      expect(a.frames.length).toBeGreaterThanOrEqual(4)
      expect(a.frames.length).toBeLessThanOrEqual(6)
      expect(a.fps).toBeGreaterThanOrEqual(6)
      expect(a.fps).toBeLessThanOrEqual(14)
      const b = roster2Sheets[`enemy:${id}`]().move
      a.frames.forEach((frame, i) => {
        expect([frame.w, frame.h]).toEqual([64, 64])
        let lowest = -1
        frame.data.forEach((c, k) => {
          expect(c).toBeLessThan(PALETTE.length)
          if (c) lowest = Math.max(lowest, Math.floor(k / 64))
        })
        expect(lowest).toBeGreaterThan(0)
        expect(lowest).toBeLessThanOrEqual(58)
        expect(Array.from(frame.data)).toEqual(Array.from(b.frames[i].data))
      })
    })
})
