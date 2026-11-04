import { expect, test } from 'vitest'
import { EVENTS, MAX_PASSIVE_LEVEL, MAX_WEAPON_LEVEL, timeAtAge } from '../src/data'
import { Game } from '../src/game'
import { readView, toView } from '../src/view'
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

test('a late relationship choice survives the parent farewell and remains valid in snapshots', () => {
  const game = new Game(96)
  const care = EVENTS.findIndex((event) => event.boss === 'b_care')
  game.state.eventIndex = care
  game.state.time = EVENTS[care].at - 0.1
  const player = game.addPlayer('late', 'p_over')!
  game.addPlayer('other', 'p_gone')
  player.weapons[0].lv = MAX_WEAPON_LEVEL
  player.passives = [{ id: 'p_affection', lv: MAX_PASSIVE_LEVEL - 1 }]
  const seq = player.choiceSeq
  expect(player.choices).toEqual(['d:yes', 'd:no'])

  game.tick(0.2)
  expect(player.parentDeath?.reward).toBe('passive')
  expect(player.weapons.some((weapon) => weapon.id === 'p_over')).toBe(false)
  expect(player.passives).toContainEqual({ id: 'p_affection', lv: MAX_PASSIVE_LEVEL })
  expect(player.choices).toEqual(['d:yes', 'd:no'])
  expect(player.choiceSeq).toBe(seq)
  expect(readView(toView(game.state))).toBeDefined()

  game.setInput(player.id, { pick: 0, pickSeq: seq })
  expect(player.dating).toBe(true)
  expect(game.spawnEnemy('temptation')?.targetPlayer).toBe(player.id)
  expect(readView(toView(game.state))).toBeDefined()
})
