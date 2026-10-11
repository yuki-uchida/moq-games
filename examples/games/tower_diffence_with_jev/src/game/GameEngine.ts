import { goblinPursuitTarget } from './GoblinTarget'
import { tankAvailableToEnemy } from './TankRoadblock'
import { attackDamageType, incomingDamage } from './DamageRules'
import { healingAction, committedHealAmount, canInitiateDamage } from './HealingActions'
import {
  COMMANDER_SUPPORT,
  activeSupportBuff,
  advanceCommanderSupport,
  effectiveAttack,
  effectiveSpeed,
  effectiveMovementSpeed,
  finishSupportCast,
  freshCommanderSupport,
  getLegalSupportActions,
  isLegalSupportAction,
  supportActionKey,
  supportUnavailableReason,
  type SupportAction,
  type SupportUnavailableReason
} from './CommanderSupport'
import { advanceEnemyTravel, applyEnemyTravel, isReturningBossRaid, nextRoadObstruction } from './EnemyTravel'
import {
  FORTIFICATIONS,
  allBarriers,
  freshFortifications,
  gateDamageFactor,
  gateMuzzle,
  previewRoadItemPlacement,
  pruneMudOccupants,
  roadItems,
  type RoadItemPlacement
} from './Fortifications'
import { allRoadPaths, nearestRoadEdge, physicalProjectionOnRoute, routeFor, routeSurface } from './BattlefieldRoutes'
import { fieldScenery } from './FieldScenery'
import { DefenderInterception, clearInterceptionStep } from './Interception'
import { attackContact, sandbagStandOff } from './CombatContact'
import { TacticalHistory, type DamageContribution } from './TacticalHistory'
import {
  COMBAT_SOUND_QUEUE_LIMIT,
  type CombatSoundEvent,
  type CombatSoundKind,
  type SoundUnitType
} from './CombatSoundEvents'
import { previewGroundPlacement, type GroundPlacement } from './GroundPlacement'
import {
  DEPLOYMENT_COST,
  REDEPLOY_RADIUS,
  canSpendOnRoster,
  defenderLevel,
  findDefender,
  retainedDefenders
} from './DefenderRoster'
import {
  entranceFacing,
  TANK_GUARD,
  CONFIG,
  DEFENDER_ROAD_CLEARANCE,
  ROAD_EFFECTS,
  isAirborneEnemy,
  isEnemyMelee,
  projectToPath,
  advanceRoadProgress,
  type SandbagPlacement,
  type Equipment,
  type RoadItemKind,
  type GateShot,
  ANIMATION,
  DEFINITIONS,
  ALLY_TYPES,
  ENEMY_TYPES,
  FIELDS,
  fieldFor,
  routePathFor,
  canTargetUnit,
  directFlightTargets,
  type DirectorDecisionTrace,
  type BattlefieldVersion,
  type LayoutRevision,
  stageRules,
  combatStats,
  deploymentCooldown,
  attackSplash,
  initialState,
  isAction,
  isNoDecision,
  noDecisionStatus,
  actionKey,
  actionMembers,
  actionLabel,
  tacticalOption,
  observeDefense,
  getLegalAIActions,
  deploymentBlockReasons,
  emptyCooldowns,
  pointOnPath,
  pathLength,
  type GameState,
  type CombatAttack,
  type Owner,
  type UnitType,
  type AllyType,
  type FieldId,
  type Unit,
  type Point,
  type AIAction,
  type EnemyType,
  type AINoDecisionReason
} from './model'
import type { AIController } from '../ai/AIController'
import {
  freshSave,
  availableAllies,
  upgradeCost,
  profileFromSave,
  runProgressFromSave,
  type SaveData
} from '../progression/UpgradeSystem'
import {
  CAMPAIGN_CHECKPOINT_VERSION,
  reconstructCheckpointState,
  validateCampaignCheckpoint,
  type CampaignCheckpoint
} from './CampaignCheckpoint'
import { SeededRandom, selectDirectorDecision } from './Director'
import {
  ATTACK_PROFILES,
  combatAttackInterval,
  ENEMY_ACTION_TIME_SCALE,
  attackTimeScale,
  attackAssetElapsedMs
} from './AttackProfiles'
import { heavyImpactGeometry, insideHeavyImpact } from './HeavyImpact'
import {
  BREATH_TIMING,
  breathDirection,
  breathGeometry,
  lockBreathAim,
  breathTickAt,
  insideBreath,
  mouthAt,
  type BreathMouthTracks
} from './BreathGeometry'
export class GameEngine {
  readonly state: GameState
  private history = new TacticalHistory()
  private combatSounds: CombatSoundEvent[] = []
  private interception = new DefenderInterception()
  private id = 0
  private accumulator = 0
  private restoredCooldownHold = false
  private nextDecisionAt = 0
  private pending: number | null = null
  private decisionSlot = 0
  private supportPending: number | null = null
  private supportRequest = 0
  private nextSupportRequestAt = 0
  private generation = 0
  private random: SeededRandom
  private deploymentSequence = 0
  private decisionRevision = 0
  private nextObservationAt = 0
  private observing = false
  private unavailableReason: AINoDecisionReason | null = null
  private defenderDetours = new Map<number, { targetId?: number; target: Point; waypoints: Point[] }>()
  private failedDefenderDetours = new Map<number, { targetId?: number; target: Point; retryAt: number }>()
  private deploymentByUnit = new Map<number, number>()
  private lastDeploymentAt = -Infinity
  private planDefenders = 0
  private planBaseHp = CONFIG.baseHp
  constructor(
    private controller: AIController,
    private save: SaveData = freshSave(),
    fieldId: FieldId = 'meadow',
    seed = 20261003,
    private now: () => number = () => performance.now(),
    private breathMouths?: BreathMouthTracks,
    battlefieldVersion: BattlefieldVersion = 1,
    layoutRevision: LayoutRevision = 1
  ) {
    this.state = initialState(fieldId, seed, battlefieldVersion, layoutRevision)
    if (save.commanderSupportVersion === 1) {
      this.state.commanderSupportVersion = 1
      this.state.commanderSupport = freshCommanderSupport()
    }
    if (save.economyVersion === 2) {
      this.state.economyVersion = 2
      this.state.reserveUnits = []
      this.state.fortifications = freshFortifications()
    }
    this.random = new SeededRandom(seed)
    this.refreshHistory()
  }
  takeCombatSounds(): CombatSoundEvent[] {
    const sounds = this.combatSounds
    this.combatSounds = []
    return sounds
  }
  private emitCombatSound(attack: CombatAttack, kind: CombatSoundKind, at: number): void {
    if (attack.kind === 'heal' || attack.type === 'healer') return
    const { battleId, stage } = this.state
    this.combatSounds.push({
      id: `${battleId}:${stage}:${attack.id}:${kind}`,
      attackId: attack.id,
      attackerId: attack.attackerId,
      unitType: attack.type,
      kind,
      at,
      battleId,
      stage
    })
    if (this.combatSounds.length > COMBAT_SOUND_QUEUE_LIMIT) this.combatSounds.shift()
  }
  private emitEffectSound(sourceId: string, actorId: number, unitType: SoundUnitType, kind: CombatSoundKind): void {
    const { battleId, stage, time } = this.state
    this.combatSounds.push({
      id: `${battleId}:${stage}:${sourceId}:${actorId}:${kind}`,
      attackId: sourceId,
      attackerId: actorId,
      unitType,
      kind,
      at: time,
      battleId,
      stage
    })
    if (this.combatSounds.length > COMBAT_SOUND_QUEUE_LIMIT) this.combatSounds.shift()
  }
  exportCheckpoint(): CampaignCheckpoint | null {
    try {
      const s = this.state,
        profile = profileFromSave(this.save),
        progress = runProgressFromSave(this.save),
        interception = this.interception.snapshot()
      if (interception.context) interception.lastTime = s.time
      return validateCampaignCheckpoint(
        {
          version: CAMPAIGN_CHECKPOINT_VERSION,
          profile,
          progress,
          rewardedThroughStage: s.result === 'win' ? s.stage : s.stage - 1,
          state: {
            ...(s.commanderSupportVersion === 1
              ? { commanderSupportVersion: 1 as const, commanderSupport: s.commanderSupport }
              : {}),
            ...(s.economyVersion === 2
              ? { economyVersion: 2 as const, reserveUnits: s.reserveUnits, fortifications: s.fortifications }
              : {}),
            time: s.time,
            stage: s.stage,
            waveBossPolicy: s.waveBossPolicy,
            battlefieldVersion: s.battlefieldVersion,
            layoutRevision: s.layoutRevision,
            phase: s.phase,
            fieldId: s.fieldId,
            seed: s.seed,
            playerBaseHp: s.playerBaseHp,
            enemiesSpawned: s.enemiesSpawned,
            enemiesResolved: s.enemiesResolved,
            budgetSpent: s.budgetSpent,
            nextSpawnAt: s.nextSpawnAt,
            units: s.units,
            attacks: s.attacks,
            sandbags: s.sandbags,
            sandbagStock: s.sandbagStock,
            cooldowns: s.cooldowns,
            pendingSpawns: s.pendingSpawns,
            reservedBudget: s.reservedBudget,
            strategy: s.strategy,
            recentOutcomes: s.recentOutcomes,
            stageSummary: s.stageSummary,
            previousStageSummary: s.previousStageSummary,
            result: s.result,
            lastAction: s.lastAction,
            requestedAction: s.requestedAction,
            decisionTime: s.decisionTime,
            ...(s.cooldownHold ? { cooldownHold: structuredClone(s.cooldownHold) } : {}),
            historyEnabled: s.historyEnabled,
            corpses: s.corpses.map(({ key: _key, ...corpse }) => corpse)
          },
          runtime: {
            id: this.id,
            accumulator: this.accumulator,
            randomState: this.random.snapshot(),
            deploymentSequence: this.deploymentSequence,
            decisionRevision: this.decisionRevision,
            deploymentByUnit: [...this.deploymentByUnit].map(([unitId, deploymentId]) => ({
              unitId,
              deploymentId
            })),
            lastDeploymentAt: this.lastDeploymentAt === -Infinity ? null : this.lastDeploymentAt,
            planDefenders: this.planDefenders,
            planBaseHp: this.planBaseHp,
            interception,
            defenderDetours: [...this.defenderDetours].map(([unitId, route]) => ({ unitId, ...route })),
            failedDefenderDetours: [...this.failedDefenderDetours].map(([unitId, route]) => ({
              unitId,
              ...route
            }))
          },
          history: this.history.exportCheckpoint(s)
        },
        progress,
        profile
      )
    } catch {
      return null
    }
  }
  static fromCheckpoint(
    checkpoint: unknown,
    controller: AIController,
    save: SaveData,
    now: () => number = () => performance.now(),
    breathMouths?: BreathMouthTracks
  ): GameEngine | null {
    try {
      const validated = validateCampaignCheckpoint(checkpoint, runProgressFromSave(save), profileFromSave(save))
      if (
        !validated ||
        (!breathMouths &&
          validated.state.attacks.some(
            (attack) => attack.breath && (attack.status === 'windup' || attack.status === 'released')
          ))
      )
        return null
      const state = reconstructCheckpointState(validated),
        resumedAt = now()
      if (!state || !Number.isFinite(resumedAt)) return null
      for (const attack of state.attacks) {
        if (attack.aim || (attack.type !== 'ogre' && attack.type !== 'brute')) continue
        const attacker = state.units.find((unit) => unit.id === attack.attackerId)
        if (attacker)
          attack.aim = {
            x: attacker.attackTargetX - attack.origin.x,
            y: attacker.attackTargetY - attack.origin.y
          }
      }
      save.purchased = [...validated.profile.purchased]
      const engine = new GameEngine(
          controller,
          save,
          state.fieldId,
          state.seed,
          now,
          breathMouths,
          state.battlefieldVersion,
          state.layoutRevision
        ),
        runtime = validated.runtime
      Object.assign(engine.state, state)
      engine.restoredCooldownHold = !!state.cooldownHold
      if (controller.holdsCooldown !== true && engine.state.cooldownHold) {
        delete engine.state.cooldownHold
        if (engine.state.strategy) {
          engine.state.strategy.expiresAt = engine.state.strategy.startedAt + CONFIG.waitPlanLifetime
          engine.state.strategy.status = 'interrupted'
          engine.state.strategy.reconsideration = '制御の切り替え'
        }
      }
      if (engine.state.commanderSupport?.cast && controller.supportEnabled !== true)
        finishSupportCast(engine.state, 'cancelled')
      if (engine.state.commanderSupport?.status === 'requesting') {
        engine.state.commanderSupport.status = 'unavailable'
        engine.state.commanderSupport.reason = 'stale'
      }
      engine.nextSupportRequestAt = resumedAt + COMMANDER_SUPPORT.requestIntervalMs
      engine.id = runtime.id
      engine.accumulator = runtime.accumulator
      engine.random = new SeededRandom(runtime.randomState)
      engine.deploymentSequence = runtime.deploymentSequence
      engine.decisionRevision = runtime.decisionRevision
      engine.deploymentByUnit = new Map(
        runtime.deploymentByUnit.map(({ unitId, deploymentId }) => [unitId, deploymentId])
      )
      engine.lastDeploymentAt = runtime.lastDeploymentAt ?? -Infinity
      engine.planDefenders = runtime.planDefenders
      engine.planBaseHp = runtime.planBaseHp
      engine.defenderDetours = new Map(runtime.defenderDetours.map(({ unitId, ...route }) => [unitId, route]))
      engine.failedDefenderDetours = new Map(
        runtime.failedDefenderDetours.map(({ unitId, ...route }) => [unitId, route])
      )
      engine.history = TacticalHistory.fromCheckpoint(validated.history)
      engine.interception.restore(runtime.interception, engine.state)
      controller.resumeCadence?.()
      engine.nextDecisionAt = resumedAt + CONFIG.decisionInterval * 1000
      engine.nextObservationAt = resumedAt + 1000
      engine.refreshHistory()
      return engine
    } catch {
      return null
    }
  }
  get ai(): AIController {
    return this.controller
  }
  set ai(controller: AIController) {
    if (controller === this.controller) return
    this.controller.cancelPending?.()
    this.controller = controller
    this.invalidateAI()
  }
  private refreshHistory(): void {
    this.state.tacticalHistory = this.history.snapshot(this.state)
  }
  setHistoryEnabled(enabled: boolean): void {
    if (this.state.historyEnabled === enabled) return
    this.state.historyEnabled = enabled
    this.state.commanderOrder = null
    this.state.decisionTrace = null
    this.generation++
    this.pending = null
    this.controller.cancelDeployment?.()
  }
  invalidateAI(): void {
    delete this.state.cooldownHold
    this.restoredCooldownHold = false
    this.generation++
    this.pending = null
    this.supportPending = null
    this.controller.cancelPending?.()
    finishSupportCast(this.state, 'cancelled')
    this.unavailableReason = null
    this.state.decisionTrace = null
    this.interruptPlan('制御の切り替え')
  }
  private interruptPlan(reason: string): void {
    const s = this.state
    s.commanderOrder = null
    for (const member of s.pendingSpawns) {
      s.budgetSpent -= member.cost
      s.cooldowns[member.unitType] = Math.max(0, member.previousCooldownUntil - s.time)
      const outcome = s.recentOutcomes.find((value) => value.id === member.deploymentId)
      if (outcome) outcome.cancelled++
      this.history.cancel(s, member.deploymentId)
    }
    s.pendingSpawns = []
    s.reservedBudget = 0
    s.nextSpawnAt = Math.max(s.time, this.lastDeploymentAt + stageRules(s.stage, s.waveBossPolicy).spawnInterval)
    if (s.strategy && (s.strategy.status === 'executing' || s.strategy.status === 'observing')) {
      s.strategy.status = 'interrupted'
      s.strategy.reconsideration = reason
    }
    if (!s.cooldownHold && s.strategy?.actionKey.startsWith('wait:'))
      s.strategy.expiresAt = s.strategy.startedAt + CONFIG.waitPlanLifetime
  }
  selectField(id: FieldId): boolean {
    if (
      typeof id !== 'string' ||
      !Object.hasOwn(FIELDS, id) ||
      this.state.stage !== 1 ||
      this.state.phase !== 'preparation' ||
      this.state.units.length ||
      this.state.reserveUnits?.length ||
      roadItems(this.state).length ||
      (this.state.fortifications?.gate.cannonLevel ?? 0) > 0 ||
      (this.state.fortifications?.gate.armorLevel ?? 0) > 0
    )
      return false
    // Validate the complete geometry identity before changing any preparation state.
    fieldFor({ ...this.state, fieldId: id })
    if (this.state.fieldId !== id) {
      this.invalidateAI()
      this.state.corpses = []
      this.state.sandbags = []
      this.state.sandbagStock = 1
    }
    this.state.fieldId = id
    this.refreshHistory()
    return true
  }
  previewSandbag(point: Point, movingId?: number): SandbagPlacement {
    const s = this.state,
      field = fieldFor(s)
    const finite = !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
    const roadProjection =
        s.battlefieldVersion === 2 ? nearestRoadEdge(field, finite ? point : field.path[0]) : undefined,
      projected = roadProjection ?? projectToPath(field.path, finite ? point : field.path[0])
    const base = field.path[field.path.length - 1]
    const moving = movingId === undefined ? undefined : s.sandbags.find((bag) => bag.id === movingId)
    const reason: SandbagPlacement['reason'] =
      s.phase !== 'preparation'
        ? 'phase'
        : !finite
          ? 'invalid-point'
          : movingId !== undefined && !moving
            ? 'missing-barrier'
            : !moving && (s.sandbagStock < 1 || s.sandbags.length >= CONFIG.stages)
              ? 'unavailable'
              : projected.distance > CONFIG.roadWidth / 2
                ? 'off-road'
                : projected.progress < ROAD_EFFECTS.sandbag.entryClearance
                  ? 'entry-clearance'
                  : pathLength(routeFor(field, roadProjection?.routeId).path) - projected.progress <
                        ROAD_EFFECTS.sandbag.coreClearance ||
                      Math.hypot(projected.x - base.x, projected.y - base.y) < ROAD_EFFECTS.sandbag.coreClearance
                    ? 'core-clearance'
                    : s.units.some(
                          (unit) =>
                            unit.owner === 'player' &&
                            Math.hypot(projected.x - unit.homeX, projected.y - unit.homeY) <
                              ROAD_EFFECTS.sandbag.defenderClearance
                        )
                      ? 'defender-overlap'
                      : [...s.sandbags, ...roadItems(s)].some(
                            (bag) =>
                              bag !== moving &&
                              ((s.battlefieldVersion !== 2 &&
                                Math.abs(bag.progress - projected.progress) < ROAD_EFFECTS.sandbag.minimumSpacing) ||
                                Math.hypot(bag.x - projected.x, bag.y - projected.y) <
                                  ROAD_EFFECTS.sandbag.minimumSpacing)
                          )
                        ? 'barrier-overlap'
                        : null
    return {
      valid: reason === null,
      reason,
      point: { x: projected.x, y: projected.y },
      progress: projected.progress,
      distance: projected.distance,
      ...(roadProjection ? { edgeId: roadProjection.edgeId, offset: roadProjection.offset } : {})
    }
  }
  placeSandbag(point: Point, movingId?: number): SandbagPlacement {
    const result = this.previewSandbag(point, movingId)
    if (!result.valid) return result
    const moving = this.state.sandbags.find((bag) => bag.id === movingId)
    if (moving)
      Object.assign(
        moving,
        result.point,
        { progress: result.progress },
        result.edgeId === undefined ? {} : { edgeId: result.edgeId, offset: result.offset }
      )
    else {
      this.state.sandbags.push({
        id: ++this.id,
        ...result.point,
        progress: result.progress,
        ...(result.edgeId === undefined ? {} : { edgeId: result.edgeId, offset: result.offset }),
        hp: ROAD_EFFECTS.sandbag.hp,
        maxHp: ROAD_EFFECTS.sandbag.hp
      })
      this.state.sandbagStock--
    }
    return result
  }
  removeSandbag(id: number): boolean {
    if (this.state.phase !== 'preparation') return false
    const bag = this.state.sandbags.find((bag) => bag.id === id)
    if (!bag) return false
    this.state.sandbags = this.state.sandbags.filter((value) => value !== bag)
    if (bag.hp === bag.maxHp) this.state.sandbagStock++
    return true
  }
  previewRoadItem(kind: RoadItemKind, point: Point, movingId?: number): RoadItemPlacement {
    const result = previewRoadItemPlacement(this.state, kind, point, movingId)
    if (result.valid && movingId === undefined && !canSpendOnRoster(this.save, FORTIFICATIONS[kind].cost, this.state))
      return { ...result, valid: false, reason: 'funds' }
    return result
  }
  placeRoadItem(kind: RoadItemKind, point: Point, movingId?: number): RoadItemPlacement {
    const result = this.previewRoadItem(kind, point, movingId)
    if (!result.valid) return result
    const fortifications = this.state.fortifications!,
      moving = fortifications.items.find((item) => item.id === movingId),
      anchor = { ...result.point, progress: result.progress, edgeId: result.edgeId!, offset: result.offset! }
    if (moving) Object.assign(moving, anchor)
    else {
      fortifications.items.push(
        kind === 'spike'
          ? { ...anchor, id: ++this.id, kind, hp: FORTIFICATIONS.spike.hp, maxHp: FORTIFICATIONS.spike.hp }
          : { ...anchor, id: ++this.id, kind, charges: FORTIFICATIONS.mud.charges, insideIds: [] }
      )
      this.save.gold -= FORTIFICATIONS[kind].cost
      fortifications.fortificationSpend += FORTIFICATIONS[kind].cost
    }
    this.interception.clear()
    return result
  }
  removeRoadItem(id: number): boolean {
    if (this.state.economyVersion !== 2 || this.state.phase !== 'preparation') return false
    const fortifications = this.state.fortifications!,
      item = fortifications.items.find((candidate) => candidate.id === id)
    if (!item) return false
    fortifications.items = fortifications.items.filter((candidate) => candidate !== item)
    this.interception.clear()
    return true
  }
  equipDefender(unitId: number, equipment: Equipment): boolean {
    const s = this.state,
      unit = findDefender(s, unitId)
    if (
      s.economyVersion !== 2 ||
      s.phase !== 'preparation' ||
      !unit ||
      unit.hp <= 0 ||
      (equipment !== 'weapon' && equipment !== 'armor') ||
      unit.equipment === equipment ||
      !canSpendOnRoster(this.save, FORTIFICATIONS.equipmentCost, s)
    )
      return false
    this.save.gold -= FORTIFICATIONS.equipmentCost
    s.fortifications!.gearSpend += FORTIFICATIONS.equipmentCost
    unit.equipment = equipment
    this.refreshDefender(unit)
    this.refreshHistory()
    return true
  }
  upgradeGate(kind: 'cannon' | 'armor'): boolean {
    const s = this.state
    if (s.economyVersion !== 2 || s.phase !== 'preparation' || (kind !== 'cannon' && kind !== 'armor')) return false
    const fortifications = s.fortifications!,
      gate = fortifications.gate,
      level = kind === 'cannon' ? gate.cannonLevel : gate.armorLevel,
      cost = FORTIFICATIONS[kind].costs[level]
    if (cost === undefined || !canSpendOnRoster(this.save, cost, s)) return false
    this.save.gold -= cost
    fortifications.fortificationSpend += cost
    if (kind === 'cannon') gate.cannonLevel++
    else gate.armorLevel++
    return true
  }
  previewPlacement(type: AllyType, point: Point, replaceSlotId?: number): GroundPlacement {
    if (!ALLY_TYPES.includes(type))
      return { point: point ?? { x: 0, y: 0 }, valid: false, reason: 'locked', reachesRoad: false }
    const result = previewGroundPlacement(
      this.state,
      type,
      point,
      this.state.economyVersion === 2 ? undefined : replaceSlotId
    )
    if (!availableAllies(this.save, this.state.stage).includes(type))
      return { ...result, valid: false, reason: 'locked' }
    if (this.state.economyVersion === 2) {
      if (this.state.units.some((unit) => unit.owner === 'player' && unit.type === type))
        return { ...result, valid: false, reason: 'duplicate' }
      const reserve = this.state.reserveUnits?.find((unit) => unit.type === type)
      if (reserve && reserve.hp <= 0) return { ...result, valid: false, reason: 'dead' }
      if (this.save.gold < DEPLOYMENT_COST) return { ...result, valid: false, reason: 'funds' }
      if (reserve) return this.withRedeploymentRange(result, reserve)
    }
    return result
  }
  previewRedeployment(unitId: number, point: Point): GroundPlacement {
    const unit = findDefender(this.state, unitId)
    if (!unit) return { point: point ?? { x: 0, y: 0 }, valid: false, reason: 'locked', reachesRoad: false }
    const result = previewGroundPlacement(this.state, unit.type as AllyType, point, unit.slotId)
    if (unit.hp <= 0) return { ...result, valid: false, reason: 'dead' }
    if (this.state.reserveUnits?.includes(unit) && this.save.gold < DEPLOYMENT_COST)
      return { ...result, valid: false, reason: 'funds' }
    return this.withRedeploymentRange(result, unit)
  }
  canRelocateDefender(unitId: number): boolean {
    const unit = this.state.units.find((candidate) => candidate.id === unitId && candidate.owner === 'player')
    return (
      !!unit &&
      this.state.phase === 'assault' &&
      unit.hp > 0 &&
      unit.battleRelocation?.usedStage !== this.state.stage &&
      DEFINITIONS[unit.type].leash > 0
    )
  }
  previewBattleRelocation(unitId: number, point: Point): GroundPlacement {
    const s = this.state,
      unit = s.units.find((candidate) => candidate.id === unitId && candidate.owner === 'player')
    if (!unit) return { point: point ?? { x: 0, y: 0 }, valid: false, reason: 'locked', reachesRoad: false }
    const result = previewGroundPlacement({ ...s, phase: 'preparation' }, unit.type as AllyType, point, unit.slotId)
    if (s.phase !== 'assault') return { ...result, valid: false, reason: 'phase' }
    if (unit.hp <= 0) return { ...result, valid: false, reason: 'dead' }
    if (unit.battleRelocation?.usedStage === s.stage) return { ...result, valid: false, reason: 'battle-used' }
    if (!result.valid) return result
    const anchor = unit.battleRelocation?.anchor ?? { x: unit.homeX, y: unit.homeY }
    if (Math.hypot(point.x - anchor.x, point.y - anchor.y) > DEFINITIONS[unit.type].leash + 1e-9)
      return { ...result, valid: false, reason: 'battle-range' }
    if (
      Math.hypot(point.x - unit.homeX, point.y - unit.homeY) < 0.001 ||
      Math.hypot(point.x - unit.x, point.y - unit.y) < 0.001
    )
      return { ...result, valid: false, reason: 'same-home' }
    if (!this.defenderRoute(unit, [point], anchor).length) return { ...result, valid: false, reason: 'no-route' }
    return result
  }
  relocateDefender(unitId: number, point: Point): boolean {
    if (!this.previewBattleRelocation(unitId, point).valid) return false
    const unit = this.state.units.find((candidate) => candidate.id === unitId)!,
      anchor = unit.battleRelocation?.anchor ?? { x: unit.homeX, y: unit.homeY },
      waypoints = this.defenderRoute(unit, [point], anchor)
    unit.battleRelocation = {
      anchor: { ...anchor },
      usedStage: this.state.stage,
      destination: { ...point },
      waypoints
    }
    this.defenderDetours.delete(unit.id)
    this.failedDefenderDetours.delete(unit.id)
    this.interception.clear()
    return true
  }
  private withRedeploymentRange(result: GroundPlacement, unit: Unit): GroundPlacement {
    if (
      result.valid &&
      this.state.economyVersion === 2 &&
      unit.hasFought &&
      unit.redeployAnchor &&
      Math.hypot(result.point.x - unit.redeployAnchor.x, result.point.y - unit.redeployAnchor.y) >
        REDEPLOY_RADIUS[unit.type as AllyType] + 1e-9
    )
      return { ...result, valid: false, reason: 'redeploy-range' }
    return result
  }
  place(type: AllyType, target: number | Point): boolean {
    const s = this.state
    const occupied =
      typeof target === 'number' ? s.units.find((unit) => unit.owner === 'player' && unit.slotId === target) : undefined
    const point =
      typeof target === 'number'
        ? occupied
          ? { x: occupied.homeX, y: occupied.homeY }
          : fieldFor(s).slots.find((slot) => slot.id === target)
        : target
    if (!point || !this.previewPlacement(type, point, occupied?.slotId).valid) return false
    if (s.economyVersion === 2) {
      const reserve = s.reserveUnits!.find((unit) => unit.type === type),
        unit = reserve ?? this.createUnit('player', type, { ...point, id: -(this.id + 1) })
      unit.slotId = -unit.id
      this.setDefenderHome(unit, point)
      s.reserveUnits = s.reserveUnits!.filter((candidate) => candidate !== unit)
      s.units.push(unit)
      this.save.gold -= DEPLOYMENT_COST
      this.history.change(s, 'addition', unit)
      this.refreshHistory()
      return true
    }
    const slotId = typeof target === 'number' ? target : -(this.id + 1)
    s.units = s.units.filter((unit) => unit !== occupied)
    if (occupied) this.history.change(s, 'removal', occupied)
    const unit = this.createUnit('player', type, { ...point, id: slotId })
    s.units.push(unit)
    this.history.change(s, 'addition', unit)
    this.refreshHistory()
    return true
  }
  remove(slotId: number): void {
    if (this.state.phase !== 'preparation') return
    const unit = this.state.units.find((u) => u.owner === 'player' && u.slotId === slotId)
    if (this.state.economyVersion === 2) {
      if (unit) this.recallDefender(unit.id)
      return
    }
    if (unit) this.history.change(this.state, 'removal', unit)
    this.state.units = this.state.units.filter((u) => u !== unit)
    this.refreshHistory()
  }
  moveDefender(unitId: number, point: Point): boolean {
    const unit = this.state.units.find((candidate) => candidate.owner === 'player' && candidate.id === unitId)
    if (!unit || !this.previewRedeployment(unitId, point).valid) return false
    if (unit.homeX === point.x && unit.homeY === point.y) return true
    this.history.change(this.state, 'removal', unit)
    this.setDefenderHome(unit, point)
    this.defenderDetours.delete(unit.id)
    this.failedDefenderDetours.delete(unit.id)
    this.history.change(this.state, 'addition', unit)
    this.refreshHistory()
    return true
  }
  recallDefender(unitId: number): boolean {
    const s = this.state,
      unit = s.units.find((candidate) => candidate.owner === 'player' && candidate.id === unitId)
    if (s.economyVersion !== 2 || s.phase !== 'preparation' || !unit || unit.hp <= 0) return false
    this.history.change(s, 'removal', unit)
    s.units = s.units.filter((candidate) => candidate !== unit)
    delete unit.slotId
    s.reserveUnits!.push(unit)
    this.save.gold += DEPLOYMENT_COST
    this.defenderDetours.delete(unit.id)
    this.failedDefenderDetours.delete(unit.id)
    this.refreshHistory()
    return true
  }
  upgradeDefender(unitId: number): boolean {
    const s = this.state,
      unit = findDefender(s, unitId)
    if (s.economyVersion !== 2 || s.phase !== 'preparation' || !unit || unit.hp <= 0) return false
    const level = defenderLevel(unit, this.save),
      cost = upgradeCost(level)
    if (!canSpendOnRoster(this.save, cost, s)) return false
    this.save.gold -= cost
    unit.level = level + 1
    this.refreshDefender(unit)
    this.refreshHistory()
    return true
  }
  private setDefenderHome(unit: Unit, point: Point): void {
    unit.x = unit.homeX = point.x
    unit.y = unit.homeY = point.y
    unit.attackTargetX = point.x
    unit.attackTargetY = point.y
    unit.moving = false
    const facing = entranceFacing(this.state.fieldId, point, this.state.battlefieldVersion, this.state.layoutRevision)
    unit.facingX = facing.x
    unit.facingY = facing.y
  }
  private refreshDefender(unit: Unit): void {
    const stats = combatStats(unit, this.state.stage, defenderLevel(unit, this.save)),
      healthFraction = unit.hp / unit.maxHp
    if (stats.attack > unit.attack && this.state.units.includes(unit))
      this.history.change(this.state, 'upgrade', unit, canInitiateDamage(unit) ? stats.attack - unit.attack : 0)
    unit.hp =
      this.state.economyVersion === 2
        ? unit.maxHp === stats.maxHp
          ? unit.hp
          : healthFraction * stats.maxHp
        : stats.maxHp
    unit.maxHp = stats.maxHp
    unit.attack = stats.attack
  }
  refreshDefenders(): void {
    if (this.state.phase !== 'preparation') return
    for (const unit of retainedDefenders(this.state)) this.refreshDefender(unit)
    this.refreshHistory()
  }
  startAssault(): boolean {
    if (
      this.state.phase !== 'preparation' ||
      !this.state.units.some((u) => u.owner === 'player' && (this.state.economyVersion !== 2 || u.hp > 0))
    )
      return false
    if (this.state.economyVersion === 2)
      for (const unit of this.state.units.filter((candidate) => candidate.owner === 'player')) {
        if (!unit.hasFought) unit.redeployAnchor = { x: unit.homeX, y: unit.homeY }
        unit.hasFought = true
      }
    for (const unit of this.state.units.filter((candidate) => candidate.owner === 'player'))
      unit.battleRelocation = { anchor: { x: unit.homeX, y: unit.homeY } }
    this.state.phase = 'assault'
    this.unavailableReason = null
    this.state.decisionStatus = '判断待ち'
    return true
  }
  nextStage(): boolean {
    const s = this.state
    if (s.phase !== 'cleared' || s.stage >= CONFIG.stages) return false
    this.invalidateAI()
    s.previousStageSummary = { ...s.stageSummary }
    this.interception.clear()
    this.defenderDetours.clear()
    this.failedDefenderDetours.clear()
    this.combatSounds = []
    s.stage++
    s.waveBossPolicy = 2
    s.phase = 'preparation'
    s.result = null
    s.time = 0
    if (s.commanderSupportVersion === 1) s.commanderSupport = freshCommanderSupport()
    this.history.reset(s)
    s.enemiesSpawned = s.enemiesResolved = s.budgetSpent = s.nextSpawnAt = 0
    s.playerBaseHp = CONFIG.baseHp
    s.cooldowns = emptyCooldowns()
    s.pendingSpawns = []
    s.reservedBudget = 0
    s.strategy = null
    s.recentOutcomes = []
    s.stageSummary = {
      stage: s.stage,
      spawned: 0,
      resolved: 0,
      maxProgress: 0,
      baseDamage: 0,
      defenderDamage: 0
    }
    this.deploymentByUnit.clear()
    this.lastDeploymentAt = -Infinity
    s.attacks = []
    if (s.fortifications) {
      s.fortifications.gate.shots = []
      s.fortifications.gate.sequence = 0
      for (const item of s.fortifications.items) if (item.kind === 'mud') item.insideIds = []
    }
    s.corpses = []
    s.sandbagStock = Math.min(CONFIG.stages - s.sandbags.length, s.sandbagStock + 1)
    s.lastAction = s.requestedAction = null
    s.decisionTime = 0
    s.decisionStatus = '準備中'
    this.accumulator = 0
    s.units = s.units.filter((u) => u.owner === 'player')
    this.refreshDefenders()
    for (const u of retainedDefenders(s)) {
      delete u.supportBuff
      if (u.battleRelocation?.destination && previewGroundPlacement(s, u.type as AllyType, u, u.slotId).valid)
        this.setDefenderHome(u, { x: u.x, y: u.y })
      delete u.battleRelocation
      u.hp = u.maxHp
      if (s.economyVersion === 2) u.redeployAnchor = { x: u.homeX, y: u.homeY }
      u.x = u.homeX
      u.y = u.homeY
      u.moving = false
      const facing = entranceFacing(s.fieldId, u, s.battlefieldVersion, s.layoutRevision)
      u.facingX = facing.x
      u.facingY = facing.y
      u.travelled = 0
      u.attackAnimation = u.hitAnimation = u.attackCooldown = 0
      // Support cooldown survives a stage boundary; preparation never grants a free heal.
      u.attackSequence = u.attackStartedAt = 0
      u.attackTargetX = u.homeX
      u.attackTargetY = u.homeY
      u.returnHomeAt = 0
      u.slowUntil = 0
      u.slowFactor = 1
    }
    this.refreshHistory()
    return true
  }
  private createUnit(owner: Owner, type: UnitType, slot?: Point & { id: number }, boss = false): Unit {
    const d = DEFINITIONS[type],
      stats = combatStats(
        { owner, type, boss },
        this.state.stage,
        this.save.economyVersion === 2 ? 1 : this.save.unitLevels[type as AllyType]
      )
    const p = slot ?? fieldFor(this.state).path[0],
      hp = stats.maxHp,
      facing =
        owner === 'player'
          ? entranceFacing(this.state.fieldId, p, this.state.battlefieldVersion, this.state.layoutRevision)
          : { x: 0, y: 1 }
    return {
      ...(owner === 'player' && this.state.economyVersion === 2
        ? { level: 1, hasFought: false, redeployAnchor: { x: p.x, y: p.y } }
        : {}),
      id: ++this.id,
      owner,
      type,
      slotId: slot?.id,
      x: p.x,
      y: p.y,
      homeX: p.x,
      homeY: p.y,
      progress: 0,
      travelled: 0,
      hp,
      maxHp: hp,
      attack: stats.attack,
      speed: owner === 'player' ? (type === 'tank' ? TANK_GUARD.moveSpeed : 52) : d.speed * (boss ? 0.8 : 1),
      attackRange: stats.range,
      attackSpeed: d.attackSpeed,
      attackCooldown: 0,
      ...(healingAction({ owner, type }) ? { healCooldown: 0 } : {}),
      attackAnimation: 0,
      attackSequence: 0,
      attackStartedAt: 0,
      hitAnimation: 0,
      attackTargetX: p.x,
      attackTargetY: p.y,
      moving: false,
      facingX: facing.x,
      facingY: facing.y,
      boss,
      slowUntil: 0,
      slowFactor: 1
    }
  }
  applyAIAction(action: unknown, currentJevRecovery = false): boolean {
    const s = this.state
    if (s.cooldownHold && !currentJevRecovery) return false
    if (!isAction(action) || s.phase !== 'assault' || s.result) return false
    if (s.pendingSpawns.length || !getLegalAIActions(s).some((a) => actionKey(a) === actionKey(action))) return false
    this.unavailableReason = null
    s.commanderOrder = null
    this.decisionRevision++
    s.decisionTrace = null
    const id = ++this.deploymentSequence,
      option = tacticalOption(s, action)
    s.strategy = {
      id,
      actionKey: option.key,
      label: option.label,
      reason: option.reason,
      startedAt: s.time,
      expiresAt: s.time + (action.type === 'wait' ? CONFIG.waitPlanLifetime : option.lifetime),
      status: 'executing',
      reconsideration: null
    }
    this.planDefenders = observeDefense(s).livingDefenders
    this.planBaseHp = s.playerBaseHp
    const members = actionMembers(action)
    this.history.accept(s, id, action)
    if (members.length) {
      s.recentOutcomes.push({
        id,
        stage: s.stage,
        actionKey: actionKey(action),
        spawned: 0,
        resolved: 0,
        maxProgress: 0,
        baseDamage: 0,
        defenderDamage: 0,
        cancelled: 0
      })
      s.recentOutcomes = s.recentOutcomes.slice(-4)
    }
    const routeId = s.battlefieldVersion === 2 && action.type !== 'wait' ? action.routeId : undefined,
      targetId = s.battlefieldVersion === 2 && action.type === 'spawn' && !action.boss ? action.targetId : undefined,
      flightTarget = s.units.find((unit) => unit.id === targetId && unit.owner === 'player' && unit.hp > 0),
      returnProgress = flightTarget ? physicalProjectionOnRoute(fieldFor(s), routeId, flightTarget).progress : undefined
    s.pendingSpawns = members.map((member) => ({
      deploymentId: id,
      ...(routeId === undefined ? {} : { routeId }),
      ...(targetId === undefined ? {} : { targetId, returnProgress }),
      unitType: member.unitType,
      boss: member.boss,
      spawnAt: s.time + member.delay,
      cost: member.boss ? 5 : DEFINITIONS[member.unitType].cost,
      previousCooldownUntil: s.time + s.cooldowns[member.unitType]
    }))
    s.reservedBudget = s.pendingSpawns.reduce((sum, member) => sum + member.cost, 0)
    s.budgetSpent += s.reservedBudget
    for (const member of s.pendingSpawns)
      s.cooldowns[member.unitType] = member.spawnAt - s.time + deploymentCooldown(member.unitType, s.stage)
    if (s.pendingSpawns.length)
      s.nextSpawnAt =
        s.pendingSpawns[s.pendingSpawns.length - 1].spawnAt + stageRules(s.stage, s.waveBossPolicy).spawnInterval
    this.executePendingSpawns()
    this.refreshHistory()
    return true
  }
  private executePendingSpawns(): void {
    const s = this.state
    while (s.pendingSpawns.length && s.pendingSpawns[0].spawnAt <= s.time + 1e-9) {
      if (
        s.phase !== 'assault' ||
        s.result ||
        s.units.length >= CONFIG.maxUnits ||
        s.enemiesSpawned >= stageRules(s.stage, s.waveBossPolicy).enemyCount
      ) {
        this.interruptPlan('出撃条件の変化')
        return
      }
      const member = s.pendingSpawns.shift()!,
        unit = this.createUnit('ai', member.unitType, undefined, member.boss)
      if (s.battlefieldVersion === 2) {
        unit.routeId = member.routeId
        if (
          !member.boss &&
          member.targetId !== undefined &&
          member.returnProgress !== undefined &&
          isAirborneEnemy(unit.type) &&
          s.units.some((target) => target.id === member.targetId && target.owner === 'player' && target.hp > 0)
        )
          unit.flight = {
            targetId: member.targetId,
            returnProgress: member.returnProgress,
            phase: 'approach'
          }
      }
      s.units.push(unit)
      this.deploymentByUnit.set(unit.id, member.deploymentId)
      this.history.spawn(s, member.deploymentId, unit)
      this.lastDeploymentAt = s.time
      s.enemiesSpawned++
      s.stageSummary.spawned++
      s.reservedBudget -= member.cost
      const outcome = s.recentOutcomes.find((value) => value.id === member.deploymentId)
      if (outcome) outcome.spawned++
    }
    if (!s.pendingSpawns.length && s.strategy?.status === 'executing') s.strategy.status = 'observing'
  }
  private updatePlan(): void {
    const s = this.state,
      plan = s.strategy,
      hold = s.cooldownHold
    if (hold) {
      if (s.phase !== 'assault' || s.result || hold.stage !== s.stage || hold.fieldId !== s.fieldId) {
        delete s.cooldownHold
        s.decisionTrace = null
        this.ai.cancelDeployment?.()
      } else if (hold.phase === 'cooling') {
        const reasons = deploymentBlockReasons(s, hold.action)
        if (!reasons.length) {
          // Simulation cooldown, never a wall-clock/one-second expiry.
          if (plan) plan.expiresAt = s.time + s.cooldowns[hold.action.unitType]
          return
        }
        const ready = reasons.length === 1 && reasons[0].code === 'cooldown-ready'
        hold.phase = ready ? 'ready' : 'invalidated'
        if (plan) {
          plan.status = ready ? 'completed' : 'interrupted'
          plan.reconsideration = ready ? '対象の出撃CDが回復' : '対象の出撃条件の変化'
        }
        s.commanderOrder = null
        s.decisionTrace = null
        if (ready) {
          this.ai.releaseCooldown?.(s, hold.action, !this.restoredCooldownHold)
          this.nextDecisionAt = this.now()
        } else this.ai.cancelDeployment?.()
        return
      } else return
    }
    if (!plan || (plan.status !== 'executing' && plan.status !== 'observing')) return
    if (plan.actionKey.startsWith('wait:')) {
      const [, unitType, boss] = plan.actionKey.split(':'),
        action = { type: 'wait', unitType, boss: boss === '1' }
      if (isAction(action)) {
        const reasons = deploymentBlockReasons(s, action)
        if (reasons.length) {
          const ready = reasons.length === 1 && reasons[0].code === 'cooldown-ready'
          plan.status = ready ? 'completed' : 'interrupted'
          plan.reconsideration = ready ? '対象の出撃CDが回復' : '対象の出撃条件の変化'
          s.commanderOrder = null
          return
        }
      }
    }
    if (s.units.filter((unit) => unit.owner === 'player' && unit.hp > 0).length !== this.planDefenders)
      this.interruptPlan('防衛編成の変化')
    else if (this.planBaseHp - s.playerBaseHp >= 10) this.interruptPlan('拠点への有効打')
    else if (s.time + 1e-9 >= plan.expiresAt) {
      plan.status = 'completed'
      plan.reconsideration = '作戦時間の終了'
    }
  }
  private publishObservation(now: number): void {
    if (!this.ai.observe || this.pending || this.observing || now < this.nextObservationAt) return
    this.nextObservationAt = now + 1000
    this.observing = true
    const ai = this.ai,
      snapshot = structuredClone(this.state)
    void Promise.resolve()
      .then(() => ai.observe?.(snapshot))
      .catch(() => {})
      .finally(() => {
        this.observing = false
      })
  }
  update(dt: number, canAdvance: (state: Readonly<GameState>) => boolean = () => true): void {
    const s = this.state
    if (!Number.isFinite(dt) || dt <= 0 || s.phase !== 'assault') return
    this.accumulator += Math.min(dt, 0.25)
    while (this.accumulator >= CONFIG.step && s.phase === 'assault') {
      if (!canAdvance(s)) {
        this.accumulator = 0
        return
      }
      this.step(CONFIG.step)
      this.accumulator -= CONFIG.step
    }
    this.refreshHistory()
    const now = this.now()
    this.updateCommanderSupport(now)
    this.updatePlan()
    if (s.phase !== 'assault') return
    if (s.cooldownHold?.phase === 'cooling') {
      this.publishObservation(now)
      return
    }
    if (now < this.nextDecisionAt) {
      this.publishObservation(now)
      return
    }
    // One boundary per update: a suspended tab never replays missed slots.
    this.nextDecisionAt = now + CONFIG.decisionInterval * 1000
    const slot = ++this.decisionSlot
    this.pending = null
    // Cards belong only to this decision cycle; a Rule slot cannot retain Jev evidence.
    s.decisionTrace = null
    s.commanderOrder = null
    this.ai.advanceDeployment?.()
    const legalActions = getLegalAIActions(s)
    if (s.pendingSpawns.length || !legalActions.length) {
      if (!s.pendingSpawns.length) s.decisionStatus = noDecisionStatus('no-legal-actions')
      this.publishObservation(now)
      return
    }
    this.nextObservationAt = now + 1000
    this.pending = slot
    this.unavailableReason = null
    const generation = this.generation,
      revision = this.decisionRevision,
      ai = this.ai
    let snapshot = structuredClone(s)
    const captureRequest = (state: Readonly<GameState>) =>
      Object.freeze({
        at: state.time,
        stage: state.stage,
        fieldId: state.fieldId,
        revision,
        legalActions: Object.freeze(getLegalAIActions(state).map((action) => Object.freeze({ ...action }))),
        cooldowns: Object.freeze({ ...state.cooldowns }),
        ...(state.battlefieldVersion === 2
          ? {
              flightTargets: Object.freeze(
                directFlightTargets(state).map(({ id, type }) => Object.freeze({ id, type: type as AllyType }))
              )
            }
          : {})
      })
    let request: DirectorDecisionTrace['request'] = captureRequest(snapshot)
    const identityIsCurrent = () =>
      this.pending === slot &&
      slot === this.decisionSlot &&
      generation === this.generation &&
      revision === this.decisionRevision &&
      ai === this.ai &&
      s.phase === 'assault' &&
      !s.result &&
      s.stage === request.stage &&
      s.fieldId === request.fieldId &&
      s.battlefieldVersion === snapshot.battlefieldVersion &&
      s.layoutRevision === snapshot.layoutRevision &&
      s.time >= request.at
    const decisionIsCurrent = () => identityIsCurrent() && this.now() < this.nextDecisionAt
    const unavailable = (reason: AINoDecisionReason) => {
      this.unavailableReason = reason
      s.decisionStatus = noDecisionStatus(reason)
    }
    s.decisionStatus = '判断中'
    void Promise.resolve()
      .then(() => (decisionIsCurrent() ? ai.decide(snapshot, request) : undefined))
      .catch(() => ({ type: 'unavailable' as const, reason: 'error' as const, source: 'controller' }))
      .then(async (decision) => {
        if (!decisionIsCurrent()) return decision
        if ((!decision || isNoDecision(decision)) && ai.fallback && !s.cooldownHold) {
          // Prompt failure consumes this slot once using the then-current board.
          // No stale Jev score, target or snapshot participates in the fallback.
          snapshot = structuredClone(s)
          request = captureRequest(snapshot)
          return ai.fallback(snapshot)
        }
        return decision
      })
      .then(async (decision) => {
        if (!identityIsCurrent()) return
        if (!decisionIsCurrent()) {
          s.decisionStatus = ai.claimDecision ? '次の判断枠で再確認' : '期限切れの判断を破棄'
          return
        }
        if (!decision) {
          unavailable('unavailable')
          return
        }
        if (isNoDecision(decision)) {
          unavailable(decision.reason)
          return
        }
        // Claim at the application boundary, not when the HTTP response arrives.
        // This single receipt covers both the original promise and later buffer
        // delivery; accepted evidence retains the original request-time context.
        const claim = ai.claimDecision?.(decision, s)
        if (claim === null) {
          if (!ai.fallback || s.cooldownHold) {
            unavailable('unavailable')
            return
          }
          snapshot = structuredClone(s)
          request = captureRequest(snapshot)
          decision = await ai.fallback(snapshot)
          if (!decisionIsCurrent() || !decision || isNoDecision(decision)) return
        } else if (claim?.request) request = claim.request
        // Director checks both offered and currently legal actions before drawing.
        // Pending reservations also forbid a draw or replacing their display plan.
        if (s.pendingSpawns.length) return
        if (s.cooldownHold && (!('action' in decision) || decision.source !== 'jev' || !request.jevRequestId)) {
          unavailable('unavailable')
          return
        }
        // A current, originally legal wait can finish during transport latency.
        // Complete that hold, never reinterpret the stale wait as a Rule spawn.
        if (
          request.jevRequestId &&
          'action' in decision &&
          decision.source === 'jev' &&
          decision.action.type === 'wait'
        ) {
          const action = decision.action,
            reasons = deploymentBlockReasons(s, action)
          if (
            request.legalActions.some((offered) => actionKey(offered) === actionKey(action)) &&
            reasons.length === 1 &&
            reasons[0].code === 'cooldown-ready'
          ) {
            this.decisionRevision++
            const option = tacticalOption(s, action)
            s.strategy = {
              id: ++this.deploymentSequence,
              actionKey: option.key,
              label: option.label,
              reason: option.reason,
              startedAt: s.time,
              expiresAt: s.time + CONFIG.waitPlanLifetime,
              status: 'completed',
              reconsideration: '対象の出撃CDが回復'
            }
            s.cooldownHold = {
              action: { ...action },
              phase: 'ready',
              stage: s.stage,
              fieldId: s.fieldId,
              startedAt: s.time
            }
            this.restoredCooldownHold = false
            s.commanderOrder = null
            s.decisionTrace = null
            s.decisionStatus = 'CD回復 · Jev再判断'
            ai.releaseCooldown?.(s, action, true)
            this.nextDecisionAt = this.now()
            return
          }
        }
        const selection = selectDirectorDecision(s, decision, this.random.next, request.legalActions)
        if (
          selection &&
          this.applyAIAction(
            selection.applied,
            !!request.jevRequestId && 'action' in decision && decision.source === 'jev'
          )
        ) {
          const { requested, applied: action } = selection
          if (request.jevRequestId && 'action' in decision && decision.source === 'jev') {
            if (action.type === 'wait') {
              s.cooldownHold = {
                action: { ...action },
                phase: 'cooling',
                stage: s.stage,
                fieldId: s.fieldId,
                startedAt: s.time
              }
              if (s.strategy) s.strategy.expiresAt = s.time + s.cooldowns[action.unitType]
              this.restoredCooldownHold = false
              ai.cancelDeployment?.()
            } else delete s.cooldownHold
          }
          s.requestedAction = { ...requested }
          s.lastAction = { ...action }
          s.commanderOrder = Object.freeze({
            revision: this.decisionRevision,
            acceptedAt: s.time,
            stage: s.stage,
            fieldId: s.fieldId,
            source:
              'action' in decision && typeof decision.source === 'string' ? decision.source.slice(0, 80) : 'unknown',
            requested: Object.freeze({ ...requested }),
            applied: Object.freeze({ ...action })
          })
          s.decisionTrace = Object.freeze({ ...s.commanderOrder, ...selection, request })
          s.decisionTime = s.time
          s.decisionStatus = actionLabel(action)
        } else s.decisionStatus = '期限切れの判断を破棄'
      })
      .catch(() => {
        if (decisionIsCurrent()) unavailable('error')
      })
      .finally(() => {
        // An expired promise must not clear a newer request's ownership.
        if (this.pending === slot) this.pending = null
      })
  }

