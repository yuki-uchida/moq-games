import { describe, expect, test } from 'vitest'
import { PARENTS, TALENT_CATEGORIES, TALENT_WEAPONS } from '../src/data'
import { Game, RAID, raidReach } from '../src/game'
import { botInput } from './bot'

const early = new Set(TALENT_WEAPONS.filter((def) => def.minAge <= 6).map((def) => def.id))

describe('ヤンキー親', () => {
  /** A yankee parent about to fire, with unkillable bullies held in place at the given offsets. */
  function raid(seed: number, offsets: [number, number][]) {
    const game = new Game(seed)
    const player = game.addPlayer('a', 'p_yankee')!
    for (const c of TALENT_CATEGORIES) player.talents[c] = 1
    const posts = offsets.map(([dx, dy]) => {
      const enemy = game.spawnEnemy('bully', player.x + dx, player.y + dy)!
      enemy.hp = enemy.maxHp = 1e9
      return { enemy, x: enemy.x, y: enemy.y }
    })
    /** Ticks until the first raid is over, returning each raid shot's path from the owner. */
    const watch = () => {
      const paths = new Map<number, { d: number; a: number }[]>()
      for (let i = 0; i < 60 * 3; i++) {
        player.hp = player.maxHp
        for (const p of posts) {
          p.enemy.x = p.x
          p.enemy.y = p.y
          p.enemy.kx = p.enemy.ky = 0
        }
        game.tick(1 / 60)
        const shots = game.state.shots.filter((s) => s.weapon === 'p_yankee')
        if (!shots.length && paths.size) break
        for (const s of shots) {
          const path = paths.get(s.id) ?? []
          path.push({ d: Math.hypot(s.x - player.x, s.y - player.y), a: Math.atan2(s.y - player.y, s.x - player.x) })
          paths.set(s.id, path)
        }
      }
      return [...paths.values()].map((path) => {
        const top = path.reduce((a, b) => (b.d > a.d ? b : a))
        return { farthest: top.d, bearing: top.a, last: path[path.length - 1].d }
      })
    }
    return { game, player, posts, watch }
  }

  test('a physical parent card, unlike 蒸発済み', () => {
    const parent = PARENTS.find((entry) => entry.id === 'p_yankee')!
    expect(parent.category).toBe('sports')
    expect(parent.behavior).toBe('raid')
    expect(new Game(1).addPlayer('a', parent.id)!.weapons.map((weapon) => weapon.id)).toEqual(['p_yankee'])
    expect(new Game(1).addPlayer('a', 'p_gone')!.weapons).toEqual([])
  })

  test('a raid runs out, kicks a little further and ends back at the owner without jumps', () => {
    expect(raidReach(0)).toBe(0)
    expect(raidReach(RAID.kick)).toBeCloseTo(0.8)
    expect(raidReach(RAID.back)).toBeCloseTo(1)
    expect(raidReach(1)).toBeCloseTo(0)
    for (let k = 1; k <= 100; k++) expect(Math.abs(raidReach(k / 100) - raidReach((k - 1) / 100))).toBeLessThan(0.05)
  })

  test('storms at the nearest enemy, kicks it and swaggers back to the owner', () => {
    const { posts, watch } = raid(11, [
      [130, 0],
      [-260, 0]
    ])
    const [only, ...more] = watch()
    expect(more).toEqual([])
    // A stride short of the enemy at 130, so the kicking sole lands on it.
    expect(only.bearing).toBeCloseTo(0, 1)
    expect(only.farthest).toBeGreaterThan(105)
    expect(only.farthest).toBeLessThan(125)
    expect(only.last).toBeLessThan(15)
    expect(posts[0].enemy.hp).toBeLessThan(1e9)
    expect(posts[1].enemy.hp).toBe(1e9)
  })

  test('with nobody near it swaggers out the way the owner faces and back', () => {
    const { player, watch } = raid(12, [])
    player.fx = 0
    player.fy = 1
    const [only] = watch()
    expect(only.bearing).toBeCloseTo(Math.PI / 2, 1)
    expect(only.farthest).toBeGreaterThan(90)
    expect(only.farthest).toBeLessThan(110)
    expect(only.last).toBeLessThan(15)
  })

  test('器用 sends one yankee parent at each of the nearest enemies', () => {
    const { player, watch } = raid(13, [
      [120, 0],
      [0, 150],
      [-300, 0]
    ])
    player.passives = [{ id: 'p_clever', lv: 1 }]
    const bearings = watch()
      .map((path) => path.bearing)
      .sort((a, b) => a - b)
    expect(bearings).toHaveLength(2)
    expect(bearings[0]).toBeCloseTo(0, 1)
    expect(bearings[1]).toBeCloseTo(Math.PI / 2, 1)
  })
})

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
  }, 20_000)
})
