import { describe, expect, test } from 'vitest'
import { drawFox, footfalls, foxRig, idlePoses, movePoses, shootPoses } from '../src/art/chars/bosses/fox'
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

  describe('shoot: the ninja cast', () => {
    /** The pale core of the fox-fire and of the release flash: no other drawing of his uses it. */
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

    test('the fox-fire burns in frames 1–3 and is gone by frame 5', () => {
      const fs = s.shoot.frames
      for (const i of [1, 2, 3]) expect(count(fs[i], fire), `shoot ${i} fire`).toBeGreaterThanOrEqual(3)
      expect(count(fs[2], fire), 'the flame grows').toBeGreaterThan(count(fs[1], fire))
      expect(count(fs[5], fire), 'shoot 5 fire').toBe(0)
      for (const name of ['idle', 'move', 'windup', 'attack', 'recover', 'intro', 'hurt', 'defeat'])
        for (const [i, f] of s[name].frames.entries()) expect(count(f, fire), `${name} ${i} fire`).toBe(0)
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

  test('grounded clips stand on the anchor row', () => {
    for (const name of ['idle', 'recover', 'windup'])
      for (const [i, f] of s[name].frames.entries()) {
        const bottom = box(f).y + box(f).h - 1
        expect(Math.abs(bottom - 120), `${name} ${i} bottom ${bottom}`).toBeLessThanOrEqual(1)
      }
  })
})
