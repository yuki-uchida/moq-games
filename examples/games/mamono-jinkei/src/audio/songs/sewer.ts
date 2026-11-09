import type { SongDef } from '../notation'
import { m4, motif, motifHead, r4, seq } from './util'

/**
 * 「下水道のこそ泥」 E minor, 108 bpm, swung. Walking pizzicato bass, brushed swing, clarinet. The motif creeps in
 * as staccato pizzicato (A) and low clarinet (A'). Form: intro (4) then A (8) / B (8) / bridge (8, the motif's first bar climbing in pizzicato and muted brass) / A' (8). Layer 1 adds brushes->full swing kit and muted brass; layer 2 adds sparkle, timpani and brass lines.
 */
const answer = m4('o5 c8 e8 a4 e8 c8 o4 a4 | o4 b4 o5 e4 g4 f+4 | o5 e8 g8 o6 c4 o5 g8 e8 c4 | o4 b8 o5 d+8 f+4 a2')
const lines = m4(
  'o5 e4 g4 b4 g4 | o5 a4 e4 c4 e4 | o5 g4 f+4 e4 d+4 | o5 e2 a2 | o5 e4 g4 e4 c4 | o5 f+4 a4 f+4 d4 | o4 b4 o5 d+4 f+4 a4 | o5 a4 f+4 d+4 o4 b4'
)

const heads = (tonic: number, shifts: number[], gate = 0.45) =>
  seq(...shifts.map((s) => motifHead(tonic, 'minor', s, { gate })))
const DRIP_A = '3.......|........|....1...|........|..5.....|........|1.......|....3...'
const DRIP_B = '........|..2.....|........|....4...|1.......|........|..3.....|........'
const STAB = '..x...x.'
const SWING = 'k..sk.s.'

export const SEWER: SongDef = {
  name: 'sewer',
  key: 'E minor',
  bpm: 108,
  barTicks: 48,
  swing: 2,
  gain: 1.5,
  parts: [
    { id: 'pz', inst: 'pizz', role: 'melody', vol: 0.9, pan: -0.5, send: 0.3 },
    { id: 'cl', inst: 'clarinet', role: 'melody', vol: 0.8, pan: 0.45, send: 0.3 },
    { id: 'comp', inst: 'pizz', role: 'chord', vol: 0.5, pan: 0.65, send: 0.2, center: 62, vel: 0.5, gate: 0.5 },
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
    { id: 'cel', inst: 'celesta', role: 'chord', vol: 0.4, pan: 0.75, send: 0.45, center: 84, vel: 0.5 },
    { id: 'drip', inst: 'musicbox', role: 'chord', vol: 0.45, pan: -0.8, send: 0.6, center: 84, vel: 0.55 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.6, center: 40, vel: 0.7, gate: 0.85 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.6, pan: 0.05, maxLayer: 0 },
    { id: 'rd', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.5, pan: -0.15, maxLayer: 0 },
    { id: 'dr1', inst: 'kit', role: 'drum', vol: 0.65, vel: 0.7, pan: 0.05, layer: 1 },
    { id: 'rd1', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.6, pan: -0.15, layer: 1 },
    {
      id: 'mb',
      inst: 'brass',
      role: 'chord',
      vol: 0.5,
      pan: 0.3,
      send: 0.25,
      center: 58,
      vel: 0.5,
      gate: 0.4,
      layer: 1
    },
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.55, pan: -0.3, send: 0.25, layer: 2 },
    { id: 'chip', inst: 'pulse', role: 'chord', vol: 0.2, pan: 0.15, center: 76, vel: 0.5, gate: 0.4, layer: 2 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.55, center: 40, vel: 0.7, send: 0.2, layer: 2 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Em | Em | Em | B7',
      parts: {
        pz: seq(r4(2), motifHead(64, 'minor', 0, { gate: 0.4 }), r4(1)),
        str: 'x---------------',
        drip: '3.......|....1...|..5.....|1.1.....',
        bass: 'r.......|r.......|r.......|r...a...',
        comp: '........|........|.x...x..|.x.x.x.x',
        dr1: '........|........|k.p.k.p.|k.p.kkpp',
        tim: 'r.......'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Em | Em Em Em D | C Em | Em | Am | Em | C | B7',
      parts: {
        pz: seq(motif(64, 'minor', { vel: 0.72, gate: 0.4 }), r4(4)),
        cl: seq(r4(4), answer),
        comp: '.x...x..',
        drip: DRIP_A,
        bass: 'rtfa',
        dr: 'k.p.k.p.',
        rd: 'h.hhh.hh',
        dr1: SWING,
        rd1: 'h.hhh.hh',
        mb: STAB,
        chip: '1.2.3.2.',
        tim: 'r.......'
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
        drip: DRIP_B,
        str: 'x---------------',
        bass: 'rtfa',
        dr: 'k.p.k.p.',
        rd: 'h.hhh.hh',
        dr1: SWING,
        rd1: 'h.hhh.hh',
        mb: STAB,
        br: seq(r4(4), m4('o4 e2 g2 | a2 f+2 | b2 d+2 | f+1')),
        chip: '1.2.3.2.',
        tim: 'r.......'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Em | F#dim | G | Am | Bm | C | Bm | B7',
      parts: {
        pz: seq(heads(64, [0, 1, 2, 3, 4, 5, 4]), r4(1)),
        cl: seq(heads(52, [0, 1, 2, 3, 4, 5, 4], 0.9), m4('o4 d+1')),
        comp: '.x...x..',
        str: 'x---------------',
        drip: DRIP_A,
        bass: 'rtfa',
        dr: 'k.p.k.p.',
        rd: 'h.hhh.hh',
        dr1: 'k..sk.s.|k..sk.s.|k..sk.s.|k..sk.s.|k..sk.s.|k..sk.s.|k.s.k.s.|ssssssss',
        rd1: 'h.hhh.hh',
        mb: STAB,
        br: m4('o4 e1 | a1 | b1 | c1 | d1 | e1 | f+1 | f+1'),
        chip: '1.2.3.2.',
        tim: 'r.......|r.......|r.......|r.......|r.......|r.......|r.r.....|rrrrrrrr'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'Em | Em Em Em D | C Em | Em | Am | Em | C | B7',
      parts: {
        cl: seq(motif(52, 'minor', { vel: 0.75, gate: 0.5 }), r4(4)),
        pz: seq(r4(4), answer),
        comp: '.x...x..',
        str: '........|........|........|........|........|........|........|x---------------',
        drip: DRIP_B,
        bass: 'rtfa',
        dr: 'k.p.k.p.|k.p.k.p.|k.p.k.p.|k.p.k.p.|k.p.k.p.|k.p.k.p.|k.p.k.p.|k.p.kkp.',
        rd: 'h.hhh.hh',
        dr1: SWING,
        rd1: 'h.hhh.hh',
        chip: '1.2.3.2.',
        tim: 'r.......'
      }
    }
  ]
}
