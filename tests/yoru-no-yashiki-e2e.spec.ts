import {
  chromium,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type LaunchOptions,
  type Page
} from '@playwright/test'
import sharp from 'sharp'
import type { PerspectiveCamera } from 'three'
import type { ScreamMeter } from '../examples/games/yoru-no-yashiki/src/match'
import type { WorldFrame } from '../examples/games/yoru-no-yashiki/src/world'

for (const role of ['host', 'guest'] as const) {
  for (const status of ['disconnected', 'error', 'closed'] as const) {
    test('接続終端後は同じページでマイクを再取得しない: ' + role + '/' + status, async ({ browser }, testInfo) => {
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL as string,
        permissions: ['microphone'],
        viewport: { width: 360, height: 480 },
        deviceScaleFactor: 0.5
      })
      await context.addInitScript(() => {
        const capture = { requests: 0, tracks: [] as MediaStreamTrack[] }
        Object.assign(window, { terminalCapture: capture })
        const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          capture.requests++
          const stream = await getUserMedia(constraints)
          capture.tracks.push(...stream.getTracks())
          return stream
        }
      })
      const host = await context.newPage()
      const guest = await context.newPage()
      const client = role === 'host' ? host : guest
      try {
        await Promise.all([host.goto('/'), guest.goto('/')])
        await disableWorldRendering(host, guest)
        await client.evaluate(async () => {
          const modulePath = '/src/peer.ts'
          const { HorrorPeer } = await import(/* @vite-ignore */ modulePath)
          const connect = HorrorPeer.prototype.connect
          HorrorPeer.prototype.connect = function () {
            Object.assign(window, {
              terminateMicrophonePeer: (status: string) => this.terminate(status, 'offline test termination')
            })
            return connect.call(this)
          }
        })
        await client.locator('#microphone').click()
        await expect(client.locator('#mic-status')).toHaveText('マイク接続中')
        await client.locator('#microphone').click()
        await expect
          .poll(() =>
            client.evaluate(() => {
              const capture = (
                window as unknown as { terminalCapture: { requests: number; tracks: MediaStreamTrack[] } }
              ).terminalCapture
              return { requests: capture.requests, tracks: capture.tracks.map((track) => track.readyState) }
            })
          )
          .toEqual({ requests: 2, tracks: ['ended', 'live'] })
        await connectPlayers(host, guest)
        await client.evaluate((status) => {
          ;(window as unknown as { terminateMicrophonePeer: (status: string) => void }).terminateMicrophonePeer(status)
        }, status)
        await expect(client.locator('#connection')).toHaveText('MoQ接続が切れています。終了してやり直してください。')
        await expect(client.locator('#microphone')).toBeDisabled()
        await expect(client.locator('#ready')).toBeDisabled()
        await client.evaluate(async () => {
          const microphone = document.querySelector<HTMLButtonElement>('#microphone')!
          microphone.click()
          await microphone.onclick?.call(microphone, new PointerEvent('click'))
          await microphone.onclick?.call(microphone, new PointerEvent('click'))
        })
        await expect
          .poll(() =>
            client.evaluate(() => {
              const capture = (
                window as unknown as { terminalCapture: { requests: number; tracks: MediaStreamTrack[] } }
              ).terminalCapture
              return { requests: capture.requests, tracks: capture.tracks.map((track) => track.readyState) }
            })
          )
          .toEqual({ requests: 2, tracks: ['ended', 'ended'] })
        await expect(client.locator('#microphone')).toBeDisabled()
      } finally {
        await context.close()
      }
    })
  }
}

async function disableWorldRendering(...pages: Page[]) {
  await Promise.all(
    pages.map((page) =>
      page.evaluate(async () => {
        const modulePath = '/src/world.ts'
        const { HorrorWorld } = await import(/* @vite-ignore */ modulePath)
        HorrorWorld.prototype.render = () => {}
      })
    )
  )
}

test('MoQリレーと部屋コードの検証', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 480 }, deviceScaleFactor: 0.5 })
  await context.addInitScript(() => {
    Object.defineProperty(window, 'RTCPeerConnection', { value: undefined, configurable: true })
  })
  const host = await context.newPage()
  const guest = await context.newPage()
  try {
    await Promise.all([host.goto('/'), guest.goto('/')])
    await disableWorldRendering(host, guest)
    await host.locator('#relay-url').fill('http://example.invalid')
    await host.locator('#host').click()
    await expect(host.locator('#connection')).toContainText('HTTPS')
    await guest.locator('#room-code').fill('invalid')
    await guest.locator('#guest').click()
    await expect(guest.locator('#connection')).toContainText('32文字')
    await host.locator('#relay-url').fill('https://127.0.0.1:4433')
    await connectPlayers(host, guest)
    for (const page of [host, guest]) {
      await expect(page.locator('#relay-url')).toBeDisabled()
      await expect(page.locator('#room-code')).toHaveAttribute('readonly', '')
    }
    await host.locator('#reset').click()
    await expect(host.locator('#relay-url')).toBeEnabled()
    await expect(host.locator('#room-code')).toHaveValue('')
  } finally {
    await context.close()
  }
})

async function connectPlayers(host: Page, guest: Page) {
  await host.locator('#host').click()
  await expect(host.locator('#room-code')).toHaveValue(/^[a-f0-9]{32}$/)
  await guest.locator('#room-code').fill(await host.locator('#room-code').inputValue())
  await guest.locator('#guest').click()
  await expect(host.locator('#connection')).toHaveText('MoQで相手と接続しました', { timeout: 15_000 })
  await expect(guest.locator('#connection')).toHaveText('MoQで相手と接続しました', { timeout: 15_000 })
}

async function averagePixelDifference(first: Buffer, second: Buffer): Promise<number> {
  const [firstImage, secondImage] = await Promise.all([
    sharp(first).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(second).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  ])
  expect(firstImage.info).toEqual(secondImage.info)
  let difference = 0
  for (let index = 0; index < firstImage.data.length; index++) {
    difference += Math.abs(firstImage.data[index] - secondImage.data[index])
  }
  return difference / firstImage.data.length
}

test('参加者の操作だけが途絶えると移動を止め、復旧後に再び動く', async ({}, testInfo) => {
  const options = testInfo.project.use.launchOptions as LaunchOptions
  const browsers: Browser[] = []
  try {
    for (let index = 0; index < 2; index++) browsers.push(await chromium.launch({ ...options, headless: true }))
    const contextOptions = {
      baseURL: testInfo.project.use.baseURL as string,
      permissions: ['microphone'],
      viewport: { width: 360, height: 480 },
      deviceScaleFactor: 0.5
    }
    const hostContext = await browsers[0].newContext(contextOptions)
    const guestContext = await browsers[1].newContext(contextOptions)
    for (const context of [hostContext, guestContext]) {
      await context.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          const audio = new AudioContext()
          const destination = audio.createMediaStreamDestination()
          const oscillator = audio.createOscillator()
          const gain = audio.createGain()
          gain.gain.value = 0.001
          oscillator.connect(gain).connect(destination)
          oscillator.start()
          await audio.resume()
          return destination.stream
        }
      })
    }
    const host = await hostContext.newPage()
    const guest = await guestContext.newPage()
    await Promise.all([host.goto('/'), guest.goto('/')])
    await disableWorldRendering(host, guest)
    await host.evaluate(async () => {
      const modulePath = '/src/world.ts'
      const { HorrorWorld } = await import(modulePath)
      HorrorWorld.prototype.render = (frame: { haunter: { x: number; z: number } }) => {
        Object.assign(window, { inputPosition: { ...frame.haunter } })
      }
    })
    await guest.evaluate(async () => {
      const modulePath = '/src/peer.ts'
      const { HorrorPeer } = await import(modulePath)
      const capture = { drop: false, dropped: 0, health: 0 }
      Object.assign(window, { inputLoss: capture })
      const send = HorrorPeer.prototype.send
      HorrorPeer.prototype.send = function (this: unknown, message: { type?: string }) {
        if (message.type === 'health') capture.health++
        if (message.type === 'input' && capture.drop) {
          capture.dropped++
          return true
        }
        return send.call(this, message)
      }
    })
    const position = () =>
      host.evaluate(() => (window as unknown as { inputPosition: { x: number; z: number } }).inputPosition)
    const distanceFrom = async (origin: { x: number; z: number }) => {
      const current = await position()
      return Math.hypot(current.x - origin.x, current.z - origin.z)
    }
    const capture = () =>
      guest.evaluate(
        () => (window as unknown as { inputLoss: { drop: boolean; dropped: number; health: number } }).inputLoss
      )
    await connectPlayers(host, guest)
    for (const page of [host, guest]) {
      await page.locator('#microphone').click()
      await expect(page.locator('#mic-status')).toHaveText('マイク接続中')
    }
    await expect(host.locator('#ready')).toBeEnabled()
    await expect(guest.locator('#ready')).toBeEnabled()
    await host.locator('#ready').click()
    await guest.locator('#ready').click()
    await expect(host.locator('#phase')).toHaveText('第一夜')
    await expect(guest.locator('#phase')).toHaveText('第一夜')
    const initial = await position()
    await guest.locator('#world').focus()
    await guest.keyboard.down('KeyW')
    await expect.poll(() => distanceFrom(initial)).toBeGreaterThan(0.2)
    const healthBefore = (await capture()).health
    await guest.evaluate(() => {
      ;(window as unknown as { inputLoss: { drop: boolean } }).inputLoss.drop = true
    })
    await expect.poll(async () => (await capture()).dropped).toBeGreaterThan(2)
    await host.waitForTimeout(700)
    const stopped = await position()
    await host.waitForTimeout(300)
    const still = await position()
    expect(Math.hypot(still.x - stopped.x, still.z - stopped.z)).toBeLessThan(0.001)
    expect((await capture()).health).toBeGreaterThan(healthBefore + 2)
    await expect(host.locator('#phase')).toHaveText('第一夜')
    await expect(guest.locator('#phase')).toHaveText('第一夜')
    await guest.evaluate(() => {
      ;(window as unknown as { inputLoss: { drop: boolean } }).inputLoss.drop = false
    })
    await expect.poll(() => distanceFrom(stopped)).toBeGreaterThan(0.2)
    await guest.keyboard.up('KeyW')
  } finally {
    await Promise.all(browsers.map((browser) => browser.close()))
  }
})

