/**
 * Objective quality metrics for the compiled scores (harmony, melody, voice leading, arrangement). Pure data code,
 * used by tests/audio-quality.test.ts and by review tools. Nothing here touches Web Audio.
 */
import type { ThemeName } from './api'
import { compileSong, parseChord, type Chord, type CompiledSong, type SongEvent } from './notation'
import { KEYS, SONGS } from './songs'

export { KEYS }

export type { KeyInfo } from './songs/util'

export interface ChordSeg {
  start: number
  end: number
  chord: Chord
}

export interface SectionInfo {
  name: string
  start: number
  end: number
  bars: number
  segs: ChordSeg[]
  loop: boolean
}

export function sectionsOf(song: CompiledSong): SectionInfo[] {
  const out: SectionInfo[] = []
  let cursor = 0
  for (const s of song.def.sections) {
    const bt = song.def.barTicks
    const segs: ChordSeg[] = []
    s.chords.split('|').forEach((bar, b) => {
      const names = bar.trim().split(/\s+/).filter(Boolean)
      const len = bt / names.length
      let k = 0
      while (k < names.length) {
        let count = 1
        while (names[k + count] === names[k]) count++
        const start = cursor + b * bt + k * len
        segs.push({ start, end: start + count * len, chord: parseChord(names[k]) })
        k += count
      }
    })
    out.push({ name: s.name, start: cursor, end: cursor + s.bars * bt, bars: s.bars, segs, loop: !!s.loop })
    cursor += s.bars * bt
  }
  return out
}

const chordAt = (secs: SectionInfo[], t: number): Chord | undefined => {
  for (const s of secs) for (const g of s.segs) if (t >= g.start && t < g.end) return g.chord
  return undefined
}

const chordPcs = (c: Chord): Set<number> => {
  const set = new Set(c.tones.map((i) => (c.root + i) % 12))
  set.add(c.bass)
  return set
}

export const isStrong = (t: number, barTicks: number): boolean => {
  const inBar = t % barTicks
  return barTicks === 48 ? inBar === 0 || inBar === 24 : inBar === 0
}

export interface PartNotes {
  part: number
  id: string
  notes: SongEvent[]
}

/** The notes of every melody-role part, sorted by start. */
export function melodyParts(song: CompiledSong): PartNotes[] {
  const out: PartNotes[] = []
  song.def.parts.forEach((p, i) => {
    if (p.role !== 'melody') return
    const notes = song.events.filter((e) => e.part === i).sort((a, b) => a.t - b.t)
    if (notes.length) out.push({ part: i, id: p.id, notes })
  })
  return out
}

/* ------------------------------------------------------------------------------------------------ harmony */

export interface HarmonyReport {
  /** Melody notes sounding on a strong beat. */
  strongNotes: number
  /** Share that are chord tones of the sounding chord. */
  chordToneShare: number
  /** Share that are chord tones or non-chord tones resolved by step (<= 2 semitones into the next note). */
  resolvedShare: number
  /** Strong-beat non-chord tones that do not resolve by step. */
  unresolved: string[]
  /** Notes outside the key/declared colours that are neither chord tones nor chromatic approach tones. */
  outOfKey: string[]
  /** Sustained (>= an eighth note) minor-second/tritone clashes on strong beats against bass/chord parts. */
  clashes: string[]
}

