import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { crowBossNearTip, crowBossPoses, crowBossWingTips } from '../src/art/chars/bosses/crow'
import { bossSpec } from '../src/art/contract'
import { sheet } from '../src/art/index'
import { C, R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const ID = 'crowBoss'
const spec = bossSpec(ID)
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

  const bottom = (f: Raster) => box(f).y + box(f).h - 1
  const right = (f: Raster) => box(f).x + box(f).w - 1

  test('shoot: the wing coils back, flicks forward and down on the hit frame, and he stays at his hover height', () => {
    const shoot = s.shoot.frames
    expect(shoot).toHaveLength(spec.shoot.frames)
    expect(spec.shoot.hit).toBe(3)
    const poses = crowBossPoses.shoot()
    const tip = poses.map((p) => crowBossNearTip(p).tip)
    const idleTips = crowBossPoses.idle().map((p) => crowBossNearTip(p).tip)
    // the near wing's tip on the release is forward of where it is in any hover frame, and lower than on the coil
    expect(tip[3][0]).toBeGreaterThan(tip[0][0] + 30)
    for (const t of idleTips) expect(tip[3][0], 'release tip forward of the hover').toBeGreaterThan(t[0] + 10)
    expect(tip[3][1]).toBeGreaterThan(tip[0][1] + 20)
    expect(tip[3][1]).toBeGreaterThan(idleTips[0][1])
    // the drawn release reaches further forward than the coil and than any idle frame
    const idleRight = Math.max(...s.idle.frames.map(right))
    expect(right(shoot[3])).toBeGreaterThan(right(shoot[0]))
    expect(right(shoot[3])).toBeGreaterThan(idleRight)
    // the body follows the throw: forward and tipped forward on the release, back on the coil
    expect(poses[3].x).toBeGreaterThan(poses[0].x)
    expect(poses[3].lean).toBeGreaterThan(0)
    expect(poses[1].lean).toBeLessThan(0)
    // the caw opens the beak
    expect(count(shoot[3], new Set([C.mouth]))).toBeGreaterThan(20)
    // the far wing keeps beating
    expect(new Set(poses.map((p) => p.wingF[0])).size).toBeGreaterThanOrEqual(5)
    // hover height: the lowest painted row of frames 0 and 5 within 3 px of the idle ones
    const idleBottoms = s.idle.frames.map(bottom)
    for (const i of [0, 5]) {
      expect(bottom(shoot[i]), `shoot ${i} bottom`).toBeGreaterThanOrEqual(Math.min(...idleBottoms) - 3)
      expect(bottom(shoot[i]), `shoot ${i} bottom`).toBeLessThanOrEqual(Math.max(...idleBottoms) + 3)
    }
  })

  test('sweep: low, wide and level, the wing beat changes his height, dust on two frames', () => {
    const sweep = s.sweep.frames
    expect(sweep).toHaveLength(spec.sweep.frames)
    const idleWidest = Math.max(...s.idle.frames.map((f) => box(f).w))
    for (const [i, f] of sweep.entries()) {
      expect(box(f).w, `sweep ${i} wider than tall`).toBeGreaterThan(box(f).h)
      expect(box(f).w, `sweep ${i} as wide as the hover`).toBeGreaterThanOrEqual(idleWidest)
      expect(bottom(f), `sweep ${i} lowest row`).toBeGreaterThanOrEqual(116)
      expect(bottom(f), `sweep ${i} lowest row`).toBeLessThanOrEqual(123)
    }
    // the body is level (the steep dive leans 108)
    for (const p of crowBossPoses.sweep()) expect(p.lean).toBeGreaterThanOrEqual(70)
    // the wing beat: the top of the figure moves through the loop by several pixels
    const tops = sweep.map((f) => box(f).y)
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThanOrEqual(10)
    expect(new Set(sweep.map((f) => box(f).h)).size).toBeGreaterThanOrEqual(3)
    // dust kicked up on the anchor row in exactly two frames
    const dust = new Set<number>(R.dust.slice(0, 4))
    const dusty = sweep.map((f) => count(f, dust) > 20)
    expect(dusty.filter(Boolean)).toHaveLength(2)
  })

  test('attack: the dive loop moves — neighbouring frames differ by at least 4 % of the painted pixels', () => {
    const fr = s.attack.frames
    const painted = (f: Raster) => f.data.reduce((n, c) => n + (c ? 1 : 0), 0)
    for (let i = 0; i < fr.length; i++) {
      const a = fr[i]
      const b = fr[(i + 1) % fr.length]
      let d = 0
      for (let k = 0; k < a.data.length; k++) if (a.data[k] !== b.data[k]) d++
      expect(d / Math.max(painted(a), painted(b)), `attack ${i}→${(i + 1) % fr.length}`).toBeGreaterThanOrEqual(0.04)
    }
  })

  test('the other clips are pixel for pixel what they were', () => {
    const PINNED: Record<string, string> = {
      idle: 'b40256182be17740',
      intro: 'e2ea1f590d2b948a',
      hurt: '13cdd5c07df7224c',
      defeat: '97cb01859327b737',
      windup: 'a92e1d4d6a87eed9',
      recover: 'dbfa216e211e0736'
    }
    for (const [name, want] of Object.entries(PINNED)) {
      const h = createHash('sha1')
      for (const f of s[name].frames) h.update(Buffer.from(Uint16Array.from(f.data).buffer))
      expect(h.digest('hex').slice(0, 16), name).toBe(want)
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
})
