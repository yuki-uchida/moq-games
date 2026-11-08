import { MoqSession, type MoqNamespaceWatch, type MoqSubscription, type TrackWriter, type Announcement } from 'moq-wasm'

export const MAX_PAYLOAD_BYTES = 64 * 1024
export const MAX_PLAYERS = 16
const identifier = /^[a-zA-Z0-9_-]{1,64}$/
const admissionTimeoutMs = 15_000
/** Guests also subscribe to the host track directly, in case the relay never reports the host's announcement. */
const hostProbeDelayMs = 750
const hostProbeRetryMs = 1_500
const hostProbeTimeoutMs = 3_000
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

export type RabbitersSession = Pick<
  MoqSession,
  'closed' | 'close' | 'watchNamespaces' | 'announce' | 'publishTrack' | 'subscribe'
>

export interface CooperativeNetworkOptions {
  relayUrl: string
  room: string
  role: 'host' | 'guest'
  playerId?: string
  /** Namespace label; lets other games reuse this relay protocol without sharing rooms. */
  app?: string
  onInput: (playerId: string, input: unknown) => void
  onSnapshot: (state: unknown) => void
  onPresence: (playerIds: readonly string[]) => void
  onStatus: (status: 'connecting' | 'ready' | 'waiting-for-host' | 'error' | 'stopped', message: string) => void
  connect?: (url: string) => Promise<RabbitersSession>
}

interface Peer {
  subscription?: MoqSubscription
  sequences: Map<string, number>
}

/** One instance per connection; create a new instance after stop/error to reconnect.
 * Only the host simulates gameplay and calls broadcastSnapshot. JSON state is opaque.
 * IDs/rooms are routing labels, not authentication; the host must validate game inputs.
 */
export class CooperativeNetwork {
  readonly playerId: string
  private readonly prefix: string[]
  private readonly publishing: string[]
  private readonly peers = new Map<string, Peer>()
  private readonly players = new Set<string>()
  private session?: RabbitersSession
  private watch?: MoqNamespaceWatch
  private announcement?: Announcement
  private writer?: TrackWriter
  private active = false
  private started = false
  private stopping?: Promise<void>
  private sequence = 0
  private pending = 0
  private sending = Promise.resolve()
  private snapshot?: Uint8Array
  private publishingTask?: Promise<void>
  private hasSubscriber = false
  private joined = false
  private admissionTimer?: ReturnType<typeof setTimeout>
  private probeTimer?: ReturnType<typeof setTimeout>
  private probing = false

  constructor(private readonly options: CooperativeNetworkOptions) {
    this.playerId = options.playerId ?? crypto.randomUUID()
    const relay = new URL(options.relayUrl)
    if (relay.protocol !== 'https:' || relay.username || relay.password || relay.search || relay.hash)
      throw new Error('Use an HTTPS relay URL without credentials, query or fragment')
    if (!identifier.test(options.room) || !identifier.test(this.playerId) || !identifier.test(options.app ?? 'x'))
      throw new Error('Invalid room/player ID')
    if (this.playerId === 'host') throw new Error('Reserved player ID')
    this.prefix = ['anon', options.app ?? 'rabbiters-v1', options.room]
    this.publishing = [...this.prefix, options.role === 'host' ? 'host' : this.playerId]
    this.players.add(this.playerId)
  }

