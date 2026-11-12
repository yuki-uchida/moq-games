/**
 * Lobbies behind one interface so the screens never care whether the room is local or online. The solo lobby
 * is complete; the online one (host / guest over the MoQ relay) is provided later by the net workstream through
 * `LobbyProvider`. Until then `unavailableOnline` reports 「準備中」.
 */
import type { Loadout } from '../data/loadout'
import type { SpeciesId } from '../data/species'
import type { MatchConfig, TeamId } from '../sim/types'
import { buildSeats, matchConfig, type MatchSelection, type Seat } from './match'
import { createLocalSession, type Session } from './session'

export interface LobbyState {
  selection: MatchSelection
  seats: Seat[]
  /** Room code to share (online only). */
  code?: string
  host: boolean
  /** Japanese status line (「メンバーを待っています」…). */
  status: string
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
}

export type LobbyAvailability = { ok: true } | { ok: false; reason: string }

/** Supplies lobbies; the online provider replaces the `host` / `join` parts later. */
export interface LobbyProvider {
  solo(selection: MatchSelection, me: LocalChoice): Lobby
  canHost(selection: MatchSelection): LobbyAvailability
  host(selection: MatchSelection, me: LocalChoice): Promise<Lobby>
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

const NOT_READY: LobbyAvailability = { ok: false, reason: '準備中' }

/** Provider with only the solo lobby; online rooms answer 「準備中」. */
export function createDefaultLobbyProvider(): LobbyProvider {
  return {
    solo: (selection, me) => createSoloLobby(selection, me),
    canHost: () => NOT_READY,
    host: () => Promise.reject(new Error('オンライン対戦は準備中です')),
    canJoin: () => NOT_READY,
    join: () => Promise.reject(new Error('オンライン対戦は準備中です'))
  }
}
