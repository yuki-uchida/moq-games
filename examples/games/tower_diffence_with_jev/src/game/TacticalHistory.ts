import {
  actionKey,
  actionMembers,
  routePathFor,
  CONFIG,
  pathLength,
  type AIAction,
  type FieldId,
  type EnemyType,
  type GameState,
  type Unit,
  type UnitType,
  type DamageSourceType
} from './model'
import type { TacticalHistoryCheckpoint } from './CampaignCheckpoint'
import {
  ENEMY_HISTORY_LIMITS,
  sourceKind,
  sourceKey,
  type HistorySourceDamage,
  type EnemyDamageLedger,
  type EnemyOutcome,
  type EnemyOutcomeSummary,
  type DamageTrend,
  type HistoryOmissions
} from './EnemyOutcomeHistory'

export const HISTORY_LIMITS = {
  windowSeconds: 20,
  bytes: 6000,
  events: 12,
  deployments: 4,
  priorResults: 3,
  contributors: 8,
  storedEvents: 64,
  storedDamage: 128,
  storedDeployments: 23
} as const

export interface HistoryEvent {
  at: number
  kind: 'addition' | 'removal' | 'upgrade' | 'loss' | 'area-loss'
  unitId: number
  unitType: UnitType
  x: number
  y: number
  amount?: number
  sourceId?: number
  sourceType?: DamageSourceType
  victimIds?: number[]
}
export interface HistoryDeployment {
  id: number
  actionKey: string
  startedAt: number
  lastEventAt: number
  order: UnitType[]
  spacingSeconds: number[]
  spawned: number
  resolved: number
  exited?: number
  cancelled: number
  maxProgress: number
  baseDamage: number
  defenderDamage: number
  frontSurvivalSeconds: number | null
  frontAlive: boolean | null
  observedOrder: UnitType[]
  observedGaps: number[]
  rearPassedFront: boolean
}
export interface LegacyHistoryContribution {
  at: number
  deploymentId: number | null
  victimId: number
  sourceId: number
  sourceType: DamageSourceType
  damage: number
  onDefeatStep: boolean
  area: boolean
}
export interface HistoryContribution extends LegacyHistoryContribution {
  victimType: UnitType | null
  sourceKind: 'unit' | 'trap' | 'turret'
  attackId: string | null
  tick: number | null
  legacyUnknown: boolean
}
export interface TacticalHistorySummary {
  version: 2
  fieldId: FieldId
  stage: number
  windowSeconds: 20
  fromTime: number
  throughTime: number
  truncated: boolean
  events: HistoryEvent[]
  deployments: HistoryDeployment[]
  priorResults: HistoryDeployment[]
  contributors: HistoryContribution[]
  enemyOutcomes: EnemyOutcomeSummary[]
  damageTrends: DamageTrend[]
  omissions: HistoryOmissions
  legacyUnknown: boolean
}
interface TrackedDeployment {
  summary: HistoryDeployment
  members: { id: number; type: EnemyType; spawnedAt: number; diedAt: number | null; exitedAt?: number }[]
}
export interface DamageContribution {
  targetId: number
  sourceId: number
  sourceType: DamageSourceType
  attackId: string
  tick?: number
  amount: number
  area: boolean
}
const round = (value: number) => Math.round(value * 100) / 100

export class TacticalHistory {
  private fieldId: FieldId | null = null
  private stage = 0
  private lastTime = 0
  private events: HistoryEvent[] = []
  private damage: HistoryContribution[] = []
  private deployments: TrackedDeployment[] = []
  private omittedUntil = -1
  private enemyOutcomes: EnemyOutcome[] = []
  private enemyLedger: EnemyDamageLedger[] = []
  private discardedContributions = 0
  private discardedDamage = 0
  private discardedOutcomes = 0
  private legacyUnknown = false

