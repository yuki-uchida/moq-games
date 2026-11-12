import { transpose, type SongDef } from '../notation'
import { m4, minorKey, type KeyInfo } from './util'

/**
 * ゴウテツ and the big fights: heavy. D minor, 144 bpm, 4/4; a 4-bar intro, then a loop of 32 bars (about 53 s).
 * A pounding brass riff over taiko, timpani and a tight kit; B lifts the horns and strings into a sung line; A2
 * returns with a pulse-wave shadow and bell accents; the bridge climbs over a stomping half-time. Layer 1 (the boss
 * is hurt): a driving pulse arpeggio, extra toms and crashes.
 */
export const KEY: KeyInfo = minorKey(2, [1])

const TUNE_A = m4(
  'v8 o4 d8 d8 f8 d8 a4 f4 | o4 b-8 b-8 >d8 <b-8 f4 d4 | o4 g8 g8 b-8 g8 >d4 <b-4 | o4 a8 a8 >c+8 <a8 >e4 c+4 | o4 a8 a8 >d8 <a8 >f4 d4 | o4 b-8 b-8 >d8 <b-8 f4 d4 | o5 c8 c8 e8 c8 g4 e4 | o5 c+8 c+8 e8 c+8 e4 c+4'
)
const TUNE_A2 = m4(
  'v8 o4 d8 d8 f8 d8 a4 f4 | o4 b-8 b-8 >d8 <b-8 f4 d4 | o4 g8 g8 b-8 g8 >d4 <b-4 | o4 a8 a8 >c+8 <a8 >e4 c+4 | o4 a8 a8 >d8 <a8 >f4 d4 | o4 b-8 b-8 >d8 <b-8 f4 d4 | o5 c+8 c+8 e8 c+8 e4 c+4 | o5 d2 f4 d4'
)
const LYRIC_B = m4(
  'v7 o4 f2 a4 >d4 | o5 c2 <a4 f4 | o5 d2 f4 d4 | o5 e2 c+4 e4 | o5 f2 d4 f4 | o4 b-2 g4 >d4 | o5 c+2 e4 c+4 | o5 d1'
)
const BRIDGE = m4(
  'v7 o4 b-2 g4 >d4 | o5 f2 a4 f4 | o5 d2 f4 b-4 | o5 c2 a4 f4 | o5 d2 b-4 g4 | o5 e2 c+4 a4 | o5 f2 b-4 d4 | o5 c+2 e4 a4'
)
const COUNTER_B = m4('v5 o4 a1 | f1 | f1 | c+1 | d1 | g1 | a1 | f1')
const COUNTER_A2 = m4('v5 o4 a1 | f1 | d1 | e1 | a1 | f1 | a1 | a1')

export const SONG: SongDef = {
  name: 'boss',
  key: 'D minor',
  bpm: 144,
  barTicks: 48,
  gain: 0.86,
  parts: [
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.85, pan: -0.1, send: 0.2 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.75, pan: -0.3, send: 0.3 },
    { id: 'st', inst: 'strings', role: 'melody', vol: 0.6, pan: 0.2, send: 0.35, chorus: 0.3 },
    { id: 'bl', inst: 'bell', role: 'melody', vol: 0.25, pan: 0.5, send: 0.4 },
    {
      id: 'pd',
      inst: 'strings',
      role: 'chord',
      vol: 0.45,
      pan: -0.1,
      send: 0.3,
      chorus: 0.4,
      center: 64,
      gate: 0.99,
      vel: 0.5
    },
    { id: 'bt', inst: 'brass', role: 'chord', vol: 0.7, pan: -0.25, send: 0.25, center: 64, vel: 0.8, gate: 0.35 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.8, center: 33, vel: 0.85, gate: 0.6 },
    { id: 'rf', inst: 'pulse', role: 'bass', vol: 0.4, pan: 0.1, send: 0.1, center: 50, vel: 0.65, gate: 0.5 },
    { id: 'tm', inst: 'timpani', role: 'bass', vol: 0.6, center: 38, vel: 0.8, send: 0.25 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.75, vel: 0.75, pan: 0.05 },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.65, vel: 0.8, pan: -0.15, send: 0.2 },
    { id: 'ht', inst: 'kit', role: 'drum', vol: 0.3, vel: 0.5, pan: 0.2 },
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
    { id: 'cy', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.7, pan: -0.25, layer: 1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Dm | Bb | Gm | A',
      parts: {
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
      chords: 'Dm | Bb | Gm | A | Dm | Bb | C | A',
      parts: {
        br: TUNE_A,
        pd: 'x---------------',
        bt: 'x...x...x.x.x.x.',
        bs: 'rr.rr.r.',
        rf: 'r.rrr.r.r.rrr.F.',
        tm: 'r...r...r...r...',
        dr: 'k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.k.s.s.|k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.s.ssss',
        tk: 'D...K...D...K...',
        ht: 'h.h.h.h.h.h.h.h.',
        ap: '3.2.1.2.3.2.1.2.',
        t2: 'T.t.T.t.T.t.T.tt',
        cy: 'c...............|................'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Dm | F | Bb | A | Dm | Gm | A | Dm',
      parts: {
        hn: LYRIC_B,
        st: COUNTER_B,
        pd: 'x---------------',
        bs: 'r...F...r...F...',
        tm: 'r...............',
        dr: 'k...s...k...s...',
        tk: 'D.......K.......',
        ht: 'h.h.h.h.h.h.h.h.',
        ap: '3.2.1.2.3.2.1.2.',
        t2: 'T.t.T.t.T.t.T.tt'
      }
    },
    {
      name: 'A2',
      bars: 8,
      chords: 'Dm | Bb | Gm | A | Dm | Bb | A | Dm',
      parts: {
        br: TUNE_A2,
        bl: transpose(TUNE_A2, 12),
        st: COUNTER_A2,
        pd: 'x---------------',
        bt: 'x...x...x.x.x.x.',
        bs: 'rr.rr.r.',
        rf: 'r.rrr.r.r.rrr.F.',
        tm: 'r...r...r...r...',
        dr: 'k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.k.s.s.|k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.k.s...|k.k.s...k.s.ssss',
        tk: 'D...K...D...K...',
        ht: 'h.h.h.h.h.h.h.h.',
        ap: '3.2.1.2.3.2.1.2.',
        t2: 'T.t.T.t.T.t.T.tt',
        cy: 'c...............|................'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Gm | Dm | Bb | F | Gm | A | Bb | A',
      parts: {
        st: BRIDGE,
        hn: transpose(BRIDGE, -12),
        pd: 'x---------------',
        bs: 'r.......r.......',
        tm: 'r.......r.......',
        dr: 'k.......s.......',
        tk: 'D.K.D.K.D.K.D.K.',
        ht: 'h.h.h.h.h.h.h.h.',
        ap: '3.2.1.2.3.2.1.2.',
        t2: 'T.t.T.t.T.t.T.tt',
        cy: 'c...............'
      }
    }
  ]
}
