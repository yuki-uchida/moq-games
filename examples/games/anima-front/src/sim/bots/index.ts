/**
 * Bot brain entry (DESIGN §13). Bots only write their PlayerInput: movement along A* paths, aim with skill-scaled
 * reaction and error, antique choice and fire patterns, dodges, revives, retreats and gadgets. Used for PvE
 * allies, PvP players and クロヅメ avatars alike.
 */
import { ITEMS } from '../../data/items'
import { targetCenter, type Target } from '../actors'
import { MAX_PITCH } from '../constants'
import { navGrid } from '../grid'
import { modsOf, weaponRate } from '../loadout'
import { muzzleOf, pivotOf } from '../player'
import { FOE_SIDE, type Player, type Sim } from '../state'
import { BTN } from '../types'
import { clamp, hdist, vdist, wrapAngle, type Vec } from '../vec'
import {
  aimErrorDeg,
  bossOpen,
  dodgeChance,
  homeBase,
  inEnemyBase,
  lanePoints,
  makeBrain,
  perceive,
  reactionTime,
  refKey,
  resolve,
  squadCentroid,
  type Brain
} from './brain'
import { aimPoint, evadeBlasts } from './evade'
import { findPath } from './nav'
import { chooseWeapons, findKind, pawControl, planGadget, runGadget, weaponStats } from './weapons'

export { reactionTime, aimErrorDeg, makeBrain, type Brain } from './brain'

/** The bot's brain (created on demand). */
export function brainOf(sim: Sim, p: Player): Brain {
  if (!p.brain) p.brain = makeBrain(sim, p)
  return p.brain as Brain
}

const DEG = Math.PI / 180

