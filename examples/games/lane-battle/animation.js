const LUNGE = 0.2
const WINDUP = 0.3

/**
 * Procedural body pose. The simulation lands a hit at attack phase 0, so the lunge peaks exactly then,
 * decays over LUNGE seconds and the next strike winds up during the last WINDUP seconds of the period.
 * Returns forward shift / lean / squash in model units; walking hops with walked distance.
 */
export function pose(motion, phase, period, walked) {
  if (motion === 'attack') {
    const lunge = phase < LUNGE ? 1 - phase / LUNGE : 0
    const windup = Math.max(0, (phase - (period - WINDUP)) / WINDUP)
    return {
      shift: lunge * 0.28 - windup * 0.1,
      hop: 0,
      lean: lunge * 0.35 - windup * 0.25,
      squash: 1 - windup * 0.16 + lunge * 0.1
    }
  }
  const t = walked / 9
  return { shift: 0, hop: Math.abs(Math.sin(t)) * 0.14, lean: 0.08, squash: 1 - 0.07 * Math.cos(2 * t) }
}
