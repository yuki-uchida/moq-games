import { RoadGeometrySnapshot } from './RoadGeometryCache'
import type { ForecastQueryContext } from './ForecastQueryContext'
import { goblinPursuitTarget } from './GoblinTarget'
import { nextTankRoadblock, tankRestraints } from './TankRoadblock'
import { canInitiateDamage } from './HealingActions'
import { activeSupportBuff, effectiveAttack, effectiveArmor, effectiveSpeed } from './CommanderSupport'
import { advanceEnemyTravel, applyEnemyTravel, routeSandbags, nextRoadObstruction } from './EnemyTravel'
import {
  allBarriers,
  paidBarriers,
  pruneMudOccupants,
  roadItems,
  FORTIFICATIONS,
  type MudTravelGeometry
} from './Fortifications'
import { ATTACK_PROFILES, combatAttackInterval, ENEMY_ACTION_TIME_SCALE } from './AttackProfiles'
import { attackContact, sandbagStandOff } from './CombatContact'
import { fieldScenery } from './FieldScenery'
import {
  CONFIG,
  DEFINITIONS,
  FIELDS,
  fieldFor,
  canTargetUnit,
  advanceRoadProgress,
  isAirborneEnemy,
  pathLength,
  pointOnPath,
  type GameState,
  type Point,
  type Sandbag,
  type Unit
} from './model'

export const INTERCEPTION = {
  horizon: 3,
  sampleSeconds: 0.1,
  refreshSeconds: 0.2,
  targetHoldSeconds: 0.3,
  switchAdvantageSeconds: 0.3,
  maxEnemies: CONFIG.maxUnits,
  maxDetours: 2,
  ringSamples: 12,
  footprint: 18
} as const

export interface EnemyForecastPoint extends Point {
  at: number
  progress: number
}
export interface InterceptionIntent {
  target: Unit
  point: Point
  waypoints: Point[]
  interceptAt: number
  immediate: boolean
}
export interface InterceptionGeometry {
  clearStep?: (start: Point, end: Point) => boolean
  detour?: (defender: Unit, predictedTarget: Point) => Point[]
}
export interface InterceptionMetrics {
  forecastSamples: number
  candidateSamples: number
  standpointChecks: number
  clearanceChecks: number
  detourCalls: number
  cacheHits: number
}
interface SavedIntent {
  unitId: number
  targetId?: number
  point: Point
  waypoints: Point[]
  interceptAt: number
  checkedAt: number
  selectedAt: number
  enemyFingerprint?: string
}
export interface InterceptionSnapshot {
  context: string
  lastTime: number
  intents: SavedIntent[]
  forecasts: { unitId: number; checkedAt: number; fingerprint: string; samples: EnemyForecastPoint[] }[]
}
interface FeasibleIntent extends Omit<InterceptionIntent, 'immediate'> {
  travel: number
}
interface BarrierHit {
  at: number
  power: number
}
const EPSILON = 1e-7
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const clonePoint = (point: Point): Point => ({ x: point.x, y: point.y })

function pointSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    lengthSquared = dx * dx + dy * dy,
    fraction = lengthSquared
      ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
      : 0
  return Math.hypot(point.x - start.x - fraction * dx, point.y - start.y - fraction * dy)
}
export function clearInterceptionStep(
  state: Pick<GameState, 'fieldId'> & Partial<Pick<GameState, 'battlefieldVersion' | 'layoutRevision'>>,
  start: Point,
  end: Point
): boolean {
  const field = fieldFor({ ...state, battlefieldVersion: state.battlefieldVersion ?? 1 }),
    footprint = INTERCEPTION.footprint
  if (
    ![start.x, start.y, end.x, end.y].every(Number.isFinite) ||
    [start, end].some(
      (point) =>
        point.x < footprint ||
        point.y < footprint ||
        point.x > field.width - footprint ||
        point.y > field.height - footprint
    )
  )
    return false
  return !fieldScenery(state.fieldId, state.battlefieldVersion, state.layoutRevision).some(
    (item) => item.kind !== 'sprig' && pointSegmentDistance(item, start, end) < item.radius + footprint - EPSILON
  )
}
function activeRecoveryUntil(state: Readonly<GameState>, enemy: Unit): number {
  return state.attacks.reduce(
    (until, attack) => (attack.attackerId === enemy.id ? Math.max(until, attack.endsAt) : until),
    state.time
  )
}
function enemyFingerprint(state: Readonly<GameState>, enemy: Unit): string {
  const values: (string | number | undefined)[] = [
    enemy.speed,
    enemy.slowUntil,
    enemy.slowFactor,
    enemy.attackSequence,
    enemy.attack,
    enemy.attackSpeed,
    enemy.attackRange,
    activeRecoveryUntil(state, enemy) > state.time ? activeRecoveryUntil(state, enemy) : 0
  ]
  if (state.battlefieldVersion === 2) {
    const target = state.units.find((unit) => unit.id === enemy.flight?.targetId)
    values.push(
      enemy.routeId,
      enemy.flight?.targetId,
      enemy.flight?.phase,
      enemy.flight?.returnProgress,
      target?.x,
      target?.y,
      target?.hp,
      enemy.gateExit?.exitAt
    )
  }
  if (state.economyVersion === 2 && (enemy.mudSlowUntil ?? 0) > 0) values.push(enemy.mudSlowUntil)
  if (paidBarriers(state).length) values.push(`hp=${enemy.hp}`)
  if (state.commanderSupportVersion === 1 && enemy.supportBuff)
    values.push(
      `support=${enemy.supportBuff.effect},${enemy.supportBuff.sequence},${enemy.supportBuff.startedAt},${enemy.supportBuff.expiresAt}`
    )
  return values.join(':')
}
function barrierHits(state: Readonly<GameState>, barrier: Sandbag, excludedEnemy: number): BarrierHit[] {
  const hits = state.attacks
    .filter(
      (attack) =>
        attack.barrierId === barrier.id &&
        !attack.damageHit &&
        attack.damageActive &&
        attack.status !== 'cancelled' &&
        attack.status !== 'missed' &&
        attack.impactAt >= state.time - EPSILON
    )
    .map((attack) => ({ at: attack.impactAt, power: attack.power }))
  for (const enemy of state.units) {
    const routeBarrier =
      state.battlefieldVersion === 2 ? routeSandbags(state, enemy).find((bag) => bag.id === barrier.id) : barrier
    if (
      enemy.id === excludedEnemy ||
      enemy.owner !== 'ai' ||
      enemy.hp <= 0 ||
      isAirborneEnemy(enemy.type) ||
      !routeBarrier ||
      enemy.progress > routeBarrier.progress ||
      enemy.progress < routeBarrier.progress - sandbagStandOff(enemy) - EPSILON ||
      !attackContact(enemy, barrier, enemy.attackRange, 'sandbag').inRange
    )
      continue
    const profile = ATTACK_PROFILES[enemy.type],
      interval = combatAttackInterval(enemy, profile.durationMs)
    let startAt = Math.max(state.time + enemy.attackCooldown, activeRecoveryUntil(state, enemy))
    for (let count = 0; count < 8 && startAt <= state.time + INTERCEPTION.horizon; count++, startAt += interval)
      hits.push({
        at: startAt + (profile.cueMs * ENEMY_ACTION_TIME_SCALE + profile.flightMs) / 1000,
        power: effectiveAttack(enemy, startAt)
      })
  }
  return hits.sort((a, b) => a.at - b.at)
}

