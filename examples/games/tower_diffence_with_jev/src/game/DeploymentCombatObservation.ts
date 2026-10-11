import { ATTACK_PROFILES, combatAttackInterval, attackTimeScale } from './AttackProfiles'
import { BREATH_TIMING } from './BreathGeometry'
import { attackContact } from './CombatContact'
import { nextRoadObstruction } from './EnemyTravel'
import { TANK_ROADBLOCK_RADIUS, tankRoadblocksOnPath } from './TankRoadblock'
import { routeSurface } from './BattlefieldRoutes'
import { activeSupportBuff, effectiveArmor, effectiveSpeed } from './CommanderSupport'
import { allBarriers, FORTIFICATIONS } from './Fortifications'
import { canInitiateDamage } from './HealingActions'
import { fieldFor, isAirborneEnemy, type CombatAttack, type GameState, type Unit } from './model'

/** Optional current body footprint; absent means no observed live Tank passage impact. */
export function observeTankRoadblock(state: Readonly<GameState>, unit: Readonly<Unit>) {
  if (unit.owner !== 'player' || unit.type !== 'tank' || unit.hp <= 0) return undefined
  const passages = fieldFor(state).routes.flatMap((route) =>
    tankRoadblocksOnPath(state, route.path)
      .filter((block) => block.tank.id === unit.id)
      .map((block) => ({
        ...(route.id === undefined ? {} : { routeId: route.id }),
        startProgress: block.start,
        endProgress: block.end
      }))
  )
  return passages.length ? { x: unit.x, y: unit.y, radius: TANK_ROADBLOCK_RADIUS, passages } : undefined
}

/** Observation only: never advances clocks, consumes mud or chooses a future target. */
export function observeDeploymentCombat(state: Readonly<GameState>, unit: Readonly<Unit>) {
  const time = state.time,
    airborne = isAirborneEnemy(unit.type),
    groundedEnemy = unit.owner === 'ai' && !airborne,
    surface =
      state.battlefieldVersion === 2 ? routeSurface(fieldFor(state), unit.routeId) : fieldFor(state).slowSurface,
    terrainFactor =
      groundedEnemy && unit.progress >= surface.startProgress - 1e-8 && unit.progress < surface.endProgress - 1e-8
        ? surface.speedFactor
        : 1,
    mudRemaining = groundedEnemy && state.economyVersion === 2 ? Math.max(0, (unit.mudSlowUntil ?? 0) - time) : 0,
    frostRemaining = unit.owner === 'ai' ? Math.max(0, unit.slowUntil - time) : 0,
    mudFactor = mudRemaining > 1e-9 ? FORTIFICATIONS.mud.speedFactor : 1,
    frostFactor = frostRemaining > 1e-9 ? unit.slowFactor : 1,
    buff = activeSupportBuff(unit, time),
    unimpededSpeed = effectiveSpeed(unit, time),
    obstruction = groundedEnemy && unit.hp > 0 ? nextRoadObstruction(state, unit) : undefined,
    roadblock = obstruction?.kind === 'tank' ? obstruction : undefined,
    action = state.attacks
      .filter(
        (attack) =>
          attack.attackerId === unit.id && attack.startedAt <= time && time < Math.max(attack.endsAt, attack.impactAt)
      )
      .sort((a, b) => b.sequence - a.sequence)[0]
  return {
    alive: unit.hp > 0,
    armor: effectiveArmor(unit, time),
    ...(canInitiateDamage(unit)
      ? {
          attackInterval: combatAttackInterval(unit, ATTACK_PROFILES[unit.type].durationMs),
          attackReadyIn: unit.attackCooldown,
          ...(unit.type === 'dragon'
            ? { breathAttackInterval: combatAttackInterval(unit, BREATH_TIMING.durationMs) }
            : {})
        }
      : {}),
    movement: {
      unimpededSpeed,
      terrainFactor,
      mudFactor,
      frostFactor,
      mudRemaining,
      frostRemaining,
      supportRemaining: buff ? buff.expiresAt - time : 0,
      effectiveSpeed: unimpededSpeed * Math.min(terrainFactor, mudFactor) * frostFactor,
      moving: unit.moving,
      ...(roadblock
        ? {
            roadblock: {
              tankId: roadblock.tank.id,
              stopProgress: roadblock.stopProgress,
              distance: Math.max(0, roadblock.stopProgress - unit.progress),
              stopped:
                roadblock.stopProgress - unit.progress <= 1e-7 &&
                attackContact(unit, roadblock.tank, unit.attackRange).inRange
            }
          }
        : {})
    },
    ...(action ? { committedAction: observeCommittedAction(state, action) } : {})
  }
}

function observeCommittedAction(state: Readonly<GameState>, action: Readonly<CombatAttack>) {
  const targetKind =
      action.kind === 'heal'
        ? ('unit' as const)
        : action.base
          ? ('base' as const)
          : action.barrierId !== undefined
            ? ('barrier' as const)
            : action.targetId !== undefined
              ? ('unit' as const)
              : ('none' as const),
    targetId = action.kind === 'heal' ? action.healing?.targetId : (action.barrierId ?? action.targetId),
    targetAvailable =
      targetKind === 'base'
        ? state.playerBaseHp > 0
        : targetKind === 'barrier'
          ? allBarriers(state).some((target) => target.id === targetId && target.hp > 0)
          : state.units.some((target) => target.id === targetId && target.hp > 0),
    remaining = (at: number) => Math.max(0, at - state.time)
  return {
    kind: action.kind ?? ('legacy-coupled' as const),
    status: action.status,
    targetKind,
    ...(targetId !== undefined ? { targetId } : {}),
    targetAvailable,
    ...(action.kind === undefined && action.healing
      ? {
          healTargetId: action.healing.targetId,
          healTargetAvailable: state.units.some((target) => target.id === action.healing!.targetId && target.hp > 0)
        }
      : {}),
    releaseIn: remaining(action.releaseAt),
    impactIn: remaining(action.impactAt),
    endsIn: remaining(action.endsAt),
    ...(action.variant === 'breath' && action.breath
      ? {
          variant: 'breath' as const,
          ticksRemaining: Math.max(0, BREATH_TIMING.tickCount - action.breath.nextTick),
          emissionRemaining: remaining(action.startedAt + (BREATH_TIMING.endMs * attackTimeScale(action)) / 1000)
        }
      : {})
  }
}
