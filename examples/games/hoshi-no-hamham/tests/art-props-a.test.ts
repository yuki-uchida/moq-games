import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { PROP_SPEC, THEMES, themedProp, type ThemeId } from '../src/art/contract'
import { missingAnims, sheet } from '../src/art/index'
import { OUTLINE_OF, R, paletteRgba } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const IDS = ['prop:tree', 'prop:pine', 'prop:log', 'prop:pipe', 'prop:hive', 'prop:animal', 'prop:rock']

/** Fraction of painted pixels in a frame. */
const fill = (f: Raster) => f.count() / (f.w * f.h)

/** True when the two frames differ anywhere in rows [y0, y1). */
const differsIn = (a: Raster, b: Raster, y0: number, y1: number) => {
  for (let y = y0; y < y1; y++) for (let x = 0; x < a.w; x++) if (a.get(x, y) !== b.get(x, y)) return true
  return false
}

describe('gimmick props are drawn', () => {
  for (const id of IDS)
    test(id, () => {
      expect(missingAnims(id), `${id} still has stand-ins`).toEqual([])
      const s = sheet(id)
      for (const name of Object.keys(PROP_SPEC[id])) expect(s[name], `${id}#${name}`).toBeDefined()
    })
})

describe('trees keep their crown below the platform line', () => {
  for (const id of ['prop:tree', 'prop:pine'])
    test(id, () => {
      for (const [name, a] of Object.entries(sheet(id)))
        for (const [i, f] of a.frames.entries()) {
          const b = f.bounds()!
          expect(b.y, `${id}#${name} frame ${i} reaches above row 16`).toBeGreaterThanOrEqual(16)
          expect(b.y + b.h - 1, `${id}#${name} frame ${i} foot`).toBeLessThanOrEqual(125)
        }
    })

  for (const id of ['prop:tree', 'prop:pine'])
    test(`${id} cut differs from idle only in the lower half`, () => {
      const { idle, cut } = sheet(id)
      for (let i = 0; i < idle.frames.length; i++) {
        expect(differsIn(idle.frames[i], cut.frames[i], 0, 64), `${id} frame ${i} upper half`).toBe(false)
        expect(differsIn(idle.frames[i], cut.frames[i], 64, 128), `${id} frame ${i} lower half`).toBe(true)
      }
    })
})

describe('the fallen log is a solid, walkable block', () => {
  for (const kind of ['tree', 'pine'])
    test(kind, () => {
      const f = sheet('prop:log')[kind].frames[0]
      let flat = 0
      for (let x = 0; x < f.w; x++) {
        for (let y = 0; y < 6; y++)
          if (f.get(x, y)) {
            flat++
            break
          }
      }
      expect(flat / f.w, 'columns with art in the top 6 rows').toBeGreaterThanOrEqual(0.9)
      expect(fill(f), 'painted share of the frame').toBeGreaterThanOrEqual(0.7)
    })

  test('under is dense at the top and ragged at the bottom', () => {
    const f = sheet('prop:log').under.frames[0]
    let top = 0
    let bottom = 0
    for (let x = 0; x < f.w; x++) {
      if (f.get(x, 0)) top++
      if (f.get(x, f.h - 1)) bottom++
    }
    expect(top / f.w).toBeGreaterThanOrEqual(0.9)
    expect(bottom / f.w).toBeLessThan(0.4)
  })
})

describe('the hive hanger', () => {
  const { post, arm } = sheet('prop:hive')
  test('post tiles vertically and stays in its 9-px column', () => {
    const f = post.frames[0]
    for (let x = 0; x < f.w; x++) expect(f.get(x, 0), `column ${x}`).toBe(f.get(x, f.h - 1))
    const b = f.bounds()!
    expect([b.x, b.w, b.y, b.h]).toEqual([50, 9, 0, 64])
  })
  test('arm has the pole and a bracket reaching to the rope hook', () => {
    const f = arm.frames[0]
    for (let y = 0; y < f.h; y++) for (let x = 50; x <= 58; x++) expect(f.get(x, y), `pole pixel ${x},${y}`).not.toBe(0)
    expect(f.get(32, 6), 'bracket reaches the hook').not.toBe(0)
    for (let x = 33; x < 50; x++) expect(f.get(x, 6), `bracket at ${x}`).not.toBe(0)
  })
  test('the rope hangs from the top centre', () => {
    for (const f of sheet('prop:hive').idle.frames) {
      let top = 0
      for (let x = 28; x < 36; x++) if (f.get(x, 0)) top++
      expect(top).toBeGreaterThan(0)
    }
  })
})

describe('the boulder is solid', () => {
  for (const name of ['idle', 'cracked'])
    test(name, () => {
      const f = sheet('prop:rock')[name].frames[0]
      expect(fill(f)).toBeGreaterThanOrEqual(0.55)
      expect(f.bounds()!.y + f.bounds()!.h).toBe(64)
    })
})

describe('the boar piglet', () => {
  const CREAM = new Set<number>(R.cream)
  /** Cream pixels in the upper half of the sprite's bounds. */
  const creamUp = (f: Raster) => {
    const b = f.bounds()!
    let n = 0
    for (let y = b.y; y < b.y + b.h / 2; y++) for (let x = b.x; x < b.x + b.w; x++) if (CREAM.has(f.get(x, y))) n++
    return n
  }

  test('the gallop gathers and extends by at least 6 px', () => {
    const widths = sheet('prop:animal').run.frames.map((f) => f.bounds()!.w)
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThanOrEqual(6)
  })

  for (const clip of ['run', 'sleep'])
    test(`cream stripes read on the back in every ${clip} frame`, () => {
      for (const [i, f] of sheet('prop:animal')[clip].frames.entries())
        expect(creamUp(f), `${clip} frame ${i}`).toBeGreaterThanOrEqual(20)
    })
})