  exportCheckpoint(s: Readonly<GameState>): TacticalHistoryCheckpoint {
    this.ensureContext(s)
    return structuredClone({
      version: 2,
      fieldId: s.fieldId,
      stage: this.stage,
      lastTime: this.lastTime,
      omittedUntil: this.omittedUntil,
      events: this.events,
      damage: this.damage,
      deployments: this.deployments,
      enemyOutcomes: this.enemyOutcomes,
      enemyLedger: this.enemyLedger,
      discardedContributions: this.discardedContributions,
      discardedDamage: this.discardedDamage,
      discardedOutcomes: this.discardedOutcomes,
      legacyUnknown: this.legacyUnknown
    })
  }
  static fromCheckpoint(checkpoint: TacticalHistoryCheckpoint): TacticalHistory {
    const history = new TacticalHistory(),
      saved = structuredClone(checkpoint)
    history.fieldId = saved.fieldId
    history.stage = saved.stage
    history.lastTime = saved.lastTime
    history.omittedUntil = saved.omittedUntil
    history.events = saved.events
    history.damage = saved.damage
    history.deployments = saved.deployments
    history.enemyOutcomes = saved.enemyOutcomes
    history.enemyLedger = saved.enemyLedger
    history.discardedContributions = saved.discardedContributions
    history.discardedDamage = saved.discardedDamage
    history.discardedOutcomes = saved.discardedOutcomes
    history.legacyUnknown = saved.legacyUnknown
    return history
  }
  reset(s: Readonly<GameState>): void {
    this.fieldId = s.fieldId
    this.stage = s.stage
    this.lastTime = s.time
    this.events = []
    this.damage = []
    this.deployments = []
    this.omittedUntil = -1
    this.enemyOutcomes = []
    this.enemyLedger = []
    this.discardedContributions = 0
    this.discardedDamage = 0
    this.discardedOutcomes = 0
    this.legacyUnknown = false
  }
  private ensureContext(s: Readonly<GameState>): void {
    if (this.fieldId !== s.fieldId || this.stage !== s.stage || s.time < this.lastTime) this.reset(s)
    this.lastTime = s.time
    const cutoff = s.time - HISTORY_LIMITS.windowSeconds
    this.events = this.events.filter((event) => event.at >= cutoff)
    const expired = this.damage.filter((event) => event.at < cutoff)
    this.discardedContributions += expired.length
    this.discardedDamage += expired.reduce((sum, value) => sum + value.damage, 0)
    this.damage = this.damage.filter((event) => event.at >= cutoff)
  }
  change(s: Readonly<GameState>, kind: 'addition' | 'removal' | 'upgrade', unit: Unit, amount?: number): void {
    this.ensureContext(s)
    this.addEvent({
      at: s.time,
      kind,
      unitId: unit.id,
      unitType: unit.type,
      x: unit.homeX,
      y: unit.homeY,
      ...(amount === undefined ? {} : { amount })
    })
  }
  private addEvent(event: HistoryEvent): void {
    this.events.push(event)
    if (this.events.length > HISTORY_LIMITS.storedEvents) {
      this.omittedUntil = Math.max(this.omittedUntil, this.events[0].at + HISTORY_LIMITS.windowSeconds)
      this.events.shift()
    }
  }
  accept(s: Readonly<GameState>, id: number, action: AIAction): void {
    this.ensureContext(s)
    const members = actionMembers(action)
    if (!members.length) return
    this.deployments.push({
      summary: {
        id,
        actionKey: actionKey(action),
        startedAt: s.time,
        lastEventAt: s.time,
        order: members.map((member) => member.unitType),
        spacingSeconds: members.slice(1).map((member, index) => member.delay - members[index].delay),
        spawned: 0,
        resolved: 0,
        cancelled: 0,
        maxProgress: 0,
        baseDamage: 0,
        defenderDamage: 0,
        frontSurvivalSeconds: null,
        frontAlive: null,
        observedOrder: [],
        observedGaps: [],
        rearPassedFront: false
      },
      members: []
    })
    this.deployments = this.deployments.slice(-HISTORY_LIMITS.storedDeployments)
  }
  spawn(s: Readonly<GameState>, deploymentId: number, unit: Unit): void {
    this.ensureContext(s)
    const deployment = this.deployments.find((value) => value.summary.id === deploymentId)
    if (!deployment) return
    deployment.members.push({ id: unit.id, type: unit.type as EnemyType, spawnedAt: s.time, diedAt: null })
    deployment.summary.spawned++
    deployment.summary.lastEventAt = s.time
  }
  cancel(s: Readonly<GameState>, deploymentId: number): void {
    this.ensureContext(s)
    const deployment = this.deployments.find((value) => value.summary.id === deploymentId)
    if (deployment) {
      deployment.summary.cancelled++
      deployment.summary.lastEventAt = s.time
    }
  }
  progress(s: Readonly<GameState>): void {
    this.ensureContext(s)
    for (const deployment of this.deployments) {
      const living = deployment.members
        .flatMap((member) => {
          const unit = s.units.find((unit) => unit.id === member.id && unit.hp > 0)
          return unit ? [unit] : []
        })
        .sort((a, b) => b.progress - a.progress || a.id - b.id)
      if (!living.length) continue
      deployment.summary.lastEventAt = s.time
      deployment.summary.maxProgress = Math.max(
        deployment.summary.maxProgress,
        ...living.map((unit) => Math.min(1, unit.progress / pathLength(routePathFor(s, unit.routeId))))
      )
      deployment.summary.observedOrder = living.map((unit) => unit.type)
      deployment.summary.observedGaps = living.slice(1).map((unit, index) => living[index].progress - unit.progress)
      const front = living.find((unit) => unit.id === deployment.members[0]?.id)
      if (front && living.some((unit) => unit.progress > front.progress + 1)) deployment.summary.rearPassedFront = true
    }
  }
  damageStep(
    s: Readonly<GameState>,
    victim: Unit,
    contributions: DamageContribution[],
    effectiveDamage: number,
    died: boolean
  ): void {
    this.ensureContext(s)
    const total = contributions.reduce((sum, value) => sum + Math.max(0, value.amount), 0)
    if (total <= 0 || effectiveDamage <= 0) return
    // Resolution calls this once per victim and step; a restored outcome cannot be recorded twice.
    if (victim.owner === 'ai' && this.enemyOutcomes.some((value) => value.enemyId === victim.id)) return
    const lethal = new Map<string, HistorySourceDamage>()
    const ledger = victim.owner === 'ai' ? this.ledgerFor(victim) : undefined
    for (const contribution of contributions) {
      if (contribution.amount <= 0) continue
      const deployment = this.deployments.find((value) =>
        value.members.some((member) => member.id === (victim.owner === 'ai' ? victim.id : contribution.sourceId))
      )
      const amount = (effectiveDamage * contribution.amount) / total
      if (deployment && victim.owner === 'player') {
        deployment.summary.defenderDamage += amount
        deployment.summary.lastEventAt = s.time
      }
      this.damage.push({
        at: s.time,
        deploymentId: deployment?.summary.id ?? null,
        victimId: victim.id,
        victimType: victim.type,
        sourceKind: sourceKind(contribution.sourceType),
        attackId: contribution.attackId,
        tick: contribution.tick ?? null,
        legacyUnknown: false,
        sourceId: contribution.sourceId,
        sourceType: contribution.sourceType,
        damage: amount,
        onDefeatStep: died,
        area: contribution.area
      })
      const source = {
        sourceId: contribution.sourceId,
        sourceType: contribution.sourceType,
        sourceKind: sourceKind(contribution.sourceType),
        damage: amount
      }
      const key = sourceKey(source),
        previous = lethal.get(key)
      lethal.set(key, { ...source, damage: amount + (previous?.damage ?? 0) })
      if (ledger) {
        ledger.totalDamage += amount
        const previous = ledger.sources.find((value) => sourceKey(value) === key)
        if (previous) previous.damage += amount
        else if (ledger.sources.length < ENEMY_HISTORY_LIMITS.sourcesPerEnemy) ledger.sources.push(source)
        else {
          ledger.omittedContributions++
          ledger.omittedDamage += amount
        }
      }
    }
    if (this.damage.length > HISTORY_LIMITS.storedDamage) {
      this.omittedUntil = Math.max(
        this.omittedUntil,
        this.damage[this.damage.length - HISTORY_LIMITS.storedDamage - 1].at + HISTORY_LIMITS.windowSeconds
      )
      const discarded = this.damage.slice(0, -HISTORY_LIMITS.storedDamage)
      this.discardedContributions += discarded.length
      this.discardedDamage += discarded.reduce((sum, value) => sum + value.damage, 0)
      this.damage = this.damage.slice(-HISTORY_LIMITS.storedDamage)
    }
    if (died) {
      if (victim.owner === 'ai') this.recordOutcome(s, victim, 'combat-death', [...lethal.values()])
      this.addEvent({ at: s.time, kind: 'loss', unitId: victim.id, unitType: victim.type, x: victim.x, y: victim.y })
      const deployment = this.deployments.find((value) => value.members.some((member) => member.id === victim.id))
      const member = deployment?.members.find((member) => member.id === victim.id)
      if (deployment && member && member.diedAt === null && member.exitedAt === undefined) {
        member.diedAt = s.time
        deployment.summary.resolved++
        deployment.summary.lastEventAt = s.time
      }
    }
  }
  exit(s: Readonly<GameState>, unit: Unit): void {
    this.ensureContext(s)
    this.recordOutcome(s, unit, 'gate-exit', [])
    const deployment = this.deployments.find((value) => value.members.some((member) => member.id === unit.id)),
      member = deployment?.members.find((member) => member.id === unit.id)
    if (!deployment || !member || member.diedAt !== null || member.exitedAt !== undefined) return
    member.exitedAt = s.time
    deployment.summary.resolved++
    deployment.summary.exited = (deployment.summary.exited ?? 0) + 1
    deployment.summary.lastEventAt = s.time
  }
  private ledgerFor(victim: Unit): EnemyDamageLedger | undefined {
    let ledger = this.enemyLedger.find((value) => value.enemyId === victim.id)
    if (!ledger && this.enemyLedger.length < ENEMY_HISTORY_LIMITS.enemies) {
      ledger = {
        enemyId: victim.id,
        enemyType: victim.type as EnemyType,
        boss: victim.boss,
        totalDamage: 0,
        sources: [],
        omittedContributions: 0,
        omittedDamage: 0,
        legacyUnknown: false
      }
      this.enemyLedger.push(ledger)
    }
    return ledger
  }
  private recordOutcome(
    s: Readonly<GameState>,
    victim: Unit,
    cause: EnemyOutcome['cause'],
    lethal: HistorySourceDamage[]
  ): void {
    if (victim.owner !== 'ai' || this.enemyOutcomes.some((value) => value.enemyId === victim.id)) return
    const ledger = this.ledgerFor(victim),
      limit = ENEMY_HISTORY_LIMITS.sourcesPerEnemy
    if (!ledger) this.legacyUnknown = true
    const contributors = [...lethal].sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)))
    const omitted = contributors.slice(limit)
    const single = contributors.length === 1 && !omitted.length ? contributors[0] : null
    this.enemyOutcomes.push({
      id: `enemy:${victim.id}:${cause}`,
      at: s.time,
      enemyId: victim.id,
      enemyType: victim.type as EnemyType,
      boss: victim.boss,
      routeId: victim.routeId ?? null,
      progress: victim.progress,
      x: victim.x,
      y: victim.y,
      flightPhase: victim.flight?.phase ?? null,
      cause,
      receivedDamage: ledger?.totalDamage ?? lethal.reduce((sum, value) => sum + value.damage, 0),
      attributionComplete: !!ledger && !ledger.legacyUnknown && ledger.omittedContributions === 0 && !omitted.length,
      legacyUnknown: !ledger || ledger.legacyUnknown,
      lastKiller:
        single && ledger && !ledger.legacyUnknown && cause === 'combat-death'
          ? { sourceId: single.sourceId, sourceType: single.sourceType, sourceKind: single.sourceKind }
          : null,
      lethalContributors: contributors.slice(0, limit),
      omittedLethalContributors: omitted.length,
      omittedLethalDamage: omitted.reduce((sum, value) => sum + value.damage, 0)
    })
    if (this.enemyOutcomes.length > ENEMY_HISTORY_LIMITS.enemies) {
      this.enemyOutcomes.shift()
      this.discardedOutcomes++
    }
  }
  areaLoss(s: Readonly<GameState>, source: DamageContribution, victims: Unit[]): void {
    if (victims.length < 2 || source.amount <= 0) return
    this.ensureContext(s)
    if (victims.length > 10) this.omittedUntil = Math.max(this.omittedUntil, s.time + HISTORY_LIMITS.windowSeconds)
    this.addEvent({
      at: s.time,
      kind: 'area-loss',
      unitId: victims[0].id,
      unitType: victims[0].type,
      x: victims.reduce((sum, unit) => sum + unit.x, 0) / victims.length,
      y: victims.reduce((sum, unit) => sum + unit.y, 0) / victims.length,
      sourceId: source.sourceId,
      sourceType: source.sourceType,
      victimIds: victims.slice(0, 10).map((unit) => unit.id)
    })
  }
  baseDamage(s: Readonly<GameState>, deploymentId: number | undefined, amount: number): void {
    this.ensureContext(s)
    const deployment = this.deployments.find((value) => value.summary.id === deploymentId)
    if (deployment) {
      deployment.summary.baseDamage = Math.min(CONFIG.baseHp, deployment.summary.baseDamage + amount)
      deployment.summary.lastEventAt = s.time
    }
  }
  snapshot(s: Readonly<GameState>): TacticalHistorySummary {
    this.ensureContext(s)
    const cutoff = s.time - HISTORY_LIMITS.windowSeconds
    const summarize = (deployment: TrackedDeployment): HistoryDeployment => {
      const front = deployment.members[0]
      return {
        ...structuredClone(deployment.summary),
        startedAt: round(deployment.summary.startedAt),
        lastEventAt: round(deployment.summary.lastEventAt),
        maxProgress: round(deployment.summary.maxProgress),
        baseDamage: round(deployment.summary.baseDamage),
        defenderDamage: round(deployment.summary.defenderDamage),
        observedGaps: deployment.summary.observedGaps.map(round),
        frontSurvivalSeconds: front ? round((front.diedAt ?? front.exitedAt ?? s.time) - front.spawnedAt) : null,
        frontAlive: front ? front.diedAt === null && front.exitedAt === undefined : null
      }
    }
    const sorted = [...this.deployments].sort(
      (a, b) => b.summary.lastEventAt - a.summary.lastEventAt || b.summary.id - a.summary.id
    )
    const recent = sorted.filter((value) => value.summary.lastEventAt >= cutoff)
    const prior = sorted.filter(
      (value) =>
        value.summary.lastEventAt < cutoff &&
        value.summary.resolved + value.summary.cancelled === value.summary.order.length
    )
    const contributions = new Map<string, HistoryContribution>()
    for (const value of this.damage) {
      const key = `${value.victimId}:${sourceKey(value)}:${value.attackId}:${value.tick}`
      const previous = contributions.get(key)
      contributions.set(key, {
        ...value,
        damage: value.damage + (previous?.damage ?? 0),
        onDefeatStep: value.onDefeatStep || !!previous?.onDefeatStep,
        area: value.area || !!previous?.area
      })
    }
    const trends = new Map<string, DamageTrend>()
    for (const ledger of this.enemyLedger)
      for (const source of ledger.sources) {
        const key = `${ledger.enemyType}:${sourceKey(source)}`,
          previous = trends.get(key)
        trends.set(key, {
          ...source,
          enemyType: ledger.enemyType,
          damage: source.damage + (previous?.damage ?? 0),
          defeatedVictims:
            (previous?.defeatedVictims ?? 0) +
            Number(
              this.enemyOutcomes.some(
                (outcome) => outcome.enemyId === ledger.enemyId && outcome.cause === 'combat-death'
              )
            )
        })
      }
    const allTrends = [...trends.values()].sort(
      (a, b) => b.damage - a.damage || sourceKey(a).localeCompare(sourceKey(b))
    )
    const allContributions = [...contributions.values()].sort((a, b) => b.at - a.at || b.damage - a.damage)
    const result: TacticalHistorySummary = {
      version: 2,
      fieldId: s.fieldId,
      stage: s.stage,
      windowSeconds: HISTORY_LIMITS.windowSeconds,
      fromTime: round(Math.max(0, cutoff)),
      throughTime: round(s.time),
      truncated:
        this.legacyUnknown ||
        this.discardedOutcomes > 0 ||
        this.enemyOutcomes.length > ENEMY_HISTORY_LIMITS.outcomes ||
        allTrends.length > ENEMY_HISTORY_LIMITS.trends ||
        s.time <= this.omittedUntil ||
        this.events.length > HISTORY_LIMITS.events ||
        recent.length > HISTORY_LIMITS.deployments ||
        prior.length > HISTORY_LIMITS.priorResults ||
        contributions.size > HISTORY_LIMITS.contributors,
      events: this.events
        .slice(-HISTORY_LIMITS.events)
        .reverse()
        .map((event) => ({
          ...event,
          at: round(event.at),
          x: round(event.x),
          y: round(event.y),
          ...(event.amount === undefined ? {} : { amount: round(event.amount) })
        })),
      deployments: recent.slice(0, HISTORY_LIMITS.deployments).map(summarize),
      priorResults: prior.slice(0, HISTORY_LIMITS.priorResults).map(summarize),
      contributors: allContributions
        .slice(0, HISTORY_LIMITS.contributors)
        .map((value) => ({ ...value, at: round(value.at), damage: round(value.damage) })),
      enemyOutcomes: this.enemyOutcomes
        .slice(-ENEMY_HISTORY_LIMITS.outcomes)
        .reverse()
        .map((outcome) => {
          const ledger = this.enemyLedger.find((value) => value.enemyId === outcome.enemyId)
          const sources = [...(ledger?.sources ?? [])].sort(
            (a, b) => b.damage - a.damage || sourceKey(a).localeCompare(sourceKey(b))
          )
          return {
            ...structuredClone(outcome),
            at: round(outcome.at),
            progress: outcome.progress === null ? null : round(outcome.progress),
            x: round(outcome.x),
            y: round(outcome.y),
            receivedDamage: round(outcome.receivedDamage),
            lethalContributors: outcome.lethalContributors.map((value) => ({ ...value, damage: round(value.damage) })),
            sources: sources
              .slice(0, ENEMY_HISTORY_LIMITS.outcomeSources)
              .map((value) => ({ ...value, damage: round(value.damage) })),
            omittedSources: Math.max(0, sources.length - ENEMY_HISTORY_LIMITS.outcomeSources),
            omittedContributions: ledger?.omittedContributions ?? 0,
            omittedDamage: round(
              sources
                .slice(ENEMY_HISTORY_LIMITS.outcomeSources)
                .reduce((sum, value) => sum + value.damage, ledger?.omittedDamage ?? 0)
            )
          }
        }),
      damageTrends: allTrends
        .slice(0, ENEMY_HISTORY_LIMITS.trends)
        .map((value) => ({ ...value, damage: round(value.damage) })),
      omissions: {
        contributions: this.discardedContributions + Math.max(0, allContributions.length - HISTORY_LIMITS.contributors),
        damage: round(
          this.discardedDamage +
            allContributions.slice(HISTORY_LIMITS.contributors).reduce((sum, value) => sum + value.damage, 0)
        ),
        outcomes: this.discardedOutcomes + Math.max(0, this.enemyOutcomes.length - ENEMY_HISTORY_LIMITS.outcomes),
        trends: Math.max(0, allTrends.length - ENEMY_HISTORY_LIMITS.trends),
        trendDamage: round(allTrends.slice(ENEMY_HISTORY_LIMITS.trends).reduce((sum, value) => sum + value.damage, 0))
      },
      legacyUnknown: this.legacyUnknown
    }
    while (new TextEncoder().encode(JSON.stringify(result)).length > HISTORY_LIMITS.bytes) {
      result.truncated = true
      if (result.priorResults.length) result.priorResults.pop()
      else if (result.damageTrends.length) {
        const removed = result.damageTrends.pop()!
        result.omissions.trends++
        result.omissions.trendDamage = round(result.omissions.trendDamage + removed.damage)
      } else if (result.enemyOutcomes.length > 1) {
        result.enemyOutcomes.pop()
        result.omissions.outcomes++
      } else {
        const buckets = [result.events, result.deployments, result.contributors, result.enemyOutcomes]
        const oldest = buckets
          .map((bucket, index) => ({
            index,
            at: bucket.length
              ? 'at' in bucket[bucket.length - 1]
                ? (bucket[bucket.length - 1] as HistoryEvent).at
                : (bucket[bucket.length - 1] as HistoryDeployment).lastEventAt
              : Infinity
          }))
          .sort((a, b) => a.at - b.at)[0]
        if (!Number.isFinite(oldest.at)) break
        const removed = buckets[oldest.index].pop()
        if (oldest.index === 2 && removed) {
          result.omissions.contributions++
          result.omissions.damage = round(result.omissions.damage + (removed as HistoryContribution).damage)
        }
        if (oldest.index === 3) result.omissions.outcomes++
      }
    }
    return result
  }
}
