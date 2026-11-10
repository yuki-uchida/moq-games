import { describe, expect, it } from 'vitest'
import { sheet } from '../src/art/index'
import { COOKING_EFFECTS, COOKING_ITEMS } from '../src/data'
import {
  BLOCK_GAP,
  boxGap,
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
  LABEL_CLEARANCE,
  labelClearance,
  LABEL_LINE,
  LABEL_PATIENCE_MS,
  LABEL_RETURN_MS,
  layoutFoods,
  leaderLine,
  LEADER_MIN,
  namesPile,
  placeFoodLabels,
  placeLabelBlocks,
  playerBox,
  segmentHitsBox,
  segmentsCross,
  spriteShows,
  type Box,
  type FoodLabelEntry,
  type FoodLabelPile,
  type FoodLabelPlacement,
  type FoodPoint,
  type FoodSpot,
  type LabelBlock,
  type LabelMemory,
  type Segment
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

  it('puts the gamble badge box on the side the badge is drawn', () => {
    const tags = { name: 80, buffs: 0, badge: true }
    const right = playerBox(0, 16, 1, 0, { ...tags, badgeSide: 1 })[2]
    const left = playerBox(0, 16, 1, 0, { ...tags, badgeSide: -1 })[2]
    expect(playerBox(0, 16, 1, 0, tags)[2]).toEqual(right)
    expect(right.left).toBeLessThanOrEqual(26 - 12)
    expect(right.right).toBeGreaterThanOrEqual(26 + 12)
    expect(left).toEqual({ ...right, left: -right.right, right: -right.left })
    expect(left.right).toBeLessThan(0)
  })
})

describe('labelClearance', () => {
  const label: Box = { left: 0, top: 0, right: 40, bottom: 15 }
  it('measures the space between boxes, 0 when they touch or overlap', () => {
    expect(boxGap(label, { left: 50, top: 0, right: 60, bottom: 10 })).toBe(10)
    expect(boxGap(label, { left: 43, top: 19, right: 60, bottom: 30 })).toBe(5)
    expect(boxGap(label, { left: 40, top: 15, right: 60, bottom: 30 })).toBe(0)
    expect(boxGap(label, { left: 10, top: 5, right: 20, bottom: 10 })).toBe(0)
  })

  it('fades a label out as the nearest player box closes in, gone before they touch', () => {
    const at = (gap: number) => labelClearance(label, [{ left: 40 + gap, top: 0, right: 80 + gap, bottom: 15 }])
    expect(labelClearance(label, [])).toBe(1)
    expect(at(LABEL_CLEARANCE + 30)).toBe(1)
    expect(at(LABEL_CLEARANCE)).toBe(1)
    expect(at(LABEL_CLEARANCE / 2)).toBeCloseTo(0.5)
    expect(at(0)).toBe(0)
    expect(at(-10)).toBe(0)
    // Smooth: no step between neighbouring distances.
    for (let gap = 0; gap < LABEL_CLEARANCE; gap += 0.5) expect(at(gap + 0.5) - at(gap)).toBeLessThanOrEqual(0.05)
    // The nearest of several players decides.
    expect(
      labelClearance(label, [
        { left: 100, top: 0, right: 120, bottom: 15 },
        { left: 43, top: 0, right: 60, bottom: 15 }
      ])
    ).toBeCloseTo(3 / LABEL_CLEARANCE)
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
    const memory: LabelMemory = new Map()
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

const sameBox = (a: Box, b: Box) => a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom

/** Leaders stay off every other block, every obstacle but their pile's own sprites, and each other. */
function expectLeadersClear(placed: FoodLabelPlacement[], piles: readonly FoodLabelPile[], obstacles: Box[]) {
  placed.forEach((p, n) => {
    if (!p.leader) return
    const own = piles[p.pile].sprites
    placed.forEach((q, m) => {
      if (m !== n) expect(segmentHitsBox(p.leader!, q.box)).toBe(false)
      if (m > n && q.leader) expect(segmentsCross(p.leader!, q.leader)).toBe(false)
    })
    for (const o of obstacles) if (!own.some((b) => sameBox(b, o))) expect(segmentHitsBox(p.leader, o)).toBe(false)
  })
}

const boundsOf = (boxes: readonly Box[]): Box =>
  boxes.reduce((u, b) => ({
    left: Math.min(u.left, b.left),
    top: Math.min(u.top, b.top),
    right: Math.max(u.right, b.right),
    bottom: Math.max(u.bottom, b.bottom)
  }))

/** Sprites of every pile but the n-th. */
const otherSprites = (piles: readonly FoodLabelPile[], n: number) =>
  piles.flatMap((pile, m) => (m === n ? [] : pile.sprites))

/** A block without a leader plainly names its pile. */
function expectNamed(placed: FoodLabelPlacement[], piles: readonly FoodLabelPile[]) {
  for (const p of placed)
    if (!p.leader) expect(namesPile(p.box, boundsOf(piles[p.pile].sprites), otherSprites(piles, p.pile))).toBe(true)
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
    const memory: LabelMemory = new Map()
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
      const occluders = hud.filter(() => random() < 0.5)
      const obstacles = [...sprites, ...players, ...hud]
      const placed = placeFoodLabels(piles, obstacles, s.visible, s.viewport, measure, undefined, occluders)
      expectClear(placed, obstacles, s.viewport)
      expectLeadersClear(placed, piles, obstacles)
      expectNamed(placed, piles)
      piles.forEach((pile, n) => {
        const onScreen = pile.sprites.some((b) => spriteShows(b, s.visible, occluders))
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
        const earlier = placed.filter((p) => p.pile < n)
        const before = earlier.map((p) => grow(p.box, BLOCK_GAP))
        const bounds = boundsOf(pile.sprites)
        const block = { pile: bounds, width: Math.max(...one.map(measure)) + 4, height: one.length * LABEL_LINE }
        expect(
          labelCandidates(block).some((c) => {
            if (!inside(c, s.viewport) || [...obstacles, ...before].some((o) => overlaps(c, o))) return false
            if (earlier.some((e) => e.leader && segmentHitsBox(e.leader, c))) return false
            const line = leaderLine(bounds, c)
            if (!line) return namesPile(c, bounds, otherSprites(piles, n))
            const others = obstacles.filter((o) => !pile.sprites.some((b) => sameBox(b, o)))
            return !(
              [...earlier.map((e) => e.box), ...others].some((o) => segmentHitsBox(line, o)) ||
              earlier.some((e) => e.leader && segmentsCross(line, e.leader))
            )
          })
        ).toBe(false)
      })
    }
    expect(visiblePiles).toBeGreaterThan(300)
    expect(dropped / visiblePiles).toBeLessThan(0.08)
  })
})

