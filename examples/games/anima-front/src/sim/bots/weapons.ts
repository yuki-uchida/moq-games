/**
 * Bot antique handling (DESIGN §13): weapon choice by range, value and remaining anima (cheap weapons below 40 %),
 * per-paw fire controllers for every use kind (press, hold, zoom, lock, charge, shield) and gadget heuristics.
 */
import { ITEMS, isWeapon, type ItemDef, type ItemId } from '../../data/items'
import { canPay } from '../anima'
import { itemCost, modsOf, weaponRate } from '../loadout'
import type { Player, Sim } from '../state'
import { BTN } from '../types'
import type { Brain } from './brain'

export interface WeaponStats {
  melee: boolean
  /** Distance at which it is worth using. */
  reach: number
  /** Preferred fighting distance. */
  pref: number
  /** Damage per second while used. */
  dps: number
  /** Damage per use. */
  hit: number
  /** Projectile speed (Infinity for melee / hitscan). */
  speed: number
}

const cache = new Map<ItemId, WeaponStats>()

export function weaponStats(def: ItemDef): WeaponStats {
  const c = cache.get(def.id)
  if (c) return c
  const u = def.use
  const cd = def.cooldown ?? 0
  let s: WeaponStats = { melee: false, reach: 0, pref: 0, dps: 0, hit: 0, speed: Infinity }
  switch (u?.kind) {
    case 'combo':
      s = {
        melee: true,
        reach: u.reach,
        pref: u.reach * 0.6,
        dps: u.damage / u.interval,
        hit: u.damage,
        speed: Infinity
      }
      break
    case 'slash':
      s = {
        melee: true,
        reach: u.reach,
        pref: u.reach * 0.6,
        dps: u.damage / u.interval,
        hit: u.damage,
        speed: Infinity
      }
      break
    case 'lunge':
      s = {
        melee: true,
        reach: u.distance,
        pref: u.distance * 0.6,
        dps: u.damage / (u.duration + cd),
        hit: u.damage,
        speed: Infinity
      }
      break
    case 'slam':
      s = {
        melee: true,
        reach: u.reach + u.radius * 0.6,
        pref: u.reach,
        dps: u.damage / (u.windup + cd),
        hit: u.damage,
        speed: Infinity
      }
      break
    case 'semi':
      s = {
        melee: false,
        reach: u.range,
        pref: Math.min(18, u.range * 0.3),
        dps: u.damage / u.interval,
        hit: u.damage,
        speed: u.speed
      }
      break
    case 'auto':
      s = {
        melee: false,
        reach: u.range,
        // Wide sprays (ハチドリ) want to be closer.
        pref: Math.min(16, u.range * 0.25, 25 / Math.max(0.1, u.spread)),
        dps: u.damage * u.rate,
        hit: u.damage,
        speed: u.speed
      }
      break
    case 'spread':
      s = {
        melee: false,
        reach: u.range * 0.8,
        pref: 6,
        dps: (u.damage * u.pellets * 0.7) / u.interval,
        hit: u.damage * u.pellets * 0.7,
        speed: u.speed
      }
      break
    case 'zoom':
      s = {
        melee: false,
        reach: u.range,
        pref: 30,
        dps: u.damage / (u.interval + u.steady),
        hit: u.damage,
        speed: u.speed
      }
      break
    case 'lock':
      s = {
        melee: false,
        reach: u.range,
        pref: 25,
        dps: (u.damage * u.maxLocks * 0.6) / (u.interval + u.lockTime * 2),
        hit: u.damage * 2,
        speed: u.speed
      }
      break
    case 'lob':
      s = { melee: false, reach: 30, pref: 15, dps: u.damage / u.interval, hit: u.damage, speed: u.speed }
      break
    case 'beam':
      s = {
        melee: false,
        reach: u.range,
        pref: Math.min(16, u.range * 0.5),
        dps: u.dps,
        hit: u.dps * 0.3,
        speed: Infinity
      }
      break
    case 'charge':
      s = { melee: false, reach: 60, pref: 20, dps: u.damage / (u.charge + cd), hit: u.damage, speed: u.speed }
      break
  }
  cache.set(def.id, s)
  return s
}

