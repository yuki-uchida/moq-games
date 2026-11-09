/**
 * Synthesized instruments for the music. Each voice is a short-lived node graph built for one note and
 * connected to `out`; envelopes, filters and (for sustained leads) vibrato make them sound like instruments
 * rather than raw oscillators. Nothing here keeps state, so an OfflineAudioContext renders the same sound.
 */
import type { InstName } from './notation'

export interface VoiceEnv {
  ctx: BaseAudioContext
  out: AudioNode
  noise: AudioBuffer
}

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

/** Playable range per instrument (MIDI), used by the score tests. Drums use General-MIDI-like note numbers. */
export const RANGES: Record<InstName, readonly [number, number]> = {
  strings: [36, 93],
  pizz: [36, 88],
  harp: [36, 100],
  flute: [60, 96],
  oboe: [58, 91],
  clarinet: [50, 94],
  brass: [40, 84],
  horn: [34, 77],
  bell: [60, 108],
  glock: [72, 108],
  celesta: [60, 108],
  musicbox: [60, 108],
  choir: [43, 81],
  pad: [36, 88],
  bass: [28, 67],
  sub: [24, 52],
  timpani: [36, 55],
  kit: [36, 81],
  square: [36, 100],
  pulse: [36, 100],
  tri: [24, 96]
}

/** Instruments whose consecutive notes glide into each other when played legato. */
export const LEGATO: ReadonlySet<InstName> = new Set(['flute', 'oboe', 'clarinet', 'horn', 'brass'])

const pulseWaves = new WeakMap<BaseAudioContext, PeriodicWave>()
function pulseWave(ctx: BaseAudioContext): PeriodicWave {
  let w = pulseWaves.get(ctx)
  if (!w) {
    const n = 48
    const real = new Float32Array(n)
    const imag = new Float32Array(n)
    const duty = 0.25
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty)
    w = ctx.createPeriodicWave(real, imag)
    pulseWaves.set(ctx, w)
  }
  return w
}

function osc(c: VoiceEnv, type: OscillatorType, freq: number, t: number, stop: number, detune = 0): OscillatorNode {
  const o = c.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (detune) o.detune.setValueAtTime(detune, t)
  o.start(t)
  o.stop(stop)
  return o
}

function gain(c: VoiceEnv, v = 0): GainNode {
  const g = c.ctx.createGain()
  g.gain.value = v
  return g
}

function filter(c: VoiceEnv, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = c.ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

function noiseSrc(c: VoiceEnv, t: number, stop: number): AudioBufferSourceNode {
  const s = c.ctx.createBufferSource()
  s.buffer = c.noise
  s.loop = true
  s.start(t, Math.random() * (c.noise.duration - 0.5))
  s.stop(stop)
  return s
}

/** Attack-decay-sustain-release on a gain param; the note is released at t + dur. */
function adsr(g: AudioParam, t: number, peak: number, a: number, d: number, s: number, dur: number, r: number): number {
  const hold = Math.max(dur, a + 0.01)
  g.setValueAtTime(0.0001, t)
  g.linearRampToValueAtTime(peak, t + a)
  g.setTargetAtTime(Math.max(0.0001, peak * s), t + a, d / 3)
  g.setTargetAtTime(0.0001, t + hold, r / 3)
  return t + hold + r * 1.6 + 0.03
}

function vibrato(
  c: VoiceEnv,
  target: AudioParam,
  t: number,
  stop: number,
  rate: number,
  cents: number,
  delay: number
): void {
  const l = osc(c, 'sine', rate, t, stop)
  const lg = gain(c)
  lg.gain.setValueAtTime(0, t)
  lg.gain.setValueAtTime(0, t + delay)
  lg.gain.linearRampToValueAtTime(cents, t + delay + 0.35)
  l.connect(lg)
  lg.connect(target)
}

function freqStart(o: OscillatorNode, t: number, f: number, from?: number): void {
  if (from && from !== f) {
    o.frequency.setValueAtTime(from, t)
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06)
  }
}

