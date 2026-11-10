/** DOM side of gamepad menu navigation: moves focus, activates the focused control, nudges sliders. */
import type { NavAction } from '../input/padnav'
import { focusables } from './dom'

type Dir = Extract<NavAction, 'up' | 'down' | 'left' | 'right'>

const KEYS: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }

/** The topmost visible screen of the UI layer that has something to focus (the HUD is not a menu). */
export function topMenu(layer: HTMLElement, skip: readonly HTMLElement[]): HTMLElement | undefined {
  return Array.from(layer.children)
    .reverse()
    .find((c): c is HTMLElement => c instanceof HTMLElement && !skip.includes(c) && focusables(c).length > 0)
}

/** Nudges a slider by one step the way the arrow keys do, firing the events the settings panel listens to. */
export function nudgeRange(input: HTMLInputElement, sign: 1 | -1) {
  const step = Number(input.step) || 1
  const min = input.min === '' ? 0 : Number(input.min)
  const max = input.max === '' ? 100 : Number(input.max)
  const next = Math.min(max, Math.max(min, Number(input.value) + sign * step))
  if (next === Number(input.value)) return
  input.value = String(next)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Applies a d-pad / stick direction or A to the menu: arrows are replayed as key events on the focused control so the
 * same handlers (focus order, grids, modals, sounds) run as for the keyboard. Returns false when nothing was done.
 */
export function navigate(action: Dir | 'ok', layer: HTMLElement, skip: readonly HTMLElement[]): boolean {
  const menu = topMenu(layer, skip)
  if (!menu) return false
  const active = document.activeElement as HTMLElement | null
  if (!active || !menu.contains(active) || !focusables(menu).includes(active)) {
    focusables(menu)[0]?.focus()
    return true
  }
  if (action === 'ok') {
    if (active instanceof HTMLInputElement && active.type === 'text') return false
    active.click()
    return true
  }
  if (active instanceof HTMLInputElement && active.type === 'range' && (action === 'left' || action === 'right')) {
    nudgeRange(active, action === 'left' ? -1 : 1)
    return true
  }
  active.dispatchEvent(new KeyboardEvent('keydown', { key: KEYS[action], bubbles: true, cancelable: true }))
  return true
}

/** B inside a modal dialog: Esc on it picks the last (cancel) button. */
export function escapeModal(layer: HTMLElement): boolean {
  const modal = layer.querySelector<HTMLElement>('.modal')
  if (!modal) return false
  const target = (modal.contains(document.activeElement) ? document.activeElement : modal) as HTMLElement
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  return true
}
