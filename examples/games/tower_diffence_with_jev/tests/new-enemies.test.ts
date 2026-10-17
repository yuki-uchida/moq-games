import { describe, expect, it } from 'vitest'
import { GameEngine } from '../src/game/GameEngine'
import { attackDamageType, incomingDamage } from '../src/game/DamageRules'
import { regenerationAmount } from '../src/game/Regeneration'
import { attackContact } from '../src/game/CombatContact'
import { ATTACK_PROFILES, attackAssetElapsedMs } from '../src/game/AttackProfiles'
import {
  DEFINITIONS,
  ENEMY_TYPES,
  FIELDS,
  fieldFor,
  pointOnPath,
  isEnemyMelee,
  stageRules,
  getLegalAIActions,
  type EnemyType
} from '../src/game/model'

function setup(type: EnemyType) {
  const engine = new GameEngine({ decide: async () => null })
  engine.state.stage = 4
  engine.place('soldier', FIELDS.meadow.slots[0].id)
  engine.startAssault()
  expect(engine.applyAIAction({ type: 'spawn', unitType: type })).toBe(true)
  const enemy = engine.state.units.find((unit) => unit.owner === 'ai')!
  enemy.speed = 0
  return { engine, enemy }
}
function advance(engine: GameEngine, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) engine.update(1 / 60)
}

describe('new enemy catalog and actual animation timing', () => {
  it('unlocks thirteen enemies while preserving existing stage-one choices', () => {
    expect(ENEMY_TYPES).toHaveLength(13)
    expect(stageRules(1).enemyTypes).toEqual(['slime', 'goblin', 'shaman'])
    expect(stageRules(2).enemyTypes).toContain('koboldLancer')
    expect(stageRules(3).enemyTypes).not.toContain('crystalSentinel')
    expect(stageRules(4).enemyTypes).toEqual(expect.arrayContaining(['crystalSentinel', 'clockworkPatchling']))
    for (const type of ['crystalSentinel', 'koboldLancer', 'clockworkPatchling'] as const) {
      const { enemy } = setup(type)
      expect(isEnemyMelee(type)).toBe(true)
      expect(attackDamageType(type)).toBe('melee')
      expect(DEFINITIONS[type].armor).toBe(0)
      expect(DEFINITIONS[type].splash).toBe(0)
      expect(DEFINITIONS[type].heal).toBe(0)
      expect(enemy.type).toBe(type)
      const { engine } = setup(type)
      engine.state.nextSpawnAt = 0
      engine.state.cooldowns[type] = 0
      expect(getLegalAIActions(engine.state)).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'spawn', unitType: type })])
      )
      for (const field of Object.values(FIELDS)) expect(field.weights[type]).toBeGreaterThan(0)
      expect(ATTACK_PROFILES[type].cue).toBe('hit')
      expect(ATTACK_PROFILES[type].flightMs).toBe(0)
    }
  })
  it.each([
    ['crystalSentinel', 1500, (26 / 30) * 1000],
    ['koboldLancer', 1200, (19 / 30) * 1000],
    ['clockworkPatchling', 1200, 800]
  ] as const)('synchronizes %s hit with its Blender clip on the scaled simulation clock', (type, duration, cue) => {
    expect(ATTACK_PROFILES[type].durationMs).toBe(duration)
    expect(ATTACK_PROFILES[type].cueMs).toBeCloseTo(cue, 8)
    expect(attackAssetElapsedMs({ startedAt: 3, timeScale: 0.8 }, 3 + (cue / 1000) * 0.8)).toBeCloseTo(cue, 8)
  })
  it('keeps kobold longer grounded reach and building footprint contact', () => {
    const actor = { x: 0, y: 0, owner: 'ai' as const, type: 'koboldLancer' as const }
    expect(attackContact(actor, { x: 70, y: 0 }, DEFINITIONS.koboldLancer.range).inRange).toBe(true)
    expect(attackContact({ ...actor, type: 'goblin' }, { x: 70, y: 0 }, DEFINITIONS.goblin.range).inRange).toBe(false)
    expect(attackContact(actor, { x: 0, y: 70 }, DEFINITIONS.koboldLancer.range, 'base').inRange).toBe(true)
    expect(attackContact(actor, { x: 0, y: 90 }, DEFINITIONS.koboldLancer.range, 'base').inRange).toBe(false)
  })
})

