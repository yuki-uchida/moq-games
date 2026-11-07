import { describe, expect, it } from 'vitest'
import { sheet } from '../src/art/index'
import { COOKING_EFFECTS, COOKING_ITEMS } from '../src/data'
import {
  BLOCK_GAP,
  FOOD_ANCHOR,
  FOOD_GAP,
  FOOD_OPAQUE,
  FOOD_SCALE,
  fitFoodLines,
  foodChips,
  foodLabelLines,
  foodLabelVariants,
  foodPiles,
  foodSpriteBox,
  labelCandidates,
  LABEL_LINE,
  layoutFoods,
  placeFoodLabels,
  placeLabelBlocks,
  playerBox,
  type Box,
  type FoodLabelEntry,
  type FoodLabelPile,
  type FoodLabelPlacement,
  type FoodPoint,
  type FoodSpot,
  type LabelBlock
} from '../src/food-layout'

const gap = (a: FoodPoint, b: FoodPoint) => Math.hypot(a.x - b.x, a.y - b.y)
const grow = (box: Box, by: number): Box => ({
  left: box.left - by,
  top: box.top - by,
  right: box.right + by,
  bottom: box.bottom + by
})

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
        const before = placed.slice(0, n).filter((b): b is Box => b !== undefined)
        const free = labelCandidates(blocks[n]).some(
          (c) => inside(c, viewport) && ![...obstacles, ...before].some((o) => overlaps(c, o))
        )
        // Without a free candidate the block is left out rather than drawn over something.
        if (!free) return expect(box).toBeUndefined()
        expect(inside(box!, viewport)).toBe(true)
        for (const o of [...obstacles, ...before]) expect(overlaps(box!, o)).toBe(false)
      })
    }
  })

  it('tries the diagonals and shifted spots before giving up', () => {
    const { sprites, blocks } = blocksFor([{ x: 0, y: 0 }])
    const candidates = labelCandidates(blocks[0])
    // Every spot straight above, below, right or left is taken: the block goes to a diagonal or a shifted spot.
    const taken = candidates.slice(0, 16)
    const [box] = placeLabelBlocks(blocks, [...sprites, ...taken], wide)
    expect(box).toBeDefined()
    expect(candidates.slice(16).some((c) => c.left === box!.left && c.top === box!.top)).toBe(true)
    for (const o of [...sprites, ...taken]) expect(overlaps(box!, o)).toBe(false)
    expect(candidates.length).toBeGreaterThan(200)
  })
})

/** Rough text width of the 13 px bold label font. */
const measure = (text: string) => [...text].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 13 : 7.5), 0)

/** World viewport of a W×H screen (visible world, inset by 4 px), centred on the origin. */
function screen(width: number, height: number) {
  const scale = Math.max(width / 1280, height / 720)
  const hw = width / 2 / scale
  const hh = height / 2 / scale
  const visible = { left: -hw, top: -hh, right: hw, bottom: hh }
  const viewport = { left: -hw + 4, top: -hh + 4, right: hw - 4, bottom: hh - 4 }
  /** A screen rect (CSS px from the top left) in world units. */
  const css = (left: number, top: number, right: number, bottom: number): Box => ({
    left: left / scale - hw,
    top: top / scale - hh,
    right: right / scale - hw,
    bottom: bottom / scale - hh
  })
  return { visible, viewport, css, width, height }
}

/** Piles of foods as the renderer hands them to placeFoodLabels (sprite boxes cover the bob). */
function labelPiles(points: FoodPoint[], owners: number[], local = 0) {
  const spots = layoutFoods(points)
  const piles = foodPiles(spots)
  const count = Math.max(...piles) + 1
  const effect = (i: number) => COOKING_ITEMS[i % COOKING_ITEMS.length]
  const lines = foodLabelLines(
    points.map((_, i) => ({
      pile: piles[i],
      owner: owners[i],
      effect: effect(i),
      name: `P${owners[i] + 1}`,
      label: COOKING_EFFECTS[effect(i)].label,
      short: COOKING_EFFECTS[effect(i)].short
    })),
    count
  )
  const box = (spot: FoodSpot) => {
    const b = foodSpriteBox(spot)
    return { ...b, top: b.top - 2, bottom: b.bottom + 2 }
  }
  const sprites = spots.filter((spot) => spot.shown).map(box)
  const result: FoodLabelPile[] = Array.from({ length: count }, (_, pile) => {
    const order: number[] = []
    points.forEach((_, i) => {
      if (piles[i] === pile && !order.includes(owners[i])) order.push(owners[i])
    })
    const first = piles.indexOf(pile)
    return {
      sprites: spots.filter((spot, i) => spot.shown && piles[i] === pile).map(box),
      lines: lines[pile],
      local: order.indexOf(local),
      key: `${Math.round(points[first].x / 4)},${Math.round(points[first].y / 4)},${owners[first]}`
    }
  })
  return { sprites, piles: result }
}