/** A stereo panner feeding `c.out`; returns the node to connect a voice into. */
function panTo(c: VoiceEnv, pan: number, out: AudioNode = c.out): AudioNode {
  const p = c.ctx.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  p.connect(out)
  return p
}

/** Keyboard-position pan for plucked and bell-like voices: low notes lean left, high notes right. */
const keyPan = (m: number, centre: number, width: number): number =>
  Math.max(-1, Math.min(1, ((m - centre) / 24) * width))

/** A short filtered noise tick that gives plucked voices a fingernail/pick transient. */
function pluckTick(c: VoiceEnv, t: number, freq: number, level: number, out: AudioNode): void {
  const n = noiseSrc(c, t, t + 0.06)
  const bp = filter(c, 'bandpass', freq, 0.9)
  const g = gain(c)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(level, t + 0.001)
  g.gain.setTargetAtTime(0.0001, t + 0.002, 0.006)
  n.connect(bp)
  bp.connect(g)
  g.connect(out)
}

type Voice = (c: VoiceEnv, t: number, dur: number, midi: number, vel: number, glideFrom?: number) => void

const amp = (v: number) => 0.1 + 0.2 * v * v

const strings: Voice = (c, t, dur, m, v, gf) => {
  const f = mtof(m)
  const g = gain(c)
  const lp = filter(c, 'lowpass', Math.min(9000, f * 3.6 + 1000 + v * 1500), 0.5)
  const stop = adsr(g.gain, t, amp(v) * 0.5, 0.17, 0.4, 0.85, dur, 0.4)
  lp.connect(g)
  g.connect(c.out)
  for (const d of [-11, 0, 11]) {
    const o = osc(c, 'sawtooth', f, t, stop, d)
    freqStart(o, t, f, gf ? mtof(gf) : undefined)
    o.connect(panTo(c, d * 0.05, lp))
    if (d === 0) vibrato(c, o.detune, t, stop, 5.1, 6, 0.3)
  }
}

const pizz: Voice = (c, t, _dur, m, v) => {
  const f = mtof(m)
  const g = gain(c)
  const lp = filter(c, 'lowpass', Math.min(8500, f * 5 + 400), 0.8)
  lp.frequency.setValueAtTime(Math.min(9500, f * 8 + 800), t)
  lp.frequency.exponentialRampToValueAtTime(Math.min(2600, f * 2.4 + 400), t + 0.18)
  const stop = t + 0.7
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(amp(v) * 0.8, t + 0.003)
  g.gain.setTargetAtTime(0.0001, t + 0.004, 0.07)
  osc(c, 'sawtooth', f, t, stop).connect(lp)
  const tr = osc(c, 'triangle', f, t, stop)
  const tg = gain(c, 0.8)
  tr.connect(tg)
  tg.connect(lp)
  lp.connect(g)
  const pn = panTo(c, keyPan(m, 60, 0.6))
  g.connect(pn)
  pluckTick(c, t, 5200, 0.05 * amp(v) * 2, pn)
}

const harp: Voice = (c, t, _dur, m, v) => {
  const f = mtof(m)
  const g = gain(c)
  const lp = filter(c, 'lowpass', 9000, 0.4)
  lp.frequency.setValueAtTime(Math.min(10000, f * 8), t)
  lp.frequency.setTargetAtTime(Math.min(3000, f * 2.4 + 300), t, 0.25)
  const stop = t + 2.4
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(amp(v) * 0.85, t + 0.003)
  g.gain.setTargetAtTime(0.0001, t + 0.004, 0.42)
  osc(c, 'triangle', f, t, stop).connect(lp)
  const h = osc(c, 'sine', f * 2, t, stop)
  const hg = gain(c, 0.3)
  hg.gain.setTargetAtTime(0, t, 0.12)
  h.connect(hg)
  hg.connect(lp)
  const h3 = osc(c, 'sine', f * 3, t, stop)
  const h3g = gain(c, 0.12)
  h3g.gain.setTargetAtTime(0, t, 0.07)
  h3.connect(h3g)
  h3g.connect(lp)
  lp.connect(g)
  const pn = panTo(c, keyPan(m, 66, 0.7))
  g.connect(pn)
  pluckTick(c, t, 4600, 0.035 * amp(v) * 2, pn)
}

