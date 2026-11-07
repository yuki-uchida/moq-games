import { describe, expect, it } from 'vitest'
import {
  foodChips,
  foodLabelLines,
  foodPiles,
  foodSpriteBox,
  labelCandidates,
  layoutFoods,
  placeLabelBlocks,
  playerBox,
  type Box,
  type FoodPoint,
  type FoodSpot,
  type LabelBlock
} from '../src/food-layout'

const gap = (a: FoodPoint, b: FoodPoint) => Math.hypot(a.x - b.x, a.y - b.y)

function minGap(points: FoodPoint[]) {
  let min = Infinity
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) min = Math.min(min, gap(points[a], points[b]))
  }
  return min
}

const shownOf = (spots: FoodSpot[]) => spots.filter((spot) => spot.shown)

function overlaps(a: Box, b: Box) {
  return Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)
}

function inside(box: Box, view: Box) {
  return box.left >= view.left && box.right <= view.right && box.top >= view.top && box.bottom <= view.bottom
}

/** Blocks of the piles of some foods, one 90×15 px line per food, as the renderer builds them. */
function blocksFor(points: FoodPoint[]) {
  const spots = layoutFoods(points)
  const piles = foodPiles(spots)
  const count = Math.max(...piles) + 1
  const sprites = shownOf(spots).map(foodSpriteBox)
  const blocks: LabelBlock[] = Array.from({ length: count }, (_, pile) => {
    const boxes = spots.filter((spot, i) => spot.shown && piles[i] === pile).map(foodSpriteBox)
    return {
      pile: {
        left: Math.min(...boxes.map((b) => b.left)),
        top: Math.min(...boxes.map((b) => b.top)),
        right: Math.max(...boxes.map((b) => b.right)),
        bottom: Math.max(...boxes.map((b) => b.bottom))
      },
      width: 90,
      height: 15 * piles.filter((p) => p === pile).length
    }
  })
  return { spots, sprites, blocks }
}

const wide: Box = { left: -1000, top: -1000, right: 1000, bottom: 1000 }

describe('layoutFoods', () => {
  it('keeps a single food exactly where it is', () => {
    expect(layoutFoods([{ x: 123.5, y: -40 }])).toEqual([{ x: 123.5, y: -40, shown: true }])
  })

  it('spreads three foods on one spot', () => {
    const spots = layoutFoods(Array.from({ length: 3 }, () => ({ x: 100, y: 100 })))
    expect(spots.every((spot) => spot.shown)).toBe(true)
    expect(minGap(spots)).toBeGreaterThanOrEqual(15)
  })

  it('does not stack nearby but different foods on top of each other', () => {
    const spots = layoutFoods([
      { x: 150, y: 80 },
      { x: 136, y: 80 }
    ])
    expect(spots.every((spot) => spot.shown)).toBe(true)
    expect(gap(spots[0], spots[1])).toBeGreaterThanOrEqual(15)
  })

  it('keeps foods of neighbouring spots apart (x = 0, 23, 21)', () => {
    const spots = layoutFoods([0, 23, 21].map((x) => ({ x, y: 0 })))
    expect(minGap(shownOf(spots))).toBeGreaterThanOrEqual(15)
  })

  it('shows what fits of ten stacked foods and counts the rest on chips', () => {
    const real = Array.from({ length: 10 }, () => ({ x: 10, y: 20 }))
    const spots = layoutFoods(real)
    const shown = shownOf(spots)
    expect(minGap(shown)).toBeGreaterThanOrEqual(15)
    spots.forEach((spot, i) => expect(gap(spot, real[i])).toBeLessThanOrEqual(16 + 1e-9))
    const chips = foodChips(spots)
    expect(shown.length + chips.reduce((sum, n) => sum + n, 0)).toBe(10)
    spots.forEach((spot, i) => {
      if (!spot.shown) expect(chips[i]).toBe(0)
    })
  })

  it('keeps every sprite within pickup reach and shown sprites apart', () => {
    const offsets = [0, 7, 14, 21, 28]
    const centres = [
      { x: 0, y: 0 },
      { x: 50, y: -30 },
      { x: -123.5, y: 77.25 }
    ]
    for (const centre of centres) {
      for (let count = 1; count <= 10; count++) {
        for (const dx of offsets) {
          for (const dy of offsets) {
            const real = Array.from({ length: count }, (_, i) => ({
              x: centre.x + (i % 2 ? dx : 0) * (i % 3),
              y: centre.y + (i % 3 ? dy : 0) - (i % 4 === 3 ? dx : 0)
            }))
            const spots = layoutFoods(real)
            expect(spots).toHaveLength(count)
            spots.forEach((spot, i) => expect(gap(spot, real[i])).toBeLessThanOrEqual(16 + 1e-9))
            expect(minGap(shownOf(spots))).toBeGreaterThanOrEqual(15 - 1e-9)
            const chips = foodChips(spots)
            expect(shownOf(spots).length + chips.reduce((sum, n) => sum + n, 0)).toBe(count)
          }
        }
      }
    }
  })
})

