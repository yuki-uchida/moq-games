/**
 * The canvas: integer scaling and the two transforms everything is drawn through. The logical view is 640×360;
 * the backing store is 640k × 360k so each art pixel is exactly k×k device pixels, and CSS scales the rest
 * smoothly. The draw order itself lives in `StageView.draw`.
 */
import { VIEW_H, VIEW_W } from '../art/contract'

export { VIEW_H, VIEW_W }

/** k = clamp(ceil(cssWidth × dpr / 640), 1, 4). */
export function computeScale(cssWidth: number, devicePixelRatio: number): number {
  const k = Math.ceil((Math.max(0, cssWidth) * (devicePixelRatio > 0 ? devicePixelRatio : 1)) / VIEW_W)
  return Math.max(1, Math.min(4, Number.isFinite(k) ? k : 1))
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D
  k = 1
  private observer: ResizeObserver | null = null
  private onResize = () => this.resize()

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.resize()
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(this.onResize)
      this.observer.observe(canvas)
    }
    window.addEventListener('resize', this.onResize)
  }

  /** Recomputes k from the canvas's CSS width and the device pixel ratio. */
  resize() {
    const k = computeScale(this.canvas.clientWidth || VIEW_W, window.devicePixelRatio || 1)
    if (k === this.k && this.canvas.width === VIEW_W * k) return
    this.k = k
    this.canvas.width = VIEW_W * k
    this.canvas.height = VIEW_H * k
  }

  /** Screen space: logical pixels, origin top-left. */
  screen() {
    this.ctx.setTransform(this.k, 0, 0, this.k, 0, 0)
    this.ctx.imageSmoothingEnabled = false
    this.ctx.globalAlpha = 1
  }

  /** World space for a view at (x, y); x and y must be multiples of 1/k. */
  world(x: number, y: number) {
    const k = this.k
    this.ctx.setTransform(k, 0, 0, k, Math.round(-x * k), Math.round(-y * k))
    this.ctx.imageSmoothingEnabled = false
    this.ctx.globalAlpha = 1
  }

  clear(color = '#0d0722') {
    this.screen()
    this.ctx.fillStyle = color
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }

  dispose() {
    this.observer?.disconnect()
    window.removeEventListener('resize', this.onResize)
  }
}
