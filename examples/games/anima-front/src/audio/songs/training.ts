import { transpose, type SongDef } from '../notation'
import { m4, majorKey, type KeyInfo } from './util'

/**
 * 訓練場 (the training ground): light and practical. B-flat major, 112 bpm, 4/4; a 4-bar intro, then a loop of 32 bars
 * (about 69 s). A bouncy flute tune over plucked chords, a bell-bright marimba-like celesta and a soft kit; B is a
 * relaxed clarinet tune; A2 returns with a clarinet counter-line and a glockenspiel sparkle; the bridge doubles flute
 * and clarinet. Layer 1 (a drill is running): a pulse arpeggio and a tighter kit.
 */
export const KEY: KeyInfo = majorKey(10)

const TUNE_A = m4(
  'v6 o5 d8 f8 b-8 f8 d4 f4 | o5 c8 f8 a8 f8 c4 a4 | o5 d8 g8 b-8 g8 d4 g4 | o5 e-8 g8 b-8 g8 e-4 g4 | o5 b-8 f8 d8 f8 b-4 f4 | o5 a8 f8 c8 f8 a4 c4 | o5 g8 e-8 g8 b-8 g4 e-4 | o5 a4 f4 c4 f4'
)
const TUNE_A2 = m4(
  'v6 o5 d8 f8 b-8 f8 d4 f4 | o5 c8 f8 a8 f8 c4 a4 | o5 d8 g8 b-8 g8 d4 g4 | o5 e-8 g8 b-8 g8 e-4 g4 | o5 b-8 f8 d8 f8 b-4 f4 | o5 a8 f8 c8 f8 a4 c4 | o5 g8 e-8 g8 b-8 g4 e-4 | o5 d4 f4 b-4 f4'
)
const LYRIC_B = m4(
  'v6 o4 b-2 g4 d4 | o4 g2 b-4 e-4 | o4 d2 f4 b-4 | o5 c2 <a4 f4 | o4 g2 b-4 >d4 | o5 e-2 <b-4 g4 | o4 a2 f4 a4 | o4 g1'
)
const BRIDGE = m4(
  'v6 o5 g2 e-4 b-4 | o5 a2 f4 c4 | o5 d2 f4 a4 | o5 b-2 g4 d4 | o5 e-2 g4 b-4 | o5 c2 a4 f4 | o5 c2 e-4 g4 | o5 a2 c4 f4'
)
const COUNTER_A2 = m4('v4 o4 f1 | c1 | d1 | g1 | f1 | c1 | b-1 | b-1')
const COUNTER_B = m4('v4 o4 d1 | e-1 | f1 | a1 | d1 | g1 | c1 | d1')

export const SONG: SongDef = {
  name: 'training',
  key: 'B-flat major',
  bpm: 112,
  barTicks: 48,
  gain: 1.07,
  parts: [
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.65, pan: 0.15, send: 0.3 },
    { id: 'cl', inst: 'clarinet', role: 'melody', vol: 0.65, pan: -0.25, send: 0.3 },
    { id: 'gl', inst: 'glock', role: 'melody', vol: 0.25, pan: 0.5, send: 0.4 },
    { id: 'cs', inst: 'celesta', role: 'chord', vol: 0.3, pan: 0.4, send: 0.35, center: 76, vel: 0.5, gate: 0.4 },
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.6, pan: -0.2, send: 0.2, center: 66, vel: 0.65, gate: 0.6 },
    {
      id: 'pd',
      inst: 'pad',
      role: 'chord',
      vol: 0.4,
      pan: 0.1,
      send: 0.35,
      chorus: 0.4,
      center: 64,
      gate: 0.99,
      vel: 0.45
    },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.7, center: 34, vel: 0.75, gate: 0.6 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.6 },
    { id: 'sh', inst: 'kit', role: 'drum', vol: 0.25, vel: 0.5, pan: 0.25 },
    {
      id: 'ap',
      inst: 'pulse',
      role: 'chord',
      vol: 0.2,
      pan: 0.4,
      send: 0.2,
      center: 80,
      vel: 0.5,
      gate: 0.5,
      layer: 1
    },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.65, pan: -0.15, layer: 1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Bb | F | Gm | F',
      parts: {
        pz: '..x...x...x...x.',
        pd: 'x---------------',
        bs: 'r.r.r.r.',
        dr: 'k...s...k...s...',
        sh: 'z.z.z.z.z.z.z.z.'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Bb | F | Gm | Eb | Bb | F | Eb | F',
      parts: {
        fl: TUNE_A,
        pz: '..x...x...x...x.',
        pd: 'x---------------',
        cs: '1.2.3.2.1.2.3.2.',
        bs: 'r...F...r...F...',
        dr: 'k...s...k...s...',
        sh: 'z.z.z.z.z.z.z.z.',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.......K.......'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Gm | Eb | Bb | F | Gm | Eb | F | Gm',
      parts: {
        cl: LYRIC_B,
        fl: COUNTER_B,
        pz: '..x...x...x...x.',
        pd: 'x---------------',
        cs: '1.2.3.2.1.2.3.2.',
        bs: 'r.......F.......',
        dr: 'k.......s.......',
        sh: 'z.z.z.z.z.z.z.z.',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.......K.......'
      }
    },
    {
      name: 'A2',
      bars: 8,
      chords: 'Bb | F | Gm | Eb | Bb | F | Eb | Bb',
      parts: {
        fl: TUNE_A2,
        cl: COUNTER_A2,
        gl: transpose(TUNE_A2, 12),
        pz: '..x...x...x...x.',
        pd: 'x---------------',
        cs: '1.2.3.2.1.2.3.2.',
        bs: 'r...F...r...F...',
        dr: 'k...s...k...s...',
        sh: 'z.z.z.z.z.z.z.z.',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.......K.......'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Eb | F | Dm | Gm | Eb | F | Cm | F',
      parts: {
        fl: BRIDGE,
        cl: transpose(BRIDGE, -12),
        pz: '..x...x...x...x.',
        pd: 'x---------------',
        cs: '1.2.3.2.1.2.3.2.',
        bs: 'r...r...r...r...',
        dr: 'k...s...k...s...',
        sh: 'z.z.z.z.z.z.z.z.',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.K.D.K.D.K.D.K.'
      }
    }
  ]
}
