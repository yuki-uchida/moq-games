import type { Point } from '../game/model'

/** DOM-free rules for the special-move presentation (time-stop, cut-in band, impact readout). */

/** Real milliseconds the simulation stops for the cut-in; the same at x1 and x2. */
export const FREEZE_MS = 650

export type BandSide = 'top' | 'bottom'
/** The band sits in the screen half opposite the target so it never hides the aim point or the impact. */
export const bandSide = (targetScreenY: number, viewportHeight: number): BandSide =>
  targetScreenY > viewportHeight / 2 ? 'top' : 'bottom'

/** At most this many cut-in bands queue up; a cast beyond that gets its ring and readout but no band. */
export const MAX_CUT_IN_CHAIN = 3

/**
 * Where the next cast's band plays when the bands still pending end at `ends` (real ms): right after the last
 * one, each FREEZE_MS long. null once MAX_CUT_IN_CHAIN bands are pending. The simulation stays stopped until
 * the latest band end, so every cast's motion and impact still play after its own band.
 */
export function chainCutIn(now: number, ends: readonly number[]): { start: number; end: number } | null {
  const pending = ends.filter((end) => end > now)
  if (pending.length >= MAX_CUT_IN_CHAIN) return null
  const start = Math.max(now, ...pending)
  return { start, end: start + FREEZE_MS }
}

/** What the engine reported one special did (structural subset of SpecialImpact, so this file stays game-free). */
export interface ImpactReport {
  targets: readonly number[]
  damage: number
  heal: number
  kills: readonly number[]
}
/** Running totals of one cast's reports: distinct targets and kills, summed damage and heal. */
export interface CastAccum {
  targets: Set<number>
  kills: Set<number>
  damage: number
  heal: number
}
export const newAccum = (): CastAccum => ({ targets: new Set(), kills: new Set(), damage: 0, heal: 0 })
export function addImpact(acc: CastAccum, impact: ImpactReport): void {
  for (const id of impact.targets) acc.targets.add(id)
  for (const id of impact.kills) acc.kills.add(id)
  acc.damage += impact.damage
  acc.heal += impact.heal
}
export type FieldKind = 'heal' | 'hold' | null
/** The readout numbers for a cast: exactly what its own reports added up to. */
export function castTally(kind: FieldKind, acc: CastAccum): CastTally {
  return {
    hits: kind ? 0 : acc.targets.size,
    damage: kind ? 0 : acc.damage,
    kills: kind ? 0 : acc.kills.size,
    held: kind === 'hold' ? acc.targets.size : 0,
    heal: kind === 'heal' ? acc.heal : 0,
    allies: kind === 'heal' ? acc.targets.size : 0
  }
}

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

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}
/**
 * Bottom y for a readout anchored bottom-centre at `pos` that clears the `taken` boxes: it steps below a
 * box it would overlap, or above it when there is no room below, staying inside `bounds`.
 */
export function stackReadout(pos: Point, width: number, height: number, taken: readonly Box[], bounds: Box, gap = 8): number {
  let y = pos.y
  for (let pass = 0; pass < taken.length; pass++) {
    const hit = taken.find(
      (b) => pos.x - width / 2 < b.right && pos.x + width / 2 > b.left && y - height < b.bottom && y > b.top
    )
    if (!hit) break
    const below = hit.bottom + gap + height,
      above = hit.top - gap
    y = below <= bounds.bottom ? below : above >= bounds.top + height ? above : y
    if (y === below || y === above) continue
    break
  }
  return y
}
