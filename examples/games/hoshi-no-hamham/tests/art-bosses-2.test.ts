import { describe, expect, test } from 'vitest'
import { missingAnims, sheet } from '../src/art/index'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const BOSSES = ['boarBoss', 'wolfBoss'] as const

const bandana = new Set<number>(R.bandana)

/** Painted-pixel bounds of a frame. */
const bounds = (f: Raster) => f.bounds()!

const width = (frames: Raster[]) => Math.max(...frames.map((f) => bounds(f).w))
const right = (frames: Raster[]) => Math.max(...frames.map((f) => bounds(f).x + bounds(f).w))
const area = (f: Raster) => f.count()

describe('boar and wolf bosses are fully drawn', () => {
  for (const id of BOSSES) {
    test(`${id} has no stand-in clips`, () => {
      expect(missingAnims(id)).toEqual([])
    })

    test(`${id} stretches into the charge`, () => {
      const s = sheet(id)
      expect(width(s.attack.frames), `${id} attack width`).toBeGreaterThan(width(s.idle.frames))
      expect(right(s.attack.frames), `${id} attack reach`).toBeGreaterThan(right(s.idle.frames))
    })

    test(`${id} wears the gang's red in idle`, () => {
      for (const f of sheet(id).idle.frames) expect([...f.colors()].some((c) => bandana.has(c))).toBe(true)
    })
  }

  test('the boar is the heavier of the two', () => {
    const boar = sheet('boarBoss').idle.frames
    const wolf = sheet('wolfBoss').idle.frames
    // The redrawn wolf has a bigger head and a fuller coat than the old one; the boar still outweighs him.
    boar.forEach((f, i) => expect(area(f) / area(wolf[i % wolf.length])).toBeGreaterThanOrEqual(1.05))
  })

  test('the two idle silhouettes differ clearly', () => {
    const boar = sheet('boarBoss').idle.frames[0]
    const wolf = sheet('wolfBoss').idle.frames[0]
    let differing = 0
    let painted = 0
    for (let i = 0; i < boar.data.length; i++) {
      const a = boar.data[i] !== 0
      const b = wolf.data[i] !== 0
      if (a || b) painted++
      if (a !== b) differing++
    }
    expect(differing / painted).toBeGreaterThan(0.35)
  })
})
