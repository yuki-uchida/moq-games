/**
 * Life Survivors background music, synthesized live from the scores in songs.ts (no audio files).
 * Every life stage has a theme; a boss, the reaper and both endings get their own. A look-ahead scheduler
 * queues notes a quarter second ahead on the AudioContext clock, so the beat holds when frames stutter.
 * Never throws: every Web Audio call is guarded, and nothing happens without a running context.
 */
import { SONGS, type Inst, type PartDef, type SongDef, type ThemeName } from './songs'

export type { ThemeName } from './songs'

export interface MusicCue {
  theme: ThemeName
  /** Intensity layer: later stages of one theme add parts. */
  layer: number
}

/* ------------------------------------------------------------------------------------------------ choosing */

/** Theme and layer for each life stage (index of STAGES in data.ts). */
export const STAGE_MUSIC: readonly MusicCue[] = [
  { theme: 'cradle', layer: 0 }, // 乳児期
  { theme: 'cradle', layer: 1 }, // 幼児期
  { theme: 'school', layer: 0 }, // 小学生
  { theme: 'youth', layer: 0 }, // 中学生
  { theme: 'youth', layer: 1 }, // 高校生
  { theme: 'campus', layer: 0 }, // 大学生
  { theme: 'office', layer: 0 }, // 社会人
  { theme: 'office', layer: 1 }, // 働き盛り
  { theme: 'midlife', layer: 0 }, // 中年
  { theme: 'twilight', layer: 1 }, // 老後
  { theme: 'twilight', layer: 0 } // 寝たきり
]

export interface MusicSituation {
  /** A game is running (false on the title). */
  started: boolean
  /** View.phase, undefined before the first snapshot reaches a guest. */
  phase?: string
  /** Index of the current life stage. */
  stage: number
  /** A boss is alive. */
  boss: boolean
  /** The result dialog is up. */
  resultShown: boolean
}

/** What should be playing. null is silence (a death playing out, the 大往生 stinger, a dropped link). */
export function musicCue(s: MusicSituation): MusicCue | null {
  if (!s.started) return { theme: 'title', layer: 0 }
  if (s.phase === 'won') return s.resultShown ? { theme: 'won', layer: 0 } : null
  if (s.phase === 'lost') return s.resultShown ? { theme: 'lost', layer: 0 } : null
  if (s.resultShown || s.phase === undefined) return null
  if (s.phase === 'reaper') return { theme: 'reaper', layer: 0 }
  if (s.boss) return { theme: 'boss', layer: 0 }
  return STAGE_MUSIC[Math.min(STAGE_MUSIC.length - 1, Math.max(0, Math.floor(s.stage)))]
}

const STAGE_THEMES = new Set<ThemeName>(STAGE_MUSIC.map((cue) => cue.theme))

/**
 * How long the old theme fades out and when the new one comes in (seconds). The gaps leave room for the
 * stingers that announce the same moment: WARNING beeps, the boss fanfare, the stage jingle.
 */
export function transition(from: ThemeName | null, to: ThemeName | null): { fade: number; delay: number } {
  if (to === null) return { fade: from === 'reaper' ? 1.2 : 0.6, delay: 0 }
  if (to === 'boss') return { fade: 0.5, delay: 1.6 }
  if (from === 'boss') return { fade: 1, delay: 1.6 }
  if (to === 'reaper') return { fade: 0.8, delay: 0.3 }
  if (from && STAGE_THEMES.has(from) && STAGE_THEMES.has(to)) return { fade: 1, delay: 0.9 }
  if (from === 'title') return { fade: 0.6, delay: 0.5 }
  return { fade: 0.8, delay: 0.2 }
}

/* --------------------------------------------------------------------------------------------- notation */

export interface NoteEvent {
  step: number
  midi: number
  /** Steps. */
  len: number
}

export interface ParsedMml {
  notes: NoteEvent[]
  /** Total steps. */
  length: number
  /** Step position of every `|`, to check bar lengths. */
  bars: number[]
}

