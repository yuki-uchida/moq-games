import { describe, expect, test } from 'vitest'
import { FX_SPEC } from '../src/art/contract'
import { missingAnims, sheet } from '../src/art/index'
import type { Raster } from '../src/art/raster'

const fx = sheet('fx')

const peakOf = (frames: Raster[]) => frames.reduce((best, f) => (f.count() > best.count() ? f : best))

test('every fx animation is drawn', () => {
  expect(missingAnims('fx')).toEqual([])
})

describe('one-shot effects grow, then disperse', () => {
  for (const name of ['dust', 'puff', 'smoke', 'spark', 'ring', 'boom', 'splash'])
    test(name, () => {
      const frames = fx[name].frames
      const peak = peakOf(frames)
      const last = frames[frames.length - 1]
      expect(last.count(), `${name} ends smaller than its peak`).toBeLessThan(peak.count())
      expect(last.count(), `${name} ends almost empty`).toBeLessThan(peak.count() * 0.5)
      const pb = peak.bounds()!
      const fb = frames[0].bounds()!
      expect(pb.w * pb.h, `${name} peak is bigger than frame 0`).toBeGreaterThan(fb.w * fb.h)
    })
})

test('chomp closes on the hit frame', () => {
  const gap = (f: Raster) => {
    // Largest vertical run of empty pixels between painted pixels, over all columns left of the bite point.
    let best = 0
    for (let x = 4; x < 44; x++) {
      let first = -1
      let last = -1
      for (let y = 0; y < f.h; y++) if (f.get(x, y)) first < 0 && (first = y), (last = y)
      if (first < 0) continue
      let run = 0
      let max = 0
      for (let y = first; y <= last; y++) {
        run = f.get(x, y) ? 0 : run + 1
        max = Math.max(max, run)
      }
      best = Math.max(best, max)
    }
    return best
  }
  const frames = fx.chomp.frames
  expect(FX_SPEC.chomp.hit).toBe(2)
  expect(gap(frames[2])).toBeLessThan(gap(frames[0]))
  expect(gap(frames[1])).toBeLessThan(gap(frames[0]))
})

test('glow is denser at the centre than at the rim', () => {
  const g = fx.glow.frames[0]
  const density = (r0: number, r1: number) => {
    let on = 0
    let n = 0
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const d = Math.hypot(x + 0.5 - g.w / 2, y + 0.5 - g.h / 2)
        if (d < r0 || d >= r1) continue
        n++
        if (g.get(x, y)) on++
      }
    return on / n
  }
  expect(density(0, 8)).toBeGreaterThan(density(8, 20))
  expect(density(8, 20)).toBeGreaterThan(density(20, 32))
  expect(density(0, 8)).toBeGreaterThan(0.9)
})

describe('small sprites keep their art inside the frame', () => {
  for (const [name, spec] of Object.entries(FX_SPEC)) {
    if (name === 'gush') continue // the fountain is cut by the cell edge on purpose
    test(name, () => {
      for (const [i, f] of fx[name].frames.entries()) {
        const b = f.bounds()!
        expect(b, `${name} frame ${i} is empty`).toBeDefined()
        expect(b.x, `${name} frame ${i} left`).toBeGreaterThanOrEqual(0)
        expect(b.y, `${name} frame ${i} top`).toBeGreaterThanOrEqual(0)
        expect(b.x + b.w, `${name} frame ${i} right`).toBeLessThanOrEqual(spec.w)
        expect(b.y + b.h, `${name} frame ${i} bottom`).toBeLessThanOrEqual(spec.h)
        // Nothing may touch the frame edge, which would cut the art when the view scales it.
        const touches = b.x === 0 || b.y === 0 || b.x + b.w === f.w || b.y + b.h === f.h
        if (name !== 'splash' && name !== 'glow' && Math.min(spec.w, spec.h) >= 16)
          expect(touches, `${name} frame ${i} touches the edge`).toBe(false)
      }
    })
  }
})
