/**
 * Bot state and situation awareness (DESIGN §13): skill curves, perception with reaction time, target choice by
 * threat and distance, and the movement goal (revive, retreat, engage, objective / lanes).
 */
import { canPerceive, targetCenter, type Target } from '../actors'
import type { Rng } from '../rng'
import { FOE_SIDE, type Player, type Sim, type TargetRef } from '../state'
import { hdist, vdist, type Vec } from '../vec'

export interface PawCtl {
  /** The fire button is being held by the controller. */
  holding: boolean
  holdStart: number
}

export interface Brain {
  rng: Rng
  idx: number
  path: [number, number][] | null
  pathGoal: Vec | null
  pathAt: number
  /** Current target and since when it has been perceived without interruption. */
  target: TargetRef | null
  seenSince: number
  lastSeen: number
  perceiveAt: number
  errYaw: number
  errPitch: number
  errTo: [number, number]
  errAt: number
  strafe: number
  strafeAt: number
  paws: [PawCtl, PawCtl]
  /** Retreating to regenerate until anima recovers. */
  retreat: boolean
  wander: Vec | null
  wanderAt: number
  stuckAt: number
  stuckP: Vec
  dodged: Set<string>
  gadgetAt: Record<string, number>
  gadget: { hand: 0 | 1; idx: number; pressed: boolean; until: number; pitch?: number } | null
  taken: number[]
  contactAt: number
  /** Perception summary: targets seen, targets near the current one, hostiles within 8 m. */
  seenCount: number
  cluster: number
  close: number
  /** Move order (tools/tests, e.g. "go there"): replaces roaming when there is nothing to fight. */
  order: Vec | null
  /** Desired selection per paw (absolute index). */
  sel: [number, number]
}

export const reactionTime = (skill: number) => 0.6 - 0.45 * skill
export const aimErrorDeg = (skill: number) => 6 - 5 * skill

/** Stable small hash of an id (staggers heavy work across bots deterministically). */
function idHash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0
  return h
}

export function makeBrain(sim: Sim, p: Player): Brain {
  return {
    rng: sim.rng.fork(),
    idx: idHash(p.id),
    path: null,
    pathGoal: null,
    pathAt: -10,
    target: null,
    seenSince: 0,
    lastSeen: -10,
    perceiveAt: 0,
    errYaw: 0,
    errPitch: 0,
    errTo: [0, 0],
    errAt: 0,
    strafe: 1,
    strafeAt: 0,
    paws: [
      { holding: false, holdStart: 0 },
      { holding: false, holdStart: 0 }
    ],
    retreat: false,
    wander: null,
    wanderAt: 0,
    stuckAt: sim.time,
    stuckP: [p.p[0], p.p[1], p.p[2]],
    dodged: new Set(),
    gadgetAt: {},
    gadget: null,
    taken: [],
    contactAt: -100,
    seenCount: 0,
    order: null,
    cluster: 0,
    close: 0,
    sel: [Math.max(0, p.hands[0].sel), Math.max(0, p.hands[1].sel)]
  }
}

/** Resolves a target reference to a live target. */
export function resolve(sim: Sim, ref: TargetRef | null): Target | null {
  if (!ref) return null
  if (ref.k === 'p') {
    const q = sim.players.find((x) => x.id === ref.id)
    return q && q.state === 'alive' ? { k: 'p', p: q } : null
  }
  if (ref.k === 'f') {
    const f = sim.foes.find((x) => x.id === ref.id)
    return f && !f.dead && f.state !== 'spawn' ? { k: 'f', f } : null
  }
  const r = sim.props.find((x) => x.id === ref.id)
  return r && !r.gone && r.hp !== undefined ? { k: 'r', r } : null
}

export const refKey = (r: TargetRef) => `${r.k}:${r.id}`

export const eyeOf = (p: Player): Vec => [p.p[0], p.p[1] + p.h * 0.85, p.p[2]]

/** Enemy base the point is inside of (PvP no-go zones). */
export function inEnemyBase(sim: Sim, p: Player, at: Vec, margin = 2): boolean {
  if (sim.cfg.mode !== 'pvp') return false
  return sim.map.bases.some((b) => b.team !== p.team && b.team !== 'squad' && hdist(b.p, at) < b.r + margin)
}

