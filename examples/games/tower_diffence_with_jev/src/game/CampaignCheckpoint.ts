import { attackDamageType } from './DamageRules'
import { WINDING_BRANCHES } from './WindingLayouts'
import {
  COMMANDER_SUPPORT,
  SUPPORT_EFFECTS,
  SUPPORT_UNAVAILABLE_REASONS,
  type CommanderSupportState,
  type SupportCast,
  type SupportEvent,
  type SupportBuff
} from './CommanderSupport'
import {
  ALLY_TYPES,
  TANK_GUARD,
  RANGED_ALLY_TYPES,
  ANIMATION,
  CONFIG,
  DEFINITIONS,
  ENEMY_TYPES,
  FIELDS,
  FORMATIONS,
  ROAD_EFFECTS,
  actionKey,
  actionMembers,
  initialState,
  isAction,
  isAirborneEnemy,
  combatStats,
  deploymentCooldown,
  pathLength,
  pointOnPath,
  stageRules,
  type AIAction,
  type AllyType,
  type CombatAttack,
  type Corpse,
  type DeploymentOutcome,
  type EnemyType,
  type FieldId,
  type GameState,
  type FortificationsState,
  type GateShot,
  type RoadItem,
  type Point,
  type Sandbag,
  type ScheduledSpawn,
  type StageSummary,
  type TacticalPlan,
  type Unit
} from './model'
import {
  resolveBattlefield,
  routeFor,
  pointAtRoadAnchor,
  edgeOffsetToRouteProgress,
  physicalProjectionOnRoute
} from './BattlefieldRoutes'
import { ATTACK_PROFILES, combatAttackInterval, attackTimeScale } from './AttackProfiles'
import { HEALING_ACTIONS, HEALER_WEAPON_HEAL_AMOUNT, healingAction } from './HealingActions'
import { FORTIFICATIONS, freshFortifications, gateMuzzle, previewRoadItemPlacement } from './Fortifications'
import { DEPLOYMENT_COST, REDEPLOY_RADIUS, STARTING_GOLD } from './DefenderRoster'
import {
  LEGACY_PLAN_LIFETIME,
  LEGACY_CHECKPOINT_HEAL_AMOUNT,
  LEGACY_STARTING_GOLD,
  LEGACY_BASE_HP,
  LEGACY_ALLY_UNLOCK_STAGES,
  LEGACY_PURCHASED_ALLIES,
  legacyCheckpointAllyAvailable,
  preBalanceCheckpointCombatStats,
  versionEightCheckpointCombatStats,
  LEGACY_WAIT_LIFETIMES,
  isLegacyCheckpointAction,
  isVersionThreeCheckpointAction,
  legacyCheckpointActionFromKey,
  legacyCheckpointRules,
  legacyCheckpointCombatStats,
  legacyCheckpointMembers,
  type LegacyCheckpointAction
} from './LegacyCheckpointRules'
import {
  BREATH_DIRECTIONS,
  BREATH_TIMING,
  breathGeometry,
  type BreathAttackState,
  type BreathGeometry
} from './BreathGeometry'
import { HISTORY_LIMITS, type HistoryContribution, type HistoryDeployment, type HistoryEvent } from './TacticalHistory'
import {
  ENEMY_HISTORY_LIMITS,
  sourceKind,
  sourceKey,
  enemyType as isEnemyHistoryType,
  type HistorySource,
  type HistorySourceDamage,
  type EnemyDamageLedger,
  type EnemyOutcome
} from './EnemyOutcomeHistory'
import { parseProfile, parseRunProgress, type ProfileData, type RunProgressData } from '../progression/ProgressionData'
import { multiplier, upgradeCost } from '../progression/UpgradeSystem'
import { DEFENDER_FOOTPRINT, previewGroundPlacement } from './GroundPlacement'
import { DefenderInterception, INTERCEPTION, clearInterceptionStep, type InterceptionSnapshot } from './Interception'
import {
  array,
  boolean,
  choice,
  nullable,
  number,
  object,
  optional,
  record,
  requireCheckpoint,
  string,
  type Decoder
} from './CheckpointCodec'

export const CAMPAIGN_CHECKPOINT_VERSION = 15
export const CHECKPOINT_LIMITS = {
  simulationSeconds: 24 * 60 * 60,
  maximumId: 0xffffffff,
  attacks: CONFIG.maxUnits * 2,
  text: 256,
  historyVictims: 10,
  routeWaypoints:
    1 +
    16 +
    Math.max(
      ...Object.values(FIELDS).flatMap((field) =>
        [1, 2].flatMap((version) =>
          resolveBattlefield(field, version as 1 | 2).routes.map((route) => route.path.length)
        )
      )
    ) *
      16
} as const

export interface TacticalHistoryCheckpoint {
  version: 1 | 2
  fieldId: FieldId
  stage: number
  lastTime: number
  omittedUntil: number
  events: HistoryEvent[]
  damage: HistoryContribution[]
  enemyOutcomes: EnemyOutcome[]
  enemyLedger: EnemyDamageLedger[]
  discardedContributions: number
  discardedDamage: number
  discardedOutcomes: number
  legacyUnknown: boolean
  deployments: {
    summary: HistoryDeployment
    members: { id: number; type: EnemyType; spawnedAt: number; diedAt: number | null; exitedAt?: number }[]
  }[]
}

export interface CampaignRuntimeCheckpoint {
  id: number
  accumulator: number
  randomState: number
  deploymentSequence: number
  decisionRevision: number
  deploymentByUnit: { unitId: number; deploymentId: number }[]
  lastDeploymentAt: number | null
  planDefenders: number
  planBaseHp: number
  interception: InterceptionSnapshot
  defenderDetours: { unitId: number; targetId?: number; target: Point; waypoints: Point[] }[]
  failedDefenderDetours: { unitId: number; targetId?: number; target: Point; retryAt: number }[]
}

type CheckpointCorpse = Omit<Corpse, 'key'>
export type CampaignStateCheckpoint = Pick<
  GameState,
  | 'commanderSupportVersion'
  | 'commanderSupport'
  | 'battlefieldVersion'
  | 'layoutRevision'
  | 'economyVersion'
  | 'fortifications'
  | 'reserveUnits'
  | 'time'
  | 'stage'
  | 'waveBossPolicy'
  | 'phase'
  | 'fieldId'
  | 'seed'
  | 'playerBaseHp'
  | 'enemiesSpawned'
  | 'enemiesResolved'
  | 'budgetSpent'
  | 'nextSpawnAt'
  | 'units'
  | 'attacks'
  | 'sandbags'
  | 'sandbagStock'
  | 'cooldowns'
  | 'pendingSpawns'
  | 'reservedBudget'
  | 'strategy'
  | 'recentOutcomes'
  | 'stageSummary'
  | 'previousStageSummary'
  | 'result'
  | 'lastAction'
  | 'requestedAction'
  | 'decisionTime'
  | 'cooldownHold'
  | 'historyEnabled'
> & { corpses: CheckpointCorpse[] }

export interface CampaignCheckpoint {
  version: 15
  profile: ProfileData
  progress: RunProgressData
  rewardedThroughStage: number
  state: CampaignStateCheckpoint
  runtime: CampaignRuntimeCheckpoint
  history: TacticalHistoryCheckpoint
}

type CheckpointAction = AIAction | LegacyCheckpointAction
type DecodedStateCheckpoint = Omit<
  CampaignStateCheckpoint,
  'battlefieldVersion' | 'layoutRevision' | 'lastAction' | 'requestedAction'
> & {
  lastAction: CheckpointAction | null
  requestedAction: CheckpointAction | null
}
interface LegacyCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version' | 'state'> {
  version: 1
  state: Omit<DecodedStateCheckpoint, 'waveBossPolicy'>
}
interface VersionTwoCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version' | 'state'> {
  version: 2
  state: DecodedStateCheckpoint
}
interface VersionThreeCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version' | 'state'> {
  version: 3
  state: DecodedStateCheckpoint
}
interface VersionFourCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version'> {
  version: 4
}
interface VersionFiveCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version'> {
  version: 5
}
interface VersionSixCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version'> {
  version: 6
}
interface VersionSevenCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version'> {
  version: 7
}
interface VersionEightCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version'> {
  version: 8
}
interface VersionNineCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version'> {
  version: 9
}
interface VersionTenCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version'> {
  version: 10
}
interface VersionElevenCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version'> {
  version: 11
}
interface VersionTwelveCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version'> {
  version: 12
}
interface VersionThirteenCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version'> {
  version: 13
}
interface VersionFourteenCampaignCheckpoint extends Omit<CampaignCheckpoint, 'version'> {
  version: 14
}
type DecodedCheckpoint =
  | LegacyCampaignCheckpoint
  | VersionTwoCampaignCheckpoint
  | VersionThreeCampaignCheckpoint
  | VersionFourCampaignCheckpoint
  | VersionFiveCampaignCheckpoint
  | VersionSixCampaignCheckpoint
  | VersionSevenCampaignCheckpoint
  | VersionEightCampaignCheckpoint
  | VersionNineCampaignCheckpoint
  | VersionTenCampaignCheckpoint
  | VersionElevenCampaignCheckpoint
  | VersionTwelveCampaignCheckpoint
  | VersionThirteenCampaignCheckpoint
  | VersionFourteenCampaignCheckpoint
  | CampaignCheckpoint
type CheckpointVersion = DecodedCheckpoint['version']
function battlefieldVersion(checkpoint: DecodedCheckpoint): 1 | 2 {
  return checkpoint.version >= 4 ? (checkpoint.state as CampaignStateCheckpoint).battlefieldVersion : 1
}
function layoutRevision(checkpoint: DecodedCheckpoint): 1 | 2 | 3 {
  return checkpoint.version >= 14 ? (checkpoint.state as CampaignStateCheckpoint).layoutRevision : 1
}
function checkpointField(checkpoint: DecodedCheckpoint) {
  return resolveBattlefield(
    FIELDS[checkpoint.state.fieldId],
    battlefieldVersion(checkpoint),
    layoutRevision(checkpoint)
  )
}

const LEGACY_SANDBAG_MAX_HP = 120

const epsilon = 1e-6,
  maxTime = CHECKPOINT_LIMITS.simulationSeconds,
  maximumId = CHECKPOINT_LIMITS.maximumId,
  maximumEnemies = stageRules(CONFIG.stages).enemyCount,
  maximumMembers = Math.max(...Object.values(FORMATIONS).map((formation) => formation.types.length)),
  maximumCooldown =
    Math.max(...ENEMY_TYPES.map((type) => deploymentCooldown(type, 1))) +
    Math.max(...Object.values(FORMATIONS).map((formation) => (formation.types.length - 1) * formation.interval)),
  maximumPower =
    Math.max(...Object.values(DEFINITIONS).map((definition) => definition.attack)) *
    Math.max(multiplier(4), stageRules(CONFIG.stages).strength * 2.6),
  maximumSpeed = Math.max(52, ...Object.values(DEFINITIONS).map((definition) => definition.speed)),
  battlefieldFields = Object.values(FIELDS).flatMap((field) => [
    resolveBattlefield(field, 1),
    resolveBattlefield(field, 2)
  ]),
  revisionFields = [
    ...battlefieldFields,
    ...Object.keys(WINDING_BRANCHES).flatMap((id) => [
      resolveBattlefield(FIELDS[id as FieldId], 2, 2),
      resolveBattlefield(FIELDS[id as FieldId], 2, 3)
    ])
  ],
  coordinateBound =
    Math.max(...battlefieldFields.flatMap((field) => [field.width, field.height])) +
    Math.max(...Object.values(DEFINITIONS).map((definition) => definition.leash)),
  maximumPath = Math.max(...battlefieldFields.flatMap((field) => field.routes.map((route) => route.length))),
  id = number(1, maximumId, true),
  sequence = number(0, maximumId, true),
  time = number(0, maxTime),
  deadline = number(0, maxTime + maximumCooldown + HISTORY_LIMITS.windowSeconds),
  stage = number(1, CONFIG.stages, true),
  count = number(0, maximumEnemies, true),
  fieldId = choice(Object.keys(FIELDS) as FieldId[]),
  unitType = choice([...ALLY_TYPES, ...ENEMY_TYPES]),
  enemyType = choice(ENEMY_TYPES),
  owner = choice(['player', 'ai']),
  vector = object<Point>({
    x: number(-maximumSpeed * 2, maximumSpeed * 2),
    y: number(-maximumSpeed * 2, maximumSpeed * 2)
  }),
  near = (left: number, right: number) => Math.abs(left - right) <= epsilon

function checked<T>(value: T | null): T {
  requireCheckpoint(value !== null)
  return value
}
function checkpointBounds(version: CheckpointVersion) {
  const cooldown = version === 1 ? 11 : maximumCooldown,
    strength = version === 1 ? legacyCheckpointRules(CONFIG.stages).strength : stageRules(CONFIG.stages).strength,
    scale = Math.max(multiplier(4), strength * 2.6),
    power =
      Math.max(...Object.values(DEFINITIONS).map((definition) => definition.attack)) *
      scale *
      (version >= 6 ? 1.2 : 1) *
      (version >= 7 ? COMMANDER_SUPPORT.attackMultiplier : 1),
    hp = Math.max(...Object.values(DEFINITIONS).map((definition) => definition.hp)) * scale * (version >= 6 ? 1.3 : 1)
  return {
    cooldown,
    power,
    hp,
    damage: power * CONFIG.maxUnits * maxTime * 4,
    deadline: maxTime + cooldown + HISTORY_LIMITS.windowSeconds
  }
}
function checkpointRules(checkpoint: DecodedCheckpoint) {
  return checkpoint.version === 1
    ? legacyCheckpointRules(checkpoint.state.stage)
    : stageRules(checkpoint.state.stage, checkpoint.state.waveBossPolicy)
}
function checkpointStats(
  checkpoint: DecodedCheckpoint,
  unit: Pick<Unit, 'owner' | 'type' | 'boss' | 'level' | 'equipment'> & Partial<Pick<Unit, 'maxHp'>>,
  version: CheckpointVersion = checkpoint.version
) {
  const level =
    unit.owner === 'player'
      ? checkpoint.progress.economyVersion === 2
        ? unit.level!
        : checkpoint.progress.unitLevels[unit.type as AllyType]
      : 1
  const stats = (
    version === 1
      ? legacyCheckpointCombatStats
      : version < 8
        ? preBalanceCheckpointCombatStats
        : version === 8
          ? versionEightCheckpointCombatStats
          : combatStats
  )(unit, checkpoint.state.stage, level)
  // Frozen pre-v15 balance must validate before any migration is applied.
  if (version >= 9 && version < 15 && unit.owner === 'player') {
    if (RANGED_ALLY_TYPES.includes(unit.type as AllyType)) stats.maxHp *= 2
    if (unit.type === 'paladin') stats.range = 46
  }
  if (version >= 9 && LEGACY_BASE_HP[unit.type] !== undefined && unit.maxHp !== undefined) {
    const legacyMaxHp = stats.maxHp * (LEGACY_BASE_HP[unit.type]! / DEFINITIONS[unit.type].hp)
    if (near(unit.maxHp, legacyMaxHp)) stats.maxHp = legacyMaxHp
    else if (['slime', 'goblin', 'wolf'].includes(unit.type) && near(unit.maxHp, legacyMaxHp * 1.2))
      stats.maxHp = legacyMaxHp * 1.2
  }
  return stats
}
function checkpointMembers(checkpoint: DecodedCheckpoint, action: CheckpointAction) {
  if (checkpoint.version < 3) {
    requireCheckpoint(isLegacyCheckpointAction(action, checkpoint.version as 1 | 2))
    return checked(legacyCheckpointMembers(action, checkpoint.version as 1 | 2))
  }
  requireCheckpoint(checkpoint.version === 3 ? isVersionThreeCheckpointAction(action) : isAction(action))
  requireCheckpoint(checkpoint.version >= 13 || action.type !== 'formation' || action.formationId !== 'breakthrough')
  return actionMembers(action as AIAction)
}

function decodeCurrentAction(value: unknown): AIAction {
  requireCheckpoint(isAction(value))
  return { ...value }
}

function checkpointGeometryBounds(version: CheckpointVersion) {
  if (version >= 14)
    return {
      coordinateBound:
        Math.max(...revisionFields.flatMap((field) => [field.width, field.height])) +
        Math.max(...Object.values(DEFINITIONS).map((definition) => definition.leash)),
      maximumPath: Math.max(...revisionFields.flatMap((field) => field.routes.map((route) => route.length))),
      routeWaypoints:
        17 + 16 * Math.max(...revisionFields.flatMap((field) => field.routes.map((route) => route.path.length)))
    }
  return version >= 4
    ? { coordinateBound, maximumPath, routeWaypoints: CHECKPOINT_LIMITS.routeWaypoints }
    : {
        coordinateBound:
          Math.max(...Object.values(FIELDS).flatMap((field) => [field.width, field.height])) +
          Math.max(...Object.values(DEFINITIONS).map((definition) => definition.leash)),
        maximumPath: Math.max(...Object.values(FIELDS).map((field) => pathLength(field.path))),
        routeWaypoints: 1 + 16 + Math.max(...Object.values(FIELDS).map((field) => field.path.length)) * 16
      }
}

