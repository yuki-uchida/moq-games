import { describe, expect, test } from 'vitest'
import { NAVY, SILVER, SKIN, apePose, drawApe, sheets } from '../src/art/chars/bosses/ape'
import { sheets as wolfSheets } from '../src/art/chars/bosses/wolf'
import { bossSpecNext } from '../src/art/contract'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const sheet = sheets.apeBoss()
const wolf = wolfSheets.wolfBoss()
const set = (r: readonly number[]) => new Set<number>(r.slice(0, 4))
const CAP = set(NAVY)
const GOLD = set(R.gold)
const BAND = set(R.bandana)
const COAT = new Set<number>([...set(R.apeCharcoal), ...set(SILVER), ...set(SKIN)])

const has = (f: Raster, colours: Set<number>) => [...f.colors()].some((c) => colours.has(c))

/** Highest row holding any colour of the set (or Infinity). */
function top(f: Raster, colours: Set<number>) {
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (colours.has(f.get(x, y))) return y
  return Infinity
}

const bottom = (f: Raster) => f.bounds()!.y + f.bounds()!.h - 1

describe('ごりら警部 (apeBoss) on the rig', () => {
  test('every clip of the spec is drawn with its frame count, fps, loop and sustain', () => {
    for (const [name, spec] of Object.entries(bossSpecNext('apeBoss'))) {
      const a = sheet[name]
      expect(a, name).toBeDefined()
      expect(a!.frames.length, name).toBe(spec.frames)
      expect(a!.fps, name).toBe(spec.fps)
      expect(a!.loop, name).toBe(spec.loop)
      expect(a!.sustain, name).toBe(spec.sustain)
      if (a!.hold) expect(a!.hold.length, `${name} hold`).toBe(spec.frames)
    }
  })

  test('the biggest boss: at least 70 px wide on his knuckles and 1.3× the painted area of the wolf', () => {
    const idle = sheet.idle!.frames
    for (const [i, f] of idle.entries()) expect(f.bounds()!.w, `idle ${i} width`).toBeGreaterThanOrEqual(70)
    expect(idle[0].count()).toBeGreaterThanOrEqual(wolf.idle!.frames[0].count() * 1.3)
  })

  test('the navy cap is the highest material in idle; gold badge and gang red in every idle and move frame', () => {
    for (const [i, f] of sheet.idle!.frames.entries())
      expect(top(f, CAP), `idle ${i} cap above the coat`).toBeLessThan(top(f, COAT))
    for (const name of ['idle', 'move'])
      for (const [i, f] of sheet[name]!.frames.entries()) {
        expect(has(f, GOLD), `${name} ${i} badge`).toBe(true)
        expect(has(f, BAND), `${name} ${i} armband`).toBe(true)
      }
  })

  test('a fist touches the ground row in every idle frame', () => {
    for (const [i, f] of sheet.idle!.frames.entries()) {
      const y = bottom(f)
      expect(y, `idle ${i} on the anchor row`).toBeGreaterThanOrEqual(118)
      expect(y, `idle ${i} on the anchor row`).toBeLessThanOrEqual(121)
      let front = false
      for (let x = 70; x < f.w; x++) if (f.get(x, y) || f.get(x, y - 1)) front = true
      expect(front, `idle ${i} fist on the ground`).toBe(true)
    }
  })

  test('the wind-up crouches lower than idle; the slam lands lower and wider', () => {
    const stand = sheet.idle!.frames[0].bounds()!
    for (const [i, f] of sheet.windup!.frames.entries())
      expect(f.bounds()!.y, `windup ${i} top`).toBeGreaterThan(stand.y)
    const slam = sheet.land!.frames[0].bounds()!
    expect(slam.y).toBeGreaterThan(stand.y)
    expect(slam.w).toBeGreaterThan(stand.w)
  })

  test('rising, the arms are thrown above the head: the highest painted coat is above the cap', () => {
    const f = sheet.air!.frames[0]
    expect(top(f, COAT)).toBeLessThan(top(f, CAP))
  })

  test('every frame stays inside the cell with no isolated pixel and at most 28 colours', () => {
    for (const [name, anim] of Object.entries(sheet))
      for (const [i, f] of anim!.frames.entries()) {
        const b = f.bounds()!
        expect(b.x, `${name} ${i} left`).toBeGreaterThanOrEqual(1)
        expect(b.y, `${name} ${i} top`).toBeGreaterThanOrEqual(1)
        expect(b.x + b.w, `${name} ${i} right`).toBeLessThanOrEqual(f.w - 1)
        expect(b.y + b.h, `${name} ${i} bottom`).toBeLessThanOrEqual(f.h - 1)
        expect(f.colors().size, `${name} ${i} colours`).toBeLessThanOrEqual(28)
        // collect first, assert once (one expect per pixel is too slow for the test timeout)
        const isolated: string[] = []
        for (let y = 0; y < f.h; y++)
          for (let x = 0; x < f.w; x++)
            if (f.get(x, y) && !(f.get(x - 1, y) || f.get(x + 1, y) || f.get(x, y - 1) || f.get(x, y + 1)))
              isolated.push(`${x},${y}`)
        expect(isolated, `${name} ${i} isolated pixels`).toEqual([])
      }
  })

  test('a frame draws fast enough for the browser', () => {
    for (let i = 0; i < 3; i++) drawApe(apePose({ breath: i * 0.3 }))
    const t0 = performance.now()
    for (let i = 0; i < 10; i++) drawApe(apePose({ breath: i * 0.1, dust: i % 2 ? 0.3 : -1, stars: i / 10 }))
    expect((performance.now() - t0) / 10).toBeLessThan(25)
  })
})
