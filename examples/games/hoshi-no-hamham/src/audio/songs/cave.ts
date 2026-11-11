import type { SongDef } from '../notation'
import { m4, minorKey, type KeyInfo } from './util'

/**
 * 「こっそりアジト」 cave: stage 4. E minor, 100 bpm, 4/4 with a light triplet swing. Sneaking into the gang's hideout:
 * sly and playful rather than scary. A staccato clarinet tiptoes over a plucked bass and syncopated pizzicato,
 * celesta drips fall at the ends of phrases, brushed shaker and soft snare keep time.
 * Form (loops from A): intro (4: teased hook) / A (8: tiptoe hook, question and answer) / B (8: peeking round the corner,
 * a brighter legato tune through C and G) / A' (8: A with an oboe counter-line and strings) /
 * bridge (8: almost silent, notes placed one at a time over a creeping A minor - E minor, then a crescendo into B7).
 * Layer 1 (the pinch): a nervous string ostinato, hi-hat drive, tambourine and pulse stabs.
 */

/* ------------------------------------------------------------------------------------------------ melodies */

// intro, chords: Em | Em | Am | B7
const INTRO_CL = m4(`r1 | r1 | o4 a8' a8' o5 c8' e8' a4 r4 | o4 b8' o5 d+8' f+8' d+8' o4 b4 f+4`)
const INTRO_CEL = m4('o6 e4 r4 b4 r4 | o6 g4 r2 e4 | o6 e4 r4 a4 r4 | r1')

// A, chords: Em | Em | Am | B7 | Em | Em | C | B7
const A_CL = m4(
  `o4 e8' e8' g8' b8' o5 e4 r4 | o4 b8' o5 d8' e8' d8' o4 b4 g4 | o4 a8' a8' o5 c8' e8' a4 r4 | o4 b8' o5 d+8' f+8' d+8' o4 b4 f+4 |
   o4 e8' e8' g8' b8' o5 e4 g4 | o5 e8' f+8' g8' f+8' e4 g4 | o5 c8' e8' g8' e8' c4 r4 | o4 b8' o5 d+8' f+8' a8' f+4 d+4`
)
const A_CEL = m4(`r1 | r2 o6 e8 g8 e4 | r1 | r2 o6 d+8 f+8 d+4 | r1 | r2 o6 g8 e8 b4 | r1 | r2 o6 f+8 a8 f+4`)
const A2_OB = m4('o5 g1 | o5 e1 | o5 c1 | o5 d+1 | o5 g1 | o5 b1 | o5 g1 | o5 f+1')

// B, chords: C | G | D | Em | C | G | Am | B7
const B_CL = m4(
  `o5 e8 g8 o6 c4 o5 g4 e4 | o5 d8 g8 b4 o6 d4 o5 b4 | o5 a8 o6 d8 f+4 d4 o5 a4 | o5 b4 g4 e2 |
   o5 g8 o6 c8 e4 c4 o5 g4 | o5 b8 o6 d8 g4 d4 o5 b4 | o6 e4 c4 o5 a4 e4 | o6 d+4 o5 b4 f+4 d+4`
)
const B_CEL = m4(`r1 | r1 | r2 o6 a8 d8 f+4 | r1 | r1 | r1 | r2 o6 a8 e8 c4 | r2 o6 b8 f+8 d+4`)

// bridge, chords: Em | Am | Em | Am | C | D | Am | B7
const BR_CL = m4(
  `o4 b4' r4 o5 e4' r4 | o4 a4' r4 o5 c4' r4 | o5 g4' e4' o4 b4' r4 | o4 a4' o5 c4' e4' r4 |
   o5 e4' g4' o6 c4' r4 | o5 d4' f+4' a4' r4 | o5 c4' e4' a4' r4 | o5 b8' d+8' f+8' a8' f+4 d+4`
)
const BR_CEL = m4(
  `r4 o6 e4 r2 | r4 o6 a4 r2 | r2 o6 g4 r4 | r2 o6 e4 r4 | r4 o6 e4 r2 | r2 o6 f+4 r4 | r4 o6 e4 r2 | r2 o6 b8 g8 f+8 d+8`
)

/* ------------------------------------------------------------------------------------------------ grids */

const BASS_A = 'r.f.r.t.'
const BASS_END = 'r.f.r.a.'
const A_BASS = `${BASS_A}|${BASS_A}|${BASS_A}|${BASS_END}|${BASS_A}|${BASS_A}|${BASS_A}|${BASS_END}`
const PZ_A = '..x...x.|..x..x.x'
const DR0 = "k.z.s'.z.k.z.s'.z."
const DR0_FILL = "k.z.s'.z.k.z.s'.ss'"
const A_DR0 = `${DR0}|${DR0}|${DR0}|${DR0}|${DR0}|${DR0}|${DR0}|${DR0_FILL}`
const DR1 = 'o.h.h.h.o.h.h.h.'
const A_DR1 = `${DR1}|${DR1}|${DR1}|${DR1}|${DR1}|${DR1}|${DR1}|h.h.h.h.hhhhhhhh`

