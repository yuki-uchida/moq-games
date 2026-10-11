import { canInitiateDamage } from '../game/HealingActions'
import { clusterActionMultiplier, observeDefenderClusters } from '../game/ClusterOpportunity'
import type { SupportAIResult } from '../game/CommanderSupport'
import {
  type AIAction,
  type CooldownWaitAction,
  type DeploymentRequestContext,
  type AIDecision,
  type AINoDecision,
  type AIResult,
  type GameState,
  type DirectorDecisionTrace,
  isNoDecision,
  isAction,
  getLegalAIActions,
  deploymentBlockReasons,
  DEFINITIONS,
  actionMembers,
  combatStats,
  actionKey,
  baseActionKey,
  actionExplorationPrior,
  observeDefense,
  observeRoadEffects,
  FORMATIONS
} from '../game/model'

export interface AIController {
  readonly supportEnabled?: boolean
  readonly holdsCooldown?: boolean
  releaseCooldown?(state: Readonly<GameState>, action: CooldownWaitAction, expedite: boolean): void
  cancelDeployment?(): void
  advanceDeployment?(): void
  claimDecision?(result: AIResult, state: Readonly<GameState>): { request?: DirectorDecisionTrace['request'] } | null
  cancelPending?(): void
  resumeCadence?(): void
  fallback?(state: Readonly<GameState>): Promise<AIResult>
  decideSupport?(state: Readonly<GameState>): Promise<SupportAIResult>
  decide(state: Readonly<GameState>, request?: DirectorDecisionTrace['request']): Promise<AIResult>
  observe?(state: Readonly<GameState>): Promise<void> | void
}

export class RuleBasedAI implements AIController {
  public scores: { action: AIAction; score: number }[] = []

  async decide(s: Readonly<GameState>): Promise<AIDecision | AINoDecision> {
    const visible = observeDefense(s),
      road = observeRoadEffects(s),
      clusters = observeDefenderClusters(s)
    const defenders = s.units.filter((unit) => unit.owner === 'player' && unit.hp > 0)
    const defense = defenders.reduce(
      (sum, unit) => sum + unit.hp * 0.3 + (canInitiateDamage(unit) ? unit.attack * 2 : 0),
      0
    )
    const actions = getLegalAIActions(s),
      baseScores = new Map<string, number>(),
      baseActions =
        s.battlefieldVersion === 2
          ? [...new Map(actions.map((action) => [baseActionKey(action), action])).values()]
          : actions
    const scoredBases = baseActions.map((action) => {
      if (action.type === 'wait') return { action, score: 0.06 + visible.frontCoverage * 0.08 }
      const members = actionMembers(action)
      let score =
        members.reduce((sum, member) => {
          const definition = DEFINITIONS[member.unitType],
            stats = combatStats({ owner: 'ai', type: member.unitType, boss: member.boss }, s.stage)
          return (
            sum +
            (0.5 +
              stats.maxHp / (200 + defense) +
              stats.attack / 100 +
              (visible.longRangeDefenders ? stats.maxHp / 500 : (definition.speed * (member.boss ? 0.8 : 1)) / 180) +
              (stats.range / 600) * visible.frontConcentration) /
              Math.sqrt(member.boss ? 5 : definition.cost)
          )
        }, 0) / members.length
      const airborneShare =
          members.filter((member) => road.airborneTypes.includes(member.unitType)).length / members.length,
        barrierPressure = Math.min(
          3,
          road.sandbags.reduce((sum, bag) => sum + bag.hp / bag.maxHp, 0)
        )
      score *= 1 + airborneShare * (1 - road.surface.speedFactor + barrierPressure * 0.12)
      if (action.type === 'formation') {
        const spaced = FORMATIONS[action.formationId].interval > 0
        score *= spaced
          ? 1 + visible.areaDefenders * 0.22 + visible.frontConcentration * 0.12
          : 1 + visible.singleTargetDefenders * 0.18 - Math.min(0.55, visible.areaDefenders * 0.2)
      }
      const recent = (s.historyEnabled ? s.recentOutcomes : []).filter(
        (outcome) =>
          (s.battlefieldVersion === 2
            ? outcome.actionKey.split(':route:')[0] === baseActionKey(action)
            : outcome.actionKey === actionKey(action)) && outcome.spawned > 0
      )
      if (recent.length) {
        const success =
          recent.reduce(
            (sum, outcome) =>
              sum + outcome.maxProgress + outcome.baseDamage / 100 + Math.min(1, outcome.defenderDamage / 200),
            0
          ) / recent.length
        score *= 0.85 + Math.min(0.5, success * 0.2)
      }
      if (
        s.historyEnabled &&
        s.previousStageSummary &&
        s.previousStageSummary.maxProgress < 0.25 &&
        members.some((member) => DEFINITIONS[member.unitType].armor > 0)
      )
        score *= 1.15
      score *= clusterActionMultiplier(action, clusters, s.battlefieldVersion)
      return { action, score: Math.max(0.01, score) }
    })
    for (const { action, score } of scoredBases) baseScores.set(baseActionKey(action), score)
    this.scores =
      s.battlefieldVersion === 2
        ? actionExplorationPrior(actions, 2).map(({ action, probability }) => ({
            action,
            score: baseScores.get(baseActionKey(action))! * probability
          }))
        : scoredBases
    if (!this.scores.length) return { type: 'unavailable', reason: 'no-legal-actions', source: 'rule-based' }
    const total = this.scores.reduce((sum, entry) => sum + entry.score, 0)
    this.scores = this.scores.map(({ action, score }) => ({ action, score: score / total }))
    const action = this.scores.reduce((best, entry) => (entry.score > best.score ? entry : best)).action
    return { action, scores: this.scores, source: 'rule-based' }
  }
}

