import { transpose, type SongDef } from '../notation'
import { m4, majorKey, motif, motifHead, r4, seq, type KeyInfo } from './util'

/**
 * Stage select: a relaxed stroll. F major, 104 bpm, 4/4, shuffled (triplet swing), loop of 32 bars (about 74 s)
 * after a 2-bar intro.
 *
 * Form: intro (celesta quotes the head of the ハムハム motif) / A (the motif in the low clarinet, a higher answer,
 * pizzicato on the off-beats, walking bass, brushes) / B (a flute tune over F-Dm-Bb-C, harp and strings) /
 * C (a hushed break: celesta passes the motif's head through Dm-Gm-Bb-C over pizzicato and brushes) /
 * A' (clarinet and flute in two octaves, celesta sparkle, all in), which turns back into A.
 *
 * Instruments: clarinet, flute, celesta; pizzicato, harp, strings; walking bass; kit used as brushes
 * (shaker, soft snare, rim) plus a quiet kick.
 */
export const KEY: KeyInfo = majorKey(5)

/** A: the leitmotif in the clarinet, then an answer that rises to the G above. */
const LEAD_A = seq(
  motif(65, 'major', { vel: 0.72, gate: 0.9 }),
  m4('v6 o4 b-4. >c8 d4 f4 | o5 g4. f8 d4 <b-4 | >c4 e4 d4 f4 | <b-4 >d4 e2')
)
/** B: a flute tune, one peak on the B-flat. */
const LYRIC_B = m4(
  'v6 o4 a4 >c4 f2 | f4. e8 d4 f4 | d4 f4 b-2 | g4. a8 g4 e4 | <b-2 >d2 | e4. d8 c4 e4 | d4 f4 g4 e4 | f2. c4'
)
/** The off-beat comp of the pizzicato; with swing the off-beats lilt. */
const PZ = '.x.x.x.x'

export const SONG: SongDef = {
  name: 'select',
  key: 'F major',
  bpm: 104,
  barTicks: 48,
  swing: 2,
  gain: 0.86,
  parts: [
    { id: 'cl', inst: 'clarinet', role: 'melody', vol: 0.75, pan: -0.15, send: 0.25 },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.6, pan: 0.2, send: 0.3 },
    { id: 'cel', inst: 'celesta', role: 'melody', vol: 0.5, pan: 0.45, send: 0.4 },
    {
      id: 'st',
      inst: 'strings',
      role: 'chord',
      vol: 0.42,
      pan: -0.2,
      send: 0.35,
      chorus: 0.5,
      center: 64,
      gate: 0.99,
      vel: 0.5
    },
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.62, pan: 0.3, send: 0.2, center: 66, vel: 0.62, gate: 0.6 },
    { id: 'hp', inst: 'harp', role: 'chord', vol: 0.45, pan: -0.45, send: 0.4, center: 62, vel: 0.55, gate: 0.95 },
    { id: 'tw', inst: 'celesta', role: 'chord', vol: 0.3, pan: 0.5, send: 0.45, center: 86, vel: 0.5, gate: 0.8 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.72, center: 36, vel: 0.75, gate: 0.85 },
    { id: 'br', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.5, pan: 0.1 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.35, vel: 0.55, pan: -0.1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 2,
      chords: 'F | C',
      parts: {
        cel: seq(motifHead(65, 'major', 0, { vel: 0.7 }), motifHead(65, 'major', -3, { vel: 0.75 })),
        hp: '12343232',
        bs: '................|r.r.F.a.',
        br: 'z.z.z.z.z.z.z.z.'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'F | Dm | Bb C | F | Bb | Gm | Am Dm | Gm C',
      parts: {
        cl: LEAD_A,
        st: 'x---------------',
        pz: PZ,
        tw: '................|................|................|................|1.3.5.3.1.3.5.3.',
        bs: 'r-t-F-a-',
        br: 'z.z.z.z.z.z.z.z.',
        dr: "k...p'...k...p'..."
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'F | Dm | Bb | C | Gm | Am | Bb C | F',
      parts: {
        fl: LYRIC_B,
        st: 'x---------------',
        hp: '12343232',
        pz: '..x...x.',
        bs: 'r---F---',
        br: 'z.z.z.z.z.z.z.z.',
        dr: "k...p'...k...p'..."
      }
    },
    {
      name: 'C',
      bars: 8,
      chords: 'Dm | Gm | Bb | C | Dm | Gm | Bb C | Gm C',
      parts: {
        cel: seq(
          motifHead(65, 'major', -2, { vel: 0.6 }),
          motifHead(65, 'major', -4, { vel: 0.62 }),
          motifHead(65, 'major', -2, { vel: 0.64 }),
          motifHead(65, 'major', -3, { vel: 0.66 }),
          motifHead(65, 'major', -2, { vel: 0.68 }),
          motifHead(65, 'major', -4, { vel: 0.7 }),
          m4('v6 o5 d4 f4 e4 g4'),
          m4('v6 o5 d4 <b-4 >g2')
        ),
        cl: m4('v4 o4 a1 | b-1 | b-1 | g1 | a1 | b-1 | f2 e2 | b-2 g2'),
        st: 'x---------------',
        pz: '..x...x.',
        bs: 'r---F---',
        br: 'z...z...z...z...'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'F | Dm | Bb C | F | Bb | Gm | Am Dm | Gm C',
      parts: {
        cl: LEAD_A,
        fl: transpose(LEAD_A, 12),
        cel: seq(r4(4), transpose(m4('v5 o4 b-4. >c8 d4 f4 | o5 g4. f8 d4 <b-4 | >c4 e4 d4 f4 | <b-4 >d4 e2'), 24)),
        st: 'x---------------',
        pz: PZ,
        hp: '12343232',
        tw: '1.3.5.3.1.3.5.3.',
        bs: 'r-t-F-a-',
        br: 'z.z.z.z.z.z.z.z.',
        dr: "k...p'...k...p'..."
      }
    }
  ]
}