test('上下視点はローカル入力に追従し、入力欄では操作しない', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const modulePath = '/src/world.ts'
    const { HorrorWorld } = await import(/* @vite-ignore */ modulePath)
    const render = HorrorWorld.prototype.render
    HorrorWorld.prototype.render = function (frame: { pitch: number; role: string }) {
      Object.assign(window, { lastView: { ...frame } })
      return render.call(this, frame)
    }
  })
  const view = () => page.evaluate(() => (window as unknown as { lastView: { pitch: number; role: string } }).lastView)
  await expect.poll(async () => (await view())?.pitch).toBe(0)
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementY: 200 })))
  expect((await view()).pitch).toBe(0)
  await page.locator('#world').click()
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('world')
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementY: 200 })))
  await expect.poll(async () => (await view()).pitch).toBeCloseTo(-0.4)
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementY: -100000 })))
  await expect.poll(async () => (await view()).pitch).toBeCloseTo(Math.PI / 2 - 0.05 + Math.atan2(2.1, 3.5))
  await page.keyboard.down('ArrowDown')
  await expect.poll(async () => (await view()).pitch).toBeLessThan(1.9)
  await page.keyboard.up('ArrowDown')
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementY: 100000 })))
  await expect.poll(async () => (await view()).pitch).toBeCloseTo(-Math.PI / 2 + 0.05 + Math.atan2(2.1, 3.5))
  await page.keyboard.down('ArrowUp')
  await expect.poll(async () => (await view()).pitch).toBeGreaterThan(-0.8)
  await page.keyboard.up('ArrowUp')
  await page.evaluate(() => document.exitPointerLock())
  await page.locator('#room-code').focus()
  const before = (await view()).pitch
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(150)
  await page.keyboard.up('ArrowUp')
  expect((await view()).pitch).toBe(before)
  expect(
    await page.locator('#room-code').evaluate((element) => {
      const event = new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true, cancelable: true })
      element.dispatchEvent(event)
      return event.defaultPrevented
    })
  ).toBe(false)
})

for (const actor of ['host', 'guest'] as const) {
  for (const [code, kind] of [
    ['Digit1', 'apparition'],
    ['Digit2', 'blackout'],
    ['Digit3', 'rattle']
  ] as const) {
    test(`${actor} の ${code} は押しっぱなしで再要求せず、押し直しで ${kind} を要求する`, async ({}, testInfo) => {
      const options = testInfo.project.use.launchOptions as LaunchOptions
      const browsers: Browser[] = []
      try {
        for (let player = 0; player < 2; player++) {
          browsers.push(await chromium.launch({ ...options, headless: true }))
        }
        const contextOptions = {
          baseURL: testInfo.project.use.baseURL as string,
          permissions: ['microphone'],
          viewport: { width: 360, height: 480 },
          deviceScaleFactor: 0.5
        }
        const hostContext = await browsers[0].newContext(contextOptions)
        const guestContext = await browsers[1].newContext(contextOptions)
        const installTestEnvironment = (context: BrowserContext) =>
          context.addInitScript(() => {
            navigator.mediaDevices.getUserMedia = async () => {
              const audio = new AudioContext()
              const destination = audio.createMediaStreamDestination()
              const oscillator = audio.createOscillator()
              const gain = audio.createGain()
              gain.gain.value = 0.001
              oscillator.connect(gain).connect(destination)
              oscillator.start()
              await audio.resume()
              return destination.stream
            }
            const capture = { requests: [] as string[], effectId: 0 }
            Object.assign(window, {
              effectCapture: capture,
              yoruMoqFrame: (direction: string, payload: Uint8Array) => {
                if (direction !== 'send') return
                const { value } = JSON.parse(new TextDecoder().decode(payload)) as {
                  value?: { type: string; kind?: string; effect?: { id: number } }
                }
                if (value?.type === 'effect' && value.kind) capture.requests.push(value.kind)
                if (value?.type === 'state' && value.effect) capture.effectId = value.effect.id
              }
            })
          })
        await Promise.all([installTestEnvironment(hostContext), installTestEnvironment(guestContext)])
        const host = await hostContext.newPage()
        const guest = await guestContext.newPage()
        const haunter = actor === 'host' ? host : guest
        const capture = (page: Page) =>
          page.evaluate(
            () => (window as unknown as { effectCapture: { requests: string[]; effectId: number } }).effectCapture
          )
        const advanceCooldown = () =>
          host.evaluate(() => (window as unknown as { advanceSpiritCooldown: () => void }).advanceSpiritCooldown())
        await Promise.all([host.goto('/'), guest.goto('/')])
        await disableWorldRendering(host, guest)
        await host.evaluate(async (actor) => {
          const matchPath = '/src/match.ts'
          const { HorrorMatch } = await import(/* @vite-ignore */ matchPath)
          const start = HorrorMatch.prototype.start
          const tick = HorrorMatch.prototype.tick
          HorrorMatch.prototype.start = function () {
            start.call(this)
            if (actor === 'host') {
              tick.call(this, 900_000)
              this.startSecondRound()
            }
            Object.assign(window, { advanceSpiritCooldown: () => tick.call(this, 8100) })
          }
          const worldPath = '/src/world.ts'
          const { HorrorWorld } = await import(/* @vite-ignore */ worldPath)
          HorrorWorld.prototype.render = (frame: {
            human: { x: number; z: number }
            haunter: { x: number; z: number }
          }) => {
            frame.haunter.x = frame.human.x + 1
            frame.haunter.z = frame.human.z
          }
        }, actor)
        await connectPlayers(host, guest)
        for (const page of [host, guest]) {
          await page.locator('#microphone').click()
          await expect(page.locator('#mic-status')).toHaveText('マイク接続中')
        }
        await expect(host.locator('#ready')).toBeEnabled()
        await expect(guest.locator('#ready')).toBeEnabled()
        await host.locator('#ready').click()
        await guest.locator('#ready').click()
        await expect(haunter.locator('#role')).toContainText('怪異')
        await expect(haunter.locator('#spirit-actions')).toContainText('1 出現 (45)：使用可能')
        await haunter.locator('#volume').focus()
        await haunter.keyboard.press(code)
        await haunter.waitForTimeout(200)
        expect((await capture(host)).effectId).toBe(0)
        expect((await capture(guest)).requests).toEqual([])
        await haunter.evaluate(() => (document.activeElement as HTMLElement).blur())
        await haunter.keyboard.down(code)
        await expect.poll(async () => (await capture(host)).effectId).toBe(1)
        await expect(haunter.locator('#spirit-cooldown')).not.toHaveText('共通クールダウン 0秒')
        for (let repeat = 0; repeat < 5; repeat++) await haunter.keyboard.down(code)
        await haunter.waitForTimeout(200)
        expect((await capture(guest)).requests).toEqual(actor === 'guest' ? [kind] : [])
        await advanceCooldown()
        await expect(haunter.locator('#spirit-cooldown')).toHaveText('共通クールダウン 0秒')
        for (let repeat = 0; repeat < 5; repeat++) await haunter.keyboard.down(code)
        await haunter.waitForTimeout(200)
        expect((await capture(host)).effectId).toBe(1)
        expect((await capture(guest)).requests).toEqual(actor === 'guest' ? [kind] : [])
        await haunter.keyboard.up(code)
        await haunter.keyboard.down(code)
        await haunter.keyboard.up(code)
        await expect.poll(async () => (await capture(host)).effectId).toBe(2)
        expect((await capture(guest)).requests).toEqual(actor === 'guest' ? [kind, kind] : [])
      } finally {
        await Promise.all(browsers.map((browser) => browser.close()))
      }
    })
  }
}

