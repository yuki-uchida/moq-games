import {
  actionKey,
  actionLabel,
  actionMembers,
  DEFINITIONS,
  getAICandidateDiagnostics,
  type AIAction,
  type DeploymentBlockReason,
  type DirectorDecisionTrace,
  type GameState,
  type UnitType
} from '../game/model'

const percent = (value: number) =>
  value > 0 && value < 0.001 ? '<0.1%' : `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`
const setText = (element: HTMLElement, value: string) => {
  if (element.textContent !== value) element.textContent = value
}
const sourceLabel = (source: string) => (source === 'jev' ? 'Jev' : source === 'rule-based' ? 'ルール AI' : 'Bot')

function recordedActionLabel(action: Readonly<AIAction>, trace: DirectorDecisionTrace): string {
  const label = actionLabel(action)
  if (action.type !== 'spawn' || action.targetId === undefined) return label
  const target = trace.request.flightTargets?.find((unit) => unit.id === action.targetId)
  return target ? label.replace(`防衛兵 #${action.targetId}`, `${DEFINITIONS[target.type].name} #${target.id}`) : label
}

export class DecisionPanel {
  readonly element = document.createElement('section')
  private readonly toggle: HTMLButtonElement
  private readonly body: HTMLElement
  private readonly list: HTMLElement
  private readonly status: HTMLElement
  private readonly summary: HTMLElement
  private readonly evidence: HTMLElement
  private readonly formula: HTMLElement
  private readonly count: HTMLElement
  private readonly constraints: HTMLElement
  private readonly constraintsSummary: HTMLElement
  private constraintsKey = ''
  private trace: DirectorDecisionTrace | null = null
  private collapsed = false

