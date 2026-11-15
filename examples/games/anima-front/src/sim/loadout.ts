/**
 * Loadout rules (DESIGN §7): repair, validation messages, paw lists, the derived build (mods, armour, upkeep) and
 * the editor's sustain estimate.
 *
 * Sustain fight model (DESIGN §7, documented here because the editor shows it). Calibrated against the bot
 * economy drill of scripts/anima-front-balance.mjs (anima burnt per second of actual fighting in whole missions):
 *   burn = upkeep (online passives)
 *        + Σ per paw: mean cost rate of the paw's weapons × 0.15 duty (aiming, moving and switching take the rest)
 *        + Σ active gadgets: cost per use / max(cooldown, 15 s)
 *        + Σ held / toggled drains (non-weapon `drain` antiques, once each): drain/s × the assumed share of a fight
 *          they run (DRAIN_SHARE: コノハムシ cloak 40 %, アルマジロ shield 20 % per paw that carries it — both paws
 *          are assumed raised together —, モモンガ glide 10 %; the owl glides free)
 *        + 0.6 anima/s incoming damage × (1 − armour reduction)
 *   armour reduction = 1 − (1 − passive armour %) × (1 − share of hits negated by クラゲヴェール (1 / every))
 *   net = burn − a third of natural regeneration (fights leave little quiet time; shards make up part of it);
 *   sustain = max anima / net  (Infinity when net ≤ 0).
 * A weapon's cost rate is its per-use cost (with cost mods) divided by its cycle time (interval, charge, wind-up
 * or lock time, divided by the rate mod, plus the antique's cooldown); beams use their drain per second.
 * Raising any cost, upkeep or rate can only raise `burn`, so a more expensive build never reports a longer sustain.
 */
import { ITEM_IDS, ITEMS, isWeapon, type ItemCategory, type ItemDef, type ItemId } from '../data/items'
import { LOADOUT_SLOTS, type Hand, type Loadout, type LoadoutSlot } from '../data/loadout'
import { SPECIES, type SpeciesId } from '../data/species'
import type { SustainReport } from './api'
import { DASH_COST, DT, REGEN_RATE } from './constants'
import type { Build, Mods } from './state'

const ITEM_SET = new Set<string>(ITEM_IDS)
const round = (x: number) => Math.round(x * 100) / 100
const isItemId = (x: unknown): x is ItemId => typeof x === 'string' && ITEM_SET.has(x)

/** Repairs anything into a valid 16-slot loadout (drops offending slots; guarantees one weapon). */
export function sanitizeLoadout(input: unknown): Loadout {
  const raw: unknown[] =
    input && typeof input === 'object' && Array.isArray((input as { slots?: unknown }).slots)
      ? ((input as { slots: unknown[] }).slots as unknown[])
      : []
  const slots: (LoadoutSlot | null)[] = []
  const counts = new Map<ItemId, number>()
  const inHand: Record<Hand, Set<ItemId>> = { R: new Set(), L: new Set() }
  for (let i = 0; i < LOADOUT_SLOTS; i++) {
    const s = raw[i] as { item?: unknown; hand?: unknown } | null | undefined
    if (!s || typeof s !== 'object' || !isItemId(s.item)) {
      slots.push(null)
      continue
    }
    const item = s.item
    const def = ITEMS[item]
    if (def.active) {
      const given = s.hand === 'R' || s.hand === 'L' ? (s.hand as Hand) : null
      let hand: Hand | null = given
      if (!hand) {
        const free = (['R', 'L'] as Hand[]).filter((h) => !inHand[h].has(item))
        hand = free.length === 2 ? (inHand.L.size < inHand.R.size ? 'L' : 'R') : (free[0] ?? null)
      } else if (inHand[hand].has(item)) hand = null
      if (!hand) {
        slots.push(null)
        continue
      }
      inHand[hand].add(item)
      slots.push({ item, hand })
    } else {
      const n = counts.get(item) ?? 0
      if (n >= def.stack) {
        slots.push(null)
        continue
      }
      counts.set(item, n + 1)
      slots.push({ item })
    }
  }
  if (!slots.some((s) => s && isWeapon(s.item) && s.hand)) {
    let at = slots.indexOf(null)
    if (at < 0) {
      at = LOADOUT_SLOTS - 1
      for (let i = LOADOUT_SLOTS - 1; i >= 0; i--) {
        const s = slots[i]
        if (s && !ITEMS[s.item].active) {
          at = i
          break
        }
      }
    }
    slots[at] = { item: 'bee', hand: inHand.R.has('bee') ? 'L' : 'R' }
  }
  return { slots }
}