  async start(): Promise<void> {
    if (this.started) throw new Error('Create a new network instance to reconnect')
    this.started = true
    this.active = true
    this.options.onStatus('connecting', 'Connecting to MoQ relay')
    try {
      const session = await (this.options.connect ?? MoqSession.connect)(this.options.relayUrl)
      if (!this.active) {
        session.close()
        return
      }
      this.session = session
      void session.closed.then(
        () => this.fail(new Error('Relay disconnected')),
        (error) => this.fail(error)
      )
      const writer = await session.publishTrack(this.publishing, 'data', { retentionMs: 0 })
      if (!this.active) {
        writer.free()
        return
      }
      this.writer = writer
      this.publishingTask = this.welcomeSubscribers(writer).catch((error) => this.fail(error))
      const announcement = await session.announce(this.publishing)
      if (!this.active) {
        await announcement.close().finally(() => announcement.free())
        return
      }
      this.announcement = announcement
      const watch = await session.watchNamespaces(this.options.role === 'host' ? this.prefix : [...this.prefix, 'host'])
      if (!this.active) {
        await watch.close()
        return
      }
      this.watch = watch
      this.options.onStatus(
        this.options.role === 'host' ? 'ready' : 'waiting-for-host',
        this.options.role === 'host' ? 'Hosting room' : 'Waiting for host presence'
      )
      void this.discover(watch).catch((error) => this.fail(error))
      if (this.options.role === 'guest') this.scheduleHostProbe(hostProbeDelayMs)
    } catch (error) {
      this.fail(error)
      await this.stop(false)
      throw error
    }
  }

  async sendInput(input: unknown): Promise<void> {
    if (!this.active || !this.writer) throw new Error('Network is not ready')
    if (this.options.role === 'host') this.options.onInput(this.playerId, input)
    else {
      if (!this.hasSubscriber) return
      await this.enqueue(this.encode('input', input))
    }
  }

  async broadcastSnapshot(state: unknown): Promise<void> {
    if (this.options.role !== 'host') throw new Error('Only the host can broadcast snapshots')
    if (!this.active || !this.writer) throw new Error('Network is not ready')
    const payload = this.encode('snapshot', state)
    this.snapshot = payload
    await this.enqueue(payload)
  }

  private async welcomeSubscribers(writer: TrackWriter): Promise<void> {
    try {
      while (this.active && (await writer.nextSubscriber())) {
        if (!this.active) return
        this.hasSubscriber = true
        await this.sendHello()
        if (this.options.role === 'host' && this.snapshot) await this.enqueue(this.snapshot)
      }
      if (this.active) this.fail(new Error('Published track ended'))
    } finally {
      await this.sending
      writer.free()
    }
  }

  private async discover(watch: MoqNamespaceWatch): Promise<void> {
    for await (const event of watch) {
      if (!this.active) return
      const namespace = event.namespace
      if (namespace.length !== 4 || !namespace.slice(0, 3).every((part, index) => part === this.prefix[index])) continue
      const peerId = namespace[3]
      if (
        !identifier.test(peerId) ||
        peerId === this.publishing[3] ||
        peerId === this.playerId ||
        (this.options.role === 'guest' ? peerId !== 'host' : peerId === 'host')
      )
        continue
      if (event.kind === 'withdrawn') {
        const peer = this.peers.get(peerId)
        if (!peer) continue
        await this.removePeer(peerId, peer, new Error('Host left the room'))
      } else if (event.kind === 'announced' && !this.peers.has(peerId) && this.peers.size < MAX_PLAYERS - 1) {
        const peer: Peer = { sequences: new Map() }
        this.peers.set(peerId, peer)
        if (this.options.role === 'guest') this.startAdmissionTimer()
        void this.follow(namespace, peerId, peer).catch((error) => {
          void this.removePeer(peerId, peer, error).catch((cause) => this.fail(cause))
        })
      }
    }
    if (this.active) this.fail(new Error('Namespace discovery ended'))
  }

  private startAdmissionTimer(): void {
    clearTimeout(this.admissionTimer)
    this.admissionTimer = setTimeout(
      () => this.fail(new Error('Host did not admit this player; the room may be full')),
      admissionTimeoutMs
    )
  }

  private scheduleHostProbe(delayMs: number): void {
    clearTimeout(this.probeTimer)
    this.probeTimer = undefined
    if (!this.active || this.peers.has('host')) return
    this.probeTimer = setTimeout(() => {
      this.probeTimer = undefined
      void this.probeHost()
    }, delayMs)
  }