/** Writes the bot's PlayerInput for this tick. */
export function botThink(sim: Sim, p: Player) {
  let b = p.brain as Brain | null
  if (!b) {
    b = makeBrain(sim, p)
    p.brain = b
  }
  const inp = p.input
  const skill = clamp(p.bot ?? 0.5, 0, 1)
  inp.held = 0
  inp.shoulder = 1
  if (p.state === 'away') {
    inp.mx = 0
    inp.mz = 0
    b.paws[0].holding = b.paws[1].holding = false
    return
  }
  if (p.state === 'down') {
    let best: Player | null = null
    let bd = Infinity
    for (const q of sim.players) {
      if (q === p || q.side !== p.side || q.state !== 'alive') continue
      const d = hdist(q.p, p.p)
      if (d < bd) {
        bd = d
        best = q
      }
    }
    moveToward(sim, p, b, best && bd > 1.5 ? best.p : null, true)
    return
  }

  // --- perception (staggered every ~0.1 s) -------------------------------------------------------------------
  let seen: ReturnType<typeof perceive> | null = null
  if (sim.time >= b.perceiveAt) {
    b.perceiveAt = sim.time + 0.1 + ((b.idx + sim.tick) % 3) / 60
    seen = perceive(sim, p)
    const cur = b.target ? seen.find((s) => refKey(s.ref) === refKey(b!.target!)) : undefined
    const best = seen[0]
    if (cur && (!best || best.score > cur.score - 4)) b.lastSeen = sim.time
    else if (best) {
      if (!b.target || refKey(best.ref) !== refKey(b.target)) {
        if (!b.target) b.contactAt = sim.time
        b.target = best.ref
        b.seenSince = sim.time
      }
      b.lastSeen = sim.time
    } else if (sim.time - b.lastSeen > 1.5) b.target = null
    b.seenCount = seen.length
    const tgt0 = resolve(sim, b.target)
    let cluster = 0
    if (tgt0) {
      const c = targetCenter(tgt0)
      cluster = seen.filter((s) => vdist(targetCenter(s.t), c) < 5).length
    }
    b.cluster = cluster
    b.close = seen.filter((s) => s.d < 8).length
    b.objThreat = p.side !== FOE_SIDE && objectiveThreatened(sim)
    // Line of fire from the shoulder (crosshair) and the main paw: no shots into cover.
    const tgtNow = resolve(sim, b.target)
    if (tgtNow) {
      const ap = aimPoint(tgtNow, pivotOf(p))
      const side = p.side
      const blocked = !sim.phys.clear(pivotOf(p), ap, side) || !sim.phys.clear(muzzleOf(p, 'R'), ap, side)
      if (blocked && b.clearShot) b.strafe = -b.strafe
      b.clearShot = !blocked
    } else b.clearShot = true
  }
  const ext = b
  let tgt: Target | null = resolve(sim, b.target)
  if (!tgt) b.target = null
  const engaged = !!tgt && sim.time - b.seenSince >= reactionTime(skill) && sim.time - b.lastSeen < 0.4
  const tc = tgt ? targetCenter(tgt) : null
  const dist = tc ? Math.max(0, vdist(tc, pivotOf(p)) - (tgt!.k === 'f' ? tgt!.f.r : 0)) : 60

  // --- anima / retreat ---------------------------------------------------------------------------------------
  const frac = p.anima / p.maxAnima
  if (!p.foe && !p.infinite) {
    // Back to the fight sooner when foes are on the objective.
    // Small pools leave earlier: below a quarter, or below ~28 anima (one burst from breaking). PvP fights are
    // decided closer to the edge (the base heals fast, a KO only costs a respawn).
    const pvp = sim.cfg.mode === 'pvp'
    if (frac < (pvp ? Math.max(0.18, 20 / p.maxAnima) : Math.max(0.25, 28 / p.maxAnima))) b.retreat = true
    else if (frac > (b.objThreat ? 0.4 : 0.55)) b.retreat = false
  } else b.retreat = false
  if (sim.tick % 15 === 0) {
    b.taken.push(sim.time, p.stats.taken)
    while (b.taken.length > 2 && b.taken[0] < sim.time - 2) b.taken.splice(0, 2)
  }

  // --- weapons ------------------------------------------------------------------------------------------------
  const choice = chooseWeapons(p, dist, ext.seenCount ?? 0, ext.cluster ?? 0)
  for (const hi of [0, 1] as const) if (choice.picks[hi] !== null) b.sel[hi] = choice.picks[hi]!

  // --- goal ---------------------------------------------------------------------------------------------------
  const focus = p.side === FOE_SIDE ? null : sim.mode.focus(sim, p.side)
  let goal: Vec | null = null
  let reviving = false
  let strafe = false
  const down = p.side === FOE_SIDE ? null : nearestDownAlly(sim, p)
  if (down && !b.retreat) {
    goal = down.p
    if (hdist(down.p, p.p) <= 2.0) {
      reviving = true
      goal = null
      inp.held |= BTN.INTERACT
    }
  } else if (b.retreat) {
    let shard: Vec | null = null
    let sd = 25
    for (const s of sim.shards) {
      const d = hdist(s.p, p.p)
      if (d < sd) {
        sd = d
        shard = s.p
      }
    }
    // Guarding an objective (灯台 / 荷車): fall back behind it, away from the threat, instead of the far base.
    const guard = focus && sim.props.some((r) => !r.gone && (r.kind === 'lighthouse' || r.kind === 'cart'))
    goal = shard ?? (guard && focus ? fallBack(focus, tc ?? p.p, p) : homeBase(sim, p)) ?? focus ?? null
    if (goal && hdist(goal, p.p) < 2.5) goal = null
  } else if (tgt && tc && engaged) {
    const pref = choice.pref
    if (dist > pref + 2) goal = tgt.k === 'p' ? tgt.p.p : tgt.k === 'f' ? tgt.f.p : tgt.r.p
    else if (dist < pref - 3 && pref > 4) {
      const dx = p.p[0] - tc[0]
      const dz = p.p[2] - tc[2]
      const l = Math.hypot(dx, dz) || 1
      goal = [p.p[0] + (dx / l) * 4, p.p[1], p.p[2] + (dz / l) * 4]
    } else strafe = skill > 0.2
    if (goal && inEnemyBase(sim, p, goal, 1)) goal = null
  } else if (!tgt) {
    goal = b.order ?? roamGoal(sim, p, b, focus)
  }
  // PvE leash around the objective.
  if (focus && !reviving && sim.cfg.mode === 'pve') {
    const fd = hdist(focus, p.p)
    if (fd > (engaged ? 32 : 25)) {
      goal = focus
      strafe = false
    }
  }

  // --- aim ----------------------------------------------------------------------------------------------------
  const piv = pivotOf(p)
  let wantYaw = p.yaw
  let wantPitch = 0
  if (tgt && tc && !reviving) {
    const main = choice.item
    const speed = main ? weaponStats(ITEMS[main]).speed : Infinity
    const tv = tgt.k === 'p' ? tgt.p.v : tgt.k === 'f' ? tgt.f.v : [0, 0, 0]
    const ap = aimPoint(tgt, piv)
    const lead = Number.isFinite(speed) ? (vdist(ap, piv) / speed) * (0.3 + 0.6 * skill) : 0
    const aimAt: Vec = [ap[0] + tv[0] * lead, ap[1] + tv[1] * lead * 0.5, ap[2] + tv[2] * lead]
    if (main && ITEMS[main].use?.kind === 'lob') aimAt[1] += Math.min(6, vdist(ap, piv) * 0.08)
    wantYaw = Math.atan2(aimAt[0] - piv[0], aimAt[2] - piv[2])
    wantPitch = Math.atan2(aimAt[1] - piv[1], Math.hypot(aimAt[0] - piv[0], aimAt[2] - piv[2]))
    // Slowly wandering aim error.
    if (sim.time >= b.errAt) {
      const e = aimErrorDeg(skill) * DEG
      b.errTo = [b.rng.gauss() * e * 0.7, b.rng.gauss() * e * 0.5]
      b.errAt = sim.time + 0.5 + b.rng.next() * 0.5
    }
    b.errYaw += (b.errTo[0] - b.errYaw) * 0.08
    b.errPitch += (b.errTo[1] - b.errPitch) * 0.08
    // A steadied scope (フクロウアイ zoomed in) settles most of the wander.
    const steady = p.hands.some((h) => h.mode === 'zoom' && h.charge > 0.5) ? 0.5 : 1
    wantYaw += b.errYaw * steady
    wantPitch += b.errPitch * steady
  } else {
    const d = p.v[0] * p.v[0] + p.v[2] * p.v[2]
    if (d > 1) wantYaw = Math.atan2(p.v[0], p.v[2])
    if (goal && hdist(goal, p.p) > 1) wantYaw = Math.atan2(goal[0] - p.p[0], goal[2] - p.p[2])
  }
  const turn = (6 + 12 * skill) / 60
  const dy = wrapAngle(wantYaw - p.yaw)
  const yaw = wrapAngle(p.yaw + clamp(dy, -turn, turn))
  let pitch = clamp(p.pitch + clamp(wantPitch - p.pitch, -turn, turn), -MAX_PITCH, MAX_PITCH)
  // On target: the turn has caught up within about a body width (tighter at range).
  const tol = clamp(0.9 / Math.max(1, dist), 0.02, 0.1)
  const aimOk = Math.abs(wrapAngle(wantYaw - yaw)) < tol && Math.abs(wantPitch - pitch) < tol * 1.2
  inp.yaw = yaw
  if (b.gadget?.pitch !== undefined && !b.gadget.pressed) pitch = b.gadget.pitch
  inp.pitch = pitch

  // --- movement -----------------------------------------------------------------------------------------------
  let dir = moveToward(sim, p, b, goal, false)
  if (strafe && tc) {
    if (sim.time >= b.strafeAt) {
      b.strafe = b.rng.chance(0.5) ? 1 : -1
      b.strafeAt = sim.time + 0.8 + b.rng.next() * 1.8
    }
    const fx = tc[0] - p.p[0]
    const fz = tc[2] - p.p[2]
    const l = Math.hypot(fx, fz) || 1
    dir = [(-fz / l) * b.strafe * 0.8, (fx / l) * b.strafe * 0.8]
  }
  // Step out of predicted foe blast zones (acid, mortars, missiles, acid rain).
  const ev = p.side !== FOE_SIDE && !reviving ? evadeBlasts(sim, p, b, skill) : null
  if (ev) {
    dir = ev.dir
    if (ev.dash && sim.time >= p.dashReadyAt) inp.presses.dash++
  }
  setMove(p, dir)
  // Retreating under fire: dash away toward safety.
  if (b.retreat && goal && sim.time - p.lastHurt < 0.6 && sim.time >= p.dashReadyAt && b.rng.chance(skill * 0.1))
    inp.presses.dash++

  // --- dodge wind-ups -----------------------------------------------------------------------------------------
  if (p.side !== FOE_SIDE && sim.time >= p.dashReadyAt) {
    for (const f of sim.foeHash.query(p.p[0], p.p[2], 20)) {
      if (f.state !== 'windup' || f.dead) continue
      const aimed = f.aim ? hdist(f.aim, p.p) < 3 : f.target?.k === 'p' && f.target.id === p.id && hdist(f.p, p.p) < 5
      if (!aimed) continue
      const key = `${f.id}@${Math.round((sim.time - f.st) * 10)}`
      if (b.dodged.has(key)) continue
      if (b.dodged.size > 64) b.dodged.clear()
      b.dodged.add(key)
      if (!b.rng.chance(dodgeChance(skill))) continue
      const fx = p.p[0] - f.p[0]
      const fz = p.p[2] - f.p[2]
      const l = Math.hypot(fx, fz) || 1
      const s = b.rng.chance(0.5) ? 1 : -1
      setMove(p, [(-fz / l) * s * 0.7 + (fx / l) * 0.7, (fx / l) * s * 0.7 + (fz / l) * 0.7])
      inp.presses.dash++
      break
    }
  }

  // --- gadgets and paws ---------------------------------------------------------------------------------------
  let allies = 0
  let sum = 0
  for (const q of sim.players) {
    if (q.side !== p.side || q.state !== 'alive' || hdist(q.p, p.p) > 4) continue
    allies++
    sum += q.anima / q.maxAnima
  }
  const takenNow = b.taken.length >= 2 ? p.stats.taken - b.taken[1] : 0
  planGadget(sim, p, b, {
    engaged,
    retreat: b.retreat,
    close: ext.close ?? 0,
    taken: takenNow,
    allies,
    alliesMean: allies ? sum / allies : 1,
    newContact: engaged && sim.time - b.contactAt < 1,
    goalHigh: !!goal && goal[1] > 3,
    // Hook in on crowds and weakened rivals only (a full-health rival waits for the jump).
    closeIn:
      engaged &&
      !b.retreat &&
      choice.pref <= 8 &&
      dist >= 10 &&
      dist <= 30 &&
      b.clearShot &&
      (tgt?.k !== 'p' || tgt.p.anima / tgt.p.maxAnima < 0.6)
  })
  const busy = runGadget(sim, p, b)
  // Fire discipline: low on anima, let a foe that is busy elsewhere go (no spending lets regeneration start).
  // Skilled bots hold their fire from higher reserves.
  let hold = false
  if (tgt?.k === 'f' && !p.foe && !p.infinite && frac < 0.2 + 0.25 * skill && dist > 10) {
    const ft = tgt.f.target
    const onMe = ft?.k === 'p' && ft.id === p.id
    const onObjective = ft?.k === 'r' && b.objThreat
    hold = !onMe && !onObjective && !tgt.f.def.boss
  }
  const fire = engaged && b.clearShot && !reviving && !hold && !(b.retreat && dist > 8)
  const hurt = sim.time - p.lastHurt < 1.2
  const shield = findKind(p, ['shield'])
  for (const hi of [0, 1] as const) {
    if (busy === hi) {
      pawControl(sim, p, b, hi, false, false)
      continue
    }
    const sh = shield && shield.hand === hi && hurt && (choice.main !== hi || choice.picks[hi] === null)
    if (sh) {
      b.sel[hi] = shield!.idx
      pawControl(sim, p, b, hi, true, true)
      continue
    }
    const pick = choice.picks[hi]
    // The off paw joins in when it is nearly as good and either cheap or worth it (a crowd, a boss's weak spot,
    // a weakened rival); two expensive antiques at once empty the pool in seconds.
    const offOk = (() => {
      if (pick === null || choice.main === hi) return pick !== null
      if (choice.scores[hi] <= choice.scores[choice.main === 0 ? 0 : 1] - 6) return false
      const id = (hi === 0 ? p.build.R : p.build.L)[pick]
      const cheap = !!p.foe || p.infinite || weaponRate(ITEMS[id], modsOf(p)) < 1.6
      const worth =
        (ext.cluster ?? 0) >= 3 ||
        (tgt?.k === 'f' && tgt.f.def.boss && bossOpen(tgt.f)) ||
        (tgt?.k === 'p' && tgt.p.anima / tgt.p.maxAnima < 0.35)
      return cheap || (worth && frac > 0.4)
    })()
    const usable = offOk
    pawControl(sim, p, b, hi, fire && usable, aimOk, ext.seenCount ?? 1, dist)
  }
  inp.selR = b.sel[0]
  inp.selL = b.sel[1]
  if (reviving) {
    inp.mx = 0
    inp.mz = 0
  }
}

