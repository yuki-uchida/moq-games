import type { GameState } from '../game/model'

interface StrategyContext {
  started: boolean
  offline: boolean
  connected: boolean
}

export function enemyStrategyPresentation(state: Readonly<GameState>, context: StrategyContext) {
  const empty = { reason: '', progress: '', reconsideration: '' }
  if (!context.started || state.phase === 'preparation')
    return { ...empty, status: '準備中は敵の出撃判断を行いません。' }
  if (state.phase !== 'assault') return { ...empty, status: 'このステージの戦いは終了しました。' }
  if (!context.offline && !context.connected)
    return { ...empty, status: 'MoQ 未接続。接続するか、ルール AI に切り替えてください。' }
  const hold = state.cooldownHold
  if (hold)
    return {
      ...empty,
      status:
        hold.phase === 'cooling'
          ? `◷ ${Math.max(0, state.cooldowns[hold.action.unitType]).toFixed(1)}s`
          : state.decisionStatus,
      progress: hold.phase === 'cooling' ? '' : 'Jev再判断 · 接続・AIで再接続／RULE切替',
      reason: '',
      reconsideration: ''
    }
  const plan = state.strategy
  if (!plan)
    return {
      ...empty,
      status: context.offline ? 'ルール AI' : 'Jev'
    }
  const status = {
    executing: '出撃中',
    observing: '戦況を観察中',
    interrupted: '作戦を見直し',
    completed: '作戦終了'
  }[plan.status]
  const remaining = Math.max(0, Math.ceil(plan.expiresAt - state.time))
  return {
    status: `${context.offline ? 'ルール AI' : 'Jev'} · ${plan.label}`,
    reason: plan.reason,
    progress: `${status}${remaining > 0 && (plan.status === 'executing' || plan.status === 'observing') ? ` · あと ${remaining} 秒` : ''}${state.pendingSpawns.length ? ` · 出撃待ち ${state.pendingSpawns.length} 体` : ''}`,
    reconsideration: plan.reconsideration ?? ''
  }
}
