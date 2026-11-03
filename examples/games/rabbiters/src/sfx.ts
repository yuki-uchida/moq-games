import type { JuiceEvent } from './juice-events'

export type UiSound = 'tap' | 'hover' | 'toggle' | 'open' | 'close' | 'start'

const MASTER_GAIN = 0.22
const MAX_VOICES = 24
const BEAT_MS = 545 // ~110 bpm
const MIN_GAP = { step: 0.09, hover: 0.06, taskTick: 0.07, hurt: 0.3 }

type ToneOptions = { delay?: number; attack?: number; peak?: number; detune?: number }
type NoiseOptions = { delay?: number; attack?: number; peak?: number; q?: number }

const vary = (amount: number) => 1 + (Math.random() - 0.5) * 2 * amount
const semitones = (count: number) => 2 ** (count / 12)

/** Synthesized, sample-free action sounds ("juice") for the local rabbit, layered over the BGM in audio.ts. */
export class RabbitersSfx {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private muted = false
  private ends: number[] = []
  private last = { step: -Infinity, hover: -Infinity, taskTick: -Infinity, hurt: -Infinity }
  private footLeft = true
  private chase = false
  private chaseLevel = 0
  private heart: ReturnType<typeof setInterval> | null = null

  start(): void {
    try {
      if (!this.context || this.context.state === 'closed') {
        const Context =
          globalThis.AudioContext ??
          (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Context) return
        this.context = new Context()
        this.master = this.context.createGain()
        this.master.gain.value = this.muted ? 0 : MASTER_GAIN
        const compressor = this.context.createDynamicsCompressor()
        this.master.connect(compressor)
        compressor.connect(this.context.destination)
        this.noise = null
      }
      void this.context.resume().catch(() => {})
      if (this.chase) this.startHeart()
    } catch {
      this.stop()
    }
  }

  stop(): void {
    this.chase = false
    this.stopHeart()
    try {
      this.master?.disconnect()
      void this.context?.close().catch(() => {})
    } catch {}
    this.context = null
    this.master = null
    this.noise = null
    this.ends = []
    this.chaseLevel = 0
    this.last = { step: -Infinity, hover: -Infinity, taskTick: -Infinity, hurt: -Infinity }
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    try {
      if (this.master) this.master.gain.value = muted ? 0 : MASTER_GAIN
    } catch {}
  }

  /** Soft heartbeat while a predator is chasing the local rabbit. */
  setChase(active: boolean): void {
    this.chase = active
    if (active) this.startHeart()
    else this.stopHeart()
  }

  play(event: JuiceEvent): void {
    const context = this.ready()
    if (!context) return
    try {
      this.perform(event, context.currentTime)
    } catch {}
  }

  ui(kind: UiSound): void {
    const context = this.ready()
    if (!context) return
    try {
      const now = context.currentTime
      switch (kind) {
        case 'hover':
          if (now - this.last.hover < MIN_GAP.hover) return
          this.last.hover = now
          this.tone(1800 * vary(0.03), 1900, 0.025, 'sine', { peak: 0.04 })
          break
        case 'tap':
          this.tone(1250 * vary(0.03), 700, 0.06, 'triangle', { peak: 0.2 })
          this.hiss(0.02, 'highpass', 4000, 4000, { peak: 0.1 })
          break
        case 'toggle':
          this.tone(660, 700, 0.06, 'sine', { peak: 0.17 })
          this.tone(990, 1000, 0.09, 'sine', { peak: 0.17, delay: 0.06 })
          break
        case 'open':
          this.hiss(0.2, 'bandpass', 400, 2200, { peak: 0.13, attack: 0.08, q: 0.8 })
          this.tone(380, 760, 0.14, 'sine', { peak: 0.07 })
          break
        case 'close':
          this.hiss(0.16, 'bandpass', 2200, 400, { peak: 0.1, attack: 0.03, q: 0.8 })
          this.tone(700, 350, 0.12, 'sine', { peak: 0.06 })
          break
        case 'start':
          ;[523, 659, 784, 1047].forEach((f, i) => this.pluck(f, i * 0.07, 0.2, 0.4))
          this.shimmer(0.55, 0.28, 0.1)
          break
      }
    } catch {}
  }

  private ready(): AudioContext | null {
    const context = this.context
    if (!context || !this.master || this.muted || context.state !== 'running') return null
    return context
  }

