import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const network = vi.hoisted(() => {
  type Packet = { receiver: Session; alias: bigint; group: bigint; payload: Uint8Array; frame: Record<string, unknown> }
  const broker: {
    sessions: Session[]
    links: Map<bigint, { sender: Session; receiver: Session; requestId: bigint }>
    next: bigint
    drop?: (packet: Packet) => boolean
    hold?: (packet: Packet) => boolean
    pending: Packet[]
    connectBarrier?: Promise<void>
    deliver: (packet: Packet) => void
  } = {
    sessions: [],
    links: new Map(),
    next: 1n,
    pending: [],
    deliver: (packet) => packet.receiver.objects.get(packet.alias)?.(0n, { objectPayload: packet.payload })
  }
  const same = (first?: string[], second?: string[]) =>
    !!first && !!second && first.length === second.length && first.every((part, index) => part === second[index])

  class Session {
    connected = false
    namespace?: string[]
    following?: string[]
    objects = new Map<bigint, (group: bigint, object: { objectPayload: Uint8Array }) => void>()
    onClosed?: () => void
    onSubscribe?: (context: any) => Promise<void>
    onUnsubscribe?: (requestId: bigint) => void
    onAnnouncement?: (context: any) => Promise<void>
    onDone?: (message: { trackNamespace: string[] }) => void
    disconnectCount = 0
    raw = {
      sendSubgroupHeader: async () => {},
      sendSubgroupObject: async (
        alias: bigint,
        group: bigint,
        _subgroup: bigint,
        _object: bigint,
        status: number | undefined,
        payload: Uint8Array
      ) => {
        if (status !== undefined) return
        const link = broker.links.get(alias)
        if (!link) throw new Error('No subscriber')
        const packet = {
          receiver: link.receiver,
          alias,
          group,
          payload: payload.slice(),
          frame: JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>
        }
        if (broker.drop?.(packet)) return
        if (broker.hold?.(packet)) broker.pending.push(packet)
        else broker.deliver(packet)
      }
    }
    constructor() {
      broker.sessions.push(this)
    }
    async connect() {
      if (broker.connectBarrier) await broker.connectBarrier
      this.connected = true
    }
    async disconnect() {
      this.disconnectCount++
      if (!this.connected) return
      this.connected = false
      for (const session of broker.sessions) {
        if (session !== this && same(session.following, this.namespace))
          session.onDone?.({ trackNamespace: this.namespace! })
      }
      for (const [alias, link] of broker.links) {
        if (link.receiver === this) link.sender.onUnsubscribe?.(link.requestId)
        if (link.receiver === this || link.sender === this) broker.links.delete(alias)
      }
    }
    getRawClient() {
      return this.connected ? this.raw : null
    }
    setOnConnectionClosedHandler(handler: () => void) {
      this.onClosed = handler
    }
    setOnIncomingSubscribeHandler(handler: (context: any) => Promise<void>) {
      this.onSubscribe = handler
    }
    setOnIncomingUnsubscribeHandler(handler: (requestId: bigint) => void) {
      this.onUnsubscribe = handler
    }
    setOnPublishNamespaceDoneHandler(handler: (message: { trackNamespace: string[] }) => void) {
      this.onDone = handler
    }
    setOnPublishNamespaceHandler(handler: (context: any) => Promise<void>) {
      this.onAnnouncement = handler
    }
    setOnSubgroupObjectHandler(alias: bigint, handler: (group: bigint, object: { objectPayload: Uint8Array }) => void) {
      this.objects.set(alias, handler)
    }
    clearSubgroupObjectHandler(alias: bigint) {
      this.objects.delete(alias)
    }
    async publishNamespace(namespace: string[]) {
      this.namespace = namespace
      for (const session of broker.sessions) {
        if (session.connected && same(session.following, namespace)) await session.announce(namespace)
      }
    }
    async subscribeNamespace(namespace: string[]) {
      this.following = namespace
      if (broker.sessions.some((session) => session.connected && same(session.namespace, namespace)))
        await this.announce(namespace)
    }
    async announce(namespace: string[]) {
      await this.onAnnouncement?.({ publishNamespace: { trackNamespace: namespace }, respondOk: async () => {} })
    }
    async subscribe(namespace: string[], track: string) {
      const publisher = broker.sessions.find((session) => session.connected && same(session.namespace, namespace))
      if (!publisher?.onSubscribe) throw new Error('Publisher unavailable')
      const requestId = broker.next++
      const alias = broker.next++
      let accepted = false
      await publisher.onSubscribe({
        subscribe: { trackNamespace: namespace, trackName: track, requestId },
        isSuccess: true,
        code: 0,
        respondOk: async () => {
          accepted = true
          broker.links.set(alias, { sender: publisher, receiver: this, requestId })
          return alias
        },
        respondError: async () => {}
      })
      if (!accepted) throw new Error('Subscription rejected')
      return { requestId, subscribeOk: { trackAlias: alias } }
    }
  }
  return { broker, Session }
})

vi.mock('../../../../lib/moqt/moqtClient', () => ({
  MoqtClientWrapper: network.Session,
  RequestErrorCode: { TrackDoesNotExist: 4n }
}))

import { HorrorPeer, createRoomCode, type PeerStatus } from '../src/peer'
import { RITUAL_STEPS } from '../src/ritual'

const peers: HorrorPeer[] = []
const room = 'a'.repeat(32)

function createPeer(role: 'host' | 'guest', code = room) {
  const received = vi.fn()
  const status = vi.fn<(value: PeerStatus, message: string) => void>()
  const peer = new HorrorPeer({
    role,
    room: code,
    relayUrl: 'https://relay.invalid:4433',
    onMessage: received,
    onStatus: status
  })
  peers.push(peer)
  return { peer, received, status }
}

async function pair() {
  const host = createPeer('host')
  const guest = createPeer('guest')
  await host.peer.connect()
  await guest.peer.connect()
  await vi.waitFor(
    () => {
      expect(host.status).toHaveBeenCalledWith('connected', expect.any(String))
      expect(guest.status).toHaveBeenCalledWith('connected', expect.any(String))
    },
    { interval: 20, timeout: 3000 }
  )
  return { host, guest }
}

beforeEach(() => {
  network.broker.sessions.length = 0
  network.broker.links.clear()
  network.broker.pending.length = 0
  network.broker.next = 1n
  network.broker.drop = undefined
  network.broker.hold = undefined
  network.broker.connectBarrier = undefined
})

afterEach(() => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pagehide'))
  for (const peer of peers.splice(0)) peer.close()
  vi.unstubAllGlobals()
  vi.doUnmock('../src/world')
  vi.doUnmock('../src/sound')
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function mountMain(role: 'host' | 'guest', microphone = true, connect = true) {
  vi.useFakeTimers()
  vi.resetModules()
  const elements = new Map<string, any>()
  const element = (id: string) => {
    if (!elements.has(id))
      elements.set(id, {
        value: '',
        disabled: false,
        parentElement: { insertAdjacentHTML: vi.fn() },
        insertAdjacentHTML() {},
        replaceChildren() {},
        setAttribute() {}
      })
    return elements.get(id)
  }
  element('threshold').value = '0.1'
  element('volume').value = '0.2'
  element('relay-url').value = 'https://relay.invalid:4433'
  element('room-code').value = room
  element('ready').disabled = true
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    querySelector: element,
    getElementById: element,
    createElement: () => ({ textContent: '' }),
    exitPointerLock() {}
  })
  const createTrack = () => ({
    readyState: 'live',
    enabled: true,
    muted: false,
    stop() {
      this.readyState = 'ended'
    }
  })
  let track = createTrack()
  let frame!: FrameRequestCallback
  vi.stubGlobal('document', document)
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => {
        const currentTrack = (track = createTrack())
        return { getAudioTracks: () => [currentTrack], getTracks: () => [currentTrack] }
      }
    }
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  for (const name of [
    'HTMLElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLButtonElement',
    'HTMLSelectElement'
  ])
    vi.stubGlobal(name, class {})
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
  let audioContext!: { state: string; onstatechange?: () => void }
  const microphoneSignal = { amplitude: 0 }
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running'
      sampleRate = 48000
      constructor() {
        audioContext = this
      }
      async resume() {}
      async close() {}
      createAnalyser() {
        return {
          fftSize: 8192,
          getFloatTimeDomainData(samples: Float32Array) {
            for (let index = 0; index < samples.length; index++)
              samples[index] = microphoneSignal.amplitude * Math.sin((index * 2 * Math.PI * 220) / 48000)
          }
        }
      }
      createMediaStreamSource() {
        return { connect() {} }
      }
    }
  )
  const rendered = vi.fn()
  const drawing = {
    lost: false,
    needsRedraw: false,
    restored: false,
    failRender: false,
    disposed: false,
    onLost: undefined as (() => void) | undefined,
    lose(event = true) {
      this.lost = true
      this.needsRedraw = true
      this.restored = false
      if (event && !this.disposed) this.onLost?.()
    },
    restore() {
      this.lost = false
      this.restored = true
    }
  }
  vi.doMock('../src/world', async () => ({
    ...(await vi.importActual('../src/world')),
    HorrorWorld: class {
      constructor(_container: HTMLElement, onLost?: () => void) {
        drawing.onLost = onLost
      }
      get isHealthy() {
        return !drawing.disposed && !drawing.lost && !drawing.needsRedraw
      }
      render(frame: import('../src/world').WorldFrame) {
        if (drawing.disposed || drawing.lost || (drawing.needsRedraw && !drawing.restored)) return
        rendered(frame)
        if (!drawing.failRender) drawing.needsRedraw = false
      }
      resize() {}
      dispose() {
        drawing.disposed = true
      }
    }
  }))
  const ritualBell = vi.fn()
  const previewSound = {
    active: false,
    previewBell: vi.fn(() => {
      previewSound.active = true
      return true
    }),
    stopPreview: vi.fn(() => {
      previewSound.active = false
    }),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    trigger: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn()
  }
  vi.doMock('../src/sound', () => ({
    YashikiSound: class {
      get isPreviewing() {
        return previewSound.active
      }
      previewBell = previewSound.previewBell
      stopPreview = previewSound.stopPreview
      setVolume = previewSound.setVolume
      setMuted = previewSound.setMuted
      start() {
        previewSound.start()
        this.stopPreview()
      }
      stop() {
        previewSound.stop()
        this.stopPreview()
      }
      trigger = previewSound.trigger
      footstep() {}
      ritualBell = ritualBell
      dispose() {
        previewSound.dispose()
        this.stopPreview()
      }
    }
  }))
  const { HorrorMatch } = await import('../src/match')
  const snapshots = vi.spyOn(HorrorMatch.prototype, 'getSnapshot')
  await import('../src/main')
  const match = snapshots.mock.contexts[0]! as InstanceType<typeof HorrorMatch>
  if (connect && role === 'host') await element(role).onclick()
  const partner = createPeer(role === 'host' ? 'guest' : 'host', element('room-code').value)
  if (connect) {
    await partner.peer.connect()
    if (role === 'guest') await element(role).onclick()
    await vi.advanceTimersByTimeAsync(300)
    expect(element('connection').textContent).toBe('MoQで相手と接続しました')
  }
  if (microphone) await element('microphone').onclick()
  let hostChallenge = 0
  const epoch = () =>
    role === 'host'
      ? (partner.received.mock.calls
          .map(([value]) => value as any)
          .filter((value) => value.type === 'state')
          .at(-1)?.readinessEpoch ?? 1)
      : 0
  const health = async (threshold = 0.1, extra: Record<string, unknown> = {}) => {
    const sent = partner.received.mock.calls
      .map(([value]) => value as any)
      .filter((value) => value.type === 'health')
      .at(-1)
    partner.peer.send({
      type: 'health',
      mic: true,
      rms: 0,
      voiced: false,
      threshold,
      challenge: role === 'host' ? sent.challenge : ++hostChallenge,
      phase: 'lobby',
      playing: false,
      epoch: epoch(),
      ...extra
    })
    await vi.advanceTimersByTimeAsync(0)
  }
  const step = async (milliseconds = 100, threshold = 0.1, extra: Record<string, unknown> = {}) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 100) {
      await vi.advanceTimersByTimeAsync(100)
      frame(performance.now())
      await vi.advanceTimersByTimeAsync(0)
      await health(threshold, extra)
    }
  }
  if (connect) await health()
  expect(element('ready').disabled).toBe(!microphone || !connect)
  let stateSequence = 0
  const state = async (readinessEpoch: number, extra: Record<string, unknown> = {}) => {
    const { ritualForMatch } = await import('../src/sync')
    const { spiritForMatch } = await import('../src/spirit')
    const { HUMAN_START, HAUNTER_START } = await import('../src/world')
    const snapshot = match.getSnapshot()
    partner.peer.send({
      type: 'state',
      sequence: ++stateSequence,
      readinessEpoch,
      snapshot,
      human: { ...HUMAN_START },
      haunter: { ...HAUNTER_START },
      effect: null,
      ritual: ritualForMatch(null, snapshot),
      spirit: spiritForMatch(null, snapshot),
      ...extra
    })
    await vi.advanceTimersByTimeAsync(0)
  }
  const mouse = (movementX: number, movementY = 0) => {
    Object.assign(document, { pointerLockElement: element('world') })
    document.dispatchEvent(Object.assign(new Event('mousemove'), { movementX, movementY }))
  }
  const key = (code: string, down = true) =>
    window.dispatchEvent(Object.assign(new Event(down ? 'keydown' : 'keyup'), { code, repeat: false }))
  const globals = { document, window, requestAnimationFrame }
  return {
    visibility: (hidden: boolean, event = true) => {
      document.hidden = hidden
      if (event) document.dispatchEvent(new Event('visibilitychange'))
    },
    activate: () => {
      for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)
    },
    close: () => globals.window.dispatchEvent(new Event('pagehide')),
    element,
    partner,
    health,
    step,
    get track() {
      return track as typeof track & { onmute(): void; onunmute(): void; onended(): void }
    },
    audioContext,
    microphoneSignal,
    epoch,
    match,
    rendered,
    drawing,
    ritualBell,
    previewSound,
    state,
    mouse,
    key,
    render: () => frame(performance.now()),
    renderAt: (timestamp: number) => frame(timestamp)
  }
}

describe('main epoch health handoff through two actual offline peers', () => {
  async function mountPair() {
    const host = await mountMain('host', true, false)
    const guest = await mountMain('guest', true, false)
    const deliver = network.broker.deliver
    const owners = new Map<(typeof network.broker.sessions)[number], typeof host>()
    network.broker.deliver = (packet) => {
      const globals = { document, window, requestAnimationFrame }
      owners.get(packet.receiver)?.activate()
      try {
        deliver(packet)
      } finally {
        for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)
      }
    }
    host.activate()
    host.element('host').onclick()
    const hostSession = network.broker.sessions.at(-1)!
    owners.set(hostSession, host)
    guest.element('room-code').value = host.element('room-code').value
    guest.activate()
    guest.element('guest').onclick()
    const guestSession = network.broker.sessions.at(-1)!
    owners.set(guestSession, guest)
    await vi.advanceTimersByTimeAsync(300)
    const render = async (ui: typeof host) => {
      ui.activate()
      ui.render()
      await vi.advanceTimersByTimeAsync(0)
    }
    await render(host)
    await render(guest)
    expect(host.element('ready').disabled).toBe(false)
    expect(guest.element('ready').disabled).toBe(false)
    const close = () => {
      network.broker.hold = undefined
      host.activate()
      host.close()
      guest.activate()
      guest.close()
      network.broker.deliver = deliver
    }
    return { host, guest, hostSession, guestSession, render, close }
  }

  for (const round of ['round1', 'round2'] as const) {
    for (const role of ['host', 'guest'] as const) {
      it.each([-1, 1])(
        role + ' ' + round + ' keeps both views synchronized through yaw wrapping in direction %s',
        async (sign) => {
          const pair = await mountPair()
          const { host, guest, render } = pair
          const ready = async () => {
            host.activate()
            host.element('ready').onclick()
            guest.activate()
            guest.element('ready').onclick()
            await vi.advanceTimersByTimeAsync(0)
          }
          try {
            await ready()
            if (round === 'round2') {
              host.match.tick(900000)
              await vi.advanceTimersByTimeAsync(100)
              await render(host)
              await render(guest)
              await ready()
            }
            const turning = role === 'host' ? host : guest
            const pose = host.match.getSnapshot().survivor === role ? 'human' : 'haunter'
            await render(host)
            let heading = host.rendered.mock.lastCall![0][pose].yaw
            for (const radians of role === 'host' ? [9999.5, 0.5, 0.5] : Array<number>(12).fill(1)) {
              heading += sign * radians
              turning.activate()
              turning.mouse((sign * radians) / 0.002)
              await vi.advanceTimersByTimeAsync(100)
              await render(guest)
              await render(host)
              await vi.advanceTimersByTimeAsync(100)
              await render(host)
              await render(guest)
              const authoritative = host.rendered.mock.lastCall![0]
              const received = guest.rendered.mock.lastCall![0]
              expect.soft(Math.abs(authoritative[pose].yaw)).toBeLessThanOrEqual(2 * Math.PI)
              expect(Math.sin(authoritative[pose].yaw)).toBeCloseTo(Math.sin(heading), 12)
              expect(Math.cos(authoritative[pose].yaw)).toBeCloseTo(Math.cos(heading), 12)
              expect(received.human).toEqual(authoritative.human)
              expect(received.haunter).toEqual(authoritative.haunter)
              expect(guest.element('timer').textContent).toBe(host.element('timer').textContent)
              expect(host.match.getSnapshot()).toMatchObject({ phase: round, paused: false })
            }
            host.match.tick(900000)
            await vi.advanceTimersByTimeAsync(100)
            await render(host)
            await render(guest)
            expect(host.match.getSnapshot().phase).toBe(round === 'round1' ? 'intermission' : 'finished')
            expect(guest.element('phase').textContent).toBe(host.element('phase').textContent)
            expect(guest.element('timer').textContent).toBe(host.element('timer').textContent)
          } finally {
            pair.close()
          }
        }
      )
    }
  }

  for (const role of ['host', 'guest'] as const) {
    for (const round of ['round1', 'round2'] as const) {
      it(role + ' ' + round + ' stops simulated hidden play despite continuous frames and healthy peers', async () => {
        const pair = await mountPair()
        const { host, guest, render } = pair
        const ready = async () => {
          host.activate()
          host.element('ready').onclick()
          guest.activate()
          guest.element('ready').onclick()
          await vi.advanceTimersByTimeAsync(0)
        }
        try {
          await ready()
          if (round === 'round2') {
            host.match.tick(900000)
            await vi.advanceTimersByTimeAsync(100)
            await render(host)
            await render(guest)
            await ready()
          }
          host.microphoneSignal.amplitude = 0.8
          guest.microphoneSignal.amplitude = 0.8
          for (let count = 0; count < 4; count++) {
            await vi.advanceTimersByTimeAsync(100)
            await render(host)
            await render(guest)
          }
          expect(host.match.getSnapshot()).toMatchObject({ phase: round, paused: false })
          const before = host.match.getSnapshot()
          expect(before.scores[before.survivor]).toBeLessThan(0)
          const visual = host.rendered.mock.lastCall![0]
          const hidden = role === 'host' ? host : guest
          hidden.activate()
          hidden.key('KeyW')
          hidden.visibility(true)
          await vi.advanceTimersByTimeAsync(0)
          host.previewSound.start.mockClear()
          guest.previewSound.start.mockClear()
          for (let count = 0; count < 10; count++) {
            await vi.advanceTimersByTimeAsync(100)
            await render(host)
            await render(guest)
          }
          expect.soft(host.match.getSnapshot().elapsedMs).toBe(before.elapsedMs)
          expect.soft(host.match.getSnapshot().scores).toEqual(before.scores)
          expect.soft(host.rendered.mock.lastCall![0]).toMatchObject({ human: visual.human, haunter: visual.haunter })
          expect(host.match.getSnapshot()).toEqual({ ...before, paused: true })
          expect(hidden.element('ready').disabled).toBe(true)
          expect(host.previewSound.start).not.toHaveBeenCalled()
          expect(guest.previewSound.start).not.toHaveBeenCalled()
          hidden.activate()
          hidden.visibility(false)
          await render(hidden)
          expect(host.match.getSnapshot().paused).toBe(true)
          hidden.element('ready').onclick()
          await vi.advanceTimersByTimeAsync(0)
          expect(host.match.getSnapshot().paused).toBe(true)
          const other = role === 'host' ? guest : host
          other.activate()
          other.element('ready').onclick()
          await vi.advanceTimersByTimeAsync(0)
          expect(host.match.getSnapshot()).toMatchObject({ phase: round, paused: false })
          await vi.advanceTimersByTimeAsync(100)
          await render(host)
          await render(guest)
          expect(host.match.getSnapshot().elapsedMs).toBeGreaterThan(before.elapsedMs)
        } finally {
          pair.close()
        }
      })
    }
  }

  for (const preparation of ['start', 'resume', 'second night'] as const) {
    it.each([499, 500, 501])('answers delayed ' + preparation + ' at %ims before the next guest frame', async (age) => {
      const pair = await mountPair()
      const { host, guest, hostSession, guestSession, render } = pair
      try {
        const ready = async () => {
          host.activate()
          host.element('ready').onclick()
          guest.activate()
          guest.element('ready').onclick()
          await vi.advanceTimersByTimeAsync(0)
        }
        if (preparation !== 'start') {
          await ready()
          if (preparation === 'resume') {
            host.activate()
            host.track.onmute()
          } else host.match.tick(900000)
          await vi.advanceTimersByTimeAsync(100)
          await render(host)
          await render(guest)
          expect(host.element('ready').disabled).toBe(false)
          expect(guest.element('ready').disabled).toBe(false)
        }
        const previousPhase = guest.element('phase').textContent
        network.broker.hold = (packet) => packet.receiver === guestSession && packet.frame.category === 'state'
        await ready()
        const phase = preparation === 'second night' ? 'round2' : 'round1'
        expect(host.match.getSnapshot().phase).toBe(phase)
        expect(host.match.getSnapshot().paused).toBe(false)
        const started = performance.now()
        for (let elapsed = 100; elapsed <= 400; elapsed += 100) {
          await vi.advanceTimersByTimeAsync(100)
          await render(host)
          await render(guest)
        }
        await vi.advanceTimersByTimeAsync(age - 400)
        if (age <= 500) await render(host)
        const state = network.broker.pending.at(-1)!
        const epoch = (state.frame.value as any).readinessEpoch
        expect(guest.element('phase').textContent).toBe(previousPhase)
        const health: any[] = []
        network.broker.hold = (packet) => {
          if (packet.receiver === hostSession && packet.frame.category === 'health') health.push(packet.frame.value)
          return packet.receiver === guestSession && packet.frame.category === 'state'
        }
        network.broker.deliver(state)
        await vi.advanceTimersByTimeAsync(0)
        expect(performance.now() - started).toBe(age)
        expect(guest.element('phase').textContent).toBe(preparation === 'second night' ? '第二夜' : '第一夜')
        expect(health).toEqual([expect.objectContaining({ epoch, mic: true, voiced: false, phase, playing: true })])
        await vi.advanceTimersByTimeAsync(Math.max(0, 501 - age))
        await render(host)
        expect(host.match.getSnapshot().paused).toBe(age > 500)
        expect(host.match.getSnapshot().scores).toEqual({ host: 0, guest: 0 })
        expect(host.element('threshold').disabled).toBe(true)
        expect(guest.element('threshold').disabled).toBe(true)
      } finally {
        pair.close()
      }
    })
  }

  it('still expires when the new epoch reply is dropped despite old epoch periodic health', async () => {
    const pair = await mountPair()
    const { host, guest, hostSession, guestSession, render } = pair
    try {
      network.broker.hold = (packet) => packet.receiver === guestSession && packet.frame.category === 'state'
      host.activate()
      host.element('ready').onclick()
      guest.activate()
      guest.element('ready').onclick()
      await vi.advanceTimersByTimeAsync(0)
      for (let elapsed = 100; elapsed <= 400; elapsed += 100) {
        await vi.advanceTimersByTimeAsync(100)
        await render(host)
        await render(guest)
      }
      await vi.advanceTimersByTimeAsync(99)
      const state = network.broker.pending.at(-1)!
      network.broker.drop = (packet) => packet.receiver === hostSession && packet.frame.category === 'health'
      network.broker.deliver(state)
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(2)
      await render(host)
      expect(host.match.getSnapshot().paused).toBe(true)
      expect(host.element('notice').textContent).toBe('相手の応答がありません。')
      network.broker.drop = undefined
      await render(guest)
      await render(host)
      expect(host.match.getSnapshot().paused).toBe(true)
      expect(host.match.getSnapshot().scores).toEqual({ host: 0, guest: 0 })
    } finally {
      pair.close()
    }
  })

  it('does not respond again to duplicate, same epoch, reversed or invalid states', async () => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(1)
    await ui.health(0.1, { epoch: 1 })
    ui.microphoneSignal.amplitude = 0.4
    await ui.step(100, 0.1, { epoch: 1 })
    expect(ui.partner.received.mock.calls.some(([value]) => value.type === 'health' && value.voiced)).toBe(true)
    ui.partner.received.mockClear()
    ui.match.pause()
    await ui.state(2)
    for (const extra of [{}, { sequence: 1 }, { readinessEpoch: 1 }, { snapshot: { phase: 'invalid' } }])
      await ui.state(2, extra)
    const health = ui.partner.received.mock.calls.map(([value]) => value).filter((value) => value.type === 'health')
    expect(health).toEqual([expect.objectContaining({ epoch: 2, mic: true, voiced: false, playing: false })])
    expect(ui.element('threshold').disabled).toBe(false)
    await ui.state(3)
    expect(ui.partner.received.mock.calls.filter(([value]) => value.type === 'health')).toHaveLength(2)
  })

  it.each([
    'muted mic',
    'suspended audio',
    'drawing loss',
    'expired health',
    'invalid health',
    'pending stop'
  ] as const)('does not send healthy epoch handoff with %s', async (failure) => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(1)
    if (failure === 'muted mic') ui.track.muted = true
    else if (failure === 'suspended audio') ui.audioContext.state = 'suspended'
    else if (failure === 'drawing loss') ui.drawing.lost = true
    else if (failure === 'expired health') await vi.advanceTimersByTimeAsync(501)
    else if (failure === 'invalid health') await ui.health(0.1, { epoch: 1, mic: 'invalid' })
    else ui.track.onmute()
    ui.partner.received.mockClear()
    await ui.state(2)
    const messages = ui.partner.received.mock.calls.map(([value]) => value)
    expect(messages.filter((value) => value.type === 'health' && value.epoch === 2 && value.mic)).toEqual([])
    expect(ui.element('ready').disabled).toBe(true)
    expect(ui.previewSound.stop).toHaveBeenCalled()
  })

  it.each(['rejected', 'transport failure'] as const)('stays stopped when epoch health is %s', async (failure) => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(1)
    if (failure === 'rejected') {
      const { HorrorPeer } = await import('../src/peer')
      const original = HorrorPeer.prototype.send
      vi.spyOn(HorrorPeer.prototype, 'send').mockImplementation(function (value: any) {
        if (value.type === 'health' && value.epoch === 2) return false
        return original.call(this, value)
      })
    } else {
      vi.spyOn(network.broker.sessions.at(-1)!.raw, 'sendSubgroupObject').mockRejectedValueOnce(new Error('offline'))
    }
    await ui.state(2)
    expect(ui.element('ready').disabled).toBe(true)
    expect(ui.previewSound.stop).toHaveBeenCalled()
    expect(ui.element('notice').textContent).toContain(failure === 'rejected' ? 'MoQ接続' : 'MoQ接続が切れ')
    await ui.state(3)
    expect(ui.element('ready').disabled).toBe(true)
  })

  it.each([500, 501])('does not renew health from a frame older than 500ms at %ims', async (age) => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(1)
    ui.render()
    await vi.advanceTimersByTimeAsync(500)
    await ui.health(0.1, { epoch: 1 })
    await vi.advanceTimersByTimeAsync(age - 500)
    ui.partner.received.mockClear()
    await ui.state(2)
    const health = ui.partner.received.mock.calls
      .map(([value]) => value)
      .filter((value) => value.type === 'health' && value.epoch === 2 && value.mic)
    expect(health).toHaveLength(age === 500 ? 1 : 0)
  })

  it('leaves same epoch responses to the existing periodic health send', async () => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(1)
    ui.render()
    await vi.advanceTimersByTimeAsync(100)
    ui.partner.received.mockClear()
    await ui.state(1)
    expect(ui.partner.received.mock.calls.filter(([value]) => value.type === 'health')).toHaveLength(0)
    ui.render()
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.partner.received.mock.calls.filter(([value]) => value.type === 'health')).toEqual([
      [expect.objectContaining({ epoch: 1, mic: true, playing: true })]
    ])
  })

  it('does not send health for the finished epoch after releasing media and drawing', async () => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(1)
    ui.match.tick(900000)
    await ui.state(2)
    ui.match.startSecondRound()
    await ui.state(3)
    ui.partner.received.mockClear()
    ui.match.tick(900000)
    await ui.state(4)
    expect(ui.partner.received.mock.calls.filter(([value]) => value.type === 'health')).toHaveLength(0)
    expect(ui.element('ready').disabled).toBe(true)
    expect(ui.drawing.disposed).toBe(true)
    expect(ui.previewSound.dispose).toHaveBeenCalled()
  })
})

