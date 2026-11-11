import { describe, expect, test } from 'vitest'
import type { Neighbour, ThemeId, TileKind } from '../src/art/contract'
import { decor, hasTerrain, tile } from '../src/art'
import { rgbOf } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const THEMES_A: ThemeId[] = ['meadow', 'night', 'forest']
const S = 'solid' as const
const E = 'empty' as const
const BURIED = [S, S, S, S, S, S, S, S] as const
// Open above: N, NE and NW are air.
const TOP = [E, E, S, S, S, S, S, E] as const

const make = (theme: ThemeId, kind: TileKind, around: readonly Neighbour[], tx = 7, ty = 9) =>
  tile({ theme, kind, around, tx, ty })

/** Rows of a raster with no painted pixel. */
const rowsEmpty = (r: Raster, y0: number, y1: number) => {
  for (let y = y0; y <= y1; y++) for (let x = 0; x < r.w; x++) if (r.get(x, y)) return false
  return true
}

const lum = (c: number) => {
  const [r, g, b] = rgbOf(c)
  return 0.3 * r + 0.59 * g + 0.11 * b
}

/** True when a whole column is one single colour that is clearly darker than the tile's average (a drawn seam line). */
const isLine = (r: Raster, x: number) => {
  const first = r.get(x, 0)
  for (let y = 1; y < r.h; y++) if (r.get(x, y) !== first) return false
  let sum = 0
  for (let i = 0; i < r.data.length; i++) sum += lum(r.data[i])
  return lum(first) < (sum / r.data.length) * 0.7
}

describe.each(THEMES_A)('terrain %s', (theme) => {
  test('is drawn', () => {
    expect(hasTerrain(theme)).toBe(true)
  })

  test('an exposed top differs from a buried tile', () => {
    expect(make(theme, S, TOP).equals(make(theme, S, BURIED))).toBe(false)
  })

  test('platform end and middle pieces differ and stay in the top 20 rows', () => {
    const P = 'platform' as const
    const left = make(theme, P, [E, E, P, E, E, E, E, E])
    const middle = make(theme, P, [E, E, P, E, E, E, P, E])
    const right = make(theme, P, [E, E, E, E, E, E, P, E])
    expect(left.equals(middle)).toBe(false)
    expect(middle.equals(right)).toBe(false)
    expect(left.equals(right)).toBe(false)
    for (const r of [left, middle, right]) {
      expect(r.count()).toBeGreaterThan(0)
      expect(rowsEmpty(r, 20, 63)).toBe(true)
    }
  })

  test('spikes leave rows 0–7 clear and fill the base', () => {
    const r = make(theme, 'spike', [E, E, S, S, S, S, S, E])
    expect(rowsEmpty(r, 0, 7)).toBe(true)
    for (let x = 0; x < 64; x++) expect(r.get(x, 63), `base pixel ${x}`).toBeGreaterThan(0)
  })

  test('buried tiles at different coordinates differ', () => {
    expect(make(theme, S, BURIED, 3, 5).equals(make(theme, S, BURIED, 4, 5))).toBe(false)
    expect(make(theme, S, BURIED, 3, 5).equals(make(theme, S, BURIED, 3, 6))).toBe(false)
  })

  test('buried tiles join without a drawn line', () => {
    for (let i = 0; i < 20; i++) {
      const a = make(theme, S, BURIED, 2 + i, 6 + (i % 3))
      const b = make(theme, S, BURIED, 3 + i, 6 + (i % 3))
      const bothLines = isLine(a, 63) && isLine(b, 0)
      expect(bothLines, `seam between tx ${2 + i} and ${3 + i}`).toBe(false)
    }
  })

  test('dirt is opaque, differs from ground and joins dirt', () => {
    const dirt = make(theme, 'dirt', ['dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt'])
    expect(dirt.count()).toBe(64 * 64)
    expect(dirt.equals(make(theme, S, BURIED))).toBe(false)
    const a = make(theme, 'dirt', ['dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt'], 4, 6)
    const b = make(theme, 'dirt', ['dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt'], 5, 6)
    expect(isLine(a, 63) && isLine(b, 0)).toBe(false)
  })

  test('decorations are small, plentiful and not empty', () => {
    const list = decor(theme)
    expect(list.filter((d) => d.where === 'top').length).toBeGreaterThanOrEqual(6)
    expect(list.filter((d) => d.where === 'under').length).toBeGreaterThanOrEqual(2)
    for (const d of list) {
      expect(d.image.count()).toBeGreaterThan(0)
      expect(d.image.w).toBeLessThanOrEqual(32)
      expect(d.weight).toBeGreaterThan(0)
    }
    // Most are well under 20 px wide.
    expect(list.filter((d) => d.image.w < 20).length).toBeGreaterThanOrEqual(list.length / 2)
  })

  test('tiles are deterministic and cached', () => {
    expect(make(theme, S, TOP).equals(make(theme, S, TOP))).toBe(true)
  })
})