describe('crystal affinity', () => {
  it.each([
    ['magic', 70],
    ['melee', 120],
    ['arrow', 120],
    ['physical', 120],
    [undefined, 100]
  ] as const)('scales %s consistently', (type, expected) => {
    const { enemy } = setup('crystalSentinel')
    expect(incomingDamage(100, enemy, 0, type)).toBeCloseTo(expected)
  })
  it('preserves beetle armor and affinities', () => {
    const { enemy } = setup('beetle')
    expect(incomingDamage(100, enemy, 0, 'arrow')).toBeCloseTo(49)
    expect(incomingDamage(100, enemy, 0, 'magic')).toBeCloseTo(91)
  })
})

describe('patchling quiet regeneration', () => {
  const unit = { type: 'clockworkPatchling' as const, hp: 50, lastDamagedAt: 3 }
  it('integrates only eligible time and is independent of step size', () => {
    expect(regenerationAmount(unit, 4.99, 1)).toBe(0)
    expect(regenerationAmount(unit, 5, 1)).toBe(0)
    expect(regenerationAmount(unit, 5.25, 0.5)).toBe(1)
    expect(regenerationAmount(unit, 6, 3)).toBe(4)
    const small = Array.from({ length: 30 }, (_, i) => regenerationAmount(unit, 5 + (i + 1) / 30, 1 / 30)).reduce(
      (a, b) => a + b,
      0
    )
    expect(small).toBeCloseTo(4)
    expect(regenerationAmount({ ...unit, hp: 0 }, 10, 1)).toBe(0)
    expect(regenerationAmount({ ...unit, type: 'slime' }, 10, 1)).toBe(0)
    expect(regenerationAmount({ ...unit, lastDamagedAt: undefined }, 10, 1)).toBe(0)
  })
  it('clamps maxHp, pauses with simulation and never resurrects', () => {
    const { engine, enemy } = setup('clockworkPatchling')
    enemy.hp = enemy.maxHp - 5
    advance(engine, 2)
    expect(enemy.hp).toBeCloseTo(enemy.maxHp - 5)
    advance(engine, 1)
    expect(enemy.hp).toBeCloseTo(enemy.maxHp - 1)
    advance(engine, 1)
    expect(enemy.hp).toBe(enemy.maxHp)
    engine.state.phase = 'preparation'
    enemy.hp -= 10
    advance(engine, 20)
    expect(enemy.hp).toBe(enemy.maxHp - 10)
    engine.state.phase = 'assault'
    enemy.hp = 0
    advance(engine, 1)
    expect(enemy.hp).toBe(0)
  })
  it('resets quiet time on actual combat damage before same-step healing', () => {
    const { engine, enemy } = setup('clockworkPatchling')
    const soldier = engine.state.units.find((u) => u.owner === 'player')!
    enemy.progress = 180
    const position = pointOnPath(fieldFor(engine.state).path, enemy.progress)
    soldier.x = soldier.homeX = position.x
    soldier.y = soldier.homeY = position.y - 30
    enemy.hp = 80
    enemy.lastDamagedAt = 0
    engine.state.time = 3
    for (let i = 0; i < 90 && enemy.lastDamagedAt === 0; i++) engine.update(1 / 60)
    expect(enemy.lastDamagedAt).toBeGreaterThan(3)
    expect(enemy.hp).toBeLessThan(80)
    const damagedHp = enemy.hp
    engine.state.units = [enemy]
    enemy.attackCooldown = 100
    advance(engine, 1.9)
    expect(enemy.hp).toBe(damagedHp)
    advance(engine, 0.3)
    expect(enemy.hp).toBeGreaterThan(damagedHp)
  })
})
