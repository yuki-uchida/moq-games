import { attackAssetElapsedMs } from '../game/AttackProfiles'
import { GameEngine } from '../game/GameEngine'
import { breathGeometry, lockBreathAim, mouthAt } from '../game/BreathGeometry'
import { DRAGON_BREATH_MOUTHS } from '../rendering/DragonBreathArt'
import { heavyImpactGeometry } from '../game/HeavyImpact'
import {
  CONFIG,
  DEFINITIONS,
  actionKey,
  getLegalAIActions,
  isAirborneEnemy,
  isDirectFlightTarget,
  pathLength,
  pointOnPath,
  routePathFor,
  stageRules,
  type AIAction,
  type AllyType
} from '../game/model'
import { freshSave } from '../progression/UpgradeSystem'
import { DIRECTIONS } from '../rendering/AuthoredRoster'
import { ENEMY_TRIAL_TYPES, type EnemyTrialType } from '../rendering/UnitArtTrial'
import type { SpriteDirection } from '../rendering/UnitSprites'
export const ENEMY_TRIAL_FIXTURE = {
  transport: 'Offline real GameEngine; no Jev calls',
  setup: 'Scripted positions and defender cooldown; natural HP, attack and enemy speed',
  boss: 'Normal enemy; a synthetic visual boss flag does not establish a scheduled boss deployment',
  death: 'Explicit zero-HP fixture; engine corpse recording; no authored 3D death clip'
} as const
export type BreathTrialBoundary = 'tip' | 'left-edge' | 'right-edge' | 'rear'
export interface EnemyTrialOptions {
  attackVariant?: 'breath'
  breathBoundary?: BreathTrialBoundary
  route?: boolean
  realBoss?: boolean
  bossStage?: number
  gate?: boolean
  collateral?: boolean
  collateralBoundary?: 'radius' | 'left-angle' | 'right-angle'
  raid?: boolean
  defenderType?: AllyType
}
export function createEnemyTrialScene(
  type: EnemyTrialType,
  direction: SpriteDirection,
  options: boolean | EnemyTrialOptions = false
) {
  if (!ENEMY_TRIAL_TYPES.includes(type) || !DIRECTIONS.includes(direction)) throw new Error('Invalid enemy trial')
  const {
    attackVariant,
    breathBoundary,
    route = false,
    realBoss = false,
    bossStage,
    gate = false,
    collateral = false,
    collateralBoundary = 'radius',
    raid = false,
    defenderType = raid ? 'archer' : 'soldier'
  } = typeof options === 'boolean' ? { route: options } : options
  if (attackVariant && (type !== 'dragon' || route)) throw new Error('Breath fixture requires a Dragon attack')
  if (breathBoundary && (attackVariant !== 'breath' || route || gate))
    throw new Error('Breath boundary requires a Dragon breath unit attack')
  if (collateral && (!['brute', 'ogre'].includes(type) || route || gate))
    throw new Error('Collateral review requires a Brute or Ogre unit attack')
  if (collateralBoundary !== 'radius' && (!collateral || type !== 'ogre'))
    throw new Error('Angular boundary review requires Ogre collateral')
  if (raid && (!isAirborneEnemy(type) || gate || realBoss || collateral))
    throw new Error('Raid review requires a normal airborne unit attack')
  if (raid && !isDirectFlightTarget({ owner: 'player', type: defenderType, hp: 1 }))
    throw new Error('Raid review requires a living ranged defender')
  const bossStages = { wolf: [5], beetle: [7], brute: [8], ogre: [3, 9], dragon: [10] }[
    type as 'wolf' | 'beetle' | 'brute' | 'ogre' | 'dragon'
  ]
  if (realBoss && !bossStages) throw new Error('Only Wolf, Beetle, Brute, Ogre and Dragon have scheduled trial bosses')
  if (bossStage !== undefined && !realBoss) throw new Error('Boss stage selection requires realBoss')
  const selectedBossStage = bossStage ?? bossStages?.[0]
  if (realBoss && !bossStages.includes(selectedBossStage!)) throw new Error('Invalid scheduled trial boss stage')
  const version = realBoss || gate || isAirborneEnemy(type) ? 2 : 1
  const engine = new GameEngine(
    { decide: async () => null },
    freshSave(),
    'meadow',
    42,
    () => 0,
    DRAGON_BREATH_MOUTHS,
    version
  )
  engine.state.stage = realBoss ? selectedBossStage! : Math.max(3, DEFINITIONS[type].unlockStage)
  if (!engine.place(defenderType, 0)) throw new Error('Could not place defender')
  const target = engine.state.units[0]
  if (collateral || breathBoundary)
    for (const slot of [1, 2])
      if (!engine.place('soldier', slot)) throw new Error('Could not place collateral defender')
  const witnesses = engine.state.units.slice(1)
  for (const unit of witnesses)
    Object.assign(unit, { x: 64, y: 1320, homeX: 64, homeY: 1320, speed: 0, attackCooldown: 10000 })
  engine.startAssault()
  const rules = stageRules(engine.state.stage, engine.state.waveBossPolicy)
  if (realBoss) {
    if (rules.bossType !== type) throw new Error('Scheduled boss changed')
    // Explicitly arrange the final legal deployment window; spawn and stats remain engine-owned.
    engine.state.enemiesSpawned = engine.state.enemiesResolved = rules.enemyCount - 1
    engine.state.budgetSpent = rules.enemyCount - 1
  }
  const routeId = version === 2 ? 'right' : undefined
  const path = routePathFor(engine.state, routeId)
  const progress = gate ? pathLength(path) - 24 : isAirborneEnemy(type) || (type === 'ogre' && realBoss) ? 2200 : 1750
  const origin = pointOnPath(path, progress)
  const index = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'].indexOf(direction)
  const distance = route ? 400 : type === 'shaman' || type === 'wraith' || type === 'dragon' ? 120 : 30
  const destination = gate
    ? { x: 64, y: 1320 }
    : {
        x: origin.x + Math.cos((index * Math.PI) / 4) * distance,
        y: origin.y + Math.sin((index * Math.PI) / 4) * distance
      }
  Object.assign(target, destination, {
    homeX: destination.x,
    homeY: destination.y,
    speed: 0,
    attackCooldown: 10000
  })
  const action: AIAction = {
    type: 'spawn',
    unitType: type,
    ...(routeId ? { routeId } : {}),
    ...(realBoss ? { boss: true } : {}),
    ...(raid ? { targetId: target.id } : {})
  }
  const legal = getLegalAIActions(engine.state).some((candidate) => actionKey(candidate) === actionKey(action))
  if (!legal || !engine.applyAIAction(action)) throw new Error('Could not spawn enemy')
  const actor = engine.state.units.at(-1)!
  const deployment = {
    action,
    legal,
    origin: { x: actor.x, y: actor.y, progress: actor.progress },
    flight: actor.flight ? { ...actor.flight } : null,
    returnPoint: actor.flight ? pointOnPath(path, actor.flight.returnProgress) : null
  }
  Object.assign(actor, origin, { progress })
  if (attackVariant === 'breath') actor.attackSequence = 1
  const speed = actor.speed
  // Preserve the accepted Slime/Goblin baseline; subsequent trials keep their natural speed throughout.
  if (!route && (type === 'slime' || type === 'goblin')) actor.speed = 0
  engine.update(CONFIG.step)
  actor.speed = speed
  const attack = engine.state.attacks.find((value) => value.attackerId === actor.id)
  if (!route && (!attack || (gate ? !attack.base : attack.targetId !== target.id)))
    throw new Error('Enemy did not target expected defender or gate')
  if (collateral) {
    const shape = heavyImpactGeometry(attack!)!
    for (const [index, unit] of witnesses.entries()) {
      const boundaryOffset = index === 0 ? -1 : 1,
        angular = shape.kind === 'sector' && collateralBoundary !== 'radius',
        angle =
          shape.kind === 'sector'
            ? Math.atan2(shape.direction.y, shape.direction.x) +
              (angular
                ? (collateralBoundary === 'left-angle' ? -1 : 1) * (shape.halfAngle + boundaryOffset * 0.0001)
                : 0)
            : 0,
        radius = angular ? shape.radius * 0.75 : shape.radius + boundaryOffset * 0.01,
        x = shape.origin.x + Math.cos(angle) * radius,
        y = shape.origin.y + Math.sin(angle) * radius
      Object.assign(unit, { x, y, homeX: x, homeY: y })
    }
  }
  const baseFixture = realBoss
    ? {
        ...ENEMY_TRIAL_FIXTURE,
        boss: `Real scheduled Stage ${engine.state.stage} ${type}; legal final-window applyAIAction, battlefield v2`,
        setup: `${ENEMY_TRIAL_FIXTURE.setup}; scripted boss-window counters and spent budget`
      }
    : raid
      ? {
          ...ENEMY_TRIAL_FIXTURE,
          setup: `${ENEMY_TRIAL_FIXTURE.setup}; legal selected ranged-target raid; engine-owned approach, engage and return`
        }
      : ENEMY_TRIAL_FIXTURE
  const fixture = attackVariant
    ? {
        ...baseFixture,
        setup: `${baseFixture.setup}; SCRIPTED sequence=1 before engine-owned second-attack breath${breathBoundary ? '; witnesses are explicit per-tick boundary probes' : ''}`
      }
    : baseFixture
  return { engine, actor, target, attack, witnesses, fixture, deployment }
}

