import { describe, expect, test } from 'vitest'
import { FROG_SKIN, drawFrog, frogPose, jumperSheet } from '../src/art/chars/enemies/jumper'
import { ENEMY_SPEC } from '../src/art/contract'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const sheet = jumperSheet()
const BANDANA = new Set<number>(R.bandana.slice(0, 4))
const GRASS = new Set<number>(R.grass.slice(0, 4))
const SKIN = new Set<number>(FROG_SKIN.slice(0, 4))

const has = (f: Raster, set: Set<number>) => [...f.colors()].some((c) => set.has(c))

/** Topmost painted row of each column (or -1). */
function tops(f: Raster) {
  return Array.from({ length: f.w }, (_, x) => {
    for (let y = 0; y < f.h; y++) if (f.get(x, y)) return y
    return -1
  })
}

/** Separate runs of painted pixels along a row. */
function runs(f: Raster, y: number) {
  const out: [number, number][] = []
  for (let x = 0; x < f.w; x++)
    if (f.get(x, y) && !f.get(x - 1, y)) {
      let e = x
      while (f.get(e + 1, y)) e++
      out.push([x, e])
    }
  return out
}

/** Leftmost and rightmost painted pixel among the lowest `rows` rows of the silhouette. */
function footSpan(f: Raster, rows = 3) {
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

describe('jumper (カエル団員) on the rig', () => {
  test('every clip of the spec is drawn with its frame count, fps and loop', () => {
    for (const [name, spec] of Object.entries(ENEMY_SPEC.jumper)) {
      const a = sheet[name as keyof typeof sheet]
      expect(a, name).toBeDefined()
      expect(a.frames.length, name).toBe(spec.frames)
      expect(a.fps, name).toBe(spec.fps)
      expect(a.loop, name).toBe(spec.loop)
    }
  })

  test('in every idle frame the two eye bulges are the highest pixels and stand at least 4 px above the back', () => {
    for (const [i, f] of sheet.idle.frames.entries()) {
      const b = f.bounds()!
      // the first row of the silhouette holds exactly two bumps: the eyes
      const bumps = runs(f, b.y + 2)
      expect(bumps.length, `idle ${i} bumps`).toBe(2)
      // the back: the highest pixel behind (left of) the near bulge
      const t = tops(f)
      const behind = t.slice(0, bumps[0][0] - 2).filter((y) => y >= 0)
      const back = Math.min(...behind)
      expect(back - b.y, `idle ${i} eyes above the back`).toBeGreaterThanOrEqual(4)
    }
  })

  test('air: the launch is the tallest and narrowest frame, the top the most compact, the feet spread to land', () => {
    const boxes = sheet.air.frames.map((f) => f.bounds()!)
    for (let i = 1; i < 5; i++) {
      expect(boxes[0].h, `launch taller than ${i}`).toBeGreaterThan(boxes[i].h)
      expect(boxes[0].w, `launch narrower than ${i}`).toBeLessThan(boxes[i].w)
    }
    const area = boxes.map((b) => b.w * b.h)
    for (let i = 0; i < 5; i++) if (i !== 2) expect(area[2], `top more compact than ${i}`).toBeLessThan(area[i])
    expect(footSpan(sheet.air.frames[4])).toBeGreaterThanOrEqual(footSpan(sheet.air.frames[3]))
  })

  test('the landing (one frame: the frog hops again at once) is lower and wider than the sit', () => {
    expect(sheet.land.frames).toHaveLength(1)
    const sit = sheet.idle.frames[0].bounds()!
    const squash = sheet.land.frames[0].bounds()!
    expect(squash.y).toBeGreaterThan(sit.y)
    expect(squash.w).toBeGreaterThan(sit.w)
  })

  test('teal, not the meadow green; the red bandana in every idle and air frame', () => {
    for (const name of ['idle', 'air'] as const)
      for (const [i, f] of sheet[name].frames.entries()) {
        expect(has(f, BANDANA), `${name} ${i} bandana`).toBe(true)
        expect(has(f, SKIN), `${name} ${i} skin`).toBe(true)
        const count = new Map<number, number>()
        for (const c of f.data) if (c) count.set(c, (count.get(c) ?? 0) + 1)
        const dominant = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
        expect(GRASS.has(dominant), `${name} ${i} dominant colour`).toBe(false)
        for (const c of SKIN) expect(GRASS.has(c)).toBe(false)
      }
  })

  test('idle keeps its lowest row on the anchor row', () => {
    for (const [i, f] of sheet.idle.frames.entries()) {
      const b = f.bounds()!
      expect(b.y + b.h - 1, `idle ${i}`).toBeGreaterThanOrEqual(59)
      expect(b.y + b.h - 1, `idle ${i}`).toBeLessThanOrEqual(61)
    }
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

  test('sitting, he is about as wide as his 42×42 box', () => {
    const b = sheet.idle.frames[0].bounds()!
    expect(b.w).toBeGreaterThanOrEqual(36)
    expect(b.w).toBeLessThanOrEqual(44)
    expect(b.h).toBeLessThanOrEqual(40)
  })

  test('a frame draws fast enough for the browser', () => {
    for (let i = 0; i < 5; i++) drawFrog(frogPose({ throat: i * 0.1 }))
    const t0 = performance.now()
    for (let i = 0; i < 20; i++) drawFrog(frogPose({ throat: i * 0.05, spin: i % 2 ? -90 : 0 }))
    expect((performance.now() - t0) / 20).toBeLessThan(20)
  })
})
