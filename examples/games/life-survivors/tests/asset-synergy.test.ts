import { expect, test } from 'vitest'
import { Game } from '../src/game'

test.each(['w_savings'])('%s keeps actual damage unchanged when a knowledge weapon is added', (weapon) => {
  const fire = (seed: number, knowledge: boolean) => {
    const game = new Game(seed)
    const player = game.addPlayer('player', 'p_gone')!
    player.birthPick = false
    player.pending = 0
    player.choices = []
    player.weapons = [
      { id: weapon, lv: 1, cd: 0, held: 0, damage: 0 },
      { id: knowledge ? 'w_study' : 'w_love', lv: 1, cd: 100, held: 0, damage: 0 }
    ]
    game.targetPopulation = () => 0
    game.tick(0)
    const shot = game.state.shots.find((entry) => entry.weapon === weapon)!
    const face = shot.v
    const initialDamage = shot.damage
    const enemy = game.spawnEnemy('germ', player.x + 10, player.y)!
    enemy.hp = enemy.maxHp = 1_000_000
    shot.aux = 0
    game.tick(0)
    return { face, initialDamage, damage: 1_000_000 - enemy.hp }
  }

  for (const seed of [1, 2, 3, 4, 5]) {
    const base = fire(seed, false)
    const boosted = fire(seed, true)
    expect(base.damage).toBeGreaterThan(0)
    expect(boosted.face).toBe(base.face)
    expect(boosted.initialDamage).toBeCloseTo(base.initialDamage)
    expect(boosted.damage).toBeCloseTo(base.damage)
  }
})
