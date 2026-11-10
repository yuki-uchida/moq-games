import { describe, expect, test } from 'vitest'
import { EVENTS, timeAtAge } from '../src/data'
import { FAMILY_SLOTS } from '../src/family-slots'
import { Game, PET_HALF, PET_SPOTS, type Player, type Shot } from '../src/game'
import { GUARDIAN_BODY, OVERHEAD, boxAbout, boxesOverlap, overheadBoxes, type OverheadBox } from '../src/overhead'

const DT = 1 / 60
const radians = (degrees: number) => (degrees * Math.PI) / 180
const stick = (degrees: number) => ({ x: Math.cos(radians(degrees)), y: Math.sin(radians(degrees)) })
const STILL = { x: 0, y: 0 }

/** A child's body as drawn (food-layout.ts playerBox): 14 px either side, from 58 px above her feet to 6 px below. */
const childBox = (): OverheadBox => ({
  left: -14,
  top: OVERHEAD.feet - 58,
  right: 14,
  bottom: OVERHEAD.feet + 6
})
/** A spouse or child (FAMILY_SCALE 0.75 of a player's figure) standing on a family slot. */
const familyBox = (x: number, y: number): OverheadBox => ({ left: x - 11, top: y - 28, right: x + 11, bottom: y + 21 })

/** A child of 30 holding `weapons`, with no enemies and no events. */
function setup(weapons: Player['weapons'], game = new Game(5)) {
  game.targetPopulation = () => 0
  const player = game.addPlayer(`p${game.state.players.length}`, 'p_over')!
  player.birthPick = false
  player.pending = 0
  player.choices = []
  player.weapons = weapons
  game.state.time = timeAtAge(30) + 0.01
  game.state.eventIndex = EVENTS.length
  game.state.enemies = []
  return { game, player }
}

/** 過保護親 Lv`level` and, with `gamble` (its level), the gamble's copies of her out for good. */
function guarded(level: number, gamble?: number) {
  const { game, player } = setup([
    { id: 'p_over', lv: level, cd: 0, held: 0, damage: 0 },
    ...(gamble
      ? [{ id: 'w_gamble', lv: gamble, cd: 0, held: 0, damage: 0, gambleWeapon: 'p_over', gambleUntil: 1e9 }]
      : [])
  ])
  game.tick(DT)
  const gambling = player.weapons.find((weapon) => weapon.id === 'w_gamble')
  if (gambling) gambling.cd = Infinity
  for (const shot of game.state.shots) shot.life = shot.maxLife = Infinity
  const guards = parents(game, player)
  expect(guards.filter((guard) => guard.sourceWeapon !== 'p_over').length > 0).toBe(Boolean(gamble))
  return { game, player, guards }
}

const parents = (game: Game, player: Player) =>
  game.state.shots.filter((shot) => shot.owner === player.id && shot.weapon === 'p_over' && shot.delay <= 0)

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8]
const COPIES = [undefined, 1, 8]

describe('walking up, 過保護親 keeps off the name tag, buff rows and gamble badge', () => {
  for (const level of LEVELS)
    for (const gamble of COPIES)
      test(`Lv${level}${gamble ? ` with the gamble Lv${gamble}'s copies` : ''}`, () => {
        const { game, player, guards } = guarded(level, gamble)
        const label = (heading: number, frame: number, guard: Shot) =>
          `heading ${heading}°, frame ${frame}, h ${guard.h} ${guard.sourceWeapon}: ` +
          `(${(guard.x - player.x).toFixed(1)}, ${(guard.y - player.y).toFixed(1)})`
        // The name tag, two buff rows over it (no row and one are inside this) and the badge on either side.
        const boxes = overheadBoxes(1, 2)
        game.setInput(player.id, stick(-45))
        for (let frame = 0; frame < 90; frame++) game.tick(DT)
        // Every heading from 45° to 135° above the horizon in 15° steps, there and back, then straight across.
        const plan = [-45, -60, -75, -90, -105, -120, -135, -120, -105, -90, -75, -60, -45, -135, -45, -90]
        let checked = 0
        for (const heading of plan) {
          game.setInput(player.id, stick(heading))
          for (let frame = 0; frame < 45; frame++) {
            game.tick(DT)
            for (const guard of guards) {
              const body = boxAbout(guard.x - player.x, guard.y - player.y, GUARDIAN_BODY)
              for (const box of boxes) expect(boxesOverlap(body, box), label(heading, frame, guard)).toBe(false)
              checked++
            }
            // The gamble's copies keep clear of the child's own and of each other.
            for (const copy of guards)
              if (copy.sourceWeapon !== 'p_over')
                for (const other of guards)
                  if (other !== copy && frame >= 15)
                    expect(
                      Math.hypot(copy.x - other.x, copy.y - other.y),
                      label(heading, frame, copy)
                    ).toBeGreaterThanOrEqual(20)
          }
        }
        expect(checked).toBeGreaterThan(0)
      })
})

