import { transpose, type SongDef } from '../notation'
import { m3, motif, motifHead, r3, seq } from './util'

/**
 * 「風の塔」 A major, 3/4 at 120 bpm. Harp arpeggios, flute, soaring strings and horn; light wind-chime percussion.
 * The motif (in its three-four form) opens A, returns in the horn in A', and climbs as heads in the bridge.
 * Form: intro (4) then A (8) / B (8) / A' (8) / C (8, a bell version of the motif over a hushed wind) / bridge (8). Layer 1 adds a waltz kit, driving strings and brass stabs; layer 2 adds timpani and chip sparkle.
 */
const answer = m3('o5 f+4 a4 o6 d4 | o5 g+4 b4 o6 e4 | o6 c+4 o5 a8 f+8 b8 g+8 | o5 e4 a2')
const soar = m3(
  'o5 a2 o6 d4 | o6 c+2 e4 | o6 d4 c+4 o5 b4 | o5 g+2 b4 | o6 d2 f+4 | o6 e2 c+4 | o6 d4 o5 b8 g+4 b8 | o5 a2.'
)
const LAYERS = {
  dr1: 'k...s...s...',
  ost: 'rrrrrr',
  stab: 'x.x.x.',
  chip: '123454321234',
  tim2: 'r.r.r.',
  cym: 'c.....'
}
const heads = (tonic: number, shifts: number[]) =>
  seq(...shifts.map((s) => motifHead(tonic, 'major', s, { meter: 3, gate: 0.7 })))

const bridgeLead = seq(heads(69, [0, 1, 2, 3, 4]), m3('o6 a4 f+4 d4 | o5 b4 g+4 e4 | o5 b2.'))

export const TOWER: SongDef = {
  name: 'tower',
  key: 'A major',
  bpm: 116,
  barTicks: 36,
  gain: 1.06,
  parts: [
    { id: 'harp', inst: 'harp', role: 'chord', vol: 0.8, pan: -0.4, send: 0.45, center: 62, vel: 0.6, gate: 0.95 },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.85, pan: 0.2, send: 0.45 },
    {
      id: 'str',
      inst: 'strings',
      role: 'chord',
      vol: 0.65,
      pan: 0.0,
      send: 0.45,
      chorus: 0.6,
      center: 62,
      vel: 0.5,
      gate: 0.99
    },
    { id: 'vln', inst: 'strings', role: 'melody', vol: 0.6, pan: 0.3, send: 0.45, chorus: 0.4 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.85, pan: -0.25, send: 0.4 },
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.6, pan: 0.3, send: 0.35 },
    { id: 'bell', inst: 'bell', role: 'chord', vol: 0.4, pan: 0.45, send: 0.5, center: 84, vel: 0.5 },
    { id: 'mb', inst: 'musicbox', role: 'chord', vol: 0.35, pan: -0.5, send: 0.4, center: 84, vel: 0.5 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.8, center: 33, vel: 0.65, gate: 0.8 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.6, center: 40, vel: 0.7, send: 0.2 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.55, pan: 0.1, maxLayer: 0 },
    { id: 'bellm', inst: 'bell', role: 'melody', vol: 0.55, pan: 0.4, send: 0.5 },
    { id: 'dr1', inst: 'kit', role: 'drum', vol: 0.65, vel: 0.7, pan: 0.1, layer: 1 },
    {
      id: 'ost',
      inst: 'strings',
      role: 'bass',
      vol: 0.6,
      pan: -0.2,
      send: 0.2,
      chorus: 0.3,
      center: 45,
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
      send: 0.25,
      center: 60,
      vel: 0.65,
      gate: 0.4,
      layer: 1
    },
    { id: 'chip', inst: 'pulse', role: 'chord', vol: 0.3, pan: 0.15, center: 76, vel: 0.55, gate: 0.4, layer: 2 },
    { id: 'tim2', inst: 'timpani', role: 'bass', vol: 0.6, center: 40, vel: 0.8, send: 0.25, layer: 2 },
    { id: 'cym', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.7, pan: -0.2, layer: 2 },
    { id: 'pc', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.5, pan: -0.2 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'A | Dmaj7 | A | E',
      parts: {
        harp: '123454|123454|123454|123454',
        str: 'x-----',
        fl: seq(r3(2), motifHead(69, 'major', 0, { meter: 3, vel: 0.6 }), r3(1)),
        bell: '1.....|......|1.1...|1.1.1.',
        mb: '1.....|..1...|1.....|1.1.1.',
        tim: 'r.....|......|r.....|r.r.r.'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'A | Dmaj7 | F#m | E E A | D | E | F#m E | A',
      parts: {
        ...LAYERS,
        harp: '123454',
        str: 'x-----',
        fl: seq(motif(69, 'major', { meter: 3, vel: 0.68, gate: 0.9 }), answer),
        bass: 'r.....',
        mb: '1.....',
        pc: 'g.....',
        dr: '......'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'D | A/C# | Bm | E | D | A/C# | Bm E | A',
      parts: {
        ...LAYERS,
        harp: '123454',
        str: 'x-----',
        fl: soar,
        vln: seq(r3(4), m3('o5 d2. | e2. | b2. | c+2.')),
        hn: m3('o3 d2. | c+2. | b2. | g+2. | d2. | c+2. | b2. | a2.'),
        bass: 'r.....|r.....|r...f.|r.....',
        tim: 'r.....',
        pc: 'g.....|..z.z.|g.....|..z.z.',
        dr: '..p...'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'A | Dmaj7 | F#m | E E A | D | E | F#m E | A',
      parts: {
        ...LAYERS,
        harp: '123454',
        str: 'x-----',
        hn: seq(motif(57, 'major', { meter: 3, vel: 0.85 }), m3('o4 d2. | e2. | f+4 e2 | a2.')),
        fl: seq(r3(4), answer),
        vln: seq(motif(69, 'major', { meter: 3, vel: 0.55, gate: 0.9 }), r3(4)),
        bell: '1.....|......|1.....|......|1.....|......|1.....|......',
        bass: 'r.....',
        tim: 'r.....',
        pc: 'g.....',
        dr: '..p...'
      }
    },
    {
      name: 'C',
      bars: 8,
      chords: 'A | Dmaj7 | F#m | E E A | D | E | F#m E | A',
      parts: {
        ...LAYERS,
        harp: '123454',
        str: 'x-----',
        bellm: seq(motif(69, 'major', { meter: 3, vel: 0.7, gate: 0.9 }), answer),
        fl: seq(r3(4), m3('o6 a2. | g+2. | f+2. | e2.')),
        vln: seq(r3(4), m3('o5 d2. | e2. | c+2. | o4 a2.')),
        bass: 'r.....'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'A | Bm | C#m | D | E | D | E | E',
      parts: {
        ...LAYERS,
        harp: '123454',
        str: 'x-----',
        fl: bridgeLead,
        hn: transpose(bridgeLead, -24),
        vln: transpose(bridgeLead, -12),
        br: seq(r3(4), m3('o4 g+2. | f+2. | g+2. | b2.')),
        bell: '1.....',
        bass: 'r.....',
        tim: 'r.....|r.....|r.....|r.....|r.....|r.....|r.r.r.|rrrrrr',
        pc: 'g.....',
        dr: '..p...'
      }
    }
  ]
}
