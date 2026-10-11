export class PanelDialog {
  private returnFocus?: HTMLElement

  constructor(
    private dialog: HTMLDialogElement,
    private triggers: HTMLElement[],
    private initialFocus: HTMLElement
  ) {
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      this.close()
    })
  }

  get isOpen(): boolean {
    return this.dialog.open
  }

  open(opener = document.activeElement): void {
    if (this.dialog.open) return
    this.returnFocus = opener instanceof HTMLElement ? opener : undefined
    this.dialog.showModal()
    for (const trigger of this.triggers) trigger.setAttribute('aria-expanded', 'true')
    this.initialFocus.focus({ preventScroll: true })
  }

  close(restoreFocus = true): void {
    if (!this.dialog.open) return
    this.dialog.close()
    for (const trigger of this.triggers) trigger.setAttribute('aria-expanded', 'false')
    const target = this.returnFocus
    this.returnFocus = undefined
    if (restoreFocus && target?.isConnected && !target.closest('[inert]')) target.focus({ preventScroll: true })
  }
}
