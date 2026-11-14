import { describe, expect, test } from 'vitest'
import { crowBossPoses, crowBossWingTips } from '../src/art/chars/bosses/crow'
import { bossSpecNext } from '../src/art/contract'
import { sheet } from '../src/art/index'
import { C, R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const ID = 'crowBoss'
const spec = bossSpecNext(ID)
const beak = new Set<number>(R.beak.slice(0, 4))
const red = new Set<number>(R.bandana.slice(0, 4))

const box = (f: Raster) => f.bounds()!
const count = (f: Raster, set: Set<number>) => {
  let n = 0
  for (const c of f.data) if (set.has(c)) n++
  return n
}

/** Length and thickness of the figure along its principal axis (from the second moments of its pixels). */
function axes(f: Raster) {
  let n = 0
  let sx = 0
  let sy = 0
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++)
      if (f.get(x, y)) {
        n++
        sx += x
        sy += y
      }
  const mx = sx / n
  const my = sy / n
  let xx = 0
  let yy = 0
  let xy = 0
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++)
      if (f.get(x, y)) {
        xx += (x - mx) ** 2
        yy += (y - my) ** 2
        xy += (x - mx) * (y - my)
      }
  const tr = (xx + yy) / n
  const det = (xx * yy - xy * xy) / (n * n)
  const d = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  return { long: Math.sqrt(tr / 2 + d), short: Math.sqrt(Math.max(0, tr / 2 - d)), cy: my }
}

describe('カラス助 (crowBoss) on the rig', () => {
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

  test('the idle wing beat spreads more than 90 px of wing and sweeps it by 30 px or more', () => {
    const spans = crowBossPoses.idle().map((p) => {
      const t = crowBossWingTips(p)
      return t.far - t.near
    })
    expect(Math.max(...spans)).toBeGreaterThan(90)
    expect(Math.max(...spans) - Math.min(...spans)).toBeGreaterThanOrEqual(30)
    // the drawn wings reach that far too
    const widest = Math.max(...s.idle.frames.map((f) => box(f).w))
    expect(widest).toBeGreaterThan(90)
  })

  test('the dive is narrower and longer than the hover', () => {
    const idleWidth = Math.max(...s.idle.frames.map((f) => box(f).w))
    const idleShape = Math.max(...s.idle.frames.map((f) => axes(f).long / axes(f).short))
    for (const [i, f] of s.attack.frames.entries()) {
      expect(box(f).w, `attack ${i} width`).toBeLessThan(idleWidth)
      expect(axes(f).long / axes(f).short, `attack ${i} elongation`).toBeGreaterThan(idleShape)
    }
  })

  test('the beak, the eye patch and the gang red show in every idle frame', () => {
    for (const [i, f] of s.idle.frames.entries()) {
      expect(count(f, beak), `idle ${i} beak`).toBeGreaterThan(150)
      expect(count(f, new Set([C.black])), `idle ${i} patch`).toBeGreaterThanOrEqual(25)
      expect(count(f, red), `idle ${i} scarf`).toBeGreaterThan(120)
    }
  })

  test('he hovers: the body stays in the middle of the boss box', () => {
    for (const [i, f] of s.idle.frames.entries()) {
      const { cy } = axes(f)
      expect(cy, `idle ${i} centre of mass`).toBeGreaterThanOrEqual(70)
      expect(cy, `idle ${i} centre of mass`).toBeLessThanOrEqual(100)
    }
  })

  test('the screech opens the beak, and he ends on his back lower than he hovers', () => {
    const open = (f: Raster) => count(f, new Set([C.mouth]))
    expect(Math.max(...s.intro.frames.map(open))).toBeGreaterThan(40)
    // the body's centre of mass (not the top row: his upturned feet and beak reach as high as his hovering head)
    const hover = Math.max(...s.idle.frames.map((f) => axes(f).cy))
    const last = s.defeat.frames.at(-1)!
    expect(axes(last).cy).toBeGreaterThan(hover + 8)
    // lying on the ground: the lowest painted row sits on the anchor row's band
    const bottom = box(last).y + box(last).h - 1
    expect(bottom).toBeGreaterThanOrEqual(118)
    expect(bottom).toBeLessThanOrEqual(123)
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
