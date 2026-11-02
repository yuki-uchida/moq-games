import { describe, expect, it } from 'vitest'
import { campaign } from '../src/campaign'
import {
  attack,
  beginAlly,
  beginEnemy,
  carry,
  createGame,
  enemyStep,
  finished,
  healForecast,
  healRange,
  lost,
  move,
  objectiveLabel,
  recover,
  seeded,
  staffHeal,
  type Formation,
  type Roster
} from '../src/game'
import { plan } from './strategy'
import { roleScale } from '../src/stage'

describe('campaign data', () => {
  it('keeps every campaign role within its intended presentation scale', () => {
    const roles = new Set(campaign.flatMap((chapter) => chapter.enemies.map((unit) => unit.role)))
    for (const role of [...roles, 'soldier', 'archer', 'mage', 'healer']) {
      expect(roleScale(role)).toBeGreaterThan(0)
      expect(roleScale(role)).toBeLessThanOrEqual(1)
    }
    expect(roleScale('slime')).toBeLessThan(roleScale('soldier'))
    expect(roleScale('bat')).toBeLessThan(roleScale('soldier'))
    expect(roleScale('dragon') * 1.25).toBe(1.25)
  })
  it('defines six chapters with valid terrain, deployment and enemy cells', () => {
    expect(campaign).toHaveLength(6)
    for (const chapter of campaign) {
      const rocks = new Set(chapter.rocks)
      const occupied = new Set<string>()
      for (const cell of [...chapter.deployment, ...chapter.enemies]) {
        expect(cell.x).toBeGreaterThanOrEqual(0)
        expect(cell.x).toBeLessThan(10)
        expect(cell.y).toBeGreaterThanOrEqual(0)
        expect(cell.y).toBeLessThan(10)
        const key = `${cell.x},${cell.y}`
        expect(rocks.has(key)).toBe(false)
        expect(occupied.has(key)).toBe(false)
        occupied.add(key)
      }
      expect(chapter.groves.every((cell) => !rocks.has(cell))).toBe(true)
      if (chapter.objective.type === 'boss') expect(chapter.enemies.filter((unit) => unit.boss)).toHaveLength(1)
    }
  })
})

