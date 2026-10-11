import { BREATH_TIMING, breathGeometry } from './BreathGeometry'
import { heavyImpactGeometry } from './HeavyImpact'
import {
  AIRBORNE_ENEMIES,
  DEFINITIONS,
  actionMembers,
  attackSplash,
  type AIAction,
  type BattlefieldVersion,
  type EnemyType,
  type GameState,
  type Point
} from './model'

export const CLUSTER_RADIUS = 120
export const DURABLE_EFFECTIVE_HP = 185
export const FAST_GROUND_SPEED = 120
export const MAX_CLUSTER_BONUS = 0.6

export interface DefenderClusters {
  any: number
  melee: number
}

function localIntensity(points: readonly Point[]): number {
  let maximum = 0
  for (let center = 0; center < points.length; center++) {
    // Sorting the small contribution list makes the sum independent of unit
    // order and IDs, including floating-point addition order.
    const contributions = points
      .filter((_, index) => index !== center)
      .map((point) =>
        Math.max(0, 1 - Math.hypot(point.x - points[center].x, point.y - points[center].y) / CLUSTER_RADIUS)
      )
      .sort((a, b) => a - b)
    maximum = Math.max(maximum, Math.min(1, contributions.reduce((sum, value) => sum + value, 0) / 2))
  }
  return maximum
}

/** Current visible positions only. Reserves live outside state.units. */
export function observeDefenderClusters(state: Pick<Readonly<GameState>, 'units'>): DefenderClusters {
  const living = state.units.filter((unit) => unit.owner === 'player' && unit.hp > 0)
  return {
    any: localIntensity(living),
    melee: localIntensity(living.filter((unit) => ['soldier', 'runner', 'tank', 'paladin'].includes(unit.type)))
  }
}

/** Normal archetype roles: stage, boss scaling and presentation never reclassify them. */
export function enemyClusterRole(type: EnemyType, battlefieldVersion: BattlefieldVersion = 2) {
  const definition = DEFINITIONS[type],
    origin = { x: 0, y: 0 },
    aim = { x: 1, y: 0 },
    heavy = heavyImpactGeometry({ type, origin, target: aim, range: definition.range, battlefieldVersion }),
    // This is the same authored alternate used by SupportCombatObservation.
    breath = type === 'dragon' ? breathGeometry(origin, aim, definition.range, undefined, battlefieldVersion) : null,
    area =
      (heavy !== null && heavy.radius > 0) ||
      attackSplash(type, false, battlefieldVersion) > 0 ||
      (breath !== null && BREATH_TIMING.tickCount > 0 && breath.length > 0 && breath.endHalfWidth > 0),
    durable = definition.hp / (1 - definition.armor) >= DURABLE_EFFECTIVE_HP,
    airborne = AIRBORNE_ENEMIES.includes(type)
  return {
    area,
    durable,
    airborne,
    frontline: durable && !airborne,
    fastGround: !airborne && definition.speed >= FAST_GROUND_SPEED
  }
}

export function clusterMemberOpportunity(
  members: readonly { unitType: EnemyType }[],
  clusters: Readonly<DefenderClusters>,
  battlefieldVersion: BattlefieldVersion = 2
) {
  const roles = members.map((member) => enemyClusterRole(member.unitType, battlefieldVersion)),
    actualAreaShare = roles.length ? roles.filter((role) => role.area).length / roles.length : 0,
    durableShare = roles.length ? roles.filter((role) => role.durable).length / roles.length : 0,
    mixedEligible = roles.some(
      (front, index) =>
        front.frontline &&
        roles.some((other, otherIndex) => otherIndex !== index && (other.fastGround || other.airborne))
    ),
    multiplier =
      1 +
      Math.min(
        MAX_CLUSTER_BONUS,
        0.3 * clusters.melee * actualAreaShare +
          0.2 * clusters.any * durableShare +
          0.25 * clusters.any * Number(mixedEligible)
      )
  return { actualAreaShare, durableShare, mixedEligible, multiplier }
}

/** One bounded strategy multiplier, before the existing Director exploration. */
export function clusterActionMultiplier(
  action: Readonly<AIAction>,
  clusters: Readonly<DefenderClusters>,
  battlefieldVersion: BattlefieldVersion = 2
): number {
  return clusterMemberOpportunity(actionMembers(action), clusters, battlefieldVersion).multiplier
}
