/**
 * Online room protocol over CooperativeNetwork (DESIGN §18). The network has two channels: the host broadcasts
 * "snapshots" to everyone and every guest sends "inputs" to the host. Both carry one of these JSON messages:
 *
 * host → all:  RoomMsg (lobby state: phase, selection, members, seats, match config) on every change and at 1 Hz,
 *              SnapMsg (one match snapshot: the world view, events since the previous snapshot, input acks) at 20 Hz.
 * guest → host: ProfileMsg (name, animal, loadout, team, ready, which match the game screen is in) on change and
 *              at 1 Hz, InputMsg (PlayerInput with the guest's prediction tick) at 30 Hz during a match.
 *
 * PvP information boundary: a PvP snapshot's `view` is only the public part (src/net/split.ts); what each team may
 * know travels sealed with that team's key in `s` (src/net/seal.ts). Team keys reach guests wrapped for each one
 * (ECDH: the guest's `ek` in its profile, the host's `hk` in the lobby state) in RoomMsg.keys.
 *
 * Guest → host: a guest's track can be read by anyone on the relay who knows its id, so what only the host may
 * read is sealed with the guest-to-host key (seal.ts): PvP inputs (InputMsg.x) and, in every mode, the
 * reconnection secret (ProfileMsg.kx).
 */
import type { MatchSelection, Seat } from '../app/match'
import type { MatchConfig, PlayerInput, TeamId, View } from '../sim/types'
import type { RosterRow } from './split'
import type { Profile } from './validate'

export const APP_ID = 'anima-front-v1'
export const PROTOCOL = 1
/** Snapshots per second (host → guests). */
export const SNAPSHOT_RATE = 20
/** Inputs per second (guest → host). */
export const INPUT_RATE = 30
/** The host lets go of a guest's controls after this many seconds without input. */
export const INPUT_EXPIRY = 0.5
/** Room heartbeat (host) and profile heartbeat (guest), seconds. */
export const HEARTBEAT = 1
/** A guest that hears nothing from the host this long shows 「ホストを待っています」. */
export const HOST_STALL = 4
/** …and gives up after this long. */
export const HOST_GONE = 45
/** A joining guest that has not heard the host this long is told the room was not found. */
export const ROOM_SEARCH = 13
/** Seconds after a match starts before a human seat whose player has not arrived is handed to a bot. */
export const ARRIVAL_GRACE = 12
/** Online matches count down a little longer so guests coming from the briefing make the start. */
export const ONLINE_COUNTDOWN = 5

export type RoomPhase = 'lobby' | 'briefing' | 'match'

export interface WireMember {
  id: string
  /** Match player id, or null while spectating. */
  seat: string | null
  name: string
  species: Profile['species']
  team: TeamId
  ready: boolean
  host: boolean
  /** The member's game screen is in the current match. */
  inMatch: boolean
}

export interface RoomMsg {
  v: typeof PROTOCOL
  k: 'room'
  code: string
  phase: RoomPhase
  /** Increments with every start; 0 before the first. */
  matchId: number
  selection: MatchSelection
  members: WireMember[]
  seats: Omit<Seat, 'local'>[]
  /** The match being played (briefing / match phases). */
  config?: MatchConfig
  /** Members the host removed from the room. */
  kicked: string[]
  /** Host's ECDH public key (base64, PvP key wrapping). */
  hk?: string
  /** PvP briefing/match: key generation and, per member id, its team key wrapped for it (seal.ts). */
  keys?: { g: number; w: Record<string, string> }
}

export interface SnapMsg {
  v: typeof PROTOCOL
  k: 'snap'
  /** Match id. */
  m: number
  /** The world reached the results. */
  over: boolean
  /** Per human seat: [input session nonce, guest prediction tick that matches this view]. */
  ack: Record<string, [number, number]>
  /** PvE: the whole view. PvP: the public part only (no players, events about nobody, the kill feed). */
  view: View
  /** PvP: roster aligned with the config players (split.ts RosterRow). */
  r?: RosterRow[]
  /** PvP: team key generation of `s`. */
  g?: number
  /** PvP: per team, its part (players it may know, their events, its acks) sealed with the team key. */
  s?: Partial<Record<TeamId, string>>
}

