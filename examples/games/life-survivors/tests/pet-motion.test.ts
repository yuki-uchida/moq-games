import { expect, test } from 'vitest'
import { EVENTS, timeAtAge } from '../src/data'
import { Game, PET_SPOTS, weaponStats, type Player, type Shot } from '../src/game'
import { PET_TYPES } from '../src/weapon-life'

const DT = 1 / 60
const degrees = (angle: number) => (angle * Math.PI) / 180

/** A child of 30 with the given hand, no enemies and no events. */
function setup(weapons: Player['weapons'], seed = 5) {
  const game = new Game(seed)
  game.targetPopulation = () => 0
  const player = game.addPlayer('a', 'p_gone')!
  player.birthPick = false
  player.pending = 0
  player.choices = []
  player.weapons = weapons
  game.state.time = timeAtAge(30) + 0.01
  game.state.eventIndex = EVENTS.length
  game.state.enemies = []
  return { game, player }
}

const pets = (game: Game, player: Player) =>
  game.state.shots.filter((shot) => shot.owner === player.id && shot.weapon === 'w_pet' && shot.delay <= 0)
const slot = (shot: Shot) => shot.id

for (const lv of [1, 8])
  test(`following pets of every kind keep still relative to a walking child (Lv${lv}) and face the way they go`, () => {
    for (let heading = -180; heading < 180; heading += 45) {
      const { game, player } = setup([{ id: 'w_pet', lv, cd: 0, held: 0, damage: 0 }])
      // One of every kind out: summoned here, then re-summoned by the weapon each time it comes round.
      const weapon = player.weapons[0]
      game['fire'](player, weapon, { ...weaponStats(player, weapon), amount: PET_TYPES.length })
      weapon.cd = weaponStats(player, weapon).cooldown
      const dx = Math.cos(degrees(heading))
      const dy = Math.sin(degrees(heading))
      game.setInput(player.id, { x: dx, y: dy })
      for (let frame = 0; frame < 42; frame++) game.tick(DT)
      expect(new Set(pets(game, player).map((pet) => pet.petType)).size).toBe(PET_TYPES.length)
      let last = new Map(pets(game, player).map((pet) => [slot(pet), { x: pet.x - player.x, y: pet.y - player.y }]))
      for (let frame = 0; frame < 360; frame++) {
        game.tick(DT)
        const now = new Map<string, { x: number; y: number }>()
        for (const pet of pets(game, player)) {
          expect(pet.target).toBeUndefined()
          const at = { x: pet.x - player.x, y: pet.y - player.y }
          now.set(slot(pet), at)
          const before = last.get(slot(pet))
          if (before)
            expect(
              Math.hypot(at.x - before.x, at.y - before.y),
              `Lv${lv}, heading ${heading}°, frame ${frame}, ${slot(pet)}`
            ).toBeLessThan(0.5)
          // Never running backwards: its facing points along the child's walk.
          expect(
            Math.cos(pet.angle) * dx + Math.sin(pet.angle) * dy,
            `Lv${lv}, heading ${heading}°, frame ${frame}`
          ).toBeGreaterThan(0)
        }
        last = now
      }
    }
  })

test('a pet coming back from a bite runs facing the way it goes and keeps its facing once it stands', () => {
  const { game, player } = setup([{ id: 'w_pet', lv: 1, cd: 100, held: 0, damage: 0 }])
  game['fire'](player, player.weapons[0], weaponStats(player, player.weapons[0]))
  const [pet] = pets(game, player)
  pet.x = player.x - 120
  pet.y = player.y
  pet.angle = Math.PI
  let x = pet.x
  for (let frame = 0; frame < 120; frame++) {
    game['movePet'](pet, player, DT)
    if (pet.x - x > 0.3) expect(Math.cos(pet.angle)).toBeGreaterThan(0)
    x = pet.x
  }
  const facing = pet.angle
  for (let frame = 0; frame < 30; frame++) game['movePet'](pet, player, DT)
  expect(pet.angle).toBe(facing)
})

/** Pets settled out for at least this long (s) count as resting among the others. */
const SETTLED = 0.3

/**
 * Pairs of resting pets (no enemy to chase, out for SETTLED) less than 20 px apart: any kinds, rounds and sources (the
 * child's own or a gamble's copy).
 */
