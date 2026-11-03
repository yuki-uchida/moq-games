import { describe, expect, test } from 'vitest'
import { PARENTS, TALENT_WEAPONS } from '../src/data'
import { Game } from '../src/game'
import { botInput } from './bot'

const early = new Set(TALENT_WEAPONS.filter((def) => def.minAge <= 6).map((def) => def.id))

describe('蒸発済み: 自立', () => {
  test('the first hand at birth is three early talents and picking one gives it at lv 1', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = new Game(seed)
      const player = game.addPlayer('a', 'p_gone')!
      expect(player.weapons).toEqual([])
      game.tick(1 / 60)
      expect(player.choices).toHaveLength(3)
      const ids = player.choices.map((choice) => {
        expect(choice.startsWith('w:')).toBe(true)
        return choice.slice(2)
      })
      expect(new Set(ids).size).toBe(3)
      for (const id of ids) expect(early.has(id)).toBe(true)
      const chosen = ids[1]
      game.choose(player, 1)
      expect(player.weapons.map((w) => [w.id, w.lv])).toEqual([[chosen, 1]])
      // Nothing more is owed afterwards.
      game.tick(1 / 60)
      expect(player.choices).toEqual([])
    }
  })

  test('other parents get no birth hand', () => {
    for (const parent of PARENTS.filter((p) => p.id !== 'p_gone')) {
      const game = new Game(7)
      const player = game.addPlayer('a', parent.id)!
      game.tick(1 / 60)
      expect(player.choices).toEqual([])
      expect(player.pending).toBe(0)
    }
  })

  test('the smart bot points a ready beam toward a safely distant enemy', () => {
    const game = new Game(39)
    const player = game.addPlayer('a', 'p_gone')!
    player.weapons.push({ id: 'w_reading', lv: 1, cd: 0.05, held: 0, damage: 0 })
    game.spawnEnemy('germ', player.x + 200, player.y)
    const input = botInput(game, player, 'smart')
    expect(input.x).toBeCloseTo(1)
    expect(input.y).toBeCloseTo(0)
  })

  test('without injected experience a smart bot gets going within 180 s', () => {
    const report: string[] = []
    for (const seed of [39, 46, 50, 1, 2, 3, 4]) {
      const game = new Game(seed)
      const player = game.addPlayer('a', 'p_gone')!
      while (game.state.phase === 'playing' && game.state.time < 180) {
        game.setInput(player.id, botInput(game, player, 'smart'))
        for (let i = 0; i < 6; i++) game.tick(1 / 60)
      }
      const talents = player.weapons.filter((w) => w.id !== 'p_gone')
      const best = Math.max(0, ...player.weapons.map((w) => w.lv))
      report.push(
        `seed ${seed}: kills ${game.state.kills} level ${game.state.level} weapons ${player.weapons.length} best lv ${best}`
      )
      expect(game.state.phase, `seed ${seed}`).toBe('playing')
      expect(game.state.kills, `seed ${seed} kills`).toBeGreaterThan(0)
      expect(game.state.level, `seed ${seed} level`).toBeGreaterThan(1)
      expect(talents.length, `seed ${seed} weapons`).toBeGreaterThanOrEqual(1)
      expect(best, `seed ${seed} best lv`).toBeGreaterThanOrEqual(2)
    }
    process.stderr.write(report.join('\n'))
  })
})
