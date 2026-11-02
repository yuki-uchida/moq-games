import { describe, expect, it } from 'vitest'
import { createGame, damage, key, enemyActionPositions, size } from '../src/game'
import { dangerZone, enemyThreat, forecast } from '../src/tactics'

describe('tactical previews', () => {
  it('uses the same enemy positions for individual and danger displays', () => {
    for (const ai of ['charge', 'guard', 'hold'] as const) {
      const game = createGame(5, 'balanced')
      const enemy = game.units.find((unit) => unit.ai === 'hold')!
      enemy.ai = ai
      game.units = game.units.filter((unit) => unit.side === 'ally' || unit === enemy)
      const positions = enemyActionPositions(game, enemy)
      expect(positions.size > 1).toBe(ai !== 'hold')
      const expected = new Set<string>()
      for (const position of positions.keys()) {
        const [x, y] = position.split(',').map(Number)
        for (let row = 0; row < size; row++)
          for (let column = 0; column < size; column++)
            if (Math.abs(x - column) + Math.abs(y - row) <= enemy.range) expected.add(key(column, row))
      }
      expect(dangerZone(game)).toEqual(expected)
      expect(enemyThreat(game, enemy)).toEqual(dangerZone(game))
    }
  })
  it('matches combat damage and displays relevant modifiers', () => {
    const game = createGame(0, 'balanced')
    const attacker = game.units.find((unit) => unit.role === 'archer')!
    const target = game.units.find((unit) => unit.role === 'wolf')!
    target.def = 2
    target.armor = 2
    game.groves.add(key(target.x, target.y))
    const preview = forecast(game, attacker, target)
    expect(preview.amount).toBe(damage(attacker, target, game))
    expect(preview.after).toBe(Math.max(0, target.hp - preview.amount))
    expect(preview.chips).toEqual(['相性 +3', '盾 −2', '木立 −2', '防御 −2'])
  })

  it('includes enemy origins and excludes defeated enemies', () => {
    const game = createGame(0, 'balanced')
    const enemies = game.units.filter((unit) => unit.side === 'enemy')
    const zone = dangerZone(game)
    for (const enemy of enemies) expect(zone.has(key(enemy.x, enemy.y))).toBe(true)
    enemies.forEach((enemy) => (enemy.hp = 0))
    expect(dangerZone(game).size).toBe(0)
  })

  it('projects a holding boss only from its own cell', () => {
    const game = createGame(5, 'balanced')
    game.units = game.units.filter((unit) => unit.side === 'ally' || unit.ai === 'hold')
    const boss = game.units.find((unit) => unit.ai === 'hold')!
    const zone = dangerZone(game)
    for (const cell of zone) {
      const [x, y] = cell.split(',').map(Number)
      expect(Math.abs(x - boss.x) + Math.abs(y - boss.y)).toBeLessThanOrEqual(boss.range)
    }
    expect(zone.has(key(boss.x, boss.y))).toBe(true)
  })

  it('treats magic as ignoring armour and clamps lethal damage', () => {
    const game = createGame(0, 'balanced')
    const attacker = game.units.find((unit) => unit.role === 'mage')!
    const target = game.units.find((unit) => unit.side === 'enemy')!
    target.armor = 2
    target.hp = 1
    const result = forecast(game, attacker, target)
    expect(result.after).toBe(0)
    expect(result.chips).toContain('魔法は盾無視')
    expect(result.amount).toBe(damage(attacker, target, game))
  })
})
