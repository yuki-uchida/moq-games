/**
 * Actor hit volumes and queries shared by antiques, projectiles, foes and bots: ray/segment tests against
 * players (body cylinder + head sphere), foes (cylinder; クロヅメ animals like players) and damageable props;
 * hostile actors in a radius or sector; sight rules (cloak, ink).
 */
import { ITEMS } from '../data/items'
import { damageFoe, damagePlayer, damageProp, type DamageInfo } from './combat'
import { raySphere, rayCylinder } from './physics'
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

export const refOf = (t: Target): ActorRef => (t.k === 'p' ? t.p.id : t.k === 'f' ? t.f.id : t.r.id)

export const targetCenter = (t: Target): Vec =>
  t.k === 'p'
    ? [t.p.p[0], t.p.p[1] + t.p.h * 0.55, t.p.p[2]]
    : t.k === 'f'
      ? [t.f.p[0], t.f.p[1] + t.f.h * 0.5, t.f.p[2]]
      : [t.r.p[0], t.r.p[1] + propHeight(t.r) * 0.5, t.r.p[2]]

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
  let bestT = maxT
  for (const p of sim.players) {
    if (p.side === side || p.state !== 'alive' || p.id === skip) continue
    const h = rayBody(o, d, bestT, p, inflate)
    if (h && h.t <= bestT) {
      bestT = h.t
      best = { t: h.t, target: { k: 'p', p }, head: h.head }
    }
  }
  if (side !== FOE_SIDE) {
    const len = Math.hypot(d[0], d[2]) * maxT
    const foes =
      wide || len > 40 ? sim.foes : sim.foeHash.query(o[0] + (d[0] * maxT) / 2, o[2] + (d[2] * maxT) / 2, len / 2 + 7)
    for (const f of foes) {
      if (f.dead || f.id === skip) continue
      const h = rayFoe(o, d, bestT, f, inflate)
      if (h && h.t <= bestT) {
        bestT = h.t
        best = { t: h.t, target: { k: 'f', f }, head: h.head }
      }
    }
  }
  for (const r of sim.props) {
    if (!isShootableProp(r) || (r.side !== -1 && r.side === side)) continue
    if (r.side === -1 && side === FOE_SIDE) continue
    const t = rayCylinder(o, d, bestT, r.p[0], r.p[2], (r.r ?? 1) + inflate, r.p[1], r.p[1] + propHeight(r))
    if (t >= 0 && t <= bestT) {
      bestT = t
      best = { t, target: { k: 'r', r }, head: false }
    }
  }
  return best
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
      if (vClose(r.p, propHeight(r), r.r ?? 1) && inSector(r.p)) out.push({ k: 'r', r })
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
 * Whether an observer at `eye` (foe or bot of another side) can perceive player `p`: cloaked players are lost
 * beyond the antique's range unless they attacked within the last second; ink clouds block sight.
 */
export function canPerceive(sim: Sim, eye: Vec, p: Player, needLos = true): boolean {
  if (p.state !== 'alive') return false
  const c: Vec = [p.p[0], p.p[1] + p.h * 0.6, p.p[2]]
  const d = vdist(eye, c)
  if (p.cloakOn && sim.time >= p.attackRevealUntil && sim.time >= p.revealedUntil) {
    const u = ITEMS.leaf.use
    if (d > (u?.kind === 'cloak' ? u.loseRange : 5)) return false
  }
  if (d > 4 && inkBetween(sim, eye, c)) return false
  if (needLos && !sim.phys.clear(eye, c, -1)) return false
  return true
}
