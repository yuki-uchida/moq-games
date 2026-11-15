import { afterEach, describe, expect, test, vi } from 'vitest'
import { VOICES } from '../src/audio/instruments'
import { compileSongsAhead, compiledSong, inIdleMoments, MusicPlayer } from '../src/audio/music'
import { compileSong, type SongDef } from '../src/audio/notation'
import { SONGS } from '../src/audio/songs'
import { recordingContext } from './audio-fakes'

/** A stand-in for any Web Audio object: every property is a function/param that returns another stand-in. */
function fake(): unknown {
  const proxy: unknown = new Proxy(function () {}, {
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

type Note = [inst: string, when: number, dur: number, midi: number]

/** Replaces every voice with a recorder, so a test can see which notes a player schedules and when. */
function recordVoices(): Note[] {
  const notes: Note[] = []
  for (const inst of Object.keys(VOICES) as Array<keyof typeof VOICES>)
    vi.spyOn(VOICES, inst).mockImplementation(((_env: unknown, t: number, dur: number, midi: number) => {
      notes.push([inst, t, dur, midi])
    }) as never)
  return notes
}

function player(theme: keyof typeof SONGS, layer = 2): MusicPlayer {
  const ctx = fake() as BaseAudioContext
  const mixer = { ctx, music: fake(), musicReverb: fake(), chorus: fake() } as never
  // No humanising, so two players of the same song schedule the same times.
  return new MusicPlayer(mixer, fake() as AudioBuffer, SONGS[theme], layer, 0, false)
}

afterEach(() => vi.restoreAllMocks())

describe('the music scheduler', () => {
  test('a budgeted pump schedules the same notes in the same order as an unbudgeted one', () => {
    const notes = recordVoices()
    player('meadow').pump(12)
    const whole = notes.splice(0)
    expect(whole.length).toBeGreaterThan(50)

    // A clock that advances 1 ms every time it is read: a 3 ms budget allows about three notes per call.
    let clock = 0
    const q = player('meadow')
    let calls = 0
    let most = 0
    let before = notes.length
    while (q.pump(12, 3, false, () => clock++)) {
      calls += 1
      most = Math.max(most, notes.length - before)
      before = notes.length
      expect(calls).toBeLessThan(10000)
    }
    expect(notes).toEqual(whole)
    expect(calls).toBeGreaterThan(10)
    expect(most).toBeLessThanOrEqual(4)
  })

  test('a pump that spends nothing of its budget reports nothing left', () => {
    recordVoices()
    const p = player('meadow')
    expect(p.pump(0.001, 3, false, () => 0)).toBe(false)
  })

  test('nothing is built while silent, and the song is where it should be afterwards', () => {
    const notes = recordVoices()
    const reference = player('meadow')
    reference.pump(8)
    const upTo8 = notes.splice(0).length
    reference.pump(20)
    const rest = notes.splice(0)
    expect(upTo8).toBeGreaterThan(0)
    expect(rest.length).toBeGreaterThan(0)

    const q = player('meadow')
    expect(q.pump(8, 3, true)).toBe(false)
    expect(notes).toEqual([])
    q.pump(20)
    expect(notes).toEqual(rest)
  })

  test('the loop point and one-shot jingles behave as before while silent', () => {
    const notes = recordVoices()
    const looping = player('meadow')
    const length = looping.song.totalTicks * looping.song.tickSec
    const cut = length * 1.4
    const reference = player('meadow')
    reference.pump(cut)
    notes.splice(0)
    reference.pump(length * 2.5)
    const rest = notes.splice(0)
    expect(rest.length).toBeGreaterThan(0)
    looping.pump(cut, Infinity, true)
    looping.pump(length * 2.5)
    expect(notes).toEqual(rest)

    const jingle = player('clear', 0)
    expect(jingle.finished).toBe(false)
    jingle.pump(60, 3, true)
    expect(jingle.finished).toBe(true)
  })
})

describe('a player that is started again', () => {
  const noise = { duration: 2 } as AudioBuffer
  const shifted = (notes: Note[], by: number) =>
    notes.map(([inst, when, dur, midi]) => [inst, Number((when - by).toFixed(6)), dur, midi])

  test('plays its song from the first note, in the layer it is given', () => {
    const notes = recordVoices()
    const p = player('meadow')
    p.pump(6)
    const first = notes.splice(0)
    expect(first.length).toBeGreaterThan(50)
    // On through the song, then again from the top a hundred seconds later.
    p.pump(40)
    notes.splice(0)
    p.restart(2, 100)
    p.pump(106)
    expect(shifted(notes.splice(0), 100)).toEqual(shifted(first, 0))

    // In another layer it plays what a new player of that layer plays.
    player('meadow', 0).pump(6)
    const quiet = notes.splice(0)
    expect(quiet.length).toBeLessThan(first.length)
    p.restart(0, 200)
    p.pump(206)
    expect(shifted(notes.splice(0), 200)).toEqual(shifted(quiet, 0))
  })

  test('a jingle that has ended plays again', () => {
    const notes = recordVoices()
    const jingle = player('clear', 0)
    jingle.pump(60)
    const first = notes.splice(0)
    expect(jingle.finished).toBe(true)
    jingle.restart(0, 100)
    expect(jingle.finished).toBe(false)
    jingle.pump(160)
    expect(shifted(notes.splice(0), 100)).toEqual(shifted(first, 0))
    expect(jingle.finished).toBe(true)
  })

  test('builds nothing but the sources of its notes once the notes before have rung out', () => {
    const rec = recordingContext()
    const p = new MusicPlayer(rec.mixer(), noise, SONGS.meadow, 2, 0, false, true)
    p.pump(8)
    expect(rec.kept().length).toBeGreaterThan(100)
    // The notes scheduled up to the eighth second ring a little longer; then the player is silent.
    expect(p.quietAt).toBeGreaterThan(8)
    expect(p.quietAt).toBeLessThan(20)
    rec.at(100)
    const from = rec.log.length
    p.restart(2, 100)
    p.pump(108)
    expect(rec.sources(from).length).toBeGreaterThan(100)
    expect(rec.kept(from)).toEqual([])
    expect(p.quietAt).toBeGreaterThan(108)
  })

  test('knows when it is silent: at once when it has played nothing, never without racks', () => {
    const rec = recordingContext()
    expect(new MusicPlayer(rec.mixer(), noise, SONGS.clear, 0, 0, false, true).quietAt).toBe(0)
    const loose = new MusicPlayer(rec.mixer(), noise, SONGS.clear, 0, 0, false, false)
    loose.pump(4)
    expect(loose.quietAt).toBe(Infinity)
  })

  test('built off the mixer it is connected when it starts, and taken off again when it has faded', () => {
    vi.useFakeTimers()
    try {
      const rec = recordingContext()
      const mixer = rec.mixer()
      const built = rec.log.length
      const p = new MusicPlayer(mixer, noise, SONGS.clear, 0, 0, false, true, false)
      // Its parts are there, and nothing of it reaches the mixer.
      expect(rec.kept(built).length).toBeGreaterThan(6)
      expect(rec.wiring(built)).toEqual([])
      const into = (lines: string[]) => lines.map((line) => line.replace(/gain\d+/, 'gain'))
      p.restart(0, 1)
      expect(into(rec.wiring(built))).toEqual(['connect gain>music', 'connect gain>musicReverb', 'connect gain>chorus'])
      // Started again while it is on the mixer: no second connection.
      let from = rec.log.length
      p.restart(0, 2)
      expect(rec.wiring(from)).toEqual([])
      let done = false
      p.fadeOut(0.25, () => (done = true))
      vi.advanceTimersByTime(500)
      expect(done).toBe(false)
      vi.advanceTimersByTime(100)
      expect(done).toBe(true)
      expect(into(rec.wiring(from))).toEqual(['disconnect gain', 'disconnect gain', 'disconnect gain'])
      from = rec.log.length
      p.restart(0, 5)
      expect(into(rec.wiring(from))).toEqual(['connect gain>music', 'connect gain>musicReverb', 'connect gain>chorus'])
      // A player built on the mixer, as before, is connected from the start.
      const usual = rec.log.length
      void new MusicPlayer(mixer, noise, SONGS.clear, 0, 0, false, true)
      expect(into(rec.wiring(usual))).toEqual(['connect gain>music', 'connect gain>musicReverb', 'connect gain>chorus'])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('work in idle moments', () => {
  test('one item per moment, none while a stage is played, and it can be stopped', () => {
    const moments: Array<() => void> = []
    const timers: Array<() => void> = []
    const idle = ((run: (room: () => number) => void) => void moments.push(() => run(() => 50))) as never
    const done: string[] = []
    let playing = false
    const stop = inIdleMoments(
      ['a', 'b', 'c', 'd'],
      (item) => done.push(item),
      idle,
      () => playing,
      (run) => void timers.push(run)
    )
    expect(done).toEqual([])
    moments.shift()!()
    expect(done).toEqual(['a'])
    playing = true
    moments.shift()!()
    expect(done).toEqual(['a'])
    expect(moments).toHaveLength(0)
    playing = false
    timers.shift()!()
    moments.shift()!()
    expect(done).toEqual(['a', 'b'])
    stop()
    moments.shift()!()
    expect(done).toEqual(['a', 'b'])
    expect(moments).toHaveLength(0)
    expect(timers).toHaveLength(0)
  })
})

describe('compiling songs ahead', () => {
  /** Copies of real songs, so that the module's cache has not seen them. */
  const fresh = (...themes: Array<keyof typeof SONGS>): SongDef[] => themes.map((theme) => ({ ...SONGS[theme] }))

  /** Idle moments and timers handed out by the test. */
  function harness() {
    const moments: Array<() => void> = []
    const timers: Array<{ run: () => void; ms: number }> = []
    return {
      moments,
      timers,
      idle: ((run: (room: () => number) => void) => void moments.push(() => run(() => 50))) as never,
      later: (run: () => void, ms: number) => void timers.push({ run, ms })
    }
  }

  test('one song per idle moment, in the order given', () => {
    const defs = fresh('clear', 'gameover', 'boss')
    const h = harness()
    const seen: SongDef[] = []
    compileSongsAhead(defs, h.idle, () => false, h.later)
    expect(h.moments.length).toBe(1)
    for (let i = 0; i < defs.length; i++) {
      h.moments.shift()!()
      seen.push(defs[i])
      // Compiled now: asking again gives the very same object, and it equals a compile from scratch.
      const c = compiledSong(defs[i])
      expect(compiledSong(defs[i])).toBe(c)
      expect(c.events.length).toBe(compileSong(defs[i]).events.length)
      expect(h.moments.length).toBe(i < defs.length - 1 ? 1 : 0)
    }
    expect(seen).toEqual(defs)
    expect(h.timers.length).toBe(0)
  })

  test('waits while a stage is played and goes on afterwards', () => {
    const defs = fresh('story', 'select')
    const h = harness()
    let playing = true
    compileSongsAhead(defs, h.idle, () => playing, h.later)
    // Nothing is asked of the page while the stage runs; it looks again a second later.
    expect(h.moments.length).toBe(0)
    expect(h.timers.map((t) => t.ms)).toEqual([1000])
    h.timers.shift()!.run()
    expect(h.moments.length).toBe(0)
    expect(h.timers.length).toBe(1)
    playing = false
    h.timers.shift()!.run()
    expect(h.moments.length).toBe(1)
    // A stage that starts while a moment is awaited: the song stays for later.
    playing = true
    h.moments.shift()!()
    expect(h.moments.length).toBe(0)
    expect(h.timers.length).toBe(1)
    playing = false
    h.timers.shift()!.run()
    h.moments.shift()!()
    h.moments.shift()!()
    expect(h.moments.length).toBe(0)
    expect(h.timers.length).toBe(0)
  })

  test('skips songs that are compiled already and stops when told to', () => {
    const [known, other, last] = fresh('ending', 'cave', 'star')
    compiledSong(known)
    const h = harness()
    const made: SongDef[] = []
    const stop = compileSongsAhead(
      [known, other, last],
      h.idle,
      () => false,
      h.later,
      (def) => made.push(def)
    )
    // The one that is compiled already is not asked for again.
    h.moments.shift()!()
    expect(made).toEqual([other])
    expect(h.moments.length).toBe(1)
    stop()
    h.moments.shift()!()
    expect(made).toEqual([other])
    expect(h.moments.length).toBe(0)
    expect(h.timers.length).toBe(0)
  })
})
