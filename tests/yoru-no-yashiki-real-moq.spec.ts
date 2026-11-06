import { chromium, expect, test as base, type BrowserContext, type BrowserServer, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import type { Buffer } from 'node:buffer'
import sharp from 'sharp'
import type { WebGLRenderer } from 'three'
import type { PeerOptions, PeerStatus } from '../examples/games/yoru-no-yashiki/src/peer'
import type { WorldFrame } from '../examples/games/yoru-no-yashiki/src/world'
import { startRealMoq } from './yoru-no-yashiki-real-moq-server.mjs'
import { installHealthTransportDiagnostics, type HealthTransportEvidence } from './yoru-no-yashiki-health-diagnostics'

const rendererMode = process.env.YORU_REAL_MOQ_RENDERER ?? 'swiftshader'
if (rendererMode !== 'swiftshader' && rendererMode !== 'hardware')
  throw new Error('YORU_REAL_MOQ_RENDERER must be swiftshader or hardware')
const viewport =
  rendererMode === 'hardware' ? { width: 960, height: 600, dpr: 1 } : { width: 640, height: 480, dpr: 0.5 }
const softwareRenderer =
  /swiftshader|llvmpipe|softpipe|lavapipe|\bwarp\b|software|basic render|gdi generic|virtualbox|vmware|virgl/i
const hardwareRenderer = /nvidia|geforce|quadro|tesla|\bamd\b|radeon|intel|apple|adreno|mali|powervr|videocore/i

type RealMoq = Awaited<ReturnType<typeof startRealMoq>>
type Pair = { host: Page; guest: Page; guestServer: BrowserServer; environment: RealMoq }
type RenderSample = {
  at: number
  durationMs: number
  drawCalls: number
  triangles: number
  contextLost: boolean
  phase: string | null | undefined
  connection: string | null | undefined
  timer: string | null | undefined
  effect: string | null
  role: string
}
type RenderingEvidence = {
  enabled: boolean
  viewport: { width: number; height: number; dpr: number }
  gpu: string
  buffer: { width: number; height: number }
  samples: RenderSample[]
  transitions: { at: number; phase: string | null | undefined; connection: string | null | undefined }[]
}

type HealthEvent = {
  at: number
  event: 'send' | 'receive' | 'send-return' | 'receive-return' | 'state' | 'status'
  call?: number
  challenge?: number
  epoch?: number
  phase?: string | null
  playing?: boolean
  sincePreviousMs?: number
  hostObservedRttMs?: number | null
  guestResponseDelayMs?: number | null
  outcome?: 'returned' | 'threw'
  sendReturned?: boolean
  connected?: boolean
  healthExpired?: boolean
  interruptionReason?: string
  status?: PeerStatus
}
type HealthEvidence = {
  role: 'host' | 'guest'
  startedAt: number
  eventLimit: number
  correlationLimit: number
  droppedEvents: number
  correlationEvictions: number
  lastSendAt?: number
  lastReceiveAt?: number
  events: HealthEvent[]
}

async function observeHealth(page: Page, role: HealthEvidence['role']) {
  await page.evaluate(async (role) => {
    const modulePath = '/src/peer.ts'
    const { HorrorPeer } = await import(/* @vite-ignore */ modulePath)
    const evidence: HealthEvidence = {
      role,
      startedAt: performance.now(),
      eventLimit: 2048,
      correlationLimit: 256,
      droppedEvents: 0,
      correlationEvictions: 0,
      events: []
    }
    Object.assign(window, { realMoqHealth: evidence })
    const challenges = new Map<number, number>()
    let call = 0
    const record = (event: HealthEvent) => {
      if (evidence.events.length === evidence.eventLimit) {
        evidence.events.shift()
        evidence.droppedEvents++
      }
      evidence.events.push(event)
    }
    const remember = (challenge: number, at: number) => {
      if (challenges.has(challenge)) return
      challenges.set(challenge, at)
      if (challenges.size > evidence.correlationLimit) {
        challenges.delete(challenges.keys().next().value!)
        evidence.correlationEvictions++
      }
    }
    const observe = <Method extends (...args: never[]) => unknown>(method: Method, event: 'send' | 'receive') =>
      new Proxy(method, {
        apply(target, receiver, args: unknown[]) {
          const value = args[0]
          if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'health')
            return Reflect.apply(target, receiver, args)
          const message = value as Record<string, unknown>
          const at = performance.now()
          const challenge = Number.isSafeInteger(message.challenge) ? (message.challenge as number) : undefined
          const health = {
            call: ++call,
            challenge,
            epoch: Number.isSafeInteger(message.epoch) ? (message.epoch as number) : undefined,
            phase: typeof message.phase === 'string' ? message.phase : undefined,
            playing: typeof message.playing === 'boolean' ? message.playing : undefined
          }
          const previous = event === 'send' ? evidence.lastSendAt : evidence.lastReceiveAt
          if (event === 'send') evidence.lastSendAt = at
          else evidence.lastReceiveAt = at
          if (
            challenge !== undefined &&
            ((role === 'host' && event === 'send') || (role === 'guest' && event === 'receive'))
          )
            remember(challenge, at)
          const requestAt = challenge === undefined ? undefined : challenges.get(challenge)
          record({
            at,
            event,
            ...health,
            sincePreviousMs: previous === undefined ? undefined : at - previous,
            ...(role === 'host' && event === 'receive'
              ? { hostObservedRttMs: requestAt === undefined ? null : at - requestAt }
              : {}),
            ...(role === 'guest' && event === 'send'
              ? { guestResponseDelayMs: requestAt === undefined ? null : at - requestAt }
              : {})
          })
          let returned = false
          let result: unknown
          try {
            result = Reflect.apply(target, receiver, args)
            returned = true
            return result
          } finally {
            record({
              at: performance.now(),
              event: event === 'send' ? 'send-return' : 'receive-return',
              ...health,
              outcome: returned ? 'returned' : 'threw',
              ...(event === 'send' && typeof result === 'boolean' ? { sendReturned: result } : {})
            })
          }
        }
      })
    HorrorPeer.prototype.send = observe(HorrorPeer.prototype.send, 'send')
    const observedOptions = new WeakSet<PeerOptions>()
    HorrorPeer.prototype.connect = new Proxy(HorrorPeer.prototype.connect, {
      apply(target, receiver: { options: PeerOptions }, args: unknown[]) {
        const options = receiver.options
        if (!observedOptions.has(options)) {
          observedOptions.add(options)
          options.onMessage = observe(options.onMessage, 'receive')
          options.onStatus = new Proxy(options.onStatus, {
            apply(callback, callbackReceiver, callbackArgs: Parameters<PeerOptions['onStatus']>) {
              record({ at: performance.now(), event: 'status', status: callbackArgs[0] })
              return Reflect.apply(callback, callbackReceiver, callbackArgs)
            }
          })
        }
        return Reflect.apply(target, receiver, args)
      }
    })
    const interruptionReasons = new Map([
      ['相手の応答がありません。', 'health-expired'],
      ['相手の音声情報が不正なため中断しました。', 'invalid-health'],
      ['相手のマイクが利用できません。再確認してください。', 'remote-microphone-unavailable'],
      ['MoQ接続が切れました。双方で終了してやり直してください。', 'disconnected'],
      ['画面が停止したため中断しました。両者で再開してください。', 'frame-stalled'],
      ['マイクを再接続しています。', 'microphone-reconnecting'],
      ['マイクが停止しました。もう一度許可してください。', 'microphone-stopped'],
      ['マイク音声を解析できません。もう一度許可してください。', 'microphone-analysis-unavailable'],
      ['マイクを利用できません。ブラウザの許可を確認してください。', 'microphone-unavailable'],
      ['接続と両者のマイクを確認してください。', 'readiness-unavailable']
    ])
    let previousState = ''
    const recordState = () => {
      const state = {
        phase: document.querySelector('#phase')?.textContent,
        connected: document.querySelector('#connection')?.textContent === 'MoQで相手と接続しました',
        healthExpired: document.querySelector('#notice')?.textContent === '相手の応答がありません。',
        interruptionReason: interruptionReasons.get(document.querySelector('#notice')?.textContent ?? '')
      }
      const serialized = JSON.stringify(state)
      if (serialized !== previousState) record({ at: performance.now(), event: 'state', ...state })
      previousState = serialized
    }
    const observer = new MutationObserver(recordState)
    for (const selector of ['#phase', '#connection', '#notice'])
      observer.observe(document.querySelector(selector)!, { subtree: true, childList: true, characterData: true })
    recordState()
  }, role)
  await page.evaluate(installHealthTransportDiagnostics, role)
}

