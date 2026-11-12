/**
 * A guest's inputs on the host, replayed on the guest's own tick line (pure, unit-tested). Each input names the
 * guest prediction tick it starts at; the host walks a cursor along those ticks, one per world step, a few ticks
 * behind the newest input so network jitter never changes how many steps an input lasts. The world therefore sees
 * exactly the input sequence the guest predicted with, and the cursor is the guest tick each host state matches
 * (the snapshot's ack). When the guest falls behind the cursor waits (repeating the input); when inputs pile up
 * (the host steps slower than real time, or a burst arrived late) it jumps back to the target distance: the
 * skipped ticks only held movement (presses are counters and are never lost) and the guest reconciles.
 */
import type { PlayerInput } from '../sim/types'
import { releasedInput } from './validate'

/** Target ticks between the cursor and the newest input (absorbs ~±30 ms of jitter). */
export const INPUT_BUFFER = 2
/** More than this many ticks queued: jump ahead to the target distance. */
const MAX_LAG = 8
const MAX_QUEUE = 64

export class InputBuffer {
  /** Guest tick of the input the world last stepped with. */
  cursor: number
  /** Newest input received (in arrival order; counters already validated against the previous one). */
  latest: PlayerInput
  /** Room time (s) the newest input arrived. */
  at: number
  private lastG: number
  private readonly queue: { g: number; value: PlayerInput }[] = []
  private current: PlayerInput | null = null

  constructor(
    readonly nonce: number,
    g: number,
    value: PlayerInput,
    at: number
  ) {
    this.cursor = g - 1 - INPUT_BUFFER
    this.lastG = g
    this.latest = value
    this.at = at
    this.queue.push({ g, value })
  }

  /** Adds an input starting at guest tick `g`; older or repeated ticks are ignored. */
  push(g: number, value: PlayerInput, at: number): boolean {
    if (g <= this.lastG) return false
    this.lastG = g
    this.latest = value
    this.at = at
    this.queue.push({ g, value })
    while (this.queue.length > MAX_QUEUE) this.queue.shift()
    return true
  }

  get newestTick() {
    return this.lastG
  }

  /**
   * Advances the cursor for one world step and returns the input to step with. `expired`: nothing arrived for a
   * while, so every held control is let go (the counters stay).
   */
  next(expired: boolean, fallback: PlayerInput): PlayerInput {
    // Inputs are sent every other tick: the newest one covers its own tick and the next.
    const lag = this.lastG + 1 - this.cursor
    if (lag > MAX_LAG) this.cursor = this.lastG + 1 - INPUT_BUFFER
    else if (lag > 0) this.cursor += 1
    while (this.queue.length > 1 && this.queue[1].g <= this.cursor) this.queue.shift()
    if (this.queue.length && this.queue[0].g <= this.cursor) this.current = this.queue[0].value
    const input = this.current ?? fallback
    return expired ? releasedInput(input) : input
  }
}
