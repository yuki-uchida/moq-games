import { describe, expect, test } from 'vitest'
import { C } from '../src/art/palette'
import {
  LIMITS,
  boil,
  boilAt,
  flipFlop,
  bounds,
  centroid,
  centroidPath,
  changed,
  changedRatio,
  colours,
  edgeTouch,
  groundRow,
  lightEdge,
  lightEdgeBlobs,
  loopSeam,
  oneFrameToggles,
  orphans,
  stillness
} from '../src/art/quality'
import { Raster } from '../src/art/raster'
import type { Anim } from '../src/art/sheet'

/** A raster from rows: '.' empty, 'k' dark ink, 'w' white, 'a'/'b' two more colours. */
const KEYS: Record<string, number> = { k: C.ink, w: C.white, a: C.black, b: C.glow }
function pic(rows: string[]): Raster {
  const r = new Raster(rows[0].length, rows.length)
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && r.set(x, y, KEYS[ch])))
  return r
}
const clip = (frames: Raster[], loop = true): Anim => ({ frames, fps: 10, loop })
/** A 2×2 block of ink at column x of an 8×4 frame. */
const block = (x: number) => {
  const r = new Raster(8, 4)
  r.rect(x, 1, 2, 2, C.ink)
  return r
}

describe('orphans', () => {
  test('finds painted pixels without a painted 4-neighbour, diagonals do not count', () => {
    const f = pic(['k....', '.k.kk', '.....', '...k.'])
    expect(orphans(f)).toEqual([
      [0, 0],
      [1, 1],
      [3, 3]
    ])
  })
  test('a clean block has none', () => expect(orphans(block(2))).toEqual([]))
})

describe('lightEdge', () => {
  test('flags light pixels on the edge, not inside and not dark ones', () => {
    const f = pic(['kkkkk', 'kwwwk', 'kwwwk', 'kkkkk'])
    expect(lightEdge(f)).toEqual([])
    const open = pic(['wwwww', 'wkkkw', 'wwwww'])
    expect(lightEdge(open).length).toBe(12)
    expect(lightEdge(open)).not.toContainEqual([2, 1])
  })
  test('the cell border counts as empty', () => expect(lightEdge(pic(['w']))).toEqual([[0, 0]]))
})

describe('changed', () => {
  test('counts differing pixels and relates them to the union of the silhouettes', () => {
    expect(changed(block(1), block(1))).toBe(0)
    expect(changed(block(1), block(2))).toBe(4)
    expect(changedRatio(block(1), block(2))).toBeCloseTo(4 / 6)
    expect(changedRatio(block(0), block(5))).toBe(1)
    expect(changedRatio(new Raster(2, 2), new Raster(2, 2))).toBe(0)
  })
})

describe('loopSeam', () => {
  test('a smooth loop has a seam no bigger than its steps', () => {
    const seam = loopSeam(clip([block(0), block(1), block(2), block(1)]))
    expect(seam.max).toBe(4)
    expect(seam.seam).toBe(4)
    expect(seam.ratio).toBe(1)
  })
  test('a loop that jumps back at the seam pops', () => {
    const seam = loopSeam(clip([block(0), block(1), block(2), block(3), block(4)]))
    expect(seam.ratio).toBeGreaterThan(LIMITS.seamRatio)
  })
  test('single frames have no seam', () => expect(loopSeam(clip([block(0)])).ratio).toBe(0))
})

describe('stillness', () => {
  const big = (shift: number) => {
    const r = new Raster(40, 8)
    r.rect(0 + shift, 0, 30, 6, C.ink)
    return r
  }
  test('lists neighbouring frames with under 1% changed pixels', () => {
    expect(stillness(clip([big(0), big(0), big(1)], false))).toEqual([[0, 1]])
  })
  test('loops also compare last with first', () => {
    expect(stillness(clip([big(0), big(5), big(0)], true))).toEqual([[2, 0]])
  })
})

describe('one-frame toggles (information)', () => {
  test('a pixel that is different for one frame only is counted; a lasting change is not', () => {
    const base = pic(['kkk.', 'kkk.'])
    const bump = pic(['kkk.', 'kkkk'])
    expect(boilAt(base, bump, base)).toEqual([[3, 1]])
    expect(boilAt(base, bump, bump)).toEqual([])
    expect(boilAt(base, bump, pic(['kkkk', 'kkkk']))).toEqual([])
  })
  test('clip maximum, mean and worst frame; non-loops skip the first and last frame', () => {
    const base = pic(['kkk.', 'kkk.'])
    const bump = pic(['kkk.', 'kkkk'])
    const loop = oneFrameToggles(clip([base, base, bump, base, base]))
    expect(loop.perFrame).toEqual([0, 0, 1, 0, 0])
    expect(loop.max).toBe(1)
    expect(loop.worst).toEqual({ frame: 2, pixels: [[3, 1]] })
    expect(loop.mean).toBeCloseTo(0.2)
    expect(oneFrameToggles(clip([base, base, base, bump], false)).perFrame).toEqual([0, 0, 0, 0])
    expect(oneFrameToggles(clip([bump, base, bump], true)).perFrame).toEqual([0, 1, 0])
  })
})

