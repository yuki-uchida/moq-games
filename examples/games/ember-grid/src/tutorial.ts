import { distance, type Game } from './game'

export type TutorialAction = 'select' | 'move' | 'target' | 'attack' | 'turn' | 'danger'
/** undo: the selected ally can still take back its move with ↶ 戻す. */
type State = { game: Game; selected?: string; pending?: string; undo?: boolean }
export function tutorialStep({ game, selected, pending }: State, turn: boolean): number {
  if (turn) return 5
  if (pending) return 3
  const unit = game.units.find(
    (candidate) => candidate.id === selected && candidate.side === 'ally' && candidate.hp > 0
  )
  if (!unit || unit.done) return 0
  if (!unit.moved) return 1
  const target = game.units.some(
    (candidate) =>
      candidate.hp > 0 && candidate.side !== unit.side && !unit.heal && distance(unit, candidate) <= unit.range
  )
  return target ? 2 : 4
}
const messages = [
  '◆ 味方を選ぼう',
  '青い移動可能なマスを選ぼう',
  '射程内の敵を選ぼう',
  '攻撃予測を確認し、攻撃を確定',
  '✓ 待機・↶ 戻す・▶ ターン終了、または別の味方を選ぼう',
  '☷ 危険範囲 で敵の攻撃範囲を表示'
]
const key = 'ember-grid:tutorial-complete:v1'

export function createTutorial(container: HTMLElement, notice: () => void, state: () => State) {
  const hint = document.createElement('div')
  hint.id = 'tutorial'
  hint.hidden = true
  hint.innerHTML = '<span role="status" aria-live="polite"></span><button type="button">スキップ</button>'
  container.prepend(hint)
  let active = false
  let turn = false
  let attacked = false
  const update = () => {
    document.querySelectorAll('.tutorial-target').forEach((element) => element.classList.remove('tutorial-target'))
    if (!active || hint.hidden) return
    const current = state()
    const step = current.pending ? 3 : turn ? 5 : attacked ? 4 : tutorialStep(current, turn)
    // Mention and highlight ↶ 戻す only while it actually works.
    hint.querySelector('span')!.textContent =
      step === 4 && !current.undo ? '✓ 待機・▶ ターン終了、または別の味方を選ぼう' : messages[step]
    const selectors = [
      '.cell.ally:not(.done)',
      '.cell.legal',
      '.cell.target',
      '#confirm',
      current.undo ? '#wait, #undo, #end' : '#wait, #end',
      '#danger'
    ]
    document.querySelectorAll(selectors[step]).forEach((element) => element.classList.add('tutorial-target'))
  }
  const finish = () => {
    active = false
    hint.hidden = true
    update()
    try {
      localStorage.setItem(key, '1')
    } catch {
      notice()
    }
  }
  hint.querySelector('button')!.onclick = finish
  return {
    start(enabled: boolean) {
      try {
        if (localStorage.getItem(key)) return
      } catch {
        notice()
      }
      active = true
      turn = attacked = false
      hint.hidden = !enabled
      update()
    },
    hide() {
      active = false
      hint.hidden = true
      update()
    },
    setEnabled(enabled: boolean) {
      if (active) hint.hidden = !enabled
      update()
    },
    advance(action: TutorialAction) {
      if (!active || hint.hidden) return
      if (action === 'turn') turn = true
      if (action === 'attack') attacked = true
      if (action === 'danger' && turn) return finish()
      update()
    },
    update
  }
}