describe('spriteShows', () => {
  const visible: Box = { left: 0, top: 0, right: 100, bottom: 100 }
  const sprite: Box = { left: 40, top: 40, right: 60, bottom: 60 }
  it('is false when one occluder covers the sprite and true when a part sticks out', () => {
    expect(spriteShows(sprite, visible, [])).toBe(true)
    expect(spriteShows(sprite, visible, [{ left: 30, top: 30, right: 70, bottom: 70 }])).toBe(false)
    expect(spriteShows(sprite, visible, [{ left: 30, top: 30, right: 55, bottom: 70 }])).toBe(true)
  })
  it('is false when two occluders together cover the sprite', () => {
    const halves = [
      { left: 30, top: 30, right: 50, bottom: 70 },
      { left: 50, top: 30, right: 70, bottom: 70 }
    ]
    expect(spriteShows(sprite, visible, halves)).toBe(false)
    expect(spriteShows(sprite, visible, [halves[0]])).toBe(true)
  })
  it('is false outside the visible box and true when only part of it is inside', () => {
    expect(spriteShows({ left: 120, top: 40, right: 140, bottom: 60 }, visible, [])).toBe(false)
    expect(spriteShows({ left: 90, top: 40, right: 110, bottom: 60 }, visible, [])).toBe(true)
  })
})

