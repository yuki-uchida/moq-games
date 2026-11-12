/**
 * A match session: where views come from. The game screen only talks to `Session`, so a local world, a host
 * that also serves guests, a guest that receives snapshots, or the HUD demo all look the same to it.
 */
import { createWorld, getMap, type World } from '../sim/api'
import type { MapDef, MatchConfig, PlayerInput, View } from '../sim/types'
import { SmoothedWorld } from '../net/smooth'

/** Fixed simulation step (DESIGN §2). */
export const STEP = 1 / 60
/** At most this many steps per frame; older backlog is dropped (a stalled tab never fast-forwards). */
export const MAX_STEPS_PER_FRAME = 6

/** Fixed-step accumulator with a capped backlog. */
export class FixedStepper {
  private acc = 0
  constructor(
    readonly step = STEP,
    readonly maxSteps = MAX_STEPS_PER_FRAME
  ) {}

  /** Adds real time and runs `tick` once per whole step; returns how many steps ran. */
  advance(dt: number, tick: () => void): number {
    if (!(dt > 0)) return 0
    this.acc += Math.min(dt, 1)
    let n = 0
    while (this.acc >= this.step - 1e-9 && n < this.maxSteps) {
      tick()
      this.acc -= this.step
      n++
    }
    if (n === this.maxSteps && this.acc >= this.step) this.acc = 0
    return n
  }

  /** 0..1 progress into the next step (for interpolation). */
  get alpha(): number {
    return Math.max(0, Math.min(1, this.acc / this.step))
  }

  reset(): void {
    this.acc = 0
  }
}

export interface Session {
  readonly kind: 'local' | 'host' | 'guest' | 'demo'
  /** Local player id. */
  readonly me: string
  readonly config: MatchConfig
  readonly map: MapDef
  /** Solo pauses the world; online matches keep running. */
  readonly canPause: boolean
  /** True once the results screen should be shown. */
  readonly over: boolean
  /** The local player's latest control state. */
  setInput(input: PlayerInput): void
  /** Advances by real time `dt` and returns the newest view (its `events` are new since the last call). */
  update(dt: number): View | null
  setPaused(paused: boolean): void
  dispose(): void
}

/**
 * Solo: the world runs in this tab; bots are inside the world. Views are presented between the last two steps
 * at the render rate (smooth on 120/144 Hz displays); each event is handed out once.
 */
export function createLocalSession(
  config: MatchConfig,
  me: string,
  make: (config: MatchConfig) => World = createWorld
): Session {
  const world = make(config)
  const smooth = new SmoothedWorld(world)
  const stepper = new FixedStepper()
  const inputs = new Map<string, PlayerInput>()
  let paused = false
  let last: View | null = null
  return {
    kind: 'local',
    me,
    config,
    get map() {
      return world.map ?? getMap(config.map, config.variant)
    },
    canPause: true,
    get over() {
      return world.over
    },
    setInput(input) {
      inputs.set(me, input)
    },
    update(dt) {
      if (paused) return last ? { ...last, events: [] } : null
      if (!smooth.latest) smooth.prime()
      stepper.advance(dt, () => smooth.step(inputs))
      last = smooth.present(stepper.alpha)
      return last
    },
    setPaused(value) {
      paused = value
      if (!value) stepper.reset()
    },
    dispose() {
      inputs.clear()
    }
  }
}
