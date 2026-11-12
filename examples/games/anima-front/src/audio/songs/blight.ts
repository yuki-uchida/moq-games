import { transpose, type SongDef } from '../notation'
import { m4, minorKey, type KeyInfo } from './util'

/**
 * Mission 4, the crystal blight: eerie and pulsing. B minor, 100 bpm, 4/4; a 4-bar intro, then a loop of 32 bars
 * (about 77 s). A choir floats over a restless sixteenth-note pulse arpeggio and a slow heartbeat of timpani;
 * glass-like celesta answers; B is a high string tune; A2 puts the choir an octave down under a celesta echo; the
 * bridge sinks and turns on the dominant. Layer 1: taiko, a faster upper pulse and ride.
 */
export const KEY: KeyInfo = minorKey(11)

const TUNE_A = m4(
  'v6 o4 f+2. b4 | o5 d2 <b4 g4 | o4 f+2. d4 | o4 a2 >c+4 <a4 | o4 b2. >d4 | o5 d2 <b4 g4 | o4 e2 g4 b4 | o4 f+2 a4 >c+4'
)
const STRINGS_B = m4(
  'v6 o5 g2 d4 b4 | o5 a2 f+4 d4 | o5 g2 e4 b4 | o5 d2 f+4 b4 | o5 b2 g4 d4 | o5 f+2 a4 f+4 | o5 c+2 a4 f+4 | o5 b1'
)
const BRIDGE = m4(
  'v6 o5 g2 b4 d4 | o5 a2 f+4 d4 | o5 g2 e4 b4 | o5 d2 f+4 b4 | o5 b2 g4 d4 | o5 g2 b4 e4 | o5 a2 c+4 f+4 | o5 c+2 a4 f+4'
)
const COUNTER_B = m4('v4 o4 b1 | f+1 | b1 | b1 | d1 | a1 | f+1 | d1')
const COUNTER_A2 = m4('v4 o4 b1 | g1 | b1 | a1 | f+1 | g1 | g1 | c+1')

export const SONG: SongDef = {
  name: 'blight',
  key: 'B minor',
  bpm: 100,
  barTicks: 48,
  gain: 1.33,
  parts: [
    { id: 'ch', inst: 'choir', role: 'melody', vol: 0.65, pan: -0.1, send: 0.55, chorus: 0.3 },
    { id: 'st', inst: 'strings', role: 'melody', vol: 0.55, pan: 0.15, send: 0.45, chorus: 0.4 },
    { id: 'cs', inst: 'celesta', role: 'melody', vol: 0.3, pan: 0.5, send: 0.5 },
    {
      id: 'pd',
      inst: 'pad',
      role: 'chord',
      vol: 0.42,
      pan: 0.1,
      send: 0.5,
      chorus: 0.5,
      center: 64,
      gate: 0.99,
      vel: 0.4
    },
    { id: 'pl', inst: 'pulse', role: 'chord', vol: 0.22, pan: -0.3, send: 0.3, center: 70, vel: 0.5, gate: 0.4 },
    { id: 'sb', inst: 'sub', role: 'bass', vol: 0.55, center: 24, vel: 0.7, gate: 0.99 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.6, center: 36, vel: 0.7, gate: 0.6 },
    { id: 'tm', inst: 'timpani', role: 'bass', vol: 0.5, center: 36, vel: 0.65, send: 0.35 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.5, pan: 0.2 },
    {
      id: 'ap',
      inst: 'pulse',
      role: 'chord',
      vol: 0.2,
      pan: 0.4,
      send: 0.3,
      center: 82,
      vel: 0.5,
      gate: 0.4,
      layer: 1
    },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.55, vel: 0.7, pan: -0.15, send: 0.3, layer: 1 },
    { id: 'rd', inst: 'kit', role: 'drum', vol: 0.25, vel: 0.5, pan: 0.3, layer: 1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Bm | G | Bm | F#m',
      parts: {
        pd: 'x---------------',
        pl: '1213121312131213',
        sb: 'r---------------',
        tm: 'r...............'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Bm | G | Bm | F#m | Bm | G | Em | F#m',
      parts: {
        ch: TUNE_A,
        pd: 'x---------------',
        pl: '1213121312131213',
        sb: 'r---------------',
        bs: 'r.......r.......',
        tm: 'r.......r.......',
        dr: 'p...p...p...p...',
        ap: '3.2.1.2.3.2.1.2.',
        tk: 'D.......K.......'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'G | D | Em | Bm | G | D | F#m | Bm',
      parts: {
        st: STRINGS_B,
        ch: COUNTER_B,
        pd: 'x---------------',
        pl: '1213121312131213',
        sb: 'r---------------',
        bs: 'r.......F.......',
        tm: 'r...............',
        dr: 'p...p...p...p...',
        ap: '3.2.1.2.3.2.1.2.',
        tk: 'D.......K.......',
        rd: 'r.r.r.r.r.r.r.r.'
      }
    },
    {
      name: 'A2',
      bars: 8,
      chords: 'Bm | G | Bm | F#m | Bm | G | Em | F#m',
      parts: {
        ch: transpose(TUNE_A, -12),
        cs: transpose(TUNE_A, 12),
        st: COUNTER_A2,
        pd: 'x---------------',
        pl: '1213121312131213',
        sb: 'r---------------',
        bs: 'r.......r.......',
        tm: 'r.......r.......',
        dr: 'p...p...p...p...',
        ap: '3.2.1.2.3.2.1.2.',
        tk: 'D.......K.......'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'G | D | Em | Bm | G | Em | F#m | F#m',
      parts: {
        st: transpose(BRIDGE, -12),
        ch: transpose(BRIDGE, -24),
        pd: 'x---------------',
        pl: '1213121312131213',
        sb: 'r---------------',
        bs: 'r...r...r...r...',
        tm: 'r...r...r...r...',
        dr: 'p.p.p.p.p.p.p.p.',
        ap: '3.2.1.2.3.2.1.2.',
        tk: 'D.D.D.D.D.D.D.D.',
        rd: 'r.r.r.r.r.r.r.r.'
      }
    }
  ]
}