function createCheckpointDecoder(version: CheckpointVersion): Decoder<DecodedCheckpoint> {
  const { coordinateBound, maximumPath, routeWaypoints } = checkpointGeometryBounds(version),
    coordinate = number(-coordinateBound, coordinateBound * 2),
    point = object<Point>({ x: coordinate, y: coordinate })
  const bounds = checkpointBounds(version),
    maximumCooldown = bounds.cooldown,
    maximumPower = bounds.power,
    maximumHp = bounds.hp,
    damage = number(0, bounds.damage),
    deadline = number(0, bounds.deadline)
  const decodeAction: Decoder<CheckpointAction> = (value) => {
    const input = record(value)
    if (version >= 4) {
      const action = decodeCurrentAction(input)
      requireCheckpoint(version >= 13 || action.type !== 'formation' || action.formationId !== 'breakthrough')
      return action
    }
    if (version === 3) {
      requireCheckpoint(isVersionThreeCheckpointAction(input))
      return { ...input }
    }
    requireCheckpoint(isLegacyCheckpointAction(input, version as 1 | 2))
    return { ...input }
  }

  const absent: Decoder<undefined> = (value) => {
    requireCheckpoint(value === undefined)
    return undefined
  }
  const decodeSupportBuff = object<SupportBuff>({
    effect: choice(['speed', 'armor', 'attack']),
    sequence: id,
    startedAt: time,
    expiresAt: deadline
  })
  const supportCastSchema = {
    id: string(48),
    sequence: id,
    stage,
    fieldId,
    action: object({ type: choice(['support']), effect: choice(SUPPORT_EFFECTS), targetId: id }),
    startedAt: time,
    applyAt: deadline,
    target: object({ id, type: enemyType, x: coordinate, y: coordinate }),
    source: choice(['jev'])
  }
  const decodeSupportCast = object<SupportCast>(supportCastSchema)
  const decodeSupportEvent = object<SupportEvent>({
    ...supportCastSchema,
    legacyBossHeal: version >= 8 ? optional(choice([true])) : absent,
    resolvedAt: time,
    outcome: choice(['applied', 'target-lost', 'cancelled', 'ineligible']),
    amount: number(0, COMMANDER_SUPPORT.maximumHeal)
  })
  const decodeSupport = object<CommanderSupportState>({
    sequence,
    nextReadyAt: deadline,
    cast: nullable(decodeSupportCast),
    history: array(decodeSupportEvent, COMMANDER_SUPPORT.historyLimit),
    status: choice(['waiting', 'ready', 'requesting', 'casting', 'cooldown', 'unavailable', 'disabled']),
    reason: nullable(choice(SUPPORT_UNAVAILABLE_REASONS)),
    retryAt: deadline
  })
  const decodeUnit = object<Unit>({
    supportBuff: version >= 7 ? optional(decodeSupportBuff) : absent,
    equipment: version >= 6 ? optional(choice(['weapon', 'armor'])) : absent,
    mudSlowUntil: version >= 6 ? optional(deadline) : absent,
    id,
    routeId: optional(choice(['left', 'right'])),
    flight: optional(
      object({
        targetId: id,
        returnProgress: number(0, maximumPath),
        phase: choice(['approach', 'engage', 'return'])
      })
    ),
    gateExit: optional(object({ attackId: string(32), exitAt: deadline })),
    owner,
    type: unitType,
    level: optional(number(1, 4, true)),
    hasFought: optional(boolean),
    redeployAnchor: optional(point),
    battleRelocation:
      version >= 11
        ? optional(
            object({
              anchor: point,
              usedStage: optional(number(1, CONFIG.stages, true)),
              destination: optional(point),
              waypoints: optional(array(point, routeWaypoints))
            })
          )
        : absent,
    slotId: optional(number(-maximumId, maximumId, true)),
    x: coordinate,
    y: coordinate,
    homeX: coordinate,
    homeY: coordinate,
    progress: number(0, maximumPath),
    travelled: number(0, maximumSpeed * maxTime),
    hp: number(0, maximumHp),
    maxHp: number(1, maximumHp),
    attack: number(0, maximumPower),
    speed: number(0, maximumSpeed),
    attackRange: number(0, coordinateBound),
    attackSpeed: number(0.01, 10),
    attackCooldown: number(0, 30),
    healCooldown:
      version >= 12
        ? optional(number(0, Math.max(...Object.values(HEALING_ACTIONS).map((action) => action.interval))))
        : absent,
    returnHomeAt: optional(deadline),
    attackAnimation: number(0, ANIMATION.attack),
    attackSequence: sequence,
    attackStartedAt: time,
    hitAnimation: number(0, ANIMATION.hit),
    attackTargetX: coordinate,
    attackTargetY: coordinate,
    moving: boolean,
    facingX: coordinate,
    facingY: coordinate,
    boss: boolean,
    slowUntil: deadline,
    slowFactor: number(0.01, 1)
  })
  const decodeBreathGeometry = object<BreathGeometry>({
    origin: point,
    direction: object<Point>({ x: number(-1, 1), y: number(-1, 1) }),
    length: number(0.01, coordinateBound),
    endHalfWidth: number(0, coordinateBound)
  })
  const decodeBreath = object<BreathAttackState>({
    direction: choice(BREATH_DIRECTIONS),
    nextTick: number(0, BREATH_TIMING.tickCount, true),
    lockedAim: optional(object<Point>({ x: number(-1, 1), y: number(-1, 1) })),
    shape: nullable(decodeBreathGeometry)
  })
  const decodeAttack = object<CombatAttack>({
    damageType: version >= 15 ? optional(choice(['melee', 'arrow', 'magic', 'physical'])) : absent,
    timeScale: version >= 15 ? optional(choice([0.8])) : absent,
    legacyPaladinRange: version >= 15 ? optional(choice([true])) : absent,
    kind: version >= 12 ? optional(choice(['attack', 'heal'])) : absent,
    geometryScale: version >= 9 ? optional(choice([1, 2])) : absent,
    legacyRegularAttack: version >= 9 ? optional(choice([true])) : absent,
    supportAttack: version >= 7 ? optional(object({ sequence: id, startedAt: time, expiresAt: deadline })) : absent,
    battlefieldVersion: optional(choice([1, 2])),
    variant: optional(choice(['breath'])),
    breath: optional(decodeBreath),
    id: string(32),
    attackerId: id,
    sequence: id,
    owner,
    type: unitType,
    targetId: optional(id),
    barrierId: optional(id),
    healing: optional(
      object<NonNullable<CombatAttack['healing']>>({
        targetId: id,
        target: point,
        active: boolean,
        hit: boolean,
        amount: version >= 12 ? optional(number(0.01, maximumHp)) : absent
      })
    ),
    damageActive: boolean,
    damageHit: boolean,
    base: boolean,
    power: number(0, maximumPower),
    range: number(0, coordinateBound),
    startedAt: time,
    releaseAt: deadline,
    impactAt: deadline,
    endsAt: deadline,
    projectile: boolean,
    status: choice(['windup', 'released', 'hit', 'missed', 'cancelled']),
    origin: point,
    target: point,
    aim: optional(point),
    targetVelocity: optional(vector),
    boss: optional(boolean)
  })
  const decodeSandbag = object<Sandbag>({
    id,
    edgeId: optional(string(64)),
    offset: optional(number(0, maximumPath)),
    x: coordinate,
    y: coordinate,
    progress: number(0, maximumPath),
    hp: number(0, LEGACY_SANDBAG_MAX_HP),
    maxHp: choice([ROAD_EFFECTS.sandbag.hp, LEGACY_SANDBAG_MAX_HP])
  })
  const decodeSpawn = object<ScheduledSpawn>({
    routeId: optional(choice(['left', 'right'])),
    targetId: optional(id),
    returnProgress: optional(number(0, maximumPath)),
    deploymentId: id,
    unitType: enemyType,
    boss: boolean,
    spawnAt: deadline,
    cost: number(1, 5, true),
    previousCooldownUntil: deadline
  })
  const summarySchema = {
    stage,
    spawned: count,
    resolved: count,
    maxProgress: number(0, 1),
    baseDamage: number(0, CONFIG.baseHp),
    defenderDamage: damage
  }
  const decodeSummary = object<StageSummary>(summarySchema)
  const decodeOutcome = object<DeploymentOutcome>({
    ...summarySchema,
    id,
    actionKey: string(64),
    cancelled: number(0, maximumMembers, true)
  })
  const decodePlan = object<TacticalPlan>({
    id,
    actionKey: string(64),
    label: string(CHECKPOINT_LIMITS.text),
    reason: string(CHECKPOINT_LIMITS.text),
    startedAt: time,
    expiresAt: deadline,
    status: choice(['executing', 'observing', 'interrupted', 'completed']),
    reconsideration: nullable(string(CHECKPOINT_LIMITS.text))
  })
  const decodeCorpse = object<CheckpointCorpse>({
    id,
    owner,
    type: unitType,
    boss: boolean,
    x: coordinate,
    y: coordinate,
    facingX: number(-1, 1, true),
    facingY: number(-1, 1, true),
    diedAt: time,
    activePose: boolean,
    fieldId,
    stage
  })
  const decodeCooldowns: Decoder<GameState['cooldowns']> = (value) => {
    const input = record(value)
    return Object.fromEntries(
      ENEMY_TYPES.map((type) => [type, number(0, maximumCooldown)(input[type])])
    ) as GameState['cooldowns']
  }
  const roadAnchorSchema = {
    id,
    x: coordinate,
    y: coordinate,
    progress: number(0, maximumPath),
    edgeId: string(64),
    offset: number(0, maximumPath)
  }
  const decodeSpike = object<Extract<RoadItem, { kind: 'spike' }>>({
    ...roadAnchorSchema,
    kind: choice(['spike']),
    hp: number(Number.MIN_VALUE, FORTIFICATIONS.spike.hp),
    maxHp: choice([FORTIFICATIONS.spike.hp])
  })
  const decodeMud = object<Extract<RoadItem, { kind: 'mud' }>>({
    ...roadAnchorSchema,
    kind: choice(['mud']),
    charges: number(1, FORTIFICATIONS.mud.charges, true),
    insideIds: array(id, CONFIG.maxUnits)
  })
  const decodeRoadItem: Decoder<RoadItem> = (value) => {
    const input = record(value),
      kind = choice(['spike', 'mud'])(input.kind)
    if (kind === 'spike') {
      requireCheckpoint(input.charges === undefined && input.insideIds === undefined)
      return decodeSpike(value)
    }
    requireCheckpoint(input.hp === undefined && input.maxHp === undefined)
    return decodeMud(value)
  }
  const decodeGateShot = object<GateShot>({
    id: string(32),
    sequence: id,
    targetId: id,
    power: choice([0, ...FORTIFICATIONS.cannon.damage]),
    startedAt: time,
    releaseAt: deadline,
    impactAt: deadline,
    status: choice(['windup', 'released', 'hit', 'missed', 'cancelled']),
    origin: point,
    target: point
  })
  const totalEarnableGold =
    STARTING_GOLD +
    Array.from({ length: CONFIG.stages }, (_, index) => stageRules(index + 1).reward).reduce(
      (sum, reward) => sum + reward,
      0
    )
  const decodeFortifications = object<FortificationsState>({
    items: array(decodeRoadItem, FORTIFICATIONS.maxItems),
    gate: object({
      cannonLevel: number(0, 3, true),
      armorLevel: number(0, 3, true),
      cooldown: number(0, FORTIFICATIONS.cannon.interval),
      sequence,
      shots: array(decodeGateShot, FORTIFICATIONS.cannon.maxShots)
    }),
    fortificationSpend: number(0, totalEarnableGold, true),
    gearSpend: number(0, totalEarnableGold, true)
  })
  const stateSchema = {
    commanderSupportVersion: version >= 7 ? optional(choice([1])) : absent,
    commanderSupport: version >= 7 ? optional(decodeSupport) : absent,
    fortifications: version >= 6 ? optional(decodeFortifications) : absent,
    economyVersion: optional(choice([2])),
    reserveUnits: optional(array(decodeUnit, ALLY_TYPES.length)),
    time,
    stage,
    phase: choice(['preparation', 'assault', 'cleared', 'defeat', 'victory']),
    fieldId,
    seed: number(0, maximumId, true),
    playerBaseHp: number(0, CONFIG.baseHp),
    enemiesSpawned: count,
    enemiesResolved: count,
    budgetSpent: number(0, stageRules(CONFIG.stages).spawnBudget, true),
    nextSpawnAt: deadline,
    units: array(decodeUnit, CONFIG.maxUnits),
    attacks: array(decodeAttack, CHECKPOINT_LIMITS.attacks),
    sandbags: array(decodeSandbag, CONFIG.stages),
    sandbagStock: number(0, CONFIG.stages, true),
    cooldowns: decodeCooldowns,
    pendingSpawns: array(decodeSpawn, maximumMembers),
    reservedBudget: number(0, maximumMembers * 5, true),
    strategy: nullable(decodePlan),
    recentOutcomes: array(decodeOutcome, HISTORY_LIMITS.deployments),
    stageSummary: decodeSummary,
    previousStageSummary: nullable(decodeSummary),
    result: nullable(choice(['win', 'lose'])),
    lastAction: nullable(decodeAction),
    requestedAction: nullable(decodeAction),
    decisionTime: time,
    cooldownHold:
      version >= 14
        ? optional((value) => {
            const input = record(value)
            requireCheckpoint(
              Object.keys(input).length === 5 &&
                Object.keys(input).every((key) => ['action', 'phase', 'stage', 'fieldId', 'startedAt'].includes(key))
            )
            const hold = object<NonNullable<GameState['cooldownHold']>>({
              action: (value) => {
                requireCheckpoint(isAction(value) && value.type === 'wait')
                return value
              },
              phase: choice(['cooling', 'ready', 'invalidated']),
              stage,
              fieldId,
              startedAt: time
            })(value)
            return hold
          })
        : absent,
    historyEnabled: boolean,
    corpses: array(decodeCorpse, maximumEnemies + CONFIG.stages)
  }
  const decodeLegacyState = object<LegacyCampaignCheckpoint['state']>(stateSchema)
  const decodeState = object<DecodedStateCheckpoint>({ ...stateSchema, waveBossPolicy: choice([1, 2]) })
  const decodeCurrentState = object<CampaignStateCheckpoint>({
    ...stateSchema,
    battlefieldVersion: choice([1, 2]),
    layoutRevision: version >= 14 ? choice([1, 2, 3]) : () => 1,
    waveBossPolicy: choice([1, 2]),
    lastAction: nullable(decodeCurrentAction),
    requestedAction: nullable(decodeCurrentAction)
  })
  const decodeRuntime = object<CampaignRuntimeCheckpoint>({
    id: sequence,
    accumulator: number(0, 0.25 + CONFIG.step),
    randomState: number(0, maximumId, true),
    deploymentSequence: sequence,
    decisionRevision: sequence,
    deploymentByUnit: array(object({ unitId: id, deploymentId: id }), maximumEnemies),
    lastDeploymentAt: nullable(time),
    planDefenders: number(0, CONFIG.stages, true),
    planBaseHp: number(0, CONFIG.baseHp),
    interception: object<InterceptionSnapshot>({
      context: string(2048),
      lastTime: time,
      intents: array(
        object({
          unitId: id,
          targetId: optional(id),
          point,
          waypoints: array(point, 64),
          interceptAt: deadline,
          checkedAt: time,
          selectedAt: time,
          enemyFingerprint: optional(string(256))
        }),
        CONFIG.stages
      ),
      forecasts: array(
        object({
          unitId: id,
          checkedAt: time,
          fingerprint: string(256),
          samples: array(
            object({ x: coordinate, y: coordinate, progress: number(0, maximumPath), at: deadline }),
            Math.round(INTERCEPTION.horizon / INTERCEPTION.sampleSeconds) + 1
          )
        }),
        INTERCEPTION.maxEnemies
      )
    }),
    defenderDetours: array(
      object({
        unitId: id,
        targetId: optional(id),
        target: point,
        waypoints: array(point, routeWaypoints)
      }),
      CONFIG.stages
    ),
    failedDefenderDetours: array(
      object({ unitId: id, targetId: optional(id), target: point, retryAt: deadline }),
      CONFIG.stages
    )
  })
  const decodeHistoryEvent = object<HistoryEvent>({
    at: time,
    kind: choice(['addition', 'removal', 'upgrade', 'loss', 'area-loss']),
    unitId: id,
    unitType,
    x: coordinate,
    y: coordinate,
    amount: optional(damage),
    sourceId: optional(version >= 6 ? sequence : id),
    sourceType: optional(version >= 6 ? choice([...ALLY_TYPES, ...ENEMY_TYPES, 'gate', 'spike']) : unitType),
    victimIds: optional(array(id, CHECKPOINT_LIMITS.historyVictims))
  })
  const legacyDefault =
    <T>(fallback: T): Decoder<T> =>
    (value) => {
      requireCheckpoint(value === undefined)
      return structuredClone(fallback)
    }
  const historySourceType = choice([...ALLY_TYPES, ...ENEMY_TYPES, 'gate', 'spike'] as const)
  const decodeHistorySource = object<HistorySource>({
    sourceId: sequence,
    sourceType: historySourceType,
    sourceKind: choice(['unit', 'trap', 'turret'])
  })
  const decodeHistorySourceDamage = object<HistorySourceDamage>({
    sourceId: sequence,
    sourceType: historySourceType,
    sourceKind: choice(['unit', 'trap', 'turret']),
    damage
  })
  const decodeEnemyLedger = object<EnemyDamageLedger>({
    enemyId: id,
    enemyType,
    boss: boolean,
    totalDamage: damage,
    sources: array(decodeHistorySourceDamage, ENEMY_HISTORY_LIMITS.sourcesPerEnemy),
    omittedContributions: sequence,
    omittedDamage: damage,
    legacyUnknown: boolean
  })
  const decodeEnemyOutcome = object<EnemyOutcome>({
    id: string(64),
    at: time,
    enemyId: id,
    enemyType,
    boss: nullable(boolean),
    routeId: nullable(choice(['left', 'right'])),
    progress: nullable(number(0, maximumPath)),
    x: coordinate,
    y: coordinate,
    flightPhase: nullable(choice(['approach', 'engage', 'return'])),
    cause: choice(['combat-death', 'gate-exit']),
    receivedDamage: damage,
    attributionComplete: boolean,
    legacyUnknown: boolean,
    lastKiller: nullable(decodeHistorySource),
    lethalContributors: array(decodeHistorySourceDamage, ENEMY_HISTORY_LIMITS.sourcesPerEnemy),
    omittedLethalContributors: sequence,
    omittedLethalDamage: damage
  })
  const decodeHistoryDamage = object<HistoryContribution>({
    at: time,
    deploymentId: nullable(id),
    victimId: id,
    victimType: version >= 13 ? nullable(unitType) : legacyDefault(null),
    sourceKind: version >= 13 ? choice(['unit', 'trap', 'turret']) : legacyDefault('unit'),
    attackId: version >= 13 ? nullable(string(128)) : legacyDefault(null),
    tick: version >= 13 ? nullable(number(0, BREATH_TIMING.tickCount - 1, true)) : legacyDefault(null),
    legacyUnknown: version >= 13 ? boolean : legacyDefault(true),
    sourceId: version >= 6 ? sequence : id,
    sourceType: version >= 6 ? choice([...ALLY_TYPES, ...ENEMY_TYPES, 'gate', 'spike']) : unitType,
    damage,
    onDefeatStep: boolean,
    area: boolean
  })
  const decodeHistoryDeployment = object<HistoryDeployment>({
    id,
    exited: optional(number(0, maximumMembers, true)),
    actionKey: string(64),
    startedAt: time,
    lastEventAt: time,
    order: array(enemyType, maximumMembers),
    spacingSeconds: array(number(0, maximumMembers), maximumMembers - 1),
    spawned: number(0, maximumMembers, true),
    resolved: number(0, maximumMembers, true),
    cancelled: number(0, maximumMembers, true),
    maxProgress: number(0, 1),
    baseDamage: number(0, CONFIG.baseHp),
    defenderDamage: damage,
    frontSurvivalSeconds: nullable(time),
    frontAlive: nullable(boolean),
    observedOrder: array(enemyType, maximumMembers),
    observedGaps: array(number(0, maximumPath), maximumMembers - 1),
    rearPassedFront: boolean
  })
  const decodeHistory = object<TacticalHistoryCheckpoint>({
    version: choice(version >= 13 ? ([2] as const) : ([1] as const)),
    fieldId,
    stage,
    lastTime: time,
    omittedUntil: number(-1, maxTime + HISTORY_LIMITS.windowSeconds),
    events: array(decodeHistoryEvent, HISTORY_LIMITS.storedEvents),
    damage: array(decodeHistoryDamage, HISTORY_LIMITS.storedDamage),
    enemyOutcomes: version >= 13 ? array(decodeEnemyOutcome, ENEMY_HISTORY_LIMITS.enemies) : legacyDefault([]),
    enemyLedger: version >= 13 ? array(decodeEnemyLedger, ENEMY_HISTORY_LIMITS.enemies) : legacyDefault([]),
    discardedContributions: version >= 13 ? sequence : legacyDefault(0),
    discardedDamage: version >= 13 ? damage : legacyDefault(0),
    discardedOutcomes: version >= 13 ? sequence : legacyDefault(0),
    legacyUnknown: version >= 13 ? boolean : legacyDefault(true),
    deployments: array(
      object({
        summary: decodeHistoryDeployment,
        members: array(
          object({ id, type: enemyType, spawnedAt: time, diedAt: nullable(time), exitedAt: optional(time) }),
          maximumMembers
        )
      }),
      HISTORY_LIMITS.storedDeployments
    )
  })

  const checkpointSchema = {
    profile: (value: unknown) => checked(parseProfile(value)),
    progress: (value: unknown) => checked(parseRunProgress(value)),
    rewardedThroughStage: number(0, CONFIG.stages, true),
    runtime: decodeRuntime,
    history: decodeHistory
  }
  if (version === 1)
    return object<LegacyCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([1]),
      state: decodeLegacyState
    })
  if (version === 2)
    return object<VersionTwoCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([2]),
      state: decodeState
    })
  if (version === 3)
    return object<VersionThreeCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([3]),
      state: decodeState
    })
  if (version === 4)
    return object<VersionFourCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([4]),
      state: decodeCurrentState
    })
  if (version === 5)
    return object<VersionFiveCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([5]),
      state: decodeCurrentState
    })
  if (version === 6)
    return object<VersionSixCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([6]),
      state: decodeCurrentState
    })
  if (version === 7)
    return object<VersionSevenCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([7]),
      state: decodeCurrentState
    })
  if (version === 8)
    return object<VersionEightCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([8]),
      state: decodeCurrentState
    })
  if (version === 9)
    return object<VersionNineCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([9]),
      state: decodeCurrentState
    })
  if (version === 10)
    return object<VersionTenCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([10]),
      state: decodeCurrentState
    })
  if (version === 11)
    return object<VersionElevenCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([11]),
      state: decodeCurrentState
    })
  if (version === 12)
    return object<VersionTwelveCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([12]),
      state: decodeCurrentState
    })
  if (version === 13)
    return object<VersionThirteenCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([13]),
      state: decodeCurrentState
    })
  if (version === 14)
    return object<VersionFourteenCampaignCheckpoint>({
      ...checkpointSchema,
      version: choice([14]),
      state: decodeCurrentState
    })
  return object<CampaignCheckpoint>({ ...checkpointSchema, version: choice([15]), state: decodeCurrentState })
}
const checkpointDecoders = {
  1: createCheckpointDecoder(1),
  2: createCheckpointDecoder(2),
  3: createCheckpointDecoder(3),
  4: createCheckpointDecoder(4),
  5: createCheckpointDecoder(5),
  6: createCheckpointDecoder(6),
  7: createCheckpointDecoder(7),
  8: createCheckpointDecoder(8),
  9: createCheckpointDecoder(9),
  10: createCheckpointDecoder(10),
  11: createCheckpointDecoder(11),
  12: createCheckpointDecoder(12),
  13: createCheckpointDecoder(13),
  14: createCheckpointDecoder(14),
  15: createCheckpointDecoder(15)
}
function decodeCheckpoint(value: unknown): DecodedCheckpoint {
  const input = record(value),
    version = choice([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])(input.version),
    state = record(input.state)
  // Select and validate layout identity before decoding any geometry-dependent number.
  const revision = version >= 14 ? choice([1, 2, 3])(state.layoutRevision) : 1
  requireCheckpoint(version >= 14 || state.layoutRevision === undefined || state.layoutRevision === 1)
  const rules = version >= 4 ? choice([1, 2])(state.battlefieldVersion) : 1
  resolveBattlefield(FIELDS[fieldId(state.fieldId)], rules, revision)
  return checkpointDecoders[version](value)
}

