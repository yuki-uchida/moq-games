import { transpose, type SongDef } from '../notation'
import { m4, majorKey, type KeyInfo } from './util'

/**
 * 三つ巴演習 (the three-way drill): energetic. A major, 148 bpm, 4/4; a 4-bar intro, then a loop of 32 bars (about
 * 52 s). A bright brass tune over sixteenth hats and a pumping bass; B is a singing horn line; A2 brings back the tune
 * with a horn counter-line and a glockenspiel octave; the bridge is a rising string sequence. Layer 1 (ラストスパート):
 * the brass doubles an octave down, a pulse arpeggio, toms and crashes push the tempo feel.
 */
export const KEY: KeyInfo = majorKey(9)

const TUNE_A = m4(
  'v8 o5 c+8 c+8 e8 c+8 a4 e4 | o5 e8 e8 g+8 e8 b4 g+4 | o5 f+8 f+8 a8 f+8 c+4 a4 | o5 d8 d8 f+8 d8 a4 f+4 | o5 e8 e8 a8 e8 c+4 e4 | o5 g+8 g+8 b8 g+8 e4 g+4 | o5 f+8 f+8 a8 f+8 d4 f+4 | o5 b4 g+4 e4 g+4'
)
const TUNE_A2 = m4(
  'v8 o5 c+8 c+8 e8 c+8 a4 e4 | o5 e8 e8 g+8 e8 b4 g+4 | o5 f+8 f+8 a8 f+8 c+4 a4 | o5 d8 d8 f+8 d8 a4 f+4 | o5 e8 e8 a8 e8 c+4 e4 | o5 g+8 g+8 b8 g+8 e4 g+4 | o5 f+8 f+8 a8 f+8 d4 f+4 | o5 e2 c+4 e4'
)
const LYRIC_B = m4(
  'v7 o5 c+2 <a4 f+4 | o4 a2 f+4 d4 | o4 c+2 e4 a4 | o4 b2 g+4 e4 | o4 a2 f+4 c+4 | o4 d2 f+4 a4 | o4 g+2 b4 >e4 | o4 f+1'
)
const BRIDGE = m4(
  'v7 o5 a2 f+4 d4 | o5 g+2 b4 e4 | o5 e2 g+4 c+4 | o5 a2 c+4 f+4 | o5 f+2 a4 d4 | o5 b2 g+4 e4 | o5 d2 f+4 b4 | o5 b2 g+4 e4'
)
const COUNTER_A2 = m4('v5 o4 c+1 | b1 | a1 | a1 | e1 | g+1 | f+1 | e1')

export const SONG: SongDef = {
  name: 'pvp',
  key: 'A major',
  bpm: 148,
  barTicks: 48,
  gain: 0.91,
  parts: [
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.8, pan: -0.1, send: 0.2 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.7, pan: -0.3, send: 0.3 },
    { id: 'st', inst: 'strings', role: 'melody', vol: 0.55, pan: 0.2, send: 0.35, chorus: 0.3 },
    { id: 'gl', inst: 'glock', role: 'melody', vol: 0.28, pan: 0.5, send: 0.4 },
    {
      id: 'pd',
      inst: 'strings',
      role: 'chord',
      vol: 0.45,
      pan: -0.2,
      send: 0.3,
      chorus: 0.4,
      center: 64,
      gate: 0.99,
      vel: 0.5
    },
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.5, pan: 0.3, send: 0.2, center: 66, vel: 0.6, gate: 0.6 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.8, center: 33, vel: 0.85, gate: 0.55 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.7, vel: 0.75 },
    { id: 'ht', inst: 'kit', role: 'drum', vol: 0.3, vel: 0.55, pan: 0.2 },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.7, pan: -0.15, send: 0.2 },
    { id: 'b2', inst: 'brass', role: 'melody', vol: 0.6, pan: -0.2, send: 0.2, layer: 1 },
    {
      id: 'ap',
      inst: 'pulse',
      role: 'chord',
      vol: 0.24,
      pan: 0.4,
      send: 0.2,
      center: 82,
      vel: 0.55,
      gate: 0.5,
      layer: 1
    },
    { id: 't2', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.75, pan: -0.2, send: 0.2, layer: 1 },
    { id: 'cy', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.7, pan: -0.25, layer: 1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'A | E | D | E',
      parts: {
        pz: '....x.......x...',
        bs: 'rrrrrrrr',
        dr: 'k...s...k...s...|k...s...k...s...|k.k.s...k.s.s.s.|ssssssssssssssss',
        ht: 'h.h.h.h.h.h.h.h.'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'A | E | F#m | D | A | E | D | E',
      parts: {
        br: TUNE_A,
        b2: transpose(TUNE_A, -12),
        pd: 'x---------------',
        pz: '..x...x...x...x.',
        bs: 'rrrrrrrr',
        dr: 'k...s...k...s...|k...s...k...s...|k...s...k...s...|k...s...k...s.s.|k...s...k...s...|k...s...k...s...|k...s...k...s...|k...s...k.s.ssss',
        ht: 'hhhhhhhhhhhhhhhh',
        tk: 'D...K...D...K...',
        ap: '3.2.1.2.3.2.1.2.',
        t2: 'T.t.T.t.T.t.T.tt',
        cy: 'c...............|................'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'F#m | D | A | E | F#m | D | E | F#m',
      parts: {
        hn: LYRIC_B,
        pd: 'x---------------',
        pz: '..x...x...x...x.',
        bs: 'r...F...r...F...',
        dr: 'k...s...k...s...',
        ht: 'h.h.h.h.h.h.h.h.',
        tk: 'D.......K.......',
        ap: '3.2.1.2.3.2.1.2.',
        t2: 'T.t.T.t.T.t.T.tt'
      }
    },
    {
      name: 'A2',
      bars: 8,
      chords: 'A | E | F#m | D | A | E | D | A',
      parts: {
        br: TUNE_A2,
        b2: transpose(TUNE_A2, -12),
        hn: COUNTER_A2,
        gl: transpose(TUNE_A2, 12),
        pd: 'x---------------',
        pz: '..x...x...x...x.',
        bs: 'rrrrrrrr',
        dr: 'k...s...k...s...|k...s...k...s...|k...s...k...s...|k...s...k...s.s.|k...s...k...s...|k...s...k...s...|k...s...k...s...|k...s...k.s.ssss',
        ht: 'hhhhhhhhhhhhhhhh',
        tk: 'D...K...D...K...',
        ap: '3.2.1.2.3.2.1.2.',
        t2: 'T.t.T.t.T.t.T.tt',
        cy: 'c...............|................'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'D | E | C#m | F#m | D | E | Bm | E',
      parts: {
        st: BRIDGE,
        hn: transpose(BRIDGE, -12),
        pd: 'x---------------',
        pz: '..x...x...x...x.',
        bs: 'r.r.r.r.r.r.r.r.',
        dr: 'k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.s.s.s.ssssssss',
        ht: 'hhhhhhhhhhhhhhhh',
        tk: 'D.K.D.K.D.K.D.K.',
        ap: '3.2.1.2.3.2.1.2.',
        t2: 'T.t.T.t.T.t.T.tt',
        cy: 'c...............'
      }
    }
  ]
}