const flute: Voice = (c, t, dur, m, v, gf) => {
  const f = mtof(m)
  const stop = t + Math.max(dur, 0.1) + 0.5
  const g = gain(c)
  adsr(g.gain, t, 0.07 + 0.17 * v, gf ? 0.03 : 0.07, 0.2, 0.9, dur, 0.14)
  g.connect(panTo(c, keyPan(m, 78, 0.5)))
  const mix = gain(c, 1)
  mix.connect(g)
  const o1 = osc(c, 'sine', f, t, stop)
  freqStart(o1, t, f, gf ? mtof(gf) : undefined)
  o1.connect(mix)
  const h2 = osc(c, 'sine', f * 2, t, stop)
  const h2g = gain(c, 0.2)
  h2.connect(h2g)
  h2g.connect(mix)
  const h3 = osc(c, 'sine', f * 3, t, stop)
  const h3g = gain(c, 0.05)
  h3.connect(h3g)
  h3g.connect(mix)
  const h4 = osc(c, 'sine', f * 4, t, stop)
  const h4g = gain(c, 0.025)
  h4.connect(h4g)
  h4g.connect(mix)
  vibrato(c, o1.detune, t, stop, 5.3, 13, 0.28)
  const n = noiseSrc(c, t, stop)
  const bp = filter(c, 'bandpass', Math.min(9000, f * 2.2), 2.5)
  const ng = gain(c, 0.0)
  ng.gain.setValueAtTime(0.0001, t)
  ng.gain.linearRampToValueAtTime(0.1, t + 0.03)
  ng.gain.setTargetAtTime(0.02, t + 0.05, 0.08)
  // Airy breath above the harmonics.
  const n2 = noiseSrc(c, t, stop)
  const bp2 = filter(c, 'bandpass', 6200, 0.8)
  const ng2 = gain(c, 0.0001)
  ng2.gain.linearRampToValueAtTime(0.03, t + 0.04)
  ng2.gain.setTargetAtTime(0.012, t + 0.06, 0.1)
  n2.connect(bp2)
  bp2.connect(ng2)
  ng2.connect(mix)
  n.connect(bp)
  bp.connect(ng)
  ng.connect(mix)
}

const oboe: Voice = (c, t, dur, m, v, gf) => {
  const f = mtof(m)
  const stop = t + Math.max(dur, 0.1) + 0.5
  const g = gain(c)
  adsr(g.gain, t, 0.05 + 0.13 * v, 0.045, 0.2, 0.9, dur, 0.1)
  g.connect(c.out)
  const f1 = filter(c, 'peaking', 1150, 1.2)
  f1.gain.value = 9
  const f2 = filter(c, 'peaking', 2700, 1.5)
  f2.gain.value = 5
  const lp = filter(c, 'lowpass', 4200, 0.5)
  const hp = filter(c, 'highpass', 250, 0.5)
  hp.connect(f1)
  f1.connect(f2)
  f2.connect(lp)
  lp.connect(g)
  for (const d of [-5, 5]) {
    const o = osc(c, 'sawtooth', f, t, stop, d)
    freqStart(o, t, f, gf ? mtof(gf) : undefined)
    o.connect(hp)
    if (d > 0) vibrato(c, o.detune, t, stop, 5.6, 14, 0.25)
  }
}

