import { describe, expect, it } from 'vitest'
import { createGame, damage, key } from '../src/game'
import { dangerZone, forecast } from '../src/tactics'

describe('tactical previews', () => {
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
