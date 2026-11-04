import { expect, test } from 'vitest'
import { WEAPON_BY_ID } from '../src/data'
import { Game, isEvolved, weaponStats, type Player } from '../src/game'
import { activeSynergies, SYNERGIES } from '../src/synergies'
import { readView, toView } from '../src/view'

function equip(player: Player, ...ids: string[]) {
  player.weapons = ids.map((id) => ({ id, lv: 1, cd: 0, held: 0, damage: 0 }))
}

test.each([
  ['w_study', 'w_invest', 'w_savings', 'w_gamble', 'w_sports', 1.2, 1, 1],
  ['w_sports', 'w_love', 'w_beauty', 'w_perfume', 'w_study', 1, 0.9, 1],
  ['w_friend', 'w_love', 'w_beauty', 'w_perfume', 'w_study', 1, 1, 1.15],
  ['w_sports', 'w_hobby', 'w_karaoke', 'w_travel', 'w_friend', 1.1, 1, 1],
  ['w_hobby', 'w_study', 'w_reading', 'w_work', 'w_love', 1, 0.95, 1],
  ['w_invest', 'w_friend', 'w_sns', 'w_pet', 'w_sports', 1, 1, 1.1]
] as const)(
  '%s + %s applies once to each target and releases on exchange',
  (source, target, second, firstReplacement, secondReplacement, damage, cooldown, area) => {
    const game = new Game(10)
    const player = game.addPlayer('a', 'p_gone')!
    const other = game.addPlayer('b', 'p_gone')!
    equip(player, target, second)
    equip(other, source)
    const otherBase = weaponStats(other, other.weapons[0])
    const bases = player.weapons.map((weapon) => weaponStats(player, weapon))
    expect(activeSynergies(player.weapons.map((weapon) => weapon.id))).toHaveLength(0)
    const extraSource = {
      w_study: 'w_reading',
      w_sports: 'w_muscle',
      w_friend: 'w_sns',
      w_hobby: 'w_karaoke',
      w_invest: 'w_savings'
    }[source]
    equip(player, target, second, source, extraSource)
    expect(activeSynergies(player.weapons.map((weapon) => weapon.id))).toHaveLength(1)
    for (let index = 0; index < 2; index++) {
      const expected = {
        ...bases[index],
        damage: bases[index].damage * damage,
        cooldown: bases[index].cooldown * cooldown,
        area: bases[index].area * area
      }
      expect(weaponStats(player, player.weapons[index])).toEqual(expected)
    }
    expect(weaponStats(other, other.weapons[0])).toEqual(otherBase)
    for (const [id, replacement] of [
      [source, firstReplacement],
      [extraSource, secondReplacement]
    ]) {
      expect(player.weapons.some((weapon) => weapon.id === replacement)).toBe(false)
      player.choices = [`s:${replacement}`]
      game.choose(player, 0)
      expect(player.choices).toContain(`r:${id}:${replacement}`)
      game.choose(player, player.choices.indexOf(`r:${id}:${replacement}`))
    }
    const remaining = activeSynergies(player.weapons.map((weapon) => weapon.id))
    expect(remaining).toHaveLength(0)
    for (let index = 0; index < 2; index++) {
      expect(weaponStats(player, player.weapons[index])).toEqual(bases[index])
    }
  }
)

test('all six adjacent pairs coexist without compounding unrelated bonuses or exposing talents', () => {
  const game = new Game(11)
  const player = game.addPlayer('a', 'p_gone')!
  const ids = ['w_friend', 'w_love', 'w_sports', 'w_hobby', 'w_study', 'w_invest']
  const multipliers = [
    [1, 1, 1.1],
    [1, 0.9, 1.15],
    [1, 1, 1],
    [1.1, 1, 1],
    [1, 0.95, 1],
    [1.2, 1, 1]
  ]
  const bases = ids.map((id) => {
    equip(player, id)
    return weaponStats(player, player.weapons[0])
  })
  equip(player, ...ids)
  expect(SYNERGIES).toHaveLength(6)
  expect(activeSynergies(ids)).toHaveLength(6)
  for (let index = 0; index < ids.length; index++) {
    const actual = weaponStats(player, player.weapons[index])
    expect(actual).toEqual({
      ...bases[index],
      damage: bases[index].damage * multipliers[index][0],
      cooldown: bases[index].cooldown * multipliers[index][1],
      area: bases[index].area * multipliers[index][2]
    })
  }
  const view = readView(JSON.parse(JSON.stringify(toView(game.state))))!
  expect(view.players[0]).not.toHaveProperty('talents')
  expect(activeSynergies(view.players[0].weapons.map(([id]) => id))).toHaveLength(6)
})

