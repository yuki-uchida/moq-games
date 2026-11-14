/**
 * The canvas: integer scaling and the two transforms everything is drawn through. The logical view is 640×360;
 * the backing store is 640k × 360k so each art pixel is exactly k×k device pixels, and CSS scales the rest
 * smoothly. The draw order itself lives in `StageView.draw`.
 *
 * The scale is also adaptive: `computeScale` is the upper limit, and while a stage is played the renderer watches
 * the frame intervals and steps k down by one (`nextScale`) when the median is too slow or when a fifth of the
 * frames are missed ones. A smaller canvas only helps where painting its pixels is what takes the time, so a frame
 * that is late because the page's own work ran into it does not count: the caller says how far into each frame
 * the game was still working. The renderer looks at the next window to see whether a drop helped: when it did
 * not, the system caps the rate (not the canvas), k goes back up and the renderer stops adapting. It never goes
 * back up otherwise until the window is resized or the page is reloaded.
 */
import { VIEW_H, VIEW_W } from '../art/contract'

export { VIEW_H, VIEW_W }

/** A scale of 3 or 4 whose true ratio is at most this far above the next whole number below it takes that one. */
const SCALE_SLACK = 1.08

/**
 * k = clamp(ceil(cssWidth × dpr / 640), 1, 4), except that a ratio just above a whole number of 2 or more
 * (651 CSS px at ratio 3 is 3.05) takes that number instead of one more: the extra step would paint up to 1.7
 * times the pixels of the screen. Scales of 1 and 2 stay as they are (700 at ratio 1 is still 2).
 */