describe('boil (contour flicker)', () => {
  /** A 24×16 body in a 40×30 cell whose top edge sits `lift[i]` pixels higher in frame i. */
  const body = (lift: number) => {
    const r = new Raster(40, 30)
    r.rect(8, 10 - lift, 24, 16 + lift, C.ink)
    return r
  }
  const loopOf = (lifts: number[]) => clip(lifts.map(body))

  test('flipFlop needs on-off-on-off or off-on-off-on; a pixel that toggles once and stays is motion', () => {
    const on = pic(['k'])
    const off = pic(['.'])
    expect(flipFlop(on, off, on, off)).toEqual([[0, 0]])
    expect(flipFlop(off, on, off, on)).toEqual([[0, 0]])
    expect(flipFlop(on, off, off, off)).toEqual([])
    expect(flipFlop(on, off, on, on)).toEqual([])
  })
  test('clips under the minimum length are not measured', () => {
    const short = boil(loopOf([0, 1, 0, 1, 0]))
    expect(short.measured).toBe(false)
    expect(short.max).toBe(0)
  })
  test('calibration: a clean breathing loop measures 0', () => {
    const b = boil(loopOf([0, 0, 1, 1, 1, 1, 0, 0]))
    expect(b.measured).toBe(true)
    expect(b.max).toBe(0)
    expect(b.mean).toBe(0)
  })
  test('calibration: steady motion measures 0', () => {
    const run = clip([0, 1, 2, 3, 4, 5, 6, 7].map(block), true)
    expect(boil(run).max).toBe(0)
  })
  test('calibration: a contour that jitters by one pixel every frame fails the gate in every window', () => {
    const b = boil(loopOf([0, 1, 0, 1, 0, 1, 0, 1]))
    expect(b.max).toBeGreaterThan(LIMITS.boil)
    expect(b.mean).toBeGreaterThan(LIMITS.boilMean)
    expect(b.worst.pixels.length).toBe(24)
    expect(b.perWindow.every((v) => v > LIMITS.boil)).toBe(true)
  })
  test('the share is relative to the outline: the same 6 px nub flickering on a bigger body is a smaller share', () => {
    const withNub = (w: number, h: number, up: boolean) => {
      const r = new Raster(w + 16, h + 16)
      r.rect(8, 8, w, h, C.ink)
      if (up) r.rect(10, 7, 6, 1, C.ink)
      return r
    }
    const flicker = (w: number, h: number) =>
      boil(clip([false, true, false, true, false, true, false, true].map((u) => withNub(w, h, u))))
    const small = flicker(24, 16)
    const large = flicker(60, 40)
    expect(small.worst.count).toBe(6)
    expect(large.worst.count).toBe(6)
    expect(large.max).toBeLessThan(small.max)
  })
  test('loops wrap round to catch a flicker across the seam; non-loops do not', () => {
    const lifts = [1, 0, 0, 0, 0, 0, 0, 1]
    expect(boil(loopOf(lifts)).max).toBe(0)
    const flick = [0, 1, 0, 1, 0, 0, 0, 0]
    expect(boil(loopOf(flick)).worst.frame).toBe(0)
    expect(boil(clip(flick.map(body), false)).perWindow.length).toBe(5)
  })
})

describe('lightEdgeBlobs', () => {
  test('groups light edge pixels by the connected shape they belong to, with its box and size', () => {
    // A dark body with a bright outline gap on its right, and a detached white 2×2 sparkle.
    const f = pic(['kkkk....', 'kkkw....', 'kkkk..ww', 'kkkk..ww'])
    const blobs = lightEdgeBlobs(f)
    expect(blobs.length).toBe(2)
    expect(blobs[0]).toMatchObject({ box: { x: 0, y: 0, w: 4, h: 4 }, size: 16 })
    expect(blobs[0].light).toEqual([[3, 1]])
    expect(blobs[1]).toMatchObject({ box: { x: 6, y: 2, w: 2, h: 2 }, size: 4 })
    expect(blobs[1].light.length).toBe(4)
    expect(lightEdgeBlobs(pic(['kkk']))).toEqual([])
  })
})

describe('geometry', () => {
  test('bounds, centroid and the centroid path', () => {
    expect(bounds(block(3))).toEqual({ x: 3, y: 1, w: 2, h: 2 })
    expect(bounds(new Raster(3, 3))).toBeUndefined()
    expect(centroid(block(3))).toEqual([3.5, 1.5])
    expect(centroid(new Raster(3, 3))).toBeUndefined()
    const path = centroidPath(clip([block(0), block(1), block(4)]))
    expect(path.steps).toEqual([0, 1, 3])
    expect(path.max).toBe(3)
    expect(centroidPath(clip([block(0), block(2)]), true).steps).toEqual([2, 2])
  })
  test('groundRow is the lowest painted row of every frame', () => {
    const low = new Raster(4, 6)
    low.set(1, 4, C.ink)
    expect(groundRow(clip([block(0), low, new Raster(2, 2)]))).toEqual([2, 4, -1])
  })
  test('colours counts distinct palette entries', () => expect(colours(pic(['kwab', 'kk..']))).toBe(4))
  test('edgeTouch lists pixels in the outer margin', () => {
    const f = new Raster(6, 6)
    f.set(0, 3, C.ink)
    f.set(2, 2, C.ink)
    f.set(5, 5, C.ink)
    expect(edgeTouch(f)).toEqual([
      [0, 3],
      [5, 5]
    ])
    expect(edgeTouch(f, 3).length).toBe(3)
  })
})
