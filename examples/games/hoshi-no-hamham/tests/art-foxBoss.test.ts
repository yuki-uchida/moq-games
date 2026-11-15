import { describe, expect, test } from 'vitest'
import { airPoses, drawFox, footfalls, foxRig, idlePoses, movePoses, shootPoses } from '../src/art/chars/bosses/fox'
import { bossSpec } from '../src/art/contract'
import { sheet } from '../src/art/index'
import { anchorOf } from '../src/art/sheet'
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

  describe('shoot: the ninja cast', () => {
    /** The pale core the fox-fire and the release flash would be drawn with: none of his drawings uses it. */
    const fire = new Set<number>([R.fire[0]])
    const front = (f: Raster) => box(f).x + box(f).w - 1
    const bottom = (f: Raster) => box(f).y + box(f).h - 1

    test('six frames, hit on 3', () => {
      expect(s.shoot.frames.length).toBe(6)
      expect(spec.shoot.hit).toBe(3)
    })

    test('the thrust on hit reaches furthest forward of the clip and past the stance', () => {
      const fs = s.shoot.frames
      const hit = front(fs[3])
      for (const [i, f] of fs.entries()) if (i !== 3) expect(front(f), `shoot ${i}`).toBeLessThan(hit)
      for (const [i, f] of s.idle.frames.entries()) expect(front(f), `idle ${i}`).toBeLessThan(hit - 6)
    })

    test('a low leap: off the ground on frames 1–4, the body higher there than on the spring and the touch-down', () => {
      const idleBottom = bottom(s.idle.frames[0])
      const fs = s.shoot.frames
      for (const i of [0, 5])
        expect(Math.abs(bottom(fs[i]) - idleBottom), `shoot ${i} on the ground`).toBeLessThanOrEqual(1)
      for (const i of [1, 2, 3, 4]) expect(bottom(fs[i]), `shoot ${i} in the air`).toBeLessThan(idleBottom - 1)
      const pelvis = shootPoses().map((p) => foxRig(p).pelvis.pt(0, 0)[1])
      for (const i of [1, 2, 3, 4])
        for (const j of [0, 5]) expect(pelvis[i], `pelvis ${i} above ${j}`).toBeLessThan(pelvis[j] - 3)
      // the whole figure lifts 10–14 px at the top of the leap
      const lift = Math.max(...shootPoses().map((p) => p.rise))
      expect(lift).toBeGreaterThanOrEqual(10)
      expect(lift).toBeLessThanOrEqual(14)
    })

    test('the release on hit reaches further forward than every other frame, near the height the orb leaves', () => {
      const wrist = (i: number) => {
        const p = shootPoses()[i]
        return foxRig(p).torso.pt(0.5 + p.armN[0], -16.5 + p.armN[1])
      }
      for (const i of [0, 1, 2, 4, 5]) expect(wrist(3)[0], `wrist 3 ahead of ${i}`).toBeGreaterThan(wrist(i)[0] + 6)
      // the game spawns the orb at about 40 % of his 63 px box from the top, the box standing on row 120
      expect(Math.abs(wrist(3)[1] - (120 - 63 * 0.6))).toBeLessThanOrEqual(8)
    })

    test('a command, not a throw: no fox-fire over the paw and no flash at the fingertips in any frame', () => {
      // the orb gathers in the light on his body (the view's `gather`); nothing burns in his hand
      for (const [i, p] of shootPoses().entries()) {
        expect(p.fire, `shoot ${i} flame radius`).toBe(0)
        expect(p.flash, `shoot ${i} release flash`).toBe(0)
      }
      for (const [name, anim] of Object.entries(s))
        for (const [i, f] of anim.frames.entries()) expect(count(f, fire), `${name} ${i} fire`).toBe(0)
    })

    test('neighbouring frames differ', () => {
      const fs = s.shoot.frames
      for (let i = 0; i + 1 < fs.length; i++)
        expect(differ(fs[i], fs[i + 1]), `shoot ${i} → ${i + 1}`).toBeGreaterThanOrEqual(0.1)
    })
  })

  test('the run is a run: each foot down three frames, both feet off the ground on frames 3 and 7', () => {
    const feet = footfalls.foxBoss.move.feet
    for (const foot of feet) expect(foot.filter((x) => x !== null).length).toBe(3)
    for (const i of [3, 7]) for (const foot of feet) expect(foot[i], `move ${i}`).toBeNull()
    for (const [i, f] of s.move.frames.entries()) {
      const b = box(f).y + box(f).h - 1
      if (i % 4 === 3) expect(b, `move ${i} in flight`).toBeLessThan(119)
      else expect(Math.abs(b - 120), `move ${i} bottom ${b}`).toBeLessThanOrEqual(1)
    }
  })

  describe('air: off the ground with no gesture (0 rising, 1 the top, 2 falling)', () => {
    const fs = () => s.air.frames

    test('three frames, all clearly off the ground rows', () => {
      expect(fs().length).toBe(3)
      const [, ay] = anchorOf(s.air)
      for (const [i, f] of fs().entries()) {
        // nothing on the ground rows the feet stand on (the anchor row and the one above), with air under him
        for (const y of [ay - 1, ay, ay + 1])
          for (let x = 0; x < f.w; x++) expect(f.get(x, y), `air ${i} at ${x},${y}`).toBe(0)
        const bottom = box(f).y + box(f).h - 1
        expect(bottom, `air ${i} bottom ${bottom}`).toBeLessThanOrEqual(ay - 4)
      }
    })

    test('the three frames differ', () => {
      const f = fs()
      for (let i = 0; i < f.length; i++)
        for (let j = i + 1; j < f.length; j++)
          expect(differ(f[i], f[j]), `air ${i} vs ${j}`).toBeGreaterThanOrEqual(0.1)
    })

    test('he stays the size of his leap, inside the cell', () => {
      const leap = [1, 2, 3, 4].map((i) => box(s.shoot.frames[i]))
      const hMax = Math.max(...leap.map((b) => b.h))
      const wMax = Math.max(...leap.map((b) => b.w))
      for (const [i, f] of fs().entries()) {
        const b = box(f)
        expect(b.h, `air ${i} height`).toBeLessThanOrEqual(hMax + 8)
        expect(b.w, `air ${i} width`).toBeLessThanOrEqual(wMax + 4)
        expect(b.h, `air ${i} height`).toBeGreaterThanOrEqual(Math.min(...leap.map((q) => q.h)) - 12)
      }
    })

    test('no gesture: nothing burns in his hands, the hands are open, no whirl', () => {
      for (const [i, p] of airPoses().entries()) {
        expect(p.fire, `air ${i} flame`).toBe(0)
        expect(p.flash, `air ${i} flash`).toBe(0)
        expect(p.spin, `air ${i} spin`).toBe(0)
        expect(p.wind, `air ${i} wind`).toBe(0)
        expect([p.handN, p.handF], `air ${i} hands`).toEqual(['open', 'open'])
      }
    })

    test('falling (frame 2): headband and tail stream up; rising (frame 0): the tail hangs down', () => {
      const [p0, , p2] = airPoses()
      // the band's direction is + down; the tail's spine is in pelvis units with v down
      expect(p2.band[0]).toBeLessThan(-30)
      expect(p2.tail[4][1]).toBeLessThan(-30)
      expect(p0.tail[4][1]).toBeGreaterThan(20)
    })
  })

  test('grounded clips stand on the anchor row', () => {
    for (const name of ['idle', 'recover', 'windup'])
      for (const [i, f] of s[name].frames.entries()) {
        const bottom = box(f).y + box(f).h - 1
        expect(Math.abs(bottom - 120), `${name} ${i} bottom ${bottom}`).toBeLessThanOrEqual(1)
      }
  })

  test('every frame a shot can leave from has his body under both places it is born', () => {
    // sim.ts makes the shot 7 px beside the middle of his box (to the right facing right; mirrored, the same world
    // place is 7 px behind his middle), 0.4 of the 63.36 px box down from its top, plus 7: the light gathers there
    // and the shot comes out of it, so in every frame of these clips both places lie on a painted pixel or within 3 px
    // of one
    const H = 63.36
    // `air` too: the light can show while he drops off a ledge in his wind-up
    for (const name of ['idle', 'move', 'windup', 'attack', 'shoot', 'recover', 'hurt', 'air']) {
      const anim = s[name]
      const [ax, ay] = anchorOf(anim)
      const by = Math.round(ay - H + H * 0.4 + 7)
      const limit = 3
      for (const [i, f] of anim.frames.entries())
        for (const bx of [Math.round(ax + 7), Math.round(ax - 7)]) {
          let best = Infinity
          for (let y = Math.max(0, by - 6); y <= Math.min(f.h - 1, by + 6); y++)
            for (let x = Math.max(0, bx - 6); x <= Math.min(f.w - 1, bx + 6); x++)
              if (f.get(x, y)) best = Math.min(best, Math.hypot(x - bx, y - by))
          expect(best, `${name} ${i} at ${bx - ax},${by - ay}`).toBeLessThanOrEqual(limit)
        }
    }
  })
})
