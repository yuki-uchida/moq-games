export type HorrorCue = 'apparition' | 'blackout' | 'rattle'
export type FootstepSurface = 'tatami' | 'wood'

const MAX_VOLUME = 0.18
const FADE_SECONDS = 0.15
const MAX_VOICES = 4
const FOOTSTEP_INTERVAL = 0.28

type Voice = { source: AudioScheduledSourceNode; nodes: AudioNode[]; cue: boolean }

export class YashikiSound {
  private readonly output: GainNode
  private readonly voices = new Set<Voice>()
  private readonly noise: AudioBuffer
  private ambientTimer: ReturnType<typeof setTimeout> | undefined
  private volume = 0.7
  private muted = false
  private started = false
  private previewing = false
  private disposed = false
  private lastCue = -Infinity
  private lastFootstep = -Infinity
  private generation = 0
  private lastAmbient = -1
  private readonly onStateChange = () => {
    if (this.context.state !== 'running') this.clearVoices()
  }

  constructor(
    private readonly context: AudioContext,
    private readonly onFailure?: (error: unknown) => void
  ) {
    this.output = context.createGain()
    let listenerAttempted = false
    try {
      this.output.gain.setValueAtTime(0, context.currentTime)
      this.output.connect(context.destination)
      listenerAttempted = true
      context.addEventListener('statechange', this.onStateChange)
      this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
      const samples = this.noise.getChannelData(0)
      const math = Math
      let grain = 0.5
      let target = grain
      const grainLength = math.round(context.sampleRate * 0.035)
      for (let index = 0; index < samples.length; index++) {
        if (index % grainLength === 0) target = 0.25 + math.random() * 0.75
        grain += (target - grain) / (context.sampleRate * 0.008)
        samples[index] = (math.random() * 2 - 1) * grain
      }
    } catch (error) {
      if (listenerAttempted) {
        try {
          context.removeEventListener('statechange', this.onStateChange)
        } catch {}
      }
      try {
        this.output.disconnect()
      } catch {}
      throw error
    }
  }

  start(): void {
    this.stopPreview()
    if (this.started || this.disposed) return
    this.started = true
    this.updateVolume()
    this.scheduleAmbient()
  }

  stop(): void {
    this.stopPreview()
    if (!this.started || this.disposed) return
    this.started = false
    this.generation++
    if (this.ambientTimer !== undefined) clearTimeout(this.ambientTimer)
    this.ambientTimer = undefined
    try {
      const now = this.context.currentTime
      this.output.gain.cancelScheduledValues(now)
      this.output.gain.setValueAtTime(0, now)
    } finally {
      this.clearVoices()
      this.lastCue = -Infinity
      this.lastFootstep = -Infinity
      this.lastAmbient = -1
    }
  }

  setVolume(volume: number): void {
    if (this.disposed || !Number.isFinite(volume)) return
    this.volume = Math.max(0, Math.min(1, volume))
    try {
      this.updateVolume()
    } finally {
      if (this.volume === 0) this.clearVoices()
    }
  }

  setMuted(muted: boolean): void {
    if (this.disposed) return
    this.muted = muted
    try {
      this.updateVolume()
    } finally {
      if (muted) this.clearVoices()
    }
  }