function unique(values: readonly (string | number)[]): boolean {
  return new Set(values).size === values.length
}
function actionFromKey(key: string, version: CheckpointVersion): CheckpointAction | null {
  if (version >= 4 && key.includes(':route:')) {
    const match = /^(.*):route:(left|right)(?::target:([1-9][0-9]*))?$/.exec(key)
    if (!match) return null
    const base = actionFromKey(match[1], version)
    if (!base || base.type === 'wait') return null
    const action = { ...base, routeId: match[2], ...(match[3] ? { targetId: Number(match[3]) } : {}) }
    return isAction(action) && actionKey(action) === key ? action : null
  }
  if (version < 3) return legacyCheckpointActionFromKey(key, version as 1 | 2)
  for (const formationId of Object.keys(FORMATIONS) as (keyof typeof FORMATIONS)[]) {
    if (version < 13 && formationId === 'breakthrough') continue
    const action: AIAction = { type: 'formation', formationId }
    if (actionKey(action) === key) return action
  }
  for (const unitType of ENEMY_TYPES)
    for (const boss of [false, true]) {
      for (const type of ['spawn', 'wait'] as const) {
        const action: AIAction = { type, unitType, boss }
        if (actionKey(action) === key) return action
      }
    }
  return null
}
function validRole(owner: Unit['owner'], type: Unit['type']): boolean {
  return owner === 'player' ? ALLY_TYPES.includes(type as AllyType) : ENEMY_TYPES.includes(type as EnemyType)
}
function validEnemy(type: EnemyType, boss: boolean, checkpoint: DecodedCheckpoint): boolean {
  const rules = checkpointRules(checkpoint)
  return boss ? rules.bossType === type : rules.enemyTypes.includes(type)
}
function validAction(action: CheckpointAction, checkpoint: DecodedCheckpoint): boolean {
  if (checkpoint.version < 13 && action.type === 'formation' && action.formationId === 'breakthrough') return false
  if (checkpoint.version >= 3) {
    if (!(checkpoint.version === 3 ? isVersionThreeCheckpointAction(action) : isAction(action))) return false
    if (action.type !== 'wait') {
      const current = action as Exclude<AIAction, { type: 'wait' }>
      if (battlefieldVersion(checkpoint) === 1) {
        if (current.routeId !== undefined || ('targetId' in current && current.targetId !== undefined)) return false
      } else {
        if (current.routeId === undefined) return false
        if (
          'targetId' in current &&
          current.targetId !== undefined &&
          (current.targetId > checkpoint.runtime.id || !isAirborneEnemy(current.unitType))
        )
          return false
      }
    }
  }
  if (action.type === 'wait')
    return checkpoint.version < 3 || (isAction(action) && validEnemy(action.unitType, !!action.boss, checkpoint))
  if (checkpoint.version !== 1 && action.type === 'formation') {
    const formation = FORMATIONS[action.formationId]
    if ('unlockStage' in formation && checkpoint.state.stage < Number(formation.unlockStage)) return false
  }
  return checkpointMembers(checkpoint, action).every((member) => validEnemy(member.unitType, member.boss, checkpoint))
}
function validateSummary(summary: StageSummary): void {
  requireCheckpoint(summary.resolved <= summary.spawned && summary.spawned <= stageRules(summary.stage).enemyCount)
}

export function validateCampaignCheckpoint(
  value: unknown,
  progress: RunProgressData,
  profile: ProfileData
): CampaignCheckpoint | null {
  try {
    const checkpoint = decodeCheckpoint(value)
    validateCheckpointSemantics(checkpoint, progress, profile)
    const normalized = checkpoint.version === 1 ? migrateLegacyCheckpoint(checkpoint) : checkpoint
    normalizeSandbagHealth(normalized)
    if (normalized.version < 8) migrateBossAndMeleeBalance(normalized)
    if (normalized.version < 9) migrateEnemyCombatBalance(normalized)
    if (normalized.version < 10) migrateBossFlightReturn(normalized)
    if (normalized.version < 12) migrateIndependentHealing(normalized)
    if (normalized.version < 13) migrateTacticalHistory(normalized)
    if (normalized.version < 15) migrateCombatTempoRangeHealth(normalized)
    migrateHealthBalance(normalized)
    removePaladinHealing(normalized)
    const migrated = normalized.version === 2 ? migrateGenericWaitCheckpoint(normalized) : normalized,
      current = checkpointDecoders[15]({
        ...migrated,
        version: 15,
        state: {
          ...migrated.state,
          battlefieldVersion: battlefieldVersion(migrated),
          layoutRevision: layoutRevision(migrated),
          units: migrated.state.units.map((unit) =>
            migrated.version < 11 && unit.owner === 'player' && migrated.state.phase !== 'preparation'
              ? { ...unit, battleRelocation: { anchor: { x: unit.homeX, y: unit.homeY } } }
              : unit
          ),
          ...(migrated.version < 6 && migrated.state.economyVersion === 2
            ? { fortifications: freshFortifications() }
            : {})
        }
      })
    requireCheckpoint(current.version === 15)
    validateCheckpointSemantics(current, progress, current.profile)
    return current
  } catch {
    return null
  }
}

// Only mutable unit balance migrates. Captured recipients, deadlines, damage and
// healing stay intact; absent timeScale keeps all historical actions at 1.0x.
function removePaladinHealing(checkpoint: DecodedCheckpoint): void {
  const changed =
    checkpoint.state.units.some((unit) => unit.type === 'paladin' && unit.healCooldown !== undefined) ||
    checkpoint.state.attacks.some((attack) => attack.type === 'paladin' && attack.healing !== undefined)
  for (const unit of [...checkpoint.state.units, ...(checkpoint.state.reserveUnits ?? [])])
    if (unit.type === 'paladin') delete unit.healCooldown
  checkpoint.state.attacks = checkpoint.state.attacks.filter(
    (attack) =>
      !(
        attack.type === 'paladin' &&
        (attack.kind === 'heal' ||
          (attack.healing !== undefined &&
            attack.targetId === undefined &&
            attack.barrierId === undefined &&
            !attack.base))
      )
  )
  for (const attack of checkpoint.state.attacks) if (attack.type === 'paladin') delete attack.healing
  if (changed) checkpoint.runtime.interception = { context: '', lastTime: 0, intents: [], forecasts: [] }
}

function migrateHealthBalance(checkpoint: DecodedCheckpoint): void {
  let changed = false
  for (const unit of [...checkpoint.state.units, ...(checkpoint.state.reserveUnits ?? [])]) {
    if (LEGACY_BASE_HP[unit.type] === undefined) continue
    const level =
        unit.owner === 'ai'
          ? 1
          : checkpoint.progress.economyVersion === 2
            ? unit.level!
            : checkpoint.progress.unitLevels[unit.type as AllyType],
      maxHp = combatStats(unit, checkpoint.state.stage, level).maxHp
    if (near(unit.maxHp, maxHp)) continue
    unit.hp = unit.hp === 0 ? 0 : Math.max(Number.MIN_VALUE, Math.min(maxHp, unit.hp * (maxHp / unit.maxHp)))
    unit.maxHp = maxHp
    changed = true
  }
  if (changed) checkpoint.runtime.interception = { context: '', lastTime: 0, intents: [], forecasts: [] }
}

function migrateCombatTempoRangeHealth(checkpoint: DecodedCheckpoint): void {
  let changed = false
  for (const unit of [...checkpoint.state.units, ...(checkpoint.state.reserveUnits ?? [])]) {
    if (unit.owner !== 'player') continue
    if (RANGED_ALLY_TYPES.includes(unit.type as AllyType)) {
      unit.maxHp *= 0.5
      unit.hp = unit.hp === 0 ? 0 : Math.max(Number.MIN_VALUE, unit.hp * 0.5)
      changed = true
    }
    if (unit.type === 'paladin') {
      unit.attackRange = DEFINITIONS.paladin.range
      changed = true
    }
  }
  for (const attack of checkpoint.state.attacks)
    if (attack.owner === 'player' && attack.type === 'paladin' && attack.kind !== 'heal')
      attack.legacyPaladinRange = true
  if (changed) checkpoint.runtime.interception = new DefenderInterception().snapshot()
}

/** Historical receipts are retained as partial evidence, never re-executed or called complete. */
function migrateTacticalHistory(checkpoint: DecodedCheckpoint): void {
  const { history, state } = checkpoint
  history.version = 2
  history.legacyUnknown = true
  const typeFor = (id: number) =>
    state.units.find((unit) => unit.id === id)?.type ??
    state.corpses.find((unit) => unit.id === id)?.type ??
    history.deployments.flatMap((value) => value.members).find((member) => member.id === id)?.type ??
    history.events.find((event) => event.unitId === id)?.unitType ??
    null
  const ledgerFor = (id: number, type: EnemyType): EnemyDamageLedger | undefined => {
    let ledger = history.enemyLedger.find((value) => value.enemyId === id)
    if (!ledger && history.enemyLedger.length < ENEMY_HISTORY_LIMITS.enemies) {
      const unit = state.units.find((unit) => unit.id === id) ?? state.corpses.find((unit) => unit.id === id)
      ledger = {
        enemyId: id,
        enemyType: type,
        boss: unit?.boss ?? false,
        totalDamage: 0,
        sources: [],
        omittedContributions: 0,
        omittedDamage: 0,
        legacyUnknown: true
      }
      history.enemyLedger.push(ledger)
    }
    return ledger
  }
  for (const unit of state.units) if (unit.owner === 'ai') ledgerFor(unit.id, unit.type as EnemyType)
  for (const receipt of history.damage) {
    receipt.victimType = typeFor(receipt.victimId)
    receipt.sourceKind = sourceKind(receipt.sourceType)
    if (!isEnemyHistoryType(receipt.victimType)) continue
    const ledger = ledgerFor(receipt.victimId, receipt.victimType)
    if (!ledger) continue
    ledger.totalDamage += receipt.damage
    const previous = ledger.sources.find((value) => sourceKey(value) === sourceKey(receipt))
    if (previous) previous.damage += receipt.damage
    else if (ledger.sources.length < ENEMY_HISTORY_LIMITS.sourcesPerEnemy)
      ledger.sources.push({
        sourceId: receipt.sourceId,
        sourceType: receipt.sourceType,
        sourceKind: receipt.sourceKind,
        damage: receipt.damage
      })
    else {
      ledger.omittedContributions++
      ledger.omittedDamage += receipt.damage
    }
  }
  for (const event of history.events) {
    if (
      event.kind !== 'loss' ||
      !isEnemyHistoryType(event.unitType) ||
      history.enemyOutcomes.some((value) => value.enemyId === event.unitId)
    )
      continue
    const ledger = ledgerFor(event.unitId, event.unitType)
    const unit = state.units.find((unit) => unit.id === event.unitId),
      corpse = state.corpses.find((unit) => unit.id === event.unitId)
    const deployment = history.deployments.find((value) => value.members.some((member) => member.id === event.unitId))
    const action = deployment ? actionFromKey(deployment.summary.actionKey, checkpoint.version) : null
    const lethal = new Map<string, HistorySourceDamage>()
    for (const receipt of history.damage.filter(
      (value) => value.victimId === event.unitId && value.onDefeatStep && near(value.at, event.at)
    )) {
      const key = sourceKey(receipt),
        previous = lethal.get(key)
      lethal.set(key, {
        sourceId: receipt.sourceId,
        sourceType: receipt.sourceType,
        sourceKind: receipt.sourceKind,
        damage: receipt.damage + (previous?.damage ?? 0)
      })
    }
    const sources = [...lethal.values()],
      omitted = sources.slice(ENEMY_HISTORY_LIMITS.sourcesPerEnemy)
    history.enemyOutcomes.push({
      id: `enemy:${event.unitId}:combat-death`,
      at: event.at,
      enemyId: event.unitId,
      enemyType: event.unitType,
      boss:
        unit?.boss ??
        corpse?.boss ??
        (action?.type === 'spawn' ? !!action.boss : action?.type === 'formation' ? false : null),
      routeId:
        unit?.routeId ??
        (action && action.type !== 'wait' && 'routeId' in action
          ? ((action as AIAction & { routeId?: 'left' | 'right' }).routeId ?? null)
          : null),
      progress: unit?.progress ?? null,
      x: event.x,
      y: event.y,
      flightPhase: unit?.flight?.phase ?? null,
      cause: 'combat-death',
      receivedDamage: ledger?.totalDamage ?? 0,
      attributionComplete: false,
      legacyUnknown: true,
      lastKiller: null,
      lethalContributors: sources.slice(0, ENEMY_HISTORY_LIMITS.sourcesPerEnemy),
      omittedLethalContributors: omitted.length,
      omittedLethalDamage: omitted.reduce((sum, value) => sum + value.damage, 0)
    })
  }
  history.enemyOutcomes.sort((a, b) => a.at - b.at || a.enemyId - b.enemyId)
  history.discardedOutcomes = Math.max(0, history.enemyOutcomes.length - ENEMY_HISTORY_LIMITS.enemies)
  history.enemyOutcomes = history.enemyOutcomes.slice(-ENEMY_HISTORY_LIMITS.enemies)
}

/** Frozen old actions remain coupled until their already accepted outcomes finish. */
function checkpointHealingRole(unit: Pick<Unit, 'owner' | 'type'>): 'healer' | 'paladin' | undefined {
  return unit.owner === 'player' && (unit.type === 'healer' || unit.type === 'paladin') ? unit.type : undefined
}

function independentHealInterval(type: 'healer' | 'paladin'): number {
  return HEALING_ACTIONS[type].interval
}

