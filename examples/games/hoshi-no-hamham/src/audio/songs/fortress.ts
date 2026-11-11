import type { SongDef } from '../notation'
import { m4, minorKey, withFill, type KeyInfo } from './util'

/**
 * 「がんこ砦」 (stages 7-8) D minor, 4/4 at 108 bpm: the gang's stone fortress, a stubborn little march.
 * Brass carries the tune over low strings, horn harmony, a snare figure with a tambourine off-beat and timpani;
 * pizzicato "oom-pah" chords keep it comic. The bridge slips into F major with a wry oboe.
 * Form: intro (4) then A (8) / B (8, horn sings) / A' (8) / bridge (8, oboe) / C (8, the brass tune up an octave).
 * Layer 1 (two hearts left) adds a square-wave arpeggio, brass stabs and driving sixteenth percussion.
 */
const intro = m4('o4 r2 d4 d4 | f4. f8 a2 | o5 c+4 c+4 e4 e4 | <a2. r4')

/** The stubborn tune: repeated notes, a dotted march gait, a step up and a hop down. */
const tuneA = m4(
  'o4 d4. d8 f4 a4 | >d4. c8 <a4 f4 | g4. g8 b-4 >d4 | f2 d4 e8 f8 | f4. f8 d4 <b-4 | >e4. e8 g4 e4 | d4 <b-4 g4 b-4 | e4 a4 >c+4 e4'
)
const tuneA2 = m4(
  'o4 d4. d8 f4 a4 | >d4. c8 <a4 f4 | g4. g8 b-4 >d4 | f2 d4 e8 f8 | f4. f8 d4 <b-4 | >e4. e8 g4 e4 | d4 <b-4 g4 b-4 | f4 a4 >d2'
)
const hornA = m4('o4 a1 | a2 f2 | b-1 | a2 f2 | d1 | g1 | b-2 d2 | c+2 e2')
const hornA2 = m4('o4 a1 | a2 f2 | b-1 | a2 f2 | d1 | g1 | b-2 d2 | a1')
const hornB = m4('o4 a2 f4 d4 | b-2 g4 b-4 | >d2 f4 d4 | c2 <a4 f4 | >d2 <b-4 g4 | a2 >d4 f4 | e2 c+4 e4 | <a2. r4')
const oboe = m4(
  'o5 c4. c8 <a4 f4 | >e4. e8 g4 e4 | d4 f4 d4 f4 | c4 <a4 >e4 g4 | <a2 >c4 <a4 | >e2 g4 e4 | d2 f4 d4 | c+4 e4 a2'
)
const tuneC = m4(
  'o5 d4. d8 f4 a4 | a4 f4 d2 | g4. g8 b-4 g4 | f4 a4 f4 d4 | d4. f8 b-4 f4 | e4. g8 c4 g4 | e4 c+4 e4 a4 | a2 e2'
)
const hornC = m4('o4 a1 | d2 f2 | d1 | f2 a2 | f1 | g2 e2 | c+2 e2 | a1')

const OST = 'r.r.r.r.r.r.r.r.'
const OPAH = '....x.......x...'
const BASS = 'r..rr..rr..rr.fa'
const TIM = 'r...r...r.r.r...'
const SNARE = withFill('k...s..sk.k.s.s.', 8, 'k...s.s.ssssssss')
const TAMB = '..a...a...a...a.'
/** Layer 1: the pinch. Same harmony, more push. */
const PINCH = {
  arp: '3.2.1.2.3.2.1.2.',
  stab: 'x..x..x.x..x..x.',
  drv: 'h.hhh.hhh.hhh.hh'
}

export const SONG: SongDef = {
  name: 'fortress',
  key: 'D minor',
  bpm: 108,
  barTicks: 48,
  gain: 0.72,
  parts: [
    { id: 'tune', inst: 'brass', role: 'melody', vol: 0.9, pan: -0.1, send: 0.2 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.8, pan: -0.3, send: 0.3 },
    { id: 'ob', inst: 'oboe', role: 'melody', vol: 0.8, pan: 0.25, send: 0.3 },
    {
      id: 'ost',
      inst: 'strings',
      role: 'bass',
      vol: 0.65,
      pan: -0.15,
      send: 0.2,
      chorus: 0.2,
      center: 50,
      vel: 0.6,
      gate: 0.5
    },
    { id: 'pad', inst: 'strings', role: 'chord', vol: 0.5, send: 0.4, chorus: 0.4, center: 60, vel: 0.5, gate: 0.99 },
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.6, pan: 0.3, send: 0.2, center: 62, vel: 0.65, gate: 0.5 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.75, center: 36, vel: 0.75, gate: 0.7 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.55, center: 38, vel: 0.8, send: 0.2 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.7, vel: 0.75, pan: 0.05 },
    { id: 'tamb', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.55, pan: 0.25 },
    {
      id: 'arp',
      inst: 'square',
      role: 'chord',
      vol: 0.3,
      pan: 0.4,
      send: 0.2,
      center: 76,
      vel: 0.5,
      gate: 0.6,
      layer: 1
    },
    {
      id: 'stab',
      inst: 'brass',
      role: 'chord',
      vol: 0.55,
      pan: -0.25,
      send: 0.2,
      center: 62,
      vel: 0.7,
      gate: 0.4,
      layer: 1
    },
    { id: 'drv', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.6, pan: -0.15, layer: 1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Dm | Dm | A | A',
      parts: {
        tune: intro,
        ost: OST,
        bass: 'r...r...r...r...',
        tim: 'r.......r.......',
        dr: 'k...s...k...s...|k...s...k...s...|s.s.s.s.ssssssss|ssssssssssssssss',
        ...PINCH
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Dm | Dm | Gm | Dm | Bb | C | Gm | A',
      parts: {
        tune: tuneA,
        hn: hornA,
        ost: OST,
        pz: OPAH,
        bass: BASS,
        tim: TIM,
        dr: SNARE,
        tamb: TAMB,
        ...PINCH
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Dm | Gm | Bb | F | Gm | Dm | A | A',
      parts: {
        hn: hornB,
        pad: 'x---------------',
        ost: 'r---------------',
        pz: OPAH,
        bass: 'r.......f.......',
        tim: 'r...............',
        dr: 'k.......s.......',
        ...PINCH
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'Dm | Dm | Gm | Dm | Bb | C | Gm | Dm',
      parts: {
        tune: tuneA2,
        hn: hornA2,
        ost: OST,
        pz: OPAH,
        bass: BASS,
        tim: TIM,
        dr: SNARE,
        tamb: TAMB,
        ...PINCH
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'F | C | Dm Bb | F C | F | C | Bb | A',
      parts: {
        ob: oboe,
        pad: 'x---------------',
        pz: 'x...x...x...x...',
        bass: 'r.......f.......',
        tim: 'r.......r.......',
        dr: 'p...p...p...p...',
        ...PINCH
      }
    },
    {
      name: 'C',
      bars: 8,
      chords: 'Dm | Dm | Gm | Dm | Bb | C | A | A',
      parts: {
        tune: tuneC,
        hn: hornC,
        ost: OST,
        pad: 'x---------------',
        pz: OPAH,
        bass: BASS,
        tim: TIM,
        dr: SNARE,
        tamb: TAMB,
        ...PINCH
      }
    }
  ]
}

export const KEY: KeyInfo = minorKey(2, [1])
