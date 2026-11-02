import type { Raster } from './raster'

/** A frame sequence. `hold` lists per-frame durations in ticks of 1/fps (default 1 each). */
export interface Anim {
  frames: Raster[]
  fps: number
  loop: boolean
  hold?: number[]
  /** Per-frame opacity applied by the renderer (sprites themselves stay 0/255). */
  alpha?: number[]
  /** Per-frame lift off the floor in px (the renderer shrinks the ground shadow). */
  lift?: number[]
  /** What rises at the end of a death: a soul, a Japanese ghost (病死) or a haloed soul (大往生). */
  soul?: 'soul' | 'ghost' | 'halo'
  /** Per-frame lettering drawn unmirrored on top (a left-facing death never mirrors text). */
  text?: (Raster | undefined)[]
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

export const duration = (anim: Anim) => (anim.hold ?? anim.frames.map(() => 1)).reduce((a, b) => a + b, 0) / anim.fps
