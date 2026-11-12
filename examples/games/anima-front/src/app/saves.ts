/**
 * Saved progress (mission unlocks and best ranks) and the armory (selected animal, chosen loadout per animal,
 * 3 custom loadouts per animal). Versioned; older shapes migrate forward; every loadout passes
 * repairLoadout (→ sanitizeLoadout) on load.
 */
import { DIFFICULTIES, type Difficulty } from '../data/enemies'
import { PRESETS, presetById, type Loadout } from '../data/loadout'
import { MISSION_IDS, type MissionId } from '../data/missions'
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../data/species'
import { cloneLoadout, repairLoadout } from './loadouts'
import { clampNumber, isRecord, readJson, writeJson, type KeyValueStore } from './storage'

export const PROGRESS_KEY = 'progress'
export const ARMORY_KEY = 'armory'
export const CUSTOM_SLOTS = 3

export type Rank = 'S' | 'A' | 'B' | 'C'
export const RANKS: readonly Rank[] = ['S', 'A', 'B', 'C']
const rankValue = (r: Rank) => 4 - RANKS.indexOf(r)
const DIFF_VALUE: Record<Difficulty, number> = { easy: 0, normal: 1, hard: 2 }

export interface MissionRecord {
  rank: Rank
  score: number
  difficulty: Difficulty
  /** Clear time in seconds. */
  time: number
}

export interface Progress {
  version: 1
  /** Missions cleared at least once (any difficulty). */
  cleared: MissionId[]
  best: Partial<Record<MissionId, MissionRecord>>
  pvpPlayed: number
  pvpWins: number
  trainingDone: boolean
}

export const emptyProgress = (): Progress => ({
  version: 1,
  cleared: [],
  best: {},
  pvpPlayed: 0,
  pvpWins: 0,
  trainingDone: false
})

const isMission = (v: unknown): v is MissionId =>
  typeof v === 'string' && (MISSION_IDS as readonly string[]).includes(v)
const isRank = (v: unknown): v is Rank => typeof v === 'string' && (RANKS as readonly string[]).includes(v)
const isDifficulty = (v: unknown): v is Difficulty => typeof v === 'string' && v in DIFFICULTIES
export const isSpecies = (v: unknown): v is SpeciesId =>
  typeof v === 'string' && (SPECIES_IDS as readonly string[]).includes(v)

export function sanitizeProgress(raw: unknown): Progress {
  const out = emptyProgress()
  if (!isRecord(raw)) return out
  if (Array.isArray(raw.cleared)) out.cleared = MISSION_IDS.filter((id) => (raw.cleared as unknown[]).includes(id))
  if (isRecord(raw.best)) {
    for (const [id, rec] of Object.entries(raw.best)) {
      if (!isMission(id) || !isRecord(rec) || !isRank(rec.rank)) continue
      out.best[id] = {
        rank: rec.rank,
        score: clampNumber(rec.score, 0, 1e7, 0),
        difficulty: isDifficulty(rec.difficulty) ? rec.difficulty : 'normal',
        time: clampNumber(rec.time, 0, 1e6, 0)
      }
      if (!out.cleared.includes(id)) out.cleared.push(id)
    }
    out.cleared = MISSION_IDS.filter((id) => out.cleared.includes(id))
  }
  out.pvpPlayed = Math.floor(clampNumber(raw.pvpPlayed, 0, 1e6, 0))
  out.pvpWins = Math.min(out.pvpPlayed, Math.floor(clampNumber(raw.pvpWins, 0, 1e6, 0)))
  out.trainingDone = raw.trainingDone === true
  return out
}

/** Missions unlock in order: the first is always open, each next one once the previous is cleared. */
export function missionUnlocked(progress: Progress, id: MissionId): boolean {
  const i = MISSION_IDS.indexOf(id)
  return i <= 0 || progress.cleared.includes(MISSION_IDS[i - 1])
}

/** True when `next` beats `prev`: higher rank, then higher difficulty, then higher score. */
export function isBetterRecord(next: MissionRecord, prev: MissionRecord | undefined): boolean {
  if (!prev) return true
  if (rankValue(next.rank) !== rankValue(prev.rank)) return rankValue(next.rank) > rankValue(prev.rank)
  if (DIFF_VALUE[next.difficulty] !== DIFF_VALUE[prev.difficulty]) {
    return DIFF_VALUE[next.difficulty] > DIFF_VALUE[prev.difficulty]
  }
  return next.score > prev.score
}

/** Records a finished mission; only victories count as cleared. Returns the new progress and whether a best was set. */
export function recordMission(
  progress: Progress,
  id: MissionId,
  victory: boolean,
  record: MissionRecord | null
): { progress: Progress; newBest: boolean; unlocked: MissionId | null } {
  const next: Progress = { ...progress, cleared: [...progress.cleared], best: { ...progress.best } }
  let newBest = false
  let unlocked: MissionId | null = null
  if (victory) {
    if (!next.cleared.includes(id)) {
      next.cleared = MISSION_IDS.filter((m) => m === id || next.cleared.includes(m))
      const after = MISSION_IDS[MISSION_IDS.indexOf(id) + 1]
      if (after && missionUnlocked(next, after) && !missionUnlocked(progress, after)) unlocked = after
    }
    if (record && isBetterRecord(record, next.best[id])) {
      next.best[id] = { ...record }
      newBest = true
    }
  }
  return { progress: next, newBest, unlocked }
}

