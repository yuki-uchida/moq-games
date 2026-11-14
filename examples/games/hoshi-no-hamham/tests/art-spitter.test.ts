import { describe, expect, test } from 'vitest'
import { drawSquirrel, spitterSheet, squirrelPose } from '../src/art/chars/enemies/spitter'
import { ENEMY_NEXT } from '../src/art/contract'
import { C, R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const sheet = spitterSheet()
const BANDANA = new Set<number>(R.bandana.slice(0, 4))
/** Every cream the pouches can be painted in (the cream ramps share their base colour). */
const CREAM = new Set<number>([...R.cream.slice(0, 4), ...R.hamCream.slice(0, 4)])

/** 4-connected components of the pixels of colour `c`. */
function blobs(f: Raster, c: number) {
  const seen = new Set<number>()
  const out: { px: [number, number][]; x0: number; x1: number; y0: number; y1: number; cy: number }[] = []
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      if (f.get(x, y) !== c || seen.has(y * f.w + x)) continue
      const px: [number, number][] = []
      const stack: [number, number][] = [[x, y]]
      seen.add(y * f.w + x)
      while (stack.length) {
        const [a, b] = stack.pop()!
        px.push([a, b])
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ]) {
          const nx = a + dx
          const ny = b + dy
          if (f.get(nx, ny) === c && !seen.has(ny * f.w + nx)) {
            seen.add(ny * f.w + nx)
            stack.push([nx, ny])
          }
        }
      }
      const xs = px.map((p) => p[0])
      const ys = px.map((p) => p[1])
      out.push({
        px,
        x0: Math.min(...xs),
        x1: Math.max(...xs),
        y0: Math.min(...ys),
        y1: Math.max(...ys),
        cy: ys.reduce((s, v) => s + v, 0) / ys.length
      })
    }
  return out
}

/** The topmost painted row among the columns [x0, x1]. */
function top(f: Raster, x0: number, x1: number) {
  for (let y = 0; y < f.h; y++) for (let x = x0; x <= x1; x++) if (f.get(x, y)) return y
  return f.h
}

/** The longest horizontal run of cream in the head's rows (the pouches and the muzzle between them). */
function cheekSpan(f: Raster) {
  let best = 0
  for (let y = 0; y < 46; y++) {
    let run = 0
    for (let x = 0; x < f.w; x++) {
      run = CREAM.has(f.get(x, y)) ? run + 1 : 0
      best = Math.max(best, run)
    }
  }
  return best
}

/** The rightmost pure-black pixel: the tip of the nose (the pupils sit further back). */
const noseTip = (f: Raster) => {
  let x1 = -1
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.get(x, y) === C.black) x1 = Math.max(x1, x)
  return x1
}