describe('main WebGL interruption through the offline peer broker', () => {
  type Main = Awaited<ReturnType<typeof mountMain>>
  const messages = (ui: Main, type: string) =>
    ui.partner.received.mock.calls.map(([value]) => value as any).filter((value) => value.type === type)
  const ready = async (ui: Main, epoch = ui.epoch()) => {
    ui.partner.peer.send({ type: 'ready', value: true, epoch, threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
  }
  const start = async (ui: Main, role: 'host' | 'guest', round: 'round1' | 'round2') => {
    if (role === 'host') {
      await ui.step()
      ui.element('ready').onclick()
      await ready(ui)
      if (round === 'round2') {
        ui.match.tick(900000)
        await ui.step()
        ui.element('ready').onclick()
        await ready(ui)
      }
      await ui.step()
    } else {
      ui.match.start()
      if (round === 'round2') {
        ui.match.tick(900000)
        ui.match.startSecondRound()
      }
      await ui.state(2)
      await ui.step(100, 0.1, { epoch: 2, phase: round, playing: true })
    }
  }

  for (const role of ['host', 'guest'] as const) {
    for (const round of ['round1', 'round2'] as const) {
      it.each(['event', 'ready', 'key', 'mouse', 'health', 'input', 'effect', 'ritual', 'frame', 'preview', 'pointer'])(
        role + ' ' + round + ' stops simulated hidden at %s without relaxing health freshness',
        async (boundary) => {
          const ui = await mountMain(role)
          await start(ui, role, round)
          const before = ui.match.getSnapshot()
          const visual = ui.rendered.mock.lastCall![0]
          ui.visibility(true, boundary === 'event')
          if (boundary === 'ready') ui.element('ready').onclick()
          else if (boundary === 'key') ui.key('KeyW')
          else if (boundary === 'mouse') ui.mouse(100, 100)
          else if (boundary === 'preview') ui.element('sound-preview').onclick()
          else if (boundary === 'pointer') ui.element('world').onclick()
          else if (['health', 'input', 'effect', 'ritual'].includes(boundary)) {
            if (boundary === 'health') await ui.health(0.1, { epoch: role === 'host' ? ui.epoch() : 2 })
            else
              ui.partner.peer.send({
                type: boundary,
                epoch: role === 'host' ? ui.epoch() : 2,
                sequence: 1,
                round,
                forward: 1,
                strafe: 0,
                turnTotal: 1,
                requestId: 1,
                kind: 'rattle',
                step: 'desk'
              })
            await vi.advanceTimersByTimeAsync(0)
          } else if (boundary === 'frame') await ui.step()
          await vi.advanceTimersByTimeAsync(0)
          expect(ui.previewSound.stop).toHaveBeenCalled()
          const epoch = role === 'host' ? ui.epoch() : 2
          if (role === 'host') expect(ui.match.getSnapshot()).toEqual({ ...before, paused: true })
          else expect(messages(ui, 'stop')[0]).toEqual({ type: 'stop', requestId: 1, epoch })
          const inputs = messages(ui, 'input').length
          ui.previewSound.start.mockClear()
          ui.microphoneSignal.amplitude = 0.8
          ui.visibility(true)
          ui.key('ArrowUp')
          ui.key('ArrowRight')
          ui.mouse(100, 100)
          ui.element('ready').onclick()
          await ready(ui, epoch)
          await ui.step(400, 0.1, { epoch, phase: round, playing: true })
          expect(ui.element('ready').disabled).toBe(true)
          expect(messages(ui, 'input')).toHaveLength(inputs)
          expect(ui.rendered.mock.lastCall![0]).toMatchObject({
            human: visual.human,
            haunter: visual.haunter,
            pitch: visual.pitch
          })
          expect(ui.previewSound.start).not.toHaveBeenCalled()
          expect(ui.previewSound.trigger).not.toHaveBeenCalled()
          expect(ui.ritualBell).not.toHaveBeenCalled()
          if (role === 'host') {
            expect(ui.match.getSnapshot()).toEqual({ ...before, paused: true })
            expect(ui.epoch()).toBe(epoch)
          } else expect(messages(ui, 'stop').every((message) => message.requestId === 1)).toBe(true)
          expect(messages(ui, 'health').at(-1).mic).toBe(true)
        }
      )

      it.each(['event', 'ready', 'key', 'mouse', 'health', 'input', 'effect', 'ritual', 'frame'])(
        role + ' ' + round + ' stops on loss detected by %s with fresh microphone health',
        async (boundary) => {
          const ui = await mountMain(role)
          await start(ui, role, round)
          const before = ui.match.getSnapshot()
          const visual = ui.rendered.mock.lastCall![0]
          ui.microphoneSignal.amplitude = 0.8
          ui.previewSound.stop.mockClear()
          ui.drawing.lose(boundary === 'event')
          if (boundary === 'ready') ui.element('ready').onclick()
          else if (boundary === 'key') ui.key('KeyW')
          else if (boundary === 'mouse') ui.mouse(100, 100)
          else if (['health', 'input', 'effect', 'ritual'].includes(boundary)) {
            if (boundary === 'health') await ui.health(0.1, { epoch: role === 'host' ? ui.epoch() : 2 })
            else
              ui.partner.peer.send({
                type: boundary,
                epoch: role === 'host' ? ui.epoch() : 2,
                sequence: 1,
                round,
                forward: 1,
                strafe: 0,
                turnTotal: 1,
                requestId: 1,
                kind: 'rattle',
                step: 'desk'
              })
            await vi.advanceTimersByTimeAsync(0)
          } else if (boundary === 'frame') await ui.step(100, 0.1, { epoch: role === 'host' ? ui.epoch() : 2 })
          expect(ui.previewSound.stop).toHaveBeenCalled()
          if (role === 'host') expect(ui.match.getSnapshot()).toEqual({ ...before, paused: true })
          await vi.advanceTimersByTimeAsync(0)
          if (role === 'guest') expect(messages(ui, 'stop')[0]).toEqual({ type: 'stop', requestId: 1, epoch: 2 })
          const stoppedEpoch = role === 'host' ? ui.epoch() : 2
          ui.element('ready').onclick()
          await ready(ui, stoppedEpoch)
          const inputs = messages(ui, 'input').length
          await ui.step(1000, 0.1, { epoch: stoppedEpoch, phase: round, playing: true })
          expect(ui.element('ready').disabled).toBe(true)
          expect(messages(ui, 'input')).toHaveLength(inputs)
          expect(ui.rendered.mock.lastCall![0]).toEqual(visual)
          if (role === 'host') {
            expect(ui.match.getSnapshot()).toEqual({ ...before, paused: true })
            expect(ui.epoch()).toBe(stoppedEpoch)
          }
          expect(ui.previewSound.active).toBe(false)
        }
      )
    }

    it.each(['lobby', 'intermission', 'paused'])(
      role + ' cancels hidden preparation in %s until fresh readiness',
      async (phase) => {
        const ui = await mountMain(role)
        if (phase !== 'lobby') {
          await start(ui, role, 'round1')
          if (phase === 'intermission') ui.match.tick(900000)
          else ui.match.pause()
          if (role === 'host') await ui.step()
          else await ui.state(3)
        }
        const oldEpoch = role === 'host' ? ui.epoch() : phase === 'lobby' ? 0 : 3
        await ui.health(0.1, { epoch: oldEpoch })
        ui.element('ready').onclick()
        ui.visibility(true)
        await vi.advanceTimersByTimeAsync(0)
        const stopped = { ...ui.match.getSnapshot() }
        ui.visibility(true)
        if (role === 'guest') {
          await ui.state(oldEpoch + 1, { stoppedRequest: 1 })
          await ui.health(0.1, { epoch: oldEpoch + 1 })
          expect(ui.element('ready').disabled).toBe(true)
        }
        ui.visibility(false)
        await ready(ui, oldEpoch)
        await ui.step(300, 0.1, { epoch: role === 'host' ? ui.epoch() : oldEpoch + 1 })
        expect(ui.element('ready').textContent).not.toBe('相手を待っています')
        if (role === 'host') {
          expect(ui.match.getSnapshot()).toEqual(stopped)
          ui.element('ready').onclick()
          await ready(ui, oldEpoch)
          expect(ui.match.getSnapshot()).toEqual(stopped)
          await ready(ui)
          expect(ui.match.getSnapshot().paused).toBe(false)
          expect(ui.match.getSnapshot().phase).toBe(phase === 'intermission' ? 'round2' : 'round1')
        } else {
          expect(messages(ui, 'stop').every((message) => message.requestId === 1)).toBe(true)
          expect(ui.element('ready').disabled).toBe(false)
          const count = messages(ui, 'ready').length
          ui.element('ready').onclick()
          await vi.advanceTimersByTimeAsync(0)
          expect(messages(ui, 'ready')).toHaveLength(count + 1)
        }
      }
    )

    it.each(['lobby', 'intermission', 'paused'])(role + ' invalidates preparation in %s', async (phase) => {
      const ui = await mountMain(role)
      if (phase !== 'lobby') {
        await start(ui, role, 'round1')
        if (phase === 'intermission') ui.match.tick(900000)
        else ui.match.pause()
        if (role === 'host') await ui.step()
        else await ui.state(3)
      }
      await ui.health(0.1, { epoch: role === 'host' ? ui.epoch() : phase === 'lobby' ? 0 : 3 })
      ui.element('ready').onclick()
      ui.drawing.lose()
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.element('ready').disabled).toBe(true)
      await ui.step(300, 0.1, { epoch: role === 'host' ? ui.epoch() : phase === 'lobby' ? 0 : 3 })
      expect(ui.element('ready').disabled).toBe(true)
      if (role === 'guest') expect(messages(ui, 'stop')[0]?.requestId).toBe(1)
      else expect(ui.match.getSnapshot().phase).toBe(phase === 'paused' ? 'round1' : phase)
    })
  }

  for (const role of ['host', 'guest'] as const) {
    it(role + ' coalesces hidden, drawing loss and microphone events and removes visibility listeners', async () => {
      const ui = await mountMain(role)
      await start(ui, role, 'round1')
      ui.visibility(true)
      await vi.advanceTimersByTimeAsync(0)
      const epoch = ui.epoch()
      const state = ui.match.getSnapshot()
      ui.visibility(true)
      ui.drawing.lose()
      ui.track.muted = true
      ui.track.onmute()
      ui.track.onended()
      await ui.step(300, 0.1, { epoch: role === 'host' ? ui.epoch() : 2 })
      expect(ui.match.getSnapshot()).toEqual(state)
      if (role === 'host') expect(ui.epoch()).toBe(epoch)
      else expect(messages(ui, 'stop').every((message) => message.requestId === 1)).toBe(true)
      ui.close()
      const stops = ui.previewSound.stop.mock.calls.length
      ui.visibility(false)
      ui.visibility(true)
      expect(ui.previewSound.stop).toHaveBeenCalledTimes(stops)
      expect(ui.drawing.disposed).toBe(true)
    })

    it(role + ' stops hidden lobby bell preview at a boundary and never replays automatically', async () => {
      const ui = await mountMain(role)
      ui.element('sound-preview').onclick()
      expect(ui.previewSound.active).toBe(true)
      ui.visibility(true, false)
      ui.element('sound-preview').onclick()
      expect(ui.previewSound.active).toBe(false)
      ui.visibility(false)
      await ui.step(300)
      expect(ui.previewSound.active).toBe(false)
      expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
    })

    it(role + ' coalesces duplicate loss and cannot recover without a new restored event after reloss', async () => {
      const ui = await mountMain(role)
      await start(ui, role, 'round1')
      ui.drawing.lose()
      const epoch = role === 'host' ? ui.epoch() : 2
      ui.drawing.lose()
      ui.drawing.restore()
      ui.drawing.lose()
      ui.drawing.lost = false
      await ui.step(400, 0.1, { epoch })
      expect(ui.element('ready').disabled).toBe(true)
      if (role === 'host') expect(ui.epoch()).toBe(epoch)
      else expect(messages(ui, 'stop').every((value) => value.requestId === 1)).toBe(true)
      ui.drawing.restore()
      await ui.step(100, 0.1, { epoch })
      expect(ui.match.getSnapshot().paused || role === 'guest').toBe(true)
      expect(ui.element('ready').textContent).not.toBe('相手を待っています')
    })

    it(role + ' keeps a disconnected match stopped after drawing recovery', async () => {
      const ui = await mountMain(role)
      await start(ui, role, 'round1')
      ui.partner.peer.close()
      await vi.advanceTimersByTimeAsync(0)
      ui.drawing.lose()
      ui.drawing.restore()
      await ui.step(300, 0.1, { epoch: 2 })
      expect(ui.element('ready').disabled).toBe(true)
      expect(ui.previewSound.active).toBe(false)
      if (role === 'host') expect(ui.match.getSnapshot().paused).toBe(true)
    })

    it(role + ' stops a lobby bell preview before the delayed loss event and will not replay it', async () => {
      const ui = await mountMain(role)
      ui.element('sound-preview').onclick()
      expect(ui.previewSound.active).toBe(true)
      ui.drawing.lose(false)
      ui.element('sound-preview').onclick()
      expect(ui.previewSound.active).toBe(false)
      expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
      expect(ui.element('ready').disabled).toBe(true)
      ui.drawing.restore()
      await ui.step(300)
      expect(ui.previewSound.active).toBe(false)
      expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
    })

    it(role + ' ignores loss and restore callbacks after page cleanup', async () => {
      const ui = await mountMain(role)
      window.dispatchEvent(new Event('pagehide'))
      expect(ui.drawing.disposed).toBe(true)
      const stops = messages(ui, 'stop').length
      const state = ui.match.getSnapshot()
      ui.drawing.lose()
      ui.drawing.restore()
      expect(ui.match.getSnapshot()).toEqual(state)
      expect(messages(ui, 'stop')).toHaveLength(stops)
    })
  }

  it('host acknowledges remote stop during its own loss without moving or consuming the request twice', async () => {
    const ui = await mountMain('host')
    await start(ui, 'host', 'round2')
    const visual = ui.rendered.mock.lastCall![0]
    ui.drawing.lose()
    const epoch = ui.epoch()
    ui.partner.peer.send({ type: 'stop', requestId: 1, epoch: epoch - 1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.epoch()).toBe(epoch + 1)
    const stopped = ui.match.getSnapshot()
    ui.partner.peer.send({ type: 'stop', requestId: 1, epoch })
    await ui.step(300)
    const state = messages(ui, 'state').at(-1)
    expect(state.stoppedRequest).toBe(1)
    expect(state.snapshot).toEqual(stopped)
    expect(state.human).toEqual(visual.human)
    expect(state.haunter).toEqual(visual.haunter)
    expect(ui.epoch()).toBe(epoch + 1)
    expect(messages(ui, 'health').at(-1).mic).toBe(true)
  })

  it('guest receives confirmed paused and finished states while lost and releases its world', async () => {
    const ui = await mountMain('guest')
    await start(ui, 'guest', 'round2')
    ui.drawing.lose()
    ui.match.pause()
    await ui.state(3, { stoppedRequest: 1 })
    await ui.health(0.1, { epoch: 3 })
    await ready(ui, 3)
    expect(ui.element('phase').textContent).toBe('中断中')
    expect(ui.element('ready').disabled).toBe(true)
    expect(ui.drawing.disposed).toBe(false)
    ui.match.resume()
    ui.match.tick(900000)
    await ui.state(4, { stoppedRequest: 1 })
    expect(ui.element('phase').textContent).toBe('夜が明けました')
    expect(ui.drawing.disposed).toBe(true)
  })

  it('guest retransmits dropped graphics stops before healthy health until the exact confirmation', async () => {
    const ui = await mountMain('guest')
    await start(ui, 'guest', 'round1')
    const attempts: any[] = []
    network.broker.drop = (packet) => {
      const value = packet.frame.value as any
      if (value?.type === 'stop' || (value?.type === 'health' && packet.receiver === network.broker.sessions[0]))
        attempts.push(value)
      return value?.type === 'stop'
    }
    ui.drawing.lose()
    await vi.advanceTimersByTimeAsync(0)
    attempts.length = 0
    await ui.step(200, 0.1, { epoch: 2 })
    expect(attempts.map((value) => value.type)).toEqual(['stop', 'health', 'stop', 'health'])
    expect(attempts.filter((value) => value.type === 'stop')).toEqual([
      { type: 'stop', requestId: 1, epoch: 2 },
      { type: 'stop', requestId: 1, epoch: 2 }
    ])
    expect(attempts.filter((value) => value.type === 'health').every((value) => value.mic)).toBe(true)
    ui.match.pause()
    await ui.state(2, { stoppedRequest: 1 })
    await ui.state(3, { stoppedRequest: 0 })
    attempts.length = 0
    await ui.step(100, 0.1, { epoch: 3 })
    expect(attempts[0]).toEqual({ type: 'stop', requestId: 1, epoch: 2 })
    await ui.state(3, { stoppedRequest: 1 })
    attempts.length = 0
    await ui.step(100, 0.1, { epoch: 3 })
    expect(attempts.map((value) => value.type)).toEqual(['health'])
    expect(ui.element('ready').disabled).toBe(true)
  })

  it('hidden guest retries one stop until its newer epoch confirmation, allowing health and finished delivery', async () => {
    const ui = await mountMain('guest')
    await start(ui, 'guest', 'round2')
    const attempts: any[] = []
    network.broker.drop = (packet) => {
      const value = packet.frame.value as any
      if (value?.type === 'stop' || (value?.type === 'health' && packet.receiver === network.broker.sessions[0]))
        attempts.push(value)
      return value?.type === 'stop'
    }
    ui.visibility(true)
    await vi.advanceTimersByTimeAsync(0)
    attempts.length = 0
    await ui.step(200, 0.1, { epoch: 2 })
    expect(attempts.map((message) => message.type)).toEqual(['stop', 'health', 'stop', 'health'])
    expect(attempts.filter((message) => message.type === 'stop')).toEqual([
      { type: 'stop', requestId: 1, epoch: 2 },
      { type: 'stop', requestId: 1, epoch: 2 }
    ])
    ui.match.pause()
    await ui.state(2, { stoppedRequest: 1 })
    await ui.state(3, { stoppedRequest: 0 })
    ui.visibility(false)
    ui.element('ready').onclick()
    attempts.length = 0
    await ui.step(100, 0.1, { epoch: 3 })
    expect(attempts[0]).toEqual({ type: 'stop', requestId: 1, epoch: 2 })
    ui.visibility(true)
    await ui.state(3, { stoppedRequest: 1 })
    await ui.state(2, { snapshot: { ...ui.match.getSnapshot(), paused: false }, stoppedRequest: 1 })
    attempts.length = 0
    await ui.step(100, 0.1, { epoch: 3 })
    expect(attempts.map((message) => message.type)).toEqual(['health'])
    expect(ui.element('ready').disabled).toBe(true)
    ui.match.resume()
    ui.match.tick(900000)
    await ui.state(4, { stoppedRequest: 1 })
    expect(ui.element('phase').textContent).toBe('夜が明けました')
    expect(ui.drawing.disposed).toBe(true)
  })

  it.each([true, false])('hidden host acknowledges one remote stop, visibility event=%s', async (event) => {
    const ui = await mountMain('host')
    await start(ui, 'host', 'round2')
    ui.visibility(true, event)
    const epoch = ui.epoch()
    ui.partner.peer.send({ type: 'stop', requestId: 1, epoch: epoch - 1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(messages(ui, 'state').at(-1).stoppedRequest).toBe(1)
    const confirmedEpoch = ui.epoch()
    expect(confirmedEpoch).toBe(epoch + 1)
    ui.partner.peer.send({ type: 'stop', requestId: 1, epoch: epoch - 1 })
    ui.visibility(true)
    await ui.step(300)
    expect(ui.epoch()).toBe(confirmedEpoch)
    expect(ui.match.getSnapshot().paused).toBe(true)
  })

  it('preserves local pitch while a nongraphics guest stop is unconfirmed', async () => {
    const ui = await mountMain('guest')
    await start(ui, 'guest', 'round1')
    ui.track.enabled = false
    ui.key('KeyW')
    await vi.advanceTimersByTimeAsync(0)
    const inputs = messages(ui, 'input').length
    ui.key('ArrowUp')
    await ui.step(100, 0.1, { epoch: 2 })
    expect(ui.rendered.mock.lastCall![0].pitch).toBeCloseTo(0.2)
    ui.key('ArrowUp', false)
    ui.mouse(0, 50)
    await ui.step(100, 0.1, { epoch: 2 })
    expect(ui.rendered.mock.lastCall![0].pitch).toBeCloseTo(0.1)
    expect(messages(ui, 'input')).toHaveLength(inputs)
    expect(ui.element('ready').disabled).toBe(true)
  })

  it.each(['round1', 'round2'] as const)(
    'host %s requires a successful redraw and both new ready actions',
    async (round) => {
      const ui = await mountMain('host')
      await start(ui, 'host', round)
      ui.drawing.lose()
      const lossEpoch = ui.epoch()
      await ready(ui, lossEpoch)
      ui.drawing.restore()
      ui.drawing.failRender = true
      await ui.step(300)
      expect(ui.element('ready').disabled).toBe(true)
      expect(ui.epoch()).toBe(lossEpoch)
      ui.drawing.failRender = false
      await ui.step()
      expect(ui.epoch()).toBe(lossEpoch + 1)
      await ui.health()
      ui.element('ready').onclick()
      await ready(ui, lossEpoch)
      expect(ui.match.getSnapshot().paused).toBe(true)
      await ready(ui)
      expect(ui.match.getSnapshot().paused).toBe(false)
    }
  )

  it.each(['round1', 'round2'] as const)(
    'guest %s waits for both stop confirmations and rejects old ready and snapshots',
    async (round) => {
      const ui = await mountMain('guest')
      await start(ui, 'guest', round)
      ui.drawing.lose()
      await vi.advanceTimersByTimeAsync(0)
      ui.drawing.restore()
      await ui.step(300, 0.1, { epoch: 2 })
      expect(messages(ui, 'stop').every((value) => value.requestId === 1)).toBe(true)
      expect(ui.element('ready').disabled).toBe(true)
      ui.match.pause()
      await ui.state(3, { stoppedRequest: 1 })
      await ui.step(100, 0.1, { epoch: 3 })
      expect(messages(ui, 'stop').at(-1)).toEqual({ type: 'stop', requestId: 2, epoch: 3 })
      await ready(ui, 3)
      await ui.state(3, { stoppedRequest: 2 })
      expect(ui.element('ready').disabled).toBe(true)
      await ui.state(4, { stoppedRequest: 1 })
      expect(ui.element('ready').disabled).toBe(true)
      await ui.state(4, { stoppedRequest: 2 })
      await ui.health(0.1, { epoch: 4 })
      expect(ui.element('ready').disabled).toBe(false)
      ui.element('ready').onclick()
      await ui.state(2, { stoppedRequest: 1, snapshot: { ...ui.match.getSnapshot(), paused: false } })
      expect(ui.element('phase').textContent).toBe('中断中')
      ui.match.resume()
      await ui.state(5, { stoppedRequest: 2 })
      expect(ui.element('phase').textContent).toBe(round === 'round1' ? '第一夜' : '第二夜')
    }
  )
})

describe('main delayed cue age through the offline peer broker', () => {
  const startGuest = async (round: 'round1' | 'round2') => {
    const ui = await mountMain('guest')
    ui.match.start()
    if (round === 'round2') {
      ui.match.tick(900000)
      ui.match.startSecondRound()
    }
    ui.match.tick(4000)
    await ui.state(2)
    await ui.health(0.1, { epoch: 2, phase: round, playing: true })
    return ui
  }

  for (const round of ['round1', 'round2'] as const) {
    for (const [kind, durationMs] of [
      ['apparition', 2400],
      ['blackout', 2800],
      ['rattle', 1200]
    ] as const) {
      it.each([0, 600, durationMs - 1, durationMs, durationMs + 1, 3499, 3500])(
        round + ' forwards ' + kind + ' age %ims from the visual timeline and consumes duplicates',
        async (ageMs) => {
          const ui = await startGuest(round)
          const effect = { id: 1, round, kind, elapsedMs: ui.match.getSnapshot().elapsedMs - ageMs }
          await ui.state(2, { effect })
          ui.render()
          if (ageMs < 3500) {
            expect(ui.previewSound.trigger).toHaveBeenCalledExactlyOnceWith(kind, ageMs / 1000)
            const visual = ui.rendered.mock.lastCall![0].effect
            expect(visual.kind).toBe(kind)
            expect(performance.now() / 1000 - visual.startedAt).toBeCloseTo(ageMs / 1000)
          } else {
            expect(ui.previewSound.trigger).not.toHaveBeenCalled()
            expect(ui.rendered.mock.lastCall![0].effect).toBeNull()
          }
          await ui.state(2, { effect })
          await ui.state(2, { effect: { ...effect, elapsedMs: ui.match.getSnapshot().elapsedMs } })
          expect(ui.previewSound.trigger).toHaveBeenCalledTimes(ageMs < 3500 ? 1 : 0)
        }
      )
    }

    it(round + ' ignores reversed and duplicate packets and consumed older event IDs', async () => {
      const ui = await startGuest(round)
      network.broker.hold = (packet) => packet.frame.category === 'state'
      const older = { id: 1, round, kind: 'rattle', elapsedMs: 3400 }
      const newer = { id: 2, round, kind: 'blackout', elapsedMs: 3200 }
      await ui.state(2, { effect: older })
      const first = network.broker.pending.shift()!
      await ui.state(2, { effect: newer })
      const second = network.broker.pending.shift()!
      network.broker.hold = undefined
      for (const packet of [second, first, second, first]) network.broker.deliver(packet)
      await vi.advanceTimersByTimeAsync(0)
      await ui.state(2, { effect: older })
      await ui.state(2, { effect: newer })
      expect(ui.previewSound.trigger).toHaveBeenCalledExactlyOnceWith('blackout', 0.8)
    })

    it.each(['pause', 'expired health', 'pending stop'] as const)(
      round + ' does not replay delayed cues after %s and explicit readiness',
      async (cause) => {
        const ui = await startGuest(round)
        const effect = { id: 1, round, kind: 'rattle', elapsedMs: 3400 }
        if (cause === 'pause') {
          await ui.state(2, { effect })
          expect(ui.previewSound.trigger).toHaveBeenCalledExactlyOnceWith('rattle', 0.6)
          ui.previewSound.trigger.mockClear()
          ui.match.pause()
          await ui.state(3)
          await ui.health(0.1, { epoch: 3 })
        } else if (cause === 'expired health') await vi.advanceTimersByTimeAsync(501)
        else {
          ui.track.onmute()
          ui.track.muted = false
          ui.track.onunmute()
          await ui.health(0.1, { epoch: 2 })
        }
        await ui.state(cause === 'pause' ? 3 : 2, { effect })
        expect(ui.previewSound.trigger).not.toHaveBeenCalled()
        ui.render()
        expect(ui.rendered.mock.lastCall![0].effect).toBeNull()
        ui.match.pause()
        await ui.state(3, { stoppedRequest: 1 })
        await ui.health(0.1, { epoch: 3 })
        ui.partner.received.mockClear()
        expect(ui.element('ready').disabled).toBe(false)
        ui.element('ready').onclick()
        await vi.advanceTimersByTimeAsync(0)
        expect(ui.partner.received.mock.calls.map(([message]) => message)).toContainEqual({
          type: 'ready',
          value: true,
          epoch: 3,
          threshold: 0.1
        })
        ui.match.resume()
        await ui.state(4, { stoppedRequest: 1 })
        await ui.health(0.1, { epoch: 4 })
        await ui.state(3, { effect: { ...effect, id: 99 } })
        await ui.state(4, { effect: { ...effect, elapsedMs: 4001 } })
        await ui.state(4, { effect })
        expect(ui.previewSound.trigger).not.toHaveBeenCalled()
        await ui.state(4, { effect: { ...effect, id: 2 } })
        expect(ui.previewSound.trigger).toHaveBeenCalledExactlyOnceWith('rattle', 0.6)
        await ui.state(4, { effect: { ...effect, id: 2 } })
        expect(ui.previewSound.trigger).toHaveBeenCalledTimes(1)
      }
    )
  }

  it.each(['round1', 'round2'] as const)('keeps host cues immediate in %s', async (round) => {
    const ui = await mountMain('host')
    const ready = async () => {
      ui.element('ready').onclick()
      ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
      await vi.advanceTimersByTimeAsync(0)
      await ui.step()
    }
    await ready()
    if (round === 'round2') {
      ui.match.tick(900000)
      await ui.step()
      await ready()
      ui.key('Digit3')
    } else {
      ui.partner.peer.send({ type: 'effect', kind: 'rattle', round, requestId: 1, epoch: ui.epoch() })
      await vi.advanceTimersByTimeAsync(0)
    }
    expect(ui.previewSound.trigger).toHaveBeenCalledExactlyOnceWith('rattle')
  })
})

describe('non-play effect state regression through main and the offline peer broker', () => {
  it.each(['lobby', 'intermission', 'finished'] as const)(
    'rejects the entire %s state without consuming sequence, readiness epoch or effect IDs',
    async (phase) => {
      const ui = await mountMain('guest')
      if (phase !== 'lobby') {
        ui.match.start()
        ui.match.tick(900000)
        if (phase === 'finished') ui.match.startSecondRound()
      }
      const initialPose = { x: -4, z: 4, yaw: 0.25 }
      await ui.state(2, { sequence: 10, human: initialPose })
      ui.render()
      expect(ui.rendered.mock.lastCall![0].human).toEqual(initialPose)
      const previousPhase = ui.element('phase').textContent
      const previousScore = ui.element('scores').textContent
      if (phase === 'finished') ui.match.tick(900000)
      expect(ui.match.getSnapshot().phase).toBe(phase)
      await ui.state(99, {
        sequence: 20,
        human: { x: 7, z: 7, yaw: 1 },
        snapshot: { ...ui.match.getSnapshot(), scores: { host: -99, guest: -88 } },
        effect: { id: 99, round: phase, kind: 'apparition', elapsedMs: 0 }
      })
      expect(ui.element('phase').textContent).toBe(previousPhase)
      expect(ui.element('scores').textContent).toBe(previousScore)
      expect(ui.drawing.disposed).toBe(false)
      expect(ui.previewSound.trigger).not.toHaveBeenCalled()
      ui.render()
      expect(ui.rendered.mock.lastCall![0].human).toEqual(initialPose)
      expect(ui.rendered.mock.lastCall![0].effect).toBeNull()
      const validPose = { x: -3, z: 3, yaw: 0.5 }
      await ui.state(2, { sequence: 20, human: validPose })
      if (phase === 'finished') {
        expect(ui.element('phase').textContent).toBe('夜が明けました')
        expect(ui.drawing.disposed).toBe(true)
        return
      }
      ui.render()
      expect(ui.rendered.mock.lastCall![0].human).toEqual(validPose)
      expect(ui.drawing.disposed).toBe(false)
      if (phase === 'lobby') ui.match.start()
      else ui.match.startSecondRound()
      const round = ui.match.getSnapshot().phase
      await ui.health(0.1, { epoch: 2, phase: round, playing: true })
      await ui.state(2, { sequence: 21, effect: { id: 1, round, kind: 'apparition', elapsedMs: 0 } })
      expect(ui.previewSound.trigger).toHaveBeenCalledExactlyOnceWith('apparition', 0)
      ui.render()
      expect(ui.rendered.mock.lastCall![0].effect).toMatchObject({ kind: 'apparition', id: 1 })
    }
  )

  it.each(['lobby', 'intermission', 'finished'] as const)(
    'normal host broadcasts null effects in %s',
    async (phase) => {
      const ui = await mountMain('host')
      if (phase !== 'lobby') {
        const ready = async () => {
          ui.element('ready').onclick()
          ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
          await vi.advanceTimersByTimeAsync(0)
        }
        await ui.step()
        await ready()
        if (phase === 'finished') {
          ui.match.tick(900000)
          await ui.step()
          await ready()
          ui.key('Digit3')
        } else {
          ui.partner.peer.send({ type: 'effect', kind: 'rattle', round: 'round1', requestId: 1, epoch: ui.epoch() })
          await vi.advanceTimersByTimeAsync(0)
        }
        expect(ui.previewSound.trigger).toHaveBeenCalledExactlyOnceWith('rattle')
        ui.match.tick(900000)
      }
      ui.partner.received.mockClear()
      await ui.step()
      const states = ui.partner.received.mock.calls
        .map(([value]) => value as Record<string, any>)
        .filter((value) => value.type === 'state')
      expect(states.length).toBeGreaterThan(0)
      for (const state of states) {
        expect(state.snapshot.phase).toBe(phase)
        expect(state.effect).toBeNull()
      }
    }
  )
})

describe('main camera heading through the offline peer broker', () => {
  it.each([false, true])('allows only local pitch in a microphone-free lobby (connected: %s)', async (connected) => {
    const ui = await mountMain('host', false, connected)
    ui.render()
    const before = ui.rendered.mock.lastCall![0]
    const propagated = vi.fn()
    window.addEventListener('keydown', propagated)
    for (const [code, direction] of [
      ['ArrowUp', 1],
      ['ArrowDown', -1]
    ] as const) {
      const event = Object.assign(new Event('keydown', { cancelable: true }), { code, repeat: false })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(propagated).toHaveBeenLastCalledWith(event)
      await vi.advanceTimersByTimeAsync(100)
      ui.render()
      expect(ui.rendered.mock.lastCall![0].pitch).toBeCloseTo(before.pitch + direction * 0.2)
      ui.key(code, false)
      await vi.advanceTimersByTimeAsync(100)
      ui.render()
      expect(ui.rendered.mock.lastCall![0].pitch).toBeCloseTo(before.pitch + direction * 0.2)
      ui.key(code)
      window.dispatchEvent(new Event('blur'))
      await vi.advanceTimersByTimeAsync(100)
      ui.render()
      expect(ui.rendered.mock.lastCall![0].pitch).toBeCloseTo(before.pitch + direction * 0.2)
      ui.mouse(0, direction * 100)
    }
    for (const code of ['ArrowLeft', 'ArrowRight', 'KeyW', 'KeyE', 'Digit1', 'Digit2', 'Digit3']) {
      const event = Object.assign(new Event('keydown', { cancelable: true }), { code, repeat: false })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    ui.element('ready').onclick()
    await vi.advanceTimersByTimeAsync(100)
    ui.render()
    expect(ui.rendered.mock.lastCall![0]).toMatchObject({ human: before.human, haunter: before.haunter, effect: null })
    expect(ui.match.getSnapshot().phase).toBe('lobby')
    expect(ui.element('ready').disabled).toBe(true)
    for (const type of ['input', 'effect', 'ritual', 'ready'])
      expect(ui.partner.received.mock.calls.map(([value]) => (value as any).type)).not.toContain(type)
  })

  it('ignores pitch keys on form controls and editable content but still releases held keys', async () => {
    const ui = await mountMain('host', false, false)
    ui.render()
    const before = ui.rendered.mock.lastCall![0].pitch
    const targets = [
      new HTMLInputElement(),
      new HTMLTextAreaElement(),
      new HTMLButtonElement(),
      new HTMLSelectElement(),
      Object.assign(new HTMLElement(), { isContentEditable: true })
    ]
    for (const target of targets) {
      for (const code of ['ArrowUp', 'ArrowDown']) {
        const event = Object.assign(new Event('keydown', { cancelable: true }), { code, repeat: false })
        Object.defineProperty(event, 'target', { value: target })
        window.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
        await vi.advanceTimersByTimeAsync(100)
        ui.render()
        expect(ui.rendered.mock.lastCall![0].pitch).toBe(before)
      }
    }
    ui.key('ArrowUp')
    await vi.advanceTimersByTimeAsync(100)
    ui.render()
    const pitch = ui.rendered.mock.lastCall![0].pitch
    expect(pitch).toBeCloseTo(before + 0.2)
    const release = Object.assign(new Event('keyup'), { code: 'ArrowUp' })
    Object.defineProperty(release, 'target', { value: targets[0] })
    window.dispatchEvent(release)
    await vi.advanceTimersByTimeAsync(100)
    ui.render()
    expect(ui.rendered.mock.lastCall![0].pitch).toBe(pitch)
    ui.key('ArrowDown')
    window.dispatchEvent(new Event('focusin'))
    await vi.advanceTimersByTimeAsync(100)
    ui.render()
    expect(ui.rendered.mock.lastCall![0].pitch).toBe(pitch)
  })

  it.each(['host', 'guest'] as const)('%s matches camera across turns and role swap', async (role) => {
    const ui = await mountMain(role)
    const prepareHost = async () => {
      await ui.step()
      ui.element('ready').onclick()
      ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
      await vi.advanceTimersByTimeAsync(0)
    }
    const checkHeading = (expected: string, cameraRole: 'human' | 'haunter') => {
      ui.render()
      const frame = ui.rendered.mock.lastCall![0]
      expect(frame.role).toBe(cameraRole)
      const viewer = frame[cameraRole]
      const index = ((Math.round(viewer.yaw / (Math.PI / 4)) % 8) + 8) % 8
      expect(['北', '北東', '東', '南東', '南', '南西', '西', '北西'][index]).toBe(expected)
      expect(ui.element('heading').textContent).toBe('現在の向き：' + expected)
    }
    if (role === 'host') await prepareHost()
    else {
      ui.match.start()
      await ui.state(2)
    }
    await ui.step()
    checkHeading(role === 'host' ? '北' : '南', role === 'host' ? 'human' : 'haunter')
    ui.mouse(400)
    await ui.step()
    if (role === 'host') checkHeading('北東', 'human')
    else {
      checkHeading('南', 'haunter')
      await ui.state(2, {
        human: { x: -5, z: 5, yaw: Math.PI / 2 },
        haunter: { x: 5, z: -5, yaw: -Math.PI / 2 }
      })
      checkHeading('西', 'haunter')
    }
    ui.match.tick(900000)
    if (role === 'host') {
      await ui.step()
      await prepareHost()
    } else {
      ui.match.startSecondRound()
      await ui.state(3)
    }
    await ui.step()
    checkHeading(role === 'host' ? '南' : '北', role === 'host' ? 'haunter' : 'human')
    ui.mouse(400)
    await ui.step()
    if (role === 'host') checkHeading('南西', 'haunter')
    else {
      checkHeading('北', 'human')
      await ui.state(3, {
        human: { x: -5, z: 5, yaw: Math.PI / 2 },
        haunter: { x: 5, z: -5, yaw: -Math.PI / 2 }
      })
      checkHeading('東', 'human')
    }
  })
})

describe('main preparation bell preview through the offline peer broker', () => {
  const remoteReady = async (ui: Awaited<ReturnType<typeof mountMain>>) => {
    ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
  }

  it('requires an enabled microphone and labels the limited scope of audition', async () => {
    const ui = await mountMain('host', false)
    expect(ui.element('sound-preview').disabled).toBe(true)
    ui.element('sound-preview').onclick()
    expect(ui.previewSound.previewBell).not.toHaveBeenCalled()
    expect(ui.previewSound.setVolume).not.toHaveBeenCalled()
    const markup = ui.element('mute').parentElement.insertAdjacentHTML.mock.calls[0][1]
    for (const label of ['手掛かりの鈴', '準備完了前に試聴できます', '低音量', 'ヘッドフォン']) {
      expect(markup).toContain(label)
    }
    await ui.element('microphone').onclick()
    expect(ui.element('sound-preview').disabled).toBe(false)
    expect(ui.previewSound.previewBell).not.toHaveBeenCalled()
    ui.element('sound-preview').onclick()
    expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
  })

  it.each(['host', 'guest'] as const)(
    'plays only on a %s click without changing readiness or sending packets',
    async (role) => {
      const ui = await mountMain(role)
      const before = ui.match.getSnapshot()
      const sent = ui.partner.received.mock.calls.length
      expect(ui.element('sound-preview').disabled).toBe(false)
      for (let index = 0; index < 100; index++) ui.element('sound-preview').onclick()
      expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
      expect(ui.element('sound-preview').disabled).toBe(true)
      expect(ui.match.getSnapshot()).toEqual(before)
      expect(ui.partner.received.mock.calls).toHaveLength(sent)
      expect(ui.element('threshold').disabled).not.toBe(true)
      expect(ui.element('ready').disabled).toBe(false)
      expect(ui.track.enabled).toBe(true)
      expect(ui.ritualBell).not.toHaveBeenCalled()
      await ui.step(300)
      expect(ui.previewSound.active).toBe(true)
      expect(ui.previewSound.start).not.toHaveBeenCalled()
      ui.previewSound.active = false
      await ui.step(300)
      expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
      expect(ui.element('sound-preview').disabled).toBe(false)
      ui.element('sound-preview').onclick()
      expect(ui.previewSound.previewBell).toHaveBeenCalledTimes(2)
    }
  )

  it.each(['local first', 'remote first'] as const)(
    'cancels before both-ready races (%s) and never retries after start',
    async (order) => {
      const ui = await mountMain('host')
      await ui.step()
      ui.element('sound-preview').onclick()
      expect(ui.previewSound.active).toBe(true)
      if (order === 'local first') ui.element('ready').onclick()
      else await remoteReady(ui)
      expect(ui.previewSound.active).toBe(false)
      ui.element('sound-preview').onclick()
      expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(501)
      if (order === 'local first') await remoteReady(ui)
      else ui.element('ready').onclick()
      expect(ui.match.getSnapshot().phase).toBe('lobby')
      await ui.step()
      await remoteReady(ui)
      ui.element('ready').onclick()
      expect(ui.match.getSnapshot().phase).toBe('round1')
      ui.element('sound-preview').onclick()
      await ui.step()
      expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
      expect(ui.previewSound.active).toBe(false)
    }
  )

  it('cancels a guest preview on remote ready even before current health accepts it', async () => {
    const ui = await mountMain('guest')
    ui.element('sound-preview').onclick()
    await remoteReady(ui)
    expect(ui.previewSound.active).toBe(false)
    ui.element('sound-preview').onclick()
    expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
  })

  it.each(['host', 'guest'] as const)('cancels %s audition before sending local readiness', async (role) => {
    const ui = await mountMain(role)
    ui.element('sound-preview').onclick()
    ui.partner.received.mockClear()
    ui.element('ready').onclick()
    expect(ui.previewSound.active).toBe(false)
    ui.element('sound-preview').onclick()
    expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.partner.received.mock.calls.map(([value]) => value as any)).toContainEqual({
      type: 'ready',
      value: true,
      epoch: ui.epoch(),
      threshold: 0.1
    })
  })

  it.each(['host', 'guest'] as const)(
    'cancels %s audition on remote mic failure without recovery replay',
    async (role) => {
      const ui = await mountMain(role)
      ui.element('sound-preview').onclick()
      await ui.health(0.1, { mic: false })
      expect(ui.previewSound.active).toBe(false)
      await ui.step(300)
      expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
      expect(ui.previewSound.active).toBe(false)
    }
  )

  it('rejects even a paused lobby snapshot', async () => {
    const ui = await mountMain('guest')
    ui.element('sound-preview').onclick()
    await ui.state(1, { snapshot: { ...ui.match.getSnapshot(), paused: true } })
    expect(ui.previewSound.active).toBe(false)
    expect(ui.element('sound-preview').disabled).toBe(true)
    ui.element('sound-preview').onclick()
    expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
  })

  it('cancels immediately on guest round start and rejects paused rounds', async () => {
    const ui = await mountMain('guest')
    ui.element('sound-preview').onclick()
    ui.match.start()
    await ui.state(2)
    expect(ui.previewSound.active).toBe(false)
    ui.element('sound-preview').onclick()
    ui.match.pause()
    await ui.state(3)
    expect(ui.element('sound-preview').disabled).toBe(true)
    ui.element('sound-preview').onclick()
    expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
  })

  it('allows intermission preview but cancels before the second round and disposes at finish', async () => {
    const ui = await mountMain('host')
    await remoteReady(ui)
    ui.element('ready').onclick()
    ui.match.tick(900000)
    await ui.step()
    expect(ui.match.getSnapshot().phase).toBe('intermission')
    expect(ui.element('sound-preview').disabled).toBe(false)
    ui.element('sound-preview').onclick()
    expect(ui.previewSound.active).toBe(true)
    await remoteReady(ui)
    expect(ui.previewSound.active).toBe(false)
    ui.element('ready').onclick()
    expect(ui.match.getSnapshot().phase).toBe('round2')
    ui.element('sound-preview').onclick()
    ui.match.tick(899900)
    await ui.step(200)
    expect(ui.match.getSnapshot().phase).toBe('finished')
    expect(ui.previewSound.dispose).toHaveBeenCalledOnce()
    ui.element('sound-preview').onclick()
    expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
  })

  for (const role of ['host', 'guest'] as const) {
    it.each([
      'mute',
      'play-mute',
      'volume',
      'play-volume',
      'mic-muted',
      'mic-ended',
      'mic-disabled',
      'suspended',
      'interrupted',
      'closed',
      'disconnect',
      'reconnect',
      'pagehide',
      'reset'
    ] as const)(role + ': cancels on %s and never automatically replays', async (reason) => {
      const ui = await mountMain(role)
      ui.element('sound-preview').onclick()
      expect(ui.previewSound.active).toBe(true)
      if (reason === 'mute' || reason === 'play-mute') {
        ui.element(reason).checked = true
        ui.element(reason).onchange()
        expect(ui.element('mute').checked).toBe(true)
        expect(ui.element('play-mute').checked).toBe(true)
        expect(ui.previewSound.setMuted).toHaveBeenLastCalledWith(true)
      } else if (reason === 'volume' || reason === 'play-volume') {
        ui.element(reason).value = '0'
        ui.element(reason).oninput()
        expect(ui.element('volume').value).toBe('0')
        expect(ui.element('play-volume').value).toBe('0')
        expect(ui.previewSound.setVolume).toHaveBeenLastCalledWith(0)
      } else if (reason === 'mic-muted') {
        ui.track.muted = true
        ui.track.onmute()
      } else if (reason === 'mic-ended') {
        ui.track.readyState = 'ended'
        ui.track.onended()
      } else if (reason === 'mic-disabled') {
        ui.track.enabled = false
        ui.element('sound-preview').onclick()
        await ui.step()
      } else if (reason === 'suspended' || reason === 'interrupted' || reason === 'closed') {
        ui.audioContext.state = reason
        ui.audioContext.onstatechange?.()
      } else if (reason === 'disconnect') {
        await ui.partner.peer.close()
        await vi.advanceTimersByTimeAsync(0)
      } else if (reason === 'reconnect') {
        await ui.element('microphone').onclick()
      } else if (reason === 'reset') {
        vi.stubGlobal('location', { reload: vi.fn() })
        ui.element('reset').onclick()
      } else window.dispatchEvent(new Event('pagehide'))
      expect(ui.previewSound.active).toBe(false)
      if (reason !== 'reconnect') {
        ui.element('sound-preview').onclick()
        expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
      }
      ui.track.muted = false
      ui.track.enabled = true
      ui.track.readyState = 'live'
      ui.audioContext.state = 'running'
      ui.audioContext.onstatechange?.()
      ui.element('mute').checked = false
      ui.element('mute').onchange()
      ui.element('volume').value = '0.2'
      ui.element('volume').oninput()
      expect(ui.element('play-volume').value).toBe('0.2')
      expect(ui.element('volume-value').textContent).toBe('20%')
      expect(ui.element('play-volume-value').textContent).toBe('20%')
      expect(ui.previewSound.setVolume).toHaveBeenLastCalledWith(0.2)
      await vi.advanceTimersByTimeAsync(1000)
      expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
      expect(ui.previewSound.active).toBe(false)
    })
  }

  it('keeps the guest stop guard even after a lobby snapshot and mic recovery', async () => {
    const ui = await mountMain('guest')
    ui.element('ready').onclick()
    ui.track.muted = true
    ui.track.onmute()
    ui.track.muted = false
    ui.track.onunmute()
    await ui.state(1, { stoppedRequest: 0 })
    await ui.step()
    ui.element('sound-preview').onclick()
    expect(ui.element('sound-preview').disabled).toBe(true)
    expect(ui.previewSound.previewBell).not.toHaveBeenCalled()
    expect(ui.partner.received.mock.calls.map(([value]) => value as any).some((value) => value.type === 'stop')).toBe(
      true
    )
  })

  it('reports a failed preview without scheduling or changing the match', async () => {
    const ui = await mountMain('host')
    ui.previewSound.previewBell.mockImplementationOnce(() => false)
    const before = ui.match.getSnapshot()
    ui.element('sound-preview').onclick()
    expect(ui.element('sound-preview-status').textContent).toContain('鳴らせません')
    expect(ui.match.getSnapshot()).toEqual(before)
    await ui.step(300)
    expect(ui.previewSound.previewBell).toHaveBeenCalledOnce()
  })
})

describe('main ritual bell through the MoQ peer broker', () => {
  const bellCompleted = RITUAL_STEPS.findIndex((step) => step.id === 'bell') + 1
  const bell = RITUAL_STEPS[bellCompleted - 1]
  const latestState = (ui: Awaited<ReturnType<typeof mountMain>>) =>
    ui.partner.received.mock.calls
      .map(([value]) => value as any)
      .filter((value) => value.type === 'state')
      .at(-1)!

  async function hostAtBell() {
    const ui = await mountMain('host')
    await ui.step()
    ui.element('ready').onclick()
    ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
    ui.key('KeyE')
    ui.key('KeyE', false)
    await vi.advanceTimersByTimeAsync(0)
    expect(latestState(ui).ritual.completed).toBe(bellCompleted - 1)
    expect(ui.ritualBell).not.toHaveBeenCalled()
    ui.key('KeyW')
    await ui.step(3100)
    ui.key('KeyW', false)
    expect(latestState(ui).human).toMatchObject({ x: bell.x })
    expect(Math.abs(latestState(ui).human.z - bell.z)).toBeLessThan(1)
    return ui
  }

  async function guestBeforeBell(completed = bellCompleted - 1, round: 'round1' | 'round2' = 'round2') {
    const ui = await mountMain('guest')
    ui.match.start()
    if (round === 'round2') {
      ui.match.tick(900000)
      ui.match.startSecondRound()
    }
    ui.match.tick(bell.availableMs)
    await ui.state(2, { ritual: { round, completed } })
    await ui.health(0.1, { epoch: 2 })
    expect(ui.ritualBell).not.toHaveBeenCalled()
    return ui
  }

  it('plays once only after a host human successfully acquires the bell, not on early or repeated keys', async () => {
    const ui = await hostAtBell()
    ui.key('KeyE')
    expect(ui.ritualBell).not.toHaveBeenCalled()
    expect(latestState(ui).ritual.completed).toBe(bellCompleted - 1)
    ui.match.tick(bell.availableMs)
    await ui.step()
    window.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyE', repeat: true }))
    expect(ui.ritualBell).not.toHaveBeenCalled()
    expect(latestState(ui).ritual.completed).toBe(bellCompleted - 1)
    ui.key('KeyE')
    await vi.advanceTimersByTimeAsync(0)
    expect(latestState(ui).ritual.completed).toBe(bellCompleted)
    expect(ui.ritualBell).toHaveBeenCalledTimes(1)
    for (let repeat = 0; repeat < 3; repeat++)
      window.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyE', repeat: true }))
    ui.key('KeyE')
    await ui.step()
    expect(ui.ritualBell).toHaveBeenCalledTimes(1)
    expect(latestState(ui).ritual.completed).toBe(bellCompleted)
  })

  it('does not play for a host request at the wrong clue or while paused', async () => {
    const ui = await mountMain('host')
    await ui.step()
    ui.element('ready').onclick()
    ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
    ui.key('KeyE')
    ui.match.tick(bell.availableMs)
    await ui.step()
    ui.key('KeyE')
    expect(latestState(ui).ritual.completed).toBe(bellCompleted - 1)
    await ui.health(0.1, { mic: false })
    ui.key('KeyE')
    expect(ui.match.getSnapshot().paused).toBe(true)
    expect(ui.ritualBell).not.toHaveBeenCalled()
  })

  it.each(['mute', 'volume', 'stale-health', 'stop'])('does not play or retry a host bell after %s', async (reason) => {
    const ui = await hostAtBell()
    ui.match.tick(bell.availableMs)
    await ui.step()
    if (reason === 'mute') {
      ui.element('mute').checked = true
      ui.element('mute').onchange()
    }
    if (reason === 'volume') {
      ui.element('volume').value = '0'
      ui.element('volume').oninput()
    }
    if (reason === 'stale-health') await vi.advanceTimersByTimeAsync(501)
    if (reason === 'stop') {
      ui.partner.peer.send({ type: 'stop', requestId: 1, epoch: ui.epoch() })
      await vi.advanceTimersByTimeAsync(0)
    }
    ui.key('KeyE')
    await vi.advanceTimersByTimeAsync(0)
    expect(latestState(ui).ritual.completed).toBe(
      reason === 'stop' || reason === 'stale-health' ? bellCompleted - 1 : bellCompleted
    )
    expect(ui.ritualBell).not.toHaveBeenCalled()
    ui.track.enabled = true
    ui.audioContext.state = 'running'
    ui.element('mute').checked = false
    ui.element('mute').onchange()
    ui.element('volume').value = '0.2'
    ui.element('volume').oninput()
    await ui.step()
    ui.key('KeyE')
    expect(ui.ritualBell).not.toHaveBeenCalled()
  })

  it.each(['mic', 'audio'])(
    'rejects a host bell acquisition after silent %s failure until both re-prepare',
    async (reason) => {
      const ui = await hostAtBell()
      ui.match.tick(bell.availableMs)
      await ui.step()
      const epoch = ui.epoch()
      if (reason === 'mic') ui.track.enabled = false
      else ui.audioContext.state = 'suspended'
      ui.key('KeyE')
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.match.getSnapshot().paused).toBe(true)
      expect(ui.epoch()).toBe(epoch + 1)
      expect(latestState(ui).ritual.completed).toBe(bellCompleted - 1)
      expect(ui.ritualBell).not.toHaveBeenCalled()
      ui.track.enabled = true
      ui.audioContext.state = 'running'
      await ui.step()
      ui.key('KeyE')
      expect(ui.match.getSnapshot().paused).toBe(true)
      expect(ui.ritualBell).not.toHaveBeenCalled()
      ui.element('ready').onclick()
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.match.getSnapshot().paused).toBe(true)
      ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
      await vi.advanceTimersByTimeAsync(0)
      await ui.step()
      ui.key('KeyE')
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.match.getSnapshot().paused).toBe(false)
      expect(latestState(ui).ritual.completed).toBe(bellCompleted)
      expect(ui.ritualBell).toHaveBeenCalledTimes(1)
    }
  )

  it('does not play on the host haunter after exchanging roles', async () => {
    const ui = await hostAtBell()
    ui.match.tick(900000)
    await ui.step()
    await ui.health()
    ui.element('ready').onclick()
    ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot()).toMatchObject({ phase: 'round2', survivor: 'guest', paused: false })
    ui.match.tick(bell.availableMs)
    await ui.step()
    ui.key('KeyE')
    ui.partner.peer.send({ type: 'ritual', round: 'round2', step: 'letter', epoch: ui.epoch() })
    await vi.advanceTimersByTimeAsync(0)
    expect(latestState(ui).ritual.completed).toBe(1)
    expect(ui.ritualBell).not.toHaveBeenCalled()
  })

  it.each([bellCompleted, RITUAL_STEPS.length])(
    'plays only for accepted guest progress through the bell to %i',
    async (completed) => {
      const ui = await guestBeforeBell(0)
      ui.key('KeyE')
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.ritualBell).not.toHaveBeenCalled()
      ui.match.tick(RITUAL_STEPS[completed - 1].availableMs - bell.availableMs)
      await ui.state(2, { ritual: { round: 'round2', completed } })
      expect(ui.ritualBell).toHaveBeenCalledTimes(1)
      await ui.state(2, { ritual: { round: 'round2', completed } })
      await ui.state(2, { ritual: { round: 'round2', completed: bellCompleted - 1 } })
      await ui.state(2, { ritual: { round: 'round2', completed } })
      expect(ui.ritualBell).toHaveBeenCalledTimes(1)
    }
  )

  it.each(['latest', 'epoch', 'paused', 'resume', 'mute', 'volume', 'pending-stop', 'stale-health', 'mic', 'audio'])(
    'consumes silent guest progress without replay after %s',
    async (reason) => {
      const ui = await guestBeforeBell(reason === 'latest' ? bellCompleted : bellCompleted - 1)
      let epoch = 2
      if (reason === 'epoch') epoch++
      if (reason === 'paused' || reason === 'resume') {
        ui.match.pause()
        if (reason === 'resume') {
          await ui.state(epoch, { ritual: { round: 'round2', completed: bellCompleted - 1 } })
          ui.match.resume()
        }
      }
      if (reason === 'mute') {
        ui.element('mute').checked = true
        ui.element('mute').onchange()
      }
      if (reason === 'volume') {
        ui.element('volume').value = '0'
        ui.element('volume').oninput()
      }
      if (reason === 'pending-stop') ui.track.onmute()
      if (reason === 'stale-health') await vi.advanceTimersByTimeAsync(501)
      if (reason === 'mic') ui.track.enabled = false
      if (reason === 'audio') ui.audioContext.state = 'suspended'
      await ui.state(epoch, { ritual: { round: 'round2', completed: bellCompleted } })
      expect(ui.ritualBell).not.toHaveBeenCalled()
      if (reason === 'pending-stop') {
        ui.match.pause()
        await ui.state(++epoch, { stoppedRequest: 1, ritual: { round: 'round2', completed: bellCompleted } })
        ui.match.resume()
        await ui.state(++epoch, { ritual: { round: 'round2', completed: bellCompleted } })
        expect(ui.element('notice').textContent).toBe('')
      }
      ui.match.resume()
      ui.track.enabled = true
      ui.audioContext.state = 'running'
      ui.element('mute').checked = false
      ui.element('mute').onchange()
      ui.element('volume').value = '0.2'
      ui.element('volume').oninput()
      await ui.health(0.1, { epoch })
      await ui.state(epoch, { ritual: { round: 'round2', completed: bellCompleted } })
      expect(ui.ritualBell).not.toHaveBeenCalled()
    }
  )

  it.each(['ritual', 'pose', 'score', 'epoch', 'sequence', 'elapsed', 'survivor', 'spirit', 'effect'])(
    'rejects an invalid guest %s without consuming valid bell progress',
    async (field) => {
      const ui = await guestBeforeBell()
      const progress = { ritual: { round: 'round2', completed: bellCompleted } }
      const invalid: Record<string, unknown> = {
        ritual: { ritual: { round: 'round2', completed: RITUAL_STEPS.length + 1 } },
        pose: { human: { x: 10000, z: 0, yaw: 0 } },
        score: { snapshot: { ...ui.match.getSnapshot(), scores: { host: 1, guest: 0 } } },
        epoch: { readinessEpoch: 1 },
        sequence: { sequence: 1 },
        elapsed: { snapshot: { ...ui.match.getSnapshot(), elapsedMs: 0 } },
        survivor: { snapshot: { ...ui.match.getSnapshot(), survivor: 'host' } },
        spirit: { spirit: null },
        effect: { effect: { id: 1, round: 'round1' } }
      }
      await ui.state(2, { ...progress, ...(invalid[field] as Record<string, unknown>) })
      expect(ui.ritualBell).not.toHaveBeenCalled()
      await ui.state(2, progress)
      expect(ui.ritualBell).toHaveBeenCalledTimes(1)
    }
  )

  it('never plays on the haunter side when accepted guest progress crosses the bell', async () => {
    const ui = await guestBeforeBell(bellCompleted - 1, 'round1')
    await ui.state(2, { ritual: { round: 'round1', completed: bellCompleted } })
    expect(ui.ritualBell).not.toHaveBeenCalled()
  })

  it('accepts health at the 500ms boundary without replaying the bell after pause/resume', async () => {
    const ui = await guestBeforeBell()
    await vi.advanceTimersByTimeAsync(500)
    await ui.state(2, { ritual: { round: 'round2', completed: bellCompleted } })
    expect(ui.ritualBell).toHaveBeenCalledTimes(1)
    ui.match.pause()
    await ui.state(3, { ritual: { round: 'round2', completed: bellCompleted } })
    ui.match.resume()
    await ui.state(4, { ritual: { round: 'round2', completed: bellCompleted } })
    await ui.health(0.1, { epoch: 4 })
    await ui.state(4, { ritual: { round: 'round2', completed: bellCompleted } })
    expect(ui.ritualBell).toHaveBeenCalledTimes(1)
  })

  it('does not treat role exchange as a guest bell acquisition or replay the first active state', async () => {
    const ui = await guestBeforeBell(0, 'round1')
    ui.match.tick(900000)
    await ui.state(3)
    ui.match.startSecondRound()
    ui.match.tick(bell.availableMs)
    await ui.state(4, { ritual: { round: 'round2', completed: bellCompleted } })
    await ui.health(0.1, { epoch: 4 })
    await ui.state(4, { ritual: { round: 'round2', completed: bellCompleted } })
    expect(ui.ritualBell).not.toHaveBeenCalled()
  })

  it('ignores held old-epoch bell states across pause/resume without suppressing a new acquisition', async () => {
    const ui = await guestBeforeBell()
    network.broker.hold = (packet) => packet.frame.category === 'state'
    await ui.state(2, { ritual: { round: 'round2', completed: bellCompleted } })
    const delayed = network.broker.pending.shift()!
    network.broker.hold = undefined
    ui.match.pause()
    await ui.state(3, { ritual: { round: 'round2', completed: bellCompleted - 1 } })
    ui.match.resume()
    await ui.state(4, { ritual: { round: 'round2', completed: bellCompleted - 1 } })
    await ui.health(0.1, { epoch: 4 })
    network.broker.deliver(delayed)
    network.broker.deliver(delayed)
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.ritualBell).not.toHaveBeenCalled()
    await ui.state(4, { ritual: { round: 'round2', completed: bellCompleted } })
    expect(ui.ritualBell).toHaveBeenCalledTimes(1)
  })

  it('plays once when skipped progress arrives before an older bell state and duplicate packets', async () => {
    const ui = await guestBeforeBell()
    network.broker.hold = (packet) => packet.frame.category === 'state'
    await ui.state(2, { ritual: { round: 'round2', completed: bellCompleted } })
    const older = network.broker.pending.shift()!
    ui.match.tick(RITUAL_STEPS.at(-1)!.availableMs - bell.availableMs)
    await ui.state(2, { ritual: { round: 'round2', completed: RITUAL_STEPS.length } })
    const newer = network.broker.pending.shift()!
    network.broker.hold = undefined
    for (const packet of [newer, older, newer, older]) network.broker.deliver(packet)
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.ritualBell).toHaveBeenCalledTimes(1)
  })

  it('never plays a previous connection bell packet on a new guest connection', async () => {
    const previous = await guestBeforeBell()
    network.broker.hold = (packet) => packet.frame.category === 'state'
    await previous.state(2, { ritual: { round: 'round2', completed: bellCompleted } })
    const oldPacket = network.broker.pending.shift()!
    window.dispatchEvent(new Event('pagehide'))
    previous.partner.peer.close()
    await vi.advanceTimersByTimeAsync(0)
    network.broker.hold = undefined
    const ui = await guestBeforeBell()
    network.broker.hold = (packet) => packet.frame.category === 'state'
    await ui.state(2, { ritual: { round: 'round2', completed: bellCompleted } })
    const currentPacket = network.broker.pending.shift()!
    network.broker.deliver(oldPacket)
    network.broker.deliver({ ...currentPacket, frame: oldPacket.frame, payload: oldPacket.payload })
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.ritualBell).not.toHaveBeenCalled()
    network.broker.hold = undefined
    network.broker.deliver(currentPacket)
    network.broker.deliver(currentPacket)
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.ritualBell).toHaveBeenCalledTimes(1)
    expect(previous.ritualBell).not.toHaveBeenCalled()
  })
})