const test = base.extend<{ pair: Pair; realRendering: boolean }>({
  realRendering: [false, { option: true }],
  pair: async ({ realRendering }, use, testInfo) => {
    const environment = await startRealMoq()
    const servers: BrowserServer[] = []
    const contexts: BrowserContext[] = []
    const pages: Page[] = []
    const events: string[] = []
    const blocked: string[] = []
    const blockedDevSockets: string[] = []
    const browserPids: number[] = []
    try {
      for (const role of ['host', 'guest'] as const) {
        const server = await chromium.launchServer({
          host: '127.0.0.1',
          executablePath: environment.chrome,
          headless: true,
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            ...(rendererMode === 'swiftshader' ? ['--use-angle=swiftshader'] : []),
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-background-networking',
            '--disable-component-update',
            '--disable-sync',
            '--disable-domain-reliability',
            '--no-first-run',
            '--no-default-browser-check',
            '--metrics-recording-only',
            '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
            `--ignore-certificate-errors-spki-list=${environment.spki}`,
            `--origin-to-force-quic-on=${new URL(environment.relayURL).host}`
          ]
        })
        servers.push(server)
        browserPids.push(server.process().pid!)
        const browser = await chromium.connect(server.wsEndpoint())
        const context = await browser.newContext({
          baseURL: environment.baseURL,
          permissions: ['microphone'],
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: viewport.dpr,
          serviceWorkers: 'block'
        })
        contexts.push(context)
        await context.tracing.start({ snapshots: true, screenshots: false, sources: true })
        await context.route('**/*', async (route) => {
          const url = new URL(route.request().url())
          if (
            url.origin === environment.baseURL &&
            !url.pathname.includes('__yoru_moq') &&
            !url.pathname.includes('moq-mock')
          ) {
            await route.continue()
          } else {
            blocked.push(url.href)
            await route.abort('blockedbyclient')
          }
        })
        await context.routeWebSocket('**/*', (socket) => {
          if (new URL(socket.url()).hostname === '127.0.0.1') blockedDevSockets.push(socket.url())
          else blocked.push(socket.url())
          socket.close()
        })
        await context.addInitScript(
          ({ relayURL }) => {
            const transports: { url: string; ready: boolean; closed: boolean; error?: string }[] = []
            const original = window.WebTransport
            Object.assign(window, { realMoqTransports: transports })
            window.WebTransport = new Proxy(original, {
              construct(target, args: ConstructorParameters<typeof WebTransport>) {
                if (args[0] !== relayURL) throw new Error('Only this test-owned loopback relay is allowed')
                const state = { url: String(args[0]), ready: false, closed: false, error: '' }
                transports.push(state)
                const transport = new target(...args)
                void transport.ready.then(
                  () => {
                    state.ready = true
                  },
                  (error: Error) => {
                    state.error = String(error)
                  }
                )
                void transport.closed.then(
                  () => {
                    state.closed = true
                  },
                  (error: Error) => {
                    state.error = String(error)
                  }
                )
                return transport
              }
            })
          },
          { relayURL: environment.relayURL }
        )
        const page = await context.newPage()
        pages.push(page)
        page.on('console', (message) => {
          events.push(`${Date.now()} ${role} console ${message.type()}: ${message.text()}`)
        })
        page.on('pageerror', (error) => {
          events.push(`${Date.now()} ${role} pageerror: ${error}`)
        })
        page.on('requestfailed', (request) => {
          events.push(`${Date.now()} ${role} requestfailed: ${request.url()} ${request.failure()?.errorText}`)
        })
        await page.goto('/')
        if (realRendering) await observeHealth(page, role)
        await page.evaluate(async (realRendering) => {
          const modulePath = '/src/world.ts'
          const { HorrorWorld } = await import(/* @vite-ignore */ modulePath)
          const original = HorrorWorld.prototype.render
          const frames: WorldFrame[] = []
          const rendering: RenderingEvidence = {
            enabled: realRendering,
            viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
            gpu: '',
            buffer: { width: 0, height: 0 },
            samples: [],
            transitions: []
          }
          Object.assign(window, { realMoqFrames: frames, realMoqRendering: rendering })
          let previous = ''
          if (realRendering) {
            new MutationObserver(() => {
              const state = {
                phase: document.querySelector('#phase')?.textContent,
                connection: document.querySelector('#connection')?.textContent,
                notice: document.querySelector('#notice')?.textContent,
                microphone: document.querySelector('#mic-status')?.textContent
              }
              const serialized = JSON.stringify(state)
              if (serialized !== previous) rendering.transitions.push({ at: performance.now(), ...state })
              previous = serialized
            }).observe(document.body, { subtree: true, childList: true, characterData: true })
          }
          HorrorWorld.prototype.render = function (frame: WorldFrame) {
            const began = performance.now()
            if ((window as unknown as { yoruForceNear?: boolean }).yoruForceNear) {
              frame.haunter.x = frame.human.x + 1
              frame.haunter.z = frame.human.z
            }
            if (realRendering) {
              original.call(this, frame)
              const renderer = (this as unknown as { renderer: WebGLRenderer }).renderer
              const gl = renderer.getContext()
              if (!rendering.gpu) {
                const debug = gl.getExtension('WEBGL_debug_renderer_info')
                rendering.gpu = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
                rendering.buffer = { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight }
              }
              rendering.samples.push({
                at: performance.now(),
                durationMs: performance.now() - began,
                drawCalls: renderer.info.render.calls,
                triangles: renderer.info.render.triangles,
                contextLost: gl.isContextLost(),
                phase: document.querySelector('#phase')?.textContent,
                connection: document.querySelector('#connection')?.textContent,
                timer: document.querySelector('#timer')?.textContent,
                effect: frame.effect?.kind ?? null,
                role: frame.role
              })
            }
            const state = window as unknown as { realMoqFrames: WorldFrame[] }
            state.realMoqFrames.push(structuredClone(frame))
            if (state.realMoqFrames.length > 1200) state.realMoqFrames.shift()
          }
        }, realRendering)
        await page.locator('#relay-url').fill(environment.relayURL)
      }
      expect(browserPids[0]).toBeGreaterThan(0)
      expect(browserPids[1]).toBeGreaterThan(0)
      expect(browserPids[0]).not.toBe(browserPids[1])
      await use({ host: pages[0], guest: pages[1], guestServer: servers[1], environment })
      if (realRendering) {
        const interruptions = await Promise.all(
          pages.map((page) =>
            page.evaluate(() =>
              (window as unknown as { realMoqRendering: RenderingEvidence }).realMoqRendering.transitions.filter(
                (state) => state.phase === '中断中'
              )
            )
          )
        )
        expect(interruptions, '観測区間後から試験本体終了までの中断も見落とさない').toEqual([[], []])
      }
      expect(blocked, 'external or mocked network requests are forbidden').toEqual([])
      expect(events.filter((event) => event.includes(' pageerror:'))).toEqual([])
    } finally {
      const states = await Promise.all(
        pages.map((page) =>
          page
            .evaluate(() => ({
              phase: document.querySelector('#phase')?.textContent,
              notice: document.querySelector('#notice')?.textContent,
              connection: document.querySelector('#connection')?.textContent,
              microphone: document.querySelector('#mic-status')?.textContent,
              rendering: (window as unknown as { realMoqRendering: unknown }).realMoqRendering,
              transports: (window as unknown as { realMoqTransports: unknown }).realMoqTransports
            }))
            .catch(() => ({ closed: true }))
        )
      )
      try {
        if (realRendering) {
          await Promise.all(
            pages.map(async (page, index) => {
              if (!page.isClosed()) {
                const path = testInfo.outputPath(`browser-${index}-final.png`)
                await page.screenshot({ path, timeout: 5_000 }).then(
                  () => testInfo.attach(`browser-${index}-final`, { path, contentType: 'image/png' }),
                  (error) => {
                    events.push(`browser-${index} final screenshot: ${error}`)
                  }
                )
              }
            })
          )
        }
        for (const [index, context] of contexts.entries()) {
          await context.tracing.stop({ path: testInfo.outputPath(`browser-${index}.zip`) }).catch(() => {})
        }
      } finally {
        const health = realRendering
          ? await Promise.allSettled(
              pages.map((page) =>
                page.evaluate(() => {
                  const evidence = (window as unknown as { realMoqHealth: HealthEvidence }).realMoqHealth
                  if (!evidence) throw new Error('Health observation was not installed')
                  const transport = (window as unknown as { realMoqHealthTransport: HealthTransportEvidence })
                    .realMoqHealthTransport
                  if (!transport) throw new Error('Health transport observation was not installed')
                  const capturedAt = performance.now()
                  return {
                    ...evidence,
                    transport,
                    capturedAt,
                    sinceLastSendMs: evidence.lastSendAt === undefined ? null : capturedAt - evidence.lastSendAt,
                    sinceLastReceiveMs:
                      evidence.lastReceiveAt === undefined ? null : capturedAt - evidence.lastReceiveAt
                  }
                })
              )
            )
          : []
        const cleanup = await Promise.allSettled(servers.map((server) => server.close()))
        try {
          await environment.stop()
        } finally {
          if (realRendering) {
            const healthPath = testInfo.outputPath('real-moq-health.json')
            await writeFile(
              healthPath,
              JSON.stringify(
                {
                  clock: 'Each page uses only its own performance.now(); never subtract timestamps across pages.',
                  boundaries:
                    'send is a product request; sendReturned is queue acceptance, not wire delivery. receive is entry to the product handler, not proof of health validation.',
                  timing:
                    'RTT is host send to host handler entry; response delay is guest handler entry to guest send. null means no retained matching challenge.',
                  transportBoundaries: [
                    'outbox-enqueue/dequeue observe the instance array; outbox-replace is detected at enqueue return. accepted is only app queue acceptance.',
                    'sdk-call-return is synchronous return, NOT Promise settlement, stream completion, wire delivery or remote receipt. Original Promises are returned untouched; no settlement handlers are attached.',
                    'sdk-call-throw is a synchronous throw. terminate/send-failed reports the product flush catch, not proof that a particular SDK Promise rejected.',
                    'sdk-handler-entry is delivery by the SDK subscription handler (possibly after SDK buffering), NOT raw network arrival.',
                    'dispatchedToHealthHandler only distinguishes peer dispatch from peer filtering; app health acceptance/rejection and its internal reasons are not exposed.',
                    'Interruption reasons are allowlisted DOM observations; MutationObserver may coalesce synchronous changes. No private app state is inferred.',
                    'Correlate within each page by peer/call and across pages by direction, category, sequence, challenge, epoch and group/object. Clocks are independent; alias is local.',
                    'Each page retains at most 4096 transport events and 2048 app health events. Dropped counts and observerErrors must be checked; diagnostics add synchronous work.'
                  ],
                  pages: health.map((result, index) => ({
                    role: index === 0 ? 'host' : 'guest',
                    ...(result.status === 'fulfilled' ? { evidence: result.value } : { collectionFailed: true })
                  }))
                },
                null,
                2
              )
            )
            await testInfo.attach('real-moq-health', { path: healthPath, contentType: 'application/json' })
          }
          const path = testInfo.outputPath('real-moq-diagnostics.json')
          await writeFile(
            path,
            JSON.stringify(
              {
                ...environment.diagnostics(),
                rendererMode,
                browserPids,
                browserExitCodes: servers.map((server) => server.process().exitCode),
                browserExitSignals: servers.map((server) => server.process().signalCode),
                states,
                blocked,
                blockedDevSockets,
                events
              },
              null,
              2
            )
          )
          await testInfo.attach('real-moq-diagnostics', { path, contentType: 'application/json' })
        }
        for (const result of cleanup) if (result.status === 'rejected') throw result.reason
        for (const result of health) if (result.status === 'rejected') throw result.reason
      }
    }
  }
})

