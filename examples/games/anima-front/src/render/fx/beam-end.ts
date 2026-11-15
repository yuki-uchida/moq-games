/**
 * Where to draw the end of a デンキウナギ beam: the point the sim resolved this tick (HandView.beamEnd — walls,
 * ヤドカリ walls, the solid 灯台 / 巣核, actors, or the range), so the bolt never runs past what stopped it. The render
 * box grid along the aim is only a fallback for a snapshot without it.
 */
import type { HandView, V3 } from '../../sim/types'

export const BEAM_RANGE = 35

export function beamEndPoint(
  hand: Pick<HandView, 'beamEnd'>,
  from: readonly number[],
  dir: readonly number[],
  grid?: { raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number }
): V3 {
  if (hand.beamEnd) return [hand.beamEnd[0], hand.beamEnd[1], hand.beamEnd[2]]
  const t = grid ? grid.raycast(from[0], from[1], from[2], dir[0], dir[1], dir[2], BEAM_RANGE) : BEAM_RANGE
  return [from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t]
}