function migrateIndependentHealing(checkpoint: DecodedCheckpoint): void {
  const state = checkpoint.state
  for (const unit of [...state.units, ...(state.reserveUnits ?? [])]) {
    const role = checkpointHealingRole(unit)
    if (!role) continue
    // Old saves do not distinguish the last heal from the last damage attack. A
    // full interval is conservative and cannot grant an extra heal on restore.
    const pristine =
      state.phase === 'preparation' &&
      unit.attackCooldown === 0 &&
      unit.attackSequence === 0 &&
      (unit.hasFought === false || state.stage === 1)
    unit.healCooldown = pristine ? 0 : independentHealInterval(role)
  }
  for (const attack of state.attacks)
    if (attack.healing) {
      const role = checkpointHealingRole(attack)
      requireCheckpoint(role !== undefined)
      attack.healing.amount = LEGACY_CHECKPOINT_HEAL_AMOUNT[role]
    }
}

function validateCheckpointSemantics(
  checkpoint: DecodedCheckpoint,
  progress: RunProgressData,
  profile: ProfileData
): void {
  const pairedProgress = checked(parseRunProgress(progress)),
    pairedProfile = checked(parseProfile(profile)),
    s = checkpoint.state,
    runtime = checkpoint.runtime,
    rules = checkpointRules(checkpoint),
    paidRoster = pairedProgress.economyVersion === 2,
    defenders = s.units.filter((unit) => unit.owner === 'player'),
    reserves = s.reserveUnits ?? [],
    retained = [...defenders, ...reserves]
  requireCheckpoint(s.economyVersion === pairedProgress.economyVersion)
  requireCheckpoint(paidRoster ? checkpoint.version >= 5 && s.reserveUnits !== undefined : s.reserveUnits === undefined)
  requireCheckpoint(
    paidRoster && checkpoint.version >= 6 ? s.fortifications !== undefined : s.fortifications === undefined
  )
  if (paidRoster) {
    requireCheckpoint(ALLY_TYPES.every((type) => pairedProgress.unitLevels[type] === 1))
    requireCheckpoint(retained.length <= ALLY_TYPES.length && unique(retained.map((unit) => unit.type)))
    requireCheckpoint(retained.every((unit) => !runtime.deploymentByUnit.some((entry) => entry.unitId === unit.id)))
  }
  requireCheckpoint(checkpoint.version === 1 || s.phase !== 'preparation' || checkpoint.state.waveBossPolicy === 2)
  requireCheckpoint(JSON.stringify(checkpoint.progress) === JSON.stringify(pairedProgress))
  requireCheckpoint(JSON.stringify(checkpoint.profile) === JSON.stringify(pairedProfile))
  if (checkpoint.version < 8)
    requireCheckpoint(pairedProfile.purchased.every((type) => LEGACY_PURCHASED_ALLIES.includes(type)))
  const won = s.phase === 'cleared' || s.phase === 'victory',
    rewarded = won ? s.stage : s.stage - 1,
    earned = Array.from({ length: rewarded }, (_, index) => stageRules(index + 1).reward).reduce(
      (sum, reward) => sum + reward,
      0
    ),
    levels = paidRoster
      ? retained.map((unit) => unit.level!)
      : ALLY_TYPES.map((type) => pairedProgress.unitLevels[type]),
    upgradeSpend = levels.reduce(
      (sum, level) =>
        sum +
        Array.from({ length: level - 1 }, (_, index) => upgradeCost(index + 1)).reduce(
          (total, cost) => total + cost,
          0
        ),
      0
    ),
    deploymentSpend = paidRoster ? defenders.length * DEPLOYMENT_COST : 0
  requireCheckpoint(
    checkpoint.rewardedThroughStage === rewarded && pairedProgress.highestStage === Math.max(1, rewarded)
  )
  requireCheckpoint(
    pairedProgress.gold +
      upgradeSpend +
      deploymentSpend +
      (s.fortifications?.fortificationSpend ?? 0) +
      (s.fortifications?.gearSpend ?? 0) <=
      earned + (paidRoster ? (checkpoint.version < 8 ? LEGACY_STARTING_GOLD : STARTING_GOLD) : 0)
  )
  for (const type of ALLY_TYPES)
    if (pairedProgress.unitLevels[type] > 1)
      requireCheckpoint(
        checkpoint.version < 8
          ? legacyCheckpointAllyAvailable(type, s.stage, pairedProfile.purchased)
          : DEFINITIONS[type].purchaseCost === 0 || pairedProfile.purchased.includes(type)
      )
  requireCheckpoint(s.result === (won ? 'win' : s.phase === 'defeat' ? 'lose' : null))
  requireCheckpoint((s.phase === 'defeat') === (s.playerBaseHp === 0))
  requireCheckpoint(s.phase !== 'victory' || s.stage === CONFIG.stages)
  requireCheckpoint(s.phase !== 'cleared' || s.stage < CONFIG.stages)
  requireCheckpoint(s.enemiesResolved <= s.enemiesSpawned && s.enemiesSpawned <= rules.enemyCount)
  requireCheckpoint(s.budgetSpent <= rules.spawnBudget && s.reservedBudget <= s.budgetSpent)
  requireCheckpoint(s.enemiesSpawned + s.pendingSpawns.length <= rules.enemyCount)
  requireCheckpoint(s.units.length + s.pendingSpawns.length <= CONFIG.maxUnits)
  requireCheckpoint(s.sandbagStock + s.sandbags.length <= s.stage)
  requireCheckpoint(
    s.decisionTime <= s.time + epsilon && runtime.planDefenders <= (paidRoster ? ALLY_TYPES.length : s.stage)
  )
  requireCheckpoint(runtime.lastDeploymentAt === null || runtime.lastDeploymentAt <= s.time + epsilon)
  requireCheckpoint(runtime.decisionRevision >= runtime.deploymentSequence)
  requireCheckpoint(unique(s.units.map((unit) => unit.id)) && unique(s.sandbags.map((bag) => bag.id)))
  requireCheckpoint(
    unique([...s.units.map((unit) => unit.id), ...reserves.map((unit) => unit.id), ...s.sandbags.map((bag) => bag.id)])
  )
  requireCheckpoint(defenders.length <= (paidRoster ? ALLY_TYPES.length : s.stage))
  requireCheckpoint(s.units.filter((unit) => unit.owner === 'ai').length === s.enemiesSpawned - s.enemiesResolved)
  if (s.phase === 'preparation')
    requireCheckpoint(
      s.time === 0 &&
        s.enemiesSpawned === 0 &&
        s.enemiesResolved === 0 &&
        s.budgetSpent === 0 &&
        s.attacks.length === 0 &&
        s.pendingSpawns.length === 0 &&
        s.playerBaseHp === CONFIG.baseHp
    )
  if (s.phase !== 'assault') requireCheckpoint(s.pendingSpawns.length === 0)
  if (won)
    requireCheckpoint(
      s.enemiesResolved === rules.enemyCount &&
        !s.attacks.some((attack) => attack.owner === 'ai' && attack.projectile && attack.status === 'released')
    )
  requireCheckpoint(
    s.stageSummary.stage === s.stage &&
      s.stageSummary.spawned === s.enemiesSpawned &&
      s.stageSummary.resolved === s.enemiesResolved
  )
  requireCheckpoint(near(s.stageSummary.baseDamage, CONFIG.baseHp - s.playerBaseHp))
  validateSummary(s.stageSummary)
  if (s.previousStageSummary) {
    validateSummary(s.previousStageSummary)
    requireCheckpoint(s.previousStageSummary.stage === s.stage - 1)
    requireCheckpoint(s.previousStageSummary.resolved === stageRules(s.stage - 1).enemyCount)
  } else requireCheckpoint(s.stage === 1)
  for (const action of [s.lastAction, s.requestedAction]) if (action) requireCheckpoint(validAction(action, checkpoint))
  validateCommanderSupport(checkpoint)
  validateFortifications(checkpoint)
  validateUnits(checkpoint)
  validateAttacks(checkpoint)
  validateReservations(checkpoint)
  validateHistory(checkpoint)
  validateRuntime(checkpoint)
  validateInterception(checkpoint)
}

function migrateLegacyCheckpoint(checkpoint: LegacyCampaignCheckpoint): VersionTwoCampaignCheckpoint {
  const s = checkpoint.state
  for (const unit of s.units) {
    const stats = preBalanceCheckpointCombatStats(
      unit,
      s.stage,
      unit.owner === 'player' ? checkpoint.progress.unitLevels[unit.type as AllyType] : 1
    )
    const previousHp = unit.hp
    unit.hp = Math.min(stats.maxHp, unit.hp * (stats.maxHp / unit.maxHp))
    requireCheckpoint(previousHp === 0 || unit.hp > 0)
    unit.maxHp = stats.maxHp
    unit.attack = stats.attack
    unit.attackRange = stats.range
  }
  for (const attack of s.attacks) {
    const stats = preBalanceCheckpointCombatStats(
      { ...attack, boss: !!attack.boss },
      s.stage,
      attack.owner === 'player' ? checkpoint.progress.unitLevels[attack.type as AllyType] : 1
    )
    if (attack.breath?.shape) {
      const ratio = stats.range / attack.range
      attack.breath.shape.length *= ratio
      attack.breath.shape.endHalfWidth *= ratio
    }
    attack.power = stats.attack
    attack.range = stats.range
  }
  if (s.stage === 1) {
    for (const type of ENEMY_TYPES) {
      const pending = s.pendingSpawns.find((member) => member.unitType === type)
      s.cooldowns[type] = pending
        ? pending.spawnAt - s.time + deploymentCooldown(type, s.stage)
        : s.cooldowns[type] * 1.5
    }
    for (const member of s.pendingSpawns)
      if (member.previousCooldownUntil > s.time)
        member.previousCooldownUntil = s.time + (member.previousCooldownUntil - s.time) * 1.5
  }
  checkpoint.runtime.interception = new DefenderInterception().snapshot()
  return {
    ...checkpoint,
    version: 2,
    state: { ...s, waveBossPolicy: s.phase === 'preparation' ? 2 : 1 }
  }
}

function supportEventBoss(checkpoint: DecodedCheckpoint, event: SupportEvent): boolean {
  const deployment = checked(
      checkpoint.history.deployments.find((deployment) =>
        deployment.members.some((member) => member.id === event.target.id)
      ) ?? null
    ),
    action = checked(actionFromKey(deployment.summary.actionKey, checkpoint.version)),
    member = checked(
      checkpointMembers(checkpoint, action).find((member) => member.unitType === event.target.type) ?? null
    )
  return member.boss
}

function migrateBossAndMeleeBalance(checkpoint: DecodedCheckpoint): void {
  const s = checkpoint.state
  for (const type of ['frost', 'ranger'] as const)
    if (s.stage >= LEGACY_ALLY_UNLOCK_STAGES[type] && !checkpoint.profile.purchased.includes(type))
      checkpoint.profile.purchased.push(type)
  checkpoint.profile = checked(parseProfile(checkpoint.profile))
  for (const unit of [...s.units, ...(s.reserveUnits ?? [])]) {
    if (unit.owner === 'ai' && unit.boss) {
      unit.maxHp /= 3
      unit.hp = Math.max(Number.MIN_VALUE, unit.hp / 3)
    }
    if (unit.owner === 'player') unit.attackRange = unit.type === 'paladin' ? 46 : DEFINITIONS[unit.type].range
  }
  for (const attack of s.attacks)
    if (attack.owner === 'player') attack.range = attack.type === 'paladin' ? 46 : DEFINITIONS[attack.type].range
  for (const event of s.commanderSupport?.history ?? []) {
    if (event.outcome !== 'applied' || event.action.effect !== 'heal' || !supportEventBoss(checkpoint, event)) continue
    const maxHp = combatStats({ owner: 'ai', type: event.target.type, boss: true }, s.stage).maxHp
    if (event.amount > Math.min(maxHp * COMMANDER_SUPPORT.healFraction, COMMANDER_SUPPORT.maximumHeal) + epsilon)
      event.legacyBossHeal = true
  }
  checkpoint.runtime.interception = new DefenderInterception().snapshot()
  checkpoint.runtime.defenderDetours = []
  checkpoint.runtime.failedDefenderDetours = []
}

/** Validate the original save first; only then retire its accepted boss raid.
 * Keep historical action/plan keys and accepted attack clocks exactly as recorded.
 * A reserved boss keeps its paid road deployment but never starts a new raid.
 */
function migrateBossFlightReturn(checkpoint: DecodedCheckpoint): void {
  let changed = false
  for (const unit of checkpoint.state.units)
    if (unit.owner === 'ai' && unit.boss && unit.flight) {
      unit.flight.phase = 'return'
      changed = true
    }
  for (const member of checkpoint.state.pendingSpawns)
    if (member.boss && member.targetId !== undefined) {
      delete member.targetId
      delete member.returnProgress
      changed = true
    }
  // Wraith acquisition changes too; old branched-world interception caches
  // must be rebuilt even when this save has no active boss raid.
  if (changed || battlefieldVersion(checkpoint) === 2) {
    checkpoint.runtime.interception = { context: '', lastTime: 0, intents: [], forecasts: [] }
    checkpoint.runtime.defenderDetours = []
    checkpoint.runtime.failedDefenderDetours = []
  }
}

function migrateEnemyCombatBalance(checkpoint: DecodedCheckpoint): void {
  for (const unit of checkpoint.state.units)
    if (unit.owner === 'ai' && !unit.boss) unit.attack = combatStats(unit, checkpoint.state.stage).attack
  for (const attack of checkpoint.state.attacks)
    if (attack.owner === 'ai') {
      attack.geometryScale = 1
      if (!attack.boss) attack.legacyRegularAttack = true
    }
  checkpoint.runtime.interception = new DefenderInterception().snapshot()
}

function migrateGenericWaitCheckpoint(checkpoint: VersionTwoCampaignCheckpoint): VersionThreeCampaignCheckpoint {
  const state = checkpoint.state
  return {
    ...checkpoint,
    version: 3,
    state: {
      ...state,
      strategy: state.strategy?.actionKey === 'wait' ? null : state.strategy,
      lastAction: state.lastAction?.type === 'wait' ? null : state.lastAction,
      requestedAction: state.requestedAction?.type === 'wait' ? null : state.requestedAction
    }
  }
}

function normalizeSandbagHealth(
  checkpoint:
    | VersionTwoCampaignCheckpoint
    | VersionThreeCampaignCheckpoint
    | VersionFourCampaignCheckpoint
    | VersionFiveCampaignCheckpoint
    | VersionSixCampaignCheckpoint
    | VersionSevenCampaignCheckpoint
    | VersionEightCampaignCheckpoint
    | VersionNineCampaignCheckpoint
    | VersionTenCampaignCheckpoint
    | VersionElevenCampaignCheckpoint
    | VersionTwelveCampaignCheckpoint
    | VersionThirteenCampaignCheckpoint
    | VersionFourteenCampaignCheckpoint
    | CampaignCheckpoint
): void {
  const bags = checkpoint.state.sandbags.filter((bag) => bag.maxHp !== ROAD_EFFECTS.sandbag.hp)
  for (const bag of bags) {
    bag.hp *= ROAD_EFFECTS.sandbag.hp / bag.maxHp
    bag.maxHp = ROAD_EFFECTS.sandbag.hp
    requireCheckpoint(bag.hp > 0)
  }
  if (bags.length) checkpoint.runtime.interception = new DefenderInterception().snapshot()
}

function checkpointValidationState(checkpoint: DecodedCheckpoint): GameState {
  return {
    ...checkpoint.state,
    battlefieldVersion: battlefieldVersion(checkpoint),
    layoutRevision: layoutRevision(checkpoint),
    waveBossPolicy: checkpoint.version === 1 ? 1 : checkpoint.state.waveBossPolicy,
    corpses: [],
    battleId: 0,
    commanderOrder: null,
    decisionTrace: null,
    tacticalHistory: null,
    decisionStatus: '',
    lastAction: null,
    requestedAction: null
  }
}

