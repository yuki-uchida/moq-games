import { expect, test } from 'vitest'
import { EVENTS } from '../src/data'
import { Game } from '../src/game'

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
