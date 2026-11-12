import { transpose, type SongDef } from '../notation'
import { m4, majorKey, motif, r4, seq, type KeyInfo } from './util'

/**
 * Base, loadout and lobby. F major, 84 bpm, 4/4; a 4-bar intro, then a loop of 32 bars (about 91 s). Calm, warm
 * and a little melancholy: the title motif returns softly in the strings (A) and in the horn (A2), a tender horn tune
 * carries B, and the bridge sings over a slow descending bass. Strings, horn, celesta, harp and a soft pad over a
 * brush-like kit.
 */
export const KEY: KeyInfo = majorKey(5)

export const ANSWER = m4('v6 o5 d4. e8 f4 a4 | o5 d4. f8 b-4 f4 | o5 g4. f8 d4 b-4 | o5 c2. e4')
export const TUNE = seq(motif(65, 'major', { vel: 0.7 }), ANSWER)
export const LYRIC_B = m4(
  'v6 o4 a2 f4 d4 | o4 d2 f4 b-4 | o5 c2 <a4 f4 | o4 g2 e4 g4 | o4 f2 a4 >d4 | o5 d2 c4 <b-4 | o4 g2 e4 g4 | o4 d1'
)
export const BRIDGE = m4(
  'v6 o5 d2 f4 b-4 | o5 a2 f4 c4 | o5 b-2 g4 d4 | o5 f2 d4 <a4 | o5 d2 f4 d4 | o5 g2 b-4 g4 | o5 e2 g4 e4 | o5 g2 e4 d4'
)
export const COUNTER_B = m4('v4 o4 a1 | f1 | a1 | g2 c2 | a1 | f1 | g1 | a1')
export const COUNTER_A2 = m4('v4 o4 a1 | g1 | f1 | g2 c2 | f1 | f1 | g1 | a1')
/** A2 closes on the tonic instead of the dominant. */
export const TUNE_2 = seq(
  motif(65, 'major', { vel: 0.7 }),
  m4('v6 o5 d4. e8 f4 a4 | o5 d4. f8 b-4 f4 | o5 e4. d8 c4 e4 | o5 a1')
)

export const SONG: SongDef = {
  name: 'menu',
  key: 'F major',
  bpm: 84,
  barTicks: 48,
  gain: 1.23,
  parts: [
    { id: 'st', inst: 'strings', role: 'melody', vol: 0.6, pan: -0.15, send: 0.4, chorus: 0.4 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.7, pan: -0.3, send: 0.35 },
    { id: 'cl', inst: 'celesta', role: 'melody', vol: 0.3, pan: 0.5, send: 0.45 },
    {
      id: 'pd',
      inst: 'pad',
      role: 'chord',
      vol: 0.45,
      pan: 0.1,
      send: 0.4,
      chorus: 0.5,
      center: 64,
      gate: 0.99,
      vel: 0.45
    },
    { id: 'hp', inst: 'harp', role: 'chord', vol: 0.5, pan: -0.45, send: 0.4, center: 64, vel: 0.5, gate: 0.95 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.65, center: 36, vel: 0.7, gate: 0.9 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.5 },
    { id: 'sh', inst: 'kit', role: 'drum', vol: 0.25, vel: 0.5, pan: 0.25 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'F | C | Bb | C F',
      parts: {
        cl: motif(65, 'major', { vel: 0.5 }),
        pd: 'x---------------',
        hp: '12343212'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'F | C | Bb | C F | Dm | Bb | Gm | C',
      parts: {
        st: TUNE,
        cl: seq(r4(4), transpose(ANSWER, 12)),
        pd: 'x---------------',
        hp: '12343212',
        bs: 'r.......F.......',
        dr: 'k.......p.......',
        sh: 'z.z.z.z.z.z.z.z.'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Dm | Bb | F/A | C | Dm | Bb | C | Dm',
      parts: {
        hn: LYRIC_B,
        st: COUNTER_B,
        pd: 'x---------------',
        hp: '12343212',
        bs: 'r.......F.......',
        dr: 'k.......p.......',
        sh: 'z.z.z.z.z.z.z.z.'
      }
    },
    {
      name: 'A2',
      bars: 8,
      chords: 'F | C | Bb | C F | Dm | Bb | C | F',
      parts: {
        hn: transpose(TUNE_2, -12),
        st: COUNTER_A2,
        cl: transpose(TUNE_2, 12),
        pd: 'x---------------',
        hp: '12343212',
        bs: 'r.......F.......',
        dr: 'k.......p.......',
        sh: 'z.z.z.z.z.z.z.z.'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Bb | F/A | Gm | Dm/F | Bb | Gm | C | C',
      parts: {
        st: BRIDGE,
        hn: transpose(BRIDGE, -12),
        pd: 'x---------------',
        hp: '1234543212345432',
        bs: 'r---------------',
        dr: 'k...............',
        sh: 'z.z.z.z.z.z.z.z.'
      }
    }
  ]
}
