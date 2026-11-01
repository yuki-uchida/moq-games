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
  formation: STARTERS.slice(0, FORMATION_SLOTS)
})

export const owned = (p: StageProgress): AllyType[] =>
  ALLY_TYPES.filter((t) => STARTERS.includes(t) || p.recruited.includes(t))
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

export function awardStageClear(p: StageProgress, stage: number): number {
  const reward = stageReward(stage)
  p.coins += reward
  p.cleared = Math.max(p.cleared, Math.min(CONFIG.stages, stage))
  return reward
}
