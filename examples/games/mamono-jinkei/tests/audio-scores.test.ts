import { describe, expect, test } from 'vitest'
import { THEMES, type ThemeName } from '../src/audio/api'
import { RANGES } from '../src/audio/instruments'
import { DRUM, compileSong, degreeToMidi, mml, motif, parseChord, voice } from '../src/audio/notation'
import { SONGS } from '../src/audio/songs'

const DRUM_NOTES = new Set(Object.values(DRUM))

describe('notation', () => {
  test('mml lengths, ties, chords and bar checks', () => {
    const p = mml('o4 c4 d8 e8 f2 | [ceg]1 | c4.^8 r2', 48)
    expect(p.ticks).toBe(48 * 3)
    expect(p.ev[0]).toMatchObject({ t: 0, len: 12, midi: 60 })
    expect(p.ev.filter((e) => e.t === 48)).toHaveLength(3)
    expect(mml('c12 c12 c12 r4', 12).ticks).toBe(24)
    expect(() => mml('c4 c4 | c4', 48)).toThrow()
    expect(() => mml('x4')).toThrow()
    expect(() => mml('c5')).toThrow()
  })

  test('chord symbols and voice leading', () => {
    expect(parseChord('Am7/G')).toMatchObject({ root: 9, bass: 7, tones: [0, 3, 7, 10] })
    expect(() => parseChord('H')).toThrow()
    const c = voice(parseChord('C'), undefined, 62)
    const g = voice(parseChord('G'), c, 62)
    const move = g.reduce((s, n, i) => s + Math.abs(n - c[i]), 0)
    expect(move).toBeLessThanOrEqual(8)
  })

  test('the motif is four bars in both meters and survives transposition', () => {
    expect(motif(60, 'major').ticks).toBe(192)
    expect(motif(60, 'major', { meter: 3 }).ticks).toBe(144)
    expect(motif(60, 'major', { stretch: 2 }).ticks).toBe(384)
    expect(motif(60, 'major', { bars: [0, 1] }).ticks).toBe(48)
    expect(
      motif(60, 'major')
        .ev.map((e) => e.midi)
        .slice(0, 3)
    ).toEqual([67, 72, 76])
    expect(degreeToMidi(60, 'major', 8)).toBe(72)
    expect(motif(62, 'minor', { twist: true }).ev.length).toBe(12)
  })
})

describe('every theme has a valid score', () => {
  for (const theme of THEMES) {
    const song = SONGS[theme as ThemeName]
    test(`${theme} compiles with whole bars`, () => {
      expect(song, `${theme} has no song`).toBeDefined()
      const c = compileSong(song)
      expect(c.totalTicks % song.barTicks).toBe(0)
      expect(c.events.length).toBeGreaterThan(20)
      for (const e of c.events) {
        expect(e.len).toBeGreaterThan(0)
        expect(e.vel).toBeGreaterThan(0)
        expect(e.vel).toBeLessThanOrEqual(1)
        expect(e.t).toBeGreaterThanOrEqual(0)
        expect(e.t).toBeLessThan(c.totalTicks + 4)
      }
      for (let i = 1; i < c.events.length; i++) expect(c.events[i].t).toBeGreaterThanOrEqual(c.events[i - 1].t)
      let ticks = 0
      for (const s of song.sections) ticks += s.bars * song.barTicks
      expect(ticks).toBe(c.totalTicks)
    })

    test(`${theme} keeps every part inside its instrument's range`, () => {
      const c = compileSong(song)
      for (const e of c.events) {
        const part = song.parts[e.part]
        if (part.inst === 'kit') {
          expect(DRUM_NOTES.has(e.midi), `${theme}/${part.id}: drum ${e.midi}`).toBe(true)
          continue
        }
        const [lo, hi] = RANGES[part.inst]
        expect(e.midi, `${theme}/${part.id} (${part.inst}) at tick ${e.t}`).toBeGreaterThanOrEqual(lo)
        expect(e.midi, `${theme}/${part.id} (${part.inst}) at tick ${e.t}`).toBeLessThanOrEqual(hi)
      }
    })
  }

  test('lengths: main loops last 45-120 s, jingles 4-7 s', () => {
    for (const theme of THEMES) {
      const c = compileSong(SONGS[theme])
      if (SONGS[theme].once) {
        expect(c.seconds, theme).toBeGreaterThanOrEqual(4)
        expect(c.seconds, theme).toBeLessThanOrEqual(7)
      } else {
        expect(c.loopSeconds, theme).toBeGreaterThanOrEqual(45)
        expect(c.loopSeconds, theme).toBeLessThanOrEqual(100)
      }
    }
    for (const theme of [
      'title',
      'lobby',
      'meadow',
      'sewer',
      'tower',
      'forest',
      'boss',
      'finalBoss',
      'ending'
    ] as const)
      expect(compileSong(SONGS[theme]).loopSeconds, theme).toBeGreaterThanOrEqual(60)
    expect(compileSong(SONGS.clear).seconds).toBeGreaterThanOrEqual(5)
    expect(compileSong(SONGS.gameover).seconds).toBeLessThanOrEqual(6)
  })

  test('every stage theme has intensity layers 0-2 that gate parts and carry notes', () => {
    for (const theme of ['meadow', 'sewer', 'tower', 'forest'] as const) {
      const song = SONGS[theme]
      const c = compileSong(song)
      for (const layer of [1, 2]) {
        const parts = song.parts.map((p, i) => ({ p, i })).filter(({ p }) => (p.layer ?? 0) === layer)
        expect(parts.length, `${theme} layer ${layer}`).toBeGreaterThan(0)
        expect(
          c.events.some((e) => parts.some(({ i }) => i === e.part)),
          `${theme} layer ${layer} has notes`
        ).toBe(true)
      }
      expect(song.parts.filter((p) => (p.layer ?? 0) === 0).length, theme).toBeGreaterThan(3)
    }
  })

  test('long themes have an intro, several sections and a bridge', () => {
    for (const theme of ['title', 'meadow', 'sewer', 'tower', 'forest', 'finalBoss'] as const) {
      const names = SONGS[theme].sections.map((s) => s.name)
      expect(names.length, theme).toBeGreaterThanOrEqual(4)
      expect(names, theme).toContain('bridge')
    }
  })

  test('the leitmotif (5-8-10 rise) opens the title, meadow and ending', () => {
    const rise = (theme: ThemeName, root: number) => {
      const c = compileSong(SONGS[theme])
      const byTime = new Map<number, number[]>()
      for (const e of c.events) {
        if (SONGS[theme].parts[e.part].role !== 'melody') continue
        byTime.set(e.t, [...(byTime.get(e.t) ?? []), e.midi])
      }
      return [...byTime.entries()].some(([t, notes]) => {
        const n1 = notes.map((m) => m % 12)
        return n1.includes((root + 7) % 12) && (byTime.get(t + 12) ?? []).some((m) => m % 12 === root % 12)
      })
    }
    expect(rise('title', 2)).toBe(true)
    expect(rise('meadow', 0)).toBe(true)
    expect(rise('ending', 5)).toBe(true)
    expect(rise('sewer', 4)).toBe(true)
    expect(rise('tower', 9)).toBe(true)
    expect(rise('forest', 11)).toBe(true)
    expect(rise('finalBoss', 9)).toBe(true)
  })
})