test('両者のマイクで採点し、二夜を終えて勝敗が一致する', async ({}, testInfo) => {
  test.setTimeout(1_200_000)
  const options = testInfo.project.use.launchOptions as LaunchOptions
  const hostBrowser = await chromium.launch({ ...options, headless: true })
  const guestBrowser = await chromium.launch({ ...options, headless: true })
  const contextOptions = {
    baseURL: testInfo.project.use.baseURL as string,
    permissions: ['microphone'],
    deviceScaleFactor: 0.5,
    viewport: { width: 360, height: 480 }
  }
  const hostContext = await hostBrowser.newContext(contextOptions)
  const guestContext = await guestBrowser.newContext(contextOptions)
  const installTestEnvironment = async (context: BrowserContext) =>
    context.addInitScript(() => {
      let now = performance.now()
      const originalFrame = window.requestAnimationFrame.bind(window)
      const health = {
        sent: 0,
        received: 0,
        waitSent: (previous: number) =>
          new Promise<number>((resolve, reject) => {
            if (health.sent > previous) return resolve(health.sent)
            const check = () => {
              if (health.sent <= previous) return
              clearTimeout(timer)
              waiters.delete(check)
              resolve(health.sent)
            }
            const timer = setTimeout(() => {
              waiters.delete(check)
              reject(new Error('next health challenge was not sent'))
            }, 5000)
            waiters.add(check)
            check()
          }),
        wait: (challenge: number) =>
          new Promise<void>((resolve, reject) => {
            if (health.received >= challenge) return resolve()
            const check = () => {
              if (health.received < challenge) return
              clearTimeout(timer)
              waiters.delete(check)
              resolve()
            }
            const timer = setTimeout(() => {
              waiters.delete(check)
              reject(new Error(`health challenge ${challenge} was not received`))
            }, 5000)
            waiters.add(check)
            check()
          })
      }
      const waiters = new Set<() => void>()
      Object.assign(window, {
        yoruMoqFrame: (direction: string, payload: Uint8Array) => {
          const frame = JSON.parse(new TextDecoder().decode(payload)) as {
            value?: { type?: string; challenge?: number }
          }
          const message = frame.value
          if (message?.type !== 'health' || typeof message.challenge !== 'number') return
          if (direction === 'send') health.sent = message.challenge
          else health.received = Math.max(health.received, message.challenge)
          waiters.forEach((check) => check())
        }
      })
      Object.defineProperty(performance, 'now', { value: () => now })
      window.requestAnimationFrame = (callback) => originalFrame(() => callback(now))
      Object.assign(window, {
        advanceGameFrame: async () => {
          now += 400
          await new Promise<void>((resolve) => originalFrame(() => resolve()))
        },
        testHealth: health,
        microphoneRequests: 0
      })
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const state = window as unknown as {
          microphoneRequests: number
          syntheticAudio?: AudioContext
          microphoneStage?: string
        }
        state.microphoneRequests++
        state.microphoneStage = 'getUserMedia'
        const realStream = await originalGetUserMedia(constraints)
        state.microphoneStage = 'microphone granted'
        realStream.getTracks().forEach((track) => track.stop())
        const audio = new AudioContext()
        const oscillator = audio.createOscillator()
        const gain = audio.createGain()
        const destination = audio.createMediaStreamDestination()
        gain.gain.value = location.hash === '#host' ? 0.2 : 0.4
        oscillator.frequency.value = 220
        oscillator.connect(gain).connect(destination)
        oscillator.start()
        state.microphoneStage = 'resuming synthetic audio'
        await audio.resume()
        state.microphoneStage = 'synthetic audio running'
        state.syntheticAudio = audio
        return destination.stream
      }
    })
  await Promise.all([installTestEnvironment(hostContext), installTestEnvironment(guestContext)])
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  let previousChallenge = 0
  const advance = async (frames: number) => {
    for (let frame = 0; frame < frames; frame++) {
      const challenge = await host.evaluate(async (previous) => {
        const state = window as unknown as {
          advanceGameFrame: () => Promise<void>
          testHealth: {
            sent: number
            wait: (challenge: number) => Promise<void>
            waitSent: (previous: number) => Promise<number>
          }
        }
        if (previous) await state.testHealth.wait(previous)
        const sent = state.testHealth.sent
        await state.advanceGameFrame()
        return state.testHealth.waitSent(sent)
      }, previousChallenge)
      await guest.evaluate(async (expected) => {
        const state = window as unknown as {
          advanceGameFrame: () => Promise<void>
          testHealth: { wait: (challenge: number) => Promise<void> }
        }
        await state.testHealth.wait(expected)
        await state.advanceGameFrame()
      }, challenge)
      previousChallenge = challenge
      if (frame % 100 === 99) {
        const phase = await host.locator('#phase').innerText()
        expect(phase, await host.locator('#notice').innerText()).not.toBe('中断中')
      }
      if (frame % 500 === 499) console.log('仮想フレーム完了:', frame + 1)
    }
  }
  const bothText = async (selector: string, text: string) => {
    await expect(host.locator(selector)).toHaveText(text)
    await expect(guest.locator(selector)).toHaveText(text)
  }
  const scores = async (page: Page) => {
    const text = await page.locator('#scores').innerText()
    const match = text.match(/主催\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*\/\s*参加者\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/)
    expect(match, text).not.toBeNull()
    return { host: Number(match![1]), guest: Number(match![2]) }
  }
  try {
    await host.goto('/#host')
    await guest.goto('/#guest')
    await disableWorldRendering(host, guest)
    await expect.poll(() => host.evaluate(() => document.visibilityState)).toBe('visible')
    await expect.poll(() => guest.evaluate(() => document.visibilityState)).toBe('visible')
    await connectPlayers(host, guest)
    await expect(host.locator('#ready')).toBeDisabled()
    await expect(guest.locator('#ready')).toBeDisabled()
    await host.locator('#microphone').click()
    await expect(host.locator('#ready')).toBeDisabled()
    await expect(guest.locator('#ready')).toBeDisabled()
    await guest.locator('#microphone').click()
    try {
      await expect(host.locator('#mic-status')).toHaveText('マイク接続中', { timeout: 15000 })
      await expect(guest.locator('#mic-status')).toHaveText('マイク接続中', { timeout: 15000 })
    } catch (error) {
      console.error(
        'microphone stages',
        await Promise.all(
          [host, guest].map((page) =>
            page.evaluate(() => (window as unknown as { microphoneStage?: string }).microphoneStage)
          )
        )
      )
      throw error
    }
    await advance(2)
    await expect(host.locator('#ready')).toBeEnabled()
    await expect(guest.locator('#ready')).toBeEnabled()
    await guest.locator('#ready').click()
    await host.waitForTimeout(100)
    await host.locator('#ready').click()
    await bothText('#phase', '第一夜')
    await bothText('#timer', '15:00')
    await expect(host.locator('#role')).toContainText('人間')
    await expect(guest.locator('#role')).toContainText('怪異')
    await host.keyboard.press('KeyE')
    await advance(1)
    await expect(host.locator('#ritual-story')).toContainText('畳の下の手紙')
    await expect(guest.locator('#ritual-story')).toContainText('畳の下の手紙')
    await advance(4)
    await bothText('#phase', '第一夜')
    await advance(2243)
    await bothText('#phase', '第一夜')
    await bothText('#timer', '00:01')
    const firstScores = await scores(host)
    expect(firstScores.host).toBeLessThan(0)
    expect(firstScores.guest).toBe(0)
    await advance(2)
    await bothText('#phase', '役割を交代')
    await bothText('#timer', '00:00')
    await expect(host.locator('#ritual-story')).toBeEmpty()
    await expect(guest.locator('#ritual-story')).toBeEmpty()
    const completedFirstScores = await scores(host)
    await expect(host.locator('#ready')).toBeEnabled()
    await expect(guest.locator('#ready')).toBeEnabled()
    await guest.locator('#ready').click()
    await bothText('#phase', '役割を交代')
    await host.waitForTimeout(100)
    await host.locator('#ready').click()
    await bothText('#phase', '第二夜')
    await bothText('#timer', '15:00')
    await expect(host.locator('#role')).toContainText('怪異')
    await expect(guest.locator('#role')).toContainText('人間')
    await expect(guest.locator('#spirit')).toBeHidden()
    await expect(host.locator('#spirit-energy')).toHaveText('霊力 100 / 100')
    await host.keyboard.press('Digit2')
    await advance(1)
    await expect(host.locator('#spirit-energy')).toHaveText('霊力 65 / 100')
    await host.keyboard.press('Digit3')
    await expect(host.locator('#spirit-energy')).toHaveText('霊力 65 / 100')
    await guest.keyboard.press('KeyE')
    await expect(guest.locator('#ritual-story')).toContainText('畳の下の手紙')
    await advance(1)
    await expect(host.locator('#ritual-story')).toContainText('畳の下の手紙')
    await advance(4)
    await bothText('#phase', '第二夜')
    await advance(2242)
    await bothText('#phase', '第二夜')
    await bothText('#timer', '00:01')
    const secondScores = await scores(host)
    expect(secondScores.guest).toBeLessThan(0)
    expect(secondScores.host).toBe(completedFirstScores.host)
    await advance(2)
    await bothText('#phase', '夜が明けました')
    await bothText('#timer', '00:00')
    const finalScores = await scores(host)
    expect(finalScores.host).toBeLessThan(0)
    expect(finalScores.guest).toBeLessThan(0)
    expect(finalScores.host).not.toBe(finalScores.guest)
    await expect(guest.locator('#scores')).toHaveText(await host.locator('#scores').innerText())
    const winner = finalScores.host > finalScores.guest ? '主催の勝ち' : '参加者の勝ち'
    await expect(host.locator('#role')).toContainText(winner)
    await expect(guest.locator('#role')).toHaveText(await host.locator('#role').innerText())
    for (const page of [host, guest]) {
      expect(await page.evaluate(() => (window as unknown as { microphoneRequests: number }).microphoneRequests)).toBe(
        1
      )
    }
  } finally {
    await Promise.all([hostBrowser.close(), guestBrowser.close()])
  }
})

