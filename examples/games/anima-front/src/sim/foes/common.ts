/**
 * Shared foe helpers: target selection (perceivable players, decoys, the mode's objective, nearest player),
 * target geometry, ground movement (flow field + separation + physics), flying movement, and the telegraphed
 * attack state machine (windup → attack → recover) with per-attack cooldowns.
 */
import type { FoeAttack, FoeAttackDef } from '../../data/enemies'
import { GRAVITY } from '../../data/species'
import { canPerceive } from '../actors'
import { damagePlayer, damageProp } from '../combat'
import { DECOY_RADIUS, DT, FOE_AGGRO } from '../constants'
import { emit, FOE_SIDE, type Foe, type Player, type Prop, type Sim, type TargetRef } from '../state'
import { r3v, type Vec } from '../vec'
import { navGrid } from '../grid'
import { flowDir, flowDist } from './flow'

export interface TargetInfo {
  ref: TargetRef
  /** Feet / base position. */
  pos: Vec
  /** Body centre (aim point). */
  center: Vec
  r: number
  player: Player | null
  prop: Prop | null
}

export const RETARGET = 0.5

export function setState(f: Foe, s: Foe['state']) {
  f.state = s
  f.st = 0
}

export const eye = (f: Foe): Vec => [f.p[0], f.p[1] + f.h * 0.8, f.p[2]]

export function resolve(sim: Sim, ref: TargetRef | null): TargetInfo | null {
  if (!ref) return null
  if (ref.k === 'p') {
    const p = sim.players.find((q) => q.id === ref.id)
    if (!p || p.state !== 'alive') return null
    return { ref, pos: p.p, center: [p.p[0], p.p[1] + p.h * 0.55, p.p[2]], r: p.r, player: p, prop: null }
  }
  if (ref.k === 'r') {
    const r = sim.props.find((q) => q.id === ref.id)
    if (!r || r.gone) return null
    const h = r.data.h ?? 2
    return { ref, pos: r.p, center: [r.p[0], r.p[1] + h * 0.5, r.p[2]], r: r.r ?? 1, player: null, prop: r }
  }
  const g = sim.foes.find((q) => q.id === ref.id)
  if (!g || g.dead) return null
  return { ref, pos: g.p, center: [g.p[0], g.p[1] + g.h * 0.5, g.p[2]], r: g.r, player: null, prop: null }
}

/** Picks the foe's target (every RETARGET seconds) and returns it resolved. */
export function pickTarget(sim: Sim, f: Foe): TargetInfo | null {
  let cur = resolve(sim, f.target)
  if (cur && sim.time < f.retargetAt) return cur
  f.retargetAt = sim.time + RETARGET + (f.id % 7) * 0.02
  const e = eye(f)
  // Decoys first (holograms and leaf decoys of any non-foe side).
  let best: TargetRef | null = null
  let bd = DECOY_RADIUS
  for (const r of sim.props) {
    if (r.gone || (r.kind !== 'decoy' && r.kind !== 'leafDecoy') || r.side === FOE_SIDE) continue
    const d = Math.hypot(r.p[0] - f.p[0], r.p[2] - f.p[2])
    if (d < bd) {
      bd = d
      best = { k: 'r', id: r.id }
    }
  }
  if (!best) {
    bd = FOE_AGGRO + (f.def.attacks[0]?.range ?? 0) * 0.5
    for (const p of sim.players) {
      if (p.state !== 'alive') continue
      const d = Math.hypot(p.p[0] - f.p[0], p.p[2] - f.p[2])
      if (d >= bd) continue
      if (!canPerceive(sim, e, p, d > 3)) continue
      bd = d
      best = { k: 'p', id: p.id }
    }
  }
  if (!best) best = sim.mode.goal(sim, f)
  if (best && best.k === 'r') {
    const r = sim.props.find((q) => q.id === best!.id)
    if (!r || r.gone || r.side === FOE_SIDE) best = null
  }
  if (!best) {
    bd = Infinity
    for (const p of sim.players) {
      if (p.state !== 'alive') continue
      // Cloaked players far away stay hidden.
      if (!canPerceive(sim, e, p, false)) continue
      const d = Math.hypot(p.p[0] - f.p[0], p.p[2] - f.p[2])
      if (d < bd) {
        bd = d
        best = { k: 'p', id: p.id }
      }
    }
  }
  f.target = best
  cur = resolve(sim, best)
  return cur
}

