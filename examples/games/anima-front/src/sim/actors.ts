/**
 * Actor hit volumes and queries shared by antiques, projectiles, foes and bots: ray/segment tests against
 * players (body cylinder + head sphere), foes (cylinder; クロヅメ animals like players) and damageable props;
 * hostile actors in a radius or sector; sight rules (cloak, ink).
 */
import { ITEMS } from '../data/items'
import { damageFoe, damagePlayer, damageProp, type DamageInfo } from './combat'
import { raySphere, rayCylinder } from './physics'
import { PROP_SOLIDS } from './prop-solids'
import { hermitWallBox } from './wall-box'
import { FOE_SIDE, type Foe, type Player, type Prop, type Side, type Sim } from './state'
import type { ActorRef } from './types'
import { angleFromYaw, vdist, type Vec } from './vec'

export type Target = { k: 'p'; p: Player } | { k: 'f'; f: Foe } | { k: 'r'; r: Prop }

export interface ActorHit {
  t: number
  target: Target
  head: boolean
}

/** Props that block and take shots (objectives, nodes, targets). Walls are dynamic boxes in physics. */
export const isShootableProp = (r: Prop) =>
  !r.gone && r.hp !== undefined && r.kind !== 'hermit' && r.kind !== 'zone' && r.kind !== 'base'

/**
 * Props every attack can damage (shots, pellets, beams, melee, blasts): the shootable ones plus ヤドカリ walls (shots
 * and beams reach those through their physics box, melee and blasts through this list).
 */
export const isDamageableProp = (r: Prop) => !r.gone && r.hp !== undefined && r.kind !== 'zone' && r.kind !== 'base'

/** Whether a prop is hostile to `side` (never one's own; foes never damage neutral targets). */
export const propHostileTo = (r: Prop, side: Side) =>
  !(r.side !== -1 && r.side === side) && !(r.side === -1 && side === FOE_SIDE)

export const propHeight = (r: Prop) => r.data.h ?? 2

/** An upright cylinder of a prop's hit volume (radius, y range). */
export interface PropVolume {
  r: number
  y0: number
  y1: number
}

/**
 * A prop's hit volume: a solid prop (灯台, 巣核) is exactly its colliders (src/sim/prop-solids.ts), so what stops a
 * body, a shot and a sight line is the same shape; any other prop is one cylinder of its radius × data.h.
 */
export function propVolumes(r: Prop): PropVolume[] {
  const parts = PROP_SOLIDS[r.kind]
  if (parts) return parts.map((s) => ({ r: s.r, y0: r.p[1], y1: r.p[1] + s.h }))
  return [{ r: r.r ?? 1, y0: r.p[1], y1: r.p[1] + propHeight(r) }]
}

/** Ray entry t into a prop's hit volume grown by `inflate` (−1 when missed; 0 when starting inside). */
export function rayProp(o: Vec, d: Vec, maxT: number, r: Prop, inflate = 0): number {
  let best = -1
  for (const v of propVolumes(r)) {
    const t = rayCylinder(o, d, maxT, r.p[0], r.p[2], v.r + inflate, v.y0 - inflate, v.y1 + inflate)
    if (t >= 0 && (best < 0 || t < best)) best = t
  }
  return best
}

/** Distance from a point to an upright cylinder (centre x/z, radius, y range); 0 inside. */
export function cylDistance(cx: number, cz: number, r: number, y0: number, y1: number, c: readonly number[]): number {
  const dh = Math.max(0, Math.hypot(c[0] - cx, c[2] - cz) - r)
  const dy = c[1] < y0 ? y0 - c[1] : c[1] > y1 ? c[1] - y1 : 0
  return Math.hypot(dh, dy)
}

/** Distance from a point to an axis-aligned box; 0 inside. */
export function boxDistance(min: readonly number[], max: readonly number[], c: readonly number[]): number {
  const dx = Math.max(min[0] - c[0], 0, c[0] - max[0])
  const dy = Math.max(min[1] - c[1], 0, c[1] - max[1])
  const dz = Math.max(min[2] - c[2], 0, c[2] - max[2])
  return Math.hypot(dx, dy, dz)
}

/**
 * Distance from a point to a prop's real shape (0 inside): a ヤドカリ wall's box, a solid prop's colliders, any other
 * prop's cylinder.
 */
