import { describe, expect, test } from 'vitest'
import { HERO_NEXT } from '../src/art/contract'
import { sheet } from '../src/art/index'
import { C, R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const hero = () => sheet('hero')
const bounds = (f: Raster) => f.bounds()!
const right = (f: Raster) => bounds(f).x + bounds(f).w

/** Pixels whose blue channel dominates: the navy scarf is the only blue material. */
function scarfPixels(f: Raster) {
  const rgba = f.rgba()
  const out: [number, number][] = []
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      const i = (y * f.w + x) * 4
      if (rgba[i + 3] && rgba[i + 2] > rgba[i] + 40 && rgba[i + 2] > rgba[i + 1] + 40) out.push([x, y])
    }
  return out
}

/** Leftmost and topmost scarf pixel (the swallowtail end streaming behind). */
const scarfTip = (f: Raster) => {
  const px = scarfPixels(f)
  const x = Math.min(...px.map((p) => p[0]))
  const y = Math.min(...px.filter((p) => p[0] === x).map((p) => p[1]))
  return `${x},${y}`
}

describe('hero sheet', () => {
  test('every clip of HERO_NEXT is drawn with its frame count', () => {
    const s = hero()
    for (const [name, spec] of Object.entries(HERO_NEXT)) {
      expect(s[name], name).toBeDefined()
      expect(s[name].frames.length, name).toBe(spec.frames)
    }
  })

  test('blink is idle with the eyes shut: the same pixels outside the eyes, different inside', () => {
    const idle = hero().idle.frames
    const blink = hero().blink.frames
    expect(blink.length).toBe(idle.length)
    idle.forEach((f, i) => {
      // the eye area: the black of the open eyes in the idle frame, grown by a pixel
      const eye = (x: number, y: number) => {
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if (f.get(x + dx, y + dy) === C.black) return true
        return false
      }
      let inside = 0
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++) {
          const same = f.get(x, y) === blink[i].get(x, y)
          if (eye(x, y)) inside += same ? 0 : 1
          else expect(same, `frame ${i} differs at ${x},${y} outside the eyes`).toBe(true)
        }
      expect(inside, `frame ${i}`).toBeGreaterThan(20)
    })
  })

  test('the run shows real strides and plants a foot on the contact frames', () => {
    const run = hero().run.frames
    // horizontal spread of the bottom rows (the feet)
    const spread = (f: Raster) => {
      const b = bounds(f)
      let x0 = f.w
      let x1 = -1
      for (let y = b.y + b.h - 4; y < b.y + b.h; y++)
        for (let x = 0; x < f.w; x++)
          if (f.get(x, y)) {
            x0 = Math.min(x0, x)
            x1 = Math.max(x1, x)
          }
      return x1 - x0 + 1
    }
    const widths = run.map(spread)
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThanOrEqual(8)
    for (const i of [0, 4]) {
      const b = bounds(run[i])
      expect(b.y + b.h - 1, `contact frame ${i} stands on the ground row`).toBeGreaterThanOrEqual(59)
      expect(b.y + b.h - 1, `contact frame ${i} stands on the ground row`).toBeLessThanOrEqual(61)
    }
  })

  test('the scarf end moves through the run', () => {
    const tips = hero().run.frames.map(scarfTip)
    expect(new Set(tips).size).toBeGreaterThan(3)
  })

  test('the jump stretches taller than idle, the landing squashes lower and wider', () => {
    const idle = bounds(hero().idle.frames[0])
    expect(bounds(hero().jump.frames[0]).h).toBeGreaterThan(idle.h)
    const land = hero().land.frames[0]
    expect(bounds(land).h).toBeLessThan(idle.h)
    // the body below the head: compare the width of the rows just above the feet
    const width = (f: Raster, y: number) => {
      let n = 0
      for (let x = 0; x < f.w; x++) if (f.get(x, y)) n++
      return n
    }
    expect(width(land, 54)).toBeGreaterThan(width(hero().idle.frames[0], 54))
  })

  test('the bite reaches furthest on CHOMP, which shows the most teeth', () => {
    const bite = hero().bite.frames
    expect(right(bite[2]) - right(bite[0])).toBeGreaterThanOrEqual(4)
    for (const [i, f] of bite.entries())
      if (i !== 2) expect(right(bite[2]), `frame ${i}`).toBeGreaterThanOrEqual(right(f))
    // mouth region: the lower right part of the sprite (the eyes sit above it)
    const teeth = (f: Raster) => {
      const b = bounds(f)
      let n = 0
      for (let y = Math.floor(b.y + b.h * 0.45); y < b.y + b.h; y++)
        for (let x = Math.floor(b.x + b.w * 0.4); x < b.x + b.w; x++) if (f.get(x, y) === C.white) n++
      return n
    }
    expect(teeth(bite[2])).toBeGreaterThanOrEqual(12)
    for (const [i, f] of bite.entries()) if (i !== 2) expect(teeth(bite[2]), `frame ${i}`).toBeGreaterThan(teeth(f))
  })

  test('every knock-out frame stays inside the cell, cleanly outlined, with no stray pixel', () => {
    const lum = (rgba: Uint8Array, i: number) => (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) / 255
    hero().die.frames.forEach((f, n) => {
      const b = bounds(f)
      expect(b.x).toBeGreaterThanOrEqual(1)
      expect(b.y).toBeGreaterThanOrEqual(1)
      expect(b.x + b.w).toBeLessThanOrEqual(63)
      expect(b.y + b.h).toBeLessThanOrEqual(63)
      const rgba = f.rgba()
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++) {
          if (!f.get(x, y)) continue
          const open = [f.get(x - 1, y), f.get(x + 1, y), f.get(x, y - 1), f.get(x, y + 1)].filter((c) => !c).length
          if (open > 0) expect(lum(rgba, (y * f.w + x) * 4), `frame ${n} edge pixel at ${x},${y}`).toBeLessThan(0.7)
          expect(open, `frame ${n} isolated pixel at ${x},${y}`).toBeLessThan(4)
        }
    })
  })

  test('the hero keeps his colours in idle: pink dominant, cream, a navy scarf, a gold clasp', () => {
    for (const f of hero().idle.frames) {
      const count = (ramp: readonly number[]) => f.data.filter((c) => ramp.slice(0, 4).includes(c)).length
      const pink = count(R.hamPink)
      expect(pink).toBeGreaterThan(count(R.hamCream))
      expect(count(R.hamCream)).toBeGreaterThan(60)
      expect(count(R.scarf)).toBeGreaterThan(25)
      expect(count(R.gold)).toBeGreaterThanOrEqual(5)
      expect(f.colors().size).toBeLessThanOrEqual(28)
    }
  })
})