export function harmonyReport(theme: ThemeName): HarmonyReport {
  const song = compileSong(SONGS[theme])
  const secs = sectionsOf(song)
  const key = KEYS[theme]
  const allowed = new Set([...key.scale, ...key.declared])
  const bt = song.def.barTicks
  let strong = 0
  let ct = 0
  let resolved = 0
  const unresolved: string[] = []
  const outOfKey: string[] = []
  const clashes: string[] = []
  const support = song.events.filter((e) => {
    const r = song.def.parts[e.part].role
    return r === 'bass' || r === 'chord'
  })
  for (const mp of melodyParts(song)) {
    mp.notes.forEach((n, i) => {
      const chord = chordAt(secs, n.t)
      if (!chord) return
      const pcs = chordPcs(chord)
      const pc = n.midi % 12
      const next = mp.notes[i + 1]
      const prev = mp.notes[i - 1]
      const nearNext =
        next !== undefined && next.t - n.t <= Math.max(n.len + 6, 24) && Math.abs(next.midi - n.midi) <= 2
      const nearPrev =
        prev !== undefined && n.t - prev.t <= Math.max(prev.len + 6, 24) && Math.abs(prev.midi - n.midi) <= 2
      if (!allowed.has(pc) && !pcs.has(pc)) {
        const chromatic =
          (next !== undefined && Math.abs(next.midi - n.midi) === 1) ||
          (prev !== undefined && Math.abs(prev.midi - n.midi) === 1)
        if (!chromatic) outOfKey.push(`${theme}/${mp.id}@${n.t} pc ${pc}`)
      }
      // strong-beat notes: any melody note sounding on the beat (started on it, or held over it)
      const strongTicks: number[] = []
      for (let t = Math.ceil(n.t / 6) * 6; t < n.t + n.len; t += 6) if (isStrong(t, bt)) strongTicks.push(t)
      for (const t of strongTicks) {
        const c = chordAt(secs, t)
        if (!c) continue
        strong++
        if (chordPcs(c).has(pc)) {
          ct++
          resolved++
        } else if (nearNext || nearPrev) {
          resolved++
        } else {
          unresolved.push(`${theme}/${mp.id}@${t} ${c.name} pc ${pc}`)
        }
        // clashes with bass/chord parts sounding together for at least an eighth
        for (const s of support) {
          if (s.t > t || s.t + s.len <= t) continue
          const together = Math.min(n.t + n.len, s.t + s.len) - t
          if (together < 6) continue
          const d = Math.abs((n.midi % 12) - (s.midi % 12))
          const ic = Math.min(d, 12 - d)
          if (ic === 1 || ic === 6) {
            // A tritone between two tones of the same chord (e.g. a dominant seventh) is part of the harmony.
            const both = chordPcs(c).has(n.midi % 12) && chordPcs(c).has(s.midi % 12)
            if (!both)
              clashes.push(`${theme}/${mp.id}@${t} ${c.name} ${n.midi}~${s.midi}(${song.def.parts[s.part].id})`)
          }
        }
      }
    })
  }
  return {
    strongNotes: strong,
    chordToneShare: strong ? ct / strong : 1,
    resolvedShare: strong ? resolved / strong : 1,
    unresolved,
    outOfKey,
    clashes
  }
}

/* ------------------------------------------------------------------------------------------------ melody */

export interface MelodyReport {
  intervals: number
  bigLeaps: number
  /** Leaps over an octave not followed by a step the other way. */
  unresolvedLeaps: string[]
  /** Per section and part: range in semitones (parts with >= 6 notes). */
  ranges: Array<{ section: string; part: string; range: number; peak: number; peakCount: number; notes: number }>
}

export function melodyReport(theme: ThemeName): MelodyReport {
  const song = compileSong(SONGS[theme])
  const secs = sectionsOf(song)
  let intervals = 0
  let bigLeaps = 0
  const unresolvedLeaps: string[] = []
  const ranges: MelodyReport['ranges'] = []
  for (const mp of melodyParts(song)) {
    for (let i = 1; i < mp.notes.length; i++) {
      const a = mp.notes[i - 1]
      const b = mp.notes[i]
      // only consecutive notes of one phrase (a long rest starts a new phrase)
      if (b.t - (a.t + a.len) > 24) continue
      intervals++
      const leap = b.midi - a.midi
      if (Math.abs(leap) > 12) {
        bigLeaps++
        const c = mp.notes[i + 1]
        const ok = c !== undefined && Math.abs(c.midi - b.midi) <= 2 && Math.sign(c.midi - b.midi) === -Math.sign(leap)
        if (!ok) unresolvedLeaps.push(`${theme}/${mp.id}@${b.t} leap ${leap}`)
      }
    }
    for (const s of secs) {
      const n = mp.notes.filter((e) => e.t >= s.start && e.t < s.end)
      if (n.length < 6) continue
      const lo = Math.min(...n.map((e) => e.midi))
      const hi = Math.max(...n.map((e) => e.midi))
      ranges.push({
        section: s.name,
        part: mp.id,
        range: hi - lo,
        peak: hi,
        peakCount: n.filter((e) => e.midi === hi).length,
        notes: n.length
      })
    }
  }
  return { intervals, bigLeaps, unresolvedLeaps, ranges }
}

/* ----------------------------------------------------------------------------------------------- cadences */

export type Cadence = 'authentic' | 'half' | 'plagal' | 'deceptive' | 'tonic' | 'none'

