import { describe, expect, test } from 'vitest'
import { PROP_SPEC } from '../src/art/contract'
import { missingAnims, sheet } from '../src/art/index'
import { R } from '../src/art/palette'
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
