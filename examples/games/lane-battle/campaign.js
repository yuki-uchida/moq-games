// Campaign progress between battles: roster, formation (編成), random growth (育成) and save data.
import { POOPS, SPECIALS, STAGES, typeOf, card } from './simulation.js'

export const SLOTS = 6
export const MAX_LEVEL = 50
export const expToNext = (level) => 80 + level * 30
export const clearBonus = (stage) => 40 + stage * 6
export const coinReward = (stage, first) => Math.round((50 + stage * 5) * (first ? 1 : 0.4))
/** Chance that each stat grows on a level-up. Poops grow reliably; specials start strong and mostly stall. */
export const GROWTH = {
  poop: { hp: 0.8, atk: 0.75, spd: 0.4 },
  special: { hp: 0.22, atk: 0.2, spd: 0.1 }
}
/** A special joining after stage index `stage` starts this many times stronger than its listed stats. */
export const specialScale = (stage) => 1 + 0.03 * stage
/** Chance that a first clear brings a special. */
export const SPECIAL_CHANCE = 0.3
const STORAGE = 'unko-daisanji-campaign-v1'

export function newCampaign() {
  const c = { cleared: 0, coins: 0, serial: 0, roster: [], loadout: [], records: {} }
  for (const t of POOPS.filter((t) => t.price === 0)) addEntry(c, t.key)
  return c
}

/** Adds one unit to the roster (and to the formation while a slot is free). */
export function addEntry(c, key, stage = 0) {
  const t = typeOf(key)
  const scale = t.special ? specialScale(stage) : 1
  const entry = {
    uid: ++c.serial,
    key,
    level: 1,
    exp: 0,
    hp: Math.round(t.hp * scale),
    atk: Math.round(t.atk * scale),
    spd: 0,
    scale
  }
  c.roster.push(entry)
  if (c.loadout.length < SLOTS) c.loadout.push(entry.uid)
  return entry
}

export function buy(c, key) {
  const t = typeOf(key)
  if (!t || t.special || c.coins < t.price || c.cleared < t.unlock || c.roster.some((e) => e.key === key)) return false
  c.coins -= t.price
  addEntry(c, key)
  return true
}

/** Toggles a roster entry in or out of the formation; the formation keeps at least one unit. */
export function toggle(c, uid) {
  const at = c.loadout.indexOf(uid)
  if (at >= 0) {
    if (c.loadout.length === 1) return false
    c.loadout.splice(at, 1)
    return true
  }
  if (c.loadout.length >= SLOTS || !c.roster.some((e) => e.uid === uid)) return false
  c.loadout.push(uid)
  return true
}

export const deckOf = (c) => c.loadout.map((uid) => card(c.roster.find((e) => e.uid === uid)))

/** One level: every stat rolls against its growth chance. A poop level always raises at least HP. */
export function levelUp(entry, random) {
  const t = typeOf(entry.key)
  const chance = t.special ? GROWTH.special : GROWTH.poop
  const gains = {
    hp: random() < chance.hp ? Math.ceil(t.hp * entry.scale * 0.07) : 0,
    atk: random() < chance.atk ? Math.ceil(t.atk * entry.scale * 0.07) : 0,
    spd: random() < chance.spd ? 1 : 0
  }
  if (!t.special && !gains.hp && !gains.atk && !gains.spd) gains.hp = Math.ceil(t.hp * 0.07)
  entry.level++
  entry.hp += gains.hp
  entry.atk += gains.atk
  entry.spd += gains.spd
  return gains
}

export function gainExp(entry, amount, random) {
  const ups = []
  entry.exp += amount
  while (ups.length < 2 && entry.level < MAX_LEVEL && entry.exp >= expToNext(entry.level)) {
    entry.exp -= expToNext(entry.level)
    const from = entry.level
    ups.push({ from, ...levelUp(entry, random) })
  }
  if (entry.level >= MAX_LEVEL) entry.exp = 0
  return ups
}

/** Picks the special that joins after a first clear, preferring ones not yet in the roster. */
export function pickSpecial(c, random) {
  const fresh = SPECIALS.filter((t) => !c.roster.some((e) => e.key === t.key))
  const pool = fresh.length ? fresh : SPECIALS
  return pool[Math.floor(random() * pool.length)].key
}

/** Settles a finished battle: kill EXP (and clear bonus on victory), coins, records and, sometimes, a new special. */
export function settle(c, game, random) {
  const victory = game.result === 'victory'
  const first = victory && game.stage === c.cleared
  const report = { victory, first, stage: game.stage, coins: 0, special: null, units: [] }
  for (const d of game.deck) {
    const entry = c.roster.find((e) => e.uid === d.uid)
    if (!entry) continue
    const exp = Math.round((game.exp[d.uid] || 0) + (victory ? clearBonus(game.stage) : 0))
    report.units.push({ uid: entry.uid, key: entry.key, exp, ups: gainExp(entry, exp, random), level: entry.level })
  }
  if (victory) {
    report.coins = coinReward(game.stage, first)
    c.coins += report.coins
    const best = c.records[game.stage]
    c.records[game.stage] = Math.min(best ?? Infinity, Math.floor(game.time))
    if (first) {
      c.cleared = Math.min(STAGES.length, c.cleared + 1)
      if (random() < SPECIAL_CHANCE) report.special = addEntry(c, pickSpecial(c, random), game.stage + 1)
    }
  }
  return report
}

export function load(storage = globalThis.localStorage) {
  try {
    const c = JSON.parse(storage.getItem(STORAGE))
    if (c && Array.isArray(c.roster) && c.roster.length && c.roster.every((e) => typeOf(e.key))) {
      c.loadout = c.loadout.filter((uid) => c.roster.some((e) => e.uid === uid)).slice(0, SLOTS)
      if (!c.loadout.length) c.loadout.push(c.roster[0].uid)
      return c
    }
  } catch {}
  return newCampaign()
}
export function save(c, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE, JSON.stringify(c))
  } catch {}
}
export function erase(storage = globalThis.localStorage) {
  try {
    storage.removeItem(STORAGE)
  } catch {}
  return newCampaign()
}
