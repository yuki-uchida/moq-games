import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import { build, transform } from 'esbuild'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { HorrorWorld } from '../src/world'

let script: string
let brokerScript: string
const directory = dirname(fileURLToPath(import.meta.url))
const source = process.env.YORU_FRAME_SOURCE_ROOT ?? resolve(directory, '..', 'src')

beforeAll(async () => {
  const existing = await readFile(resolve(directory, 'peer.test.ts'), 'utf8')
  const broker = existing.slice(existing.indexOf('  type Packet'), existing.indexOf('\nvi.mock('))
  brokerScript = (await transform(`globalThis.network = (() => {\n${broker}()`, { loader: 'ts' })).code
  const bundled = await build({
    entryPoints: [resolve(source, 'main.ts')],
    absWorkingDir: resolve(directory, '../../../..'),
    nodePaths: [resolve(directory, '../../../../node_modules')],
    bundle: true,
    write: false,
    format: 'iife',
    loader: { '.css': 'empty' },
    plugins: [
      {
        name: 'clock-offline-boundaries',
        setup(builder) {
          builder.onLoad({ filter: /[/\\]moqtClient\.ts$/ }, () => ({
            contents: `export const MoqtClientWrapper = globalThis.network.Session
          export const RequestErrorCode = { TrackDoesNotExist: 4n }`,
            loader: 'js'
          }))
          builder.onLoad({ filter: /[/\\]world\.ts$/ }, async ({ path }) => ({
            contents:
              (await readFile(path, 'utf8')).split('export class HorrorWorld')[0] +
              `export class HorrorWorld { isHealthy = true; resize() {} dispose() {} render() {} }`,
            loader: 'ts'
          }))
          builder.onLoad({ filter: /[/\\]main\.ts$/ }, async ({ path }) => ({
            contents:
              (await readFile(path, 'utf8')) +
              `
          globalThis.game = { match,
            inspect: () => ({ snapshot: match.getSnapshot(), guestSnapshot: snapshot,
              human: { ...human }, haunter: { ...haunter }, turn, turnTotal, pitch, epoch: readinessEpoch,
              localReady, remoteReady, remoteMic, remoteSeen, pendingStop, connected, finished, peerStatus, micGeneration, hasStream: !!stream, hasAudio: !!audio, hasSound: !!sound, soundAllowed, interrupted, effect, playbackEffect: playback.effect, keys: [...keys],
              connection: el('connection').textContent,
              localRms, localVoiced, remoteVoiced, duration: meter.duration, pending: meter.pending,
              qualified: meter.qualified, notice: el('notice').textContent }),
            getPeer: () => peer,
            health: sendHealth, send, broadcast, release: releaseMedia, finish, syncSound, interrupt, drawing: checkDrawing, getWorld: () => world, getSound: () => sound,
            holdKey: (code, down = true) => down ? keys.add(code) : keys.delete(code),
            pause: () => interrupt('fixture pause'),
            setSendHook: (hook) => { const original = peer.send.bind(peer)
              peer.send = (value) => { hook(value); return original(value) } },
            close: cleanup
          }`,
            loader: 'ts'
          }))
        }
      }
    ]
  })
  script = bundled.outputFiles[0].text
}, 30000)

const parameter = () => ({
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  setTargetAtTime: vi.fn()
})

