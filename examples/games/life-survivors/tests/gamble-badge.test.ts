import { describe, expect, test } from 'vitest'
import { EVENTS, TALENT_CATEGORIES, WEAPON_INDEX, timeAtAge } from '../src/data'
import { Game, weaponStats } from '../src/game'
import { BADGE_SIDE_MARGIN, badgeBoxAt, badgeSideTarget, easeBadgeSide } from '../src/render'
import { STRIDE, toView } from '../src/view'

const STEP = 1 / 60

/** Runs the side choice over a sequence of parent layouts; returns the targets frame by frame. */
function targets(frames: { x: number; y: number }[][], size = 1) {
  let target = 1
  return frames.map((parents) => (target = badgeSideTarget(target, parents, size)))
}

const flips = (sides: number[]) => sides.slice(1).filter((side, k) => side !== sides[k]).length

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
    // Some headings (walking up and to the right) do send it over the left shoulder.
    expect([...settled].sort()).toEqual([-1, 1])
  }
})
