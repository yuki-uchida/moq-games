/**
 * Life Survivors sound effects and the music bus. Everything is synthesized with Web Audio (no audio files);
 * music.ts plays the background music. Never throws: without an AudioContext (node, tests, old browsers)
 * every call is a silent no-op.
 */
import { MusicPlayer, type MusicCue, type MusicState } from './music'

export type SfxName =
  | 'hit'
  | 'hitStrong'
  | 'crit'
  | 'kill'
  | 'killElite'
  | 'blast'
  | 'enemyShot'
  | 'windup'
  | 'hurt'
  | 'down'
  | 'revive'
  | 'gem'
  | 'meal'
  | 'magnet'
  | 'chest'
  | 'levelUp'
  | 'cardOpen'
  | 'cardHover'
  | 'cardPick'
  | 'evolve'
  | 'stage'
  | 'swarm'
  | 'elite'
  | 'bossWarn'
  | 'bossKill'
  | 'reaper'
  | 'won'
  | 'lost'
  | 'start'

export interface PlayOptions {
  /** -1..1 */
  pan?: number
  /** Volume multiplier, default 1. */
  gain?: number
  /** Pitch multiplier, default 1. */
  rate?: number
}

const STORAGE_KEY = 'life-survivors:sound'
const DEFAULT_VOLUME = 0.7
const MASTER_MAX = 0.9
const DEFAULT_MUSIC_VOLUME = 0.5
const MUSIC_MAX = 0.7
const VOICE_CAP = 28
const FIRE_CAP = 5
const FIRE_INTERVAL = 0.06
const GEM_CHAIN_WINDOW = 0.45

type Tone = OscillatorType
type Storage2 = Pick<Storage, 'getItem' | 'setItem'>

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** One playing sound: a gain node plus helpers that schedule oscillators and noise bursts. */
class Voice {
  /** Seconds (relative to start) until the last scheduled source ends. */
  length = 0
  private pending = 0
  private readonly nodes: AudioNode[] = []
  constructor(
    private readonly ctx: AudioContext,
    private readonly noiseBuffer: AudioBuffer | null,
    readonly dest: AudioNode,
    readonly t0: number,
    /** Pitch multiplier including random variation. */
    readonly r: number,
    private readonly onDone: () => void
  ) {}

  private track(source: AudioScheduledSourceNode, ...extra: AudioNode[]) {
    this.pending++
    this.nodes.push(...extra)
    source.onended = () => {
      for (const node of [source, ...extra]) {
        try {
          node.disconnect()
        } catch {
          /* already gone */
        }
      }
      if (--this.pending <= 0) this.onDone()
    }
  }

  private shape(g: GainNode, at: number, dur: number, vol: number, attack: number) {
    const s = this.t0 + at
    g.gain.setValueAtTime(0.0001, s)
    g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), s + Math.min(attack, dur * 0.9))
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur)
    this.length = Math.max(this.length, at + dur + 0.03)
  }

  /** Pitched oscillator with a pitch glide f0 -> f1 and an attack/exponential-decay envelope. */
  tone(type: Tone, f0: number, f1: number, at: number, dur: number, vol: number, lp = 0, attack = 0.004) {
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    const s = this.t0 + at
    o.type = type
    o.frequency.setValueAtTime(f0 * this.r, s)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * this.r), s + dur)
    this.shape(g, at, dur, vol, attack)
    const extra: AudioNode[] = [g]
    if (lp > 0) {
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(lp, s)
      o.connect(f)
      f.connect(g)
      extra.push(f)
    } else o.connect(g)
    g.connect(this.dest)
    this.track(o, ...extra)
    o.start(s)
    o.stop(s + dur + 0.02)
  }

  /** Filtered noise burst; the filter frequency sweeps fa -> fb. */
  noise(at: number, dur: number, vol: number, type: BiquadFilterType, fa: number, fb = fa, q = 1, attack = 0.003) {
    if (!this.noiseBuffer) return
    const src = this.ctx.createBufferSource()
    const f = this.ctx.createBiquadFilter()
    const g = this.ctx.createGain()
    const s = this.t0 + at
    src.buffer = this.noiseBuffer
    f.type = type
    f.Q.setValueAtTime(q, s)
    f.frequency.setValueAtTime(fa * this.r, s)
    if (fb !== fa) f.frequency.exponentialRampToValueAtTime(Math.max(20, fb * this.r), s + dur)
    this.shape(g, at, dur, vol, attack)
    src.connect(f)
    f.connect(g)
    g.connect(this.dest)
    this.track(src, f, g)
    src.start(s, Math.random() * 0.5, dur + 0.02)
  }

  /** A run of notes (midi) one after another. */
  arp(type: Tone, notes: number[], step: number, dur: number, vol: number, at = 0, lp = 0, attack = 0.004) {
    notes.forEach((m, i) => this.tone(type, hz(m), hz(m), at + i * step, dur, vol, lp, attack))
  }

  /** Inharmonic bell: a few sine partials with long decay. */
  bell(at: number, midi: number, vol: number, dur: number) {
    const f = hz(midi)
    this.tone('sine', f, f, at, dur, vol)
    this.tone('sine', f * 2.76, f * 2.76, at, dur * 0.55, vol * 0.4)
    this.tone('sine', f * 5.4, f * 5.4, at, dur * 0.3, vol * 0.18)
  }

  /** Random high glitter ticks. */
  glitter(at: number, count: number, spacing: number, vol: number, base = 96) {
    for (let i = 0; i < count; i++) {
      const f = hz(base + Math.floor(Math.random() * 12))
      this.tone('sine', f, f, at + i * spacing + Math.random() * 0.02, 0.12, vol)
    }
  }
}

