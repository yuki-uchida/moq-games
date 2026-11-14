/**
 * A guest's view of a room (DESIGN §18): connects, waits for the host's lobby state (「ルームが見つかりません」
 * after ROOM_SEARCH seconds), keeps the host informed of the local profile (on change and at 1 Hz, since messages
 * sent before the host subscribed are lost), follows the lobby state and hands match snapshots to the GuestMatch.
 * A host that goes quiet is waited for; a host that leaves, a kick or a lost relay closes the room.
 *
 * PvP (DESIGN §18): the guest sends an ECDH public key in its profile, unwraps the team key the host wraps for it
 * (RoomMsg.keys) and opens only its team's part of each snapshot; spectators choose the team they follow. Its
 * inputs travel sealed for the host with the guest-to-host key; so does its reconnection secret in every mode.
 */
import type { LocalChoice, MatchStart } from '../app/lobby'
import type { Seat } from '../app/match'
import { getMap } from '../sim/api'
import type { TeamId } from '../sim/types'
import { netLog, netPart } from './debug'
import { GuestMatch } from './guest-match'
import { profileOf, type RoomStatus } from './host-room'
import {
  APP_ID,
  HEARTBEAT,
  HOST_GONE,
  HOST_STALL,
  PROTOCOL,
  ROOM_SEARCH,
  randomPeerId,
  translateError,
  partAad,
  inputAad,
  rejoinAad,
  wrapAad,
  type InputMsg,
  type NetTransport,
  type ProfileMsg,
  type RoomMsg,
  type RoomPhase,
  type SnapMsg,
  type TransportFactory,
  type WireMember
} from './protocol'
import { isB64, isEcdhPub, newEcdh, seal, teamKey, unseal, unsealJson, wrapKey, type EcdhPair } from './seal'
import type { TeamPart } from './split'
import { cleanName, validateConfig, validateSeat, validateSelection, validId, type Profile } from './validate'

/** How often a guest whose admission never arrived reconnects (see reconnect). */
const MAX_RETRIES = 3

/** 24 characters of [a-z0-9] from the system's random source (unbiased: bytes from 252 up are drawn again). */
function randomKey(): string {
  let s = ''
  while (s.length < 24) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) if (b < 252 && s.length < 24) s += (b % 36).toString(36)
  }
  return s
}

const utf8 = (text: string) => new TextEncoder().encode(text)

export interface GuestRoomOptions {
  /** Network ids for reconnections (default random). */
  newPeerId?: () => string
  code: string
  relayUrl: string
  me: LocalChoice
  transport: TransportFactory
  peerId: string
  /** Seconds (monotonic). */
  now?: () => number
  timeoutMs?: number
  searchSeconds?: number
}

/** Rebuilds the host's lobby state from untrusted JSON (undefined when it is not one). */
export function validateRoom(raw: unknown): RoomMsg | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (r.v !== PROTOCOL || r.k !== 'room' || typeof r.code !== 'string') return undefined
  const phase = r.phase === 'briefing' || r.phase === 'match' ? r.phase : r.phase === 'lobby' ? 'lobby' : undefined
  const selection = validateSelection(r.selection)
  if (!phase || !selection || !Array.isArray(r.members) || !Array.isArray(r.seats)) return undefined
  if (typeof r.matchId !== 'number' || !Number.isSafeInteger(r.matchId) || r.matchId < 0) return undefined
  const seats: Omit<Seat, 'local'>[] = []
  for (const s of r.seats.slice(0, 12)) {
    const seat = validateSeat(s)
    if (seat) seats.push(seat)
  }
  const members: WireMember[] = []
  for (const m of r.members.slice(0, 16)) {
    if (!m || typeof m !== 'object') continue
    const x = m as Record<string, unknown>
    if (!validId(x.id)) continue
    const seat = validateSeat({ ...x, id: typeof x.seat === 'string' ? x.seat : 'none', loadout: null })
    if (!seat) continue
    members.push({
      id: x.id,
      seat: typeof x.seat === 'string' && validId(x.seat) ? x.seat : null,
      name: cleanName(x.name),
      species: seat.species,
      team: seat.team,
      ready: x.ready === true,
      host: x.host === true,
      inMatch: x.inMatch === true
    })
  }
  const msg: RoomMsg = {
    v: PROTOCOL,
    k: 'room',
    code: r.code.slice(0, 64),
    phase,
    matchId: r.matchId,
    selection,
    members,
    seats,
    kicked: Array.isArray(r.kicked) ? r.kicked.filter(validId).slice(0, 64) : []
  }
  if (isEcdhPub(r.hk)) msg.hk = r.hk
  const keys = r.keys as { g?: unknown; w?: unknown } | undefined
  if (keys && typeof keys === 'object' && Number.isSafeInteger(keys.g) && keys.w && typeof keys.w === 'object') {
    const w: Record<string, string> = {}
    for (const [id, blob] of Object.entries(keys.w as Record<string, unknown>).slice(0, 16))
      if (validId(id) && isB64(blob, 200)) w[id] = blob
    msg.keys = { g: keys.g as number, w }
  }
  if (phase !== 'lobby') {
    const config = validateConfig(r.config)
    if (!config) return undefined
    msg.config = config
  }
  return msg
}