export function propDistance(r: Prop, c: readonly number[]): number {
  if (r.kind === 'hermit') {
    const w = hermitWallBox(r)
    return boxDistance(w.min, w.max, c)
  }
  let best = Infinity
  for (const v of propVolumes(r)) best = Math.min(best, cylDistance(r.p[0], r.p[2], v.r, v.y0, v.y1, c))
  return best
}

/** The point of a prop's shape nearest to `c`, a hair inside it (so a sight line to it counts the prop as the target). */
export function propNearest(r: Prop, c: readonly number[]): Vec {
  if (r.kind === 'hermit') {
    const w = hermitWallBox(r)
    const cl = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo + 0.05), hi - 0.05)
    return [cl(c[0], w.min[0], w.max[0]), cl(c[1], w.min[1], w.max[1]), cl(c[2], w.min[2], w.max[2])]
  }
  let best: Vec = [r.p[0], r.p[1], r.p[2]]
  let bd = Infinity
  const h = Math.hypot(c[0] - r.p[0], c[2] - r.p[2])
  for (const v of propVolumes(r)) {
    const k = h > 1e-6 ? Math.min(1, Math.max(0, v.r - 0.05) / h) : 0
    const q: Vec = [
      r.p[0] + (c[0] - r.p[0]) * k,
      Math.min(Math.max(c[1], v.y0 + 0.05), v.y1 - 0.05),
      r.p[2] + (c[2] - r.p[2]) * k
    ]
    const dd = Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2])
    if (dd < bd) {
      bd = dd
      best = q
    }
  }
  return best
}

/** Distance from a point to a body's shape (players and foes: their upright cylinder); 0 inside. */
export const bodyDistance = (b: { p: Vec; r: number; h: number }, c: readonly number[]) =>
  cylDistance(b.p[0], b.p[2], b.r, b.p[1], b.p[1] + b.h, c)

/** Distance from a point to any target's real shape. */
export function targetDistance(t: Target, c: readonly number[]): number {
  if (t.k === 'p') return bodyDistance(t.p, c)
  if (t.k === 'f') return bodyDistance(t.f.avatar ?? t.f, c)
  return propDistance(t.r, c)
}

/**
 * Where an effect aimed from `from` at `to` lands (a slam's impact, a boss strike): `to`, or just in front of the
 * first map box, ヤドカリ wall of another side or solid prop between them — never beyond cover.
 */
export function placeEffect(sim: Sim, from: readonly number[], to: readonly number[], side: Side, back = 0.15): Vec {
  const d: Vec = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  const len = Math.hypot(d[0], d[1], d[2])
  if (len < 1e-6) return [to[0], to[1], to[2]]
  const hit = sim.phys.raycast(from, d, 1, 0, side)
  if (!hit) return [to[0], to[1], to[2]]
  const t = Math.max(0, hit.t - back / len)
  return [from[0] + d[0] * t, from[1] + d[1] * t, from[2] + d[2] * t]
}

export const refOf = (t: Target): ActorRef => (t.k === 'p' ? t.p.id : t.k === 'f' ? t.f.id : t.r.id)

export const targetCenter = (t: Target): Vec =>
  t.k === 'p'
    ? [t.p.p[0], t.p.p[1] + t.p.h * 0.55, t.p.p[2]]
    : t.k === 'f'
      ? [t.f.p[0], t.f.p[1] + t.f.h * 0.5, t.f.p[2]]
      : [t.r.p[0], t.r.p[1] + propHeight(t.r) * 0.5, t.r.p[2]]

/**
 * The one occlusion rule for an effect crossing space from `from` to a target (melee sweeps, blasts, chain jumps,
 * auras): some part of the target — the point of it nearest `from`'s height, its centre, its top and, for a wide
 * body, its near side and both flanks — is in clear sight for `side` (map boxes, ヤドカリ walls of other sides, the solid 灯台 / 巣核; a solid prop does not hide
 * itself). Ray-borne effects (shots, beams, the hook, aim) get the same rule from Physics.raycast.
 */
