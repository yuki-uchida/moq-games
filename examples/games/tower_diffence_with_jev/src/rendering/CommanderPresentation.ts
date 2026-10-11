import {
  actionKey,
  actionLabel,
  FORMATIONS,
  DEFINITIONS,
  type AIAction,
  type CommanderOrderEvidence,
  type GameState
} from '../game/model'

export type { CommanderOrderEvidence } from '../game/model'
type SupportState = Pick<GameState, 'battleId' | 'fieldId' | 'stage' | 'phase' | 'time'> &
  Partial<Pick<GameState, 'commanderSupportVersion' | 'commanderSupport'>>
type SupportCast = NonNullable<NonNullable<GameState['commanderSupport']>['cast']>
export type SupportEffect = SupportCast['action']['effect']

export const SUPPORT_LABELS: Record<SupportEffect, string> = {
  heal: '回復',
  speed: '加速',
  armor: '防御強化',
  attack: '攻撃強化'
}

export interface CommanderSupportView {
  enabled: boolean
  status: string
  text: string
  cooldownSeconds: number
  castId: string | null
  targetId: number | null
  effect: SupportEffect | null
}

export function currentSupportCast(state: SupportState, cast: SupportCast): boolean {
  return (
    cast.source === 'jev' &&
    cast.stage === state.stage &&
    cast.fieldId === state.fieldId &&
    Number.isFinite(cast.startedAt) &&
    cast.startedAt <= state.time
  )
}

export function commanderSupportPresentation(state: SupportState, jevMode: boolean): CommanderSupportView {
  const support = state.commanderSupport,
    enabled = state.commanderSupportVersion === 1 && !!support,
    cast = enabled && support.cast && currentSupportCast(state, support.cast) ? support.cast : null,
    cooldownSeconds = enabled ? Math.max(0, support.nextReadyAt - state.time) : 0,
    recent = enabled ? [...support.history].reverse().find((event) => currentSupportCast(state, event)) : undefined
  let status = enabled ? support.status : 'disabled',
    text = enabled ? '支援を待っています' : 'この遠征では支援なし'
  if (enabled && !jevMode) {
    status = 'disabled'
    text = 'Jevモードで支援を使用'
  } else if (enabled && state.phase !== 'assault') {
    status = 'waiting'
    text = '戦闘開始10秒後から支援'
  } else if (cast) {
    status = 'casting'
    text = `${DEFINITIONS[cast.target.type].name}へ${SUPPORT_LABELS[cast.action.effect]}を詠唱中`
  } else if (enabled && cooldownSeconds > 0) {
    status = 'cooldown'
    const result =
      recent && state.time - recent.resolvedAt < 3
        ? recent.outcome === 'applied' && recent.amount > 0
          ? `${SUPPORT_LABELS[recent.action.effect]}${recent.action.effect === 'heal' ? ` +${Math.round(recent.amount)} HP` : '付与'} · `
          : recent.outcome === 'target-lost'
            ? '対象消失で不発 · '
            : recent.outcome === 'cancelled'
              ? '支援中断 · '
              : '支援不発 · '
        : ''
    text = `${result}支援CD ${cooldownSeconds.toFixed(1)}秒`
  } else if (enabled && status === 'requesting') {
    text = 'Jevが支援を判断中'
  } else if (enabled && status === 'unavailable') {
    text = support.reason === 'no-legal-actions' ? '支援対象がいません' : '支援を見送り · 再判断待ち'
  } else if (enabled) {
    text = '支援準備完了'
  }
  return {
    enabled,
    status,
    text,
    cooldownSeconds,
    castId: cast?.id ?? null,
    targetId: cast?.target.id ?? null,
    effect: cast?.action.effect ?? null
  }
}
export interface CommanderView {
  visible: boolean
  motion: 'idle' | 'order'
  elapsedMs: number
  text: string
  attribution: 'waiting' | 'jev' | 'game-adjustment'
  gestureSource?: 'spawn-order' | 'support'
  support?: CommanderSupportView
}

const ORDER_MS = 1100
const BUBBLE_SECONDS = 7