describe('leader lines', () => {
  const pile: Box = { left: 0, top: 0, right: 24, bottom: 24 }
  it('has none for a block touching the pile', () => {
    expect(leaderLine(pile, { left: -10, top: 28, right: 40, bottom: 43 })).toBeUndefined()
    expect(LEADER_MIN).toBe(8)
  })
  it('runs from the block edge to the pile box for a distant block', () => {
    const box: Box = { left: 100, top: 60, right: 190, bottom: 75 }
    const l = leaderLine(pile, box)!
    expect(l).toBeDefined()
    // Block end on the block's edge, pile end on the pile's box.
    expect(l.x1 >= box.left && l.x1 <= box.right && l.y1 >= box.top && l.y1 <= box.bottom).toBe(true)
    expect(l.x1 === box.left || l.x1 === box.right || l.y1 === box.top || l.y1 === box.bottom).toBe(true)
    expect(l.x2 >= pile.left && l.x2 <= pile.right && l.y2 >= pile.top && l.y2 <= pile.bottom).toBe(true)
    expect(l.x2 === pile.left || l.x2 === pile.right || l.y2 === pile.top || l.y2 === pile.bottom).toBe(true)
  })
})

describe('namesPile', () => {
  const pile: Box = { left: 0, top: 0, right: 24, bottom: 24 }
  const above = (left: number): Box => ({ left, top: -19, right: left + 90, bottom: -4 })
  it('takes a block centred above, below or level beside its pile', () => {
    expect(namesPile(above(-33), pile, [])).toBe(true)
    expect(namesPile({ left: -33, top: 28, right: 57, bottom: 43 }, pile, [])).toBe(true)
    expect(namesPile({ left: 30, top: 4.5, right: 120, bottom: 19.5 }, pile, [])).toBe(true)
  })
  it('refuses a block whose centre is off the pile both ways, as at a corner or shifted along a row', () => {
    expect(namesPile(above(-63), pile, [])).toBe(false)
    expect(namesPile({ left: 30, top: -19, right: 120, bottom: -4 }, pile, [])).toBe(false)
  })
  it('refuses a block nearer to another pile than to its own', () => {
    // A row neighbour as near as the pile is fine; one nearer is not.
    expect(namesPile(above(-33), pile, [{ left: 31, top: 0, right: 55, bottom: 24 }])).toBe(true)
    expect(namesPile(above(-33), pile, [{ left: 0, top: -40, right: 24, bottom: -21 }])).toBe(false)
  })
})

describe('segmentHitsBox and segmentsCross', () => {
  const box: Box = { left: 10, top: 10, right: 20, bottom: 20 }
  const seg = (x1: number, y1: number, x2: number, y2: number): Segment => ({ x1, y1, x2, y2 })
  it('hits a box only through its open inside', () => {
    expect(segmentHitsBox(seg(0, 15, 30, 15), box)).toBe(true)
    expect(segmentHitsBox(seg(0, 0, 30, 30), box)).toBe(true)
    expect(segmentHitsBox(seg(12, 12, 14, 14), box)).toBe(true)
    expect(segmentHitsBox(seg(0, 5, 30, 5), box)).toBe(false)
    expect(segmentHitsBox(seg(0, 10, 30, 10), box)).toBe(false)
    expect(segmentHitsBox(seg(10, 0, 10, 30), box)).toBe(false)
    expect(segmentHitsBox(seg(0, 0, 10, 10), box)).toBe(false)
    expect(segmentHitsBox(seg(20, 20, 30, 30), box)).toBe(false)
    expect(segmentHitsBox(seg(0, 15, 9, 15), box)).toBe(false)
    expect(segmentHitsBox(seg(15, 15, 15, 15), box)).toBe(false)
  })
  it('crosses only when each segment passes through the other', () => {
    expect(segmentsCross(seg(0, 0, 10, 10), seg(0, 10, 10, 0))).toBe(true)
    expect(segmentsCross(seg(0, 0, 10, 0), seg(0, 5, 10, 5))).toBe(false)
    expect(segmentsCross(seg(0, 0, 10, 10), seg(10, 10, 20, 0))).toBe(false)
    expect(segmentsCross(seg(0, 0, 10, 0), seg(5, 0, 5, 10))).toBe(false)
    expect(segmentsCross(seg(0, 0, 10, 0), seg(12, 0, 20, 0))).toBe(false)
    expect(segmentsCross(seg(0, 0, 10, 0), seg(5, 0, 15, 0))).toBe(false)
  })
})

