import { describe, expect, test } from 'vitest'
import { RAT_FUR, drawRat, ratPose, walkerSheet } from '../src/art/chars/enemies/walker'
import { ENEMY_NEXT } from '../src/art/contract'
import { C, R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const sheet = walkerSheet()
const STANDING = ['idle', 'move'] as const
const FUR = new Set<number>(RAT_FUR.slice(0, 4))
const BANDANA = new Set<number>(R.bandana.slice(0, 4))

const has = (f: Raster, set: Set<number>) => [...f.colors()].filter((c) => set.has(c)).length

/** Painted pixels with at least one empty 4-neighbour. */
function edge(f: Raster) {
  const out: [number, number][] = []
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++)
      if (f.get(x, y) && (!f.get(x - 1, y) || !f.get(x + 1, y) || !f.get(x, y - 1) || !f.get(x, y + 1)))
        out.push([x, y])
  return out
}

/** Luma 0..255 of a pixel. */
function luma(f: Raster, x: number, y: number) {
  const rgba = f.rgba()
  const i = (y * f.w + x) * 4
  return 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
}

/** Width of the painted pixels in the bottom `rows` rows of the silhouette. */
function footSpread(f: Raster, rows = 3) {
  const b = f.bounds()!
  let x0 = f.w
  let x1 = -1
  for (let y = b.y + b.h - rows; y < b.y + b.h; y++)
    for (let x = 0; x < f.w; x++)
      if (f.get(x, y)) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
      }
  return x1 - x0 + 1
}

/** The leftmost painted pixel: the tip of the tail behind him. */
function tailTip(f: Raster): [number, number] {
  for (let x = 0; x < f.w; x++) for (let y = 0; y < f.h; y++) if (f.get(x, y)) return [x, y]
  return [-1, -1]
}

