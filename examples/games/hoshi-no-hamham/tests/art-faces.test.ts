import { describe, expect, test } from 'vitest'
import { allSheetSpecs } from '../src/art/contract'
import { missingAnims, sheet } from '../src/art/index'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const ui = sheet('ui')
const specs = allSheetSpecs().ui

const PORTRAITS = Object.keys(specs).filter((n) => n.startsWith('face_'))
const EMBLEMS = Object.keys(specs).filter((n) => n.startsWith('theme_'))
const ALL = [...PORTRAITS, ...EMBLEMS]

/** The base colour of each character's main ramp: the portrait must carry it. */
const MAIN: Record<string, number> = {
  face_hero: R.hamPink[1],
  face_princess: R.princessWhite[1],
  face_mom: R.momOrange[1],
  face_king: R.kingPurple[1],
  face_crowBoss: R.crowBlue[1],
  face_weaselBoss: R.weaselTan[1],
  face_boarBoss: R.boarBrown[1],
  face_wolfBoss: R.wolfGray[1],
  face_bearBoss: R.bearViolet[1],
  face_foxBoss: R.foxOrange[1],
  face_apeBoss: R.apeCharcoal[1],
  face_beeBoss: R.honey[1]
}

const silhouette = (r: Raster) => Array.from(r.data, (c) => (c ? 1 : 0)).join('')

describe('portraits and stage emblems', () => {
  test('there are twelve portraits and seven emblems', () => {
    expect(PORTRAITS).toHaveLength(12)
    expect(EMBLEMS).toHaveLength(7)
  })

  test('none of them is a stand-in', () => {
    const missing = new Set(missingAnims('ui'))
    expect(ALL.filter((n) => missing.has(n))).toEqual([])
  })

  for (const name of ALL)
    describe(name, () => {
      const anim = ui[name]
      const f = anim.frames[0]

      test('is one 32×32 frame', () => {
        expect(anim.frames).toHaveLength(1)
        expect(f.w).toBe(32)
        expect(f.h).toBe(32)
      })

      test('uses between 8 and 24 colours', () => {
        const n = f.colors().size
        expect(n).toBeGreaterThanOrEqual(8)
        expect(n).toBeLessThanOrEqual(24)
      })

      test('leaves a 1-px empty margin', () => {
        const b = f.bounds()
        expect(b).toBeDefined()
        expect(b!.x).toBeGreaterThanOrEqual(1)
        expect(b!.y).toBeGreaterThanOrEqual(1)
        expect(b!.x + b!.w).toBeLessThanOrEqual(31)
        expect(b!.y + b!.h).toBeLessThanOrEqual(31)
      })
    })

  test('all nineteen differ from each other', () => {
    const seen = new Map<string, string>()
    for (const name of ALL) {
      const key = Array.from(ui[name].frames[0].data).join(',')
      expect(seen.get(key), `${name} equals ${seen.get(key)}`).toBeUndefined()
      seen.set(key, name)
    }
  })

  for (const name of PORTRAITS)
    test(`${name} carries the base colour of its character`, () => {
      expect(ui[name].frames[0].colors().has(MAIN[name])).toBe(true)
    })

  test('portraits fill the cell: the head is at least 24 px across', () => {
    for (const name of PORTRAITS) {
      const b = ui[name].frames[0].bounds()!
      expect(b.w, name).toBeGreaterThanOrEqual(24)
      expect(b.h, name).toBeGreaterThanOrEqual(24)
    }
  })

  test('the seven emblems share the same silhouette', () => {
    const first = silhouette(ui[EMBLEMS[0]].frames[0])
    for (const name of EMBLEMS) expect(silhouette(ui[name].frames[0]), name).toBe(first)
  })
})
