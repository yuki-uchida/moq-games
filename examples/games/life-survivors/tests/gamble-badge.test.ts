import { describe, expect, test } from 'vitest'
import { EVENTS, TALENT_CATEGORIES, WEAPON_INDEX, timeAtAge } from '../src/data'
import { Game, weaponStats } from '../src/game'
import {
  BADGE_SIDE_MARGIN,
  BADGE_SWITCH_HOLD,
  badgeBoxAt,
  badgeSideTarget,
  easeBadgeSide,
  gambleOwner,
  GAMBLE_OWNER_REACH,
  holdBadgeSide,
  type BadgePending
} from '../src/render'
import { STRIDE, toView } from '../src/view'

const STEP = 1 / 60

/** Runs the side choice over a sequence of parent layouts; returns the targets frame by frame. */
function targets(frames: { x: number; y: number }[][], size = 1) {
  let target = 1
  return frames.map((parents) => (target = badgeSideTarget(target, parents, size)))
}

/** The same, through the renderer's wait before it heads over: the sides it heads for frame by frame. */
function heldTargets(frames: { x: number; y: number }[][], size = 1) {
  let target = 1
  let pending: BadgePending | undefined
  return frames.map((parents, k) => {
    const desired = badgeSideTarget(pending?.side ?? target, parents, size)
    const ready = badgeSideTarget(target, parents, size) !== target
    const held = holdBadgeSide(target, desired, pending, (k + 1) * STEP, ready)
    pending = held.pending
    return (target = held.target)
  })
}

/** Moves to a side that are undone again within `frames` frames. */
function undone(sides: number[], frames = 40) {
  let count = 0
  for (let k = 1; k < sides.length; k++) {
    if (sides[k] === sides[k - 1]) continue
    const back = sides.indexOf(sides[k - 1], k)
    if (back >= 0 && back - k <= frames) count++
  }
  return count
}

const flips = (sides: number[]) => sides.slice(1).filter((side, k) => side !== sides[k]).length

describe('the wait before the gamble badge heads over', () => {
  test('a passing overlap shorter than the hold never moves it; a lasting one moves it once', () => {
    let pending: BadgePending | undefined
    let target = 1
    let switches = 0
    const run = (desired: number, seconds: number, from: number) => {
      for (let t = 0; t < seconds; t += STEP) {
        const held = holdBadgeSide(target, desired, pending, from + t)
        if (held.target !== target) switches++
        target = held.target
        pending = held.pending
      }
      return from + seconds
    }
    let now = run(-1, BADGE_SWITCH_HOLD - 0.05, 0)
    expect(target).toBe(1)
    // Wanting its own side again restarts the wait.
    now = run(1, STEP, now)
    expect(pending).toBeUndefined()
    now = run(-1, BADGE_SWITCH_HOLD - 0.05, now)
    expect(target).toBe(1)
    expect(switches).toBe(0)
    now = run(-1, 1, now)
    expect(target).toBe(-1)
    expect(switches).toBe(1)
    // Clear of every parent the way back to the right waits just as long.
    run(1, BADGE_SWITCH_HOLD - 0.05, now)
    expect(target).toBe(-1)
  })

  test('the hold counts renderer time, not frames', () => {
    const first = holdBadgeSide(1, -1, undefined, 10)
    expect(first).toEqual({ target: 1, pending: { side: -1, wanted: 0, at: 10 } })
    expect(holdBadgeSide(1, -1, first.pending, 10 + BADGE_SWITCH_HOLD - 0.001).target).toBe(1)
    expect(holdBadgeSide(1, -1, first.pending, 10 + BADGE_SWITCH_HOLD)).toEqual({ target: -1 })
    // A parent in between (not clearly better yet) pauses the wait without restarting it.
    const paused = holdBadgeSide(1, -1, first.pending, 10.3, false)
    expect(paused.pending).toEqual({ side: -1, wanted: 0, at: 10.3 })
    const counted = holdBadgeSide(1, -1, paused.pending, 10.6)
    expect(counted.pending?.wanted).toBeCloseTo(0.3)
    expect(holdBadgeSide(1, -1, counted.pending, 10.75).target).toBe(-1)
  })
})

