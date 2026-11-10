/** An axis-aligned box (px), relative to a player's centre unless said otherwise. */
export interface OverheadBox {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * What the renderer draws over a player's head (render.ts, food-layout.ts playerBox), measured from her centre for
 * body size 1: her feet are `feet` below the centre; the name tag is centred `nameLift`·size above the feet, about
 * `nameHalf` (its text is at most about 80 px wide); each cooking buff row (render.ts draws one, two leave room) is
 * `rowStep`·size above the one below; the gamble badge floats `badgeSide`·size to either side of the head,
 * `badgeLift`·size above the feet, its box with the tail and bob `badgeBox` about that point.
 */
export const OVERHEAD = {
  feet: 16,
  nameLift: 64,
  nameHalf: { x: 40, y: 8 },
  rowStep: 16,
  rows: 2,
  badgeSide: 26,
  badgeLift: 50,
  badgeBox: { left: -13, top: -14, right: 13, bottom: 17 }
} as const

/** 過保護親's figure about her centre (its sprite spans x -14..6, flipped -6..14, and y -16..15). */
export const GUARDIAN_BODY = { x: 14, y: 16 } as const

/**
 * The boxes over a player's head of body size `size`, relative to her centre: her name tag, `rows` buff rows above
 * it, and the gamble badge on both sides of her head (`badge`).
 */
export function overheadBoxes(size: number, rows: number = OVERHEAD.rows, badge = true): OverheadBox[] {
  const name = OVERHEAD.feet - OVERHEAD.nameLift * size
  const half = OVERHEAD.nameHalf
  const boxes: OverheadBox[] = []
  for (let row = 0; row <= rows; row++) {
    const y = name - OVERHEAD.rowStep * size * row
    boxes.push({ left: -half.x, top: y - half.y, right: half.x, bottom: y + half.y })
  }
  if (badge)
    for (const side of [1, -1]) {
      const x = OVERHEAD.badgeSide * size * side
      const y = OVERHEAD.feet - OVERHEAD.badgeLift * size
      const box = OVERHEAD.badgeBox
      boxes.push({ left: x + box.left, top: y + box.top, right: x + box.right, bottom: y + box.bottom })
    }
  return boxes
}

/** A box of half-size `half` about (`x`, `y`). */
export const boxAbout = (x: number, y: number, half: { x: number; y: number }): OverheadBox => ({
  left: x - half.x,
  top: y - half.y,
  right: x + half.x,
  bottom: y + half.y
})

/** Whether two boxes overlap (touching edges do not). */
export const boxesOverlap = (a: OverheadBox, b: OverheadBox) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
