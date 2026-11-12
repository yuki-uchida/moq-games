import { transpose, type SongDef } from '../notation'
import { m4, majorKey, motif, seq, type KeyInfo } from './util'

/**
 * 「アニマフロント」 the main theme. C major, 108 bpm, 4/4; a 4-bar intro, then a loop of 32 bars (about 71 s).
 * The hopeful ANIMA motif (a bugle call up a fourth, then a falling answer) is played by the horn in the intro and by
 * the brass in A; B is a lyrical horn tune; A2 returns with a horn counter-line and a glockenspiel echo an octave up;
 * the bridge climbs in sequence to the top of the brass range and turns back on the dominant.
 * Instruments: brass and horn, glockenspiel; strings pad, marching pizzicato, harp; bass, timpani, snare and taiko.
 */
export const KEY: KeyInfo = majorKey(0)

const ANSWER = m4('v7 o5 e4. d8 c4 e4 | o5 f4. e8 c4 <a4 | o5 d4. e8 f4 a4 | o5 g2. b4')
const TUNE_A = seq(motif(60, 'major', { vel: 0.82 }), ANSWER)
const COUNTER = m4('v5 o4 e1 | d1 | c1 | d2 g2 | e1 | c1 | a1 | b1')
const LYRIC_B = m4(
  'v6 o4 e2 a4 >c4 | o5 c2 <a4 f4 | o4 g2 e4 g4 | o4 d2 g4 b4 | o5 e2 c4 <a4 | o4 a2 f4 a4 | o4 b2 >d4 <b4 | o4 a1'
)
const BRIDGE = m4(
  'v7 o5 e4 a4 >c2 | o5 g4 e4 b2 | o5 a4 f4 c2 | o5 e4 g4 >c2 | o5 a4 f4 d2 | o5 c4 e4 a2 | o5 b4 g4 d2 | o5 g2 e4 d4'
)

export const SONG: SongDef = {
  name: 'title',
  key: 'C major',
  bpm: 108,
  barTicks: 48,
  gain: 1,
  parts: [
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.8, pan: -0.1, send: 0.25 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.7, pan: -0.3, send: 0.3 },
    { id: 'gl', inst: 'glock', role: 'melody', vol: 0.28, pan: 0.5, send: 0.4 },
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
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.5, pan: 0.3, send: 0.2, center: 66, vel: 0.6, gate: 0.6 },
    { id: 'hp', inst: 'harp', role: 'chord', vol: 0.4, pan: -0.45, send: 0.4, center: 62, vel: 0.55, gate: 0.95 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.75, center: 36, vel: 0.78, gate: 0.8 },
    { id: 'tm', inst: 'timpani', role: 'bass', vol: 0.5, center: 36, vel: 0.7, send: 0.25 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.55, vel: 0.65 },
    { id: 'ht', inst: 'kit', role: 'drum', vol: 0.3, vel: 0.5, pan: 0.2 },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.7, pan: -0.15, send: 0.2 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'C | G | F | G C',
      parts: {
        hn: motif(60, 'major', { vel: 0.62 }),
        st: 'x---------------',
        tm: 'r...............|r...............|r.......r.......|r.r.r.r.',
        dr: 'c...............|................|s.s.s.s.s.s.s.s.|ssssssssssssssss'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'C | G | F | G C | Am | F | Dm | G',
      parts: {
        br: TUNE_A,
        st: 'x---------------',
        pz: '....x.......x...',
        bs: 'r.r.F.r.',
        tm: 'r...............',
        dr: 'k...s...k...s...|k...s...k...s...|k...s...k...s...|k...s...k.s.s.s.|k...s...k...s...|k...s...k...s...|k...s...k...s...|k...s...k.s.ssss',
        ht: 'h.h.h.h.h.h.h.h.'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Am | F | C/E | G | Am | F | G | Am',
      parts: {
        hn: LYRIC_B,
        st: 'x---------------',
        hp: '12343212',
        bs: 'r.......F.......',
        dr: 'k.......p.......',
        tk: 'D.......K.......'
      }
    },
    {
      name: 'A2',
      bars: 8,
      chords: 'C | G | F | G C | Am | F | Dm | G',
      parts: {
        br: TUNE_A,
        hn: COUNTER,
        gl: transpose(TUNE_A, 12),
        st: 'x---------------',
        pz: '....x.......x...',
        hp: '12343212',
        bs: 'r.r.F.r.',
        tm: 'r...............',
        dr: 'k...s...k...s...|k...s...k...s...|k...s...k...s...|k...s...k.s.s.s.|k...s...k...s...|k...s...k...s...|k...s...k...s...|k...s...k.s.ssss',
        ht: 'h.h.h.h.h.h.h.h.',
        tk: 'D.......K.......'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Am | Em/G | F | C/E | Dm | Am/C | G/B | G',
      parts: {
        br: BRIDGE,
        hn: transpose(BRIDGE, -12),
        st: 'x---------------',
        hp: '1234543212345432',
        bs: 'r.......r.......',
        tm: 'r...r...r...r...',
        dr: 'k.......k.......|k.......k.......|k.......k.......|k.......k.......|k.k.s.s.k.k.s.s.|k.k.s.s.k.k.s.s.|k.k.s.s.k.k.s.s.|k.s.s.s.ssssssss',
        tk: 'D.K.D.K.D.K.D.K.',
        ht: 'h.h.h.h.h.h.h.h.'
      }
    }
  ]
}