describe('the gamble badge side', () => {
  test('keeps to the right with no parent near it, and moves over for one at the upper right', () => {
    expect(badgeSideTarget(1, [], 1)).toBe(1)
    expect(badgeSideTarget(-1, [], 1)).toBe(1)
    expect(badgeSideTarget(1, [{ x: -26, y: -40 }], 1)).toBe(1)
    expect(badgeSideTarget(1, [{ x: 26, y: -40 }], 1)).toBe(-1)
    // Below the badge (a parent standing behind the child) covers neither side.
    expect(badgeSideTarget(1, [{ x: 26, y: -5 }], 1)).toBe(1)
  })

  test("a gamble's copied parent at the upper right sends it left too", () => {
    // Her own lone parent tucked behind her and the copy at the upper right, as one walking up places them.
    expect(
      badgeSideTarget(
        1,
        [
          { x: 0, y: -5 },
          { x: 30, y: -40 }
        ],
        1
      )
    ).toBe(-1)
  })

  test('takes the side that hides less, and only by more than the margin', () => {
    const right = badgeBoxAt(1, 1)
    // A parent covering a sliver of the right badge (less than the margin) leaves it there.
    const sliver = { x: right.left - 12 + 2, y: right.top + 12 }
    expect(badgeSideTarget(1, [sliver], 1)).toBe(1)
    // Parents over both badges: the side covered less wins, and an even split keeps the current side.
    expect(
      badgeSideTarget(
        1,
        [
          { x: 26, y: -34 },
          { x: -26, y: -40 }
        ],
        1
      )
    ).toBe(-1)
    expect(
      badgeSideTarget(
        -1,
        [
          { x: 26, y: -34 },
          { x: -26, y: -34 }
        ],
        1
      )
    ).toBe(-1)
    expect(
      badgeSideTarget(
        1,
        [
          { x: 26, y: -34 },
          { x: -26, y: -34 }
        ],
        1
      )
    ).toBe(1)
    expect(BADGE_SIDE_MARGIN).toBeGreaterThan(48)
  })

  test('never flips back and forth for a parent jittering a rounded pixel anywhere around the head', () => {
    let worst = 0
    for (let x = -60; x <= 70; x++)
      for (let y = -80; y <= 20; y++) {
        let seed = (x * 7919 + y * 104729) >>> 0
        const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2
        const frames = Array.from({ length: 90 }, () => [{ x: x + Math.floor(random()), y: y + Math.floor(random()) }])
        worst = Math.max(worst, flips(targets(frames)))
      }
    // At most the one move over to the less covered side.
    expect(worst).toBeLessThanOrEqual(1)
  })

  test('glides over in several frames even without network smoothing', () => {
    let side = 1
    let frames = 0
    while (side > -0.9) {
      side = easeBadgeSide(side, -1, STEP)
      frames++
    }
    expect(frames).toBeGreaterThanOrEqual(4)
    // The first frame moves it only part of the way.
    expect(easeBadgeSide(1, -1, STEP)).toBeGreaterThan(0.5)
    // A long frame (a test, or a stalled tab) lands it.
    expect(easeBadgeSide(1, -1, 1)).toBeCloseTo(-1, 4)
  })
})

/** A child with her lone 過保護親 (Lv1) and, optionally, the gamble's copy of her. */
function guarded(copy: boolean, age?: number) {
  const game = new Game(29)
  game.targetPopulation = () => 0
  game.state.eventIndex = EVENTS.length
  const player = game.addPlayer('a', 'p_gone')!
  player.birthPick = false
  player.pending = 0
  player.choices = []
  for (const category of TALENT_CATEGORIES) player.talents[category] = 1
  if (age !== undefined) game.state.time = timeAtAge(age)
  player.weapons = [{ id: 'p_over', lv: 1, cd: 0, held: 0, damage: 0 }]
  if (copy) {
    const gamble = { id: 'w_gamble', lv: 1, cd: Infinity, held: 0, damage: 0 }
    player.weapons.push(gamble)
    const random = game['rng']
    Object.defineProperty(game, 'rng', { value: () => 0.5, configurable: true })
    game['fire'](player, gamble, weaponStats(player, gamble))
    Object.defineProperty(game, 'rng', { value: random, configurable: true })
  }
  game['fireWeapons'](0)
  for (const shot of game.state.shots) shot.life = shot.maxLife = Infinity
  expect(game.state.shots.filter((shot) => shot.weapon === 'p_over')).toHaveLength(copy ? 2 : 1)
  return { game, player }
}

/** Her parents relative to her, as the view (rounded to whole pixels) hands them to the renderer. */
function parentsInView(game: Game) {
  const view = toView(game.state)
  const guard = WEAPON_INDEX.get('p_over')!
  const me = view.players[0]
  const parents: { x: number; y: number }[] = []
  for (let i = 0; i < view.shots.length; i += STRIDE.shots)
    if (view.shots[i] === guard && view.shots[i + 6] === 0)
      parents.push({ x: view.shots[i + 1] - me.x, y: view.shots[i + 2] - me.y })
  return parents
}

