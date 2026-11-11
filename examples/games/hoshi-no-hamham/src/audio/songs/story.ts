import type { SongDef } from '../notation'
import { m3, majorKey, motif, r3, seq, type KeyInfo } from './util'

/**
 * Story panels: a lullaby. G major, 76 bpm, 3/4, loop of 24 bars (about 57 s) after a 2-bar intro.
 *
 * Form: intro (two music-box bars) / A (the ハムハム motif in its waltz shape on the music box, then a consequent
 * that peaks on the C above and settles on G) / B (a wistful flute tune over Em-Bm-C-D-Em-Am-D, a little minor) /
 * A' (the music box again with a long-note flute line below and celesta twinkles), which rocks back into A.
 *
 * Instruments: music box and flute lead; harp arpeggios, soft strings, a quiet celesta; a gentle waltz bass
 * (root on one, low fifths on two and three). No drums.
 */
export const KEY: KeyInfo = majorKey(7)

/** A: the motif (G5 G5 B5 G5 | E5 E5 G5 D5 | C5 D5 F#5 | G5), then the consequent. */
const LEAD_A = seq(
  motif(67, 'major', { meter: 3, vel: 0.62, gate: 0.97 }),
  m3('v5 o5 e4. g8 >c4 | <a4. g8 e4 | f+4 a4. f+8 | g2.')
)
/** B: the minor-flavoured tune. */
const LYRIC_B = m3('v5 o5 e4. g8 b4 | f+4. a8 f+4 | g4. e8 c4 | d4 f+4 a4 | b4. a8 g4 | a4. g8 e4 | f+4. e8 d4 | d2.')
/** A flute line of single long notes below the tune in A'. */
const HARMONY = m3('v4 o4 g2. | g2. | e2. | b2. | g2. | a2. | f+2. | g2.')

export const SONG: SongDef = {
  name: 'story',
  key: 'G major',
  bpm: 76,
  barTicks: 36,
  gain: 1.8,
  parts: [
    { id: 'mb', inst: 'musicbox', role: 'melody', vol: 0.7, pan: 0.1, send: 0.45 },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.5, pan: -0.15, send: 0.4 },
    { id: 'cel', inst: 'celesta', role: 'melody', vol: 0.3, pan: 0.45, send: 0.5 },
    {
      id: 'st',
      inst: 'strings',
      role: 'chord',
      vol: 0.42,
      pan: -0.2,
      send: 0.45,
      chorus: 0.5,
      center: 62,
      gate: 0.99,
      vel: 0.45
    },
    { id: 'hp', inst: 'harp', role: 'chord', vol: 0.5, pan: -0.4, send: 0.45, center: 60, vel: 0.5, gate: 0.97 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.55, center: 36, vel: 0.6, gate: 0.9 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 2,
      chords: 'G | D',
      parts: {
        mb: m3('v5 o5 d4 g4 b4 | o6 d2.'),
        hp: '123432',
        bs: '......|r.....'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'G | Em | C D | G | C | Am | D | G',
      parts: {
        mb: LEAD_A,
        st: 'x-----',
        hp: '123432',
        bs: 'r.F.F.'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Em | Bm | C | D | Em | Am | D | D',
      parts: {
        fl: LYRIC_B,
        st: 'x-----',
        hp: '123432',
        bs: 'r.F.F.'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'G | Em | C D | G | C | Am | D | G',
      parts: {
        mb: LEAD_A,
        fl: HARMONY,
        cel: seq(r3(4), m3('v4 o6 c8 e8 g8 e8 c8 e8 | o5 a8 >c8 e8 c8 <a8 >c8 | o5 f+8 a8 >d8 <a8 f+8 a8 | g2.')),
        st: 'x-----',
        hp: '123432',
        bs: 'r.F.F.'
      }
    }
  ]
}
