import { beforeEach, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  announce: undefined as
    | ((context: { publishNamespace: { trackNamespace: string[] }; respondOk: () => Promise<void> }) => Promise<void>)
    | undefined,
  withdraw: undefined as ((message: { trackNamespace: string[] }) => void) | undefined,
  close: undefined as (() => void) | undefined,
  handlers: new Map<bigint, (_group: bigint, object: { objectStatus?: number; objectPayload: Uint8Array }) => void>(),
  subscribe: vi.fn<() => Promise<{ requestId: bigint; subscribeOk: { trackAlias: bigint } }>>(),
  unsubscribe: vi.fn<(requestId: bigint) => Promise<void>>(),
  clear: vi.fn<(trackAlias: bigint) => void>()
}))

vi.mock('../../../../lib/moqt/moqtClient', () => ({
  RequestErrorCode: { TrackDoesNotExist: 4n },
  MoqtClientWrapper: class {
    connect = async () => {}
    disconnect = async () => {}
    publishNamespace = async () => {}
    subscribeNamespace = async () => {}
    subscribe = mock.subscribe
    unsubscribe = mock.unsubscribe
    clearSubgroupObjectHandler = mock.clear
    setOnConnectionClosedHandler(handler: typeof mock.close) {
      mock.close = handler
    }
    setOnPublishNamespaceHandler(handler: typeof mock.announce) {
      mock.announce = handler
    }
    setOnPublishNamespaceDoneHandler(handler: typeof mock.withdraw) {
      mock.withdraw = handler
    }
    setOnIncomingSubscribeHandler() {}
    setOnIncomingUnsubscribeHandler() {}
    setOnSubgroupObjectHandler(alias: bigint, handler: NonNullable<ReturnType<typeof mock.handlers.get>>) {
      mock.handlers.set(alias, handler)
    }
  }
}))

import { MoqChannel } from '../src/network/MoqChannel'

const namespace = ['anon', 'tower-jev', 'room', 'action']
const announce = () => mock.announce!({ publishNamespace: { trackNamespace: namespace }, respondOk: async () => {} })
const withdraw = () => mock.withdraw?.({ trackNamespace: namespace })
const flush = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve()
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function setup() {
  const receive = vi.fn(),
    status = vi.fn(),
    closed = vi.fn()
  const channel = new MoqChannel(['anon', 'tower-jev', 'room'], 'state', 'action', receive, status, closed)
  await channel.connect('https://relay.test')
  return { channel, receive, status, closed }
}
beforeEach(() => {
  mock.announce = mock.withdraw = mock.close = undefined
  mock.handlers.clear()
  mock.subscribe.mockReset()
  mock.unsubscribe.mockReset().mockResolvedValue()
  mock.clear.mockReset().mockImplementation((alias) => mock.handlers.delete(alias))
  let requestId = 0n
  mock.subscribe.mockImplementation(async () => ({
    requestId: ++requestId,
    subscribeOk: { trackAlias: requestId + 10n }
  }))
})

it('resubscribes after bot namespace withdrawal and ignores detached data handlers', async () => {
  // Arrange
  const { receive } = await setup()
  await announce()
  await flush()
  const stale = mock.handlers.get(11n)!
  // Act
  withdraw()
  await announce()
  await flush()
  stale(0n, { objectPayload: new TextEncoder().encode('{"old":true}') })
  // Assert
  expect(mock.clear).toHaveBeenCalledWith(11n)
  expect(mock.unsubscribe).toHaveBeenCalledWith(1n)
  expect(mock.subscribe).toHaveBeenCalledTimes(2)
  expect(mock.handlers.has(11n)).toBe(false)
  expect(receive).not.toHaveBeenCalled()
  // Act
  mock.handlers.get(12n)!(0n, { objectPayload: new TextEncoder().encode('{"current":true}') })
  // Assert
  expect(receive).toHaveBeenCalledExactlyOnceWith({ current: true })
})

it('coalesces rapid returns behind the stale subscribe and unsubscribe without overlapping work', async () => {
  // Arrange
  await setup()
  const old = deferred<{ requestId: bigint; subscribeOk: { trackAlias: bigint } }>()
  const cleanup = deferred<void>()
  mock.subscribe.mockReturnValueOnce(old.promise)
  mock.unsubscribe.mockReturnValueOnce(cleanup.promise)
  const pending = announce()
  await flush()
  // Act
  withdraw()
  await announce()
  withdraw()
  await announce()
  await announce()
  // Assert
  expect(mock.subscribe).toHaveBeenCalledTimes(1)
  // Act
  old.resolve({ requestId: 90n, subscribeOk: { trackAlias: 100n } })
  await flush()
  // Assert
  expect(mock.handlers.has(100n)).toBe(false)
  expect(mock.unsubscribe).toHaveBeenCalledExactlyOnceWith(90n)
  expect(mock.subscribe).toHaveBeenCalledTimes(1)
  // Act
  cleanup.resolve()
  await pending
  await flush()
  await announce()
  // Assert
  expect(mock.subscribe).toHaveBeenCalledTimes(2)
  expect(mock.handlers.size).toBe(1)
})