export class GuestRoom {
  readonly code: string
  /** Network id of the current connection (a transport retry gets a new one). */
  myId: string
  status: RoomStatus = { kind: 'connecting', text: 'リレーに接続しています…' }
  room: RoomMsg | null = null
  match: GuestMatch | null = null
  /** Seconds since the host was last heard (0 while live). */
  silence = 0
  private profile: Profile
  private readonly listeners = new Set<() => void>()
  private transport: NetTransport
  /** Increments with every connection; callbacks of an older one are ignored. */
  private generation = 0
  private retries = 0
  /** Secret that lets the host recognise this player across connections (only ever sent sealed: ProfileMsg.kx). */
  readonly key = randomKey()
  private readonly now: () => number
  private lastHeard: number
  private beat?: ReturnType<typeof setInterval>
  private found?: () => void
  private profileDirty = true
  /** One guest message at a time (see sendInput). */
  private sending = false
  private closedByUs = false
  /** ECDH key pair for team keys (null without WebCrypto). */
  private readonly ecdh: Promise<EcdhPair | null>
  private ek?: string
  /** Spectating: the team whose view to follow. */
  private follow: TeamId = 0
  /** Unwrapped team keys by generation (the newest few). */
  private readonly teamKeys = new Map<number, { team: TeamId; key: CryptoKey }>()
  private readonly unwrapping = new Set<string>()
  /** Per generation, the wrapped blob its team key came from (a spectator may get another team's key). */
  private readonly unwrapped = new Map<number, string>()
  /** Per generation, the newest blob being unwrapped (an older job finishing later is discarded). */
  private readonly unwrapWanted = new Map<number, string>()
  /** Sealed snapshots are opened one after the other. */
  private opening: Promise<void> = Promise.resolve()
  /** `${myId}:${hk}` the guest-to-host key and the sealed secret below belong to (set when their job starts). */
  private hostKeyFor?: string
  /** The guest-to-host key (seal.ts) for `hostKeyFor`, once derived. */
  private hostKey?: CryptoKey
  /** The reconnection secret sealed for the host (ProfileMsg.kx) for `hostKeyFor`, once sealed. */
  private kx?: string
  /** The job for `hostKeyFor` finished (with or without a key: ECDH may be unavailable or fail). */
  private hostKeySettled = false

  constructor(private readonly opts: GuestRoomOptions) {
    this.code = opts.code
    this.myId = opts.peerId
    this.now = opts.now ?? (() => performance.now() / 1000)
    this.lastHeard = this.now()
    this.profile = profileOf(opts.me, false)
    this.transport = this.makeTransport(opts.peerId)
    this.ecdh = newEcdh().then(
      (pair) => {
        this.ek = pair.pub
        this.profileDirty = true
        // Before the connection is up, open() sends the profile once it is.
        if (this.beat) this.flushProfile()
        return pair
      },
      (err) => {
        netLog(`guest ECDH unavailable: ${String(err)}`)
        return null
      }
    )
  }

  private makeTransport(peerId: string): NetTransport {
    const gen = ++this.generation
    return this.opts.transport({
      relayUrl: this.opts.relayUrl,
      room: this.opts.code,
      role: 'guest',
      playerId: peerId,
      app: APP_ID,
      onInput: () => undefined,
      onSnapshot: (raw) => {
        if (gen === this.generation) this.receive(raw)
      },
      onPresence: () => undefined,
      onStatus: (status, message) => {
        netLog(`guest ${peerId} #${gen}${gen === this.generation ? '' : ' (old)'}: ${status} ${message}`)
        if (gen !== this.generation) return
        if (status === 'error') {
          // A presence that never arrived is retried on a fresh connection (see retryAdmission).
          if (/did not admit/i.test(message) && this.room && this.retries < MAX_RETRIES) void this.reconnect()
          else this.fail(message)
        }
      }
    })
  }

