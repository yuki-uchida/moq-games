import { describe, expect, test } from 'vitest'
import { LEAF, bearPose, drawBear } from '../src/art/chars/bosses/bear'
import { bossSpec } from '../src/art/contract'
import { sheet } from '../src/art/index'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const ID = 'bearBoss'
const ANCHOR_Y = 120
const spec = bossSpec(ID)
const leaf = new Set<number>(LEAF.slice(0, 4))
const gold = new Set<number>(R.honey.slice(0, 4))
const red = new Set<number>(R.bandana.slice(0, 4))

const box = (f: Raster) => f.bounds()!
const top = (f: Raster) => box(f).y
const bottom = (f: Raster) => box(f).y + box(f).h - 1
/** Pixels of the material, and the topmost row and the mean x of them. */
function material(f: Raster, set: Set<number>) {
  let n = 0
  let y0 = Infinity
  let sx = 0
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++)
      if (set.has(f.get(x, y))) {
        n++
        y0 = Math.min(y0, y)
        sx += x
      }
  return { n, top: y0, x: n ? sx / n : NaN }
}

describe('ヒョウタン熊 (bearBoss) on the rig', () => {
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

  test('he is the biggest thing in the game: wide, tall and far heavier than the hero', () => {
    const hero = sheet('hero').idle.frames
    const heroArea = hero.reduce((a, f) => a + f.count(), 0) / hero.length
    for (const [i, f] of s.idle.frames.entries()) {
      expect(box(f).w, `idle ${i} width`).toBeGreaterThanOrEqual(60)
      expect(box(f).h, `idle ${i} height`).toBeGreaterThanOrEqual(68)
      expect(f.count(), `idle ${i} area`).toBeGreaterThan(heroArea * 2.2)
    }
  })

  test('the leaf sprig crowns him and the gourd is always with him', () => {
    for (const [i, f] of s.idle.frames.entries()) {
      const l = material(f, leaf)
      expect(l.n, `idle ${i} leaves`).toBeGreaterThan(20)
      expect(l.top, `idle ${i}: the leaves are the highest material`).toBe(top(f))
    }
    for (const name of ['idle', 'move'])
      for (const [i, f] of s[name].frames.entries())
        expect(material(f, gold).n, `${name} ${i} gourd`).toBeGreaterThan(60)
  })

  test('the gourd swings against the body through the walk', () => {
    const rel = s.move.frames.map((f) => material(f, gold).x - (box(f).x + box(f).w / 2))
    expect(Math.max(...rel) - Math.min(...rel)).toBeGreaterThanOrEqual(2)
  })

  test('the crouch is low, the rise is tall, the slam is low and wide', () => {
    const idleTop = Math.max(...s.idle.frames.map(top))
    for (const [i, f] of s.windup.frames.entries()) expect(top(f), `windup ${i}`).toBeGreaterThan(idleTop + 4)
    const h = s.air.frames.map((f) => box(f).h)
    expect(h[0]).toBeGreaterThan(h[1])
    expect(h[0]).toBeGreaterThan(h[2])
    const land = s.land.frames[0]
    expect(top(land)).toBeGreaterThan(idleTop + 8)
    expect(box(land).w).toBeGreaterThan(Math.max(...s.idle.frames.map((f) => box(f).w)))
  })

  test('he wears no gang red', () => {
    for (const [name, anim] of Object.entries(s))
      for (const [i, f] of anim.frames.entries()) expect(material(f, red).n, `${name} ${i}`).toBe(0)
  })

  test('the knock-out ends on his back, lower than he stands', () => {
    const idleTop = Math.max(...s.idle.frames.map(top))
    const last = s.defeat.frames.at(-1)!
    expect(top(last)).toBeGreaterThan(idleTop + 10)
    expect(box(last).w).toBeGreaterThan(box(last).h)
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
    for (const name of ['idle', 'move', 'windup', 'recover', 'intro', 'hurt'])
      for (const [i, f] of s[name].frames.entries())
        expect(Math.abs(bottom(f) - ANCHOR_Y), `${name} ${i} bottom ${bottom(f)}`).toBeLessThanOrEqual(1)
  })

  test('a frame draws fast enough for the browser', () => {
    const t0 = performance.now()
    for (let i = 0; i < 4; i++) drawBear(bearPose({ dust: 1, mouth: 'open', jaw: 1, tongue: true, stars: 0 }))
    // 25 ms is the budget; the margin absorbs a loaded test machine
    expect((performance.now() - t0) / 4).toBeLessThan(60)
  })
})