const PITCH: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

/** Parses the MML subset described in songs.ts. Throws on anything else so a typo fails the tests. */
export function parseMml(source: string): ParsedMml {
  const notes: NoteEvent[] = []
  const bars: number[] = []
  let octave = 4
  let base = 4
  let step = 0
  let last: NoteEvent | 'rest' | undefined
  let i = 0
  const number = () => {
    const match = /^\d+/.exec(source.slice(i))
    if (!match) return undefined
    i += match[0].length
    return Number(match[0])
  }
  const length = () => {
    const n = number()
    let steps = n === undefined ? 16 / base : 16 / n
    let dot = steps / 2
    while (source[i] === '.') {
      steps += dot
      dot /= 2
      i++
    }
    if (!Number.isInteger(steps) || steps <= 0) throw new Error(`MML length is not a whole number of steps at ${i}`)
    return steps
  }
  while (i < source.length) {
    const ch = source[i++].toLowerCase()
    if (ch === ' ' || ch === '\n' || ch === '\t') continue
    if (ch === '|') bars.push(step)
    else if (ch === '<') octave--
    else if (ch === '>') octave++
    else if (ch === 'o') {
      const n = number()
      if (n === undefined) throw new Error(`MML octave needs a number at ${i}`)
      octave = n
    } else if (ch === 'l') {
      const n = number()
      if (n === undefined || !Number.isInteger(16 / n)) throw new Error(`MML default length is invalid at ${i}`)
      base = n
    } else if (ch === 'r') {
      step += length()
      last = 'rest'
    } else if (ch === '^') {
      const steps = length()
      if (last && last !== 'rest') last.len += steps
      step += steps
    } else if (ch in PITCH) {
      let midi = 12 * (octave + 1) + PITCH[ch]
      while (source[i] === '+' || source[i] === '#' || source[i] === '-') midi += source[i++] === '-' ? -1 : 1
      const steps = length()
      last = { step, midi, len: steps }
      notes.push(last)
      step += steps
    } else throw new Error(`MML: unexpected "${ch}" at ${i - 1}`)
  }
  return { notes, length: step, bars }
}

/* ---------------------------------------------------------------------------------------------- chords */

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '5': [0, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  M7: [0, 4, 7, 11],
  mM7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  '9': [0, 4, 7, 10, 14],
  M9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14]
}
const ROOTS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export interface Chord {
  /** Pitch class of the root, 0-11. */
  root: number
  /** Pitch class the bass plays (slash chords), 0-11. */
  bass: number
  /** Semitones above the root, ascending. */
  intervals: number[]
}

const pitchClass = (text: string) => {
  const root = ROOTS[text[0]]
  if (root === undefined) throw new Error(`Unknown chord root in "${text}"`)
  const accidental = text[1] === '#' ? 1 : text[1] === 'b' ? -1 : 0
  return { pc: (root + accidental + 12) % 12, rest: text.slice(accidental ? 2 : 1) }
}

export function parseChord(name: string, transpose = 0): Chord {
  const [main, slash] = name.split('/')
  const { pc, rest } = pitchClass(main)
  const intervals = QUALITIES[rest]
  if (!intervals) throw new Error(`Unknown chord quality in "${name}"`)
  const root = (pc + transpose + 120) % 12
  const bass = slash ? (pitchClass(slash).pc + transpose + 120) % 12 : root
  return { root, bass, intervals: [...intervals].sort((a, b) => a - b) }
}

/** Lowest midi note >= `low` with the given pitch class. */
const above = (pc: number, low: number) => low + ((((pc - low) % 12) + 12) % 12)

/** The chord's notes in close position inside the octave from F of `oct`. */
export function chordVoicing(chord: Chord, oct: number, power = false): number[] {
  if (power) {
    const root = above(chord.root, 12 * (oct + 1) + 4)
    return [root, root + 7, root + 12]
  }
  const low = 12 * (oct + 1) + 5
  const notes = new Set(chord.intervals.map((iv) => above((chord.root + iv) % 12, low)))
  return [...notes].sort((a, b) => a - b)
}

