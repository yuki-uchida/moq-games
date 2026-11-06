import type { MatchSnapshot, PlayerId } from './match'
import type { Pose } from './world'

export type RitualRound = 'round1' | 'round2'
export interface RitualState {
  readonly round: RitualRound
  readonly completed: number
}

export const RITUAL_RADIUS = 1
export const RITUAL_WARD_MS = 30_000
export const RITUAL_WARD_DELAY_MS = 60_000
export const RITUAL_STEPS = Object.freeze([
  Object.freeze({
    id: 'letter',
    x: -5,
    z: 4,
    availableMs: 0,
    text: '畳の下の手紙に、「あの子は鈴の音を頼りに帰る」とある。差出人の名は、墨で塗りつぶされていた。'
  }),
  Object.freeze({
    id: 'bell',
    x: -5,
    z: -5,
    availableMs: 240_000,
    text: '鈴がひとりでに鳴る。誰もいない廊下から、幼い声が「ただいま」と返した。'
  }),
  Object.freeze({
    id: 'mirror',
    x: 5,
    z: -5,
    availableMs: 540_000,
    text: '鏡には、背後の襖から覗く子が映る。振り返ると襖は閉じたまま、鈴の音だけが近づいてきた。'
  }),
  Object.freeze({
    id: 'seal',
    x: 5,
    z: 5,
    availableMs: 720_000,
    text: '封印の裏に「あの子を家に入れてはならない」とある。すぐ耳元で、もう一度「ただいま」と聞こえた。'
  })
] as const)

type RitualMatch = Pick<MatchSnapshot, 'phase' | 'survivor' | 'elapsedMs' | 'paused'>

export function isRitualState(value: unknown): value is RitualState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const state = value as Record<string, unknown>
  return (
    Object.keys(state).length === 2 &&
    (state.round === 'round1' || state.round === 'round2') &&
    typeof state.completed === 'number' &&
    Number.isInteger(state.completed) &&
    state.completed >= 0 &&
    state.completed <= RITUAL_STEPS.length
  )
}

function activeMatch(match: RitualMatch): match is RitualMatch & { phase: RitualRound } {
  return (
    (match.phase === 'round1' || match.phase === 'round2') &&
    match.survivor === (match.phase === 'round1' ? 'host' : 'guest') &&
    typeof match.paused === 'boolean' &&
    Number.isFinite(match.elapsedMs) &&
    match.elapsedMs >= 0 &&
    match.elapsedMs < 900_000
  )
}

export function createRitualState(match: RitualMatch): RitualState | null {
  return activeMatch(match) ? { round: match.phase, completed: 0 } : null
}

export function isRitualStateForMatch(value: unknown, match: RitualMatch): value is RitualState {
  return (
    activeMatch(match) &&
    isRitualState(value) &&
    value.round === match.phase &&
    (value.completed === 0 || RITUAL_STEPS[value.completed - 1].availableMs <= match.elapsedMs)
  )
}

export function ritualWard(state: unknown, match: RitualMatch) {
  if (!isRitualStateForMatch(state, match) || match.paused) return null
  const index = RITUAL_STEPS.findIndex(
    (step) =>
      match.elapsedMs >= step.availableMs + RITUAL_WARD_DELAY_MS &&
      match.elapsedMs < step.availableMs + RITUAL_WARD_DELAY_MS + RITUAL_WARD_MS
  )
  return index >= 0 && index < state.completed ? RITUAL_STEPS[index] : null
}

export function interactRitual(
  state: unknown,
  match: RitualMatch,
  actor: PlayerId,
  pose: Pose,
  stepId: unknown
): RitualState | null {
  if (!isRitualStateForMatch(state, match) || match.paused || actor !== match.survivor) return null
  const step = RITUAL_STEPS[state.completed]
  if (
    !step ||
    stepId !== step.id ||
    match.elapsedMs < step.availableMs ||
    !pose ||
    !Number.isFinite(pose.x) ||
    !Number.isFinite(pose.z) ||
    !Number.isFinite(pose.yaw) ||
    Math.hypot(pose.x - step.x, pose.z - step.z) > RITUAL_RADIUS
  )
    return null
  return { round: state.round, completed: state.completed + 1 }
}
