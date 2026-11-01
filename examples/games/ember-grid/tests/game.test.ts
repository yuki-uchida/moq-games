import { plan } from './strategy'
import { describe, it, expect } from 'vitest'
import {
  allyTurnOver,
  attack,
  attackRange,
  beginAlly,
  beginEnemy,
  createGame,
  damage,
  distance,
  enemyStep,
  finished,
  key,
  move,
  path,
  reachable,
  rocks,
  recover,
  carry,
  expFor,
  grant,
  healExp,
  mvp,
  rollGrowth,
  seeded
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
  it('allies pass through allies but stop only on empty cells; foes and rocks still block', () => {
    const g = createGame(),
      neri = g.units[1]
    // Neri (0,2) crosses Rio (0,3) and Mina (0,4) to reach (0,5) in three steps.
    expect(path(g, neri, { x: 0, y: 5 })).toEqual([
      { x: 0, y: 2 },
      { x: 0, y: 3 },
      { x: 0, y: 4 },
      { x: 0, y: 5 }
    ])
    expect(reachable(g, neri).has('0,3')).toBe(false)
    expect(move(g, neri, 0, 3)).toBe(false)
    expect(move(g, neri, 0, 5)).toBe(true)
    // An enemy wall is not crossable for allies, but enemies cross each other.
    const h = createGame(),
      rio = h.units[0],
      [wolf, scout] = [h.units[3], h.units[4]]
    Object.assign(wolf, { x: 1, y: 3 })
    Object.assign(scout, { x: 2, y: 3 })
    h.units[1].hp = h.units[2].hp = 0
    expect(path(h, rio, { x: 2, y: 3 })).toEqual([{ x: 0, y: 3 }])
    expect(path(h, wolf, { x: 3, y: 3 }).map((p) => key(p.x, p.y))).toEqual(['1,3', '2,3', '3,3'])
    expect(reachable(h, wolf).has('0,3')).toBe(false)
  })
  it('attack range covers strikes after any legal move, excluding move cells', () => {
    const g = createGame(),
      rio = g.units[0]
    const range = attackRange(g, rio)
    expect(range.has('4,3')).toBe(true)
    expect(range.has('5,3')).toBe(false)
    expect([...range].some((k) => reachable(g, rio).has(k))).toBe(false)
    expect(range.has('0,2')).toBe(false)
    move(g, rio, 2, 3)
    expect([...attackRange(g, rio)].sort()).toEqual(['1,3', '2,2', '2,4', '3,3'])
    rio.done = true
    expect(attackRange(g, rio).size).toBe(0)
  })
  it('the ally turn ends once every ally is spent or has nothing useful left', () => {
    const g = createGame(),
      [rio, neri, mina] = g.units
    expect(allyTurnOver(g)).toBe(false)
    neri.done = mina.done = true
    move(g, rio, 2, 3)
    expect(finished(g, rio)).toBe(true)
    expect(allyTurnOver(g)).toBe(true)
    rio.hp = 10
    expect(finished(g, rio)).toBe(false)
    g.potions = 0
    expect(finished(g, rio)).toBe(true)
    Object.assign(g.units[3], { x: 2, y: 4 })
    expect(finished(g, rio)).toBe(false)
    g.units[3].hp = 0
    neri.hp = 0
    expect(allyTurnOver(g)).toBe(true)
    beginEnemy(g)
    expect(allyTurnOver(g)).toBe(false)
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
        // Match the browser playthrough fixture; random growth changes this policy's outcome.
        const g = createGame(stage, formation, undefined, seeded(7))
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
describe('Ember Grid growth', () => {
  it('awards hit, defeat and recovery EXP scaled by level gap', () => {
    const g = createGame(),
      u = g.units[0],
      e = g.units[4]
    expect(expFor(u, e, false)).toBe(10)
    expect(expFor(u, e, true)).toBe(30)
    e.level = 4
    expect(expFor(u, e, false)).toBe(16)
    expect(expFor(u, e, true)).toBe(51)
    u.level = 10
    expect(expFor(u, e, false)).toBe(1)
    expect(expFor(u, e, true)).toBe(6)
    const h = createGame(),
      a = h.units[0],
      goblin = h.units[4]
    a.x = 4
    a.y = 4
    expect(attack(h, a, goblin)).toBe(true)
    expect(a.exp).toBe(10)
    expect(h.progress).toEqual({ id: 'a', from: 0, to: 10, level: 1 })
    goblin.hp = 1
    a.done = false
    attack(h, a, goblin)
    expect(a.exp).toBe(40)
    expect(a.kills).toBe(1)
    expect(a.gained).toBe(40)
    a.hp = 2
    a.done = false
    recover(h, a)
    expect(a.exp).toBe(40 + healExp)
    expect(h.units[3].exp).toBe(0)
  })
  it('levels up at 100 EXP with deterministic seeded growth rolls', () => {
    const roll = (seed: number) => {
      const g = createGame(0, 'balanced', undefined, seeded(seed)),
        u = g.units[2]
      u.exp = 95
      grant(g, u, 12)
      return { level: u.level, exp: u.exp, max: u.max, hp: u.hp, power: u.power, def: u.def, gains: g.progress!.gains }
    }
    expect(roll(7)).toEqual(roll(7))
    const r = roll(7)
    expect(r.level).toBe(2)
    expect(r.exp).toBe(7)
    expect(r.max - 10 + r.power - 7 + r.def).toBe(r.gains!.max + r.gains!.power + r.gains!.def)
    expect(r.hp).toBe(r.max)
    expect(rollGrowth('mage', () => 0)).toEqual({ max: 1, power: 1, def: 1 })
    expect(rollGrowth('mage', () => 0.99)).toEqual({ max: 0, power: 1, def: 0 })
    expect(rollGrowth('soldier', () => 0.99)).toEqual({ max: 1, power: 0, def: 0 })
    const rng = seeded(42)
    const ups = { max: 0, power: 0, def: 0 }
    for (let i = 0; i < 2000; i++) {
      const gains = rollGrowth('soldier', rng)
      ups.max += gains.max
      ups.def += gains.def
    }
    expect(ups.max / 2000).toBeGreaterThan(0.75)
    expect(ups.def / 2000).toBeGreaterThan(0.4)
  })
  it('carries level and stats into the next mission at full HP, without stacking the guard bonus', () => {
    const g = createGame(0, 'guard'),
      u = g.units[0]
    Object.assign(u, { level: 3, exp: 45, max: 23, hp: 2, power: 8, def: 2, kills: 4, gained: 90 })
    const roster = carry(g)
    expect(roster.a).toEqual({ level: 3, exp: 45, max: 19, power: 8, def: 2 })
    const next = createGame(1, 'guard', roster),
      a = next.units[0]
    expect([a.level, a.exp, a.max, a.hp, a.power, a.def]).toEqual([3, 45, 23, 23, 8, 2])
    expect([a.kills, a.gained, a.startLevel]).toEqual([0, 0, 3])
    expect(createGame(1, 'balanced', roster).units[0].max).toBe(19)
    expect(next.potions).toBe(2)
    const enemy = next.units[3]
    a.def = 3
    expect(damage(enemy, a, next)).toBe(enemy.power - 3)
  })
  it('names the MVP by defeats, then damage', () => {
    const g = createGame()
    g.units[1].kills = 2
    g.units[2].kills = 2
    g.units[2].dealt = 9
    expect(mvp(g).id).toBe('c')
  })
})
