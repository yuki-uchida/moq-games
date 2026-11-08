import { mml, motif, rest, seq, type MotifOptions, type Piece, type Scale } from '../notation'

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

/** The first bar of the leitmotif (rising 5-1-3), `shift` scale degrees up: a stackable "gather" figure. */
export const motifHead = (tonic: number, scale: Scale, shift = 0, o: MotifOptions = {}): Piece =>
  motif(tonic, scale, { ...o, shift, bars: [0, 1] })

/** The pattern repeated `n` times, with the last bar replaced by `fill`. */
export const withFill = (pattern: string, n: number, fill: string): string =>
  [...Array(Math.max(0, n - 1)).fill(pattern), fill].join('|')

export const rep = (pattern: string, n: number): string => Array(n).fill(pattern).join('|')

export { motif, seq, rest, mml }
