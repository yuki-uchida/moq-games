import { describe, expect, test } from 'vitest'
import { missingAnims, sheet } from '../src/art/index'
import { C, R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const reach = (f: Raster) => {
  const b = f.bounds()!
  return b.x + b.w - 1
}

/** Pixels of the given colours, optionally only in rows [y0, y1). */
const count = (f: Raster, colours: readonly number[], y0 = 0, y1 = f.h) => {
  let n = 0
  for (let y = y0; y < y1; y++) for (let x = 0; x < f.w; x++) if (colours.includes(f.get(x, y))) n++
  return n
}

describe('黒ハム王 (king)', () => {
  test('every clip is drawn', () => {
    expect(missingAnims('king')).toEqual([])
  })

  test('he is far bigger than the hero', () => {
    const king = sheet('king').idle.frames[0].count()
    const hero = sheet('hero').idle.frames[0].count()
    expect(king).toBeGreaterThanOrEqual(hero * 3.5)
  })

  test('he is built like a hamster: lilac lower face, round pink-lined ears, glowing eyes', () => {
    const f = sheet('king').idle.frames[0]
    const b = f.bounds()!
    const face = b.y + Math.round(b.h * 0.6)
    // the lilac patch hugs the front of the face in the upper part of the egg
    expect(count(f, [R.kingBelly[1]], b.y, face)).toBeGreaterThan(150)
    // inner ears
    expect(count(f, [R.hamEar[1], R.hamEar[2]])).toBeGreaterThan(60)
    // big glowing yellow eyes with a dark slit
    expect(count(f, [C.glow, R.fire[1]])).toBeGreaterThan(40)
  })

  test('nothing pokes out in front of the face like a snout', () => {
    const k = sheet('king')
    for (const f of k.idle.frames) expect(reach(f)).toBeLessThan(108)
  })

  test('the charge reaches further forward than standing', () => {
    const k = sheet('king')
    const idle = Math.max(...k.idle.frames.map(reach))
    for (const f of k.attack.frames) expect(reach(f)).toBeGreaterThan(idle)
  })

  test('the cape spreads on the way down', () => {
    const { air } = sheet('king')
    expect(air.frames[1].bounds()!.w).toBeGreaterThan(air.frames[0].bounds()!.w)
  })

  test('the slam flattens him', () => {
    const k = sheet('king')
    expect(k.land.frames[0].bounds()!.h).toBeLessThan(k.idle.frames[0].bounds()!.h)
  })

  test('rage: dark flames grow behind him and his eyes turn red', () => {
    const { rage } = sheet('king')
    const flame = [R.dark[1], R.dark[2]]
    expect(count(rage.frames[4], flame)).toBeGreaterThan(count(rage.frames[0], flame) * 2)
    for (const f of rage.frames.slice(2)) {
      expect(count(f, flame)).toBeGreaterThan(400)
      expect(count(f, [R.fire[1]])).toBe(0)
    }
    // the flames change from frame to frame
    for (let i = 1; i < rage.frames.length; i++) expect(rage.frames[i].equals(rage.frames[i - 1])).toBe(false)
  })

  test('defeat ends lying on his back with the crown on the ground beside him', () => {
    const { defeat, idle } = sheet('king')
    const last = defeat.frames[defeat.frames.length - 1]
    const b = last.bounds()!
    expect(b.w).toBeGreaterThan(b.h)
    expect(b.h).toBeLessThan(idle.frames[0].bounds()!.h * 0.8)
    // the crown lies low, not on his head
    const gold = R.gold.slice(0, 3)
    expect(count(last, gold, 0, b.y + Math.round(b.h / 2))).toBeLessThan(count(last, gold) * 0.25)
  })
})
