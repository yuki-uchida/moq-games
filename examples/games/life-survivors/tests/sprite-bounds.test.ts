import { describe, expect, it } from 'vitest'
import { arsenalIcons, gambleFrames } from '../src/art/arsenal'
import { SHEETS } from '../src/art/index'
import { Raster } from '../src/art/raster'

function outOfCanvas(run: () => void) {
  const original = Raster.prototype.set
  const out: string[] = []
  Raster.prototype.set = function (this: Raster, x: number, y: number, c: number) {
    const rx = Math.round(x)
    const ry = Math.round(y)
    if (rx < 0 || ry < 0 || rx >= this.w || ry >= this.h) out.push(`${this.w}x${this.h}:${rx},${ry}`)
    return original.call(this, x, y, c)
  }
  try {
    run()
  } finally {
    Raster.prototype.set = original
  }
  return [...new Set(out)]
}

const sheets = [
  'weapon:p_over',
  'weapon:w_travel',
  ...['tricycle', 'bicycle', 'motorcycle', 'car', 'plane'].map((v) => `weapon:w_travel_${v}`),
  ...['cat', 'rabbit', 'parakeet', 'hamster'].map((v) => `weapon:w_pet_${v}`),
  'weapon:w_observe',
  'weapon:w_garden'
]

describe('sprite bounds', () => {
  for (const id of sheets) {
    it(`${id} stays inside its canvas`, () => {
      const make = (SHEETS as Record<string, () => unknown>)[id]
      expect(make).toBeTypeOf('function')
      expect(outOfCanvas(() => void make())).toEqual([])
    })
  }
  it('arsenal icons stay inside their canvas', () => {
    expect(outOfCanvas(() => void arsenalIcons())).toEqual([])
  })
  for (const kind of ['gacha', 'poker', 'pachinko', 'horse'] as const) {
    it(`gamble ${kind} stays inside its canvas`, () => {
      expect(outOfCanvas(() => void gambleFrames(kind))).toEqual([])
    })
  }
})
