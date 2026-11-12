import { transpose, type SongDef } from '../notation'
import { m4, minorKey, motif, seq, type KeyInfo } from './util'

/**
 * Mission briefing. C minor, 92 bpm, 4/4; a 4-bar intro, then a loop of 32 bars (about 84 s). Tense and watchful:
 * a tight rim-click tick under held pads and a sub drone, the title motif in the minor (horn, A), a lonely oboe
 * tune (B), and a bridge where the strings climb. A2 hands the motif to the strings with the horn underneath.
 */
export const KEY: KeyInfo = minorKey(0, [11])

const ANSWER = m4('v6 o5 c4. d8 e-4 c4 | o5 e-4. d8 <b-4 >d4 | o5 f4. e-8 c4 e-4 | o4 b2. >d4')
const TUNE = seq(motif(60, 'minor', { vel: 0.72 }), ANSWER)
const TUNE_2 = seq(
  motif(60, 'minor', { vel: 0.72 }),
  m4('v6 o5 c4. d8 e-4 c4 | o5 e-4. d8 <b-4 >d4 | o5 d4. e-8 <b4 >d4 | o5 c1')
)
const OBOE_B = m4(
  'v6 o5 g2 e-4 c4 | o5 c2 e-4 a-4 | o5 g2 e-4 <b-4 | o5 d2 f4 d4 | o5 c2 a-4 f4 | o5 e-2 g4 c4 | o5 d2 b4 g4 | o5 c1'
)
const BRIDGE = m4(
  'v6 o5 f2 a-4 c4 | o5 e-2 g4 e-4 | o5 c2 e-4 a-4 | o5 g2 e-4 g4 | o5 a-2 f4 c4 | o5 d2 f4 b-4 | o5 b2 g4 d4 | o5 d2 b4 g4'
)
const COUNTER = m4('v4 o4 g1 | d1 | c1 | g2 g2 | c1 | g1 | c1 | d1')
const COUNTER_A2 = m4('v4 o4 g1 | d1 | c1 | g2 g2 | c1 | g1 | d1 | g1')
const COUNTER_B = m4('v4 o4 g1 | e-1 | g1 | f1 | c1 | g1 | d1 | g1')

export const SONG: SongDef = {
  name: 'briefing',
  key: 'C minor',
  bpm: 92,
  barTicks: 48,
  gain: 1,
  parts: [
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.75, pan: -0.3, send: 0.35 },
    { id: 'ob', inst: 'oboe', role: 'melody', vol: 0.6, pan: 0.25, send: 0.35 },
    { id: 'st', inst: 'strings', role: 'melody', vol: 0.55, pan: -0.1, send: 0.4, chorus: 0.4 },
    {
      id: 'pd',
      inst: 'pad',
      role: 'chord',
      vol: 0.5,
      pan: 0.1,
      send: 0.45,
      chorus: 0.5,
      center: 64,
      gate: 0.99,
      vel: 0.5
    },
    { id: 'pl', inst: 'pulse', role: 'chord', vol: 0.2, pan: 0.4, send: 0.2, center: 72, vel: 0.5, gate: 0.4 },
    { id: 'sb', inst: 'sub', role: 'bass', vol: 0.6, center: 28, vel: 0.7, gate: 0.99 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.55, center: 36, vel: 0.7, gate: 0.7 },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.5, pan: 0.2 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.6, send: 0.2 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Cm | Gm | Fm | Gm Cm',
      parts: {
        pd: 'x---------------',
        sb: 'r---------------',
        tk: 'p.p.p.p.p.p.p.p.',
        dr: 'D...............|................|D...............|D.......K.K.K.K.'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Cm | Gm | Fm | Gm Cm | Ab | Eb | Fm | G',
      parts: {
        hn: TUNE,
        pd: 'x---------------',
        pl: '1.1.1.1.1.1.1.1.',
        sb: 'r---------------',
        bs: 'r.......r.......',
        tk: 'p.p.p.p.p.p.p.p.',
        dr: 'D...............|........K.......'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Cm | Ab | Eb | Bb | Fm | Cm | G7 | Cm',
      parts: {
        ob: OBOE_B,
        st: COUNTER_B,
        pd: 'x---------------',
        pl: '1.2.3.2.1.2.3.2.',
        sb: 'r---------------',
        bs: 'r.......F.......',
        tk: 'p.p.p.p.p.p.p.p.',
        dr: 'D.......K.......'
      }
    },
    {
      name: 'A2',
      bars: 8,
      chords: 'Cm | Gm | Fm | Gm Cm | Ab | Eb | G | Cm',
      parts: {
        st: TUNE_2,
        hn: COUNTER_A2,
        pd: 'x---------------',
        pl: '1.1.1.1.1.1.1.1.',
        sb: 'r---------------',
        bs: 'r.......r.......',
        tk: 'p.p.p.p.p.p.p.p.',
        dr: 'D.......K.......'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Fm | Cm | Ab | Eb | Fm | Bb | G | G',
      parts: {
        st: BRIDGE,
        hn: transpose(BRIDGE, -12),
        pd: 'x---------------',
        pl: '1.2.3.2.1.2.3.2.',
        sb: 'r---------------',
        bs: 'r...r...r...r...',
        tk: 'p.p.p.p.p.p.p.p.',
        dr: 'D.D.D.D.D.D.D.D.|D.D.D.D.D.D.D.D.|D.D.D.D.D.D.D.D.|D.D.D.D.D.D.D.D.|D.D.D.D.D.D.D.D.|D.D.D.D.D.D.D.D.|D.D.D.D.D.D.D.D.|DDDDKKKKttttTTTT'
      }
    }
  ]
}
