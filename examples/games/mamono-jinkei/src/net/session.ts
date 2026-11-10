/**
 * Play sessions (DESIGN §13). Every screen above this layer sees the same surface:
 *
 * - solo / demo: a local World stepped at 60 Hz, no network.
 * - host: a local World plus CooperativeNetwork; presence → world.setPlayers (host first), validated guest inputs →
 *   world.setInput, world.view() broadcast at 20 Hz with at most one send in flight.
 * - guest: snapshots buffered and interpolated ~0.1 s behind the host clock; the own hero is predicted with
 *   createPredictor and reported in NetInput at 30 Hz.
 *
 * Hidden tabs (liveness.ts): a hidden host keeps stepping from a worker pulse (`background`), a guest that stops
 * hearing the host waits (never a fatal error), and a guest's input that stops arriving is let go on the host.
 */
import { getPrimaryRelayUrl } from '../../../../../utils/relayPresets'
import { CooperativeNetwork } from '../../../rabbiters/src/network'
import {
  createPredictor,
  createWorld,
  stageInfo,
  type Command,
  type HeroPredictor,
  type Progress,
  type World
} from '../sim/api'
import type { EventView, HeroReport, InputState, NetInput, StageInfo, View } from '../sim/types'
import type { Job, StageId } from '../vocab'
import { EventQueue, RENDER_DELAY, SnapshotBuffer } from './interp'
import { BACKGROUND_BACKLOG, FRAME_BACKLOG, FixedStep, HOST_STALL, INPUT_EXPIRY, STEP, neutralInput } from './liveness'
import { looksLikeView, validateNetInput } from './validate'

export const APP_ID = 'mamono-jinkei-v1'
const SNAPSHOT_INTERVAL = 1 / 20
const INPUT_INTERVAL = 1 / 30

export type Role = 'solo' | 'host' | 'guest' | 'demo'

export type StatusKind = 'local' | 'connecting' | 'waiting' | 'ready' | 'spectating' | 'error'

export interface SessionStatus {
  kind: StatusKind
  /** Japanese status line for the HUD / error dialog. */
  text: string
}

export interface Session {
  readonly role: Role
  readonly myId: string
  readonly world?: World
  status: SessionStatus
  /** Static stage info of the stage being shown (rebuilt on stage changes). */
  info?: StageInfo
  /** Latest authoritative view (host world or newest snapshot). */
  latest(): View | undefined
  /** Advances the session by dt seconds and returns the view to draw now. */
  frame(dt: number, input: InputState, extra: SessionExtra): View | undefined
  /** Events whose time has come (each id once). */
  takeEvents(out: EventView[]): EventView[]
  /** Host/solo commands (guests' commands are ignored by the world). */
  command(c: Command): void
  /** Number of humans connected (including me). */
  humans(): number
  /** Guest: seconds since the host's last snapshot (0 while it is live). */
  hostSilence?(): number
  /** Guest: reports my input with everything let go at once (tab hidden or unfocused). */
  sendNeutral?(input: InputState, extra: SessionExtra): void
  /** Guest: the tab is visible again; events that piled up while it was hidden are skipped. */
  resume?(): void
  dispose(): void
}

export interface SessionExtra {
  /** Solo pauses the world while the menu is open. */
  paused: boolean
  job?: Job
  name: string
  menu: boolean
  /** Host tab hidden: stepped from the background clock, with a longer catch-up backlog. */
  background?: boolean
}

export interface SessionCallbacks {
  onStatus(status: SessionStatus): void
}

