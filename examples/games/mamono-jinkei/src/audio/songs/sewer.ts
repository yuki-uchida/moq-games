import type { SongDef } from '../notation'
import { m4, motif, r4, seq } from './util'

/**
 * 「下水道のこそ泥」 E minor, 108 bpm, swung. Walking pizzicato bass, brushed swing, clarinet. The motif creeps in
 * as staccato pizzicato (A) and low clarinet (A'). Form: A (8) / B (8) / A' (8).
 */
const answer = m4('o5 c8 e8 a4 e8 c8 o4 a4 | o4 b4 o5 e4 g4 f+4 | o5 e8 g8 o6 c4 o5 g8 e8 c4 | o4 b8 o5 d+8 f+4 a2')
const lines = m4(
  'o4 e4 g4 b4 g4 | o4 a4 o5 c4 e4 c4 | o4 g4 f+4 e4 d+4 | o4 e2 a2 | o5 e4 g4 e4 c4 | o5 f+4 a4 f+4 d4 | o4 b4 o5 d+4 f+4 a4 | o5 a4 f+4 d+2'
)

export const SEWER: SongDef = {
  name: 'sewer',
  key: 'E minor',
  bpm: 108,
  barTicks: 48,
  swing: 2,
  gain: 1.4,
  parts: [
    { id: 'pz', inst: 'pizz', role: 'melody', vol: 0.9, pan: -0.2, send: 0.3 },
    { id: 'cl', inst: 'clarinet', role: 'melody', vol: 0.8, pan: 0.2, send: 0.3 },
    { id: 'comp', inst: 'pizz', role: 'chord', vol: 0.5, pan: 0.35, send: 0.2, center: 62, vel: 0.5, gate: 0.5 },
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
    { id: 'cel', inst: 'celesta', role: 'chord', vol: 0.4, pan: 0.5, send: 0.45, center: 84, vel: 0.5 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.6, center: 40, vel: 0.7, gate: 0.85 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.6, pan: 0.05 },
    { id: 'rd', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.5, pan: -0.15 }
  ],
  sections: [
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Em | Em D | C Em | Em | Am | Em | C | B7',
      parts: {
        pz: seq(motif(64, 'minor', { vel: 0.72, gate: 0.4 }), r4(4)),
        cl: seq(r4(4), answer),
        comp: '.x...x..',
        bass: 'rtfa',
        dr: 'k.p.k.p.',
        rd: 'h.hhh.hh'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Em | Am | Em | Am | C | D | B7 | B7',
      parts: {
        cl: lines,
        comp: '.x...x..',
        cel: '........|..3.....|........|..5.....|........|..3.....|........|5.......',
        str: 'x---------------',
        bass: 'rtfa',
        dr: 'k.p.k.p.',
        rd: 'h.hhh.hh'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'Em | Em D | C Em | Em | Am | Em | C | B7',
      parts: {
        cl: seq(motif(52, 'minor', { vel: 0.75, gate: 0.5 }), r4(4)),
        pz: seq(r4(4), answer),
        comp: '.x...x..',
        str: 'x---------------',
        cel: '1.......',
        bass: 'rtfa',
        dr: 'k.p.k.p.|k.p.k.p.|k.p.k.p.|k.p.k.p.|k.p.k.p.|k.p.k.p.|k.p.k.p.|k.p.kkp.',
        rd: 'h.hhh.hh'
      }
    }
  ]
}
