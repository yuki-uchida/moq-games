import { transpose, type SongDef } from '../notation'
import { m4, majorKey, motif, motifHead, r4, seq, type KeyInfo } from './util'

/**
 * Ending and credits: the main theme coming home. C major, 92 bpm, 4/4, loop of 32 bars (about 84 s) after a
 * 4-bar intro.
 *
 * Form: intro (a harp climb and the motif's head on the music box) / A (the ハムハム motif at half speed, eight
 * bars, flute over low strings) / B (a warm new tune for flute and strings over F-Dm-G-C-Am-Dm-G-C) /
 * bridge (the music box passes the motif's head through Am-Em-F-C-Dm-Am-F-G, flute holding long notes) /
 * A' (the broad motif again in strings, flute and music box in three octaves, ending on a plagal "amen" F-C that
 * leads back into A).
 *
 * Instruments: flute, strings (melody and pad), music box, harp; bass; timpani and a soft kit in
 * the last section.
 */
export const KEY: KeyInfo = majorKey(0)

/** A: the leitmotif stated broadly (every note twice as long). */
const BROAD_FLUTE = motif(60, 'major', { stretch: 2, vel: 0.7, gate: 0.97 })
const BROAD_STRINGS = motif(48, 'major', { stretch: 2, vel: 0.55, gate: 0.99 })
/** B: a warm tune with a single peak on the A. */
const LYRIC_B = m4(
  'v6 o4 a4 >c4 f2 | d4 f4 a2 | g4. f8 d4 <b4 | >c4 e4 g2 | a2. g4 | f4 e4 d4 f4 | <b4 >d4 g4 f4 | e2 c2'
)

export const SONG: SongDef = {
  name: 'ending',
  key: 'C major',
  bpm: 92,
  barTicks: 48,
  gain: 1.07,
  parts: [
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.68, pan: 0.15, send: 0.35 },
    { id: 'vl', inst: 'strings', role: 'melody', vol: 0.5, pan: -0.25, send: 0.4, chorus: 0.4 },
    { id: 'mb', inst: 'musicbox', role: 'melody', vol: 0.5, pan: 0.4, send: 0.45 },
    {
      id: 'st',
      inst: 'strings',
      role: 'chord',
      vol: 0.5,
      pan: -0.2,
      send: 0.4,
      chorus: 0.5,
      center: 64,
      gate: 0.99,
      vel: 0.5
    },
    { id: 'hp', inst: 'harp', role: 'chord', vol: 0.55, pan: -0.45, send: 0.45, center: 62, vel: 0.55, gate: 0.97 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.65, center: 36, vel: 0.7, gate: 0.9 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.5, center: 36, vel: 0.65, send: 0.25 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.5, pan: 0.1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'C | Am | F | G',
      parts: {
        mb: seq(
          r4(1),
          motifHead(72, 'major', -2, { vel: 0.6 }),
          motifHead(72, 'major', -4, { vel: 0.64 }),
          motifHead(72, 'major', -3, { vel: 0.7 })
        ),
        hp: '1234543212345432|1234543212345432|1234543212345432|1234543212345432',
        st: '................|x---------------|x---------------|x---------------',
        bs: '................|r-------F-------|r-------F-------|r-------F---a---'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'C | C/E | F | Am | F G | Dm G | C | C',
      parts: {
        fl: BROAD_FLUTE,
        vl: BROAD_STRINGS,
        st: 'x---------------',
        hp: '12343232',
        bs: 'r---F---'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'F | Dm | G | C | Am | Dm | G | C',
      parts: {
        fl: LYRIC_B,
        vl: m4('v5 o4 c1 | a1 | b1 | g1 | e1 | f1 | d1 | g1'),
        st: 'x---------------',
        hp: '12343232',
        bs: 'r-r-F-r-'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Am | Em | F | C | Dm | Am | F | G',
      parts: {
        mb: seq(
          motifHead(72, 'major', -2, { vel: 0.6 }),
          motifHead(72, 'major', -3, { vel: 0.62 }),
          motifHead(72, 'major', -4, { vel: 0.64 }),
          motifHead(72, 'major', -5, { vel: 0.66 }),
          motifHead(72, 'major', -6, { vel: 0.68 }),
          motifHead(72, 'major', -2, { vel: 0.7 }),
          motifHead(72, 'major', -4, { vel: 0.72 }),
          m4('v7 o5 d4 g4 b2')
        ),
        fl: m4('v5 o5 c1 | <b1 | a1 | g1 | f1 | e1 | >c1 | d1'),
        st: 'x---------------',
        hp: '1234543212345432',
        bs: 'r---------------',
        tim: 'r.......|........|........|........|r.......|........|r.......|r.r.r.r.'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'C | C/E | F | Am | F G | Dm G | F | C',
      parts: {
        vl: BROAD_FLUTE,
        fl: transpose(BROAD_FLUTE, 12),
        mb: seq(r4(2), motif(84, 'major', { stretch: 2, vel: 0.62, gate: 0.97, bars: [1, 4] })),
        st: 'x---------------',
        hp: '1234543212345432',
        bs: 'r.r.F.r.',
        tim: 'r.......|r.......|r.......|r.......|r.......|r.......|r...r...|r...r...',
        dr: 'z.z.z.z.z.z.z.z.|z.z.z.z.z.z.z.z.|z.z.z.z.z.z.z.z.|z.z.z.z.z.z.z.z.|k.z.z.z.k.z.z.z.|k.z.z.z.k.z.z.z.|k.z.z.z.k.z.z.z.|k...............'
      }
    }
  ]
}