/** Japanese validation messages for the editor (empty when valid). */
export function loadoutErrors(loadout: Loadout): string[] {
  const out: string[] = []
  const add = (m: string) => {
    if (!out.includes(m)) out.push(m)
  }
  const slots = Array.isArray(loadout?.slots) ? loadout.slots : []
  if (slots.length !== LOADOUT_SLOTS) add(`スロットは${LOADOUT_SLOTS}個にしてください`)
  const counts = new Map<ItemId, number>()
  const inHand: Record<Hand, Set<ItemId>> = { R: new Set(), L: new Set() }
  let weapon = false
  for (const s of slots) {
    if (!s) continue
    if (!isItemId(s.item)) {
      add('不明なアンティークがあります')
      continue
    }
    const def = ITEMS[s.item]
    if (def.active) {
      if (s.hand !== 'R' && s.hand !== 'L') {
        add(`${def.name}を持たせる手（右・左）を決めてください`)
        continue
      }
      if (inHand[s.hand].has(s.item)) add(`${def.name}は同じ手に1つまでです`)
      inHand[s.hand].add(s.item)
      if (isWeapon(s.item)) weapon = true
    } else {
      if (s.hand !== undefined) add(`${def.name}は手に持てません`)
      const n = (counts.get(s.item) ?? 0) + 1
      counts.set(s.item, n)
      if (n === def.stack + 1) add(`${def.name}は${def.stack}個までです`)
    }
  }
  if (!weapon) add('武器が1つもありません')
  return out
}

/** Each paw's active antiques (slot order) and the passive antiques (duplicates kept). */
export function handLists(loadout: Loadout): { R: ItemId[]; L: ItemId[]; passive: ItemId[] } {
  const R: ItemId[] = []
  const L: ItemId[] = []
  const passive: ItemId[] = []
  for (const s of loadout.slots) {
    if (!s || !isItemId(s.item)) continue
    if (ITEMS[s.item].active) {
      if (s.hand === 'L') L.push(s.item)
      else R.push(s.item)
    } else passive.push(s.item)
  }
  return { R, L, passive }
}

export const emptyMods = (): Mods => ({
  meleeDamage: 0,
  meleeCost: 0,
  rangedDamage: 0,
  rangedCost: 0,
  spread: 0,
  armorEffect: 0,
  armorUpkeep: 0,
  cost: 0,
  rate: 0,
  regen: 0,
  regenDelay: 0,
  speed: 0,
  dashCooldown: 0,
  maxAnima: 0
})

/** The mods of a build whose passives are offline (critical anima): none. */
export const NO_MODS: Readonly<Mods> = Object.freeze(emptyMods())

/**
 * The enhancement mods that apply to a player right now: the build's mods while passives are online, none while
 * they are offline (critical anima, DESIGN §5). Allocation-free; the result must not be mutated.
 */
export const modsOf = (p: { online: boolean; build: { mods: Mods } }): Readonly<Mods> =>
  p.online ? p.build.mods : NO_MODS

/** Sums the mod passives of a passive list (duplicates kept) into a fresh Mods object. */
function modsFromPassives(passives: readonly ItemId[]): Mods {
  const mods = emptyMods()
  for (const id of passives) {
    const p = ITEMS[id].passive
    if (p?.kind !== 'mod') continue
    for (const k of Object.keys(p) as (keyof typeof p)[]) {
      if (k === 'kind') continue
      mods[k as keyof Mods] += p[k] as number
    }
  }
  return mods
}

