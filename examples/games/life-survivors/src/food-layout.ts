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

function clamp(box: Box, view: Box): Box {
  const w = box.right - box.left
  const h = box.bottom - box.top
  const left = Math.max(view.left, Math.min(box.left, view.right - w))
  const top = Math.max(view.top, Math.min(box.top, view.bottom - h))
  return { left, top, right: left + w, bottom: top + h }
}

/** Candidate boxes of a block, in order of preference. */
export function labelCandidates(block: LabelBlock): Box[] {
  const { pile, width, height } = block
  const cx = (pile.left + pile.right) / 2
  const cy = (pile.top + pile.bottom) / 2
  const at = (left: number, top: number): Box => ({ left, top, right: left + width, bottom: top + height })
  const above = pile.top - 4 - height
  const below = pile.bottom + 4
  const list = [
    at(cx - width / 2, above),
    at(cx - width / 2, below),
    at(pile.right + 6, cy - height / 2),
    at(pile.left - 6 - width, cy - height / 2)
  ]
  for (let k = 1; k <= 6; k++) list.push(at(cx - width / 2, above - k * LABEL_LINE))
  for (let k = 1; k <= 6; k++) list.push(at(cx - width / 2, below + k * LABEL_LINE))
  return list
}

/**
 * Box of each label block, in input order: the candidate remembered for its key when it is still inside the viewport
 * and free, else the first candidate inside the viewport that touches no obstacle and no block placed before, else
 * the clamped candidate with the least overlap. `memory` (candidate index per block key) is read, then replaced by
 * this frame's choices.
 */
export function placeLabelBlocks(
  blocks: readonly LabelBlock[],
  obstacles: readonly Box[],
  viewport: Box,
  memory?: Map<string, number>
): Box[] {
  const placed: Box[] = []
  const chosenIndex: number[] = []
  for (const block of blocks) {
    const candidates = labelCandidates(block)
    const cost = (box: Box) =>
      obstacles.reduce((sum, o) => sum + overlap(box, o), 0) + placed.reduce((sum, o) => sum + overlap(box, o), 0)
    const fits = (box: Box) => inside(box, viewport) && cost(box) === 0
    const remembered = block.key === undefined ? undefined : memory?.get(block.key)
    let index = remembered !== undefined && candidates[remembered] && fits(candidates[remembered]) ? remembered : -1
    if (index < 0) index = candidates.findIndex(fits)
    let chosen = index >= 0 ? candidates[index] : undefined
    if (!chosen) {
      let best = Infinity
      candidates.forEach((candidate, k) => {
        const box = clamp(candidate, viewport)
        const c = cost(box)
        if (c < best) {
          best = c
          chosen = box
          index = k
        }
      })
    }
    placed.push(chosen!)
    chosenIndex.push(index)
  }
  if (memory) {
    memory.clear()
    blocks.forEach((block, n) => {
      if (block.key !== undefined) memory.set(block.key, chosenIndex[n])
    })
  }
  return placed
}
