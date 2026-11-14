import { describe, expect, test } from 'vitest'
import { crowPose, crowRig, drawCrow, flyerSheet, movePoses } from '../src/art/chars/enemies/flyer'
import { ENEMY_SPEC } from '../src/art/contract'
import { R } from '../src/art/palette'
import { centroid } from '../src/art/quality'
import type { Raster } from '../src/art/raster'

const sheet = flyerSheet()
const BANDANA = new Set<number>(R.bandana.slice(0, 4))
const BEAK = new Set<number>(R.beak.slice(0, 2))

const has = (f: Raster, set: Set<number>) => [...f.colors()].some((c) => set.has(c))

describe('flyer (子ガラス) on the rig', () => {
  test('every clip of the spec is drawn with its frame count, fps and loop', () => {
    for (const [name, spec] of Object.entries(ENEMY_SPEC.flyer)) {
      const a = sheet[name as keyof typeof sheet]
      expect(a, name).toBeDefined()
      expect(a.frames.length, name).toBe(spec.frames)
      expect(a.fps, name).toBe(spec.fps)
      expect(a.loop, name).toBe(spec.loop)
    }
  })

  test('in the flap the body sits in its hit box (centre of mass between y = 36 and 50)', () => {
    for (const [i, f] of sheet.move.frames.entries()) {
      const [, y] = centroid(f)!
      expect(y, `move ${i}`).toBeGreaterThanOrEqual(36)
      expect(y, `move ${i}`).toBeLessThanOrEqual(50)
    }
  })

  test('the wings really flap: the tips travel at least 14 px up and down', () => {
    const tips = movePoses().map((p) => crowRig(p).tip[1])
    expect(Math.max(...tips) - Math.min(...tips)).toBeGreaterThanOrEqual(14)
    // and the drawing shows it: the top of the silhouette moves with the wings
    const tops = sheet.move.frames.map((f) => f.bounds()!.y)
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThanOrEqual(5)
  })

  test('a full flap: the wing tips rise 6 px above the crown and drop 6 px below the feet', () => {
    const rigs = movePoses().map(crowRig)
    const above = Math.max(...rigs.map((r) => r.crown - Math.min(r.tip[1], r.wingF.tip[1])))
    const below = Math.max(...rigs.map((r) => r.tip[1] - r.feet))
    expect(above).toBeGreaterThanOrEqual(6)
    expect(below).toBeGreaterThanOrEqual(6)
    // the drawing shows it: in the wings-high frame the highest pixels are the wing's, well above the head
    const high = rigs.findIndex((r) => r.tip[1] === Math.min(...rigs.map((q) => q.tip[1])))
    expect(sheet.move.frames[high].bounds()!.y).toBeLessThanOrEqual(rigs[high].crown - 6)
  })

  test('the frame is widest in mid-downstroke, with the near wing level', () => {
    const widths = sheet.move.frames.map((f) => f.bounds()!.w)
    const widest = widths.indexOf(Math.max(...widths))
    const arm = movePoses()[widest].wingN[0]
    // level: the arm points straight back (180°) within 20°, and the wing is on its way down (before wings-low)
    expect(Math.abs(arm - 180)).toBeLessThanOrEqual(20)
    const tips = movePoses().map((p) => crowRig(p).tip[1])
    expect(widest).toBeLessThan(tips.indexOf(Math.max(...tips)))
    expect(widest).toBeGreaterThan(tips.indexOf(Math.min(...tips)))
  })

  test('the body rides opposite to the wings: the head is highest when the wings are lowest', () => {
    const poses = movePoses()
    const tips = poses.map((p) => crowRig(p).tip[1])
    const heads = poses.map((p) => crowRig(p).head.pt(0, 0)[1])
    const low = tips.indexOf(Math.max(...tips))
    const high = tips.indexOf(Math.min(...tips))
    expect(heads[low]).toBe(Math.min(...heads))
    expect(heads[high]).toBeGreaterThan(heads[low])
  })

  test('the red head scarf and the yellow beak are in every move frame', () => {
    for (const [i, f] of sheet.move.frames.entries()) {
      expect(has(f, BANDANA), `move ${i} red`).toBe(true)
      expect(has(f, BEAK), `move ${i} beak`).toBe(true)
    }
  })

  test('he caws once per flap: the beak opens for two or three frames', () => {
    const open = movePoses().filter((p) => p.beak > 0.3).length
    expect(open).toBeGreaterThanOrEqual(2)
    expect(open).toBeLessThanOrEqual(3)
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
    for (let i = 0; i < 5; i++) drawCrow(crowPose({ squash: i * 0.1 }))
    const t0 = performance.now()
    for (let i = 0; i < 20; i++) drawCrow(crowPose({ squash: i * 0.05, spin: i % 2 ? -90 : 0, beak: i % 3 }))
    expect((performance.now() - t0) / 20).toBeLessThan(20)
  })
})
