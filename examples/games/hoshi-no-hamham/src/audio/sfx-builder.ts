/**
 * The sound-effect builder: tone / noise / bell layers on a per-effect bus, plus a few shared recipes.
 * `sfx.ts` defines every SfxName with it.
 */
import { mtof } from './instruments'
import type { Mixer } from './mixer'

export interface ToneOpts {
  /** Start delay in seconds. */
  at?: number
  /** Attack seconds. */
  a?: number
  /** Seconds the level is held before decaying. */
  hold?: number
  /** Low-pass [from, to] over the sound. */
  lp?: [number, number?]
  /** Band-pass formant [freq, q] (fixed). */
  bp?: [number, number]
  /** Tremolo [rate, depth 0..1]. */
  tr?: [number, number]
  /** Vibrato [rate, cents]. */
  vib?: [number, number]
  detune?: number
  /** Fraction of d over which the pitch sweeps (default 1). */
  sw?: number
  /** Send to the SFX reverb 0..1 (default per effect). */
  rev?: number
}

type Wave = OscillatorType

export class SfxBuilder {
  readonly bus: GainNode
  private readonly pan: StereoPannerNode
  private seed = Math.floor(Math.random() * 2 ** 31)

  constructor(
    readonly ctx: BaseAudioContext,
    private readonly noise: AudioBuffer,
    mixer: Mixer,
    readonly t0: number,
    private readonly pm: number,
    vol: number,
    pan: number,
    private readonly rev: number
  ) {
    this.bus = ctx.createGain()
    this.bus.gain.value = vol
    this.pan = ctx.createStereoPanner()
    this.pan.pan.value = Math.max(-1, Math.min(1, pan))
    this.bus.connect(this.pan)
    this.pan.connect(mixer.sfx)
    if (rev > 0) {
      const s = ctx.createGain()
      s.gain.value = rev
      this.pan.connect(s)
      s.connect(mixer.sfxReverb)
    }
  }

