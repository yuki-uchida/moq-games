import { afterEach, describe, expect, it, vi } from 'vitest'
import { STAGES } from '../src/data'
import { LifeAudio } from '../src/audio'
import { SONGS, type ThemeName } from '../src/songs'
import {
  DRUM_KEYS,
  MusicPlayer,
  STAGE_MUSIC,
  arpNote,
  bassNote,
  chordVoicing,
  musicCue,
  parseChord,
  parseMml,
  songFor,
  swingOffset,
  transition,
  type MusicSituation
} from '../src/music'

/* ------------------------------------------------------------------------------------- fake Web Audio */

const param = (targets: number[]) => ({
  value: 1,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn((value: number) => void targets.push(value)),
  cancelScheduledValues: vi.fn()
})
const node = (extra: object = {}) => ({ connect: vi.fn((n: unknown) => n), disconnect: vi.fn(), ...extra })

class Context {
  state = 'running'
  currentTime = 0
  sampleRate = 8000
  destination = node()
  /** Start times of every oscillator and noise burst. */
  starts: number[] = []
  /** Values passed to setTargetAtTime (fades, ducks, muffle). */
  targets: number[] = []
  resume = vi.fn(() => Promise.resolve())
  close = vi.fn(() => Promise.resolve())
  private source() {
    return node({
      start: vi.fn((at: number) => void this.starts.push(at)),
      stop: vi.fn(),
      onended: null
    })
  }
  createGain() {
    return node({ gain: param(this.targets) })
  }
  createOscillator() {
    return { ...this.source(), type: 'sine', frequency: param(this.targets) }
  }
  createBufferSource() {
    return { ...this.source(), buffer: null }
  }
  createBiquadFilter() {
    return node({ type: 'lowpass', frequency: param(this.targets), Q: param(this.targets) })
  }
  createDynamicsCompressor() {
    return node({
      threshold: param(this.targets),
      knee: param(this.targets),
      ratio: param(this.targets),
      attack: param(this.targets),
      release: param(this.targets)
    })
  }
  createStereoPanner() {
    return node({ pan: param(this.targets) })
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length)
    return { getChannelData: () => data }
  }
}

const memory = (initial?: object) => {
  const map = new Map<string, string>()
  if (initial) map.set('life-survivors:sound', JSON.stringify(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value)
  }
}

const player = () => {
  vi.useFakeTimers()
  const context = new Context()
  const music = new MusicPlayer(context as unknown as AudioContext, node() as unknown as AudioNode, null)
  return { music, context }
}

/** Moves the fake audio clock and lets the scheduler tick. */
const advance = (context: Context, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.06) {
    context.currentTime += 0.06
    vi.advanceTimersByTime(60)
  }
}

const withAudio = (storage = memory()) => {
  vi.useFakeTimers()
  const context = new Context()
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return context
    })
  )
  return { audio: new LifeAudio(storage), context, storage }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const THEMES = Object.keys(SONGS) as ThemeName[]

/* ------------------------------------------------------------------------------------------- notation */

describe('MML', () => {
  it('reads notes, lengths, octaves, accidentals, dots, ties, rests and bar lines', () => {
    const parsed = parseMml('o4 c4 d8 e+8 | <b-2. ^8 r8 l16 >c d')
    expect(parsed.notes).toEqual([
      { step: 0, midi: 60, len: 4 },
      { step: 4, midi: 62, len: 2 },
      { step: 6, midi: 65, len: 2 },
      { step: 8, midi: 58, len: 14 },
      { step: 24, midi: 60, len: 1 },
      { step: 25, midi: 62, len: 1 }
    ])
    expect(parsed.length).toBe(26)
    expect(parsed.bars).toEqual([8])
  })

  it('rejects typos instead of playing garbage', () => {
    expect(() => parseMml('c3')).toThrow()
    expect(() => parseMml('o4 c4 x4')).toThrow()
    expect(() => parseMml('o c4')).toThrow()
  })
})

