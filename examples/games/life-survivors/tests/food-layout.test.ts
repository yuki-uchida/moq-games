import { describe, expect, it } from 'vitest'
import { sheet } from '../src/art/index'
import { COOKING_EFFECTS, COOKING_ITEMS } from '../src/data'
import {
  FOOD_ANCHOR,
  FOOD_GAP,
  FOOD_OPAQUE,
  FOOD_SCALE,
  fitFoodLines,
  foodChips,
  foodLabelLines,
  foodPiles,
  foodSpriteBox,
  labelCandidates,
  LABEL_LINE,
  layoutFoods,
  placeLabelBlocks,
  playerBox,
  type Box,
  type FoodLabelEntry,
  type FoodPoint,
  type FoodSpot,
  type LabelBlock
} from '../src/food-layout'

const gap = (a: FoodPoint, b: FoodPoint) => Math.hypot(a.x - b.x, a.y - b.y)

function overlaps(a: Box, b: Box) {
  return Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)
}

function inside(box: Box, view: Box) {
  return box.left >= view.left && box.right <= view.right && box.top >= view.top && box.bottom <= view.bottom
}

/** Every layout invariant: sprites disjoint, near their real points, hidden foods next to a shown sprite, counts add up. */
function expectSound(real: FoodPoint[], spots: FoodSpot[]) {
  expect(spots).toHaveLength(real.length)
  const shown = spots.filter((spot) => spot.shown)
  expect(shown.length).toBeGreaterThan(0)
  const boxes = shown.map(foodSpriteBox)
  for (let a = 0; a < boxes.length; a++)
    for (let b = a + 1; b < boxes.length; b++) expect(overlaps(boxes[a], boxes[b])).toBe(false)
  spots.forEach((spot, i) => {
    expect(gap(spot, real[i])).toBeLessThanOrEqual(16 + 1e-9)
    if (!spot.shown) expect(Math.min(...shown.map((s) => gap(s, real[i])))).toBeLessThan(FOOD_GAP)
  })
  const chips = foodChips(spots)
  spots.forEach((spot, i) => {
    if (!spot.shown) expect(chips[i]).toBe(0)
  })
  expect(shown.length + chips.reduce((sum, n) => sum + n, 0)).toBe(real.length)
}

describe('food sprite extent', () => {
  it('matches the opaque pixels of every food frame, so FOOD_GAP keeps sprites apart', () => {
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    const pixels: FoodPoint[] = []
    for (const kind of COOKING_ITEMS) {
      for (const frame of sheet('items')[kind].frames) {
        expect([frame.w, frame.h]).toEqual([16, 16])
        for (let y = 0; y < frame.h; y++)
          for (let x = 0; x < frame.w; x++)
            if (frame.get(x, y)) {
              left = Math.min(left, x)
              top = Math.min(top, y)
              right = Math.max(right, x + 1)
              bottom = Math.max(bottom, y + 1)
              pixels.push({ x, y })
            }
      }
    }
    expect(FOOD_OPAQUE).toEqual({ left, top, right, bottom })
    const extent = Math.max(right - left, bottom - top) * FOOD_SCALE
    expect(FOOD_GAP).toBe(Math.ceil(extent) + 1)
    // Each opaque pixel, drawn at 1.5× from the anchor, lies inside the sprite box.
    const box = foodSpriteBox({ x: 0, y: 0 })
    for (const p of pixels) {
      const x = (p.x - FOOD_ANCHOR.x) * FOOD_SCALE
      const y = (p.y - FOOD_ANCHOR.y) * FOOD_SCALE
      expect(x).toBeGreaterThanOrEqual(box.left)
      expect(y).toBeGreaterThanOrEqual(box.top)
      expect(x + FOOD_SCALE).toBeLessThanOrEqual(box.right)
      expect(y + FOOD_SCALE).toBeLessThanOrEqual(box.bottom)
    }
    expect(box.right - box.left).toBeLessThan(FOOD_GAP)
    expect(box.bottom - box.top).toBeLessThan(FOOD_GAP)
  })
})

