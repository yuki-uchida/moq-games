import { describe, expect, test } from 'vitest'
import { R } from '../src/art/palette'
import { missingAnims, sheet } from '../src/art/index'
import type { Raster } from '../src/art/raster'

const widthOf = (f: Raster) => f.bounds()!.w
const heightOf = (f: Raster) => f.bounds()!.h
const usesBandana = (f: Raster) => R.bandana.some((c) => f.colors().has(c))

/** Fraction of the union of two painted masks that is painted in only one of them. */
function maskDifference(a: Raster, b: Raster) {
  let union = 0
  let diff = 0
  for (let i = 0; i < a.data.length; i++) {
    const pa = a.data[i] !== 0
    const pb = b.data[i] !== 0
    if (pa || pb) union++
    if (pa !== pb) diff++
  }
  return diff / union
}

describe('bosses 1: カラス助 and いたち丞相', () => {
  test('every clip is drawn', () => {
    expect(missingAnims('crowBoss')).toEqual([])
    expect(missingAnims('weaselBoss')).toEqual([])
  })

  test('the crow spreads 100 px of wing in idle and folds them in the dive', () => {
    const s = sheet('crowBoss')
    const widest = Math.max(...s.idle.frames.map(widthOf))
    expect(widest).toBeGreaterThanOrEqual(100)
    for (const f of s.attack.frames) expect(widthOf(f)).toBeLessThan(widest)
  })

  test('the weasel is long and low in the charge and upright in idle', () => {
    const s = sheet('weaselBoss')
    for (const f of s.attack.frames) expect(widthOf(f)).toBeGreaterThanOrEqual(1.5 * heightOf(f))
    for (const f of s.idle.frames) expect(heightOf(f)).toBeGreaterThan(widthOf(f))
  })

  test('both wear the gang bandana', () => {
    for (const id of ['crowBoss', 'weaselBoss'])
      for (const f of sheet(id).idle.frames) expect(usesBandana(f), `${id} idle bandana`).toBe(true)
  })

  test('the two idle silhouettes differ', () => {
    const crow = sheet('crowBoss').idle.frames
    const weasel = sheet('weaselBoss').idle.frames
    for (const [i, c] of crow.entries()) expect(maskDifference(c, weasel[i])).toBeGreaterThan(0.4)
  })
})