describe('standing still, 過保護親 stands beside the child in view', () => {
  for (const level of LEVELS)
    for (const gamble of COPIES)
      for (const family of ['single', 'married', 'married with a child'] as const)
        test(`Lv${level}${gamble ? ` with the gamble Lv${gamble}'s copies` : ''}, ${family}`, () => {
          const { game, player, guards } = guarded(level, gamble)
          player.married = family !== 'single'
          player.hasChild = family === 'married with a child'
          for (const facing of [0, 180, -90, 90]) {
            game.setInput(player.id, stick(facing))
            for (let frame = 0; frame < 45; frame++) game.tick(DT)
            game.setInput(player.id, STILL)
            for (let frame = 0; frame < 60; frame++) game.tick(DT)
            const label = (guard: Shot) =>
              `facing ${facing}°, h ${guard.h} ${guard.sourceWeapon}: (${(guard.x - player.x).toFixed(1)}, ${(guard.y - player.y).toFixed(1)})`
            const child = childBox()
            const back = player.fx < 0 ? 1 : -1
            const slots = player.married ? FAMILY_SLOTS.slice(0, player.hasChild ? 2 : 1) : []
            for (const guard of guards) {
              expect(guard.guardianStill).toBe(1)
              const body = boxAbout(guard.x - player.x, guard.y - player.y, GUARDIAN_BODY)
              const hidden =
                Math.max(0, Math.min(body.right, child.right) - Math.max(body.left, child.left)) *
                Math.max(0, Math.min(body.bottom, child.bottom) - Math.max(body.top, child.top))
              const area = (body.right - body.left) * (body.bottom - body.top)
              expect(hidden / area, label(guard)).toBeLessThan(0.3)
              for (const slot of slots)
                expect(boxesOverlap(body, familyBox(back * slot.dx, slot.dy)), label(guard)).toBe(false)
              for (const other of guards)
                if (other !== guard)
                  expect(Math.hypot(guard.x - other.x, guard.y - other.y), label(guard)).toBeGreaterThanOrEqual(20)
            }
          }
        })

  test('standing still, she still guards every side: her reach and its centre are where they were', () => {
    for (const level of [1, 4, 8]) {
      const { game, player, guards } = guarded(level)
      game.setInput(player.id, stick(0))
      for (let frame = 0; frame < 30; frame++) game.tick(DT)
      game.setInput(player.id, STILL)
      for (let frame = 0; frame < 60; frame++) game.tick(DT)
      for (const guard of guards) {
        const reach = guard.orbit * 0.65 + 7 * (guard.r / 20)
        // The old centre: right on the child.
        for (const angle of [0, 90, 180, 270]) {
          const at = (distance: number) => ({
            x: player.x + Math.cos(radians(angle)) * distance,
            y: player.y + Math.sin(radians(angle)) * distance
          })
          const inside = at(reach + 4 - 1)
          const outside = at(reach + 4 + 1)
          expect(game['shieldTouches'](guard, inside.x, inside.y, 4), `Lv${level} ${angle}° inside`).toBe(true)
          expect(game['shieldTouches'](guard, outside.x, outside.y, 4), `Lv${level} ${angle}° outside`).toBe(false)
        }
      }
    }
  })
})

