/**
 * The host's match session (DESIGN §18): the World runs in the host tab at 60 Hz with the host's own input and
 * every guest's latest validated input (let go after INPUT_EXPIRY without news); seats whose player left or never
 * arrived are played by bots (world.setBot) and handed back when the player returns. Snapshots go out at 20 Hz
 * with the events since the previous one and, per guest, the prediction tick the state corresponds to. The host's
 * own screen is smoothed between the last two steps. A hidden tab keeps stepping from the room's worker clock.
 */
import type { Session } from '../app/session'
import type { World } from '../sim/api'
import { neutralPlayerInput, type MatchConfig, type PlayerInput, type SimEvent, type View } from '../sim/types'
import type { HostRoom } from './host-room'
import { INPUT_EXPIRY, PROTOCOL, SNAPSHOT_RATE, type SnapMsg } from './protocol'
import { humanSeatId } from './seats'
import { netDebug } from './debug'
import { SmoothedWorld } from './smooth'
import { releasedInput } from './validate'

const STEP = 1 / 60
/** Visible tab: at most this many steps per frame; hidden tab: up to a second of catch-up per pulse. */
const FRAME_STEPS = 6
const BACKGROUND_STEPS = 60

export class HostMatch implements Session {
  readonly kind = 'host' as const
  readonly me = humanSeatId(0)
  readonly canPause = false
  readonly map
  private readonly smooth: SmoothedWorld
  private acc = 0
  private lastAt: number
  private lastUpdateAt: number
  private myInput: PlayerInput = neutralPlayerInput()
  private paused = false
  private readonly names = new Map<string, string>()
  /** Seat id → currently played by a bot. */
  private readonly isBot = new Map<string, boolean>()
  private snapEvents: SimEvent[] = []
  private snapAcc = 0
  private disposed = false
  /** Number of snapshots sent and the largest JSON size (diagnostics). */
  readonly stats = { snapshots: 0, maxJson: 0 }

  constructor(
    private readonly room: HostRoom,
    readonly world: World,
    readonly config: MatchConfig,
    readonly matchId: number,
    private readonly startedAt: number
  ) {
    this.map = world.map
    for (const p of config.players) this.isBot.set(p.id, p.bot !== undefined)
    this.smooth = new SmoothedWorld(world)
    this.snapEvents.push(...this.smooth.prime().events)
    this.lastAt = room.time
    this.lastUpdateAt = room.time
  }

  get over() {
    return this.world.over
  }

  setInput(input: PlayerInput) {
    this.myInput = input
  }

  setPaused(paused: boolean) {
    // Online matches never pause: the menu only lets go of the controls.
    this.paused = paused
  }

  /** A seat taken over by a late joiner shows the joiner's name. */
  rename(seatId: string, name: string) {
    this.names.set(seatId, name)
  }

  update(): View | null {
    if (this.room.status.kind === 'closed') throw new Error(this.room.status.text)
    const now = this.room.time
    // Back from a hidden tab: the background clock kept the match going; skip the effects that piled up.
    if (now - this.lastUpdateAt > 0.5 && this.smooth.latest)
      this.smooth.skipEventsBefore(this.smooth.latest.time - 0.25)
    this.lastUpdateAt = now
    this.advance(false)
    const p = this.smooth.present(Math.min(1, this.acc / STEP))
    const v = p ? this.withNames(p) : null
    if (v) netDebug({ role: 'host', me: this.me, code: this.room.code, view: v, steps: this.world.tick })
    return v
  }

  /** Steps the world up to the room's current time. */
  advance(background: boolean) {
    if (this.disposed) return
    const now = this.room.time
    const dt = Math.max(0, now - this.lastAt)
    this.lastAt = now
    this.acc += Math.min(dt, background ? 2 : 1)
    const max = background ? BACKGROUND_STEPS : FRAME_STEPS
    let n = 0
    while (this.acc >= STEP - 1e-9 && n < max) {
      this.stepOnce()
      this.acc -= STEP
      n++
    }
    if (n === max && this.acc >= STEP) this.acc = 0
    this.snapAcc += n * STEP
    if (this.snapAcc >= 1 / SNAPSHOT_RATE - 1e-6 && !this.room.busy) {
      this.snapAcc = 0
      this.sendSnapshot()
    }
  }

  private stepOnce() {
    const matchTime = this.room.time - this.startedAt
    const inputs = new Map<string, PlayerInput>()
    const latest = this.smooth.latest
    for (const p of this.config.players) {
      const control = this.room.controlOf(p.id, matchTime)
      const wantBot = control.kind === 'bot'
      if (wantBot !== this.isBot.get(p.id)) {
        this.isBot.set(p.id, wantBot)
        this.world.setBot(p.id, wantBot ? (p.bot ?? this.room.botSkill) : undefined)
      }
      if (control.kind === 'host') {
        inputs.set(p.id, this.paused ? releasedInput(this.myInput) : this.myInput)
      } else if (control.kind === 'guest') {
        const pv = latest?.players.find((q) => q.id === p.id)
        const idle = { ...neutralPlayerInput(), yaw: pv?.yaw ?? 0, pitch: pv?.pitch ?? 0 }
        const buf = control.member.input
        inputs.set(p.id, buf ? buf.next(this.room.time - buf.at > INPUT_EXPIRY, idle) : idle)
      }
    }
    const v = this.smooth.step(inputs)
    if (v.events.length) this.snapEvents.push(...v.events)
  }

  private sendSnapshot() {
    const cur = this.smooth.latest
    if (!cur) return
    const ack: SnapMsg['ack'] = {}
    for (const [memberId, seat] of this.room.matchSeatOf) {
      const rec = seat ? this.room.members.get(memberId)?.input : undefined
      if (seat && rec) ack[seat] = [rec.nonce, rec.cursor]
    }
    const msg: SnapMsg = {
      v: PROTOCOL,
      k: 'snap',
      m: this.matchId,
      over: this.world.over,
      ack,
      view: this.withNames({ ...cur, events: this.snapEvents })
    }
    this.snapEvents = []
    this.stats.snapshots++
    this.room.queueSnapshot(msg)
  }

  private withNames(v: View): View {
    if (!this.names.size) return v
    return { ...v, players: v.players.map((p) => (this.names.has(p.id) ? { ...p, name: this.names.get(p.id)! } : p)) }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    if (this.world.over) {
      // Let the guests see the final state before the room goes back to the lobby.
      this.snapAcc = 1
      if (!this.room.busy) this.sendSnapshot()
    }
    this.room.endMatch(this)
  }
}
