import type { GameState } from './game'

type Observation = {
  time: number
  playerId: string
  y: number
  health: number
  foodEaten: number
  pregnant: boolean
  phase: GameState['phase']
  nests: Set<string>
}

export class RabbitersAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private voices = new Set<OscillatorNode>()
  private muted = false
  private previous: Observation | null = null
  private lastHit = -Infinity
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
    this.lastHit = -Infinity
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
      y: player?.y ?? 0,
      health: player?.health ?? 0,
      foodEaten: player?.foodEaten ?? 0,
      pregnant: player?.pregnant ?? false,
      phase: state.phase,
      nests: new Set(state.nests.filter((nest) => nest.active).map((nest) => nest.id))
    }
    const previous = this.previous
    this.previous = next
    if (!previous) return
    if (previous.phase === 'playing' && next.phase !== 'playing') {
      this.chime(next.phase === 'won' ? [523, 659, 784, 1047] : [392, 330, 262, 196])
    }
    if (next.phase !== 'playing') return
    if ([...previous.nests].some((id) => !next.nests.has(id))) this.chime([180, 110, 65], 'sawtooth')
    if (!player || previous.playerId !== localPlayerId) return
    if (previous.y <= 0 && next.y > 0) this.tone(330, 0.14, 'sine', 0, 660)
    if (next.foodEaten > previous.foodEaten) this.chime([880, 1175])
    if (next.health < previous.health && state.time - this.lastHit >= 0.6) {
      this.lastHit = state.time
      this.tone(155, 0.18, 'triangle', 0, 55)
    }
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

  private chime(notes: number[], type: OscillatorType = 'sine'): void {
    notes.forEach((frequency, index) => this.tone(frequency, 0.16, type, index * 0.09))
  }

  private tone(frequency: number, duration: number, type: OscillatorType, delay = 0, end = frequency): void {
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
      envelope.gain.linearRampToValueAtTime(0.15, start + 0.01)
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