function forecastLegacyEnemy(
  state: Readonly<GameState>,
  enemy: Unit,
  query: ForecastQueryContext
): EnemyForecastPoint[] {
  const field = FIELDS[state.fieldId],
    total = pathLength(field.path, query.roads),
    base = field.path[field.path.length - 1],
    airborne = isAirborneEnemy(enemy.type),
    profile = ATTACK_PROFILES[enemy.type],
    interval = combatAttackInterval(enemy, profile.durationMs),
    barriers = (airborne ? [] : state.sandbags.filter((bag) => bag.hp > 0 && bag.progress + EPSILON >= enemy.progress))
      .map((bag) => ({ ...bag, hits: barrierHits(state, bag, enemy.id) }))
      .sort((a, b) => a.progress - b.progress || a.id - b.id)
  let progress = enemy.progress,
    pauseUntil = activeRecoveryUntil(state, enemy),
    readyAt = state.time + Math.max(0, enemy.attackCooldown),
    time = state.time
  const samples: EnemyForecastPoint[] = [{ ...pointOnPath(field.path, progress, query.roads), progress, at: time }]
  for (let sample = 1; sample <= Math.round(INTERCEPTION.horizon / INTERCEPTION.sampleSeconds); sample++) {
    const until = state.time + sample * INTERCEPTION.sampleSeconds
    for (let event = 0; event < 32 && time < until - EPSILON; event++) {
      for (const bag of barriers)
        while (bag.hits.length && bag.hits[0].at <= time + EPSILON) bag.hp -= bag.hits.shift()!.power
      const current = pointOnPath(field.path, progress, query.roads)
      if (attackContact({ ...enemy, ...current }, base, enemy.attackRange, 'base').inRange) {
        time = until
        break
      }
      const barrier = barriers.find((bag) => bag.hp > 0 && bag.progress + EPSILON >= progress),
        atBarrier =
          barrier &&
          progress + EPSILON >= barrier.progress - sandbagStandOff(enemy) &&
          attackContact({ ...enemy, ...current }, barrier, enemy.attackRange, 'sandbag').inRange
      if (atBarrier && time + EPSILON >= Math.max(readyAt, pauseUntil)) {
        barrier.hits.push({
          at: time + (profile.cueMs * ENEMY_ACTION_TIME_SCALE + profile.flightMs) / 1000,
          power: effectiveAttack(enemy, time)
        })
        barrier.hits.sort((a, b) => a.at - b.at)
        readyAt = time + interval
        pauseUntil = time + (profile.durationMs * ENEMY_ACTION_TIME_SCALE) / 1000
      }
      let next = until
      for (const bag of barriers)
        if (bag.hp > 0 && bag.hits.length && bag.hits[0].at > time + EPSILON) next = Math.min(next, bag.hits[0].at)
      if (pauseUntil > time + EPSILON) next = Math.min(next, pauseUntil)
      else if (atBarrier && readyAt > time + EPSILON) next = Math.min(next, readyAt)
      if (enemy.slowUntil > time + EPSILON) next = Math.min(next, enemy.slowUntil)
      const buff = activeSupportBuff(enemy, time)
      if (buff) next = Math.min(next, buff.expiresAt)
      if (pauseUntil <= time + EPSILON && !atBarrier) {
        const speed = effectiveSpeed(enemy, time) * (time + EPSILON < enemy.slowUntil ? enemy.slowFactor : 1),
          tank = nextTankRoadblock(state, { ...enemy, ...current, progress }, query),
          stop = Math.min(
            barrier ? Math.max(progress, barrier.progress - sandbagStandOff(enemy)) : total,
            tank?.stopProgress ?? Infinity
          )
        let nextProgress = Math.min(
          total,
          stop,
          advanceRoadProgress(progress, speed, next - time, airborne ? undefined : field.slowSurface)
        )
        if (
          attackContact(
            { ...enemy, ...pointOnPath(field.path, nextProgress, query.roads) },
            base,
            enemy.attackRange,
            'base'
          ).inRange
        ) {
          let before = progress,
            contact = nextProgress
          for (let iteration = 0; iteration < 24; iteration++) {
            const middle = (before + contact) / 2
            if (
              attackContact(
                { ...enemy, ...pointOnPath(field.path, middle, query.roads) },
                base,
                enemy.attackRange,
                'base'
              ).inRange
            )
              contact = middle
            else before = middle
          }
          nextProgress = contact
        }
        progress = nextProgress
      }
      time = next
    }
    time = until
    samples.push({ ...pointOnPath(field.path, progress, query.roads), progress, at: until })
  }
  return samples
}

interface ForecastBarrierAttack {
  sourceId: number
  barrierId: number
  power: number
  releaseAt: number
  impactAt: number
  projectile: boolean
  released: boolean
}

/** Fresh per synchronous call; no context is retained by forecast samples. */
function createForecastQuery(state: Readonly<GameState>, captureRestraints: boolean): ForecastQueryContext {
  const field = fieldFor(state)
  const roads = new RoadGeometrySnapshot([
    field.path,
    ...field.routes.map((route) => route.path),
    ...field.edges.map((edge) => edge.points)
  ])
  return {
    roads,
    ...(captureRestraints ? { restraints: { units: state.units, field, assignments: tankRestraints(state) } } : {})
  }
}

