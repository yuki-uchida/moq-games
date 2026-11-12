import { afterEach, describe, expect, it, vi } from 'vitest'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import type { NamespaceEvent, ReceivedObject } from 'moq-wasm'
import {
  CooperativeNetwork,
  MAX_MESSAGE_BYTES,
  MAX_PAYLOAD_BYTES,
  MAX_PLAYERS,
  type RabbitersSession
} from '../src/network'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

class Queue<T> implements AsyncIterable<T> {
  readonly done = Promise.resolve(undefined)
  private values: T[] = []
  private waiting?: (value: IteratorResult<T>) => void
  private ended = false
  push(value: T) {
    if (this.ended) return
    if (this.waiting) {
      const waiting = this.waiting
      this.waiting = undefined
      waiting({ value, done: false })
    } else this.values.push(value)
  }
  close = vi.fn(async () => {
    this.ended = true
    this.values = []
    this.waiting?.({ value: undefined, done: true })
    this.waiting = undefined
  });
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.values.length) return Promise.resolve({ value: this.values.shift()!, done: false })
        if (this.ended) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => {
          this.waiting = resolve
        })
      }
    }
  }
}

// Messages are (de)compressed off the main thread: that work ends after some real time, not after a number of
// event-loop turns, and on a busy machine it takes longer. Flushing therefore waits on the real clock between its
// turns (the real setImmediate and setTimeout, which fake timers replace later).
const immediate = setImmediate
const timeout = setTimeout
const flush = async () => {
  for (let turn = 0; turn < 6; turn++) {
    for (let index = 0; index < 80; index++) await Promise.resolve()
    await new Promise((done) => immediate(done))
    await new Promise((done) => timeout(done, 5))
  }
}
const deflated = (text: string) => new Uint8Array(deflateRawSync(text))
/** The JSON message inside a written (deflated) object. */
const message = (payload: Uint8Array) => JSON.parse(new TextDecoder().decode(inflateRawSync(payload)))
afterEach(() => vi.useRealTimers())
const prefix = ['anon', 'rabbiters-v2', 'room']
const packet = (type: string, playerId: string, sequence: number, data: unknown) =>
  new Uint8Array(deflateRawSync(JSON.stringify({ v: 2, type, playerId, sequence, data })))
const object = (payload: Uint8Array): ReceivedObject => ({
  groupId: 0n,
  subgroupId: 0n,
  objectId: 0n,
  objectStatus: undefined,
  objectPayload: payload,
  objectPayloadLength: payload.length,
  locHeader: undefined
})

function mockSession() {
  const closed = deferred<{ code: undefined; reason: string }>()
  const watch = new Queue<NamespaceEvent>()
  const subscribers = new Queue<boolean>()
  const subscription = new Queue<ReceivedObject>()
  const subscriptions: Queue<ReceivedObject>[] = []
  const writer = {
    nextSubscriber: vi.fn(async () => {
      const next = await subscribers[Symbol.asyncIterator]().next()
      return !next.done && next.value
    }),
    writeGroup: vi.fn(async (_payload: Uint8Array): Promise<bigint | undefined> => 0n),
    free: vi.fn()
  }
  const announcement = { close: vi.fn(async () => {}), free: vi.fn() }
  const session = {
    closed: closed.promise,
    close: vi.fn(() => {
      closed.resolve({ code: undefined, reason: 'closed' })
      void subscribers.close()
      void watch.close()
      for (const stream of subscriptions) void stream.close()
    }),
    publishTrack: vi.fn(async () => writer),
    announce: vi.fn(async () => announcement),
    watchNamespaces: vi.fn(async () => watch),
    subscribe: vi.fn(async () => {
      const stream = subscriptions.length ? new Queue<ReceivedObject>() : subscription
      subscriptions.push(stream)
      return stream
    })
  }
  const connect = vi.fn(async () => session as unknown as RabbitersSession)
  return { session, writer, watch, subscribers, subscription, announcement, connect }
}

async function setup(role: 'host' | 'guest' = 'host') {
  const sdk = mockSession()
  const callbacks = { onInput: vi.fn(), onSnapshot: vi.fn(), onPresence: vi.fn(), onStatus: vi.fn() }
  const network = new CooperativeNetwork({
    relayUrl: 'https://relay.test',
    room: 'room',
    role,
    playerId: role === 'host' ? 'alice' : 'bob',
    connect: sdk.connect,
    ...callbacks
  })
  await network.start()
  return { network, ...sdk, ...callbacks }
}

