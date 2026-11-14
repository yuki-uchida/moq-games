/**
 * Melee and ranged antique behaviours (DESIGN §6): combo, slash (+ guard), lunge, slam, semi, auto, spread,
 * zoom, lock, lob, beam and charge. Each handler runs once per tick for the paw's active antique.
 */
import { ITEMS, type ItemDef } from '../../data/items'
import { hitTarget, hostilesNear, rayActors, refOf, targetCenter, type Target } from '../actors'
import { canPay, drain } from '../anima'
import { BLAST_KNOCK, DT, LOB_RADIUS, PUFFER_FALLOFF } from '../constants'
import { aimOf, muzzleOf, pivotOf } from '../player'
import { spawnShot } from '../projectiles'
import { emit, type HandSt, type Player, type Sim } from '../state'
import type { ActorRef } from '../types'
import { deg, forwardOf, jitterDir, r3v, vdist, vnorm, type Vec } from '../vec'
import {
  aimPoint,
  bullet,
  costOf,
  emptyClick,
  fireDir,
  fireEvent,
  isReady,
  meleeMul,
  pay,
  periodOf,
  rangedMul,
  spreadMul,
  used
} from './common'

export interface PawEvent {
  /** New presses arrived this tick. */
  pressed: boolean
  /** The button was released this tick (or pressed again after an unseen release). */
  released: boolean
  /** Pressed again while it looked held: the previous activation's release happened between samples. */
  reArm: boolean
}

const chest = (p: Player): Vec => [p.p[0], p.p[1] + p.h * 0.5, p.p[2]]
const selfRef = (p: Player): ActorRef => (p.foe ? p.foe.id : p.id)

function swingEvent(sim: Sim, p: Player, h: HandSt, def: ItemDef) {
  emit(sim, { type: 'swing', who: p.id, item: def.id, hand: h.hand, combo: h.combo })
}

/** Hits every hostile in a sector in front of the player once (walls block). */
function meleeSector(
  sim: Sim,
  p: Player,
  def: ItemDef,
  reach: number,
  arcDeg: number,
  dmg: number,
  extra: { knockUp?: number; knock?: number; skip?: Set<ActorRef>; center?: Vec; radial?: boolean } = {}
): number {
  const c = extra.center ?? chest(p)
  const targets = hostilesNear(
    sim,
    p.side,
    c,
    reach,
    extra.radial ? undefined : { yaw: p.yaw, arc: deg(arcDeg), from: p.p }
  )
  let n = 0
  for (const t of targets) {
    const ref = refOf(t)
    if (extra.skip?.has(ref) || ref === selfRef(p)) continue
    const tc = targetCenter(t)
    if (!sim.phys.clear(c, tc, p.side)) continue
    extra.skip?.add(ref)
    hitTarget(sim, t, {
      amount: dmg,
      kind: 'melee',
      side: p.side,
      by: selfRef(p),
      item: def.id,
      at: tc,
      from: p.p,
      knock: extra.knock,
      knockUp: extra.knockUp
    })
    n++
  }
  return n
}

// ---------------------------------------------------------------------------------------------------------------
// Melee

export function combo(sim: Sim, p: Player, h: HandSt, def: ItemDef) {
  const u = def.use
  if (u?.kind !== 'combo') return
  if (!isReady(sim, h) || !(h.queue > 0 || (h.held && h.holdT > 0))) {
    if (sim.time - h.comboAt > u.interval) h.act = 'idle'
    return
  }
  if (h.queue > 0) h.queue--
  if (!pay(sim, p, h, def)) return
  h.combo = sim.time - h.comboAt <= u.comboReset ? (h.combo + 1) % u.hits : 0
  h.comboAt = sim.time
  h.act = 'swing'
  swingEvent(sim, p, h, def)
  meleeSector(sim, p, def, u.reach, u.arc, u.damage * meleeMul(p))
  used(sim, p, h, def, periodOf(p, u.interval, def))
}