export class RandomAI implements AIController {
  async decide(s: Readonly<GameState>): Promise<AIDecision | AINoDecision> {
    const actions = getLegalAIActions(s)
    if (!actions.length) return { type: 'unavailable', reason: 'no-legal-actions', source: 'uniform' }
    return {
      action: actions[0],
      scores: actionExplorationPrior(actions, s.battlefieldVersion).map(({ action, probability }) => ({
        action,
        score: probability
      })),
      source: 'uniform'
    }
  }
}

interface DeploymentReply {
  id: number
  deadline: number
  battleId: number
  stage: number
  fieldId: GameState['fieldId']
  historyEnabled: boolean
  offered: ReadonlySet<string>
  request?: DirectorDecisionTrace['request']
  result: Exclude<AIResult, null>
  consumed: boolean
}

export class JevAI implements AIController {
  readonly holdsCooldown = true
  private cooldownReady: CooldownWaitAction | undefined
  readonly supportEnabled: boolean
  private readonly rule = new RuleBasedAI()
  private nextInferenceAt = -Infinity
  private bucket = 0
  private buffered: DeploymentReply | null = null
  private readonly receipts = new WeakMap<object, DeploymentReply>()
  constructor(
    private request: (s: Readonly<GameState>, context?: DeploymentRequestContext) => Promise<AIResult>,
    private publish?: (s: Readonly<GameState>) => Promise<void> | void,
    private requestSupport?: (s: Readonly<GameState>) => Promise<SupportAIResult>,
    private expireDeployment?: () => void,
    private now: () => number = () => performance.now(),
    private expireAll?: () => void
  ) {
    this.supportEnabled = !!requestSupport
  }
  decideSupport(s: Readonly<GameState>): Promise<SupportAIResult> {
    return this.requestSupport?.(s) ?? Promise.resolve({ type: 'unavailable', reason: 'not-configured', source: 'jev' })
  }
  observe(s: Readonly<GameState>): Promise<void> | void {
    return this.publish?.(s)
  }
  private invalidateBucket(): void {
    this.bucket++
    this.buffered = null
  }
  cancelDeployment(): void {
    this.invalidateBucket()
    this.expireDeployment?.()
  }
  cancelPending(): void {
    this.cooldownReady = undefined
    this.invalidateBucket()
    if (this.expireAll) this.expireAll()
    else this.expireDeployment?.()
  }
  advanceDeployment(): void {
    // Expiration is a request-bucket boundary, independent of application slots
    // and even when that boundary currently has no legal deployment.
    if (this.now() >= this.nextInferenceAt) this.cancelDeployment()
  }
  resumeCadence(): void {
    this.cancelDeployment()
    this.nextInferenceAt = this.now() + 5000
  }
  releaseCooldown(s: Readonly<GameState>, action: CooldownWaitAction, expedite: boolean): void {
    if (!s.cooldownHold || s.cooldownHold.phase !== 'ready' || actionKey(s.cooldownHold.action) !== actionKey(action))
      return
    this.cancelDeployment()
    if (expedite) {
      this.cooldownReady = { ...action }
      this.nextInferenceAt = -Infinity
    }
  }
  fallback(s: Readonly<GameState>): Promise<AIResult> {
    return s.cooldownHold
      ? Promise.resolve({ type: 'unavailable', reason: 'throttled', source: 'jev' })
      : this.rule.decide(s)
  }
  private valid(reply: DeploymentReply, state: Readonly<GameState>): boolean {
    if (
      reply.consumed ||
      reply.id !== this.bucket ||
      this.now() >= reply.deadline ||
      state.phase !== 'assault' ||
      state.result ||
      state.battleId !== reply.battleId ||
      state.stage !== reply.stage ||
      state.fieldId !== reply.fieldId ||
      state.historyEnabled !== reply.historyEnabled
    )
      return false
    const action = 'action' in reply.result ? reply.result.action : reply.result
    if (!isAction(action)) return false
    const key = actionKey(action)
    const reasons = action.type === 'wait' ? deploymentBlockReasons(state, action) : []
    const completedWait =
      action.type === 'wait' &&
      'action' in reply.result &&
      reply.result.source === 'jev' &&
      reasons.length === 1 &&
      reasons[0].code === 'cooldown-ready'
    return (
      reply.offered.has(key) &&
      (completedWait || getLegalAIActions(state).some((candidate) => actionKey(candidate) === key))
    )
  }
  claimDecision(result: AIResult, state: Readonly<GameState>): { request?: DirectorDecisionTrace['request'] } | null {
    const receipt = result && this.receipts.get(result)
    // Locally computed Rule results have no model receipt.
    if (!receipt) return result && 'action' in result && result.source === 'rule-based' ? {} : null
    const valid = this.valid(receipt, state)
    receipt.consumed = true
    if (this.buffered === receipt) this.buffered = null
    return valid
      ? {
          request:
            receipt.request &&
            Object.freeze({
              ...receipt.request,
              ...('action' in receipt.result && receipt.result.source === 'jev'
                ? { jevRequestId: String(receipt.id) }
                : {})
            })
        }
      : null
  }
  decide(s: Readonly<GameState>, request?: DirectorDecisionTrace['request']): Promise<AIResult> {
    if (s.cooldownHold?.phase === 'cooling')
      return Promise.resolve({ type: 'unavailable', reason: 'active-plan', source: 'jev' })
    this.advanceDeployment()
    const legal = getLegalAIActions(s)
    if (!legal.length) return this.fallback(s)
    if (this.buffered) {
      if (this.valid(this.buffered, s)) return Promise.resolve(this.buffered.result)
      this.buffered.consumed = true
      this.buffered = null
    }
    const now = this.now()
    if (now < this.nextInferenceAt) return this.fallback(s)
    // An attempted issuance owns five seconds, including prompt failures.
    const id = ++this.bucket,
      deadline = (this.nextInferenceAt = now + 5000)
    const identity = { battleId: s.battleId, stage: s.stage, fieldId: s.fieldId, historyEnabled: s.historyEnabled }
    const offered = new Set(legal.map(actionKey))
    let pending: Promise<AIResult>
    try {
      const context = this.cooldownReady ? { cooldownReady: this.cooldownReady } : undefined
      this.cooldownReady = undefined
      pending = this.request(s, context)
    } catch (error) {
      return Promise.reject(error)
    }
    return pending.then((result) => {
      if (!result || isNoDecision(result)) return result
      // A distinct object is the receipt identity, even when a test/service reuses
      // one response object. Old promises cannot claim a newer bucket's result.
      const uniqueResult = structuredClone(result)
      const receipt: DeploymentReply = {
        id,
        deadline,
        ...identity,
        offered,
        request,
        result: uniqueResult,
        consumed: false
      }
      this.receipts.set(uniqueResult, receipt)
      if (id === this.bucket && this.now() < deadline) this.buffered = receipt
      return uniqueResult
    })
  }
}