/** Bass note for a pattern degree, the root sitting in the octave from E of `oct`. */
export function bassNote(chord: Chord, oct: number, degree: string): number {
  const root = above(chord.bass, 12 * (oct + 1) + 4)
  const has = (iv: number) => chord.intervals.includes(iv)
  switch (degree) {
    case '2':
      return root + 2
    case '3':
      return root + (has(3) ? 3 : has(5) && !has(4) ? 5 : 4)
    case '4':
      return root + 5
    case '5':
      return root + (has(6) && !has(7) ? 6 : has(8) && !has(7) ? 8 : 7)
    case '6':
      return root + 9
    case '7':
      return root + (has(11) ? 11 : has(9) && has(6) ? 9 : 10)
    case '8':
      return root + 12
    default:
      return root
  }
}

/** Arpeggio note: chord tones stacked upward from the root in the octave from C of `oct`. */
export function arpNote(chord: Chord, oct: number, index: number): number {
  const root = 12 * (oct + 1) + chord.root
  const tones = chord.intervals
  return root + tones[index % tones.length] + 12 * Math.floor(index / tones.length)
}

/* ------------------------------------------------------------------------------------------ compiled song */

interface Hit {
  ch: string
  /** Steps. */
  len: number
}

interface CompiledPart {
  def: PartDef
  /** Pattern length (steps) the part repeats with. */
  period: number
  /** MML notes by step, or pattern hits by step. */
  notes?: (NoteEvent[] | undefined)[]
  hits?: (Hit | undefined)[]
}

export interface CompiledSong {
  def: SongDef
  bar: number
  /** Steps in one pass. */
  length: number
  /** Chord sounding at every step of a pass. */
  chordAt: Chord[]
  parts: CompiledPart[]
}

const clean = (pattern: string) => pattern.replace(/[\s|]/g, '')

function compilePattern(pattern: string): (Hit | undefined)[] {
  const text = clean(pattern)
  const hits: (Hit | undefined)[] = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '.' || ch === '-') {
      hits.push(undefined)
      continue
    }
    let len = 1
    while (text[i + len] === '-') len++
    hits.push({ ch, len })
  }
  return hits
}

export function compileSong(def: SongDef): CompiledSong {
  const bar = def.bar ?? 16
  const bars = def.chords.split('|').map((text) => text.trim().split(/\s+/))
  const length = bars.length * bar
  const chordAt: Chord[] = []
  for (const names of bars) {
    const chords = names.map((name) => parseChord(name, def.transpose ?? 0))
    for (let i = 0; i < bar; i++) chordAt.push(chords[Math.floor((i * chords.length) / bar)])
  }
  const parts = def.parts.map((part): CompiledPart => {
    if ('mml' in part) {
      const parsed = parseMml(part.mml)
      const notes: (NoteEvent[] | undefined)[] = Array.from({ length: parsed.length }, () => undefined)
      for (const note of parsed.notes) (notes[note.step] ??= []).push(note)
      return { def: part, period: parsed.length, notes }
    }
    const pattern = 'drums' in part ? part.drums : 'bass' in part ? part.bass : 'arp' in part ? part.arp : part.chord
    const hits = compilePattern(pattern)
    return { def: part, period: hits.length, hits }
  })
  return { def, bar, length, chordAt, parts }
}

/* --------------------------------------------------------------------------------------------------- synth */

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

interface Env {
  attack?: number
  /** Percussive: decays over this many seconds whatever the written length. */
  ring?: number
  release?: number
  /** Level reached by the end of a held note (1 holds flat). */
  sustain?: number
  lp?: number
  lpTo?: number
  lpTime?: number
  q?: number
  /** Vibrato depth as a frequency ratio. */
  vib?: number
  vibRate?: number
  vibDelay?: number
  /** Pitch glides to this frequency over `glideTime` (drums). */
  glide?: number
  glideTime?: number
}