/** Score of a weapon at distance d (−Infinity when unusable). */
function scoreWeapon(p: Player, def: ItemDef, d: number, targets: number, cluster: number, low: boolean): number {
  const u = def.use
  if (!u) return -Infinity
  const s = weaponStats(def)
  if (!canPay(p, itemCost(modsOf(p), def) + 0.2)) return -Infinity
  let score = Math.min(8, s.dps / 10) + Math.min(4, s.hit / 25)
  if (s.melee) {
    if (d <= s.reach + 1) score += 6
    else score -= 6 + d * 0.2
  } else {
    if (d > s.reach) return -Infinity
    score += 5
    if (u.kind === 'zoom') score += d > 30 ? 6 : d < 12 ? -6 : 0
    if (u.kind === 'lock' && targets >= 2) score += 3
    if ((u.kind === 'lob' || u.kind === 'charge') && cluster >= 3 && d > 6) score += 4
    if ((u.kind === 'lob' || u.kind === 'charge') && d < 5) score -= 5
    if (u.kind === 'spread') score += d < 12 ? 5 : -4
  }
  const rate = p.foe ? 0 : weaponRate(def, modsOf(p))
  // Expensive weapons lose value as anima runs low; skilled bots are thriftier all the time.
  score -= rate * (low ? 3 : 0.15 + 0.35 * Math.max(0, (p.bot ?? 0.5) - 0.5))
  return score
}

/** Best weapon index for each paw at distance d (null when the paw has none usable), and the preferred range. */
export function chooseWeapons(
  p: Player,
  d: number,
  targets: number,
  cluster: number
): {
  picks: [number | null, number | null]
  scores: [number, number]
  pref: number
  main: 0 | 1 | -1
  item: ItemId | undefined
} {
  const low = !p.foe && !p.infinite && p.anima / p.maxAnima < 0.4
  const picks: [number | null, number | null] = [null, null]
  const scores: [number, number] = [-Infinity, -Infinity]
  ;[p.build.R, p.build.L].forEach((list, hi) => {
    list.forEach((id, i) => {
      if (!isWeapon(id)) return
      const sc = scoreWeapon(p, ITEMS[id], d, targets, cluster, low)
      if (sc > scores[hi]) {
        scores[hi] = sc
        picks[hi] = i
      }
    })
  })
  const main: 0 | 1 | -1 = picks[0] === null && picks[1] === null ? -1 : scores[0] >= scores[1] ? 0 : 1
  const id = main === 0 ? p.build.R[picks[0]!] : main === 1 ? p.build.L[picks[1]!] : undefined
  const pref = id ? weaponStats(ITEMS[id]).pref : 10
  return { picks, scores, pref, main, item: id }
}

const PRESS_KINDS = new Set(['semi', 'spread', 'lob', 'combo', 'slash', 'lunge', 'slam'])

const press = (p: Player, hi: 0 | 1) => {
  if (hi === 0) p.input.presses.r++
  else p.input.presses.l++
}
const holdBit = (p: Player, hi: 0 | 1) => {
  p.input.held |= hi === 0 ? BTN.R : BTN.L
}

/** Drives one paw: `fire` = wants to attack now, `aimOk` = the aim is on target. */
export function pawControl(
  sim: Sim,
  p: Player,
  b: Brain,
  hi: 0 | 1,
  fire: boolean,
  aimOk: boolean,
  locksWanted = 1,
  dist = 0
) {
  const h = p.hands[hi]
  const ctl = b.paws[hi]
  if (h.swap > 0 || h.sel < 0 || h.sel !== b.sel[hi]) {
    ctl.holding = false
    return
  }
  const def = ITEMS[h.items[h.sel]]
  const kind = def.use?.kind
  const ready = sim.time >= h.readyAt && h.queue === 0
  if (!kind) return
  if (PRESS_KINDS.has(kind)) {
    ctl.holding = false
    // Melee only swings once the target is within reach (no anima wasted on air).
    const st = weaponStats(def)
    if (st.melee && dist > st.reach + 0.4) return
    if (fire && aimOk && ready) press(p, hi)
    return
  }
  if (kind === 'auto' || kind === 'beam') {
    if (fire && aimOk) {
      if (!ctl.holding) {
        press(p, hi)
        ctl.holding = true
        ctl.holdStart = sim.time
      }
      holdBit(p, hi)
    } else ctl.holding = false
    return
  }
  if (kind === 'shield') {
    if (fire) {
      if (!ctl.holding) {
        press(p, hi)
        ctl.holding = true
        ctl.holdStart = sim.time
      }
      holdBit(p, hi)
    } else ctl.holding = false
    return
  }
  if (kind === 'zoom' || kind === 'lock' || kind === 'charge') {
    if (ctl.holding) {
      const t = sim.time - ctl.holdStart
      let release = false
      if (kind === 'zoom') release = (h.charge >= 0.95 && aimOk) || t > 1.6 || !fire
      else if (kind === 'lock') {
        const u = def.use
        const max = u?.kind === 'lock' ? u.maxLocks : 4
        release = h.locks.length >= Math.min(max, Math.max(1, locksWanted)) || t > 0.4 * max + 0.6 || (!fire && t > 0.2)
      } else release = h.charge >= 1 || t > 2.5
      if (release) ctl.holding = false
      else holdBit(p, hi)
      return
    }
    if (fire && aimOk && ready && canPay(p, itemCost(modsOf(p), def) + 0.2)) {
      press(p, hi)
      holdBit(p, hi)
      ctl.holding = true
      ctl.holdStart = sim.time
    }
  }
}

