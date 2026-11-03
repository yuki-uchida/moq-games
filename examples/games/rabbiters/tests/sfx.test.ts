import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JuiceEvent } from '../src/juice-events'
import { RabbitersSfx, type UiSound } from '../src/sfx'

const parameter = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn()
})
class Context {
  state = 'running'
  currentTime = 0
  sampleRate = 8000
  destination = {}
  nodes = 0
  resume = vi.fn(() => Promise.resolve())
  close = vi.fn(() => Promise.resolve())
  createGain() {
    return { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() }
  }
  createDynamicsCompressor() {
    return { connect: vi.fn(), disconnect: vi.fn() }
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length)
    return { duration: length / 8000, getChannelData: () => data }
  }
  createBufferSource() {
    this.nodes++
    return { buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null }
  }
  createBiquadFilter() {
    return { type: 'lowpass', Q: { value: 0 }, frequency: parameter(), connect: vi.fn(), disconnect: vi.fn() }
  }
  createOscillator() {
    this.nodes++
    return {
      type: 'sine',
      frequency: parameter(),
      detune: parameter(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const setup = () => {
  const context = new Context()
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return context
    })
  )
  const sfx = new RabbitersSfx()
  sfx.start()
  return { sfx, context }
}

const at = { x: 0, y: 0, z: 0 }
const everyEvent: JuiceEvent[] = [
  { type: 'step', at, sprint: false, crouch: false },
  { type: 'step', at, sprint: true, crouch: false },
  { type: 'step', at, sprint: false, crouch: true },
  { type: 'jump', at },
  { type: 'land', at, impact: 0.6 },
  { type: 'hide', at },
  { type: 'unhide', at },
  { type: 'eat', at, kind: 'carrot', streak: 12 },
  { type: 'pickup', at },
  { type: 'drop', at },
  { type: 'taskTick', at, progress: 0.4 },
  { type: 'taskDone', at },
  { type: 'hurt', at, amount: 1 },
  { type: 'downed', at },
  { type: 'revived', at },
  { type: 'grown', at },
  { type: 'pregnant', at },
  { type: 'suspicious', at },
  { type: 'spotted', at, you: true },
  { type: 'spotted', at, you: false },
  { type: 'escaped', at },
  { type: 'talk' },
  { type: 'nestBroken', at },
  { type: 'bedding' },
  { type: 'kitSafe' },
  { type: 'kitLost' },
  { type: 'objective' },
  { type: 'chapter' },
  { type: 'won' },
  { type: 'lost' }
]
const kinds: UiSound[] = ['tap', 'hover', 'toggle', 'open', 'close', 'start']

describe('Rabbiters sfx', () => {
  it('plays every juice event and ui sound without throwing', () => {
    const { sfx, context } = setup()
    for (const event of everyEvent) {
      context.currentTime += 1
      expect(() => sfx.play(event)).not.toThrow()
    }
    for (const kind of kinds) {
      context.currentTime += 1
      expect(() => sfx.ui(kind)).not.toThrow()
    }
    expect(context.nodes).toBeGreaterThan(60)
    sfx.stop()
    sfx.stop()
  })

  it('stays silent for events that audio.ts already voices, and for soft landings', () => {
    const { sfx, context } = setup()
    for (const event of [{ type: 'suspicious', at }, { type: 'kitLost' }, { type: 'lost' }] as JuiceEvent[])
      sfx.play(event)
    sfx.play({ type: 'spotted', at, you: false })
    sfx.play({ type: 'spotted', at, you: true })
    sfx.play({ type: 'spotted', at, you: true })
    sfx.play({ type: 'land', at, impact: 0.05 })
    expect(context.nodes).toBe(0)
  })

  it('plays nothing while muted or suspended, and resumes after unmuting', () => {
    const { sfx, context } = setup()
    sfx.setMuted(true)
    sfx.play({ type: 'jump', at })
    sfx.ui('tap')
    expect(context.nodes).toBe(0)
    sfx.setMuted(false)
    context.state = 'suspended'
    sfx.play({ type: 'jump', at })
    expect(context.nodes).toBe(0)
    context.state = 'running'
    sfx.play({ type: 'jump', at })
    expect(context.nodes).toBeGreaterThan(0)
  })

  it('rate limits footsteps, hovers, task ticks and hurts', () => {
    const { sfx, context } = setup()
    const count = (play: () => void) => {
      const before = context.nodes
      play()
      return context.nodes - before
    }
    const step = () => sfx.play({ type: 'step', at, sprint: false, crouch: false })
    expect(count(step)).toBeGreaterThan(0)
    context.currentTime += 0.05
    expect(count(step)).toBe(0)
    context.currentTime += 0.05
    expect(count(step)).toBeGreaterThan(0)
    expect(count(() => sfx.ui('hover'))).toBeGreaterThan(0)
    context.currentTime += 0.03
    expect(count(() => sfx.ui('hover'))).toBe(0)
    context.currentTime += 0.04
    expect(count(() => sfx.ui('hover'))).toBeGreaterThan(0)
    const tick = () => sfx.play({ type: 'taskTick', at, progress: 0.5 })
    context.currentTime += 1
    expect(count(tick)).toBeGreaterThan(0)
    context.currentTime += 0.03
    expect(count(tick)).toBe(0)
    const hurt = () => sfx.play({ type: 'hurt', at, amount: 1 })
    context.currentTime += 1
    expect(count(hurt)).toBeGreaterThan(0)
    context.currentTime += 0.2
    expect(count(hurt)).toBe(0)
    context.currentTime += 0.2
    expect(count(hurt)).toBeGreaterThan(0)
  })

  it('caps the number of simultaneous voices', () => {
    const { sfx, context } = setup()
    for (let i = 0; i < 20; i++) sfx.play({ type: 'revived', at })
    expect(context.nodes).toBeLessThanOrEqual(24)
  })

  it('pulses a heartbeat only while chased', () => {
    vi.useFakeTimers()
    const { sfx, context } = setup()
    sfx.setChase(true)
    sfx.setChase(true)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1200)
    expect(context.nodes).toBeGreaterThanOrEqual(4)
    sfx.setChase(false)
    expect(vi.getTimerCount()).toBe(0)
    const before = context.nodes
    vi.advanceTimersByTime(2000)
    expect(context.nodes).toBe(before)
    sfx.stop()
  })

  it('does not restart a previous chase after stop/start, and stays silent while muted', () => {
    vi.useFakeTimers()
    const { sfx, context } = setup()
    sfx.setChase(true)
    sfx.setMuted(true)
    vi.advanceTimersByTime(1200)
    expect(context.nodes).toBe(0)
    sfx.stop()
    sfx.start()
    sfx.setMuted(false)
    expect(vi.getTimerCount()).toBe(0)
    sfx.setChase(true)
    vi.advanceTimersByTime(600)
    expect(context.nodes).toBe(2)
    sfx.stop()
  })

  it('no-ops without AudioContext and survives a throwing one', () => {
    vi.stubGlobal('AudioContext', undefined)
    const sfx = new RabbitersSfx()
    expect(() => {
      sfx.start()
      sfx.setMuted(true)
      sfx.setChase(true)
      sfx.setChase(false)
      for (const event of everyEvent) sfx.play(event)
      for (const kind of kinds) sfx.ui(kind)
      sfx.stop()
    }).not.toThrow()
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        throw new Error('denied')
      })
    )
    const broken = new RabbitersSfx()
    expect(() => {
      broken.start()
      broken.play({ type: 'jump', at })
    }).not.toThrow()
  })
})
