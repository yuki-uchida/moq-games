import { transpose, type SongDef } from '../notation'
import { m4, minorKey, type KeyInfo } from './util'

/**
 * クイツクシ, the final fight: epic. E minor, 156 bpm, 4/4; a 4-bar intro, then a loop of 32 bars (about 49 s). Brass
 * and taiko drive A over a string ostinato; B lifts the strings into a singing line; A2 returns with a bell echo and a
 * horn pedal; the bridge climbs through the minor to the dominant (B major). Layer 1 (the core is exposed / the
 * last phase): a choir joins on every chord, the pulse arpeggio and toms double the drive, crashes mark the bars.
 */
export const KEY: KeyInfo = minorKey(4, [3])

const TUNE_A = m4(
  'v8 o4 e8 e8 g8 e8 b4 g4 | o5 c8 c8 e8 c8 g4 e4 | o4 a8 a8 >c8 <a8 >e4 c4 | o4 b8 b8 >d+8 <b8 >f+4 d+4 | o4 g8 g8 b8 g8 >e4 <b4 | o5 g8 g8 e8 g8 e4 c4 | o5 f+8 f+8 a8 f+8 d4 f+4 | o5 f+8 f+8 d+8 f+8 f+4 d+4'
)
const TUNE_A2 = m4(
  'v8 o4 e8 e8 g8 e8 b4 g4 | o5 c8 c8 e8 c8 g4 e4 | o4 a8 a8 >c8 <a8 >e4 c4 | o4 b8 b8 >d+8 <b8 >f+4 d+4 | o4 g8 g8 b8 g8 >e4 <b4 | o5 g8 g8 e8 g8 e4 c4 | o5 f+8 f+8 d+8 f+8 f+4 d+4 | o5 e2 g4 e4'
)
const STRINGS_B = m4(
  'v7 o5 g2 e4 c4 | o5 d2 g4 b4 | o5 c2 e4 a4 | o5 g2 b4 e4 | o5 e2 g4 e4 | o5 a2 f+4 d4 | o5 b2 f+4 d+4 | o5 e1'
)
const BRIDGE = m4(
  'v7 o5 c2 e4 a4 | o5 g2 e4 b4 | o5 g2 e4 c4 | o5 d2 g4 b4 | o5 a2 e4 c4 | o5 d2 a4 f+4 | o5 b2 f+4 d+4 | o5 f+2 d+4 b4'
)
const COUNTER_B = m4('v5 o4 g1 | b1 | e1 | g1 | g1 | f+1 | f+1 | g1')
const COUNTER_A2 = m4('v5 o4 g1 | e1 | c1 | b1 | g1 | e1 | b1 | b1')

