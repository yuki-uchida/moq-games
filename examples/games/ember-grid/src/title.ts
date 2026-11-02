import { missions } from './game'
import { unlocked, type Difficulty, type Save } from './save'
import { reducedMotion } from './settings'

export function showTitle(
  save: Save | undefined,
  actions: {
    start: (difficulty: Difficulty) => void
    continue: (stage?: number) => void
    settings: () => void
    help: () => void
  }
) {
  const title = document.createElement('section')
  title.className = 'title-screen'
  title.setAttribute('aria-label', 'タイトル')
  title.innerHTML = `<div class="title-embers" aria-hidden="true"></div><div class="title-art" aria-hidden="true">${['archer', 'soldier', 'mage'].map((role) => `<img src="${import.meta.env.BASE_URL}tower-defense-art/title/${role}.png" alt="">`).join('')}</div><div class="title-content"><small>EMBER GRID · TACTICAL RPG</small><h1>デスガイヤ</h1><p>灰の彼方へ、燈をつなぐ。</p><nav><button data-action="continue" ${save ? '' : 'disabled'}>▶ つづきから${save ? `<small>${missions[save.suspend?.stage ?? save.furthest].name} · ${save.suspend?.turn ?? 1} ターン · ${save.difficulty === 'casual' ? 'カジュアル' : 'クラシック'}</small>` : ''}</button><button data-action="new">✦ はじめから</button><button data-action="chapters" ${save ? '' : 'disabled'}>⚑ 章を選ぶ</button><button data-action="settings">⚙ 設定</button><button data-action="help">? 遊び方</button></nav><p class="title-loading" role="status">3D モデルを準備中…</p></div>`
  document.body.append(title)
  const main = document.querySelector<HTMLElement>('#app main')!
  main.inert = true
  document.documentElement.classList.toggle('reduce-motion', reducedMotion())
  const close = () => {
    main.inert = false
    title.remove()
  }
  title.querySelector<HTMLButtonElement>('[data-action=continue]')!.onclick = () => {
    close()
    actions.continue()
  }
  title.querySelector<HTMLButtonElement>('[data-action=settings]')!.onclick = actions.settings
  title.querySelector<HTMLButtonElement>('[data-action=help]')!.onclick = actions.help
  title.querySelector<HTMLButtonElement>('[data-action=new]')!.onclick = () => {
    const dialog = document.createElement('dialog')
    dialog.className = 'shell-dialog'
    dialog.innerHTML = `<h2>難易度を選択</h2><p>カジュアルは倒れた仲間が章の後に復帰。クラシックは永久離脱します。</p><button data-difficulty="casual">◆ カジュアル</button><button data-difficulty="classic">⚔ クラシック</button><button data-cancel>戻る</button>`
    document.body.append(dialog)
    dialog.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(
      (button) =>
        (button.onclick = () => {
          if (save && !window.confirm('現在のセーブを上書きしますか？')) return
          const difficulty = button.dataset.difficulty as Difficulty
          dialog.close()
          close()
          actions.start(difficulty)
        })
    )
    dialog.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () => dialog.close()
    dialog.onclose = () => dialog.remove()
    dialog.showModal()
  }
  title.querySelector<HTMLButtonElement>('[data-action=chapters]')!.onclick = () => {
    if (!save) return
    const dialog = document.createElement('dialog')
    dialog.className = 'shell-dialog'
    dialog.innerHTML = `<h2>⚑ 章を選ぶ</h2>${missions.map((mission, index) => `<button data-stage="${index}" ${unlocked(save, index) ? '' : 'disabled'}>${unlocked(save, index) ? mission.name : '🔒 ？？？'}</button>`).join('')}<button data-cancel>戻る</button>`
    document.body.append(dialog)
    dialog.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(
      (button) =>
        (button.onclick = () => {
          dialog.close()
          close()
          actions.continue(Number(button.dataset.stage))
        })
    )
    dialog.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () => dialog.close()
    dialog.onclose = () => dialog.remove()
    dialog.showModal()
  }
  title.querySelector<HTMLButtonElement>(save ? '[data-action=continue]' : '[data-action=new]')!.focus()
  return (message: string) => {
    const status = title.querySelector('.title-loading')
    if (status) status.textContent = message
  }
}
