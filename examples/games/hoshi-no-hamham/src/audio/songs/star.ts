import type { SongDef } from '../notation'
import { m4, majorKey, motif, seq, withFill, type KeyInfo } from './util'

/**
 * 「ほしぞらの道」 (stage 10) E major, 4/4 at 138 bpm: the road to the last fight among the stars, hope after the
 * dark castle. A warm pad and sparkling glockenspiel arpeggios sit under a heroic square-wave lead; strings sing the
 * B section, a flute floats the bridge, a horn answers. The ハムハム motif returns, in E major, as the hero's theme.
 * Form: intro (4, glock fanfare) then A (8) / B (8, strings) / A' (8, lead and horn) / bridge (8, flute) /
 * C (8, the motif in the lead, a horn harmony and a rising answer).
 * Layer 1 (two hearts left) adds brass stabs, a pulse-wave arpeggio and driving sixteenth hats.
 */
const fanfare = m4('o5 e4 g+4 b4 >e4 | o5 a4 >c+4 e4 a4 | o5 b4 >d+4 f+4 d+4 | o6 f+2 d+2')
const tuneA = m4(
  'o4 b2 >e2 | d+4. e8 f+2 | g+4 f+4 e4 c+4 | <a4. b8 >c+2 | e2 g+4 b4 | b4. a8 f+2 | e4. f+8 e4 c+4 | d+4 f+4 b2'
)
const tuneA2 = m4(
  'o4 b2 >e2 | d+4. e8 f+2 | g+4 f+4 e4 c+4 | <a4. b8 >c+2 | o5 g+2 b4 g+4 | f+4. g+8 f+4 d+4 | c+4 e4 a4 e4 | d+4 f+4 b2'
)
const hornA2 = m4('o4 g+2 b2 | o4 f+2 >d+2 | o4 e2 g+2 | o4 e2 c+2 | o4 g+2 b2 | o4 d+2 f+2 | o4 e2 c+2 | o4 f+2 b2')
const tuneB = m4(
  'o5 e2 g+4 e4 | c+2 e4 c+4 | f+2 a4 c+4 | b2 f+4 d+4 | e2 g+4 b4 | a2 e4 c+4 | f+4 d+4 b4 f+4 | g+2. e4'
)
const bridge = m4(
  'o5 g+2 e4 g+4 | d+2 <b4 >d+4 | c+2 e4 a4 | g+2. b4 | a2 f+4 c+4 | e2 g+4 e4 | e2 c+4 e4 | f+2 d+4 f+4'
)
const tuneC = seq(
  motif(64, 'major', { vel: 0.8, gate: 0.9 }),
  m4('o5 c+2 e4 a4 | b4 a4 f+4 d+4 | e4 g+4 b4 g+4 | d+4 f+4 b2')
)
const hornC = m4('o4 g+2 b2 | o4 e2 a2 | o4 a2 >c+2 | o4 b2 g+2 | o4 e2 c+2 | o4 d+2 f+2 | o4 g+2 e2 | o4 f+2 b2')

const PAD = 'x---------------'
const BASS = 'r..rr..rr..rr.fa'
const GLOCK = '1.2.3.4.3.2.1.2.'
const BEAT = withFill('k...s...k.k.s...', 8, 'k...s.s.ssssssss')
const HAT = 'h.h.h.h.h.h.h.h.'
/** Layer 1: the pinch. Same harmony, more push. */
const PINCH = {
  stab: 'x..x..x.x..x..x.',
  cn: '3.2.1.2.3.2.1.2.',
  drv: 'hhhhhhhhhhhhhhhh'
}

export const SONG: SongDef = {
  name: 'star',
  key: 'E major',
  bpm: 138,
  barTicks: 48,
  gain: 1.13,
  parts: [
    { id: 'ld', inst: 'square', role: 'melody', vol: 0.5, pan: 0.1, send: 0.2 },
    { id: 'st', inst: 'strings', role: 'melody', vol: 0.75, pan: 0.15, send: 0.4, chorus: 0.4 },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.8, pan: 0.2, send: 0.5 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.75, pan: -0.3, send: 0.35 },
    { id: 'gl', inst: 'glock', role: 'melody', vol: 0.5, pan: 0.35, send: 0.5 },
    { id: 'pad', inst: 'pad', role: 'chord', vol: 0.55, send: 0.5, chorus: 0.5, center: 58, vel: 0.5, gate: 0.99 },
    { id: 'ga', inst: 'glock', role: 'chord', vol: 0.4, pan: -0.4, send: 0.45, center: 86, vel: 0.5, gate: 0.8 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.75, center: 36, vel: 0.75, gate: 0.7 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.65, vel: 0.7, pan: 0.05 },
    { id: 'hat', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.5, pan: 0.2 },
    {
      id: 'stab',
      inst: 'brass',
      role: 'chord',
      vol: 0.55,
      pan: -0.25,
      send: 0.25,
      center: 62,
      vel: 0.7,
      gate: 0.4,
      layer: 1
    },
    {
      id: 'cn',
      inst: 'pulse',
      role: 'chord',
      vol: 0.3,
      pan: 0.4,
      send: 0.2,
      center: 80,
      vel: 0.5,
      gate: 0.6,
      layer: 1
    },
    { id: 'drv', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.6, pan: -0.15, layer: 1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'E | A | B | B',
      parts: {
        gl: fanfare,
        pad: PAD,
        bass: 'r...r...r...r...',
        dr: 'k...s...k...s...|k...s...k...s...|k...s...k...s...|s.s.s.s.ssssssss',
        ...PINCH
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'E | B | C#m | A | E | B | A | B',
      parts: {
        ld: tuneA,
        pad: PAD,
        ga: GLOCK,
        bass: BASS,
        dr: BEAT,
        hat: HAT,
        ...PINCH
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'C#m | A | F#m | B | C#m | A | B | E',
      parts: {
        st: tuneB,
        pad: PAD,
        ga: GLOCK,
        bass: 'r.......t.......',
        dr: 'k.......s.......',
        hat: 'h...h...h...h...',
        ...PINCH
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'E | B | C#m | A | E | B | A | B',
      parts: {
        ld: tuneA2,
        hn: hornA2,
        pad: PAD,
        ga: GLOCK,
        bass: BASS,
        dr: BEAT,
        hat: HAT,
        ...PINCH
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'C#m | G#m | A | E | F#m | C#m | A | B',
      parts: {
        fl: bridge,
        pad: PAD,
        ga: '1.2.3.4.3.2.1.2.',
        bass: 'r...............',
        dr: 'k.......p.......',
        ...PINCH
      }
    },
    {
      name: 'C',
      bars: 8,
      chords: 'E | A | F#m | E | A | B | E | B',
      parts: {
        ld: tuneC,
        hn: hornC,
        pad: PAD,
        ga: GLOCK,
        bass: BASS,
        dr: BEAT,
        hat: HAT,
        ...PINCH
      }
    }
  ]
}

export const KEY: KeyInfo = majorKey(4, [2])
