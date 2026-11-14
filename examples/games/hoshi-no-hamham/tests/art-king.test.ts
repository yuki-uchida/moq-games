import { describe, expect, test } from 'vitest'
import { KING_MANTLE, KING_RAGE_RED } from '../src/art/chars/king'
import { bossSpecNext } from '../src/art/contract'
import { sheet } from '../src/art/index'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const ID = 'king'
const spec = bossSpecNext(ID)
const purple = new Set<number>([...R.kingPurple.slice(0, 4), KING_MANTLE[1]])
const crimson = new Set<number>(R.crimson.slice(0, 4))
const gold = new Set<number>(R.gold.slice(0, 4))
const red = new Set<number>([KING_RAGE_RED])

const box = (f: Raster) => f.bounds()!
const bottom = (f: Raster) => box(f).y + box(f).h - 1
const reach = (f: Raster) => box(f).x + box(f).w - 1
const count = (f: Raster, set: Set<number>, y0 = 0, y1 = f.h) => {
  let n = 0
  for (let y = y0; y < y1; y++) for (let x = 0; x < f.w; x++) if (set.has(f.get(x, y))) n++
  return n
}
/** The highest row holding a colour of the set. */
const topOf = (f: Raster, set: Set<number>) => {
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (set.has(f.get(x, y))) return y
  return f.h
}

describe('黒ハム王 (king) on the hamster kit', () => {
  const s = sheet(ID)

  test('every clip of the new spec is drawn with its frame count, timing and sustain', () => {
    for (const [name, want] of Object.entries(spec)) {
      expect(s[name], `${name} is missing`).toBeDefined()
      expect(s[name].frames.length, `${name} frames`).toBe(want.frames)
      expect(s[name].fps, `${name} fps`).toBe(want.fps)
      expect(s[name].loop, `${name} loop`).toBe(want.loop)
      expect(s[name].sustain, `${name} sustain`).toBe(want.sustain)
    }
  })

  test('dark purple, with the crimson cape and the gold crown in every idle and move frame', () => {
    for (const clip of ['idle', 'move'])
      for (const [i, f] of s[clip].frames.entries()) {
        expect(count(f, purple) / f.count(), `${clip} ${i} is mostly purple`).toBeGreaterThan(0.35)
        expect(count(f, crimson), `${clip} ${i} wears the cape`).toBeGreaterThan(150)
        expect(count(f, gold), `${clip} ${i} wears the crown`).toBeGreaterThan(60)
      }
  })

  test('he towers over the hero: at least three times the painted area of her idle', () => {
    const hero = sheet('hero').idle.frames[0].count()
    for (const f of s.idle.frames) expect(f.count()).toBeGreaterThanOrEqual(hero * 3)
  })

  test('the crown is the highest material when he stands', () => {
    for (const f of s.idle.frames) expect(topOf(f, gold)).toBe(box(f).y)
  })

  test('the charge reaches further forward than standing', () => {
    const idle = Math.max(...s.idle.frames.map(reach))
    for (const f of s.attack.frames) expect(reach(f)).toBeGreaterThan(idle)
  })

  test('air: the top of the leap (cape spread) is the widest of the three', () => {
    const [up, top, down] = s.air.frames.map((f) => box(f).w)
    expect(top).toBeGreaterThan(up)
    expect(top).toBeGreaterThan(down)
  })

  test('the slam: land frame 0 is lower and wider than idle', () => {
    const idle = box(s.idle.frames[0])
    const slam = box(s.land.frames[0])
    expect(slam.y).toBeGreaterThan(idle.y)
    expect(slam.w).toBeGreaterThan(idle.w)
  })

  test('the cast: shoot frame 3 (the hit frame) reaches furthest forward of its clip', () => {
    const reaches = s.shoot.frames.map(reach)
    expect(spec.shoot.hit).toBe(3)
    expect(reaches[3]).toBe(Math.max(...reaches))
    for (const [i, r] of reaches.entries()) if (i !== 3) expect(r).toBeLessThan(reaches[3])
  })

  test('red eyes appear only in the rage, and there in the second half', () => {
    for (const [name, anim] of Object.entries(s))
      for (const [i, f] of anim.frames.entries()) if (name !== 'rage') expect(count(f, red), `${name} ${i}`).toBe(0)
    for (const f of s.rage.frames.slice(3)) expect(count(f, red)).toBeGreaterThan(6)
  })

  test('the rage: dark fire grows behind him', () => {
    const fire = new Set<number>(R.dark.slice(0, 3))
    const n = s.rage.frames.map((f) => count(f, fire))
    expect(n[6]).toBeGreaterThan(n[0] * 3)
    expect(n[6]).toBeGreaterThan(800)
  })

  test('defeat ends low and flat, with the crown on the ground away from his head', () => {
    const idle = box(s.idle.frames[0])
    for (const f of s.defeat.frames.slice(-2)) {
      const b = box(f)
      expect(b.w).toBeGreaterThan(b.h)
      expect(b.h).toBeLessThan(idle.h * 0.85)
      // the crown lies in the lower half of the picture, at the far right, not on the head at the left
      const crownTop = topOf(f, gold)
      expect(crownTop).toBeGreaterThan(b.y + b.h * 0.3)
      let gx = 0
      let gn = 0
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++)
          if (gold.has(f.get(x, y))) {
            gx += x
            gn++
          }
      expect(gx / gn).toBeGreaterThan(b.x + b.w * 0.75)
    }
  })

  test('every frame stays at least 1 px clear of the cell edge', () => {
    for (const [name, anim] of Object.entries(s))
      for (const [i, f] of anim.frames.entries()) {
        const b = box(f)
        expect(b.x, `${name} ${i}`).toBeGreaterThanOrEqual(1)
        expect(b.y, `${name} ${i}`).toBeGreaterThanOrEqual(1)
        expect(b.x + b.w, `${name} ${i}`).toBeLessThanOrEqual(f.w - 1)
        expect(b.y + b.h, `${name} ${i}`).toBeLessThanOrEqual(f.h - 1)
      }
  })

  test('standing clips keep their lowest row on the anchor (rows 118–123)', () => {
    for (const name of ['idle', 'intro', 'hurt', 'move', 'windup', 'attack', 'land', 'shoot', 'recover', 'rage'])
      for (const [i, f] of s[name].frames.entries()) {
        expect(bottom(f), `${name} ${i}`).toBeGreaterThanOrEqual(118)
        expect(bottom(f), `${name} ${i}`).toBeLessThanOrEqual(123)
      }
  })
})
