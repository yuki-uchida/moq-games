/**
 * Anima economy (DESIGN §5): costs (anima ≥ cost + 1), held drains, upkeep, critical state, regeneration, PvP base
 * regeneration, honey, shards and the 3-second burn ghost. Damage itself is applied by combat.ts.
 */
import type { FoeDef } from '../data/enemies'
import { ITEMS, type ItemId } from '../data/items'
import {
  BURN_WINDOW,
  CRITICAL_OFF,
  CRITICAL_ON,
  DT,
  HAMSTER_SHARD,
  MIN_REGEN_DELAY,
  REGEN_DELAY,
  REGEN_RATE,
  SHARD_LIFE,
  SHARD_RANGE,
  SHARD_SPEED
} from './constants'
import { modsOf } from './loadout'
import { emit, type Player, type Shard, type Sim } from './state'
import { r3, vdist, type Vec } from './vec'

/** Records anima lost or spent for the burn ghost. */
export function recordBurn(sim: Sim, p: Player, amount: number) {
  if (amount <= 0) return
  const log = p.burnLog
  const t = sim.time
  // Merge into the last entry when it is from the same tick.
  if (log.length >= 2 && log[log.length - 2] === t) log[log.length - 1] += amount
  else log.push(t, amount)
}

export function burnOf(sim: Sim, p: Player): number {
  const log = p.burnLog
  const from = sim.time - BURN_WINDOW
  let cut = 0
  while (cut < log.length && log[cut] < from) cut += 2
  if (cut > 0) log.splice(0, cut)
  let s = 0
  for (let i = 1; i < log.length; i += 2) s += log[i]
  return s
}

/** Infinite anima (training). クロヅメ avatars pay from their own pool; their hp is the foe hp. */
const free = (p: Player) => p.infinite

/** True when the player could pay `amount` for an action (anima ≥ amount + 1). */
export function canPay(p: Player, amount: number): boolean {
  return free(p) || p.anima >= amount + 1
}

/** Pays an action cost; returns false (and changes nothing) when anima < cost + 1. */
export function spend(sim: Sim, p: Player, amount: number, item?: ItemId): boolean {
  if (amount <= 0) return true
  if (free(p)) {
    p.lastSpend = sim.time
    return true
  }
  if (p.anima < amount + 1) return false
  p.anima -= amount
  p.lastSpend = sim.time
  p.stats.spent += amount
  if (item) p.stats.byItem[item] = (p.stats.byItem[item] ?? 0) + amount
  recordBurn(sim, p, amount)
  return true
}

/** Continuous drain for one tick (beam, shield, cloak, glide). Same rule as a cost. */
export function drain(sim: Sim, p: Player, perSecond: number, item?: ItemId): boolean {
  return spend(sim, p, perSecond * DT, item)
}

/** Adds anima (regen, shards, honey, base); returns the amount actually gained. */
export function gain(p: Player, amount: number): number {
  const before = p.anima
  p.anima = Math.min(p.maxAnima, p.anima + amount)
  const got = p.anima - before
  if (got > 0) p.stats.gathered += got
  return got
}

export function regenDelay(p: Player) {
  return Math.max(MIN_REGEN_DELAY, REGEN_DELAY + modsOf(p).regenDelay)
}
export function regenRate(p: Player) {
  return Math.max(0, REGEN_RATE + modsOf(p).regen)
}

/** Max anima follows the passives: enhancements (ラクダ) stop counting while offline. Never kills: floors at 1. */
export function syncMaxAnima(p: Player) {
  const max = p.build.maxAnima - (p.online ? 0 : p.build.mods.maxAnima)
  if (p.maxAnima !== max) p.maxAnima = max
  if (p.anima > p.maxAnima) p.anima = Math.max(Math.min(1, p.anima), p.maxAnima)
}

/** Per-tick anima upkeep, critical switching and regeneration for a living player. */
export function animaTick(sim: Sim, p: Player) {
  if (p.state !== 'alive') return
  if (p.infinite) {
    p.anima = p.maxAnima
    p.online = true
    return
  }
  // Critical: passives go offline at ≤ 15 % and come back above 20 %.
  // Thresholds use the build's full max so that a ラクダ going offline (smaller effective max) cannot flap.
  const frac = p.anima / p.build.maxAnima
  if (p.online && frac <= CRITICAL_OFF && p.build.passives.length > 0) {
    p.online = false
    emit(sim, { type: 'passives', who: p.id, online: false })
    emit(sim, { type: 'critical', who: p.id })
  } else if (!p.online && frac > CRITICAL_ON) {
    p.online = true
    emit(sim, { type: 'passives', who: p.id, online: true })
  }
  syncMaxAnima(p)
  // Upkeep (does not stop regeneration).
  if (p.online && p.build.upkeep > 0) {
    const amt = Math.min(p.anima, p.build.upkeep * DT)
    if (amt > 0) {
      p.anima -= amt
      p.stats.spent += amt
      recordBurn(sim, p, amt)
      for (const id of p.build.passives) {
        const up = p.build.upkeep > 0 ? amt * (passiveUpkeepShare(p, id) / p.build.upkeep) : 0
        if (up > 0) p.stats.byItem[id] = (p.stats.byItem[id] ?? 0) + up
      }
    }
  }
  // Regeneration after the delay.
  const quiet = sim.time - Math.max(p.lastSpend, p.lastHurt)
  if (quiet >= regenDelay(p)) gain(p, regenRate(p) * DT)
}

