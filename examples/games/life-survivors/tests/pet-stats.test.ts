import { expect, test } from 'vitest'
import { WEAPON_BY_ID } from '../src/data'
import { Game, weaponStats, type Player, type Shot } from '../src/game'

function equip(game: Game, id: string, weapons = ['w_pet']) {
  const player = game.addPlayer(id, 'p_gone')!
  player.birthPick = false
  player.pending = 0
  player.choices = []
  player.weapons = weapons.map((weapon) => ({ id: weapon, lv: 1, cd: 0, held: 0, damage: 0 }))
  return player
}

function expectCurrentStats(player: Player, shot: Shot) {
  const weapon = player.weapons.find((owned) => owned.id === shot.weapon)!
  const stats = weaponStats(player, weapon)
  const def = WEAPON_BY_ID.get(weapon.id)!
  expect(shot.r).toBeCloseTo(def.area * stats.area)
  expect(shot.damage).toBeCloseTo(stats.damage)
  expect(shot.spin).toBeCloseTo(def.speed * stats.speed)
  expect(shot.critChance).toBeCloseTo(stats.crit)
  expect(shot.strongMult).toBeCloseTo(stats.strong)
  expect(shot.maxLife).toBeCloseTo(stats.duration)
}

test('pet reactivation adds and removes synergy only for its owner', () => {
  const game = new Game(5)
  const player = equip(game, 'a')
  const other = equip(game, 'b')
  game.tick(0.01)
  const pet = game.state.shots.find((shot) => shot.owner === player.id)!
  const otherPet = game.state.shots.find((shot) => shot.owner === other.id)!
  const baseRadius = pet.r
  for (const active of [true, false]) {
    if (active) player.weapons.push({ id: 'w_invest', lv: 1, cd: 100, held: 0, damage: 0 })
    else player.weapons.pop()
    player.weapons[0].cd = 0
    other.weapons[0].cd = 0
    game.tick(0.01)
    expect(game.state.shots).toContain(pet)
    expect(pet.r).toBeCloseTo(baseRadius * (active ? 1.1 : 1))
    expectCurrentStats(player, pet)
    expectCurrentStats(other, otherPet)
    expect(otherPet.r).toBeCloseTo(baseRadius)
  }
})

test('pet reactivation updates level and passive stats without resetting ongoing state', () => {
  const game = new Game(7)
  const player = equip(game, 'a')
  game.tick(1)
  const pet = game.state.shots[0]
  expect(game.state.enemies.length).toBeGreaterThan(0)
  pet.target = game.state.enemies[0]
  pet.angle = Math.atan2(pet.target.y - pet.y, pet.target.x - pet.x)
  pet.hits.set(-1, 100)
  pet.aux = 0.15
  const ongoing = {
    id: pet.id,
    x: pet.x,
    y: pet.y,
    angle: pet.angle,
    orbit: pet.orbit,
    aux: pet.aux,
    target: pet.target,
    hits: pet.hits,
    tick: pet.tick,
    pierce: pet.pierce
  }
  for (const upgraded of [true, false]) {
    player.weapons[0].lv = upgraded ? 8 : 1
    player.passives = upgraded
      ? ['p_hot', 'p_kind', 'p_curious', 'p_lucky', 'p_savvy', 'p_optimist'].map((id) => ({ id, lv: 1 }))
      : []
    player.weapons[0].cd = 0
    game.tick(0)
    expect(game.state.shots).toContain(pet)
    expectCurrentStats(player, pet)
    expect(pet.life).toBe(pet.maxLife)
    expect(pet).toMatchObject(ongoing)
    expect(pet.target).toBe(ongoing.target)
    expect(pet.hits).toBe(ongoing.hits)
    expect(pet.hits.get(-1)).toBe(100)
    expect(game.state.shots.filter((shot) => shot.kind === 'pet')).toHaveLength(5)
  }
})

test('reactivation leaves already fired ordinary shots at their original stats', () => {
  const game = new Game(9)
  const player = equip(game, 'a', ['w_love'])
  game.tick(0.01)
  const first = game.state.shots[0]
  const original = {
    r: first.r,
    damage: first.damage,
    vx: first.vx,
    vy: first.vy,
    critChance: first.critChance,
    strongMult: first.strongMult,
    maxLife: first.maxLife
  }
  player.weapons[0].lv = 8
  player.passives = ['p_hot', 'p_kind', 'p_curious', 'p_lucky', 'p_savvy'].map((id) => ({ id, lv: 1 }))
  player.weapons.push({ id: 'w_friend', lv: 1, cd: 100, held: 0, damage: 0 })
  player.weapons[0].cd = 0
  game.tick(0.01)
  expect(game.state.shots).toContain(first)
  expect(first).toMatchObject(original)
  const next = game.state.shots.find((shot) => shot.id !== first.id)!
  expect(next.damage).toBeGreaterThan(first.damage)
  expect(next.r).toBeGreaterThan(first.r)
  expect(next.critChance).toBeGreaterThan(first.critChance)
})

test('reacquiring a lower-level pet lets excess dogs expire', () => {
  const game = new Game(5)
  const player = equip(game, 'a')
  player.weapons[0].lv = 8
  game.tick(0.01)
  expect(game.state.shots.filter((shot) => shot.weapon === 'w_pet')).toHaveLength(4)

  player.choices = ['r:w_pet:w_study']
  game.choose(player, 0)
  player.choices = ['r:w_study:w_pet']
  game.choose(player, 0)
  expect(player.weapons[0].lv).toBe(1)

  for (let frame = 0; frame < 430; frame++) {
    player.choices = []
    player.hp = player.maxHp
    game.state.enemies = []
    game.tick(1 / 60)
  }
  expect(game.state.shots.filter((shot) => shot.weapon === 'w_pet')).toHaveLength(1)
})
