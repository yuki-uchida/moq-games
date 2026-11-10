/**
 * Timing rules that keep a co-op room alive when a tab is hidden (pure, no DOM, unit-tested):
 *
 * - FixedStep: turns irregular frame or timer intervals into whole 60 Hz steps, with a capped backlog so a slow
 *   or late tick never spirals into ever more catch-up work.
 * - hostSilence: how a guest treats a gap in the host's snapshots (live → waiting → long wait, never fatal).
 * - neutralInput: a player's input with everything held let go, keeping the press/release counters (they only grow).
 */
import type { InputState, NetInput } from '../sim/types'

export const STEP = 1 / 60
/** Visible tabs: rAF frames never catch up more than this (a hitch just slows the world briefly). */
export const FRAME_BACKLOG = STEP * 6
/** Hidden host: worker ticks may arrive late; up to a second is caught up, older time is dropped. */
export const BACKGROUND_BACKLOG = 1
/** A guest shows "waiting for the host" after this many seconds without a snapshot. */
export const HOST_STALL = 3
/** …and offers going back to the title after this long (still resuming if the host returns). */
export const HOST_LONG_STALL = 60
/** A joining guest that has not heard from any host this long is told the room was not found (it keeps searching). */
export const ROOM_SEARCH = 13
/** The host treats a guest whose input has not been refreshed for this long as letting go of everything. */
export const INPUT_EXPIRY = 0.5

/** Accumulates elapsed seconds and hands out whole fixed steps. */
export class FixedStep {
  private acc = 0

  constructor(readonly step = STEP) {}

  /** Adds `dt` seconds (backlog capped at `maxBacklog`) and returns the number of steps to run now. */
  advance(dt: number, maxBacklog: number): number {
    if (!(dt > 0)) return 0
    this.acc = Math.min(this.acc + dt, Math.max(maxBacklog, this.step))
    const n = Math.floor((this.acc + 1e-9) / this.step)
    this.acc = Math.max(0, this.acc - n * this.step)
    return n
  }

  reset() {
    this.acc = 0
  }
}

export type HostSilence = 'live' | 'waiting' | 'long'

/** Classifies the seconds since the host's last snapshot. */
export function hostSilence(seconds: number): HostSilence {
  if (!(seconds > HOST_STALL)) return 'live'
  return seconds > HOST_LONG_STALL ? 'long' : 'waiting'
}

/** The same input with movement and every held button released; edge counters and the aim are kept. */
export function neutralInput<T extends InputState>(input: T): T {
  // Counters stay as they are (the world reads a dropped attackHeld as the release of a charge).
  const out: T = { ...input, mx: 0, my: 0, attackHeld: false, actionHeld: false }
  if ('interactHeld' in input) out.interactHeld = false
  const net = out as T & NetInput
  delete net.hero
  delete net.job
  return out
}
