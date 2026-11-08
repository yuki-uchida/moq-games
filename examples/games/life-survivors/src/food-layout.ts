/**
 * Where dropped foods and their labels are drawn. Pure functions: the renderer gathers the inputs and draws.
 * Sprites stay within pickup reach of their real spot and never overlap; labels avoid sprites, players and each other.
 */
import { COOKING_ITEMS } from './data'

export interface FoodPoint {
  x: number
  y: number
}

export interface FoodSpot extends FoodPoint {
  /** False when no free spot was left: the food is counted on the chip of its nearest shown food instead. */
  shown: boolean
}

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Food sprites are drawn at this scale from their 16×16 frames. */
export const FOOD_SCALE = 1.5
/** Sprite pixel drawn at the food's point. */
export const FOOD_ANCHOR: FoodPoint = { x: 8, y: 12 }
/** Opaque bounds of every food frame in sprite pixels (right and bottom exclusive; the unit tests re-measure them). */
export const FOOD_OPAQUE: Box = { left: 0, top: 0, right: 16, bottom: 16 }
/** Every food bobs by up to this much, all with one shared phase. */
export const FOOD_BOB = 2
/**
 * Minimum distance between two shown food sprites along x or along y (their opaque boxes never touch): the drawn
 * opaque extent rounded up plus 1 px.
 */
export const FOOD_GAP =
  Math.ceil(Math.max(FOOD_OPAQUE.right - FOOD_OPAQUE.left, FOOD_OPAQUE.bottom - FOOD_OPAQUE.top) * FOOD_SCALE - 1e-9) +
  1
/** A shown sprite is at most this far from its food's real point. */
export const FOOD_REACH = 16
/** Foods whose drawn points are this close (transitively) share one label block. */
export const PILE_JOIN = 30
/** Height of one label line. */
export const LABEL_LINE = 15
/** Clear space kept around every placed label block, so neighbouring blocks never read as one list. */
export const BLOCK_GAP = 4

/** A placed block grown by BLOCK_GAP on every side: what later blocks must keep clear of. */
const spaced = (box: Box): Box => ({
  left: box.left - BLOCK_GAP,
  top: box.top - BLOCK_GAP,
  right: box.right + BLOCK_GAP,
  bottom: box.bottom + BLOCK_GAP
})

const CANDIDATES: readonly FoodPoint[] = [{ x: 0, y: 0 }, ...ring(8, 8), ...ring(FOOD_REACH, 12)]

function ring(radius: number, count: number): FoodPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
  })
}

/** True when sprites drawn at the two points do not overlap. */
function apart(a: FoodPoint, b: FoodPoint) {
  return Math.abs(a.x - b.x) >= FOOD_GAP || Math.abs(a.y - b.y) >= FOOD_GAP
}

/**
 * Drawn spot of each food, in input order. Each food takes the first candidate spot (its real point, then rings of 8
 * and 16 px) whose sprite overlaps no shown sprite; when none is free, a shown neighbour may step to another of its own
 * candidates to make room. A food that still finds no room is hidden, but only next to a shown sprite: its nearest
 * shown sprite is closer than FOOD_GAP to its real point, so standing on that sprite collects it. Shown sprites never
 * overlap.
 */