describe('main silent local microphone failure through the offline peer broker', () => {
  type Main = Awaited<ReturnType<typeof mountMain>>
  const messages = (ui: Main, type: string) =>
    ui.partner.received.mock.calls.map(([value]) => value as any).filter((value) => value.type === type)
  const latestState = (ui: Main) => messages(ui, 'state').at(-1)!
  const remoteReady = async (ui: Main) => {
    ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
  }
  const prepareHost = async (ui: Main) => {
    await ui.step()
    ui.element('ready').onclick()
    await remoteReady(ui)
  }
  const startHost = async (ui: Main, round: 'round1' | 'round2') => {
    await prepareHost(ui)
    if (round === 'round2') {
      ui.match.tick(900000)
      await ui.step()
      await prepareHost(ui)
    }
    await ui.step()
    expect(ui.match.getSnapshot()).toMatchObject({ phase: round, paused: false })
  }
  const startGuest = async (ui: Main, round: 'round1' | 'round2') => {
    ui.match.start()
    if (round === 'round2') {
      ui.match.tick(900000)
      ui.match.startSecondRound()
    }
    const epoch = round === 'round1' ? 2 : 3
    await ui.state(epoch)
    await ui.step(100, 0.1, { epoch })
    return epoch
  }
  const fail = (ui: Main, cause: string) => {
    if (cause === 'disabled track') ui.track.enabled = false
    else ui.audioContext.state = 'suspended'
  }
  const recover = (ui: Main) => {
    ui.track.enabled = true
    ui.audioContext.state = 'running'
  }

  for (const role of ['host', 'guest'] as const) {
    for (const cause of ['disabled track', 'silent audio suspension']) {
      it.each(['ArrowUp', 'ArrowDown'])(
        role + ' stops before rAF but permits local %s after ' + cause,
        async (code) => {
          const ui = await mountMain(role)
          if (role === 'host') await startHost(ui, 'round1')
          else await startGuest(ui, 'round1')
          const before = ui.rendered.mock.lastCall![0]
          const snapshot = ui.match.getSnapshot()
          ui.partner.received.mockClear()
          ui.previewSound.stop.mockClear()
          ui.previewSound.trigger.mockClear()
          ui.rendered.mockClear()
          fail(ui, cause)
          ui.key(code)
          expect(ui.previewSound.stop).toHaveBeenCalled()
          expect(ui.rendered).not.toHaveBeenCalled()
          if (role === 'host') expect(ui.match.getSnapshot()).toEqual({ ...snapshot, paused: true })
          await vi.advanceTimersByTimeAsync(0)
          if (role === 'host') expect(latestState(ui).snapshot.paused).toBe(true)
          else expect(messages(ui, 'stop')).toHaveLength(1)
          expect(messages(ui, 'health').at(-1).mic).toBe(false)
          const left = Object.assign(new Event('keydown', { cancelable: true }), { code: 'ArrowLeft', repeat: false })
          window.dispatchEvent(left)
          expect(left.defaultPrevented).toBe(false)
          for (const action of ['KeyW', 'KeyE', 'Digit1', 'Digit2', 'Digit3']) ui.key(action)
          ui.element('ready').onclick()
          await vi.advanceTimersByTimeAsync(100)
          ui.render()
          expect(ui.rendered.mock.lastCall![0].pitch).toBeCloseTo(before.pitch + (code === 'ArrowUp' ? 0.2 : -0.2))
          expect(ui.rendered.mock.lastCall![0]).toMatchObject({
            human: before.human,
            haunter: before.haunter,
            effect: null
          })
          ui.key(code, false)
          const pitch = ui.rendered.mock.lastCall![0].pitch
          await vi.advanceTimersByTimeAsync(100)
          ui.render()
          expect(ui.rendered.mock.lastCall![0].pitch).toBe(pitch)
          await vi.advanceTimersByTimeAsync(0)
          for (const type of ['input', 'effect', 'ritual', 'ready']) expect(messages(ui, type)).toEqual([])
          expect(ui.previewSound.trigger).not.toHaveBeenCalled()
          expect(ui.ritualBell).not.toHaveBeenCalled()
        }
      )
    }
  }

  for (const round of ['round1', 'round2'] as const) {
    for (const cause of ['disabled track', 'silent audio suspension']) {
      it.each(['local first', 'remote first'])(
        'host ' + round + ' rejects both operations before rAF after ' + cause + ' (%s)',
        async (order) => {
          const ui = await mountMain('host')
          await startHost(ui, round)
          const before = latestState(ui)
          const local = () => ui.key(round === 'round1' ? 'KeyE' : 'Digit3')
          const remote = async () => {
            ui.partner.peer.send(
              round === 'round1'
                ? { type: 'effect', kind: 'rattle', requestId: 1, round, epoch: before.readinessEpoch }
                : { type: 'ritual', step: 'letter', round, epoch: before.readinessEpoch }
            )
            await vi.advanceTimersByTimeAsync(0)
          }
          ui.previewSound.trigger.mockClear()
          fail(ui, cause)
          if (order === 'local first') local()
          await remote()
          if (order === 'remote first') local()
          for (const code of ['KeyE', 'Digit1', 'Digit2', 'Digit3']) ui.key(code)
          await vi.advanceTimersByTimeAsync(0)
          const stopped = ui.match.getSnapshot()
          expect(stopped).toEqual({ ...before.snapshot, paused: true })
          expect(ui.epoch()).toBe(before.readinessEpoch + 1)
          expect(latestState(ui).ritual).toEqual(before.ritual)
          expect(latestState(ui).spirit).toEqual(before.spirit)
          expect(latestState(ui).effect).toBeNull()
          expect(ui.previewSound.trigger).not.toHaveBeenCalled()
          expect(ui.ritualBell).not.toHaveBeenCalled()
          await ui.step(1000)
          expect(ui.match.getSnapshot()).toEqual(stopped)
          expect(ui.epoch()).toBe(before.readinessEpoch + 1)
          recover(ui)
          await ui.step()
          expect(ui.match.getSnapshot()).toEqual(stopped)
          ui.element('ready').onclick()
          await vi.advanceTimersByTimeAsync(0)
          expect(ui.match.getSnapshot()).toEqual(stopped)
          await remoteReady(ui)
          await ui.step()
          local()
          await vi.advanceTimersByTimeAsync(0)
          expect(ui.match.getSnapshot().paused).toBe(false)
          if (round === 'round1') expect(latestState(ui).ritual.completed).toBe(1)
          else expect(ui.previewSound.trigger).toHaveBeenCalledWith('rattle')
        }
      )

      it.each(['local key', 'frame before 100ms', 'incoming active state'])(
        'guest ' + round + ' latches one stop after ' + cause + ' at %s',
        async (boundary) => {
          const ui = await mountMain('guest')
          const epoch = await startGuest(ui, round)
          const code = round === 'round1' ? 'Digit3' : 'KeyE'
          const type = round === 'round1' ? 'effect' : 'ritual'
          ui.key(code)
          await vi.advanceTimersByTimeAsync(0)
          expect(messages(ui, type)).toHaveLength(1)
          ui.partner.received.mockClear()
          ui.previewSound.start.mockClear()
          fail(ui, cause)
          if (boundary === 'local key') ui.key(code)
          else if (boundary === 'incoming active state') await ui.state(epoch)
          else ui.render()
          await vi.advanceTimersByTimeAsync(0)
          expect(messages(ui, 'stop')).toEqual([{ type: 'stop', requestId: 1, epoch }])
          expect(messages(ui, 'health').at(-1).mic).toBe(false)
          for (const action of ['KeyE', 'Digit1', 'Digit2', 'Digit3']) ui.key(action)
          ui.key('KeyW')
          await ui.step(300, 0.1, { epoch })
          recover(ui)
          await ui.step(100, 0.1, { epoch })
          expect([...new Set(messages(ui, 'stop').map((stop) => stop.requestId))]).toEqual([1])
          for (const category of ['input', 'effect', 'ritual', 'ready']) expect(messages(ui, category)).toEqual([])
          expect(ui.previewSound.start).not.toHaveBeenCalled()
          ui.match.pause()
          await ui.state(epoch + 1, { stoppedRequest: 1 })
          await ui.step(100, 0.1, { epoch: epoch + 1 })
          expect(messages(ui, 'ready')).toEqual([])
          ui.element('ready').onclick()
          await vi.advanceTimersByTimeAsync(0)
          expect(messages(ui, 'ready')).toContainEqual({ type: 'ready', value: true, epoch: epoch + 1, threshold: 0.1 })
          ui.match.resume()
          await ui.state(epoch + 2, { stoppedRequest: 1 })
          await ui.step(100, 0.1, { epoch: epoch + 2 })
          expect(messages(ui, 'input')).toHaveLength(1)
          ui.key(code)
          await vi.advanceTimersByTimeAsync(0)
          expect(messages(ui, type)).toHaveLength(1)
          expect(ui.previewSound.start).toHaveBeenCalled()
        }
      )
    }
  }

  it.each(['round1', 'round2'] as const)(
    'rejects incoming guest movement before the next %s host frame',
    async (round) => {
      const ui = await mountMain('host')
      await startHost(ui, round)
      const before = latestState(ui)
      const challenge = messages(ui, 'health').at(-1).challenge
      ui.track.enabled = false
      ui.partner.peer.send({
        type: 'input',
        sequence: 1,
        epoch: before.readinessEpoch,
        round,
        challenge,
        forward: 1,
        strafe: 0,
        turnTotal: 1
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.match.getSnapshot()).toEqual({ ...before.snapshot, paused: true })
      ui.render()
      await vi.advanceTimersByTimeAsync(0)
      expect(latestState(ui).human).toEqual(before.human)
      expect(latestState(ui).haunter).toEqual(before.haunter)
      expect(ui.epoch()).toBe(before.readinessEpoch + 1)
    }
  )

  it.each(['disabled track', 'silent audio suspension'])(
    'guest requests a stop when only the host is ready after %s',
    async (cause) => {
      const ui = await mountMain('guest')
      await remoteReady(ui)
      ui.partner.received.mockClear()
      fail(ui, cause)
      ui.element('ready').onclick()
      await vi.advanceTimersByTimeAsync(0)
      expect(messages(ui, 'stop')).toEqual([{ type: 'stop', requestId: 1, epoch: 0 }])
      expect(messages(ui, 'ready')).toEqual([])
      recover(ui)
      await ui.step()
      expect(ui.element('ready').disabled).toBe(true)
      await ui.state(1, { stoppedRequest: 1 })
      await ui.step(100, 0.1, { epoch: 1 })
      expect(ui.element('ready').disabled).toBe(false)
    }
  )

  for (const role of ['host', 'guest'] as const) {
    it(role + ' does not interrupt recursively after connection loss observes an unhealthy mic', async () => {
      const ui = await mountMain(role)
      if (role === 'host') await startHost(ui, 'round1')
      else await startGuest(ui, 'round1')
      ui.partner.peer.close()
      await vi.advanceTimersByTimeAsync(0)
      const reason = ui.element('notice').textContent
      const stops = ui.previewSound.stop.mock.calls.length
      ui.track.enabled = false
      ui.key('KeyE')
      ui.key('Digit3')
      ui.render()
      ui.render()
      ui.element('ready').onclick()
      expect(ui.element('notice').textContent).toBe(reason)
      expect(ui.previewSound.stop).toHaveBeenCalledTimes(stops)
      expect(ui.element('ready').disabled).toBe(true)
    })

    for (const cause of ['disabled track', 'silent audio suspension']) {
      it.each(['unprepared click', 'local ready first', 'remote ready first'])(
        role + ' rejects stale enabled lobby readiness after ' + cause + ' (%s)',
        async (order) => {
          const ui = await mountMain(role)
          if (order === 'local ready first') ui.element('ready').onclick()
          if (order === 'remote ready first') await remoteReady(ui)
          await vi.advanceTimersByTimeAsync(0)
          ui.partner.received.mockClear()
          fail(ui, cause)
          if (order === 'local ready first') await remoteReady(ui)
          else {
            expect(ui.element('ready').disabled).toBe(false)
            ui.element('ready').onclick()
          }
          await vi.advanceTimersByTimeAsync(0)
          expect(ui.match.getSnapshot().phase).toBe('lobby')
          expect(messages(ui, 'ready')).toEqual([])
          expect(ui.element('ready').disabled).toBe(true)
          recover(ui)
          await ui.step()
          expect(ui.match.getSnapshot().phase).toBe('lobby')
          expect(messages(ui, 'ready')).toEqual([])
          if (role === 'guest' && order === 'local ready first') {
            expect(messages(ui, 'stop').at(-1)).toEqual({ type: 'stop', requestId: 1, epoch: 0 })
            expect(ui.element('ready').disabled).toBe(true)
          }
        }
      )
    }
  }
})

describe('main interruption safety through the MoQ peer broker', () => {
  const messages = (ui: Awaited<ReturnType<typeof mountMain>>, type: string) =>
    ui.partner.received.mock.calls.map(([value]) => value as any).filter((value) => value.type === type)
  const prepareHost = async (ui: Awaited<ReturnType<typeof mountMain>>) => {
    await ui.step()
    ui.element('ready').onclick()
    ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
  }

  it('pauses before recovered health despite a preceding effect missing every ACK', async () => {
    const ui = await mountMain('host')
    await prepareHost(ui)
    const epoch = ui.epoch()
    network.broker.drop = (packet) => packet.frame.kind === 'ack'
    ui.partner.peer.send({ type: 'effect', kind: 'rattle', round: 'round1', requestId: 1, epoch })
    await vi.advanceTimersByTimeAsync(0)
    expect(messages(ui, 'state').at(-1).effect?.kind).toBe('rattle')
    ui.partner.peer.send({ type: 'stop', requestId: 1, epoch })
    await ui.health()
    expect(ui.match.getSnapshot().paused).toBe(true)
    expect(ui.epoch()).toBe(epoch + 1)
    expect(messages(ui, 'state').at(-1).stoppedRequest).toBe(1)
    const stopped = ui.match.getSnapshot()
    const spirit = messages(ui, 'state').at(-1).spirit
    await ui.step(1000)
    expect(ui.match.getSnapshot()).toEqual(stopped)
    expect(messages(ui, 'state').at(-1).spirit).toEqual(spirit)
    expect(ui.epoch()).toBe(epoch + 1)
  })

  it('retries a guest stop before health every 100ms until a matching host confirmation', async () => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(2)
    await ui.step(100, 0.1, { epoch: 2 })
    ui.partner.received.mockClear()
    network.broker.drop = (packet) => packet.frame.kind === 'ack'
    ui.key('Digit1')
    await vi.advanceTimersByTimeAsync(0)
    const attempts: any[] = []
    let loseStop = true
    network.broker.drop = (packet) => {
      if (packet.frame.kind === 'ack') return true
      const value = packet.frame.value as any
      if (value?.type === 'stop' || (value?.type === 'health' && packet.receiver === network.broker.sessions[0]))
        attempts.push(value)
      return (value?.type === 'stop' && loseStop) || packet.frame.category === 'state'
    }
    ui.track.muted = true
    ui.track.onmute()
    ui.track.muted = false
    ui.track.onunmute()
    await vi.advanceTimersByTimeAsync(0)
    expect(messages(ui, 'stop')).toEqual([])
    attempts.length = 0
    await ui.step(200, 0.1, { epoch: 2 })
    expect(attempts.map((value) => value.type)).toEqual(['stop', 'health', 'stop', 'health'])
    expect(attempts.filter((value) => value.type === 'stop')).toEqual([
      { type: 'stop', requestId: 1, epoch: 2 },
      { type: 'stop', requestId: 1, epoch: 2 }
    ])
    loseStop = false
    await ui.step(100, 0.1, { epoch: 2 })
    expect(messages(ui, 'stop')).toEqual([{ type: 'stop', requestId: 1, epoch: 2 }])
    ui.match.pause()
    await ui.state(3, { stoppedRequest: 1 })
    await ui.step(100, 0.1, { epoch: 2 })
    expect(messages(ui, 'stop')).toHaveLength(2)
    expect(ui.element('ready').disabled).toBe(true)
    network.broker.drop = (packet) => packet.frame.kind === 'ack'
    await ui.state(2, { stoppedRequest: 1 })
    await ui.step(100, 0.1, { epoch: 2 })
    expect(messages(ui, 'stop')).toHaveLength(3)
    await ui.state(3, { stoppedRequest: 0 })
    await ui.step(100, 0.1, { epoch: 3 })
    expect(messages(ui, 'stop')).toHaveLength(4)
    await ui.state(3, { stoppedRequest: 1 })
    await ui.step(200, 0.1, { epoch: 3 })
    expect(messages(ui, 'stop')).toHaveLength(4)
    expect(ui.element('ready').disabled).toBe(false)
    expect(messages(ui, 'ready')).toEqual([])
    expect(messages(ui, 'input')).toEqual([])
    ui.track.onmute()
    await vi.advanceTimersByTimeAsync(0)
    expect(messages(ui, 'stop').at(-1)).toEqual({ type: 'stop', requestId: 2, epoch: 3 })
  })

  it('retains a guest stop when a blocked write replaces unhealthy health with recovery', async () => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(2)
    await ui.step(100, 0.1, { epoch: 2 })
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 2000)
    let release!: () => void
    vi.spyOn(network.broker.sessions[1].raw, 'sendSubgroupHeader').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    ui.partner.received.mockClear()
    const track = ui.track as typeof ui.track & { onmute(): void; onunmute(): void }
    track.muted = true
    track.onmute()
    track.muted = false
    track.onunmute()
    await vi.advanceTimersByTimeAsync(0)
    release()
    await vi.advanceTimersByTimeAsync(0)
    const received = ui.partner.received.mock.calls.map(([value]) => value as any)
    expect(received.filter((value) => value.type === 'health').map((value) => value.mic)).toEqual([true])
    expect(received).toContainEqual({ type: 'stop', requestId: 1, epoch: 2 })
  })

  it('reproduces host continuation when only replaceable false then true health is sent', async () => {
    const ui = await mountMain('host')
    await ui.step()
    ui.element('ready').onclick()
    ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot().phase).toBe('round1')
    const raw = network.broker.sessions[1].raw
    const original = raw.sendSubgroupObject.bind(raw)
    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(raw, 'sendSubgroupObject').mockImplementationOnce(async (...args) => {
      await barrier
      await original(...args)
    })
    await ui.health()
    await ui.health(0.1, { mic: false })
    await ui.health()
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot().paused).toBe(false)
    await ui.health(0.1, { mic: false })
    expect(ui.match.getSnapshot().paused).toBe(true)
  })

  it.each(['mute', 'ended', 'audio suspension', '501ms frame stall'] as const)(
    'latches %s through false-to-true write replacement until the host confirms processing',
    async (cause) => {
      const ui = await mountMain('guest')
      ui.match.start()
      await ui.state(2)
      await ui.step(100, 0.1, { epoch: 2 })
      const raw = network.broker.sessions[1].raw
      const original = raw.sendSubgroupObject.bind(raw)
      let release!: () => void
      const barrier = new Promise<void>((resolve) => {
        release = resolve
      })
      vi.spyOn(raw, 'sendSubgroupObject').mockImplementationOnce(async (...args) => {
        await barrier
        await original(...args)
      })
      ui.partner.received.mockClear()
      ui.element('threshold').oninput()
      if (cause === 'mute') {
        ui.track.muted = true
        ui.track.onmute()
        ui.track.muted = false
        ui.track.onunmute()
      } else if (cause === 'ended') {
        ui.track.readyState = 'ended'
        ui.track.onended()
        await ui.element('microphone').onclick()
        ui.track.readyState = 'live'
        ui.track.onunmute()
      } else if (cause === 'audio suspension') {
        ui.audioContext.state = 'suspended'
        ui.audioContext.onstatechange!()
        ui.audioContext.state = 'running'
        ui.element('threshold').oninput()
      } else {
        await vi.advanceTimersByTimeAsync(501)
        ui.render()
      }
      expect(ui.element('ready').disabled).toBe(true)
      release()
      await vi.advanceTimersByTimeAsync(0)
      expect(messages(ui, 'health').every((health) => health.mic)).toBe(true)
      expect(messages(ui, 'stop')).toEqual([{ type: 'stop', requestId: 1, epoch: 2 }])
      await ui.state(3, { stoppedRequest: 1 })
      expect(ui.element('ready').disabled).toBe(true)
      ui.match.pause()
      await ui.state(3)
      await ui.health(0.1, { epoch: 3 })
      expect(ui.element('ready').disabled).toBe(true)
      ui.key('Digit1')
      ui.key('KeyE')
      ui.mouse(50)
      ui.element('ready').onclick()
      await ui.step(100, 0.1, { epoch: 3 })
      expect(messages(ui, 'ready')).toEqual([])
      expect(messages(ui, 'input')).toEqual([])
      expect(messages(ui, 'effect')).toEqual([])
      expect(messages(ui, 'ritual')).toEqual([])
      for (const stoppedRequest of [0, 2, -1, '1', 1.5]) {
        await ui.state(3, { stoppedRequest })
        expect(ui.element('ready').disabled).toBe(true)
      }
      await ui.state(3, { stoppedRequest: 1 })
      expect(ui.element('ready').disabled).toBe(false)
      expect(messages(ui, 'ready')).toEqual([])
      ui.element('ready').onclick()
      await vi.advanceTimersByTimeAsync(0)
      expect(messages(ui, 'ready')).toHaveLength(1)
      ui.track.muted = true
      ui.track.onmute()
      await vi.advanceTimersByTimeAsync(0)
      expect(messages(ui, 'stop').at(-1)).toEqual({ type: 'stop', requestId: 2, epoch: 3 })
      await ui.state(4, { stoppedRequest: 1 })
      expect(ui.element('ready').disabled).toBe(true)
      await ui.state(4, { stoppedRequest: 2 })
      expect(ui.element('ready').disabled).toBe(true)
      ui.track.muted = false
      ui.track.onunmute()
      await ui.health(0.1, { epoch: 4 })
      expect(ui.element('ready').disabled).toBe(false)
    }
  )

  it.each(['initial start', 'round1 resume', 'role exchange', 'round2 resume'] as const)(
    'pauses a delayed stop arriving just after %s, but never replays it into another epoch',
    async (transition) => {
      const ui = await mountMain('host')
      if (transition !== 'initial start') {
        await prepareHost(ui)
        if (transition === 'role exchange' || transition === 'round2 resume') {
          ui.match.tick(900000)
          await ui.step()
          if (transition === 'round2 resume') await prepareHost(ui)
        }
        if (transition.endsWith('resume')) await ui.health(0.1, { mic: false })
        await ui.step()
      }
      const request = { type: 'stop', requestId: 1, epoch: ui.epoch() }
      network.broker.hold = (packet) => (packet.frame.value as any)?.type === 'stop'
      ui.partner.peer.send(request)
      await vi.advanceTimersByTimeAsync(0)
      await prepareHost(ui)
      expect(ui.match.getSnapshot().paused).toBe(false)
      const playingEpoch = ui.epoch()
      const packet = network.broker.pending.shift()!
      network.broker.hold = undefined
      network.broker.deliver(packet)
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.match.getSnapshot().paused).toBe(true)
      expect(ui.epoch()).toBe(playingEpoch + 1)
      expect(messages(ui, 'state').at(-1).stoppedRequest).toBe(1)
      const stopped = ui.match.getSnapshot()
      const stoppedSpirit = messages(ui, 'state').at(-1).spirit
      await ui.step(1000)
      expect(ui.match.getSnapshot()).toEqual(stopped)
      expect(messages(ui, 'state').at(-1).spirit).toEqual(stoppedSpirit)
      ui.element('ready').onclick()
      await ui.step()
      expect(ui.match.getSnapshot().paused).toBe(true)
      ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.match.getSnapshot().paused).toBe(false)
      const resumedEpoch = ui.epoch()
      network.broker.deliver(packet)
      ui.partner.peer.send({ ...request, epoch: resumedEpoch })
      await vi.advanceTimersByTimeAsync(0)
      await ui.step(1000)
      expect(ui.match.getSnapshot().paused).toBe(false)
      expect(ui.epoch()).toBe(resumedEpoch)
      ui.partner.peer.send({ type: 'stop', requestId: 2, epoch: resumedEpoch })
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.match.getSnapshot().paused).toBe(true)
      expect(ui.epoch()).toBe(resumedEpoch + 1)
    }
  )

  for (const role of ['host', 'guest'] as const) {
    it.each([500, 501])(role + ': preserves the exact frame-stall safety boundary at %ims', async (elapsed) => {
      const ui = await mountMain(role)
      if (role === 'host') await prepareHost(ui)
      else {
        ui.match.start()
        await ui.state(2)
      }
      await ui.step(100, 0.1, { epoch: role === 'host' ? ui.epoch() : 2 })
      ui.partner.received.mockClear()
      await vi.advanceTimersByTimeAsync(elapsed)
      ui.render()
      await vi.advanceTimersByTimeAsync(0)
      if (role === 'host') expect(ui.match.getSnapshot().paused).toBe(elapsed > 500)
      else
        expect(messages(ui, 'stop')).toEqual(
          elapsed > 500 ? Array.from({ length: 2 }, () => ({ type: 'stop', requestId: 1, epoch: 2 })) : []
        )
      expect(ui.element('notice').textContent).toBe(
        elapsed > 500 ? '画面が停止したため中断しました。両者で再開してください。' : ''
      )
    })

    it.each([
      [862, 8.3, true],
      [10, 600, false]
    ])(role + ': uses callback time for a %ims gap and %ims animation timestamp', async (gap, rafGap, stopped) => {
      const ui = await mountMain(role)
      if (role === 'host') await prepareHost(ui)
      else {
        ui.match.start()
        await ui.state(2)
      }
      await ui.step(100, 0.1, { epoch: role === 'host' ? ui.epoch() : 2 })
      const before = ui.match.getSnapshot()
      const baseline = performance.now()
      if (gap > 450) await vi.advanceTimersByTimeAsync(450)
      await ui.health(0.1, { epoch: role === 'host' ? ui.epoch() : 2, phase: 'round1', playing: true })
      await vi.advanceTimersByTimeAsync(gap > 450 ? gap - 450 : gap)
      ui.partner.received.mockClear()
      ui.renderAt(baseline + rafGap)
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.element('notice').textContent).toBe(
        stopped ? '画面が停止したため中断しました。両者で再開してください。' : ''
      )
      if (role === 'host') {
        expect(ui.match.getSnapshot().paused).toBe(stopped)
        if (stopped) {
          expect(ui.match.getSnapshot().elapsedMs).toBe(before.elapsedMs)
          expect(ui.match.getSnapshot().scores).toEqual(before.scores)
        }
      } else expect(messages(ui, 'stop').length > 0).toBe(stopped)
    })

    it(role + ': expires health at 501ms even when the animation timestamp is behind', async () => {
      const ui = await mountMain(role)
      if (role === 'host') await prepareHost(ui)
      else {
        ui.match.start()
        await ui.state(2)
      }
      await ui.step(100, 0.1, { epoch: role === 'host' ? ui.epoch() : 2 })
      const baseline = performance.now()
      ui.partner.received.mockClear()
      await vi.advanceTimersByTimeAsync(500)
      ui.renderAt(baseline + 499)
      expect(ui.element('notice').textContent).toBe('')
      await vi.advanceTimersByTimeAsync(1)
      ui.renderAt(baseline + 499.5)
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.element('notice').textContent).toBe('相手の応答がありません。')
      if (role === 'host') expect(ui.match.getSnapshot().paused).toBe(true)
      else expect(messages(ui, 'stop').length).toBeGreaterThan(0)
    })
  }

  it.each([
    ['mute', 'マイクが停止しました。もう一度許可してください。', true],
    ['ended', 'マイクが停止しました。もう一度許可してください。', true],
    ['audio suspension', 'マイク音声を解析できません。もう一度許可してください。', true],
    ['frame stall', '画面が停止したため中断しました。両者で再開してください。', true],
    ['health timeout', '相手の応答がありません。', true],
    ['invalid health', '相手の音声情報が不正なため中断しました。', true],
    ['remote microphone', '相手のマイクが利用できません。再確認してください。', false]
  ] as const)(
    'retains the guest %s reason through stop confirmation, epochs and re-preparation',
    async (cause, reason, notifies) => {
      const ui = await mountMain('guest')
      ui.match.start()
      await ui.state(2)
      await ui.step(100, 0.1, { epoch: 2 })
      expect(ui.element('notice').textContent).toBe('')
      ui.partner.received.mockClear()
      if (cause === 'mute') ui.track.onmute()
      else if (cause === 'ended') ui.track.onended()
      else if (cause === 'audio suspension') {
        ui.audioContext.state = 'suspended'
        ui.audioContext.onstatechange!()
        ui.audioContext.state = 'running'
      } else if (cause === 'frame stall') {
        await vi.advanceTimersByTimeAsync(501)
        ui.render()
      } else if (cause === 'health timeout') {
        await vi.advanceTimersByTimeAsync(500)
        ui.render()
        expect(ui.element('notice').textContent).toBe('')
        await vi.advanceTimersByTimeAsync(1)
        ui.render()
      } else await ui.health(0.1, { epoch: 2, mic: cause === 'invalid health' ? 'invalid' : false })
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.element('notice').textContent).toBe(reason)
      const stoppedRequest = notifies ? 1 : 0
      const stopCount = notifies ? (cause === 'frame stall' ? 2 : 1) : 0
      expect(messages(ui, 'stop')).toEqual(
        Array.from({ length: stopCount }, () => ({ type: 'stop', requestId: 1, epoch: 2 }))
      )
      const inputsBeforePause = messages(ui, 'input').length
      expect(inputsBeforePause).toBe(cause === 'health timeout' ? 1 : 0)
      ui.key('KeyW')
      ui.match.pause()
      await ui.state(2, { stoppedRequest })
      expect(ui.element('notice').textContent).toBe(reason)
      if (notifies) expect(ui.element('ready').disabled).toBe(true)
      await ui.state(3, { stoppedRequest })
      await ui.health(0.1, { epoch: 3 })
      await ui.state(3, { stoppedRequest })
      await ui.step(100, 0.1, { epoch: 3 })
      expect(ui.element('notice').textContent).toBe(reason)
      expect(messages(ui, 'stop')).toHaveLength(stopCount)
      expect(messages(ui, 'input')).toHaveLength(inputsBeforePause)
      expect(messages(ui, 'ready')).toEqual([])
      expect(ui.element('ready').disabled).toBe(false)
      ui.element('ready').onclick()
      await vi.advanceTimersByTimeAsync(0)
      expect(messages(ui, 'ready')).toContainEqual({ type: 'ready', value: true, epoch: 3, threshold: 0.1 })
      expect(ui.element('notice').textContent).toBe(reason)
      ui.match.resume()
      await ui.state(4, { stoppedRequest })
      expect(ui.element('notice').textContent).toBe('')
      await ui.step(100, 0.1, { epoch: 4 })
      expect(messages(ui, 'input')).toHaveLength(inputsBeforePause + 1)
      ui.track.onmute()
      ui.track.onmute()
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.element('notice').textContent).toBe('マイクが停止しました。もう一度許可してください。')
      expect(messages(ui, 'stop').at(-1)).toEqual({ type: 'stop', requestId: stoppedRequest + 1, epoch: 4 })
      expect(messages(ui, 'stop')).toHaveLength(stopCount + 1)
    }
  )

  it('retains a local reason when a new playing epoch overtakes the host pause confirmation', async () => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(2)
    await ui.step(100, 0.1, { epoch: 2 })
    ui.partner.received.mockClear()
    ui.track.onmute()
    await vi.advanceTimersByTimeAsync(0)
    const reason = 'マイクが停止しました。もう一度許可してください。'
    await ui.state(3, { stoppedRequest: 1 })
    expect(ui.element('notice').textContent).toBe(reason)
    expect(ui.element('ready').disabled).toBe(true)
    ui.match.pause()
    await ui.state(3, { stoppedRequest: 0 })
    expect(ui.element('notice').textContent).toBe(reason)
    expect(ui.element('ready').disabled).toBe(true)
    await ui.state(3, { stoppedRequest: 1 })
    await ui.health(0.1, { epoch: 3 })
    expect(ui.element('notice').textContent).toBe(reason)
    expect(ui.element('ready').disabled).toBe(false)
    expect(messages(ui, 'stop')).toEqual([{ type: 'stop', requestId: 1, epoch: 2 }])
    ui.match.resume()
    await ui.state(4, { stoppedRequest: 1 })
    expect(ui.element('notice').textContent).toBe('')
  })

  it('updates the pause notice only when its text changes', async () => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(2)
    await ui.step(100, 0.1, { epoch: 2 })

    const notice = ui.element('notice')
    let value = notice.textContent as string
    const writes: string[] = []
    Object.defineProperty(notice, 'textContent', {
      configurable: true,
      get: () => value,
      set: (next: string) => {
        writes.push(next)
        value = next
      }
    })

    const paused = '相手が中断しました。両者で再準備してください。'
    ui.match.pause()
    await ui.state(3)
    expect(notice.textContent).toBe(paused)
    expect(writes).toEqual([paused])
    for (let index = 0; index < 5; index++) await ui.state(3)
    expect(writes).toEqual([paused])

    ui.match.resume()
    await ui.state(4)
    await ui.state(4)
    expect(notice.textContent).toBe('')
    expect(writes).toEqual([paused, ''])

    ui.match.pause()
    await ui.state(5)
    expect(writes).toEqual([paused, '', paused])
    ui.track.onmute()
    const microphoneError = 'マイクが停止しました。もう一度許可してください。'
    expect(notice.textContent).toBe(microphoneError)
    await ui.state(5)
    expect(writes).toEqual([paused, '', paused, microphoneError])
  })

  it.each(['same epoch first', 'new epoch first'] as const)(
    'shows a host-originated pause until an explicit playing state, with %s',
    async (order) => {
      const ui = await mountMain('guest')
      ui.match.start()
      await ui.state(2)
      await ui.step(100, 0.1, { epoch: 2 })
      expect(ui.element('notice').textContent).toBe('')
      ui.partner.received.mockClear()
      ui.match.pause()
      if (order === 'same epoch first') {
        await ui.state(2)
        expect(ui.element('notice').textContent).toBe('相手が中断しました。両者で再準備してください。')
      }
      network.broker.hold = (packet) => packet.frame.category === 'state'
      await ui.state(3)
      const packet = network.broker.pending.pop()!
      network.broker.hold = undefined
      network.broker.deliver(packet)
      network.broker.deliver(packet)
      await vi.advanceTimersByTimeAsync(0)
      await ui.health(0.1, { epoch: 3 })
      expect(ui.element('notice').textContent).toBe('相手が中断しました。両者で再準備してください。')
      expect(messages(ui, 'stop')).toEqual([])
      ui.element('ready').onclick()
      await vi.advanceTimersByTimeAsync(0)
      await ui.state(4)
      expect(ui.element('notice').textContent).toBe('相手が中断しました。両者で再準備してください。')
      ui.match.resume()
      await ui.state(5)
      expect(ui.element('notice').textContent).toBe('')
      network.broker.deliver(packet)
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.element('notice').textContent).toBe('')
      ui.match.pause()
      await ui.state(6)
      expect(ui.element('notice').textContent).toBe('相手が中断しました。両者で再準備してください。')
    }
  )

  it.each(['host', 'guest'] as const)(
    '%s: keeps explicit microphone failure and reconnection reasons',
    async (role) => {
      const ui = await mountMain(role)
      if (role === 'host') await prepareHost(ui)
      else {
        ui.match.start()
        await ui.state(2)
      }
      vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockRejectedValueOnce(new Error('Permission denied'))
      await ui.element('microphone').onclick()
      await vi.advanceTimersByTimeAsync(0)
      if (role === 'guest') {
        ui.match.pause()
        await ui.state(3, { stoppedRequest: 1 })
      }
      expect(ui.element('notice').textContent).toBe('マイクを利用できません。ブラウザの許可を確認してください。')
      await ui.element('microphone').onclick()
      await vi.advanceTimersByTimeAsync(0)
      if (role === 'guest') await ui.state(4, { stoppedRequest: 2 })
      expect(ui.element('notice').textContent).toBe('マイクを再接続しています。')
    }
  )

  it.each(['host', 'guest'] as const)('%s: retains the connection loss reason without echoing a stop', async (role) => {
    const ui = await mountMain(role)
    if (role === 'host') await prepareHost(ui)
    else {
      ui.match.start()
      await ui.state(2)
    }
    ui.partner.received.mockClear()
    ui.partner.peer.close()
    await vi.advanceTimersByTimeAsync(100)
    ui.render()
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.element('notice').textContent).toBe('MoQ接続が切れました。双方で終了してやり直してください。')
    expect(ui.element('ready').disabled).toBe(true)
    expect(messages(ui, 'stop')).toEqual([])
  })

  it('clears the host reason only after both players re-prepare and displays the next cause', async () => {
    const ui = await mountMain('host')
    await prepareHost(ui)
    const before = ui.match.getSnapshot()
    const epoch = ui.epoch()
    ui.audioContext.state = 'suspended'
    ui.audioContext.onstatechange!()
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.epoch()).toBe(epoch + 1)
    const reason = 'マイク音声を解析できません。もう一度許可してください。'
    expect(ui.element('notice').textContent).toBe(reason)
    ui.audioContext.state = 'running'
    await ui.step(1000)
    expect(ui.match.getSnapshot()).toEqual({ ...before, paused: true })
    expect(ui.element('notice').textContent).toBe(reason)
    ui.element('ready').onclick()
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.element('notice').textContent).toBe(reason)
    ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot().paused).toBe(false)
    expect(ui.element('notice').textContent).toBe('')
    ui.track.onmute()
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.element('notice').textContent).toBe('マイクが停止しました。もう一度許可してください。')
  })

  it('freezes a spent spirit budget, cooldown, scores and match clock throughout a stop', async () => {
    const ui = await mountMain('host')
    await prepareHost(ui)
    ui.partner.peer.send({ type: 'effect', kind: 'rattle', round: 'round1', requestId: 1, epoch: ui.epoch() })
    await vi.advanceTimersByTimeAsync(0)
    await ui.step(200)
    ui.partner.peer.send({ type: 'stop', requestId: 1, epoch: ui.epoch() })
    await vi.advanceTimersByTimeAsync(0)
    const stopped = ui.match.getSnapshot()
    const spirit = messages(ui, 'state').at(-1).spirit
    expect(spirit.energy).toBe(80)
    const { spiritStatus } = await import('../src/spirit')
    const { HUMAN_START, HAUNTER_START } = await import('../src/world')
    const status = spiritStatus(spirit, stopped, 'rattle', HUMAN_START, HAUNTER_START)
    await ui.step(2000)
    expect(ui.match.getSnapshot()).toEqual(stopped)
    expect(
      spiritStatus(messages(ui, 'state').at(-1).spirit, ui.match.getSnapshot(), 'rattle', HUMAN_START, HAUNTER_START)
    ).toEqual(status)
  })

  it('does not rewrite a terminal result when a delayed stop arrives after the match finished', async () => {
    const ui = await mountMain('host')
    await prepareHost(ui)
    ui.match.tick(900000)
    await ui.step()
    await prepareHost(ui)
    network.broker.hold = (packet) => (packet.frame.value as any)?.type === 'stop'
    ui.partner.peer.send({ type: 'stop', requestId: 1, epoch: ui.epoch() })
    await vi.advanceTimersByTimeAsync(0)
    const packet = network.broker.pending.shift()!
    ui.match.tick(899900)
    await ui.step()
    expect(ui.match.getSnapshot().phase).toBe('finished')
    const result = ui.match.getSnapshot()
    const epoch = ui.epoch()
    network.broker.hold = undefined
    network.broker.deliver(packet)
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot()).toEqual(result)
    expect(ui.epoch()).toBe(epoch)
    expect(messages(ui, 'state').at(-1).stoppedRequest).toBe(0)
  })

  it.each(['health first', 'stop first'] as const)(
    'handles unhealthy health %s without echoing stops or endlessly increasing epochs',
    async (order) => {
      const ui = await mountMain('host')
      await prepareHost(ui)
      const request = { type: 'stop', requestId: 1, epoch: ui.epoch() }
      const stop = async () => {
        ui.partner.peer.send(request)
        await vi.advanceTimersByTimeAsync(0)
      }
      if (order === 'health first') await ui.health(0.1, { mic: false })
      await stop()
      if (order === 'stop first') await ui.health(0.1, { mic: false })
      const epoch = ui.epoch()
      await ui.step(1000, 0.1, { mic: false })
      expect(ui.epoch()).toBe(epoch)
      expect(messages(ui, 'stop')).toEqual([])
      expect(ui.match.getSnapshot().paused).toBe(true)
      expect(ui.element('ready').disabled).toBe(true)
      await ui.step()
      ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.match.getSnapshot().paused).toBe(true)
      ui.element('ready').onclick()
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.match.getSnapshot().paused).toBe(false)
    }
  )

  it('does not echo repeated host health interruptions', async () => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(2)
    await ui.step(1000, 0.1, { epoch: 2, mic: false })
    expect(messages(ui, 'stop')).toEqual([])
    expect(ui.element('ready').disabled).toBe(true)
  })

  it('invalidates in-flight readiness on a new local host stop even when already paused', async () => {
    const ui = await mountMain('host')
    await prepareHost(ui)
    ui.track.muted = true
    ui.track.onmute()
    await vi.advanceTimersByTimeAsync(0)
    ui.track.muted = false
    ui.track.onunmute()
    await ui.step()
    const epoch = ui.epoch()
    network.broker.hold = (packet) => packet.frame.category === 'ready'
    ui.partner.peer.send({ type: 'ready', value: true, epoch, threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
    ui.audioContext.state = 'suspended'
    ui.audioContext.onstatechange!()
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.epoch()).toBe(epoch + 1)
    ui.audioContext.state = 'running'
    network.broker.hold = undefined
    for (const packet of network.broker.pending.splice(0)) network.broker.deliver(packet)
    await ui.step()
    ui.element('ready').onclick()
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot().paused).toBe(true)
    ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot().paused).toBe(false)
  })

  it('ignores malformed stop requests without consuming the next valid request', async () => {
    const ui = await mountMain('host')
    await prepareHost(ui)
    const epoch = ui.epoch()
    for (const extra of [
      { requestId: 0 },
      { requestId: -1 },
      { requestId: 2 },
      { requestId: '1' },
      { requestId: 1.5 },
      { requestId: Number.MAX_SAFE_INTEGER + 1 },
      { epoch: -1 },
      { epoch: '2' },
      { epoch: epoch + 1 },
      { epoch: null },
      { epoch: 1.5 }
    ]) {
      ui.partner.peer.send({ type: 'stop', requestId: 1, epoch, ...extra })
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.match.getSnapshot().paused).toBe(false)
      expect(ui.epoch()).toBe(epoch)
    }
    ui.partner.peer.send({ type: 'stop', requestId: 1, epoch })
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot().paused).toBe(true)
    expect(ui.epoch()).toBe(epoch + 1)
  })

  it('applies an application-retried stop only once despite a preceding lost effect ACK and lost confirmation', async () => {
    const ui = await mountMain('host')
    await prepareHost(ui)
    const epoch = ui.epoch()
    let droppedStop = false
    let droppedAck = false
    const states: any[] = []
    network.broker.drop = (packet) => {
      if (!droppedStop && (packet.frame.value as any)?.type === 'stop') return (droppedStop = true)
      if (packet.frame.kind === 'ack') return (droppedAck = true)
      if (packet.frame.category === 'state') states.push(packet.frame.value)
      return packet.frame.category === 'state'
    }
    ui.partner.peer.send({ type: 'effect', kind: 'rattle', round: 'round1', requestId: 1, epoch })
    ui.partner.peer.send({ type: 'stop', requestId: 1, epoch })
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot().paused).toBe(false)
    await ui.step(100)
    expect(ui.match.getSnapshot().paused).toBe(false)
    ui.partner.peer.send({ type: 'stop', requestId: 1, epoch })
    await vi.advanceTimersByTimeAsync(0)
    expect(droppedStop && droppedAck).toBe(true)
    expect(ui.match.getSnapshot().paused).toBe(true)
    expect(states.at(-1).readinessEpoch).toBe(epoch + 1)
    const stopped = ui.match.getSnapshot()
    for (let retry = 0; retry < 4; retry++) {
      ui.partner.peer.send({ type: 'stop', requestId: 1, epoch })
      await ui.step(100)
      expect(ui.match.getSnapshot()).toEqual(stopped)
      expect(states.at(-1).readinessEpoch).toBe(epoch + 1)
    }
  })

  it('keeps the guest latched when a host confirmation is dropped or belongs to the wrong epoch', async () => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(2)
    await ui.health(0.1, { epoch: 2 })
    ui.track.onmute()
    await vi.advanceTimersByTimeAsync(0)
    ui.match.pause()
    await ui.state(2, { stoppedRequest: 1 })
    expect(ui.element('ready').disabled).toBe(true)
    network.broker.drop = (packet) => packet.frame.category === 'state'
    await ui.state(3, { stoppedRequest: 1 })
    expect(ui.element('ready').disabled).toBe(true)
    network.broker.drop = undefined
    await ui.state(3, { stoppedRequest: 1 })
    expect(ui.element('ready').disabled).toBe(false)
    ui.track.onmute()
    await vi.advanceTimersByTimeAsync(0)
    ui.partner.peer.close()
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.element('ready').disabled).toBe(true)
    expect(messages(ui, 'stop')).toHaveLength(2)
  })

  it('rejects foreign-connection stop packets and objects delivered after connection close', async () => {
    const ui = await mountMain('host')
    await prepareHost(ui)
    network.broker.hold = (packet) => (packet.frame.value as any)?.type === 'stop'
    ui.partner.peer.send({ type: 'stop', requestId: 1, epoch: ui.epoch() })
    await vi.advanceTimersByTimeAsync(0)
    const packet = network.broker.pending.shift()!
    for (const extra of [{ from: 'b'.repeat(32) }, { to: 'c'.repeat(32) }]) {
      const frame = { ...packet.frame, ...extra }
      network.broker.deliver({ ...packet, frame, payload: new TextEncoder().encode(JSON.stringify(frame)) })
      expect(ui.match.getSnapshot().paused).toBe(false)
    }
    ui.partner.peer.close()
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot().paused).toBe(true)
    const epoch = ui.epoch()
    network.broker.deliver(packet)
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.epoch()).toBe(epoch)
  })
})