class Context {
  currentTime = 0
  sampleRate = 8000
  state = 'running'
  destination = {}
  gains: ReturnType<Context['createGain']>[] = []
  sources: ReturnType<Context['source']>[] = []
  filters: ReturnType<Context['createBiquadFilter']>[] = []
  panners: ReturnType<Context['createStereoPanner']>[] = []
  listeners = new Set<() => void>()
  samples = new Float32Array(16000)
  addEventListener(_type: string, listener: () => void) {
    this.listeners.add(listener)
  }
  removeEventListener(_type: string, listener: () => void) {
    this.listeners.delete(listener)
  }
  createStereoPanner() {
    const panner = { pan: parameter(), connect: vi.fn(), disconnect: vi.fn() }
    this.panners.push(panner)
    return panner
  }
  createBuffer() {
    return { duration: 2, getChannelData: () => this.samples }
  }
  createGain() {
    const gain = { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() }
    this.gains.push(gain)
    return gain
  }
  source() {
    const source = {
      type: '',
      buffer: null as null | { getChannelData: (channel: number) => Float32Array },
      loop: false,
      frequency: parameter(),
      playbackRate: parameter(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as null | (() => void)
    }
    this.sources.push(source)
    return source
  }
  createOscillator() {
    return this.source()
  }
  createBufferSource() {
    return this.source()
  }
  createBiquadFilter() {
    const filter = { type: '', frequency: parameter(), Q: parameter(), connect: vi.fn(), disconnect: vi.fn() }
    this.filters.push(filter)
    return filter
  }
}

async function pair(ambientRandom?: number) {
  const clock = { now: 0 }
  const networkContext: any = { TextDecoder, Uint8Array, Map, BigInt }
  runInNewContext(brokerScript, networkContext)
  const network = networkContext.network
  function client(initialFrameFailure?: unknown) {
    const elements = new Map<string, any>()
    const events = new Map<string, Array<() => void>>()
    const listen = (name: string, callback: () => void) => events.set(name, [...(events.get(name) ?? []), callback])
    const contexts: any[] = []
    const streams: any[] = []
    const createMedia = () => {
      const track: any = {
        readyState: 'live',
        muted: false,
        enabled: true,
        stopCount: 0,
        stop() {
          this.stopCount++
          this.readyState = 'ended'
          this.onended?.()
        }
      }
      const media = { track, getTracks: () => [track], getAudioTracks: () => [track] }
      streams.push(media)
      return media
    }
    class Element {
      value = ''
      textContent = ''
      disabled = false
      checked = false
      hidden = false
      parentElement = this
      onclick?: () => any
      insertAdjacentHTML() {}
      setAttribute() {}
      addEventListener() {}
      replaceChildren() {}
      focus() {}
      closest() {
        return this
      }
    }
    const element = (id: string) => {
      if (!elements.has(id)) elements.set(id, new Element())
      return elements.get(id)
    }
    element('threshold').value = '0.1'
    element('volume').value = element('play-volume').value = '0.2'
    element('relay-url').value = 'https://relay.invalid:4433'
    element('room-code').value = 'a'.repeat(32)
    const track = {
      readyState: 'live',
      muted: false,
      enabled: true,
      stop() {
        this.readyState = 'ended'
      }
    }
    let toneStart = -Infinity
    let toneStop = Infinity
    let toneAmplitude = 0.2
    const frames = new Map<number, () => void>()
    let scheduledFrames = 0
    const timers = new Map<number, { callback: () => void; at: number; delay: number; interval?: number }>()
    let nextTimer = 1
    const timer = (callback: () => void, delay: number, interval?: number) => {
      const id = nextTimer++
      timers.set(id, { callback, at: clock.now + delay, delay, interval })
      return id
    }
    const sandbox: any = {
      network,
      console,
      Math: Object.assign(Object.create(Math), ambientRandom === undefined ? {} : { random: () => ambientRandom }),
      TextDecoder,
      TextEncoder,
      Uint8Array,
      Float32Array,
      performance: { now: () => clock.now },
      crypto: webcrypto,
      URL,
      location: { reload: vi.fn() },
      AbortController,
      Date: class extends Date {
        static now() {
          return clock.now
        }
      },
      HTMLElement: Element,
      HTMLInputElement: Element,
      HTMLTextAreaElement: Element,
      HTMLButtonElement: Element,
      HTMLSelectElement: Element,
      document: {
        hidden: false,
        visibilityState: 'visible',
        fullscreenEnabled: false,
        querySelector: element,
        getElementById: element,
        createElement: () => new Element(),
        addEventListener: listen
      },
      addEventListener: listen,
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
      requestAnimationFrame(callback: () => void) {
        if (initialFrameFailure !== undefined) throw initialFrameFailure
        const id = ++scheduledFrames
        frames.set(id, callback)
        return id
      },
      cancelAnimationFrame(id: number) {
        frames.delete(id)
      },
      setTimeout: (callback: () => void, delay: number) => timer(callback, delay),
      clearTimeout: (id: number) => timers.delete(id),
      setInterval: (callback: () => void, delay: number) => timer(callback, delay, delay),
      clearInterval: (id: number) => timers.delete(id),
      navigator: {
        mediaDevices: { getUserMedia: async () => createMedia() }
      },
      AudioContext: class extends Context {
        analyser: any
        closeCount = 0
        suspendCount = 0
        onstatechange: (() => void) | null = null
        constructor() {
          super()
          contexts.push(this)
        }
        async suspend() {
          this.suspendCount++
          this.state = 'suspended'
        }
        state = 'running'
        sampleRate = 8000
        async resume() {}
        async close() {
          this.closeCount++
          this.state = 'closed'
        }
        createMediaStreamSource() {
          return { connect() {} }
        }
        createAnalyser() {
          return (this.analyser = {
            fftSize: 8192,
            getFloatTimeDomainData(samples: Float32Array) {
              for (let index = 0; index < samples.length; index++) {
                const time = clock.now - ((samples.length - index) * 1000) / 8000
                samples[index] =
                  time >= toneStart && time < toneStop
                    ? toneAmplitude * Math.sin((2 * Math.PI * 220 * index) / 8000)
                    : 0
              }
            }
          })
        }
      }
    }
    sandbox.window = sandbox
    let bootstrapError: unknown
    try {
      runInNewContext(script, sandbox)
    } catch (error) {
      if (initialFrameFailure === undefined) throw error
      bootstrapError = error
    }
    return {
      bootstrapError,
      get game() {
        return sandbox.game
      },
      get track() {
        return streams.at(-1)?.track
      },
      contexts,
      streams,
      createMedia,
      document: sandbox.document,
      reload: sandbox.location.reload,
      dispatch: (name: string, event?: any) => {
        for (const callback of events.get(name) ?? []) (callback as any)(event)
      },
      setPermission: (fn: () => Promise<any>) => {
        sandbox.navigator.mediaDevices.getUserMedia = fn
      },
      setAudioResume: (fn: () => Promise<void>) => {
        sandbox.AudioContext.prototype.resume = fn
      },
      element,
      room: element('room-code'),
      click: (id: string) => element(id).onclick?.(),
      setToneWindow: (start: number, stop: number) => {
        toneStart = start
        toneStop = stop
        toneAmplitude = 0.8
      },
      get hasFrame() {
        return frames.size > 0
      },
      get scheduledFrames() {
        return scheduledFrames
      },
      get pendingFrames() {
        return frames.size
      },
      frame: () => {
        const entry = frames.entries().next().value
        if (!entry) return
        frames.delete(entry[0])
        return entry[1]()
      },
      failNextFrameSchedule: (failure: unknown) => {
        const original = sandbox.requestAnimationFrame
        sandbox.requestAnimationFrame = () => {
          sandbox.requestAnimationFrame = original
          throw failure
        }
      },
      setRandom: (value: number) => {
        sandbox.Math.random = () => value
      },
      failAmbientSchedule: () => {
        const original = sandbox.setTimeout
        sandbox.setTimeout = (callback: () => void, delay: number) => {
          if (delay >= 8000) {
            sandbox.setTimeout = original
            throw new Error('injected ambient reschedule')
          }
          return original(callback, delay)
        }
      },
      ambientTimers: () => [...timers.entries()].filter(([, item]) => !item.interval && item.delay >= 8000),
      fireTimer: (id: number) => {
        const item = timers.get(id)
        if (!item) throw new Error('timer missing')
        clock.now = item.at
        timers.delete(id)
        item.callback()
      },
      timers() {
        for (const [id, item] of timers)
          if (item.at <= clock.now) {
            if (item.interval) item.at = clock.now + item.interval
            else timers.delete(id)
            item.callback()
          }
      }
    }
  }
  const host = client(),
    guest = client()
  const flush = async () => {
    for (let index = 0; index < 120; index++) await Promise.resolve()
  }
  host.click('host')
  guest.room.value = host.room.value
  guest.click('guest')
  await flush()
  for (const now of [250, 500, 750]) {
    clock.now = now
    host.timers()
    guest.timers()
    await flush()
  }
  await host.click('microphone')
  await guest.click('microphone')
  await flush()
  const health = async () => {
    host.game.health()
    guest.game.health()
    await flush()
  }
  await health()
  expect(host.game.inspect().connected).toBe(true)
  expect(guest.game.inspect().connected).toBe(true)
  const frames = async (now: number) => {
    clock.now = now
    host.timers()
    guest.timers()
    await health()
    guest.frame()
    host.frame()
    await flush()
  }
  await frames(1000)
  const ready = async (now = 1400) => {
    clock.now = now
    await health()
    await health()
    host.click('ready')
    guest.click('ready')
    await flush()
    await health()
    expect(host.game.inspect().snapshot.paused).toBe(false)
    expect(host.game.inspect().snapshot.phase).toMatch(/^round[12]$/)
  }
  const close = () => {
    for (const client of [host, guest]) {
      for (const context of client.contexts)
        for (const gain of context.gains)
          for (const operation of Object.values(gain.gain) as any[]) operation.mockReset()
      try {
        client.game.close()
      } catch {}
    }
  }
  return {
    host,
    guest,
    network,
    clock,
    ready,
    frames,
    health,
    flush,
    close,
    bootstrap: (failure: unknown) => client(failure)
  }
}

describe.each(['host', 'guest'] as const)('connection-time microphone processing report: %s', (role) => {
  const unavailable = '入力補正（接続時のブラウザー報告）：不明（接続情報なし）'
  const known = '入力補正（接続時のブラウザー報告）：自動音量調整：オン / ノイズ抑制：オフ / エコー除去：オン'
  const reversed = '入力補正（接続時のブラウザー報告）：自動音量調整：オフ / ノイズ抑制：オン / エコー除去：オフ'
  const unknown = '入力補正（接続時のブラウザー報告）：自動音量調整：不明 / ノイズ抑制：不明 / エコー除去：不明'
  const values = { autoGainControl: true, noiseSuppression: false, echoCancellation: true }

  it('reads only the three boolean fields once, locally, without changing requested constraints or readiness', async () => {
    const game = await pair()
    const client = game[role]
    const reads: string[] = []
    const packets: unknown[] = []
    const media = client.createMedia()
    const settings = new Proxy(values, {
      get(target, key) {
        if (typeof key !== 'string' || !Object.hasOwn(target, key)) throw new Error('unexpected settings read')
        reads.push(key)
        return target[key as keyof typeof target]
      },
      ownKeys() {
        throw new Error('settings enumeration forbidden')
      }
    })
    const getSettings = vi.fn(function (this: unknown) {
      expect(this).toBe(media.track)
      return settings
    })
    media.track.getSettings = getSettings
    const identifiers = vi.fn(() => {
      throw new Error('identifier access forbidden')
    })
    for (const key of ['deviceId', 'groupId', 'label']) Object.defineProperty(media.track, key, { get: identifiers })
    const request = vi.fn(async () => media)
    client.setPermission(request)
    client.game.setSendHook((packet: unknown) => packets.push(packet))
    try {
      await client.click('microphone')
      await game.health()
      expect(request).toHaveBeenCalledExactlyOnceWith({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
        video: false
      })
      expect(getSettings).toHaveBeenCalledTimes(1)
      expect(reads).toEqual(['autoGainControl', 'noiseSuppression', 'echoCancellation'])
      expect(identifiers).not.toHaveBeenCalled()
      expect(client.element('mic-processing').textContent).toBe(known)
      expect(client.element('mic-status').textContent).toBe('マイク接続中')
      expect(client.element('ready').disabled).toBe(false)
      expect(JSON.stringify(packets)).not.toMatch(
        /autoGainControl|noiseSuppression|echoCancellation|deviceId|groupId|label/
      )
      client.game.release()
      expect(client.element('mic-processing').textContent).toBe(unavailable)
      expect(media.track.readyState).toBe('ended')
    } finally {
      game.close()
    }
  })

  it.each([
    'missing',
    'non-callable',
    'method-getter-throws',
    'method-throws',
    'undefined',
    'null',
    'primitive',
    'invalid-fields',
    'field-getters-throw'
  ])('keeps readiness and reports unknown for %s', async (fault) => {
    const game = await pair()
    const client = game[role]
    const media = client.createMedia()
    if (fault === 'non-callable') media.track.getSettings = true
    else if (fault === 'method-getter-throws') Object.defineProperty(media.track, 'getSettings', { get: boom })
    else if (fault === 'method-throws') media.track.getSettings = boom
    else if (fault !== 'missing')
      media.track.getSettings = () => {
        if (fault === 'undefined') return undefined
        if (fault === 'null') return null
        if (fault === 'primitive') return 7
        if (fault === 'invalid-fields') return { autoGainControl: 'false', noiseSuppression: 0, echoCancellation: [] }
        return Object.fromEntries(Object.keys(values).map((key) => [key, undefined]))
      }
    if (fault === 'field-getters-throw') {
      const settings = {}
      for (const key of Object.keys(values)) Object.defineProperty(settings, key, { get: boom })
      media.track.getSettings = () => settings
    }
    client.setPermission(async () => media)
    try {
      await expect(client.click('microphone')).resolves.toBeUndefined()
      await game.health()
      expect(client.element('mic-processing').textContent).toBe(unknown)
      expect(client.element('mic-status').textContent).toBe('マイク接続中')
      expect(client.element('ready').disabled).toBe(false)
      expect(client.game.inspect().hasStream).toBe(true)
      expect(media.track.stopCount).toBe(0)
    } finally {
      game.close()
    }
  })

  for (const property of ['readyState', 'muted', 'enabled'] as const) {
    it.each([1, 2])('discards the report after reentry from ' + property + ' read %s', async (targetRead) => {
      const game = await pair()
      const client = game[role]
      const media = client.createMedia()
      let reads = 0
      media.track.getSettings = () => {
        const original = media.track[property]
        Object.defineProperty(media.track, property, {
          configurable: true,
          get() {
            reads++
            if (reads === targetRead) {
              Object.defineProperty(media.track, property, { value: original, writable: true, configurable: true })
              client.game.release()
            }
            return original
          }
        })
        return values
      }
      client.setPermission(async () => media)
      try {
        await client.click('microphone')
        expect(reads).toBe(targetRead)
        expect(client.element('mic-processing').textContent).toBe(unavailable)
        expect(client.element('mic-status').textContent).not.toBe('マイク接続中')
        expect(client.game.inspect().hasStream).toBe(false)
        expect(media.track.readyState).toBe('ended')
      } finally {
        game.close()
      }
    })
  }

  it.each(['muted', 'ended', 'disabled', 'unreadable-muted'] as const)(
    'does not report an initially %s track as connected',
    async (initial) => {
      const game = await pair()
      const client = game[role]
      const media = client.createMedia()
      media.track.getSettings = () => values
      if (initial === 'muted') media.track.muted = true
      else if (initial === 'ended') media.track.readyState = 'ended'
      else if (initial === 'disabled') media.track.enabled = false
      else Object.defineProperty(media.track, 'muted', { get: boom })
      client.setPermission(async () => media)
      try {
        await client.click('microphone')
        await game.health()
        expect(client.element('mic-processing').textContent).toBe(unavailable)
        expect(client.element('mic-status').textContent).toBe('マイクを確認してください')
        expect(client.element('ready').disabled).toBe(true)
      } finally {
        game.close()
      }
    }
  )

  it.each(['autoGainControl', 'noiseSuppression', 'echoCancellation'] as const)(
    'isolates a throwing %s getter from other reported booleans',
    async (key) => {
      const game = await pair()
      const client = game[role]
      const media = client.createMedia()
      const settings = { ...values }
      Object.defineProperty(settings, key, { get: boom })
      media.track.getSettings = () => settings
      client.setPermission(async () => media)
      try {
        await client.click('microphone')
        const expected = known.replace(
          key === 'autoGainControl'
            ? '自動音量調整：オン'
            : key === 'noiseSuppression'
              ? 'ノイズ抑制：オフ'
              : 'エコー除去：オン',
          key === 'autoGainControl'
            ? '自動音量調整：不明'
            : key === 'noiseSuppression'
              ? 'ノイズ抑制：不明'
              : 'エコー除去：不明'
        )
        expect(client.element('mic-processing').textContent).toBe(expected)
        expect(client.element('mic-status').textContent).toBe('マイク接続中')
      } finally {
        game.close()
      }
    }
  )

  it('clears previous values while permission is pending and after permission failure', async () => {
    const game = await pair()
    const client = game[role]
    const media = client.createMedia()
    media.track.getSettings = () => values
    client.setPermission(async () => media)
    try {
      await client.click('microphone')
      expect(client.element('mic-processing').textContent).toBe(known)
      let rejectPermission!: (error: Error) => void
      client.setPermission(
        () =>
          new Promise((_, reject) => {
            rejectPermission = reject
          })
      )
      const pending = client.click('microphone')
      expect(client.element('mic-processing').textContent).toBe(unavailable)
      rejectPermission(new Error('permission denied'))
      await pending
      expect(client.element('mic-processing').textContent).toBe(unavailable)
      expect(client.element('mic-status').textContent).toBe('マイクを利用できません')
      expect(media.track.readyState).toBe('ended')
    } finally {
      game.close()
    }
  })

  it.each(['ended', 'mute'] as const)(
    'clears the report on %s without restoring old values on unmute',
    async (event) => {
      const game = await pair()
      const client = game[role]
      const media = client.createMedia()
      media.track.getSettings = () => values
      client.setPermission(async () => media)
      try {
        await client.click('microphone')
        expect(client.element('mic-processing').textContent).toBe(known)
        if (event === 'ended') media.track.readyState = 'ended'
        else media.track.muted = true
        media.track['on' + event]()
        expect(client.element('mic-processing').textContent).toBe(unavailable)
        media.track.muted = false
        media.track.onunmute()
        expect(client.element('mic-processing').textContent).toBe(unavailable)
      } finally {
        game.close()
      }
    }
  )

  for (const stage of ['method-getter', 'method', 'autoGainControl', 'noiseSuppression', 'echoCancellation'] as const)
    for (const action of [
      'release',
      'finish',
      'cleanup',
      'terminal',
      'reconnect',
      'stop',
      'silent-stop',
      'mute'
    ] as const)
      it.each([false, true])(
        'rejects stale values after synchronous ' + stage + '/' + action + ', throws=%s',
        async (throws) => {
          const game = await pair()
          const client = game[role]
          const stale = client.createMedia()
          const replacement = client.createMedia()
          replacement.track.getSettings = () => ({
            autoGainControl: false,
            noiseSuppression: true,
            echoCancellation: false
          })
          let entered = false
          let staleEnded: (() => void) | undefined
          const reenter = () => {
            expect(entered).toBe(false)
            entered = true
            staleEnded = stale.track.onended
            if (action === 'release') client.game.release()
            else if (action === 'finish') client.game.finish()
            else if (action === 'cleanup') client.game.close()
            else if (action === 'terminal') terminatePeerForMicrophone(client, 'error')
            else if (action === 'reconnect') void client.click('microphone')
            else if (action === 'stop') stale.track.stop()
            else if (action === 'silent-stop') stale.track.readyState = 'ended'
            else {
              stale.track.muted = true
              stale.track.onmute()
            }
            if (throws) throw new Error('settings read failed after reentry')
          }
          if (stage === 'method-getter')
            Object.defineProperty(stale.track, 'getSettings', {
              get() {
                reenter()
                return () => values
              }
            })
          else if (stage === 'method')
            stale.track.getSettings = () => {
              reenter()
              return values
            }
          else {
            const settings = { ...values }
            Object.defineProperty(settings, stage, {
              get() {
                reenter()
                return values[stage]
              }
            })
            stale.track.getSettings = () => settings
          }
          let requests = 0
          client.setPermission(async () => (++requests === 1 ? stale : replacement))
          try {
            await expect(client.click('microphone')).resolves.toBeUndefined()
            await game.flush()
            expect(entered).toBe(true)
            expect(client.element('mic-processing').textContent).toBe(action === 'reconnect' ? reversed : unavailable)
            if (action === 'reconnect') {
              staleEnded?.()
              expect(client.element('mic-processing').textContent).toBe(reversed)
              expect(client.game.inspect().hasStream).toBe(true)
              expect(replacement.track.readyState).toBe('live')
              expect(client.element('mic-status').textContent).toBe('マイク接続中')
            }
            if (action !== 'mute') expect(stale.track.readyState).toBe('ended')
            if (['release', 'finish', 'cleanup', 'terminal'].includes(action)) {
              expect(client.game.inspect().hasStream).toBe(false)
              expect(client.game.inspect().hasAudio).toBe(false)
              expect(client.game.inspect().hasSound).toBe(false)
              expect(client.contexts.at(-1).closeCount).toBe(1)
            }
          } finally {
            game.close()
          }
        }
      )

  it.each(['stop-succeeds', 'stop-unconfirmed'] as const)(
    'does not let a throwing display block %s safety',
    async (mode) => {
      const game = await pair()
      const client = game[role]
      const media = client.createMedia()
      media.track.getSettings = boom
      client.setPermission(async () => media)
      Object.defineProperty(client.element('mic-processing'), 'textContent', { get: boom, set: boom })
      try {
        await client.click('microphone')
        expect(client.element('mic-status').textContent).toBe('マイク接続中')
        if (mode === 'stop-unconfirmed')
          media.track.stop = () => {
            media.track.stopCount++
          }
        expect(() => client.game.release()).not.toThrow()
        expect(media.track.stopCount).toBe(1)
        expect(client.contexts.at(-1).closeCount).toBe(1)
        expect(client.game.inspect().hasStream).toBe(false)
        if (mode === 'stop-unconfirmed') {
          expect(client.element('mic-status').textContent).toContain('旧マイクの停止を保証できません')
          const request = vi.fn(async () => client.createMedia())
          client.setPermission(request)
          await client.click('microphone')
          expect(request).not.toHaveBeenCalled()
        } else expect(media.track.readyState).toBe('ended')
      } finally {
        game.close()
      }
    }
  )
})

describe('voluntary pause regression isolation', () => {
  for (const round of ['round1', 'round2']) {
    for (const role of ['host', 'guest'] as const) {
      it('stops the remote input and pointer only on delivery: ' + role + '/' + round, async () => {
        const game = await playing(round)
        try {
          const other = role === 'host' ? 'guest' : 'host'
          for (const client of [game.host, game.guest]) {
            client.game.holdKey('ArrowRight')
            client.game.holdKey('ArrowUp')
            client.document.pointerLockElement = client.element('world')
            client.document.exitPointerLock = vi.fn(() => {
              client.document.pointerLockElement = undefined
            })
          }
          game.network.broker.hold = () => true
          game[role].click('pause')
          expect(game[other].game.inspect().keys).toContain('ArrowRight')
          expect(game[other].document.exitPointerLock).not.toHaveBeenCalled()
          game.network.broker.hold = undefined
          for (const packet of game.network.broker.pending.splice(0).reverse()) {
            game.network.broker.deliver(packet)
            game.network.broker.deliver(packet)
          }
          await game.flush()
          await game.health()
          for (const client of [game.host, game.guest]) {
            const before = client.game.inspect()
            expect(before.keys).toEqual([])
            expect(client.document.exitPointerLock).toHaveBeenCalledOnce()
            client.dispatch('keydown', { code: 'ArrowUp', preventDefault: vi.fn() })
            client.document.pointerLockElement = client.element('world')
            client.dispatch('mousemove', { movementX: 50, movementY: 50 })
            expect(client.game.inspect().pitch).toBe(before.pitch)
            expect(client.game.inspect().turn).toBe(0)
            expect(client.game.inspect().keys).toEqual([])
          }
          await game.ready(game.clock.now + 100)
          for (const client of [game.host, game.guest]) {
            expect(client.game.inspect().keys).toEqual([])
            const before = client.game.inspect().pitch
            client.dispatch('keydown', { code: 'ArrowUp', preventDefault: vi.fn() })
            client.dispatch('mousemove', { movementX: 20, movementY: 10 })
            expect(client.game.inspect().keys).toContain('ArrowUp')
            expect(client.game.inspect().pitch).not.toBe(before)
          }
        } finally {
          game.close()
        }
      })

      it(
        'rejects synchronous ready clicks from local and remote pause side effects: ' + role + '/' + round,
        async () => {
          const game = await playing(round)
          const restores: Array<() => void> = []
          try {
            const readyMessages: string[] = []
            for (const clientRole of ['host', 'guest'] as const) {
              const client = game[clientRole]
              client.game.setSendHook((value: any) => {
                if (value.type === 'ready') readyMessages.push(clientRole)
              })
              const output = client.game.getSound()
              const original = output.stop.bind(output)
              let entered = false
              const stop = vi.spyOn(output, 'stop').mockImplementation(() => {
                if (!entered) {
                  entered = true
                  client.click('ready')
                }
                original()
              })
              restores.push(() => stop.mockRestore())
              client.document.pointerLockElement = client.element('world')
              client.document.exitPointerLock = () => {
                client.click('ready')
                client.document.pointerLockElement = undefined
              }
            }
            game[role].click('pause')
            await game.flush()
            await game.health()
            expect(readyMessages).toEqual([])
            for (const client of [game.host, game.guest]) expect(client.game.inspect().localReady).toBe(false)
            for (const restore of restores) restore()
            restores.length = 0
            game.host.click('ready')
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            game.guest.click('ready')
            await game.flush()
            await game.health()
            expect(game.host.game.inspect().snapshot.paused).toBe(false)
          } finally {
            for (const restore of restores) restore()
            game.close()
          }
        }
      )

      it('keeps the voluntary latch through optional metadata replacement: ' + role + '/' + round, async () => {
        const game = await playing(round)
        try {
          let metadata: boolean | 'passthrough' | undefined = true
          let lastState: any
          game.host.game.setSendHook((value: any) => {
            if (value.type === 'state') {
              if (metadata === undefined) delete value.voluntaryPause
              else if (metadata !== 'passthrough') value.voluntaryPause = metadata
              lastState = JSON.parse(JSON.stringify(value))
            }
          })
          game[role].click('pause')
          await game.flush()
          await game.health()
          const epoch = game.host.game.inspect().epoch
          for (const replacement of [undefined, false, true]) {
            metadata = replacement
            game.host.game.broadcast()
            await game.flush()
            game.guest.dispatch('keydown', { code: 'ArrowDown', preventDefault: vi.fn() })
            expect(game.guest.game.inspect().keys).toEqual([])
          }
          const paused = game.guest.game.inspect().guestSnapshot
          metadata = 'passthrough'
          for (const invalid of [
            { ...lastState, readinessEpoch: epoch - 1 },
            { ...lastState, voluntaryPause: 'true' },
            { ...lastState, voluntaryPause: false, snapshot: { ...paused, paused: false } },
            { ...lastState, readinessEpoch: epoch + 1, voluntaryPause: false, snapshot: { ...paused, paused: false } }
          ]) {
            game.host.game.send({ ...invalid, sequence: lastState.sequence + 1 })
            await game.flush()
            expect(game.guest.game.inspect().guestSnapshot).toEqual(paused)
            expect(game.guest.game.inspect().soundAllowed).toBe(false)
          }
          metadata = false
          game.host.click('ready')
          await game.flush()
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          game.guest.click('ready')
          await game.flush()
          await game.health()
          expect(game.host.game.inspect().snapshot.paused).toBe(false)
          expect(game.guest.game.inspect().guestSnapshot.paused).toBe(false)
        } finally {
          game.close()
        }
      })

      it(
        'retains local safety when optional metadata is stripped like a legacy peer: ' + role + '/' + round,
        async () => {
          const game = await playing(round)
          try {
            for (const client of [game.host, game.guest])
              client.game.setSendHook((value: any) => {
                delete value.voluntaryPause
              })
            game[role].click('pause')
            await game.flush()
            await game.health()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            expect(game.guest.game.inspect().pendingStop).toBeUndefined()
            game[role].dispatch('keydown', { code: 'ArrowDown', preventDefault: vi.fn() })
            expect(game[role].game.inspect().keys).toEqual([])
            game.host.click('ready')
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            game.guest.click('ready')
            await game.flush()
            await game.health()
            expect(game.host.game.inspect().snapshot.paused).toBe(false)
            expect(game.guest.game.inspect().guestSnapshot.paused).toBe(false)
          } finally {
            game.close()
          }
        }
      )
    }

    it('preserves the terminal or role-change phase while a voluntary stop is delayed: ' + round, async () => {
      const game = await playing(round)
      try {
        game.network.broker.hold = (packet: any) => packet.frame.category === 'stop'
        game.guest.click('pause')
        await game.flush()
        expect(game.guest.game.inspect().pendingStop).toBeDefined()
        game.host.game.match.tick(900000)
        game.host.game.broadcast()
        await game.flush()
        expect(game.guest.element('phase').textContent).toBe(round === 'round1' ? '役割を交代' : '夜が明けました')
        expect(game.guest.game.inspect().soundAllowed).toBe(false)
      } finally {
        game.close()
      }
    })

    it('accepts an old-epoch voluntary stop once without duplicate rearming: ' + round, async () => {
      const game = await playing(round)
      try {
        const before = game.host.game.inspect().epoch
        const request = { type: 'stop', requestId: 1, epoch: before - 1, voluntaryPause: true }
        game.guest.game.send({ ...request, voluntaryPause: 'true' })
        await game.flush()
        expect(game.host.game.inspect().snapshot.paused).toBe(false)
        game.guest.game.send(request)
        await game.flush()
        await game.health()
        expect(game.host.game.inspect().snapshot.paused).toBe(true)
        const pausedEpoch = game.host.game.inspect().epoch
        game.guest.game.send(request)
        await game.flush()
        expect(game.host.game.inspect().epoch).toBe(pausedEpoch)
        await game.ready(game.clock.now + 100)
        game.guest.game.send(request)
        await game.flush()
        expect(game.host.game.inspect().snapshot.paused).toBe(false)
        expect(game.host.game.inspect().epoch).toBe(pausedEpoch + 1)
      } finally {
        game.close()
      }
    })
  }
})

describe('voluntary pause prototype only', () => {
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2']) {
      it(`${role}/${round} stops local output and input before delivery, then requires new readiness`, async () => {
        const game = await playing(round)
        try {
          const client = game[role]
          const context = client.contexts.at(-1)
          client.game.getSound().ritualBell()
          client.game.holdKey('KeyW')
          client.game.holdKey('ArrowDown')
          game[role === 'host' ? 'guest' : 'host'].game.holdKey('KeyW')
          client.document.pointerLockElement = client.element('world')
          client.document.exitPointerLock = vi.fn(() => {
            client.document.pointerLockElement = undefined
          })
          game.network.broker.hold = () => true
          const epoch = game.host.game.inspect().epoch
          client.click('pause')
          const immediate = client.game.inspect()
          expect(immediate.soundAllowed).toBe(false)
          expect(immediate.keys).toEqual([])
          expect(immediate.turn).toBe(0)
          expect(immediate.localReady).toBe(false)
          expect(immediate.remoteReady).toBe(false)
          expect(client.track.readyState).toBe('live')
          expect(client.document.exitPointerLock).toHaveBeenCalledOnce()
          expect(context.gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0, context.currentTime)
          expect(context.sources.every((item: any) => item.disconnect.mock.calls.length > 0)).toBe(true)
          expect(client.element('pause').disabled).toBe(true)
          expect(game.host.game.inspect().snapshot.paused).toBe(role === 'host')
          expect(game.guest.game.inspect().guestSnapshot.paused).toBe(false)
          if (role === 'guest') {
            expect(immediate.pendingStop).toBeDefined()
            expect(client.element('phase').textContent).toBe('中断要求中（主催の確認待ち）')
          }
          const request = immediate.pendingStop
          client.click('pause')
          client.dispatch('keydown', { code: 'KeyP', repeat: true, preventDefault: vi.fn() })
          client.dispatch('keydown', { code: 'ArrowDown', preventDefault: vi.fn() })
          client.document.pointerLockElement = client.element('world')
          client.dispatch('mousemove', { movementX: 80, movementY: 80 })
          await game.frames(game.clock.now + 100)
          expect(client.game.inspect().pitch).toBe(immediate.pitch)
          expect(client.game.inspect().turn).toBe(0)
          expect(client.game.inspect().keys).toEqual([])
          expect(client.game.inspect().pendingStop).toEqual(request)
          expect(game.host.game.inspect().epoch).toBe(epoch + (role === 'host' ? 1 : 0))
          if (role === 'guest')
            expect(game.host.game.inspect().snapshot.elapsedMs).toBeGreaterThan(immediate.snapshot.elapsedMs)
          game.network.broker.hold = undefined
          for (const packet of game.network.broker.pending.splice(0)) game.network.broker.deliver(packet)
          await game.flush()
          await game.frames(game.clock.now + 100)
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          expect(game.guest.game.inspect().guestSnapshot.paused).toBe(true)
          expect(game.guest.game.inspect().pendingStop).toBeUndefined()
          expect(game.host.game.inspect().keys).toEqual([])
          expect(game.guest.game.inspect().keys).toEqual([])
          const relock = vi.fn()
          client.element('world').requestPointerLock = relock
          client.click('world')
          expect(relock).not.toHaveBeenCalled()
          const confirmed = game.host.game.inspect()
          client.click('pause')
          await game.health()
          await game.health()
          expect(game.host.game.inspect().epoch).toBe(confirmed.epoch)
          expect(game.host.game.inspect().snapshot).toEqual(confirmed.snapshot)
          game.host.click('ready')
          await game.flush()
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          game.guest.click('ready')
          await game.flush()
          await game.health()
          expect(game.host.game.inspect().snapshot.paused).toBe(false)
          expect(client.element('pause').disabled).toBe(false)
          client.click('pause')
          await game.flush()
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} accepts P while pointer locked and survives reentrant output stop`, async () => {
        const game = await playing(round)
        try {
          const client = game[role]
          const sound = client.game.getSound()
          const original = sound.stop.bind(sound)
          const stop = vi.spyOn(sound, 'stop').mockImplementation(() => {
            client.click('pause')
            original()
          })
          client.document.pointerLockElement = client.element('world')
          client.document.exitPointerLock = vi.fn(() => {
            client.document.pointerLockElement = undefined
          })
          const preventDefault = vi.fn()
          client.dispatch('keydown', { code: 'KeyP', target: client.element('ready'), preventDefault })
          expect(preventDefault).toHaveBeenCalledOnce()
          expect(client.game.inspect().soundAllowed).toBe(false)
          await game.flush()
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          expect(game.guest.game.inspect().pendingStop).toBeUndefined()
          expect(stop.mock.calls.length).toBeLessThan(12)
          stop.mockRestore()
        } finally {
          game.close()
        }
      })
    }

  for (const role of ['host', 'guest'] as const) {
    it(`${role} cannot resume a voluntary pause before drawing recovery and new preparation`, async () => {
      const game = await playing('round1')
      try {
        const client = game[role]
        client.game.getWorld().isHealthy = false
        client.click('pause')
        await game.flush()
        game.host.click('ready')
        game.guest.click('ready')
        await game.flush()
        expect(game.host.game.inspect().snapshot.paused).toBe(true)
        client.game.getWorld().isHealthy = true
        await game.frames(game.clock.now + 100)
        await game.frames(game.clock.now + 100)
        await game.health()
        await game.health()
        expect(game.host.game.inspect().snapshot.paused).toBe(true)
        expect(game.host.game.inspect().localReady).toBe(false)
        expect(game.guest.game.inspect().localReady).toBe(false)
      } finally {
        game.close()
      }
    })

    it(`${role} cannot restart a voluntarily paused match after offline disconnect`, async () => {
      const game = await playing('round1')
      try {
        const client = game[role]
        client.click('pause')
        await game.flush()
        await game.network.broker.sessions[role === 'host' ? 1 : 0].disconnect()
        await game.flush()
        const before = game.host.game.inspect()
        client.click('pause')
        game.host.click('ready')
        game.guest.click('ready')
        await game.flush()
        expect(client.game.inspect().connected).toBe(false)
        expect(game.host.game.inspect().snapshot.paused).toBe(true)
        expect(game.host.game.inspect().epoch).toBe(before.epoch)
        expect(client.game.inspect().soundAllowed).toBe(false)
      } finally {
        game.close()
      }
    })

    it(`${role} ignores a pre-start pause and modified or composing P`, async () => {
      const game = await pair()
      try {
        const client = game[role]
        const before = client.game.inspect()
        client.click('pause')
        const beforeStartDefault = vi.fn()
        client.dispatch('keydown', {
          code: 'KeyP',
          target: client.element('relay-url'),
          preventDefault: beforeStartDefault
        })
        expect(beforeStartDefault).not.toHaveBeenCalled()
        expect(client.game.inspect().epoch).toBe(before.epoch)
        expect(client.game.inspect().pendingStop).toBeUndefined()
        expect(client.element('pause').disabled).toBe(true)
        await game.ready(1400)
        for (const modifiers of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }])
          client.dispatch('keydown', { code: 'KeyP', preventDefault: vi.fn(), ...modifiers })
        expect(game.host.game.inspect().snapshot.paused).toBe(false)
      } finally {
        game.close()
      }
    })
  }

  it('discards pending unqualified voice points on host acceptance', async () => {
    const game = await playing('round1')
    try {
      game.host.setToneWindow(game.clock.now - 1000, game.clock.now + 1000)
      for (let index = 0; index < 10; index++) await game.frames(game.clock.now + 10)
      const before = game.host.game.inspect()
      expect(before.pending).toBeGreaterThan(0)
      expect(before.qualified).toBe(false)
      game.guest.click('pause')
      await game.flush()
      const after = game.host.game.inspect()
      expect(after.pending).toBe(0)
      expect(after.duration).toBe(0)
      expect(after.snapshot.scores).toEqual(before.snapshot.scores)
      expect(after.snapshot.elapsedMs).toBe(before.snapshot.elapsedMs)
      expect(game.host.track.readyState).toBe('live')
      expect(game.guest.track.readyState).toBe('live')
    } finally {
      game.close()
    }
  })
})

describe('independent voluntary pause boundary assertions', () => {
  for (const round of ['round1', 'round2'])
    for (const first of ['host', 'guest'] as const)
      it(`${round}/${first} first simultaneous pause preserves confirmation and fresh readiness`, async () => {
        const game = await playing(round)
        try {
          const second = first === 'host' ? 'guest' : 'host'
          const before = game.host.game.inspect().snapshot
          game.network.broker.hold = () => true
          game[first].click('pause')
          game[second].click('pause')
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          expect(game.guest.game.inspect().pendingStop).toBeDefined()
          for (const client of [game.host, game.guest]) {
            expect(client.game.inspect().soundAllowed).toBe(false)
            expect(client.game.inspect().keys).toEqual([])
            expect(client.game.inspect().localReady).toBe(false)
            expect(client.game.inspect().remoteReady).toBe(false)
          }
          game.network.broker.hold = undefined
          for (const packet of game.network.broker.pending.splice(0)) game.network.broker.deliver(packet)
          await game.flush()
          await game.health()
          await game.health()
          expect(game.guest.game.inspect().pendingStop).toBeUndefined()
          expect(game.guest.game.inspect().guestSnapshot.paused).toBe(true)
          const confirmed = game.host.game.inspect()
          expect(confirmed.snapshot.elapsedMs).toBe(before.elapsedMs)
          expect(confirmed.snapshot.scores).toEqual(before.scores)
          for (const client of [game.host, game.guest]) client.click('pause')
          await game.health()
          expect(game.host.game.inspect().epoch).toBe(confirmed.epoch)
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          game[first].click('ready')
          await game.flush()
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          game[second].click('ready')
          await game.flush()
          await game.health()
          expect(game.host.game.inspect().snapshot.paused).toBe(false)
          expect(game.guest.game.inspect().guestSnapshot.paused).toBe(false)
        } finally {
          game.close()
        }
      })

  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2'])
      for (const boundary of ['unlock-throw', 'phase-throw', 'default-throw', 'phase-reentry'])
        it(`${role}/${round}/${boundary} preserves logical pause and input suppression`, async () => {
          const game = await playing(round)
          const client = game[role]
          const phase = client.element('phase')
          const descriptor = Object.getOwnPropertyDescriptor(phase, 'textContent')!
          try {
            const failure = new Error('independent pause boundary ' + boundary)
            const context = client.contexts.at(-1)
            client.game.getSound().ritualBell()
            client.game.holdKey('KeyW')
            client.game.holdKey('ArrowDown')
            client.document.pointerLockElement = client.element('world')
            let reentries = 0
            if (boundary === 'unlock-throw')
              client.document.exitPointerLock = () => {
                throw failure
              }
            else
              client.document.exitPointerLock = () => {
                client.document.pointerLockElement = undefined
              }
            if (boundary === 'phase-throw' || boundary === 'phase-reentry')
              Object.defineProperty(phase, 'textContent', {
                configurable: true,
                get: () => descriptor.value,
                set: () => {
                  if (boundary === 'phase-throw') throw failure
                  reentries++
                  client.click('pause')
                }
              })
            game.network.broker.hold = () => true
            const dispatch = () =>
              client.dispatch('keydown', {
                code: 'KeyP',
                target: client.element('pause'),
                preventDefault: () => {
                  if (boundary === 'default-throw') throw failure
                }
              })
            if (boundary === 'phase-reentry') {
              expect(dispatch).not.toThrow()
              expect(reentries).toBeGreaterThan(0)
              expect(reentries).toBeLessThan(4)
            } else expect(dispatch).toThrow(failure)
            Object.defineProperty(phase, 'textContent', descriptor)
            const immediate = client.game.inspect()
            expect(immediate.soundAllowed).toBe(false)
            expect(immediate.localReady).toBe(false)
            expect(immediate.remoteReady).toBe(false)
            expect(immediate.keys).toEqual([])
            expect(immediate.turn).toBe(0)
            expect(client.track.readyState).toBe('live')
            expect(context.gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0, context.currentTime)
            expect(context.sources.every((item: any) => item.disconnect.mock.calls.length > 0)).toBe(true)
            expect(role === 'host' ? immediate.snapshot.paused : !!immediate.pendingStop).toBe(true)
            client.dispatch('keydown', { code: 'ArrowDown', preventDefault: vi.fn() })
            client.document.pointerLockElement = client.element('world')
            client.dispatch('mousemove', { movementX: 100, movementY: 100 })
            await game.frames(game.clock.now + 100)
            expect(client.game.inspect().keys).toEqual([])
            expect(client.game.inspect().turn).toBe(0)
            expect(client.game.inspect().pitch).toBe(immediate.pitch)
            game.network.broker.hold = undefined
            for (const packet of game.network.broker.pending.splice(0)) game.network.broker.deliver(packet)
            await game.flush()
            await game.health()
            await game.health()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            expect(game.guest.game.inspect().guestSnapshot.paused).toBe(true)
            expect(game.guest.game.inspect().pendingStop).toBeUndefined()
            game.host.click('ready')
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            game.guest.click('ready')
            await game.flush()
            await game.health()
            expect(game.host.game.inspect().snapshot.paused).toBe(false)
          } finally {
            Object.defineProperty(phase, 'textContent', descriptor)
            game.close()
          }
        })
})

describe('current-main voluntary pause migration assertions', () => {
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2']) {
      for (const focus of ['relay-url', 'ready', 'editable'])
        it(`${role}/${round}/${focus} prioritizes unmodified P over text input without resuming`, async () => {
          const game = await playing(round)
          try {
            const client = game[role]
            const target = client.element(focus)
            if (focus === 'editable') target.isContentEditable = true
            const preventDefault = vi.fn()
            client.dispatch('keydown', { code: 'KeyP', target, preventDefault })
            expect(preventDefault).toHaveBeenCalledOnce()
            expect(client.game.inspect().soundAllowed).toBe(false)
            await game.flush()
            const epoch = game.host.game.inspect().epoch
            client.dispatch('keydown', { code: 'KeyP', target, preventDefault: vi.fn() })
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            expect(game.host.game.inspect().epoch).toBe(epoch)
          } finally {
            game.close()
          }
        })

      it(`${role}/${round} leaves modified, composing and repeated P untouched`, async () => {
        const game = await playing(round)
        try {
          const client = game[role]
          for (const flags of [
            { ctrlKey: true },
            { altKey: true },
            { metaKey: true },
            { shiftKey: true },
            { isComposing: true },
            { repeat: true }
          ]) {
            const preventDefault = vi.fn()
            client.dispatch('keydown', {
              code: 'KeyP',
              target: client.element('relay-url'),
              preventDefault,
              ...flags
            })
            expect(preventDefault).not.toHaveBeenCalled()
            expect(client.game.inspect().pendingStop).toBeUndefined()
            expect(game.host.game.inspect().snapshot.paused).toBe(false)
          }
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} suppresses input and relock during finite output-stop reentry`, async () => {
        const game = await playing(round)
        const client = game[role]
        const output = client.game.getSound()
        const original = output.stop.bind(output)
        const relock = vi.fn()
        client.document.exitPointerLock = vi.fn(() => {
          client.document.pointerLockElement = undefined
        })
        const before = client.game.inspect()
        const stop = vi.spyOn(output, 'stop').mockImplementation(() => {
          client.click('pause')
          client.dispatch('keydown', { code: 'KeyW', preventDefault: vi.fn() })
          client.document.pointerLockElement = client.element('world')
          client.dispatch('mousemove', { movementX: 100, movementY: 100 })
          client.click('world')
          original()
        })
        try {
          client.element('world').requestPointerLock = relock
          client.click('pause')
          await game.flush()
          expect(stop.mock.calls.length).toBeGreaterThan(0)
          expect(stop.mock.calls.length).toBeLessThan(12)
          expect(relock).not.toHaveBeenCalled()
          expect(client.document.exitPointerLock).toHaveBeenCalledOnce()
          expect(client.game.inspect().keys).toEqual([])
          expect(client.game.inspect().pitch).toBe(before.pitch)
          expect(client.game.inspect().turn).toBe(0)
          expect(client.game.inspect().soundAllowed).toBe(false)
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
        } finally {
          stop.mockRestore()
          game.close()
        }
      })

      for (const boundary of ['disabled-throw', 'disabled-reentry'])
        it(`${role}/${round}/${boundary} attempts stopping before touching the modified pause DOM`, async () => {
          const game = await playing(round)
          const client = game[role]
          const pause = client.element('pause')
          const descriptor = Object.getOwnPropertyDescriptor(pause, 'disabled')!
          const failure = new Error('pause disabled setter failure')
          let reentries = 0
          try {
            client.game.getSound().ritualBell()
            Object.defineProperty(pause, 'disabled', {
              configurable: true,
              get: () => false,
              set: () => {
                if (boundary === 'disabled-throw') throw failure
                reentries++
                client.click('pause')
              }
            })
            game.network.broker.hold = () => true
            if (boundary === 'disabled-throw') expect(() => client.click('pause')).toThrow(failure)
            else {
              expect(() => client.click('pause')).not.toThrow()
              expect(reentries).toBeGreaterThan(0)
              expect(reentries).toBeLessThan(8)
            }
            Object.defineProperty(pause, 'disabled', descriptor)
            expect(client.game.inspect().soundAllowed).toBe(false)
            expect(client.game.inspect().keys).toEqual([])
            expect(client.game.inspect().localReady).toBe(false)
            expect(client.game.inspect().remoteReady).toBe(false)
            expect(role === 'host' ? client.game.inspect().snapshot.paused : !!client.game.inspect().pendingStop).toBe(
              true
            )
            const context = client.contexts.at(-1)
            expect(context.sources.every((source: any) => source.disconnect.mock.calls.length > 0)).toBe(true)
            game.network.broker.hold = undefined
            for (const packet of game.network.broker.pending.splice(0)) game.network.broker.deliver(packet)
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            expect(game.guest.game.inspect().pendingStop).toBeUndefined()
          } finally {
            Object.defineProperty(pause, 'disabled', descriptor)
            game.close()
          }
        })

      it(`${role}/${round} discards the unobserved tail and unqualified voice without changing committed state`, async () => {
        const game = await playing(round)
        try {
          const survivor = game.host.game.inspect().snapshot.survivor as 'host' | 'guest'
          game.host.game.match.addPenalty(survivor, 0.5)
          game.host.game.broadcast()
          await game.flush()
          game[survivor].setToneWindow(game.clock.now - 1000, game.clock.now + 1000)
          for (let index = 0; index < 10; index++) await game.frames(game.clock.now + 10)
          const before = game.host.game.inspect()
          expect(before.pending).toBeGreaterThan(0)
          expect(before.qualified).toBe(false)
          game.clock.now += 37
          game[role].click('pause')
          await game.flush()
          const after = game.host.game.inspect()
          expect(after.snapshot.elapsedMs).toBe(before.snapshot.elapsedMs)
          expect(after.snapshot.scores).toEqual(before.snapshot.scores)
          expect(after.human).toEqual(before.human)
          expect(after.haunter).toEqual(before.haunter)
          expect(after.pending).toBe(0)
          expect(after.duration).toBe(0)
          expect(after.qualified).toBe(false)
          await game.frames(game.clock.now + 100)
          expect(game.host.game.inspect().snapshot).toEqual(after.snapshot)
          await game.health()
          await game.health()
          game.host.click('ready')
          await game.flush()
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          game.guest.click('ready')
          await game.flush()
          await game.health()
          expect(game.host.game.inspect().snapshot.paused).toBe(false)
          expect(game.host.game.inspect().pending).toBe(0)
          expect(game.host.game.inspect().snapshot.elapsedMs).toBe(before.snapshot.elapsedMs)
          await game.frames(game.clock.now + 10)
          expect(game.host.game.inspect().snapshot.elapsedMs).toBe(before.snapshot.elapsedMs + 10)
          expect(game.host.game.inspect().snapshot.scores).toEqual(before.snapshot.scores)
        } finally {
          game.close()
        }
      })
    }

  for (const role of ['host', 'guest'] as const)
    for (const stage of ['lobby', 'intermission', 'finished'])
      it(`${role}/${stage} ignores pause even if its button is forcibly enabled`, async () => {
        const game = stage === 'lobby' ? await pair() : await playing(stage === 'finished' ? 'round2' : 'round1')
        try {
          if (stage !== 'lobby') {
            game.host.game.match.tick(900000)
            game.host.game.broadcast()
            await game.flush()
          }
          const client = game[role]
          const before = game.host.game.inspect()
          expect(before.snapshot.phase).toBe(stage)
          client.element('pause').disabled = false
          client.click('pause')
          const preventDefault = vi.fn()
          client.dispatch('keydown', { code: 'KeyP', target: client.element('ready'), preventDefault })
          await game.flush()
          expect(preventDefault).not.toHaveBeenCalled()
          expect(game.host.game.inspect().snapshot).toEqual(before.snapshot)
          expect(game.host.game.inspect().epoch).toBe(before.epoch)
          expect(client.game.inspect().pendingStop).toBeUndefined()
        } finally {
          game.close()
        }
      })

  for (const round of ['round1', 'round2'])
    it(`${round} blocks guest preparation and effects while confirmation is withheld`, async () => {
      const game = await playing(round)
      try {
        game.network.broker.hold = () => true
        game.guest.click('pause')
        const before = game.guest.game.inspect()
        expect(before.pendingStop).toBeDefined()
        game.guest.element('ready').disabled = false
        game.guest.click('ready')
        game.guest.dispatch('keydown', { code: 'KeyE', preventDefault: vi.fn() })
        game.guest.dispatch('keydown', { code: 'Digit1', preventDefault: vi.fn() })
        expect(game.guest.game.inspect().localReady).toBe(false)
        expect(game.guest.game.inspect().pendingStop).toEqual(before.pendingStop)
        expect(game.guest.game.inspect().soundAllowed).toBe(false)
        expect(game.guest.element('phase').textContent).toBe('中断要求中（主催の確認待ち）')
        game.network.broker.hold = undefined
        for (const packet of game.network.broker.pending.splice(0)) game.network.broker.deliver(packet)
        await game.flush()
        expect(game.host.game.inspect().snapshot.paused).toBe(true)
        expect(game.guest.game.inspect().pendingStop).toBeUndefined()
        expect(game.guest.game.inspect().localReady).toBe(false)
      } finally {
        game.close()
      }
    })
})

const boom = () => {
  throw new Error('injected output gain failure')
}
const faults = ['cancelScheduledValues', 'setValueAtTime'] as const
function inject(client: any, operation: string) {
  client.contexts.at(-1).gains[0].gain[operation].mockImplementation(boom)
}
async function playing(round: string, ambientRandom?: number) {
  const game = await pair(ambientRandom)
  await game.ready(1400)
  if (round === 'round2') {
    game.host.game.match.tick(900000)
    game.host.game.broadcast()
    await game.flush()
    await game.ready(1500)
  }
  expect(game.host.game.inspect().snapshot.phase).toBe(round)
  expect(game.guest.game.inspect().guestSnapshot.paused).toBe(false)
  return game
}
function stopped(game: any, client: any, context: any, track: any) {
  const host = game.host.game.inspect(),
    local = client.game.inspect()
  expect(host.snapshot.paused).toBe(true)
  expect(local.localReady).toBe(false)
  expect(local.remoteReady).toBe(false)
  expect(local.soundAllowed).toBe(false)
  expect(local.hasSound).toBe(false)
  expect(local.hasStream).toBe(false)
  expect(local.hasAudio).toBe(false)
  expect(track.stopCount).toBe(1)
  expect(context.closeCount).toBe(1)
  expect(context.sources.every((source: any) => source.onended === null)).toBe(true)
  expect(context.gains[0].disconnect).toHaveBeenCalledOnce()
  expect(client.element('notice').textContent).toContain('マイク')
}

function throwHealth(client: any, once = false, stage = 'context') {
  const getter = Object.getOwnPropertyDescriptor(HorrorWorld.prototype, 'isHealthy')!.get!
  let remaining = once ? 1 : Infinity
  const failure = () => {
    if (remaining-- > 0) throw new Error('injected health access failure')
    return false
  }
  const state = {
    disposed: false,
    contextLost: false,
    renderer: {
      getContext: () => {
        if (stage === 'renderer') failure()
        return { isContextLost: stage === 'context' ? failure : () => false }
      }
    }
  }
  const world = client.game.getWorld()
  Object.defineProperty(world, 'isHealthy', { configurable: true, get: () => getter.call(state) })
  return () => Object.defineProperty(world, 'isHealthy', { configurable: true, writable: true, value: true })
}

describe('health getter exception safety with actual main and offline peers', () => {
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2'])
      for (const once of [false, true])
        for (const stage of ['renderer', 'context']) {
          it(`${role}/${round}/${once ? 'once' : 'persistent'}/${stage} interrupts at frame start and requires fresh ready`, async () => {
            const game = await playing(round)
            try {
              await game.frames(game.clock.now)
              const client = game[role],
                other = game[role === 'host' ? 'guest' : 'host'],
                track = client.track,
                context = client.contexts.at(-1),
                generation = client.game.inspect().micGeneration,
                restore = throwHealth(client, once, stage),
                outputStop = vi.spyOn(client.game.getSound(), 'stop')
              game.network.broker.hold = (packet: any) =>
                packet.receiver === game.network.broker.sessions[role === 'host' ? 1 : 0]
              client.game.holdKey('KeyW')
              expect(() => client.frame()).not.toThrow()
              expect(client.game.inspect().interrupted).toBe(true)
              expect(client.game.inspect().soundAllowed).toBe(false)
              expect(client.game.inspect().keys).toEqual([])
              expect(outputStop).toHaveBeenCalled()
              expect(client.pendingFrames).toBe(1)
              expect(other.game.inspect().soundAllowed).toBe(true)
              expect(other.game.inspect().guestSnapshot.paused).toBe(false)
              if (role === 'host') expect(game.host.game.inspect().snapshot.paused).toBe(true)
              else expect(game.host.game.inspect().snapshot.paused).toBe(false)
              game.network.broker.hold = undefined
              for (const packet of game.network.broker.pending.splice(0)) game.network.broker.deliver(packet)
              await game.flush()
              expect(game.host.game.inspect().snapshot.paused).toBe(true)
              expect(other.game.inspect().soundAllowed).toBe(false)
              const paused = game.host.game.inspect()
              expect(client.game.inspect().hasStream).toBe(true)
              expect(client.game.inspect().hasAudio).toBe(true)
              expect(client.game.inspect().micGeneration).toBe(generation)
              expect(track.stopCount).toBe(0)
              expect(context.closeCount).toBe(0)
              if (!once) {
                for (let index = 0; index < 4; index++) {
                  expect(() => client.click('ready')).not.toThrow()
                  await game.frames(game.clock.now + 100)
                  expect(client.game.drawing()).toBe(false)
                  expect(client.game.inspect().localReady).toBe(false)
                  expect(client.pendingFrames).toBe(1)
                }
                expect(game.host.game.inspect().snapshot).toEqual(paused.snapshot)
                expect(game.host.game.inspect().epoch).toBe(paused.epoch)
              }
              restore()
              await game.frames(game.clock.now + 100)
              await game.health()
              await game.health()
              expect(client.game.drawing()).toBe(true)
              expect(game.host.game.inspect().localReady).toBe(false)
              expect(game.guest.game.inspect().localReady).toBe(false)
              other.click('ready')
              await game.flush()
              expect(game.host.game.inspect().snapshot.paused).toBe(true)
              client.click('ready')
              await game.flush()
              await game.health()
              expect(game.host.game.inspect().snapshot.paused).toBe(false)
            } finally {
              game.close()
            }
          })
        }

  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2'])
      for (const once of [false, true]) {
        it(`${role}/${round}/${once ? 'once' : 'persistent'} interrupts on post-render health check`, async () => {
          const game = await playing(round)
          try {
            const client = game[role],
              world = client.game.getWorld(),
              render = world.render
            let restore: (() => void) | undefined
            world.render = () => {
              render()
              if (!restore) restore = throwHealth(client, once)
            }
            expect(() => client.frame()).not.toThrow()
            expect(client.game.inspect().interrupted).toBe(true)
            expect(client.game.inspect().soundAllowed).toBe(false)
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            expect(client.game.inspect().localReady).toBe(false)
            expect(client.pendingFrames).toBe(1)
            restore!()
            world.render = render
            expect(client.game.drawing()).toBe(false)
            await game.frames(game.clock.now + 100)
            expect(client.game.drawing()).toBe(true)
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
          } finally {
            game.close()
          }
        })

        for (const entry of ['keydown', 'mousemove', 'ready', 'sound-preview'])
          it(`${role}/${round}/${once ? 'once' : 'persistent'} interrupts at ${entry} without a frame`, async () => {
            const game = await playing(round)
            try {
              const client = game[role],
                restore = throwHealth(client, once)
              const action = () =>
                entry === 'keydown' || entry === 'mousemove'
                  ? client.dispatch(entry, { code: 'KeyW', preventDefault() {}, movementX: 20, movementY: 20 })
                  : client.click(entry)
              expect(action).not.toThrow()
              expect(client.game.inspect().interrupted).toBe(true)
              expect(client.game.inspect().localReady).toBe(false)
              expect(client.game.inspect().soundAllowed).toBe(false)
              expect(client.game.inspect().keys).toEqual([])
              await game.flush()
              expect(game.host.game.inspect().snapshot.paused).toBe(true)
              restore()
              expect(client.game.drawing()).toBe(false)
            } finally {
              game.close()
            }
          })
      }
})

describe('health getter interruption boundaries', () => {
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2']) {
      for (const once of [false, true])
        it(`${role}/${round}/${once ? 'once' : 'persistent'} blocks lobby/intermission preparation until redraw`, async () => {
          const game = await pair()
          try {
            if (round === 'round2') {
              await game.ready(1400)
              game.host.game.match.tick(900000)
              game.host.game.broadcast()
              await game.flush()
            }
            await game.frames(game.clock.now)
            const client = game[role],
              other = game[role === 'host' ? 'guest' : 'host'],
              restore = throwHealth(client, once)
            expect(() => client.click('ready')).not.toThrow()
            await game.flush()
            expect(client.game.inspect().localReady).toBe(false)
            expect(client.element('ready').disabled).toBe(true)
            expect(client.game.drawing()).toBe(false)
            other.click('ready')
            await game.flush()
            expect(game.host.game.inspect().snapshot.phase).toBe(round === 'round1' ? 'lobby' : 'intermission')
            if (!once) {
              await game.frames(game.clock.now + 100)
              expect(client.game.drawing()).toBe(false)
            }
            restore()
            expect(client.game.drawing()).toBe(false)
            await game.frames(game.clock.now + 100)
            await game.health()
            await game.health()
            expect(game.host.game.inspect().localReady).toBe(false)
            expect(game.guest.game.inspect().localReady).toBe(false)
            await game.ready(game.clock.now)
            expect(game.host.game.inspect().snapshot.phase).toBe(round)
          } finally {
            game.close()
          }
        })

      it(`${role}/${round} also latches one throwing health read during sound synchronization`, async () => {
        const game = await playing(round)
        try {
          const client = game[role],
            restore = throwHealth(client, true)
          expect(() => client.game.syncSound()).not.toThrow()
          expect(client.game.inspect().soundAllowed).toBe(false)
          await game.flush()
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          expect(client.game.drawing()).toBe(false)
          restore()
          await game.frames(game.clock.now + 100)
          expect(client.game.drawing()).toBe(true)
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} does not observe or interrupt drawing after finish starts`, async () => {
        const game = await playing(round)
        try {
          const client = game[role],
            world = client.game.getWorld(),
            before = client.game.inspect(),
            context = client.contexts.at(-1),
            track = client.track
          throwHealth(client)
          const original = Object.getOwnPropertyDescriptor(world, 'isHealthy')!.get!
          const getter = vi.fn(original)
          Object.defineProperty(world, 'isHealthy', { configurable: true, get: getter })
          expect(() => client.game.finish()).not.toThrow()
          expect(getter).not.toHaveBeenCalled()
          expect(client.game.inspect().epoch).toBe(before.epoch)
          expect(client.game.inspect().snapshot).toEqual(before.snapshot)
          expect(client.game.inspect().finished).toBe(true)
          expect(track.stopCount).toBe(1)
          expect(context.closeCount).toBe(1)
          client.frame()
          expect(client.pendingFrames).toBe(0)
        } finally {
          game.close()
        }
      })

      for (const termination of ['finish', 'pagehide'])
        it(`${role}/${round}/${termination} stops capture and RAF during persistent getter failure`, async () => {
          const game = await playing(round)
          try {
            const client = game[role],
              context = client.contexts.at(-1),
              track = client.track
            throwHealth(client)
            expect(() => client.frame()).not.toThrow()
            await game.flush()
            expect(client.pendingFrames).toBe(1)
            expect(() => (termination === 'finish' ? client.game.finish() : client.dispatch('pagehide'))).not.toThrow()
            const scheduled = client.scheduledFrames,
              endedAt = game.clock.now
            client.frame()
            expect(client.pendingFrames).toBe(0)
            expect(client.scheduledFrames).toBe(scheduled)
            expect(client.game.inspect().finished).toBe(true)
            expect(client.track.readyState).toBe('ended')
            expect(track.stopCount).toBe(1)
            expect(context.closeCount).toBe(1)
            if (termination === 'finish') {
              game.clock.now = endedAt + 5999
              client.timers()
              expect(client.game.inspect().peerStatus).not.toBe('closed')
              game.clock.now = endedAt + 6000
              client.timers()
              await game.flush()
              expect(client.game.inspect().peerStatus).toBe('closed')
            }
          } finally {
            game.close()
          }
        })

      it(`${role}/${round} keeps visibility interruption until visible redraw`, async () => {
        const game = await playing(round)
        try {
          const client = game[role],
            restore = throwHealth(client)
          expect(() => client.frame()).not.toThrow()
          await game.flush()
          client.document.hidden = true
          expect(() => client.dispatch('visibilitychange')).not.toThrow()
          await game.flush()
          expect(client.game.inspect().soundAllowed).toBe(false)
          restore()
          await game.frames(game.clock.now + 100)
          expect(client.game.drawing()).toBe(false)
          client.click('ready')
          expect(client.game.inspect().localReady).toBe(false)
          client.document.hidden = false
          expect(() => client.dispatch('visibilitychange')).not.toThrow()
          expect(client.game.drawing()).toBe(false)
          await game.frames(game.clock.now + 100)
          expect(client.game.drawing()).toBe(true)
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
        } finally {
          game.close()
        }
      })

      for (const unconfirmed of [false, true])
        it(`${role}/${round}/unconfirmed=${unconfirmed} preserves compound output/capture shutdown`, async () => {
          const game = await playing(round)
          try {
            await game.frames(game.clock.now)
            const client = game[role],
              context = client.contexts.at(-1),
              track = client.track,
              generation = client.game.inspect().micGeneration,
              restore = throwHealth(client)
            if (unconfirmed)
              track.stop = vi.fn(() => {
                throw new Error('injected unconfirmed capture stop')
              })
            inject(client, 'cancelScheduledValues')
            expect(() => client.frame()).not.toThrow()
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            expect(client.game.inspect().soundAllowed).toBe(false)
            expect(client.game.inspect().hasSound).toBe(false)
            expect(client.game.inspect().hasAudio).toBe(false)
            expect(client.game.inspect().hasStream).toBe(false)
            expect(client.game.inspect().micGeneration).toBeGreaterThan(generation)
            expect(context.closeCount).toBe(1)
            if (unconfirmed) {
              expect(track.readyState).toBe('live')
              expect(client.element('microphone').disabled).toBe(true)
              expect(client.element('notice').textContent).toContain('停止を保証できません')
            } else stopped(game, client, context, track)
            const after = client.game.inspect().micGeneration
            for (let index = 0; index < 3; index++) await game.frames(game.clock.now + 100)
            expect(client.pendingFrames).toBe(1)
            expect(client.game.inspect().micGeneration).toBe(after)
            expect(context.closeCount).toBe(1)
            restore()
            await game.frames(game.clock.now + 100)
            client.click('ready')
            expect(client.game.inspect().localReady).toBe(false)
            if (unconfirmed) {
              const streams = client.streams.length
              await client.click('microphone')
              expect(client.streams.length).toBe(streams)
              track.readyState = 'ended'
            }
          } finally {
            game.close()
          }
        })
    }

  for (const round of ['round1', 'round2'])
    it(`guest/${round} retries the identical getter stop through dropped request and ACK`, async () => {
      const game = await playing(round)
      try {
        const client = game.guest,
          packets: any[] = [],
          restore = throwHealth(client)
        client.game.setSendHook((packet: any) => packets.push(packet))
        game.network.broker.drop = (packet: any) => packet.frame.value?.type === 'stop'
        expect(() => client.frame()).not.toThrow()
        await game.flush()
        const pending = { ...client.game.inspect().pendingStop }
        expect(pending.requestId).toBeDefined()
        for (let index = 0; index < 3; index++) await game.frames(game.clock.now + 100)
        expect(client.game.drawing()).toBe(false)
        expect(client.game.inspect().pendingStop).toEqual(pending)
        restore()
        await game.frames(game.clock.now + 100)
        expect(client.game.drawing()).toBe(false)
        game.network.broker.drop = (packet: any) =>
          packet.frame.value?.type === 'state' && packet.frame.value.snapshot.paused
        await game.frames(game.clock.now + 100)
        expect(game.host.game.inspect().snapshot.paused).toBe(true)
        expect(client.game.inspect().pendingStop).toEqual(pending)
        expect(client.game.drawing()).toBe(false)
        const stops = packets.filter((packet) => packet.type === 'stop')
        expect(stops.length).toBeGreaterThan(3)
        expect(stops.every((packet) => packet.requestId === pending.requestId && packet.epoch === pending.epoch)).toBe(
          true
        )
        game.network.broker.drop = undefined
        await game.frames(game.clock.now + 100)
        await game.frames(game.clock.now + 100)
        expect(client.game.inspect().pendingStop).toBeUndefined()
        expect(client.game.drawing()).toBe(true)
        expect(game.host.game.inspect().snapshot.paused).toBe(true)
        expect(game.host.game.inspect().localReady).toBe(false)
        expect(game.guest.game.inspect().localReady).toBe(false)
        await game.ready(game.clock.now)
      } finally {
        game.close()
      }
    })
})

describe('renderer exception safety with actual main and offline peers', () => {
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2']) {
      it(`${role}/${round} stays interrupted until successful rendering and both fresh ready messages`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role],
            other = game[role === 'host' ? 'guest' : 'host'],
            world = client.game.getWorld(),
            render = world.render,
            packets: any[] = []
          client.game.setSendHook((packet: any) => packets.push(packet))
          for (let incident = 0; incident < 2; incident++) {
            world.render = vi.fn(() => {
              if (incident === 1) throw undefined
              throw new Error('injected renderer failure, not an audio or context-loss diagnosis')
            })
            await game.frames(game.clock.now + 100)
            const paused = game.host.game.inspect(),
              pitch = client.game.inspect().pitch,
              epoch = paused.epoch,
              start = packets.length
            expect(paused.snapshot.paused).toBe(true)
            expect(game.guest.game.inspect().guestSnapshot.paused).toBe(true)
            expect(client.game.drawing()).toBe(false)
            expect(client.element('ready').disabled).toBe(true)
            expect(client.game.inspect().soundAllowed).toBe(false)
            expect(client.game.getSound().isPreviewing).toBe(false)
            expect(client.element('notice').textContent).not.toContain('injected')
            expect(client.element('notice').textContent).not.toContain('音声エラー')
            for (let index = 0; index < 8; index++) {
              world.isHealthy = true
              client.game.holdKey('ArrowUp')
              client.game.holdKey('ArrowRight')
              client.game.holdKey('KeyW')
              client.click('ready')
              other.click('ready')
              await game.frames(game.clock.now + 100)
              expect(client.game.drawing()).toBe(false)
              expect(client.game.inspect().localReady).toBe(false)
              expect(client.game.inspect().pitch).toBe(pitch)
              expect(client.pendingFrames).toBe(1)
            }
            const after = game.host.game.inspect(),
              repeated = packets.slice(start)
            expect(after.snapshot).toEqual(paused.snapshot)
            expect(after.human).toEqual(paused.human)
            expect(after.haunter).toEqual(paused.haunter)
            expect(after.epoch).toBe(epoch)
            expect(world.render).toHaveBeenCalledTimes(9)
            expect(repeated.filter((packet) => packet.type === 'input')).toEqual([])
            expect(repeated.filter((packet) => packet.type === 'ready')).toEqual([])
            expect(repeated.filter((packet) => packet.type === 'stop')).toEqual([])
            expect(repeated.filter((packet) => packet.type === 'health').length).toBeLessThanOrEqual(16)
            expect(repeated.filter((packet) => packet.type === 'health').every((packet) => !packet.playing)).toBe(true)
            world.render = render
            expect(client.game.drawing()).toBe(false)
            await game.frames(game.clock.now + 100)
            await game.health()
            await game.health()
            expect(client.game.drawing()).toBe(true)
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            expect(game.host.game.inspect().localReady).toBe(false)
            expect(game.guest.game.inspect().localReady).toBe(false)
            for (const endpoint of [game.host, game.guest]) {
              endpoint.game.holdKey('ArrowUp', false)
              endpoint.game.holdKey('ArrowRight', false)
              endpoint.game.holdKey('KeyW', false)
            }
            other.click('ready')
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            client.click('ready')
            await game.flush()
            await game.health()
            expect(game.host.game.inspect().snapshot.paused).toBe(false)
            await game.frames(game.clock.now + 100)
            expect(game.host.game.inspect().snapshot.elapsedMs).toBeGreaterThan(paused.snapshot.elapsedMs)
          }
        } finally {
          game.close()
        }
      })
    }
})

describe('renderer interruption boundaries', () => {
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2']) {
      it(`${role}/${round} does not restore lost drawing on health or a throwing render`, async () => {
        const game = await playing(round)
        try {
          const client = game[role],
            world = client.game.getWorld(),
            render = world.render
          world.isHealthy = false
          expect(client.game.drawing()).toBe(false)
          await game.flush()
          const paused = game.host.game.inspect()
          await game.frames(game.clock.now + 100)
          expect(client.game.drawing()).toBe(false)
          world.isHealthy = true
          expect(client.game.drawing()).toBe(false)
          world.render = () => {
            throw new Error('render still unavailable after context restoration')
          }
          await game.frames(game.clock.now + 100)
          expect(game.host.game.inspect().epoch).toBe(paused.epoch)
          expect(game.host.game.inspect().snapshot).toEqual(paused.snapshot)
          world.render = render
          await game.frames(game.clock.now + 100)
          expect(client.game.drawing()).toBe(true)
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          expect(game.host.game.inspect().localReady).toBe(false)
          expect(game.guest.game.inspect().localReady).toBe(false)
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} keeps capture shutdown safe when renderer interruption also fails to stop sound`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role],
            context = client.contexts.at(-1),
            track = client.track,
            render = vi.fn(() => {
              throw new Error('injected renderer failure')
            })
          client.game.getWorld().render = render
          inject(client, 'cancelScheduledValues')
          await game.frames(game.clock.now + 100)
          stopped(game, client, context, track)
          expect(track.readyState).toBe('ended')
          const paused = game.host.game.inspect().snapshot
          for (let index = 0; index < 3; index++) await game.frames(game.clock.now + 100)
          expect(render).toHaveBeenCalledTimes(4)
          expect(game.host.game.inspect().snapshot).toEqual(paused)
          expect(track.stopCount).toBe(1)
          expect(context.closeCount).toBe(1)
          expect(client.pendingFrames).toBe(1)
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} blocks preparation before a successful render outside active play`, async () => {
        const game = await pair()
        try {
          if (round === 'round2') {
            await game.ready(1400)
            game.host.game.match.tick(900000)
            game.host.game.broadcast()
            await game.flush()
          }
          await game.frames(game.clock.now)
          const client = game[role],
            world = client.game.getWorld(),
            render = world.render
          world.render = () => {
            throw new Error('injected preparation renderer failure')
          }
          await game.frames(game.clock.now + 100)
          expect(client.game.drawing()).toBe(false)
          game.host.click('ready')
          game.guest.click('ready')
          await game.flush()
          expect(client.game.inspect().localReady).toBe(false)
          expect(game.host.game.inspect().snapshot.phase).toBe(round === 'round1' ? 'lobby' : 'intermission')
          world.render = render
          await game.frames(game.clock.now + 100)
          expect(game.host.game.inspect().localReady).toBe(false)
          expect(game.guest.game.inspect().localReady).toBe(false)
          await game.ready(game.clock.now)
          expect(game.host.game.inspect().snapshot.phase).toBe(round)
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} stops renderer retries at finish and retains the six-second ACK grace`, async () => {
        const game = await playing(round)
        try {
          const client = game[role],
            track = client.track,
            context = client.contexts.at(-1),
            render = vi.fn(() => {
              throw new Error('injected renderer failure before finish')
            })
          client.game.getWorld().render = render
          await game.frames(game.clock.now + 100)
          expect(client.pendingFrames).toBe(1)
          client.game.finish()
          const scheduled = client.scheduledFrames,
            endedAt = game.clock.now
          client.frame()
          expect(render).toHaveBeenCalledOnce()
          expect(client.pendingFrames).toBe(0)
          expect(client.scheduledFrames).toBe(scheduled)
          expect(track.readyState).toBe('ended')
          expect(track.stopCount).toBe(1)
          expect(context.closeCount).toBe(1)
          game.clock.now = endedAt + 5999
          client.timers()
          expect(client.game.inspect().peerStatus).not.toBe('closed')
          game.clock.now = endedAt + 6000
          client.timers()
          await game.flush()
          expect(client.game.inspect().peerStatus).toBe('closed')
        } finally {
          game.close()
        }
      })
    }

