/**
 * Music playback: one MusicPlayer per sounding theme. A look-ahead scheduler queues notes on the
 * AudioContext clock (so the beat holds when frames stutter), wraps at the loop point, and gates parts by
 * intensity layer. Parts have their own gain, pan, reverb and chorus sends.
 */
import { LEGATO, VOICES, type VoiceEnv } from './instruments'
import type { Mixer } from './mixer'
import { compileSong, type CompiledSong, type SongDef } from './notation'

const compiled = new Map<SongDef, CompiledSong>()
export function compiledSong(def: SongDef): CompiledSong {
  let c = compiled.get(def)
  if (!c) {
    c = compileSong(def)
    compiled.set(def, c)
  }
  return c
}

interface PartRuntime {
  gain: GainNode
  lastEnd: number
  lastMidi: number
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

  constructor(
    private readonly mixer: Mixer,
    noise: AudioBuffer,
    def: SongDef,
    layer: number,
    startTime: number,
    humanise = true
  ) {
    this.song = compiledSong(def)
    this.layer = layer
    this.humanise = humanise
    const ctx = mixer.ctx
    this.env = { ctx, out: mixer.music, noise }
    this.out = ctx.createGain()
    this.out.gain.value = 1
    this.out.connect(mixer.music)
    this.revBus = ctx.createGain()
    this.revBus.connect(mixer.musicReverb)
    this.choBus = ctx.createGain()
    this.choBus.connect(mixer.chorus)
    for (const p of def.parts) {
      const g = ctx.createGain()
      g.gain.value = this.active(p.layer, p.maxLayer) ? p.vol : 0
      const pan = ctx.createStereoPanner()
      pan.pan.value = p.pan ?? 0
      g.connect(pan)
      pan.connect(this.out)
      if (p.send) {
        const s = ctx.createGain()
        s.gain.value = p.send
        pan.connect(s)
        s.connect(this.revBus)
      }
      if (p.chorus) {
        const s = ctx.createGain()
        s.gain.value = p.chorus
        pan.connect(s)
        s.connect(this.choBus)
      }
      this.parts.push({ gain: g, lastEnd: -1, lastMidi: -1 })
    }
    this.origin = startTime
    this.out.gain.value = def.gain
  }

  private active(layer = 0, maxLayer = 2): boolean {
    return this.layer >= layer && this.layer <= maxLayer
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

  /** Schedules every note that starts before `until` (context seconds). */
  pump(until: number): void {
    const { events, tickSec, totalTicks, loopTick, def } = this.song
    for (let guard = 0; guard < 100000; guard++) {
      if (this.next >= events.length) {
        if (def.once) {
          this.finished = true
          return
        }
        // Wrap: the end of the song is `totalTicks`; resume at the loop point.
        this.origin += (totalTicks - this.tickBase) * tickSec
        this.tickBase = loopTick
        this.next = events.findIndex((e) => e.t >= loopTick)
        if (this.next < 0) return
        continue
      }
      const e = events[this.next]
      const when = this.origin + (e.t - this.tickBase) * tickSec
      if (when > until) return
      this.next++
      const part = def.parts[e.part]
      if (!this.active(part.layer, part.maxLayer)) continue
      this.playEvent(e.part, when, e.len * tickSec, e.midi, e.vel)
    }
  }

  private playEvent(pi: number, when: number, dur: number, midi: number, vel: number): void {
    const part = this.song.def.parts[pi]
    const rt = this.parts[pi]
    let t = when
    if (this.humanise && !part.tight && part.role !== 'drum') t += (Math.random() - 0.5) * 0.008
    t = Math.max(t, this.mixer.ctx.currentTime)
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
    try {
      VOICES[part.inst]({ ...this.env, out: rt.gain }, t, dur, midi, vel, glide)
    } catch {
      // A failing voice must never take the game down.
    }
  }

  /** Fades the player out and detaches it after the tail has rung out. */
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
        try {
          this.out.disconnect()
          this.revBus.disconnect()
          this.choBus.disconnect()
        } catch {
          // Already gone.
        }
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
