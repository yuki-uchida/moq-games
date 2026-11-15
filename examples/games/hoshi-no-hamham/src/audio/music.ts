/**
 * Music playback: one MusicPlayer per sounding theme. A look-ahead scheduler queues notes on the
 * AudioContext clock (so the beat holds when frames stutter), wraps at the loop point, and gates parts by
 * intensity layer. Parts have their own gain, pan, reverb and chorus sends.
 *
 * A live player keeps the gains, filters and panners of its voices and builds every later note on them (see `Rack`):
 * a note then makes only its sources, a third of the nodes it would make otherwise. A player that has stopped sounding
 * can be started again from its song's first note (`restart`) on the parts and racks it has, and one can be built
 * before its theme is asked for, off the mixer: either way a change of music then builds nothing but notes.
 */
import type { Idle } from './bank'
import { LEGATO, Rack, VOICES, type VoiceEnv } from './instruments'
import type { Mixer } from './mixer'
import { compileSong, type CompiledSong, type InstName, type SongDef } from './notation'

const compiled = new Map<SongDef, CompiledSong>()
export function compiledSong(def: SongDef): CompiledSong {
  let c = compiled.get(def)
  if (!c) {
    c = compileSong(def)
    compiled.set(def, c)
  }
  return c
}

/** How long the compiling ahead waits before it looks again while a stage is played (ms). */
const AHEAD_RETRY_MS = 1000

/**
 * Does `work` for each of `items`, one per idle moment and never while a stage is played (it looks again a second
 * later). Work that returns true has more to do for its item: it is called for it again in the next idle moment.
 * Returns a function that stops it.
 */
export function inIdleMoments<T>(
  items: readonly T[],
  work: (item: T) => boolean | void,
  idle: Idle,
  playing: () => boolean,
  later: (run: () => void, ms: number) => unknown = setTimeout
): () => void {
  const left = [...items]
  let stopped = false
  const next = () => {
    if (stopped || !left.length) return
    if (playing()) {
      later(next, AHEAD_RETRY_MS)
      return
    }
    idle(() => {
      if (stopped) return
      // A stage may have started while this waited for its moment.
      if (!playing() && work(left[0]) !== true) left.shift()
      next()
    }, playing)
  }
  next()
  return () => {
    stopped = true
  }
}

/**
 * Compiles songs before they are first played, one per idle moment and never while a stage is played, so that a
 * change of music (the boss's entrance, the stage's end) only has to build its player. Returns a function that
 * stops it.
 */
export function compileSongsAhead(
  defs: readonly SongDef[],
  idle: Idle,
  playing: () => boolean,
  later: (run: () => void, ms: number) => unknown = setTimeout,
  compile: (def: SongDef) => unknown = compiledSong
): () => void {
  return inIdleMoments(
    defs.filter((def) => !compiled.has(def)),
    (def) => void compile(def),
    idle,
    playing,
    later
  )
}

/** Extra stereo width per instrument: a pan multiplier and a default chorus send for parts that set none. */
const WIDTH: Partial<Record<InstName, { pan: number; chorus: number }>> = {
  strings: { pan: 1.8, chorus: 0.33 },
  pad: { pan: 1.8, chorus: 0.39 },
  choir: { pan: 1.8, chorus: 0.26 },
  harp: { pan: 1.8, chorus: 0.39 },
  pizz: { pan: 1.8, chorus: 0.39 },
  celesta: { pan: 1.7, chorus: 0.33 },
  glock: { pan: 1.7, chorus: 0.33 },
  bell: { pan: 1.7, chorus: 0.33 },
  musicbox: { pan: 1.7, chorus: 0.33 },
  flute: { pan: 1.8, chorus: 0.2 },
  oboe: { pan: 1.8, chorus: 0.2 },
  clarinet: { pan: 1.8, chorus: 0.2 },
  horn: { pan: 1.7, chorus: 0.2 },
  brass: { pan: 1.7, chorus: 0.13 }
}

/** Seconds a rack is left alone after the sources of its note have stopped, while its filters ring out. */
const RACK_REST = 0.05
/**
 * How far ahead of its time a note is scheduled, as `prime` reckons it (the engine's look-ahead): a rack is free
 * for a note when the note before it on that rack has rung out by then.
 */
const PRIME_LEAD = 0.5

