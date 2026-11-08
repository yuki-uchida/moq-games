/**
 * Score notation for the マモノ陣形 music: an MML parser for hand-written lines, chord symbols with
 * voice-led voicings, step-grid generators for accompaniment, bass and drums, the shared 陣形 leitmotif, and
 * the compiler that turns a SongDef into a flat, sorted event list. Pure data code: no Web Audio in here,
 * so every score can be validated in Node.
 */

/** 12 ticks per quarter note, 48 per whole note (so triplets and 16ths are whole ticks). */
export const TICKS_PER_QUARTER = 12
export const TICKS_PER_WHOLE = 48

export interface Ev {
  /** Start tick, relative to the piece. */
  t: number
  /** Length in ticks. */
  len: number
  midi: number
  /** 0..1 */
  vel: number
}

export interface Piece {
  ev: Ev[]
  ticks: number
}

const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

/** Parses one note-lengths token such as `4`, `8.`, `2^8`. Returns ticks. */
function parseLen(src: string, i: number, defLen: number): { ticks: number; i: number } {
  const num = () => {
    const m = /^\d+/.exec(src.slice(i))
    if (!m) return undefined
    i += m[0].length
    return Number(m[0])
  }
  const one = (n: number) => {
    const raw = TICKS_PER_WHOLE / n
    if (!Number.isInteger(raw)) throw new Error(`MML length ${n} is not a whole number of ticks`)
    let ticks = raw
    let half = raw / 2
    while (src[i] === '.') {
      ticks += half
      half /= 2
      i++
    }
    if (!Number.isInteger(ticks)) throw new Error(`MML dotted length ${n} is not a whole number of ticks`)
    return ticks
  }
  let ticks = one(num() ?? defLen)
  while (src[i] === '^') {
    i++
    ticks += one(num() ?? defLen)
  }
  return { ticks, i }
}

/**
 * MML subset. `cdefgab` (+ `#`/`-` accidental) with a length (`4`=quarter, `8.`, `12`=triplet eighth, `2^8` tie),
 * `r` rest, `o4` octave (c4 = middle C), `<` `>` octave shift, `l8` default length, `v1`..`v9` velocity,
 * `[ceg]4` chord, `'` after a note = staccato, `!` = accent, `|` = bar line (checked against `barTicks`).
 */
