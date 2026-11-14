/**
 * The host's match session (DESIGN §18): the World runs in the host tab at 60 Hz with the host's own input and
 * every guest's latest validated input (let go after INPUT_EXPIRY without news); seats whose player left or never
 * arrived are played by bots (world.setBot) and handed back when the player returns. Snapshots go out at 20 Hz
 * with the events since the previous one and, per guest, the prediction tick the state corresponds to. The host's
 * own screen is smoothed between the last two steps. A hidden tab keeps stepping from the room's worker clock.
 *
 * PvP (DESIGN §18): every snapshot recomputes which players each team may know about (visibility.ts), splits the
 * view into a public part and one part per team (split.ts) and seals each team part with its key (the room's
 * seal). The host's own screen keeps to the same boundary for its team.
 */
import type { Session } from '../app/session'
import type { World } from '../sim/api'
import {
  neutralPlayerInput,
  type MatchConfig,
  type PlayerConfig,
  type PlayerInput,
  type SimEvent,
  type TeamId,
  type View
} from '../sim/types'
import { Fog, hideUnknown } from './fog'
import { eventForTeam, isPublicEvent, mapPropsOf, shotsForTeam, splitView, teamObjects, viewForTeam } from './split'
import { TeamVisibility, type TeamSets } from './visibility'
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
  /** Seat id → currently played by a bot. */
  private readonly isBot = new Map<string, boolean>()
  private snapEvents: SimEvent[] = []
  private snapAcc = 0
  private disposed = false
  /** Snapshots sent, largest JSON size; PvP: split-to-sealed wall time (ms) and rays of the last snapshot. */
  readonly stats = { snapshots: 0, maxJson: 0, secretMs: 0, secretMaxMs: 0, rays: 0 }
  /** PvP: team visibility, the host's team and its fading. */
  private readonly vis: TeamVisibility | null
  private readonly myTeam: TeamId
  private readonly fog: Fog
  private sets: TeamSets | null = null
  private sealing = false

  constructor(
    private readonly room: HostRoom,
    readonly world: World,
    readonly config: MatchConfig,
    readonly matchId: number,
    private readonly startedAt: number
  ) {
    this.map = world.map
    this.vis = config.mode === 'pvp' ? new TeamVisibility(world.map) : null
    this.myTeam = config.players.find((p) => p.id === this.me)?.team ?? 0
    this.fog = new Fog(this.myTeam)
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

  /**
   * A late joiner takes a seat with its own animal, loadout and name (DESIGN §18): the world swaps the seat's
   * character; the seat is human now, and the next step hands it to the joiner (or to a bot until it arrives).
   */
  replace(cfg: PlayerConfig) {
    this.world.replace(cfg.id, cfg)
    this.isBot.set(cfg.id, false)
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
    const v = p ? this.ownScreen(p) : null
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
    if (this.snapAcc >= 1 / SNAPSHOT_RATE - 1e-6 && !this.room.busy && !this.sealing) {
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
    if (this.vis) {
      this.sendSecret(cur, ack)
      return
    }
    const msg: SnapMsg = {
      v: PROTOCOL,
      k: 'snap',
      m: this.matchId,
      over: this.world.over,
      ack,
      view: { ...cur, events: this.snapEvents }
    }
    this.snapEvents = []
    this.stats.snapshots++
    this.room.queueSnapshot(msg)
  }

  /** The sets for the newest view (computed with each snapshot; once before the first). */
  private teamSets(cur: View, events: readonly SimEvent[]): TeamSets {
    const sets = this.vis!.update(cur, events)
    this.sets = sets
    const full = viewForTeam(cur, this.myTeam)
    this.fog.observe(full, this.hiddenFor(full, sets))
    return sets
  }

  private hiddenFor(view: View, sets: TeamSets): Set<string> {
    const known = sets.get(this.myTeam)
    return new Set(view.players.filter((p) => p.team !== this.myTeam && !known?.has(p.id)).map((p) => p.id))
  }

  /** PvP: public part + sealed team parts. Events wait for the next snapshot while there are no keys yet. */
  private sendSecret(cur: View, ack: SnapMsg['ack']) {
    const t0 = performance.now()
    const view = { ...cur, events: this.snapEvents }
    const sets = this.teamSets(cur, this.snapEvents)
    this.stats.rays = this.vis!.rays
    const split = splitView(view, sets, ack, this.config, this.vis!.objects)
    const sealed = this.room.seal(split.parts, this.matchId, cur.tick)
    if (!sealed) return
    this.snapEvents = []
    this.sealing = true
    const over = this.world.over
    sealed
      .then(({ g, s }) => {
        const ms = performance.now() - t0
        this.stats.secretMs += ms
        this.stats.secretMaxMs = Math.max(this.stats.secretMaxMs, ms)
        this.stats.snapshots++
        this.room.queueSnapshot({
          v: PROTOCOL,
          k: 'snap',
          m: this.matchId,
          over,
          ack: {},
          view: split.pub,
          r: split.roster,
          g,
          s
        })
      })
      .catch((err) => console.warn('[anima-front] could not seal a snapshot', err))
      .finally(() => {
        this.sealing = false
      })
  }

  /** PvP: the host's screen shows what its team knows (sonar for its team, unseen enemies hidden and faded). */
  private ownScreen(v: View): View {
    if (!this.vis) return v
    const latest = this.smooth.latest
    if (!this.sets && latest) this.teamSets(latest, [])
    if (!this.sets) return v
    const known = this.sets.get(this.myTeam) ?? new Set<string>()
    const team = viewForTeam(v, this.myTeam)
    const hidden = this.hiddenFor(team, this.sets)
    const shown = hideUnknown(team, this.myTeam, known, this.fog)
    const objects = this.vis.objects
    const mapProps = mapPropsOf(v, objects)
    const own = teamObjects(v, this.myTeam, known, mapProps, objects)
    const events: SimEvent[] = []
    for (const e of v.events) {
      const x = isPublicEvent(e, mapProps) ? e : eventForTeam(e, known, own.scope)
      if (x) events.push(x)
    }
    return {
      ...this.fog.present(shown, hidden, v.time),
      shots: shotsForTeam(v, this.myTeam, known),
      props: [...v.props.filter((r) => r.owner === undefined), ...own.props].sort((a, b) => a.id - b.id),
      shards: own.shards,
      events
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    if (this.world.over) {
      // Let the guests see the final state before the room goes back to the lobby.
      this.snapAcc = 1
      if (!this.room.busy && !this.sealing) this.sendSnapshot()
    }
    this.room.endMatch(this)
  }
}