interface PartRuntime {
  gain: GainNode
  lastEnd: number
  lastMidi: number
  /** The racks of the part's voice, by graph: one list for an instrument, one per drum for the kit. */
  racks: Map<number, Rack[]>
}

export class MusicPlayer {
  readonly out: GainNode
  readonly song: CompiledSong
  private readonly env: VoiceEnv
  private readonly parts: PartRuntime[] = []
  private readonly revBus: GainNode
  private readonly choBus: GainNode
  /** Index of the next event. */
  private next = 0
  /** Context time at which tick `tickBase` sounds. */
  private origin: number
  private tickBase = 0
  private layer: number
  finished = false
  private readonly humanise: boolean
  private readonly kept: boolean
  /** True while the player's outputs are connected to the mixer. */
  private attached = false
  /** The next event `prime` looks at, the stand-in of its sources, and whether there is anything left for it. */
  private primeNext = 0
  private standIn: OscillatorNode | null = null
  private primeable: boolean

  /**
   * `humanise` loosens the timing of the notes a little (a live player). `kept` builds the notes on racks; it
   * defaults to the same, because a render that schedules a whole song at once has no use for them. Without
   * `attached` the player is built off the mixer and is silent until it is started with `restart`.
   */
  constructor(
    private readonly mixer: Mixer,
    noise: AudioBuffer,
    def: SongDef,
    layer: number,
    startTime: number,
    humanise = true,
    kept = humanise,
    attached = true
  ) {
    this.song = compiledSong(def)
    this.layer = layer
    this.humanise = humanise
    this.kept = kept
    const ctx = mixer.ctx
    this.env = { ctx, out: mixer.music, noise }
    this.out = ctx.createGain()
    this.out.gain.value = 1
    this.revBus = ctx.createGain()
    this.choBus = ctx.createGain()
    // Only a player that was built off the mixer and has not sounded yet has its racks built ahead.
    this.primeable = kept && !attached
    if (attached) this.attach()
    for (const p of def.parts) {
      const g = ctx.createGain()
      g.gain.value = this.active(p.layer, p.maxLayer) ? p.vol : 0
      const pan = ctx.createStereoPanner()
      const w = WIDTH[p.inst]
      // Widen modest pans, but never push a part further out than 0.55 (already-wide parts keep their own pan).
      const base = p.pan ?? 0
      pan.pan.value = Math.sign(base) * Math.min(Math.max(Math.abs(base), 0.55), Math.abs(base) * (w?.pan ?? 1))
      g.connect(pan)
      pan.connect(this.out)
      if (p.send) {
        const s = ctx.createGain()
        s.gain.value = p.send
        pan.connect(s)
        s.connect(this.revBus)
      }
      const chorus = p.chorus ?? w?.chorus ?? 0
      if (chorus) {
        const s = ctx.createGain()
        s.gain.value = chorus
        pan.connect(s)
        s.connect(this.choBus)
      }
      this.parts.push({ gain: g, lastEnd: -1, lastMidi: -1, racks: new Map() })
    }
    this.origin = startTime
    this.out.gain.value = def.gain
  }

  private active(layer = 0, maxLayer = 2): boolean {
    return this.layer >= layer && this.layer <= maxLayer
  }

  /** Connects the player's three outputs to the mixer. */
  private attach(): void {
    if (this.attached) return
    this.attached = true
    this.out.connect(this.mixer.music)
    this.revBus.connect(this.mixer.musicReverb)
    this.choBus.connect(this.mixer.chorus)
  }

  /** Takes the player off the mixer; its parts and the racks of its voices stay as they are. */
  private detach(): void {
    if (!this.attached) return
    this.attached = false
    try {
      this.out.disconnect()
      this.revBus.disconnect()
      this.choBus.disconnect()
    } catch {
      // Already gone.
    }
  }

  /**
   * The context time from which nothing of this player sounds any more: its last note has rung out. Until then it
   * must not be started again (the tail of a note of the pass before would be heard under the new one). Infinity
   * for a player without racks, which does not know when its notes end; 0 for one that has not sounded (the times
   * on racks built ahead are the song's, not the context's).
   */
  get quietAt(): number {
    if (!this.kept) return Infinity
    if (this.primeable) return 0
    let at = 0
    for (const rt of this.parts)
      for (const list of rt.racks.values()) for (const rack of list) if (rack.freeAt > at) at = rack.freeAt
    return at
  }

