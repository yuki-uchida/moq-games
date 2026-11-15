import { describe, expect, test, vi } from 'vitest'
import { LOOPS, SFX, THEMES, type SfxName } from '../src/audio/api'
import { AudioEngine, KEPT_PLAYERS } from '../src/audio/engine'
import { createAudio } from '../src/audio/index'
import { SFX_DEFS, startLoop } from '../src/audio/sfx'
import { SFX_TRIM } from '../src/audio/sfx-trim'
import { recordingContext } from './audio-fakes'

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

describe('the players the engine keeps', () => {
  const noise = { duration: 2 } as AudioBuffer
  function live() {
    const rec = recordingContext()
    const engine = new AudioEngine(rec.ctx, true, null, { mixer: rec.mixer(), noise })
    return { rec, engine }
  }
  const into = (lines: string[]) => lines.map((line) => line.replace(/gain\d+/, 'gain'))
  const ON = ['connect gain>music', 'connect gain>musicReverb', 'connect gain>chorus']

  /** The context's clock and the page's timers move together, a scheduler's tick at a time. */
  function play(rec: ReturnType<typeof recordingContext>, from: number, to: number) {
    for (let t = from; t < to - 1e-9; t += 0.04) {
      rec.at(t + 0.04)
      vi.advanceTimersByTime(40)
    }
  }
  /** Fake timers, and no loosening of the notes' times: two passes of a song schedule the same notes. */
  function steady() {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  }
  function unsteady() {
    vi.restoreAllMocks()
    vi.useRealTimers()
  }

  test('a theme that comes back starts again on the player it had: nothing is built but notes', () => {
    steady()
    const { rec, engine } = live()
    try {
      const mixed = rec.log.length
      engine.setMusic('meadow')
      // Its player's parts are built in the call; the racks of its notes as they are scheduled.
      const parts = rec.kept(mixed).length
      expect(parts).toBeGreaterThan(20)
      play(rec, 0, 10)
      expect(rec.kept(mixed).length).toBeGreaterThan(100)
      // The boss comes: the world's theme fades and is put away once it is off the mixer.
      const boss = rec.log.length
      engine.setMusic('boss')
      const bossParts = rec.kept(boss).length
      expect(bossParts).toBeGreaterThan(20)
      expect(engine.keptThemes).toEqual([])
      play(rec, 10, 11.4)
      expect(engine.keptThemes).toEqual([])
      play(rec, 11.4, 11.6)
      expect(engine.keptThemes).toEqual(['meadow'])
      // He falls ten seconds later: silence, and his theme is put away too.
      play(rec, 11.6, 20)
      engine.setMusic(null)
      play(rec, 20, 21.2)
      expect(engine.keptThemes).toEqual(['meadow', 'boss'])
      play(rec, 21.2, 26)
      // The world's theme returns: its player is taken, started and connected. The call builds nothing, and the
      // four seconds after it build notes on the racks there are (a rack more where two notes fall closer together
      // than the first time, never the parts again).
      const from = rec.log.length
      engine.setMusic('meadow')
      expect(rec.made(from)).toEqual([])
      expect(engine.keptThemes).toEqual(['boss'])
      play(rec, 26, 30.5)
      expect(rec.sources(from).length).toBeGreaterThan(50)
      expect(rec.kept(from).length).toBeLessThan(parts / 2)
      expect(into(rec.wiring(from))).toEqual(ON)
      // And his theme on another try, while the world's fades again on the racks it has.
      const again = rec.log.length
      engine.setMusic('boss')
      expect(rec.made(again)).toEqual([])
      expect(engine.keptThemes).toEqual([])
      play(rec, 30.5, 34.5)
      expect(rec.sources(again).length).toBeGreaterThan(50)
      expect(rec.kept(again).length).toBeLessThan(bossParts / 2)
      expect(engine.keptThemes).toEqual(['meadow'])
    } finally {
      engine.dispose()
      unsteady()
    }
  })

  test('a player whose notes still ring is left where it is, and a new one is built as before', () => {
    steady()
    const { rec, engine } = live()
    try {
      engine.setMusic('meadow')
      play(rec, 0, 2)
      engine.setMusic('boss')
      play(rec, 2, 3.6)
      expect(engine.keptThemes).toEqual(['meadow'])
      // The last notes of the world's theme have not rung out: it is not started again.
      const from = rec.log.length
      engine.setMusic('meadow')
      expect(rec.kept(from).length).toBeGreaterThan(20)
      expect(engine.keptThemes).toEqual(['meadow'])
      play(rec, 3.6, 5.2)
      expect(engine.keptThemes).toEqual(['meadow', 'boss'])
      // The newer player of the theme takes the older one's place when it is put away in turn.
      engine.setMusic('story')
      play(rec, 5.2, 6.8)
      expect(engine.keptThemes).toEqual(['boss', 'meadow'])
    } finally {
      engine.dispose()
      unsteady()
    }
  })

  test('keeps the newest few and lets the oldest go', () => {
    steady()
    const { rec, engine } = live()
    try {
      const themes = ['title', 'select', 'story', 'meadow', 'boss', 'clear', 'night', 'cave'] as const
      expect(themes.length).toBeGreaterThan(KEPT_PLAYERS + 1)
      themes.forEach((theme, i) => {
        engine.setMusic(theme)
        play(rec, i * 2, i * 2 + 2)
      })
      // The one sounding now is not put away; of the seven before it the newest five are.
      expect(engine.keptThemes).toEqual(themes.slice(-1 - KEPT_PLAYERS, -1))
    } finally {
      engine.dispose()
      unsteady()
    }
  })

  test('the players asked for ahead are the last to go', () => {
    steady()
    const { rec, engine } = live()
    try {
      // A stage's story opens from the select, which opened from the title: three themes within a second or two.
      engine.setMusic('title')
      play(rec, 0, 1)
      engine.setMusic('select')
      play(rec, 1, 2)
      engine.setMusic('story')
      const wanted = ['meadow', 'clear', 'gameover', 'boss'] as const
      engine.wantMusic(wanted)
      for (const theme of wanted) expect(engine.prepareMusic(theme)).toBe(true)
      expect(engine.keptThemes).toEqual(wanted)
      // The title's and the select's players come off the mixer after those were built: of the two, one has room.
      play(rec, 2, 5)
      expect(engine.keptThemes).toEqual(['meadow', 'clear', 'gameover', 'boss', 'select'])
      // The stage begins on the player built ahead, and the story's has the room that one left.
      const start = rec.log.length
      engine.setMusic('meadow')
      expect(rec.made(start)).toEqual([])
      play(rec, 5, 7)
      expect(engine.keptThemes).toEqual(['clear', 'gameover', 'boss', 'select', 'story'])
      // Another stage's themes are asked for: the ones no longer wanted go before the new ones.
      engine.wantMusic(['night', 'clear', 'gameover', 'finalBoss'])
      expect(engine.prepareMusic('night')).toBe(true)
      expect(engine.prepareMusic('finalBoss')).toBe(true)
      expect(engine.keptThemes).toEqual(['clear', 'gameover', 'story', 'night', 'finalBoss'])
    } finally {
      engine.dispose()
      unsteady()
    }
  })

  test('builds a player ahead, off the mixer, and starts that one when its theme is asked for', () => {
    vi.useFakeTimers()
    const { rec, engine } = live()
    try {
      engine.setMusic('story')
      play(rec, 0, 0.2)
      const from = rec.log.length
      expect(engine.prepareMusic('meadow')).toBe(true)
      expect(engine.prepareMusic('clear')).toBe(true)
      const built = rec.kept(from).length
      expect(built).toBeGreaterThan(30)
      expect(rec.sources(from)).toEqual([])
      expect(rec.wiring(from)).toEqual([])
      expect(engine.keptThemes).toEqual(['meadow', 'clear'])
      // Asked for again, or for the theme that sounds now: there is one, and nothing more is built.
      expect(engine.prepareMusic('meadow')).toBe(true)
      expect(engine.prepareMusic('story')).toBe(true)
      expect(rec.kept(from)).toHaveLength(built)
      // The stage begins: its theme's player is the one built ahead.
      const start = rec.log.length
      engine.setMusic('meadow')
      expect(rec.kept(start)).toEqual([])
      expect(into(rec.wiring(start))).toEqual(ON)
      expect(engine.keptThemes).toEqual(['clear'])
    } finally {
      engine.dispose()
      vi.useRealTimers()
    }
  })

  test('builds the racks of a player built ahead a few milliseconds at a time, and its first notes make only sources', () => {
    steady()
    const { rec, engine } = live()
    try {
      // Nothing to build for a theme that has no player put away.
      expect(engine.primeMusic('meadow', 3)).toBe(false)
      expect(engine.prepareMusic('meadow')).toBe(true)
      const from = rec.log.length
      let slices = 1
      while (engine.primeMusic('meadow', 3)) slices += 1
      expect(slices).toBeGreaterThanOrEqual(1)
      const racks = rec.kept(from).length
      expect(racks).toBeGreaterThan(60)
      expect(rec.sources(from)).toEqual(['osc'])
      expect(rec.wiring(from)).toEqual([])
      expect(engine.primeMusic('meadow', 3)).toBe(false)
      // The stage begins: four seconds of its theme build few nodes besides the notes' sources.
      const start = rec.log.length
      engine.setMusic('meadow')
      play(rec, 0, 4)
      expect(rec.sources(start).length).toBeGreaterThan(50)
      expect(rec.kept(start).length).toBeLessThan(racks / 5)
    } finally {
      engine.dispose()
      unsteady()
    }
  })

  test('builds nothing ahead that would not be heard, nothing offline, and keeps nothing once it is disposed of', () => {
    vi.useFakeTimers()
    const { rec, engine } = live()
    const offline = new AudioEngine(rec.ctx, false, null, { mixer: rec.mixer(), noise })
    try {
      const from = rec.log.length
      engine.setMuted(true)
      expect(engine.prepareMusic('boss')).toBe(false)
      engine.setMuted(false)
      engine.setVolume('music', 0)
      expect(engine.prepareMusic('boss')).toBe(false)
      expect(offline.prepareMusic('boss')).toBe(false)
      expect(rec.kept(from)).toEqual([])
      expect(engine.keptThemes).toEqual([])
      engine.setVolume('music', 0.7)
      engine.setMusic('meadow', 0, 0.05)
      engine.setMusic('boss', 0, 0.1)
      engine.dispose()
      vi.advanceTimersByTime(3000)
      expect(engine.keptThemes).toEqual([])
      expect(engine.prepareMusic('clear')).toBe(false)
    } finally {
      engine.dispose()
      offline.dispose()
      vi.useRealTimers()
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
