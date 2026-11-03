import { afterEach, describe, expect, it, vi } from 'vitest'
import { WEAPONS } from '../src/data'
import { LifeAudio, hasFireRecipe, type SfxName } from '../src/audio'

const param = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn()
})
const node = (extra: object = {}) => ({ connect: vi.fn((n: unknown) => n), disconnect: vi.fn(), ...extra })

class Context {
  state = 'running'
  currentTime = 0
  sampleRate = 8000
  destination = node()
  oscillators: ReturnType<Context['createOscillator']>[] = []
  sources = 0
  resume = vi.fn(() => Promise.resolve())
  close = vi.fn(() => Promise.resolve())
  createGain() {
    return node({ gain: param() })
  }
  createOscillator() {
    const o = node({ type: 'sine', frequency: param(), start: vi.fn(), stop: vi.fn(), onended: null })
    this.oscillators.push(o)
    return o
  }
  createBufferSource() {
    this.sources++
    return node({ buffer: null, start: vi.fn(), stop: vi.fn(), onended: null })
  }
  createBiquadFilter() {
    return node({ type: 'lowpass', frequency: param(), Q: param() })
  }
  createDynamicsCompressor() {
    return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() })
  }
  createStereoPanner() {
    return node({ pan: param() })
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length)
    return { getChannelData: () => data }
  }
}

const memory = () => {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value)
  }
}

const setup = (storage = memory()) => {
  const context = new Context()
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return context
    })
  )
  const audio = new LifeAudio(storage)
  audio.unlock()
  return { audio, context, storage }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const NAMES: SfxName[] = [
  'hit',
  'hitStrong',
  'crit',
  'kill',
  'killElite',
  'blast',
  'enemyShot',
  'windup',
  'hurt',
  'down',
  'revive',
  'gem',
  'meal',
  'magnet',
  'chest',
  'levelUp',
  'cardOpen',
  'cardHover',
  'cardPick',
  'evolve',
  'stage',
  'swarm',
  'elite',
  'bossWarn',
  'bossKill',
  'reaper',
  'won',
  'lost',
  'start'
]
const NEW_IDS = [
  'w_sns',
  'w_pet',
  'w_muscle',
  'w_reading',
  'w_overtime',
  'w_ring',
  'w_karaoke',
  'w_travel',
  'w_savings',
  'w_gamble',
  'w_perfume',
  'w_cooking'
]
const WEAPON_IDS = [...new Set([...WEAPONS.map((w) => w.id), ...NEW_IDS])]

