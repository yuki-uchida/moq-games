import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium, type Browser, type Page } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RITUAL_STEPS } from '../src/ritual'

type Harness = {
  now: number
  frame?: FrameRequestCallback
  steps: { surface: string; now: number }[]
  sources: number
  stateSequence: number
  sent: Record<string, any>[]
  view: { human: { x: number; z: number }; haunter: { x: number; z: number } }
  peer: { receive(value: unknown): void; disconnect(): void }
  match: { tick(delta: number): void; pause(): void }
  advance(delta?: number): void
  key(code: string, down: boolean): void
  renderStory(completed: number | null, round: 'round1' | 'round2', paused?: boolean): void
}
declare global {
  interface Window {
    footstepsTest: Harness
  }
}

let browser: Browser
let script: string

beforeAll(async () => {
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL('../src/main.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'iife',
    loader: { '.css': 'empty' },
    plugins: [
      {
        name: 'offline-main-fixture',
        setup(builder) {
          builder.onLoad({ filter: /[/\\]peer\.ts$/ }, () => ({
            contents: `
              export const createRoomCode = () => 'a'.repeat(32)
              export class HorrorPeer {
                constructor(options) {
                  this.options = options
                  this.challenge = 0
                  window.footstepsTest.peer = this
                }
                connect() { this.options.onStatus('connected'); return Promise.resolve() }
                close() {}
                receive(value) { this.options.onMessage(value) }
                disconnect() { this.options.onStatus('closed') }
                send(value) {
                  window.footstepsTest.sent.push(value)
                  if (value.type === 'health') this.receive({
                    ...value, mic: true, rms: 0, voiced: false,
                    challenge: this.options.role === 'host' ? value.challenge : ++this.challenge
                  })
                  if (value.type === 'ready') this.receive(value)
                  return true
                }
              }
            `,
            loader: 'js'
          }))
          builder.onLoad({ filter: /[/\\]world\.ts$/ }, async ({ path }) => ({
            contents:
              (await readFile(path, 'utf8')).split('export class HorrorWorld')[0] +
              `
                export class HorrorWorld {
                  isHealthy = true
                  resize() {}
                  dispose() {}
                  render(frame) { window.footstepsTest.view = structuredClone(frame) }
                }
              `,
            loader: 'ts'
          }))
          builder.onLoad({ filter: /[/\\]main\.ts$/ }, async ({ path }) => ({
            contents:
              (await readFile(path, 'utf8')) +
              [
                '',
                'window.footstepsTest.match = match',
                'window.footstepsTest.renderStory = (completed, round, paused = false) => {',
                'snapshot = { ...snapshot, phase: completed === null ? "lobby" : round,',
                'survivor: round === "round1" ? "host" : "guest", elapsedMs: completed === null ? 0 : 720000, paused }',
                'ritual = completed === null ? null : { round, completed }',
                'updateUI()',
                '}'
              ].join('\n'),
            loader: 'ts'
          }))
          builder.onLoad({ filter: /[/\\]sound\.ts$/ }, async ({ path }) => ({
            contents:
              (await readFile(path, 'utf8')) +
              `
                const original = YashikiSound.prototype.footstep
                YashikiSound.prototype.footstep = function(surface) {
                  window.footstepsTest.steps.push({surface, now: performance.now()})
                  return original.call(this, surface)
                }
              `,
            loader: 'ts'
          }))
        }
      }
    ]
  })
  script = bundled.outputFiles[0].text
  browser = await chromium.launch({ headless: true })
}, 30_000)

afterAll(async () => browser?.close())

