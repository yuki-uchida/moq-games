import { expect, it } from 'vitest'
import { Game, packSnapshot } from '../src/game'
import { MAX_PAYLOAD_BYTES } from '../src/network'

it('keeps snapshots sendable after many different predators have caught a rabbit', () => {
  const game = new Game(1, undefined, 0)
  game.addPlayer('11111111-1111-4111-8111-111111111111')
  const player = game.state.players[0]
  let captures = 0

  for (let index = 0; index < 1000; index++) {
    for (const predator of game.state.predators) game.removePredator(predator.id)
    Object.assign(player, { x: 0, y: 0, z: 0 })
    const predator = game.spawnPredator('human', 0, -0.9)
    predator.angle = 0
    game.step(1 / 60)
    if (Math.hypot(player.x, player.z) > 3) captures++
  }

  expect(captures).toBe(1000)
  expect(game.state.discoveries).toHaveLength(1)
  expect(game.state.discoveries?.[0].count).toBe(1000)
  const wire = { v: 1, type: 'snapshot', sequence: 1000, playerId: player.id, data: packSnapshot(game.state) }
  expect(new TextEncoder().encode(JSON.stringify(wire)).length).toBeLessThan(MAX_PAYLOAD_BYTES)
})
