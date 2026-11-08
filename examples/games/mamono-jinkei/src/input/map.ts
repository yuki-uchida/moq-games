/** Pure input mapping (DESIGN §5): keys → actions, movement vectors, mouse aim and gamepad axes. */

export type Action = 'up' | 'down' | 'left' | 'right' | 'action' | 'interact' | 'mode' | 'switch' | 'signal' | 'menu'

/** Physical key codes (layout independent) for each action. */
export const KEYMAP: Readonly<Record<string, Action>> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'action',
  KeyE: 'interact',
  KeyQ: 'mode',
  Tab: 'switch',
  KeyF: 'signal',
  Escape: 'menu'
}

export const actionOf = (code: string): Action | undefined => KEYMAP[code]

/** Keys whose browser default (scrolling, focus moves) must be suppressed while playing. */
export const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/** Movement vector (length ≤ 1) from held directions. */
export function moveVector(up: boolean, down: boolean, left: boolean, right: boolean): { mx: number; my: number } {
  let mx = (right ? 1 : 0) - (left ? 1 : 0)
  let my = (down ? 1 : 0) - (up ? 1 : 0)
  if (mx && my) (mx *= Math.SQRT1_2), (my *= Math.SQRT1_2)
  return { mx, my }
}

/**
 * Aim from the hero's on-screen position toward the cursor (both CSS px) with the distance converted to art px.
 * Keeps the previous angle when the cursor sits on the hero.
 */
export function aimFrom(
  heroX: number,
  heroY: number,
  cursorX: number,
  cursorY: number,
  artPerCss: number,
  previous: number
): { aim: number; aimDist: number } {
  const dx = cursorX - heroX
  const dy = cursorY - heroY
  const d = Math.hypot(dx, dy)
  return { aim: d < 2 ? previous : Math.atan2(dy, dx), aimDist: d * artPerCss }
}

/** Radial dead zone for a stick: 0 inside `dead`, rescaled to 0..1 outside, length ≤ 1. */
export function stick(x: number, y: number, dead = 0.22): { x: number; y: number; m: number } {
  const m = Math.hypot(x, y)
  if (!Number.isFinite(m) || m < dead) return { x: 0, y: 0, m: 0 }
  const k = Math.min(1, (m - dead) / (1 - dead)) / m
  return { x: x * k, y: y * k, m: Math.min(1, (m - dead) / (1 - dead)) }
}

/** Standard-mapping gamepad buttons. */
export const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, back: 8, start: 9 } as const

/** Counts a rising edge: returns 1 when `now` is pressed and `before` was not. */
export const edge = (now: boolean, before: boolean) => (now && !before ? 1 : 0)
