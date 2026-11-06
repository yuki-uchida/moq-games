import type { MatchSnapshot, PlayerId } from './match'
import { RITUAL_RADIUS, ritualWard, type RitualState } from './ritual'
import type { Pose } from './world'

export type EffectKind = 'apparition' | 'blackout' | 'rattle'
export type SpiritState = { round: 'round1' | 'round2'; energy: number; at: number; last: number | null }
export const COST: Record<EffectKind, number> = { apparition: 45, blackout: 35, rattle: 20 }

export function spiritForMatch(state: SpiritState | null, match: MatchSnapshot): SpiritState | null {
  if (match.phase !== 'round1' && match.phase !== 'round2') return null
  return state?.round === match.phase ? state : { round: match.phase, energy: 100, at: 0, last: null }
}

export function spiritStatus(
  state: SpiritState,
  match: MatchSnapshot,
  kind: EffectKind,
  human: Pose,
  haunter: Pose,
  ritual: RitualState | null = null
) {
  const elapsed = match.elapsedMs - state.at
  const energy = Math.min(100, state.energy + Math.max(0, elapsed) * 0.002)
  const cooldown = state.last === null ? 0 : Math.max(0, 8000 - (match.elapsedMs - state.last))
  const ward = ritualWard(ritual, match)
  const reason =
    match.phase !== state.round || match.paused || !Number.isFinite(elapsed) || elapsed < 0
      ? '中断中またはラウンド外'
      : kind === 'apparition' && Math.hypot(human.x - haunter.x, human.z - haunter.z) > 5.5
        ? '人間まで5.5以内に接近'
        : kind === 'apparition' && ward && Math.hypot(human.x - ward.x, human.z - ward.z) <= RITUAL_RADIUS
          ? '人間が調査済み地点の出現止めの範囲内'
          : energy < COST[kind]
            ? '霊力不足'
            : cooldown > 0
              ? '共通クールダウン中'
              : ''
  return { energy, cooldown, reason }
}

export function requestSpirit(
  state: SpiritState | null,
  match: MatchSnapshot,
  actor: PlayerId,
  round: unknown,
  kind: unknown,
  human: Pose,
  haunter: Pose,
  ritual: RitualState | null = null
): SpiritState | null {
  if (
    !state ||
    round !== match.phase ||
    (actor !== 'host' && actor !== 'guest') ||
    actor === match.survivor ||
    (kind !== 'apparition' && kind !== 'blackout' && kind !== 'rattle') ||
    ![human.x, human.z, haunter.x, haunter.z].every(Number.isFinite)
  )
    return null
  const status = spiritStatus(state, match, kind, human, haunter, ritual)
  if (status.reason) return null
  return { ...state, energy: status.energy - COST[kind], at: match.elapsedMs, last: match.elapsedMs }
}

export function acceptSpirit(
  previous: SpiritState | null,
  incoming: unknown,
  match: MatchSnapshot
): incoming is SpiritState | null {
  if (match.phase !== 'round1' && match.phase !== 'round2') return incoming === null
  if (!incoming || typeof incoming !== 'object') return false
  const state = incoming as SpiritState
  return (
    state.round === match.phase &&
    Number.isFinite(state.energy) &&
    state.energy >= 0 &&
    state.energy <= 100 &&
    Number.isFinite(state.at) &&
    state.at >= 0 &&
    state.at <= match.elapsedMs &&
    (state.last === null
      ? state.at === 0 && state.energy === 100
      : Number.isFinite(state.last) && state.last === state.at) &&
    (!previous ||
      previous.round !== state.round ||
      (state.at >= previous.at &&
        (previous.last === null ||
          (state.last !== null &&
            (state.at === previous.at ? state.energy === previous.energy : state.at - previous.at >= 8000)))))
  )
}