export function layoutFoods(points: readonly FoodPoint[]): FoodSpot[] {
  const n = points.length
  const spots: FoodSpot[] = points.map((p) => ({ x: p.x, y: p.y, shown: false }))
  /** First candidate of food i clear of every shown sprite except `skip`, and of `extra` when given. */
  const free = (i: number, skip = -1, extra?: FoodPoint): FoodPoint | undefined => {
    for (const offset of CANDIDATES) {
      const c = { x: points[i].x + offset.x, y: points[i].y + offset.y }
      if (extra && !apart(c, extra)) continue
      if (spots.every((s, j) => !s.shown || j === i || j === skip || apart(s, c))) return c
    }
    return undefined
  }
  const nearest = (p: FoodPoint, skip = -1, extra?: FoodPoint) => {
    let best = extra ? Math.hypot(extra.x - p.x, extra.y - p.y) : Infinity
    spots.forEach((s, j) => {
      if (s.shown && j !== skip) best = Math.min(best, Math.hypot(s.x - p.x, s.y - p.y))
    })
    return best
  }
  const covered = (i: number) => nearest(points[i]) < FOOD_GAP
  /** Moves one shown neighbour to another of its candidates so food i fits, keeping every hidden food covered. */
  const relocate = (i: number) => {
    for (let j = 0; j < n; j++) {
      const s = spots[j]
      if (!s.shown || j === i) continue
      if (Math.max(Math.abs(s.x - points[i].x), Math.abs(s.y - points[i].y)) >= FOOD_GAP + FOOD_REACH) continue
      for (const offset of CANDIDATES) {
        const moved = { x: points[j].x + offset.x, y: points[j].y + offset.y }
        if (moved.x === s.x && moved.y === s.y) continue
        if (!spots.every((o, k) => !o.shown || k === j || apart(o, moved))) continue
        const mine = free(i, j, moved)
        if (!mine) continue
        const keeps = spots.every((h, k) => {
          if (h.shown || k === i) return true
          const p = points[k]
          if (nearest(p) >= FOOD_GAP) return true
          return Math.min(nearest(p, j, moved), Math.hypot(mine.x - p.x, mine.y - p.y)) < FOOD_GAP
        })
        if (!keeps) continue
        spots[j] = { ...moved, shown: true }
        spots[i] = { ...mine, shown: true }
        return true
      }
    }
    return false
  }
  for (let i = 0; i < n; i++) {
    const c = free(i)
    if (c) spots[i] = { ...c, shown: true }
    else relocate(i)
  }
  // A hidden food with no shown sprite close enough is shown anyway, hiding the sprites in its way, which then look for
  // room again; of its candidate spots it takes the one leaving the fewest such foods. Bounded, so it cannot loop.
  for (let budget = 4 * n + 8; budget > 0; budget--) {
    const orphan = spots.findIndex((s, i) => !s.shown && !covered(i))
    if (orphan < 0) break
    const c = free(orphan)
    if (c) spots[orphan] = { ...c, shown: true }
    else if (!relocate(orphan)) {
      let best: FoodSpot[] | undefined
      let fewest = Infinity
      for (const offset of CANDIDATES) {
        const at = { x: points[orphan].x + offset.x, y: points[orphan].y + offset.y }
        const trial = spots.map((s, j) => (s.shown && !apart(s, at) ? { ...points[j], shown: false } : s))
        trial[orphan] = { ...at, shown: true }
        spots.forEach((s, j) => {
          if (s.shown && !trial[j].shown) {
            const room = firstFree(points, trial, j)
            if (room) trial[j] = { ...room, shown: true }
          }
        })
        const left = trial.filter((s, j) => !s.shown && nearestShown(trial, points[j]) >= FOOD_GAP).length
        if (left < fewest) {
          fewest = left
          best = trial
        }
      }
      best!.forEach((s, j) => (spots[j] = s))
    }
  }
  return spots
}

function firstFree(points: readonly FoodPoint[], spots: readonly FoodSpot[], i: number): FoodPoint | undefined {
  for (const offset of CANDIDATES) {
    const c = { x: points[i].x + offset.x, y: points[i].y + offset.y }
    if (spots.every((s, j) => !s.shown || j === i || apart(s, c))) return c
  }
  return undefined
}

function nearestShown(spots: readonly FoodSpot[], p: FoodPoint) {
  let best = Infinity
  for (const s of spots) if (s.shown) best = Math.min(best, Math.hypot(s.x - p.x, s.y - p.y))
  return best
}