/** Additional data that binds a sealed team part to its snapshot slot. */
export const partAad = (matchId: number, gen: number, team: TeamId, tick: number) =>
  `anima-front-v1:part:${matchId}:${gen}:${team}:${tick}`

/** Additional data that binds a wrapped team key to its generation and member. */
export const wrapAad = (gen: number, memberId: string) => `anima-front-v1:key:${gen}:${memberId}`

/** Additional data that binds a sealed reconnection secret to its member. */
export const rejoinAad = (memberId: string) => `anima-front-v1:rejoin:${memberId}`

/** Additional data that binds a sealed PvP input to its member and slot. */
export const inputAad = (memberId: string, matchId: number, nonce: number, tick: number) =>
  `anima-front-v1:input:${memberId}:${matchId}:${nonce}:${tick}`

export interface ProfileMsg {
  v: typeof PROTOCOL
  k: 'profile'
  p: Profile
  /**
   * The guest's reconnection secret sealed with the guest-to-host key (`rejoinAad`): a reconnection with a new
   * network id keeps its seat. Never sent in clear.
   */
  kx?: string
  /** The guest's ECDH public key (base64) for team keys. */
  ek?: string
  /** Spectators: the team whose view to follow (default 0). */
  f?: TeamId
}

export interface InputMsg {
  v: typeof PROTOCOL
  k: 'input'
  /** Match id. */
  m: number
  /** Input session nonce (a new game screen starts a new one; press counters restart there). */
  n: number
  /** Guest prediction tick at which this input takes effect. */
  g: number
  /** PvE: the input in clear. */
  i?: PlayerInput
  /** PvP: `JSON.stringify` of the input sealed with the guest-to-host key (`inputAad`). */
  x?: string
}

export type HostMsg = RoomMsg | SnapMsg
export type GuestMsg = ProfileMsg | InputMsg

/** The parts of CooperativeNetwork the rooms use (tests inject an in-memory one). */
export interface NetTransport {
  readonly playerId: string
  start(): Promise<void>
  sendInput(input: unknown): Promise<void>
  broadcastSnapshot(state: unknown): Promise<void>
  stop(): Promise<void>
}

export type NetStatus = 'connecting' | 'ready' | 'waiting-for-host' | 'error' | 'stopped'

export interface TransportOptions {
  relayUrl: string
  room: string
  role: 'host' | 'guest'
  playerId: string
  app: string
  onInput: (playerId: string, input: unknown) => void
  onSnapshot: (state: unknown) => void
  onPresence: (playerIds: readonly string[]) => void
  onStatus: (status: NetStatus, message: string) => void
}

export type TransportFactory = (options: TransportOptions) => NetTransport

/** A random network id ([a-z0-9], never the reserved `host`). */
export function randomPeerId(rand: () => number = Math.random): string {
  let s = 'a'
  for (let i = 0; i < 15; i++) s += Math.floor(rand() * 36).toString(36)
  return s
}

/** Network errors (English, from CooperativeNetwork or the relay) → one Japanese sentence. */
export function translateError(message: string): string {
  if (/kicked/i.test(message)) return 'ホストによってルームから外されました。'
  if (/full|did not admit/i.test(message)) return 'ルームが満員のため参加できませんでした。'
  if (/host left|host stopped|withdrawn|peer track ended: host|host closed/i.test(message))
    return 'ホストがルームを閉じました。'
  if (/not found/i.test(message)) return 'ルームが見つかりませんでした。ルームコードを確かめてください。'
  if (/timeout|timed out/i.test(message)) return 'リレーに接続できませんでした（タイムアウト）。'
  if (/cleanup failed|session is closed|network is not active/i.test(message)) return 'ルームとの接続が切れました。'
  if (/relay|connect|fetch|network|webtransport|https/i.test(message))
    return 'リレーに接続できませんでした。通信環境を確かめてください。'
  return `通信エラーが起きました。（${message.slice(0, 80)}）`
}
