/** Unlock synchronously in an activation gesture, including touch releases. */
export function bindAudioUnlock(
  target: EventTarget,
  unlock: () => void,
): () => void {
  const onGesture = (event: Event) => {
    if (!event.isTrusted) return
    // Touch/pen pointerdown precedes activation; their release activates instead.
    if (
      event.type === 'pointerdown' &&
      (event as PointerEvent).pointerType !== 'mouse'
    )
      return
    if (
      event.type === 'pointerup' &&
      (event as PointerEvent).pointerType === 'mouse'
    )
      return
    unlock()
  }
  const events = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const
  for (const event of events)
    target.addEventListener(event, onGesture, { capture: true })
  return () => {
    for (const event of events)
      target.removeEventListener(event, onGesture, { capture: true })
  }
}
