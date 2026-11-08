import type { SongDef } from '../notation'
import { m4, motif, r4, seq } from './util'

/**
 * 「勝利」 D major, 180 bpm, about 6.7 s: a brass fanfare, then the motif (title key) rings out over the orchestra.
 */
export const CLEAR: SongDef = {
  name: 'clear',
  key: 'D major',
  bpm: 180,
  barTicks: 48,
  gain: 0.83,
  once: true,
  parts: [
    { id: 'br', inst: 'brass', role: 'melody', vol: 0.9, pan: 0.15, send: 0.3 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.9, pan: -0.25, send: 0.3 },
    { id: 'vln', inst: 'strings', role: 'melody', vol: 0.75, pan: 0.3, send: 0.35, chorus: 0.4 },
    { id: 'fl', inst: 'flute', role: 'melody', vol: 0.7, pan: 0.15, send: 0.35 },
    { id: 'str', inst: 'strings', role: 'chord', vol: 0.75, send: 0.4, chorus: 0.6, center: 62, vel: 0.6, gate: 0.99 },
    { id: 'choir', inst: 'choir', role: 'chord', vol: 0.6, send: 0.5, center: 60, vel: 0.6, gate: 0.99 },
    { id: 'harp', inst: 'harp', role: 'chord', vol: 0.7, pan: -0.45, send: 0.4, center: 60, vel: 0.65 },
    { id: 'gl', inst: 'glock', role: 'chord', vol: 0.5, pan: 0.5, send: 0.45, center: 88, vel: 0.6 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.85, center: 38, vel: 0.75, gate: 0.8 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.8, center: 38, vel: 0.85, send: 0.25 },
    { id: 'cym', inst: 'kit', role: 'drum', vol: 0.55, vel: 0.8, pan: -0.15 }
  ],
  sections: [
    {
      name: 'clear',
      bars: 5,
      chords: 'D | D | Gmaj7 | Bm A | D',
      parts: {
        br: seq(m4('o4 a12 a12 a12 o5 d4 o4 a4 o5 f+4'), motif(50, 'major', { vel: 0.9 })),
        hn: seq(r4(1), motif(38, 'major', { vel: 0.9 })),
        vln: seq(r4(1), motif(62, 'major', { vel: 0.75 })),
        fl: seq(r4(1), motif(74, 'major', { vel: 0.6 })),
        str: 'x---------------',
        choir: '................|x---------------',
        harp: '................|................|................|................|1234543212345432',
        gl: '................|................|................|................|1.3.5.3.1.3.5.3.',
        bass: 'r.r.r.r.|r---f---|r---r---|r---a---|r-------',
        tim: 'r.r.r.rrrrrrrrrr|r...............|........r.......|r.......r.......|r...............',
        cym: 'c...............|c...............|................|................|c...............'
      }
    }
  ]
}

/**
 * 「敗北」 D minor, 92 bpm, about 5.2 s: a falling oboe line over low strings and a tolling bell.
 */
export const GAMEOVER: SongDef = {
  name: 'gameover',
  key: 'D minor',
  bpm: 92,
  barTicks: 48,
  gain: 1.05,
  once: true,
  parts: [
    { id: 'ob', inst: 'oboe', role: 'melody', vol: 0.85, pan: -0.1, send: 0.45 },
    { id: 'vln', inst: 'strings', role: 'melody', vol: 0.6, pan: 0.3, send: 0.45, chorus: 0.4 },
    { id: 'str', inst: 'strings', role: 'chord', vol: 0.75, send: 0.5, chorus: 0.6, center: 58, vel: 0.5, gate: 0.99 },
    { id: 'hn', inst: 'horn', role: 'melody', vol: 0.7, pan: -0.3, send: 0.4 },
    { id: 'harp', inst: 'harp', role: 'chord', vol: 0.5, pan: -0.45, send: 0.45, center: 58, vel: 0.5 },
    { id: 'bell', inst: 'bell', role: 'bass', vol: 0.4, pan: 0.4, send: 0.6, center: 69, vel: 0.6 },
    { id: 'bass', inst: 'bass', role: 'bass', vol: 0.8, center: 38, vel: 0.65, gate: 0.99 },
    { id: 'tim', inst: 'timpani', role: 'bass', vol: 0.7, center: 38, vel: 0.7, send: 0.3 }
  ],
  sections: [
    {
      name: 'gameover',
      bars: 2,
      chords: 'Dm Bb | Gm Dm',
      parts: {
        ob: m4('o5 f4 d4 o4 b-4 a4 | o4 g4 f4 d2'),
        vln: m4('o4 a2 f2 | e2 d2'),
        hn: m4('o3 d2 b-2 | g2 d2'),
        str: 'x---------------',
        harp: '1.2.3.2.1.2.3.2.',
        bell: 'r.......|....r...',
        bass: 'r-------|r---r---',
        tim: 'r.......|........r.......'
      }
    }
  ]
}