export function positionBreathTrialWitnesses(
  session: ReturnType<typeof createEnemyTrialScene>,
  boundary: BreathTrialBoundary,
  at = session.engine.state.time + CONFIG.step
) {
  const { engine, actor, target, witnesses } = session
  const attack = engine.state.attacks.find(
    (value) => value.attackerId === actor.id && value.sequence === actor.attackSequence
  )
  if (!attack?.breath || witnesses.length !== 2) throw new Error('No active breath boundary fixture')
  const origin = mouthAt(
    actor,
    DRAGON_BREATH_MOUTHS[attack.breath.direction],
    attackAssetElapsedMs(attack, at),
    actor.boss ? 1.35 : 1
  )
  const aim = attack.breath.lockedAim ?? lockBreathAim(origin, { x: target.x, y: target.y - 18 }, attack.aim!)
  const shape = breathGeometry(
    origin,
    aim,
    attack.range,
    undefined,
    attack.battlefieldVersion,
    attack.geometryScale ?? 1
  )
  for (const [index, unit] of witnesses.entries()) {
    const offset = index === 0 ? -0.01 : 0.01
    const forward = boundary === 'tip' ? shape.length + offset : boundary === 'rear' ? -offset : shape.length * 0.75
    const lateral =
      boundary === 'left-edge' || boundary === 'right-edge'
        ? (boundary === 'left-edge' ? -1 : 1) * ((forward / shape.length) * shape.endHalfWidth + offset)
        : 0
    const x = shape.origin.x + shape.direction.x * forward - shape.direction.y * lateral
    const y = shape.origin.y + shape.direction.y * forward + shape.direction.x * lateral + 18
    Object.assign(unit, { x, y, homeX: x, homeY: y })
  }
  return shape
}
