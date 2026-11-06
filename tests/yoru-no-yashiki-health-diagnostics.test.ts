import { afterEach, describe, expect, it, vi } from 'vitest'
import { installHealthTransportDiagnostics, type HealthTransportEvidence } from './yoru-no-yashiki-health-diagnostics'

afterEach(() => vi.unstubAllGlobals())

async function fixture(role: 'host' | 'guest' = 'host') {
  const windowState = {} as { realMoqHealthTransport: HealthTransportEvidence }
  vi.stubGlobal('window', windowState)
  const onMessage = vi.fn()
  const implementation = {
    header: (..._args: unknown[]): unknown => undefined,
    object: (..._args: unknown[]): unknown => undefined
  }
  const raw = {
    sendSubgroupHeader(...args: unknown[]) {
      return Reflect.apply(implementation.header, this, args)
    },
    sendSubgroupObject(...args: unknown[]) {
      return Reflect.apply(implementation.object, this, args)
    }
  }
  const register = vi.fn()
  const session = {
    getRawClient: vi.fn(function (this: object) {
      expect(this).toBe(session)
      return raw
    }),
    setOnSubgroupObjectHandler: register
  }
  class Peer {
    outbox: { key: string; bytes: Uint8Array }[] = []
    options = { onMessage }
    session = session
    ended = false
    lastSequence = 0
    connectResult = Promise.resolve()
    connect() {
      return this.connectResult
    }
    enqueue(key: string, frame: unknown) {
      if (this.ended) return false
      const bytes = new TextEncoder().encode(JSON.stringify(frame))
      const old = this.outbox.find((item) => item.key === key)
      if (old) old.bytes = bytes
      else this.outbox.push({ key, bytes })
      return true
    }
    receive(payload: Uint8Array) {
      const frame = JSON.parse(new TextDecoder().decode(payload))
      if (frame.sequence <= this.lastSequence) return
      this.lastSequence = frame.sequence
      return this.options.onMessage(frame.value)
    }
    terminate(_status: string, _reason: string) {
      this.ended = true
      this.outbox.length = 0
    }
  }
  const serializedInstaller = new Function(
    'return (' + installHealthTransportDiagnostics.toString() + ')'
  )() as typeof installHealthTransportDiagnostics
  await serializedInstaller(role, Peer.prototype)
  const peer = new Peer()
  expect(peer.connect()).toBe(peer.connectResult)
  expect(peer.session.getRawClient()).toBe(raw)
  const frame = (sequence: number) => ({
    kind: 'latest',
    category: 'health',
    sequence,
    from: 'private-room-identity',
    to: 'private-recipient',
    value: { type: 'health', challenge: sequence + 10, epoch: 2, rms: 0.42, threshold: 0.07, mic: true }
  })
  const bytes = (sequence: number) => new TextEncoder().encode(JSON.stringify(frame(sequence)))
  return { peer, raw, implementation, register, frame, bytes, onMessage, evidence: windowState.realMoqHealthTransport }
}

