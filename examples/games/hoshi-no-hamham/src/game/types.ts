/** Shared game types and the stage-data contract. */
import type { ThemeId } from '../art/contract'

export const TILE = 64

export type EnemyKind = 'walker' | 'flyer' | 'jumper' | 'spitter' | 'tough'
export type BossKind = 'chaser' | 'brute' | 'flyer' | 'tank' | 'swarm' | 'final'
export type PropKind =
  | 'tree'
  | 'pine'
  | 'pipe'
  | 'hive'
  | 'animal'
  | 'rock'
  | 'switch'
  | 'door'
  | 'fruit'
  | 'twig'
  | 'berry'
  | 'star'
  | 'goal'
  | 'nest'
  | 'princess'

export interface BossDef {
  kind: BossKind
  name: string
  title: string
  hp: number
  speed: number
  scale: number
  art: string
  minions: EnemyKind[]
  shockwave: boolean
  projectiles: number
  dive: boolean
  /** Chaser bosses (ハム代) have stamina instead of a defeat condition. */
  stamina?: boolean
}

export type Objective = 'reach' | 'collect' | 'boss'

export interface StageDef {
  id: string
  no: number
  name: string
  subtitle: string
  theme: ThemeId
  map: readonly string[]
  boss: BossDef
  objective: Objective
  /** Materials required for a `collect` objective. */
  collect?: number
  intro: readonly string[]
  clear: readonly string[]
  hints: readonly string[]
}

export type VolumeKind = 'master' | 'music' | 'sfx'
/** Volume settings, each 0..1. */
export type Volumes = Record<VolumeKind, number>

export const DEFAULT_VOLUMES: Volumes = { master: 1, music: 0.8, sfx: 1 }

export interface SaveData {
  version: 1
  cleared: number[]
  unlocked: number
  best: Record<string, number>
  muted: boolean
  seenOpening: boolean
  volume: Volumes
}

export const SAVE_KEY = 'hoshi-no-hamham-v1'

export function emptySave(): SaveData {
  return {
    version: 1,
    cleared: [],
    unlocked: 1,
    best: {},
    muted: false,
    seenOpening: false,
    volume: { ...DEFAULT_VOLUMES }
  }
}

/** Saved volumes, with anything missing or out of range replaced by the default. */
export function readVolumes(saved: Partial<Volumes> | undefined): Volumes {
  const volumes = { ...DEFAULT_VOLUMES }
  for (const kind of Object.keys(volumes) as VolumeKind[]) {
    const value = saved?.[kind]
    if (typeof value === 'number' && Number.isFinite(value)) volumes[kind] = Math.max(0, Math.min(1, value))
  }
  return volumes
}

export function loadSave(): SaveData {
  if (typeof localStorage === 'undefined') return emptySave()
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return emptySave()
    const parsed = JSON.parse(raw) as Partial<SaveData>
    if (parsed.version !== 1) return emptySave()
    return { ...emptySave(), ...parsed, version: 1, volume: readVolumes(parsed.volume) }
  } catch {
    return emptySave()
  }
}

export function storeSave(save: SaveData) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    /* storage can be unavailable; the game still runs */
  }
}
