import { describe, expect, test } from 'vitest'
import { backdrop, hasBackdrop } from '../src/art'
import { AMBIENCE, VIEW_H, VIEW_W, type ThemeId } from '../src/art/contract'
import type { Raster } from '../src/art/raster'

/** Row of the highest painted pixel in a column, or the raster height when the column is empty. */
const topRow = (r: Raster, x: number) => {
  for (let y = 0; y < r.h; y++) if (r.get(x, y)) return y
  return r.h
}

const THEMES: ThemeId[] = ['meadow', 'night', 'forest']

describe('backdrops: meadow, night, forest', () => {
  for (const theme of THEMES)
    describe(theme, () => {
      test('is drawn and has an opaque, varied sky', () => {
        expect(hasBackdrop(theme)).toBe(true)
        const b = backdrop(theme)!
        expect([b.sky.w, b.sky.h]).toEqual([VIEW_W, VIEW_H])
        expect(b.sky.count()).toBe(VIEW_W * VIEW_H)
        expect(b.sky.colors().size).toBeGreaterThanOrEqual(4)
      })

      test('has parallax layers that tile seamlessly', () => {
        const b = backdrop(theme)!
        expect(b.layers.length).toBeGreaterThanOrEqual(3)
        for (const [i, layer] of b.layers.entries()) {
          expect(layer.image.w, `layer ${i} width`).toBe(VIEW_W)
          expect(layer.image.colors().size, `layer ${i} colours`).toBeLessThanOrEqual(20)
          const seam = Math.abs(topRow(layer.image, 0) - topRow(layer.image, VIEW_W - 1))
          expect(seam, `layer ${i} silhouette at the seam`).toBeLessThanOrEqual(3)
        }
      })

      test('names a drifting ambience', () => {
        const b = backdrop(theme)!
        expect(AMBIENCE).toContain(b.ambience)
        expect(b.ambience).not.toBe('none')
      })
    })
})
