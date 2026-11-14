import { describe, expect, test } from 'vitest'
import { KING_MANTLE, KING_RAGE_RED } from '../src/art/chars/king'
import { KING_RAGED, KING_RAGED_SPEC, bossSpec } from '../src/art/contract'
import { sheet } from '../src/art/index'
import { C, R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const ID = 'king'
const spec = bossSpec(ID)
const purple = new Set<number>([...R.kingPurple.slice(0, 4), KING_MANTLE[1]])
const crimson = new Set<number>(R.crimson.slice(0, 4))
const gold = new Set<number>(R.gold.slice(0, 4))
const red = new Set<number>([KING_RAGE_RED])

const box = (f: Raster) => f.bounds()!
const bottom = (f: Raster) => box(f).y + box(f).h - 1
const reach = (f: Raster) => box(f).x + box(f).w - 1
const count = (f: Raster, set: Set<number>, y0 = 0, y1 = f.h) => {
  let n = 0
  for (let y = y0; y < y1; y++) for (let x = 0; x < f.w; x++) if (set.has(f.get(x, y))) n++
  return n
}
/** The dark fire's ramp (his cast's flame and burst on the plain sheet). */
const fire = new Set<number>(R.dark.slice(0, 3))
/**
 * The share of the box where the game throws his orbs painted in one of the colours, in the worse of his two
 * facings. The box is 14 px wide with its left edge on his centre column whichever way he faces, 41 to 27 px over
 * the anchor row; the sprite is mirrored about the anchor column (64) and the box is not, so in the cell's own
 * pixels it is x 64–77 when he faces right and x 50–63 when he faces left (y 79–93 both).
 */
const inBirthBox = (f: Raster, set: Set<number>) =>
  Math.min(
    ...[64, 50].map((x0) => {
      let n = 0
      for (let y = 79; y <= 93; y++) for (let x = x0; x < x0 + 14; x++) if (set.has(f.get(x, y))) n++
      return n / (14 * 15)
    })
  )
/** The highest row holding a colour of the set. */
const topOf = (f: Raster, set: Set<number>) => {
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (set.has(f.get(x, y))) return y
  return f.h
}

describe('黒ハム王 (king) on the hamster kit', () => {
  const s = sheet(ID)

  test('every clip of the new spec is drawn with its frame count, timing and sustain', () => {
    for (const [name, want] of Object.entries(spec)) {
      expect(s[name], `${name} is missing`).toBeDefined()
      expect(s[name].frames.length, `${name} frames`).toBe(want.frames)
      expect(s[name].fps, `${name} fps`).toBe(want.fps)
      expect(s[name].loop, `${name} loop`).toBe(want.loop)
      expect(s[name].sustain, `${name} sustain`).toBe(want.sustain)
    }
  })

  test('dark purple, with the crimson cape and the gold crown in every idle and move frame', () => {
    for (const clip of ['idle', 'move'])
      for (const [i, f] of s[clip].frames.entries()) {
        expect(count(f, purple) / f.count(), `${clip} ${i} is mostly purple`).toBeGreaterThan(0.35)
        expect(count(f, crimson), `${clip} ${i} wears the cape`).toBeGreaterThan(150)
        expect(count(f, gold), `${clip} ${i} wears the crown`).toBeGreaterThan(60)
      }
  })

  test('he towers over the hero: at least three times the painted area of her idle', () => {
    const hero = sheet('hero').idle.frames[0].count()
    for (const f of s.idle.frames) expect(f.count()).toBeGreaterThanOrEqual(hero * 3)
  })

  test('the crown is the highest material when he stands', () => {
    for (const f of s.idle.frames) expect(topOf(f, gold)).toBe(box(f).y)
  })

  test('the charge reaches further forward than standing', () => {
    const idle = Math.max(...s.idle.frames.map(reach))
    for (const f of s.attack.frames) expect(reach(f)).toBeGreaterThan(idle)
  })

  test('air: the top of the leap (cape spread) is the widest of the three', () => {
    const [up, top, down] = s.air.frames.map((f) => box(f).w)
    expect(top).toBeGreaterThan(up)
    expect(top).toBeGreaterThan(down)
  })

  test('the slam: land frame 0 is lower and wider than idle', () => {
    const idle = box(s.idle.frames[0])
    const slam = box(s.land.frames[0])
    expect(slam.y).toBeGreaterThan(idle.y)
    expect(slam.w).toBeGreaterThan(idle.w)
  })

  test('the cast gathers a flame under his chin (0–2): it grows each frame, on the orbs’ birth box', () => {
    const flame = s.shoot.frames.slice(0, 3).map((f) => count(f, fire))
    expect(flame[0]).toBeGreaterThan(40)
    expect(flame[1]).toBeGreaterThan(flame[0])
    expect(flame[2]).toBeGreaterThan(flame[1])
    expect(inBirthBox(s.shoot.frames[2], fire)).toBeGreaterThan(0.4)
  })

  test('the cast flings the volley up (hit frame 3): the burst covers the birth box, the arms go up, nothing low', () => {
    expect(spec.shoot.hit).toBe(3)
    const hit = s.shoot.frames[3]
    expect(inBirthBox(hit, new Set<number>([...fire, C.white]))).toBeGreaterThan(0.8)
    // the paws thrown up and out: the painted body (not the crown) reaches higher and wider than in any gathering frame
    const body = (f: Raster) => {
      let top = f.h
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (purple.has(f.get(x, y)) && y < top) top = y
      return top
    }
    for (const f of s.shoot.frames.slice(0, 3)) {
      expect(body(hit)).toBeLessThan(body(f))
      expect(box(hit).w).toBeGreaterThanOrEqual(box(f).w)
    }
    // nothing thrust forward: the release reaches no further ahead than his stance does
    expect(reach(hit)).toBeLessThanOrEqual(Math.max(...s.idle.frames.map(reach)) + 2)
    // the burst thins to wisps, then almost nothing
    const after = s.shoot.frames.slice(3).map((f) => count(f, fire))
    expect(after[1]).toBeLessThan(after[0])
    expect(after[2]).toBeLessThan(after[1])
  })

  test('the cast keeps him planted over the anchor', () => {
    /** The mean column of his soles: the paw colours on his four lowest rows. */
    const soles = new Set<number>(R.kingBelly.slice(0, 4))
    const feet = (f: Raster) => {
      let sum = 0
      let n = 0
      for (let y = bottom(f) - 3; y <= bottom(f); y++)
        for (let x = 0; x < f.w; x++)
          if (soles.has(f.get(x, y))) {
            sum += x
            n++
          }
      expect(n).toBeGreaterThan(10)
      return sum / n
    }
    const stance = feet(s.idle.frames[0])
    for (const [i, f] of s.shoot.frames.entries()) {
      expect(bottom(f), `shoot ${i}`).toBe(bottom(s.idle.frames[0]))
      expect(Math.abs(feet(f) - stance), `shoot ${i} feet`).toBeLessThanOrEqual(3)
    }
  })

  test('red eyes appear only in the rage, and there in the second half', () => {
    for (const [name, anim] of Object.entries(s))
      for (const [i, f] of anim.frames.entries()) if (name !== 'rage') expect(count(f, red), `${name} ${i}`).toBe(0)
    for (const f of s.rage.frames.slice(3)) expect(count(f, red)).toBeGreaterThan(6)
  })

  test('the rage: dark fire grows behind him', () => {
    const fire = new Set<number>(R.dark.slice(0, 3))
    const n = s.rage.frames.map((f) => count(f, fire))
    expect(n[6]).toBeGreaterThan(n[0] * 3)
    expect(n[6]).toBeGreaterThan(800)
  })

  test('defeat ends low and flat, with the crown on the ground away from his head', () => {
    const idle = box(s.idle.frames[0])
    for (const f of s.defeat.frames.slice(-2)) {
      const b = box(f)
      expect(b.w).toBeGreaterThan(b.h)
      expect(b.h).toBeLessThan(idle.h * 0.85)
      // the crown lies in the lower half of the picture, at the far right, not on the head at the left
      const crownTop = topOf(f, gold)
      expect(crownTop).toBeGreaterThan(b.y + b.h * 0.3)
      let gx = 0
      let gn = 0
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++)
          if (gold.has(f.get(x, y))) {
            gx += x
            gn++
          }
      expect(gx / gn).toBeGreaterThan(b.x + b.w * 0.75)
    }
  })

  test('every frame stays at least 1 px clear of the cell edge', () => {
    for (const [name, anim] of Object.entries(s))
      for (const [i, f] of anim.frames.entries()) {
        const b = box(f)
        expect(b.x, `${name} ${i}`).toBeGreaterThanOrEqual(1)
        expect(b.y, `${name} ${i}`).toBeGreaterThanOrEqual(1)
        expect(b.x + b.w, `${name} ${i}`).toBeLessThanOrEqual(f.w - 1)
        expect(b.y + b.h, `${name} ${i}`).toBeLessThanOrEqual(f.h - 1)
      }
  })

  test('standing clips keep their lowest row on the anchor (rows 118–123)', () => {
    for (const name of ['idle', 'intro', 'hurt', 'windup', 'land', 'shoot', 'recover', 'rage'])
      for (const [i, f] of s[name].frames.entries()) {
        expect(bottom(f), `${name} ${i}`).toBeGreaterThanOrEqual(118)
        expect(bottom(f), `${name} ${i}`).toBeLessThanOrEqual(123)
      }
  })

  test('the jog: a foot on the anchor row on every frame but the two flights (3, 7), which are 3 px up', () => {
    const ground = Math.max(...s.move.frames.map(bottom))
    expect(ground).toBeGreaterThanOrEqual(118)
    expect(ground).toBeLessThanOrEqual(123)
    for (const [i, f] of s.move.frames.entries())
      if (i % 4 === 3) expect(bottom(f), `move ${i}`).toBeLessThanOrEqual(ground - 3)
      else expect(bottom(f), `move ${i}`).toBe(ground)
  })

  test('the charge rolls along the ground: every frame on the ground rows of his stance, at one height', () => {
    const ground = Math.max(...s.idle.frames.map(bottom))
    for (const [i, f] of s.attack.frames.entries()) {
      expect(bottom(f), `attack ${i}`).toBeGreaterThanOrEqual(ground - 1)
      expect(bottom(f), `attack ${i}`).toBeLessThanOrEqual(ground + 1)
    }
  })

  test('the roll turns: the crown goes round the ball one full turn a pass, clockwise, about 60° a frame', () => {
    const frames = s.attack.frames
    /** The crown's angle round the middle of the painted ball (screen degrees, clockwise +). */
    const angle = (f: Raster) => {
      const b = box(f)
      const cy = b.y + b.h / 2
      const cx = b.x + b.w - b.h / 2 // the ball's centre: its right edge less its radius (the cape's loose end trails left)
      let gx = 0
      let gy = 0
      let n = 0
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++)
          if (gold.has(f.get(x, y))) {
            gx += x
            gy += y
            n++
          }
      expect(n, 'the crown shows').toBeGreaterThan(40)
      return (Math.atan2(gy / n - cy, gx / n - cx) * 180) / Math.PI
    }
    const a = frames.map(angle)
    let total = 0
    for (let i = 0; i < a.length; i++) {
      const step = ((((a[(i + 1) % a.length] - a[i]) % 360) + 540) % 360) - 180
      expect(step, `attack ${i} to ${(i + 1) % a.length}`).toBeGreaterThan(30)
      expect(step, `attack ${i} to ${(i + 1) % a.length}`).toBeLessThan(90)
      total += step
    }
    expect(total).toBeCloseTo(360, 0)
  })

  test('the roll keeps the cape red and the eyes in every frame', () => {
    for (const [i, f] of s.attack.frames.entries()) {
      expect(count(f, crimson), `attack ${i} cape`).toBeGreaterThan(800)
      expect(count(f, new Set<number>([C.glow])), `attack ${i} eyes`).toBeGreaterThan(2)
    }
  })
})

