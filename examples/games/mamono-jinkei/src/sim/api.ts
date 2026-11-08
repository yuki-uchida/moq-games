/**
 * The simulation's public surface: what the client (main.ts, net/, render/, ui/) may call. Everything else in
 * sim/ is internal. Pure TypeScript — no DOM, no timers, no randomness outside the seeded RNG — so tests can run
 * whole stages in Node.
 *
 * Lifecycle (host or solo):
 *   const world = createWorld({ seed, progress })      // phase 'lobby'
 *   world.setPlayers([{ id, name }])                     // humans present (host first); others become companions
 *   world.setInput(id, input)                            // every frame (local) / on receipt (guests)
 *   world.command(id, { type: 'stage', stage })         // host only, in the lobby
 *   world.command(id, { type: 'start' })                 // lobby → intro → play
 *   world.step(dt)                                       // fixed 1/60 s steps
 *   const view = world.view()                            // render it (solo) or broadcast it (host)
 * After a clear the host commands 'next' (next stage, or the ending after stage 4) or 'lobby'.
 *
 * Guests never run a World: they render snapshots and predict their own hero with `HeroPredictor`.
 */
import type { StageId } from '../vocab'
import { STAGE_DATA } from '../stages'
import { createPredictorImpl } from './predictor'
import type { HeroReport, InputState, NetInput, StageInfo, View } from './types'
import { WorldImpl, parsedOf } from './world'

export interface Progress {
  /** Stages cleared on this browser (the host's progress unlocks stages for everyone). */
  cleared: StageId[]
}

export interface WorldOptions {
  seed: number
  progress: Progress
  /** Start directly in this stage (solo quick start, tests); otherwise the world starts in the lobby. */
  stage?: StageId
  /** Skip the intro card (tests). */
  skipIntro?: boolean
}

export type Command =
  | { type: 'stage'; stage: StageId }
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'lobby' }
  /** Debug/test only: jump to a checkpoint or region of the current stage. */
  | { type: 'warp'; to: string }

export interface World {
  /** Humans present, host first. Slots are assigned in order of arrival; unowned slots become companions. */
  setPlayers(players: readonly { id: string; name: string }[]): void
  /** Latest input of a human. Guests include their predicted hero (`NetInput.hero`). */
  setInput(playerId: string, input: NetInput | InputState): void
  /** Host commands from the lobby/results UI; ignored when not allowed in the current phase. */
  command(playerId: string, command: Command): void
  /** Advances the world by dt seconds (callers use fixed 1/60 steps). */
  step(dt: number): void
  /** The current snapshot (a fresh object every call; safe to send as JSON). */
  view(): View
  /** Progress after clears (the caller saves it). */
  progress(): Progress
}

export function createWorld(options: WorldOptions): World {
  return new WorldImpl(options)
}

/** The static stage info (terrain, decoration, rooms) every client builds locally. */
export function stageInfo(stage: StageId): StageInfo {
  const data = STAGE_DATA[stage]
  if (!data) throw new Error(`stage ${stage} has no data yet`)
  return parsedOf(data).info
}

/**
 * Guest-side prediction of the guest's controlled hero, using the same movement and collision code as the host.
 * Feed it every frame; send the returned report to the host with the input.
 */
export interface HeroPredictor {
  /** Moves the predicted hero; `view` is the latest snapshot (solids, forces, speed and state). */
  update(view: View, input: InputState, dt: number): HeroReport | undefined
  /** The predicted hero to draw instead of the snapshot's copy (undefined when not controlling one). */
  current(): { slot: number; x: number; y: number; z: number; facing: number; vx: number; vy: number } | undefined
}

export function createPredictor(info: StageInfo, playerId: string): HeroPredictor {
  return createPredictorImpl(info, playerId)
}