export function slash(sim: Sim, p: Player, h: HandSt, def: ItemDef, ev: PawEvent) {
  const u = def.use
  if (u?.kind !== 'slash') return
  if (h.mode === 'guard') {
    if (!h.held || ev.reArm) {
      h.mode = 'idle'
      h.act = 'idle'
      h.charge = 0
    } else {
      h.act = 'guard'
      h.charge = Math.min(1, h.charge + DT / 0.1)
      return
    }
  }
  if (u.guard && h.held && h.holdT >= u.guard.after && h.queue === 0) {
    h.mode = 'guard'
    h.modeT = sim.time
    h.act = 'guard'
    h.charge = 0
    return
  }
  if (!isReady(sim, h) || !(h.queue > 0 || (h.held && !u.guard && h.holdT > 0))) {
    if (sim.time - h.comboAt > u.interval * 0.6) h.act = 'idle'
    return
  }
  if (h.queue > 0) h.queue--
  if (!pay(sim, p, h, def)) return
  h.combo = 0
  h.comboAt = sim.time
  h.act = 'swing'
  swingEvent(sim, p, h, def)
  meleeSector(sim, p, def, u.reach, u.arc, u.damage * meleeMul(p))
  used(sim, p, h, def, periodOf(p, u.interval, def))
}

export function lunge(sim: Sim, p: Player, h: HandSt, def: ItemDef) {
  const u = def.use
  if (u?.kind !== 'lunge') return
  if (h.mode === 'lunge') {
    meleeSector(sim, p, def, u.width / 2 + p.r + 0.6, 360, u.damage * meleeMul(p), {
      skip: h.hitSet ?? undefined,
      radial: true,
      knock: 4
    })
    if (sim.time - h.modeT >= u.duration - 1e-9) {
      h.mode = 'idle'
      h.act = 'idle'
      h.hitSet = null
    }
    return
  }
  if (!isReady(sim, h) || h.queue <= 0) return
  h.queue--
  if (!pay(sim, p, h, def)) return
  h.mode = 'lunge'
  h.modeT = sim.time
  h.dir = forwardOf(p.yaw)
  h.hitSet = new Set()
  h.act = 'swing'
  h.combo = 0
  swingEvent(sim, p, h, def)
  used(sim, p, h, def, periodOf(p, u.duration, def))
}

/** Horizontal lunge velocity for movement (null when not lunging). */
export function lungeVelocity(p: Player): Vec | null {
  for (const h of p.hands) {
    if (h.mode !== 'lunge') continue
    const u = ITEMS[h.items[h.sel]]?.use
    if (u?.kind !== 'lunge') continue
    const sp = u.distance / u.duration
    return [h.dir[0] * sp, 0, h.dir[2] * sp]
  }
  return null
}

export function slam(sim: Sim, p: Player, h: HandSt, def: ItemDef) {
  const u = def.use
  if (u?.kind !== 'slam') return
  if (h.mode === 'slam') {
    const wind = u.windup * (h.charge > 0 ? 1 : 1)
    h.charge = Math.min(1, (sim.time - h.modeT) / wind)
    if (sim.time - h.modeT >= wind - 1e-9) {
      const f = forwardOf(p.yaw)
      const c: Vec = [p.p[0] + f[0] * u.reach, p.p[1] + 0.6, p.p[2] + f[2] * u.reach]
      emit(sim, {
        type: 'impact',
        at: r3v([c[0], p.p[1], c[2]]),
        normal: [0, 1, 0],
        surface: 'ground',
        item: def.id,
        by: p.id
      })
      meleeSector(sim, p, def, u.radius, 360, u.damage * meleeMul(p), { center: c, radial: true, knockUp: u.knockUp })
      h.mode = 'idle'
      h.act = 'idle'
      h.charge = 0
    }
    return
  }
  if (!isReady(sim, h) || h.queue <= 0) return
  h.queue--
  if (!pay(sim, p, h, def)) return
  h.mode = 'slam'
  h.modeT = sim.time
  h.act = 'swing'
  h.charge = 0
  h.combo = 0
  swingEvent(sim, p, h, def)
  used(sim, p, h, def, periodOf(p, u.windup, def))
}

