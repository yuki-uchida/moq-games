/**
 * Which element a gamepad right stick scrolls on a menu screen: the focused element's nearest scrollable
 * ancestor that can still move in the stick's direction, else the largest scrollable area of the screen.
 */

const scrollsIn = (css: string) => css === 'auto' || css === 'scroll' || css === 'overlay'

/** Whether `el` can scroll further in the direction (dx, dy). */
export function canScroll(el: HTMLElement, dx: number, dy: number): boolean {
  // The sizes are cheap; the computed style is read only for an element that has room to move that way.
  const maxY = el.scrollHeight - el.clientHeight
  const maxX = el.scrollWidth - el.clientWidth
  const roomY = dy !== 0 && maxY > 1 && (dy > 0 ? el.scrollTop < maxY - 0.5 : el.scrollTop > 0.5)
  const roomX = dx !== 0 && maxX > 1 && (dx > 0 ? el.scrollLeft < maxX - 0.5 : el.scrollLeft > 0.5)
  if (!roomY && !roomX) return false
  const style = getComputedStyle(el)
  return (roomY && scrollsIn(style.overflowY)) || (roomX && scrollsIn(style.overflowX))
}

export function scrollTargetFor(root: HTMLElement, active: Element | null, dx: number, dy: number): HTMLElement | null {
  for (let el = active as HTMLElement | null; el && root.contains(el); el = el.parentElement) {
    if (canScroll(el, dx, dy)) return el
  }
  if (canScroll(root, dx, dy)) return root
  let best: HTMLElement | null = null
  let bestArea = 0
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if (!canScroll(el, dx, dy)) continue
    const area = el.clientWidth * el.clientHeight
    if (area > bestArea) {
      best = el
      bestArea = area
    }
  }
  return best
}
