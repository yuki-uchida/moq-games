import {
  ALLY_TYPES,
  CONFIG,
  ENEMY_TYPES,
  stageRules,
  type DamageSourceType,
  type EnemyType,
  type GameState,
  type RouteId,
  type UnitType
} from './model'
import { FORTIFICATIONS } from './Fortifications'

/** Ten retained defenders, ten placed road items, and the gate. Stage ownership never reuses an ID. */
export const ENEMY_HISTORY_LIMITS = {
  enemies: stageRules(CONFIG.stages).enemyCount,
  sourcesPerEnemy: ALLY_TYPES.length + FORTIFICATIONS.maxItems + 1,
  outcomes: 3,
  outcomeSources: 4,
  trends: 4
} as const
export interface HistorySource {
  sourceKind: 'unit' | 'trap' | 'turret'
  sourceId: number
  sourceType: DamageSourceType
}
export interface HistorySourceDamage extends HistorySource {
  damage: number
}
export interface EnemyDamageLedger {
  enemyId: number
  enemyType: EnemyType
  boss: boolean
  totalDamage: number
  sources: HistorySourceDamage[]
  omittedContributions: number
  omittedDamage: number
  legacyUnknown: boolean
}
export interface EnemyOutcome {
  id: string
  at: number
  enemyId: number
  enemyType: EnemyType
  boss: boolean | null
  routeId: RouteId | null
  progress: number | null
  x: number
  y: number
  flightPhase: 'approach' | 'engage' | 'return' | null
  cause: 'combat-death' | 'gate-exit'
  receivedDamage: number
  attributionComplete: boolean
  legacyUnknown: boolean
  lastKiller: HistorySource | null
  lethalContributors: HistorySourceDamage[]
  omittedLethalContributors: number
  omittedLethalDamage: number
}
export interface EnemyOutcomeSummary extends EnemyOutcome {
  sources: HistorySourceDamage[]
  omittedSources: number
  /** Untracked receipts; their distinct source count is unknown. */
  omittedContributions: number
  omittedDamage: number
}
export interface DamageTrend extends HistorySourceDamage {
  enemyType: EnemyType
  defeatedVictims: number
}
export interface HistoryOmissions {
  /** Counts/damage cover the stage, including receipts evicted from the recent ring. */
  contributions: number
  damage: number
  outcomes: number
  trends: number
  trendDamage: number
}
export const sourceKind = (type: DamageSourceType): HistorySource['sourceKind'] =>
  type === 'gate' ? 'turret' : type === 'spike' ? 'trap' : 'unit'
export const sourceKey = (source: HistorySource): string =>
  `${source.sourceKind}:${source.sourceId}:${source.sourceType}`
export const enemyType = (type: UnitType | null): type is EnemyType => !!type && ENEMY_TYPES.includes(type as EnemyType)
export function exactVictimType(state: Pick<GameState, 'units' | 'corpses'>, id: number): UnitType | null {
  return (
    state.units.find((unit) => unit.id === id)?.type ?? state.corpses.find((corpse) => corpse.id === id)?.type ?? null
  )
}
