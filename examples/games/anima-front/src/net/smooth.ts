/**
 * Render-rate smoothing for a world stepped at 60 Hz in this tab (solo and host): keeps the views after the last
 * two steps and presents the state between them at the stepper's alpha, so 120/144 Hz displays move smoothly.
 * Every event is handed out exactly once (with the first presentation after the step that emitted it).
 */
import type { World } from '../sim/api'
import type { PlayerInput, SimEvent, View } from '../sim/types'
import { interpolateView } from './interp'

export class SmoothedWorld {
  private prev: View | null = null
  private cur: View | null = null
  private events: SimEvent[] = []

  constructor(readonly world: World) {}

  /** The newest stepped view (events already moved to the presentation queue). */
  get latest(): View | null {
    return this.cur
  }

  /** Takes the world's first view (before any step); returns it with its events. */
  prime(): View {
    const v = this.world.view()
    this.events.push(...v.events)
    this.cur = { ...v, events: [] }
    this.prev = this.cur
    return v
  }

  /** One fixed step with these inputs; returns the world's new view (its `events` are the step's events). */
  step(inputs: ReadonlyMap<string, PlayerInput>): View {
    this.world.step(inputs)
    const v = this.world.view()
    if (v.events.length) this.events.push(...v.events)
    this.prev = this.cur ?? { ...v, events: [] }
    this.cur = { ...v, events: [] }
    return v
  }

  /** The state `alpha` (0..1) of the way from the previous step to the newest, with the events not yet shown. */
  present(alpha: number): View | null {
    if (!this.cur) return null
    const base =
      this.prev && this.prev !== this.cur && alpha < 1 ? interpolateView(this.prev, this.cur, alpha) : this.cur
    const events = this.events
    this.events = []
    return { ...base, events }
  }

  /** Drops queued events older than `t` (a hidden tab coming back does not replay seconds of effects). */
  skipEventsBefore(t: number) {
    if (this.events.length && this.events[0].t < t) this.events = this.events.filter((e) => e.t >= t)
  }
}
