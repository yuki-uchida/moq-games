import { describe, expect, it } from 'vitest'
import { duration, frameAt, type Anim } from '../src/art/sheet'

/** An Anim whose frames are placeholders: frameAt only looks at the count, timing and `sustain`. */
const anim = (frames: number, fps: number, extra: Partial<Anim> = {}): Anim =>
  ({ frames: Array.from({ length: frames }, () => ({})), fps, loop: false, ...extra }) as unknown as Anim

/** Frame indices at the middle of each of the first `ticks` ticks. */
const sample = (a: Anim, ticks: number) => Array.from({ length: ticks }, (_, k) => frameAt(a, (k + 0.5) / a.fps))

describe('frameAt', () => {
  it('a looping clip wraps', () => {
    expect(sample(anim(3, 10, { loop: true }), 7)).toEqual([0, 1, 2, 0, 1, 2, 0])
  })

  it('a non-looping clip holds its last frame', () => {
    expect(sample(anim(3, 10), 6)).toEqual([0, 1, 2, 2, 2, 2])
  })

  it('a negative time shows the first frame', () => {
    expect(frameAt(anim(3, 10, { sustain: 2 }), -1)).toBe(0)
  })

  describe('sustain', () => {
    it('cycles the last frames after the clip has played', () => {
      expect(sample(anim(4, 10, { sustain: 2 }), 10)).toEqual([0, 1, 2, 3, 2, 3, 2, 3, 2, 3])
      expect(sample(anim(5, 10, { sustain: 3 }), 11)).toEqual([0, 1, 2, 3, 4, 2, 3, 4, 2, 3, 4])
    })

    it('a sustain covering every frame cycles the whole clip', () => {
      expect(sample(anim(3, 10, { sustain: 3 }), 7)).toEqual([0, 1, 2, 0, 1, 2, 0])
    })

    it('a sustain longer than the clip is clamped to its length', () => {
      expect(sample(anim(2, 10, { sustain: 9 }), 6)).toEqual([0, 1, 0, 1, 0, 1])
    })

    it('a sustain below two holds the last frame', () => {
      expect(sample(anim(3, 10, { sustain: 1 }), 6)).toEqual([0, 1, 2, 2, 2, 2])
      expect(sample(anim(3, 10, { sustain: 0 }), 6)).toEqual([0, 1, 2, 2, 2, 2])
    })

    it('a looping clip ignores sustain', () => {
      expect(sample(anim(3, 10, { loop: true, sustain: 2 }), 7)).toEqual([0, 1, 2, 0, 1, 2, 0])
    })

    it('does not change the first pass', () => {
      const plain = anim(4, 10)
      const sustained = anim(4, 10, { sustain: 2 })
      expect(sample(sustained, 4)).toEqual(sample(plain, 4))
    })

    it('keeps cycling for as long as it is asked', () => {
      const a = anim(4, 10, { sustain: 2 })
      expect(frameAt(a, 100.05)).toBe(2)
      expect(frameAt(a, 100.15)).toBe(3)
    })
  })

  describe('sustain with hold', () => {
    // Ticks of 1/10 s: frame 0 for 2, frame 1 for 1, frame 2 for 3, frame 3 for 2 (8 ticks in all).
    const held = (extra: Partial<Anim> = {}) => anim(4, 10, { hold: [2, 1, 3, 2], ...extra })

    it('plays the first pass by hold', () => {
      expect(sample(held(), 8)).toEqual([0, 0, 1, 2, 2, 2, 3, 3])
      expect(duration(held())).toBeCloseTo(0.8)
    })

    it('without sustain holds the last frame after the pass', () => {
      expect(sample(held(), 11).slice(8)).toEqual([3, 3, 3])
    })

    it('cycles the last frames each for its own hold', () => {
      // The sustained tail is frames 2 (3 ticks) and 3 (2 ticks): 5 ticks per cycle.
      expect(sample(held({ sustain: 2 }), 18).slice(8)).toEqual([2, 2, 2, 3, 3, 2, 2, 2, 3, 3])
    })

    it('a sustain of three starts the tail at frame 1', () => {
      expect(sample(held({ sustain: 3 }), 17).slice(8)).toEqual([1, 2, 2, 2, 3, 3, 1, 2, 2])
    })
  })
})
