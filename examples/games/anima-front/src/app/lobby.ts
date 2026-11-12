/**
 * Lobbies behind one interface so the screens never care whether the room is local or online: the solo lobby
 * here, and the online host / guest rooms over the MoQ relay (src/app/online.ts) with a few extra controls.
 */
import type { Loadout } from '../data/loadout'
import type { SpeciesId } from '../data/species'
import type { MatchConfig, TeamId } from '../sim/types'
import { buildSeats, matchConfig, type MatchSelection, type Seat } from './match'
import { createOnlineLobbyProvider } from './online'
import { createLocalSession, type Session } from './session'

export interface LobbyState {
  selection: MatchSelection
  seats: Seat[]
  /** Room code to share (online only). */
  code?: string
  host: boolean
  /** Japanese status line (「メンバーを待っています」…). */
  status: string
  /** Online rooms only. */
  online?: OnlineInfo
}

export interface OnlineMember {
  /** Network id. */
  id: string
  /** Match seat id, or null while spectating. */
  seat: string | null
  name: string
  species: SpeciesId
  team: TeamId
  ready: boolean
  host: boolean
  /** In the current match's game screen. */
  inMatch: boolean
  /** This browser. */
  me: boolean
}

export interface OnlineInfo {
  role: 'host' | 'guest'
  /** lobby → briefing (the host started) → match (the world runs). */
  phase: 'lobby' | 'briefing' | 'match'
  matchId: number
  connection: 'connecting' | 'online' | 'waiting' | 'closed'
  /** Why the room closed (Japanese). */
  error?: string
  members: OnlineMember[]
  /** No seat left for this browser: it watches. */
  spectating: boolean
  /** This browser's ready flag (guests). */
  ready: boolean
  /** Host: names of seated guests who are not ready. */
  notReady: string[]
}

/** Extra controls of an online lobby. */
export interface OnlineControls {
  /** Host: removes a member from the room. */
  kick(memberId: string): void
  /** Host (PvP): moves a member to a team. */
  moveTeam(memberId: string, team: TeamId): void
  /** Host (PvE): changes the mission / difficulty. */
  setSelection(selection: MatchSelection): void
  /** Guest: the match the host started and this browser has not entered yet (once per match). */
  takeMatch(): { phase: 'briefing' | 'match'; start: MatchStart } | null
  /** Host: back on the lobby screen (cancels a briefing that never became a match). */
  backInLobby(): void
}

export interface LocalChoice {
  name: string
  species: SpeciesId
  loadout: Loadout
  loadoutName: string
  team?: TeamId
}

export interface MatchStart {
  config: MatchConfig
  me: string
  /** Opens the session (the game screen calls it behind its loading card; it may throw). */
  connect(): Session
}

export interface Lobby {
  readonly kind: 'solo' | 'host' | 'guest'
  state(): LobbyState
  /** Called with the new state on every change; returns an unsubscribe function. */
  subscribe(listener: (state: LobbyState) => void): () => void
  /** The local player's animal/loadout/team changed. */
  setLocal(choice: LocalChoice): void
  setReady(ready: boolean): void
  /** Host / solo only: starts the match. Throws (Japanese message) when it cannot. */
  start(): MatchStart
  leave(): void
  /** Online rooms only. */
  readonly online?: OnlineControls
}

export type LobbyAvailability = { ok: true } | { ok: false; reason: string }

/** Supplies lobbies; the online provider replaces the `host` / `join` parts later. */
export interface LobbyProvider {
  solo(selection: MatchSelection, me: LocalChoice): Lobby
  canHost(selection: MatchSelection): LobbyAvailability
  /** Opens a room; `code` is the room code to use (a random friendly one when omitted). */
  host(selection: MatchSelection, me: LocalChoice, code?: string): Promise<Lobby>
  canJoin(): LobbyAvailability
  join(code: string, me: LocalChoice): Promise<Lobby>
}

export const LOCAL_PLAYER_ID = 'p1'

export function createSoloLobby(
  selection: MatchSelection,
  me: LocalChoice,
  options: { seed?: () => number; sessionFactory?: (config: MatchConfig, me: string) => Session } = {}
): Lobby {
  const listeners = new Set<(s: LobbyState) => void>()
  let local = me
  const make = (): LobbyState => ({
    selection,
    seats: buildSeats(selection, { id: LOCAL_PLAYER_ID, ...local }),
    host: true,
    status: selection.mode === 'training' ? 'ひとりで訓練します' : '空いた席はボットが埋めます'
  })
  let current = make()
  const emit = () => {
    current = make()
    for (const l of listeners) l(current)
  }
  const seed = options.seed ?? (() => (Math.random() * 0xffffffff) >>> 0)
  const factory = options.sessionFactory ?? ((config, id) => createLocalSession(config, id))
  return {
    kind: 'solo',
    state: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setLocal(choice) {
      local = choice
      emit()
    },
    setReady() {
      // solo: always ready
    },
    start() {
      const config = matchConfig(selection, current.seats, seed())
      return { config, me: LOCAL_PLAYER_ID, connect: () => factory(config, LOCAL_PLAYER_ID) }
    },
    leave() {
      listeners.clear()
    }
  }
}

/** Solo plus online rooms (ルームを作る / ルームに参加) over the MoQ relay. */
export function createDefaultLobbyProvider(): LobbyProvider {
  return createOnlineLobbyProvider()
}