function supportBuffEvidence(
  checkpoint: DecodedCheckpoint,
  unitId: number,
  buff: Omit<SupportBuff, 'effect'>,
  effect: SupportBuff['effect']
): SupportEvent {
  const support = checkpoint.state.commanderSupport
  requireCheckpoint(checkpoint.version >= 7 && checkpoint.state.commanderSupportVersion === 1 && support)
  const event = support.history.find((candidate) => candidate.sequence === buff.sequence)
  requireCheckpoint(
    event && event.outcome === 'applied' && event.action.effect === effect && event.action.targetId === unitId
  )
  requireCheckpoint(
    near(buff.startedAt, event.resolvedAt) && near(buff.expiresAt, buff.startedAt + COMMANDER_SUPPORT.duration)
  )
  return event
}
function validateCommanderSupport(checkpoint: DecodedCheckpoint): void {
  const { state: s, runtime, progress } = checkpoint,
    support = s.commanderSupport,
    units = [...s.units, ...(s.reserveUnits ?? [])]
  requireCheckpoint(s.commanderSupportVersion === progress.commanderSupportVersion)
  if (s.commanderSupportVersion !== 1) {
    requireCheckpoint(
      !support && units.every((unit) => !unit.supportBuff) && s.attacks.every((attack) => !attack.supportAttack)
    )
    return
  }
  requireCheckpoint(checkpoint.version >= 7 && support)
  requireCheckpoint(support.retryAt <= s.time + COMMANDER_SUPPORT.retrySeconds + epsilon)
  const entries: SupportCast[] = [...support.history, ...(support.cast ? [support.cast] : [])]
  const firstSequence = support.sequence - entries.length + 1
  requireCheckpoint(
    support.history.length === Math.min(COMMANDER_SUPPORT.historyLimit, support.sequence - Number(!!support.cast))
  )
  for (const [index, entry] of entries.entries()) {
    requireCheckpoint(
      entry.sequence === firstSequence + index &&
        entry.id === `${s.stage}:support:${entry.sequence}` &&
        entry.stage === s.stage &&
        entry.fieldId === s.fieldId
    )
    requireCheckpoint(
      entry.target.id === entry.action.targetId &&
        entry.target.id <= runtime.id &&
        runtime.deploymentByUnit.some((mapping) => mapping.unitId === entry.target.id)
    )
    requireCheckpoint(
      entry.startedAt + epsilon >= COMMANDER_SUPPORT.firstReadyAt + (entry.sequence - 1) * COMMANDER_SUPPORT.cooldown &&
        entry.startedAt <= s.time + epsilon &&
        near(entry.applyAt, entry.startedAt + COMMANDER_SUPPORT.castSeconds)
    )
    const field = checkpointField(checkpoint)
    requireCheckpoint(
      entry.target.x >= 0 && entry.target.x <= field.width && entry.target.y >= 0 && entry.target.y <= field.height
    )
    if (index) requireCheckpoint(entry.startedAt + epsilon >= entries[index - 1].startedAt + COMMANDER_SUPPORT.cooldown)
    const deployment = checkpoint.history.deployments.find((deployment) =>
      deployment.members.some((member) => member.id === entry.target.id)
    )
    requireCheckpoint(
      deployment?.members.some(
        (member) =>
          member.id === entry.target.id &&
          member.type === entry.target.type &&
          member.spawnedAt <= entry.startedAt + epsilon &&
          (member.diedAt === null || member.diedAt + epsilon >= entry.startedAt)
      )
    )
    const target = s.units.find((unit) => unit.id === entry.target.id)
    if (target) requireCheckpoint(target.owner === 'ai' && target.type === entry.target.type)
  }
  requireCheckpoint(
    near(
      support.nextReadyAt,
      entries.length ? entries.at(-1)!.startedAt + COMMANDER_SUPPORT.cooldown : COMMANDER_SUPPORT.firstReadyAt
    )
  )
  if (support.cast)
    requireCheckpoint(s.phase === 'assault' && support.cast.applyAt + epsilon >= s.time && support.status === 'casting')
  else requireCheckpoint(support.status !== 'casting')
  for (const event of support.history) {
    requireCheckpoint(event.resolvedAt <= s.time + epsilon && event.resolvedAt + epsilon >= event.startedAt)
    if (event.outcome === 'cancelled') requireCheckpoint(event.resolvedAt <= event.applyAt + epsilon)
    else
      requireCheckpoint(
        event.resolvedAt + epsilon >= event.applyAt && event.resolvedAt <= event.applyAt + CONFIG.step + epsilon
      )
    if (event.legacyBossHeal)
      requireCheckpoint(checkpoint.version >= 8 && event.outcome === 'applied' && event.action.effect === 'heal')
    if (event.outcome !== 'applied') requireCheckpoint(event.amount === 0)
    else if (event.action.effect === 'heal') {
      const boss = supportEventBoss(checkpoint, event),
        target = { owner: 'ai' as const, type: event.target.type, boss },
        maxHp = checkpointStats(checkpoint, target).maxHp,
        currentLimit = Math.min(maxHp * COMMANDER_SUPPORT.healFraction, COMMANDER_SUPPORT.maximumHeal)
      if (event.legacyBossHeal) {
        const legacyMaxHp = preBalanceCheckpointCombatStats(target, s.stage).maxHp
        requireCheckpoint(
          boss &&
            event.amount > currentLimit + epsilon &&
            event.amount <=
              Math.min(legacyMaxHp * COMMANDER_SUPPORT.healFraction, COMMANDER_SUPPORT.maximumHeal) + epsilon
        )
      } else requireCheckpoint(event.amount > 0 && event.amount <= currentLimit + epsilon)
    } else if (event.action.effect === 'armor')
      requireCheckpoint(
        near(
          event.amount,
          Math.min(
            COMMANDER_SUPPORT.maximumArmor,
            DEFINITIONS[event.target.type].armor + COMMANDER_SUPPORT.armorBonus
          ) - DEFINITIONS[event.target.type].armor
        )
      )
    else requireCheckpoint(near(event.amount, 0.15))
  }
  for (const event of support.history) {
    if (event.outcome !== 'applied' || event.action.effect === 'heal') continue
    const target = s.units.find((unit) => unit.id === event.action.targetId && unit.hp > 0)
    if (target && s.time + 1e-9 < event.resolvedAt + COMMANDER_SUPPORT.duration)
      requireCheckpoint(
        target.supportBuff?.sequence === event.sequence && target.supportBuff.effect === event.action.effect
      )
    if (event.action.effect === 'attack')
      for (const attack of s.attacks)
        if (
          attack.attackerId === event.action.targetId &&
          attack.startedAt >= event.resolvedAt &&
          attack.startedAt + 1e-9 < event.resolvedAt + COMMANDER_SUPPORT.duration
        )
          requireCheckpoint(attack.supportAttack?.sequence === event.sequence)
  }
  for (const unit of units)
    if (unit.supportBuff) {
      requireCheckpoint(
        unit.owner === 'ai' &&
          unit.hp > 0 &&
          unit.supportBuff.startedAt <= s.time + epsilon &&
          unit.supportBuff.expiresAt > s.time - epsilon
      )
      supportBuffEvidence(checkpoint, unit.id, unit.supportBuff, unit.supportBuff.effect)
    }
  for (const attack of s.attacks)
    if (attack.supportAttack) {
      requireCheckpoint(
        attack.owner === 'ai' &&
          attack.startedAt + epsilon >= attack.supportAttack.startedAt &&
          attack.startedAt < attack.supportAttack.expiresAt
      )
      supportBuffEvidence(checkpoint, attack.attackerId, attack.supportAttack, 'attack')
    }
  if (s.phase === 'preparation')
    requireCheckpoint(support.sequence === 0 && !support.cast && support.history.length === 0)
}

function validateFortifications(checkpoint: DecodedCheckpoint): void {
  const { state: s, runtime } = checkpoint,
    fortifications = s.fortifications
  if (!fortifications) return
  const { items, gate, fortificationSpend, gearSpend } = fortifications,
    retained = [...s.units.filter((unit) => unit.owner === 'player'), ...(s.reserveUnits ?? [])],
    equipped = retained.filter((unit) => unit.equipment !== undefined).length,
    gateSpend =
      FORTIFICATIONS.cannon.costs.slice(0, gate.cannonLevel).reduce((sum: number, cost) => sum + cost, 0) +
      FORTIFICATIONS.armor.costs.slice(0, gate.armorLevel).reduce((sum: number, cost) => sum + cost, 0),
    liveItemSpend = items.reduce((sum, item) => sum + FORTIFICATIONS[item.kind].cost, 0),
    field = checkpointField(checkpoint),
    validationState = { ...checkpointValidationState(checkpoint), phase: 'preparation' as const }
  requireCheckpoint(
    gearSpend % FORTIFICATIONS.equipmentCost === 0 && gearSpend >= equipped * FORTIFICATIONS.equipmentCost
  )
  const consumedSpend = fortificationSpend - gateSpend - liveItemSpend
  requireCheckpoint(consumedSpend >= 0 && consumedSpend % 10 === 0 && consumedSpend !== 10)
  requireCheckpoint(
    unique([
      ...s.units.map((unit) => unit.id),
      ...(s.reserveUnits ?? []).map((unit) => unit.id),
      ...s.sandbags.map((bag) => bag.id),
      ...items.map((item) => item.id)
    ])
  )
  for (const item of items) {
    requireCheckpoint(
      item.id <= runtime.id &&
        !runtime.deploymentByUnit.some((entry) => entry.unitId === item.id) &&
        !s.corpses.some((corpse) => corpse.id === item.id)
    )
    const anchor = pointAtRoadAnchor(field, item),
      progress = field.routes
        .map((route) => edgeOffsetToRouteProgress(field, route.id, item))
        .filter((value): value is number => value !== null)
    requireCheckpoint(
      anchor && near(item.x, anchor.x) && near(item.y, anchor.y) && progress.some((value) => near(item.progress, value))
    )
    requireCheckpoint(previewRoadItemPlacement(validationState, item.kind, item, item.id).valid)
    if (item.kind === 'mud') {
      requireCheckpoint(unique(item.insideIds))
      for (const unitId of item.insideIds) {
        const unit = s.units.find((candidate) => candidate.id === unitId)
        requireCheckpoint(
          unit &&
            unit.owner === 'ai' &&
            unit.hp > 0 &&
            !isAirborneEnemy(unit.type) &&
            Math.hypot(unit.x - item.x, unit.y - item.y) <= FORTIFICATIONS.mud.radius + epsilon
        )
      }
    }
  }
  requireCheckpoint(unique(gate.shots.map((shot) => shot.id)) && unique(gate.shots.map((shot) => shot.sequence)))
  requireCheckpoint(gate.sequence <= Math.floor((s.time + epsilon) / FORTIFICATIONS.cannon.interval) + 1)
  if (!gate.cannonLevel) requireCheckpoint(gate.cooldown === 0 && gate.sequence === 0 && gate.shots.length === 0)
  if (s.phase === 'preparation') requireCheckpoint(gate.sequence === 0 && gate.shots.length === 0)
  const latestShot = gate.shots.at(-1)
  if (latestShot)
    requireCheckpoint(
      latestShot.sequence === gate.sequence &&
        near(gate.cooldown, Math.max(0, latestShot.startedAt + FORTIFICATIONS.cannon.interval - s.time))
    )
  for (let index = 1; index < gate.shots.length; index++)
    requireCheckpoint(
      gate.shots[index].sequence > gate.shots[index - 1].sequence &&
        gate.shots[index].startedAt - gate.shots[index - 1].startedAt >= FORTIFICATIONS.cannon.interval - epsilon
    )
  const muzzle = gateMuzzle(validationState)
  for (const shot of gate.shots) {
    const target = s.units.find((unit) => unit.id === shot.targetId)
    requireCheckpoint(
      shot.sequence <= gate.sequence && shot.id === `gate:${shot.sequence}` && shot.targetId <= runtime.id
    )
    requireCheckpoint(
      runtime.deploymentByUnit.some((entry) => entry.unitId === shot.targetId) && (!target || target.owner === 'ai')
    )
    requireCheckpoint(near(shot.origin.x, muzzle.x) && near(shot.origin.y, muzzle.y))
    requireCheckpoint(
      shot.target.x >= 0 && shot.target.x <= field.width && shot.target.y >= 0 && shot.target.y <= field.height
    )
    requireCheckpoint(
      near(shot.releaseAt, shot.startedAt + FORTIFICATIONS.cannon.windup) &&
        near(shot.impactAt, shot.releaseAt + FORTIFICATIONS.cannon.flight)
    )
    requireCheckpoint(shot.startedAt <= s.time + epsilon && s.time <= shot.impactAt + 0.15 + epsilon)
    if (shot.status === 'windup') requireCheckpoint(shot.power === 0 && shot.releaseAt >= s.time - epsilon)
    else if (shot.status === 'cancelled')
      requireCheckpoint(
        shot.power === 0 &&
          (shot.releaseAt <= s.time + epsilon || s.phase === 'defeat' || s.phase === 'cleared' || s.phase === 'victory')
      )
    else
      requireCheckpoint(
        shot.power === FORTIFICATIONS.cannon.damage[gate.cannonLevel - 1] && shot.releaseAt <= s.time + epsilon
      )
    if (shot.status === 'released') requireCheckpoint(shot.impactAt >= s.time - epsilon)
    if (shot.status === 'hit' || shot.status === 'missed') requireCheckpoint(shot.impactAt <= s.time + epsilon)
  }
}

function validateBattleRelocation(checkpoint: DecodedCheckpoint, unit: Unit, reserved: boolean): void {
  const relocation = unit.battleRelocation,
    state = checkpoint.state,
    player = unit.owner === 'player'
  if (checkpoint.version < 11 || !player || reserved || state.phase === 'preparation') {
    requireCheckpoint(relocation === undefined)
    return
  }
  requireCheckpoint(relocation !== undefined)
  const anchor = relocation.anchor,
    leash = DEFINITIONS[unit.type].leash,
    placementState = { ...checkpointValidationState(checkpoint), phase: 'preparation' as const }
  requireCheckpoint(previewGroundPlacement({ ...placementState, units: [] }, unit.type as AllyType, anchor).valid)
  requireCheckpoint(Math.hypot(unit.homeX - anchor.x, unit.homeY - anchor.y) <= leash + epsilon)
  if (relocation.usedStage === undefined) {
    requireCheckpoint(relocation.destination === undefined && relocation.waypoints === undefined)
    requireCheckpoint(near(unit.homeX, anchor.x) && near(unit.homeY, anchor.y))
    return
  }
  requireCheckpoint(relocation.usedStage === state.stage && leash > 0)
  if (!relocation.destination) {
    requireCheckpoint(relocation.waypoints === undefined)
    return
  }
  requireCheckpoint(near(unit.homeX, anchor.x) && near(unit.homeY, anchor.y))
  requireCheckpoint(relocation.destination.x !== unit.x || relocation.destination.y !== unit.y)
  requireCheckpoint(relocation.waypoints !== undefined && relocation.waypoints.length > 0)
  requireCheckpoint(
    previewGroundPlacement(placementState, unit.type as AllyType, relocation.destination, unit.slotId).valid
  )
  requireCheckpoint(Math.hypot(relocation.destination.x - anchor.x, relocation.destination.y - anchor.y) >= 0.001)
  const last = relocation.waypoints.at(-1)!
  requireCheckpoint(near(last.x, relocation.destination.x) && near(last.y, relocation.destination.y))
  let previous: Point = unit
  for (const point of relocation.waypoints) {
    requireCheckpoint(Math.hypot(point.x - anchor.x, point.y - anchor.y) <= leash + epsilon)
    requireCheckpoint(clearInterceptionStep(state, previous, point))
    previous = point
  }
}

function validateUnits(checkpoint: DecodedCheckpoint): void {
  const { state: s, runtime, progress, profile } = checkpoint,
    field = checkpointField(checkpoint),
    paidRoster = progress.economyVersion === 2,
    reserves = s.reserveUnits ?? []
  requireCheckpoint(unique(s.units.filter((unit) => unit.owner === 'player').map((unit) => unit.slotId!)))
  const placementState = { ...checkpointValidationState(checkpoint), phase: 'preparation' as const }
  for (const unit of [...s.units, ...reserves]) {
    const reserved = reserves.includes(unit)
    requireCheckpoint(
      unit.equipment === undefined || (checkpoint.version >= 6 && paidRoster && unit.owner === 'player')
    )
    if (unit.mudSlowUntil !== undefined)
      requireCheckpoint(
        checkpoint.version >= 6 &&
          paidRoster &&
          unit.owner === 'ai' &&
          !isAirborneEnemy(unit.type) &&
          unit.mudSlowUntil <= s.time + FORTIFICATIONS.mud.duration + epsilon
      )
    requireCheckpoint(unit.id <= runtime.id && validRole(unit.owner, unit.type) && unit.hp <= unit.maxHp)
    validateBattleRelocation(checkpoint, unit, reserved)
    const healingRole = checkpointHealingRole(unit)
    if (checkpoint.version >= 12 && healingRole && !(healingRole === 'paladin' && unit.healCooldown === undefined))
      requireCheckpoint(unit.healCooldown !== undefined && unit.healCooldown <= independentHealInterval(healingRole))
    else requireCheckpoint(unit.healCooldown === undefined)
    const acceptedHeal = s.attacks.find((attack) => attack.attackerId === unit.id && attack.kind === 'heal')
    if (acceptedHeal && healingRole)
      requireCheckpoint(
        near(unit.healCooldown!, Math.max(0, acceptedHeal.startedAt + independentHealInterval(healingRole) - s.time))
      )
    const player = unit.owner === 'player',
      definition = DEFINITIONS[unit.type],
      stats = checkpointStats(checkpoint, unit)
    if (paidRoster && player) {
      requireCheckpoint(unit.level !== undefined && unit.hasFought !== undefined && unit.redeployAnchor !== undefined)
      const anchor = unit.redeployAnchor
      requireCheckpoint(
        anchor.x >= 48 &&
          anchor.x <= field.width - 48 &&
          anchor.y >= 94 &&
          anchor.y <= field.height - DEFENDER_FOOTPRINT
      )
      if (unit.hasFought)
        requireCheckpoint(
          Math.hypot(
            (unit.battleRelocation?.anchor.x ?? unit.homeX) - anchor.x,
            (unit.battleRelocation?.anchor.y ?? unit.homeY) - anchor.y
          ) <=
            REDEPLOY_RADIUS[unit.type as AllyType] + epsilon
        )
      if (!reserved && s.phase !== 'preparation') requireCheckpoint(unit.hasFought)
    } else
      requireCheckpoint(unit.level === undefined && unit.hasFought === undefined && unit.redeployAnchor === undefined)
    if (reserved)
      requireCheckpoint(
        player &&
          unit.hp > 0 &&
          unit.slotId === undefined &&
          near(unit.x, unit.homeX) &&
          near(unit.y, unit.homeY) &&
          !unit.moving
      )
    requireCheckpoint(near(unit.maxHp, stats.maxHp) && near(unit.attack, stats.attack))
    requireCheckpoint(
      near(
        unit.speed,
        player ? (unit.type === 'tank' ? TANK_GUARD.moveSpeed : 52) : definition.speed * (unit.boss ? 0.8 : 1)
      )
    )
    if (unit.returnHomeAt !== undefined) {
      requireCheckpoint((player && unit.type === 'tank') || unit.returnHomeAt === 0)
      requireCheckpoint(
        unit.returnHomeAt <= s.time + ATTACK_PROFILES.tank.durationMs / 1000 + TANK_GUARD.returnDelay + epsilon
      )
    }
    requireCheckpoint(near(unit.attackRange, stats.range) && near(unit.attackSpeed, definition.attackSpeed))
    requireCheckpoint(unit.attackStartedAt <= s.time + epsilon && unit.slowUntil <= s.time + 1.6 + epsilon)
    requireCheckpoint(
      unit.attackCooldown <=
        combatAttackInterval(
          unit,
          unit.type === 'dragon' ? BREATH_TIMING.durationMs : ATTACK_PROFILES[unit.type].durationMs
        ) +
          epsilon
    )
    requireCheckpoint(unit.slowFactor === 1 || unit.slowFactor === DEFINITIONS.frost.slow)
    if (player) {
      requireCheckpoint(
        !unit.boss &&
          (reserved ? unit.slotId === undefined : unit.slotId !== undefined) &&
          unit.progress === 0 &&
          unit.routeId === undefined &&
          unit.flight === undefined &&
          unit.gateExit === undefined
      )
      requireCheckpoint(
        checkpoint.version < 8
          ? legacyCheckpointAllyAvailable(unit.type as AllyType, s.stage, profile.purchased)
          : definition.purchaseCost === 0 || profile.purchased.includes(unit.type as AllyType)
      )
      requireCheckpoint(
        unit.homeX >= 48 &&
          unit.homeX <= field.width - 48 &&
          unit.homeY >= 94 &&
          unit.homeY <= field.height - DEFENDER_FOOTPRINT
      )
      requireCheckpoint(Math.hypot(unit.x - unit.homeX, unit.y - unit.homeY) <= definition.leash + epsilon)
      if (!reserved)
        requireCheckpoint(
          previewGroundPlacement(placementState, unit.type as AllyType, { x: unit.homeX, y: unit.homeY }, unit.slotId)
            .valid
        )
    } else {
      requireCheckpoint(
        unit.hp > 0 && unit.slotId === undefined && validEnemy(unit.type as EnemyType, unit.boss, checkpoint)
      )
      const route = routeFor(field, unit.routeId),
        position = pointOnPath(route.path, unit.progress)
      requireCheckpoint(battlefieldVersion(checkpoint) === 2 ? unit.routeId !== undefined : unit.routeId === undefined)
      requireCheckpoint(unit.progress <= route.length)
      if (unit.flight) {
        requireCheckpoint(battlefieldVersion(checkpoint) === 2 && isAirborneEnemy(unit.type))
        requireCheckpoint(checkpoint.version < 10 || !unit.boss || unit.flight.phase === 'return')
        requireCheckpoint(unit.flight.targetId <= runtime.id && unit.flight.targetId !== unit.id)
        requireCheckpoint(unit.flight.returnProgress <= route.length)
        const target = s.units.find((candidate) => candidate.id === unit.flight!.targetId)
        requireCheckpoint(!target || (target.owner === 'player' && RANGED_ALLY_TYPES.includes(target.type as AllyType)))
        requireCheckpoint(unit.x >= 0 && unit.x <= field.width && unit.y >= 0 && unit.y <= field.height)
      } else requireCheckpoint(near(unit.x, position.x) && near(unit.y, position.y))
      requireCheckpoint(near(unit.homeX, field.entrance.x) && near(unit.homeY, field.entrance.y))
      if (unit.gateExit) {
        const attack = s.attacks.find((candidate) => candidate.id === unit.gateExit!.attackId)
        requireCheckpoint(battlefieldVersion(checkpoint) === 2 && !unit.boss)
        requireCheckpoint(attack && attack.attackerId === unit.id && attack.base && attack.damageHit)
        requireCheckpoint(near(unit.gateExit.exitAt, Math.max(attack.endsAt, attack.impactAt)))
        requireCheckpoint(unit.gateExit.exitAt >= s.time - epsilon)
      }
    }
  }
  for (const bag of s.sandbags) {
    requireCheckpoint(bag.id <= runtime.id && bag.hp > 0 && bag.hp <= bag.maxHp)
    if (battlefieldVersion(checkpoint) === 1) {
      requireCheckpoint(bag.edgeId === undefined && bag.offset === undefined)
      const position = pointOnPath(field.path, bag.progress)
      requireCheckpoint(near(bag.x, position.x) && near(bag.y, position.y))
      requireCheckpoint(
        bag.progress >= ROAD_EFFECTS.sandbag.entryClearance &&
          bag.progress <= pathLength(field.path) - ROAD_EFFECTS.sandbag.coreClearance
      )
    } else {
      requireCheckpoint(bag.edgeId !== undefined && bag.offset !== undefined)
      const position = pointAtRoadAnchor(field, { edgeId: bag.edgeId, offset: bag.offset })
      requireCheckpoint(position && near(bag.x, position.x) && near(bag.y, position.y))
      const progress = field.routes
        .map((route) => edgeOffsetToRouteProgress(field, route.id, { edgeId: bag.edgeId!, offset: bag.offset! }))
        .filter((value): value is number => value !== null)
      requireCheckpoint(progress.some((value) => near(bag.progress, value)))
      for (const route of field.routes) {
        const projection = physicalProjectionOnRoute(field, route.id, bag)
        if (projection.distance <= epsilon)
          requireCheckpoint(
            projection.progress >= ROAD_EFFECTS.sandbag.entryClearance &&
              projection.progress <= route.length - ROAD_EFFECTS.sandbag.coreClearance
          )
      }
    }
    requireCheckpoint(
      Math.hypot(bag.x - field.gate.x, bag.y - field.gate.y) >= ROAD_EFFECTS.sandbag.coreClearance - epsilon
    )
  }
  for (let index = 0; index < s.sandbags.length; index++)
    for (const other of s.sandbags.slice(index + 1)) {
      const bag = s.sandbags[index]
      requireCheckpoint(Math.hypot(bag.x - other.x, bag.y - other.y) >= ROAD_EFFECTS.sandbag.minimumSpacing - epsilon)
      for (const route of field.routes) {
        const left = physicalProjectionOnRoute(field, route.id, bag),
          right = physicalProjectionOnRoute(field, route.id, other)
        if (left.distance <= epsilon && right.distance <= epsilon)
          requireCheckpoint(Math.abs(left.progress - right.progress) >= ROAD_EFFECTS.sandbag.minimumSpacing - epsilon)
      }
    }
  requireCheckpoint(unique(s.corpses.map((corpse) => corpse.id)))
  for (const corpse of s.corpses) {
    requireCheckpoint(
      corpse.id <= runtime.id &&
        validRole(corpse.owner, corpse.type) &&
        corpse.diedAt <= s.time + epsilon &&
        corpse.stage === s.stage &&
        corpse.fieldId === s.fieldId
    )
    requireCheckpoint(
      !s.sandbags.some((bag) => bag.id === corpse.id) && !reserves.some((unit) => unit.id === corpse.id)
    )
    const living = s.units.find((unit) => unit.id === corpse.id)
    if (paidRoster && corpse.owner === 'player') requireCheckpoint(living?.owner === 'player')
    requireCheckpoint(!living || (living.owner === 'player' && living.hp === 0 && living.type === corpse.type))
    requireCheckpoint(
      corpse.owner === 'ai' ? validEnemy(corpse.type as EnemyType, corpse.boss, checkpoint) : !corpse.boss
    )
  }
}