describe('layoutFoods', () => {
  it('keeps a single food exactly where it is', () => {
    expect(layoutFoods([{ x: 123.5, y: -40 }])).toEqual([{ x: 123.5, y: -40, shown: true }])
  })

  it('shows two stacked foods side by side', () => {
    const real = Array.from({ length: 2 }, () => ({ x: 100, y: 100 }))
    const spots = layoutFoods(real)
    expect(spots.every((spot) => spot.shown)).toBe(true)
    expectSound(real, spots)
  })

  it('shows what fits of ten stacked foods and counts the rest on chips next to them', () => {
    const real = Array.from({ length: 10 }, () => ({ x: 10, y: 20 }))
    const spots = layoutFoods(real)
    expectSound(real, spots)
    expect(spots.filter((spot) => spot.shown).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps two foods 15 px apart vertically from overlapping', () => {
    const real = [
      { x: 120, y: 80 },
      { x: 120, y: 65 }
    ]
    const spots = layoutFoods(real)
    expectSound(real, spots)
    expect(spots.every((spot) => spot.shown)).toBe(true)
  })

  it('keeps foods of neighbouring spots apart (x = 0, 23, 21)', () => {
    const real = [0, 23, 21].map((x) => ({ x, y: 0 }))
    expectSound(real, layoutFoods(real))
  })

  it('keeps sprites apart and within reach for 1–12 foods on grids around several centres', () => {
    const offsets = [0, 7, 14, 21, 28]
    const centres = [
      { x: 0, y: 0 },
      { x: 50, y: -30 },
      { x: -123.5, y: 77.25 }
    ]
    for (const centre of centres) {
      for (let count = 1; count <= 12; count++) {
        for (const dx of offsets) {
          for (const dy of offsets) {
            const real = Array.from({ length: count }, (_, i) => ({
              x: centre.x + (i % 2 ? dx : 0) * (i % 3),
              y: centre.y + (i % 3 ? dy : 0) - (i % 4 === 3 ? dx : 0)
            }))
            expectSound(real, layoutFoods(real))
          }
        }
      }
    }
  })

  it('stays sound for random crowds, including foods boxed in on every side', () => {
    let seed = 11
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let round = 0; round < 400; round++) {
      const count = 1 + Math.floor(random() * 30)
      const spread = 10 + random() * 120
      const real = Array.from({ length: count }, () => ({ x: random() * spread, y: random() * spread }))
      expectSound(real, layoutFoods(real))
    }
    const boxedIn = [...[-24, 24].flatMap((x) => [-24, 24].map((y) => ({ x, y }))), { x: 0, y: 0 }]
    expectSound(boxedIn, layoutFoods(boxedIn))
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

  const entry = (pile: number, owner: number, effect: (typeof COOKING_ITEMS)[number]): FoodLabelEntry => ({
    pile,
    owner,
    effect,
    name: `P${owner + 1}`,
    label: COOKING_EFFECTS[effect].label,
    short: COOKING_EFFECTS[effect].short
  })

  it('writes one line per owner: the full name for one food, short names in item order for several', () => {
    const lines = foodLabelLines(
      [
        entry(0, 0, 'food_heal'),
        entry(0, 1, 'food_speed'),
        entry(0, 0, 'food_damage'),
        entry(0, 0, 'food_heal'),
        entry(1, 1, 'food_damage')
      ],
      2
    )
    expect(lines).toEqual([['P1：攻撃↑・回復×2', 'P2：移動速度UP'], ['P2：攻撃力UP']])
  })

  it('cuts a block that does not fit and says how many owners are left out', () => {
    const lines = Array.from({ length: 8 }, (_, i) => `P${i + 1}：攻撃↑`)
    expect(fitFoodLines(lines, 8 * LABEL_LINE)).toEqual(lines)
    expect(fitFoodLines(lines, 4 * LABEL_LINE + 3)).toEqual([...lines.slice(0, 3), '…ほか5人'])
  })
})

const NO_TAGS = { name: 60, buffs: 0, badge: false }

/** Label blocks of some foods as the renderer builds them (90 px wide lines, one per owner of a pile). */
function blocksFor(points: FoodPoint[], owners = points.map(() => 0)) {
  const spots = layoutFoods(points)
  const piles = foodPiles(spots)
  const count = Math.max(...piles) + 1
  const sprites = spots.filter((spot) => spot.shown).map(foodSpriteBox)
  const blocks: LabelBlock[] = Array.from({ length: count }, (_, pile) => {
    const boxes = spots.filter((spot, i) => spot.shown && piles[i] === pile).map(foodSpriteBox)
    const first = piles.indexOf(pile)
    return {
      pile: {
        left: Math.min(...boxes.map((b) => b.left)),
        top: Math.min(...boxes.map((b) => b.top)),
        right: Math.max(...boxes.map((b) => b.right)),
        bottom: Math.max(...boxes.map((b) => b.bottom))
      },
      width: 90,
      height: LABEL_LINE * new Set(owners.filter((_, i) => piles[i] === pile)).size,
      key: `${Math.round(points[first].x / 4)},${Math.round(points[first].y / 4)},${owners[first]}`
    }
  })
  return { spots, sprites, blocks }
}

const wide: Box = { left: -1000, top: -1000, right: 1000, bottom: 1000 }

describe('playerBox', () => {
  it('covers the body, the measured name tag, buff row and the gamble badge', () => {
    const boxes = playerBox(0, 16, 1, 0, { name: 80, buffs: 150, badge: true })
    expect(boxes).toHaveLength(4)
    const [body, name, buffs, badge] = boxes
    expect(body).toEqual({ left: -14, top: -42, right: 14, bottom: 22 })
    expect(name).toEqual({ left: -42, top: -56, right: 42, bottom: -40 })
    expect(buffs).toEqual({ left: -77, top: -72, right: 77, bottom: -56 })
    expect(badge.left).toBeLessThanOrEqual(26 - 12)
    expect(badge.right).toBeGreaterThanOrEqual(26 + 12)
    expect(playerBox(0, 16, 1, 0, NO_TAGS)).toHaveLength(2)
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

  it("keeps a food label off a buffed player's buff text (reviewer case)", () => {
    const player = playerBox(0, 16, 1, 0, { name: 70, buffs: 150, badge: false })
    const buffRow = player[2]
    const { sprites, blocks } = blocksFor([{ x: -93, y: -31 }])
    blocks[0].width = 75
    const [box] = placeLabelBlocks(blocks, [...sprites, ...player], wide)
    for (const part of player) expect(overlaps(box, part)).toBe(false)
    expect(overlaps(box, buffRow)).toBe(false)
    for (const sprite of sprites) expect(overlaps(box, sprite)).toBe(false)
  })

  it('keeps a food label off a player standing below it', () => {
    const player = playerBox(0, 16, 1, 0, NO_TAGS)
    const { sprites, blocks } = blocksFor([{ x: 0, y: -31 }])
    const [box] = placeLabelBlocks(blocks, [...sprites, ...player], wide)
    for (const part of player) expect(overlaps(box, part)).toBe(false)
  })

  it('keeps labels inside the viewport near its top edge', () => {
    const viewport = { left: -636, top: -356, right: 636, bottom: 356 }
    const { sprites, blocks } = blocksFor(Array.from({ length: 3 }, () => ({ x: 100, y: -325 })))
    const placed = placeLabelBlocks(blocks, sprites, viewport)
    for (const box of placed) expect(inside(box, viewport)).toBe(true)
  })

  it('fits 32 foods of 8 owners on one spot into at most 8 lines inside a 1280×400 view', () => {
    const viewport = { left: -636, top: -196, right: 636, bottom: 196 }
    const points = Array.from({ length: 32 }, () => ({ x: 0, y: 0 }))
    const owners = points.map((_, i) => i % 8)
    const spots = layoutFoods(points)
    const piles = foodPiles(spots)
    const lines = foodLabelLines(
      points.map((_, i) => ({
        pile: piles[i],
        owner: owners[i],
        effect: COOKING_ITEMS[Math.floor(i / 8)],
        name: `P${owners[i] + 1}`,
        label: COOKING_EFFECTS[COOKING_ITEMS[Math.floor(i / 8)]].label,
        short: COOKING_EFFECTS[COOKING_ITEMS[Math.floor(i / 8)]].short
      })),
      Math.max(...piles) + 1
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveLength(8)
    expect(lines[0][0]).toBe('P1：攻撃↑・防御↑・移動↑・回復')
    const block = fitFoodLines(lines[0], viewport.bottom - viewport.top)
    expect(block).toEqual(lines[0])
    const { sprites, blocks } = blocksFor(points, owners)
    expect(blocks[0].height).toBe(8 * LABEL_LINE)
    const [box] = placeLabelBlocks(blocks, sprites, viewport)
    expect(inside(box, viewport)).toBe(true)
    for (const sprite of sprites) expect(overlaps(box, sprite)).toBe(false)
  })

  it('keeps each block on its remembered spot from frame to frame', () => {
    const viewport = { left: -300, top: -200, right: 300, bottom: 200 }
    const { sprites, blocks } = blocksFor([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 60, y: 10 }
    ])
    const player = playerBox(10, -20, 1, 0, { name: 70, buffs: 120, badge: false })
    const memory = new Map<string, number>()
    const first = placeLabelBlocks(blocks, [...sprites, ...player], viewport, memory)
    expect(placeLabelBlocks(blocks, [...sprites, ...player], viewport, memory)).toEqual(first)
    // The player moves 2 px: the first block's preferred spot changes, but the remembered one is still free.
    const moved = player.map((b) => ({ ...b, left: b.left + 2, right: b.right + 2 }))
    const next = placeLabelBlocks(blocks, [...sprites, ...moved], viewport, memory)
    next.forEach((box, n) => {
      if (![...sprites, ...moved].some((o) => overlaps(first[n], o))) expect(box).toEqual(first[n])
    })
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
      const players = [0, 1].flatMap(() =>
        playerBox(-250 + random() * 500, -150 + random() * 330, 1, 0, { name: 70, buffs: 130, badge: true })
      )
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