/** Horizontal distance between the foe's edge and the target's edge. */
export const edgeDist = (f: Foe, t: TargetInfo) =>
  Math.max(0, Math.hypot(t.pos[0] - f.p[0], t.pos[2] - f.p[2]) - f.r - t.r)

export const hDist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[2] - b[2])

export function faceTo(f: Foe, pos: Vec, rate = 8) {
  const want = Math.atan2(pos[0] - f.p[0], pos[2] - f.p[2])
  let d = want - f.yaw
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  const m = rate * DT
  f.yaw += Math.max(-m, Math.min(m, d))
  if (f.yaw > Math.PI) f.yaw -= Math.PI * 2
  if (f.yaw < -Math.PI) f.yaw += Math.PI * 2
}

const sepBuf: Foe[] = []

/**
 * Moves a ground foe with desired horizontal direction (dx, dz) × speed (0 = stop), adding separation from
 * neighbours, gravity and box collision.
 */
export function groundMove(sim: Sim, f: Foe, dx: number, dz: number, speed: number, accel = 30) {
  let wx = dx * speed
  let wz = dz * speed
  sepBuf.length = 0
  sim.foeHash.query(f.p[0], f.p[2], f.r + 1.5, sepBuf)
  for (const g of sepBuf) {
    if (g === f || g.dead || g.def.flying || g.def.boss) continue
    const ox = f.p[0] - g.p[0]
    const oz = f.p[2] - g.p[2]
    const d = Math.hypot(ox, oz)
    const min = f.r + g.r
    if (d >= min || d < 1e-6) continue
    const push = ((min - d) / min) * Math.max(3, speed)
    wx += (ox / d) * push
    wz += (oz / d) * push
  }
  const ax = wx - f.v[0]
  const az = wz - f.v[2]
  const l = Math.hypot(ax, az)
  const a = accel * DT
  if (l <= a) {
    f.v[0] = wx
    f.v[2] = wz
  } else {
    f.v[0] += (ax / l) * a
    f.v[2] += (az / l) * a
  }
  f.v[1] -= GRAVITY * DT
  sim.phys.move(f, DT, FOE_SIDE)
}

/** Ground chase toward a target: flow field when the straight line is blocked, direct otherwise. */
export function chase(sim: Sim, f: Foe, t: TargetInfo, speed: number) {
  const d = hDist(f.p, t.pos)
  let dir: [number, number] | null = null
  if (d > 4) {
    const key = t.ref.k + ':' + t.ref.id
    const open = navGrid(sim).lineOpen(f.p[0], f.p[2], t.pos[0], t.pos[2])
    if (!open) dir = flowDir(sim, key, t.pos, f.p)
  }
  let sp = speed
  if (!dir) {
    const l = d || 1
    dir = [(t.pos[0] - f.p[0]) / l, (t.pos[2] - f.p[2]) / l]
    // Never walk into the target's body: back off when overlapping, ease in when touching.
    const gap = d - f.r - t.r
    if (gap < -0.05) {
      dir = [-dir[0], -dir[1]]
      sp = speed * 0.5
    } else if (gap < 0.3) sp = 0
  }
  groundMove(sim, f, dir[0], dir[1], sp)
  if (Math.hypot(f.v[0], f.v[2]) > 0.3) faceTo(f, [f.p[0] + f.v[0], 0, f.p[2] + f.v[2]])
  if (sp > 0.5 && d > 4) unstick(sim, f, t.pos, t.ref.k + ':' + t.ref.id)
}

/**
 * Stuck fallback: every 2 s a chasing ground foe that moved < 1 m counts as stuck; after 3 checks in a row it
 * relocates to the open nav cell within ~6 m that is nearest to its target (squeezing past geometry the flow
 * field's 2 m cells let through but its body does not).
 */