describe('main turn synchronization through the MoQ peer broker', () => {
  async function startHost(round = 'round1') {
    const ui = await mountMain('host')
    await ui.step()
    ui.element('ready').onclick()
    ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot().phase).toBe('round1')
    if (round === 'round2') {
      ui.match.tick(899900)
      await ui.step()
      ui.element('ready').onclick()
      ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.match.getSnapshot().phase).toBe('round2')
    }
    ui.render()
    let sequence = 0
    const input = async (turnTotal: number, extra: Record<string, unknown> = {}) => {
      ui.partner.peer.send({
        type: 'input',
        forward: 0,
        strafe: 0,
        turnTotal,
        sequence: ++sequence,
        epoch: ui.epoch(),
        round: ui.match.getSnapshot().phase,
        challenge: ui.partner.received.mock.calls
          .map(([value]) => value as any)
          .filter((value) => value.type === 'health')
          .at(-1).challenge,
        ...extra
      })
      await vi.advanceTimersByTimeAsync(0)
    }
    return { ...ui, input }
  }

  it('expires input at 501ms even when the animation timestamp is behind', async () => {
    const ui = await startHost()
    const baseline = performance.now()
    await ui.input(0, { forward: 1 })
    await vi.advanceTimersByTimeAsync(450)
    ui.renderAt(baseline + 449)
    await ui.health(0.1, { epoch: ui.epoch() })
    await vi.advanceTimersByTimeAsync(50)
    ui.renderAt(baseline + 499)
    const boundary = ui.rendered.mock.lastCall![0].haunter
    await vi.advanceTimersByTimeAsync(1)
    ui.renderAt(baseline + 499.5)
    expect(ui.rendered.mock.lastCall![0].haunter).toEqual(boundary)
    expect(ui.match.getSnapshot().paused).toBe(false)
  })

  it.each(['round1', 'round2'])(
    'expires movement when only input is held while health continues in %s',
    async (round) => {
      const ui = await startHost(round)
      const role = round === 'round1' ? 'haunter' : 'human'
      const initial = ui.rendered.mock.lastCall![0][role]
      await ui.input(0, { forward: 1 })
      await ui.step()
      expect(ui.rendered.mock.lastCall![0][role]).not.toEqual(initial)
      network.broker.hold = (packet) => packet.frame.category === 'input'
      await ui.input(0, { forward: 0 })
      await ui.step(500)
      const stopped = ui.rendered.mock.lastCall![0][role]
      await ui.step(200)
      expect(network.broker.pending).toHaveLength(1)
      expect(ui.match.getSnapshot().paused).toBe(false)
      expect(ui.match.getSnapshot().elapsedMs).toBeGreaterThan(500)
      expect(ui.rendered.mock.lastCall![0][role]).toEqual(stopped)
    }
  )

  it('rejects a previously unseen delayed input despite continuing fresh health', async () => {
    const ui = await startHost()
    const initial = ui.rendered.mock.lastCall![0].haunter
    network.broker.hold = (packet) => packet.frame.category === 'input'
    await ui.input(0.4, { forward: 1 })
    await ui.step(600)
    network.broker.deliver(network.broker.pending[0])
    await ui.step()
    expect(ui.match.getSnapshot().paused).toBe(false)
    expect(ui.rendered.mock.lastCall![0].haunter).toEqual(initial)
    network.broker.hold = undefined
    await ui.input(0.6, { strafe: 1 })
    await ui.step()
    expect(ui.rendered.mock.lastCall![0].haunter).not.toEqual(initial)
    expect(ui.rendered.mock.lastCall![0].haunter.yaw - initial.yaw).toBeCloseTo(0.6)
  })

  it('expires at 501ms from the challenge, not receipt, and preserves cumulative turns on recovery', async () => {
    const ui = await startHost()
    const initial = ui.rendered.mock.lastCall![0].haunter
    network.broker.hold = (packet) => packet.frame.category === 'input'
    await ui.input(0.2, { forward: 1 })
    await ui.step(400)
    network.broker.deliver(network.broker.pending[0])
    await ui.step()
    const boundary = ui.rendered.mock.lastCall![0].haunter
    expect(boundary).not.toEqual(initial)
    expect(boundary.yaw - initial.yaw).toBeCloseTo(0.2)
    await vi.advanceTimersByTimeAsync(1)
    ui.render()
    expect(ui.rendered.mock.lastCall![0].haunter).toEqual(boundary)
    network.broker.hold = undefined
    await ui.input(0.5, { strafe: 1 })
    await ui.step()
    expect(ui.rendered.mock.lastCall![0].haunter.yaw - initial.yaw).toBeCloseTo(0.5)
    expect(ui.match.getSnapshot().paused).toBe(false)
    expect(ui.match.getSnapshot().scores).toEqual({ host: 0, guest: 0 })
  })

  it('stops expired movement while preserving its turn for the next fresh input', async () => {
    const ui = await startHost()
    const initial = ui.rendered.mock.lastCall![0].haunter
    await ui.step(400)
    const challenge = ui.partner.received.mock.calls
      .map(([value]) => value as any)
      .filter((value) => value.type === 'health')
      .at(-1).challenge
    await ui.step(400)
    await ui.input(0.2, { forward: 1, challenge })
    await vi.advanceTimersByTimeAsync(101)
    ui.render()
    expect(ui.rendered.mock.lastCall![0].haunter).toEqual(initial)
    ui.render()
    expect(ui.rendered.mock.lastCall![0].haunter).toEqual(initial)
    expect(ui.match.getSnapshot().paused).toBe(false)
    await ui.input(0.5, { strafe: 1 })
    await ui.step()
    expect(ui.rendered.mock.lastCall![0].haunter.yaw - initial.yaw).toBeCloseTo(0.5)
  })

  it('rejects missing, invalid and unknown challenges without consuming the input sequence', async () => {
    const ui = await startHost()
    const initial = ui.rendered.mock.lastCall![0].haunter
    for (const challenge of [undefined, null, '1', 0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      await ui.input(0.4, { forward: 1, challenge, sequence: 1 })
      await ui.step()
      expect(ui.rendered.mock.lastCall![0].haunter).toEqual(initial)
    }
    await ui.input(0.2, { forward: 1, sequence: 1 })
    await ui.step()
    expect(ui.rendered.mock.lastCall![0].haunter).not.toEqual(initial)
    expect(ui.rendered.mock.lastCall![0].haunter.yaw - initial.yaw).toBeCloseTo(0.2)
  })

  it('replaces directions and leaves host movement and turning active after guest input expires', async () => {
    const ui = await startHost()
    await ui.input(0, { forward: 1 })
    await ui.step()
    const forward = ui.rendered.mock.lastCall![0].haunter
    await ui.input(0, { strafe: 1 })
    await ui.step()
    const strafe = ui.rendered.mock.lastCall![0].haunter
    expect(strafe.z).toBeCloseTo(forward.z)
    expect(strafe.x).not.toBeCloseTo(forward.x)
    await ui.input(0)
    await ui.step()
    expect(ui.rendered.mock.lastCall![0].haunter).toEqual(strafe)
    await ui.step(600)
    const host = ui.rendered.mock.lastCall![0].human
    ui.key('KeyW')
    ui.key('ArrowRight')
    await ui.step()
    expect(ui.rendered.mock.lastCall![0].haunter).toEqual(strafe)
    expect(ui.rendered.mock.lastCall![0].human.z).not.toBeCloseTo(host.z)
    expect(ui.rendered.mock.lastCall![0].human.yaw - host.yaw).toBeCloseTo(0.2)
  })

  it('echoes only the latest accepted host challenge in guest input', async () => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(2)
    await ui.health(0.1, { epoch: 2, challenge: 200 })
    await ui.step()
    await ui.health(0.1, { epoch: 2, challenge: 199 })
    await ui.step()
    const inputs = ui.partner.received.mock.calls
      .map(([value]) => value as any)
      .filter((value) => value.type === 'input')
    expect(inputs).toHaveLength(2)
    expect(inputs.map((value) => value.challenge)).toEqual([200, 200])
  })

  it('preserves multiple turn inputs before the host frame', async () => {
    const { input, rendered, render } = await startHost()
    const yaw = rendered.mock.lastCall![0].haunter.yaw
    await input(0.2)
    await input(0.5)
    render()
    expect(rendered.mock.lastCall![0].haunter.yaw - yaw).toBeCloseTo(0.5)
    render()
    expect(rendered.mock.lastCall![0].haunter.yaw - yaw).toBeCloseTo(0.5)
    await input(-0.4)
    render()
    expect(rendered.mock.lastCall![0].haunter.yaw - yaw).toBeCloseTo(-0.4)
  })

  it('keeps guest mouse and keyboard totals when a blocked MoQ write replaces queued inputs', async () => {
    const ui = await mountMain('guest')
    ui.match.start()
    await ui.state(2)
    const raw = network.broker.sessions.find((session) => session.namespace?.at(-1) === 'guest')!.raw
    const write = raw.sendSubgroupObject
    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const blocked = vi.spyOn(raw, 'sendSubgroupObject').mockImplementationOnce(async (...args) => {
      await barrier
      await write(...args)
    })
    ui.partner.received.mockClear()
    ui.mouse(100)
    await ui.step()
    ui.key('ArrowRight')
    ui.key('KeyW')
    ui.key('KeyD')
    ui.mouse(150)
    await ui.step()
    expect(blocked).toHaveBeenCalledOnce()
    expect(ui.partner.received.mock.calls.filter(([value]) => (value as any).type === 'input')).toHaveLength(0)
    release()
    await vi.advanceTimersByTimeAsync(0)
    const inputs = () =>
      ui.partner.received.mock.calls.map(([value]) => value as any).filter((value) => value.type === 'input')
    expect(inputs()).toHaveLength(1)
    expect(inputs()[0]).toMatchObject({ turnTotal: 0.7, epoch: 2, round: 'round1', forward: 1, strafe: 1 })
    ui.key('ArrowRight', false)
    ui.key('KeyW', false)
    ui.key('KeyD', false)
    await ui.step()
    expect(inputs().at(-1)).toMatchObject({ turnTotal: 0.7, forward: 0, strafe: 0 })
    ui.mouse(5000)
    await ui.step()
    expect(inputs().at(-1).turnTotal).toBeCloseTo(1.7)
    expect(ui.match.getSnapshot().scores).toEqual({ host: 0, guest: 0 })
  })

  it('does not replay duplicate, reversed or foreign-generation inputs', async () => {
    const { input, rendered, render } = await startHost()
    const yaw = rendered.mock.lastCall![0].haunter.yaw
    network.broker.hold = (packet) => packet.frame.category === 'input'
    await input(0.2)
    await input(1.5)
    const [older, newer] = network.broker.pending
    for (const packet of [newer, older, newer]) network.broker.deliver(packet)
    render()
    expect(rendered.mock.lastCall![0].haunter.yaw - yaw).toBeCloseTo(1.5)
    for (const identity of [{ from: createRoomCode() }, { to: createRoomCode() }]) {
      const frame = {
        ...newer.frame,
        sequence: 1000,
        ...identity,
        value: { ...(newer.frame.value as object), sequence: 1000, turnTotal: 10 }
      }
      network.broker.deliver({ ...newer, frame, payload: new TextEncoder().encode(JSON.stringify(frame)) })
    }
    network.broker.hold = undefined
    await input(10, { sequence: 1 })
    await input(10, { sequence: 2 })
    render()
    expect(rendered.mock.lastCall![0].haunter.yaw - yaw).toBeCloseTo(1.5)
    await input(-0.4)
    render()
    expect(rendered.mock.lastCall![0].haunter.yaw - yaw).toBeCloseTo(-0.4)
  })

  it('discards pending and paused inputs across pause/resume epochs', async () => {
    const ui = await startHost()
    const yaw = ui.rendered.mock.lastCall![0].haunter.yaw
    const oldEpoch = ui.epoch()
    await ui.input(0.4)
    ui.mouse(200)
    await ui.health(0.1, { mic: false })
    expect(ui.match.getSnapshot().paused).toBe(true)
    await ui.step()
    await ui.input(100)
    ui.mouse(200)
    await ui.health()
    ui.element('ready').onclick()
    ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot().paused).toBe(false)
    ui.render()
    await ui.input(0.9, { epoch: oldEpoch })
    ui.render()
    expect(ui.rendered.mock.lastCall![0].haunter.yaw).toBeCloseTo(yaw)
    await ui.input(0.25)
    ui.render()
    expect(ui.rendered.mock.lastCall![0].haunter.yaw - yaw).toBeCloseTo(0.25)
  })

  it('does not carry delayed round-one turns into the guest survivor in round two', async () => {
    const ui = await startHost()
    network.broker.hold = (packet) => packet.frame.category === 'input'
    const oldEpoch = ui.epoch()
    await ui.input(0.6)
    const delayed = network.broker.pending[0]
    ui.match.tick(899900)
    await ui.step()
    expect(ui.match.getSnapshot().phase).toBe('intermission')
    network.broker.hold = undefined
    ui.element('ready').onclick()
    ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot().phase).toBe('round2')
    ui.render()
    const yaw = ui.rendered.mock.lastCall![0].human.yaw
    network.broker.deliver(delayed)
    await ui.input(10, { epoch: oldEpoch, round: 'round1' })
    await ui.input(10, { round: 'round1' })
    ui.render()
    expect(ui.rendered.mock.lastCall![0].human.yaw).toBeCloseTo(yaw)
    await ui.input(0.3)
    ui.render()
    expect(ui.rendered.mock.lastCall![0].human.yaw - yaw).toBeCloseTo(0.3)
  })

  it('rejects malformed totals without changing movement or consuming the next valid input', async () => {
    const ui = await startHost()
    const pose = ui.rendered.mock.lastCall![0].haunter
    for (const extra of [
      { turnTotal: null },
      { turnTotal: 1e20 },
      { turnTotal: 10000 },
      { sequence: 0 },
      { sequence: 1.5 },
      { forward: 2 },
      { strafe: -2 },
      { epoch: ui.epoch() + 1 }
    ])
      await ui.input(10, extra)
    ui.render()
    expect(ui.rendered.mock.lastCall![0].haunter).toEqual(pose)
    await ui.input(0.2, { forward: 1, strafe: 1 })
    await ui.step()
    expect(ui.rendered.mock.lastCall![0].haunter.yaw - pose.yaw).toBeCloseTo(0.2)
    expect(ui.rendered.mock.lastCall![0].haunter).not.toEqual({ ...pose, yaw: pose.yaw + 0.2 })
  })

  it('blocks guest input until a local interruption is acknowledged, then resets authoritative totals', async () => {
    const ui = await mountMain('guest')
    const inputs = () =>
      ui.partner.received.mock.calls.map(([value]) => value as any).filter((value) => value.type === 'input')
    ui.match.start()
    await ui.state(2)
    ui.mouse(100)
    await ui.step()
    expect(inputs().at(-1)).toMatchObject({ turnTotal: 0.2, epoch: 2, round: 'round1' })
    ui.track.muted = true
    await ui.element('microphone').onclick()
    ui.mouse(50)
    await ui.step()
    expect(inputs().at(-1)).toMatchObject({ turnTotal: 0.2, epoch: 2 })
    ui.track.muted = false
    ui.match.pause()
    await ui.state(3, { stoppedRequest: 1 })
    const pausedCount = inputs().length
    ui.mouse(1000)
    await ui.step()
    expect(inputs()).toHaveLength(pausedCount)
    ui.match.resume()
    await ui.state(4)
    ui.mouse(50)
    await ui.step()
    expect(inputs().at(-1)).toMatchObject({ turnTotal: 0.1, epoch: 4, round: 'round1' })
    ui.match.tick(900000)
    await ui.state(5)
    const intermissionCount = inputs().length
    ui.mouse(1000)
    await ui.step()
    expect(inputs()).toHaveLength(intermissionCount)
    ui.match.startSecondRound()
    await ui.state(6)
    await ui.health(0.1, { epoch: 6 })
    ui.mouse(100)
    await ui.step()
    expect(inputs().at(-1)).toMatchObject({ turnTotal: 0.2, epoch: 6, round: 'round2' })
  })
})

