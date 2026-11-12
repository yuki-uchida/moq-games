import { transpose, type SongDef } from '../notation'
import { m4, minorKey, type KeyInfo } from './util'

/**
 * Mission 3, the night raid: sneaking and dark. A minor, 84 bpm, 4/4; a 4-bar intro, then a loop of 32 bars (about
 * 91 s). A lone clarinet creeps over a sub drone, plucked low bass and sparse rim clicks; B lets a cold oboe sing over
 * muted strings; A2 returns with the strings on the tune; the bridge rises on a slow string line to the dominant.
 * Layer 1 (spotted): a nervous pulse, a heartbeat of taiko and hats.
 */
export const KEY: KeyInfo = minorKey(9, [8])

const TUNE_A = m4(
  'v6 o4 e2. a4 | o5 c2 e4 c4 | o4 a2. >c4 | o5 d2 f4 a4 | o5 e2. c4 | o4 b2 g4 e4 | o4 f2 a4 >c4 | o4 b2 g+4 e4'
)
const OBOE_B = m4(
  'v6 o5 c2. <a4 | o5 e2 g4 e4 | o5 f2 d4 a4 | o5 a2 e4 c4 | o5 c2. <a4 | o5 g2 e4 c4 | o5 g+2 b4 g+4 | o5 a1'
)
const BRIDGE = m4(
  'v6 o5 a2 f4 c4 | o5 d2 f4 a4 | o5 e2 a4 e4 | o5 e2 g+4 b4 | o5 c2 a4 f4 | o5 d2 g4 b4 | o5 b2 g+4 e4 | o5 g+2 b4 e4'
)
const COUNTER_B = m4('v4 o4 a1 | g1 | f1 | e1 | a1 | g1 | g+1 | e1')
const COUNTER_A2 = m4('v4 o4 a1 | e1 | c1 | d1 | e1 | g1 | a1 | g+1')

export const SONG: SongDef = {
  name: 'night',
  key: 'A minor',
  bpm: 84,
  barTicks: 48,
  gain: 1.13,
  parts: [
    { id: 'cl', inst: 'clarinet', role: 'melody', vol: 0.7, pan: -0.15, send: 0.4 },
    { id: 'ob', inst: 'oboe', role: 'melody', vol: 0.6, pan: 0.25, send: 0.4 },
    { id: 'st', inst: 'strings', role: 'melody', vol: 0.5, pan: -0.1, send: 0.45, chorus: 0.4 },
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
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.4, pan: 0.3, send: 0.3, center: 66, vel: 0.5, gate: 0.6 },
    { id: 'sb', inst: 'sub', role: 'bass', vol: 0.55, center: 28, vel: 0.7, gate: 0.99 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.6, center: 36, vel: 0.65, gate: 0.5 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.5, pan: 0.2 },
    {
      id: 'ap',
      inst: 'pulse',
      role: 'chord',
      vol: 0.2,
      pan: 0.4,
      send: 0.3,
      center: 76,
      vel: 0.45,
      gate: 0.4,
      layer: 1
    },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.65, pan: -0.15, send: 0.3, layer: 1 },
    { id: 'ht', inst: 'kit', role: 'drum', vol: 0.25, vel: 0.5, pan: 0.3, layer: 1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Am | Am | F | E',
      parts: {
        pd: 'x---------------',
        sb: 'r---------------',
        dr: 'p...............|................|p.......p.......|p.p.p.p.p.p.p.p.'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Am | Am | F | Dm | Am | Em | F | E',
      parts: {
        cl: TUNE_A,
        pd: 'x---------------',
        pz: '....x...........',
        sb: 'r---------------',
        bs: 'r.......r.......',
        dr: 'p.......p.......',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.......K.......',
        ht: 'h.h.h.h.h.h.h.h.'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'F | C | Dm | Am | F | C | E | Am',
      parts: {
        ob: OBOE_B,
        st: COUNTER_B,
        pd: 'x---------------',
        pz: '....x.......x...',
        sb: 'r---------------',
        bs: 'r.......F.......',
        dr: 'p.......p.......',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.......K.......',
        ht: 'h.h.h.h.h.h.h.h.'
      }
    },
    {
      name: 'A2',
      bars: 8,
      chords: 'Am | Am | F | Dm | Am | Em | F | E',
      parts: {
        st: TUNE_A,
        cl: COUNTER_A2,
        pd: 'x---------------',
        pz: '....x...........',
        sb: 'r---------------',
        bs: 'r.......r.......',
        dr: 'p.......p.......',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.......K.......',
        ht: 'h.h.h.h.h.h.h.h.'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'F | Dm | Am | E | F | G | E | E',
      parts: {
        st: transpose(BRIDGE, -12),
        ob: BRIDGE,
        pd: 'x---------------',
        pz: '....x...........',
        sb: 'r---------------',
        bs: 'r...r...r...r...',
        dr: 'p.p.p.p.p.p.p.p.',
        ap: '1.2.3.2.1.2.3.2.',
        tk: 'D.D.D.D.D.D.D.D.',
        ht: 'h.h.h.h.h.h.h.h.'
      }
    }
  ]
}
