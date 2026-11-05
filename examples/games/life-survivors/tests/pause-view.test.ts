import { expect, test } from 'vitest'
import { Game } from '../src/game'
import { readView, toView } from '../src/view'

const roundTrip = (paused: unknown) => {
  const game = new Game(5)
  game.addPlayer('host')
  game.addPlayer('guest')
  const view = JSON.parse(JSON.stringify(toView(game.state, ['guest']))) as Record<string, unknown>
  view.paused = paused
  return readView(view)
}

test('the paused list is optional and omitted when nobody holds the clock', () => {
  const game = new Game(5)
  game.addPlayer('host')
  expect(toView(game.state)).not.toHaveProperty('paused')
  expect(readView(JSON.parse(JSON.stringify(toView(game.state))))).toBeDefined()
})

test('a snapshot may name seated players holding the clock', () => {
  expect(roundTrip(['guest'])?.paused).toEqual(['guest'])
  expect(roundTrip(['host', 'guest'])?.paused).toEqual(['host', 'guest'])
})

test('malformed or foreign paused lists are rejected', () => {
  for (const bad of [[], ['ghost'], ['guest', 'guest'], [1], 'guest', null, { 0: 'guest' }])
    expect(roundTrip(bad)).toBeUndefined()
})
