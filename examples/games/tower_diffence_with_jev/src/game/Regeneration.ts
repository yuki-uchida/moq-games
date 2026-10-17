import type { Unit } from './model'

export const PATCHLING_REGENERATION = { delay: 2, hpPerSecond: 4 } as const

/** Integrate only the quiet portion of this simulation step, never wall time. */
export function regenerationAmount(
  unit: Pick<Unit, 'type' | 'hp' | 'lastDamagedAt'>,
  time: number,
  dt: number
): number {
  if (unit.type !== 'clockworkPatchling' || unit.hp <= 0 || unit.lastDamagedAt === undefined || dt <= 0) return 0
  const eligible = Math.max(0, time - Math.max(time - dt, unit.lastDamagedAt + PATCHLING_REGENERATION.delay))
  return eligible * PATCHLING_REGENERATION.hpPerSecond
}
