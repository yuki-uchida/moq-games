import { expect, test } from 'vitest'
import { EVENTS, timeAtAge } from '../src/data'
import { FAMILY_SLOTS } from '../src/family-slots'
import { Game, weaponStats, type Player, type Shot } from '../src/game'
import { PET_STILL, SHOT_GAMBLE, STRIDE, readView, toView } from '../src/view'

const DT = 1 / 60
const degrees = (angle: number) => (angle * Math.PI) / 180
const HEADINGS = [0, 45, 90, 135, 180, -135, -90, -45]

/** A child of 30 with the given parent and hand, no enemies and no events. */
function setup(parent: string, weapons: Player['weapons'], age = 30) {
  const game = new Game(5)
  game.targetPopulation = () => 0
  const player = game.addPlayer('a', parent)!
  player.birthPick = false
  player.pending = 0
  player.choices = []
  player.weapons = weapons
  game.state.time = timeAtAge(age) + 0.01
  game.state.eventIndex = EVENTS.length
  game.state.enemies = []
  return { game, player }
}

const pets = (game: Game, player: Player) =>
  game.state.shots.filter((shot) => shot.owner === player.id && shot.weapon === 'w_pet' && shot.delay <= 0)
const resting = (game: Game, player: Player) => pets(game, player).filter((pet) => !pet.target)

for (const [level, copy] of [
  [1, false],
  [4, false],
  [1, true],
  [4, true]
] as const)
  test(`resting pets keep off 過保護親 Lv${level}${copy ? ' and a gamble’s copy' : ''} walking every way and standing`, () => {
    const { game, player } = setup('p_over', [
      { id: 'p_over', lv: level, cd: 0, held: 0, damage: 0 },
      { id: 'w_pet', lv: 8, cd: 0, held: 0, damage: 0 },
      ...(copy ? [{ id: 'w_gamble', lv: 8, cd: 0, held: 0, damage: 0, gambleWeapon: 'p_over', gambleUntil: 1e9 }] : [])
    ])
    for (let frame = 0; frame < 30; frame++) game.tick(DT)
    let passes = 0
    let checked = 0
    let copies = 0
    const turns: (number | undefined)[] = [...HEADINGS, undefined]
    for (const heading of turns) {
      game.setInput(
        player.id,
        heading === undefined ? { x: 0, y: 0 } : { x: Math.cos(degrees(heading)), y: Math.sin(degrees(heading)) }
      )
      for (let frame = 0; frame < 60; frame++) {
        game.tick(DT)
        const guards = game.state.shots.filter(
          (shot) => shot.owner === player.id && shot.weapon === 'p_over' && shot.delay <= 0
        )
        expect(guards.filter((guard) => guard.sourceWeapon === 'p_over')).toHaveLength(level >= 4 ? 2 : 1)
        if (guards.some((guard) => guard.sourceWeapon === 'w_gamble')) copies++
        const inside: string[] = []
        for (const guard of guards)
          for (const pet of resting(game, player)) {
            const dx = pet.x - guard.x
            const dy = pet.y - guard.y
            // 過保護親 is ~22 px wide and ~32 px tall about her centre; a pet ~16 px wide about its centre.
            if (Math.abs(dx) < 16 && dy > -22 && dy < 18) inside.push(`${dx.toFixed(1)}, ${dy.toFixed(1)}`)
          }
        // Right after a turn too: she swings round her child while the pets in her way have already moved off.
        if ((frame + 1) * DT <= 0.4 && inside.length) passes++
        checked++
        expect(inside, `heading ${heading}, frame ${frame}`).toEqual([])
      }
    }
    expect(checked).toBeGreaterThan(0)
    // A gamble's copy comes and goes (her stay is shorter than the gamble's cooldown): she was out much of the walk.
    if (copy) expect(copies).toBeGreaterThan(turns.length * 20)
    else expect(copies).toBe(0)
    console.info(
      `過保護親 Lv${level}${copy ? ' + copy' : ''}: frames a parent passes over a pet just after a turn: ${passes} (all frames checked: ${checked}), copy out ${copies}/${turns.length * 60}`
    )
  })

