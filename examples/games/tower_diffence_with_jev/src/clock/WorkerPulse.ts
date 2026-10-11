import { CLOCK_PULSE_MS, type ClockCommand, type ClockPulse } from './protocol'

interface PulseScheduler {
  now(): number
  schedule(callback: () => void, delayMs: number): unknown
  cancel(handle: unknown): void
  send(pulse: ClockPulse): void
}

export class WorkerPulse {
  private generation = 0
  private sequence = 0
  private running = false
  private awaitingAck = false
  private timer: unknown
  private disposed = false

  constructor(private readonly scheduler: PulseScheduler) {}

  receive(command: ClockCommand): void {
    if (this.disposed) return
    if (command.type === 'ack') {
      if (
        !this.running ||
        !this.awaitingAck ||
        command.generation !== this.generation ||
        command.sequence !== this.sequence
      )
        return
      this.awaitingAck = false
      this.schedule()
      return
    }
    if (command.generation <= this.generation) return
    this.cancelTimer()
    this.generation = command.generation
    this.sequence = 0
    this.awaitingAck = false
    this.running = command.type === 'start'
    if (this.running) this.schedule()
  }

  dispose(): void {
    this.disposed = true
    this.running = false
    this.awaitingAck = false
    this.cancelTimer()
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) this.scheduler.cancel(this.timer)
    this.timer = undefined
  }

  private schedule(): void {
    const generation = this.generation
    this.timer = this.scheduler.schedule(() => {
      this.timer = undefined
      if (this.disposed || !this.running || this.awaitingAck || generation !== this.generation) return
      this.awaitingAck = true
      this.scheduler.send({
        type: 'tick',
        generation,
        sequence: ++this.sequence,
        nowMs: this.scheduler.now()
      })
    }, CLOCK_PULSE_MS)
  }
}