/** Placed blocks stay inside the viewport and clear of every obstacle and of each other. */
function expectClear(placed: FoodLabelPlacement[], obstacles: Box[], viewport: Box) {
  placed.forEach((p, n) => {
    expect(inside(p.box, viewport)).toBe(true)
    expect(obstacles.some((o) => overlaps(p.box, o))).toBe(false)
    // Blocks keep BLOCK_GAP of clear space between them, so two piles' labels never read as one list.
    expect(placed.slice(0, n).some((q) => overlaps(p.box, grow(q.box, BLOCK_GAP)))).toBe(false)
    expect(p.box.bottom - p.box.top).toBe(p.lines.length * LABEL_LINE)
    expect(p.box.right - p.box.left).toBeGreaterThanOrEqual(Math.max(...p.lines.map(measure)))
  })
}

/** HUD of a phone in portrait: the top bar with the buttons at the right, the team list and the hand panel. */
function phoneHud(s: ReturnType<typeof screen>) {
  return [
    s.css(0, 0, s.width, 25),
    s.css(12, 32, 190, 80),
    s.css(s.width - 170, 32, s.width - 12, 70),
    s.css(s.width - 110, 92, s.width - 12, 200),
    s.css(12, s.height - 150, 250, s.height - 12)
  ]
}