test('resting pets keep out of 生き物観察’s creatures (the child’s own and a gamble’s copy) standing every way', () => {
  for (const heading of HEADINGS) {
    const { game, player } = setup('p_gone', [
      { id: 'w_observe', lv: 5, cd: 0, held: 0, damage: 0 },
      { id: 'w_gamble', lv: 5, cd: 0, held: 0, damage: 0, gambleWeapon: 'w_observe', gambleUntil: 1e9 },
      { id: 'w_pet', lv: 8, cd: 0, held: 0, damage: 0 }
    ])
    game.setInput(player.id, { x: Math.cos(degrees(heading)), y: Math.sin(degrees(heading)) })
    for (let frame = 0; frame < 20; frame++) game.tick(DT)
    game.setInput(player.id, { x: 0, y: 0 })
    let seen = 0
    for (let frame = 0; frame < 600; frame++) {
      game.tick(DT)
      for (const creature of game.state.shots.filter((shot) => shot.weapon === 'w_observe')) {
        if (creature.maxLife - creature.life < 0.3) continue
        seen++
        for (const pet of resting(game, player))
          expect(
            Math.abs(pet.x - creature.x) < 22 && Math.abs(pet.y - creature.y) < 22,
            `heading ${heading}°, frame ${frame}: pet at ${(pet.x - creature.x).toFixed(1)}, ${(pet.y - creature.y).toFixed(1)} from the creature`
          ).toBe(false)
      }
    }
    expect(seen, `heading ${heading}°`).toBeGreaterThan(0)
  }
})

test('resting pets keep off the spouse and child walking behind a married owner', () => {
  for (const x of [1, -1]) {
    const { game, player } = setup('p_gone', [{ id: 'w_pet', lv: 8, cd: 0, held: 0, damage: 0 }])
    player.married = true
    player.hasChild = true
    game.setInput(player.id, { x, y: 0 })
    for (let frame = 0; frame < 20; frame++) game.tick(DT)
    game.setInput(player.id, { x: 0, y: 0 })
    const back = player.fx < 0 ? 1 : -1
    expect(back).toBe(-x)
    for (let frame = 0; frame < 600; frame++) {
      game.tick(DT)
      for (const pet of pets(game, player))
        for (const slot of FAMILY_SLOTS) {
          const dx = pet.x - player.x - back * slot.dx
          const dy = pet.y - player.y - slot.dy
          expect(Math.abs(dx) < 20 && Math.abs(dy) < 24, `facing ${x}, frame ${frame}, ${slot.sheet}`).toBe(false)
        }
    }
  }
})

test('生き物観察’s own creature and a gamble’s copy appear across the child whichever comes first', () => {
  for (const order of ['own first', 'copy first'] as const)
    for (let heading = -180; heading < 180; heading += 15) {
      const { game, player } = setup('p_gone', [
        { id: 'w_observe', lv: 1, cd: 0, held: 0, damage: 0 },
        { id: 'w_gamble', lv: 1, cd: 0, held: 0, damage: 0, gambleWeapon: 'w_observe', gambleUntil: 1e9 }
      ])
      game.state.time = timeAtAge(16) + 0.01
      player.fx = Math.cos(degrees(heading))
      player.fy = Math.sin(degrees(heading))
      player.still = 2
      const [own, gamble] = player.weapons
      const fired = order === 'own first' ? [own, gamble] : [gamble, own]
      for (const weapon of fired) game['fire'](player, weapon, weaponStats(player, weapon))
      const creatures = game.state.shots.filter((shot) => shot.weapon === 'w_observe')
      const first = creatures.find((shot) => shot.sourceWeapon === fired[0].id)!
      const second = creatures.find((shot) => shot.sourceWeapon === fired[1].id)!
      expect(second, `${order}, heading ${heading}°`).toBeDefined()
      // The first faces the way the child faces, the second across the child from it, at most 20° above the horizon.
      expect(Math.hypot(second.x - player.x, second.y - player.y)).toBeCloseTo(50)
      expect(second.y - player.y).toBeGreaterThanOrEqual(-17.5)
      expect(
        Math.hypot(first.x - second.x, first.y - second.y),
        `${order}, heading ${heading}°: fields on top of each other`
      ).toBeGreaterThan(80)
      // The one out first comes again while the second is still out: it appears across from the second.
      game.state.shots = game.state.shots.filter((shot) => shot !== first)
      game['fire'](player, fired[0], weaponStats(player, fired[0]))
      const again = game.state.shots.find((shot) => shot.weapon === 'w_observe' && shot.sourceWeapon === fired[0].id)!
      expect(Math.hypot(again.x - second.x, again.y - second.y), `${order} again, heading ${heading}°`).toBeGreaterThan(
        80
      )
    }
})

/**
 * `count` pets of a Lv8 child all on one germ that cannot die: standing on the child (put back there every step) or
 * walking in from 140 px off. Every step `each(frame)` sees how far each pet moved in it, and the pets.
 */
