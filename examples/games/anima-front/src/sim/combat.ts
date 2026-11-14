/**
 * Damage pipeline (DESIGN §10): base × enhancements × species trait (applied by the attacker's code) → target
 * modifiers (spawn/protection, タテガミ dome, guard/shield arcs, jelly negate, armour %, オオアゴ front/back,
 * boss weak points) → apply. Every application produces a `hit` event. Kill credit: the last damager within 10 s;
 * assists: other damagers within 10 s. No friendly fire and no self damage (same side never hurts).
 */
import type { FoeAttack } from '../data/enemies'
import { ITEMS } from '../data/items'
import { recordBurn } from './anima'
import { BEAR_KNOCK, BLAST_EDGE, CREDIT_WINDOW, OBJECTIVE_ARMOR } from './constants'
import { bossHitModifier } from './foes/bosses'
import { onFoeDeath } from './foes/index'
import { modsOf } from './loadout'
import { emit, FOE_SIDE, sideTeam, type Foe, type Player, type Prop, type Side, type Sim } from './state'
import type { ActorRef, HitSurface, ShotKind } from './types'
import { angleFromYaw, deg, r3, r3v, vdist, type Vec } from './vec'

export type DmgKind = 'melee' | 'ranged' | 'blast' | 'contact' | 'hazard' | 'beam'

export interface DamageInfo {
  amount: number
  kind: DmgKind
  side: Side
  by?: ActorRef
  item?: ShotKind | FoeAttack
  /** Impact point. */
  at: Vec
  /** Where the attack came from (shot origin, attacker, blast centre): arcs and domes test against it. */
  from: Vec
  head?: boolean
  headMult?: number
  /** Horizontal knockback speed and upward speed. */
  knock?: number
  knockUp?: number
}

const attackerPlayer = (sim: Sim, by: ActorRef | undefined): Player | undefined => {
  if (typeof by !== 'string') return undefined
  return sim.players.find((p) => p.id === by)
}

function creditAttacker(sim: Sim, by: ActorRef | undefined, amount: number) {
  const a = attackerPlayer(sim, by)
  if (a && amount > 0) {
    a.stats.damage += amount
    a.stats.hits++
  }
}

/** Killer and assists from a damager map (killer = `by` when given, else the most recent within the window). */
export function credit(sim: Sim, damagers: Map<ActorRef, number>, by: ActorRef | undefined) {
  const from = sim.time - CREDIT_WINDOW
  let killer = by
  if (killer === undefined) {
    let best = -Infinity
    for (const [ref, t] of damagers) {
      if (t >= from && t > best) {
        best = t
        killer = ref
      }
    }
  }
  const assists: ActorRef[] = []
  for (const [ref, t] of damagers) if (t >= from && ref !== killer) assists.push(ref)
  return { killer, assists }
}

function knockback(v: Vec, from: Vec, to: Vec, speed: number, up: number) {
  let dx = to[0] - from[0]
  let dz = to[2] - from[2]
  const l = Math.hypot(dx, dz)
  if (l < 1e-6) {
    dx = 0
    dz = 1
  } else {
    dx /= l
    dz /= l
  }
  v[0] += dx * speed
  v[2] += dz * speed
  if (up > 0) v[1] = Math.max(v[1], up)
}

// ---------------------------------------------------------------------------------------------------------------
// Players

