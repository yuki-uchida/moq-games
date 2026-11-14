/**
 * A guest's match session (DESIGN §18): host snapshots are buffered and everything is drawn ~100 ms behind the
 * estimated host clock (interpolated), except the guest's own body, which is predicted at 60 Hz from the inputs
 * it sends at 30 Hz and reconciled against the host's acknowledged state. The local look (yaw/pitch) is drawn
 * from the local input, never delayed. Events are handed out once each, when the drawn time reaches them.
 *
 * PvP: the guest room opens this guest's team part of each snapshot (receiveSealed); enemies the team cannot see
 * arrive as hidden players and fade out / in at draw time (fog.ts).
 */
import type { Session } from '../app/session'
import {
  neutralPlayerInput,
  type MapDef,
  type MatchConfig,
  type PlayerInput,
  type TeamId,
  type View
} from '../sim/types'
import { Fog } from './fog'
import { mergeView, type RosterRow, type TeamPart } from './split'
import type { GuestRoom } from './guest-room'
import { EventQueue, RENDER_DELAY, SnapshotBuffer } from './interp'
import { INPUT_RATE, PROTOCOL, type SnapMsg } from './protocol'
import { netDebug } from './debug'
import { OwnBody } from './reconcile'
import { looksLikeView, releasedInput } from './validate'

const STEP = 1 / 60
const MAX_STEPS = 6
const RESULT_PHASES = ['victory', 'defeat', 'draw']

export class GuestMatch implements Session {
  readonly kind = 'guest' as const
  readonly canPause = false
  readonly me: string
  /** Input session nonce: the host restarts the press-counter baseline when it changes. */
  readonly nonce = 1 + Math.floor(Math.random() * 0x7ffffffe)
  private readonly buffer = new SnapshotBuffer()
  private readonly queue = new EventQueue(1)
  private readonly body: OwnBody | null
  private input: PlayerInput = neutralPlayerInput()
  private sent: PlayerInput = neutralPlayerInput()
  private paused = false
  private clock = 0
  private lastAt: number
  private acc = 0
  private sinceSend = Infinity
  private ended = false
  private sawResult = false
  private disposed = false
  /** PvP: fading of enemies leaving / entering sight, and the hidden enemies of each buffered snapshot. */
  private fog: Fog | null = null
  private hiddenAt: { time: number; hidden: Set<string> }[] = []

  constructor(
    private readonly room: GuestRoom,
    readonly config: MatchConfig,
    readonly map: MapDef,
    readonly matchId: number,
    /** My seat (null: spectating). */
    readonly seat: string | null,
    follow: string
  ) {
    this.me = seat ?? follow
    const mine = seat ? config.players.find((p) => p.id === seat) : undefined
    this.body = mine ? new OwnBody(map, mine) : null
    this.lastAt = room.time
    room.setInMatch(matchId)
  }

  get spectating() {
    return !this.body
  }

  get over(): boolean {
    if (this.buffer.latest && this.ended) return true
    // The host went back to the lobby after the results were reached.
    const room = this.room.room
    return this.sawResult && (!room || room.phase === 'lobby' || room.matchId !== this.matchId)
  }

  /** Reconciliation numbers (tests and diagnostics). */
  get prediction() {
    return this.body?.stats
  }

  setInput(input: PlayerInput) {
    this.input = input
  }

  setPaused(paused: boolean) {
    // Online matches never pause: the menu only lets go of the controls.
    this.paused = paused
  }

  /** PvP: a snapshot's public part with this guest's opened team part. */
  receiveSealed(msg: SnapMsg, part: TeamPart, team: TeamId) {
    if (this.disposed || !msg.view || !part || typeof part !== 'object') return
    if (!Array.isArray(part.p) || !Array.isArray(part.e) || !Array.isArray(msg.view.events)) return
    const known = part.p.filter((p) => !!p && typeof p === 'object' && typeof p.id === 'string')
    // The team's own and visible enemy props (merged with the public map props).
    const props = Array.isArray(part.r)
      ? part.r.filter((r) => !!r && typeof r === 'object' && Number.isFinite(r.id))
      : undefined
    const roster = Array.isArray(msg.r) ? (msg.r as RosterRow[]) : []
    if (!this.fog || this.fog.team !== team) this.fog = new Fog(team)
    const fog = this.fog
    const { view, hidden } = mergeView(
      msg.view,
      roster,
      { p: known, e: part.e, a: {}, s: part.s, d: part.d, r: props },
      this.config,
      (id) => fog.lastOf(id)
    )
    const ack = part.a && typeof part.a === 'object' ? part.a : {}
    if (!this.receive({ ...msg, ack, view })) return
    fog.observe(view, hidden)
    this.hiddenAt.push({ time: view.time, hidden })
    if (this.hiddenAt.length > 12) this.hiddenAt.shift()
  }