  for (const round of ['round1', 'round2'])
    it(`guest/${round} retries one stop until ACK without treating successful rendering as recovery early`, async () => {
      const game = await playing(round)
      try {
        const client = game.guest,
          world = client.game.getWorld(),
          render = world.render,
          packets: any[] = []
        client.game.setSendHook((packet: any) => packets.push(packet))
        game.network.broker.drop = (packet: any) => packet.frame.value?.type === 'stop'
        world.render = () => {
          throw new Error('injected renderer failure with dropped stop')
        }
        await game.frames(game.clock.now + 100)
        const pending = { ...client.game.inspect().pendingStop }
        expect(pending.requestId).toBeDefined()
        await game.frames(game.clock.now + 100)
        world.render = render
        await game.frames(game.clock.now + 100)
        expect(client.game.drawing()).toBe(false)
        expect(client.game.inspect().pendingStop).toEqual(pending)
        client.click('ready')
        expect(client.game.inspect().localReady).toBe(false)
        game.network.broker.drop = (packet: any) =>
          packet.frame.value?.type === 'state' && packet.frame.value.snapshot.paused
        await game.frames(game.clock.now + 100)
        expect(game.host.game.inspect().snapshot.paused).toBe(true)
        expect(client.game.inspect().pendingStop).toEqual(pending)
        expect(client.game.drawing()).toBe(false)
        const stops = packets.filter((packet) => packet.type === 'stop')
        expect(stops.length).toBeGreaterThan(1)
        expect(stops.every((packet) => packet.requestId === pending.requestId && packet.epoch === pending.epoch)).toBe(
          true
        )
        game.network.broker.drop = undefined
        await game.frames(game.clock.now + 100)
        await game.frames(game.clock.now + 100)
        expect(client.game.inspect().pendingStop).toBeUndefined()
        expect(client.game.drawing()).toBe(true)
        expect(game.host.game.inspect().snapshot.paused).toBe(true)
        expect(game.host.game.inspect().localReady).toBe(false)
        expect(client.game.inspect().localReady).toBe(false)
      } finally {
        game.close()
      }
    })
})