it('waits for active subscription cleanup before returning and drops a subsequently withdrawn return', async () => {
  // Arrange
  await setup()
  await announce()
  const cleanup = deferred<void>()
  mock.unsubscribe.mockReturnValueOnce(cleanup.promise)
  // Act
  withdraw()
  await announce()
  withdraw()
  cleanup.resolve()
  await flush()
  // Assert
  expect(mock.subscribe).toHaveBeenCalledTimes(1)
  expect(mock.handlers.size).toBe(0)
  // Act
  await announce()
  // Assert
  expect(mock.subscribe).toHaveBeenCalledTimes(2)
})

it('ignores a stale announcement acknowledgement after withdrawal', async () => {
  // Arrange
  await setup()
  const acknowledgement = deferred<void>()
  const pending = mock.announce!({
    publishNamespace: { trackNamespace: namespace },
    respondOk: () => acknowledgement.promise
  })
  // Act
  withdraw()
  acknowledgement.resolve()
  await pending
  // Assert
  expect(mock.subscribe).not.toHaveBeenCalled()
  // Act
  await announce()
  // Assert
  expect(mock.subscribe).toHaveBeenCalledTimes(1)
})

it('ignores a stale subscribe failure and follows only the newest namespace generation', async () => {
  // Arrange
  const { status } = await setup()
  const old = deferred<{ requestId: bigint; subscribeOk: { trackAlias: bigint } }>()
  mock.subscribe.mockReturnValueOnce(old.promise)
  const pending = announce()
  await flush()
  // Act
  withdraw()
  await announce()
  old.reject(new Error('old publisher left'))
  await pending
  await flush()
  // Assert
  expect(mock.subscribe).toHaveBeenCalledTimes(2)
  expect(status.mock.calls.some(([text]) => text.includes('old publisher left'))).toBe(false)
  expect(mock.handlers.size).toBe(1)
})

it('does not resurrect a late subscription after the relay connection closes', async () => {
  // Arrange
  const { closed } = await setup()
  const old = deferred<{ requestId: bigint; subscribeOk: { trackAlias: bigint } }>()
  mock.subscribe.mockReturnValueOnce(old.promise)
  const pending = announce()
  await flush()
  // Act
  mock.close!()
  old.resolve({ requestId: 90n, subscribeOk: { trackAlias: 100n } })
  await pending
  await announce()
  // Assert
  expect(closed).toHaveBeenCalledTimes(1)
  expect(mock.handlers.size).toBe(0)
  expect(mock.subscribe).toHaveBeenCalledTimes(1)
  expect(mock.unsubscribe).not.toHaveBeenCalled()
})

it('ignores unrelated namespaces and duplicate announcements of the current bot', async () => {
  // Arrange
  await setup()
  await announce()
  // Act
  mock.withdraw!({ trackNamespace: ['other', 'action'] })
  await mock.announce!({ publishNamespace: { trackNamespace: ['other', 'action'] }, respondOk: async () => {} })
  await announce()
  // Assert
  expect(mock.subscribe).toHaveBeenCalledTimes(1)
  expect(mock.unsubscribe).not.toHaveBeenCalled()
  expect(mock.handlers.size).toBe(1)
})

it('reports an uncertain cleanup failure instead of retrying or creating another subscription', async () => {
  // Arrange
  const { status, receive } = await setup()
  await announce()
  const stale = mock.handlers.get(11n)!
  mock.unsubscribe.mockRejectedValueOnce(new Error('cleanup failed'))
  // Act
  withdraw()
  await announce()
  await flush()
  await announce()
  stale(0n, { objectPayload: new TextEncoder().encode('{"old":true}') })
  // Assert
  expect(mock.subscribe).toHaveBeenCalledTimes(1)
  expect(mock.unsubscribe).toHaveBeenCalledTimes(1)
  expect(receive).not.toHaveBeenCalled()
  expect(status.mock.calls.some(([text]) => text.includes('cleanup failed') && text.includes('リロード'))).toBe(true)
})