describe('placeFoodLabels', () => {
  it('labels no pile whose sprites are all off screen', () => {
    const s = screen(1280, 720)
    // 690 px right of the player: the sprite is past the right edge (640) of the visible world.
    const { sprites, piles } = labelPiles(
      [
        { x: 690, y: 0 },
        { x: 100, y: 0 }
      ],
      [0, 0]
    )
    expect(piles).toHaveLength(2)
    const placed = placeFoodLabels(piles, sprites, s.visible, s.viewport, measure)
    expect(placed.map((p) => p.pile)).toEqual([1])
    // A sprite just inside the edge keeps its label, inside the viewport.
    const edge = labelPiles([{ x: 630, y: 0 }], [0])
    const [label] = placeFoodLabels(edge.piles, edge.sprites, s.visible, s.viewport, measure)
    expect(label).toBeDefined()
    expect(inside(label.box, s.viewport)).toBe(true)
  })

  it('keeps labels off a HUD rect over the top-right corner', () => {
    const s = screen(1280, 720)
    const hud = s.css(1280 - 200, 0, 1280, 90)
    const { sprites, piles } = labelPiles([{ x: 560, y: -270 }], [0])
    const [free] = placeFoodLabels(piles, sprites, s.visible, s.viewport, measure)
    expect(overlaps(free.box, hud)).toBe(true)
    const [box] = placeFoodLabels(piles, [...sprites, hud], s.visible, s.viewport, measure)
    expect(box).toBeDefined()
    expectClear([box], [...sprites, hud], s.viewport)
  })

  it('places every block of 8 players dropping foods on 4 spots of a phone apart from everything', () => {
    const s = screen(390, 844)
    const spots = [
      { x: -80, y: -150 },
      { x: 80, y: -150 },
      { x: -80, y: 100 },
      { x: 80, y: 100 }
    ]
    const points: FoodPoint[] = []
    const owners: number[] = []
    spots.forEach((spot) => {
      for (let k = 0; k < 8; k++) {
        points.push({ ...spot })
        owners.push(k)
      }
    })
    const { sprites, piles } = labelPiles(points, owners)
    const players = Array.from({ length: 8 }, (_, k) =>
      playerBox(-120 + (k % 4) * 80, k < 4 ? -30 : 40, 1, 0, { name: 60, buffs: k ? 0 : 130, badge: false })
    ).flat()
    const hud = phoneHud(s)
    const obstacles = [...sprites, ...players, ...hud]
    const memory = new Map<string, number>()
    const placed = placeFoodLabels(piles, obstacles, s.visible, s.viewport, measure, memory)
    expectClear(placed, obstacles, s.viewport)
    expect(placed.map((p) => p.pile)).toEqual([0, 1, 2, 3])
    // Shortened blocks keep the local player's line first and count the others.
    for (const p of placed)
      if (p.lines.length < 8) {
        expect(p.lines.at(-1)).toMatch(/^…ほか\d+人$/)
        if (p.lines.length > 1) expect(p.lines[0]).toMatch(/^P1：/)
      }
    // The same frame again keeps every block where it was.
    expect(placeFoodLabels(piles, obstacles, s.visible, s.viewport, measure, memory)).toEqual(placed)
  })

  it('drops a block only when not even one line has a free spot', () => {
    const s = screen(1280, 720)
    const { sprites, piles } = labelPiles(
      [
        { x: 0, y: 0 },
        { x: 26, y: 0 }
      ],
      [0, 1]
    )
    const [sprite] = sprites
    // Everything around the pile is covered except the sprites themselves.
    const walls = [
      { ...s.visible, bottom: sprite.top },
      { ...s.visible, top: sprite.bottom + 1 },
      { ...s.visible, right: sprite.left - 1 },
      { ...s.visible, left: sprites[1].right + 1 }
    ]
    expect(placeFoodLabels(piles, [...sprites, ...walls], s.visible, s.viewport, measure)).toEqual([])
    // A one-line gap below the pile is enough for 「…ほか2人」.
    const narrow = [walls[0], { ...walls[1], top: sprite.bottom + 4 + LABEL_LINE }, ...walls.slice(2)]
    const roomy = [
      ...narrow.slice(0, 2),
      { ...s.visible, right: sprite.left - 60 },
      { ...s.visible, left: sprites[1].right + 60 }
    ]
    const [one] = placeFoodLabels(piles, [...sprites, ...roomy], s.visible, s.viewport, measure)
    expect(one.lines).toEqual(['…ほか2人'])
    expectClear([one], [...sprites, ...roomy], s.viewport)
  })

  it('shrinks the local line first, then the others in pile order', () => {
    const lines = ['P1：攻撃力UP', 'P2：HP回復', 'P3：防御力UP']
    expect(foodLabelVariants(lines, 1, 1000)).toEqual([lines, ['P2：HP回復', '…ほか2人'], ['…ほか3人']])
    expect(foodLabelVariants(lines, -1, 1000)[1]).toEqual(['P1：攻撃力UP', '…ほか2人'])
    expect(foodLabelVariants(['P1：HP回復'], 0, 1000)).toEqual([['P1：HP回復']])
  })

  it('keeps every drawn block apart from everything across many crowds and screens', () => {
    let seed = 11
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const screens = [screen(390, 844), screen(844, 390), screen(1280, 720), screen(1280, 400)]
    let visiblePiles = 0
    let dropped = 0
    for (let round = 0; round < 160; round++) {
      const s = screens[round % screens.length]
      const ownerCount = 2 + Math.floor(random() * 7)
      const spotCount = 1 + Math.floor(random() * 6)
      const points: FoodPoint[] = []
      const owners: number[] = []
      for (let p = 0; p < spotCount; p++) {
        const x = s.visible.left - 20 + random() * (s.visible.right - s.visible.left + 40)
        const y = s.visible.top - 20 + random() * (s.visible.bottom - s.visible.top + 40)
        const n = 1 + Math.floor(random() * 10)
        for (let k = 0; k < n && points.length < 40; k++) {
          points.push({ x: Math.round(x), y: Math.round(y) })
          owners.push(Math.floor(random() * ownerCount))
        }
      }
      const { sprites, piles } = labelPiles(points, owners)
      const players = Array.from({ length: Math.floor(random() * 4) }, () =>
        playerBox(
          s.visible.left + random() * (s.visible.right - s.visible.left),
          s.visible.top + random() * (s.visible.bottom - s.visible.top),
          1,
          0,
          { name: 70, buffs: random() < 0.5 ? 130 : 0, badge: random() < 0.3 }
        )
      ).flat()
      const hud = phoneHud(s).slice(0, 1 + Math.floor(random() * 5))
      const obstacles = [...sprites, ...players, ...hud]
      const placed = placeFoodLabels(piles, obstacles, s.visible, s.viewport, measure)
      expectClear(placed, obstacles, s.viewport)
      piles.forEach((pile, n) => {
        const onScreen = pile.sprites.some((b) => overlaps(b, s.visible))
        const label = placed.find((p) => p.pile === n)
        if (!onScreen) return expect(label).toBeUndefined()
        visiblePiles++
        if (label) {
          // Every owner of the pile is on its own line or counted by 「…ほかn人」.
          const tail = label.lines.at(-1)!.match(/^…ほか(\d+)人$/)
          const counted = label.lines.length - (tail ? 1 : 0) + (tail ? Number(tail[1]) : 0)
          expect(counted).toBe(pile.lines.length)
          return
        }
        // Left out: even the single last line had no free candidate next to what was placed before it.
        dropped++
        const one = foodLabelVariants(pile.lines, pile.local, s.viewport.bottom - s.viewport.top).at(-1)!
        const before = placed.filter((p) => p.pile < n).map((p) => grow(p.box, BLOCK_GAP))
        const bounds = pile.sprites.reduce((u, b) => ({
          left: Math.min(u.left, b.left),
          top: Math.min(u.top, b.top),
          right: Math.max(u.right, b.right),
          bottom: Math.max(u.bottom, b.bottom)
        }))
        const block = { pile: bounds, width: Math.max(...one.map(measure)) + 4, height: one.length * LABEL_LINE }
        expect(
          labelCandidates(block).some(
            (c) => inside(c, s.viewport) && ![...obstacles, ...before].some((o) => overlaps(c, o))
          )
        ).toBe(false)
      })
    }
    expect(visiblePiles).toBeGreaterThan(300)
    expect(dropped / visiblePiles).toBeLessThan(0.03)
  })
})