/**
 * Effective anima price of an active antique for a player view: `cost` per use or `drain` per second (beams,
 * shields, ...), with the passive list's mods applied while `online` and no mods while passives are offline.
 */
export function effectiveCost(
  passives: readonly ItemId[],
  online: boolean,
  item: ItemId
): { cost?: number; drain?: number } {
  const def = ITEMS[item]
  const m = online ? modsFromPassives(passives) : NO_MODS
  const out: { cost?: number; drain?: number } = {}
  if (def.cost !== undefined) out.cost = itemCost(m, def, def.cost)
  if (def.drain !== undefined) out.drain = itemCost(m, def, def.drain)
  return out
}

/**
 * The sim's exact usability rule (anima.ts `spend`): a per-use cost needs anima >= cost + 1, a held drain needs
 * anima >= drain x DT + 1 for each tick. An antique with neither is always affordable.
 */
export function affordable(anima: number, price: { cost?: number; drain?: number }): boolean {
  if (price.cost !== undefined && anima < price.cost + 1) return false
  if (price.drain !== undefined && anima < price.drain * DT + 1) return false
  return true
}

/** Multiplier on every anima cost/upkeep from ナマケモノ-style mods (never below 20 %). */
export const costScale = (m: Mods) => Math.max(0.2, 1 + m.cost)
/** Multiplier on cycle times from rate mods (slower when negative). */
export const periodScale = (m: Mods) => 1 / Math.max(0.3, 1 + m.rate)

/** Anima cost of one use of an active antique with this build's mods (`base` defaults to cost or drain). */
export function itemCost(m: Mods, def: ItemDef, base = def.cost ?? def.drain ?? 0): number {
  const cat = def.category
  const catMod = cat === 'melee' ? m.meleeCost : cat === 'ranged' ? m.rangedCost : cat === 'armor' ? m.armorUpkeep : 0
  return base * Math.max(0.2, 1 + catMod) * costScale(m)
}

// ---------------------------------------------------------------------------------------------------------------
// The one cost pipeline: every spend and drain in the sim and every number in the editor's estimate comes from
// these functions, called with modsOf(p) in the sim (the build's mods while passives are online, none offline) and
// with the build's mods in the editor (which assumes passives online).

/** Anima per second of a passive's upkeep. */
export const upkeepOf = (m: Mods, def: ItemDef) => itemCost(m, def, def.upkeep ?? 0)

/** Anima per second of gliding with モモンガ (the owl glides for free). */
export const glideDrain = (species: SpeciesId, m: Mods) =>
  SPECIES[species].trait === 'glide' ? 0 : itemCost(m, ITEMS.momonga, ITEMS.momonga.drain ?? 1.2)

/** Anima per dash (the penguin's belly slide is free). */
export const dashCost = (species: SpeciesId, m: Mods) =>
  SPECIES[species].trait === 'bellySlide' ? 0 : DASH_COST * costScale(m)

/** Anima per second of a held / toggled antique's drain (beam, shield, cloak; glide via glideDrain). */
export const drainOf = (m: Mods, def: ItemDef) => itemCost(m, def, def.drain ?? 0)

/** The editor's per-antique numbers of a loadout (same functions as the sim). */
export interface ItemCostLine {
  item: ItemId
  /** Anima per use (an antique with a per-use cost). */
  perUse?: number
  /** Anima per second while running (drains, per paw) or as upkeep. */
  perSecond?: number
}

/** Per-antique costs of a loadout for a species, with passives online (the editor) or offline. */
export function itemCosts(species: SpeciesId, loadout: Loadout, online = true): ItemCostLine[] {
  const b = computeBuild(species, sanitizeLoadout(loadout))
  const m = online ? b.mods : NO_MODS
  const out: ItemCostLine[] = []
  for (const id of new Set([...b.R, ...b.L, ...b.passives])) {
    const def = ITEMS[id]
    const line: ItemCostLine = { item: id }
    if (def.cost !== undefined) line.perUse = itemCost(m, def)
    // Passives (glide, upkeep) do not run at all while offline.
    if (def.passive?.kind === 'glide') line.perSecond = online ? glideDrain(species, m) : 0
    else if (def.drain !== undefined) line.perSecond = drainOf(m, def)
    else if (def.upkeep !== undefined) line.perSecond = online ? upkeepOf(m, def) : 0
    if (line.perUse !== undefined || line.perSecond !== undefined) out.push(line)
  }
  return out
}