// ----------------------------------------------------------------------------- trees of the other worlds

const WORLD_VARIANTS = ['cave', 'keep', 'star'] as const
const TREE_BASES = ['prop:tree', 'prop:pine', 'prop:log'] as const

/** Hash of every frame's size and RGBA values (independent of palette indices, so palette growth keeps it). */
function sheetHash(id: string) {
  const rgba = paletteRgba()
  const h = createHash('sha256')
  const s = sheet(id)
  for (const name of Object.keys(s).sort())
    for (const f of s[name].frames) {
      h.update(name + f.w + 'x' + f.h)
      for (const c of f.data) h.update(Buffer.from(rgba.subarray(c * 4, c * 4 + 4)))
    }
  return h.digest('hex').slice(0, 16)
}

/** The three most frequent colours of a sheet's frames, outline colours left out. */
function dominant(id: string) {
  const count = new Map<number, number>()
  for (const a of Object.values(sheet(id)))
    for (const f of a.frames)
      for (const c of f.data) if (c && OUTLINE_OF[c].line !== c) count.set(c, (count.get(c) ?? 0) + 1)
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c]) => c)
}

describe('the trees of the cave, the keep and the stars', () => {
  for (const base of TREE_BASES)
    for (const v of WORLD_VARIANTS) {
      const id = `${base}:${v}`
      test(`${id} has every clip of ${base} with the same frames, sizes and anchors`, () => {
        expect(missingAnims(id)).toEqual([])
        const s = sheet(id)
        const o = sheet(base)
        expect(Object.keys(s).sort()).toEqual(Object.keys(o).sort())
        for (const name of Object.keys(o)) {
          expect(s[name].frames.length, `${id}#${name} frames`).toBe(o[name].frames.length)
          expect(s[name].fps).toBe(o[name].fps)
          expect(s[name].loop).toBe(o[name].loop)
          expect(s[name].anchor).toEqual(o[name].anchor)
          for (const f of s[name].frames) expect([f.w, f.h]).toEqual([o[name].frames[0].w, o[name].frames[0].h])
        }
      })
      test(`${id} differs from the meadow drawing in its dominant colours`, () => {
        const mine = dominant(id)
        const meadow = dominant(base)
        expect(
          mine.filter((c) => meadow.includes(c)),
          'shared dominant colours'
        ).toEqual([])
      })
    }

  for (const base of TREE_BASES)
    test(`the ${base} variants differ from each other`, () => {
      const hashes = WORLD_VARIANTS.map((v) => sheetHash(`${base}:${v}`))
      expect(new Set(hashes).size).toBe(WORLD_VARIANTS.length)
      const tops = WORLD_VARIANTS.map((v) => dominant(`${base}:${v}`))
      for (let i = 0; i < tops.length; i++)
        for (let j = i + 1; j < tops.length; j++) expect(tops[i]).not.toEqual(tops[j])
    })

  for (const id of ['prop:tree', 'prop:pine'])
    for (const v of WORLD_VARIANTS) {
      test(`${id}:${v} keeps its crown below the platform line and cut differs only in the lower half`, () => {
        const s = sheet(`${id}:${v}`)
        for (const [name, a] of Object.entries(s))
          for (const f of a.frames) {
            const b = f.bounds()!
            expect(b.y).toBeGreaterThanOrEqual(16)
            expect(b.y + b.h - 1).toBeLessThanOrEqual(125)
            expect(f.colors().size, `${name} colour budget`).toBeLessThanOrEqual(32)
          }
        for (let i = 0; i < s.idle.frames.length; i++) {
          expect(differsIn(s.idle.frames[i], s.cut.frames[i], 0, 64)).toBe(false)
          expect(differsIn(s.idle.frames[i], s.cut.frames[i], 64, 128)).toBe(true)
        }
      })
    }

  for (const v of WORLD_VARIANTS)
    for (const kind of ['tree', 'pine'])
      test(`the fallen ${v} ${kind} log is a solid, walkable block`, () => {
        const f = sheet(`prop:log:${v}`)[kind].frames[0]
        let flat = 0
        for (let x = 0; x < f.w; x++)
          for (let y = 0; y < 6; y++)
            if (f.get(x, y)) {
              flat++
              break
            }
        expect(flat / f.w).toBeGreaterThanOrEqual(0.9)
        expect(fill(f)).toBeGreaterThanOrEqual(0.7)
      })

  test('the meadow sheets are unchanged', () => {
    expect(sheetHash('prop:tree')).toBe('b481a75beafef5fc')
    expect(sheetHash('prop:pine')).toBe('74eed6ecef8d6043')
    expect(sheetHash('prop:log')).toBe('c764abb3a51597cb')
  })

  test('themedProp picks the own sheet of each world', () => {
    const own: Partial<Record<ThemeId, string>> = { cave: 'cave', fortress: 'keep', castle: 'keep', star: 'star' }
    for (const theme of THEMES)
      for (const base of TREE_BASES)
        expect(themedProp(base, theme), `${base} in ${theme}`).toBe(own[theme] ? `${base}:${own[theme]}` : base)
    expect(themedProp('prop:rock', 'cave')).toBe('prop:rock')
    for (const id of TREE_BASES) for (const v of WORLD_VARIANTS) expect(PROP_SPEC[`${id}:${v}`]).toEqual(PROP_SPEC[id])
  })
})
