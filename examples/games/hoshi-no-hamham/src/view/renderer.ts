/**
 * The canvas: integer scaling and the two transforms everything is drawn through. The logical view is 640×360;
 * the backing store is 640k × 360k so each art pixel is exactly k×k device pixels, and CSS scales the rest
 * smoothly. The draw order itself lives in `StageView.draw`.
 *
 * The scale is also adaptive: `computeScale` is the upper limit, and while a stage is played the renderer watches
 * the frame intervals and steps k down by one (`nextScale`) when the median is too slow. It never goes back up
 * until the window is resized or the page is reloaded.
 */
import { VIEW_H, VIEW_W } from '../art/contract'

export { VIEW_H, VIEW_W }

/** k = clamp(ceil(cssWidth × dpr / 640), 1, 4). */
export function computeScale(cssWidth: number, devicePixelRatio: number): number {
  const k = Math.ceil((Math.max(0, cssWidth) * (devicePixelRatio > 0 ? devicePixelRatio : 1)) / VIEW_W)
  return Math.max(1, Math.min(4, Number.isFinite(k) ? k : 1))
}

/** Frames the median is taken over before the scale may drop. */
export const SCALE_WINDOW = 90
/** Median frame interval (ms) above which the backing store is scaled down. */
export const SLOW_FRAME_MS = 22
/** Frames ignored after a stage starts or the tab comes back (loading and cache warm-up are not typical). */
export const SETTLE_FRAMES = 45
/** An interval longer than this is a stall (a hidden tab, a debugger), not a frame time. */
const STALL_MS = 250

export function median(values: readonly number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The scale to use after a window of frame intervals (ms, oldest first): one lower when the last
 * `SCALE_WINDOW` intervals have a median above `SLOW_FRAME_MS`, never below 1, never while a staged sequence
 * holds the simulation (`held`), and never higher than `k`.
 */
export function nextScale(k: number, intervals: readonly number[], held: boolean): number {
  if (held || k <= 1 || intervals.length < SCALE_WINDOW) return k
  return median(intervals.slice(-SCALE_WINDOW)) > SLOW_FRAME_MS ? k - 1 : k
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D
  k = 1
  /** The scale the canvas size and pixel ratio allow (the upper limit for the adaptive scale). */
  maxK = 1
  private observer: ResizeObserver | null = null
  private onResize = () => this.resize()
  private onVisible = () => {
    if (!document.hidden) this.resetSampling()
  }
  private cssWidth = -1
  private ratio = -1
  private intervals: number[] = []
  private lastStamp: number | null = null
  private settle = 0

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.resize()
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(this.onResize)
      this.observer.observe(canvas)
    }
    window.addEventListener('resize', this.onResize)
    document.addEventListener('visibilitychange', this.onVisible)
  }

  /**
   * Recomputes k from the canvas's CSS width and the device pixel ratio. A resize that changes neither (the
   * mobile address bar moving, say) keeps a scale that was lowered for speed.
   */
  resize() {
    const cssWidth = this.canvas.clientWidth || VIEW_W
    const ratio = window.devicePixelRatio || 1
    const changed = cssWidth !== this.cssWidth || ratio !== this.ratio
    this.cssWidth = cssWidth
    this.ratio = ratio
    this.maxK = computeScale(cssWidth, ratio)
    this.setScale(changed ? this.maxK : Math.min(this.k, this.maxK))
  }

  private setScale(k: number) {
    if (k === this.k && this.canvas.width === VIEW_W * k) return
    this.k = k
    this.canvas.width = VIEW_W * k
    this.canvas.height = VIEW_H * k
    this.resetSampling()
  }

  /** Forgets the frame intervals gathered so far and ignores the next frames (stage start, tab back, new scale). */
  resetSampling(settleFrames = SETTLE_FRAMES) {
    this.intervals = []
    this.lastStamp = null
    this.settle = settleFrames
  }

  /**
   * Called once per displayed frame with the frame's timestamp (ms). `playing` is false outside live play (menus,
   * pause), `held` while a staged sequence holds the simulation; either way the scale does not change then.
   * Returns true when the scale was lowered.
   */
  observeFrame(now: number, playing: boolean, held: boolean): boolean {
    if (!playing) {
      this.lastStamp = null
      return false
    }
    const last = this.lastStamp
    this.lastStamp = now
    if (last === null) return false
    if (this.settle > 0) {
      this.settle -= 1
      return false
    }
    const interval = now - last
    if (interval > STALL_MS) {
      this.resetSampling(0)
      return false
    }
    this.intervals.push(interval)
    if (this.intervals.length > SCALE_WINDOW) this.intervals.shift()
    const k = nextScale(this.k, this.intervals, held)
    if (k === this.k) return false
    this.setScale(k)
    return true
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
    document.removeEventListener('visibilitychange', this.onVisible)
  }
}
