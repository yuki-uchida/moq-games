import { describe, expect, test } from 'vitest'
import { BOAR_TONES } from '../src/art/chars/bosses/boar'
import { bossSpecNext } from '../src/art/contract'
import { sheet } from '../src/art/index'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const ID = 'boarBoss'
const ANCHOR_Y = 120
const spec = bossSpecNext(ID)
/** The pompadour (and the brows and hooves) are glossy black; its outline is the warm ink. */
const black = new Set<number>(BOAR_TONES.hair)
const cream = new Set<number>(BOAR_TONES.tusk.slice(0, 2))
const red = new Set<number>(R.bandana)

const box = (f: Raster) => f.bounds()!
const top = (f: Raster) => box(f).y
const bottom = (f: Raster) => box(f).y + box(f).h - 1
const count = (f: Raster, set: Set<number>) => {
  let n = 0
  for (const c of f.data) if (set.has(c)) n++
  return n
}
/** The first painted row from the top and the colours on it (and the row below, to skip a lone outline pixel). */
const topColours = (f: Raster) => {
  const y = top(f)
  const seen = new Set<number>()
  for (const row of [y + 1, y + 2]) for (let x = 0; x < f.w; x++) if (f.get(x, row)) seen.add(f.get(x, row))
  return seen
}

describe('いのしし番長 (boarBoss) on the rig', () => {
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

  test('he is long and outweighs the wolf', () => {
    const wolf = sheet('wolfBoss').idle.frames
    const wolfArea = wolf.reduce((a, f) => a + f.count(), 0) / wolf.length
    for (const [i, f] of s.idle.frames.entries()) {
      expect(box(f).w, `idle ${i} length`).toBeGreaterThanOrEqual(76)
      expect(f.count() / wolfArea, `idle ${i} weight`).toBeGreaterThanOrEqual(1.15)
    }
  })

  test('the black pompadour is the highest thing on him when he stands', () => {
    for (const [i, f] of s.idle.frames.entries())
      expect(
        [...topColours(f)].every((c) => black.has(c) || c === BOAR_TONES.sheen),
        `idle ${i} top is the quiff`
      ).toBe(true)
  })

  test('tusks and the gang red show in every idle and charge frame', () => {
    for (const name of ['idle', 'attack'])
      for (const [i, f] of s[name].frames.entries()) {
        expect(count(f, cream), `${name} ${i} tusks`).toBeGreaterThanOrEqual(12)
        expect(count(f, red), `${name} ${i} neckerchief`).toBeGreaterThanOrEqual(20)
      }
  })

  test('the charge is longer and lower than idle', () => {
    const w = (fs: Raster[]) => Math.max(...fs.map((f) => box(f).w))
    const h = (fs: Raster[]) => Math.max(...fs.map((f) => box(f).h))
    expect(w(s.attack.frames)).toBeGreaterThan(w(s.idle.frames))
    expect(h(s.attack.frames)).toBeLessThan(h(s.idle.frames))
  })

  test('stunned and the end of defeat are lower than idle', () => {
    const idleTop = Math.max(...s.idle.frames.map(top))
    for (const f of s.stunned.frames) expect(top(f)).toBeGreaterThan(idleTop)
    for (const f of s.defeat.frames.slice(-3)) expect(top(f)).toBeGreaterThan(idleTop + 8)
  })

  test('the stomp of the intro and the rear before it', () => {
    const idleTop = Math.min(...s.idle.frames.map(top))
    expect(Math.min(...s.intro.frames.map(top)), 'he rears up').toBeLessThan(idleTop - 6)
    expect(top(s.intro.frames.at(-1)!), 'he ends standing').toBeGreaterThanOrEqual(idleTop - 3)
  })

  test('every frame stays inside the cell with no isolated pixel', () => {
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
