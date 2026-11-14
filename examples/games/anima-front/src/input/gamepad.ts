/**
 * Gamepad (standard mapping): menu navigation with key-repeat, and in-game control with dead zones, a response
 * curve for look and an aim-assist slowdown hook (DESIGN §8).
 */
import {
  applyDeadZone,
  responseCurve,
  STICK_RAD_PER_S,
  type Button,
  type ControlState,
  type UiAction
} from './controls'

/** Standard-mapping button indices. */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  MENU: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15
} as const

export const MOVE_DEAD_ZONE = 0.18
export const LOOK_DEAD_ZONE = 0.14
export const LOOK_EXPONENT = 1.8

export function firstPad(): Gamepad | null {
  try {
    const pads = navigator.getGamepads?.() ?? []
    for (const p of pads) if (p && p.connected) return p
  } catch {
    // getGamepads can throw in restricted contexts
  }
  return null
}

const pressed = (pad: Gamepad, i: number) => {
  const b = pad.buttons[i]
  return !!b && (b.pressed || b.value > 0.5)
}

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'tabPrev' | 'tabNext' | 'start'

/** Menu navigation: edges for buttons, repeat for directions (d-pad and left stick). */
export class MenuPad {
  private prev = new Set<string>()
  private repeatAt = new Map<string, number>()
  private lastPoll = -Infinity

  poll(now: number): MenuAction[] {
    // After a gap (the game owned the pad), buttons still held count as already pressed: the Menu press that
    // opened the pause menu must not also activate its first button.
    const resumed = now - this.lastPoll > 120
    this.lastPoll = now
    const pad = firstPad()
    if (!pad) {
      this.prev.clear()
      return []
    }
    const ax = pad.axes[0] ?? 0
    const ay = pad.axes[1] ?? 0
    const down = new Set<string>()
    if (pressed(pad, PAD.UP) || ay < -0.6) down.add('up')
    if (pressed(pad, PAD.DOWN) || ay > 0.6) down.add('down')
    if (pressed(pad, PAD.LEFT) || ax < -0.6) down.add('left')
    if (pressed(pad, PAD.RIGHT) || ax > 0.6) down.add('right')
    if (pressed(pad, PAD.A)) down.add('confirm')
    if (pressed(pad, PAD.B)) down.add('back')
    if (pressed(pad, PAD.LB)) down.add('tabPrev')
    if (pressed(pad, PAD.RB)) down.add('tabNext')
    if (pressed(pad, PAD.MENU)) down.add('start')
    const out: MenuAction[] = []
    if (resumed) {
      this.prev = down
      return out
    }
    for (const key of down) {
      const dir = key === 'up' || key === 'down' || key === 'left' || key === 'right'
      if (!this.prev.has(key)) {
        out.push(key as MenuAction)
        if (dir) this.repeatAt.set(key, now + 380)
      } else if (dir && now >= (this.repeatAt.get(key) ?? Infinity)) {
        out.push(key as MenuAction)
        this.repeatAt.set(key, now + 110)
      }
    }
    this.prev = down
    return out
  }
}

const BUTTON_MAP: [number, Button][] = [
  [PAD.RT, 'R'],
  [PAD.LT, 'L'],
  [PAD.A, 'jump'],
  [PAD.B, 'dash'],
  [PAD.X, 'interact']
]

/** In-game gamepad: writes into the shared ControlState. */
export class GamePad {
  private prev: boolean[] = []
  connected = false

  /** Treats buttons held right now as already pressed (a menu press must not also act in the game). */
  rearm(): void {
    const pad = firstPad()
    this.prev = pad ? pad.buttons.map((_, i) => pressed(pad, i)) : []
  }

  /**
   * @param assist 0..1 slowdown of look speed (aim assist over a target), 0 = none.
   * @returns UI actions (pause / scoreboard) triggered this frame.
   */
  poll(state: ControlState, dt: number, sensitivity: number, invertY: boolean, assist = 0): UiAction[] {
    const pad = firstPad()
    const ui: UiAction[] = []
    if (!pad) {
      if (this.connected) state.releaseSource('pad')
      this.connected = false
      this.prev = []
      return ui
    }
    this.connected = true
    const now = pad.buttons.map((_, i) => pressed(pad, i))
    const edge = (i: number) => now[i] && !this.prev[i]
    const fall = (i: number) => !now[i] && this.prev[i]
    let used = false
    for (const [i, b] of BUTTON_MAP) {
      if (edge(i)) {
        state.press(b, 'pad')
        used = true
      } else if (fall(i)) state.release(b, 'pad')
    }
    if (edge(PAD.RB)) state.command({ type: 'cycle', hand: 'R', dir: 1 })
    if (edge(PAD.LB)) state.command({ type: 'cycle', hand: 'L', dir: 1 })
    if (edge(PAD.R3)) state.command({ type: 'shoulder' })
    if (edge(PAD.MENU)) ui.push('pause')
    if (edge(PAD.VIEW)) ui.push('scoreboardOn')
    if (fall(PAD.VIEW)) ui.push('scoreboardOff')
    const [mx, my] = applyDeadZone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, MOVE_DEAD_ZONE)
    state.setStick('pad', mx, -my)
    const [lx, ly] = responseCurve(...applyDeadZone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, LOOK_DEAD_ZONE), LOOK_EXPONENT)
    if (lx || ly || mx || my) used = true
    const speed = STICK_RAD_PER_S * sensitivity * (1 - Math.max(0, Math.min(0.8, assist))) * dt
    state.look(lx * speed, (invertY ? ly : -ly) * speed * 0.75)
    if (used || ui.length) state.lastDevice = 'gamepad'
    this.prev = now
    return ui
  }
}
