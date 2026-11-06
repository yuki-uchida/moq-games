import { afterEach, describe, expect, it, vi } from 'vitest'
import { YashikiSound, type FootstepSurface, type HorrorCue } from '../src/sound'

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

function setup(onFailure?: (error: unknown) => void) {
  vi.useFakeTimers()
  const context = new Context()
  return { context, sound: new YashikiSound(context as unknown as AudioContext, onFailure) }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('YashikiSound constructor cleanup', () => {
  const phases = [
    'createGain',
    'gain',
    'connect',
    'listener-before',
    'listener-after',
    'createBuffer',
    'getChannelData'
  ]
  const cases = phases.flatMap((phase) =>
    ['none', 'remove', 'disconnect', 'both'].map((cleanup) => ({ phase, cleanup }))
  )

  it.each(cases)('preserves $phase failure with $cleanup cleanup errors', ({ phase, cleanup }) => {
    vi.useFakeTimers()
    const context = new Context()
    context.sampleRate = 100
    context.samples = new Float32Array(200)
    const error = new Error('initialization ' + phase)
    const removeError = new Error('remove')
    const disconnectError = new Error('disconnect')
    const handler = vi.fn()
    const attempts: string[] = []
    const fail = () => {
      throw error
    }
    const createGain = context.createGain.bind(context)
    vi.spyOn(context, 'createGain').mockImplementation(() => {
      if (phase === 'createGain') return fail()
      const output = createGain()
      if (phase === 'gain') output.gain.setValueAtTime.mockImplementationOnce(fail)
      if (phase === 'connect') output.connect.mockImplementationOnce(fail)
      output.disconnect.mockImplementation(() => {
        attempts.push('disconnect')
        if (cleanup === 'disconnect' || cleanup === 'both') throw disconnectError
      })
      return output
    })
    const add = context.addEventListener.bind(context)
    const registration = vi.spyOn(context, 'addEventListener').mockImplementation((type, listener) => {
      if (phase === 'listener-before') fail()
      add(type, listener)
      if (phase === 'listener-after') fail()
    })
    const remove = context.removeEventListener.bind(context)
    const removal = vi.spyOn(context, 'removeEventListener').mockImplementation((type, listener) => {
      attempts.push('remove')
      if (cleanup === 'remove' || cleanup === 'both') throw removeError
      remove(type, listener)
    })
    if (phase === 'createBuffer') vi.spyOn(context, 'createBuffer').mockImplementationOnce(fail)
    if (phase === 'getChannelData')
      vi.spyOn(context, 'createBuffer').mockReturnValueOnce({ duration: 2, getChannelData: fail })
    let received: unknown
    try {
      new YashikiSound(context as unknown as AudioContext, handler)
    } catch (caught) {
      received = caught
    }
    const attemptedRegistration = !['createGain', 'gain', 'connect'].includes(phase)
    const registered = ['listener-after', 'createBuffer', 'getChannelData'].includes(phase)
    expect.soft(received).toBe(error)
    expect.soft(handler).not.toHaveBeenCalled()
    expect.soft(context.sources).toHaveLength(0)
    expect.soft(vi.getTimerCount()).toBe(0)
    expect
      .soft(attempts)
      .toEqual(phase === 'createGain' ? [] : attemptedRegistration ? ['remove', 'disconnect'] : ['disconnect'])
    expect.soft(removal).toHaveBeenCalledTimes(attemptedRegistration ? 1 : 0)
    if (attemptedRegistration) expect.soft(removal).toHaveBeenCalledWith('statechange', registration.mock.calls[0][1])
    expect.soft(context.gains).toHaveLength(phase === 'createGain' ? 0 : 1)
    if (phase !== 'createGain') expect.soft(context.gains[0].disconnect).toHaveBeenCalledOnce()
    expect.soft(context.listeners.size).toBe(registered && (cleanup === 'remove' || cleanup === 'both') ? 1 : 0)
  })

  it('keeps successful initialization connected until ordinary idempotent disposal', () => {
    const handler = vi.fn()
    const { context, sound } = setup(handler)
    const removal = vi.spyOn(context, 'removeEventListener')
    expect(context.gains[0].gain.setValueAtTime).toHaveBeenCalledExactlyOnceWith(0, 0)
    expect(context.gains[0].connect).toHaveBeenCalledExactlyOnceWith(context.destination)
    expect(context.gains[0].disconnect).not.toHaveBeenCalled()
    expect(context.listeners.size).toBe(1)
    expect(context.sources).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    sound.dispose()
    sound.dispose()
    expect(removal).toHaveBeenCalledOnce()
    expect(context.gains[0].disconnect).toHaveBeenCalledOnce()
    expect(removal.mock.invocationCallOrder[0]).toBeLessThan(context.gains[0].disconnect.mock.invocationCallOrder[0])
    expect(context.listeners.size).toBe(0)
    expect(handler).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('YashikiSound ambient timer safety', () => {
  for (const phase of ['voice', 'reschedule']) {
    it.each(['dispose', 'stop', 'restart', 'absent', 'throw'])(
      phase + ' failure preserves the %s handler policy',
      (action) => {
        vi.spyOn(Math, 'random').mockReturnValue(0.4)
        const error = new Error('ambient ' + phase)
        const handlerError = new Error('failure handler')
        const handler = vi.fn((received: unknown) => {
          expect(received).toBe(error)
          if (action === 'throw') throw handlerError
          if (action === 'dispose') sound.dispose()
          else {
            sound.stop()
            if (action === 'restart') sound.start()
          }
        })
        const { sound, context } = setup(action === 'absent' ? undefined : handler)
        const schedule = vi.spyOn(globalThis, 'setTimeout')
        sound.start()
        const callback = schedule.mock.calls[0][0] as () => void
        const fail = () => {
          throw error
        }
        if (phase === 'voice') vi.spyOn(context, 'createOscillator').mockImplementationOnce(fail)
        else schedule.mockImplementationOnce(fail)
        if (action === 'absent') expect(() => vi.runOnlyPendingTimers()).toThrow(error)
        else if (action === 'throw') expect(() => vi.runOnlyPendingTimers()).toThrow(handlerError)
        else expect(() => vi.runOnlyPendingTimers()).not.toThrow()
        expect(handler).toHaveBeenCalledTimes(action === 'absent' ? 0 : 1)
        expect(vi.getTimerCount()).toBe(action === 'restart' ? 1 : 0)
        if (action !== 'absent' && action !== 'throw') {
          const count = context.sources.length
          callback()
          expect(context.sources).toHaveLength(count)
          expect(handler).toHaveBeenCalledOnce()
          expect(vi.getTimerCount()).toBe(action === 'restart' ? 1 : 0)
          expect(context.sources.every((source) => source.onended === null)).toBe(true)
        }
        sound.dispose()
        expect(vi.getTimerCount()).toBe(0)
        expect(context.listeners.size).toBe(0)
        expect(context.gains[0].disconnect).toHaveBeenCalledOnce()
        for (const source of context.sources) expect(source.disconnect).toHaveBeenCalledOnce()
      }
    )
  }

  it.each(['stop', 'dispose', 'restart'])(
    'does not reschedule an old timer after reentrant %s during source.start',
    (action) => {
      vi.spyOn(Math, 'random').mockReturnValue(0.4)
      const failure = vi.fn()
      const { sound, context } = setup(failure)
      const schedule = vi.spyOn(globalThis, 'setTimeout')
      sound.start()
      const callback = schedule.mock.calls[0][0] as () => void
      const source = context.source.bind(context)
      vi.spyOn(context, 'source').mockImplementationOnce(() => {
        const result = source()
        result.start.mockImplementationOnce(() => {
          if (action === 'dispose') sound.dispose()
          else {
            sound.stop()
            if (action === 'restart') sound.start()
          }
        })
        return result
      })
      expect(() => vi.runOnlyPendingTimers()).not.toThrow()
      expect(vi.getTimerCount()).toBe(action === 'restart' ? 1 : 0)
      expect(context.sources).toHaveLength(1)
      expect(context.sources[0].onended).toBeNull()
      callback()
      expect(context.sources).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(action === 'restart' ? 1 : 0)
      expect(failure).not.toHaveBeenCalled()
      if (action === 'restart') {
        vi.runOnlyPendingTimers()
        expect(context.sources).toHaveLength(2)
        expect(vi.getTimerCount()).toBe(1)
      }
      sound.dispose()
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it('keeps constructor exceptions synchronous even with a handler', () => {
    const context = new Context()
    const error = new Error('constructor')
    const handler = vi.fn()
    vi.spyOn(context, 'createGain').mockImplementationOnce(() => {
      throw error
    })
    expect(() => new YashikiSound(context as unknown as AudioContext, handler)).toThrow(error)
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([
    'start',
    'initial-schedule',
    'trigger',
    'footstep',
    'ritualBell',
    'setVolume',
    'setMuted',
    'stop',
    'dispose'
  ])('keeps direct %s exceptions synchronous rather than redirecting to the timer handler', (action) => {
    const handler = vi.fn()
    const { sound, context } = setup(handler)
    if (action !== 'start' && action !== 'initial-schedule') sound.start()
    const error = new Error('direct ' + action)
    const fail = () => {
      throw error
    }
    if (action === 'initial-schedule') vi.spyOn(globalThis, 'setTimeout').mockImplementationOnce(fail)
    else if (action === 'trigger' || action === 'footstep')
      vi.spyOn(context, 'createBufferSource').mockImplementationOnce(fail)
    else if (action === 'ritualBell') vi.spyOn(context, 'createOscillator').mockImplementationOnce(fail)
    else context.gains[0].gain.cancelScheduledValues.mockImplementationOnce(fail)
    expect(() => {
      if (action === 'start' || action === 'initial-schedule') sound.start()
      else if (action === 'trigger') sound.trigger('rattle')
      else if (action === 'footstep') sound.footstep('wood')
      else if (action === 'ritualBell') sound.ritualBell()
      else if (action === 'setVolume') sound.setVolume(0.3)
      else if (action === 'setMuted') sound.setMuted(true)
      else if (action === 'stop') sound.stop()
      else sound.dispose()
    }).toThrow(error)
    expect(handler).not.toHaveBeenCalled()
    sound.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('YashikiSound output failures', () => {
  for (const playback of ['normal', 'preview', 'cue'] as const) {
    for (const action of ['mute', 'zero', 'stop', 'dispose'] as const) {
      const operations =
        action === 'mute' || action === 'zero'
          ? (['cancelScheduledValues', 'setTargetAtTime'] as const)
          : (['cancelScheduledValues', 'setValueAtTime'] as const)
      it.each(operations)(`releases ${playback} on ${action} when output %s throws without replay`, (operation) => {
        const { sound, context } = setup()
        if (playback === 'preview') expect(sound.previewBell()).toBe(true)
        else {
          sound.start()
          sound.footstep('wood')
          sound.ritualBell()
          if (playback === 'cue') sound.trigger('rattle')
        }
        const sources = [...context.sources]
        const ended = sources.map((source) => source.onended)
        const nodes = [...sources, ...context.gains.slice(1), ...context.filters, ...context.panners]
        expect(sources.length).toBeGreaterThan(0)
        const failure = new Error(operation)
        context.gains[0].gain[operation].mockImplementation(() => {
          throw failure
        })
        const apply = () => {
          if (action === 'mute') sound.setMuted(true)
          else if (action === 'zero') sound.setVolume(0)
          else if (action === 'stop') sound.stop()
          else sound.dispose()
        }
        if (playback === 'preview' && (action === 'stop' || action === 'dispose')) expect(apply).not.toThrow()
        else expect(apply).toThrow(failure)
        expect(sound.isPreviewing).toBe(false)
        for (const source of sources) {
          expect(source.stop).toHaveBeenCalledTimes(2)
          expect(source.stop).toHaveBeenLastCalledWith()
          expect(source.onended).toBeNull()
        }
        for (const node of nodes) expect(node.disconnect).toHaveBeenCalledOnce()
        expect(context.listeners.size).toBe(action === 'dispose' ? 0 : 1)
        expect(vi.getTimerCount()).toBe(playback !== 'preview' && (action === 'mute' || action === 'zero') ? 1 : 0)
        context.gains[0].gain[operation].mockReset()
        for (const callback of ended) callback?.()
        context.state = 'suspended'
        for (const listener of context.listeners) listener()
        context.state = 'running'
        for (const listener of context.listeners) listener()
        sound.footstep('wood')
        sound.ritualBell()
        sound.trigger('blackout')
        if (action !== 'stop') expect(sound.previewBell()).toBe(false)
        vi.advanceTimersByTime(60_000)
        expect(context.sources).toEqual(sources)
        if (action === 'mute') sound.setMuted(false)
        if (action === 'zero') sound.setVolume(0.7)
        expect(context.sources).toEqual(sources)
        for (const node of nodes) expect(node.disconnect).toHaveBeenCalledOnce()
        sound.dispose()
        expect(context.listeners.size).toBe(0)
        expect(context.gains[0].disconnect).toHaveBeenCalledOnce()
        expect(vi.getTimerCount()).toBe(0)
      })
    }
  }
})

describe('YashikiSound aged cues', () => {
  const cues = [
    { kind: 'apparition', duration: 2.4, level: 0.14, frequency: 720, pan: 0.4, resonance: 0.7 },
    { kind: 'blackout', duration: 2.8, level: 0.16, frequency: 240, pan: 0.12, resonance: 2.4 },
    { kind: 'rattle', duration: 1.2, level: 0.14, frequency: 1100, pan: 0.4, resonance: 1.4 }
  ] as const

  it.each(cues)('preserves the original $kind scheduling with omitted or zero age', (cue) => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    for (const age of [undefined, 0]) {
      const { sound, context } = setup()
      context.currentTime = 4
      sound.setVolume(1)
      sound.start()
      sound.trigger(cue.kind, age)
      expect(context.sources).toHaveLength(1)
      expect(context.gains).toHaveLength(2)
      expect(context.sources[0].start).toHaveBeenCalledExactlyOnceWith(4, 0)
      expect(context.sources[0].stop).toHaveBeenCalledExactlyOnceWith(4 + cue.duration + 0.01)
      expect(context.sources[0].playbackRate.setValueAtTime).toHaveBeenCalledExactlyOnceWith(0.85, 4)
      expect(context.filters[0].frequency.setValueAtTime).toHaveBeenCalledExactlyOnceWith(cue.frequency * 0.9, 4)
      expect(context.filters[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(
        cue.frequency * 0.9 * 0.8,
        4 + cue.duration
      )
      expect(context.filters[0].Q.setValueAtTime).toHaveBeenCalledExactlyOnceWith(cue.resonance, 4)
      const points =
        cue.kind === 'rattle'
          ? [
              [0.08, 0.7],
              [0.2, 0.08],
              [0.34, 1],
              [0.48, 0.06],
              [0.6, 0.65],
              [0.73, 0.04],
              [0.84, 0.35]
            ].map(([time, strength]) => [cue.level * strength, 4 + cue.duration * time * 0.9])
          : [
              [cue.level, 4 + Math.min(0.4, cue.duration / 3)],
              [cue.level * 0.6, 4 + cue.duration * 0.65]
            ]
      expect(context.gains[1].gain.setValueAtTime).toHaveBeenCalledExactlyOnceWith(0, 4)
      expect(context.gains[1].gain.linearRampToValueAtTime.mock.calls).toEqual([...points, [0, 4 + cue.duration]])
      expect(context.panners[0].pan.setValueAtTime).toHaveBeenCalledExactlyOnceWith(-cue.pan, 4)
      expect(context.panners[0].pan.linearRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(
        cue.pan * 0.35,
        4 + cue.duration
      )
      expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.18, 4, 0.15 / 3)
      sound.dispose()
    }
  })

  it.each(cues.flatMap((cue) => [0, 0.99].map((random) => ({ ...cue, random }))))(
    'resumes every $kind envelope segment, sweep, pan and noise offset at random=$random',
    (cue) => {
      vi.spyOn(Math, 'random').mockReturnValue(cue.random)
      const original = setup()
      original.sound.start()
      original.sound.trigger(cue.kind)
      const points = [
        [0, 0],
        ...original.context.gains[1].gain.linearRampToValueAtTime.mock.calls.map(([value, time]) => [time, value])
      ]
      const ages = [
        0.01,
        0.2,
        cue.duration / 2,
        cue.duration - 0.001,
        cue.duration - 1e-7,
        ...points.slice(1, -1).flatMap(([time]) => [time - 1e-8, time, time + 1e-8])
      ]
      for (const age of ages) {
        const { sound, context } = setup()
        context.currentTime = 10
        sound.setVolume(1)
        sound.start()
        sound.trigger(cue.kind, age)
        const remaining = cue.duration - age
        const next = points.findIndex(([time]) => time > age)
        const [fromTime, fromLevel] = points[next - 1]
        const [toTime, toLevel] = points[next]
        const expectedLevel = fromLevel + ((toLevel - fromLevel) * (age - fromTime)) / (toTime - fromTime)
        expect(context.gains[1].gain.setValueAtTime).toHaveBeenCalledExactlyOnceWith(
          expect.closeTo(expectedLevel, 12),
          10
        )
        const ramps = context.gains[1].gain.linearRampToValueAtTime.mock.calls
        expect(ramps).toEqual(points.slice(next).map(([time, value]) => [value, 10 + (time - age)]))
        expect(
          ramps.every(([value, time]) => Number.isFinite(value) && value >= 0 && value <= cue.level && time > 10)
        ).toBe(true)
        expect(ramps.at(-1)).toEqual([0, 10 + (cue.duration - age)])
        const playbackRate = 0.85 + cue.random * 0.3
        expect(context.sources[0].start).toHaveBeenCalledExactlyOnceWith(10, (cue.random * 2 + age * playbackRate) % 2)
        expect(context.sources[0].stop).toHaveBeenCalledExactlyOnceWith(10 + (cue.duration - age))
        expect(context.sources[0].playbackRate.setValueAtTime).toHaveBeenCalledExactlyOnceWith(playbackRate, 10)
        const frequency = cue.frequency * (0.9 + cue.random * 0.2)
        const sweep = 0.8 + cue.random * 0.15
        expect(context.filters[0].frequency.setValueAtTime).toHaveBeenCalledExactlyOnceWith(
          frequency * sweep ** (age / cue.duration),
          10
        )
        expect(context.filters[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(
          frequency * sweep,
          10 + (cue.duration - age)
        )
        const pan = cue.pan * (cue.random < 0.5 ? -1 : 1)
        expect(context.panners[0].pan.setValueAtTime).toHaveBeenCalledExactlyOnceWith(
          pan + ((-pan * 0.35 - pan) * age) / cue.duration,
          10
        )
        expect(context.panners[0].pan.linearRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(
          -pan * 0.35,
          10 + (cue.duration - age)
        )
        expect(context.gains).toHaveLength(3)
        const fade = context.gains[2]
        expect(fade.gain.setValueAtTime).toHaveBeenCalledExactlyOnceWith(0, 10)
        expect(fade.gain.linearRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(
          1,
          10 + Math.min(0.005, remaining / 2)
        )
        expect(context.gains[1].connect).toHaveBeenCalledExactlyOnceWith(fade)
        expect(fade.connect).toHaveBeenCalledExactlyOnceWith(context.panners[0])
        expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.18, 10, 0.15 / 3)
        sound.dispose()
        for (const node of [...context.sources, ...context.filters, ...context.gains, ...context.panners]) {
          expect(node.disconnect).toHaveBeenCalledOnce()
        }
      }
      original.sound.dispose()
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it.each(cues)('drops invalid and expired $kind ages without nodes, random consumption or cooldown', (cue) => {
    const { sound, context } = setup()
    sound.start()
    const random = vi.spyOn(Math, 'random')
    const timers = vi.getTimerCount()
    for (const age of [
      -1,
      -Number.MIN_VALUE,
      NaN,
      Infinity,
      -Infinity,
      cue.duration,
      cue.duration + 0.001,
      3.499,
      Number.MAX_VALUE,
      null,
      '0.5',
      {}
    ]) {
      sound.trigger(cue.kind, age as number)
    }
    sound.trigger('unknown' as HorrorCue, 0.5)
    expect(random).not.toHaveBeenCalled()
    expect(context.sources).toHaveLength(0)
    expect(context.filters).toHaveLength(0)
    expect(context.gains).toHaveLength(1)
    expect(context.panners).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(timers)
    sound.trigger(cue.kind, 0.5)
    expect(context.sources).toHaveLength(1)
    sound.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retains single-cue exclusion and the 0.8 second cooldown after a short aged tail', () => {
    const { sound, context } = setup()
    sound.start()
    sound.trigger('blackout', 2.799)
    for (let index = 0; index < 100; index++) sound.trigger('rattle', 0.5)
    expect(context.sources).toHaveLength(1)
    context.sources[0].onended?.()
    context.currentTime = 0.799
    sound.trigger('rattle', 0.5)
    expect(context.sources).toHaveLength(1)
    context.currentTime = 0.8
    sound.trigger('rattle', 0.5)
    expect(context.sources).toHaveLength(2)
    context.currentTime = 2
    sound.trigger('apparition', 2.399)
    expect(context.sources).toHaveLength(2)
    context.sources[1].onended?.()
    sound.trigger('apparition', 2.399)
    expect(context.sources).toHaveLength(3)
    sound.dispose()
  })

  it('keeps four source slots and reclaims the extra fade node after natural completion', () => {
    const { sound, context } = setup()
    sound.start()
    sound.ritualBell()
    sound.footstep('wood')
    sound.trigger('apparition', 2.399)
    expect(context.sources).toHaveLength(4)
    sound.ritualBell()
    context.currentTime = 1
    sound.footstep('wood')
    sound.trigger('blackout', 2.799)
    expect(context.sources).toHaveLength(4)
    const ended = context.sources[3].onended
    ended?.()
    ended?.()
    expect(context.gains.at(-1)?.disconnect).toHaveBeenCalledOnce()
    sound.trigger('blackout', 2.799)
    expect(context.sources).toHaveLength(5)
    expect(context.sources.filter((source) => source.onended !== null)).toHaveLength(4)
    sound.dispose()
    for (const node of [...context.sources, ...context.filters, ...context.gains, ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
  })

  it.each(
    cues.flatMap((cue) =>
      ['mute', 'zero', 'stop', 'suspended', 'interrupted', 'closed', 'dispose'].map((action) => ({ ...cue, action }))
    )
  )('releases aged $kind nodes on $action without replay or stale-ended leaks', (cue) => {
    const { sound, context } = setup()
    sound.start()
    sound.trigger(cue.kind, 0.5)
    const ended = context.sources[0].onended
    context.sources[0].stop.mockImplementationOnce(() => {
      throw new Error('already stopped')
    })
    if (cue.action === 'mute') sound.setMuted(true)
    else if (cue.action === 'zero') sound.setVolume(0)
    else if (cue.action === 'stop') sound.stop()
    else if (cue.action === 'dispose') sound.dispose()
    else {
      context.state = cue.action
      for (const listener of context.listeners) listener()
    }
    ended?.()
    ended?.()
    sound.trigger(cue.kind, 0.5)
    expect(context.sources).toHaveLength(1)
    for (const node of [...context.sources, ...context.filters, ...context.gains.slice(1), ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
    sound.setMuted(false)
    sound.setVolume(0.7)
    context.state = 'running'
    for (const listener of context.listeners) listener()
    sound.start()
    vi.advanceTimersByTime(100)
    expect(context.sources).toHaveLength(1)
    sound.dispose()
    expect(context.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['before-start', 'mute', 'zero', 'stop', 'suspended', 'interrupted', 'closed', 'dispose'] as const)(
    'drops aged cues while %s without reserving a voice or cooldown',
    (state) => {
      const { sound, context } = setup()
      if (state !== 'before-start') sound.start()
      if (state === 'mute') sound.setMuted(true)
      else if (state === 'zero') sound.setVolume(0)
      else if (state === 'stop') sound.stop()
      else if (state === 'dispose') sound.dispose()
      else if (state !== 'before-start') context.state = state
      const timers = vi.getTimerCount()
      for (const cue of cues) sound.trigger(cue.kind, 0.5)
      expect(context.sources).toHaveLength(0)
      expect(context.gains).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(timers)
      sound.setMuted(false)
      sound.setVolume(0.7)
      context.state = 'running'
      sound.start()
      expect(context.sources).toHaveLength(0)
      sound.trigger('rattle', 0.5)
      expect(context.sources).toHaveLength(state === 'dispose' ? 0 : 1)
      sound.dispose()
    }
  )

  it.each([
    'create-source',
    'create-filter',
    'playback-rate',
    'frequency',
    'resonance',
    'source-connect',
    'sweep',
    'create-envelope',
    'envelope-initial',
    'envelope-ramp',
    'create-panner',
    'pan-initial',
    'pan-ramp',
    'filter-connect',
    'create-fade',
    'fade-initial',
    'fade-ramp',
    'envelope-connect',
    'fade-connect',
    'panner-connect',
    'start',
    'stop'
  ])('releases partial aged graphs and preserves immediate retry when %s throws', (stage) => {
    const { sound, context } = setup()
    sound.start()
    const fail = () => {
      throw new Error(stage)
    }
    const createSource = context.createBufferSource.bind(context)
    vi.spyOn(context, 'createBufferSource').mockImplementationOnce(() => {
      if (stage === 'create-source') return fail()
      const source = createSource()
      if (stage === 'playback-rate') source.playbackRate.setValueAtTime.mockImplementationOnce(fail)
      if (stage === 'source-connect') source.connect.mockImplementationOnce(fail)
      if (stage === 'start') source.start.mockImplementationOnce(fail)
      if (stage === 'stop') source.stop.mockImplementationOnce(fail)
      return source
    })
    const createFilter = context.createBiquadFilter.bind(context)
    vi.spyOn(context, 'createBiquadFilter').mockImplementationOnce(() => {
      if (stage === 'create-filter') return fail()
      const filter = createFilter()
      if (stage === 'frequency') filter.frequency.setValueAtTime.mockImplementationOnce(fail)
      if (stage === 'resonance') filter.Q.setValueAtTime.mockImplementationOnce(fail)
      if (stage === 'sweep') filter.frequency.exponentialRampToValueAtTime.mockImplementationOnce(fail)
      if (stage === 'filter-connect') filter.connect.mockImplementationOnce(fail)
      return filter
    })
    const createGain = context.createGain.bind(context)
    const gainMock = vi.spyOn(context, 'createGain')
    for (const name of ['envelope', 'fade']) {
      gainMock.mockImplementationOnce(() => {
        if (stage === 'create-' + name) return fail()
        const gain = createGain()
        if (stage === name + '-initial') gain.gain.setValueAtTime.mockImplementationOnce(fail)
        if (stage === name + '-ramp') gain.gain.linearRampToValueAtTime.mockImplementationOnce(fail)
        if (stage === name + '-connect') gain.connect.mockImplementationOnce(fail)
        return gain
      })
    }
    const createPanner = context.createStereoPanner.bind(context)
    vi.spyOn(context, 'createStereoPanner').mockImplementationOnce(() => {
      if (stage === 'create-panner') return fail()
      const panner = createPanner()
      if (stage === 'pan-initial') panner.pan.setValueAtTime.mockImplementationOnce(fail)
      if (stage === 'pan-ramp') panner.pan.linearRampToValueAtTime.mockImplementationOnce(fail)
      if (stage === 'panner-connect') panner.connect.mockImplementationOnce(fail)
      return panner
    })
    expect(() => sound.trigger('rattle', 0.5)).toThrow(stage)
    for (const node of [...context.sources, ...context.filters, ...context.gains.slice(1), ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
    expect(context.sources.every((source) => source.onended === null)).toBe(true)
    vi.restoreAllMocks()
    sound.trigger('rattle', 0.5)
    expect(context.sources.filter((source) => source.onended !== null)).toHaveLength(1)
    sound.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('YashikiSound preparation preview', () => {
  it('synchronizes the preview volume under the original cap and never mixes with other sounds', () => {
    const { sound, context } = setup()
    sound.previewBell()
    sound.setVolume(0.1)
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.1 * 0.18, 0, 0.15 / 3)
    sound.setVolume(2)
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.18, 0, 0.15 / 3)
    sound.trigger('rattle')
    sound.ritualBell()
    sound.footstep('wood')
    expect(context.sources).toHaveLength(2)
    expect(context.filters).toHaveLength(0)
    sound.start()
    expect(sound.isPreviewing).toBe(false)
    for (const source of context.sources) expect(source.disconnect).toHaveBeenCalledOnce()
    context.currentTime = 2
    sound.trigger('rattle')
    sound.ritualBell()
    sound.footstep('wood')
    expect(context.sources.filter((source) => !source.disconnect.mock.calls.length)).toHaveLength(3)
    expect(sound.previewBell()).toBe(false)
    sound.dispose()
  })

  it.each(['cancelScheduledValues', 'setValueAtTime', 'setTargetAtTime'] as const)(
    'still releases every preview node when output %s throws',
    (operation) => {
      const { sound, context } = setup()
      if (operation !== 'setTargetAtTime') sound.previewBell()
      context.gains[0].gain[operation].mockImplementation(() => {
        throw new Error(operation)
      })
      if (operation === 'setTargetAtTime') expect(sound.previewBell()).toBe(false)
      else expect(() => sound.stopPreview()).not.toThrow()
      expect(sound.isPreviewing).toBe(false)
      for (const node of [...context.sources, ...context.gains.slice(1), ...context.panners]) {
        expect(node.disconnect).toHaveBeenCalledOnce()
      }
      sound.dispose()
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it('uses the actual bell parameters and existing output without ambience or random consumption', () => {
    const { sound, context } = setup()
    const normalContext = new Context()
    const normal = new YashikiSound(normalContext as unknown as AudioContext)
    context.currentTime = normalContext.currentTime = 2
    sound.setVolume(0.2)
    normal.setVolume(0.2)
    const random = vi.spyOn(Math, 'random')
    expect(sound.previewBell()).toBe(true)
    expect(random).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    for (let index = 0; index < 100; index++) expect(sound.previewBell()).toBe(false)
    expect(context.sources).toHaveLength(2)
    expect(context.filters).toHaveLength(0)
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.2 * 0.18, 2, 0.15 / 3)
    normal.start()
    normal.ritualBell()
    const signature = (value: Context) => ({
      sources: value.sources.map((source) => ({
        type: source.type,
        buffer: source.buffer,
        loop: source.loop,
        frequency: source.frequency.setValueAtTime.mock.calls,
        ramp: source.frequency.exponentialRampToValueAtTime.mock.calls,
        start: source.start.mock.calls,
        stop: source.stop.mock.calls
      })),
      envelopes: value.gains.slice(1).map((gain) => ({
        initial: gain.gain.setValueAtTime.mock.calls,
        ramps: gain.gain.linearRampToValueAtTime.mock.calls,
        decay: gain.gain.exponentialRampToValueAtTime.mock.calls
      })),
      pans: value.panners.map((panner) => ({
        initial: panner.pan.setValueAtTime.mock.calls,
        ramp: panner.pan.linearRampToValueAtTime.mock.calls
      }))
    })
    expect(signature(context)).toEqual(signature(normalContext))
    sound.dispose()
    normal.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['started', 'mute', 'zero', 'suspended', 'interrupted', 'closed', 'disposed'] as const)(
    'rejects direct preview calls during %s without allocating or queuing',
    (state) => {
      const { sound, context } = setup()
      if (state === 'started') sound.start()
      else if (state === 'mute') sound.setMuted(true)
      else if (state === 'zero') sound.setVolume(0)
      else if (state === 'disposed') sound.dispose()
      else context.state = state
      const timers = vi.getTimerCount()
      for (let index = 0; index < 100; index++) expect(sound.previewBell()).toBe(false)
      expect(context.sources).toHaveLength(0)
      expect(context.gains).toHaveLength(1)
      expect(context.panners).toHaveLength(0)
      expect(vi.getTimerCount()).toBe(timers)
      sound.dispose()
    }
  )

  it.each(['stopPreview', 'stop', 'start', 'mute', 'zero', 'suspended', 'interrupted', 'closed', 'dispose'] as const)(
    'stops and releases a preview on %s without replay after recovery',
    (action) => {
      const { sound, context } = setup()
      expect(sound.previewBell()).toBe(true)
      const ended = context.sources.map((source) => source.onended)
      if (action === 'stopPreview') sound.stopPreview()
      else if (action === 'stop') sound.stop()
      else if (action === 'start') sound.start()
      else if (action === 'mute') sound.setMuted(true)
      else if (action === 'zero') sound.setVolume(0)
      else if (action === 'dispose') sound.dispose()
      else {
        context.state = action
        context.listeners.forEach((listener) => listener())
      }
      expect(sound.isPreviewing).toBe(false)
      for (const source of context.sources) {
        expect(source.onended).toBeNull()
        expect(source.stop).toHaveBeenCalledTimes(2)
        expect(source.stop).toHaveBeenLastCalledWith()
      }
      for (const node of [...context.sources, ...context.gains.slice(1), ...context.panners]) {
        expect(node.disconnect).toHaveBeenCalledOnce()
      }
      expect(vi.getTimerCount()).toBe(action === 'start' ? 1 : 0)
      context.state = 'running'
      context.listeners.forEach((listener) => listener())
      sound.setMuted(false)
      sound.setVolume(0.2)
      for (const callback of ended) {
        callback?.()
        callback?.()
      }
      vi.advanceTimersByTime(1000)
      expect(context.sources).toHaveLength(2)
      expect(sound.isPreviewing).toBe(false)
      sound.dispose()
      sound.dispose()
      for (const node of [...context.sources, ...context.gains, ...context.panners]) {
        expect(node.disconnect).toHaveBeenCalledOnce()
      }
      expect(context.listeners.size).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it('finishes only after both partials and ignores duplicate and stale ended callbacks', () => {
    const { sound, context } = setup()
    sound.previewBell()
    const [long, short] = context.sources.map((source) => source.onended)
    short?.()
    short?.()
    expect(sound.isPreviewing).toBe(true)
    expect(sound.previewBell()).toBe(false)
    long?.()
    expect(sound.isPreviewing).toBe(false)
    expect(context.gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0)
    expect(sound.previewBell()).toBe(true)
    long?.()
    short?.()
    expect(sound.isPreviewing).toBe(true)
    expect(context.sources[2].disconnect).not.toHaveBeenCalled()
    sound.stopPreview()
    sound.stopPreview()
    for (const node of [...context.sources, ...context.gains.slice(1), ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
    sound.dispose()
  })

  it('does not mutate cue, footstep, ambience or generation histories', () => {
    const { sound, context } = setup()
    const history = sound as unknown as {
      lastCue: number
      lastFootstep: number
      lastAmbient: number
      generation: number
    }
    Object.assign(history, { lastCue: 2, lastFootstep: 2, lastAmbient: 1, generation: 7 })
    const before = {
      lastCue: history.lastCue,
      lastFootstep: history.lastFootstep,
      lastAmbient: history.lastAmbient,
      generation: history.generation
    }
    sound.previewBell()
    sound.stopPreview()
    expect({
      lastCue: history.lastCue,
      lastFootstep: history.lastFootstep,
      lastAmbient: history.lastAmbient,
      generation: history.generation
    }).toEqual(before)
    context.currentTime = 3
    sound.start()
    sound.trigger('apparition')
    sound.footstep('tatami')
    expect(context.sources).toHaveLength(4)
    expect(context.filters).toHaveLength(2)
    expect(vi.getTimerCount()).toBe(1)
    sound.dispose()
  })

  it('does not replay after natural completion or a throwing cancellation stop', () => {
    const { sound, context } = setup()
    sound.previewBell()
    context.sources[0].onended?.()
    context.sources[1].onended?.()
    expect(sound.isPreviewing).toBe(false)
    vi.advanceTimersByTime(60_000)
    expect(context.sources).toHaveLength(2)
    expect(vi.getTimerCount()).toBe(0)
    sound.previewBell()
    context.sources[2].stop.mockImplementation(() => {
      throw new Error('already stopped')
    })
    sound.stopPreview()
    expect(sound.isPreviewing).toBe(false)
    sound.dispose()
    for (const node of [...context.sources, ...context.gains, ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
  })

  it.each(
    (
      ['create-source', 'frequency', 'create-gain', 'envelope', 'create-panner', 'connect', 'start', 'stop'] as const
    ).flatMap((stage) => [1, 2].map((part) => ({ stage, part })))
  )('cleans up $stage failures in partial $part without delayed playback', ({ stage, part }) => {
    const { sound, context } = setup()
    const source = context.source.bind(context)
    vi.spyOn(context, 'createOscillator').mockImplementation(() => {
      if (stage === 'create-source' && context.sources.length + 1 === part) throw new Error(stage)
      const node = source()
      if (context.sources.length === part) {
        if (stage === 'frequency')
          node.frequency.setValueAtTime.mockImplementationOnce(() => {
            throw new Error(stage)
          })
        if (stage === 'start')
          node.start.mockImplementationOnce(() => {
            throw new Error(stage)
          })
        if (stage === 'stop')
          node.stop.mockImplementationOnce(() => {
            throw new Error(stage)
          })
      }
      return node
    })
    const gain = context.createGain.bind(context)
    vi.spyOn(context, 'createGain').mockImplementation(() => {
      if (stage === 'create-gain' && context.sources.length === part) throw new Error(stage)
      const node = gain()
      if (stage === 'envelope' && context.sources.length === part)
        node.gain.linearRampToValueAtTime.mockImplementationOnce(() => {
          throw new Error(stage)
        })
      return node
    })
    const panner = context.createStereoPanner.bind(context)
    vi.spyOn(context, 'createStereoPanner').mockImplementation(() => {
      if (stage === 'create-panner' && context.sources.length === part) throw new Error(stage)
      const node = panner()
      if (stage === 'connect' && context.sources.length === part)
        node.connect.mockImplementationOnce(() => {
          throw new Error(stage)
        })
      return node
    })
    expect(sound.previewBell()).toBe(false)
    expect(sound.isPreviewing).toBe(false)
    const count = context.sources.length
    vi.advanceTimersByTime(60_000)
    expect(context.sources).toHaveLength(count)
    expect(vi.getTimerCount()).toBe(0)
    sound.dispose()
    for (const node of [...context.sources, ...context.gains, ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
  })
})

describe('YashikiSound', () => {
  it('plays a quiet ritual bell with two inharmonic sine partials and a short smooth decay', () => {
    const { sound, context } = setup()
    context.currentTime = 2
    sound.setVolume(1)
    sound.start()
    const random = vi.spyOn(Math, 'random')
    sound.ritualBell()
    expect(context.sources).toHaveLength(2)
    expect(context.filters).toHaveLength(0)
    expect(random).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.18, 2, 0.15 / 3)
    for (const [index, [frequency, duration, level]] of [
      [1320, 0.9, 0.045],
      [2140, 0.55, 0.018]
    ].entries()) {
      const source = context.sources[index]
      const envelope = context.gains[index + 1]
      expect(source.type).toBe('sine')
      expect(source.buffer).toBeNull()
      expect(source.loop).toBe(false)
      expect(source.frequency.setValueAtTime).toHaveBeenCalledWith(frequency, 2)
      expect(source.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(frequency, 2 + duration)
      expect(source.start).toHaveBeenCalledExactlyOnceWith(2)
      expect(source.stop).toHaveBeenCalledExactlyOnceWith(2 + duration + 0.01)
      expect(envelope.gain.setValueAtTime).toHaveBeenCalledExactlyOnceWith(0, 2)
      expect(envelope.gain.linearRampToValueAtTime.mock.calls).toEqual([
        [level, 2.008],
        [0, 2 + duration]
      ])
      expect(envelope.gain.exponentialRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(
        level * 0.001,
        2 + duration * 0.9
      )
      expect(source.connect).toHaveBeenCalledWith(envelope)
      expect(envelope.connect).toHaveBeenCalledWith(context.panners[index])
      expect(context.panners[index].connect).toHaveBeenCalledWith(context.gains[0])
      expect(context.panners[index].pan.setValueAtTime).toHaveBeenCalledWith(0, 2)
      const ended = source.onended
      ended?.()
      ended?.()
      expect(source.onended).toBeNull()
      for (const node of [source, envelope, context.panners[index]]) {
        expect(node.disconnect).toHaveBeenCalledOnce()
      }
    }
    sound.ritualBell()
    expect(context.sources).toHaveLength(4)
    sound.dispose()
    for (const node of [...context.sources, ...context.gains, ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['before-start', 'zero', 'mute', 'stop', 'suspended', 'interrupted', 'closed', 'dispose'] as const)(
    'drops ritual bells during %s without allocation or delayed replay',
    (state) => {
      const { sound, context } = setup()
      if (state !== 'before-start') sound.start()
      if (state === 'zero') sound.setVolume(0)
      else if (state === 'mute') sound.setMuted(true)
      else if (state === 'stop') sound.stop()
      else if (state === 'dispose') sound.dispose()
      else if (state !== 'before-start') context.state = state
      const timers = vi.getTimerCount()
      for (let index = 0; index < 100; index++) sound.ritualBell()
      expect(context.sources).toHaveLength(0)
      expect(context.filters).toHaveLength(0)
      expect(context.panners).toHaveLength(0)
      expect(context.gains).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(timers)
      context.state = 'running'
      for (const listener of context.listeners) listener()
      sound.setVolume(0.7)
      sound.setMuted(false)
      sound.start()
      vi.advanceTimersByTime(1000)
      expect(context.sources).toHaveLength(0)
      sound.ritualBell()
      expect(context.sources).toHaveLength(state === 'dispose' ? 0 : 2)
      sound.dispose()
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it.each(
    (['zero', 'mute', 'suspended', 'interrupted', 'closed', 'stop', 'dispose'] as const).flatMap((action) =>
      [false, true].map((fallback) => ({ action, fallback }))
    )
  )(
    'releases ritual bells on $action (fallback=$fallback) without stale callbacks or replay',
    ({ action, fallback }) => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const { sound, context } = setup()
      sound.start()
      if (fallback) {
        vi.advanceTimersByTime(8000)
        sound.footstep('wood')
      }
      sound.ritualBell()
      const count = fallback ? 3 : 2
      expect(context.sources).toHaveLength(count)
      const ended = context.sources.map((source) => source.onended)
      context.sources.at(-1)!.stop.mockImplementation(() => {
        throw new Error('already stopped')
      })
      if (action === 'zero') sound.setVolume(0)
      else if (action === 'mute') sound.setMuted(true)
      else if (action === 'stop') sound.stop()
      else if (action === 'dispose') sound.dispose()
      else {
        context.state = action
        for (const listener of context.listeners) listener()
      }
      for (const source of context.sources) {
        expect(source.stop).toHaveBeenLastCalledWith()
        expect(source.onended).toBeNull()
      }
      for (const callback of ended) callback?.()
      for (const node of [...context.sources, ...context.filters, ...context.gains.slice(1), ...context.panners]) {
        expect(node.disconnect).toHaveBeenCalledOnce()
      }
      context.state = 'running'
      for (const listener of context.listeners) listener()
      sound.setVolume(0.7)
      sound.setMuted(false)
      sound.start()
      vi.advanceTimersByTime(1000)
      expect(context.sources).toHaveLength(count)
      sound.ritualBell()
      expect(context.sources).toHaveLength(action === 'dispose' ? count : count + 2)
      sound.dispose()
      sound.dispose()
      for (const node of [...context.sources, ...context.filters, ...context.gains, ...context.panners]) {
        expect(node.disconnect).toHaveBeenCalledOnce()
      }
      expect(context.listeners.size).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it.each([0, 1, 2, 3])('uses only available non-cue slots with %i existing voices', (count) => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.start()
    for (let index = 0; index < count; index++) {
      context.currentTime = index * 0.28
      sound.footstep('wood')
    }
    const now = context.currentTime
    const partials = Math.min(2, 3 - count)
    const random = vi.spyOn(Math, 'random').mockClear()
    sound.ritualBell()
    expect(context.sources).toHaveLength(count + partials)
    expect(context.gains).toHaveLength(1 + count + partials)
    expect(context.panners).toHaveLength(count + partials)
    expect(context.filters).toHaveLength(count)
    expect(random).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)
    for (const [index, source] of context.sources.slice(count).entries()) {
      expect(source.type).toBe('sine')
      expect(source.frequency.setValueAtTime).toHaveBeenCalledExactlyOnceWith(index === 0 ? 1320 : 2140, now)
      expect(source.start).toHaveBeenCalledExactlyOnceWith(now)
      expect(source.stop).toHaveBeenCalledExactlyOnceWith(now + (index === 0 ? 0.9 : 0.55) + 0.01)
      expect(context.gains[count + index + 1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(
        index === 0 ? 0.045 : 0.018,
        now + 0.008
      )
    }
    sound.trigger('rattle')
    expect(context.sources).toHaveLength(count + partials + 1)
    const ended = context.sources.map((source) => source.onended)
    sound.stop()
    for (const callback of ended) {
      callback?.()
      callback?.()
    }
    sound.dispose()
    for (const node of [...context.sources, ...context.filters, ...context.gains, ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds ritual bell bursts with ambience and footsteps while reserving a cue slot', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.start()
    vi.advanceTimersByTime(8000)
    sound.footstep('wood')
    sound.ritualBell()
    expect(context.sources).toHaveLength(3)
    context.sources[1].onended?.()
    sound.ritualBell()
    expect(context.sources).toHaveLength(4)
    for (let index = 0; index < 100; index++) sound.ritualBell()
    expect(context.sources).toHaveLength(4)
    sound.trigger('rattle')
    expect(context.sources).toHaveLength(5)
    expect(context.filters.at(-1)?.Q.setValueAtTime).toHaveBeenCalledWith(1.4, 0)
    expect(context.sources.filter((source) => source.onended !== null)).toHaveLength(4)
    for (let index = 0; index < 100; index++) {
      context.currentTime = index + 1
      sound.ritualBell()
      sound.footstep('tatami')
      sound.trigger('blackout')
    }
    expect(context.sources).toHaveLength(5)
    expect(vi.getTimerCount()).toBe(1)
    sound.dispose()
    for (const node of [...context.sources, ...context.filters, ...context.gains, ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
  })

  it('bounds fifteen minutes of ritual bell bursts while recycling ended voices and preserving cue capacity', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.start()
    vi.advanceTimersByTime(8000)
    for (let second = 0; second < 900; second += 2) {
      context.currentTime = 8 + second
      const count = context.sources.length
      for (const source of context.sources) {
        if (source.stop.mock.calls[0][0] > context.currentTime) continue
        const ended = source.onended
        ended?.()
        ended?.()
      }
      expect(context.sources).toHaveLength(count)
      sound.footstep('wood')
      for (let repeat = 0; repeat < 20; repeat++) sound.ritualBell()
      expect(context.sources.filter((source) => source.onended !== null)).toHaveLength(3)
      sound.trigger('rattle')
      expect(context.sources.filter((source) => source.onended !== null)).toHaveLength(4)
      vi.advanceTimersByTime(2000)
      expect(vi.getTimerCount()).toBe(1)
    }
    expect(context.sources.length).toBeGreaterThan(900)
    sound.dispose()
    for (const node of [...context.sources, ...context.filters, ...context.gains, ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
    expect(context.sources.every((source) => source.onended === null)).toBe(true)
    expect(context.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('allows ritual bells alongside a cue without changing cue or footstep cooldowns', () => {
    const { sound, context } = setup()
    sound.start()
    sound.trigger('apparition')
    sound.ritualBell()
    expect(context.sources).toHaveLength(3)
    context.sources[1].onended?.()
    context.sources[2].onended?.()
    sound.footstep('wood')
    expect(context.sources).toHaveLength(4)
    context.sources[0].onended?.()
    context.sources[3].onended?.()
    context.currentTime = 0.28
    sound.ritualBell()
    sound.footstep('tatami')
    sound.trigger('rattle')
    expect(context.sources).toHaveLength(7)
    context.sources[4].onended?.()
    context.sources[5].onended?.()
    context.sources[6].onended?.()
    context.currentTime = 0.8
    sound.trigger('rattle')
    expect(context.sources).toHaveLength(8)
    sound.dispose()
  })

  it('drops zero-volume sounds without allocating nodes or consuming cooldowns', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.setVolume(0)
    sound.start()
    sound.start()
    for (const kind of ['apparition', 'blackout', 'rattle'] as const) sound.trigger(kind)
    sound.footstep('tatami')
    sound.footstep('wood')
    vi.advanceTimersByTime(24000)
    expect(context.sources).toHaveLength(0)
    expect(context.filters).toHaveLength(0)
    expect(context.panners).toHaveLength(0)
    expect(context.gains).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)
    sound.setVolume(0.2)
    expect(context.sources).toHaveLength(0)
    sound.trigger('rattle')
    sound.footstep('wood')
    expect(context.sources).toHaveLength(2)
    for (const source of context.sources) source.onended?.()
    vi.advanceTimersByTime(8000)
    expect(context.sources).toHaveLength(3)
    expect(context.filters[2].type).toBe('lowpass')
    sound.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases a full voice set at zero volume without replay or stale callback leaks', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.start()
    vi.advanceTimersByTime(8000)
    sound.footstep('tatami')
    context.currentTime = 0.3
    sound.footstep('wood')
    sound.trigger('rattle')
    expect(context.sources).toHaveLength(4)
    const ended = context.sources.map((source) => source.onended)
    context.sources[0].stop.mockImplementation(() => {
      throw new Error('already stopped')
    })
    sound.setVolume(0)
    for (const source of context.sources) {
      expect(source.stop).toHaveBeenLastCalledWith()
      expect(source.onended).toBeNull()
    }
    for (const node of [...context.sources, ...context.filters, ...context.gains.slice(1), ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
    for (const callback of ended) callback?.()
    sound.setVolume(0)
    sound.setVolume(0.2)
    expect(context.sources).toHaveLength(4)
    context.currentTime = 1.2
    sound.trigger('blackout')
    sound.footstep('wood')
    expect(context.sources).toHaveLength(6)
    expect(context.sources.filter((source) => source.onended !== null)).toHaveLength(2)
    sound.dispose()
    for (const node of [...context.sources, ...context.filters, ...context.gains, ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves an audible cue cooldown across a zero-volume transition', () => {
    const { sound, context } = setup()
    sound.start()
    sound.trigger('apparition')
    sound.setVolume(0)
    sound.setVolume(0.2)
    context.currentTime = 0.79
    sound.trigger('rattle')
    expect(context.sources).toHaveLength(1)
    context.currentTime = 0.8
    sound.trigger('rattle')
    expect(context.sources).toHaveLength(2)
    sound.dispose()
  })

  it('keeps zero volume independent of mute and start-stop state', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.setVolume(0)
    sound.start()
    sound.setMuted(true)
    sound.setMuted(false)
    sound.trigger('apparition')
    sound.footstep('tatami')
    vi.advanceTimersByTime(8000)
    expect(context.sources).toHaveLength(0)
    sound.stop()
    expect(vi.getTimerCount()).toBe(0)
    sound.setVolume(0.2)
    sound.trigger('rattle')
    expect(context.sources).toHaveLength(0)
    sound.start()
    sound.setMuted(true)
    sound.trigger('rattle')
    sound.footstep('wood')
    vi.advanceTimersByTime(8000)
    expect(context.sources).toHaveLength(0)
    sound.setMuted(false)
    expect(context.sources).toHaveLength(0)
    sound.trigger('rattle')
    expect(context.sources).toHaveLength(1)
    sound.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('plays distinct quiet footsteps with bounded, smooth envelopes', () => {
    const { sound, context } = setup()
    sound.setVolume(1)
    sound.start()
    sound.footstep('tatami')
    context.sources[0].onended?.()
    context.currentTime = 0.28
    sound.footstep('wood')
    expect(context.filters.map((filter) => filter.type)).toEqual(['lowpass', 'lowpass'])
    expect(context.filters[0].frequency.setValueAtTime).toHaveBeenCalledWith(700, 0)
    expect(context.filters[1].frequency.setValueAtTime).toHaveBeenCalledWith(220, 0.28)
    expect(context.sources[0].stop).toHaveBeenCalledWith(0.23)
    expect(context.sources[1].stop).toHaveBeenCalledWith(expect.closeTo(0.47))
    for (const [index, level] of [0.065, 0.075].entries()) {
      const ramps = context.gains[index + 1].gain.linearRampToValueAtTime.mock.calls
      expect(ramps.map(([value]) => value)).toEqual([level, level * 0.6, 0])
      expect(ramps[0][1] - index * 0.28).toBeGreaterThanOrEqual(0.05)
      expect(ramps.every(([value, time]) => Number.isFinite(value) && Number.isFinite(time))).toBe(true)
      expect(context.panners[index].pan.setValueAtTime).toHaveBeenCalledWith(0, index * 0.28)
    }
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.18, 0, 0.15 / 3)
    sound.dispose()
  })

  it('rejects invalid surfaces without consuming a step and rate-limits alternating bursts', () => {
    const { sound, context } = setup()
    sound.start()
    for (const invalid of [undefined, null, '', 'hallway', 0, NaN, Infinity, {}, []]) {
      sound.footstep(invalid as FootstepSurface)
    }
    expect(context.sources).toHaveLength(0)
    sound.footstep('tatami')
    for (let index = 0; index < 1000; index++) {
      context.currentTime = index * 0.00027
      sound.footstep(index % 2 ? 'wood' : 'tatami')
    }
    expect(context.sources).toHaveLength(1)
    context.sources[0].onended?.()
    context.currentTime = 0.28
    sound.footstep('wood')
    expect(context.sources).toHaveLength(2)
    expect(vi.getTimerCount()).toBe(1)
    sound.dispose()
  })

  it('reserves room for a cue while bounding footsteps overlapping ambience', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.start()
    vi.advanceTimersByTime(8000)
    sound.footstep('tatami')
    context.currentTime = 0.3
    sound.footstep('wood')
    context.currentTime = 0.6
    sound.footstep('tatami')
    expect(context.sources).toHaveLength(3)
    sound.trigger('rattle')
    expect(context.sources).toHaveLength(4)
    for (let index = 1; index < 1000; index++) {
      context.currentTime = index
      sound.footstep('wood')
      sound.trigger('blackout')
    }
    expect(context.sources).toHaveLength(4)
    context.sources[1].onended?.()
    context.sources[2].onended?.()
    sound.footstep('wood')
    expect(context.sources).toHaveLength(5)
    expect(context.sources.filter((source) => source.onended !== null)).toHaveLength(3)
    sound.dispose()
    for (const node of [...context.sources, ...context.filters, ...context.gains, ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
  })

  it('drops inactive footsteps without queuing them and restarts cleanly', () => {
    const { sound, context } = setup()
    sound.footstep('tatami')
    sound.start()
    sound.setMuted(true)
    sound.footstep('wood')
    sound.setMuted(false)
    for (const state of ['suspended', 'interrupted', 'closed']) {
      context.state = state
      sound.footstep('tatami')
    }
    context.state = 'running'
    expect(context.sources).toHaveLength(0)
    sound.footstep('wood')
    const ended = context.sources[0].onended
    sound.stop()
    ended?.()
    sound.footstep('tatami')
    expect(context.sources).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
    sound.start()
    expect(context.sources).toHaveLength(1)
    sound.footstep('tatami')
    expect(context.sources).toHaveLength(2)
    sound.dispose()
    sound.start()
    sound.setMuted(false)
    sound.footstep('wood')
    expect(context.sources).toHaveLength(2)
    expect(context.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['mute', 'suspend', 'stop', 'dispose'] as const)('releases footsteps on %s without replay', (action) => {
    const { sound, context } = setup()
    sound.start()
    sound.footstep('tatami')
    const ended = context.sources[0].onended
    context.sources[0].stop.mockImplementation(() => {
      throw new Error('already stopped')
    })
    if (action === 'mute') sound.setMuted(true)
    else if (action === 'suspend') {
      context.state = 'suspended'
      context.listeners.forEach((listener) => listener())
    } else if (action === 'stop') sound.stop()
    else sound.dispose()
    ended?.()
    sound.setMuted(false)
    context.state = 'running'
    context.listeners.forEach((listener) => listener())
    sound.start()
    expect(context.sources).toHaveLength(1)
    expect(context.sources[0].onended).toBeNull()
    sound.dispose()
    for (const node of [...context.sources, ...context.filters, ...context.gains, ...context.panners]) {
      expect(node.disconnect).toHaveBeenCalledOnce()
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('renders finite, bounded overlapping footsteps or ritual bell, ambience and every cue offline', async () => {
    const [{ chromium }, { readFile }, { transpileModule, ModuleKind, ScriptTarget }] = await Promise.all([
      import('@playwright/test'),
      import('node:fs/promises'),
      import('typescript')
    ])
    const source = await readFile(new URL('../src/sound.ts', import.meta.url), 'utf8')
    const compiled = transpileModule(source, {
      compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 }
    }).outputText
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await (await browser.newContext({ offline: true })).newPage()
      await page.addScriptTag({
        content: compiled.replace('export class YashikiSound', 'globalThis.YashikiSound = class YashikiSound')
      })
      const measurements = await page.evaluate(async () => {
        const Sound = (globalThis as unknown as { YashikiSound: typeof YashikiSound }).YashikiSound
        const results: {
          surface: string
          cue: string
          variation: number
          peak: number
          finite: boolean
          bellPartials: number | null
        }[] = []
        const random = Math.random
        const schedule = globalThis.setTimeout
        try {
          for (const variation of [0, 0.5, 0.999999]) {
            Math.random = () => variation
            for (const surface of ['tatami', 'wood', 'ritual-bell', 'ritual-bell-fallback'] as const) {
              for (const cue of ['apparition', 'blackout', 'rattle'] as const) {
                const context = new OfflineAudioContext(2, 44100 * 4, 44100)
                let now = 0
                Object.defineProperties(context, {
                  state: { get: () => 'running' },
                  currentTime: { get: () => now }
                })
                let ambient: (() => void) | undefined
                globalThis.setTimeout = ((callback: TimerHandler) => {
                  ambient = callback as () => void
                  return 0
                }) as typeof setTimeout
                const sound = new Sound(context as unknown as AudioContext)
                sound.setVolume(1)
                sound.start()
                ambient?.()
                globalThis.setTimeout = schedule
                let bellPartials: number | null = null
                if (surface === 'ritual-bell' || surface === 'ritual-bell-fallback') {
                  if (surface === 'ritual-bell-fallback') sound.footstep('tatami')
                  let oscillators = 0
                  const createOscillator = context.createOscillator.bind(context)
                  context.createOscillator = () => {
                    oscillators++
                    return createOscillator()
                  }
                  sound.ritualBell()
                  bellPartials = oscillators
                } else {
                  sound.footstep(surface)
                  now = 0.28
                  sound.footstep(surface)
                }
                sound.trigger(cue)
                const rendered = await context.startRendering()
                let peak = 0
                let finite = true
                for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
                  for (const sample of rendered.getChannelData(channel)) {
                    finite &&= Number.isFinite(sample)
                    peak = Math.max(peak, Math.abs(sample))
                  }
                }
                results.push({ surface, cue, variation, peak, finite, bellPartials })
                sound.dispose()
              }
            }
          }
        } finally {
          Math.random = random
          globalThis.setTimeout = schedule
        }
        return results
      })
      expect(measurements).toHaveLength(36)
      for (const measurement of measurements) {
        expect(measurement.finite, JSON.stringify(measurement)).toBe(true)
        expect(measurement.peak).toBeGreaterThan(0.000001)
        expect(measurement.peak).toBeLessThan(0.18)
        if (measurement.surface === 'ritual-bell') expect(measurement.bellPartials).toBe(2)
        if (measurement.surface === 'ritual-bell-fallback') expect(measurement.bellPartials).toBe(1)
      }
      console.info('Offline overlap peak:', Math.max(...measurements.map(({ peak }) => peak)))
    } finally {
      await browser.close()
    }
  }, 30_000)

  it('renders aged cue tails matching the original offline waveform and silences expired cues', async () => {
    const [{ chromium }, { readFile }, { transpileModule, ModuleKind, ScriptTarget }] = await Promise.all([
      import('@playwright/test'),
      import('node:fs/promises'),
      import('typescript')
    ])
    const source = await readFile(new URL('../src/sound.ts', import.meta.url), 'utf8')
    const compiled = transpileModule(source, {
      compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 }
    }).outputText
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await (await browser.newContext({ offline: true })).newPage()
      await page.route('**/*', (route) => route.abort())
      await page.addScriptTag({
        content: compiled.replace('export class YashikiSound', 'globalThis.YashikiSound = class YashikiSound')
      })
      const measurements = await page.evaluate(async () => {
        const Sound = (globalThis as unknown as { YashikiSound: typeof YashikiSound }).YashikiSound
        const random = Math.random
        const schedule = globalThis.setTimeout
        const results = []
        try {
          globalThis.setTimeout = (() => 0) as typeof setTimeout
          for (const sampleRate of [44100, 48000]) {
            for (const [cue, duration] of [
              ['apparition', 2.4],
              ['blackout', 2.8],
              ['rattle', 1.2]
            ] as const) {
              const render = async (age: number) => {
                const context = new OfflineAudioContext(2, sampleRate * 4, sampleRate)
                let now = 0
                Object.defineProperties(context, {
                  state: { get: () => 'running' },
                  currentTime: { get: () => now }
                })
                let seed = 123456789
                Math.random = () => {
                  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
                  return seed / 4294967296
                }
                const sound = new Sound(context as unknown as AudioContext)
                try {
                  Math.random = () => 0.5
                  sound.setVolume(1)
                  sound.start()
                  const output = (sound as unknown as { output: GainNode }).output
                  output.gain.cancelScheduledValues(0)
                  output.gain.setValueAtTime(0.18, 0)
                  now = 1
                  sound.trigger(cue, age)
                  return await context.startRendering()
                } finally {
                  sound.dispose()
                }
              }
              const inspect = (buffer: AudioBuffer, end: number) => {
                let finite = true
                let peak = 0
                let beforeStartPeak = 0
                let afterEndPeak = 0
                const afterEnd = Math.ceil((end + 0.01) * sampleRate)
                for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                  const samples = buffer.getChannelData(channel)
                  for (let index = 0; index < samples.length; index++) {
                    const magnitude = Math.abs(samples[index])
                    finite &&= Number.isFinite(samples[index])
                    peak = Math.max(peak, magnitude)
                    if (index < sampleRate) beforeStartPeak = Math.max(beforeStartPeak, magnitude)
                    if (index >= afterEnd) afterEndPeak = Math.max(afterEndPeak, magnitude)
                  }
                }
                return { finite, peak, beforeStartPeak, afterEndPeak }
              }
              const original = await render(0)
              const aged = []
              for (const age of [0.5, 1, duration - 0.002, duration, duration + 0.1]) {
                const buffer = await render(age)
                let relativeRmsError: number | null = null
                let comparedSamples = 0
                if (age === 0.5 || age === 1) {
                  let squaredError = 0
                  let squaredReference = 0
                  const offset = Math.round(age * sampleRate)
                  const start = Math.ceil(1.05 * sampleRate)
                  const end = Math.floor((1 + duration - age) * sampleRate)
                  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                    const samples = buffer.getChannelData(channel)
                    const reference = original.getChannelData(channel)
                    for (let index = start; index < end; index++) {
                      squaredError += (samples[index] - reference[index + offset]) ** 2
                      squaredReference += reference[index + offset] ** 2
                      comparedSamples++
                    }
                  }
                  relativeRmsError = Math.sqrt(squaredError / squaredReference)
                }
                aged.push({
                  age,
                  ...inspect(buffer, 1 + Math.max(0, duration - age)),
                  relativeRmsError,
                  comparedSamples
                })
              }
              results.push({ sampleRate, cue, duration, original: inspect(original, 1 + duration), aged })
            }
          }
        } finally {
          Math.random = random
          globalThis.setTimeout = schedule
        }
        return results
      })
      expect(measurements).toHaveLength(6)
      for (const measurement of measurements) {
        const label = JSON.stringify({ sampleRate: measurement.sampleRate, cue: measurement.cue })
        expect(measurement.original.finite, label).toBe(true)
        expect(measurement.original.peak, label).toBeGreaterThan(0.000001)
        expect(measurement.original.beforeStartPeak, label).toBe(0)
        expect(measurement.original.afterEndPeak, label).toBe(0)
        expect(measurement.aged, label).toHaveLength(5)
        for (const aged of measurement.aged) {
          const detail = label + ' age=' + aged.age
          expect(aged.finite, detail).toBe(true)
          expect(aged.beforeStartPeak, detail).toBe(0)
          expect(aged.afterEndPeak, detail).toBe(0)
          if (aged.age >= measurement.duration) expect(aged.peak, detail).toBe(0)
          else {
            expect(aged.peak, detail).toBeGreaterThan(0.0000000001)
            if (aged.relativeRmsError !== null) {
              expect(aged.peak, detail).toBeGreaterThan(0.000001)
              expect(aged.comparedSamples, detail).toBeGreaterThan(measurement.sampleRate * 0.25)
              expect(aged.relativeRmsError, detail).toBeLessThanOrEqual(0.00001)
            }
          }
        }
      }
      console.info(
        'Offline aged cue maximum relative RMS error:',
        Math.max(...measurements.flatMap(({ aged }) => aged.map(({ relativeRmsError }) => relativeRmsError ?? 0)))
      )
    } finally {
      await browser.close()
    }
  }, 30_000)

  it('clamps and smoothly changes volume, and consumes muted events', () => {
    const { sound, context } = setup()
    sound.setVolume(5)
    sound.start()
    sound.start()
    expect(vi.getTimerCount()).toBe(1)
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.18, 0, 0.15 / 3)
    sound.setVolume(NaN)
    sound.setMuted(true)
    sound.trigger('apparition')
    expect(context.sources).toHaveLength(0)
    sound.setMuted(false)
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.18, 0, 0.15 / 3)
    sound.setVolume(-1)
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.15 / 3)
    sound.dispose()
  })

  it('creates distinct cues, fades each, and throttles bursts', () => {
    const { sound, context } = setup()
    sound.start()
    sound.trigger('apparition')
    sound.trigger('blackout')
    expect(context.sources).toHaveLength(1)
    expect(context.sources[0].buffer).not.toBeNull()
    context.currentTime = 1
    sound.trigger('blackout')
    expect(context.sources).toHaveLength(1)
    context.sources[0].onended?.()
    sound.trigger('blackout')
    expect(context.sources[1].buffer).not.toBeNull()
    expect(context.filters[1].Q.setValueAtTime).toHaveBeenCalledWith(2.4, 1)
    context.currentTime = 2
    context.sources[1].onended?.()
    sound.trigger('rattle')
    expect(context.filters[0].type).toBe('bandpass')
    for (const gain of context.gains.slice(1)) {
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number))
      expect(gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, expect.any(Number))
    }
    expect(context.sources[0].disconnect).toHaveBeenCalledOnce()
    sound.dispose()
    vi.advanceTimersByTime(150)
    expect(context.sources.every((source) => source.disconnect.mock.calls.length === 1)).toBe(true)
    expect(context.gains[0].disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    sound.start()
    sound.trigger('rattle')
    sound.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('schedules sparse varied ambience and does not queue muted or suspended sounds', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.start()
    vi.advanceTimersByTime(8000)
    expect(context.filters[0].type).toBe('lowpass')
    expect(context.panners[0].pan.setValueAtTime).toHaveBeenCalledWith(-0.35, 0)
    context.sources[0].onended?.()
    random.mockReturnValue(0.6)
    vi.advanceTimersByTime(8000)
    expect(context.sources[1].type).toBe('triangle')
    sound.setMuted(true)
    vi.advanceTimersByTime(20000)
    expect(context.sources).toHaveLength(2)
    sound.setMuted(false)
    context.state = 'suspended'
    sound.trigger('rattle')
    vi.advanceTimersByTime(20000)
    expect(context.sources).toHaveLength(2)
    sound.dispose()
    vi.advanceTimersByTime(150)
  })

  it('stops active voices and timers immediately and restarts without replaying them', () => {
    const { sound, context } = setup()
    sound.start()
    sound.trigger('rattle')
    expect(context.gains[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.14, expect.any(Number))
    sound.stop()
    expect(context.gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0)
    expect(context.sources[0].disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    sound.trigger('apparition')
    expect(context.sources).toHaveLength(1)
    sound.start()
    sound.start()
    expect(vi.getTimerCount()).toBe(1)
    sound.trigger('apparition')
    expect(context.sources).toHaveLength(2)
    sound.dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(context.sources[1].disconnect).toHaveBeenCalledOnce()
  })

  it('does not resume an old cue after unmuting', () => {
    const { sound, context } = setup()
    sound.start()
    sound.trigger('apparition')
    sound.setMuted(true)
    expect(context.sources[0].disconnect).toHaveBeenCalledOnce()
    sound.setMuted(false)
    expect(context.sources).toHaveLength(1)
    sound.dispose()
  })

  it('clears suspended voices and skips ambience while another voice is active', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.start()
    sound.trigger('apparition')
    vi.advanceTimersByTime(8000)
    expect(context.sources).toHaveLength(1)
    context.state = 'suspended'
    context.listeners.forEach((listener) => listener())
    expect(context.sources[0].stop).toHaveBeenCalledTimes(2)
    expect(context.sources[0].disconnect).toHaveBeenCalledOnce()
    context.state = 'running'
    context.listeners.forEach((listener) => listener())
    expect(context.sources).toHaveLength(1)
    sound.dispose()
    expect(context.listeners.size).toBe(0)
  })

  it('uses a bounded pulse envelope for the rattle and disconnects its panner', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.start()
    sound.trigger('rattle')
    const ramps = context.gains[1].gain.linearRampToValueAtTime.mock.calls
    expect(ramps.length).toBeGreaterThan(3)
    expect(Math.max(...ramps.map(([value]) => value as number))).toBeLessThanOrEqual(0.16)
    expect(context.panners[0].pan.setValueAtTime).toHaveBeenCalledWith(-0.4, 0)
    expect(context.panners[0].pan.linearRampToValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.14), 1.2)
    expect(ramps[0][1]).toBeGreaterThanOrEqual(0.08)
    expect(ramps.every(([value, time], index) => value >= 0 && (index === 0 || time > ramps[index - 1][1]))).toBe(true)
    sound.stop()
    expect(context.panners[0].disconnect).toHaveBeenCalledOnce()
  })

  it('varies ambience without consecutive identical types and offsets looping noise', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.start()
    vi.advanceTimersByTime(8000)
    expect(context.sources[0].start).toHaveBeenCalledWith(0, 0)
    context.sources[0].onended?.()
    vi.advanceTimersByTime(8000)
    expect(context.sources[1].type).toBe('triangle')
    context.sources[1].onended?.()
    vi.advanceTimersByTime(8000)
    expect(context.filters).toHaveLength(2)
    sound.dispose()
  })

  it('varies cue pitch and direction while retaining bounded envelopes', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.start()
    sound.trigger('apparition')
    expect(context.filters[0].frequency.setValueAtTime).toHaveBeenCalledWith(648, 0)
    expect(context.filters[0].Q.setValueAtTime).toHaveBeenCalledWith(0.7, 0)
    expect(context.sources[0].playbackRate.setValueAtTime).toHaveBeenCalledWith(0.85, 0)
    expect(context.panners[0].pan.setValueAtTime).toHaveBeenCalledWith(-0.4, 0)
    context.sources[0].onended?.()
    context.currentTime = 3
    random.mockReturnValue(0.99)
    sound.trigger('apparition')
    expect(context.filters[1].frequency.setValueAtTime).toHaveBeenCalledWith(720 * 1.098, 3)
    expect(context.sources[1].playbackRate.setValueAtTime).toHaveBeenCalledWith(0.85 + 0.99 * 0.3, 3)
    expect(context.sources[1].start).toHaveBeenCalledWith(3, 1.98)
    expect(context.panners[1].pan.setValueAtTime).toHaveBeenCalledWith(0.4, 3)
    sound.dispose()
  })

  it('shapes a bounded friction buffer without extra audio sources', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    expect(context.samples.every((value) => Number.isFinite(value) && Math.abs(value) <= 0.5)).toBe(true)
    expect(Math.abs(context.samples[0])).toBeGreaterThan(Math.abs(context.samples[context.samples.length - 1]))
    expect(context.samples[context.samples.length - 1]).toBeCloseTo(-0.25)
    sound.start()
    sound.trigger('apparition')
    expect(context.sources).toHaveLength(1)
    expect(context.sources[0].buffer?.getChannelData(0)).toBe(context.samples)
    sound.dispose()
  })

  it('keeps ambience and a cue below the voice cap during a fifteen-minute burst', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.setVolume(1)
    sound.start()
    vi.advanceTimersByTime(8000)
    for (let second = 8; second < 900; second++) {
      context.currentTime = second
      sound.trigger('rattle')
      vi.advanceTimersByTime(1000)
      expect(context.sources.filter((source) => source.onended !== null).length).toBeLessThanOrEqual(4)
    }
    expect(context.sources).toHaveLength(2)
    sound.stop()
    expect(context.sources.every((source) => source.onended === null)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    sound.dispose()
  })

  it.each(['apparition', 'blackout', 'rattle'] as const)(
    'releases every node for %s on mute, stop and dispose',
    (kind) => {
      const { sound, context } = setup()
      sound.start()
      sound.trigger(kind)
      const ended = context.sources[0].onended
      sound.setMuted(true)
      ended?.()
      sound.setMuted(false)
      context.currentTime = 4
      sound.trigger(kind)
      sound.stop()
      sound.start()
      sound.trigger(kind)
      context.sources[2].stop.mockImplementation(() => {
        throw new Error('already stopped')
      })
      sound.dispose()
      sound.dispose()
      for (const node of [...context.sources, ...context.filters, ...context.gains, ...context.panners]) {
        expect(node.disconnect).toHaveBeenCalledOnce()
      }
      expect(context.sources.every((source) => source.onended === null)).toBe(true)
      expect(context.listeners.size).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it('varies rattle timing without raising its envelope or shortening the attack', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    const { sound, context } = setup()
    sound.start()
    sound.trigger('rattle')
    const first = context.gains[1].gain.linearRampToValueAtTime.mock.calls
    context.sources[0].onended?.()
    context.currentTime = 3
    random.mockReturnValue(0.99)
    sound.trigger('rattle')
    const second = context.gains[2].gain.linearRampToValueAtTime.mock.calls
    expect(second.map(([value]) => value)).toEqual(first.map(([value]) => value))
    expect(second[0][1] - 3).toBeGreaterThan(first[0][1])
    expect(second[0][1] - 3).toBeGreaterThanOrEqual(0.08)
    expect(context.filters[1].Q.setValueAtTime).toHaveBeenCalledWith(1.4, 3)
    sound.dispose()
  })
})
