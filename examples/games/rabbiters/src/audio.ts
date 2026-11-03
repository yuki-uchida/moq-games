import type { GameState } from './game'

type Observation = {
  time: number
  playerId: string
  pregnant: boolean
  phase: GameState['phase']
  nests: Set<string>
  predators: Map<string, string>
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
  private lastAlarm = -Infinity
  private lastQuery = -Infinity
  private beat = 0

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
    this.lastAlarm = -Infinity
    this.lastQuery = -Infinity
    this.beat = 0
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (muted) this.silence()
    if (this.master) this.master.gain.value = muted ? 0 : 0.12
  }

  update(state: GameState, localPlayerId: string): void {
    if (this.previous && state.time < this.previous.time) return
    const player = state.players.find((entry) => entry.id === localPlayerId)
    const next: Observation = {
      time: state.time,
      playerId: localPlayerId,
      pregnant: player?.pregnant ?? false,
      phase: state.phase,
      nests: new Set(state.nests.filter((nest) => nest.active).map((nest) => nest.id)),
      predators: new Map(state.predators.map((predator) => [predator.id, predator.state])),
      chapter: state.chapter,
      stage: state.stage ?? 3,
      bedding: state.bedding,
      kitsLost: state.kits.filter((kit) => kit.status === 'lost').length
    }
    const previous = this.previous
    this.previous = next
    if (!previous) return
    if (previous.phase === 'playing' && next.phase !== 'playing') {
      this.chime(next.phase === 'won' ? [523, 659, 784, 1047] : [392, 330, 262, 196])
    }
    if (next.phase !== 'playing') return
    if ([...previous.nests].some((id) => !next.nests.has(id))) this.chime([180, 110, 65], 'sawtooth')
    // Any rabbit being spotted is a team-wide cue; "?" only sounds for suspicion aimed at you.
    const changed = (predator: GameState['predators'][number]) => {
      const before = previous.predators.get(predator.id)
      return before !== undefined && before !== predator.state
    }
    if (
      state.predators.some((predator) => predator.state === 'chase' && changed(predator)) &&
      state.time - this.lastAlarm >= 1.5
    ) {
      this.lastAlarm = state.time
      this.alarm()
    } else if (
      state.predators.some(
        (predator) =>
          predator.state === 'suspicious' &&
          predator.targetId === localPlayerId &&
          changed(predator) &&
          previous.predators.get(predator.id) !== 'chase'
      ) &&
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
    const melody = [72, 76, 79, 76, 74, 79, 81, 79, 76, 72, 69, 72, 74, 71, 67, 71]
    const step = this.beat++ % melody.length
    this.tone(440 * 2 ** ((melody[step] - 69) / 12), 0.18, 'sine')
    if (step % 4 === 0) this.tone([131, 147, 110, 98][step / 4], 0.45, 'triangle')
  }

  /** Original "spotted" sting: a low thump, two rising square blips and a ringing tail. */
  private alarm(): void {
    this.tone(110, 0.22, 'triangle', 0, 55, 0.2)
    this.tone(740, 0.07, 'square', 0, 760, 0.06)
    this.tone(1480, 0.09, 'square', 0.07, 1500, 0.06)
    this.tone(1976, 0.45, 'sine', 0.07, 1900, 0.08)
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
    peak = 0.15
  ): void {
    const context = this.context
    if (!context || !this.master || this.muted || context.state !== 'running') return
    try {
      const oscillator = context.createOscillator()
      const envelope = context.createGain()
      const start = context.currentTime + delay
      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, start)
      oscillator.frequency.exponentialRampToValueAtTime(end, start + duration)
      envelope.gain.setValueAtTime(0, start)
      envelope.gain.linearRampToValueAtTime(peak, start + 0.01)
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