describe('chords', () => {
  it('parses roots, accidentals, qualities, slash basses and transposition', () => {
    expect(parseChord('Bbm7')).toEqual({ root: 10, bass: 10, intervals: [0, 3, 7, 10] })
    expect(parseChord('F#dim').root).toBe(6)
    expect(parseChord('C/E').bass).toBe(4)
    expect(parseChord('C', 5).root).toBe(5)
    expect(parseChord('B7', 2).root).toBe(1)
    expect(() => parseChord('Cxyz')).toThrow()
    expect(() => parseChord('H')).toThrow()
  })

  it('voices chords closely, bass degrees from the root and arpeggios upward', () => {
    expect(chordVoicing(parseChord('C'), 3)).toEqual([55, 60, 64])
    expect(chordVoicing(parseChord('F'), 3)).toEqual([53, 57, 60])
    expect(chordVoicing(parseChord('E'), 2, true)).toEqual([40, 47, 52])
    const am = parseChord('Am')
    expect(['1', '3', '5', '6', '8'].map((d) => bassNote(am, 2, d))).toEqual([45, 48, 52, 54, 57])
    expect(bassNote(parseChord('Bdim'), 2, '5')).toBe(bassNote(parseChord('Bdim'), 2, '1') + 6)
    expect(bassNote(parseChord('CM7'), 2, '7')).toBe(bassNote(parseChord('CM7'), 2, '1') + 11)
    expect([0, 1, 2, 3, 4].map((i) => arpNote(parseChord('C'), 4, i))).toEqual([60, 64, 67, 72, 76])
  })
})

/* ---------------------------------------------------------------------------------------------- scores */

describe('songs', () => {
  it.each(THEMES)('%s compiles into whole bars that loop cleanly', (theme) => {
    const song = songFor(theme)
    const transpose = song.def.transpose ?? 0
    expect(song.length % song.bar).toBe(0)
    for (const part of song.parts) {
      const def = part.def
      expect(part.period).toBeGreaterThan(0)
      expect(song.length % part.period).toBe(0)
      if ('mml' in def) {
        const parsed = parseMml(def.mml)
        for (const bar of parsed.bars) expect(bar % song.bar).toBe(0)
        for (const note of parsed.notes) {
          const midi = note.midi + transpose + (def.shift ?? 0)
          expect(midi).toBeGreaterThanOrEqual(33)
          expect(midi).toBeLessThanOrEqual(100)
        }
        continue
      }
      const valid =
        'drums' in def ? DRUM_KEYS : 'bass' in def ? [...'12345678'] : 'arp' in def ? [...'0123456789'] : ['x']
      for (const hit of part.hits ?? []) if (hit) expect(valid).toContain(hit.ch.toLowerCase())
    }
  })

  it('the bass sits under the chords and every chord fits one octave', () => {
    for (const theme of THEMES) {
      const song = songFor(theme)
      for (const chord of song.chordAt) {
        const notes = chordVoicing(chord, 3)
        expect(Math.max(...notes) - Math.min(...notes)).toBeLessThan(12)
        expect(bassNote(chord, 2, '1')).toBeLessThan(Math.min(...notes))
      }
    }
  })
})

/* -------------------------------------------------------------------------------------------- choosing */

