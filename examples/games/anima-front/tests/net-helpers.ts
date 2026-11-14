/**
 * In-memory stand-in for CooperativeNetwork (rabbiters/src/network.ts) for the net tests: one hub per room,
 * messages JSON-cloned and delivered after `latency` ms through (fake) timers, presence like the real host
 * (hello → admitted), the host leaving reported to guests as an error, and a byte counter per message.
 */
import { setTimeout as realTimeout } from 'node:timers'
import { deflateRawSync } from 'node:zlib'
import { vi } from 'vitest'
import { createOnlineLobbyProvider } from '../src/app/online'
import type { LobbyProvider, LocalChoice } from '../src/app/lobby'
import type { NetTransport, TransportFactory, TransportOptions } from '../src/net/protocol'
import { sealingBusy, sealingIdle } from '../src/net/seal'
import { makeLoadout } from '../src/data/loadout'
import type { SpeciesId } from '../src/data/species'

export interface HubStats {
  snapshots: number
  maxSnapshotBytes: number
  maxSnapshotJson: number
  inputs: number
  /** Most guest messages ever on their way at once from one guest (must stay 1: see GuestRoom.sendInput). */
  maxGuestInFlight: number
}

interface Peer {
  o: TransportOptions
  started: boolean
  stopped: boolean
}

export class FakeHub {
  latency = 20
  /** Extra random delay per message (ms); a channel never reorders (like one relay track). */
  jitter = 0
  private readonly lanes = new Map<string, number>()
  private rand = 12345
  readonly rooms = new Map<string, { host?: Peer; guests: Map<string, Peer>; admitted: Set<string> }>()
  readonly stats: HubStats = { snapshots: 0, maxSnapshotBytes: 0, maxSnapshotJson: 0, inputs: 0, maxGuestInFlight: 0 }
  private readonly inFlight = new Map<string, number>()
  /** Drops guest → host messages while true (a frozen guest). */
  muted = new Set<string>()
  /** Fails the relay connection while true. */
  unreachable = false
  /** Guests (by id) whose admission (the host's presence naming them) never arrives, like a lost relay group. */
  readonly lostAdmission = new Set<string>()
  /** The next guest to connect loses its admission. */
  loseNextAdmission = false

  private room(code: string) {
    let r = this.rooms.get(code)
    if (!r) {
      r = { guests: new Map(), admitted: new Set() }
      this.rooms.set(code, r)
    }
    return r
  }

  private later(fn: () => void, lane = '') {
    this.rand = (this.rand * 1103515245 + 12345) & 0x7fffffff
    const now = performance.now()
    const at = Math.max(now + this.latency + (this.rand / 0x7fffffff) * this.jitter, this.lanes.get(lane) ?? 0)
    this.lanes.set(lane, at)
    setTimeout(fn, at - now)
  }

  readonly factory: TransportFactory = (o) => this.transport(o)

  private presence(code: string) {
    const r = this.room(code)
    if (!r.host || r.host.stopped) return
    const ids = [r.host.o.playerId, ...r.admitted]
    const host = r.host
    this.later(() => host.o.onPresence(ids))
    for (const id of r.admitted) {
      const g = r.guests.get(id)
      if (g && !g.stopped && !this.lostAdmission.has(id)) this.later(() => g.o.onStatus('ready', 'Connected to host'))
    }
  }

