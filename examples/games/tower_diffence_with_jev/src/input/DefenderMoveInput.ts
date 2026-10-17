import type { Point } from '../game/model'

interface DefenderMoveControls {
  enabled: (id: number) => boolean
  select: (id: number) => void
  activate: (id: number) => void
  pointAt: (x: number, y: number) => Point | null
  preview: (id: number, point: Point | null) => void
  move: (id: number, point: Point) => void
  reserveAt?: (x: number, y: number) => boolean
  recall?: (id: number) => void
  held?: (id: number | null, overReserve: boolean) => void
}

export class DefenderMoveInput {
  private gesture?: { id: number; pointer: number; x: number; y: number; dragged: boolean }
  private suppressClick = false

  constructor(
    private field: HTMLElement,
    private controls: DefenderMoveControls
  ) {
    field.addEventListener('pointerdown', (event) => {
      this.suppressClick = false
      if (!event.isPrimary) return this.cancel()
      const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-unit-id]')
      const id = Number(handle?.dataset.unitId)
      if (!handle || event.button !== 0 || !this.controls.enabled(id)) return
      event.preventDefault()
      this.controls.select(id)
      this.gesture = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, dragged: false }
      field.setPointerCapture(event.pointerId)
    })
    field.addEventListener('pointermove', (event) => {
      const gesture = this.gesture
      if (!gesture || gesture.pointer !== event.pointerId) return
      if (!this.controls.enabled(gesture.id)) return this.cancel()
      if (!gesture.dragged && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6) return
      gesture.dragged = true
      event.preventDefault()
      field.classList.add('moving-defender')
      const overReserve = this.controls.reserveAt?.(event.clientX, event.clientY) ?? false
      this.controls.held?.(gesture.id, overReserve)
      this.controls.preview(gesture.id, overReserve ? null : this.controls.pointAt(event.clientX, event.clientY))
    })
    field.addEventListener('pointerup', (event) => {
      const gesture = this.gesture
      if (!gesture || gesture.pointer !== event.pointerId) return
      const point = gesture.dragged ? this.controls.pointAt(event.clientX, event.clientY) : null
      const enabled = this.controls.enabled(gesture.id)
      const recall = gesture.dragged && this.controls.reserveAt?.(event.clientX, event.clientY)
      this.cancel()
      this.suppressClick = true
      if (!enabled) return
      if (recall) this.controls.recall?.(gesture.id)
      else if (gesture.dragged && point) this.controls.move(gesture.id, point)
      else if (!gesture.dragged) this.controls.activate(gesture.id)
    })
    for (const name of ['pointercancel', 'lostpointercapture'])
      field.addEventListener(name, (event) => {
        if ((event as PointerEvent).pointerId === this.gesture?.pointer) this.cancel()
      })
    field.addEventListener('wheel', () => this.cancel(), { passive: true })
    window.addEventListener('blur', () => this.cancel())
    window.addEventListener(
      'pointerdown',
      (event) => {
        if (this.gesture && event.pointerId !== this.gesture.pointer) this.cancel()
      },
      { capture: true }
    )
    for (const name of ['wheel', 'scroll'])
      window.addEventListener(name, () => this.cancel(), { capture: true, passive: true })
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.cancel()
    })
  }

  get dragging(): boolean {
    return !!this.gesture?.dragged
  }

  consumeClick(): boolean {
    const suppressed = this.suppressClick
    this.suppressClick = false
    return suppressed
  }

  cancel(): void {
    const gesture = this.gesture
    this.gesture = undefined
    if (!gesture) return
    this.suppressClick ||= gesture.dragged
    this.controls.preview(gesture.id, null)
    this.controls.held?.(null, false)
    this.field.classList.remove('moving-defender')
    if (this.field.hasPointerCapture(gesture.pointer)) this.field.releasePointerCapture(gesture.pointer)
  }
}
