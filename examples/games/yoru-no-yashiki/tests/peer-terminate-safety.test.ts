import { afterEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => {
  const sessions: any[] = []
  class Session {
    closed?: () => void
    incoming?: (context: any) => Promise<void>
    unsubscribe?: (request: bigint) => void
    done?: (message: any) => void
    announcement?: (context: any) => Promise<void>
    clearSubgroupObjectHandler = vi.fn()
    disconnect = vi.fn(async () => {})
    connect = vi.fn(async () => {})
    publishNamespace = vi.fn(async () => {})
    subscribeNamespace = vi.fn(async () => {})
    subscribe = vi.fn(async () => ({ requestId: 11n, subscribeOk: { trackAlias: 12n } }))
    setOnSubgroupObjectHandler = vi.fn()
    raw = { sendSubgroupHeader: vi.fn(async () => {}), sendSubgroupObject: vi.fn(async () => {}) }
    getRawClient() {
      return this.raw
    }
    constructor() {
      sessions.push(this)
    }
    setOnConnectionClosedHandler(handler: any) {
      this.closed = handler
    }
    setOnIncomingSubscribeHandler(handler: any) {
      this.incoming = handler
    }
    setOnIncomingUnsubscribeHandler(handler: any) {
      this.unsubscribe = handler
    }
    setOnPublishNamespaceDoneHandler(handler: any) {
      this.done = handler
    }
    setOnPublishNamespaceHandler(handler: any) {
      this.announcement = handler
    }
  }
  return { sessions, Session }
})

vi.mock('../../../../lib/moqt/moqtClient', () => ({
  MoqtClientWrapper: fixture.Session,
  RequestErrorCode: { TrackDoesNotExist: 4n }
}))

import { HorrorPeer } from '../src/peer'

const cleanups: HorrorPeer[] = []
const failureValues = [undefined, null, false, new Error('handler failure')]
const statusFailure = new Error('status failure')
const disconnectFailure = new Error('disconnect failure')
const room = 'a'.repeat(32)

function capture(action: () => unknown) {
  try {
    action()
    return { threw: false, error: undefined }
  } catch (error) {
    return { threw: true, error }
  }
}

async function prepare(role: 'host' | 'guest' = 'host') {
  vi.useFakeTimers()
  const status = vi.fn()
  const message = vi.fn()
  const peer = new HorrorPeer({
    role,
    room,
    relayUrl: 'https://relay.invalid:4433',
    onMessage: message,
    onStatus: status
  })
  cleanups.push(peer)
  await peer.connect()
  status.mockClear()
  const state = peer as any
  const session = fixture.sessions.at(-1)
  state.inbound = { requestId: 11n, trackAlias: 12n }
  state.outboundAlias = 13n
  state.outboundRequest = 14n
  state.remoteIdentity = 'b'.repeat(32)
  state.paired = true
  state.subgroup = { group: 1n, object: 1n, opened: performance.now() }
  state.events.push({ sequence: 1, value: { type: 'ritual' }, started: 1, lastSent: 1 })
  state.outbox.push({ key: 'queued', bytes: new Uint8Array([1]) })
  return { peer, state, session, status, message }
}

function expectEnded(player: Awaited<ReturnType<typeof prepare>>) {
  expect(player.state.ended).toBe(true)
  expect(player.state.paired).toBe(false)
  expect(player.state.inbound).toBeUndefined()
  expect(player.state.outboundAlias).toBeUndefined()
  expect(player.state.subgroup).toBeUndefined()
  expect(player.state.events).toEqual([])
  expect(player.state.outbox).toEqual([])
  expect(player.state.delivering).toBe(false)
  expect(player.peer.send({ type: 'ritual' })).toBe(false)
}