test('実際の二画面で合成マイク、接続、開始と復旧を行う', async ({}, testInfo) => {
  test.setTimeout(120_000)
  const options = testInfo.project.use.launchOptions as LaunchOptions
  const hostBrowser = await chromium.launch({ ...options, headless: true })
  const guestBrowser = await chromium.launch({ ...options, headless: true })
  const contextOptions = {
    baseURL: testInfo.project.use.baseURL as string,
    permissions: ['microphone'],
    deviceScaleFactor: 0.5,
    viewport: { width: 360, height: 480 }
  }
  const hostContext = await hostBrowser.newContext(contextOptions)
  const guestContext = await guestBrowser.newContext(contextOptions)
  await hostContext.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (value: string) => {
          Object.assign(window, { copiedRoom: value })
        }
      }
    })
  })
  await guestContext.addInitScript(() => {
    const original = Date.now.bind(Date)
    Date.now = () => original() + 300_000
    Object.assign(window, {
      yoruMoqFrame: (direction: string, payload: Uint8Array, send: () => void) => {
        if (direction !== 'send') return
        const frame = JSON.parse(new TextDecoder().decode(payload)) as { value?: { type?: string; kind?: string } }
        const message = frame.value
        if (!message) return
        const state = window as unknown as {
          captureHealth?: boolean
          dropHealth?: boolean
          dropNextReady?: boolean
          droppedReady?: boolean
          replayHealth?: () => void
          replayReady?: () => void
          replayEffect?: () => void
        }
        if (message.type === 'health' && state.dropHealth) return false
        if (message.type === 'ready' && state.dropNextReady) {
          state.dropNextReady = false
          state.droppedReady = true
          return false
        }
        if (message.type === 'ready') state.replayReady = send
        if (message.type === 'health' && state.captureHealth) {
          state.captureHealth = false
          state.replayHealth = send
        }
        if (message.type === 'effect' && message.kind === 'blackout') state.replayEffect = send
      }
    })
  })
  const captureMicrophone = async (context: BrowserContext) =>
    context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (!constraints?.audio || constraints.video) throw new Error('Expected audio-only microphone request')
        const audio = new AudioContext()
        const oscillator = audio.createOscillator()
        const gain = audio.createGain()
        const destination = audio.createMediaStreamDestination()
        gain.gain.value = 0.001
        oscillator.connect(gain).connect(destination)
        oscillator.start()
        await audio.resume()
        const stream = destination.stream
        Object.assign(window, { testMicrophoneTrack: stream.getAudioTracks()[0] })
        return stream
      }
    })
  await Promise.all([captureMicrophone(hostContext), captureMicrophone(guestContext)])
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  try {
    await host.goto('/')
    await guest.goto('/')
    for (const page of [host, guest]) {
      await page.evaluate(async () => {
        const modulePath = '/src/world.ts'
        const { HorrorWorld } = await import(/* @vite-ignore */ modulePath)
        const render = HorrorWorld.prototype.render
        let lastRenderAt = -Infinity
        HorrorWorld.prototype.render = function (frame: WorldFrame) {
          Object.assign(window, { lastView: { ...frame } })
          const now = performance.now()
          if (now - lastRenderAt < 33) return
          lastRenderAt = now
          return render.call(this, frame)
        }
      })
    }
    await connectPlayers(host, guest)
    await host.locator('#copy').click()
    await expect
      .poll(() => host.evaluate(() => (window as unknown as { copiedRoom?: string }).copiedRoom))
      .toBe(await host.locator('#room-code').inputValue())
    await expect(host.locator('#ready')).toBeDisabled()
    await host.locator('#microphone').click()
    await expect(host.locator('#mic-status')).toHaveText('マイク接続中')
    await guest.locator('#microphone').click()
    await expect(guest.locator('#mic-status')).toHaveText('マイク接続中')
    await expect(host.locator('#ready')).toBeEnabled()
    await expect(guest.locator('#ready')).toBeEnabled()
    await host.locator('#ready').click()
    await expect(host.locator('#threshold')).toBeDisabled()
    await expect(host.locator('#preview-status')).not.toHaveText('試合中はプレビューを停止しています')
    await guest.evaluate(() => Object.assign(window, { dropNextReady: true }))
    await guest.locator('#ready').click()
    await expect
      .poll(() => guest.evaluate(() => (window as unknown as { droppedReady?: boolean }).droppedReady))
      .toBe(true)
    await expect(host.locator('#phase')).toHaveText('第一夜')
    await expect(guest.locator('#phase')).toHaveText('第一夜')
    await expect(host.locator('#preview-status')).toHaveText('試合中はプレビューを停止しています')
    await expect(guest.locator('#preview-status')).toHaveText('試合中はプレビューを停止しています')
    await expect(host.locator('#role')).toContainText('人間')
    await expect(guest.locator('#role')).toContainText('怪異')
    const pitch = (page: typeof host) =>
      page.evaluate(() => (window as unknown as { lastView?: { pitch: number } }).lastView?.pitch)
    await expect.poll(() => pitch(host)).toBe(0)
    await expect.poll(() => pitch(guest)).toBe(0)
    await host.evaluate(() => {
      ;(document.activeElement as HTMLElement).blur()
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }))
    })
    await expect.poll(() => pitch(host)).toBeLessThan(-0.1)
    await host.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowDown' })))
    const hostPitch = await pitch(host)
    expect(await pitch(guest)).toBe(0)
    await guest.evaluate(() => {
      ;(document.activeElement as HTMLElement).blur()
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }))
    })
    await expect.poll(() => pitch(guest)).toBeGreaterThan(0.1)
    await guest.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' })))
    expect(await pitch(host)).toBe(hostPitch)
    await guest.evaluate(() => Object.assign(window, { captureHealth: true }))
    await expect
      .poll(() => guest.evaluate(() => typeof (window as unknown as { replayHealth?: () => void }).replayHealth))
      .toBe('function')
    await host.waitForTimeout(1500)
    await guest.evaluate(() => (window as unknown as { replayHealth: () => void }).replayHealth())
    await host.waitForTimeout(300)
    await expect(host.locator('#phase')).toHaveText('第一夜')
    await guest.evaluate(() => Object.assign(window, { dropHealth: true }))
    await expect(host.locator('#phase')).toHaveText('中断中')
    await expect(host.locator('#ready')).toBeDisabled()
    await guest.evaluate(() => Object.assign(window, { dropHealth: false }))
    await expect(host.locator('#ready')).toBeEnabled()
    await expect(guest.locator('#ready')).toBeEnabled()
    await host.locator('#ready').click()
    await guest.locator('#ready').click()
    await expect(host.locator('#phase')).toHaveText('第一夜')
    await expect(guest.locator('#phase')).toHaveText('第一夜')
    await expect(host.locator('#spirit')).toBeHidden()
    await expect(guest.locator('#spirit-energy')).toHaveText('霊力 100 / 100')
    await expect(guest.locator('#spirit-actions')).toContainText('人間まで5.5以内に接近')
    await guest.keyboard.press('Digit1')
    await expect(guest.locator('#spirit-energy')).toHaveText('霊力 100 / 100')
    await expect(host.locator('#ritual-hint')).toContainText('南西の文机')
    await guest.keyboard.press('KeyE')
    await host.waitForTimeout(300)
    await expect(host.locator('#ritual-story')).toBeEmpty()
    await host.keyboard.press('KeyE')
    await expect(host.locator('#ritual-story')).toContainText('畳の下の手紙')
    await expect(guest.locator('#ritual-story')).toContainText('畳の下の手紙')
    await test.step('暗転演出の描画を比較する', async () => {
      const canvas = guest.locator('#world canvas')
      const firstFrame = await canvas.screenshot({ timeout: 15_000 })
      await guest.waitForTimeout(300)
      const idleFrame = await canvas.screenshot({ timeout: 15_000 })
      await guest.keyboard.press('Digit2')
      await expect(guest.locator('#spirit-cooldown')).toContainText('秒')
      await expect(guest.locator('#spirit-actions')).toContainText('共通クールダウン中')
      await guest.keyboard.press('Digit3')
      await expect(guest.locator('#spirit-energy')).not.toHaveText('霊力 100 / 100')
      await guest.waitForTimeout(900)
      const blackoutFrame = await canvas.screenshot({ timeout: 15_000 })
      const idleDifference = await averagePixelDifference(firstFrame, idleFrame)
      const blackoutDifference = await averagePixelDifference(idleFrame, blackoutFrame)
      expect(blackoutDifference).toBeGreaterThan(Math.max(2, idleDifference * 2))
    })
    await expect(guest.locator('#spirit-cooldown')).toHaveText('共通クールダウン 0秒', { timeout: 15000 })
    const spiritEnergy = async () => Number((await guest.locator('#spirit-energy').innerText()).match(/\d+/)?.[0])
    const energyBeforeReplay = await spiritEnergy()
    await guest.evaluate(() => (window as unknown as { replayEffect: () => void }).replayEffect())
    await guest.waitForTimeout(300)
    expect(await spiritEnergy()).toBeGreaterThanOrEqual(energyBeforeReplay)
    await guest.keyboard.press('Digit3')
    await expect.poll(spiritEnergy).toBeLessThan(energyBeforeReplay - 15)
    await host.locator('#fullscreen').click()
    await expect(host.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'true')
    await guest.evaluate(() => {
      const track = (window as unknown as { testMicrophoneTrack: MediaStreamTrack }).testMicrophoneTrack
      track.stop()
      track.dispatchEvent(new Event('ended'))
    })
    await expect(host.locator('#phase')).toHaveText('中断中')
    await expect(host.locator('#preview-status')).not.toHaveText('試合中はプレビューを停止しています')
    await expect(guest.locator('#preview-status')).toHaveText('マイクを接続してください')
    await expect(guest.locator('#ready')).toBeDisabled()
    await guest.locator('#microphone').click()
    await expect(host.locator('#ready')).toBeEnabled()
    await expect(guest.locator('#ready')).toBeEnabled()
    await host.locator('#ready').click()
    await guest.locator('#ready').click()
    await expect(host.locator('#phase')).toHaveText('第一夜')
    await expect(host.locator('#preview-status')).toHaveText('試合中はプレビューを停止しています')
    await host.locator('#fullscreen').click()
    await expect(host.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'false')
    await expect(host.locator('#ritual-story')).toContainText('畳の下の手紙')
    await expect(guest.locator('#ritual-story')).toContainText('畳の下の手紙')
    await guest.close()
    await expect(host.locator('#connection')).toHaveText('MoQ接続が切れています。終了してやり直してください。')
    await expect(host.locator('#phase')).toHaveText('中断中', { timeout: 10000 })
    await expect(host.locator('#ready')).toBeDisabled()
  } catch (error) {
    const states = await Promise.all(
      [host, guest].map((page) =>
        page
          .evaluate(() => ({
            phase: document.querySelector('#phase')?.textContent,
            notice: document.querySelector('#notice')?.textContent,
            connection: document.querySelector('#connection')?.textContent,
            microphone: document.querySelector('#mic-status')?.textContent
          }))
          .catch(() => null)
      )
    )
    console.error('二画面試験の失敗時状態:', states)
    throw error
  } finally {
    await Promise.all([hostBrowser.close(), guestBrowser.close()])
  }
})