async function firstNight({ host, guest, environment }: Pair) {
  await test.step('実SDK/WebTransportで双方向接続', async () => {
    await host.locator('#host').click()
    await expect(host.locator('#room-code')).toHaveValue(/^[a-f0-9]{32}$/)
    await guest.locator('#room-code').fill(await host.locator('#room-code').inputValue())
    await guest.locator('#guest').click()
    for (const page of [host, guest]) {
      await expect(page.locator('#connection')).toHaveText('MoQで相手と接続しました')
      expect(
        await page.evaluate(
          () =>
            (
              window as unknown as {
                realMoqTransports: { url: string; ready: boolean }[]
              }
            ).realMoqTransports
        )
      ).toEqual([expect.objectContaining({ url: environment.relayURL, ready: true })])
    }
  })
  await test.step('Chromeの偽マイクと製品の準備操作で第一夜へ進む', async () => {
    for (const page of [host, guest]) await page.locator('#microphone').click()
    for (const page of [host, guest]) await expect(page.locator('#ready')).toBeEnabled()
    await guest.locator('#ready').click()
    await host.locator('#ready').click()
    for (const page of [host, guest]) await expect(page.locator('#phase')).toHaveText('第一夜')
  })
}

test('実MoQ: 探索・怪異演出・実時間10秒以上の安定稼働（描画なし）', async ({ pair }, testInfo) => {
  const { host, guest } = pair
  await firstNight(pair)
  await test.step('人間が探索した手掛かりを両者へ同期', async () => {
    await host.keyboard.press('KeyE')
    for (const page of [host, guest]) await expect(page.locator('#ritual-story')).toContainText('畳の下の手紙')
  })
  await test.step('怪異の暗転要求と演出イベントを両者へ同期（画素は検査しない）', async () => {
    await guest.keyboard.press('Digit2')
    await expect(guest.locator('#spirit-energy')).not.toHaveText('霊力 100 / 100')
    for (const page of [host, guest]) {
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as {
                realMoqFrames: { effect?: { kind: string } }[]
              }
            ).realMoqFrames.some((frame) => frame.effect?.kind === 'blackout')
          )
        )
        .toBe(true)
    }
  })
  await test.step('時計や500ms健康閾値を変えず10秒以上連続稼働', async () => {
    const start = Date.now()
    const samples = await Promise.all(
      [host, guest].map((page) =>
        page.evaluate(async () => {
          const read = () => ({
            phase: document.querySelector('#phase')?.textContent,
            connection: document.querySelector('#connection')?.textContent,
            notice: document.querySelector('#notice')?.textContent,
            timer: document.querySelector('#timer')?.textContent ?? ''
          })
          const states = [read()]
          const began = performance.now()
          while (performance.now() - began < 10_500) {
            await new Promise((done) => setTimeout(done, 50))
            states.push(read())
          }
          return states
        })
      )
    )
    await writeFile(testInfo.outputPath('stability.json'), JSON.stringify(samples, null, 2))
    expect(Date.now() - start).toBeGreaterThanOrEqual(10_000)
    for (const states of samples) {
      expect(states.length).toBeGreaterThan(1)
      const seconds = (timer: string) => timer.split(':').reduce((total, part) => total * 60 + Number(part), 0)
      expect(seconds(states[0].timer) - seconds(states[states.length - 1].timer)).toBeGreaterThanOrEqual(10)
      for (const state of states) {
        expect(state, 'an interruption must not be hidden by retrying preparation').toMatchObject({
          phase: '第一夜',
          connection: 'MoQで相手と接続しました'
        })
      }
    }
  })
})