describe('foodPiles and foodLabelLines', () => {
  it('joins foods within 30 px transitively', () => {
    expect(
      foodPiles([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 25, y: 0 },
        { x: 50, y: 0 }
      ])
    ).toEqual([0, 1, 0, 0])
  })

  it('aggregates lines by owner and effect', () => {
    const lines = foodLabelLines(
      [
        { pile: 0, owner: 0, effect: 'food_damage', name: 'P1', label: '攻撃力UP' },
        { pile: 0, owner: 0, effect: 'food_heal', name: 'P1', label: 'HP回復' },
        { pile: 0, owner: 0, effect: 'food_damage', name: 'P1', label: '攻撃力UP' },
        { pile: 1, owner: 1, effect: 'food_damage', name: 'P2', label: '攻撃力UP' }
      ],
      2
    )
    expect(lines).toEqual([['P1：攻撃力UP×2', 'P1：HP回復'], ['P2：攻撃力UP']])
  })
})

describe('placeLabelBlocks', () => {
  it('keeps the label of a lower food off the food above it', () => {
    const { sprites, blocks } = blocksFor([
      { x: 120, y: 80 },
      { x: 120, y: 57 }
    ])
    const placed = placeLabelBlocks(blocks, sprites, wide)
    for (const box of placed) for (const sprite of sprites) expect(overlaps(box, sprite)).toBe(false)
  })

  it('keeps a food label off a player standing below it', () => {
    const player = playerBox(0, 16, 1, 0)
    const { sprites, blocks } = blocksFor([{ x: 0, y: -31 }])
    const [box] = placeLabelBlocks(blocks, [...sprites, player], wide)
    expect(overlaps(box, player)).toBe(false)
  })

  it('keeps labels inside the viewport near its top edge', () => {
    const viewport = { left: -636, top: -356, right: 636, bottom: 356 }
    const { sprites, blocks } = blocksFor(Array.from({ length: 3 }, () => ({ x: 100, y: -325 })))
    const placed = placeLabelBlocks(blocks, sprites, viewport)
    for (const box of placed) expect(inside(box, viewport)).toBe(true)
  })

  it('places blocks clear of everything whenever a free candidate exists', () => {
    const viewport = { left: -300, top: -200, right: 300, bottom: 200 }
    let seed = 7
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let round = 0; round < 200; round++) {
      const foods: FoodPoint[] = []
      const piles = 1 + Math.floor(random() * 6)
      for (let p = 0; p < piles; p++) {
        const cx = -260 + random() * 520
        const cy = -180 + random() * 360
        const n = 1 + Math.floor(random() * 3)
        for (let k = 0; k < n; k++) foods.push({ x: cx + random() * 10, y: cy + random() * 10 })
      }
      const players = [0, 1].map(() => playerBox(-250 + random() * 500, -150 + random() * 330, 1, 0))
      const { sprites, blocks } = blocksFor(foods)
      const obstacles = [...sprites, ...players]
      const placed = placeLabelBlocks(blocks, obstacles, viewport)
      placed.forEach((box, n) => {
        const before = placed.slice(0, n)
        const free = labelCandidates(blocks[n]).some(
          (c) => inside(c, viewport) && ![...obstacles, ...before].some((o) => overlaps(c, o))
        )
        if (!free) return
        expect(inside(box, viewport)).toBe(true)
        for (const o of [...obstacles, ...before]) expect(overlaps(box, o)).toBe(false)
      })
    }
  })
})