describe('hidden foods and leader lines in placeFoodLabels', () => {
  it('labels no pile hidden behind an opaque box, and one that shows in part', () => {
    const s = screen(1280, 720)
    const { sprites, piles } = labelPiles(
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 }
      ],
      [0, 1]
    )
    const cover = grow(sprites[0], 6)
    const hidden = placeFoodLabels(piles, [...sprites, cover], s.visible, s.viewport, measure, undefined, [cover])
    expect(hidden.map((p) => p.pile)).toEqual([1])
    // A second sprite of the pile sticks out of the cover: the pile keeps its label.
    const two = labelPiles(
      [
        { x: 0, y: 0 },
        { x: 26, y: 0 }
      ],
      [0, 0]
    )
    const part = grow(two.sprites[0], 6)
    const shown = placeFoodLabels(two.piles, [...two.sprites, part], s.visible, s.viewport, measure, undefined, [part])
    expect(shown.map((p) => p.pile)).toEqual([0])
    // Without occluders the covered pile is labelled as before.
    expect(placeFoodLabels(piles, [...sprites, cover], s.visible, s.viewport, measure)).toHaveLength(2)
  })

  it('keeps the leader of a pushed-away label off the labels of piles in between', () => {
    for (const [width, height, x0, y0] of [
      [1280, 720, 80, 60],
      [390, 844, -80, 90]
    ]) {
      const s = screen(width, height)
      const points = Array.from({ length: 6 }, (_, i) => ({ x: x0 + 31 * i, y: y0 }))
      const { sprites, piles } = labelPiles(points, [0, 0, 0, 0, 0, 0])
      expect(piles).toHaveLength(6)
      const players = playerBox(0, 0, 1, 0, { name: 60, buffs: 0, badge: false })
      const obstacles = [...sprites, ...players]
      const placed = placeFoodLabels(piles, obstacles, s.visible, s.viewport, measure)
      expectClear(placed, obstacles, s.viewport)
      expectLeadersClear(placed, piles, obstacles)
      expectNamed(placed, piles)
      expect(placed.length).toBeGreaterThan(0)
    }
  })
})