  constructor(
    host: HTMLElement,
    private portrait: (type: UnitType) => string | undefined
  ) {
    this.element.id = 'decision-panel'
    this.element.className = 'decision-panel panel'
    this.element.hidden = true
    this.element.setAttribute('aria-label', '敵AI の選択肢とゲームの最終選択')
    this.element.innerHTML = `<div class="decision-heading"><div><b>敵AI の選択肢</b><small id="decision-count"></small></div><button id="decision-toggle" aria-expanded="true" aria-controls="decision-body" aria-label="敵AI の選択肢を折りたたむ">−</button></div><p id="decision-status" role="status"></p><div id="decision-body"><p id="decision-summary"></p><div class="decision-scroll"><button id="decision-prev" aria-label="前の選択肢">‹</button><div id="decision-cards" class="decision-cards" tabindex="0" aria-label="選択肢一覧。左右キーでスクロール"></div><button id="decision-next" aria-label="次の選択肢">›</button></div><details class="decision-formula"><summary>確率と選び方</summary><p id="decision-evidence" class="decision-note"></p><p>Jev 欄は API が返した候補別の値です。未提供は補いません。</p><p id="decision-mixture"></p><p>CD待ちは対象ユニットの出撃CDだけが残る時に選べます。CD回復まで出撃を止め、回復時にJevへ1回再判断を求めます。出撃予約にはなりません。通常の判断は毎秒、Jevは5秒間隔です。未使用のJev応答は5秒の枠内で次の判断に1回だけ使います。それ以外は現在の盤面からRuleが選びます。編成の予約・出撃間隔は維持します。</p><p>カードは現在のJev問い合わせで採択した記録です。ルール判断の時は表示しません。</p></details><details class="decision-constraints"><summary id="decision-constraints-summary">現在の出撃制約</summary><p class="decision-note">こちらは現在の盤面の制約です。上のカードは直近の採択記録です。CDは最短の再選択間隔で、自動出現の予定時刻ではありません。</p><ul id="decision-constraints"></ul></details></div>`
    const get = <T extends HTMLElement>(id: string) => this.element.querySelector<T>(`#${id}`)!
    this.toggle = get('decision-toggle')
    this.body = get('decision-body')
    this.list = get('decision-cards')
    this.status = get('decision-status')
    this.summary = get('decision-summary')
    this.evidence = get('decision-evidence')
    this.formula = get('decision-mixture')
    this.count = get('decision-count')
    this.constraints = get('decision-constraints')
    this.constraintsSummary = get('decision-constraints-summary')
    this.toggle.onclick = () => this.setCollapsed(!this.collapsed)
    get<HTMLButtonElement>('decision-prev').onclick = () => this.list.scrollBy({ left: -172, behavior: 'smooth' })
    get<HTMLButtonElement>('decision-next').onclick = () => this.list.scrollBy({ left: 172, behavior: 'smooth' })
    for (const name of ['pointerdown', 'pointerup', 'click', 'wheel'])
      this.element.addEventListener(name, (event) => event.stopPropagation())
    this.element.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.key === 'Escape') {
        event.preventDefault()
        this.setCollapsed(true)
        this.toggle.focus()
      }
      if (event.target !== this.list) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        this.list.scrollBy({ left: event.key === 'ArrowRight' ? 172 : -172, behavior: 'smooth' })
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        this.list.scrollTo({ left: event.key === 'Home' ? 0 : this.list.scrollWidth, behavior: 'smooth' })
      }
    })
    host.append(this.element)
  }

  private setCollapsed(value: boolean): void {
    this.collapsed = value
    this.body.hidden = value
    this.element.classList.toggle('collapsed', value)
    this.toggle.setAttribute('aria-expanded', String(!value))
    this.toggle.setAttribute('aria-label', value ? '敵AI の選択肢を開く' : '敵AI の選択肢を折りたたむ')
    setText(this.toggle, value ? '+' : '−')
  }

  render(state: Readonly<GameState>, enabled: boolean): void {
    const trace = state.decisionTrace ?? null
    const current =
      enabled &&
      state.phase === 'assault' &&
      !state.result &&
      trace?.source === 'jev' &&
      trace.request.jevRequestId &&
      trace.stage === state.stage &&
      trace.fieldId === state.fieldId
        ? trace
        : null
    this.element.hidden = !current
    if (!current) {
      this.trace = null
      this.element.dataset.initialized = 'false'
      this.element.dataset.source = 'none'
      this.list.replaceChildren()
      for (const element of [this.status, this.count, this.summary, this.evidence, this.formula]) setText(element, '')
      return
    }
    setText(this.status, this.currentStatus(state, current))
    this.renderConstraints(state)
    if (current === this.trace && this.element.dataset.initialized === 'true') return
    this.element.dataset.initialized = 'true'
    this.trace = current
    this.element.dataset.source = current?.source ?? 'none'
    this.element.dataset.revision = current ? String(current.revision) : ''
    this.element.dataset.acceptedAt = current ? String(current.acceptedAt) : ''
    this.list.replaceChildren()
    setText(
      this.formula,
      current.selectionReason === 'explicit-wait'
        ? '今回は指定ユニットのCD待ちをそのまま採用。ゲーム欄は指定した待ち100%、他の候補0%で、抽選は行っていません。'
        : `ゲーム欄は有効なスコアを正規化した値${(current.selectionMixture.scoreWeight * 100).toFixed(0)}%＋${current.explorationMethod ? '編成・経路・行動ごとの探索' : '一様探索'}${(current.selectionMixture.explorationWeight * 100).toFixed(0)}%を地形の重みで補正し、合計100%に正規化した抽選割合です。`
    )
    const actions = current.request.legalActions
    const raw = new Map(
      current.probabilityEvidence.provided.map((entry) => [actionKey(entry.action), entry.probability])
    )
    const offered = new Set(current.probabilityEvidence.offeredActions.map(actionKey))
    const final = new Map(current.finalDistribution.map((entry) => [actionKey(entry.action), entry.probability]))
    const requested = actionKey(current.requested),
      applied = actionKey(current.applied)
    const name = sourceLabel(current.source)
    setText(
      this.count,
      `${offered.size && offered.size !== actions.length ? `APIへ${offered.size} / 記録` : ''}${actions.length}候補 · ${current.acceptedAt - current.request.at > 0.05 ? `${current.request.at.toFixed(1)}秒の盤面 → ` : ''}${current.acceptedAt.toFixed(1)}秒の採択`
    )
    setText(
      this.summary,
      `${name}の選択：${recordedActionLabel(current.requested, current)} → 最終：${recordedActionLabel(current.applied, current)}`
    )
    const total = [...raw.values()].reduce((sum, value) => sum + value, 0)
    const availability =
      current.probabilityEvidence.status === 'complete'
        ? 'API 提供値あり'
        : current.probabilityEvidence.status === 'partial'
          ? 'API 提供値は一部のみ。未提供の候補は「—」。'
          : raw.size
            ? 'API 提供値の合計が0のため、選択結果を抽選用の代替スコアに使用。'
            : 'API 確率は未提供。ゲームの抽選割合を Jev の確率とは扱いません。'
    setText(
      this.evidence,
      `${availability}${total > 0 && Math.abs(total - 1) > 0.001 ? ` 提供値の合計 ${percent(total)}（ゲーム側で正規化）。` : ''}${current.scoreSource === 'selected-action-fallback' ? ' 抽選用スコアは選択された一択からの代替です。' : ''}${current.selectionReason === 'explicit-wait' ? ' 今回は指定ユニットのCD待ちをそのまま採用。' : ''}`
    )
    const orderedActions = [...actions].sort(
      (a, b) => (final.get(actionKey(b)) ?? -1) - (final.get(actionKey(a)) ?? -1)
    )
    for (const action of orderedActions) {
      const key = actionKey(action),
        card = document.createElement('article')
      card.className = 'decision-card'
      card.dataset.choiceKey = key
      card.dataset.modelSelected = String(key === requested)
      card.dataset.applied = String(key === applied)
      const portraits = document.createElement('div')
      portraits.className = 'decision-portraits'
      for (const member of action.type === 'wait' ? [{ unitType: action.unitType }] : actionMembers(action)) {
        const url = this.portrait(member.unitType)
        if (!url) continue
        const img = document.createElement('img')
        img.src = url
        img.alt = ''
        img.draggable = false
        portraits.append(img)
      }
      const title = document.createElement('b')
      setText(title, recordedActionLabel(action, current))
      const api = document.createElement('p'),
        game = document.createElement('p'),
        badge = document.createElement('small')
      api.className = 'decision-api-value'
      game.className = 'decision-game-value'
      badge.className = 'decision-badges'
      const rawValue = raw.get(key),
        finalValue = final.get(key)
      setText(api, `Jev：${rawValue !== undefined ? percent(rawValue) : '—'}`)
      if (rawValue === undefined) {
        api.title = offered.size && !offered.has(key) ? 'API未提示' : '未提供'
        api.setAttribute('aria-label', `Jev：${api.title}`)
      }
      setText(game, `ゲーム：${finalValue !== undefined ? percent(finalValue) : '—'}`)
      if (finalValue === undefined) {
        game.title = '抽選対象外'
        game.setAttribute('aria-label', 'ゲーム：抽選対象外')
      }
      setText(
        badge,
        [
          key === requested ? `${name}選択` : '',
          key === applied ? (action.type === 'wait' ? '最終待機' : '最終出撃') : ''
        ]
          .filter(Boolean)
          .join(' · ')
      )
      card.append(portraits, title)
      if (action.type === 'wait') {
        const cooldown = document.createElement('small')
        cooldown.className = 'decision-cooldown'
        setText(cooldown, `判断時 あと${current.request.cooldowns[action.unitType].toFixed(1)}秒 · 予約なし`)
        card.append(cooldown)
      }
      card.append(api, game, badge)
      this.list.append(card)
    }
  }

  private renderConstraints(state: Readonly<GameState>): void {
    const blocked = getAICandidateDiagnostics(state).filter((entry) => !entry.legal && entry.action.type !== 'wait')
    const rank = (reason: DeploymentBlockReason) =>
      [
        'unlock',
        'boss-only',
        'boss-window',
        'remaining-count',
        'budget',
        'cooldown',
        'pending-formation',
        'spawn-interval'
      ].indexOf(reason.code)
    const rows = blocked.map((entry) => ({
      key: actionKey(entry.action),
      text: `${actionLabel(entry.action)}：${[...entry.reasons]
        .sort((a, b) => rank(a) - rank(b))
        .slice(0, 2)
        .map(blockReasonLabel)
        .join(' / ')}`
    }))
    const key = JSON.stringify(rows)
    if (key === this.constraintsKey) return
    this.constraintsKey = key
    setText(this.constraintsSummary, `現在の出撃制約 · ${blocked.length}候補`)
    this.constraints.replaceChildren()
    for (const row of rows) {
      const item = document.createElement('li')
      item.dataset.choiceKey = row.key
      setText(item, row.text)
      this.constraints.append(item)
    }
    if (!rows.length) {
      const item = document.createElement('li')
      setText(item, 'すべての候補が現在の出撃条件を満たしています。')
      this.constraints.append(item)
    }
  }

  private currentStatus(state: Readonly<GameState>, trace: DirectorDecisionTrace | null): string {
    if (state.phase === 'preparation') return '準備中 · 問い合わせは行いません'
    if (state.result) return 'ステージ終了 · 判断を停止'
    if (state.decisionStatus === '判断中') return trace ? '判断中 · 前の採択を表示中' : '判断中 · 最初の判断'
    if (
      /エラー|応答なし|期限切れ|候補なし|再試行待ち|通信の受付待ち|問い合わせ設定|処理中|問い合わせ間隔/.test(
        state.decisionStatus
      )
    )
      return state.decisionStatus
    if (state.pendingSpawns.length) return '採択済みの編成を順番に出撃中'
    if (state.strategy?.status === 'observing' && !state.strategy.actionKey.startsWith('wait:'))
      return '出撃後の戦況を観察中 · 次の1秒枠で再判断'
    if (state.strategy?.status === 'observing') {
      const action = state.lastAction
      if (action?.type === 'wait')
        return `${actionLabel(action)} · 現在あと${Math.max(0, state.cooldowns[action.unitType]).toFixed(1)}秒 · CD回復時に再判断（予約なし）`
    }
    if (state.strategy?.status === 'executing') return '採択済みの出撃作戦を実行中'
    return state.decisionStatus || ''
  }
}

