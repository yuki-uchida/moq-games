/**
 * Network sessions over a fake CooperativeNetwork: one error report per failure (the cause, not the cleanup noise
 * that follows it), nothing after dispose, and a guest back from a hidden tab skipping the events that piled up.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { EventQueue } from '../src/net/interp'
import {
  guestSession,
  hostSession,
  isCleanupError,
  soloSession,
  translateError,
  type SessionStatus
} from '../src/net/session'
import { NO_INPUT, type EventView, type View } from '../src/sim/types'

type Status = 'connecting' | 'ready' | 'waiting-for-host' | 'error' | 'stopped'
type FakeOptions = {
  role: 'host' | 'guest'
  onStatus(status: Status, message: string): void
  onSnapshot(raw: unknown): void
  onPresence(ids: string[]): void
}

const { nets, FakeNetwork } = vi.hoisted(() => {
  const nets: InstanceType<typeof FakeNetwork>[] = []
  class FakeNetwork {
    stopped = false
    constructor(readonly options: FakeOptions) {
      nets.push(this)
    }
    async start() {
      this.options.onStatus('connecting', 'Connecting to MoQ relay')
      this.options.onStatus(
        this.options.role === 'host' ? 'ready' : 'waiting-for-host',
        this.options.role === 'host' ? 'Hosting room' : 'Waiting for host presence'
      )
    }
    async sendInput() {}
    async broadcastSnapshot() {}
    async stop() {
      this.stopped = true
    }
    /** What the shared network reports when the host leaves a real relay: the cause, then its failed cleanup. */
    hostLeft() {
      this.options.onStatus('error', 'Error: Host left the room. Create a new connection to retry.')
      this.options.onStatus('error', 'Relay cleanup failed. Reload before reconnecting.')
    }
  }
  return { nets, FakeNetwork }
})

vi.mock('../../rabbiters/src/network', () => ({ CooperativeNetwork: FakeNetwork }))
vi.mock('../../../../utils/relayPresets', () => ({ getPrimaryRelayUrl: (url: string) => url }))

beforeEach(() => {
  nets.length = 0
})

const errorsOf = (seen: SessionStatus[]) => seen.filter((s) => s.kind === 'error')

describe('connection errors', () => {
  test('host leaving: the guest reports exactly one error, naming the host, not the relay', async () => {
    const seen: SessionStatus[] = []
    const s = await guestSession('room-a', { onStatus: (st) => seen.push(st) })
    nets[0].hostLeft()
    expect(errorsOf(seen)).toEqual([{ kind: 'error', text: 'ホストがルームを閉じました。' }])
    expect(s.status).toEqual({ kind: 'error', text: 'ホストがルームを閉じました。' })
    // A later status (a late "ready", another error) cannot replace the cause.
    nets[0].options.onStatus('ready', 'Connected to host')
    nets[0].options.onStatus('error', 'Error: Relay disconnected. Create a new connection to retry.')
    expect(errorsOf(seen)).toHaveLength(1)
    expect(seen.at(-1)?.text).toBe('ホストがルームを閉じました。')
    s.dispose()
  })

  test('a peer track that ends for the host also reads as the host leaving', () => {
    expect(translateError('Error: Peer track ended: host. Create a new connection to retry.')).toBe(
      'ホストがルームを閉じました。'
    )
  })

  test('a genuine relay failure keeps its own message; its cleanup error is not a second one', async () => {
    const seen: SessionStatus[] = []
    await hostSession('room-b', { cleared: [] }, 'ほすと', { onStatus: (st) => seen.push(st) })
    nets[0].options.onStatus('error', 'Error: Relay disconnected. Create a new connection to retry.')
    nets[0].options.onStatus('error', 'Relay cleanup failed. Reload before reconnecting.')
    expect(errorsOf(seen)).toEqual([
      { kind: 'error', text: 'リレーに接続できませんでした。通信環境を確認してください。' }
    ])
  })

  test('after leaving (dispose), cleanup errors of our own disconnect are never reported', async () => {
    for (const start of [
      (cb: { onStatus(st: SessionStatus): void }) => guestSession('room-c', cb),
      (cb: { onStatus(st: SessionStatus): void }) => hostSession('room-c', { cleared: [] }, '', cb)
    ]) {
      nets.length = 0
      const seen: SessionStatus[] = []
      const s = await start({ onStatus: (st) => seen.push(st) })
      s.dispose()
      expect(nets[0].stopped).toBe(true)
      nets[0].options.onStatus('error', 'Relay cleanup failed. Reload before reconnecting.')
      nets[0].options.onStatus('error', 'WebTransportError: The session is closed.')
      expect(errorsOf(seen)).toEqual([])
    }
  })

  test('cleanup errors never blame the relay connection', () => {
    for (const m of ['Relay cleanup failed. Reload before reconnecting.', 'Error: The session is closed']) {
      expect(isCleanupError(m)).toBe(true)
      expect(translateError(m)).not.toMatch(/リレー/)
    }
    expect(isCleanupError('Error: Host left the room')).toBe(false)
  })
})

