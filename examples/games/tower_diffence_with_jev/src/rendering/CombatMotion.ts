function phase(progress: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (progress - from) / (to - from)))
}
function ease(value: number): number {
  return value * value * (3 - 2 * value)
}
export function attackPose(progress: number) {
  return {
    anticipation: ease(phase(progress, 0, 0.25)) * (1 - ease(phase(progress, 0.25, 0.38))),
    contact: ease(phase(progress, 0.25, 0.38)) * (1 - ease(phase(progress, 0.46, 1))),
    slash: phase(progress, 0.28, 0.72),
    flight: phase(progress, 0.34, 0.78),
    impact: phase(progress, 0.78, 1)
  }
}
export function hitPose(progress: number) {
  return {
    recoil: ease(phase(progress, 0, 0.18)) * (1 - ease(phase(progress, 0.18, 1))),
    flash: 1 - ease(phase(progress, 0, 0.32)),
    burst: 1 - ease(phase(progress, 0.08, 1))
  }
}

export class AnimationTimer {
  private previous = 0
  private started = -Infinity
  constructor(private duration: number) {}
  sample(remaining: number, time: number): number {
    if (remaining > this.previous) this.started = time - (this.duration - remaining)
    this.previous = remaining
    return Math.max(0, this.duration - (time - this.started))
  }
}
