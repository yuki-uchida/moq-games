/**
 * Online lobbies (DESIGN §18): ルームを作る / ルームに参加 over the MoQ relay through CooperativeNetwork. The host's
 * and the guest's rooms (src/net) are wrapped in the same Lobby interface as the solo lobby, plus the online
 * controls the lobby screen uses (kick, team moves, mission choice, following the host into the match).
 */
import { getPrimaryRelayUrl } from '../../../../../utils/relayPresets'
import { CooperativeNetwork } from '../../../rabbiters/src/network'
import { GuestRoom } from '../net/guest-room'
import { HostRoom } from '../net/host-room'
import { randomPeerId, type RoomPhase, type TransportFactory } from '../net/protocol'
import { cleanRoom, randomRoom, validRoom } from '../net/validate'
import type { MatchConfig, TeamId } from '../sim/types'
import type { World } from '../sim/api'
import type { Lobby, LobbyAvailability, LobbyProvider, LobbyState, LocalChoice, MatchStart, OnlineInfo } from './lobby'
import { createSoloLobby } from './lobby'
import type { MatchSelection, Seat } from './match'

export { cleanRoom, randomRoom, validRoom }

export interface OnlineOptions {
  transport?: TransportFactory
  relayUrl?: () => string
  /** Tests: clock (seconds), world factory, ids, timeouts. */
  now?: () => number
  makeWorld?: (config: MatchConfig) => World
  peerId?: () => string
  timeoutMs?: number
  searchSeconds?: number
  /** Disables the browser feature check (tests). */
  skipFeatureCheck?: boolean
}

const defaultTransport: TransportFactory = (o) => new CooperativeNetwork(o)

const unsupported = (): string | null => {
  if (typeof window === 'undefined') return null
  if (typeof (globalThis as { WebTransport?: unknown }).WebTransport === 'undefined') return '非対応のブラウザ'
  if (typeof CompressionStream === 'undefined') return '非対応のブラウザ'
  return null
}

/** Lobby wrapper around the host's room. */
function hostLobby(room: HostRoom): Lobby {
  const listeners = new Set<(s: LobbyState) => void>()
  let current: LobbyState
  const make = (): LobbyState => {
    const seats = room.seats().map((s) => ({ ...s, local: s.id === 'h0' }))
    const waiting = room.notReady()
    const humans = [...room.members.values()].filter((m) => m.host || m.present).length
    let status: string
    if (room.status.kind === 'closed') status = room.status.text
    else if (room.status.kind === 'connecting') status = room.status.text
    else if (room.phase === 'briefing') status = 'ブリーフィング中です'
    else if (room.phase === 'match') status = '任務中です'
    else if (waiting.length) status = `準備を待っています：${waiting.join('、')}`
    else if (humans <= 1) status = 'メンバーを待っています。空いた席はボットが埋めます'
    else status = `${humans}人そろいました。空いた席はボットが埋めます`
    return {
      selection: room.selection,
      seats,
      code: room.code,
      host: true,
      status,
      online: infoOf('host', room.myId, room.roomMsg(), room.status, waiting, true)
    }
  }
  current = make()
  const emit = () => {
    current = make()
    for (const l of listeners) l(current)
  }
  room.subscribe(emit)
  return {
    kind: 'host',
    state: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setLocal: (choice) => room.setLocal(choice),
    setReady: () => undefined,
    start: () => room.start(),
    leave() {
      room.close()
      listeners.clear()
    },
    online: {
      kick: (id) => room.kick(id),
      moveTeam: (id, team) => room.moveTeam(id, team),
      setSelection: (sel) => room.setSelection(sel),
      takeMatch: () => null,
      backInLobby: () => room.cancelStart()
    }
  }
}

