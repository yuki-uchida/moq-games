import { describe, expect, it } from 'vitest'
import { anchorOf, draftSheet, frameAt } from '../src/art'
import { HERO_SPEC } from '../src/art/contract'
import type { Raster } from '../src/art/raster'
import {
  GROUND_SPACING,
  HOP_AIR,
  HOP_CLIPS,
  HOP_HEIGHT,
  HOP_LAND,
  HOP_LOOP,
  HOP_SOLE_FADE,
  HOP_STAND,
  HOP_TOP,
  groundShift,
  hopDrawLift,
  hopPose,
  soleGap,
  type HopPose
} from '../src/ui/help-moves'
import { HELP_MOVES, helpArt, helpMoveClips } from '../src/ui/screen-art'

describe('the help screen: the walk over its ground marks', () => {
  const { stride, frames } = HERO_SPEC.run
  const step = stride! / frames

  it('goes by the clip: its pass covers a whole number of mark spacings, with no holds to throw it off', () => {
    expect(stride! % GROUND_SPACING).toBe(0)
    expect(HERO_SPEC.run.hold).toBeUndefined()
    expect(step).toBe(8)
  })

  it('puts the marks stride ÷ frames further back on each frame, round the loop too', () => {
    for (let frame = 0; frame < frames * 3; frame++) {
      const now = groundShift(frame % frames, frames, stride!)
      const next = groundShift((frame + 1) % frames, frames, stride!)
      expect((next - now + GROUND_SPACING) % GROUND_SPACING, `frame ${frame}`).toBe(step)
    }
  })

  it('keeps a foot that is down over the same mark', () => {
    // A planted foot goes back `step` px a frame against the sprite (tests/art-footfall.test.ts); the marks go back
    // by the same, so the distance from the foot to the mark behind it never changes while it is down.
    const footAt = (frame: number) => 30 - step * frame
    const markAt = (frame: number, k: number) => k * GROUND_SPACING - groundShift(frame, frames, stride!)
    for (const k of [1, 2]) {
      const gap = footAt(0) - markAt(0, k)
      for (let frame = 1; frame < frames; frame++)
        expect(((footAt(frame) - markAt(frame, k) - gap) % GROUND_SPACING) + 0, `frame ${frame}`).toBe(0)
    }
  })

  it('stands the marks still on a still frame: the same frame gives the same marks', () => {
    expect(groundShift(3, frames, stride!)).toBe(groundShift(3, frames, stride!))
    expect(groundShift(0, frames, stride!)).toBe(0)
  })
})