test('模擬document.hiddenで両夜の双方が停止し、表示後も新たな明示準備を要する', async ({}, testInfo) => {
  test.setTimeout(120_000)
  type Probe = {
    hidden: boolean
    frames: number
    states: number
    jump: number
    readySent: number
    replayReady?: () => void
    gain?: GainNode
    snapshot?: { phase: string; paused: boolean; elapsedMs: number; scores: { host: number; guest: number } }
    poses?: { human: WorldFrame['human']; haunter: WorldFrame['haunter'] }
  }
  const options = testInfo.project.use.launchOptions as LaunchOptions
  const browsers: Browser[] = []
  const pages: Page[] = []
  const probe = (page: Page) =>
    page.evaluate(() => {
      const { hidden, frames, states, readySent, snapshot, poses } = (window as unknown as { visibilityProbe: Probe })
        .visibilityProbe
      return { hidden, frames, states, readySent, snapshot, poses }
    })
  const bothPhase = async (phase: string) => {
    for (const page of pages) await expect(page.locator('#phase')).toHaveText(phase)
  }
  try {
    for (let index = 0; index < 2; index++) {
      const browser = await chromium.launch({
        ...options,
        headless: true,
        args: [
          ...(options.args ?? []),
          '--disable-background-networking',
          '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'
        ]
      })
      browsers.push(browser)
      const baseURL = testInfo.project.use.baseURL as string
      const context = await browser.newContext({
        baseURL,
        permissions: ['microphone'],
        serviceWorkers: 'block',
        viewport: { width: 360, height: 480 },
        deviceScaleFactor: 0.5
      })
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort()
      )
      await context.addInitScript(() => {
        const state: Probe = { hidden: false, frames: 0, states: 0, jump: 0, readySent: 0 }
        Object.assign(window, { visibilityProbe: state })
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => state.hidden })
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          if (!constraints?.audio || constraints.video) throw new Error('Expected audio-only microphone request')
          const audio = new AudioContext()
          const oscillator = audio.createOscillator()
          const gain = audio.createGain()
          const destination = audio.createMediaStreamDestination()
          oscillator.frequency.value = 200
          gain.gain.value = 0.001
          oscillator.connect(gain).connect(destination)
          oscillator.start()
          await audio.resume()
          state.gain = gain
          return destination.stream
        }
        Object.assign(window, {
          yoruMoqFrame: (direction: string, payload: Uint8Array, send?: () => void) => {
            const { value } = JSON.parse(new TextDecoder().decode(payload)) as {
              value?: {
                type: string
                snapshot?: Probe['snapshot']
                human: WorldFrame['human']
                haunter: WorldFrame['haunter']
              }
            }
            if (value?.type === 'ready' && direction === 'send') {
              state.readySent++
              state.replayReady = send
            }
            if (value?.type === 'state') {
              state.states++
              state.snapshot = structuredClone(value.snapshot)
              state.poses = structuredClone({ human: value.human, haunter: value.haunter })
            }
          }
        })
      })
      const page = await context.newPage()
      pages.push(page)
      await page.goto('/')
      await page.evaluate(async () => {
        const state = (window as unknown as { visibilityProbe: Probe }).visibilityProbe
        const worldPath = '/src/world.ts'
        const matchPath = '/src/match.ts'
        const { HorrorWorld } = await import(/* @vite-ignore */ worldPath)
        const { HorrorMatch } = await import(/* @vite-ignore */ matchPath)
        const render = HorrorWorld.prototype.render
        let lastRenderAt = -Infinity
        HorrorWorld.prototype.render = function (frame: WorldFrame) {
          const now = performance.now()
          if (now - lastRenderAt >= 33) {
            lastRenderAt = now
            render.call(this, frame)
          }
          state.frames++
        }
        const observe = HorrorMatch.prototype.observe
        HorrorMatch.prototype.observe = function (meter: ScreamMeter, rms: number, startMs: number, endMs: number) {
          const jump = state.jump
          state.jump = 0
          return observe.call(this, meter, rms, startMs, endMs + jump)
        }
      })
      await expect.poll(() => probe(page).then((state) => state.frames)).toBeGreaterThan(0)
      expect(
        await page.locator('#world canvas').evaluate((canvas: HTMLCanvasElement) => {
          const gl = canvas.getContext('webgl2')
          return !!gl && !gl.isContextLost()
        })
      ).toBe(true)
    }
    const [host, guest] = pages
    await connectPlayers(host, guest)
    for (const page of pages) await expect(page.locator('#ready')).toBeDisabled()
    await host.locator('#microphone').click()
    for (const page of pages) await expect(page.locator('#ready')).toBeDisabled()
    await guest.locator('#microphone').click()
    for (const page of pages) await expect(page.locator('#mic-status')).toHaveText('マイク接続中')
    for (const [night, phase] of ['第一夜', '第二夜'].entries()) {
      for (const page of pages) await expect(page.locator('#ready')).toBeEnabled()
      await guest.locator('#ready').click()
      await host.locator('#ready').click()
      await bothPhase(phase)
      await pages[night].evaluate(() => {
        ;(window as unknown as { visibilityProbe: Probe }).visibilityProbe.gain!.gain.value = 0.3
      })
      const survivor = night === 0 ? 'host' : 'guest'
      const initialScore = (await probe(host)).snapshot!.scores[survivor]
      await expect.poll(async () => (await probe(host)).snapshot?.scores[survivor]).toBeLessThan(initialScore)
      for (const target of pages) {
        await test.step(phase + ': ' + (target === host ? '主催' : '参加者') + 'の非表示を模擬', async () => {
          const before = await probe(host)
          await target.evaluate(() => {
            ;(window as unknown as { visibilityProbe: Probe }).visibilityProbe.hidden = true
            document.dispatchEvent(new Event('visibilitychange'))
          })
          await bothPhase('中断中')
          await expect(target.locator('#notice')).toContainText('非表示')
          await expect(target.locator('#ready')).toBeDisabled()
          const stopped = await Promise.all(pages.map(probe))
          expect(stopped[0].snapshot!.elapsedMs - before.snapshot!.elapsedMs).toBeLessThanOrEqual(500)
          expect(stopped[0].snapshot!.paused).toBe(true)
          expect(stopped[1].snapshot).toEqual(stopped[0].snapshot)
          expect(stopped[1].poses).toEqual(stopped[0].poses)
          for (const page of pages) {
            await page.locator('#world').focus()
            await page.keyboard.down('KeyW')
            await page.keyboard.down('ArrowRight')
          }
          const readySent = (await probe(target)).readySent
          await target.locator('#ready').evaluate((button: HTMLButtonElement) => {
            button.click()
            button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          })
          await target.waitForTimeout(650)
          expect((await probe(target)).readySent).toBe(readySent)
          for (const [index, page] of pages.entries()) {
            const current = await probe(page)
            expect(current.snapshot).toEqual(stopped[index].snapshot)
            expect(current.poses).toEqual(stopped[index].poses)
            expect(current.states).toBeGreaterThan(stopped[index].states)
            await page.keyboard.up('KeyW')
            await page.keyboard.up('ArrowRight')
          }
          await target.evaluate(() => {
            ;(window as unknown as { visibilityProbe: Probe }).visibilityProbe.hidden = false
            document.dispatchEvent(new Event('visibilitychange'))
          })
          await host.waitForTimeout(650)
          await bothPhase('中断中')
          for (const [index, page] of pages.entries()) {
            const current = await probe(page)
            expect(current.snapshot).toEqual(stopped[index].snapshot)
            expect(current.poses).toEqual(stopped[index].poses)
            expect(current.frames).toBeGreaterThan(stopped[index].frames)
          }
          for (const page of pages) {
            await expect(page.locator('#ready')).toBeEnabled()
            await page.evaluate(() => {
              const state = (window as unknown as { visibilityProbe: Probe }).visibilityProbe
              if (!state.replayReady) throw new Error('No old ready message captured')
              state.replayReady()
            })
          }
          await host.waitForTimeout(650)
          await bothPhase('中断中')
          for (const [index, page] of pages.entries()) {
            expect((await probe(page)).snapshot).toEqual(stopped[index].snapshot)
            expect((await probe(page)).poses).toEqual(stopped[index].poses)
          }
          await target.locator('#ready').click()
          await host.waitForTimeout(650)
          await bothPhase('中断中')
          const other = target === host ? guest : host
          await expect(other.locator('#ready')).toBeEnabled()
          await other.locator('#ready').click()
          await bothPhase(phase)
          await expect.poll(async () => (await probe(host)).snapshot?.paused).toBe(false)
          await expect
            .poll(async () => (await probe(host)).snapshot?.elapsedMs)
            .toBeGreaterThan(stopped[0].snapshot!.elapsedMs)
        })
      }
      await pages[night].evaluate(() => {
        ;(window as unknown as { visibilityProbe: Probe }).visibilityProbe.gain!.gain.value = 0.001
      })
      if (night === 0) {
        await host.evaluate(() => {
          ;(window as unknown as { visibilityProbe: Probe }).visibilityProbe.jump = 900_000
        })
        await bothPhase('役割を交代')
      }
    }
    for (const page of pages) {
      await page.locator('#reset').click()
      await expect(page.locator('#room-code')).toHaveValue('')
      await expect(page.locator('#ready')).toBeDisabled()
    }
  } catch (error) {
    for (const [index, page] of pages.entries()) {
      const diagnostics = await page
        .evaluate(() => {
          const state = (window as unknown as { visibilityProbe: Probe }).visibilityProbe
          return {
            hidden: document.hidden,
            visibilityState: document.visibilityState,
            phase: document.querySelector('#phase')?.textContent,
            notice: document.querySelector('#notice')?.textContent,
            microphone: document.querySelector('#mic-status')?.textContent,
            audioState: state.gain?.context.state,
            snapshot: state.snapshot,
            poses: state.poses,
            frames: state.frames
          }
        })
        .catch(() => null)
      console.error('simulated visibility diagnostics', index, diagnostics)
    }
    throw error
  } finally {
    await Promise.all(browsers.map((browser) => browser.close()))
  }
})

