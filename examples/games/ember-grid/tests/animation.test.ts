import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { depth, route, effectKind, actionChange } from '../src/animation'
import { ROLES, chapterRoles } from '../src/stage'
import { UNIT_MODEL_CATALOG } from '../../tower_diffence_with_jev/src/rendering/models/catalog'
import { ATTACK_PROFILES } from '../../tower_diffence_with_jev/src/game/AttackProfiles'
import { attack, createGame, seeded, size } from '../src/game'
describe('3D presentation contracts', () => {
  it('uses the explicit target rather than attacker level-up growth', () => {
    const game = createGame(0, 'balanced', undefined, seeded(7))
    const actor = game.units[0],
      target = game.units.find((unit) => unit.side === 'enemy')!
    actor.exp = 99
    target.x = actor.x + 1
    target.y = actor.y
    const before = game.units.map((unit) => ({ ...unit }))
    expect(attack(game, actor, target)).toBe(true)
    expect(actor.hp).toBe(before[0].hp + 1)
    expect(actionChange(before, { kind: 'attack', target })).toEqual({
      target,
      amount: before.find((unit) => unit.id === target.id)!.hp - target.hp
    })
  })
  it('prefers the stated damage over the HP actually lost', () => {
    const game = createGame(0, 'balanced', undefined, seeded(7))
    const target = game.units.find((unit) => unit.side === 'enemy')!
    const before = game.units.map((unit) => ({ ...unit }))
    target.hp = 0
    expect(actionChange(before, { kind: 'attack', target, amount: 99 }).amount).toBe(99)
    expect(actionChange(before, { kind: 'attack', target }).amount).toBe(before.find((u) => u.id === target.id)!.hp)
  })
  it('loads only the roles deployed in each chapter', () => {
    expect(chapterRoles(createGame(0)).sort()).toEqual([...ROLES].sort())
    expect(chapterRoles(createGame(3))).toEqual(expect.arrayContaining(['healer', 'slime', 'bat']))
    expect(chapterRoles(createGame(4))).toEqual(expect.arrayContaining(['healer', 'wraith', 'shaman', 'beetle']))
    expect(chapterRoles(createGame(5))).toEqual(expect.arrayContaining(['healer', 'ogre', 'dragon']))
  })
  it('selects projectile kinds from role and range', () => {
    expect(effectKind('soldier', 1)).toBe('contact')
    expect(effectKind('archer', 3)).toBe('arrow')
    for (const role of ['mage', 'shaman', 'wraith']) expect(effectKind(role, 2)).toBe('spell')
    expect(effectKind('dragon', 3)).toBe('fireball')
  })
  it('orders cells back to front', () => {
    expect(depth({ x: size - 1, y: 0 })).toBe(0)
    expect(depth({ x: 0, y: size - 1 })).toBe(2 * (size - 1))
    expect(depth({ x: 2, y: 3 })).toBeLessThan(depth({ x: 2, y: 4 }))
    expect(depth({ x: 2, y: 3 })).toBeLessThan(depth({ x: 1, y: 3 }))
  })
  it('walks around occupied cells and rocks using reachable geometry', () => {
    const g = createGame(),
      u = g.units[0]
    const path = route(g, g.units, u, { x: 2, y: 3 })
    expect(path.at(-1)).toMatchObject({ x: 2, y: 3 })
    path.slice(1).forEach((p, i) => {
      expect(Math.abs(p.x - path[i].x) + Math.abs(p.y - path[i].y)).toBe(1)
      expect(g.rocks.has(`${p.x},${p.y}`)).toBe(false)
      expect(g.units.some((other) => other.id !== u.id && other.x === p.x && other.y === p.y)).toBe(false)
    })
    expect(route(g, g.units, g.units[1], { x: 1, y: 6 })).toHaveLength(4)
  })
  it('every role has tracked idle/walk/attack glTF sources and a contact inside its attack clip', () => {
    const tracked = execFileSync('git', ['ls-files', 'public/tower-defense-art/models'], { encoding: 'utf8' })
    for (const role of ROLES) {
      const definition = UNIT_MODEL_CATALOG[role]!
      for (const motion of ['idle', 'walk', 'attack'] as const) {
        const source = definition.clips[motion]!
        const file = source.url.slice(source.url.indexOf('tower-defense-art/'))
        expect(tracked).toContain(`public/${file}`)
        expect(statSync(`public/${file}`).size).toBeGreaterThan(100_000)
      }
      const { cueMs, durationMs } = ATTACK_PROFILES[role]
      expect(cueMs).toBeGreaterThan(0)
      expect(cueMs).toBeLessThan(durationMs)
    }
  })
})