/** Applies damage to a player; returns the anima removed. */
export function damagePlayer(sim: Sim, t: Player, d: DamageInfo): number {
  if (t.state !== 'alive' || d.side === t.side || d.amount <= 0) return 0
  const fur: HitSurface = 'fur'
  const base = {
    type: 'hit' as const,
    target: t.foe ? t.foe.id : t.id,
    targetKind: t.foe ? ('foe' as const) : ('player' as const),
    at: r3v(d.at),
    ...(d.by !== undefined ? { by: d.by } : {}),
    ...(d.item ? { item: d.item } : {})
  }
  if (sim.time < t.invulnUntil) {
    emit(sim, { ...base, amount: 0, blocked: true, surface: 'shield' })
    return 0
  }
  let amount = d.amount * (d.head ? (d.headMult ?? 1) : 1)
  let surface: HitSurface = fur
  let blocked = false
  // Guard (シャチマル held) and shield (アルマジロ) arcs, tested against where the attack came from.
  for (const h of t.hands) {
    if (h.mode !== 'guard' && h.mode !== 'shield') continue
    const def = ITEMS[h.items[h.sel]]
    const u = def?.use
    if (!u) continue
    const ang = angleFromYaw(t.yaw, t.p, d.from)
    if (u.kind === 'slash' && u.guard && h.mode === 'guard' && ang <= deg(u.guard.arc) / 2) {
      const blockShare = d.kind === 'melee' || d.kind === 'contact' ? u.guard.meleeBlock : u.guard.rangedBlock
      amount *= 1 - blockShare
      const cost = Math.min(Math.max(0, t.anima - 1), u.guard.costPerHit)
      if (!t.infinite && cost > 0) {
        t.anima -= cost
        t.stats.spent += cost
        recordBurn(sim, t, cost)
      }
      surface = 'guard'
      blocked = true
      break
    }
    if (u.kind === 'shield' && h.mode === 'shield' && ang <= deg(u.arc) / 2) {
      const ae = 1 + modsOf(t).armorEffect
      amount = (amount * u.blockCostFactor) / ae
      surface = 'shield'
      blocked = true
      break
    }
  }
  // Jelly negate.
  if (
    !blocked &&
    t.online &&
    t.build.negateEvery > 0 &&
    (t.negateAt < 0 || sim.time - t.negateAt >= t.build.negateEvery)
  ) {
    t.negateAt = sim.time
    emit(sim, { ...base, amount: 0, negated: true, surface: 'shield' })
    return 0
  }
  if (!blocked && t.online && t.build.armorReduce > 0) {
    amount *= 1 - t.build.armorReduce
    surface = 'shell'
  }
  if (t.foe) return 0 // クロヅメ avatars are damaged through their foe (damageFoe)
  const applied = Math.min(t.anima, amount)
  t.anima -= applied
  t.lastHurt = sim.time
  t.stats.taken += applied
  recordBurn(sim, t, applied)
  if (d.by !== undefined && d.by !== t.id) t.damagers.set(d.by, sim.time)
  creditAttacker(sim, d.by, applied)
  emit(sim, {
    ...base,
    amount: r3(amount),
    surface,
    ...(d.head ? { head: true } : {}),
    ...(blocked ? { blocked: true } : {})
  })
  // ハリネズミ: melee attackers take a share back.
  if ((d.kind === 'melee' || d.kind === 'contact') && t.online && t.build.reflect > 0 && typeof d.by === 'number') {
    const f = sim.foes.find((x) => x.id === d.by)
    if (f && !f.dead)
      damageFoe(sim, f, {
        amount: d.amount * t.build.reflect,
        kind: 'contact',
        side: t.side,
        by: t.id,
        item: 'hedgehog',
        at: [f.p[0], f.p[1] + f.h * 0.5, f.p[2]],
        from: t.p
      })
  }
  if (d.knock || d.knockUp) {
    const k = t.species.trait === 'strong' ? BEAR_KNOCK : 1
    knockback(t.v, d.from, t.p, (d.knock ?? 0) * k, (d.knockUp ?? 0) * k)
    if ((d.knockUp ?? 0) > 0) t.grounded = false
  }
  if (t.infinite) t.anima = Math.max(t.anima, 1)
  if (t.anima <= 1e-6) breakArmor(sim, t, d)
  return applied
}

export function breakArmor(sim: Sim, t: Player, d: { by?: ActorRef; item?: ShotKind | FoeAttack }) {
  t.anima = 0
  const { killer, assists } = credit(sim, t.damagers, d.by)
  emit(sim, {
    type: 'armorBreak',
    who: t.id,
    at: r3v([t.p[0], t.p[1] + t.h * 0.5, t.p[2]]),
    ...(killer !== undefined ? { by: killer } : {})
  })
  t.stats.downs++
  for (const ref of assists) {
    const a = attackerPlayer(sim, ref)
    if (a && a.side !== t.side) a.stats.assists++
  }
  const k = attackerPlayer(sim, killer)
  if (k && k.side !== t.side) k.stats.kos++
  t.damagers.clear()
  sim.mode.onBroken(sim, t, killer, assists, d.item)
}

// ---------------------------------------------------------------------------------------------------------------
// Foes

const foeSurface = (f: Foe): HitSurface =>
  f.def.faction === 'creature' ? 'chitin' : f.def.faction === 'machine' ? 'metal' : 'fur'

/** True when `from` is outside every タテガミ dome that covers the foe. */
function domeBlocks(sim: Sim, f: Foe, from: Vec): boolean {
  if (!f.shielded) return false
  for (const g of sim.foes) {
    if (g.kind !== 'tategami' || g.dead || g.state === 'spawn' || g.mem.dome !== 1) continue
    const r = g.def.attacks[0].radius ?? 6
    if (vdist(g.p, f.p) > r + f.r) continue
    if (vdist(g.p, from) <= r) return false
  }
  return true
}