export function mml(src: string, barTicks?: number): Piece {
  const ev: Ev[] = []
  let octave = 4
  let defLen = 4
  let vel = 5
  let t = 0
  let i = 0
  const velOf = (accent: boolean) => Math.min(1, 0.27 + vel * 0.08 + (accent ? 0.18 : 0))
  const pitch = (): number => {
    const ch = src[i++].toLowerCase()
    let m = 12 * (octave + 1) + PC[ch]
    while (src[i] === '+' || src[i] === '#' || src[i] === '-') {
      m += src[i] === '-' ? -1 : 1
      i++
    }
    return m
  }
  while (i < src.length) {
    const ch = src[i].toLowerCase()
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') {
      i++
    } else if (ch === '|') {
      i++
      if (barTicks && t % barTicks !== 0)
        throw new Error(`MML bar line at tick ${t} is not on a bar boundary (${barTicks})`)
    } else if (ch === '<') {
      octave--
      i++
    } else if (ch === '>') {
      octave++
      i++
    } else if (ch === 'o') {
      i++
      const m = /^\d+/.exec(src.slice(i))
      if (!m) throw new Error(`MML octave needs a number near ${i}`)
      octave = Number(m[0])
      i += m[0].length
    } else if (ch === 'l') {
      i++
      const m = /^\d+/.exec(src.slice(i))
      if (!m) throw new Error(`MML default length needs a number near ${i}`)
      defLen = Number(m[0])
      i += m[0].length
    } else if (ch === 'v') {
      i++
      const m = /^\d/.exec(src.slice(i))
      if (!m) throw new Error(`MML velocity needs a digit near ${i}`)
      vel = Number(m[0])
      i++
    } else if (ch === 'r') {
      i++
      const l = parseLen(src, i, defLen)
      i = l.i
      t += l.ticks
    } else if (ch === '[') {
      i++
      const midis: number[] = []
      while (i < src.length && src[i] !== ']') {
        const c = src[i].toLowerCase()
        if (c === ' ') i++
        else if (c === '<') octave--, i++
        else if (c === '>') octave++, i++
        else if (c in PC) midis.push(pitch())
        else throw new Error(`MML unexpected '${src[i]}' in chord near ${i}`)
      }
      i++
      const l = parseLen(src, i, defLen)
      i = l.i
      let stac = false
      let acc = false
      while (src[i] === "'" || src[i] === '!') {
        if (src[i] === "'") stac = true
        else acc = true
        i++
      }
      for (const midi of midis)
        ev.push({ t, len: stac ? Math.max(1, Math.floor(l.ticks / 2)) : l.ticks, midi, vel: velOf(acc) })
      t += l.ticks
    } else if (ch in PC) {
      const midi = pitch()
      const l = parseLen(src, i, defLen)
      i = l.i
      let stac = false
      let acc = false
      while (src[i] === "'" || src[i] === '!') {
        if (src[i] === "'") stac = true
        else acc = true
        i++
      }
      ev.push({ t, len: stac ? Math.max(1, Math.floor(l.ticks / 2)) : l.ticks, midi, vel: velOf(acc) })
      t += l.ticks
    } else {
      throw new Error(`MML unexpected '${src[i]}' near ${i}`)
    }
  }
  if (barTicks && t % barTicks !== 0) throw new Error(`MML ends at tick ${t}, not on a bar boundary (${barTicks})`)
  return { ev, ticks: t }
}

/** Concatenates pieces end to end. */
export function seq(...pieces: Piece[]): Piece {
  const ev: Ev[] = []
  let t = 0
  for (const p of pieces) {
    for (const e of p.ev) ev.push({ ...e, t: e.t + t })
    t += p.ticks
  }
  return { ev, ticks: t }
}

/** A silent piece of `bars` bars. */
export function rest(bars: number, barTicks: number): Piece {
  return { ev: [], ticks: bars * barTicks }
}

/** Shifts every pitch. */
export function transpose(p: Piece, semis: number): Piece {
  return { ticks: p.ticks, ev: p.ev.map((e) => ({ ...e, midi: e.midi + semis })) }
}

/** Scales every velocity. */
export function velScale(p: Piece, k: number): Piece {
  return { ticks: p.ticks, ev: p.ev.map((e) => ({ ...e, vel: Math.min(1, e.vel * k) })) }
}

/* ------------------------------------------------------------------------------------------- scales + motif */

export type Scale = 'major' | 'minor' | 'dorian' | 'lydian' | 'phrygian' | 'harmonic'
export const SCALES: Record<Scale, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11]
}

/** Scale degree (1-based, 8 = the tonic an octave up, 0 = the seventh below) to a MIDI note. */
export function degreeToMidi(tonic: number, scale: Scale, degree: number): number {
  const idx = degree - 1
  const oct = Math.floor(idx / 7)
  const d = ((idx % 7) + 7) % 7
  return tonic + 12 * oct + SCALES[scale][d]
}

/** The 陣形 leitmotif as [scale degree, ticks]: a rising gather (5-1-3), a bright fall, a stepwise return home. */
const MOTIF_44: ReadonlyArray<readonly [number, number]> = [
  [5, 12],
  [8, 12],
  [10, 24],
  [12, 18],
  [11, 6],
  [10, 12],
  [9, 12],
  [10, 18],
  [9, 6],
  [8, 12],
  [7, 12],
  [8, 48]
]
/** The same tune in three-four. */
const MOTIF_34: ReadonlyArray<readonly [number, number]> = [
  [5, 12],
  [8, 12],
  [10, 12],
  [12, 18],
  [11, 6],
  [10, 12],
  [10, 12],
  [9, 12],
  [8, 12],
  [7, 12],
  [8, 24]
]

