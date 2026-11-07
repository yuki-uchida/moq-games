import { expect } from 'vitest'
import { Game, RULES, retryState } from '../src/game'
import { GRASS, heightAt } from '../src/map'
import { BURROW, HAVEN } from '../src/campaign'
import { idle, steer } from './bot'

// Measured play length: a cautious bot that hides in grass or the den when hunted plays every season
// against the full predator roster, retrying a lost season like a player would from the result screen.
export function playCampaign(seed: number) {
  let game = new Game(seed)
  game.addPlayer('rabbit', 'Rabbit')
  let player = game.state.players[0]
  let checkpoint = structuredClone(game.state)
  let retries = 0
  let calmAt = 0
  const near = (point: { x: number; z: number }) => Math.hypot(point.x - player.x, point.z - player.z)
  const nearest = <T extends { x: number; z: number }>(items: T[]) =>
    items.sort((first, second) => near(first) - near(second))[0]
  for (let frame = 0; frame < 60 * 60 * 60; frame++) {
    if (game.state.phase === 'lost' && retries < 5) {
      retries++
      const next = new Game(seed + retries)
      next.state = retryState(checkpoint, game.state)
      game = next
      player = game.state.players[0]
    }
    if (game.state.phase !== 'playing') break
    if (game.state.chapter > checkpoint.chapter) checkpoint = structuredClone(game.state)
    const { chapter } = game.state
    const hungry =
      player.foodEaten < RULES.requiredFood || player.hunger < (chapter === 2 && !player.pregnant ? 60 : 35)
    const food = nearest(
      game.state.foods.filter((entry) => entry.active && Math.abs(entry.y - heightAt(entry.x, entry.z)) < 0.1)
    )
    const straw = nearest(game.state.straws.filter((entry) => entry.active))
    const lagging = game.state.kits
      .filter((kit) => kit.status === 'follow' || kit.status === 'wait')
      .sort((first, second) => near(second) - near(first))[0]
    if (game.state.predators.some((predator) => predator.targetId === player.id)) calmAt = game.state.time + 8
    const wary = game.state.time < calmAt
    const grass = nearest(GRASS.map((patch) => ({ x: patch.ax, z: patch.az })))
    const cover = near(BURROW) < Math.min(25, near(grass) + 8) ? BURROW : grass
    const target =
      wary && near(cover) < 30
        ? cover
        : player.health < 40 && chapter !== 3
          ? BURROW
          : hungry && food && !player.carrying
            ? food
            : chapter === 1 && !player.carrying && straw
              ? straw
              : chapter === 3
                ? lagging && near(lagging) > 3
                  ? lagging
                  : HAVEN
                : BURROW
    const route = steer(player, target)
    const resting = (target === BURROW || target === cover) && route.left < 1
    const threatNear = game.state.predators.some((predator) => predator.kind !== 'crocodile' && near(predator) < 14)
    game.setInput(player.id, {
      ...idle,
      ...(resting ? {} : { moveX: route.moveX, moveZ: route.moveZ }),
      sprint: !wary && !threatNear && chapter !== 3 && route.left > 5
    })
    game.step(1 / 60)
  }
  console.info(`forest cautious seed ${seed}: ${(game.state.time / 60).toFixed(1)} min`)
  expect(game.state.phase).toBe('won')
  expect(game.state.kits.some((kit) => kit.status === 'safe')).toBe(true)
  expect(game.state.time).toBeGreaterThan(22 * 60)
  expect(game.state.time).toBeLessThan(60 * 60)
}