describe('LifeAudio', () => {
  it.each(NAMES)('plays %s and creates voices', (name) => {
    const { audio, context } = setup()
    expect(() => audio.play(name, { pan: 0.5, gain: 0.8, rate: 1.1 })).not.toThrow()
    expect(context.oscillators.length + context.sources).toBeGreaterThan(0)
  })

  it.each(WEAPON_IDS)('has a fire recipe for %s', (id) => {
    expect(hasFireRecipe(id)).toBe(true)
    const { audio, context } = setup()
    audio.fire(id)
    const n = context.oscillators.length + context.sources
    if (id === 'p_gone') expect(n).toBe(0)
    else expect(n).toBeGreaterThan(0)
  })

  it('evolved fire is richer; unknown ids use a generic whoosh', () => {
    const a = setup()
    a.audio.fire('w_love')
    const b = setup()
    b.audio.fire('w_love', { evolved: true })
    expect(b.context.oscillators.length).toBeGreaterThan(a.context.oscillators.length)
    const c = setup()
    expect(hasFireRecipe('nope')).toBe(false)
    c.audio.fire('nope')
    expect(c.context.sources).toBe(1)
  })

  it('is silent when muted, locked or suspended', () => {
    const { audio, context } = setup()
    audio.setMuted(true)
    audio.play('kill')
    audio.fire('w_love')
    expect(context.oscillators.length + context.sources).toBe(0)
    audio.setMuted(false)
    context.state = 'suspended'
    audio.play('kill')
    expect(context.oscillators.length).toBe(0)
    const locked = new LifeAudio(memory())
    expect(() => locked.play('kill')).not.toThrow()
  })

  it('persists and clamps volume and mute', () => {
    const { audio, storage } = setup()
    audio.setVolume(5)
    expect(audio.volume).toBe(1)
    audio.setVolume(-1)
    expect(audio.volume).toBe(0)
    audio.setVolume(0.4)
    audio.setMuted(true)
    const again = new LifeAudio(storage)
    expect(again.volume).toBe(0.4)
    expect(again.muted).toBe(true)
    expect(JSON.parse(storage.getItem('life-survivors:sound') ?? '{}')).toEqual({ muted: true, volume: 0.4 })
  })

  it('limits spam for same-instant plays', () => {
    const { audio, context } = setup()
    for (let i = 0; i < 100; i++) audio.play('hit')
    expect(context.oscillators.length).toBeLessThanOrEqual(2)
    const fires = setup()
    for (let i = 0; i < 50; i++) fires.audio.fire('w_love')
    expect(fires.context.oscillators.length).toBe(2)
    const kills = setup()
    for (let i = 0; i < 100; i++) {
      kills.context.currentTime = i * 0.001
      kills.audio.play('kill')
    }
    // minimum interval 22 ms over 0.1 s: only a handful
    expect(kills.context.oscillators.length / 2).toBeLessThanOrEqual(5)
  })

  it('caps concurrent voices globally', () => {
    const { audio, context } = setup()
    const names = NAMES.filter((n) => n !== 'gem')
    for (let i = 0; i < 200; i++) {
      context.currentTime = i * 0.001
      audio.play(names[i % names.length])
      audio.fire(WEAPON_IDS[i % WEAPON_IDS.length])
    }
    expect(context.oscillators.length).toBeLessThan(400)
  })

  it('steps the gem pickup up a pentatonic scale and resets after a pause', () => {
    const { audio, context } = setup()
    const pitches: number[] = []
    const pitch = () => {
      const o = context.oscillators[context.oscillators.length - 2]
      return o.frequency.setValueAtTime.mock.calls[0][0] as number
    }
    for (let i = 0; i < 5; i++) {
      context.currentTime = i * 0.1
      audio.play('gem')
      pitches.push(pitch())
    }
    for (let i = 1; i < pitches.length; i++) expect(pitches[i]).toBeGreaterThan(pitches[i - 1])
    context.currentTime = 5
    audio.play('gem')
    expect(pitch()).toBeCloseTo(pitches[0])
  })

  it('heartbeat starts and stops without leaking timers', () => {
    vi.useFakeTimers()
    const { audio, context } = setup()
    audio.setHeartbeat(0.5)
    expect(vi.getTimerCount()).toBe(1)
    audio.setHeartbeat(0.9)
    expect(vi.getTimerCount()).toBe(1)
    const before = context.oscillators.length
    expect(before).toBeGreaterThan(0)
    context.currentTime = 1
    vi.advanceTimersByTime(700)
    expect(context.oscillators.length).toBeGreaterThan(before)
    audio.setHeartbeat(0)
    expect(vi.getTimerCount()).toBe(0)
    audio.setHeartbeat(1)
    audio.dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(context.close).toHaveBeenCalled()
  })

  it('heartbeat respects mute', () => {
    vi.useFakeTimers()
    const { audio, context } = setup()
    audio.setMuted(true)
    audio.setHeartbeat(1)
    expect(context.oscillators.length).toBe(0)
    audio.setHeartbeat(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resumes a suspended or iOS-interrupted context from a gesture and opens the output', () => {
    const { audio, context } = setup()
    expect(context.resume).not.toHaveBeenCalled()
    for (const state of ['suspended', 'interrupted']) {
      context.state = state
      const sources = context.sources
      audio.unlock()
      expect(context.sources).toBe(sources + 1)
    }
    expect(context.resume).toHaveBeenCalledTimes(2)
    context.state = 'closed'
    audio.unlock()
    expect(context.resume).toHaveBeenCalledTimes(2)
  })

  it('asks iOS for a playback session so the silent switch does not mute the game', () => {
    const session = { type: 'auto' }
    vi.stubGlobal('navigator', { audioSession: session })
    setup()
    expect(session.type).toBe('playback')
  })

  it('never throws without an AudioContext', () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    const audio = new LifeAudio(memory())
    expect(() => {
      audio.unlock()
      for (const n of NAMES) audio.play(n)
      audio.fire('w_love', { evolved: true })
      audio.setHeartbeat(0.5)
      audio.setHeartbeat(0)
      audio.dispose()
    }).not.toThrow()
  })
})
