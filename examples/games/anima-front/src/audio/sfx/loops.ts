import type { LoopName } from '../api'

/** The helpers `startLoop` hands to a loop recipe. Every source it creates is stopped when the loop stops. */
export interface LoopKit {
  ctx: BaseAudioContext
  /** The loop's bus: connect the final sound here (its gain is the loop level times the volume option). */
  out: GainNode
  gain(v: number): GainNode
  /** A looping white-noise source. */
  nsrc(): AudioBufferSourceNode
  osc(type: OscillatorType, f: number): OscillatorNode
  filt(type: BiquadFilterType, f: number, q: number): BiquadFilterNode
  /** An oscillator of `rate` Hz scaled by `depth` into `target`. */
  lfo(rate: number, depth: number, target: AudioParam, type?: OscillatorType): OscillatorNode
}

export interface LoopControl {
  /** Called with 0..1 when the caller passes `progress`. */
  progress?: (p: number) => void
  /** Called with a pitch multiplier when the caller passes `pitch`. */
  pitch?: (m: number) => void
}

export interface LoopDef {
  /** Linear loudness of the loop bus (before the volume option). */
  level: number
  build(k: LoopKit): LoopControl | void
}

/** Smoothly moves a parameter (no clicks). */
function to(k: LoopKit, p: AudioParam, v: number, tc = 0.08): void {
  p.setTargetAtTime(v, k.ctx.currentTime, tc)
}

/** Slowly wandering random control signal (low-passed noise) added to `target`; `depth` is in target units. */
function wander(k: LoopKit, rate: number, depth: number, target: AudioParam): void {
  const n = k.nsrc()
  const f = k.filt('lowpass', rate, 0.7)
  const g = k.gain(depth)
  n.connect(f)
  f.connect(g)
  g.connect(target)
}

/** Looped noise through a filter into a gain; returns the gain node. */
function noiseBand(
  k: LoopKit,
  type: BiquadFilterType,
  f: number,
  q: number,
  level: number
): [GainNode, BiquadFilterNode] {
  const n = k.nsrc()
  const fl = k.filt(type, f, q)
  const g = k.gain(level)
  n.connect(fl)
  fl.connect(g)
  return [g, fl]
}

