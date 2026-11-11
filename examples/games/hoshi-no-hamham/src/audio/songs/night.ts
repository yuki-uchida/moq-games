import type { SongDef } from '../notation'
import { m4, minorKey, withFill, type KeyInfo } from './util'

/**
 * 「つきよのおいかけ」 night: stage 3. A minor, 126 bpm, 4/4. A moonlit chase after the kidnappers: urgent but bright
 * rather than dark. A bowed-string ostinato drives everything; a pulse-wave lead plays the tune, oboe sings the
 * contrasting theme, celesta sparkles at the ends of phrases, light timpani and rim shots keep the pace.
 * Form (loops from A): intro (4) / A (8: the chase hook, question and answer) / B (8: oboe's singing theme) /
 * A' (8: A with an oboe counter-line and the pad) / bridge (8: 16th-note ostinato, rising suspense on a dominant pedal) /
 * B2 (8: the B theme on the pulse lead) -> back to A on the dominant (E7 pedal -> Am).
 * Layer 1 (the pinch): hat/snare drive, tambourine and brass stabs.
 */

/* ------------------------------------------------------------------------------------------------ melodies */

// intro, chords: Am | Am | F | E
const INTRO_LD = m4('r1 | r1 | o5 f8 f8 a4 o6 c4 f4 | o5 g+8 g+8 b4 o6 e4 g+4')

// A, chords: Am | Am | F | E | Am | G | F | E
const A_LD = m4(
  `o5 a8 a8 o6 c4 o5 a8 o6 c8 e4 | o6 e4. d8 c4 o5 a4 | o5 f8 f8 a4 o6 c4 f4 | o6 e4 d8 c8 o5 b4 g+4 |
   o5 a8 a8 o6 c4 e4 c4 | o5 b8 b8 o6 d4 g4 d4 | o6 f4 e8 d8 c4 o5 a4 | o5 g+4 b4 o6 e2`
)
const A_CEL = m4(
  `r1 | r2 o6 a8 e8 c8 e8 | r1 | r2 o6 e8 g+8 b8 g+8 | r1 | r2 o6 d8 g8 b8 g8 | r1 | r2 o6 b8 g+8 e8 g+8`
)
const A2_OB = m4('o5 e1 | c1 | a1 | o4 b1 | o5 e1 | d1 | c1 | o4 g+1')

// B, chords: F | G | Em | Am | Dm | G | C | E
const B_OB = m4(
  `o5 f4 a4 o6 c4. d8 | d2 o5 b4 g4 | g4 b4 o6 e4. d8 | c4 e4 d4 c4 |
   o6 f4. e8 d4 o5 a4 | b4 o6 d4 g2 | e4 d4 c4 o5 g4 | e4 g+4 b2`
)
const B_CEL = m4(`r1 | r1 | r2 o6 g8 b8 e8 b8 | r1 | r1 | r1 | r2 o6 c8 e8 g8 e8 | r2 o6 b8 g+8 e8 g+8`)

// bridge, chords: Am | Dm | E | E | F | G | E | E
const BR_LD = m4(
  `o5 a8 a8 a8 o6 c8 c4 e4 | o6 f8 f8 d8 f8 d4 o5 a4 | o5 b8 b8 g+8 b8 o6 e4 o5 b4 | o6 e8 e8 d8 e8 o5 b4 g+4 |
   o6 c8 c8 o5 a8 o6 c8 f4 c4 | o6 d8 d8 o5 b8 o6 d8 g4 d4 | o6 e4 d8 c8 o5 b4 g+4 | o5 g+4 b4 o6 e4 e4`
)
const BR_CEL = m4(
  `r1 | r1 | r2 o6 b8 g+8 e8 g+8 | r1 | r1 | r1 | r2 o6 e8 g+8 b8 g+8 | o6 b8 g+8 e8 g+8 b8 o7 e8 d8 o6 b8`
)

/* ------------------------------------------------------------------------------------------------ grids */

const OST8 = '12321232'
const OST16 = '1232123212321232'
const BASS_A = 'r.rrr.rr'
const BASS_END = 'r.rrr.ra'
const A_BASS = `${BASS_A}|${BASS_A}|${BASS_A}|${BASS_END}|${BASS_A}|${BASS_A}|${BASS_A}|${BASS_END}`
const DR0 = 'k...p...k...p...'
const DR0_FILL = 'k...p...k.p.p.pp'
const DR1 = 'h.h.s.h.h.h.s.hh'
const DR1_FILL = 'h.h.s.h.hsssssss'