/** Classifies how a section ends, given its last two chords and the tonic of that section. */
export function cadenceOf(prev: Chord, last: Chord, tonic: number): Cadence {
  const rel = (c: Chord) => (c.root - tonic + 12) % 12
  const p = rel(prev)
  const l = rel(last)
  if (l === 0 && p === 7) return 'authentic'
  if (l === 0 && p === 5) return 'plagal'
  if (l === 7) return 'half'
  if (p === 7 && (l === 9 || l === 8)) return 'deceptive'
  if (l === 0) return 'tonic'
  return 'none'
}

export interface SectionCadence {
  section: string
  bars: number
  cadence: Cadence
  /** Cadence across the boundary into the next section (counts V -> next-tonic). */
  into: string
}

export function cadenceReport(theme: ThemeName): SectionCadence[] {
  const song = compileSong(SONGS[theme])
  const secs = sectionsOf(song)
  return secs.map((s, i) => {
    const last = s.segs[s.segs.length - 1].chord
    const prev = s.segs.length > 1 ? s.segs[s.segs.length - 2].chord : last
    const tonic = KEYS[theme].sections?.[s.name] ?? KEYS[theme].tonic
    const cad = cadenceOf(prev, last, tonic)
    const nextSec = secs[i + 1] ?? secs.find((x) => x.loop) ?? secs[0]
    const nextFirst = nextSec.segs[0].chord
    const motion = (nextFirst.root - last.root + 12) % 12
    return {
      section: s.name,
      bars: s.bars,
      cadence: cad,
      into:
        motion === 5
          ? 'V->I root motion'
          : motion === 0
            ? 'same root'
            : motion === 2 || motion === 1
              ? 'step up'
              : `root +${motion}`
    }
  })
}

/* ------------------------------------------------------------------------------------------- arrangement */

export interface ArrangementReport {
  /** Pairs of melody parts that sound identical pitches at identical times for most of a section. */
  unisons: string[]
  /** Moments where a bass-instrument note is above another sounding pitched note. */
  bassAbove: string[]
  /** Events per bar of each section. */
  density: Array<{ section: string; perBar: number }>
  /** Drum events per layer. */
  drumsByLayer: number[]
}

export function arrangementReport(theme: ThemeName): ArrangementReport {
  const song = compileSong(SONGS[theme])
  const secs = sectionsOf(song)
  const def = song.def
  const unisons: string[] = []
  const bassAbove: string[] = []
  const mel = melodyParts(song)
  for (const s of secs) {
    for (let a = 0; a < mel.length; a++)
      for (let b = a + 1; b < mel.length; b++) {
        const na = mel[a].notes.filter((e) => e.t >= s.start && e.t < s.end)
        const nb = mel[b].notes.filter((e) => e.t >= s.start && e.t < s.end)
        if (na.length < 6 || nb.length < 6) continue
        const keys = new Set(nb.map((e) => `${e.t}:${e.midi}:${e.len}`))
        const shared = na.filter((e) => keys.has(`${e.t}:${e.midi}:${e.len}`)).length
        if (shared / Math.min(na.length, nb.length) > 0.6) unisons.push(`${theme}/${s.name}: ${mel[a].id}=${mel[b].id}`)
      }
  }
  const bassIdx = new Set(
    def.parts.map((p, i) => (p.inst === 'bass' || p.inst === 'sub' ? i : -1)).filter((i) => i >= 0)
  )
  const pitched = song.events.filter((e) => def.parts[e.part].inst !== 'kit' && def.parts[e.part].inst !== 'timpani')
  for (const b of song.events) {
    if (!bassIdx.has(b.part)) continue
    for (const o of pitched) {
      if (bassIdx.has(o.part) || o.t > b.t + 1 || o.t + o.len <= b.t) continue
      // a sounding pitched note below the bass note (ignoring decorative octaves above it)
      if (o.midi < b.midi) bassAbove.push(`${theme}@${b.t} ${def.parts[o.part].id} ${o.midi} < bass ${b.midi}`)
    }
  }
  const density = secs.map((s) => ({
    section: s.name,
    perBar: song.events.filter((e) => e.t >= s.start && e.t < s.end).length / s.bars
  }))
  const layers = [0, 0, 0]
  for (const e of song.events) {
    const p = def.parts[e.part]
    if (p.role !== 'drum') continue
    for (let l = p.layer ?? 0; l <= (p.maxLayer ?? 2); l++) layers[l]++
  }
  return { unisons, bassAbove, density, drumsByLayer: layers }
}
