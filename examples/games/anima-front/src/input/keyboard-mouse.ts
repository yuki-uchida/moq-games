/**
 * Keyboard + mouse with pointer lock (DESIGN §8): raw movement deltas scaled by sensitivity, invert Y,
 * mouse buttons for the paws, wheel cycles the right paw, Q/E, 1–8, Space, Shift, F, V, Tab, Esc.
 */
import { MOUSE_RAD_PER_PX, type Button, type ControlState, type UiAction } from './controls'

export interface KeyboardMouseOptions {
  /** Element that requests pointer lock (the game canvas layer). */
  target: HTMLElement
  state: ControlState
  sensitivity: () => number
  invertY: () => boolean
  /** Pause / scoreboard requests. */
  onUi: (action: UiAction) => void
  /** Pointer lock was lost without the game asking (Esc in the browser, alt-tab). */
  onLockLost: () => void
  /** False while the pause menu or results are open (keys then belong to the menus). */
  active: () => boolean
  /** Whether a click on the target takes the pointer (default yes; a spectator has nothing to aim). */
  pointerLock?: () => boolean
}

const KEY_BUTTONS: Record<string, Button> = {
  Space: 'jump',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyF: 'interact'
}

const MOVE_KEYS: Record<string, 'forward' | 'back' | 'left' | 'right'> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  ArrowUp: 'forward',
  ArrowDown: 'back',
  ArrowLeft: 'left',
  ArrowRight: 'right'
}

export interface KeyboardMouse {
  readonly locked: boolean
  requestLock(): void
  releaseLock(): void
  dispose(): void
}

export function attachKeyboardMouse(o: KeyboardMouseOptions): KeyboardMouse {
  const { state, target } = o
  let wantLock = false
  const isLocked = () => document.pointerLockElement === target

  const onKeyDown = (e: KeyboardEvent) => {
    if (!o.active()) return
    if (e.code === 'Tab') {
      e.preventDefault()
      if (!e.repeat) o.onUi('scoreboardOn')
      return
    }
    if (e.code === 'Escape') {
      // With pointer lock the browser consumes Esc and fires pointerlockchange instead.
      if (!e.repeat) o.onUi('pause')
      return
    }
    const move = MOVE_KEYS[e.code]
    if (move) {
      state.keys[move] = true
      state.lastDevice = 'mouse'
      e.preventDefault()
      return
    }
    const button = KEY_BUTTONS[e.code]
    if (button) {
      e.preventDefault()
      state.press(button, 'kb')
      state.lastDevice = 'mouse'
      return
    }
    if (e.repeat) return
    if (e.code === 'KeyQ') state.command({ type: 'cycle', hand: 'R', dir: 1 })
    else if (e.code === 'KeyE') state.command({ type: 'cycle', hand: 'L', dir: 1 })
    else if (e.code === 'KeyV') state.command({ type: 'shoulder' })
    else if (/^Digit[1-8]$/.test(e.code)) state.command({ type: 'pick', hand: 'R', index: Number(e.code.slice(5)) - 1 })
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Tab') {
      e.preventDefault()
      o.onUi('scoreboardOff')
      return
    }
    const move = MOVE_KEYS[e.code]
    if (move) state.keys[move] = false
    const button = KEY_BUTTONS[e.code]
    if (button) state.release(button, 'kb')
  }

  const onMouseDown = (e: MouseEvent) => {
    if (!o.active()) return
    if (!isLocked()) {
      if (o.pointerLock?.() ?? true) requestLock()
      return
    }
    if (e.button === 0) state.press('R', 'mouse')
    else if (e.button === 2) state.press('L', 'mouse')
    state.lastDevice = 'mouse'
  }
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) state.release('R', 'mouse')
    else if (e.button === 2) state.release('L', 'mouse')
  }
  const onMouseMove = (e: MouseEvent) => {
    if (!isLocked() || !o.active()) return
    const k = MOUSE_RAD_PER_PX * o.sensitivity()
    // Ignore absurd spikes some browsers report when the lock engages.
    const dx = Math.max(-400, Math.min(400, e.movementX))
    const dy = Math.max(-400, Math.min(400, e.movementY))
    state.look(dx * k, (o.invertY() ? dy : -dy) * k)
  }
  const onWheel = (e: WheelEvent) => {
    if (!o.active()) return
    e.preventDefault()
    if (Math.abs(e.deltaY) < 1) return
    state.command({ type: 'cycle', hand: 'R', dir: e.deltaY > 0 ? 1 : -1 })
  }
  const onContext = (e: Event) => e.preventDefault()
  const onLockChange = () => {
    if (!isLocked()) {
      state.releaseSource('mouse')
      if (wantLock) {
        wantLock = false
        o.onLockLost()
      }
    }
  }
  const onBlur = () => {
    state.releaseSource('kb')
    state.releaseSource('mouse')
  }

  function requestLock() {
    wantLock = true
    try {
      const r = target.requestPointerLock?.() as unknown
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => (wantLock = false))
    } catch {
      wantLock = false
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  target.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('mousemove', onMouseMove)
  target.addEventListener('wheel', onWheel, { passive: false })
  target.addEventListener('contextmenu', onContext)
  document.addEventListener('pointerlockchange', onLockChange)
  window.addEventListener('blur', onBlur)

  return {
    get locked() {
      return isLocked()
    },
    requestLock,
    releaseLock() {
      wantLock = false
      if (isLocked()) document.exitPointerLock?.()
    },
    dispose() {
      wantLock = false
      if (isLocked()) document.exitPointerLock?.()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
      target.removeEventListener('wheel', onWheel)
      target.removeEventListener('contextmenu', onContext)
      document.removeEventListener('pointerlockchange', onLockChange)
      window.removeEventListener('blur', onBlur)
    }
  }
}
