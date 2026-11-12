/**
 * The host's room (DESIGN §18): membership from the network's presence and the guests' profiles, seats, the
 * lobby state broadcast, kicks and team moves, the match start, late joiners and leavers. The match itself (the
 * world stepped at 60 Hz, guest inputs, snapshots) is HostMatch in host-match.ts.
 */
import type { LocalChoice, MatchStart } from '../app/lobby'
import { botSkill, matchConfig, type MatchSelection, type Seat } from '../app/match'
import { cloneLoadout } from '../app/loadouts'
import { createWorld, type World } from '../sim/api'
import type { MatchConfig, PlayerInput, TeamId } from '../sim/types'
import { netLog } from './debug'
import { HostClock, type PulseClock } from './host-clock'
import { InputBuffer } from './input-buffer'
import { HostMatch } from './host-match'
import {
  APP_ID,
  ARRIVAL_GRACE,
  HEARTBEAT,
  ONLINE_COUNTDOWN,
  PROTOCOL,
  translateError,
  type InputMsg,
  type NetTransport,
  type RoomMsg,
  type RoomPhase,
  type SnapMsg,
  type TransportFactory,
  type WireMember
} from './protocol'
import { humanSeatId, planSeats, type SeatMember } from './seats'
import { cleanName, validatePlayerInput, validateProfile, type Profile } from './validate'

export interface RoomMember extends SeatMember {
  host: boolean
  present: boolean
  input?: InputBuffer
  /** The guest's reconnection secret. */
  key?: string
  /** Room time it left (kept a while in the lobby in case it reconnects). */
  goneAt?: number
}

/** A guest whose match inputs stopped this long ago (and whose profile left the match) is played by a bot. */
const ARRIVAL_INPUT = 2
/** Seconds between repeated presence lists (see repeatPresence). */
const PRESENCE_REPEAT = 2
/** Seconds a member that left the lobby is kept in case its connection comes back. */
const MEMBER_GRACE = 20

export interface RoomStatus {
  kind: 'connecting' | 'online' | 'closed'
  text: string
}

export interface HostRoomOptions {
  code: string
  relayUrl: string
  selection: MatchSelection
  me: LocalChoice
  transport: TransportFactory
  peerId: string
  /** Seconds (monotonic). */
  now?: () => number
  seed?: () => number
  makeWorld?: (config: MatchConfig) => World
  /** Background clock for a hidden tab (tests pass a manual one). */
  clock?: (tick: (dt: number) => void) => PulseClock
  /** Page visibility (browser default: document.visibilityState). */
  visibility?: { hidden(): boolean; listen(cb: () => void): () => void }
  timeoutMs?: number
}

export function profileOf(choice: LocalChoice, ready = true, inMatch = 0): Profile {
  return {
    name: cleanName(choice.name),
    species: choice.species,
    loadout: cloneLoadout(choice.loadout),
    loadoutName: cleanName(choice.loadoutName, '編成'),
    team: choice.team ?? 0,
    ready,
    inMatch
  }
}

const browserVisibility = () =>
  typeof document === 'undefined'
    ? undefined
    : {
        hidden: () => document.visibilityState === 'hidden',
        listen(cb: () => void) {
          document.addEventListener('visibilitychange', cb)
          return () => document.removeEventListener('visibilitychange', cb)
        }
      }

export class HostRoom {
  readonly code: string
  readonly myId: string
  phase: RoomPhase = 'lobby'
  matchId = 0
  selection: MatchSelection
  status: RoomStatus = { kind: 'connecting', text: 'リレーに接続しています…' }
  config?: MatchConfig
  /** Seats of the current match (bots flags follow leavers and late joiners). */
  matchSeats: Seat[] = []
  /** Member id → match seat (null spectating) for the current match. */
  matchSeatOf = new Map<string, string | null>()
  match: HostMatch | null = null
  readonly members = new Map<string, RoomMember>()
  private readonly presence = new Set<string>()
  private readonly kicked: string[] = []
  private readonly kickedKeys = new Set<string>()
  private readonly listeners = new Set<() => void>()
  private readonly transport: NetTransport
  private readonly now: () => number
  private nextOrder = 1
  private lastBeat = -Infinity
  private lastPresence = 0
  private beatTimer?: ReturnType<typeof setInterval>
  private readonly clock: PulseClock
  private unlisten?: () => void
  private sending = false
  private roomDirty = false
  private pendingSnap: SnapMsg | null = null
  private closedByUs = false
  oversizeWarned = false

