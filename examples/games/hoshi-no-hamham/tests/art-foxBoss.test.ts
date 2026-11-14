import { describe, expect, test } from 'vitest'
import { drawFox, foxRig, idlePoses, movePoses } from '../src/art/chars/bosses/fox'
import { bossSpec } from '../src/art/contract'
import { sheet } from '../src/art/index'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const ID = 'foxBoss'
const spec = bossSpec(ID)
const red = new Set<number>(R.bandana)
const steel = new Set<number>(R.steel)

const box = (f: Raster) => f.bounds()!
const count = (f: Raster, set: Set<number>) => {
  let n = 0
  for (const c of f.data) if (set.has(c)) n++
  return n
}
/** Share of pixels that differ (colour or coverage), relative to the larger figure. */
const differ = (a: Raster, b: Raster) => {
  let diff = 0
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) diff++
  return diff / Math.max(a.count(), b.count())
}

describe('きつね旋風 (foxBoss) on the rig', () => {
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

  test('the tail is as big as the rest of him (at least half its area)', () => {
    for (const [i, p] of idlePoses().entries()) {
      const full = drawFox(p).count()
      const body = drawFox({ ...p, puff: 0 }).count()
      expect(full - body, `idle ${i} tail area vs body ${body}`).toBeGreaterThanOrEqual(body * 0.5)
    }
  })

  test('the gang red and the steel plate are in every idle and move frame', () => {
    for (const name of ['idle', 'move'])
      for (const [i, f] of s[name].frames.entries()) {
        expect(count(f, red), `${name} ${i} red`).toBeGreaterThan(60)
        expect(count(f, steel), `${name} ${i} steel`).toBeGreaterThanOrEqual(12)
      }
  })

  test('the whirlwind is a wheel that really turns', () => {
    const fs = s.attack.frames
    for (const [i, f] of fs.entries()) {
      const b = box(f)
      expect(Math.abs(b.w - b.h) / Math.max(b.w, b.h), `attack ${i} ${b.w}×${b.h}`).toBeLessThanOrEqual(0.15)
    }
    for (let i = 0; i < fs.length; i++)
      expect(differ(fs[i], fs[(i + 1) % fs.length]), `attack ${i} → ${(i + 1) % fs.length}`).toBeGreaterThanOrEqual(
        0.25
      )
  })

  test('the run leans forward: the head is well ahead of the feet', () => {
    for (const [i, p] of movePoses().entries()) {
      const r = foxRig(p)
      const head = r.head.pt(0, 0)[0]
      const feet = (r.footN.pt(0, 0)[0] + r.footF.pt(0, 0)[0]) / 2
      expect(head - feet, `move ${i}`).toBeGreaterThanOrEqual(10)
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

  test('grounded clips stand on the anchor row', () => {
    for (const name of ['idle', 'move', 'recover', 'windup'])
      for (const [i, f] of s[name].frames.entries()) {
        const bottom = box(f).y + box(f).h - 1
        expect(Math.abs(bottom - 120), `${name} ${i} bottom ${bottom}`).toBeLessThanOrEqual(1)
      }
  })
})
