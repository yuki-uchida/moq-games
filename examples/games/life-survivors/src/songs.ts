/**
 * Scores for the background music. music.ts parses and plays them; nothing here touches Web Audio.
 *
 * Melodies are MML: `c d e f g a b` notes (`+`/`#` sharp, `-` flat), `r` rest, a length after a note
 * (`4` quarter, `8` eighth, `16`, `2`, `1`, `.` dotted), `^8` extends the previous note, `o4` sets the
 * octave (o4 c = middle C), `<` / `>` step it down / up, `l8` sets the default length and `|` marks a bar.
 *
 * Patterns run one character per 16th step and repeat:
 * - bass: chord degrees `1 2 3 4 5 6 7 8` of the chord at that step
 * - arp: chord-tone indexes `0`-`9`, stacked upward from the root
 * - chord: `x` strikes the whole chord
 * - drums: `k` kick, `s` snare, `h`/`o` closed/open hat, `p` clap, `r` rim, `x` shaker, `t`/`m` low/mid tom,
 *   `c` crash, `b` boom; upper case is accented
 * In bass/arp/chord patterns `-` holds the note one more step and `.` is silence.
 */

export type ThemeName =
  | 'title'
  | 'cradle'
  | 'school'
  | 'youth'
  | 'campus'
  | 'office'
  | 'midlife'
  | 'twilight'
  | 'boss'
  | 'reaper'
  | 'won'
  | 'lost'

export type Inst =
  | 'box'
  | 'bell'
  | 'epiano'
  | 'pluck'
  | 'square'
  | 'chip'
  | 'saw'
  | 'brass'
  | 'sax'
  | 'flute'
  | 'organ'
  | 'pad'
  | 'choir'
  | 'tri'
  | 'sub'
  | 'sawbass'
  | 'guitar'

interface PartBase {
  vol: number
  /** Lowest and highest intensity layer the part plays at (stage variations of one theme). */
  from?: number
  to?: number
  /** Only on even (0) or odd (1) passes through the song. */
  pass?: 0 | 1
}

export type PartDef = PartBase &
  (
    | { mml: string; inst: Inst; shift?: number; gate?: number }
    | { bass: string; inst: Inst; oct: number }
    | { arp: string; inst: Inst; oct: number }
    | { chord: string; inst: Inst; oct: number; power?: boolean }
    | { drums: string }
  )

export interface SongDef {
  bpm: number
  /** 16th-note steps per bar: 16 for 4/4, 12 for 3/4. */
  bar?: number
  /** Delay of every off-beat eighth, in steps (0.67 is a triplet shuffle). */
  swing?: number
  /** Semitones added to every pitch, chords included. */
  transpose?: number
  /** One bar per `|`; several chords in one bar split it evenly. */
  chords: string
  parts: PartDef[]
}

/** The game's lullaby. It rocks the cradle, then comes back for both endings. */
const LULLABY =
  'o5 e4 g8 e8 d4 c4 | e4 a8 g8 e2 | f4 a8 f8 e4 d4 | d4. e8 d2 | e4 g8 e8 d4 c4 | c4 <a8 >c8 e2 | a4 g8 f8 e4 d4 | c2. r4'
const LULLABY_CHORDS = 'C | Am | F Dm | G | C | Am | F G | C'
const LULLABY_MINOR =
  'o5 e-4 g8 e-8 d4 c4 | e-4 a-8 g8 e-2 | f4 a-8 f8 e-4 d4 | d4. e-8 d2 | e-4 g8 e-8 d4 c4 | c4 <a-8 >c8 e-2 | a-4 g8 f8 e-4 d4 | c2. r4'

const TITLE =
  'o4 a8 >c8 e4 d8 c8 <b4 | a4 e4 a2 | >d8 f8 a4 g8 f8 e4 | d4 <b4 g+2 | a8 >c8 e4 d8 c8 <b4 | a8 >c8 f4 e8 d8 c4 | d4 f4 e4 <b4 | a2. r4'
const SCHOOL =
  'o4 g8 g8 b8 >d8 <b4 g4 | a8 a8 >c8 e8 d4 c4 | <b8 b8 >d8 f+8 a4 f+4 | g4 d8 <b8 g2 | e8 e8 g8 b8 >e4 <b4 | >c8 c8 e8 g8 e4 c4 | d8 e8 f+8 g8 a4 f+4 | g4 d4 g4 r4'
