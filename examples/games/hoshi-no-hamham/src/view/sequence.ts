/**
 * A small timeline for staging. A `Sequence` is a list of timed beats plus the *claims* it holds while it runs
 * (simulation time scale, input lock, letterbox bars, HUD cinematic mode, camera, iris, spotlight). Claims are
 * read every frame by the director and dropped the moment a sequence ends, is skipped or is cancelled, so an
 * interrupted sequence can never leave the game held, locked or letterboxed.
 *
 * No DOM and no timers: the director advances every sequence with real time (`update`).
 */

/** What a running sequence holds. Anything left out is not claimed. */
export interface Claims {
  /** Multiplier on simulation time (0 holds it, below 1 is slow motion). The lowest claim wins. */
  scale?: number
  /** The simulation gets empty input. */
  lock?: boolean
  /** Letterbox bars. */
  bars?: boolean
  /** The HUD steps aside. */
  cinematic?: boolean
  /** The sequence drives the camera (released when the claim ends). */
  camera?: boolean
  /** The sequence drives the iris (reopened when the claim ends, unless the stage is over). */
  iris?: boolean
  /** Everything but the spotlit point darkens. */
  spotlight?: boolean
}

interface Beat {
  at: number
  run: () => void
  /** Information beats (title card, nameplate, call) still run when the sequence is skipped. */
  keep: boolean
  done: boolean
}

interface Track {
  from: number
  to: number
  run: (k: number, t: number) => void
}

export interface SequenceOptions {
  /** Higher priority interrupts lower; equal or lower waits its turn. */
  priority?: number
  /** Jump or bite may skip it. */
  skippable?: boolean
  /**
   * Where a skip jumps to (the beats before it that are not `keep` are dropped). Without it a skip ends the
   * sequence. Use it for endings that must still play their last beat (an iris out before the result screen).
   */
  skipTo?: number
  /** The claims, fixed or as a function of the sequence time. */
  claims?: Claims | ((t: number) => Claims)
}

export type SequenceState = 'running' | 'done' | 'cancelled'

export class Sequence {
  time = 0
  state: SequenceState = 'running'
  readonly priority: number
  readonly skippable: boolean
  /** True once a skip was taken. */
  skipped = false
  private beats: Beat[] = []
  private tracks: Track[] = []
  private ends: (() => void)[] = []
  private skipTo: number | null
  private claimsOf: (t: number) => Claims

  constructor(
    readonly name: string,
    /** Seconds until it ends by itself. */
    readonly length: number,
    options: SequenceOptions = {}
  ) {
    this.priority = options.priority ?? 0
    this.skippable = Boolean(options.skippable)
    this.skipTo = options.skipTo ?? null
    const claims = options.claims ?? {}
    this.claimsOf = typeof claims === 'function' ? claims : () => claims
  }

  /** A beat at `t` seconds. `keep` beats also run on a skip. */
  at(t: number, run: () => void, keep = false): this {
    this.beats.push({ at: t, run, keep, done: false })
    this.beats.sort((a, b) => a.at - b.at)
    return this
  }

  /** Called every frame between `from` and `to` with the eased-free progress k in [0, 1]. */
  during(from: number, to: number, run: (k: number, t: number) => void): this {
    this.tracks.push({ from, to, run })
    return this
  }

  /** Runs when the sequence ends by itself or is skipped (not when it is cancelled). */
  onEnd(run: () => void): this {
    this.ends.push(run)
    return this
  }

  get running() {
    return this.state === 'running'
  }

  /** The claims at the current time; nothing once the sequence is over. */
  claims(): Claims {
    return this.running ? this.claimsOf(this.time) : {}
  }

  /** Advances by `dt` real seconds, runs the beats that came due (in order) and ends at `length`. */
  update(dt: number) {
    if (!this.running) return
    this.time = Math.min(this.length, this.time + Math.max(0, dt))
    for (const beat of this.beats) {
      if (!this.running) return
      if (beat.done || beat.at > this.time) continue
      beat.done = true
      beat.run()
    }
    for (const track of this.tracks) {
      if (this.time < track.from || this.time > track.to + 1e-9) continue
      const span = track.to - track.from
      track.run(span > 0 ? Math.min(1, (this.time - track.from) / span) : 1, this.time)
    }
    if (this.running && this.time >= this.length) this.finish()
  }

  /**
   * Skips: jumps to `skipTo` (or to the end), running only the `keep` beats on the way. Returns false when the
   * sequence cannot be skipped (or is already past its skip point).
   */
  skip(): boolean {
    if (!this.running || !this.skippable) return false
    const target = this.skipTo ?? this.length
    if (this.time >= target) return false
    this.skipped = true
    for (const beat of this.beats) {
      if (beat.done || beat.at >= target) continue
      beat.done = true
      if (beat.keep) beat.run()
      if (!this.running) return true
    }
    this.time = target
    if (target >= this.length) this.finish()
    else this.update(0)
    return true
  }

  /** Stops at once: no more beats and no end handlers; the claims are released. */
  cancel() {
    if (this.running) this.state = 'cancelled'
  }

  private finish() {
    if (!this.running) return
    // Beats scheduled exactly at the end still run.
    for (const beat of this.beats) {
      if (beat.done) continue
      beat.done = true
      beat.run()
    }
    this.state = 'done'
    for (const end of this.ends) end()
  }
}

/** Merges the claims of several sequences: the lowest scale, and any of the flags. */
export function mergeClaims(list: readonly Claims[]): Required<Claims> {
  const out: Required<Claims> = {
    scale: 1,
    lock: false,
    bars: false,
    cinematic: false,
    camera: false,
    iris: false,
    spotlight: false
  }
  for (const c of list) {
    if (c.scale !== undefined) out.scale = Math.min(out.scale, Math.max(0, c.scale))
    out.lock ||= Boolean(c.lock)
    out.bars ||= Boolean(c.bars)
    out.cinematic ||= Boolean(c.cinematic)
    out.camera ||= Boolean(c.camera)
    out.iris ||= Boolean(c.iris)
    out.spotlight ||= Boolean(c.spotlight)
  }
  return out
}