async function dueAmbient(game: any, client: any) {
  const [id, item] = client.ambientTimers()[0]
  while (game.clock.now + 100 < item.at) await game.frames(game.clock.now + 100)
  await game.frames(item.at - 1)
  return { id, callback: item.callback }
}
function injectAmbient(client: any, fault: string) {
  const context = client.contexts.at(-1)
  const fail = () => {
    throw new Error('injected ambient ' + fault)
  }
  client.setRandom(fault.startsWith('noise') ? 0.1 : 0.4)
  if (fault === 'oscillator') vi.spyOn(context, 'createOscillator').mockImplementation(fail)
  else if (fault === 'noise-source') vi.spyOn(context, 'createBufferSource').mockImplementation(fail)
  else if (fault === 'noise-filter') vi.spyOn(context, 'createBiquadFilter').mockImplementation(fail)
  else if (fault === 'gain') vi.spyOn(context, 'createGain').mockImplementation(fail)
  else if (fault === 'panner') vi.spyOn(context, 'createStereoPanner').mockImplementation(fail)
  else if (fault === 'reschedule') client.failAmbientSchedule()
  else {
    const source = context.source.bind(context)
    vi.spyOn(context, 'source').mockImplementation(() => {
      const result = source()
      if (fault === 'frequency') result.frequency.exponentialRampToValueAtTime.mockImplementation(fail)
      else result[fault].mockImplementation(fail)
      return result
    })
  }
}

describe('ambient timer safety with actual main, sound and offline peers', () => {
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2']) {
      it.each([
        'oscillator',
        'noise-source',
        'noise-filter',
        'gain',
        'panner',
        'start',
        'stop',
        'frequency',
        'reschedule'
      ])(
        role + '/' + round + '/%s releases all capture, freezes play and requires both fresh ready messages',
        async (fault) => {
          const game = await playing(round, 0.4)
          try {
            const client = game[role],
              context = client.contexts.at(-1),
              track = client.track,
              output = client.game.getSound()
            const extraTrack = client.createMedia().track
            client.streams[0].getTracks = () => [track, extraTrack]
            const timer = await dueAmbient(game, client)
            const sent: any[] = []
            client.game.setSendHook((value: any) => sent.push(value))
            injectAmbient(client, fault)
            expect(() => client.fireTimer(timer.id)).not.toThrow()
            await game.flush()
            stopped(game, client, context, track)
            expect(track.readyState).toBe('ended')
            expect(extraTrack.readyState).toBe('ended')
            expect(extraTrack.stopCount).toBe(1)
            expect(context.state).toBe('closed')
            expect(context.listeners.size).toBe(0)
            expect(output.started).toBe(false)
            expect(output.disposed).toBe(true)
            expect(output.voices.size).toBe(0)
            for (const node of [...context.sources, ...context.gains.slice(1), ...context.filters, ...context.panners])
              expect(node.disconnect).toHaveBeenCalledOnce()
            expect(sent.some((value) => value.type === 'health' && value.mic === false)).toBe(true)
            if (role === 'guest') expect(sent.some((value) => value.type === 'stop')).toBe(true)
            expect(client.ambientTimers()).toHaveLength(0)
            expect(game.guest.game.inspect().pendingStop).toBeUndefined()
            expect(game.guest.game.inspect().guestSnapshot.paused).toBe(true)
            const paused = game.host.game.inspect()
            expect(() => timer.callback()).not.toThrow()
            client.game.holdKey('KeyW')
            await game.frames(game.clock.now + 100)
            await game.frames(game.clock.now + 100)
            const frozen = game.host.game.inspect()
            expect(frozen.snapshot.elapsedMs).toBe(paused.snapshot.elapsedMs)
            expect(frozen.snapshot.scores).toEqual(paused.snapshot.scores)
            expect(frozen.human).toEqual(paused.human)
            expect(frozen.haunter).toEqual(paused.haunter)
            vi.restoreAllMocks()
            game.host.click('ready')
            game.guest.click('ready')
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            await client.click('microphone')
            await game.health()
            await game.health()
            game.host.click('ready')
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            game.guest.click('ready')
            await game.flush()
            await game.health()
            expect(game.host.game.inspect().snapshot.paused).toBe(false)
            const nextSound = client.game.getSound()
            expect(nextSound).not.toBe(output)
            expect(() => timer.callback()).not.toThrow()
            expect(client.game.getSound()).toBe(nextSound)
            expect(client.track.readyState).toBe('live')
            expect(client.contexts.at(-1).closeCount).toBe(0)
            await game.frames(game.clock.now + 100)
            expect(game.host.game.inspect().snapshot.elapsedMs).toBeGreaterThan(paused.snapshot.elapsedMs)
          } finally {
            vi.restoreAllMocks()
            game.close()
          }
        }
      )

      it.each(['release', 'restart'])(
        role + '/' + round + ' reentrant %s cannot reschedule an old generation',
        async (action) => {
          const game = await playing(round, 0.4)
          try {
            const client = game[role],
              context = client.contexts.at(-1),
              output = client.game.getSound()
            const timer = await dueAmbient(game, client)
            client.setRandom(0.4)
            const source = context.source.bind(context)
            vi.spyOn(context, 'source').mockImplementationOnce(() => {
              const result = source()
              result.start.mockImplementationOnce(() => {
                if (action === 'release') client.game.release()
                else {
                  output.stop()
                  output.start()
                }
              })
              return result
            })
            expect(() => client.fireTimer(timer.id)).not.toThrow()
            await game.flush()
            expect(client.ambientTimers()).toHaveLength(action === 'release' ? 0 : 1)
            const count = context.sources.length
            timer.callback()
            expect(context.sources).toHaveLength(count)
            expect(client.ambientTimers()).toHaveLength(action === 'release' ? 0 : 1)
            if (action === 'release') {
              expect(context.closeCount).toBe(1)
              expect(output.voices.size).toBe(0)
            }
          } finally {
            vi.restoreAllMocks()
            game.close()
          }
        }
      )

      it(role + '/' + round + ' ignores an old in-flight failure during microphone reconnection', async () => {
        const game = await playing(round, 0.4)
        try {
          const client = game[role],
            context = client.contexts.at(-1),
            output = client.game.getSound()
          const timer = await dueAmbient(game, client)
          client.setRandom(0.4)
          vi.spyOn(context, 'createOscillator').mockImplementationOnce(() => {
            client.game.release()
            void client.click('microphone')
            throw new Error('stale in-flight oscillator failure')
          })
          expect(() => client.fireTimer(timer.id)).not.toThrow()
          await game.flush()
          const next = client.game.getSound()
          expect(next).toBeDefined()
          expect(next).not.toBe(output)
          expect(client.track.readyState).toBe('live')
          expect(client.contexts.at(-1).closeCount).toBe(0)
          expect(context.closeCount).toBe(1)
          expect(client.game.inspect().notice).not.toContain('音声エラー')
          timer.callback()
          expect(client.game.getSound()).toBe(next)
        } finally {
          vi.restoreAllMocks()
          game.close()
        }
      })

      it(role + '/' + round + ' releases capture even when the shutdown gain also throws', async () => {
        const game = await playing(round, 0.4)
        try {
          const client = game[role],
            context = client.contexts.at(-1),
            track = client.track
          const timer = await dueAmbient(game, client)
          injectAmbient(client, 'oscillator')
          inject(client, 'cancelScheduledValues')
          expect(() => client.fireTimer(timer.id)).not.toThrow()
          await game.flush()
          stopped(game, client, context, track)
        } finally {
          vi.restoreAllMocks()
          game.close()
        }
      })

      it(role + '/' + round + ' preserves healthy ambience and ignores callbacks after finish', async () => {
        const game = await playing(round, 0.4)
        try {
          const client = game[role],
            context = client.contexts.at(-1)
          const timer = await dueAmbient(game, client)
          expect(() => client.fireTimer(timer.id)).not.toThrow()
          expect(context.sources.length).toBeGreaterThan(0)
          expect(client.ambientTimers()).toHaveLength(1)
          expect(game.host.game.inspect().snapshot.paused).toBe(false)
          const count = context.sources.length
          client.game.finish()
          const final = client.game.inspect()
          timer.callback()
          expect(client.game.inspect()).toEqual(final)
          expect(context.sources).toHaveLength(count)
          expect(context.closeCount).toBe(1)
          expect(client.ambientTimers()).toHaveLength(0)
        } finally {
          game.close()
        }
      })
    }

  it.each(['round1', 'round2'])(
    'guest/%s retries dropped stop and paused state until acknowledgement',
    async (round) => {
      const game = await playing(round, 0.4)
      try {
        const client = game.guest,
          context = client.contexts.at(-1),
          track = client.track
        const timer = await dueAmbient(game, client)
        let stopDrops = 0,
          stateDrops = 0
        game.network.broker.drop = (packet: any) => {
          if (packet.frame.value?.type === 'stop') {
            stopDrops++
            return true
          }
          return false
        }
        injectAmbient(client, 'oscillator')
        expect(() => client.fireTimer(timer.id)).not.toThrow()
        await game.flush()
        expect(track.stopCount).toBe(1)
        expect(context.closeCount).toBe(1)
        expect(client.game.inspect().pendingStop).toBeDefined()
        await game.frames(game.clock.now + 100)
        expect(stopDrops).toBeGreaterThan(1)
        game.network.broker.drop = (packet: any) => {
          if (packet.frame.value?.type === 'state' && packet.frame.value.snapshot.paused) {
            stateDrops++
            return true
          }
          return false
        }
        await game.frames(game.clock.now + 100)
        expect(game.host.game.inspect().snapshot.paused).toBe(true)
        expect(client.game.inspect().pendingStop).toBeDefined()
        expect(stateDrops).toBeGreaterThan(0)
        game.network.broker.drop = undefined
        await game.frames(game.clock.now + 100)
        await game.frames(game.clock.now + 100)
        stopped(game, client, context, track)
        expect(client.game.inspect().pendingStop).toBeUndefined()
      } finally {
        vi.restoreAllMocks()
        game.close()
      }
    }
  )
})

const inputFaults = ['throw', 'unsupported-rate', 'nan-extracted', 'infinite-extracted'] as const
function injectInput(client: any, fault: (typeof inputFaults)[number]) {
  const context = client.contexts.at(-1)
  context.sampleRate = fault === 'unsupported-rate' ? 384000 : 48000
  const read = vi.fn((samples: Float32Array) => {
    if (fault === 'throw') throw new Error('injected analyser read')
    samples.fill(0)
    if (fault === 'nan-extracted') samples[8189] = NaN
    if (fault === 'infinite-extracted') samples[8189] = Infinity
  })
  context.analyser.getFloatTimeDomainData = read
  return read
}
async function inputFrozen(game: any) {
  const before = game.host.game.inspect()
  expect(before.snapshot.paused).toBe(true)
  for (let index = 0; index < 3; index++) await game.frames(game.clock.now + 100)
  const after = game.host.game.inspect()
  expect(after.snapshot).toEqual(before.snapshot)
  expect(after.human).toEqual(before.human)
  expect(after.haunter).toEqual(before.haunter)
}

describe('analyser safety with actual main and offline peers', () => {
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2']) {
      it.each(inputFaults)(
        role + '/' + round + ' stops %s and requires fresh microphones and readiness',
        async (fault) => {
          const game = await playing(round)
          try {
            for (let index = 0; index < 7; index++) await game.frames(game.clock.now + 100)
            const client = game[role],
              context = client.contexts.at(-1),
              track = client.track,
              before = game.host.game.inspect()
            expect(before.snapshot.scores[before.snapshot.survivor]).toBeLessThan(0)
            const oldEpochs = { host: game.host.game.inspect().epoch, guest: game.guest.game.inspect().epoch }
            const packets: any[] = []
            client.game.setSendHook((packet: any) => packets.push(packet))
            client.game.holdKey('KeyW')
            const read = injectInput(client, fault)
            expect(() => client.frame()).not.toThrow()
            await game.flush()
            stopped(game, client, context, track)
            expect(read).toHaveBeenCalledOnce()
            expect(track.readyState).toBe('ended')
            expect(client.hasFrame).toBe(true)
            expect(client.game.inspect().keys).toEqual([])
            expect(client.game.inspect().localRms).toBe(0)
            expect(client.game.inspect().localVoiced).toBe(false)
            expect(client.element('ready').disabled).toBe(true)
            expect(client.element('notice').textContent).toContain('音声エラー')
            expect(client.element('mic-status').textContent).toContain('再準備')
            expect(packets.some((packet) => packet.type === 'health' && packet.mic === false)).toBe(true)
            if (role === 'guest') expect(packets.some((packet) => packet.type === 'stop')).toBe(true)
            expect(game.host.game.inspect().snapshot.elapsedMs).toBe(before.snapshot.elapsedMs)
            expect(game.host.game.inspect().snapshot.scores).toEqual(before.snapshot.scores)
            await inputFrozen(game)
            for (const side of ['host', 'guest'] as const)
              game[side].game.send({ type: 'ready', value: true, epoch: oldEpochs[side], threshold: 0.1 })
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            await client.click('microphone')
            await game.health()
            await game.health()
            expect(client.track).not.toBe(track)
            expect(client.track.readyState).toBe('live')
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            for (const side of ['host', 'guest'] as const)
              game[side].game.send({ type: 'ready', value: true, epoch: oldEpochs[side], threshold: 0.1 })
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            game.host.click('ready')
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            game.guest.click('ready')
            await game.flush()
            await game.health()
            expect(game.host.game.inspect().snapshot.paused).toBe(false)
            await game.frames(game.clock.now + 100)
            expect(game.host.game.inspect().snapshot.elapsedMs).toBeGreaterThan(before.snapshot.elapsedMs)
          } finally {
            game.close()
          }
        }
      )

      for (const fault of inputFaults)
        it.each(['unprepared', 'preparing'])(role + '/' + round + '/' + fault + ' releases %s input', async (stage) => {
          const game = await pair()
          try {
            if (round === 'round2') {
              await game.ready(1400)
              game.host.game.match.tick(900000)
              game.host.game.broadcast()
              await game.flush()
            }
            const client = game[role],
              context = client.contexts.at(-1),
              track = client.track,
              before = game.host.game.inspect().snapshot
            if (stage === 'preparing') {
              client.click('ready')
              await game.flush()
              expect(client.game.inspect().localReady).toBe(true)
            }
            injectInput(client, fault)
            expect(() => client.frame()).not.toThrow()
            await game.flush()
            expect(track.readyState).toBe('ended')
            expect(track.stopCount).toBe(1)
            expect(context.closeCount).toBe(1)
            expect(client.hasFrame).toBe(true)
            expect(client.game.inspect().hasStream).toBe(false)
            expect(client.game.inspect().hasAudio).toBe(false)
            expect(client.game.inspect().localReady).toBe(false)
            expect(client.game.inspect().remoteReady).toBe(false)
            expect(client.element('ready').disabled).toBe(true)
            expect(client.element('notice').textContent).toContain('音声エラー')
            await game.frames(game.clock.now + 100)
            expect(game.host.game.inspect().snapshot.phase).toBe(before.phase)
            expect(game.host.game.inspect().snapshot.elapsedMs).toBe(before.elapsedMs)
            expect(game.host.game.inspect().snapshot.scores).toEqual(before.scores)
          } finally {
            game.close()
          }
        })

      it.each([
        'track-live-throw',
        'track-live-return',
        'track-ended-throw',
        'output-dispose',
        'audio-close',
        'stop-reentry'
      ])(role + '/' + round + ' preserves shutdown guards for %s', async (shutdown) => {
        const game = await playing(round)
        try {
          const client = game[role],
            context = client.contexts.at(-1),
            track = client.track
          if (shutdown === 'track-live-throw') track.stop = vi.fn(boom)
          if (shutdown === 'track-live-return') track.stop = vi.fn()
          if (shutdown === 'track-ended-throw')
            track.stop = vi.fn(() => {
              track.readyState = 'ended'
              boom()
            })
          if (shutdown === 'output-dispose') {
            client.game.getSound().dispose = vi.fn(boom)
            client.game.getSound().stop = vi.fn(boom)
          }
          if (shutdown === 'audio-close') {
            context.close = vi.fn(async () => {
              throw new Error('injected close')
            })
            context.suspend = vi.fn(async () => {
              throw new Error('injected suspend')
            })
          }
          if (shutdown === 'stop-reentry')
            client.game.setSendHook((packet: any) => {
              if (packet.type === 'health' && packet.mic === false) client.game.release()
            })
          const read = injectInput(client, 'throw')
          expect(() => client.frame()).not.toThrow()
          await game.flush()
          expect(read).toHaveBeenCalledOnce()
          expect(client.hasFrame).toBe(true)
          expect(client.game.inspect().hasStream).toBe(false)
          expect(client.game.inspect().hasAudio).toBe(false)
          expect(client.game.inspect().hasSound).toBe(false)
          expect(client.game.inspect().soundAllowed).toBe(false)
          if (shutdown.startsWith('track-live')) await locked(game, client)
          else if (shutdown === 'audio-close') {
            const permission = vi.fn(async () => client.createMedia())
            client.setPermission(permission)
            await client.click('microphone')
            game.host.click('ready')
            game.guest.click('ready')
            await game.health()
            expect(permission).not.toHaveBeenCalled()
            expect(context.close).toHaveBeenCalledOnce()
            expect(context.suspend).toHaveBeenCalledOnce()
            expect(client.element('microphone').disabled).toBe(true)
            expect(client.element('ready').disabled).toBe(true)
            expect(client.element('notice').textContent).toContain('音声を停止できません')
          } else {
            expect(track.readyState).toBe('ended')
            expect(context.closeCount).toBe(1)
          }
          await inputFrozen(game)
        } finally {
          game.close()
        }
      })

      it.each([8000, 44100, 48000, 192000, 'silence', 'nan-unextracted'])(
        role + '/' + round + ' preserves valid input %s and scoring',
        async (input) => {
          const game = await playing(round)
          try {
            const client = game[role],
              context = client.contexts.at(-1),
              track = client.track
            context.sampleRate = typeof input === 'number' ? input : 48000
            context.analyser.getFloatTimeDomainData = (samples: Float32Array) => {
              for (let index = 0; index < samples.length; index++)
                samples[index] =
                  input === 'silence' ? 0 : 0.2 * Math.sin((2 * Math.PI * 220 * index) / context.sampleRate)
              if (input === 'nan-unextracted') samples[8191] = NaN
            }
            const before = game.host.game.inspect().snapshot
            const packets: any[] = []
            client.game.setSendHook((packet: any) => packets.push(packet))
            for (let index = 0; index < 7; index++) await game.frames(game.clock.now + 100)
            const after = game.host.game.inspect().snapshot
            expect(after.phase).toBe(round)
            expect(after.paused).toBe(false)
            expect(after.elapsedMs - before.elapsedMs).toBe(700)
            if (input === 'silence' && role === after.survivor) expect(after.scores).toEqual(before.scores)
            else expect(after.scores[after.survivor]).toBeLessThan(before.scores[before.survivor])
            expect(after.scores[after.survivor]).toBeCloseTo(
              before.scores[before.survivor] -
                (input === 'silence' && role === after.survivor ? 0 : 0.7 * 0.2 * Math.SQRT1_2),
              3
            )
            expect(client.game.inspect().localVoiced).toBe(input !== 'silence')
            expect(client.game.inspect().localRms).toBeCloseTo(input === 'silence' ? 0 : Math.SQRT1_2 * 0.2, 2)
            expect(client.game.inspect().hasStream).toBe(true)
            expect(client.hasFrame).toBe(true)
            expect(track.readyState).toBe('live')
            expect(track.stopCount).toBe(0)
            expect(context.closeCount).toBe(0)
            expect(packets.some((packet) => packet.type === 'health' && packet.mic === true)).toBe(true)
            expect(packets.some((packet) => packet.type === 'health' && packet.mic === false)).toBe(false)
          } finally {
            game.close()
          }
        }
      )

      it.each([500, 501])(role + '/' + round + ' keeps the %sms frame-gap boundary', async (gap) => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now + 100)
          const client = game[role],
            before = game.host.game.inspect().snapshot,
            context = client.contexts.at(-1)
          game.clock.now += gap
          await game.health()
          client.frame()
          await game.flush()
          game.host.frame()
          await game.flush()
          const after = game.host.game.inspect().snapshot
          expect(after.paused).toBe(gap > 500)
          expect(after.elapsedMs - before.elapsedMs).toBe(gap > 500 ? 0 : gap)
          expect(client.hasFrame).toBe(true)
          expect(client.track.stopCount).toBe(0)
          expect(context.closeCount).toBe(0)
        } finally {
          game.close()
        }
      })
    }

  for (const round of ['round1', 'round2'])
    it.each(['host', 'guest'] as const)(round + ' handles simultaneous failure with %s first', async (first) => {
      const game = await playing(round)
      try {
        for (const client of [game.host, game.guest]) injectInput(client, 'nan-extracted')
        for (const role of [first, first === 'host' ? 'guest' : 'host'] as const) game[role].frame()
        await game.flush()
        for (const client of [game.host, game.guest]) {
          const context = client.contexts.at(-1),
            local = client.game.inspect()
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          expect(local.localReady).toBe(false)
          expect(local.remoteReady).toBe(false)
          expect(local.soundAllowed).toBe(false)
          expect(local.hasSound).toBe(false)
          expect(local.hasStream).toBe(false)
          expect(local.hasAudio).toBe(false)
          expect(client.track.readyState).toBe('ended')
          expect(client.track.stopCount).toBe(1)
          expect(context.closeCount).toBe(1)
          expect(context.sources.every((source: any) => source.onended === null)).toBe(true)
          expect(context.gains[0].disconnect).toHaveBeenCalledOnce()
          expect(client.element('notice').textContent).toBe(
            client === game.host
              ? first === 'host'
                ? '相手が中断しました。両者で再準備してください。'
                : '音声エラーのため試合を中断しました。マイクを再接続し、両者で新たに再準備してください。'
              : '相手のマイクが利用できません。再確認してください。'
          )
          expect(client.element('mic-status').textContent).toContain('音声エラー')
          expect(client.hasFrame).toBe(true)
        }
        await inputFrozen(game)
      } finally {
        game.close()
      }
    })

  it.each(['host', 'guest'] as const)('finished result ignores a stale %s analyser callback', async (role) => {
    const game = await playing('round2')
    try {
      game.host.game.match.addPenalty('guest', 0.25)
      game.host.game.match.tick(899950)
      await game.frames(game.clock.now + 100)
      const final = game.host.game.inspect().snapshot
      expect(final.phase).toBe('finished')
      expect(final.elapsedMs).toBe(900000)
      expect(final.scores.guest).toBe(-0.25)
      const client = game[role],
        read = injectInput(client, 'throw')
      expect(() => client.frame()).not.toThrow()
      await game.flush()
      expect(read).not.toHaveBeenCalled()
      expect(game.host.game.inspect().snapshot).toEqual(final)
      expect(game.guest.game.inspect().guestSnapshot).toEqual(final)
      expect(client.track.stopCount).toBe(1)
      expect(client.contexts.at(-1).closeCount).toBe(1)
      expect(client.game.inspect().finished).toBe(true)
      expect(client.element('ready').disabled).toBe(true)
    } finally {
      game.close()
    }
  })
})

