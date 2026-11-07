/**
 * Where dropped foods and their labels are drawn. Pure functions: the renderer gathers the inputs and draws.
 * Sprites stay within pickup reach of their real spot; labels avoid sprites, players and each other.
 */
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

/** Minimum distance between two shown food sprites. */
export const FOOD_GAP = 15
/** Foods whose drawn points are this close (transitively) share one label block. */
export const PILE_JOIN = 30
/** Height of one label line. */
export const LABEL_LINE = 15

const CANDIDATES: readonly FoodPoint[] = [{ x: 0, y: 0 }, ...ring(8, 8), ...ring(16, 12)]

function ring(radius: number, count: number): FoodPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
  })
}

/** Drawn spot of each food, in input order: the first candidate at least FOOD_GAP from every shown food. */
export function layoutFoods(points: readonly FoodPoint[]): FoodSpot[] {
  const shown: FoodPoint[] = []
  return points.map((point) => {
    for (const offset of CANDIDATES) {
      const x = point.x + offset.x
      const y = point.y + offset.y
      if (shown.every((other) => Math.hypot(other.x - x, other.y - y) >= FOOD_GAP)) {
        shown.push({ x, y })
        return { x, y, shown: true }
      }
    }
    return { x: point.x, y: point.y, shown: false }
  })
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

/** Box covered by a food sprite drawn at a point (1.5× sprite, bob and glow). */
export function foodSpriteBox(point: FoodPoint): Box {
  return { left: point.x - 13, top: point.y - 22, right: point.x + 13, bottom: point.y + 8 }
}

/** Box covered by a player's body, name tag and buff row. */
export function playerBox(x: number, feet: number, size: number, tagLift: number): Box {
  return { left: x - 46, top: feet - 90 * size - tagLift, right: x + 46, bottom: feet + 6 }
}

export interface FoodLabelEntry {
  pile: number
  owner: number
  effect: string
  name: string
  label: string
}

/** Label lines of each pile, aggregated by (owner, effect) in order of first appearance. */
export function foodLabelLines(entries: readonly FoodLabelEntry[], piles: number): string[][] {
  const groups: { owner: number; effect: string; text: string; count: number }[][] = Array.from(
    { length: piles },
    () => []
  )
  for (const entry of entries) {
    const list = groups[entry.pile]
    const found = list.find((g) => g.owner === entry.owner && g.effect === entry.effect)
    if (found) found.count++
    else list.push({ owner: entry.owner, effect: entry.effect, text: `${entry.name}：${entry.label}`, count: 1 })
  }
  return groups.map((list) => list.map((g) => (g.count > 1 ? `${g.text}×${g.count}` : g.text)))
}

export interface LabelBlock {
  /** Bounding box of the pile's shown sprites. */
  pile: Box
  width: number
  height: number
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
 * Box of each label block, in input order: the first candidate inside the viewport that touches no obstacle and no
 * block placed before; otherwise the clamped candidate with the least overlap.
 */
export function placeLabelBlocks(blocks: readonly LabelBlock[], obstacles: readonly Box[], viewport: Box): Box[] {
  const placed: Box[] = []
  for (const block of blocks) {
    const candidates = labelCandidates(block)
    const cost = (box: Box) =>
      obstacles.reduce((sum, o) => sum + overlap(box, o), 0) + placed.reduce((sum, o) => sum + overlap(box, o), 0)
    let chosen = candidates.find((box) => inside(box, viewport) && cost(box) === 0)
    if (!chosen) {
      let best = Infinity
      for (const candidate of candidates) {
        const box = clamp(candidate, viewport)
        const c = cost(box)
        if (c < best) {
          best = c
          chosen = box
        }
      }
    }
    placed.push(chosen!)
  }
  return placed
}
