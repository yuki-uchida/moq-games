import { transpose, type SongDef } from '../notation'
import { m4, minorKey, type KeyInfo } from './util'

/**
 * Mission 2, the harbor: machines, metallic and syncopated. E minor, 112 bpm, 4/4; a 4-bar intro, then a loop of
 * 32 bars (about 69 s). The lead is a bell playing 3-3-2 figures over off-beat brass stabs, a ride and rim kit and a
 * pulse-wave bass riff. B is a horn tune, A2 doubles the bell with pizzicato, the bridge cuts into eighth-note runs.
 * Layer 1: taiko, a high pulse arpeggio and open hats.
 */
export const KEY: KeyInfo = minorKey(4)

const TUNE_A = m4(
  'v7 o5 e4. g4. b4 | o5 c4. e4. g4 | o5 g4. b4. >d4 | o5 a4. f+4. d4 | o5 g4. e4. b4 | o5 a4. e4. c4 | o5 g4. e4. c4 | o5 d4. f+4. b4'
)
const TUNE_A2 = m4(
  'v7 o5 e4. g4. b4 | o5 c4. e4. g4 | o5 g4. b4. >d4 | o5 a4. f+4. d4 | o5 g4. e4. b4 | o5 a4. e4. c4 | o5 d4. f+4. b4 | o5 e4. g4. b4'
)
const LYRIC_B = m4(
  'v6 o4 e4. g8 >c4 <g4 | o4 d4. g8 b4 g4 | o4 a4. f+8 d4 f+4 | o4 g4. b8 >e4 <b4 | o4 e4. g8 >c4 <g4 | o4 g4. b8 >d4 <b4 | o4 f+4. d8 b4 f+4 | o4 e1'
)
const BRIDGE = m4(
  'v7 o5 c8 e8 a4 e4 a4 | o5 b8 g8 e4 b4 g4 | o5 g8 e8 c4 g4 e4 | o5 b8 g8 d4 b4 g4 | o5 e8 c8 a4 e4 c4 | o5 a8 f+8 d4 a4 f+4 | o5 e8 g8 >c4 <g4 e4 | o5 f+8 d8 b4 f+4 d4'
)
const COUNTER_B = m4('v5 o4 r2. e4 | b1 | a1 | g1 | e1 | d1 | f+1 | b1')
const COUNTER_A2 = m4('v5 o4 b1 | g1 | d1 | f+1 | b1 | a1 | f+1 | b1')

export const SONG: SongDef = {
  name: 'harbor',
  key: 'E minor',
  bpm: 112,
  barTicks: 48,
  gain: 1.22,
  parts: [
    { id: 'bl', inst: 'bell', role: 'melody', vol: 0.55, pan: 0.15, send: 0.3 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.7, pan: -0.3, send: 0.3 },
    { id: 'pz', inst: 'pizz', role: 'melody', vol: 0.5, pan: 0.35, send: 0.2 },
    { id: 'bt', inst: 'brass', role: 'chord', vol: 0.7, pan: -0.25, send: 0.25, center: 64, vel: 0.8, gate: 0.35 },
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
      vel: 0.45
    },
    { id: 'rf', inst: 'pulse', role: 'bass', vol: 0.5, pan: 0.1, send: 0.1, center: 52, vel: 0.65, gate: 0.5 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.75, center: 36, vel: 0.8, gate: 0.6 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.65, vel: 0.7 },
    { id: 'rd', inst: 'kit', role: 'drum', vol: 0.3, vel: 0.5, pan: 0.2 },
    {
      id: 'ap',
      inst: 'pulse',
      role: 'chord',
      vol: 0.22,
      pan: 0.4,
      send: 0.2,
      center: 80,
      vel: 0.5,
      gate: 0.5,
      layer: 1
    },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.55, vel: 0.75, pan: -0.15, send: 0.2, layer: 1 },
    { id: 'oh', inst: 'kit', role: 'drum', vol: 0.3, vel: 0.5, pan: 0.3, layer: 1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Em | C | G | Bm',
      parts: {
        bt: 'x.....x.....x...',
        pd: 'x---------------',
        bs: 'r..r..r.',
        dr: 'k..k..k.k..k..s.|k..k..k.k..k..s.|k..k..k.k..k..s.|k..k..k.ssssssss',
        rd: 'r.r.r.r.r.r.r.r.'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Em | C | G | D | Em | Am | C | Bm',
      parts: {
        bl: TUNE_A,
        bt: 'x.....x.....x...',
        pd: 'x---------------',
        rf: 'r..r..r.r..r..F.',
        bs: 'r.......r.......',
        dr: 'k..k..s.k..k..s.|k..k..s.k..k..s.|k..k..s.k..k..s.|k..k..s.k..k.ss.',
        rd: 'r.r.r.r.r.r.r.r.',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.....K.D.....K.',
        oh: '..o...o...o...o.'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'C | G | D | Em | C | G | Bm | Em',
      parts: {
        hn: LYRIC_B,
        bl: COUNTER_B,
        bt: 'x.....x.....x...',
        pd: 'x---------------',
        rf: 'r..r..r.r..r..F.',
        bs: 'r.......F.......',
        dr: 'k.....s.k.....s.',
        rd: 'r.r.r.r.r.r.r.r.',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.......K.......'
      }
    },
    {
      name: 'A2',
      bars: 8,
      chords: 'Em | C | G | D | Em | Am | Bm | Em',
      parts: {
        bl: TUNE_A2,
        pz: transpose(TUNE_A2, -12),
        hn: COUNTER_A2,
        bt: 'x.....x.....x...',
        pd: 'x---------------',
        rf: 'r..r..r.r..r..F.',
        bs: 'r.......r.......',
        dr: 'k..k..s.k..k..s.|k..k..s.k..k..s.|k..k..s.k..k..s.|k..k..s.k..k.ss.',
        rd: 'r.r.r.r.r.r.r.r.',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.....K.D.....K.',
        oh: '..o...o...o...o.'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Am | Em | C | G | Am | D | C | Bm',
      parts: {
        bl: BRIDGE,
        pz: transpose(BRIDGE, -12),
        bt: 'x.x.x.x.x.x.x.x.',
        pd: 'x---------------',
        rf: 'r.r.r.r.r.r.r.F.',
        bs: 'r...r...r...r...',
        dr: 'k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.s.s.s.ssssssss',
        rd: 'r.r.r.r.r.r.r.r.',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.K.D.K.D.K.D.K.',
        oh: '..o...o...o...o.'
      }
    }
  ]
}
