import { campaign } from './campaign'
import { distance, finished, type Game, type Unit } from './game'

/** Display names for unit roles. */
export const roleNames: Record<string, string> = {
  soldier: '剣士',
  archer: '弓兵',
  mage: '魔法使い',
  healer: '癒し手',
  goblin: 'ゴブリン',
  wolf: '狼',
  slime: 'スライム',
  bat: 'コウモリ',
  beetle: '甲虫',
  shaman: '呪術師',
  wraith: '亡霊',
  ogre: 'オーガ',
  dragon: '竜'
}

export const phaseLabel = (phase: Game['phase']) =>
  ({ ally: '味方フェイズ', enemy: '敵フェイズ', won: '勝利', lost: '敗北' })[phase]

/** The complete victory and defeat conditions, for the objective's tooltip and tap. */
export function objectiveDetail(game: Game): string {
  const objective = campaign[game.stage].objective
  const rest = '敵を全滅させても勝利 · 味方が全滅すると敗北'
  if (game.phase === 'won') return objective.type === 'survive' ? '防衛達成' : '任務達成'
  switch (objective.type) {
    case 'rout':
      return '敵を全滅させると勝利 · 味方が全滅すると敗北'
    case 'boss': {
      const boss = game.units.find((u) => u.boss)
      return `ボス（${boss?.name ?? 'ボス'}）を倒すと勝利 · ${rest}`
    }
    case 'seize':
      return `✦の祠に味方を置いたまま味方フェイズを終えると制圧して勝利 · ${rest}`
    case 'survive':
      return `${objective.turns}ターン守り抜く（${objective.turns}ターン目の敵フェイズを耐える）と勝利・残り${Math.max(0, objective.turns - game.turn + 1)}ターン · ${rest}`
  }
}

/** The victory condition in words, without a label prefix. */
export function objectiveText(game: Game): string {
  const objective = campaign[game.stage].objective
  if (game.phase === 'won') return objective.type === 'survive' ? '防衛達成' : '任務達成'
  switch (objective.type) {
    case 'rout':
      return '敵を全滅させる'
    case 'boss': {
      const boss = game.units.find((u) => u.boss)
      return boss ? `ボス撃破（${boss.name}）` : 'ボス撃破'
    }
    case 'seize':
      return '✦ 祠を制圧'
    case 'survive':
      return `残り${Math.max(0, objective.turns - game.turn + 1)}ターン（${objective.turns}ターン防衛）`
  }
}

export type GuideState = {
  game: Game
  selected?: Unit
  inspected?: Unit
  /** true: a heal forecast is open; false: an attack forecast; undefined: none. */
  pendingHeal?: boolean
  /** The selected ally can still take back its move with ↶ 戻す. */
  canUndo?: boolean
  busy: boolean
  ready: boolean
}

/** One short sentence on what to do next. */
export function guideText({ game, selected, inspected, pendingHeal, canUndo, busy, ready }: GuideState): string {
  if (!ready) return '3D モデルを準備中…'
  if (game.phase === 'won') return '勝利！ 結果を確認して次の任務へ'
  if (game.phase === 'lost') return '敗北… 「↻ この章に再挑戦」で章の最初から'
  if (game.phase === 'enemy') return '敵フェイズ中 · 画面タップか ⏩ で早送り'
  if (busy) return '行動中…'
  if (pendingHeal === true) return '回復予測を確認し「回復」で確定（やめる で取消）'
  if (pendingHeal === false) return '攻撃予測を確認し「攻撃」で確定（やめる で取消）'
  if (selected && selected.side === 'ally' && selected.hp > 0) {
    if (selected.done) return '行動済み · 別の味方を選ぶか ▶ ターン終了'
    const healer = Boolean(selected.heal)
    const targets = healer
      ? game.units.some(
          (u) =>
            u.side === 'ally' &&
            u.hp > 0 &&
            u.hp < u.max &&
            u.id !== selected.id &&
            distance(selected, u) >= 1 &&
            distance(selected, u) <= 2
        )
      : game.units.some((u) => u.side === 'enemy' && u.hp > 0 && distance(selected, u) <= selected.range)
    if (!selected.moved) {
      if (healer)
        return targets ? '青いマスへ移動、または緑のマスの味方を回復' : '青いマスへ移動（杖は距離1〜2の味方を回復）'
      return targets ? '青いマスへ移動、または赤く光る敵を攻撃' : '青いマスへ移動（赤は移動後に攻撃できる範囲）'
    }
    if (healer)
      return targets
        ? '緑のマスの味方を回復、または ✓ 待機'
        : canUndo
          ? '✓ 待機で行動終了（↶ 戻すで移動を取消）'
          : '✓ 待機で行動終了'
    if (targets) return '赤く光る敵を選んで攻撃、または ✓ 待機'
    return canUndo ? '攻撃できる敵がいません · ✓ 待機（↶ 戻すで取消）' : '攻撃できる敵がいません · ✓ 待機'
  }
  const goal = campaign[game.stage].objective
  if (
    !selected &&
    goal.type === 'seize' &&
    game.units.some((u) => u.side === 'ally' && u.hp > 0 && u.x === goal.x && u.y === goal.y)
  )
    return '祠を確保中 · ▶ ターン終了で制圧'
  if (!selected && inspected && inspected.side === 'enemy' && inspected.hp > 0)
    return `${inspected.name}の移動範囲（青）と攻撃範囲（赤）を表示中`
  if (game.units.some((u) => u.side === 'ally' && u.hp > 0 && !finished(game, u)))
    return '行動する味方（◆）を選んでください'
  return '全員行動済み · ▶ ターン終了'
}

export type LegendKind = 'move' | 'attack' | 'heal' | 'enemy-move' | 'danger' | 'seize'
export type LegendItem = { kind: LegendKind; label: string }

export function legendItems(state: { game: Game; selected?: Unit; foe?: Unit; danger: boolean }): LegendItem[] {
  const { game, selected, foe, danger } = state
  const items: LegendItem[] = []
  if (selected && selected.side === 'ally' && selected.hp > 0 && !selected.done) {
    if (!selected.moved) items.push({ kind: 'move', label: '移動できる' })
    items.push(selected.heal ? { kind: 'heal', label: '回復できる' } : { kind: 'attack', label: '攻撃範囲' })
  } else if (foe) {
    items.push({ kind: 'enemy-move', label: '敵の移動' }, { kind: 'attack', label: '敵の攻撃' })
  }
  if (danger) items.push({ kind: 'danger', label: '敵の攻撃範囲' })
  if (campaign[game.stage].objective.type === 'seize') items.push({ kind: 'seize', label: '制圧目標' })
  return items
}
