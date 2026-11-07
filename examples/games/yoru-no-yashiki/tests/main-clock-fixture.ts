import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import { build, transform } from 'esbuild'
import { beforeAll, expect, it } from 'vitest'

let script: string
let brokerScript: string
const directory = dirname(fileURLToPath(import.meta.url))
const source = process.env.YORU_CLOCK_SOURCE_ROOT ?? resolve(directory, '..', 'src')

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
          builder.onLoad({ filter: /[/\\]sound\.ts$/ }, () => ({
            contents: `export class YashikiSound { constructor() {
          return new Proxy(this, { get: (target, key) => key === 'isPreviewing' ? false : () => {} })
        } }`,
            loader: 'js'
          }))
          builder.onLoad({ filter: /[/\\]voice\.ts$/ }, async ({ path }) => ({
            contents:
              (await readFile(path, 'utf8')).replace(
                'export function analyzeVoiceFrame(',
                'function originalAnalyzeVoiceFrame('
              ) +
              '\nexport function analyzeVoiceFrame(samples, rate, deltaSeconds) { const rms = globalThis.syntheticRms?.(); return rms === undefined ? originalAnalyzeVoiceFrame(samples, rate, deltaSeconds) : { rms, confidence: 1, deltaSeconds } }',
            loader: 'ts'
          }))
          builder.onLoad({ filter: /[/\\]main\.ts$/ }, async ({ path }) => ({
            contents:
              (await readFile(path, 'utf8')) +
              `
          globalThis.game = { match,
            inspect: () => ({ snapshot: match.getSnapshot(), guestSnapshot: snapshot,
              human: { ...human }, haunter: { ...haunter }, turn, turnTotal, epoch: readinessEpoch,
              localReady, remoteReady, remoteMic, remoteSeen, pendingStop, connected, finished, peerStatus,
              connection: el('connection').textContent,
              localRms, localVoiced, remoteVoiced, duration: meter.duration, pending: meter.pending,
              qualified: meter.qualified, notice: el('notice').textContent }),
            health: sendHealth, broadcast,
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

export async function pair(flushTurns = 120) {
  const clock = { now: 0 }
  const networkContext: any = { TextDecoder, Uint8Array, Map, BigInt }
  runInNewContext(brokerScript, networkContext)
  const network = networkContext.network
  function client() {
    const elements = new Map<string, any>()
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
    let syntheticRms: number | undefined
    let frame: (() => void) | undefined
    const timers = new Map<number, { callback: () => void; at: number; interval?: number }>()
    let nextTimer = 1
    const timer = (callback: () => void, delay: number, interval?: number) => {
      const id = nextTimer++
      timers.set(id, { callback, at: clock.now + delay, interval })
      return id
    }
    const sandbox: any = {
      syntheticRms: () => syntheticRms,
      network,
      console,
      TextDecoder,
      TextEncoder,
      Uint8Array,
      Float32Array,
      performance: { now: () => clock.now },
      crypto: webcrypto,
      URL,
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
        addEventListener() {}
      },
      addEventListener() {},
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
      requestAnimationFrame(callback: () => void) {
        frame = callback
        return 1
      },
      cancelAnimationFrame() {
        frame = undefined
      },
      setTimeout: (callback: () => void, delay: number) => timer(callback, delay),
      clearTimeout: (id: number) => timers.delete(id),
      setInterval: (callback: () => void, delay: number) => timer(callback, delay, delay),
      clearInterval: (id: number) => timers.delete(id),
      navigator: {
        mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) }
      },
      AudioContext: class {
        state = 'running'
        sampleRate = 48000
        async resume() {}
        async close() {
          this.state = 'closed'
        }
        createMediaStreamSource() {
          return { connect() {} }
        }
        createAnalyser() {
          return {
            fftSize: 8192,
            getFloatTimeDomainData(samples: Float32Array) {
              if (syntheticRms !== undefined) {
                samples.fill(0)
                return
              }
              for (let index = 0; index < samples.length; index++) {
                const time = clock.now - ((samples.length - index) * 1000) / 48000
                samples[index] =
                  time >= toneStart && time < toneStop
                    ? toneAmplitude * Math.sin((2 * Math.PI * 220 * index) / 48000)
                    : 0
              }
            }
          }
        }
      }
    }
    sandbox.window = sandbox
    runInNewContext(script, sandbox)
    return {
      get game() {
        return sandbox.game
      },
      track,
      setObservation: (rms: number) => {
        syntheticRms = rms
      },
      text: (id: string) => element(id).textContent,
      room: element('room-code'),
      click: (id: string) => element(id).onclick?.(),
      setToneWindow: (start: number, stop: number) => {
        toneStart = start
        toneStop = stop
        toneAmplitude = 0.8
      },
      frame: () => frame?.(),
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
    for (let index = 0; index < flushTurns; index++) await Promise.resolve()
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
    host.game.close()
    guest.game.close()
  }
  return { host, guest, network, clock, ready, frames, health, flush, close }
}

export function registerPartitionInvariance(kind: 'constant' | 'varying') {
  it.each([kind])(
    'keeps partition invariance in both nights with synthetic %s observations',
    async (kind) => {
      const records = []
      for (const [hostStep, guestStep] of [
        [10, 17],
        [17, 20],
        [20, 10]
      ]) {
        const game = await pair(20)
        const sent: any[] = []
        game.host.game.setSendHook((value: any) => {
          if (value.type === 'state' && value.snapshot.phase === 'finished') sent.push(structuredClone(value))
        })
        try {
          let now = 1000
          for (const step of [hostStep, guestStep]) {
            await game.ready(now)
            const segments =
              kind === 'constant'
                ? [[900000, 0.5]]
                : [
                    [300000, 0.125],
                    [300000, 0.375],
                    [300000, 0.625]
                  ]
            for (const [length, rms] of segments) {
              game.host.setObservation(rms)
              game.guest.setObservation(rms)
              game.guest.frame()
              game.host.frame()
              await game.health()
              const end = now + length
              while (now < end) {
                now = Math.min(end, now + step)
                await game.frames(now)
              }
            }
            expect(game.host.game.inspect().snapshot.elapsedMs).toBe(900000)
            console.log('NIGHT_SCORE', kind, step, JSON.stringify(game.host.game.inspect().snapshot))
            game.host.game.broadcast()
            await game.flush()
          }
          const host = game.host.game.inspect().snapshot
          const guest = game.guest.game.inspect().guestSnapshot
          records.push({
            kind,
            hostStep,
            guestStep,
            scores: host.scores,
            winner:
              host.scores.host === host.scores.guest ? 'tie' : host.scores.host > host.scores.guest ? 'host' : 'guest'
          })
          expect(host.phase).toBe('finished')
          expect(guest).toEqual(host)
          expect(sent.length).toBeGreaterThan(0)
          expect(sent.at(-1).snapshot).toEqual(guest)
        } finally {
          game.close()
        }
      }
      console.log('PARTITION_RECORDS', JSON.stringify(records))
      const expected = kind === 'constant' ? -450 : -337.5
      for (const record of records) expect(record.scores).toEqual({ host: expected, guest: expected })
    },
    120_000
  )
}
