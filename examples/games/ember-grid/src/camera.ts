import { size } from './game'
import { reducedMotion } from './settings'

export type Cell = { x: number; y: number }
/** Board side at zoom 1 (px), floor squash, and field size (px). */
export type Metrics = { fit: number; tilt: number; width: number; height: number }
/** Zoom relative to the whole-board fit, and the centred point in continuous cell coordinates. */
export type View = { zoom: number; x: number; y: number }

const K = Math.SQRT1_2
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value))
/** Diamond width of one tile at zoom 1. */
const tileWidth = (m: Metrics) => (m.fit * Math.SQRT2) / size

/** Screen offset (px from the board centre, zoom 1) of a cell, as the CSS floor projects it (rotate −45°, squash). */
export function project(m: Metrics, p: Cell) {
  const w = m.fit / size,
    u = (p.x + 0.5) * w - m.fit / 2,
    v = (p.y + 0.5) * w - m.fit / 2
  return { x: K * (u + v), y: K * m.tilt * (v - u) }
}
export function unproject(m: Metrics, o: { x: number; y: number }): Cell {
  const w = m.fit / size,
    s = o.x / K,
    d = o.y / (K * m.tilt)
  return { x: ((s - d) / 2 + m.fit / 2) / w - 0.5, y: ((s + d) / 2 + m.fit / 2) / w - 0.5 }
}
/** Zoom range: whole board up to roughly 200 px tiles; battles open near 64 px tiles and focus near 96 px. */
export function limits(m: Metrics) {
  const tile = tileWidth(m),
    max = clamp(200 / tile, 2, 3.5)
  return { max, start: clamp(64 / tile, 1.25, 2), focus: clamp(96 / tile, 1.5, max) }
}
/** Keeps the board (with room for figures) covering the field, and centred on any axis where it fits. */
export function clampView(m: Metrics, view: View): View {
  const zoom = clamp(view.zoom, 1, limits(m).max),
    tile = tileWidth(m),
    o = project(m, view),
    hx = Math.max(0, K * m.fit + 0.6 * tile - m.width / 2 / zoom),
    hy = Math.max(0, K * m.fit * m.tilt + tile - m.height / 2 / zoom)
  return { zoom, ...unproject(m, { x: clamp(o.x, -hx, hx), y: clamp(o.y, -hy, hy) }) }
}
/** The view that shows every cell with its figure and tag, its zoom limited to [lo, hi] (lo wins). */
export function frameView(m: Metrics, cells: Cell[], lo: number, hi: number): View {
  const tile = tileWidth(m),
    points = cells.map((cell) => project(m, cell)),
    left = Math.min(...points.map((p) => p.x)) - 0.75 * tile,
    right = Math.max(...points.map((p) => p.x)) + 0.75 * tile,
    // Figures stand about a tile tall above their cell; the slab and tile tip sit below.
    top = Math.min(...points.map((p) => p.y)) - 1.25 * tile,
    bottom = Math.max(...points.map((p) => p.y)) + 0.6 * tile * m.tilt,
    fit = Math.min((m.width - 16) / (right - left), (m.height - 28) / (bottom - top))
  return clampView(m, {
    zoom: Math.max(lo, Math.min(hi, fit)),
    ...unproject(m, { x: (left + right) / 2, y: (top + bottom) / 2 })
  })
}
/** Whether every cell (with its figure) is inside the field at this view. */
export function shows(m: Metrics, view: View, cells: Cell[]) {
  const tile = tileWidth(m) * view.zoom,
    c = project(m, view)
  return cells.every((cell) => {
    const p = project(m, cell),
      x = (p.x - c.x) * view.zoom,
      y = (p.y - c.y) * view.zoom
    return Math.abs(x) <= m.width / 2 - 0.5 * tile && y >= -m.height / 2 + 1.1 * tile && y <= m.height / 2 - 0.4 * tile
  })
}

/**
 * Zoom and pan for the oblique board. The view is applied as CSS variables on the field (`--zoom`
 * enlarges the floor and tag grids, `--pan-x/y` shift them); `changed` then re-fits the 3D camera,
 * which reads the same DOM geometry, so floor, figures and tags stay aligned at every step.
 */
export class BoardCamera {
  view: View = { zoom: 1, x: (size - 1) / 2, y: (size - 1) / 2 }
  readonly controls = document.createElement('div')
  private frame = 0
  /** Where an animation in flight is heading; later moves start from there. */
  private target?: View
  private swallow = false

