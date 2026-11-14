/**
 * Restarting a CSS animation without reading style or layout. The usual trick (remove the class, read a computed
 * style, add the class) forces a style recalculation in the middle of the game's frame. Here the class comes off
 * at once and goes back on two animation frames later: a frame is rendered in between, which cancels the running
 * (or ended) animation, and the class coming back starts it from the first keyframe.
 */

/** Classes waiting to go back on, by element. */
const pending = new Map<HTMLElement, Set<string>>()
let scheduled = false

const schedule = (run: () => void) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(run))
  else setTimeout(run, 0)
}

function flush() {
  scheduled = false
  for (const [node, classes] of pending) for (const className of classes) node.classList.add(className)
  pending.clear()
}

/** Forgets a restart that has not happened yet (the class is being taken off for good). */
export function cancelReplay(node: HTMLElement, className: string) {
  const classes = pending.get(node)
  if (!classes) return
  classes.delete(className)
  if (!classes.size) pending.delete(node)
}

/** Takes a class off for good: a restart waiting for `className` on `node` is dropped. */
export function removeClass(node: HTMLElement, ...classNames: string[]) {
  for (const className of classNames) cancelReplay(node, className)
  node.classList.remove(...classNames)
}

/** Plays the animation of `className` on `node` from its start: now if the class is not on the node, else after a frame. */
export function replay(node: HTMLElement, className: string) {
  const classes = pending.get(node)
  // Already off and on its way back: it starts when it comes back.
  if (classes?.has(className)) return
  if (!node.classList.contains(className)) {
    node.classList.add(className)
    return
  }
  node.classList.remove(className)
  if (classes) classes.add(className)
  else pending.set(node, new Set([className]))
  if (!scheduled) {
    scheduled = true
    schedule(flush)
  }
}
