import { beforeAll, describe, expect, it } from 'vitest'
import { RuleBasedAI } from '../src/ai/AIController'
import { validateCampaignCheckpoint, type CampaignCheckpoint } from '../src/game/CampaignCheckpoint'
import { GameEngine } from '../src/game/GameEngine'
import {
  CONFIG,
  actionMembers,
  combatStats,
  getField,
  getLegalAIActions,
  serializeStateForAI,
  stageRules,
  type WaveBossPolicy
} from '../src/game/model'
import { DRAGON_BREATH_MOUTHS } from '../src/rendering/DragonBreathArt'
import { freshProfile, freshRunFromProfile, resumeProgress } from '../src/progression/UpgradeSystem'

describe('wave rules', () => {
  it('drops the regular dragon from stage 10 only under policy 3', () => {
    expect(stageRules(10, 3).enemyTypes).not.toContain('dragon')
    expect(stageRules(10, 2).enemyTypes).toContain('dragon')
    expect(stageRules(10, 3).bossType).toBe('dragon')
    for (let stage = 1; stage < CONFIG.stages; stage++) expect(stageRules(stage, 3)).toEqual(stageRules(stage, 2))
    const { enemyTypes: _a, ...next } = stageRules(10, 3),
      { enemyTypes: _b, ...old } = stageRules(10, 2)
    expect(next).toEqual(old)
  })
  it('trims only the stage-10 enemy count under policy 4', () => {
    expect(stageRules(10, 3)).toMatchObject({ enemyCount: 23, spawnBudget: 120 })
    expect(stageRules(10, 4)).toMatchObject({ enemyCount: 21, spawnBudget: 110 })
    expect(stageRules(9, 4).enemyCount).toBe(21)
    const { enemyCount: _a, spawnBudget: _b, ...next } = stageRules(10, 4),
      { enemyCount: _c, spawnBudget: _d, ...old } = stageRules(10, 3)
    expect(next).toEqual(old)
    for (let stage = 1; stage < CONFIG.stages; stage++) expect(stageRules(stage, 4)).toEqual(stageRules(stage, 2))
    const dragon = { owner: 'ai', type: 'dragon', boss: true } as const
    expect(combatStats(dragon, 10, 1, 4)).toEqual(combatStats(dragon, 10, 1, 3))
  })
  it('shortens only the finale dragon boss reach and softens its hits', () => {
    const dragon = { owner: 'ai', type: 'dragon', boss: true } as const,
      stats = (policy: WaveBossPolicy) => combatStats(dragon, 10, 1, policy)
    expect(stats(2).range).toBeCloseTo(212.5)
    expect(stats(3).range).toBeCloseTo(170)
    expect(stats(3).maxHp).toBe(stats(2).maxHp)
    expect(stats(3).attack).toBeCloseTo(stats(2).attack * 0.75)
    const ogre = { owner: 'ai', type: 'ogre', boss: true } as const
    expect(combatStats(ogre, 9, 1, 3)).toEqual(combatStats(ogre, 9, 1, 2))
  })
})

const idle = { decide: async () => null }
it('never offers the enemy commander a regular dragon in the policy-3 finale', () => {
  const save = freshRunFromProfile(freshProfile(), 2, 1),
    e = new GameEngine(idle, save, 'meadow', 42, () => 0, DRAGON_BREATH_MOUTHS, 2, 4)
  expect(e.startAtStage(10)).toBe(true)
  expect(getField('meadow', 2, 4).slots.some((slot) => e.place('tank', slot))).toBe(true)
  expect(e.startAssault()).toBe(true)
  const regularDragons = (waveBossPolicy: WaveBossPolicy) =>
    getLegalAIActions({ ...e.state, waveBossPolicy }).filter((action) =>
      actionMembers(action).some((member) => member.unitType === 'dragon' && !member.boss)
    )
  expect(regularDragons(2).length).toBeGreaterThan(0)
  expect(regularDragons(3)).toEqual([])
  expect(regularDragons(4)).toEqual([])
})
// A finale battle where the boss dragon is alive with an attack of its own in flight.
async function finale() {
  let clock = 0
  const save = freshRunFromProfile(freshProfile(), 2, 1),
    e = new GameEngine(new RuleBasedAI(), save, 'meadow', 42, () => clock, DRAGON_BREATH_MOUTHS, 2, 4)
  expect(e.state.waveBossPolicy).toBe(4)
  expect(e.startAtStage(10)).toBe(true)
  for (const slot of getField('meadow', 2, 4).slots.slice(-3)) e.place('tank', slot)
  const prep = e.exportCheckpoint()!
  expect(e.startAssault()).toBe(true)
  const seen = { regularDragon: false, bossAttacks: new Set<number>(), otherAttacks: new Set<number>() }
  let checkpoint: CampaignCheckpoint | null = null,
    early: CampaignCheckpoint | null = null
  for (let i = 0; i < 4000 && e.state.phase === 'assault'; i++) {
    clock += 50
    e.update(0.05)
    // Keep the base alive (and the damage record consistent) so the run reaches the boss.
    e.state.playerBaseHp = CONFIG.baseHp
    e.state.stageSummary.baseDamage = 0
    for (let j = 0; j < 12; j++) await Promise.resolve()
    for (const u of e.state.units) if (u.owner === 'ai' && u.type === 'dragon' && !u.boss) seen.regularDragon = true
    for (const a of e.state.attacks)
      if (a.owner === 'ai') (a.boss ? seen.bossAttacks : seen.otherAttacks).add(a.geometryScale!)
    if (!early && e.state.units.some((u) => u.owner === 'ai' && !u.boss)) early = e.exportCheckpoint()
    const boss = e.state.units.find((u) => u.boss && u.hp > 0)
    if (boss && e.state.attacks.some((a) => a.attackerId === boss.id)) {
      checkpoint = e.exportCheckpoint()
      break
    }
  }
  return { e, seen, checkpoint, early, prep, boss: e.state.units.find((u) => u.boss) }
}