function validateAttacks(checkpoint: DecodedCheckpoint): void {
  const { state: s, runtime } = checkpoint
  requireCheckpoint(unique(s.attacks.map((attack) => attack.id)))
  for (const attack of s.attacks) {
    requireCheckpoint(
      battlefieldVersion(checkpoint) === 2
        ? attack.battlefieldVersion === 2
        : attack.battlefieldVersion === undefined || attack.battlefieldVersion === 1
    )
    requireCheckpoint(
      validRole(attack.owner, attack.type) &&
        attack.attackerId <= runtime.id &&
        attack.id === `${attack.attackerId}:${attack.sequence}`
    )
    requireCheckpoint(
      attack.owner === 'player' ? !attack.boss : validEnemy(attack.type as EnemyType, !!attack.boss, checkpoint)
    )
    requireCheckpoint(
      attack.damageType === undefined || (attack.kind !== 'heal' && attack.damageType === attackDamageType(attack.type))
    )
    const attacker = s.units.find((unit) => unit.id === attack.attackerId)
    if (s.economyVersion === 2 && attack.owner === 'player') requireCheckpoint(attacker)
    if (checkpoint.version >= 9) {
      requireCheckpoint(attack.owner === 'ai' ? attack.geometryScale !== undefined : attack.geometryScale === undefined)
      if (attack.owner === 'ai' && !attack.boss)
        requireCheckpoint(!!attack.legacyRegularAttack === (attack.geometryScale === 1))
    }
    requireCheckpoint(!attack.legacyRegularAttack || (checkpoint.version >= 9 && attack.owner === 'ai' && !attack.boss))
    const stats = checkpointStats(
      checkpoint,
      {
        ...attack,
        boss: !!attack.boss,
        level: attacker?.level,
        equipment: attacker?.equipment
      },
      attack.legacyRegularAttack ? 8 : checkpoint.version
    )
    requireCheckpoint(
      attack.timeScale === undefined || (checkpoint.version >= 15 && attack.owner === 'ai' && attack.kind === 'attack')
    )
    requireCheckpoint(
      !attack.legacyPaladinRange ||
        (checkpoint.version >= 15 &&
          attack.owner === 'player' &&
          attack.type === 'paladin' &&
          attack.kind !== 'heal' &&
          near(attack.range, 46))
    )
    const expectedRange = attack.legacyPaladinRange
      ? 46
      : attack.kind === 'heal'
        ? HEALING_ACTIONS[checkpointHealingRole(attack)!]?.range
        : stats.range
    const powerMultiplier = attack.supportAttack ? COMMANDER_SUPPORT.attackMultiplier : 1,
      healAction = attack.kind === 'heal'
    if (attack.kind === 'attack')
      requireCheckpoint(
        attack.type !== 'healer' &&
          attack.healing === undefined &&
          (attack.targetId !== undefined || attack.barrierId !== undefined || attack.base)
      )
    if (healAction)
      requireCheckpoint(
        checkpointHealingRole(attack) !== undefined &&
          attack.healing !== undefined &&
          attack.targetId === undefined &&
          attack.barrierId === undefined &&
          !attack.base &&
          !attack.damageActive &&
          !attack.damageHit &&
          attack.power === 0 &&
          attack.variant === undefined &&
          attack.breath === undefined &&
          attack.supportAttack === undefined
      )
    requireCheckpoint(
      near(attack.power, healAction ? 0 : stats.attack * powerMultiplier) && near(attack.range, expectedRange)
    )
    const breath = attack.variant === 'breath',
      profile = healAction ? HEALING_ACTIONS[checkpointHealingRole(attack)!] : ATTACK_PROFILES[attack.type],
      duration = (breath ? BREATH_TIMING.durationMs : profile.durationMs) * attackTimeScale(attack),
      cue = (breath ? BREATH_TIMING.startMs : profile.cueMs) * attackTimeScale(attack),
      flight = breath ? 0 : profile.flightMs
    requireCheckpoint(
      breath === !!attack.breath && (!breath || (attack.type === 'dragon' && attack.sequence % 2 === 0))
    )
    requireCheckpoint(attack.projectile === (!breath && profile.cue === 'release'))
    requireCheckpoint(
      near(attack.releaseAt, attack.startedAt + cue / 1000) &&
        near(attack.impactAt, attack.releaseAt + flight / 1000) &&
        near(attack.endsAt, attack.startedAt + duration / 1000)
    )
    requireCheckpoint(
      attack.startedAt <= s.time + epsilon && s.time <= Math.max(attack.endsAt, attack.impactAt) + 0.15 + epsilon
    )
    if (attacker)
      requireCheckpoint(
        attacker.type === attack.type &&
          attacker.owner === attack.owner &&
          attack.sequence <= attacker.attackSequence &&
          near(
            attack.power,
            healAction
              ? 0
              : (attack.legacyRegularAttack
                  ? versionEightCheckpointCombatStats(attacker, s.stage).attack
                  : attacker.attack) * powerMultiplier
          ) &&
          near(
            attack.range,
            attack.legacyPaladinRange
              ? 46
              : healAction
                ? HEALING_ACTIONS[checkpointHealingRole(attack)!].range
                : attacker.attackRange
          )
      )
    if (attack.status === 'windup')
      requireCheckpoint(attack.releaseAt >= s.time - epsilon && !attack.damageHit && !attack.healing?.hit)
    if (!breath && attack.status === 'released')
      requireCheckpoint(
        attack.projectile && !attack.damageHit && !attack.healing?.hit && attack.impactAt >= s.time - epsilon
      )
    if (!breath && (attack.damageHit || attack.healing?.hit)) requireCheckpoint(attack.status === 'hit')
    if (attack.status === 'hit') requireCheckpoint(attack.damageHit || attack.healing?.hit)
    if (attack.status === 'missed') requireCheckpoint(!attack.damageHit && !attack.healing?.hit)
    if (attack.base)
      requireCheckpoint(attack.owner === 'ai' && attack.targetId === undefined && attack.barrierId === undefined)
    if (attack.barrierId !== undefined)
      requireCheckpoint(
        attack.owner === 'ai' && !attack.base && attack.targetId === undefined && attack.barrierId <= runtime.id
      )
    if (attack.targetId !== undefined) {
      requireCheckpoint(attack.targetId <= runtime.id && attack.targetId !== attack.attackerId)
      const target = s.units.find((unit) => unit.id === attack.targetId)
      requireCheckpoint(!target || target.owner !== attack.owner)
    }
    if (attack.healing) {
      requireCheckpoint(checkpointHealingRole(attack) !== undefined && attack.healing.targetId <= runtime.id)
      if (checkpoint.version >= 12) {
        const role = checkpointHealingRole(attack)!
        const amount = attack.healing.amount
        requireCheckpoint(amount !== undefined)
        if (!healAction) requireCheckpoint(near(amount, LEGACY_CHECKPOINT_HEAL_AMOUNT[role]))
        else if (attacker && attacker.hp > 0) requireCheckpoint(near(amount, healingAction(attacker)!.amount))
        else
          requireCheckpoint(
            near(amount, HEALING_ACTIONS[role].amount) || (role === 'healer' && near(amount, HEALER_WEAPON_HEAL_AMOUNT))
          )
      }
      const target = s.units.find((unit) => unit.id === attack.healing!.targetId)
      requireCheckpoint(!target || target.owner === 'player')
    }
    if (attack.breath) {
      const state = attack.breath
      if (state.lockedAim) requireCheckpoint(near(Math.hypot(state.lockedAim.x, state.lockedAim.y), 1))
      if (state.shape) {
        const expectedShape = breathGeometry(
          state.shape.origin,
          state.shape.direction,
          attack.range,
          undefined,
          attack.battlefieldVersion,
          attack.geometryScale ?? 1
        )
        requireCheckpoint(
          near(Math.hypot(state.shape.direction.x, state.shape.direction.y), 1) &&
            near(state.shape.length, expectedShape.length) &&
            near(state.shape.endHalfWidth, expectedShape.endHalfWidth)
        )
      }
      if (attack.status === 'windup') requireCheckpoint(state.nextTick === 0)
      requireCheckpoint(!attack.damageHit || state.nextTick > 0)
      if (state.nextTick > 0)
        requireCheckpoint(
          attack.startedAt +
            ((BREATH_TIMING.startMs +
              ((state.nextTick - 1) * (BREATH_TIMING.endMs - BREATH_TIMING.startMs)) / BREATH_TIMING.tickCount) *
              attackTimeScale(attack)) /
              1000 <=
            s.time + epsilon
        )
    }
  }
}

function validateReservations(checkpoint: DecodedCheckpoint): void {
  const { state: s, runtime } = checkpoint
  const hold = 'cooldownHold' in s ? s.cooldownHold : undefined
  if (hold) {
    requireCheckpoint(
      s.phase === 'assault' &&
        !s.result &&
        hold.stage === s.stage &&
        hold.fieldId === s.fieldId &&
        hold.startedAt <= s.time + epsilon
    )
    requireCheckpoint(s.pendingSpawns.length === 0 && s.reservedBudget === 0)
    requireCheckpoint(
      s.strategy && s.strategy.actionKey === actionKey(hold.action) && near(s.strategy.startedAt, hold.startedAt)
    )
    if (hold.phase === 'cooling')
      requireCheckpoint(
        ['executing', 'observing'].includes(s.strategy!.status) &&
          s.cooldowns[hold.action.unitType] > 0 &&
          near(s.strategy!.expiresAt, s.time + s.cooldowns[hold.action.unitType])
      )
    if (hold.phase === 'ready')
      requireCheckpoint(s.strategy!.status === 'completed' && s.cooldowns[hold.action.unitType] === 0)
    if (hold.phase === 'invalidated') requireCheckpoint(s.strategy!.status === 'interrupted')
  }
  requireCheckpoint(s.reservedBudget === s.pendingSpawns.reduce((sum, member) => sum + member.cost, 0))
  if (s.strategy) {
    const plan = s.strategy,
      action = checked(actionFromKey(plan.actionKey, checkpoint.version))
    requireCheckpoint(plan.id <= runtime.deploymentSequence && validAction(action, checkpoint))
    const lifetimes =
      checkpoint.version >= 3
        ? [action.type === 'wait' ? CONFIG.waitPlanLifetime : CONFIG.planLifetime]
        : action.type === 'wait'
          ? LEGACY_WAIT_LIFETIMES
          : [LEGACY_PLAN_LIFETIME]
    requireCheckpoint(
      plan.startedAt <= s.time + epsilon &&
        (lifetimes.some((lifetime) => near(plan.expiresAt, plan.startedAt + lifetime)) ||
          (checkpoint.version >= 14 &&
            hold &&
            action.type === 'wait' &&
            plan.expiresAt > plan.startedAt &&
            plan.expiresAt <= s.time + 14 + epsilon))
    )
    if (action.type === 'wait') requireCheckpoint(s.pendingSpawns.length === 0 && s.reservedBudget === 0)
    if (s.pendingSpawns.length) {
      requireCheckpoint(plan.status === 'executing')
      const members = checkpointMembers(checkpoint, action),
        suffix = members.slice(members.length - s.pendingSpawns.length)
      requireCheckpoint(suffix.length === s.pendingSpawns.length)
      s.pendingSpawns.forEach((member, index) => {
        const declared = suffix[index]
        if (battlefieldVersion(checkpoint) === 2) {
          requireCheckpoint(
            action.type !== 'wait' && member.routeId === (action as Exclude<AIAction, { type: 'wait' }>).routeId
          )
          // A historical plan retains the accepted request. Its still-reserved boss
          // is migrated to a road deployment without refunding or rewriting history.
          const targetId =
            checkpoint.version >= 10 && member.boss
              ? undefined
              : action.type === 'spawn' && 'targetId' in action
                ? action.targetId
                : undefined
          requireCheckpoint(
            member.targetId === targetId && (targetId === undefined) === (member.returnProgress === undefined)
          )
          if (member.returnProgress !== undefined)
            requireCheckpoint(member.returnProgress <= routeFor(checkpointField(checkpoint), member.routeId).length)
        } else
          requireCheckpoint(
            member.routeId === undefined && member.targetId === undefined && member.returnProgress === undefined
          )
        requireCheckpoint(
          member.deploymentId === plan.id && member.unitType === declared.unitType && member.boss === declared.boss
        )
        requireCheckpoint(near(member.spawnAt, plan.startedAt + declared.delay) && member.spawnAt >= s.time - epsilon)
        requireCheckpoint(member.cost === (member.boss ? 5 : DEFINITIONS[member.unitType].cost))
        requireCheckpoint(
          member.previousCooldownUntil <= member.spawnAt + checkpointBounds(checkpoint.version).cooldown
        )
        requireCheckpoint(
          near(
            s.cooldowns[member.unitType],
            member.spawnAt -
              s.time +
              (checkpoint.version === 1
                ? DEFINITIONS[member.unitType].cooldown
                : deploymentCooldown(member.unitType, s.stage))
          )
        )
      })
    }
  } else requireCheckpoint(s.pendingSpawns.length === 0)
  requireCheckpoint(unique(s.recentOutcomes.map((outcome) => outcome.id)))
  for (const outcome of s.recentOutcomes) {
    const action = checked(actionFromKey(outcome.actionKey, checkpoint.version)),
      members = checkpointMembers(checkpoint, action)
    validateSummary(outcome)
    requireCheckpoint(
      outcome.stage === s.stage &&
        outcome.id <= runtime.deploymentSequence &&
        members.length > 0 &&
        validAction(action, checkpoint)
    )
    requireCheckpoint(outcome.spawned + outcome.cancelled <= members.length)
  }
}

