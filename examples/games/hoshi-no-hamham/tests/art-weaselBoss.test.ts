import { describe, expect, test } from 'vitest'
import { bossSpec } from '../src/art/contract'
import { sheet } from '../src/art/index'
import { C, R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const ID = 'weaselBoss'
const spec = bossSpec(ID)
const red = new Set<number>(R.bandana)
const cap = new Set<number>(R.darkFur)

const box = (f: Raster) => f.bounds()!
const top = (f: Raster) => box(f).y
const count = (f: Raster, set: Set<number>, y0 = 0, y1 = f.h) => {
  let n = 0
  for (let y = y0; y < y1; y++) for (let x = 0; x < f.w; x++) if (set.has(f.get(x, y))) n++
  return n
}

describe('いたち丞相 (weaselBoss) on the rig', () => {
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

  test('he stands tall in idle and bolts long and low in the charge', () => {
    for (const [i, f] of s.idle.frames.entries()) expect(box(f).h, `idle ${i} height`).toBeGreaterThanOrEqual(60)
    const idleH = Math.min(...s.idle.frames.map((f) => box(f).h))
    for (const [i, f] of s.attack.frames.entries()) {
      expect(box(f).w, `attack ${i} is long`).toBeGreaterThanOrEqual(1.5 * box(f).h)
      expect(box(f).h, `attack ${i} is lower than idle`).toBeLessThan(idleH)
    }
  })

  test('the white feather fan is in every idle frame, the gang red in every idle and charge frame', () => {
    for (const [i, f] of s.idle.frames.entries()) {
      // the fan's lit feathers: pure white beyond the few pixels of the eye's highlight
      let white = 0
      for (const c of f.data) if (c === C.white) white++
      expect(white, `idle ${i} fan`).toBeGreaterThanOrEqual(12)
    }
    for (const name of ['idle', 'attack'])
      for (const [i, f] of s[name].frames.entries())
        expect(count(f, red), `${name} ${i} wears the gang red`).toBeGreaterThan(30)
  })

  test('the black cap sits at the top of the head in idle', () => {
    for (const [i, f] of s.idle.frames.entries()) {
      const y = top(f)
      // the top rows of the figure are the cap (its gold button aside)
      expect(count(f, cap, y, y + 12), `idle ${i} cap on top`).toBeGreaterThan(60)
      expect(count(f, cap, y + 40, f.h), `idle ${i} the cap is not low`).toBeLessThan(count(f, cap))
    }
  })

  test('stunned sits lower than idle; defeat ends lying low', () => {
    const idleTop = Math.max(...s.idle.frames.map(top))
    for (const [i, f] of s.stunned.frames.entries()) expect(top(f), `stunned ${i}`).toBeGreaterThan(idleTop)
    expect(top(s.defeat.frames.at(-1)!)).toBeGreaterThan(idleTop + 20)
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
      for (const [i, f] of s[name].frames.entries()) {
        const bottom = box(f).y + box(f).h - 1
        expect(Math.abs(bottom - 120), `${name} ${i} bottom ${bottom}`).toBeLessThanOrEqual(1)
      }
  })
})