describe('musicCue', () => {
  const at = (s: Partial<MusicSituation>) =>
    musicCue({ started: true, phase: 'playing', stage: 0, boss: false, resultShown: false, ...s })

  it('has a theme for every life stage, and every theme is used somewhere', () => {
    expect(STAGE_MUSIC).toHaveLength(STAGES.length)
    const used = new Set<ThemeName>(STAGE_MUSIC.map((cue) => cue.theme))
    used.add(at({ started: false })!.theme)
    used.add(at({ boss: true })!.theme)
    used.add(at({ phase: 'reaper' })!.theme)
    used.add(at({ phase: 'won', resultShown: true })!.theme)
    used.add(at({ phase: 'lost', resultShown: true })!.theme)
    expect([...used].sort()).toEqual([...THEMES].sort())
  })

  it('follows the stages and their layers', () => {
    expect(at({ stage: 0 })).toEqual({ theme: 'cradle', layer: 0 })
    expect(at({ stage: 1 })).toEqual({ theme: 'cradle', layer: 1 })
    expect(at({ stage: 4 })).toEqual({ theme: 'youth', layer: 1 })
    expect(at({ stage: STAGES.length - 1 })).toEqual({ theme: 'twilight', layer: 0 })
    expect(at({ stage: 99 })).toEqual({ theme: 'twilight', layer: 0 })
    expect(at({ stage: -3 })).toEqual({ theme: 'cradle', layer: 0 })
  })

  it('a boss and the reaper take over; endings wait for the result; a dropped link is silent', () => {
    expect(at({ started: false })?.theme).toBe('title')
    expect(at({ stage: 6, boss: true })?.theme).toBe('boss')
    expect(at({ phase: 'reaper', boss: true })?.theme).toBe('reaper')
    expect(at({ phase: 'lost' })).toBeNull()
    expect(at({ phase: 'won' })).toBeNull()
    expect(at({ phase: 'lost', resultShown: true })?.theme).toBe('lost')
    expect(at({ phase: 'won', resultShown: true })?.theme).toBe('won')
    expect(at({ phase: 'playing', resultShown: true })).toBeNull()
    expect(at({ phase: undefined })).toBeNull()
  })

  it('leaves room for the stingers announcing the same moment', () => {
    expect(transition('office', 'boss').delay).toBeGreaterThanOrEqual(1.5)
    expect(transition('boss', 'office').delay).toBeGreaterThanOrEqual(1.5)
    expect(transition('cradle', 'school').delay).toBeGreaterThan(0.5)
    expect(transition('office', null).fade).toBeLessThan(1)
    expect(transition(null, 'title').delay).toBeLessThan(0.5)
  })

  it('swings only the off-beat sixteenths', () => {
    expect([0, 1, 2, 3].map((step) => swingOffset(0, step))).toEqual([0, 0, 0, 0])
    expect([0, 1, 2, 3, 4].map((step) => swingOffset(0.6, step))).toEqual([0, 0, 0.6, 0.3, 0])
  })
})

/* ----------------------------------------------------------------------------------------------- player */

