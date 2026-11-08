/**
 * Layered sound-effect synthesis for every SfxName, plus the sustained LoopName sounds.
 * A tiny builder (tone / noise / bell layers on a per-effect bus) keeps each definition to a few lines.
 * Per-name voice limits, cooldowns and loudness trims make the set consistent and keep it from stacking.
 */
import type { LoopName, SfxName } from './api'
import { mtof } from './instruments'
import type { Mixer } from './mixer'
import { SFX_TRIM } from './sfx-trim'

interface ToneOpts {
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

const boom = (b: SfxBuilder, at: number, f0: number, f1: number, d: number, g: number) => {
  b.tone('sine', f0, f1, d, g, { at, sw: 0.4 })
  b.tone('triangle', f0 * 2, f1 * 2, d * 0.5, g * 0.25, { at, sw: 0.4 })
}
const crack = (b: SfxBuilder, at: number, d: number, g: number, f = 3500) => b.nz('highpass', f, f, d, g, { at })
const whoosh = (b: SfxBuilder, at: number, d: number, f0: number, f1: number, g: number, q = 1.1) =>
  b.nz('bandpass', f0, f1, d, g, { at, a: d * 0.45, q })
const shot = (b: SfxBuilder, at: number, g = 1) => {
  whoosh(b, at, 0.1, 1300, 3800, 0.34 * g, 1.3)
  b.tone('sawtooth', 340, 290, 0.16, 0.12 * g, { at, lp: [1400, 500] })
  b.tone('triangle', 250, 150, 0.08, 0.2 * g, { at })
}
const howlOne = (b: SfxBuilder, at: number, f: number, g: number) => b.howl(at, 1.4, f, g)

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

const D = (
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

export const SFX_DEFS: Record<SfxName, SfxDef> = {
  swing: D(3, 0.07, 1, (b) => {
    whoosh(b, 0, 0.17, 500, 2600, 0.55, 1)
    b.tone('triangle', 900, 1700, 0.12, 0.1, { a: 0.03 })
  }),
  magicCast: D(
    3,
    0.08,
    1,
    (b) => {
      b.run('triangle', [72, 76, 79, 84, 88], 0.045, 0.2, 0.2, { rev: 0.4 })
      b.run('sine', [84, 88, 91, 96, 100], 0.045, 0.25, 0.1, { at: 0.02 })
      b.nz('highpass', 6000, 9000, 0.3, 0.08, { a: 0.1 })
    },
    { vary: 0.03, rev: 0.25 }
  ),
  magicHit: D(
    4,
    0.05,
    1,
    (b) => {
      boom(b, 0, 320, 80, 0.2, 0.7)
      crack(b, 0, 0.1, 0.3, 4000)
      b.bell(96, 0.5, 0.12, { index: 1.2 })
    },
    { rev: 0.2 }
  ),
  arrowShot: D(4, 0.05, 1, (b) => shot(b, 0)),
  arrowHit: D(4, 0.05, 1, (b) => {
    boom(b, 0, 190, 90, 0.1, 0.6)
    b.nz('bandpass', 2400, 1800, 0.06, 0.8, { q: 1.5 })
    b.tone('square', 800, 700, 0.05, 0.05)
  }),
  staffBonk: D(3, 0.07, 1, (b) => {
    b.tone('sine', 430, 270, 0.13, 0.65, { sw: 0.5 })
    b.tone('triangle', 880, 560, 0.08, 0.3)
    b.nz('bandpass', 1300, 900, 0.04, 0.3)
  }),
  spinSlash: D(2, 0.12, 1, (b) => {
    whoosh(b, 0, 0.22, 400, 3000, 0.55)
    whoosh(b, 0.13, 0.22, 450, 3200, 0.5)
    b.tone('sawtooth', 300, 900, 0.3, 0.06, { lp: [1200, 2400] })
  }),
  orbCast: D(
    3,
    0.1,
    1,
    (b) => {
      b.tone('sine', 300, 900, 0.35, 0.35, { a: 0.08, sw: 0.8 })
      b.tone('triangle', 600, 1800, 0.3, 0.12, { a: 0.08, vib: [14, 30] })
      b.sparkle(5, 0.05, 0.25, 90, 105, 0.1)
    },
    { rev: 0.25 }
  ),
  orbBurst: D(
    3,
    0.08,
    1,
    (b) => {
      boom(b, 0, 220, 55, 0.4, 0.8)
      b.nz('bandpass', 1600, 250, 0.35, 0.45)
      b.run('triangle', [96, 91, 88, 84], 0.04, 0.3, 0.12, { at: 0.03 })
    },
    { rev: 0.3, duck: [0.2, 0.4] }
  ),
  tripleShot: D(2, 0.1, 1, (b) => {
    shot(b, 0, 0.85)
    shot(b, 0.055, 0.85)
    shot(b, 0.11, 0.85)
  }),
  holyRing: D(
    2,
    0.15,
    1,
    (b) => {
      b.bells([72, 76, 79, 84], 0.09, 1.1, 0.26, { ratio: 3.5, index: 1 })
      b.tone('sine', 523, 523, 0.9, 0.12, { a: 0.1 })
      b.sparkle(6, 0.1, 0.5, 96, 108, 0.06)
    },
    { vary: 0.02, rev: 0.4 }
  ),
  heal: D(
    2,
    0.15,
    1,
    (b) => {
      b.run('triangle', [72, 76, 79, 83, 88], 0.07, 0.35, 0.22)
      b.bells([84, 91], 0.14, 0.7, 0.14, { at: 0.08 })
      b.sparkle(4, 0.25, 0.3, 96, 106, 0.06)
    },
    { vary: 0.02, rev: 0.35 }
  ),
  chargeStart: D(2, 0.15, 1, (b) => {
    b.tone('sawtooth', 200, 420, 0.28, 0.14, { a: 0.1, lp: [600, 1800] })
    b.nz('bandpass', 400, 1500, 0.25, 0.15, { a: 0.1 })
  }),
  chargeFull: D(
    2,
    0.2,
    1,
    (b) => {
      b.run('square', [72, 76, 79, 84], 0.05, 0.14, 0.1, { rev: 0.3 })
      b.bells([84, 91], 0.07, 0.8, 0.28)
      b.sparkle(5, 0.1, 0.3, 96, 108, 0.06)
    },
    { vary: 0.02, rev: 0.25 }
  ),
  chargeCancel: D(2, 0.15, 1, (b) => {
    b.tone('triangle', 420, 120, 0.22, 0.28)
    b.nz('lowpass', 2000, 300, 0.2, 0.2)
  }),

  hit: D(5, 0.04, 1, (b) => {
    boom(b, 0, 230, 70, 0.12, 0.7)
    b.nz('bandpass', 2600, 1600, 0.07, 0.9, { q: 0.9 })
    crack(b, 0, 0.03, 0.25, 4500)
  }),
  hitHeavy: D(
    3,
    0.07,
    1,
    (b) => {
      boom(b, 0, 160, 42, 0.26, 1)
      crack(b, 0, 0.1, 0.9, 2200)
      b.nz('lowpass', 800, 200, 0.22, 0.4)
    },
    { duck: [0.12, 0.25] }
  ),
  crit: D(
    3,
    0.08,
    1,
    (b) => {
      boom(b, 0, 200, 55, 0.2, 0.9)
      crack(b, 0, 0.1, 0.5, 2800)
      b.bell(96, 0.6, 0.2, { index: 1.4 })
      b.tone('square', 1400, 2200, 0.07, 0.08, { at: 0.02 })
    },
    { rev: 0.2, duck: [0.1, 0.2] }
  ),
  guardClang: D(
    3,
    0.06,
    1,
    (b) => {
      for (const [f, k] of [
        [1180, 0.2],
        [1870, 0.16],
        [2650, 0.12],
        [3490, 0.08]
      ] as const)
        b.tone('square', f, f * 0.99, 0.32, k)
      b.nz('bandpass', 4000, 3000, 0.05, 0.4, { q: 2 })
      boom(b, 0, 180, 90, 0.08, 0.35)
    },
    { rev: 0.2 }
  ),
  enemyDie: D(4, 0.05, 1, (b) => {
    b.tone('square', 520, 90, 0.24, 0.18, { lp: [3000, 400] })
    b.nz('bandpass', 1800, 300, 0.22, 0.45, { q: 0.8 })
    b.sparkle(3, 0.05, 0.12, 84, 96, 0.05)
  }),
  enemyAlert: D(
    3,
    0.15,
    1,
    (b) => {
      b.run('square', [74, 81], 0.07, 0.09, 0.14)
      b.bell(93, 0.3, 0.12)
    },
    { vary: 0.03 }
  ),
  enemyWindup: D(3, 0.12, 1, (b) => {
    b.tone('sawtooth', 150, 340, 0.32, 0.16, { a: 0.12, lp: [700, 1500] })
    whoosh(b, 0, 0.3, 300, 1200, 0.2)
  }),
  enemyShot: D(4, 0.06, 1, (b) => {
    b.tone('sawtooth', 640, 210, 0.16, 0.16, { lp: [2500, 600] })
    whoosh(b, 0, 0.12, 2200, 800, 0.3)
  }),
  enemyCast: D(
    3,
    0.1,
    1,
    (b) => {
      b.tone('triangle', 220, 440, 0.38, 0.22, { a: 0.1, vib: [10, 40] })
      b.tone('sine', 440, 880, 0.35, 0.1, { a: 0.1, vib: [12, 50] })
      b.sparkle(4, 0.1, 0.25, 88, 100, 0.07)
    },
    { rev: 0.3 }
  ),
  fireballHit: D(
    3,
    0.07,
    1,
    (b) => {
      boom(b, 0, 125, 38, 0.4, 1)
      b.nz('lowpass', 2000, 200, 0.42, 0.6)
      b.ticks(7, 0.04, 0.045, 3500, 0.4)
      crack(b, 0, 0.12, 0.3, 3000)
    },
    { rev: 0.2, duck: [0.2, 0.4] }
  ),
  heroHurt: D(4, 0.1, 1, (b) => {
    b.tone('triangle', 540, 290, 0.2, 0.33)
    boom(b, 0, 200, 80, 0.12, 0.5)
    b.nz('bandpass', 1500, 600, 0.1, 0.2)
  }),
  heroDown: D(
    2,
    0.4,
    1,
    (b) => {
      b.tone('triangle', 440, 100, 0.7, 0.34, { sw: 0.8 })
      boom(b, 0.05, 150, 45, 0.3, 0.6)
      b.nz('lowpass', 900, 150, 0.4, 0.25, { at: 0.1 })
    },
    { duck: [0.15, 0.6] }
  ),
  revive: D(
    2,
    0.3,
    1,
    (b) => {
      b.run('triangle', [67, 71, 74, 79, 83], 0.08, 0.4, 0.2)
      b.tone('sine', 262, 524, 0.7, 0.2, { a: 0.3 })
      b.bells([91, 95], 0.12, 0.8, 0.12, { at: 0.35 })
      b.sparkle(6, 0.3, 0.5, 90, 106, 0.06)
    },
    { vary: 0.02, rev: 0.4 }
  ),
  stun: D(
    2,
    0.2,
    1,
    (b) => {
      b.tone('sine', 600, 600, 0.5, 0.15, { tr: [9, 0.9], vib: [6, 120] })
      b.bells([88, 84, 81, 79], 0.08, 0.25, 0.1, { at: 0.05 })
    },
    { vary: 0.03, rev: 0.25 }
  ),

  formLink: D(
    3,
    0.08,
    1,
    (b) => {
      b.bells([79, 86], 0.07, 0.6, 0.3, { ratio: 3.01, index: 1 })
      b.nz('bandpass', 1800, 2400, 0.03, 0.12, { q: 2 })
    },
    { vary: 0.02, rev: 0.3 }
  ),
  formBreak: D(3, 0.1, 1, (b) => {
    b.tone('triangle', 900, 280, 0.22, 0.22)
    b.nz('highpass', 4500, 7000, 0.16, 0.18)
    b.ticks(5, 0.03, 0.03, 4000, 0.14)
  }),
  coopStart: D(
    1,
    0.5,
    1,
    (b) => {
      for (const m of [50, 62, 66, 69, 74]) {
        b.tone('sawtooth', mtof(m), mtof(m), 0.55, 0.15, { a: 0.012, lp: [500, 3600], hold: 0.12 })
        b.tone('sawtooth', mtof(m), mtof(m), 0.55, 0.1, { a: 0.012, detune: 9, lp: [500, 3000], hold: 0.12 })
      }
      boom(b, 0, 110, 50, 0.4, 0.6)
      b.nz('highpass', 3000, 6000, 0.4, 0.1, { a: 0.1 })
      b.bells([86, 90, 93], 0.06, 0.8, 0.12, { at: 0.2 })
    },
    { vary: 0.02, rev: 0.3, duck: [0.3, 1.2] }
  ),
  coopFinish: D(
    1,
    0.5,
    1,
    (b) => {
      b.bells([74, 78, 81, 86, 90], 0.06, 1.6, 0.26, { ratio: 3.5, index: 1.2 })
      boom(b, 0, 100, 38, 0.6, 0.9)
      b.nz('bandpass', 1500, 200, 0.6, 0.4)
      b.sparkle(10, 0.1, 0.8, 90, 108, 0.06)
      for (const m of [62, 66, 69]) b.tone('sawtooth', mtof(m), mtof(m), 0.9, 0.12, { a: 0.03, lp: [800, 3000] })
    },
    { vary: 0.02, rev: 0.4, duck: [0.35, 1.6] }
  ),

  slimeJump: D(2, 0.1, 1, (b) => {
    b.tone('sine', 210, 520, 0.16, 0.5, { sw: 0.8 })
    b.nz('bandpass', 400, 1000, 0.1, 0.2, { q: 2 })
  }),
  slimeLand: D(3, 0.08, 1, (b) => {
    boom(b, 0, 210, 75, 0.14, 0.7)
    b.nz('bandpass', 700, 280, 0.14, 0.45, { q: 0.9 })
    b.tone('sine', 320, 150, 0.1, 0.2, { at: 0.02 })
  }),
  jumboForm: D(
    1,
    0.4,
    1,
    (b) => {
      b.tone('sine', 80, 170, 0.7, 0.6, { a: 0.4, sw: 0.9 })
      b.nz('lowpass', 250, 1000, 0.7, 0.4, { a: 0.4 })
      for (let i = 0; i < 4; i++) b.tone('sine', 250 + i * 70, 520 + i * 120, 0.12, 0.12, { at: 0.1 + i * 0.13 })
    },
    { duck: [0.2, 0.8] }
  ),
  jumboSlam: D(
    1,
    0.3,
    1,
    (b) => {
      boom(b, 0, 95, 26, 0.9, 1.1)
      b.nz('lowpass', 320, 70, 1.1, 0.7)
      b.nz('highpass', 1500, 900, 0.5, 0.3, { at: 0.03 })
      crack(b, 0, 0.1, 0.4, 2000)
    },
    { rev: 0.25, duck: [0.4, 0.9] }
  ),
  ratDash: D(2, 0.1, 1, (b) => {
    b.ticks(7, 0, 0.028, 2200, 0.3, 0.02)
    whoosh(b, 0, 0.18, 1000, 3000, 0.2)
  }),
  ratSqueak: D(
    2,
    0.12,
    1,
    (b) => {
      b.tone('sine', 1100, 1600, 0.1, 0.22, { vib: [28, 80] })
      b.tone('triangle', 550, 800, 0.1, 0.12)
      b.tone('sine', 1600, 1100, 0.09, 0.2, { at: 0.12, vib: [28, 80] })
      b.tone('triangle', 800, 550, 0.09, 0.12, { at: 0.12 })
    },
    { vary: 0.08 }
  ),
  stampede: D(
    1,
    0.3,
    1,
    (b) => {
      for (let i = 0; i < 9; i++) boom(b, i * 0.065, 150, 60, 0.09, 0.5)
      b.ticks(14, 0, 0.04, 2800, 0.26, 0.02)
      b.nz('lowpass', 500, 200, 0.6, 0.35)
    },
    { duck: [0.1, 0.6] }
  ),
  gnaw: D(2, 0.15, 1, (b) => {
    b.ticks(5, 0, 0.045, 1900, 0.5, 0.03, 0.2)
    b.tone('square', 260, 240, 0.2, 0.06, { tr: [24, 0.9] })
  }),
  crowFlap: D(2, 0.12, 1, (b) => {
    for (let i = 0; i < 3; i++) b.nz('bandpass', 750, 380, 0.07, 0.35, { at: i * 0.075, q: 0.8 })
  }),
  crowCaw: D(
    2,
    0.2,
    1,
    (b) => {
      b.tone('sawtooth', 780, 520, 0.2, 0.4, { bp: [1100, 3], vib: [40, 60] })
      b.tone('sawtooth', 700, 450, 0.22, 0.38, { at: 0.24, bp: [1000, 3], vib: [40, 60] })
    },
    { vary: 0.06 }
  ),
  tornado: D(
    1,
    0.3,
    1,
    (b) => {
      whoosh(b, 0, 0.8, 300, 1900, 0.55, 0.8)
      b.tone('sine', 200, 520, 0.7, 0.14, { a: 0.3, vib: [6, 90] })
    },
    { duck: [0.1, 0.6] }
  ),
  wolfHowl: D(1, 0.5, 1, (b) => howlOne(b, 0, 360, 0.34), { vary: 0.04, rev: 0.4, duck: [0.2, 1.4] }),
  packHowl: D(
    1,
    0.5,
    1,
    (b) => {
      howlOne(b, 0, 330, 0.28)
      howlOne(b, 0.18, 416, 0.24)
      howlOne(b, 0.36, 494, 0.22)
    },
    { vary: 0.03, rev: 0.45, duck: [0.3, 1.8] }
  ),
  lunge: D(2, 0.1, 1, (b) => {
    whoosh(b, 0, 0.2, 600, 3400, 0.6, 1.2)
    boom(b, 0.02, 180, 90, 0.12, 0.4)
    b.tone('sawtooth', 200, 700, 0.14, 0.06, { lp: [900, 2400] })
  }),
  crescent: D(
    2,
    0.1,
    1,
    (b) => {
      whoosh(b, 0, 0.32, 3200, 800, 0.4, 1.4)
      b.tone('triangle', 1500, 700, 0.3, 0.12, { a: 0.04 })
      b.sparkle(5, 0.04, 0.25, 90, 104, 0.06)
    },
    { rev: 0.25 }
  ),

  step: D(
    3,
    0.07,
    1,
    (b) => {
      b.tone('sine', 150, 85, 0.06, 0.4)
      b.nz('lowpass', 800, 300, 0.05, 0.25)
    },
    { vary: 0.09 }
  ),
  pushStrain: D(1, 0.2, 1, (b) => {
    b.tone('sawtooth', 70, 62, 0.4, 0.2, { a: 0.1, lp: [300, 200], vib: [7, 40] })
    b.nz('bandpass', 380, 260, 0.35, 0.2, { a: 0.1, q: 3 })
  }),
  blockSlide: D(1, 0.25, 1, (b) => {
    b.nz('bandpass', 520, 300, 0.55, 0.42, { a: 0.06, q: 0.9 })
    b.tone('sine', 58, 52, 0.55, 0.3, { a: 0.08 })
  }),
  blockSink: D(1, 0.3, 1, (b) => {
    boom(b, 0, 110, 38, 0.4, 0.8)
    b.nz('lowpass', 900, 120, 0.45, 0.3)
  }),
  lift: D(2, 0.1, 1, (b) => {
    b.tone('triangle', 200, 420, 0.14, 0.22)
    b.nz('highpass', 1800, 3500, 0.1, 0.12)
  }),
  putDown: D(2, 0.1, 1, (b) => {
    boom(b, 0, 140, 70, 0.1, 0.55)
    b.nz('lowpass', 900, 300, 0.07, 0.2)
  }),
  throw: D(2, 0.1, 1, (b) => whoosh(b, 0, 0.22, 500, 1600, 0.5, 0.9)),
  potBreak: D(3, 0.07, 1, (b) => {
    b.nz('highpass', 2500, 1800, 0.18, 0.35)
    for (let i = 0; i < 5; i++)
      b.tone('square', 1500 + b.rnd() * 2000, 1400, 0.05, 0.07, { at: 0.01 + i * 0.03 + b.rnd() * 0.02 })
    boom(b, 0, 200, 90, 0.1, 0.4)
  }),
  grassCut: D(4, 0.05, 1, (b) => {
    b.nz('bandpass', 2200, 3600, 0.1, 0.34, { a: 0.03, q: 0.7 })
    b.nz('lowpass', 1500, 900, 0.06, 0.15, { at: 0.03 })
  }),
  plateOn: D(2, 0.1, 1, (b) => {
    b.tone('square', 300, 190, 0.035, 0.1)
    boom(b, 0, 130, 70, 0.14, 0.55)
    b.bell(67, 0.4, 0.1, { ratio: 2.5, index: 0.6 })
  }),
  plateOff: D(2, 0.1, 1, (b) => {
    b.tone('square', 220, 160, 0.03, 0.08)
    boom(b, 0, 100, 60, 0.1, 0.35)
  }),
  crystalOn: D(
    2,
    0.1,
    1,
    (b) => {
      b.bells([88, 95], 0.06, 1.2, 0.24, { ratio: 3.01, index: 0.9 })
      b.sparkle(4, 0.08, 0.3, 96, 108, 0.05)
    },
    { vary: 0.02, rev: 0.4 }
  ),
  crystalOff: D(
    2,
    0.1,
    1,
    (b) => {
      b.bells([88, 79], 0.07, 0.7, 0.18, { ratio: 3.01, index: 0.7 })
    },
    { vary: 0.02, rev: 0.3 }
  ),
  lever: D(2, 0.12, 1, (b) => {
    b.ticks(1, 0, 0, 2200, 0.5, 0.025)
    b.tone('square', 210, 100, 0.03, 0.14)
    b.ticks(1, 0.09, 0, 1800, 0.45, 0.03)
    boom(b, 0.09, 120, 70, 0.1, 0.45)
  }),
  gateOpen: D(
    1,
    0.4,
    1,
    (b) => {
      b.nz('lowpass', 260, 130, 1.1, 0.55, { a: 0.15 })
      b.tone('sawtooth', 48, 62, 1.0, 0.18, { a: 0.1, lp: [200, 260] })
      b.ticks(7, 0.05, 0.12, 1500, 0.22, 0.03)
    },
    { duck: [0.1, 1.2] }
  ),
  gateClose: D(
    1,
    0.4,
    1,
    (b) => {
      b.nz('lowpass', 240, 120, 0.7, 0.45, { a: 0.1 })
      b.ticks(5, 0.02, 0.1, 1500, 0.2, 0.03)
      boom(b, 0.6, 100, 34, 0.35, 0.9)
    },
    { duck: [0.1, 0.9] }
  ),
  bell: D(
    2,
    0.3,
    1,
    (b) => {
      b.bell(69, 2.2, 0.45, { ratio: 2.4, index: 1.1 })
      b.bell(81, 1.5, 0.18, { ratio: 2.76, index: 0.6 })
      b.bell(76.2, 1.8, 0.12, { ratio: 1.4, index: 0.5 })
    },
    { vary: 0.03, rev: 0.35 }
  ),
  bossDoor: D(
    1,
    1,
    1,
    (b) => {
      b.nz('lowpass', 220, 90, 1.8, 0.7, { a: 0.3 })
      b.tone('sawtooth', 45, 55, 1.8, 0.28, { a: 0.4, lp: [180, 300] })
      b.ticks(10, 0.1, 0.13, 1300, 0.22, 0.04)
      boom(b, 1.4, 90, 28, 0.7, 1)
      b.run('sawtooth', [38, 45], 0.5, 1.0, 0.1, { at: 0.8, a: 0.3, lp: [300, 900] })
    },
    { rev: 0.3, duck: [0.4, 2.2] }
  ),
  chestOpen: D(
    1,
    0.4,
    1,
    (b) => {
      b.tone('sawtooth', 120, 320, 0.28, 0.12, { a: 0.05, lp: [500, 1400] })
      b.ticks(2, 0.26, 0.04, 2500, 0.4, 0.02)
      b.run('triangle', [84, 88, 91, 96], 0.06, 0.4, 0.18, { at: 0.32 })
      b.sparkle(6, 0.34, 0.4, 96, 108, 0.06)
    },
    { vary: 0.02, rev: 0.3 }
  ),
  gem: D(
    4,
    0.04,
    1,
    (b) => {
      b.run('square', [83, 88], 0.055, 0.1, 0.1)
      b.bell(95, 0.55, 0.28, { ratio: 3, index: 0.8 })
    },
    { vary: 0.025, rev: 0.2 }
  ),
  gemBig: D(
    2,
    0.08,
    1,
    (b) => {
      b.run('triangle', [72, 76, 79, 83, 88, 91], 0.05, 0.3, 0.2)
      b.run('square', [76, 79, 83, 88, 91], 0.05, 0.08, 0.06, { at: 0.02 })
      b.bell(91, 1, 0.22)
      b.sparkle(5, 0.1, 0.3, 98, 108, 0.05)
    },
    { vary: 0.02, rev: 0.3 }
  ),
  heart: D(
    2,
    0.1,
    1,
    (b) => {
      boom(b, 0, 90, 55, 0.14, 0.5)
      boom(b, 0.15, 90, 55, 0.14, 0.4)
      b.bells([79, 84], 0.12, 0.7, 0.2, { at: 0.2 })
    },
    { vary: 0.02, rev: 0.3 }
  ),
  key: D(
    2,
    0.1,
    1,
    (b) => {
      b.bells([84, 88, 91], 0.06, 0.6, 0.24, { ratio: 4.1, index: 0.7 })
      b.ticks(3, 0, 0.05, 3000, 0.12, 0.015)
    },
    { vary: 0.02, rev: 0.25 }
  ),
  unlock: D(
    1,
    0.2,
    1,
    (b) => {
      b.ticks(1, 0, 0, 1800, 0.5, 0.03)
      b.ticks(1, 0.1, 0, 2400, 0.5, 0.03)
      b.tone('square', 260, 120, 0.04, 0.1, { at: 0.1 })
      b.bells([84, 91], 0.1, 0.6, 0.22, { at: 0.18 })
    },
    { vary: 0.02, rev: 0.25 }
  ),
  bounce: D(3, 0.07, 1, (b) => {
    b.tone('sine', 180, 720, 0.18, 0.5, { sw: 0.7, vib: [20, 40] })
    b.tone('triangle', 360, 1200, 0.12, 0.1)
  }),
  splash: D(
    3,
    0.07,
    1,
    (b) => {
      b.nz('bandpass', 800, 2800, 0.36, 0.5, { a: 0.03, q: 0.7 })
      boom(b, 0, 170, 60, 0.18, 0.4)
      for (let i = 0; i < 3; i++) b.tone('sine', 400 + i * 120, 900 + i * 200, 0.08, 0.1, { at: 0.08 + i * 0.07 })
    },
    { rev: 0.2 }
  ),
  fall: D(1, 0.5, 1, (b) => {
    b.tone('sine', 1100, 160, 0.8, 0.22, { sw: 0.9 })
    b.nz('bandpass', 1500, 250, 0.7, 0.12, { q: 2 })
  }),
  rockBreak: D(
    3,
    0.08,
    1,
    (b) => {
      boom(b, 0, 130, 45, 0.3, 0.9)
      crack(b, 0, 0.1, 0.4, 2000)
      b.ticks(9, 0.04, 0.035, 1600, 0.3, 0.03, 0.8)
      b.nz('lowpass', 900, 150, 0.35, 0.3)
    },
    { duck: [0.12, 0.3] }
  ),
  secret: D(
    1,
    0.5,
    1,
    (b) => {
      b.run('triangle', [69, 72, 76, 81], 0.11, 0.4, 0.2)
      b.bells([88, 93, 96, 100], 0.11, 0.9, 0.16, { at: 0.45 })
      b.sparkle(6, 0.4, 0.5, 92, 106, 0.05)
    },
    { vary: 0.015, rev: 0.45 }
  ),
  checkpoint: D(
    1,
    0.5,
    1,
    (b) => {
      b.run('triangle', [79, 84, 91], 0.1, 0.4, 0.22)
      b.bells([91, 96], 0.1, 0.9, 0.2, { at: 0.12 })
    },
    { vary: 0.02, rev: 0.35 }
  ),
  orbGet: D(
    2,
    0.2,
    1,
    (b) => {
      b.tone('triangle', 400, 1600, 0.4, 0.24, { a: 0.1, sw: 0.8 })
      b.bells([88, 95, 100], 0.1, 1.0, 0.2, { at: 0.2 })
      b.sparkle(6, 0.2, 0.5, 96, 108, 0.05)
    },
    { vary: 0.02, rev: 0.4 }
  ),

  bossRoar: D(
    1,
    0.8,
    1,
    (b) => {
      b.tone('sawtooth', 100, 62, 1.3, 0.4, { a: 0.15, lp: [500, 900], tr: [32, 0.7], bp: [300, 0.7] })
      b.tone('sawtooth', 130, 80, 1.2, 0.2, { a: 0.15, tr: [26, 0.8], bp: [700, 3] })
      b.nz('bandpass', 300, 600, 1.2, 0.35, { a: 0.3, q: 0.8 })
      boom(b, 0, 80, 30, 0.9, 0.6)
    },
    { rev: 0.3, duck: [0.4, 1.7] }
  ),
  bossCharge: D(
    1,
    0.6,
    1,
    (b) => {
      b.tone('sawtooth', 60, 220, 1.0, 0.3, { a: 0.5, lp: [150, 1500], tr: [14, 0.5] })
      b.nz('bandpass', 200, 1800, 1.0, 0.4, { a: 0.6, q: 1 })
    },
    { duck: [0.15, 1.0] }
  ),
  bossSlam: D(
    1,
    0.5,
    1,
    (b) => {
      boom(b, 0, 85, 24, 1.0, 1.1)
      b.nz('lowpass', 400, 70, 1.1, 0.7)
      crack(b, 0, 0.15, 0.5, 1800)
      b.ticks(10, 0.05, 0.05, 1400, 0.3, 0.03, 0.9)
    },
    { rev: 0.25, duck: [0.45, 1.0] }
  ),
  guardBreak: D(
    1,
    0.3,
    1,
    (b) => {
      b.nz('highpass', 3000, 6000, 0.4, 0.4)
      for (const f of [2200, 3000, 3900, 1700]) b.tone('square', f, f * 0.9, 0.3, 0.1, { at: b.rnd() * 0.04 })
      boom(b, 0, 150, 50, 0.3, 0.8)
      b.bells([88, 81, 74], 0.08, 0.6, 0.15, { at: 0.1 })
    },
    { rev: 0.25, duck: [0.2, 0.5] }
  ),
  bossDie: D(
    1,
    1,
    1,
    (b) => {
      for (let i = 0; i < 5; i++) {
        boom(b, i * 0.28, 120 - i * 10, 36, 0.5, 1 - i * 0.12)
        b.nz('lowpass', 1800, 150, 0.5, 0.5 - i * 0.06, { at: i * 0.28 })
      }
      b.tone('sawtooth', 300, 40, 1.8, 0.2, { lp: [1500, 100] })
      b.bells([62, 66, 69, 74, 78], 0.1, 2, 0.14, { at: 1.5 })
      b.sparkle(10, 1.4, 1.0, 88, 108, 0.05)
    },
    { rev: 0.4, duck: [0.5, 3] }
  ),

  menuMove: D(
    2,
    0.03,
    1,
    (b) => {
      b.tone('triangle', 740, 740, 0.07, 0.2, { a: 0.005 })
      b.tone('sine', 1480, 1480, 0.05, 0.05)
    },
    { vary: 0.015, rev: 0.1 }
  ),
  menuSelect: D(
    2,
    0.05,
    1,
    (b) => {
      b.run('triangle', [72, 79], 0.07, 0.14, 0.24)
      b.run('sine', [84, 91], 0.07, 0.12, 0.08)
    },
    { vary: 0.01, rev: 0.15 }
  ),
  menuBack: D(
    2,
    0.05,
    1,
    (b) => {
      b.run('triangle', [76, 69], 0.07, 0.13, 0.22)
    },
    { vary: 0.01, rev: 0.12 }
  ),
  dialogBlip: D(
    2,
    0.035,
    1,
    (b) => {
      b.tone('square', 520, 500, 0.035, 0.1, { lp: [2500] })
    },
    { vary: 0.12, rev: 0 }
  ),
  signalTick: D(
    2,
    0.1,
    1,
    (b) => {
      b.tone('triangle', 1000, 950, 0.05, 0.3)
      b.nz('bandpass', 3000, 3000, 0.02, 0.1, { q: 2 })
    },
    { vary: 0.01, rev: 0.05 }
  ),
  signalGo: D(
    1,
    0.3,
    1,
    (b) => {
      b.tone('sawtooth', mtof(74), mtof(74), 0.2, 0.14, { lp: [500, 1800] })
      b.tone('sawtooth', mtof(86), mtof(86), 0.35, 0.16, { at: 0.1, lp: [700, 2200] })
      b.bell(79, 0.6, 0.15, { at: 0.1 })
    },
    { vary: 0.01, rev: 0.25 }
  ),
  join: D(
    2,
    0.2,
    1,
    (b) => {
      b.run('triangle', [72, 76, 79], 0.07, 0.2, 0.26)
      b.bell(91, 0.4, 0.1, { at: 0.14 })
    },
    { vary: 0.015, rev: 0.25 }
  ),
  leave: D(
    2,
    0.2,
    1,
    (b) => {
      b.run('triangle', [79, 74, 67], 0.08, 0.2, 0.24)
    },
    { vary: 0.015, rev: 0.25 }
  )
}

/** Plays one effect through `mixer` at context time `when`. Returns its approximate end time, or undefined if skipped. */
export function playSfx(
  mixer: Mixer,
  noise: AudioBuffer,
  name: SfxName,
  when: number,
  opts: { pan?: number; volume?: number; pitch?: number } = {}
): number | undefined {
  const def = SFX_DEFS[name]
  if (!def) return undefined
  const vary = def.vary ?? 0.05
  const pm = (opts.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * vary)
  const vol = def.g * (SFX_TRIM[name] ?? 1) * Math.max(0, Math.min(1, opts.volume ?? 1))
  const b = new SfxBuilder(mixer.ctx, noise, mixer, when, pm, vol, opts.pan ?? 0, def.rev ?? 0.12)
  def.play(b)
  return when + b.end
}

/* ------------------------------------------------------------------------------------------------ loops */

export interface LoopHandle {
  update(opts: { pan?: number; volume?: number; pitch?: number; progress?: number }): void
  stop(): void
}

export function startLoop(mixer: Mixer, noise: AudioBuffer, name: LoopName): LoopHandle {
  const ctx = mixer.ctx
  const now = ctx.currentTime
  const out = ctx.createGain()
  out.gain.value = 0
  const pan = ctx.createStereoPanner()
  out.connect(pan)
  pan.connect(mixer.sfx)
  const sources: Array<OscillatorNode | AudioBufferSourceNode> = []
  let vol = 1
  let level = 0.5
  const nsrc = () => {
    const s = ctx.createBufferSource()
    s.buffer = noise
    s.loop = true
    s.start(0, Math.random())
    sources.push(s)
    return s
  }
  const osc = (type: OscillatorType, f: number) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = f
    o.start()
    sources.push(o)
    return o
  }
  const filt = (type: BiquadFilterType, f: number, q: number) => {
    const x = ctx.createBiquadFilter()
    x.type = type
    x.frequency.value = f
    x.Q.value = q
    return x
  }
  const lfo = (rate: number, depth: number, target: AudioParam, type: OscillatorType = 'sine') => {
    const l = osc(type, rate)
    const g = ctx.createGain()
    g.gain.value = depth
    l.connect(g)
    g.connect(target)
  }
  let progressFn: ((p: number) => void) | undefined

  if (name === 'charge') {
    level = 0.12
    const lp = filt('lowpass', 900, 1)
    const o1 = osc('sawtooth', 220)
    const o2 = osc('sine', 220)
    const g1 = ctx.createGain()
    g1.gain.value = 0.25
    o1.connect(g1)
    g1.connect(lp)
    o2.connect(lp)
    lp.connect(out)
    lfo(9, 30, o1.detune)
    const tg = ctx.createGain()
    tg.gain.value = 0.5
    const n = nsrc()
    const nb = filt('bandpass', 1200, 2)
    n.connect(nb)
    nb.connect(tg)
    tg.connect(out)
    progressFn = (p) => {
      const q = Math.max(0, Math.min(1, p))
      const f = 200 * Math.pow(2, q * 2.4)
      const t = ctx.currentTime
      o1.frequency.setTargetAtTime(f, t, 0.04)
      o2.frequency.setTargetAtTime(f * 2, t, 0.04)
      lp.frequency.setTargetAtTime(700 + q * 2600, t, 0.05)
      nb.frequency.setTargetAtTime(f * 3, t, 0.05)
      tg.gain.setTargetAtTime(0.05 + q * 0.25, t, 0.05)
    }
    progressFn(0)
  } else if (name === 'tornado') {
    level = 0.5
    const n = nsrc()
    const bp = filt('bandpass', 700, 1.1)
    const lp = filt('lowpass', 2200, 0.5)
    n.connect(bp)
    bp.connect(lp)
    lp.connect(out)
    lfo(0.9, 380, bp.frequency)
    lfo(0.37, 0.2, out.gain)
    const o = osc('sawtooth', 90)
    const og = ctx.createGain()
    og.gain.value = 0.04
    const olp = filt('lowpass', 300, 0.8)
    o.connect(olp)
    olp.connect(og)
    og.connect(out)
    lfo(2.3, 12, o.frequency)
  } else if (name === 'wind') {
    level = 0.4
    const n = nsrc()
    const bp = filt('bandpass', 420, 0.7)
    n.connect(bp)
    bp.connect(out)
    lfo(0.17, 180, bp.frequency)
    const n2 = nsrc()
    const bp2 = filt('bandpass', 1500, 1.3)
    const g2 = ctx.createGain()
    g2.gain.value = 0.25
    n2.connect(bp2)
    bp2.connect(g2)
    g2.connect(out)
    lfo(0.11, 500, bp2.frequency)
    lfo(0.23, 0.15, g2.gain)
  } else {
    level = 0.4
    const n = nsrc()
    const lp = filt('lowpass', 1100, 0.6)
    n.connect(lp)
    lp.connect(out)
    lfo(0.4, 250, lp.frequency)
    const n2 = nsrc()
    const bp = filt('bandpass', 2600, 3)
    const g2 = ctx.createGain()
    g2.gain.value = 0.2
    n2.connect(bp)
    bp.connect(g2)
    g2.connect(out)
    lfo(5.3, 0.15, g2.gain)
    lfo(1.7, 700, bp.frequency)
  }

  out.gain.setTargetAtTime(level * vol, now, 0.06)
  let dead = false
  return {
    update(o) {
      if (dead) return
      const t = ctx.currentTime
      if (o.pan !== undefined) pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, o.pan)), t, 0.05)
      if (o.volume !== undefined) vol = Math.max(0, Math.min(1, o.volume))
      if (o.progress !== undefined && progressFn) progressFn(o.progress)
      out.gain.setTargetAtTime(level * vol, t, 0.06)
    },
    stop() {
      if (dead) return
      dead = true
      const t = ctx.currentTime
      out.gain.cancelScheduledValues(t)
      out.gain.setTargetAtTime(0, t, 0.07)
      setTimeout(() => {
        for (const s of sources) {
          try {
            s.stop()
          } catch {
            // Already stopped.
          }
        }
        out.disconnect()
        pan.disconnect()
      }, 500)
    }
  }
}