/** Schedules oscillators and noise bursts into one destination, cleaning each note up when it ends. */
class Synth {
  live = 0
  constructor(
    private readonly ctx: AudioContext,
    private readonly noiseBuffer: AudioBuffer | null
  ) {}

  private finish(source: AudioScheduledSourceNode, nodes: AudioNode[], start: number, end: number, offset = 0) {
    this.live++
    source.onended = () => {
      this.live--
      for (const node of nodes) {
        try {
          node.disconnect()
        } catch {
          /* already gone */
        }
      }
    }
    if (offset > 0) (source as AudioBufferSourceNode).start(start, offset, end - start + 0.02)
    else {
      source.start(start)
      source.stop(end + 0.02)
    }
  }

  private envelope(g: GainNode, t: number, dur: number, vol: number, e: Env) {
    const attack = e.attack ?? 0.005
    // Silent before the first event too: a start that lands exactly on a sample frame could pass one
    // frame at the default gain of 1 (an audible click).
    g.gain.value = 0
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + attack)
    if (e.ring !== undefined) {
      const end = t + attack + e.ring
      g.gain.exponentialRampToValueAtTime(0.0001, end)
      return end
    }
    const hold = t + Math.max(dur, attack + 0.02)
    const sustain = e.sustain ?? 1
    if (sustain < 1) g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * sustain), hold)
    else g.gain.setValueAtTime(vol, hold)
    const end = hold + (e.release ?? 0.06)
    g.gain.exponentialRampToValueAtTime(0.0001, end)
    return end
  }

  osc(dest: AudioNode, type: OscillatorType, f: number, t: number, dur: number, vol: number, e: Env = {}) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const nodes: AudioNode[] = [o, g]
    o.type = type
    o.frequency.setValueAtTime(f, t)
    if (e.glide) o.frequency.exponentialRampToValueAtTime(e.glide, t + (e.glideTime ?? 0.1))
    const end = this.envelope(g, t, dur, vol, e)
    let head: AudioNode = o
    if (e.lp) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(e.lp, t)
      if (e.lpTo) filter.frequency.exponentialRampToValueAtTime(e.lpTo, t + (e.lpTime ?? 0.1))
      filter.Q.setValueAtTime(e.q ?? 0.7, t)
      head.connect(filter)
      head = filter
      nodes.push(filter)
    }
    head.connect(g)
    g.connect(dest)
    if (e.vib) {
      const lfo = ctx.createOscillator()
      const depth = ctx.createGain()
      lfo.frequency.setValueAtTime(e.vibRate ?? 5.5, t)
      depth.gain.setValueAtTime(0, t)
      depth.gain.linearRampToValueAtTime(f * e.vib, t + (e.vibDelay ?? 0.2))
      lfo.connect(depth)
      depth.connect(o.frequency)
      lfo.start(t)
      lfo.stop(end + 0.02)
      nodes.push(lfo, depth)
    }
    this.finish(o, nodes, t, end)
  }

  noise(dest: AudioNode, t: number, ring: number, vol: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1) {
    if (!this.noiseBuffer) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const g = ctx.createGain()
    src.buffer = this.noiseBuffer
    filter.type = type
    filter.Q.setValueAtTime(q, t)
    filter.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(f1, t + ring)
    const end = this.envelope(g, t, 0, vol, { attack: 0.002, ring })
    src.connect(filter)
    filter.connect(g)
    g.connect(dest)
    this.finish(src, [src, filter, g], t, end, 0.01 + Math.random() * 0.4)
  }
}

type Play = (s: Synth, dest: AudioNode, t: number, f: number, dur: number, vol: number) => void