  private perform(event: JuiceEvent, now: number): void {
    switch (event.type) {
      case 'step': {
        if (now - this.last.step < MIN_GAP.step) return
        this.last.step = now
        this.footLeft = !this.footLeft
        const bright = event.sprint ? 1.3 : event.crouch ? 0.8 : 1
        const cutoff = (this.footLeft ? 1000 : 1200) * bright * vary(0.1)
        const peak = (event.sprint ? 0.24 : event.crouch ? 0.06 : 0.13) * vary(0.15)
        this.hiss(0.04, 'lowpass', cutoff, cutoff * 0.6, { peak, attack: 0.004 })
        break
      }
      case 'jump':
        this.tone(300 * vary(0.04), 750, 0.18, 'sine', { peak: 0.22 })
        this.hiss(0.2, 'bandpass', 1200, 3200, { peak: 0.07, attack: 0.05, q: 0.7 })
        break
      case 'land': {
        if (event.impact < 0.08) return
        const k = 0.4 + event.impact * 0.6
        this.tone(140 * vary(0.05), 50, 0.14 + event.impact * 0.1, 'sine', { peak: 0.38 * k })
        this.hiss(0.12 + event.impact * 0.1, 'lowpass', 1600, 500, { peak: 0.2 * k })
        break
      }
      case 'eat': {
        const shift = semitones(Math.min(7, Math.max(0, event.streak - 1)))
        for (let i = 0; i < 3; i++) {
          this.hiss(0.035, 'bandpass', 2600 * vary(0.2), 1800, { delay: i * 0.055, peak: 0.2 * vary(0.2), q: 3 })
        }
        this.tone(880 * shift, 880 * shift, 0.16, 'sine', { delay: 0.12, peak: 0.2 })
        this.tone(1320 * shift, 1320 * shift, 0.22, 'triangle', { delay: 0.18, peak: 0.17 })
        break
      }
      case 'pickup':
        this.tone(420 * vary(0.03), 840, 0.12, 'triangle', { peak: 0.2 })
        this.pluck(1320, 0.07, 0.12, 0.25)
        break
      case 'drop':
        this.tone(520, 260, 0.14, 'triangle', { peak: 0.16 })
        this.hiss(0.06, 'lowpass', 700, 400, { peak: 0.08, delay: 0.1 })
        break
      case 'taskTick': {
        if (now - this.last.taskTick < MIN_GAP.taskTick) return
        this.last.taskTick = now
        const f = (500 + 700 * Math.min(1, Math.max(0, event.progress))) * vary(0.02)
        this.tone(f, f * 0.7, 0.035, 'triangle', { peak: 0.2, attack: 0.002 })
        this.hiss(0.015, 'bandpass', 2500, 2500, { peak: 0.08, q: 2 })
        break
      }
      case 'taskDone':
        this.bell(1319, 0, 0.2)
        this.bell(1760, 0.11, 0.2)
        this.shimmer(0.45, 0.1, 0.1, 0.05)
        break
      case 'hurt':
        if (now - this.last.hurt < MIN_GAP.hurt) return
        this.last.hurt = now
        this.tone(220, 60, 0.18, Math.random() < 0.5 ? 'square' : 'sawtooth', { peak: 0.2 })
        this.hiss(0.14, 'bandpass', 1500, 400, { peak: 0.3, q: 0.9 })
        break
      case 'downed':
        ;[392, 330, 262, 196].forEach((f, i) => {
          this.tone(f, f * 0.94, 0.22, 'triangle', { delay: i * 0.16, peak: 0.2, detune: 8 })
          this.tone(f * 1.01, f * 0.95, 0.22, 'sine', { delay: i * 0.16, peak: 0.1 })
        })
        break
      case 'revived':
        ;[523, 659, 784, 1047, 1319].forEach((f, i) => this.pluck(f, i * 0.07, 0.2, 0.45))
        break
      case 'grown':
        ;[523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.sparkle(f, i * 0.07, 0.17))
        this.shimmer(0.5, 0.2, 0.08)
        break
      case 'pregnant':
        this.sparkle(1047, 0, 0.1)
        break
      case 'escaped':
        this.tone(660, 640, 0.2, 'sine', { peak: 0.2 })
        this.tone(523, 500, 0.32, 'sine', { peak: 0.2, delay: 0.18 })
        this.sparkle(1047, 0.32, 0.12)
        break
      case 'hide':
        this.hiss(0.26, 'bandpass', 2000, 800, { peak: 0.16, attack: 0.05, q: 1.2 })
        break
      case 'unhide':
        this.hiss(0.15, 'bandpass', 800, 2200, { peak: 0.12, attack: 0.02, q: 1.2 })
        break
      case 'talk':
        this.tone(620 * vary(0.04), 900, 0.06, 'sine', { peak: 0.14, attack: 0.004 })
        break
      case 'spotted':
        break
      case 'objective':
      case 'chapter':
      case 'won':
        this.shimmer(0.8, 0.14, 0.3)
        break
      case 'nestBroken':
        this.hiss(0.25, 'lowpass', 1400, 300, { peak: 0.18 })
        break
      case 'bedding':
        this.hiss(0.12, 'bandpass', 1800, 1000, { peak: 0.08, q: 1.2 })
        break
      case 'kitSafe':
        this.sparkle(1568, 0.05, 0.12)
        break
      default:
        break // suspicious, kitLost, lost: audio.ts already says it all
    }
  }

