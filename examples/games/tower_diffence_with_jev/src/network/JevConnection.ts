import { MoqChannel } from './MoqChannel'
import {
  getLegalSupportActions,
  isSupportAction,
  serializeSupportObservation,
  supportActionKey,
  type SupportAction,
  type SupportAIResult
} from '../game/CommanderSupport'
import {
  actionKey,
  actionLabel,
  getLegalAIActions,
  isAction,
  isNoDecision,
  noDecisionStatus,
  serializeStateForAI,
  type AIAction,
  type DeploymentRequestContext,
  type AIDecision,
  type AINoDecision,
  type GameState
} from '../game/model'

interface PendingDecision {
  id: string
  version: 2 | 3
  legal: Map<string, AIAction>
  finish: (decision: AIDecision | AINoDecision | null) => void
}

function normalizedScores<T>(
  value: unknown,
  legal: Map<string, T>,
  selected: T,
  reportedSource: unknown,
  validAction: (value: unknown) => value is T,
  keyOf: (action: T) => string
): { scores: { action: T; score: number }[]; scoreSource: 'provided-scores' | 'selected-action-fallback' } {
  const scores = new Map<string, { action: T; score: number }>()
  if (Array.isArray(value) && value.length <= legal.size) {
    for (const entry of value) {
      if (!entry || typeof entry !== 'object' || !validAction(entry.action)) continue
      const key = keyOf(entry.action)
      const action = legal.get(key)
      if (!action || scores.has(key) || !Number.isFinite(entry.score) || entry.score < 0) continue
      scores.set(key, { action, score: entry.score })
    }
  }
  const maximum = Math.max(0, ...Array.from(scores.values(), (entry) => entry.score))
  if (maximum === 0) return { scores: [{ action: selected, score: 1 }], scoreSource: 'selected-action-fallback' }
  const total = Array.from(scores.values()).reduce((sum, entry) => sum + entry.score / maximum, 0)
  const normalized = Array.from(scores.values(), ({ action, score }) => ({
    action,
    score: score / maximum / total
  }))
  const selectedOnly = normalized.length === 1 && keyOf(normalized[0].action) === keyOf(selected)
  return {
    scores: normalized,
    scoreSource:
      reportedSource === 'selected-action-fallback' && selectedOnly ? 'selected-action-fallback' : 'provided-scores'
  }
}

function modelProbabilityEvidence<T>(
  value: unknown,
  legal: Map<string, T>,
  selected: T,
  validAction: (value: unknown) => value is T,
  keyOf: (action: T) => string
):
  | {
      offeredActions: T[]
      provided: { action: T; probability: number }[]
      status: 'complete' | 'partial' | 'unavailable'
    }
  | undefined {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 3) return
  const evidence = value as Record<string, unknown>
  if (
    !Array.isArray(evidence.offeredActions) ||
    evidence.offeredActions.length === 0 ||
    evidence.offeredActions.length > legal.size ||
    !Array.isArray(evidence.provided) ||
    evidence.provided.length > evidence.offeredActions.length
  )
    return
  const offered = new Map<string, T>()
  for (const candidate of evidence.offeredActions) {
    if (!validAction(candidate)) return
    const key = keyOf(candidate),
      action = legal.get(key)
    if (!action || offered.has(key)) return
    offered.set(key, action)
  }
  if (!offered.has(keyOf(selected))) return
  const provided = new Map<string, { action: T; probability: number }>()
  for (const entry of evidence.provided) {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).length !== 2 || !validAction(entry.action)) return
    const key = keyOf(entry.action),
      action = offered.get(key)
    if (
      !action ||
      provided.has(key) ||
      typeof entry.probability !== 'number' ||
      !Number.isFinite(entry.probability) ||
      entry.probability < 0 ||
      entry.probability > 1
    )
      return
    provided.set(key, { action, probability: entry.probability })
  }
  const positiveTotal = [...provided.values()].some((entry) => entry.probability > 0)
  const status = !positiveTotal ? 'unavailable' : provided.size === offered.size ? 'complete' : 'partial'
  if (evidence.status !== status) return
  return { offeredActions: [...offered.values()], provided: [...provided.values()], status }
}

