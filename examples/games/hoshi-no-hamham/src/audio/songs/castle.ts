import type { SongDef } from '../notation'
import { m3, minorKey, type KeyInfo } from './util'

/**
 * 「くらやみの城」 (stage 9) F minor, 3/4 at 138 bpm: an ominous baroque waltz.
 * A harpsichord-like pulse arpeggio runs under a choir pad; strings sing the lilting tune, a flute and a bell
 * answer it, and a pizzicato "pah-pah" keeps the waltz feel. Dark, but the tune is hummable.
 * Form: intro (4, tolling bell) then A (8, strings) / B (8, rising) / A' (8, flute) / bridge (8, A-flat area, bell over
 * held strings) / C (8, dotted climax with horn) / A'' (8, choir sings the tune) / tag (4).
 * Layer 1 (two hearts left) adds driving string eighths, brass stabs and a hat pattern on top of the same harmony.
 */
const intro = m3('o5 f2. | c2. | d-2. | g2.')
const tuneA = m3('o4 c4 f4 a-4 | >c2 d-4 | d-4. c8 <b-4 | g4 e4 c4 | c4 f4 a-4 | >d-2 c4 | <b-2 g4 | g2 e4')
const tuneFlute = m3('o5 c4 f4 a-4 | >c2 d-4 | d-4. c8 <b-4 | g4 e4 c4 | c4 f4 a-4 | >d-2 c4 | <b-2 g4 | g4 e8 f8 f4')
const tuneB = m3('o4 a-2 f4 | b-2 >d-4 | f2 e-4 | c4 e-4 a-4 | d-2 c4 | c4 <a-4 f4 | b-4 g4 f4 | e2 g4')
const bridgeBell = m3('o5 e-2 c4 | g2 e-4 | a-2 f4 | f2 d-4 | >c2 e-4 | <b-2 g4 | a-2 f4 | g2 e4')
const bridgeStr = m3('o4 c2. | b-2. | c2. | a-2. | e-2. | g2. | f2. | e2.')
const tuneC = m3('o4 f4. g8 a-4 | b-4. a-8 f4 | >c4. d-8 f4 | e2 c4 | a-4. g8 f4 | d-4. c8 <b-4 | g2 e4 | f2.')
const hornC = m3('o4 a-2. | d-2. | f2. | g2. | c2. | f2. | e2. | a-2.')
const tag = m3('o5 c2. | d-2. | g2. | e2.')

const HC = '123432'
const PAH = '..x.x.'
const BASS = 'r.f.f.'
/** Layer 1: the pinch. */
const PINCH = {
  ost: 'rrrrrr',
  stab: '..x.x.',
  hat: 'hhhhhh'
}

