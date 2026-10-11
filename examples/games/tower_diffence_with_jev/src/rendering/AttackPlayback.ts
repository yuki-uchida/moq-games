import type { WholeFrameEvent, WholeFrameManifest } from './WholeFrameAtlas'

export interface FiredAnimationEvent extends WholeFrameEvent {
  readonly sequence: number
  readonly occurredAtMs: number
}

export type AttackClip = Pick<WholeFrameManifest, 'motion' | 'loop' | 'durationMs' | 'events'>

export class AttackPlayback {
  private sequence = 0
  private manifest?: AttackClip
  private startedAtMs = 0
  private elapsedMs = 0
  private timeScale: 1 | 0.8 = 1
  private fired = new Set<WholeFrameEvent['type']>()

  start(sequence: number, manifest: AttackClip | undefined, startedAtMs: number, timeScale: 1 | 0.8 = 1): boolean {
    if (
      (timeScale !== 1 && timeScale !== 0.8) ||
      !Number.isSafeInteger(sequence) ||
      sequence <= this.sequence ||
      !Number.isFinite(startedAtMs)
    )
      return false
    this.sequence = sequence
    this.manifest = manifest?.motion === 'attack' && !manifest.loop ? manifest : undefined
    this.startedAtMs = startedAtMs
    this.timeScale = timeScale
    this.elapsedMs = 0
    this.fired.clear()
    return !!this.manifest
  }

  cancel(): void {
    this.manifest = undefined
  }

  sample(nowMs: number): { active: boolean; elapsedMs: number; events: FiredAnimationEvent[] } {
    if (!Number.isFinite(nowMs)) throw new Error('Attack presentation time must be finite')
    const manifest = this.manifest
    if (!manifest || nowMs < this.startedAtMs) return { active: false, elapsedMs: 0, events: [] }
    this.elapsedMs = Math.max(this.elapsedMs, (nowMs - this.startedAtMs) / this.timeScale, 0)
    const events = manifest.events
      .filter((event) => event.atMs <= this.elapsedMs && !this.fired.has(event.type))
      .map((event) => {
        this.fired.add(event.type)
        return {
          ...event,
          sequence: this.sequence,
          occurredAtMs: this.startedAtMs + event.atMs * this.timeScale
        }
      })
    return { active: this.elapsedMs < manifest.durationMs - 1e-6, elapsedMs: this.elapsedMs, events }
  }
}
