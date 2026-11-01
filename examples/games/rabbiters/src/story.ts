// Story-mode contracts shared by the engine and the chapter folders under src/stages/.
import type * as THREE from 'three'
import type { Cover, Game, GameState, Player, Predator } from './game'
import type { Overhang, Point } from './map'

/** One subtitle. `who`: an NPC id, a predator id, 'rabbit' (the local player) or 'narrator' (subtitle only). */
export type Line = { who: string; text: string }

export interface Objective {
  title: string
  /** 0..1 for the HUD bar. */
  progress: number
  label: string
  hint?: string
}

/** A minimap and 3D target marker: 'goal' rings the place to go, 'npc' someone to talk to, 'item' a thing to fetch. */
export type Marker = Point & { kind: 'goal' | 'npc' | 'item' }

/**
 * Host-side chapter logic. Keep chapter progress in GameState (`step`, `flags`, `open`, `items`) rather than in
 * script variables: checkpoints, retries and guests only see the state.
 */
export interface StageScript {
  /** Host, when the stage begins (new game or `nextStage`). */
  start(game: Game): void
  /** Host, every 1/60 s tick: objectives, schedules, dialogue triggers. */
  tick(game: Game, dt: number): void
  /** Host, while a rabbit holds E (`pressed` on the first tick). Return true when handled. */
  interact?(game: Game, player: Player, held: boolean, pressed: boolean): boolean
  /** Host, when a grabbing predator (human, child) reaches a rabbit. Default: `game.sendBack(player, predator)`. */
  caught?(game: Game, player: Player, predator: Predator): void
  /** Where a caught rabbit is put back (the current checkpoint). Default: the map spawn. */
  respawn?(state: GameState): Point
  /** Pure; runs on every client for the HUD objective card. */
  objective(state: GameState, player: Player): Objective
  /** Pure; minimap and 3D markers. */
  markers?(state: GameState): Marker[]
}

/** Scene lighting for a stage. Colours are CSS strings. */
export interface StageLook {
  sky: string
  /** Sky/fog colour at full night. */
  nightSky?: string
  fog: [near: number, far: number]
  hemi: [sky: string, ground: string, intensity: number]
  sun: [color: string, intensity: number]
  /** 0 day … 1 night, from the (guest-visible) state. */
  night?(state: { time: number; step?: number }): number
  /** Dark stage: the local rabbit carries a soft glow. */
  dark?: boolean
  /** Indoor: no sun shadows across the whole map, a warmer fill. */
  indoor?: boolean
}

export interface SceneryView {
  underground: boolean
  underLog: boolean
  /** Overhang the local rabbit is under, if any (fade the furniture above it). */
  under?: Overhang
}
/** The parts of the (possibly guest-side) state scenery may animate from. */
export type SceneryState = { time: number; step?: number; flags?: number; open?: number }
export interface Scenery {
  update(state: SceneryState, view: SceneryView): void
  dispose(): void
}

export type Bark = Partial<Record<'suspicious' | 'search' | 'chase', string>>

export interface StageDef {
  id: 'house' | 'town' | 'waterway' | 'forest'
  /** Chapter title, e.g. 知らない町. The chapter number is the stage index + 1. */
  title: string
  script: StageScript
  conversations: Record<string, Line[]>
  /** Speaker names for subtitles, by NPC/predator id. */
  names: Record<string, string>
  /** What this chapter's hiding places are called in the HUD (a shelter is a cage here, a shrine floor there). */
  coverNames?: Partial<Record<Cover, string>>
  look: StageLook
  /** Static scenery for this stage, added to `scene`; built when the stage becomes active. */
  scenery(scene: THREE.Scene): Scenery
  /** Enemy barks by predator id or kind, over the defaults in scene.ts. */
  barks?: Record<string, Bark>
  /** Model for a carried/placed `GameState.items` entry of this kind; default is a small parcel. */
  itemModel?(kind: string): THREE.Object3D
}

/** Seconds a line stays on screen. */
export const lineSeconds = (line: Line) => 1.6 + line.text.length * 0.12
export const talkSeconds = (conversations: Record<string, Line[]>, id: string) =>
  (Object.hasOwn(conversations, id) ? conversations[id] : []).reduce((sum, line) => sum + lineSeconds(line), 0)

/** The line being spoken `time` seconds into the game, derived from `talk` alone so guests need no extra sync. */
export function talkLine(
  conversations: Record<string, Line[]>,
  talk: { id: string; at: number } | null | undefined,
  time: number
): Line | undefined {
  if (!talk) return undefined
  let elapsed = time - talk.at
  if (elapsed < 0) return undefined
  // The id comes from the host's snapshot: only own keys, never Object.prototype members.
  for (const line of Object.hasOwn(conversations, talk.id) ? conversations[talk.id] : []) {
    elapsed -= lineSeconds(line)
    if (elapsed < 0) return line
  }
  return undefined
}