const YOUTH =
  'o4 b4 >e4 g4. f+8 | e4 d8 e8 c2 | d4 <b8 >d8 g4. f+8 | f+2 a4 f+4 | e4 <b8 >e8 g4 b4 | g4. a8 g4 e4 | c4 <a8 >c8 e4 d4 | d+2 f+4 <b4'
const CAMPUS =
  'o4 r8 a8 >c8 e4. d8 c8 | <b2 r8 g8 a8 b8 | >c4. <a8 f4 a4 | g2. r4 | r8 a8 >c8 e4. f8 e8 | d4 <b4 g4 e4 | f8 a8 >c8 <a8 g8 f8 d4 | e2. r4'
const OFFICE =
  'o4 a8 a8 a8 >c8 <b8 a8 e4 | f8 f8 f8 a8 g8 f8 c4 | g8 g8 g8 b8 a8 g8 d4 | e8 g8 b8 >e8 d4 <b4 | >c8 c8 c8 e8 d8 c8 <a4 | a8 a8 a8 >c8 <b8 a8 f4 | f8 f8 f8 a8 g8 f8 d4 | e4 g+4 b4 >d4'
const MIDLIFE =
  'o4 e4 g8 a4. r4 | >c8 <a8 g8 e8 d+8 d8 c4 | d4 f8 a4. r4 | >c8 <a8 g8 f8 d2 | e8 e8 g8 a8 >c4 <a4 | >c8 c8 <a8 f4. r4 | e8 f8 g+8 b8 >d4 <b4 | a2. r4'
const TWILIGHT = 'o4 a2 g4 | >c2 <a4 | >d2 f4 | c2. | <a+2 a4 | g2 e4 | >c4 <a+4 g4 | a2.'
const BOSS =
  'o4 d8 r8 d8 f8 a4 g+8 a8 | >d4 c8 <a8 f4 e4 | d8 r8 d8 f8 a+4 a8 g8 | g4 e8 c8 e4 g4 | d8 r8 d8 f8 a4 g+8 a8 | >d4 f8 e8 d4 c4 | <a+4 >d4 f4 d4 | c+4 e4 a4 g4'

/** A drum hit on the first step of every `bars` bars of 4/4. */
const every = (hit: string, bars: number) => hit + '.'.repeat(bars * 16 - 1)
/** A fill on the last steps of an 8-bar 4/4 loop. */
const fill = (hits: string) => '.'.repeat(128 - hits.length) + hits