  /**
   * CooperativeNetwork admits a guest when the host's presence list naming it arrives and gives up after 15 s
   * without it ("did not admit") although the room works (the host repeats the list: HostRoom.repeatPresence).
   * If it still happens, the guest reconnects with a new network id; its secret key lets the host keep its seat.
   */
  private async reconnect() {
    if (this.status.kind === 'closed' || this.closedByUs) return
    this.retries++
    const old = this.transport
    void old.stop().catch(() => undefined)
    this.myId = (this.opts.newPeerId ?? randomPeerId)()
    this.transport = this.makeTransport(this.myId)
    this.sending = false
    try {
      await this.transport.start()
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err))
      return
    }
    this.profileDirty = true
    this.flushProfile()
  }

  /** Connects and waits for the host's lobby state; rejects with a Japanese message. */
  async open(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.transport.start(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), this.opts.timeoutMs ?? 15_000)
        })
      ])
      clearTimeout(timer)
      if (this.status.kind === 'closed') throw new Error(this.status.text)
      this.status = { kind: 'connecting', text: 'ルームをさがしています…' }
      this.lastHeard = this.now()
      this.beat = setInterval(() => this.pulse(), HEARTBEAT * 1000)
      this.flushProfile()
      if (!this.room) {
        await new Promise<void>((resolve, reject) => {
          this.found = resolve
          timer = setTimeout(() => reject(new Error('room not found')), (this.opts.searchSeconds ?? ROOM_SEARCH) * 1000)
        })
      }
    } catch (err) {
      const text =
        this.status.kind === 'closed' && this.status.text !== 'ルームとの接続が切れました。'
          ? this.status.text
          : translateError(err instanceof Error ? err.message : String(err))
      this.close()
      throw new Error(text)
    } finally {
      clearTimeout(timer)
      this.found = undefined
    }
    if (this.status.kind === 'closed') throw new Error(this.status.text)
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  get time() {
    return this.now()
  }

  get phase(): RoomPhase {
    return this.room?.phase ?? 'lobby'
  }

  /** My match seat as the host assigned it (null: spectating or not admitted yet). */
  get mySeat(): string | null {
    return this.room?.members.find((m) => m.id === this.myId)?.seat ?? null
  }

  /** The host lists this player in the room. */
  get admittedByRoom(): boolean {
    return !!this.room?.members.some((m) => m.id === this.myId)
  }

  setLocal(choice: LocalChoice) {
    this.profile = { ...profileOf(choice, this.profile.ready, this.profile.inMatch) }
    this.profileDirty = true
    this.flushProfile()
    this.emit()
  }

  setReady(ready: boolean) {
    this.profile = { ...this.profile, ready }
    this.profileDirty = true
    this.flushProfile()
    this.emit()
  }

  get ready() {
    return this.profile.ready
  }

  /** Spectators (PvP): the team whose view (and only that one) this guest receives. */
  setFollowTeam(team: TeamId) {
    if (this.follow === team) return
    this.follow = team
    this.profileDirty = true
    this.flushProfile()
    this.emit()
  }

  get followTeam(): TeamId {
    return this.follow
  }

  /** The team whose snapshot part this guest can open now (undefined: none yet). */
  get keyTeam(): TeamId | undefined {
    const g = this.room?.keys?.g
    return g === undefined ? undefined : this.teamKeys.get(g)?.team
  }

  /** Tells the host whether the game screen is in a match (0: not). */
  setInMatch(matchId: number) {
    if (this.profile.inMatch === matchId) return
    this.profile = { ...this.profile, inMatch: matchId }
    this.profileDirty = true
    this.flushProfile()
  }

  /** The match the host started (briefing or running), for the lobby to open. */
  matchStart(): MatchStart | null {
    const room = this.room
    if (!room || room.phase === 'lobby' || !room.config) return null
    const config = room.config
    const matchId = room.matchId
    const seat = this.mySeat
    const seated = seat && config.players.some((p) => p.id === seat) ? seat : null
    // Spectators follow the host's seat (or the first human one).
    const team = config.mode === 'pvp' ? this.follow : undefined
    const follow =
      seated ??
      (team !== undefined
        ? (config.players.find((p) => p.team === team && p.bot === undefined)?.id ??
          config.players.find((p) => p.team === team)?.id)
        : undefined) ??
      room.members.find((m) => m.host && m.seat)?.seat ??
      config.players.find((p) => p.bot === undefined)?.id ??
      config.players[0].id
    return {
      config,
      me: follow,
      spectator: !seated,
      connect: () => {
        if (this.status.kind === 'closed') throw new Error(this.status.text)
        if (this.room?.matchId !== matchId || this.room.phase === 'lobby') throw new Error('この出撃は取り消されました')
        this.match?.dispose()
        const map = getMap(config.map, config.variant)
        this.match = new GuestMatch(this, config, map, matchId, seated, follow)
        return this.match
      }
    }
  }

  /**
   * Sends a match input (dropped while another message is still on its way). Every guest message goes out one
   * at a time: CooperativeNetwork numbers a message before compressing it, so two in flight could arrive swapped
   * and the host would drop the older-numbered one.
   */
  sendInput(msg: InputMsg): boolean {
    if (this.sending || this.status.kind === 'closed') return false
    if (this.profileDirty) {
      // A pending profile goes first (it says which match this screen is in).
      this.flushProfile()
      return false
    }
    if (this.room?.selection.mode === 'pvp' || this.room?.config?.mode === 'pvp') {
      // PvP: the input goes sealed for the host (anyone who knows this guest's id can read its track).
      const key = this.readyHostKey()
      if (!key) {
        this.prepareHostKey()
        return false
      }
      this.sending = true
      const gen = this.generation
      const { m, n, g } = msg
      seal(key, utf8(JSON.stringify(msg.i)), inputAad(this.myId, m, n, g)).then(
        (x) => {
          // A reconnection in between reset `sending` and owns the slot now.
          if (gen !== this.generation) return
          if (this.status.kind === 'closed') {
            this.sending = false
            return
          }
          this.send({ v: PROTOCOL, k: 'input', m, n, g, x })
        },
        (err) => {
          if (gen === this.generation) this.sending = false
          netLog(`guest could not seal an input: ${String(err)}`)
        }
      )
      return true
    }
    this.send(msg)
    return true
  }

  /** The guest-to-host key for the current connection and host key, when it is ready. */
  private readyHostKey(): CryptoKey | undefined {
    const hk = this.room?.hk
    return hk && this.hostKeyFor === `${this.myId}:${hk}` ? this.hostKey : undefined
  }

  /**
   * Derives the guest-to-host key for the current network id and host key, then seals the reconnection secret
   * with it (once per id/host key); the profile goes out again once that is done.
   */
  private prepareHostKey() {
    const hk = this.room?.hk
    if (!hk) return
    const id = this.myId
    const tag = `${id}:${hk}`
    if (this.hostKeyFor === tag) return
    this.hostKeyFor = tag
    this.hostKey = undefined
    this.kx = undefined
    this.hostKeySettled = false
    void (async () => {
      const pair = await this.ecdh
      if (!pair) return
      const key = await wrapKey(pair.priv, hk, this.code, id, 'guest-to-host')
      if (this.hostKeyFor !== tag) return
      this.hostKey = key
      const kx = await seal(key, utf8(this.key), rejoinAad(id))
      if (this.hostKeyFor === tag) this.kx = kx
    })()
      .catch((err) => netLog(`guest could not derive the guest-to-host key: ${String(err)}`))
      .finally(() => {
        if (this.hostKeyFor !== tag) return
        this.hostKeySettled = true
        this.profileDirty = true
        this.flushProfile()
      })
  }

  private flushProfile() {
    if (!this.profileDirty || this.sending || this.status.kind === 'closed') return
    // Once the host's key is known the profile waits for the sealed secret, so a reconnection always introduces
    // itself with its proof (and gets its seat back). Without ECDH or after a failure it goes without one.
    const hk = this.room?.hk
    const tag = hk ? `${this.myId}:${hk}` : undefined
    if (tag) {
      this.prepareHostKey()
      if (!this.hostKeySettled) return
    }
    this.profileDirty = false
    const msg: ProfileMsg = { v: PROTOCOL, k: 'profile', p: this.profile }
    if (tag && this.kx && this.hostKeyFor === tag) msg.kx = this.kx
    if (this.ek) msg.ek = this.ek
    if (this.follow) msg.f = this.follow
    this.send(msg, () => {
      this.profileDirty = true
    })
  }

  private send(msg: ProfileMsg | InputMsg, failed?: () => void) {
    this.sending = true
    this.transport.sendInput(msg).then(
      () => {
        this.sending = false
        this.flushProfile()
      },
      () => {
        // A failed send is retried by the 1 Hz heartbeat, never at once: a network that rejects immediately
        // (not connected yet) would otherwise spin in microtasks and freeze the page.
        this.sending = false
        failed?.()
      }
    )
  }

  private receive(raw: unknown) {
    if (this.status.kind === 'closed' || !raw || typeof raw !== 'object') return
    const k = (raw as { k?: unknown }).k
    this.lastHeard = this.now()
    if (this.silence > 0) {
      this.silence = 0
      if (this.room) this.status = { kind: 'online', text: 'オンライン' }
      this.emit()
    }
    if (k === 'snap') {
      const msg = raw as SnapMsg
      const match = this.match
      if (!match || msg.v !== PROTOCOL || msg.m !== match.matchId) return
      if (msg.s !== undefined) this.opening = this.opening.then(() => this.openSnapshot(msg, match))
      else match.receive(msg)
      return
    }
    const room = validateRoom(raw)
    if (!room) return
    if (room.kicked.includes(this.myId)) {
      this.fail('kicked')
      return
    }
    this.room = room
    this.prepareHostKey()
    this.unwrapKey(room)
    if (this.status.kind === 'connecting') this.status = { kind: 'online', text: 'オンライン' }
    this.found?.()
    this.emit()
  }

  /** Unwraps the team key the host wrapped for this connection (once per generation). */
  private unwrapKey(room: RoomMsg) {
    const keys = room.keys
    const hk = room.hk
    const id = this.myId
    const blob = keys?.w[id]
    // Once per generation, and again when the host wraps another team's key (a spectator switched teams).
    if (!keys || !hk || !blob || this.unwrapped.get(keys.g) === blob) return
    const job = `${keys.g}:${id}:${blob}`
    if (this.unwrapping.has(job)) return
    this.unwrapping.add(job)
    this.unwrapWanted.set(keys.g, blob)
    void (async () => {
      const pair = await this.ecdh
      if (!pair) return
      const wk = await wrapKey(pair.priv, hk, this.code, id)
      const raw = await unseal(wk, blob, wrapAad(keys.g, id))
      if (raw.length !== 33 || raw[0] > 2) throw new Error('bad team key')
      const key = await teamKey(raw.subarray(1))
      if (this.unwrapWanted.get(keys.g) !== blob) return
      this.teamKeys.set(keys.g, { team: raw[0] as TeamId, key })
      this.unwrapped.set(keys.g, blob)
      const kept = [...this.teamKeys.keys()].sort((a, b) => a - b)
      for (const g of kept.slice(0, -4)) this.teamKeys.delete(g)
      const oldest = kept.slice(-4)[0]
      for (const map of [this.unwrapped, this.unwrapWanted])
        for (const g of [...map.keys()]) if (g < oldest) map.delete(g)
      netLog(`guest ${id} team key generation ${keys.g} (team ${raw[0]})`)
    })().catch((err) => netLog(`guest could not unwrap the team key: ${String(err)}`))
  }

  /** Opens this guest's team part of a PvP snapshot and hands the merged view to the match. */
  private async openSnapshot(msg: SnapMsg, match: GuestMatch) {
    const k = typeof msg.g === 'number' ? this.teamKeys.get(msg.g) : undefined
    const sealed = k && msg.s ? msg.s[k.team] : undefined
    if (!k || !isB64(sealed, 1 << 22) || typeof msg.view?.tick !== 'number') return
    try {
      const part = await unsealJson(k.key, sealed, partAad(msg.m, msg.g!, k.team, msg.view.tick))
      netPart(part)
      if (this.match === match) match.receiveSealed(msg, part as TeamPart, k.team)
    } catch (err) {
      netLog(`guest could not open a snapshot: ${String(err)}`)
    }
  }

  private pulse() {
    if (this.status.kind === 'closed') return
    // Messages sent before the host subscribed are lost: repeat the profile.
    this.profileDirty = true
    this.flushProfile()
    const quiet = this.now() - this.lastHeard
    if (!this.room) return
    if (quiet > HOST_GONE) {
      this.fail('host left')
      return
    }
    if (quiet > HOST_STALL) {
      this.silence = quiet
      this.status = { kind: 'online', text: 'ホストの応答を待っています…' }
      this.emit()
    }
  }

  private emit() {
    for (const fn of this.listeners) fn()
  }

  private fail(message: string) {
    if (this.status.kind === 'closed' || this.closedByUs) return
    this.status = { kind: 'closed', text: translateError(message) }
    clearInterval(this.beat)
    void this.transport.stop().catch(() => undefined)
    this.emit()
  }

  /** Leaves the room. */
  close() {
    if (this.closedByUs) return
    this.closedByUs = true
    if (this.status.kind !== 'closed') this.status = { kind: 'closed', text: 'ルームを出ました' }
    clearInterval(this.beat)
    this.match?.dispose()
    void this.transport.stop().catch(() => undefined)
    this.listeners.clear()
  }
}
