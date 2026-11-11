import type { SongDef } from '../notation'
import { m4, minorKey, motif, r4, seq, withFill, type KeyInfo } from './util'

/**
 * 「黒ハム王」 C minor, 4/4 at 168 bpm: the last fight, epic. Choir and brass over a driving string ostinato,
 * timpani and taiko. In A' the horn plays the ハムハム motif twisted into the villain's key (flat sixth, raised fourth);
 * the bridge lifts toward E-flat major, where the horn sings the motif straight, the hero's answer, and the brass
 * climbs after it.
 * Form: intro (4) then A (8, brass) / B (8, strings sing) / A' (8, twisted motif and brass answer) / bridge (8, E-flat
 * lift) / C (8, brass and horn) / D (8, strings climb to the top).
 * Layers: 0 phase one; 1 phase two adds a counter-melody, sustained brass and more percussion; 2 (the last quarter of
 * his health) adds a high square-wave ostinato, snare rolls and crashes.
 */
const intro = m4('o4 g4 g4 g4 >c4 | c2 e-2 | d2 f2 | b2 d2')
const tuneA = m4(
  'o4 g4 g8 g8 >c4 e-4 | g2 e-4 c4 | c2 e-4 c4 | d2 f4 d4 | o5 c4 e-4 g4 >c4 | o5 c4 e-4 a-4 e-4 | o5 f4 a-4 c4 a-4 | o5 d4 g4 b2'
)
const hornC = m4('o4 g1 | g1 | e-1 | f1 | g1 | e-1 | a-1 | b1')
const cmA = m4('o4 e-2 g2 | g2 e-2 | c2 e-2 | d2 f2 | e-2 g2 | e-2 c2 | c2 a-2 | d2 g2')
const tuneB = m4('o5 g2 e-4 c4 | c2 a-4 f4 | e-2 c4 e-4 | g2 b-4 g4 | a-2 f4 c4 | e-2 g4 e-4 | d2 b4 g4 | g1')
const hornB = m4('o4 g1 | f1 | e-1 | g1 | f1 | g1 | b1 | b1')
const cmB = m4('o4 e-2 g2 | a-2 c2 | c2 e-2 | b-2 e-2 | c2 a-2 | g2 e-2 | g2 d2 | g2 b2')
/** The twisted motif needs D major then G on bar three: F-sharp on the beat, G on the half-bar change. */
const twistedHorn = seq(motif(48, 'minor', { twist: true, vel: 0.85, gate: 0.9 }), r4(4))
const answerA2 = seq(r4(4), m4('o5 c2 e-4 c4 | f2 a-4 f4 | d2 b2 | g2 e-2'))
/** The hero's answer: the same tune, straight, in E-flat major. */
const heroHorn = seq(motif(51, 'major', { vel: 0.9, gate: 0.92 }), r4(4))
const heroBrass = seq(r4(4), m4('o5 e-2 a-2 | d2 f2 | g2 e-2 | b2 d2'))
const leadD = m4(
  'o5 c4 e-4 g4 >c4 | o5 a-4 g4 e-4 c4 | o5 d4 f4 b-4 f4 | o5 d4 g4 b2 | o5 c4 e-4 g4 e-4 | o5 e-4 a-4 >c4 <a-4 | o5 d4 b4 g4 d4 | o5 b2 g2'
)
const cmD = m4('o4 g2 e-2 | e-2 c2 | f2 d2 | d2 g2 | g2 e-2 | e-2 c2 | d2 b2 | d2 g2')

const OST = 'rrrrrrrrrrrrrrrr'
const BASS = 'r.rr.rrr.rr.rrfa'
const TIM = 'r...r...r.r.r...'
const KIT = withFill('k..ks..sk.k.s.s.', 8, 'k.k.s.s.ssssssss')
const HAT = 'h.h.h.h.h.h.h.h.'
const TAIKO = 'D...D...D.D.D...'
/** Layers 1 and 2. */
const PHASE2 = { brs: 'x-------x-------', dr1: 'h.h.h.h.h.h.h.h.' }
const PHASE3 = {
  hi: '3.2.1.2.3.2.1.2.',
  dr2: 'hhhhhhhhhhhhhhhh',
  cym: 'c...............|................'
}

