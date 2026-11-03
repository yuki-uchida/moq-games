import { describe, expect, it } from 'vitest'
import { GameEngine } from '../src/game/GameEngine'
import { RuleBasedAI } from '../src/ai/AIController'
import { ALLY_TYPES, CONFIG, FIELDS, stageRules } from '../src/game/model'
import { validateCampaignCheckpoint } from '../src/game/CampaignCheckpoint'
import { loadCampaignSave, saveCampaignCheckpoint } from '../src/progression/CampaignStorage'
import { availableAllies, freshRunFromProfile } from '../src/progression/UpgradeSystem'
import {
  ALL_OUT_FROM_STAGE,
  affordableRecruit,
  battleFormation,
  FORMATION_SLOTS,
  owned,
  awardBounty,
  awardStageClear,
  freshStageProgress,
  loadStageProgress,
  parseStageProgress,
  recordStars,
  recruit,
  nextGoal,
  starsFor,
  starsOf,
  totalStars,
  stageStartGold,
  stageUnlocked,
  toggleFormation
} from '../src/progression/StageProgress'

function stageEngine(stage: number) {
  const save = freshRunFromProfile({ version: 1, purchased: ['mage'] }, 2, 1)
  save.gold = stageStartGold(stage)
  save.formation = ['soldier', 'mage']
  const engine = new GameEngine(new RuleBasedAI(), save, 'meadow', 7, undefined, undefined, 2, 4)
  return { save, engine }
}

