import { describe, expect, test } from 'vitest'
import { BOSSES2_NO_FLIP, bosses2Sheets, bulletSheet } from '../src/art/bosses2'
import { PALETTE } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const BOSSES = ['b_vaccine', 'b_heartbreak', 'b_tax', 'b_care']
const BULLETS = [
  'seed',
  'ball',
  'beer',
  'shout',
  'wail',
  'b_hs',
  'b_univ',
  'b_shukatsu',
  'b_wedding',
  'b_mortgage',
  'b_rebel',
  'b_layoff',
  'b_illness',
  'b_vaccine',
  'b_heartbreak',
  'b_tax',
  'b_care'
]
const lowest = (f: Raster) => {
  let y = -1
  f.map((c, _x, row) => ((y = Math.max(y, row)), c))
  return y
}
const hash = (rs: Raster[]) => rs.map((r) => Array.from(r.data).join(',')).join('|')

describe('bosses2 art', () => {
  test('bosses have 4-6 frames of 128x128 standing on the ground', () => {
    for (const id of BOSSES) {
      const move = bosses2Sheets[`enemy:${id}`]().move
      expect(move.frames.length).toBeGreaterThanOrEqual(4)
      expect(move.frames.length).toBeLessThanOrEqual(6)
      expect(move.loop).toBe(true)
      for (const f of move.frames) {
        expect([id, f.w, f.h]).toEqual([id, 128, 128])
        expect(lowest(f)).toBeLessThanOrEqual(120)
        expect(lowest(f)).toBeGreaterThanOrEqual(116)
        expect(f.data.every((c) => c < PALETTE.length)).toBe(true)
      }
    }
    expect(BOSSES2_NO_FLIP).toContain('b_tax')
  })

  test('every bullet kind has 2-4 looping 16x16 frames, palette only, deterministic', () => {
    const a = bulletSheet()
    const b = bulletSheet()
    for (const k of BULLETS) {
      expect(a[k], k).toBeDefined()
      expect(a[k].loop).toBe(true)
      expect(a[k].frames.length).toBeGreaterThanOrEqual(2)
      expect(a[k].frames.length).toBeLessThanOrEqual(4)
      for (const f of a[k].frames) {
        expect([k, f.w, f.h]).toEqual([k, 16, 16])
        expect(f.data.some((c) => c > 0)).toBe(true)
        expect(f.data.every((c) => c < PALETTE.length)).toBe(true)
      }
      expect(hash(a[k].frames)).toBe(hash(b[k].frames))
    }
    expect(hash(bosses2Sheets['enemy:b_care']().move.frames)).toBe(hash(bosses2Sheets['enemy:b_care']().move.frames))
  })
})
