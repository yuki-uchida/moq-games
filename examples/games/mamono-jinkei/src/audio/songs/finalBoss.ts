import type { SongDef } from '../notation'
import { m4, motif, r4, seq, withFill } from './util'

/**
 * 「終焉の陣形」 A minor, 144 bpm. The final battle: choir and full orchestra. The motif is sung in augmentation
 * by the choir (B) and hammered out by brass and strings (A, A'). Form: intro (2) then A (8) / B (8) / C (8) / A' (8).
 */
const answer = m4('o4 a8 a8 c8 e8 o5 a4 g4 | o4 g8 g8 b8 o5 d8 g4 f4 | o4 a8 a8 c8 e8 o5 a4 e4 | o5 b2 g+2')
const climb = m4(
  'o4 a2 o5 c4 f4 | o5 d2 g4 b4 | o5 c2 e4 a4 | o5 a2. g4 | o5 f2 a4 o6 c4 | o5 b2 g4 d4 | o5 b4 g+4 e2 | o5 e4 g+4 b2'
)
const OST = 'rrRrrRrrrrRrrRfr'

export const FINAL_BOSS: SongDef = {
  name: 'finalBoss',
  key: 'A minor',
  bpm: 144,
  barTicks: 48,
  gain: 0.82,
  parts: [
    {
      id: 'ost',
      inst: 'strings',
      role: 'bass',
      vol: 0.7,
      pan: -0.2,
      send: 0.25,
      chorus: 0.4,
      center: 45,
      vel: 0.6,
      gate: 0.45
    },
    {
      id: 'str',
      inst: 'strings',
      role: 'chord',
      vol: 0.7,
      pan: 0.0,
      send: 0.4,
      chorus: 0.6,
      center: 62,
      vel: 0.55,
      gate: 0.99
    },
    { id: 'vln', inst: 'strings', role: 'melody', vol: 0.7, pan: 0.3, send: 0.35, chorus: 0.4 },
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.85, pan: 0.2, send: 0.3 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.85, pan: -0.3, send: 0.3 },
    { id: 'stab', inst: 'brass', role: 'chord', vol: 0.6, pan: -0.2, send: 0.3, center: 60, vel: 0.8, gate: 0.45 },
    { id: 'choir', inst: 'choir', role: 'chord', vol: 0.8, send: 0.55, chorus: 0.3, center: 60, vel: 0.65, gate: 0.99 },
    { id: 'chm', inst: 'choir', role: 'melody', vol: 0.85, send: 0.55, chorus: 0.3 },
    { id: 'harp', inst: 'harp', role: 'chord', vol: 0.5, pan: -0.45, send: 0.4, center: 66, vel: 0.55 },
    { id: 'bell', inst: 'bell', role: 'chord', vol: 0.3, pan: 0.5, send: 0.5, center: 84, vel: 0.5, layer: 1 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.65, center: 33, vel: 0.75, gate: 0.6 },
    { id: 'sub', inst: 'sub', role: 'bass', vol: 0.35, center: 26, vel: 0.7, gate: 0.99 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.6, center: 40, vel: 0.85, send: 0.25 },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.8, vel: 0.8, send: 0.2, pan: -0.1 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.65, vel: 0.7, pan: 0.05 },
    { id: 'cym', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.7, pan: -0.2 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 2,
      chords: 'Am | E',
      parts: {
        choir: 'x---------------',
        str: 'x---------------',
        tim: 'r.......r.......|r.r.r.r.rrrrrrrr',
        tk: 'D.......D.......|D.D.D.D.D.D.D.DD',
        cym: 'c...............|................'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Am | F G | Am | Am | F | G | Am | E',
      parts: {
        ost: OST,
        str: 'x---------------',
        choir: 'x---------------',
        stab: 'x..x..x.........',
        br: seq(motif(57, 'minor', { vel: 0.9, gate: 0.85 }), answer),
        hn: seq(motif(45, 'minor', { vel: 0.9 }), r4(4)),
        vln: seq(motif(69, 'minor', { vel: 0.7, gate: 0.85 }), r4(4)),
        bass: 'r.rrr.rrr.rrr.fr',
        sub: 'r-------',
        tim: 'r...r...r...r.rr',
        tk: 'D.......D.......',
        dr: withFill('k.k.s.k.k.k.s.k.', 8, 'k.s.k.s.ssssssss'),
        cym: 'c...............|................'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Am | Am | F | G | Am | Am | Am | E',
      parts: {
        ost: OST,
        str: 'x---------------',
        choir: 'x---------------',
        chm: motif(57, 'minor', { stretch: 2, vel: 0.9, gate: 0.97 }),
        harp: '1234543212345432',
        bell: '1...3...5...3...',
        bass: 'r.r.r.r.r.r.r.r.',
        sub: 'r-------',
        tim: 'r.......r.......|r.......r.......|r.......r.......|r.......r.......|r.......r.......|r.......r.......|r.......r.......|rrrrrrrrrrrrrrrr',
        tk: 'D...............|........D.......',
        dr: '................|................|................|................|................|................|................|s.s.s.s.ssssssss'
      }
    },
    {
      name: 'C',
      bars: 8,
      chords: 'F | G | Am | Am | F | G | E | E',
      parts: {
        ost: OST,
        str: 'x---------------',
        choir: 'x---------------',
        stab: 'x.x.x.x.x.x.x.x.',
        br: climb,
        hn: m4('o3 f1 | g1 | a1 | a1 | f1 | g1 | e1 | e1'),
        vln: m4('o5 a1 | b1 | c1 | c1 | a1 | b1 | b1 | b1'),
        bass: 'r.rrr.rrr.rrr.fr',
        sub: 'r-------',
        tim: 'r.r.r.r.r.r.r.r.',
        tk: 'D...D...D...D...',
        dr: withFill('k.k.s.k.k.k.s.k.', 8, 'ssssssssssssssss'),
        cym: 'c...............|................'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'Am | F G | Am | Am | F | G | Am | E',
      parts: {
        ost: OST,
        str: 'x---------------',
        choir: 'x---------------',
        stab: 'x..x..x.........',
        br: seq(motif(57, 'minor', { vel: 0.95, gate: 0.85 }), answer),
        hn: seq(motif(45, 'minor', { vel: 0.95 }), r4(4)),
        vln: seq(motif(69, 'minor', { vel: 0.8, gate: 0.85 }), answer),
        chm: seq(r4(4), m4('o5 e2 a2 | g1 | e2 c2 | e1')),
        bell: '1...3...5...3...',
        harp: '1234543212345432',
        bass: 'r.rrr.rrr.rrr.fr',
        sub: 'r-------',
        tim: 'r...r.r.r...r.rr',
        tk: 'D.......D.D.....',
        dr: withFill('k.k.s.k.k.k.s.k.', 8, 'k.s.k.s.ssssssss'),
        cym: 'c...............|................'
      }
    }
  ]
}
