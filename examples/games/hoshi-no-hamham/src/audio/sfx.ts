/**
 * Every SfxName as layered synthesis, plus the sustained LoopName sounds. Per-name voice limits, cooldowns and
 * loudness trims (`sfx-trim.ts`) keep the set consistent and stop it from stacking.
 */
import { SFX, type LoopName, type SfxName } from './api'
import type { Mixer } from './mixer'
import { D, SfxBuilder, type SfxDef } from './sfx-builder'
import { SFX_TRIM } from './sfx-trim'

/** Stand-in used until an effect is designed: a short neutral blip. */
const blip: SfxDef = D(3, 0.04, 0.6, (b) => b.tone('triangle', 620, 760, 0.07, 0.3))

/** Effects that have a real design. Everything else falls back to `blip`. */
const DESIGNED: Partial<Record<SfxName, SfxDef>> = {}

export const SFX_DEFS: Record<SfxName, SfxDef> = Object.fromEntries(
  SFX.map((name) => [name, DESIGNED[name] ?? blip])
) as Record<SfxName, SfxDef>

/** Effects still using the stand-in. */
export const pendingSfx = (): SfxName[] => SFX.filter((name) => !DESIGNED[name])

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

  if (name === 'bees') {
    level = 0.22
    const o = osc('sawtooth', 185)
    const o2 = osc('sawtooth', 196)
    const bp = filt('bandpass', 900, 1.4)
    o.connect(bp)
    o2.connect(bp)
    bp.connect(out)
    lfo(31, 0.45, out.gain, 'triangle')
    lfo(3.1, 14, o.frequency)
    lfo(2.3, 11, o2.frequency)
    progressFn = (p) => {
      const q = Math.max(0, Math.min(1, p))
      bp.frequency.setTargetAtTime(700 + q * 900, ctx.currentTime, 0.08)
    }
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