  trigger(kind: HorrorCue, ageSeconds = 0): void {
    const duration = kind === 'apparition' ? 2.4 : kind === 'blackout' ? 2.8 : kind === 'rattle' ? 1.2 : 0
    if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds >= duration) return
    if (!this.started || this.disposed || this.muted || this.volume === 0 || this.context.state !== 'running') return
    const now = this.context.currentTime
    if (now - this.lastCue < 0.8 || this.voices.size >= MAX_VOICES || [...this.voices].some((voice) => voice.cue))
      return
    const variation = 0.9 + Math.random() * 0.2
    const side = Math.random() < 0.5 ? -1 : 1
    if (kind === 'apparition')
      this.noiseVoice(720 * variation, duration, 0.14, 'bandpass', true, 0.4 * side, 0.7, false, ageSeconds)
    else if (kind === 'blackout')
      this.noiseVoice(240 * variation, duration, 0.16, 'bandpass', true, 0.12 * side, 2.4, false, ageSeconds)
    else if (kind === 'rattle')
      this.noiseVoice(1100 * variation, duration, 0.14, 'bandpass', true, 0.4 * side, 1.4, true, ageSeconds)
    this.lastCue = now
  }

  footstep(surface: FootstepSurface): void {
    if (surface !== 'tatami' && surface !== 'wood') return
    if (!this.started || this.disposed || this.muted || this.volume === 0 || this.context.state !== 'running') return
    const now = this.context.currentTime
    if (now - this.lastFootstep < FOOTSTEP_INTERVAL || this.voices.size >= MAX_VOICES - 1) return
    this.lastFootstep = now
    if (surface === 'tatami') this.noiseVoice(700, 0.22, 0.065, 'lowpass', false, 0)
    else this.noiseVoice(220, 0.18, 0.075, 'lowpass', false, 0)
  }

  ritualBell(): void {
    if (!this.started || this.disposed || this.muted || this.volume === 0 || this.context.state !== 'running') return
    this.bell()
  }

  get isPreviewing(): boolean {
    return this.previewing
  }

  previewBell(): boolean {
    if (
      this.started ||
      this.previewing ||
      this.disposed ||
      this.muted ||
      this.volume === 0 ||
      this.context.state !== 'running' ||
      this.voices.size !== 0
    )
      return false
    this.previewing = true
    try {
      this.updateVolume()
      this.bell()
      return true
    } catch {
      this.stopPreview()
      return false
    }
  }

  stopPreview(): void {
    if (!this.previewing) return
    this.previewing = false
    try {
      const now = this.context.currentTime
      this.output.gain.cancelScheduledValues(now)
      this.output.gain.setValueAtTime(0, now)
    } catch {}
    this.clearVoices()
  }

  private bell(): void {
    const available = MAX_VOICES - 1 - this.voices.size
    if (available <= 0) return
    this.tone('sine', 1320, 1320, 0.9, 0.045, false, 0, 0.008)
    if (available >= 2) this.tone('sine', 2140, 2140, 0.55, 0.018, false, 0, 0.008)
  }

  dispose(): void {
    if (this.disposed) return
    try {
      this.stop()
    } finally {
      this.disposed = true
      this.context.removeEventListener('statechange', this.onStateChange)
      this.output.disconnect()
    }
  }

  private clearVoices(): void {
    for (const voice of this.voices) {
      voice.source.onended = null
      try {
        voice.source.stop()
      } catch {}
      this.release(voice)
    }
  }

  private updateVolume(): void {
    const now = this.context.currentTime
    this.output.gain.cancelScheduledValues(now)
    this.output.gain.setTargetAtTime(
      (this.started || this.previewing) && !this.muted ? this.volume * MAX_VOLUME : 0,
      now,
      FADE_SECONDS / 3
    )
  }

  private scheduleAmbient(): void {
    const generation = this.generation
    this.ambientTimer = setTimeout(
      () => {
        if (generation !== this.generation || !this.started || this.disposed) return
        this.ambientTimer = undefined
        try {
          if (!this.muted && this.volume > 0 && this.context.state === 'running' && this.voices.size === 0) {
            let choice = Math.floor(Math.random() * 3)
            if (choice === this.lastAmbient) choice = (choice + 1 + Math.floor(Math.random() * 2)) % 3
            this.lastAmbient = choice
            const pan = (0.35 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1)
            if (choice === 0)
              this.noiseVoice(350 + Math.random() * 200, 5 + Math.random() * 3, 0.09, 'lowpass', false, pan)
            else if (choice === 1)
              this.tone('triangle', 110 + Math.random() * 40, 65, 2 + Math.random(), 0.07, false, pan)
            else this.tone('sine', 52 + Math.random() * 12, 48, 6 + Math.random() * 2, 0.08, false, pan)
          }
          if (generation === this.generation && this.started && !this.disposed) this.scheduleAmbient()
        } catch (error) {
          if (!this.onFailure) throw error
          this.onFailure(error)
        }
      },
      (8 + Math.random() * 12) * 1000
    )
  }

  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    level: number,
    cue: boolean,
    pan: number,
    attackSeconds?: number
  ): void {
    const oscillator = this.context.createOscillator()
    const now = this.context.currentTime
    try {
      oscillator.type = type
      oscillator.frequency.setValueAtTime(from, now)
      oscillator.frequency.exponentialRampToValueAtTime(to, now + duration)
    } catch (error) {
      try {
        oscillator.stop()
      } catch {}
      oscillator.disconnect()
      throw error
    }
    this.play(oscillator, [], duration, level, cue, pan, false, undefined, attackSeconds)
  }

  private noiseVoice(
    frequency: number,
    duration: number,
    level: number,
    type: BiquadFilterType,
    cue: boolean,
    pan: number,
    resonance = 0.7,
    pulses = false,
    ageSeconds = 0
  ): void {
    const source = this.context.createBufferSource()
    let filter: BiquadFilterNode | undefined
    let offset: number
    try {
      filter = this.context.createBiquadFilter()
      const now = this.context.currentTime
      source.buffer = this.noise
      source.loop = true
      const playbackRate = 0.85 + Math.random() * 0.3
      source.playbackRate.setValueAtTime(playbackRate, now)
      filter.type = type
      filter.Q.setValueAtTime(resonance, now)
      source.connect(filter)
      const sweep = cue ? 0.8 + Math.random() * 0.15 : 1
      filter.frequency.setValueAtTime(frequency * sweep ** (ageSeconds / duration), now)
      if (cue) filter.frequency.exponentialRampToValueAtTime(frequency * sweep, now + (duration - ageSeconds))
      offset = (Math.random() * this.noise.duration + ageSeconds * playbackRate) % this.noise.duration
    } catch (error) {
      try {
        source.stop()
      } catch {}
      source.disconnect()
      filter?.disconnect()
      throw error
    }
    this.play(source, [filter], duration, level, cue, pan, pulses, offset, undefined, ageSeconds)
  }

  private play(
    source: AudioScheduledSourceNode,
    nodes: AudioNode[],
    duration: number,
    level: number,
    cue: boolean,
    pan: number,
    pulses = false,
    offset?: number,
    attackSeconds?: number,
    ageSeconds = 0
  ): void {
    const now = this.context.currentTime
    const voice = { source, nodes: [...nodes], cue }
    this.voices.add(voice)
    try {
      const envelope = this.context.createGain()
      voice.nodes.push(envelope)
      if (attackSeconds !== undefined) {
        envelope.gain.setValueAtTime(0, now)
        envelope.gain.linearRampToValueAtTime(level, now + attackSeconds)
        envelope.gain.exponentialRampToValueAtTime(level * 0.001, now + duration * 0.9)
        envelope.gain.linearRampToValueAtTime(0, now + duration)
      } else {
        const points: [number, number][] = [[0, 0]]
        if (pulses) {
          const timing = 0.9 + Math.random() * 0.1
          for (const [time, strength] of [
            [0.08, 0.7],
            [0.2, 0.08],
            [0.34, 1],
            [0.48, 0.06],
            [0.6, 0.65],
            [0.73, 0.04],
            [0.84, 0.35]
          ] as const) {
            points.push([duration * time * timing, level * strength])
          }
        } else {
          points.push([Math.min(0.4, duration / 3), level], [duration * 0.65, level * 0.6])
        }
        points.push([duration, 0])
        const next = points.findIndex(([time]) => time > ageSeconds)
        const [fromTime, fromLevel] = points[next - 1]
        const [toTime, toLevel] = points[next]
        envelope.gain.setValueAtTime(
          fromLevel + ((toLevel - fromLevel) * (ageSeconds - fromTime)) / (toTime - fromTime),
          now
        )
        for (const [time, value] of points.slice(next)) {
          envelope.gain.linearRampToValueAtTime(value, now + (time - ageSeconds))
        }
      }
      const panner = this.context.createStereoPanner()
      voice.nodes.push(panner)
      panner.pan.setValueAtTime(pan + ((-pan * 0.35 - pan) * ageSeconds) / duration, now)
      panner.pan.linearRampToValueAtTime(-pan * 0.35, now + (duration - ageSeconds))
      ;(nodes[nodes.length - 1] ?? source).connect(envelope)
      if (ageSeconds > 0) {
        const fade = this.context.createGain()
        voice.nodes.push(fade)
        fade.gain.setValueAtTime(0, now)
        fade.gain.linearRampToValueAtTime(1, now + Math.min(0.005, (duration - ageSeconds) / 2))
        envelope.connect(fade)
        fade.connect(panner)
      } else envelope.connect(panner)
      panner.connect(this.output)
      source.onended = () => this.release(voice)
      if (offset === undefined) source.start(now)
      else (source as AudioBufferSourceNode).start(now, offset)
      source.stop(now + (duration - ageSeconds) + (ageSeconds > 0 ? 0 : 0.01))
    } catch (error) {
      source.onended = null
      try {
        source.stop()
      } catch {}
      this.release(voice)
      throw error
    }
  }

  private release(voice: Voice): void {
    if (!this.voices.delete(voice)) return
    voice.source.onended = null
    voice.source.disconnect()
    for (const node of voice.nodes) node.disconnect()
    if (this.previewing && this.voices.size === 0) this.stopPreview()
  }
}