function forecastPaidEnemies(state: Readonly<GameState>): Map<number, EnemyForecastPoint[]> {
  // Cloned units, barrier HP and mud occupants change: capture roads only.
  const query = createForecastQuery(state, false)
  const mudGeometry: MudTravelGeometry = new Map()
  const moving = state.units
      .filter((unit) => unit.owner === 'ai' && unit.hp > 0)
      .slice(0, INTERCEPTION.maxEnemies)
      .map((unit) => ({ ...unit, flight: unit.flight ? { ...unit.flight } : undefined })),
    forecastState: GameState = {
      ...state,
      units: [...state.units.filter((unit) => unit.owner === 'player'), ...moving],
      sandbags: state.sandbags.map((bag) => ({ ...bag })),
      fortifications: structuredClone(state.fortifications)
    },
    samples = new Map(
      moving.map((unit) => [unit.id, [{ x: unit.x, y: unit.y, progress: unit.progress, at: state.time }]])
    ),
    clocks = new Map(
      moving.map((unit) => [
        unit.id,
        { readyAt: state.time + unit.attackCooldown, pauseUntil: activeRecoveryUntil(state, unit) }
      ])
    ),
    base = fieldFor(state).gate
  let attacks: ForecastBarrierAttack[] = state.attacks
    .filter(
      (attack) =>
        attack.barrierId !== undefined &&
        attack.damageActive &&
        !attack.damageHit &&
        (attack.status === 'windup' || attack.status === 'released')
    )
    .map((attack) => ({
      sourceId: attack.attackerId,
      barrierId: attack.barrierId!,
      power: attack.power,
      releaseAt: attack.releaseAt,
      impactAt: attack.impactAt,
      projectile: attack.projectile,
      released: attack.status === 'released'
    }))
  for (let sample = 1; sample <= Math.round(INTERCEPTION.horizon / INTERCEPTION.sampleSeconds); sample++) {
    const until = state.time + sample * INTERCEPTION.sampleSeconds
    while (forecastState.time < until - EPSILON) {
      const dt = Math.min(CONFIG.step, until - forecastState.time)
      forecastState.time += dt
      pruneMudOccupants(forecastState)
      for (const unit of moving) {
        if (unit.hp <= 0 || (unit.gateExit && forecastState.time + EPSILON >= unit.gateExit.exitAt)) continue
        applyEnemyTravel(
          forecastState,
          unit,
          advanceEnemyTravel(forecastState, unit, dt, clocks.get(unit.id)!.pauseUntil, mudGeometry, query)
        )
      }
      for (const unit of moving) {
        if (unit.hp <= 0 || unit.gateExit) continue
        const clock = clocks.get(unit.id)!,
          obstruction = nextRoadObstruction(forecastState, unit, query),
          barrier = obstruction?.kind === 'sandbag' ? obstruction.barrier : undefined
        if (
          !barrier ||
          forecastState.time + EPSILON < Math.max(clock.readyAt, clock.pauseUntil) ||
          attackContact(unit, base, unit.attackRange, 'base').inRange ||
          unit.progress + EPSILON < barrier.progress - sandbagStandOff(unit) ||
          !attackContact(unit, barrier, unit.attackRange, 'sandbag').inRange
        )
          continue
        const profile = ATTACK_PROFILES[unit.type]
        attacks.push({
          sourceId: unit.id,
          barrierId: barrier.id,
          power: effectiveAttack(unit, forecastState.time),
          releaseAt: forecastState.time + (profile.cueMs * ENEMY_ACTION_TIME_SCALE) / 1000,
          impactAt: forecastState.time + (profile.cueMs * ENEMY_ACTION_TIME_SCALE + profile.flightMs) / 1000,
          projectile: profile.cue === 'release',
          released: false
        })
        clock.readyAt = forecastState.time + combatAttackInterval(unit, profile.durationMs)
        clock.pauseUntil = forecastState.time + (profile.durationMs * ENEMY_ACTION_TIME_SCALE) / 1000
      }
      const barriers = allBarriers(forecastState),
        barrierDamage = new Map<number, number>(),
        retaliation = new Map<number, number>(),
        pending: ForecastBarrierAttack[] = []
      for (const attack of attacks) {
        const source = moving.find((unit) => unit.id === attack.sourceId),
          barrier = barriers.find((bag) => bag.id === attack.barrierId),
          spike = barrier && paidBarriers(forecastState).some((item) => item.id === barrier.id),
          availableHp = barrier ? barrier.hp - (spike ? (barrierDamage.get(barrier.id) ?? 0) : 0) : 0
        if (!attack.released) {
          if (!source || source.hp <= 0 || availableHp <= 0) continue
          if (forecastState.time + EPSILON < attack.releaseAt) {
            pending.push(attack)
            continue
          }
          attack.released = true
        }
        if (forecastState.time + EPSILON < attack.impactAt) {
          pending.push(attack)
          continue
        }
        if (!barrier || availableHp <= 0 || (!attack.projectile && (!source || source.hp <= 0))) continue
        barrierDamage.set(barrier.id, (barrierDamage.get(barrier.id) ?? 0) + attack.power)
        if (spike && !attack.projectile && source && !isAirborneEnemy(source.type))
          retaliation.set(
            source.id,
            (retaliation.get(source.id) ?? 0) +
              FORTIFICATIONS.spike.retaliation * (1 - effectiveArmor(source, forecastState.time))
          )
      }
      attacks = pending
      for (const barrier of barriers) barrier.hp = Math.max(0, barrier.hp - (barrierDamage.get(barrier.id) ?? 0))
      for (const unit of moving) unit.hp = Math.max(0, unit.hp - (retaliation.get(unit.id) ?? 0))
      if (forecastState.fortifications)
        forecastState.fortifications.items = forecastState.fortifications.items.filter(
          (item) => item.kind !== 'spike' || item.hp > 0
        )
      forecastState.units = forecastState.units.filter(
        (unit) =>
          unit.owner === 'player' ||
          (unit.hp > 0 && (!unit.gateExit || forecastState.time + EPSILON < unit.gateExit.exitAt))
      )
      pruneMudOccupants(forecastState)
    }
    for (const unit of moving)
      if (unit.hp > 0) samples.get(unit.id)!.push({ x: unit.x, y: unit.y, progress: unit.progress, at: until })
  }
  return samples
}

