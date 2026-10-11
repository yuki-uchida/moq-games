import type { GameState } from '../game/model'

function preventDismissal(event: Event): void {
  event.preventDefault()
}

export function showOutcomeDialog(dialog: HTMLDialogElement, phase: GameState['phase']): void {
  dialog.addEventListener('cancel', preventDismissal)
  dialog.querySelector<HTMLButtonElement>('#next')!.hidden = phase !== 'cleared'
  dialog.querySelector<HTMLButtonElement>('#retry')!.hidden = phase === 'cleared'
  if (!dialog.open) dialog.showModal()
  dialog.querySelector<HTMLButtonElement>(phase === 'cleared' ? '#next' : '#retry')!.focus({ preventScroll: true })
}
