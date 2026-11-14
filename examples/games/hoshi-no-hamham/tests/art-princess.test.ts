import { describe, expect, test } from 'vitest'
import { hamPose } from '../src/art/chars/hamster'
import { drawHam } from '../src/art/chars/hero'
import { PRINCESS_LOOK, drawPrincess, princessPose, sheets } from '../src/art/chars/princess'
import { PRINCESS_NEXT } from '../src/art/contract'
import { C, R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'
import type { Sheet } from '../src/art/sheet'

const princess = () => sheets.princess() as Sheet
const count = (f: Raster, colours: readonly number[]) => {
  let n = 0
  for (const c of f.data) if (colours.includes(c)) n++
  return n
}
const pixels = (f: Raster, colours: readonly number[]) => {
  const out: [number, number][] = []
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (colours.includes(f.get(x, y))) out.push([x, y])
  return out
}
const WATER = [R.water[0], R.water[1]]

describe('princess sheet', () => {
  test('every clip of PRINCESS_NEXT is drawn with its frame count, timing and loop', () => {
    const s = princess()
    for (const [name, spec] of Object.entries(PRINCESS_NEXT)) {
      expect(s[name], name).toBeDefined()
      expect(s[name].frames.length, name).toBe(spec.frames)
      expect(s[name].fps, name).toBe(spec.fps)
      expect(s[name].loop, name).toBe(spec.loop)
    }
  })

  test('she is drawn on the family build, a touch smaller than the hero (about 42 px tall)', () => {
    const f = drawPrincess(princessPose())
    const p = f.bounds()!
    const h = drawHam(hamPose()).bounds()!
    // her height from the soles to the top of the curl (the tiara's star stands on top of that); the hero's is 50
    const head = Math.min(...pixels(f, R.princessWhite.slice(0, 4)).map(([, y]) => y)) - 1
    expect(p.h).toBeLessThan(h.h)
    expect(p.y + p.h - head).toBeGreaterThanOrEqual(40)
    expect(p.y + p.h - head).toBeLessThanOrEqual(46)
    expect(p.y + p.h - 1).toBe(60)
    expect(PRINCESS_LOOK.scale).toBeLessThan(1)
  })

  test('white coat, pink ears and paws, a dark outline all round', () => {
    const f = princess().idle.frames[0]
    expect(count(f, R.princessWhite.slice(0, 4))).toBeGreaterThan(f.count() * 0.4)
    expect(count(f, R.princessPink.slice(0, 4))).toBeGreaterThan(40)
    // every pixel on the silhouette's edge is a line colour, never a light lavender
    for (const [x, y] of pixels(f, R.princessWhite.slice(0, 4)))
      expect(!f.get(x - 1, y) || !f.get(x + 1, y) || !f.get(x, y - 1) || !f.get(x, y + 1), `${x},${y}`).toBe(false)
  })

  test('the tiara glints on one or two frames of the idle loop', () => {
    const idle = princess().idle.frames
    // white pixels inside the star (touching gold): the coat's highlight is the same white, so it must touch gold
    const gold = R.gold.slice(0, 3)
    const glinting = idle.filter((f) =>
      pixels(f, [C.white]).some(([x, y]) =>
        [f.get(x - 1, y), f.get(x + 1, y), f.get(x, y + 1)].some((c) => gold.includes(c))
      )
    )
    expect(glinting.length).toBeGreaterThanOrEqual(1)
    expect(glinting.length).toBeLessThanOrEqual(2)
    for (const f of idle) expect(count(f, R.gold.slice(0, 3))).toBeGreaterThan(8)
  })

  test('sad: a tear on every frame, falling down the cheek over the loop', () => {
    const lows = princess().sad.frames.map((f) => Math.max(...pixels(f, WATER).map(([, y]) => y)))
    for (const y of lows) expect(Number.isFinite(y)).toBe(true)
    expect(lows[5]).toBeGreaterThan(lows[0] + 2)
  })

  test('cheer: she hops and her paws go up above her head at the top of the hop', () => {
    const fr = princess().cheer.frames
    const bottoms = fr.map((f) => f.bounds()!.y + f.bounds()!.h)
    expect(Math.min(...bottoms)).toBeLessThan(Math.max(...bottoms) - 5)
    // the apex frame: the eyes are closed arcs, so the tiara's top marks the head
    const apex = fr[3]
    const crown = Math.min(...pixels(apex, R.gold.slice(0, 3)).map(([, y]) => y))
    const pawTop = Math.min(...pixels(apex, [R.princessPink[0]]).map(([, y]) => y))
    // the paws are up beside the ears (the tiara's top is 4 px above the skull)
    expect(pawTop).toBeLessThan(crown + 13)
  })

  test('wave: the paw travels on an arc through at least three positions', () => {
    const tops = princess().wave.frames.map((f) => {
      const ps = pixels(f, [R.princessPink[0], R.princessPink[1]]).filter(([x]) => x > 40)
      const y = Math.min(...ps.map((p) => p[1]))
      return `${Math.max(...ps.filter((p) => p[1] === y).map((p) => p[0]))},${y}`
    })
    expect(new Set(tops).size).toBeGreaterThanOrEqual(3)
  })
})