export class JevConnection {
  private channel: MoqChannel
  private sequence = 0
  private session = crypto.randomUUID()
  private pending: PendingDecision | null = null
  private sending: string | null = null
  private observing = false
  private retryAt = -Infinity
  private failures = 0
  private lastRequestAt = -Infinity
  private cooldownPermit: {
    id: string
    waits: Set<string>
    stage: number
    fieldId: GameState['fieldId']
    battlefieldVersion: GameState['battlefieldVersion']
    historyEnabled: boolean
    at: number
  } | null = null
  private lastObservationAt = -Infinity
  private supportPending: {
    id: string
    legal: Map<string, SupportAction>
    finish: (result: SupportAIResult) => void
  } | null = null
  private supportSending: string | null = null
  private supportLastRequestAt = -Infinity
  private supportRetryAt = -Infinity
  private supportFailures = 0

  constructor(
    room: string,
    private status: (s: string) => void,
    onClosed: () => void = () => {}
  ) {
    this.channel = new MoqChannel(
      ['anon', 'tower-jev', room],
      'state',
      'action',
      (value) => this.receive(value),
      status,
      () => {
        this.cancelPending()
        onClosed()
      }
    )
  }

  private receive(value: unknown): void {
    if (!value || typeof value !== 'object') return
    const v = value as Record<string, unknown>
    if (v.version === 4 || v.purpose !== undefined) {
      this.receiveSupport(v)
      return
    }
    const pending = this.pending
    if (!pending || v.version !== pending.version || v.session !== this.session || v.requestId !== pending.id) return
    const source = typeof v.source === 'string' ? v.source.slice(0, 80) : 'bot'
    if (v.action === null) {
      const result = { type: 'unavailable', reason: v.status, source }
      if (isNoDecision(result)) {
        this.status(
          typeof v.error === 'string' ? `Jevエラー: ${v.error.slice(0, 200)}` : noDecisionStatus(result.reason)
        )
        pending.finish(result)
      } else {
        this.status('Jev応答を破棄: 無効な状態')
        pending.finish({ type: 'unavailable', reason: 'error', source })
      }
      return
    }
    if (typeof v.error === 'string') {
      this.status(`Jevエラー: ${v.error.slice(0, 200)}`)
      pending.finish({ type: 'unavailable', reason: 'error', source })
      return
    }
    const action = isAction(v.action) ? pending.legal.get(actionKey(v.action)) : undefined
    if (!action) {
      this.status('Jev応答を破棄: 無効な行動')
      pending.finish({ type: 'unavailable', reason: 'error', source })
      return
    }
    this.status(`${source === 'jev' ? 'Jev応答' : `Bot応答 (${source})`} #${pending.id}: ${actionLabel(action)}`)
    const probabilityEvidence =
      source === 'jev'
        ? modelProbabilityEvidence(v.probabilityEvidence, pending.legal, action, isAction, actionKey)
        : undefined
    pending.finish({
      action,
      ...normalizedScores(v.scores, pending.legal, action, v.scoreSource, isAction, actionKey),
      source,
      ...(probabilityEvidence ? { probabilityEvidence } : {})
    })
  }

  connect(url: string): Promise<void> {
    return this.channel.connect(url)
  }

  private envelope(s: Readonly<GameState>, requestId: string, kind: 'decision' | 'observation' = 'decision') {
    return {
      version: s.battlefieldVersion === 2 ? 3 : 2,
      kind,
      session: this.session,
      requestId,
      seq: this.sequence,
      epoch: this.session,
      state: serializeStateForAI(s)
    }
  }

  async observe(s: Readonly<GameState>): Promise<void> {
    const now = performance.now()
    if (
      this.pending ||
      this.sending ||
      this.observing ||
      now - Math.max(this.lastObservationAt, this.lastRequestAt) < 1000
    )
      return
    this.lastObservationAt = now
    this.observing = true
    try {
      await this.channel.send(this.envelope(s, String(++this.sequence), 'observation'))
    } finally {
      this.observing = false
    }
  }

  cancelDeployment(): void {
    this.pending?.finish(null)
    this.sending = null
  }