function passiveUpkeepShare(p: Player, id: ItemId): number {
  const scale = p.build.upkeep
  if (scale <= 0) return 0
  // Proportional to raw upkeep (the mods scale every passive alike except armour upkeep).
  let rawTotal = 0
  let mine = 0
  for (const q of p.build.passives) {
    const u = (itemUpkeep(q) ?? 0) * (isArmor(q) ? 1 + p.build.mods.armorUpkeep : 1)
    rawTotal += u
    if (q === id) mine = u
  }
  return rawTotal > 0 ? (mine / rawTotal) * scale : 0
}

const itemUpkeep = (id: ItemId) => ITEMS[id].upkeep
const isArmor = (id: ItemId) => ITEMS[id].category === 'armor'

/** Gains from a heal source, emitting one 'heal' event per second of accumulated healing. */
export function heal(sim: Sim, p: Player, amount: number, source: 'honey' | 'base') {
  const got = gain(p, amount)
  p.healAcc[source] += got
  if (sim.time - p.healAcc.at >= 1) {
    for (const s of ['honey', 'base'] as const) {
      if (p.healAcc[s] > 0.05) emit(sim, { type: 'heal', who: p.id, amount: r3(p.healAcc[s]), source: s })
      p.healAcc[s] = 0
    }
    p.healAcc.at = sim.time
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Shards

export function dropShards(sim: Sim, at: Vec, drop: FoeDef['drop'], scale = 1) {
  if (!sim.rng.chance(drop.chance)) return
  const n = Math.max(1, Math.round(drop.count * scale))
  for (let i = 0; i < n; i++) {
    const a = sim.rng.next() * Math.PI * 2
    const s = 1.5 + sim.rng.next() * 3
    const sh: Shard = {
      id: sim.nextShard++,
      p: [at[0], Math.max(0.3, at[1] + 0.6), at[2]],
      v: [Math.sin(a) * s, 4 + sim.rng.next() * 3, Math.cos(a) * s],
      amount: drop.amount,
      to: undefined,
      born: sim.time
    }
    sim.shards.push(sh)
  }
}

export function shardsTick(sim: Sim) {
  if (sim.shards.length === 0) return
  const keep: Shard[] = []
  for (const s of sim.shards) {
    let target = s.to ? sim.players.find((p) => p.id === s.to && p.state === 'alive') : undefined
    if (!target) {
      s.to = undefined
      let best = SHARD_RANGE
      for (const p of sim.players) {
        if (p.state !== 'alive') continue
        const d = vdist(p.p, s.p)
        if (d < best) {
          best = d
          target = p
        }
      }
      if (target) s.to = target.id
    }
    if (target) {
      const c: Vec = [target.p[0], target.p[1] + target.h * 0.5, target.p[2]]
      const d = vdist(c, s.p)
      if (d < 0.6) {
        const amount = s.amount * (target.species.trait === 'cheekPouch' ? HAMSTER_SHARD : 1)
        gain(target, amount)
        emit(sim, { type: 'shard', who: target.id, amount, at: [r3(s.p[0]), r3(s.p[1]), r3(s.p[2])] })
        continue
      }
      const sp = SHARD_SPEED + (sim.time - s.born) * 4
      const k = Math.min(1, (sp * DT) / d)
      s.p[0] += (c[0] - s.p[0]) * k
      s.p[1] += (c[1] - s.p[1]) * k
      s.p[2] += (c[2] - s.p[2]) * k
      s.v[0] = s.v[1] = s.v[2] = 0
    } else {
      // Pop out, fall and rest on the ground.
      s.v[1] -= 18 * DT
      s.p[0] += s.v[0] * DT
      s.p[1] += s.v[1] * DT
      s.p[2] += s.v[2] * DT
      const g = sim.phys.groundHeight(s.p[0], s.p[2], 0.1, s.p[1] + 0.3) + 0.3
      if (s.p[1] < g) {
        s.p[1] = g
        s.v[0] *= 0.5
        s.v[2] *= 0.5
        s.v[1] = 0
      }
      if (sim.time - s.born > SHARD_LIFE) continue
    }
    keep.push(s)
  }
  sim.shards = keep
}