export const SONGS: Record<ThemeName, SongDef> = {
  // Behind the title: a wry little minor tune with an oom-pah bounce.
  title: {
    bpm: 116,
    chords: 'Am | Am | Dm | E7 | Am | F | Dm E7 | Am',
    parts: [
      { mml: TITLE, inst: 'square', vol: 0.05, gate: 0.7 },
      { mml: TITLE, inst: 'bell', shift: 12, vol: 0.022, pass: 1 },
      { bass: '1-..5-..1-..5-..', inst: 'tri', oct: 2, vol: 0.12 },
      { chord: '..x-..x-..x-..x-', inst: 'pluck', oct: 3, vol: 0.016 },
      { drums: 'k.......k.......', vol: 0.5 },
      { drums: '....r.......r...', vol: 0.4 },
      { drums: 'x.x.x.x.x.x.x.x.', vol: 0.25 }
    ]
  },
  // 乳児期 / 幼児期: the lullaby on a music box. The toddler gets a bass step, a xylophone and a shaker.
  cradle: {
    bpm: 78,
    transpose: 5,
    chords: LULLABY_CHORDS,
    parts: [
      { mml: LULLABY, inst: 'box', vol: 0.119 },
      { chord: 'x---------------', inst: 'pad', oct: 3, vol: 0.031 },
      { bass: '1---------------', inst: 'sub', oct: 2, vol: 0.098, to: 0 },
      { bass: '1-------5-------', inst: 'sub', oct: 2, vol: 0.105, from: 1 },
      { arp: '0...1...2...1...', inst: 'bell', oct: 4, vol: 0.028, from: 1 },
      { drums: '..x...x...x...x.', vol: 0.42, from: 1 }
    ]
  },
  // 小学生: a bright chiptune march; a glockenspiel joins every other pass.
  school: {
    bpm: 138,
    chords: 'G | Am C | Bm D | G | Em | C | D7 | G',
    parts: [
      { mml: SCHOOL, inst: 'square', vol: 0.048, gate: 0.75 },
      { mml: SCHOOL, inst: 'bell', shift: 12, vol: 0.02, pass: 1 },
      { bass: '1-..5-..1-..5-..', inst: 'tri', oct: 2, vol: 0.13 },
      { chord: '..x...x...x...x.', inst: 'chip', oct: 3, vol: 0.014 },
      { drums: 'k.......k.......', vol: 0.55 },
      { drums: '....s.......s.s.', vol: 0.35 },
      { drums: 'h.h.h.h.h.h.h.h.', vol: 0.3 }
    ]
  },
  // 中学生 / 高校生: minor-key guitar rock. High school adds 16th hats, crashes, a fill and a lower lead.
  youth: {
    bpm: 150,
    chords: 'Em | C | G | D | Em | C | Am | B7',
    parts: [
      { mml: YOUTH, inst: 'saw', vol: 0.04 },
      { mml: YOUTH, inst: 'square', shift: -12, vol: 0.02, from: 1 },
      { chord: 'x-x-x-x-x-x-x-x-', inst: 'guitar', oct: 2, power: true, vol: 0.022 },
      { bass: '1-1-1-1-1-1-1-1-', inst: 'sawbass', oct: 1, vol: 0.06 },
      { drums: 'k.....k.k.......', vol: 0.42 },
      { drums: '....S.......S...', vol: 0.3 },
      { drums: 'h.h.h.h.h.h.h.h.', vol: 0.3 },
      { drums: '.h.h.h.h.h.h.h.h', vol: 0.2, from: 1 },
      { drums: every('c', 4), vol: 0.25, from: 1 },
      { drums: fill('m.m.t.t.'), vol: 0.35, from: 1 }
    ]
  },
  // 大学生: lazy swung jazz chords; the flute and the e-piano take turns with the tune.
  campus: {
    bpm: 96,
    swing: 0.6,
    chords: 'FM7 | Em7 | Dm7 | CM7 | FM7 | Em7 | Dm7 G7 | CM7',
    parts: [
      { mml: CAMPUS, inst: 'flute', vol: 0.065, pass: 0 },
      { mml: CAMPUS, inst: 'epiano', shift: 12, vol: 0.06, pass: 1 },
      { chord: 'x-----x---x-----', inst: 'epiano', oct: 3, vol: 0.024 },
      { bass: '1---..1-5---..3-', inst: 'sub', oct: 2, vol: 0.1 },
      { drums: 'k.....k...k.....', vol: 0.45 },
      { drums: '....s.......s...', vol: 0.22 },
      { drums: 'h.h.h.h.h.h.h.h.', vol: 0.18 }
    ]
  },
  // 社会人 / 働き盛り: four-on-the-floor commute, a typing-fast brass riff. The busy years add stabs and hats.
  office: {
    bpm: 128,
    chords: 'Am | F | G | Em | Am | F | Dm | E7',
    parts: [
      { mml: OFFICE, inst: 'brass', vol: 0.042, gate: 0.6 },
      { mml: OFFICE, inst: 'chip', shift: 12, vol: 0.014, pass: 1 },
      { bass: '1.8.1.8.1.8.1.8.', inst: 'sawbass', oct: 1, vol: 0.055 },
      { chord: 'x---------------', inst: 'pad', oct: 3, vol: 0.02 },
      { chord: '..x...x...x...x.', inst: 'organ', oct: 4, vol: 0.012, from: 1 },
      { drums: 'k...k...k...k...', vol: 0.55 },
      { drums: '....p.......p...', vol: 0.35 },
      { drums: '..o...o...o...o.', vol: 0.18 },
      { drums: '.h.h.h.h.h.h.h.h', vol: 0.16, from: 1 }
    ]
  },
  // 中年: a tired minor blues shuffle on a husky sax.
  midlife: {
    bpm: 92,
    swing: 0.67,
    chords: 'Am | Am | Dm | Dm | Am | F | E7 | Am',
    parts: [
      { mml: MIDLIFE, inst: 'sax', vol: 0.05 },
      { bass: '1---3---5---6---', inst: 'sub', oct: 2, vol: 0.1 },
      { chord: 'x---------------', inst: 'organ', oct: 3, vol: 0.016 },
      { drums: 'k.......k.......', vol: 0.45 },
      { drums: '....s.......s...', vol: 0.25 },
      { drums: 'h...h.h.h...h.h.', vol: 0.22 }
    ]
  },
  // 老後 (layer 1) / 寝たきり (layer 0): a slow waltz. Bedridden, it thins out and the music box returns.
  twilight: {
    bpm: 84,
    bar: 12,
    chords: 'F | Am | Bb | F | Gm | C | C7 | F',
    parts: [
      { mml: TWILIGHT, inst: 'flute', vol: 0.084, from: 1 },
      { mml: TWILIGHT, inst: 'bell', shift: 12, vol: 0.025, from: 1, pass: 1 },
      { mml: TWILIGHT, inst: 'box', shift: 12, vol: 0.098, to: 0 },
      { chord: 'x-----------', inst: 'pad', oct: 3, vol: 0.031 },
      { bass: '1-----------', inst: 'sub', oct: 2, vol: 0.084, to: 0 },
      { bass: '1---........', inst: 'sub', oct: 2, vol: 0.126, from: 1 },
      { chord: '....x-..x-..', inst: 'pluck', oct: 3, vol: 0.022, from: 1 }
    ]
  },
  // Any boss: driving D minor with brass, an octave bass and tom fills.
  boss: {
    bpm: 160,
    chords: 'Dm | Dm | Bb | C | Dm | Dm | Bb | A7',
    parts: [
      { mml: BOSS, inst: 'brass', vol: 0.045, gate: 0.85 },
      { mml: BOSS, inst: 'square', shift: -12, vol: 0.02, gate: 0.85 },
      { bass: '1.1.8.1.1.1.8.1.', inst: 'sawbass', oct: 1, vol: 0.06 },
      { chord: 'x---------------', inst: 'pad', oct: 3, vol: 0.02 },
      { drums: 'k.....k.k.....k.', vol: 0.42 },
      { drums: '....S.......S...', vol: 0.3 },
      { drums: 'hhHhhhHhhhHhhhHh', vol: 0.16 },
      { drums: every('c', 8), vol: 0.28 },
      { drums: every('b', 4), vol: 0.35 },
      { drums: fill('m.m.m.t.t.t.'), vol: 0.35 }
    ]
  },
  // The reaper's four seconds: a choir drone and slow bells.
  reaper: {
    bpm: 60,
    chords: 'Dmadd9 | Dmadd9',
    parts: [
      { chord: 'x-------------------------------', inst: 'choir', oct: 3, vol: 0.04 },
      { bass: '1-------------------------------', inst: 'sub', oct: 1, vol: 0.103 },
      { mml: 'o5 a2 r2 | f2 e2', inst: 'bell', vol: 0.057 }
    ]
  },
  // 大往生: the lullaby again, slow, on a music box over a choir.
  won: {
    bpm: 66,
    chords: LULLABY_CHORDS,
    parts: [
      { mml: LULLABY, inst: 'box', vol: 0.098 },
      { mml: LULLABY, inst: 'flute', shift: -12, vol: 0.046, pass: 1 },
      { chord: 'x---------------', inst: 'choir', oct: 3, vol: 0.034 },
      { bass: '1-------5-------', inst: 'sub', oct: 2, vol: 0.085 },
      { arp: '0.1.2.3.4.3.2.1.', inst: 'pluck', oct: 4, vol: 0.016 }
    ]
  },
  // 心が折れた: the lullaby in minor on a lone e-piano.
  lost: {
    bpm: 60,
    chords: 'Cm | Ab | Fm | G | Cm | Ab | Fm G | Cm',
    parts: [
      { mml: LULLABY_MINOR, inst: 'epiano', shift: -12, vol: 0.098 },
      { chord: 'x---------------', inst: 'pad', oct: 3, vol: 0.026 },
      { bass: '1---------------', inst: 'sub', oct: 2, vol: 0.072 }
    ]
  }
}