  constructor(
    private field: HTMLElement,
    private board: HTMLElement,
    private changed: () => void,
    gesture: () => void
  ) {
    this.controls.className = 'zoom-controls'
    this.controls.setAttribute('role', 'group')
    this.controls.setAttribute('aria-label', 'カメラ')
    const icon = (path: string) =>
      `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`
    this.controls.innerHTML = `<button type="button" data-zoom="in" aria-label="拡大">${icon('M12 5v14M5 12h14')}</button><button type="button" data-zoom="out" aria-label="縮小">${icon('M5 12h14')}</button><button type="button" data-zoom="fit" aria-label="全体を表示">${icon('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')}</button>`
    this.controls.onclick = (event) => {
      const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-zoom]')?.dataset.zoom
      if (action === 'fit') this.to({ zoom: 1, x: (size - 1) / 2, y: (size - 1) / 2 })
      else if (action) this.zoomAt(action === 'in' ? 1.4 : 1 / 1.4, undefined, true)
    }
    field.append(this.controls)
    this.gestures(gesture)
    new ResizeObserver(() => this.apply()).observe(field)
  }

  metrics(): Metrics {
    const rect = this.field.getBoundingClientRect(),
      style = getComputedStyle(this.field),
      zoom = Number.parseFloat(style.getPropertyValue('--zoom')) || 1
    return {
      fit: this.board.offsetWidth / zoom,
      tilt: Number.parseFloat(style.getPropertyValue('--tilt')) || 0.6,
      width: rect.width,
      height: rect.height
    }
  }

  apply(view = this.view) {
    const m = this.metrics()
    if (!m.width || !m.fit) return
    this.view = clampView(m, view)
    const c = project(m, this.view)
    this.field.style.setProperty('--zoom', String(this.view.zoom))
    this.field.style.setProperty('--pan-x', `${-c.x * this.view.zoom}px`)
    this.field.style.setProperty('--pan-y', `${-c.y * this.view.zoom}px`)
    const [zoomIn, zoomOut, fit] = Array.from(this.controls.querySelectorAll('button'))
    zoomIn.disabled = this.view.zoom >= limits(m).max - 0.001
    zoomOut.disabled = fit.disabled = this.view.zoom <= 1.001
    this.changed()
  }

  private stop() {
    cancelAnimationFrame(this.frame)
    this.target = undefined
  }

  /** Eases to a view; reduced motion, hidden tabs and a zero duration jump straight there. */
  to(target: View, duration = 280) {
    this.stop()
    const from = this.view,
      to = clampView(this.metrics(), target)
    if (duration <= 0 || reducedMotion() || document.hidden) return this.apply(to)
    this.target = to
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration),
        e = 1 - (1 - t) ** 3
      this.apply({
        zoom: from.zoom * (to.zoom / from.zoom) ** e,
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e
      })
      if (t < 1) this.frame = requestAnimationFrame(step)
      else this.target = undefined
    }
    this.frame = requestAnimationFrame(step)
  }

  /** Battle start: everyone on the field, as close as the opening zoom allows. */
  frameAll(cells: Cell[]) {
    const m = this.metrics()
    if (m.width && m.fit && cells.length) this.to(frameView(m, cells, 1, limits(m).start), 0)
  }
  /** Selection: move in on the unit's options without ever zooming out. */
  focus(cells: Cell[]) {
    const m = this.metrics(),
      current = this.target ?? this.view
    if (m.width && m.fit && cells.length) this.to(frameView(m, cells, current.zoom, limits(m).focus))
  }
  /** Brings cells into view if needed, zooming out only as far as they require. */
  reveal(cells: Cell[], duration = 280) {
    const m = this.metrics(),
      current = this.target ?? this.view
    if (!m.width || !m.fit || !cells.length || shows(m, current, cells)) return
    this.to(frameView(m, cells, 1, current.zoom), duration)
  }

  /** Zoom keeping the content under a client point (default: the field centre) in place. */
  zoomAt(factor: number, point?: { x: number; y: number }, animate = false) {
    // Repeated button presses compound from where the previous one is heading.
    const base = (animate && this.target) || this.view,
      m = this.metrics(),
      rect = this.field.getBoundingClientRect(),
      z1 = clamp(base.zoom * factor, 1, limits(m).max),
      s = point ? { x: point.x - rect.left - rect.width / 2, y: point.y - rect.top - rect.height / 2 } : { x: 0, y: 0 },
      c = project(m, base),
      next = { zoom: z1, ...unproject(m, { x: c.x + s.x / base.zoom - s.x / z1, y: c.y + s.y / base.zoom - s.y / z1 }) }
    if (animate) this.to(next)
    else {
      this.stop()
      this.apply(next)
    }
  }

  private gestures(gesture: () => void) {
    const field = this.field,
      pointers = new Map<number, { x: number; y: number }>()
    let drag: { x: number; y: number; moved: boolean } | undefined
    let pinch: { distance: number; zoom: number; anchor: { x: number; y: number } } | undefined
    const midpoint = () => {
      const [a, b] = [...pointers.values()]
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) || 1 }
    }
    const begin = (id: number) => {
      if (drag?.moved || pinch) return
      this.stop()
      this.swallow = true
      gesture()
      // Keep receiving the gesture outside the field; a pointer that has already gone cannot be captured.
      try {
        field.setPointerCapture(id)
      } catch {}
    }
    field.addEventListener('pointerdown', (event) => {
      this.swallow = false
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if ((event.target as Element).closest('.zoom-controls, #result, .story-overlay, .story-credits, .preparation'))
        return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 1) drag = { x: event.clientX, y: event.clientY, moved: false }
      if (pointers.size === 2) {
        begin(event.pointerId)
        const mid = midpoint(),
          rect = field.getBoundingClientRect(),
          m = this.metrics(),
          c = project(m, this.view),
          s = { x: mid.x - rect.left - rect.width / 2, y: mid.y - rect.top - rect.height / 2 }
        pinch = {
          distance: mid.distance,
          zoom: this.view.zoom,
          anchor: { x: c.x + s.x / this.view.zoom, y: c.y + s.y / this.view.zoom }
        }
        drag = undefined
      }
    })
    field.addEventListener('pointermove', (event) => {
      const pointer = pointers.get(event.pointerId)
      if (!pointer) return
      const dx = event.clientX - pointer.x,
        dy = event.clientY - pointer.y
      pointer.x = event.clientX
      pointer.y = event.clientY
      if (pinch && pointers.size >= 2) {
        const mid = midpoint(),
          rect = field.getBoundingClientRect(),
          m = this.metrics(),
          zoom = clamp((pinch.zoom * mid.distance) / pinch.distance, 1, limits(m).max),
          s = { x: mid.x - rect.left - rect.width / 2, y: mid.y - rect.top - rect.height / 2 }
        this.apply({ zoom, ...unproject(m, { x: pinch.anchor.x - s.x / zoom, y: pinch.anchor.y - s.y / zoom }) })
        return
      }
      if (!drag) return
      if (!drag.moved) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return
        begin(event.pointerId)
        drag.moved = true
      }
      const m = this.metrics(),
        c = project(m, this.view)
      this.apply({
        zoom: this.view.zoom,
        ...unproject(m, { x: c.x - dx / this.view.zoom, y: c.y - dy / this.view.zoom })
      })
    })
    const release = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return
      pinch = undefined
      const [rest] = [...pointers.values()]
      // A lifted pinch finger continues as a pan; no click follows a gesture.
      drag = rest ? { ...rest, moved: true } : undefined
    }
    field.addEventListener('pointerup', release)
    field.addEventListener('pointercancel', release)
    field.addEventListener(
      'click',
      (event) => {
        if (!this.swallow) return
        this.swallow = false
        event.stopPropagation()
        event.preventDefault()
      },
      true
    )
    field.addEventListener(
      'wheel',
      (event) => {
        if ((event.target as Element).closest('.story-overlay, .story-credits, #result')) return
        event.preventDefault()
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1)
        this.zoomAt(Math.exp(-delta * 0.0015), { x: event.clientX, y: event.clientY })
      },
      { passive: false }
    )
    field.addEventListener('keydown', (event) => {
      if (!(event.target as Element).closest('#board, .zoom-controls')) return
      if (event.key === '+' || event.key === '=' || event.key === ';') this.zoomAt(1.4, undefined, true)
      else if (event.key === '-') this.zoomAt(1 / 1.4, undefined, true)
      else if (event.key === '0') this.to({ zoom: 1, x: (size - 1) / 2, y: (size - 1) / 2 })
      else return
      event.preventDefault()
    })
  }
}
