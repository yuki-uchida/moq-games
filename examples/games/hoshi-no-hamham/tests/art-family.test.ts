import { describe, expect, test } from 'vitest'
import { missingAnims, sheet } from '../src/art/index'
import { princessHeadBall, princessPose } from '../src/art/chars/princess'
import { momHeadBall, momPose } from '../src/art/chars/mom'
import { C, R } from '../src/art/palette'

const count = (f: ReturnType<typeof sheet>['idle']['frames'][number], ramp: readonly number[]) => {
  let n = 0
  for (const c of f.data) if (ramp.includes(c)) n++
  return n
}

describe('princess and mom are drawn and belong to one family', () => {
  test('every clip is drawn', () => {
    expect(missingAnims('princess')).toEqual([])
    expect(missingAnims('mom')).toEqual([])
  })

  test('the princess is mostly white, the mother mostly orange', () => {
    const p = sheet('princess').idle.frames[0]
    const m = sheet('mom').idle.frames[0]
    const white = count(p, R.princessWhite)
    expect(white).toBeGreaterThan(count(p, R.princessPink))
    expect(white).toBeGreaterThan(p.count() * 0.4)
    const orange = count(m, R.momOrange)
    expect(orange).toBeGreaterThan(count(m, R.paper))
    expect(orange).toBeGreaterThan(count(m, R.momCream))
    expect(orange).toBeGreaterThan(m.count() * 0.4)
  })

  test('the mother is much bigger than the princess', () => {
    const p = sheet('princess').idle.frames[0].count()
    const m = sheet('mom').idle.frames[0].count()
    expect(m).toBeGreaterThanOrEqual(p * 1.3)
  })

  test('the ladle moves in the run', () => {
    const tops = sheet('mom').move.frames.map((f) => {
      const b = f.bounds()!
      for (let x = 0; x < f.w; x++) if (f.get(x, b.y)) return [x, b.y]
      return [-1, -1]
    })
    expect(new Set(tops.map((t) => t.join(','))).size).toBeGreaterThan(3)
  })

  // No snout: at muzzle height the silhouette may stick out of the head ball by 3 px at most (whiskers and the
  // soft cheek bulge). The ball is the one the draw function paints (its centre and radius come from the pose),
  // and the rightmost painted pixel is read from the frame's mask on the rows from the nose to the mouth (rows [from, to] relative to the ball centre; below that the arms would count).
  const reach = (
    f: ReturnType<typeof sheet>['idle']['frames'][number],
    ball: { cx: number; cy: number; rx: number },
    rows: readonly [number, number]
  ) => {
    let right = -1
    for (let y = Math.round(ball.cy) + rows[0]; y <= Math.round(ball.cy) + rows[1]; y++)
      for (let x = 0; x < f.w; x++) if (f.get(x, y)) right = Math.max(right, x)
    return right + 1 - (ball.cx + ball.rx)
  }

  test('princess has no snout sticking out of her head', () => {
    const f = sheet('princess').idle.frames[0]
    // idle frame 0 squashes by 0.35 and does not bob
    expect(reach(f, princessHeadBall(princessPose({ squash: 0.35 })), [2, 6])).toBeLessThanOrEqual(3)
  })

  test('mom has no snout sticking out of her head', () => {
    const f = sheet('mom').idle.frames[0]
    expect(reach(f, momHeadBall(momPose({ squash: 0 })), [-3, 3])).toBeLessThanOrEqual(3)
  })

  test('mom bobs at least 2 px between the contact and the passing frames of her run', () => {
    // the eyes are the only pure-black pixels, so the top row of them follows the body and ignores the ladle
    const eyeTop = (f: ReturnType<typeof sheet>['idle']['frames'][number]) => {
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.get(x, y) === C.black) return y
      return -1
    }
    const fr = sheet('mom').move.frames.map(eyeTop)
    expect(fr[0] - fr[2]).toBeGreaterThanOrEqual(2)
    expect(fr[4] - fr[6]).toBeGreaterThanOrEqual(2)
  })
})