export function damageFoe(sim: Sim, f: Foe, d: DamageInfo): number {
  if (f.dead || d.side === FOE_SIDE || d.amount <= 0) return 0
  const base = {
    type: 'hit' as const,
    target: f.id,
    targetKind: 'foe' as const,
    at: r3v(d.at),
    ...(d.by !== undefined ? { by: d.by } : {}),
    ...(d.item ? { item: d.item } : {})
  }
  if (f.state === 'spawn') return 0
  if (domeBlocks(sim, f, d.from)) {
    emit(sim, { ...base, amount: 0, blocked: true, surface: 'shield' })
    return 0
  }
  let amount = d.amount * (d.head ? (d.headMult ?? 1) : 1)
  let surface = foeSurface(f)
  let weak = false
  if (f.def.front && f.state !== 'dying') {
    const ang = angleFromYaw(f.yaw, f.p, d.from)
    if (ang <= deg(f.def.front.arc) / 2) {
      amount *= f.def.front.factor
      surface = 'shell'
    } else if (ang >= Math.PI - deg(f.def.front.arc) / 2 && f.def.weak) {
      amount *= f.def.weak
      weak = true
    }
  }
  if (f.def.boss) {
    const m = bossHitModifier(sim, f, d)
    amount *= m.mult
    if (m.weak) weak = true
    if (m.absorbed) {
      emit(sim, { ...base, amount: r3(amount), surface: 'metal', ...(weak ? { weak: true } : {}) })
      creditAttacker(sim, d.by, amount)
      if (d.by !== undefined) f.damagers.set(d.by, sim.time)
      return amount
    }
  }
  // クロヅメ animals: their own guard/shield/armour apply (the avatar's pipeline without applying anima).
  if (f.avatar) {
    const av = f.avatar
    for (const h of av.hands) {
      if (h.mode !== 'shield' && h.mode !== 'guard') continue
      const u = ITEMS[h.items[h.sel]]?.use
      const ang = angleFromYaw(av.yaw, av.p, d.from)
      if (u?.kind === 'shield' && h.mode === 'shield' && ang <= deg(u.arc) / 2) {
        amount = 0
        surface = 'shield'
      } else if (u?.kind === 'slash' && u.guard && h.mode === 'guard' && ang <= deg(u.guard.arc) / 2) {
        amount *= 1 - (d.kind === 'melee' ? u.guard.meleeBlock : u.guard.rangedBlock)
        surface = 'guard'
      }
    }
    av.lastHurt = sim.time
  }
  const applied = Math.min(f.hp, amount)
  f.hp -= applied
  if (d.by !== undefined) f.damagers.set(d.by, sim.time)
  creditAttacker(sim, d.by, applied)
  emit(sim, {
    ...base,
    amount: r3(amount),
    surface,
    ...(d.head ? { head: true } : {}),
    ...(weak ? { weak: true } : {}),
    ...(surface === 'shield' || surface === 'guard' ? { blocked: true } : {})
  })
  if ((d.knock || d.knockUp) && !f.def.boss && f.kind !== 'oagos' && f.kind !== 'ashinaga') {
    const k = f.kind === 'tategami' ? 0.4 : 1
    knockback(f.v, d.from, f.p, (d.knock ?? 0) * k, (d.knockUp ?? 0) * k)
    if ((d.knockUp ?? 0) > 0) f.grounded = false
    if (f.avatar) {
      knockback(f.avatar.v, d.from, f.p, (d.knock ?? 0) * k, (d.knockUp ?? 0) * k)
      if ((d.knockUp ?? 0) > 0) f.avatar.grounded = false
    }
  }
  if (f.hp <= 1e-6) killFoe(sim, f, d.by, weak, d.item)
  return applied
}

export function killFoe(sim: Sim, f: Foe, by: ActorRef | undefined, weak = false, item?: ShotKind | FoeAttack) {
  if (f.dead) return
  f.hp = 0
  f.dead = true
  f.state = 'dying'
  f.st = 0
  f.attack = null
  f.aim = null
  const { killer, assists } = credit(sim, f.damagers, by)
  const at = r3v(f.p)
  emit(sim, {
    type: 'foeDie',
    foe: f.id,
    kind: f.kind,
    at,
    ...(killer !== undefined ? { by: killer } : {}),
    ...(weak ? { weak: true } : {})
  })
  emit(sim, {
    type: 'ko',
    who: f.id,
    assists,
    ...(killer !== undefined ? { by: killer } : {}),
    ...(item ? { item } : {})
  })
  const k = attackerPlayer(sim, killer)
  if (k) k.stats.kos++
  for (const ref of assists) {
    const a = attackerPlayer(sim, ref)
    if (a) a.stats.assists++
  }
  onFoeDeath(sim, f, killer)
  sim.mode.onFoeKilled(sim, f, killer)
}