test('描画喪失で双方が停止し、復旧後に新たな準備を要する', async ({}, testInfo) => {
  test.setTimeout(120_000)
  const options = testInfo.project.use.launchOptions as LaunchOptions
  const browsers: Browser[] = []
  const pages: Page[] = []
  try {
    for (let index = 0; index < 2; index++)
      browsers.push(
        await chromium.launch({
          ...options,
          headless: true,
          args: [
            ...(options.args ?? []),
            '--disable-background-networking',
            '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'
          ]
        })
      )
    const contextOptions = {
      baseURL: testInfo.project.use.baseURL as string,
      permissions: ['microphone'],
      deviceScaleFactor: 0.5,
      viewport: { width: 360, height: 480 }
    }
    const contexts = await Promise.all(browsers.map((browser) => browser.newContext(contextOptions)))
    for (const context of contexts) {
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === contextOptions.baseURL ? route.continue() : route.abort()
      )
      await context.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          if (!constraints?.audio || constraints.video) throw new Error('Expected audio-only microphone request')
          const audio = new AudioContext()
          const oscillator = audio.createOscillator()
          const gain = audio.createGain()
          const destination = audio.createMediaStreamDestination()
          oscillator.frequency.value = 200
          gain.gain.value = 0.001
          oscillator.connect(gain).connect(destination)
          oscillator.start()
          await audio.resume()
          Object.assign(window, { testMicrophoneGain: gain })
          return destination.stream
        }
        Object.assign(window, {
          testWebglStateCount: 0,
          yoruMoqFrame: (direction: string, payload: Uint8Array) => {
            if (direction !== 'send') return
            const { value } = JSON.parse(new TextDecoder().decode(payload)) as {
              value?: { type: string; snapshot?: unknown; human?: unknown; haunter?: unknown }
            }
            if (value?.type === 'state')
              Object.assign(window, {
                testWebglSnapshot: value.snapshot,
                testWebglPoses: { human: value.human, haunter: value.haunter },
                testWebglStateCount: (window as unknown as { testWebglStateCount: number }).testWebglStateCount + 1
              })
          }
        })
      })
    }
    const [host, guest] = await Promise.all(contexts.map((context) => context.newPage()))
    pages.push(host, guest)
    await Promise.all([host.goto('/'), guest.goto('/')])
    await connectPlayers(host, guest)
    for (const page of [host, guest]) {
      await page.locator('#microphone').click()
      await expect(page.locator('#mic-status')).toHaveText('マイク接続中')
    }
    for (const page of [host, guest]) await expect(page.locator('#ready')).toBeEnabled()
    await guest.locator('#ready').click()
    await host.locator('#ready').click()
    for (const page of [host, guest]) await expect(page.locator('#phase')).toHaveText('第一夜')

    const readSnapshot = () =>
      host.evaluate(
        () =>
          (
            window as unknown as {
              testWebglSnapshot?: { elapsedMs: number; scores: { host: number; guest: number }; paused: boolean }
            }
          ).testWebglSnapshot
      )
    await host.evaluate(() => {
      ;(window as unknown as { testMicrophoneGain: GainNode }).testMicrophoneGain.gain.value = 0.3
    })
    await expect.poll(async () => (await readSnapshot())?.scores.host).toBeLessThan(0)

    for (const [target, other] of [
      [host, guest],
      [guest, host]
    ]) {
      await target.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('#world canvas')
        const gl = canvas?.getContext('webgl2')
        const extension = gl?.getExtension('WEBGL_lose_context')
        if (!canvas || !gl || !extension || gl.isContextLost()) throw new Error('WebGL context is not available')
        const probe = { gl, extension, lost: false, restored: false }
        canvas.addEventListener('webglcontextlost', (event) => (probe.lost = event.isTrusted), { once: true })
        canvas.addEventListener('webglcontextrestored', (event) => (probe.restored = event.isTrusted), { once: true })
        Object.assign(window, { testWebglProbe: probe })
        extension.loseContext()
      })
      await expect
        .poll(() =>
          target.evaluate(() => {
            const probe = (window as unknown as { testWebglProbe: { gl: WebGL2RenderingContext; lost: boolean } })
              .testWebglProbe
            return probe.lost && probe.gl.isContextLost()
          })
        )
        .toBe(true)
      for (const page of [host, guest]) await expect(page.locator('#phase')).toHaveText('中断中')
      await expect(target.locator('#ready')).toBeDisabled()
      await expect.poll(async () => (await readSnapshot())?.paused).toBe(true)
      const paused = await readSnapshot()
      const positions = await host.evaluate(() => (window as unknown as { testWebglPoses: unknown }).testWebglPoses)
      const stateCount = await host.evaluate(
        () => (window as unknown as { testWebglStateCount: number }).testWebglStateCount
      )
      expect(paused).toBeDefined()
      expect(positions).toEqual({
        human: expect.objectContaining({ x: expect.any(Number), z: expect.any(Number) }),
        haunter: expect.objectContaining({ x: expect.any(Number), z: expect.any(Number) })
      })
      for (const page of [host, guest]) {
        await page.locator('#world').focus()
        await page.keyboard.down('KeyW')
        await page.keyboard.down('ArrowRight')
      }
      await target.waitForTimeout(650)
      expect(await readSnapshot()).toEqual(paused)
      expect(
        await host.evaluate(() => (window as unknown as { testWebglStateCount: number }).testWebglStateCount)
      ).toBeGreaterThan(stateCount)
      expect(await host.evaluate(() => (window as unknown as { testWebglPoses: unknown }).testWebglPoses)).toEqual(
        positions
      )
      for (const page of [host, guest]) {
        await page.keyboard.up('KeyW')
        await page.keyboard.up('ArrowRight')
        await expect(page.locator('#phase')).toHaveText('中断中')
      }
      await expect(other.locator('#ready')).toBeEnabled()
      await other.locator('#ready').click()
      await expect(target.locator('#ready')).toBeDisabled()
      await target.evaluate(() => {
        ;(
          window as unknown as { testWebglProbe: { extension: WEBGL_lose_context } }
        ).testWebglProbe.extension.restoreContext()
      })
      await expect
        .poll(() =>
          target.evaluate(() => {
            const probe = (window as unknown as { testWebglProbe: { gl: WebGL2RenderingContext; restored: boolean } })
              .testWebglProbe
            return probe.restored && !probe.gl.isContextLost()
          })
        )
        .toBe(true)
      for (const page of [host, guest]) {
        await expect(page.locator('#phase')).toHaveText('中断中')
        await expect(page.locator('#ready')).toBeEnabled()
      }
      await target.locator('#ready').click()
      for (const page of [host, guest]) await expect(page.locator('#phase')).toHaveText('中断中')
      await other.locator('#ready').click()
      for (const page of [host, guest]) await expect(page.locator('#phase')).toHaveText('第一夜')
      await expect.poll(async () => (await readSnapshot())?.paused).toBe(false)
      const resumedAt = (await readSnapshot())!.elapsedMs
      await expect.poll(async () => (await readSnapshot())?.elapsedMs).toBeGreaterThan(resumedAt)
    }
  } catch (error) {
    for (const [index, page] of pages.entries()) {
      const state = await page
        .evaluate(() => {
          const gain = (window as unknown as { testMicrophoneGain?: GainNode }).testMicrophoneGain
          return {
            phase: document.querySelector('#phase')?.textContent,
            notice: document.querySelector('#notice')?.textContent,
            microphone: document.querySelector('#mic-status')?.textContent,
            level: document.querySelector<HTMLMeterElement>('#level')?.value,
            audioState: gain?.context.state,
            gain: gain?.gain.value,
            snapshot: (window as unknown as { testWebglSnapshot?: unknown }).testWebglSnapshot
          }
        })
        .catch(() => null)
      console.error('WebGL diagnostics', index, state)
    }
    throw error
  } finally {
    await Promise.all(browsers.map((browser) => browser.close()))
  }
})

test('鈴の受理済み進捗は各夜の人間だけで一度発音する', async ({}, testInfo) => {
  const options = testInfo.project.use.launchOptions as LaunchOptions
  const browsers: Browser[] = []
  type Probe = {
    calls: number
    sources: { type: OscillatorType; state: string }[]
    completed: number
    copies: number
    jump: number
    position: { x: number; z: number } | null
    human: { x: number; z: number }
  }
  const read = (page: Page) => page.evaluate(() => (window as unknown as { bellProbe: Probe }).bellProbe)
  try {
    for (let index = 0; index < 2; index++) browsers.push(await chromium.launch({ ...options, headless: true }))
    const pages: Page[] = []
    for (const browser of browsers) {
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL as string,
        permissions: ['microphone'],
        viewport: { width: 360, height: 480 },
        deviceScaleFactor: 0.5
      })
      await context.addInitScript(() => {
        const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          const granted = await getUserMedia(constraints)
          granted.getTracks().forEach((track) => track.stop())
          const audio = new AudioContext()
          const oscillator = audio.createOscillator()
          const gain = audio.createGain()
          const destination = audio.createMediaStreamDestination()
          gain.gain.value = 0.001
          oscillator.connect(gain).connect(destination)
          oscillator.start()
          await audio.resume()
          return destination.stream
        }
      })
      const page = await context.newPage()
      await page.goto('/')
      await page.evaluate(async (authority) => {
        const probe: Probe = {
          calls: 0,
          sources: [],
          completed: 0,
          copies: 0,
          jump: 0,
          position: null,
          human: { x: 0, z: 0 }
        }
        Object.assign(window, {
          bellProbe: probe,
          yoruMoqFrame: (direction: string, payload: Uint8Array, send?: () => Promise<void>) => {
            const { value } = JSON.parse(new TextDecoder().decode(payload))
            if (direction === 'send' && value?.type === 'ritual' && value.step === 'bell')
              Object.assign(window, { replayBellRequest: send })
            if (
              direction === (authority ? 'send' : 'receive') &&
              value?.type === 'state' &&
              value.ritual?.completed === 2
            )
              probe.copies++
          }
        })
        const worldPath = '/src/world.ts'
        const matchPath = '/src/match.ts'
        const soundPath = '/src/sound.ts'
        const { HorrorWorld } = await import(/* @vite-ignore */ worldPath)
        const { HorrorMatch } = await import(/* @vite-ignore */ matchPath)
        const { YashikiSound } = await import(/* @vite-ignore */ soundPath)
        HorrorWorld.prototype.render = (frame: {
          human: { x: number; z: number }
          ritual: { completed: number } | null
        }) => {
          if (authority && probe.position) Object.assign(frame.human, probe.position)
          probe.human = { ...frame.human }
          probe.completed = frame.ritual?.completed ?? 0
        }
        const observe = HorrorMatch.prototype.observe
        HorrorMatch.prototype.observe = function (meter: ScreamMeter, rms: number, startMs: number, endMs: number) {
          const jump = probe.jump
          probe.jump = 0
          return observe.call(this, meter, rms, startMs, endMs + jump)
        }
        let inBell = false
        const start = OscillatorNode.prototype.start
        OscillatorNode.prototype.start = function (when?: number) {
          start.call(this, when)
          if (inBell) probe.sources.push({ type: this.type, state: this.context.state })
        }
        const ritualBell = YashikiSound.prototype.ritualBell
        YashikiSound.prototype.ritualBell = function () {
          probe.calls++
          inBell = true
          try {
            return ritualBell.call(this)
          } finally {
            inBell = false
          }
        }
      }, pages.length === 0)
      pages.push(page)
    }
    const [host, guest] = pages
    const bothPhase = async (phase: string) => {
      for (const page of pages) await expect(page.locator('#phase')).toHaveText(phase)
    }
    const prepare = async () => {
      for (const page of pages) await expect(page.locator('#ready')).toBeEnabled()
      await guest.locator('#ready').click()
      await host.locator('#ready').click()
    }
    await connectPlayers(host, guest)
    for (const page of pages) await expect(page.locator('#ready')).toBeDisabled()
    await host.locator('#microphone').click()
    for (const page of pages) await expect(page.locator('#ready')).toBeDisabled()
    await guest.locator('#microphone').click()
    for (const page of pages) {
      await expect(page.locator('#mic-status')).toHaveText('マイク接続中')
      await expect(page.locator('#mute')).not.toBeChecked()
      expect(Number(await page.locator('#volume').inputValue())).toBeGreaterThan(0)
    }
    await prepare()
    for (const [index, human] of pages.entries()) {
      await bothPhase(index === 0 ? '第一夜' : '第二夜')
      await expect(human.locator('#role')).toContainText('人間')
      await expect(pages[1 - index].locator('#role')).toContainText('怪異')
      await human.keyboard.press('KeyE')
      for (const page of pages) {
        await expect.poll(async () => (await read(page)).completed).toBe(1)
        await expect(page.locator('#ritual-story')).toContainText('畳の下の手紙')
      }
      const before = await Promise.all(pages.map(read))
      expect(before.map((probe) => probe.calls)).toEqual(index === 0 ? [0, 0] : [1, 0])
      await test.step('試験用に試合時計のみ4分進め、人間位置を鈴へ調整する（500ms安全時計は実時間）', async () => {
        await host.evaluate(() => {
          const probe = (window as unknown as { bellProbe: Probe }).bellProbe
          probe.jump = 240_000
          probe.position = { x: -5, z: -5 }
        })
        for (const page of pages) {
          await expect.poll(async () => (await read(page)).human).toMatchObject({ x: -5, z: -5 })
          await expect(page.locator('#ritual-hint')).toContainText('北西の鈴を探す。人間は近くで E。')
        }
      })
      for (const [playerIndex, page] of pages.entries())
        expect((await read(page)).calls).toBe(before[playerIndex].calls)
      await human.keyboard.press('KeyE')
      for (const page of pages) {
        await expect.poll(async () => (await read(page)).completed).toBe(2)
        await expect(page.locator('#ritual-story')).toContainText('鈴がひとりでに鳴る')
      }
      await expect.poll(async () => (await read(human)).calls).toBe(before[index].calls + 1)
      const after = await Promise.all(pages.map(read))
      expect(after[index].sources.length).toBeGreaterThan(before[index].sources.length)
      expect(after[index].sources.slice(before[index].sources.length)).toContainEqual({
        type: 'sine',
        state: 'running'
      })
      expect(after[1 - index].calls).toBe(before[1 - index].calls)
      expect(after[1 - index].sources).toEqual(before[1 - index].sources)
      for (let repeat = 0; repeat < 3; repeat++) await human.keyboard.press('KeyE')
      if (index === 1) {
        await guest.evaluate(async () => {
          const { replayBellRequest } = window as unknown as { replayBellRequest: () => Promise<void> }
          await replayBellRequest()
          await replayBellRequest()
        })
      }
      for (const [playerIndex, page] of pages.entries()) {
        await expect.poll(async () => (await read(page)).copies).toBeGreaterThan(after[playerIndex].copies + 2)
        const repeated = await read(page)
        expect(repeated.completed).toBe(2)
        expect(repeated.calls).toBe(after[playerIndex].calls)
        expect(repeated.sources).toEqual(after[playerIndex].sources)
      }
      if (index === 0) {
        await host.evaluate(() => {
          const probe = (window as unknown as { bellProbe: Probe }).bellProbe
          probe.position = null
          probe.jump = 900_000
        })
        await bothPhase('役割を交代')
        for (const page of pages) await expect.poll(async () => (await read(page)).completed).toBe(0)
        for (const page of pages) await expect(page.locator('#ready')).toBeEnabled()
        await guest.locator('#ready').click()
        await bothPhase('役割を交代')
        await host.locator('#ready').click()
      }
    }
    for (const page of pages) expect((await read(page)).calls).toBe(1)
  } finally {
    await Promise.all(browsers.map((browser) => browser.close()))
  }
})