function blockReasonLabel(reason: DeploymentBlockReason): string {
  switch (reason.code) {
    case 'invalid-action':
      return '行動の形式が無効'
    case 'legacy-route':
      return '旧遠征では一本道を維持'
    case 'route-required':
      return '先に通る経路を選択'
    case 'invalid-target':
      return `直行先 #${reason.targetId} は現在選べません`
    case 'phase':
      return '襲撃中のみ選択可能'
    case 'result':
      return 'ステージ終了'
    case 'pending-formation':
      return `編成${reason.count}体の出撃予約中`
    case 'spawn-interval':
      return `出撃間隔 あと${reason.remaining.toFixed(1)}秒`
    case 'unit-capacity':
      return `盤面の空き${reason.available}枠・必要${reason.required}枠`
    case 'invalid-formation':
      return '無効な編成'
    case 'boss-only':
      return '最後のボス専用枠'
    case 'boss-window':
      return `ボスは最後の1枠のみ（残り${reason.remainingCount}体）`
    case 'formation-unlock':
      return `編成はStage ${String(reason.unlockStage).padStart(2, '0')}で解放`
    case 'unlock':
      return `${DEFINITIONS[reason.unitType].name}はStage ${String(reason.unlockStage).padStart(2, '0')}で解放`
    case 'remaining-count':
      return `残り${reason.available}枠・必要${reason.required}枠${reason.bossReserve ? '（ボス枠を確保）' : ''}`
    case 'cooldown-ready':
      return `${DEFINITIONS[reason.unitType].name}のCD完了・出撃を選択可能`
    case 'cooldown':
      return `${DEFINITIONS[reason.unitType].name} CDあと${reason.remaining.toFixed(1)}秒`
    case 'budget':
      return `予算${reason.available}・必要${reason.cost}${reason.reserve ? `＋残敵用${reason.reserve}` : ''}`
  }
}