async function setup(role: 'host' | 'guest', start = true) {
  const context = await browser.newContext({ offline: true })
  const page = await context.newPage()
  await page.setContent('<div id="app"></div>')
  await page.evaluate(() => {
    const harness = {
      now: 1000,
      steps: [],
      sources: 0,
      stateSequence: 0,
      sent: [],
      advance(delta = 100) {
        harness.now += delta
        harness.frame?.(harness.now)
      },
      key(code: string, down: boolean) {
        window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }))
      }
    } as Harness
    window.footstepsTest = harness
    performance.now = () => harness.now
    window.requestAnimationFrame = (callback) => {
      harness.frame = callback
      return 1
    }
    window.cancelAnimationFrame = () => {
      harness.frame = undefined
    }
    class SilentAudio extends OfflineAudioContext {
      constructor() {
        super(1, 512, 44100)
        Object.defineProperties(this, {
          state: { get: () => 'running' },
          currentTime: { get: () => harness.now / 1000 }
        })
      }
      async resume() {}
      async close() {}
      createMediaStreamSource() {
        return { connect() {} } as unknown as MediaStreamAudioSourceNode
      }
      createBufferSource() {
        harness.sources++
        return super.createBufferSource()
      }
    }
    Object.assign(window, { AudioContext: SilentAudio })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const track = {
            readyState: 'live',
            muted: false,
            enabled: true,
            stop() {
              this.readyState = 'ended'
            }
          }
          return { getAudioTracks: () => [track], getTracks: () => [track] }
        }
      }
    })
  })
  await page.addScriptTag({ content: script })
  if (start)
    await page.evaluate(async (role) => {
      await document.getElementById(role)!.onclick!(new MouseEvent('click'))
      await document.getElementById('microphone')!.onclick!(new MouseEvent('click'))
      if (role === 'host') document.getElementById('ready')!.click()
      window.footstepsTest.advance()
    }, role)
  return { context, page }
}

const capture = (page: Page) =>
  page.evaluate(() => ({
    steps: window.footstepsTest.steps,
    sources: window.footstepsTest.sources,
    view: window.footstepsTest.view
  }))

async function walk(page: Page, ticks: number, code = 'KeyW') {
  await page.evaluate(
    ({ ticks, code }) => {
      const game = window.footstepsTest
      game.key(code, true)
      for (let index = 0; index < ticks; index++) game.advance()
      game.key(code, false)
    },
    { ticks, code }
  )
}

async function receiveState(
  page: Page,
  elapsedMs: number,
  z: number,
  options: {
    phase?: 'round1' | 'round2' | 'finished'
    paused?: boolean
    yaw?: number
    gap?: number
    invalid?: boolean
    ritualCompleted?: number
    readinessEpoch?: number
    scores?: { host: number; guest: number }
  } = {}
) {
  await page.evaluate(
    ({ elapsedMs, z, options }) => {
      const game = window.footstepsTest
      game.advance(options.gap ?? 100)
      const phase = options.phase ?? 'round2'
      const round = phase === 'round1' || phase === 'round2'
      game.peer.receive({
        type: 'state',
        sequence: ++game.stateSequence,
        readinessEpoch: options.readinessEpoch ?? (phase === 'round1' ? 1 : 2),
        snapshot: {
          phase,
          survivor: phase === 'round1' ? 'host' : 'guest',
          elapsedMs,
          paused: options.paused ?? false,
          scores: options.scores ?? { host: 0, guest: 0 }
        },
        human: options.invalid ? null : { x: -5, z, yaw: options.yaw ?? 0 },
        haunter: { x: 5, z: -5 + game.stateSequence * 0.1, yaw: 0 },
        ritual: round ? { round: phase, completed: options.ritualCompleted ?? 0 } : null,
        spirit: round ? { round: phase, energy: 100, at: 0, last: null } : null,
        effect: null
      })
    },
    { elapsedMs, z, options }
  )
}