export const SONG: SongDef = {
  name: 'night',
  key: 'A minor',
  bpm: 126,
  barTicks: 48,
  gain: 1.04,
  parts: [
    { id: 'ld', inst: 'pulse', role: 'melody', vol: 0.5, pan: 0.1, send: 0.2 },
    { id: 'ob', inst: 'oboe', role: 'melody', vol: 0.72, pan: -0.15, send: 0.3 },
    { id: 'cel', inst: 'celesta', role: 'melody', vol: 0.4, pan: 0.45, send: 0.4 },
    {
      id: 'ost',
      inst: 'strings',
      role: 'chord',
      vol: 0.55,
      pan: -0.3,
      send: 0.2,
      chorus: 0.4,
      center: 55,
      vel: 0.55,
      gate: 0.75
    },
    {
      id: 'pad',
      inst: 'strings',
      role: 'chord',
      vol: 0.36,
      pan: 0.25,
      send: 0.4,
      chorus: 0.5,
      center: 62,
      vel: 0.5,
      gate: 0.98
    },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.85, center: 31, vel: 0.72, gate: 0.6 },
    { id: 'timp', inst: 'timpani', role: 'bass', vol: 0.5, center: 36, vel: 0.7 },
    { id: 'dr0', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.55, pan: 0.05 },
    { id: 'dr1', inst: 'kit', role: 'drum', vol: 0.55, vel: 0.62, pan: 0.05, layer: 1 },
    { id: 'tb', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.6, pan: -0.15, layer: 1 },
    {
      id: 'stab',
      inst: 'brass',
      role: 'chord',
      vol: 0.32,
      pan: 0.25,
      send: 0.25,
      center: 62,
      vel: 0.6,
      gate: 0.3,
      layer: 1
    }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Am | Am | F | E',
      parts: {
        ld: INTRO_LD,
        ost: OST8,
        bass: 'r.rrr.rr',
        timp: 'r...r...',
        dr0: 'k...p...k...p...|k...p...k...p...|k...p...k...p...|k...p...k.p.p.pp',
        dr1: DR1,
        tb: 'a.a.a.a.a.a.a.a.',
        stab: 'x..x..x.'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Am | Am | F | E | Am | G | F | E',
      parts: {
        ld: A_LD,
        cel: A_CEL,
        ost: OST8,
        bass: A_BASS,
        timp: 'r...r...',
        dr0: withFill(DR0, 8, DR0_FILL),
        dr1: withFill(DR1, 8, DR1_FILL),
        tb: 'a.a.a.a.a.a.a.a.',
        stab: 'x..x..x.'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'F | G | Em | Am | Dm | G | C | E',
      parts: {
        ob: B_OB,
        cel: B_CEL,
        ost: '1.2.3.2.',
        pad: 'x',
        bass: 'r...r...|r...r...|r...r...|r...r...|r...r...|r...r...|r...r...|r...a...',
        timp: 'r.......',
        dr0: 'k...p...k...p...',
        dr1: 'h.h.h.h.h.h.h.h.',
        tb: 'a...a...a...a...',
        stab: 'x...x...'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'Am | Am | F | E | Am | G | F | E',
      parts: {
        ld: A_LD,
        ob: A2_OB,
        cel: A_CEL,
        ost: OST8,
        pad: 'x',
        bass: A_BASS,
        timp: 'r...r...',
        dr0: withFill(DR0, 8, DR0_FILL),
        dr1: withFill(DR1, 8, DR1_FILL),
        tb: 'a.a.a.a.a.a.a.a.',
        stab: 'x..x..x.'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Am | Dm | E | E | F | G | E | E',
      parts: {
        ld: BR_LD,
        cel: BR_CEL,
        ost: OST16,
        pad: 'x',
        bass: 'rrrrrrrr',
        timp: 'r.r.r.r.',
        dr0: 'k.p.k.p.k.p.k.p.',
        dr1: 'h.h.h.h.h.h.h.h.|h.h.h.h.h.h.h.h.|h.h.h.h.h.h.h.h.|h.h.h.h.h.h.h.h.|h.h.h.h.h.h.h.h.|h.h.h.h.h.h.h.h.|h.h.h.h.h.h.h.h.|ssssssssssssssss',
        tb: 'a.a.a.a.a.a.a.a.',
        stab: 'x.x.x.x.'
      }
    },
    {
      name: 'B2',
      bars: 8,
      chords: 'F | G | Em | Am | Dm | G | C | E',
      parts: {
        ld: B_OB,
        cel: B_CEL,
        ost: OST8,
        pad: 'x',
        bass: 'r.rrr.rr|r.rrr.rr|r.rrr.rr|r.rrr.rr|r.rrr.rr|r.rrr.rr|r.rrr.rr|r.rrr.ra',
        timp: 'r...r...',
        dr0: withFill(DR0, 8, DR0_FILL),
        dr1: withFill(DR1, 8, DR1_FILL),
        tb: 'a.a.a.a.a.a.a.a.',
        stab: 'x..x..x.'
      }
    }
  ]
}

export const KEY: KeyInfo = minorKey(9, [8])
