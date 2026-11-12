import { describe, expect, test } from 'vitest'
import { THEMES, type ThemeName } from '../src/audio/api'
import { RANGES } from '../src/audio/instruments'
import { DRUM, compileSong, degreeToMidi, mml, motif, parseChord, voice } from '../src/audio/notation'
import { sectionsOf } from '../src/audio/score-quality'
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

  test('the ANIMA motif is four bars and survives transposition', () => {
    expect(motif(60, 'major').ticks).toBe(192)
    expect(motif(60, 'major', { stretch: 2 }).ticks).toBe(384)
    expect(motif(60, 'major', { bars: [0, 1] }).ticks).toBe(48)
    // The bugle call: the fifth, then up a fourth to the tonic, then a stepwise fall.
    expect(
      motif(60, 'major')
        .ev.map((e) => e.midi)
        .slice(0, 5)
    ).toEqual([67, 72, 71, 69, 67])
    expect(degreeToMidi(60, 'major', 8)).toBe(72)
    expect(motif(62, 'minor').ev.length).toBe(12)
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
  test('lengths: loops last at least 32 bars (45-130 s), jingles 3-7 s', () => {
    for (const theme of composed) {
      const c = compileSong(SONGS[theme])
      if (SONGS[theme].once) {
        expect(c.seconds, theme).toBeGreaterThanOrEqual(3)
        expect(c.seconds, theme).toBeLessThanOrEqual(7)
      } else {
        const bars = c.loopSeconds / (c.tickSec * SONGS[theme].barTicks)
        expect(bars, `${theme} loop bars`).toBeGreaterThanOrEqual(32)
        expect(c.loopSeconds, theme).toBeGreaterThanOrEqual(45)
        expect(c.loopSeconds, theme).toBeLessThanOrEqual(130)
      }
    }
  })

  test('loops have A and B sections, a contrasting bridge and a turnaround back into the loop', () => {
    for (const theme of composed) {
      const song = SONGS[theme]
      if (song.once) continue
      const names = song.sections.map((s) => s.name)
      expect(names.length, theme).toBeGreaterThanOrEqual(4)
      expect(names, theme).toContain('A')
      expect(names, theme).toContain('B')
      expect(names, theme).toContain('bridge')
      // exactly one section marks the loop point
      expect(
        song.sections.filter((s) => s.loop),
        theme
      ).toHaveLength(1)
    }
  })

  test('the loop seam: the last chord leads into the first chord of the loop (V, IV, vi or a bass step)', () => {
    for (const theme of composed) {
      const song = SONGS[theme]
      if (song.once) continue
      const secs = sectionsOf(compileSong(song))
      const loopAt = secs.findIndex((s) => s.loop)
      const last = secs[secs.length - 1].segs.at(-1)!.chord
      const first = secs[loopAt].segs[0].chord
      const tonic = KEYS[theme].tonic
      const motion = (first.root - last.root + 12) % 12
      const rel = (last.root - tonic + 12) % 12
      // fifth above (V->I), the dominant itself (half cadence), a step, or a plagal/deceptive move
      expect([5, 0, 1, 2, 9, 3].includes(motion) || rel === 7, `${theme}: ${last.name} -> ${first.name}`).toBe(true)
      // melody and bass of the last bar must not leave the instrument range (already covered) and the song must
      // not end in silence: something sounds in the final beat of the last bar
      const c = compileSong(song)
      const lastBeat = c.events.filter((e) => e.t >= c.totalTicks - 12 && e.t < c.totalTicks)
      expect(lastBeat.length, `${theme} last beat`).toBeGreaterThan(0)
    }
  })

  test('every composed theme has at least five parts, a bass, a melody and harmony', () => {
    for (const theme of composed) {
      const song = SONGS[theme]
      if (song.once) continue
      expect(song.parts.length, theme).toBeGreaterThanOrEqual(5)
      for (const role of ['bass', 'melody', 'chord'] as const)
        expect(
          song.parts.some((p) => p.role === role),
          `${theme} has no ${role}`
        ).toBe(true)
    }
  })

  test('mission, fight and match themes have an intensity layer that carries notes', () => {
    const layered: ThemeName[] = ['oldtown', 'harbor', 'night', 'blight', 'boss', 'finalBoss', 'pvp', 'training']
    for (const theme of layered.filter(has)) {
      const song = SONGS[theme]
      const c = compileSong(song)
      const parts = song.parts.map((p, i) => ({ p, i })).filter(({ p }) => (p.layer ?? 0) === 1)
      expect(parts.length, `${theme} layer 1`).toBeGreaterThan(0)
      expect(
        c.events.some((e) => parts.some(({ i }) => i === e.part)),
        `${theme} layer 1 has notes`
      ).toBe(true)
      expect(song.parts.filter((p) => (p.layer ?? 0) === 0).length, theme).toBeGreaterThan(3)
    }
  })

  test('the ANIMA motif (call up a fourth, then a stepwise fall) returns in title, menu, briefing, win and credits', () => {
    // G C B A G in the major, G C B-flat A-flat G in the minor: +5, then -1/-2 steps, ending a fifth above the start's
    // octave-down echo. Checked on consecutive notes of one melody part.
    const quotes = (theme: ThemeName) => {
      const song = SONGS[theme]
      const c = compileSong(song)
      for (let pi = 0; pi < song.parts.length; pi++) {
        if (song.parts[pi].role !== 'melody') continue
        const n = c.events.filter((e) => e.part === pi).sort((a, b) => a.t - b.t)
        for (let i = 0; i + 4 < n.length; i++) {
          const d = [1, 2, 3, 4].map((k) => n[i + k].midi - n[i + k - 1].midi)
          if (d[0] === 5 && [-1, -2].includes(d[1]) && [-1, -2].includes(d[2]) && [-1, -2].includes(d[3])) return true
        }
      }
      return false
    }
    for (const theme of (['title', 'menu', 'briefing', 'win', 'credits'] as const).filter(has))
      expect(quotes(theme), theme).toBe(true)
  })
})
