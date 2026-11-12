import { describe, expect, test, vi } from 'vitest'
import { LOOPS, SFX, THEMES, type SfxName } from '../src/audio/api'
import { createAudio } from '../src/audio/index'
import { MusicPlayer, compiledSong } from '../src/audio/music'
import { SfxBuilder, type SfxDef } from '../src/audio/sfx-builder'
import { SFX_DEFS, pendingSfx, startLoop } from '../src/audio/sfx'
import { SFX_TRIM } from '../src/audio/sfx-trim'
import { LOOP_DEFS } from '../src/audio/sfx/loops'
import { SONGS } from '../src/audio/songs'

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
  test('every SfxName has a design with sane limits (no stand-ins left)', () => {
    expect(pendingSfx()).toEqual([])
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

  test('every effect plays on a stand-in Web Audio graph and schedules a finite, non-empty tail', () => {
    for (const name of SFX) {
      const def: SfxDef = SFX_DEFS[name]
      const b = new SfxBuilder(
        fake() as BaseAudioContext,
        fake() as AudioBuffer,
        { sfx: fake(), sfxReverb: fake() } as never,
        0,
        1,
        1,
        0,
        0.1
      )
      expect(() => def.play(b), name).not.toThrow()
      expect(Number.isFinite(b.end), `${name} tail`).toBe(true)
      expect(b.end, `${name} tail`).toBeGreaterThan(0.02)
      expect(b.end, `${name} tail`).toBeLessThan(4)
    }
  })

  test('trims only name real effects and stay in a sane range', () => {
    for (const [name, k] of Object.entries(SFX_TRIM)) {
      expect(SFX.includes(name as SfxName), name).toBe(true)
      expect(k).toBeGreaterThan(0.05)
      expect(k).toBeLessThan(40)
    }
  })

  test('every LoopName has a recipe and can be built, updated and stopped', () => {
    vi.useFakeTimers()
    const mixer = { ctx: fake(), sfx: fake() } as never
    for (const name of LOOPS) {
      expect(LOOP_DEFS[name], `${name} has no recipe`).toBeDefined()
      expect(LOOP_DEFS[name]!.level, name).toBeGreaterThan(0)
      const handle = startLoop(mixer, fake() as AudioBuffer, name)
      handle.update({ pan: 0.5, volume: 0.4, progress: 0.7, pitch: 1.2 })
      handle.update({ pan: Number.NaN, volume: Number.NaN, progress: Number.NaN, pitch: Number.NaN })
      handle.stop()
      handle.update({ progress: 1 })
      handle.stop()
    }
    vi.runAllTimers()
    vi.useRealTimers()
  })
})

describe('music playback', () => {
  test('every theme schedules notes on a stand-in graph without throwing, at every layer', () => {
    const mixer = {
      ctx: fake(),
      music: fake(),
      musicReverb: fake(),
      chorus: fake()
    } as never
    for (const theme of THEMES) {
      for (const layer of [0, 1, 2]) {
        const player = new MusicPlayer(mixer, fake() as AudioBuffer, SONGS[theme], layer, 0, false)
        const c = compiledSong(SONGS[theme])
        expect(() => player.pump(Math.min(c.seconds, 20) + 1), `${theme} layer ${layer}`).not.toThrow()
        expect(() => player.setLayer((layer + 1) % 3)).not.toThrow()
      }
    }
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
    audio.setDuck(Number.NaN)
    audio.unlock()
    audio.unlock()
    audio.setMuted(true)
    expect(audio.muted).toBe(true)
    audio.setMuted(false)
    expect(audio.muted).toBe(false)
    audio.dispose()
    audio.sfx('claw')
    audio.loop('b', 'eel')
    audio.setMusic('title')
  })
})