/** Each instrument normalizes so `vol` is roughly its peak level. */
const INSTRUMENTS: Record<Inst, Play> = {
  box: (s, d, t, f, _dur, v) => {
    s.osc(d, 'sine', f, t, 0, v, { attack: 0.002, ring: 1.6 })
    s.osc(d, 'sine', f * 4, t, 0, v * 0.16, { attack: 0.001, ring: 0.25 })
    s.osc(d, 'triangle', f * 2, t, 0, v * 0.1, { attack: 0.002, ring: 0.5 })
  },
  bell: (s, d, t, f, _dur, v) => {
    s.osc(d, 'sine', f, t, 0, v, { attack: 0.002, ring: 1.4 })
    s.osc(d, 'sine', f * 2.76, t, 0, v * 0.35, { attack: 0.002, ring: 0.6 })
    s.osc(d, 'sine', f * 5.4, t, 0, v * 0.12, { attack: 0.001, ring: 0.25 })
  },
  epiano: (s, d, t, f, dur, v) => {
    s.osc(d, 'sine', f, t, dur, v, { attack: 0.004, sustain: 0.35, release: 0.3 })
    s.osc(d, 'triangle', f * 2, t, 0, v * 0.12, { attack: 0.002, ring: 0.35 })
    s.osc(d, 'sine', f * 7, t, 0, v * 0.05, { attack: 0.001, ring: 0.08 })
  },
  pluck: (s, d, t, f, dur, v) =>
    s.osc(d, 'sawtooth', f, t, 0, v, {
      attack: 0.003,
      ring: Math.min(0.7, dur + 0.25),
      lp: Math.min(9000, f * 8),
      lpTo: Math.max(200, f * 1.5),
      lpTime: 0.25
    }),
  square: (s, d, t, f, dur, v) =>
    s.osc(d, 'square', f, t, dur, v, { attack: 0.006, sustain: 0.7, release: 0.06, lp: 3200 }),
  chip: (s, d, t, f, dur, v) =>
    s.osc(d, 'square', f, t, 0, v, { attack: 0.003, ring: Math.min(0.2, dur + 0.05), lp: 4000 }),
  saw: (s, d, t, f, dur, v) => {
    const e: Env = { attack: 0.01, sustain: 0.75, release: 0.12, lp: 2600, vib: 0.004, vibDelay: 0.3 }
    s.osc(d, 'sawtooth', f, t, dur, v * 0.6, e)
    s.osc(d, 'sawtooth', f * 1.006, t, dur, v * 0.6, e)
  },
  brass: (s, d, t, f, dur, v) =>
    s.osc(d, 'sawtooth', f, t, dur, v, {
      attack: 0.03,
      sustain: 0.7,
      release: 0.1,
      lp: Math.min(8000, f * 1.5),
      lpTo: Math.min(9000, f * 6),
      lpTime: 0.08
    }),
  sax: (s, d, t, f, dur, v) => {
    const e: Env = { attack: 0.04, sustain: 0.8, release: 0.12, lp: 1800, q: 2, vib: 0.006, vibDelay: 0.25 }
    s.osc(d, 'sawtooth', f, t, dur, v * 0.7, e)
    s.osc(d, 'square', f, t, dur, v * 0.3, e)
  },
  flute: (s, d, t, f, dur, v) => {
    s.osc(d, 'sine', f, t, dur, v, { attack: 0.07, sustain: 0.85, release: 0.18, vib: 0.007, vibDelay: 0.35 })
    s.osc(d, 'triangle', f * 2, t, dur, v * 0.08, { attack: 0.07, sustain: 0.6, release: 0.1 })
    s.noise(d, t, 0.08, v * 0.25, 'bandpass', f * 3, f * 2, 2)
  },
  organ: (s, d, t, f, dur, v) => {
    const e: Env = { attack: 0.01, release: 0.08 }
    s.osc(d, 'sine', f, t, dur, v, e)
    s.osc(d, 'sine', f * 2, t, dur, v * 0.5, e)
    s.osc(d, 'sine', f * 3, t, dur, v * 0.25, e)
  },
  pad: (s, d, t, f, dur, v) => {
    const e: Env = { attack: 0.35, sustain: 0.8, release: 0.7, lp: 1100 }
    s.osc(d, 'sawtooth', f * 0.996, t, dur, v * 0.6, e)
    s.osc(d, 'sawtooth', f * 1.004, t, dur, v * 0.6, e)
  },
  choir: (s, d, t, f, dur, v) => {
    const e: Env = { attack: 0.6, sustain: 0.9, release: 1, lp: 1500, q: 1.5, vib: 0.005, vibRate: 4.5 }
    for (const detune of [0.994, 1, 1.006]) s.osc(d, 'sawtooth', f * detune, t, dur, v * 0.45, e)
  },
  tri: (s, d, t, f, dur, v) => s.osc(d, 'triangle', f, t, dur, v, { attack: 0.004, sustain: 0.6, release: 0.05 }),
  sub: (s, d, t, f, dur, v) => {
    s.osc(d, 'sine', f, t, dur, v, { attack: 0.006, sustain: 0.6, release: 0.1 })
    s.osc(d, 'triangle', f * 2, t, dur, v * 0.25, { attack: 0.006, sustain: 0.4, release: 0.08 })
  },
  sawbass: (s, d, t, f, dur, v) =>
    s.osc(d, 'sawtooth', f, t, dur, v, {
      attack: 0.004,
      sustain: 0.5,
      release: 0.05,
      lp: 1400,
      lpTo: 350,
      lpTime: 0.15,
      q: 3
    }),
  guitar: (s, d, t, f, dur, v) => {
    const e: Env = { attack: 0.003, ring: Math.min(0.35, dur + 0.1), lp: 1800, lpTo: 700, lpTime: 0.2, q: 1.5 }
    s.osc(d, 'sawtooth', f, t, 0, v * 0.6, e)
    s.osc(d, 'square', f * 1.004, t, 0, v * 0.4, e)
  }
}

