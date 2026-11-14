/**
 * Active armour and gadget behaviours (DESIGN §6): shield, frog pad, gecko hook, leaf cloak (toggle), bat sonar,
 * octopus ink, pigeon decoy, hermit wall and honey jar.
 */
import { ITEMS, type ItemDef } from '../../data/items'
import { drain } from '../anima'
import { DT } from '../constants'
import { aimOf, muzzleOf, pivotOf } from '../player'
import { spawnShot } from '../projectiles'
import { addProp, deployEvent, ownedProps, snapYaw, syncWalls } from '../props'
import { emit, type HandSt, type Player, type Sim } from '../state'
import { forwardOf, r3v, vdist, vnorm, type Vec } from '../vec'
import { costOf, emptyClick, isReady, pay, periodOf, used } from './common'

/** Point on the floor near the aim point within `range` (drops from walls/air to the ground below). */
function floorPoint(sim: Sim, p: Player, range: number): Vec {
  const o = pivotOf(p)
  const d = aimOf(p)
  const hit = sim.phys.raycast(o, d, range, 0, p.side)
  let pt: Vec
  if (hit) {
    pt = hit.point
    if (hit.normal[1] < 0.7) pt = [pt[0] + hit.normal[0] * 0.6, pt[1], pt[2] + hit.normal[2] * 0.6]
  } else pt = [o[0] + d[0] * range, o[1] + d[1] * range, o[2] + d[2] * range]
  const g = sim.phys.groundHeight(pt[0], pt[2], 0.3, pt[1] + 0.05, p.side)
  return [pt[0], g, pt[2]]
}

export function shield(sim: Sim, p: Player, h: HandSt, def: ItemDef) {
  if (h.queue > 0) {
    h.queue = 0
    h.until = sim.time + 0.2
  }
  const active = h.held || sim.time < h.until
  if (!active) {
    if (h.mode === 'shield') {
      h.mode = 'idle'
      h.charge = 0
    }
    h.act = 'idle'
    return
  }
  if (!drain(sim, p, costOf(p, def, def.drain ?? 0), def.id)) {
    emptyClick(sim, p, h)
    h.mode = 'idle'
    h.act = 'idle'
    h.charge = 0
    h.until = 0
    return
  }
  if (h.mode !== 'shield') {
    h.mode = 'shield'
    h.modeT = sim.time
    h.uses++
  }
  h.act = 'guard'
  h.charge = Math.min(1, (sim.time - h.modeT) / 0.15)
}

/** Leaf cloak upkeep (runs every tick for every player, whichever antique is selected). */
export function cloakTick(sim: Sim, p: Player) {
  if (p.cloakOn) {
    const def = ITEMS.leaf
    if (p.state !== 'alive' || !drain(sim, p, costOf(p, def, def.drain ?? 0), 'leaf')) {
      p.cloakOn = false
      emit(sim, { type: 'cloak', who: p.id, on: false })
    }
  }
  const target = p.cloakOn ? (sim.time < p.attackRevealUntil ? 0.35 : 1) : 0
  const k = DT * 4
  p.cloak = p.cloak < target ? Math.min(target, p.cloak + k) : Math.max(target, p.cloak - k)
}

