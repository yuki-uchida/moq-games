import type { CombatAttack, Unit, UnitType } from './model'

// Independent support actions never inherit offensive buffs. Only the existing
// Healer weapon slot adds its approved first-tier healing bonus.
// Dedicated Paladin full-body healing motion is not authored yet: its approved
// temporary presentation is a neutral body with a separate healing effect.
export const HEALING_ACTIONS = {
  healer: {
    range: 175,
    amount: 18,
    interval: 5,
    durationMs: 960,
    cue: 'release' as const,
    cueMs: 600,
    flightMs: 220
  },
  paladin: {
    range: 46,
    amount: 8,
    interval: 4,
    durationMs: 768,
    cue: 'hit' as const,
    cueMs: 416,
    flightMs: 0
  }
} as const

// Canonical decimal avoids 18 * 1.2 serializing as 21.599999999999998.
export const HEALER_WEAPON_HEAL_AMOUNT = 21.6

export function healingAction(unit: Pick<Unit, 'owner' | 'type'> & Partial<Pick<Unit, 'equipment'>>) {
  if (unit.owner !== 'player' || unit.type !== 'healer') return undefined
  const profile = HEALING_ACTIONS[unit.type]
  return {
    ...profile,
    amount: unit.type === 'healer' && unit.equipment === 'weapon' ? HEALER_WEAPON_HEAL_AMOUNT : profile.amount
  }
}

/** Preserves historical accepted quantities independently from live definitions. */
export function committedHealAmount(attack: Pick<CombatAttack, 'type' | 'healing'>): number {
  return attack.healing?.amount ?? (attack.type === 'healer' ? 18 : attack.type === 'paladin' ? 8 : 0)
}

export function canInitiateDamage(unit: { owner: string; type: UnitType }): boolean {
  return !(unit.owner === 'player' && unit.type === 'healer')
}

export function temporaryPaladinHeal(action: Pick<CombatAttack, 'kind' | 'type'> | undefined): boolean {
  return action?.kind === 'heal' && action.type === 'paladin'
}

export function observeHealing(unit: Readonly<Unit>) {
  const profile = healingAction(unit)
  return profile
    ? {
        kind: 'heal' as const,
        amount: profile.amount,
        range: profile.range,
        interval: profile.interval,
        readyIn: Math.max(0, unit.healCooldown ?? 0)
      }
    : undefined
}