describe('main guest actions through the MoQ peer broker', () => {
  async function startHost(round: 'round1' | 'round2') {
    const ui = await mountMain('host')
    const ready = async () => {
      await ui.health()
      ui.element('ready').onclick()
      ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
      await vi.advanceTimersByTimeAsync(0)
    }
    await ui.step()
    await ready()
    if (round === 'round2') {
      ui.match.tick(900000)
      await ui.step()
      expect(ui.match.getSnapshot().phase).toBe('intermission')
      await ready()
    }
    expect(ui.match.getSnapshot()).toMatchObject({ phase: round, paused: false })
    const state = () =>
      ui.partner.received.mock.calls
        .map(([value]) => value as any)
        .filter((value) => value.type === 'state')
        .at(-1)!
    const send = async (value: Record<string, unknown>) => {
      expect(ui.partner.peer.send(value)).toBe(true)
      await vi.advanceTimersByTimeAsync(0)
    }
    return { ...ui, ready, state, send }
  }

  it.each(['effect', 'ritual'] as const)(
    'rejects a %s sent before interruption when it arrives after both players resume the same night',
    async (type) => {
      const round = type === 'effect' ? 'round1' : 'round2'
      const ui = await startHost(round)
      const before = ui.state()
      const oldEpoch = ui.epoch()
      const request =
        type === 'effect'
          ? { type, round, epoch: oldEpoch, kind: 'rattle', requestId: 1 }
          : { type, round, epoch: oldEpoch, step: 'letter' }
      network.broker.hold = (packet) => packet.frame.kind === 'event'
      await ui.send(request)
      const delayed = network.broker.pending[0]!
      expect(delayed.frame.value).toEqual(request)
      await ui.health(0.1, { mic: false })
      expect(ui.match.getSnapshot().paused).toBe(true)
      await ui.step()
      await ui.ready()
      expect(ui.match.getSnapshot()).toMatchObject({ phase: round, paused: false })
      expect(ui.epoch()).toBeGreaterThan(oldEpoch)
      network.broker.hold = undefined
      network.broker.deliver(delayed)
      network.broker.deliver(delayed)
      await vi.advanceTimersByTimeAsync(0)
      await ui.step()
      expect(ui.state().effect).toBeNull()
      expect(ui.state().spirit).toEqual(before.spirit)
      expect(ui.state().ritual).toEqual(before.ritual)
      await ui.send({ ...request, epoch: ui.epoch() })
      if (type === 'effect') {
        expect(ui.state().effect).toMatchObject({ id: 1, kind: 'rattle', round })
        expect(ui.state().spirit.energy).toBeLessThan(81)
      } else expect(ui.state().ritual).toEqual({ round, completed: 1 })
    }
  )

  it.each(['effect', 'ritual'] as const)(
    'rejects invalid epochs and rounds without blocking a fresh %s',
    async (type) => {
      const round = type === 'effect' ? 'round1' : 'round2'
      const ui = await startHost(round)
      const before = ui.state()
      const request = { type, round, kind: 'rattle', requestId: Number.MAX_SAFE_INTEGER, step: 'letter' }
      for (const epoch of [undefined, null, -1, ui.epoch() - 1, ui.epoch() + 1, String(ui.epoch()), 0.5])
        await ui.send({ ...request, epoch })
      await ui.send({ ...request, epoch: ui.epoch(), round: round === 'round1' ? 'round2' : 'round1' })
      await ui.step()
      expect(ui.state().effect).toBeNull()
      expect(ui.state().spirit).toEqual(before.spirit)
      expect(ui.state().ritual).toEqual(before.ritual)
      await ui.send({ ...request, epoch: ui.epoch(), requestId: 1 })
      if (type === 'effect') expect(ui.state().effect).toMatchObject({ id: 1, kind: 'rattle', round })
      else expect(ui.state().ritual).toEqual({ round, completed: 1 })
    }
  )

  it.each(['effect', 'ritual'] as const)('rejects a paused %s without consuming the next request', async (type) => {
    const round = type === 'effect' ? 'round1' : 'round2'
    const ui = await startHost(round)
    await ui.health(0.1, { mic: false })
    await ui.step()
    expect(ui.match.getSnapshot().paused).toBe(true)
    const request = {
      type,
      round,
      epoch: ui.epoch(),
      kind: 'rattle',
      requestId: Number.MAX_SAFE_INTEGER,
      step: 'letter'
    }
    await ui.send(request)
    expect(ui.state().effect).toBeNull()
    expect(ui.state().ritual.completed).toBe(0)
    await ui.ready()
    expect(ui.match.getSnapshot()).toMatchObject({ phase: round, paused: false })
    await ui.send({ ...request, epoch: ui.epoch(), requestId: 1 })
    if (type === 'effect') expect(ui.state().effect?.id).toBe(1)
    else expect(ui.state().ritual.completed).toBe(1)
  })

  it.each(['effect', 'ritual'] as const)(
    'retries and acknowledges %s without repeating it or blocking later requests',
    async (type) => {
      const round = type === 'effect' ? 'round1' : 'round2'
      const ui = await startHost(round)
      const request = { type, round, epoch: ui.epoch(), kind: 'rattle', requestId: 1, step: 'letter' }
      let dropped = false
      let allowAck = false
      const groups = new Set<bigint>()
      network.broker.drop = (packet) => {
        if (packet.frame.kind === 'event') {
          groups.add(packet.group)
          if (!dropped) {
            dropped = true
            return true
          }
        }
        return packet.frame.kind === 'ack' && !allowAck
      }
      await ui.send(request)
      await ui.send(request)
      await ui.step(2100)
      expect(groups.size).toBeGreaterThanOrEqual(2)
      if (type === 'effect') expect(ui.state().effect?.id).toBe(1)
      else expect(ui.state().ritual.completed).toBe(1)
      allowAck = true
      await ui.step(300)
      if (type === 'effect') {
        ui.match.tick(8100)
        await ui.step()
        const spirit = ui.state().spirit
        await ui.send(request)
        expect(ui.state().effect?.id).toBe(1)
        expect(ui.state().spirit).toEqual(spirit)
        await ui.send({ ...request, requestId: 2 })
        expect(ui.state().effect?.id).toBe(2)
      } else {
        await ui.send({ ...request, step: 'bell' })
        expect(ui.state().ritual.completed).toBe(1)
      }
      expect(ui.partner.status).not.toHaveBeenCalledWith('error', expect.any(String))
    }
  )

  it.each(['effect', 'ritual'] as const)(
    'rejects a previous connection %s while accepting the new connection',
    async (type) => {
      const round = type === 'effect' ? 'round1' : 'round2'
      const previous = await startHost(round)
      const request = { type, round, epoch: previous.epoch(), kind: 'rattle', requestId: 1, step: 'letter' }
      network.broker.hold = (packet) => packet.frame.kind === 'event'
      await previous.send(request)
      const oldPacket = network.broker.pending[0]!
      window.dispatchEvent(new Event('pagehide'))
      previous.partner.peer.close()
      await vi.advanceTimersByTimeAsync(0)
      const ui = await startHost(round)
      await ui.send({ ...request, epoch: ui.epoch() })
      const currentPacket = network.broker.pending.at(-1)!
      expect(currentPacket.alias).not.toBe(oldPacket.alias)
      expect(currentPacket.frame.from).not.toBe(oldPacket.frame.from)
      network.broker.deliver(oldPacket)
      network.broker.deliver({ ...currentPacket, payload: oldPacket.payload, frame: oldPacket.frame })
      await vi.advanceTimersByTimeAsync(0)
      await ui.step()
      expect(ui.state().effect).toBeNull()
      expect(ui.state().ritual.completed).toBe(0)
      network.broker.hold = undefined
      network.broker.deliver(currentPacket)
      await vi.advanceTimersByTimeAsync(0)
      if (type === 'effect') expect(ui.state().effect?.id).toBe(1)
      else expect(ui.state().ritual.completed).toBe(1)
    }
  )

  it.each(['effect', 'ritual'] as const)(
    'stamps guest %s key presses with the current authoritative epoch',
    async (type) => {
      const ui = await mountMain('guest')
      ui.match.start()
      if (type === 'ritual') {
        ui.match.tick(900000)
        ui.match.startSecondRound()
      }
      await ui.state(2)
      const code = type === 'effect' ? 'Digit3' : 'KeyE'
      const press = async () => {
        ui.partner.received.mockClear()
        ui.key(code)
        for (let repeat = 0; repeat < 3; repeat++)
          window.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: true }))
        ui.key(code, false)
        await vi.advanceTimersByTimeAsync(0)
        return ui.partner.received.mock.calls.map(([value]) => value as any).filter((value) => value.type === type)
      }
      const round = type === 'effect' ? 'round1' : 'round2'
      expect(await press()).toEqual([
        type === 'effect'
          ? { type, round, epoch: 2, kind: 'rattle', requestId: 1 }
          : { type, round, epoch: 2, step: 'letter' }
      ])
      ui.match.pause()
      await ui.state(3)
      ui.match.resume()
      await ui.state(4)
      expect(await press()).toEqual([
        type === 'effect'
          ? { type, round, epoch: 4, kind: 'rattle', requestId: 2 }
          : { type, round, epoch: 4, step: 'letter' }
      ])
    }
  )
})