const localId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`

/** Solo, demo and the host's own world. */
class LocalSession implements Session {
  readonly world: World
  status: SessionStatus = { kind: 'local', text: '' }
  info?: StageInfo
  private view?: View
  private readonly stepper = new FixedStep(STEP)
  /** Session seconds (host input expiry). */
  private clock = 0
  /** Guests' latest inputs and when they arrived; `stale` once let go after INPUT_EXPIRY. */
  private guests = new Map<string, { input: NetInput; at: number; stale: boolean }>()
  private readonly queue = new EventQueue<EventView>()
  private infoStage?: StageId
  network?: CooperativeNetwork
  /** Set by dispose(): network reports after this are ignored. */
  disposed = false
  private names = new Map<string, string>()
  private presence: string[] = []
  private sendAcc = 0
  private inFlight = false
  private name = ''

  constructor(
    readonly role: Role,
    readonly myId: string,
    options: { seed: number; progress: Progress; stage?: StageId; skipIntro?: boolean },
    name: string
  ) {
    this.world = createWorld(options)
    this.name = name
    this.presence = [myId]
    this.syncPlayers()
    this.view = this.world.view()
    this.refreshInfo()
  }

  private refreshInfo() {
    const v = this.view
    if (!v || v.stage === this.infoStage) return
    try {
      this.info = stageInfo(v.stage)
      this.infoStage = v.stage
    } catch {
      this.info = undefined
    }
  }

  latest() {
    return this.view
  }

  humans() {
    return this.presence.length
  }

  /** Host: the humans present changed (presence ids from the network). */
  setPresence(ids: readonly string[]) {
    const others = ids.filter((id) => id !== this.myId)
    this.presence = [this.myId, ...others]
    this.syncPlayers()
  }

  private syncPlayers() {
    // Players who chose no name get プレイヤー1…4 by join order.
    this.world.setPlayers(
      this.presence.map((id, i) => ({
        id,
        name: (id === this.myId ? this.name : this.names.get(id)) || `プレイヤー${i + 1}`
      }))
    )
  }

  /** Host: a guest's (already validated) input. */
  guestInput(id: string, input: NetInput) {
    if (id === this.myId || !this.presence.includes(id)) return
    if (input.name && this.names.get(id) !== input.name) this.names.set(id, input.name)
    this.guests.set(id, { input, at: this.clock, stale: false })
    this.world.setInput(id, input)
  }

  /** A guest whose inputs stopped (hidden tab, lost connection) lets go of everything; its counters stay. */
  private expireGuests() {
    for (const [id, g] of this.guests) {
      if (!this.presence.includes(id)) this.guests.delete(id)
      else if (!g.stale && this.clock - g.at > INPUT_EXPIRY) {
        g.stale = true
        this.world.setInput(id, neutralInput(g.input))
      }
    }
  }

  frame(dt: number, input: InputState, extra: SessionExtra): View | undefined {
    if ((extra.name ?? '') !== this.name) {
      this.name = extra.name ?? ''
      this.syncPlayers()
    }
    const net: NetInput = { ...input, menu: extra.menu, name: extra.name || undefined }
    if (extra.job) net.job = extra.job
    this.world.setInput(this.myId, net)
    this.clock += dt
    if (this.guests.size) this.expireGuests()
    if (!extra.paused) {
      const steps = this.stepper.advance(dt, extra.background ? BACKGROUND_BACKLOG : FRAME_BACKLOG)
      for (let i = 0; i < steps; i++) this.world.step(STEP)
    }
    this.view = this.world.view()
    this.refreshInfo()
    this.queue.add(this.view.events)
    if (this.network && this.status.kind === 'ready') {
      this.sendAcc += dt
      if (this.sendAcc >= SNAPSHOT_INTERVAL && !this.inFlight) {
        this.sendAcc = 0
        this.inFlight = true
        const net = this.network
        net
          .broadcastSnapshot(this.view)
          .catch(() => undefined)
          .finally(() => (this.inFlight = false))
      }
    }
    return this.view
  }

  takeEvents(out: EventView[]) {
    return this.queue.take(this.view?.t ?? 0, out)
  }

  command(c: Command) {
    this.world.command(this.myId, c)
  }

  dispose() {
    this.disposed = true
    void this.network?.stop().catch(() => undefined)
    this.network = undefined
  }
}

/** A guest: renders interpolated host snapshots and predicts its own hero. */
class GuestSession implements Session {
  readonly role = 'guest' as const
  status: SessionStatus = { kind: 'connecting', text: 'リレーに接続中…' }
  info?: StageInfo
  network?: CooperativeNetwork
  /** Set by dispose(): network reports after this are ignored. */
  disposed = false
  private readonly buffer = new SnapshotBuffer()
  private readonly queue = new EventQueue<EventView>()
  private predictor?: HeroPredictor
  private infoStage?: StageId
  private sendAcc = 0
  private inFlight = false
  private lastSnapshotAt = -1
  private stalled = false
  private clock = 0
  private renderT = 0
  private presence = 1

  constructor(
    readonly myId: string,
    private readonly callbacks: SessionCallbacks
  ) {}

  latest() {
    return this.buffer.latest
  }

  humans() {
    return this.presence
  }

  setPresence(ids: readonly string[]) {
    this.presence = ids.length
  }

  snapshot(raw: unknown) {
    if (!looksLikeView(raw)) return
    const now = this.clock
    if (!this.buffer.push(raw, now)) return
    this.lastSnapshotAt = now
    this.stalled = false
    if (raw.stage !== this.infoStage) {
      try {
        this.info = stageInfo(raw.stage)
        this.infoStage = raw.stage
        this.predictor = createPredictor(this.info, this.myId)
      } catch {
        this.info = undefined
        this.predictor = undefined
      }
    }
    // Late joiners skip the backlog older than a second.
    this.queue.add(raw.events, raw.t - 1)
    this.updateStatus(raw)
  }

  private updateStatus(v: View) {
    if (this.status.kind === 'error' || this.disposed) return
    const i = v.players.findIndex((p) => p.id === this.myId)
    const me = v.players[i]
    const full = (me?.spectator ?? false) || (v.phase === 'lobby' && i >= 4)
    const kind: StatusKind = full ? 'spectating' : 'ready'
    if (this.status.kind !== kind || (kind === 'ready' && this.status.text !== 'オンライン')) {
      this.status = { kind, text: full ? '満員のため観戦中' : 'オンライン' }
      this.callbacks.onStatus(this.status)
    }
  }

  frame(dt: number, input: InputState, extra: SessionExtra): View | undefined {
    this.clock += dt
    const latest = this.buffer.latest
    if (!latest) return undefined
    // A quiet host (hidden tab, network hiccup) is waited for; snapshot() resumes. Real departures arrive as errors.
    if (!this.stalled && this.silence() > HOST_STALL && this.status.kind !== 'error') {
      this.stalled = true
      this.status = { kind: 'waiting', text: 'ホストを待っています…' }
      this.callbacks.onStatus(this.status)
    }
    // Sub-step the prediction so slow frames still move the hero at full speed.
    let report: HeroReport | undefined
    let left = Math.min(dt, 0.1)
    do {
      const step = Math.min(left, 1 / 60)
      report = this.predictor?.update(latest, input, step)
      left -= step
    } while (left > 1e-4)
    this.sendAcc += dt
    if (this.network && this.sendAcc >= INPUT_INTERVAL && !this.inFlight) {
      const net: NetInput = { ...input, name: extra.name || undefined, menu: extra.menu }
      if (report) net.hero = report
      if (extra.job) net.job = extra.job
      this.send(net)
    }
    this.renderT = this.buffer.hostTime(this.clock) - RENDER_DELAY
    const v = this.buffer.sample(this.renderT)
    if (!v) return undefined
    const p = this.predictor?.current()
    if (!p || v.phase !== 'play') return v
    // Draw the predicted copy of my hero instead of the delayed snapshot.
    return {
      ...v,
      heroes: v.heroes.map((h) =>
        h.slot === p.slot && h.state !== 'tech' ? { ...h, x: p.x, y: p.y, z: p.z, facing: p.facing } : h
      )
    }
  }

  private silence() {
    return this.lastSnapshotAt >= 0 ? this.clock - this.lastSnapshotAt : 0
  }

  hostSilence() {
    return this.stalled ? this.silence() : 0
  }

  sendNeutral(input: InputState, extra: SessionExtra) {
    if (!this.network) return
    const net: NetInput = neutralInput({ ...input, name: extra.name || undefined, menu: extra.menu })
    this.send(net)
  }

  private send(net: NetInput) {
    if (!this.network) return
    this.sendAcc = 0
    this.inFlight = true
    this.network
      .sendInput(net)
      .catch(() => undefined)
      .finally(() => (this.inFlight = false))
  }

  takeEvents(out: EventView[]) {
    return this.queue.take(this.renderT, out)
  }

  /**
   * Back from a hidden tab: snapshots kept arriving while no frame ran, so their effects and sounds would all fire
   * at once. They are dropped (as a hidden host drops its own); the state comes from the newest snapshot as usual.
   */
  resume() {
    const latest = this.buffer.latest
    if (latest) this.queue.skipBefore(latest.t - RENDER_DELAY)
  }

  command() {
    // Guests cannot command the world.
  }

  dispose() {
    this.disposed = true
    void this.network?.stop().catch(() => undefined)
    this.network = undefined
  }
}

/** Solo play; `stage` starts that stage directly (dev/test), skipping the lobby and the release gate. */
export function soloSession(progress: Progress, name: string, stage?: StageId): Session {
  return new LocalSession('solo', localId('solo'), { seed: (Math.random() * 2 ** 31) | 0, progress, stage }, name)
}

/** The attract-mode world behind the title (stage 1, already playing). */
export function demoSession(stage: StageId = 'meadow'): Session & { world: World } {
  return new LocalSession(
    'demo',
    'demo-player',
    { seed: 20240607, progress: { cleared: [] }, stage, skipIntro: true },
    'demo'
  ) as Session & { world: World }
}

/**
 * Errors raised while a connection is torn down ("Relay cleanup failed", "The session is closed"): they follow the
 * real cause (or our own leave) and never describe what went wrong.
 */
export function isCleanupError(message: string): boolean {
  return /cleanup failed|session is closed|network is not active/i.test(message)
}

export function translateError(message: string): string {
  if (isCleanupError(message)) return 'ルームとの接続が切れました。'
  if (/full/i.test(message)) return 'ルームが満員のため参加できませんでした。'
  if (/host left|host stopped|withdrawn|peer track ended: host/i.test(message)) return 'ホストがルームを閉じました。'
  if (/timeout|タイムアウト/i.test(message)) return 'リレーに接続できませんでした（タイムアウト）。'
  if (/relay|connect|fetch|network|webtransport/i.test(message))
    return 'リレーに接続できませんでした。通信環境を確認してください。'
  return `通信エラーが起きました。（${message.slice(0, 80)}）`
}

/**
 * Network status → session status, reported once per failure: the first error names the cause; anything after it
 * (cleanup errors of the same disconnect, a second report) and anything after dispose() is ignored.
 */
function statusReporter(s: { status: SessionStatus; disposed: boolean }, cb: SessionCallbacks) {
  let failed = ''
  return {
    get failed() {
      return failed
    },
    /** Returns false when the status was ignored. */
    report(next: SessionStatus | undefined, message = ''): boolean {
      if (!next || s.disposed || s.status.kind === 'error') return false
      if (next.kind === 'error') failed = message
      s.status = next
      cb.onStatus(next)
      return true
    }
  }
}

async function startWithTimeout(network: CooperativeNetwork, ms = 15000) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      network.start(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Creates a hosted room; resolves once the relay accepted it. */
export async function hostSession(
  room: string,
  progress: Progress,
  name: string,
  cb: SessionCallbacks
): Promise<Session> {
  const id = crypto.randomUUID()
  const s = new LocalSession('host', id, { seed: (Math.random() * 2 ** 31) | 0, progress }, name)
  s.status = { kind: 'connecting', text: 'リレーに接続中…' }
  const reporter = statusReporter(s, cb)
  const network = new CooperativeNetwork({
    app: APP_ID,
    relayUrl: getPrimaryRelayUrl('https://relay.moqt.research.skyway.io'),
    room,
    role: 'host',
    playerId: id,
    onInput: (pid, raw) => {
      const input = validateNetInput(raw)
      if (input) s.guestInput(pid, input)
    },
    onSnapshot: () => undefined,
    onPresence: (ids) => s.setPresence(ids),
    onStatus: (status, message) =>
      reporter.report(
        status === 'ready'
          ? { kind: 'ready', text: `ルーム ${room}` }
          : status === 'error'
            ? { kind: 'error', text: translateError(message) }
            : undefined,
        message
      )
  })
  s.network = network
  try {
    await startWithTimeout(network)
  } catch (e) {
    s.dispose()
    throw new Error(translateError(reporter.failed || String(e)))
  }
  if (s.status.kind === 'connecting') s.status = { kind: 'ready', text: `ルーム ${room}` }
  return s
}

/** Joins a room as a guest; resolves once connected to the relay (the host may still be absent). */
export async function guestSession(room: string, cb: SessionCallbacks): Promise<Session> {
  const id = crypto.randomUUID()
  const s = new GuestSession(id, cb)
  const reporter = statusReporter(s, cb)
  const network = new CooperativeNetwork({
    app: APP_ID,
    relayUrl: getPrimaryRelayUrl('https://relay.moqt.research.skyway.io'),
    room,
    role: 'guest',
    playerId: id,
    onInput: () => undefined,
    onSnapshot: (raw) => s.snapshot(raw),
    onPresence: (ids) => s.setPresence(ids),
    onStatus: (status, message) =>
      reporter.report(
        status === 'waiting-for-host'
          ? { kind: 'waiting', text: 'ホストをさがしています…' }
          : status === 'ready' && s.status.kind !== 'spectating'
            ? { kind: 'ready', text: 'オンライン' }
            : status === 'error'
              ? { kind: 'error', text: translateError(message) }
              : undefined,
        message
      )
  })
  s.network = network
  try {
    await startWithTimeout(network)
  } catch (e) {
    s.dispose()
    throw new Error(translateError(reporter.failed || String(e)))
  }
  return s
}
