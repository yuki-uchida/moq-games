/**
 * Touch controls for phones in landscape (DESIGN §8): a floating stick on the left half, drag-to-look on the
 * right half, big 右/左 paw buttons with small cycle buttons, ジャンプ, ダッシュ, a contextual 救助 button and
 * the ≡ menu. Styles live in src/ui/styles/touch.css.
 */
import { itemIconMarkup } from '../ui/thumbs'
import { h, setClass, setStyle, setText, svg } from '../ui/dom'
import type { ItemId } from '../data/items'
import type { Button, ControlState, UiAction } from './controls'

export const TOUCH_RAD_PER_PX = 0.0052

/** What a touch paw button shows besides its icon: cost, cooldown sweep, charge/lock progress, affordability. */
export interface TouchPaw {
  item: ItemId | null
  /** Cost text as on the HUD paw cards ('2', '1.5/秒'), empty when free. */
  cost: string
  /** 0..1 of the cooldown still to go. */
  cooldown: number
  /** 0..1 charge / lock progress. */
  charge: number
  /** False when anima < cost + 1. */
  affordable: boolean
}

export interface TouchControls {
  readonly el: HTMLElement
  setPaws(r: TouchPaw, l: TouchPaw): void
  setInteract(label: string | null): void
  setVisible(on: boolean): void
  dispose(): void
}

