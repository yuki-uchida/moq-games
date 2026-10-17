import { ALLY_TYPES, canTargetUnit, fieldFor, type AllyType, type GameState, type Point } from './model'
import { incomingDamage } from './DamageRules'
import type { DamageContribution } from './TacticalHistory'

export const SPECIAL_COOLDOWN = 60
export const SPECIALS = {
  soldier: {
    release: 0.57,
    motionDuration: 1.35,
    impacts: [0.57],
    icon: '⚔',
    name: '回転斬撃',
    radius: 95,
    range: 150,
    duration: 0.8,
    power: 4,
    root: 0
  },
  archer: {
    release: 0.76,
    motionDuration: 1.4,
    impacts: [0.76],
    icon: '➶',
    name: '矢の雨',
    radius: 110,
    range: 360,
    duration: 1.2,
    power: 4,
    root: 0
  },
  runner: {
    release: 0.42,
    motionDuration: 1.5,
    impacts: [0.42, 0.67, 0.97],
    icon: '⚡',
    name: '槍連撃',
    radius: 65,
    range: 200,
    duration: 0.8,
    power: 6,
    root: 0
  },
  tank: {
    release: 0.72,
    motionDuration: 1.65,
    impacts: [0.72],
    icon: '◎',
    name: '衝撃波',
    radius: 115,
    range: 170,
    duration: 1,
    power: 2,
    root: 3
  },
  mage: {
    release: 0.86,
    motionDuration: 1.6,
    impacts: [0.86],
    icon: '✹',
    name: '炎爆発',
    radius: 125,
    range: 330,
    duration: 1.2,
    power: 5,
    root: 0
  },
  healer: {
    release: 0.85,
    motionDuration: 1.9,
    impacts: [0.85],
    icon: '✚',
    name: '回復の泉',
    radius: 130,
    range: 300,
    duration: 8,
    power: 0,
    root: 0
  },
  frost: {
    release: 0.8,
    motionDuration: 1.75,
    impacts: [0.8],
    icon: '❄',
    name: '氷結場',
    radius: 120,
    range: 300,
    duration: 6,
    power: 0,
    root: 0.25
  },
  ranger: {
    release: 0.7,
    motionDuration: 1.65,
    impacts: [0.7],
    icon: '♧',
    name: '蔓の罠',
    radius: 100,
    range: 330,
    duration: 5,
    power: 0,
    root: 0.25
  },
  cannon: {
    release: 0.83,
    motionDuration: 1.6,
    impacts: [0.83],
    icon: '✺',
    name: '砲撃爆発',
    radius: 145,
    range: 380,
    duration: 1.4,
    power: 5,
    root: 0
  },
  paladin: {
    release: 0.95,
    motionDuration: 2.0,
    impacts: [0.95],
    icon: '✦',
    name: '光の柱',
    radius: 110,
    range: 250,
    duration: 1.2,
    power: 4,
    root: 1
  }
} as const satisfies Record<
  AllyType,
  {
    release: number
    motionDuration: number
    impacts: readonly number[]
    icon: string
    name: string
    radius: number
    range: number
    duration: number
    power: number
    root: number
  }
>

export const MAX_SPECIAL_ROOT_DURATION = Math.max(
  ...Object.values(SPECIALS).map((spec) => (spec.root ? spec.duration + spec.root : 0))
)