type Hitter = (s: Synth, dest: AudioNode, t: number, v: number) => void

const DRUMS: Record<string, Hitter> = {
  k: (s, d, t, v) => {
    s.osc(d, 'sine', 150, t, 0, v, { attack: 0.002, ring: 0.28, glide: 45, glideTime: 0.12 })
    s.osc(d, 'triangle', 600, t, 0, v * 0.15, { attack: 0.001, ring: 0.015 })
  },
  s: (s, d, t, v) => {
    s.noise(d, t, 0.16, v * 0.7, 'highpass', 1500)
    s.osc(d, 'triangle', 190, t, 0, v * 0.4, { attack: 0.001, ring: 0.08 })
  },
  h: (s, d, t, v) => s.noise(d, t, 0.035, v * 0.5, 'highpass', 7500),
  o: (s, d, t, v) => s.noise(d, t, 0.22, v * 0.45, 'highpass', 6500),
  p: (s, d, t, v) => {
    for (const at of [0, 0.011, 0.022]) s.noise(d, t + at, 0.02, v * 0.6, 'bandpass', 1300, 1300, 1.5)
    s.noise(d, t + 0.03, 0.12, v * 0.5, 'bandpass', 1200, 1000, 1.2)
  },
  r: (s, d, t, v) => {
    s.osc(d, 'triangle', 900, t, 0, v * 0.5, { attack: 0.001, ring: 0.03 })
    s.noise(d, t, 0.025, v * 0.4, 'bandpass', 2500, 2500, 2)
  },
  x: (s, d, t, v) => s.noise(d, t, 0.05, v * 0.4, 'bandpass', 6000, 6000, 1),
  t: (s, d, t, v) => s.osc(d, 'sine', 150, t, 0, v * 0.8, { attack: 0.002, ring: 0.3, glide: 85, glideTime: 0.2 }),
  m: (s, d, t, v) => s.osc(d, 'sine', 220, t, 0, v * 0.75, { attack: 0.002, ring: 0.25, glide: 130, glideTime: 0.18 }),
  c: (s, d, t, v) => s.noise(d, t, 1.4, v * 0.45, 'highpass', 4500, 3000),
  b: (s, d, t, v) => {
    s.osc(d, 'sine', 95, t, 0, v, { attack: 0.003, ring: 0.7, glide: 55, glideTime: 0.4 })
    s.noise(d, t, 0.3, v * 0.4, 'lowpass', 500, 120)
  }
}

