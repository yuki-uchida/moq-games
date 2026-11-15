import { describe, expect, test } from 'vitest'
import { allSheetSpecs } from '../src/art/contract'
import { missingAnims, sheet } from '../src/art/index'
import { anchorOf } from '../src/art/sheet'
import { R, rgbOf } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const SHEETS = [
  'prop:switch1',
  'prop:switch2',
  'prop:door1',
  'prop:door2',
  'prop:gate',
  'prop:goal',
  'prop:nest',
  'prop:cage',
  'prop:fruit',
  'prop:star',
  'prop:twig',
  'prop:berry',
  'prop:seed',
  'prop:feather',
  'prop:stinger',
  'prop:orb',
  'prop:shock',
  'prop:bee'
]
const SMALL = SHEETS.slice(8)

/** Brightness class of a pixel, so two things that differ only in hue do not count as different shapes. */
const tone = (c: number) => {
  if (!c) return -1
  const [r, g, b] = rgbOf(c)
  return Math.min(5, Math.floor((0.3 * r + 0.59 * g + 0.11 * b) / 43))
}

/** Share of pixels, among those painted in either picture, that differ in shape or brightness. */
function shapeDifference(a: Raster, b: Raster) {
  let painted = 0
  let differ = 0
  for (let i = 0; i < a.data.length; i++) {
    if (!a.data[i] && !b.data[i]) continue
    painted++
    if (tone(a.data[i]) !== tone(b.data[i])) differ++
  }
  return differ / painted
}

describe('props B are all drawn', () => {
  for (const id of SHEETS)
    test(id, () => {
      expect(missingAnims(id), `${id} still has stand-ins`).toEqual([])
      for (const name of Object.keys(allSheetSpecs()[id])) expect(sheet(id)[name]).toBeDefined()
    })
})

describe('doors tile and carry their own emblem', () => {
  for (const id of ['prop:door1', 'prop:door2', 'prop:gate'])
    test(`${id} mid has matching top and bottom rows`, () => {
      for (const [i, f] of sheet(id).mid.frames.entries()) {
        for (let x = 0; x < f.w; x++) expect(f.get(x, 0), `${id} frame ${i} column ${x}`).toBe(f.get(x, f.h - 1))
      }
    })

  test('the sun and moon switches differ in shape, not only in colour', () => {
    const a = sheet('prop:switch1').off.frames[0]
    const b = sheet('prop:switch2').off.frames[0]
    expect(shapeDifference(a, b)).toBeGreaterThan(0.05)
  })

  test('the sun and moon door caps differ in shape, not only in colour', () => {
    const a = sheet('prop:door1').top.frames[0]
    const b = sheet('prop:door2').top.frames[0]
    expect(shapeDifference(a, b)).toBeGreaterThan(0.05)
  })

  for (const id of ['prop:door1', 'prop:door2'])
    for (const part of ['top', 'mid', 'bottom'])
      test(`${id} ${part} fills its cell`, () => {
        for (const f of sheet(id)[part].frames) expect(f.count() / (f.w * f.h)).toBeGreaterThanOrEqual(0.85)
      })
})

describe('the goal flag stands in its cell', () => {
  for (const name of ['locked', 'open'])
    test(name, () => {
      for (const [i, f] of sheet('prop:goal')[name].frames.entries())
        for (let y = 72; y < 120; y++) {
          let pole = 0
          for (let x = 0; x < 64; x++) if (f.get(x, y)) pole++
          expect(pole, `frame ${i} row ${y} has no pole`).toBeGreaterThan(0)
        }
    })
})

describe('pickups and projectiles keep clear of the frame edge', () => {
  for (const id of SMALL)
    test(id, () => {
      for (const [name, a] of Object.entries(sheet(id)))
        for (const [i, f] of a.frames.entries()) {
          const b = f.bounds()!
          expect(b.x, `${id}#${name} ${i} left`).toBeGreaterThanOrEqual(1)
          expect(b.y, `${id}#${name} ${i} top`).toBeGreaterThanOrEqual(1)
          expect(b.x + b.w, `${id}#${name} ${i} right`).toBeLessThanOrEqual(f.w - 1)
          expect(b.y + b.h, `${id}#${name} ${i} bottom`).toBeLessThanOrEqual(f.h - 1)
        }
    })
})

