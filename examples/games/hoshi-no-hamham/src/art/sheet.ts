import type { Raster } from './raster'
import { counted } from './stats'

/** A frame sequence. `hold` lists per-frame durations in ticks of 1/fps (default 1 each). */
export interface Anim {
  frames: Raster[]
  fps: number
  loop: boolean
  hold?: number[]
  /** The frame pixel that sits on the entity position (see `defaultAnchor`). */
  anchor?: readonly [number, number]
  /**
   * A clip that does not loop: once it has played, it keeps cycling its last `sustain` frames instead of holding
   * the very last one (see `AnimSpec.sustain` in contract.ts).
   */
  sustain?: number
}

export type Sheet = Record<string, Anim>

/** Ticks in one pass of the animation (the sum of `hold`, or one per frame without it). */
function totalTicks(anim: Anim): number {
  const hold = anim.hold
  if (!hold) return anim.frames.length
  let total = 0
  for (let i = 0; i < hold.length; i++) total += hold[i]
  return total
}

/**
 * Frame index at `t` seconds into the animation. A non-looping animation holds its last frame, or keeps cycling
 * its last `sustain` frames (each for its own hold).
 */
export function frameAt(anim: Anim, t: number) {
  const hold = anim.hold
  const total = totalTicks(anim)
  const count = hold ? hold.length : anim.frames.length
  let tick = Math.floor(Math.max(0, t) * anim.fps)
  if (!anim.loop && tick >= total) {
    const last = anim.frames.length - 1
    const tail = Math.min(anim.sustain ?? 0, anim.frames.length)
    if (tail < 2) return last
    const first = anim.frames.length - tail
    let span = 0
    for (let i = first; i < count; i++) span += hold ? hold[i] : 1
    if (span <= 0) return last
    let rest = (tick - total) % span
    for (let i = first; i < count; i++) {
      rest -= hold ? hold[i] : 1
      if (rest < 0) return i
    }
    return last
  }
  tick %= total
  for (let i = 0; i < count; i++) {
    tick -= hold ? hold[i] : 1
    if (tick < 0) return i
  }
  return 0
}

/** Length of one pass of the animation in seconds. */
export const duration = (anim: Anim) => totalTicks(anim) / anim.fps

/**
 * Default anchor of a frame: the feet of a character cell (64×64 → [32, 60], 96×96 → [48, 90],
 * 128×128 → [64, 120]), otherwise the frame centre.
 */
export function defaultAnchor(w: number, h: number): readonly [number, number] {
  if (w === 64 && h === 64) return [32, 60]
  if (w === 96 && h === 96) return [48, 90]
  if (w === 128 && h === 128) return [64, 120]
  return [Math.floor(w / 2), Math.floor(h / 2)]
}

/** The default anchors already handed out, by frame size, so a frame drawn every tick does not allocate one. */
const defaultAnchors = new Map<number, readonly [number, number]>()

export const anchorOf = (anim: Anim) => {
  if (anim.anchor) return anim.anchor
  const { w, h } = anim.frames[0]
  const key = w * 65536 + h
  let anchor = defaultAnchors.get(key)
  if (!anchor) {
    anchor = defaultAnchor(w, h)
    defaultAnchors.set(key, anchor)
  }
  return anchor
}

/** Builds an Anim from frames (helper for art modules). */
export const anim = (frames: Raster[], fps: number, loop: boolean, extra: Partial<Anim> = {}): Anim => ({
  frames,
  fps,
  loop,
  ...extra
})

/** Runs `build` on the first call and returns the same result from then on. */
export function memo<T>(build: () => T): () => T {
  let value: T
  let done = false
  return () => {
    if (!done) {
      value = build()
      done = true
    }
    return value
  }
}

/**
 * An Anim whose frames are drawn on first access (and kept). Readers see an ordinary `frames` array property;
 * nothing is drawn while the module is imported or while the registry assembles a sheet.
 */
export function lazyAnim(build: () => Raster[], fps: number, loop: boolean, extra: Partial<Anim> = {}): Anim {
  const frames = memo(() => counted('clips', build))
  return {
    get frames() {
      return frames()
    },
    fps,
    loop,
    ...extra
  }
}

/**
 * An Anim drawn as a whole (frames and timing) on first access, for builders that already return an Anim and
 * share intermediate results between frames. Like `lazyAnim`, nothing is drawn until a reader touches it.
 */
export function deferAnim(build: () => Anim): Anim {
  const built = memo(() => counted('clips', build))
  return {
    get frames() {
      return built().frames
    },
    get fps() {
      return built().fps
    },
    get loop() {
      return built().loop
    },
    get hold() {
      return built().hold
    },
    get anchor() {
      return built().anchor
    },
    get sustain() {
      return built().sustain
    }
  }
}