// ---------------------------------------------------------------------------------------------------------------
// Ranged

export function semi(sim: Sim, p: Player, h: HandSt, def: ItemDef) {
  const u = def.use
  if (u?.kind !== 'semi') return
  if (!isReady(sim, h) || !(h.queue > 0 || (h.held && h.holdT > 0))) {
    if (!isReady(sim, h)) return
    h.act = 'idle'
    return
  }
  if (h.queue > 0) h.queue--
  if (!pay(sim, p, h, def)) return
  h.act = 'fire'
  bullet(sim, p, h, def, {
    speed: u.speed,
    dmg: u.damage * rangedMul(p),
    spread: u.spread * spreadMul(p),
    headMult: u.headMult,
    range: u.range
  })
  used(sim, p, h, def, periodOf(p, u.interval, def))
}

export function auto(sim: Sim, p: Player, h: HandSt, def: ItemDef) {
  const u = def.use
  if (u?.kind !== 'auto') return
  const want = h.held || h.queue > 0
  if (want && isReady(sim, h)) {
    if (h.queue > 0) h.queue--
    if (!canPay(p, costOf(p, def))) {
      emptyClick(sim, p, h)
      h.act = 'idle'
      return
    }
    if (!pay(sim, p, h, def)) return
    h.act = 'fire'
    bullet(sim, p, h, def, {
      speed: u.speed,
      dmg: u.damage * rangedMul(p),
      spread: (u.spread + h.bloom) * spreadMul(p),
      headMult: u.headMult,
      range: u.range
    })
    h.bloom = Math.min(u.spreadMax - u.spread, h.bloom + u.spreadGrow)
    used(sim, p, h, def, periodOf(p, 1 / u.rate, def))
  } else if (!want) {
    h.bloom = Math.max(0, h.bloom - (u.spreadMax - u.spread) * DT * 2)
    if (isReady(sim, h)) h.act = 'idle'
  }
}

export function spread(sim: Sim, p: Player, h: HandSt, def: ItemDef) {
  const u = def.use
  if (u?.kind !== 'spread') return
  if (!isReady(sim, h) || !(h.queue > 0 || (h.held && h.holdT > 0))) {
    if (isReady(sim, h)) h.act = 'idle'
    return
  }
  if (h.queue > 0) h.queue--
  if (!pay(sim, p, h, def)) return
  h.act = 'fire'
  const target = aimPoint(sim, p)
  const from = muzzleOf(p, h.hand)
  const center = fireDir(sim, p, from, target, 0)
  for (let i = 0; i < u.pellets; i++) {
    const d = jitterDir(center, deg(u.cone / 2) * spreadMul(p), sim.rng.range(-1, 1), sim.rng.range(-1, 1))
    spawnShot(sim, {
      kind: def.id,
      item: def.id,
      side: p.side,
      owner: selfRef(p),
      hand: h.hand,
      p: from,
      v: [d[0] * u.speed, d[1] * u.speed, d[2] * u.speed],
      dmg: u.damage * rangedMul(p),
      headMult: 1,
      range: u.range,
      life: (u.range * 1.6) / u.speed,
      falloff: PUFFER_FALLOFF
    })
    p.stats.shots++
  }
  fireEvent(sim, p, h, def.id, from, center)
  used(sim, p, h, def, periodOf(p, u.interval, def))
}

/** Starts a hold-type activation from a queued press. */
function startHold(sim: Sim, h: HandSt, mode: HandSt['mode'], ev: PawEvent) {
  h.queue--
  h.mode = mode
  h.modeT = sim.time
  h.armed = h.held && !(ev.pressed && h.tapRelease && h.queue === 0)
  h.charge = 0
}

