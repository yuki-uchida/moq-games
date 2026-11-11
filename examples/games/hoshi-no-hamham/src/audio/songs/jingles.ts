import { transpose, type SongDef } from '../notation'
import { m4, majorKey, minorKey, motifHead, r4, seq, type KeyInfo } from './util'

/**
 * Stage clear. C major, 168 bpm, four bars, about 5.7 s, plays once. The head of the ハムハム motif (C C E C G)
 * climbs through C - F - G - C, each bar a step higher, in a square lead with the flute an octave and more above,
 * and lands on a bright tonic chord with a glockenspiel shimmer and a timpani/crash finish.
 */
export const CLEAR: SongDef = {
  name: 'clear',
  key: 'C major',
  bpm: 168,
  barTicks: 48,
  gain: 0.82,
  once: true,
  parts: [
    { id: 'ld', inst: 'square', role: 'melody', vol: 0.5, pan: -0.08, send: 0.2, chorus: 0.2 },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.6, pan: 0.2, send: 0.3 },
    {
      id: 'st',
      inst: 'strings',
      role: 'chord',
      vol: 0.55,
      pan: -0.2,
      send: 0.35,
      chorus: 0.5,
      center: 64,
      gate: 0.99,
      vel: 0.6
    },
    { id: 'hp', inst: 'harp', role: 'chord', vol: 0.5, pan: -0.45, send: 0.4, center: 62, vel: 0.62, gate: 0.95 },
    { id: 'gl', inst: 'glock', role: 'chord', vol: 0.4, pan: 0.5, send: 0.45, center: 84, vel: 0.6, gate: 0.9 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.75, center: 36, vel: 0.78, gate: 0.8 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.6, center: 36, vel: 0.8, send: 0.25 },
    { id: 'cym', inst: 'kit', role: 'drum', vol: 0.5, vel: 0.75, pan: -0.15 }
  ],
  sections: [
    {
      name: 'clear',
      bars: 4,
      chords: 'C | F | G | C',
      parts: {
        ld: seq(
          motifHead(60, 'major', 0, { vel: 0.85 }),
          motifHead(72, 'major', -4, { vel: 0.88 }),
          motifHead(72, 'major', -3, { vel: 0.92 }),
          m4('v9 o6 c1')
        ),
        fl: seq(
          r4(1),
          motifHead(84, 'major', -4, { vel: 0.7 }),
          motifHead(84, 'major', -3, { vel: 0.74 }),
          m4('v8 o6 e1')
        ),
        st: 'x---------------',
        hp: '1234543212345432',
        gl: '1.2.3.4.5.4.3.2.|1.2.3.4.5.4.3.2.|1.2.3.4.5.4.3.2.|1...............',
        bs: 'r.r.r.r.|r.r.F.r.|r.r.F.r.|r-------',
        tim: 'r.r.rrrr|r...r...|r...r...|r.......',
        cym: 'c...............|c...............|c...............|c...............'
      }
    }
  ]
}
export const CLEAR_KEY: KeyInfo = majorKey(0)

/**
 * Game over. C minor, 108 bpm, three bars, about 6.7 s, plays once. A clarinet phrase falls from E-flat through C
 * and A-flat to the low C, the music box repeating the fall an octave higher over soft strings, harp and a single
 * timpani; it ends softly on the tonic.
 */
const GO_FALL = m4('v5 o5 c4 <a-4 f2 | b4 g4 c2')

export const GAMEOVER: SongDef = {
  name: 'gameover',
  key: 'C minor',
  bpm: 108,
  barTicks: 48,
  gain: 1.15,
  once: true,
  parts: [
    { id: 'cl', inst: 'clarinet', role: 'melody', vol: 0.75, pan: -0.1, send: 0.4 },
    { id: 'mb', inst: 'musicbox', role: 'melody', vol: 0.45, pan: 0.35, send: 0.5 },
    {
      id: 'st',
      inst: 'strings',
      role: 'chord',
      vol: 0.5,
      pan: -0.2,
      send: 0.45,
      chorus: 0.5,
      center: 60,
      gate: 0.99,
      vel: 0.45
    },
    { id: 'hp', inst: 'harp', role: 'chord', vol: 0.45, pan: -0.4, send: 0.45, center: 60, vel: 0.5, gate: 0.97 },
    { id: 'bs', inst: 'bass', role: 'bass', vol: 0.65, center: 36, vel: 0.62, gate: 0.97 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.5, center: 36, vel: 0.65, send: 0.3 }
  ],
  sections: [
    {
      name: 'gameover',
      bars: 3,
      chords: 'Cm | Fm | G Cm',
      parts: {
        cl: seq(m4('v5 o5 e-2 c4 d4'), GO_FALL),
        mb: seq(r4(1), transpose(GO_FALL, 12)),
        st: 'x---------------',
        hp: '1.2.3.2.1.2.3.2.',
        bs: 'r---F---|r---F---|r-------',
        tim: 'r.......|........|r...r...'
      }
    }
  ]
}
export const GAMEOVER_KEY: KeyInfo = minorKey(0, [11])
