import type { JuiceEvent } from './juice-events'
import { CUES, soundBank, type CueId } from './sound-bank'

export type UiSound = 'tap' | 'hover' | 'toggle' | 'open' | 'close' | 'start'

const MASTER_GAIN = 1
const MAX_VOICES = 24
const BEAT_MS = 545 // ~110 bpm
const MAX_BEAT_LATENESS_MS = 50
const MIN_GAP = { step: 0.09, hover: 0.06, taskTick: 0.07, hurt: 0.3 }

type PlayOptions = { delay?: number; level?: number; rate?: number; duration?: number }

const vary = (amount: number) => 1 + (Math.random() - 0.5) * 2 * amount
const semitones = (count: number) => 2 ** (count / 12)

/** Recorded action sounds ("juice") for the local rabbit (see sound-bank.ts), layered over the music in audio.ts. */
export class RabbitersSfx {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private muted = false
  private ends: number[] = []
  private last = { step: -Infinity, hover: -Infinity, taskTick: -Infinity, hurt: -Infinity }
  private footLeft = true
  private chase = false
  private chaseSince = 0
  private chaseLevel = 0
  private heart: ReturnType<typeof setTimeout> | null = null
  private readonly heartVoices = new Set<AudioBufferSourceNode>()

  start(): void {
    try {
      if (!this.context || this.context.state === 'closed') {
        const Context =
          globalThis.AudioContext ??
          (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Context) return
        if (this.context) {
          this.stopHeart()
          this.master?.disconnect()
          this.ends = []
          this.last = { step: -Infinity, hover: -Infinity, taskTick: -Infinity, hurt: -Infinity }
        }
        this.context = new Context()
        this.master = this.context.createGain()
        this.master.gain.value = this.muted ? 0 : MASTER_GAIN
        const compressor = this.context.createDynamicsCompressor()
        this.master.connect(compressor)
        compressor.connect(this.context.destination)
        void soundBank(this.context).load()
      }
      void this.context.resume().catch(() => {})
      if (this.chase) {
        if (this.heart !== null) clearTimeout(this.heart)
        this.heart = null
        this.startHeart()
      }
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
    this.ends = []
    this.chaseLevel = 0
    this.last = { step: -Infinity, hover: -Infinity, taskTick: -Infinity, hurt: -Infinity }
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (muted) this.stopHeart()
    else if (this.chase) this.startHeart()
    try {
      if (this.master) this.master.gain.value = muted ? 0 : MASTER_GAIN
    } catch {}
  }

  /** Soft heartbeat while a predator is chasing the local rabbit. */
  setChase(active: boolean): void {
    if (active && !this.chase) this.chaseSince = performance.now()
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
          this.cue('ui-hover', { rate: vary(0.03) })
          break
        case 'tap':
          this.cue('ui-tap', { rate: vary(0.03) })
          break
        case 'toggle':
          this.cue('ui-toggle')
          break
        case 'open':
          this.cue('ui-open')
          break
        case 'close':
          this.cue('ui-close')
          break
        case 'start':
          this.cue('chapter')
          this.cue('sparkle', { delay: 0.2, level: 0.6 })
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
        const level = (event.sprint ? 1.6 : event.crouch ? 0.45 : 1) * vary(0.15)
        const rate = (this.footLeft ? 1 : 1.08) * (event.sprint ? 1.1 : 1) * vary(0.04)
        this.cue('step', { level, rate })
        break
      }
      case 'jump':
        this.cue('jump', { rate: vary(0.04) })
        break
      case 'land':
        if (event.impact < 0.08) return
        this.cue(event.impact > 0.6 ? 'land-heavy' : 'land', { level: 0.4 + event.impact * 0.6, rate: vary(0.05) })
        break
      case 'eat':
        this.cue('chew', { rate: vary(0.06), duration: 0.7 })
        this.cue('coin', { delay: 0.12, rate: semitones(Math.min(7, Math.max(0, event.streak - 1))) })
        break
      case 'pickup':
        this.cue('pickup', { rate: vary(0.03) })
        break
      case 'drop':
        this.cue('drop')
        break
      case 'taskTick':
        if (now - this.last.taskTick < MIN_GAP.taskTick) return
        this.last.taskTick = now
        this.cue('task-tick', { rate: (0.8 + 0.6 * Math.min(1, Math.max(0, event.progress))) * vary(0.02) })
        break
      case 'taskDone':
        this.cue('task-done')
        break
      case 'hurt':
        if (now - this.last.hurt < MIN_GAP.hurt) return
        this.last.hurt = now
        this.cue('hurt', { rate: vary(0.05) })
        break
      case 'downed':
        this.cue('downed')
        break
      case 'revived':
        this.cue('bloom', { level: 0.8 })
        break
      case 'grown':
        this.cue('grown')
        break
      case 'pregnant':
        this.cue('sparkle', { level: 0.6 })
        break
      case 'escaped':
        this.cue('escaped')
        break
      case 'hide':
        this.cue('hide')
        break
      case 'unhide':
        this.cue('unhide')
        break
      case 'talk':
        this.cue('talk', { rate: vary(0.04) })
        break
      case 'spotted':
        break
      case 'objective':
      case 'chapter':
      case 'won':
        this.cue('reveal')
        break
      case 'nestBroken':
        this.cue('rustle', { rate: 0.85 })
        break
      case 'bedding':
        this.cue('rustle', { level: 0.6, rate: 1.15 })
        break
      case 'kitSafe':
        this.cue('sparkle', { delay: 0.05, rate: semitones(5) })
        break
      default:
        break // suspicious, kitLost, lost: audio.ts already says it all
    }
  }

  private startHeart(): void {
    if (this.heart !== null || !this.context || this.muted || !this.chase) return
    const elapsed = performance.now() - this.chaseSince
    this.heart = setTimeout(
      () => {
        this.heart = null
        if ((performance.now() - this.chaseSince) % BEAT_MS < MAX_BEAT_LATENESS_MS) this.beat()
        this.startHeart()
      },
      Math.ceil(BEAT_MS - (elapsed % BEAT_MS))
    )
  }

  private stopHeart(): void {
    if (this.heart !== null) clearTimeout(this.heart)
    this.heart = null
    this.chaseLevel = 0
    for (const voice of this.heartVoices) {
      try {
        voice.stop()
      } catch {}
      try {
        voice.disconnect()
      } catch {}
    }
    this.heartVoices.clear()
  }

  private beat(): void {
    if (!this.chase) return
    this.chaseLevel = Math.min(1, this.chaseLevel + 0.25)
    if (!this.ready()) return
    try {
      const beat = this.cue('heartbeat', { level: this.chaseLevel })
      if (beat) this.heartVoices.add(beat)
    } catch {}
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

  /** Plays a recorded cue; `duration` cuts it short with a quick fade. */
  private cue(
    id: CueId,
    { delay = 0, level = 1, rate = 1, duration }: PlayOptions = {}
  ): AudioBufferSourceNode | undefined {
    const context = this.context
    const master = this.master
    if (!context || !master) return
    const buffer = soundBank(context).get(id)
    if (!buffer) return
    const cut = duration !== undefined && duration < buffer.duration ? duration : undefined
    if (!this.reserve((cut ?? buffer.duration) / rate, delay)) return
    const source = context.createBufferSource()
    const gain = context.createGain()
    const start = context.currentTime + delay
    source.buffer = buffer
    source.playbackRate.value = rate
    gain.gain.setValueAtTime(CUES[id].gain * level, start)
    if (cut !== undefined) gain.gain.setTargetAtTime(0, start + (cut * 0.8) / rate, (cut * 0.05) / rate)
    source.connect(gain)
    gain.connect(master)
    source.onended = () => {
      this.heartVoices.delete(source)
      source.disconnect()
      gain.disconnect()
    }
    if (cut !== undefined) source.start(start, 0, cut)
    else source.start(start)
    return source
  }
}
