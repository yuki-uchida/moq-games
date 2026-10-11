import {
  CLOCK_BACKLOG_LIMIT_MS,
  CLOCK_STEP_SECONDS,
  monotonicTimeMs,
  type ClockCommand,
  type ClockPulse
} from './protocol'

type ClockWorker = Pick<Worker, 'postMessage' | 'terminate' | 'addEventListener' | 'removeEventListener'>

export interface BattleClockCallbacks {
  step(dtSeconds: number): boolean
  discarded(elapsedMs: number): void
  failed(): void
}

export class BattleClock {
  private generation = 0
  private sequence = 0
  private previousMs = 0
  private remainderMs = 0
  private running = false
  private disposed = false

  constructor(
    private readonly worker: ClockWorker,
    private readonly callbacks: BattleClockCallbacks,
    private readonly now: () => number = monotonicTimeMs
  ) {
    worker.addEventListener('message', this.receive)
    worker.addEventListener('error', this.fail)
    worker.addEventListener('messageerror', this.fail)
  }

  start(): void {
    if (this.disposed || this.running) return
    this.running = true
    this.sequence = 0
    this.remainderMs = 0
    this.previousMs = this.now()
    this.send({ type: 'start', generation: ++this.generation })
  }

  stop(): void {
    if (this.disposed || !this.running) return
    this.running = false
    this.remainderMs = 0
    this.send({ type: 'stop', generation: ++this.generation })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.running = false
    this.remainderMs = 0
    this.worker.removeEventListener('message', this.receive)
    this.worker.removeEventListener('error', this.fail)
    this.worker.removeEventListener('messageerror', this.fail)
    this.worker.terminate()
  }

  private send(command: ClockCommand): void {
    this.worker.postMessage(command)
  }

  private fail = (): void => {
    if (this.disposed) return
    this.dispose()
    this.callbacks.failed()
  }

  private receive = (event: MessageEvent<ClockPulse>): void => {
    const pulse = event.data
    if (
      this.disposed ||
      !this.running ||
      pulse?.type !== 'tick' ||
      pulse.generation !== this.generation ||
      pulse.sequence !== this.sequence + 1 ||
      !Number.isFinite(pulse.nowMs)
    )
      return
    this.sequence = pulse.sequence
    try {
      const elapsedMs = Math.max(0, pulse.nowMs - this.previousMs)
      this.previousMs = Math.max(this.previousMs, pulse.nowMs)
      const pendingMs = this.remainderMs + elapsedMs
      this.remainderMs = Math.min(pendingMs, CLOCK_BACKLOG_LIMIT_MS)
      if (pendingMs > CLOCK_BACKLOG_LIMIT_MS) this.callbacks.discarded(pendingMs - CLOCK_BACKLOG_LIMIT_MS)
      const stepMs = CLOCK_STEP_SECONDS * 1000
      const steps = Math.floor((this.remainderMs + 1e-6) / stepMs)
      this.remainderMs = Math.max(0, this.remainderMs - steps * stepMs)
      for (let step = 0; step < steps && this.running && pulse.generation === this.generation; step++) {
        if (!this.callbacks.step(CLOCK_STEP_SECONDS)) this.stop()
      }
    } catch {
      this.fail()
    } finally {
      if (!this.disposed) this.send({ type: 'ack', generation: pulse.generation, sequence: pulse.sequence })
    }
  }
}

export function createBattleClock(callbacks: BattleClockCallbacks): BattleClock {
  return new BattleClock(new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), callbacks)
}
