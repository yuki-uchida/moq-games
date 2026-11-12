/**
 * Spatial focus navigation for menus (keyboard arrows and gamepad d-pad / stick): moves the focus to the
 * nearest focusable element in the pressed direction. Everything a mouse can click is reachable this way.
 */

export type NavDir = 'up' | 'down' | 'left' | 'right'

const SELECTOR =
  'button:not([disabled]), [data-nav]:not([aria-disabled="true"]), input:not([disabled]), select:not([disabled]), a[href]'

export function focusables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => {
    if (el.closest('[inert], .is-leaving')) return false
    if (el.tabIndex < 0 && !el.hasAttribute('data-nav')) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })
}

/** The modal on top (if any) traps navigation. */
export function navRoot(screen: HTMLElement): HTMLElement {
  const modals = screen.ownerDocument.querySelectorAll<HTMLElement>('.modal-veil')
  return modals.length ? modals[modals.length - 1] : screen
}

export function moveFocus(root: HTMLElement, dir: NavDir): HTMLElement | null {
  const items = focusables(root)
  if (!items.length) return null
  const active = document.activeElement as HTMLElement | null
  if (!active || !root.contains(active) || !items.includes(active)) {
    const first = root.querySelector<HTMLElement>('[data-autofocus]') ?? items[0]
    focusEl(first)
    return first
  }
  const a = active.getBoundingClientRect()
  const ax = a.left + a.width / 2
  const ay = a.top + a.height / 2
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of items) {
    if (el === active) continue
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const dx = cx - ax
    const dy = cy - ay
    let along: number
    let across: number
    if (dir === 'up' || dir === 'down') {
      along = dir === 'down' ? r.top - a.bottom + a.height / 2 : a.top - r.bottom + a.height / 2
      if ((dir === 'down' && dy <= 2) || (dir === 'up' && dy >= -2)) continue
      // horizontal overlap counts as aligned
      const overlap = Math.min(a.right, r.right) - Math.max(a.left, r.left)
      across = overlap > 0 ? 0 : Math.abs(dx)
    } else {
      along = dir === 'right' ? r.left - a.right + a.width / 2 : a.left - r.right + a.width / 2
      if ((dir === 'right' && dx <= 2) || (dir === 'left' && dx >= -2)) continue
      const overlap = Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top)
      across = overlap > 0 ? 0 : Math.abs(dy)
    }
    const score = Math.max(0, along) + across * 2.2
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  if (best) focusEl(best)
  return best
}

export function focusEl(el: HTMLElement | null): void {
  if (!el) return
  el.focus({ preventScroll: false })
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

/** Focuses the screen's preferred element (or the first focusable) after a screen change. */
export function focusInitial(root: HTMLElement): void {
  const el = root.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(root)[0]
  if (el) el.focus({ preventScroll: true })
}