describe('main footsteps with offline peer and silent audio', () => {
  it('shows concise voice and network scoring guidance before connecting', async () => {
    const { page, context } = await setup('guest', false)
    try {
      const note = page.locator('.intro .note')
      expect(await note.isVisible()).toBe(true)
      const content = await note.textContent()
      expect(content).toContain('ヘッドフォンを推奨します')
      expect(content).toContain('生の音声データは録音・送信しません')
      expect(content).toContain('参加者が人間の夜は通信の揺れで得点が変わることがあります')
      const preview = page.locator('.voice-preview .note')
      expect(await preview.isVisible()).toBe(true)
      expect(await preview.textContent()).toContain('閾値以上の声候補が0.3秒続くと減点候補になります')
      expect(await preview.textContent()).toContain('重複する判定の積算で短い音でも減点されることがあります')
    } finally {
      await context.close()
    }
  })

  it('does not mutate an unchanged pause notice in the real DOM', async () => {
    const { page, context } = await setup('guest')
    try {
      await receiveState(page, 1000, 0, { phase: 'round1', readinessEpoch: 1 })
      await page.evaluate(() => {
        const notice = document.getElementById('notice')!
        notice.dataset.mutations = '0'
        new MutationObserver((records) => {
          notice.dataset.mutations = String(Number(notice.dataset.mutations) + records.length)
        }).observe(notice, { childList: true, characterData: true, subtree: true })
      })
      const notice = page.locator('#notice')
      await receiveState(page, 1000, 0, { phase: 'round1', paused: true, readinessEpoch: 2 })
      expect(await notice.textContent()).toBe('相手が中断しました。両者で再準備してください。')
      expect(await notice.getAttribute('data-mutations')).toBe('1')
      for (let index = 0; index < 5; index++)
        await receiveState(page, 1000, 0, { phase: 'round1', paused: true, readinessEpoch: 2 })
      expect(await notice.getAttribute('data-mutations')).toBe('1')

      await receiveState(page, 1000, 0, { phase: 'round1', readinessEpoch: 3 })
      expect(await notice.textContent()).toBe('')
      expect(await notice.getAttribute('data-mutations')).toBe('2')
      await receiveState(page, 1000, 0, { phase: 'round1', paused: true, readinessEpoch: 4 })
      expect(await notice.textContent()).toBe('相手が中断しました。両者で再準備してください。')
      expect(await notice.getAttribute('data-mutations')).toBe('3')
    } finally {
      await context.close()
    }
  })

  it.each(['host', 'guest'] as const)('preserves story nodes and ordered text for %s', async (role) => {
    const { page, context } = await setup(role)
    try {
      const result = await page.evaluate(() => {
        const game = window.footstepsTest
        const list = document.getElementById('ritual-story')!
        const lines = () => Array.from(list.children)
        const texts = () => lines().map((line) => line.textContent)
        const identical = (previous: Element[]) =>
          previous.length === list.children.length && previous.every((line, index) => line === list.children[index])
        game.renderStory(null, 'round1')
        const lobby = texts()
        game.renderStory(0, 'round1')
        const zero = texts()
        game.renderStory(1, 'round1')
        const one = texts()
        const firstNodes = lines()
        game.renderStory(1, 'round1')
        game.renderStory(1, 'round1')
        game.renderStory(1, 'round1')
        const stable = identical(firstNodes)
        game.renderStory(1, 'round1', true)
        const paused = identical(firstNodes)
        game.renderStory(1, 'round1')
        const resumed = identical(firstNodes)
        game.renderStory(3, 'round1')
        const skipped = texts()
        const oldRoundNodes = lines()
        game.renderStory(3, 'round2')
        const sameCountRound = { text: texts(), identical: identical(oldRoundNodes) }
        game.renderStory(0, 'round2')
        const reset = texts()
        const detached = oldRoundNodes.every((line) => !line.isConnected)
        game.renderStory(1, 'round2')
        const reacquired = texts()
        const fresh = list.children[0] !== oldRoundNodes[0] && list.children[0] !== firstNodes[0]
        return {
          lobby,
          zero,
          one,
          stable,
          paused,
          resumed,
          skipped,
          sameCountRound,
          reset,
          detached,
          reacquired,
          fresh
        }
      })
      const expected = RITUAL_STEPS.map((step) => step.text)
      expect(result).toEqual({
        lobby: [],
        zero: [],
        one: expected.slice(0, 1),
        stable: true,
        paused: true,
        resumed: true,
        skipped: expected.slice(0, 3),
        sameCountRound: { text: expected.slice(0, 3), identical: true },
        reset: [],
        detached: true,
        reacquired: expected.slice(0, 1),
        fresh: true
      })
    } finally {
      await context.close()
    }
  })

  it('keeps guest story references across received updates and rejects an old epoch', async () => {
    const { page, context } = await setup('guest')
    try {
      await receiveState(page, 720000, 5, { phase: 'round1', ritualCompleted: 1 })
      const original = await page.locator('#ritual-story li').first().elementHandle()
      expect(original).not.toBeNull()
      for (const paused of [false, true, false]) {
        await receiveState(page, 720000, 5, { phase: 'round1', ritualCompleted: 1, paused })
        expect(await original!.evaluate((line) => line === document.querySelector('#ritual-story li'))).toBe(true)
      }
      await receiveState(page, 720000, 5, { phase: 'round1', ritualCompleted: 3 })
      expect(await page.locator('#ritual-story li').allTextContents()).toEqual(
        RITUAL_STEPS.slice(0, 3).map((step) => step.text)
      )
      const beforeReset = await page.locator('#ritual-story li').first().elementHandle()
      await receiveState(page, 0, 5, { phase: 'round2' })
      expect(await page.locator('#ritual-story li').count()).toBe(0)
      expect(await beforeReset!.evaluate((line) => line.isConnected)).toBe(false)
      await receiveState(page, 720000, 5, { phase: 'round2', ritualCompleted: 3, readinessEpoch: 1 })
      expect(await page.locator('#ritual-story li').count()).toBe(0)
      await receiveState(page, 0, 5, { phase: 'round2', ritualCompleted: 1 })
      expect(await page.locator('#ritual-story li').allTextContents()).toEqual([RITUAL_STEPS[0].text])
      expect(await original!.evaluate((line) => line === document.querySelector('#ritual-story li'))).toBe(false)
    } finally {
      await context.close()
    }
  })

  it.each([
    { host: -0.011, guest: -0.014, scores: '-0.011 / 参加者 -0.014', winner: '主催の勝ち' },
    { host: -0.014, guest: -0.011, scores: '-0.014 / 参加者 -0.011', winner: '参加者の勝ち' },
    { host: -0.0001, guest: -0.0002, scores: '-0.0001 / 参加者 -0.0002', winner: '主催の勝ち' },
    { host: 0, guest: -0.0001, scores: '0 / 参加者 -0.0001', winner: '主催の勝ち' },
    { host: -0.0001, guest: -0, scores: '-0.0001 / 参加者 0', winner: '参加者の勝ち' },
    { host: 0, guest: -Number.MIN_VALUE, scores: '0 / 参加者 -5e-324', winner: '主催の勝ち' },
    { host: -Number.MIN_VALUE, guest: 0, scores: '-5e-324 / 参加者 0', winner: '参加者の勝ち' },
    {
      host: -0.01,
      guest: -0.010000000000000002,
      scores: '-0.01 / 参加者 -0.010000000000000002',
      winner: '主催の勝ち'
    }
  ])('shows unrounded final scores for $host versus $guest', async ({ host, guest, scores, winner }) => {
    const { page, context } = await setup('guest')
    try {
      await receiveState(page, 900000, 5, { phase: 'finished', scores: { host, guest } })
      expect(await page.locator('#scores').textContent()).toBe(`主催 ${scores}（僅差のため丸めずに表示）`)
      expect(await page.locator('#role').textContent()).toBe(`${winner}。0に近いスコアが勝ちです。`)
    } finally {
      await context.close()
    }
  })

  it.each([
    { host: -0.011, guest: -0.011, scores: '-0.01 / 参加者 -0.01', winner: '引き分け' },
    { host: -0, guest: 0, scores: '0.00 / 参加者 0.00', winner: '引き分け' },
    { host: -0.01, guest: -0.02, scores: '-0.01 / 参加者 -0.02', winner: '主催の勝ち' },
    { host: -0.02, guest: -0.01, scores: '-0.02 / 参加者 -0.01', winner: '参加者の勝ち' }
  ])('keeps two final decimals for $host versus $guest', async ({ host, guest, scores, winner }) => {
    const { page, context } = await setup('guest')
    try {
      await receiveState(page, 900000, 5, { phase: 'finished', scores: { host, guest } })
      expect(await page.locator('#scores').textContent()).toBe(`主催 ${scores}`)
      expect(await page.locator('#role').textContent()).toBe(`${winner}。0に近いスコアが勝ちです。`)
    } finally {
      await context.close()
    }
  })

  it.each(['round1', 'round2'] as const)('keeps two decimals during %s even for close scores', async (phase) => {
    const { page, context } = await setup('guest')
    try {
      await receiveState(page, 0, 5, { phase, scores: { host: -0.011, guest: -0.014 } })
      expect(await page.locator('#scores').textContent()).toBe('主催 -0.01 / 参加者 -0.01')
    } finally {
      await context.close()
    }
  })

  it.each([240, 320])('keeps precise final scores within the panel at %ipx', async (width) => {
    const { page, context } = await setup('guest')
    try {
      await page.setViewportSize({ width, height: 720 })
      await page.addStyleTag({ path: fileURLToPath(new URL('../src/style.css', import.meta.url)) })
      await receiveState(page, 900000, 5, {
        phase: 'finished',
        scores: { host: -0.010000000000000002, guest: -0.010000000000000004 }
      })
      expect(await page.locator('#scores').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    } finally {
      await context.close()
    }
  })

  it('guest haunter stays silent; second-night human uses accepted host coordinates on both floors', async () => {
    const { page, context } = await setup('guest')
    try {
      await receiveState(page, 0, 5, { phase: 'round1' })
      await walk(page, 5)
      for (let index = 1; index <= 6; index++) {
        await receiveState(page, index * 100, 5 - index * 0.3, { phase: 'round1' })
      }
      expect((await capture(page)).steps).toEqual([])
      await receiveState(page, 0, 5)
      await walk(page, 10)
      expect((await capture(page)).steps).toEqual([])
      await receiveState(page, 0, 5)
      await receiveState(page, 100, 4.7)
      await receiveState(page, 200, 4.4)
      expect((await capture(page)).steps).toEqual([])
      await receiveState(page, 300, 4.1)
      expect((await capture(page)).steps.map(({ surface }) => surface)).toEqual(['tatami'])
      for (let index = 4; index <= 8; index++) {
        await receiveState(page, index * 100, 4.1, { yaw: index })
      }
      expect((await capture(page)).steps).toHaveLength(1)
      await receiveState(page, 900, 0.9)
      expect((await capture(page)).steps).toHaveLength(1)
      await receiveState(page, 1000, 0.6)
      await receiveState(page, 1100, 0.3)
      await receiveState(page, 1200, 0)
      expect((await capture(page)).steps.map(({ surface }) => surface)).toEqual(['tatami', 'wood'])
      expect((await capture(page)).sources).toBe(2)
    } finally {
      await context.close()
    }
  })

  it('guest discards mute, missing/invalid snapshots, pause/resume and finish without delayed steps', async () => {
    const { page, context } = await setup('guest')
    try {
      await receiveState(page, 0, 5)
      await receiveState(page, 200, 4.4)
      await page.evaluate(() => document.getElementById('mute')!.click())
      await receiveState(page, 300, 4.1)
      await page.evaluate(() => document.getElementById('mute')!.click())
      await receiveState(page, 400, 3.8)
      expect((await capture(page)).steps).toEqual([])
      await receiveState(page, 600, 3.2)
      await receiveState(page, 700, 2.9, { invalid: true })
      await receiveState(page, 800, 2.6)
      expect((await capture(page)).steps).toEqual([])
      await receiveState(page, 1000, 2)
      await receiveState(page, 1600, 0.2, { gap: 400 })
      expect((await capture(page)).steps).toEqual([])
      await receiveState(page, 1700, -0.1)
      await receiveState(page, 1800, -0.4, { paused: true })
      await receiveState(page, 1800, 5)
      expect((await capture(page)).steps).toEqual([])
      await receiveState(page, 1900, 4.7)
      await receiveState(page, 2000, 4.4)
      await receiveState(page, 2100, 4.1)
      expect((await capture(page)).steps.map(({ surface }) => surface)).toEqual(['tatami'])
      await page.evaluate(() => window.footstepsTest.peer.disconnect())
      await receiveState(page, 2200, 3.8)
      expect((await capture(page)).steps).toHaveLength(1)
      await receiveState(page, 900000, -5, { phase: 'finished' })
      expect((await capture(page)).steps).toHaveLength(1)
      expect((await capture(page)).sources).toBe(1)
    } finally {
      await context.close()
    }
  })

  it('host human follows collision-resolved motion on both floors, not keys, walls or rotation', async () => {
    const { page, context } = await setup('host')
    try {
      await walk(page, 10, 'ArrowRight')
      expect((await capture(page)).steps).toEqual([])
      await walk(page, 10, 'ArrowLeft')
      await walk(page, 18)
      const moving = await capture(page)
      expect(moving.steps.some(({ surface }) => surface === 'tatami')).toBe(true)
      expect(moving.steps.some(({ surface }) => surface === 'wood')).toBe(true)
      expect(moving.sources).toBeGreaterThan(0)
      expect(moving.sources).toBeLessThanOrEqual(moving.steps.length)
      for (let index = 1; index < moving.steps.length; index++) {
        expect(moving.steps[index].now - moving.steps[index - 1].now).toBeGreaterThanOrEqual(300)
      }
      await walk(page, 50, 'KeyA')
      const wall = await capture(page)
      await walk(page, 20, 'KeyA')
      expect((await capture(page)).steps).toEqual(wall.steps)
      await walk(page, 20, 'ArrowUp')
      expect((await capture(page)).steps).toEqual(wall.steps)
      await page.evaluate(() => {
        for (let index = 0; index < 10; index++) window.footstepsTest.advance()
      })
      expect((await capture(page)).steps).toEqual(wall.steps)
    } finally {
      await context.close()
    }
  })

  it('host consumes mute/zero volume and rebaselines pause/resume, role swap and disconnect', async () => {
    const { page, context } = await setup('host')
    try {
      await walk(page, 3)
      expect((await capture(page)).steps).toHaveLength(1)
      await page.evaluate(() => document.getElementById('play-mute')!.click())
      await walk(page, 4)
      expect((await capture(page)).sources).toBe(1)
      await page.evaluate(() => document.getElementById('play-mute')!.click())
      await walk(page, 1)
      expect((await capture(page)).steps).toHaveLength(1)
      await walk(page, 3)
      expect((await capture(page)).steps.length).toBeGreaterThan(1)
      await page.evaluate(() => {
        const volume = document.getElementById('volume') as HTMLInputElement
        volume.value = '0'
        volume.dispatchEvent(new Event('input'))
      })
      const muted = await capture(page)
      await walk(page, 4)
      expect((await capture(page)).sources).toBe(muted.sources)
      await page.evaluate(() => {
        const volume = document.getElementById('volume') as HTMLInputElement
        volume.value = '0.2'
        volume.dispatchEvent(new Event('input'))
        window.footstepsTest.advance(600)
      })
      const paused = await capture(page)
      await walk(page, 5)
      expect((await capture(page)).steps).toEqual(paused.steps)
      await page.evaluate(() => document.getElementById('ready')!.click())
      await walk(page, 1)
      expect((await capture(page)).steps).toEqual(paused.steps)
      await walk(page, 4)
      expect((await capture(page)).steps.length).toBeGreaterThan(paused.steps.length)
      await page.evaluate(() => {
        window.footstepsTest.match.tick(900000)
        window.footstepsTest.advance()
      })
      const beforeSwap = await capture(page)
      await page.evaluate(() => document.getElementById('ready')!.click())
      await walk(page, 10)
      expect((await capture(page)).steps).toEqual(beforeSwap.steps)
      await page.evaluate(() => window.footstepsTest.peer.disconnect())
      await walk(page, 5)
      expect((await capture(page)).steps).toEqual(beforeSwap.steps)
    } finally {
      await context.close()
    }
  })
})
