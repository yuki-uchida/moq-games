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
const isLit = (p: PropView) => p.solved === true || p.state === 'on' || (p.kind === 'crystal' && p.state === 'hit')

/** Crystals (stage 1) and valves (stage 2) work like moonstones: the sim latches the group when all are lit at once. */
/** Bell chip (stage 3): lit bells of a group; a solved group is complete and stays complete whatever rings later. */
export function bellProgress(
  bells: readonly PropView[],
  litNow: readonly boolean[]
): { lit: boolean[]; n: number; complete: boolean } {
  const solved = bells.some((b) => b.solved)
  const lit = bells.map((_, i) => solved || litNow[i])
  const n = lit.filter(Boolean).length
  return { lit, n, complete: solved || (n > 0 && n === bells.length) }
}

/** The stones of the group the hero is working on, left to right (empty when none): the room's nearest, else nearby outside rooms. */
function nearestGroup(
  kind: 'moonstone' | 'crystal' | 'valve' | 'bell',
  props: readonly PropView[],
  rooms: StageInfo['rooms'] | undefined,
  ref: { x: number; y: number } | undefined
): { group: string; stones: PropView[] } | undefined {
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
  return { group: pick.group!, stones }
}

export function groupProgress(
  kind: 'moonstone' | 'crystal' | 'valve',
  props: readonly PropView[],
  rooms: StageInfo['rooms'] | undefined,
  ref: { x: number; y: number } | undefined
): MoonProgress | undefined {
  const g = nearestGroup(kind, props, rooms, ref)
  if (!g) return undefined
  const lit = g.stones.map(isLit)
  const n = lit.filter(Boolean).length
  return { group: g.group, lit, n, total: g.stones.length, complete: n === g.stones.length }
}

/** How long the solved bell chip ("そろった！") stays after the group was solved, in seconds. */
export const BELL_DONE_SHOW = 3

/**
 * The bell chip: shown while the hero works on a bell group that is not solved yet (same room / nearby rule as the other
 * group chips), with the bells currently ringing lit. A solved group shows complete for BELL_DONE_SHOW seconds after
 * `solvedAt` (the time the HUD saw it solved; undefined or -Infinity: already solved earlier, never shown).
 */
export function bellChip(
  bells: readonly PropView[],
  rooms: StageInfo['rooms'] | undefined,
  ref: { x: number; y: number } | undefined,
  ringing: (b: PropView) => boolean,
  solvedAt: (group: string) => number | undefined,
  now: number
): (MoonProgress & { solved: boolean }) | undefined {
  const g = nearestGroup('bell', bells, rooms, ref)
  if (!g) return undefined
  const { lit, n, complete } = bellProgress(g.stones, g.stones.map(ringing))
  const solved = g.stones.some((b) => b.solved)
  if (solved) {
    const at = solvedAt(g.group)
    if (at === undefined || now - at >= BELL_DONE_SHOW) return undefined
  }
  return { group: g.group, lit, n, total: g.stones.length, complete, solved }
}