  /**
   * Subscribes to the host's track without waiting for its announcement. A successful probe registers the host
   * exactly like an announcement would; a probe that loses the race (or arrives after its timeout) is closed.
   * Failed probes are retried and never fail the session.
   */
  private async probeHost(): Promise<void> {
    if (!this.active || this.probing || this.peers.has('host') || !this.session) return
    this.probing = true
    let subscription: MoqSubscription | undefined
    try {
      const pending = this.session.subscribe([...this.prefix, 'host'], 'data', {
        filter: 'nextGroupStart',
        forward: true
      })
      let timer: ReturnType<typeof setTimeout> | undefined
      const timedOut = Symbol('timeout')
      const result = await Promise.race([
        pending,
        new Promise<typeof timedOut>((done) => {
          timer = setTimeout(() => done(timedOut), hostProbeTimeoutMs)
        })
      ]).finally(() => clearTimeout(timer))
      if (result === timedOut) {
        // Close a subscription that only resolves after the timeout.
        void pending.then((late) => late.close()).catch(() => {})
      } else subscription = result
    } catch {
      subscription = undefined
    } finally {
      this.probing = false
    }
    if (!subscription) {
      this.scheduleHostProbe(hostProbeRetryMs)
      return
    }
    if (!this.active || this.peers.has('host')) {
      await subscription.close().catch(() => {})
      return
    }
    const peer: Peer = { sequences: new Map(), subscription }
    this.peers.set('host', peer)
    this.startAdmissionTimer()
    void this.read('host', peer, subscription).catch((error) => {
      void this.removePeer('host', peer, error).catch((cause) => this.fail(cause))
    })
  }

  private async follow(namespace: string[], peerId: string, peer: Peer): Promise<void> {
    let subscription: MoqSubscription
    try {
      subscription = await this.session!.subscribe(namespace, 'data', { filter: 'nextGroupStart', forward: true })
    } catch (error) {
      if (this.active && this.peers.get(peerId) === peer) throw error
      return
    }
    if (!this.active || this.peers.get(peerId) !== peer) {
      await subscription.close()
      return
    }
    peer.subscription = subscription
    await this.read(peerId, peer, subscription)
  }

  /** Reads a followed peer's track until it ends (shared by announcements and the host probe). */
  private async read(peerId: string, peer: Peer, subscription: MoqSubscription): Promise<void> {
    void subscription.done.catch((error) => {
      void this.removePeer(peerId, peer, error).catch((cause) => this.fail(cause))
    })
    for await (const object of subscription) {
      if (!this.active || this.peers.get(peerId) !== peer) return
      if (object.objectStatus === undefined) this.receive(peerId, peer, object.objectPayload)
    }
    if (this.active && this.peers.get(peerId) === peer) throw new Error(`Peer track ended: ${peerId}`)
  }

  private async removePeer(peerId: string, peer: Peer, reason: unknown): Promise<void> {
    if (!this.active || this.peers.get(peerId) !== peer) return
    this.peers.delete(peerId)
    void peer.subscription?.close().catch(() => {})
    if (this.options.role === 'guest') {
      this.fail(reason)
    } else if (this.players.delete(peerId)) {
      this.options.onPresence([...this.players])
      await this.sendHello()
    }
  }

  private encode(type: string, data: unknown): Uint8Array {
    if (data === undefined) throw new Error('Payload must be JSON serializable')
    const payload = encoder.encode(
      JSON.stringify({ v: 1, type, sequence: this.sequence++, playerId: this.playerId, data })
    )
    if (payload.length > MAX_PAYLOAD_BYTES) throw new Error('Payload exceeds 64 KiB')
    return payload
  }

  private sendHello(): Promise<void> {
    return this.enqueue(
      this.encode(
        this.options.role === 'host' ? 'presence' : 'hello',
        this.options.role === 'host' ? [...this.players] : null
      )
    )
  }