describe('the help screen: the hop', () => {
  const pose = (time: number): HopPose => ({ ...hopPose(time) })
  const DT = 1 / 120

  it('starts and ends on the line, stands, leaps, lands and stands again', () => {
    expect(pose(0)).toMatchObject({ clip: 'idle', lift: 0 })
    expect(pose(HOP_LOOP - 1e-6).lift).toBe(0)
    expect(pose(HOP_LOOP)).toMatchObject({ clip: 'idle', lift: 0 })
    expect(pose(HOP_STAND - 1e-6)).toMatchObject({ clip: 'idle', lift: 0 })
    expect(pose(HOP_STAND + HOP_AIR / 2).clip).toBe('apex')
    expect(pose(HOP_STAND + HOP_AIR / 2).lift).toBeCloseTo(HOP_HEIGHT, 9)
    expect(pose(HOP_STAND + HOP_AIR + 1e-6)).toMatchObject({ clip: 'land', lift: 0 })
    expect(pose(HOP_STAND + HOP_AIR + HOP_LAND + 1e-6)).toMatchObject({ clip: 'idle', lift: 0 })
    expect(HOP_TOP).toBe(HOP_STAND + HOP_AIR / 2)
    // The hop repeats.
    expect(pose(HOP_LOOP * 3 + 0.5).clip).toBe(pose(0.5).clip)
    expect(pose(HOP_LOOP * 3 + 0.5).lift).toBeCloseTo(pose(0.5).lift, 9)
  })

  it('goes through the clips in order, each only while his motion matches it', () => {
    const order: string[] = []
    let max = 0
    let before = pose(0)
    for (let time = DT; time < HOP_LOOP * 2; time += DT) {
      const now = pose(time)
      if (order[order.length - 1] !== now.clip) order.push(now.clip)
      max = Math.max(max, now.lift)
      expect(now.lift).toBeGreaterThanOrEqual(0)
      expect(now.lift).toBeLessThanOrEqual(HOP_HEIGHT + 1e-9)
      if (now.clip === 'jump') expect(now.lift, `rising at ${time}`).toBeGreaterThan(before.lift)
      if (now.clip === 'fall') expect(now.lift, `falling at ${time}`).toBeLessThan(before.lift)
      if (now.clip === 'idle' || now.clip === 'land') expect(now.lift).toBe(0)
      before = now
    }
    expect(order).toEqual(['idle', 'jump', 'apex', 'fall', 'land', 'idle', 'jump', 'apex', 'fall', 'land', 'idle'])
    expect(max).toBeGreaterThan(HOP_HEIGHT - 0.01)
  })

  it('times each clip from where it starts, so it plays from its first frame', () => {
    expect(pose(HOP_STAND + 0.1).t).toBeCloseTo(0.1, 9)
    expect(pose(HOP_STAND + HOP_AIR + 0.05)).toMatchObject({ clip: 'land' })
    expect(pose(HOP_STAND + HOP_AIR + 0.05).t).toBeCloseTo(0.05, 9)
    for (let time = 0; time < HOP_LOOP; time += DT) {
      const now = pose(time)
      expect(now.t).toBeGreaterThanOrEqual(0)
      if (now.clip === 'land') expect(now.t).toBeLessThan(HOP_LAND + 1e-9)
    }
  })

  it('reuses the object it is given, so a frame makes no garbage', () => {
    const out: HopPose = { clip: 'idle', t: 0, lift: 0 }
    expect(hopPose(0.8, HOP_HEIGHT, out)).toBe(out)
  })

  it('fits the room above the sprite: the highest frame of each pose stays inside the canvas', () => {
    const sheet = draftSheet('hero')
    for (let time = 0; time < HOP_LOOP; time += DT) {
      const now = hopPose(time, HOP_HEIGHT, { clip: 'idle', t: 0, lift: 0 })
      const anim = sheet[now.clip]
      const frame = anim.frames[frameAt(anim, now.t)]
      const [, ay] = anchorOf(anim)
      const drawn = hopDrawLift(now.lift, soleGap(frame, ay))
      // The canvas has HOP_HEIGHT rows of headroom above the frame, which is drawn `drawn` px up.
      expect(HOP_HEIGHT - drawn + frame.bounds()!.y, `${now.clip} at ${time.toFixed(3)}`).toBeGreaterThanOrEqual(0)
      expect(ay).toBe(60)
    }
  })

  /** The soles and the centre of the opaque pixels of the frame shown at `time`, in rows above the anchor row. */
  const sheet = draftSheet('hero')
  const centres = new WeakMap<Raster, number>()
  const measure = (time: number) => {
    const now = hopPose(time, HOP_HEIGHT, { clip: 'idle', t: 0, lift: 0 })
    const anim = sheet[now.clip]
    const frame = anim.frames[frameAt(anim, now.t)]
    const [, ay] = anchorOf(anim)
    const b = frame.bounds()!
    if (!centres.has(frame)) {
      let sum = 0
      let count = 0
      for (let y = b.y; y < b.y + b.h; y++)
        for (let x = b.x; x < b.x + b.w; x++)
          if (frame.get(x, y)) {
            sum += y
            count += 1
          }
      centres.set(frame, sum / count)
    }
    const drawn = hopDrawLift(now.lift, soleGap(frame, ay))
    return {
      clip: now.clip,
      lift: now.lift,
      soles: ay - (b.y + b.h - 1) + drawn,
      centre: ay - centres.get(frame)! + drawn
    }
  }

  it('keeps his soles on the line near the ground and steps them by little between two samples there', () => {
    // The parabola's steepest step in one 1/60 s sample is 4 × height ÷ air time ÷ 60 (1.07 px). Near the ground the
    // sole correction adds up to 4 ÷ HOP_SOLE_FADE of that again (`fall`'s gap is 4), and where `jump` changes frames
    // its own soles move 1 px, of which up to all shows at the top of the fade: 1.07 × 1.67 + 1 = 2.8 at the very most,
    // 2.02 as measured.
    const bound = 2.1
    let before = measure(0)
    let worst = 0
    for (let time = 1 / 60; time < HOP_LOOP * 2; time += 1 / 60) {
      const now = measure(time)
      // Higher up the body rides the curve and the clips' own feet differ (`apex` tucks them 7 px up): not the soles' job.
      if (Math.max(now.lift, before.lift) <= HOP_SOLE_FADE) {
        worst = Math.max(worst, Math.abs(now.soles - before.soles))
        expect(Math.abs(now.soles - before.soles), `${now.clip} at ${time.toFixed(3)}`).toBeLessThanOrEqual(bound)
      }
      if (now.clip === 'idle' || now.clip === 'land') expect(now.soles).toBe(0)
      before = now
    }
    expect(worst).toBeLessThanOrEqual(2.1)
    // Above the fade the body is drawn exactly on the curve.
    expect(hopDrawLift(HOP_SOLE_FADE, 7)).toBe(HOP_SOLE_FADE)
    expect(hopDrawLift(0, 4)).toBe(-4)
  })

  it('moves the body with the parabola: no dip while he rises, no bump while he falls', () => {
    // The centre of the opaque pixels may change by a clip's own pose (it is drawn differently from clip to clip),
    // never by more than this against the direction he is going. Measured: 1.09 px (the clips' own largest change in
    // the air is 1.9 px, `jump` to `apex`); drawing every frame down by its whole sole gap made it 6.09.
    const BOUND = 2
    let before = measure(0)
    for (let time = 1 / 60; time < HOP_LOOP * 2; time += 1 / 60) {
      const now = measure(time)
      const rising = now.lift - before.lift
      const against = rising > 1e-9 ? before.centre - now.centre : rising < -1e-9 ? now.centre - before.centre : 0
      expect(against, `${now.clip} at ${time.toFixed(3)}`).toBeLessThanOrEqual(BOUND)
      before = now
    }
  })
})

describe('the help screen: its art list', () => {
  it('fetches every clip the moves draw', () => {
    const art = helpArt()
    const has = (clip: string) => art.clips.some((c) => c.sheet === 'hero' && c.clip === clip)
    for (const clip of [...HELP_MOVES, ...HOP_CLIPS]) expect(has(clip), clip).toBe(true)
    expect(helpMoveClips().sort()).toEqual([...new Set([...HELP_MOVES, ...HOP_CLIPS])].sort())
  })
})