test('knowledge supports investment once, independently of talent and weapon levels', () => {
  const game = new Game(1)
  const player = game.addPlayer('a', 'p_gone')!
  equip(player, 'w_invest')
  const base = weaponStats(player, player.weapons[0])
  for (const knowledge of ['w_study', 'w_reading']) {
    equip(player, 'w_invest', knowledge)
    expect(weaponStats(player, player.weapons[0]).damage).toBeCloseTo(base.damage * 1.2)
  }
  equip(player, 'w_invest', 'w_study', 'w_reading')
  expect(activeSynergies(player.weapons.map((weapon) => weapon.id))).toHaveLength(1)
  expect(weaponStats(player, player.weapons[0]).damage).toBeCloseTo(base.damage * 1.2)
  player.weapons[0].lv = 8
  player.passives = [{ id: 'p_greedy', lv: 1 }]
  expect(isEvolved(player, player.weapons[0])).toBe(true)
  const evolved = weaponStats(player, player.weapons[0]).damage
  player.weapons.splice(1)
  expect(weaponStats(player, player.weapons[0]).damage).toBeCloseTo(evolved / 1.2)
})

test('different bonds combine with bounded bonuses and release on actual replacement', () => {
  const game = new Game(2)
  const player = game.addPlayer('a', 'p_gone')!
  const other = game.addPlayer('b', 'p_gone')!
  equip(player, 'w_love')
  equip(other, 'w_sports', 'w_friend')
  const base = weaponStats(player, player.weapons[0])
  expect(activeSynergies(player.weapons.map((weapon) => weapon.id))).toHaveLength(0)
  equip(player, 'w_love', 'w_sports', 'w_muscle', 'w_friend')
  const combined = weaponStats(player, player.weapons[0])
  expect(combined.cooldown).toBeCloseTo(base.cooldown * 0.9)
  expect(combined.area).toBeCloseTo(base.area * 1.15)
  expect(combined.damage).toBe(base.damage)
  expect(player.married).toBe(false)
  expect(player.hasChild).toBe(false)
  for (const id of ['w_sports', 'w_muscle', 'w_friend']) {
    player.choices = [`r:${id}:w_hobby`]
    game.choose(player, 0)
  }
  expect(weaponStats(player, player.weapons[0])).toEqual(base)
  expect(activeSynergies(['p_edu', 'w_invest', 'p_gone', 'w_love'])).toHaveLength(0)
})

test('public snapshots derive identical activation without publishing hidden talents', () => {
  const game = new Game(3)
  const player = game.addPlayer('a', 'p_gone')!
  equip(player, 'w_reading', 'w_invest')
  const view = readView(JSON.parse(JSON.stringify(toView(game.state))))!
  expect(view.players[0].talents).toBeUndefined()
  expect(activeSynergies(view.players[0].weapons.map(([id]) => id))).toEqual(
    activeSynergies(player.weapons.map((weapon) => weapon.id))
  )
})

test('new attacks use the current synergy while existing shots keep their original size', () => {
  const game = new Game(5)
  const player = game.addPlayer('a', 'p_gone')!
  player.birthPick = false
  player.pending = 0
  player.choices = []
  equip(player, 'w_love', 'w_sports', 'w_friend')
  const love = WEAPON_BY_ID.get('w_love')!
  game.tick(0.01)
  const first = game.state.shots.find((shot) => shot.weapon === love.id)!
  expect(first.r).toBeCloseTo(love.area * 1.15)
  expect(player.weapons[0].cd).toBeCloseTo(love.cooldown * 0.9 - 0.01)
  player.choices = ['r:w_friend:w_hobby']
  game.choose(player, 0)
  player.weapons[0].cd = 0
  game.tick(0.01)
  const shots = game.state.shots.filter((shot) => shot.weapon === love.id)
  expect(shots).toHaveLength(2)
  expect(shots[0].r).toBeCloseTo(love.area * 1.15)
  expect(shots[1].r).toBeCloseTo(love.area)
})

test('social range synergy extends the first SNS link as well as subsequent links', () => {
  const fire = (distances: number[], withAssets: boolean) => {
    const game = new Game(12)
    const player = game.addPlayer('a', 'p_gone')!
    player.birthPick = false
    player.pending = 0
    player.choices = []
    equip(player, 'w_sns', ...(withAssets ? ['w_savings'] : []))
    if (withAssets) player.weapons[1].cd = 1000
    const enemies = distances.map((distance) => game.spawnEnemy('bully', player.x + distance, player.y)!)
    for (const enemy of enemies) enemy.hp = enemy.maxHp = 10000
    game.tick(0.01)
    return enemies.map((enemy) => enemy.maxHp - enemy.hp)
  }

  expect(fire([440], false)[0]).toBe(0)
  expect(fire([440], true)[0]).toBeGreaterThan(0)
  expect(fire([470], true)[0]).toBe(0)
  expect(fire([100, 285], false)[1]).toBe(0)
  expect(fire([100, 285], true)[1]).toBeGreaterThan(0)
})

test('parents and personalities neither activate nor receive synergy bonuses', () => {
  const game = new Game(4)
  const player = game.addPlayer('a', 'p_rich')!
  player.passives = [
    { id: 'p_diligent', lv: 5 },
    { id: 'p_healthy', lv: 5 }
  ]
  equip(player, 'p_rich', 'w_love')
  expect(activeSynergies(player.weapons.map((weapon) => weapon.id))).toHaveLength(0)
  const base = weaponStats(player, player.weapons[0])
  equip(player, 'p_rich', 'w_study', 'w_invest')
  expect(activeSynergies(player.weapons.map((weapon) => weapon.id))).toHaveLength(1)
  expect(weaponStats(player, player.weapons[0])).toEqual(base)
})
