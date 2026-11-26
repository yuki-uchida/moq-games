import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JuiceEvent } from '../src/juice-events'
import { RabbitersSfx, type UiSound } from '../src/sfx'
import { CUES, soundBank, type CueId } from '../src/sound-bank'

const parameter = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn()
})
class Context {
  state = 'running'
  currentTime = 0
  sampleRate = 8000
  destination = {}
  nodes = 0
  gains: ReturnType<Context['createGain']>[] = []
  sources: ReturnType<Context['createBufferSource']>[] = []
  resume = vi.fn(() => Promise.resolve())
  close = vi.fn(() => Promise.resolve())
  decodeAudioData = vi.fn(() => new Promise<never>(() => {}))
  constructor() {
    const bank = soundBank(this as unknown as BaseAudioContext)
    for (const cue of Object.keys(CUES) as CueId[]) bank.put(cue, { duration: 0.3, cue } as unknown as AudioBuffer)
  }
  createGain() {
    const gain = { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() }
    this.gains.push(gain)
    return gain
  }
  createDynamicsCompressor() {
    return { connect: vi.fn(), disconnect: vi.fn() }
  }
  createBufferSource() {
    this.nodes++
    const source = {
      buffer: null as { cue: CueId } | null,
      playbackRate: parameter(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null
    }
    this.sources.push(source)
    return source
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
    expect(context.nodes).toBeGreaterThan(25)
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

  it.each(['rate limit', 'voice limit'] as const)(
    'clears the old %s when replacing a closed audio context',
    (limit) => {
      const { sfx, context } = setup()
      context.currentTime = 60
      if (limit === 'rate limit') sfx.play({ type: 'step', at, sprint: false, crouch: false })
      else for (let index = 0; index < 30; index++) sfx.play({ type: 'revived', at })
      expect(context.nodes).toBeGreaterThan(0)
      if (limit === 'voice limit') expect(context.nodes).toBe(24)

      context.state = 'closed'
      const replacement = new Context()
      vi.stubGlobal(
        'AudioContext',
        vi.fn(function () {
          return replacement
        })
      )
      sfx.start()
      if (limit === 'rate limit') sfx.play({ type: 'step', at, sprint: false, crouch: false })
      else sfx.play({ type: 'jump', at })
      expect(replacement.nodes).toBeGreaterThan(0)
      sfx.stop()
    }
  )

  it('restores one heartbeat timer after replacing a closed audio context', () => {
    vi.useFakeTimers()
    const { sfx, context } = setup()
    sfx.setChase(true)
    vi.advanceTimersByTime(545)
    expect(context.sources).toHaveLength(1)
    context.state = 'closed'
    const replacement = new Context()
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return replacement
      })
    )
    sfx.start()
    expect(vi.getTimerCount()).toBe(1)
    expect(context.sources.every((voice) => voice.disconnect.mock.calls.length === 1)).toBe(true)
    vi.advanceTimersByTime(545)
    expect(replacement.sources).toHaveLength(1)
    sfx.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('caps the number of simultaneous voices', () => {
    const { sfx, context } = setup()
    for (let i = 0; i < 30; i++) sfx.play({ type: 'revived', at })
    expect(context.nodes).toBe(24)
  })

  it('pulses a heartbeat only while chased', () => {
    vi.useFakeTimers()
    const { sfx, context } = setup()
    sfx.setChase(true)
    sfx.setChase(true)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1200)
    expect(context.nodes).toBeGreaterThanOrEqual(2)
    sfx.setChase(false)
    expect(vi.getTimerCount()).toBe(0)
    const before = context.nodes
    vi.advanceTimersByTime(2000)
    expect(context.nodes).toBe(before)
    sfx.stop()
  })

