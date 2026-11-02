import { canTargetUnit, type AllyType, type GameState, type Point, type Unit } from './model'
import { SPECIALS, specialReady } from './SpecialAbilities'

/** Healer is skipped below this total missing-HP ratio inside the circle. */
export const HEALER_MIN_SCORE = 0.15

/**
 * Pure auto-aim for a one-tap special. Candidates are unit positions inside the caster's range;
 * the best one is the circle that holds the most (boss = 3) targetable enemies, ties go to the
 * enemy closest to the gate. Returns null when the unit is not ready or nothing is worth hitting.
 */
export function bestSpecialTarget(
  state: Readonly<GameState>,
  unitId: number
): { point: Point; score: number } | null {
  const caster = state.units.find((u) => u.id === unitId)
  if (!caster || !specialReady(state, unitId)) return null
  const type = caster.type as AllyType,
    spec = SPECIALS[type],
    heal = type === 'healer',
    pool = state.units.filter((u) =>
      u.hp > 0 &&
      (heal ? u.owner === 'player' : u.owner === 'ai' && canTargetUnit({ owner: 'player', type }, u, state.battlefieldVersion))
    ),
    weight = (u: Unit) => (heal ? 1 - u.hp / u.maxHp : u.boss ? 3 : 1)
  let best: { point: Point; score: number; progress: number } | null = null
  for (const candidate of pool) {
    if (Math.hypot(candidate.x - caster.x, candidate.y - caster.y) > spec.range) continue
    const point = { x: candidate.x, y: candidate.y }
    if (!specialReady(state, unitId, point)) continue
    let score = 0
    for (const u of pool) if (Math.hypot(u.x - point.x, u.y - point.y) <= spec.radius) score += weight(u)
    if (
      !best ||
      score > best.score + 1e-9 ||
      (Math.abs(score - best.score) <= 1e-9 && candidate.progress > best.progress)
    )
      best = { point, score, progress: candidate.progress }
  }
  if (!best || best.score <= 0 || (heal && best.score < HEALER_MIN_SCORE)) return null
  return { point: best.point, score: best.score }
}

/** True when the circle around `point` would catch a boss (AUTO fires at score >= 1 then). */
export function bossInSpecialArea(state: Readonly<GameState>, type: AllyType, point: Point): boolean {
  return state.units.some(
    (u) =>
      u.owner === 'ai' &&
      u.boss &&
      u.hp > 0 &&
      canTargetUnit({ owner: 'player', type }, u, state.battlefieldVersion) &&
      Math.hypot(u.x - point.x, u.y - point.y) <= SPECIALS[type].radius
  )
}
