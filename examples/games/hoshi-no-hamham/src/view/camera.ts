/**
 * The view camera (no DOM): follows the hero with horizontal look-ahead and a vertical dead zone, clamps to the
 * map, shakes from a trauma value and short directional kicks, and can be taken over by staging (`panTo`).
 * Positions are the top-left of the 640×360 logical view in world pixels.
 */
import { VIEW_H, VIEW_W } from '../art/contract'
import { TILE } from '../game/types'

/** What the camera follows. */
export interface CameraTarget {
  x: number
  y: number
  w: number
  h: number
  vx: number
  facing: 1 | -1
  onGround: boolean
}

export interface CameraOptions {
  /** Map size in tiles. */
  mapW: number
  mapH: number
  /** `prefers-reduced-motion`: no shake and no kicks. */
  reducedMotion?: boolean
}

/** How far ahead of the hero the view leans, in px. */
export const LOOK_AHEAD = 48
/** Largest shake offset in px (at trauma 1). */
export const MAX_SHAKE = 6
/** Seconds for trauma 1 to decay to 0. */
export const SHAKE_DECAY = 0.4
/** The hero's feet sit this far down the view while grounded. */
const FEET_SCREEN_Y = 0.66
/** Feet may move this far above or below the vertical focus before the view follows (px). */
const DEAD_UP = 56
const DEAD_DOWN = 24
/** Smoothing rates (1/s). */
const FOLLOW_X = 7
const FOLLOW_Y = 5
const LOOK_RATE = 2.5
const FOCUS_RATE = 6

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const smooth = (rate: number, dt: number) => 1 - Math.exp(-rate * dt)
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

export class Camera {
  /** Top-left of the view, before shake. */
  x = 0
  y = 0
  trauma = 0
  reducedMotion: boolean
  private readonly maxX: number
  private readonly maxY: number
  private look = 0
  private focusY = 0
  private kickX = 0
  private kickY = 0
  private time = 0
  private pan: { fromX: number; fromY: number; toX: number; toY: number; t: number; seconds: number } | null = null

  constructor(options: CameraOptions) {
    this.maxX = Math.max(0, options.mapW * TILE - VIEW_W)
    this.maxY = Math.max(-40, options.mapH * TILE - VIEW_H)
    this.reducedMotion = Boolean(options.reducedMotion)
  }

  /** Clamps a view position to the map (x in [0, w·64 − 640], y in [−40, h·64 − 360]). */
  clamp(x: number, y: number) {
    return { x: clamp(x, 0, this.maxX), y: clamp(y, -40, this.maxY) }
  }

  /** The view y that puts feet at `feetY` on the resting line (unclamped). */
  restingY(feetY: number) {
    return feetY - VIEW_H * FEET_SCREEN_Y
  }

  /** Jumps straight to the target without smoothing (stage start). */
  snap(target: CameraTarget) {
    this.look = target.facing * LOOK_AHEAD
    this.focusY = target.y + target.h
    const goal = this.goal(target)
    this.x = goal.x
    this.y = goal.y
  }

  /** The view centre the follow logic settles on for `target` (where staging pans back to before `release`). */
  followCentre(target: CameraTarget) {
    const goal = this.goal(target)
    return { x: goal.x + VIEW_W / 2, y: goal.y + VIEW_H / 2 }
  }

  /** Whether a world point lies inside the current view (with `margin` px to spare). */
  sees(x: number, y: number, margin = 0) {
    return (
      x >= this.x + margin && x <= this.x + VIEW_W - margin && y >= this.y + margin && y <= this.y + VIEW_H - margin
    )
  }

  private goal(target: CameraTarget) {
    return this.clamp(target.x + target.w / 2 + this.look - VIEW_W / 2, this.restingY(this.focusY))
  }

  update(dt: number, target: CameraTarget) {
    this.time += dt
    // Look-ahead leans toward where the hero moves, or faces when standing.
    const moving = Math.abs(target.vx) > 30 ? Math.sign(target.vx) : target.facing
    this.look += (moving * LOOK_AHEAD - this.look) * smooth(LOOK_RATE, dt)
    // Vertical dead zone: small hops keep the view still; landing somewhere new re-centres it.
    const feet = target.y + target.h
    if (target.onGround) this.focusY += (feet - this.focusY) * smooth(FOCUS_RATE, dt)
    if (feet < this.focusY - DEAD_UP) this.focusY = feet + DEAD_UP
    if (feet > this.focusY + DEAD_DOWN) this.focusY = feet - DEAD_DOWN
    if (this.pan) {
      const pan = this.pan
      pan.t = Math.min(pan.seconds, pan.t + dt)
      const k = pan.seconds > 0 ? ease(pan.t / pan.seconds) : 1
      const at = this.clamp(pan.fromX + (pan.toX - pan.fromX) * k, pan.fromY + (pan.toY - pan.fromY) * k)
      this.x = at.x
      this.y = at.y
    } else {
      const goal = this.goal(target)
      this.x += (goal.x - this.x) * smooth(FOLLOW_X, dt)
      this.y += (goal.y - this.y) * smooth(FOLLOW_Y, dt)
    }
    this.trauma = Math.max(0, this.trauma - dt / SHAKE_DECAY)
    const kickDecay = Math.exp(-dt * 22)
    this.kickX *= kickDecay
    this.kickY *= kickDecay
    if (Math.abs(this.kickX) < 0.05) this.kickX = 0
    if (Math.abs(this.kickY) < 0.05) this.kickY = 0
  }

  /** Adds screen-shake trauma (0..1, summed and capped at 1). */
  addTrauma(amount: number) {
    if (this.reducedMotion) return
    this.trauma = Math.min(1, this.trauma + amount)
  }

  /** A short directional push of the view, in px. */
  kick(dx: number, dy: number) {
    if (this.reducedMotion) return
    this.kickX += dx
    this.kickY += dy
  }

  /** Moves the view so its centre goes to (x, y) over `seconds`, and holds it there until `release()`. */
  panTo(x: number, y: number, seconds: number) {
    const to = this.clamp(x - VIEW_W / 2, y - VIEW_H / 2)
    this.pan = { fromX: this.x, fromY: this.y, toX: to.x, toY: to.y, t: 0, seconds: Math.max(0, seconds) }
  }

  /** Gives the view back to the follow logic (it eases back to the hero). */
  release() {
    this.pan = null
  }

  get panning() {
    return this.pan !== null
  }

  /** Shake plus kick offset in px. Zero under reduced motion. */
  offset() {
    if (this.reducedMotion) return { x: 0, y: 0 }
    const amp = MAX_SHAKE * this.trauma * this.trauma
    const t = this.time
    const sx = amp ? amp * (Math.sin(t * 61.3) * 0.6 + Math.sin(t * 97.1 + 1.3) * 0.4) : 0
    const sy = amp ? amp * (Math.sin(t * 71.7 + 2.1) * 0.6 + Math.sin(t * 89.9 + 0.4) * 0.4) : 0
    return { x: sx + this.kickX, y: sy + this.kickY }
  }

  /** The drawn view position: clamped base plus offset, snapped to steps of 1/k. */
  view(k: number) {
    const o = this.offset()
    const at = this.clamp(this.x + o.x, this.y + o.y)
    return { x: Math.round(at.x * k) / k, y: Math.round(at.y * k) / k }
  }
}
