/** Depth-sort keys for props whose art reaches far above their foot. Pure. */
import type { PropView } from '../sim/types'
import { TILE } from '../vocab'

/** How far (px) the boss door's art rises above its foot (anchor [96, 160] in a 192×192 frame). */
export const BOSSDOOR_RISE = 2.5 * TILE

/**
 * The y a prop is depth-sorted at, given its drawn position `y`. Carried things float above their carriers; open
 * gates sink into the floor. The boss door sorts at the top of its art: it stands in the boss room's south wall, so
 * anyone in the room near it (or passing through its opening) is drawn in front of it rather than swallowed by it,
 * and anything south of it (outside the room) is in front anyway.
 */
export function propSortY(p: Pick<PropView, 'kind' | 'state' | 'z'>, y: number): number {
  if ((p.z ?? 0) > 0) return y + 30
  if (p.kind === 'gate' && p.state === 'open') return y - 40
  if (p.kind === 'bossdoor') return y - BOSSDOOR_RISE
  return y
}