function unstick(sim: Sim, f: Foe, goal: Vec, key: string) {
  if (sim.time < (f.mem.stuckAt ?? 0)) return
  const moved = Math.hypot(f.p[0] - (f.mem.sx ?? f.p[0] + 9), f.p[2] - (f.mem.sz ?? f.p[2]))
  f.mem.stuckAt = sim.time + 2
  f.mem.sx = f.p[0]
  f.mem.sz = f.p[2]
  f.mem.stuck = moved < 1 ? (f.mem.stuck ?? 0) + 1 : 0
  if (f.mem.stuck < 3) return
  f.mem.stuck = 0
  // Search wider after failed attempts; prefer the flow field's distance, straight distance as a fallback.
  const reach = Math.min(8, 3 + 2 * (f.mem.unstuckFails ?? 0))
  const g = navGrid(sim)
  const cx = g.cx(f.p[0])
  const cz = g.cz(f.p[2])
  const here = g.index(f.p[0], f.p[2])
  let best = -1
  let bf = flowDist(sim, key, here)
  let be = Math.hypot(goal[0] - f.p[0], goal[2] - f.p[2]) - 0.5
  for (let z = cz - reach; z <= cz + reach; z++) {
    for (let x = cx - reach; x <= cx + reach; x++) {
      if (x < 0 || z < 0 || x >= g.w || z >= g.h) continue
      const i = z * g.w + x
      if (i === here || !g.open(i)) continue
      const px = g.centerX(i)
      const pz = g.centerZ(i)
      if (sim.phys.overlaps([px, 0, pz], f.r, f.h, FOE_SIDE)) continue
      const fd = flowDist(sim, key, i)
      const ed = Math.hypot(goal[0] - px, goal[2] - pz)
      if (fd < bf || (fd === bf && fd === Infinity && ed < be)) {
        bf = fd
        be = ed
        best = i
      }
    }
  }
  if (best < 0) {
    f.mem.unstuckFails = (f.mem.unstuckFails ?? 0) + 1
    return
  }
  f.mem.unstuckFails = 0
  f.p[0] = g.centerX(best)
  f.p[2] = g.centerZ(best)
  f.p[1] = sim.phys.groundHeight(f.p[0], f.p[2], f.r, f.p[1] + 1)
  f.v[0] = f.v[2] = 0
}

/** Moves directly away from / sideways around a point (kiting). */
export function kite(sim: Sim, f: Foe, from: Vec, speed: number, side: number) {
  let dx = f.p[0] - from[0]
  let dz = f.p[2] - from[2]
  const l = Math.hypot(dx, dz) || 1
  dx /= l
  dz /= l
  // Blend away with a sideways component (side = −1..1).
  groundMove(sim, f, dx + -dz * side, dz + dx * side, speed / Math.hypot(1, side))
}

export function stop(sim: Sim, f: Foe) {
  groundMove(sim, f, 0, 0, 0)
}

/** Flying movement toward a point (keeps above box tops). */
export function flyTo(sim: Sim, f: Foe, to: Vec, speed: number, accel = 14) {
  const floor = sim.phys.groundHeight(to[0], to[2], f.r, 200)
  const ty = Math.max(to[1], floor + 1.5)
  const dx = to[0] - f.p[0]
  const dy = ty - f.p[1]
  const dz = to[2] - f.p[2]
  const l = Math.hypot(dx, dy, dz)
  const k = l > 1e-6 ? Math.min(speed, l * 3) / l : 0
  const wx = dx * k
  const wy = dy * k
  const wz = dz * k
  const a = accel * DT
  f.v[0] += Math.max(-a, Math.min(a, wx - f.v[0]))
  f.v[1] += Math.max(-a, Math.min(a, wy - f.v[1]))
  f.v[2] += Math.max(-a, Math.min(a, wz - f.v[2]))
  f.p[0] += f.v[0] * DT
  f.p[1] += f.v[1] * DT
  f.p[2] += f.v[2] * DT
  const under = sim.phys.groundHeight(f.p[0], f.p[2], f.r, f.p[1] + 0.5)
  if (f.p[1] < under + 0.3) f.p[1] = under + 0.3
  const b = sim.map.bounds
  f.p[0] = Math.max(b.min[0] + f.r, Math.min(b.max[0] - f.r, f.p[0]))
  f.p[2] = Math.max(b.min[1] + f.r, Math.min(b.max[1] - f.r, f.p[2]))
}

// ---------------------------------------------------------------------------------------------------------------
// Attacks

