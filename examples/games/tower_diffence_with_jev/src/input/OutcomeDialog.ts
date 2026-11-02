import type { GameState } from '../game/model'

function preventDismissal(event: Event): void {
  event.preventDefault()
}

/** Open the result card with the buttons that fit the outcome; the primary one takes focus. */
export function showOutcomeDialog(dialog: HTMLDialogElement, phase: GameState['phase']): void {
  dialog.addEventListener('cancel', preventDismissal)
  const button = (id: string) => dialog.querySelector<HTMLButtonElement>(`#${id}`)!,
    next = button('next'),
    again = button('retry-stage'),
    select = button('retry'),
    cleared = phase === 'cleared',
    defeat = phase === 'defeat',
    primary = cleared ? next : defeat ? again : select
  next.hidden = !cleared
  again.hidden = false
  select.hidden = false
  select.textContent = defeat ? '編成を見直す' : 'ステージ選択へ'
  for (const el of [next, again, select]) el.classList.toggle('primary', el === primary)
  if (!dialog.open) dialog.showModal()
  primary.focus({ preventScroll: true })
}
