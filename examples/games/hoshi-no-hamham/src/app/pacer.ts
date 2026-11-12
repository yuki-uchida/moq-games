/**
 * The pacer: decides how many fixed simulation steps a display frame runs and where between the last two steps
 * the picture is drawn.
 *
 * Frame times from `requestAnimationFrame` are rounded to 0.1 ms, so adding them up and stepping "when a whole step
 * fits" lands on the boundary at 60 Hz (a frame with no step, a later one with two), gives 1,1,0 at 90 Hz and
 * 1,0,1,1,0 patterns at 120 Hz. The pacer instead learns the display's period from the recent frames, snaps it to
 * a standard refresh rate, counts a normal frame as exactly one period (and a missed frame as the whole number of
 * periods it took), and steps while the accumulator is above zero. The simulation therefore runs up to one step
 * ahead of the picture, and `alpha` says how far between the previous state and the current one the picture is:
 * 1 at 60 Hz, 0.5 and 1 at 120 Hz, 2/3, 1/3 and 1 at 90 Hz.
 */

/** The fixed simulation step in seconds. */
export const STEP = 1 / 60
/** Most steps one frame may run; the rest of a long stall is dropped. */
export const MAX_STEPS = 4

/** Refresh rates a display is snapped to when the measured period is within `SNAP` of one of them. */
export const STANDARD_RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240] as const
const SNAP = 0.015
/** Frame times kept for the period estimate. */
const WINDOW = 32
/** Frames seen before the period is trusted. */
const MIN_FRAMES = 10
/** The period is re-estimated this often (frames), not every frame. */
const REFRESH_EVERY = 4
/** Frame times outside this range (seconds) are stalls or timer glitches, not periods. */
const MIN_PERIOD = 1 / 400
const MAX_PERIOD = 1 / 20
/** A frame counts as n periods when its time is within this share of a period of n × period. */
const NEAR = 0.25
/** The estimate needs this share of the window within `CLUSTER` of the median. */
const REGULAR = 0.7
const CLUSTER = 0.15
/** The estimate is given up after this many assessments in a row found the times irregular. */
const GIVE_UP = 3
/** A change of the period estimate by more than this share restarts the beat. */
const RELEARN = 0.01
/** Accumulator values at or below this (in steps) are zero: float error, not a missing step. */
const EPS = 1e-6

export class Pacer {
  /** Seconds left over from the steps already run: in (−STEP, 0] after a frame (the simulation is ahead). */
  accumulator = 0
  /** Steps run in the current frame. */
  steps = 0
  private times = new Float64Array(WINDOW)
  private scratch = new Float64Array(WINDOW)
  private count = 0
  private next = 0
  private sinceRefresh = 0
  private estimate = 0
  private irregular = 0

  /** The display period (seconds) the pacer is using, or 0 while it uses the real frame times. */
  get period(): number {
    return this.estimate
  }

  /** Starts a frame of `dt` real seconds at time scale `scale` (0 holds the simulation, as does a frozen view). */
  begin(dt: number, scale: number) {
    this.steps = 0
    const before = this.estimate
    this.learn(dt)
    // A period learned (or changed) now puts the steps on the display's beat: what the real-time guess left over
    // is dropped, so a 60 Hz display shows alpha 1 and not a whole step of lag.
    if (this.estimate > 0 && Math.abs(this.estimate - before) > RELEARN * this.estimate) this.accumulator = 0
    if (scale > 0) this.accumulator += this.counted(dt) * scale
  }

  /** True while another step is due in this frame. */
  due(): boolean {
    return this.accumulator > STEP * EPS && this.steps < MAX_STEPS
  }

  /** Records that a step ran. */
  stepped() {
    this.accumulator -= STEP
    this.steps += 1
  }

  /**
   * Ends the frame: drops what a stall left over, and returns `alpha`, the share of the way from the previous
   * step's state to the current one that the picture shows. A held simulation (hit-stop, time scale 0) shows the
   * current state.
   */
  finish(held: boolean): number {
    if ((this.steps === MAX_STEPS || held) && this.accumulator > 0) this.accumulator = 0
    if (held) return 1
    return Math.min(1, Math.max(0, 1 + this.accumulator / STEP))
  }

  /** Forgets the learned period (after a long pause the display may have changed). */
  reset() {
    this.count = 0
    this.next = 0
    this.sinceRefresh = 0
    this.estimate = 0
    this.irregular = 0
    this.accumulator = 0
  }

  /** The time the frame advances the simulation by, before the time scale. */
  private counted(dt: number): number {
    const period = this.estimate
    if (period <= 0 || dt <= 0) return dt
    const n = Math.round(dt / period)
    if (n >= 1 && Math.abs(dt - n * period) <= NEAR * period) return n * period
    return dt
  }

  private learn(dt: number) {
    if (!(dt >= MIN_PERIOD && dt <= MAX_PERIOD)) return
    this.times[this.next] = dt
    this.next = (this.next + 1) % WINDOW
    if (this.count < WINDOW) this.count += 1
    if (this.count < MIN_FRAMES) return
    if (this.sinceRefresh++ % REFRESH_EVERY !== 0) return
    const measured = this.measure()
    if (measured > 0) {
      this.estimate = measured
      this.irregular = 0
    } else if (++this.irregular >= GIVE_UP) this.estimate = 0
  }

  /** The period from the window (0 when the times are too irregular to say). Sorts a reused buffer. */
  private measure(): number {
    const n = this.count
    const sorted = this.scratch
    for (let i = 0; i < n; i++) sorted[i] = this.times[i]
    // Insertion sort: the window is small and nearly sorted from one estimate to the next.
    for (let i = 1; i < n; i++) {
      const v = sorted[i]
      let j = i - 1
      while (j >= 0 && sorted[j] > v) {
        sorted[j + 1] = sorted[j]
        j -= 1
      }
      sorted[j + 1] = v
    }
    const mid = n >> 1
    const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    let near = 0
    let span = 0
    let periods = 0
    for (let i = 0; i < n; i++) {
      const dt = sorted[i]
      if (Math.abs(dt - median) <= CLUSTER * median) near += 1
      // Every frame that took a whole number of periods counts, so the jitter of the timestamps (which cancels
      // from one frame to the next) cancels in the sum too.
      const whole = Math.round(dt / median)
      if (whole >= 1 && Math.abs(dt - whole * median) <= NEAR * median) {
        span += dt
        periods += whole
      }
    }
    if (near < REGULAR * n) return 0
    const mean = span / periods
    for (const rate of STANDARD_RATES) {
      const standard = 1 / rate
      if (Math.abs(mean - standard) <= SNAP * standard) return standard
    }
    return mean
  }
}