describe("in co-op, one player's companions keep off the other's", () => {
  for (const apart of [50, 60, 80])
    for (const both of [false, true])
      test(`two players standing ${apart} px apart, pets Lv8${both ? ', both' : ', the second'} with 過保護親 Lv4`, () => {
        const hand = (guard: boolean): Player['weapons'] => [
          { id: 'w_pet', lv: 8, cd: 0, held: 0, damage: 0 },
          ...(guard ? [{ id: 'p_over', lv: 4, cd: 0, held: 0, damage: 0 }] : [])
        ]
        const { game, player: first } = setup(hand(both))
        const { player: second } = setup(hand(true), game)
        second.x = first.x + apart
        second.y = first.y
        first.petAge = second.petAge = 6
        const players = [first, second]
        let pairs = 0
        let inside = 0
        const worst: string[] = []
        for (let frame = 0; frame < 900; frame++) {
          for (const player of players) game.setInput(player.id, STILL)
          game.tick(DT)
          if (frame < 60) continue
          const companions = game.state.shots.filter(
            (shot) =>
              (shot.weapon === 'w_pet' || shot.weapon === 'p_over') &&
              shot.delay <= 0 &&
              shot.life / shot.maxLife > 0.25
          )
          for (let a = 0; a < companions.length; a++)
            for (let b = a + 1; b < companions.length; b++) {
              const one = companions[a]
              const two = companions[b]
              if (one.owner === two.owner) continue
              const least = one.weapon === 'p_over' || two.weapon === 'p_over' ? 18 : 15
              const d = Math.hypot(one.x - two.x, one.y - two.y)
              if (d < least) {
                pairs++
                if (worst.length < 5) worst.push(`frame ${frame}: ${one.weapon} ${two.weapon} ${d.toFixed(1)} px`)
              }
            }
          for (const companion of companions) {
            const other = players.find((player) => player.id !== companion.owner)!
            const dx = companion.x - other.x
            const dy = companion.y - other.y
            if (Math.abs(dx) < 12 && dy > -30 && dy < 14) {
              inside++
              if (worst.length < 5)
                worst.push(`frame ${frame}: ${companion.weapon} in the other body (${dx.toFixed(1)}, ${dy.toFixed(1)})`)
            }
          }
        }
        expect(game.state.shots.filter((shot) => shot.weapon === 'w_pet').length).toBeGreaterThan(4)
        expect({ pairs, inside, worst }).toEqual({ pairs: 0, inside: 0, worst: [] })
      })
})

test('a gambling player’s resting pets keep out from under the badge on either side of her head', () => {
  const { game, player } = setup([
    { id: 'w_pet', lv: 5, cd: 0, held: 0, damage: 0 },
    { id: 'w_gamble', lv: 5, cd: 0, held: 0, damage: 0, gambleWeapon: 'w_pet', gambleUntil: 1e9 }
  ])
  player.petAge = 6
  const badges = overheadBoxes(1, 0, true).slice(1)
  let resting = 0
  for (const [heading, frames] of [
    [undefined, 300],
    [180, 20],
    [undefined, 280],
    [0, 60],
    [undefined, 200],
    [-90, 60],
    [undefined, 200]
  ] as const) {
    for (let frame = 0; frame < frames; frame++) {
      game.setInput(player.id, heading === undefined ? STILL : stick(heading))
      game.tick(DT)
      for (const pet of game.state.shots) {
        if (pet.owner !== player.id || pet.weapon !== 'w_pet' || pet.delay > 0 || pet.target) continue
        if (pet.restSpot === undefined) continue
        const spot = PET_SPOTS[pet.restSpot]
        const dx = pet.x - player.x
        const dy = pet.y - player.y
        if (Math.hypot(dx - spot.x, dy - spot.y) > 0.5) continue
        resting++
        const body = boxAbout(dx, dy, PET_HALF)
        for (const badge of badges)
          expect(
            boxesOverlap(body, badge),
            `heading ${heading}, frame ${frame}: (${dx.toFixed(1)}, ${dy.toFixed(1)})`
          ).toBe(false)
      }
    }
  }
  expect(resting).toBeGreaterThan(500)
})
