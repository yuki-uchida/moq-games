import { transpose, type SongDef } from '../notation'
import { m4, majorKey, type KeyInfo } from './util'

/**
 * Mission 1, the ruined old town: urban defence, driving and heroic. G major, 132 bpm, 4/4; a 4-bar intro, then a
 * loop of 32 bars (about 58 s). A: a rising brass tune over a pounding kit and eighth-note bass; B: a lyrical horn
 * tune; A2: the brass returns with a horn counter-line and a glockenspiel echo; bridge: a climbing sequence that
 * turns on the dominant. Layer 1 (the wave is on): taiko, a pulse arpeggio and timpani.
 */
export const KEY: KeyInfo = majorKey(7)

const TUNE_A = m4(
  'v7 o5 g4 d8 g8 b4 a8 g8 | o5 a4 f+8 d8 f+4 a4 | o5 g4 e8 g8 b4 g4 | o5 c4 e8 g8 >c4 <g4 | o5 d8 d8 g8 b8 g4 d4 | o5 f+8 f+8 a8 f+8 a4 f+4 | o5 e8 e8 g8 e8 >c4 <g4 | o5 a4 f+4 d4 f+4'
)
const TUNE_A2 = m4(
  'v7 o5 g4 d8 g8 b4 a8 g8 | o5 a4 f+8 d8 f+4 a4 | o5 g4 e8 g8 b4 g4 | o5 c4 e8 g8 >c4 <g4 | o5 d8 d8 g8 b8 g4 d4 | o5 f+8 f+8 a8 f+8 a4 f+4 | o5 c8 c8 e8 c8 g4 e4 | o5 g4 d4 b4 g4'
)
const COUNTER_BR = m4('v5 o4 e1 | d1 | b1 | g2 e2 | e1 | d1 | c1 | a1')
const COUNTER_A2 = m4('v5 o4 d1 | d1 | b1 | g2 e2 | b1 | a1 | e1 | d1')
const LYRIC_B = m4(
  'v6 o4 b2 g4 e4 | o4 g2 e4 c4 | o4 d2 g4 b4 | o5 d2 <a4 f+4 | o4 e2 g4 b4 | o5 c2 <g4 e4 | o4 a2 f+4 a4 | o4 g1'
)
const BRIDGE = m4(
  'v7 o5 e8 a8 >c8 <a8 e4 a4 | o5 a8 f+8 d8 f+8 a4 d4 | o5 b8 f+8 d8 f+8 b4 f+4 | o5 g8 e8 b8 g8 e4 g4 | o5 e8 g8 >c8 <g8 e4 g4 | o5 d8 g8 b8 g8 d4 b4 | o5 c8 e8 a8 e8 c4 e4 | o5 a4 f+4 a4 d4'
)

export const SONG: SongDef = {
  name: 'oldtown',
  key: 'G major',
  bpm: 132,
  barTicks: 48,
  gain: 1,
  parts: [
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.8, pan: -0.1, send: 0.2 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.7, pan: -0.3, send: 0.3 },
    { id: 'gl', inst: 'glock', role: 'melody', vol: 0.28, pan: 0.5, send: 0.4 },
    {
      id: 'st',
      inst: 'strings',
      role: 'chord',
      vol: 0.5,
      pan: -0.2,
      send: 0.3,
      chorus: 0.4,
      center: 64,
      gate: 0.99,
      vel: 0.5
    },
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.5, pan: 0.3, send: 0.2, center: 66, vel: 0.6, gate: 0.6 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.75, center: 36, vel: 0.8, gate: 0.6 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.65, vel: 0.7 },
    { id: 'ht', inst: 'kit', role: 'drum', vol: 0.3, vel: 0.5, pan: 0.2 },
    {
      id: 'ap',
      inst: 'pulse',
      role: 'chord',
      vol: 0.22,
      pan: 0.4,
      send: 0.2,
      center: 80,
      vel: 0.5,
      gate: 0.6,
      layer: 1
    },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.55, vel: 0.75, pan: -0.15, send: 0.2, layer: 1 },
    { id: 'tm', inst: 'timpani', role: 'bass', vol: 0.55, center: 36, vel: 0.75, send: 0.25, layer: 1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'G | D | Em | D',
      parts: {
        pz: '....x.......x...',
        bs: 'r.r.r.r.',
        dr: 'k...s...k...s...|k...s...k...s...|k.k.s...k.s.s.s.|ssssssssssssssss',
        tk: 'D...K...D...K...',
        tm: 'r...............'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'G | D | Em | C | G | D | C | D',
      parts: {
        br: TUNE_A,
        st: 'x---------------',
        pz: '....x.......x...',
        bs: 'rrrrrrrr',
        dr: 'k...s...k...s...|k...s...k...s...|k...s...k...s...|k...s...k...s.s.|k...s...k...s...|k...s...k...s...|k...s...k...s...|k...s...k.s.ssss',
        ht: 'h.h.h.h.h.h.h.h.',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D...K...D...K...',
        tm: 'r...r...r...r...'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Em | C | G | D | Em | C | D | Em',
      parts: {
        hn: LYRIC_B,
        st: 'x---------------',
        pz: '..x...x...x...x.',
        bs: 'r...r...F...r...',
        dr: 'k.......s.......',
        ht: 'h.h.h.h.h.h.h.h.',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.......K.......',
        tm: 'r...............'
      }
    },
    {
      name: 'A2',
      bars: 8,
      chords: 'G | D | Em | C | G | D | C | G',
      parts: {
        br: TUNE_A2,
        hn: COUNTER_A2,
        gl: transpose(TUNE_A2, 12),
        st: 'x---------------',
        pz: '....x.......x...',
        bs: 'rrrrrrrr',
        dr: 'k...s...k...s...|k...s...k...s...|k...s...k...s...|k...s...k...s.s.|k...s...k...s...|k...s...k...s...|k...s...k...s...|k...s...k.s.ssss',
        ht: 'h.h.h.h.h.h.h.h.',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D...K...D...K...',
        tm: 'r...r...r...r...'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Am | D | Bm | Em | C | G/B | Am | D',
      parts: {
        br: BRIDGE,
        hn: COUNTER_BR,
        st: 'x---------------',
        pz: '..x...x...x...x.',
        bs: 'r.r.r.r.',
        dr: 'k.k.s.s.k.k.s.s.|k.k.s.s.k.k.s.s.|k.k.s.s.k.k.s.s.|k.k.s.s.k.k.s.s.|k.k.s.s.k.k.s.s.|k.k.s.s.k.k.s.s.|k.k.s.s.k.k.s.s.|k.s.s.s.ssssssss',
        ht: 'h.h.h.h.h.h.h.h.',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.K.D.K.D.K.D.K.',
        tm: 'r...r...r...r...'
      }
    }
  ]
}