/** Drum letters the patterns may use (lower case; upper case is the accented hit). */
export const DRUM_KEYS = Object.keys(DRUMS)

/* -------------------------------------------------------------------------------------------------- player */

/** Seconds of notes queued ahead of the audio clock. */
const LOOKAHEAD = 0.25
const TICK_MS = 60
/** Low-pass range for muffling (the level-up pause, a breaking mind). */
const OPEN_HZ = 18000
const SHUT_HZ = 500
const ACCENT = 1.25

const compiled = new Map<ThemeName, CompiledSong>()
export function songFor(theme: ThemeName): CompiledSong {
  let song = compiled.get(theme)
  if (!song) compiled.set(theme, (song = compileSong(SONGS[theme])))
  return song
}

/** Steps an off-beat 16th is pushed back by. */
export function swingOffset(swing: number, step: number) {
  const inBeat = step % 4
  return inBeat === 2 ? swing : inBeat === 3 ? swing / 2 : 0
}

interface Playing {
  theme: ThemeName
  layer: number
  song: CompiledSong
  out: GainNode
  /** Next step to queue; counts up across passes. */
  step: number
  /** Audio time of that step before swing. */
  time: number
}

export interface MusicState {
  theme: ThemeName | null
  layer: number
  /** Notes sounding or queued right now. */
  live: number
  enabled: boolean
}

const disconnect = (node: AudioNode) => {
  try {
    node.disconnect()
  } catch {
    /* already gone */
  }
}

/** Plays one theme at a time into `output`, crossfading on changes. */
export class MusicPlayer {
  private readonly synth: Synth
  private readonly filter: BiquadFilterNode
  private readonly duckGain: GainNode
  private current: Playing | null = null
  private fading: { out: GainNode; until: number }[] = []
  private timer: ReturnType<typeof setInterval> | undefined
  private enabled = true
  private muffle = 0

  constructor(
    private readonly ctx: AudioContext,
    output: AudioNode,
    noise: AudioBuffer | null
  ) {
    this.synth = new Synth(ctx, noise)
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.setValueAtTime(OPEN_HZ, ctx.currentTime)
    this.duckGain = ctx.createGain()
    this.filter.connect(this.duckGain)
    this.duckGain.connect(output)
  }

  get state(): MusicState {
    return {
      theme: this.current?.theme ?? null,
      layer: this.current?.layer ?? 0,
      live: this.synth.live,
      enabled: this.enabled
    }
  }

  /** Switches theme (crossfading) or just the layer of the one playing. Cheap to call every frame. */
  set(cue: MusicCue | null): void {
    const current = this.current
    if (cue && current?.theme === cue.theme) {
      current.layer = cue.layer
      return
    }
    if (!cue && !current) return
    try {
      const now = this.ctx.currentTime
      const { fade, delay } = transition(current?.theme ?? null, cue?.theme ?? null)
      if (current) this.fadeOut(current.out, now, fade)
      this.current = null
      if (cue) {
        const out = this.ctx.createGain()
        const start = now + delay
        out.gain.setValueAtTime(0.0001, now)
        out.gain.setValueAtTime(0.0001, start)
        out.gain.linearRampToValueAtTime(1, start + 0.08)
        out.connect(this.filter)
        this.current = { theme: cue.theme, layer: cue.layer, song: songFor(cue.theme), out, step: 0, time: start }
      }
      this.tick()
    } catch {
      /* music is optional */
    }
    if (this.timer === undefined) this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  /** Off while muted, at zero volume or hidden: nothing new is queued. */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return
    this.enabled = enabled
    if (enabled) this.tick()
  }

  /** 0 = open, 1 = heavily low-passed. */
  setMuffle(amount: number): void {
    const next = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0
    if (Math.abs(next - this.muffle) < 0.01) return
    this.muffle = next
    try {
      this.filter.frequency.setTargetAtTime(OPEN_HZ * (SHUT_HZ / OPEN_HZ) ** next, this.ctx.currentTime, 0.12)
    } catch {
      /* music is optional */
    }
  }

