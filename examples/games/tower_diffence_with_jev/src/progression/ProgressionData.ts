import { ALLY_TYPES, CONFIG, DEFINITIONS, stageRules, type AllyType } from '../game/model'
import { STARTING_GOLD } from '../game/DefenderRoster'

export interface ProfileData {
  version: 1
  purchased: AllyType[]
}

export interface RunProgressData {
  version: 1
  commanderSupportVersion?: 1
  economyVersion?: 2
  gold: number
  unitLevels: Record<AllyType, number>
  highestStage: number
}

export interface SaveData {
  version: 2
  commanderSupportVersion?: 1
  economyVersion?: 2
  gold: number
  unitLevels: Record<AllyType, number>
  purchased: AllyType[]
  highestStage: number
}

export const LEGACY_SAVE_KEY = 'tower-jev-v2'
export const MAX_LEGACY_SAVE_BYTES = 16 * 1024
export const MAX_RUN_GOLD = Array.from({ length: CONFIG.stages }, (_, index) => stageRules(index + 1).reward).reduce(
  (total, reward) => total + reward,
  0
)
const paidAllies = ALLY_TYPES.filter((type) => DEFINITIONS[type].purchaseCost > 0)

export const freshProfile = (): ProfileData => ({ version: 1, purchased: [] })
export const freshRunProgress = (economyVersion: 1 | 2 = 1, commanderSupportVersion?: 1): RunProgressData => ({
  version: 1,
  ...(commanderSupportVersion === 1 ? { commanderSupportVersion } : {}),
  ...(economyVersion === 2 ? { economyVersion } : {}),
  gold: economyVersion === 2 ? STARTING_GOLD : 0,
  unitLevels: Object.fromEntries(ALLY_TYPES.map((type) => [type, 1])) as Record<AllyType, number>,
  highestStage: 1
})

export function parseProfile(value: unknown): ProfileData | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.purchased)) return null
  const purchased = value.purchased
  if (purchased.length > ALLY_TYPES.length || !purchased.every((type) => paidAllies.includes(type as AllyType)))
    return null
  return { version: 1, purchased: paidAllies.filter((type) => purchased.includes(type)) }
}

export function parseRunProgress(value: unknown): RunProgressData | null {
  return parseProgress(value, MAX_RUN_GOLD + (isRecord(value) && value.economyVersion === 2 ? STARTING_GOLD : 0))
}

function parseProgress(value: unknown, maximumGold: number): RunProgressData | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    (value.commanderSupportVersion !== undefined && value.commanderSupportVersion !== 1) ||
    (value.economyVersion !== undefined && value.economyVersion !== 2) ||
    !Number.isSafeInteger(value.gold) ||
    (value.gold as number) < 0 ||
    (value.gold as number) > maximumGold ||
    !Number.isInteger(value.highestStage) ||
    (value.highestStage as number) < 1 ||
    (value.highestStage as number) > CONFIG.stages ||
    !isRecord(value.unitLevels)
  )
    return null
  const levels = value.unitLevels
  if (
    !ALLY_TYPES.every(
      (type) =>
        Number.isInteger(levels[type]) &&
        (levels[type] as number) >= 1 &&
        (levels[type] as number) <= (value.economyVersion === 2 ? 1 : 4)
    )
  )
    return null
  return {
    version: 1,
    ...(value.commanderSupportVersion === 1 ? { commanderSupportVersion: 1 as const } : {}),
    ...(value.economyVersion === 2 ? { economyVersion: 2 as const } : {}),
    gold: value.gold as number,
    unitLevels: Object.fromEntries(ALLY_TYPES.map((type) => [type, levels[type]])) as Record<AllyType, number>,
    highestStage: value.highestStage as number
  }
}

export function profileFromSave(save: Pick<SaveData, 'purchased'>): ProfileData {
  return { version: 1, purchased: [...save.purchased] }
}

export function runProgressFromSave(save: SaveData): RunProgressData {
  return {
    version: 1,
    ...(save.commanderSupportVersion === 1 ? { commanderSupportVersion: 1 as const } : {}),
    ...(save.economyVersion === 2 ? { economyVersion: 2 as const } : {}),
    gold: save.gold,
    unitLevels: { ...save.unitLevels },
    highestStage: save.highestStage
  }
}

export function resumeProgress(profile: ProfileData, progress: RunProgressData): SaveData {
  return {
    version: 2,
    ...(progress.commanderSupportVersion === 1 ? { commanderSupportVersion: 1 as const } : {}),
    ...(progress.economyVersion === 2 ? { economyVersion: 2 as const } : {}),
    gold: progress.gold,
    unitLevels: { ...progress.unitLevels },
    highestStage: progress.highestStage,
    purchased: [...profile.purchased]
  }
}

export function freshRunFromProfile(
  profile: ProfileData,
  economyVersion: 1 | 2 = 1,
  commanderSupportVersion?: 1
): SaveData {
  return resumeProgress(
    parseProfile(profile) ?? freshProfile(),
    freshRunProgress(economyVersion, commanderSupportVersion)
  )
}

export const freshSave = (): SaveData => freshRunFromProfile(freshProfile())

export function startNewRun(save: SaveData, economyVersion: 1 | 2 = 1, commanderSupportVersion?: 1): SaveData {
  delete save.commanderSupportVersion
  delete save.economyVersion
  return Object.assign(save, freshRunFromProfile(profileFromSave(save), economyVersion, commanderSupportVersion))
}

export function parseLegacySave(value: unknown): SaveData | null {
  if (!isRecord(value) || value.version !== 2) return null
  const profile = parseProfile({ version: 1, purchased: value.purchased }),
    progress = parseProgress({ ...value, version: 1 }, Number.MAX_SAFE_INTEGER)
  return profile && progress ? resumeProgress(profile, progress) : null
}

export function legacyProfile(value: unknown): ProfileData | null {
  if (!isRecord(value) || value.version !== 2) return null
  return parseProfile({ version: 1, purchased: value.purchased })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseBoundedJson(raw: string | null, maximumBytes: number): unknown {
  if (raw === null || raw.length > maximumBytes || new TextEncoder().encode(raw).byteLength > maximumBytes) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}
