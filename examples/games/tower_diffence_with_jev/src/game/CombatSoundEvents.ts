import type { UnitType } from './model'

export const EFFECT_SOUND_BINDINGS = {
  healer_heal: { unitType: 'healer', kind: 'heal_apply' },
  support_heal: { unitType: 'commander', kind: 'support_heal_apply' },
  support_speed: { unitType: 'commander', kind: 'support_speed_apply' },
  support_armor: { unitType: 'commander', kind: 'support_armor_apply' },
  support_attack: { unitType: 'commander', kind: 'support_attack_apply' },
  mud_slow_apply: { unitType: 'environment', kind: 'mud_slow_apply' },
  terrain_slow_enter: { unitType: 'environment', kind: 'terrain_slow_enter' }
} as const
export type EffectSoundKey = keyof typeof EFFECT_SOUND_BINDINGS
export type SoundUnitType = UnitType | 'commander' | 'environment'
export type CombatSoundKind =
  | 'hit'
  | 'release'
  | 'breath_start'
  | 'slow_apply'
  | (typeof EFFECT_SOUND_BINDINGS)[EffectSoundKey]['kind']

const effectKeys = new Map<string, EffectSoundKey>(
  Object.entries(EFFECT_SOUND_BINDINGS).map(([key, binding]) => [
    `${binding.unitType}:${binding.kind}`,
    key as EffectSoundKey
  ])
)

export function soundEventKey(event: { unitType: SoundUnitType; kind: CombatSoundKind }): string | undefined {
  const effect = effectKeys.get(`${event.unitType}:${event.kind}`)
  if (effect) return effect
  if (event.unitType === 'healer' || event.unitType === 'commander' || event.unitType === 'environment')
    return undefined
  if (event.kind === 'hit' || event.kind === 'release') return `${event.unitType}_attack`
  if (event.unitType === 'dragon' && event.kind === 'breath_start') return 'dragon_breath'
  if (event.unitType === 'frost' && event.kind === 'slow_apply') return 'frost_slow_apply'
  return undefined
}

export interface CombatSoundEvent {
  id: string
  attackId: string
  attackerId: number
  unitType: SoundUnitType
  kind: CombatSoundKind
  at: number
  battleId: number
  stage: number
}

export const COMBAT_SOUND_QUEUE_LIMIT = 128