/** Per food: how many hidden foods have it as their nearest shown food (always 0 for hidden foods). */
export function foodChips(spots: readonly FoodSpot[]): number[] {
  const chips = spots.map(() => 0)
  spots.forEach((spot) => {
    if (spot.shown) return
    let best = -1
    let distance = Infinity
    spots.forEach((other, j) => {
      if (!other.shown) return
      const d = Math.hypot(other.x - spot.x, other.y - spot.y)
      if (d < distance) {
        distance = d
        best = j
      }
    })
    if (best >= 0) chips[best]++
  })
  return chips
}

/** Pile index of each food (single linkage within PILE_JOIN), numbered in order of first appearance. */
export function foodPiles(spots: readonly FoodPoint[]): number[] {
  const parent = spots.map((_, i) => i)
  const root = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]]
    return i
  }
  for (let a = 0; a < spots.length; a++) {
    for (let b = a + 1; b < spots.length; b++) {
      if (Math.hypot(spots[a].x - spots[b].x, spots[a].y - spots[b].y) <= PILE_JOIN) {
        const ra = root(a)
        const rb = root(b)
        if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
      }
    }
  }
  const index = new Map<number, number>()
  return spots.map((_, i) => {
    const r = root(i)
    if (!index.has(r)) index.set(r, index.size)
    return index.get(r)!
  })
}

/** Opaque box of a food sprite drawn at a point (without the bob). Boxes of shown foods never overlap. */
export function foodSpriteBox(point: FoodPoint): Box {
  return {
    left: point.x + (FOOD_OPAQUE.left - FOOD_ANCHOR.x) * FOOD_SCALE,
    top: point.y + (FOOD_OPAQUE.top - FOOD_ANCHOR.y) * FOOD_SCALE,
    right: point.x + (FOOD_OPAQUE.right - FOOD_ANCHOR.x) * FOOD_SCALE,
    bottom: point.y + (FOOD_OPAQUE.bottom - FOOD_ANCHOR.y) * FOOD_SCALE
  }
}

/** Measured widths of what a player draws above the body. */
export interface PlayerTags {
  /** Width of the name tag canvas. */
  name: number
  /** Width of the drawn buff row (0 without buffs). */
  buffs: number
  /** Whether the gamble badge is drawn. */
  badge: boolean
}

/**
 * Boxes a player covers: body, name tag, buff row and gamble badge. Food labels keep clear of all of them.
 */
export function playerBox(x: number, feet: number, size: number, tagLift: number, tags: PlayerTags): Box[] {
  const row = (width: number, y: number): Box => ({
    left: x - width / 2,
    top: y - 8,
    right: x + width / 2,
    bottom: y + 8
  })
  const boxes = [
    { left: x - 14 * size, top: feet - 58 * size, right: x + 14 * size, bottom: feet + 6 },
    row(tags.name + 4, feet - 64 * size - tagLift)
  ]
  if (tags.buffs > 0) boxes.push(row(tags.buffs + 4, feet - 80 * size - tagLift))
  if (tags.badge) {
    const bx = x + 26 * size
    const by = feet - 50 * size
    boxes.push({ left: bx - 13, top: by - 14, right: bx + 13, bottom: by + 17 })
  }
  return boxes
}

export interface FoodLabelEntry {
  pile: number
  owner: number
  /** Food kind (one of COOKING_ITEMS). */
  effect: string
  name: string
  /** Full effect name, used when the owner has a single food in the pile. */
  label: string
  /** Short effect name, used when the owner has several foods in the pile. */
  short: string
}

/**
 * Label lines of each pile: one line per owner in order of first appearance. A single food reads 「名前：効果」;
 * several read 「名前：攻撃↑×2・回復」 with the short effect names in COOKING_ITEMS order.
 */
