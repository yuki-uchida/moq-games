import type { SongDef } from '../notation'
import { m4, motif, r4, seq, withFill } from './util'

/**
 * 「みんなの陣形」 F major, 72 bpm. The credits: the motif opens tenderly (A), a lyrical middle tune (B), then the whole
 * orchestra and choir restate the motif triumphantly (C). Form: intro (2) then A (8) / B (8) / C (8).
 */
const answer = m4('o5 a4 f4 d2 | o5 d4 f4 b-2 | o5 d4 g4 e4 c4 | o5 c2. a4')
const lyric = m4('o5 d2. f4 | o5 c2. o4 a4 | o4 b-2 o5 d2 | o5 e1 | o5 d2. f4 | o5 a2 g4 f4 | o5 g4 b-4 c2 | o5 f1')

export const ENDING: SongDef = {
  name: 'ending',
  key: 'F major',
  bpm: 72,
  barTicks: 48,
  gain: 0.96,
  parts: [
    {
      id: 'str',
      inst: 'strings',
      role: 'chord',
      vol: 0.75,
      pan: -0.1,
      send: 0.45,
      chorus: 0.6,
      center: 60,
      vel: 0.55,
      gate: 0.99
    },
    { id: 'vln', inst: 'strings', role: 'melody', vol: 0.8, pan: 0.25, send: 0.45, chorus: 0.4 },
    { id: 'harp', inst: 'harp', role: 'chord', vol: 0.7, pan: -0.45, send: 0.45, center: 60, vel: 0.6, gate: 0.95 },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.8, pan: 0.2, send: 0.45 },
    { id: 'ob', inst: 'oboe', role: 'melody', vol: 0.6, pan: -0.3, send: 0.4 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.9, pan: -0.25, send: 0.4 },
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.7, pan: 0.3, send: 0.35 },
    { id: 'choir', inst: 'choir', role: 'chord', vol: 0.7, send: 0.55, chorus: 0.3, center: 60, vel: 0.6, gate: 0.99 },
    { id: 'gl', inst: 'glock', role: 'melody', vol: 0.5, pan: 0.5, send: 0.45 },
    { id: 'cel', inst: 'celesta', role: 'chord', vol: 0.4, pan: 0.45, send: 0.5, center: 84, vel: 0.5 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.85, center: 34, vel: 0.65, gate: 0.9 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.7, center: 41, vel: 0.75, send: 0.3 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.55, vel: 0.6, pan: 0.05 },
    { id: 'pc', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.55, pan: -0.15 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 2,
      chords: 'F | C',
      parts: {
        str: 'x---------------',
        harp: '12345432|12345432',
        cel: '1.......|1.......'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'F | Bb Gm | F C | F | Dm | Bb | Gm C | F',
      parts: {
        str: 'x---------------',
        harp: '12345432',
        fl: seq(motif(65, 'major', { vel: 0.62, gate: 0.92 }), answer),
        hn: seq(r4(4), m4('o3 d1 | b-1 | g2 c2 | f1')),
        cel: '1...3...5...3...',
        bass: 'r---r---',
        tim: 'r.......',
        pc: '........|........|........|........|........|........|........|c.......'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Bb | F/A | Gm7 | C | Bb | F/A | Gm C | F',
      parts: {
        str: 'x---------------',
        harp: '12345432',
        vln: lyric,
        ob: seq(r4(4), m4('o4 d1 | f1 | b-2 a2 | a1')),
        hn: m4('o3 b-1 | a1 | g1 | c1 | b-1 | a1 | g2 c2 | f1'),
        cel: '1.3.5.3.1.3.5.3.',
        bass: 'r-.-f-r-',
        tim: 'r.......|........|r.......|........|r.......|........|r.r.....|r.......',
        dr: '........|........|........|........|k...p...|k...p...|k...p...|k...p...',
        pc: 'z.z.z.z.'
      }
    },
    {
      name: 'C',
      bars: 8,
      chords: 'F | Bb Gm | F C | F | Dm | Bb | Gm C | F',
      parts: {
        str: 'x---------------',
        choir: 'x---------------',
        harp: '1234543212345432',
        cel: '1.3.5.3.1.3.5.3.',
        hn: seq(motif(41, 'major', { vel: 0.95 }), m4('o3 d1 | b-1 | g2 c2 | f1')),
        br: seq(motif(53, 'major', { vel: 0.8 }), m4('o4 a2 f2 | d2 f2 | b-2 g2 | f1')),
        vln: seq(motif(65, 'major', { vel: 0.8 }), answer),
        fl: seq(r4(4), answer),
        gl: seq(motif(77, 'major', { vel: 0.5, gate: 0.6 }), r4(4)),
        bass: 'r-r-f-a-',
        tim: 'r...r...r...r.rr',
        dr: withFill('k...s...k...s...', 8, 'k.k.s.s.ssssssss'),
        pc: 'c...............|a.a.a.a.a.a.a.a.|a.a.a.a.a.a.a.a.|a.a.a.a.a.a.a.a.|a.a.a.a.a.a.a.a.|a.a.a.a.a.a.a.a.|a.a.a.a.a.a.a.a.|c.......g.......'
      }
    }
  ]
}
