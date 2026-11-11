import type { SongDef } from '../notation'
import { m3, majorKey, type KeyInfo } from './util'

/**
 * 「もりのおくの巣づくり」 forest: stages 5-6. B-flat major, 132 bpm, 3/4. The deep woods and the building of a nest: a warm,
 * slightly mysterious waltz. Oboe sings the tune over rolling harp arpeggios, pizzicato "pah-pah" and a plucked bass;
 * flute takes the contrasting theme, glockenspiel glints at phrase ends, strings and a low clarinet hold the harmony.
 * Form (loops from A): intro (4: glock lullaby) / A (8: oboe tune, question and answer) / B (8: flute theme through
 * G minor and E-flat major 7) / A' (8: A with clarinet counter-line and strings) / bridge (8: hushed, long flute notes
 * moving through E-flat, D minor and G minor) / C (8: the cheerful nest-building tune on oboe) /
 * B2 (8: the B theme on oboe, fuller accompaniment) -> back to A on the dominant.
 * Layer 1 (the pinch): hat/tambourine drive, a string ostinato and horn stabs on beats two and three.
 */

/* ------------------------------------------------------------------------------------------------ melodies */

// intro, chords: Bb | Gm | F | F
const INTRO_GL = m3('o6 d4 f4 d4 | o5 b-4 o6 d4 g4 | o6 c4 f4 c4 | o5 a4 o6 c4 f4')

// A, chords: Bb | Gm | Cm | F7 | Bb | Eb | Cm F | Bb
const A_OB = m3(
  `o5 d4 f4 b-4 | o6 d4. c8 o5 b-4 | o6 c4 o5 g4 e-4 | o5 f4 a4 o6 c4 |
   o5 f4 b-4 o6 d4 | o6 e-4. d8 c4 | o6 c4. o5 b-8 a4 | o5 b-2.`
)
const A_GL = m3(`r2. | r4 o6 d8 g8 b-4 | r2. | r4 o6 f8 a8 o7 c4 | r2. | r4 o6 g8 b-8 g4 | r2. | r4 o6 d8 f8 b-4`)
const A2_CL = m3('o4 f2. | o4 g2. | o4 g2. | o4 a2. | o4 b-2. | o4 b-2. | o5 c2 o4 a4 | o4 b-2.')

// B, chords: Gm | Ebmaj7 | Cm | F | Gm | Dm | Eb | F
const B_FL = m3(
  `o5 g4. a8 b-4 | o6 d4. c8 o5 b-4 | o6 c4 e-4 g4 | o6 f2. |
   o5 b-4. a8 g4 | o5 f4 a4 o6 d4 | o6 e-4. d8 c4 | o5 a4 o6 c4 f4`
)
const B_GL = m3(`r2. | r4 o6 g8 d8 b-4 | r2. | r4 o6 a8 c8 f4 | r2. | r4 o6 d8 f8 a4 | r2. | r4 o6 c8 f8 a4`)

// bridge, chords: Eb | Dm | Gm | Cm | Eb | F | Gm | F
const BR_FL = m3(
  `o5 g2 b-4 | o6 d2 c4 | o5 b-2 g4 | o5 g2 e-4 | o5 b-2 o6 e-4 | o6 c2 o5 a4 | o5 b-4 o6 d4 g4 | o6 c4 a4 f4`
)
const BR_GL = m3(`o6 g4 r2 | r2. | o6 d4 r2 | r2. | o6 g4 r2 | r2. | r4 o6 d4 g4 | r2 o6 a4`)

const B2_CL = m3('o4 g2. | o4 b-2. | o4 g2. | o4 a2. | o4 b-2. | o4 a2. | o4 b-2. | o4 a2.')

// C, chords: Bb | Eb | F | Bb | Gm | Eb | F | Bb
const C_OB = m3(
  `o5 b-4 o6 d8 c8 d4 | o6 e-4 d8 c8 o5 b-4 | o5 a4 o6 c4 f4 | o6 d4 c4 o5 b-4 |
   o5 g8 b-8 o6 d4 g4 | o6 g4 f4 e-4 | o6 f4 d4 c4 | o6 d2.`
)
const C_GL = m3(`r2. | r4 o6 g8 b-8 e-4 | r2. | r4 o6 d8 f8 b-4 | r2. | r4 o6 b-8 g8 e-4 | r2. | r4 o6 f8 d8 b-4`)

/* ------------------------------------------------------------------------------------------------ grids */

const HP = '123432'
const BASS_A = 'r...f.'
const BASS_END = 'r...a.'
const A_BASS = `${BASS_A}|${BASS_A}|${BASS_A}|${BASS_END}|${BASS_A}|${BASS_A}|${BASS_A}|${BASS_END}`
const DR0 = 'k.p.p.'
const DR1 = 'hhhhhh'
const FILL0 = 'k.pppp'
const A_DR0 = `${DR0}|${DR0}|${DR0}|${DR0}|${DR0}|${DR0}|${DR0}|${FILL0}`
const A_DR1 = `${DR1}|${DR1}|${DR1}|${DR1}|${DR1}|${DR1}|${DR1}|hhssss`

