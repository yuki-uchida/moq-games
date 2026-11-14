import { describe, expect, test } from 'vitest'
import { missingAnims, sheet } from '../src/art/index'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const mask = (r: Raster) => Array.from(r.data, (c) => c !== 0)
/** Share of differing pixels, relative to the larger of the two masks. */
const differ = (a: Raster, b: Raster) => {
  const ma = mask(a)
  const mb = mask(b)
  let diff = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < ma.length; i++) {
    if (ma[i] !== mb[i]) diff++
    if (ma[i]) na++
    if (mb[i]) nb++
  }
  return diff / Math.max(na, nb)
}
const lowest = (r: Raster) => {
  const b = r.bounds()!
  return b.y + b.h - 1
}
const usesBandana = (r: Raster) => R.bandana.some((c) => r.colors().has(c))

describe('きつね旋風 and ハチ女王', () => {
  test('every clip is drawn', () => {
    expect(missingAnims('foxBoss')).toEqual([])
    expect(missingAnims('beeBoss')).toEqual([])
  })

  test('the fox spin dash is a round wheel and every frame turns', () => {
    const frames = sheet('foxBoss').attack.frames
    for (const f of frames) {
      const b = f.bounds()!
      expect(Math.abs(b.w - b.h) / b.h, 'attack frame is round').toBeLessThan(0.25)
    }
    for (let i = 0; i < frames.length; i++)
      for (let j = i + 1; j < frames.length; j++)
        expect(differ(frames[i], frames[j]), `attack ${i} vs ${j}`).toBeGreaterThan(0.15)
  })

  test('the queen hovers just above the floor', () => {
    for (const f of sheet('beeBoss').idle.frames) {
      const y = lowest(f)
      // Her feet hang 4 to 16 px above the anchor row (120).
      expect(y).toBeGreaterThanOrEqual(104)
      expect(y).toBeLessThanOrEqual(116)
    }
  })

  test('both bosses wear the gang red', () => {
    for (const id of ['foxBoss', 'beeBoss'])
      for (const f of sheet(id).idle.frames) expect(usesBandana(f), id).toBe(true)
  })

  test('the two idle silhouettes are clearly different', () => {
    expect(differ(sheet('foxBoss').idle.frames[0], sheet('beeBoss').idle.frames[0])).toBeGreaterThan(0.35)
  })
})