export const SONG: SongDef = {
  name: 'castle',
  key: 'F minor',
  bpm: 138,
  barTicks: 36,
  gain: 0.98,
  parts: [
    { id: 'hc', inst: 'pulse', role: 'chord', vol: 0.4, pan: -0.3, send: 0.25, center: 66, vel: 0.55, gate: 0.6 },
    { id: 'chp', inst: 'choir', role: 'chord', vol: 0.5, send: 0.5, chorus: 0.3, center: 58, vel: 0.5, gate: 0.99 },
    { id: 'pz', inst: 'pizz', role: 'chord', vol: 0.55, pan: 0.3, send: 0.2, center: 62, vel: 0.65, gate: 0.5 },
    { id: 'vn', inst: 'strings', role: 'melody', vol: 0.85, pan: 0.15, send: 0.4, chorus: 0.3 },
    { id: 'va', inst: 'strings', role: 'melody', vol: 0.6, pan: -0.2, send: 0.4, chorus: 0.4 },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.75, pan: 0.25, send: 0.45 },
    { id: 'bell', inst: 'bell', role: 'melody', vol: 0.55, pan: 0.4, send: 0.55 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.75, pan: -0.3, send: 0.35 },
    { id: 'chm', inst: 'choir', role: 'melody', vol: 0.7, pan: 0.0, send: 0.5, chorus: 0.3 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.75, center: 36, vel: 0.7, gate: 0.75 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.5, center: 38, vel: 0.75, send: 0.25 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.65, pan: 0.05 },
    {
      id: 'ost',
      inst: 'strings',
      role: 'bass',
      vol: 0.6,
      pan: -0.15,
      send: 0.2,
      chorus: 0.3,
      center: 48,
      vel: 0.55,
      gate: 0.5,
      layer: 1
    },
    {
      id: 'stab',
      inst: 'brass',
      role: 'chord',
      vol: 0.5,
      pan: -0.25,
      send: 0.25,
      center: 62,
      vel: 0.7,
      gate: 0.4,
      layer: 1
    },
    { id: 'hat', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.55, pan: 0.2, layer: 1 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Fm | Fm | Bbm | C',
      parts: {
        bell: intro,
        chp: 'x-----',
        hc: '1.....',
        bass: 'r-----',
        tim: 'r.....',
        dr: 'k.....',
        ...PINCH
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Fm | Fm | Bbm | C | Fm | Db | Gm7b5 | C',
      parts: {
        vn: tuneA,
        hc: HC,
        chp: 'x-----',
        pz: PAH,
        bass: BASS,
        tim: 'r.....|......|r.....|......',
        dr: 'k.p.p.',
        ...PINCH
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Fm | Bbm | Db | Ab | Bbm | Fm | Gm7b5 | C',
      parts: {
        vn: tuneB,
        hc: HC,
        chp: 'x-----',
        pz: PAH,
        bass: BASS,
        tim: 'r.....|......',
        dr: 'k.p.p.|k.p.pp',
        ...PINCH
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'Fm | Fm | Bbm | C | Fm | Db | Gm7b5 | C Fm',
      parts: {
        fl: tuneFlute,
        va: m3('o4 a-2. | a-2. | b-2. | c2. | a-2. | a-2. | b-2. | g2.'),
        hc: HC,
        chp: 'x-----',
        pz: PAH,
        bass: BASS,
        tim: 'r.....|......',
        dr: 'k.p.p.',
        ...PINCH
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Ab | Eb | Fm | Db | Ab | Eb | Db | C',
      parts: {
        bell: bridgeBell,
        va: bridgeStr,
        chp: 'x-----',
        hc: '1.....',
        bass: 'r-----',
        tim: 'r.....|......',
        dr: 'k.....',
        ...PINCH
      }
    },
    {
      name: 'C',
      bars: 8,
      chords: 'Fm | Bbm | Fm | C | Fm | Bbm | C | Fm',
      parts: {
        vn: tuneC,
        hn: hornC,
        hc: HC,
        chp: 'x-----',
        pz: PAH,
        bass: BASS,
        tim: 'r.r.r.',
        dr: 'k.pkp.',
        ...PINCH
      }
    },
    {
      name: "A''",
      bars: 8,
      chords: 'Fm | Fm | Bbm | C | Fm | Db | Gm7b5 | C',
      parts: {
        chm: tuneA,
        bell: m3('r2. | o6 c2. | r2. | o5 g2. | r2. | o6 d-2. | r2. | o5 e2.'),
        hc: HC,
        chp: 'x-----',
        pz: PAH,
        bass: BASS,
        tim: 'r.....|......',
        dr: 'k.p.p.',
        ...PINCH
      }
    },
    {
      name: 'tag',
      bars: 4,
      chords: 'Fm | Bbm | C | C',
      parts: {
        bell: tag,
        chp: 'x-----',
        hc: '1.....',
        bass: 'r-----',
        tim: 'r.....',
        dr: 'k.....',
        ...PINCH
      }
    }
  ]
}

export const KEY: KeyInfo = minorKey(5, [4])
