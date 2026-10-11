import type { Unit } from '../game/model'
import type { SpriteDirection } from './UnitSprites'
import { UNIT_TRIAL_DEFAULTS, unitTrialArt, type UnitTrialArt } from './UnitArtTrial'

export const SOLDIER_TRIAL_CHARACTER = UNIT_TRIAL_DEFAULTS.soldier.character
export const SOLDIER_TRIAL_CYCLE_TRAVEL = UNIT_TRIAL_DEFAULTS.soldier.walkCycleTravelOverride
export const SOLDIER_TRIAL_DISPLAY_SCALE = UNIT_TRIAL_DEFAULTS.soldier.displayScale
export function soldierTrialScale(unit: Pick<Unit, 'owner' | 'type'>, enabled: boolean): number {
  return enabled && unit.owner === 'player' && unit.type === 'soldier' ? SOLDIER_TRIAL_DISPLAY_SCALE : 1
}
export interface SoldierTrialArt {
  readonly clips: Readonly<Record<string, string>>
  readonly idleClips: Readonly<Record<SpriteDirection, string>>
  readonly portrait: string
}

export function soldierTrialArt(base: URL): UnitTrialArt {
  return unitTrialArt('soldier', new URL('soldier-3d-trial/', base))
}

export function soldierTrialConfiguration(art: SoldierTrialArt): UnitTrialArt {
  return { ...UNIT_TRIAL_DEFAULTS.soldier, ...art }
}