/** A point 10 m from the objective on the side away from `threat` (toward the player when it is on top). */
function fallBack(focus: Vec, threat: Vec, p: Player): Vec {
  let dx = focus[0] - threat[0]
  let dz = focus[2] - threat[2]
  let l = Math.hypot(dx, dz)
  if (l < 1) {
    dx = p.p[0] - focus[0]
    dz = p.p[2] - focus[2]
    l = Math.hypot(dx, dz) || 1
  }
  return [focus[0] + (dx / l) * 10, focus[1], focus[2] + (dz / l) * 10]
}

/** True when a foe next to our objective (灯台 / 荷車) is attacking it. */
function objectiveThreatened(sim: Sim): boolean {
  for (const r of sim.props) {
    if (r.gone || (r.kind !== 'lighthouse' && r.kind !== 'cart')) continue
    for (const f of sim.foeHash.query(r.p[0], r.p[2], 8)) {
      if (!f.dead && f.target && f.target.k === 'r' && f.target.id === r.id) return true
    }
  }
  return false
}

function nearestDownAlly(sim: Sim, p: Player): Player | null {
  let best: Player | null = null
  let bd = 30
  for (const q of sim.players) {
    if (q === p || q.side !== p.side || q.state !== 'down') continue
    const d = hdist(q.p, p.p)
    if (d >= bd) continue
    if (q.revivedBy && q.revivedBy !== p.id) continue
    let threat = false
    for (const f of sim.foeHash.query(q.p[0], q.p[2], 5)) {
      if (!f.dead && hdist(f.p, q.p) < 5) threat = true
    }
    for (const e of sim.players) if (e.side !== p.side && e.state === 'alive' && hdist(e.p, q.p) < 5) threat = true
    if (threat) continue
    bd = d
    best = q
  }
  return best
}