describe('placeFoodLabels over time', () => {
  const s = screen(1280, 720)
  const one = labelPiles([{ x: 0, y: 0 }], [0])
  const place = (
    obstacles: Box[],
    memory?: LabelMemory,
    now = 0,
    players: Box[] = []
  ): FoodLabelPlacement | undefined =>
    placeFoodLabels(
      one.piles,
      [...one.sprites, ...obstacles],
      s.visible,
      s.viewport,
      measure,
      memory,
      [],
      players,
      now
    )[0]
  const home = place([])!
  /** A banner over the preferred spot only. */
  const banner: Box = { ...home.box, left: home.box.left - 2, right: home.box.right + 2 }

  it('puts the preferred spot back only after it has stayed free for LABEL_RETURN_MS', () => {
    const memory: LabelMemory = new Map()
    const pushed = place([banner], memory, 0)!
    expect(pushed.box).not.toEqual(home.box)
    const t0 = 5000
    expect(place([], memory, t0)!.box).toEqual(pushed.box)
    expect(place([], memory, t0 + LABEL_RETURN_MS - 1)!.box).toEqual(pushed.box)
    expect(place([], memory, t0 + LABEL_RETURN_MS)!.box).toEqual(home.box)
  })

  it('restarts the wait when the spot is taken again', () => {
    const memory: LabelMemory = new Map()
    const pushed = place([banner], memory, 0)!
    const t0 = 5000
    expect(place([], memory, t0)!.box).toEqual(pushed.box)
    expect(place([banner], memory, t0 + 200)!.box).toEqual(pushed.box)
    expect(place([], memory, t0 + 300)!.box).toEqual(pushed.box)
    expect(place([], memory, t0 + 699)!.box).toEqual(pushed.box)
    expect(place([], memory, t0 + 700)!.box).toEqual(home.box)
  })

  it('keeps a spot a passing player covers, and moves once, only after LABEL_PATIENCE_MS', () => {
    const memory: LabelMemory = new Map()
    const first = place([], memory, 0)!
    expect(first.box).toEqual(home.box)
    const cover = [{ ...home.box }]
    const t0 = 1000
    expect(first.onPlayer).toBeUndefined()
    for (const dt of [0, 300, LABEL_PATIENCE_MS - 1]) {
      const kept = place([], memory, t0 + dt, cover)!
      expect(kept.box).toEqual(first.box)
      expect(kept.leader).toEqual(first.leader)
      // Kept in place under the player, it is marked so the renderer leaves it out meanwhile.
      expect(kept.onPlayer).toBe(true)
    }
    // The player leaves in time: nothing ever moved.
    const left = place([], memory, t0 + LABEL_PATIENCE_MS + 5, [])!
    expect(left.box).toEqual(first.box)
    expect(left.onPlayer).toBeUndefined()
    // Covered for good: one move to the first spot clear of the player.
    const memory2: LabelMemory = new Map()
    place([], memory2, 0)
    for (const dt of [0, 400, LABEL_PATIENCE_MS - 1]) place([], memory2, t0 + dt, cover)
    const moved = place([], memory2, t0 + LABEL_PATIENCE_MS, cover)!
    expect(moved.box).toEqual(place([], undefined, 0, cover)!.box)
    expect(moved.box).not.toEqual(first.box)
    expect(moved.onPlayer).toBeUndefined()
    expect(place([], memory2, t0 + LABEL_PATIENCE_MS + 16, cover)!.box).toEqual(moved.box)
  })

  it('does not jitter while a player walks up to the label from below', () => {
    const memory: LabelMemory = new Map()
    const tags = { name: 60, buffs: 140, badge: false }
    let last: Box | undefined
    let changes = 0
    let now = 0
    for (let feet = 260; feet >= -260; feet -= 2) {
      const players = playerBox(home.box.left + 20, feet, 1, 0, tags)
      const placed = place([], memory, now, players)
      if (placed && last && !sameBox(placed.box, last)) changes++
      if (placed) last = placed.box
      now += 16
    }
    expect(changes).toBeLessThanOrEqual(1)
  })

  it('places a label outside the fade of a player standing next to it, so it reads opaque', () => {
    // The player's tags stand just right of the preferred spot: clear of it, but inside the fade.
    const width = home.box.right - home.box.left
    const near: Box[] = [{ ...home.box, left: home.box.right + 5, right: home.box.right + 5 + width }]
    expect(labelClearance(home.box, near)).toBeLessThan(1)
    const fresh = place([], undefined, 0, near)!
    expect(labelClearance(fresh.box, near)).toBe(1)
    // One already there gives way once the player has stood by it for LABEL_PATIENCE_MS.
    const memory: LabelMemory = new Map()
    expect(place([], memory, 0)!.box).toEqual(home.box)
    for (const dt of [0, 400, LABEL_PATIENCE_MS - 1]) expect(place([], memory, 1000 + dt, near)!.box).toEqual(home.box)
    const moved = place([], memory, 1000 + LABEL_PATIENCE_MS, near)!
    expect(labelClearance(moved.box, near)).toBe(1)
    expect(moved.onPlayer).toBeUndefined()
  })

  it('still labels a pile with no spot outside the fade, on a spot merely clear of the players', () => {
    const player: Box[] = [
      { left: home.box.right + 5, top: home.box.top, right: home.box.right + 60, bottom: home.box.bottom }
    ]
    const args = [one.piles, one.sprites, s.visible, s.viewport, measure, undefined, [], player, 0, []] as const
    // Grown by the whole screen, the player leaves no spot outside the fade.
    const [crowded] = placeFoodLabels(...args, 2000)
    expect(crowded).toBeDefined()
    expect(overlaps(crowded.box, player[0])).toBe(false)
    expect(crowded.onPlayer).toBeUndefined()
    const [roomy] = placeFoodLabels(...args)
    expect(labelClearance(roomy.box, player)).toBe(1)
  })

  it('does not move a settled block while time passes with the same obstacles', () => {
    const memory: LabelMemory = new Map()
    const players = playerBox(home.box.left + 400, 100, 1, 0, { name: 60, buffs: 0, badge: false })
    const settled = place([banner], memory, 0, players)!
    for (let now = 16; now < 5000; now += 16) expect(place([banner], memory, now, players)!.box).toEqual(settled.box)
  })
})