describe('actual main + actual sound + actual peer + existing offline broker', () => {
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2']) {
      it.each(faults)(
        role + '/' + round + ' interrupt survives output %s and requires reconnect + new ready',
        async (operation) => {
          const game = await playing(round)
          try {
            const client = game[role],
              context = client.contexts.at(-1),
              track = client.track
            const generation = client.game.inspect().micGeneration
            client.game.getSound().ritualBell()
            inject(client, operation)
            expect(() => client.game.interrupt('fixture interruption', true, true)).not.toThrow()
            await game.flush()
            stopped(game, client, context, track)
            expect(client.game.inspect().micGeneration).toBeGreaterThan(generation)
            const before = game.host.game.inspect()
            client.game.holdKey('KeyW')
            client.game.holdKey('ArrowDown')
            const pitch = client.game.inspect().pitch
            await game.frames(game.clock.now + 100)
            await game.frames(game.clock.now + 100)
            const after = game.host.game.inspect()
            expect(after.snapshot.elapsedMs).toBe(before.snapshot.elapsedMs)
            expect(after.snapshot.scores).toEqual(before.snapshot.scores)
            expect(after.human).toEqual(before.human)
            expect(after.haunter).toEqual(before.haunter)
            expect(client.game.inspect().pitch).toBe(pitch)
            expect(after.effect).toBeNull()
            expect(game.guest.game.inspect().playbackEffect).toBeNull()
            game.host.click('ready')
            game.guest.click('ready')
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            await client.click('microphone')
            await game.health()
            await game.health()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            game.host.click('ready')
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            game.guest.click('ready')
            await game.flush()
            await game.health()
            expect(game.host.game.inspect().snapshot.paused).toBe(false)
          } finally {
            game.close()
          }
        }
      )
      it.each([
        'microphone',
        'pagehide',
        'finish',
        'webgl',
        'health',
        'mute',
        'volume',
        'mute-target',
        'volume-target',
        'sync-start',
        'sync-start-target',
        'frame-gap'
      ])(role + '/' + round + ' %s failure cannot bypass stop', async (action) => {
        const game = await playing(round)
        try {
          const client = game[role],
            context = client.contexts.at(-1),
            track = client.track
          if (action.startsWith('sync-start')) client.game.getSound().stop()
          inject(client, action.endsWith('-target') ? 'setTargetAtTime' : 'cancelScheduledValues')
          if (action === 'microphone') {
            let resolve!: (media: any) => void
            client.setPermission(
              () =>
                new Promise((done) => {
                  resolve = done
                })
            )
            const pending = Promise.resolve(client.click('microphone')).catch((error) => ({ error }))
            await game.flush()
            stopped(game, client, context, track)
            client.game.close()
            const stale = client.createMedia()
            resolve(stale)
            await pending
            expect(stale.track.stopCount).toBe(1)
            expect(client.game.inspect().hasStream).toBe(false)
          } else {
            if (action === 'pagehide') client.dispatch('pagehide')
            else if (action === 'finish') client.game.finish()
            else if (action === 'webgl') {
              client.game.getWorld().isHealthy = false
              client.game.drawing()
            } else if (action === 'health') {
              client.track.muted = true
              client.frame()
            } else if (action.startsWith('mute')) {
              client.element('mute').checked = true
              client.element('mute').onchange()
            } else if (action.startsWith('volume')) {
              client.element('volume').value = '0'
              client.element('volume').oninput()
            } else if (action === 'frame-gap') {
              game.clock.now += 501
              client.frame()
            } else client.game.syncSound()
            await game.flush()
            expect(track.stopCount).toBe(1)
            expect(context.closeCount).toBe(1)
            expect(client.game.inspect().hasStream).toBe(false)
            if (action !== 'finish') expect(game.host.game.inspect().snapshot.paused).toBe(true)
            if (action === 'pagehide' || action === 'finish') {
              expect(client.game.inspect().finished).toBe(true)
              client.game.close()
              client.game.finish()
              expect(context.closeCount).toBe(1)
              expect(track.stopCount).toBe(1)
            }
          }
        } finally {
          game.close()
        }
      })
    }

  it('retries guest stop and host paused state after dropped stop/state until confirmation', async () => {
    const game = await playing('round2')
    try {
      let stopDrops = 0,
        stateDrops = 0
      game.network.broker.drop = (packet: any) => {
        if (packet.frame.value?.type === 'stop') {
          stopDrops++
          return true
        }
        return false
      }
      inject(game.guest, 'cancelScheduledValues')
      game.guest.game.interrupt('drop fixture', true, true)
      await game.flush()
      expect(game.guest.game.inspect().pendingStop).toBeDefined()
      await game.frames(game.clock.now + 100)
      expect(stopDrops).toBeGreaterThan(1)
      game.network.broker.drop = (packet: any) => {
        if (packet.frame.value?.type === 'state' && packet.frame.value.snapshot.paused) {
          stateDrops++
          return true
        }
        return false
      }
      await game.frames(game.clock.now + 100)
      expect(game.host.game.inspect().snapshot.paused).toBe(true)
      expect(game.guest.game.inspect().pendingStop).toBeDefined()
      expect(stateDrops).toBeGreaterThan(0)
      game.network.broker.drop = undefined
      await game.frames(game.clock.now + 100)
      await game.frames(game.clock.now + 100)
      expect(game.guest.game.inspect().pendingStop).toBeUndefined()
      expect(game.guest.game.inspect().guestSnapshot.paused).toBe(true)
      expect(game.host.game.inspect().localReady).toBe(false)
      expect(game.guest.game.inspect().localReady).toBe(false)
    } finally {
      game.close()
    }
  })

  it('detaches before dispose/stop/track synchronous reentry and closes when both sound calls fail', async () => {
    const game = await playing('round1')
    try {
      const client = game.host,
        output = client.game.getSound(),
        context = client.contexts.at(-1),
        track = client.track
      const reenter = () => {
        expect(client.game.inspect().hasStream).toBe(false)
        expect(client.game.inspect().hasAudio).toBe(false)
        expect(client.game.inspect().hasSound).toBe(false)
        client.game.release()
        client.game.interrupt('sync reentry', true, true)
      }
      output.dispose = vi.fn(() => {
        reenter()
        boom()
      })
      output.stop = vi.fn(() => {
        reenter()
        boom()
      })
      const stop = track.stop.bind(track)
      track.stop = () => {
        reenter()
        stop()
      }
      expect(() => client.game.release()).not.toThrow()
      await game.flush()
      expect(output.dispose).toHaveBeenCalledOnce()
      expect(output.stop).toHaveBeenCalledOnce()
      expect(track.stopCount).toBe(1)
      expect(context.closeCount).toBe(1)
      expect(game.host.game.inspect().snapshot.paused).toBe(true)
    } finally {
      game.close()
    }
  })

  it('handles close rejection with suspend and does not resume silently', async () => {
    const game = await playing('round1')
    try {
      const context = game.host.contexts.at(-1)
      context.close = async () => {
        context.closeCount++
        throw new Error('close rejection')
      }
      inject(game.host, 'cancelScheduledValues')
      game.host.game.interrupt('close fixture', true, true)
      await game.flush()
      expect(context.closeCount).toBe(1)
      expect(context.suspendCount).toBe(1)
      expect(game.host.game.inspect().snapshot.paused).toBe(true)
      expect(game.host.game.inspect().hasStream).toBe(false)
    } finally {
      game.close()
    }
  })

  it.each(['host', 'guest'] as const)(
    'actual stop + dispose failures still close %s audio and pause both peers',
    async (role) => {
      const game = await playing('round2')
      try {
        const client = game[role],
          context = client.contexts.at(-1),
          track = client.track
        client.game.getSound().ritualBell()
        inject(client, 'cancelScheduledValues')
        context.gains[0].disconnect.mockImplementation(boom)
        expect(() => client.game.interrupt('double sound failure', true, true)).not.toThrow()
        await game.flush()
        stopped(game, client, context, track)
        expect(game.guest.game.inspect().guestSnapshot.paused).toBe(true)
      } finally {
        game.close()
      }
    }
  )

  it('handles both close and suspend rejection without unhandled rejection or silent continuation', async () => {
    const game = await playing('round1')
    try {
      const context = game.host.contexts.at(-1)
      context.close = async () => {
        context.closeCount++
        throw new Error('close rejection')
      }
      context.suspend = async () => {
        context.suspendCount++
        throw new Error('suspend rejection')
      }
      inject(game.host, 'cancelScheduledValues')
      game.host.game.interrupt('failed fallback fixture', true, true)
      await game.flush()
      expect(game.host.element('mic-status').textContent).toContain('再読み込み')
      const contexts = game.host.contexts.length
      await game.host.click('microphone')
      await game.health()
      game.host.click('ready')
      game.guest.click('ready')
      await game.flush()
      expect(game.host.contexts).toHaveLength(contexts)
      expect(game.host.game.inspect().snapshot.paused).toBe(true)
      expect(context.closeCount).toBe(1)
      expect(context.suspendCount).toBe(1)
      expect(game.host.game.inspect().snapshot.paused).toBe(true)
      expect(game.host.game.inspect().hasStream).toBe(false)
    } finally {
      game.close()
    }
  })

  it('commits paused/readiness before synchronous gain reentry, without recursive stop or epoch loops', async () => {
    const game = await playing('round1')
    try {
      const client = game.host,
        context = client.contexts.at(-1)
      const epoch = client.game.inspect().epoch
      const fault = context.gains[0].gain.cancelScheduledValues
      const observations: any[] = []
      fault.mockClear().mockImplementation(() => {
        observations.push(client.game.inspect())
        client.game.interrupt('nested stop', true, true)
        client.game.broadcast()
        boom()
      })
      client.game.interrupt('outer stop', true, true)
      await game.flush()
      expect(fault).toHaveBeenCalledOnce()
      expect(observations[0].snapshot.paused).toBe(true)
      expect(observations[0].localReady).toBe(false)
      expect(client.game.inspect().epoch).toBe(epoch + 1)
      expect(client.game.inspect().snapshot.paused).toBe(true)
    } finally {
      game.close()
    }
  })

  it('broadcast publishes committed pause even when stopping sound throws during syncSound', async () => {
    const game = await playing('round1')
    try {
      inject(game.host, 'cancelScheduledValues')
      game.host.game.match.pause()
      game.host.game.broadcast()
      await game.flush()
      expect(game.guest.game.inspect().guestSnapshot.paused).toBe(true)
      expect(game.host.game.inspect().hasStream).toBe(false)
      expect(game.host.game.inspect().localReady).toBe(false)
    } finally {
      game.close()
    }
  })

  it('both peers finish naturally despite injected gain failure without rolling back committed score/time', async () => {
    const game = await playing('round2')
    try {
      for (const client of [game.host, game.guest]) inject(client, 'cancelScheduledValues')
      game.host.game.match.addPenalty('guest', 0.25)
      game.host.game.match.tick(899950)
      await game.frames(game.clock.now + 100)
      await game.flush()
      expect(game.host.game.inspect().snapshot.phase).toBe('finished')
      expect(game.host.game.inspect().snapshot.scores.guest).toBe(-0.25)
      expect(game.host.game.inspect().snapshot.elapsedMs).toBe(900000)
      for (const client of [game.host, game.guest]) {
        expect(client.game.inspect().finished).toBe(true)
        expect(client.track.stopCount).toBe(1)
        expect(client.contexts.at(-1).closeCount).toBe(1)
      }
    } finally {
      game.close()
    }
  })

  it('finishing while permission resume is pending closes old context and rejects stale ownership', async () => {
    const game = await playing('round1')
    try {
      const client = game.guest
      let resume!: () => void
      const previous = (client.contexts.at(-1) as any).constructor.prototype.resume
      const prototype = Object.getPrototypeOf(client.contexts.at(-1))
      prototype.resume = () =>
        new Promise<void>((done) => {
          resume = done
        })
      const permission = client.click('microphone')
      await game.flush()
      const context = client.contexts.at(-1),
        track = client.track
      client.game.close()
      resume()
      await permission
      prototype.resume = previous
      expect(track.stopCount).toBe(1)
      expect(context.closeCount).toBe(1)
      expect(client.game.inspect().hasSound).toBe(false)
      expect(client.game.inspect().hasAudio).toBe(false)
      expect(client.game.inspect().hasStream).toBe(false)
    } finally {
      game.close()
    }
  })

  it('late close rejection pauses the newly reconnected mic instead of allowing silent continuation', async () => {
    const game = await playing('round1')
    try {
      const client = game.host,
        oldContext = client.contexts.at(-1)
      let reject!: (error: Error) => void
      oldContext.close = () => {
        oldContext.closeCount++
        return new Promise<void>((_, fail) => {
          reject = fail
        })
      }
      await client.click('microphone')
      await game.health()
      await game.health()
      const newContext = client.contexts.at(-1),
        newTrack = client.track
      await game.ready(game.clock.now)
      const before = client.game.inspect().snapshot
      reject(new Error('late close rejection'))
      await game.flush()
      expect(client.game.inspect().snapshot.paused).toBe(true)
      expect(client.game.inspect().snapshot.elapsedMs).toBe(before.elapsedMs)
      expect(client.game.inspect().snapshot.scores).toEqual(before.scores)
      expect(client.game.inspect().hasStream).toBe(false)
      expect(newTrack.stopCount).toBe(1)
      expect(newContext.closeCount).toBe(1)
      expect(oldContext.suspendCount).toBe(1)
      expect(client.element('notice').textContent).toContain('マイク')
    } finally {
      game.close()
    }
  })

  it('guest sound failure upgrades a non-notifying interrupt into a confirmed stop request', async () => {
    const game = await playing('round2')
    try {
      const client = game.guest
      inject(client, 'cancelScheduledValues')
      game.network.broker.drop = (packet: any) => packet.frame.value?.type === 'stop'
      client.game.interrupt('non-notifying fixture', false)
      await game.flush()
      expect(client.game.inspect().pendingStop).toBeDefined()
      game.network.broker.drop = undefined
      await game.frames(game.clock.now + 100)
      await game.frames(game.clock.now + 100)
      expect(game.host.game.inspect().snapshot.paused).toBe(true)
      expect(client.game.inspect().pendingStop).toBeUndefined()
      expect(client.game.inspect().guestSnapshot.paused).toBe(true)
    } finally {
      game.close()
    }
  })

  it('still attempts remaining tracks and audio close if one track.stop throws after gain failure', async () => {
    const game = await playing('round1')
    try {
      const client = game.host,
        context = client.contexts.at(-1),
        track = client.track
      const other = {
        readyState: 'live',
        stop: vi.fn(function () {
          this.readyState = 'ended'
        }),
        onended: null,
        onmute: null,
        onunmute: null
      }
      client.streams.at(-1).getTracks = () => [track, other]
      track.stop = () => {
        track.stopCount++
        boom()
      }
      inject(client, 'cancelScheduledValues')
      expect(() => client.game.interrupt('track failure fixture', true, true)).not.toThrow()
      await game.flush()
      expect(track.stopCount).toBe(1)
      expect(other.stop).toHaveBeenCalledOnce()
      expect(context.closeCount).toBe(1)
      expect(client.game.inspect().hasStream).toBe(false)
      expect(client.game.inspect().snapshot.paused).toBe(true)
      expect(track.readyState).toBe('live')
      await client.click('microphone')
      await game.flush()
      expect(client.track).toBe(track)
      expect(track.readyState).toBe('live')
      game.host.click('ready')
      game.guest.click('ready')
      await game.health()
      expect(client.game.inspect().snapshot.paused).toBe(true)
      expect(track.readyState).toBe('live')
    } finally {
      game.close()
    }
  })

  it('a real footstep gain failure preserves already committed motion/time/score then freezes further progress', async () => {
    const game = await playing('round1')
    try {
      const client = game.host,
        context = client.contexts.at(-1)
      client.game.holdKey('KeyW')
      await game.frames(game.clock.now + 100)
      client.game.match.addPenalty('host', 0.125)
      const before = client.game.inspect()
      const original = context.createGain.bind(context)
      const created = vi.spyOn(context, 'createGain').mockImplementationOnce(() => {
        const gain = original()
        gain.gain.setValueAtTime.mockImplementation(boom)
        return gain
      })
      for (let index = 0; index < 4 && !client.game.inspect().snapshot.paused; index++)
        await game.frames(game.clock.now + 100)
      await game.flush()
      const paused = client.game.inspect()
      expect(created).toHaveBeenCalled()
      expect(paused.snapshot.paused).toBe(true)
      expect(paused.snapshot.elapsedMs).toBeGreaterThan(before.snapshot.elapsedMs)
      expect(paused.snapshot.scores.host).toBeLessThanOrEqual(before.snapshot.scores.host)
      expect(paused.human).not.toEqual(before.human)
      expect(client.track.stopCount).toBe(1)
      expect(context.closeCount).toBe(1)
      await game.frames(game.clock.now + 100)
      const after = client.game.inspect()
      expect(after.snapshot.elapsedMs).toBe(paused.snapshot.elapsedMs)
      expect(after.snapshot.scores).toEqual(paused.snapshot.scores)
      expect(after.human).toEqual(paused.human)
    } finally {
      game.close()
    }
  })

  it('invalidates overlapping microphone permissions before termination', async () => {
    const game = await playing('round1')
    try {
      const client = game.guest
      const resolves: Array<(media: any) => void> = []
      client.setPermission(() => new Promise((done) => resolves.push(done)))
      const first = client.click('microphone'),
        second = client.click('microphone')
      const old = client.createMedia(),
        current = client.createMedia()
      resolves[0](old)
      await first
      expect(old.track.stopCount).toBe(1)
      resolves[1](current)
      await second
      expect(client.game.inspect().hasStream).toBe(true)
      expect(current.track.stopCount).toBe(0)
      client.game.close()
      expect(current.track.stopCount).toBe(1)
      expect(client.game.inspect().hasStream).toBe(false)
    } finally {
      game.close()
    }
  })
})

function extraTrack(state = 'live') {
  return {
    readyState: state,
    onended: null,
    onmute: null,
    onunmute: null,
    stop: vi.fn(function () {
      this.readyState = 'ended'
    })
  }
}

async function locked(game: any, client: any, terminating = false) {
  const permission = vi.fn(async () => client.createMedia())
  client.setPermission(permission)
  for (let attempt = 0; attempt < 2; attempt++) await client.click('microphone')
  await game.health()
  expect(permission).not.toHaveBeenCalled()
  expect(client.element('microphone').disabled).toBe(true)
  expect(client.element('ready').disabled).toBe(true)
  expect(client.game.inspect().hasStream).toBe(false)
  expect(client.game.inspect().hasAudio).toBe(false)
  expect(client.game.inspect().hasSound).toBe(false)
  expect(client.game.inspect().soundAllowed).toBe(false)
  expect(client.game.inspect().localReady).toBe(false)
  expect(client.element('mic-status').textContent).toContain('旧マイクの停止を保証できません')
  expect(client.element('mic-status').textContent).toContain('権限を取り消し')
  expect(client.element('mic-status').textContent).toContain('タブを閉じ')
  expect(client.element('mic-status').textContent).toContain('再読み込みだけでは停止を保証できません')
  if (terminating) {
    expect(client.game.inspect().finished).toBe(true)
    return
  }
  expect(game.host.game.inspect().snapshot.paused).toBe(true)
  const before = game.host.game.inspect()
  game.host.click('ready')
  game.guest.click('ready')
  await game.frames(game.clock.now + 100)
  await game.frames(game.clock.now + 100)
  const after = game.host.game.inspect()
  expect(after.snapshot.paused).toBe(true)
  expect(after.snapshot.elapsedMs).toBe(before.snapshot.elapsedMs)
  expect(after.snapshot.scores).toEqual(before.snapshot.scores)
  expect(after.human).toEqual(before.human)
  expect(after.haunter).toEqual(before.haunter)
}