const clarinet: Voice = (c, t, dur, m, v, gf) => {
  const f = mtof(m)
  const stop = t + Math.max(dur, 0.1) + 0.5
  const g = gain(c)
  adsr(g.gain, t, 0.07 + 0.2 * v, 0.035, 0.25, 0.85, dur, 0.1)
  g.connect(c.out)
  const lp = filter(c, 'lowpass', Math.min(3600, f * 3.2 + 300), 0.9)
  lp.connect(g)
  const o = osc(c, 'square', f, t, stop)
  freqStart(o, t, f, gf ? mtof(gf) : undefined)
  const og = gain(c, 0.55)
  o.connect(og)
  og.connect(lp)
  const o2 = osc(c, 'triangle', f, t, stop)
  o2.connect(lp)
  vibrato(c, o.detune, t, stop, 5, 8, 0.4)
}

const brass: Voice = (c, t, dur, m, v, gf) => {
  const f = mtof(m)
  const stop = t + Math.max(dur, 0.1) + 0.4
  const g = gain(c)
  adsr(g.gain, t, 0.06 + 0.15 * v, 0.045, 0.2, 0.88, dur, 0.13)
  g.connect(c.out)
  const lp = filter(c, 'lowpass', 900, 1.1)
  lp.frequency.setValueAtTime(Math.min(2400, f * 1.4 + 200), t)
  lp.frequency.exponentialRampToValueAtTime(Math.min(6500, f * 4 + 900 + v * 800), t + 0.1)
  lp.frequency.setTargetAtTime(Math.min(4200, f * 3 + 600), t + 0.1, 0.25)
  lp.connect(g)
  for (const d of [-6, 6]) {
    const o = osc(c, 'sawtooth', f, t, stop, d)
    freqStart(o, t, f, gf ? mtof(gf) : undefined)
    o.connect(lp)
    if (d > 0) vibrato(c, o.detune, t, stop, 5, 7, 0.45)
  }
}

const horn: Voice = (c, t, dur, m, v, gf) => {
  const f = mtof(m)
  const stop = t + Math.max(dur, 0.1) + 0.6
  const g = gain(c)
  adsr(g.gain, t, 0.07 + 0.17 * v, 0.1, 0.3, 0.9, dur, 0.22)
  g.connect(c.out)
  const lp = filter(c, 'lowpass', Math.min(3200, f * 3.2 + 300), 0.6)
  lp.frequency.setValueAtTime(f * 1.2 + 150, t)
  lp.frequency.exponentialRampToValueAtTime(Math.min(3200, f * 3.2 + 300 + v * 500), t + 0.18)
  lp.connect(g)
  for (const [type, d, k] of [
    ['sawtooth', -4, 0.7],
    ['sawtooth', 5, 0.7],
    ['triangle', 0, 0.8]
  ] as const) {
    const o = osc(c, type, f, t, stop, d)
    freqStart(o, t, f, gf ? mtof(gf) : undefined)
    const og = gain(c, k)
    o.connect(og)
    og.connect(panTo(c, d * 0.08, lp))
    if (d > 0) vibrato(c, o.detune, t, stop, 4.8, 6, 0.5)
  }
}

function fmBell(ratio: number, index: number, decay: number, level: number, hold = 0, partial = 0): Voice {
  return (c, t, _dur, m, v) => {
    const f = mtof(m)
    const stop = t + decay * 3 + 0.1
    const g = gain(c)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(level * amp(v), t + 0.002)
    if (hold) g.gain.setValueAtTime(level * amp(v), t + hold)
    g.gain.setTargetAtTime(0.0001, t + hold + 0.003, decay / 3)
    const car = osc(c, 'sine', f, t, stop)
    const mod = osc(c, 'sine', f * ratio, t, stop)
    const mg = gain(c)
    const peak = f * index * (0.5 + 0.5 * v)
    mg.gain.setValueAtTime(peak, t)
    mg.gain.setTargetAtTime(peak * 0.04, t, decay / 5)
    mod.connect(mg)
    mg.connect(car.frequency)
    car.connect(g)
    if (partial) {
      const p = osc(c, 'sine', f * 2, t, stop)
      const pg = gain(c, partial)
      pg.gain.setTargetAtTime(0, t, decay / 6)
      p.connect(pg)
      pg.connect(g)
    }
    g.connect(panTo(c, keyPan(m, 84, 0.7)))
  }
}