type Recipe = (v: Voice) => void

const SFX: Record<SfxName, Recipe> = {
  hit: (v) => {
    v.tone('triangle', 420, 200, 0, 0.05, 0.16, 1800)
    v.noise(0, 0.025, 0.06, 'bandpass', 2000, 1500)
  },
  hitStrong: (v) => {
    v.tone('square', 900, 500, 0, 0.07, 0.06, 3500)
    v.tone('triangle', 520, 220, 0, 0.09, 0.17)
    v.noise(0, 0.04, 0.08, 'highpass', 3000)
  },
  crit: (v) => {
    v.tone('sine', 2400, 2400, 0, 0.3, 0.12)
    v.tone('sine', 7200, 7200, 0, 0.18, 0.05)
    v.tone('sawtooth', 300, 90, 0, 0.1, 0.12, 1500)
    v.noise(0, 0.08, 0.12, 'bandpass', 1800, 1200, 0.8)
  },
  kill: (v) => {
    v.tone('sine', 700, 160, 0, 0.14, 0.22)
    v.tone('triangle', 1400, 700, 0, 0.05, 0.06)
    v.noise(0, 0.03, 0.12, 'highpass', 4000)
  },
  killElite: (v) => {
    v.tone('sine', 420, 70, 0, 0.28, 0.3)
    v.noise(0, 0.12, 0.16, 'lowpass', 3000, 500)
    v.arp('triangle', [88, 93, 96, 100], 0.05, 0.16, 0.06, 0.06)
  },
  blast: (v) => {
    v.tone('sine', 150, 38, 0, 0.45, 0.5)
    v.tone('triangle', 300, 60, 0, 0.2, 0.2)
    v.noise(0, 0.5, 0.25, 'lowpass', 2500, 200)
  },
  enemyShot: (v) => {
    v.tone('square', 900, 350, 0, 0.12, 0.06, 3000)
    v.tone('sawtooth', 1300, 500, 0, 0.08, 0.035, 3500)
  },
  windup: (v) => {
    for (let i = 0; i < 6; i++) v.tone('sawtooth', 300 + i * 70, 320 + i * 75, i * 0.075, 0.07, 0.07, 1800)
    v.tone('sine', 200, 900, 0, 0.5, 0.05, 0, 0.2)
  },
  hurt: (v) => {
    v.tone('sine', 130, 45, 0, 0.22, 0.45)
    v.tone('sawtooth', 200, 80, 0, 0.12, 0.1, 800)
    v.noise(0, 0.12, 0.28, 'lowpass', 1400, 300)
  },
  down: (v) => {
    v.arp('triangle', [67, 64, 60, 55], 0.18, 0.4, 0.16)
    v.arp('sine', [55, 52, 48, 43], 0.18, 0.45, 0.08)
  },
  revive: (v) => {
    v.arp('triangle', [60, 64, 67, 72, 76], 0.08, 0.3, 0.15)
    v.glitter(0.3, 6, 0.045, 0.045, 98)
  },
  gem: (v) => v.tone('sine', 880, 880, 0, 0.12, 0.12), // replaced by the pitch chain in LifeAudio
  meal: (v) => {
    for (let i = 0; i < 3; i++) {
      v.noise(i * 0.09, 0.06, 0.18, 'bandpass', 700, 300, 1.5)
      v.tone('sine', 220, 120, i * 0.09, 0.06, 0.1)
    }
    v.tone('sine', hz(84), hz(84), 0.3, 0.35, 0.1)
    v.tone('sine', hz(88), hz(88), 0.36, 0.4, 0.09)
  },
  magnet: (v) => {
    v.noise(0, 0.5, 0.22, 'bandpass', 300, 3000, 3, 0.2)
    v.tone('sine', 200, 900, 0, 0.5, 0.08, 0, 0.2)
  },
  chest: (v) => {
    v.arp('triangle', [72, 76, 79, 84, 88, 91], 0.06, 0.3, 0.12)
    v.bell(0.38, 96, 0.1, 0.9)
    v.glitter(0.2, 8, 0.05, 0.035, 100)
  },
  levelUp: (v) => {
    v.arp('triangle', [72, 76, 79, 84, 88, 91], 0.075, 0.35, 0.16)
    v.arp('sine', [60, 64, 67, 72, 76, 79], 0.075, 0.35, 0.07)
    v.tone('sine', hz(103), hz(103), 0.5, 0.35, 0.06)
    v.tone('sine', hz(108), hz(108), 0.58, 0.45, 0.05)
    v.noise(0.4, 0.4, 0.05, 'highpass', 5000)
  },
  cardOpen: (v) => v.noise(0, 0.25, 0.12, 'bandpass', 400, 1800, 1.2, 0.1),
  cardHover: (v) => v.tone('sine', 1800, 2200, 0, 0.025, 0.05),
  cardPick: (v) => {
    v.tone('sine', 220, 110, 0, 0.1, 0.3)
    v.tone('triangle', hz(79), hz(79), 0.05, 0.25, 0.12)
    v.tone('triangle', hz(86), hz(86), 0.1, 0.3, 0.1)
  },
  evolve: (v) => {
    for (const m of [60, 64, 67, 72]) v.tone('sawtooth', hz(m), hz(m) * 1.01, 0, 1.4, 0.07, 1800, 0.6)
    v.noise(0, 0.7, 0.14, 'highpass', 500, 6000, 1, 0.6)
    v.tone('sine', 110, 40, 0.6, 0.7, 0.5)
    v.glitter(0.5, 22, 0.045, 0.05, 96)
  },
  stage: (v) => {
    v.arp('square', [62, 66, 69, 74, 78], 0.09, 0.22, 0.07, 0, 2600)
    v.arp('triangle', [50, 54, 57, 62, 66], 0.09, 0.3, 0.1)
  },
  swarm: (v) => {
    v.tone('sawtooth', 200, 700, 0, 0.9, 0.11, 1500, 0.7)
    v.tone('sawtooth', 212, 740, 0, 0.9, 0.09, 1500, 0.7)
    v.noise(0, 0.9, 0.08, 'bandpass', 400, 2500, 2, 0.7)
  },
  elite: (v) => {
    v.tone('sawtooth', 82, 55, 0, 0.9, 0.2, 500, 0.02)
    v.tone('sine', 55, 50, 0, 0.9, 0.3)
    v.tone('triangle', 220, 220, 0.02, 0.5, 0.05)
    v.tone('triangle', 233, 233, 0.02, 0.5, 0.05)
  },
  bossWarn: (v) => {
    for (let i = 0; i < 3; i++) {
      v.tone('square', 620, 620, i * 0.6, 0.28, 0.08, 2500)
      v.tone('square', 830, 830, i * 0.6 + 0.3, 0.28, 0.08, 2500)
    }
    v.tone('sine', 80, 35, 0, 0.8, 0.5)
  },
  bossKill: (v) => {
    v.tone('sine', 120, 30, 0, 0.8, 0.5)
    v.noise(0, 0.9, 0.3, 'lowpass', 3000, 150)
    v.arp('sawtooth', [60, 64, 67, 72], 0.12, 0.5, 0.08, 0.35, 2500)
    for (const m of [72, 76, 79, 84]) v.tone('triangle', hz(m), hz(m), 0.85, 1.1, 0.08)
    v.glitter(0.9, 10, 0.06, 0.04, 98)
  },
  reaper: (v) => {
    v.bell(0, 45, 0.28, 1.6)
    v.bell(0.9, 45, 0.28, 1.6)
    v.tone('sine', hz(33), hz(33), 0, 1.0, 0.2)
    v.tone('sine', hz(33), hz(33), 0.9, 1.0, 0.2)
  },
  won: (v) => {
    const chords = [
      [60, 64, 67],
      [65, 69, 72],
      [67, 71, 74],
      [72, 76, 79, 84]
    ]
    chords.forEach((chord, i) => {
      for (const m of chord) v.tone('triangle', hz(m), hz(m), i * 0.7, i === 3 ? 1.1 : 0.9, 0.08, 0, 0.04)
      v.tone('sine', hz(chord[0] - 12), hz(chord[0] - 12), i * 0.7, i === 3 ? 1.1 : 0.9, 0.1, 0, 0.04)
    })
  },
  lost: (v) => {
    v.arp('triangle', [69, 67, 64, 62, 57], 0.3, 0.5, 0.15, 0, 0, 0.02)
    v.tone('sine', hz(45), hz(45), 1.2, 0.8, 0.12, 0, 0.05)
  },
  start: (v) => {
    v.arp('triangle', [60, 67, 72], 0.08, 0.25, 0.14)
    v.tone('sine', hz(84), hz(84), 0.24, 0.35, 0.08)
  }
}

