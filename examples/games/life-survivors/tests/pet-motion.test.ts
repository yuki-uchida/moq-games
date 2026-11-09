import { expect, test } from 'vitest'
import { EVENTS, timeAtAge } from '../src/data'
import { Game, weaponStats, type Player, type Shot } from '../src/game'
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

/** Pairs of pets of one kind (any round, the child's own or a gamble's copy) less than 20 px apart, while resting. */
function crowded(out: Shot[]) {
  const close: string[] = []
  for (const a of out)
    for (const b of out)
      if (a.id < b.id && a.petType === b.petType && !a.target && !b.target) {
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (d < 20) close.push(`${a.sourceWeapon}#${a.id} ${b.sourceWeapon}#${b.id} ${d.toFixed(1)} px`)
      }
  return close
}

test('a new round of pets joins the last one on the other ring, doubling the pets without stacking them', () => {
  const { game, player } = setup([
    { id: 'w_pet', lv: 8, cd: 100, held: 0, damage: 0 },
    { id: 'w_gamble', lv: 8, cd: 100, held: 0, damage: 0, gambleWeapon: 'w_pet', gambleUntil: 1e9 }
  ])
  const [own, gamble] = player.weapons
  game['fire'](player, own, weaponStats(player, own))
  game['fire'](player, gamble, weaponStats(player, gamble))
  const first = pets(game, player)
  expect(first.some((pet) => pet.sourceWeapon === 'w_gamble')).toBe(true)
  // The first round appears on the inner ring's resting spots.
  for (const pet of first) {
    expect(pet.petRing).toBe(0)
    expect(Math.hypot(pet.x - player.x, pet.y - player.y)).toBeCloseTo(34)
  }
  for (let frame = 0; frame < 120; frame++) game.tick(DT)
  game['fire'](player, own, weaponStats(player, own))
  game['fire'](player, gamble, weaponStats(player, gamble))
  const both = pets(game, player)
  // Both rounds are out: twice the pets, the first round untouched.
  expect(both).toHaveLength(first.length * 2)
  expect(first.every((pet) => both.includes(pet))).toBe(true)
  // The second round appears on the outer ring's resting spots.
  for (const pet of both.filter((pet) => !first.includes(pet))) {
    expect(pet.petRing).toBe(1)
    expect(Math.hypot(pet.x - player.x, pet.y - player.y)).toBeCloseTo(56)
  }
  for (let frame = 0; frame < 120; frame++) {
    game.tick(DT)
    expect(crowded(pets(game, player)), `frame ${frame}`).toEqual([])
  }
  // The third round goes back to the inner ring, next to the second.
  for (const pet of first) pet.life = 0
  game.tick(DT)
  game['fire'](player, own, weaponStats(player, own))
  expect(pets(game, player).filter((pet) => pet.sourceWeapon === 'w_pet' && !pet.petRing)).toHaveLength(
    weaponStats(player, own).amount
  )
})

test('the first pets appear on their resting spots, not on the child', () => {
  const { game, player } = setup([{ id: 'w_pet', lv: 8, cd: 100, held: 0, damage: 0 }])
  game['fire'](player, player.weapons[0], weaponStats(player, player.weapons[0]))
  const out = pets(game, player)
  expect(out.length).toBeGreaterThan(1)
  for (const pet of out) expect(Math.hypot(pet.x - player.x, pet.y - player.y)).toBeCloseTo(34)
})

test('resting pets of one kind never stand within 20 px: rounds of the child’s own and a gamble’s copies', () => {
  for (const lv of [1, 5, 8])
    for (const heading of [undefined, 0, 90, 180, -90]) {
      const { game, player } = setup([
        { id: 'w_pet', lv, cd: 0, held: 0, damage: 0 },
        { id: 'w_gamble', lv, cd: 0, held: 0, damage: 0, gambleWeapon: 'w_pet', gambleUntil: 1e9 }
      ])
      if (heading !== undefined)
        game.setInput(player.id, { x: Math.cos(degrees(heading)), y: Math.sin(degrees(heading)) })
      let overlapping = 0
      for (let frame = 0; frame < 1200; frame++) {
        game.tick(DT)
        const out = pets(game, player)
        if (out.filter((pet) => pet.sourceWeapon === 'w_pet').length > weaponStats(player, player.weapons[0]).amount)
          overlapping++
        if (frame < 90) continue
        expect(crowded(out), `Lv${lv}, heading ${heading}, frame ${frame}`).toEqual([])
      }
      // Rounds did overlap (both out at once) along the way.
      expect(overlapping, `Lv${lv}`).toBeGreaterThan(0)
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