  cancelPending(): void {
    this.cooldownPermit = null
    this.cancelDeployment()
    this.supportPending?.finish(null)
    this.supportSending = null
  }

  async decide(s: Readonly<GameState>, context?: DeploymentRequestContext): Promise<AIDecision | AINoDecision | null> {
    const now = performance.now()
    if (this.pending || this.sending) return { type: 'unavailable', reason: 'busy', source: 'connection' }
    const legal = new Map(getLegalAIActions(s).map((action) => [actionKey(action), action]))
    if (legal.size === 0) return { type: 'unavailable', reason: 'no-legal-actions', source: 'connection' }
    if (now < this.retryAt) return { type: 'unavailable', reason: 'backoff', source: 'connection' }
    const target = context?.cooldownReady,
      permit = this.cooldownPermit,
      validContinuation = !!(
        target &&
        isAction(target) &&
        target.type === 'wait' &&
        permit &&
        permit.waits.has(actionKey(target)) &&
        permit.stage === s.stage &&
        permit.fieldId === s.fieldId &&
        permit.battlefieldVersion === s.battlefieldVersion &&
        permit.historyEnabled === s.historyEnabled &&
        s.time >= permit.at &&
        Number.isFinite(s.cooldowns[target.unitType]) &&
        s.cooldowns[target.unitType] === 0 &&
        [...legal.values()].some(
          (action) => action.type === 'spawn' && action.unitType === target.unitType && !!action.boss === !!target.boss
        )
      ),
      cooldownReady =
        validContinuation && target && permit
          ? { requestId: permit.id, unitType: target.unitType, boss: !!target.boss, stage: s.stage, fieldId: s.fieldId }
          : undefined
    if (now - this.lastRequestAt < 5000 && !cooldownReady) {
      return { type: 'unavailable', reason: 'throttled', source: 'connection' }
    }
    const identity = {
      stage: s.stage,
      fieldId: s.fieldId,
      battlefieldVersion: s.battlefieldVersion,
      historyEnabled: s.historyEnabled,
      at: s.time
    }
    const id = String(++this.sequence)
    this.cooldownPermit = null
    this.lastRequestAt = now
    this.sending = id
    return new Promise((resolve) => {
      const finish = (decision: AIDecision | AINoDecision | null) => {
        if (this.pending?.id !== id) return
        clearTimeout(timer)
        this.pending = null
        if (decision && 'action' in decision) {
          this.failures = 0
          if (decision.source === 'jev')
            this.cooldownPermit = {
              id,
              waits: new Set([...legal.values()].filter((action) => action.type === 'wait').map(actionKey)),
              ...identity
            }
        } else if (
          decision &&
          ['backoff', 'error', 'timeout', 'not-configured', 'unavailable'].includes(decision.reason)
        ) {
          this.failures = Math.min(this.failures + 1, 5)
          this.retryAt = performance.now() + Math.min(30000, 1000 * 2 ** this.failures)
        }
        resolve(decision)
      }
      const timer = setTimeout(() => {
        this.status('Jev応答タイムアウト · botの接続と稼働を確認してください')
        finish({ type: 'unavailable', reason: 'timeout', source: 'connection' })
      }, 2500)
      this.pending = { id, version: s.battlefieldVersion === 2 ? 3 : 2, legal, finish }
      void this.channel
        .send({ ...this.envelope(s, id), ...(cooldownReady ? { cooldownReady } : {}) })
        .then((sent) => {
          if (this.pending?.id !== id) return
          if (!sent) {
            this.status('Bot未接続 · 同じRelay・RoomでPipecat botを起動してください')
            finish({ type: 'unavailable', reason: 'unavailable', source: 'connection' })
          } else {
            this.status(`Jev応答待ち #${id}`)
          }
        })
        .catch((error) => {
          if (this.pending?.id !== id) return
          this.status(`送信エラー: ${String(error)}`)
          finish({ type: 'unavailable', reason: 'error', source: 'connection' })
        })
        .finally(() => {
          if (this.sending === id) this.sending = null
        })
    })
  }
  private receiveSupport(v: Record<string, unknown>): void {
    const pending = this.supportPending
    if (
      !pending ||
      v.version !== 4 ||
      v.purpose !== 'support' ||
      v.kind !== 'decision' ||
      v.session !== this.session ||
      v.epoch !== `${this.session}:support` ||
      v.requestId !== pending.id ||
      v.seq !== Number(pending.id)
    )
      return
    const source = typeof v.source === 'string' ? v.source.slice(0, 80) : 'bot'
    if (v.action === null || typeof v.error === 'string') {
      const unavailable = { type: 'unavailable', reason: v.status, source }
      const reason = isNoDecision(unavailable) ? unavailable.reason : 'error'
      this.status(
        typeof v.error === 'string' ? `Jev支援エラー: ${v.error.slice(0, 200)}` : `Jev支援: ${noDecisionStatus(reason)}`
      )
      pending.finish({ type: 'unavailable', reason, source })
      return
    }
    const action = isSupportAction(v.action) ? pending.legal.get(supportActionKey(v.action)) : undefined
    if (!action || source !== 'jev') {
      this.status('Jev支援応答を破棄: 無効な行動')
      pending.finish({ type: 'unavailable', reason: 'error', source })
      return
    }
    const probabilityEvidence = modelProbabilityEvidence(
      v.probabilityEvidence,
      pending.legal,
      action,
      isSupportAction,
      supportActionKey
    )
    this.status(`Jev支援応答 #${pending.id}: ${action.effect} → #${action.targetId}`)
    pending.finish({
      action,
      source: 'jev',
      ...normalizedScores(v.scores, pending.legal, action, v.scoreSource, isSupportAction, supportActionKey),
      ...(probabilityEvidence ? { probabilityEvidence } : {})
    })
  }

