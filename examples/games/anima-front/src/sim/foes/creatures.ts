/** 蝕獣 behaviours (DESIGN §11): ツブテ, ハリガネ, オオアゴ, カゲロウ. */
import { GRAVITY } from '../../data/species'
import { BRUTE_KNOCK, DT } from '../constants'
import { ballistic, spawnShot } from '../projectiles'
import { FOE_SIDE, type Foe, type Sim } from '../state'
import type { Vec } from '../vec'
import {
  attackDef,
  chase,
  edgeDist,
  eye,
  faceTo,
  flyTo,
  hDist,
  hitPlayersNear,
  hitSet,
  isReady,
  kite,
  launchAttack,
  lobGravity,
  pickTarget,
  recover,
  recovering,
  setState,
  startWindup,
  stop,
  strike,
  windupDone
} from './common'

const center = (f: Foe): Vec => [f.p[0], f.p[1] + f.h * 0.5, f.p[2]]

function toMove(f: Foe) {
  if (f.state !== 'move') setState(f, 'move')
}

export function tsubute(sim: Sim, f: Foe) {
  const bite = attackDef(f, 'bite')!
  const leap = attackDef(f, 'leap')!
  const t = pickTarget(sim, f)
  if (f.state === 'attack') {
    // Airborne leap: contact damage once.
    hitPlayersNear(sim, f, center(f), f.r + 0.35, leap.damage, 'leap', hitSet(f))
    f.v[1] -= GRAVITY * DT
    sim.phys.move(f, DT, FOE_SIDE)
    if ((f.grounded && f.st > 0.1) || f.st > 1.5) recover(f)
    return
  }
  if (recovering(f, 0.3)) {
    stop(sim, f)
    return
  }
  if (f.state === 'windup') {
    stop(sim, f)
    if (t) faceTo(f, t.pos, 12)
    if (!windupDone(f)) return
    const atk = f.attack!
    launchAttack(sim, f)
    if (atk.id === 'bite') {
      strike(sim, f, t, atk.range + 0.4, atk.damage, 'bite')
      recover(f)
    } else {
      const aim = f.aim ?? f.p
      const d = hDist(f.p, aim)
      f.v = ballistic(f.p, aim, Math.max(8, Math.sqrt(GRAVITY * Math.max(1, d) * 1.15)), GRAVITY, false)
      f.grounded = false
      hitSet(f, true)
    }
    return
  }
  if (!t) {
    stop(sim, f)
    return
  }
  const d = edgeDist(f, t)
  if (d <= bite.range && isReady(sim, f, 'bite')) {
    startWindup(sim, f, bite, t.pos)
    return
  }
  if (
    t.player &&
    d >= 2 &&
    d <= leap.range &&
    f.grounded &&
    isReady(sim, f, 'leap') &&
    sim.phys.clear(eye(f), t.center, FOE_SIDE)
  ) {
    startWindup(sim, f, leap, t.pos)
    return
  }
  toMove(f)
  if (d < 0.25) stop(sim, f)
  else chase(sim, f, t, f.def.speed)
}

export function harigane(sim: Sim, f: Foe) {
  const acid = attackDef(f, 'acid')!
  const t = pickTarget(sim, f)
  if (recovering(f, 0.45)) {
    stop(sim, f)
    return
  }
  if (f.state === 'windup') {
    stop(sim, f)
    if (t) faceTo(f, t.pos, 6)
    if (!windupDone(f)) return
    launchAttack(sim, f)
    const from: Vec = [f.p[0], f.p[1] + f.h * 0.9, f.p[2]]
    const aim = f.aim ?? (t ? t.pos : f.p)
    const speed = acid.speed ?? 20
    const g = lobGravity(speed, hDist(from, aim))
    const dmg = acid.damage * f.dmgMul
    spawnShot(sim, {
      kind: 'acid',
      foeAttack: 'acid',
      side: FOE_SIDE,
      owner: f.id,
      p: from,
      v: ballistic(from, aim, speed, g, false),
      dmg,
      gravity: g,
      life: 6,
      r: 0.25,
      blast: { radius: acid.radius ?? 2, damage: dmg },
      puddle: true
    })
    recover(f)
    return
  }
  if (!t) {
    stop(sim, f)
    return
  }
  const d = hDist(f.p, t.pos)
  if (d <= acid.range && isReady(sim, f, 'acid') && sim.phys.clear(eye(f), t.center, FOE_SIDE)) {
    startWindup(sim, f, acid, [t.pos[0], t.pos[1], t.pos[2]])
    return
  }
  toMove(f)
  if (f.mem.side === undefined) f.mem.side = sim.rng.chance(0.5) ? 1 : -1
  if (d > 22 || !sim.phys.clear(eye(f), t.center, FOE_SIDE)) chase(sim, f, t, f.def.speed)
  else if (d < 12) kite(sim, f, t.pos, f.def.speed, f.mem.side * 0.4)
  else {
    if (f.st > 2.5) {
      f.mem.side = -f.mem.side
      f.st = 0
    }
    kite(sim, f, t.pos, f.def.speed * 0.4, f.mem.side * 4)
    faceTo(f, t.pos, 4)
  }
}

