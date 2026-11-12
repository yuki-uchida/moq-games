/**
 * Drives the host's world while its tab is hidden. Visible tabs step from requestAnimationFrame; hidden tabs get
 * no frames, so a dedicated worker's timer pulses instead (falling back to a main-thread interval, which browsers
 * throttle to about once a second but which still keeps the room alive). Each pulse reports the real seconds since
 * the previous one; the session turns them into fixed steps with a capped backlog.
 */
export interface PulseClock {
  start(): void
  stop(): void
  dispose(): void
}

export class HostClock implements PulseClock {
  private worker?: Worker
  private fallback?: ReturnType<typeof setInterval>
  private failed = false
  private last = 0
  running = false

  constructor(
    private readonly tick: (dt: number) => void,
    private readonly now: () => number = () => performance.now()
  ) {}

  start() {
    if (this.running) return
    this.running = true
    this.last = this.now()
    const worker = this.ensureWorker()
    if (worker) worker.postMessage('start')
    else this.fallback = setInterval(this.pulse, 1000 / 60)
  }

  stop() {
    if (!this.running) return
    this.running = false
    this.worker?.postMessage('stop')
    clearInterval(this.fallback)
    this.fallback = undefined
  }

  dispose() {
    this.stop()
    this.worker?.terminate()
    this.worker = undefined
  }

  private ensureWorker(): Worker | undefined {
    if (this.worker || this.failed) return this.worker
    if (typeof Worker === 'undefined') {
      this.failed = true
      return undefined
    }
    try {
      const worker = new Worker(new URL('./tick-worker.ts', import.meta.url), { type: 'module' })
      worker.addEventListener('message', this.pulse)
      worker.addEventListener('error', this.workerFailed)
      this.worker = worker
    } catch {
      this.failed = true
    }
    return this.worker
  }

  private workerFailed = () => {
    this.failed = true
    this.worker?.terminate()
    this.worker = undefined
    if (this.running && !this.fallback) this.fallback = setInterval(this.pulse, 1000 / 60)
  }

  private pulse = () => {
    if (!this.running) return
    const now = this.now()
    const dt = Math.max(0, (now - this.last) / 1000)
    this.last = now
    if (dt > 0) this.tick(dt)
  }
}
