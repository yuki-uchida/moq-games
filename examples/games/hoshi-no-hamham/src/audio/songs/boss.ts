import { transpose, type SongDef } from '../notation'
import { m4, minorKey, motif, seq, withFill, type KeyInfo } from './util'

/**
 * 「ちびボスたいけつ」 (every boss fight but the last) G minor, 4/4 at 160 bpm: fast, driving and still fun.
 * A brass lead with the twisted ハムハム motif (flat sixth, raised fourth: the tune with a villain's grin), a hooky
 * square-wave B lead, a pulse-wave bass riff, brass stabs, busy kit and toms. The bridge lets the strings sing over a
 * thin kit before the last push.
 * Form: intro (2) then A (8, brass) / B (8, square lead) / A' (8, square lead and strings) / bridge (8, strings)
 * / A'' (8, brass and square together) / D (8, final push).
 * Layer 1 (the boss is nearly beaten) adds a square-wave high arpeggio, extra toms and a crash on top of the same harmony.
 */
const intro = m4('o4 g4 g4 b-4 >d4 | o4 a2 f+2')
const answerA = m4('o4 c8 c8 e-8 g8 >c4 <g4 | e-8 e-8 g8 b-8 >e-4 <b-4 | f8 f8 a8 >c8 <a4 f4 | d8 d8 f+8 a8 >d4 <a4')
/** The twisted motif in G minor needs A7 on bar three: C-sharp on the beat, D on the half-bar change. */
const tuneA = seq(motif(55, 'minor', { twist: true, vel: 0.85, gate: 0.88 }), answerA)
const tuneA2 = seq(motif(67, 'minor', { twist: true, vel: 0.8, gate: 0.88 }), transpose(answerA, 12))
const stringsA2 = m4('o4 b-1 | b-1 | c+2 a2 | b-1 | g1 | b-1 | a1 | a1')
const leadB = m4(
  'o4 g8 g8 b-8 >d8 g4 d4 | e-8 e-8 g8 b-8 g4 e-4 | c8 c8 e-8 g8 c4 g4 | d8 d8 f+8 a8 a4 f+4 | o5 g4 b-4 g4 b-4 | e-4 g4 b-4 g4 | f4 a4 >c4 <a4 | d4 f+4 a2'
)
const bridge = m4('o4 b-2 >e-2 | d2 f2 | g2 e-2 | d2 f+2 | g2 b-2 | a2 >c2 | o5 g2 g2 | o5 a4 f+4 d2')
const leadD = m4(
  'o5 g8 g8 b-8 g8 d4 b-4 | e-8 e-8 g8 e-8 b-4 g4 | f8 f8 a8 f8 >c4 <a4 | d8 d8 f+8 d8 a4 f+4 | g8 g8 b-8 g8 d4 b-4 | c8 c8 e-8 c8 g4 e-4 | d8 d8 f+8 d8 a4 d4 | f+2 d2'
)

const BASS = 'r..rr.r.r..rr.fa'
const RIFF = 'rr.rr.rrrr.rr.fr'
const KIT = withFill('k.k.s..sk.k.s.s.', 8, 'k.k.s.s.ssssssss')
/** Layer 1: the boss is nearly beaten. */
const CLIMAX = {
  arp: '3.2.1.2.3.2.1.2.',
  tk2: 'T.t.T.t.T.t.T.tt',
  cym: 'c...............|................'
}

