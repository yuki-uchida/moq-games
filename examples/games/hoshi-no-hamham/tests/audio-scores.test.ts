import { describe, expect, test } from 'vitest'
import { THEMES, type ThemeName } from '../src/audio/api'
import { RANGES } from '../src/audio/instruments'
import { DRUM, compileSong, degreeToMidi, mml, motif, parseChord, voice } from '../src/audio/notation'
import { KEYS, SONGS } from '../src/audio/songs'
import { isStub } from '../src/audio/songs/util'

const DRUM_NOTES = new Set(Object.values(DRUM))
/** Themes that have a composed score (stand-ins are checked only for compiling). */
const composed = (THEMES as readonly ThemeName[]).filter((theme) => !isStub(SONGS[theme]))
const has = (theme: ThemeName) => composed.includes(theme)

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

  test('the ハムハム motif is four bars in both meters and survives transposition', () => {
    expect(motif(60, 'major').ticks).toBe(192)
    expect(motif(60, 'major', { meter: 3 }).ticks).toBe(144)
    expect(motif(60, 'major', { stretch: 2 }).ticks).toBe(384)
    expect(motif(60, 'major', { bars: [0, 1] }).ticks).toBe(48)
    // "ham-ham": the tonic twice, then up a third.
    expect(
      motif(60, 'major')
        .ev.map((e) => e.midi)
        .slice(0, 3)
    ).toEqual([72, 72, 76])
    expect(degreeToMidi(60, 'major', 8)).toBe(72)
    expect(motif(62, 'minor', { twist: true }).ev.length).toBe(15)
  })
})

describe('every theme has a score that compiles', () => {
  for (const theme of THEMES) {
    const song = SONGS[theme as ThemeName]
    test(`${theme} compiles with whole bars`, () => {
      expect(song, `${theme} has no song`).toBeDefined()
      expect(KEYS[theme as ThemeName], `${theme} has no key`).toBeDefined()
      const c = compileSong(song)
      expect(c.totalTicks % song.barTicks).toBe(0)
      expect(c.events.length).toBeGreaterThan(0)
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
})

describe('composed themes are full pieces', () => {
  test('lengths: main loops last 60-110 s, menu loops 40-90 s, jingles 4-7 s', () => {
    for (const theme of composed) {
      const c = compileSong(SONGS[theme])
      if (SONGS[theme].once) {
        expect(c.seconds, theme).toBeGreaterThanOrEqual(4)
        expect(c.seconds, theme).toBeLessThanOrEqual(7)
      } else if (theme === 'select' || theme === 'story') {
        expect(c.loopSeconds, theme).toBeGreaterThanOrEqual(40)
        expect(c.loopSeconds, theme).toBeLessThanOrEqual(90)
      } else {
        expect(c.loopSeconds, theme).toBeGreaterThanOrEqual(60)
        expect(c.loopSeconds, theme).toBeLessThanOrEqual(110)
      }
    }
  })

  test('every composed theme has at least five parts, a bass and percussion or a pad', () => {
    for (const theme of composed) {
      const song = SONGS[theme]
      if (song.once) continue
      expect(song.parts.length, theme).toBeGreaterThanOrEqual(5)
      expect(
        song.parts.some((p) => p.role === 'bass'),
        `${theme} has no bass`
      ).toBe(true)
      expect(
        song.parts.some((p) => p.role === 'melody'),
        `${theme} has no melody`
      ).toBe(true)
      expect(
        song.parts.some((p) => p.role === 'chord'),
        `${theme} has no harmony part`
      ).toBe(true)
    }
  })

  test('stage and fight themes have a second intensity layer that carries notes', () => {
    const layered: ThemeName[] = [
      'meadow',
      'night',
      'cave',
      'forest',
      'fortress',
      'castle',
      'star',
      'boss',
      'finalBoss'
    ]
    for (const theme of layered.filter(has)) {
      const song = SONGS[theme]
      const c = compileSong(song)
      const top = theme === 'finalBoss' ? [1, 2] : [1]
      for (const layer of top) {
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

  test('long themes have several sections and a contrasting bridge', () => {
    const long: ThemeName[] = [
      'title',
      'meadow',
      'night',
      'cave',
      'forest',
      'fortress',
      'castle',
      'star',
      'finalBoss',
      'ending'
    ]
    for (const theme of long.filter(has)) {
      const names = SONGS[theme].sections.map((s) => s.name)
      expect(names.length, theme).toBeGreaterThanOrEqual(4)
      expect(names, theme).toContain('bridge')
    }
  })

  test('the ハムハム motif (tonic twice, then up a third) is heard in the title, the stage select and the ending', () => {
    const quotes = (theme: ThemeName) => {
      const song = SONGS[theme]
      const c = compileSong(song)
      const starts = new Map<number, number[]>()
      for (const e of c.events) {
        if (song.parts[e.part].role !== 'melody') continue
        starts.set(e.t, [...(starts.get(e.t) ?? []), e.midi])
      }
      for (const [t, notes] of starts)
        for (const m of notes) {
          const second = [...starts.entries()].find(([u, ns]) => u > t && u <= t + 12 && ns.includes(m))
          if (!second) continue
          const third = [...starts.entries()].find(
            ([u, ns]) => u > second[0] && u <= second[0] + 12 && (ns.includes(m + 3) || ns.includes(m + 4))
          )
          if (third && m % 12 === KEYS[theme].tonic % 12) return true
        }
      return false
    }
    for (const theme of (['title', 'select', 'ending'] as const).filter(has)) expect(quotes(theme), theme).toBe(true)
  })
})
