import { expect, test } from 'vitest'
import { WEAPON_BY_ID } from '../src/data'
import { Game, isEvolved, weaponStats, type Player } from '../src/game'
import { activeSynergies } from '../src/synergies'
import { readView, toView } from '../src/view'

function equip(player: Player, ...ids: string[]) {
  player.weapons = ids.map((id) => ({ id, lv: 1, cd: 0, held: 0, damage: 0 }))
}

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