/** Sine thump envelope source: a pulse-train made of an LFO-driven gain on a low oscillator. */
export const LOOP_DEFS: Partial<Record<LoopName, LoopDef>> = {
  eel: {
    level: 0.3,
    build(k) {
      const a = k.osc('sawtooth', 120)
      const b = k.osc('square', 121.7)
      const lp = k.filt('lowpass', 2200, 1.2)
      const amp = k.gain(0.5)
      a.connect(lp)
      b.connect(lp)
      lp.connect(amp)
      wander(k, 30, 1.2, amp.gain)
      k.lfo(7, 0.12, amp.gain)
      const [sz, szf] = noiseBand(k, 'highpass', 4500, 0.7, 0.2)
      wander(k, 40, 0.8, sz.gain)
      const mix = k.gain(0.5)
      amp.connect(mix)
      sz.connect(mix)
      mix.connect(k.out)
      return {
        pitch(m) {
          to(k, a.frequency, 120 * m)
          to(k, b.frequency, 121.7 * m)
          to(k, szf.frequency, 4500 * Math.min(m, 1.5))
        }
      }
    }
  },
  charge: {
    level: 0.32,
    build(k) {
      const a = k.osc('sawtooth', 55)
      const b = k.osc('sawtooth', 55.8)
      const sub = k.osc('sine', 27)
      const lp = k.filt('lowpass', 300, 1.5)
      const g = k.gain(0.5)
      a.connect(lp)
      b.connect(lp)
      lp.connect(g)
      const sg = k.gain(0.5)
      sub.connect(sg)
      const [rum, rf] = noiseBand(k, 'bandpass', 200, 1, 0.5)
      wander(k, 8, 0.25, rum.gain)
      k.lfo(11, 0.08, g.gain)
      const mix = k.gain(0.7)
      g.connect(mix)
      sg.connect(mix)
      rum.connect(mix)
      mix.connect(k.out)
      const set = (p: number, tc: number): void => {
        to(k, a.frequency, 55 + p * 150, tc)
        to(k, b.frequency, 55.8 + p * 152, tc)
        to(k, sub.frequency, 27 + p * 70, tc)
        to(k, lp.frequency, 300 + p * p * 3200, tc)
        to(k, rf.frequency, 200 + p * 900, tc)
        to(k, sg.gain, 0.5 - p * 0.3, tc)
      }
      set(0, 0.01)
      return { progress: (p) => set(p, 0.08) }
    }
  },
  glide: {
    level: 0.22,
    build(k) {
      const [g, f] = noiseBand(k, 'bandpass', 1400, 0.6, 1)
      wander(k, 2.5, 500, f.frequency)
      k.lfo(0.3, 300, f.frequency)
      k.lfo(9, 0.12, g.gain)
      wander(k, 4, 0.35, g.gain)
      const [h, hf] = noiseBand(k, 'highpass', 3500, 0.5, 0.18)
      void hf
      const mix = k.gain(0.6)
      g.connect(mix)
      h.connect(mix)
      mix.connect(k.out)
    }
  },
  hook: {
    level: 0.6,
    build(k) {
      const a = k.osc('sawtooth', 380)
      const b = k.osc('square', 573)
      const bp = k.filt('bandpass', 1500, 4)
      a.connect(bp)
      b.connect(bp)
      const amp = k.gain(0.5)
      bp.connect(amp)
      // Ratchet: a fast pulse on the amplitude.
      k.lfo(14, 0.4, amp.gain, 'square')
      k.lfo(0.7, 120, a.frequency)
      const [w, wf] = noiseBand(k, 'bandpass', 3200, 8, 0.5)
      k.lfo(14, 0.4, w.gain, 'square')
      const tone = k.osc('triangle', 900)
      const tg = k.gain(0.12)
      tone.connect(tg)
      const mix = k.gain(0.45)
      amp.connect(mix)
      w.connect(mix)
      tg.connect(mix)
      mix.connect(k.out)
      const set = (p: number, tc: number): void => {
        to(k, a.frequency, 380 + p * 120, tc)
        to(k, b.frequency, 573 + p * 180, tc)
        to(k, bp.frequency, 1300 + p * 900, tc)
        to(k, wf.frequency, 3000 + p * 1400, tc)
        to(k, tone.frequency, 900 + p * 500, tc)
      }
      set(0, 0.01)
      return { progress: (p) => set(p, 0.08) }
    }
  },
  cloak: {
    level: 0.2,
    build(k) {
      const mix = k.gain(0.5)
      const freqs = [2637, 3136, 4186, 5274]
      freqs.forEach((fr, i) => {
        const o = k.osc('sine', fr)
        const g = k.gain(0.12)
        o.connect(g)
        g.connect(mix)
        k.lfo(0.17 + i * 0.09, 0.1, g.gain)
        k.lfo(0.3 + i * 0.13, 6, o.frequency)
      })
      const [air, af] = noiseBand(k, 'bandpass', 6500, 3, 0.5)
      wander(k, 1.5, 0.3, air.gain)
      void af
      air.connect(mix)
      mix.connect(k.out)
    }
  },
  shield: {
    level: 0.2,
    build(k) {
      const a = k.osc('sawtooth', 100)
      const b = k.osc('sawtooth', 103.5)
      const lp = k.filt('lowpass', 420, 1)
      a.connect(lp)
      b.connect(lp)
      const s = k.osc('sine', 50)
      const sg = k.gain(0.7)
      s.connect(sg)
      const glass = k.osc('sine', 1850)
      const gg = k.gain(0.025)
      glass.connect(gg)
      k.lfo(0.4, 0.015, gg.gain)
      k.lfo(3.5, 0.08, lp.detune, 'sine')
      const mix = k.gain(0.55)
      lp.connect(mix)
      sg.connect(mix)
      gg.connect(mix)
      mix.connect(k.out)
    }
  },
  korogashi: {
    level: 0.45,
    build(k) {
      const [rum, rf] = noiseBand(k, 'lowpass', 300, 1.2, 0.8)
      wander(k, 10, 400, rf.frequency)
      k.lfo(3.5, 0.4, rum.gain)
      const [clat, cf] = noiseBand(k, 'bandpass', 1800, 2, 1.2)
      wander(k, 25, 1.5, clat.gain)
      const tick = k.osc('square', 1300)
      const tf = k.filt('bandpass', 1300, 5)
      const tg = k.gain(0)
      tick.connect(tf)
      tf.connect(tg)
      k.lfo(7, 0.12, tg.gain, 'square')
      const body = k.osc('sine', 62)
      const bg = k.gain(0.5)
      body.connect(bg)
      k.lfo(3.5, 0.25, bg.gain)
      const mix = k.gain(0.6)
      rum.connect(mix)
      clat.connect(mix)
      tg.connect(mix)
      bg.connect(mix)
      mix.connect(k.out)
      return {
        pitch(m) {
          to(k, tick.frequency, 1300 * m)
          to(k, cf.frequency, 1800 * m)
          to(k, body.frequency, 62 * m)
        }
      }
    }
  },
  kagerou: {
    level: 0.8,
    build(k) {
      const [flut, ff] = noiseBand(k, 'bandpass', 900, 1.5, 0)
      flut.gain.value = 0
      k.lfo(50, 0.35, flut.gain)
      k.lfo(4, 0.2, flut.gain)
      wander(k, 6, 150, ff.frequency)
      const buzz = k.osc('sawtooth', 180)
      const bf = k.filt('bandpass', 700, 2)
      const bg = k.gain(0.3)
      buzz.connect(bf)
      bf.connect(bg)
      k.lfo(46, 0.25, bg.gain)
      const whine = k.osc('sine', 3200)
      const wg = k.gain(0.025)
      whine.connect(wg)
      k.lfo(5, 150, whine.frequency)
      k.lfo(0.8, 0.012, wg.gain)
      const mix = k.gain(0.7)
      flut.connect(mix)
      bg.connect(mix)
      wg.connect(mix)
      mix.connect(k.out)
      return {
        pitch(m) {
          to(k, buzz.frequency, 180 * m)
          to(k, whine.frequency, 3200 * m)
        }
      }
    }
  },
  lowAnima: {
    level: 0.22,
    build(k) {
      const o = k.osc('sine', 55)
      const o2 = k.osc('triangle', 82)
      const amp = k.gain(0)
      const lp = k.filt('lowpass', 160, 0.8)
      o.connect(amp)
      o2.connect(amp)
      amp.connect(lp)
      // Two thumps per ~1.1 s: a lub (pulse) and a softer dub offset by 0.28 s using two LFOs with raised cosine shape.
      const lub = k.osc('sine', 1 / 1.1)
      const dub = k.osc('sine', 2 / 1.1)
      const lubG = k.gain(0.28)
      const dubG = k.gain(0.16)
      lub.connect(lubG)
      dub.connect(dubG)
      lubG.connect(amp.gain)
      dubG.connect(amp.gain)
      amp.gain.value = 0.55
      const tone = k.osc('sine', 880)
      const tg = k.gain(0.006)
      tone.connect(tg)
      k.lfo(1 / 1.1, 0.005, tg.gain)
      const mix = k.gain(0.9)
      lp.connect(mix)
      tg.connect(mix)
      mix.connect(k.out)
    }
  },
  ambCity: {
    level: 0.34,
    build(k) {
      const [w, wf] = noiseBand(k, 'bandpass', 380, 0.8, 0.7)
      wander(k, 0.4, 200, wf.frequency)
      wander(k, 0.3, 0.35, w.gain)
      const [wh, whf] = noiseBand(k, 'bandpass', 2400, 14, 0.5)
      wander(k, 0.3, 700, whf.frequency)
      wander(k, 0.2, 0.4, wh.gain)
      const [cr, crf] = noiseBand(k, 'bandpass', 520, 25, 0.5)
      wander(k, 0.15, 260, crf.frequency)
      wander(k, 0.1, 0.8, cr.gain)
      const [hi, hif] = noiseBand(k, 'highpass', 3000, 0.5, 0.05)
      void hif
      wander(k, 0.5, 0.1, hi.gain)
      const mix = k.gain(0.8)
      w.connect(mix)
      wh.connect(mix)
      cr.connect(mix)
      hi.connect(mix)
      mix.connect(k.out)
    }
  },
  ambHarbor: {
    level: 0.5,
    build(k) {
      const [wave, wf] = noiseBand(k, 'lowpass', 800, 0.6, 0.12)
      k.lfo(1 / 8, 150, wf.frequency)
      k.lfo(1 / 8, 0.035, wave.gain)
      const [wave2, wf2] = noiseBand(k, 'lowpass', 900, 0.6, 0.12)
      k.lfo(1 / 7.3, 150, wf2.frequency)
      k.lfo(1 / 7.3, 0.035, wave2.gain)
      const [foam, ff] = noiseBand(k, 'highpass', 2500, 0.6, 0.04)
      void ff
      k.lfo(1 / 8, 0.015, foam.gain)
      const creak = k.osc('sawtooth', 190)
      const cf = k.filt('bandpass', 620, 12)
      const cg = k.gain(0.01)
      creak.connect(cf)
      cf.connect(cg)
      wander(k, 0.3, 35, creak.frequency)
      wander(k, 0.2, 0.012, cg.gain)
      // Distant gull: a quiet sine with a slow vibrato whose level swells rarely.
      const gull = k.osc('sine', 2100)
      const gg = k.gain(0)
      gull.connect(gg)
      wander(k, 0.6, 500, gull.frequency)
      wander(k, 0.15, 0.012, gg.gain)
      const mix = k.gain(0.9)
      wave.connect(mix)
      wave2.connect(mix)
      foam.connect(mix)
      cg.connect(mix)
      gg.connect(mix)
      mix.connect(k.out)
    }
  },
  ambBlight: {
    level: 0.45,
    build(k) {
      const mix = k.gain(0.5)
      const parts: Array<[number, number, number]> = [
        [55, 0.3, 0.2],
        [82.8, 0.22, 0.13],
        [110.6, 0.16, 0.17],
        [1320, 0.035, 0.11],
        [1983, 0.025, 0.07]
      ]
      for (const [fr, lv, rate] of parts) {
        const o = k.osc(fr > 500 ? 'sine' : 'triangle', fr)
        const g = k.gain(lv)
        o.connect(g)
        g.connect(mix)
        k.lfo(rate, lv * 0.15, g.gain)
        k.lfo(rate * 0.7, fr * 0.006, o.frequency)
      }
      const [br, bf] = noiseBand(k, 'bandpass', 500, 1, 0.1)
      k.lfo(1 / 6, 280, bf.frequency)
      k.lfo(1 / 6, 0.07, br.gain)
      br.connect(mix)
      mix.connect(k.out)
    }
  },
  ambVirtual: {
    level: 0.28,
    build(k) {
      const mix = k.gain(0.5)
      const notes = [110, 164.8, 220, 329.6]
      notes.forEach((fr, i) => {
        const o = k.osc(i % 2 ? 'triangle' : 'sine', fr)
        const o2 = k.osc('sine', fr * 1.0012)
        const g = k.gain(0.12)
        o.connect(g)
        const g2 = k.gain(0.4)
        o2.connect(g2)
        g2.connect(g)
        g.connect(mix)
        k.lfo(0.05 + i * 0.03, 0.04, g.gain)
      })
      const [tick, tf] = noiseBand(k, 'bandpass', 5200, 6, 0)
      tick.gain.value = 0
      k.lfo(5.3, 0.012, tick.gain, 'square')
      wander(k, 1, 600, tf.frequency)
      tick.connect(mix)
      mix.connect(k.out)
    }
  }
}