test('描画カメラと方角表示は両端末の旋回と二夜の役割交代に追従する', async ({}, testInfo) => {
  test.setTimeout(180_000)
  const options = testInfo.project.use.launchOptions as LaunchOptions
  const browsers: Browser[] = []
  const pages: Page[] = []
  type HeadingProbe = {
    frames: number
    jump: number
    role: string
    yaw: number
    heading: string | null
    direction: { x: number; y: number; z: number }
  }
  const read = (page: Page) => page.evaluate(() => (window as unknown as { headingProbe: HeadingProbe }).headingProbe)
  const headings = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']
  const angleDifference = (actual: number, expected: number) =>
    Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected))
  const checkHeading = async (page: Page, role: string, sector: number) => {
    const label = '現在の向き：' + headings[sector]
    await page.locator('#heading').scrollIntoViewIfNeeded()
    await expect(page.locator('#heading')).toBeVisible()
    await expect(page.locator('#heading')).toBeInViewport()
    await expect(page.locator('#heading')).toHaveText(label)
    await expect
      .poll(async () => {
        const probe = await read(page)
        const length = Math.hypot(probe.direction.x, probe.direction.z)
        const angle = Math.atan2(probe.direction.x, -probe.direction.z)
        return {
          role: probe.role,
          heading: probe.heading,
          cameraSector: ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8,
          rendered: probe.frames > 0,
          followsYaw:
            length > 0 &&
            Math.abs(probe.direction.x / length - Math.sin(probe.yaw)) < 0.000001 &&
            Math.abs(probe.direction.z / length + Math.cos(probe.yaw)) < 0.000001
        }
      })
      .toEqual({ role, heading: label, cameraSector: sector, rendered: true, followsYaw: true })
    expect(
      await page
        .locator('#heading')
        .evaluate((element) =>
          Boolean(element.closest('[aria-live]:not([aria-live=off]), [role=status], [role=alert], [role=log]'))
        )
    ).toBe(false)
  }
  try {
    for (let index = 0; index < 2; index++) {
      const browser = await chromium.launch({ ...options, headless: true })
      browsers.push(browser)
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL as string,
        permissions: ['microphone'],
        viewport: { width: 360, height: 480 },
        deviceScaleFactor: 0.5
      })
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === testInfo.project.use.baseURL ? route.continue() : route.abort()
      )
      await context.addInitScript(() => {
        const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          const granted = await getUserMedia(constraints)
          granted.getTracks().forEach((track) => track.stop())
          const audio = new AudioContext()
          const oscillator = audio.createOscillator()
          const gain = audio.createGain()
          const destination = audio.createMediaStreamDestination()
          gain.gain.value = 0.001
          oscillator.connect(gain).connect(destination)
          oscillator.start()
          await audio.resume()
          return destination.stream
        }
      })
      const page = await context.newPage()
      pages.push(page)
      await page.goto('/')
      await page.evaluate(async () => {
        const probe: HeadingProbe = {
          frames: 0,
          jump: 0,
          role: '',
          yaw: 0,
          heading: null,
          direction: { x: 0, y: 0, z: 0 }
        }
        Object.assign(window, { headingProbe: probe })
        const worldPath = '/src/world.ts'
        const matchPath = '/src/match.ts'
        const { HorrorWorld } = await import(/* @vite-ignore */ worldPath)
        const { HorrorMatch } = await import(/* @vite-ignore */ matchPath)
        const render = HorrorWorld.prototype.render
        HorrorWorld.prototype.render = function (frame: WorldFrame) {
          if (probe.frames === 0 || probe.yaw !== (frame.role === 'human' ? frame.human : frame.haunter).yaw) {
            render.call(this, frame)
          } else {
            const viewer = frame.role === 'human' ? frame.human : frame.haunter
            const height = frame.role === 'human' ? 1.6 : 3.1
            const basePitch = frame.role === 'human' ? 0 : Math.atan2(-2.1, 3.5)
            const pitch = basePitch + (frame.pitch ?? 0)
            const camera = (this as unknown as { camera: PerspectiveCamera }).camera
            camera.position.set(viewer.x, height, viewer.z)
            camera.lookAt(
              viewer.x + Math.sin(viewer.yaw) * Math.cos(pitch),
              height + Math.sin(pitch),
              viewer.z - Math.cos(viewer.yaw) * Math.cos(pitch)
            )
          }
          const camera = (this as unknown as { camera: PerspectiveCamera }).camera
          const direction = camera.getWorldDirection(camera.position.clone())
          probe.frames++
          probe.role = frame.role
          probe.yaw = (frame.role === 'human' ? frame.human : frame.haunter).yaw
          probe.heading = document.querySelector('#heading')?.textContent ?? null
          probe.direction = { x: direction.x, y: direction.y, z: direction.z }
        }
        const observe = HorrorMatch.prototype.observe
        HorrorMatch.prototype.observe = function (meter: ScreamMeter, rms: number, startMs: number, endMs: number) {
          const jump = probe.jump
          probe.jump = 0
          return observe.call(this, meter, rms, startMs, endMs + jump)
        }
      })
    }
    const [host, guest] = pages
    const bothPhase = async (phase: string) => {
      for (const page of pages) await expect(page.locator('#phase')).toHaveText(phase)
    }
    await connectPlayers(host, guest)
    for (const page of pages) await expect(page.locator('#ready')).toBeDisabled()
    await host.locator('#microphone').click()
    for (const page of pages) await expect(page.locator('#ready')).toBeDisabled()
    await guest.locator('#microphone').click()
    for (const page of pages) await expect(page.locator('#mic-status')).toHaveText('マイク接続中')
    for (let night = 0; night < 2; night++) {
      for (const page of pages) await expect(page.locator('#ready')).toBeEnabled()
      await guest.locator('#ready').click()
      await bothPhase(night === 0 ? '準備を整えてください' : '役割を交代')
      await host.locator('#ready').click()
      const phase = night === 0 ? '第一夜' : '第二夜'
      await bothPhase(phase)
      for (const [index, page] of pages.entries()) {
        const human = index === night
        await expect(page.locator('#role')).toContainText(human ? '人間' : '怪異')
        await checkHeading(page, human ? 'human' : 'haunter', human ? 0 : 4)
      }
      for (const [index, page] of pages.entries()) {
        const other = pages[1 - index]
        const before = await read(other)
        const human = index === night
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await page.locator('#world').click()
        await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('world')
        for (let step = 1; step <= 8; step++) {
          const sector = ((human ? 0 : 4) + step) % 8
          const { frames, yaw } = await read(page)
          const targetYaw = yaw + Math.PI / 4
          await page.evaluate(() => {
            if (document.pointerLockElement?.id !== 'world') throw new Error('world pointer lock lost')
            document.dispatchEvent(new MouseEvent('mousemove', { movementX: Math.round(Math.PI / 4 / 0.002) }))
          })
          await checkHeading(page, human ? 'human' : 'haunter', sector)
          await expect.poll(async () => angleDifference((await read(page)).yaw, targetYaw)).toBeCloseTo(0, 2)
          await page.waitForTimeout(250)
          await checkHeading(page, human ? 'human' : 'haunter', sector)
          expect(angleDifference((await read(page)).yaw, targetYaw)).toBeCloseTo(0, 2)
          expect((await read(page)).frames).toBeGreaterThan(frames)
          await bothPhase(phase)
          await checkHeading(other, before.role, headings.indexOf(before.heading!.replace('現在の向き：', '')))
          expect((await read(other)).yaw).toBeCloseTo(before.yaw, 6)
        }
        await page.evaluate(() => document.exitPointerLock())
      }
      if (night === 0) {
        await host.evaluate(() => {
          const probe = (window as unknown as { headingProbe: HeadingProbe }).headingProbe
          probe.jump = 900_000
        })
        await bothPhase('役割を交代')
      }
    }
  } catch (error) {
    for (const [index, page] of pages.entries()) {
      const diagnostics = await page.evaluate(() => ({
        phase: document.querySelector('#phase')?.textContent,
        notice: document.querySelector('#notice')?.textContent,
        microphone: document.querySelector('#mic-status')?.textContent,
        focusedElement: { tag: document.activeElement?.tagName, id: document.activeElement?.id },
        probe: (window as unknown as { headingProbe?: HeadingProbe }).headingProbe
      }))
      console.error('heading diagnostics', index, diagnostics)
      await testInfo.attach(`heading-player-${index}`, {
        body: JSON.stringify(diagnostics, null, 2),
        contentType: 'application/json'
      })
    }
    throw error
  } finally {
    await Promise.all(browsers.map((browser) => browser.close()))
  }
})