export function foodLabelLines(entries: readonly FoodLabelEntry[], piles: number): string[][] {
  const groups: { owner: number; first: FoodLabelEntry; count: Map<string, number>; total: number }[][] = Array.from(
    { length: piles },
    () => []
  )
  const shorts = new Map<string, string>()
  for (const entry of entries) {
    const list = groups[entry.pile]
    let group = list.find((g) => g.owner === entry.owner)
    if (!group) list.push((group = { owner: entry.owner, first: entry, count: new Map(), total: 0 }))
    group.count.set(entry.effect, (group.count.get(entry.effect) ?? 0) + 1)
    group.total++
    shorts.set(entry.effect, entry.short)
  }
  const rank = (effect: string) => {
    const index = (COOKING_ITEMS as readonly string[]).indexOf(effect)
    return index < 0 ? COOKING_ITEMS.length : index
  }
  return groups.map((list) =>
    list.map(({ first, count, total }) => {
      if (total === 1) return `${first.name}：${first.label}`
      const parts = [...count.keys()]
        .sort((a, b) => rank(a) - rank(b))
        .map((effect) => {
          const k = count.get(effect)!
          return k >= 2 ? `${shorts.get(effect)}×${k}` : shorts.get(effect)!
        })
      return `${first.name}：${parts.join('・')}`
    })
  )
}

/** The lines of a block that fit in a height; when some do not, the last kept line says how many owners are left out. */
export function fitFoodLines(lines: readonly string[], height: number): string[] {
  if (lines.length * LABEL_LINE <= height) return [...lines]
  const kept = Math.max(0, Math.floor(height / LABEL_LINE) - 1)
  return [...lines.slice(0, kept), `…ほか${lines.length - kept}人`]
}

export interface LabelBlock {
  /** Bounding box of the pile's shown sprites. */
  pile: Box
  width: number
  height: number
  /** Identifies the pile across frames (its candidate choice is remembered under it). */
  key?: string
}

function overlap(a: Box, b: Box) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return w > 0 && h > 0 ? w * h : 0
}

function inside(box: Box, view: Box) {
  return box.left >= view.left && box.right <= view.right && box.top >= view.top && box.bottom <= view.bottom
}

function union(boxes: readonly Box[]): Box {
  return boxes.reduce(
    (u, b) => ({
      left: Math.min(u.left, b.left),
      top: Math.min(u.top, b.top),
      right: Math.max(u.right, b.right),
      bottom: Math.max(u.bottom, b.bottom)
    }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  )
}

/**
 * True when some part of a sprite can be seen: a point of a 5×5 grid inside its box (at (i+0.5)/5 of its width and
 * height) lies inside `visible` and inside none of `occluders` (opaque parts drawn over the canvas).
 */
export function spriteShows(sprite: Box, visible: Box, occluders: readonly Box[]): boolean {
  const w = sprite.right - sprite.left
  const h = sprite.bottom - sprite.top
  for (let i = 0; i < 5; i++) {
    const x = sprite.left + ((i + 0.5) / 5) * w
    if (x < visible.left || x > visible.right) continue
    for (let j = 0; j < 5; j++) {
      const y = sprite.top + ((j + 0.5) / 5) * h
      if (y < visible.top || y > visible.bottom) continue
      if (!occluders.some((o) => x >= o.left && x <= o.right && y >= o.top && y <= o.bottom)) return true
    }
  }
  return false
}

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** A block closer than this to its pile gets no leader line. */
export const LEADER_MIN = 8

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Leader from a block to its pile: from the block's nearest edge point (x1, y1) to the pile (x2, y2). Undefined when
 * the block is no further than LEADER_MIN from the pile.
 */
export function leaderLine(pile: Box, box: Box): Segment | undefined {
  const cx = (box.left + box.right) / 2
  const px = clamp(cx, pile.left, pile.right)
  const py = clamp((box.top + box.bottom) / 2, pile.top, pile.bottom)
  const qx = clamp(px, box.left, box.right)
  const qy = clamp(py, box.top, box.bottom)
  return Math.hypot(px - qx, py - qy) > LEADER_MIN ? { x1: qx, y1: qy, x2: px, y2: py } : undefined
}

/** True when some part of the segment runs through the open inside of the box (touching its edge does not count). */
export function segmentHitsBox(s: Segment, b: Box): boolean {
  const dx = s.x2 - s.x1
  const dy = s.y2 - s.y1
  if (dx === 0 && dy === 0) return false
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
    return true
  }
  if (!clip(-dx, s.x1 - b.left) || !clip(dx, b.right - s.x1) || !clip(-dy, s.y1 - b.top) || !clip(dy, b.bottom - s.y1))
    return false
  if (!(t1 > t0)) return false
  const t = (t0 + t1) / 2
  const x = s.x1 + dx * t
  const y = s.y1 + dy * t
  return x > b.left && x < b.right && y > b.top && y < b.bottom
}