function validateDamageSource(
  checkpoint: DecodedCheckpoint,
  sourceId: number,
  sourceType: HistoryContribution['sourceType'] | undefined
): void {
  const fortifications = checkpoint.state.fortifications
  if (sourceType === 'gate') {
    requireCheckpoint(
      checkpoint.version >= 6 &&
        checkpoint.state.economyVersion === 2 &&
        sourceId === 0 &&
        fortifications &&
        fortifications.gate.cannonLevel > 0
    )
  } else {
    requireCheckpoint(sourceId > 0 && sourceId <= checkpoint.runtime.id)
    if (sourceType === 'spike')
      requireCheckpoint(
        checkpoint.version >= 6 &&
          checkpoint.state.economyVersion === 2 &&
          fortifications &&
          fortifications.fortificationSpend >= FORTIFICATIONS.spike.cost
      )
  }
}

function validateEnemyHistory(checkpoint: DecodedCheckpoint): void {
  const { history, state, runtime } = checkpoint
  requireCheckpoint(history.version === 2)
  requireCheckpoint((history.discardedContributions === 0) === (history.discardedDamage === 0))
  requireCheckpoint(
    history.legacyUnknown ||
      (!history.damage.some((value) => value.legacyUnknown) &&
        !history.enemyLedger.some((value) => value.legacyUnknown) &&
        !history.enemyOutcomes.some((value) => value.legacyUnknown))
  )
  const validateSource = (source: HistorySource) => {
    validateDamageSource(checkpoint, source.sourceId, source.sourceType)
    requireCheckpoint(source.sourceKind === sourceKind(source.sourceType))
    const existing =
      state.units.find((unit) => unit.id === source.sourceId) ??
      state.corpses.find((unit) => unit.id === source.sourceId)
    if (source.sourceKind === 'unit' && existing) requireCheckpoint(existing.type === source.sourceType)
  }
  for (const receipt of history.damage) {
    validateSource(receipt)
    const existing =
      state.units.find((unit) => unit.id === receipt.victimId) ??
      state.corpses.find((unit) => unit.id === receipt.victimId)
    if (existing && receipt.victimType !== null) requireCheckpoint(receipt.victimType === existing.type)
    requireCheckpoint(
      receipt.legacyUnknown || (receipt.victimType !== null && receipt.attackId !== null && receipt.attackId.length > 0)
    )
    if (receipt.attackId !== null) {
      const pattern =
        receipt.sourceKind === 'turret'
          ? /^gate:([1-9][0-9]*)$/
          : receipt.sourceKind === 'trap'
            ? new RegExp(`^spike:${receipt.sourceId}:([1-9][0-9]*):([1-9][0-9]*)$`)
            : new RegExp(`^${receipt.sourceId}:([1-9][0-9]*)$`)
      const match = pattern.exec(receipt.attackId)
      requireCheckpoint(
        match && match.slice(1).every((value) => Number.isSafeInteger(Number(value)) && Number(value) <= maximumId)
      )
      // An extant source bounds its accepted sequence. Dead/expired sources have
      // no reconstructible sequence, so retain their captured identity unchanged.
      if (receipt.sourceKind === 'turret') {
        requireCheckpoint(Number(match[1]) <= (state.fortifications?.gate.sequence ?? 0))
      } else {
        const actorId = receipt.sourceKind === 'trap' ? Number(match[1]) : receipt.sourceId
        const attackSequence = Number(match[receipt.sourceKind === 'trap' ? 2 : 1])
        if (receipt.sourceKind === 'trap') requireCheckpoint(actorId === receipt.victimId)
        const actor = [...state.units, ...(state.reserveUnits ?? [])].find((unit) => unit.id === actorId)
        if (actor) requireCheckpoint(attackSequence <= actor.attackSequence)
        const accepted = state.attacks.find((attack) => attack.id === `${actorId}:${attackSequence}`)
        if (accepted) {
          requireCheckpoint(accepted.attackerId === actorId && accepted.sequence === attackSequence)
          if (receipt.sourceKind === 'unit')
            requireCheckpoint(accepted.type === receipt.sourceType && accepted.kind !== 'heal')
        }
      }
    }
    requireCheckpoint(
      receipt.tick === null || (receipt.sourceType === 'dragon' && receipt.area && receipt.attackId !== null)
    )
    if (isEnemyHistoryType(receipt.victimType)) {
      const ledger = history.enemyLedger.find((value) => value.enemyId === receipt.victimId)
      requireCheckpoint(receipt.legacyUnknown || !!ledger)
      const outcome = history.enemyOutcomes.find((value) => value.enemyId === receipt.victimId)
      if (outcome)
        requireCheckpoint(receipt.onDefeatStep === (outcome.cause === 'combat-death' && near(receipt.at, outcome.at)))
      else requireCheckpoint(receipt.legacyUnknown || !receipt.onDefeatStep)
    }
  }
  requireCheckpoint(unique(history.enemyLedger.map((value) => value.enemyId)))
  for (const ledger of history.enemyLedger) {
    requireCheckpoint(ledger.enemyId <= runtime.id && unique(ledger.sources.map(sourceKey)))
    requireCheckpoint(
      near(
        ledger.totalDamage,
        ledger.sources.reduce((sum, source) => sum + source.damage, ledger.omittedDamage)
      )
    )
    requireCheckpoint((ledger.omittedContributions === 0) === (ledger.omittedDamage === 0))
    for (const source of ledger.sources) {
      validateSource(source)
      requireCheckpoint(
        source.damage > 0 && (source.sourceKind !== 'unit' || ALLY_TYPES.includes(source.sourceType as AllyType))
      )
      const retained = history.damage
        .filter((value) => value.victimId === ledger.enemyId && sourceKey(value) === sourceKey(source))
        .reduce((sum, value) => sum + value.damage, 0)
      requireCheckpoint(retained <= source.damage + epsilon)
      if (!ledger.legacyUnknown && history.discardedContributions === 0)
        requireCheckpoint(near(retained, source.damage))
    }
    for (const receipt of history.damage.filter((value) => value.victimId === ledger.enemyId)) {
      const total = ledger.sources.find((value) => sourceKey(value) === sourceKey(receipt))
      requireCheckpoint(total || ledger.omittedContributions > 0 || receipt.legacyUnknown)
    }
    const existing =
      state.units.find((unit) => unit.id === ledger.enemyId) ?? state.corpses.find((unit) => unit.id === ledger.enemyId)
    if (existing)
      requireCheckpoint(
        existing.type === ledger.enemyType &&
          existing.owner === 'ai' &&
          (ledger.legacyUnknown || existing.boss === ledger.boss)
      )
  }
  requireCheckpoint(
    unique(history.enemyOutcomes.map((value) => value.enemyId)) &&
      unique(history.enemyOutcomes.map((value) => value.id))
  )
  let previousTime = -1
  for (const outcome of history.enemyOutcomes) {
    requireCheckpoint(
      outcome.id === `enemy:${outcome.enemyId}:${outcome.cause}` &&
        outcome.enemyId <= runtime.id &&
        outcome.at <= state.time + epsilon &&
        outcome.at >= previousTime
    )
    previousTime = outcome.at
    const ledger = history.enemyLedger.find((value) => value.enemyId === outcome.enemyId)
    requireCheckpoint(outcome.legacyUnknown || (!!ledger && outcome.boss !== null && outcome.progress !== null))
    if (ledger)
      requireCheckpoint(
        ledger.enemyType === outcome.enemyType &&
          near(ledger.totalDamage, outcome.receivedDamage) &&
          (outcome.legacyUnknown || ledger.boss === outcome.boss)
      )
    if (ledger?.legacyUnknown) requireCheckpoint(outcome.legacyUnknown)
    const corpse = state.corpses.find((value) => value.id === outcome.enemyId)
    if (corpse)
      requireCheckpoint(
        corpse.owner === 'ai' &&
          corpse.type === outcome.enemyType &&
          corpse.boss === outcome.boss &&
          outcome.cause === 'combat-death' &&
          near(corpse.diedAt, outcome.at) &&
          near(corpse.x, outcome.x) &&
          near(corpse.y, outcome.y)
      )
    requireCheckpoint(!state.units.some((unit) => unit.id === outcome.enemyId))
    const deployment = history.deployments.find((value) =>
      value.members.some((member) => member.id === outcome.enemyId)
    )
    const member = deployment?.members.find((value) => value.id === outcome.enemyId)
    if (deployment && member) {
      const action = actionFromKey(deployment.summary.actionKey, checkpoint.version)
      requireCheckpoint(member.type === outcome.enemyType)
      requireCheckpoint(
        outcome.cause === 'combat-death'
          ? member.diedAt !== null && near(member.diedAt, outcome.at) && member.exitedAt === undefined
          : member.exitedAt !== undefined && near(member.exitedAt, outcome.at) && member.diedAt === null
      )
      if (action?.type !== 'wait' && action && 'routeId' in action)
        requireCheckpoint(outcome.routeId === (action.routeId ?? null))
    } else requireCheckpoint(outcome.legacyUnknown)
    // Raw checkpoint receipts are not the aggregated wire rows. Every retained
    // defeat-step receipt is factual lower-bound evidence, including old rows.
    // A legacy flag cannot erase a source or reduce a still-retained amount.
    const retainedLethals = new Map<string, number>()
    for (const receipt of history.damage) {
      if (receipt.victimId !== outcome.enemyId || !receipt.onDefeatStep || !near(receipt.at, outcome.at)) continue
      const key = sourceKey(receipt)
      retainedLethals.set(key, (retainedLethals.get(key) ?? 0) + receipt.damage)
    }
    const oldestRetainedAt = Math.min(...history.damage.map((receipt) => receipt.at))
    const completeLethalStep =
      (ledger && !ledger.legacyUnknown && history.discardedContributions === 0) ||
      outcome.at > oldestRetainedAt + epsilon
    const declaredLethals = new Map(outcome.lethalContributors.map((source) => [sourceKey(source), source.damage]))
    let undisplayedRetainedCount = 0,
      undisplayedRetainedDamage = 0
    for (const [key, amount] of retainedLethals) {
      const declared = declaredLethals.get(key)
      if (declared !== undefined) {
        requireCheckpoint(amount <= declared + epsilon)
        if (completeLethalStep) requireCheckpoint(near(amount, declared))
      } else {
        undisplayedRetainedCount++
        undisplayedRetainedDamage += amount
      }
    }
    requireCheckpoint(
      undisplayedRetainedCount <= outcome.omittedLethalContributors &&
        undisplayedRetainedDamage <= outcome.omittedLethalDamage + epsilon
    )
    if (completeLethalStep) {
      requireCheckpoint(outcome.lethalContributors.every((source) => retainedLethals.has(sourceKey(source))))
      requireCheckpoint(
        undisplayedRetainedCount === outcome.omittedLethalContributors &&
          near(undisplayedRetainedDamage, outcome.omittedLethalDamage)
      )
    }
    for (const lethal of outcome.lethalContributors) {
      const total = ledger?.sources.find((value) => sourceKey(value) === sourceKey(lethal))
      if (total) requireCheckpoint(lethal.damage <= total.damage + epsilon)
      else
        requireCheckpoint(
          ledger
            ? ledger.omittedContributions > 0 && lethal.damage <= ledger.omittedDamage + epsilon
            : outcome.legacyUnknown
        )
    }
    requireCheckpoint(
      outcome.legacyUnknown ||
        (battlefieldVersion(checkpoint) === 1 ? outcome.routeId === null : outcome.routeId !== null)
    )
    requireCheckpoint(outcome.flightPhase === null || (outcome.routeId !== null && isAirborneEnemy(outcome.enemyType)))
    if (!outcome.legacyUnknown && outcome.flightPhase === null && outcome.progress !== null) {
      const path =
        battlefieldVersion(checkpoint) === 2
          ? routeFor(checkpointField(checkpoint), outcome.routeId!).path
          : FIELDS[state.fieldId].path
      const point = pointOnPath(path, outcome.progress)
      requireCheckpoint(
        outcome.progress <= pathLength(path) + epsilon && near(point.x, outcome.x) && near(point.y, outcome.y)
      )
    }
    requireCheckpoint(unique(outcome.lethalContributors.map(sourceKey)))
    for (const source of outcome.lethalContributors) {
      validateSource(source)
      requireCheckpoint(
        source.damage > 0 && (source.sourceKind !== 'unit' || ALLY_TYPES.includes(source.sourceType as AllyType))
      )
    }
    requireCheckpoint((outcome.omittedLethalContributors === 0) === (outcome.omittedLethalDamage === 0))
    requireCheckpoint(
      outcome.lethalContributors.reduce((sum, source) => sum + source.damage, outcome.omittedLethalDamage) <=
        outcome.receivedDamage + epsilon
    )
    if (outcome.attributionComplete)
      requireCheckpoint(
        !outcome.legacyUnknown &&
          !!ledger &&
          !ledger.legacyUnknown &&
          ledger.omittedContributions === 0 &&
          outcome.omittedLethalContributors === 0
      )
    if (outcome.cause === 'gate-exit')
      requireCheckpoint(
        outcome.lastKiller === null &&
          outcome.lethalContributors.length === 0 &&
          outcome.omittedLethalContributors === 0 &&
          outcome.boss !== true &&
          !history.events.some((event) => event.kind === 'loss' && event.unitId === outcome.enemyId)
      )
    else requireCheckpoint(outcome.legacyUnknown || outcome.lethalContributors.length > 0)
    if (outcome.lastKiller) {
      validateSource(outcome.lastKiller)
      requireCheckpoint(
        !outcome.legacyUnknown &&
          outcome.cause === 'combat-death' &&
          outcome.lethalContributors.length === 1 &&
          outcome.omittedLethalContributors === 0 &&
          sourceKey(outcome.lastKiller) === sourceKey(outcome.lethalContributors[0])
      )
    } else if (!outcome.legacyUnknown && outcome.cause === 'combat-death')
      requireCheckpoint(outcome.lethalContributors.length !== 1 || outcome.omittedLethalContributors > 0)
  }
}

function validateHistory(checkpoint: DecodedCheckpoint): void {
  const { history, state: s, runtime } = checkpoint
  requireCheckpoint(
    history.fieldId === s.fieldId &&
      history.stage === s.stage &&
      history.lastTime <= s.time + epsilon &&
      history.omittedUntil <= s.time + HISTORY_LIMITS.windowSeconds + epsilon
  )
  requireCheckpoint(unique(history.deployments.map((deployment) => deployment.summary.id)))
  for (const event of history.events) {
    requireCheckpoint(event.at <= s.time + epsilon && event.unitId <= runtime.id)
    if (event.sourceId !== undefined) validateDamageSource(checkpoint, event.sourceId, event.sourceType)
    else requireCheckpoint(event.sourceType !== 'gate' && event.sourceType !== 'spike')
    if (event.victimIds)
      requireCheckpoint(unique(event.victimIds) && event.victimIds.every((victim) => victim <= runtime.id))
  }
  for (const contribution of history.damage) {
    validateDamageSource(checkpoint, contribution.sourceId, contribution.sourceType)
    requireCheckpoint(
      contribution.at <= s.time + epsilon &&
        contribution.victimId <= runtime.id &&
        (contribution.deploymentId === null || contribution.deploymentId <= runtime.deploymentSequence)
    )
  }
  if (checkpoint.version >= 13) validateEnemyHistory(checkpoint)
  const memberIds: number[] = []
  let spawnedCost = 0,
    resolved = 0
  for (const deployment of history.deployments) {
    const summary = deployment.summary,
      action = checked(actionFromKey(summary.actionKey, checkpoint.version)),
      members = checkpointMembers(checkpoint, action)
    requireCheckpoint(validAction(action, checkpoint))
    requireCheckpoint(summary.id <= runtime.deploymentSequence && members.length > 0)
    requireCheckpoint(
      summary.order.length === members.length && summary.order.every((type, index) => type === members[index].unitType)
    )
    requireCheckpoint(
      summary.spacingSeconds.length === members.length - 1 &&
        summary.spacingSeconds.every((delay, index) => near(delay, members[index + 1].delay - members[index].delay))
    )
    requireCheckpoint(summary.startedAt <= summary.lastEventAt + epsilon && summary.lastEventAt <= s.time + epsilon)
    requireCheckpoint(
      summary.spawned === deployment.members.length &&
        summary.resolved <= summary.spawned &&
        summary.spawned + summary.cancelled <= members.length
    )
    requireCheckpoint(summary.observedGaps.length === Math.max(0, summary.observedOrder.length - 1))
    requireCheckpoint(summary.observedOrder.every((type) => summary.order.includes(type)))
    for (const [index, member] of deployment.members.entries()) {
      requireCheckpoint(
        member.id <= runtime.id &&
          member.type === summary.order[index] &&
          member.spawnedAt >= summary.startedAt - epsilon &&
          member.spawnedAt <= s.time + epsilon
      )
      requireCheckpoint(
        member.diedAt === null || (member.diedAt >= member.spawnedAt && member.diedAt <= s.time + epsilon)
      )
      if (battlefieldVersion(checkpoint) === 2) {
        const unit = s.units.find((unit) => unit.id === member.id),
          declared = action as Exclude<AIAction, { type: 'wait' }>
        if (unit) {
          requireCheckpoint(unit.routeId === declared.routeId)
          if (unit.flight) requireCheckpoint(declared.type === 'spawn' && unit.flight.targetId === declared.targetId)
        }
      }
      if (member.exitedAt !== undefined) {
        requireCheckpoint(battlefieldVersion(checkpoint) === 2 && !members[index].boss && member.diedAt === null)
        requireCheckpoint(member.exitedAt >= member.spawnedAt && member.exitedAt <= s.time + epsilon)
        requireCheckpoint(
          !s.units.some((unit) => unit.id === member.id) && !s.corpses.some((corpse) => corpse.id === member.id)
        )
        requireCheckpoint(
          !history.events.some(
            (event) =>
              (event.kind === 'loss' || event.kind === 'area-loss') &&
              (event.unitId === member.id || event.victimIds?.includes(member.id))
          )
        )
      }
      const mapping = runtime.deploymentByUnit.find((entry) => entry.unitId === member.id)
      requireCheckpoint(mapping?.deploymentId === summary.id)
      spawnedCost += members[index].boss ? 5 : DEFINITIONS[member.type].cost
      memberIds.push(member.id)
    }
    const exited = deployment.members.filter((member) => member.exitedAt !== undefined).length
    requireCheckpoint(
      summary.exited === undefined ? exited === 0 : battlefieldVersion(checkpoint) === 2 && summary.exited === exited
    )
    requireCheckpoint(
      summary.resolved ===
        deployment.members.filter((member) => member.diedAt !== null || member.exitedAt !== undefined).length
    )
    resolved += summary.resolved
  }
  requireCheckpoint(unique(memberIds) && memberIds.length === s.enemiesSpawned && resolved === s.enemiesResolved)
  requireCheckpoint(spawnedCost + s.reservedBudget === s.budgetSpent)
}