export function forecastEnemy(state: Readonly<GameState>, enemy: Unit): EnemyForecastPoint[] {
  if (roadItems(state).length) return forecastPaidEnemies(state).get(enemy.id) ?? []
  // Only the moving clone changes; real state.units remains read-only here.
  const query = createForecastQuery(state, true)
  if (state.battlefieldVersion !== 2 && !(enemy.mudSlowUntil ?? 0)) return forecastLegacyEnemy(state, enemy, query)
  const moving = { ...enemy, flight: enemy.flight ? { ...enemy.flight } : undefined },
    barriers = state.sandbags.map((bag) => ({ ...bag, hits: barrierHits(state, bag, enemy.id) })),
    fortifications = state.fortifications ? structuredClone(state.fortifications) : undefined,
    profile = ATTACK_PROFILES[enemy.type],
    interval = combatAttackInterval(enemy, profile.durationMs),
    samples: EnemyForecastPoint[] = [{ x: enemy.x, y: enemy.y, progress: enemy.progress, at: state.time }]
  let pauseUntil = activeRecoveryUntil(state, enemy),
    readyAt = state.time + enemy.attackCooldown,
    time = state.time
  for (let sample = 1; sample <= Math.round(INTERCEPTION.horizon / INTERCEPTION.sampleSeconds); sample++) {
    const until = state.time + sample * INTERCEPTION.sampleSeconds
    while (time < until - EPSILON) {
      const dt = Math.min(CONFIG.step, until - time)
      time += dt
      for (const bag of barriers)
        while (bag.hits.length && bag.hits[0].at <= time + EPSILON) bag.hp -= bag.hits.shift()!.power
      const forecastState = {
        ...state,
        time,
        sandbags: barriers,
        ...(fortifications ? { fortifications } : {})
      }
      applyEnemyTravel(
        forecastState,
        moving,
        advanceEnemyTravel(forecastState, moving, dt, pauseUntil, undefined, query)
      )
      const obstruction = nextRoadObstruction(forecastState, moving, query),
        barrier = obstruction?.kind === 'sandbag' ? obstruction.barrier : undefined
      if (
        barrier &&
        time + EPSILON >= Math.max(readyAt, pauseUntil) &&
        moving.progress + EPSILON >= barrier.progress - sandbagStandOff(moving) &&
        attackContact(moving, barrier, moving.attackRange, 'sandbag').inRange
      ) {
        const tracked = barriers.find((bag) => bag.id === barrier.id)!
        tracked.hits.push({
          at: time + (profile.cueMs * ENEMY_ACTION_TIME_SCALE + profile.flightMs) / 1000,
          power: effectiveAttack(enemy, time)
        })
        tracked.hits.sort((a, b) => a.at - b.at)
        readyAt = time + interval
        pauseUntil = time + (profile.durationMs * ENEMY_ACTION_TIME_SCALE) / 1000
      }
    }
    samples.push({ x: moving.x, y: moving.y, progress: moving.progress, at: until })
  }
  return samples
}

export class DefenderInterception {
  private context = ''
  private targetingContext = ''
  private lastTime = 0
  private intents = new Map<number, SavedIntent>()
  private forecasts = new Map<number, { checkedAt: number; fingerprint: string; samples: EnemyForecastPoint[] }>()
  private counters: InterceptionMetrics = this.emptyMetrics()

