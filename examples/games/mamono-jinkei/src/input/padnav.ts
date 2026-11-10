/**
 * Gamepad menu navigation (standard mapping): d-pad / left stick move focus, A activates, B goes back (Esc),
 * Start opens or closes the pause menu. Pure edge/repeat logic; the DOM side lives in the app.
 */
import { PAD, stick } from './map'

export type NavAction = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'start'

/** Standard-mapping d-pad buttons. */
export const DPAD = { up: 12, down: 13, left: 14, right: 15 } as const

/** A gamepad reduced to what the menus read. */
export interface PadSample {
  axes: readonly number[]
  buttons: readonly boolean[]
}

/** Seconds a direction is held before it repeats, and the interval between repeats. */
export const NAV_DELAY = 0.4
export const NAV_REPEAT = 0.14
/** A stick counts as a direction press beyond this deflection (after the dead zone). */
const STICK_PRESS = 0.5

/** The direction a pad is holding: the d-pad first, else the left stick's dominant axis. */
export function navDirection(p: PadSample): 'up' | 'down' | 'left' | 'right' | undefined {
  if (p.buttons[DPAD.up]) return 'up'
  if (p.buttons[DPAD.down]) return 'down'
  if (p.buttons[DPAD.left]) return 'left'
  if (p.buttons[DPAD.right]) return 'right'
  const s = stick(p.axes[0] ?? 0, p.axes[1] ?? 0)
  if (s.m < STICK_PRESS) return undefined
  return Math.abs(s.x) > Math.abs(s.y) ? (s.x < 0 ? 'left' : 'right') : s.y < 0 ? 'up' : 'down'
}

export class PadNav {
  private prev: boolean[] | undefined
  private dir: ReturnType<typeof navDirection>
  private held = 0

  /**
   * Feeds one frame (`undefined` = no pad) and returns the menu actions it triggers. Buttons already held when the
   * pad first appears (or after `reset`) trigger nothing until released.
   */
  update(pad: PadSample | undefined, dt: number): NavAction[] {
    if (!pad) {
      this.prev = undefined
      this.dir = undefined
      return []
    }
    const out: NavAction[] = []
    const b = pad.buttons
    const was = this.prev
    this.prev = [...b]
    const rose = (i: number) => !!b[i] && !!was && !was[i]
    const dir = navDirection(pad)
    if (dir && was) {
      if (dir !== this.dir) {
        this.dir = dir
        this.held = 0
        out.push(dir)
      } else {
        const before = this.held
        this.held += dt
        // First repeat after NAV_DELAY, then every NAV_REPEAT.
        const n = (t: number) => (t < NAV_DELAY ? 0 : 1 + Math.floor((t - NAV_DELAY) / NAV_REPEAT))
        for (let i = n(before); i < n(this.held); i++) out.push(dir)
      }
    } else if (!dir) {
      this.dir = undefined
      this.held = 0
    } else this.dir = dir
    if (rose(PAD.a)) out.push('ok')
    if (rose(PAD.b)) out.push('back')
    if (rose(PAD.start)) out.push('start')
    return out
  }

  reset() {
    this.prev = undefined
    this.dir = undefined
    this.held = 0
  }
}

/** The first connected gamepad as a sample (undefined when none, or gamepads are unavailable). */
export function firstGamepad(): PadSample | undefined {
  try {
    for (const g of navigator.getGamepads?.() ?? [])
      if (g && g.connected) return { axes: Array.from(g.axes), buttons: Array.from(g.buttons, (x) => !!x?.pressed) }
  } catch {
    // Gamepads unavailable (permissions policy).
  }
  return undefined
}