function releaseCheck(h: HandSt, ev: PawEvent) {
  if (h.armed && (!h.held || ev.reArm)) h.armed = false
}

export function zoom(sim: Sim, p: Player, h: HandSt, def: ItemDef, ev: PawEvent) {
  const u = def.use
  if (u?.kind !== 'zoom') return
  if (h.mode === 'zoom') {
    releaseCheck(h, ev)
    if (h.armed) {
      h.charge = Math.min(1, (sim.time - h.modeT) / Math.max(0.01, u.steady))
      h.act = 'charge'
      return
    }
    if (!isReady(sim, h)) return
    const steadiness = h.charge
    h.mode = 'idle'
    h.charge = 0
    h.act = 'idle'
    if (!pay(sim, p, h, def)) return
    // Sway: up to 3° when unsteady; owls sway half as much; タカノメ reduces it like spread.
    const sway = (1 - steadiness) * 3 * (p.species.trait === 'glide' ? 0.5 : 1) * spreadMul(p)
    h.act = 'fire'
    bullet(sim, p, h, def, {
      speed: u.speed,
      dmg: u.damage * rangedMul(p),
      spread: sway,
      headMult: u.headMult,
      range: u.range
    })
    used(sim, p, h, def, periodOf(p, u.interval, def))
    return
  }
  if (h.queue > 0) {
    startHold(sim, h, 'zoom', ev)
    h.act = 'charge'
  } else if (isReady(sim, h)) h.act = 'idle'
}

/** Hostile actors inside the lock cone, sorted by angle from the aim. */
function lockCandidates(sim: Sim, p: Player, cone: number, range: number): { t: Target; ang: number }[] {
  const o = pivotOf(p)
  const d = aimOf(p)
  const out: { t: Target; ang: number }[] = []
  for (const t of hostilesNear(sim, p.side, o, range, undefined, false)) {
    const c = targetCenter(t)
    const v = vnorm([c[0] - o[0], c[1] - o[1], c[2] - o[2]])
    const ang = Math.acos(Math.max(-1, Math.min(1, v[0] * d[0] + v[1] * d[1] + v[2] * d[2])))
    if (ang > deg(cone) / 2) continue
    if (!sim.phys.clear(o, c, p.side)) continue
    out.push({ t, ang })
  }
  out.sort((a, b) => a.ang - b.ang || String(refOf(a.t)).localeCompare(String(refOf(b.t))))
  return out
}

const refAlive = (sim: Sim, ref: ActorRef) =>
  typeof ref === 'number'
    ? sim.foes.some((f) => f.id === ref && !f.dead)
    : sim.players.some((q) => q.id === ref && q.state === 'alive')

