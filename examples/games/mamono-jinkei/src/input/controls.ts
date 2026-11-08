/**
 * Browser input: keyboard, mouse (with pointer capture) and an optional gamepad, folded into one InputState whose
 * press/release counters only grow (edge events survive merged network messages). Everything is released on blur.
 */
import { NO_INPUT, type InputState } from '../sim/types'
import { PAD, PREVENT, actionOf, aimFrom, edge, moveVector, stick, type Action } from './map'

export interface ControlHooks {
  /** Esc / Start: open or close the menu. */
  onMenu(): void
  /** Any user gesture (audio unlock). */
  onGesture(): void
}

export class Controls {
  readonly state: InputState & { aimDist?: number } = { ...NO_INPUT, aimDist: 256 }
  /** Cursor position in CSS px relative to the canvas, and whether it is over the canvas. */
  cursorX = 0
  cursorY = 0
  cursorIn = false
  /** True while gameplay should receive keys (no menu or dialog field focused). */
  enabled = false
  /** Seconds since the last mouse movement (gamepad aim takes over when the mouse is idle). */
  private mouseAt = 0
  private padAimAt = -1
  private readonly held = new Set<Action>()
  private mouseHeld = false
  private padHeld = false
  private padPrev: boolean[] = []
  private padAim = { x: 0, y: 0 }
  private pointerId = -1

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: ControlHooks
  ) {
    window.addEventListener('keydown', this.keydown)
    window.addEventListener('keyup', this.keyup)
    window.addEventListener('blur', this.releaseAll)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll()
    })
    canvas.addEventListener('pointerdown', this.pointerdown)
    canvas.addEventListener('pointerup', this.pointerup)
    canvas.addEventListener('pointercancel', this.pointerup)
    canvas.addEventListener('lostpointercapture', this.pointerup)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('pointermove', this.pointermove, { passive: true })
    canvas.addEventListener('pointerleave', () => (this.cursorIn = false))
    canvas.addEventListener('pointerenter', () => (this.cursorIn = true))
  }

  private keydown = (e: KeyboardEvent) => {
    this.hooks.onGesture()
    const a = actionOf(e.code)
    if (!a) return
    const target = e.target as HTMLElement | null
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
    if (a === 'menu') {
      if (!e.repeat && !typing) this.hooks.onMenu()
      return
    }
    if (!this.enabled || typing) return
    if (PREVENT.has(e.code)) e.preventDefault()
    if (e.repeat) return
    this.held.add(a)
    const s = this.state
    if (a === 'action') s.actionPresses++
    else if (a === 'interact') s.interactPresses++
    else if (a === 'mode') s.modePresses++
    else if (a === 'switch') s.switchPresses++
    else if (a === 'signal') s.signalPresses++
  }

  private keyup = (e: KeyboardEvent) => {
    const a = actionOf(e.code)
    if (a) this.held.delete(a)
  }

  private pointerdown = (e: PointerEvent) => {
    this.hooks.onGesture()
    this.trackPointer(e)
    if (!this.enabled || e.button !== 0) return
    e.preventDefault()
    this.canvas.focus({ preventScroll: true })
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic events in tests may not be capturable.
    }
    this.pointerId = e.pointerId
    if (!this.mouseHeld) {
      this.mouseHeld = true
      this.state.attackPresses++
    }
  }

  private pointerup = (e: Event) => {
    const pe = e as PointerEvent
    if (pe.pointerId !== undefined && this.pointerId >= 0 && pe.pointerId !== this.pointerId) return
    this.pointerId = -1
    if (this.mouseHeld) {
      this.mouseHeld = false
      this.state.attackReleases++
    }
  }

  private pointermove = (e: PointerEvent) => this.trackPointer(e)

  private trackPointer(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect()
    this.cursorX = e.clientX - r.left
    this.cursorY = e.clientY - r.top
    this.cursorIn = this.cursorX >= 0 && this.cursorY >= 0 && this.cursorX < r.width && this.cursorY < r.height
    this.mouseAt = performance.now()
  }

  /** Releases every held key and button (blur, menu, focus loss). */
  releaseAll = () => {
    this.held.clear()
    if (this.mouseHeld) {
      this.mouseHeld = false
      this.state.attackReleases++
    }
    if (this.padHeld) {
      this.padHeld = false
      this.state.attackReleases++
    }
    this.state.mx = this.state.my = 0
    this.state.actionHeld = false
    this.state.attackHeld = false
  }

  /** Polls the gamepad and refreshes movement and aim. `hero` is the controlled hero's CSS position. */
  update(hero: { x: number; y: number } | undefined, artPerCss: number): InputState & { aimDist?: number } {
    const s = this.state
    let { mx, my } = moveVector(
      this.held.has('up'),
      this.held.has('down'),
      this.held.has('left'),
      this.held.has('right')
    )
    let actionHeld = this.held.has('action')
    const pad = this.enabled ? this.gamepad() : undefined
    if (pad) {
      const l = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0)
      if (l.m > 0) (mx = l.x), (my = l.y)
      const r = stick(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.3)
      if (r.m > 0) {
        this.padAim = { x: r.x, y: r.y }
        this.padAimAt = performance.now()
      }
      const b = pad.buttons.map((x) => !!x?.pressed)
      const p = this.padPrev
      if (b[PAD.a] && !this.padHeld) (this.padHeld = true), s.attackPresses++
      else if (!b[PAD.a] && this.padHeld) (this.padHeld = false), s.attackReleases++
      s.actionPresses += edge(b[PAD.b], p[PAD.b])
      s.interactPresses += edge(b[PAD.x], p[PAD.x])
      s.signalPresses += edge(b[PAD.y], p[PAD.y])
      s.switchPresses += edge(b[PAD.lb], p[PAD.lb]) + edge(b[PAD.rb], p[PAD.rb])
      s.modePresses += edge(b[PAD.back], p[PAD.back])
      if (edge(b[PAD.start], p[PAD.start])) this.hooks.onMenu()
      actionHeld ||= b[PAD.b]
      this.padPrev = b
    }
    if (!this.enabled) (mx = 0), (my = 0), (actionHeld = false)
    s.mx = mx
    s.my = my
    s.actionHeld = actionHeld
    s.attackHeld = this.enabled && (this.mouseHeld || this.padHeld)
    const padAiming = this.padAimAt > this.mouseAt
    if (padAiming) {
      s.aim = Math.atan2(this.padAim.y, this.padAim.x)
      s.aimDist = 4 * 64
    } else if (hero) {
      const a = aimFrom(hero.x, hero.y, this.cursorX, this.cursorY, artPerCss, s.aim)
      s.aim = a.aim
      s.aimDist = a.aimDist
    }
    return s
  }

  private gamepad(): Gamepad | undefined {
    try {
      for (const g of navigator.getGamepads?.() ?? []) if (g && g.connected) return g
    } catch {
      // Gamepads unavailable (permissions policy).
    }
    return undefined
  }

  /** A copy of the current state (for sending). */
  snapshot(): InputState & { aimDist?: number } {
    return { ...this.state }
  }
}