describe('fail closed when an injected track.stop exception leaves capture unconfirmed', () => {
  for (const role of ['host', 'guest'] as const)
    for (const release of [false, true])
      it(role + ' stale disposal reentry cannot request a microphone; nested release=' + release, async () => {
        const game = await playing('round1')
        try {
          const client = game[role]
          let resolveOld: (media: any) => void = () => {}
          client.setPermission(
            () =>
              new Promise((resolve) => {
                resolveOld = resolve
              })
          )
          const pending = client.click('microphone')
          const stale = client.createMedia(),
            other = extraTrack()
          stale.getTracks = () => [stale.track, other]
          client.setPermission(async () => client.createMedia())
          await client.click('microphone')
          await game.ready(game.clock.now + 100)
          const context = client.contexts.at(-1),
            track = client.track
          const permission = vi.fn(async () => client.createMedia())
          client.setPermission(permission)
          stale.track.stop = vi.fn(() => {
            void client.click('microphone')
            game.host.click('ready')
            game.guest.click('ready')
            if (release) client.game.release()
            boom()
          })
          resolveOld(stale)
          await pending
          await game.flush()
          expect(permission).not.toHaveBeenCalled()
          expect(stale.track.stop).toHaveBeenCalledOnce()
          expect(other.stop).toHaveBeenCalledOnce()
          expect(context.closeCount).toBe(1)
          expect(track.readyState).toBe('ended')
          await locked(game, client)
        } finally {
          game.close()
        }
      })

  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2']) {
      for (const temporary of [true, false])
        for (const action of ['gain', 'microphone'])
          it(
            role +
              '/' +
              round +
              '/' +
              action +
              '/' +
              (temporary ? 'temporary' : 'persistent') +
              ' blocks acquisition and ready, stops every remaining track and closes audio',
            async () => {
              const game = await playing(round)
              try {
                const client = game[role],
                  track = client.track,
                  context = client.contexts.at(-1)
                const other = extraTrack()
                const original = track.stop.bind(track)
                track.stop = vi.fn(() => {
                  if (!temporary || track.stop.mock.calls.length === 1) boom()
                  original()
                })
                client.streams.at(-1).getTracks = () => [track, other]
                const packets: any[] = []
                client.game.setSendHook((packet: any) => packets.push(packet))
                if (action === 'gain') inject(client, 'cancelScheduledValues')
                if (action === 'gain') client.game.interrupt('stop failure fixture', false, true)
                else await client.click('microphone')
                await game.flush()
                expect(track.stop).toHaveBeenCalledOnce()
                expect(track.readyState).toBe('live')
                expect(other.stop).toHaveBeenCalledOnce()
                expect(other.readyState).toBe('ended')
                expect(context.closeCount).toBe(1)
                expect(packets.some((packet) => packet.type === 'health' && packet.mic === false)).toBe(true)
                if (role === 'guest') expect(packets.some((packet) => packet.type === 'stop')).toBe(true)
                await locked(game, client)
                track.readyState = 'ended'
                await locked(game, client)
                expect(track.stop).toHaveBeenCalledOnce()
              } finally {
                game.close()
              }
            }
          )

      for (const state of ['already-ended', 'ends-then-throws'])
        it(
          role + '/' + round + '/' + state + ' does not latch and permits a normal reconnect with fresh ready',
          async () => {
            const game = await playing(round)
            try {
              const client = game[role],
                track = client.track,
                context = client.contexts.at(-1)
              if (state === 'already-ended') track.readyState = 'ended'
              track.stop = vi.fn(() => {
                track.readyState = 'ended'
                boom()
              })
              const other = extraTrack()
              client.streams.at(-1).getTracks = () => [track, other]
              inject(client, 'setValueAtTime')
              client.game.interrupt('ended fixture', true, true)
              await game.flush()
              expect(track.stop).toHaveBeenCalledTimes(state === 'already-ended' ? 0 : 1)
              expect(other.stop).toHaveBeenCalledOnce()
              expect(context.closeCount).toBe(1)
              await client.click('microphone')
              expect(client.track).not.toBe(track)
              await game.ready(game.clock.now + 100)
            } finally {
              game.close()
            }
          }
        )

      for (const exit of ['finish', 'cleanup', 'pagehide', 'reset'])
        it(
          role + '/' + round + '/' + exit + ' retains an explicit failure notice and completes termination',
          async () => {
            const game = await playing(round)
            try {
              const client = game[role],
                track = client.track,
                context = client.contexts.at(-1)
              const other = extraTrack()
              client.streams.at(-1).getTracks = () => [track, other]
              track.stop = vi.fn(boom)
              inject(client, 'cancelScheduledValues')
              if (exit === 'finish') client.game.finish()
              else if (exit === 'cleanup') client.game.close()
              else if (exit === 'pagehide') client.dispatch('pagehide')
              else await client.click('reset')
              await game.flush()
              expect(track.stop).toHaveBeenCalledOnce()
              expect(other.stop).toHaveBeenCalledOnce()
              expect(context.closeCount).toBe(1)
              expect(client.game.getWorld()).toBeUndefined()
              await locked(game, client, true)
              expect(client.reload).not.toHaveBeenCalled()
              if (exit === 'finish') {
                game.clock.now += 6000
                client.timers()
                await game.flush()
              }
              expect(client.game.inspect().connected).toBe(false)
            } finally {
              game.close()
            }
          }
        )
    }

  it.each(['dispose', 'track', 'close'])(
    'rejects synchronous microphone reentry from %s before the stop result is known',
    async (boundary) => {
      const game = await playing('round1')
      try {
        const client = game.host,
          track = client.track,
          context = client.contexts.at(-1)
        const permission = vi.fn(async () => client.createMedia())
        client.setPermission(permission)
        const reenter = () => {
          void client.click('microphone')
          client.game.release()
        }
        if (boundary === 'dispose')
          client.game.getSound().dispose = vi.fn(() => {
            reenter()
            boom()
          })
        track.stop = vi.fn(() => {
          if (boundary === 'track') reenter()
          boom()
        })
        if (boundary === 'close')
          context.close = () => {
            context.closeCount++
            reenter()
            context.state = 'closed'
            return Promise.resolve()
          }
        client.game.release()
        await game.flush()
        expect(permission).not.toHaveBeenCalled()
        expect(track.stop).toHaveBeenCalledOnce()
        expect(context.closeCount).toBe(1)
        await locked(game, client)
      } finally {
        game.close()
      }
    }
  )

  for (const role of ['host', 'guest'] as const)
    it(role + ' retries a dropped stop request and reports unhealthy capture while permanently locked', async () => {
      const game = await playing('round2')
      try {
        const client = game[role]
        client.track.stop = vi.fn(boom)
        const packets: any[] = []
        client.game.setSendHook((packet: any) => packets.push(packet))
        game.network.broker.drop = (packet: any) => packet.frame.value?.type === 'stop'
        inject(client, 'cancelScheduledValues')
        client.game.interrupt('retry stop fixture', false, true)
        await game.flush()
        if (role === 'guest') expect(client.game.inspect().pendingStop).toBeDefined()
        game.network.broker.drop = undefined
        await game.frames(game.clock.now + 100)
        await game.frames(game.clock.now + 100)
        expect(client.game.inspect().pendingStop).toBeUndefined()
        expect(game.host.game.inspect().snapshot.paused).toBe(true)
        expect(packets.some((packet) => packet.type === 'health' && !packet.mic)).toBe(true)
        await locked(game, client)
      } finally {
        game.close()
      }
    })

  for (const ending of [false, true])
    for (const role of ['host', 'guest'] as const)
      for (const round of ['round1', 'round2'])
        it(
          role +
            '/' +
            round +
            ' late permission with a failing old track is safely discarded, including other tracks; ending=' +
            ending,
          async () => {
            const game = await playing(round)
            try {
              const client = game[role]
              let resolveOld: (media: any) => void = () => {}
              client.setPermission(
                () =>
                  new Promise((resolve) => {
                    resolveOld = resolve
                  })
              )
              const pending = client.click('microphone')
              const stale = client.createMedia(),
                other = extraTrack()
              stale.track.stop = vi.fn(boom)
              stale.getTracks = () => [stale.track, other]
              client.setPermission(async () => client.createMedia())
              await client.click('microphone')
              const current = client.track,
                context = client.contexts.at(-1)
              if (ending) client.game.close()
              else await game.ready(game.clock.now + 100)
              resolveOld(stale)
              await pending
              await game.flush()
              expect(stale.track.stop).toHaveBeenCalledOnce()
              expect(stale.track.readyState).toBe('live')
              expect(other.stop).toHaveBeenCalledOnce()
              expect(current.readyState).toBe('ended')
              expect(context.closeCount).toBe(1)
              await locked(game, client, ending)
            } finally {
              game.close()
            }
          }
        )

  for (const close of ['sync-throw', 'late-reject', 'late-resolve'])
    for (const suspend of ['resolve', 'reject'])
      for (const role of ['host', 'guest'] as const)
        for (const round of ['round1', 'round2'])
          it(
            role +
              '/' +
              round +
              ' track failure remains locked with ' +
              close +
              ' close and delayed suspend ' +
              suspend,
            async () => {
              const game = await playing(round)
              try {
                const client = game[role],
                  context = client.contexts.at(-1)
                let settleClose: () => void = () => {}
                let settleSuspend: () => void = () => {}
                context.close = () => {
                  context.closeCount++
                  if (close === 'sync-throw') boom()
                  return new Promise((resolve, reject) => {
                    settleClose = () => (close === 'late-resolve' ? resolve(undefined) : reject(new Error('close')))
                  })
                }
                context.suspend = () => {
                  context.suspendCount++
                  return new Promise((resolve, reject) => {
                    settleSuspend = () => (suspend === 'reject' ? reject(new Error('suspend')) : resolve(undefined))
                  })
                }
                client.track.stop = vi.fn(boom)
                inject(client, 'cancelScheduledValues')
                client.game.interrupt('delayed shutdown fixture', true, true)
                await game.flush()
                await locked(game, client)
                if (close !== 'sync-throw') settleClose()
                await game.flush()
                expect(context.closeCount).toBe(1)
                expect(context.suspendCount).toBe(close === 'late-resolve' ? 0 : 1)
                await locked(game, client)
                settleSuspend()
                await game.flush()
                await locked(game, client)
              } finally {
                game.close()
              }
            }
          )

  it('continues through two independent failing tracks and closes audio exactly once', async () => {
    const game = await playing('round2')
    try {
      const client = game.guest,
        track = client.track,
        context = client.contexts.at(-1)
      const second = extraTrack(),
        third = extraTrack(),
        ended = extraTrack('ended')
      track.stop = vi.fn(boom)
      second.stop.mockImplementation(boom)
      ended.stop.mockImplementation(boom)
      client.streams.at(-1).getTracks = () => [track, second, third, ended]
      inject(client, 'cancelScheduledValues')
      client.game.interrupt('multiple failing tracks', true, true)
      await game.flush()
      expect(track.stop).toHaveBeenCalledOnce()
      expect(second.stop).toHaveBeenCalledOnce()
      expect(third.stop).toHaveBeenCalledOnce()
      expect(ended.stop).not.toHaveBeenCalled()
      expect(third.readyState).toBe('ended')
      expect(context.closeCount).toBe(1)
      await locked(game, client)
    } finally {
      game.close()
    }
  })

  it('normal reset still closes capture and reloads once when every shutdown succeeds', async () => {
    const game = await playing('round1')
    try {
      const client = game.host,
        track = client.track,
        context = client.contexts.at(-1)
      await client.click('reset')
      expect(client.game.inspect().finished).toBe(true)
      expect(track.readyState).toBe('ended')
      expect(track.stopCount).toBe(1)
      expect(context.closeCount).toBe(1)
      expect(client.reload).toHaveBeenCalledOnce()
    } finally {
      game.close()
    }
  })

  it('natural final results remain committed when both peers fail to stop their final capture', async () => {
    const game = await playing('round2')
    try {
      for (const client of [game.host, game.guest]) {
        client.track.stop = vi.fn(boom)
        inject(client, 'cancelScheduledValues')
      }
      game.host.game.match.addPenalty('guest', 0.25)
      game.host.game.match.tick(899950)
      await game.frames(game.clock.now + 100)
      await game.flush()
      const final = game.host.game.inspect().snapshot
      expect(final.phase).toBe('finished')
      expect(final.elapsedMs).toBe(900000)
      expect(final.scores.guest).toBe(-0.25)
      expect(game.guest.game.inspect().guestSnapshot.scores).toEqual(final.scores)
      for (const client of [game.host, game.guest]) {
        expect(client.track.stop).toHaveBeenCalledOnce()
        expect(client.contexts.at(-1).closeCount).toBe(1)
        await locked(game, client, true)
      }
      expect(game.host.game.inspect().snapshot.scores).toEqual(final.scores)
    } finally {
      game.close()
    }
  })

  it.each(['host', 'guest'] as const)(
    '%s delayed resume cannot restore sound after a stop failure and termination',
    async (role) => {
      const game = await playing('round2')
      const client = game[role],
        prototype = Object.getPrototypeOf(client.contexts.at(-1))
      const original = prototype.resume
      try {
        let resume: () => void = () => {}
        prototype.resume = () =>
          new Promise<void>((resolve) => {
            resume = resolve
          })
        const pending = client.click('microphone')
        await game.flush()
        const track = client.track,
          context = client.contexts.at(-1)
        track.stop = vi.fn(boom)
        client.game.close()
        resume()
        await pending
        await game.flush()
        expect(track.stop).toHaveBeenCalledOnce()
        expect(context.closeCount).toBe(1)
        await locked(game, client, true)
      } finally {
        prototype.resume = original
        game.close()
      }
    }
  )
})

describe('review: analyser failure plus handler detach failure', () => {
  for (const role of ['host', 'guest'] as const) {
    it(role + ' preserves safety notification and next frame after capture is stopped', async () => {
      const game = await playing('round1')
      try {
        const client = game[role]
        const track = client.track
        const context = client.contexts.at(-1)
        const detachFailure = new Error('injected track detach failure')
        const packets: any[] = []
        client.game.setSendHook((packet: any) => packets.push(packet))
        Object.defineProperty(track, 'onmute', {
          configurable: true,
          set: () => {
            throw detachFailure
          }
        })
        context.analyser.getFloatTimeDomainData = () => {
          throw new Error('injected analyser failure')
        }
        game.clock.now = 1410
        let thrown: unknown
        try {
          client.frame()
        } catch (error) {
          thrown = error
        }
        await game.flush()
        const local = client.game.inspect()
        const host = game.host.game.inspect()
        console.log(
          'TEARDOWN_REVIEW',
          JSON.stringify({
            role,
            originalDetachError: thrown === detachFailure,
            track: track.readyState,
            context: context.state,
            interrupted: local.interrupted,
            hostPaused: host.snapshot.paused,
            hasFrame: client.hasFrame,
            unhealthyHealth: packets.some((packet: any) => packet.type === 'health' && packet.mic === false),
            stop: packets.some((packet: any) => packet.type === 'stop')
          })
        )
        expect(thrown).toBe(detachFailure)
        expect(track.readyState).toBe('ended')
        expect(context.state).toBe('closed')
        expect.soft(local.interrupted).toBe(true)
        expect.soft(host.snapshot.paused).toBe(true)
        expect.soft(client.hasFrame).toBe(true)
        expect.soft(packets.some((packet: any) => packet.type === 'health' && packet.mic === false)).toBe(true)
        if (role === 'guest') expect.soft(packets.some((packet: any) => packet.type === 'stop')).toBe(true)
      } finally {
        game.close()
      }
    })
  }
})

describe('review: safety after sound failure and throwing teardown', () => {
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2'])
      for (const trigger of ['analysis', 'ambient', 'muted'])
        for (const property of ['onended', 'onmute', 'onunmute', 'onstatechange'])
          for (const unconfirmed of [false, true])
            it(`${role}/${round}/${trigger}/${property}/unconfirmed=${unconfirmed}`, async () => {
              const game = await playing(round, 0.4)
              try {
                const client = game[role]
                const track = client.track
                const context = client.contexts.at(-1)
                await game.frames(game.clock.now)
                let act: () => void
                if (trigger === 'analysis') {
                  context.analyser.getFloatTimeDomainData = () => {
                    throw new Error('analysis failed')
                  }
                  game.clock.now += 10
                  act = () => client.frame()
                } else if (trigger === 'ambient') {
                  const timer = await dueAmbient(game, client)
                  injectAmbient(client, 'oscillator')
                  act = () => client.fireTimer(timer.id)
                } else {
                  track.muted = true
                  inject(client, 'cancelScheduledValues')
                  game.clock.now += 10
                  act = () => client.frame()
                }
                const failure = new Error('teardown failed')
                Object.defineProperty(property === 'onstatechange' ? context : track, property, {
                  configurable: true,
                  set: () => {
                    throw failure
                  }
                })
                if (unconfirmed) track.stop = vi.fn()
                const packets: any[] = []
                client.game.setSendHook((packet: any) => packets.push(packet))
                const previousFrames = client.scheduledFrames
                expect(act).toThrow(failure)
                await game.flush()
                expect(game.host.game.inspect().snapshot.paused).toBe(true)
                expect(client.game.inspect().hasStream).toBe(false)
                expect(client.game.inspect().hasAudio).toBe(false)
                expect(client.hasFrame).toBe(true)
                expect(client.scheduledFrames - previousFrames).toBe(trigger === 'ambient' ? 0 : 1)
                expect(context.closeCount).toBe(1)
                expect(track.readyState).toBe(unconfirmed ? 'live' : 'ended')
                expect(packets.filter((packet: any) => packet.type === 'health' && packet.mic === false)).toHaveLength(
                  1
                )
                if (role === 'guest') expect(packets.filter((packet: any) => packet.type === 'stop')).toHaveLength(1)
                if (unconfirmed) await locked(game, client)
              } finally {
                game.close()
              }
            })
})

describe('review: reentrant audio close failure during teardown', () => {
  for (const role of ['host', 'guest'] as const)
    it(role + ' attempts one safety notification when close fails synchronously', async () => {
      const game = await playing('round1')
      try {
        const client = game[role]
        const context = client.contexts.at(-1)
        const failure = new Error('track detach failed')
        const packets: any[] = []
        await game.frames(game.clock.now)
        Object.defineProperty(client.track, 'onmute', {
          configurable: true,
          set: () => {
            throw failure
          }
        })
        context.close = () => {
          context.closeCount++
          throw new Error('close failed')
        }
        context.analyser.getFloatTimeDomainData = () => {
          throw new Error('analysis failed')
        }
        client.game.setSendHook((packet: any) => packets.push(packet))
        game.clock.now += 10
        expect(() => client.frame()).toThrow(failure)
        await game.flush()
        console.log(
          'REENTRANT_REVIEW',
          JSON.stringify({
            role,
            health: packets.filter((packet: any) => packet.type === 'health' && packet.mic === false).length,
            stop: packets.filter((packet: any) => packet.type === 'stop').length,
            stopIds: packets
              .filter((packet: any) => packet.type === 'stop')
              .map((packet: any) => ({ id: packet.requestId, epoch: packet.epoch })),
            paused: game.host.game.inspect().snapshot.paused,
            hostEpoch: game.host.game.inspect().epoch,
            frame: client.hasFrame
          })
        )
        expect(game.host.game.inspect().snapshot.paused).toBe(true)
        expect(client.hasFrame).toBe(true)
        expect(packets.filter((packet: any) => packet.type === 'health' && packet.mic === false)).toHaveLength(1)
        if (role === 'guest') expect(packets.filter((packet: any) => packet.type === 'stop')).toHaveLength(1)
      } finally {
        game.close()
      }
    })
})

