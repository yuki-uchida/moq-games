import type { SongDef } from '../notation'
import { m4, motif, r4, seq, withFill } from './util'

/**
 * 「ギルドの刺客」 D minor, 160 bpm. A driving boss battle: sixteenth-note string ostinato, brass stabs, taiko and
 * timpani. The motif is twisted (flat second, raised fourth) in brass (A), augmented in the choir (C) and in A''.
 * Form: intro (2) then A (8) / B (8) / C (8) / A' (8) / D (8). Layer 1 adds the choir; layer 2 adds hammering horns.
 */
const answer = m4(
  'o4 d8 d8 f8 a8 o5 d4 c4 | o4 b-8 b-8 o5 d8 d8 c4 d4 | o4 g8 g8 b-8 o5 d8 o4 a8 a8 o5 c+8 c+8 | o5 d2 r4 d8 d8'
)
const verse = m4(
  'o5 d4. f8 a2 | o5 g4 f4 a4 d4 | o5 d4. f8 b-2 | o5 c4 o5 b-4 g4 e4 | o5 d4. f8 a2 | o5 b-4 a4 g4 f4 | o5 c+4. e8 a2 | o5 g4 e4 c+4 e4'
)
const finale = m4(
  'o5 d4. d8 f4 a4 | o5 b-4. b-8 g4 f4 | o5 c4. c8 e4 g4 | o5 a4 g4 e4 c+4 | o5 d4. d8 f4 a4 | o5 b-2 g4 f4 | o5 c+4 e4 g4 a4 | o5 a1'
)
const OST = 'rrRrrRrrrrRrrRfr'
/** Layer 2 brass counter-melody in chord tones (quarter notes; chord tones on every beat). */
const counterA = m4(
  'o5 d4 f4 a4 f4 | o5 f4 a4 f4 g4 | o5 b-4 g4 e4 g4 | o5 a4 f4 a4 d4 | o5 a4 f4 d4 f4 | o5 d4 f4 b-4 f4 | o5 b-4 g4 a4 e4 | o5 f2 a2'
)
const counterD = m4(
  'o5 d4 f4 a4 f4 | o5 d4 f4 b-4 f4 | o5 e4 g4 o6 c4 o5 g4 | o5 c+4 e4 a4 e4 | o5 a4 f4 d4 f4 | o5 b-4 f4 d4 f4 | o5 c+4 e4 g4 e4 | o5 a4 g4 e4 c+4'
)
/** A timpani roll (16ths) in the given 0-based bars of an 8-bar section. */
const roll = (bars: number[]): string =>
  Array.from({ length: 8 }, (_, i) => (bars.includes(i) ? 'rrrrrrrrrrrrrrrr' : '................')).join('|')

