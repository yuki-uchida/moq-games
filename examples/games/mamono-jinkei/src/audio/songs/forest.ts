import { transpose, type SongDef } from '../notation'
import { m4, motif, motifHead, r4, seq, withFill } from './util'

/**
 * 「月夜の森」 B minor, 84 bpm. Celesta and flute under a moon, strings gather (B), and the third part turns
 * epic in the relative major (D): the motif in horn, brass and strings over timpani. Form: intro (4) then A (8) / B (8) / bridge (8, the motif's first bar climbing) / C (8). Layer 1 adds taiko, string drive and brass stabs; layer 2 adds timpani and horn hits.
 */
const answerA = m4('o5 b4 g4 d2 | o5 f+4 a4 o6 d2 | o6 e2 o5 b4 g4 | o5 f+4 a+4 o6 c+2')
const lineB = m4(
  'o5 d4. e8 g2 | o5 f+4. e8 d2 | o5 e4. g8 b2 | o5 a4. f+8 b2 | o6 d2 o5 b4 g4 | o5 a4 f+4 o6 d2 | o6 e4. d8 o5 b2 | o5 f+4 a+4 o6 c+2'
)
const LAYERS = {
  dr1: 'k.h.s.h.k.h.s.h.',
  tk: 'D.......D.......',
  ost: 'rrRrrRrrrrRrrRfr',
  stab: 'x..x..x.........',
  tim2: 'r...r...r...r.rr',
  hnhit: 'r..r..r.r..r..r.'
}
const heads = (tonic: number, shifts: number[]) =>
  seq(...shifts.map((n) => motifHead(tonic, 'minor', n, { gate: 0.85 })))
const answerC2 = m4('o4 b2 g4 b4 | o4 e4 a4 o5 c+2 | o5 e4 o4 b4 a+4 f+4 | o5 f+1')
const answerC = m4('o5 b2 g4 d4 | o5 c+4 e4 a2 | o6 e4 o5 b4 a+4 f+4 | o5 c+1')