export function computeScale(cssWidth: number, devicePixelRatio: number): number {
  const exact = (Math.max(0, cssWidth) * (devicePixelRatio > 0 ? devicePixelRatio : 1)) / VIEW_W
  let k = Math.ceil(exact)
  if (Number.isFinite(k) && k >= 3 && exact <= (k - 1) * SCALE_SLACK) k -= 1
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
/** The window is assessed this often (frames), not every frame. */
export const CHECK_EVERY = 15
/** A frame is a missed one when it took more than this many times the window's lower quartile. */
export const MISSED_FACTOR = 1.6
/** The scale drops when at least this share of the window's frames are missed ones. */
export const MISSED_SHARE = 0.2
/** After a drop, the median must be this much shorter (a fraction) for the drop to have been the reason. */
export const HELPED_GAIN = 0.1
/**
 * A frame in which the game was still working this far in (a share of the display's period) leaves the browser
 * too little time to show it by the next refresh: the frame after it is late because of the main thread, whatever
 * the canvas costs. (Measured with the CPU slowed four times at 120 Hz: every late frame followed one that had
 * worked through 88 % of the period or more.)
 */
export const MAIN_SHARE = 0.6

export function median(values: readonly number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** What a window of frame intervals says. */
export interface WindowStats {
  median: number
  quartile: number
  /**
   * Share of the frames that took more than `MISSED_FACTOR` × the lower quartile although the main thread had
   * finished the frame before in time.
   */
  missed: number
  /** True when in most frames the game worked `MAIN_SHARE` of the lower quartile or more: the main thread sets the pace. */
  bound: boolean
}

const scratch = new Float64Array(SCALE_WINDOW)

/**
 * Median, lower quartile and missed share of `values[from..to)`; sorts a reused buffer (no allocation). `busy`,
 * where given, holds for each interval how many milliseconds into the frame that began it the game was still
 * working; without it every late frame counts as missed.
 */
export function windowStats(
  values: ArrayLike<number>,
  from: number,
  to: number,
  busy?: ArrayLike<number>
): WindowStats {
  const n = to - from
  if (n <= 0) return { median: 0, quartile: 0, missed: 0, bound: false }
  const sorted = n <= scratch.length ? scratch : new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const v = values[from + i]
    let j = i - 1
    while (j >= 0 && sorted[j] > v) {
      sorted[j + 1] = sorted[j]
      j -= 1
    }
    sorted[j + 1] = v
  }
  const mid = n >> 1
  const med = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const quartile = sorted[n >> 2]
  const late = MISSED_FACTOR * quartile
  const full = MAIN_SHARE * quartile
  let missed = 0
  let worked = 0
  for (let i = 0; i < n; i++) {
    const own = busy ? busy[from + i] >= full : false
    if (own) worked += 1
    else if (values[from + i] > late) missed += 1
  }
  return { median: med, quartile, missed: missed / n, bound: worked * 2 > n }
}

/**
 * True when a window is a reason to scale down: a slow median that the main thread does not explain, or a fifth of
 * the frames missed.
 */
export function isSlow(stats: WindowStats): boolean {
  return (stats.median > SLOW_FRAME_MS && !stats.bound) || stats.missed >= MISSED_SHARE
}

/**
 * The scale to use after a window of frame intervals (ms, oldest first): one lower when the last
 * `SCALE_WINDOW` intervals are slow (`isSlow`), never below 1, never while a staged sequence holds the
 * simulation (`held`), and never higher than `k`. `busy` is what `windowStats` takes, in step with `intervals`.
 */
export function nextScale(k: number, intervals: readonly number[], held: boolean, busy?: readonly number[]): number {
  if (held || k <= 1 || intervals.length < SCALE_WINDOW) return k
  return isSlow(windowStats(intervals, intervals.length - SCALE_WINDOW, intervals.length, busy)) ? k - 1 : k
}

/** Whether the window after a drop shows that the drop was the reason: a shorter median or far fewer misses. */
export function dropHelped(before: WindowStats, after: WindowStats): boolean {
  if (after.median <= before.median * (1 - HELPED_GAIN)) return true
  return before.missed >= MISSED_SHARE && after.missed <= before.missed / 2
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D
  k = 1
  /** The scale the canvas size and pixel ratio allow (the upper limit for the adaptive scale). */
  maxK = 1
  /** True once a drop did not help: the rate is capped by the system and the scale is left alone. */
  adaptationOff = false
  private observer: ResizeObserver | null = null
  private onResize = () => this.resize()
  private onVisible = () => {
    if (!document.hidden) this.resetSampling()
  }
  private cssWidth = -1
  private ratio = -1
  private ring = new Float64Array(SCALE_WINDOW)
  /** In step with `ring`: how far into the frame that began each interval the game was still working (ms). */
  private busyRing = new Float64Array(SCALE_WINDOW)
  private ringNext = 0
  private ringCount = 0
  private sinceCheck = 0
  /** The window that made the last drop, until the next full window says whether it helped. */
  private probe: WindowStats | null = null
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
    if (changed) {
      this.adaptationOff = false
      this.probe = null
    }
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
    this.ringNext = 0
    this.ringCount = 0
    this.sinceCheck = 0
    this.lastStamp = null
    this.settle = settleFrames
  }

  /**
   * Called once per displayed frame with the frame's timestamp (ms). `playing` is false outside live play (menus,
   * pause), `held` while a staged sequence holds the simulation; either way the scale does not change then.
   * `busy` is how many milliseconds after the previous frame's timestamp the game finished that frame's work.
   * Returns true when the scale was changed.
   */
  observeFrame(now: number, playing: boolean, held: boolean, busy = 0): boolean {
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
    this.ring[this.ringNext] = interval
    this.busyRing[this.ringNext] = busy
    this.ringNext = (this.ringNext + 1) % SCALE_WINDOW
    if (this.ringCount < SCALE_WINDOW) this.ringCount += 1
    this.sinceCheck += 1
    if (this.adaptationOff || held || this.ringCount < SCALE_WINDOW || this.sinceCheck < CHECK_EVERY) return false
    this.sinceCheck = 0
    const stats = windowStats(this.ring, 0, SCALE_WINDOW, this.busyRing)
    if (this.probe) {
      const before = this.probe
      this.probe = null
      if (!dropHelped(before, stats)) {
        // The frame rate did not follow the canvas: the system caps it. Give the pixels back and stop adapting.
        this.adaptationOff = true
        this.setScale(Math.min(this.maxK, this.k + 1))
        return true
      }
    }
    if (this.k <= 1 || !isSlow(stats)) return false
    this.probe = stats
    this.setScale(this.k - 1)
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