test('全画面の入退場と演出音設定が同期する', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 })
  await page.goto('/')
  const fullscreen = page.locator('#fullscreen')
  const canvas = page.locator('#world canvas')
  const originalHeight = await canvas.evaluate((element: HTMLCanvasElement) => element.height)
  await page.locator('#volume').fill('0.31')
  await page.locator('#mute').check()
  await expect(page.locator('#play-volume')).toHaveValue('0.31')
  await expect(page.locator('#play-mute')).toBeChecked()
  await fullscreen.focus()
  await page.keyboard.press('Enter')
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.height)).not.toBe(originalHeight)
  await page.locator('#play-volume').fill('0.12')
  await page.locator('#play-mute').uncheck()
  await expect(page.locator('#volume')).toHaveValue('0.12')
  await expect(page.locator('#volume-value')).toHaveText('12%')
  await expect(page.locator('#mute')).not.toBeChecked()
  await page.evaluate(() => document.exitFullscreen())
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.height)).toBe(originalHeight)
  await fullscreen.click()
  await expect(fullscreen).toHaveText('全画面を終了')
  await fullscreen.click()
  await expect(fullscreen).toHaveText('全画面表示')
  await expect(page.locator('#reset')).toBeEnabled()
})

for (const failure of ['rejected', 'unsupported'] as const) {
  test(`全画面 ${failure} でも通常表示で続けられる`, async ({ page }) => {
    await page.addInitScript((mode) => {
      if (mode === 'unsupported') Object.defineProperty(document, 'fullscreenEnabled', { value: false })
      else Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('denied', 'NotAllowedError'))
    }, failure)
    await page.goto('/')
    await page.locator('#fullscreen').click()
    await expect(page.locator('#fullscreen-status')).toContainText('通常表示で続けられます')
    await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'false')
    await page.locator('#play-mute').check()
    await expect(page.locator('#mute')).toBeChecked()
    await expect(page.locator('#reset')).toBeEnabled()
  })
}

test('マイク補正のブラウザー報告と停止時の消去を表示する', async ({ page }) => {
  await page.route('**/src/sound.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export class YashikiSound { setVolume() {} setMuted() {} start() {} stop() {} stopPreview() {} dispose() {} }'
    })
  )
  await page.addInitScript(() => {
    let requests = 0
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const request = ++requests
        const track = {
          enabled: true,
          muted: request === 3,
          readyState: 'live',
          onended: null as (() => void) | null,
          onmute: null as (() => void) | null,
          onunmute: null as (() => void) | null,
          getSettings() {
            if (request === 2) throw new Error('settings unavailable')
            return { autoGainControl: false, noiseSuppression: true, echoCancellation: false }
          },
          stop() {
            this.readyState = 'ended'
          }
        }
        Object.assign(window, { testSettingsTrack: track })
        return { getTracks: () => [track], getAudioTracks: () => [track] }
      }
    })
    class MockAudioContext {
      currentTime = 0
      sampleRate = 48000
      state = 'running'
      onstatechange = null
      async resume() {}
      async close() {
        this.state = 'closed'
      }
      async suspend() {
        this.state = 'suspended'
      }
      createAnalyser() {
        return { fftSize: 8192, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0) }
      }
      createMediaStreamSource() {
        return { connect() {} }
      }
    }
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext })
  })
  await page.goto('/')
  const report = page.locator('#mic-processing')
  await expect(report).toBeVisible()
  await expect(report).toHaveAttribute('role', 'status')
  await expect(report).toHaveText('入力補正（接続時のブラウザー報告）：不明（接続情報なし）')
  await page.locator('#microphone').click()
  await expect(page.locator('#mic-status')).toHaveText('マイク接続中')
  await expect(report).toHaveText(
    '入力補正（接続時のブラウザー報告）：自動音量調整：オフ / ノイズ抑制：オン / エコー除去：オフ'
  )
  await page.evaluate(() => {
    const track = (window as unknown as { testSettingsTrack: { muted: boolean; onmute: () => void } }).testSettingsTrack
    track.muted = true
    track.onmute()
  })
  await expect(report).toHaveText('入力補正（接続時のブラウザー報告）：不明（接続情報なし）')
  await page.locator('#microphone').click()
  await expect(page.locator('#mic-status')).toHaveText('マイク接続中')
  await expect(report).toHaveText(
    '入力補正（接続時のブラウザー報告）：自動音量調整：不明 / ノイズ抑制：不明 / エコー除去：不明'
  )
  await page.locator('#microphone').click()
  await expect(page.locator('#mic-status')).toHaveText('マイクを確認してください')
  await expect(report).toHaveText('入力補正（接続時のブラウザー報告）：不明（接続情報なし）')
  await expect(page.locator('#ready')).toBeDisabled()
})

test('マイク許可の保留中も状態を表示し再試行できる', async ({ page }) => {
  await page.addInitScript(() => {
    let requests = 0
    navigator.mediaDevices.getUserMedia = async () => {
      requests++
      if (requests === 1) return new Promise<MediaStream>(() => {})
      throw new DOMException('denied', 'NotAllowedError')
    }
  })
  await page.goto('/')
  await page.locator('#microphone').click()
  await expect(page.locator('#mic-status')).toHaveText('マイクの許可を待っています')
  await expect(page.locator('#ready')).toBeDisabled()
  await page.locator('#microphone').click()
  await expect(page.locator('#mic-status')).toHaveText('マイクを利用できません')
  await expect(page.locator('#ready')).toBeDisabled()
})

test('マイク拒否時は準備できない', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => Promise.reject(new DOMException('denied', 'NotAllowedError'))
    })
  })
  await page.goto('/')
  await page.locator('#microphone').click()
  await expect(page.locator('#mic-status')).toHaveText('マイクを利用できません')
  await expect(page.locator('#preview-status')).toHaveText('マイクを接続してください')
  await expect(page.locator('#ready')).toBeDisabled()
})

test('ローカルプレビューは閾値とマイク停止に追従する', async ({ page, context }) => {
  await context.grantPermissions(['microphone'])
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints)
      Object.assign(window, { previewTrack: stream.getAudioTracks()[0] })
      return stream
    }
    AnalyserNode.prototype.getFloatTimeDomainData = function (samples) {
      for (let index = 0; index < samples.length; index++)
        samples[index] = 0.4 * Math.sin((2 * Math.PI * 200 * index) / this.context.sampleRate)
    }
  })
  await page.goto('/')
  await page.locator('#microphone').click()
  await expect(page.locator('#preview-status')).toHaveText('減点候補')
  await page.locator('#threshold').fill('0.5')
  await expect(page.locator('#preview-status')).toHaveText('音量不足')
  await page.locator('#threshold').fill('0.1')
  await expect(page.locator('#preview-status')).toHaveText('減点候補')
  await expect(page.locator('#scores')).toHaveText('主催 0.00 / 参加者 0.00')
  await page.evaluate(() => {
    const track = (window as unknown as { previewTrack: MediaStreamTrack }).previewTrack
    track.stop()
    track.dispatchEvent(new Event('ended'))
  })
  await expect(page.locator('#preview-status')).toHaveText('マイクを接続してください')
})

test('準備中の鈴試聴は一度だけ鳴り、ミュートとマイク停止で止まる', async ({ page, context }) => {
  await context.grantPermissions(['microphone'])
  await page.addInitScript(() => {
    const audit: {
      starts: { state: AudioContextState }[]
      immediateStops: number
      track?: MediaStreamTrack
    } = { starts: [], immediateStops: 0 }
    Object.assign(window, { bellPreviewAudit: audit })
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints)
      audit.track = stream.getAudioTracks()[0]
      return stream
    }
    const start = OscillatorNode.prototype.start
    const stop = OscillatorNode.prototype.stop
    OscillatorNode.prototype.start = function (when) {
      audit.starts.push({ state: this.context.state })
      return start.call(this, when)
    }
    OscillatorNode.prototype.stop = function (when) {
      if (when === undefined || when <= this.context.currentTime) audit.immediateStops++
      return stop.call(this, when)
    }
  })
  await page.goto('/')
  const preview = page.locator('#sound-preview')
  const mute = page.locator('#mute')
  const volume = page.locator('#volume')
  await expect(preview).toBeDisabled()
  await page.locator('#microphone').click()
  await expect(page.locator('#mic-status')).toHaveText('マイク接続中')
  await expect(preview).toBeEnabled()
  await mute.check()
  await expect(preview).toBeDisabled()
  await mute.uncheck()
  await volume.fill('0')
  await expect(preview).toBeDisabled()
  await volume.fill('0.2')
  await preview.click()
  await expect(page.locator('#sound-preview-status')).toHaveText('鈴を一度だけ鳴らします。自動では繰り返しません。')
  const readAudit = () =>
    page.evaluate(() => {
      const audit = (
        window as unknown as {
          bellPreviewAudit: { starts: { state: string }[]; immediateStops: number }
        }
      ).bellPreviewAudit
      return { starts: audit.starts, immediateStops: audit.immediateStops }
    })
  await expect.poll(async () => (await readAudit()).starts).toEqual([{ state: 'running' }, { state: 'running' }])
  await expect(preview).toBeEnabled({ timeout: 5000 })
  await page.evaluate(() => {
    document.getElementById('sound-preview')!.click()
    document.getElementById('mute')!.click()
  })
  await expect(preview).toBeDisabled()
  await expect.poll(async () => (await readAudit()).immediateStops).toBeGreaterThanOrEqual(2)
  await mute.uncheck()
  await expect(preview).toBeEnabled()
  await page.evaluate(() => {
    const track = (window as unknown as { bellPreviewAudit: { track: MediaStreamTrack } }).bellPreviewAudit.track
    track.stop()
    track.dispatchEvent(new Event('ended'))
  })
  await expect(preview).toBeDisabled()
  expect((await readAudit()).starts).toHaveLength(4)
})