export function lock(sim: Sim, p: Player, h: HandSt, def: ItemDef, ev: PawEvent) {
  const u = def.use
  if (u?.kind !== 'lock') return
  if (h.mode === 'lock') {
    releaseCheck(h, ev)
    h.locks = h.locks.filter((l) => refAlive(sim, l.ref))
    if (h.armed) {
      h.act = 'charge'
      if (h.locks.length < u.maxLocks) {
        const cands = lockCandidates(sim, p, u.cone, u.range).filter((c) => !h.locks.some((l) => l.ref === refOf(c.t)))
        const best = cands[0] ? refOf(cands[0].t) : null
        if (best === null) {
          h.lockRef = null
          h.lockT = 0
        } else if (best === h.lockRef) {
          h.lockT += DT
          if (h.lockT >= u.lockTime - 1e-9) {
            h.locks.push({ ref: best, at: sim.time })
            h.lockRef = null
            h.lockT = 0
          }
        } else {
          h.lockRef = best
          h.lockT = 0
        }
      }
      h.charge = h.locks.length / u.maxLocks
      return
    }
    if (!isReady(sim, h)) return
    const locks = h.locks
    h.mode = 'idle'
    h.locks = []
    h.lockRef = null
    h.lockT = 0
    h.charge = 0
    h.act = 'idle'
    if (!pay(sim, p, h, def)) return
    h.act = 'fire'
    const from = muzzleOf(p, h.hand)
    const dmg = u.damage * rangedMul(p)
    const target = aimPoint(sim, p)
    const dir0 = fireDir(sim, p, from, target, 0)
    if (locks.length === 0) {
      spawnShot(sim, {
        kind: def.id,
        item: def.id,
        side: p.side,
        owner: selfRef(p),
        hand: h.hand,
        p: from,
        v: [dir0[0] * u.speed, dir0[1] * u.speed, dir0[2] * u.speed],
        dmg,
        range: u.range * 1.5,
        life: (u.range * 1.5) / u.speed,
        r: 0.15
      })
      p.stats.shots++
    }
    locks.forEach((l, i) => {
      // Darts fan out, then home in.
      const fan = jitterDir(dir0, deg(10), ((i % 2) * 2 - 1) * (1 + (i >> 1)), 0.6)
      spawnShot(sim, {
        kind: def.id,
        item: def.id,
        side: p.side,
        owner: selfRef(p),
        hand: h.hand,
        p: from,
        v: [fan[0] * u.speed, fan[1] * u.speed, fan[2] * u.speed],
        dmg,
        range: u.range * 2,
        life: (u.range * 2) / u.speed,
        r: 0.15,
        homing: { ref: l.ref, turn: u.turn }
      })
      p.stats.shots++
    })
    fireEvent(sim, p, h, def.id, from, dir0)
    used(sim, p, h, def, periodOf(p, u.interval, def))
    return
  }
  if (h.queue > 0) {
    startHold(sim, h, 'lock', ev)
    h.locks = []
    h.lockRef = null
    h.lockT = 0
    h.act = 'charge'
  } else if (isReady(sim, h)) h.act = 'idle'
}

export function lob(sim: Sim, p: Player, h: HandSt, def: ItemDef) {
  const u = def.use
  if (u?.kind !== 'lob') return
  if (!isReady(sim, h) || h.queue <= 0) {
    if (isReady(sim, h)) h.act = 'idle'
    return
  }
  h.queue--
  if (!pay(sim, p, h, def)) return
  h.act = 'fire'
  const from = muzzleOf(p, h.hand)
  const a = aimOf(p)
  const dir = vnorm([a[0], a[1] + 0.18, a[2]])
  spawnShot(sim, {
    kind: def.id,
    item: def.id,
    side: p.side,
    owner: selfRef(p),
    hand: h.hand,
    p: from,
    v: [dir[0] * u.speed, dir[1] * u.speed, dir[2] * u.speed],
    dmg: u.damage * rangedMul(p),
    gravity: u.gravity,
    bounce: u.bounce,
    fuse: u.fuse,
    life: u.fuse + 1,
    r: LOB_RADIUS,
    blast: { radius: u.radius, damage: u.damage * rangedMul(p) },
    explodeOnActor: true,
    knock: BLAST_KNOCK
  })
  p.stats.shots++
  fireEvent(sim, p, h, def.id, from, dir)
  used(sim, p, h, def, periodOf(p, u.interval, def))
}

const BEAM_EVERY = 6