const musicbox: Voice = (c, t, _dur, m, v) => {
  const f = mtof(m)
  const stop = t + 1.6
  const g = gain(c)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.7 * amp(v), t + 0.002)
  g.gain.setTargetAtTime(0.0001, t + 0.004, 0.2)
  osc(c, 'triangle', f, t, stop).connect(g)
  const h = osc(c, 'sine', f * 4.01, t, stop)
  const hg = gain(c, 0.18)
  hg.gain.setTargetAtTime(0, t, 0.05)
  h.connect(hg)
  hg.connect(g)
  g.connect(panTo(c, keyPan(m, 84, 0.7)))
}

const choir: Voice = (c, t, dur, m, v) => {
  const f = mtof(m)
  const stop = t + Math.max(dur, 0.2) + 1.2
  const g = gain(c)
  adsr(g.gain, t, 0.1 + 0.12 * v, 0.32, 0.6, 0.9, dur, 0.55)
  g.connect(c.out)
  const sum = gain(c, 1)
  const formants: Array<[number, number, number]> =
    f < 300
      ? [
          [600, 5, 1],
          [1040, 5, 0.6]
        ]
      : [
          [800, 5, 1],
          [1250, 5, 0.55]
        ]
  for (const [fr, q, k] of formants) {
    const bp = filter(c, 'bandpass', fr, q)
    const bg = gain(c, k * 2.2)
    bp.connect(bg)
    bg.connect(sum)
    for (const d of [-14, 0, 14]) {
      const o = osc(c, 'sawtooth', f, t, stop, d)
      const og = gain(c, 0.33)
      o.connect(og)
      og.connect(panTo(c, d * 0.035, bp))
      if (d === 0) vibrato(c, o.detune, t, stop, 5.2, 9, 0.35)
    }
  }
  const body = osc(c, 'sine', f, t, stop)
  const bg2 = gain(c, 0.35)
  body.connect(bg2)
  bg2.connect(sum)
  sum.connect(g)
}

const pad: Voice = (c, t, dur, m, v) => {
  const f = mtof(m)
  const stop = t + Math.max(dur, 0.2) + 1.6
  const g = gain(c)
  adsr(g.gain, t, 0.07 + 0.1 * v, 0.45, 0.7, 0.9, dur, 0.8)
  g.connect(c.out)
  const lp = filter(c, 'lowpass', Math.min(3600, f * 3.4 + 400), 0.4)
  lp.connect(g)
  for (const [type, d] of [
    ['sawtooth', -9],
    ['sawtooth', 9],
    ['triangle', 0]
  ] as const) {
    const o = osc(c, type, f, t, stop, d)
    const og = gain(c, 0.38)
    o.connect(og)
    og.connect(panTo(c, d * 0.08, lp))
  }
}

const bassInst: Voice = (c, t, dur, m, v) => {
  const f = mtof(m)
  const stop = t + Math.max(dur, 0.1) + 0.4
  const g = gain(c)
  adsr(g.gain, t, 0.22 + 0.22 * v, 0.006, 0.3, 0.6, dur, 0.12)
  g.connect(c.out)
  const lp = filter(c, 'lowpass', 300, 1.3)
  lp.frequency.setValueAtTime(Math.min(1800, 500 + v * 1100), t)
  lp.frequency.setTargetAtTime(Math.max(160, f * 2.2), t, 0.07)
  lp.connect(g)
  const o = osc(c, 'sawtooth', f, t, stop)
  const og = gain(c, 0.55)
  o.connect(og)
  og.connect(lp)
  const sub = osc(c, 'sine', f, t, stop)
  const sg = gain(c, 0.8)
  sub.connect(sg)
  sg.connect(g)
  const tri = osc(c, 'triangle', f * 2, t, stop)
  const tg = gain(c, 0.15)
  tri.connect(tg)
  tg.connect(g)
}