test('実MoQ: 独立した相手Chromeの離脱で中断し再準備不可になる', async ({ pair }) => {
  await firstNight(pair)
  await pair.guestServer.close()
  await expect(pair.host.locator('#phase')).toHaveText('中断中', { timeout: 10_000 })
  await expect(pair.host.locator('#connection')).toHaveText('MoQ接続が切れています。終了してやり直してください。')
  await expect(pair.host.locator('#ready')).toBeDisabled()
})

for (const survivor of ['host', 'guest'] as const) {
  test(`実MoQ: 相手の離脱後に${survivor}側の偽マイクを停止する`, async ({ pair }) => {
    for (const page of [pair.host, pair.guest]) {
      await page.evaluate(() => {
        const media = navigator.mediaDevices
        const getUserMedia = media.getUserMedia.bind(media)
        media.getUserMedia = async (constraints) => {
          const stream = await getUserMedia(constraints)
          Object.assign(window, { diagnosticTracks: stream.getAudioTracks() })
          return stream
        }
      })
    }
    await firstNight(pair)
    const active = pair[survivor]
    const leaving = survivor === 'host' ? pair.guest : pair.host
    const tracks = () =>
      active.evaluate(() =>
        (window as unknown as { diagnosticTracks: MediaStreamTrack[] }).diagnosticTracks.map(
          (track) => track.readyState
        )
      )
    expect(await tracks()).toEqual(['live'])
    await leaving.close()
    await expect(active.locator('#connection')).toHaveText('MoQ接続が切れています。終了してやり直してください。', {
      timeout: 20_000
    })
    await expect.poll(tracks, { timeout: 10_000 }).toEqual(['ended'])
    await expect(active.locator('#phase')).toHaveText('中断中', { timeout: 10_000 })
    await expect(active.locator('#ready')).toBeDisabled()
    await expect(active.locator('#mic-status')).toContainText('録音表示を確認')
  })
}

