/** 蝕機 behaviours (DESIGN §11): ミツメ, アシナガ, コロガシ, タテガミ. */
import { blast, killFoe } from '../combat'
import { DT } from '../constants'
import { ballistic, spawnShot } from '../projectiles'
import { FOE_SIDE, type Foe, type Sim } from '../state'
import { jitterDir, vnorm, type Vec } from '../vec'
import {
  attackDef,
  chase,
  edgeDist,
  faceTo,
  flyTo,
  hDist,
  isReady,
  kite,
  launchAttack,
  lobGravity,
  pickTarget,
  recover,
  recovering,
  resolve,
  setState,
  startWindup,
  stop,
  windupDone
} from './common'

function toMove(f: Foe) {
  if (f.state !== 'move') setState(f, 'move')
}

export function mitsume(sim: Sim, f: Foe) {
  if (f.mem.alt === undefined) {
    const hv = f.def.hover ?? [3, 6]
    f.mem.alt = sim.rng.range(hv[0], hv[1])
    f.mem.side = sim.rng.chance(0.5) ? 1 : -1
    f.mem.orbit = sim.rng.range(14, 22)
  }
  const laser = attackDef(f, 'laser')!
  const t = pickTarget(sim, f)
  if (f.state === 'attack') {
    flyTo(sim, f, f.p, 0)
    const shots = laser.count ?? 3
    const fired = f.mem.fired ?? 0
    if (fired < shots && f.st >= fired * 0.12) {
      const cur = resolve(sim, f.target)
      const aim = cur ? cur.center : (f.aim ?? f.p)
      const from: Vec = [f.p[0], f.p[1] + f.h * 0.5, f.p[2]]
      const d = jitterDir(
        vnorm([aim[0] - from[0], aim[1] - from[1], aim[2] - from[2]]),
        0.03,
        sim.rng.gauss() * 0.5,
        sim.rng.gauss() * 0.5
      )
      const sp = laser.speed ?? 70
      spawnShot(sim, {
        kind: 'laser',
        foeAttack: 'laser',
        side: FOE_SIDE,
        owner: f.id,
        p: from,
        v: [d[0] * sp, d[1] * sp, d[2] * sp],
        dmg: laser.damage * f.dmgMul,
        range: laser.range * 1.6,
        life: (laser.range * 1.6) / sp,
        r: 0.12
      })
      f.mem.fired = fired + 1
    }
    if ((f.mem.fired ?? 0) >= shots) recover(f)
    return
  }
  if (f.state === 'recover') {
    flyTo(sim, f, f.p, 0)
    recovering(f, 0.4)
    return
  }
  if (f.state === 'windup') {
    flyTo(sim, f, f.p, 0)
    if (f.aim) faceTo(f, f.aim, 10)
    if (!windupDone(f)) return
    launchAttack(sim, f)
    f.mem.fired = 0
    return
  }
  if (!t) {
    flyTo(sim, f, [f.p[0], f.mem.alt, f.p[2]], f.def.speed * 0.4)
    return
  }
  const d = hDist(f.p, t.pos)
  if (d <= laser.range && isReady(sim, f, 'laser') && sim.phys.clear(f.p, t.center, FOE_SIDE)) {
    startWindup(sim, f, laser, [t.center[0], t.center[1], t.center[2]])
    return
  }
  toMove(f)
  // Strafe around the target on an orbit.
  let ang = Math.atan2(f.p[0] - t.pos[0], f.p[2] - t.pos[2])
  ang += (f.mem.side * f.def.speed * 0.6 * DT) / Math.max(4, f.mem.orbit)
  if (f.st > 3) {
    f.mem.side = -f.mem.side
    f.st = 0
  }
  const goal: Vec = [
    t.pos[0] + Math.sin(ang) * f.mem.orbit,
    t.pos[1] + f.mem.alt,
    t.pos[2] + Math.cos(ang) * f.mem.orbit
  ]
  flyTo(sim, f, goal, f.def.speed)
  faceTo(f, t.pos, 8)
}

