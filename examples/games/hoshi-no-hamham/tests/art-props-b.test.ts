import { describe, expect, test } from 'vitest'
import { allSheetSpecs } from '../src/art/contract'
import { missingAnims, sheet } from '../src/art/index'
import { rgbOf } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const SHEETS = [
  'prop:switch1',
  'prop:switch2',
  'prop:door1',
  'prop:door2',
  'prop:gate',
  'prop:goal',
  'prop:nest',
  'prop:cage',
  'prop:fruit',
  'prop:star',
  'prop:twig',
  'prop:berry',
  'prop:seed',
  'prop:feather',
  'prop:stinger',
  'prop:orb',
  'prop:shock',
  'prop:bee'
]
const SMALL = SHEETS.slice(8)

/** Brightness class of a pixel, so two things that differ only in hue do not count as different shapes. */
const tone = (c: number) => {
  if (!c) return -1
  const [r, g, b] = rgbOf(c)
  return Math.min(5, Math.floor((0.3 * r + 0.59 * g + 0.11 * b) / 43))
}

/** Share of pixels, among those painted in either picture, that differ in shape or brightness. */
function shapeDifference(a: Raster, b: Raster) {
  let painted = 0
  let differ = 0
  for (let i = 0; i < a.data.length; i++) {
    if (!a.data[i] && !b.data[i]) continue
    painted++
    if (tone(a.data[i]) !== tone(b.data[i])) differ++
  }
  return differ / painted
}

describe('props B are all drawn', () => {
  for (const id of SHEETS)
    test(id, () => {
      expect(missingAnims(id), `${id} still has stand-ins`).toEqual([])
      for (const name of Object.keys(allSheetSpecs()[id])) expect(sheet(id)[name]).toBeDefined()
    })
})

describe('doors tile and carry their own emblem', () => {
  for (const id of ['prop:door1', 'prop:door2', 'prop:gate'])
    test(`${id} mid has matching top and bottom rows`, () => {
      for (const [i, f] of sheet(id).mid.frames.entries()) {
        for (let x = 0; x < f.w; x++) expect(f.get(x, 0), `${id} frame ${i} column ${x}`).toBe(f.get(x, f.h - 1))
      }
    })

  test('the sun and moon switches differ in shape, not only in colour', () => {
    const a = sheet('prop:switch1').off.frames[0]
    const b = sheet('prop:switch2').off.frames[0]
    expect(shapeDifference(a, b)).toBeGreaterThan(0.05)
  })

  test('the sun and moon door caps differ in shape, not only in colour', () => {
    const a = sheet('prop:door1').top.frames[0]
    const b = sheet('prop:door2').top.frames[0]
    expect(shapeDifference(a, b)).toBeGreaterThan(0.05)
  })

  for (const id of ['prop:door1', 'prop:door2'])
    for (const part of ['top', 'mid', 'bottom'])
      test(`${id} ${part} fills its cell`, () => {
        for (const f of sheet(id)[part].frames) expect(f.count() / (f.w * f.h)).toBeGreaterThanOrEqual(0.85)
      })
})

describe('the goal flag stands in its cell', () => {
  for (const name of ['locked', 'open'])
    test(name, () => {
      for (const [i, f] of sheet('prop:goal')[name].frames.entries())
        for (let y = 72; y < 120; y++) {
          let pole = 0
          for (let x = 0; x < 64; x++) if (f.get(x, y)) pole++
          expect(pole, `frame ${i} row ${y} has no pole`).toBeGreaterThan(0)
        }
    })
})

describe('pickups and projectiles keep clear of the frame edge', () => {
  for (const id of SMALL)
    test(id, () => {
      for (const [name, a] of Object.entries(sheet(id)))
        for (const [i, f] of a.frames.entries()) {
          const b = f.bounds()!
          expect(b.x, `${id}#${name} ${i} left`).toBeGreaterThanOrEqual(1)
          expect(b.y, `${id}#${name} ${i} top`).toBeGreaterThanOrEqual(1)
          expect(b.x + b.w, `${id}#${name} ${i} right`).toBeLessThanOrEqual(f.w - 1)
          expect(b.y + b.h, `${id}#${name} ${i} bottom`).toBeLessThanOrEqual(f.h - 1)
        }
    })
})

describe('the shockwave and the stinger', () => {
  const rowsMass = (f: Raster) => {
    const b = f.bounds()!
    const mid = b.y + b.h / 2
    let top = 0
    let bottom = 0
    for (let y = b.y; y < b.y + b.h; y++) for (let x = 0; x < f.w; x++) if (f.get(x, y)) y < mid ? top++ : bottom++
    return { top, bottom }
  }

  test('the shockwave is densest in its lower half', () => {
    for (const [i, f] of sheet('prop:shock').roll.frames.entries()) {
      const { top, bottom } = rowsMass(f)
      expect(bottom, `frame ${i}`).toBeGreaterThan(top)
    }
  })

  test('the stinger ends in a single dark tip', () => {
    for (const [i, f] of sheet('prop:stinger').fly.frames.entries()) {
      const b = f.bounds()!
      const x = b.x + b.w - 1
      const tip: number[] = []
      for (let y = 0; y < f.h; y++) if (f.get(x, y)) tip.push(f.get(x, y))
      expect(tip.length, `frame ${i}`).toBe(1)
      const [r, g, bl] = rgbOf(tip[0])
      expect(r + g + bl, `frame ${i} tip is dark`).toBeLessThan(120)
    }
  })
})