  /** Deterministic-ish random 0..1 (seeded per effect so layers are reproducible within one play). */
  rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    return this.seed / 0xffffffff
  }

  /** The longest tail scheduled so far (seconds from t0). */
  end = 0

  private env(g: AudioParam, at: number, peak: number, a: number, hold: number, d: number): number {
    const t = this.t0 + at
    g.setValueAtTime(0.0001, t)
    g.linearRampToValueAtTime(Math.max(0.0001, peak), t + a)
    if (hold > 0) g.setValueAtTime(Math.max(0.0001, peak), t + a + hold)
    g.setTargetAtTime(0.0001, t + a + hold, Math.max(0.005, d / 4))
    const stop = t + a + hold + d * 1.7 + 0.03
    this.end = Math.max(this.end, stop - this.t0)
    return stop
  }

  tone(w: Wave, f0: number, f1: number, d: number, g: number, o: ToneOpts = {}): void {
    const ctx = this.ctx
    const at = o.at ?? 0
    const t = this.t0 + at
    const a = o.a ?? 0.004
    const gn = ctx.createGain()
    const stop = this.env(gn.gain, at, g, a, o.hold ?? 0, d)
    const osc = ctx.createOscillator()
    osc.type = w
    const F0 = f0 * this.pm
    const F1 = f1 * this.pm
    osc.frequency.setValueAtTime(F0, t)
    if (F1 !== F0) osc.frequency.exponentialRampToValueAtTime(F1, t + d * (o.sw ?? 1))
    if (o.detune) osc.detune.value = o.detune
    osc.start(t)
    osc.stop(stop)
    let node: AudioNode = osc
    if (o.lp) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.Q.value = 0.8
      f.frequency.setValueAtTime(o.lp[0] * this.pm, t)
      if (o.lp[1] !== undefined) f.frequency.exponentialRampToValueAtTime(o.lp[1] * this.pm, t + d)
      node.connect(f)
      node = f
    }
    if (o.bp) {
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = o.bp[0] * this.pm
      f.Q.value = o.bp[1]
      node.connect(f)
      node = f
    }
    if (o.vib) {
      const l = ctx.createOscillator()
      l.frequency.value = o.vib[0]
      const lg = ctx.createGain()
      lg.gain.value = o.vib[1]
      l.connect(lg)
      lg.connect(osc.detune)
      l.start(t)
      l.stop(stop)
    }
    if (o.tr) {
      const tg = ctx.createGain()
      tg.gain.value = 1 - o.tr[1] / 2
      const l = ctx.createOscillator()
      l.frequency.value = o.tr[0]
      const lg = ctx.createGain()
      lg.gain.value = o.tr[1] / 2
      l.connect(lg)
      lg.connect(tg.gain)
      l.start(t)
      l.stop(stop)
      node.connect(tg)
      node = tg
    }
    node.connect(gn)
    gn.connect(this.bus)
  }

  /** Filtered noise whose filter sweeps from f0 to f1 over d. */
  nz(
    type: 'bandpass' | 'lowpass' | 'highpass',
    f0: number,
    f1: number,
    d: number,
    g: number,
    o: ToneOpts & { q?: number } = {}
  ): void {
    const ctx = this.ctx
    const at = o.at ?? 0
    const t = this.t0 + at
    const gn = ctx.createGain()
    const stop = this.env(gn.gain, at, g, o.a ?? 0.003, o.hold ?? 0, d)
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    src.start(t, this.rnd() * 1.4)
    src.stop(stop)
    const f = ctx.createBiquadFilter()
    f.type = type
    f.Q.value = (o as { q?: number }).q ?? 1
    f.frequency.setValueAtTime(f0 * this.pm, t)
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1 * this.pm, t + d * (o.sw ?? 1))
    src.connect(f)
    let node: AudioNode = f
    if (o.tr) {
      const tg = ctx.createGain()
      tg.gain.value = 1 - o.tr[1] / 2
      const l = ctx.createOscillator()
      l.frequency.value = o.tr[0]
      const lg = ctx.createGain()
      lg.gain.value = o.tr[1] / 2
      l.connect(lg)
      lg.connect(tg.gain)
      l.start(t)
      l.stop(stop)
      node.connect(tg)
      node = tg
    }
    node.connect(gn)
    gn.connect(this.bus)
  }

  /** An FM bell/chime on a MIDI note. */
  bell(midi: number, d: number, g: number, o: { at?: number; ratio?: number; index?: number } = {}): void {
    const ctx = this.ctx
    const at = o.at ?? 0
    const t = this.t0 + at
    const f = mtof(midi) * this.pm
    const gn = ctx.createGain()
    const stop = this.env(gn.gain, at, g, 0.002, 0, d)
    const car = ctx.createOscillator()
    car.frequency.value = f
    const mod = ctx.createOscillator()
    mod.frequency.value = f * (o.ratio ?? 3.5)
    const mg = ctx.createGain()
    const peak = f * (o.index ?? 1.8)
    mg.gain.setValueAtTime(peak, t)
    mg.gain.setTargetAtTime(peak * 0.05, t, d / 6)
    mod.connect(mg)
    mg.connect(car.frequency)
    car.connect(gn)
    gn.connect(this.bus)
    car.start(t)
    mod.start(t)
    car.stop(stop)
    mod.stop(stop)
  }

  /** A run of notes (MIDI) with `step` seconds between starts. */
  run(w: Wave, midis: number[], step: number, d: number, g: number, o: ToneOpts = {}): void {
    midis.forEach((m, i) => this.tone(w, mtof(m), mtof(m), d, g, { ...o, at: (o.at ?? 0) + i * step }))
  }

  bells(
    midis: number[],
    step: number,
    d: number,
    g: number,
    o: { at?: number; ratio?: number; index?: number } = {}
  ): void {
    midis.forEach((m, i) => this.bell(m, d, g, { ...o, at: (o.at ?? 0) + i * step }))
  }

  /** Random high sparkles. */
  sparkle(n: number, at: number, span: number, lo: number, hi: number, g: number): void {
    for (let i = 0; i < n; i++) {
      const m = lo + Math.floor(this.rnd() * (hi - lo))
      this.bell(m, 0.35, g, { at: at + (i / n) * span + this.rnd() * 0.02, ratio: 3, index: 0.8 })
    }
  }

  /** Short noise ticks (mechanical clicks, crackle, scurrying). */
  ticks(n: number, at: number, step: number, f: number, g: number, d = 0.025, jitter = 0.3): void {
    for (let i = 0; i < n; i++)
      this.nz('bandpass', f * (0.8 + this.rnd() * 0.5), f * 0.7, d, g * (0.6 + this.rnd() * 0.5), {
        at: at + i * step + this.rnd() * step * jitter,
        q: 1.5
      })
  }

  /** The howl: a sawtooth through two vowel formants with an arching pitch. */
  howl(at: number, d: number, f: number, g: number): void {
    const ctx = this.ctx
    const t = this.t0 + at
    const gn = ctx.createGain()
    gn.gain.setValueAtTime(0.0001, t)
    gn.gain.linearRampToValueAtTime(g, t + d * 0.25)
    gn.gain.setValueAtTime(g, t + d * 0.6)
    gn.gain.linearRampToValueAtTime(0.0001, t + d)
    const stop = t + d + 0.05
    this.end = Math.max(this.end, stop - this.t0)
    gn.connect(this.bus)
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    const F = f * this.pm
    osc.frequency.setValueAtTime(F * 0.8, t)
    osc.frequency.exponentialRampToValueAtTime(F * 1.3, t + d * 0.45)
    osc.frequency.exponentialRampToValueAtTime(F * 1.12, t + d * 0.8)
    osc.frequency.exponentialRampToValueAtTime(F * 0.92, t + d)
    const vib = ctx.createOscillator()
    vib.frequency.value = 5.5
    const vg = ctx.createGain()
    vg.gain.value = 18
    vib.connect(vg)
    vg.connect(osc.detune)
    for (const [fr, q, k] of [
      [650, 6, 1],
      [1050, 7, 0.7],
      [2400, 5, 0.25]
    ] as const) {
      const b = ctx.createBiquadFilter()
      b.type = 'bandpass'
      b.frequency.setValueAtTime(fr, t)
      b.frequency.linearRampToValueAtTime(fr * 1.35, t + d * 0.45)
      b.frequency.linearRampToValueAtTime(fr * 0.9, t + d)
      b.Q.value = q
      const bg = ctx.createGain()
      bg.gain.value = k * 2.2
      osc.connect(b)
      b.connect(bg)
      bg.connect(gn)
    }
    osc.start(t)
    vib.start(t)
    osc.stop(stop)
    vib.stop(stop)
  }
}