describe('bounded real MoQ health diagnostics (no browser or network)', () => {
  it('records actual queue mutations and safe sequence/challenge correlation', async () => {
    const { peer, frame, evidence } = await fixture()
    expect(peer.enqueue('latest:health', frame(1))).toBe(true)
    expect(peer.enqueue('latest:health', frame(2))).toBe(true)
    const item = peer.outbox[0]
    expect(peer.outbox.shift()).toBe(item)
    expect(peer.outbox.shift()).toBeUndefined()
    expect(evidence.events.filter((event) => event.event.startsWith('outbox-'))).toMatchObject([
      { event: 'outbox-enqueue', sequence: 1, challenge: 11, queueLength: 1 },
      { event: 'outbox-replace', sequence: 2, challenge: 12, replacedSequence: 1 },
      { event: 'outbox-dequeue', sequence: 2, challenge: 12, queueLength: 0 }
    ])
    peer.terminate('error', 'MoQ send failed')
    expect(peer.enqueue('latest:health', frame(3))).toBe(false)
    expect(evidence.events.at(-1)).toMatchObject({ event: 'enqueue-return', accepted: false })
    const json = JSON.stringify(evidence)
    for (const forbidden of ['private-room', 'private-recipient', 'rms', 'threshold', 'mic', '0.42', '0.07'])
      expect(json).not.toContain(forbidden)
    expect(evidence.observerErrors).toBe(0)
  })

  it('preserves SDK receivers, arguments, return/Promise identity and synchronous exception identity', async () => {
    const { raw, implementation, bytes, evidence } = await fixture()
    const order: string[] = []
    const promise = Promise.resolve()
    const then = vi.spyOn(promise, 'then')
    implementation.header = function (this: object, ...args: unknown[]) {
      expect(this).toBe(raw)
      expect(args).toEqual([7n, 8n, 0n, 0])
      order.push('header')
      return promise
    }
    const payload = bytes(1)
    const location = {}
    implementation.object = function (this: object, ...args: unknown[]) {
      expect(this).toBe(raw)
      expect(args[5]).toBe(payload)
      expect(args[6]).toBe(location)
      order.push('object')
      return 123
    }
    expect(raw.sendSubgroupHeader(7n, 8n, 0n, 0)).toBe(promise)
    expect(raw.sendSubgroupObject(7n, 8n, 0n, 1n, undefined, payload, location)).toBe(123)
    raw.sendSubgroupObject(7n, 8n, 0n, 2n, 3, payload, location)
    expect(then).not.toHaveBeenCalled()
    expect(order).toEqual(['header', 'object', 'object'])
    const error = new Error('private-error')
    implementation.object = () => {
      throw error
    }
    let thrown: unknown
    try {
      raw.sendSubgroupObject(7n, 8n, 0n, 3n, undefined, payload)
    } catch (caught) {
      thrown = caught
    }
    expect(thrown).toBe(error)
    expect(evidence.events.filter((event) => event.event === 'sdk-call-start').map((event) => event.operation)).toEqual(
      ['header', 'object', 'end-of-group', 'object']
    )
    expect(evidence.events.at(-1)).toMatchObject({ event: 'sdk-call-throw', group: '8', object: '3' })
    expect(JSON.stringify(evidence)).not.toContain('private-error')
  })

  it('does not attach handlers to rejected Promises or change their microtask order', async () => {
    const { raw, implementation, evidence } = await fixture()
    const error = new Error('rejected')
    const promise = Promise.reject(error)
    const order: string[] = []
    const handled = promise.catch((reason) => {
      expect(reason).toBe(error)
      order.push('catch')
    })
    const then = vi.spyOn(promise, 'then')
    implementation.header = () => promise
    expect(raw.sendSubgroupHeader(1n, 2n, 0n, 0)).toBe(promise)
    order.push('returned')
    queueMicrotask(() => order.push('microtask'))
    expect(then).not.toHaveBeenCalled()
    await handled
    expect(order).toEqual(['returned', 'catch', 'microtask'])
    expect(evidence.events.at(-1)?.event).toBe('sdk-call-return')
  })

  it('distinguishes SDK callback entry, peer dispatch and filtered health without claiming app acceptance', async () => {
    const { peer, register, bytes, onMessage, evidence } = await fixture('guest')
    const callback = vi.fn(function (this: object, _group: bigint, object: { objectPayload: Uint8Array }) {
      return peer.receive(object.objectPayload)
    })
    const callbackReceiver = {}
    peer.session.setOnSubgroupObjectHandler(7n, callback)
    const observed = register.mock.calls[0][1] as typeof callback
    const object = { objectId: 4n, subgroupId: 0n, objectPayload: bytes(2) }
    onMessage.mockReturnValue('handler-result')
    expect(observed.call(callbackReceiver, 8n, object)).toBe('handler-result')
    expect(observed.call(callbackReceiver, 8n, object)).toBeUndefined()
    expect(callback.mock.contexts).toEqual([callbackReceiver, callbackReceiver])
    expect(callback.mock.calls[0][1]).toBe(object)
    expect(onMessage.mock.contexts[0]).toBe(peer.options)
    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(evidence.events.filter((event) => event.event === 'sdk-handler-entry')).toHaveLength(2)
    expect(evidence.events.filter((event) => event.event === 'peer-receive-return')).toMatchObject([
      { sequence: 2, dispatchedToHealthHandler: true },
      { sequence: 2, dispatchedToHealthHandler: false }
    ])
    const entry = evidence.events.find((event) => event.event === 'health-handler-entry')!
    expect(entry.receiveCall).toBe(evidence.events.find((event) => event.event === 'peer-receive-start')!.call)
    const error = new Error('callback-failed')
    onMessage.mockImplementation(() => {
      throw error
    })
    let thrown: unknown
    try {
      peer.receive(bytes(3))
    } catch (caught) {
      thrown = caught
    }
    expect(thrown).toBe(error)
    expect(evidence.events.at(-1)?.event).toBe('peer-receive-throw')
    expect(evidence.observerErrors).toBe(0)
  })

  it('bounds retained events, preserves peer separation and records queue discard reasons', async () => {
    const { peer, frame, evidence } = await fixture()
    const second = new (peer.constructor as new () => typeof peer)()
    second.connect()
    second.enqueue('latest:health', frame(1))
    expect(evidence.events.find((event) => event.event === 'outbox-enqueue')?.peer).toBe(2)
    for (let sequence = 1; sequence <= 2000; sequence++) peer.enqueue('latest:health', frame(sequence))
    peer.terminate('error', 'MoQ send failed')
    expect(evidence.events).toHaveLength(evidence.eventLimit)
    expect(evidence.droppedEvents).toBeGreaterThan(0)
    expect(evidence.events.at(-1)).toMatchObject({
      event: 'terminate',
      peer: 1,
      reason: 'send-failed',
      discardedQueueLength: 1,
      alreadyEnded: false
    })
    expect(peer.outbox).toHaveLength(0)
    expect(evidence.events.every((event, index, events) => index === 0 || event.at >= events[index - 1].at)).toBe(true)
    expect(evidence.observerErrors).toBe(0)
  })

  it('keeps original operations working when recording fails', async () => {
    const { peer, raw, implementation, frame, evidence } = await fixture()
    Object.freeze(evidence.events)
    expect(peer.enqueue('latest:health', frame(1))).toBe(true)
    expect(peer.outbox).toHaveLength(1)
    expect(peer.outbox.shift()).toBeDefined()
    const sentinel = {}
    implementation.header = () => sentinel
    expect(raw.sendSubgroupHeader()).toBe(sentinel)
    expect(evidence.observerErrors).toBeGreaterThan(0)
  })
})