export interface SpecialEffect extends Point {
  id: string
  sourceId: number
  type: AllyType
  startedAt: number
  releaseAt: number
  endsAt: number
  power: number
  applied: boolean
}
export function specialReady(state: Readonly<GameState>, id: number, point?: Point): boolean {
  const unit = state.units.find((u) => u.id === id)
  if (
    state.phase !== 'assault' ||
    !unit ||
    unit.owner !== 'player' ||
    unit.hp <= 0 ||
    !ALLY_TYPES.includes(unit.type as AllyType) ||
    (unit.specialCooldown ?? 0) > 1e-9
  )
    return false
  if (!point) return true
  const field = fieldFor(state)
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= field.width &&
    point.y <= field.height &&
    Math.hypot(point.x - unit.x, point.y - unit.y) <= SPECIALS[unit.type as AllyType].range
  )
}
export function castSpecial(state: GameState, id: number, point: Point): boolean {
  if (!point || !specialReady(state, id, point)) return false
  const unit = state.units.find((u) => u.id === id)!,
    type = unit.type as AllyType,
    spec = SPECIALS[type]
  unit.specialCooldown = SPECIAL_COOLDOWN
  unit.specialSequence = (unit.specialSequence ?? 0) + 1
  unit.specialCast = { startedAt: state.time, x: point.x, y: point.y }
  for (const attack of state.attacks)
    if (attack.attackerId === id && (attack.status === 'windup' || attack.status === 'released'))
      attack.status = 'cancelled'
  unit.moving = false
  const distance = Math.hypot(point.x - unit.x, point.y - unit.y)
  if (distance > 1e-9) {
    unit.facingX = (point.x - unit.x) / distance
    unit.facingY = (point.y - unit.y) / distance
  }
  const effects = (state.specialEffects ??= [])
  for (const [index, impact] of spec.impacts.entries())
    effects.push({
      id: `special:${id}:${unit.specialSequence}:${index}`,
      sourceId: id,
      type,
      x: point.x,
      y: point.y,
      startedAt: state.time,
      releaseAt: state.time + impact,
      endsAt: state.time + impact + spec.duration,
      power: (unit.attack * spec.power) / spec.impacts.length,
      applied: false
    })
  return true
}
export function advanceSpecials(
  state: GameState,
  dt: number,
  damage: Map<number, number>,
  healing: Map<number, number>,
  history: DamageContribution[]
): void {
  for (const unit of [...state.units, ...(state.reserveUnits ?? [])]) {
    if (
      unit.specialCast &&
      (unit.hp <= 0 || state.time >= unit.specialCast.startedAt + SPECIALS[unit.type as AllyType].motionDuration)
    )
      delete unit.specialCast
    if (unit.specialCooldown !== undefined) {
      const remaining = unit.specialCooldown - dt
      unit.specialCooldown = remaining <= 1e-9 ? 0 : remaining
    }
  }
  for (const effect of state.specialEffects ?? []) {
    const spec = SPECIALS[effect.type],
      field = ['healer', 'frost', 'ranger'].includes(effect.type)
    if (!effect.applied && !state.units.some((u) => u.id === effect.sourceId && u.hp > 0)) {
      effect.endsAt = state.time
      continue
    }
    const activeDt = Math.max(0, Math.min(state.time, effect.endsAt) - Math.max(state.time - dt, effect.releaseAt))
    if ((!field && effect.applied) || state.time + 1e-9 < effect.releaseAt) continue
    for (const unit of state.units) {
      if (unit.hp <= 0 || Math.hypot(unit.x - effect.x, unit.y - effect.y) > spec.radius) continue
      if (effect.type === 'healer') {
        if (unit.owner === 'player') healing.set(unit.id, (healing.get(unit.id) ?? 0) + unit.maxHp * 0.06 * activeDt)
      } else if (
        unit.owner === 'ai' &&
        canTargetUnit({ owner: 'player', type: effect.type }, unit, state.battlefieldVersion)
      ) {
        if (spec.root) {
          unit.specialRootUntil = Math.max(unit.specialRootUntil ?? 0, (field ? effect.endsAt : state.time) + spec.root)
          if (!field) unit.specialStunUntil = Math.max(unit.specialStunUntil ?? 0, state.time + spec.root)
        }
        if (effect.power > 0) {
          const amount = incomingDamage(
            effect.power,
            unit,
            state.time,
            ['mage', 'paladin'].includes(effect.type) ? 'magic' : 'physical'
          )
          damage.set(unit.id, (damage.get(unit.id) ?? 0) + amount)
          history.push({
            targetId: unit.id,
            sourceId: effect.sourceId,
            sourceType: effect.type,
            attackId: effect.id,
            amount,
            area: true
          })
        }
      }
    }
    effect.applied = true
  }
  if (state.specialEffects) state.specialEffects = state.specialEffects.filter((effect) => effect.endsAt > state.time)
}

export function specialMotionActive(unit: import('./model').Unit, time: number): boolean {
  return (
    !!unit.specialCast &&
    unit.hp > 0 &&
    ALLY_TYPES.includes(unit.type as AllyType) &&
    time < unit.specialCast.startedAt + SPECIALS[unit.type as AllyType].motionDuration
  )
}