/** Finds an active antique of a use kind in either paw. */
export function findKind(p: Player, kinds: string[]): { hand: 0 | 1; idx: number; id: ItemId } | null {
  const lists = [p.build.R, p.build.L]
  for (const hi of [0, 1] as const) {
    const idx = lists[hi].findIndex((id) => kinds.includes(ITEMS[id].use?.kind ?? ''))
    if (idx >= 0) return { hand: hi, idx, id: lists[hi][idx] }
  }
  return null
}

export interface GadgetCtx {
  engaged: boolean
  retreat: boolean
  /** Hostiles within 8 m. */
  close: number
  /** Anima lost in the last 2 s. */
  taken: number
  /** Allies (incl. self) within 4 m and their mean anima share. */
  allies: number
  alliesMean: number
  newContact: boolean
  goalHigh: boolean
  /** Engaged with a close-range weapon preference and the target 10–30 m away. */
  closeIn?: boolean
}

/** Starts a gadget use when a heuristic fires (one at a time). */
export function planGadget(sim: Sim, p: Player, b: Brain, ctx: GadgetCtx) {
  if (b.gadget || p.foe) return
  const frac = p.anima / p.maxAnima
  const tryUse = (kind: string, minGap: number, pitch?: number) => {
    const g = findKind(p, [kind])
    if (!g) return false
    const def = ITEMS[g.id]
    if ((b.gadgetAt[g.id] ?? -100) > sim.time) return false
    if (!canPay(p, itemCost(modsOf(p), def) + 2)) return false
    b.gadgetAt[g.id] = sim.time + Math.max(minGap, def.cooldown ?? 0)
    b.gadget = {
      hand: g.hand,
      idx: g.idx,
      pressed: false,
      until: sim.time + 2,
      ...(pitch !== undefined ? { pitch } : {})
    }
    return true
  }
  if (ctx.allies >= 2 && ctx.alliesMean < 0.6 && tryUse('jar', 16)) return
  if (ctx.engaged && ctx.taken > 18 && tryUse('wall', 12, -0.2)) return
  if (ctx.newContact && tryUse('pulse', 12)) return
  // Close-range builds hook in toward a target out of reach (ヤモリフック along the aim line).
  if (ctx.closeIn && tryUse('hook', 5)) return
  if (ctx.close >= 3 && tryUse('decoy', 8)) return
  if (frac < 0.35 && ctx.close >= 1 && tryUse('throw', 8)) return
  if (ctx.goalHigh && b.rng.chance(0.01) && tryUse('pad', 15, -1.25)) return
  const leaf = findKind(p, ['cloak'])
  if (leaf && (b.gadgetAt.leaf ?? -100) <= sim.time) {
    const want = ctx.retreat && frac > 0.2 && ctx.close >= 1
    if (want !== p.cloakOn) {
      b.gadgetAt.leaf = sim.time + 3
      b.gadget = { hand: leaf.hand, idx: leaf.idx, pressed: false, until: sim.time + 2 }
    }
  }
}

/** Runs the active gadget plan: select it, press once, then release the paw. Returns the paw it occupies. */
export function runGadget(sim: Sim, p: Player, b: Brain): 0 | 1 | -1 {
  const g = b.gadget
  if (!g) return -1
  if (sim.time > g.until) {
    b.gadget = null
    return -1
  }
  b.sel[g.hand] = g.idx
  const h = p.hands[g.hand]
  if (!g.pressed && h.sel === g.idx && h.swap <= 0 && sim.time >= h.readyAt && h.queue === 0) {
    press(p, g.hand)
    g.pressed = true
    g.until = Math.min(g.until, sim.time + 0.3)
  }
  return g.hand
}
