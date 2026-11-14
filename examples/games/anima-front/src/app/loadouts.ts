/**
 * Loadout helpers for the front-end: structural repair of untrusted data, paw lists for display, placement
 * rules for the editor, and safe wrappers around the sim's loadout functions (which may throw while the sim
 * is being built — the editor then shows 「計算中」).
 */
import { ITEM_IDS, ITEMS, isWeapon, type ItemCategory, type ItemId } from '../data/items'
import { LOADOUT_SLOTS, type Hand, type Loadout, type LoadoutSlot } from '../data/loadout'
import type { SpeciesId } from '../data/species'
import { loadoutErrors, sanitizeLoadout, sustainEstimate, type SustainReport } from '../sim/api'
import { isRecord } from './storage'

const ITEM_SET = new Set<string>(ITEM_IDS)

export const emptyLoadout = (): Loadout => ({ slots: Array.from({ length: LOADOUT_SLOTS }, () => null) })

export const cloneLoadout = (l: Loadout): Loadout => ({ slots: l.slots.map((s) => (s ? { ...s } : null)) })

/** Shape-only repair: exactly 16 slots, known item ids, actives get a paw (R by default), passives none. */
export function repairLoadoutShape(raw: unknown): Loadout {
  const out = emptyLoadout()
  if (!isRecord(raw) || !Array.isArray(raw.slots)) return out
  for (let i = 0; i < LOADOUT_SLOTS; i++) {
    const slot = raw.slots[i]
    if (!isRecord(slot) || typeof slot.item !== 'string' || !ITEM_SET.has(slot.item)) continue
    const item = slot.item as ItemId
    out.slots[i] = ITEMS[item].active ? { item, hand: slot.hand === 'L' ? 'L' : 'R' } : { item }
  }
  return out
}

export const filledCount = (l: Loadout) => l.slots.reduce((n, s) => n + (s ? 1 : 0), 0)

/**
 * Full repair: shape first, then the sim's rules. The sim's result is ignored if it throws or comes back
 * malformed, or if it drops every slot of a non-empty shape-valid loadout (a stub sanitizer must never wipe a
 * player's saved build).
 */
export function repairLoadout(raw: unknown, sanitize: (l: unknown) => Loadout = sanitizeLoadout): Loadout {
  const shaped = repairLoadoutShape(raw)
  let ruled: Loadout | undefined
  try {
    ruled = sanitize(shaped)
  } catch {
    ruled = undefined
  }
  if (!ruled || !Array.isArray(ruled.slots) || ruled.slots.length !== LOADOUT_SLOTS) return enforceRules(shaped)
  const checked = repairLoadoutShape(ruled)
  if (filledCount(checked) === 0 && filledCount(shaped) > 0) return enforceRules(shaped)
  return checked
}

/** Local copy of the placement rules (DESIGN §7) so the editor can refuse a drop before the sim sees it. */
export function placementError(l: Loadout, index: number, slot: LoadoutSlot): string | null {
  const def = ITEMS[slot.item]
  let same = 0
  for (let i = 0; i < l.slots.length; i++) {
    if (i === index) continue
    const s = l.slots[i]
    if (!s || s.item !== slot.item) continue
    if (def.active) {
      if (s.hand === slot.hand) return `${def.name}は同じ手に1つまでです`
    } else same++
  }
  if (!def.active && same >= def.stack) {
    return def.stack > 1 ? `${def.name}は${def.stack}つまで重ねられます` : `${def.name}は1つまでです`
  }
  return null
}

/** Drops slots that break the placement rules (first occurrences win). */
export function enforceRules(l: Loadout): Loadout {
  const out = emptyLoadout()
  for (let i = 0; i < LOADOUT_SLOTS; i++) {
    const s = l.slots[i]
    if (s && !placementError(out, i, s)) out.slots[i] = { ...s }
  }
  return out
}

export interface PawLists {
  R: ItemId[]
  L: ItemId[]
  passive: ItemId[]
}

