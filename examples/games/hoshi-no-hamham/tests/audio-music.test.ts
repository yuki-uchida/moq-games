import { afterEach, describe, expect, test, vi } from 'vitest'
import { VOICES } from '../src/audio/instruments'
import { MusicPlayer } from '../src/audio/music'
import { SONGS } from '../src/audio/songs'

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
