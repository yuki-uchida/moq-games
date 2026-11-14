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
const CLIPS = { sleep: 4, wake: 3, run: 6, daze: 6 } as const
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

  test('sleep and the spring-up frame touch the ground', () => {
    const grounded = [...S().sleep.frames, S().wake.frames[0]]
    for (const f of grounded) {
      expect(lowest(f)).toBeGreaterThanOrEqual(61)
      expect(lowest(f)).toBeLessThanOrEqual(63)
    }
  })

  test('asleep it lies lower than standing', () => {
    const standing = box(S().run.frames[0]).y
    for (const f of S().sleep.frames) expect(box(f).y).toBeGreaterThan(standing + 4)
  })

  test('the startled leap is in the air after the spring-up', () => {
    for (const i of [1, 2]) expect(lowest(S().wake.frames[i])).toBeLessThanOrEqual(60)
  })

  test('the gallop has a flight phase and stretches', () => {
    const run = S().run.frames
    expect(run.some((f) => lowest(f) <= 60)).toBe(true)
    const widths = run.map((f) => box(f).w)
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThanOrEqual(5)
  })

  test('daze: sits on the ground rows of run, in place, lower than standing, every frame new', () => {
    const daze = S().daze.frames
    const standing = box(S().run.frames[0])
    const centres = daze.map((f) => box(f).x + box(f).w / 2)
    for (const f of daze) {
      expect(lowest(f)).toBeGreaterThanOrEqual(61)
      expect(lowest(f)).toBeLessThanOrEqual(63)
      expect(box(f).y).toBeGreaterThanOrEqual(standing.y + 2)
    }
    expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(4)
    for (let i = 0; i < daze.length; i++) expect(daze[i].data).not.toEqual(daze[(i + 1) % daze.length].data)
  })

  for (const name of ['sleep', 'run', 'daze'])
    test(`${name} loops without twins or a pop`, () => {
      const anim = S()[name]
      expect(stillness(anim)).toEqual([])
      expect(loopSeam(anim).ratio).toBeLessThanOrEqual(LIMITS.seamRatio)
    })
})
