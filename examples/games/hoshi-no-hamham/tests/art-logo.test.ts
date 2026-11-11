import { describe, expect, test } from 'vitest'
import { sheet } from '../src/art/index'
import { C, R } from '../src/art/palette'
import { LOGO_GLYPHS } from '../src/art/ui/logo'

const logo = sheet('ui').logo.frames[0]
const px = (x: number, y: number) => logo.get(x, y)

const GOLD = new Set<number>(R.gold)
const PINK = new Set<number>([...R.hamPink, ...R.princessPink, ...R.hamEar])
const LINE = new Set<number>([C.ink, C.black])

/** Share of the filled (non-outline, non-shadow) pixels in a rectangle that belong to `set`. */
function share(set: Set<number>, x0: number, y0: number, x1: number, y1: number) {
  let hit = 0
  let all = 0
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const c = px(x, y)
      if (!c || LINE.has(c)) continue
      all++
      if (set.has(c)) hit++
    }
  return hit / all
}

describe('logo 「星のハムハム」', () => {
  test('is 384×128 with a 4-px empty margin', () => {
    expect([logo.w, logo.h]).toEqual([384, 128])
    const b = logo.bounds()!
    expect(b.x).toBeGreaterThanOrEqual(4)
    expect(b.y).toBeGreaterThanOrEqual(4)
    expect(b.x + b.w).toBeLessThanOrEqual(logo.w - 4)
    expect(b.y + b.h).toBeLessThanOrEqual(logo.h - 4)
  })

  test('paints between 22% and 60% of its area', () => {
    const s = logo.count() / (logo.w * logo.h)
    expect(s).toBeGreaterThan(0.22)
    expect(s).toBeLessThan(0.6)
  })

  test('uses at most 28 colours', () => {
    const used = new Set(logo.data)
    used.delete(0)
    expect(used.size).toBeLessThanOrEqual(28)
  })

  test('「星の」 is gold on the upper left, 「ハムハム」 pink on the right', () => {
    expect(share(GOLD, 0, 0, 128, 64)).toBeGreaterThan(0.6)
    expect(share(PINK, 128, 0, 384, 128)).toBeGreaterThan(0.6)
  })

  test('the plum outline (or the shadow) closes every edge', () => {
    const around = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]
    for (let y = 0; y < logo.h; y++)
      for (let x = 0; x < logo.w; x++) {
        if (px(x, y)) continue
        const n = around.map(([dx, dy]) => px(x + dx, y + dy))
        if (!n.some((c) => c)) continue
        expect(
          n.some((c) => LINE.has(c)),
          `edge at ${x},${y}`
        ).toBe(true)
      }
  })

  test('glyph boxes are listed in reading order', () => {
    expect(LOGO_GLYPHS.map((g) => g.char).join('')).toBe('星のハムハム')
  })

  for (const [i, g] of LOGO_GLYPHS.entries()) {
    if (g.char === 'ハ')
      test(`ハ #${i} is open at the top: two separate pink strokes`, () => {
        let found = false
        for (let y = g.y; y < g.y + g.h / 4 && !found; y++) {
          let runs = 0
          let inRun = false
          for (let x = g.x; x < g.x + g.w; x++) {
            const pink = PINK.has(px(x, y)) || px(x, y) === C.white
            if (pink && !inRun) runs++
            inRun = pink
          }
          if (runs >= 2) found = true
        }
        expect(found).toBe(true)
      })

    if (g.char === 'ム')
      test(`ム #${i} is open: the apex and the tick do not join`, () => {
        const [ax, ay] = g.apex!
        const [tx, ty] = g.tick!
        const steps = Math.ceil(Math.hypot(tx - ax, ty - ay))
        let gap = 0
        for (let s = 0; s <= steps; s++) {
          const c = px(Math.floor(ax + ((tx - ax) * s) / steps), Math.floor(ay + ((ty - ay) * s) / steps))
          if (!c || LINE.has(c)) gap++
        }
        expect(gap).toBeGreaterThan(2)
      })
  }
})
