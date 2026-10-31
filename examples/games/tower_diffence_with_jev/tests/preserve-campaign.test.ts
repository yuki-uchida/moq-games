import { describe, expect, it } from 'vitest'
import { GameEngine } from '../src/game/GameEngine'
import { FIELDS } from '../src/game/model'
import { validateCampaignCheckpoint } from '../src/game/CampaignCheckpoint'
import { RuleBasedAI } from '../src/ai/AIController'
import { freshSave } from '../src/progression/UpgradeSystem'
import { CAMPAIGN_SAVE_KEY, loadCampaignSave, preserveCampaignBeforeRuleResume, saveCampaignCheckpoint } from '../src/progression/CampaignStorage'

describe('preserving a checkpoint before controller changes', () => {
  it('retains the exact original without overwriting an earlier checkpoint', () => {
    const data = new Map([[CAMPAIGN_SAVE_KEY, '{"cooldownHold":{"phase":"cooling"}}']])
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
    expect(preserveCampaignBeforeRuleResume(storage)).toBe(true)
    data.set(CAMPAIGN_SAVE_KEY, '{"cooldownHold":{"phase":"ready"}}')
    expect(preserveCampaignBeforeRuleResume(storage)).toBe(true)
    expect(data.get(`${CAMPAIGN_SAVE_KEY}-preserved-0`)).toBe('{"cooldownHold":{"phase":"cooling"}}')
    expect(data.get(`${CAMPAIGN_SAVE_KEY}-preserved-1`)).toBe('{"cooldownHold":{"phase":"ready"}}')
  })

  it('keeps a valid Jev cooldown checkpoint recoverable after rule-mode resumption', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
    const save = freshSave()
    const engine = new GameEngine({ decide: async () => null }, save, 'meadow', 42, () => 0)
    expect(engine.place('soldier', FIELDS.meadow.slots[0].id)).toBeTruthy()
    expect(engine.startAssault()).toBe(true)
    engine.state.cooldowns.slime = 1.5
    const action = { type: 'wait', unitType: 'slime' } as const
    expect(engine.applyAIAction(action)).toBe(true)
    engine.state.cooldownHold = { action, phase: 'cooling', stage: 1, fieldId: 'meadow', startedAt: 0 }
    engine.state.strategy!.expiresAt = 1.5
    expect(saveCampaignCheckpoint(save, engine.exportCheckpoint(), validateCampaignCheckpoint, storage)).toBe(true)
    const original = data.get(CAMPAIGN_SAVE_KEY)
    expect(preserveCampaignBeforeRuleResume(storage)).toBe(true)
    const loaded = loadCampaignSave(validateCampaignCheckpoint, storage)
    const restored = GameEngine.fromCheckpoint(loaded.run!.engine, new RuleBasedAI(), save)
    expect(restored?.state.cooldownHold).toBeUndefined()
    expect(data.get(`${CAMPAIGN_SAVE_KEY}-preserved-0`)).toBe(original)
    const archived = loadCampaignSave(validateCampaignCheckpoint, { getItem: () => data.get(`${CAMPAIGN_SAVE_KEY}-preserved-0`) ?? null })
    expect(archived.run?.engine.state.cooldownHold?.phase).toBe('cooling')
  })
  it('refuses to resume if storage cannot preserve the original', () => {
    expect(preserveCampaignBeforeRuleResume({ getItem: (key: string) => key === CAMPAIGN_SAVE_KEY ? 'original' : null, setItem: () => { throw new Error('quota') } })).toBe(false)
    expect(preserveCampaignBeforeRuleResume({ getItem: () => null, setItem: () => {} })).toBe(false)
  })
})
