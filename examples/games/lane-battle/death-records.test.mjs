import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGame, summon, step } from './simulation.js'

test('death records include each removed unit once, including units spawned during a step', () => {
  const game = createGame()
  summon(game, 0, -1)
  const first = game.units[0]
  first.hp = 0
  game.spawn = 0
  step(game, 1 / 60)
  const second = game.units[0]
  second.hp = 0
  step(game, 1 / 60)
  step(game, 1 / 60)
  assert.deepEqual(
    game.deaths.map(({ id, at }) => ({ id, at })),
    [
      { id: first.id, at: 1 / 60 },
      { id: second.id, at: 2 / 60 }
    ]
  )
  assert.equal(game.deaths[0].x, first.x)
  assert.equal(game.deaths[1].side, -1)
})