export const SONG: SongDef = {
  name: 'finalBoss',
  key: 'E minor',
  bpm: 156,
  barTicks: 48,
  gain: 0.83,
  parts: [
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.85, pan: -0.1, send: 0.25 },
    { id: 'st', inst: 'strings', role: 'melody', vol: 0.65, pan: 0.2, send: 0.35, chorus: 0.3 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.75, pan: -0.3, send: 0.3 },
    { id: 'bl', inst: 'bell', role: 'melody', vol: 0.25, pan: 0.5, send: 0.4 },
    {
      id: 'os',
      inst: 'strings',
      role: 'chord',
      vol: 0.4,
      pan: -0.15,
      send: 0.25,
      chorus: 0.3,
      center: 66,
      vel: 0.7,
      gate: 0.5
    },
    {
      id: 'pd',
      inst: 'pad',
      role: 'chord',
      vol: 0.4,
      pan: 0.1,
      send: 0.4,
      chorus: 0.5,
      center: 64,
      gate: 0.99,
      vel: 0.5
    },
    { id: 'bt', inst: 'brass', role: 'chord', vol: 0.65, pan: -0.25, send: 0.25, center: 64, vel: 0.8, gate: 0.35 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.8, center: 33, vel: 0.85, gate: 0.6 },
    { id: 'tm', inst: 'timpani', role: 'bass', vol: 0.6, center: 38, vel: 0.8, send: 0.25 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.75, vel: 0.75, pan: 0.05 },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.65, vel: 0.8, pan: -0.15, send: 0.2 },
    { id: 'ht', inst: 'kit', role: 'drum', vol: 0.3, vel: 0.5, pan: 0.2 },
    {
      id: 'ch',
      inst: 'choir',
      role: 'chord',
      vol: 0.55,
      pan: 0,
      send: 0.5,
      chorus: 0.3,
      center: 66,
      vel: 0.6,
      gate: 0.99,
      layer: 1
    },
    {
      id: 'ap',
      inst: 'pulse',
      role: 'chord',
      vol: 0.24,
      pan: 0.4,
      send: 0.2,
      center: 82,
      vel: 0.5,
      gate: 0.5,
      layer: 1
    },
    { id: 't2', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.75, pan: -0.2, send: 0.2, layer: 1 },
    { id: 'cy', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.7, pan: -0.25, layer: 1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Em | C | Am | B',
      parts: {
        os: '1.1.1.1.1.1.1.1.',
        bt: 'x...x...x.x.x.x.',
        bs: 'r.r.r.r.',
        tm: 'r...r...r...r...',
        dr: 'k...s...k...s...|k...s...k...s...|k.k.s...k.s.s.s.|ssssssssssssssss',
        tk: 'D...K...D...K...'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Em | C | Am | B | Em | C | D | B',
      parts: {
        br: TUNE_A,
        os: '1.1.1.1.1.1.1.1.',
        pd: 'x---------------',
        bt: 'x...x...x.x.x.x.',
        bs: 'rr.rr.r.',
        tm: 'r...r...r...r...',
        dr: 'k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.k.s.s.|k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.s.ssss',
        tk: 'D...K...D...K...',
        ht: 'h.h.h.h.h.h.h.h.',
        ch: 'x---------------',
        ap: '3.2.1.2.3.2.1.2.',
        t2: 'T.t.T.t.T.t.T.tt',
        cy: 'c...............|................'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'C | G | Am | Em | C | D | B | Em',
      parts: {
        st: STRINGS_B,
        hn: COUNTER_B,
        pd: 'x---------------',
        os: '1.2.3.2.1.2.3.2.',
        bs: 'r...F...r...F...',
        tm: 'r...............',
        dr: 'k...s...k...s...',
        tk: 'D.......K.......',
        ht: 'h.h.h.h.h.h.h.h.',
        ch: 'x---------------',
        ap: '3.2.1.2.3.2.1.2.',
        t2: 'T.t.T.t.T.t.T.tt'
      }
    },
    {
      name: 'A2',
      bars: 8,
      chords: 'Em | C | Am | B | Em | C | B | Em',
      parts: {
        br: TUNE_A2,
        bl: transpose(TUNE_A2, 12),
        hn: COUNTER_A2,
        os: '1.1.1.1.1.1.1.1.',
        pd: 'x---------------',
        bt: 'x...x...x.x.x.x.',
        bs: 'rr.rr.r.',
        tm: 'r...r...r...r...',
        dr: 'k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.k.s.s.|k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.s.ssss',
        tk: 'D...K...D...K...',
        ht: 'h.h.h.h.h.h.h.h.',
        ch: 'x---------------',
        ap: '3.2.1.2.3.2.1.2.',
        t2: 'T.t.T.t.T.t.T.tt',
        cy: 'c...............|................'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Am | Em | C | G | Am | D | B | B',
      parts: {
        br: BRIDGE,
        hn: transpose(BRIDGE, -12),
        pd: 'x---------------',
        os: '1.2.3.2.1.2.3.2.',
        bs: 'r.......r.......',
        tm: 'r.......r.......',
        dr: 'k.......s.......',
        tk: 'D.K.D.K.D.K.D.K.',
        ht: 'h.h.h.h.h.h.h.h.',
        ch: 'x---------------',
        ap: '3.2.1.2.3.2.1.2.',
        t2: 'T.t.T.t.T.t.T.tt',
        cy: 'c...............'
      }
    }
  ]
}