  /** Dips the music under a stinger, then lets it swell back. */
  duck(depth: number, seconds: number): void {
    try {
      const now = this.ctx.currentTime
      const gain = this.duckGain.gain
      gain.cancelScheduledValues(now)
      gain.setTargetAtTime(depth, now, 0.04)
      gain.setTargetAtTime(1, now + seconds, 0.35)
    } catch {
      /* music is optional */
    }
  }

  dispose(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
    if (this.current) disconnect(this.current.out)
    for (const fading of this.fading) disconnect(fading.out)
    this.current = null
    this.fading = []
    disconnect(this.filter)
    disconnect(this.duckGain)
  }

  private fadeOut(out: GainNode, now: number, fade: number) {
    try {
      out.gain.cancelScheduledValues(now)
      out.gain.setTargetAtTime(0, now, fade / 4)
    } catch {
      out.gain.value = 0
    }
    this.fading.push({ out, until: now + fade + 0.6 })
  }

  private tick() {
    try {
      const ctx = this.ctx
      const now = ctx.currentTime
      if (this.fading.length) {
        this.fading = this.fading.filter((fading) => {
          if (fading.until > now) return true
          disconnect(fading.out)
          return false
        })
      }
      const playing = this.current
      if (!playing) {
        if (!this.fading.length && this.timer !== undefined) {
          clearInterval(this.timer)
          this.timer = undefined
        }
        return
      }
      if (!this.enabled || ctx.state !== 'running') return
      const song = playing.song
      const stepDur = 60 / song.def.bpm / 4
      // Fell behind (a stalled tab, a suspended context): pick the beat up from now instead of bursting.
      if (playing.time < now - 0.1) playing.time = now + 0.05
      for (let guard = 0; playing.time < now + LOOKAHEAD && guard < 64; guard++) {
        const at = playing.time + swingOffset(song.def.swing ?? 0, playing.step) * stepDur
        this.playStep(playing, playing.step, at, stepDur)
        playing.step++
        playing.time += stepDur
      }
    } catch {
      /* music is optional */
    }
  }

  private playStep(playing: Playing, step: number, t: number, stepDur: number) {
    const { song, layer, out } = playing
    const pass = Math.floor(step / song.length)
    const chord = song.chordAt[step % song.length]
    const transpose = song.def.transpose ?? 0
    for (const part of song.parts) {
      const def = part.def
      if (layer < (def.from ?? 0) || layer > (def.to ?? Infinity)) continue
      if (def.pass !== undefined && pass % 2 !== def.pass) continue
      const i = step % part.period
      if ('mml' in def) {
        const notes = part.notes?.[i]
        if (!notes) continue
        const play = INSTRUMENTS[def.inst]
        const gate = def.gate ?? 0.92
        for (const note of notes)
          play(this.synth, out, t, hz(note.midi + transpose + (def.shift ?? 0)), note.len * stepDur * gate, def.vol)
        continue
      }
      const hit = part.hits?.[i]
      if (!hit) continue
      if ('drums' in def) {
        const accent = hit.ch !== hit.ch.toLowerCase()
        DRUMS[hit.ch.toLowerCase()]?.(this.synth, out, t, def.vol * (accent ? ACCENT : 1))
        continue
      }
      const play = INSTRUMENTS[def.inst]
      const dur = hit.len * stepDur * 0.95
      if ('bass' in def) play(this.synth, out, t, hz(bassNote(chord, def.oct, hit.ch)), dur, def.vol)
      else if ('arp' in def) play(this.synth, out, t, hz(arpNote(chord, def.oct, Number(hit.ch))), dur, def.vol)
      else for (const midi of chordVoicing(chord, def.oct, def.power)) play(this.synth, out, t, hz(midi), dur, def.vol)
    }
  }
}