/** Derives the build (mods, armour, upkeep, max anima) from a sanitized loadout. */
export function computeBuild(speciesId: SpeciesId, loadout: Loadout): Build {
  const lists = handLists(loadout)
  const mods = modsFromPassives(lists.passive)
  const ae = 1 + mods.armorEffect
  let armorReduce = 0
  let armorSpeed = 0
  let reflect = 0
  let contactDps = 0
  let negateEvery = 0
  let glider = false
  let upkeep = 0
  for (const id of lists.passive) {
    const def = ITEMS[id]
    const p = def.passive
    if (!p) continue
    if (p.kind === 'armor') {
      armorReduce = 1 - (1 - armorReduce) * (1 - p.reduce * ae)
      armorSpeed += p.speed
    } else if (p.kind === 'reflect') {
      reflect += p.melee * ae
      contactDps += p.contactDps * ae
    } else if (p.kind === 'negate') negateEvery = p.every / ae
    else if (p.kind === 'glide') glider = true
    if (def.upkeep) upkeep += upkeepOf(mods, def)
  }
  return {
    R: lists.R,
    L: lists.L,
    passives: lists.passive,
    mods,
    armorReduce: Math.min(0.8, armorReduce),
    armorSpeed,
    reflect,
    contactDps,
    negateEvery,
    glider,
    upkeep,
    maxAnima: SPECIES[speciesId].anima + mods.maxAnima
  }
}

/** Seconds of one use cycle of an active antique (before the rate mod), plus its cooldown. */
function cycle(def: ItemDef, m: Mods): number {
  const u = def.use
  if (!u) return 1
  let base = 1
  switch (u.kind) {
    case 'combo':
    case 'slash':
    case 'semi':
    case 'spread':
    case 'lob':
      base = u.interval
      break
    case 'auto':
      base = 1 / u.rate
      break
    case 'zoom':
      base = u.interval + u.steady
      break
    case 'lock':
      base = u.interval + u.maxLocks * u.lockTime
      break
    case 'lunge':
      base = u.duration
      break
    case 'slam':
      base = u.windup
      break
    case 'charge':
      base = u.charge
      break
    default:
      base = 1
  }
  return base * periodScale(m) + (def.cooldown ?? 0)
}

/** Anima/s of using a weapon continuously. */
export function weaponRate(def: ItemDef, m: Mods): number {
  if (def.use?.kind === 'beam') return itemCost(m, def, def.drain ?? 0)
  return itemCost(m, def) / cycle(def, m)
}

const DUTY = 0.15
const INCOMING = 0.6
/** Warning thresholds of the estimate (seconds of fighting). */
const SUSTAIN_SHORT = 60
const SUSTAIN_MEDIUM = 120
/** Seconds between uses assumed for an active gadget (or its cooldown when longer). */
const GADGET_GAP = 15
/** Share of natural regeneration that happens during a fight. */
const FIGHT_REGEN = 0.33
/**
 * Assumed share of a fight a non-weapon drain antique runs: the cloak stays on for long stretches, a shield is held
 * while blocking, a glide lasts only while falling. Shown in the editor's breakdown (SustainReport.drains).
 */
export const DRAIN_SHARE: Record<'cloak' | 'shield' | 'glide', number> = { cloak: 0.4, shield: 0.2, glide: 0.1 }

function drainKind(def: ItemDef): keyof typeof DRAIN_SHARE | null {
  const k = def.use?.kind ?? def.passive?.kind
  return k === 'cloak' || k === 'shield' || k === 'glide' ? k : null
}