/** True when two segments properly cross: each lies strictly on both sides of the other. Shared points do not count. */
export function segmentsCross(a: Segment, b: Segment): boolean {
  const side = (s: Segment, x: number, y: number) => Math.sign((s.x2 - s.x1) * (y - s.y1) - (s.y2 - s.y1) * (x - s.x1))
  return side(a, b.x1, b.y1) * side(a, b.x2, b.y2) < 0 && side(b, a.x1, a.y1) * side(b, a.x2, a.y2) < 0
}

/** Distance between two boxes; 0 when they touch or overlap. */
function gap(a: Box, b: Box) {
  return Math.hypot(Math.max(0, a.left - b.right, b.left - a.right), Math.max(0, a.top - b.bottom, b.top - a.bottom))
}

/**
 * True when a block without a leader plainly names its pile: its centre is above or below the pile's span, or level
 * with it beside the pile, and no other pile's sprite (`others`) is nearer to the block than the pile.
 */
export function namesPile(box: Box, pile: Box, others: readonly Box[]): boolean {
  const cx = (box.left + box.right) / 2
  const cy = (box.top + box.bottom) / 2
  if (!(cx >= pile.left && cx <= pile.right) && !(cy >= pile.top && cy <= pile.bottom)) return false
  const own = gap(box, pile)
  return others.every((o) => gap(box, o) >= own)
}

/** Steps a candidate may shift by when the preferred ones are taken. */
const SHIFT_STEPS = 8

/**
 * Candidate boxes of a block, nearest first: above, below, right and left of the pile, further up and down, the four
 * diagonals, then each of those eight shifted up, down, left or right in 15 px steps (up to 8 steps).
 */
