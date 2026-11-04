import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { prewarmAppearanceFrame, sheet } from '../src/art/index'
import { STAGES, timeAtAge } from '../src/data'
import { Game } from '../src/game'
import { Renderer } from '../src/render'
import { toView, type View, type ViewPlayer } from '../src/view'

vi.mock('../src/art/index', async (original) => ({
  ...(await original<typeof import('../src/art/index')>()),
  prewarmAppearanceFrame: vi.fn(() => true),
  sheet: vi.fn(() => ({ idle: { frames: [{}], fps: 1, loop: true } }))
}))

type Harness = {
  prewarmAppearances(view: View): void
  player(player: ViewPlayer, pos: { x: number; y: number }, local: boolean, time: number, phase: View['phase']): void
}
let callbacks: IdleRequestCallback[]
let request: ReturnType<typeof vi.fn>
let renderer: Harness
let view: View
const boundary = timeAtAge(12)
const flush = (remaining = 50, didTimeout = false) => {
  const callback = callbacks.shift()!
  callback({ didTimeout, timeRemaining: () => remaining })
}

beforeEach(() => {
  vi.clearAllMocks()
  callbacks = []
  request = vi.fn((callback: IdleRequestCallback) => (callbacks.push(callback), callbacks.length))
  vi.stubGlobal('requestIdleCallback', request)
  const game = new Game(1)
  game.addPlayer('first', 'p_free')
  view = toView(game.state)
  view.time = boundary - 4
  renderer = Object.assign(Object.create(Renderer.prototype), {
    warmedAppearances: new Set(),
    appearancePending: false,
    motion: new Map(),
    deaths: new Map(),
    clock: 0,
    ctx: new Proxy({}, { get: () => vi.fn() }),
    world: vi.fn(),
    shadow: vi.fn(),
    art: vi.fn(),
    label: vi.fn(),
    blit: vi.fn(),
    prewarm: vi.fn()
  }) as Harness
})

afterEach(() => vi.unstubAllGlobals())

test('only reserves the next stage in the final five seconds, without a timeout', () => {
  view.time = boundary - 5.01
  renderer.prewarmAppearances(view)
  expect(request).not.toHaveBeenCalled()
  view.time = boundary - 5
  renderer.prewarmAppearances(view)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]).toHaveLength(1)
  expect(sheet).not.toHaveBeenCalled()
  flush()
  expect(prewarmAppearanceFrame).toHaveBeenCalledExactlyOnceWith('player:junior')
  renderer.prewarmAppearances(view)
  expect(callbacks).toHaveLength(0)
})

test('seven participants and six outfits deduplicate to one sheet per callback', () => {
  const weapons = ['w_sports', 'w_study', 'w_invest', 'w_hobby', 'w_friend', 'w_love', 'w_sports']
  view.players = weapons.map((weapon, index) => ({
    ...view.players[0],
    id: String(index),
    weapons: [[weapon, 4, 0]]
  }))
  for (let index = 0; index < 6; index++) {
    renderer.prewarmAppearances(view)
    renderer.prewarmAppearances(view)
    expect(callbacks).toHaveLength(1)
    flush()
    expect(prewarmAppearanceFrame).toHaveBeenCalledTimes(index + 1)
    expect(callbacks).toHaveLength(0)
  }
  renderer.prewarmAppearances(view)
  expect(callbacks).toHaveLength(0)
  expect(new Set(vi.mocked(prewarmAppearanceFrame).mock.calls.map(([key]) => key)).size).toBe(6)
})

test('rechecks current equipment, exits, downed players and late joins', () => {
  renderer.prewarmAppearances(view)
  view.players[0].weapons = [['w_sports', 4, 0]]
  flush()
  expect(prewarmAppearanceFrame).toHaveBeenLastCalledWith('player:junior:soccer')
  view.players[0].weapons = [['w_love', 4, 0]]
  renderer.prewarmAppearances(view)
  const player = view.players.pop()!
  flush()
  expect(prewarmAppearanceFrame).toHaveBeenCalledTimes(1)
  view.players.push({ ...player, downed: true })
  renderer.prewarmAppearances(view)
  expect(callbacks).toHaveLength(0)
  view.players[0].downed = false
  renderer.prewarmAppearances(view)
  flush()
  expect(prewarmAppearanceFrame).toHaveBeenLastCalledWith('player:junior:romantic')
})

test.each(['lost', 'reaper', 'won'] as const)('drops reservations on phase %s', (phase) => {
  renderer.prewarmAppearances(view)
  view = { ...view, phase }
  renderer.prewarmAppearances(view)
  flush()
  expect(sheet).not.toHaveBeenCalled()
  expect(prewarmAppearanceFrame).not.toHaveBeenCalled()
})

test.each([boundary - 20, boundary + 1, timeAtAge(50) + 1])('drops old work after jumping to %s', (time) => {
  renderer.prewarmAppearances(view)
  view = { ...view, time }
  renderer.prewarmAppearances(view)
  flush()
  expect(sheet).not.toHaveBeenCalled()
  expect(prewarmAppearanceFrame).not.toHaveBeenCalled()
})

test('does not mutate snapshots or advance their clock', () => {
  const before = JSON.stringify(view)
  renderer.prewarmAppearances(view)
  flush()
  expect(JSON.stringify(view)).toBe(before)
})

test('insufficient budget, timeout and stale callbacks do no work', () => {
  renderer.prewarmAppearances(view)
  flush(0.5)
  renderer.prewarmAppearances(view)
  flush(50, true)
  renderer.prewarmAppearances(view)
  vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 251)
  flush()
  vi.restoreAllMocks()
  expect(sheet).not.toHaveBeenCalled()
  expect(prewarmAppearanceFrame).not.toHaveBeenCalled()
})

test('short real idle budgets advance only one frame until complete', () => {
  vi.mocked(prewarmAppearanceFrame).mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValueOnce(true)
  for (const budget of [7.2, 2, 1]) {
    renderer.prewarmAppearances(view)
    flush(budget)
  }
  expect(prewarmAppearanceFrame).toHaveBeenCalledTimes(3)
  expect(sheet).not.toHaveBeenCalled()
  renderer.prewarmAppearances(view)
  expect(callbacks).toHaveLength(0)
})

test.each(['unsupported', 'unexecuted', 'jump'] as const)('visible fallback survives %s idle work', (mode) => {
  if (mode === 'unsupported') vi.stubGlobal('requestIdleCallback', undefined)
  renderer.prewarmAppearances(view)
  for (let index = 0; index < 20; index++) renderer.prewarmAppearances(view)
  expect(callbacks.length).toBeLessThanOrEqual(1)
  view.time = mode === 'jump' ? timeAtAge(35) + 1 : boundary + 1
  renderer.prewarmAppearances(view)
  if (mode === 'jump') flush()
  expect(sheet).not.toHaveBeenCalled()
  renderer.player(view.players[0], { x: 0, y: 0 }, true, view.time, view.phase)
  expect(sheet).toHaveBeenCalledExactlyOnceWith(mode === 'jump' ? 'player:prime' : 'player:junior')
})

test('last life stage never reserves another body', () => {
  view.time = timeAtAge(STAGES.at(-1)!.age) + 1
  renderer.prewarmAppearances(view)
  expect(request).not.toHaveBeenCalled()
})
