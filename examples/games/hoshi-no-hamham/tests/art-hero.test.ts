import { describe, expect, test } from 'vitest'
import { HERO_SPEC } from '../src/art/contract'
import { missingAnims, sheet } from '../src/art/index'
import { C } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const hero = () => sheet('hero')
const bounds = (f: Raster) => f.bounds()!

/** Leftmost painted column of the scarf colours (the far end of the scarf streaming behind). */
function scarfTip(f: Raster) {
  const scarf = new Set([...f.colors()].filter((c) => c !== 0))
  let min = f.w
  // the scarf is the only blue material: pick pixels whose blue channel dominates
  const rgba = f.rgba()
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      const i = (y * f.w + x) * 4
      if (rgba[i + 3] && rgba[i + 2] > rgba[i] + 40 && rgba[i + 2] > rgba[i + 1] + 40) min = Math.min(min, x)
    }
  return scarf.size ? min : f.w
}

describe('hero sheet', () => {
  test('every clip of the contract is drawn', () => {
    expect(missingAnims('hero')).toEqual([])
    for (const name of Object.keys(HERO_SPEC)) expect(hero()[name], name).toBeDefined()
  })

  test('the bite lunges forward', () => {
    const bite = hero().bite.frames
    const right = (f: Raster) => bounds(f).x + bounds(f).w
    expect(right(bite[2])).toBeGreaterThan(right(bite[0]))
  })

  test('landing squashes the body', () => {
    expect(bounds(hero().land.frames[0]).h).toBeLessThan(bounds(hero().idle.frames[0]).h)
  })

  test('the scarf tips move through the run cycle', () => {
    const tips = hero().run.frames.map(scarfTip)
    expect(new Set(tips).size).toBeGreaterThan(2)
  })

  test('the jump stretches and the tumble stays inside the frame', () => {
    expect(bounds(hero().jump.frames[0]).h).toBeGreaterThan(bounds(hero().idle.frames[0]).h)
    for (const f of hero().die.frames) {
      const b = bounds(f)
      expect(b.x).toBeGreaterThanOrEqual(1)
      expect(b.y).toBeGreaterThanOrEqual(1)
      expect(b.x + b.w).toBeLessThanOrEqual(63)
      expect(b.y + b.h).toBeLessThanOrEqual(63)
    }
  })

  test('the run shows real strides: the feet spread apart and together again', () => {
    // width of the bottom 5 rows of the mask = the horizontal spread between the lowest pixels of the feet
    const spread = (f: Raster) => {
      const b = bounds(f)
      let x0 = f.w
      let x1 = -1
      for (let y = b.y + b.h - 5; y < b.y + b.h; y++)
        for (let x = 0; x < f.w; x++)
          if (f.get(x, y)) {
            x0 = Math.min(x0, x)
            x1 = Math.max(x1, x)
          }
      return x1 - x0 + 1
    }
    const widths = hero().run.frames.map(spread)
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThanOrEqual(8)
  })

  test('the bite chomps: big white teeth in the mouth and the furthest reach', () => {
    const bite = hero().bite.frames
    const right = (f: Raster) => bounds(f).x + bounds(f).w
    expect(right(bite[2]) - right(bite[0])).toBeGreaterThanOrEqual(4)
    // mouth area: lower right part of the sprite (the eyes sit above it)
    const teeth = (f: Raster) => {
      const b = bounds(f)
      let n = 0
      for (let y = Math.floor(b.y + b.h * 0.45); y < b.y + b.h; y++)
        for (let x = Math.floor(b.x + b.w * 0.4); x < b.x + b.w; x++) if (f.get(x, y) === C.white) n++
      return n
    }
    expect(teeth(bite[2])).toBeGreaterThanOrEqual(12)
    // the teeth are the biggest white mass of the clip: CHOMP shows more of them than the lunge
    expect(teeth(bite[2])).toBeGreaterThan(teeth(bite[1]))
  })

  test('every tumble frame is cleanly outlined: no light edge, no stray pixel', () => {
    const lum = (rgba: Uint8Array, i: number) => (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) / 255
    hero().die.frames.forEach((f, n) => {
      const rgba = f.rgba()
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++) {
          if (!f.get(x, y)) continue
          const open = [f.get(x - 1, y), f.get(x + 1, y), f.get(x, y - 1), f.get(x, y + 1)].filter((c) => !c).length
          // a painted pixel on the silhouette edge must be an outline colour (the darks of the frame)
          if (open > 0) expect(lum(rgba, (y * f.w + x) * 4), `frame ${n} edge pixel at ${x},${y}`).toBeLessThan(0.7)
          // and nothing is left floating on its own
          expect(open, `frame ${n} isolated pixel at ${x},${y}`).toBeLessThan(4)
        }
    })
  })
})