describe('spitter (リス団員) on the rig', () => {
  test('every clip of the spec is drawn with its frame count, fps and loop', () => {
    for (const [name, spec] of Object.entries(ENEMY_NEXT.spitter)) {
      const a = sheet[name as keyof typeof sheet]
      expect(a, name).toBeDefined()
      expect(a.frames.length, name).toBe(spec.frames)
      expect(a.fps, name).toBe(spec.fps)
      expect(a.loop, name).toBe(spec.loop)
    }
  })

  test('the tail rises above the ears in every idle frame', () => {
    for (const [i, f] of sheet.idle.frames.entries()) {
      // the tail stands behind him (left of x 27), the ears and the head are right of it
      const tail = top(f, 0, 26)
      const ears = top(f, 29, 63)
      expect(tail, `idle ${i}: tail top ${tail}, ears top ${ears}`).toBeLessThan(ears - 2)
    }
  })

  test('both eyes show their whites in every idle frame, with no cream over them', () => {
    for (const [i, f] of sheet.idle.frames.entries()) {
      const whites = blobs(f, C.white)
      // the teeth are the lowest white; the eyes sit well above them
      const teeth = Math.max(...whites.map((w) => w.cy))
      const eyes = whites.filter((w) => w.cy < teeth - 3).flatMap((w) => w.px)
      // split the eye whites at the widest gap between their columns: the near eye and the far eye
      const cols = [...new Set(eyes.map((p) => p[0]))].sort((a, b) => a - b)
      let cut = 0
      for (let k = 1; k < cols.length; k++) if (cols[k] - cols[k - 1] > cols[cut + 1] - cols[cut]) cut = k - 1
      const near = eyes.filter((p) => p[0] <= cols[cut])
      const far = eyes.filter((p) => p[0] > cols[cut])
      expect(near.length, `idle ${i} near eye white`).toBeGreaterThanOrEqual(2)
      expect(far.length, `idle ${i} far eye white`).toBeGreaterThanOrEqual(2)
      const cy = (ps: [number, number][]) => ps.reduce((s, p) => s + p[1], 0) / ps.length
      expect(Math.abs(cy(near) - cy(far)), `idle ${i}: the eyes sit side by side`).toBeLessThanOrEqual(2)
      for (const eye of [near, far]) {
        const xs = eye.map((p) => p[0])
        const ys = eye.map((p) => p[1])
        for (let y = Math.min(...ys); y <= Math.max(...ys); y++)
          for (let x = Math.min(...xs); x <= Math.max(...xs); x++)
            expect(CREAM.has(f.get(x, y)), `idle ${i}: cream inside the eye at ${x},${y}`).toBe(false)
      }
    }
  })

  test('the cheeks are widest at the wind-up and empty after the spit', () => {
    const spans = sheet.shoot.frames.map(cheekSpan)
    expect(Math.max(...spans), spans.join()).toBe(spans[1])
    expect(spans.indexOf(Math.max(...spans)), spans.join()).toBe(1)
    const least = Math.min(...spans)
    expect([spans[3], spans[4]], spans.join()).toContain(least)
    expect(spans[1] - least, spans.join()).toBeGreaterThanOrEqual(6)
  })

  test('the head reaches furthest forward on the spit frame', () => {
    const reach = sheet.shoot.frames.map(noseTip)
    for (const [i, x] of reach.entries()) if (i !== 3) expect(x, reach.join()).toBeLessThan(reach[3])
  })

  test('the gang red shows in every idle and shoot frame', () => {
    for (const name of ['idle', 'shoot'] as const)
      for (const [i, f] of sheet[name].frames.entries())
        expect(
          [...f.colors()].some((c) => BANDANA.has(c)),
          `${name} ${i}`
        ).toBe(true)
  })

  test('every defeat frame stays inside the cell with no isolated pixel', () => {
    for (const [i, f] of sheet.defeat.frames.entries()) {
      const b = f.bounds()!
      expect(b.x, `defeat ${i} left`).toBeGreaterThanOrEqual(1)
      expect(b.y, `defeat ${i} top`).toBeGreaterThanOrEqual(1)
      expect(b.x + b.w, `defeat ${i} right`).toBeLessThanOrEqual(f.w - 1)
      expect(b.y + b.h, `defeat ${i} bottom`).toBeLessThanOrEqual(f.h - 1)
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++)
          if (f.get(x, y))
            expect(
              Boolean(f.get(x - 1, y) || f.get(x + 1, y) || f.get(x, y - 1) || f.get(x, y + 1)),
              `defeat ${i} isolated pixel at ${x},${y}`
            ).toBe(true)
    }
  })

  test('idle and shoot keep their lowest row on the anchor row', () => {
    for (const name of ['idle', 'shoot'] as const)
      for (const [i, f] of sheet[name].frames.entries()) {
        const b = f.bounds()!
        expect(b.y + b.h - 1, `${name} ${i}`).toBeGreaterThanOrEqual(59)
        expect(b.y + b.h - 1, `${name} ${i}`).toBeLessThanOrEqual(61)
      }
  })

  test('sitting, he is about as wide as his 46×42 box', () => {
    const b = sheet.idle.frames[0].bounds()!
    expect(b.w).toBeGreaterThanOrEqual(40)
    expect(b.w).toBeLessThanOrEqual(52)
  })

  test('a frame draws fast enough for the browser', () => {
    for (let i = 0; i < 5; i++) drawSquirrel(squirrelPose({ squash: i * 0.1 }))
    const t0 = performance.now()
    for (let i = 0; i < 20; i++)
      drawSquirrel(squirrelPose({ squash: i * 0.05, spin: i % 2 ? -90 : 0, planted: !(i % 2) }))
    expect((performance.now() - t0) / 20).toBeLessThan(20)
  })
})
