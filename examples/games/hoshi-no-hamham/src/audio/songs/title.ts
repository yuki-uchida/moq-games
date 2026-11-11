import { transpose, type SongDef } from '../notation'
import { m4, majorKey, motif, motifHead, r4, seq, withFill, type KeyInfo } from './util'

/**
 * 「星のハムハム」 the main theme. C major, 132 bpm, 4/4, loop of 40 bars (about 73 s) after a 4-bar intro.
 *
 * Form: intro (the ハムハム head climbing through C-Am-F-G) / A (the leitmotif in the square lead, answered by a
 * rising phrase that ends on a half cadence) / B (a lyrical flute tune over Am-F-C/E-G, square harmony below) /
 * A2 (flute takes the tune, chip counter-line, glock echo) / bridge (the motif's first bar falling in sequence over
 * a descending bass, then rising with the flute an octave above) / A' (everything: lead, flute and glock in three
 * octaves, pulse counter-line, full percussion), which turns around into A again.
 *
 * Instruments: square lead, flute, glockenspiel, pulse counter-line; strings pad, pizzicato offbeat stabs, harp
 * arpeggios; walking bass; kit with a shaker/tambourine layer.
 */
export const KEY: KeyInfo = majorKey(0)

/** The tune of A: the leitmotif, then an answer that climbs to A5 and rests on a half cadence. */
const LEAD_A = seq(
  motif(60, 'major', { vel: 0.8 }),
  m4('v6 o5 c4 c8 d8 f4 e8 d8 | o5 d4. f8 a4 f4 | o5 g4 e4 c4 e4 | o5 f4 d4 o4 b2')
)
/** A chip counter-line of chord tones under the tune. */
const COUNTER_A = m4('v5 o4 g2 e2 | e2 c2 | a2 b2 | g1 | a2 f2 | f2 d2 | g2 e2 | f2 d2')
/** B: a singing tune of long and dotted notes with a single peak on the A above the staff. */
const LYRIC_B = m4(
  'v6 o5 e4. d8 c4 e4 | f4. e8 c4 f4 | e4. f8 g4 a4 | g2. f8 e8 | a2 e4 c4 | o4 b4. a8 g4 b4 | o5 d4 f4 a2 | g4 d4 o4 b2'
)
const HARMONY_B = m4('v4 o4 c2 e2 | a2 f2 | g2 e2 | d2 b2 | c2 e2 | g2 e2 | f2 d2 | b2 g2')

const DR_A = 'k.h.s.h.k.h.s.h.'
const PC_A = 'z.z.a.z.z.z.a.z.'

