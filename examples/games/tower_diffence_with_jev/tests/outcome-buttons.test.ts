import { describe, expect, it } from 'vitest'
import { showOutcomeDialog } from '../src/input/OutcomeDialog'

function fakeDialog() {
  const button = () => ({ hidden: false, textContent: '', classList: { toggle: () => {} }, focus: () => {} })
  const buttons: Record<string, ReturnType<typeof button>> = { next: button(), 'retry-stage': button(), retry: button() }
  const dialog = {
    open: false,
    addEventListener: () => {},
    querySelector: (selector: string) => buttons[selector.slice(1)],
    showModal() {
      this.open = true
    }
  }
  return { dialog: dialog as unknown as HTMLDialogElement, buttons }
}

describe('outcome dialog buttons', () => {
  it('offers to revisit the formation after a normal defeat', () => {
    const { dialog, buttons } = fakeDialog()
    showOutcomeDialog(dialog, 'defeat')
    expect(buttons.retry.textContent).toBe('編成を見直す')
  })
  it('sends a 総力戦 defeat to the stage select instead: every owned ally already fought', () => {
    const { dialog, buttons } = fakeDialog()
    showOutcomeDialog(dialog, 'defeat', true)
    expect(buttons.retry.textContent).toBe('ステージ選択へ')
  })
})
