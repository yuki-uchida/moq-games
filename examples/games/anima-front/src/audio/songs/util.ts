import { mml, motif, rest, seq, type MotifOptions, type Piece, type Scale, type SongDef } from '../notation'

export const B44 = 48
export const B34 = 36

/** `n` bars of silence in 4/4. */
export const r4 = (n: number): Piece => rest(n, B44)
/** `n` bars of silence in 3/4. */
export const r3 = (n: number): Piece => rest(n, B34)

/** Parses 4/4 MML and checks bar lines. */
export const m4 = (src: string): Piece => mml(src, B44)
/** Parses 3/4 MML and checks bar lines. */
export const m3 = (src: string): Piece => mml(src, B34)

/** The first bar of the ANIMA motif (the call up a fourth), `shift` scale degrees up: a stackable figure. */
export const motifHead = (tonic: number, scale: Scale, shift = 0, o: MotifOptions = {}): Piece =>
  motif(tonic, scale, { ...o, shift, bars: [0, 1] })

/** The pattern repeated `n` times, with the last bar replaced by `fill`. */
export const withFill = (pattern: string, n: number, fill: string): string =>
  [...Array(Math.max(0, n - 1)).fill(pattern), fill].join('|')

export const rep = (pattern: string, n: number): string => Array(n).fill(pattern).join('|')

export { motif, seq, rest, mml }

/** The key a score is checked against (`score-quality.ts`). */
export interface KeyInfo {
  /** Pitch class of the tonic (C = 0). */
  tonic: number
  /** Pitch classes of the key's scale or mode. */
  scale: readonly number[]
  /** Chromatic pitch classes used on purpose (leading tones, borrowed chords). */
  declared: readonly number[]
  /** Tonic of a section that sits in another key area, by section name. */
  sections?: Record<string, number>
}

export const majorKey = (tonic: number, declared: readonly number[] = []): KeyInfo => ({
  tonic,
  scale: [0, 2, 4, 5, 7, 9, 11].map((i) => (tonic + i) % 12),
  declared
})

export const minorKey = (tonic: number, declared: readonly number[] = []): KeyInfo => ({
  tonic,
  scale: [0, 2, 3, 5, 7, 8, 10].map((i) => (tonic + i) % 12),
  declared
})

const STUBS = new WeakSet<SongDef>()

/** A four-bar stand-in score, used until a theme is composed. */
export function stubSong(name: string, once = false): SongDef {
  const song: SongDef = {
    name,
    key: 'C major',
    bpm: 104,
    barTicks: B44,
    gain: 0.8,
    once,
    parts: [
      { id: 'lead', inst: 'square', role: 'melody', vol: 0.5 },
      { id: 'bass', inst: 'bass', role: 'bass', vol: 0.6, center: 36 }
    ],
    sections: [
      {
        name: 'A',
        bars: 4,
        loop: !once,
        chords: 'C | F | G | C',
        parts: { lead: motif(60, 'major', { vel: 0.6 }), bass: 'r---r---' }
      }
    ]
  }
  STUBS.add(song)
  return song
}

/** True while a theme still plays its stand-in score. */
export const isStub = (song: SongDef) => STUBS.has(song)
