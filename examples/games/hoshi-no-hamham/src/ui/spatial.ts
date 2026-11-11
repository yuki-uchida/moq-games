/** Arrow-key focus movement between the controls of a screen, by their position on screen. */

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Index of the box to move to from `from` in `dir`, or -1. Candidates must lie in that direction; the score
 * prefers small travel along the direction and penalises sideways drift, so grids move by rows and columns.
 */
export function pickNeighbour(boxes: readonly Box[], from: number, dir: Direction): number {
  const a = boxes[from]
  const ax = a.x + a.w / 2
  const ay = a.y + a.h / 2
  let best = -1
  let bestScore = Infinity
  boxes.forEach((b, i) => {
    if (i === from) return
    const bx = b.x + b.w / 2
    const by = b.y + b.h / 2
    const dx = bx - ax
    const dy = by - ay
    let along: number
    let side: number
    if (dir === 'left' || dir === 'right') {
      along = dir === 'right' ? dx : -dx
      side = Math.abs(dy)
      // Overlapping rows count as the same row.
      if (b.y < a.y + a.h && b.y + b.h > a.y) side = 0
    } else {
      along = dir === 'down' ? dy : -dy
      side = Math.abs(dx)
      if (b.x < a.x + a.w && b.x + b.w > a.x) side *= 0.25
    }
    if (along <= 1) return
    const score = along + side * 2.5
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href]'

/** The visible, enabled controls inside `root` in document order. */
export function focusables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && !el.closest('[hidden]') && !el.closest('[inert]')
  )
}

/** Moves focus inside `root`; returns false when nothing moved. */
export function moveFocus(root: ParentNode, dir: Direction): boolean {
  const items = focusables(root)
  if (!items.length) return false
  const current = items.indexOf(document.activeElement as HTMLElement)
  if (current < 0) {
    items[0].focus()
    return true
  }
  const boxes = items.map((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  const next = pickNeighbour(boxes, current, dir)
  if (next < 0) return false
  items[next].focus()
  items[next].scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  return true
}