export const SONG: SongDef = {
  name: 'forest',
  key: 'B-flat major',
  bpm: 132,
  barTicks: 36,
  gain: 0.68,
  parts: [
    { id: 'ob', inst: 'oboe', role: 'melody', vol: 0.8, pan: -0.1, send: 0.35 },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.7, pan: 0.15, send: 0.35 },
    { id: 'cl', inst: 'clarinet', role: 'melody', vol: 0.48, pan: -0.35, send: 0.3 },
    { id: 'gl', inst: 'glock', role: 'melody', vol: 0.42, pan: 0.45, send: 0.4 },
    { id: 'hp', inst: 'harp', role: 'chord', vol: 0.62, pan: -0.4, send: 0.35, center: 60, vel: 0.55, gate: 0.95 },
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.5, pan: 0.3, send: 0.2, center: 62, vel: 0.55, gate: 0.5 },
    {
      id: 'str',
      inst: 'strings',
      role: 'chord',
      vol: 0.36,
      pan: 0.0,
      send: 0.4,
      chorus: 0.5,
      center: 60,
      vel: 0.5,
      gate: 0.98
    },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.85, center: 34, vel: 0.68, gate: 0.8 },
    { id: 'dr0', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.5, pan: 0.05 },
    { id: 'dr1', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.55, pan: 0.05, layer: 1 },
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
      inst: 'horn',
      role: 'chord',
      vol: 0.4,
      pan: 0.25,
      send: 0.25,
      center: 56,
      vel: 0.6,
      gate: 0.35,
      layer: 1
    }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Bb | Gm | F | F',
      parts: {
        gl: INTRO_GL,
        hp: HP,
        bass: 'r...f.|r...f.|r...f.|r...a.',
        dr0: 'z.z.z.|z.z.z.|k.p.p.|k.pppp',
        dr1: DR1,
        tb: 'a.a.a.',
        ost: HP,
        stab: '.xx'
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Bb | Gm | Cm | F7 | Bb | Eb | Cm F | Bb',
      parts: {
        ob: A_OB,
        gl: A_GL,
        hp: HP,
        pz: '.xx',
        bass: A_BASS,
        dr0: A_DR0,
        dr1: A_DR1,
        tb: 'a.a.a.',
        ost: HP,
        stab: '.xx'
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Gm | Ebmaj7 | Cm | F | Gm | Dm | Eb | F',
      parts: {
        fl: B_FL,
        gl: B_GL,
        hp: HP,
        str: 'x',
        bass: 'r.f.f.|r.f.f.|r.f.f.|r.f.f.|r.f.f.|r.f.f.|r.f.f.|r...a.',
        dr0: 'k...p...p...',
        dr1: DR1,
        tb: 'a.a.a.',
        ost: HP,
        stab: '.xx'
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'Bb | Gm | Cm | F7 | Bb | Eb | Cm F | Bb',
      parts: {
        ob: A_OB,
        cl: A2_CL,
        gl: A_GL,
        hp: HP,
        pz: '.xx',
        str: 'x',
        bass: A_BASS,
        dr0: A_DR0,
        dr1: A_DR1,
        tb: 'a.a.a.',
        ost: HP,
        stab: '.xx'
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Eb | Dm | Gm | Cm | Eb | F | Gm | F',
      parts: {
        fl: BR_FL,
        gl: BR_GL,
        hp: 'x',
        str: 'x',
        bass: 'r.....|r.....|r.....|r.....|r.....|r.....|r.....|r...a.',
        dr0: 'z.....',
        dr1: 'h.h.h.',
        tb: 'a.....',
        ost: '1.2.3.',
        stab: 'x.....'
      }
    },
    {
      name: 'C',
      bars: 8,
      chords: 'Bb | Eb | F | Bb | Gm | Eb | F | Bb',
      parts: {
        ob: C_OB,
        gl: C_GL,
        hp: HP,
        pz: '.xx',
        str: 'x',
        bass: 'r.f.f.|r.f.f.|r.f.f.|r.f.f.|r.f.f.|r.f.f.|r.f.f.|r...f.',
        dr0: A_DR0,
        dr1: A_DR1,
        tb: 'a.a.a.',
        ost: HP,
        stab: '.xx'
      }
    },
    {
      name: 'B2',
      bars: 8,
      chords: 'Gm | Ebmaj7 | Cm | F | Gm | Dm | Eb | F',
      parts: {
        ob: B_FL,
        cl: B2_CL,
        gl: B_GL,
        hp: HP,
        pz: '.xx',
        str: 'x',
        bass: 'r.f.f.|r.f.f.|r.f.f.|r.f.f.|r.f.f.|r.f.f.|r.f.f.|r...a.',
        dr0: A_DR0,
        dr1: A_DR1,
        tb: 'a.a.a.',
        ost: HP,
        stab: '.xx'
      }
    }
  ]
}

export const KEY: KeyInfo = majorKey(10)
