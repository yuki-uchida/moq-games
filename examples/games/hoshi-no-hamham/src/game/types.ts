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

export interface SaveData {
  version: 1
  cleared: number[]
  unlocked: number
  best: Record<string, number>
  muted: boolean
  seenOpening: boolean
}

export const SAVE_KEY = 'hoshi-no-hamham-v1'

export function emptySave(): SaveData {
  return { version: 1, cleared: [], unlocked: 1, best: {}, muted: false, seenOpening: false }
}

export function loadSave(): SaveData {
  if (typeof localStorage === 'undefined') return emptySave()
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return emptySave()
    const parsed = JSON.parse(raw) as Partial<SaveData>
    if (parsed.version !== 1) return emptySave()
    return { ...emptySave(), ...parsed, version: 1 }
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