export function recordPvp(progress: Progress, won: boolean): Progress {
  return { ...progress, pvpPlayed: progress.pvpPlayed + 1, pvpWins: progress.pvpWins + (won ? 1 : 0) }
}

export const loadProgress = (store: KeyValueStore | null) => sanitizeProgress(readJson(store, PROGRESS_KEY))
export const saveProgress = (store: KeyValueStore | null, p: Progress) => writeJson(store, PROGRESS_KEY, p)

// ---------------------------------------------------------------------------------------------------------------
// Armory

export type LoadoutChoice = { kind: 'preset'; id: string } | { kind: 'custom'; index: number }

export interface CustomLoadout {
  name: string
  loadout: Loadout
  /** Epoch ms of the last save. */
  savedAt: number
}

export interface Armory {
  version: 2
  species: SpeciesId
  choice: Record<SpeciesId, LoadoutChoice>
  custom: Record<SpeciesId, (CustomLoadout | null)[]>
}

export const defaultChoice = (species: SpeciesId): LoadoutChoice => ({ kind: 'preset', id: SPECIES[species].preset })

export function emptyArmory(): Armory {
  const choice = {} as Record<SpeciesId, LoadoutChoice>
  const custom = {} as Record<SpeciesId, (CustomLoadout | null)[]>
  for (const id of SPECIES_IDS) {
    choice[id] = defaultChoice(id)
    custom[id] = Array.from({ length: CUSTOM_SLOTS }, () => null)
  }
  return { version: 2, species: 'shiba', choice, custom }
}

const cleanName = (v: unknown, fallback: string) => {
  if (typeof v !== 'string') return fallback
  const s = v
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 16)
  return s || fallback
}

/**
 * Migrates and repairs a stored armory. Version 1 (the first prototype) stored `custom` as plain loadout
 * arrays without names and `selected` instead of `species`.
 */
export function sanitizeArmory(raw: unknown, sanitize?: (l: unknown) => Loadout): Armory {
  const out = emptyArmory()
  if (!isRecord(raw)) return out
  const version = typeof raw.version === 'number' ? raw.version : 1
  const species = version >= 2 ? raw.species : raw.selected
  if (isSpecies(species)) out.species = species
  const custom = isRecord(raw.custom) ? raw.custom : {}
  for (const id of SPECIES_IDS) {
    const list = Array.isArray(custom[id]) ? (custom[id] as unknown[]) : []
    for (let i = 0; i < CUSTOM_SLOTS; i++) {
      const entry = list[i]
      if (entry == null) continue
      if (version < 2) {
        // v1: the entry is the loadout itself
        out.custom[id][i] = { name: `カスタム${i + 1}`, loadout: repairLoadout(entry, sanitize), savedAt: 0 }
      } else if (isRecord(entry)) {
        out.custom[id][i] = {
          name: cleanName(entry.name, `カスタム${i + 1}`),
          loadout: repairLoadout(entry.loadout, sanitize),
          savedAt: clampNumber(entry.savedAt, 0, 1e15, 0)
        }
      }
    }
    const choice = isRecord(raw.choice) ? raw.choice[id] : undefined
    if (isRecord(choice)) {
      if (choice.kind === 'preset' && typeof choice.id === 'string' && PRESETS.some((p) => p.id === choice.id)) {
        out.choice[id] = { kind: 'preset', id: choice.id }
      } else if (choice.kind === 'custom' && typeof choice.index === 'number') {
        const index = Math.floor(choice.index)
        if (index >= 0 && index < CUSTOM_SLOTS && out.custom[id][index]) out.choice[id] = { kind: 'custom', index }
      }
    }
  }
  return out
}

export const loadArmory = (store: KeyValueStore | null, sanitize?: (l: unknown) => Loadout) =>
  sanitizeArmory(readJson(store, ARMORY_KEY), sanitize)
export const saveArmory = (store: KeyValueStore | null, a: Armory) => writeJson(store, ARMORY_KEY, a)

/** The loadout an animal deploys with and its display name. */
export function resolveLoadout(armory: Armory, species: SpeciesId): { loadout: Loadout; name: string } {
  const choice = armory.choice[species] ?? defaultChoice(species)
  if (choice.kind === 'custom') {
    const entry = armory.custom[species]?.[choice.index]
    if (entry) return { loadout: cloneLoadout(entry.loadout), name: entry.name }
  }
  const preset = presetById(choice.kind === 'preset' ? choice.id : SPECIES[species].preset)
  return { loadout: cloneLoadout(preset.loadout), name: preset.name }
}

export function storeCustom(armory: Armory, species: SpeciesId, index: number, entry: CustomLoadout): Armory {
  const custom = { ...armory.custom, [species]: [...armory.custom[species]] }
  custom[species][index] = { name: entry.name, loadout: cloneLoadout(entry.loadout), savedAt: entry.savedAt }
  return { ...armory, custom, choice: { ...armory.choice, [species]: { kind: 'custom', index } } }
}

export function deleteCustom(armory: Armory, species: SpeciesId, index: number): Armory {
  const custom = { ...armory.custom, [species]: [...armory.custom[species]] }
  custom[species][index] = null
  const current = armory.choice[species]
  const choice =
    current.kind === 'custom' && current.index === index
      ? { ...armory.choice, [species]: defaultChoice(species) }
      : armory.choice
  return { ...armory, custom, choice }
}
