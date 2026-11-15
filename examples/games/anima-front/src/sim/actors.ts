/**
 * Actor hit volumes and queries shared by antiques, projectiles, foes and bots: ray/segment tests against
 * players (body cylinder + head sphere), foes (cylinder; クロヅメ animals like players) and damageable props;
 * hostile actors in a radius or sector; sight rules (cloak, ink).
 */
import { ITEMS } from '../data/items'
import { damageFoe, damagePlayer, damageProp, type DamageInfo } from './combat'
import { raySphere, rayCylinder } from './physics'
import { PROP_SOLIDS } from './prop-solids'
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

/** Distance from a point to a prop's hit volume (0 inside). */
export function propDistance(r: Prop, c: readonly number[]): number {
  let best = Infinity
  const h = Math.hypot(c[0] - r.p[0], c[2] - r.p[2])
  for (const v of propVolumes(r)) {
    const dh = Math.max(0, h - v.r)
    const dy = c[1] < v.y0 ? v.y0 - c[1] : c[1] > v.y1 ? c[1] - v.y1 : 0
    best = Math.min(best, Math.hypot(dh, dy))
  }
  return best
}

/** The point of a prop's hit volume nearest to `c` (on its axis side; inside the volume for a solid). */
export function propNearest(r: Prop, c: readonly number[]): Vec {
  let best: Vec = [r.p[0], r.p[1], r.p[2]]
  let bd = Infinity
  const h = Math.hypot(c[0] - r.p[0], c[2] - r.p[2])
  for (const v of propVolumes(r)) {
    // a hair inside the surface, so a sight line to it counts the prop itself as the target
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

export const refOf = (t: Target): ActorRef => (t.k === 'p' ? t.p.id : t.k === 'f' ? t.f.id : t.r.id)

export const targetCenter = (t: Target): Vec =>
  t.k === 'p'
    ? [t.p.p[0], t.p.p[1] + t.p.h * 0.55, t.p.p[2]]
    : t.k === 'f'
      ? [t.f.p[0], t.f.p[1] + t.f.h * 0.5, t.f.p[2]]
      : [t.r.p[0], t.r.p[1] + propHeight(t.r) * 0.5, t.r.p[2]]

/**
 * The one occlusion rule for an effect crossing space from `from` to a target (melee sweeps, blasts, chain jumps,
 * auras): some part of the target — the point of it nearest `from`'s height, its centre or its top — is in clear
 * sight for `side` (map boxes, ヤドカリ walls of other sides, the solid 灯台 / 巣核; a solid prop does not hide
 * itself). Ray-borne effects (shots, beams, the hook, aim) get the same rule from Physics.raycast.
 */
export function targetVisible(sim: Sim, from: readonly number[], t: Target, side: Side): boolean {
  const pts: Vec[] = []
  if (t.k === 'r') {
    pts.push(propNearest(t.r, from), targetCenter(t))
  } else {
    const b = t.k === 'p' ? t.p : (t.f.avatar ?? t.f)
    const h = b.h
    pts.push([b.p[0], Math.min(Math.max(from[1], b.p[1] + 0.1), b.p[1] + h - 0.1), b.p[2]], targetCenter(t), [
      b.p[0],
      b.p[1] + h * 0.9,
      b.p[2]
    ])
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
  const vClose = (pos: Vec, h: number, r: number) => {
    const y = Math.min(Math.max(c[1], pos[1]), pos[1] + h)
    return Math.hypot(pos[0] - c[0], y - c[1], pos[2] - c[2]) - r <= radius
  }
  for (const p of sim.players) {
    if (p.side === side || p.state !== 'alive') continue
    if (vClose(p.p, p.h, p.r) && inSector(p.p)) out.push({ k: 'p', p })
  }
  if (side !== FOE_SIDE) {
    for (const f of sim.foeHash.query(c[0], c[2], radius + 7)) {
      if (f.dead) continue
      if (vClose(f.p, f.h, f.r) && inSector(f.p)) out.push({ k: 'f', f })
    }
  }
  if (props) {
    for (const r of sim.props) {
      if (!isShootableProp(r) || (r.side !== -1 && r.side === side)) continue
      if (r.side === -1 && side === FOE_SIDE) continue
      if (propDistance(r, c) <= radius && inSector(r.p)) out.push({ k: 'r', r })
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
