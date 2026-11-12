/**
 * The guest's own body (DESIGN §18): predicted at 60 Hz with createPredictor from the inputs the guest sends, and
 * reconciled against the host. Every input carries the guest tick it takes effect at; the host acknowledges, per
 * snapshot, the guest tick its authoritative state corresponds to. The difference between that state and the
 * prediction recorded for the same tick is moved into the physics state at once (so later steps start from the
 * right place) and into a render offset that fades over ~0.1 s (so the drawn body never jumps). Teleports (warp,
 * respawn, hooks, huge errors) snap to the host instead.
 */
import { createPredictor } from '../sim/api'
import {
  neutralPlayerInput,
  type MapDef,
  type PlayerConfig,
  type PlayerInput,
  type PlayerView,
  type PropView,
  type V3
} from '../sim/types'

type Predictor = ReturnType<typeof createPredictor>

const HISTORY = 240
/** Corrections below this are ignored (metres). */
const EPSILON = 0.01
/** Errors beyond this snap to the host and replay the inputs since (metres). */
const SNAP = 6
/** Velocity differences beyond this (m/s) are taken from the host (knockback, launches). */
const VELOCITY_KICK = 2.5
/** Render offset fade time constant (seconds). */
const FADE = 0.1

interface Frame {
  p: V3
  v: V3
  input: PlayerInput
}

export interface ReconcileStats {
  /** Corrections applied so far and the largest one (metres). */
  corrections: number
  maxError: number
  snaps: number
  /** Last measured error before correcting (metres). */
  lastError: number
  /** Guest ticks between the newest prediction and the newest acknowledged host state (≈ round trip). */
  behind: number
}

export class OwnBody {
  readonly predictor: Predictor
  /** Guest prediction tick (the number of steps taken). */
  tick = 0
  private readonly history = new Map<number, Frame>()
  private offset: V3 = [0, 0, 0]
  private started = false
  private lastState: PlayerView['state'] | undefined
  readonly stats: ReconcileStats = { corrections: 0, maxError: 0, snaps: 0, lastError: 0, behind: 0 }

  constructor(map: MapDef, player: PlayerConfig) {
    this.predictor = createPredictor(map, player)
  }

  /** True once the body was placed from a host snapshot. */
  get ready() {
    return this.started
  }

  /** One 60 Hz step with the input sent for this tick. */
  step(input: PlayerInput) {
    this.tick++
    this.predictor.step(input)
    const b = this.predictor.body
    this.history.set(this.tick, { p: [b.p[0], b.p[1], b.p[2]], v: [b.v[0], b.v[1], b.v[2]], input })
    this.history.delete(this.tick - HISTORY)
  }

  /** Fades the render offset by real time `dt`. */
  fade(dt: number) {
    const k = Math.exp(-Math.max(0, dt) / FADE)
    for (let i = 0; i < 3; i++) this.offset[i] = Math.abs(this.offset[i] * k) < 1e-4 ? 0 : this.offset[i] * k
  }

  /** Where to draw the body now. */
  drawn(): V3 {
    const p = this.predictor.body.p
    return [p[0] + this.offset[0], p[1] + this.offset[1], p[2] + this.offset[2]]
  }

  /**
   * Applies an authoritative state. `at` is the guest tick it corresponds to (undefined before the host has seen
   * any input of this session).
   */
  reconcile(auth: PlayerView, at: number | undefined, props?: readonly PropView[]) {
    const pred = this.predictor
    pred.sync(auth, props)
    const teleport =
      !this.started ||
      auth.state === 'away' ||
      auth.move === 'hook' ||
      (this.lastState !== undefined && this.lastState !== auth.state && auth.state === 'alive')
    this.lastState = auth.state
    if (teleport) {
      this.snapTo(auth, at)
      return
    }
    if (at === undefined) return
    this.stats.behind = this.tick - at
    if (at > this.tick) {
      // The host is ahead of this tab (it was hidden): continue from the host's state.
      this.tick = at
      this.history.clear()
      this.snapTo(auth, undefined)
      return
    }
    const past = this.history.get(at)
    if (!past) return
    const err: V3 = [auth.p[0] - past.p[0], auth.p[1] - past.p[1], auth.p[2] - past.p[2]]
    const size = Math.hypot(err[0], err[1], err[2])
    this.stats.lastError = size
    if (size > SNAP) {
      this.replayFrom(auth, at)
      return
    }
    const dv: V3 = [auth.v[0] - past.v[0], auth.v[1] - past.v[1], auth.v[2] - past.v[2]]
    const kick = Math.hypot(dv[0], dv[1], dv[2]) > VELOCITY_KICK
    if (size < EPSILON && !kick) return
    this.stats.corrections++
    this.stats.maxError = Math.max(this.stats.maxError, size)
    pred.correct(err, kick ? dv : undefined)
    for (const [t, f] of this.history) {
      if (t < at) continue
      for (let i = 0; i < 3; i++) {
        f.p[i] += err[i]
        if (kick) f.v[i] += dv[i]
      }
    }
    for (let i = 0; i < 3; i++) this.offset[i] -= err[i]
  }

  private snapTo(auth: PlayerView, at: number | undefined) {
    this.started = true
    this.stats.snaps++
    this.predictor.reset(auth)
    this.offset = [0, 0, 0]
    if (at !== undefined && at <= this.tick) this.replayInputs(at)
    const b = this.predictor.body
    this.history.set(this.tick, { p: [b.p[0], b.p[1], b.p[2]], v: [b.v[0], b.v[1], b.v[2]], input: this.inputAt() })
  }

  private replayFrom(auth: PlayerView, at: number) {
    const before = this.drawn()
    this.stats.snaps++
    this.predictor.reset(auth)
    this.replayInputs(at)
    const now = this.predictor.body.p
    // A huge error is a teleport: draw it at once (no offset) unless it is a short hop.
    const jump = Math.hypot(now[0] - before[0], now[1] - before[1], now[2] - before[2])
    this.offset = jump < SNAP ? [before[0] - now[0], before[1] - now[1], before[2] - now[2]] : [0, 0, 0]
  }

  /** Re-runs the inputs recorded after tick `at` on the current predictor state. */
  private replayInputs(at: number) {
    const end = this.tick
    const from = this.history.get(at)
    if (from) this.predictor.setSeen(from.input.presses)
    for (let t = at + 1; t <= end; t++) {
      const f = this.history.get(t)
      if (!f) continue
      this.predictor.step(f.input)
      const b = this.predictor.body
      f.p = [b.p[0], b.p[1], b.p[2]]
      f.v = [b.v[0], b.v[1], b.v[2]]
    }
  }

  private inputAt(): PlayerInput {
    const f = this.history.get(this.tick) ?? this.history.get(this.tick - 1)
    return f?.input ?? neutralPlayerInput()
  }
}
