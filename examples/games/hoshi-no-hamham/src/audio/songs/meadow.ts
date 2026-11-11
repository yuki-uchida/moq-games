import type { SongDef } from '../notation'
import { m4, majorKey, rep, seq, withFill, type KeyInfo } from './util'

/**
 * 「ひだまりのかけっこ」 meadow: stages 1-2. D major, 144 bpm, 4/4. Running through sunny fields with Mum close behind:
 * upbeat, skipping and a little cheeky. Flute carries the tune over off-beat pizzicato, a walking bass and strings;
 * glockenspiel answers at the end of every phrase, clarinet adds a warm counter-line.
 * Form (loops from A): intro (4) / A (8: hook with the leitmotif head, question and answer) / B (8: singing contrast) /
 * A' (8: A with clarinet counter-line and strings) / bridge (8: sparse, clarinet over a swelling pad) /
 * B2 (8: B tune on clarinet, bright glockenspiel) -> back to A on the dominant.
 * Layer 1 (a close chase or two hearts left): a snare/hat drive, tambourine and pulse-wave stabs on top of everything.
 */

/* ------------------------------------------------------------------------------------------------ melodies */

const INTRO_GL = m4('o6 d8 f+8 a8 f+8 d4 f+4 | f+4 d4 o5 b4 r4 | o6 g8 b8 o7 d8 o6 b8 g4 b4 | o6 e4 a4 o7 c+4 r4')

// A, chords: D | G | D | A | D | Bm | G A | D
const A_FL = m4(
  `o5 d8 d8 f+4 d4 a4 | b8 b8 o6 d4 o5 b4 g4 | a8 a8 o6 c+4 o5 a4 f+4 | o6 e4. d8 c+4 e4 |
   o6 d4. c+8 d4 o5 a4 | b8 o6 d8 f+4 d4 o5 b4 | g4 b4 o6 c+4 e4 | o6 d2 o5 a4 r4`
)
const A_GL = m4(
  `r1 | r2 o6 b8 o7 d8 o6 b8 g8 | r1 | r2 o6 a8 o7 c+8 e8 c+8 |
   r1 | r2 o6 f+8 b8 o7 d8 o6 b8 | r1 | r2 o6 d8 f+8 a8 f+8`
)
const A2_CL = m4('o4 a1 | b1 | a1 | o5 c+1 | a1 | o4 b1 | o5 d2 c+2 | o4 a1')

// B, chords: G | D/F# | Em | Bm | G | A | Em A | A
const B_TUNE = m4(
  `o5 g8 b8 o6 d4 g4 d4 | f+4. e8 d4 o5 a4 | b4 o6 e4 g4 e4 | d2 o5 b4 f+4 |
   b8 o6 d8 g4 e4 d4 | c+4 e4. d8 c+4 | o5 b4 g4 o6 c+4 e4 | e4. c+8 o5 a2`
)
const B_GL = m4(`r1 | r1 | r2 o6 g8 b8 o7 d8 o6 b8 | r1 | r1 | r2 o6 c+8 e8 a8 e8 | r1 | r2 o6 e8 a8 o7 c+8 o6 a8`)

// bridge, chords: Bm | G | Bm | A | G | D/F# | G | D
const BR_CL = m4(
  `o5 f+4 b4 o6 d4 o5 b4 | o6 g4 d4 o5 b4 g4 | o6 f+4 e4 d4 f+4 | e4. c+8 o5 a4 e4 |
   g4 b4 o6 d4 g4 | f+4 d4 o5 a4 f+4 | b4 o6 d4 g4. f+8 | d4 o5 a4 f+2`
)
const BR_GL = m4(`o6 f+4 r2 d4 | r1 | o6 b4 r2 f+4 | r1 | o6 d4 r2 b4 | r1 | o6 g4 r2 d4 | r2 o6 d8 f+8 a8 f+8`)

/* ------------------------------------------------------------------------------------------------ grids */

const DR0 = 'k.z.p.z.k.z.p.z.'
const DR0_FILL = 'k.z.p.z.k.p.p.pp'
const DR1 = 'h.h.s.h.h.h.s.h.'
const DR1_FILL = 'h.h.s.h.h.s.s.ss'
const BASS_A = 'r.f.r.f.'
const BASS_END = 'r.f.r.a.'

const aBass = `${rep(BASS_A, 3)}|${BASS_END}|${rep(BASS_A, 3)}|${BASS_END}`
const aDr0 = withFill(DR0, 8, DR0_FILL)
const aDr1 = withFill(DR1, 8, DR1_FILL)