export function labelCandidates(block: LabelBlock): Box[] {
  const { pile, width, height } = block
  const cx = (pile.left + pile.right) / 2
  const cy = (pile.top + pile.bottom) / 2
  const at = (left: number, top: number): Box => ({ left, top, right: left + width, bottom: top + height })
  const above = pile.top - 4 - height
  const below = pile.bottom + 4
  const right = pile.right + 6
  const left = pile.left - 6 - width
  const sides = [
    at(cx - width / 2, above),
    at(cx - width / 2, below),
    at(right, cy - height / 2),
    at(left, cy - height / 2)
  ]
  const list = [...sides]
  for (let k = 1; k <= 6; k++) list.push(at(cx - width / 2, above - k * LABEL_LINE))
  for (let k = 1; k <= 6; k++) list.push(at(cx - width / 2, below + k * LABEL_LINE))
  const corners = [at(right, above), at(left, above), at(right, below), at(left, below)]
  list.push(...corners)
  const bases = [...sides, ...corners]
  for (let k = 1; k <= SHIFT_STEPS; k++) {
    const d = k * LABEL_LINE
    for (const base of bases)
      list.push(
        at(base.left, base.top - d),
        at(base.left, base.top + d),
        at(base.left - d, base.top),
        at(base.left + d, base.top)
      )
  }
  const seen = new Set<string>()
  return list.filter((box) => {
    const id = `${box.left},${box.top}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/**
 * The first free candidate of a block (the remembered one first): inside the viewport, touching none of `blocked` and
 * accepted by `accept` (asked only of candidates passing those cheaper tests; it also gets the hull of all candidates).
 * Undefined when every candidate is taken.
 */
function placeOne(
  block: LabelBlock,
  blocked: readonly Box[],
  viewport: Box,
  remembered?: number,
  accept?: (box: Box, hull: Box) => boolean
): { box: Box; index: number } | undefined {
  const candidates = labelCandidates(block)
  // Only what lies near the candidates can block them.
  const hull = union(candidates)
  const near = blocked.filter((o) => overlap(o, hull) > 0)
  const fits = (box: Box) =>
    inside(box, viewport) && near.every((o) => overlap(box, o) === 0) && (!accept || accept(box, hull))
  if (remembered !== undefined && candidates[remembered] && fits(candidates[remembered]))
    return { box: candidates[remembered], index: remembered }
  const index = candidates.findIndex(fits)
  return index < 0 ? undefined : { box: candidates[index], index }
}

function recall(memory: Map<string, number> | undefined, id: string | undefined) {
  return id === undefined ? undefined : memory?.get(id)
}

function remember(memory: Map<string, number> | undefined, chosen: Map<string, number>) {
  if (!memory) return
  memory.clear()
  for (const [id, index] of chosen) memory.set(id, index)
}

/**
 * Box of each label block, in input order: the candidate remembered for its key when it is still inside the viewport
 * and free, else the first candidate inside the viewport that touches no obstacle and no block placed before.
 * Undefined (not drawn) when no candidate is free. `memory` (candidate index per block key) is read, then replaced by
 * this frame's choices.
 */
export function placeLabelBlocks(
  blocks: readonly LabelBlock[],
  obstacles: readonly Box[],
  viewport: Box,
  memory?: Map<string, number>
): (Box | undefined)[] {
  const blocked = [...obstacles]
  const chosen = new Map<string, number>()
  const boxes = blocks.map((block) => {
    const spot = placeOne(block, blocked, viewport, recall(memory, block.key))
    if (!spot) return undefined
    blocked.push(spaced(spot.box))
    if (block.key !== undefined) chosen.set(block.key, spot.index)
    return spot.box
  })
  remember(memory, chosen)
  return boxes
}

/**
 * The blocks a pile's label may shrink to, longest first: every line (cut to the height by fitFoodLines), then fewer
 * lines ending with 「…ほかn人」, the local player's line first and the other owners in pile order. The last one is a
 * single line: 「…ほかn人」, or the only owner's line.
 */
export function foodLabelVariants(lines: readonly string[], local: number, height: number): string[][] {
  const first = fitFoodLines(lines, height)
  const n = lines.length
  if (n <= 1) return [first]
  const variants = first.length > 1 ? [first] : []
  const ordered = local >= 0 && local < n ? [lines[local], ...lines.filter((_, i) => i !== local)] : [...lines]
  for (let m = Math.min(first.length, n) - 1; m >= 1; m--)
    variants.push([...ordered.slice(0, m - 1), `…ほか${n - (m - 1)}人`])
  if (!variants.length) variants.push([`…ほか${n}人`])
  return variants
}

/** A pile to label: the boxes of its shown sprites and one line per owner in pile order. */
export interface FoodLabelPile {
  sprites: readonly Box[]
  lines: readonly string[]
  /** Index of the local player's line, or -1. */
  local: number
  /** Identifies the pile across frames (its candidate choice is remembered under it). */
  key?: string
}

export interface FoodLabelPlacement {
  /** Index of the pile in the input. */
  pile: number
  box: Box
  lines: string[]
  /** Thin line from the block to its pile, when the block is further away than LEADER_MIN. */
  leader?: Segment
}

const reaches = (b: Box, hull: Box) =>
  b.left <= hull.right && b.right >= hull.left && b.top <= hull.bottom && b.bottom >= hull.top
const segmentBox = (s: Segment): Box => ({
  left: Math.min(s.x1, s.x2),
  top: Math.min(s.y1, s.y2),
  right: Math.max(s.x1, s.x2),
  bottom: Math.max(s.y1, s.y2)
})

/**
 * Label blocks of the piles, in input order. A pile gets a block only when one of its sprites shows (spriteShows): some
 * of it lies inside `visible` (the visible world) and outside every `occluders` box (opaque parts drawn over the
 * canvas, which should also be among the obstacles). Each block takes the remembered or first free candidate inside
 * `viewport`, clear of every obstacle and every block placed before; when none is free it shrinks (foodLabelVariants)
 * and tries again, and when even its single line finds no room it is not drawn this frame. So blocks never overlap
 * each other or an obstacle and stay inside the viewport. No block sits on an earlier leader. A block further from its
 * pile than LEADER_MIN gets a `leader` line, kept clear of every placed block, every obstacle but the pile's own
 * sprites and every earlier leader; a nearer block must plainly name its pile (namesPile). `measure` gives a text's
 * width; `memory` (candidate index per pile key) is read, then replaced by this frame's choices.
 */
export function placeFoodLabels(
  piles: readonly FoodLabelPile[],
  obstacles: readonly Box[],
  visible: Box,
  viewport: Box,
  measure: (text: string) => number,
  memory?: Map<string, number>,
  occluders: readonly Box[] = []
): FoodLabelPlacement[] {
  const placed: FoodLabelPlacement[] = []
  const blocked = [...obstacles]
  const rawBoxes: Box[] = []
  const leaders: Segment[] = []
  const chosen = new Map<string, number>()
  piles.forEach((pile, n) => {
    if (!pile.lines.length || !pile.sprites.some((sprite) => spriteShows(sprite, visible, occluders))) return
    const bounds = union(pile.sprites)
    const isOwn = (o: Box) =>
      pile.sprites.some((s) => s.left === o.left && s.top === o.top && s.right === o.right && s.bottom === o.bottom)
    for (const lines of foodLabelVariants(pile.lines, pile.local, viewport.bottom - viewport.top)) {
      const block: LabelBlock = {
        pile: bounds,
        width: Math.max(...lines.map(measure)) + 4,
        height: lines.length * LABEL_LINE,
        key: pile.key
      }
      // What a leader or a block could meet near this block's candidates, found on the first candidate asked about.
      let near: { boxes: Box[]; lines: Segment[]; others: Box[] } | undefined
      const accept = (box: Box, hull: Box) => {
        if (!near) {
          const area = union([hull, bounds])
          near = {
            boxes: [...rawBoxes, ...obstacles.filter((o) => !isOwn(o))].filter((o) => reaches(o, area)),
            lines: leaders.filter((l) => reaches(segmentBox(l), area)),
            others: piles.flatMap((other, m) => (m === n ? [] : other.sprites)).filter((o) => reaches(o, area))
          }
        }
        if (near.lines.some((l) => segmentHitsBox(l, box))) return false
        const line = leaderLine(bounds, box)
        if (!line) return namesPile(box, bounds, near.others)
        return !near.boxes.some((o) => segmentHitsBox(line, o)) && !near.lines.some((l) => segmentsCross(line, l))
      }
      const spot = placeOne(block, blocked, viewport, recall(memory, pile.key), accept)
      if (!spot) continue
      const leader = leaderLine(bounds, spot.box)
      placed.push(leader ? { pile: n, box: spot.box, lines, leader } : { pile: n, box: spot.box, lines })
      rawBoxes.push(spot.box)
      if (leader) leaders.push(leader)
      blocked.push(spaced(spot.box))
      if (pile.key !== undefined) chosen.set(pile.key, spot.index)
      break
    }
  })
  remember(memory, chosen)
  return placed
}