export const SONG: SongDef = {
  name: 'title',
  key: 'C major',
  bpm: 132,
  barTicks: 48,
  gain: 1.15,
  parts: [
    { id: 'ld', inst: 'square', role: 'melody', vol: 0.4, pan: -0.08, send: 0.15, chorus: 0.2 },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.62, pan: 0.18, send: 0.3 },
    { id: 'gl', inst: 'glock', role: 'melody', vol: 0.3, pan: 0.5, send: 0.4 },
    { id: 'cn', inst: 'pulse', role: 'melody', vol: 0.24, pan: -0.4, send: 0.15 },
    {
      id: 'st',
      inst: 'strings',
      role: 'chord',
      vol: 0.5,
      pan: -0.2,
      send: 0.35,
      chorus: 0.5,
      center: 64,
      gate: 0.99,
      vel: 0.5
    },
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.55, pan: 0.3, send: 0.2, center: 66, vel: 0.62, gate: 0.6 },
    { id: 'hp', inst: 'harp', role: 'chord', vol: 0.5, pan: -0.45, send: 0.4, center: 62, vel: 0.55, gate: 0.95 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.72, center: 36, vel: 0.78, gate: 0.8 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.55, vel: 0.65 },
    { id: 'pc', inst: 'kit', role: 'drum', vol: 0.35, vel: 0.55, pan: -0.15 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'C | Am | F | G',
      parts: {
        ld: seq(
          motifHead(60, 'major', 0, { vel: 0.7 }),
          motifHead(60, 'major', -2, { vel: 0.72 }),
          motifHead(60, 'major', -4, { vel: 0.74 }),
          motifHead(60, 'major', -3, { vel: 0.8 })
        ),
        gl: seq(r4(2), motifHead(72, 'major', -4, { vel: 0.55 }), motifHead(72, 'major', -3, { vel: 0.6 })),
        hp: '12343232',
        st: '................|................|x---------------|x---------------',
        bs: '................|................|r.r.F.r.|r.r.F.a.',
        dr: '................|................|k...k...k...k...|k.s.k.s.ssssssss'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'C | Am | F G | C | F | Dm | C/E Am | Dm G',
      parts: {
        ld: LEAD_A,
        st: 'x---------------',
        pz: '.x.x.x.x',
        bs: 'r.r.F.r.',
        dr: withFill(DR_A, 8, 'k.h.s.h.k.s.ssss'),
        pc: PC_A
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Am | F | C/E | G | Am | Em | Dm | G',
      parts: {
        fl: LYRIC_B,
        ld: HARMONY_B,
        st: 'x---------------',
        hp: '12343232',
        bs: 'r---F---',
        dr: 'k...p...k...p...',
        pc: 'z.z.z.z.z.z.z.z.'
      }
    },
    {
      name: 'A2',
      bars: 8,
      chords: 'C | Am | F G | C | F | Dm | C/E Am | Dm G',
      parts: {
        fl: LEAD_A,
        ld: COUNTER_A,
        gl: seq(motif(72, 'major', { vel: 0.5, gate: 0.8 }), r4(4)),
        st: 'x---------------',
        pz: '.x.x.x.x',
        hp: '12343232',
        bs: 'r-r-F-n-',
        dr: withFill(DR_A, 8, 'k.h.s.h.k.s.ssss'),
        pc: PC_A
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Am | Em/G | F | C/E | Dm | Am/C | G/B | G',
      parts: {
        ld: seq(
          motifHead(60, 'major', -2, { vel: 0.7 }),
          motifHead(60, 'major', -3, { vel: 0.7 }),
          motifHead(60, 'major', -4, { vel: 0.72 }),
          motifHead(60, 'major', -5, { vel: 0.72 }),
          motifHead(60, 'major', -4, { vel: 0.78 }),
          motifHead(60, 'major', -2, { vel: 0.8 }),
          motifHead(60, 'major', -3, { vel: 0.82 }),
          m4('v7 o4 g4 b4 o5 d2')
        ),
        fl: seq(
          r4(4),
          motifHead(72, 'major', -4, { vel: 0.62 }),
          motifHead(72, 'major', -2, { vel: 0.66 }),
          motifHead(72, 'major', -3, { vel: 0.7 }),
          m4('v7 o5 d4 g4 b2')
        ),
        st: 'x---------------',
        hp: '1234543212345432',
        bs: 'r---r---',
        dr: 'D...K...D...K...|D...K...D...K...|D...K...D...K...|D...K...D...K...|D.K.D.K.D.K.D.K.|D.K.D.K.D.K.D.K.|D.K.D.K.D.K.D.K.|ttttTTTTssssssss',
        pc: 'g...............|................|................|................|z.z.z.z.z.z.z.z.|z.z.z.z.z.z.z.z.|z.z.z.z.z.z.z.z.|z.z.z.z.z.z.z.z.'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'C | Am | F G | C | F | Dm | C/E Am | Dm G',
      parts: {
        ld: LEAD_A,
        fl: transpose(LEAD_A, 12),
        gl: transpose(LEAD_A, 24),
        cn: COUNTER_A,
        st: 'x---------------',
        pz: '.x.x.x.x',
        hp: '12343232',
        bs: 'r.r.F.r.|r.r.F.r.|r.r.F.r.|r.r.F.r.|r.rrF.rr|r.rrF.rr|r.rrF.rr|r.rrF.ra',
        dr: withFill(DR_A, 8, 'k.s.k.s.ssssssss'),
        pc: PC_A
      }
    }
  ]
}
