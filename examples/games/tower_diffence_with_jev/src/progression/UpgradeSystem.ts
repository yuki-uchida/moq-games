import { ALLY_TYPES, DEFINITIONS, type AllyType, type GameState } from '../game/model'
import { canSpendOnRoster } from '../game/DefenderRoster'
import {
  freshSave,
  LEGACY_SAVE_KEY,
  MAX_LEGACY_SAVE_BYTES,
  parseBoundedJson,
  parseLegacySave,
  type SaveData
} from './ProgressionData'
export {
  freshSave,
  freshProfile,
  freshRunProgress,
  freshRunFromProfile,
  startNewRun,
  profileFromSave,
  runProgressFromSave,
  resumeProgress,
  type SaveData,
  type ProfileData,
  type RunProgressData
} from './ProgressionData'

export function loadSave(storage?: Pick<Storage, 'getItem'>): SaveData {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(LEGACY_SAVE_KEY)
    return parseLegacySave(parseBoundedJson(raw, MAX_LEGACY_SAVE_BYTES)) ?? freshSave()
  } catch {
    return freshSave()
  }
}

export function saveProgress(save: SaveData, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const sanitized = parseLegacySave(save)
    if (!sanitized) return false
    ;(storage ?? globalThis.localStorage).setItem(LEGACY_SAVE_KEY, JSON.stringify(sanitized))
    return true
  } catch {
    return false
  }
}

export const SCOUT_COST = 80
export const SCOUT_ALLIES: readonly AllyType[] = ['mage', 'healer', 'frost', 'ranger', 'cannon', 'paladin']
export function availableAllies(s: SaveData, _stage: number): AllyType[] {
  return ALLY_TYPES.filter((type) => !SCOUT_ALLIES.includes(type) || s.purchased.includes(type))
}
export function scoutCandidates(s: Pick<SaveData, 'purchased'>): AllyType[] {
  return SCOUT_ALLIES.filter((type) => !s.purchased.includes(type))
}
export function scoutAllowed(s: SaveData, state?: Readonly<GameState>): boolean {
  return (
    (!state || state.phase === 'preparation') && scoutCandidates(s).length > 0 && canSpendOnRoster(s, SCOUT_COST, state)
  )
}
export function scout(s: SaveData, random: () => number = Math.random, state?: Readonly<GameState>): AllyType | null {
  if (!scoutAllowed(s, state)) return null
  const candidates = scoutCandidates(s),
    draw = random()
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) return null
  const type = candidates[Math.floor(draw * candidates.length)]
  s.gold -= SCOUT_COST
  s.purchased.push(type)
  return type
}
export function purchaseAllowed(s: SaveData, t: AllyType, state?: Readonly<GameState>): boolean {
  if (!ALLY_TYPES.includes(t)) return false
  const cost = DEFINITIONS[t].purchaseCost
  return cost > 0 && !s.purchased.includes(t) && canSpendOnRoster(s, cost, state)
}
export function purchase(s: SaveData, t: AllyType, state?: Readonly<GameState>): boolean {
  if (!purchaseAllowed(s, t, state)) return false
  const cost = DEFINITIONS[t].purchaseCost
  s.gold -= cost
  s.purchased.push(t)
  return true
}
export const upgradeCost = (level: number): number => (level >= 4 ? Infinity : 60 * 2 ** (level - 1))
export { unitLevelMultiplier as multiplier } from '../game/model'
export function upgrade(s: SaveData, t: AllyType, stage = 1): boolean {
  if (s.economyVersion === 2) return false
  if (!availableAllies(s, stage).includes(t)) return false
  const cost = upgradeCost(s.unitLevels[t])
  if (s.gold < cost) return false
  s.gold -= cost
  s.unitLevels[t]++
  return true
}
