/**
 * Stops the browser from zooming the page while the touch controls are in play. Holding the pad with one thumb
 * and pressing jump or bite with the other is a two-finger touch, which phones read as a pinch. iOS Safari ignores
 * `user-scalable=no`, and `touch-action` alone misses a thumb that lands between the buttons, so multi-finger
 * touches and Safari's own gesture events are cancelled here. The controls read pointer events, which still arrive.
 * Outside play (menus, help) the page can still be pinched.
 */
export const ZOOM_LOCK_CLASS = 'zoom-lock'

/** True when a touch event carries more than one finger: the start of a pinch. */
export function isPinch(event: Pick<TouchEvent, 'touches'>): boolean {
  return event.touches.length > 1
}

/** Installs the listeners on `doc`; they act only while `<html>` carries `ZOOM_LOCK_CLASS`. Returns a disposer. */
export function installZoomGuard(doc: Document = document): () => void {
  const locked = () => doc.documentElement.classList.contains(ZOOM_LOCK_CLASS)
  const onTouch = (event: TouchEvent) => {
    if (locked() && isPinch(event) && event.cancelable) event.preventDefault()
  }
  const onGesture = (event: Event) => {
    if (locked()) event.preventDefault()
  }
  const options = { passive: false, capture: true } as const
  doc.addEventListener('touchstart', onTouch, options)
  doc.addEventListener('touchmove', onTouch, options)
  // Safari's pinch events (GestureEvent); other browsers never send them.
  for (const type of ['gesturestart', 'gesturechange'] as const) doc.addEventListener(type, onGesture, options)
  return () => {
    doc.removeEventListener('touchstart', onTouch, options)
    doc.removeEventListener('touchmove', onTouch, options)
    for (const type of ['gesturestart', 'gesturechange'] as const) doc.removeEventListener(type, onGesture, options)
  }
}

/** Turns the lock on or off (the App follows the touch controls). */
export function setZoomLock(on: boolean, doc: Document = document) {
  doc.documentElement.classList.toggle(ZOOM_LOCK_CLASS, on)
}