export const BOSS: SongDef = {
  name: 'boss',
  key: 'D minor',
  bpm: 160,
  barTicks: 48,
  gain: 0.76,
  parts: [
    {
      id: 'ost',
      inst: 'strings',
      role: 'bass',
      vol: 0.75,
      pan: -0.15,
      send: 0.2,
      chorus: 0.3,
      center: 50,
      vel: 0.6,
      gate: 0.45
    },
    { id: 'vln', inst: 'strings', role: 'melody', vol: 0.95, pan: 0.3, send: 0.3, chorus: 0.4 },
    { id: 'br', inst: 'brass', role: 'melody', vol: 1.0, pan: 0.15, send: 0.25 },
    { id: 'stab', inst: 'brass', role: 'chord', vol: 0.9, pan: -0.25, send: 0.25, center: 62, vel: 0.8, gate: 0.4 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.85, pan: -0.3, send: 0.3 },
    {
      id: 'hnhit',
      inst: 'horn',
      role: 'bass',
      vol: 0.6,
      pan: -0.3,
      send: 0.25,
      center: 50,
      vel: 0.85,
      gate: 0.5,
      layer: 2
    },
    {
      id: 'brs',
      inst: 'brass',
      role: 'chord',
      vol: 0.95,
      pan: 0.15,
      send: 0.3,
      center: 64,
      vel: 0.85,
      gate: 0.5,
      layer: 2
    },
    { id: 'cm', inst: 'brass', role: 'melody', vol: 0.9, pan: 0.4, send: 0.3, layer: 2 },
    {
      id: 'ost2',
      inst: 'strings',
      role: 'bass',
      vol: 0.9,
      pan: -0.15,
      send: 0.25,
      chorus: 0.4,
      center: 50,
      vel: 0.6,
      gate: 0.99,
      layer: 2
    },
    { id: 'tim2', inst: 'timpani', role: 'bass', vol: 0.6, center: 38, vel: 0.75, send: 0.25, layer: 2 },
    { id: 'tk2', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.75, pan: 0.1, layer: 2 },
    { id: 'hat2', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.55, pan: 0.2, layer: 2 },
    {
      id: 'hpad',
      inst: 'horn',
      role: 'chord',
      vol: 0.9,
      pan: -0.35,
      send: 0.4,
      center: 52,
      vel: 0.55,
      gate: 0.99,
      layer: 1
    },
    { id: 'ride', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.6, pan: 0.25, layer: 1 },
    {
      id: 'choir',
      inst: 'choir',
      role: 'chord',
      vol: 0.65,
      send: 0.5,
      chorus: 0.3,
      center: 58,
      vel: 0.6,
      gate: 0.99,
      layer: 1
    },
    { id: 'chm', inst: 'choir', role: 'melody', vol: 0.65, send: 0.5, chorus: 0.3 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.6, center: 38, vel: 0.75, gate: 0.6 },
    { id: 'sub', inst: 'sub', role: 'bass', vol: 0.3, center: 26, vel: 0.7, gate: 0.99 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.55, center: 38, vel: 0.85, send: 0.2 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.75, vel: 0.75, pan: 0.05 },
    { id: 'hat', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.6, pan: 0.2 },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.6, vel: 0.8, pan: -0.1, send: 0.2 },
    { id: 'cym', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.7, pan: -0.2 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 2,
      chords: 'Dm | A',
      parts: {
        ost: OST,
        stab: 'x.......x.......|x...x...x.x.x.x.',
        tim: 'r.r.r.r.r.r.r.r.|r.r.r.rrrrrrrrrr',
        tk: 'D.......D.......|D...D...D.D.D.DD',
        sub: 'r---r---',
        cym: 'c...............|................'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Dm | Dm Dm Dm Cm | Gm C | Dm | Dm | Bb | Gm A | Dm',
      parts: {
        ost: OST,
        stab: 'x..x..x.........',
        br: seq(motif(62, 'minor', { twist: true, vel: 0.9, gate: 0.85 }), r4(4)),
        vln: m4('o5 a1 | a1 | b-2 g2 | f1 | a1 | f1 | d2 e2 | a1'),
        hn: seq(motif(50, 'minor', { twist: true, vel: 0.9 }), answer),
        hnhit: 'r..r..r.r..r..r.',
        choir: 'x---------------',
        bass: 'r.rrr.rrr.rrr.Fr',
        sub: 'r---r---',
        tim: 'r...r...r...r.rr',
        dr: withFill('k.k.s.k.k.k.s.k.', 8, 'k.s.k.s.ssssssss'),
        hat: 'h.h.h.h.h.h.h.o.',
        tk: 'D.......D.......',
        cym: 'c...............|................',
        hpad: 'x---------------',
        ride: 'r.r.r.r.r.r.r.r.',
        brs: 'x..x..x.x..x..x.',
        cm: counterA,
        ost2: 'rRrRrRrRrRrRrRrR',
        tim2: roll([3, 7]),
        tk2: 'K.D.K.D.K.D.K.D.',
        hat2: 'h.h.h.h.h.h.h.h.'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Dm | Dm | Bb | C | Dm | Gm | A7 | A7',
      parts: {
        ost: OST,
        stab: 'x..x..x.x.......',
        br: verse,
        vln: seq(r4(4), m4('o4 a2 f2 | b-1 | a2 e2 | a1')),
        hn: m4('o4 d1 | d1 | o3 b-1 | o4 c1 | d1 | o3 g1 | a1 | a1'),
        hnhit: 'r..r..r.r..r..r.',
        choir: 'x---------------',
        bass: 'r.rrr.rrr.rrr.Fr',
        sub: 'r---r---',
        tim: 'r...r...r...r.rr',
        dr: withFill('k.k.s.k.k.k.s.k.', 8, 'k.k.s.s.ssssssss'),
        hat: 'h.h.h.h.h.h.h.o.',
        tk: 'D...D...D.D.D...',
        hpad: 'x---------------',
        ride: 'r...r...r...r...',
        brs: 'x-------x-------',
        ost2: 'r.R.r.R.r.R.r.R.',
        tim2: roll([3, 7]),
        tk2: 'D.......D.......'
      }
    },
    {
      name: 'C',
      bars: 8,
      chords: 'Dm | Dm | Dm | Dm Cm | Gm7 | Gm7 C | Dm | Asus4',
      parts: {
        ost: OST,
        chm: motif(50, 'minor', { twist: true, stretch: 2, vel: 0.85, gate: 0.97 }),
        choir: 'x---------------',
        vln: seq(r4(4), m4('o5 d1 | d2 e2 | f1 | e1')),
        bass: 'r.r.r.r.r.r.r.r.',
        sub: 'r---r---',
        tim: 'r.......r.......|r.......r.......|r.......r.......|r.......r.......|r.......r.......|r.......r.......|r.......r.......|rrrrrrrrrrrrrrrr',
        tk: 'D.......D.......',
        hat: '....h.......h...',
        dr: '................|................|................|................|................|................|................|s.s.s.s.ssssssss',
        hpad: 'x---------------',
        ride: 'r...r...r...r...',
        brs: 'x-------x-------',
        ost2: 'r.R.r.R.r.R.r.R.',
        tim2: roll([3, 5, 7]),
        tk2: 'D.......D.......'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'Dm | Dm Dm Dm Cm | Gm C | Dm | Dm | Bb | Gm A | Dm',
      parts: {
        ost: OST,
        stab: 'x..x..x.........',
        br: seq(motif(62, 'minor', { twist: true, vel: 0.95, gate: 0.85 }), r4(4)),
        vln: m4('o5 a1 | a1 | b-2 g2 | f1 | a1 | f1 | d2 e2 | a1'),
        hn: seq(motif(50, 'minor', { twist: true, vel: 0.95 }), answer),
        hnhit: 'r..r..r.r..r..r.',
        choir: 'x---------------',
        bass: 'r.rrr.rrr.rrr.Fr',
        sub: 'r---r---',
        tim: 'r...r...r...r.rr',
        dr: withFill('k.k.s.k.k.k.s.k.', 8, 'k.s.k.s.ssssssss'),
        hat: 'h.h.h.h.h.h.h.o.',
        tk: 'D.......D.D.....',
        cym: 'c...............|................',
        hpad: 'x---------------',
        ride: 'r.r.r.r.r.r.r.r.',
        brs: 'x..x..x.x..x..x.',
        cm: counterA,
        ost2: 'rRrRrRrRrRrRrRrR',
        tim2: roll([3, 7]),
        tk2: 'K.D.K.D.K.D.K.D.',
        hat2: 'h.h.h.h.h.h.h.h.'
      }
    },
    {
      name: 'D',
      bars: 8,
      chords: 'Dm | Bb | C | A | Dm | Bb | A7 | A7',
      parts: {
        ost: OST,
        stab: 'x.x.x.x.x.x.x.x.',
        br: finale,
        vln: seq(m4('o5 d1 | b-1 | c1 | a1 | d1 | b-1 | a1 | a1')),
        hn: m4('o4 d1 | o3 b-1 | o4 c1 | o3 a1 | o4 d1 | o3 b-1 | a1 | a1'),
        hnhit: 'r.r.r.r.r.r.r.r.',
        choir: 'x---------------',
        bass: 'r.rrr.rrr.rrr.Fr',
        sub: 'r---r---',
        tim: 'r.r.r.r.r.r.r.r.',
        dr: withFill('k.k.s.k.k.k.s.k.', 8, 'ssssssssssssssss'),
        hat: 'h.h.h.h.h.h.h.o.',
        tk: 'D...D...D...D...',
        cym: 'c...............|................',
        hpad: 'x---------------',
        ride: 'r.r.r.r.r.r.r.r.',
        brs: 'x.xx.xx.x.xx.xx.',
        cm: counterD,
        ost2: 'rRrRrRrRrRrRrRrR',
        tim2: roll([1, 3, 5, 7]),
        tk2: 'K.D.K.D.K.D.K.D.',
        hat2: 'hhhhhhhhhhhhhhhh'
      }
    }
  ]
}
