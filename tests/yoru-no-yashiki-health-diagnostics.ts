type Fields = Record<string, string | number | boolean | undefined>
type Method = (...args: never[]) => unknown
type QueueItem = { key: string; bytes: Uint8Array }
type RuntimePeer = { outbox: QueueItem[]; options: object; session: object; ended: boolean }

export type HealthTransportEvidence = {
  role: 'host' | 'guest'
  startedAt: number
  eventLimit: number
  droppedEvents: number
  observerErrors: number
  events: (Fields & { at: number; event: string })[]
}

export async function installHealthTransportDiagnostics(role: 'host' | 'guest', prototype?: object) {
  const modulePath = '/src/peer.ts'
  const peerPrototype: object = prototype ?? (await import(/* @vite-ignore */ modulePath)).HorrorPeer.prototype
  const evidence: HealthTransportEvidence = {
    role,
    startedAt: performance.now(),
    eventLimit: 4096,
    droppedEvents: 0,
    observerErrors: 0,
    events: []
  }
  Object.assign(window, { realMoqHealthTransport: evidence })
  const record = (event: string, fields: Fields) => {
    if (evidence.events.length === evidence.eventLimit) {
      evidence.events.shift()
      evidence.droppedEvents++
    }
    evidence.events.push({ at: performance.now(), event, ...fields })
  }
  const safely = (observe: () => void) => {
    try {
      observe()
    } catch {
      evidence.observerErrors++
    }
  }
  const integer = (value: unknown) => (Number.isSafeInteger(value) ? (value as number) : undefined)
  const identifier = (value: unknown) =>
    typeof value === 'bigint' && value >= 0n && value <= 0xffffffffffffffffn ? value.toString() : undefined
  const categories = new Set(['health', 'input', 'state', 'ready'])
  const metadata = (value: unknown): Fields => {
    if (!value || typeof value !== 'object') return {}
    const frame = value as Record<string, unknown>
    const health = frame.value as Record<string, unknown> | undefined
    return {
      kind: ['hello', 'latest', 'event', 'ack'].includes(frame.kind as string) ? (frame.kind as string) : undefined,
      category: categories.has(frame.category as string) ? (frame.category as string) : undefined,
      sequence: integer(frame.sequence),
      ...(frame.category === 'health' && health?.type === 'health'
        ? { challenge: integer(health.challenge), epoch: integer(health.epoch) }
        : {})
    }
  }
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const payloadMetadata = (payload: unknown): Fields => {
    if (!(payload instanceof Uint8Array) && !Array.isArray(payload)) return {}
    if (payload.length === 0 || payload.length > 64 * 1024) return {}
    try {
      return metadata(JSON.parse(decoder.decode(new Uint8Array(payload))))
    } catch {
      return {}
    }
  }
  const wrap = (
    owner: object,
    name: string,
    around: (target: Method, receiver: unknown, args: unknown[]) => unknown
  ) => {
    const target = Reflect.get(owner, name) as Method
    if (typeof target !== 'function') throw new Error('Missing diagnostic boundary: ' + name)
    Object.defineProperty(owner, name, {
      configurable: true,
      writable: true,
      enumerable: false,
      value: new Proxy(target, { apply: around })
    })
  }
  const peers = new WeakMap<object, { peer: number; enqueueCall?: number; receiveCall?: number; dispatched: number }>()
  const clients = new WeakSet<object>()
  let nextPeer = 0
  let nextCall = 0
  const attach = (peer: RuntimePeer) => {
    const previous = peers.get(peer)
    if (previous) return previous
    const state = { peer: ++nextPeer, dispatched: 0 } as NonNullable<ReturnType<typeof peers.get>>
    peers.set(peer, state)
    for (const name of ['push', 'shift'])
      wrap(peer.outbox, name, (target, receiver, args) => {
        const result = Reflect.apply(target, receiver, args)
        safely(() => {
          const items = name === 'push' ? args : result ? [result] : []
          for (const item of items as QueueItem[])
            record(name === 'push' ? 'outbox-enqueue' : 'outbox-dequeue', {
              peer: state.peer,
              enqueueCall: state.enqueueCall,
              queueLength: peer.outbox.length,
              ...payloadMetadata(item.bytes)
            })
        })
        return result
      })
    wrap(peer.options, 'onMessage', (target, receiver, args) => {
      safely(() => {
        const message = args[0] as { type?: unknown; challenge?: unknown; epoch?: unknown } | undefined
        if (message?.type !== 'health') return
        state.dispatched++
        record('health-handler-entry', {
          peer: state.peer,
          receiveCall: state.receiveCall,
          challenge: integer(message.challenge),
          epoch: integer(message.epoch)
        })
      })
      return Reflect.apply(target, receiver, args)
    })
    wrap(peer.session, 'getRawClient', (target, receiver, args) => {
      const result = Reflect.apply(target, receiver, args) as object | null
      safely(() => {
        if (!result || clients.has(result)) return
        clients.add(result)
        for (const name of ['sendSubgroupHeader', 'sendSubgroupObject']) {
          wrap(result, name, (send, sender, sendArgs) => {
            const call = ++nextCall
            let fields: Fields = { peer: state.peer, call }
            safely(() => {
              fields = {
                ...fields,
                operation: name === 'sendSubgroupHeader' ? 'header' : sendArgs[4] === 3 ? 'end-of-group' : 'object',
                alias: identifier(sendArgs[0]),
                group: identifier(sendArgs[1]),
                subgroup: identifier(sendArgs[2]),
                object: name === 'sendSubgroupObject' ? identifier(sendArgs[3]) : undefined,
                objectStatus: name === 'sendSubgroupObject' ? integer(sendArgs[4]) : undefined,
                ...(name === 'sendSubgroupObject' ? payloadMetadata(sendArgs[5]) : {})
              }
              record('sdk-call-start', fields)
            })
            try {
              const returned = Reflect.apply(send, sender, sendArgs)
              safely(() => record('sdk-call-return', fields))
              return returned
            } catch (error) {
              safely(() => record('sdk-call-throw', fields))
              throw error
            }
          })
        }
      })
      return result
    })
    wrap(peer.session, 'setOnSubgroupObjectHandler', (target, receiver, args) => {
      const forwarded = [...args]
      const callback = forwarded[1] as Method
      forwarded[1] = new Proxy(callback, {
        apply(handler, handlerReceiver, handlerArgs: unknown[]) {
          safely(() => {
            const object = handlerArgs[1] as {
              objectId: bigint
              subgroupId?: bigint
              objectStatus?: number
              objectPayload: Uint8Array
            }
            record('sdk-handler-entry', {
              peer: state.peer,
              alias: identifier(args[0]),
              group: identifier(handlerArgs[0]),
              subgroup: identifier(object.subgroupId),
              object: identifier(object.objectId),
              objectStatus: integer(object.objectStatus),
              ...(object.objectStatus === undefined ? payloadMetadata(object.objectPayload) : {})
            })
          })
          return Reflect.apply(handler, handlerReceiver, handlerArgs)
        }
      })
      return Reflect.apply(target, receiver, forwarded)
    })
    return state
  }
  wrap(peerPrototype, 'connect', (target, receiver, args) => {
    safely(() => attach(receiver as RuntimePeer))
    return Reflect.apply(target, receiver, args)
  })
  wrap(peerPrototype, 'enqueue', (target, receiver, args) => {
    const peer = receiver as RuntimePeer
    const state = peers.get(peer)
    const call = ++nextCall
    const previousCall = state?.enqueueCall
    let old: QueueItem | undefined
    let oldBytes: Uint8Array | undefined
    let fields: Fields = { peer: state?.peer, call }
    safely(() => {
      old = peer.outbox.find((item) => item.key === args[0])
      oldBytes = old?.bytes
      fields = { ...fields, ...metadata(args[1]), replacedSequence: payloadMetadata(oldBytes).sequence }
      if (state) state.enqueueCall = call
      record('enqueue-start', { ...fields, queueLength: peer.outbox.length })
    })
    try {
      const result = Reflect.apply(target, receiver, args)
      safely(() => {
        if (old && old.bytes !== oldBytes) record('outbox-replace', fields)
        record('enqueue-return', { ...fields, accepted: result === true, queueLength: peer.outbox.length })
      })
      return result
    } catch (error) {
      safely(() => record('enqueue-throw', fields))
      throw error
    } finally {
      if (state) state.enqueueCall = previousCall
    }
  })
  wrap(peerPrototype, 'receive', (target, receiver, args) => {
    const peer = receiver as RuntimePeer
    const state = peers.get(peer)
    const call = ++nextCall
    const previousCall = state?.receiveCall
    const before = state?.dispatched
    let fields: Fields = { peer: state?.peer, call }
    safely(() => {
      fields = { ...fields, ...payloadMetadata(args[0]) }
      if (state) state.receiveCall = call
      record('peer-receive-start', fields)
    })
    try {
      const result = Reflect.apply(target, receiver, args)
      safely(() =>
        record('peer-receive-return', {
          ...fields,
          ...(fields.category === 'health' ? { dispatchedToHealthHandler: state?.dispatched !== before } : {})
        })
      )
      return result
    } catch (error) {
      safely(() => record('peer-receive-throw', fields))
      throw error
    } finally {
      if (state) state.receiveCall = previousCall
    }
  })
  const reasons = new Map([
    ['MoQ send failed', 'send-failed'],
    ['MoQ send queue overflow', 'send-queue-overflow'],
    ['MoQ event queue overflow', 'event-queue-overflow'],
    ['MoQ event acknowledgement timed out', 'event-ack-timeout'],
    ['MoQ relay connection timed out', 'connect-timeout'],
    ['MoQ relay connection failed', 'connect-failed'],
    ['MoQ subscription failed', 'subscription-failed'],
    ['MoQ relay disconnected', 'relay-disconnected'],
    ['The other player left', 'peer-left'],
    ['MoQ connection closed', 'closed']
  ])
  wrap(peerPrototype, 'terminate', (target, receiver, args) => {
    safely(() => {
      const peer = receiver as RuntimePeer
      record('terminate', {
        peer: peers.get(peer)?.peer,
        reason: reasons.get(args[1] as string) ?? 'other',
        alreadyEnded: peer.ended,
        discardedQueueLength: peer.outbox.length
      })
    })
    return Reflect.apply(target, receiver, args)
  })
}
