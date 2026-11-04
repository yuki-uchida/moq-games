import { describe, expect, test } from 'vitest'
import {
  ARSENAL_ENEMIES,
  BOSSES,
  BOSS_CROWD,
  DEATHS,
  PART1,
  STAGES,
  TAG_DEATHS,
  TAG_KILLER
} from '../../../../scripts/life-survivors-screen-data.mjs'
import { ENEMY_BY_ID, EVENTS, POOLS, ageAt, timeAtAge } from '../src/data'
import { Game } from '../src/game'

describe('review captures', () => {
  test('every configured scene and death uses an active enemy', () => {
    const kinds = [
      ...STAGES.flatMap(([, , enemies]) => enemies),
      ...BOSSES.map(([kind]) => kind),
      ...[...DEATHS, ...TAG_DEATHS, ...PART1].map(([, , kind]) => kind),
      ...Object.values(TAG_KILLER),
      ...BOSS_CROWD,
      ...ARSENAL_ENEMIES
    ]
    for (const kind of kinds) expect([kind, ENEMY_BY_ID.has(kind)]).toEqual([kind, true])
    for (const [tag, kind] of Object.entries(TAG_KILLER)) expect(ENEMY_BY_ID.get(kind)?.tag).toBe(tag)
  })

  test('stage captures use enemies from the appropriate age pool', () => {
    for (const [name, age, enemies] of STAGES) {
      const pool = POOLS.find((entry) => age < entry.untilAge)!.enemies
      for (const kind of enemies) expect([name, kind, pool.some(([id]) => id === kind)]).toEqual([name, kind, true])
    }
  })

  test.each([...DEATHS, ...TAG_DEATHS, ...PART1])('%s can actually produce its death', (_name, age, kind) => {
    const game = new Game(1)
    const player = game.addPlayer('capture', 'p_free')!
    game.state.time = timeAtAge(Number(age)) + 1
    expect(ageAt(game.state.time)).toBe(age)
    game.state.eventIndex = EVENTS.length
    player.weapons = []
    player.choices = []
    player.hp = 0.01
    if (kind === 'temptation') player.dating = true
    expect(game.spawnEnemy(kind, player.x + 4, player.y)).toBeDefined()
    for (let tick = 0; tick < 9 && !player.downed; tick++) game.tick(1 / 60)
    expect([player.downed, player.killer]).toEqual([true, kind])
  })
})