/** Weapon activation sounds. `ev` adds the evolved shimmer in `fire`. Kept quiet: they repeat constantly. */
const WEAPON_FIRE: Record<string, Recipe> = {
  // parents
  p_toxic: (v) => {
    v.tone('sine', 140, 90, 0, 0.18, 0.1, 600)
    v.tone('sine', 180, 260, 0.04, 0.06, 0.08) // bubble blip
    v.noise(0, 0.15, 0.06, 'lowpass', 500, 300)
  },
  p_edu: (v) => {
    v.noise(0, 0.14, 0.12, 'bandpass', 500, 2500, 1.2, 0.04)
    v.tone('triangle', 300, 140, 0.1, 0.05, 0.08)
  },
  p_free: (v) => {
    v.tone('square', 900, 1200, 0, 0.05, 0.04, 3000)
    v.tone('square', 1100, 1500, 0.06, 0.05, 0.04, 3000)
    v.tone('square', 1000, 1400, 0.12, 0.05, 0.04, 3000)
  },
  p_weak: (v) => {
    v.tone('sawtooth', 600, 1800, 0, 0.1, 0.06, 2500)
    v.tone('sawtooth', 1800, 900, 0.1, 0.08, 0.05, 2500)
  },
  p_over: (v) => {
    v.tone('sine', 1100, 1100, 0, 0.3, 0.1)
    v.tone('sine', 1100 * 2.76, 1100 * 2.76, 0, 0.12, 0.05)
    v.noise(0, 0.03, 0.08, 'highpass', 3000)
  },
  p_monster: (v) => {
    v.tone('sine', 120, 45, 0, 0.18, 0.28)
    v.noise(0, 0.08, 0.1, 'lowpass', 900, 250)
    v.tone('sine', 110, 45, 0.16, 0.16, 0.18)
  },
  p_rich: (v) => {
    v.noise(0, 0.18, 0.09, 'bandpass', 600, 1800, 1)
    v.tone('sine', 2600, 2600, 0.12, 0.12, 0.05)
    v.tone('sine', 3400, 3400, 0.16, 0.14, 0.04)
  },
  p_yankee: (v) => {
    v.tone('sawtooth', 70, 150, 0, 0.2, 0.1, 600) // a revving growl as it storms off
    v.noise(0, 0.14, 0.1, 'lowpass', 1400, 400)
    v.tone('sine', 150, 50, 0.48, 0.14, 0.26) // the flying kick lands
    v.noise(0.48, 0.06, 0.12, 'lowpass', 1200, 300)
  },
  p_gone: () => {},
  // talents
  w_friend: (v) => {
    v.tone('triangle', 660, 660, 0, 0.07, 0.09)
    v.tone('triangle', 880, 880, 0.07, 0.1, 0.09)
  },
  w_sports: (v) => {
    v.tone('sine', 180, 520, 0, 0.12, 0.16)
    v.tone('sine', 520, 260, 0.12, 0.1, 0.1)
  },
  w_study: (v) => {
    v.tone('triangle', 1400, 700, 0, 0.04, 0.1)
    v.noise(0, 0.04, 0.07, 'highpass', 3500)
  },
  w_love: (v) => {
    v.tone('sine', hz(84), hz(84), 0, 0.22, 0.09)
    v.tone('sine', hz(88), hz(88), 0.07, 0.25, 0.08)
  },
  w_beauty: (v) => {
    v.noise(0, 0.16, 0.1, 'bandpass', 2500, 6000, 1.5)
    v.glitter(0.04, 3, 0.04, 0.03, 100)
  },
  w_hobby: (v) => {
    v.tone('square', 660, 660, 0, 0.05, 0.05, 2500)
    v.tone('square', 990, 990, 0.06, 0.05, 0.05, 2500)
    v.tone('square', 1320, 1320, 0.12, 0.07, 0.05, 2500)
  },
  w_work: (v) => {
    v.noise(0, 0.18, 0.12, 'lowpass', 2500, 500, 0.8, 0.05)
    v.tone('triangle', 200, 120, 0.15, 0.06, 0.1)
  },
  w_invest: (v) => {
    v.tone('sawtooth', 2200, 400, 0, 0.1, 0.06, 4000)
    v.noise(0, 0.05, 0.08, 'highpass', 5000)
    v.tone('square', 1800, 1800, 0.01, 0.025, 0.04, 3500)
    v.tone('square', 2400, 2400, 0.04, 0.025, 0.04, 3500)
  },
  // wave 2 talents
  w_sns: (v) => {
    v.tone('sine', hz(91), hz(91), 0, 0.12, 0.1)
    v.tone('sine', hz(96), hz(96), 0.07, 0.2, 0.1)
  },
  w_pet: (v) => {
    v.tone('sawtooth', 520, 260, 0, 0.08, 0.1, 1500, 0.01)
    v.noise(0, 0.07, 0.07, 'bandpass', 1200, 600, 1.5, 0.01)
  },
  w_muscle: (v) => {
    v.tone('sine', 110, 38, 0, 0.3, 0.45)
    v.noise(0, 0.15, 0.14, 'lowpass', 1500, 200)
  },
  w_reading: (v) => {
    v.noise(0, 0.07, 0.1, 'bandpass', 3000, 1500) // page flip
    v.tone('sine', 440, 440, 0.05, 0.4, 0.05, 0, 0.1)
    v.tone('sine', 660, 660, 0.05, 0.4, 0.035, 0, 0.1)
  },
  w_overtime: (v) => {
    for (let i = 0; i < 3; i++) {
      v.tone('square', 2200, 1200, i * 0.06, 0.02, 0.05, 4000)
      v.noise(i * 0.06, 0.02, 0.07, 'highpass', 4000)
    }
  },
  w_ring: (v) => {
    v.tone('sine', hz(100), hz(100), 0, 0.5, 0.09)
    v.tone('sine', hz(100) * 2.76, hz(100) * 2.76, 0, 0.15, 0.04)
  },
  w_karaoke: (v) => {
    v.noise(0, 0.12, 0.05, 'bandpass', 3200, 3200, 8) // feedback squeal
    v.tone('triangle', hz(67), hz(67), 0.05, 0.3, 0.1, 0, 0.03)
    v.tone('triangle', hz(67) * 1.01, hz(67) * 1.01, 0.05, 0.3, 0.06)
  },
  w_travel: (v) => {
    v.noise(0, 0.22, 0.1, 'bandpass', 1500, 4000, 1.3, 0.06)
    v.tone('sine', 600, 900, 0, 0.2, 0.03, 0, 0.08)
  },
  w_savings: (v) => {
    v.tone('sine', 2800, 2800, 0, 0.1, 0.08)
    v.tone('sine', 3700, 3700, 0.05, 0.14, 0.07)
  },
  w_gamble: (v) => {
    for (let i = 0; i < 5; i++) {
      v.tone('triangle', 900 + ((i * 337) % 600), 500, i * 0.035, 0.03, 0.06, 3000)
      v.noise(i * 0.035, 0.02, 0.05, 'bandpass', 2500, 2000, 2)
    }
  },
  w_perfume: (v) => {
    v.noise(0, 0.16, 0.1, 'highpass', 5500, 7500, 0.7, 0.03)
    v.tone('sine', 1500, 1900, 0.04, 0.12, 0.03)
  },
  w_cooking: (v) => {
    v.noise(0, 0.3, 0.09, 'highpass', 6000, 4000, 0.7, 0.04)
    v.noise(0.05, 0.25, 0.05, 'bandpass', 2500, 2500, 1)
    v.tone('triangle', 700, 700, 0.2, 0.05, 0.04)
  }
}

