/** Delivered items whose acceptor already draws them (the hook's hung bell, the ram cradle's log). Pure. */
import type { PropView } from '../sim/types'

/** Item kind → the acceptor kind whose filled ('on') art shows that item in place. */
const SHOWN_BY: Record<string, string> = { goldbell: 'hook', log: 'ramslot' }

/** How far (px) a resting item may sit from its acceptor and still count as delivered (guest interpolation). */
const NEAR = 4

/**
 * Ids of the props not to draw: an item resting on the filled acceptor that pictures it. Decided from the view
 * alone (kinds, states and positions; a delivered item is set onto its acceptor's centre), so host and guests agree.
 * The acorn and the cheese stay drawn: their pedestal and scale art is empty.
 */
export function hiddenDelivered(props: readonly PropView[]): Set<number> {
  const hidden = new Set<number>()
  for (const p of props) {
    const acc = SHOWN_BY[p.kind]
    if (!acc || (p.z ?? 0) > 0 || p.state === 'lifted' || p.state === 'gripped') continue
    if (
      props.some(
        (q) => q.kind === acc && q.state === 'on' && Math.abs(q.x - p.x) <= NEAR && Math.abs(q.y - p.y) <= NEAR
      )
    )
      hidden.add(p.id)
  }
  return hidden
}
