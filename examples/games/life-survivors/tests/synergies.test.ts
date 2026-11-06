import { expect, test } from 'vitest'
import { TALENT_CATEGORIES } from '../src/data'
import { Game, weaponStats } from '../src/game'

test.each([
  ['w_study', 'w_invest'],
  ['w_sports', 'w_love'],
  ['w_friend', 'w_love'],
  ['w_sports', 'w_hobby'],
  ['w_hobby', 'w_study'],
  ['w_invest', 'w_friend']
])('%s and %s no longer grant category bonuses', (source, target) => {
  const game = new Game(10)
  const player = game.addPlayer('a', 'p_gone')!
  for (const category of TALENT_CATEGORIES) player.talents[category] = 1
  const weapon = { id: target, lv: 1, cd: 0, held: 0, damage: 0 }
  player.weapons = [weapon]
  const base = weaponStats(player, weapon)
  player.weapons.push({ id: source, lv: 1, cd: 0, held: 0, damage: 0 })
  expect(weaponStats(player, weapon)).toEqual(base)
  player.weapons = player.weapons.filter((owned) => owned.id !== source)
  expect(weaponStats(player, weapon)).toEqual(base)
})