export function createTouchControls(o: {
  state: ControlState
  sensitivity: () => number
  invertY: () => boolean
  assist: () => number
  onUi: (a: UiAction) => void
}): TouchControls {
  const { state } = o
  const stickBase = h('div', 'tc-stick')
  const stickKnob = h('div', 'tc-knob')
  stickBase.append(stickKnob)
  const moveZone = h('div', 'tc-zone tc-move', stickBase)
  const lookZone = h('div', 'tc-zone tc-look')

  /** One paw button's readouts: a ring (cooldown sweep + charge/lock), the icon and the anima cost badge. */
  const pawParts = (cls: string) => {
    const ring = svg(
      `<svg viewBox="0 0 64 64" class="tc-ring"><circle cx="32" cy="32" r="29" class="tc-ring-cd" pathLength="100" transform="rotate(-90 32 32)"/><circle cx="32" cy="32" r="29" class="tc-ring-ch" pathLength="100" transform="rotate(-90 32 32)"/></svg>`
    )
    const icon = h('span', `tc-paw-icon ${cls}`)
    const cost = h('span', 'tc-cost')
    return {
      ring,
      icon,
      cost,
      cd: ring.querySelector('.tc-ring-cd') as SVGElement,
      ch: ring.querySelector('.tc-ring-ch') as SVGElement,
      extra: h('span', 'tc-paw-extra', ring, icon, cost)
    }
  }
  const rParts = pawParts('r')
  const lParts = pawParts('l')
  const btn = (cls: string, label: string, button?: Button, extra?: Node) => {
    const el = h(
      'button',
      { class: `tc-btn ${cls}`, attrs: { type: 'button', 'aria-label': label } },
      extra ?? null,
      h('span', 'tc-label', label)
    )
    if (button) bindHold(el, button)
    return el
  }
  const holds = new Map<number, Button>()
  function bindHold(el: HTMLElement, button: Button) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      el.setPointerCapture?.(e.pointerId)
      holds.set(e.pointerId, button)
      state.press(button, `touch${e.pointerId}`)
      state.lastDevice = 'touch'
      el.classList.add('is-down')
    })
    const up = (e: PointerEvent) => {
      if (holds.get(e.pointerId) !== button) return
      holds.delete(e.pointerId)
      state.release(button, `touch${e.pointerId}`)
      el.classList.remove('is-down')
    }
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  const tap = (el: HTMLElement, fn: () => void) =>
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      state.lastDevice = 'touch'
      fn()
    })

  const rBtn = btn('tc-paw tc-r', '右', 'R', rParts.extra)
  const lBtn = btn('tc-paw tc-l', '左', 'L', lParts.extra)
  const rCycle = btn('tc-cycle tc-cycle-r', '右を切替')
  const lCycle = btn('tc-cycle tc-cycle-l', '左を切替')
  tap(rCycle, () => state.command({ type: 'cycle', hand: 'R', dir: 1 }))
  tap(lCycle, () => state.command({ type: 'cycle', hand: 'L', dir: 1 }))
  const jump = btn('tc-small tc-jump', 'ジャンプ', 'jump')
  const dash = btn('tc-small tc-dash', 'ダッシュ', 'dash')
  const interact = btn('tc-interact', '救助', 'interact')
  const menu = h(
    'button',
    { class: 'tc-menu', attrs: { type: 'button', 'aria-label': 'メニュー' } },
    h('i'),
    h('i'),
    h('i')
  )
  tap(menu, () => o.onUi('pause'))
  const score = h('button', { class: 'tc-score', attrs: { type: 'button', 'aria-label': 'スコア' } }, '≣')
  score.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    o.onUi('scoreboardOn')
  })
  score.addEventListener('pointerup', () => o.onUi('scoreboardOff'))
  score.addEventListener('pointercancel', () => o.onUi('scoreboardOff'))

  const el = h(
    'div',
    'touch-controls',
    moveZone,
    lookZone,
    h('div', 'tc-cluster', lCycle, rCycle, lBtn, rBtn, jump, dash),
    interact,
    menu,
    score
  )

  // floating stick
  let stickId: number | null = null
  let sx = 0
  let sy = 0
  const R = 56
  moveZone.addEventListener('pointerdown', (e) => {
    if (stickId != null) return
    e.preventDefault()
    stickId = e.pointerId
    moveZone.setPointerCapture?.(e.pointerId)
    const rect = moveZone.getBoundingClientRect()
    sx = e.clientX
    sy = e.clientY
    setStyle(stickBase, 'transform', `translate(${sx - rect.left - R}px, ${sy - rect.top - R}px)`)
    setStyle(stickKnob, 'transform', 'translate(0px, 0px)')
    stickBase.classList.add('is-on')
    state.lastDevice = 'touch'
  })
  moveZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return
    let dx = e.clientX - sx
    let dy = e.clientY - sy
    const len = Math.hypot(dx, dy)
    if (len > R) {
      dx = (dx / len) * R
      dy = (dy / len) * R
    }
    setStyle(stickKnob, 'transform', `translate(${dx}px, ${dy}px)`)
    const k = Math.min(1, len / R)
    const dead = 0.12
    const m = k <= dead ? 0 : (k - dead) / (1 - dead)
    state.setStick(
      'touch',
      len ? (dx / Math.max(1, Math.hypot(dx, dy))) * m : 0,
      len ? (-dy / Math.max(1, Math.hypot(dx, dy))) * m : 0
    )
  })
  const endStick = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return
    stickId = null
    state.setStick('touch', 0, 0)
    stickBase.classList.remove('is-on')
  }
  moveZone.addEventListener('pointerup', endStick)
  moveZone.addEventListener('pointercancel', endStick)

  // look drag
  const looks = new Map<number, [number, number]>()
  lookZone.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    lookZone.setPointerCapture?.(e.pointerId)
    looks.set(e.pointerId, [e.clientX, e.clientY])
    state.lastDevice = 'touch'
  })
  lookZone.addEventListener('pointermove', (e) => {
    const last = looks.get(e.pointerId)
    if (!last) return
    const dx = e.clientX - last[0]
    const dy = e.clientY - last[1]
    looks.set(e.pointerId, [e.clientX, e.clientY])
    const k = TOUCH_RAD_PER_PX * o.sensitivity() * (1 - Math.min(0.8, o.assist()))
    state.look(dx * k, (o.invertY() ? dy : -dy) * k)
  })
  const endLook = (e: PointerEvent) => looks.delete(e.pointerId)
  lookZone.addEventListener('pointerup', endLook)
  lookZone.addEventListener('pointercancel', endLook)

  const paintPaw = (btnEl: HTMLElement, parts: ReturnType<typeof pawParts>, p: TouchPaw, label: string) => {
    const key = `${p.item ?? ''}`
    if (parts.icon.dataset.item !== key) {
      parts.icon.dataset.item = key
      parts.icon.innerHTML = p.item ? itemIconMarkup(p.item) : ''
    }
    setText(parts.cost, p.item && p.cost ? `◆ ${p.cost}` : '')
    parts.cd.setAttribute('stroke-dasharray', `${(p.cooldown * 100).toFixed(1)} 100`)
    parts.ch.setAttribute('stroke-dasharray', `${(p.charge * 100).toFixed(1)} 100`)
    setClass(btnEl, 'is-cooling', p.cooldown > 0)
    setClass(btnEl, 'is-empty', !p.item)
    const broke = !!p.item && !p.affordable
    setClass(btnEl, 'is-broke', broke)
    const labelEl = btnEl.querySelector('.tc-label')
    if (labelEl) setText(labelEl as HTMLElement, broke ? '不足' : label)
  }
  return {
    el,
    setPaws(r, l) {
      paintPaw(rBtn, rParts, r, '右')
      paintPaw(lBtn, lParts, l, '左')
    },
    setInteract(label) {
      setClass(interact, 'is-on', !!label)
      const span = interact.querySelector('.tc-label')
      if (span && label && span.textContent !== label) span.textContent = label
    },
    setVisible(on) {
      setClass(el, 'is-hidden', !on)
      if (!on) {
        for (const [id] of holds) state.releaseSource(`touch${id}`)
        holds.clear()
        state.setStick('touch', 0, 0)
        looks.clear()
        stickId = null
      }
    },
    dispose() {
      el.remove()
      state.setStick('touch', 0, 0)
    }
  }
}