  constructor(private readonly opts: HostRoomOptions) {
    this.code = opts.code
    this.myId = opts.peerId
    this.selection = opts.selection
    this.now = opts.now ?? (() => performance.now() / 1000)
    this.members.set(this.myId, {
      id: this.myId,
      order: 0,
      host: true,
      present: true,
      profile: profileOf(opts.me)
    })
    this.transport = opts.transport({
      relayUrl: opts.relayUrl,
      room: opts.code,
      role: 'host',
      playerId: opts.peerId,
      app: APP_ID,
      onInput: (id, raw) => this.receive(id, raw),
      onSnapshot: () => undefined,
      onPresence: (ids) => {
        netLog(`host presence ${ids.join(',')}`)
        this.setPresence(ids)
      },
      onStatus: (status, message) => {
        netLog(`host ${status} ${message}`)
        if (status === 'error') this.fail(message)
      }
    })
    this.clock = (opts.clock ?? ((tick) => new HostClock(tick)))((dt) => this.pulse(dt, true))
  }

  /** Connects to the relay; rejects with a Japanese message. */
  async open(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.transport.start(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), this.opts.timeoutMs ?? 15_000)
        })
      ])
    } catch (err) {
      const text = this.status.kind === 'closed' ? this.status.text : translateError(String(err))
      this.close()
      throw new Error(text)
    } finally {
      clearTimeout(timer)
    }
    if (this.status.kind === 'closed') throw new Error(this.status.text)
    this.status = { kind: 'online', text: 'メンバーを待っています' }
    this.beatTimer = setInterval(() => this.pulse(0, false), HEARTBEAT * 1000)
    const vis = this.opts.visibility ?? browserVisibility()
    if (vis) {
      const apply = () => (vis.hidden() ? this.clock.start() : this.clock.stop())
      this.unlisten = vis.listen(apply)
      apply()
    }
    this.changed()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  get time() {
    return this.now()
  }

  // ---- lobby controls (host UI)

  setLocal(choice: LocalChoice) {
    const me = this.members.get(this.myId)!
    me.profile = profileOf(choice, true, me.profile.inMatch)
    this.changed()
  }

  setSelection(sel: MatchSelection) {
    if (this.phase !== 'lobby' || sel.mode !== this.selection.mode) return
    this.selection = sel
    this.changed()
  }

  kick(id: string) {
    const m = this.members.get(id)
    if (!m || m.host) return
    this.kicked.push(id)
    if (this.kicked.length > 64) this.kicked.shift()
    if (m.key) this.kickedKeys.add(m.key)
    this.members.delete(id)
    this.dropFromMatch(id)
    this.changed()
  }

  moveTeam(id: string, team: TeamId) {
    const m = this.members.get(id)
    if (!m || this.selection.mode !== 'pvp' || this.phase !== 'lobby') return
    m.hostTeam = { team, pref: m.profile.team }
    this.changed()
  }

  /** Seats as the lobby shows them now. */
  seats(): Seat[] {
    return this.phase === 'lobby' ? planSeats(this.selection, this.seatMembers()).seats : this.matchSeats
  }

  /** Member id → seat id as the lobby shows it now. */
  seatMap(): Map<string, string | null> {
    return this.phase === 'lobby' ? planSeats(this.selection, this.seatMembers()).bySeat : this.matchSeatOf
  }

  private seatMembers(): SeatMember[] {
    return [...this.members.values()].filter((m) => m.host || m.present)
  }

  /** Guests that are seated but not ready (the host cannot start yet). */
  notReady(): string[] {
    const plan = planSeats(this.selection, this.seatMembers())
    return [...this.members.values()]
      .filter((m) => !m.host && m.present && plan.bySeat.get(m.id) && !m.profile.ready)
      .map((m) => m.profile.name)
  }

  /** Fixes the seats and the config and moves everyone to the briefing. Throws a Japanese message. */
  start(): MatchStart {
    if (this.status.kind === 'closed') throw new Error(this.status.text)
    if (this.match) throw new Error('任務が進行中です')
    const waiting = this.notReady()
    if (waiting.length) throw new Error(`準備ができていない仲間がいます（${waiting.join('、')}）`)
    const plan = planSeats(this.selection, this.seatMembers())
    const seed = (this.opts.seed ?? (() => (Math.random() * 0xffffffff) >>> 0))()
    const config = matchConfig(this.selection, plan.seats, seed)
    config.countdown = ONLINE_COUNTDOWN
    this.config = config
    this.matchSeats = plan.seats.map((s) => ({ ...s }))
    this.matchSeatOf = new Map(plan.bySeat)
    this.matchId++
    this.phase = 'briefing'
    for (const m of this.members.values()) m.input = undefined
    this.changed()
    const matchId = this.matchId
    return { config, me: humanSeatId(0), connect: () => this.beginMatch(matchId) }
  }

  /** The host went back to the lobby from a briefing it never left for the match. */
  cancelStart() {
    if (this.phase !== 'briefing' || this.match) return
    this.phase = 'lobby'
    this.config = undefined
    this.changed()
  }

  private beginMatch(matchId: number): HostMatch {
    if (this.status.kind === 'closed') throw new Error(this.status.text)
    if (matchId !== this.matchId || this.phase !== 'briefing' || !this.config)
      throw new Error('この出撃は取り消されました')
    const world = (this.opts.makeWorld ?? createWorld)(this.config)
    this.phase = 'match'
    this.match = new HostMatch(this, world, this.config, matchId, this.now())
    const me = this.members.get(this.myId)!
    me.profile = { ...me.profile, inMatch: matchId }
    this.changed()
    return this.match
  }

  /** Called by HostMatch.dispose(): back to the lobby. */
  endMatch(match: HostMatch) {
    if (this.match !== match) return
    this.match = null
    this.phase = 'lobby'
    this.config = undefined
    const me = this.members.get(this.myId)!
    me.profile = { ...me.profile, inMatch: 0 }
    for (const [id, m] of this.members) if (!m.host && !m.present) this.members.delete(id)
    this.changed()
  }

  /** Who controls a seat right now: the host, a guest (with its latest input), or a bot. */
  controlOf(
    seatId: string,
    matchTime: number
  ): { kind: 'host' } | { kind: 'guest'; member: RoomMember } | { kind: 'bot' } {
    for (const [id, seat] of this.matchSeatOf) {
      if (seat !== seatId) continue
      const m = this.members.get(id)
      if (!m) return { kind: 'bot' }
      if (m.host) return { kind: 'host' }
      if (!m.present) return { kind: 'bot' }
      // In the match: its profile says so, or its inputs for this match keep coming.
      if (m.profile.inMatch === this.matchId || (m.input && this.now() - m.input.at < ARRIVAL_INPUT))
        return { kind: 'guest', member: m }
      // Not arrived yet: hold the seat for a while, then let a bot play it.
      return matchTime < this.matchArrivalGrace ? { kind: 'guest', member: m } : { kind: 'bot' }
    }
    return { kind: 'bot' }
  }

  /** Seconds after the match start a human seat waits for its player. */
  matchArrivalGrace = ARRIVAL_GRACE

  /** Bot skill for seats handed to bots. */
  get botSkill() {
    return botSkill(this.selection)
  }

  // ---- network

  private setPresence(ids: readonly string[]) {
    const next = new Set(ids.filter((id) => id !== this.myId))
    for (const id of this.presence) {
      if (next.has(id)) continue
      this.presence.delete(id)
      const m = this.members.get(id)
      if (!m) continue
      m.present = false
      m.goneAt = this.now()
    }
    for (const id of next) {
      this.presence.add(id)
      const m = this.members.get(id)
      if (m) {
        m.present = true
        m.goneAt = undefined
      }
    }
    this.changed()
  }

  private receive(id: string, raw: unknown) {
    if (this.status.kind === 'closed' || id === this.myId || this.kicked.includes(id)) return
    if (!raw || typeof raw !== 'object') return
    const msg = raw as Record<string, unknown>
    if (msg.v !== PROTOCOL) return
    if (msg.k === 'profile') this.receiveProfile(id, msg.p, msg.key)
    else if (msg.k === 'input') this.receiveInput(id, msg as Partial<InputMsg>)
  }

  private receiveProfile(id: string, raw: unknown, key: unknown) {
    const profile = validateProfile(raw)
    if (!profile) return
    const secret = typeof key === 'string' && /^[a-z0-9]{16,64}$/.test(key) ? key : undefined
    if (secret && this.kickedKeys.has(secret)) return
    let m = this.members.get(id)
    if (!m && secret) {
      m = this.rebind(id, secret)
      if (m) this.changed()
    }
    const before = m ? JSON.stringify(m.profile) : ''
    if (!m) {
      m = { id, order: this.nextOrder++, host: false, present: true, profile, key: secret }
      this.members.set(id, m)
    } else m.profile = profile
    m.present = true
    if (this.phase !== 'lobby' && !this.matchSeatOf.has(id)) this.seatLateJoiner(m)
    if (JSON.stringify(m.profile) !== before) this.changed()
  }

  /** A guest that reconnected with a new network id: the member (order, seat, match seat) moves to the new id. */
  private rebind(id: string, key: string): RoomMember | undefined {
    const old = [...this.members.values()].find((x) => x.key === key && !x.host)
    if (!old) return undefined
    this.members.delete(old.id)
    const seat = this.matchSeatOf.get(old.id)
    if (this.matchSeatOf.delete(old.id) && seat !== undefined) this.matchSeatOf.set(id, seat)
    old.id = id
    old.input = undefined
    old.goneAt = undefined
    old.present = true
    this.members.set(id, old)
    return old
  }

  /**
   * A member that arrived after the start: in PvP it takes over a bot's seat (its own team first, else the team
   * with the fewest players) or the seat of a player who left; in PvE (or a full PvP match) it spectates.
   */
  private seatLateJoiner(m: RoomMember) {
    if (this.selection.mode === 'pvp') {
      const owner = new Map<string, string>()
      for (const [mid, sid] of this.matchSeatOf) if (sid) owner.set(sid, mid)
      const held = (s: Seat) => {
        const o = owner.get(s.id)
        const om = o ? this.members.get(o) : undefined
        return !!om && (om.host || om.present)
      }
      const free = this.matchSeats.filter((s) => !held(s))
      if (free.length) {
        const players = (t: TeamId) => this.matchSeats.filter((s) => s.team === t && held(s)).length
        const seat =
          free.find((s) => s.team === m.profile.team) ??
          free.reduce((a, b) => (players(b.team) < players(a.team) ? b : a))
        const old = owner.get(seat.id)
        if (old) this.matchSeatOf.delete(old)
        seat.bot = undefined
        seat.name = m.profile.name
        seat.ready = true
        this.matchSeatOf.set(m.id, seat.id)
        this.match?.rename(seat.id, m.profile.name)
        return
      }
    }
    this.matchSeatOf.set(m.id, null)
  }

  private receiveInput(id: string, msg: Partial<InputMsg>) {
    const m = this.members.get(id)
    if (!m || !this.match || msg.m !== this.matchId) return
    const nonce = msg.n
    const g = msg.g
    if (typeof nonce !== 'number' || !Number.isSafeInteger(nonce) || typeof g !== 'number' || !Number.isSafeInteger(g))
      return
    if (g < 0 || g > 1e9) return
    const prev = m.input && m.input.nonce === nonce ? m.input : undefined
    const value = validatePlayerInput(msg.i, prev?.latest)
    if (!value) return
    if (prev) prev.push(g, value, this.now())
    else m.input = new InputBuffer(nonce, g, value, this.now())
  }

  private dropFromMatch(id: string) {
    if (!this.matchSeatOf.has(id)) return
    this.matchSeatOf.delete(id)
  }

  // ---- broadcast

  /** Lobby state as sent to everyone. */
  roomMsg(): RoomMsg {
    const seatOf = this.seatMap()
    const seats = this.seats()
    const members: WireMember[] = [...this.members.values()]
      .filter((m) => m.host || m.present)
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        id: m.id,
        seat: seatOf.get(m.id) ?? null,
        name: m.profile.name,
        species: m.profile.species,
        team: seats.find((s) => s.id === seatOf.get(m.id))?.team ?? m.profile.team,
        ready: m.host || m.profile.ready,
        host: m.host,
        inMatch: this.matchId > 0 && m.profile.inMatch === this.matchId && this.phase === 'match'
      }))
    const msg: RoomMsg = {
      v: PROTOCOL,
      k: 'room',
      code: this.code,
      phase: this.phase,
      matchId: this.matchId,
      selection: this.selection,
      members,
      seats: seats.map((s) => {
        const { local: _local, ...rest } = s
        void _local
        return rest
      }),
      kicked: this.kicked.slice()
    }
    if (this.config && this.phase !== 'lobby') msg.config = this.config
    return msg
  }

  /** Marks the lobby state changed: listeners now, the network on the next send slot. */
  changed() {
    this.roomDirty = true
    this.flush()
    for (const fn of this.listeners) fn()
  }

  /** Queues a match snapshot (the newest replaces an unsent one; its events are merged by the match). */
  queueSnapshot(msg: SnapMsg) {
    this.pendingSnap = msg
    this.flush()
  }

  /** True while a message is on its way (the match then keeps collecting events). */
  get busy() {
    return this.sending
  }

  private flush() {
    if (this.sending || this.status.kind !== 'online') return
    let msg: RoomMsg | SnapMsg | null = null
    if (this.roomDirty) {
      this.roomDirty = false
      this.lastBeat = this.now()
      msg = this.roomMsg()
    } else if (this.pendingSnap) {
      msg = this.pendingSnap
      this.pendingSnap = null
    }
    if (!msg) return
    this.sending = true
    const sent = msg
    this.transport
      .broadcastSnapshot(sent)
      .catch((err) => {
        if (/64 KiB|1 MiB/.test(String(err)) && !this.oversizeWarned) {
          this.oversizeWarned = true
          console.warn('[anima-front] snapshot too large', err)
        }
      })
      .finally(() => {
        this.sending = false
        this.flush()
      })
  }

  /** Heartbeat and, while the tab is hidden, the match clock. */
  pulse(_dt: number, background: boolean) {
    if (this.status.kind === 'closed') return
    if (background && this.match) this.match.advance(true)
    // Members that left the lobby and did not come back are forgotten.
    for (const [id, m] of this.members)
      if (!m.present && this.phase === 'lobby' && m.goneAt !== undefined && this.now() - m.goneAt > MEMBER_GRACE) {
        this.members.delete(id)
        this.changed()
      }
    if (this.now() - this.lastPresence >= PRESENCE_REPEAT) {
      this.lastPresence = this.now()
      this.repeatPresence()
    }
    if (this.now() - this.lastBeat >= HEARTBEAT) {
      this.roomDirty = true
      this.flush()
    }
  }

  /**
   * Workaround for CooperativeNetwork (rabbiters/src/network.ts): the host announces its presence list (which
   * admits guests) only when someone joins or leaves. Behind a relay a guest whose subscription to the host goes
   * live after that list was sent never sees it and gives up after 15 s ("did not admit") although the room
   * works. Until the network repeats it itself, the host re-sends the list every few seconds through the
   * network's own (private) hello. Transports without it (tests, stand-ins) are left alone.
   */
  private repeatPresence() {
    const t = this.transport as unknown as { sendHello?: () => Promise<void> }
    if (typeof t.sendHello !== 'function') return
    try {
      void t.sendHello.call(this.transport).catch(() => undefined)
    } catch {
      // never fatal
    }
  }

  private fail(message: string) {
    if (this.status.kind === 'closed' || this.closedByUs) return
    this.status = { kind: 'closed', text: translateError(message) }
    this.shutdown()
    for (const fn of this.listeners) fn()
  }

  private shutdown() {
    clearInterval(this.beatTimer)
    this.beatTimer = undefined
    this.unlisten?.()
    this.unlisten = undefined
    this.clock.dispose()
  }

  /** Leaves the room (guests see the host leave). */
  close() {
    if (this.closedByUs) return
    this.closedByUs = true
    if (this.status.kind !== 'closed') this.status = { kind: 'closed', text: 'ルームを閉じました' }
    this.shutdown()
    void this.transport.stop().catch(() => undefined)
    this.listeners.clear()
  }
}
