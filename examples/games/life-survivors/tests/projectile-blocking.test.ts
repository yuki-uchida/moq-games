import { expect, test } from 'vitest'
import { Game, type Bullet } from '../src/game'

test.each(['w_friend', 'w_pet', 'w_love'])('%s and enemy projectiles', (weapon) => {
  const game = new Game(5)
  const player = game.addPlayer('a', 'p_gone')!
  player.birthPick = false
  player.pending = 0
  player.choices = []
  player.weapons = [{ id: weapon, lv: 1, cd: 0, held: 0, damage: 0 }]
  game.tick(0)
  const shot = game.state.shots[0]
  if (weapon === 'w_love') shot.x += 500
  player.weapons[0].cd = 100
  const bullet: Bullet = { x: shot.x, y: shot.y, vx: 0, vy: 0, r: 7, damage: 10, life: 1, kind: 0, src: 'girlfriend' }
  const distant = { ...bullet, x: shot.x + shot.r + bullet.r + 1 }
  game.state.bullets = [bullet, distant]
  game.tick(0)
  expect(game.state.shots).toContain(shot)
  expect(game.state.bullets).toContain(distant)
  if (weapon === 'w_love') expect(game.state.bullets).toContain(bullet)
  else expect(game.state.bullets).not.toContain(bullet)
})
