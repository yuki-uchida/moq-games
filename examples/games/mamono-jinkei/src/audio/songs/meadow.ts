import type { SongDef } from '../notation'
import { m4, motif, motifHead, r4, rep, seq, withFill } from './util'

/**
 * 「はじまりの草原」 C major, 128 bpm. Stage 1 (slime): pizzicato, flute, bells, light drums.
 * Layer 1 (fights) adds the full drum kit, strings and brass stabs; layer 2 adds horn, chip sparkle and more drive.
 * Form (loop from A): A (motif + answer) / B (playful tune) / A' / bridge (the motif's first bar climbing C-Dm-Em-F-G).
 */
const answer = m4(
  'o5 e8 a8 o6 c8 o5 a8 e4 a4 | o5 f8 a8 o6 c8 o5 a8 f4 c4 | o5 d8 f8 a8 f8 g8 b8 o6 d8 o5 b8 | o6 c4 o5 g4 e4 c4'
)
const tune = m4(
  'o5 a4 a8 f8 a4 o6 c4 | o6 c4 o5 g8 e8 g2 | o5 d4 f8 a8 o6 d4 c4 | o5 b4. g8 b2 | o5 a4 a8 f8 a4 o6 f4 | o6 e4 o5 b4 a4 e4 | o5 f4 d8 f8 a4 f4 | o5 g8 b8 o6 d8 o5 b8 g2'
)
const heads = (tonic: number, shifts: number[]) =>
  seq(...shifts.map((s) => motifHead(tonic, 'major', s, { gate: 0.6 })))

export const MEADOW: SongDef = {
  name: 'meadow',
  key: 'C major',
  bpm: 128,
  barTicks: 48,
  gain: 1.25,
  parts: [
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.7, pan: -0.3, send: 0.25, center: 60, vel: 0.6, gate: 0.5 },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.85, pan: 0.15, send: 0.3 },
    { id: 'gl', inst: 'glock', role: 'melody', vol: 0.5, pan: 0.45, send: 0.35 },
    { id: 'harp', inst: 'harp', role: 'chord', vol: 0.55, pan: -0.5, send: 0.3, center: 66, vel: 0.5 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.85, center: 36, vel: 0.7, gate: 0.7 },
    { id: 'dr0', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.55, pan: 0.05, maxLayer: 0 },
    { id: 'dr1', inst: 'kit', role: 'drum', vol: 0.7, vel: 0.7, pan: 0.05, layer: 1 },
    { id: 'tb', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.6, pan: -0.15, layer: 1 },
    {
      id: 'str',
      inst: 'strings',
      role: 'chord',
      vol: 0.55,
      pan: 0.0,
      send: 0.35,
      chorus: 0.5,
      center: 62,
      vel: 0.5,
      gate: 0.99,
      layer: 1
    },
    {
      id: 'br',
      inst: 'brass',
      role: 'chord',
      vol: 0.55,
      pan: 0.3,
      send: 0.25,
      center: 62,
      vel: 0.65,
      gate: 0.4,
      layer: 1
    },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.8, pan: -0.25, send: 0.3, layer: 2 },
    { id: 'chip', inst: 'pulse', role: 'chord', vol: 0.22, pan: 0.1, center: 76, vel: 0.5, gate: 0.5, layer: 2 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.6, center: 36, vel: 0.75, layer: 2 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 2,
      chords: 'C | G',
      parts: {
        pz: 'x.x.x.x.x.x.x.x.|.x.x.x.x',
        gl: m4('o6 c8 e8 g8 e8 c8 e8 g8 e8 | g8 b8 o7 d8 o6 b8 g4 r4'),
        dr0: 'k.z.s.z.|k.z.s.sz',
        dr1: 'k.k.s.s.|k.k.s.ss'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'C | F G | C G | C | Am | F | Dm G | C',
      parts: {
        pz: '.x.x.x.x',
        fl: seq(motif(72, 'major', { vel: 0.7, gate: 0.85 }), answer),
        gl: seq(motif(72, 'major', { vel: 0.4, gate: 0.5 }), r4(4)),
        harp: '12345432',
        bass: 'r.R.r.f.',
        dr0: 'k...p...k...p...|k...p...k...p...',
        dr1: withFill('k.h.s.h.k.h.s.h.', 8, 'k.h.s.s.k.s.ssss'),
        tb: 'a.a.a.a.a.a.a.a.',
        str: 'x---------------',
        br: 'x.......x.......|x.......x.x.....',
        hn: seq(motif(48, 'major', { vel: 0.8 }), m4('o3 a1 | f1 | d2 g2 | c1')),
        chip: '1.3.5.3.1.3.5.3.',
        tim: 'r.......r.r.....'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'F | C/E | Dm | G | F | Em Am | Dm | G',
      parts: {
        pz: '.x.x.x.x',
        fl: tune,
        gl: seq(r4(4), m4('o6 f4 a4 o7 c2 | o6 e4 g4 o7 c2 | o6 d4 f4 a2 | o6 g1')),
        harp: '12345432',
        bass: 'r.R.r.f.',
        dr0: 'k...p...k...p...',
        dr1: withFill('k.h.s.h.k.h.s.h.', 8, 'k.h.s.h.s.s.s.s.'),
        tb: 'a.a.a.a.a.a.a.a.',
        str: 'x---------------',
        br: '.x..x..x.x......',
        hn: m4('o3 f1 | e1 | d1 | g1 | f1 | e2 a2 | d1 | g1'),
        chip: '1234543212345432',
        tim: 'r.......r.r.....'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'C | F G | C G | C | Am | F | Dm G | C',
      parts: {
        pz: '.x.x.x.x',
        fl: seq(motif(72, 'major', { vel: 0.62, gate: 0.85 }), answer),
        gl: seq(motif(84, 'major', { vel: 0.55, gate: 0.5 }), r4(4)),
        harp: '12345432',
        bass: 'r.R.r.f.',
        dr0: 'k...p...k...p...|k...p...k...p...',
        dr1: withFill('k.h.s.h.k.h.s.h.', 8, 'k.h.s.s.k.s.ssss'),
        tb: 'a.a.a.a.a.a.a.a.',
        str: 'x---------------',
        br: 'x.......x.......|x.......x.x.....',
        hn: seq(motif(48, 'major', { vel: 0.8 }), m4('o3 a1 | f1 | d2 g2 | c1')),
        chip: '1.3.5.3.1.3.5.3.',
        tim: 'r.......r.r.....'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'C | Dm | Em | F | G | Am | F | G',
      parts: {
        pz: 'x.x.x.x.',
        gl: heads(72, [0, 1, 2, 3, 4, 5, 3, 4]),
        fl: seq(r4(4), heads(60, [4, 5, 3, 4])),
        harp: '1234543212345432',
        bass: 'r.r.r.r.',
        dr0: 'k...p...k...p...',
        dr1: withFill('k.k.s.k.k.k.s.s.', 8, 'ssssssssssssssss'),
        tb: 'c...............|' + rep('a.a.a.a.a.a.a.a.', 7),
        str: 'x---------------',
        br: 'x...x...x...x...',
        hn: heads(48, [0, 1, 2, 3, 4, 5, 3, 4]),
        chip: '1234543212345432',
        tim: 'r.r.r.r.|r.r.r.r.|r.r.r.r.|r.r.r.r.|r.r.r.r.|r.r.r.r.|r.r.r.r.|rrrrrrrr'
      }
    }
  ]
}
