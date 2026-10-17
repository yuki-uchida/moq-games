import { describe, expect, it } from 'vitest'
import { GameEngine } from '../src/game/GameEngine'
import { validateCampaignCheckpoint } from '../src/game/CampaignCheckpoint'
import { ENEMY_TYPES, getField, stageRules, type EnemyType } from '../src/game/model'
import { freshSave } from '../src/progression/UpgradeSystem'

const idle = { decide: async () => null }
const additions = ['crystalSentinel', 'koboldLancer', 'clockworkPatchling'] as const
function game(stage = 4, revision: 1 | 4 = 1) {
  const save = freshSave()
  save.highestStage = Math.max(1, stage - 1)
  const engine = new GameEngine(idle, save, 'meadow', 42, () => 0, undefined, revision === 4 ? 2 : 1, revision)
  engine.state.stage = stage
  engine.state.stageSummary.stage = stage
  if (stage > 1)
    engine.state.previousStageSummary = {
      ...engine.state.stageSummary,
      stage: stage - 1,
      spawned: stageRules(stage - 1).enemyCount,
      resolved: stageRules(stage - 1).enemyCount
    }
  ;(engine as unknown as { history: { reset: (state: typeof engine.state) => void } }).history.reset(engine.state)
  expect(engine.place('soldier', getField('meadow', revision === 4 ? 2 : 1, revision).slots.at(-1)!)).toBe(true)
  expect(engine.startAssault()).toBe(true)
  return { engine, save }
}
function spawn(type: EnemyType, revision: 1 | 4 = 1) {
  const result = game(4, revision)
  expect(
    result.engine.applyAIAction({
      type: 'spawn',
      unitType: type,
      ...(revision === 4 ? { routeId: 'left' as const } : {})
    })
  ).toBe(true)
  return result
}
function validate(checkpoint: any) {
  return validateCampaignCheckpoint(checkpoint, checkpoint.progress, checkpoint.profile)
}
function historical(version: 14 | 15 | 16) {
  const checkpoint = structuredClone(game(1).engine.exportCheckpoint()!) as unknown as Record<string, any>
  expect(checkpoint).not.toBeNull()
  checkpoint.version = version
  for (const type of additions) delete checkpoint.state.cooldowns[type]
  return checkpoint
}

describe('v17 enemy checkpoint compatibility', () => {
  for (const revision of [1, 4] as const)
    for (const type of additions)
      it(`round-trips ${type} revision ${revision}`, () => {
        const { engine, save } = spawn(type, revision)
        for (let tick = 0; tick < 30; tick++) engine.update(1 / 60)
        const checkpoint = engine.exportCheckpoint()!
        expect(checkpoint).not.toBeNull()
        expect(checkpoint.version).toBe(18)
        const restored = GameEngine.fromCheckpoint(JSON.parse(JSON.stringify(checkpoint)), idle, save, () => 0)!
        expect(restored).not.toBeNull()
        expect(restored.state.units).toEqual(engine.state.units)
        for (let tick = 0; tick < 120; tick++) {
          engine.update(1 / 60)
          restored.update(1 / 60)
        }
        expect(restored.state.units).toEqual(engine.state.units)
      })
  for (const revision of [1, 4] as const)
    it(`preserves regeneration quiet time on revision ${revision}`, () => {
      const { engine, save } = spawn('clockworkPatchling', revision)
      for (let tick = 0; tick < 60; tick++) engine.update(1 / 60)
      const patch = engine.state.units.find((unit) => unit.type === 'clockworkPatchling')!
      patch.hp -= 20
      patch.lastDamagedAt = engine.state.time
      const checkpoint = engine.exportCheckpoint()!
      expect(checkpoint).not.toBeNull()
      const restored = GameEngine.fromCheckpoint(checkpoint, idle, save, () => 0)!
      for (let tick = 0; tick < 150; tick++) {
        engine.update(1 / 60)
        restored.update(1 / 60)
      }
      const resumed = restored.state.units.find((unit) => unit.type === 'clockworkPatchling')!
      expect(resumed.lastDamagedAt).toBe(patch.lastDamagedAt)
      expect(resumed.hp).toBeCloseTo(patch.hp, 10)
      expect(resumed.hp).toBeGreaterThan(checkpoint.state.units.find((unit) => unit.type === 'clockworkPatchling')!.hp)
    })
  it('rejects missing, negative, future and wrong-role timers', () => {
    const checkpoint = spawn('clockworkPatchling').engine.exportCheckpoint()!
    for (const timer of [undefined, -1, checkpoint.state.time + 0.0000001, NaN, Infinity]) {
      const invalid = structuredClone(checkpoint)
      invalid.state.units.find((unit) => unit.type === 'clockworkPatchling')!.lastDamagedAt = timer
      expect(validate(invalid)).toBeNull()
    }
    for (const type of ['soldier', 'crystalSentinel'] as const) {
      const invalid = spawn('crystalSentinel').engine.exportCheckpoint()!
      invalid.state.units.find((unit) => unit.type === type)!.lastDamagedAt = 0
      expect(validate(invalid)).toBeNull()
    }
  })
  for (const version of [14, 15, 16] as const) {
    it(`migrates v${version} historical cooldown keys`, () => {
      const migrated = validate(historical(version))!
      expect(migrated).not.toBeNull()
      expect(migrated.version).toBe(18)
      expect(Object.keys(migrated.state.cooldowns)).toEqual([...ENEMY_TYPES])
      for (const type of additions) expect(migrated.state.cooldowns[type]).toBe(0)
    })
    it(`rejects v${version} new roles and timers`, () => {
      for (const type of additions) {
        const invalid = historical(version)
        invalid.state.lastAction = { type: 'wait', unitType: type }
        expect(validate(invalid)).toBeNull()
        const cooldown = historical(version)
        cooldown.state.cooldowns[type] = 0
        expect(validate(cooldown)).toBeNull()
      }
      expect(validate({ ...spawn('clockworkPatchling').engine.exportCheckpoint()!, version })).toBeNull()
    })
  }
  it('migrates published v16 revision 4 without changing geometry or simulation', () => {
    const { engine, save } = game(1, 4)
    expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime', routeId: 'left' })).toBe(true)
    for (let tick = 0; tick < 30; tick++) engine.update(1 / 60)
    const checkpoint = structuredClone(engine.exportCheckpoint()!)
    expect(checkpoint).not.toBeNull()
    const old = { ...checkpoint, version: 16 }
    for (const type of additions) delete (old.state.cooldowns as Partial<typeof old.state.cooldowns>)[type]
    const migrated = validate(old)!
    expect(migrated).not.toBeNull()
    expect(migrated.state.layoutRevision).toBe(4)
    expect(validate({ ...old, version: 15 })).toBeNull()
    const restored = GameEngine.fromCheckpoint(migrated, idle, save, () => 0)!
    expect(restored).not.toBeNull()
    expect(getField(restored.state.fieldId, 2, restored.state.layoutRevision)).toEqual(getField('meadow', 2, 4))
    for (let tick = 0; tick < 120; tick++) {
      engine.update(1 / 60)
      restored.update(1 / 60)
    }
    expect(restored.state.units).toEqual(engine.state.units)
  })
})