/** Fallback for unknown weapon ids. */
const GENERIC_FIRE: Recipe = (v) => v.noise(0, 0.12, 0.08, 'bandpass', 600, 1800, 1, 0.04)

/** Adds the bright shimmer of an evolved weapon. */
const EVOLVED_LAYER: Recipe = (v) => {
  v.tone('sine', hz(100), hz(100), 0.02, 0.2, 0.035)
  v.tone('sine', hz(105), hz(105), 0.07, 0.25, 0.03)
  v.noise(0, 0.12, 0.03, 'highpass', 6000)
}

export const hasFireRecipe = (weaponId: string): boolean => weaponId in WEAPON_FIRE

/** [min interval s, max concurrent] per sound. */
const LIMITS: Record<SfxName, [number, number]> = {
  hit: [0.028, 6],
  hitStrong: [0.04, 4],
  crit: [0.05, 3],
  kill: [0.022, 6],
  killElite: [0.12, 2],
  blast: [0.08, 3],
  enemyShot: [0.06, 3],
  windup: [0.2, 2],
  hurt: [0.12, 2],
  down: [0.5, 1],
  revive: [0.5, 1],
  gem: [0.03, 5],
  meal: [0.15, 2],
  magnet: [0.3, 1],
  chest: [0.3, 2],
  levelUp: [0.5, 1],
  cardOpen: [0.08, 2],
  cardHover: [0.04, 2],
  cardPick: [0.1, 1],
  evolve: [0.8, 1],
  stage: [0.8, 1],
  swarm: [0.8, 1],
  elite: [0.4, 1],
  bossWarn: [1, 1],
  bossKill: [1, 1],
  reaper: [1, 1],
  won: [1, 1],
  lost: [1, 1],
  start: [1, 1]
}

