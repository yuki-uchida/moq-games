import { describe, expect, test } from 'vitest'
import { hamPose } from '../src/art/chars/hamster'
import { drawHam } from '../src/art/chars/hero'
import { MOM_LOOK, sheets } from '../src/art/chars/mom'
import { MOM_SPEC } from '../src/art/contract'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'
import type { Sheet } from '../src/art/sheet'

const mom = () => sheets.mom() as Sheet
const pixels = (f: Raster, colours: readonly number[]) => {
  const out: [number, number][] = []
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (colours.includes(f.get(x, y))) out.push([x, y])
  return out
}
const ORANGE = R.momOrange
const PAPER = R.paper.slice(0, 3)
const STEEL = R.steel.slice(0, 4)
const PINK = R.hamEar.slice(0, 3)
const bottom = (f: Raster) => f.bounds()!.y + f.bounds()!.h - 1
const top = (f: Raster) => f.bounds()!.y
/** The topmost painted pixel and its colour. */
const peak = (f: Raster) => {
  const y = top(f)
  for (let x = 0; x < f.w; x++) if (f.get(x, y)) return { x, y, c: f.get(x, y) }
  throw new Error('empty frame')
}
/** The topmost steel pixel (the ladle's bowl, wherever it is). */
const ladleTop = (f: Raster) => {
  const px = pixels(f, STEEL)
  const y = Math.min(...px.map((p) => p[1]))
  return `${Math.min(...px.filter((p) => p[1] === y).map((p) => p[0]))},${y}`
}
/** Rows y0..y1 of the front half of a frame as one string (to compare where the front foot is). */
const rows = (f: Raster, y0: number, y1: number) => {
  let s = ''
  for (let y = y0; y <= y1; y++) for (let x = f.w / 2; x < f.w; x++) s += f.get(x, y) ? '#' : '.'
  return s
}

describe('mom sheet', () => {
  test('every clip of MOM_SPEC is drawn with its frame count, timing, loop and sustain', () => {
    const s = mom()
    for (const [name, spec] of Object.entries(MOM_SPEC)) {
      expect(s[name], name).toBeDefined()
      expect(s[name].frames.length, name).toBe(spec.frames)
      expect(s[name].fps, name).toBe(spec.fps)
      expect(s[name].loop, name).toBe(spec.loop)
      expect(s[name].sustain ?? 0, name).toBe(spec.sustain ?? 0)
    }
  })

  test('orange, in a white apron, with the steel ladle in every idle and run frame', () => {
    const s = mom()
    for (const f of [...s.idle.frames, ...s.move.frames]) {
      // mostly orange (the run shows more apron and strings)
      expect(pixels(f, ORANGE).length).toBeGreaterThan(f.count() * (s.idle.frames.includes(f) ? 0.4 : 0.3))
      expect(pixels(f, ORANGE).length).toBeGreaterThan(pixels(f, PAPER).length)
      expect(pixels(f, PAPER).length).toBeGreaterThan(60)
      expect(pixels(f, STEEL).length).toBeGreaterThan(25)
    }
  })

  test('pink curlers sit on top of the head', () => {
    for (const f of mom().idle.frames) {
      const pink = pixels(f, PINK)
      const orange = pixels(f, ORANGE.slice(0, 2))
      expect(pink.length).toBeGreaterThan(30)
      // the curlers are the top of the head: no fur above the highest curler pixel but the ears
      const pinkTop = Math.min(...pink.map((p) => p[1]))
      const head = Math.min(...orange.map((p) => p[1]))
      expect(pinkTop).toBeLessThanOrEqual(head + 6)
      // and they lie in the upper fifth of the figure
      expect(pinkTop - top(f)).toBeLessThan(f.bounds()!.h / 5)
    }
  })

  test('a quarter bigger than her son: at least 1.3× his painted area, wider than him, about 60 px tall', () => {
    const f = mom().idle.frames[0]
    const hero = drawHam(hamPose())
    expect(f.count()).toBeGreaterThanOrEqual(hero.count() * 1.3)
    expect(f.bounds()!.w).toBeGreaterThan(hero.bounds()!.w)
    expect(f.bounds()!.h).toBeGreaterThanOrEqual(56)
    expect(f.bounds()!.h).toBeLessThanOrEqual(64)
    expect(MOM_LOOK.scale).toBeGreaterThanOrEqual(1.25)
  })

  test('yell: the ladle bowl is the highest point while she bellows', () => {
    const fr = mom().yell.frames
    for (const f of fr.slice(2)) expect(STEEL).toContain(peak(f).c)
    // the anticipation draws her up first: the head rises before the lean
    expect(top(fr[1])).toBeLessThan(top(fr[0]))
  })

  test('move: the ladle jolts through the run (its bowl takes several positions)', () => {
    const tops = mom().move.frames.map(ladleTop)
    expect(new Set(tops).size).toBeGreaterThanOrEqual(4)
  })

  test('idle: the near foot taps (the lowest rows change on exactly the two tapping frames)', () => {
    const fr = mom().idle.frames
    const feet = fr.map((f) => rows(f, 87, 90))
    // the toe is raised on the other frames (by different amounts) and slaps down flat on 1 and 5
    const down = feet[1]
    const tapping = feet.map((r, i) => (r === down ? i : -1)).filter((i) => i >= 0)
    expect(tapping).toEqual([1, 5])
    expect(feet[0]).not.toBe(down)
    expect(feet[1]).toBe(feet[5])
  })

  test('tired: bent over, lower than when standing', () => {
    const s = mom()
    const idleTop = Math.max(...s.idle.frames.map(top))
    for (const f of s.tired.frames) expect(top(f)).toBeGreaterThan(idleTop + 2)
  })

  test('every frame stays 1 px clear of the 96×96 cell; standing clips stand on rows 88–93', () => {
    const s = mom()
    for (const [name, anim] of Object.entries(s))
      anim.frames.forEach((f, i) => {
        const b = f.bounds()!
        expect(b.x, `${name} ${i}`).toBeGreaterThanOrEqual(1)
        expect(b.y, `${name} ${i}`).toBeGreaterThanOrEqual(1)
        expect(b.x + b.w, `${name} ${i}`).toBeLessThanOrEqual(95)
        expect(b.y + b.h, `${name} ${i}`).toBeLessThanOrEqual(95)
        expect(bottom(f), `${name} ${i}`).toBeGreaterThanOrEqual(88)
        expect(bottom(f), `${name} ${i}`).toBeLessThanOrEqual(93)
      })
  })
})
