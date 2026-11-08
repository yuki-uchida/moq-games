import { expect, test } from 'vitest'
import { EVENTS, PARENTS } from '../src/data'
import { Game } from '../src/game'
import { readView, toView } from '../src/view'

const care = EVENTS.findIndex((event) => event.boss === 'b_care')
const parents = PARENTS.filter((parent) => parent.id !== 'p_gone').map((parent) => parent.id)

test.each(parents)('%s keeps its dealt damage for the result after the parent dies', (parent) => {
  const game = new Game(3)
  const player = game.addPlayer('a', parent)!
  for (let step = 0; step < 300 && !player.weapons[0].damage; step++) {
    if (game.state.enemies.length < 6) game.spawnEnemy('germ', player.x + 40, player.y + (step % 3) * 20 - 20)
    game.tick(0.05)
  }
  const dealt = player.weapons[0].damage
  expect(dealt).toBeGreaterThan(0)
  expect(player.parentDamage).toBe(dealt)
  expect(readView(JSON.parse(JSON.stringify(toView(game.state))))?.players[0].parentDamage).toBe(Math.round(dealt))
  game.state.time = EVENTS[care].at - 0.001
  game.state.eventIndex = care
  game.tick(0.001)
  expect(player.parentDeath).toBeDefined()
  expect(player.weapons.some((weapon) => weapon.id === parent)).toBe(false)
  expect(player.parentDamage).toBeGreaterThanOrEqual(dealt)
  const view = JSON.parse(JSON.stringify(toView(game.state)))
  expect(readView(view)?.players[0].parentDamage).toBe(Math.round(player.parentDamage!))
  for (const bad of [-1, 1.5, '3', Infinity]) {
    const copy = structuredClone(view)
    copy.players[0].parentDamage = bad
    expect(readView(copy)).toBeUndefined()
  }
  const orphan = structuredClone(view)
  orphan.players[0].parent = 'p_gone'
  delete orphan.players[0].parentDeath
  expect(readView(orphan)).toBeUndefined()
})

test('a player born without a parent never records parent damage', () => {
  const game = new Game(4)
  const player = game.addPlayer('a', 'p_gone')!
  game.tick(0.05)
  expect(player.parentDamage).toBeUndefined()
  expect(toView(game.state).players[0].parentDamage).toBeUndefined()
})