test.describe('実MoQ・実WebGL', () => {
  test.use({ realRendering: true })

  test('描画あり: 独立二画面で探索・暗転・実時間10秒以上を中断なしで継続', async ({ pair }, testInfo) => {
    const pages = [pair.host, pair.guest]
    const [host, guest] = pages
    await firstNight(pair)
    const started = Date.now()
    const began = await Promise.all(pages.map((page) => page.evaluate(() => performance.now())))
    const pixels: { stage: string; images: { mean: number; deviation: number }[] }[] = []
    const capture = async (stage: string) => {
      const images = await Promise.all(
        pages.map(async (page, index) => {
          const path = testInfo.outputPath(`browser-${index}-${stage}.png`)
          const png = await page.locator('#world canvas').screenshot({ path, timeout: 5_000 })
          await testInfo.attach(`browser-${index}-${stage}`, { path, contentType: 'image/png' })
          const stats = await sharp(png).removeAlpha().stats()
          return {
            mean: stats.channels.reduce((total, channel) => total + channel.mean, 0) / stats.channels.length,
            deviation: Math.max(...stats.channels.map((channel) => channel.stdev))
          }
        })
      )
      pixels.push({ stage, images })
    }
    await test.step('両画面の実WebGL通常描画を保存', () => capture('normal'))
    await test.step('製品操作で手掛かり探索と怪異暗転を同期・描画', async () => {
      await pair.host.keyboard.press('KeyE')
      for (const page of pages) await expect(page.locator('#ritual-story')).toContainText('畳の下の手紙')
      await pair.guest.keyboard.press('Digit2')
      await expect(pair.guest.locator('#spirit-energy')).not.toHaveText('霊力 100 / 100')
      const peakElapsed = () =>
        host.evaluate(() => {
          const frames = (window as unknown as { realMoqFrames: WorldFrame[] }).realMoqFrames
          const frame = frames.at(-1)
          if (!frame?.effect || frame.effect.kind !== 'blackout') return null
          const elapsed = frame.time - frame.effect.startedAt
          return elapsed >= 1.4 && elapsed <= 2.1 ? elapsed : null
        })
      await expect.poll(peakElapsed, { timeout: 8_000 }).not.toBeNull()
      await capture('blackout')
    })
    await test.step('実時間10.5秒の描画・時計進行・両者の無中断を検査', async () => {
      await pair.host.waitForTimeout(Math.max(0, 10_500 - (Date.now() - started)))
      const evidence = await Promise.all(
        pages.map((page, index) =>
          page.evaluate((began) => {
            const rendering = (window as unknown as { realMoqRendering: RenderingEvidence }).realMoqRendering
            const samples = rendering.samples.filter((sample) => sample.at >= began)
            const ended = performance.now()
            const gaps = samples.map((sample, offset) => sample.at - (offset ? samples[offset - 1].at : began))
            gaps.push(ended - (samples.at(-1)?.at ?? began))
            return {
              ...rendering,
              samples,
              transitions: rendering.transitions.filter((state) => state.at >= began),
              observedMs: ended - began,
              frameCount: samples.length,
              maxFrameGapMs: Math.max(...gaps),
              maxRenderDurationMs: Math.max(...samples.map((sample) => sample.durationMs)),
              transports: (window as unknown as { realMoqTransports: unknown }).realMoqTransports
            }
          }, began[index])
        )
      )
      await capture('recovered')
      const path = testInfo.outputPath('rendering-evidence.json')
      await writeFile(
        path,
        JSON.stringify({ rendererMode, elapsedMs: Date.now() - started, pixels, evidence }, null, 2)
      )
      await testInfo.attach('rendering-evidence', { path, contentType: 'application/json' })
      for (const result of evidence) {
        expect(result.viewport).toEqual(viewport)
        if (rendererMode === 'hardware') {
          expect(result.gpu, 'ソフトウェア描画を実GPUとして扱わない').not.toMatch(softwareRenderer)
          expect(result.gpu, '既知の実GPU識別子が必要（不明rendererは失敗）').toMatch(hardwareRenderer)
        } else {
          expect(result.gpu).toContain('SwiftShader')
        }
        expect(result.buffer.width).toBeGreaterThan(0)
        expect(result.buffer.height).toBeGreaterThan(0)
        expect(result.observedMs).toBeGreaterThanOrEqual(10_000)
        expect(result.frameCount).toBeGreaterThanOrEqual(21)
        expect(result.maxFrameGapMs, '500msの製品安全閾値内で実描画が継続する').toBeLessThan(500)
        expect(result.samples.at(-1)!.at - result.samples[0].at).toBeGreaterThanOrEqual(10_000)
        const seconds = (timer: string) => timer.split(':').reduce((total, part) => total * 60 + Number(part), 0)
        expect(seconds(result.samples[0].timer!) - seconds(result.samples.at(-1)!.timer!)).toBeGreaterThanOrEqual(10)
        expect(
          result.samples.filter(
            (sample) =>
              sample.phase !== '第一夜' ||
              sample.connection !== 'MoQで相手と接続しました' ||
              sample.contextLost ||
              sample.drawCalls <= 0 ||
              sample.triangles <= 0
          ),
          '全観測フレームで接続・実描画・第一夜を維持する'
        ).toEqual([])
        expect(
          result.transitions.filter(
            (state) => state.phase !== '第一夜' || state.connection !== 'MoQで相手と接続しました'
          ),
          '再準備や一時中断を成功扱いにしない'
        ).toEqual([])
        expect(result.samples.some((sample) => sample.effect === 'blackout')).toBe(true)
        expect(result.transports).toEqual([
          expect.objectContaining({ url: pair.environment.relayURL, ready: true, closed: false, error: '' })
        ])
      }
      for (const index of [0, 1]) {
        expect(pixels[0].images[index].deviation).toBeGreaterThan(0)
        expect(pixels[1].images[index].mean, '暗転のピークでは通常時の半分以下まで減光する').toBeLessThanOrEqual(
          pixels[0].images[index].mean * 0.5
        )
      }
      for (const index of [0, 1]) {
        expect(pixels[2].images[index].mean, '暗転後に実画素の明るさが回復する').toBeGreaterThan(
          pixels[1].images[index].mean
        )
      }
    })
  })

  test('描画あり: 出現は人間にだけ一時的に現れ、ピークで接近して消える', async ({ pair }, testInfo) => {
    const { host, guest } = pair
    await firstNight(pair)
    await Promise.all([host, guest].map((page) => page.evaluate(() => Object.assign(window, { yoruForceNear: true }))))
    await host.waitForTimeout(300)
    const shoot = async (stage: string) => {
      const path = testInfo.outputPath(`browser-0-${stage}.png`)
      const png = await host.locator('#world canvas').screenshot({ path, timeout: 5_000 })
      await testInfo.attach(`browser-0-${stage}`, { path, contentType: 'image/png' })
      return png
    }
    const difference = async (first: Buffer, second: Buffer) => {
      const [a, b] = await Promise.all([
        sharp(first).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
        sharp(second).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      ])
      expect(a.info).toEqual(b.info)
      let total = 0
      for (let index = 0; index < a.data.length; index++) total += Math.abs(a.data[index] - b.data[index])
      return total / a.data.length
    }
    const currentElapsed = () =>
      host.evaluate(() => {
        const frames = (window as unknown as { realMoqFrames: WorldFrame[] }).realMoqFrames
        const frame = frames.at(-1)
        if (!frame?.effect || frame.effect.kind !== 'apparition') return null
        return frame.time - frame.effect.startedAt
      })
    const normal = await shoot('apparition-normal')
    await guest.keyboard.press('Digit1')
    await expect.poll(currentElapsed, { timeout: 8_000 }).not.toBeNull()
    await expect
      .poll(async () => {
        const elapsed = await currentElapsed()
        return elapsed !== null && elapsed >= 1.4 && elapsed <= 2.1 ? elapsed : null
      })
      .not.toBeNull()
    const peak = await shoot('apparition-peak')
    await expect
      .poll(
        async () => {
          const elapsed = await currentElapsed()
          return elapsed !== null && elapsed >= 3.6 ? elapsed : null
        },
        { timeout: 8_000 }
      )
      .not.toBeNull()
    const gone = await shoot('apparition-gone')
    const peakDifference = await difference(normal, peak)
    const goneDifference = await difference(normal, gone)
    const path = testInfo.outputPath('apparition-evidence.json')
    await writeFile(path, JSON.stringify({ peakDifference, goneDifference }, null, 2))
    await testInfo.attach('apparition-evidence', { path, contentType: 'application/json' })
    expect(peakDifference, '出現のピークで人間の画面が変化する').toBeGreaterThan(2)
    expect(goneDifference, '演出終了後は通常の画面へ戻る').toBeLessThan(peakDifference * 0.5)
  })
})