describe('finale battle', () => {
  let run: Awaited<ReturnType<typeof finale>>
  beforeAll(async () => {
    run = await finale()
  }, 60000)
  it('fields no regular dragon and a short-reach boss with unscaled attacks', () => {
    expect(run.boss?.type).toBe('dragon')
    expect(run.boss!.attackRange).toBeCloseTo(170)
    expect(run.seen.regularDragon).toBe(false)
    expect([...run.seen.bossAttacks]).toEqual([1])
    for (const scale of run.seen.otherAttacks) expect(scale).toBe(2)
  })
  it('reports the boss dragon range, splash and policy to the commander', () => {
    const boss = run.boss!,
      observe = (waveBossPolicy: WaveBossPolicy, attackRange: number) =>
        serializeStateForAI({ ...run.e.state, waveBossPolicy, units: [{ ...boss, attackRange }] })
    const next = observe(4, 170),
      old = observe(2, 212.5)
    expect(next.wave.waveBossPolicy).toBe(4)
    expect(next.enemies[0]).toMatchObject({ boss: true, range: 170, splash: 109.375 })
    expect(old.wave.waveBossPolicy).toBe(2)
    expect(old.enemies[0]).toMatchObject({ boss: true, range: 212.5, splash: 218.75 })
  })
  const validate = (value: unknown) => {
    const c = value as CampaignCheckpoint
    return validateCampaignCheckpoint(c, c.progress, c.profile)
  }
  const clone = () => structuredClone(run.checkpoint!) as any
  it('round-trips a v20 checkpoint with the boss attacking', () => {
    expect(run.checkpoint?.version).toBe(20)
    expect(run.checkpoint!.state.waveBossPolicy).toBe(4)
    expect(validate(JSON.parse(JSON.stringify(run.checkpoint)))).not.toBeNull()
    const c = JSON.parse(JSON.stringify(run.checkpoint)),
      restored = GameEngine.fromCheckpoint(
        c,
        idle,
        resumeProgress(c.profile, c.progress),
        () => 0,
        DRAGON_BREATH_MOUTHS
      )
    expect(restored?.state.waveBossPolicy).toBe(4)
    expect(restored?.exportCheckpoint()?.version).toBe(20)
  })
  it('accepts a policy-4 preparation checkpoint', () => {
    expect(run.prep.version).toBe(20)
    expect(validate(run.prep)).not.toBeNull()
  })
  it('restores a v19 policy-3 preparation under policy 4 and keeps a v19 assault on policy 3', () => {
    const prep = structuredClone(run.prep) as any
    prep.version = 19
    prep.state.waveBossPolicy = 3
    const restored = (c: any) =>
      GameEngine.fromCheckpoint(c, idle, resumeProgress(c.profile, c.progress), () => 0, DRAGON_BREATH_MOUTHS)
    expect(restored(prep)?.state.waveBossPolicy).toBe(4)
    const assault = clone()
    assault.version = 19
    assault.state.waveBossPolicy = 3
    const e = restored(assault)!
    expect(e.state.waveBossPolicy).toBe(3)
    expect(e.exportCheckpoint()?.version).toBe(20)
    expect(stageRules(10, e.state.waveBossPolicy).enemyCount).toBe(23)
  })
  it('rejects mismatched or illegal finale checkpoints', () => {
    const old = clone()
    old.version = 18
    expect(validate(old)).toBeNull()
    const prep = structuredClone(run.prep) as any
    prep.state.waveBossPolicy = 2
    expect(validate(prep)).toBeNull()
    prep.state.waveBossPolicy = 3
    expect(validate(prep)).toBeNull()
    const v19 = structuredClone(run.checkpoint!) as any
    v19.version = 19
    expect(validate(v19)).toBeNull()
    const dragon = structuredClone(run.early!) as any
    const regular = dragon.state.units.find((u: any) => u.owner === 'ai' && !u.boss)
    expect(regular).toBeDefined()
    regular.type = 'dragon'
    expect(validate(dragon)).toBeNull()
    const reach = clone()
    reach.state.units.find((u: any) => u.boss).attackRange = 212.5
    expect(validate(reach)).toBeNull()
    const scale = clone()
    scale.state.attacks.find((a: any) => a.boss).geometryScale = 2
    expect(validate(scale)).toBeNull()
  })
})
