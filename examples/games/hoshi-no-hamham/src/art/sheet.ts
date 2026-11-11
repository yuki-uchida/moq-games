import type { Raster } from './raster'

/** A frame sequence. `hold` lists per-frame durations in ticks of 1/fps (default 1 each). */
export interface Anim {
  frames: Raster[]
  fps: number
  loop: boolean
  hold?: number[]
  /** The frame pixel that sits on the entity position (see `defaultAnchor`). */
  anchor?: readonly [number, number]
}

export type Sheet = Record<string, Anim>

/** Frame index at `t` seconds into the animation (non-looping animations hold their last frame). */
export function frameAt(anim: Anim, t: number) {
  const hold = anim.hold ?? anim.frames.map(() => 1)
  const total = hold.reduce((a, b) => a + b, 0)
  let tick = Math.floor(Math.max(0, t) * anim.fps)
  if (!anim.loop && tick >= total) return anim.frames.length - 1
  tick %= total
  for (let i = 0; i < hold.length; i++) {
    tick -= hold[i]
    if (tick < 0) return i
  }
  return 0
}

/** Length of one pass of the animation in seconds. */
export const duration = (anim: Anim) => (anim.hold ?? anim.frames.map(() => 1)).reduce((a, b) => a + b, 0) / anim.fps

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

export const anchorOf = (anim: Anim) => anim.anchor ?? defaultAnchor(anim.frames[0].w, anim.frames[0].h)

/** Builds an Anim from frames (helper for art modules). */
export const anim = (frames: Raster[], fps: number, loop: boolean, extra: Partial<Anim> = {}): Anim => ({
  frames,
  fps,
  loop,
  ...extra
})
