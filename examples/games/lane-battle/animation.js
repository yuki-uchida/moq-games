import { ATTACK_PROFILES } from '../tower_diffence_with_jev/src/game/AttackProfiles.ts'

/** Damage lands at phase 0: show the authored contact then, recover, rest, and wind up into the next strike. */
export function attackSeconds(role, phase, period) {
  const { cueMs, durationMs } = ATTACK_PROFILES[role]
  const s = (cueMs / 1000 + phase) % period
  return s > durationMs / 1000 ? 0 : s
}
