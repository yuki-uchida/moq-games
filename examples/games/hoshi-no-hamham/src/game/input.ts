/**
 * Keyboard and touch input. Jump and bite presses are kept until a simulation step consumes them
 * (`consumePresses`), because hit-stop and slow motion mean the simulation is not stepped every frame.
 * Pause, mute and confirm are per-frame edges cleared by `endFrame`.
 */
import { padSide } from '../ui/hud-model'
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

  /**
   * Binds the touch controls under `root`. A `[data-pad]` element is a slide pad: its `[data-key]` children are
   * only pictures, and the pointer's x decides left or right, so a thumb can slide across without lifting.
   * Any other `[data-key]` element is a button. Every pointer is captured and tracked by id, so pad and buttons
   * work together (multi-touch) and a lost pointer (cancel, lost capture, hidden controls, blur) lets go.
   */
  bindTouch(root: ParentNode) {
    const pointers = new Map<number, string | null>()
    const marked: HTMLElement[] = []
    const refresh = () => {
      const next = new Set<string>()
      for (const key of pointers.values()) if (key) next.add(key)
      for (const key of next) if (!this.touch.has(key)) this.touchPressed.add(key)
      this.touch = next
      for (const element of marked) element.classList.toggle('is-down', next.has(element.dataset.key!))
    }
    const release = (id: number) => {
      if (pointers.delete(id)) refresh()
    }
    const clearAll = () => {
      pointers.clear()
      refresh()
    }
    const listen = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement,
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void
    ) => {
      target.addEventListener(type, handler)
      this.disposers.push(() => target.removeEventListener(type, handler))
    }
    const capture = (target: HTMLElement, event: PointerEvent) => {
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // A synthetic pointer cannot be captured; the events still reach the element they started on.
      }
    }
    const lock = (target: HTMLElement) => {
      listen(target, 'contextmenu', (event) => event.preventDefault())
      listen(target, 'selectstart', (event) => event.preventDefault())
      listen(target, 'dragstart', (event) => event.preventDefault())
    }
    const onEnd = (target: HTMLElement) => {
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
        listen(target, type, (event) => release(event.pointerId))
    }
    const hiddenWatchers: MutationObserver[] = []

    for (const pad of Array.from(root.querySelectorAll<HTMLElement>('[data-pad]'))) {
      const keys = Array.from(pad.querySelectorAll<HTMLElement>('[data-key]'))
      marked.push(...keys)
      const side = (event: PointerEvent) => {
        const rect = pad.getBoundingClientRect()
        return padSide(event.clientX, rect.left, rect.width)
      }
      lock(pad)
      listen(pad, 'pointerdown', (event) => {
        event.preventDefault()
        capture(pad, event)
        pointers.set(event.pointerId, side(event))
        refresh()
      })
      listen(pad, 'pointermove', (event) => {
        if (!pointers.has(event.pointerId)) return
        const next = side(event)
        if (pointers.get(event.pointerId) === next) return
        pointers.set(event.pointerId, next)
        refresh()
      })
      onEnd(pad)
    }
    for (const button of Array.from(root.querySelectorAll<HTMLElement>('[data-key]'))) {
      if (button.closest('[data-pad]')) continue
      const key = button.dataset.key!
      marked.push(button)
      lock(button)
      listen(button, 'pointerdown', (event) => {
        event.preventDefault()
        capture(button, event)
        pointers.set(event.pointerId, key)
        refresh()
      })
      onEnd(button)
    }
    // Hidden controls cannot send their own pointer-up: let go of everything when they are hidden.
    for (const container of Array.from(root.querySelectorAll<HTMLElement>('[data-touch-root]'))) {
      const watcher = new MutationObserver(() => {
        if (container.hidden) clearAll()
      })
      watcher.observe(container, { attributes: true, attributeFilter: ['hidden'] })
      hiddenWatchers.push(watcher)
    }
    window.addEventListener('blur', clearAll)
    document.addEventListener('visibilitychange', clearAll)
    this.disposers.push(() => {
      for (const watcher of hiddenWatchers) watcher.disconnect()
      window.removeEventListener('blur', clearAll)
      document.removeEventListener('visibilitychange', clearAll)
    })
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