  async decideSupport(s: Readonly<GameState>): Promise<SupportAIResult> {
    const now = performance.now()
    const unavailable = (reason: string): SupportAIResult => ({
      type: 'unavailable',
      reason,
      source: 'connection'
    })
    if (this.supportPending || this.supportSending) return unavailable('busy')
    const legal = new Map(getLegalSupportActions(s).map((action) => [supportActionKey(action), action]))
    if (!legal.size || legal.size > 96) return unavailable('no-legal-actions')
    if (now < this.supportRetryAt) return unavailable('backoff')
    if (now - this.supportLastRequestAt < 10000) return unavailable('throttled')
    const state = serializeSupportObservation(s)
    if (new TextEncoder().encode(JSON.stringify(state)).length > 65536) return unavailable('error')
    const id = String(++this.sequence)
    this.supportLastRequestAt = now
    this.supportSending = id
    return new Promise((resolve) => {
      const finish = (result: SupportAIResult) => {
        if (this.supportPending?.id !== id) return
        clearTimeout(timer)
        this.supportPending = null
        if (result && 'action' in result) this.supportFailures = 0
        else if (result && ['backoff', 'error', 'timeout', 'not-configured', 'unavailable'].includes(result.reason)) {
          this.supportFailures = Math.min(this.supportFailures + 1, 5)
          this.supportRetryAt = performance.now() + Math.min(30000, 1000 * 2 ** this.supportFailures)
        }
        resolve(result)
      }
      const timer = setTimeout(() => {
        this.status('Jev支援応答タイムアウト · 支援は再試行を待ちます')
        finish(unavailable('timeout'))
      }, 2500)
      this.supportPending = { id, legal, finish }
      void this.channel
        .send({
          version: 4,
          purpose: 'support',
          kind: 'decision',
          session: this.session,
          requestId: id,
          seq: Number(id),
          epoch: `${this.session}:support`,
          state
        })
        .then((sent) => {
          if (this.supportPending?.id !== id) return
          if (!sent) {
            this.status('Jev支援: Bot未接続')
            finish(unavailable('unavailable'))
          } else this.status(`Jev支援応答待ち #${id}`)
        })
        .catch(() => {
          if (this.supportPending?.id !== id) return
          this.status('Jev支援送信エラー · 支援は再試行を待ちます')
          finish(unavailable('error'))
        })
        .finally(() => {
          if (this.supportSending === id) this.supportSending = null
        })
    })
  }
}