export const SONG: SongDef = {
  name: 'finalBoss',
  key: 'C minor',
  bpm: 168,
  barTicks: 48,
  gain: 0.75,
  parts: [
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.95, pan: -0.1, send: 0.25 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.85, pan: -0.3, send: 0.35 },
    { id: 'st', inst: 'strings', role: 'melody', vol: 0.8, pan: 0.25, send: 0.4, chorus: 0.4 },
    { id: 'chp', inst: 'choir', role: 'chord', vol: 0.6, send: 0.5, chorus: 0.3, center: 58, vel: 0.55, gate: 0.99 },
    { id: 'stab', inst: 'brass', role: 'chord', vol: 0.7, pan: -0.25, send: 0.25, center: 62, vel: 0.8, gate: 0.4 },
    { id: 'hp', inst: 'harp', role: 'chord', vol: 0.5, pan: 0.35, send: 0.4, center: 66, vel: 0.55, gate: 0.95 },
    {
      id: 'ost',
      inst: 'strings',
      role: 'bass',
      vol: 0.7,
      pan: -0.15,
      send: 0.2,
      chorus: 0.3,
      center: 48,
      vel: 0.6,
      gate: 0.45
    },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.75, center: 33, vel: 0.8, gate: 0.6 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.6, center: 36, vel: 0.85, send: 0.25 },
    { id: 'dr', inst: 'kit', role: 'drum', vol: 0.7, vel: 0.75, pan: 0.05 },
    { id: 'hat', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.55, pan: 0.2 },
    { id: 'tk', inst: 'kit', role: 'drum', vol: 0.6, vel: 0.8, pan: -0.1, send: 0.25 },
    { id: 'cm', inst: 'strings', role: 'melody', vol: 0.65, pan: 0.35, send: 0.35, chorus: 0.4, layer: 1 },
    {
      id: 'brs',
      inst: 'brass',
      role: 'chord',
      vol: 0.55,
      pan: 0.15,
      send: 0.3,
      center: 60,
      vel: 0.6,
      gate: 0.99,
      layer: 1
    },
    { id: 'dr1', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.6, pan: 0.2, layer: 1 },
    {
      id: 'hi',
      inst: 'square',
      role: 'chord',
      vol: 0.25,
      pan: 0.4,
      send: 0.2,
      center: 86,
      vel: 0.5,
      gate: 0.6,
      layer: 2
    },
    { id: 'dr2', inst: 'kit', role: 'drum', vol: 0.45, vel: 0.65, pan: -0.2, layer: 2 },
    { id: 'cym', inst: 'kit', role: 'drum', vol: 0.4, vel: 0.7, pan: -0.25, layer: 2 }
  ],
  sections: [
    {
      name: 'intro',
      bars: 4,
      chords: 'Cm | Ab | Bb | G',
      parts: {
        br: intro,
        chp: 'x---------------',
        ost: OST,
        bass: 'r...r...r...r...',
        tim: 'r.......r.......|r.......r.......|r.......r.......|rrrrrrrrrrrrrrrr',
        dr: 'k...s...k...s...|k...s...k...s...|k...s...k...s...|s.s.s.s.ssssssss',
        ...PHASE2,
        ...PHASE3
      }
    },
    {
      name: 'A',
      bars: 8,
      loop: true,
      chords: 'Cm | Cm | Ab | Bb | Cm | Ab | Fm | G',
      parts: {
        br: tuneA,
        chp: 'x---------------',
        stab: 'x......x..x.....',
        ost: OST,
        bass: BASS,
        tim: TIM,
        dr: KIT,
        hat: HAT,
        tk: TAIKO,
        cm: cmA,
        ...PHASE2,
        ...PHASE3
      }
    },
    {
      name: 'B',
      bars: 8,
      chords: 'Cm | Fm | Ab | Eb | Fm | Cm | G | G',
      parts: {
        st: tuneB,
        hn: hornB,
        chp: 'x---------------',
        ost: 'r.r.r.r.r.r.r.r.',
        bass: 'r.......f.......',
        tim: 'r...............',
        dr: 'k.......s.......',
        hat: 'h...h...h...h...',
        tk: 'D...............',
        cm: cmB,
        ...PHASE2,
        ...PHASE3
      }
    },
    {
      name: "A'",
      bars: 8,
      chords: 'Cm | Cm | D G | Cm | Ab | Fm | G | Cm',
      parts: {
        hn: twistedHorn,
        br: answerA2,
        chp: 'x---------------',
        stab: 'x......x..x.....',
        ost: OST,
        bass: BASS,
        tim: TIM,
        dr: KIT,
        hat: HAT,
        tk: TAIKO,
        ...PHASE2,
        ...PHASE3
      }
    },
    {
      name: 'bridge',
      bars: 8,
      chords: 'Eb | Cm | Ab | Eb | Ab | Bb | Cm | G',
      parts: {
        hn: heroHorn,
        br: heroBrass,
        chp: 'x---------------',
        hp: '1.2.3.2.1.2.3.2.',
        ost: 'r---------------',
        bass: 'r.......f.......',
        tim: 'r.......r.......|r.......r.......|r.......r.......|r.......r.......|r.......r.......|r.......r.......|r.......r.......|rrrrrrrrrrrrrrrr',
        dr: 'k.......s.......',
        hat: 'h...h...h...h...',
        ...PHASE2,
        ...PHASE3
      }
    },
    {
      name: 'C',
      bars: 8,
      chords: 'Cm | Cm | Ab | Bb | Cm | Ab | Fm | G',
      parts: {
        br: tuneA,
        hn: hornC,
        chp: 'x---------------',
        stab: 'x......x..x.....',
        ost: OST,
        bass: BASS,
        tim: TIM,
        dr: KIT,
        hat: HAT,
        tk: TAIKO,
        cm: cmA,
        ...PHASE2,
        ...PHASE3
      }
    },
    {
      name: 'D',
      bars: 8,
      chords: 'Cm | Ab | Bb | G | Cm | Ab | G | G',
      parts: {
        st: leadD,
        chp: 'x---------------',
        stab: 'x.xx.xx.x.xx.xx.',
        ost: OST,
        bass: BASS,
        tim: TIM,
        dr: withFill('k.k.s.s.k.k.s.s.', 8, 'ssssssssssssssss'),
        hat: HAT,
        tk: TAIKO,
        cm: cmD,
        ...PHASE2,
        ...PHASE3
      }
    }
  ]
}

/** B natural is the leading tone; the bridge sits in E-flat major. */
export const KEY: KeyInfo = { ...minorKey(0, [11, 6]), sections: { bridge: 3 } }