  it('aligns the chase vignette peaks with the two thumps of the heartbeat recording', () => {
    vi.useFakeTimers()
    const { sfx, context } = setup()
    const css = readFileSync(new URL('../src/fx.css', import.meta.url), 'utf8')
    const duration = Number(css.match(/animation:\s*fx-heartbeat\s+([\d.]+)s/)?.[1])
    const keyframes = css.match(/@keyframes fx-heartbeat\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    const peaks = [...keyframes.matchAll(/([\d.]+)%\s*\{\s*opacity:\s*(?:1|0\.95);/g)].map(
      (match) => (Number(match[1]) / 100) * duration
    )
    sfx.setChase(true)
    vi.advanceTimersByTime(duration * 1000)
    const beat = context.sources.at(-1)!
    expect(beat.buffer?.cue).toBe('heartbeat')
    expect(beat.start).toHaveBeenCalledWith(0)
    const wav = readFileSync(new URL('../src/sounds/heartbeat.wav', import.meta.url))
    const data = wav.indexOf('data') + 8
    const rate = wav.readUInt32LE(24)
    const thumps = [0, 0.1].map((from, index) => {
      let loudest = [0, 0]
      const end = index === 0 ? 0.1 : Infinity
      for (let offset = data + Math.round(from * rate) * 2; offset + 1 < wav.length; offset += 2) {
        const time = (offset - data) / 2 / rate
        if (time >= end) break
        const level = Math.abs(wav.readInt16LE(offset))
        if (level > loudest[0]) loudest = [level, time]
      }
      return loudest[1]
    })
    expect(peaks).toHaveLength(2)
    for (let index = 0; index < peaks.length; index++)
      expect(Math.abs(peaks[index] - thumps[index])).toBeLessThan(0.015)
    sfx.stop()
  })

  it.each(['unmute', 'late audio start'] as const)(
    'resumes the heartbeat on the existing chase rhythm after %s',
    (scenario) => {
      vi.useFakeTimers()
      const { sfx, context } = setup()
      if (scenario === 'late audio start') sfx.stop()
      sfx.setChase(true)
      if (scenario === 'unmute') sfx.setMuted(true)
      vi.advanceTimersByTime(300)
      sfx.setChase(true)
      if (scenario === 'unmute') sfx.setMuted(false)
      else sfx.start()
      vi.advanceTimersByTime(244)
      expect(context.sources).toHaveLength(0)
      vi.advanceTimersByTime(1)
      expect(context.sources).toHaveLength(1)
      vi.advanceTimersByTime(545)
      expect(context.sources).toHaveLength(2)
      sfx.stop()
    }
  )

  it.each(['suspended', 'interrupted'] as const)('keeps the chase rhythm through an %s audio context', (state) => {
    vi.useFakeTimers()
    const { sfx, context } = setup()
    sfx.setChase(true)
    context.state = state
    vi.advanceTimersByTime(745)
    expect(context.sources).toHaveLength(0)
    context.state = 'running'
    sfx.start()
    vi.advanceTimersByTime(344)
    expect(context.sources).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(context.sources).toHaveLength(1)
    sfx.stop()
  })

  it.each([
    [49, 1],
    [50, 0]
  ])('plays a heartbeat delayed by %sms only within the timing tolerance', (delay, voices) => {
    vi.useFakeTimers()
    const now = vi.spyOn(performance, 'now').mockReturnValue(0)
    const { sfx, context } = setup()
    sfx.setChase(true)
    now.mockReturnValue(545 + delay)
    vi.advanceTimersByTime(545)
    expect(context.sources).toHaveLength(voices)
    sfx.stop()
    now.mockRestore()
  })

  it('skips a stale heartbeat after a delayed timer instead of playing two close together', () => {
    vi.useFakeTimers()
    const now = vi.spyOn(performance, 'now').mockReturnValue(0)
    const { sfx, context } = setup()
    sfx.setChase(true)
    now.mockReturnValue(1080)
    vi.advanceTimersByTime(545)
    expect(context.sources).toHaveLength(0)
    now.mockReturnValue(1090)
    vi.advanceTimersByTime(10)
    expect(context.sources).toHaveLength(1)
    sfx.stop()
    now.mockRestore()
  })

  it('re-arms the next chase beat when audio resumes after timer throttling', () => {
    vi.useFakeTimers()
    const now = vi.spyOn(performance, 'now').mockReturnValue(0)
    const { sfx, context } = setup()
    sfx.setChase(true)
    now.mockReturnValue(1000)
    sfx.start()
    now.mockReturnValue(1090)
    vi.advanceTimersByTime(90)
    expect(context.sources).toHaveLength(1)
    sfx.stop()
    now.mockRestore()
  })

  it.each([
    ['escape', 'running'],
    ['escape', 'suspended'],
    ['mute', 'running'],
    ['mute', 'suspended'],
    ['stop', 'running'],
    ['stop', 'suspended']
  ] as const)('cancels scheduled heartbeats on %s while %s', (action, state) => {
    vi.useFakeTimers()
    const { sfx, context } = setup()
    sfx.play({ type: 'jump', at })
    const jump = context.sources[0]
    sfx.setChase(true)
    vi.advanceTimersByTime(545)
    const heartbeat = context.sources.slice(1)
    expect(heartbeat).toHaveLength(1)
    expect(heartbeat[0].buffer?.cue).toBe('heartbeat')
    context.state = state
    if (action === 'escape') sfx.setChase(false)
    else if (action === 'mute') sfx.setMuted(true)
    else sfx.stop()
    for (const voice of heartbeat) {
      expect(voice.stop).toHaveBeenCalledTimes(1)
      expect(voice.stop).toHaveBeenLastCalledWith()
      expect(voice.disconnect).toHaveBeenCalledTimes(1)
    }
    expect(jump.stop).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    context.state = 'running'
    if (action === 'escape') sfx.setChase(true)
    else if (action === 'mute') sfx.setMuted(false)
    else {
      sfx.start()
      sfx.setChase(true)
    }
    vi.advanceTimersByTime(545)
    expect(context.sources).toHaveLength(3)
    sfx.stop()
  })

  it('forgets completed heartbeat voices before chase ends', () => {
    vi.useFakeTimers()
    const { sfx, context } = setup()
    sfx.setChase(true)
    vi.advanceTimersByTime(545)
    const heartbeat = context.sources[0]
    ;(heartbeat.onended as unknown as () => void)()
    sfx.setChase(false)
    expect(heartbeat.stop).not.toHaveBeenCalled()
    expect(heartbeat.disconnect).toHaveBeenCalledTimes(1)
    sfx.stop()
  })

  it('cleans up the other heartbeat if stopping one voice fails', () => {
    vi.useFakeTimers()
    const { sfx, context } = setup()
    sfx.setChase(true)
    vi.advanceTimersByTime(1090)
    const [first, second] = context.sources
    first.stop.mockImplementationOnce(() => {
      throw new Error('stop failed')
    })
    second.disconnect.mockImplementationOnce(() => {
      throw new Error('disconnect failed')
    })
    expect(() => sfx.setChase(false)).not.toThrow()
    expect(first.disconnect).toHaveBeenCalledTimes(1)
    expect(second.stop).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    sfx.stop()
  })

  it('does not restart muted heartbeat after the chase has ended', () => {
    vi.useFakeTimers()
    const { sfx, context } = setup()
    sfx.setChase(true)
    vi.advanceTimersByTime(545)
    sfx.setMuted(true)
    sfx.setChase(false)
    sfx.setMuted(false)
    vi.advanceTimersByTime(1200)
    expect(context.sources).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
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
    expect(context.nodes).toBe(1)
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
