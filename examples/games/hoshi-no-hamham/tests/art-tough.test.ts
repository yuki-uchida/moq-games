import { describe, expect, test } from 'vitest'
import { drawMole, molePose, toughSheet } from '../src/art/chars/enemies/tough'
import { walkerSheet } from '../src/art/chars/enemies/walker'
import { ENEMY_NEXT } from '../src/art/contract'
import { C, R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const sheet = toughSheet()
const STANDING = ['idle', 'move'] as const
const STEEL = new Set<number>(R.steel.slice(0, 4))
const BANDANA = new Set<number>(R.bandana.slice(0, 4))

/** Painted pixels of the frame whose colour is in `set`. */
function pixels(f: Raster, set: Set<number>) {
  const out: [number, number][] = []
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (set.has(f.get(x, y))) out.push([x, y])
  return out
}

/** The highest row with a steel pixel: the top of the helmet. */
const helmetTop = (f: Raster) => Math.min(...pixels(f, STEEL).map(([, y]) => y))

/** Mean position of the steel pixels. */
function steelCentre(f: Raster): [number, number] {
  const p = pixels(f, STEEL)
  return [p.reduce((s, [x]) => s + x, 0) / p.length, p.reduce((s, [, y]) => s + y, 0) / p.length]
}

describe('tough (モグラ隊長) on the rig', () => {
  test('every clip of the spec is drawn with its frame count, fps and loop', () => {
    for (const [name, spec] of Object.entries(ENEMY_NEXT.tough)) {
      const a = sheet[name as keyof typeof sheet]
      expect(a, name).toBeDefined()
      expect(a.frames.length, name).toBe(spec.frames)
      expect(a.fps, name).toBe(spec.fps)
      expect(a.loop, name).toBe(spec.loop)
    }
  })

  test('he is the heavy: at least 1.25× the rat’s painted area in idle, and he nearly fills his 52×50 box', () => {
    const rat = walkerSheet().idle.frames[0].count()
    for (const [i, f] of sheet.idle.frames.entries()) {
      expect(f.count() / rat, `idle ${i}`).toBeGreaterThanOrEqual(1.25)
      const b = f.bounds()!
      expect(b.w, `idle ${i} width`).toBeGreaterThanOrEqual(44)
      expect(b.w, `idle ${i} width`).toBeLessThanOrEqual(52)
      expect(b.h, `idle ${i} height`).toBeGreaterThanOrEqual(44)
      expect(b.h, `idle ${i} height`).toBeLessThanOrEqual(50)
    }
  })

  test('the steel helmet is on top of his head in every idle and move frame', () => {
    for (const name of STANDING)
      for (const [i, f] of sheet[name].frames.entries()) {
        const b = f.bounds()!
        // the first rows of the silhouette are steel (its cool outline aside)
        const top = pixels(f, STEEL).filter(([, y]) => y <= b.y + 3).length
        expect(top, `${name} ${i}`).toBeGreaterThanOrEqual(12)
        expect(helmetTop(f), `${name} ${i}`).toBeLessThanOrEqual(b.y + 1)
      }
  })

  test('the eye whites show in every idle and move frame (the claws never cover the face)', () => {
    for (const name of STANDING)
      for (const [i, f] of sheet[name].frames.entries()) {
        const whites = pixels(f, new Set([C.white]))
        expect(whites.length, `${name} ${i}`).toBeGreaterThanOrEqual(6)
        // and they sit under the brim, on the face, not somewhere else
        const top = helmetTop(f)
        for (const [x, y] of whites) {
          expect(y, `${name} ${i} white at ${x},${y}`).toBeGreaterThan(top + 6)
          expect(y, `${name} ${i} white at ${x},${y}`).toBeLessThan(top + 22)
        }
      }
  })

  test('the helmet bobs through the march and jumps off his head when he is bitten', () => {
    const tops = sheet.move.frames.map(helmetTop)
    expect(new Set(tops).size, tops.join()).toBeGreaterThanOrEqual(2)
    expect(helmetTop(sheet.idle.frames[0]) - helmetTop(sheet.hurt.frames[0])).toBeGreaterThanOrEqual(3)
  })

  test('the knock-out sends the helmet from the top of his head to the ground beside him', () => {
    const frames = sheet.defeat.frames
    const [x0, y0] = steelCentre(frames[0])
    const [x1, y1] = steelCentre(frames[frames.length - 1])
    expect(y0, 'starts high').toBeLessThan(28)
    expect(y1, 'ends on the ground').toBeGreaterThan(48)
    // away from his head, which lies at the left
    expect(x1).toBeGreaterThan(x0 + 6)
  })

  test('the red bandana shows in every idle and move frame', () => {
    for (const name of STANDING)
      for (const [i, f] of sheet[name].frames.entries())
        expect(pixels(f, BANDANA).length, `${name} ${i}`).toBeGreaterThanOrEqual(10)
  })

  test('idle and move keep their lowest row on the anchor row', () => {
    for (const name of STANDING)
      for (const [i, f] of sheet[name].frames.entries()) {
        const b = f.bounds()!
        expect(b.y + b.h - 1, `${name} ${i}`).toBeGreaterThanOrEqual(59)
        expect(b.y + b.h - 1, `${name} ${i}`).toBeLessThanOrEqual(61)
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

  test('a frame draws fast enough for the browser', () => {
    for (let i = 0; i < 5; i++) drawMole(molePose({ squash: i * 0.1 }))
    const t0 = performance.now()
    for (let i = 0; i < 20; i++) drawMole(molePose({ squash: i * 0.05, spin: i % 2 ? -60 : 0 }))
    expect((performance.now() - t0) / 20).toBeLessThan(20)
  })
})