describe('host authoritative cooperative MoQ transport', () => {
  it('exchanges hello, guest input and host state through a forwarding-only relay', async () => {
    const host = await setup()
    const guest = await setup('guest')
    host.writer.writeGroup.mockImplementation(async (payload) => {
      guest.subscription.push(object(payload))
      return 0n
    })
    guest.writer.writeGroup.mockImplementation(async (payload) => {
      host.subscription.push(object(payload))
      return 0n
    })
    host.watch.push({ kind: 'announced', namespace: [...prefix, 'bob'] })
    guest.watch.push({ kind: 'announced', namespace: [...prefix, 'host'] })
    await flush()
    guest.subscribers.push(true)
    host.subscribers.push(true)
    await flush()
    expect(host.onPresence).toHaveBeenLastCalledWith(['alice', 'bob'])
    expect(guest.onPresence).toHaveBeenLastCalledWith(['alice', 'bob'])
    await guest.network.sendInput({ action: 'decoy', direction: [1, 0] })
    await flush()
    expect(host.onInput).toHaveBeenCalledExactlyOnceWith('bob', { action: 'decoy', direction: [1, 0] })
    const state = {
      players: [{ id: 'bob', age: 10, pregnant: true, speed: 0.5 }],
      destroyedNests: ['nest1'],
      victory: 'birth'
    }
    await host.network.broadcastSnapshot(state)
    await flush()
    expect(guest.onSnapshot).toHaveBeenCalledExactlyOnceWith(state)
    expect(host.onSnapshot).not.toHaveBeenCalled()
    await Promise.all([host.network.stop(), guest.network.stop()])
  })

  it('uses official release publishing/discovery and passes no credentials', async () => {
    const host = await setup()
    expect(host.connect).toHaveBeenCalledExactlyOnceWith('https://relay.test')
    expect(host.session.publishTrack).toHaveBeenCalledWith([...prefix, 'host'], 'data', { retentionMs: 0 })
    expect(host.session.announce).toHaveBeenCalledWith([...prefix, 'host'])
    expect(host.session.watchNamespaces).toHaveBeenCalledWith(prefix)
    await host.network.stop()
  })

  it('discovers guests, requires hello, routes inputs by namespace and ignores forged/replayed state', async () => {
    const host = await setup()
    host.watch.push({ kind: 'announced', namespace: [...prefix, 'bob'] })
    await flush()
    expect(host.session.subscribe).toHaveBeenCalledWith([...prefix, 'bob'], 'data', {
      filter: 'nextGroupStart',
      forward: true
    })
    host.subscription.push(object(packet('input', 'bob', 0, { move: 1 })))
    host.subscription.push(object(packet('hello', 'bob', 1, null)))
    host.subscription.push(object(packet('input', 'eve', 2, { move: 2 })))
    host.subscription.push(object(packet('snapshot', 'bob', 3, { won: true })))
    host.subscription.push(object(packet('input', 'bob', 4, { move: 3 })))
    host.subscription.push(object(packet('input', 'bob', 4, { move: 4 })))
    await flush()
    expect(host.onInput).toHaveBeenCalledExactlyOnceWith('bob', { move: 3 })
    expect(host.onSnapshot).not.toHaveBeenCalled()
    expect(host.onPresence).toHaveBeenLastCalledWith(['alice', 'bob'])
    await host.network.sendInput({ move: -1 })
    expect(host.onInput).toHaveBeenLastCalledWith('alice', { move: -1 })
    await host.network.stop()
  })

  it('replays the latest opaque state to late subscribers with no gameplay assumptions', async () => {
    const host = await setup()
    const state = { players: [{ age: 5, food: 8, pregnant: true, speed: 0.5 }], nests: [], birth: { winner: 'bob' } }
    await host.network.broadcastSnapshot(state)
    host.writer.writeGroup.mockClear()
    host.subscribers.push(true)
    await flush()
    const messages = host.writer.writeGroup.mock.calls.map(([payload]) => message(payload))
    expect(messages.map((message) => message.type)).toEqual(['presence', 'snapshot'])
    expect(messages[1].data).toEqual(state)
    await host.network.stop()
  })

  it('guest follows only the host and accepts cached snapshots older than presence sequence', async () => {
    const guest = await setup('guest')
    guest.watch.push({ kind: 'announced', namespace: [...prefix, 'eve'] })
    guest.watch.push({ kind: 'announced', namespace: ['anon', 'rabbiters-v2', 'other', 'host'] })
    guest.watch.push({ kind: 'announced', namespace: [...prefix, 'host'] })
    await flush()
    expect(guest.session.subscribe).toHaveBeenCalledTimes(1)
    guest.subscription.push(object(packet('presence', 'alice', 10, ['alice', 'bob'])))
    guest.subscription.push(object(packet('snapshot', 'alice', 2, { birth: true, goals: undefined })))
    guest.subscription.push(object(packet('input', 'alice', 11, { move: 10 })))
    await flush()
    expect(guest.onSnapshot).toHaveBeenCalledExactlyOnceWith({ birth: true })
    expect(guest.onInput).not.toHaveBeenCalled()
    expect(guest.onStatus).toHaveBeenCalledWith('ready', 'Connected to host')
    await expect(guest.network.broadcastSnapshot({})).rejects.toThrow('Only the host')
    await expect(guest.network.sendInput({ move: 1 })).resolves.toBeUndefined()
    expect(guest.writer.writeGroup).not.toHaveBeenCalled()
    guest.subscribers.push(true)
    await flush()
    await guest.network.sendInput({ move: 1 })
    expect(message(guest.writer.writeGroup.mock.calls.at(-1)![0]).type).toBe('input')
    await guest.network.stop()
  })

  it('ignores malformed, oversized, invalid presence, status and unsafe sequence messages', async () => {
    const guest = await setup('guest')
    guest.watch.push({ kind: 'announced', namespace: [...prefix, 'host'] })
    await flush()
    for (const payload of [
      new Uint8Array([255]),
      new TextEncoder().encode('{"v":2,"sequence":1,"type":"snapshot","playerId":"alice","data":{}}'),
      deflated('{'),
      packet('presence', 'alice', 1, ['alice', 'alice']),
      packet('snapshot', 'alice', Number.MAX_SAFE_INTEGER + 1, {}),
      new Uint8Array(MAX_PAYLOAD_BYTES + 1),
      deflated('null'),
      deflated('{"v":2,"sequence":1,"type":"snapshot","playerId":{},"data":{}}'),
      deflated('{"v":1,"sequence":1,"type":"snapshot","playerId":"alice","data":{}}'),
      // A tiny object that would inflate past the message cap.
      deflated(`{"v":2,"sequence":1,"type":"snapshot","playerId":"alice","data":"${'x'.repeat(MAX_MESSAGE_BYTES)}"}`)
    ])
      guest.subscription.push(object(payload))
    guest.subscription.push({ ...object(packet('snapshot', 'alice', 1, {})), objectStatus: 3 })
    // Inflating the would-be megabyte up to its cap takes a few more turns of the event loop.
    for (let turn = 0; turn < 5; turn++) await flush()
    expect(guest.onSnapshot).not.toHaveBeenCalled()
    expect(guest.onPresence).not.toHaveBeenCalled()
    guest.subscription.push(object(packet('snapshot', 'alice', 1, { safe: true })))
    await flush()
    expect(guest.onSnapshot).toHaveBeenCalledExactlyOnceWith({ safe: true })
    await guest.network.stop()
  })

  it('bounds outbound payloads and send backlog', async () => {
    const host = await setup()
    // Repetitive state deflates far below the wire cap; noise does not.
    await expect(host.network.broadcastSnapshot('x'.repeat(MAX_PAYLOAD_BYTES * 4))).resolves.toBeUndefined()
    const noise = Array.from(crypto.getRandomValues(new Uint8Array(MAX_PAYLOAD_BYTES)), (n) => n.toString(16)).join('')
    await expect(host.network.broadcastSnapshot(noise)).rejects.toThrow('64 KiB')
    await expect(host.network.broadcastSnapshot('x'.repeat(MAX_MESSAGE_BYTES))).rejects.toThrow('1 MiB')
    await expect(host.network.broadcastSnapshot(undefined)).rejects.toThrow('JSON')
    const pending = deferred<bigint>()
    host.writer.writeGroup.mockImplementation(() => pending.promise)
    const sends = Array.from({ length: 32 }, () => host.network.broadcastSnapshot({}))
    await flush()
    await expect(host.network.broadcastSnapshot({})).rejects.toThrow('queue is full')
    pending.resolve(1n)
    await Promise.all(sends)
    await host.network.stop()
  })

  it('deduplicates discovery, caps subscriptions and removes withdrawn players', async () => {
    const host = await setup()
    for (let index = 0; index < MAX_PLAYERS + 5; index++)
      host.watch.push({ kind: 'announced', namespace: [...prefix, `guest${index}`] })
    host.watch.push({ kind: 'announced', namespace: [...prefix, 'guest0'] })
    await flush()
    expect(host.session.subscribe).toHaveBeenCalledTimes(MAX_PLAYERS - 1)
    host.watch.push({ kind: 'withdrawn', namespace: [...prefix, 'guest0'] })
    await flush()
    expect(host.onPresence).not.toHaveBeenCalled()
    await host.network.stop()
  })

  it('keeps the room running when one guest track ends or cannot be subscribed', async () => {
    const host = await setup()
    host.watch.push({ kind: 'announced', namespace: [...prefix, 'bob'] })
    host.watch.push({ kind: 'announced', namespace: [...prefix, 'carol'] })
    await flush()
    const carol = await host.session.subscribe.mock.results[1].value
    host.subscription.push(object(packet('hello', 'bob', 0, null)))
    carol.push(object(packet('hello', 'carol', 0, null)))
    await flush()
    await host.subscription.close()
    await flush()
    expect(host.onPresence).toHaveBeenLastCalledWith(['alice', 'carol'])
    expect(host.session.close).not.toHaveBeenCalled()
    host.session.subscribe.mockImplementationOnce(async () => {
      throw new Error('subscribe failed')
    })
    host.watch.push({ kind: 'announced', namespace: [...prefix, 'dave'] })
    await flush()
    expect(host.onStatus).not.toHaveBeenCalledWith('error', expect.anything())
    await expect(host.network.broadcastSnapshot({ playing: true })).resolves.toBeUndefined()
    await host.network.stop()
  })

  it('does not broadcast repeated hello messages for an existing guest', async () => {
    const host = await setup()
    host.watch.push({ kind: 'announced', namespace: [...prefix, 'bob'] })
    await flush()
    host.subscription.push(object(packet('hello', 'bob', 0, null)))
    await flush()
    const pending = deferred<bigint>()
    host.writer.writeGroup.mockImplementation(() => pending.promise)
    const send = host.network.broadcastSnapshot({})
    for (let sequence = 1; sequence < 40; sequence++)
      host.subscription.push(object(packet('hello', 'bob', sequence, null)))
    await flush()
    expect(host.session.close).not.toHaveBeenCalled()
    expect(host.onPresence).toHaveBeenCalledTimes(1)
    pending.resolve(1n)
    await send
    await host.network.stop()
  })

  it('notifies an admitted guest when the host removes it from the room', async () => {
    const guest = await setup('guest')
    guest.watch.push({ kind: 'announced', namespace: [...prefix, 'host'] })
    await flush()
    guest.subscription.push(object(packet('presence', 'alice', 0, ['alice', 'bob'])))
    guest.subscription.push(object(packet('presence', 'alice', 1, ['alice'])))
    await flush()
    expect(guest.onStatus).toHaveBeenCalledWith('error', expect.stringContaining('Host stopped receiving'))
    await guest.network.stop()
  })

  it('reports a full room instead of leaving a guest waiting', async () => {
    const guest = await setup('guest')
    guest.watch.push({ kind: 'announced', namespace: [...prefix, 'host'] })
    await flush()
    guest.subscription.push(
      object(packet('presence', 'alice', 0, ['alice', ...Array.from({ length: 15 }, (_, index) => `p${index}`)]))
    )
    await flush()
    expect(guest.onStatus).toHaveBeenCalledWith('error', expect.stringContaining('Room is full'))
    await guest.network.stop()
  })

  it('times out a guest that the host never admits', async () => {
    vi.useFakeTimers()
    const guest = await setup('guest')
    guest.watch.push({ kind: 'announced', namespace: [...prefix, 'host'] })
    await flush()
    vi.advanceTimersByTime(15_000)
    await flush()
    expect(guest.onStatus).toHaveBeenCalledWith('error', expect.stringContaining('did not admit'))
    await guest.network.stop()
  })

  it('cancels the admission timeout once a guest joins', async () => {
    vi.useFakeTimers()
    const guest = await setup('guest')
    guest.watch.push({ kind: 'announced', namespace: [...prefix, 'host'] })
    await flush()
    guest.subscription.push(object(packet('presence', 'alice', 0, ['alice', 'bob'])))
    await flush()
    vi.advanceTimersByTime(15_000)
    await flush()
    expect(guest.onStatus).not.toHaveBeenCalledWith('error', expect.anything())
    await guest.network.stop()
  })

  it('shows host loss and relay/send failure visibly and frees resources exactly once', async () => {
    const guest = await setup('guest')
    guest.watch.push({ kind: 'announced', namespace: [...prefix, 'host'] })
    await flush()
    guest.watch.push({ kind: 'withdrawn', namespace: [...prefix, 'host'] })
    await flush()
    expect(guest.onStatus).toHaveBeenCalledWith('error', expect.stringContaining('Host left'))
    await guest.network.stop()
    expect(guest.session.close).toHaveBeenCalledTimes(1)
    expect(guest.writer.free).toHaveBeenCalledTimes(1)
    expect(guest.announcement.free).toHaveBeenCalledTimes(1)
    await expect(guest.network.start()).rejects.toThrow('new network instance')
    const host = await setup()
    host.writer.writeGroup.mockRejectedValueOnce(new Error('send failed'))
    await expect(host.network.broadcastSnapshot({})).rejects.toThrow('send failed')
    await flush()
    expect(host.onStatus).toHaveBeenCalledWith('error', expect.stringContaining('send failed'))
    await host.network.stop()
    const disconnected = await setup()
    disconnected.session.close()
    await flush()
    expect(disconnected.onStatus).toHaveBeenCalledWith('error', expect.stringContaining('Relay disconnected'))
    await disconnected.network.stop()
  })

  it('closes a connection that resolves after stop', async () => {
    const sdk = mockSession()
    const pending = deferred<RabbitersSession>()
    const network = new CooperativeNetwork({
      relayUrl: 'https://relay.test',
      room: 'room',
      role: 'host',
      connect: () => pending.promise,
      onInput: vi.fn(),
      onSnapshot: vi.fn(),
      onPresence: vi.fn(),
      onStatus: vi.fn()
    })
    const starting = network.start()
    await network.stop()
    pending.resolve(sdk.session as unknown as RabbitersSession)
    await starting
    expect(sdk.session.close).toHaveBeenCalledTimes(1)
    expect(sdk.session.publishTrack).not.toHaveBeenCalled()
  })

  it('closes a late subscription after stop without delivering data', async () => {
    const host = await setup()
    const pending = deferred<Awaited<ReturnType<RabbitersSession['subscribe']>>>()
    host.session.subscribe.mockImplementationOnce(() => pending.promise as never)
    host.watch.push({ kind: 'announced', namespace: [...prefix, 'bob'] })
    await flush()
    await host.network.stop()
    pending.resolve(host.subscription as unknown as Awaited<ReturnType<RabbitersSession['subscribe']>>)
    await flush()
    expect(host.subscription.close).toHaveBeenCalledTimes(1)
    expect(host.onInput).not.toHaveBeenCalled()
  })

  it('rejects credentials and unsafe routing identifiers before connecting', () => {
    for (const relayUrl of ['http://relay.test', 'https://user:pass@relay.test', 'https://relay.test?token=secret']) {
      expect(
        () =>
          new CooperativeNetwork({
            relayUrl,
            room: 'room',
            role: 'host',
            onInput: vi.fn(),
            onSnapshot: vi.fn(),
            onPresence: vi.fn(),
            onStatus: vi.fn()
          })
      ).toThrow('HTTPS')
    }
    expect(
      () =>
        new CooperativeNetwork({
          relayUrl: 'https://relay.test',
          room: '../room',
          role: 'host',
          onInput: vi.fn(),
          onSnapshot: vi.fn(),
          onPresence: vi.fn(),
          onStatus: vi.fn()
        })
    ).toThrow('Invalid')
  })
})

