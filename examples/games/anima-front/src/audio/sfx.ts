/**
 * Every SfxName as layered synthesis, plus the sustained LoopName sounds. The one-shot definitions live in `sfx/`
 * by group; per-name voice limits, cooldowns and loudness trims (`sfx-trim.ts`) keep the set consistent and stop it
 * from stacking. Loop recipes live in `sfx/loops.ts`.
 */
import { SFX, type LoopName, type SfxName } from './api'
import type { Mixer } from './mixer'
import { D, SfxBuilder, type SfxDef } from './sfx-builder'
import { SFX_TRIM } from './sfx-trim'
import { defs as antiques } from './sfx/antiques'
import { defs as foes } from './sfx/foes'
import { defs as gear } from './sfx/gear'
import { defs as match } from './sfx/match'
import { defs as mover } from './sfx/mover'
import { LOOP_DEFS, type LoopKit } from './sfx/loops'

/** Stand-in used until an effect is designed: a short neutral blip. */
const blip: SfxDef = D(3, 0.04, 0.6, (b) => b.tone('triangle', 620, 760, 0.07, 0.3))

/** Effects that have a real design. Everything else falls back to `blip`. */
const DESIGNED: Partial<Record<SfxName, SfxDef>> = { ...antiques, ...gear, ...mover, ...foes, ...match }

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
  const pitch = Number.isFinite(opts.pitch) ? (opts.pitch as number) : 1
  const pm = Math.max(0.25, Math.min(4, pitch)) * (1 + (Math.random() * 2 - 1) * vary)
  const volume = Number.isFinite(opts.volume) ? (opts.volume as number) : 1
  const pan = Number.isFinite(opts.pan) ? (opts.pan as number) : 0
  const vol = def.g * (SFX_TRIM[name] ?? 1) * Math.max(0, Math.min(1, volume))
  const b = new SfxBuilder(mixer.ctx, noise, mixer, when, pm, vol, pan, def.rev ?? 0.12)
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
  const kit: LoopKit = {
    ctx,
    out,
    gain(v) {
      const g = ctx.createGain()
      g.gain.value = v
      return g
    },
    nsrc() {
      const s = ctx.createBufferSource()
      s.buffer = noise
      s.loop = true
      s.start(0, Math.random())
      sources.push(s)
      return s
    },
    osc(type, f) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      o.start()
      sources.push(o)
      return o
    },
    filt(type, f, q) {
      const x = ctx.createBiquadFilter()
      x.type = type
      x.frequency.value = f
      x.Q.value = q
      return x
    },
    lfo(rate, depth, target, type = 'sine') {
      const l = kit.osc(type, rate)
      const g = ctx.createGain()
      g.gain.value = depth
      l.connect(g)
      g.connect(target)
      return l
    }
  }
  const def = LOOP_DEFS[name]
  const level = def?.level ?? 0.3
  const ctl = def?.build(kit) ?? {}
  let vol = 1
  out.gain.setTargetAtTime(level * vol, now, 0.06)
  let dead = false
  return {
    update(o) {
      if (dead) return
      const t = ctx.currentTime
      if (o.pan !== undefined && Number.isFinite(o.pan))
        pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, o.pan)), t, 0.05)
      if (o.volume !== undefined && Number.isFinite(o.volume)) vol = Math.max(0, Math.min(1, o.volume))
      if (o.progress !== undefined && Number.isFinite(o.progress)) ctl.progress?.(Math.max(0, Math.min(1, o.progress)))
      if (o.pitch !== undefined && Number.isFinite(o.pitch)) ctl.pitch?.(Math.max(0.25, Math.min(4, o.pitch)))
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