export function sustainEstimate(species: SpeciesId, loadout: Loadout): SustainReport {
  const clean = sanitizeLoadout(loadout)
  const b = computeBuild(species, clean)
  const m = b.mods
  const byCategory: Record<ItemCategory | 'damage', number> = {
    melee: 0,
    ranged: 0,
    armor: 0,
    enhance: 0,
    gadget: 0,
    damage: 0
  }
  for (const id of b.passives) {
    const def = ITEMS[id]
    if (def.upkeep) byCategory[def.category] += upkeepOf(m, def)
  }
  for (const list of [b.R, b.L]) {
    const weapons = list.filter((id) => isWeapon(id))
    for (const id of weapons) byCategory[ITEMS[id].category] += (weaponRate(ITEMS[id], m) * DUTY) / weapons.length
    for (const id of list) {
      const def = ITEMS[id]
      if (isWeapon(id) || def.category !== 'gadget' || !def.cost) continue
      byCategory.gadget += itemCost(m, def) / Math.max(GADGET_GAP, def.cooldown ?? 0)
    }
  }
  // Held / toggled drains: the cloak is one state whichever paw toggles it; a shield drains in each paw that raises it
  // (both paws assumed raised together); the glide is free for the owl.
  const drains: SustainReport['drains'] = []
  for (const id of new Set([...b.R, ...b.L, ...b.passives])) {
    const def = ITEMS[id]
    const kind = drainKind(def)
    if (!kind || !def.drain || isWeapon(id)) continue
    const perSecond = kind === 'glide' ? glideDrain(species, m) : drainOf(m, def)
    if (perSecond <= 0) continue
    const paws = kind === 'shield' ? Number(b.R.includes(id)) + Number(b.L.includes(id)) : 1
    const rate = perSecond * paws * DRAIN_SHARE[kind]
    byCategory[def.category] += rate
    drains.push({ item: id, perSecond: round(perSecond), paws, share: DRAIN_SHARE[kind], rate: round(rate) })
  }
  const negateShare = b.negateEvery > 0 ? Math.min(1, 1 / b.negateEvery) : 0
  const reduction = 1 - (1 - b.armorReduce) * (1 - negateShare)
  byCategory.damage = INCOMING * (1 - reduction)
  const regen = Math.max(0, REGEN_RATE + m.regen)
  const burn =
    byCategory.melee + byCategory.ranged + byCategory.armor + byCategory.enhance + byCategory.gadget + byCategory.damage
  const net = burn - regen * FIGHT_REGEN
  const sustain = net <= 1e-9 ? Infinity : b.maxAnima / net
  let cheapest: { item: ItemId; cost: number } | undefined
  let priciest: { item: ItemId; cost: number } | undefined
  for (const id of [...b.R, ...b.L]) {
    const def = ITEMS[id]
    const c = Math.round(itemCost(m, def) * 100) / 100
    if (!cheapest || c < cheapest.cost) cheapest = { item: id, cost: c }
    if (!priciest || c > priciest.cost) priciest = { item: id, cost: c }
  }
  const warnings: string[] = []
  const raw = Array.isArray(loadout?.slots) ? loadout.slots : []
  if (!raw.some((s) => s && isItemId(s.item) && isWeapon(s.item) && (s.hand === 'R' || s.hand === 'L')))
    warnings.push('武器がありません')
  if (b.upkeep > regen) warnings.push('維持消費が自然回復を上回っています')
  if (sustain < SUSTAIN_SHORT) warnings.push('消費が非常に激しい構成です')
  else if (sustain < SUSTAIN_MEDIUM) warnings.push('消費が激しめの構成です。安いアンティークを混ぜましょう')
  for (const k of Object.keys(byCategory) as (keyof typeof byCategory)[]) byCategory[k] = round(byCategory[k])
  const report: SustainReport = {
    maxAnima: b.maxAnima,
    upkeep: round(b.upkeep),
    regen: round(regen),
    burn: round(burn),
    sustain: sustain === Infinity ? Infinity : Math.round(sustain * 10) / 10,
    byCategory,
    drains,
    warnings
  }
  if (cheapest) report.cheapest = cheapest
  if (priciest) report.priciest = priciest
  return report
}
