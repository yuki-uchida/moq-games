import {
  freshProfile,
  isRecord,
  legacyProfile,
  LEGACY_SAVE_KEY,
  MAX_LEGACY_SAVE_BYTES,
  parseBoundedJson,
  parseProfile,
  parseRunProgress,
  profileFromSave,
  runProgressFromSave,
  type ProfileData,
  type RunProgressData,
  type SaveData
} from './ProgressionData'

export const CAMPAIGN_SAVE_KEY = 'tower-jev-v3'
export const MAX_CAMPAIGN_SAVE_BYTES = 512 * 1024
const MAX_JSON_DEPTH = 32
const MAX_JSON_NODES = 32_768

export type EngineCheckpointValidator<T> = (value: unknown, progress: RunProgressData, profile: ProfileData) => T | null

export interface CampaignRun<T> {
  version: 1
  progress: RunProgressData
  engine: T
}

export interface CampaignSave<T> {
  version: 3
  profile: ProfileData
  run: CampaignRun<T> | null
}

export type CampaignLoadIssue =
  | 'storage-unavailable'
  | 'invalid-envelope'
  | 'unsupported-version'
  | 'invalid-profile'
  | 'invalid-run'
  | 'invalid-legacy'
  | null

export interface CampaignLoadResult<T> extends CampaignSave<T> {
  source: 'current' | 'legacy' | 'empty'
  issue: CampaignLoadIssue
}

function withoutRun<T>(
  profile: ProfileData,
  source: CampaignLoadResult<T>['source'],
  issue: CampaignLoadIssue
): CampaignLoadResult<T> {
  return { version: 3, profile, run: null, source, issue }
}

function loadLegacyProfile<T>(storage: Pick<Storage, 'getItem'>, issue: CampaignLoadIssue): CampaignLoadResult<T> {
  const raw = storage.getItem(LEGACY_SAVE_KEY),
    profile = legacyProfile(parseBoundedJson(raw, MAX_LEGACY_SAVE_BYTES))
  return profile
    ? withoutRun(profile, 'legacy', issue)
    : withoutRun(freshProfile(), 'empty', issue ?? (raw === null ? null : 'invalid-legacy'))
}

export function loadCampaignSave<T>(
  validateEngine: EngineCheckpointValidator<T>,
  storage?: Pick<Storage, 'getItem'>
): CampaignLoadResult<T> {
  try {
    const target = storage ?? globalThis.localStorage,
      raw = target.getItem(CAMPAIGN_SAVE_KEY)
    if (raw === null) return loadLegacyProfile(target, null)
    const value = parseBoundedJson(raw, MAX_CAMPAIGN_SAVE_BYTES)
    if (!isRecord(value)) return loadLegacyProfile(target, 'invalid-envelope')
    if (value.version !== 3) return loadLegacyProfile(target, 'unsupported-version')
    const profile = parseProfile(value.profile)
    if (!profile) return loadLegacyProfile(target, 'invalid-profile')
    if (value.run === null) return withoutRun(profile, 'current', null)
    const run = value.run
    if (!isRecord(run) || run.version !== 1) return withoutRun(profile, 'current', 'invalid-run')
    const progress = parseRunProgress(run.progress)
    if (!progress || !isBoundedJson(run.engine)) return withoutRun(profile, 'current', 'invalid-run')
    try {
      const engine = validateEngine(run.engine, progress, profile)
      if (!isRecord(engine) || !isBoundedJson(engine)) return withoutRun(profile, 'current', 'invalid-run')
      const migratedProfile = engine.profile === undefined ? profile : parseProfile(engine.profile)
      if (!migratedProfile) return withoutRun(profile, 'current', 'invalid-run')
      return {
        version: 3,
        profile: migratedProfile,
        run: { version: 1, progress, engine },
        source: 'current',
        issue: null
      }
    } catch {
      return withoutRun(profile, 'current', 'invalid-run')
    }
  } catch {
    return withoutRun(freshProfile(), 'empty', 'storage-unavailable')
  }
}

export function saveCampaignCheckpoint<T>(
  save: SaveData,
  engineSnapshot: unknown,
  validateEngine: EngineCheckpointValidator<T>,
  storage?: Pick<Storage, 'setItem'>
): boolean {
  try {
    const profile = parseProfile(profileFromSave(save)),
      progress = parseRunProgress(runProgressFromSave(save))
    if (!profile || !progress) return false
    const engine = validateEngine(engineSnapshot, progress, profile)
    if (!isRecord(engine)) return false
    const migratedProfile = engine.profile === undefined ? profile : parseProfile(engine.profile)
    if (!migratedProfile) return false
    return writeCampaignSave({ version: 3, profile: migratedProfile, run: { version: 1, progress, engine } }, storage)
  } catch {
    return false
  }
}

export function saveProfileWithoutRun(profile: ProfileData, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const sanitized = parseProfile(profile)
    return sanitized ? writeCampaignSave({ version: 3, profile: sanitized, run: null }, storage) : false
  } catch {
    return false
  }
}

function writeCampaignSave<T>(save: CampaignSave<T>, storage?: Pick<Storage, 'setItem'>): boolean {
  if (!isBoundedJson(save)) return false
  const raw = JSON.stringify(save)
  if (new TextEncoder().encode(raw).byteLength > MAX_CAMPAIGN_SAVE_BYTES) return false
  ;(storage ?? globalThis.localStorage).setItem(CAMPAIGN_SAVE_KEY, raw)
  return true
}

function isBoundedJson(value: unknown): boolean {
  let nodes = 0
  const ancestors = new Set<object>()
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) return false
    if (item === null || typeof item === 'boolean') return true
    if (typeof item === 'number') return Number.isFinite(item)
    if (typeof item === 'string') return item.length <= MAX_CAMPAIGN_SAVE_BYTES
    if (typeof item !== 'object' || ancestors.has(item)) return false
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      return false
    const children = Array.isArray(item) ? item : Object.values(item)
    if (children.length > MAX_JSON_NODES) return false
    ancestors.add(item)
    for (const child of children) {
      if (!visit(child, depth + 1)) {
        ancestors.delete(item)
        return false
      }
    }
    ancestors.delete(item)
    return true
  }
  return visit(value, 0)
}