describe('placeFoodLabels with transient boxes (banners)', () => {
  const s = screen(1280, 720)
  const setup = () =>
    labelPiles(
      [
        { x: 0, y: -240 },
        { x: 20, y: -200 },
        { x: -300, y: 100 }
      ],
      [0, 1, 0]
    )
  const run = (transient: Box[], memory: LabelMemory, now: number, extra: { piles: FoodLabelPile[]; sprites: Box[] }) =>
    placeFoodLabels(extra.piles, extra.sprites, s.visible, s.viewport, measure, memory, [], [], now, transient)

  it('hides a block crossing a transient box but keeps its box, leader and memory', () => {
    const food = setup()
    const baseMemory: LabelMemory = new Map()
    const base = run([], baseMemory, 0, food)
    const first = base[0]
    const band = grow(first.box, -1)
    const memory: LabelMemory = new Map()
    const placed = run([band], memory, 0, food)
    expect(placed).toHaveLength(base.length)
    expect(placed[0].hidden).toBe(true)
    expect(placed.filter((p) => p.hidden).length).toBeLessThan(placed.length)
    placed.forEach((p, i) => {
      expect(p.box).toEqual(base[i].box)
      expect(p.leader).toEqual(base[i].leader)
      expect(p.lines).toEqual(base[i].lines)
    })
    expect(memory).toEqual(baseMemory)
    for (const p of base) expect(p.hidden).toBeUndefined()
  })

  it('never moves a shown label while a transient box keeps sliding, and comes back unchanged afterwards', () => {
    const food = setup()
    const memory: LabelMemory = new Map()
    const base = run([], memory, 0, food)
    const shown = base.map((p) => p.box)
    let path: Box | undefined
    let now = 16
    for (let step = 0; step < 120; step++, now += 16) {
      const slide: Box = { left: -300 + step * 8, top: -300, right: -100 + step * 8, bottom: -170 }
      path = path ? boundsOf([path, slide]) : slide
      const placed = run([path], memory, now, food)
      expect(placed).toHaveLength(base.length)
      placed.forEach((p, i) => expect(p.box).toEqual(shown[i]))
    }
    const after = run([], memory, now, food)
    after.forEach((p, i) => {
      expect(p.box).toEqual(shown[i])
      expect(p.hidden).toBeUndefined()
    })
  })

  it('does not let other blocks take the spot of a hidden block', () => {
    const food = setup()
    const base = run([], new Map(), 0, food)
    const placed = run([grow(base[0].box, -1)], new Map(), 0, food)
    expect(placed[0].hidden).toBe(true)
    placed.slice(1).forEach((p) => expect(overlaps(p.box, grow(placed[0].box, BLOCK_GAP))).toBe(false))
  })
})

describe('placeFoodLabels memory of a pile that is out of sight', () => {
  it('keeps the remembered candidate while a cover hides the sprites, and places there again afterwards', () => {
    const s = screen(1280, 720)
    const { sprites, piles } = labelPiles([{ x: 0, y: 0 }], [0])
    const keyed = piles.map((p) => ({ ...p, key: 'pile' }))
    const wall = { left: -200, top: sprites[0].top - 80, right: 200, bottom: sprites[0].top - 1 }
    const memory: LabelMemory = new Map()
    // A wall over the usual spot above the pile: the block takes a later candidate, which is remembered.
    const [first] = placeFoodLabels(keyed, [...sprites, wall], s.visible, s.viewport, measure, memory, [], [], 0)
    const [plain] = placeFoodLabels(keyed, sprites, s.visible, s.viewport, measure, undefined, [], [], 0)
    expect(first.box).not.toEqual(plain.box)
    const index = memory.get('pile')!.index
    // A cover over the sprites: no label, but the memory stays.
    const cover = grow(sprites[0], 6)
    expect(
      placeFoodLabels(keyed, [...sprites, cover], s.visible, s.viewport, measure, memory, [cover], [], 16)
    ).toEqual([])
    expect(memory.get('pile')).toEqual({ index })
    // The cover and the wall are gone: the label is back at the remembered box, not at the first candidate.
    const [back] = placeFoodLabels(keyed, sprites, s.visible, s.viewport, measure, memory, [], [], 32)
    expect(back.box).toEqual(first.box)
    // Without the memory the block would sit elsewhere.
    expect(back.box).not.toEqual(plain.box)
  })

  it('keeps nothing for a pile without a key or a memory entry', () => {
    const s = screen(1280, 720)
    const { sprites, piles } = labelPiles([{ x: 0, y: 0 }], [0])
    const cover = grow(sprites[0], 6)
    const memory: LabelMemory = new Map()
    placeFoodLabels(piles, [...sprites, cover], s.visible, s.viewport, measure, memory, [cover])
    expect(memory.size).toBe(0)
  })
})