function crowded(out: Shot[]) {
  const close: string[] = []
  const resting = out.filter((pet) => !pet.target && pet.maxLife - pet.life >= SETTLED)
  for (const a of resting)
    for (const b of resting)
      if (a.id < b.id) {
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (d < 20)
          close.push(`${a.sourceWeapon}#${a.id}:${a.petType} ${b.sourceWeapon}#${b.id}:${b.petType} ${d.toFixed(1)} px`)
      }
  return close
}

test('resting spots: 6, 10, 14 and 17 on rings of 34, 56, 78 and 100 px from -20° to 200°, no two within 22 px', () => {
  const rings = [34, 56, 78, 100].map(
    (radius) => PET_SPOTS.filter((spot) => Math.abs(Math.hypot(spot.x, spot.y) - radius) < 1e-9).length
  )
  expect(rings).toEqual([6, 10, 14, 17])
  expect(PET_SPOTS).toHaveLength(47)
  for (const spot of PET_SPOTS) {
    const angle = Math.atan2(spot.y, spot.x)
    // -20° to 200°: never more than 20° above the horizon on either side.
    expect(spot.y).toBeGreaterThanOrEqual(-Math.sin(degrees(20)) * Math.hypot(spot.x, spot.y) - 1e-9)
    if (spot.y < 0) expect(Math.abs(Math.cos(angle))).toBeGreaterThan(Math.cos(degrees(20)) - 1e-9)
  }
  for (let a = 0; a < PET_SPOTS.length; a++)
    for (let b = a + 1; b < PET_SPOTS.length; b++)
      expect(
        Math.hypot(PET_SPOTS[a].x - PET_SPOTS[b].x, PET_SPOTS[a].y - PET_SPOTS[b].y),
        `${a}, ${b}`
      ).toBeGreaterThanOrEqual(22 - 1e-9)
})

test('a new round of pets joins the last one on free spots, doubling the pets without stacking or moving them', () => {
  const { game, player } = setup([
    { id: 'w_pet', lv: 8, cd: 100, held: 0, damage: 0 },
    { id: 'w_gamble', lv: 8, cd: 100, held: 0, damage: 0, gambleWeapon: 'w_pet', gambleUntil: 1e9 }
  ])
  const [own, gamble] = player.weapons
  game['fire'](player, own, weaponStats(player, own))
  game['fire'](player, gamble, weaponStats(player, gamble))
  const first = pets(game, player)
  expect(first.some((pet) => pet.sourceWeapon === 'w_gamble')).toBe(true)
  // The first round appears on resting spots of its own, the nearest ones round the child.
  expect(new Set(first.map((pet) => pet.restSpot)).size).toBe(first.length)
  for (const pet of first) {
    const spot = PET_SPOTS[pet.restSpot!]
    expect(pet.x - player.x).toBeCloseTo(spot.x)
    expect(pet.y - player.y).toBeCloseTo(spot.y)
    expect(Math.hypot(spot.x, spot.y)).toBeLessThanOrEqual(56 + 1e-9)
  }
  for (let frame = 0; frame < 120; frame++) game.tick(DT)
  const settled = new Map(first.map((pet) => [pet, { x: pet.x - player.x, y: pet.y - player.y }]))
  game['fire'](player, own, weaponStats(player, own))
  game['fire'](player, gamble, weaponStats(player, gamble))
  const both = pets(game, player)
  // Both rounds are out: twice the pets, every one on a spot of its own, the first round untouched.
  expect(both).toHaveLength(first.length * 2)
  expect(first.every((pet) => both.includes(pet))).toBe(true)
  expect(new Set(both.map((pet) => pet.restSpot)).size).toBe(both.length)
  for (const pet of both.filter((pet) => !first.includes(pet))) {
    const spot = PET_SPOTS[pet.restSpot!]
    expect(pet.x - player.x).toBeCloseTo(spot.x)
    expect(pet.y - player.y).toBeCloseTo(spot.y)
  }
  for (let frame = 0; frame < 120; frame++) {
    game.tick(DT)
    for (const pet of first) {
      const at = settled.get(pet)!
      expect(Math.hypot(pet.x - player.x - at.x, pet.y - player.y - at.y), `frame ${frame}`).toBeLessThan(1e-6)
    }
    expect(crowded(pets(game, player)), `frame ${frame}`).toEqual([])
  }
  // Once the first round has gone the third takes the spots near the child it left.
  const inner = new Set(first.map((pet) => pet.restSpot))
  for (const pet of first) pet.life = 0
  game.tick(DT)
  game['fire'](player, own, weaponStats(player, own))
  const third = pets(game, player).filter((pet) => !both.includes(pet))
  expect(third).toHaveLength(weaponStats(player, own).amount)
  expect(third.every((pet) => inner.has(pet.restSpot))).toBe(true)
})