describe('guest host probe (relays that never report the host announcement)', () => {
  async function guestWithTimers() {
    vi.useFakeTimers()
    const guest = await setup('guest')
    return guest
  }
  const presence = () => object(packet('presence', 'alice', 1, ['alice', 'bob']))

  it('follows the host by probing when no announcement ever arrives', async () => {
    const guest = await guestWithTimers()
    expect(guest.session.subscribe).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(800)
    expect(guest.session.subscribe).toHaveBeenCalledExactlyOnceWith([...prefix, 'host'], 'data', {
      filter: 'nextGroupStart',
      forward: true
    })
    guest.subscription.push(presence())
    guest.subscription.push(object(packet('snapshot', 'alice', 2, { t: 1 })))
    await flush()
    expect(guest.onPresence).toHaveBeenLastCalledWith(['alice', 'bob'])
    expect(guest.onSnapshot).toHaveBeenCalledExactlyOnceWith({ t: 1 })
    expect(guest.onStatus).toHaveBeenLastCalledWith('ready', 'Connected to host')
    // No more probes once the host is followed.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(guest.session.subscribe).toHaveBeenCalledTimes(1)
    await guest.network.stop()
  })

  it('retries a probe that fails without failing the session', async () => {
    const guest = await guestWithTimers()
    guest.session.subscribe.mockImplementationOnce(async () => {
      throw new Error('no such namespace')
    })
    await vi.advanceTimersByTimeAsync(800)
    expect(guest.session.subscribe).toHaveBeenCalledTimes(1)
    expect(guest.onStatus).not.toHaveBeenCalledWith('error', expect.anything())
    await vi.advanceTimersByTimeAsync(1_600)
    expect(guest.session.subscribe).toHaveBeenCalledTimes(2)
    guest.subscription.push(presence())
    await flush()
    expect(guest.onStatus).toHaveBeenLastCalledWith('ready', 'Connected to host')
    await guest.network.stop()
  })

  it('closes a probe that resolves after its timeout and retries', async () => {
    const guest = await guestWithTimers()
    const late = deferred<Queue<ReceivedObject>>()
    guest.session.subscribe.mockImplementationOnce(() => late.promise)
    await vi.advanceTimersByTimeAsync(800 + 3_100)
    const stale = new Queue<ReceivedObject>()
    late.resolve(stale)
    await flush()
    expect(stale.close).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_600)
    expect(guest.session.subscribe).toHaveBeenCalledTimes(2)
    await guest.network.stop()
  })

  it('closes a late probe when the announcement path already follows the host (no duplicate)', async () => {
    const guest = await guestWithTimers()
    const late = deferred<Queue<ReceivedObject>>()
    guest.session.subscribe.mockImplementationOnce(() => late.promise)
    await vi.advanceTimersByTimeAsync(800)
    guest.watch.push({ kind: 'announced', namespace: [...prefix, 'host'] })
    await flush()
    expect(guest.session.subscribe).toHaveBeenCalledTimes(2)
    const probe = new Queue<ReceivedObject>()
    late.resolve(probe)
    await flush()
    expect(probe.close).toHaveBeenCalled()
    guest.subscription.push(presence())
    await flush()
    expect(guest.onPresence).toHaveBeenCalledTimes(1)
    await guest.network.stop()
  })

  it('ignores an announcement that arrives after a successful probe', async () => {
    const guest = await guestWithTimers()
    await vi.advanceTimersByTimeAsync(800)
    expect(guest.session.subscribe).toHaveBeenCalledTimes(1)
    guest.watch.push({ kind: 'announced', namespace: [...prefix, 'host'] })
    await flush()
    expect(guest.session.subscribe).toHaveBeenCalledTimes(1)
    guest.subscription.push(presence())
    await flush()
    expect(guest.onPresence).toHaveBeenCalledTimes(1)
    await guest.network.stop()
  })

  it('stop() during a pending probe cleans up and never follows', async () => {
    const guest = await guestWithTimers()
    const late = deferred<Queue<ReceivedObject>>()
    guest.session.subscribe.mockImplementationOnce(() => late.promise)
    await vi.advanceTimersByTimeAsync(800)
    await guest.network.stop()
    const probe = new Queue<ReceivedObject>()
    late.resolve(probe)
    await flush()
    expect(probe.close).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(guest.session.subscribe).toHaveBeenCalledTimes(1)
    expect(guest.onPresence).not.toHaveBeenCalled()
  })
})
