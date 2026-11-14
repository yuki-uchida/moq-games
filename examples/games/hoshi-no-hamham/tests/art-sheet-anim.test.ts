import { describe, expect, it } from 'vitest'
import { sheet } from '../src/art'
import type { Raster } from '../src/art/raster'
import { anchorOf, defaultAnchor, duration, frameAt, type Anim } from '../src/art/sheet'

/**
 * The formulas as they were before `frameAt`, `duration` and `anchorOf` stopped allocating (a clip that does not
 * loop holds its last frame, or keeps cycling its last `sustain` frames).
 */
function oldFrameAt(anim: Anim, t: number) {
  const hold = anim.hold ?? anim.frames.map(() => 1)
  const total = hold.reduce((a, b) => a + b, 0)
  let tick = Math.floor(Math.max(0, t) * anim.fps)
  if (!anim.loop && tick >= total) {
    const tail = Math.min(anim.sustain ?? 0, anim.frames.length)
    if (tail < 2) return anim.frames.length - 1
    const first = anim.frames.length - tail
    let rest = (tick - total) % hold.slice(first).reduce((a, b) => a + b, 0)
    for (let i = first; i < hold.length; i++) {
      rest -= hold[i]
      if (rest < 0) return i
    }
    return anim.frames.length - 1
  }
  tick %= total
  for (let i = 0; i < hold.length; i++) {
    tick -= hold[i]
    if (tick < 0) return i
  }
  return 0
}
const oldDuration = (anim: Anim) => (anim.hold ?? anim.frames.map(() => 1)).reduce((a, b) => a + b, 0) / anim.fps
const oldAnchorOf = (anim: Anim) => anim.anchor ?? defaultAnchor(anim.frames[0].w, anim.frames[0].h)

const times = [-1, 0, 0.001, 0.05, 0.1, 0.17, 0.33, 0.5, 0.99, 1, 1.5, 2.718, 10, 123.456]

function compare(anim: Anim) {
  expect(duration(anim)).toBe(oldDuration(anim))
  expect(anchorOf(anim)).toEqual(oldAnchorOf(anim))
  const span = oldDuration(anim)
  for (const t of [...times, span * 0.25, span * 0.5, span - 1e-6, span, span + 1e-6, span * 3.3]) {
    expect(frameAt(anim, t)).toBe(oldFrameAt(anim, t))
  }
}

const frame = (w: number, h: number) => ({ w, h }) as unknown as Raster

describe('frameAt, duration and anchorOf', () => {
  for (const id of ['hero', 'walker']) {
    it(`give the old results for every clip of the ${id} sheet`, () => {
      const clips = Object.entries(sheet(id))
      expect(clips.length).toBeGreaterThan(3)
      for (const [, anim] of clips) compare(anim)
    })
  }

  it('give the old results for a clip with hold, looping and not', () => {
    const frames = [frame(64, 64), frame(64, 64), frame(64, 64), frame(64, 64)]
    for (const loop of [true, false]) {
      compare({ frames, fps: 10, loop, hold: [1, 3, 2, 1] })
      compare({ frames, fps: 7, loop, hold: [4, 1, 1, 1] })
      compare({ frames, fps: 12, loop })
    }
  })

  it('give the old results for a clip that keeps cycling its last frames', () => {
    const frames = [frame(64, 64), frame(64, 64), frame(64, 64), frame(64, 64)]
    for (const sustain of [0, 1, 2, 3, 4, 9]) {
      compare({ frames, fps: 10, loop: false, sustain })
      compare({ frames, fps: 10, loop: false, sustain, hold: [1, 3, 2, 1] })
      compare({ frames, fps: 7, loop: true, sustain, hold: [4, 1, 1, 1] })
    }
  })

  it('give the old anchors for every default size and for an explicit anchor', () => {
    for (const [w, h] of [
      [64, 64],
      [96, 96],
      [128, 128],
      [33, 21],
      [10, 10]
    ])
      expect(anchorOf({ frames: [frame(w, h)], fps: 1, loop: true })).toEqual(defaultAnchor(w, h))
    expect(anchorOf({ frames: [frame(64, 64)], fps: 1, loop: true, anchor: [3, 4] })).toEqual([3, 4])
  })

  it('hand out the same anchor again for the same size instead of building a new one', () => {
    const a = { frames: [frame(96, 96)], fps: 1, loop: true }
    const b = { frames: [frame(96, 96)], fps: 2, loop: false }
    expect(anchorOf(a)).toBe(anchorOf(b))
    const odd = { frames: [frame(37, 91)], fps: 1, loop: true }
    expect(anchorOf(odd)).toBe(anchorOf(odd))
  })
})