describe('guest back from a hidden tab', () => {
  /** A real host view with `count` sound events spread over the second before `t`. */
  function viewAt(base: View, seq: number, t: number, events: EventView[]): View {
    return { ...base, seq, t, events }
  }

  test('events that arrived while hidden are skipped; the newest state and later events still play', async () => {
    const host = soloSession({ cleared: [] }, 'ほすと')
    const base = host.frame(1 / 60, { ...NO_INPUT }, { paused: false, name: '', menu: false })!
    const s = await guestSession('room-d', { onStatus: () => undefined })
    const net = nets[0]
    const input = { ...NO_INPUT }
    const extra = { paused: false, name: '', menu: false }
    let id = 0
    const sfx = (t: number): EventView => ({ id: ++id, t, k: 'sfx', x: 0, y: 0, s: 'gem' })
    // Visible: a snapshot plays its events normally.
    net.options.onSnapshot(viewAt(base, 1, 10, [sfx(9.95)]))
    for (let i = 0; i < 12; i++) s.frame(1 / 60, input, extra)
    expect(s.takeEvents([])).toHaveLength(1)
    // Hidden for 20 s: no frames run, but 400 snapshots (two events each) keep arriving.
    for (let k = 1; k <= 400; k++)
      net.options.onSnapshot(viewAt(base, 1 + k, 10 + k / 20, [sfx(10 + k / 20 - 0.01), sfx(10 + k / 20)]))
    s.resume?.()
    // Only the last ~0.1 s of the 800 piled-up events can still play (they are "now"), plus later ones when due.
    const played: EventView[] = []
    s.frame(1 / 60, input, extra)
    played.push(...s.takeEvents([]))
    expect(s.latest()?.t).toBe(30)
    const last = sfx(30.04)
    net.options.onSnapshot(viewAt(base, 402, 30.05, [last]))
    for (let i = 0; i < 20; i++) {
      s.frame(1 / 60, input, extra)
      played.push(...s.takeEvents([]))
    }
    expect(played.length).toBeLessThanOrEqual(6)
    expect(played.every((e) => e.t >= 29.9)).toBe(true)
    expect(played.at(-1)?.id).toBe(last.id)
    s.dispose()
  })

  test('EventQueue.skipBefore drops older pending events for good', () => {
    const q = new EventQueue<{ id: number; t: number }>()
    q.add([
      { id: 1, t: 1 },
      { id: 2, t: 2 },
      { id: 3, t: 3 }
    ])
    q.skipBefore(2.5)
    q.add([
      { id: 1, t: 1 },
      { id: 2, t: 2 },
      { id: 3, t: 3 },
      { id: 4, t: 4 }
    ])
    expect(q.take(10, []).map((e) => e.id)).toEqual([3, 4])
  })
})
