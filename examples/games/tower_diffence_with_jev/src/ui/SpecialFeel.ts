import type { Point } from '../game/model'

/** DOM-free rules for the special-move presentation (time-stop, cut-in band, impact readout). */

/** Real milliseconds the simulation stops for the cut-in; the same at x1 and x2. */
export const FREEZE_MS = 650

export type BandSide = 'top' | 'bottom'
/** The band sits in the screen half opposite the target so it never hides the aim point or the impact. */
export const bandSide = (targetScreenY: number, viewportHeight: number): BandSide =>
  targetScreenY > viewportHeight / 2 ? 'top' : 'bottom'

/** A freeze starts only when none is running, so overlapping casts never stack a longer stop. */
export const nextFreezeUntil = (now: number, current: number): number => (now < current ? current : now + FREEZE_MS)

/** One unit's hp change seen between two UI frames. */
export interface HpDelta extends Point {
  id: number
  /** Hp lost (damage) or gained (heal), always positive. */
  amount: number
  killed?: boolean
}

export interface ImpactSummary {
  hits: number
  damage: number
  kills: number
}

/** Enemies that lost hp inside the circle around `point`, with the total damage and the kills among them. */
export function summarizeImpact(drops: readonly HpDelta[], point: Point, radius: number): ImpactSummary {
  const out: ImpactSummary = { hits: 0, damage: 0, kills: 0 }
  for (const d of drops) {
    if (Math.hypot(d.x - point.x, d.y - point.y) > radius) continue
    out.hits++
    out.damage += d.amount
    if (d.killed) out.kills++
  }
  return out
}

/** Sum of heals landing inside the circle. */
export const healInArea = (gains: readonly HpDelta[], point: Point, radius: number): number =>
  gains.reduce((sum, g) => sum + (Math.hypot(g.x - point.x, g.y - point.y) <= radius ? g.amount : 0), 0)

export interface CastTally {
  hits: number
  damage: number
  kills: number
  /** Enemies slowed or rooted by a field special. */
  held: number
  heal: number
  /** Allies inside a healing circle. */
  allies: number
}
export interface ReadoutText {
  title: string
  main: string
  sub: string
  kills: string
}

/** What the big readout says. `fieldKind` is 'heal' for the healer, 'hold' for frost/ranger, null for damage specials. */
export function readoutText(name: string, fieldKind: 'heal' | 'hold' | null, tally: CastTally, finished: boolean): ReadoutText {
  if (fieldKind === 'heal')
    return finished
      ? { title: name, main: `回復 +${Math.round(tally.heal)}`, sub: '', kills: '' }
      : { title: name, main: `${tally.allies}体`, sub: '範囲内の味方を回復中', kills: '' }
  if (fieldKind === 'hold')
    return { title: name, main: `${tally.held}体 足止め`, sub: '', kills: '' }
  if (tally.hits === 0) return { title: name, main: '命中なし', sub: '', kills: '' }
  return {
    title: name,
    main: `×${tally.hits} HIT`,
    sub: `${Math.round(tally.damage)} ダメージ`,
    kills: tally.kills > 0 ? `撃破 ${tally.kills}` : ''
  }
}

/**
 * Bottom-centre anchor for a readout box of width x height: above the impact when there is room, otherwise
 * below it, always inside `bounds` (fixed screen px: under the HUD, above the skill bar).
 */
export function placeReadout(
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: { left: number; right: number; top: number; bottom: number },
  gap = 34
): Point {
  const hw = width / 2,
    top = bounds.top + height,
    above = y - gap
  return {
    x: Math.min(Math.max(x, bounds.left + hw), Math.max(bounds.left + hw, bounds.right - hw)),
    y: Math.min(Math.max(above >= top ? above : y + gap + height, top), Math.max(top, bounds.bottom))
  }
}