  transport(o: TransportOptions): NetTransport {
    const hub = this
    const peer: Peer = { o, started: false, stopped: false }
    return {
      playerId: o.playerId,
      async start() {
        if (hub.unreachable) throw new Error('Failed to connect to relay')
        peer.started = true
        const r = hub.room(o.room)
        if (o.role === 'host') {
          r.host = peer
          for (const id of r.guests.keys()) r.admitted.add(id)
          hub.presence(o.room)
        } else {
          r.guests.set(o.playerId, peer)
          if (hub.loseNextAdmission) {
            hub.loseNextAdmission = false
            hub.lostAdmission.add(o.playerId)
            // like CooperativeNetwork's admission timer
            setTimeout(() => {
              if (!peer.stopped)
                o.onStatus(
                  'error',
                  'Error: Host did not admit this player; the room may be full. Create a new connection.'
                )
            }, 15_000)
          }
          if (r.host && !r.host.stopped) {
            r.admitted.add(o.playerId)
            hub.presence(o.room)
          }
        }
        o.onStatus(o.role === 'host' ? 'ready' : 'waiting-for-host', 'ok')
      },
      async sendInput(input) {
        if (peer.stopped) throw new Error('Network is not active')
        const r = hub.room(o.room)
        if (o.role === 'host') return
        // Like writeGroup, a send takes a moment to complete.
        const n = (hub.inFlight.get(o.playerId) ?? 0) + 1
        hub.inFlight.set(o.playerId, n)
        hub.stats.maxGuestInFlight = Math.max(hub.stats.maxGuestInFlight, n)
        await new Promise((done) => setTimeout(done, 3))
        hub.inFlight.set(o.playerId, (hub.inFlight.get(o.playerId) ?? 1) - 1)
        if (!r.host || r.host.stopped || !r.admitted.has(o.playerId) || hub.muted.has(o.playerId)) return
        const text = JSON.stringify(input)
        hub.stats.inputs++
        const host = r.host
        hub.later(() => {
          if (!host.stopped && !peer.stopped) host.o.onInput(o.playerId, JSON.parse(text))
        }, `in:${o.playerId}`)
      },
      async broadcastSnapshot(state) {
        if (peer.stopped) throw new Error('Network is not active')
        const text = JSON.stringify({ v: 2, type: 'snapshot', sequence: 0, playerId: o.playerId, data: state })
        const bytes = deflateRawSync(Buffer.from(text)).length
        if (bytes > 64 * 1024) throw new Error('Payload exceeds 64 KiB')
        if ((state as { k?: string }).k === 'snap') {
          hub.stats.snapshots++
          hub.stats.maxSnapshotBytes = Math.max(hub.stats.maxSnapshotBytes, bytes)
          hub.stats.maxSnapshotJson = Math.max(hub.stats.maxSnapshotJson, text.length)
        }
        const r = hub.room(o.room)
        const data = JSON.stringify(state)
        for (const [id, g] of r.guests) {
          if (!r.admitted.has(id) || g.stopped) continue
          hub.later(() => {
            if (!g.stopped && !peer.stopped) g.o.onSnapshot(JSON.parse(data))
          }, `out:${id}`)
        }
      },
      async stop() {
        if (peer.stopped) return
        peer.stopped = true
        const r = hub.room(o.room)
        if (o.role === 'host') {
          for (const [id, g] of r.guests) {
            if (g.stopped || !r.admitted.has(id)) continue
            hub.later(() => {
              if (!g.stopped) g.o.onStatus('error', 'Error: Host left the room. Create a new connection to retry.')
            })
          }
        } else {
          r.guests.delete(o.playerId)
          r.admitted.delete(o.playerId)
          hub.presence(o.room)
        }
      }
    }
  }
}

let peerCounter = 0

/** A lobby provider on the hub with fake-timer friendly clocks. */
export function provider(hub: FakeHub, extra: Parameters<typeof createOnlineLobbyProvider>[0] = {}): LobbyProvider {
  return createOnlineLobbyProvider({
    transport: hub.factory,
    relayUrl: () => 'https://relay.test/anon',
    now: () => performance.now() / 1000,
    peerId: () => `peer${++peerCounter}`,
    skipFeatureCheck: true,
    timeoutMs: 5000,
    ...extra
  })
}

export function choice(name: string, species: SpeciesId = 'shiba', team?: 0 | 1 | 2): LocalChoice {
  const c: LocalChoice = {
    name,
    species,
    loadout: makeLoadout(['bee', 'orca'], ['frog'], ['koala']),
    loadoutName: 'テスト編成'
  }
  if (team !== undefined) c.team = team
  return c
}

/**
 * WebCrypto and the compression streams (src/net/seal.ts) run in real time while the tests step fake time. Before
 * the next frame, the sealing work started so far, and what its results start next, is let finish, so a slow
 * machine plays the same frames as a fast one. (The real clock only caps a wait that never ends.)
 */
export async function drainSealing() {
  for (let round = 0; round < 100 && sealingBusy(); round++) {
    await Promise.race([sealingIdle(), new Promise((resolve) => realTimeout(resolve, 2000))])
    for (let i = 0; i < 8; i++) await Promise.resolve()
  }
}

/** Advances fake time in small frames (sealing work finishes within its frame, see drainSealing). */
export async function run(ms: number, frame?: () => void, step = 1000 / 60) {
  for (let t = 0; t < ms; t += step) {
    await vi.advanceTimersByTimeAsync(step)
    await drainSealing()
    frame?.()
    await drainSealing()
  }
}

/** Advances fake time until the promise settles (at most `limit` ms). */
export async function settle<T>(promise: Promise<T>, limit = 20_000): Promise<T> {
  let done = false
  const watched = promise.finally(() => {
    done = true
  })
  watched.catch(() => undefined)
  for (let t = 0; t < limit && !done; t += 50) {
    await vi.advanceTimersByTimeAsync(50)
    await drainSealing()
  }
  return watched
}
