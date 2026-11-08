import { describe, expect, test } from 'vitest'
import { THEMES, type ThemeName } from '../src/audio/api'
import { compileSong } from '../src/audio/notation'
import {
  KEYS,
  arrangementReport,
  cadenceReport,
  harmonyReport,
  melodyReport,
  sectionsOf
} from '../src/audio/score-quality'
import { SONGS } from '../src/audio/songs'

/**
 * Objective musical quality gates for every theme, computed on the compiled scores (see src/audio/score-quality.ts).
 * The same functions feed the report in .build/mamono-audio/score-report.ts.
 */
describe.each(THEMES as readonly ThemeName[])('%s', (theme) => {
  const song = SONGS[theme]

  test('harmony: strong-beat melody notes are chord tones, the rest resolve by step, nothing leaves the key', () => {
    const h = harmonyReport(theme)
    expect(h.strongNotes).toBeGreaterThan(5)
    expect(h.chordToneShare, 'chord-tone share on strong beats').toBeGreaterThanOrEqual(0.8)
    expect(h.unresolved, 'strong-beat non-chord tones that do not move by step').toEqual([])
    expect(h.outOfKey, 'pitches outside the key, declared colours and approach tones').toEqual([])
    expect(h.clashes, 'sustained minor-second / tritone clashes against bass or chord parts').toEqual([])
  })

  test('melody: few big leaps (resolved by step), at most an octave and a half per section, a real peak', () => {
    const m = melodyReport(theme)
    expect(m.bigLeaps / Math.max(1, m.intervals), 'share of leaps over an octave').toBeLessThanOrEqual(0.03)
    expect(m.unresolvedLeaps).toEqual([])
    expect(m.ranges.length).toBeGreaterThan(0)
    for (const r of m.ranges) {
      expect(r.range, `${theme}/${r.section}/${r.part} range`).toBeLessThanOrEqual(18)
      // a moving line (not a held pedal) has a peak, not a plateau
      if (r.notes >= 12)
        expect(
          r.peakCount / r.notes,
          `${theme}/${r.section}/${r.part} share of notes on the top pitch`
        ).toBeLessThanOrEqual(0.35)
    }
  })

  test('form: sections are 4 or 8 bars (intros 2-4) and end with a cadence', () => {
    const cads = cadenceReport(theme)
    const secs = sectionsOf(compileSong(song))
    cads.forEach((c, i) => {
      if (song.once) return
      if (c.section === 'intro') expect([2, 4]).toContain(c.bars)
      else expect([4, 8], `${theme}/${c.section} bars`).toContain(c.bars)
      // dominant -> tonic, plagal, deceptive, or a half cadence that resolves into the next section
      const next = secs[i + 1] ?? secs.find((s) => s.loop) ?? secs[0]
      const nextRel = (next.segs[0].chord.root - KEYS[theme].tonic + 12) % 12
      const ok =
        c.cadence === 'authentic' ||
        c.cadence === 'plagal' ||
        c.cadence === 'deceptive' ||
        c.into === 'V->I root motion' ||
        (c.cadence === 'half' && [0, 8, 9].includes(nextRel))
      expect(ok, `${theme}/${c.section}: ${c.cadence}, into ${c.into}`).toBe(true)
    })
  })

  test('arrangement: no unison doubling, bass below everything, sections differ in density', () => {
    const a = arrangementReport(theme)
    expect(a.unisons).toEqual([])
    expect(a.bassAbove).toEqual([])
    const dens = a.density.filter((d) => d.section !== 'intro').map((d) => d.perBar)
    if (!song.once && dens.length >= 3) {
      const mean = dens.reduce((x, y) => x + y, 0) / dens.length
      expect((Math.max(...dens) - Math.min(...dens)) / mean, 'density spread').toBeGreaterThanOrEqual(0.15)
    }
  })
})

describe('intensity layers', () => {
  test('fight themes have drums at every layer; stage themes gain drums when the fight starts', () => {
    for (const theme of ['boss', 'finalBoss'] as const)
      expect(arrangementReport(theme).drumsByLayer[0], theme).toBeGreaterThan(0)
    for (const theme of ['meadow', 'sewer', 'tower', 'forest'] as const) {
      const d = arrangementReport(theme).drumsByLayer
      expect(d[1], `${theme} layer 1 drums`).toBeGreaterThan(0)
      expect(d[2], `${theme} layer 2 drums`).toBeGreaterThanOrEqual(d[1])
    }
  })
})
