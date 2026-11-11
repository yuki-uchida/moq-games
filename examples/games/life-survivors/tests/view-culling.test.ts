import { expect, test } from 'vitest'
import { ENEMIES } from '../src/data'
import { Game, VIEW_HALF } from '../src/game'
import { SEND_MARGIN, STRIDE, toView } from '../src/view'

test('snapshots leave out what is off every screen, but keep bosses wherever they are', () => {
  const game = new Game(1)
  const a = game.addPlayer('a')!
  const b = game.addPlayer('b')!
  game.state.enemies = []
  game.state.gems = []
  b.x = a.x + 3000
  b.y = a.y
  const edge = VIEW_HALF.x + SEND_MARGIN
  const crowd = ENEMIES.find((enemy) => enemy.behavior !== 'boss')!.id
  const boss = ENEMIES.find((enemy) => enemy.behavior === 'boss')!.id
  const nearA = game.spawnEnemy(crowd, a.x + edge - 10, a.y)!
  const nearB = game.spawnEnemy(crowd, b.x - edge + 10, b.y)!
  const between = game.spawnEnemy(crowd, a.x + 1500, a.y)!
  const farBoss = game.spawnEnemy(boss, a.x + 1500, a.y + 2000)!
  game.state.gems.push({ x: a.x, y: a.y + 50, v: 1 } as never, { x: a.x + 1500, y: a.y, v: 1 } as never)
  const view = toView(game.state)
  const ids = view.enemies.filter((_, i) => i % STRIDE.enemies === 0)
  expect(ids.sort()).toEqual([nearA.id, nearB.id, farBoss.id].sort())
  expect(ids).not.toContain(between.id)
  expect(view.gems).toEqual([Math.round(a.x), Math.round(a.y + 50), 1])
})
