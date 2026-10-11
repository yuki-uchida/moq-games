import type { Clock } from './contracts'

export interface TransportEvent {
  type: 'hit' | 'release'
  atMs: number
  epoch: number
  cycle: number
}
export function frameAt(clock: Clock, timeMs: number): number {
  const starts = clock.frameStartTimesMs
  let low = 0,
    high = starts.length
  const tolerance = Math.min(1e-6, clock.durationMs / Math.max(1, starts.length) / 1e9)
  while (low < high) {
    const mid = (low + high) >>> 1
    if (starts[mid] <= timeMs + tolerance) low = mid + 1
    else high = mid
  }
  return Math.max(0, low - 1)
}
export function validateClock(clock: Clock): void {
  if (
    !Number.isFinite(clock.durationMs) ||
    clock.durationMs <= 0 ||
    clock.durationMs > 10_000 ||
    !clock.frameStartTimesMs.length ||
    clock.frameStartTimesMs[0] !== 0
  )
    throw new Error('Invalid clip clock')
  clock.frameStartTimesMs.forEach((time, index) => {
    if (
      !Number.isFinite(time) ||
      time < 0 ||
      time >= clock.durationMs ||
      (index > 0 && time <= clock.frameStartTimesMs[index - 1])
    )
      throw new Error('Invalid frame starts')
  })
  if (
    clock.events.some(
      (event) =>
        !Number.isFinite(event.atMs) ||
        event.atMs < 0 ||
        event.atMs >= clock.durationMs ||
        !['hit', 'release'].includes(event.type)
    )
  )
    throw new Error('Invalid clip event')
}
export class Transport {
  clock: Clock | null = null
  speed = 1
  paused = true
  timeMs = 0
  epoch = 0
  private absoluteMs = 0
  private lastWallMs: number | null = null
  configure(clock: Clock | null): void {
    if (clock) validateClock(clock)
    this.clock = clock
    this.seek(0)
  }
  play(nowMs: number): void {
    if (!this.clock) return
    if (!this.clock.loop && this.timeMs >= this.clock.durationMs) this.seek(0)
    this.paused = false
    this.lastWallMs = nowMs
  }
  pause(): void {
    this.paused = true
    this.lastWallMs = null
  }
  seek(timeMs: number): void {
    if (!Number.isFinite(timeMs)) throw new Error('Invalid seek')
    this.pause()
    this.epoch++
    this.timeMs = Math.min(this.clock?.durationMs ?? 0, Math.max(0, timeMs))
    this.absoluteMs = this.timeMs
  }
  step(delta: -1 | 1): void {
    const clock = this.clock
    if (!clock) return
    const starts = clock.frameStartTimesMs
    const current = frameAt(clock, this.timeMs)
    const atStart = Math.abs(this.timeMs - starts[current]) < 1e-6
    const next = delta < 0 && !atStart ? current : current + delta
    this.seek(next >= starts.length ? clock.durationMs : starts[Math.max(0, next)])
  }
  setSpeed(speed: number): void {
    if (![0.25, 0.5, 1, 2].includes(speed)) throw new Error('Unsupported speed')
    this.speed = speed
    this.lastWallMs = null
  }
  advance(nowMs: number): TransportEvent[] {
    const clock = this.clock
    if (!clock || this.paused || !Number.isFinite(nowMs)) return []
    if (this.lastWallMs === null) {
      this.lastWallMs = nowMs
      return []
    }
    const wallDelta = Math.max(0, nowMs - this.lastWallMs)
    this.lastWallMs = nowMs
    const before = this.absoluteMs
    this.absoluteMs += wallDelta * this.speed
    if (!clock.loop) this.absoluteMs = Math.min(clock.durationMs, this.absoluteMs)
    const events: TransportEvent[] = []
    if (wallDelta <= 250) {
      const startCycle = Math.floor(before / clock.durationMs),
        endCycle = Math.floor(this.absoluteMs / clock.durationMs)
      for (let cycle = startCycle; cycle <= Math.min(endCycle, startCycle + 1); cycle++) {
        if (!clock.loop && cycle > 0) break
        for (const event of clock.events) {
          const occurrence = cycle * clock.durationMs + event.atMs
          if (occurrence > before && occurrence <= this.absoluteMs) events.push({ ...event, epoch: this.epoch, cycle })
        }
      }
    }
    this.timeMs = clock.loop ? this.absoluteMs % clock.durationMs : this.absoluteMs
    if (!clock.loop && this.timeMs >= clock.durationMs) this.pause()
    return events
  }
  frameIndex(): number {
    return this.clock ? frameAt(this.clock, this.timeMs) : 0
  }
  sampleTime(mode: 'continuous' | 'source-clock'): number {
    if (!this.clock || mode === 'continuous' || this.timeMs === this.clock.durationMs) return this.timeMs
    return this.clock.frameStartTimesMs[this.frameIndex()]
  }
}
