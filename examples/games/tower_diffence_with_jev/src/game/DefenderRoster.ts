import type { SaveData } from '../progression/ProgressionData'
import type { AllyType, GameState, Unit } from './model'

export const STARTING_GOLD = 160
export const DEPLOYMENT_COST = 40
export const REDEPLOY_RADIUS: Readonly<Record<AllyType, number>> = {
  soldier: 320,
  archer: 320,
  runner: 384,
  tank: 96,
  mage: 80,
  cannon: 64,
  healer: 160,
  frost: 128,
  ranger: 288,
  paladin: 160
}

export function retainedDefenders(state: Readonly<GameState>): Unit[] {
  return [...state.units.filter((unit) => unit.owner === 'player'), ...(state.reserveUnits ?? [])]
}

export function findDefender(state: Readonly<GameState>, unitId: number): Unit | undefined {
  return retainedDefenders(state).find((unit) => unit.id === unitId)
}

export function defenderLevel(unit: Readonly<Unit>, save: Pick<SaveData, 'economyVersion' | 'unitLevels'>): number {
  return save.economyVersion === 2 ? (unit.level ?? 1) : save.unitLevels[unit.type as AllyType]
}

export function canSpendOnRoster(
  save: Pick<SaveData, 'economyVersion' | 'gold'>,
  cost: number,
  state?: Readonly<GameState>
): boolean {
  return (
    save.gold >= cost &&
    (save.economyVersion !== 2 ||
      save.gold - cost >= DEPLOYMENT_COST ||
      !!state?.units.some((unit) => unit.owner === 'player' && unit.hp > 0))
  )
}