  private receive(peerId: string, peer: Peer, payload: Uint8Array): void {
    if (!payload.length || payload.length > MAX_PAYLOAD_BYTES) return
    let message
    try {
      message = JSON.parse(decoder.decode(payload))
    } catch {
      return
    }
    if (
      !message ||
      message.v !== 1 ||
      !Number.isSafeInteger(message.sequence) ||
      message.sequence < 0 ||
      typeof message.playerId !== 'string' ||
      !identifier.test(message.playerId) ||
      !Object.hasOwn(message, 'data')
    )
      return
    const previous = peer.sequences.get(message.type) ?? -1
    if (message.sequence <= previous) return
    if (this.options.role === 'host') {
      if (message.playerId !== peerId || !['hello', 'input'].includes(message.type)) return
      peer.sequences.set(message.type, message.sequence)
      if (message.type === 'hello') {
        if (this.players.has(peerId)) return
        this.players.add(peerId)
        this.options.onPresence([...this.players])
        void this.sendHello().catch((error) => this.fail(error))
      } else if (this.players.has(peerId)) this.options.onInput(peerId, message.data)
    } else {
      if (message.type !== 'presence' && message.type !== 'snapshot') return
      if (
        message.type === 'presence' &&
        (!Array.isArray(message.data) ||
          !message.data.length ||
          message.data.length > MAX_PLAYERS ||
          !message.data.every((id: unknown) => typeof id === 'string' && identifier.test(id)) ||
          !message.data.includes(message.playerId) ||
          new Set(message.data).size !== message.data.length)
      )
        return
      peer.sequences.set(message.type, message.sequence)
      if (message.type === 'presence') {
        this.options.onPresence(message.data)
        if (message.data.includes(this.playerId)) {
          this.joined = true
          clearTimeout(this.admissionTimer)
          this.admissionTimer = undefined
          this.options.onStatus('ready', 'Connected to host')
        } else if (this.joined) this.fail(new Error('Host stopped receiving this player'))
        else if (message.data.length === MAX_PLAYERS) this.fail(new Error('Room is full'))
      } else this.options.onSnapshot(message.data)
    }
  }

  private enqueue(payload: Uint8Array): Promise<void> {
    if (!this.active) return Promise.reject(new Error('Network is not active'))
    if (this.pending >= 32) return Promise.reject(new Error('Network send queue is full'))
    this.pending++
    const operation = this.sending
      .then(async () => {
        if (this.active) await this.writer!.writeGroup(payload)
      })
      .finally(() => {
        this.pending--
      })
    this.sending = operation.catch((error) => this.fail(error))
    return operation
  }

  private fail(error: unknown): void {
    if (!this.active) return
    this.options.onStatus('error', `${String(error)}. Create a new connection to retry.`)
    void this.stop(false)
  }

  stop(reportStopped = true): Promise<void> {
    if (this.stopping) return this.stopping
    this.started = true
    this.active = false
    clearTimeout(this.admissionTimer)
    this.admissionTimer = undefined
    clearTimeout(this.probeTimer)
    this.probeTimer = undefined
    this.session?.close()
    const cleanup: Promise<unknown>[] = []
    if (this.publishingTask) cleanup.push(this.publishingTask)
    if (this.watch) cleanup.push(this.watch.close())
    for (const peer of this.peers.values()) if (peer.subscription) cleanup.push(peer.subscription.close())
    if (this.announcement) {
      const announcement = this.announcement
      cleanup.push(announcement.close().finally(() => announcement.free()))
    }
    this.peers.clear()
    this.players.clear()
    this.snapshot = undefined
    this.stopping = Promise.allSettled(cleanup).then((results) => {
      if (results.some((result) => result.status === 'rejected'))
        this.options.onStatus('error', 'Relay cleanup failed. Reload before reconnecting.')
      else if (reportStopped) this.options.onStatus('stopped', 'Disconnected')
    })
    return this.stopping
  }
}