  applySupportAction(action: SupportAction): boolean {
    const s = this.state,
      support = s.commanderSupport
    if (
      this.controller.supportEnabled !== true ||
      !this.controller.decideSupport ||
      !support ||
      !isLegalSupportAction(s, action)
    )
      return false
    const target = s.units.find((unit) => unit.id === action.targetId)!
    support.sequence++
    support.cast = {
      id: `${s.stage}:support:${support.sequence}`,
      sequence: support.sequence,
      stage: s.stage,
      fieldId: s.fieldId,
      action: { ...action },
      startedAt: s.time,
      applyAt: s.time + COMMANDER_SUPPORT.castSeconds,
      target: { id: target.id, type: target.type as EnemyType, x: target.x, y: target.y },
      source: 'jev'
    }
    support.nextReadyAt = s.time + COMMANDER_SUPPORT.cooldown
    support.retryAt = 0
    support.status = 'casting'
    support.reason = null
    return true
  }
  private updateCommanderSupport(now: number): void {
    const s = this.state,
      support = s.commanderSupport,
      controller = this.controller
    if (s.commanderSupportVersion !== 1 || !support) return
    if (controller.supportEnabled !== true || !controller.decideSupport) {
      support.status = 'disabled'
      return
    }
    if (support.cast) {
      support.status = 'casting'
      return
    }
    if (s.time + 1e-9 < support.nextReadyAt) {
      support.status = support.sequence ? 'cooldown' : 'waiting'
      return
    }
    if (this.supportPending || now < this.nextSupportRequestAt || s.time + 1e-9 < support.retryAt) return
    const actions = getLegalSupportActions(s)
    if (!actions.length) {
      support.status = 'ready'
      support.reason = 'no-legal-actions'
      return
    }
    const token = ++this.supportRequest,
      generation = this.generation,
      stage = s.stage,
      fieldId = s.fieldId,
      snapshot = structuredClone(s),
      offered = new Set(actions.map(supportActionKey))
    const current = () =>
      this.supportPending === token &&
      generation === this.generation &&
      controller === this.controller &&
      controller.supportEnabled === true &&
      s.phase === 'assault' &&
      s.stage === stage &&
      s.fieldId === fieldId &&
      s.battlefieldVersion === snapshot.battlefieldVersion &&
      s.layoutRevision === snapshot.layoutRevision
    const unavailable = (reason: SupportUnavailableReason) => {
      support.status = 'unavailable'
      support.reason = reason
      support.retryAt = s.time + COMMANDER_SUPPORT.retrySeconds
      this.nextSupportRequestAt = Math.max(this.nextSupportRequestAt, this.now() + COMMANDER_SUPPORT.requestIntervalMs)
    }
    this.supportPending = token
    this.nextSupportRequestAt = now + COMMANDER_SUPPORT.requestIntervalMs
    support.status = 'requesting'
    support.reason = null
    void Promise.resolve()
      .then(() => (current() ? controller.decideSupport!(snapshot) : null))
      .then((result) => {
        if (!current()) return
        if (this.now() - now > COMMANDER_SUPPORT.maximumReplyAgeMs) {
          unavailable('stale')
          return
        }
        if (!result) {
          unavailable('unavailable')
          return
        }
        if ('type' in result) {
          unavailable(supportUnavailableReason(result.reason))
          return
        }
        if (
          result.source !== 'jev' ||
          !isLegalSupportAction(s, result.action) ||
          !offered.has(supportActionKey(result.action)) ||
          !this.applySupportAction(result.action)
        )
          unavailable('invalid')
      })
      .catch(() => {
        if (current()) unavailable('error')
      })
      .finally(() => {
        if (this.supportPending === token) this.supportPending = null
      })
  }
  private advanceRelocatingDefender(unit: Unit, dt: number): void {
    const relocation = unit.battleRelocation!
    let movement = effectiveSpeed(unit, this.state.time) * dt
    while (relocation.waypoints!.length && movement > 1e-9) {
      const next = relocation.waypoints![0],
        dx = next.x - unit.x,
        dy = next.y - unit.y,
        distance = Math.hypot(dx, dy),
        step = Math.min(movement, distance)
      if (distance > 1e-9) {
        unit.facingX = dx
        unit.facingY = dy
        unit.x += (dx / distance) * step
        unit.y += (dy / distance) * step
        unit.moving = true
      }
      movement -= step
      if (step + 1e-9 < distance) break
      unit.x = next.x
      unit.y = next.y
      relocation.waypoints!.shift()
    }
    if (!relocation.waypoints!.length) {
      this.history.change(this.state, 'removal', unit)
      unit.homeX = relocation.destination!.x
      unit.homeY = relocation.destination!.y
      delete relocation.destination
      delete relocation.waypoints
      this.interception.clear()
      this.history.change(this.state, 'addition', unit)
      this.refreshHistory()
    }
  }
  private advanceDefender(u: Unit, dt: number): void {
    if (u.battleRelocation?.destination) return this.advanceRelocatingDefender(u, dt)
    const d = DEFINITIONS[u.type],
      home = { x: u.homeX, y: u.homeY }
    if (Math.hypot(u.x - home.x, u.y - home.y) < 0.001) {
      const facing = entranceFacing(this.state.fieldId, home, this.state.battlefieldVersion, this.state.layoutRevision)
      u.facingX = facing.x
      u.facingY = facing.y
    }
    const interception = this.interception.resolve(this.state, u, {
      detour: (unit, point) => this.defenderDetour(unit, point)
    })
    const target = interception?.target
    const awayFromHome = Math.hypot(u.x - home.x, u.y - home.y) > 0.001
    if (u.type === 'tank' && awayFromHome) {
      if (target) u.returnHomeAt = Math.max(u.returnHomeAt ?? 0, this.state.time + TANK_GUARD.returnDelay)
      else if (this.state.time < (u.returnHomeAt ?? 0)) return
    }
    let route = this.defenderDetours.get(u.id)
    const goal = interception?.point ?? home
    if (interception) {
      const waypoints = interception.waypoints.map((point) => ({ ...point }))
      while (waypoints.length && Math.hypot(waypoints[0].x - u.x, waypoints[0].y - u.y) < 0.001) waypoints.shift()
      route = waypoints.length ? { targetId: target!.id, target: { ...goal }, waypoints } : undefined
      if (route) this.defenderDetours.set(u.id, route)
      else this.defenderDetours.delete(u.id)
    } else if (route?.targetId !== undefined) {
      this.defenderDetours.delete(u.id)
      route = undefined
    }
    while (route?.waypoints.length && Math.hypot(route.waypoints[0].x - u.x, route.waypoints[0].y - u.y) < 0.001)
      route.waypoints.shift()
    if (route && !route.waypoints.length) {
      this.defenderDetours.delete(u.id)
      route = undefined
    }
    const destination = route?.waypoints[0] ?? goal
    if (target && Math.hypot(destination.x - u.x, destination.y - u.y) < 0.001) {
      u.facingX = target.x - u.x
      u.facingY = target.y - u.y
      this.failedDefenderDetours.delete(u.id)
      return
    }
    const distance = Math.hypot(destination.x - u.x, destination.y - u.y)
    if (distance < 0.001) {
      const nearby = this.state.units
        .filter(
          (value) =>
            value.owner === 'ai' &&
            value.hp > 0 &&
            canTargetUnit(u, value, this.state.battlefieldVersion) &&
            attackContact(u, value, u.attackRange).inRange
        )
        .sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y) || a.id - b.id)[0]
      if (nearby) {
        u.facingX = nearby.x - u.x
        u.facingY = nearby.y - u.y
      }
      this.failedDefenderDetours.delete(u.id)
      return
    }
    const movement = Math.min(effectiveSpeed(u, this.state.time) * dt, distance),
      path = fieldFor(this.state).path,
      nearestRoad =
        this.state.battlefieldVersion === 2 ? nearestRoadEdge(fieldFor(this.state), u) : projectToPath(path, u),
      normal = { x: u.x - nearestRoad.x, y: u.y - nearestRoad.y },
      normalLength = Math.hypot(normal.x, normal.y),
      directions = [{ x: (destination.x - u.x) / distance, y: (destination.y - u.y) / distance }]
    if (normalLength > 0) {
      directions.push(
        { x: -normal.y / normalLength, y: normal.x / normalLength },
        { x: normal.y / normalLength, y: -normal.x / normalLength }
      )
    }
    const movementGoal = route ? destination : goal
    let candidate: Point = u,
      bestDistance = Math.hypot(movementGoal.x - u.x, movementGoal.y - u.y)
    for (const direction of directions) {
      const end = { x: u.x + direction.x * movement, y: u.y + direction.y * movement },
        fromHome = Math.hypot(end.x - home.x, end.y - home.y)
      if (fromHome > d.leash) {
        end.x = home.x + ((end.x - home.x) * d.leash) / fromHome
        end.y = home.y + ((end.y - home.y) * d.leash) / fromHome
      }
      let fraction = 1
      if (!this.clearDefenderStep(u, end)) {
        let low = 0,
          high = 1
        for (let iteration = 0; iteration < 16; iteration++) {
          const middle = (low + high) / 2,
            point = { x: u.x + (end.x - u.x) * middle, y: u.y + (end.y - u.y) * middle }
          if (this.clearDefenderStep(u, point)) low = middle
          else high = middle
        }
        fraction = low
      }
      const point = { x: u.x + (end.x - u.x) * fraction, y: u.y + (end.y - u.y) * fraction },
        remaining = Math.hypot(movementGoal.x - point.x, movementGoal.y - point.y)
      if (remaining + 1e-7 < bestDistance) {
        candidate = point
        bestDistance = remaining
      }
    }
    if (candidate === u && !route && !interception) {
      const failed = this.failedDefenderDetours.get(u.id)
      if (
        failed &&
        failed.targetId === target?.id &&
        Math.hypot(goal.x - failed.target.x, goal.y - failed.target.y) <= 16 &&
        this.state.time + 1e-9 < failed.retryAt
      )
        return
      const waypoints = this.defenderDetour(u, target)
      if (waypoints.length) {
        this.failedDefenderDetours.delete(u.id)
        this.defenderDetours.set(u.id, { targetId: target?.id, target: { x: goal.x, y: goal.y }, waypoints })
        this.advanceDefender(u, dt)
      } else
        this.failedDefenderDetours.set(u.id, {
          targetId: target?.id,
          target: { x: goal.x, y: goal.y },
          retryAt: this.state.time + 0.5
        })
      return
    }
    this.failedDefenderDetours.delete(u.id)
    u.facingX = candidate.x - u.x
    u.facingY = candidate.y - u.y
    u.moving = Math.hypot(u.facingX, u.facingY) > 1e-7
    u.x = candidate.x
    u.y = candidate.y
  }
  private defenderDetour(u: Unit, target?: Point): Point[] {
    const home = { x: u.homeX, y: u.homeY }
    const goals = target
      ? Array.from({ length: 16 }, (_, index) => ({
          x: target.x + Math.cos((index * Math.PI) / 8) * u.attackRange * 0.94,
          y: target.y + Math.sin((index * Math.PI) / 8) * u.attackRange * 0.94
        }))
      : [home]
    return this.defenderRoute(u, goals, home)
  }
  private defenderRoute(u: Unit, destinations: Point[], home: Point): Point[] {
    const leash = DEFINITIONS[u.type].leash,
      legal = (point: Point) =>
        Math.hypot(point.x - home.x, point.y - home.y) <= leash + 1e-9 &&
        clearInterceptionStep(this.state, point, point),
      ring = (center: Point, radius: number) =>
        Array.from({ length: 16 }, (_, index) => ({
          x: center.x + Math.cos((index * Math.PI) / 8) * radius,
          y: center.y + Math.sin((index * Math.PI) / 8) * radius
        })),
      goals = destinations.filter(legal)
    if (!goals.length) return []
    if (goals.length === 1 && this.clearDefenderStep(u, goals[0])) return [{ ...goals[0] }]
    const nodes: Point[] = [
        u,
        ...goals,
        ...allRoadPaths(fieldFor(this.state)).flatMap((path) =>
          path.flatMap((point) => ring(point, DEFENDER_ROAD_CLEARANCE / Math.cos(Math.PI / 16) + 0.01).filter(legal))
        ),
        ...fieldScenery(this.state.fieldId, this.state.battlefieldVersion, this.state.layoutRevision)
          .filter((item) => item.kind !== 'sprig')
          .flatMap((item) => ring(item, (item.radius + 18) / Math.cos(Math.PI / 16) + 0.01).filter(legal))
      ],
      costs = nodes.map(() => Infinity),
      previous = nodes.map(() => -1),
      visited = new Set<number>()
    costs[0] = 0
    while (visited.size < nodes.length) {
      let current = -1
      for (let index = 0; index < nodes.length; index++)
        if (!visited.has(index) && Number.isFinite(costs[index]) && (current < 0 || costs[index] < costs[current]))
          current = index
      if (current < 0) return []
      if (current > 0 && current <= goals.length) {
        const waypoints: Point[] = []
        while (current > 0) {
          waypoints.unshift(nodes[current])
          current = previous[current]
        }
        return waypoints
      }
      visited.add(current)
      for (let next = 1; next < nodes.length; next++) {
        if (visited.has(next)) continue
        const cost = costs[current] + Math.hypot(nodes[next].x - nodes[current].x, nodes[next].y - nodes[current].y)
        if (cost >= costs[next] || !this.clearDefenderStep(nodes[current], nodes[next])) continue
        costs[next] = cost
        previous[next] = current
      }
    }
    return []
  }
  private clearDefenderStep(start: Point, end: Point): boolean {
    return clearInterceptionStep(this.state, start, end)
  }
  private contactedSandbag(u: Unit) {
    const obstruction = nextRoadObstruction(this.state, u)
    const barrier = obstruction?.kind === 'sandbag' ? obstruction.barrier : undefined
    return barrier &&
      u.progress + 1e-9 >= barrier.progress - sandbagStandOff(u) &&
      attackContact(u, barrier, u.attackRange, 'sandbag').inRange
      ? barrier
      : undefined
  }
  private latchGateExit(unit: Unit | undefined, attack: CombatAttack): void {
    if (this.state.battlefieldVersion !== 2 || !unit || unit.owner !== 'ai' || unit.boss || unit.gateExit) return
    unit.gateExit = { attackId: attack.id, exitAt: Math.max(attack.endsAt, attack.impactAt) }
  }
  private recordCorpse(unit: Unit): void {
    const s = this.state
    if (s.corpses.some((corpse) => corpse.id === unit.id)) return
    if (s.corpses.length >= stageRules(s.stage, s.waveBossPolicy).enemyCount + CONFIG.stages) return
    const attack = s.attacks.find(
      (value) =>
        value.attackerId === unit.id &&
        value.sequence === unit.attackSequence &&
        s.time + 1e-9 < value.endsAt &&
        (value.status !== 'cancelled' || unit.owner === 'ai')
    )
    const facing = attack?.aim ?? { x: unit.facingX, y: unit.facingY }
    const direction = facing.x === 0 && facing.y === 0 ? 2 : Math.round(Math.atan2(facing.y, facing.x) / (Math.PI / 4))
    s.corpses = [
      ...s.corpses,
      Object.freeze({
        id: unit.id,
        key: `${s.battleId}:${s.fieldId}:${s.stage}:${unit.id}`,
        owner: unit.owner,
        type: unit.type,
        boss: unit.boss,
        x: unit.x,
        y: unit.y,
        facingX: Math.round(Math.cos(direction * (Math.PI / 4))) || 0,
        facingY: Math.round(Math.sin(direction * (Math.PI / 4))) || 0,
        diedAt: s.time,
        activePose: !!attack || unit.moving,
        fieldId: s.fieldId,
        stage: s.stage
      })
    ]
  }
  private cancelGateWindups(): void {
    for (const shot of this.state.fortifications?.gate.shots ?? [])
      if (shot.status === 'windup') shot.status = 'cancelled'
  }
  private advanceGateShots(damage: Map<number, number>, contributions: DamageContribution[]): void {
    const s = this.state,
      gate = s.economyVersion === 2 ? s.fortifications?.gate : undefined
    if (!gate) return
    gate.shots = gate.shots.filter((shot) => s.time < shot.impactAt + 0.15)
    if (
      gate.cannonLevel > 0 &&
      gate.cooldown <= 0 &&
      s.playerBaseHp > 0 &&
      gate.shots.length < FORTIFICATIONS.cannon.maxShots
    ) {
      const base = fieldFor(s).gate,
        target = s.units
          .filter(
            (unit) =>
              unit.owner === 'ai' &&
              unit.hp > 0 &&
              Math.hypot(unit.x - base.x, unit.y - base.y) <= FORTIFICATIONS.cannon.range
          )
          .sort(
            (a, b) =>
              Number(b.boss) - Number(a.boss) ||
              Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y) ||
              a.id - b.id
          )[0]
      if (target) {
        gate.sequence++
        gate.cooldown = FORTIFICATIONS.cannon.interval
        gate.shots.push({
          id: `gate:${gate.sequence}`,
          sequence: gate.sequence,
          targetId: target.id,
          power: 0,
          startedAt: s.time,
          releaseAt: s.time + FORTIFICATIONS.cannon.windup,
          impactAt: s.time + FORTIFICATIONS.cannon.windup + FORTIFICATIONS.cannon.flight,
          status: 'windup',
          origin: gateMuzzle(s),
          target: { x: target.x, y: target.y }
        })
      }
    }
    for (const shot of gate.shots) {
      if (shot.status !== 'windup' && shot.status !== 'released') continue
      const target = s.units.find((unit) => unit.id === shot.targetId && unit.owner === 'ai' && unit.hp > 0)
      if (target) shot.target = { x: target.x, y: target.y }
      if (shot.status === 'windup') {
        if (s.time + 1e-9 < shot.releaseAt) continue
        if (!target || s.playerBaseHp <= 0) {
          shot.status = 'cancelled'
          continue
        }
        shot.power = FORTIFICATIONS.cannon.damage[gate.cannonLevel - 1]
        shot.status = 'released'
        this.emitGateSound(shot)
      }
      if (s.time + 1e-9 < shot.impactAt) continue
      shot.status = target ? 'hit' : 'missed'
      if (target) {
        const amount = incomingDamage(shot.power, target, s.time, 'physical')
        damage.set(target.id, (damage.get(target.id) ?? 0) + amount)
        contributions.push({
          targetId: target.id,
          sourceId: 0,
          sourceType: 'gate',
          attackId: shot.id,
          amount,
          area: false
        })
      }
    }
  }
  private emitGateSound(shot: GateShot): void {
    const { battleId, stage } = this.state
    this.combatSounds.push({
      id: `${battleId}:${stage}:${shot.id}:release`,
      attackId: shot.id,
      attackerId: 0,
      unitType: 'cannon',
      kind: 'release',
      at: shot.releaseAt,
      battleId,
      stage
    })
    if (this.combatSounds.length > COMBAT_SOUND_QUEUE_LIMIT) this.combatSounds.shift()
  }
  private step(dt: number): void {
    const s = this.state,
      field = fieldFor(s),
      base = field.path[field.path.length - 1]
    for (const unit of s.units) if (unit.hp <= 0) this.recordCorpse(unit)
    s.time += dt
    const supportCast = s.commanderSupport?.cast
    advanceCommanderSupport(s)
    const supportEvent = s.commanderSupport?.history.at(-1)
    if (
      supportCast &&
      supportEvent?.id === supportCast.id &&
      supportEvent.outcome === 'applied' &&
      supportEvent.amount > 0
    )
      this.emitEffectSound(
        supportEvent.id,
        supportEvent.action.targetId,
        'commander',
        `support_${supportEvent.action.effect}_apply`
      )
    for (const cache of [this.defenderDetours, this.failedDefenderDetours])
      for (const id of cache.keys()) if (!s.units.some((unit) => unit.id === id && unit.hp > 0)) cache.delete(id)
    s.sandbags = s.sandbags.filter((bag) => bag.hp > 0)
    pruneMudOccupants(s)
    if (s.fortifications) s.fortifications.gate.cooldown = Math.max(0, s.fortifications.gate.cooldown - dt)
    for (const t of ENEMY_TYPES) s.cooldowns[t] = Math.max(0, s.cooldowns[t] - dt)
    this.executePendingSpawns()
    for (const u of s.units) {
      u.attackCooldown = Math.max(0, u.attackCooldown - dt)
      if (healingAction(u)) u.healCooldown = Math.max(0, (u.healCooldown ?? 0) - dt)
      u.attackAnimation = Math.max(0, u.attackAnimation - dt)
      u.hitAnimation = Math.max(0, u.hitAnimation - dt)
      u.moving = false
      if (u.hp <= 0) continue
      const previousX = u.x,
        previousY = u.y,
        previousProgress = u.progress
      if (u.owner === 'ai' && (s.battlefieldVersion === 2 || roadItems(s).length > 0 || (u.mudSlowUntil ?? 0) > 0)) {
        const travel = advanceEnemyTravel(s, u, dt)
        const previousMudCharges = travel.mud?.changes.length
          ? new Map(
              roadItems(s)
                .filter((item) => item.kind === 'mud')
                .map((item) => [item.id, item.charges])
            )
          : undefined
        applyEnemyTravel(s, u, travel)
        for (const item of travel.mud?.changes ?? [])
          if (item.charges < (previousMudCharges?.get(item.id) ?? item.charges))
            this.emitEffectSound(`mud:${item.id}:${item.charges}`, u.id, 'environment', 'mud_slow_apply')
      } else if (u.owner === 'ai') {
        const current = pointOnPath(field.path, u.progress)
        const performingAttack = s.attacks.some((attack) => attack.attackerId === u.id && s.time + 1e-9 < attack.endsAt)
        if (!performingAttack && !attackContact({ ...u, ...current }, base, u.attackRange, 'base').inRange) {
          const airborne = isAirborneEnemy(u.type),
            speed = effectiveMovementSpeed(u, s.time, dt) * (s.time < u.slowUntil ? u.slowFactor : 1),
            obstruction = nextRoadObstruction(s, u)
          let nextProgress = Math.min(
            pathLength(field.path),
            advanceRoadProgress(u.progress, speed, dt, airborne ? undefined : field.slowSurface),
            obstruction?.stopProgress ?? Infinity
          )
          if (
            isEnemyMelee(u.type) &&
            attackContact({ ...u, ...pointOnPath(field.path, nextProgress) }, base, u.attackRange, 'base').inRange
          ) {
            let before = u.progress,
              contact = nextProgress
            for (let sample = 0; sample < 32; sample++) {
              const middle = (before + contact) / 2
              if (attackContact({ ...u, ...pointOnPath(field.path, middle) }, base, u.attackRange, 'base').inRange)
                contact = middle
              else before = middle
            }
            nextProgress = contact
          }
          u.progress = nextProgress
        }
        const p = pointOnPath(field.path, u.progress)
        u.moving = Math.hypot(p.x - current.x, p.y - current.y) > 0.001
        if (u.moving) {
          u.facingX = p.x - current.x
          u.facingY = p.y - current.y
        }
        u.x = p.x
        u.y = p.y
      } else if (!s.attacks.some((a) => a.attackerId === u.id && s.time + 1e-9 < a.endsAt)) this.advanceDefender(u, dt)
      if (u.owner === 'ai' && !isAirborneEnemy(u.type)) {
        const surface = s.battlefieldVersion === 2 ? routeSurface(field, u.routeId) : field.slowSurface
        if (
          surface.speedFactor < 1 &&
          previousProgress < surface.startProgress - 1e-8 &&
          u.progress >= surface.startProgress - 1e-8
        )
          this.emitEffectSound(
            `terrain:${u.routeId ?? 'legacy'}:${surface.startProgress}:${s.time}`,
            u.id,
            'environment',
            'terrain_slow_enter'
          )
      }
      u.travelled += Math.hypot(u.x - previousX, u.y - previousY)
      if (u.owner === 'ai') {
        const progress = Math.min(1, u.progress / pathLength(routePathFor(s, u.routeId)))
        s.stageSummary.maxProgress = Math.max(s.stageSummary.maxProgress, progress)
        const outcome = s.recentOutcomes.find((value) => value.id === this.deploymentByUnit.get(u.id))
        if (outcome) outcome.maxProgress = Math.max(outcome.maxProgress, progress)
      }
    }
    this.history.progress(s)
    const historyContributions: DamageContribution[] = []
    const damage = new Map<number, number>(),
      healing = new Map<number, number>(),
      healingCues: CombatAttack[] = [],
      defenderContributions: { targetId: number; deploymentId: number | undefined; amount: number }[] = [],
      baseContributions: { deploymentId: number | undefined; amount: number }[] = []
    let baseDamage = 0
    const barrierDamage = new Map<number, number>()
    s.attacks = s.attacks.filter((attack) => s.time < Math.max(attack.endsAt, attack.impactAt) + 0.15)
    for (const attack of s.attacks) {
      if (attack.status !== 'windup') continue
      const attacker = s.units.find((unit) => unit.id === attack.attackerId)
      if (!attacker || attacker.hp <= 0) attack.status = 'cancelled'
      else if (
        attacker.owner === 'ai' &&
        !attack.base &&
        ((attack.barrierId !== undefined && !allBarriers(s).some((bag) => bag.id === attack.barrierId)) ||
          (attack.breath &&
            !isReturningBossRaid(attacker) &&
            (attackContact(attacker, base, attacker.attackRange, 'base').inRange ||
              (attack.barrierId === undefined && !!this.contactedSandbag(attacker)))))
      ) {
        attack.status = 'cancelled'
      }
    }
    for (const u of s.units) {
      if (
        u.hp <= 0 ||
        u.battleRelocation?.destination ||
        (healingAction(u) && s.attacks.some((action) => action.attackerId === u.id && s.time + 1e-9 < action.endsAt)) ||
        (s.battlefieldVersion === 2 && u.gateExit) ||
        isReturningBossRaid(u)
      )
        continue
      const healProfile = healingAction(u)
      const healTarget =
        healProfile && (u.healCooldown ?? 0) <= 1e-9
          ? s.units
              .filter(
                (v) =>
                  v.owner === u.owner &&
                  v.hp > 0 &&
                  v.hp < v.maxHp &&
                  Math.hypot(v.x - u.x, v.y - u.y) <= healProfile.range
              )
              .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id)[0]
          : undefined
      // A due support action wins the shared full-body action lane. Offensive
      // cooldown keeps ticking, so healing also uses otherwise idle attack gaps.
      const kind = healTarget ? 'heal' : 'attack'
      if (kind === 'attack' && (!canInitiateDamage(u) || u.attackCooldown > 0)) continue
      const baseContact = attackContact(u, base, u.attackRange, 'base')
      const attacksBase = kind === 'attack' && u.owner === 'ai' && baseContact.inRange
      const barrier = kind === 'attack' && !attacksBase ? this.contactedSandbag(u) : undefined
      const obstruction = kind === 'attack' && !attacksBase && !barrier ? nextRoadObstruction(s, u) : undefined
      const blockingTank =
        obstruction?.kind === 'tank' &&
        u.progress + 1e-9 >= obstruction.stopProgress &&
        attackContact(u, obstruction.tank, u.attackRange).inRange
          ? obstruction.tank
          : undefined
      const pursuit = goblinPursuitTarget(s, u)
      const target =
        kind === 'heal' || attacksBase || barrier
          ? undefined
          : (blockingTank ??
            (pursuit
              ? attackContact(u, pursuit, u.attackRange).inRange
                ? pursuit
                : undefined
              : s.units
                  .filter(
                    (v) =>
                      v.owner !== u.owner &&
                      v.hp > 0 &&
                      (u.owner !== 'ai' || v.type !== 'tank' || tankAvailableToEnemy(s, v, u)) &&
                      canTargetUnit(u, v, s.battlefieldVersion) &&
                      (s.battlefieldVersion !== 2 ||
                        !u.flight ||
                        (u.flight.phase !== 'return' && v.id === u.flight.targetId)) &&
                      attackContact(u, v, u.attackRange).inRange
                  )
                  .sort(
                    (a, b) =>
                      (u.owner === 'ai' ? Number(b.type === 'tank') - Number(a.type === 'tank') : 0) ||
                      Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y) ||
                      a.id - b.id
                  )[0]))
      if (!attacksBase && !barrier && !target && !healTarget) continue
      const aim = attacksBase
        ? baseContact.point
        : barrier
          ? attackContact(u, barrier, u.attackRange, 'sandbag').point
          : (target ?? healTarget!)
      const breath = kind === 'attack' && u.type === 'dragon' && this.breathMouths && (u.attackSequence + 1) % 2 === 0
      const profile =
        kind === 'heal'
          ? healProfile!
          : breath
            ? {
                durationMs: BREATH_TIMING.durationMs,
                cue: 'release' as const,
                cueMs: BREATH_TIMING.startMs,
                flightMs: 0
              }
            : ATTACK_PROFILES[u.type]
      if (u.owner === 'player' && u.type === 'tank')
        u.returnHomeAt = s.time + profile.durationMs / 1000 + TANK_GUARD.returnDelay
      u.attackSequence++
      u.attackStartedAt = s.time
      if (kind === 'heal') u.healCooldown = healProfile!.interval
      else u.attackCooldown = combatAttackInterval(u, profile.durationMs)
      u.moving = false
      u.attackAnimation = ANIMATION.attack
      u.attackTargetX = aim.x
      u.attackTargetY = aim.y
      u.facingX = aim.x - u.x
      u.facingY = aim.y - u.y
      const timeScale = u.owner === 'ai' ? ENEMY_ACTION_TIME_SCALE : 1
      const cueAt = s.time + (profile.cueMs * timeScale) / 1000
      s.attacks.push({
        kind,
        ...(kind === 'attack' ? { damageType: attackDamageType(u.type) } : {}),
        ...(u.owner === 'ai' ? { timeScale: ENEMY_ACTION_TIME_SCALE } : {}),
        ...(u.owner === 'ai' ? { geometryScale: 2 as const } : {}),
        ...(s.battlefieldVersion === 2 ? { battlefieldVersion: 2 as const } : {}),
        id: `${u.id}:${u.attackSequence}`,
        attackerId: u.id,
        sequence: u.attackSequence,
        owner: u.owner,
        type: u.type,
        targetId: target?.id,
        barrierId: barrier?.id,
        healing: healTarget
          ? {
              targetId: healTarget.id,
              amount: healProfile!.amount,
              target: { x: healTarget.x, y: healTarget.y },
              active: true,
              hit: false
            }
          : undefined,
        damageActive: attacksBase || !!barrier || !!target,
        damageHit: false,
        base: attacksBase,
        power: kind === 'heal' ? 0 : effectiveAttack(u, s.time),
        ...(kind === 'attack' && activeSupportBuff(u, s.time)?.effect === 'attack'
          ? {
              supportAttack: {
                sequence: u.supportBuff!.sequence,
                startedAt: u.supportBuff!.startedAt,
                expiresAt: u.supportBuff!.expiresAt
              }
            }
          : {}),
        range: kind === 'heal' ? healProfile!.range : u.attackRange,
        startedAt: s.time,
        releaseAt: cueAt,
        impactAt: cueAt + profile.flightMs / 1000,
        endsAt: s.time + (profile.durationMs * timeScale) / 1000,
        projectile: !breath && profile.cue === 'release',
        variant: breath ? 'breath' : undefined,
        breath: breath
          ? { direction: breathDirection({ x: aim.x - u.x, y: aim.y - u.y }), nextTick: 0, shape: null }
          : undefined,
        status: 'windup',
        origin: { x: u.x, y: u.y },
        target: { x: aim.x, y: aim.y },
        aim: { x: aim.x - u.x, y: aim.y - u.y },
        targetVelocity: { x: 0, y: 0 },
        boss: u.boss
      })
    }
    for (const attack of s.attacks) {
      if (attack.status !== 'windup' && attack.status !== 'released') continue
      let releasedThisStep = false
      const attacker = s.units.find((u) => u.id === attack.attackerId)
      const target = s.units.find((u) => u.id === attack.targetId && u.hp > 0)
      const barrier = allBarriers(s).find(
        (bag) =>
          bag.id === attack.barrierId &&
          bag.hp - ('kind' in bag && bag.kind === 'spike' ? (barrierDamage.get(bag.id) ?? 0) : 0) > 0
      )
      const healTarget = s.units.find((u) => u.id === attack.healing?.targetId && u.hp > 0)
      if (healTarget && attack.healing) attack.healing.target = { x: healTarget.x, y: healTarget.y }
      if (attacker && attack.base) attack.target = attackContact(attacker, base, attack.range, 'base').point
      else if (attacker && barrier) attack.target = attackContact(attacker, barrier, attack.range, 'sandbag').point
      const trackedTarget = attack.kind === 'heal' ? healTarget : target
      if (trackedTarget) {
        attack.targetVelocity = {
          x: (trackedTarget.x - attack.target.x) / dt,
          y: (trackedTarget.y - attack.target.y) / dt
        }
        attack.target = { x: trackedTarget.x, y: trackedTarget.y }
      }
      if (attack.status === 'windup') {
        if (s.time + 1e-9 < attack.releaseAt) continue
        if (!attacker || attacker.hp <= 0) {
          attack.status = 'cancelled'
          continue
        }
        // Range qualifies an ordinary attack only when it starts. Its original living
        // recipient remains locked through the authored cue and impact.
        attack.damageActive = attack.breath
          ? attack.base
            ? attackContact(attacker, base, attack.range, 'base').inRange
            : !!target && attackContact(attacker, target, attack.range).inRange
          : attack.base
            ? s.playerBaseHp > 0
            : attack.barrierId !== undefined
              ? !!barrier
              : !!target
        if (attack.healing) attack.healing.active = !!healTarget
        if (!attack.damageActive && !attack.healing?.active) {
          attack.status = 'cancelled'
          continue
        }
        attack.origin = { x: attacker.x, y: attacker.y }
        attack.status = 'released'
        releasedThisStep = true
        if (attack.projectile) this.emitCombatSound(attack, 'release', attack.releaseAt)
      }
      if (attack.breath && this.breathMouths) {
        const breath = attack.breath
        if (!attacker || attacker.hp <= 0) {
          attack.status = 'cancelled'
          breath.shape = null
          continue
        }
        if (
          (!attack.base &&
            !isReturningBossRaid(attacker) &&
            attackContact(attacker, base, attack.range, 'base').inRange) ||
          s.time + 1e-9 >= attack.startedAt + (BREATH_TIMING.endMs * attackTimeScale(attack)) / 1000
        ) {
          attack.status = attack.damageHit ? 'hit' : 'missed'
          breath.shape = null
          continue
        }
        const origin = mouthAt(
          attacker,
          this.breathMouths[breath.direction],
          attackAssetElapsedMs(attack, s.time),
          attacker.boss ? 1.35 : 1
        )
        breath.lockedAim ??= lockBreathAim(
          origin,
          {
            x: attack.target.x,
            y: attack.target.y - (attack.base ? 22 : 18 * (target?.boss ? 1.35 : 1))
          },
          attack.aim!
        )
        breath.shape = breathGeometry(
          origin,
          breath.lockedAim,
          attack.range,
          undefined,
          attack.battlefieldVersion,
          attack.geometryScale ?? 1
        )
        if (releasedThisStep) this.emitCombatSound(attack, 'breath_start', attack.releaseAt)
        while (
          breath.nextTick < BREATH_TIMING.tickCount &&
          s.time + 1e-9 >= breathTickAt(attack.startedAt, breath.nextTick, attackTimeScale(attack))
        ) {
          breath.nextTick++
          const power = attack.power / BREATH_TIMING.tickCount
          if (attack.base) {
            if (insideBreath(breath.shape, { x: base.x, y: base.y - 22 })) {
              baseDamage += power
              baseContributions.push({
                deploymentId: this.deploymentByUnit.get(attack.attackerId),
                amount: power
              })
              attack.damageHit = true
              this.latchGateExit(attacker, attack)
            }
          } else {
            for (const victim of s.units.filter(
              (unit) =>
                unit.owner !== attack.owner && unit.hp > 0 && canTargetUnit(attack, unit, attack.battlefieldVersion)
            )) {
              if (!insideBreath(breath.shape, { x: victim.x, y: victim.y - 18 * (victim.boss ? 1.35 : 1) })) continue
              const amount = incomingDamage(power, victim, s.time, attack.damageType)
              damage.set(victim.id, (damage.get(victim.id) ?? 0) + amount)
              historyContributions.push({
                targetId: victim.id,
                sourceId: attack.attackerId,
                sourceType: attack.type,
                attackId: attack.id,
                tick: breath.nextTick - 1,
                amount,
                area: true
              })
              if (victim.owner === 'player')
                defenderContributions.push({
                  targetId: victim.id,
                  deploymentId: this.deploymentByUnit.get(attack.attackerId),
                  amount
                })
              attack.damageHit = true
            }
          }
        }
        continue
      }
      if (s.time + 1e-9 < attack.impactAt) continue
      if (!attack.projectile) {
        const alive = !!attacker && attacker.hp > 0
        attack.damageActive =
          alive && (attack.base ? s.playerBaseHp > 0 : attack.barrierId !== undefined ? !!barrier : !!target)
        if (attack.healing) attack.healing.active = alive && !!healTarget
        if (!attack.damageActive && !attack.healing?.active) {
          attack.status = 'cancelled'
          continue
        }
      }
      const d = DEFINITIONS[attack.type],
        splash = attackSplash(attack.type, !!attack.boss, attack.battlefieldVersion, attack.geometryScale ?? 1),
        heavyImpact = heavyImpactGeometry(attack)
      let hit = false
      if (attack.base && attack.damageActive) {
        attack.damageHit = true
        this.latchGateExit(attacker, attack)
        baseDamage += attack.power
        baseContributions.push({
          deploymentId: this.deploymentByUnit.get(attack.attackerId),
          amount: attack.power
        })
        hit = true
      }
      if (barrier && attack.damageActive) {
        attack.damageHit = true
        barrierDamage.set(barrier.id, (barrierDamage.get(barrier.id) ?? 0) + attack.power)
        if (
          'kind' in barrier &&
          barrier.kind === 'spike' &&
          attacker?.owner === 'ai' &&
          !isAirborneEnemy(attacker.type) &&
          !attack.projectile
        ) {
          const amount = incomingDamage(FORTIFICATIONS.spike.retaliation, attacker, s.time, 'physical')
          damage.set(attacker.id, (damage.get(attacker.id) ?? 0) + amount)
          historyContributions.push({
            targetId: attacker.id,
            sourceId: barrier.id,
            sourceType: 'spike',
            attackId: `spike:${barrier.id}:${attack.id}`,
            amount,
            area: false
          })
        }
        hit = true
      }
      if ((target || heavyImpact) && attack.damageActive) {
        const victims = heavyImpact
          ? s.units.filter(
              (v) =>
                v.owner !== attack.owner &&
                v.hp > 0 &&
                canTargetUnit(attack, v, attack.battlefieldVersion) &&
                (v.id === target?.id || insideHeavyImpact(heavyImpact, v))
            )
          : splash
            ? s.units.filter(
                (v) =>
                  v.owner !== attack.owner &&
                  v.hp > 0 &&
                  canTargetUnit(attack, v, attack.battlefieldVersion) &&
                  Math.hypot(v.x - target!.x, v.y - target!.y) <= splash
              )
            : [target!]
        for (const victim of victims) {
          const amount = incomingDamage(attack.power, victim, s.time, attack.damageType)
          damage.set(victim.id, (damage.get(victim.id) ?? 0) + amount)
          historyContributions.push({
            targetId: victim.id,
            sourceId: attack.attackerId,
            sourceType: attack.type,
            attackId: attack.id,
            amount,
            area: !!heavyImpact || splash > 0
          })
          if (victim.owner === 'player')
            defenderContributions.push({
              targetId: victim.id,
              deploymentId: this.deploymentByUnit.get(attack.attackerId),
              amount
            })
        }
        if (d.slow && target?.owner === 'ai') {
          target.slowUntil = s.time + 1.6
          target.slowFactor = d.slow
          this.emitCombatSound(attack, 'slow_apply', attack.impactAt)
        }
        if (victims.length) {
          attack.damageHit = true
          hit = true
        }
      }
      if (healTarget && attack.healing?.active && !attack.healing.hit) {
        healing.set(healTarget.id, (healing.get(healTarget.id) ?? 0) + committedHealAmount(attack))
        attack.healing.hit = true
        if (attack.kind === 'heal' && attack.type === 'healer') healingCues.push(attack)
        hit = true
      }
      attack.status = hit ? 'hit' : 'missed'
      if (hit && !attack.projectile) this.emitCombatSound(attack, 'hit', attack.impactAt)
    }
    this.advanceGateShots(damage, historyContributions)
    const defeatedThisStep: Unit[] = []
    for (const u of s.units) {
      if (u.hp <= 0) continue
      const amount = damage.get(u.id) ?? 0
      if (u.owner === 'player' && amount > 0) {
        const effectiveDamage = Math.min(u.hp + (healing.get(u.id) ?? 0), amount)
        s.stageSummary.defenderDamage += effectiveDamage
        for (const contribution of defenderContributions.filter((value) => value.targetId === u.id)) {
          const outcome = s.recentOutcomes.find((value) => value.id === contribution.deploymentId)
          if (outcome) outcome.defenderDamage += (effectiveDamage * contribution.amount) / amount
        }
      }
      const nextHp = Math.max(0, Math.min(u.maxHp, u.hp + (healing.get(u.id) ?? 0) - amount))
      let appliedHealing = nextHp - Math.max(0, Math.min(u.maxHp, u.hp - amount))
      for (const attack of healingCues) {
        if (attack.healing?.targetId !== u.id) continue
        const contribution = Math.min(appliedHealing, committedHealAmount(attack))
        if (contribution > 0) this.emitEffectSound(attack.id, attack.attackerId, 'healer', 'heal_apply')
        appliedHealing -= contribution
      }
      if (amount > 0)
        this.history.damageStep(
          s,
          u,
          historyContributions.filter((value) => value.targetId === u.id),
          Math.min(u.hp + (healing.get(u.id) ?? 0), amount),
          nextHp === 0
        )
      if (nextHp === 0) defeatedThisStep.push(u)
      u.hp = nextHp
      if (nextHp === 0) this.recordCorpse(u)
      if (amount > 0) u.hitAnimation = ANIMATION.hit
    }
    const areaAttacks = new Map(
      historyContributions.filter((value) => value.area).map((value) => [value.attackId, value])
    )
    for (const [attackId, source] of areaAttacks) {
      const victimIds = new Set(
        historyContributions.filter((value) => value.attackId === attackId).map((value) => value.targetId)
      )
      this.history.areaLoss(
        s,
        source,
        defeatedThisStep.filter((unit) => victimIds.has(unit.id))
      )
    }
    for (const bag of allBarriers(s)) bag.hp = Math.max(0, bag.hp - (barrierDamage.get(bag.id) ?? 0))
    s.sandbags = s.sandbags.filter((bag) => bag.hp > 0)
    if (s.fortifications)
      s.fortifications.items = s.fortifications.items.filter((item) => item.kind !== 'spike' || item.hp > 0)
    const rawBaseDamage = baseDamage
    baseDamage *= gateDamageFactor(s)
    const effectiveBaseDamage = Math.min(s.playerBaseHp, baseDamage)
    s.stageSummary.baseDamage = Math.min(CONFIG.baseHp, s.stageSummary.baseDamage + effectiveBaseDamage)
    for (const contribution of baseContributions) {
      const outcome = s.recentOutcomes.find((value) => value.id === contribution.deploymentId)
      if (outcome)
        outcome.baseDamage = Math.min(
          CONFIG.baseHp,
          outcome.baseDamage + (effectiveBaseDamage * contribution.amount) / rawBaseDamage
        )
      this.history.baseDamage(s, contribution.deploymentId, (effectiveBaseDamage * contribution.amount) / rawBaseDamage)
    }
    s.playerBaseHp = Math.max(0, s.playerBaseHp - baseDamage)
    s.units = s.units.filter((u) => {
      if (u.owner === 'player') return true
      const exited = s.battlefieldVersion === 2 && u.hp > 0 && u.gateExit && s.time + 1e-9 >= u.gateExit.exitAt
      if (u.hp <= 0 || exited) {
        if (exited) this.history.exit(s, u)
        s.enemiesResolved++
        s.stageSummary.resolved++
        const outcome = s.recentOutcomes.find((value) => value.id === this.deploymentByUnit.get(u.id))
        if (outcome) outcome.resolved++
        return false
      }
      return true
    })
    pruneMudOccupants(s)
    for (const unit of s.units)
      if (unit.supportBuff && s.time + 1e-9 >= unit.supportBuff.expiresAt) delete unit.supportBuff
    this.updatePlan()
    if (s.playerBaseHp <= 0) {
      s.phase = 'defeat'
      s.result = 'lose'
      this.cancelGateWindups()
      this.invalidateAI()
    } else if (
      s.enemiesResolved >= stageRules(s.stage, s.waveBossPolicy).enemyCount &&
      s.pendingSpawns.length === 0 &&
      !s.attacks.some((attack) => attack.owner === 'ai' && attack.projectile && attack.status === 'released')
    ) {
      s.phase = s.stage === CONFIG.stages ? 'victory' : 'cleared'
      s.result = 'win'
      this.cancelGateWindups()
      this.invalidateAI()
      this.save.gold += stageRules(s.stage, s.waveBossPolicy).reward
      this.save.highestStage = Math.max(this.save.highestStage, s.stage)
    }
  }
}
