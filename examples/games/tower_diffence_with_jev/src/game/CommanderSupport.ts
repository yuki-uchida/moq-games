import { canInitiateDamage } from './HealingActions'
import {
  DEFINITIONS,
  fieldFor,
  isAirborneEnemy,
  observeBattlefield,
  type EnemyType,
  type FieldId,
  type GameState,
  type Unit
} from './model'
import { observeFortifications } from './Fortifications'
import { observeSupportCombat, observeSupportCombatRules, observeSupportProjectiles } from './SupportCombatObservation'

export const SUPPORT_EFFECTS = ['heal', 'speed', 'armor', 'attack'] as const
export type SupportEffect = (typeof SUPPORT_EFFECTS)[number]
export interface SupportAction {
  type: 'support'
  effect: SupportEffect
  targetId: number
}
export type SupportAIResult =
  | {
      action: SupportAction
      source: 'jev'
      scoreSource?: 'provided-scores' | 'selected-action-fallback'
      scores?: { action: SupportAction; score: number }[]
      probabilityEvidence?: {
        offeredActions: SupportAction[]
        provided: { action: SupportAction; probability: number }[]
        status: 'complete' | 'partial' | 'unavailable'
      }
    }
  | { type: 'unavailable'; reason: string; source: string }
  | null
export const COMMANDER_SUPPORT = {
  firstReadyAt: 10,
  cooldown: 10,
  castSeconds: 0.6,
  duration: 5,
  healFraction: 0.15,
  maximumHeal: 40,
  speedMultiplier: 1.15,
  attackMultiplier: 1.15,
  armorBonus: 0.1,
  maximumArmor: 0.6,
  maxCandidates: 96,
  historyLimit: 16,
  requestIntervalMs: 10000,
  maximumReplyAgeMs: 2500,
  retrySeconds: 1
} as const
export const SUPPORT_UNAVAILABLE_REASONS = [
  'no-legal-actions',
  'backoff',
  'busy',
  'throttled',
  'not-configured',
  'timeout',
  'error',
  'unavailable',
  'invalid',
  'stale',
  'mode-changed'
] as const
export type SupportUnavailableReason = (typeof SUPPORT_UNAVAILABLE_REASONS)[number]
export interface SupportBuff {
  effect: Exclude<SupportEffect, 'heal'>
  sequence: number
  startedAt: number
  expiresAt: number
}
export interface SupportCast {
  id: string
  sequence: number
  stage: number
  fieldId: FieldId
  action: SupportAction
  startedAt: number
  applyAt: number
  target: { id: number; type: EnemyType; x: number; y: number }
  source: 'jev'
}
export interface SupportEvent extends SupportCast {
  legacyBossHeal?: true
  resolvedAt: number
  outcome: 'applied' | 'target-lost' | 'cancelled' | 'ineligible'
  amount: number
}
export interface CommanderSupportState {
  sequence: number
  nextReadyAt: number
  cast: SupportCast | null
  history: SupportEvent[]
  status: 'waiting' | 'ready' | 'requesting' | 'casting' | 'cooldown' | 'unavailable' | 'disabled'
  reason: SupportUnavailableReason | null
  retryAt: number
}
export function freshCommanderSupport(): CommanderSupportState {
  return {
    sequence: 0,
    nextReadyAt: COMMANDER_SUPPORT.firstReadyAt,
    cast: null,
    history: [],
    status: 'waiting',
    reason: null,
    retryAt: 0
  }
}
export function isSupportAction(value: unknown): value is SupportAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const action = value as Record<string, unknown>
  return (
    Object.keys(action).length === 3 &&
    action.type === 'support' &&
    SUPPORT_EFFECTS.includes(action.effect as SupportEffect) &&
    Number.isSafeInteger(action.targetId) &&
    (action.targetId as number) > 0
  )
}
export function supportActionKey(action: SupportAction): string {
  return `support:${action.effect}:${action.targetId}`
}
export function activeSupportBuff(unit: Readonly<Unit>, time: number): SupportBuff | undefined {
  const buff = unit.supportBuff
  return buff && time >= buff.startedAt && time + 1e-9 < buff.expiresAt ? buff : undefined
}
export function effectiveAttack(unit: Readonly<Unit>, time: number): number {
  return unit.attack * (activeSupportBuff(unit, time)?.effect === 'attack' ? COMMANDER_SUPPORT.attackMultiplier : 1)
}
export function effectiveSpeed(unit: Readonly<Unit>, time: number): number {
  return unit.speed * (activeSupportBuff(unit, time)?.effect === 'speed' ? COMMANDER_SUPPORT.speedMultiplier : 1)
}
export function effectiveMovementSpeed(unit: Readonly<Unit>, time: number, dt: number): number {
  const buff = unit.supportBuff
  if (buff?.effect !== 'speed' || dt <= 0) return effectiveSpeed(unit, time)
  const activeSeconds = Math.max(0, Math.min(time, buff.expiresAt) - Math.max(time - dt, buff.startedAt))
  return unit.speed * (1 + ((COMMANDER_SUPPORT.speedMultiplier - 1) * activeSeconds) / dt)
}
export function effectiveArmor(unit: Readonly<Unit>, time: number): number {
  const armor = DEFINITIONS[unit.type].armor
  return activeSupportBuff(unit, time)?.effect === 'armor'
    ? Math.min(COMMANDER_SUPPORT.maximumArmor, armor + COMMANDER_SUPPORT.armorBonus)
    : armor
}
export function supportTargetEligible(state: Readonly<GameState>, action: SupportAction): boolean {
  const target = state.units.find((unit) => unit.id === action.targetId)
  return (
    !!target &&
    target.owner === 'ai' &&
    target.hp > 0 &&
    !target.gateExit &&
    (action.effect === 'heal' ? target.hp < target.maxHp : !activeSupportBuff(target, state.time))
  )
}
export function supportReady(state: Readonly<GameState>): boolean {
  const support = state.commanderSupport
  return (
    state.commanderSupportVersion === 1 &&
    !!support &&
    state.phase === 'assault' &&
    !support.cast &&
    state.time + 1e-9 >= support.nextReadyAt &&
    state.time + 1e-9 >= support.retryAt
  )
}
export function getLegalSupportActions(state: Readonly<GameState>): SupportAction[] {
  if (!supportReady(state)) return []
  return state.units
    .filter((unit) => unit.owner === 'ai' && unit.hp > 0 && !unit.gateExit)
    .flatMap((unit) => SUPPORT_EFFECTS.map((effect): SupportAction => ({ type: 'support', effect, targetId: unit.id })))
    .filter((action) => supportTargetEligible(state, action))
    .slice(0, COMMANDER_SUPPORT.maxCandidates)
}
export function isLegalSupportAction(state: Readonly<GameState>, action: unknown): action is SupportAction {
  return isSupportAction(action) && supportReady(state) && supportTargetEligible(state, action)
}
export function supportUnavailableReason(reason: unknown): SupportUnavailableReason {
  return SUPPORT_UNAVAILABLE_REASONS.includes(reason as SupportUnavailableReason)
    ? (reason as SupportUnavailableReason)
    : 'unavailable'
}
export function finishSupportCast(state: GameState, outcome: SupportEvent['outcome'], amount = 0): void {
  const support = state.commanderSupport,
    cast = support?.cast
  if (!support || !cast) return
  support.history.push({
    ...cast,
    action: { ...cast.action },
    target: { ...cast.target },
    resolvedAt: state.time,
    outcome,
    amount
  })
  support.history = support.history.slice(-COMMANDER_SUPPORT.historyLimit)
  support.cast = null
  support.status = 'cooldown'
  support.reason = outcome === 'cancelled' ? 'mode-changed' : null
}
export function advanceCommanderSupport(state: GameState): void {
  if (state.commanderSupportVersion !== 1 || !state.commanderSupport) return
  const cast = state.commanderSupport.cast
  if (!cast || state.time + 1e-9 < cast.applyAt) return
  const target = state.units.find(
    (unit) => unit.id === cast.action.targetId && unit.owner === 'ai' && unit.hp > 0 && !unit.gateExit
  )
  if (!target) {
    finishSupportCast(state, 'target-lost')
    return
  }
  if (!supportTargetEligible(state, cast.action)) {
    finishSupportCast(state, 'ineligible')
    return
  }
  let amount: number
  if (cast.action.effect === 'heal') {
    amount = Math.min(
      target.maxHp - target.hp,
      target.maxHp * COMMANDER_SUPPORT.healFraction,
      COMMANDER_SUPPORT.maximumHeal
    )
    target.hp += amount
  } else {
    amount =
      cast.action.effect === 'armor'
        ? Math.min(COMMANDER_SUPPORT.maximumArmor, DEFINITIONS[target.type].armor + COMMANDER_SUPPORT.armorBonus) -
          DEFINITIONS[target.type].armor
        : 0.15
    target.supportBuff = {
      effect: cast.action.effect,
      sequence: cast.sequence,
      startedAt: state.time,
      expiresAt: state.time + COMMANDER_SUPPORT.duration
    }
  }
  finishSupportCast(state, 'applied', amount)
}
export function serializeSupportObservation(state: Readonly<GameState>) {
  const field = fieldFor(state),
    support = state.commanderSupport,
    round = (value: number) => Math.round(value * 100) / 100
  const summarize = (unit: Unit) => ({
    id: unit.id,
    type: unit.type,
    hp: unit.hp,
    maxHp: unit.maxHp,
    x: round(unit.x),
    y: round(unit.y),
    attack: canInitiateDamage(unit) ? round(effectiveAttack(unit, state.time)) : 0,
    ...(unit.owner === 'player' && unit.equipment ? { equipment: unit.equipment } : {}),
    speed: round(effectiveSpeed(unit, state.time)),
    armor: round(effectiveArmor(unit, state.time)),
    range: unit.attackRange,
    progress: round(unit.progress),
    gateExit: !!unit.gateExit,
    routeId: unit.routeId,
    boss: unit.boss,
    airborne: isAirborneEnemy(unit.type),
    attackReadyIn: round(unit.attackCooldown),
    slowRemaining: round(Math.max(0, unit.slowUntil - state.time)),
    slowFactor: unit.slowFactor,
    mudSlowRemaining: round(Math.max(0, (unit.mudSlowUntil ?? 0) - state.time)),
    combat: observeSupportCombat(unit, state),
    ...(unit.flight ? { flight: { ...unit.flight } } : {}),
    ...(activeSupportBuff(unit, state.time)
      ? {
          buff: {
            effect: unit.supportBuff!.effect,
            remaining: round(unit.supportBuff!.expiresAt - state.time)
          }
        }
      : {})
  })
  return {
    commanderSupportVersion: 1 as const,
    time: round(state.time),
    stage: state.stage,
    phase: state.phase,
    fieldId: state.fieldId,
    playerBaseHp: state.playerBaseHp,
    support: {
      ready: supportReady(state),
      nextReadyIn: round(Math.max(0, (support?.nextReadyAt ?? COMMANDER_SUPPORT.firstReadyAt) - state.time)),
      castSeconds: COMMANDER_SUPPORT.castSeconds,
      cooldown: COMMANDER_SUPPORT.cooldown,
      duration: COMMANDER_SUPPORT.duration,
      healFraction: COMMANDER_SUPPORT.healFraction,
      maximumHeal: COMMANDER_SUPPORT.maximumHeal,
      speedMultiplier: COMMANDER_SUPPORT.speedMultiplier,
      attackMultiplier: COMMANDER_SUPPORT.attackMultiplier,
      armorBonus: COMMANDER_SUPPORT.armorBonus,
      maximumArmor: COMMANDER_SUPPORT.maximumArmor
    },
    gate: { ...field.gate },
    battlefield: observeBattlefield(state),
    combatRules: observeSupportCombatRules(state),
    visibleProjectiles: observeSupportProjectiles(state),
    ...(state.fortifications ? { fortifications: observeFortifications(state) } : {}),
    defenders: state.units
      .filter((unit) => unit.owner === 'player' && unit.hp > 0)
      .slice(0, 10)
      .map(summarize),
    enemies: state.units
      .filter((unit) => unit.owner === 'ai' && unit.hp > 0)
      .slice(0, 23)
      .map(summarize),
    recentSupport: (support?.history ?? []).slice(-4).map((event) => ({
      effect: event.action.effect,
      targetId: event.action.targetId,
      at: round(event.resolvedAt),
      outcome: event.outcome,
      amount: event.amount
    })),
    legalActions: getLegalSupportActions(state)
  }
}