afterEach(() => {
  for (const peer of cleanups.splice(0)) capture(() => peer.close())
  fixture.sessions.length = 0
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe.each(['host', 'guest'] as const)('terminate safety %s', (role) => {
  it('does not start connecting after close in the connecting notification', async () => {
    vi.useFakeTimers()
    const message = vi.fn()
    const status = vi.fn((value: string) => {
      if (value === 'connecting') peer.close()
    })
    const peer = new HorrorPeer({
      role,
      room,
      relayUrl: 'https://relay.invalid',
      onMessage: message,
      onStatus: status
    })
    cleanups.push(peer)
    const session = fixture.sessions.at(-1)
    const player = { peer, state: peer as any, session, status, message }
    const timeout = vi.spyOn(globalThis, 'setTimeout')
    const interval = vi.spyOn(globalThis, 'setInterval')
    const connecting = peer.connect()
    expect.soft(session.connect).not.toHaveBeenCalled()
    expect.soft(timeout).not.toHaveBeenCalled()
    expect.soft(interval).not.toHaveBeenCalled()
    expect.soft(vi.getTimerCount()).toBe(0)
    expect.soft(player.state.connectTimer).toBeUndefined()
    await expect(connecting).resolves.toBeUndefined()
    expectEnded(player)
    expect(player.state.started).toBe(true)
    expect(player.state.timer).toBeUndefined()
    expect(player.state.connectTimer).toBeUndefined()
    expect.soft(session.connect).not.toHaveBeenCalled()
    expect(session.publishNamespace).not.toHaveBeenCalled()
    expect(session.subscribeNamespace).not.toHaveBeenCalled()
    expect(session.subscribe).not.toHaveBeenCalled()
    expect(session.raw.sendSubgroupHeader).not.toHaveBeenCalled()
    expect(session.raw.sendSubgroupObject).not.toHaveBeenCalled()
    expect(session.clearSubgroupObjectHandler).not.toHaveBeenCalled()
    expect.soft(session.disconnect).toHaveBeenCalledTimes(1)
    expect(status.mock.calls).toEqual([
      ['connecting', 'Connecting to MoQ relay'],
      ['closed', 'MoQ connection closed']
    ])
    expect(message).not.toHaveBeenCalled()
    expect(peer.close()).toBeUndefined()
    await vi.advanceTimersByTimeAsync(20000)
    expect(vi.getTimerCount()).toBe(0)
    expect.soft(session.disconnect).toHaveBeenCalledTimes(1)
    expect(status).toHaveBeenCalledTimes(2)
    await expect(peer.connect()).rejects.toThrow('Connection already started')
  })

  it('preserves normal relay connection and close', async () => {
    vi.useFakeTimers()
    const status = vi.fn()
    const peer = new HorrorPeer({ role, room, relayUrl: 'https://relay.invalid', onMessage() {}, onStatus: status })
    cleanups.push(peer)
    const session = fixture.sessions.at(-1)
    const state = peer as any
    await expect(peer.connect()).resolves.toBeUndefined()
    expect(session.connect).toHaveBeenCalledExactlyOnceWith('https://relay.invalid/')
    expect(session.publishNamespace).toHaveBeenCalledExactlyOnceWith(['anon', 'yoru-no-yashiki-v1', room, role], '')
    expect(session.subscribeNamespace).toHaveBeenCalledExactlyOnceWith(
      ['anon', 'yoru-no-yashiki-v1', room, role === 'host' ? 'guest' : 'host'],
      ''
    )
    expect(state.started).toBe(true)
    expect(state.ended).toBe(false)
    expect(state.paired).toBe(false)
    expect(state.connectTimer).toBeUndefined()
    expect(state.timer).toBeDefined()
    expect(vi.getTimerCount()).toBe(1)
    expect(status).toHaveBeenCalledExactlyOnceWith('connecting', 'Connecting to MoQ relay')
    expect(session.disconnect).not.toHaveBeenCalled()
    peer.close()
    expect(state.ended).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(session.disconnect).toHaveBeenCalledTimes(1)
    expect(status.mock.calls.at(-1)).toEqual(['closed', 'MoQ connection closed'])
  })

  it.each(['resolve', 'reject'] as const)(
    'preserves close during pending connect followed by %s',
    async (settlement) => {
      vi.useFakeTimers()
      const status = vi.fn()
      const message = vi.fn()
      const peer = new HorrorPeer({
        role,
        room,
        relayUrl: 'https://relay.invalid',
        onMessage: message,
        onStatus: status
      })
      cleanups.push(peer)
      const session = fixture.sessions.at(-1)
      const player = { peer, state: peer as any, session, status, message }
      let release!: () => void
      let reject!: (error: unknown) => void
      session.connect.mockImplementation(
        () =>
          new Promise<void>((resolve, rejectPromise) => {
            release = resolve
            reject = rejectPromise
          })
      )
      const connecting = peer.connect()
      expect(session.connect).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(1)
      peer.close()
      expectEnded(player)
      expect(vi.getTimerCount()).toBe(0)
      expect(session.disconnect).toHaveBeenCalledTimes(1)
      if (settlement === 'resolve') release()
      else reject(new Error('pending connection failed'))
      await expect(connecting).resolves.toBeUndefined()
      expectEnded(player)
      expect(player.state.connectTimer).toBeUndefined()
      expect(player.state.timer).toBeUndefined()
      expect(session.publishNamespace).not.toHaveBeenCalled()
      expect(session.subscribeNamespace).not.toHaveBeenCalled()
      expect(session.subscribe).not.toHaveBeenCalled()
      expect(session.disconnect).toHaveBeenCalledTimes(settlement === 'resolve' ? 2 : 1)
      await vi.advanceTimersByTimeAsync(20000)
      expect(vi.getTimerCount()).toBe(0)
      expect(status.mock.calls).toEqual([
        ['connecting', 'Connecting to MoQ relay'],
        ['closed', 'MoQ connection closed']
      ])
      expect(message).not.toHaveBeenCalled()
    }
  )

  it.each(
    ['header', 'payload', 'end'].flatMap((stage) =>
      ['resolve', 'reject'].flatMap((settlement) =>
        failureValues.flatMap((error, errorIndex) =>
          [false, true].map((statusRejects) => ({ stage, settlement, error, errorIndex, statusRejects }))
        )
      )
    )
  )(
    'settles $stage $settlement after close error #$errorIndex statusRejects=$statusRejects without restart',
    async ({ stage, settlement, error, statusRejects }) => {
      const player = await prepare(role)
      let release!: () => void
      let reject!: (error: unknown) => void
      const pending = new Promise<void>((resolve, rejectPromise) => {
        release = resolve
        reject = rejectPromise
      })
      if (stage === 'header') {
        player.state.subgroup = undefined
        player.session.raw.sendSubgroupHeader.mockImplementation(() => pending)
      } else {
        player.state.subgroup.opened = performance.now() - (stage === 'end' ? 2001 : 0)
        player.session.raw.sendSubgroupObject.mockImplementation(() => pending)
      }
      player.session.clearSubgroupObjectHandler.mockImplementation(() => {
        throw error
      })
      player.status.mockImplementation(() => (statusRejects ? Promise.reject(statusFailure) : undefined))
      player.state.flush()
      await Promise.resolve()
      const caught = capture(() => player.peer.close())
      expect(caught.threw).toBe(true)
      expect(caught.error).toBe(error)
      if (settlement === 'resolve') release()
      else reject(new Error('send after termination'))
      await vi.advanceTimersByTimeAsync(0)
      expectEnded(player)
      expect(player.state.writing).toBe(false)
      expect(player.status).toHaveBeenCalledTimes(1)
      expect(player.session.clearSubgroupObjectHandler).toHaveBeenCalledTimes(1)
      expect(player.session.disconnect).toHaveBeenCalledTimes(1)
      expect(player.session.raw.sendSubgroupHeader).toHaveBeenCalledTimes(stage === 'header' ? 1 : 0)
      expect(player.session.raw.sendSubgroupObject).toHaveBeenCalledTimes(stage === 'header' ? 0 : 1)
      expect(player.peer.close()).toBeUndefined()
      await vi.advanceTimersByTimeAsync(20000)
      expect(player.session.disconnect).toHaveBeenCalledTimes(1)
    }
  )

  it.each(failureValues.map((error, errorIndex) => ({ error, errorIndex })))(
    'retains falsy status errors without starting #$errorIndex',
    async ({ error }) => {
      const peer = new HorrorPeer({
        role,
        room,
        relayUrl: 'https://relay.invalid',
        onMessage() {},
        onStatus() {
          throw error
        }
      })
      cleanups.push(peer)
      const session = fixture.sessions.at(-1)
      const caught = capture(() => peer.close())
      expect(caught.threw).toBe(true)
      expect(caught.error).toBe(error)
      expect(session.disconnect).not.toHaveBeenCalled()
      expect(session.clearSubgroupObjectHandler).not.toHaveBeenCalled()
      expect(peer.close()).toBeUndefined()
      await expect(peer.connect()).rejects.toThrow('Connection already started')
    }
  )

  it.each(failureValues.map((error, errorIndex) => ({ error, errorIndex })))(
    'retains falsy disconnect errors over status errors #$errorIndex',
    async ({ error }) => {
      const player = await prepare(role)
      player.status.mockImplementation(() => {
        throw statusFailure
      })
      player.session.disconnect.mockImplementation(() => {
        throw error
      })
      const caught = capture(() => player.peer.close())
      expect(caught.threw).toBe(true)
      expect(caught.error).toBe(error)
      expectEnded(player)
    }
  )

  it.each(
    failureValues.flatMap((error, errorIndex) =>
      [false, true].flatMap((statusThrows) =>
        ['ok', 'throw', 'reject'].map((disconnectMode) => ({ error, errorIndex, statusThrows, disconnectMode }))
      )
    )
  )(
    'cleans all resources and retains handler error #$errorIndex status=$statusThrows disconnect=$disconnectMode',
    async ({ error, statusThrows, disconnectMode }) => {
      const player = await prepare(role)
      const trace: string[] = []
      const observations: unknown[] = []
      const reenter = () => {
        observations.push({
          ended: player.state.ended,
          paired: player.state.paired,
          inbound: player.state.inbound,
          alias: player.state.outboundAlias,
          subgroup: player.state.subgroup,
          events: player.state.events.length,
          queued: player.state.outbox.length,
          send: player.peer.send({ type: 'ritual' }),
          close: player.peer.close()
        })
        player.session.closed()
        player.session.unsubscribe(14n)
        player.session.done({
          trackNamespace: ['anon', 'yoru-no-yashiki-v1', room, role === 'host' ? 'guest' : 'host']
        })
      }
      player.session.clearSubgroupObjectHandler.mockImplementation(() => {
        trace.push('clear')
        reenter()
        throw error
      })
      player.status.mockImplementation(() => {
        trace.push('status')
        reenter()
        if (statusThrows) throw statusFailure
      })
      player.session.disconnect.mockImplementation(() => {
        trace.push('disconnect')
        reenter()
        if (disconnectMode === 'throw') throw disconnectFailure
        return disconnectMode === 'reject' ? Promise.reject(disconnectFailure) : Promise.resolve()
      })
      const caught = capture(() => player.peer.close())
      expect(caught.threw).toBe(true)
      expect(caught.error).toBe(error)
      expect(trace).toEqual(['clear', 'status', 'disconnect'])
      expect(observations).toEqual(
        Array.from({ length: 3 }, () => ({
          ended: true,
          paired: false,
          inbound: undefined,
          alias: undefined,
          subgroup: undefined,
          events: 0,
          queued: 0,
          send: false,
          close: undefined
        }))
      )
      expectEnded(player)
      await expect(player.peer.connect()).rejects.toThrow('Connection already started')
      await vi.advanceTimersByTimeAsync(20000)
      expect(player.session.clearSubgroupObjectHandler).toHaveBeenCalledExactlyOnceWith(12n)
      expect(player.status).toHaveBeenCalledExactlyOnceWith('closed', 'MoQ connection closed')
      expect(player.session.disconnect).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it.each(
    [false, true].flatMap((statusThrows) =>
      ['ok', 'throw', 'reject'].map((disconnectMode) => ({ statusThrows, disconnectMode }))
    )
  )(
    'retains preexisting exception precedence status=$statusThrows disconnect=$disconnectMode',
    async ({ statusThrows, disconnectMode }) => {
      const player = await prepare(role)
      player.status.mockImplementation(() => {
        if (statusThrows) throw statusFailure
      })
      player.session.disconnect.mockImplementation(() => {
        if (disconnectMode === 'throw') throw disconnectFailure
        return disconnectMode === 'reject' ? Promise.reject(disconnectFailure) : Promise.resolve()
      })
      const caught = capture(() => player.peer.close())
      expect(caught.threw).toBe(statusThrows || disconnectMode === 'throw')
      expect(caught.error).toBe(
        disconnectMode === 'throw' ? disconnectFailure : statusThrows ? statusFailure : undefined
      )
      expectEnded(player)
      await vi.advanceTimersByTimeAsync(0)
    }
  )

  it.each([
    'relay closed',
    'unsubscribe',
    'namespace done',
    'event overflow',
    'send overflow',
    'ack timeout',
    'connect timeout',
    'subscription failure',
    'announcement failure',
    'connect failure'
  ] as const)('attempts status and disconnect after clear failure from %s', async (route) => {
    const player = await prepare(role)
    const error = new Error('clear failed')
    player.session.clearSubgroupObjectHandler.mockImplementation(() => {
      throw error
    })
    let caught: { threw: boolean; error: unknown }
    if (route === 'subscription failure' || route === 'announcement failure') {
      player.state.outboundRequest = undefined
      const promise =
        route === 'subscription failure'
          ? player.session.incoming({
              subscribe: {
                trackName: 'data',
                trackNamespace: ['anon', 'yoru-no-yashiki-v1', room, role],
                requestId: 21n
              },
              isSuccess: true,
              respondOk: async () => {
                throw new Error('subscribe')
              }
            })
          : player.session.announcement({
              publishNamespace: { trackNamespace: [] },
              respondOk: async () => {
                throw new Error('announce')
              }
            })
      await expect(promise).rejects.toBe(error)
      caught = { threw: true, error }
    } else if (route === 'connect failure' || route === 'connect timeout') {
      clearInterval(player.state.timer)
      player.state.started = false
      player.session.connect.mockImplementation(() =>
        route === 'connect timeout' ? new Promise(() => {}) : Promise.reject(new Error('connect'))
      )
      const promise = player.peer.connect()
      player.status.mockClear()
      if (route === 'connect failure') await expect(promise).rejects.toBe(error)
      else {
        caught = await vi.advanceTimersByTimeAsync(15000).then(
          () => ({ threw: false, error: undefined }),
          (failure) => ({ threw: true, error: failure })
        )
        expect(caught.error).toBe(error)
      }
      caught = { threw: true, error }
    } else
      caught = capture(() => {
        if (route === 'relay closed') player.session.closed()
        if (route === 'unsubscribe') player.session.unsubscribe(14n)
        if (route === 'namespace done')
          player.session.done({
            trackNamespace: ['anon', 'yoru-no-yashiki-v1', room, role === 'host' ? 'guest' : 'host']
          })
        if (route === 'event overflow') {
          player.state.events.length = 64
          player.peer.send({ type: 'ritual' })
        }
        if (route === 'send overflow') {
          player.state.outbox.length = 0
          for (let index = 0; index < 64; index++)
            player.state.outbox.push({ key: `full:${index}`, bytes: new Uint8Array() })
          player.peer.send({ type: 'health' })
        }
        if (route === 'ack timeout') {
          player.state.events[0].started = performance.now() - 5001
          player.state.tick()
        }
      })
    expect(caught.threw).toBe(true)
    expect(caught.error).toBe(error)
    expectEnded(player)
    expect(player.status).toHaveBeenCalledTimes(1)
    expect(player.session.disconnect).toHaveBeenCalledTimes(1)
  })

  it.each(
    ['ritual', 'state', 'health'].flatMap((type) =>
      failureValues.map((error, errorIndex) => ({ type, error, errorIndex }))
    )
  )('keeps original delivery error #$errorIndex for $type and emits no fake ACK', async ({ type, error }) => {
    const player = await prepare(role)
    player.state.outbox.length = 0
    player.session.clearSubgroupObjectHandler.mockImplementation(() => {
      throw new Error('clear')
    })
    player.status.mockImplementation(() => {
      throw statusFailure
    })
    player.session.disconnect.mockImplementation(() => {
      throw disconnectFailure
    })
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        kind: type === 'health' ? 'latest' : 'event',
        from: player.state.remoteIdentity,
        to: player.state.identity,
        sequence: 1,
        category: type,
        value: { type, snapshot: { phase: 'finished' } }
      })
    )
    player.message.mockImplementation(() => {
      player.state.receive(bytes)
      throw error
    })
    const caught = capture(() => player.state.receive(bytes))
    expect(caught.threw).toBe(true)
    expect(caught.error).toBe(error)
    expect(player.message).toHaveBeenCalledTimes(1)
    expect(player.state.expectedEvent).toBe(1)
    expect(player.session.raw.sendSubgroupObject).not.toHaveBeenCalled()
    expectEnded(player)
    expect(player.status).toHaveBeenCalledTimes(1)
    expect(player.session.disconnect).toHaveBeenCalledTimes(1)
    player.state.receive(bytes)
    expect(player.message).toHaveBeenCalledTimes(1)
  })
})