export const FOREST: SongDef = {
  name: 'forest',
  key: 'B minor -> D major',
  bpm: 84,
  barTicks: 48,
  gain: 0.97,
  parts: [
    { id: 'cel', inst: 'celesta', role: 'chord', vol: 0.65, pan: 0.4, send: 0.5, center: 79, vel: 0.55 },
    { id: 'harp', inst: 'harp', role: 'chord', vol: 0.5, pan: -0.4, send: 0.4, center: 60, vel: 0.5, gate: 0.95 },
    {
      id: 'str',
      inst: 'strings',
      role: 'chord',
      vol: 0.65,
      pan: 0.0,
      send: 0.5,
      chorus: 0.6,
      center: 60,
      vel: 0.5,
      gate: 0.99
    },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.8, pan: 0.2, send: 0.5 },
    { id: 'ob', inst: 'oboe', role: 'melody', vol: 0.7, pan: -0.25, send: 0.4 },
    { id: 'vln', inst: 'strings', role: 'melody', vol: 0.7, pan: 0.3, send: 0.45, chorus: 0.4 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.85, pan: -0.3, send: 0.4 },
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.6, pan: 0.3, send: 0.35 },
    { id: 'choir', inst: 'choir', role: 'chord', vol: 0.5, send: 0.55, chorus: 0.3, center: 62, vel: 0.5, gate: 0.99 },
    {
      id: 'pad',
      inst: 'pad',
      role: 'chord',
      vol: 0.45,
      pan: 0.0,
      send: 0.5,
      chorus: 0.5,
      center: 55,
      vel: 0.5,
      gate: 0.99
    },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.8, center: 35, vel: 0.65, gate: 0.9 },
    { id: 'sub', inst: 'sub', role: 'bass', vol: 0.3, center: 30, vel: 0.6, gate: 0.99 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.7, center: 38, vel: 0.75, send: 0.3 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.6, vel: 0.65, pan: 0.05 },
    { id: 'dr1', inst: 'kit', role: 'drum', vol: 0.6, vel: 0.7, pan: 0.05, layer: 1 },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.55, vel: 0.75, pan: -0.1, send: 0.2, layer: 1 },
    {
      id: 'ost',
      inst: 'strings',
      role: 'bass',
      vol: 0.55,
      pan: -0.2,
      send: 0.25,
      chorus: 0.3,
      center: 47,
      vel: 0.55,
      gate: 0.45,
      layer: 1
    },
    {
      id: 'stab',
      inst: 'brass',
      role: 'chord',
      vol: 0.5,
      pan: 0.3,
      send: 0.3,
      center: 60,
      vel: 0.7,
      gate: 0.4,
      layer: 1
    },
    { id: 'tim2', inst: 'timpani', role: 'bass', vol: 0.55, center: 38, vel: 0.8, send: 0.25, layer: 2 },
    {
      id: 'hnhit',
      inst: 'horn',
      role: 'bass',
      vol: 0.5,
      pan: -0.3,
      send: 0.3,
      center: 47,
      vel: 0.85,
      gate: 0.5,
      layer: 2
    },
    { id: 'pc', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.5, pan: -0.15 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Bm | Bm | Bm | F#',
      parts: {
        cel: '1...3...5...3...|1...3...5...3...|1.3.5.3.1.3.5.3.|1.3.5.3.1.3.5.3.',
        pad: 'x---------------',
        str: 'x---------------',
        choir: 'x---------------',
        harp: '........|........|1.2.3.2.|1.2.3.2.',
        fl: seq(r4(2), motifHead(59, 'minor', 0, { vel: 0.5 }), r4(1)),
        sub: 'r---r---'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Bm | Bm Bm Bm A | Bm7 | Bm | G | D | Em | F#',
      parts: {
        ...LAYERS,
        str: 'x---------------',
        bass: 'r---r---',
        cel: '1...3...5...3...',
        pad: 'x---------------',
        fl: seq(motif(59, 'minor', { vel: 0.6, gate: 0.9 }), transpose(answerA, -12)),
        harp: '1.2.3.2.',
        sub: 'r---r---'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'G | D | Em | Bm | G | D/F# | Em | F#',
      parts: {
        ...LAYERS,
        cel: '1.3.5.3.',
        harp: '12345432',
        str: 'x---------------',
        ob: lineB,
        hn: m4('o3 g1 | f+1 | e1 | b1 | g1 | f+1 | e1 | f+1'),
        bass: 'r---r---',
        sub: 'r---r---',
        tim: 'r.......|........|r.......|........|r.......|........|r.r.r.r.|rrrrrrrr',
        pc: '........|........|........|........|z.z.z.z.|z.z.z.z.|z.z.z.z.|z.z.z.zz'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Bm | C#dim | D | Em | F#m | G | A | A',
      parts: {
        ...LAYERS,
        cel: '1.3.5.3.1.3.5.3.',
        harp: '12345432',
        str: 'x---------------',
        choir: 'x---------------',
        fl: seq(heads(59, [0, 1, 2, 3, 4, 5]), m4('o5 c+1 | e1')),
        vln: seq(heads(47, [0, 1, 2, 3, 4, 5]), m4('o4 c+1 | e1')),
        hn: m4('o3 b1 | o4 c+1 | d1 | e1 | f+1 | g1 | a1 | a1'),
        bass: 'r---r---',
        sub: 'r---r---',
        tim: 'r.......|........|r.......|........|r.......|r.......|r.r.r.r.|rrrrrrrr',
        pc: '........|........|........|........|z.z.z.z.|z.z.z.z.|z.z.z.z.|z.z.z.zz'
      }
    },
    {
      name: 'C',
      bars: 8,
      chords: 'D | Gmaj7 | Bm Bm Bm A | D | G | A | Em F# | F#',
      parts: {
        ...LAYERS,
        cel: '1.3.5.3.1.3.5.3.',
        harp: '12345432',
        str: 'x---------------',
        choir: 'x---------------',
        hn: seq(motif(50, 'major', { vel: 0.9 }), m4('o4 b1 | c+1 | e2 a+2 | c+1')),
        br: seq(motif(62, 'major', { vel: 0.75 }), r4(4)),
        vln: seq(m4('o4 a1 | b1 | f+1 | f+1'), answerC2),
        fl: seq(r4(4), answerC),
        bass: 'r-r-f-a-',
        sub: 'r---r---',
        tim: 'r...r...r...r.rr',
        dr: withFill('k.h.s.h.k.h.s.h.', 8, 'k.s.k.s.ssssssss'),
        pc: 'c...............|a.a.a.a.a.a.a.a.|a.a.a.a.a.a.a.a.|a.a.a.a.a.a.a.a.|a.a.a.a.a.a.a.a.|a.a.a.a.a.a.a.a.|a.a.a.a.a.a.a.a.|a.a.a.a.a.a.a.a.'
      }
    }
  ]
}