export const SONG: SongDef = {
  name: 'cave',
  key: 'E minor',
  bpm: 100,
  barTicks: 48,
  swing: 2,
  gain: 0.86,
  parts: [
    { id: 'cl', inst: 'clarinet', role: 'melody', vol: 0.85, pan: -0.1, send: 0.3 },
    { id: 'cel', inst: 'celesta', role: 'melody', vol: 0.4, pan: 0.45, send: 0.4 },
    { id: 'ob', inst: 'oboe', role: 'melody', vol: 0.5, pan: 0.25, send: 0.3 },
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.7, pan: -0.35, send: 0.2, center: 62, vel: 0.6, gate: 0.45 },
    {
      id: 'str',
      inst: 'strings',
      role: 'chord',
      vol: 0.34,
      pan: 0.1,
      send: 0.4,
      chorus: 0.5,
      center: 60,
      vel: 0.5,
      gate: 0.98
    },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.9, center: 36, vel: 0.7, gate: 0.42 },
    { id: 'dr0', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.5, pan: 0.05 },
    { id: 'dr1', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.58, pan: 0.05, layer: 1 },
    { id: 'tb', inst: 'kit', role: 'drum', vol: 0.38, vel: 0.55, pan: -0.15, layer: 1 },
    {
      id: 'ost',
      inst: 'strings',
      role: 'chord',
      vol: 0.42,
      pan: -0.25,
      send: 0.25,
      chorus: 0.4,
      center: 56,
      vel: 0.55,
      gate: 0.6,
      layer: 1
    },
    {
      id: 'stab',
      inst: 'pulse',
      role: 'chord',
      vol: 0.18,
      pan: 0.3,
      send: 0.2,
      center: 68,
      vel: 0.55,
      gate: 0.3,
      layer: 1
    }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Em | Em | Am | B7',
      parts: {
        cl: INTRO_CL,
        cel: INTRO_CEL,
        pz: PZ_A,
        bass: 'r...f...|r...f...|r.f.r.t.|r.f.r.a.',
        dr0: "z.z.z.z.z.z.z.z.|z.z.z.z.z.z.z.z.|k.z.s'.z.k.z.s'.z.|k.z.s'.z.k.z.s'.ss'",
        dr1: 'o.h.h.h.o.h.h.h.',
        tb: 'a...a...a...a...',
        ost: '12321232',
        stab: 'x..x..x.'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Em | Em | Am | B7 | Em | Em | C | B7',
      parts: {
        cl: A_CL,
        cel: A_CEL,
        pz: PZ_A,
        bass: A_BASS,
        dr0: A_DR0,
        dr1: A_DR1,
        tb: 'a...a...a...a...',
        ost: '12321232',
        stab: 'x..x..x.'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'C | G | D | Em | C | G | Am | B7',
      parts: {
        cl: B_CL,
        cel: B_CEL,
        pz: 'x...x...|..x...x.',
        str: 'x',
        bass: 'r.f.r.f.|r.f.r.f.|r.f.r.f.|r.f.r.t.|r.f.r.f.|r.f.r.f.|r.f.r.f.|r.f.r.a.',
        dr0: A_DR0,
        dr1: A_DR1,
        tb: 'a...a...a...a...',
        ost: '1.2.3.2.',
        stab: 'x...x...'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'Em | Em | Am | B7 | Em | Em | C | B7',
      parts: {
        cl: A_CL,
        cel: A_CEL,
        ob: A2_OB,
        pz: PZ_A,
        str: 'x',
        bass: A_BASS,
        dr0: A_DR0,
        dr1: A_DR1,
        tb: 'a...a...a...a...',
        ost: '12321232',
        stab: 'x..x..x.'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Em | Am | Em | Am | C | D | Am | B7',
      parts: {
        cl: BR_CL,
        cel: BR_CEL,
        str: 'x',
        bass: 'r.......|r.......|r.......|r.......|r.......|r.......|r.......|r.f.r.a.',
        dr0: 'z...z...z...z...',
        dr1: 'h.......h.......',
        tb: 'a...a...a...a...',
        ost: '1...2...3...2...',
        stab: 'x...x...'
      }
    }
  ]
}

export const KEY: KeyInfo = minorKey(4, [3])
