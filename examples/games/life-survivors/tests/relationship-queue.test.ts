import { expect, test } from 'vitest'
import { EVENTS, timeAtAge } from '../src/data'
import { Game } from '../src/game'
import { PET_MEMORY } from '../src/weapon-life'

test('relationship choices preserve each player’s outstanding hand, even if left open until the wedding', () => {
  const game = new Game(94)
  const first = game.addPlayer('first', 'p_free')!
  const second = game.addPlayer('second', 'p_free')!
  first.choices = ['w:w_study']
  second.choices = ['w:w_friend']
  const dating = EVENTS.findIndex((event) => event.swarm === 'car')
  game.state.eventIndex = dating
  game.state.time = EVENTS[dating].at - 0.01
  game.tick(0.02)
  expect(first.choices).toEqual(['d:yes', 'd:no'])
  expect(second.choices).toEqual(['d:yes', 'd:no'])

  game.choose(first, 0)
  expect(first.dating).toBe(true)
  expect(first.choices).toEqual(['w:w_study'])
  expect(second.choices).toEqual(['d:yes', 'd:no'])

  const wedding = EVENTS.findIndex((event) => event.boss === 'b_wedding')
  game.state.eventIndex = wedding
  game.state.time = EVENTS[wedding].at - 0.01
  game.tick(0.02)
  expect(first.choices).toEqual(['w:w_study'])
  expect(second.choices).toEqual(['w:w_friend'])
  expect(second.dating).toBe(false)
})

test('an expiring pet updates the saved hand without losing the relationship choice', () => {
  const game = new Game(95)
  const player = game.addPlayer('first', 'p_free')!
  game.addPlayer('second', 'p_free')
  player.weapons.push({ id: 'w_pet', lv: 1, cd: 100, held: 0, damage: 0, acquiredAge: 6 })
  player.choices = ['r:w_pet:w_sports']
  const dating = EVENTS.findIndex((event) => event.swarm === 'car')
  game.state.eventIndex = dating
  game.state.time = EVENTS[dating].at - 0.01
  game.tick(0.02)
  expect(player.choices).toEqual(['d:yes', 'd:no'])

  game.state.eventIndex = EVENTS.length
  game.state.time = timeAtAge(26) - 0.01
  game.tick(0.02)
  expect(player.weapons.some((weapon) => weapon.id === 'w_pet')).toBe(false)
  expect(player.passives).toContainEqual({ id: PET_MEMORY, lv: 1 })
  expect(player.choices).toEqual(['d:yes', 'd:no'])
  game.choose(player, 0)
  expect(player.dating).toBe(true)
  expect(player.choices).toEqual(['x:skip'])
})
