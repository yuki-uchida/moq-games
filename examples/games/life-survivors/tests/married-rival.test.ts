import { expect, test } from 'vitest'
import { EVENTS } from '../src/data'
import { Game } from '../src/game'
import { readView, toView } from '../src/view'

test('a married player gets the rival without making an unmarried teammate its target', () => {
  const game = new Game(93)
  const married = game.addPlayer('married', 'p_free')!
  const single = game.addPlayer('single', 'p_free')!
  married.weapons.push({ id: 'w_love', lv: 2, cd: 100, held: 0, damage: 0 })
  const wedding = EVENTS.findIndex((event) => event.boss === 'b_wedding')
  game.state.eventIndex = wedding
  game.state.time = EVENTS[wedding].at - 0.01
  game.tick(0.02)
  expect([married.married, single.married]).toEqual([true, false])
  expect(readView(toView(game.state))).toBeDefined()

  game.state.enemies = []
  married.x = 100
  single.x = 0
  const health = single.hp
  const rival = game.spawnEnemy('temptation', single.x, single.y)!
  expect(rival.targetPlayer).toBe(married.id)
  game.tick(0.1)
  expect(single.hp).toBe(health)
  expect(rival.x).toBeGreaterThan(single.x)

  married.downed = true
  expect(game.spawnEnemy('temptation')).toBeUndefined()
  game.tick(0.1)
  expect(game.state.enemies).not.toContain(rival)
  expect(single.hp).toBe(health)
})
