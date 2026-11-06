import type { MatchSnapshot, PlayerId } from './match'
import type { FootstepSurface } from './sound'
import type { Pose } from './world'

export function footstepSurface(pose: Pick<Pose, 'x' | 'z'>): FootstepSurface {
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      for (let column = 0; column < 4; column++) {
        for (let pair = 0; pair < 3; pair++) {
          const turned = (column + pair + (side === end ? 1 : 0)) % 2 === 0
          for (const offset of [-0.55, 0.55]) {
            const x = side * (1.15 + column * 2.16) + (turned ? offset : 0)
            const z = end * (3.2 + pair * 2.2) + (turned ? 0 : offset)
            if (
              Math.abs(pose.x - x) <= (turned ? 1.075 : 2.13) / 2 &&
              Math.abs(pose.z - z) <= (turned ? 2.13 : 1.075) / 2
            )
              return 'tatami'
          }
        }
      }
    }
  }
  return 'wood'
}

export class HumanFootsteps {
  private previous: { x: number; z: number; round: string; elapsedMs: number; now: number } | undefined
  private distance = 0
  private lastStep = -Infinity

  reset(): void {
    this.previous = undefined
    this.distance = 0
    this.lastStep = -Infinity
  }

  sample(pose: Pose, state: MatchSnapshot, player: PlayerId | undefined, now: number): FootstepSurface | null {
    if (
      !player ||
      player !== state.survivor ||
      state.paused ||
      (state.phase !== 'round1' && state.phase !== 'round2') ||
      ![pose.x, pose.z, state.elapsedMs, now].every(Number.isFinite)
    ) {
      this.reset()
      return null
    }
    const previous = this.previous
    this.previous = { x: pose.x, z: pose.z, round: state.phase, elapsedMs: state.elapsedMs, now }
    const elapsed = previous ? state.elapsedMs - previous.elapsedMs : 0
    if (
      !previous ||
      previous.round !== state.phase ||
      elapsed <= 0 ||
      elapsed > 500 ||
      now <= previous.now ||
      now - previous.now > 500
    ) {
      this.distance = 0
      return null
    }
    const moved = Math.hypot(pose.x - previous.x, pose.z - previous.z)
    if (moved < 0.000001 || moved > (3 * elapsed) / 1000 + 0.000001) {
      this.distance = 0
      return null
    }
    this.distance += moved
    if (this.distance < 0.9 - 0.000001 || now - this.lastStep < 300) return null
    this.distance = 0
    this.lastStep = now
    return footstepSurface(pose)
  }
}
