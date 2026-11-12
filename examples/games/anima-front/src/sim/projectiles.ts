/**
 * Projectiles (DESIGN §10): swept spheres against boxes (inflated ray casts, so nothing tunnels even at 400 m/s),
 * dynamic walls and actor hit volumes. Bullets, pellets with falloff, bouncing grenades with fuses, homing darts,
 * explosive shells, ink balls and every foe projectile (acid, laser, plasma, missiles, acid rain).
 */
import type { FoeAttack } from '../data/enemies'
import type { ItemId } from '../data/items'
import type { Hand } from '../data/loadout'
import { hitTarget, rayActors, type Target } from './actors'
import { blast, damagePlayer, damageProp } from './combat'
import { ACID_PUDDLE_DPS, ACID_PUDDLE_TIME, DT, PUFFER_FALLOFF } from './constants'
import { addProp } from './props'
import { emit, findProp, type Hazard, type Shot, type Side, type Sim } from './state'
import type { ActorRef, ShotKind } from './types'
import { r3v, vnorm, type Vec } from './vec'

const MAX_SHOTS = 400

export interface ShotSpec {
  kind: ShotKind
  item?: ItemId
  foeAttack?: FoeAttack
  side: Side
  owner?: ActorRef
  hand?: Hand
  p: Vec
  v: Vec
  dmg: number
  headMult?: number
  gravity?: number
  range?: number
  life?: number
  r?: number
  blast?: { radius: number; damage: number }
  bounce?: number
  fuse?: number
  homing?: { ref: ActorRef; turn: number }
  /** Damage at max range as a share (pellets fade linearly to it). */
  falloff?: number
  puddle?: boolean
  explodeOnActor?: boolean
  knock?: number
}

export function spawnShot(sim: Sim, s: ShotSpec): Shot | null {
  if (sim.shots.length >= MAX_SHOTS) return null
  const shot: Shot = {
    id: sim.nextShot++,
    kind: s.kind,
    item: s.item,
    foeAttack: s.foeAttack,
    side: s.side,
    owner: s.owner,
    hand: s.hand,
    p: [s.p[0], s.p[1], s.p[2]],
    v: [s.v[0], s.v[1], s.v[2]],
    origin: [s.p[0], s.p[1], s.p[2]],
    r: s.r ?? 0.08,
    dmg: s.dmg,
    headMult: s.headMult ?? 1,
    gravity: s.gravity ?? 0,
    life: s.life ?? 4,
    travelled: 0,
    range: s.range ?? 300,
    blast: s.blast ?? null,
    bounce: s.bounce ?? 0,
    fuse: s.fuse ?? 0,
    homing: s.homing ?? null,
    falloff: s.falloff ?? 1,
    puddle: s.puddle ?? false,
    explodeOnActor: s.explodeOnActor ?? false,
    knock: s.knock ?? 0,
    gone: false
  }
  sim.shots.push(shot)
  return shot
}

function homingTarget(sim: Sim, ref: ActorRef): Vec | null {
  if (typeof ref === 'number') {
    const f = sim.foes.find((x) => x.id === ref)
    return f && !f.dead ? [f.p[0], f.p[1] + f.h * 0.5, f.p[2]] : null
  }
  const p = sim.players.find((x) => x.id === ref)
  return p && p.state === 'alive' ? [p.p[0], p.p[1] + p.h * 0.55, p.p[2]] : null
}

function steer(v: Vec, want: Vec, maxAngle: number) {
  const sp = Math.hypot(v[0], v[1], v[2])
  const a = vnorm(v)
  const b = vnorm(want)
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const ang = Math.acos(dot)
  if (ang < 1e-6) return
  const k = Math.min(1, maxAngle / ang)
  const n = vnorm([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k])
  v[0] = n[0] * sp
  v[1] = n[1] * sp
  v[2] = n[2] * sp
}

function explode(sim: Sim, s: Shot, at: Vec) {
  s.gone = true
  if (s.kind === 'octopus') {
    addProp(sim, 'ink', at, 0, s.side, {
      r: 6,
      until: sim.time + 8,
      owner: typeof s.owner === 'string' ? s.owner : undefined
    })
    emit(sim, { type: 'impact', at: r3v(at), normal: [0, 1, 0], surface: 'ground', item: s.kind })
    return
  }
  if (!s.blast) return
  blast(sim, at, s.blast.radius, s.blast.damage, s.side, s.owner, s.foeAttack ?? s.kind, { knock: s.knock })
  if (s.puddle) {
    const g = sim.phys.groundHeight(at[0], at[2], 0.2, at[1] + 0.5)
    const hz: Hazard = {
      id: sim.nextProp++,
      at: sim.time,
      p: [at[0], g, at[2]],
      r: s.blast.radius,
      dps: ACID_PUDDLE_DPS,
      until: sim.time + ACID_PUDDLE_TIME,
      side: s.side,
      owner: s.owner,
      kind: 'acid'
    }
    sim.hazards.push(hz)
  }
}

function directHit(sim: Sim, s: Shot, t: Target, at: Vec, head: boolean) {
  s.gone = true
  if (s.blast || s.kind === 'octopus') {
    explode(sim, s, at)
    return
  }
  let dmg = s.dmg
  if (s.falloff < 1 && s.range > 0) dmg *= 1 - (1 - s.falloff) * Math.min(1, s.travelled / s.range)
  hitTarget(sim, t, {
    amount: dmg,
    kind: 'ranged',
    side: s.side,
    by: s.owner,
    item: s.foeAttack ?? s.kind,
    at,
    from: s.origin,
    head,
    headMult: s.headMult,
    knock: s.knock
  })
}