/** Per-sound loudness trim and random pitch variation (+-). */
const PITCH_JITTER: Partial<Record<SfxName, number>> = {
  hit: 0.1,
  hitStrong: 0.08,
  crit: 0.05,
  kill: 0.1,
  killElite: 0.06,
  blast: 0.07,
  enemyShot: 0.1,
  hurt: 0.06,
  meal: 0.05,
  cardHover: 0.05
}

/** Stingers the music dips under: [level, seconds]. */
const DUCK: Partial<Record<SfxName, [number, number]>> = {
  levelUp: [0.55, 0.9],
  evolve: [0.4, 1.6],
  chest: [0.55, 1.1],
  stage: [0.5, 0.9],
  swarm: [0.6, 0.9],
  bossWarn: [0.35, 1.6],
  bossKill: [0.35, 2],
  reaper: [0.6, 2.4],
  won: [0.4, 3],
  lost: [0.4, 2.2],
  start: [0.6, 0.6]
}

const GEM_SCALE = [0, 2, 4, 7, 9]
const GEM_STEPS = 15

interface Active {
  key: string
  end: number
}

/**
 * iOS routes Web Audio through the "ambient" session by default, which the silent switch mutes.
 * A game the player explicitly unmuted should be heard, like a video, so ask for playback.
 */