  get metrics(): Readonly<InterceptionMetrics> {
    return { ...this.counters }
  }
  clear(): void {
    this.context = ''
    this.targetingContext = ''
    this.lastTime = 0
    this.intents.clear()
    this.forecasts.clear()
    this.counters = this.emptyMetrics()
  }
  snapshot(): InterceptionSnapshot {
    return {
      context: this.context,
      lastTime: this.lastTime,
      intents: [...this.intents.values()].map((intent) => ({
        ...intent,
        point: clonePoint(intent.point),
        waypoints: intent.waypoints.map(clonePoint)
      })),
      forecasts: [...this.forecasts].map(([unitId, forecast]) => ({
        unitId,
        ...forecast,
        samples: forecast.samples.map((sample) => ({ ...sample }))
      }))
    }
  }
  restore(snapshot: InterceptionSnapshot, state?: Readonly<GameState>): void {
    this.clear()
    const context = state ? this.contextKey(state) : snapshot.context
    if (
      state &&
      (state.time !== snapshot.lastTime ||
        context.slice(context.indexOf(':')) !== snapshot.context.slice(snapshot.context.indexOf(':')))
    )
      return
    this.context = context
    this.targetingContext = state ? this.targetingKey(state) : ''
    this.lastTime = snapshot.lastTime
    this.intents = new Map(
      snapshot.intents
        .slice(0, CONFIG.maxUnits)
        .map((intent) => [
          intent.unitId,
          { ...intent, point: clonePoint(intent.point), waypoints: intent.waypoints.map(clonePoint) }
        ])
    )
    this.forecasts = new Map(
      snapshot.forecasts.slice(0, INTERCEPTION.maxEnemies).map(({ unitId, ...forecast }) => [
        unitId,
        {
          ...forecast,
          samples: forecast.samples
            .slice(0, Math.round(INTERCEPTION.horizon / INTERCEPTION.sampleSeconds) + 1)
            .map((sample) => ({ ...sample }))
        }
      ])
    )
  }
  resolve(
    state: Readonly<GameState>,
    defender: Unit,
    geometry: InterceptionGeometry = {}
  ): InterceptionIntent | undefined {
    this.counters = this.emptyMetrics()
    this.resetContext(state)
    if (defender.owner !== 'player' || defender.hp <= 0 || !canInitiateDamage(defender) || state.phase !== 'assault')
      return undefined
    const previous = this.intents.get(defender.id),
      enemies = state.units
        .filter((unit) => unit.owner === 'ai' && unit.hp > 0 && canTargetUnit(defender, unit, state.battlefieldVersion))
        .slice(0, INTERCEPTION.maxEnemies),
      inRange =
        defender.attackCooldown <= EPSILON
          ? enemies.filter((enemy) => attackContact(defender, enemy, defender.attackRange).inRange)
          : []
    if (inRange.length) {
      const target =
          inRange.find((enemy) => enemy.id === previous?.targetId) ??
          inRange.sort((a, b) => distance(defender, a) - distance(defender, b) || a.id - b.id)[0],
        intent = {
          target,
          point: clonePoint(defender),
          waypoints: [] as Point[],
          interceptAt: state.time,
          immediate: true
        }
      this.remember(state, defender, intent, previous)
      return intent
    }
    const clearStep = (start: Point, end: Point) => {
      this.counters.clearanceChecks++
      return (!geometry.clearStep || geometry.clearStep(start, end)) && clearInterceptionStep(state, start, end)
    }
    if (previous && state.time < previous.checkedAt + INTERCEPTION.refreshSeconds - EPSILON) {
      const target = enemies.find((enemy) => enemy.id === previous.targetId)
      if (!previous.targetId) {
        this.counters.cacheHits++
        return undefined
      }
      if (target && previous.enemyFingerprint === enemyFingerprint(state, target)) {
        while (previous.waypoints.length && distance(defender, previous.waypoints[0]) < 0.75) previous.waypoints.shift()
        const travel = this.routeLength(defender, previous.waypoints),
          remaining = previous.interceptAt - state.time
        if (
          remaining >= Math.max(defender.attackCooldown, travel / Math.max(EPSILON, defender.speed)) - EPSILON &&
          clearStep(defender, previous.waypoints[0] ?? previous.point)
        ) {
          this.counters.cacheHits++
          return {
            target,
            point: clonePoint(previous.point),
            waypoints: previous.waypoints.map(clonePoint),
            interceptAt: previous.interceptAt,
            immediate: false
          }
        }
      }
    }
    const home = { x: defender.homeX, y: defender.homeY },
      leash = DEFINITIONS[defender.type].leash,
      feasible: FeasibleIntent[] = [],
      blocked: { target: Unit; sample: EnemyForecastPoint }[] = []
    for (const enemy of enemies) {
      const samples = this.forecast(state, enemy)
      for (const sample of samples) {
        this.counters.candidateSamples++
        const available = sample.at - state.time
        if (
          (state.battlefieldVersion === 2 &&
            enemy.gateExit !== undefined &&
            sample.at > enemy.gateExit.exitAt + EPSILON) ||
          available + EPSILON < defender.attackCooldown ||
          available < 0 ||
          distance(home, sample) > leash + defender.attackRange ||
          distance(defender, sample) > defender.speed * available + defender.attackRange
        )
          continue
        const standpoints = this.standpoints(defender, sample, home)
          .filter(
            (point) =>
              distance(home, point) <= leash + EPSILON &&
              distance(point, sample) <= defender.attackRange + EPSILON &&
              distance(defender, point) <= defender.speed * available + EPSILON
          )
          .sort((a, b) => distance(defender, a) - distance(defender, b))
        let found: FeasibleIntent | undefined
        for (const point of standpoints) {
          this.counters.standpointChecks++
          if (!clearStep(defender, point)) continue
          found = {
            target: enemy,
            point,
            waypoints: distance(defender, point) > EPSILON ? [point] : [],
            interceptAt: sample.at,
            travel: distance(defender, point)
          }
          break
        }
        if (found) {
          feasible.push(found)
          break
        }
        if (standpoints.length && !blocked.some((value) => value.target.id === enemy.id))
          blocked.push({ target: enemy, sample })
      }
    }
    if (geometry.detour) {
      blocked.sort(
        (a, b) =>
          Number(b.target.id === previous?.targetId) - Number(a.target.id === previous?.targetId) ||
          a.sample.at - b.sample.at ||
          a.target.id - b.target.id
      )
      for (let index = 0; index < blocked.length; index++) {
        const candidate = blocked[index]
        if (this.counters.detourCalls >= INTERCEPTION.maxDetours) break
        if (feasible.some((intent) => intent.target.id === candidate.target.id)) continue
        this.counters.detourCalls++
        const waypoints = geometry.detour(defender, candidate.sample),
          point = waypoints.at(-1)
        if (!point || waypoints.length > 64 || distance(point, candidate.sample) > defender.attackRange + EPSILON)
          continue
        let start: Point = defender,
          valid = true
        for (const next of waypoints) {
          if (distance(home, next) > leash + EPSILON || !clearStep(start, next)) {
            valid = false
            break
          }
          start = next
        }
        const travel = this.routeLength(defender, waypoints)
        if (!valid) continue
        const samples = this.forecast(state, candidate.target),
          arrivalAt = state.time + Math.max(defender.attackCooldown, travel / Math.max(EPSILON, defender.speed)),
          sample = samples.find(
            (value) => value.at + EPSILON >= arrivalAt && distance(point, value) <= defender.attackRange + EPSILON
          )
        if (sample)
          feasible.push({
            target: candidate.target,
            point: clonePoint(point),
            waypoints: waypoints.map(clonePoint),
            interceptAt: sample.at,
            travel
          })
        else if (this.counters.detourCalls < INTERCEPTION.maxDetours) {
          const retry = samples.find(
            (value) =>
              value.at + EPSILON >= arrivalAt &&
              value.at > candidate.sample.at + EPSILON &&
              distance(value, candidate.sample) > 0.5
          )
          if (retry) blocked.splice(index + 1, 0, { target: candidate.target, sample: retry })
        }
      }
    }
    feasible.sort((a, b) => a.interceptAt - b.interceptAt || a.travel - b.travel || a.target.id - b.target.id)
    let chosen = feasible[0]
    const incumbent = feasible.find((intent) => intent.target.id === previous?.targetId)
    if (
      incumbent &&
      (state.time < previous!.selectedAt + INTERCEPTION.targetHoldSeconds ||
        !chosen ||
        chosen.interceptAt + INTERCEPTION.switchAdvantageSeconds >= incumbent.interceptAt)
    )
      chosen = incumbent
    const intent = chosen
      ? {
          target: chosen.target,
          point: chosen.point,
          waypoints: chosen.waypoints,
          interceptAt: chosen.interceptAt,
          immediate: false
        }
      : undefined
    this.remember(state, defender, intent, previous)
    return intent
  }
  private emptyMetrics(): InterceptionMetrics {
    return {
      forecastSamples: 0,
      candidateSamples: 0,
      standpointChecks: 0,
      clearanceChecks: 0,
      detourCalls: 0,
      cacheHits: 0
    }
  }
  private contextKey(state: Readonly<GameState>): string {
    const surface = fieldFor(state).slowSurface
    const context = `${state.battleId}:${state.stage}:${state.fieldId}:${state.phase}:${surface.startProgress}:${surface.endProgress}:${surface.speedFactor}:${state.sandbags
      .filter((bag) => bag.hp > 0)
      .map((bag) => `${bag.id},${bag.hp},${bag.progress}`)
      .sort()
      .join(';')}:${state.units
      .filter((unit) => unit.owner === 'ai' && unit.hp > 0)
      .map((unit) => unit.id)
      .sort((a, b) => a - b)
      .join(',')}`
    const tanks = state.units
      .filter((unit) => unit.owner === 'player' && unit.type === 'tank' && unit.hp > 0)
      .map((unit) => `${unit.id},${unit.x},${unit.y}`)
      .sort()
      .join(';')
    const battleRules = state.battlefieldVersion === 2 ? `${context}:battlefield2` : context,
      battlefield = state.layoutRevision > 1 ? `${battleRules}:layout${state.layoutRevision}` : battleRules,
      items = roadItems(state)
    const obstacles = items.length
      ? `${battlefield}:fortifications=${[...items]
          .sort((a, b) => a.id - b.id)
          .map((item) =>
            [
              item.kind,
              item.id,
              item.edgeId,
              item.offset,
              item.kind === 'spike' ? item.hp : item.charges,
              item.kind === 'mud' ? item.insideIds.join('.') : ''
            ].join(',')
          )
          .join(';')}`
      : battlefield
    return tanks ? `${obstacles}:tanks=${tanks}` : obstacles
  }
  private targetingKey(state: Readonly<GameState>): string {
    const restraints = [...tankRestraints(state)].sort((a, b) => a[0] - b[0]).map(([tank, enemy]) => `${tank},${enemy}`)
    const pursuits = state.units
      .filter((unit) => unit.owner === 'ai' && unit.type === 'goblin' && unit.hp > 0)
      .map((unit) => {
        const target = goblinPursuitTarget(state, unit)
        return target ? `${unit.id},${target.id},${target.x},${target.y}` : ''
      })
      .filter(Boolean)
      .sort()
    return [...restraints, ...pursuits].join(';')
  }
  private resetContext(state: Readonly<GameState>): void {
    const context = this.contextKey(state),
      targeting = this.targetingKey(state)
    if (targeting !== this.targetingContext || context !== this.context || state.time < this.lastTime - EPSILON) {
      this.intents.clear()
      this.forecasts.clear()
      this.context = context
      this.targetingContext = targeting
    }
    this.lastTime = state.time
    for (const id of this.intents.keys())
      if (!state.units.some((unit) => unit.id === id && unit.hp > 0)) this.intents.delete(id)
  }
  private forecast(state: Readonly<GameState>, enemy: Unit): EnemyForecastPoint[] {
    if (roadItems(state).length) {
      const enemies = state.units.filter((unit) => unit.owner === 'ai' && unit.hp > 0).slice(0, INTERCEPTION.maxEnemies)
      if (
        !enemies.every((unit) => {
          const cached = this.forecasts.get(unit.id)
          return (
            cached &&
            cached.fingerprint === enemyFingerprint(state, unit) &&
            state.time < cached.checkedAt + INTERCEPTION.refreshSeconds - EPSILON
          )
        })
      ) {
        for (const [unitId, samples] of forecastPaidEnemies(state)) {
          const unit = enemies.find((candidate) => candidate.id === unitId)!
          this.counters.forecastSamples += samples.length
          this.forecasts.set(unitId, {
            checkedAt: state.time,
            fingerprint: enemyFingerprint(state, unit),
            samples
          })
        }
      }
      return this.forecasts.get(enemy.id)?.samples ?? []
    }
    const fingerprint = enemyFingerprint(state, enemy),
      existing = this.forecasts.get(enemy.id)
    if (
      existing &&
      existing.fingerprint === fingerprint &&
      state.time < existing.checkedAt + INTERCEPTION.refreshSeconds - EPSILON
    )
      return existing.samples
    const samples = forecastEnemy(state, enemy)
    this.counters.forecastSamples += samples.length
    this.forecasts.set(enemy.id, { checkedAt: state.time, fingerprint, samples })
    return samples
  }
  private standpoints(defender: Unit, target: Point, home: Point): Point[] {
    const radius = Math.max(0, defender.attackRange - 0.5),
      toward = (point: Point) => {
        const separation = distance(target, point),
          fraction = separation ? Math.min(1, radius / separation) : 0
        return {
          x: target.x + (point.x - target.x) * fraction,
          y: target.y + (point.y - target.y) * fraction
        }
      },
      points = [toward(defender), toward(home), clonePoint(home)]
    if (distance(defender, target) <= defender.attackRange) points.unshift(clonePoint(defender))
    for (let index = 0; index < INTERCEPTION.ringSamples; index++) {
      const angle = (index * Math.PI * 2) / INTERCEPTION.ringSamples
      points.push({ x: target.x + Math.cos(angle) * radius, y: target.y + Math.sin(angle) * radius })
    }
    return points
  }
  private routeLength(start: Point, waypoints: readonly Point[]): number {
    let length = 0
    for (const point of waypoints) {
      length += distance(start, point)
      start = point
    }
    return length
  }
  private remember(
    state: Readonly<GameState>,
    defender: Unit,
    intent: InterceptionIntent | undefined,
    previous?: SavedIntent
  ): void {
    this.intents.set(defender.id, {
      unitId: defender.id,
      targetId: intent?.target.id,
      point: clonePoint(intent?.point ?? defender),
      waypoints: intent?.waypoints.map(clonePoint) ?? [],
      interceptAt: intent?.interceptAt ?? state.time,
      checkedAt: state.time,
      selectedAt: intent?.target.id === previous?.targetId ? (previous?.selectedAt ?? state.time) : state.time,
      enemyFingerprint: intent ? enemyFingerprint(state, intent.target) : undefined
    })
  }
}