function validateRuntime(checkpoint: DecodedCheckpoint): void {
  const { state: s, runtime } = checkpoint
  requireCheckpoint(unique(runtime.deploymentByUnit.map((entry) => entry.unitId)))
  for (const entry of runtime.deploymentByUnit)
    requireCheckpoint(entry.unitId <= runtime.id && entry.deploymentId <= runtime.deploymentSequence)
  requireCheckpoint(runtime.deploymentByUnit.length === s.enemiesSpawned)
  for (const unit of s.units.filter((unit) => unit.owner === 'ai'))
    requireCheckpoint(runtime.deploymentByUnit.some((entry) => entry.unitId === unit.id))
  for (const routes of [runtime.defenderDetours, runtime.failedDefenderDetours]) {
    requireCheckpoint(unique(routes.map((route) => route.unitId)))
    for (const route of routes) {
      const unit = s.units.find((unit) => unit.id === route.unitId)
      requireCheckpoint(unit && unit.owner === 'player')
      requireCheckpoint(route.targetId === undefined || route.targetId <= runtime.id)
      if ('waypoints' in route)
        for (const point of route.waypoints)
          requireCheckpoint(
            Math.hypot(point.x - unit.homeX, point.y - unit.homeY) <= DEFINITIONS[unit.type].leash + epsilon
          )
      if ('retryAt' in route) requireCheckpoint(route.retryAt <= s.time + 0.5 + epsilon)
    }
  }
}

function checkpointNumericText(value: string, decode: Decoder<number>): number {
  const parsed = decode(Number(value))
  requireCheckpoint(value === String(parsed))
  return parsed
}

function validateFortificationContext(checkpoint: DecodedCheckpoint, context: string): void {
  requireCheckpoint(context.startsWith('fortifications='))
  const entries = context.slice('fortifications='.length).split(';'),
    itemIds: number[] = [],
    field = checkpointField(checkpoint)
  requireCheckpoint(entries.length > 0 && entries.length <= FORTIFICATIONS.maxItems)
  for (const entry of entries) {
    const parts = entry.split(',')
    requireCheckpoint(parts.length === 6)
    const kind = choice(['spike', 'mud'])(parts[0]),
      itemId = checkpointNumericText(parts[1], id),
      edgeId = string(64)(parts[2]),
      offset = checkpointNumericText(parts[3], number(0, checkpointGeometryBounds(checkpoint.version).maximumPath)),
      remaining = checkpointNumericText(
        parts[4],
        kind === 'spike'
          ? number(Number.MIN_VALUE, FORTIFICATIONS.spike.hp)
          : number(1, FORTIFICATIONS.mud.charges, true)
      ),
      current = checkpoint.state.fortifications?.items.find((item) => item.id === itemId)
    requireCheckpoint(itemId <= checkpoint.runtime.id && !checkpoint.state.units.some((unit) => unit.id === itemId))
    requireCheckpoint(pointAtRoadAnchor(field, { edgeId, offset }))
    if (current)
      requireCheckpoint(
        current.kind === kind &&
          current.edgeId === edgeId &&
          near(current.offset, offset) &&
          remaining >= (current.kind === 'spike' ? current.hp : current.charges)
      )
    const insideIds = parts[5] ? parts[5].split('.').map((value) => checkpointNumericText(value, id)) : []
    requireCheckpoint(kind === 'mud' || insideIds.length === 0)
    requireCheckpoint(
      insideIds.length <= CONFIG.maxUnits &&
        unique(insideIds) &&
        insideIds.every((unitId) => checkpoint.runtime.deploymentByUnit.some((entry) => entry.unitId === unitId))
    )
    itemIds.push(itemId)
  }
  requireCheckpoint(unique(itemIds) && itemIds.every((itemId, index) => index === 0 || itemIds[index - 1] < itemId))
}

function validateInterceptionContext(checkpoint: DecodedCheckpoint): void {
  const { state: s, runtime } = checkpoint,
    snapshot = runtime.interception,
    fields = snapshot.context.split(':'),
    field = checkpointField(checkpoint)
  // Optional live-body cache identity. Historical v15 contexts remain valid and
  // restore() discards their stale forecasts if a current Tank changes geometry.
  const tanks = fields.at(-1)?.startsWith('tanks=') ? fields.pop()! : undefined
  if (tanks !== undefined) {
    const entries = tanks.slice('tanks='.length).split(';'),
      tankIds: number[] = []
    requireCheckpoint(
      entries.length > 0 &&
        entries.length <= CONFIG.maxUnits &&
        [...entries].sort().join(';') === tanks.slice('tanks='.length)
    )
    for (const entry of entries) {
      const parts = entry.split(',')
      requireCheckpoint(parts.length === 3)
      const tankId = checkpointNumericText(parts[0], id),
        current = s.units.find((unit) => unit.id === tankId)
      checkpointNumericText(parts[1], number(0, field.width))
      checkpointNumericText(parts[2], number(0, field.height))
      requireCheckpoint(
        tankId <= runtime.id &&
          (!current || (current.owner === 'player' && current.type === 'tank')) &&
          !runtime.deploymentByUnit.some((entry) => entry.unitId === tankId)
      )
      tankIds.push(tankId)
    }
    requireCheckpoint(unique(tankIds))
  }
  const legacyFields = battlefieldVersion(checkpoint) === 2 ? 10 : 9,
    baseFields = legacyFields + (layoutRevision(checkpoint) > 1 ? 1 : 0)
  if (layoutRevision(checkpoint) > 1) requireCheckpoint(fields[legacyFields] === `layout${layoutRevision(checkpoint)}`)
  requireCheckpoint(
    fields.length === baseFields ||
      (checkpoint.version >= 6 && s.economyVersion === 2 && fields.length === baseFields + 1)
  )
  if (fields.length > baseFields) validateFortificationContext(checkpoint, fields[baseFields])
  if (battlefieldVersion(checkpoint) === 2) requireCheckpoint(fields[9] === 'battlefield2')
  checkpointNumericText(fields[0], sequence)
  requireCheckpoint(checkpointNumericText(fields[1], stage) === s.stage && fields[2] === s.fieldId)
  requireCheckpoint(fields[3] === 'assault')
  requireCheckpoint(
    checkpointNumericText(fields[4], number(0, checkpointGeometryBounds(checkpoint.version).maximumPath)) ===
      field.slowSurface.startProgress
  )
  requireCheckpoint(
    checkpointNumericText(fields[5], number(0, checkpointGeometryBounds(checkpoint.version).maximumPath)) ===
      field.slowSurface.endProgress
  )
  requireCheckpoint(checkpointNumericText(fields[6], number(0.01, 1)) === field.slowSurface.speedFactor)
  const bags = fields[7] ? fields[7].split(';') : [],
    enemies = fields[8] ? fields[8].split(',') : [],
    bagIds: number[] = []
  requireCheckpoint(bags.length <= CONFIG.stages && enemies.length <= INTERCEPTION.maxEnemies)
  for (const bag of bags) {
    const parts = bag.split(',')
    requireCheckpoint(parts.length === 3)
    const bagId = checkpointNumericText(parts[0], id),
      current = s.sandbags.find((value) => value.id === bagId),
      hp = checkpointNumericText(parts[1], number(Number.MIN_VALUE, current?.maxHp ?? LEGACY_SANDBAG_MAX_HP)),
      progress = checkpointNumericText(parts[2], number(0, Math.max(...field.routes.map((route) => route.length))))
    requireCheckpoint(bagId <= runtime.id && !s.units.some((unit) => unit.id === bagId))
    requireCheckpoint(!current || (current.progress === progress && hp >= current.hp))
    bagIds.push(bagId)
  }
  requireCheckpoint(unique(bagIds) && [...bags].sort().join(';') === fields[7])
  const enemyIds = enemies.map((value) => checkpointNumericText(value, id))
  requireCheckpoint(
    unique(enemyIds) &&
      [...enemyIds].sort((a, b) => a - b).join(',') === fields[8] &&
      enemyIds.every((unitId) => runtime.deploymentByUnit.some((entry) => entry.unitId === unitId))
  )
  fields[0] = '0'
  snapshot.context = [...fields, ...(tanks ? [tanks] : [])].join(':')
}

function validateInterceptionFingerprint(checkpoint: DecodedCheckpoint, unitId: number, fingerprint: string) {
  const fields = fingerprint.split(':'),
    { state: s, runtime } = checkpoint
  const baseFields = battlefieldVersion(checkpoint) === 2 ? 16 : 8,
    supportFeatures = checkpoint.version >= 7 && s.commanderSupportVersion === 1,
    paidFeatures = checkpoint.version >= 6 && s.economyVersion === 2
  requireCheckpoint(
    fields.length >= baseFields &&
      fields.length <= baseFields + (paidFeatures ? 2 : 0) + (supportFeatures ? 1 : 0) &&
      runtime.deploymentByUnit.some((entry) => entry.unitId === unitId)
  )
  const speed = checkpointNumericText(fields[0], number(0, maximumSpeed)),
    slowUntil = checkpointNumericText(fields[1], deadline),
    slowFactor = checkpointNumericText(fields[2], number(0.01, 1)),
    attackSequence = checkpointNumericText(fields[3], sequence),
    power = checkpointNumericText(fields[4], number(0, maximumPower)),
    attackSpeed = checkpointNumericText(fields[5], number(0.01, 10)),
    range = checkpointNumericText(fields[6], number(0, checkpointGeometryBounds(checkpoint.version).coordinateBound)),
    recovery = checkpointNumericText(fields[7], deadline),
    unit = s.units.find((value) => value.id === unitId),
    bounds = checkpointBounds(checkpoint.version)
  requireCheckpoint(slowUntil <= bounds.deadline && recovery <= bounds.deadline && power <= bounds.power)
  requireCheckpoint(slowUntil <= s.time + bounds.cooldown && recovery <= s.time + 30)
  if (unit)
    requireCheckpoint(
      unit.owner === 'ai' &&
        speed === unit.speed &&
        power === unit.attack &&
        attackSpeed === unit.attackSpeed &&
        range === unit.attackRange &&
        attackSequence <= unit.attackSequence &&
        slowUntil <= unit.slowUntil &&
        slowFactor >= unit.slowFactor
    )
  const extras = fields.slice(baseFields)
  let spikeHp: number | undefined,
    supportedSpeed = speed
  if (extras.at(-1)?.startsWith('support=')) {
    requireCheckpoint(supportFeatures)
    const parts = extras.pop()!.slice('support='.length).split(',')
    requireCheckpoint(parts.length === 4)
    const effect = choice(['speed', 'armor', 'attack'])(parts[0]),
      buff = {
        sequence: checkpointNumericText(parts[1], id),
        startedAt: checkpointNumericText(parts[2], time),
        expiresAt: checkpointNumericText(parts[3], deadline)
      }
    supportBuffEvidence(checkpoint, unitId, buff, effect)
    if (effect === 'speed') supportedSpeed *= COMMANDER_SUPPORT.speedMultiplier
  }
  if (extras.at(-1)?.startsWith('hp=')) {
    spikeHp = checkpointNumericText(extras.pop()!.slice(3), number(Number.MIN_VALUE, unit?.maxHp ?? bounds.hp))
    const contextItems =
      runtime.interception.context
        .split(':')
        .find((part) => part.startsWith('fortifications='))
        ?.slice('fortifications='.length)
        .split(';') ?? []
    requireCheckpoint(
      s.fortifications?.items.some((item) => item.kind === 'spike') ||
        contextItems.some((item) => item.startsWith('spike,'))
    )
  }
  requireCheckpoint(extras.length <= 1)
  if (extras.length) {
    const mudUntil = checkpointNumericText(extras[0], number(Number.MIN_VALUE, bounds.deadline))
    requireCheckpoint(mudUntil <= s.time + FORTIFICATIONS.mud.duration + epsilon)
    if (unit) requireCheckpoint(!isAirborneEnemy(unit.type) && mudUntil <= (unit.mudSlowUntil ?? 0) + epsilon)
  }
  if (battlefieldVersion(checkpoint) === 1) return { speed: supportedSpeed, routeId: undefined, flight: false, spikeHp }
  const routeId = choice(['left', 'right'])(fields[8]),
    route = routeFor(checkpointField(checkpoint), routeId),
    targetId = fields[9] ? checkpointNumericText(fields[9], id) : undefined,
    flight = targetId !== undefined
  if (unit) requireCheckpoint(unit.routeId === routeId)
  if (flight) {
    requireCheckpoint(targetId! <= runtime.id && targetId !== unitId)
    choice(['approach', 'engage', 'return'])(fields[10])
    checkpointNumericText(fields[11], number(0, route.length))
    if (unit) requireCheckpoint(isAirborneEnemy(unit.type))
  } else requireCheckpoint(fields[10] === '' && fields[11] === '')
  if (fields[12] || fields[13] || fields[14]) {
    requireCheckpoint(flight)
    checkpointNumericText(fields[12], number(0, checkpointField(checkpoint).width))
    checkpointNumericText(fields[13], number(0, checkpointField(checkpoint).height))
    checkpointNumericText(fields[14], number(0, bounds.hp))
  }
  if (fields[15]) checkpointNumericText(fields[15], deadline)
  return { speed: supportedSpeed, routeId, flight, spikeHp }
}

function validateInterception(checkpoint: DecodedCheckpoint): void {
  const { state: s, runtime } = checkpoint,
    snapshot = runtime.interception
  requireCheckpoint(snapshot.lastTime <= s.time + epsilon)
  if (!snapshot.context) {
    requireCheckpoint(snapshot.lastTime === 0 && snapshot.intents.length === 0 && snapshot.forecasts.length === 0)
    return
  }
  validateInterceptionContext(checkpoint)
  requireCheckpoint(unique(snapshot.intents.map((intent) => intent.unitId)))
  requireCheckpoint(unique(snapshot.forecasts.map((forecast) => forecast.unitId)))
  for (const intent of snapshot.intents) {
    const defender = s.units.find((unit) => unit.id === intent.unitId)
    requireCheckpoint(defender && defender.owner === 'player')
    requireCheckpoint(
      intent.selectedAt <= intent.checkedAt &&
        intent.checkedAt <= snapshot.lastTime &&
        intent.interceptAt >= intent.checkedAt - epsilon &&
        intent.interceptAt <= intent.checkedAt + INTERCEPTION.horizon + epsilon
    )
    if (intent.targetId === undefined)
      requireCheckpoint(
        intent.enemyFingerprint === undefined &&
          intent.waypoints.length === 0 &&
          intent.interceptAt === intent.checkedAt
      )
    else {
      requireCheckpoint(intent.enemyFingerprint !== undefined)
      validateInterceptionFingerprint(checkpoint, intent.targetId, intent.enemyFingerprint)
    }
    for (const point of [intent.point, ...intent.waypoints])
      requireCheckpoint(
        Math.hypot(point.x - defender.homeX, point.y - defender.homeY) <= DEFINITIONS[defender.type].leash + epsilon &&
          clearInterceptionStep(s, point, point)
      )
    if (intent.waypoints.length) {
      const last = intent.waypoints.at(-1)!
      requireCheckpoint(near(last.x, intent.point.x) && near(last.y, intent.point.y))
      for (let index = 1; index < intent.waypoints.length; index++)
        requireCheckpoint(clearInterceptionStep(s, intent.waypoints[index - 1], intent.waypoints[index]))
    }
  }
  const field = checkpointField(checkpoint)
  for (const forecast of snapshot.forecasts) {
    const { speed, routeId, flight, spikeHp } = validateInterceptionFingerprint(
        checkpoint,
        forecast.unitId,
        forecast.fingerprint
      ),
      route = routeFor(field, routeId)
    requireCheckpoint(forecast.checkedAt <= snapshot.lastTime)
    const maximumSamples = Math.round(INTERCEPTION.horizon / INTERCEPTION.sampleSeconds) + 1
    requireCheckpoint(
      forecast.samples.length >= 1 &&
        (spikeHp === undefined ? forecast.samples.length === maximumSamples : forecast.samples.length <= maximumSamples)
    )
    for (const [index, sample] of forecast.samples.entries()) {
      const expected = pointOnPath(route.path, sample.progress),
        previous = forecast.samples[index - 1]
      requireCheckpoint(
        sample.progress <= route.length && near(sample.at, forecast.checkedAt + index * INTERCEPTION.sampleSeconds)
      )
      if (flight)
        requireCheckpoint(sample.x >= 0 && sample.x <= field.width && sample.y >= 0 && sample.y <= field.height)
      else requireCheckpoint(near(sample.x, expected.x) && near(sample.y, expected.y))
      if (previous) {
        requireCheckpoint(
          Math.hypot(sample.x - previous.x, sample.y - previous.y) <= speed * INTERCEPTION.sampleSeconds + epsilon
        )
        if (!flight)
          requireCheckpoint(
            sample.progress >= previous.progress &&
              sample.progress - previous.progress <= speed * INTERCEPTION.sampleSeconds + epsilon
          )
        else if (!near(sample.progress, previous.progress))
          requireCheckpoint(near(sample.x, expected.x) && near(sample.y, expected.y))
      }
    }
  }
  const restored = new DefenderInterception()
  restored.restore(snapshot, checkpointValidationState(checkpoint))
  runtime.interception = restored.snapshot()
}

// Private runtime and history must also be restored before the caller permits any simulation step.
export function reconstructCheckpointState(checkpoint: CampaignCheckpoint): GameState | null {
  const validated = validateCampaignCheckpoint(checkpoint, checkpoint.progress, checkpoint.profile)
  if (!validated) return null
  const saved = validated.state,
    state = initialState(saved.fieldId, saved.seed, saved.battlefieldVersion, saved.layoutRevision)
  for (const key of Object.keys(saved) as (keyof CampaignStateCheckpoint)[]) {
    if (key !== 'corpses') Object.assign(state, { [key]: saved[key] })
  }
  state.corpses = saved.corpses.map((corpse) =>
    Object.freeze({
      ...corpse,
      key: `${state.battleId}:${state.fieldId}:${state.stage}:${corpse.id}`
    })
  )
  state.commanderOrder = null
  state.tacticalHistory = null
  state.decisionStatus =
    saved.phase === 'assault' ? '再開 · 判断待ち' : saved.phase === 'preparation' ? '準備中' : '再開'
  return state
}