function preferPlaybackSession() {
  try {
    const nav = (globalThis as { navigator?: { audioSession?: { type: string } } }).navigator
    if (nav?.audioSession && nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback'
  } catch {
    /* unsupported */
  }
}

export class LifeAudio {
  private ctx: AudioContext | null = null
  private bus: GainNode | null = null
  private master: GainNode | null = null
  private musicOut: GainNode | null = null
  private player: MusicPlayer | null = null
  private wantedMusic: MusicCue | null = null
  private hidden = false
  private noiseBuffer: AudioBuffer | null = null
  private active: Active[] = []
  private last = new Map<string, number>()
  private gemStep = 0
  private gemAt = -10
  private _muted = false
  private _volume = DEFAULT_VOLUME
  private _musicVolume = DEFAULT_MUSIC_VOLUME
  private beatTimer: ReturnType<typeof setTimeout> | undefined
  private beatLevel = 0
  private readonly storage: Storage2 | undefined

  constructor(storage?: Storage2) {
    this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
    try {
      const raw = this.storage?.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { muted?: unknown; volume?: unknown; music?: unknown }
        this._muted = saved.muted === true
        if (typeof saved.volume === 'number' && Number.isFinite(saved.volume)) {
          this._volume = clamp(saved.volume, 0, 1)
        }
        if (typeof saved.music === 'number' && Number.isFinite(saved.music)) {
          this._musicVolume = clamp(saved.music, 0, 1)
        }
      }
    } catch {
      /* ignore corrupt settings */
    }
  }

  get muted(): boolean {
    return this._muted
  }
  setMuted(muted: boolean): void {
    this._muted = muted
    this.applyMaster()
    this.save()
  }
  get volume(): number {
    return this._volume
  }
  setVolume(volume: number): void {
    this._volume = Number.isFinite(volume) ? clamp(volume, 0, 1) : DEFAULT_VOLUME
    this.applyMaster()
    this.save()
  }
  /** Background music volume, separate from the effects. Mute silences both. */
  get musicVolume(): number {
    return this._musicVolume
  }
  setMusicVolume(volume: number): void {
    this._musicVolume = Number.isFinite(volume) ? clamp(volume, 0, 1) : DEFAULT_MUSIC_VOLUME
    this.applyMaster()
    this.save()
  }

  /** The theme that should be playing (null = silence). Remembered until a context exists; cheap per frame. */
  setMusic(cue: MusicCue | null): void {
    const wanted = this.wantedMusic
    if (cue === wanted || (cue && wanted && cue.theme === wanted.theme && cue.layer === wanted.layer)) return
    this.wantedMusic = cue ? { ...cue } : null
    this.player?.set(this.wantedMusic)
  }
  /** 0..1: low-passes the music (time stopped for a level-up, a mind about to break). */
  setMuffle(amount: number): void {
    this.player?.setMuffle(amount)
  }
  /** A hidden tab queues no music (its timers are throttled); effects are untouched. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden
    this.applyMaster()
  }
  get music(): MusicState {
    return (
      this.player?.state ?? {
        theme: this.wantedMusic?.theme ?? null,
        layer: this.wantedMusic?.layer ?? 0,
        live: 0,
        enabled: false
      }
    )
  }

  unlock(): void {
    try {
      if (!this.ctx) {
        const g = globalThis as unknown as {
          AudioContext?: typeof AudioContext
          webkitAudioContext?: typeof AudioContext
        }
        const Ctor = g.AudioContext ?? g.webkitAudioContext
        if (!Ctor) return
        preferPlaybackSession()
        this.build(new Ctor())
      }
      const ctx = this.ctx
      // iOS also reports 'interrupted' after calls or app switches; both need a gesture resume.
      if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
        void ctx.resume().catch(() => {})
        this.kick(ctx)
      }
    } catch {
      this.ctx = null
    }
  }

  /** Older iOS WebKit only opens the output once a source starts inside the gesture. */
  private kick(ctx: AudioContext) {
    try {
      const source = ctx.createBufferSource()
      source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
      source.connect(ctx.destination)
      source.start(0)
    } catch {
      /* best effort */
    }
  }

  play(name: SfxName, options: PlayOptions = {}): void {
    const recipe = SFX[name]
    if (!recipe) return
    const [interval, cap] = LIMITS[name]
    if (name === 'gem') return this.playGem(options)
    const duck = DUCK[name]
    if (this.start(name, interval, cap, options, PITCH_JITTER[name] ?? 0.04, recipe) && duck)
      this.player?.duck(duck[0], duck[1])
  }

  fire(weaponId: string, options: PlayOptions & { evolved?: boolean } = {}): void {
    const recipe = WEAPON_FIRE[weaponId] ?? GENERIC_FIRE
    if (weaponId === 'p_gone') return
    const evolved = options.evolved === true
    this.start(`fire:${weaponId}`, FIRE_INTERVAL, 2, options, 0.07, (v) => {
      recipe(v)
      if (evolved) EVOLVED_LAYER(v)
    })
  }

  setHeartbeat(level: number): void {
    const next = Number.isFinite(level) ? clamp(level, 0, 1) : 0
    this.beatLevel = next < 0.02 ? 0 : next
    if (this.beatLevel === 0) {
      if (this.beatTimer !== undefined) clearTimeout(this.beatTimer)
      this.beatTimer = undefined
    } else if (this.beatTimer === undefined) this.beat()
  }

  dispose(): void {
    if (this.beatTimer !== undefined) clearTimeout(this.beatTimer)
    this.beatTimer = undefined
    this.beatLevel = 0
    this.active = []
    this.last.clear()
    this.player?.dispose()
    this.player = null
    this.wantedMusic = null
    const ctx = this.ctx
    this.ctx = this.bus = this.master = this.musicOut = this.noiseBuffer = null
    try {
      void ctx?.close().catch(() => {})
    } catch {
      /* already closed */
    }
  }

  private build(ctx: AudioContext) {
    this.ctx = ctx
    const bus = ctx.createGain()
    const comp = ctx.createDynamicsCompressor()
    const master = ctx.createGain()
    comp.threshold.setValueAtTime(-16, ctx.currentTime)
    comp.knee.setValueAtTime(12, ctx.currentTime)
    comp.ratio.setValueAtTime(6, ctx.currentTime)
    comp.attack.setValueAtTime(0.004, ctx.currentTime)
    comp.release.setValueAtTime(0.18, ctx.currentTime)
    bus.connect(comp)
    comp.connect(master)
    master.connect(ctx.destination)
    this.bus = bus
    this.master = master
    try {
      const length = Math.max(1, Math.floor(ctx.sampleRate * 1))
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      this.noiseBuffer = buffer
    } catch {
      this.noiseBuffer = null
    }
    // Music skips the effects compressor so a busy fight never pumps it.
    try {
      const musicOut = ctx.createGain()
      musicOut.connect(ctx.destination)
      this.musicOut = musicOut
      this.player = new MusicPlayer(ctx, musicOut, this.noiseBuffer)
    } catch {
      this.player = null
    }
    this.applyMaster()
    this.player?.set(this.wantedMusic)
  }

  private applyMaster() {
    if (this.master) this.master.gain.value = this._muted ? 0 : this._volume * MASTER_MAX
    if (this.musicOut) this.musicOut.gain.value = this._muted ? 0 : this._musicVolume * MUSIC_MAX
    this.player?.setEnabled(!this._muted && !this.hidden && this._musicVolume > 0)
  }

  private save() {
    try {
      const settings = { muted: this._muted, volume: this._volume, music: this._musicVolume }
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      /* storage unavailable */
    }
  }

  private ready(): AudioContext | null {
    const ctx = this.ctx
    if (!ctx || !this.bus || this._muted || this._volume <= 0 || ctx.state !== 'running') return null
    return ctx
  }

  /** Applies spam limits; returns false when the sound should be skipped. */
  private admit(key: string, interval: number, cap: number, now: number): boolean {
    this.active = this.active.filter((a) => a.end > now)
    if (this.active.length >= VOICE_CAP) return false
    const lastAt = this.last.get(key)
    if (lastAt !== undefined && now - lastAt < interval) return false
    let same = 0
    let fire = 0
    for (const a of this.active) {
      if (a.key === key) same++
      if (a.key.startsWith('fire:')) fire++
    }
    if (same >= cap) return false
    if (key.startsWith('fire:') && fire >= FIRE_CAP) return false
    this.last.set(key, now)
    if (this.last.size > 80) {
      for (const [k, t] of this.last) if (now - t > 2) this.last.delete(k)
    }
    return true
  }

  private start(
    key: string,
    interval: number,
    cap: number,
    options: PlayOptions,
    jitter: number,
    recipe: Recipe,
    pitch = 1
  ): boolean {
    try {
      const ctx = this.ready()
      if (!ctx || !this.bus) return false
      const now = ctx.currentTime
      if (!this.admit(key, interval, cap, now)) return false
      const gain = clamp(options.gain ?? 1, 0, 4)
      const rate = clamp(options.rate ?? 1, 0.25, 4)
      const entry: Active = { key, end: now + 0.3 }
      const out = ctx.createGain()
      out.gain.value = key.startsWith('fire:') ? gain * 0.7 : gain
      let tail: AudioNode = out
      const pan = options.pan
      if (typeof pan === 'number' && Number.isFinite(pan) && typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner()
        panner.pan.value = clamp(pan, -1, 1)
        out.connect(panner)
        tail = panner
      }
      tail.connect(this.bus)
      const r = pitch * rate * (1 + (Math.random() * 2 - 1) * jitter)
      const voice = new Voice(ctx, this.noiseBuffer, out, now + 0.005, r, () => {
        try {
          out.disconnect()
          if (tail !== out) tail.disconnect()
        } catch {
          /* already gone */
        }
      })
      recipe(voice)
      entry.end = now + voice.length + 0.02
      this.active.push(entry)
      return true
    } catch {
      return false
    }
  }

  private playGem(options: PlayOptions) {
    const ctx = this.ready()
    if (!ctx) return
    const now = ctx.currentTime
    const chained = now - this.gemAt <= GEM_CHAIN_WINDOW
    if (!this.admit('gem', LIMITS.gem[0], LIMITS.gem[1], now)) return
    this.gemStep = chained ? Math.min(this.gemStep + 1, GEM_STEPS - 1) : 0
    this.gemAt = now
    const octave = Math.floor(this.gemStep / GEM_SCALE.length)
    const semis = GEM_SCALE[this.gemStep % GEM_SCALE.length] + octave * 12
    const f = 880 * 2 ** (semis / 12)
    this.start('gem', 0, LIMITS.gem[1], options, 0, (v) => {
      v.tone('sine', f, f, 0, 0.14, 0.11)
      v.tone('triangle', f * 2, f * 2, 0, 0.07, 0.04)
    })
  }

  private beat() {
    this.beatTimer = undefined
    if (this.beatLevel <= 0) return
    const level = this.beatLevel
    const bpm = 60 + 70 * level
    this.thump(level)
    this.beatTimer = setTimeout(() => this.beat(), 60000 / bpm)
  }

  private thump(level: number) {
    try {
      const ctx = this.ready()
      if (!ctx || !this.bus) return
      const now = ctx.currentTime
      if (!this.admit('heartbeat', 0.2, 2, now)) return
      const out = ctx.createGain()
      out.gain.value = 0.25 + 0.75 * level
      out.connect(this.bus)
      const voice = new Voice(ctx, this.noiseBuffer, out, now + 0.005, 1, () => {
        try {
          out.disconnect()
        } catch {
          /* already gone */
        }
      })
      voice.tone('sine', 70, 42, 0, 0.14, 0.4)
      voice.tone('sine', 62, 38, 0.15, 0.16, 0.28)
      this.active.push({ key: 'heartbeat', end: now + voice.length })
    } catch {
      /* sound is optional */
    }
  }
}