/** Press-type gadgets: one use per press when ready. */
export function gadget(sim: Sim, p: Player, h: HandSt, def: ItemDef) {
  const u = def.use
  if (!u) return
  if (!isReady(sim, h) || h.queue <= 0) {
    if (isReady(sim, h)) h.act = 'idle'
    return
  }
  h.queue--
  const owner = p.id
  switch (u.kind) {
    case 'pad': {
      if (!pay(sim, p, h, def)) return
      const old = ownedProps(sim, owner, 'frog')
      while (old.length >= u.max) old.shift()!.gone = true
      const at = floorPoint(sim, p, u.range)
      const r = addProp(sim, 'frog', at, p.yaw, p.side, {
        owner,
        until: sim.time + u.life,
        launchUp: u.launchUp,
        launchForward: u.launchForward,
        r: 0.9
      })
      deployEvent(sim, owner, def.id, r)
      break
    }
    case 'hook': {
      const o = pivotOf(p)
      const d = aimOf(p)
      const hit = sim.phys.raycast(o, d, u.range, 0, p.side)
      if (!pay(sim, p, h, def)) return
      if (hit) {
        const to: Vec = [
          hit.point[0] + hit.normal[0] * 0.4,
          hit.point[1] + hit.normal[1] * 0.4,
          hit.point[2] + hit.normal[2] * 0.4
        ]
        p.hook = { to, t: 0 }
        p.dashT = 0
        emit(sim, { type: 'hook', who: owner, to: r3v(to) })
      } else {
        const to: Vec = [o[0] + d[0] * u.range, o[1] + d[1] * u.range, o[2] + d[2] * u.range]
        emit(sim, { type: 'hook', who: owner, to: r3v(to), done: true })
      }
      break
    }
    case 'cloak': {
      if (p.cloakOn) {
        p.cloakOn = false
        emit(sim, { type: 'cloak', who: owner, on: false })
      } else {
        if (!pay(sim, p, h, def, costOf(p, def, def.drain ?? 0) * DT)) return
        p.cloakOn = true
        emit(sim, { type: 'cloak', who: owner, on: true })
      }
      break
    }
    case 'pulse': {
      if (!pay(sim, p, h, def)) return
      const c = pivotOf(p)
      for (const f of sim.foes) {
        if (!f.dead && vdist(f.p, c) <= u.radius) f.revealedUntil = sim.time + u.duration
      }
      for (const q of sim.players) {
        if (q.side !== p.side && q.state === 'alive' && vdist(q.p, c) <= u.radius) {
          // Revealed to the sonar user's side only (online, the other sides never learn of it).
          const until = sim.time + u.duration
          const by = (q.revealedBy ??= [])
          by[p.side] = Math.max(by[p.side] ?? 0, until)
          q.revealedUntil = Math.max(q.revealedUntil, until)
        }
      }
      emit(sim, { type: 'reveal', who: owner, at: r3v(p.p), radius: u.radius })
      break
    }
    case 'throw': {
      if (!pay(sim, p, h, def)) return
      const from = muzzleOf(p, h.hand)
      const a = aimOf(p)
      const dir = vnorm([a[0], a[1] + 0.25, a[2]])
      spawnShot(sim, {
        kind: def.id,
        item: def.id,
        side: p.side,
        owner,
        hand: h.hand,
        p: from,
        v: [dir[0] * u.speed, dir[1] * u.speed, dir[2] * u.speed],
        dmg: 0,
        gravity: u.gravity,
        life: 4,
        r: 0.2
      })
      emit(sim, { type: 'fire', who: owner, item: def.id, hand: h.hand, from: r3v(from), dir: r3v(dir) })
      break
    }
    case 'decoy': {
      if (!pay(sim, p, h, def)) return
      const f = forwardOf(p.yaw)
      const r = addProp(sim, 'decoy', p.p, p.yaw, p.side, {
        owner,
        until: sim.time + u.duration,
        species: p.species.id,
        dir: f,
        data: { speed: u.speed }
      })
      deployEvent(sim, owner, def.id, r)
      break
    }
    case 'wall': {
      if (!pay(sim, p, h, def)) return
      const walls = ownedProps(sim, owner, 'hermit')
      while (walls.length >= u.max) walls.shift()!.gone = true
      const at = floorPoint(sim, p, u.range)
      const r = addProp(sim, 'hermit', at, snapYaw(p.yaw), p.side, {
        owner,
        hp: u.hp,
        until: sim.time + u.life,
        r: u.width / 2
      })
      syncWalls(sim)
      deployEvent(sim, owner, def.id, r)
      break
    }
    case 'jar': {
      if (!pay(sim, p, h, def)) return
      const g = sim.phys.groundHeight(p.p[0], p.p[2], 0.3, p.p[1] + 0.2, p.side)
      const r = addProp(sim, 'honey', [p.p[0], g, p.p[2]], p.yaw, p.side, {
        owner,
        r: u.radius,
        until: sim.time + u.duration,
        data: { heal: u.heal }
      })
      deployEvent(sim, owner, def.id, r)
      break
    }
    default:
      return
  }
  h.act = 'fire'
  used(sim, p, h, def, periodOf(p, 0.3, undefined) + (def.cooldown ?? 0))
}
