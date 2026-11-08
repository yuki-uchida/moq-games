import type { SongDef } from '../notation'
import { m4, motif, r4, seq } from './util'

/**
 * 「焚き火のロビー」 G major, 80 bpm. A cosy camp/tavern: harp, flute, lute-like pizzicato, soft hand percussion.
 * The motif is quoted softly by the flute (A) and the clarinet (A').
 */
const answer = m4('o5 b4 g4 e2 | o5 e4 g4 o6 c2 | o5 a4 e4 f+4 d4 | o5 d4 g2.')
const tune = m4('o5 e2 g4 e4 | d2. g4 | c2 e4 a4 | g2. d4 | o5 e4 g4 o6 c2 | o5 a2 f+4 d4 | g2 b4 g4 | f+2. a4')

export const LOBBY: SongDef = {
  name: 'lobby',
  key: 'G major',
  bpm: 80,
  barTicks: 48,
  gain: 1.3,
  parts: [
    { id: 'harp', inst: 'harp', role: 'chord', vol: 0.8, pan: -0.35, send: 0.35, center: 60, vel: 0.6, gate: 0.95 },
    { id: 'lute', inst: 'pizz', role: 'chord', vol: 0.55, pan: 0.3, send: 0.2, center: 62, vel: 0.5, gate: 0.6 },
    {
      id: 'str',
      inst: 'strings',
      role: 'chord',
      vol: 0.45,
      pan: 0.0,
      send: 0.4,
      chorus: 0.5,
      center: 60,
      vel: 0.45,
      gate: 0.99
    },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.8, pan: 0.2, send: 0.4 },
    { id: 'cl', inst: 'clarinet', role: 'melody', vol: 0.55, pan: -0.25, send: 0.3 },
    { id: 'cel', inst: 'celesta', role: 'chord', vol: 0.4, pan: 0.45, send: 0.4, center: 84, vel: 0.45 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.8, center: 31, vel: 0.65 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.55, vel: 0.6, pan: 0.1 },
    { id: 'pc', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.5, pan: -0.15 }
  ],
  sections: [
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'G | Cmaj7 | Em D | G | Em | C | Am7 D | G',
      parts: {
        harp: '1.23.23.',
        lute: '.x.x.x.x',
        str: 'x---------------',
        fl: seq(motif(67, 'major', { vel: 0.58, gate: 0.9 }), answer),
        bass: 'r---f---',
        dr: '..p...p.',
        pc: 'z.z.z.z.'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'C | G/B | Am | G | C | D | Em | D',
      parts: {
        harp: '12345432',
        lute: '.x.x.x.x',
        str: 'x---------------',
        fl: tune,
        cl: seq(r4(4), m4('o4 g1 | f+1 | e1 | d1')),
        cel: '1...3...5...3...',
        bass: 'r-.-f-r-',
        dr: 'k...p...k...p...',
        pc: 'z.z.z.z.z.z.z.zz'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'G | Cmaj7 | Em D | G | Em | C | Am7 D | G',
      parts: {
        harp: '12345432',
        lute: '.x.x.x.x',
        str: 'x---------------',
        cl: seq(motif(55, 'major', { vel: 0.62 }), r4(4)),
        fl: seq(r4(4), answer),
        cel: '....|....|1...3...5...3...|1...3...5...3...|....|....|1...3...5...3...|1...3...5...3...',
        bass: 'r---f---',
        dr: 'k...p...k...p...',
        pc: 'z.z.z.z.z.z.z.zz'
      }
    }
  ]
}