describe('MusicPlayer', () => {
  it('queues notes a little ahead of the clock, never further', () => {
    const { music, context } = player()
    music.set({ theme: 'title', layer: 0 })
    expect(vi.getTimerCount()).toBe(1)
    advance(context, 2)
    expect(context.starts.length).toBeGreaterThan(20)
    expect(Math.max(...context.starts)).toBeLessThanOrEqual(context.currentTime + 0.3)
    expect(music.state).toMatchObject({ theme: 'title', layer: 0 })
    music.dispose()
  })

  it('a new layer joins in place; a new theme fades the old one and waits its cue', () => {
    const { music, context } = player()
    music.set({ theme: 'youth', layer: 0 })
    advance(context, 1)
    music.set({ theme: 'youth', layer: 1 })
    expect(context.targets).not.toContain(0)
    expect(music.state.layer).toBe(1)
    const before = context.starts.length
    const now = context.currentTime
    music.set({ theme: 'boss', layer: 0 })
    expect(context.targets).toContain(0)
    advance(context, 3)
    const fresh = context.starts.slice(before)
    expect(fresh.length).toBeGreaterThan(0)
    expect(Math.min(...fresh)).toBeGreaterThanOrEqual(now + transition('youth', 'boss').delay - 1e-9)
    music.dispose()
  })

  it('a later layer plays more parts', () => {
    const count = (layer: number) => {
      const { music, context } = player()
      music.set({ theme: 'cradle', layer })
      advance(context, 6)
      music.dispose()
      vi.useRealTimers()
      return context.starts.length
    }
    expect(count(1)).toBeGreaterThan(count(0))
  })

  it('queues nothing while disabled or suspended, then picks the beat up from now', () => {
    const { music, context } = player()
    music.setEnabled(false)
    music.set({ theme: 'office', layer: 0 })
    advance(context, 1)
    context.state = 'suspended'
    music.setEnabled(true)
    advance(context, 1)
    expect(context.starts).toHaveLength(0)
    context.state = 'running'
    const now = context.currentTime
    advance(context, 0.5)
    expect(context.starts.length).toBeGreaterThan(0)
    expect(Math.min(...context.starts)).toBeGreaterThanOrEqual(now)
    music.dispose()
  })

  it('silence fades out and then stops the scheduler; dispose always stops it', () => {
    const { music, context } = player()
    music.set({ theme: 'midlife', layer: 0 })
    advance(context, 1)
    music.set(null)
    expect(music.state.theme).toBeNull()
    expect(context.targets).toContain(0)
    advance(context, 3)
    expect(vi.getTimerCount()).toBe(0)
    music.set({ theme: 'won', layer: 0 })
    expect(vi.getTimerCount()).toBe(1)
    music.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('muffles and ducks smoothly', () => {
    const { music, context } = player()
    music.setMuffle(0.5)
    music.setMuffle(0.501)
    expect(context.targets).toHaveLength(1)
    expect(context.targets[0]).toBeLessThan(5000)
    music.duck(0.4, 1)
    expect(context.targets.slice(1)).toEqual([0.4, 1])
    music.dispose()
  })

  it('never throws, even when Web Audio does', () => {
    const { music, context } = player()
    context.createOscillator = () => {
      throw new Error('boom')
    }
    expect(() => {
      music.set({ theme: 'school', layer: 0 })
      advance(context, 1)
      music.setMuffle(1)
      music.duck(0.3, 1)
      music.set(null)
      music.dispose()
    }).not.toThrow()
  })
})

/* -------------------------------------------------------------------------------------------- LifeAudio */

describe('LifeAudio music', () => {
  it('remembers the theme until a gesture unlocks audio, then plays it', () => {
    const { audio, context } = withAudio()
    audio.setMusic({ theme: 'title', layer: 0 })
    expect(audio.music).toMatchObject({ theme: 'title', enabled: false })
    expect(context.starts).toHaveLength(0)
    audio.unlock()
    advance(context, 1)
    expect(audio.music).toMatchObject({ theme: 'title', enabled: true })
    expect(context.starts.length).toBeGreaterThan(0)
    audio.dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(audio.music.theme).toBeNull()
  })

  it('mute, zero music volume and a hidden tab stop queuing music; the effects keep their own volume', () => {
    const { audio, context } = withAudio()
    audio.unlock()
    audio.setMusic({ theme: 'office', layer: 1 })
    for (const off of [() => audio.setMuted(true), () => audio.setMusicVolume(0), () => audio.setHidden(true)]) {
      off()
      advance(context, 0.5)
      const before = context.starts.length
      advance(context, 1)
      expect(context.starts.length).toBe(before)
      audio.setMuted(false)
      audio.setMusicVolume(0.5)
      audio.setHidden(false)
    }
    advance(context, 0.5)
    const before = context.starts.length
    advance(context, 1)
    expect(context.starts.length).toBeGreaterThan(before)
    audio.setMusicVolume(0)
    audio.play('kill')
    expect(audio.volume).toBe(0.7)
    audio.dispose()
  })

  it('persists the music volume next to the effects, with a default for old saves', () => {
    const old = withAudio(memory({ muted: false, volume: 0.3 }))
    expect(old.audio.musicVolume).toBe(0.5)
    expect(old.audio.volume).toBe(0.3)
    old.audio.setMusicVolume(2)
    expect(old.audio.musicVolume).toBe(1)
    old.audio.setMusicVolume(Number.NaN)
    expect(old.audio.musicVolume).toBe(0.5)
    old.audio.setMusicVolume(0.25)
    expect(JSON.parse(old.storage.getItem('life-survivors:sound') ?? '{}')).toEqual({
      muted: false,
      volume: 0.3,
      music: 0.25
    })
    expect(new LifeAudio(old.storage).musicVolume).toBe(0.25)
  })

  it('stingers duck the music; ordinary hits do not', () => {
    const { audio, context } = withAudio()
    audio.unlock()
    audio.setMusic({ theme: 'office', layer: 0 })
    audio.play('hit')
    expect(context.targets).toHaveLength(0)
    audio.play('bossWarn')
    expect(context.targets).toContain(0.35)
    audio.dispose()
  })
})
