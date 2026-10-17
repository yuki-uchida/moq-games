import { effectiveArmor } from './CommanderSupport'
import type { CombatAttack, Unit, UnitType } from './model'

export function attackDamageType(type: UnitType): NonNullable<CombatAttack['damageType']> {
  if (type === 'archer' || type === 'ranger') return 'arrow'
  if (['mage', 'frost', 'shaman', 'wraith', 'dragon'].includes(type)) return 'magic'
  return type === 'cannon' ? 'physical' : 'melee'
}

export function incomingDamage(power: number, victim: Unit, time: number, type?: CombatAttack['damageType']): number {
  const affinity =
    victim.type === 'crystalSentinel'
      ? type === 'magic'
        ? 0.7
        : type === 'melee' || type === 'arrow' || type === 'physical'
          ? 1.2
          : 1
      : victim.type === 'tank' || victim.type === 'beetle'
        ? type === 'arrow'
          ? 0.7
          : type === 'magic'
            ? 1.3
            : 1
        : 1
  return power * (1 - effectiveArmor(victim, time)) * affinity
}