describe('stage select progress', () => {
  it('unlocks stages one at a time and pays coins per clear', () => {
    const p = freshStageProgress()
    expect(stageUnlocked(p, 1)).toBe(true)
    expect(stageUnlocked(p, 2)).toBe(false)
    expect(awardStageClear(p, 1)).toBe(stageRules(1).reward)
    expect(p).toMatchObject({ coins: stageRules(1).reward, cleared: 1 })
    expect(stageUnlocked(p, 2)).toBe(true)
    awardStageClear(p, 1)
    expect(p.cleared).toBe(1)
    expect(p.coins).toBe(stageRules(1).reward * 2)
  })
  it('recruits with coins and limits the formation to owned allies and slots', () => {
    const p = freshStageProgress()
    expect(toggleFormation(p, 'mage')).toBe(false)
    expect(recruit(p, 'mage')).toBe(false)
    p.coins = 100
    expect(recruit(p, 'soldier')).toBe(false)
    expect(recruit(p, 'mage')).toBe(true)
    expect(p.coins).toBe(0)
    expect(recruit(p, 'mage')).toBe(false)
    expect(p.formation).toHaveLength(4)
    expect(toggleFormation(p, 'mage')).toBe(true)
    expect(p.formation).toHaveLength(FORMATION_SLOTS)
    p.recruited.push('healer')
    expect(toggleFormation(p, 'healer')).toBe(false)
    for (const type of [...p.formation].slice(1)) expect(toggleFormation(p, type)).toBe(true)
    expect(toggleFormation(p, p.formation[0])).toBe(false)
  })
  it('rejects corrupt storage and migrates earlier hires', () => {
    expect(parseStageProgress({ version: 1, coins: -1, cleared: 0, recruited: [], formation: [] })).toBeNull()
    const parsed = parseStageProgress({
      version: 1,
      coins: 5,
      cleared: 3,
      recruited: ['mage', 'soldier', 'x'],
      formation: ['mage', 'healer']
    })
    expect(parsed).toMatchObject({ recruited: ['mage'], formation: ['mage'] })
    expect(loadStageProgress(['frost'], { getItem: () => '{bad' }).recruited).toEqual(['frost'])
  })
  it('names the next unearned star goal', () => {
    expect([0, 1, 2, 3].map((best) => nextGoal(best)?.stars ?? null)).toEqual([1, 2, 3, null])
    expect(nextGoal(2)?.label).toBe('拠点ノーダメージ')
  })
  it('rates a win by the castle HP left and keeps the best rating', () => {
    expect([starsFor(CONFIG.baseHp), starsFor(CONFIG.baseHp - 1), starsFor(CONFIG.baseHp / 2), starsFor(1)]).toEqual([3, 2, 2, 1])
    expect(starsFor(50, 100)).toBe(2)
    const p = freshStageProgress()
    expect(recordStars(p, 2, 2)).toBe(true)
    expect(recordStars(p, 2, 1)).toBe(false)
    expect(recordStars(p, 2, 3)).toBe(true)
    expect(recordStars(p, 0, 3)).toBe(false)
    expect([starsOf(p, 2), starsOf(p, 1), totalStars(p)]).toEqual([3, 0, 3])
    expect(p.stars).toHaveLength(CONFIG.stages)
  })
  it('adds the kill bonus to a clear and still pays it on defeat', () => {
    const p = freshStageProgress()
    expect(awardStageClear(p, 1, 25)).toBe(stageRules(1).reward + 25)
    expect(awardBounty(p, 7)).toBe(7)
    expect(p.coins).toBe(stageRules(1).reward + 32)
    expect(p.cleared).toBe(1)
  })
  it('parses progress saved before stars existed and ignores malformed stars', () => {
    const base = { version: 1, coins: 5, cleared: 1, recruited: [], formation: ['soldier'] }
    const zeros = Array(CONFIG.stages).fill(0)
    expect(parseStageProgress(base)?.stars).toEqual(zeros)
    expect(parseStageProgress({ ...base, stars: 'x' })?.stars).toEqual(zeros)
    const mixed = parseStageProgress({ ...base, stars: [3, 9, -1, 1.5, 'a', null, 2] })!
    expect(mixed.stars!.slice(0, 7)).toEqual([3, 0, 0, 0, 0, 0, 2])
    expect(mixed.coins).toBe(5)
  })
  it('deploys only the formation', () => {
    const { save, engine } = stageEngine(1)
    expect(availableAllies(save, 1)).toEqual(['soldier', 'mage'])
    expect(engine.place('archer', FIELDS.meadow.slots[0].id)).toBe(false)
    expect(engine.place('mage', FIELDS.meadow.slots[0].id)).toBe(true)
  })
  it('starts a fresh battle at a later stage whose checkpoint validates and resumes', () => {
    const { save, engine } = stageEngine(5)
    expect(engine.startAtStage(5)).toBe(true)
    expect(engine.startAtStage(6)).toBe(false)
    expect(engine.state.stage).toBe(5)
    expect(engine.place('soldier', FIELDS.meadow.slots[0].id)).toBe(true)
    let raw: string | null = null
    const store = (value: string) => {
      raw = value
    }
    expect(
      saveCampaignCheckpoint(save, engine.exportCheckpoint(), validateCampaignCheckpoint, {
        setItem: (_, v) => store(v)
      })
    ).toBe(true)
    expect(engine.startAssault()).toBe(true)
    for (let i = 0; i < 600; i++) engine.update(1 / 60)
    expect(
      saveCampaignCheckpoint(save, engine.exportCheckpoint(), validateCampaignCheckpoint, {
        setItem: (_, v) => store(v)
      })
    ).toBe(true)
    const loaded = loadCampaignSave(validateCampaignCheckpoint, {
      getItem: (key) => (key === 'tower-jev-v3' ? raw : null)
    })
    expect(loaded.issue).toBeNull()
    expect(loaded.run?.engine.state.stage).toBe(5)
  })
})

describe('総力戦', () => {
  it('stages from 9 field every owned ally, earlier stages keep the formation', () => {
    const p = freshStageProgress(ALLY_TYPES)
    expect(ALL_OUT_FROM_STAGE).toBe(9)
    expect(battleFormation(p, 8)).toEqual(p.formation)
    expect(p.formation.length).toBeLessThanOrEqual(FORMATION_SLOTS)
    expect(battleFormation(p, 9).length).toBeGreaterThan(p.formation.length)
    expect(battleFormation(p, 10)).toEqual(owned(p))
  })
})

it('offers the cheapest ally the coins can recruit, and nothing once all are owned or unaffordable', () => {
  const p = freshStageProgress()
  p.coins = 79
  expect(affordableRecruit(p)).toBeNull()
  p.coins = 80
  expect(affordableRecruit(p)).toBe('healer')
  expect(recruit(p, 'healer')).toBe(true)
  p.coins = 1000
  expect(affordableRecruit(p)).toBe('frost')
  for (const type of ['frost', 'ranger', 'mage', 'cannon', 'paladin'] as const) expect(recruit(p, type)).toBe(true)
  expect(affordableRecruit(p)).toBeNull()
})