export function targetVisible(sim: Sim, from: readonly number[], t: Target, side: Side): boolean {
  const pts: Vec[] = []
  if (t.k === 'r') {
    pts.push(propNearest(t.r, from), targetCenter(t))
  } else {
    const b = t.k === 'p' ? t.p : (t.f.avatar ?? t.f)
    const h = b.h
    const y = Math.min(Math.max(from[1], b.p[1] + 0.1), b.p[1] + h - 0.1)
    pts.push([b.p[0], y, b.p[2]], targetCenter(t), [b.p[0], b.p[1] + h * 0.9, b.p[2]])
    // A wide body (a boss) also shows its near side and both flanks: a thin cover hides only part of it.
    if (b.r > 0.8) {
      const dx = from[0] - b.p[0]
      const dz = from[2] - b.p[2]
      const l = Math.hypot(dx, dz) || 1
      const nx = dx / l
      const nz = dz / l
      const k = b.r * 0.85
      for (const yy of [y, b.p[1] + h * 0.5]) {
        pts.push([b.p[0] + nx * k, yy, b.p[2] + nz * k])
        pts.push([b.p[0] - nz * k, yy, b.p[2] + nx * k])
        pts.push([b.p[0] + nz * k, yy, b.p[2] - nx * k])
      }
    }
  }
  for (const q of pts) if (sim.phys.clear(from, q, side)) return true
  return false
}

/** Ray vs a humanoid body (players and クロヅメ avatars): returns t and whether the head sphere was hit. */
function rayBody(o: Vec, d: Vec, maxT: number, p: Player, inflate: number): { t: number; head: boolean } | null {
  const hr = p.species.headRadius
  const headC: Vec = [p.p[0], p.p[1] + p.h - hr, p.p[2]]
  const th = raySphere(o, d, maxT, headC, hr + inflate)
  const tb = rayCylinder(o, d, maxT, p.p[0], p.p[2], p.r + inflate, p.p[1], p.p[1] + p.h - 2 * hr)
  if (th < 0 && tb < 0) return null
  if (th >= 0 && (tb < 0 || th <= tb)) return { t: th, head: true }
  return { t: tb, head: false }
}

/** Foe hit volume: a vertical cylinder (bosses add their parts in bosses.ts via the same cylinder). */
function rayFoe(o: Vec, d: Vec, maxT: number, f: Foe, inflate: number): { t: number; head: boolean } | null {
  if (f.avatar) return rayBody(o, d, maxT, f.avatar, inflate)
  const t = rayCylinder(o, d, maxT, f.p[0], f.p[2], f.r + inflate, f.p[1], f.p[1] + f.h)
  return t >= 0 ? { t, head: false } : null
}

/**
 * First hostile actor hit by the segment o + d·t (t ∈ [0, maxT], |d| arbitrary). `side` is the shooter's side;
 * `skip` excludes one actor (the shooter).
 */
export function rayActors(
  sim: Sim,
  side: Side,
  o: Vec,
  d: Vec,
  maxT: number,
  inflate = 0,
  skip?: ActorRef,
  wide = false
): ActorHit | null {
  let best: ActorHit | null = null
  // A target whose volume already contains the ray's origin (the muzzle is inside it) is only a fallback: a shot
  // fired from inside or against a body goes on to what it is aimed at, and only hits the body it started in when
  // nothing else lies on the ray (point-blank at it).
  let inside: ActorHit | null = null
  let bestT = maxT
  const take = (t: number, target: ActorHit['target'], head: boolean) => {
    if (t <= 1e-9) inside ??= { t: 0, target, head }
    else if (t <= bestT) {
      bestT = t
      best = { t, target, head }
    }
  }
  for (const p of sim.players) {
    if (p.side === side || p.state !== 'alive' || p.id === skip) continue
    const h = rayBody(o, d, bestT, p, inflate)
    if (h && h.t <= bestT) take(h.t, { k: 'p', p }, h.head)
  }
  if (side !== FOE_SIDE) {
    const len = Math.hypot(d[0], d[2]) * maxT
    const foes =
      wide || len > 40 ? sim.foes : sim.foeHash.query(o[0] + (d[0] * maxT) / 2, o[2] + (d[2] * maxT) / 2, len / 2 + 7)
    for (const f of foes) {
      if (f.dead || f.id === skip) continue
      const h = rayFoe(o, d, bestT, f, inflate)
      if (h && h.t <= bestT) take(h.t, { k: 'f', f }, h.head)
    }
  }
  for (const r of sim.props) {
    if (!isShootableProp(r) || (r.side !== -1 && r.side === side)) continue
    if (r.side === -1 && side === FOE_SIDE) continue
    const t = rayProp(o, d, bestT, r, inflate)
    // A ray starting inside a solid prop leaves it, as in Physics.raycast (shots get there through their guard
    // segment from the shooter's body, src/sim/projectiles.ts, so a muzzle poking into it still hits it).
    if (t >= 0 && t <= 1e-9 && PROP_SOLIDS[r.kind]) continue
    if (t >= 0 && t <= bestT) take(t, { k: 'r', r }, false)
  }
  return best ?? inside
}

