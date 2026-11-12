import { transpose, type SongDef } from '../notation'
import { m4, majorKey, minorKey, motif, seq, type KeyInfo } from './util'

/**
 * Victory. C major, 176 bpm, five bars (about 6.8 s), plays once. The whole ANIMA motif sounds in the brass with the
 * horn an octave below and a glockenspiel an octave above, then rises one last time to the high tonic over a full
 * C major chord, timpani and a crash.
 */
export const WIN_KEY: KeyInfo = majorKey(0)
export const WIN: SongDef = {
  name: 'win',
  key: 'C major',
  bpm: 176,
  barTicks: 48,
  gain: 0.85,
  once: true,
  parts: [
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.85, pan: -0.1, send: 0.25 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.65, pan: -0.3, send: 0.3 },
    { id: 'gl', inst: 'glock', role: 'melody', vol: 0.3, pan: 0.5, send: 0.45 },
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
      vel: 0.6
    },
    { id: 'hp', inst: 'harp', role: 'chord', vol: 0.45, pan: -0.45, send: 0.4, center: 62, vel: 0.6, gate: 0.95 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.75, center: 36, vel: 0.8, gate: 0.8 },
    { id: 'tm', inst: 'timpani', role: 'bass', vol: 0.6, center: 36, vel: 0.8, send: 0.25 },
    { id: 'cy', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.75, pan: -0.15 }
  ],
  sections: [
    {
      name: 'win',
      bars: 5,
      chords: 'C | G | F | G C | C',
      parts: {
        br: seq(motif(60, 'major', { vel: 0.85 }), m4('v9 o5 g2 >c2')),
        hn: seq(transpose(motif(60, 'major', { vel: 0.7 }), -12), m4('v8 o4 e2 g2')),
        gl: seq(transpose(motif(60, 'major', { vel: 0.55 }), 12), m4('v7 o6 e2 g2')),
        st: 'x---------------',
        hp: '1234543212345432',
        bs: 'r.r.r.r.|r.r.F.r.|r.r.F.r.|r.r.F.r.|r-------',
        tm: 'r.r.rrrr|r...r...|r...r...|r.r.r.r.|r.......',
        cy: 'c...............|c...............|c...............|c...............|c...............'
      }
    }
  ]
}

/**
 * Defeat. C minor, 120 bpm, three bars (6 s), plays once. The horn falls through the minor triad, the strings sink on
 * the subdominant, and a low timpani stroke closes the phrase on the tonic.
 */
export const LOSE_KEY: KeyInfo = minorKey(0, [11])
export const LOSE: SongDef = {
  name: 'lose',
  key: 'C minor',
  bpm: 120,
  barTicks: 48,
  gain: 1.15,
  once: true,
  parts: [
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.75, pan: -0.2, send: 0.4 },
    { id: 'ob', inst: 'oboe', role: 'melody', vol: 0.45, pan: 0.25, send: 0.4 },
    {
      id: 'st',
      inst: 'strings',
      role: 'chord',
      vol: 0.5,
      pan: -0.2,
      send: 0.45,
      chorus: 0.5,
      center: 64,
      gate: 0.99,
      vel: 0.5
    },
    { id: 'sb', inst: 'sub', role: 'bass', vol: 0.55, center: 28, vel: 0.7, gate: 0.99 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.6, center: 36, vel: 0.7, gate: 0.8 },
    { id: 'tm', inst: 'timpani', role: 'bass', vol: 0.65, center: 36, vel: 0.8, send: 0.35 },
    { id: 'cy', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.6, pan: -0.15 }
  ],
  sections: [
    {
      name: 'lose',
      bars: 3,
      chords: 'Cm | Fm | G Cm',
      parts: {
        hn: m4('v7 o4 g2 e-4 c4 | o4 a-2 f4 c4 | o4 d2 c2'),
        ob: m4('v5 o5 c2 <b-4 g4 | o5 c2 <a-4 f4 | o4 b2 g2'),
        st: 'x---------------',
        sb: 'r---------------',
        bs: 'r.......F.......|r.......r.......|r.......r.......',
        tm: 'r.......r.......|r...............|r.......r.......',
        cy: 'c...............|................|........c.......'
      }
    }
  ]
}
