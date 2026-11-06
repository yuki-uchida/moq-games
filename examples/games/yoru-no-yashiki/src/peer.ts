import { MoqtClientWrapper, RequestErrorCode } from '../../../../lib/moqt/moqtClient'
import { OBJECT_STATUS_END_OF_GROUP } from '../../../../utils/media/objectStatus'

export type PeerStatus = 'connecting' | 'connected' | 'disconnected' | 'closed' | 'error'

export interface PeerOptions {
  role: 'host' | 'guest'
  relayUrl: string
  room: string
  onMessage: (value: unknown) => void
  onStatus: (status: PeerStatus, message: string) => void
}

type Frame = {
  version: 1
  kind: 'hello' | 'latest' | 'event' | 'ack'
  from: string
  to?: string
  echo?: string
  sequence?: number
  category?: string
  value?: unknown
}

type QueuedFrame = { key: string; bytes: Uint8Array }
type PendingEvent = { sequence: number; value: unknown; started: number; lastSent: number }

const ROOM_PATTERN = /^[a-f0-9]{32}$/
const LATEST_TYPES = new Set(['health', 'input', 'state', 'ready', 'stop'])
const MAX_FRAME_BYTES = 64 * 1024
const MAX_OUTBOX = 64
const MAX_EVENTS = 64
const TICK_MS = 250
const EVENT_TIMEOUT_MS = 5000
const CONNECT_TIMEOUT_MS = 15000
const GROUP_DURATION_MS = 2000
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

export function createRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function sameNamespace(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((part, index) => part === expected[index])
}

function validSequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export class HorrorPeer {
  private readonly session = new MoqtClientWrapper()
  private readonly identity = createRoomCode()
  private readonly publishing: string[]
  private readonly following: string[]
  private readonly relayUrl: string
  private outboundRequest?: bigint
  private outboundAlias?: bigint
  private inbound?: { requestId: bigint; trackAlias: bigint }
  private followingPending = false
  private started = false
  private ended = false
  private paired = false
  private remoteIdentity?: string
  private timer?: ReturnType<typeof setInterval>
  private connectTimer?: ReturnType<typeof setTimeout>
  private group = BigInt(Date.now()) * 1000n
  private subgroup?: { group: bigint; object: bigint; opened: number }
  private readonly outbox: QueuedFrame[] = []
  private writing = false
  private readonly latestSent = new Map<string, number>()
  private readonly latestReceived = new Map<string, number>()
  private nextEvent = 1
  private expectedEvent = 1
  private delivering = false
  private readonly events: PendingEvent[] = []

  constructor(private readonly options: PeerOptions) {
    if ((options.role !== 'host' && options.role !== 'guest') || !ROOM_PATTERN.test(options.room))
      throw new Error('Invalid room or role')
    let url: URL
    try {
      url = new URL(options.relayUrl)
    } catch {
      throw new Error('Invalid relay URL')
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error('The relay URL must use HTTPS without credentials, query or fragment')
    this.relayUrl = url.href
    const namespace = ['anon', 'yoru-no-yashiki-v1', options.room]
    this.publishing = [...namespace, options.role]
    this.following = [...namespace, options.role === 'host' ? 'guest' : 'host']
  }

  async connect(): Promise<void> {
    if (this.started || this.ended) throw new Error('Connection already started')
    this.started = true
    this.options.onStatus('connecting', 'Connecting to MoQ relay')
    if (this.ended) return
    this.connectTimer = setTimeout(() => this.terminate('error', 'MoQ relay connection timed out'), CONNECT_TIMEOUT_MS)
    this.session.setOnConnectionClosedHandler(() => this.terminate('disconnected', 'MoQ relay disconnected'))
    this.session.setOnIncomingSubscribeHandler(async ({ subscribe, isSuccess, code, respondOk, respondError }) => {
      if (!isSuccess) {
        await respondError(BigInt(code), 'Subscription rejected')
        return
      }
      if (
        this.ended ||
        subscribe.trackName !== 'data' ||
        !sameNamespace(subscribe.trackNamespace, this.publishing) ||
        this.outboundRequest !== undefined
      ) {
        await respondError(RequestErrorCode.TrackDoesNotExist, 'Track unavailable')
        return
      }
      this.outboundRequest = subscribe.requestId
      try {
        const alias = await respondOk()
        if (this.ended || this.outboundRequest !== subscribe.requestId) return
        this.outboundAlias = alias
        this.hello()
      } catch {
        this.terminate('error', 'MoQ subscription failed')
      }
    })
    this.session.setOnIncomingUnsubscribeHandler((requestId) => {
      if (requestId === this.outboundRequest) this.terminate('disconnected', 'The other player left')
    })
    this.session.setOnPublishNamespaceDoneHandler(({ trackNamespace }) => {
      if (sameNamespace(trackNamespace, this.following)) this.terminate('disconnected', 'The other player left')
    })
    this.session.setOnPublishNamespaceHandler(async ({ publishNamespace, respondOk }) => {
      try {
        await respondOk()
        if (
          this.ended ||
          !sameNamespace(publishNamespace.trackNamespace, this.following) ||
          this.inbound ||
          this.followingPending
        )
          return
        this.followingPending = true
        const { requestId, subscribeOk } = await this.session.subscribe(this.following, 'data', '', {
          filterType: 2,
          forward: true
        })
        this.followingPending = false
        if (this.ended) {
          this.session.clearSubgroupObjectHandler(subscribeOk.trackAlias)
          return
        }
        const subscription = { requestId, trackAlias: subscribeOk.trackAlias }
        this.inbound = subscription
        this.session.setOnSubgroupObjectHandler(subscription.trackAlias, (_group, object) => {
          if (this.ended || this.inbound !== subscription || object.objectStatus !== undefined) return
          this.receive(object.objectPayload)
        })
        this.hello()
      } catch {
        this.followingPending = false
        this.terminate('error', 'MoQ subscription failed')
      }
    })
    try {
      await this.session.connect(this.relayUrl)
      if (this.ended) {
        await this.session.disconnect()
        return
      }
      await this.session.publishNamespace(this.publishing, '')
      if (this.ended) return
      await this.session.subscribeNamespace(this.following, '')
      if (this.ended) return
      this.timer = setInterval(() => this.tick(), TICK_MS)
      this.hello()
    } catch (error) {
      if (this.ended) return
      this.terminate('error', 'MoQ relay connection failed')
      throw error
    } finally {
      if (this.connectTimer) clearTimeout(this.connectTimer)
      this.connectTimer = undefined
    }
  }

  send(value: unknown): boolean {
    if (!this.paired || this.ended || !this.remoteIdentity) return false
    let copy: unknown
    try {
      const encoded = JSON.stringify(value)
      if (typeof encoded !== 'string' || encoder.encode(encoded).byteLength > MAX_FRAME_BYTES - 512) return false
      copy = JSON.parse(encoded)
    } catch {
      return false
    }
    const category =
      copy && typeof copy === 'object' && 'type' in copy && typeof copy.type === 'string' ? copy.type : ''
    const finalState =
      category === 'state' &&
      copy &&
      typeof copy === 'object' &&
      'snapshot' in copy &&
      copy.snapshot &&
      typeof copy.snapshot === 'object' &&
      'phase' in copy.snapshot &&
      copy.snapshot.phase === 'finished'
    if (LATEST_TYPES.has(category) && !finalState) {
      const sequence = (this.latestSent.get(category) ?? 0) + 1
      this.latestSent.set(category, sequence)
      return this.enqueue(`latest:${category}`, {
        version: 1,
        kind: 'latest',
        from: this.identity,
        to: this.remoteIdentity,
        category,
        sequence,
        value: copy
      })
    }
    if (this.events.length >= MAX_EVENTS || !Number.isSafeInteger(this.nextEvent)) {
      this.terminate('error', 'MoQ event queue overflow')
      return false
    }
    this.events.push({ sequence: this.nextEvent++, value: copy, started: 0, lastSent: 0 })
    this.sendEvent()
    return !this.ended
  }

  close(): void {
    this.terminate('closed', 'MoQ connection closed')
  }

  private hello(): void {
    if (this.ended || !this.inbound || this.outboundAlias === undefined) return
    this.enqueue('hello', {
      version: 1,
      kind: 'hello',
      from: this.identity,
      ...(this.remoteIdentity ? { echo: this.remoteIdentity } : {})
    })
  }

  private tick(): void {
    if (this.ended) return
    this.hello()
    const event = this.events[0]
    if (!event || !event.started) return
    const now = performance.now()
    if (now - event.started >= EVENT_TIMEOUT_MS) {
      this.terminate('error', 'MoQ event acknowledgement timed out')
      return
    }
    if (now - event.lastSent >= TICK_MS) this.sendEvent()
  }

  private sendEvent(): void {
    const event = this.events[0]
    if (!event || !this.paired || !this.remoteIdentity || this.ended) return
    const now = performance.now()
    if (!event.started) event.started = Math.max(now, 0.001)
    event.lastSent = now
    this.enqueue(`event:${event.sequence}`, {
      version: 1,
      kind: 'event',
      from: this.identity,
      to: this.remoteIdentity,
      sequence: event.sequence,
      value: event.value
    })
  }

  private receive(payload: Uint8Array | number[]): void {
    if (!payload || payload.length === 0 || payload.length > MAX_FRAME_BYTES) return
    let frame: Frame
    try {
      const parsed: unknown = JSON.parse(decoder.decode(new Uint8Array(payload)))
      if (!parsed || typeof parsed !== 'object') return
      frame = parsed as Frame
    } catch {
      return
    }
    if (
      frame.version !== 1 ||
      typeof frame.from !== 'string' ||
      !ROOM_PATTERN.test(frame.from) ||
      frame.from === this.identity
    )
      return
    if (frame.kind === 'hello') {
      if (frame.echo !== undefined && frame.echo !== this.identity) return
      if (this.remoteIdentity && frame.from !== this.remoteIdentity) return
      const first = !this.remoteIdentity
      this.remoteIdentity = frame.from
      if (first) this.hello()
      if (frame.echo === this.identity && !this.paired && this.inbound && this.outboundAlias !== undefined) {
        this.paired = true
        this.options.onStatus('connected', 'MoQ peer connected')
      }
      return
    }
    if (!this.paired || frame.from !== this.remoteIdentity || frame.to !== this.identity) return
    if (frame.kind === 'ack' && validSequence(frame.sequence)) {
      if (this.events[0]?.sequence === frame.sequence) {
        this.events.shift()
        this.sendEvent()
      }
      return
    }
    if (this.delivering) return
    if (frame.kind === 'latest' && validSequence(frame.sequence) && typeof frame.category === 'string') {
      if (!LATEST_TYPES.has(frame.category) || frame.sequence <= (this.latestReceived.get(frame.category) ?? 0)) return
      if (!frame.value || typeof frame.value !== 'object' || !('type' in frame.value)) return
      if (frame.value.type !== frame.category) return
      this.latestReceived.set(frame.category, frame.sequence)
      this.deliver(frame.value)
      return
    }
    if (frame.kind !== 'event' || !validSequence(frame.sequence) || frame.sequence > this.expectedEvent) return
    if (frame.sequence === this.expectedEvent) {
      this.deliver(frame.value)
      this.expectedEvent++
    }
    this.enqueue(`ack:${frame.sequence}`, {
      version: 1,
      kind: 'ack',
      from: this.identity,
      to: this.remoteIdentity!,
      sequence: frame.sequence
    })
  }

  private deliver(value: unknown): void {
    this.delivering = true
    try {
      this.options.onMessage(value)
    } catch (error) {
      try {
        this.terminate('error', 'MoQ message handler failed')
      } finally {
        throw error
      }
    } finally {
      this.delivering = false
    }
  }

  private enqueue(key: string, frame: Frame): boolean {
    if (this.ended || this.outboundAlias === undefined) return false
    const bytes = encoder.encode(JSON.stringify(frame))
    if (bytes.byteLength > MAX_FRAME_BYTES) return false
    const old = this.outbox.find((item) => item.key === key)
    if (old) old.bytes = bytes
    else {
      if (this.outbox.length >= MAX_OUTBOX) {
        this.terminate('error', 'MoQ send queue overflow')
        return false
      }
      if (key === 'latest:stop') this.outbox.unshift({ key, bytes })
      else this.outbox.push({ key, bytes })
    }
    this.flush()
    return true
  }

  private flush(): void {
    if (this.writing || this.ended) return
    this.writing = true
    void (async () => {
      while (!this.ended && this.outbox.length) {
        const client = this.session.getRawClient()
        const alias = this.outboundAlias
        if (!client || alias === undefined) throw new Error('MoQ sender unavailable')
        if (this.subgroup && performance.now() - this.subgroup.opened >= GROUP_DURATION_MS) {
          await client.sendSubgroupObject(
            alias,
            this.subgroup.group,
            0n,
            this.subgroup.object,
            OBJECT_STATUS_END_OF_GROUP,
            new Uint8Array(0),
            undefined
          )
          if (this.ended) return
          this.subgroup = undefined
        }
        if (!this.subgroup) {
          const group = this.group++
          await client.sendSubgroupHeader(alias, group, 0n, 0)
          if (this.ended) return
          this.subgroup = { group, object: 0n, opened: performance.now() }
        }
        const subgroup = this.subgroup
        const item = this.outbox.shift()!
        await client.sendSubgroupObject(alias, subgroup.group, 0n, subgroup.object++, undefined, item.bytes, undefined)
        if (this.ended) return
      }
    })()
      .catch(() => {
        try {
          this.terminate('error', 'MoQ send failed')
        } catch {
          try {
            console.error('MoQ termination handler failed')
          } catch {}
        }
      })
      .finally(() => {
        this.writing = false
        if (!this.ended && this.outbox.length) this.flush()
      })
  }

  private terminate(status: PeerStatus, message: string): void {
    if (this.ended) return
    this.ended = true
    this.paired = false
    if (this.timer) clearInterval(this.timer)
    if (this.connectTimer) clearTimeout(this.connectTimer)
    this.outbox.length = 0
    this.events.length = 0
    const inbound = this.inbound
    this.inbound = undefined
    this.outboundAlias = undefined
    this.subgroup = undefined
    let failure: { error: unknown } | undefined
    try {
      if (inbound) this.session.clearSubgroupObjectHandler(inbound.trackAlias)
    } catch (error) {
      failure = { error }
    }
    try {
      try {
        const notification: unknown = this.options.onStatus(status, message)
        if (failure) void Promise.resolve(notification).catch(() => {})
      } finally {
        if (this.started) void this.session.disconnect().catch(() => {})
      }
    } catch (error) {
      failure ??= { error }
    }
    if (failure) throw failure.error
  }
}