/** Applies damage to any target kind. */
export function hitTarget(sim: Sim, t: Target, d: DamageInfo): number {
  if (t.k === 'p') return damagePlayer(sim, t.p, d)
  if (t.k === 'f') return damageFoe(sim, t.f, d)
  return damageProp(sim, t.r, d)
}

/** Hostile actors whose body is within `radius` of `c` (optionally inside a yaw sector of `arcRad`). */
export function hostilesNear(
  sim: Sim,
  side: Side,
  c: Vec,
  radius: number,
  sector?: { yaw: number; arc: number; from: Vec },
  props = true
): Target[] {
  const out: Target[] = []
  const inSector = (pos: Vec) => !sector || angleFromYaw(sector.yaw, sector.from, pos) <= sector.arc / 2
  for (const p of sim.players) {
    if (p.side === side || p.state !== 'alive') continue
    if (bodyDistance(p, c) <= radius && inSector(p.p)) out.push({ k: 'p', p })
  }
  if (side !== FOE_SIDE) {
    for (const f of sim.foeHash.query(c[0], c[2], radius + 7)) {
      if (f.dead) continue
      if (bodyDistance(f, c) <= radius && inSector(f.p)) out.push({ k: 'f', f })
    }
  }
  if (props) {
    for (const r of sim.props) {
      if (!isDamageableProp(r) || !propHostileTo(r, side)) continue
      if (propDistance(r, c) <= radius && inSector(propNearest(r, c))) out.push({ k: 'r', r })
    }
  }
  return out
}

/** True when an ink cloud lies between a and b. */
export function inkBetween(sim: Sim, a: Vec, b: Vec): boolean {
  for (const r of sim.props) {
    if (r.gone || r.kind !== 'ink') continue
    const rad = r.r ?? 6
    const c: Vec = [r.p[0], r.p[1] + 1, r.p[2]]
    // Distance from the cloud centre to the segment.
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2]
    const l2 = dx * dx + dy * dy + dz * dz
    let t = l2 > 0 ? ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy + (c[2] - a[2]) * dz) / l2 : 0
    t = Math.max(0, Math.min(1, t))
    const px = a[0] + dx * t - c[0],
      py = a[1] + dy * t - c[1],
      pz = a[2] + dz * t - c[2]
    if (px * px + py * py + pz * pz <= rad * rad) return true
  }
  return false
}

/**
 * Whether player `p` is revealed by sonar to `side` (each side only learns of its own pulses); without a side,
 * whether any side revealed it.
 */
export function revealedFor(sim: Sim, p: Player, side?: number): boolean {
  if (side === undefined) return sim.time < p.revealedUntil
  return sim.time < (p.revealedBy?.[side] ?? 0)
}

/**
 * Whether an observer at `eye` (foe or bot of another side) can perceive player `p`: cloaked players are lost
 * beyond the antique's range unless they attacked within the last second; ink clouds block sight.
 */
export function canPerceive(
  sim: Sim,
  eye: Vec,
  p: Player,
  needLos = true,
  observerSide?: number,
  /** False: the 灯台 / 巣核 do not hide the player (a foe crowd keeps track of animals it was fighting round it). */
  solids = true
): boolean {
  if (p.state !== 'alive') return false
  const c: Vec = [p.p[0], p.p[1] + p.h * 0.6, p.p[2]]
  const d = vdist(eye, c)
  if (p.cloakOn && sim.time >= p.attackRevealUntil && !revealedFor(sim, p, observerSide)) {
    const u = ITEMS.leaf.use
    if (d > (u?.kind === 'cloak' ? u.loseRange : 5)) return false
  }
  if (d > 4 && inkBetween(sim, eye, c)) return false
  if (needLos && !sim.phys.clear(eye, c, -1, solids)) return false
  return true
}
