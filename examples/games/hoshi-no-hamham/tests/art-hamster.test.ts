import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { drawHamster, hamLook, hamPose, hamStamps, type HamParts, type HamSize } from '../src/art/chars/hamster'
import { HERO_LOOK, drawHam } from '../src/art/chars/hero'
import { R } from '../src/art/palette'
import { farRamp, type Raster } from '../src/art/raster'

const hash = (f: Raster) => createHash('sha1').update(Buffer.from(f.rgba())).digest('hex').slice(0, 16)
const box = (f: Raster) => f.bounds()!

/** A plain test look in the hero's build: no accessories, the family stamps. */
const plain = (scale: number) =>
  hamLook({
    fur: R.hamPink,
    furFar: farRamp(R.hamPink),
    mask: R.hamCream,
    earBowl: R.hamEar,
    paw: R.hamCream,
    pawFar: farRamp(R.hamCream),
    scale
  })

const CELLS: Record<number, HamSize> = {
  1: { w: 64, h: 64, anchor: [32, 60] },
  1.3: { w: 96, h: 96, anchor: [48, 90] },
  1.6: { w: 128, h: 128, anchor: [64, 120] }
}

describe('the hamster family build', () => {
  test('the hero look reproduces the hero (standing pose and a raised-arm pose, pixel for pixel)', () => {
    // recorded from hero.ts before the build moved into hamster.ts
    expect(hash(drawHamster(HERO_LOOK, hamPose()))).toBe(hash(drawHam(hamPose())))
    expect(hash(drawHam(hamPose()))).toBe('54d29e0787600272')
    const raised = hamPose({ up: true, reach: 1.5, armN: [-17, -10], armF: [16, -9] })
    expect(hash(drawHamster(HERO_LOOK, raised))).toBe('751154a1e537eeee')
  })

  test.each([1.3, 1.6])('a look scaled %s draws inside its cell with the same proportions', (k) => {
    const pose = hamPose()
    const small = box(drawHamster(plain(1), pose, CELLS[1]))
    const big = drawHamster(plain(k), pose, CELLS[k])
    const b = box(big)
    const cell = CELLS[k]
    // at least 1 px clear of every cell edge
    expect(b.x).toBeGreaterThanOrEqual(1)
    expect(b.y).toBeGreaterThanOrEqual(1)
    expect(b.x + b.w).toBeLessThanOrEqual(cell.w - 1)
    // the soles stand on the anchor row
    expect(Math.abs(b.y + b.h - 1 - cell.anchor[1])).toBeLessThanOrEqual(1)
    // the same proportions: height and width grow by the scale (within a couple of pixels of outline)
    expect(Math.abs(b.h / small.h - k)).toBeLessThan(0.08)
    expect(Math.abs(b.w / small.w - k)).toBeLessThan(0.1)
  })

  test('accessories receive the part frames and draw with the body', () => {
    const seen: HamParts[] = []
    const dot = (parts: HamParts) => {
      seen.push(parts)
      parts.g.add(9, (l) => {
        const [x, y] = parts.head.pt(0, -12)
        l.set(Math.round(x), Math.round(y), R.gold[1])
      })
    }
    for (const k of [1, 1.6]) {
      const look = { ...plain(k), accessories: [dot] }
      const f = drawHamster(look, hamPose({ armN: [7, -2] }), CELLS[k])
      const p = seen[seen.length - 1]
      expect(p.s).toBe(k)
      for (const fr of [p.ground, p.root, p.torso, p.head, p.earN, p.earF, p.handN, p.handF, p.knot])
        expect(Number.isFinite(fr.pt(0, 0)[0])).toBe(true)
      // the head frame carries the scale; the paw sits where the arm put it, in front of the shoulder
      expect(Math.hypot(p.head.a, p.head.b)).toBeCloseTo(k, 5)
      expect(p.handN.pt(0, 0)[0]).toBeGreaterThan(p.torso.pt(-3, -12)[0])
      const [x, y] = p.head.pt(0, -12)
      expect(f.get(Math.round(x), Math.round(y))).toBe(R.gold[1])
    }
  })

  test('the family stamps come in a look’s own colours', () => {
    const s = hamStamps(R.princessWhite, R.princessPink)
    expect(s.tuftShape.P).toBe(R.princessWhite[1])
    expect(s.noseKey.n).toBe(R.princessPink[1])
    expect(s.tufts).not.toBeNull()
  })
})