function chase(
  count: number,
  enemyOn: 'child' | 'walking',
  frames: number,
  each: (frame: number, moved: number[], out: Shot[]) => void
) {
  const { game, player } = setup('p_gone', [{ id: 'w_pet', lv: 8, cd: 100, held: 0, damage: 0 }])
  const weapon = player.weapons[0]
  game['fire'](player, weapon, { ...weaponStats(player, weapon), amount: count })
  const enemy =
    enemyOn === 'child'
      ? game.spawnEnemy('germ', player.x, player.y)!
      : game.spawnEnemy('germ', player.x + 140, player.y + 30)!
  expect(enemy).toBeDefined()
  enemy.hp = enemy.maxHp = 1e9
  const out = pets(game, player)
  expect(out).toHaveLength(count)
  const bites = new Map(out.map((pet) => [pet, 0]))
  let wounds = 0
  for (let frame = 0; frame < frames; frame++) {
    player.hp = player.maxHp
    if (enemyOn === 'child') Object.assign(enemy, { x: player.x, y: player.y })
    const before = out.map((pet) => ({ x: pet.x, y: pet.y }))
    const hp = enemy.hp
    game.tick(DT)
    if (enemy.hp < hp) wounds++
    for (const pet of out) {
      expect(pet.target, `frame ${frame}`).toBe(enemy)
      if (pet.hits.get(enemy.id) === game.state.time + pet.tick) bites.set(pet, bites.get(pet)! + 1)
    }
    each(
      frame,
      out.map((pet, i) => Math.hypot(pet.x - before[i].x, pet.y - before[i].y)),
      out
    )
  }
  return { out, bites, wounds }
}

for (const enemyOn of ['child', 'walking'] as const)
  for (const count of [4, 5, 6])
    test(`${count} pets on one enemy ${enemyOn === 'child' ? 'standing on the child' : 'walking in'} bite it from around it, apart and steady`, () => {
      const result = chase(count, enemyOn, 240, (frame, moved, out) => {
        if (frame < 60) return
        // Arrived: none runs round the enemy (no jump over 3 px a step), each on its own side, none on another.
        moved.forEach((d, i) => expect(d, `frame ${frame}, pet ${i}`).toBeLessThanOrEqual(3))
        for (const a of out)
          for (const b of out)
            if (a.id < b.id)
              expect(Math.hypot(a.x - b.x, a.y - b.y), `frame ${frame}, #${a.id} #${b.id}`).toBeGreaterThanOrEqual(14)
      })
      // Every pet bit about every 0.4 s, as before.
      for (const [pet, n] of result.bites) expect(n, `#${pet.id}`).toBeGreaterThanOrEqual(8)
      expect(result.wounds).toBeGreaterThanOrEqual(8)
    })

test('7 to 12 pets on one enemy all bite it', () => {
  for (let count = 7; count <= 12; count++) {
    const { bites } = chase(count, 'walking', 300, () => {})
    for (const [pet, n] of bites) expect(n, `${count} pets, #${pet.id}`).toBeGreaterThanOrEqual(8)
  }
})

test('a standing pet tells the renderer it stands; walking or biting it does not', () => {
  const { game, player } = setup('p_gone', [{ id: 'w_pet', lv: 8, cd: 0, held: 0, damage: 0 }])
  const standing = () => {
    const view = toView(game.state)
    expect(readView(JSON.parse(JSON.stringify(view)))).toBeTruthy()
    const flags: boolean[] = []
    for (let i = 0; i < view.shots.length; i += STRIDE.shots) {
      let v = view.shots[i + 7]
      if (v >= SHOT_GAMBLE) v -= SHOT_GAMBLE
      flags.push(v >= PET_STILL)
    }
    return flags
  }
  for (let frame = 0; frame < 60; frame++) game.tick(DT)
  expect(standing().length).toBeGreaterThan(0)
  expect(standing().every(Boolean)).toBe(true)
  // The kind still reads back below the flag.
  const view = toView(game.state)
  const kinds = pets(game, player).map((pet) => pet.petType)
  expect(kinds.map((_, index) => Math.floor((view.shots[index * STRIDE.shots + 7] - PET_STILL) / 2))).toEqual(kinds)
  game.setInput(player.id, { x: 1, y: 0 })
  for (let frame = 0; frame < 5; frame++) {
    game.tick(DT)
    expect(standing().some(Boolean), `frame ${frame}`).toBe(false)
  }
  game.setInput(player.id, { x: 0, y: 0 })
  game.tick(DT)
  // Not yet: it must stand for 0.15 s first.
  expect(standing().some(Boolean)).toBe(false)
  for (let frame = 0; frame < 12; frame++) game.tick(DT)
  expect(standing().every(Boolean)).toBe(true)
  // A pet biting an enemy right beside it is biting, not standing, even unmoved.
  const [pet] = pets(game, player)
  const enemy = game.spawnEnemy('germ', pet.x, pet.y)!
  enemy.hp = enemy.maxHp = 1e9
  pet.target = enemy
  pet.aux = 1
  Object.assign(pet, game['petContact'](pet, player, enemy))
  pet.petStill = 1
  game['movePet'](pet, player, DT)
  expect(pet.v).toBe(1)
  const bitten = toView(game.state).shots[game.state.shots.indexOf(pet) * STRIDE.shots + 7]
  expect(bitten % 2).toBe(1)
  expect(bitten).toBeLessThan(PET_STILL)
})
