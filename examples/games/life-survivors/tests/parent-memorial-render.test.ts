import { afterEach, expect, test, vi } from 'vitest'
import { Game, VIEW_HALF } from '../src/game'
import { Renderer } from '../src/render'
import { toView, type View } from '../src/view'

vi.mock('../src/art/atlas', () => ({
  canvasOf: vi.fn((frame: unknown) => ({ frame }))
}))

interface Image {
  width: number
  height: number
  text?: string
}

interface Draw {
  image: Image
  x: number
  y: number
  width: number
  height: number
  alpha: number
}

interface Internals {
  camera: { x: number; y: number }
  parentMemorials: Map<string, { age: number }>
  drawParentMemorials: (view: View, dt: number, smooth: boolean) => void
}

function harness(dpr = 1, x = 0, y = 0) {
  vi.stubGlobal('window', { devicePixelRatio: dpr })
  const draws: Draw[] = []
  const ink: { text: string; kind: string; color: string; width: number; font: string }[] = []
  let transform = [1, 0, 0, 1, 0, 0]
  const ctx = {
    globalAlpha: 1,
    setTransform: (...matrix: number[]) => (transform = matrix),
    drawImage: (image: Image, left: number, top: number, width: number, height: number) => {
      draws.push({
        image,
        x: transform[0] * (left + width / 2) + transform[4],
        y: transform[3] * (top + height / 2) + transform[5],
        width: width * transform[0],
        height: height * transform[3],
        alpha: ctx.globalAlpha
      })
    },
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn()
  }
  vi.stubGlobal('document', {
    createElement: () => {
      const image: Image = { width: 0, height: 0 }
      const offscreen = {
        font: '',
        lineWidth: 0,
        strokeStyle: '',
        fillStyle: '',
        scale: vi.fn(),
        strokeText: (text: string) => {
          ink.push({
            text,
            kind: 'stroke',
            color: offscreen.strokeStyle,
            width: offscreen.lineWidth,
            font: offscreen.font
          })
        },
        fillText: (text: string) => {
          image.text = text
          ink.push({ text, kind: 'fill', color: offscreen.fillStyle, width: offscreen.lineWidth, font: offscreen.font })
        }
      }
      return Object.assign(image, { getContext: () => offscreen })
    }
  })
  const renderer = new Renderer({
    clientWidth: 800,
    clientHeight: 600,
    getContext: () => ctx
  } as unknown as HTMLCanvasElement)
  const internals = renderer as unknown as Internals
  internals.camera = { x, y }
  const game = new Game(1)
  const player = game.addPlayer('a', 'p_monster')!
  player.parentDeath = { at: 100, x, y, reward: 'choice' }
  const view = toView(game.state)
  view.time = 102
  const render = (dt = 1 / 60, smooth = false) => {
    draws.length = 0
    internals.drawParentMemorials(view, dt, smooth)
    return draws.filter((draw) => draw.image.text)
  }
  return { renderer, internals, view, render, draws, ink }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test.each([1, 1.5, 2])('farewell labels retain world-relative position and scale at DPR %s', (dpr) => {
  const scale = Math.max(800 / (VIEW_HALF.x * 2), 600 / (VIEW_HALF.y * 2))
  for (const [x, y] of [
    [0, 0],
    [1500, -800]
  ]) {
    const { render, ink, draws } = harness(dpr, x, y)
    const labels = render()
    expect(labels).toHaveLength(2)
    expect(labels[0].image.text).toContain('とのお別れ')
    expect(labels[1].image.text).toBe('成長の選択 +1')
    labels.forEach((label, line) => {
      expect(label.x / dpr).toBeCloseTo(400 + 30 * scale)
      expect(label.y / dpr).toBeCloseTo(300 + (-126 + line * 22) * scale)
      expect(label.width / dpr).toBeCloseTo((Math.ceil(13 * (label.image.text!.length + 1.2) * 2) / 2) * scale)
      expect(label.height / dpr).toBeCloseTo((Math.ceil(13 * 1.6 * 2) / 2) * scale)
      expect(label.alpha).toBeCloseTo(line ? 0.5 : 1)
      expect(ink.filter((entry) => entry.text === label.image.text).map((entry) => entry.kind)).toEqual([
        'stroke',
        'fill'
      ])
    })
    expect(ink[0].width).toBeGreaterThanOrEqual(3)
    expect(ink[0].color).toBe('rgba(15,12,20,.85)')
    expect(ink[1].color).toBe('#f1f4fc')
    expect(ink[0].font).toContain('700 13px')
    expect(draws.slice(-2)).toEqual(labels)
  }
})

test.each([1, 2])('memorial icons stay clear of both labels throughout the animation at DPR %s', (dpr) => {
  const { render, view, draws } = harness(dpr, 1500, -800)
  view.players[0].parentDeath!.reward = 'passive'
  for (const age of [0, 1, 1.5, 2, 3, 4.5, 5.9]) {
    view.time = 100 + age
    const labels = render()
    const parent = draws[1]
    const soul = draws[2]
    const legacy = draws[3]
    const bottom = Math.max(...labels.map((label) => label.y + label.height / 2))
    expect(parent.y - parent.height / 2).toBeGreaterThanOrEqual(bottom)
    expect(soul.y - soul.height / 2).toBeGreaterThanOrEqual(bottom)
    expect(legacy.y - legacy.height / 2).toBeGreaterThanOrEqual(bottom)
    expect(labels[0].y + labels[0].height / 2).toBeLessThanOrEqual(labels[1].y - labels[1].height / 2)
    expect(Math.abs(parent.x - legacy.x)).toBeGreaterThanOrEqual((parent.width + legacy.width) / 2)
    expect(Math.abs(parent.x - soul.x)).toBeGreaterThanOrEqual((parent.width + soul.width) / 2)
    expect(Math.abs(legacy.x - soul.x)).toBeGreaterThanOrEqual((legacy.width + soul.width) / 2)
  }
})

test.each(['none', 'choice', 'passive'] as const)('reward %s keeps its text and ending fade', (reward) => {
  const { render, view } = harness()
  view.players[0].parentDeath!.reward = reward
  view.time = 105.25
  const labels = render()
  expect(labels.map((label) => label.alpha)).toEqual([0.5, 0.5])
  expect(labels[1].image.text).toBe(
    reward === 'none' ? '親の武器を手放した' : reward === 'choice' ? '成長の選択 +1' : '「忍耐力」を継承！'
  )
})

test('guest snapshots start at synchronized age, animate between packets, and never replay finished events', () => {
  const { render, view, draws, internals } = harness()
  render(0.05, true)
  expect(internals.parentMemorials.get('a')!.age).toBe(2)
  const initialY = draws[1].y
  view.players = structuredClone(view.players)
  render(0.09, true)
  expect(internals.parentMemorials.get('a')!.age).toBeCloseTo(2.09)
  expect(draws[1].y).toBeLessThan(initialY)
  view.time += 0.1
  render(0.01, true)
  expect(internals.parentMemorials.get('a')!.age).toBeCloseTo(2.1)
  for (let frame = 0; frame < 80; frame++) render(0.05, true)
  expect(render(0.05, true)).toEqual([])
  expect(draws).toEqual([])
  view.players = structuredClone(view.players)
  expect(render(0.05, true)).toEqual([])
})

test('late arrivals skip past events and solo pause follows simulation time rather than render time', () => {
  const { render, view, draws, internals } = harness()
  view.time = 108
  expect(render(0.1, true)).toEqual([])
  view.time = 102
  const first = render(0.1, false).map((label) => ({ ...label }))
  const iconY = draws[1].y
  expect(render(3, false)).toEqual(first)
  expect(draws[1].y).toBe(iconY)
  expect(internals.parentMemorials.get('a')!.age).toBe(2)
  view.time = 102.25
  render(0.1, false)
  expect(internals.parentMemorials.get('a')!.age).toBe(2.25)
})

test('departures, missing events, replaced state and restarts discard only stale memorial clocks', () => {
  const { render, view, internals } = harness()
  view.players.push({ ...structuredClone(view.players[0]), id: 'b' })
  render(0.1, true)
  const removed = view.players.shift()!
  render(0.1, true)
  expect(internals.parentMemorials.has('a')).toBe(false)
  expect(internals.parentMemorials.get('b')!.age).toBeCloseTo(2.1)
  view.players.push(removed)
  render(0.1, true)
  expect(internals.parentMemorials.get('a')!.age).toBe(2)
  delete removed.parentDeath
  render(0.1, true)
  expect(internals.parentMemorials.has('a')).toBe(false)
  view.players = structuredClone(view.players)
  view.players[0].parentDeath = { at: 101, x: 1500, y: -800, reward: 'none' }
  render(0.1, true)
  expect(internals.parentMemorials.get('b')!.age).toBe(1)
  view.time = 0
  view.players = []
  render(0.1, true)
  expect(internals.parentMemorials.size).toBe(0)
})

test('guest collapse frames and final fade advance on render frames, not snapshot ticks', () => {
  const { render, view, draws } = harness()
  view.time = 100.01
  render(1 / 60, true)
  const firstBody = draws[0].image
  render(0.2, true)
  expect(draws[0].image).not.toEqual(firstBody)
  view.time = 105
  const firstAlpha = render(1 / 60, true)[0].alpha
  const nextAlpha = render(1 / 60, true)[0].alpha
  expect(firstAlpha - nextAlpha).toBeCloseTo(1 / 90)
})

test('future synchronized events stay hidden until simulation time reaches them', () => {
  const { render, view, internals } = harness()
  view.time = 99
  expect(render(0.1, true)).toEqual([])
  expect(render(2, true)).toEqual([])
  expect(internals.parentMemorials.get('a')!.age).toBe(-1)
  view.time = 100
  expect(render(1 / 60, true)).toHaveLength(2)
})

test('draw schedules elder death prewarm before the first parent farewell', () => {
  const { renderer, view } = harness()
  view.time = 0
  view.players = []
  const callbacks: (() => void)[] = []
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => callbacks.push(callback))
  for (const method of ['prewarmAppearances', 'ground', 'particles', 'lifeBars', 'overlays'] as const)
    vi.spyOn(renderer as never, method).mockImplementation(vi.fn() as never)
  const prewarm = vi.spyOn(renderer as never, 'prewarm')
  renderer.draw(view, 'a', 1 / 60, false)
  expect(prewarm).toHaveBeenCalledWith('elder')
  expect(callbacks).toHaveLength(2)
  callbacks.shift()!()
  expect(callbacks).toHaveLength(2)
})