const subInst: Voice = (c, t, dur, m, v) => {
  const f = mtof(m)
  const stop = t + Math.max(dur, 0.1) + 0.5
  const g = gain(c)
  adsr(g.gain, t, 0.25 + 0.2 * v, 0.03, 0.4, 0.9, dur, 0.25)
  g.connect(c.out)
  osc(c, 'sine', f, t, stop).connect(g)
  const o2 = osc(c, 'triangle', f, t, stop)
  const og = gain(c, 0.25)
  o2.connect(og)
  og.connect(g)
}

const timpani: Voice = (c, t, _dur, m, v) => {
  const f = mtof(m)
  const stop = t + 2.2
  const g = gain(c)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.55 * amp(v) * 3, t + 0.004)
  g.gain.setTargetAtTime(0.0001, t + 0.006, 0.28 + (60 - Math.min(60, m)) * 0.012)
  g.connect(c.out)
  const o = osc(c, 'sine', f, t, stop)
  o.frequency.setValueAtTime(f * 1.35, t)
  o.frequency.exponentialRampToValueAtTime(f, t + 0.09)
  o.connect(g)
  const o2 = osc(c, 'sine', f * 1.5, t, stop)
  const o2g = gain(c, 0.25)
  o2g.gain.setTargetAtTime(0, t, 0.08)
  o2.connect(o2g)
  o2g.connect(g)
  const n = noiseSrc(c, t, t + 0.2)
  const nl = filter(c, 'lowpass', 500, 0.7)
  const ng = gain(c, 0.0001)
  ng.gain.linearRampToValueAtTime(0.5 * v, t + 0.002)
  ng.gain.setTargetAtTime(0.0001, t + 0.003, 0.025)
  n.connect(nl)
  nl.connect(ng)
  ng.connect(g)
}

function chip(type: 'square' | 'pulse' | 'tri', level: number): Voice {
  return (c, t, dur, m, v) => {
    const f = mtof(m)
    const stop = t + Math.max(dur, 0.05) + 0.1
    const g = gain(c)
    adsr(g.gain, t, level * amp(v), 0.003, 0.12, 0.65, dur, 0.04)
    g.connect(c.out)
    const o = c.ctx.createOscillator()
    if (type === 'pulse') o.setPeriodicWave(pulseWave(c.ctx))
    else o.type = type === 'square' ? 'square' : 'triangle'
    o.frequency.value = f
    o.start(t)
    o.stop(stop)
    o.connect(g)
  }
}

/* -------------------------------------------------------------------------------------------- drum kit */

function noiseHit(
  c: VoiceEnv,
  t: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
  peak: number,
  decay: number,
  attack = 0.001
): void {
  const s = noiseSrc(c, t, t + decay * 6 + 0.05)
  const f = filter(c, type, freq, q)
  const g = gain(c)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + attack)
  g.gain.setTargetAtTime(0.0001, t + attack, decay / 3)
  s.connect(f)
  f.connect(g)
  g.connect(c.out)
}

function sweepHit(
  c: VoiceEnv,
  t: number,
  f0: number,
  f1: number,
  sweep: number,
  peak: number,
  decay: number,
  type: OscillatorType = 'sine'
): void {
  const o = osc(c, type, f0, t, t + decay * 6 + 0.05)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + sweep)
  const g = gain(c)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + 0.002)
  g.gain.setTargetAtTime(0.0001, t + 0.003, decay / 3)
  o.connect(g)
  g.connect(c.out)
}