export function ashinaga(sim: Sim, f: Foe) {
  const mortar = attackDef(f, 'mortar')!
  const t = pickTarget(sim, f)
  if (recovering(f, 0.6)) {
    stop(sim, f)
    return
  }
  if (f.state === 'windup') {
    stop(sim, f)
    if (f.aim) faceTo(f, f.aim, 3)
    if (!windupDone(f)) return
    launchAttack(sim, f)
    const from: Vec = [f.p[0], f.p[1] + f.h, f.p[2]]
    const aim = f.aim ?? f.p
    const sp = mortar.speed ?? 22
    const g = lobGravity(sp, hDist(from, aim), 16)
    const dmg = mortar.damage * f.dmgMul
    spawnShot(sim, {
      kind: 'plasma',
      foeAttack: 'mortar',
      side: FOE_SIDE,
      owner: f.id,
      p: from,
      v: ballistic(from, aim, sp, g, true),
      dmg,
      gravity: g,
      life: 8,
      r: 0.35,
      blast: { radius: mortar.radius ?? 3, damage: dmg },
      knock: 4
    })
    recover(f)
    return
  }
  if (!t) {
    stop(sim, f)
    return
  }
  const d = hDist(f.p, t.pos)
  if (d <= mortar.range && isReady(sim, f, 'mortar')) {
    startWindup(sim, f, mortar, [t.pos[0], t.pos[1], t.pos[2]])
    return
  }
  toMove(f)
  if (d > 35) chase(sim, f, t, f.def.speed)
  else if (d < 20) kite(sim, f, t.pos, f.def.speed, 0.3)
  else stop(sim, f)
  faceTo(f, t.pos, 2)
}

/** Explodes a コロガシ at `share` of its damage (foe-side blast) and chains to nearby コロガシ. */
export function korogashiBurst(sim: Sim, f: Foe, share: number) {
  if (f.mem.exploded === 1) return
  f.mem.exploded = 1
  const atk = attackDef(f, 'explode')!
  const r = atk.radius ?? 3
  const at: Vec = [f.p[0], f.p[1] + 0.5, f.p[2]]
  blast(sim, at, r, atk.damage * f.dmgMul * share, FOE_SIDE, f.id, 'explode', { knock: 6 })
  if (share < 1) {
    // Chain: a destroyed コロガシ sets off its neighbours.
    for (const g of sim.foes) {
      if (g === f || g.dead || g.kind !== 'korogashi' || g.state === 'spawn') continue
      if (Math.hypot(g.p[0] - f.p[0], g.p[2] - f.p[2]) <= r + g.r) killFoe(sim, g, undefined, false, 'explode')
    }
  }
}

export function korogashi(sim: Sim, f: Foe) {
  const ex = attackDef(f, 'explode')!
  const t = pickTarget(sim, f)
  if (f.state === 'windup') {
    stop(sim, f)
    if (!windupDone(f)) return
    launchAttack(sim, f)
    korogashiBurst(sim, f, 1)
    killFoe(sim, f, undefined, false, 'explode')
    return
  }
  if (!t) {
    stop(sim, f)
    return
  }
  if (edgeDist(f, t) <= ex.range - f.r) {
    startWindup(sim, f, ex, [f.p[0], f.p[1], f.p[2]])
    return
  }
  toMove(f)
  chase(sim, f, t, f.def.speed)
}

export function tategami(sim: Sim, f: Foe) {
  const dome = attackDef(f, 'shieldDome')!
  if (f.mem.dome !== 1) {
    if (f.state !== 'windup') {
      startWindup(sim, f, dome, null)
      return
    }
    stop(sim, f)
    if (!windupDone(f)) return
    launchAttack(sim, f)
    f.mem.dome = 1
    setState(f, 'move')
    f.attack = null
    return
  }
  const t = pickTarget(sim, f)
  if (!t) {
    stop(sim, f)
    return
  }
  toMove(f)
  // Stay with the nearest machine group, ~8–12 m from the target.
  const d = hDist(f.p, t.pos)
  if (d > 12) chase(sim, f, t, f.def.speed)
  else if (d < 8) kite(sim, f, t.pos, f.def.speed * 0.6, 0)
  else stop(sim, f)
  faceTo(f, t.pos, 3)
}