export class CommanderPresentation {
  private stageKey = ''
  private revision = -1
  private orderKey = ''
  private gestureAt = -Infinity
  private textUntil = -Infinity
  private lastTime = 0
  private text = ''
  private attribution: CommanderView['attribution'] = 'waiting'

  view(state: SupportState, jevMode: boolean, evidence?: CommanderOrderEvidence | null): CommanderView {
    const stageKey = `${state.battleId}:${state.fieldId}:${state.stage}`
    if (!jevMode || stageKey !== this.stageKey || state.time < this.lastTime || state.phase === 'preparation')
      this.reset(stageKey)
    this.lastTime = state.time
    const visible = jevMode && state.phase === 'assault'
    if (!visible) return { visible: false, motion: 'idle', elapsedMs: 0, text: '', attribution: 'waiting' }
    const current =
      evidence &&
      evidence.source === 'jev' &&
      evidence.stage === state.stage &&
      evidence.fieldId === state.fieldId &&
      Number.isSafeInteger(evidence.revision) &&
      Number.isFinite(evidence.acceptedAt) &&
      evidence.acceptedAt <= state.time &&
      state.time - evidence.acceptedAt <= BUBBLE_SECONDS
    if (!current) {
      this.gestureAt = this.textUntil = -Infinity
      this.text = ''
      this.attribution = 'waiting'
    }
    if (current && evidence.revision > this.revision) {
      this.revision = evidence.revision
      const key = actionKey(evidence.applied)
      const adjusted = actionKey(evidence.requested) !== key
      this.text = orderText(evidence.applied)
      this.attribution = adjusted ? 'game-adjustment' : 'jev'
      this.textUntil = evidence.acceptedAt + BUBBLE_SECONDS
      if (!adjusted && (key !== this.orderKey || state.time - this.gestureAt >= BUBBLE_SECONDS))
        this.gestureAt = evidence.acceptedAt
      this.orderKey = key
    }
    const support = commanderSupportPresentation(state, jevMode),
      supportState = state.commanderSupport,
      supportEvent =
        support.enabled && supportState
          ? [supportState.cast, ...[...supportState.history].reverse()].find(
              (event) =>
                event &&
                currentSupportCast(state, event) &&
                (state.time - event.startedAt) * 1000 < ORDER_MS &&
                (!('outcome' in event) || event.outcome !== 'cancelled')
            )
          : undefined,
      supportElapsedMs = supportEvent ? Math.max(0, (state.time - supportEvent.startedAt) * 1000) : 0,
      elapsedMs = Math.max(0, (state.time - this.gestureAt) * 1000)
    if (supportEvent)
      return {
        visible: true,
        motion: 'order',
        elapsedMs: supportElapsedMs,
        text: support.text,
        attribution: 'jev',
        gestureSource: 'support',
        support
      }
    return {
      visible: true,
      motion: this.attribution === 'jev' && elapsedMs < ORDER_MS ? 'order' : 'idle',
      elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : 0,
      text: state.time < this.textUntil ? this.text : '',
      attribution: state.time < this.textUntil ? this.attribution : 'waiting',
      gestureSource: 'spawn-order',
      support
    }
  }

  private reset(stageKey: string): void {
    this.stageKey = stageKey
    this.revision = -1
    this.orderKey = ''
    this.gestureAt = this.textUntil = -Infinity
    this.text = ''
    this.attribution = 'waiting'
  }
}

function orderText(action: AIAction): string {
  if (action.type === 'wait') return `${DEFINITIONS[action.unitType].name}${action.boss ? ' · BOSS' : ''}の出撃CDを待て`
  if (action.type === 'spawn') return `${actionLabel(action)}、出撃！`
  const formation = FORMATIONS[action.formationId]
  const route = action.routeId ? `${action.routeId === 'left' ? '左' : '右'}ルートへ、` : ''
  return formation.interval > 0
    ? `${route}${formation.label}！ 前衛から、後衛へ続け`
    : `${route}${formation.label}！ 一斉に出撃！`
}
