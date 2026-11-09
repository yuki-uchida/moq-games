/**
 * Moonstone progress for the HUD (pure, so it is unit tested without a DOM). Stones that share a `group` are solved
 * together (the sim latches the group only when every stone glows at the same time), so the counter covers the whole
 * group, wherever its stones stand. Ungrouped guide stones have no counter.
 */
import type { PropView, StageInfo } from '../sim/types'
import { TILE } from '../vocab'

export interface MoonProgress {
  group: string
  /** Lit state of each stone of the group, left to right. */
  lit: boolean[]
  n: number
  total: number
  /** Every stone of the group glows at once. */
  complete: boolean
}

/** Farthest a grouped stone may be (art px) to count as "nearby" when the hero stands outside every room. */
const NEAR = 12 * TILE

const inRoom = (r: StageInfo['rooms'][number], x: number, y: number) =>
  x >= r.x * TILE && y >= r.y * TILE && x < (r.x + r.w) * TILE && y < (r.y + r.h) * TILE

/** The group the hero is working on: the nearest grouped stone in the hero's room, else (outside any room) the nearest one close by. */
export function moonProgress(
  props: readonly PropView[],
  rooms: StageInfo['rooms'] | undefined,
  ref: { x: number; y: number } | undefined
): MoonProgress | undefined {
  return groupProgress('moonstone', props, rooms, ref)
}

/** Whether a prop of a grouped puzzle currently counts as solved-in-progress ('hit' crystals have just been lit). */
const isLit = (p: PropView) => p.state === 'on' || (p.kind === 'crystal' && p.state === 'hit')

/** Crystals (stage 1) and valves (stage 2) work like moonstones: the sim latches the group when all are lit at once. */
export function groupProgress(
  kind: 'moonstone' | 'crystal' | 'valve',
  props: readonly PropView[],
  rooms: StageInfo['rooms'] | undefined,
  ref: { x: number; y: number } | undefined
): MoonProgress | undefined {
  if (!ref) return undefined
  const grouped = props.filter((p) => p.kind === kind && p.group !== undefined)
  if (!grouped.length) return undefined
  // The smallest room containing the hero, as the sim's room lookup does.
  let room: StageInfo['rooms'][number] | undefined
  for (const r of rooms ?? []) if (inRoom(r, ref.x, ref.y) && (!room || r.w * r.h < room.w * room.h)) room = r
  const d = (p: PropView) => Math.hypot(p.x - ref.x, p.y - ref.y)
  // Inside a room only that room's stones count (a stone behind the wall is another puzzle); outside any room, the near ones.
  const pool = room ? grouped.filter((p) => inRoom(room, p.x, p.y)) : grouped.filter((p) => d(p) < NEAR)
  const pick = pool.reduce<PropView | undefined>((best, p) => (!best || d(p) < d(best) ? p : best), undefined)
  if (!pick) return undefined
  const stones = grouped.filter((p) => p.group === pick.group).sort((a, b) => a.x - b.x || a.y - b.y)
  const lit = stones.map(isLit)
  const n = lit.filter(Boolean).length
  return { group: pick.group!, lit, n, total: stones.length, complete: n === stones.length }
}