describe('the shockwave and the stinger', () => {
  const rowsMass = (f: Raster) => {
    const b = f.bounds()!
    const mid = b.y + b.h / 2
    let top = 0
    let bottom = 0
    for (let y = b.y; y < b.y + b.h; y++) for (let x = 0; x < f.w; x++) if (f.get(x, y)) y < mid ? top++ : bottom++
    return { top, bottom }
  }

  test('the shockwave is densest in its lower half', () => {
    for (const [i, f] of sheet('prop:shock').roll.frames.entries()) {
      const { top, bottom } = rowsMass(f)
      expect(bottom, `frame ${i}`).toBeGreaterThan(top)
    }
  })

  test('the shockwave off the ground (fly): the crest of roll, torn free, nothing on the ground rows, no base', () => {
    const fly = sheet('prop:shock').fly.frames
    const roll = sheet('prop:shock').roll.frames
    expect(fly.length).toBe(4)
    // four frames that differ from each other
    for (let i = 0; i < fly.length; i++)
      for (let j = i + 1; j < fly.length; j++) {
        let differ = 0
        for (let k = 0; k < fly[i].data.length; k++) if (fly[i].data[k] !== fly[j].data[k]) differ++
        expect(differ, `fly ${i} vs fly ${j}`).toBeGreaterThanOrEqual(20)
      }
    for (const [i, f] of fly.entries()) {
      // nothing on the ground line
      for (const y of [30, 31]) for (let x = 0; x < f.w; x++) expect(f.get(x, y), `fly ${i} at ${x},${y}`).toBe(0)
      // the crest is roll's: the opaque pixels of the upper half agree for at least half of them
      let either = 0
      let both = 0
      for (let y = 0; y < f.h / 2; y++)
        for (let x = 0; x < f.w; x++) {
          const a = Boolean(f.get(x, y))
          const b = Boolean(roll[i].get(x, y))
          if (a || b) either++
          if (a && b) both++
        }
      expect(both / either, `fly ${i} crest overlap`).toBeGreaterThanOrEqual(0.5)
      // no base: no horizontal run of more than 10 opaque pixels in the lowest 6 painted rows
      const b = f.bounds()!
      for (let y = b.y + b.h - 6; y < b.y + b.h; y++) {
        let run = 0
        let longest = 0
        for (let x = 0; x < f.w; x++) {
          run = f.get(x, y) ? run + 1 : 0
          longest = Math.max(longest, run)
        }
        expect(longest, `fly ${i} row ${y}`).toBeLessThanOrEqual(10)
      }
    }
  })

  // `gather`: the warning light that forms in front of a boss before his shot leaves, beside the shot's own clip
  for (const [id, shot] of [
    ['prop:orb', 'pulse'],
    ['prop:stinger', 'fly'],
    ['prop:feather', 'spin']
  ] as const)
    test(`${id} gather: a ring of light closes on the forming shot and flashes at the end`, () => {
      const frames = sheet(id).gather.frames
      expect(frames.length).toBe(6)
      const isWhite = (c: number) => {
        if (!c) return false
        const [r, g, bl] = rgbOf(c)
        return Math.min(r, g, bl) >= 230
      }
      /** Painted pixels within 6 px of the centre (the forming shot), near-white pixels, farthest painted pixel. */
      const measure = (f: Raster) => {
        let centre = 0
        let white = 0
        let far = 0
        for (let y = 0; y < f.h; y++)
          for (let x = 0; x < f.w; x++) {
            const c = f.get(x, y)
            if (!c) continue
            const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16)
            if (d <= 6) centre++
            if (isWhite(c)) white++
            far = Math.max(far, d)
          }
        return { centre, white, far }
      }
      const m = frames.map(measure)
      const log = JSON.stringify(m.map((q) => [q.centre, q.white, Math.round(q.far * 10) / 10]))
      for (const [i, f] of frames.entries()) {
        expect([f.w, f.h], `frame ${i} size`).toEqual([32, 32])
        // one pixel of margin
        const b = f.bounds()!
        expect(b.x, `frame ${i} left`).toBeGreaterThanOrEqual(1)
        expect(b.y, `frame ${i} top`).toBeGreaterThanOrEqual(1)
        expect(b.x + b.w, `frame ${i} right`).toBeLessThanOrEqual(31)
        expect(b.y + b.h, `frame ${i} bottom`).toBeLessThanOrEqual(31)
        // a light in every frame
        expect(m[i].white, `frame ${i} near-white pixels ${log}`).toBeGreaterThanOrEqual(1)
        if (i === 0) continue
        // each frame clearly differs from the one before
        const prev = frames[i - 1]
        let differ = 0
        for (let k = 0; k < f.data.length; k++) if (f.data[k] !== prev.data[k]) differ++
        expect(differ, `frame ${i} vs ${i - 1}`).toBeGreaterThanOrEqual(30)
        // the shot at the centre grows, and the ring never moves outwards while it closes (frames 1-4; on frame 5
        // the formed shot, on its ground, may reach past its tight aura: it is held under frame 0 below)
        expect(m[i].centre, `frame ${i} shot at the centre ${log}`).toBeGreaterThanOrEqual(m[i - 1].centre)
        if (i < 5) expect(m[i].far, `frame ${i} farthest pixel ${log}`).toBeLessThanOrEqual(m[i - 1].far)
      }
      // loud from the first frame: a few dozen pixels and a light
      expect(frames[0].count(), 'frame 0 painted area').toBeGreaterThanOrEqual(36)
      // the ring has closed in by the end, and the shot has grown well beyond the first core
      expect(m[5].far, `ring closed ${log}`).toBeLessThanOrEqual(m[0].far - 2)
      expect(m[5].centre, `shot grown ${log}`).toBeGreaterThanOrEqual(m[0].centre * 2)
      // frame 5 flashes: the most near-white pixels of all
      for (let i = 0; i < 5; i++) expect(m[5].white, `frame 5 vs ${i} light ${log}`).toBeGreaterThan(m[i].white)
      // the sign is centred on the cell
      const b = frames[5].bounds()!
      expect(Math.abs(b.x + b.w / 2 - 16), 'frame 5 centred across').toBeLessThanOrEqual(2)
      expect(Math.abs(b.y + b.h / 2 - 16), 'frame 5 centred down').toBeLessThanOrEqual(2)
      // and it is the same object as the shot: most of the shot's colours are in it
      const own = new Set<number>()
      for (const f of sheet(id)[shot].frames) for (const c of f.colors()) own.add(c)
      const ready = frames[5].colors()
      const shared = [...own].filter((c) => ready.has(c)).length
      expect(shared / own.size, `${id} frame 5 shares the colours of ${shot}`).toBeGreaterThanOrEqual(0.6)
    })

  // The light is drawn on the boss's own body, so the forming shot needs a ground of its own between it and him
  for (const [id, shot, boss] of [
    ['prop:stinger', 'fly', 'beeBoss'],
    ['prop:feather', 'spin', 'crowBoss']
  ] as const)
    test(`${id} gather: the forming shot stands on a ground of its own, off ${boss}'s body`, () => {
      const luma = (c: number) => {
        const [r, g, b] = rgbOf(c)
        return 0.299 * r + 0.587 * g + 0.114 * b
      }
      /** Mean luma of the painted pixels, leaving out `skip` (the flying shot's pale rim). */
      const meanLuma = (frames: readonly Raster[], skip = 0) => {
        let s = 0
        let n = 0
        for (const f of frames)
          for (const c of f.data)
            if (c && c !== skip) {
              s += luma(c)
              n++
            }
        return s / n
      }
      const shotL = meanLuma(sheet(id)[shot].frames, R.cloud[1])
      const bodyL = meanLuma(sheet(boss).idle.frames)
      // the ground is clearly lighter or darker than both the shot and the boss's body, on average
      const lo = Math.min(shotL, bodyL) - 40
      const hi = Math.max(shotL, bodyL) + 40
      // the shot's fill colours (its outline and dark bands aside)
      const fill = new Set<number>()
      const own = new Set<number>()
      for (const f of sheet(id)[shot].frames)
        for (const c of f.colors()) {
          // the flying shot's own pale rim (R.cloud[1]) is a ground colour, not the shot
          if (c === R.cloud[1]) continue
          own.add(c)
          if (luma(c) >= 60) fill.add(c)
        }
      for (const i of [3, 4, 5]) {
        const f = sheet(id).gather.frames[i]
        const key = (x: number, y: number) => y * f.w + x
        const near = (x: number, y: number) => Math.hypot(x + 0.5 - 16, y + 0.5 - 16) <= 6
        const body = new Set<number>()
        for (let y = 0; y < f.h; y++)
          for (let x = 0; x < f.w; x++) if (near(x, y) && fill.has(f.get(x, y))) body.add(key(x, y))
        expect(body.size, `frame ${i} shows the shot`).toBeGreaterThanOrEqual(10)
        // the shot's own dark outline: dark pixels touching its fill
        const rim = new Set<number>()
        const n4 = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ]
        for (const k of body)
          for (const [dx, dy] of n4) {
            const x = (k % f.w) + dx
            const y = Math.floor(k / f.w) + dy
            const c = f.get(x, y)
            if (c && !body.has(key(x, y)) && luma(c) < 60) rim.add(key(x, y))
          }
        // what lies just outside that outline must be the ground, not the boss showing through
        let outside = 0
        let grounded = 0
        for (const k of rim)
          for (const [dx, dy] of n4) {
            const x = (k % f.w) + dx
            const y = Math.floor(k / f.w) + dy
            const k2 = key(x, y)
            if (body.has(k2) || rim.has(k2) || x < 0 || y < 0 || x >= f.w || y >= f.h) continue
            const c = f.get(x, y)
            // the shot's own colours (its dark bands and inner lines) are not what lies outside it
            if (c && own.has(c)) continue
            outside++
            if (c && (luma(c) >= hi || luma(c) <= lo)) grounded++
          }
        expect(outside, `frame ${i} outline has an outside`).toBeGreaterThan(0)
        expect(grounded / outside, `frame ${i}: ${grounded} of ${outside} on the ground`).toBeGreaterThanOrEqual(0.75)
      }
    })

  // The light promises a shot, not a side: the view draws `gather` unmirrored whichever way the shot then flies, so
  // every frame must read the same both ways
  for (const id of ['prop:orb', 'prop:stinger', 'prop:feather'])
    test(`${id} gather is its own mirror image about the anchor's vertical line, pixel for pixel`, () => {
      const anim = sheet(id).gather
      const [ax] = anchorOf(anim)
      for (const [i, f] of anim.frames.entries())
        for (let y = 0; y < f.h; y++)
          for (let x = 0; x < f.w; x++) {
            // pixel column x mirrors to 2 * ax - 1 - x (the line runs between columns ax - 1 and ax)
            const m = 2 * ax - 1 - x
            const there = m >= 0 && m < f.w ? f.get(m, y) : 0
            expect(f.get(x, y), `frame ${i} at ${x},${y} vs ${m},${y}`).toBe(there)
          }
    })

  test('the stinger ends in a single dark tip', () => {
    for (const [i, f] of sheet('prop:stinger').fly.frames.entries()) {
      const b = f.bounds()!
      const x = b.x + b.w - 1
      const tip: number[] = []
      for (let y = 0; y < f.h; y++) if (f.get(x, y)) tip.push(f.get(x, y))
      expect(tip.length, `frame ${i}`).toBe(1)
      const [r, g, bl] = rgbOf(tip[0])
      expect(r + g + bl, `frame ${i} tip is dark`).toBeLessThan(120)
    }
  })
})