export interface MotifOptions {
  meter?: 4 | 3
  /** Scale-degree offset applied to every note (a diatonic sequence). */
  shift?: number
  /** Rhythm multiplier (2 = augmentation, makes 8 bars). Must keep ticks whole. */
  stretch?: number
  vel?: number
  /** Fraction of each note actually sounded. */
  gate?: number
  /** Which bars to play (default all four). */
  bars?: readonly [number, number]
  /** The boss variation: flat second, raised fourth. */
  twist?: boolean
}

/** The leitmotif rendered in `scale` above `tonic` (degree 1 = `tonic`). Always 4 bars of the given meter. */
export function motif(tonic: number, scale: Scale, o: MotifOptions = {}): Piece {
  const meter = o.meter ?? 4
  const table = meter === 4 ? MOTIF_44 : MOTIF_34
  const stretch = o.stretch ?? 1
  const gate = o.gate ?? 0.94
  const ev: Ev[] = []
  let t = 0
  for (const [deg, ticks] of table) {
    const d = deg + (o.shift ?? 0)
    let midi = degreeToMidi(tonic, scale, d)
    if (o.twist) {
      if (deg === 9) midi -= 1
      if (deg === 11) midi += 1
    }
    const len = ticks * stretch
    ev.push({ t, len: Math.max(1, Math.floor(len * gate)), midi, vel: o.vel ?? 0.78 })
    t += len
  }
  const barTicks = (meter === 4 ? 48 : 36) * stretch
  const piece: Piece = { ev, ticks: t }
  if (t !== barTicks * 4) throw new Error('motif bars do not add up')
  if (o.bars) {
    const [from, to] = o.bars
    const lo = from * barTicks
    const hi = to * barTicks
    return { ticks: hi - lo, ev: ev.filter((e) => e.t >= lo && e.t < hi).map((e) => ({ ...e, t: e.t - lo })) }
  }
  return piece
}

/* --------------------------------------------------------------------------------------------- chords */

const QUALITIES: Record<string, readonly number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  m6: [0, 3, 7, 9],
  '6': [0, 4, 7, 9],
  '5': [0, 7],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10]
}

export interface Chord {
  name: string
  /** Pitch class 0..11 of the root. */
  root: number
  /** Pitch class of the bass. */
  bass: number
  /** Intervals above the root. */
  tones: readonly number[]
}

const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
function notePc(s: string): number {
  let pc = NOTE_PC[s[0]]
  if (pc === undefined) throw new Error(`bad chord root ${s}`)
  if (s[1] === '#') pc++
  if (s[1] === 'b') pc--
  return (pc + 12) % 12
}

