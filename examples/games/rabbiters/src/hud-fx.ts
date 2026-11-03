import './fx.css'
import type { JuiceEvent } from './juice-events'
import type { GameState } from './game'
import type { ThreatTracker } from './audio'

export interface ThreatStatus {
  mode: 'clear' | 'suspicious' | 'chase' | 'search'
  count: number
  suspicion: number
}

export function threatFor(state: GameState | undefined, localPlayerId: string, tracker?: ThreatTracker): ThreatStatus {
  const player = state?.players.find((entry) => entry.id === localPlayerId)
  const clear: ThreatStatus = { mode: 'clear', count: 0, suspicion: 0 }
  if (!state || state.phase !== 'playing' || !player || player.downed) return clear
  const predators = state.predators.filter((predator) => predator.targetId === player.id)
  const count = predators.filter((predator) => predator.state === 'chase').length
  if (count) return { mode: 'chase', count, suspicion: 1 }
  const suspicious = predators.filter((predator) => predator.state === 'suspicious')
  return suspicious.length
    ? {
        mode: 'suspicious',
        count: suspicious.length,
        suspicion: Math.max(...suspicious.map((predator) => predator.suspicion))
      }
    : state.predators.some((predator) => predator.state === 'search' && tracker?.targets.get(predator.id) === player.id)
      ? {
          mode: 'search',
          count: state.predators.filter(
            (predator) => predator.state === 'search' && tracker?.targets.get(predator.id) === player.id
          ).length,
          suspicion: 1
        }
      : clear
}

export type PopupTone = 'good' | 'gold' | 'warm' | 'hot' | 'bad' | 'info' | 'alert'
export type PopupSize = 'sm' | 'md' | 'lg' | 'xl'

export interface PopupSpec {
  text: string
  tone: PopupTone
  size: PopupSize
  /** `screen` = at the projected event point (falls back to upper centre); `top` = always upper centre. */
  anchor: 'screen' | 'top'
}

export type FlashKind = 'hurt' | 'gold' | 'sweep' | 'lost'

const MAX_POPUPS = 12
const POPUP_MS = 900
const CONFETTI_COUNT = 40
const CONFETTI_MS = 2500
const CONFETTI_COLORS = ['#ffd75e', '#ff8fa8', '#8fe3b0', '#8fc8ff', '#ffffff', '#ffb347']

/** Floating text for an event, or null when the event has none. Pure. */
export function popupFor(event: JuiceEvent): PopupSpec | null {
  switch (event.type) {
    case 'eat': {
      const streak = Math.max(1, Math.floor(event.streak))
      if (streak < 2) return { text: '+1', tone: 'good', size: 'md', anchor: 'screen' }
      const tone: PopupTone = streak >= 5 ? 'hot' : streak >= 3 ? 'warm' : 'gold'
      return { text: `×${streak} コンボ!`, tone, size: streak >= 5 ? 'xl' : 'lg', anchor: 'screen' }
    }
    case 'pickup':
      return { text: 'ゲット!', tone: 'gold', size: 'md', anchor: 'screen' }
    case 'taskDone':
      return { text: 'できた!', tone: 'gold', size: 'lg', anchor: 'screen' }
    case 'hurt':
      return { text: `-${Math.max(1, Math.round(event.amount))}`, tone: 'bad', size: 'lg', anchor: 'screen' }
    case 'revived':
      return { text: '復活!', tone: 'good', size: 'lg', anchor: 'screen' }
    case 'grown':
      return { text: 'おとなになった!', tone: 'gold', size: 'xl', anchor: 'screen' }
    case 'escaped':
      return { text: 'にげきった!', tone: 'good', size: 'lg', anchor: 'screen' }
    case 'suspicious':
      return { text: '?', tone: 'info', size: 'sm', anchor: 'screen' }
    case 'spotted':
      return event.you ? { text: '!', tone: 'alert', size: 'xl', anchor: 'top' } : null
    default:
      return null
  }
}

/** Vibration pattern for an event (ms), or null. Pure. */
export function hapticFor(event: JuiceEvent): number[] | null {
  switch (event.type) {
    case 'hurt':
      return [40]
    case 'spotted':
      return event.you ? [25, 40, 25] : null
    case 'taskDone':
      return [15]
    case 'eat':
      return [8]
    case 'won':
      return [20, 40, 60]
    default:
      return null
  }
}