  /**
   * Starts the song again from its first note at `startTime`, on the parts and the racks the player has: nothing is
   * built for it but the sources of its notes. For a player that was faded out and has rung out (`quietAt`), or one
   * that was built off the mixer.
   */
  restart(layer: number, startTime: number): void {
    const def = this.song.def
    this.endPriming()
    this.layer = layer
    this.next = 0
    this.tickBase = 0
    this.origin = startTime
    this.finished = false
    for (const g of [this.out, this.revBus, this.choBus]) g.gain.cancelScheduledValues(0)
    this.out.gain.value = def.gain
    this.revBus.gain.value = 1
    this.choBus.gain.value = 1
    def.parts.forEach((p, i) => {
      const rt = this.parts[i]
      rt.gain.gain.cancelScheduledValues(0)
      rt.gain.gain.value = this.active(p.layer, p.maxLayer) ? p.vol : 0
      rt.lastEnd = -1
      rt.lastMidi = -1
    })
    this.attach()
  }

  setLayer(layer: number): void {
    if (layer === this.layer) return
    this.layer = layer
    const now = this.mixer.ctx.currentTime
    this.song.def.parts.forEach((p, i) => {
      const on = this.active(p.layer, p.maxLayer)
      this.parts[i].gain.gain.cancelScheduledValues(now)
      this.parts[i].gain.gain.setTargetAtTime(on ? p.vol : 0, now, on ? 0.5 : 0.35)
    })
  }

  /**
   * Schedules every note that starts before `until` (context seconds). With a budget it stops once that many
   * milliseconds have been spent and returns true: the rest is still due and the caller should continue soon. A
   * `silent` pump advances through the notes without building any voice.
   */
  pump(
    until: number,
    budgetMs = Infinity,
    silent = false,
    clock: () => number = performance.now.bind(performance)
  ): boolean {
    const { events, tickSec, totalTicks, loopTick, def } = this.song
    const deadline = budgetMs === Infinity ? Infinity : clock() + budgetMs
    for (let guard = 0; guard < 100000; guard++) {
      if (this.next >= events.length) {
        if (def.once) {
          this.finished = true
          return false
        }
        // Wrap: the end of the song is `totalTicks`; resume at the loop point.
        this.origin += (totalTicks - this.tickBase) * tickSec
        this.tickBase = loopTick
        this.next = events.findIndex((e) => e.t >= loopTick)
        if (this.next < 0) return false
        continue
      }
      const e = events[this.next]
      const when = this.origin + (e.t - this.tickBase) * tickSec
      if (when > until) return false
      this.next++
      const part = def.parts[e.part]
      if (silent || !this.active(part.layer, part.maxLayer)) continue
      this.playEvent(e.part, when, e.len * tickSec, e.midi, e.vel)
      if (deadline !== Infinity && clock() >= deadline) return true
    }
    return false
  }

  private playEvent(pi: number, when: number, dur: number, midi: number, vel: number): void {
    const part = this.song.def.parts[pi]
    const rt = this.parts[pi]
    const now = this.mixer.ctx.currentTime
    let t = when
    if (this.humanise && !part.tight && part.role !== 'drum') t += (Math.random() - 0.5) * 0.008
    t = Math.max(t, now)
    let glide: number | undefined
    if (
      LEGATO.has(part.inst) &&
      rt.lastMidi >= 0 &&
      Math.abs(t - rt.lastEnd) < 0.045 &&
      Math.abs(midi - rt.lastMidi) <= 9 &&
      midi !== rt.lastMidi
    )
      glide = rt.lastMidi
    rt.lastEnd = t + dur
    rt.lastMidi = midi
    const env = this.env
    env.out = rt.gain
    // Every drum of the kit is a graph of its own; any other instrument builds the same graph for every note.
    const key = part.inst === 'kit' ? midi : 0
    const rack = this.kept ? this.rackOf(rt, key, now) : undefined
    env.rack = rack
    rack?.begin()
    try {
      VOICES[part.inst](env, t, dur, midi, vel, glide)
      rack?.end(RACK_REST)
    } catch {
      // A failing voice must never take the game down. What it left on its rack is unknown: no note uses it again.
      if (rack) {
        const list = rt.racks.get(key)
        list?.splice(list.indexOf(rack), 1)
      }
    }
  }

