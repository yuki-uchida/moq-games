import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import { build, transform } from 'esbuild'
import { beforeAll, describe, expect, it } from 'vitest'
import { ScreamMeter } from '../src/match'

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

async function pair(flushTurns = 120) {
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

describe('actual main/peer clock with existing broker, no browser or I/O', () => {
  it.each(['host', 'guest'] as const)(
    'preserves raw subnormal %s loss through finished state and both UIs',
    async (loser) => {
      const game = await pair()
      try {
        game.host.setObservation(0)
        game.guest.setObservation(0)
        await game.ready(1000)
        const accrue = () => game.host.game.match.observe(new ScreamMeter(Number.MIN_VALUE), Number.MIN_VALUE, 0, 1000)
        if (loser === 'host') accrue()
        game.host.game.match.tick(900000)
        game.host.game.broadcast()
        await game.flush()
        await game.ready(1000)
        if (loser === 'guest') accrue()
        game.host.game.match.tick(899999 - game.host.game.inspect().snapshot.elapsedMs)
        await game.frames(1001)
        const expected =
          loser === 'host' ? { host: -Number.MIN_VALUE, guest: 0 } : { host: 0, guest: -Number.MIN_VALUE }
        expect(game.host.game.inspect().snapshot.scores).toEqual(expected)
        expect(game.guest.game.inspect().guestSnapshot.scores).toEqual(expected)
        for (const client of [game.host, game.guest]) {
          expect(client.text('scores')).toContain('-5e-324')
          expect(client.text('role')).toContain(loser === 'host' ? '参加者の勝ち' : '主催の勝ち')
        }
      } finally {
        game.close()
      }
    }
  )
  it.each(['constant', 'varying'] as const)(
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
  it.each([
    [16, 141, 143],
    [18, 141, 141]
  ])('scores an exact 300ms candidate split into %i/%i/%i ms before silence', async (...parts) => {
    const game = await pair()
    try {
      await game.ready(1400)
      game.host.setToneWindow(1400, 1700)
      await game.frames(1400)
      let now = 1400
      let expected = 0
      for (const duration of parts) {
        now += duration
        await game.frames(now)
        const state = game.host.game.inspect()
        expect(state.localVoiced).toBe(true)
        expected -= state.localRms * (duration / 1000)
        if (now < 1700) expect(state.snapshot.scores.host).toBe(0)
      }
      const before = game.host.game.inspect()
      expect(before.snapshot.paused).toBe(false)
      expect(before.snapshot.elapsedMs).toBe(300)
      expect(before.qualified).toBe(true)
      expect(before.pending).toBe(0)
      expect(before.snapshot.scores.host).toBeCloseTo(expected, 12)
      expect(before.snapshot.scores.host).toBeLessThan(0)
      await game.frames(1871)
      const after = game.host.game.inspect()
      expect(after.snapshot.paused).toBe(false)
      expect(after.localVoiced).toBe(false)
      expect(after.duration).toBe(0)
      expect(after.pending).toBe(0)
      expect(after.snapshot.scores).toEqual(before.snapshot.scores)
    } finally {
      game.close()
    }
  })

  it.each([
    [16, 141, 143],
    [18, 141, 141]
  ])('scores the guest candidate split into %i/%i/%i ms in the second round', async (...parts) => {
    const game = await pair()
    try {
      game.host.setToneWindow(2000, 2001)
      game.guest.setToneWindow(2000, 2001)
      await game.ready(1000)
      game.host.game.match.tick(899950)
      await game.frames(1050)
      await game.frames(1100)
      expect(game.host.game.inspect().snapshot.phase).toBe('intermission')
      await game.ready(1200)
      expect(game.guest.game.inspect().guestSnapshot.phase).toBe('round2')
      game.guest.setToneWindow(1200, 1500)

      const step = async (now: number) => {
        game.clock.now = now
        game.host.timers()
        game.guest.timers()
        await game.health()
        game.guest.frame()
        game.guest.game.health()
        await game.flush()
        game.host.frame()
        await game.flush()
      }

      await step(1200)
      let now = 1200
      let expected = 0
      for (const duration of parts) {
        now += duration
        await step(now)
        const host = game.host.game.inspect()
        const guest = game.guest.game.inspect()
        expect(host.remoteVoiced).toBe(true)
        expected -= guest.localRms * (duration / 1000)
        if (now < 1500) expect(host.snapshot.scores.guest).toBe(0)
      }
      const before = game.host.game.inspect()
      expect(before.snapshot.phase).toBe('round2')
      expect(before.snapshot.elapsedMs).toBe(300)
      expect(before.qualified).toBe(true)
      expect(before.pending).toBe(0)
      expect(before.snapshot.scores.host).toBe(0)
      expect(before.snapshot.scores.guest).toBeCloseTo(expected, 12)
      expect(before.snapshot.scores.guest).toBeLessThan(0)
      await step(1671)
      const after = game.host.game.inspect()
      expect(after.snapshot.paused).toBe(false)
      expect(after.remoteVoiced).toBe(false)
      expect(after.duration).toBe(0)
      expect(after.pending).toBe(0)
      expect(after.snapshot.scores).toEqual(before.snapshot.scores)
    } finally {
      game.close()
    }
  })

  it('discards a fractional pending candidate on pause before a fresh 300ms candidate', async () => {
    const game = await pair()
    try {
      await game.ready(1400)
      await game.frames(1418)
      await game.frames(1559)
      expect(game.host.game.inspect().pending).toBeGreaterThan(0)
      game.host.game.pause()
      await game.flush()
      const paused = game.host.game.inspect()
      expect(paused.snapshot.paused).toBe(true)
      expect(paused.duration).toBe(0)
      expect(paused.pending).toBe(0)
      await game.ready(2000)
      await game.frames(2141)
      await game.frames(2159)
      expect(game.host.game.inspect().snapshot.scores.host).toBe(0)
      await game.frames(2300)
      const after = game.host.game.inspect()
      expect(after.snapshot.paused).toBe(false)
      expect(after.pending).toBe(0)
      expect(after.snapshot.scores.host).toBeCloseTo(-after.localRms * 0.3, 12)
    } finally {
      game.close()
    }
  })

  it('starts first night at ready, not at the preceding frame', async () => {
    const game = await pair()
    try {
      await game.ready()
      game.host.game.holdKey('KeyW')
      const before = game.host.game.inspect()
      await game.frames(1450)
      const after = game.host.game.inspect()
      expect(after.snapshot.elapsedMs).toBeCloseTo(50, 9)
      expect(after.snapshot.scores.host).toBe(0)
      expect(after.duration).toBeCloseTo(0.05, 9)
      expect(Math.hypot(after.human.x - before.human.x, after.human.z - before.human.z)).toBeCloseTo(0.15, 9)
      for (const now of [1550, 1650]) await game.frames(now)
      expect(game.host.game.inspect().snapshot.scores.host).toBe(0)
      await game.frames(1700)
      const scored = game.host.game.inspect()
      expect(scored.snapshot.elapsedMs).toBeCloseTo(300, 9)
      expect(scored.snapshot.scores.host).toBeCloseTo(-scored.localRms * 0.3, 9)
      expect(scored.snapshot.scores.guest).toBe(0)
    } finally {
      game.close()
    }
  })

  it.each(['resume', 'round2'] as const)('excludes pre-%s time from clock, movement and meter', async (transition) => {
    const game = await pair()
    try {
      await game.ready(1000)
      for (const now of [1100, 1200]) await game.frames(now)
      expect(game.host.game.inspect().pending).toBeGreaterThan(0)
      if (transition === 'resume') game.host.game.pause()
      else {
        game.host.game.match.tick(899950 - game.host.game.inspect().snapshot.elapsedMs)
        await game.frames(1250)
      }
      await game.flush()
      const paused = game.host.game.inspect()
      for (const now of [1300, 1400]) await game.frames(now)
      expect(game.host.game.inspect().snapshot.scores).toEqual(paused.snapshot.scores)
      expect(game.host.game.inspect().pending).toBe(0)
      await game.ready(1800)
      game.host.game.holdKey('KeyW')
      const before = game.host.game.inspect()
      await game.frames(1850)
      const after = game.host.game.inspect()
      expect(after.snapshot.elapsedMs - before.snapshot.elapsedMs).toBeCloseTo(50, 9)
      expect(after.snapshot.scores).toEqual(before.snapshot.scores)
      expect(after.duration).toBeCloseTo(0.05, 9)
      const pose = transition === 'round2' ? 'haunter' : 'human'
      expect(Math.hypot(after[pose].x - before[pose].x, after[pose].z - before[pose].z)).toBeCloseTo(0.15, 9)
      for (const now of [1950, 2050]) await game.frames(now)
      expect(game.host.game.inspect().snapshot.scores).toEqual(before.snapshot.scores)
      await game.frames(2100)
      const scored = game.host.game.inspect()
      const survivor = transition === 'round2' ? 'guest' : 'host'
      expect(scored.snapshot.scores[survivor]).toBeCloseTo(-scored.localRms * 0.3, 9)
    } finally {
      game.close()
    }
  })

  it.each(
    ['start', 'resume', 'round2'].flatMap((transition) =>
      ['host', 'guest'].flatMap((role) => [500, 501, 600].map((gap) => ({ transition, role, gap })))
    )
  )('post-$transition $role stall $gap ms keeps the strict health boundary', async ({ transition, role, gap }) => {
    const game = await pair()
    try {
      let started = 1400
      if (transition !== 'start') {
        await game.ready(1000)
        await game.frames(1100)
        if (transition === 'resume') game.host.game.pause()
        else {
          game.host.game.match.tick(899950 - game.host.game.inspect().snapshot.elapsedMs)
          await game.frames(1200)
        }
        await game.flush()
        await game.frames(1300)
        started = 1700
      }
      await game.ready(started)
      game.clock.now = started + gap
      await game.health()
      if (role === 'host') game.host.frame()
      else game.guest.frame()
      await game.flush()
      const host = game.host.game.inspect(),
        guest = game.guest.game.inspect()
      expect(host.snapshot.paused).toBe(gap > 500)
      if (gap === 500 && role === 'host') expect(host.snapshot.elapsedMs).toBe(transition === 'resume' ? 600 : 500)
      if (gap > 500) expect(host.snapshot.scores).toEqual({ host: 0, guest: 0 })
    } finally {
      game.close()
    }
  })

  it('monitors the preceding frame independently after the activation frame', async () => {
    const game = await pair()
    try {
      await game.ready(1400)
      for (const now of [1450, 1950, 2450]) await game.frames(now)
      expect(game.host.game.inspect().snapshot.paused).toBe(false)
      expect(game.host.game.inspect().snapshot.elapsedMs).toBe(1050)
      const before = game.host.game.inspect().snapshot
      await game.frames(2951)
      expect(game.host.game.inspect().snapshot.paused).toBe(true)
      expect(game.host.game.inspect().snapshot.elapsedMs).toBe(before.elapsedMs)
      expect(game.host.game.inspect().snapshot.scores).toEqual(before.scores)
    } finally {
      game.close()
    }
  })

  it('allows an idle long frame when only 50 ms has passed since ready', async () => {
    const game = await pair()
    try {
      await game.ready(1800)
      await game.frames(1850)
      expect(game.host.game.inspect().snapshot.paused).toBe(false)
      expect(game.host.game.inspect().snapshot.elapsedMs).toBe(50)
      expect(game.guest.game.inspect().pendingStop).toBeUndefined()
    } finally {
      game.close()
    }
  })

  it('does not use cached delta when real broker delivers ready synchronously inside frame', async () => {
    const game = await pair()
    try {
      game.clock.now = 1400
      await game.health()
      game.host.click('ready')
      await game.flush()
      game.network.broker.hold = (packet: any) => packet.frame.value?.type === 'ready' && packet.frame.value.value
      game.guest.click('ready')
      await game.flush()
      expect(game.network.broker.pending.length).toBeGreaterThan(0)
      expect(game.host.game.inspect().snapshot.phase).toBe('lobby')
      game.clock.now = 1450
      game.host.game.holdKey('KeyW')
      const pose = game.host.game.inspect().human
      let delivered = false
      game.host.game.setSendHook((value: any) => {
        if (delivered || value.type !== 'health') return
        delivered = true
        game.network.broker.hold = undefined
        for (const packet of game.network.broker.pending.splice(0)) game.network.broker.deliver(packet)
      })
      game.host.frame()
      await game.flush()
      const after = game.host.game.inspect()
      expect(delivered).toBe(true)
      expect(after.snapshot.phase).toBe('round1')
      expect(after.snapshot.elapsedMs).toBe(0)
      expect(after.snapshot.scores.host).toBe(0)
      expect(after.human).toEqual(pose)
      expect(after.duration).toBe(0)
      await game.frames(1500)
      expect(game.host.game.inspect().snapshot.elapsedMs).toBe(50)
    } finally {
      game.close()
    }
  })

  it('resets guest turning time at start and resume but not on every state', async () => {
    const game = await pair()
    try {
      await game.ready(1400)
      game.guest.game.holdKey('ArrowRight')
      await game.frames(1450)
      expect(game.guest.game.inspect().turnTotal).toBeCloseTo(0.1, 9)
      await game.frames(1550)
      expect(game.guest.game.inspect().turnTotal).toBeCloseTo(0.3, 9)
      game.host.game.pause()
      await game.flush()
      await game.frames(1650)
      await game.ready(2050)
      await game.frames(2100)
      expect(game.guest.game.inspect().turnTotal).toBeCloseTo(0.1, 9)
    } finally {
      game.close()
    }
  })

  it.each(['round1', 'round2'])('clamps %s scoring to its last 50 ms', async (round) => {
    const game = await pair()
    try {
      await game.ready(1000)
      if (round === 'round2') {
        game.host.game.match.tick(900000)
        game.host.game.broadcast()
        await game.flush()
        await game.ready(1000)
      }
      for (const now of [1100, 1200, 1300, 1400]) await game.frames(now)
      const before = game.host.game.inspect()
      game.host.game.match.tick(899950 - before.snapshot.elapsedMs)
      await game.frames(1500)
      const after = game.host.game.inspect()
      const survivor = round === 'round1' ? 'host' : 'guest'
      expect(after.snapshot.elapsedMs).toBe(900000)
      expect(after.snapshot.phase).toBe(round === 'round1' ? 'intermission' : 'finished')
      expect(after.snapshot.scores[survivor] - before.snapshot.scores[survivor]).toBeCloseTo(-before.localRms * 0.05, 9)
      await game.frames(1700)
      expect(game.host.game.inspect().snapshot.scores).toEqual(after.snapshot.scores)
    } finally {
      game.close()
    }
  })

  it('keeps pause and resets pending penalty until both explicitly re-ready', async () => {
    const game = await pair()
    try {
      await game.ready(1000)
      await game.frames(1100)
      await game.frames(1200)
      game.guest.track.muted = true
      game.guest.frame()
      await game.flush()
      const paused = game.host.game.inspect()
      expect(paused.snapshot.paused).toBe(true)
      expect(paused.pending).toBe(0)
      expect(paused.remoteMic).toBe(false)
      game.guest.track.muted = false
      for (const now of [1300, 1400, 1500]) await game.frames(now)
      expect(game.host.game.inspect().snapshot).toEqual(paused.snapshot)
      expect(game.guest.game.inspect().pendingStop).toBeUndefined()
      game.host.click('ready')
      await game.flush()
      expect(game.host.game.inspect().snapshot.paused).toBe(true)
      game.guest.click('ready')
      await game.flush()
      expect(game.host.game.inspect().snapshot.paused).toBe(false)
      await game.frames(1550)
      expect(game.host.game.inspect().snapshot.elapsedMs - paused.snapshot.elapsedMs).toBe(50)
      expect(game.host.game.inspect().snapshot.scores).toEqual(paused.snapshot.scores)
    } finally {
      game.close()
    }
  })

  it('preserves nonzero scores through a healthy guest stop, ACK and explicit re-preparation', async () => {
    const game = await pair()
    try {
      await game.ready(1000)
      for (const now of [1100, 1200, 1300, 1400]) await game.frames(now)
      const before = game.host.game.inspect().snapshot
      expect(before.scores.host).toBeLessThan(0)
      game.guest.game.pause()
      await game.flush()
      expect(game.host.game.inspect().snapshot.paused).toBe(true)
      expect(game.guest.game.inspect().pendingStop).toBeUndefined()
      for (const now of [1500, 1600, 1700]) await game.frames(now)
      expect(game.host.game.inspect().snapshot.scores).toEqual(before.scores)
      expect(game.host.game.inspect().pending).toBe(0)
      expect(game.host.game.inspect().snapshot.elapsedMs).toBe(before.elapsedMs)
      await game.ready(2100)
      for (const now of [2150, 2250, 2350]) await game.frames(now)
      expect(game.host.game.inspect().snapshot.scores).toEqual(before.scores)
      await game.frames(2400)
      const after = game.host.game.inspect()
      expect(after.snapshot.elapsedMs - before.elapsedMs).toBeCloseTo(300, 9)
      expect(after.snapshot.scores.host - before.scores.host).toBeCloseTo(-after.localRms * 0.3, 9)
    } finally {
      game.close()
    }
  })

  it.each([500, 501])('retains remote response freshness boundary %i ms', async (age) => {
    const game = await pair()
    try {
      await game.ready(1000)
      game.clock.now = game.host.game.inspect().remoteSeen + age
      game.host.game.broadcast()
      expect(game.host.game.inspect().snapshot.paused).toBe(age > 500)
    } finally {
      game.close()
    }
  })
})

describe('independent elapsed main/peer boundary', () => {
  for (const night of [1, 2]) {
    for (const remaining of [1, 2 ** -33]) {
      it(`publishes and accepts night ${night} snapshots with ${remaining} ms remaining`, async () => {
        const game = await pair()
        try {
          game.host.setObservation(0)
          game.guest.setObservation(0)
          await game.ready(1000)
          if (night === 2) {
            game.host.game.match.tick(900000)
            game.host.game.broadcast()
            await game.flush()
            await game.ready(2000)
          }
          const previousGuest = game.guest.game.inspect().guestSnapshot
          game.host.game.match.tick(900000 - remaining)
          game.host.game.match.observe(new ScreamMeter(), 0, 0, (remaining * 3) / 4)
          const activeHost = game.host.game.inspect().snapshot
          game.host.game.broadcast()
          await game.flush()
          const activeGuest = game.guest.game.inspect().guestSnapshot
          expect(activeGuest).not.toEqual(previousGuest)
          expect(activeGuest).toEqual(activeHost)
          expect(activeHost.phase).toBe(night === 1 ? 'round1' : 'round2')
          expect(activeHost.elapsedMs).toBeLessThan(900000)
          game.host.game.match.observe(new ScreamMeter(), 0, 0, remaining / 4)
          game.host.game.broadcast()
          await game.flush()
          const completedHost = game.host.game.inspect().snapshot
          expect(completedHost).toMatchObject({ phase: night === 1 ? 'intermission' : 'finished', elapsedMs: 900000 })
          expect(game.guest.game.inspect().guestSnapshot).toEqual(completedHost)
        } finally {
          game.close()
        }
      })
    }
  }
})

describe('independent stop delivery around night boundaries', () => {
  for (const night of [1, 2]) {
    for (const delivery of ['before', 'after'] as const) {
      it(`handles the guest stop ${delivery} the night ${night} boundary`, async () => {
        const game = await pair()
        const states: any[] = []
        game.host.game.setSendHook((value: any) => {
          if (value.type === 'state') states.push(structuredClone(value))
        })
        try {
          game.host.setObservation(0.5)
          game.guest.setObservation(0.5)
          await game.ready(1000)
          if (night === 2) {
            game.host.game.match.tick(900000)
            game.host.game.broadcast()
            await game.flush()
            await game.ready(1400)
          } else {
            for (const now of [1100, 1200, 1300, 1400]) await game.frames(now)
          }
          const earnedScore = game.host.game.inspect().snapshot.scores.host
          if (night === 1) expect(earnedScore).toBeLessThan(0)
          game.host.game.match.tick(899950 - game.host.game.inspect().snapshot.elapsedMs)
          game.host.game.broadcast()
          await game.flush()
          game.network.broker.hold = (packet: any) => packet.frame.category === 'stop'
          game.guest.click('pause')
          await game.flush()
          expect(game.guest.game.inspect().pendingStop).toBeDefined()
          expect(game.network.broker.pending.length).toBeGreaterThan(0)
          const deliverStop = async () => {
            game.network.broker.hold = undefined
            for (const packet of game.network.broker.pending.splice(0)) game.network.broker.deliver(packet)
            await game.flush()
          }
          if (delivery === 'before') {
            await deliverStop()
            expect(game.host.game.inspect().snapshot).toMatchObject({ phase: `round${night}`, paused: true })
            expect(game.guest.game.inspect().pendingStop).toBeUndefined()
            await game.ready(1450)
            await game.frames(1500)
          } else {
            await game.frames(1450)
            await deliverStop()
          }
          const final = game.host.game.inspect().snapshot
          const finalFirstNightScore = final.scores.host
          expect(final.phase).toBe(night === 1 ? 'intermission' : 'finished')
          expect(game.guest.game.inspect().guestSnapshot.phase).toBe(final.phase)
          expect(game.guest.game.inspect().guestSnapshot.scores).toEqual(final.scores)
          if (night === 1) {
            expect(states.at(-1).voluntaryPause).toBe(false)
            expect(game.guest.game.inspect().pendingStop).toBeUndefined()
            await game.ready(1600)
            expect(game.host.game.inspect().snapshot).toMatchObject({
              phase: 'round2',
              survivor: 'guest',
              elapsedMs: 0,
              paused: false,
              scores: { host: finalFirstNightScore, guest: 0 }
            })
            expect(game.guest.game.inspect().guestSnapshot.phase).toBe('round2')
          } else {
            expect(game.host.game.inspect().finished).toBe(true)
            expect(game.guest.game.inspect().finished).toBe(true)
          }
        } finally {
          game.close()
        }
      })
    }
  }
})