/* ----------------------------------------------------------------------------------------------- recipes */

export const boom = (b: SfxBuilder, at: number, f0: number, f1: number, d: number, g: number) => {
  b.tone('sine', f0, f1, d, g, { at, sw: 0.4 })
  b.tone('triangle', f0 * 2, f1 * 2, d * 0.5, g * 0.25, { at, sw: 0.4 })
}
export const crack = (b: SfxBuilder, at: number, d: number, g: number, f = 3500) => b.nz('highpass', f, f, d, g, { at })
export const whoosh = (b: SfxBuilder, at: number, d: number, f0: number, f1: number, g: number, q = 1.1) =>
  b.nz('bandpass', f0, f1, d, g, { at, a: d * 0.45, q })
export const shot = (b: SfxBuilder, at: number, g = 1) => {
  whoosh(b, at, 0.1, 1300, 3800, 0.34 * g, 1.3)
  b.tone('sawtooth', 340, 290, 0.16, 0.12 * g, { at, lp: [1400, 500] })
  b.tone('triangle', 250, 150, 0.08, 0.2 * g, { at })
}
export const howlOne = (b: SfxBuilder, at: number, f: number, g: number) => b.howl(at, 1.4, f, g)

export interface SfxDef {
  /** Max simultaneous instances. */
  limit: number
  /** Minimum seconds between starts. */
  cd: number
  /** Linear loudness before the per-effect trim. */
  g: number
  /** Random pitch variation (fraction, default 0.05). */
  vary?: number
  /** Reverb send. */
  rev?: number
  /** Music duck [amount 0..1, seconds]. */
  duck?: [number, number]
  play: (b: SfxBuilder) => void
}

export const D = (
  limit: number,
  cd: number,
  g: number,
  play: (b: SfxBuilder) => void,
  extra: Partial<SfxDef> = {}
): SfxDef => ({
  limit,
  cd,
  g,
  play,
  ...extra
})
