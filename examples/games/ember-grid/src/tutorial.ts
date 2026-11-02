export type TutorialAction = 'select' | 'move' | 'target' | 'attack' | 'turn' | 'danger'
const steps: TutorialAction[] = ['select', 'move', 'target', 'attack', 'turn', 'danger']
const messages = [
  '◆ 味方を選ぼう',
  '青い移動可能なマスを選ぼう',
  '射程内の敵を選ぼう',
  '攻撃予測を確認し、攻撃を確定',
  '✓ 待機 または ▶ ターン終了',
  '☷ 危険 で敵の攻撃範囲を表示'
]
export const nextTutorialStep = (step: number, action: TutorialAction) => step + Number(steps[step] === action)
const key = 'ember-grid:tutorial-complete:v1'

export function createTutorial(container: HTMLElement, notice: () => void) {
  const hint = document.createElement('div')
  hint.id = 'tutorial'
  hint.hidden = true
  hint.innerHTML = '<span role="status" aria-live="polite"></span><button type="button">スキップ</button>'
  container.prepend(hint)
  let step = -1
  const update = () => {
    document.querySelectorAll('.tutorial-target').forEach((element) => element.classList.remove('tutorial-target'))
    const selectors = ['.cell.ally:not(.done)', '.cell.legal', '.cell.target', '#confirm', '#wait, #end', '#danger']
    if (step >= 0 && !hint.hidden)
      document.querySelectorAll(selectors[step]).forEach((element) => element.classList.add('tutorial-target'))
  }
  const finish = () => {
    step = -1
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
      step = 0
      hint.hidden = !enabled
      hint.querySelector('span')!.textContent = messages[step]
      update()
    },
    hide() {
      step = -1
      hint.hidden = true
      update()
    },
    setEnabled(enabled: boolean) {
      if (step >= 0) hint.hidden = !enabled
      update()
    },
    advance(action: TutorialAction) {
      if (step < 0 || hint.hidden) return
      step = nextTutorialStep(step, action)
      if (step === steps.length) finish()
      else hint.querySelector('span')!.textContent = messages[step]
      update()
    },
    update
  }
}