/** Lobby wrapper around a guest's room. */
function guestLobby(room: GuestRoom): Lobby {
  const listeners = new Set<(s: LobbyState) => void>()
  let entered = 0
  let current: LobbyState
  const make = (): LobbyState => {
    const msg = room.room
    const mySeat = room.mySeat
    const seats: Seat[] = (msg?.seats ?? []).map((s) => ({ ...s, local: s.id === mySeat }))
    let status: string
    if (room.status.kind === 'closed') status = room.status.text
    else if (room.silence > 0) status = 'ホストの応答を待っています…'
    else if (!room.admittedByRoom) status = 'ホストに参加を伝えています…'
    else if (msg?.phase === 'briefing') status = 'ホストがブリーフィング中です'
    else if (msg?.phase === 'match')
      status = mySeat
        ? `${msg.selection.mode === 'pvp' ? '演習' : '任務'}中です。空いた席に入って合流します`
        : `${msg.selection.mode === 'pvp' ? '演習' : '任務'}中です。席がすべて埋まっているため観戦します`
    else if (!mySeat) status = '席が満員のため、観戦で参加します'
    else if (room.ready) status = '準備完了。ホストの出撃を待っています'
    else status = '準備ができたら「準備完了」を押してください'
    return {
      selection: msg?.selection ?? { mode: 'pve', mission: 'sakura', difficulty: 'normal' },
      seats,
      code: room.code,
      host: false,
      status,
      online: msg
        ? infoOf('guest', room.myId, msg, room.status, [], room.ready, room.silence > 0)
        : {
            role: 'guest',
            phase: 'lobby',
            matchId: 0,
            connection: room.status.kind === 'closed' ? 'closed' : 'connecting',
            error: room.status.kind === 'closed' ? room.status.text : undefined,
            members: [],
            spectating: false,
            ready: room.ready,
            notReady: []
          }
    }
  }
  current = make()
  const emit = () => {
    current = make()
    for (const l of listeners) l(current)
  }
  room.subscribe(emit)
  return {
    kind: 'guest',
    state: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setLocal: (choice) => room.setLocal(choice),
    setReady: (ready) => room.setReady(ready),
    start(): MatchStart {
      const start = room.matchStart()
      if (!start) throw new Error('ホストの出撃を待っています')
      return start
    },
    leave() {
      room.close()
      listeners.clear()
    },
    online: {
      kick: () => undefined,
      moveTeam: () => undefined,
      setSelection: () => undefined,
      takeMatch() {
        const msg = room.room
        if (!msg || msg.phase === 'lobby' || msg.matchId === entered || room.status.kind === 'closed') return null
        // The host has not listed this member yet: its seat (or spectating) is not decided.
        if (!room.admittedByRoom) return null
        const start = room.matchStart()
        if (!start) return null
        entered = msg.matchId
        return { phase: msg.phase, start }
      },
      backInLobby: () => undefined,
      followTeam: (team) => room.setFollowTeam(team),
      watching: () => ({ want: room.followTeam, have: room.keyTeam })
    }
  }
}

function infoOf(
  role: 'host' | 'guest',
  myId: string,
  msg: ReturnType<HostRoom['roomMsg']>,
  status: { kind: string; text: string },
  notReady: string[],
  ready: boolean,
  waiting = false
): OnlineInfo {
  const me = msg.members.find((m) => m.id === myId)
  return {
    role,
    phase: msg.phase as RoomPhase,
    matchId: msg.matchId,
    connection:
      status.kind === 'closed'
        ? 'closed'
        : status.kind === 'connecting'
          ? 'connecting'
          : waiting
            ? 'waiting'
            : 'online',
    error: status.kind === 'closed' ? status.text : undefined,
    members: msg.members.map((m) => ({ ...m, me: m.id === myId })),
    spectating: !!me && !me.seat,
    ready,
    notReady
  }
}

/** Solo plus online host/join over the relay. Only one room is open at a time. */
export function createOnlineLobbyProvider(options: OnlineOptions = {}): LobbyProvider {
  let active: Lobby | null = null
  const replace = (next: Lobby) => {
    if (active && active !== next) active.leave()
    active = next
    return next
  }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => active?.leave())
  const transport = options.transport ?? defaultTransport
  const relayUrl = options.relayUrl ?? (() => getPrimaryRelayUrl())
  const peerId = options.peerId ?? (() => randomPeerId())
  const check = (): LobbyAvailability => {
    const why = options.skipFeatureCheck ? null : unsupported()
    return why ? { ok: false, reason: why } : { ok: true }
  }
  return {
    solo: (selection, me) => {
      if (active) active.leave()
      active = null
      return createSoloLobby(selection, me)
    },
    canHost: (selection: MatchSelection) =>
      selection.mode === 'training' ? { ok: false, reason: 'ひとり用' } : check(),
    async host(selection, me, code) {
      const room = cleanRoom(code ?? '') || randomRoom()
      if (!validRoom(room)) throw new Error('ルームコードは英小文字・数字・ハイフンの3〜32文字にしてください')
      if (selection.mode === 'training') throw new Error('訓練場はひとりで遊びます')
      if (active) active.leave()
      active = null
      const host = new HostRoom({
        code: room,
        relayUrl: relayUrl(),
        selection,
        me,
        transport,
        peerId: peerId(),
        now: options.now,
        makeWorld: options.makeWorld,
        timeoutMs: options.timeoutMs
      })
      await host.open()
      return replace(hostLobby(host))
    },
    canJoin: check,
    async join(code, me) {
      const room = cleanRoom(code)
      if (!validRoom(room)) throw new Error('ルームコードは英小文字・数字・ハイフンの3〜32文字です')
      if (active) active.leave()
      active = null
      const guest = new GuestRoom({
        code: room,
        relayUrl: relayUrl(),
        me,
        transport,
        peerId: peerId(),
        now: options.now,
        timeoutMs: options.timeoutMs,
        searchSeconds: options.searchSeconds
      })
      await guest.open()
      return replace(guestLobby(guest))
    }
  }
}

export type { LocalChoice, TeamId }