describe('composite sound failure transactions', () => {
  for (const role of ['host', 'guest'] as const)
    for (const fallback of ['close', 'suspend'])
      it(`${role}/${fallback} delayed rejection still locks a replacement capture when notifications throw`, async () => {
        const game = await playing('round1')
        try {
          const client = game[role],
            context = client.contexts.at(-1),
            failure = new Error('detach')
          let rejectClose: (error: unknown) => void = () => {}
          let rejectSuspend: (error: unknown) => void = () => {}
          context.close = () => {
            context.closeCount++
            return new Promise((_resolve, reject) => {
              rejectClose = reject
            })
          }
          context.suspend = () => {
            context.suspendCount++
            return new Promise((_resolve, reject) => {
              rejectSuspend = reject
            })
          }
          Object.defineProperty(client.track, 'onmute', {
            configurable: true,
            set: () => {
              throw failure
            }
          })
          context.analyser.getFloatTimeDomainData = boom
          expect(() => client.frame()).toThrow(failure)
          await game.flush()
          if (fallback === 'suspend') {
            rejectClose(new Error('old close rejected'))
            await game.flush()
          }
          await client.click('microphone')
          await game.ready(game.clock.now + 100)
          const replacement = client.contexts.at(-1),
            track = client.track,
            other = extraTrack(),
            packets: any[] = []
          client.streams.at(-1).getTracks = () => [track, other]
          track.stop = vi.fn()
          Object.defineProperty(track, 'onmute', {
            configurable: true,
            set: () => {
              throw undefined
            }
          })
          client.game.setSendHook((packet: any) => {
            packets.push(packet)
            if (packet.type === 'health' || packet.type === 'stop') throw new Error('notification unavailable')
          })
          if (fallback === 'close') rejectClose(new Error('late close rejected'))
          else rejectSuspend(new Error('late suspend rejected'))
          await game.flush()
          expect(track.stop).toHaveBeenCalledOnce()
          expect(other.stop).toHaveBeenCalledOnce()
          expect(replacement.closeCount).toBe(1)
          expect(client.pendingFrames).toBe(1)
          expect(client.game.inspect().localReady).toBe(false)
          expect(client.game.inspect().hasStream).toBe(false)
          expect(client.game.inspect().hasAudio).toBe(false)
          expect(client.element('microphone').disabled).toBe(true)
          expect(packets.filter((packet) => packet.type === 'health' && !packet.mic)).toHaveLength(1)
          expect(packets.filter((packet) => packet.type === 'stop')).toHaveLength(role === 'guest' ? 1 : 0)
        } finally {
          game.close()
        }
      })

  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2']) {
      it(`${role}/${round} preserves the first of independent teardown failures and attempts all tracks`, async () => {
        const game = await playing(round)
        try {
          const client = game[role],
            context = client.contexts.at(-1),
            track = client.track,
            other = extraTrack(),
            media = client.streams.at(-1)
          const detach = vi.fn(() => {
            throw undefined
          })
          Object.defineProperty(context, 'onstatechange', { configurable: true, set: detach })
          const handlers = ['onended', 'onmute', 'onunmute'].map((property) => {
            const setter = vi.fn(() => {
              throw new Error(property)
            })
            Object.defineProperty(track, property, { configurable: true, set: setter })
            return setter
          })
          media.getTracks = () => {
            throw new Error('enumeration')
          }
          media.getAudioTracks = () => [track, other]
          track.stop = vi.fn()
          context.close = () => {
            context.closeCount++
            throw new Error('close')
          }
          context.suspend = () => {
            context.suspendCount++
            throw new Error('suspend')
          }
          context.analyser.getFloatTimeDomainData = boom
          const packets: any[] = []
          client.game.setSendHook((packet: any) => packets.push(packet))
          let caught = false
          try {
            client.frame()
          } catch (error) {
            caught = true
            expect(error).toBeUndefined()
          }
          expect(caught).toBe(true)
          expect(detach).toHaveBeenCalledOnce()
          for (const setter of handlers) expect(setter).toHaveBeenCalledOnce()
          expect(track.stop).toHaveBeenCalledOnce()
          expect(other.stop).toHaveBeenCalledOnce()
          expect(context.closeCount).toBe(1)
          expect(context.suspendCount).toBe(1)
          await game.flush()
          expect(client.pendingFrames).toBe(1)
          expect(packets.filter((packet) => packet.type === 'health' && !packet.mic)).toHaveLength(1)
          expect(packets.filter((packet) => packet.type === 'stop')).toHaveLength(role === 'guest' ? 1 : 0)
          await locked(game, client)
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} permits fresh preparation after confirmed compound shutdown and ignores old callbacks`, async () => {
        const game = await playing(round)
        try {
          const client = game[role],
            context = client.contexts.at(-1),
            track = client.track,
            oldFailure = client.game.getSound().onFailure,
            stale = [track.onended, track.onmute, track.onunmute, context.onstatechange],
            failure = new Error('detach')
          Object.defineProperty(track, 'onmute', {
            configurable: true,
            set: () => {
              throw failure
            }
          })
          context.analyser.getFloatTimeDomainData = boom
          expect(() => client.frame()).toThrow(failure)
          await game.flush()
          await client.click('microphone')
          await game.ready(game.clock.now + 100)
          const state = client.game.inspect()
          const packets: any[] = []
          client.game.setSendHook((packet: any) => packets.push(packet))
          for (const callback of stale) callback?.()
          oldFailure(new Error('stale failure'))
          await game.flush()
          expect(client.game.inspect().epoch).toBe(state.epoch)
          expect(client.game.inspect().micGeneration).toBe(state.micGeneration)
          expect(client.game.inspect().hasStream).toBe(true)
          expect(client.game.inspect().hasAudio).toBe(true)
          expect(client.game.inspect().hasSound).toBe(true)
          expect(game.host.game.inspect().snapshot.paused).toBe(false)
          expect(client.pendingFrames).toBe(1)
          expect(packets).toHaveLength(0)
        } finally {
          game.close()
        }
      })
    }

  it('commits natural final results and preserves the six-second ACK grace after a teardown exception inside RAF', async () => {
    const game = await playing('round2')
    try {
      const client = game.host,
        context = client.contexts.at(-1),
        failure = new Error('final detach')
      Object.defineProperty(client.track, 'onmute', {
        configurable: true,
        set: () => {
          throw failure
        }
      })
      game.host.game.match.addPenalty('guest', 0.25)
      game.host.game.match.tick(899950)
      const scheduled = client.scheduledFrames
      await expect(game.frames(game.clock.now + 100)).rejects.toBe(failure)
      await game.flush()
      const final = client.game.inspect().snapshot
      expect(final.phase).toBe('finished')
      expect(final.elapsedMs).toBe(900000)
      expect(final.scores.guest).toBe(-0.25)
      expect(game.guest.game.inspect().guestSnapshot).toEqual(final)
      expect(client.game.inspect().finished).toBe(true)
      expect(context.closeCount).toBe(1)
      expect(client.pendingFrames).toBe(0)
      expect(client.scheduledFrames).toBe(scheduled)
      const endedAt = game.clock.now
      game.clock.now = endedAt + 5999
      client.timers()
      expect(client.game.inspect().peerStatus).not.toBe('closed')
      game.clock.now = endedAt + 6000
      client.timers()
      await game.flush()
      expect(client.game.inspect().peerStatus).toBe('closed')
    } finally {
      game.close()
    }
  })

  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2']) {
      for (const close of ['sync-throw', 'late-reject'])
        for (const suspend of ['resolve', 'sync-throw', 'reject'])
          it(`${role}/${round}/${close}/${suspend} reports one incident despite close fallback reentry`, async () => {
            const game = await playing(round)
            try {
              const client = game[role],
                context = client.contexts.at(-1),
                track = client.track,
                other = extraTrack()
              const failure = new Error('first detach failure')
              const stale = [track.onended, track.onmute, track.onunmute, context.onstatechange]
              const packets: any[] = []
              client.streams.at(-1).getTracks = () => [track, other]
              Object.defineProperty(track, 'onmute', {
                configurable: true,
                set: () => {
                  throw failure
                }
              })
              context.close = () => {
                context.closeCount++
                if (close === 'sync-throw') throw new Error('close')
                return Promise.reject(new Error('close'))
              }
              context.suspend = () => {
                context.suspendCount++
                if (suspend === 'sync-throw') throw new Error('suspend')
                return suspend === 'reject' ? Promise.reject(new Error('suspend')) : Promise.resolve()
              }
              context.analyser.getFloatTimeDomainData = boom
              client.game.setSendHook((packet: any) => {
                packets.push(packet)
                if (packet.type === 'health') client.game.release()
              })
              game.clock.now += 10
              const scheduled = client.scheduledFrames
              expect(() => client.frame()).toThrow(failure)
              await game.flush()
              expect(context.closeCount).toBe(1)
              expect(context.suspendCount).toBe(1)
              expect(track.readyState).toBe('ended')
              expect(other.stop).toHaveBeenCalledOnce()
              expect(client.pendingFrames).toBe(1)
              expect(client.scheduledFrames - scheduled).toBe(1)
              expect(game.host.game.inspect().snapshot.paused).toBe(true)
              expect(packets.filter((packet) => packet.type === 'health' && !packet.mic)).toHaveLength(1)
              expect(packets.filter((packet) => packet.type === 'stop')).toHaveLength(role === 'guest' ? 1 : 0)
              const epoch = client.game.inspect().epoch
              const generation = client.game.inspect().micGeneration
              for (const callback of stale) callback?.()
              await game.flush()
              expect(client.game.inspect().epoch).toBe(epoch)
              expect(client.game.inspect().micGeneration).toBe(generation)
              if (suspend !== 'resolve') {
                expect(client.element('mic-status').textContent).toContain('再読み込み')
                const permission = vi.fn(async () => client.createMedia())
                client.setPermission(permission)
                await client.click('microphone')
                expect(permission).not.toHaveBeenCalled()
              }
            } finally {
              game.close()
            }
          })

      for (const property of ['onended', 'onmute', 'onunmute', 'onstatechange'])
        it(`${role}/${round}/${property} preserves thrown undefined while stop and health throws are independent`, async () => {
          const game = await playing(round)
          try {
            const client = game[role],
              context = client.contexts.at(-1)
            const packets: any[] = []
            const propertyOwner = property === 'onstatechange' ? context : client.track
            Object.defineProperty(propertyOwner, property, {
              configurable: true,
              set: () => {
                throw undefined
              }
            })
            context.analyser.getFloatTimeDomainData = boom
            client.game.setSendHook((packet: any) => {
              packets.push(packet)
              if (packet.type === 'health' || packet.type === 'stop' || packet.type === 'state')
                throw new Error('notification unavailable')
            })
            game.clock.now += 10
            let caught = false
            try {
              client.frame()
            } catch (error) {
              caught = true
              expect(error).toBeUndefined()
            }
            expect(caught).toBe(true)
            expect(context.closeCount).toBe(1)
            expect(client.track.readyState).toBe('ended')
            expect(client.game.inspect().hasStream).toBe(false)
            expect(client.game.inspect().localReady).toBe(false)
            expect(client.pendingFrames).toBe(1)
            expect(packets.filter((packet) => packet.type === 'health' && !packet.mic)).toHaveLength(1)
            if (role === 'host') expect(client.game.inspect().snapshot.paused).toBe(true)
            else {
              expect(packets.filter((packet) => packet.type === 'stop')).toHaveLength(1)
              expect(client.game.inspect().pendingStop).toBeDefined()
              expect(game.host.game.inspect().snapshot.paused).toBe(false)
            }
          } finally {
            game.close()
          }
        })

      for (const boundary of ['enumeration', 'ready-before', 'ready-after'])
        for (const trigger of ['analysis', 'interrupt'])
          it(`${role}/${round}/${trigger}/${boundary} keeps remaining tracks and the permanent capture latch`, async () => {
            const game = await playing(round)
            try {
              const client = game[role],
                track = client.track,
                context = client.contexts.at(-1),
                media = client.streams.at(-1),
                other = extraTrack()
              const failure = new Error(boundary)
              let stoppedTrack = false
              media.getTracks = () => [track, other]
              if (boundary === 'enumeration') {
                media.getTracks = () => {
                  throw failure
                }
                media.getAudioTracks = () => [track, other]
              } else {
                track.stop = vi.fn(() => {
                  stoppedTrack = true
                })
                Object.defineProperty(track, 'readyState', {
                  get: () => {
                    if ((boundary === 'ready-before' && !client.game.inspect().hasStream) || stoppedTrack) throw failure
                    return 'live'
                  }
                })
              }
              if (trigger === 'analysis') context.analyser.getFloatTimeDomainData = boom
              else inject(client, 'cancelScheduledValues')
              const scheduled = client.scheduledFrames
              game.clock.now += 10
              expect(() =>
                trigger === 'analysis' ? client.frame() : client.game.interrupt('fixture', true, true)
              ).toThrow(failure)
              await game.flush()
              expect(track.stopCount || track.stop.mock.calls.length).toBe(1)
              expect(other.stop).toHaveBeenCalledOnce()
              expect(context.closeCount).toBe(1)
              expect(client.pendingFrames).toBe(1)
              expect(client.scheduledFrames - scheduled).toBe(trigger === 'analysis' ? 1 : 0)
              await locked(game, client)
            } finally {
              game.close()
            }
          })

      if (role === 'guest')
        it(`${role}/${round} retries an existing pending stop unchanged after compound teardown failure`, async () => {
          const game = await playing(round)
          try {
            const client = game[role]
            game.network.broker.drop = (packet: any) => packet.frame.value?.type === 'stop'
            client.game.interrupt('initial stop', true, true)
            expect(client.game.inspect().pendingStop).toBeDefined()
            const pending = { ...client.game.inspect().pendingStop }
            const packets: any[] = []
            client.game.setSendHook((packet: any) => packets.push(packet))
            const context = client.contexts.at(-1)
            const failure = new Error('detach')
            Object.defineProperty(client.track, 'onmute', {
              configurable: true,
              set: () => {
                throw failure
              }
            })
            context.analyser.getFloatTimeDomainData = boom
            game.clock.now += 10
            expect(() => client.frame()).toThrow(failure)
            expect(client.game.inspect().pendingStop).toEqual(pending)
            expect(packets.filter((packet) => packet.type === 'stop')).toHaveLength(0)
            game.network.broker.drop = undefined
            await game.frames(game.clock.now + 100)
            expect(
              packets
                .filter((packet) => packet.type === 'stop')
                .every((packet) => packet.requestId === pending.requestId && packet.epoch === pending.epoch)
            ).toBe(true)
            await game.flush()
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
            expect(client.game.inspect().pendingStop).toBeUndefined()
          } finally {
            game.close()
          }
        })
    }

  for (const role of ['host', 'guest'] as const)
    for (const action of ['finish', 'cleanup', 'frame-cleanup'])
      it(`${role}/${action} does not revive frames and preserves the finished acknowledgement grace`, async () => {
        const game = await playing('round2')
        try {
          const client = game[role],
            context = client.contexts.at(-1),
            failure = new Error('detach')
          Object.defineProperty(client.track, 'onmute', {
            configurable: true,
            set: () => {
              if (action === 'frame-cleanup') client.game.close()
              throw failure
            }
          })
          inject(client, 'cancelScheduledValues')
          if (action === 'frame-cleanup') context.analyser.getFloatTimeDomainData = boom
          const scheduled = client.scheduledFrames
          expect(() =>
            action === 'finish' ? client.game.finish() : action === 'cleanup' ? client.game.close() : client.frame()
          ).toThrow(failure)
          await game.flush()
          expect(client.game.inspect().finished).toBe(true)
          expect(context.closeCount).toBe(1)
          client.frame()
          expect(client.pendingFrames).toBe(0)
          expect(client.scheduledFrames).toBe(scheduled)
          if (action === 'finish') {
            expect(client.game.inspect().peerStatus).not.toBe('closed')
            game.clock.now += 5999
            client.timers()
            expect(client.game.inspect().peerStatus).not.toBe('closed')
            game.clock.now++
            client.timers()
            await game.flush()
            expect(client.game.inspect().peerStatus).toBe('closed')
          } else expect(client.game.inspect().peerStatus).toBe('closed')
        } finally {
          game.close()
        }
      })
})

describe('media teardown exception boundaries', () => {
  for (const role of ['host', 'guest'] as const) {
    for (const property of ['onended', 'onmute', 'onunmute', 'onstatechange'])
      for (const unconfirmed of [false, true])
        it(role + '/' + property + ' continues teardown; unconfirmed=' + unconfirmed, async () => {
          const game = await playing('round1')
          try {
            const client = game[role],
              track = client.track,
              context = client.contexts.at(-1),
              other = extraTrack(),
              sound = client.game.getSound()
            const callbacks = [track.onended, track.onmute, track.onunmute, context.onstatechange]
            const target = property === 'onstatechange' ? context : track
            const failure = property === 'onended' ? undefined : new Error('detach ' + property)
            const permission = vi.fn(async () => client.createMedia())
            client.setPermission(permission)
            client.streams.at(-1).getTracks = () => [track, other]
            const dispose = vi.spyOn(sound, 'dispose')
            let detachCount = 0
            Object.defineProperty(target, property, {
              configurable: true,
              get: () =>
                callbacks[property === 'onstatechange' ? 3 : ['onended', 'onmute', 'onunmute'].indexOf(property)],
              set: () => {
                detachCount++
                for (const callback of callbacks) callback()
                client.game.release()
                void client.click('microphone')
                throw failure
              }
            })
            if (unconfirmed) track.stop = vi.fn()
            let threw = false
            try {
              client.game.release()
            } catch (error) {
              threw = true
              expect(error).toBe(failure)
            }
            expect(threw).toBe(true)
            expect(detachCount).toBe(1)
            expect(dispose).toHaveBeenCalledOnce()
            expect(other.stop).toHaveBeenCalledOnce()
            expect(context.closeCount).toBe(1)
            expect(permission).not.toHaveBeenCalled()
            if (unconfirmed) {
              expect(track.stop).toHaveBeenCalledOnce()
              await locked(game, client)
            } else {
              expect(track.stopCount).toBe(1)
              expect(track.readyState).toBe('ended')
              await client.click('microphone')
              expect(permission).toHaveBeenCalledOnce()
              const before = client.game.inspect()
              const status = client.element('mic-status').textContent
              const packets: any[] = []
              client.game.setSendHook((packet: any) => packets.push(packet))
              for (const callback of callbacks) callback()
              expect(client.game.inspect()).toEqual(before)
              expect(client.element('mic-status').textContent).toBe(status)
              expect(packets).toEqual([])
            }
          } finally {
            game.close()
          }
        })

    it.each([false, true])(role + ' enumeration failure uses cached tracks; fallback fails=%s', async (both) => {
      const game = await playing('round2')
      try {
        const client = game[role],
          media = client.createMedia(),
          other = extraTrack(),
          discovered = extraTrack()
        media.getTracks = () => [media.track, other]
        client.setPermission(async () => media)
        await client.click('microphone')
        const context = client.contexts.at(-1)
        const failure = new Error('getTracks unavailable')
        Object.defineProperty(media, 'getTracks', {
          configurable: true,
          get: () => {
            throw failure
          }
        })
        media.getAudioTracks = () => {
          if (both) throw new Error('getAudioTracks unavailable')
          return [media.track, other, discovered]
        }
        expect(() => client.game.release()).toThrow(failure)
        expect(media.track.stopCount).toBe(1)
        expect(other.stop).toHaveBeenCalledOnce()
        expect(discovered.stop).toHaveBeenCalledTimes(both ? 0 : 1)
        expect(context.closeCount).toBe(1)
        await locked(game, client)
      } finally {
        game.close()
      }
    })

    it.each(['before', 'after', 'always'])(
      role + ' readyState getter failure %s cannot skip stopping',
      async (when) => {
        const game = await playing('round1')
        try {
          const client = game[role],
            track = client.track,
            context = client.contexts.at(-1),
            other = extraTrack()
          const failure = new Error('readyState unavailable')
          let stopped = false
          Object.defineProperty(track, 'readyState', {
            configurable: true,
            get: () => {
              if (when === 'always' || (when === 'before' ? !stopped : stopped)) throw failure
              return stopped ? 'ended' : 'live'
            }
          })
          track.stop = vi.fn(() => {
            stopped = true
          })
          client.streams.at(-1).getTracks = () => [track, other]
          if (when === 'before') client.game.release()
          else expect(() => client.game.release()).toThrow(failure)
          expect(track.stop).toHaveBeenCalledOnce()
          expect(other.stop).toHaveBeenCalledOnce()
          expect(context.closeCount).toBe(1)
          if (when !== 'before') await locked(game, client)
          else {
            await client.click('microphone')
            expect(client.streams).toHaveLength(2)
          }
        } finally {
          game.close()
        }
      }
    )

    it.each(['getTracks', 'both-enumerators', 'onmute', 'readyState', 'normal-return'])(
      role + ' late permission teardown isolates %s and closes the current session on uncertainty',
      async (fault) => {
        const game = await playing('round1')
        try {
          const client = game[role]
          let resolveOld: (media: any) => void = () => {}
          client.setPermission(
            () =>
              new Promise((resolve) => {
                resolveOld = resolve
              })
          )
          const pending = client.click('microphone')
          const stale = client.createMedia(),
            other = extraTrack()
          stale.getTracks = () => [stale.track, other]
          stale.getAudioTracks = () => [stale.track, other]
          if (fault === 'getTracks' || fault === 'both-enumerators') stale.getTracks = boom
          if (fault === 'both-enumerators') stale.getAudioTracks = boom
          if (fault === 'onmute') Object.defineProperty(stale.track, 'onmute', { set: boom })
          if (fault === 'readyState') {
            Object.defineProperty(stale.track, 'readyState', { get: boom })
            stale.track.stop = vi.fn()
          }
          if (fault === 'normal-return') stale.track.stop = vi.fn()
          client.setPermission(async () => client.createMedia())
          await client.click('microphone')
          const current = client.track,
            context = client.contexts.at(-1)
          resolveOld(stale)
          await pending
          await game.flush()
          if (fault === 'onmute') {
            expect(stale.track.stopCount).toBe(1)
            expect(other.stop).toHaveBeenCalledOnce()
            expect(current.readyState).toBe('live')
            expect(context.closeCount).toBe(0)
          } else {
            if (fault === 'both-enumerators') expect(stale.track.stopCount).toBe(0)
            else expect(other.stop).toHaveBeenCalledOnce()
            expect(current.stopCount).toBe(1)
            expect(context.closeCount).toBe(1)
            await locked(game, client)
          }
        } finally {
          game.close()
        }
      }
    )

    it.each([false, true])(role + ' detach error still closes/suspends context; async rejection=%s', async (late) => {
      const game = await playing('round1')
      try {
        const client = game[role],
          track = client.track,
          context = client.contexts.at(-1)
        const failure = new Error('onstatechange detach')
        Object.defineProperty(context, 'onstatechange', {
          set: () => {
            throw failure
          }
        })
        context.close = () => {
          context.closeCount++
          if (late) return Promise.reject(new Error('close rejected'))
          throw new Error('close threw')
        }
        expect(() => client.game.release()).toThrow(failure)
        await game.flush()
        expect(track.stopCount).toBe(1)
        expect(context.closeCount).toBe(1)
        expect(context.suspendCount).toBe(1)
        expect(context.state).toBe('suspended')
      } finally {
        game.close()
      }
    })

    it(role + ' unhealthy notification reentry cannot repeat teardown or stop requests', async () => {
      const game = await playing('round1')
      try {
        const client = game[role],
          track = client.track,
          context = client.contexts.at(-1)
        track.stop = vi.fn()
        const packets: any[] = []
        client.game.setSendHook((packet: any) => {
          packets.push(packet)
          client.game.release()
          void client.click('microphone')
        })
        client.game.release()
        expect(track.stop).toHaveBeenCalledOnce()
        expect(context.closeCount).toBe(1)
        expect(packets.filter((packet) => packet.type === 'health')).toHaveLength(1)
        expect(packets.filter((packet) => packet.type === 'stop')).toHaveLength(role === 'guest' ? 1 : 0)
        await locked(game, client)
      } finally {
        game.close()
      }
    })
  }
})

describe('fail closed when track.stop returns normally without ending capture', () => {
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2']) {
      it.each(['release', 'microphone', 'pagehide', 'finish', 'reentrant-release'])(
        role + '/' + round + ' %s permanently rejects capture and readiness after an unconfirmed return',
        async (action) => {
          const game = await playing(round)
          try {
            const client = game[role],
              track = client.track,
              context = client.contexts.at(-1),
              other = extraTrack()
            client.streams.at(-1).getTracks = () => [track, other]
            const permission = vi.fn(async () => client.createMedia())
            client.setPermission(permission)
            const packets: any[] = []
            client.game.setSendHook((packet: any) => packets.push(packet))
            track.stop = vi.fn(() => {
              if (action === 'reentrant-release') {
                void client.click('microphone')
                client.click('ready')
                client.game.release()
              }
            })
            if (action === 'microphone') await client.click('microphone')
            else if (action === 'pagehide') client.dispatch('pagehide')
            else if (action === 'finish') client.game.finish()
            else client.game.release()
            await game.flush()
            expect(track.stop).toHaveBeenCalledOnce()
            expect(track.readyState).toBe('live')
            expect(track.onended).toBeNull()
            expect(track.onmute).toBeNull()
            expect(track.onunmute).toBeNull()
            expect(other.stop).toHaveBeenCalledOnce()
            expect(other.readyState).toBe('ended')
            expect(context.closeCount).toBe(1)
            expect(permission).not.toHaveBeenCalled()
            expect(packets.some((packet) => packet.type === 'health' && packet.mic === false)).toBe(true)
            await locked(game, client, action === 'pagehide' || action === 'finish')
            track.readyState = 'ended'
            await locked(game, client, action === 'pagehide' || action === 'finish')
            client.click('reset')
            expect(client.reload).not.toHaveBeenCalled()
          } finally {
            game.close()
          }
        }
      )
      it.each([false, true])(
        role + '/' + round + ' stale normal-return track failure latches across termination=%s',
        async (terminating) => {
          const game = await playing(round)
          try {
            const client = game[role]
            let resolveOld!: (media: any) => void
            client.setPermission(
              () =>
                new Promise((resolve) => {
                  resolveOld = resolve
                })
            )
            const pending = client.click('microphone')
            const stale = client.createMedia(),
              other = extraTrack()
            stale.getTracks = () => [stale.track, other]
            stale.track.stop = vi.fn()
            client.setPermission(async () => client.createMedia())
            await client.click('microphone')
            const current = client.track,
              context = client.contexts.at(-1)
            if (terminating) client.game.close()
            resolveOld(stale)
            await pending
            await game.flush()
            expect(stale.track.stop).toHaveBeenCalledOnce()
            expect(stale.track.readyState).toBe('live')
            expect(other.stop).toHaveBeenCalledOnce()
            expect(current.readyState).toBe('ended')
            expect(current.stopCount).toBe(1)
            expect(context.closeCount).toBe(1)
            await locked(game, client, terminating)
            stale.track.readyState = 'ended'
            await locked(game, client, terminating)
          } finally {
            game.close()
          }
        }
      )
    }
})

describe('unexpected frame error capture safety', () => {
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2'] as const) {
      it(`${role}/${round} continues normally without a meter error`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role]
          game.clock.now += 20
          expect(() => client.frame()).not.toThrow()
          await game.flush()
          expect(client.track.readyState).toBe('live')
          expect(game.host.game.inspect().snapshot.paused).toBe(false)
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} releases capture and interrupts after a meter error`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role]
          const track = client.track
          const context = client.contexts.at(-1)
          const level = client.element('level')
          const failure = new Error('meter setter failed')
          const packets: any[] = []
          client.game.setSendHook((packet: any) => packets.push(packet))
          Object.defineProperty(level, 'value', {
            configurable: true,
            set() {
              throw failure
            }
          })
          game.clock.now += 20
          expect(() => client.frame()).toThrow(failure)
          await game.flush()
          expect(track.readyState).toBe('ended')
          expect(track.stopCount).toBe(1)
          expect(context.closeCount).toBe(1)
          expect(client.game.inspect().hasStream).toBe(false)
          expect(client.game.inspect().hasAudio).toBe(false)
          expect(client.game.inspect().soundAllowed).toBe(false)
          expect(client.game.inspect().interrupted).toBe(true)
          expect(client.pendingFrames).toBe(1)
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          expect(packets.some((packet) => packet.type === 'health' && packet.mic === false)).toBe(true)
          if (role === 'guest') expect(packets.some((packet) => packet.type === 'stop')).toBe(true)
        } finally {
          game.close()
        }
      })
    }
})

