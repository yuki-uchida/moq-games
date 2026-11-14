/**
 * The axis-aligned box of a ヤドカリ wall from its prop view (position on the ground, snapped yaw). Shared by the
 * PvP visibility sets (src/net/visibility.ts) and the enemy markers' line of sight (src/render/markers.ts); the
 * same geometry as the sim's own wallBox (src/sim/props.ts).
 */
import { ITEMS } from '../data/items'
import type { V3 } from './types'

export function hermitWallBox(r: { readonly p: readonly number[]; readonly yaw: number }): { min: V3; max: V3 } {
  const u = ITEMS.hermit.use
  const w = u?.kind === 'wall' ? u.width : 4
  const hgt = u?.kind === 'wall' ? u.height : 2.5
  const alongX = Math.abs(Math.sin(r.yaw)) < 0.5 // facing ±Z → wide along X
  const hw = alongX ? w / 2 : 0.3
  const hd = alongX ? 0.3 : w / 2
  return { min: [r.p[0] - hw, r.p[1], r.p[2] - hd], max: [r.p[0] + hw, r.p[1] + hgt, r.p[2] + hd] }
}
