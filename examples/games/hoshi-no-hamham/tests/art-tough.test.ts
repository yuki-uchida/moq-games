import { describe, expect, test } from 'vitest'
import { MOLE_AIR, drawMole, molePose, toughSheet } from '../src/art/chars/enemies/tough'
import { walkerSheet } from '../src/art/chars/enemies/walker'
import { ENEMY_SPEC } from '../src/art/contract'
import { C, R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const sheet = toughSheet()
const STANDING = ['idle', 'move'] as const
const STEEL = new Set<number>(R.steel.slice(0, 4))
const BANDANA = new Set<number>(R.bandana.slice(0, 4))

/** Painted pixels of the frame whose colour is in `set`. */
function pixels(f: Raster, set: Set<number>) {
  const out: [number, number][] = []
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (set.has(f.get(x, y))) out.push([x, y])
  return out
}

/** The highest row with a steel pixel: the top of the helmet. */
const helmetTop = (f: Raster) => Math.min(...pixels(f, STEEL).map(([, y]) => y))

/** Mean position of the steel pixels. */
function steelCentre(f: Raster): [number, number] {
  const p = pixels(f, STEEL)
  return [p.reduce((s, [x]) => s + x, 0) / p.length, p.reduce((s, [, y]) => s + y, 0) / p.length]
}

/** Pixels painted in one frame and not the other (the silhouettes compared). */
function silhouetteDiff(a: Raster, b: Raster) {
  let n = 0
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (!a.get(x, y) !== !b.get(x, y)) n++
  return n
}

const COAT = new Set<number>(R.moleBrown.slice(0, 4))
/** Middle column of the barrel: the mean x of the brown coat in rows 34..52. */
function bodyMid(f: Raster) {
  const p = pixels(f, COAT).filter(([, y]) => y >= 34 && y <= 52)
  return p.reduce((s, [x]) => s + x, 0) / p.length
}

describe('tough (モグラ隊長) on the rig', () => {
  test('every clip of the spec is drawn with its frame count, fps and loop', () => {
    for (const [name, spec] of Object.entries(ENEMY_SPEC.tough)) {
      const a = sheet[name as keyof typeof sheet]
      expect(a, name).toBeDefined()
      expect(a.frames.length, name).toBe(spec.frames)
      expect(a.fps, name).toBe(spec.fps)
      expect(a.loop, name).toBe(spec.loop)
    }
  })

  test('he is the heavy: at least 1.25× the rat’s painted area in idle, and he nearly fills his 52×50 box', () => {
    const rat = walkerSheet().idle.frames[0].count()
    for (const [i, f] of sheet.idle.frames.entries()) {
      expect(f.count() / rat, `idle ${i}`).toBeGreaterThanOrEqual(1.25)
      const b = f.bounds()!
      expect(b.w, `idle ${i} width`).toBeGreaterThanOrEqual(44)
      expect(b.w, `idle ${i} width`).toBeLessThanOrEqual(52)
      expect(b.h, `idle ${i} height`).toBeGreaterThanOrEqual(44)
      expect(b.h, `idle ${i} height`).toBeLessThanOrEqual(50)
    }
  })

  test('the steel helmet is on top of his head in every idle and move frame', () => {
    for (const name of STANDING)
      for (const [i, f] of sheet[name].frames.entries()) {
        const b = f.bounds()!
        // the first rows of the silhouette are steel (its cool outline aside)
        const top = pixels(f, STEEL).filter(([, y]) => y <= b.y + 3).length
        expect(top, `${name} ${i}`).toBeGreaterThanOrEqual(12)
        expect(helmetTop(f), `${name} ${i}`).toBeLessThanOrEqual(b.y + 1)
      }
  })

  test('the eye whites show in every idle and move frame (the claws never cover the face)', () => {
    for (const name of STANDING)
      for (const [i, f] of sheet[name].frames.entries()) {
        const whites = pixels(f, new Set([C.white]))
        expect(whites.length, `${name} ${i}`).toBeGreaterThanOrEqual(6)
        // and they sit under the brim, on the face, not somewhere else
        const top = helmetTop(f)
        for (const [x, y] of whites) {
          expect(y, `${name} ${i} white at ${x},${y}`).toBeGreaterThan(top + 6)
          expect(y, `${name} ${i} white at ${x},${y}`).toBeLessThan(top + 22)
        }
      }
  })

  test('the helmet bobs through the march and jumps off his head when he is bitten', () => {
    const tops = sheet.move.frames.map(helmetTop)
    expect(new Set(tops).size, tops.join()).toBeGreaterThanOrEqual(2)
    expect(helmetTop(sheet.idle.frames[0]) - helmetTop(sheet.hurt.frames[0])).toBeGreaterThanOrEqual(3)
  })

  test('the knock-out sends the helmet from the top of his head to the ground beside him', () => {
    const frames = sheet.defeat.frames
    const [x0, y0] = steelCentre(frames[0])
    const [x1, y1] = steelCentre(frames[frames.length - 1])
    expect(y0, 'starts high').toBeLessThan(28)
    expect(y1, 'ends on the ground').toBeGreaterThan(48)
    // away from his head, which lies at the left
    expect(x1).toBeGreaterThan(x0 + 6)
  })

  test('the red bandana shows in every idle and move frame', () => {
    for (const name of STANDING)
      for (const [i, f] of sheet[name].frames.entries())
        expect(pixels(f, BANDANA).length, `${name} ${i}`).toBeGreaterThanOrEqual(10)
  })

  test('idle and move keep their lowest row on the anchor row', () => {
    for (const name of STANDING)
      for (const [i, f] of sheet[name].frames.entries()) {
        const b = f.bounds()!
        expect(b.y + b.h - 1, `${name} ${i}`).toBeGreaterThanOrEqual(59)
        expect(b.y + b.h - 1, `${name} ${i}`).toBeLessThanOrEqual(61)
      }
  })

  test('every defeat frame stays inside the cell with no isolated pixel', () => {
    for (const [i, f] of sheet.defeat.frames.entries()) {
      const b = f.bounds()!
      expect(b.x, `defeat ${i} left`).toBeGreaterThanOrEqual(1)
      expect(b.y, `defeat ${i} top`).toBeGreaterThanOrEqual(1)
      expect(b.x + b.w, `defeat ${i} right`).toBeLessThanOrEqual(f.w - 1)
      expect(b.y + b.h, `defeat ${i} bottom`).toBeLessThanOrEqual(f.h - 1)
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++)
          if (f.get(x, y))
            expect(
              Boolean(f.get(x - 1, y) || f.get(x + 1, y) || f.get(x, y - 1) || f.get(x, y + 1)),
              `defeat ${i} isolated pixel at ${x},${y}`
            ).toBe(true)
    }
  })

  test('air: every frame floats 4 to 10 px above the anchor row, over the anchor column, inside the cell', () => {
    expect(sheet.air.frames.length).toBe(3)
    const idle = sheet.idle.frames.map(bodyMid)
    const centre = idle.reduce((s, m) => s + m, 0) / idle.length
    for (const [i, f] of sheet.air.frames.entries()) {
      const b = f.bounds()!
      const lowest = b.y + b.h - 1
      expect(60 - lowest, `air ${i} air under the feet`).toBeGreaterThanOrEqual(4)
      expect(60 - lowest, `air ${i} air under the feet`).toBeLessThanOrEqual(10)
      expect(b.x, `air ${i} left`).toBeGreaterThanOrEqual(1)
      expect(b.y, `air ${i} top`).toBeGreaterThanOrEqual(1)
      expect(b.x + b.w, `air ${i} right`).toBeLessThanOrEqual(f.w - 1)
      // the barrel stays where it is in idle (the hit box is centred on the anchor column): measured with the paws
      // held as in idle, so the flung paws and their cuffs do not count
      const m = bodyMid(drawMole({ ...MOLE_AIR[i], pawN: [4, 6, 30, 0.3], pawF: [12, 3, 12, 0.3] }))
      expect(Math.abs(m - centre), `air ${i} barrel at ${m}`).toBeLessThanOrEqual(2)
      // and so does the head: the helmet over the same column as in idle
      const hx = steelCentre(f)[0]
      expect(Math.abs(hx - steelCentre(sheet.idle.frames[0])[0]), `air ${i} helmet at ${hx}`).toBeLessThanOrEqual(3)
    }
  })

  test('air: falling (frame 2) he drops feet first, the paws up and the helmet lifted off his brow', () => {
    const fall = MOLE_AIR[2]
    const f = sheet.air.frames[2]
    // the pixels the paws add: the same pose with the paws held low as in idle
    const rest = drawMole({ ...fall, pawN: [4, 6, 30, 0.3], pawF: [12, 3, 12, 0.3] })
    const paws: number[] = []
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.get(x, y) && !rest.get(x, y)) paws.push(y)
    expect(paws.length).toBeGreaterThanOrEqual(20)
    const b = f.bounds()!
    // the lowest paw pixel is far above the feet; the paws reach up to the helmet
    expect(b.y + b.h - 1 - Math.max(...paws)).toBeGreaterThanOrEqual(14)
    expect(Math.min(...paws)).toBeLessThanOrEqual(helmetTop(f) + 6)
    // the helmet rides higher on his head than when he stands
    const seated = drawMole({ ...fall, helmet: [0, 0, 4] })
    expect(helmetTop(seated) - helmetTop(f)).toBeGreaterThanOrEqual(2)
  })

  test('air: the three frames differ from each other and from every idle and hurt frame', () => {
    const air = sheet.air.frames
    for (let i = 0; i < air.length; i++)
      for (let j = i + 1; j < air.length; j++)
        expect(silhouetteDiff(air[i], air[j]), `air ${i} vs air ${j}`).toBeGreaterThanOrEqual(60)
    for (const [i, f] of air.entries())
      for (const name of ['idle', 'hurt'] as const)
        for (const [j, g] of sheet[name].frames.entries())
          expect(silhouetteDiff(f, g), `air ${i} vs ${name} ${j}`).toBeGreaterThanOrEqual(80)
  })

  test('a frame draws fast enough for the browser', () => {
    for (let i = 0; i < 5; i++) drawMole(molePose({ squash: i * 0.1 }))
    const t0 = performance.now()
    for (let i = 0; i < 20; i++) drawMole(molePose({ squash: i * 0.05, spin: i % 2 ? -60 : 0 }))
    expect((performance.now() - t0) / 20).toBeLessThan(20)
  })
})