export const SONG: SongDef = {
  name: 'meadow',
  key: 'D major',
  bpm: 144,
  barTicks: 48,
  gain: 0.83,
  parts: [
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.8, pan: 0.1, send: 0.3 },
    { id: 'cl', inst: 'clarinet', role: 'melody', vol: 0.6, pan: -0.25, send: 0.3 },
    { id: 'gl', inst: 'glock', role: 'melody', vol: 0.42, pan: 0.45, send: 0.35 },
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.7, pan: -0.3, send: 0.2, center: 60, vel: 0.6, gate: 0.5 },
    {
      id: 'str',
      inst: 'strings',
      role: 'chord',
      vol: 0.38,
      pan: 0.0,
      send: 0.35,
      chorus: 0.5,
      center: 58,
      vel: 0.5,
      gate: 0.98
    },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.85, center: 38, vel: 0.7, gate: 0.72 },
    { id: 'dr0', inst: 'kit', role: 'drum', vol: 0.48, vel: 0.55, pan: 0.05 },
    { id: 'dr1', inst: 'kit', role: 'drum', vol: 0.55, vel: 0.62, pan: 0.05, layer: 1 },
    { id: 'tb', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.6, pan: -0.15, layer: 1 },
    {
      id: 'stab',
      inst: 'pulse',
      role: 'chord',
      vol: 0.2,
      pan: 0.25,
      send: 0.2,
      center: 66,
      vel: 0.55,
      gate: 0.35,
      layer: 1
    }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'D | Bm | G | A',
      parts: {
        gl: INTRO_GL,
        pz: '.x.x.x.x',
        bass: 'r...f...|r...f...|r...f...|r...a...',
        dr0: 'k...z.z.k...z.z.|k...z.z.k...z.z.|k...z.z.k...z.z.|k.z.p.p.k.p.p.pp',
        dr1: 'h.h.s.h.h.h.s.h.',
        tb: 'a.a.a.a.a.a.a.a.',
        stab: 'x..x..x.'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'D | G | D | A | D | Bm | G A | D',
      parts: {
        fl: A_FL,
        gl: A_GL,
        pz: '.x.x.x.x',
        bass: aBass,
        dr0: aDr0,
        dr1: aDr1,
        tb: 'a.a.a.a.a.a.a.a.',
        stab: 'x..x..x.'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'G | D/F# | Em | Bm | G | A | Em A | A',
      parts: {
        fl: B_TUNE,
        gl: B_GL,
        pz: '.x.x.x.x',
        str: 'x',
        bass: 'r.f.r.f.|r.f.r.f.|r.f.r.f.|r.f.r.a.|r.f.r.f.|r.f.r.f.|r.f.r.f.|r.f.r.a.',
        dr0: aDr0,
        dr1: aDr1,
        tb: 'a.a.a.a.a.a.a.a.',
        stab: 'x.x.x.x.'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'D | G | D | A | D | Bm | G A | D',
      parts: {
        fl: A_FL,
        cl: A2_CL,
        gl: A_GL,
        pz: '.x.x.x.x',
        str: 'x',
        bass: aBass,
        dr0: aDr0,
        dr1: aDr1,
        tb: 'a.a.a.a.a.a.a.a.',
        stab: 'x..x..x.'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Bm | G | Bm | A | G | D/F# | G | D',
      parts: {
        cl: BR_CL,
        gl: BR_GL,
        pz: 'x...x...',
        str: 'x',
        bass: 'r...f...|r...f...|r...f...|r...f...|r...f...|r...f...|r...f...|r.......',
        dr0: 'z.z.z.z.z.z.z.z.',
        dr1: 'h...h...h...h...|h...h...h...h...|h...h...h...h...|h...h...h...h...|h...h...h...h...|h...h...h...h...|h...h...h...h...|s.s.s.s.ssssssss',
        tb: 'a...a...a...a...',
        stab: 'x...x...'
      }
    },
    {
      name: 'B2',
      bars: 8,
      chords: 'G | D/F# | Em | Bm | G | A | Em A | A',
      parts: {
        cl: B_TUNE,
        gl: seq(B_GL),
        pz: '.x.x.x.x',
        str: 'x',
        bass: 'r.f.r.f.|r.f.r.f.|r.f.r.f.|r.f.r.a.|r.f.r.f.|r.f.r.f.|r.f.r.f.|r.f.r.a.',
        dr0: aDr0,
        dr1: aDr1,
        tb: 'a.a.a.a.a.a.a.a.',
        stab: 'x.x.x.x.'
      }
    }
  ]
}

export const KEY: KeyInfo = majorKey(2)