  private startHeart(): void {
    if (this.heart !== null || !this.context) return
    this.heart = setInterval(() => this.beat(), BEAT_MS)
  }

  private stopHeart(): void {
    if (this.heart !== null) clearInterval(this.heart)
    this.heart = null
    this.chaseLevel = 0
  }

  private beat(): void {
    if (!this.chase) return
    this.chaseLevel = Math.min(1, this.chaseLevel + 0.25)
    if (!this.ready()) return
    try {
      const level = this.chaseLevel
      this.tone(72, 46, 0.14, 'sine', { peak: 0.3 * level })
      this.tone(62, 40, 0.16, 'sine', { peak: 0.2 * level, delay: 0.17 })
    } catch {}
  }

  // --- building blocks -------------------------------------------------------------------------------------------

  private pluck(frequency: number, delay: number, peak: number, duration: number): void {
    this.tone(frequency, frequency, duration, 'triangle', { delay, peak, attack: 0.003 })
    this.tone(frequency * 2, frequency * 2, duration * 0.5, 'sine', { delay, peak: peak * 0.3, attack: 0.003 })
  }

  private sparkle(frequency: number, delay: number, peak: number): void {
    this.tone(frequency, frequency, 0.2, 'sine', { delay, peak, attack: 0.004 })
    this.tone(frequency * 2, frequency * 2, 0.1, 'sine', { delay, peak: peak * 0.35, attack: 0.004 })
  }

  private bell(frequency: number, delay: number, peak: number): void {
    this.tone(frequency, frequency, 0.5, 'sine', { delay, peak, attack: 0.003 })
    this.tone(frequency * 2.76, frequency * 2.76, 0.25, 'triangle', { delay, peak: peak * 0.3, detune: 6 })
    this.tone(frequency * 1.003, frequency * 1.003, 0.4, 'triangle', { delay, peak: peak * 0.4, detune: -5 })
  }

  private shimmer(duration: number, peak: number, attack: number, delay = 0): void {
    this.hiss(duration, 'bandpass', 6500, 7500, { peak, attack, delay, q: 2.5 })
  }

  private reserve(duration: number, delay: number): boolean {
    const context = this.context
    if (!context) return false
    const now = context.currentTime
    this.ends = this.ends.filter((end) => end > now)
    if (this.ends.length >= MAX_VOICES) return false
    this.ends.push(now + delay + duration + 0.05)
    return true
  }

  private tone(
    frequency: number,
    end: number,
    duration: number,
    type: OscillatorType,
    { delay = 0, attack = 0.008, peak = 0.15, detune = 0 }: ToneOptions = {}
  ): void {
    const context = this.context
    const master = this.master
    if (!context || !master || !this.reserve(duration, delay)) return
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    const start = context.currentTime + delay
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    if (end !== frequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, end), start + duration)
    if (detune && oscillator.detune) oscillator.detune.setValueAtTime(detune, start)
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(peak, start + attack)
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration)
    oscillator.connect(envelope)
    envelope.connect(master)
    oscillator.onended = () => {
      oscillator.disconnect()
      envelope.disconnect()
    }
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }

  private hiss(
    duration: number,
    filterType: BiquadFilterType,
    from: number,
    to: number,
    { delay = 0, attack = 0.005, peak = 0.15, q = 1 }: NoiseOptions = {}
  ): void {
    const context = this.context
    const master = this.master
    if (!context || !master) return
    const buffer = this.noiseBuffer(context)
    if (!buffer || !this.reserve(duration, delay)) return
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const envelope = context.createGain()
    const start = context.currentTime + delay
    source.buffer = buffer
    filter.type = filterType
    filter.Q.value = q
    filter.frequency.setValueAtTime(from, start)
    if (to !== from) filter.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration)
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(peak, start + Math.min(attack, duration / 2))
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration)
    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(master)
    source.onended = () => {
      source.disconnect()
      filter.disconnect()
      envelope.disconnect()
    }
    const offset = Math.random() * Math.max(0, (buffer.duration || 1.5) - duration - 0.05)
    source.start(start, offset, duration + 0.02)
  }

  private noiseBuffer(context: AudioContext): AudioBuffer | null {
    if (this.noise) return this.noise
    try {
      const length = Math.floor(context.sampleRate * 1.5) || 66150
      const buffer = context.createBuffer(1, length, context.sampleRate || 44100)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      this.noise = buffer
    } catch {
      this.noise = null
    }
    return this.noise
  }
}
