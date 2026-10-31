import { plan } from './strategy'
import { describe, it, expect } from 'vitest'
import {
  attack,
  beginAlly,
  beginEnemy,
  createGame,
  damage,
  distance,
  enemyStep,
  move,
  reachable,
  rocks,
  recover
} from '../src/game'
describe('Ember Grid rules', () => {
  it('healing consumes a shared charge and action, and formations trade speed for health', () => {
    const g = createGame(1, 'guard'),
      u = g.units[0]
    expect(u.hp).toBe(20)
    expect(u.move).toBe(2)
    expect(recover(g, u)).toBe(false)
    u.hp = 5
    expect(recover(g, u)).toBe(true)
    expect(u.hp).toBe(13)
    expect(g.potions).toBe(1)
    expect(u.done).toBe(true)
    expect(recover(g, u)).toBe(false)
    expect(attack(g, u, g.units[3])).toBe(false)
  })
  it('bows counter wolves; magic bypasses armor; map state stays independent', () => {
    const g = createGame(),
      bow = g.units[1],
      wolf = g.units[3],
      mage = g.units[2],
      guard = g.units[5]
    wolf.x = 0
    wolf.y = 0
    expect(damage(bow, wolf, g)).toBe(8)
    guard.x = 0
    guard.y = 0
    expect(damage(mage, guard, g)).toBe(7)
    expect(damage(g.units[0], guard, g)).toBe(5)
    const other = createGame(2)
    other.rocks.clear()
    expect(g.rocks.size).toBe(4)
    expect(createGame(2).units.filter((u) => u.side === 'enemy')).toHaveLength(5)
  })

  it('blocks rocks, occupied cells, double moves and out of range attacks', () => {
    const g = createGame(),
      u = g.units[0]
    expect(move(g, u, 3, 1)).toBe(false)
    expect(move(g, u, 0, 2)).toBe(false)
    expect(attack(g, u, g.units[3])).toBe(false)
    expect(move(g, u, 2, 3)).toBe(true)
    expect(move(g, u, 3, 3)).toBe(false)
    expect([...reachable(g, u).keys()].some((k) => rocks.has(k))).toBe(false)
  })
  it('uses cover, consumes attacks and resolves victory', () => {
    const g = createGame(),
      u = g.units[0],
      e = g.units[3]
    e.x = 1
    e.y = 2
    u.x = 1
    u.y = 3
    expect(damage(u, e)).toBe(4)
    expect(attack(g, u, e)).toBe(true)
    expect(attack(g, u, e)).toBe(false)
    g.units.filter((u) => u.side === 'enemy').forEach((u) => (u.hp = 0))
    e.hp = 1
    u.done = false
    attack(g, u, e)
    expect(g.phase).toBe('won')
  })
  it('enemy phases progress and passive play loses', () => {
    const g = createGame()
    for (let i = 0; i < 30 && g.phase !== 'lost'; i++) {
      beginEnemy(g)
      g.units.filter((u) => u.side === 'enemy').forEach((u) => enemyStep(g, u))
      beginAlly(g)
    }
    expect(g.phase).toBe('lost')
    expect(g.turn).toBeGreaterThan(1)
  })
  for (const stage of [0, 1, 2])
    for (const formation of ['balanced', 'guard'] as const)
      it(`mission ${stage + 1} is winnable with ${formation}`, () => {
        const g = createGame(stage, formation)
        for (let turn = 0; turn < 25 && g.phase !== 'won' && g.phase !== 'lost'; turn++) {
          for (const u of g.units
            .filter((u) => u.side === 'ally' && u.hp > 0)
            .sort(
              (a, b) => ['archer', 'mage', 'soldier'].indexOf(a.role) - ['archer', 'mage', 'soldier'].indexOf(b.role)
            )) {
            if (u.hp <= u.max - 7 && recover(g, u)) continue
            const { position: p, target } = plan(g, u)
            move(g, u, p.x, p.y)
            if (target) attack(g, u, target)
            if (g.phase === 'won') break
          }
          if (g.phase === 'ally') {
            beginEnemy(g)
            g.units.filter((u) => u.side === 'enemy').forEach((u) => enemyStep(g, u))
            beginAlly(g)
          }
        }
        expect(g.phase).toBe('won')
      })
})
