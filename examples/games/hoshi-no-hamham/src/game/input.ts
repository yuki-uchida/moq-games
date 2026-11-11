/**
 * Keyboard and touch input. Jump and bite presses are kept until a simulation step consumes them
 * (`consumePresses`), because hit-stop and slow motion mean the simulation is not stepped every frame.
 * Pause, mute and confirm are per-frame edges cleared by `endFrame`.
 */
import { emptyInput, type InputState } from './sim'

const KEY_MAP: Record<string, keyof InputState | undefined> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyK: 'jump',
  KeyZ: 'bite',
  KeyX: 'bite',
  KeyJ: 'bite'
}

const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyK'])
const BITE_KEYS = new Set(['KeyZ', 'KeyX', 'KeyJ'])
const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'])

export class Input {
  private held = new Set<string>()
  private pressedKeys = new Set<string>()
  private touch = new Set<string>()
  pausePressed = false
  mutePressed = false
  confirmPressed = false
  private disposers: (() => void)[] = []

  constructor() {
    const onKeyDown = (event: KeyboardEvent) => {
      if (PREVENT.has(event.code)) event.preventDefault()
      if (event.repeat) return
      const action = KEY_MAP[event.code]
      if (action) this.held.add(action)
      if (JUMP_KEYS.has(event.code)) this.pressedKeys.add('jump')
      if (BITE_KEYS.has(event.code)) this.pressedKeys.add('bite')
      if (event.code === 'Escape' || event.code === 'KeyP') this.pausePressed = true
      if (event.code === 'KeyM') this.mutePressed = true
      if (event.code === 'Enter' || event.code === 'Space') this.confirmPressed = true
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const action = KEY_MAP[event.code]
      if (action) this.held.delete(action)
    }
    const onBlur = () => {
      this.held.clear()
      this.touch.clear()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    this.disposers.push(() => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    })
  }

  bindTouch(root: ParentNode) {
    for (const button of Array.from(root.querySelectorAll<HTMLElement>('[data-key]'))) {
      const key = button.dataset.key!
      const down = (event: Event) => {
        event.preventDefault()
        this.touch.add(key)
        this.touchPressed.add(key)
      }
      const up = (event: Event) => {
        event.preventDefault()
        this.touch.delete(key)
      }
      button.addEventListener('pointerdown', down)
      button.addEventListener('pointerup', up)
      button.addEventListener('pointercancel', up)
      button.addEventListener('pointerleave', up)
      this.disposers.push(() => {
        button.removeEventListener('pointerdown', down)
        button.removeEventListener('pointerup', up)
        button.removeEventListener('pointercancel', up)
        button.removeEventListener('pointerleave', up)
      })
    }
  }

  poll(): InputState {
    const state = emptyInput()
    state.left = this.held.has('left') || this.touch.has('left')
    state.right = this.held.has('right') || this.touch.has('right')
    state.up = this.held.has('up') || this.touch.has('up')
    state.down = this.held.has('down') || this.touch.has('down')
    state.jump = this.held.has('jump') || this.touch.has('jump')
    state.bite = this.held.has('bite') || this.touch.has('bite')
    state.jumpPressed = this.pressedKeys.has('jump') || this.touchHasPressed('jump')
    state.bitePressed = this.pressedKeys.has('bite') || this.touchHasPressed('bite')
    return state
  }

  private touchPressed = new Set<string>()
  private touchHasPressed(key: string) {
    return this.touchPressed.has(key)
  }

  /** A simulation step used the jump and bite presses. */
  consumePresses() {
    this.pressedKeys.clear()
    this.touchPressed.clear()
  }

  endFrame() {
    this.pausePressed = false
    this.mutePressed = false
    this.confirmPressed = false
  }

  dispose() {
    for (const dispose of this.disposers) dispose()
    this.disposers = []
  }
}