/** Each paw's actives in slot order plus the passives (the sim's handLists, computed locally). */
export function pawLists(l: Loadout): PawLists {
  const out: PawLists = { R: [], L: [], passive: [] }
  for (const s of l.slots) {
    if (!s) continue
    if (ITEMS[s.item].active) out[s.hand === 'L' ? 'L' : 'R'].push(s.item)
    else out.passive.push(s.item)
  }
  return out
}

export const hasWeapon = (l: Loadout) => l.slots.some((s) => s && ITEMS[s.item].active && isWeapon(s.item))

/** Errors for the editor: the sim's list (when available) merged with the local essentials. */
export function safeLoadoutErrors(l: Loadout): string[] {
  const out: string[] = []
  if (!hasWeapon(l)) out.push('武器（近接か遠隔）をどちらかの手に1つ以上入れてください')
  try {
    // The sim words the missing weapon its own way; the local line above already says it.
    for (const e of loadoutErrors(l))
      if (!out.includes(e) && !(e === '武器が1つもありません' && out.length)) out.push(e)
  } catch {
    // the sim's validator is unavailable; the local rules above still apply
  }
  return out
}

/**
 * Slots that break a placement rule (a repeated active antique in one paw, an enhancement or passive beyond its
 * stack limit): the later copies are the offenders. A missing weapon has no slot to blame, so it is not listed.
 */
export function offendingSlots(l: Loadout): number[] {
  const out: number[] = []
  const active: Record<Hand, Set<ItemId>> = { R: new Set(), L: new Set() }
  const passive = new Map<ItemId, number>()
  l.slots.forEach((s, i) => {
    if (!s) return
    const def = ITEMS[s.item]
    if (def.active) {
      const hand: Hand = s.hand === 'L' ? 'L' : 'R'
      if (active[hand].has(s.item)) out.push(i)
      active[hand].add(s.item)
    } else {
      const n = (passive.get(s.item) ?? 0) + 1
      passive.set(s.item, n)
      if (n > def.stack) out.push(i)
    }
  })
  return out
}

export function safeSustain(species: SpeciesId, l: Loadout): SustainReport | null {
  try {
    const report = sustainEstimate(species, l)
    return report && typeof report.maxAnima === 'number' ? report : null
  } catch {
    return null
  }
}

/** Short cost line for cards and HUD paw cards. */
export function costLabel(id: ItemId): string {
  const d = ITEMS[id]
  if (d.cost != null) return `${fmt(d.cost)}`
  if (d.drain != null) return `${fmt(d.drain)}/秒`
  if (d.upkeep != null) return `${fmt(d.upkeep)}/秒`
  return '0'
}

/** Detailed cost lines for the catalogue. */
export function costLines(id: ItemId): { label: string; value: string }[] {
  const d = ITEMS[id]
  const out: { label: string; value: string }[] = []
  const per = d.category === 'ranged' ? '1発' : d.category === 'melee' ? '1振り' : '1回'
  if (d.cost != null) out.push({ label: `消費（${per}）`, value: fmt(d.cost) })
  if (d.drain != null) out.push({ label: d.active ? '消費（使用中）' : '消費（滑空中）', value: `${fmt(d.drain)}/秒` })
  if (d.upkeep != null) out.push({ label: '維持', value: `${fmt(d.upkeep)}/秒` })
  if (d.cooldown != null) out.push({ label: '再使用', value: `${fmt(d.cooldown)}秒` })
  if (d.stack > 1) out.push({ label: '重ねがけ', value: `最大${d.stack}` })
  return out
}

export const fmt = (n: number) =>
  Number.isInteger(n) ? String(n) : n < 1 ? n.toFixed(2).replace(/0$/, '') : n.toFixed(1)

export const CATEGORY_ORDER: readonly ItemCategory[] = ['melee', 'ranged', 'armor', 'enhance', 'gadget']

export const itemsInCategory = (c: ItemCategory) => ITEM_IDS.filter((id) => ITEMS[id].category === c)

export const otherHand = (h: Hand): Hand => (h === 'R' ? 'L' : 'R')