describe('黒ハム王 after the transformation (king:raged)', () => {
  const plain = sheet(ID)
  const raged = sheet(KING_RAGED)
  const CLIPS = ['idle', 'hurt', 'move', 'windup', 'attack', 'air', 'land', 'shoot', 'recover']
  /** The aura's ramp (its fill, shade and core; the line is the king's own ink). */
  const fire = new Set<number>(R.dark.slice(0, 4))
  /** The plain eye's glow (both the resting and the hot key light it; nothing else of these clips uses it). */
  const glow = new Set<number>([C.glow])
  /** Painted, and not the aura. */
  const body = (f: Raster, x: number, y: number) => f.get(x, y) !== 0 && !fire.has(f.get(x, y))
  /** A pixel next to one of the fire's ramp (the plain cast's flame and flash). */
  const nearFire = (f: Raster, x: number, y: number) =>
    [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => fire.has(f.get(x + dx, y + dy))))

  test('exactly the fight clips, with the plain timing and the contract', () => {
    expect(Object.keys(KING_RAGED_SPEC).sort()).toEqual([...CLIPS].sort())
    expect(Object.keys(raged).sort()).toEqual([...CLIPS].sort())
    for (const name of CLIPS) {
      const want = KING_RAGED_SPEC[name]
      for (const a of [raged[name], plain[name]]) {
        expect(a.frames.length, `${name} frames`).toBe(want.frames)
        expect(a.fps, `${name} fps`).toBe(want.fps)
        expect(a.loop, `${name} loop`).toBe(want.loop)
        expect(a.sustain, `${name} sustain`).toBe(want.sustain)
      }
    }
  })

  test('every frame burns: aura pixels in each raged frame, none in the plain one', () => {
    for (const name of CLIPS)
      for (const [i, f] of raged[name].frames.entries()) {
        const p = plain[name].frames[i]
        // the plain cast's own flame and flash use the ramp too: the aura adds to them
        expect(count(f, fire) - count(p, fire), `${name} ${i}`).toBeGreaterThan(150)
        if (name !== 'shoot') expect(count(p, fire), `plain ${name} ${i}`).toBe(0)
      }
  })

  test('red eyes in every frame with the eyes open, and never the yellow glow', () => {
    // only the two flinching frames of `hurt` have the eyes squeezed shut (drawn in ink on both sheets)
    const shut = (name: string, i: number) => name === 'hurt' && i < 2
    for (const name of CLIPS)
      for (const [i, f] of raged[name].frames.entries()) {
        const p = plain[name].frames[i]
        expect(count(p, red), `plain ${name} ${i}`).toBe(0)
        expect(count(f, glow), `${name} ${i}`).toBe(0)
        if (shut(name, i)) expect(count(f, red), `${name} ${i} (eyes shut)`).toBe(0)
        else expect(count(f, red), `${name} ${i}`).toBeGreaterThan(4)
      }
  })

  test('the same pose: with the aura masked out, the raged frame covers the plain one exactly', () => {
    for (const name of CLIPS)
      for (const [i, f] of raged[name].frames.entries()) {
        const p = plain[name].frames[i]
        let missing = 0
        let extra = 0
        for (let y = 0; y < f.h; y++)
          for (let x = 0; x < f.w; x++) {
            // (the rim of the cast's own flame may merge into the aura's ramp where the two touch)
            if (body(p, x, y) && !body(f, x, y) && !nearFire(p, x, y)) missing++
            if (body(f, x, y) && !p.get(x, y)) extra++
          }
        expect(missing, `${name} ${i}: plain pixels lost`).toBe(0)
        // the aura's outline in the king's ink is all it may add around him
        expect(extra, `${name} ${i}: pixels added outside the aura`).toBeLessThan(count(f, fire) * 0.6)
      }
  })

  test('the aura stays behind the face: the mask and the mouth are drawn as on the plain sheet', () => {
    // every pixel the plain frame paints in the face's colours (the lilac mask, the mouth) is the same on the raged
    // one (white is left out: the hot eye's highlight is white and turns pink in the red eye)
    const face = new Set<number>([C.mouth, ...R.kingBelly.slice(0, 2)])
    for (const name of CLIPS)
      for (const [i, f] of raged[name].frames.entries()) {
        const p = plain[name].frames[i]
        for (let y = 0; y < f.h; y++)
          for (let x = 0; x < f.w; x++)
            if (face.has(p.get(x, y))) expect(f.get(x, y), `${name} ${i} at ${x},${y}`).toBe(p.get(x, y))
      }
  })

  test('every frame one pixel clear of the cell; standing clips on the plain soles', () => {
    for (const name of CLIPS)
      for (const [i, f] of raged[name].frames.entries()) {
        const b = box(f)
        expect(b.x, `${name} ${i}`).toBeGreaterThanOrEqual(1)
        expect(b.y, `${name} ${i}`).toBeGreaterThanOrEqual(1)
        expect(b.x + b.w, `${name} ${i}`).toBeLessThanOrEqual(f.w - 1)
        expect(b.y + b.h, `${name} ${i}`).toBeLessThanOrEqual(f.h - 1)
        if (name !== 'air') expect(bottom(f), `${name} ${i}`).toBe(bottom(plain[name].frames[i]))
      }
  })

  test('the loops close: the last frame leads into the first no harder than any step', () => {
    for (const name of CLIPS.filter((c) => raged[c].loop)) {
      const fr = raged[name].frames
      const diff = (a: Raster, b: Raster) => {
        let n = 0
        for (let k = 0; k < a.data.length; k++) if (a.data[k] !== b.data[k]) n++
        return n
      }
      const steps = fr.slice(1).map((f, i) => diff(fr[i], f))
      expect(diff(fr[fr.length - 1], fr[0]), name).toBeLessThanOrEqual(Math.max(...steps))
    }
  })

  test('the aura leans with him: streaming back in the charge, thrown wide on the slam', () => {
    /** The aura's horizontal extent behind (left of) and before (right of) the body's own box. */
    const reachOut = (f: Raster, p: Raster) => {
      const b = box(p)
      let back = 0
      let front = 0
      for (let y = 0; y < f.h; y++)
        for (let x = 0; x < f.w; x++)
          if (fire.has(f.get(x, y))) {
            back = Math.max(back, b.x - x)
            front = Math.max(front, x - (b.x + b.w - 1))
          }
      return { back, front }
    }
    const idleBack = Math.max(...raged.idle.frames.map((f, i) => reachOut(f, plain.idle.frames[i]).back))
    for (const [i, f] of raged.attack.frames.entries())
      expect(reachOut(f, plain.attack.frames[i]).back, `attack ${i}`).toBeGreaterThan(idleBack)
    // the slam: the aura's top sits lower than in the standing pose (flattened)
    const auraTop = (f: Raster) => topOf(f, fire)
    expect(auraTop(raged.land.frames[0])).toBeGreaterThan(Math.max(...raged.idle.frames.map(auraTop)))
  })

  test('the raged cast flings its volley up too: the burst on the orbs’ birth box, its heart his rage red', () => {
    expect(KING_RAGED_SPEC.shoot.hit).toBe(3)
    const hit = raged.shoot.frames[3]
    expect(inBirthBox(hit, new Set<number>([...R.dark.slice(0, 3), C.white, KING_RAGE_RED]))).toBeGreaterThan(0.8)
    // red only in the eyes and the fire's heart: more of it on the burst frame than on a plain gathering frame
    expect(count(hit, red)).toBeGreaterThan(count(raged.shoot.frames[0], red))
  })
})
