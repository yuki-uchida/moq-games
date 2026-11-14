import { describe, expect, test } from 'vitest'
import { BEE_RAMPS } from '../src/art/chars/bosses/bee'
import { bossSpec } from '../src/art/contract'
import { sheet } from '../src/art/index'
import type { Raster } from '../src/art/raster'

const ID = 'beeBoss'
const ANCHOR_Y = 120
const spec = bossSpec(ID)
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

  describe('shoot: the queen commands a volley or a summon', () => {
    const f = s.shoot.frames
    const top = (r: Raster) => box(r).y
    const right = (r: Raster) => box(r).x + box(r).w - 1
    const idle = s.idle.frames
    const idleTop = Math.min(...idle.map(top))
    const idleRight = Math.max(...idle.map(right))
    const idleBottom = idle.map(bottom)
    /** The topmost painted row of a material in a frame (Infinity when it is absent). */
    const topOf = (r: Raster, m: Set<number>) => {
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (m.has(r.get(x, y))) return y
      return Infinity
    }

    test('six frames, released on frame 3', () => {
      expect(f.length).toBe(spec.shoot.frames)
      expect(spec.shoot.hit).toBe(3)
    })

    test('frame 2 holds the sceptre over her head: its top is the highest painted material, higher than in idle', () => {
      const t = top(f[2])
      // the rod's gold or the jewel's red is within the glint's reach of the top row (the antennae end lower)
      expect(Math.min(topOf(f[2], gold), topOf(f[2], red)), 'sceptre at the top').toBeLessThanOrEqual(t + 3)
      expect(t, `top ${t} vs idle ${idleTop}`).toBeLessThan(idleTop - 4)
      for (const [i, r] of f.entries()) if (i !== 2) expect(top(r), `frame ${i} not above frame 2`).toBeGreaterThan(t)
    })

    test('frame 3 reaches furthest forward of the clip and further than idle', () => {
      const r3 = right(f[3])
      expect(r3, `frame 3 ${r3} vs idle ${idleRight}`).toBeGreaterThan(idleRight + 8)
      for (const [i, r] of f.entries()) if (i !== 3) expect(right(r), `frame ${i}`).toBeLessThan(r3)
    })

    test('she keeps her hover height at the start and the end', () => {
      for (const i of [0, 5]) {
        const b = bottom(f[i])
        for (const ib of idleBottom)
          expect(Math.abs(b - ib), `frame ${i} bottom ${b} vs idle ${ib}`).toBeLessThanOrEqual(4)
      }
    })

    test('neighbouring frames differ', () => {
      for (let i = 1; i < f.length; i++) {
        let d = 0
        for (let k = 0; k < f[i].data.length; k++) if (f[i].data[k] !== f[i - 1].data[k]) d++
        expect(d, `frames ${i - 1}→${i}`).toBeGreaterThan(200)
      }
    })
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
