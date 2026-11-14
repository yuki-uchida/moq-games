import { describe, expect, test } from 'vitest'
import { bossSpec } from '../src/art/contract'
import { sheet } from '../src/art/index'
import { C, R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const ID = 'wolfBoss'
const ANCHOR_Y = 120
const spec = bossSpec(ID)
const grey = new Set<number>(R.wolfGray)
const red = new Set<number>(R.bandana)
/** The scar across the near eye (the portrait's fruit red). */
const scarRed = new Set<number>(R.fruitRed)

const box = (f: Raster) => f.bounds()!
const top = (f: Raster) => box(f).y
const bottom = (f: Raster) => box(f).y + box(f).h - 1
const count = (f: Raster, set: Set<number>) => {
  let n = 0
  for (const c of f.data) if (set.has(c)) n++
  return n
}

describe('おおかみ檄 (wolfBoss) on the rig', () => {
  const s = sheet(ID)

  test('every clip of the new spec is drawn', () => {
    for (const [name, want] of Object.entries(spec)) {
      expect(s[name], `${name} is missing`).toBeDefined()
      expect(s[name].frames.length, `${name} frames`).toBe(want.frames)
      expect(s[name].fps, `${name} fps`).toBe(want.fps)
      expect(s[name].loop, `${name} loop`).toBe(want.loop)
      expect(s[name].sustain, `${name} sustain`).toBe(want.sustain)
    }
  })

  test('he is a grey wolf wearing the gang red, with the scar on his head', () => {
    for (const [i, f] of s.idle.frames.entries()) {
      expect(count(f, grey) / f.count(), `idle ${i} is mostly grey`).toBeGreaterThan(0.4)
      expect(count(f, red), `idle ${i} wears the bandana`).toBeGreaterThan(40)
      // the scar sits in the head: the upper front part of the figure
      const b = box(f)
      let scar = 0
      for (let y = b.y; y < b.y + b.h / 2; y++)
        for (let x = b.x + (b.w >> 1); x < b.x + b.w; x++) if (scarRed.has(f.get(x, y))) scar++
      expect(scar, `idle ${i} shows the scar`).toBeGreaterThanOrEqual(6)
    }
  })

  test('the coat is lit and shaded, and the open mouth shows white teeth', () => {
    for (const [i, f] of s.idle.frames.entries()) {
      const tones = new Set([...f.data].filter((c) => grey.has(c)))
      expect(tones.size, `idle ${i} coat values`).toBeGreaterThanOrEqual(3)
    }
    for (const [i, f] of s.attack.frames.entries()) {
      const b = box(f)
      let white = 0
      for (let y = b.y; y < b.y + b.h / 2; y++)
        for (let x = b.x + (b.w >> 1); x < b.x + b.w; x++) if (f.get(x, y) === C.white) white++
      expect(white, `attack ${i} teeth`).toBeGreaterThanOrEqual(4)
    }
  })

  test('he fills the boss box and towers over the hero', () => {
    const hero = sheet('hero').idle.frames
    const heroArea = hero.reduce((a, f) => a + f.count(), 0) / hero.length
    for (const f of s.idle.frames) {
      expect(box(f).w).toBeGreaterThanOrEqual(70)
      expect(box(f).h).toBeGreaterThanOrEqual(46)
      expect(f.count()).toBeGreaterThan(heroArea * 2)
    }
  })

  test('the charge is longer and lower than idle and leaves the ground', () => {
    const w = (fs: Raster[]) => Math.max(...fs.map((f) => box(f).w))
    const h = (fs: Raster[]) => Math.max(...fs.map((f) => box(f).h))
    expect(w(s.attack.frames)).toBeGreaterThan(w(s.idle.frames))
    expect(h(s.attack.frames)).toBeLessThan(h(s.idle.frames))
    expect(
      s.attack.frames.some((f) => bottom(f) <= ANCHOR_Y - 3),
      'all four paws off the ground'
    ).toBe(true)
  })

  test('the howl lifts the head well above its idle height', () => {
    const idleTop = Math.min(...s.idle.frames.map(top))
    expect(Math.min(...s.intro.frames.map(top))).toBeLessThanOrEqual(idleTop - 12)
  })

  test('stunned and defeat end lower than idle', () => {
    const idleTop = Math.max(...s.idle.frames.map(top))
    expect(top(s.defeat.frames.at(-1)!)).toBeGreaterThan(idleTop + 10)
    expect(top(s.stunned.frames.at(-1)!)).toBeLessThan(idleTop) // sat up: the head is high…
    expect(box(s.stunned.frames.at(-1)!).w).toBeLessThan(box(s.idle.frames[0]).w) // …but the body is folded
    const area = (f: Raster) => box(f).w * box(f).h
    expect(area(s.defeat.frames.at(-1)!)).toBeLessThan(area(s.idle.frames[0]))
  })

  test('every frame stays inside the cell with no stray pixel', () => {
    for (const [name, anim] of Object.entries(s))
      for (const [i, f] of anim.frames.entries()) {
        const b = box(f)
        expect(b.x > 0 && b.y > 0 && b.x + b.w < f.w && b.y + b.h < f.h, `${name} ${i} touches the edge`).toBe(true)
        for (let y = 0; y < f.h; y++)
          for (let x = 0; x < f.w; x++) {
            if (!f.get(x, y)) continue
            let n = 0
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && f.get(x + dx, y + dy)) n++
            expect(n, `${name} ${i} has an isolated pixel at ${x},${y}`).toBeGreaterThan(0)
          }
      }
  })

  test('grounded clips stand on the anchor row', () => {
    for (const name of ['idle', 'windup', 'recover', 'stunned'])
      for (const [i, f] of s[name].frames.entries())
        expect(Math.abs(bottom(f) - ANCHOR_Y), `${name} ${i} bottom ${bottom(f)}`).toBeLessThanOrEqual(1)
  })
})