  /**
   * Builds the racks the notes of the song's first `seconds` are built on, before the song is played: every such
   * note is built on its rack as `playEvent` would build it, with a stand-in for its sources that never sounds
   * (see `VoiceEnv.standIn`), at the time it has in the song. The first notes of the song then make only their
   * sources, as every later note does. With a budget it stops once that many milliseconds are spent and returns
   * true: there is more to do. Nothing to do (false) for a player that has sounded or is on the mixer.
   */
  prime(seconds: number, budgetMs = Infinity, clock: () => number = performance.now.bind(performance)): boolean {
    if (!this.primeable) return false
    const { events, tickSec, def } = this.song
    const ctx = this.mixer.ctx
    this.standIn ??= ctx.createOscillator()
    const env = this.env
    const deadline = budgetMs === Infinity ? Infinity : clock() + budgetMs
    while (this.primeNext < events.length) {
      const e = events[this.primeNext]
      const when = e.t * tickSec
      if (when >= seconds) break
      this.primeNext++
      const part = def.parts[e.part]
      if (!this.active(part.layer, part.maxLayer)) continue
      const rt = this.parts[e.part]
      const key = part.inst === 'kit' ? e.midi : 0
      // The racks' times are the song's here (it starts at 0): a rack is free for this note when the note before
      // it has rung out by the time this one would be scheduled.
      const rack = this.rackOf(rt, key, Math.max(0, when - PRIME_LEAD))
      env.out = rt.gain
      env.rack = rack
      env.standIn = this.standIn
      rack.begin()
      try {
        VOICES[part.inst](env, when, e.len * tickSec, e.midi, e.vel)
        rack.end(RACK_REST)
      } catch {
        const list = rt.racks.get(key)
        list?.splice(list.indexOf(rack), 1)
      } finally {
        env.standIn = undefined
      }
      if (deadline !== Infinity && clock() >= deadline) return true
    }
    this.endPriming()
    return false
  }

  /** The racks built ahead are free from now on, and the stand-in is taken off them. */
  private endPriming(): void {
    if (!this.primeable) return
    this.primeable = false
    for (const rt of this.parts) for (const list of rt.racks.values()) for (const rack of list) rack.freeAt = 0
    const standIn = this.standIn
    this.standIn = null
    if (!standIn) return
    try {
      standIn.disconnect()
      standIn.frequency.cancelScheduledValues(0)
      standIn.detune.cancelScheduledValues(0)
    } catch {
      // Nothing was connected.
    }
  }

  /** A rack of this graph whose last note has rung out, or a new one. */
  private rackOf(rt: PartRuntime, key: number, now: number): Rack {
    let list = rt.racks.get(key)
    if (!list) rt.racks.set(key, (list = []))
    for (let i = 0; i < list.length; i++) if (list[i].freeAt <= now) return list[i]
    const rack = new Rack()
    list.push(rack)
    return rack
  }

  /** Nodes kept on the racks of all parts, for the tests and the measuring tools. */
  get keptNodes(): number {
    let n = 0
    for (const rt of this.parts) for (const list of rt.racks.values()) for (const rack of list) n += rack.size
    return n
  }

  /** Fades the player out and takes it off the mixer once the fade is over. */
  fadeOut(seconds: number, then: () => void): void {
    const ctx = this.mixer.ctx
    const now = ctx.currentTime
    this.out.gain.cancelScheduledValues(now)
    this.out.gain.setValueAtTime(this.out.gain.value, now)
    this.out.gain.linearRampToValueAtTime(0, now + seconds)
    this.revBus.gain.setValueAtTime(this.revBus.gain.value, now)
    this.revBus.gain.linearRampToValueAtTime(0, now + seconds)
    this.choBus.gain.setValueAtTime(this.choBus.gain.value, now)
    this.choBus.gain.linearRampToValueAtTime(0, now + seconds)
    setTimeout(
      () => {
        this.detach()
        then()
      },
      seconds * 1000 + 300
    )
  }

  /** Fades the player in from silence over `seconds`. */
  fadeIn(seconds: number): void {
    if (seconds <= 0) return
    const now = this.mixer.ctx.currentTime
    for (const g of [this.out, this.revBus, this.choBus]) {
      const target = g === this.out ? this.song.def.gain : 1
      g.gain.setValueAtTime(0, now)
      g.gain.linearRampToValueAtTime(target, now + seconds)
    }
  }
}
