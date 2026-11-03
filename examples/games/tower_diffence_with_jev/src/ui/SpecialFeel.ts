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

/** Short screens (landscape phones) print one-line result cards instead of the big ones. */
export const COMPACT_MAX_HEIGHT = 560
export const compactReadouts = (viewportHeight: number): boolean => viewportHeight <= COMPACT_MAX_HEIGHT

/** The one-line form of the readout (`槍連撃 ×2 HIT · 71 · 撃破1`) for short screens. */
export function compactReadoutText(name: string, fieldKind: FieldKind, tally: CastTally, finished: boolean): string {
  if (fieldKind === 'heal') return finished ? `${name} 回復 +${Math.round(tally.heal)}` : `${name} ${tally.allies}体を回復中`
  if (fieldKind === 'hold') return `${name} ${tally.held}体 足止め`
  if (tally.hits === 0) return `${name} 命中なし`
  return `${name} ×${tally.hits} HIT · ${Math.round(tally.damage)}${tally.kills > 0 ? ` · 撃破${tally.kills}` : ''}`
}

export interface Box {
  left: number
  right: number
  top: number
  bottom: number
}
const overlaps = (a: Box, b: Box): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/**
 * Where a width x height card (anchored bottom-centre, like the CSS) goes: the spot nearest to "just above the
 * impact at `anchor`" that lies inside `area` and overlaps none of `taken` (the visible HUD boxes and the cards
 * already shown), keeping `gap` px from each. Candidates are the anchor itself plus every edge of the area and of
 * the taken boxes, so a card that no longer fits in the column flows into the next one beside it. null when
 * nothing fits; the caller then retires its oldest card and tries again.
 */
export function placeCard(
  anchor: Point,
  width: number,
  height: number,
  area: Box,
  taken: readonly Box[],
  gap = 8,
  lift = 34
): Point | null {
  const wantLeft = anchor.x - width / 2,
    wantTop = anchor.y - lift - height,
    lefts = [wantLeft, area.left, area.right - width],
    tops = [wantTop, area.top, area.bottom - height]
  for (const b of taken) {
    lefts.push(b.right + gap, b.left - gap - width)
    tops.push(b.bottom + gap, b.top - gap - height)
  }
  let best: Point | null = null,
    bestCost = Infinity
  for (const left of lefts)
    for (const top of tops) {
      const box = { left, right: left + width, top, bottom: top + height }
      if (box.left < area.left - 1e-6 || box.right > area.right + 1e-6 || box.top < area.top - 1e-6 || box.bottom > area.bottom + 1e-6) continue
      if (taken.some((b) => overlaps(box, { left: b.left - gap / 2, right: b.right + gap / 2, top: b.top - gap / 2, bottom: b.bottom + gap / 2 }))) continue
      const cost = (left - wantLeft) ** 2 + (top - wantTop) ** 2
      if (cost < bestCost) {
        bestCost = cost
        best = { x: left + width / 2, y: top + height }
      }
    }
  return best
}
