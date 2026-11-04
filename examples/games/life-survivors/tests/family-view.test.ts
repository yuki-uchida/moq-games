import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { SHEETS, sheet } from '../src/art/index'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'
import { FAMILY_LAG, FAMILY_SCALE, FAMILY_SLOTS, followFamily, type Follower } from '../src/render'

const key = (frame: Raster) => createHash('sha1').update(frame.data).digest('hex')
const married = { fx: 1, married: true, hasChild: true, downed: false, hp: 50, maxHp: 100 }
const STEP = 1 / 60
/** Runs the family for `seconds` with the player standing at `pos`. */
const settle = (crew: Follower[], player: typeof married, pos: { x: number; y: number }, seconds: number) => {
  for (let t = 0; t < seconds; t += STEP) followFamily(crew, player, 'playing', pos, STEP)
  return crew
}

describe('family on screen', () => {
  test('the spouse is her own figure — long hair and a dress — never a copy of the player', () => {
    const spouse = sheet('family:spouse')
    expect(Object.keys(spouse).sort()).toEqual(['idle', 'walk'])
    expect(spouse.idle.frames).toHaveLength(4)
    expect(spouse.walk.frames).toHaveLength(6)
    const playerFrames = new Set(
      Object.keys(SHEETS)
        .filter((id) => id.startsWith('player:'))
        .flatMap((id) => Object.values(sheet(id)).flatMap((anim) => anim.frames.map(key)))
    )
    const hair = new Set([R.hair[1], R.hair[2], R.hair[3]])
    for (const frame of [...spouse.idle.frames, ...spouse.walk.frames]) {
      expect([frame.w, frame.h]).toEqual([64, 64])
      expect(playerFrames.has(key(frame))).toBe(false)
      let feet = -1
      let dress = 0
      let longHair = 0
      frame.map((c, x, y) => {
        feet = Math.max(feet, y)
        if (c === R.orange[1]) dress++
        // Hair falling below the jaw on the back of the head.
        if (hair.has(c) && y >= 25 && x < 32) longHair++
        return c
      })
      expect(feet).toBe(58)
      expect(dress).toBeGreaterThan(100)
      expect(longHair).toBeGreaterThan(5)
    }
  })

  test('spouse and child stand behind the player, smaller, on the side away from where the player faces', () => {
    expect(FAMILY_SCALE).toBeLessThan(1)
    const pos = { x: 100, y: 100 }
    const crew = settle([], married, pos, 2)
    expect(crew.map((member) => member.sheet)).toEqual(['family:spouse', 'player:kid'])
    const [spouse, kid] = crew
    expect(spouse.x).toBeLessThan(pos.x)
    expect(kid.x).toBeLessThan(spouse.x)
    expect(spouse.y).toBeLessThan(pos.y)
    expect(kid.y).toBeLessThan(pos.y)
    expect(crew.every((member) => member.speed < 25 && !member.flip)).toBe(true)
    // Turning around, they walk round to the other side.
    settle(crew, { ...married, fx: -1 }, pos, 2)
    expect(spouse.x).toBeGreaterThan(pos.x)
    expect(kid.x).toBeGreaterThan(spouse.x)
    expect(crew.every((member) => member.flip)).toBe(true)
  })

  test('running, they trail behind and never fall more than FAMILY_LAG off their slot', () => {
    const pos = { x: 0, y: 0 }
    const crew = settle([], married, pos, 0.5)
    let worst = 0
    for (let i = 0; i < 180; i++) {
      pos.x += 300 * STEP
      followFamily(crew, married, 'playing', pos, STEP)
      crew.forEach((member, j) => {
        const slot = FAMILY_SLOTS[j]
        worst = Math.max(worst, Math.hypot(member.x - (pos.x - slot.dx), member.y - (pos.y + slot.dy)))
      })
    }
    expect(worst).toBeGreaterThan(10)
    expect(worst).toBeLessThanOrEqual(FAMILY_LAG + 1e-9)
    expect(crew.every((member) => member.x < pos.x && member.speed > 25 && !member.flip)).toBe(true)
  })

  test('the child only once welcomed; nobody while single, down or as the life ends', () => {
    const pos = { x: 0, y: 0 }
    expect(followFamily([], { ...married, married: false, hasChild: false }, 'playing', pos, STEP)).toEqual([])
    expect(followFamily([], { ...married, hasChild: false }, 'playing', pos, STEP).map((m) => m.sheet)).toEqual([
      'family:spouse'
    ])
    expect(followFamily(settle([], married, pos, 1), { ...married, downed: true }, 'playing', pos, STEP)).toEqual([])
    for (const phase of ['reaper', 'won', 'lost'] as const)
      expect(followFamily(settle([], married, pos, 1), married, phase, pos, STEP)).toEqual([])
    // Back on their feet, the family reappears right behind them.
    const crew = followFamily([], married, 'playing', pos, STEP)
    expect(crew.map((member) => [member.x, member.y])).toEqual(
      FAMILY_SLOTS.map((slot) => [pos.x - slot.dx, pos.y + slot.dy])
    )
  })

  test('their healing shows only while the player is hurt', () => {
    const pos = { x: 0, y: 0 }
    expect(settle([], married, pos, 0.1).every((member) => member.heal)).toBe(true)
    expect(settle([], { ...married, hp: 100 }, pos, 0.1).some((member) => member.heal)).toBe(false)
  })
})