export const attackDef = (f: Foe, id: FoeAttack): FoeAttackDef | undefined => f.def.attacks.find((a) => a.id === id)

export const isReady = (sim: Sim, f: Foe, id: FoeAttack) => sim.time >= (f.cds[id] ?? 0)

/** Cooldown multiplier (bosses speed up per phase). */
export const cdScale = (f: Foe) => f.mem.cdScale ?? 1

export function startWindup(sim: Sim, f: Foe, atk: FoeAttackDef, aim: Vec | null) {
  f.attack = atk
  f.aim = aim ? [aim[0], aim[1], aim[2]] : null
  setState(f, 'windup')
  f.v[0] *= 0.2
  f.v[2] *= 0.2
  emit(sim, {
    type: 'foeWindup',
    foe: f.id,
    attack: atk.id,
    at: r3v(f.p),
    ...(f.aim ? { aim: r3v(f.aim) } : {})
  })
}

/** True once the current wind-up has lasted its data time. */
export const windupDone = (f: Foe) => f.state === 'windup' && !!f.attack && f.st >= f.attack.windup - 1e-9

/** Emits foeAttack, starts the cooldown and enters 'attack'. */
export function launchAttack(sim: Sim, f: Foe) {
  const atk = f.attack!
  f.cds[atk.id] = sim.time + atk.cooldown * cdScale(f)
  setState(f, 'attack')
  emit(sim, {
    type: 'foeAttack',
    foe: f.id,
    attack: atk.id,
    at: r3v(f.p),
    ...(f.aim ? { aim: r3v(f.aim) } : {})
  })
}

export function recover(f: Foe) {
  setState(f, 'recover')
}

/** Ends 'recover' after `time` seconds. Returns true while still recovering. */
export function recovering(f: Foe, time = 0.35): boolean {
  if (f.state !== 'recover') return false
  if (f.st >= time) {
    f.attack = null
    f.aim = null
    setState(f, 'move')
    return false
  }
  return true
}

/** Damages the resolved target if it is still within `reach` of the foe's edge. */
export function strike(sim: Sim, f: Foe, t: TargetInfo | null, reach: number, dmg: number, item: FoeAttack, knock = 0) {
  if (!t) return
  if (edgeDist(f, t) > reach) return
  if (Math.abs(t.pos[1] - f.p[1]) > f.h + 2) return
  const amount = dmg * f.dmgMul
  if (t.player)
    damagePlayer(sim, t.player, {
      amount,
      kind: 'melee',
      side: FOE_SIDE,
      by: f.id,
      item,
      at: t.center,
      from: f.p,
      knock
    })
  else if (t.prop && t.prop.hp !== undefined)
    damageProp(sim, t.prop, { amount, kind: 'melee', side: FOE_SIDE, by: f.id, item, at: t.center, from: f.p })
}

/** Damages every alive player within `r` of a point (once each, tracked in `hit`). */
export function hitPlayersNear(
  sim: Sim,
  f: Foe,
  c: Vec,
  r: number,
  dmg: number,
  item: FoeAttack,
  hit: Set<string>,
  knock = 0
) {
  for (const p of sim.players) {
    if (p.state !== 'alive' || hit.has(p.id) || p.side === FOE_SIDE) continue
    const y = Math.min(Math.max(c[1], p.p[1]), p.p[1] + p.h)
    if (Math.hypot(p.p[0] - c[0], y - c[1], p.p[2] - c[2]) - p.r > r) continue
    hit.add(p.id)
    damagePlayer(sim, p, {
      amount: dmg * f.dmgMul,
      kind: 'melee',
      side: FOE_SIDE,
      by: f.id,
      item,
      at: [p.p[0], p.p[1] + p.h * 0.5, p.p[2]],
      from: f.p,
      knock
    })
  }
}

const hitSets = new WeakMap<Foe, Set<string>>()
export function hitSet(f: Foe, reset = false): Set<string> {
  let s = hitSets.get(f)
  if (!s || reset) {
    s = new Set()
    hitSets.set(f, s)
  }
  return s
}

/** Gravity for a lobbed shot so a `speed` launch can reach `dist` on a high arc. */
export const lobGravity = (speed: number, dist: number, max = 20) =>
  Math.max(4, Math.min(max, ((speed * speed) / Math.max(1, dist)) * 0.92))
