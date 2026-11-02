export function confirmReplacement(message: string, action: () => void, title = '⚠ 戦闘の進行を破棄しますか？') {
  const dialog = document.createElement('dialog')
  dialog.className = 'shell-dialog'
  dialog.setAttribute('aria-labelledby', 'discard-title')
  dialog.innerHTML = `<h2 id="discard-title">${title}</h2><p>${message}</p><button type="button" data-cancel>✕ 戻る</button><button type="button" data-confirm>↻ 破棄して続ける</button>`
  document.body.append(dialog)
  dialog.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () => dialog.close()
  dialog.querySelector<HTMLButtonElement>('[data-confirm]')!.onclick = () => {
    dialog.close()
    action()
  }
  dialog.onkeydown = (event) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const next = document.activeElement?.hasAttribute('data-cancel') ? '[data-confirm]' : '[data-cancel]'
    dialog.querySelector<HTMLButtonElement>(next)!.focus()
  }
  dialog.onclose = () => dialog.remove()
  dialog.showModal()
  dialog.querySelector<HTMLButtonElement>('[data-cancel]')!.focus()
}
