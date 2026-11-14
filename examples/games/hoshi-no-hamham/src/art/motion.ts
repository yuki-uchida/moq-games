/**
 * Animation tools for pose-parametric characters: easing, pose blending, keyframe tracks and followers for
 * secondary motion. A clip is authored as a few key poses with timing; the frames in between are sampled from the
 * track, and everything soft on the character (ears, tails, scarves, capes, hats) follows the body through a
 * spring so it lags, overshoots and settles on its own.
 *
 *   const pose = track(heroPose(), [
 *     { at: 0, pose: { squash: 2, armN: [-6, 4] } },                         // anticipation
 *     { at: 2, pose: { squash: -3, y: 6, armN: [8, -8] }, ease: ease.out },   // spring up
 *     { at: 5, pose: { squash: 1.5, y: 0 }, ease: ease.in }                   // land
 *   ])
 *   const frames = Array.from({ length: 6 }, (_, i) => draw(pose(i)))
 *
 * Pure functions, no randomness: the same clip is drawn the same way every time.
 */

export const TAU = Math.PI * 2

export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export type Ease = (t: number) => number

/** Timing curves on 0..1. `in` starts slowly, `out` ends slowly, `back` overshoots, `snap` jumps and settles. */
export const ease = {
  linear: (t: number) => t,
  in: (t: number) => t * t,
  out: (t: number) => 1 - (1 - t) * (1 - t),
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  /** Pulls back before going (anticipation built into the curve). */
  inBack: (t: number) => 2.70158 * t * t * t - 1.70158 * t * t,
  /** Overshoots the target and comes back (follow-through built into the curve). */
  outBack: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  /** Reaches the target at once (a pose that pops, an impact). */
  snap: (t: number) => (t > 0 ? 1 : 0),
  /** Holds the previous key until the very end. */
  hold: (t: number) => (t >= 1 ? 1 : 0)
} satisfies Record<string, Ease>

/**
 * Blends two poses: numbers and arrays of numbers are interpolated (nested objects too); everything else (eye and
 * mouth states, flags, null) keeps `a` until t reaches 1.
 */
export function mix<T>(a: T, b: T, t: number): T {
  if (typeof a === 'number' && typeof b === 'number') return lerp(a, b, t) as T
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.map((v, i) => mix(v, b[i], t)) as T
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(b as object))
      out[key] = mix((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], t)
    return out as T
  }
  return t >= 1 ? b : a
}

/** A key pose: the fields that change at `at` (in frames or any other unit) and the curve used to arrive there. */
export interface Key<T> {
  at: number
  pose: Partial<T>
  /** Timing of the move from the previous key to this one. Default `ease.inOut`. */
  ease?: Ease
}

/**
 * Keyframes → a sampler. Each key only names the fields it changes; the rest carries over from the key before
 * (the first key starts from `base`). With `period` the track is a loop of that length: after the last key it
 * moves back to the first one, arriving at `period`, so the cycle closes without a pop.
 */
export function track<T extends object>(base: T, keys: readonly Key<T>[], period?: number): (at: number) => T {
  if (!keys.length) return () => base
  const full: T[] = []
  keys.forEach((key, i) => full.push({ ...(i ? full[i - 1] : base), ...key.pose }))
  if (period !== undefined) {
    // A loop starts from the pose its last key leaves behind.
    const first = { ...full[full.length - 1], ...keys[0].pose }
    full[0] = first
    for (let i = 1; i < keys.length; i++) full[i] = { ...full[i - 1], ...keys[i].pose }
  }
  const last = keys.length - 1
  return (at: number) => {
    if (period !== undefined) {
      at = ((((at - keys[0].at) % period) + period) % period) + keys[0].at
      if (at >= keys[last].at) {
        const span = keys[0].at + period - keys[last].at
        const t = span > 0 ? (at - keys[last].at) / span : 1
        return mix(full[last], full[0], (keys[0].ease ?? ease.inOut)(clamp(t)))
      }
    }
    if (at <= keys[0].at) return full[0]
    if (at >= keys[last].at) return full[last]
    let i = 0
    while (i < last && keys[i + 1].at <= at) i++
    const t = (at - keys[i].at) / (keys[i + 1].at - keys[i].at)
    return mix(full[i], full[i + 1], (keys[i + 1].ease ?? ease.inOut)(clamp(t)))
  }
}

export interface FollowOptions {
  /** How hard the follower is pulled to the driver each frame (0..1). Lower = lazier. Default 0.3. */
  stiffness?: number
  /** How much of its speed the follower loses each frame (0..1). Lower = more wobble. Default 0.45. */
  damping?: number
  /** The values are one cycle of a loop: the follower is settled over several passes so the loop closes. */
  loop?: boolean
}

/**
 * Secondary motion: a value that follows `driver` (one number per frame) through a damped spring. It starts late,
 * overshoots and settles — the motion of ears, tails, cheeks, scarf ends, hat brims behind the body they hang on.
 * Use `lag()` when you want only the difference to the driver (how far the part is left behind).
 */
export function follow(driver: readonly number[], options: FollowOptions = {}): number[] {
  const stiffness = options.stiffness ?? 0.3
  const damping = options.damping ?? 0.45
  let x = driver[0] ?? 0
  let v = 0
  const out: number[] = []
  const passes = options.loop ? 4 : 1
  for (let pass = 0; pass < passes; pass++)
    for (let i = 0; i < driver.length; i++) {
      v = v * (1 - damping) + (driver[i] - x) * stiffness
      x += v
      if (pass === passes - 1) out.push(x)
    }
  return out
}

/** How far a follower trails its driver on each frame: positive while the driver is ahead of it. */
export function lag(driver: readonly number[], options: FollowOptions = {}): number[] {
  return follow(driver, options).map((x, i) => driver[i] - x)
}

/** Height of a hop on 0..1: 0 at both ends, 1 in the middle. */
export const hop = (t: number) => 4 * clamp(t) * (1 - clamp(t))

/** A sine wave on a 0..1 cycle. */
export const wave = (t: number, phase = 0) => Math.sin((t + phase) * TAU)
