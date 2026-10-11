import { type Placement, type AllyType } from '../game/model'

interface DragControls {
  canDeploy: (type: AllyType) => boolean
  select: (type: AllyType) => void
  targetAt: (x: number, y: number) => Placement | null
  deploy: (type: AllyType, target: Placement) => void
  preview: (target: Placement | null) => void
  active?: (active: boolean) => void
  status?: (type: AllyType, target: Placement) => { valid: boolean; label: string }
}

export class UnitDrag {
  private gesture?: { card: HTMLButtonElement; type: AllyType; pointer: number; x: number; y: number }
  private ghost?: HTMLDivElement

  constructor(private controls: DragControls) {
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

  bind(card: HTMLButtonElement, type: AllyType): void {
    card.addEventListener('dragstart', (event) => event.preventDefault())
    card.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary) return this.cancel()
      if (this.gesture || !event.isPrimary || event.button !== 0 || !this.controls.canDeploy(type)) return
      event.preventDefault()
      this.controls.select(type)
      this.gesture = { card, type, pointer: event.pointerId, x: event.clientX, y: event.clientY }
      card.setPointerCapture(event.pointerId)
    })
    card.addEventListener('pointermove', (event) => {
      const gesture = this.gesture
      if (!gesture || gesture.pointer !== event.pointerId) return
      if (!this.ghost && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6) return
      if (!this.controls.canDeploy(type)) {
        this.cancel()
        return
      }
      if (!this.ghost) {
        this.controls.active?.(true)
        this.ghost = document.createElement('div')
        this.ghost.className = 'drag-unit'
        this.ghost.setAttribute('aria-hidden', 'true')
        this.ghost.append(card.querySelector('img')!.cloneNode())
        this.ghost.append(document.createElement('span'))
        document.body.append(this.ghost)
        card.classList.add('dragging')
      }
      const target = this.controls.targetAt(event.clientX, event.clientY)
      this.ghost.style.left = `${event.clientX}px`
      this.ghost.style.top = `${event.clientY}px`
      const status = target && this.controls.status?.(type, target)
      this.ghost.classList.toggle('valid', target !== null && (status?.valid ?? true))
      this.ghost.querySelector('span')!.textContent =
        target === null ? '道の外の地面へドラッグ' : (status?.label ?? 'この地面に配置')
      this.controls.preview(target)
    })
    card.addEventListener('pointerup', (event) => {
      if (this.gesture?.pointer !== event.pointerId) return
      const target = this.ghost ? this.controls.targetAt(event.clientX, event.clientY) : null
      const deploy =
        target !== null && this.controls.canDeploy(type) && (this.controls.status?.(type, target).valid ?? true)
      this.cancel()
      if (deploy) this.controls.deploy(type, target!)
    })
    for (const name of ['pointercancel', 'lostpointercapture'])
      card.addEventListener(name, (event) => {
        if ((event as PointerEvent).pointerId === this.gesture?.pointer) this.cancel()
      })
  }

  cancel(): void {
    const gesture = this.gesture
    this.gesture = undefined
    this.ghost?.remove()
    this.ghost = undefined
    this.controls.preview(null)
    this.controls.active?.(false)
    if (gesture) {
      gesture.card.classList.remove('dragging')
      if (gesture.card.hasPointerCapture(gesture.pointer)) gesture.card.releasePointerCapture(gesture.pointer)
    }
  }
}
