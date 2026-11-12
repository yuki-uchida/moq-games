/** HUD centre widgets: crosshair per antique, hit markers, damage direction arcs, scope overlay, radar. */
import { ITEMS, type ItemId } from '../../data/items'
import type { ActorRef, HandView, PlayerView, V3, View } from '../../sim/types'
import { h, setAttr, setClass, setStyle } from '../dom'
import {
  crosshairFor,
  directionAngle,
  itemSpread,
  radarPoint,
  spreadRadius,
  TEAM_COLORS,
  type CrosshairKind
} from './model'

const NS = 'http://www.w3.org/2000/svg'
const s = (tag: string, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

// ---------------------------------------------------------------------------------------------------------------
// Crosshair

export interface Crosshair {
  readonly el: HTMLElement
  readonly scope: HTMLElement
  update(o: {
    hand: HandView | undefined
    other: HandView | undefined
    fov: number
    height: number
    project?: (p: V3) => { x: number; y: number; onScreen: boolean }
    findActor: (ref: ActorRef) => V3 | undefined
    canvasRect: { left: number; top: number }
    disabled: boolean
  }): void
}

export function createCrosshair(): Crosshair {
  const svgEl = s('svg', { viewBox: '-100 -100 200 200', class: 'xh-svg' }) as SVGSVGElement
  const dot = s('circle', { r: 2.2, class: 'xh-dot' })
  const ticks = s('g', { class: 'xh-ticks' })
  for (const r of [0, 90, 180, 270]) {
    const g = s('g', { transform: `rotate(${r})` })
    g.append(s('line', { x1: 0, y1: -10, x2: 0, y2: -18, class: 'xh-tick' }))
    ticks.append(g)
  }
  const ring = s('circle', { r: 20, class: 'xh-ring' })
  const charge = s('circle', { r: 26, class: 'xh-charge', pathLength: 100, transform: 'rotate(-90)' })
  const arc = s('path', { d: 'M -34 -6 Q 0 -30 34 -6', class: 'xh-arc' })
  const beam = s('g', { class: 'xh-beam' })
  beam.append(
    s('circle', { r: 9, class: 'xh-ring' }),
    s('line', { x1: -22, y1: 0, x2: -13, y2: 0, class: 'xh-tick' }),
    s('line', { x1: 13, y1: 0, x2: 22, y2: 0, class: 'xh-tick' })
  )
  const lock = s('g', { class: 'xh-lock' })
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ]) {
    lock.append(
      s('path', { d: `M ${sx * 34} ${sy * 22} L ${sx * 42} ${sy * 22} L ${sx * 42} ${sy * 14}`, class: 'xh-bracket' })
    )
  }
  const gadget = s('rect', { x: -6, y: -6, width: 12, height: 12, transform: 'rotate(45)', class: 'xh-gadget' })
  const cooldown = s('circle', { r: 32, class: 'xh-cool', pathLength: 100, transform: 'rotate(-90)' })
  svgEl.append(ring, ticks, arc, beam, lock, gadget, charge, cooldown, dot)
  const el = h('div', 'hud-xh')
  el.append(svgEl)
  const lockMarks = Array.from({ length: 4 }, () => h('div', 'hud-lockmark'))
  const lockLayer = h('div', 'hud-locks', lockMarks)
  const scope = h('div', 'hud-scope', h('div', 'hud-scope-ring'), h('div', 'hud-scope-cross'))
  el.append(lockLayer)

  let kind: CrosshairKind | null = null
  return {
    el,
    scope,
    update(o) {
      const item = o.hand && o.hand.sel >= 0 ? o.hand.items[o.hand.sel] : undefined
      const k = o.disabled ? 'none' : crosshairFor(item as ItemId | undefined)
      if (k !== kind) {
        kind = k
        el.dataset.kind = k
      }
      const hand = o.hand
      // spread ticks / shotgun ring radius
      if (k === 'spread' || k === 'ring' || k === 'lock') {
        const base = itemSpread(item as ItemId)
        const extra = hand && hand.act === 'fire' ? 0.6 : 0
        const r = Math.min(90, spreadRadius(base + extra, o.fov, o.height))
        if (k === 'ring') setAttr(ring, 'r', r.toFixed(1))
        else if (k === 'spread')
          setStyle(ticks as unknown as SVGElement, 'transform', `scale(${Math.max(0.6, r / 10).toFixed(2)})`)
      }
      // charge (hippo, pillbug lob, owl zoom, swallow lock, guard)
      const c = hand ? hand.charge : 0
      setAttr(charge, 'stroke-dasharray', `${(c * 100).toFixed(1)} 100`)
      setClass(charge, 'is-on', c > 0.01)
      setClass(charge, 'is-full', c >= 0.99)
      // cooldown ring
      const def = item ? ITEMS[item as ItemId] : undefined
      const total = def?.cooldown ?? 0
      const cd = hand && total > 0 ? Math.min(1, hand.cooldown / total) : 0
      setAttr(cooldown, 'stroke-dasharray', `${(cd * 100).toFixed(1)} 100`)
      setClass(cooldown, 'is-on', cd > 0.01)
      // scope overlay with zoom
      const zoom = k === 'scope' && hand && (hand.act === 'charge' || hand.charge > 0) ? hand.charge : 0
      setStyle(scope, 'opacity', zoom > 0 ? String(Math.min(1, 0.35 + zoom)) : '0')
      setStyle(scope, '--zoom', String(zoom.toFixed(2)))
      // swallow locks: brackets on the locked targets
      const locks = hand?.locks ?? []
      lockMarks.forEach((m, i) => {
        const ref = locks[i]
        const p = ref != null ? o.findActor(ref) : undefined
        const pt = p && o.project ? o.project([p[0], p[1] + 1, p[2]]) : undefined
        if (pt && pt.onScreen) {
          setStyle(
            m,
            'transform',
            `translate(${(pt.x - o.canvasRect.left).toFixed(0)}px, ${(pt.y - o.canvasRect.top).toFixed(0)}px)`
          )
          setClass(m, 'is-on', true)
        } else setClass(m, 'is-on', false)
      })
      setClass(el, 'is-locking', locks.length > 0)
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Hit markers and damage arcs

export interface HitMarkers {
  readonly el: HTMLElement
  show(kind: 'hit' | 'head' | 'ko'): void
}

export function createHitMarkers(): HitMarkers {
  const el = h('div', 'hud-hit')
  for (let i = 0; i < 4; i++) el.append(h('i', `hm hm-${i}`))
  return {
    el,
    show(kind) {
      el.dataset.kind = kind
      el.animate?.(
        [
          { opacity: 1, transform: `scale(${kind === 'ko' ? 1.35 : 1.15})` },
          { opacity: 1, transform: 'scale(1)', offset: 0.3 },
          { opacity: 0, transform: 'scale(0.95)' }
        ],
        { duration: kind === 'ko' ? 520 : 300, easing: 'ease-out' }
      )
    }
  }
}

export interface DamageArcs {
  readonly el: HTMLElement
  add(angle: number, amount: number): void
}

export function createDamageArcs(): DamageArcs {
  const el = h('div', 'hud-dmg')
  const arcs = Array.from({ length: 6 }, () => {
    const a = h('div', 'dmg-arc', h('i'))
    el.append(a)
    return a
  })
  let next = 0
  return {
    el,
    add(angle, amount) {
      const a = arcs[next++ % arcs.length]
      setStyle(a, 'transform', `rotate(${angle.toFixed(3)}rad)`)
      setStyle(a, '--w', String(Math.min(1, 0.45 + amount / 30)))
      a.animate?.([{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 1100, easing: 'ease-in' })
    }
  }
}

/** Screen angle for a damage source, ready for `DamageArcs.add`. */
export const arcAngle = (me: PlayerView, yaw: number, at: V3) => directionAngle(me.p, yaw, at)

// ---------------------------------------------------------------------------------------------------------------
// Radar (canvas)

export interface Radar {
  readonly el: HTMLElement
  draw(view: View, me: PlayerView, yaw: number): void
}

export function createRadar(): Radar {
  const canvas = h('canvas', { class: 'hud-radar-canvas', attrs: { width: 300, height: 300, 'aria-hidden': 'true' } })
  const el = h('div', 'hud-radar', canvas, h('span', 'hud-radar-n', '前'))
  const g = canvas.getContext('2d')
  const RANGE = 45
  let acc = 0
  return {
    el,
    draw(view, me, yaw) {
      if (!g) return
      // ~30 Hz is enough for the radar
      acc++
      if (acc % 2) return
      const W = 300
      const R = 140
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, W, W)
      g.translate(W / 2, W / 2)
      g.fillStyle = 'rgba(12, 20, 44, 0.72)'
      g.beginPath()
      g.arc(0, 0, R, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = 'rgba(150, 190, 255, 0.18)'
      g.lineWidth = 2
      for (const k of [0.33, 0.66, 1]) {
        g.beginPath()
        g.arc(0, 0, R * k, 0, Math.PI * 2)
        g.stroke()
      }
      // view cone
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, R)
      grad.addColorStop(0, 'rgba(255, 190, 120, 0.28)')
      grad.addColorStop(1, 'rgba(255, 190, 120, 0)')
      g.fillStyle = grad
      g.beginPath()
      g.moveTo(0, 0)
      g.arc(0, 0, R, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55)
      g.closePath()
      g.fill()
      const at = (p: V3, clamp = false) => {
        const q = radarPoint(me.p, yaw, p, RANGE, clamp)
        return q ? [q[0] * R, q[1] * R] : null
      }
      // objectives
      for (const prop of view.props) {
        if (!['lighthouse', 'zone', 'cart', 'node', 'base'].includes(prop.kind)) continue
        const q = at(prop.p, true)
        if (!q) continue
        const col =
          prop.kind === 'base' && typeof prop.team === 'number'
            ? (TEAM_COLORS[prop.team as 0 | 1 | 2] ?? '#ffcf6e')
            : prop.kind === 'node'
              ? '#c58cff'
              : '#ffcf6e'
        g.save()
        g.translate(q[0], q[1])
        g.rotate(Math.PI / 4)
        g.fillStyle = col
        g.strokeStyle = 'rgba(0,0,0,0.6)'
        g.lineWidth = 3
        g.fillRect(-9, -9, 18, 18)
        g.strokeRect(-9, -9, 18, 18)
        g.restore()
        if (prop.label) {
          g.fillStyle = '#1a1206'
          g.font = 'bold 14px sans-serif'
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText(prop.label, q[0], q[1] + 1)
        }
      }
      // foes: revealed ones bright, nearby ones faint
      for (const f of view.foes) {
        if (f.state === 'dying') continue
        const d = Math.hypot(f.p[0] - me.p[0], f.p[2] - me.p[2])
        if (!f.revealed && d > 28) continue
        const q = at(f.p)
        if (!q) continue
        g.fillStyle = f.revealed ? '#ff5a6a' : 'rgba(255, 90, 106, 0.55)'
        g.beginPath()
        g.arc(q[0], q[1], f.revealed ? 7 : 5, 0, Math.PI * 2)
        g.fill()
      }
      // players
      for (const p of view.players) {
        if (p.id === me.id || p.state === 'away') continue
        const ally = p.team === me.team
        if (!ally && !p.revealed) continue
        const q = at(p.p, ally)
        if (!q) continue
        g.fillStyle = view.mode === 'pvp' ? TEAM_COLORS[p.team] : ally ? '#7cc8ff' : '#ff5a6a'
        g.strokeStyle = '#0a1020'
        g.lineWidth = 3
        g.beginPath()
        if (p.state === 'down') {
          g.moveTo(q[0] - 7, q[1] - 7)
          g.lineTo(q[0] + 7, q[1] + 7)
          g.moveTo(q[0] + 7, q[1] - 7)
          g.lineTo(q[0] - 7, q[1] + 7)
          g.strokeStyle = '#ff5a6a'
          g.lineWidth = 4
          g.stroke()
        } else {
          g.arc(q[0], q[1], 8, 0, Math.PI * 2)
          g.fill()
          g.stroke()
        }
      }
      // me
      g.fillStyle = '#ffcf6e'
      g.beginPath()
      g.moveTo(0, -13)
      g.lineTo(9, 9)
      g.lineTo(0, 4)
      g.lineTo(-9, 9)
      g.closePath()
      g.fill()
    }
  }
}
