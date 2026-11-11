import { describe, expect, test, vi } from 'vitest'
import { LOOPS, SFX, THEMES, type SfxName } from '../src/audio/api'
import { createAudio } from '../src/audio/index'
import { SFX_DEFS, startLoop } from '../src/audio/sfx'
import { SFX_TRIM } from '../src/audio/sfx-trim'

/** A stand-in for any Web Audio object: every property is a function/param that returns another stand-in. */
function fake(): unknown {
  const target = function () {}
  const proxy: unknown = new Proxy(target, {
    get: (_t, key) => {
      if (key === 'currentTime') return 0
      if (key === 'sampleRate') return 44100
      if (key === 'value') return 0
      if (key === Symbol.toPrimitive) return () => 0
      return proxy
    },
    set: () => true,
    apply: () => proxy
  })
  return proxy
}

describe('sound effects', () => {
  test('every SfxName has a definition with sane limits', () => {
    for (const name of SFX) {
      const def = SFX_DEFS[name]
      expect(def, name).toBeDefined()
      expect(def.limit, name).toBeGreaterThanOrEqual(1)
      expect(def.cd, name).toBeGreaterThanOrEqual(0)
      expect(def.g, name).toBeGreaterThan(0)
      expect(typeof def.play, name).toBe('function')
    }
    expect(Object.keys(SFX_DEFS).sort()).toEqual([...SFX].sort())
    expect(new Set(SFX).size, 'duplicate effect names').toBe(SFX.length)
  })

  test('trims only name real effects and stay in a sane range', () => {
    for (const [name, k] of Object.entries(SFX_TRIM)) {
      expect(SFX.includes(name as SfxName), name).toBe(true)
      expect(k).toBeGreaterThan(0.05)
      expect(k).toBeLessThan(20)
    }
  })

  test('every LoopName can be built, updated and stopped', () => {
    vi.useFakeTimers()
    const mixer = { ctx: fake(), sfx: fake() } as never
    for (const name of LOOPS) {
      const handle = startLoop(mixer, fake() as AudioBuffer, name)
      handle.update({ pan: 0.5, volume: 0.4, progress: 0.7 })
      handle.stop()
      handle.update({ progress: 1 })
      handle.stop()
    }
    vi.runAllTimers()
    vi.useRealTimers()
  })
})

describe('createAudio without a Web Audio context', () => {
  test('is safe before unlock and in Node', () => {
    const audio = createAudio()
    for (const theme of THEMES) audio.setMusic(theme, 2)
    audio.setMusic(null)
    for (const name of SFX) audio.sfx(name, { pan: 2, volume: -1, pitch: Number.NaN })
    for (const name of LOOPS) {
      audio.loop('a', name, { progress: 0.5 })
      audio.loop('a', null)
    }
    audio.setVolume('master', 5)
    audio.setVolume('music', Number.NaN)
    audio.setVolume('sfx', -3)
    audio.setDuck(9)
    audio.unlock()
    audio.unlock()
    audio.setMuted(true)
    expect(audio.muted).toBe(true)
    audio.setMuted(false)
    expect(audio.muted).toBe(false)
    audio.dispose()
    audio.sfx('bite')
    audio.setMusic('title')
  })
})