function roamGoal(sim: Sim, p: Player, b: Brain, focus: Vec | null): Vec | null {
  if (p.foe) {
    const g = sim.mode.goal(sim, p.foe)
    const t = resolve(sim, g)
    if (t) return targetCenter(t)
    let best: Vec | null = null
    let bd = Infinity
    for (const q of sim.players) {
      if (q.state !== 'alive') continue
      const d = hdist(q.p, p.p)
      if (d < bd) {
        bd = d
        best = q.p
      }
    }
    return best
  }
  if (sim.time >= b.wanderAt || !b.wander) {
    if (sim.cfg.mode === 'pvp') {
      const pts = lanePoints(sim, p)
      b.wander = pts[b.rng.int(pts.length)]
      b.wanderAt = sim.time + 8 + b.rng.next() * 8
    } else {
      const c = focus ?? squadCentroid(sim, p) ?? p.spawnP
      const a = b.rng.next() * Math.PI * 2
      const r = 2 + b.rng.next() * 7
      b.wander = [c[0] + Math.sin(a) * r, c[1], c[2] + Math.cos(a) * r]
      b.wanderAt = sim.time + 5 + b.rng.next() * 5
    }
  }
  return b.wander
}

/** World x/z unit direction along the path to `goal` (or [0,0]); handles replans, pads and stuck jumps. */
function moveToward(sim: Sim, p: Player, b: Brain, goal: Vec | null, crawl: boolean): [number, number] {
  if (!goal) {
    if (crawl) setMove(p, [0, 0])
    b.stuckAt = sim.time
    b.stuckP = [p.p[0], p.p[1], p.p[2]]
    return [0, 0]
  }
  let target = goal
  // High goals: use a pad near the goal when we are on the ground far below.
  if (goal[1] > 2.5 && goal[1] - p.p[1] > 2 && p.grounded) {
    let pad: Vec | null = null
    let pd = 35
    for (const r of sim.props) {
      if (r.gone || (r.kind !== 'pad' && !(r.kind === 'frog' && r.side === p.side))) continue
      const d = hdist(r.p, goal)
      if (d < pd) {
        pd = d
        pad = r.p
      }
    }
    if (pad) target = pad
  }
  if (!p.grounded && p.launched) {
    target = goal
  }
  if (hdist(target, p.p) < 0.6) return [0, 0]
  const g = navGrid(sim)
  const moved = !b.pathGoal || hdist(b.pathGoal, target) > 3
  if (!b.path || ((sim.time >= b.pathAt || moved) && (sim.tick + b.idx) % 6 === 0)) {
    b.path = findPath(g, p.p[0], p.p[2], target[0], target[2]) ?? [[target[0], target[2]]]
    b.pathGoal = [target[0], target[1], target[2]]
    b.pathAt = sim.time + 1 + b.rng.next() * 0.3
  }
  const path = b.path
  while (path.length > 1 && Math.hypot(path[0][0] - p.p[0], path[0][1] - p.p[2]) < 1.2) path.shift()
  const wp = path.length ? path[0] : [target[0], target[2]]
  const dx = wp[0] - p.p[0]
  const dz = wp[1] - p.p[2]
  const l = Math.hypot(dx, dz)
  const dir: [number, number] = l > 1e-3 ? [dx / l, dz / l] : [0, 0]
  // Stuck: jump, then replan.
  if (sim.time - b.stuckAt > 0.7) {
    if (hdist(b.stuckP, p.p) < 0.35 && l > 0.8) {
      p.input.presses.jump++
      b.path = null
    }
    b.stuckAt = sim.time
    b.stuckP = [p.p[0], p.p[1], p.p[2]]
  }
  if (crawl) setMove(p, dir)
  return dir
}

/** Converts a world x/z direction into mx/mz relative to the input's yaw. */
function setMove(p: Player, d: [number, number]) {
  const yaw = p.input.yaw
  const s = Math.sin(yaw)
  const c = Math.cos(yaw)
  let mz = d[0] * s + d[1] * c
  let mx = -d[0] * c + d[1] * s
  const l = Math.hypot(mx, mz)
  if (l > 1) {
    mx /= l
    mz /= l
  }
  p.input.mx = mx
  p.input.mz = mz
}
