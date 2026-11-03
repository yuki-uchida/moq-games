import type { GameState } from './game'

export class ThreatTracker {
  readonly targets = new Map<string, string>()

  reset(): void {
    this.targets.clear()
  }

  update(state: GameState): void {
    const retained = new Map(this.targets)
    this.reset()
    if (state.phase !== 'playing') return
    for (const predator of state.predators) {
      const target = predator.state === 'search' ? (predator.targetId ?? retained.get(predator.id)) : predator.targetId
      if (target && predator.state !== 'patrol') this.targets.set(predator.id, target)
    }
  }
}

type Observation = {
  time: number
  playerId: string
  pregnant: boolean
  phase: GameState['phase']
  nests: Set<string>
  predators: Map<string, Pick<GameState['predators'][number], 'state' | 'targetId'>>
  threat: 'calm' | 'suspicious' | 'chase'
  chased: Set<string>
  chapter: number
  stage: number
  bedding: number
  kitsLost: number
}

export class RabbitersAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private voices = new Set<OscillatorNode>()
  private muted = false
  private previous: Observation | null = null
  private lastQuery = -Infinity
  private beat = 0
  private musicAfter = 0
  private readonly threats = new ThreatTracker()

  start(): void {
    try {
      if (!this.context || this.context.state === 'closed') {
        const Context =
          globalThis.AudioContext ??
          (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Context) return
        this.context = new Context()
        this.master = this.context.createGain()
        this.master.gain.value = this.muted ? 0 : 0.12
        this.master.connect(this.context.destination)
      }
      void this.context.resume().catch(() => {})
      if (this.timer === null) this.timer = setInterval(() => this.music(), 250)
    } catch {
      this.stop()
    }
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.silence()
    try {
      this.master?.disconnect()
      void this.context?.close().catch(() => {})
    } catch {}
    this.context = null
    this.master = null
    this.previous = null
    this.threats.reset()
    this.lastQuery = -Infinity
    this.beat = 0
    this.musicAfter = 0
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (muted) this.silence()
    if (this.master) this.master.gain.value = muted ? 0 : 0.12
  }

  update(state: GameState, localPlayerId: string): void {
    if (this.previous && state.time < this.previous.time) return
    const player = state.players.find((entry) => entry.id === localPlayerId)
    this.threats.update(state)
    const next: Observation = {
      time: state.time,
      playerId: localPlayerId,
      pregnant: player?.pregnant ?? false,
      phase: state.phase,
      nests: new Set(state.nests.filter((nest) => nest.active).map((nest) => nest.id)),
      predators: new Map(
        state.predators.map((predator) => [predator.id, { state: predator.state, targetId: predator.targetId }])
      ),
      threat: state.predators.some((predator) => predator.state === 'chase')
        ? 'chase'
        : this.threats.targets.size > 0
          ? 'suspicious'
          : 'calm',
      chased: new Set(
        state.predators
          .filter((predator) => predator.state === 'chase' && predator.targetId)
          .map((predator) => predator.targetId!)
      ),
      chapter: state.chapter,
      stage: state.stage ?? 3,
      bedding: state.bedding,
      kitsLost: state.kits.filter((kit) => kit.status === 'lost').length
    }
    const previous = this.previous
    this.previous = next
    if (!previous) return
    if (previous.threat !== next.threat || previous.phase !== next.phase) {
      this.silence()
      this.beat = 0
      this.musicAfter = 0
    }
    if (previous.phase === 'playing' && next.phase !== 'playing') {
      this.chime(next.phase === 'won' ? [523, 659, 784, 1047] : [392, 330, 262, 196])
    }
    if (next.phase !== 'playing') return
    if ([...previous.nests].some((id) => !next.nests.has(id))) this.chime([180, 110, 65], 'sawtooth')
    // Any rabbit being spotted is a team-wide cue; "?" only sounds for suspicion aimed at you.
    if ([...next.chased].some((id) => !previous.chased.has(id))) {
      this.silence()
      this.musicAfter = (this.context?.currentTime ?? 0) + 0.55
      this.alarm()
    } else if (
      state.predators.some((predator) => {
        const before = previous.predators.get(predator.id)
        return (
          predator.state === 'suspicious' &&
          predator.targetId === localPlayerId &&
          before !== undefined &&
          before.state !== 'chase' &&
          (before.state !== 'suspicious' || before.targetId !== localPlayerId)
        )
      }) &&
      state.time - this.lastQuery >= 2
    ) {
      this.lastQuery = state.time
      this.tone(494, 0.12, 'triangle', 0, 520, 0.07)
      this.tone(587, 0.22, 'triangle', 0.11, 659, 0.07)
    }
    if (next.chapter > previous.chapter || next.stage > previous.stage) this.chime([392, 523, 659, 784, 1047])
    else if (next.bedding > previous.bedding) this.chime([587, 784])
    if (next.kitsLost > previous.kitsLost) this.chime([440, 330, 220], 'triangle')
    if (!player || previous.playerId !== localPlayerId) return
    if (!previous.pregnant && next.pregnant) this.chime([523, 659, 880])
  }

  private silence(): void {
    for (const voice of this.voices) {
      try {
        voice.stop()
      } catch {}
      voice.disconnect()
    }
    this.voices.clear()
  }

  private music(): void {
    if (this.previous?.phase !== 'playing') return
    if ((this.context?.currentTime ?? 0) < this.musicAfter) return
    if (this.previous.threat !== 'calm') {
      const step = this.beat++ % 8
      if (this.previous.threat === 'chase') {
        const bass = [98, 98, 104, 98, 98, 92, 104, 92][step]
        this.tone(bass, 0.22, 'triangle', 0, bass, 0.28, 0.6)
        this.tone(bass * 2, 0.1, 'square', 0.125, bass * 2, 0.07, 0.4)
        this.tone(step % 2 === 0 ? 150 : 120, 0.1, 'sine', 0, 48, 0.26)
        if (step % 2 === 1) this.tone(1760, 0.045, 'triangle', 0.125, 880, 0.06)
        if (step === 3 || step === 7) this.tone(587, 0.12, 'sine', 0.125, 740, 0.1, 0.3)
      } else if (step % 2 === 0) {
        this.tone(step % 4 === 0 ? 196 : 208, 0.36, 'sine', 0, 185, 0.14, 0.45)
      }
      return
    }
    const melody = [72, 76, 79, 76, 74, 79, 81, 79, 76, 72, 69, 72, 74, 71, 67, 71]
    const step = this.beat++ % melody.length
    this.tone(440 * 2 ** ((melody[step] - 69) / 12), 0.18, 'sine')
    if (step % 4 === 0) this.tone([131, 147, 110, 98][step / 4], 0.45, 'triangle')
  }

  private alarm(): void {
    this.tone(160, 0.28, 'triangle', 0, 45, 0.36, 0.15)
    this.tone(830, 0.12, 'square', 0, 622, 0.14, 0.35)
    this.tone(1245, 0.17, 'triangle', 0.035, 932, 0.22, 0.4)
    this.tone(466, 0.36, 'sine', 0.16, 698, 0.18, 0.25)
  }

  private chime(notes: number[], type: OscillatorType = 'sine'): void {
    notes.forEach((frequency, index) => this.tone(frequency, 0.16, type, index * 0.09))
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    delay = 0,
    end = frequency,
    peak = 0.15,
    hold = 0
  ): void {
    const context = this.context
    if (!context || !this.master || this.muted || context.state !== 'running' || this.voices.size >= 16) return
    try {
      const oscillator = context.createOscillator()
      const envelope = context.createGain()
      const start = context.currentTime + delay
      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, start)
      oscillator.frequency.exponentialRampToValueAtTime(end, start + duration)
      envelope.gain.setValueAtTime(0, start)
      envelope.gain.linearRampToValueAtTime(Math.min(peak, 0.36), start + 0.01)
      if (hold > 0) envelope.gain.setValueAtTime(Math.min(peak, 0.36), start + duration * hold)
      envelope.gain.exponentialRampToValueAtTime(0.001, start + duration)
      oscillator.connect(envelope)
      envelope.connect(this.master)
      this.voices.add(oscillator)
      oscillator.onended = () => {
        this.voices.delete(oscillator)
        oscillator.disconnect()
        envelope.disconnect()
      }
      oscillator.start(start)
      oscillator.stop(start + duration)
    } catch {}
  }
}
