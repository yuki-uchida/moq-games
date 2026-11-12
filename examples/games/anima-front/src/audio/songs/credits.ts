import { transpose, type SongDef } from '../notation'
import { majorKey, motif, type KeyInfo } from './util'
import { BRIDGE, COUNTER_A2, COUNTER_B, LYRIC_B, TUNE, TUNE_2 } from './menu'

/**
 * The staff roll: the title motif in full, warm and proud. D major, 96 bpm, 4/4; a 4-bar intro, then a loop of
 * 32 bars (about 80 s). The tunes are the menu's, lifted into D and orchestrated bigger: brass on the motif (A), horn
 * on the lyrical B over strings, strings with a glockenspiel echo and a brass counter-line (A2), then a bridge that
 * climbs under a growing drum line and turns on the dominant.
 */
export const KEY: KeyInfo = majorKey(2)

const T = (p: Parameters<typeof transpose>[0]) => transpose(p, -3)

export const SONG: SongDef = {
  name: 'credits',
  key: 'D major',
  bpm: 96,
  barTicks: 48,
  gain: 1,
  parts: [
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.75, pan: -0.1, send: 0.3 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.7, pan: -0.3, send: 0.35 },
    { id: 'st', inst: 'strings', role: 'melody', vol: 0.6, pan: 0.2, send: 0.4, chorus: 0.4 },
    { id: 'gl', inst: 'glock', role: 'melody', vol: 0.28, pan: 0.5, send: 0.45 },
    {
      id: 'pd',
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
    { id: 'hp', inst: 'harp', role: 'chord', vol: 0.45, pan: -0.45, send: 0.4, center: 62, vel: 0.55, gate: 0.95 },
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.45, pan: 0.3, send: 0.2, center: 66, vel: 0.55, gate: 0.6 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.7, center: 34, vel: 0.75, gate: 0.8 },
    { id: 'tm', inst: 'timpani', role: 'bass', vol: 0.5, center: 38, vel: 0.7, send: 0.3 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.6 },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.65, pan: -0.15, send: 0.25 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'D | A | G | A D',
      parts: {
        br: motif(62, 'major', { vel: 0.7 }),
        pd: 'x---------------',
        tm: 'r...............|r...............|r.......r.......|r.r.r.r.',
        tk: 'D...............|........K.......|D.......K.......|D.K.D.K.D.K.D.K.'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'D | A | G | A D | Bm | G | Em | A',
      parts: {
        br: T(TUNE),
        pd: 'x---------------',
        hp: '12343212',
        pz: '..x...x...x...x.',
        bs: 'r.......F.......',
        tm: 'r...............',
        dr: 'k...s...k...s...',
        tk: 'D.......K.......'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Bm | G | D/F# | A | Bm | G | A | Bm',
      parts: {
        hn: T(LYRIC_B),
        st: T(COUNTER_B),
        pd: 'x---------------',
        hp: '12343212',
        bs: 'r.......F.......',
        tm: 'r...............',
        dr: 'k.......p.......',
        tk: 'D.......K.......'
      }
    },
    {
      name: 'A2',
      bars: 8,
      chords: 'D | A | G | A D | Bm | G | A | D',
      parts: {
        st: T(TUNE_2),
        gl: transpose(T(TUNE_2), 12),
        br: T(COUNTER_A2),
        pd: 'x---------------',
        hp: '12343212',
        pz: '..x...x...x...x.',
        bs: 'r.......F.......',
        tm: 'r...............',
        dr: 'k...s...k...s...',
        tk: 'D.......K.......'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'G | D/F# | Em | Bm/D | G | Em | A | A',
      parts: {
        st: T(BRIDGE),
        br: transpose(T(BRIDGE), -12),
        pd: 'x---------------',
        hp: '1234543212345432',
        bs: 'r...............',
        tm: 'r.......r.......',
        dr: 'k.......k.......|k...s...k...s...|k...s...k...s...|k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.k.s.k.k.k.s.k.|k.s.s.s.ssssssss',
        tk: 'D.K.D.K.D.K.D.K.'
      }
    }
  ]
}