const kit: Voice = (c, t, _dur, m, v) => {
  switch (m) {
    case 36:
      sweepHit(c, t, 150, 48, 0.1, 0.95 * v + 0.1, 0.3)
      noiseHit(c, t, 'highpass', 2500, 0.7, 0.12 * v, 0.012)
      break
    case 37:
      sweepHit(c, t, 1750, 1500, 0.02, 0.2 * v, 0.03, 'square')
      noiseHit(c, t, 'bandpass', 2500, 1.5, 0.2 * v, 0.03)
      break
    case 38:
      noiseHit(c, t, 'bandpass', 2300, 0.6, 0.42 * v, 0.14)
      noiseHit(c, t, 'highpass', 5500, 0.7, 0.14 * v, 0.1)
      sweepHit(c, t, 210, 165, 0.05, 0.38 * v, 0.1, 'triangle')
      break
    case 39:
      for (let k = 0; k < 3; k++) noiseHit(c, t + k * 0.011, 'bandpass', 1500, 1.1, 0.3 * v, 0.02 + k * 0.05)
      break
    case 42:
      noiseHit(c, t, 'highpass', 7500, 0.8, 0.19 * v, 0.035)
      break
    case 46:
      noiseHit(c, t, 'highpass', 7000, 0.8, 0.17 * v, 0.2)
      break
    case 49:
      noiseHit(c, t, 'highpass', 4200, 0.7, 0.3 * v, 0.9)
      noiseHit(c, t, 'bandpass', 8000, 0.9, 0.12 * v, 1.4)
      break
    case 51:
      noiseHit(c, t, 'highpass', 8000, 0.9, 0.1 * v, 0.35)
      sweepHit(c, t, 3300, 3300, 0.01, 0.07 * v, 0.4, 'square')
      break
    case 54:
      noiseHit(c, t, 'bandpass', 7500, 1.4, 0.2 * v, 0.07)
      noiseHit(c, t + 0.013, 'bandpass', 8200, 1.4, 0.26 * v, 0.1)
      break
    case 70:
      noiseHit(c, t, 'bandpass', 6200, 1.0, 0.17 * v, 0.05, 0.012)
      break
    case 81: {
      const stop = t + 3
      const g = gain(c)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.14 * v, t + 0.002)
      g.gain.setTargetAtTime(0.0001, t + 0.003, 0.45)
      g.connect(c.out)
      for (const [mul, k] of [
        [1, 1],
        [2.76, 0.55],
        [5.4, 0.3]
      ] as const) {
        const og = gain(c, k)
        osc(c, 'sine', 3300 * mul, t, stop).connect(og)
        og.connect(g)
      }
      break
    }
    case 41:
      sweepHit(c, t, 130, 58, 0.14, 0.95 * v + 0.1, 0.5)
      noiseHit(c, t, 'lowpass', 450, 0.7, 0.35 * v, 0.07)
      noiseHit(c, t, 'bandpass', 1800, 1, 0.1 * v, 0.03)
      break
    case 43:
      sweepHit(c, t, 290, 190, 0.05, 0.55 * v, 0.14)
      noiseHit(c, t, 'bandpass', 2200, 1.2, 0.2 * v, 0.045)
      break
    case 45:
      sweepHit(c, t, 140, 80, 0.12, 0.75 * v, 0.4)
      noiseHit(c, t, 'lowpass', 900, 0.8, 0.1 * v, 0.03)
      break
    case 50:
      sweepHit(c, t, 260, 150, 0.1, 0.65 * v, 0.28)
      noiseHit(c, t, 'bandpass', 2000, 1, 0.08 * v, 0.03)
      break
    default:
      break
  }
}

export const VOICES: Record<InstName, Voice> = {
  strings,
  pizz,
  harp,
  flute,
  oboe,
  clarinet,
  brass,
  horn,
  bell: fmBell(3.51, 2.4, 2.3, 0.5, 0, 0.12),
  glock: fmBell(3.0, 1.5, 1.1, 0.55, 0, 0.1),
  celesta: fmBell(4.0, 0.7, 1.3, 0.62),
  musicbox,
  choir,
  pad,
  bass: bassInst,
  sub: subInst,
  timpani,
  kit,
  square: chip('square', 0.34),
  pulse: chip('pulse', 0.4),
  tri: chip('tri', 0.5)
}

/** A shared 2 s white-noise buffer. */
export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 2)), ctx.sampleRate)
  const d = buf.getChannelData(0)
  let seed = 22222
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    d[i] = (seed / 0xffffffff) * 2 - 1
  }
  return buf
}