test('the first pets appear on their resting spots, not on the child', () => {
  const { game, player } = setup([{ id: 'w_pet', lv: 8, cd: 100, held: 0, damage: 0 }])
  game['fire'](player, player.weapons[0], weaponStats(player, player.weapons[0]))
  const out = pets(game, player)
  expect(out.length).toBeGreaterThan(1)
  for (const pet of out) {
    expect(Math.hypot(pet.x - player.x, pet.y - player.y)).toBeCloseTo(34)
    const spot = PET_SPOTS[pet.restSpot!]
    expect(pet.x - player.x).toBeCloseTo(spot.x)
    expect(pet.y - player.y).toBeCloseTo(spot.y)
  }
})

test('resting pets never stand within 20 px of each other: any kinds, rounds, the child’s own and a gamble’s copies', () => {
  for (const own of [1, 3, 5, 8])
    for (const copied of [1, 2, 5, 8])
      for (const heading of [undefined, 0, 45, 90, 135, 180, -135, -90, -45]) {
        const { game, player } = setup([
          { id: 'w_pet', lv: own, cd: 0, held: 0, damage: 0 },
          { id: 'w_gamble', lv: copied, cd: 0, held: 0, damage: 0, gambleWeapon: 'w_pet', gambleUntil: 1e9 }
        ])
        if (heading !== undefined)
          game.setInput(player.id, { x: Math.cos(degrees(heading)), y: Math.sin(degrees(heading)) })
        let overlapping = 0
        for (let frame = 0; frame < 720; frame++) {
          game.tick(DT)
          const out = pets(game, player)
          if (out.filter((pet) => pet.sourceWeapon === 'w_pet').length > weaponStats(player, player.weapons[0]).amount)
            overlapping++
          expect(crowded(out), `own Lv${own}, gamble Lv${copied}, heading ${heading}, frame ${frame}`).toEqual([])
        }
        // Rounds did overlap (both out at once) along the way.
        expect(overlapping, `own Lv${own}, gamble Lv${copied}`).toBeGreaterThan(0)
      }
})

test('a gamble’s copy of 生き物観察 appears across the child from their own creature', () => {
  for (let heading = -180; heading < 180; heading += 15) {
    const { game, player } = setup([
      { id: 'w_observe', lv: 1, cd: 0, held: 0, damage: 0 },
      { id: 'w_gamble', lv: 1, cd: 0, held: 0, damage: 0, gambleWeapon: 'w_observe', gambleUntil: 1e9 }
    ])
    game.state.time = timeAtAge(16) + 0.01
    player.fx = Math.cos(degrees(heading))
    player.fy = Math.sin(degrees(heading))
    player.still = 2
    const [own, gamble] = player.weapons
    game['fire'](player, own, weaponStats(player, own))
    game['fire'](player, gamble, weaponStats(player, gamble))
    const creatures = game.state.shots.filter((shot) => shot.weapon === 'w_observe')
    const mine = creatures.find((shot) => shot.sourceWeapon === 'w_observe')!
    const copy = creatures.find((shot) => shot.sourceWeapon === 'w_gamble')!
    expect(copy, `heading ${heading}°`).toBeDefined()
    const ox = mine.x - player.x
    const oy = mine.y - player.y
    const cx = copy.x - player.x
    const cy = copy.y - player.y
    expect(Math.hypot(cx, cy)).toBeCloseTo(50)
    // On the other side of the child, and no higher than 20° above the horizon.
    expect(ox * cx + oy * cy, `heading ${heading}°`).toBeLessThan(0)
    expect(cy, `heading ${heading}°`).toBeGreaterThanOrEqual(-17.5)
    // A creature above the horizon (or level) is mirrored exactly; one below sends the copy up to the 20° limit.
    if (oy <= 1e-9) {
      expect(cx).toBeCloseTo(-ox)
      expect(cy).toBeCloseTo(-oy)
    }
    // The two fields lie apart.
    expect(Math.hypot(cx - ox, cy - oy), `heading ${heading}°`).toBeGreaterThan(80)
  }
})