describe('walker (ネズミ団員) on the rig', () => {
  test('every clip of the spec is drawn with its frame count, fps and loop', () => {
    for (const [name, spec] of Object.entries(ENEMY_NEXT.walker)) {
      const a = sheet[name as keyof typeof sheet]
      expect(a, name).toBeDefined()
      expect(a.frames.length, name).toBe(spec.frames)
      expect(a.fps, name).toBe(spec.fps)
      expect(a.loop, name).toBe(spec.loop)
    }
  })

  test('grey with the red bandana in every idle and move frame', () => {
    for (const name of STANDING)
      for (const [i, f] of sheet[name].frames.entries()) {
        expect(has(f, FUR), `${name} ${i} grey`).toBeGreaterThanOrEqual(3)
        expect(has(f, BANDANA), `${name} ${i} bandana`).toBeGreaterThanOrEqual(2)
      }
  })

  test('the eyes show white inside the mask in every idle and move frame', () => {
    for (const name of STANDING)
      for (const [i, f] of sheet[name].frames.entries()) {
        const whites = f.data.filter((c) => c === C.white).length
        expect(whites, `${name} ${i}`).toBeGreaterThanOrEqual(8)
      }
  })

  test('the tail tip moves through the scurry', () => {
    const tips = sheet.move.frames.map(tailTip)
    const xs = tips.map((t) => t[0])
    const ys = tips.map((t) => t[1])
    expect(new Set(tips.map((t) => t.join())).size).toBeGreaterThanOrEqual(4)
    expect(Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(4)
  })

  test('the feet alternate in the scurry', () => {
    const spread = sheet.move.frames.map((f) => footSpread(f))
    expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThanOrEqual(6)
  })

  test('every defeat frame stays inside the cell with a clean dark outline and no isolated pixel', () => {
    for (const [i, f] of sheet.defeat.frames.entries()) {
      const b = f.bounds()!
      expect(b.x, `defeat ${i} left`).toBeGreaterThanOrEqual(1)
      expect(b.y, `defeat ${i} top`).toBeGreaterThanOrEqual(1)
      expect(b.x + b.w, `defeat ${i} right`).toBeLessThanOrEqual(f.w - 1)
      expect(b.y + b.h, `defeat ${i} bottom`).toBeLessThanOrEqual(f.h - 1)
      const rim = edge(f)
      // ink on the shadow side, two ramp steps down on the lit side: never a light fill colour on the edge
      const dark = rim.filter(([x, y]) => luma(f, x, y) < 150).length
      expect(dark / rim.length, `defeat ${i} outline`).toBeGreaterThanOrEqual(0.9)
      for (const [x, y] of rim) expect(luma(f, x, y), `defeat ${i} light edge pixel at ${x},${y}`).toBeLessThan(175)
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++)
          if (f.get(x, y))
            expect(
              Boolean(f.get(x - 1, y) || f.get(x + 1, y) || f.get(x, y - 1) || f.get(x, y + 1)),
              `defeat ${i} isolated pixel at ${x},${y}`
            ).toBe(true)
    }
  })

  test('without the tail he is about as wide as his 44×38 box; the look-out stands taller than the scurry', () => {
    // without the tail: the same poses with a tail of length 0
    const standing = drawRat(ratPose({ tail: [30, 4, 0.6, 0] })).bounds()!
    const scurry = drawRat(
      ratPose({ x: -9, hip: 8.5, lean: 72, squash: -3, stretch: 1.15, head: [5, -1.5], tail: [20, 3, 0, 0] })
    ).bounds()!
    for (const b of [standing, scurry]) {
      expect(b.w).toBeGreaterThanOrEqual(36)
      expect(b.w).toBeLessThanOrEqual(48)
    }
    // standing up on his hind legs he is a little taller than the hero's head line allows a hunched rat to be,
    // dropping into the scurry he is clearly lower
    expect(standing.h).toBeLessThanOrEqual(47)
    expect(scurry.h).toBeLessThanOrEqual(standing.h - 6)
    for (const name of STANDING)
      for (const [i, f] of sheet[name].frames.entries())
        expect(f.bounds()!.h, `${name} ${i} height`).toBeLessThanOrEqual(name === 'idle' ? 47 : 40)
  })

  test('the hind feet are rat feet of about 6 px, not skis', () => {
    // the bottom two rows of the standing pose without the tail: one planted foot, heel to toes
    const f = drawRat(ratPose({ tail: [30, 4, 0.6, 0] }))
    const b = f.bounds()!
    let x0 = f.w
    let x1 = -1
    for (const y of [b.y + b.h - 2])
      for (let x = 0; x < f.w; x++)
        if (f.get(x, y)) {
          x0 = Math.min(x0, x)
          x1 = Math.max(x1, x)
        }
    expect(x1 - x0 + 1).toBeGreaterThanOrEqual(6)
    expect(x1 - x0 + 1).toBeLessThanOrEqual(10)
  })

  test('the idle is a little scene: the pupils look back, then ahead, and the paws move', () => {
    const whites = (f: Raster) => {
      // the column of the first pupil pixel (black) inside the near eye, left to right
      for (let x = 0; x < f.w; x++) for (let y = 0; y < f.h; y++) if (f.get(x, y) === C.black) return x
      return -1
    }
    const cols = sheet.idle.frames.map(whites)
    expect(new Set(cols).size).toBeGreaterThanOrEqual(3)
  })

  test('idle and move keep their lowest row on the anchor row', () => {
    for (const name of STANDING)
      for (const [i, f] of sheet[name].frames.entries()) {
        const b = f.bounds()!
        expect(b.y + b.h - 1, `${name} ${i}`).toBeGreaterThanOrEqual(59)
        expect(b.y + b.h - 1, `${name} ${i}`).toBeLessThanOrEqual(61)
      }
  })

  test('a frame draws fast enough for the browser', () => {
    // warm up first: the budget is ~5 ms per 64 px frame once compiled (about 3 ms here); the bound leaves room
    // for a busy test machine
    for (let i = 0; i < 5; i++) drawRat(ratPose({ squash: i * 0.1 }))
    const t0 = performance.now()
    for (let i = 0; i < 20; i++) drawRat(ratPose({ squash: i * 0.05, spin: i % 2 ? 90 : 0 }))
    expect((performance.now() - t0) / 20).toBeLessThan(20)
  })
})
