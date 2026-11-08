/**
 * Play sessions (DESIGN §13). Every screen above this layer sees the same surface:
 *
 * - solo / demo: a local World stepped at 60 Hz, no network.
 * - host: a local World plus CooperativeNetwork; presence → world.setPlayers (host first), validated guest inputs →
 *   world.setInput, world.view() broadcast at 20 Hz with at most one send in flight.
 * - guest: snapshots buffered and interpolated ~0.1 s behind the host clock; the own hero is predicted with
 *   createPredictor and reported in NetInput at 30 Hz.
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
import { looksLikeView, validateNetInput } from './validate'

export const APP_ID = 'mamono-jinkei-v1'
const DT = 1 / 60
const SNAPSHOT_INTERVAL = 1 / 20
const INPUT_INTERVAL = 1 / 30
const HOST_SILENCE = 8

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
  dispose(): void
}

export interface SessionExtra {
  /** Solo pauses the world while the menu is open. */
  paused: boolean
  job?: Job
  name: string
  menu: boolean
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
  private acc = 0
  private readonly queue = new EventQueue<EventView>()
  private infoStage?: StageId
  network?: CooperativeNetwork
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
    this.world.setPlayers([{ id: myId, name }])
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
    this.world.setPlayers(
      this.presence.map((id) => ({ id, name: id === this.myId ? this.name : (this.names.get(id) ?? 'なかま') }))
    )
  }

  /** Host: a guest's (already validated) input. */
  guestInput(id: string, input: NetInput) {
    if (id === this.myId || !this.presence.includes(id)) return
    if (input.name && this.names.get(id) !== input.name) this.names.set(id, input.name)
    this.world.setInput(id, input)
  }

  frame(dt: number, input: InputState, extra: SessionExtra): View | undefined {
    if (extra.name && extra.name !== this.name) {
      this.name = extra.name
      this.syncPlayers()
    }
    const net: NetInput = { ...input, menu: extra.menu, name: extra.name || undefined }
    if (extra.job) net.job = extra.job
    this.world.setInput(this.myId, net)
    if (!extra.paused) {
      this.acc = Math.min(this.acc + dt, DT * 6)
      while (this.acc >= DT) {
        this.world.step(DT)
        this.acc -= DT
      }
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
  private readonly buffer = new SnapshotBuffer()
  private readonly queue = new EventQueue<EventView>()
  private predictor?: HeroPredictor
  private infoStage?: StageId
  private sendAcc = 0
  private inFlight = false
  private lastSnapshotAt = -1
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
    if (this.lastSnapshotAt >= 0 && this.clock - this.lastSnapshotAt > HOST_SILENCE && this.status.kind !== 'error') {
      this.status = { kind: 'error', text: 'ホストとの通信がとだえました。' }
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
      this.sendAcc = 0
      const net: NetInput = { ...input, name: extra.name || undefined, menu: extra.menu }
      if (report) net.hero = report
      if (extra.job) net.job = extra.job
      this.inFlight = true
      this.network
        .sendInput(net)
        .catch(() => undefined)
        .finally(() => (this.inFlight = false))
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

  takeEvents(out: EventView[]) {
    return this.queue.take(this.renderT, out)
  }

  command() {
    // Guests cannot command the world.
  }

  dispose() {
    void this.network?.stop().catch(() => undefined)
    this.network = undefined
  }
}

export function soloSession(progress: Progress, name: string): Session {
  return new LocalSession('solo', localId('solo'), { seed: (Math.random() * 2 ** 31) | 0, progress }, name)
}

/** The attract-mode world behind the title (stage 1, already playing). */
export function demoSession(): Session & { world: World } {
  return new LocalSession(
    'demo',
    'demo-player',
    { seed: 20240607, progress: { cleared: [] }, stage: 'meadow', skipIntro: true },
    'demo'
  ) as Session & { world: World }
}

function translateError(message: string): string {
  if (/full/i.test(message)) return 'ルームが満員のため参加できませんでした。'
  if (/host left|host stopped|withdrawn/i.test(message)) return 'ホストがルームを閉じました。'
  if (/timeout|タイムアウト/i.test(message)) return 'リレーに接続できませんでした（タイムアウト）。'
  if (/relay|connect|fetch|network|webtransport/i.test(message))
    return 'リレーに接続できませんでした。通信環境を確認してください。'
  return `通信エラーが起きました。（${message.slice(0, 80)}）`
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
  let failed = ''
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
    onStatus: (status, message) => {
      if (status === 'ready') s.status = { kind: 'ready', text: `ルーム ${room}` }
      else if (status === 'error') {
        failed = message
        s.status = { kind: 'error', text: translateError(message) }
      } else return
      cb.onStatus(s.status)
    }
  })
  s.network = network
  try {
    await startWithTimeout(network)
  } catch (e) {
    s.dispose()
    throw new Error(translateError(failed || String(e)))
  }
  if (s.status.kind === 'connecting') s.status = { kind: 'ready', text: `ルーム ${room}` }
  return s
}

/** Joins a room as a guest; resolves once connected to the relay (the host may still be absent). */
export async function guestSession(room: string, cb: SessionCallbacks): Promise<Session> {
  const id = crypto.randomUUID()
  const s = new GuestSession(id, cb)
  let failed = ''
  const network = new CooperativeNetwork({
    app: APP_ID,
    relayUrl: getPrimaryRelayUrl('https://relay.moqt.research.skyway.io'),
    room,
    role: 'guest',
    playerId: id,
    onInput: () => undefined,
    onSnapshot: (raw) => s.snapshot(raw),
    onPresence: (ids) => s.setPresence(ids),
    onStatus: (status, message) => {
      if (status === 'waiting-for-host') s.status = { kind: 'waiting', text: 'ホストをさがしています…' }
      else if (status === 'ready' && s.status.kind !== 'spectating') s.status = { kind: 'ready', text: 'オンライン' }
      else if (status === 'error') {
        failed = message
        s.status = { kind: 'error', text: translateError(message) }
      } else return
      cb.onStatus(s.status)
    }
  })
  s.network = network
  try {
    await startWithTimeout(network)
  } catch (e) {
    s.dispose()
    throw new Error(translateError(failed || String(e)))
  }
  return s
}
