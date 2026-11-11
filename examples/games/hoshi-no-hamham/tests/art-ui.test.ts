import { describe, expect, test } from 'vitest'
import { allSheetSpecs } from '../src/art/contract'
import { missingAnims, sheet } from '../src/art/index'
import type { Raster } from '../src/art/raster'

const ui = sheet('ui')
const specs = allSheetSpecs().ui

/** The animations drawn by the icon and logo modules (everything except the faces and theme emblems). */
const OURS = Object.keys(specs).filter((n) => !n.startsWith('face_') && !n.startsWith('theme_'))
const ICONS = OURS.filter((n) => specs[n].w === 16 && specs[n].h === 16 && specs[n].frames === 1)

const px = (r: Raster, x: number, y: number) => r.data[y * r.w + x]
const silhouette = (r: Raster) => Array.from(r.data, (c) => (c ? 1 : 0)).join('')

describe('interface art', () => {
  test('none of the icon or logo animations is a stand-in', () => {
    const missing = new Set(missingAnims('ui'))
    expect(OURS.filter((n) => missing.has(n))).toEqual([])
  })

  describe('16×16 icons', () => {
    for (const name of ICONS)
      test(name, () => {
        const f = ui[name].frames[0]
        expect(f.colors().size).toBeLessThanOrEqual(8)
        const b = f.bounds()
        expect(b).toBeDefined()
        expect(b!.x).toBeGreaterThanOrEqual(1)
        expect(b!.y).toBeGreaterThanOrEqual(1)
        expect(b!.x + b!.w).toBeLessThanOrEqual(15)
        expect(b!.y + b!.h).toBeLessThanOrEqual(15)
      })

    test('all icons differ from each other', () => {
      const seen = new Map<string, string>()
      for (const name of ICONS) {
        const key = Array.from(ui[name].frames[0].data).join(',')
        expect(seen.get(key), `${name} equals ${seen.get(key)}`).toBeUndefined()
        seen.set(key, name)
      }
    })
  })

  test('the empty heart has the same silhouette as the full heart', () => {
    expect(silhouette(ui.heartEmpty.frames[0])).toBe(silhouette(ui.heartFull.frames[0]))
  })

  for (const name of ['panel', 'paper'])
    test(`${name} stretches: the 8-px middle rows and columns are uniform`, () => {
      const f = ui[name].frames[0]
      expect(f.w).toBe(24)
      for (let y = 8; y < 16; y++)
        for (let x = 0; x < 24; x++) expect(px(f, x, y), `${name} row ${y} x ${x}`).toBe(px(f, x, 8))
      for (let x = 8; x < 16; x++)
        for (let y = 0; y < 24; y++) expect(px(f, x, y), `${name} col ${x} y ${y}`).toBe(px(f, 8, y))
      for (let i = 0; i < 24 * 24; i++) expect(f.data[i], `${name} is fully opaque inside`).toBeDefined()
    })

  describe('logo', () => {
    const logo = ui.logo.frames[0]

    test('keeps a 4-px margin', () => {
      const b = logo.bounds()!
      expect(b.x).toBeGreaterThanOrEqual(4)
      expect(b.y).toBeGreaterThanOrEqual(4)
      expect(b.x + b.w).toBeLessThanOrEqual(logo.w - 4)
      expect(b.y + b.h).toBeLessThanOrEqual(logo.h - 4)
    })

    test('covers between 18% and 60% of the area', () => {
      const share = logo.count() / (logo.w * logo.h)
      expect(share).toBeGreaterThan(0.18)
      expect(share).toBeLessThan(0.6)
    })

    test('has painted pixels in all six 64-px columns', () => {
      for (let col = 0; col < 6; col++) {
        let n = 0
        for (let y = 0; y < logo.h; y++) for (let x = col * 64; x < col * 64 + 64; x++) if (px(logo, x, y)) n++
        expect(n, `column ${col}`).toBeGreaterThan(0)
      }
    })
  })
})
