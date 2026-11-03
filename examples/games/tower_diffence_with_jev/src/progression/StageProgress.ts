import { ALLY_TYPES, CONFIG, DEFINITIONS, stageRules, type AllyType } from '../game/model'
import { STARTING_GOLD } from '../game/DefenderRoster'
import { isRecord, parseBoundedJson } from './ProgressionData'

/** Stage-select meta progress: coins earned by clearing stages, recruited allies and the battle formation. */
export interface StageProgress {
  version: 1
  coins: number
  cleared: number
  recruited: AllyType[]
  formation: AllyType[]
  /** Best star rating (0-3) per stage, index = stage - 1. Optional so older saves still parse. */
  stars?: number[]
}

export const STAGE_PROGRESS_KEY = 'tower-jev-stages-v1'
export const FORMATION_SLOTS = 5
const RECRUITABLE = ALLY_TYPES.filter((type) => DEFINITIONS[type].purchaseCost > 0)
const STARTERS = ALLY_TYPES.filter((type) => DEFINITIONS[type].purchaseCost === 0)

export const freshStageProgress = (recruited: readonly AllyType[] = []): StageProgress => ({
  version: 1,
  coins: 0,
  cleared: 0,
  recruited: RECRUITABLE.filter((type) => recruited.includes(type)),
  formation: STARTERS.slice(0, FORMATION_SLOTS),
  stars: Array(CONFIG.stages).fill(0)
})

export const owned = (p: StageProgress): AllyType[] =>
  ALLY_TYPES.filter((t) => STARTERS.includes(t) || p.recruited.includes(t))
/** 総力戦: the final stages field every owned ally type instead of the chosen formation. */
export const ALL_OUT_FROM_STAGE = 9
export const battleFormation = (p: StageProgress, stage: number): AllyType[] =>
  stage >= ALL_OUT_FROM_STAGE ? owned(p) : [...p.formation]
export const stageUnlocked = (p: StageProgress, stage: number): boolean =>
  Number.isInteger(stage) && stage >= 1 && stage <= Math.min(CONFIG.stages, p.cleared + 1)
export const stageReward = (stage: number): number => stageRules(stage).reward
/** Battle gold matches what a run would have earned reaching this stage, so checkpoints stay valid. */
export const stageStartGold = (stage: number): number =>
  STARTING_GOLD + Array.from({ length: stage - 1 }, (_, i) => stageReward(i + 1)).reduce((a, b) => a + b, 0)

export function parseStageProgress(value: unknown): StageProgress | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.coins) ||
    (value.coins as number) < 0 ||
    !Number.isInteger(value.cleared) ||
    (value.cleared as number) < 0 ||
    (value.cleared as number) > CONFIG.stages ||
    !Array.isArray(value.recruited) ||
    !Array.isArray(value.formation)
  )
    return null
  const p: StageProgress = {
    version: 1,
    coins: value.coins as number,
    cleared: value.cleared as number,
    recruited: RECRUITABLE.filter((t) => (value.recruited as unknown[]).includes(t)),
    formation: []
  }
  const have = owned(p)
  const stored = Array.isArray(value.stars) ? value.stars : []
  p.stars = Array.from({ length: CONFIG.stages }, (_, i) => {
    const n = stored[i]
    return Number.isInteger(n) && n >= 0 && n <= 3 ? n : 0
  })
  p.formation = have.filter((t) => (value.formation as unknown[]).includes(t)).slice(0, FORMATION_SLOTS)
  if (!p.formation.length) p.formation = STARTERS.slice(0, FORMATION_SLOTS)
  return p
}

export function loadStageProgress(
  legacyRecruited: readonly AllyType[],
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage
): StageProgress {
  try {
    return (
      parseStageProgress(parseBoundedJson(storage.getItem(STAGE_PROGRESS_KEY), 16 * 1024)) ??
      freshStageProgress(legacyRecruited)
    )
  } catch {
    return freshStageProgress(legacyRecruited)
  }
}

export function saveStageProgress(
  p: StageProgress,
  storage: Pick<Storage, 'setItem'> = globalThis.localStorage
): boolean {
  try {
    storage.setItem(STAGE_PROGRESS_KEY, JSON.stringify(p))
    return true
  } catch {
    return false
  }
}

/** The cheapest ally not recruited yet that the current coins can pay for, if any. */
export const affordableRecruit = (p: StageProgress): AllyType | null =>
  RECRUITABLE.filter((t) => !p.recruited.includes(t) && DEFINITIONS[t].purchaseCost <= p.coins).sort(
    (a, b) => DEFINITIONS[a].purchaseCost - DEFINITIONS[b].purchaseCost
  )[0] ?? null

export function recruit(p: StageProgress, type: AllyType): boolean {
  const cost = DEFINITIONS[type]?.purchaseCost ?? 0
  if (!RECRUITABLE.includes(type) || p.recruited.includes(type) || p.coins < cost) return false
  p.coins -= cost
  p.recruited = RECRUITABLE.filter((t) => t === type || p.recruited.includes(t))
  return true
}

export function toggleFormation(p: StageProgress, type: AllyType): boolean {
  if (p.formation.includes(type)) {
    if (p.formation.length === 1) return false
    p.formation = p.formation.filter((t) => t !== type)
    return true
  }
  if (!owned(p).includes(type) || p.formation.length >= FORMATION_SLOTS) return false
  p.formation = ALLY_TYPES.filter((t) => t === type || p.formation.includes(t))
  return true
}

/** 3 stars when the castle took no damage, 2 with at least half its HP left, otherwise 1 (wins only). */
export const starsFor = (baseHp: number, maxHp: number = CONFIG.baseHp): number =>
  baseHp >= maxHp ? 3 : baseHp >= maxHp / 2 ? 2 : 1

/** What each star asks for; the stage select, the preparation chip and the result hint all read this. */
export const STAR_GOALS = ['クリア', '拠点HP半分以上', '拠点ノーダメージ'] as const
/** The next star still to earn given the best rating, or null once all three are won. */
export const nextGoal = (best: number): { stars: number; label: string } | null =>
  best >= 3 ? null : { stars: best + 1, label: STAR_GOALS[Math.max(0, best)] }

export const starsOf = (p: StageProgress, stage: number): number => p.stars?.[stage - 1] ?? 0
export const totalStars = (p: StageProgress): number => (p.stars ?? []).reduce((a, b) => a + b, 0)

/** Keeps the best rating; returns true when it improved. */
export function recordStars(p: StageProgress, stage: number, stars: number): boolean {
  if (!Number.isInteger(stage) || stage < 1 || stage > CONFIG.stages) return false
  const value = Math.max(0, Math.min(3, Math.floor(stars)))
  p.stars = Array.from({ length: CONFIG.stages }, (_, i) => p.stars?.[i] ?? 0)
  if (value <= p.stars[stage - 1]) return false
  p.stars[stage - 1] = value
  return true
}

/** Pays the stage reward plus the kill bonus; returns the total. */
export function awardStageClear(p: StageProgress, stage: number, bonus = 0): number {
  const reward = stageReward(stage) + bonus
  p.coins += reward
  p.cleared = Math.max(p.cleared, Math.min(CONFIG.stages, stage))
  return reward
}

/** A lost battle still pays the kill bonus. */
export function awardBounty(p: StageProgress, bonus: number): number {
  p.coins += bonus
  return bonus
}