export function shotsTick(sim: Sim) {
  for (const s of sim.shots) {
    if (s.gone) continue
    if (s.homing) {
      const tp = homingTarget(sim, s.homing.ref)
      if (tp) steer(s.v, [tp[0] - s.p[0], tp[1] - s.p[1], tp[2] - s.p[2]], s.homing.turn * DT)
      else s.homing = null
    }
    s.v[1] -= s.gravity * DT
    const seg: Vec = [s.v[0] * DT, s.v[1] * DT, s.v[2] * DT]
    const wall = sim.phys.raycast(s.p, seg, 1, s.r, s.side)
    const act = rayActors(sim, s.side, s.p, seg, wall ? wall.t : 1, s.r, s.owner)
    if (act && (!wall || act.t <= wall.t)) {
      const at: Vec = [s.p[0] + seg[0] * act.t, s.p[1] + seg[1] * act.t, s.p[2] + seg[2] * act.t]
      s.travelled += Math.hypot(seg[0], seg[1], seg[2]) * act.t
      if (s.bounce > 0 && !s.explodeOnActor && act.target.k !== 'f') {
        // Grenades bounce off players/props they cannot blow up on.
        s.v[0] *= -s.bounce
        s.v[2] *= -s.bounce
      } else directHit(sim, s, act.target, at, act.head)
      continue
    }
    if (wall) {
      const at = wall.point
      s.travelled += Math.hypot(seg[0], seg[1], seg[2]) * wall.t
      if (s.bounce > 0 && s.fuse > 0) {
        const n = wall.normal
        const vn = s.v[0] * n[0] + s.v[1] * n[1] + s.v[2] * n[2]
        s.v[0] = (s.v[0] - 2 * vn * n[0]) * s.bounce
        s.v[1] = (s.v[1] - 2 * vn * n[1]) * s.bounce
        s.v[2] = (s.v[2] - 2 * vn * n[2]) * s.bounce
        s.p = [at[0] + n[0] * 0.02, at[1] + n[1] * 0.02, at[2] + n[2] * 0.02]
        if (n[1] > 0.7 && Math.abs(s.v[1]) < 1.5) s.v[1] = 0
      } else if (s.blast || s.kind === 'octopus') {
        explode(sim, s, [at[0] + wall.normal[0] * 0.1, at[1] + wall.normal[1] * 0.1, at[2] + wall.normal[2] * 0.1])
        continue
      } else {
        s.gone = true
        emit(sim, { type: 'impact', at: r3v(at), normal: wall.normal, surface: wall.surface, item: s.kind })
        if (wall.box === -3 && wall.tag !== undefined) {
          const r = findProp(sim, wall.tag)
          if (r)
            damageProp(sim, r, {
              amount: s.dmg,
              kind: 'ranged',
              side: s.side,
              by: s.owner,
              item: s.foeAttack ?? s.kind,
              at,
              from: s.origin
            })
        }
        continue
      }
    } else {
      s.p[0] += seg[0]
      s.p[1] += seg[1]
      s.p[2] += seg[2]
      s.travelled += Math.hypot(seg[0], seg[1], seg[2])
    }
    s.life -= DT
    if (s.fuse > 0) {
      s.fuse -= DT
      if (s.fuse <= 0) {
        explode(sim, s, [s.p[0], s.p[1], s.p[2]])
        continue
      }
    }
    if (s.life <= 0 || s.travelled > s.range) {
      if (s.blast || s.kind === 'octopus') explode(sim, s, [s.p[0], s.p[1], s.p[2]])
      s.gone = true
    }
  }
  if (sim.shots.some((s) => s.gone)) sim.shots = sim.shots.filter((s) => !s.gone)
}

/** Acid puddles and other ground hazards (damage applied in 0.25 s chunks). */
export function hazardsTick(sim: Sim) {
  if (!sim.hazards.length) return
  const chunk = sim.tick % 15 === 0
  for (const h of sim.hazards) {
    if (!chunk) continue
    for (const p of sim.players) {
      if (p.side === h.side || p.state !== 'alive') continue
      if (Math.hypot(p.p[0] - h.p[0], p.p[2] - h.p[2]) > h.r + p.r || p.p[1] - h.p[1] > 0.6) continue
      damagePlayer(sim, p, {
        amount: h.dps * 0.25,
        kind: 'hazard',
        side: h.side,
        by: h.owner,
        item: h.kind,
        at: [p.p[0], p.p[1] + 0.1, p.p[2]],
        from: h.p
      })
    }
  }
  sim.hazards = sim.hazards.filter((h) => h.until > sim.time)
}

/** Ballistic launch velocity reaching `to` from `from` at `speed` with gravity g (high or low arc). */
export function ballistic(from: Vec, to: Vec, speed: number, g: number, high: boolean): Vec {
  const dx = to[0] - from[0]
  const dz = to[2] - from[2]
  const dy = to[1] - from[1]
  const x = Math.hypot(dx, dz)
  if (x < 1e-3) return [0, speed, 0]
  const v2 = speed * speed
  const disc = v2 * v2 - g * (g * x * x + 2 * dy * v2)
  let ang: number
  if (disc < 0) ang = Math.PI / 4
  else {
    const root = Math.sqrt(disc)
    ang = Math.atan((v2 + (high ? root : -root)) / (g * x))
  }
  const h = Math.cos(ang) * speed
  return [(dx / x) * h, Math.sin(ang) * speed, (dz / x) * h]
}