export function beam(sim: Sim, p: Player, h: HandSt, def: ItemDef) {
  const u = def.use
  if (u?.kind !== 'beam') return
  if (h.queue > 0) {
    h.queue = 0
    h.until = sim.time + 0.15
  }
  const active = h.held || sim.time < h.until
  if (!active) {
    if (h.mode === 'beam') {
      h.mode = 'idle'
      h.beam = []
    }
    h.act = 'idle'
    return
  }
  if (!drain(sim, p, costOf(p, def, def.drain ?? 0), def.id)) {
    emptyClick(sim, p, h)
    h.mode = 'idle'
    h.act = 'idle'
    h.beam = []
    h.until = 0
    return
  }
  const o = pivotOf(p)
  const d = aimOf(p)
  if (h.mode !== 'beam') {
    h.mode = 'beam'
    h.beamTick = BEAM_EVERY - 1
    h.uses++
    fireEvent(sim, p, h, def.id, muzzleOf(p, h.hand), d)
  }
  h.act = 'beam'
  const leaf = ITEMS.leaf.use
  p.attackRevealUntil = sim.time + (leaf?.kind === 'cloak' ? leaf.revealAfterAttack : 1)
  h.beamTick++
  if (h.beamTick < BEAM_EVERY) return
  h.beamTick = 0
  const wall = sim.phys.raycast(o, d, u.range, 0, p.side)
  const hit = rayActors(sim, p.side, o, d, wall ? wall.t : u.range, 0.05, selfRef(p), true)
  h.beam = []
  if (!hit) return
  const dmg = u.dps * rangedMul(p) * DT * BEAM_EVERY
  const at: Vec = [o[0] + d[0] * hit.t, o[1] + d[1] * hit.t, o[2] + d[2] * hit.t]
  const first = refOf(hit.target)
  h.beam.push(first)
  p.stats.shots++
  hitTarget(sim, hit.target, {
    amount: dmg,
    kind: 'beam',
    side: p.side,
    by: selfRef(p),
    item: def.id,
    at,
    from: o,
    head: hit.head,
    headMult: u.headMult
  })
  // Chain to the nearest other hostile within chainRange.
  let best: Target | null = null
  let bd = u.chainRange
  for (const t of hostilesNear(sim, p.side, at, u.chainRange, undefined, false)) {
    if (refOf(t) === first) continue
    const dd = vdist(targetCenter(t), at)
    if (dd < bd) {
      bd = dd
      best = t
    }
  }
  if (best) {
    h.beam.push(refOf(best))
    hitTarget(sim, best, {
      amount: dmg * u.chainFactor,
      kind: 'beam',
      side: p.side,
      by: selfRef(p),
      item: def.id,
      at: targetCenter(best),
      from: at
    })
  }
}

export function charge(sim: Sim, p: Player, h: HandSt, def: ItemDef, ev: PawEvent) {
  const u = def.use
  if (u?.kind !== 'charge') return
  if (h.mode === 'charge') {
    releaseCheck(h, ev)
    h.charge = Math.min(1, (sim.time - h.modeT) / periodOf(p, u.charge))
    h.act = 'charge'
    if (h.charge < 1 - 1e-9 || h.armed) return
    h.mode = 'idle'
    h.charge = 0
    h.act = 'idle'
    if (!pay(sim, p, h, def)) return
    h.act = 'fire'
    const from = muzzleOf(p, h.hand)
    const dir = fireDir(sim, p, from, aimPoint(sim, p), 0)
    const dmg = u.damage * rangedMul(p)
    spawnShot(sim, {
      kind: def.id,
      item: def.id,
      side: p.side,
      owner: selfRef(p),
      hand: h.hand,
      p: from,
      v: [dir[0] * u.speed, dir[1] * u.speed + 1.5, dir[2] * u.speed],
      dmg,
      gravity: u.gravity,
      life: 5,
      r: 0.35,
      blast: { radius: u.radius, damage: dmg },
      knock: BLAST_KNOCK
    })
    p.stats.shots++
    fireEvent(sim, p, h, def.id, from, dir)
    used(sim, p, h, def, def.cooldown ?? 0)
    return
  }
  if (h.queue > 0 && isReady(sim, h)) {
    if (!canPay(p, costOf(p, def))) {
      h.queue--
      emptyClick(sim, p, h, true)
      return
    }
    startHold(sim, h, 'charge', ev)
    h.act = 'charge'
  } else if (isReady(sim, h)) h.act = 'idle'
}