/** Which full-screen flash an event triggers, or null. Pure. */
export function flashFor(event: JuiceEvent): FlashKind | null {
  switch (event.type) {
    case 'hurt':
      return 'hurt'
    case 'taskDone':
    case 'objective':
    case 'bedding':
    case 'kitSafe':
      return 'gold'
    case 'chapter':
    case 'won':
      return 'sweep'
    case 'lost':
      return 'lost'
    default:
      return null
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Restart a CSS animation class on an element. */
function retrigger(el: HTMLElement, cls: string): void {
  el.classList.remove(cls)
  void el.offsetWidth
  el.classList.add(cls)
}

interface PopupSlot {
  el: HTMLElement
  busy: boolean
  startedAt: number
}

export class HudFx {
  private readonly layer: HTMLElement
  private readonly popups: PopupSlot[] = []
  private readonly flashes: Record<FlashKind, HTMLElement>
  private readonly burst: HTMLElement
  private readonly chaseEl: HTMLElement
  private readonly hiddenEl: HTMLElement
  private readonly threatEl: HTMLElement
  private readonly detectionEl: HTMLElement
  private threatMode: ThreatStatus['mode'] = 'clear'
  private releaseTimer?: ReturnType<typeof setTimeout>
  private readonly confettiTimers = new Set<ReturnType<typeof setTimeout>>()
  private readonly doc: Document
  private disposed = false

  constructor(root: HTMLElement) {
    this.doc = root.ownerDocument
    this.layer = this.make('div', 'fx-layer')
    this.layer.setAttribute('aria-hidden', 'true')
    this.chaseEl = this.child('fx-vignette fx-chase')
    this.hiddenEl = this.child('fx-vignette fx-cover')
    this.detectionEl = this.child('fx-detection')
    const signal = this.make('span', 'fx-detection-signal')
    signal.textContent = '!'
    const message = this.make('strong', 'fx-detection-message')
    message.textContent = '見つかった！'
    const hint = this.make('span', 'fx-detection-hint')
    hint.textContent = 'ぴんち！ 逃げよう！'
    this.detectionEl.appendChild(signal)
    this.detectionEl.appendChild(message)
    this.detectionEl.appendChild(hint)
    this.detectionEl.addEventListener('animationend', () => this.detectionEl.classList.remove('fx-on'))
    this.threatEl = this.child('fx-threat')
    this.threatEl.hidden = true
    this.flashes = {
      hurt: this.child('fx-flash fx-flash-hurt'),
      gold: this.child('fx-flash fx-flash-gold'),
      sweep: this.child('fx-flash fx-flash-sweep'),
      lost: this.child('fx-flash fx-flash-lost')
    }
    this.burst = this.child('fx-burst')
    for (let i = 0; i < MAX_POPUPS; i += 1) {
      const el = this.child('fx-popup')
      el.hidden = true
      const slot: PopupSlot = { el, busy: false, startedAt: 0 }
      el.addEventListener('animationend', () => {
        slot.busy = false
        el.hidden = true
      })
      this.popups.push(slot)
    }
    for (const el of [...Object.values(this.flashes), this.burst]) {
      el.addEventListener('animationend', () => el.classList.remove('fx-on'))
    }
    root.appendChild(this.layer)
  }

  emit(event: JuiceEvent, screen?: { x: number; y: number } | null): void {
    if (this.disposed) return
    const popup = popupFor(event)
    if (popup && event.type !== 'spotted') this.showPopup(popup, screen ?? null, event.type)
    const flash = flashFor(event)
    if (flash) this.flash(flash)
    const haptic = hapticFor(event)
    if (haptic && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(haptic)
      } catch {
        // Vibration is best-effort only.
      }
    }
  }

  setChase(active: boolean): void {
    this.chaseEl.classList.toggle('fx-active', active)
  }

  setThreat(threat: ThreatStatus, showRelease = true): void {
    if (this.disposed) return
    const previous = this.threatMode
    this.threatMode = threat.mode
    if (threat.mode === 'clear' && previous === 'clear' && showRelease) return
    clearTimeout(this.releaseTimer)
    this.threatEl.dataset.mode = threat.mode
    this.threatEl.style.setProperty('--threat-level', String(Math.max(0, Math.min(1, threat.suspicion))))
    this.threatEl.hidden = threat.mode === 'clear'
    if (threat.mode !== 'chase') this.detectionEl.classList.remove('fx-on')
    if (threat.mode === 'chase') {
      this.threatEl.textContent = `! 見つかった · ${threat.count}体が追跡中`
      if (previous !== 'chase') {
        for (const slot of this.popups) {
          if (slot.el.dataset.event !== 'escaped') continue
          slot.busy = false
          slot.el.hidden = true
        }
        retrigger(this.detectionEl, 'fx-on')
      }
    } else if (threat.mode === 'suspicious') {
      this.threatEl.textContent = '? 気づかれそう · そっと隠れよう'
    } else if (threat.mode === 'search') {
      this.threatEl.textContent = '? まだ捜索中 · 隠れて待とう'
    } else {
      this.detectionEl.classList.remove('fx-on')
      if (showRelease && (previous === 'chase' || previous === 'search')) {
        this.threatEl.hidden = false
        this.threatEl.textContent = '✓ 追跡が途切れた · ひと息'
        this.releaseTimer = setTimeout(() => {
          this.threatEl.hidden = true
        }, 1800)
      }
    }
  }

  reset(): void {
    this.setThreat({ mode: 'clear', count: 0, suspicion: 0 }, false)
    for (const slot of this.popups) {
      slot.busy = false
      slot.el.hidden = true
    }
    for (const el of [...Object.values(this.flashes), this.burst]) el.classList.remove('fx-on')
  }

  setHidden(hidden: boolean): void {
    this.hiddenEl.classList.toggle('fx-active', hidden)
  }

  dispose(): void {
    this.disposed = true
    clearTimeout(this.releaseTimer)
    for (const t of this.confettiTimers) clearTimeout(t)
    this.confettiTimers.clear()
    this.layer.remove()
  }

  private make(tag: string, cls: string): HTMLElement {
    const el = this.doc.createElement(tag)
    el.className = cls
    return el
  }

  private child(cls: string): HTMLElement {
    const el = this.make('div', cls)
    this.layer.appendChild(el)
    return el
  }

  private showPopup(spec: PopupSpec, screen: { x: number; y: number } | null, event: JuiceEvent['type']): void {
    const layerBox = this.layer.getBoundingClientRect()
    const w = layerBox.width || (typeof innerWidth === 'number' ? innerWidth : 800)
    const h = layerBox.height || (typeof innerHeight === 'number' ? innerHeight : 600)
    let x = w * 0.5
    let y = h * 0.28
    if (spec.anchor === 'screen' && screen && Number.isFinite(screen.x) && Number.isFinite(screen.y)) {
      x = Math.min(w - 40, Math.max(40, screen.x - layerBox.left))
      y = Math.min(h - 40, Math.max(40, screen.y - layerBox.top))
    }
    const now = Date.now()
    let slot = this.popups.find((p) => !p.busy)
    if (!slot) slot = this.popups.reduce((a, b) => (a.startedAt <= b.startedAt ? a : b))
    slot.busy = true
    slot.startedAt = now
    const el = slot.el
    el.hidden = false
    el.dataset.event = event
    el.textContent = spec.text
    el.className = `fx-popup fx-tone-${spec.tone} fx-size-${spec.size}`
    el.style.setProperty('--fx-x', `${Math.round(x)}px`)
    el.style.setProperty('--fx-y', `${Math.round(y)}px`)
    el.style.setProperty('--fx-drift', `${Math.round((Math.random() - 0.5) * 24)}px`)
    el.style.animationDuration = `${POPUP_MS}ms`
    retrigger(el, 'fx-popup-go')
  }

  private flash(kind: FlashKind): void {
    const el = this.flashes[kind]
    el.classList.remove('fx-on')
    retrigger(el, 'fx-on')
    if (kind === 'gold') retrigger(this.burst, 'fx-on')
    if (kind === 'sweep') {
      retrigger(this.burst, 'fx-on')
      this.confetti()
    }
  }

  private confetti(): void {
    if (prefersReducedMotion()) return
    const holder = this.child('fx-confetti')
    for (let i = 0; i < CONFETTI_COUNT; i += 1) {
      const piece = this.make('i', 'fx-confetti-piece')
      piece.style.left = `${Math.random() * 100}%`
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
      piece.style.animationDelay = `${Math.random() * 0.5}s`
      piece.style.animationDuration = `${1.6 + Math.random() * 0.8}s`
      piece.style.setProperty('--fx-rot', `${Math.round(360 + Math.random() * 720)}deg`)
      piece.style.setProperty('--fx-sway', `${Math.round((Math.random() - 0.5) * 120)}px`)
      holder.appendChild(piece)
    }
    const timer = setTimeout(() => {
      this.confettiTimers.delete(timer)
      holder.remove()
    }, CONFETTI_MS)
    this.confettiTimers.add(timer)
  }
}

/**
 * Delegated press feedback for every `button` under `root`: a bounce class and a ripple at the pointer.
 * Returns a function that detaches the listener.
 */
export function attachButtonJuice(root: HTMLElement, onPress?: (kind: 'tap') => void): () => void {
  const doc = root.ownerDocument
  const handler = (e: Event): void => {
    const pe = e as PointerEvent
    const target = pe.target as Element | null
    const button =
      target && typeof target.closest === 'function' ? (target.closest('button') as HTMLButtonElement | null) : null
    if (!button || button.disabled) return
    const strong = button.closest('#touch-controls') !== null
    const cls = strong ? 'fx-press-strong' : 'fx-press'
    button.classList.remove('fx-press', 'fx-press-strong')
    void button.offsetWidth
    button.classList.add(cls)
    button.addEventListener('animationend', () => button.classList.remove(cls), { once: true })
    if (!prefersReducedMotion()) {
      const ripple = doc.createElement('span')
      ripple.className = strong ? 'fx-ripple fx-ripple-strong' : 'fx-ripple'
      ripple.style.left = `${pe.clientX}px`
      ripple.style.top = `${pe.clientY}px`
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true })
      root.appendChild(ripple)
    }
    onPress?.('tap')
  }
  root.addEventListener('pointerdown', handler)
  return () => root.removeEventListener('pointerdown', handler)
}
