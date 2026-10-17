import type { CombatAttack, Unit, UnitType } from './model'

export interface AttackProfile {
  durationMs: number
  cue: 'hit' | 'release'
  cueMs: number
  flightMs: number
}

export const ATTACK_PROFILES: Record<UnitType, AttackProfile> = {
  crystalSentinel: { durationMs: 1500, cue: 'hit', cueMs: (26 / 30) * 1000, flightMs: 0 },
  koboldLancer: { durationMs: 1200, cue: 'hit', cueMs: (19 / 30) * 1000, flightMs: 0 },
  clockworkPatchling: { durationMs: 1200, cue: 'hit', cueMs: 800, flightMs: 0 },
  soldier: { durationMs: 600, cue: 'hit', cueMs: 315, flightMs: 0 },
  archer: { durationMs: 800, cue: 'release', cueMs: 433, flightMs: 220 },
  slime: { durationMs: 960, cue: 'hit', cueMs: 420, flightMs: 0 },
  mage: { durationMs: 960, cue: 'release', cueMs: 520, flightMs: 220 },
  healer: { durationMs: 960, cue: 'release', cueMs: 600, flightMs: 220 },
  wolf: { durationMs: 750, cue: 'hit', cueMs: 285, flightMs: 0 },
  bat: { durationMs: 600, cue: 'hit', cueMs: 250, flightMs: 0 },
  runner: { durationMs: 480, cue: 'hit', cueMs: 240, flightMs: 0 },
  frost: { durationMs: 768, cue: 'release', cueMs: 416, flightMs: 220 },
  tank: { durationMs: 864, cue: 'hit', cueMs: 468, flightMs: 0 },
  paladin: { durationMs: 768, cue: 'hit', cueMs: 416, flightMs: 0 },
  brute: { durationMs: 1200, cue: 'hit', cueMs: 660, flightMs: 0 },
  beetle: { durationMs: 960, cue: 'hit', cueMs: 420, flightMs: 0 },
  wraith: { durationMs: 960, cue: 'release', cueMs: 420, flightMs: 220 },
  ranger: { durationMs: 1200, cue: 'release', cueMs: 750, flightMs: 220 },
  cannon: { durationMs: 1320, cue: 'release', cueMs: 660, flightMs: 220 },
  goblin: { durationMs: 864, cue: 'hit', cueMs: 396, flightMs: 0 },
  shaman: { durationMs: 960, cue: 'release', cueMs: 520, flightMs: 220 },
  ogre: { durationMs: 1200, cue: 'hit', cueMs: 660, flightMs: 0 },
  dragon: { durationMs: 1000, cue: 'release', cueMs: 500, flightMs: 220 }
}

// Scale simulation deadlines, never the immutable authored atlas or projectile flight.
export const ENEMY_ACTION_TIME_SCALE = 0.8 as const
export function attackTimeScale(action: Pick<CombatAttack, 'timeScale'> | undefined): 1 | 0.8 {
  return action?.timeScale ?? 1
}
export function attackAssetElapsedMs(action: Pick<CombatAttack, 'startedAt' | 'timeScale'>, now: number): number {
  return Math.max(0, ((now - action.startedAt) * 1000) / attackTimeScale(action))
}

export const ENEMY_ATTACK_PACING = {
  extraCooldown: 0.15,
  walkDistance: 28,
  minimumWalkSeconds: 0.35,
  maximumWalkSeconds: 0.65
}

export function enemyAttackInterval(unit: Pick<Unit, 'speed' | 'attackSpeed'>, durationMs: number): number {
  const walkSeconds = Math.max(
    ENEMY_ATTACK_PACING.minimumWalkSeconds,
    Math.min(ENEMY_ATTACK_PACING.maximumWalkSeconds, ENEMY_ATTACK_PACING.walkDistance / Math.max(1, unit.speed))
  )
  return Math.max(1 / unit.attackSpeed + ENEMY_ATTACK_PACING.extraCooldown, durationMs / 1000 + walkSeconds)
}

export const COMBAT_ATTACK_INTERVAL_MULTIPLIER = 2

export function combatAttackInterval(unit: Pick<Unit, 'owner' | 'speed' | 'attackSpeed'>, durationMs: number): number {
  const interval = unit.owner === 'ai' ? enemyAttackInterval(unit, durationMs) : 1 / unit.attackSpeed
  return interval * COMBAT_ATTACK_INTERVAL_MULTIPLIER
}