describe('campaign rules', () => {
  it('heals injured allies after moving, forecasts and awards EXP', () => {
    const game = createGame(3),
      healer = game.units.find((unit) => unit.heal)!,
      ally = game.units[0]
    ally.hp -= 5
    expect(healRange(game, healer).has(`${ally.x},${ally.y}`)).toBe(true)
    expect(healForecast(healer, ally)).toEqual({ before: 11, after: 16 })
    healer.moved = true
    expect(finished(game, healer)).toBe(false)
    expect(staffHeal(game, healer, ally)).toBe(true)
    expect([ally.hp, healer.exp, healer.done]).toEqual([16, 10, true])
    expect(staffHeal(game, healer, ally)).toBe(false)
    healer.done = false
    expect(attack(game, healer, game.units.find((unit) => unit.side === 'enemy')!)).toBe(false)
  })
  it('holds position, alerts guards permanently, and charges', () => {
    const game = createGame(),
      enemy = game.units[3],
      ally = game.units[0]
    beginEnemy(game)
    enemy.ai = 'hold'
    const origin = [enemy.x, enemy.y]
    enemyStep(game, enemy)
    expect([enemy.x, enemy.y]).toEqual(origin)
    enemy.done = false
    enemy.ai = 'guard'
    enemy.move = 1
    enemyStep(game, enemy)
    expect([enemy.x, enemy.y]).toEqual(origin)
    enemy.done = false
    enemy.hp--
    enemyStep(game, enemy)
    expect(enemy.alerted).toBe(true)
    expect([enemy.x, enemy.y]).not.toEqual(origin)
    enemy.done = false
    enemy.ai = 'charge'
    const oldDistance = Math.abs(enemy.x - ally.x) + Math.abs(enemy.y - ally.y)
    enemyStep(game, enemy)
    expect(Math.abs(enemy.x - ally.x) + Math.abs(enemy.y - ally.y)).toBeLessThanOrEqual(oldDistance)
  })
  it('prefers lethal targets, then damage and lower HP', () => {
    const game = createGame(),
      enemy = game.units[3],
      [first, second, third] = game.units
    game.rocks.clear()
    game.groves.clear()
    Object.assign(enemy, { x: 5, y: 5, ai: 'hold', range: 3, power: 5 })
    Object.assign(first, { x: 4, y: 5, hp: 4, def: 1 })
    Object.assign(second, { x: 5, y: 4, hp: 5, def: 0 })
    Object.assign(third, { x: 6, y: 5, hp: 6, def: 0 })
    beginEnemy(game)
    enemyStep(game, enemy)
    expect(second.hp).toBe(0)
  })
  it('alerts a guard by proximity and retains that alert', () => {
    const game = createGame(),
      enemy = game.units[3]
    game.rocks.clear()
    Object.assign(enemy, { ai: 'guard', x: 7, y: 4, move: 2, range: 1 })
    Object.assign(game.units[0], { x: 4, y: 4 })
    beginEnemy(game)
    enemyStep(game, enemy)
    expect(enemy.alerted).toBe(true)
    const position = enemy.x
    game.units
      .filter((unit) => unit.side === 'ally')
      .forEach((unit) => {
        unit.x = 0
      })
    enemy.done = false
    enemyStep(game, enemy)
    expect(enemy.x).toBeLessThan(position)
  })
  it('uses damage then HP to select among nonlethal targets', () => {
    const game = createGame(),
      enemy = game.units[3],
      [first, second, third] = game.units
    game.groves.clear()
    Object.assign(enemy, { x: 5, y: 5, ai: 'hold', range: 3, power: 4 })
    Object.assign(first, { x: 4, y: 5, hp: 7, def: 1 })
    Object.assign(second, { x: 5, y: 4, hp: 9, def: 0 })
    Object.assign(third, { x: 6, y: 5, hp: 8, def: 0 })
    beginEnemy(game)
    enemyStep(game, enemy)
    expect([first.hp, second.hp, third.hp]).toEqual([7, 9, 4])
  })
  it('resolves rout, boss, seize and survival at the correct boundaries', () => {
    const rout = createGame()
    rout.units.filter((unit) => unit.side === 'enemy').forEach((unit) => (unit.hp = 0))
    const enemy = rout.units[3]
    enemy.hp = 1
    Object.assign(rout.units[0], { x: enemy.x - 1, y: enemy.y })
    attack(rout, rout.units[0], enemy)
    expect(rout.phase).toBe('won')
    const boss = createGame(2),
      bossUnit = boss.units.find((unit) => unit.boss)!
    Object.assign(boss.units[0], { x: bossUnit.x - 1, y: bossUnit.y })
    bossUnit.hp = 1
    expect(boss.phase).toBe('ally')
    attack(boss, boss.units[0], bossUnit)
    expect(boss.phase).toBe('won')
    const seize = createGame(3),
      objective = campaign[3].objective
    if (objective.type !== 'seize') throw new Error('missing seize')
    expect(objectiveLabel(seize)).toBe('◎ 制圧')
    beginEnemy(seize)
    expect(seize.phase).toBe('enemy')
    beginAlly(seize)
    Object.assign(seize.units[0], objective)
    beginEnemy(seize)
    expect(seize.phase).toBe('won')
    const survive = createGame(4)
    expect(objectiveLabel(survive)).toBe('◎ 残り6ターン')
    survive.turn = 5
    beginEnemy(survive)
    beginAlly(survive)
    expect(survive.phase).toBe('ally')
    beginEnemy(survive)
    expect(survive.phase).toBe('enemy')
    beginAlly(survive)
    expect(survive.phase).toBe('won')
  })
  it('joins once and preserves a fallen recruit across subsequent chapters', () => {
    const before = carry(createGame(2, 'guard'))
    const joined = createGame(3, 'guard', before),
      healer = joined.units.find((unit) => unit.heal)!
    expect(healer).toBeDefined()
    healer.hp = 0
    const after = carry(joined)
    expect(lost(after, 4).map((unit) => unit.id)).toContain(healer.id)
    expect(createGame(4, 'guard', after).units.some((unit) => unit.id === healer.id)).toBe(false)
    expect(createGame(3, 'guard', before).units.filter((unit) => unit.id === healer.id)).toHaveLength(1)
    expect(before.a.max).toBe(16)
  })
})

describe('campaign balance', () => {
  for (const formation of ['balanced', 'guard'] as Formation[])
    for (const seed of [1, 7, 42])
      it(`clears all chapters with ${formation}, seed ${seed}`, () => {
        let roster: Roster | undefined
        const results: string[] = []
        for (let stage = 0; stage < campaign.length; stage++) {
          const game = createGame(stage, formation, roster, seeded(seed))
          let damageTaken = 0
          for (let turn = 0; turn < 30 && game.phase === 'ally'; turn++) {
            for (const unit of game.units
              .filter((u) => u.side === 'ally' && u.hp > 0)
              .sort(
                (a, b) =>
                  ['archer', 'mage', 'soldier', 'healer'].indexOf(a.role) -
                  ['archer', 'mage', 'soldier', 'healer'].indexOf(b.role)
              )) {
              if (unit.hp <= unit.max - 7 && recover(game, unit)) continue
              const { position, target, healing } = plan(game, unit)
              move(game, unit, position.x, position.y)
              if (healing) staffHeal(game, unit, healing)
              else if (target) attack(game, unit, target)
              if (game.phase !== 'ally') break
            }
            if (game.phase === 'ally' && beginEnemy(game)) {
              const before = game.units.filter((u) => u.side === 'ally').reduce((sum, u) => sum + u.hp, 0)
              game.units.filter((u) => u.side === 'enemy').forEach((u) => enemyStep(game, u))
              damageTaken += before - game.units.filter((u) => u.side === 'ally').reduce((sum, u) => sum + u.hp, 0)
              beginAlly(game)
            }
          }
          results.push(
            `${game.turn}:${game.units
              .filter((u) => u.side === 'ally' && u.hp > 0)
              .map((u) => u.level)
              .join('/')}`
          )
          expect(game.phase, `chapter ${stage + 1}: ${results.join(', ')}`).toBe('won')
          if (stage >= 3) expect(game.turn >= 4 || damageTaken > 3).toBe(true)
          roster = carry(game)
        }
        console.log(formation, seed, results.join(' '))
      })
})
