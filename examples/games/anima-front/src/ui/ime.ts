/** A key event that belongs to an open IME conversion (candidate arrows, Enter to commit, Esc to cancel). */
export const isImeKey = (e: KeyboardEvent): boolean => e.isComposing || e.keyCode === 229 || e.key === 'Process'
