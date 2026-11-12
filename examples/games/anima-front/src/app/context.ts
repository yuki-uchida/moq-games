/**
 * Shared types of the screen flow. Screens import only these types (never each other), and ask the app to
 * open the next route by name, so the flow has no import cycles.
 */
import type { GameAudio, SfxName, ThemeName } from '../audio/api'
import type { ModelKit } from '../models/api'
import type { View } from '../sim/types'
import type { Lobby, LobbyProvider, MatchStart } from './lobby'
import type { MatchSelection } from './match'
import type { Armory, Progress } from './saves'
import type { Session } from './session'
import type { SettingKey, Settings } from './settings'
import type { KeyValueStore } from './storage'

export type BackdropMode = 'title' | 'menu' | 'off'

export interface Screen {
  readonly id: string
  readonly el: HTMLElement
  /** Music while this screen is shown; undefined keeps the current theme. */
  readonly music?: ThemeName | null
  /** How the 3D backdrop looks behind this screen (default 'menu'). */
  readonly backdrop?: BackdropMode
  /** Mounted and visible (after the enter transition started). */
  enter?(): void
  /** About to be removed: stop loops, release WebGL, unsubscribe. */
  leave?(): void
  /** Esc / B. */
  back?(): void
  /** LB / RB or Q / E on tabbed screens. */
  tab?(dir: 1 | -1): void
  /** Called every animation frame while shown. */
  frame?(dt: number, now: number): void
  /** True while the screen handles its own keys (the game, text fields): menu navigation stays off. */
  readonly ownsInput?: boolean
}

export interface RouteRef {
  name: RouteName
  args?: unknown
}

export interface ResultsArgs {
  selection: MatchSelection
  view: View
  me: string
  /** Set when the match was played from a lobby (for ロビーへ / もう一度). */
  lobby?: Lobby
  newBest?: boolean
  unlocked?: string | null
}

export interface RouteArgs {
  title: undefined
  sortie: undefined
  missions: undefined
  room: { selection: MatchSelection }
  training: undefined
  lobby: { selection: MatchSelection; lobby: Lobby }
  briefing: { selection: MatchSelection; lobby: Lobby; start: MatchStart }
  game: { selection: MatchSelection; start: MatchStart; lobby?: Lobby; session?: Session }
  results: ResultsArgs
  loadout: { back?: RouteRef } | undefined
  codex: undefined
  settings: { back?: RouteRef } | undefined
  credits: undefined
}
export type RouteName = keyof RouteArgs

/** The 3D scene behind the menus. Swappable (the renderer's live attract demo can replace it). */
export interface Backdrop {
  readonly canvas: HTMLCanvasElement
  setMode(mode: BackdropMode): void
  /** The animals standing in the scene (the player's squad). */
  setSquad(species: readonly string[]): void
  dispose(): void
}

export interface AppContext {
  readonly root: HTMLElement
  readonly store: KeyValueStore | null
  readonly audio: GameAudio
  readonly kit: ModelKit
  readonly lobbies: LobbyProvider
  readonly settings: Settings
  updateSetting(key: SettingKey, value: unknown): void
  readonly progress: Progress
  setProgress(p: Progress): void
  readonly armory: Armory
  setArmory(a: Armory): void
  readonly backdrop: Backdrop | null
  open<K extends RouteName>(
    name: K,
    ...args: RouteArgs[K] extends undefined ? [args?: RouteArgs[K]] : [args: RouteArgs[K]]
  ): void
  sfx(name: SfxName): void
  toast(message: string, kind?: 'info' | 'error' | 'ok'): void
  /** Shows a modal with buttons; resolves with the chosen value (or null on back). */
  confirm<T extends string>(o: {
    title: string
    text: string
    buttons: { value: T; label: string; primary?: boolean }[]
  }): Promise<T | null>
  /** True on touch-first devices (coarse pointer). */
  readonly touch: boolean
}