export function parseChord(name: string): Chord {
  const m = /^([A-G][b#]?)(maj7|madd9|add9|m7b5|dim7|m7|m6|dim|aug|sus4|sus2|m|7|6|5)?(?:\/([A-G][b#]?))?$/.exec(name)
  if (!m) throw new Error(`bad chord symbol ${name}`)
  const root = notePc(m[1])
  return { name, root, bass: m[3] ? notePc(m[3]) : root, tones: QUALITIES[m[2] ?? ''] }
}

/** Chooses the inversion/octave of `chord` that moves least from `prev` and sits near `center`. */
export function voice(chord: Chord, prev: readonly number[] | undefined, center: number): number[] {
  let pcs = chord.tones.map((i) => (chord.root + i) % 12)
  pcs = [...new Set(pcs)]
  if (pcs.length < 3) pcs = [...pcs, pcs[0]]
  const n = pcs.length
  let best: number[] = []
  let bestCost = Infinity
  for (let inv = 0; inv < n; inv++) {
    const order = pcs.slice(inv).concat(pcs.slice(0, inv))
    for (let base = center - 15; base <= center + 3; base++) {
      if (((base % 12) + 12) % 12 !== order[0]) continue
      const notes: number[] = [base]
      for (let k = 1; k < n; k++) {
        let nx = base - (base % 12) + order[k]
        while (nx <= notes[k - 1]) nx += 12
        notes.push(nx)
      }
      const mean = notes.reduce((a, b) => a + b, 0) / n
      let cost = Math.abs(mean - center) * 0.6
      if (prev && prev.length) {
        const pm = prev.reduce((a, b) => a + b, 0) / prev.length
        cost += Math.abs(mean - pm) * 1.5
        for (let k = 0; k < Math.min(n, prev.length); k++) cost += Math.abs(notes[k] - prev[k]) * 0.5
      }
      if (notes[n - 1] - notes[0] > 17) cost += 6
      if (cost < bestCost) {
        bestCost = cost
        best = notes
      }
    }
  }
  return best
}

/* ----------------------------------------------------------------------------------------- drum kit map */

/** Grid character -> General-MIDI-like drum note used by the `kit` instrument. */
export const DRUM: Record<string, number> = {
  k: 36, // kick
  p: 37, // rim
  s: 38, // snare
  d: 39, // clap
  h: 42, // closed hat
  o: 46, // open hat
  c: 49, // crash
  r: 51, // ride
  a: 54, // tambourine
  z: 70, // shaker
  g: 81, // triangle
  D: 41, // taiko don
  K: 43, // taiko ka
  t: 50, // high tom
  T: 45 // low tom
}

/* ---------------------------------------------------------------------------------------------- songs */

export type Role = 'melody' | 'chord' | 'bass' | 'drum'

export type InstName =
  | 'strings'
  | 'pizz'
  | 'harp'
  | 'flute'
  | 'oboe'
  | 'clarinet'
  | 'brass'
  | 'horn'
  | 'bell'
  | 'glock'
  | 'celesta'
  | 'musicbox'
  | 'choir'
  | 'pad'
  | 'bass'
  | 'sub'
  | 'timpani'
  | 'kit'
  | 'square'
  | 'pulse'
  | 'tri'

export interface PartDef {
  id: string
  inst: InstName
  role: Role
  /** Mix level. */
  vol: number
  /** -1..1 */
  pan?: number
  /** Reverb send 0..1. */
  send?: number
  /** Stereo chorus send 0..1. */
  chorus?: number
  /** Active from this intensity layer (default 0) up to maxLayer (default 2). */
  layer?: number
  maxLayer?: number
  /** Base velocity for generated parts. */
  vel?: number
  /** Voicing centre (chord role) or lowest root (bass role) as MIDI. */
  center?: number
  /** Fraction of a step a generated note sounds (default 0.9). */
  gate?: number
  /** Skip the tiny humanisation of the timing. */
  tight?: boolean
}

export type PartContent = Piece | string

export interface SectionDef {
  name: string
  bars: number
  /** Chord symbols separated by `|` per bar; several symbols in a bar split it evenly. */
  chords: string
  parts: Record<string, PartContent>
  /** The loop returns to the first section marked loop. */
  loop?: boolean
}

export interface SongDef {
  name: string
  bpm: number
  /** Ticks per bar: 48 for 4/4, 36 for 3/4. */
  barTicks: number
  /** Delay of every off-beat eighth in ticks (2 = triplet swing). */
  swing?: number
  /** Linear trim of the whole song (balances themes against each other). */
  gain: number
  /** Plays once and stops (jingles). */
  once?: boolean
  /** Key description for documentation. */
  key: string
  parts: PartDef[]
  sections: SectionDef[]
}

export interface SongEvent extends Ev {
  part: number
}

export interface CompiledSong {
  def: SongDef
  events: SongEvent[]
  totalTicks: number
  /** Tick the loop returns to (0 for songs without an intro). */
  loopTick: number
  /** Seconds per tick. */
  tickSec: number
  seconds: number
  loopSeconds: number
}

interface Seg {
  start: number
  len: number
  chord: Chord
  voicing: number[]
}

function chordSegments(sec: SectionDef, barTicks: number, center: number): Seg[] {
  const bars = sec.chords.split('|').map((s) => s.trim())
  if (bars.length !== sec.bars) throw new Error(`${sec.name}: ${bars.length} chord bars for ${sec.bars} bars`)
  const segs: Seg[] = []
  let prev: number[] | undefined
  bars.forEach((bar, b) => {
    const names = bar.split(/\s+/).filter(Boolean)
    const len = barTicks / names.length
    if (!Number.isInteger(len)) throw new Error(`${sec.name}: bar ${b} chord split`)
    // Identical neighbours inside one bar are one chord (so `Bm Bm Bm A` is Bm for three beats, then A).
    const groups: Array<{ nm: string; count: number }> = []
    for (const nm of names) {
      const g = groups[groups.length - 1]
      if (g && g.nm === nm) g.count++
      else groups.push({ nm, count: 1 })
    }
    let at = 0
    for (const g of groups) {
      const chord = parseChord(g.nm)
      const voicing = voice(chord, prev, center)
      prev = voicing
      segs.push({ start: b * barTicks + at * len, len: g.count * len, chord, voicing })
      at += g.count
    }
  })
  return segs
}

/** Lowest MIDI note >= lo with the given pitch class. */
function pcAtOrAbove(pc: number, lo: number): number {
  return lo + ((((pc - lo) % 12) + 12) % 12)
}

function gridStep(pattern: string): string[] {
  // Splits a grid bar into tokens: a step character plus its modifiers.
  const out: string[] = []
  for (const ch of pattern) {
    if (ch === ' ') continue
    if ((ch === '!' || ch === "'") && out.length) out[out.length - 1] += ch
    else out.push(ch)
  }
  return out
}

function generate(part: PartDef, pattern: string, sec: SectionDef, barTicks: number, segs: Seg[]): Ev[] {
  const bars = pattern.split('|').map((s) => s.trim())
  const ev: Ev[] = []
  const baseVel = part.vel ?? 0.7
  const gate = part.gate ?? 0.9
  const segAt = (tick: number) => {
    let s = segs[0]
    for (const g of segs) if (g.start <= tick) s = g
    return s
  }
  const nextSeg = (tick: number) => {
    const i = segs.indexOf(segAt(tick))
    return segs[(i + 1) % segs.length]
  }
  for (let b = 0; b < sec.bars; b++) {
    const toks = gridStep(bars[b % bars.length] ?? '')
    if (!toks.length) continue
    const step = barTicks / toks.length
    if (!Number.isInteger(step))
      throw new Error(`${sec.name}/${part.id}: grid of ${toks.length} steps does not divide the bar`)
    for (let k = 0; k < toks.length; k++) {
      const tok = toks[k]
      const c = tok[0]
      if (c === '.' || c === '-') continue
      let run = 1
      while (k + run < toks.length && toks[k + run][0] === '-') run++
      const t = b * barTicks + k * step
      const accent = tok.includes('!')
      const soft = tok.includes("'")
      const v = Math.min(1, baseVel * (accent ? 1.3 : 1) * (soft ? (part.role === 'drum' ? 0.5 : 1) : 1))
      if (part.role === 'drum') {
        const midi = DRUM[c]
        if (midi === undefined) throw new Error(`${sec.name}/${part.id}: unknown drum '${c}'`)
        ev.push({ t, len: step, midi, vel: v })
        continue
      }
      const len = Math.max(1, Math.floor(step * run * (soft ? gate * 0.5 : gate)))
      const seg = segAt(t)
      if (part.role === 'chord') {
        if (c === 'x') {
          // A held chord is re-voiced at every chord change inside its run.
          const end = t + step * run
          let cur = t
          while (cur < end) {
            const s = segAt(cur)
            const pieceEnd = Math.min(end, s.start + s.len)
            const last = pieceEnd === end
            const l = Math.max(1, Math.floor((pieceEnd - cur) * (last ? (soft ? gate * 0.5 : gate) : 1)))
            for (const midi of s.voicing) ev.push({ t: cur, len: l, midi, vel: v })
            cur = pieceEnd
          }
        } else if (/[1-9]/.test(c)) {
          const n = Number(c) - 1
          const vo = seg.voicing
          const midi = vo[n % vo.length] + 12 * Math.floor(n / vo.length)
          ev.push({ t, len, midi, vel: v })
        } else throw new Error(`${sec.name}/${part.id}: unknown chord token '${c}'`)
        continue
      }
      // bass
      const lo = part.center ?? 36
      const root = pcAtOrAbove(seg.chord.bass, lo)
      const rootPc = seg.chord.root
      let midi: number
      if (c === 'r') midi = root
      else if (c === 'R') midi = root + 12
      else if (c === 'f') midi = pcAtOrAbove((rootPc + 7) % 12, root)
      else if (c === 'F') midi = pcAtOrAbove((rootPc + 7) % 12, root) - 12
      else if (c === 't') midi = pcAtOrAbove((rootPc + (seg.chord.tones[1] ?? 4)) % 12, root)
      else if (c === 'n') midi = pcAtOrAbove(nextSeg(t).chord.bass, lo)
      else if (c === 'a') {
        const target = pcAtOrAbove(nextSeg(t).chord.bass, lo)
        midi = target > root ? target - 1 : target + 1
      } else throw new Error(`${sec.name}/${part.id}: unknown bass token '${c}'`)
      ev.push({ t, len, midi, vel: v })
    }
  }
  return ev
}

/** Turns a SongDef into events. Throws (with the section and part named) on any inconsistency. */
export function compileSong(def: SongDef): CompiledSong {
  const { barTicks } = def
  const events: SongEvent[] = []
  let cursor = 0
  let loopTick = 0
  let loopSet = false
  for (const sec of def.sections) {
    if (sec.loop && !loopSet) {
      loopTick = cursor
      loopSet = true
    }
    const chordPart = def.parts.find((p) => p.role === 'chord')
    const segs = chordSegments(sec, barTicks, chordPart?.center ?? 62)
    for (const key of Object.keys(sec.parts)) {
      const pi = def.parts.findIndex((p) => p.id === key)
      if (pi < 0) throw new Error(`${def.name}/${sec.name}: unknown part ${key}`)
      const part = def.parts[pi]
      const content = sec.parts[key]
      let ev: Ev[]
      if (typeof content === 'string') {
        if (part.role === 'melody') throw new Error(`${def.name}/${sec.name}/${key}: melody parts need a Piece`)
        let segsForPart = segs
        if (part.role === 'chord' && part.center !== undefined && part.center !== (chordPart?.center ?? 62))
          segsForPart = chordSegments(sec, barTicks, part.center)
        ev = generate(part, content, sec, barTicks, segsForPart)
      } else {
        if (content.ticks !== sec.bars * barTicks)
          throw new Error(`${def.name}/${sec.name}/${key}: ${content.ticks} ticks, expected ${sec.bars * barTicks}`)
        ev = content.ev
      }
      for (const e of ev) events.push({ ...e, t: e.t + cursor, part: pi })
    }
    cursor += sec.bars * barTicks
  }
  if (def.swing) {
    for (const e of events) if (e.t % 12 === 6) e.t += def.swing
  }
  events.sort((a, b) => a.t - b.t || a.part - b.part || a.midi - b.midi)
  const tickSec = 60 / def.bpm / TICKS_PER_QUARTER
  return {
    def,
    events,
    totalTicks: cursor,
    loopTick,
    tickSec,
    seconds: cursor * tickSec,
    loopSeconds: (cursor - loopTick) * tickSec
  }
}
