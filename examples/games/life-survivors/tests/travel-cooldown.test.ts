import { expect, test } from 'vitest'
import { Game, weaponStats } from '../src/game'
import { readView, toView } from '../src/view'

function setup(speedLevel = 0) {
  const game = new Game(42)
  const player = game.addPlayer('a', 'p_gone')!
  player.weapons = [{ id: 'w_travel', lv: 1, cd: 0, held: 0, damage: 0 }]
  player.passives = speedLevel ? [{ id: 'p_curious', lv: speedLevel }] : []
  return { game, player, weapon: player.weapons[0] }
}

test('travel cooldown starts only after its projectiles cross the screen', () => {
  const { game, player, weapon } = setup()
  game['fireWeapons'](0)
  const cooldown = weaponStats(player, weapon).cooldown
  expect(weapon.cd).toBe(cooldown)
  expect(readView(toView(game.state))).toBeDefined()
  game['moveShots'](1)
  game['fireWeapons'](1)
  expect(weapon.cd).toBe(cooldown)
  expect(game.state.shots).toHaveLength(1)
  game['moveShots'](2)
  expect(game.state.shots).toHaveLength(0)
  game['fireWeapons'](cooldown / 2)
  expect(game.state.shots).toHaveLength(0)
  game['fireWeapons'](cooldown / 2 + 0.01)
  expect(game.state.shots).toHaveLength(1)
})

test('faster projectiles reduce the time between travel activations', () => {
  const crossingTime = (speedLevel: number) => {
    const { game } = setup(speedLevel)
    game['fireWeapons'](0)
    let steps = 0
    while (game.state.shots.length && steps < 100) {
      game['moveShots'](0.1)
      steps++
    }
    expect(game.state.shots).toHaveLength(0)
    return steps
  }
  expect(crossingTime(4)).toBeLessThan(crossingTime(0))
})