test('walking at any fixed heading, the badge settles and stays on one side', () => {
  for (const [copy, age] of [
    [false, 16],
    [true, 16],
    [false, undefined],
    [true, undefined]
  ] as const) {
    const settled = new Set<number>()
    for (let degrees = -180; degrees < 180; degrees += 2) {
      const { game, player } = guarded(copy, age)
      const angle = (degrees * Math.PI) / 180
      const layouts: { x: number; y: number }[][] = []
      for (let frame = 0; frame < 150; frame++) {
        game.setInput(player.id, { x: Math.cos(angle), y: Math.sin(angle) })
        game.tick(STEP)
        layouts.push(parentsInView(game))
      }
      const sides = targets(layouts)
      expect(flips(sides.slice(60)), `${copy ? 'with' : 'without'} the copy, age ${age}, ${degrees}°`).toBe(0)
      settled.add(sides[sides.length - 1])
    }
    // Walking, her parents keep outside the badge on either side of the head (see the 過保護親 overhead tests in
    // companion-overhead.test.ts), so it always settles over the right shoulder.
    expect([...settled].sort()).toEqual([1])
  }
}, 30_000)

test('setting off, stopping and turning never sends the badge over and straight back', () => {
  for (const overLv of [1, 2, 4, 8])
    for (const copy of [false, true]) {
      const { game, player } = guarded(copy, 16)
      player.weapons[0].lv = overLv
      game['fireWeapons'](0)
      for (const shot of game.state.shots) shot.life = shot.maxLife = Infinity
      const directions = [-45, -90, -135, 0, 180, 45, 90, -60, -120, -30]
      const plan: [{ x: number; y: number }, number][] = []
      for (const degrees of directions) {
        const angle = (degrees * Math.PI) / 180
        const stick = { x: Math.cos(angle), y: Math.sin(angle) }
        // Setting off and stopping, a step from standing (with its settling, shorter than the hold), then walking on
        // into a turn to the next heading.
        plan.push([stick, 90], [{ x: 0, y: 0 }, 60], [stick, 8], [{ x: 0, y: 0 }, 60], [stick, 90])
      }
      const layouts: { x: number; y: number }[][] = []
      for (const [stick, frames] of plan)
        for (let frame = 0; frame < frames; frame++) {
          game.setInput(player.id, stick)
          game.tick(STEP)
          layouts.push(parentsInView(game))
        }
      expect(undone(heldTargets(layouts)), `過保護 Lv${overLv}${copy ? ' with the copy' : ''}`).toBe(0)
    }
})

test('walking steadily, the badge settles on the side that hides less of her parents', () => {
  for (const copy of [false, true])
    for (let degrees = -180; degrees < 180; degrees += 10) {
      const { game, player } = guarded(copy, 16)
      const angle = (degrees * Math.PI) / 180
      const layouts: { x: number; y: number }[][] = []
      for (let frame = 0; frame < 150; frame++) {
        game.setInput(player.id, { x: Math.cos(angle), y: Math.sin(angle) })
        game.tick(STEP)
        layouts.push(parentsInView(game))
      }
      const sides = heldTargets(layouts)
      const side = sides[sides.length - 1]
      expect(flips(sides.slice(90)), `${degrees}°`).toBe(0)
      // Where it rests it covers no more than the other side would, past the margin.
      const covered = (s: number) =>
        layouts[layouts.length - 1].reduce((sum, { x, y }) => {
          const box = badgeBoxAt(s, 1)
          const w = Math.max(0, Math.min(box.right, x + 12) - Math.max(box.left, x - 12))
          const h = Math.max(0, Math.min(box.bottom, y + 12) - Math.max(box.top, y - 12))
          return sum + w * h
        }, 0)
      expect(covered(side), `${copy ? 'with' : 'without'} the copy, ${degrees}°`).toBeLessThanOrEqual(
        covered(-side) + BADGE_SIDE_MARGIN
      )
    }
})

describe('gambleOwner', () => {
  const a = { id: 'a', x: 0, y: 0, gambleWeapon: 'w_love' }
  const b = { id: 'b', x: 6, y: 0, gambleWeapon: 'w_sports' }
  test('ties a gamble event to the player standing on it', () => {
    expect(gambleOwner([a, { ...b, x: 300 }], 0, 0, 'w_love')).toBe('a')
    expect(gambleOwner([{ ...a, x: 300 }, b], 6, 0, 'w_sports')).toBe('b')
  })

  test('tells two players standing together apart by the weapon each drew', () => {
    expect(gambleOwner([a, b], 3, 0, 'w_love')).toBe('a')
    expect(gambleOwner([a, b], 3, 0, 'w_sports')).toBe('b')
    expect(gambleOwner([b, a], 4, 0, 'w_love')).toBe('a')
    // Both drew the same weapon: the nearer one.
    expect(gambleOwner([a, { ...b, gambleWeapon: 'w_love' }], 5, 0, 'w_love')).toBe('b')
  })

  test('falls back to the nearest player, and to nobody far away', () => {
    expect(gambleOwner([a, b], 5, 0, 'w_work')).toBe('b')
    expect(gambleOwner([a, b], 0, GAMBLE_OWNER_REACH + 10, 'w_love')).toBeUndefined()
  })
})