describe('main health expiry before animation through the offline peer broker', () => {
  type Main = Awaited<ReturnType<typeof mountMain>>
  const messages = (ui: Main, type: string) =>
    ui.partner.received.mock.calls.map(([value]) => value as any).filter((value) => value.type === type)
  const latestState = (ui: Main) => messages(ui, 'state').at(-1)!
  const ready = async (ui: Main) => {
    ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
  }
  const start = async (role: 'host' | 'guest', round: 'round1' | 'round2') => {
    const ui = await mountMain(role)
    if (role === 'host') {
      await ui.step()
      ui.element('ready').onclick()
      await ready(ui)
      if (round === 'round2') {
        ui.match.tick(900000)
        await ui.step()
        ui.element('ready').onclick()
        await ready(ui)
      }
    } else {
      ui.match.start()
      if (round === 'round2') {
        ui.match.tick(900000)
        ui.match.startSecondRound()
      }
      await ui.state(2)
    }
    await ui.step(100, 0.1, { epoch: role === 'host' ? ui.epoch() : 2, phase: round, playing: true })
    if (role === 'guest') ui.partner.received.mockClear()
    ui.previewSound.stop.mockClear()
    return ui
  }

  for (const role of ['host', 'guest'] as const) {
    for (const round of ['round1', 'round2'] as const) {
      it.each([500, 501])(role + ' ' + round + ' checks local actions at %ims without rAF', async (age) => {
        const ui = await start(role, round)
        const human = (role === 'host') === (round === 'round1')
        const before = ui.match.getSnapshot()
        const epoch = role === 'host' ? ui.epoch() : 2
        const readyCount = messages(ui, 'ready').length
        await vi.advanceTimersByTimeAsync(age)
        ui.key(human ? 'KeyE' : 'Digit3')
        await vi.advanceTimersByTimeAsync(0)
        if (age === 500) {
          if (role === 'host') {
            expect(ui.match.getSnapshot().paused).toBe(false)
            if (human) expect(latestState(ui).ritual.completed).toBe(1)
            else expect(latestState(ui).effect.kind).toBe('rattle')
          } else expect(messages(ui, human ? 'ritual' : 'effect')).toHaveLength(1)
          expect(ui.previewSound.stop).not.toHaveBeenCalled()
          return
        }
        expect(ui.previewSound.stop).toHaveBeenCalled()
        const stopCount = ui.previewSound.stop.mock.calls.length
        if (role === 'host') {
          expect(ui.match.getSnapshot()).toEqual({ ...before, paused: true })
          expect(ui.epoch()).toBe(epoch + 1)
          expect(latestState(ui).ritual.completed).toBe(0)
          expect(latestState(ui).effect).toBeNull()
        } else {
          expect(messages(ui, 'stop')).toEqual([{ type: 'stop', requestId: 1, epoch }])
          expect(messages(ui, 'ritual')).toEqual([])
          expect(messages(ui, 'effect')).toEqual([])
        }
        ui.key('KeyE')
        ui.key('Digit3')
        ui.element('ready').onclick()
        await vi.advanceTimersByTimeAsync(0)
        expect(ui.previewSound.stop).toHaveBeenCalledTimes(stopCount)
        expect(messages(ui, 'ready')).toHaveLength(readyCount)
        if (role === 'host') expect(ui.epoch()).toBe(epoch + 1)
        else expect(messages(ui, 'stop')).toHaveLength(1)
      })

      it(role + ' ' + round + ' observes expiry before newly arriving health and freezes scoring', async () => {
        const ui = await start(role, round)
        if (role === 'host') {
          ui.microphoneSignal.amplitude = 0.8
          await ui.step(400, 0.1, { epoch: ui.epoch(), phase: round, playing: true, rms: 1, voiced: true })
          expect(ui.match.getSnapshot().scores[round === 'round1' ? 'host' : 'guest']).toBeLessThan(0)
        }
        const before = ui.match.getSnapshot()
        const epoch = role === 'host' ? ui.epoch() : 2
        await vi.advanceTimersByTimeAsync(100)
        ui.render()
        await vi.advanceTimersByTimeAsync(0)
        const progressed = ui.match.getSnapshot()
        const spirit = role === 'host' ? latestState(ui).spirit : undefined
        if (role === 'guest') ui.partner.received.mockClear()
        await vi.advanceTimersByTimeAsync(401)
        await ui.health(0.1, { epoch, phase: round, playing: true, rms: 1, voiced: true })
        expect(ui.previewSound.stop).toHaveBeenCalled()
        if (role === 'host') {
          expect(ui.match.getSnapshot()).toEqual({ ...progressed, paused: true })
          expect(ui.epoch()).toBe(epoch + 1)
        } else expect(messages(ui, 'stop')).toEqual([{ type: 'stop', requestId: 1, epoch }])
        await ui.step(1000, 0.1, {
          epoch: role === 'host' ? ui.epoch() : epoch,
          phase: round,
          playing: true,
          rms: 1,
          voiced: true
        })
        if (role === 'host') {
          expect(ui.match.getSnapshot()).toEqual({ ...progressed, paused: true })
          expect(latestState(ui).spirit).toEqual(spirit)
          expect(ui.epoch()).toBe(epoch + 1)
          ui.element('ready').onclick()
          expect(ui.match.getSnapshot().paused).toBe(true)
          await ready(ui)
          expect(ui.match.getSnapshot().paused).toBe(false)
        } else {
          expect(ui.match.getSnapshot()).toEqual(before)
          expect([...new Set(messages(ui, 'stop').map((value) => value.requestId))]).toEqual([1])
          expect(messages(ui, 'stop').length).toBeGreaterThan(1)
          expect(messages(ui, 'input')).toEqual([])
          ui.match.pause()
          await ui.state(epoch + 1, { stoppedRequest: 1 })
          await ui.health(0.1, { epoch: epoch + 1 })
          expect(messages(ui, 'ready')).toEqual([])
          ui.element('ready').onclick()
          await vi.advanceTimersByTimeAsync(0)
          expect(messages(ui, 'ready')).toHaveLength(1)
          ui.track.onmute()
          await vi.advanceTimersByTimeAsync(0)
          expect(messages(ui, 'stop').at(-1)).toEqual({ type: 'stop', requestId: 2, epoch: epoch + 1 })
          await ui.state(epoch + 2, { stoppedRequest: 1 })
          expect(ui.element('ready').disabled).toBe(true)
        }
      })
    }
  }

  for (const preparation of ['lobby', 'round1 resume', 'intermission', 'round2 resume'] as const) {
    it.each([500, 501])('guest ' + preparation + ' rejects expired ready at %ims without rAF', async (age) => {
      const ui =
        preparation === 'lobby'
          ? await mountMain('guest')
          : await start('guest', preparation === 'round2 resume' ? 'round2' : 'round1')
      let epoch = preparation === 'lobby' ? 0 : 2
      if (preparation !== 'lobby') {
        if (preparation === 'intermission') ui.match.tick(900000)
        else ui.match.pause()
        await ui.state(++epoch)
        await ui.health(0.1, { epoch })
      }
      ui.partner.peer.send({ type: 'ready', value: true, epoch, threshold: 0.1 })
      await vi.advanceTimersByTimeAsync(0)
      ui.partner.received.mockClear()
      await vi.advanceTimersByTimeAsync(age)
      ui.element('ready').onclick()
      await vi.advanceTimersByTimeAsync(0)
      if (age === 500) {
        expect(messages(ui, 'ready')).toEqual([{ type: 'ready', value: true, epoch, threshold: 0.1 }])
        expect(messages(ui, 'stop')).toEqual([])
      } else {
        expect(messages(ui, 'ready')).toEqual([])
        expect(messages(ui, 'stop')).toEqual([{ type: 'stop', requestId: 1, epoch }])
        await ui.health(0.1, { epoch })
        ui.element('ready').onclick()
        await vi.advanceTimersByTimeAsync(0)
        expect(messages(ui, 'ready')).toEqual([])
        await ui.state(epoch + 1, { stoppedRequest: 1 })
        await ui.health(0.1, { epoch: epoch + 1 })
        expect(messages(ui, 'ready')).toEqual([])
        ui.element('ready').onclick()
        await vi.advanceTimersByTimeAsync(0)
        expect(messages(ui, 'ready')).toEqual([{ type: 'ready', value: true, epoch: epoch + 1, threshold: 0.1 }])
      }
    })
  }

  it.each([500, 501])('host checks incoming ready at %ims before new health', async (age) => {
    const ui = await mountMain('host')
    await ui.step()
    ui.element('ready').onclick()
    const epoch = ui.epoch()
    await vi.advanceTimersByTimeAsync(100)
    ui.render()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(age - 100)
    await ready(ui)
    expect(ui.match.getSnapshot().phase).toBe(age === 500 ? 'round1' : 'lobby')
    expect(ui.epoch()).toBe(epoch + 1)
    if (age === 501) {
      await ui.health()
      expect(ui.match.getSnapshot().phase).toBe('lobby')
      ui.element('ready').onclick()
      expect(ui.match.getSnapshot().phase).toBe('lobby')
      await ready(ui)
      expect(ui.match.getSnapshot().phase).toBe('round1')
    }
  })

  it('accepts stop under expired health without an additional expiry epoch', async () => {
    const ui = await start('host', 'round1')
    const epoch = ui.epoch()
    const before = ui.match.getSnapshot()
    await vi.advanceTimersByTimeAsync(501)
    ui.partner.peer.send({ type: 'stop', requestId: 1, epoch })
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot()).toEqual({ ...before, paused: true })
    expect(latestState(ui).stoppedRequest).toBe(1)
    expect(ui.epoch()).toBe(epoch + 1)
    await ui.step(1000)
    expect(ui.epoch()).toBe(epoch + 1)
  })

  it('consumes authoritative progress, bell and effect under expired health without replay on recovery', async () => {
    const { RITUAL_STEPS } = await import('../src/ritual')
    const bellCompleted = RITUAL_STEPS.findIndex((step) => step.id === 'bell') + 1
    const ui = await start('guest', 'round2')
    ui.match.tick(RITUAL_STEPS[bellCompleted - 1].availableMs)
    await ui.state(2, { ritual: { round: 'round2', completed: bellCompleted - 1 } })
    const effect = { id: 1, round: 'round2', kind: 'blackout', elapsedMs: ui.match.getSnapshot().elapsedMs }
    ui.previewSound.trigger.mockClear()
    await vi.advanceTimersByTimeAsync(501)
    ui.match.addPenalty('guest', 0.5)
    const human = { x: 2, z: 3, yaw: 1 }
    await ui.state(2, { human, effect, ritual: { round: 'round2', completed: bellCompleted } })
    expect(ui.element('scores').textContent).toContain('参加者 -0.50')
    expect(ui.ritualBell).not.toHaveBeenCalled()
    expect(ui.previewSound.trigger).not.toHaveBeenCalled()
    expect(messages(ui, 'stop')).toEqual([{ type: 'stop', requestId: 1, epoch: 2 }])
    ui.render()
    expect(ui.rendered.mock.lastCall![0]).toMatchObject({ human, effect: null })
    await vi.advanceTimersByTimeAsync(0)
    ui.match.pause()
    await ui.state(3, { stoppedRequest: 1, human, ritual: { round: 'round2', completed: bellCompleted } })
    await ui.health(0.1, { epoch: 3 })
    ui.element('ready').onclick()
    await vi.advanceTimersByTimeAsync(0)
    expect(messages(ui, 'ready')).toHaveLength(1)
    ui.match.resume()
    await ui.state(4, { stoppedRequest: 1, human, effect, ritual: { round: 'round2', completed: bellCompleted } })
    await ui.health(0.1, { epoch: 4 })
    await ui.state(4, { human, effect, ritual: { round: 'round2', completed: bellCompleted } })
    ui.render()
    expect(ui.rendered.mock.lastCall![0].effect).toBeNull()
    expect(ui.ritualBell).not.toHaveBeenCalled()
    expect(ui.previewSound.trigger).not.toHaveBeenCalled()
  })

  it('accepts finished scores under expired health and releases media', async () => {
    const ui = await start('guest', 'round2')
    await vi.advanceTimersByTimeAsync(501)
    ui.match.addPenalty('guest', 0.75)
    ui.match.tick(900000)
    await ui.state(3)
    expect(ui.element('phase').textContent).toBe('夜が明けました')
    expect(ui.element('scores').textContent).toContain('参加者 -0.75')
    expect(ui.previewSound.dispose).toHaveBeenCalledTimes(1)
    expect(ui.element('ready').disabled).toBe(true)
  })

  it('invalidates in-flight lobby ready even when recovered health arrives before any readiness', async () => {
    const ui = await mountMain('guest')
    await vi.advanceTimersByTimeAsync(501)
    await ui.health()
    expect(messages(ui, 'stop')).toEqual([{ type: 'stop', requestId: 1, epoch: 0 }])
    ui.partner.peer.send({ type: 'ready', value: true, epoch: 0, threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
    ui.element('ready').onclick()
    await vi.advanceTimersByTimeAsync(0)
    expect(messages(ui, 'ready')).toEqual([])
    await ui.state(1, { stoppedRequest: 1 })
    await ui.health(0.1, { epoch: 1 })
    expect(messages(ui, 'ready')).toEqual([])
    ui.element('ready').onclick()
    await vi.advanceTimersByTimeAsync(0)
    expect(messages(ui, 'ready')).toEqual([{ type: 'ready', value: true, epoch: 1, threshold: 0.1 }])
  })

  it('requests a stop when a playing state overtakes health recovery after lobby expiry', async () => {
    const ui = await mountMain('guest')
    await vi.advanceTimersByTimeAsync(501)
    ui.match.start()
    const effect = { id: 1, round: 'round1', kind: 'blackout', elapsedMs: 0 }
    await ui.state(2, { effect })
    expect(ui.element('phase').textContent).toBe('第一夜')
    expect(ui.previewSound.trigger).not.toHaveBeenCalled()
    expect(messages(ui, 'stop')).toEqual([{ type: 'stop', requestId: 1, epoch: 0 }])
  })

  for (const [type, round] of [
    ['input', 'round1'],
    ['input', 'round2'],
    ['effect', 'round1'],
    ['ritual', 'round2']
  ] as const) {
    it.each([500, 501])('host ' + round + ' checks received ' + type + ' at %ims without rAF', async (age) => {
      const ui = await start('host', round)
      const epoch = ui.epoch()
      const before = ui.match.getSnapshot()
      await vi.advanceTimersByTimeAsync(100)
      ui.render()
      await vi.advanceTimersByTimeAsync(0)
      const challenge = messages(ui, 'health').at(-1).challenge
      await vi.advanceTimersByTimeAsync(age - 100)
      ui.partner.peer.send({
        type,
        epoch,
        round,
        challenge,
        sequence: 1,
        forward: 1,
        strafe: 0,
        turnTotal: 1,
        kind: 'rattle',
        requestId: 1,
        step: 'letter'
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(ui.match.getSnapshot().paused).toBe(age > 500)
      if (age > 500) {
        expect(ui.epoch()).toBe(epoch + 1)
        expect(latestState(ui).ritual.completed).toBe(0)
        expect(latestState(ui).effect).toBeNull()
        expect(ui.match.getSnapshot().scores).toEqual(before.scores)
      } else if (type === 'ritual') expect(latestState(ui).ritual.completed).toBe(1)
      else if (type === 'effect') expect(latestState(ui).effect.kind).toBe('rattle')
      else {
        const moving = round === 'round1' ? 'haunter' : 'human'
        const pose = latestState(ui)[moving]
        ui.render()
        expect(ui.rendered.mock.lastCall![0][moving].yaw).toBeCloseTo(pose.yaw + 1)
      }
    })
  }
})

describe('main readiness through the MoQ peer broker', () => {
  for (const preparation of ['lobby', 'round1 resume', 'intermission', 'round2 resume'] as const) {
    it.each([500, 501])(
      preparation + ': rechecks accepted health at local ready after %ims without a frame',
      async (age) => {
        const ui = await mountMain('host')
        const ready = async () => {
          expect(ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })).toBe(true)
          await vi.advanceTimersByTimeAsync(0)
        }
        const start = async () => {
          await ui.step()
          await ready()
          ui.element('ready').onclick()
          await vi.advanceTimersByTimeAsync(0)
        }
        if (preparation !== 'lobby') {
          await start()
          expect(ui.match.getSnapshot().phase).toBe('round1')
          if (preparation !== 'round1 resume') {
            ui.match.tick(900000)
            await ui.step()
            expect(ui.match.getSnapshot().phase).toBe('intermission')
            if (preparation === 'round2 resume') {
              await start()
              expect(ui.match.getSnapshot().phase).toBe('round2')
            }
          }
          if (preparation.endsWith('resume')) {
            await ui.health(0.1, { mic: false })
            expect(ui.match.getSnapshot().paused).toBe(true)
          }
        }
        await ui.step()
        const before = ui.match.getSnapshot()
        const epoch = ui.epoch()
        await ready()
        expect(ui.element('ready').disabled).toBe(false)
        const readyCount = ui.partner.received.mock.calls.filter(([value]) => (value as any).type === 'ready').length
        await vi.advanceTimersByTimeAsync(age)
        ui.element('ready').onclick()
        await vi.advanceTimersByTimeAsync(0)
        if (age > 500) {
          expect(ui.match.getSnapshot()).toEqual(before)
          expect(ui.element('ready').disabled).toBe(true)
          const sentReady = ui.partner.received.mock.calls
            .map(([value]) => value as any)
            .filter((value) => value.type === 'ready')
          expect(sentReady).toHaveLength(readyCount)
          expect(ui.epoch()).toBe(epoch + 1)
          await ui.health(0.1, { epoch: epoch - 1 })
          expect(ui.match.getSnapshot()).toEqual(before)
          await ui.health(0.1, { challenge: 0 })
          expect(ui.match.getSnapshot()).toEqual(before)
          ui.render()
          await vi.advanceTimersByTimeAsync(0)
          await ui.health()
          expect(ui.match.getSnapshot()).toEqual(before)
          await ready()
          expect(ui.match.getSnapshot()).toEqual(before)
          ui.element('ready').onclick()
          await vi.advanceTimersByTimeAsync(0)
        }
        expect(ui.match.getSnapshot()).toEqual({
          ...before,
          phase: preparation === 'lobby' ? 'round1' : preparation === 'intermission' ? 'round2' : before.phase,
          survivor: preparation === 'intermission' ? 'guest' : before.survivor,
          elapsedMs: preparation === 'intermission' ? 0 : before.elapsedMs,
          paused: false
        })
        expect(ui.epoch()).toBe(epoch + (age > 500 ? 2 : 1))
      }
    )
  }

  it('does not start with a newer health epoch after accepting current-epoch ready', async () => {
    const ui = await mountMain('host')
    await ui.step()
    const epoch = ui.epoch()
    ui.partner.peer.send({ type: 'ready', value: true, epoch, threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
    await ui.health(0.1, { epoch: epoch + 1 })
    ui.element('ready').onclick()
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot().phase).toBe('lobby')
    await ui.health(0.1, { epoch: epoch - 1 })
    expect(ui.match.getSnapshot().phase).toBe('lobby')
    await ui.health()
    expect(ui.match.getSnapshot().phase).toBe('round1')
  })

  it.each(['health first', 'ready first'] as const)('requires renewed ready after mic:false (%s)', async (order) => {
    const ui = await mountMain('host')
    await ui.step()
    const ready = async () => {
      ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
      await vi.advanceTimersByTimeAsync(0)
    }
    if (order === 'ready first') await ready()
    await ui.health(0.1, { mic: false })
    await vi.advanceTimersByTimeAsync(100)
    ui.render()
    await vi.advanceTimersByTimeAsync(0)
    if (order === 'health first') await ready()
    ui.element('ready').onclick()
    expect(ui.match.getSnapshot().phase).toBe('lobby')
    await ui.health()
    expect(ui.match.getSnapshot().phase).toBe('lobby')
    ui.element('ready').onclick()
    expect(ui.match.getSnapshot().phase).toBe('lobby')
    await ready()
    expect(ui.match.getSnapshot().phase).toBe('round1')
  })

  it('does not start or lock an old health threshold while a matching ready is pending', async () => {
    const { element, partner, health, step, epoch, match } = await mountMain('host')
    await step()
    element('ready').onclick()
    for (const ready of [
      { epoch: epoch(), threshold: undefined },
      { epoch: epoch(), threshold: 0.01 },
      { epoch: epoch(), threshold: 0.51 },
      { epoch: epoch() - 1, threshold: 0.1 },
      { epoch: epoch(), threshold: 0.2 },
      { epoch: epoch(), threshold: 0.2 }
    ]) {
      partner.peer.send({ type: 'ready', value: true, ...ready })
      await vi.advanceTimersByTimeAsync(0)
      expect(match.getSnapshot().phase).toBe('lobby')
    }
    await health(0.2, { epoch: epoch() - 1 })
    await health(0.1)
    expect(match.getSnapshot().phase).toBe('lobby')
    await health(0.2)
    expect(match.getSnapshot().phase).toBe('round1')
  })

  it('requires renewed ready after health expiry and ignores old epochs and threshold changes', async () => {
    const { element, partner, health, step, epoch, match, render } = await mountMain('host')
    await step()
    element('ready').onclick()
    await vi.advanceTimersByTimeAsync(0)
    const ready = partner.received.mock.calls.map(([value]) => value as any).find((value) => value.type === 'ready')
    expect(ready).toEqual({ type: 'ready', value: true, epoch: epoch(), threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(501)
    partner.peer.send({ type: 'ready', value: true, epoch: epoch(), threshold: 0.2 })
    await vi.advanceTimersByTimeAsync(0)
    await health(0.2)
    expect(match.getSnapshot().phase).toBe('lobby')
    render()
    await vi.advanceTimersByTimeAsync(0)
    const retries = partner.received.mock.calls.map(([value]) => value as any).filter((value) => value.type === 'ready')
    expect(retries).toHaveLength(1)
    expect(retries.at(-1)).toEqual(ready)
    await health(0.2, { epoch: epoch() - 1 })
    expect(match.getSnapshot().phase).toBe('lobby')
    await health(0.2)
    element('ready').onclick()
    partner.peer.send({ type: 'ready', value: true, epoch: epoch(), threshold: 0.2 })
    await vi.advanceTimersByTimeAsync(0)
    expect(match.getSnapshot().phase).toBe('round1')
    const startedEpoch = epoch()
    await health(0.1, { epoch: startedEpoch - 1, phase: 'round1', playing: true })
    expect(match.getSnapshot().paused).toBe(false)
    await health(0.1, { challenge: 0, phase: 'round1', playing: true })
    expect(match.getSnapshot().paused).toBe(false)
    await step(100, 0.2, { phase: 'round1', playing: true })
    await health(0.3, { phase: 'round1', playing: true })
    expect(match.getSnapshot().paused).toBe(true)
    await step(100, 0.2, { phase: 'round1', playing: true })
    partner.peer.send({ type: 'ready', value: true, epoch: startedEpoch - 1, threshold: 0.1 })
    await vi.advanceTimersByTimeAsync(0)
    element('ready').onclick()
    await vi.advanceTimersByTimeAsync(0)
    expect(match.getSnapshot().paused).toBe(true)
    partner.peer.send({ type: 'ready', value: true, epoch: epoch(), threshold: 0.3 })
    await vi.advanceTimersByTimeAsync(0)
    expect(match.getSnapshot().paused).toBe(true)
    partner.peer.send({ type: 'ready', value: true, epoch: epoch(), threshold: 0.2 })
    await vi.advanceTimersByTimeAsync(0)
    expect(match.getSnapshot().paused).toBe(false)
    expect(element('threshold').disabled).toBe(true)
  })

  it('keeps thresholds locked across role exchange and requires a new preparation epoch', async () => {
    const { element, partner, health, step, epoch, match } = await mountMain('host')
    await step()
    const firstEpoch = epoch()
    await health(0.2)
    partner.peer.send({ type: 'ready', value: true, epoch: firstEpoch, threshold: 0.2 })
    await vi.advanceTimersByTimeAsync(0)
    element('ready').onclick()
    await vi.advanceTimersByTimeAsync(0)
    expect(match.getSnapshot().phase).toBe('round1')
    match.tick(899900)
    await step(200, 0.2)
    expect(match.getSnapshot().phase).toBe('intermission')
    partner.peer.send({ type: 'ready', value: true, epoch: firstEpoch, threshold: 0.2 })
    await vi.advanceTimersByTimeAsync(0)
    element('ready').onclick()
    await vi.advanceTimersByTimeAsync(0)
    expect(match.getSnapshot().phase).toBe('intermission')
    partner.peer.send({ type: 'ready', value: true, epoch: epoch(), threshold: 0.2 })
    await vi.advanceTimersByTimeAsync(0)
    expect(match.getSnapshot().phase).toBe('round2')
    expect(element('threshold').disabled).toBe(true)
  })

  for (const role of ['host', 'guest'] as const) {
    it(role + ': waits for matching health when ready overtakes a threshold change across groups', async () => {
      const { element, partner, health, step, epoch, render } = await mountMain(role)
      await step(1500)
      network.broker.hold = (packet) => packet.frame.category === 'health'
      await health(0.2)
      const delayed = network.broker.pending.at(-1)!
      await vi.advanceTimersByTimeAsync(300)
      const delivered: (typeof delayed)[] = []
      const deliver = network.broker.deliver
      const delivery = vi.spyOn(network.broker, 'deliver').mockImplementation((packet) => {
        delivered.push(packet)
        deliver(packet)
      })
      partner.peer.send({ type: 'ready', value: true, epoch: epoch(), threshold: 0.2 })
      await vi.advanceTimersByTimeAsync(0)
      const ready = delivered.find((packet) => packet.frame.category === 'ready')!
      expect(ready.group).not.toBe(delayed.group)
      delivery.mockRestore()
      deliver(delayed)
      network.broker.hold = undefined
      await health(0.2)
      render()
      expect(element('ready').disabled).toBe(false)
      element('ready').onclick()
      await vi.advanceTimersByTimeAsync(0)
      if (role === 'host') {
        expect(partner.received.mock.calls.some(([value]) => (value as any).snapshot?.phase === 'round1')).toBe(true)
      } else {
        expect(element('ready').textContent).toBe('相手を待っています')
        expect(element('ready').disabled).toBe(true)
      }
    })
  }
})

describe('main callback failure integration', () => {
  it.each(['host', 'guest'] as const)(
    'pauses/disables actual main on partial health callback as $role',
    async (role) => {
      const ui = await mountMain(role)
      ui.match.start()
      if (role === 'guest') await ui.state(2)
      const session = network.broker.sessions.find((session) => session.namespace?.at(-1) === role)!
      const error = new Error('injected ready DOM failure')
      const ready = ui.element('ready')
      let disabled = ready.disabled
      let failures = 0
      Object.defineProperty(ready, 'disabled', {
        configurable: true,
        get: () => disabled,
        set: (value) => {
          if (failures++ === 0) throw error
          disabled = value
        }
      })
      network.broker.hold = (packet) => packet.receiver === session && packet.frame.category === 'health'
      await ui.health(0.1, { epoch: role === 'host' ? ui.epoch() : 2, phase: 'round1', playing: true })
      const packet = network.broker.pending.shift()!
      expect(packet).toBeDefined()
      let caught: unknown
      try {
        network.broker.deliver(packet)
      } catch (failure) {
        caught = failure
      }
      expect(caught).toBe(error)
      await vi.advanceTimersByTimeAsync(0)
      expect(session.connected).toBe(false)
      expect(session.objects.size).toBe(0)
      expect(ready.disabled).toBe(true)
      expect(ui.element('connection').textContent).toContain('MoQ接続が切れています')
      if (role === 'host') expect(ui.match.getSnapshot().paused).toBe(true)
      expect(ui.partner.peer.send({ type: 'effect' })).toBe(false)
    }
  )

  it('closes after partially applying a stop in actual host main', async () => {
    const ui = await mountMain('host')
    ui.match.start()
    const session = network.broker.sessions.find((session) => session.namespace?.at(-1) === 'host')!
    const error = new Error('injected stop notice failure')
    const notice = ui.element('notice')
    let text = notice.textContent
    let failures = 0
    Object.defineProperty(notice, 'textContent', {
      configurable: true,
      get: () => text,
      set: (value) => {
        if (failures++ === 0) throw error
        text = value
      }
    })
    network.broker.hold = (packet) => packet.frame.category === 'stop'
    ui.partner.peer.send({ type: 'stop', requestId: 1, epoch: ui.epoch() })
    await vi.advanceTimersByTimeAsync(0)
    const packet = network.broker.pending.shift()!
    let caught: unknown
    try {
      network.broker.deliver(packet)
    } catch (failure) {
      caught = failure
    }
    expect(caught).toBe(error)
    await vi.advanceTimersByTimeAsync(0)
    expect(ui.match.getSnapshot().paused).toBe(true)
    expect(session.connected).toBe(false)
    expect(ui.element('ready').disabled).toBe(true)
    expect(ui.element('connection').textContent).toContain('MoQ接続が切れています')
  })

  it('does not ACK partial finished-state UI failure in actual guest main', async () => {
    const ui = await mountMain('guest')
    ui.match.start()
    ui.match.tick(900000)
    ui.match.startSecondRound()
    ui.match.tick(900000)
    const session = network.broker.sessions.find((session) => session.namespace?.at(-1) === 'guest')!
    const error = new Error('injected finished phase failure')
    const phase = ui.element('phase')
    let text = phase.textContent
    let failures = 0
    Object.defineProperty(phase, 'textContent', {
      configurable: true,
      get: () => text,
      set: (value) => {
        if (failures++ === 0) throw error
        text = value
      }
    })
    const acks: unknown[] = []
    network.broker.drop = (packet) => {
      if (packet.frame.kind === 'ack') acks.push(packet)
      return false
    }
    network.broker.hold = (packet) =>
      packet.frame.kind === 'event' && (packet.frame.value as { type?: string })?.type === 'state'
    await ui.state(2)
    const packet = network.broker.pending.shift()!
    expect(packet.frame.kind).toBe('event')
    let caught: unknown
    try {
      network.broker.deliver(packet)
    } catch (failure) {
      caught = failure
    }
    expect(caught).toBe(error)
    await vi.advanceTimersByTimeAsync(0)
    network.broker.deliver(packet)
    await vi.advanceTimersByTimeAsync(0)
    expect(acks).toHaveLength(0)
    expect(session.connected).toBe(false)
    expect(ui.partner.peer.send({ type: 'effect' })).toBe(false)
    expect(ui.element('ready').disabled).toBe(true)
    expect(ui.drawing.disposed).toBe(false)
    expect(ui.element('connection').textContent).toBe('MoQで相手と接続しました')
  })
})

describe.each(['host', 'guest'] as const)('MoQ HorrorPeer callback isolation as %s', (role) => {
  const values = [
    { type: 'ritual', step: 1 },
    { type: 'state', snapshot: { phase: 'finished' } },
    { type: 'health', mic: true }
  ]

  it.each(
    values.flatMap((value) =>
      [false, true].flatMap((notificationThrows) =>
        [false, true].map((disconnectRejects) => ({ value, notificationThrows, disconnectRejects }))
      )
    )
  )(
    'fails closed after $value.type throws, status=$notificationThrows disconnect=$disconnectRejects',
    async ({ value, notificationThrows, disconnectRejects }) => {
      vi.useFakeTimers()
      const players = await pair()
      await vi.advanceTimersByTimeAsync(250 - (performance.now() % 250))
      const receiver = players[role]
      const sender = players[role === 'host' ? 'guest' : 'host']
      const session = network.broker.sessions[role === 'host' ? 0 : 1]
      const handlerError = new Error('Partial message failure')
      const notificationError = new Error('Notification failure')
      const trace: string[] = []
      const partial: unknown[] = []
      const notificationState: unknown[] = []
      const disconnect = session.disconnect.bind(session)
      const disconnectSpy = vi.spyOn(session, 'disconnect').mockImplementation(async () => {
        trace.push('disconnect')
        if (disconnectRejects) throw new Error('Disconnect failure')
        await disconnect()
      })
      receiver.status.mockClear()
      receiver.status.mockImplementation((status, message) => {
        trace.push('status')
        notificationState.push({
          status,
          message,
          objects: session.objects.size,
          disconnectCalls: disconnectSpy.mock.calls.length,
          canSend: receiver.peer.send({ type: 'health' }),
          closeResult: receiver.peer.close()
        })
        if (notificationThrows) throw notificationError
      })
      receiver.received.mockImplementation((message) => {
        trace.push('message')
        partial.push(message)
        throw handlerError
      })
      network.broker.hold = (packet) => packet.frame.kind !== 'hello'
      expect(sender.peer.send(value)).toBe(true)
      await vi.advanceTimersByTimeAsync(0)
      const packet = network.broker.pending.shift()!
      expect(packet.frame.kind).toBe(value.type === 'health' ? 'latest' : 'event')
      const lateHandler = session.objects.get(packet.alias)!
      let caught: unknown
      try {
        network.broker.deliver(packet)
      } catch (error) {
        caught = error
      }
      expect(caught).toBe(handlerError)
      network.broker.deliver(packet)
      lateHandler(0n, { objectPayload: packet.payload })
      await vi.advanceTimersByTimeAsync(0)
      expect(partial).toEqual([value])
      expect(receiver.received).toHaveBeenCalledExactlyOnceWith(value)
      expect(trace).toEqual(['message', 'status', 'disconnect'])
      expect(notificationState).toEqual([
        {
          status: 'error',
          message: 'MoQ message handler failed',
          objects: 0,
          disconnectCalls: 0,
          canSend: false,
          closeResult: undefined
        }
      ])
      expect(receiver.status).toHaveBeenCalledExactlyOnceWith('error', 'MoQ message handler failed')
      expect(network.broker.pending.filter((queued) => queued.frame.kind === 'ack')).toHaveLength(0)
      expect(receiver.peer.send({ type: 'effect' })).toBe(false)
      receiver.peer.close()
      expect(disconnectSpy).toHaveBeenCalledTimes(1)
      if (disconnectRejects) {
        await vi.advanceTimersByTimeAsync(4999)
        expect(sender.status).toHaveBeenLastCalledWith('connected', expect.any(String))
        await vi.advanceTimersByTimeAsync(1)
        if (value.type === 'health') expect(sender.status).toHaveBeenLastCalledWith('connected', expect.any(String))
        else expect(sender.status).toHaveBeenLastCalledWith('error', 'MoQ event acknowledgement timed out')
      } else expect(sender.status).toHaveBeenLastCalledWith('disconnected', expect.any(String))
      expect(disconnectSpy).toHaveBeenCalledTimes(1)
    }
  )

  it.each(values.flatMap((value) => [false, true].map((throws) => ({ value, throws }))))(
    'does not ACK or deliver reentrant packets inside $value.type, throws=$throws',
    async ({ value, throws }) => {
      vi.useFakeTimers()
      const players = await pair()
      await vi.advanceTimersByTimeAsync(250)
      const receiver = players[role]
      const sender = players[role === 'host' ? 'guest' : 'host']
      const session = network.broker.sessions[role === 'host' ? 0 : 1]
      network.broker.hold = (packet) => packet.frame.kind !== 'hello'
      sender.peer.send(value)
      await vi.advanceTimersByTimeAsync(0)
      const packet = network.broker.pending.shift()!
      const nextValue = { type: 'ritual', step: 2 }
      const latestValue = { type: 'input', forward: 1 }
      const nextFrame = { ...packet.frame, kind: 'event', sequence: value.type === 'health' ? 1 : 2, value: nextValue }
      const latestFrame = { ...packet.frame, kind: 'latest', category: 'input', sequence: 1, value: latestValue }
      const nextPacket = { ...packet, frame: nextFrame, payload: new TextEncoder().encode(JSON.stringify(nextFrame)) }
      const latestPacket = {
        ...packet,
        frame: latestFrame,
        payload: new TextEncoder().encode(JSON.stringify(latestFrame))
      }
      const failure = new Error('Reentrant message failure')
      const object = vi.spyOn(session.raw, 'sendSubgroupObject')
      receiver.received.mockImplementationOnce(() => {
        network.broker.deliver(packet)
        network.broker.deliver(nextPacket)
        network.broker.deliver(latestPacket)
        expect(receiver.received).toHaveBeenCalledTimes(1)
        expect(object).not.toHaveBeenCalled()
        if (throws) throw failure
      })
      let caught: unknown
      try {
        network.broker.deliver(packet)
      } catch (error) {
        caught = error
      }
      expect(caught).toBe(throws ? failure : undefined)
      await vi.advanceTimersByTimeAsync(0)
      network.broker.deliver(packet)
      await vi.advanceTimersByTimeAsync(0)
      expect(receiver.received).toHaveBeenCalledExactlyOnceWith(value)
      const acks = network.broker.pending.filter((queued) => queued.frame.kind === 'ack')
      expect(acks).toHaveLength(throws || value.type === 'health' ? 0 : 2)
      network.broker.deliver(nextPacket)
      network.broker.deliver(latestPacket)
      await vi.advanceTimersByTimeAsync(0)
      if (throws) {
        expect(receiver.received).toHaveBeenCalledTimes(1)
        expect(receiver.peer.send({ type: 'health' })).toBe(false)
      } else {
        expect(receiver.received.mock.calls).toEqual([[value], [nextValue], [latestValue]])
        expect(receiver.status).toHaveBeenLastCalledWith('connected', expect.any(String))
      }
    }
  )
})

describe.each(['host', 'guest'] as const)('MoQ HorrorPeer termination as %s', (role) => {
  it.each([
    { throws: false, rejects: false },
    { throws: true, rejects: false },
    { throws: false, rejects: true },
    { throws: true, rejects: true }
  ])('closes once when status throws=$throws and disconnect rejects=$rejects', async ({ throws, rejects }) => {
    vi.useFakeTimers()
    const players = await pair()
    await vi.advanceTimersByTimeAsync(0)
    const player = players[role]
    const session = network.broker.sessions[role === 'host' ? 0 : 1]
    const notificationError = new Error('Status notification failed')
    const disconnect = session.disconnect.bind(session)
    const disconnectSpy = vi.spyOn(session, 'disconnect').mockImplementation(async () => {
      await disconnect()
      if (rejects) throw new Error('Disconnect rejected')
    })
    player.status.mockClear()
    player.status.mockImplementation((status) => {
      expect(status).toBe('closed')
      expect(session.connected).toBe(true)
      expect(disconnectSpy).not.toHaveBeenCalled()
      expect(session.objects.size).toBe(0)
      expect(player.peer.send({ type: 'health' })).toBe(false)
      expect(player.peer.close()).toBeUndefined()
      if (throws) throw notificationError
    })

    if (throws) expect(() => player.peer.close()).toThrow(notificationError)
    else expect(player.peer.close()).toBeUndefined()
    expect(session.connected).toBe(false)
    expect(session.disconnectCount).toBe(1)
    expect(disconnectSpy).toHaveBeenCalledTimes(1)
    expect(player.peer.close()).toBeUndefined()
    await vi.advanceTimersByTimeAsync(20000)
    expect(session.disconnectCount).toBe(1)
    expect(disconnectSpy).toHaveBeenCalledTimes(1)
    expect(player.status).toHaveBeenCalledExactlyOnceWith('closed', 'MoQ connection closed')
  })

  it.each([false, true])('does not disconnect an unstarted peer when status throws=%s', async (throws) => {
    vi.useFakeTimers()
    const player = createPeer(role)
    const session = network.broker.sessions[0]
    const notificationError = new Error('Status notification failed')
    player.status.mockImplementation(() => {
      if (throws) throw notificationError
    })

    if (throws) expect(() => player.peer.close()).toThrow(notificationError)
    else expect(player.peer.close()).toBeUndefined()
    expect(player.peer.close()).toBeUndefined()
    await expect(player.peer.connect()).rejects.toThrow('Connection already started')
    await vi.advanceTimersByTimeAsync(20000)
    expect(session.connected).toBe(false)
    expect(session.disconnectCount).toBe(0)
    expect(player.status).toHaveBeenCalledExactlyOnceWith('closed', 'MoQ connection closed')
  })

  it.each(['departure', 'relay closed', 'queue overflow'] as const)(
    'disconnects once despite a throwing status on %s',
    async (ending) => {
      vi.useFakeTimers()
      const players = await pair()
      await vi.advanceTimersByTimeAsync(0)
      const player = players[role]
      const session = network.broker.sessions[role === 'host' ? 0 : 1]
      const departing = network.broker.sessions[role === 'host' ? 1 : 0]
      const notificationError = new Error('Status notification failed')
      player.status.mockClear()
      player.status.mockImplementation(() => {
        throw notificationError
      })

      if (ending === 'departure') await expect(departing.disconnect()).rejects.toBe(notificationError)
      else if (ending === 'relay closed') expect(() => session.onClosed?.()).toThrow(notificationError)
      else {
        network.broker.drop = (packet) => packet.frame.kind === 'ack'
        for (let count = 0; count < 64; count++) expect(player.peer.send({ type: 'ritual', count })).toBe(true)
        expect(() => player.peer.send({ type: 'ritual', count: 64 })).toThrow(notificationError)
      }
      expect(session.connected).toBe(false)
      expect(session.disconnectCount).toBe(1)
      expect(session.objects.size).toBe(0)
      expect(player.peer.send({ type: 'health' })).toBe(false)
      expect(player.peer.close()).toBeUndefined()
      await vi.advanceTimersByTimeAsync(20000)
      expect(session.disconnectCount).toBe(1)
      expect(player.status).toHaveBeenCalledExactlyOnceWith(
        ending === 'queue overflow' ? 'error' : 'disconnected',
        ending === 'departure'
          ? 'The other player left'
          : ending === 'relay closed'
            ? 'MoQ relay disconnected'
            : 'MoQ event queue overflow'
      )
    }
  )
})

describe('main inactive effect requests through the offline peer broker', () => {
  type Main = Awaited<ReturnType<typeof mountMain>>
  const effects = (ui: Main) =>
    ui.partner.received.mock.calls.map(([value]) => value as any).filter((value) => value.type === 'effect')
  const start = async (ui: Main, role: 'host' | 'guest', round: 'round1' | 'round2') => {
    if (role === 'host') {
      const ready = async () => {
        ui.element('ready').onclick()
        ui.partner.peer.send({ type: 'ready', value: true, epoch: ui.epoch(), threshold: 0.1 })
        await vi.advanceTimersByTimeAsync(0)
      }
      await ui.step()
      await ready()
      if (round === 'round2') {
        ui.match.tick(900000)
        await ui.step()
        await ready()
      }
      await ui.step()
    } else {
      ui.match.start()
      if (round === 'round2') {
        ui.match.tick(900000)
        ui.match.startSecondRound()
      }
      await ui.state(2)
      await ui.health(0.1, { epoch: 2, phase: round, playing: true })
    }
    expect(ui.match.getSnapshot()).toMatchObject({ phase: round, paused: false })
  }

  for (const role of ['host', 'guest'] as const) {
    for (const phase of ['lobby', 'paused-round1', 'intermission', 'paused-round2', 'finished'] as const) {
      it.each(['Digit1', 'Digit2', 'Digit3'])(role + ' ignores %s in ' + phase, async (code) => {
        const ui = await mountMain(role)
        if (phase !== 'lobby') {
          const round = phase === 'paused-round2' || phase === 'finished' ? 'round2' : 'round1'
          await start(ui, role, round)
          if (phase.startsWith('paused')) ui.match.pause()
          else ui.match.tick(900000)
          if (role === 'host') await ui.step()
          else {
            await ui.state(3)
            await ui.health(0.1, { epoch: 3 })
          }
          expect(ui.match.getSnapshot()).toMatchObject(
            phase.startsWith('paused') ? { phase: round, paused: true } : { phase }
          )
        }
        ui.partner.received.mockClear()
        ui.previewSound.trigger.mockClear()
        const frames: Record<string, unknown>[] = []
        network.broker.drop = (packet) => {
          frames.push(packet.frame)
          return false
        }
        ui.key(code)
        await vi.advanceTimersByTimeAsync(0)
        expect(effects(ui)).toEqual([])
        expect(frames.filter((frame) => frame.kind === 'event' && (frame.value as any)?.type === 'effect')).toEqual([])
        expect(ui.previewSound.trigger).not.toHaveBeenCalled()
        if (role === 'guest' && phase === 'paused-round1') {
          ui.match.resume()
          await ui.state(4)
          await ui.health(0.1, { epoch: 4, phase: 'round1', playing: true })
          ui.key(code)
          await vi.advanceTimersByTimeAsync(0)
          expect(effects(ui)).toEqual([
            {
              type: 'effect',
              kind: code === 'Digit1' ? 'apparition' : code === 'Digit2' ? 'blackout' : 'rattle',
              round: 'round1',
              requestId: 1,
              epoch: 4
            }
          ])
        }
      })
    }

    for (const round of ['round1', 'round2'] as const) {
      it.each([
        ['Digit1', 'apparition'],
        ['Digit2', 'blackout'],
        ['Digit3', 'rattle']
      ])(role + ' keeps %s available only to the haunter in ' + round, async (code, kind) => {
        const ui = await mountMain(role)
        await start(ui, role, round)
        const haunter = ui.match.getSnapshot().survivor !== role
        if (role === 'host' && haunter && code === 'Digit1') {
          for (const [direction, duration] of [
            ['KeyW', 1700],
            ['KeyD', 3300],
            ['KeyW', 1000]
          ] as const) {
            ui.key(direction)
            await ui.step(duration)
            ui.key(direction, false)
          }
        }
        ui.partner.received.mockClear()
        ui.previewSound.trigger.mockClear()
        ui.key(code)
        await vi.advanceTimersByTimeAsync(0)
        expect(ui.match.getSnapshot()).toMatchObject({ phase: round, paused: false })
        if (role === 'guest') {
          expect(effects(ui)).toEqual(haunter ? [{ type: 'effect', kind, round, requestId: 1, epoch: 2 }] : [])
        } else {
          expect(effects(ui)).toEqual([])
          if (haunter) {
            expect(ui.previewSound.trigger).toHaveBeenCalledExactlyOnceWith(kind)
            expect(ui.partner.received.mock.calls.map(([value]) => value as any)).toContainEqual(
              expect.objectContaining({ type: 'state', effect: expect.objectContaining({ id: 1, kind, round }) })
            )
          } else expect(ui.previewSound.trigger).not.toHaveBeenCalled()
        }
      })
    }
  }

  it.each(['Digit1', 'Digit2', 'Digit3'])(
    'does not queue 65 lobby %s requests with every ACK lost or consume the first request ID',
    async (code) => {
      const ui = await mountMain('guest')
      const frames: Record<string, unknown>[] = []
      network.broker.drop = (packet) => {
        frames.push(packet.frame)
        return packet.frame.kind === 'ack'
      }
      ui.partner.received.mockClear()
      for (let index = 0; index < 65; index++) {
        ui.key(code)
        await vi.advanceTimersByTimeAsync(0)
      }
      expect(effects(ui)).toEqual([])
      expect(frames.filter((frame) => frame.kind === 'event' && (frame.value as any)?.type === 'effect')).toEqual([])
      expect(ui.element('connection').textContent).toBe('MoQで相手と接続しました')
      expect(network.broker.sessions.every((session) => session.connected)).toBe(true)
      await start(ui, 'guest', 'round1')
      ui.partner.received.mockClear()
      ui.key(code)
      await vi.advanceTimersByTimeAsync(0)
      expect(effects(ui)).toEqual([
        {
          type: 'effect',
          kind: code === 'Digit1' ? 'apparition' : code === 'Digit2' ? 'blackout' : 'rattle',
          round: 'round1',
          requestId: 1,
          epoch: 2
        }
      ])
    }
  )
})

describe('main final results through the offline peer broker', () => {
  it.each([0, 5999])('keeps the first result and acknowledges later events after %ims', async (delay) => {
    const ui = await mountMain('guest')
    ui.match.start()
    ui.match.addPenalty('host', 1)
    ui.match.tick(900000)
    ui.match.startSecondRound()
    ui.match.addPenalty('guest', 2)
    ui.match.tick(900000)
    await ui.state(2)

    expect(ui.element('phase').textContent).toBe('夜が明けました')
    expect(ui.element('scores').textContent).toBe('主催 -1.00 / 参加者 -2.00')
    expect(ui.element('role').textContent).toContain('主催の勝ち')
    const notice = ui.element('notice').textContent
    await vi.advanceTimersByTimeAsync(delay)
    await ui.health(0.1, { epoch: 2 })
    expect(ui.element('notice').textContent).toBe(notice)

    const frames: Record<string, unknown>[] = []
    network.broker.drop = (packet) => {
      frames.push(packet.frame)
      return false
    }
    const snapshot = ui.match.getSnapshot()
    await ui.state(2, { snapshot: { ...snapshot, scores: { host: -3, guest: -2 } } })
    const event = frames.find((frame) => frame.kind === 'event' && (frame.value as { type?: string })?.type === 'state')
    expect(event).toBeDefined()
    expect(frames.some((frame) => frame.kind === 'ack' && frame.sequence === event?.sequence)).toBe(true)
    expect(ui.element('phase').textContent).toBe('夜が明けました')
    expect(ui.element('scores').textContent).toBe('主催 -1.00 / 参加者 -2.00')
    expect(ui.element('role').textContent).toContain('主催の勝ち')
    expect(ui.element('notice').textContent).toBe(notice)
    expect(ui.element('ready').disabled).toBe(true)
    expect(ui.previewSound.dispose).toHaveBeenCalledTimes(1)
  })

  it('keeps the result and notice unchanged when the finished connection closes', async () => {
    const ui = await mountMain('guest')
    ui.match.start()
    ui.match.tick(900000)
    ui.match.startSecondRound()
    ui.match.tick(900000)
    await ui.state(2)

    expect(ui.element('phase').textContent).toBe('夜が明けました')
    const notice = ui.element('notice').textContent
    const result = ui.element('role').textContent
    await vi.advanceTimersByTimeAsync(6000)
    expect(ui.element('notice').textContent).toBe(notice)
    expect(ui.element('role').textContent).toBe(result)
    expect(ui.element('ready').disabled).toBe(true)
    expect(ui.previewSound.dispose).toHaveBeenCalledTimes(1)
  })
})

describe('MoQ HorrorPeer', () => {
  it('filters older and duplicate stop frames independently of other latest categories', async () => {
    vi.useFakeTimers()
    const { host, guest } = await pair()
    network.broker.hold = (packet) => packet.frame.category === 'stop'
    guest.peer.send({ type: 'stop', requestId: 1, epoch: 2 })
    await vi.advanceTimersByTimeAsync(0)
    guest.peer.send({ type: 'stop', requestId: 1, epoch: 2 })
    await vi.advanceTimersByTimeAsync(0)
    const [older, newer] = network.broker.pending.splice(0)
    expect(older.frame.kind).toBe('latest')
    expect(newer.frame.sequence).toBe(2)
    guest.peer.send({ type: 'health', mic: true })
    await vi.advanceTimersByTimeAsync(0)
    for (const packet of [newer, older, newer]) network.broker.deliver(packet)
    expect(host.received.mock.calls.map(([value]) => value)).toEqual([
      { type: 'health', mic: true },
      { type: 'stop', requestId: 1, epoch: 2 }
    ])
    network.broker.hold = undefined
    guest.peer.send({ type: 'stop', requestId: 2, epoch: 3 })
    await vi.advanceTimersByTimeAsync(0)
    expect(host.received).toHaveBeenLastCalledWith({ type: 'stop', requestId: 2, epoch: 3 })
  })

  it.each(['header', 'payload', 'group end'] as const)(
    'prioritizes and coalesces an unsent stop during a pending %s without reordering ordinary events',
    async (stage) => {
      vi.useFakeTimers()
      const { host, guest } = await pair()
      await vi.advanceTimersByTimeAsync(0)
      const raw = network.broker.sessions[0].raw
      let release!: () => void
      const barrier = new Promise<void>((resolve) => {
        release = resolve
      })
      if (stage !== 'payload') vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 2001)
      if (stage === 'header') vi.spyOn(raw, 'sendSubgroupHeader').mockImplementationOnce(() => barrier)
      else {
        const original = raw.sendSubgroupObject.bind(raw)
        vi.spyOn(raw, 'sendSubgroupObject').mockImplementationOnce(async (...args) => {
          await barrier
          await original(...args)
        })
      }
      host.peer.send({ type: 'health', value: 1 })
      await vi.advanceTimersByTimeAsync(0)
      host.peer.send({ type: 'health', value: 2 })
      host.peer.send({ type: 'input', value: 1 })
      host.peer.send({ type: 'ritual', step: 'letter' })
      host.peer.send({ type: 'effect', kind: 'rattle' })
      host.peer.send({ type: 'stop', requestId: 1, epoch: 2 })
      host.peer.send({ type: 'stop', requestId: 1, epoch: 2 })
      host.peer.send({ type: 'health', value: 3 })
      release()
      await vi.advanceTimersByTimeAsync(0)
      expect(guest.received.mock.calls.map(([value]) => value)).toEqual([
        ...(stage === 'payload' ? [{ type: 'health', value: 1 }] : []),
        { type: 'stop', requestId: 1, epoch: 2 },
        { type: 'health', value: 3 },
        { type: 'input', value: 1 },
        { type: 'ritual', step: 'letter' },
        { type: 'effect', kind: 'rattle' }
      ])
    }
  )

  it('delivers stop independently while retaining the preceding event ACK timeout', async () => {
    vi.useFakeTimers()
    const { host, guest } = await pair()
    await vi.advanceTimersByTimeAsync(250 - (performance.now() % 250))
    network.broker.drop = (packet) => packet.frame.kind === 'ack'
    guest.peer.send({ type: 'effect', kind: 'rattle' })
    guest.peer.send({ type: 'ritual', step: 'letter' })
    guest.peer.send({ type: 'stop', requestId: 1, epoch: 2 })
    await vi.advanceTimersByTimeAsync(0)
    expect(host.received.mock.calls.map(([value]) => value)).toEqual([
      { type: 'effect', kind: 'rattle' },
      { type: 'stop', requestId: 1, epoch: 2 }
    ])
    await vi.advanceTimersByTimeAsync(4999)
    expect(guest.status).not.toHaveBeenCalledWith('error', expect.any(String))
    await vi.advanceTimersByTimeAsync(1)
    expect(guest.status).toHaveBeenCalledWith('error', 'MoQ event acknowledgement timed out')
    expect(host.received).toHaveBeenCalledTimes(2)
  })

  it.each(['header', 'payload'] as const)('fails closed when the SDK rejects a stop %s', async (stage) => {
    vi.useFakeTimers()
    const { host, guest } = await pair()
    await vi.advanceTimersByTimeAsync(0)
    const raw = network.broker.sessions[1].raw
    if (stage === 'header') {
      vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 2001)
      vi.spyOn(raw, 'sendSubgroupHeader').mockRejectedValueOnce(new Error('closed stream'))
    } else vi.spyOn(raw, 'sendSubgroupObject').mockRejectedValueOnce(new Error('closed stream'))
    guest.peer.send({ type: 'stop', requestId: 1, epoch: 2 })
    await vi.advanceTimersByTimeAsync(0)
    expect(guest.status).toHaveBeenCalledWith('error', 'MoQ send failed')
    expect(host.received).not.toHaveBeenCalled()
    expect(guest.peer.send({ type: 'stop', requestId: 1, epoch: 2 })).toBe(false)
  })

  it('keeps consecutive health, readiness and state updates in the newest relay group', async () => {
    vi.useFakeTimers()
    const { host, guest } = await pair()
    await vi.advanceTimersByTimeAsync(0)
    network.broker.hold = (packet) => packet.frame.kind === 'latest'
    const values = [
      { type: 'health', mic: true },
      { type: 'ready', value: true },
      { type: 'state', phase: 'lobby' }
    ]
    for (const value of values) {
      host.peer.send(value)
      await vi.advanceTimersByTimeAsync(0)
    }
    expect(network.broker.pending).toHaveLength(3)
    const newest = network.broker.pending.reduce((group, packet) => (packet.group > group ? packet.group : group), 0n)
    for (const packet of network.broker.pending) if (packet.group === newest) network.broker.deliver(packet)
    expect(guest.received.mock.calls.map(([value]) => value)).toEqual(values)
  })

  it('increments object IDs in one subgroup and ends it before opening the next group', async () => {
    vi.useFakeTimers()
    const { host, guest } = await pair()
    await vi.advanceTimersByTimeAsync(0)
    const raw = network.broker.sessions[0].raw
    const header = vi.spyOn(raw, 'sendSubgroupHeader')
    const object = vi.spyOn(raw, 'sendSubgroupObject')
    host.peer.send({ type: 'health', value: 1 })
    await vi.advanceTimersByTimeAsync(0)
    host.peer.send({ type: 'health', value: 2 })
    await vi.advanceTimersByTimeAsync(0)
    expect(header).not.toHaveBeenCalled()
    const first = object.mock.calls[0]
    expect(object.mock.calls[1]).toMatchObject({ 1: first[1], 3: first[3] + 1n, 4: undefined })
    vi.spyOn(performance, 'now').mockReturnValue(2001)
    host.peer.send({ type: 'health', value: 3 })
    await vi.advanceTimersByTimeAsync(0)
    expect(object).toHaveBeenCalledTimes(4)
    expect(object.mock.calls[2]).toMatchObject({ 1: first[1], 3: first[3] + 2n, 4: 3 })
    expect(header).toHaveBeenCalledExactlyOnceWith(first[0], first[1] + 1n, 0n, 0)
    expect(object.mock.calls[3]).toMatchObject({ 1: first[1] + 1n, 3: 0n, 4: undefined })
    expect(guest.received.mock.calls.map(([value]) => value.value)).toEqual([1, 2, 3])
  })

  it('coalesces latest values and preserves event order while ending a group asynchronously', async () => {
    vi.useFakeTimers()
    const { host, guest } = await pair()
    await vi.advanceTimersByTimeAsync(0)
    vi.spyOn(performance, 'now').mockReturnValue(2001)
    const raw = network.broker.sessions[0].raw
    let release!: () => void
    const object = vi.spyOn(raw, 'sendSubgroupObject').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const header = vi.spyOn(raw, 'sendSubgroupHeader')
    host.peer.send({ type: 'health', value: 1 })
    host.peer.send({ type: 'health', value: 2 })
    host.peer.send({ type: 'ritual', step: 'letter' })
    host.peer.send({ type: 'effect', kind: 'rattle' })
    expect(object).toHaveBeenCalledTimes(1)
    expect(object.mock.calls[0][4]).toBe(3)
    expect(header).not.toHaveBeenCalled()
    expect(guest.received).not.toHaveBeenCalled()
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(header).toHaveBeenCalledTimes(1)
    expect(guest.received.mock.calls.map(([value]) => value)).toEqual([
      { type: 'health', value: 2 },
      { type: 'ritual', step: 'letter' },
      { type: 'effect', kind: 'rattle' }
    ])
  })

  it.each(['group end', 'payload'] as const)(
    'does not continue sending after closing during a pending %s',
    async (stage) => {
      vi.useFakeTimers()
      const { host, guest } = await pair()
      await vi.advanceTimersByTimeAsync(0)
      if (stage === 'group end') vi.spyOn(performance, 'now').mockReturnValue(2001)
      const raw = network.broker.sessions[0].raw
      let release!: () => void
      const object = vi.spyOn(raw, 'sendSubgroupObject').mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve
          })
      )
      const header = vi.spyOn(raw, 'sendSubgroupHeader')
      host.peer.send({ type: 'health', value: 1 })
      host.peer.send({ type: 'health', value: 2 })
      expect(object).toHaveBeenCalledTimes(1)
      host.peer.close()
      release()
      await vi.advanceTimersByTimeAsync(0)
      expect(object).toHaveBeenCalledTimes(1)
      expect(header).not.toHaveBeenCalled()
      expect(guest.received).not.toHaveBeenCalled()
      expect(network.broker.sessions[0].connected).toBe(false)
      expect(host.status).not.toHaveBeenCalledWith('error', expect.any(String))
    }
  )

  it('fails closed when ending the previous group fails', async () => {
    vi.useFakeTimers()
    const { host, guest } = await pair()
    await vi.advanceTimersByTimeAsync(0)
    vi.spyOn(performance, 'now').mockReturnValue(2001)
    const raw = network.broker.sessions[0].raw
    const object = vi.spyOn(raw, 'sendSubgroupObject').mockRejectedValueOnce(new Error('closed stream'))
    const header = vi.spyOn(raw, 'sendSubgroupHeader')
    host.peer.send({ type: 'health', value: 1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(object).toHaveBeenCalledTimes(1)
    expect(header).not.toHaveBeenCalled()
    expect(guest.received).not.toHaveBeenCalled()
    expect(host.status).toHaveBeenCalledWith('error', 'MoQ send failed')
    expect(network.broker.sessions[0].connected).toBe(false)
  })

  it('retries lost events and acknowledgements across group rotation without duplicating actions', async () => {
    vi.useFakeTimers()
    const { host, guest } = await pair()
    await vi.advanceTimersByTimeAsync(0)
    let droppedEvent = false
    let allowAck = false
    const eventGroups = new Set<bigint>()
    network.broker.drop = (packet) => {
      if (packet.frame.kind === 'event' && packet.frame.sequence === 1) {
        eventGroups.add(packet.group)
        if (!droppedEvent) {
          droppedEvent = true
          return true
        }
      }
      return packet.frame.kind === 'ack' && !allowAck
    }
    host.peer.send({ type: 'ritual', step: 'letter' })
    host.peer.send({ type: 'effect', kind: 'rattle' })
    host.peer.send({ type: 'state', snapshot: { phase: 'finished' } })
    await vi.advanceTimersByTimeAsync(2100)
    expect(eventGroups.size).toBeGreaterThanOrEqual(2)
    expect(guest.received).toHaveBeenCalledExactlyOnceWith({ type: 'ritual', step: 'letter' })
    allowAck = true
    await vi.advanceTimersByTimeAsync(500)
    expect(guest.received.mock.calls.map(([value]) => value)).toEqual([
      { type: 'ritual', step: 'letter' },
      { type: 'effect', kind: 'rattle' },
      { type: 'state', snapshot: { phase: 'finished' } }
    ])
    expect(host.status).not.toHaveBeenCalledWith('error', expect.any(String))
  })

  it('generates random room codes and rejects unsafe relay URLs or invalid rooms', () => {
    expect(createRoomCode()).toMatch(/^[a-f0-9]{32}$/)
    expect(createRoomCode()).not.toBe(createRoomCode())
    const options = {
      role: 'host' as const,
      room,
      relayUrl: 'https://relay.invalid',
      onMessage: vi.fn(),
      onStatus: vi.fn()
    }
    for (const relayUrl of [
      'http://relay.invalid',
      'https://u:p@relay.invalid',
      'https://relay.invalid/?token=x',
      'bad'
    ])
      expect(() => new HorrorPeer({ ...options, relayUrl })).toThrow()
    expect(() => new HorrorPeer({ ...options, room: 'wrong' })).toThrow()
  })

  it('waits for a bidirectional handshake and keeps rooms separate', async () => {
    const host = createPeer('host')
    const guest = createPeer('guest', 'b'.repeat(32))
    await host.peer.connect()
    await guest.peer.connect()
    expect(host.status).not.toHaveBeenCalledWith('connected', expect.any(String))
    expect(guest.status).not.toHaveBeenCalledWith('connected', expect.any(String))
    expect(host.peer.send({ type: 'health' })).toBe(false)
  })

  it('exchanges JSON in both directions and rejects oversized or unserializable values', async () => {
    const { host, guest } = await pair()
    expect(host.peer.send({ type: 'health', value: 1 })).toBe(true)
    expect(guest.peer.send({ type: 'ritual', step: 'letter' })).toBe(true)
    await vi.waitFor(
      () => {
        expect(guest.received).toHaveBeenCalledWith({ type: 'health', value: 1 })
        expect(host.received).toHaveBeenCalledWith({ type: 'ritual', step: 'letter' })
      },
      { interval: 20, timeout: 3000 }
    )
    expect(host.peer.send({ data: 'x'.repeat(65536) })).toBe(false)
    const circular: { self?: unknown } = {}
    circular.self = circular
    expect(host.peer.send(circular)).toBe(false)
  })

  it('ignores malformed, oversized and foreign incoming frames', async () => {
    const { host, guest } = await pair()
    network.broker.hold = (packet) => packet.frame.kind === 'latest' && packet.frame.category === 'health'
    host.peer.send({ type: 'health', value: 1 })
    await vi.waitFor(() => expect(network.broker.pending).toHaveLength(1), { interval: 20, timeout: 3000 })
    const packet = network.broker.pending[0]
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
    expect(() => network.broker.deliver({ ...packet, payload: new TextEncoder().encode('{') })).not.toThrow()
    expect(() => network.broker.deliver({ ...packet, payload: new Uint8Array(65537) })).not.toThrow()
    expect(() =>
      network.broker.deliver({
        ...packet,
        payload: encode({ ...packet.frame, from: { toString: 1, valueOf: 1 } })
      })
    ).not.toThrow()
    network.broker.deliver({ ...packet, payload: encode({ ...packet.frame, to: 'f'.repeat(32) }) })
    expect(guest.received).not.toHaveBeenCalled()
    network.broker.deliver(packet)
    expect(guest.received).toHaveBeenCalledExactlyOnceWith({ type: 'health', value: 1 })
  })

  it('does not apply older or duplicate realtime updates after a newer one', async () => {
    const { host, guest } = await pair()
    network.broker.hold = (packet) => packet.frame.kind === 'latest' && packet.frame.category === 'input'
    host.peer.send({ type: 'input', forward: 1 })
    await vi.waitFor(() => expect(network.broker.pending).toHaveLength(1), { interval: 20, timeout: 3000 })
    host.peer.send({ type: 'input', forward: 0 })
    await vi.waitFor(() => expect(network.broker.pending).toHaveLength(2), { interval: 20, timeout: 3000 })
    const [older, newer] = network.broker.pending
    network.broker.deliver(newer)
    network.broker.deliver(older)
    network.broker.deliver(newer)
    expect(guest.received).toHaveBeenCalledTimes(1)
    expect(guest.received).toHaveBeenCalledWith({ type: 'input', forward: 0 })
  })

  it.each(['health', 'input', 'state', 'ready'])(
    'replaces %s updates until the subgroup header finishes without sending obsolete frames',
    async (type) => {
      vi.useFakeTimers()
      const { host, guest } = await pair()
      await vi.advanceTimersByTimeAsync(0)
      vi.spyOn(performance, 'now').mockReturnValue(2001)
      const raw = network.broker.sessions[0].raw
      let release!: () => void
      const header = vi.spyOn(raw, 'sendSubgroupHeader').mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve
          })
      )
      const object = vi.spyOn(raw, 'sendSubgroupObject')
      expect(host.peer.send({ type, value: 1 })).toBe(true)
      await vi.advanceTimersByTimeAsync(100)
      expect(host.peer.send({ type, value: 2 })).toBe(true)
      await vi.advanceTimersByTimeAsync(100)
      expect(host.peer.send({ type, value: 3 })).toBe(true)
      expect(guest.received).not.toHaveBeenCalled()
      expect(object).toHaveBeenCalledTimes(1)
      expect(object.mock.calls[0][4]).toBe(3)
      release()
      await vi.advanceTimersByTimeAsync(0)
      expect(guest.received).toHaveBeenCalledExactlyOnceWith({ type, value: 3 })
      expect(header).toHaveBeenCalledTimes(1)
      expect(object).toHaveBeenCalledTimes(2)
    }
  )

  it('keeps final states reliable and ordered while a subgroup header is pending', async () => {
    vi.useFakeTimers()
    const { host, guest } = await pair()
    await vi.advanceTimersByTimeAsync(0)
    vi.spyOn(performance, 'now').mockReturnValue(2001)
    let release!: () => void
    vi.spyOn(network.broker.sessions[0].raw, 'sendSubgroupHeader').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const first = { type: 'state', snapshot: { phase: 'finished', result: 1 } }
    const second = { type: 'state', snapshot: { phase: 'finished', result: 2 } }
    expect(host.peer.send(first)).toBe(true)
    expect(host.peer.send(second)).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(guest.received).not.toHaveBeenCalled()
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(guest.received.mock.calls.map(([value]) => value)).toEqual([first, second])
    await vi.advanceTimersByTimeAsync(1000)
    expect(guest.received).toHaveBeenCalledTimes(2)
  })

  it('does not send a queued payload after closing during its subgroup header', async () => {
    vi.useFakeTimers()
    const { host, guest } = await pair()
    await vi.advanceTimersByTimeAsync(0)
    vi.spyOn(performance, 'now').mockReturnValue(2001)
    const raw = network.broker.sessions[0].raw
    let release!: () => void
    vi.spyOn(raw, 'sendSubgroupHeader').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const object = vi.spyOn(raw, 'sendSubgroupObject')
    expect(host.peer.send({ type: 'health', value: 1 })).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(object).toHaveBeenCalledTimes(1)
    expect(object.mock.calls[0][4]).toBe(3)
    object.mockClear()
    host.peer.close()
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(object).not.toHaveBeenCalled()
    expect(guest.received).not.toHaveBeenCalled()
    expect(host.status).not.toHaveBeenCalledWith('error', expect.any(String))
    expect(host.peer.send({ type: 'health', value: 2 })).toBe(false)
  })

  it('retries lost events and acknowledgements without duplicating or reordering actions', async () => {
    const { host, guest } = await pair()
    let droppedEvent = false
    let droppedAck = false
    network.broker.drop = (packet) => {
      if (packet.frame.kind === 'event' && !droppedEvent) {
        droppedEvent = true
        return true
      }
      if (packet.frame.kind === 'ack' && !droppedAck) {
        droppedAck = true
        return true
      }
      return false
    }
    expect(guest.peer.send({ type: 'ritual', step: 'letter' })).toBe(true)
    expect(guest.peer.send({ type: 'effect', kind: 'rattle' })).toBe(true)
    await vi.waitFor(() => expect(host.received).toHaveBeenCalledTimes(2), { interval: 25, timeout: 4000 })
    expect(host.received.mock.calls.map(([value]) => value)).toEqual([
      { type: 'ritual', step: 'letter' },
      { type: 'effect', kind: 'rattle' }
    ])
    expect(droppedEvent && droppedAck).toBe(true)
  })

  it('retries the final result rather than treating it as a replaceable state update', async () => {
    const { host, guest } = await pair()
    let dropped = false
    network.broker.drop = (packet) => {
      if (packet.frame.kind === 'event' && !dropped) {
        dropped = true
        return true
      }
      return false
    }
    expect(host.peer.send({ type: 'state', snapshot: { phase: 'finished' } })).toBe(true)
    await vi.waitFor(
      () => expect(guest.received).toHaveBeenCalledWith({ type: 'state', snapshot: { phase: 'finished' } }),
      { interval: 25, timeout: 3000 }
    )
    expect(dropped).toBe(true)
  })

  it('interrupts on peer departure and ignores late objects', async () => {
    const { host, guest } = await pair()
    const session = network.broker.sessions[1]
    const oldHandler = [...session.objects.values()][0]
    host.peer.close()
    await vi.waitFor(() => expect(guest.status).toHaveBeenCalledWith('disconnected', expect.any(String)))
    oldHandler?.(0n, { objectPayload: new TextEncoder().encode('{"version":1}') })
    expect(guest.received).not.toHaveBeenCalled()
    expect(guest.peer.send({ type: 'health' })).toBe(false)
  })

  it('fails closed instead of silently dropping a full control queue', async () => {
    const { host, guest } = await pair()
    network.broker.drop = (packet) => packet.frame.kind === 'ack'
    for (let count = 0; count < 64; count++) expect(guest.peer.send({ type: 'ritual', count })).toBe(true)
    expect(guest.peer.send({ type: 'ritual', count: 64 })).toBe(false)
    expect(guest.status).toHaveBeenCalledWith('error', expect.stringContaining('overflow'))
    expect(host.received.mock.calls.length).toBeLessThanOrEqual(1)
  })

  it('closes a session which finishes connecting after it was closed', async () => {
    let release!: () => void
    network.broker.connectBarrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const host = createPeer('host')
    const pending = host.peer.connect()
    host.peer.close()
    release()
    await pending
    expect(network.broker.sessions[0].disconnectCount).toBe(2)
    expect(network.broker.sessions[0].connected).toBe(false)
    expect(host.status).not.toHaveBeenCalledWith('connected', expect.any(String))
  })

  it('reports a relay connection timeout and closes a later completion', async () => {
    vi.useFakeTimers()
    let release!: () => void
    network.broker.connectBarrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const host = createPeer('host')
    const pending = host.peer.connect()
    await vi.advanceTimersByTimeAsync(15000)
    expect(host.status).toHaveBeenCalledWith('error', expect.stringContaining('timed out'))
    release()
    await pending
    expect(network.broker.sessions[0].connected).toBe(false)
    expect(host.status).not.toHaveBeenCalledWith('connected', expect.any(String))
  })
})