export function oagos(sim: Sim, f: Foe) {
  const charge = attackDef(f, 'charge')!
  const bite = attackDef(f, 'bite')!
  const t = pickTarget(sim, f)
  if (f.state === 'attack' && f.attack?.id === 'charge') {
    const sp = f.def.speed * 3
    const before: Vec = [f.p[0], f.p[1], f.p[2]]
    // Steer the rush straight along the committed direction.
    f.v[0] = f.memV[0] * sp
    f.v[2] = f.memV[2] * sp
    f.v[1] -= GRAVITY * DT
    sim.phys.move(f, DT, FOE_SIDE)
    hitPlayersNear(sim, f, center(f), f.r + 0.6, charge.damage, 'charge', hitSet(f), BRUTE_KNOCK)
    const moved = hDist(before, f.p)
    if (f.st > 1.2 || (f.st > 0.15 && moved < sp * DT * 0.3)) {
      f.v[0] = f.v[2] = 0
      recover(f)
    }
    return
  }
  if (recovering(f, f.attack?.id === 'charge' ? 0.9 : 0.5)) {
    stop(sim, f)
    return
  }
  if (f.state === 'windup') {
    stop(sim, f)
    if (f.aim) faceTo(f, f.aim, f.attack?.id === 'charge' ? 3 : 6)
    if (!windupDone(f)) return
    const atk = f.attack!
    launchAttack(sim, f)
    if (atk.id === 'bite') {
      strike(sim, f, t, atk.range + 0.5, atk.damage, 'bite')
      recover(f)
    } else {
      const aim = f.aim ?? f.p
      let dx = aim[0] - f.p[0]
      let dz = aim[2] - f.p[2]
      const l = Math.hypot(dx, dz) || 1
      dx /= l
      dz /= l
      f.memV = [dx, 0, dz]
      f.yaw = Math.atan2(dx, dz)
      hitSet(f, true)
    }
    return
  }
  if (!t) {
    stop(sim, f)
    return
  }
  const d = edgeDist(f, t)
  if (d <= bite.range && isReady(sim, f, 'bite')) {
    startWindup(sim, f, bite, t.pos)
    return
  }
  if (
    t.player &&
    d >= 5 &&
    d <= charge.range &&
    isReady(sim, f, 'charge') &&
    sim.phys.clear(eye(f), t.center, FOE_SIDE)
  ) {
    startWindup(sim, f, charge, [t.pos[0], t.pos[1], t.pos[2]])
    return
  }
  toMove(f)
  if (d < 0.3) stop(sim, f)
  else {
    chase(sim, f, t, f.def.speed)
    faceTo(f, t.pos, 2.5)
  }
}

function initFlyer(sim: Sim, f: Foe) {
  if (f.mem.alt !== undefined) return
  const hv = f.def.hover ?? [4, 6]
  f.mem.alt = sim.rng.range(hv[0], hv[1])
  f.mem.phase = sim.rng.next() * Math.PI * 2
  f.mem.freq = sim.rng.range(1.1, 2.2)
  f.mem.side = sim.rng.chance(0.5) ? 1 : -1
}

export function kagerou(sim: Sim, f: Foe) {
  initFlyer(sim, f)
  const dive = attackDef(f, 'dive')!
  const t = pickTarget(sim, f)
  if (f.state === 'attack') {
    const aim = f.aim ?? f.p
    const dx = aim[0] - f.p[0]
    const dy = aim[1] - f.p[1]
    const dz = aim[2] - f.p[2]
    const l = Math.hypot(dx, dy, dz)
    const sp = 20
    if (l > 1e-6) {
      const k = Math.min(1, (sp * DT) / l)
      f.v = [(dx / l) * sp, (dy / l) * sp, (dz / l) * sp]
      f.p[0] += dx * k
      f.p[1] += dy * k
      f.p[2] += dz * k
    }
    hitPlayersNear(sim, f, f.p, 1.3, dive.damage, 'dive', hitSet(f))
    const floor = sim.phys.groundHeight(f.p[0], f.p[2], f.r, f.p[1] + 0.5)
    if (l < 0.8 || f.st > 1.2 || f.p[1] <= floor + 0.3) recover(f)
    return
  }
  if (f.state === 'recover') {
    flyTo(sim, f, [f.p[0], (t ? t.pos[1] : 0) + f.mem.alt, f.p[2]], f.def.speed * 0.6)
    recovering(f, 0.8)
    return
  }
  if (f.state === 'windup') {
    flyTo(sim, f, f.p, 0)
    if (f.aim) faceTo(f, f.aim, 10)
    if (!windupDone(f)) return
    launchAttack(sim, f)
    hitSet(f, true)
    return
  }
  if (!t) {
    flyTo(sim, f, [f.p[0], f.mem.alt, f.p[2]], f.def.speed * 0.5)
    return
  }
  const d = hDist(f.p, t.pos)
  if (t.player && d <= dive.range && isReady(sim, f, 'dive') && sim.phys.clear(f.p, t.center, FOE_SIDE)) {
    startWindup(sim, f, dive, [t.pos[0], t.pos[1] + 0.5, t.pos[2]])
    return
  }
  toMove(f)
  // Erratic weaving approach to ~8 m.
  let dx = t.pos[0] - f.p[0]
  let dz = t.pos[2] - f.p[2]
  const l = Math.hypot(dx, dz) || 1
  dx /= l
  dz /= l
  const w = Math.sin(sim.time * f.mem.freq + f.mem.phase) * 5
  const reach = Math.max(0, l - 8)
  const goal: Vec = [f.p[0] + dx * reach - dz * w, t.pos[1] + f.mem.alt, f.p[2] + dz * reach + dx * w]
  flyTo(sim, f, goal, f.def.speed)
  faceTo(f, t.pos, 6)
}
