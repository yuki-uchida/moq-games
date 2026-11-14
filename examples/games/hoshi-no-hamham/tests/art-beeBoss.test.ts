import { describe, expect, test } from 'vitest'
import { BEE_RAMPS } from '../src/art/chars/bosses/bee'
import { bossSpecNext } from '../src/art/contract'
import { sheet } from '../src/art/index'
import type { Raster } from '../src/art/raster'

const ID = 'beeBoss'
const ANCHOR_Y = 120
const spec = bossSpecNext(ID)
const { PLUM, HONEY, BAND, FUR, WING } = BEE_RAMPS
const set = (...ramps: readonly (readonly number[])[]) => new Set<number>(ramps.flatMap((r) => r.slice(0, 4)))
const white = new Set<number>([FUR[0], FUR[1]])
const gold = set(HONEY)
const black = new Set<number>([PLUM[1], PLUM[2], PLUM[3]])
const red = set(BAND)
const wing = set(WING)
/** The abdomen and its stinger are gold and plum. */
const abdomen = set(HONEY, PLUM)

const box = (f: Raster) => f.bounds()!
const bottom = (f: Raster) => box(f).y + box(f).h - 1
const count = (f: Raster, s: Set<number>) => {
  let n = 0
  for (const c of f.data) if (s.has(c)) n++
  return n
}

describe('ハチ女王 (beeBoss) on the rig', () => {
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

  test('the white collar, the gold, the black stripes and the gang red are in every idle frame', () => {
    for (const [i, f] of s.idle.frames.entries()) {
      expect(count(f, white), `idle ${i} collar`).toBeGreaterThan(80)
      expect(count(f, gold), `idle ${i} gold`).toBeGreaterThan(200)
      expect(count(f, black), `idle ${i} black`).toBeGreaterThan(200)
      expect(count(f, red), `idle ${i} red sash`).toBeGreaterThan(30)
    }
  })

  test('she hovers: her lowest point is 4 to 16 px above the anchor row', () => {
    for (const [i, f] of s.idle.frames.entries()) {
      const gap = ANCHOR_Y - bottom(f)
      expect(gap, `idle ${i} gap ${gap}`).toBeGreaterThanOrEqual(4)
      expect(gap, `idle ${i} gap ${gap}`).toBeLessThanOrEqual(16)
    }
  })

  test('the wings flutter: their painted area changes by 30 % or more from frame to frame', () => {
    const f = s.idle.frames
    for (let i = 0; i < f.length; i++) {
      const a = count(f[i], wing)
      const b = count(f[(i + 1) % f.length], wing)
      expect(Math.abs(a - b) / Math.max(a, b), `idle ${i}→${(i + 1) % f.length}: ${a} vs ${b}`).toBeGreaterThanOrEqual(
        0.3
      )
    }
  })

  test('the dash is a spear: stinger foremost, much longer than tall', () => {
    for (const [i, f] of s.attack.frames.entries()) {
      const b = box(f)
      const x = b.x + b.w - 1
      let front = 0
      for (let y = b.y; y < b.y + b.h; y++) if (f.get(x, y)) front = f.get(x, y)
      // the rightmost column's pixels belong to the abdomen (gold and plum, or its outline)
      let ok = false
      for (let y = b.y; y < b.y + b.h; y++) for (let dx = 0; dx <= 2; dx++) if (abdomen.has(f.get(x - dx, y))) ok = true
      expect(front, `attack ${i} has a front`).toBeGreaterThan(0)
      expect(ok, `attack ${i}: the foremost point is the stinger`).toBe(true)
      expect(b.w / b.h, `attack ${i} ${b.w}×${b.h}`).toBeGreaterThanOrEqual(1.4)
    }
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
})
