import type { MatchSnapshot, PlayerId } from './match'
import { createRitualState, interactRitual, isRitualStateForMatch, type RitualState } from './ritual'
import type { Pose, WorldFrame } from './world'

export type EffectEvent = {
  id: number
  round: 'round1' | 'round2'
  kind: 'apparition' | 'blackout' | 'rattle'
  elapsedMs: number
}
export type EffectPlayback = { seen: number; effect: WorldFrame['effect'] }

export function ritualForMatch(state: RitualState | null, match: MatchSnapshot): RitualState | null {
  return isRitualStateForMatch(state, match) ? state : createRitualState(match)
}

export function requestRitual(
  state: RitualState | null,
  match: MatchSnapshot,
  actor: PlayerId,
  pose: Pose,
  round: unknown,
  step: unknown
): RitualState | null {
  return round === match.phase ? interactRitual(state, match, actor, pose, step) : null
}

export function acceptRitual(
  previous: RitualState | null,
  incoming: unknown,
  match: MatchSnapshot
): incoming is RitualState | null {
  if (match.phase !== 'round1' && match.phase !== 'round2') return incoming === null
  return (
    isRitualStateForMatch(incoming, match) &&
    (!previous || previous.round !== incoming.round || incoming.completed >= previous.completed)
  )
}

export function validEffect(value: unknown, match: MatchSnapshot): value is EffectEvent | null {
  if (value === null) return true
  if (match.phase !== 'round1' && match.phase !== 'round2') return false
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return (
    Number.isSafeInteger(event.id) &&
    (event.id as number) > 0 &&
    event.round === match.phase &&
    !match.paused &&
    (event.kind === 'apparition' || event.kind === 'blackout' || event.kind === 'rattle') &&
    typeof event.elapsedMs === 'number' &&
    Number.isFinite(event.elapsedMs) &&
    event.elapsedMs >= 0 &&
    event.elapsedMs <= match.elapsedMs
  )
}

export function receiveEffect(
  playback: EffectPlayback,
  event: EffectEvent | null,
  match: MatchSnapshot,
  nowMs: number
): { playback: EffectPlayback; playSound: boolean } {
  if (!event || !validEffect(event, match)) return { playback: { ...playback, effect: null }, playSound: false }
  if (event.id <= playback.seen) return { playback, playSound: false }
  const age = match.elapsedMs - event.elapsedMs
  const active = age < 3500 && Number.isFinite(nowMs)
  return {
    playback: {
      seen: event.id,
      effect: active
        ? {
            kind: event.kind,
            startedAt: (nowMs - age) / 1000,
            ...(event.kind === 'apparition' ? { id: event.id } : {})
          }
        : null
    },
    playSound: active
  }
}

const phaseOrder = ['lobby', 'round1', 'intermission', 'round2', 'finished']
export function freshSnapshot(
  previous: MatchSnapshot,
  incoming: MatchSnapshot,
  previousSequence: number,
  sequence: unknown
): sequence is number {
  if (!Number.isSafeInteger(sequence) || (sequence as number) <= previousSequence) return false
  const before = phaseOrder.indexOf(previous.phase),
    after = phaseOrder.indexOf(incoming.phase)
  return after >= before && (after !== before || incoming.elapsedMs >= previous.elapsedMs)
}