// ---------------------------------------------------------------------------------------------------------------
// Props

export function damageProp(sim: Sim, r: Prop, d: DamageInfo): number {
  if (r.gone || r.hp === undefined || d.amount <= 0) return 0
  if (r.side !== -1 && r.side === d.side) return 0
  let raw = d.amount
  // Objectives are armoured against クロヅメ antiques (their fire at nearby animals would shred them).
  if ((r.kind === 'cart' || r.kind === 'lighthouse') && typeof d.by === 'number') {
    const f = sim.foes.find((x) => x.id === d.by)
    if (f?.avatar) raw *= OBJECTIVE_ARMOR
  }
  const amount = Math.min(r.hp, raw)
  r.hp -= amount
  creditAttacker(sim, d.by, amount)
  emit(sim, {
    type: 'hit',
    target: r.id,
    targetKind: 'prop',
    amount: r3(raw),
    at: r3v(d.at),
    surface: 'prop',
    ...(d.by !== undefined ? { by: d.by } : {}),
    ...(d.item ? { item: d.item } : {})
  })
  emit(sim, { type: 'propHit', prop: r.id, amount: r3(raw), at: r3v(d.at) })
  sim.mode.onPropDamaged?.(sim, r, amount, d.by)
  if (r.hp <= 1e-6) {
    r.hp = 0
    destroyProp(sim, r, d.by)
  }
  return amount
}

export function destroyProp(sim: Sim, r: Prop, by: ActorRef | undefined) {
  if (r.gone) return
  r.gone = true
  emit(sim, { type: 'propBreak', prop: r.id, kind: r.kind, at: r3v(r.p) })
  sim.mode.onPropDestroyed?.(sim, r, by)
}

// ---------------------------------------------------------------------------------------------------------------
// Area damage

/** `by` for impact / blast events: the acting player (PvP routes them per team); foes' effects leave it out. */
export const byPlayer = (by: ActorRef | undefined): { by?: string } => (typeof by === 'string' ? { by } : {})

/** Radial damage with linear falloff to 40 % at the edge; walls block it. */
export function blast(
  sim: Sim,
  at: Vec,
  radius: number,
  damage: number,
  side: Side,
  by: ActorRef | undefined,
  item: ShotKind | FoeAttack,
  opts: { knock?: number; knockUp?: number; event?: boolean } = {}
) {
  if (opts.event !== false)
    emit(sim, { type: 'blast', at: r3v(at), radius: r3(radius), item, team: sideTeam(side), ...byPlayer(by) })
  const fall = (d: number) => damage * (1 - (1 - BLAST_EDGE) * Math.min(1, d / radius))
  const center = (p: Vec, h: number): Vec => [p[0], Math.min(Math.max(at[1], p[1]), p[1] + h), p[2]]
  const los = (a: Vec, b: Vec) => sim.phys.clear(a, b, side)
  const lift: Vec = [at[0], at[1] + 0.3, at[2]]
  for (const p of sim.players) {
    if (p.side === side || p.state !== 'alive') continue
    const c = center(p.p, p.h)
    const d = vdist(c, at) - p.r
    if (d > radius) continue
    if (!los(lift, c)) continue
    damagePlayer(sim, p, {
      amount: fall(Math.max(0, d)),
      kind: 'blast',
      side,
      by,
      item,
      at: c,
      from: at,
      knock: opts.knock,
      knockUp: opts.knockUp
    })
  }
  if (side !== FOE_SIDE) {
    for (const f of sim.foeHash.query(at[0], at[2], radius + 6)) {
      if (f.dead) continue
      const c = center(f.p, f.h)
      const d = vdist(c, at) - f.r
      if (d > radius) continue
      if (!f.def.boss && !los(lift, c)) continue
      damageFoe(sim, f, {
        amount: fall(Math.max(0, d)),
        kind: 'blast',
        side,
        by,
        item,
        at: c,
        from: at,
        knock: opts.knock,
        knockUp: opts.knockUp
      })
    }
  }
  for (const r of sim.props) {
    if (r.gone || r.hp === undefined || (r.side !== -1 && r.side === side)) continue
    const d = vdist(r.p, at) - (r.r ?? 1)
    if (d > radius) continue
    damageProp(sim, r, { amount: fall(Math.max(0, d)), kind: 'blast', side, by, item, at: r.p, from: at })
  }
}