  /** The hidden enemies drawn at host time t: those of the first snapshot at or after it. */
  private hiddenWhen(t: number): Set<string> {
    for (const h of this.hiddenAt) if (h.time >= t - 1e-6) return h.hidden
    return this.hiddenAt[this.hiddenAt.length - 1]?.hidden ?? new Set()
  }

  receive(msg: SnapMsg): boolean {
    if (this.disposed || !looksLikeView(msg.view)) return false
    const view = msg.view
    if (!this.buffer.push(view, this.clock)) return false
    if (msg.over) this.ended = true
    if (RESULT_PHASES.includes(view.phase)) this.sawResult = true
    // Late joiners skip anything older than a second.
    this.queue.add(view.events, view.time)
    if (!this.body || !this.seat) return true
    const own = view.players.find((p) => p.id === this.seat)
    if (!own) return true
    const ack = msg.ack && Array.isArray(msg.ack[this.seat]) ? msg.ack[this.seat] : undefined
    const at =
      ack && ack[0] === this.nonce && Number.isSafeInteger(ack[1]) && ack[1] >= 0 ? (ack[1] as number) : undefined
    this.body.reconcile(own, at, view.props)
    return true
  }

  update(): View | null {
    if (this.room.status.kind === 'closed') throw new Error(this.room.status.text)
    const room = this.room.room
    if (room && (room.matchId !== this.matchId || room.phase === 'lobby') && !this.over)
      throw new Error('ホストが任務を中断しました。')
    const now = this.room.time
    const dt = Math.min(1, Math.max(0, now - this.lastAt))
    this.lastAt = now
    this.clock += dt
    if (dt > 0.5 && this.buffer.latest) this.queue.skipBefore(this.buffer.latest.time - RENDER_DELAY)
    if (this.body) this.predict(dt)
    const renderT = this.buffer.hostTime(this.clock) - RENDER_DELAY
    const sampled = this.buffer.sample(renderT)
    if (!sampled) return null
    const v = this.fog ? this.fog.present(sampled, this.hiddenWhen(renderT), renderT) : sampled
    const events = this.queue.take(renderT)
    const out = { ...this.withOwnBody(v), events }
    netDebug({ role: 'guest', me: this.me, code: this.room.code, view: out, prediction: this.body?.stats })
    return out
  }

  /** Steps the prediction at 60 Hz; every other step samples and sends the input (30 Hz). */
  private predict(dt: number) {
    const body = this.body!
    body.fade(dt)
    this.acc += dt
    let n = 0
    while (this.acc >= STEP - 1e-9 && n < MAX_STEPS) {
      this.acc -= STEP
      n++
      this.sinceSend += STEP
      if (this.sinceSend >= 1 / INPUT_RATE - 1e-6) {
        const next = this.paused ? releasedInput(this.input) : this.input
        const ok = this.room.sendInput({
          v: PROTOCOL,
          k: 'input',
          m: this.matchId,
          n: this.nonce,
          g: body.tick + 1,
          i: next
        })
        // An input that could not be sent is not predicted either (the host would never see it).
        if (ok) {
          this.sent = next
          this.sinceSend = 0
        }
      }
      body.step(this.sent)
    }
    if (n === MAX_STEPS && this.acc >= STEP) this.acc = 0
  }

  /** My player drawn from the prediction (position/motion) and the newest snapshot (everything else). */
  private withOwnBody(v: View): View {
    const seat = this.seat
    if (!seat) return v
    const latest = this.buffer.latest?.players.find((p) => p.id === seat)
    const i = v.players.findIndex((p) => p.id === seat)
    if (!latest || i < 0) return v
    const own = { ...latest }
    if (this.body?.ready && own.state !== 'away' && own.move !== 'hook') {
      const b = this.body.predictor.body
      own.p = this.body.drawn()
      own.v = [b.v[0], b.v[1], b.v[2]]
      own.grounded = b.grounded
      own.move = b.move
    }
    own.yaw = this.input.yaw
    own.pitch = this.input.pitch
    own.shoulder = this.input.shoulder
    const players = v.players.slice()
    players[i] = own
    return { ...v, players }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    // A newer session of this room (a spectator that took a seat) reports the match itself.
    if (this.room.match && this.room.match !== this) return
    this.room.match = null
    this.room.setInMatch(0)
  }
}
