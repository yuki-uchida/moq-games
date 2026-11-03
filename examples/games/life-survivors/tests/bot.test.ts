import { describe, expect, test } from 'vitest'
import { Game } from '../src/game'
import { botInput } from './bot'

describe('smart bot collision avoidance', () => {
  test('a ready beam does not steer into a nearby enemy', () => {
    const game = new Game(39)
    const player = game.addPlayer('a', 'p_edu')!
    player.weapons.push({ id: 'w_reading', lv: 1, cd: 0.05, held: 0, damage: 0 })
    game.spawnEnemy('germ', player.x + 30, player.y)
    game.spawnEnemy('germ', player.x + 200, player.y)
    const before = JSON.stringify(game.state)
    const input = botInput(game, player, 'smart')
    expect(input.x).toBeLessThan(0.5)
    expect(Math.hypot(input.x, input.y)).toBeCloseTo(1)
    expect(JSON.stringify(game.state)).toBe(before)
  })

  test('opposed incoming bullets do not cancel the dodge into standing still', () => {
    const game = new Game(1)
    const player = game.addPlayer('a', 'p_edu')!
    for (const side of [-1, 1])
      game.state.bullets.push({
        x: player.x + side * 35,
        y: player.y,
        vx: -side * 200,
        vy: 0,
        r: 7,
        damage: 4,
        life: 1,
        kind: 0,
        src: 'germ'
      })
    const input = botInput(game, player, 'smart')
    expect(Math.abs(input.y)).toBeCloseTo(1)
    game.setInput(player.id, input)
    for (let frame = 0; frame < 6; frame++) game.tick(1 / 60)
    expect(player.hp).toBe(player.maxHp)
    expect(player.invuln).toBe(0)
  })

  test('safe collection input and the game random stream are unchanged', () => {
    const game = new Game(7)
    const control = new Game(7)
    const player = game.addPlayer('a', 'p_gone')!
    control.addPlayer('a', 'p_gone')
    game.state.gems.push({ x: player.x + 100, y: player.y, v: 1, pull: false })
    const input = botInput(game, player, 'smart')
    expect(input.x).toBe(1)
    expect(input.y).toBe(0)
    expect(game.random()).toBe(control.random())
  })
})
