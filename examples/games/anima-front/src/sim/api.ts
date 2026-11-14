/**
 * The sim's public surface. Everything outside src/sim imports from here (and src/sim/types.ts) only.
 *
 * - World: a deterministic match stepped at 60 Hz with every player's latest PlayerInput (bots are driven
 *   inside the world from their own PlayerInput). `view()` returns a JSON snapshot plus the events since the
 *   previous call.
 * - Maps: static MapDef per map id (collision boxes + anchors + decor), shared with the renderer.
 * - Loadouts: validation/repair and the editor's sustain estimate.
 */
import type { ItemCategory, ItemId } from '../data/items'
import type { Loadout } from '../data/loadout'
import type { SpeciesId } from '../data/species'
import type { MapDef, MapId, MatchConfig, PlayerConfig, PlayerInput, View } from './types'

export interface World {
  readonly config: MatchConfig
  readonly map: MapDef
  readonly tick: number
  readonly time: number
  /** True once the result phase (victory/defeat/draw) has lasted long enough to show the results screen. */
  readonly over: boolean
  /** Advances one fixed step (1/60 s). Missing inputs keep the player's previous input. */
  step(inputs: ReadonlyMap<string, PlayerInput>): void
  /** JSON snapshot; `events` holds everything emitted since the previous call. */
  view(): View
  /** Hands a player to a bot (skill 0..1) or back to a human (undefined). */
  setBot(playerId: string, skill: number | undefined): void
  addPlayer(cfg: PlayerConfig): void
  /**
   * A player dropping into a running match takes this seat (DESIGN §18): a fresh character from `cfg` (animal,
   * loadout, name; human-controlled) replaces the seat's one, keeping its id, team and scoreboard numbers. A living
   * one warps out and respawns (PvE next to the squad, PvP at its base with the usual protection); a downed or
   * away one keeps waiting.
   */
  replace(playerId: string, cfg: PlayerConfig): void
  removePlayer(id: string): void
}

export interface SustainReport {
  maxAnima: number
  /** Anima/s drained by online passives. */
  upkeep: number
  /** Anima/s of natural regeneration once it starts. */
  regen: number
  /** Estimated anima/s lost in a typical fight (DESIGN §7). */
  burn: number
  /** Seconds until empty in that fight; Infinity when the build sustains itself. */
  sustain: number
  /** Share of the fight burn per source (anima/s). */
  byCategory: Record<ItemCategory | 'damage', number>
  cheapest?: { item: ItemId; cost: number }
  priciest?: { item: ItemId; cost: number }
  /** Japanese notes such as 「武器がありません」 or 「消費が非常に激しい構成です」. */
  warnings: string[]
}

export { createWorld } from './world'
export { getMap, MAP_IDS } from './maps'
export { sanitizeLoadout, loadoutErrors, handLists, sustainEstimate } from './loadout'
export { createPredictor } from './predictor'
