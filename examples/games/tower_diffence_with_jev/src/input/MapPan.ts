export class MapPan {
  private gesture?: { pointer: number; x: number; y: number; left: number; top: number }

  constructor(private viewport: HTMLElement) {
    viewport.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || !(event.target instanceof HTMLCanvasElement)) return
      this.gesture = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop
      }
      viewport.setPointerCapture(event.pointerId)
      viewport.classList.add('panning')
      viewport.focus({ preventScroll: true })
    })
    viewport.addEventListener('pointermove', (event) => {
      const gesture = this.gesture
      if (gesture?.pointer !== event.pointerId) return
      viewport.scrollLeft = gesture.left + gesture.x - event.clientX
      viewport.scrollTop = gesture.top + gesture.y - event.clientY
    })
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
      viewport.addEventListener(name, (event) => {
        if ((event as PointerEvent).pointerId === this.gesture?.pointer) this.cancel()
      })
    window.addEventListener('blur', () => this.cancel())
  }

  cancel(): void {
    const gesture = this.gesture
    this.gesture = undefined
    this.viewport.classList.remove('panning')
    if (gesture && this.viewport.hasPointerCapture(gesture.pointer))
      this.viewport.releasePointerCapture(gesture.pointer)
  }
}
