import { describe, expect, it } from 'vitest'
import { layoutFoods } from '../src/food-layout'

type Point = { x: number; y: number }

const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

function minGap(points: Point[]) {
  let min = Infinity
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) min = Math.min(min, gap(points[a], points[b]))
  }
  return min
}

describe('layoutFoods', () => {
  it('keeps a single food exactly where it is', () => {
    expect(layoutFoods([{ x: 123.5, y: -40 }])).toEqual([{ x: 123.5, y: -40 }])
  })

  it('spreads three foods on one spot', () => {
    expect(minGap(layoutFoods(Array.from({ length: 3 }, () => ({ x: 100, y: 100 }))))).toBeGreaterThanOrEqual(14)
  })

  it('does not stack nearby but different foods on top of each other', () => {
    const drawn = layoutFoods([
      { x: 150, y: 80 },
      { x: 136, y: 80 }
    ])
    expect(gap(drawn[0], drawn[1])).toBeGreaterThanOrEqual(14)
  })

  it('keeps six stacked foods apart and within pickup reach of their real spot', () => {
    const real = Array.from({ length: 6 }, () => ({ x: 10, y: 20 }))
    const drawn = layoutFoods(real)
    expect(minGap(drawn)).toBeGreaterThanOrEqual(9)
    drawn.forEach((point, i) => expect(gap(point, real[i])).toBeLessThanOrEqual(16 + 1e-9))
  })

  it('never draws a food farther than 16 px from its real position', () => {
    const offsets = [0, 7, 14, 21]
    for (let count = 1; count <= 8; count++) {
      for (const dx of offsets) {
        for (const dy of offsets) {
          const real = Array.from({ length: count }, (_, i) => ({
            x: 50 + (i % 2 ? dx : 0) * (i % 3),
            y: 50 + (i % 3 ? dy : 0)
          }))
          const drawn = layoutFoods(real)
          expect(drawn).toHaveLength(count)
          drawn.forEach((point, i) => expect(gap(point, real[i])).toBeLessThanOrEqual(16 + 1e-9))
        }
      }
    }
  })
})