/** All hostile targets this bot can perceive right now, with a selection score (lower is better). */
export function perceive(sim: Sim, p: Player, range = 60): { t: Target; ref: TargetRef; score: number; d: number }[] {
  const eye = eyeOf(p)
  const out: { t: Target; ref: TargetRef; score: number; d: number }[] = []
  for (const q of sim.players) {
    if (q.side === p.side || q.state !== 'alive') continue
    const d = vdist(q.p, p.p)
    if (d > range) continue
    if (inEnemyBase(sim, p, q.p, 0)) continue
    if (!canPerceive(sim, eye, q) && sim.time >= q.revealedUntil) continue
    out.push({ t: { k: 'p', p: q }, ref: { k: 'p', id: q.id }, score: d - (q.anima / q.maxAnima < 0.3 ? 6 : 0), d })
  }
  if (p.side !== FOE_SIDE) {
    // Nearest foes first; LOS is only checked for the closest few (budget).
    const cands: { f: (typeof sim.foes)[number]; d: number }[] = []
    for (const f of sim.foeHash.query(p.p[0], p.p[2], range)) {
      if (f.dead || f.state === 'spawn' || f.passive) continue
      const d = vdist(f.p, p.p)
      if (d <= range + f.r) cands.push({ f, d: Math.max(0, d - f.r) })
    }
    for (const f of sim.foes) {
      // Bosses are large: always consider them.
      if (f.def.boss && !f.dead && f.state !== 'spawn' && !cands.some((c) => c.f === f)) {
        const d = Math.max(0, vdist(f.p, p.p) - f.r)
        if (d <= range * 1.5) cands.push({ f, d })
      }
    }
    cands.sort((a, b) => a.d - b.d || a.f.id - b.f.id)
    let checked = 0
    for (const c of cands) {
      const f = c.f
      const revealed = f.revealedUntil > sim.time
      if (!revealed) {
        if (checked >= 8) continue
        checked++
        const tc = targetCenter({ k: 'f', f })
        if (!f.def.boss && !sim.phys.clear(eye, tc, -1)) continue
      }
      let score = c.d
      if (f.def.boss) score -= 12
      if (f.state === 'windup') score -= 4
      if (f.target && f.target.k === 'p' && f.target.id === p.id) score -= 5
      out.push({ t: { k: 'f', f }, ref: { k: 'f', id: f.id }, score, d: c.d })
    }
    // Foe-side objectives (巣核 nodes) are targets too, a little less urgent than foes.
    for (const r of sim.props) {
      if (r.gone || r.hp === undefined || r.side !== FOE_SIDE) continue
      const d = Math.max(0, vdist(r.p, p.p) - (r.r ?? 1))
      if (d > range) continue
      const t: Target = { k: 'r', r }
      if (!sim.phys.clear(eye, targetCenter(t), -1)) continue
      out.push({ t, ref: { k: 'r', id: r.id }, score: d + 10, d })
    }
  } else if (p.foe) {
    // クロヅメ avatars also attack the objective the mode gives them.
    const g = sim.mode.goal(sim, p.foe)
    if (g && g.k === 'r') {
      const t = resolve(sim, g)
      if (t) {
        const d = vdist(targetCenter(t), p.p)
        if (d <= range) out.push({ t, ref: g, score: d + 8, d })
      }
    }
  }
  out.sort((a, b) => a.score - b.score)
  return out
}

/** Points to roam between in PvP (plaza and the lanes between it and each base). */
export function lanePoints(sim: Sim, p: Player): Vec[] {
  const plaza = sim.map.anchors.plaza ?? sim.mode.focus(sim, p.side)
  const c: Vec = plaza
    ? [plaza[0], plaza[1], plaza[2]]
    : [(sim.map.bounds.min[0] + sim.map.bounds.max[0]) / 2, 0, (sim.map.bounds.min[1] + sim.map.bounds.max[1]) / 2]
  const pts: Vec[] = [c]
  for (const b of sim.map.bases) {
    if (b.team === 'squad') continue
    const k = b.team === p.team ? 0.55 : 0.4
    pts.push([c[0] + (b.p[0] - c[0]) * k, 0, c[2] + (b.p[2] - c[2]) * k])
  }
  return pts
}

/** Own base (PvP team base or PvE squad base) nearest to the player. */
export function homeBase(sim: Sim, p: Player): Vec | null {
  let best: Vec | null = null
  let bd = Infinity
  for (const b of sim.map.bases) {
    const mine = sim.cfg.mode === 'pvp' ? b.team === p.team : b.team === 'squad' || b.team === p.team
    if (!mine) continue
    const d = hdist(b.p, p.p)
    if (d < bd) {
      bd = d
      best = [b.p[0], b.p[1], b.p[2]]
    }
  }
  return best
}

/** Centroid of living allies (excluding the bot), or null. */
export function squadCentroid(sim: Sim, p: Player): Vec | null {
  let n = 0
  const c: Vec = [0, 0, 0]
  for (const q of sim.players) {
    if (q === p || q.side !== p.side || q.state !== 'alive') continue
    c[0] += q.p[0]
    c[1] += q.p[1]
    c[2] += q.p[2]
    n++
  }
  return n ? [c[0] / n, c[1] / n, c[2] / n] : null
}