describe('unexpected frame error boundary probes', () => {
  it('does not acquire capture after the initial frame reservation fails', async () => {
    const game = await pair()
    const failure = new Error('initial frame scheduling failed')
    const client = game.bootstrap(failure)
    try {
      expect(client.bootstrapError).toBe(failure)
      await client.click('microphone')
      await game.flush()
      expect(client.streams).toHaveLength(0)
      expect(client.element('microphone').disabled).toBe(true)
    } finally {
      for (const media of client.streams) media.track.stop()
      for (const context of client.contexts) await context.close()
      game.close()
    }
  })
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2'] as const) {
      it(`${role}/${round} stops capture if scheduling the next frame throws`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role]
          const track = client.track
          const failure = new Error('frame scheduling failed')
          client.failNextFrameSchedule(failure)
          game.clock.now += 20
          expect(() => client.frame()).toThrow(failure)
          await game.flush()
          expect(track.readyState).toBe('ended')
          expect(client.game.inspect().interrupted).toBe(true)
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          const streamCount = client.streams.length
          await client.click('microphone')
          await game.flush()
          expect(client.streams).toHaveLength(streamCount)
          expect(client.game.inspect().hasStream).toBe(false)
          expect(client.element('microphone').disabled).toBe(true)
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} preserves a frame error when rescheduling also throws`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role]
          const frameFailure = new Error('frame failed')
          Object.defineProperty(client.element('level'), 'value', {
            configurable: true,
            set() {
              throw frameFailure
            }
          })
          client.failNextFrameSchedule(new Error('frame scheduling failed'))
          game.clock.now += 20
          expect(() => client.frame()).toThrow(frameFailure)
          expect(client.track.readyState).toBe('ended')
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} prioritizes a failed audio shutdown warning over a scheduler warning`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role]
          const context = client.contexts.at(-1)
          const failure = new Error('frame scheduling failed')
          context.close = () => {
            context.closeCount++
            throw new Error('close failed')
          }
          context.suspend = () => {
            context.suspendCount++
            throw new Error('suspend failed')
          }
          client.failNextFrameSchedule(failure)
          game.clock.now += 20
          expect(() => client.frame()).toThrow(failure)
          await game.flush()
          expect(client.track.readyState).toBe('ended')
          expect(context.closeCount).toBe(1)
          expect(context.suspendCount).toBe(1)
          expect(client.game.inspect().notice).toContain('音声を停止できません')
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} retains finish grace when cleanup reenters finish`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role]
          const track = client.track
          const failure = new Error('meter failed')
          Object.defineProperty(client.element('level'), 'value', {
            configurable: true,
            set() {
              throw failure
            }
          })
          Object.defineProperty(track, 'onmute', {
            configurable: true,
            set() {
              client.game.finish()
            }
          })
          const scheduled = client.scheduledFrames
          game.clock.now += 20
          expect(() => client.frame()).toThrow(failure)
          await game.flush()
          expect(track.readyState).toBe('ended')
          expect(client.game.inspect().finished).toBe(true)
          expect(client.pendingFrames).toBe(0)
          expect(client.scheduledFrames).toBe(scheduled)
          expect(client.game.inspect().peerStatus).not.toBe('closed')
          game.clock.now += 5999
          client.timers()
          expect(client.game.inspect().peerStatus).not.toBe('closed')
          game.clock.now++
          client.timers()
          await game.flush()
          expect(client.game.inspect().peerStatus).toBe('closed')
        } finally {
          game.close()
        }
      })

      it.each([undefined, false])(
        `${role}/${round} preserves falsy frame error %s after teardown throws`,
        async (failure) => {
          const game = await playing(round)
          try {
            await game.frames(game.clock.now)
            const client = game[role]
            const track = client.track
            const context = client.contexts.at(-1)
            Object.defineProperty(track, 'onmute', {
              configurable: true,
              set() {
                throw new Error('detach failed')
              }
            })
            Object.defineProperty(client.element('level'), 'value', {
              configurable: true,
              set() {
                throw failure
              }
            })
            game.clock.now += 20
            let caught: unknown = Symbol('not thrown')
            try {
              client.frame()
            } catch (error) {
              caught = error
            }
            expect(caught).toBe(failure)
            await game.flush()
            expect(track.readyState).toBe('ended')
            expect(track.stopCount).toBe(1)
            expect(context.closeCount).toBe(1)
            expect(client.game.inspect().interrupted).toBe(true)
            expect(client.pendingFrames).toBe(1)
            expect(game.host.game.inspect().snapshot.paused).toBe(true)
          } finally {
            game.close()
          }
        }
      )

      it.each([undefined, false])(
        `${role}/${round} permits immediate retry after an already-handled sound exception %s`,
        async (failure) => {
          const game = await playing(round)
          try {
            const client = game[role]
            const track = client.track
            Object.defineProperty(track, 'onmute', {
              configurable: true,
              set() {
                throw failure
              }
            })
            client.contexts.at(-1).analyser.getFloatTimeDomainData = boom
            let caught: unknown = Symbol('not thrown')
            try {
              client.frame()
            } catch (error) {
              caught = error
            }
            expect(caught).toBe(failure)
            await game.flush()
            expect(track.readyState).toBe('ended')
            await client.click('microphone')
            await game.ready(game.clock.now + 100)
            expect(client.track).not.toBe(track)
            expect(game.host.game.inspect().snapshot.paused).toBe(false)
          } finally {
            game.close()
          }
        }
      )

      it(`${role}/${round} does not mistake a later identical exception for the earlier sound failure`, async () => {
        const game = await playing(round)
        try {
          const client = game[role]
          const failure = new Error('same error value')
          Object.defineProperty(client.track, 'onmute', {
            configurable: true,
            set() {
              throw failure
            }
          })
          client.contexts.at(-1).analyser.getFloatTimeDomainData = boom
          expect(() => client.frame()).toThrow(failure)
          await game.flush()
          await client.click('microphone')
          await game.ready(game.clock.now + 100)
          const replacement = client.track
          Object.defineProperty(client.element('level'), 'value', {
            configurable: true,
            set() {
              throw failure
            }
          })
          expect(() => client.frame()).toThrow(failure)
          await game.flush()
          expect(replacement.readyState).toBe('ended')
          const streamCount = client.streams.length
          await client.click('microphone')
          expect(client.streams).toHaveLength(streamCount)
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} does not confuse a swallowed sound exception with a later frame exception`, async () => {
        const game = await playing(round)
        try {
          const client = game[role]
          const track = client.track
          const context = client.contexts.at(-1)
          const callback = client.game.getSound().onFailure
          const failure = new Error('same swallowed error')
          Object.defineProperty(track, 'onmute', {
            configurable: true,
            set() {
              throw failure
            }
          })
          Object.defineProperty(client.element('level'), 'value', {
            configurable: true,
            set() {
              throw failure
            }
          })
          let nested = false
          context.analyser.getFloatTimeDomainData = () => {
            try {
              callback(failure)
            } catch (error) {
              nested = error === failure
            }
          }
          expect(() => client.frame()).toThrow(failure)
          await game.flush()
          expect(nested).toBe(true)
          expect(track.readyState).toBe('ended')
          const streamCount = client.streams.length
          await client.click('microphone')
          await game.flush()
          expect(client.streams).toHaveLength(streamCount)
          expect(client.game.inspect().hasStream).toBe(false)
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} requires a new explicit preparation after a frame fault`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role]
          const level = client.element('level')
          const failure = new Error('meter failed')
          const initial = client.track
          Object.defineProperty(level, 'value', {
            configurable: true,
            set() {
              throw failure
            }
          })
          const packets: any[] = []
          client.game.setSendHook((packet: any) => packets.push(packet))
          for (let index = 0; index < 3; index++) {
            game.clock.now += 20
            expect(() => client.frame()).toThrow(failure)
            expect(client.pendingFrames).toBe(1)
          }
          await game.flush()
          expect(initial.stopCount).toBe(1)
          expect(packets.filter((packet) => packet.type === 'health' && packet.mic === false)).toHaveLength(1)
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          Object.defineProperty(level, 'value', { configurable: true, writable: true, value: '' })
          expect(() => client.frame()).not.toThrow()
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          await client.click('microphone')
          await game.flush()
          expect(client.track).not.toBe(initial)
          await game.ready(game.clock.now + 100)
          expect(game.host.game.inspect().snapshot.paused).toBe(false)
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} does not reacquire capture during failure notification reentry`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role]
          const initial = client.track
          const failure = new Error('meter failed')
          Object.defineProperty(client.element('level'), 'value', {
            configurable: true,
            set() {
              throw failure
            }
          })
          let reentered = false
          const attempts: Promise<unknown>[] = []
          client.game.setSendHook((packet: any) => {
            if (!reentered && packet.type === 'health' && packet.mic === false) {
              reentered = true
              attempts.push(Promise.resolve(client.click('microphone')).catch(() => {}))
            }
          })
          game.clock.now += 20
          expect(() => client.frame()).toThrow(failure)
          await Promise.all(attempts)
          await game.flush()
          expect(reentered).toBe(true)
          expect(initial.readyState).toBe('ended')
          expect(client.game.inspect().hasStream).toBe(false)
          expect(client.game.inspect().interrupted).toBe(true)
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} does not reacquire while the frame fault persists`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role]
          const failure = new Error('meter failed')
          Object.defineProperty(client.element('level'), 'value', {
            configurable: true,
            set() {
              throw failure
            }
          })
          game.clock.now += 20
          expect(() => client.frame()).toThrow(failure)
          await game.flush()
          const streamCount = client.streams.length
          await client.click('microphone')
          await game.flush()
          expect(client.streams).toHaveLength(streamCount)
          expect(client.game.inspect().hasStream).toBe(false)
          expect(client.streams.filter((media: any) => media.track.readyState === 'live')).toHaveLength(0)
        } finally {
          game.close()
        }
      })

      it.each(['frame', 'scheduler'] as const)(
        `${role}/${round} rejects reacquisition if %s fails during its notification`,
        async (mode) => {
          const game = await playing(round)
          try {
            await game.frames(game.clock.now)
            const client = game[role]
            const failure = new Error('reentrant frame fault')
            let reentered = false
            let observed: unknown
            client.game.setSendHook((packet: any) => {
              if (!reentered && packet.type === 'health' && packet.mic === false) {
                reentered = true
                if (mode === 'scheduler') client.failNextFrameSchedule(failure)
                else
                  Object.defineProperty(client.element('level'), 'value', {
                    configurable: true,
                    set() {
                      throw failure
                    }
                  })
                try {
                  client.frame()
                } catch (error) {
                  observed = error
                }
              }
            })
            await client.click('microphone')
            await game.flush()
            expect(reentered).toBe(true)
            expect(observed).toBe(failure)
            expect(client.game.inspect().hasStream).toBe(false)
            expect(client.streams.filter((media: any) => media.track.readyState === 'live')).toHaveLength(0)
            if (mode === 'scheduler') expect(client.pendingFrames).toBe(0)
          } finally {
            game.close()
          }
        }
      )

      it(`${role}/${round} stops a late microphone grant after frame scheduling fails`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role]
          let grant!: (value: any) => void
          client.setPermission(
            () =>
              new Promise((resolve) => {
                grant = resolve
              })
          )
          const request = client.click('microphone')
          expect(grant).toBeTypeOf('function')
          const failure = new Error('frame scheduling failed')
          client.failNextFrameSchedule(failure)
          expect(() => client.frame()).toThrow(failure)
          const late = client.createMedia()
          grant(late)
          await request
          await game.flush()
          expect(late.track.readyState).toBe('ended')
          expect(late.track.stopCount).toBe(1)
          expect(client.game.inspect().hasStream).toBe(false)
        } finally {
          game.close()
        }
      })

      it(`${role}/${round} stops capture if frame scheduling fails during audio resume`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role]
          let resume!: () => void
          client.setAudioResume(
            () =>
              new Promise((resolve) => {
                resume = resolve
              })
          )
          const request = client.click('microphone')
          await game.flush()
          expect(resume).toBeTypeOf('function')
          const track = client.track
          expect(track.readyState).toBe('live')
          const failure = new Error('frame scheduling failed')
          client.failNextFrameSchedule(failure)
          expect(() => client.frame()).toThrow(failure)
          expect(track.readyState).toBe('ended')
          resume()
          await request
          await game.flush()
          expect(track.stopCount).toBe(1)
          expect(client.game.inspect().hasStream).toBe(false)
        } finally {
          game.close()
        }
      })
    }
})

describe('frame recovery with a later rendering error', () => {
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2'] as const)
      it(`${role}/${round} keeps capture disabled until a frame fully succeeds`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role]
          const originalTrack = client.track
          const level = client.element('level')
          const failure = new Error('meter failed')
          Object.defineProperty(level, 'value', {
            configurable: true,
            set() {
              throw failure
            }
          })
          game.clock.now += 20
          expect(() => client.frame()).toThrow(failure)
          await game.flush()
          expect(originalTrack.readyState).toBe('ended')
          Object.defineProperty(level, 'value', { configurable: true, writable: true, value: '' })
          let renderCalls = 0
          client.game.getWorld().render = () => {
            renderCalls++
            throw new Error('render failed')
          }
          game.clock.now += 20
          expect(() => client.frame()).not.toThrow()
          await game.flush()
          const wasDisabled = client.element('microphone').disabled
          const previousStreams = client.streams.length
          await client.click('microphone')
          await game.flush()
          const newStreams = client.streams.length - previousStreams
          expect(renderCalls).toBeGreaterThan(0)
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
          expect(wasDisabled).toBe(true)
          expect(newStreams).toBe(0)
          client.game.getWorld().render = () => {}
          await game.frames(game.clock.now + 100)
          expect(client.element('microphone').disabled).toBe(false)
          await client.click('microphone')
          await game.flush()
          expect(client.streams).toHaveLength(previousStreams + 1)
          expect(client.track.readyState).toBe('live')
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
        } finally {
          game.close()
        }
      })
  for (const role of ['host', 'guest'] as const)
    for (const round of ['round1', 'round2'] as const)
      it(`${role}/${round} waits for a visible frame before allowing capture`, async () => {
        const game = await playing(round)
        try {
          await game.frames(game.clock.now)
          const client = game[role]
          const level = client.element('level')
          const originalTrack = client.track
          const failure = new Error('meter failed')
          Object.defineProperty(level, 'value', {
            configurable: true,
            set() {
              throw failure
            }
          })
          game.clock.now += 20
          expect(() => client.frame()).toThrow(failure)
          await game.flush()
          expect(originalTrack.readyState).toBe('ended')
          Object.defineProperty(level, 'value', { configurable: true, writable: true, value: '' })
          client.document.hidden = true
          game.clock.now += 20
          expect(() => client.frame()).not.toThrow()
          await game.flush()
          const previousStreams = client.streams.length
          expect(client.element('microphone').disabled).toBe(true)
          await client.click('microphone')
          await game.flush()
          expect(client.streams).toHaveLength(previousStreams)
          client.document.hidden = false
          await game.frames(game.clock.now + 100)
          expect(client.element('microphone').disabled).toBe(false)
          await client.click('microphone')
          await game.flush()
          expect(client.streams).toHaveLength(previousStreams + 1)
          expect(game.host.game.inspect().snapshot.paused).toBe(true)
        } finally {
          game.close()
        }
      })
})

describe('independent visibility during render', () => {
  for (const role of ['host', 'guest'] as const)
    it(`${role} requires another visible frame`, async () => {
      const game = await playing('round1')
      try {
        await game.frames(game.clock.now)
        const client = game[role]
        const level = client.element('level')
        Object.defineProperty(level, 'value', {
          configurable: true,
          set() {
            throw new Error('frame failure')
          }
        })
        expect(() => client.frame()).toThrow('frame failure')
        await game.flush()
        expect(client.track.readyState).toBe('ended')
        Object.defineProperty(level, 'value', { configurable: true, writable: true, value: 0 })
        client.game.getWorld().render = () => {
          client.document.hidden = true
        }
        expect(() => client.frame()).not.toThrow()
        await game.flush()
        const count = client.streams.length
        await client.click('microphone')
        await game.flush()
        expect(client.streams).toHaveLength(count)
        expect(client.element('microphone').disabled).toBe(true)
        client.document.hidden = false
        client.game.getWorld().render = () => {}
        await game.frames(game.clock.now + 100)
        expect(client.element('microphone').disabled).toBe(false)
        await client.click('microphone')
        await game.flush()
        expect(client.streams).toHaveLength(count + 1)
        expect(game.host.game.inspect().snapshot.paused).toBe(true)
      } finally {
        game.close()
      }
    })
})

function terminatePeerForMicrophone(client: any, status: 'disconnected' | 'error' | 'closed') {
  const peer = client.game.getPeer()
  if (status === 'disconnected') peer.session.onClosed()
  else if (status === 'closed') peer.close()
  else peer.terminate('error', 'offline terminal error')
}

describe.each(['host', 'guest'] as const)('terminal microphone async boundaries: %s', (role) => {
  it.each([
    ['permission', 'reject'],
    ['resume', 'resolve'],
    ['resume', 'reject']
  ] as const)('does not reacquire after pending %s %s settles', async (stage, outcome) => {
    const game = await pair()
    const client = game[role]
    let resolvePending!: () => void
    let rejectPending!: (error: Error) => void
    const pending = new Promise<void>((resolve, reject) => {
      resolvePending = resolve
      rejectPending = reject
    })
    const request = vi.fn(async () => {
      if (stage === 'permission') await pending
      return client.createMedia()
    })
    client.setPermission(request)
    if (stage === 'resume') client.setAudioResume(() => pending)
    const acquiring = client.click('microphone')
    try {
      await game.flush()
      const track = client.track
      const context = client.contexts.at(-1)
      terminatePeerForMicrophone(client, 'disconnected')
      if (outcome === 'resolve') resolvePending()
      else rejectPending(new Error('offline deferred failure'))
      await acquiring
      await game.flush()
      expect(track.readyState).toBe('ended')
      expect(context.state).toBe('closed')
      expect(client.game.inspect().hasStream).toBe(false)
      expect(client.game.inspect().hasAudio).toBe(false)
      expect(client.game.inspect().hasSound).toBe(false)
      expect(client.element('microphone').disabled).toBe(true)
      await client.click('microphone')
      expect(request).toHaveBeenCalledTimes(1)
      expect(client.element('mic-status').textContent).not.toContain('許可を待っています')
    } finally {
      resolvePending()
      await acquiring
      game.close()
    }
  })

  it.each(['stop', 'close'] as const)('blocks reentry from terminal %s and after teardown', async (method) => {
    const game = await pair()
    const client = game[role]
    const target = method === 'stop' ? client.track : client.contexts.at(-1)
    const original = target[method].bind(target)
    const request = vi.fn(async () => client.createMedia())
    client.setPermission(request)
    let reentries = 0
    target[method] = () => {
      reentries++
      client.click('microphone')
      return original()
    }
    try {
      terminatePeerForMicrophone(client, 'error')
      await game.flush()
      expect(reentries).toBe(1)
      expect(request).not.toHaveBeenCalled()
      await client.click('microphone')
      expect(request).not.toHaveBeenCalled()
      expect(client.element('microphone').disabled).toBe(true)
      expect(client.game.inspect().hasStream).toBe(false)
    } finally {
      game.close()
    }
  })
})

describe.each(['host', 'guest'] as const)('terminal microphone safety: %s', (role) => {
  describe.each(['round1', 'round2'] as const)('%s', (round) => {
    it.each(['disconnected', 'error', 'closed'] as const)(
      'releases capture on %s and forbids explicit reacquisition on the same page',
      async (status) => {
        const game = await playing(round)
        const client = game[role]
        const oldTrack = client.track
        const oldContext = client.contexts.at(-1)
        try {
          terminatePeerForMicrophone(client, status)
          await game.flush()
          expect(oldTrack.readyState).toBe('ended')
          expect(oldContext.closeCount).toBe(1)
          expect(client.game.inspect().hasStream).toBe(false)
          expect(client.element('ready').disabled).toBe(true)
          expect(client.element('connection').textContent).toContain('終了してやり直し')
          const count = client.streams.length
          const contextCount = client.contexts.length
          const request = vi.fn(async () => client.createMedia())
          client.setPermission(request)
          expect(client.element('microphone').disabled).toBe(true)
          await client.click('microphone')
          client.game.health()
          client.frame()
          await game.flush()
          await client.click('microphone')
          expect(request).not.toHaveBeenCalled()
          expect(client.streams).toHaveLength(count)
          expect(client.contexts).toHaveLength(contextCount)
          expect(client.game.inspect().hasAudio).toBe(false)
          expect(client.game.inspect().hasSound).toBe(false)
          expect(client.element('microphone').disabled).toBe(true)
          expect(client.element('ready').disabled).toBe(true)
        } finally {
          game.close()
        }
      }
    )

    it.each(['disconnected', 'error'] as const)('stops late microphone permission after %s', async (status) => {
      const game = await playing(round)
      const client = game[role]
      let resolvePermission!: (value: any) => void
      client.setPermission(
        () =>
          new Promise((resolve) => {
            resolvePermission = resolve
          })
      )
      const pending = client.click('microphone')
      try {
        terminatePeerForMicrophone(client, status)
        const late = client.createMedia()
        resolvePermission(late)
        await pending
        await game.flush()
        expect(late.track.readyState).toBe('ended')
        expect(client.game.inspect().hasStream).toBe(false)
        expect(client.element('microphone').disabled).toBe(true)
        const request = vi.fn(async () => client.createMedia())
        client.setPermission(request)
        await client.click('microphone')
        expect(request).not.toHaveBeenCalled()
      } finally {
        game.close()
      }
    })

    it('keeps the microphone during an ordinary interruption', async () => {
      const game = await playing(round)
      const client = game[role]
      const track = client.track
      try {
        client.game.pause()
        await game.flush()
        expect(track.readyState).toBe('live')
        expect(client.game.inspect().hasStream).toBe(true)
        expect(client.element('microphone').disabled).toBe(false)
        const count = client.streams.length
        await client.click('microphone')
        expect(client.streams).toHaveLength(count + 1)
        expect(track.readyState).toBe('ended')
        expect(client.track.readyState).toBe('live')
        expect(client.game.inspect().hasStream).toBe(true)
      } finally {
        game.close()
      }
    })

    it.each(['send-overflow', 'track-stop'] as const)(
      'avoids reacquisition when %s disconnects synchronously',
      async (trigger) => {
        const game = await playing(round)
        const client = game[role]
        const peer = client.game.getPeer()
        const track = client.track
        let requests = 0
        client.setPermission(async () => {
          requests++
          return client.createMedia()
        })
        if (trigger === 'send-overflow') {
          peer.outbox.length = 0
          for (let index = 0; index < 64; index++) peer.outbox.push({ key: `test:${index}`, bytes: new Uint8Array() })
        } else {
          const stop = track.stop.bind(track)
          track.stop = () => {
            stop()
            peer.session.onClosed()
          }
        }
        try {
          await client.click('microphone')
          await game.flush()
          expect(peer.ended).toBe(true)
          expect(track.readyState).toBe('ended')
          expect(requests).toBe(0)
          expect(client.game.inspect().hasStream).toBe(false)
          expect(client.element('notice').textContent).toContain('終了してやり直し')
        } finally {
          game.close()
        }
      }
    )

    it.each(['getTracks', 'getAudioTracks'] as const)(
      'stops capture when %s disconnects synchronously',
      async (method) => {
        const game = await playing(round)
        const client = game[role]
        const peer = client.game.getPeer()
        let capture: any
        let disconnected = false
        client.setPermission(async () => {
          capture = client.createMedia()
          const getTracks = capture[method].bind(capture)
          capture[method] = () => {
            if (!disconnected) {
              disconnected = true
              peer.session.onClosed()
            }
            return getTracks()
          }
          return capture
        })
        try {
          await client.click('microphone')
          await game.flush()
          expect(disconnected).toBe(true)
          expect(capture.track.readyState).toBe('ended')
          expect(capture.track.onended).toBeNull()
          expect(client.game.inspect().hasStream).toBe(false)
          expect(client.game.inspect().hasAudio).toBe(false)
          expect(
            client.contexts.every((context: any) => context.state === 'closed' || context.state === 'suspended')
          ).toBe(true)
        } finally {
          game.close()
        }
      }
    )

    it.each(['track', 'context'] as const)(
      'preserves %s shutdown warnings during a synchronous disconnect',
      async (failure) => {
        const game = await playing(round)
        const client = game[role]
        const peer = client.game.getPeer()
        const track = client.track
        const context = client.contexts.at(-1)
        peer.outbox.length = 0
        for (let index = 0; index < 64; index++) peer.outbox.push({ key: `test:${index}`, bytes: new Uint8Array() })
        if (failure === 'track') {
          track.stop = () => {
            track.stopCount++
            throw new Error('track stop failed')
          }
        } else {
          context.close = () => {
            context.closeCount++
            throw new Error('close failed')
          }
          context.suspend = () => {
            context.suspendCount++
            throw new Error('suspend failed')
          }
        }
        try {
          client.game.release()
          await game.flush()
          expect(peer.ended).toBe(true)
          expect(client.element('microphone').disabled).toBe(true)
          const expected = failure === 'track' ? '旧マイクの停止を保証できません' : '音声を停止できません'
          expect(client.element('notice').textContent).toContain(expected)
          expect(client.element('mic-status').textContent).toContain(expected)
        } finally {
          game.close()
        }
      }
    )

    it('contains asynchronous send cleanup failures without logging the thrown value', async () => {
      const game = await playing(round)
      const client = game[role]
      const peer = client.game.getPeer()
      const track = client.track
      const descriptor = Object.getOwnPropertyDescriptor(track, 'onmute')
      const secret = { marker: 'not-for-logging' }
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      Object.defineProperty(track, 'onmute', {
        configurable: true,
        set() {
          throw secret
        }
      })
      peer.session.raw.sendSubgroupObject = async () => {
        throw new Error('offline send failure')
      }
      try {
        client.game.health()
        await game.flush()
        expect(peer.ended).toBe(true)
        expect(track.readyState).toBe('ended')
        expect(client.game.inspect().hasStream).toBe(false)
        expect(logged).toHaveBeenCalledWith('MoQ termination handler failed')
        expect(logged.mock.calls).toEqual([['MoQ termination handler failed']])
      } finally {
        if (descriptor) Object.defineProperty(track, 'onmute', descriptor)
        else delete track.onmute
        logged.mockRestore()
        game.close()
      }
    })
  })
})
