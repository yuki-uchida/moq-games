import { canInitiateDamage, committedHealAmount, healingAction, observeHealing } from './HealingActions'
import { ATTACK_PROFILES, combatAttackInterval, ENEMY_ACTION_TIME_SCALE } from './AttackProfiles'
import { BREATH_TIMING, breathGeometry } from './BreathGeometry'
import { FORTIFICATIONS, gateDamageFactor } from './Fortifications'
import { heavyImpactGeometry } from './HeavyImpact'
import { DEFINITIONS, attackSplash, canTargetUnit, fieldFor, type GameState, type Point, type Unit } from './model'

export const MAX_VISIBLE_SUPPORT_PROJECTILES = 48

export function observeSupportCombat(unit: Readonly<Unit>, state: Readonly<GameState>) {
  const profile = ATTACK_PROFILES[unit.type],
    timeScale = unit.owner === 'ai' ? ENEMY_ACTION_TIME_SCALE : 1,
    definition = DEFINITIONS[unit.type],
    heavy = heavyImpactGeometry({
      type: unit.type,
      origin: { x: 0, y: 0 },
      target: { x: 1, y: 0 },
      range: unit.attackRange,
      boss: unit.boss,
      battlefieldVersion: state.battlefieldVersion,
      geometryScale: unit.owner === 'ai' ? 2 : 1
    }),
    splash = attackSplash(unit.type, unit.boss, state.battlefieldVersion),
    breath = breathGeometry({ x: 0, y: 0 }, { x: 1, y: 0 }, unit.attackRange, undefined, state.battlefieldVersion, 2)
  return {
    primaryKind: canInitiateDamage(unit) ? ('attack' as const) : ('heal' as const),
    primaryInterval: canInitiateDamage(unit)
      ? combatAttackInterval(unit, profile.durationMs)
      : healingAction(unit)!.interval,
    ...(observeHealing(unit) ? { healing: observeHealing(unit) } : {}),
    primaryDuration: (profile.durationMs * timeScale) / 1000,
    primaryCue: profile.cue,
    primaryCueAfter: (profile.cueMs * timeScale) / 1000,
    primaryFlight: profile.flightMs / 1000,
    primaryArea: heavy
      ? heavy.kind === 'sector'
        ? {
            kind: 'sector' as const,
            center: 'attacker' as const,
            radius: heavy.radius,
            angleDegrees: (heavy.halfAngle * 360) / Math.PI
          }
        : { kind: 'circle' as const, center: 'authored-impact' as const, radius: heavy.radius }
      : splash > 0
        ? { kind: 'circle' as const, center: 'target' as const, radius: splash }
        : { kind: 'single' as const },
    canDamageAir:
      canInitiateDamage(unit) && canTargetUnit(unit, { owner: 'ai', type: 'bat' }, state.battlefieldVersion),
    ...(unit.owner === 'player'
      ? {
          home: { x: unit.homeX, y: unit.homeY },
          leash: definition.leash,
          healPerCast: healingAction(unit)?.amount ?? 0
        }
      : {}),
    ...(unit.type === 'dragon'
      ? {
          alternateBreath: {
            interval: combatAttackInterval(unit, BREATH_TIMING.durationMs),
            duration: (BREATH_TIMING.durationMs * timeScale) / 1000,
            startsAfter: (BREATH_TIMING.startMs * timeScale) / 1000,
            endsAfter: (BREATH_TIMING.endMs * timeScale) / 1000,
            ticks: BREATH_TIMING.tickCount,
            length: breath.length,
            endHalfWidth: breath.endHalfWidth
          }
        }
      : {})
  }
}

export function observeSupportCombatRules(state: Readonly<GameState>) {
  return {
    battlefieldVersion: state.battlefieldVersion ?? 1,
    spikeRetaliation: FORTIFICATIONS.spike.retaliation,
    mudRadius: FORTIFICATIONS.mud.radius,
    mudDuration: FORTIFICATIONS.mud.duration,
    mudSpeedFactor: FORTIFICATIONS.mud.speedFactor,
    gateCannonInterval: FORTIFICATIONS.cannon.interval,
    gateCannonWindup: FORTIFICATIONS.cannon.windup,
    gateCannonFlight: FORTIFICATIONS.cannon.flight,
    gateArmorReductionPerLevel: FORTIFICATIONS.armor.reductionPerLevel,
    gateDamageMultiplier: gateDamageFactor(state)
  }
}

export function observeSupportProjectiles(state: Readonly<GameState>) {
  const point = (value: Point) => ({ x: value.x, y: value.y }),
    inFlight = (shot: { status: string; releaseAt: number; impactAt: number }) =>
      state.phase === 'assault' &&
      shot.status === 'released' &&
      state.time >= shot.releaseAt &&
      state.time < shot.impactAt
  const unitProjectiles = state.attacks
    .filter((attack) => attack.projectile && inFlight(attack))
    .flatMap((attack) => {
      const common = {
        source: 'unit' as const,
        unitType: attack.type,
        owner: attack.owner,
        attackerId: attack.attackerId,
        sourceGround: point(attack.origin),
        impactIn: attack.impactAt - state.time
      }
      return [
        ...(attack.damageActive
          ? [
              {
                ...common,
                id: attack.id,
                effect: 'damage' as const,
                power: attack.power,
                targetKind: attack.base
                  ? ('gate' as const)
                  : attack.barrierId !== undefined
                    ? ('barrier' as const)
                    : ('unit' as const),
                ...(!attack.base ? { targetId: attack.barrierId ?? attack.targetId } : {}),
                targetGround: point(attack.target)
              }
            ]
          : []),
        ...(attack.healing?.active
          ? [
              {
                ...common,
                id: `${attack.id}:heal`,
                effect: 'heal' as const,
                power: committedHealAmount(attack),
                targetKind: 'unit' as const,
                targetId: attack.healing.targetId,
                targetGround: point(attack.healing.target)
              }
            ]
          : [])
      ]
    })
  const gateProjectiles = (state.economyVersion === 2 ? (state.fortifications?.gate.shots ?? []) : [])
    .filter(inFlight)
    .map((shot) => ({
      id: shot.id,
      source: 'gate' as const,
      owner: 'player' as const,
      effect: 'damage' as const,
      power: shot.power,
      targetKind: 'unit' as const,
      targetId: shot.targetId,
      sourceGround: point(fieldFor(state).gate),
      targetGround: point(shot.target),
      impactIn: shot.impactAt - state.time
    }))
  const projectiles = [...gateProjectiles, ...unitProjectiles]
  return {
    items: projectiles.slice(0, MAX_VISIBLE_SUPPORT_PROJECTILES),
    omitted: Math.max(0, projectiles.length - MAX_VISIBLE_SUPPORT_PROJECTILES)
  }
}
