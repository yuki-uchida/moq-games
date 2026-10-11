import type { Point } from '../game/model'

interface GroundTapControls {
  enabled: () => boolean
  pointAt: (x: number, y: number) => Point | null
  preview: (point: Point | null) => void
  place: (point: Point) => void
}

export class GroundTapInput {
  private gesture?: { pointer: number; x: number; y: number; dragged: boolean }

  constructor(
    viewport: HTMLElement,
    private controls: GroundTapControls
  ) {
    viewport.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary) {
        this.cancel()
        return
      }
      if (!this.controls.enabled() || event.button !== 0 || !(event.target instanceof HTMLCanvasElement)) return
      this.gesture = { pointer: event.pointerId, x: event.clientX, y: event.clientY, dragged: false }
      this.controls.preview(this.controls.pointAt(event.clientX, event.clientY))
    })
    viewport.addEventListener('pointermove', (event) => {
      if (!this.controls.enabled()) return this.cancel()
      const gesture = this.gesture
      if (gesture && gesture.pointer !== event.pointerId) return
      if (!gesture && !(event.target instanceof HTMLCanvasElement)) return
      if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 6) gesture.dragged = true
      if (gesture?.dragged) this.controls.preview(null)
      else if (gesture || event.pointerType !== 'touch')
        this.controls.preview(this.controls.pointAt(event.clientX, event.clientY))
    })
    viewport.addEventListener('pointerup', (event) => {
      const gesture = this.gesture
      if (gesture?.pointer !== event.pointerId) return
      const deliberate = !gesture.dragged && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6
      this.cancel()
      const point = this.controls.pointAt(event.clientX, event.clientY)
      if (deliberate && this.controls.enabled() && point) this.controls.place(point)
    })
    for (const name of ['pointercancel', 'lostpointercapture'])
      viewport.addEventListener(name, (event) => {
        if ((event as PointerEvent).pointerId === this.gesture?.pointer) this.cancel()
      })
    viewport.addEventListener('pointerleave', () => this.cancel())
    viewport.addEventListener('scroll', () => this.cancel())
    viewport.addEventListener('wheel', () => this.cancel(), { passive: true })
    window.addEventListener('blur', () => this.cancel())
  }

  cancel(): void {
    this.gesture = undefined
    this.controls.preview(null)
  }
}
