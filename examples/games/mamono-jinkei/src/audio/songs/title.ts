import { transpose, type SongDef } from '../notation'
import { m4, motif, motifHead, r4, rep, seq, withFill } from './util'

/**
 * 「陣形のテーマ」 D major, 100 bpm. Intro (4) then the loop: A (the motif in horn + strings, answered by flute and
 * oboe) / B (a lyrical new tune) / A' (full orchestra, chip sparkle) / bridge (the motif's first bar climbing).
 */
const answer = m4('o5 d4 f+4 b4. a8 | g4 f+8 e8 d4 e4 | f+4 a4 g4 e4 | c+4 e4 a2')
const counter = m4('o4 f+2 a2 | b2 >d2 | <a2 g2 | e2 a2')
const lyric = m4('v6 o5 d2 g4 b4 | a2. f+4 | e2 g4 b4 | a2. e4 | d2 f+4 a4 | c+2. e4 | b2 a4 g4 | f+4 e4 c+2')

export const TITLE: SongDef = {
  name: 'title',
  key: 'D major',
  bpm: 100,
  barTicks: 48,
  gain: 0.78,
  parts: [
    {
      id: 'str',
      inst: 'strings',
      role: 'chord',
      vol: 0.8,
      pan: -0.15,
      send: 0.35,
      chorus: 0.5,
      center: 62,
      gate: 0.99,
      vel: 0.55
    },
    { id: 'vln', inst: 'strings', role: 'melody', vol: 0.75, pan: 0.2, send: 0.4, chorus: 0.4 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.95, pan: -0.25, send: 0.35 },
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.7, pan: 0.3, send: 0.3 },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.8, pan: 0.15, send: 0.35 },
    { id: 'ob', inst: 'oboe', role: 'melody', vol: 0.6, pan: -0.35, send: 0.3 },
    { id: 'harp', inst: 'harp', role: 'chord', vol: 0.75, pan: -0.45, send: 0.4, center: 60, vel: 0.6, gate: 0.95 },
    { id: 'cel', inst: 'celesta', role: 'chord', vol: 0.55, pan: 0.5, send: 0.4, center: 84, vel: 0.55 },
    { id: 'chip', inst: 'pulse', role: 'chord', vol: 0.28, pan: 0.1, center: 76, vel: 0.5, gate: 0.5 },
    { id: 'choir', inst: 'choir', role: 'chord', vol: 0.7, send: 0.5, chorus: 0.3, center: 60, gate: 0.99, vel: 0.55 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.7, center: 38, vel: 0.75 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.65, center: 38, vel: 0.8, send: 0.2 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.7, vel: 0.7, pan: 0.05 },
    { id: 'pc', inst: 'kit', role: 'drum', vol: 0.55, vel: 0.65, pan: -0.1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'D | Bm | D | A',
      parts: {
        str: 'x---------------',
        harp: '1.2.3.4.|12345432|12345432|1234543212345432',
        tim: 'r.......|r...r...|r.r.r.r.|rrrrrrrr',
        hn: seq(r4(2), motifHead(50, 'major'), r4(1)),
        cel: '....|....|1.3.5.3.1.3.5.3.|1.3.5.3.1.3.5.3.',
        dr: "....|....|k.......|s's's's'ssssssss"
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'D | Gmaj7 | Bm A | D | Bm | G | D/F# Em | A',
      parts: {
        str: 'x---------------',
        harp: '12345432',
        hn: seq(motif(50, 'major', { vel: 0.8 }), m4('o3 b1 | g1 | f+2 e2 | a1')),
        vln: seq(motif(62, 'major', { vel: 0.62 }), transpose(answer, -12)),
        fl: seq(r4(4), answer),
        ob: seq(r4(4), counter),
        bass: 'r-r-f-a-',
        tim: 'r...r...',
        dr: withFill('k.h.s.h.k.h.s.h.', 8, 'k.h.s.h.s.s.ssss'),
        pc: 'c...............|' + rep('a.a.a.a.a.a.a.a.', 7)
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'G | D/F# | Em7 | A | Bm | F#m | G | A',
      parts: {
        str: 'x---------------',
        harp: '12345432',
        ob: lyric,
        fl: seq(r4(4), m4('o5 f+1 | c+1 | g1 | e1')),
        hn: m4('o3 g1 | f+1 | e1 | a1 | b1 | f+1 | g1 | a1'),
        cel: '1...3...5...3...',
        bass: 'r---r-f-',
        tim: 'r.......',
        dr: 'k...s...k...s...',
        pc: 'a.a.a.a.a.a.a.a.'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'D | Gmaj7 | Bm A | D | Bm | G | D/F# Em | A',
      parts: {
        str: 'x---------------',
        choir: 'x---------------',
        harp: '12345432',
        cel: '1.3.5.3.1.3.5.3.',
        chip: '1234543212345432',
        hn: seq(motif(50, 'major', { vel: 0.9 }), m4('o3 b1 | g1 | f+2 e2 | a1')),
        br: seq(motif(50, 'major', { vel: 0.8 }), transpose(answer, -24)),
        vln: seq(motif(62, 'major', { vel: 0.75 }), transpose(answer, -12)),
        fl: seq(motif(74, 'major', { vel: 0.65 }), answer),
        ob: seq(r4(4), counter),
        bass: 'r-r-f-a-',
        tim: 'r...r.r.',
        dr: withFill('k.h.s.h.k.h.s.h.', 8, 'k.s.k.s.ssssssss'),
        pc: 'c...............|' + rep('a.a.a.a.a.a.a.a.', 7)
      }
    },
    {
      name: 'bridge',
      bars: 4,
      chords: 'Em | F#m | G | A',
      parts: {
        str: 'x---------------',
        choir: 'x---------------',
        harp: '1234543212345432',
        chip: '1234543212345432',
        vln: seq(
          motifHead(62, 'major', 1),
          motifHead(62, 'major', 2),
          motifHead(62, 'major', 3),
          motifHead(62, 'major', 4)
        ),
        br: seq(
          motifHead(50, 'major', 1),
          motifHead(50, 'major', 2),
          motifHead(50, 'major', 3),
          motifHead(50, 'major', 4)
        ),
        fl: seq(
          motifHead(62, 'major', 1),
          motifHead(62, 'major', 2),
          motifHead(62, 'major', 3),
          motifHead(62, 'major', 4)
        ),
        hn: m4('o3 e1 | f+1 | g1 | a1'),
        bass: 'r-r-r-r-',
        tim: 'r.r.r.r.|r.r.r.r.|r.r.r.r.|rrrrrrrr',
        dr: 'k.k.s.s.k.k.s.s.|k.k.s.s.k.k.s.s.|k.k.s.s.k.k.s.s.|ssssssssssssssss',
        pc: 'c...............|a.a.a.a.a.a.a.a.|a.a.a.a.a.a.a.a.|a.a.a.a.a.a.a.a.'
      }
    }
  ]
}