export const SONG: SongDef = {
  name: 'boss',
  key: 'G minor',
  bpm: 160,
  barTicks: 48,
  gain: 0.89,
  parts: [
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.95, pan: -0.1, send: 0.2 },
    { id: 'ld', inst: 'square', role: 'melody', vol: 0.5, pan: 0.2, send: 0.2 },
    { id: 'st', inst: 'strings', role: 'melody', vol: 0.7, pan: 0.3, send: 0.35, chorus: 0.3 },
    { id: 'stab', inst: 'brass', role: 'chord', vol: 0.8, pan: -0.25, send: 0.25, center: 60, vel: 0.8, gate: 0.4 },
    { id: 'pad', inst: 'strings', role: 'chord', vol: 0.45, send: 0.35, chorus: 0.4, center: 58, vel: 0.5, gate: 0.99 },
    { id: 'riff', inst: 'pulse', role: 'bass', vol: 0.5, pan: 0.1, send: 0.1, center: 55, vel: 0.65, gate: 0.5 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.75, center: 33, vel: 0.8, gate: 0.6 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.75, vel: 0.75, pan: 0.05 },
    { id: 'hat', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.55, pan: 0.2 },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.55, vel: 0.75, pan: -0.15, send: 0.2 },
    {
      id: 'arp',
      inst: 'square',
      role: 'chord',
      vol: 0.28,
      pan: 0.4,
      send: 0.2,
      center: 84,
      vel: 0.5,
      gate: 0.6,
      layer: 1
    },
    { id: 'tk2', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.75, pan: -0.2, send: 0.2, layer: 1 },
    { id: 'cym', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.7, pan: -0.25, layer: 1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 2,
      chords: 'Gm | D',
      parts: {
        br: intro,
        riff: RIFF,
        bass: BASS,
        stab: 'x...x...x.x.x.x.',
        dr: 'k.k.s.s.k.k.ssss',
        tk: 'T.....t.T.....t.',
        ...CLIMAX
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Gm | Gm | A7 D | Gm | Cm | Eb | F | D',
      parts: {
        br: tuneA,
        stab: 'x..x..x.........',
        riff: RIFF,
        bass: BASS,
        dr: KIT,
        hat: 'h.hhh.hhh.hhh.hh',
        tk: 'T.......t.......',
        ...CLIMAX
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Gm | Eb | Cm | D | Gm | Eb | F | D',
      parts: {
        ld: leadB,
        stab: 'x..x..x.x.......',
        pad: 'x---------------',
        riff: RIFF,
        bass: BASS,
        dr: KIT,
        hat: 'h.h.h.h.h.h.h.h.',
        tk: 'T.....t.T.......',
        ...CLIMAX
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'Gm | Gm | A7 D | Gm | Cm | Eb | F | D',
      parts: {
        ld: tuneA2,
        st: stringsA2,
        stab: 'x..x..x.x..x..x.',
        riff: RIFF,
        bass: BASS,
        dr: KIT,
        hat: 'h.hhh.hhh.hhh.hh',
        tk: 'T.......t.......',
        ...CLIMAX
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Eb | Bb | Cm | D | Eb | F | Gm Cm | D',
      parts: {
        st: bridge,
        pad: 'x---------------',
        bass: 'r.......f.......',
        dr: 'k.......s.......|k.......s.......|k.......s.......|k.......s.......|k.......s.......|k.......s.......|k.......s.......|k.k.s.s.ssssssss',
        hat: 'h...h...h...h...',
        tk: 'T.......T.......|T.......T.......|T.......T.......|T.......T.......|T.......T.......|T.t.T.t.T.t.T.t.|T.t.T.t.T.t.T.t.|TtTtTtTtTtTtTtTt',
        ...CLIMAX
      }
    },
    {
      name: "A''",
      bars: 8,
      chords: 'Gm | Gm | A7 D | Gm | Cm | Eb | F | D',
      parts: {
        br: tuneA,
        ld: tuneA2,
        st: stringsA2,
        stab: 'x..x..x.x..x..x.',
        riff: RIFF,
        bass: BASS,
        dr: KIT,
        hat: 'h.hhh.hhh.hhh.hh',
        tk: 'T.......t.......',
        ...CLIMAX
      }
    },
    {
      name: 'D',
      bars: 8,
      chords: 'Gm | Eb | F | D | Gm | Cm | D | D',
      parts: {
        ld: leadD,
        br: m4('o4 g1 | e-1 | f1 | d1 | g1 | c1 | d1 | d1'),
        stab: 'x.xx.xx.x.xx.xx.',
        riff: RIFF,
        bass: BASS,
        dr: withFill('k.k.s.s.k.k.s.s.', 8, 'ssssssssssssssss'),
        hat: 'hhhhhhhhhhhhhhhh',
        tk: 'T.t.T.t.T.t.T.t.',
        ...CLIMAX
      }
    }
  ]
}

export const KEY: KeyInfo = minorKey(7, [6, 1])
