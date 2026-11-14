/**
 * うりぼう (`prop:animal`): the boar piglet that sleeps on the ground, wakes when bitten and charges. 64×64 frames
 * on the map cell's top-left (anchor [0, 0]): the ground is the bottom row of the frame.
 */
import { describe, expect, test } from 'vitest'
import { sheet } from '../src/art/index'
import { R } from '../src/art/palette'
import { LIMITS, colours, lightEdgeBlobs, loopSeam, orphans, stillness } from '../src/art/quality'
import type { Raster } from '../src/art/raster'

const S = () => sheet('prop:animal')
const CLIPS = { sleep: 4, wake: 3, run: 6 } as const
const CREAM = new Set<number>(R.cream)

const box = (f: Raster) => f.bounds()!
const lowest = (f: Raster) => box(f).y + box(f).h - 1
const creamCount = (f: Raster) => {
  let n = 0
  for (const c of f.data) if (CREAM.has(c)) n++
  return n
}

describe('prop:animal', () => {
  test('every clip with its frame count', () => {
    for (const [name, n] of Object.entries(CLIPS)) expect(S()[name].frames, name).toHaveLength(n)
  })

  for (const name of Object.keys(CLIPS))
    test(`${name}: clear of the left, right and top edges; clean pixels; cream stripes`, () => {
      for (const [i, f] of S()[name].frames.entries()) {
        const b = box(f)
        const at = `${name} frame ${i}`
        expect(b.x, at).toBeGreaterThanOrEqual(1)
        expect(b.y, at).toBeGreaterThanOrEqual(1)
        expect(b.x + b.w - 1, at).toBeLessThanOrEqual(62)
        expect(orphans(f), at).toEqual([])
        expect(lightEdgeBlobs(f), at).toEqual([])
        expect(colours(f), at).toBeLessThanOrEqual(LIMITS.colours)
        expect(creamCount(f), at).toBeGreaterThanOrEqual(40)
      }
    })

  test('sleep and the landed wake frames touch the ground', () => {
    const grounded = [...S().sleep.frames, S().wake.frames[1], S().wake.frames[2]]
    for (const f of grounded) {
      expect(lowest(f)).toBeGreaterThanOrEqual(61)
      expect(lowest(f)).toBeLessThanOrEqual(63)
    }
  })

  test('asleep it lies lower than standing', () => {
    const standing = box(S().wake.frames[2]).y
    for (const f of S().sleep.frames) expect(box(f).y).toBeGreaterThan(standing + 4)
  })

  test('the jolt leaves the ground', () => {
    expect(lowest(S().wake.frames[0])).toBeLessThanOrEqual(59)
  })

  test('the gallop has a flight phase and stretches', () => {
    const run = S().run.frames
    expect(run.some((f) => lowest(f) <= 60)).toBe(true)
    const widths = run.map((f) => box(f).w)
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThanOrEqual(5)
  })

  for (const name of ['sleep', 'run'])
    test(`${name} loops without twins or a pop`, () => {
      const anim = S()[name]
      expect(stillness(anim)).toEqual([])
      expect(loopSeam(anim).ratio).toBeLessThanOrEqual(LIMITS.seamRatio)
    })
})
